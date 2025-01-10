import sql from 'mssql';
import { createTunnel } from 'tunnel-ssh';

// Maximum allowed connections in the connection pool
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '10');
// Connection pool to manage database connections
const connectionPool = new Map();
// Timeout for MSSQL connections, configurable via environment variables
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT || '10000');

/**
 * Validates the request body for required fields and structure.
 * Ensures all necessary fields for MSSQL and SSH configurations are provided.
 * @param {Object} body - Request body containing query and secretData.
 * @throws {Error} If validation fails.
 */
const validateRequestBody = ({ query, secretData }) => {
  const errors = [];

  // Ensure the query string is provided
  if (!query) {
    errors.push('Query is required.');
  }

  // Validate database configuration
  const { db_config, ssh_config, use_ssh } = secretData || {};
  if (!db_config) {
    errors.push('secretData.db_config is required.');
  }

  const { hosts, database, username, password } = db_config || {};
  if (!hosts || hosts.length === 0) errors.push('db_config.hosts is required.');
  if (!database) errors.push('db_config.database is required.');
  if (!username) errors.push('db_config.username is required.');
  if (!password) errors.push('db_config.password is required.');

  // Validate SSH configuration if required
  if (use_ssh) {
    if (!ssh_config) {
      errors.push('secretData.ssh_config is required when use_ssh is true.');
    } else {
      const { host, port, username, private_key_file, auth_method } = ssh_config || {};
      if (!host) errors.push('ssh_config.host is required.');
      if (!port) errors.push('ssh_config.port is required.');
      if (!username) errors.push('ssh_config.username is required.');
      if (auth_method === 'private_key' && !private_key_file) {
        errors.push('ssh_config.private_key_file is required for private_key auth.');
      }
    }
  }

  // Throw error if any validation fails
  if (errors.length) {
    var msg = `Validation errors: ${errors.join(' ')}`
    console.log(msg)
    throw new Error(msg);
  }
};

/**
 * Creates a MSSQL connection with a timeout for connection attempts.
 * @param {Object} config - Configuration for MSSQL.
 * @param {number} [localPort=null] - Local port for SSH tunneling.
 * @returns {Promise<Client>} The MSSQL client instance.
 */
const createMSSQLConnection = async (config, localPort = null) => {
  const { use_ssh } = config.secretData;
  const { username, password, hosts, database } = config.secretData.db_config;

  const connectionHost = use_ssh ? '127.0.0.1' : hosts[0]?.host;
  const connectionPort = use_ssh ? localPort : hosts[0]?.port || 5432;

  console.log(`Connecting to MSSQL URI: mssql://<REDACTED>:<REDACTED>@${connectionHost}:${connectionPort}/${database}`);

  try {
    // Attempt to connect to MSSQL within the defined timeout
    const client = await sql.connect({
      user: username,
      password: password,
      server: connectionHost,
      port: connectionPort,
      database: database,
      connectionTimeout: CONNECTION_TIMEOUT,
      options: {
        encrypt: true,
        trustServerCertificate: true
      }
    });

    console.log('MSSQL connection successful');
    return client;
  } catch (error) {
    console.error(`MSSQL connection failed: ${error.message}`);
    throw error;
  }
};

/**
 * Establishes an SSH tunnel for secure database connections.
 * Provides port forwarding from a local port to the remote database server.
 * @param {Object} sshConfig - SSH configuration.
 * @param {string} dbHost - Database host.
 * @param {number} dbPort - Database port.
 * @returns {Promise<Object>} The SSH tunnel and local port.
 */
const createSSHTunnel = async (sshConfig, dbHost, dbPort) => {
  try {
    const { host, port, username, private_key_file, auth_method } = sshConfig;
    const tunnelOptions = { autoClose: true };
    const forwardOptions = { dstAddr: dbHost, dstPort: dbPort };
    const sshOptions = {
      host,
      port,
      username,
      privateKey: auth_method === 'private_key' ? Buffer.from(private_key_file, 'utf-8') : undefined,
    };

    const [server, conn] = await createTunnel(tunnelOptions, null, sshOptions, forwardOptions);
    const localPort = server.address().port;
    console.log(`SSH tunnel established. Local port: ${localPort}`);

    // Attach error listeners to the SSH server and connection
    server.on('error', (err) => {
      throw new Error(`SSH Tunnel Server Error: ${err.message}`);
    });
    conn.on('error', (err) => {
      throw new Error(`SSH Tunnel Connection Error: ${err.message}`);
    });

    return { tunnel: server, localPort };
  } catch (err) {
    console.error(`Failed to establish SSH tunnel: ${err.message}`);
    throw err;
  }
};

/**
 * Retrieves an existing connection or creates a new one if not available.
 * Ensures that the number of active connections does not exceed the allowed limit.
 * @param {Object} config - Configuration for the connection.
 * @param {string} query - MSSQL query to execute.
 * @returns {Promise<Client>} The MSSQL client instance.
 */
const getOrCreateConnection = async (config, query) => {
  const configKey = JSON.stringify(config);

  // Return existing connection if available
  if (connectionPool.has(configKey)) {
    return connectionPool.get(configKey);
  }

  // Check if connection pool has reached its limit
  if (connectionPool.size >= MAX_CONNECTIONS) {
    throw new Error('Connection limit reached.');
  }

  const { use_ssh, db_config, ssh_config } = config.secretData;

  try {
    // Create a new connection, either with or without SSH
    const connection = use_ssh
      ? await (async () => {
        const { host: dbHost, port: dbPort } = db_config.hosts[0];
        const { tunnel, localPort } = await createSSHTunnel(ssh_config, dbHost, dbPort);
        const msSQLConnection = await createMSSQLConnection(config, localPort);
        msSQLConnection._tunnel = tunnel; // Store tunnel instance for cleanup
        return msSQLConnection;
      })()
      : await createMSSQLConnection(config);

    // Cache the newly created connection
    connectionPool.set(configKey, connection);
    return connection;
  } catch (error) {
    console.error('Error creating connection:', error.message);
    throw error;
  }
};

/**
 * Express.js handler for incoming requests.
 * Processes MSSQL queries based on provided configurations and query string.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const handler = async (req, res) => {
  try {
    // Ensure the request method is POST
    if (req.method !== 'POST') {
      return res.status(400).json({ error: 'Invalid method, only POST allowed.' });
    }

    // Extract and validate request body
    const body = req.body;
    validateRequestBody(body);

    const { query, secretData } = body;
    const client = await getOrCreateConnection({ secretData }, query);

    // Execute the provided query in the MSSQL instance
    var data = [];
    const result = await client.request().query(query);

    // Return rows for SELECT queries
    if (result.recordset && result.recordset.length > 0) {
      data = result.recordset;
    } else if (result.rowsAffected && result.rowsAffected.length > 0) { // For write queries (INSERT, UPDATE, DELETE), check affected rows
      data = {
        affectedRows: result.rowsAffected[0] || 0,
        message: result.command || 'Query executed successfully',
      };
    }

    console.log('Query executed successfully:', JSON.stringify(data));
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(data);
  } catch (error) {
    console.error('Error handling request:', error.message);
    res.status(500).json({ error: error.message });
  }
};
