import { MongoClient, ObjectId } from 'mongodb';
import { createTunnel } from 'tunnel-ssh';

// Maximum allowed connections in the connection pool
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 10;
// Connection pool to manage database connections
const connectionPool = new Map();
// Timeout for connections, configurable via environment variables
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT) || 10000;
// Maximum limit for query results to prevent large responses
const MAX_QUERY_LIMIT = parseInt(process.env.MAX_QUERY_LIMIT) || 1000;

/**
 * Validates the request body for required fields and structure.
 * Ensures all necessary fields for MongoDB and SSH configurations are provided.
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

  const { hosts, auth_db, database, username, password } = db_config || {};
  if (!hosts || hosts.length === 0) errors.push('db_config.hosts is required.');
  if (!auth_db) errors.push('db_config.auth_db is required.');
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
 * Creates a MongoDB connection with a timeout for connection attempts.
 * Handles connection strings for both direct and SRV-based connections.
 * @param {Object} config - Configuration for MongoDB.
 * @param {number} [localPort=null] - Local port for SSH tunneling.
 * @returns {Promise<Object>} The MongoDB database instance.
 */
const createMongoConnection = async (config, localPort = null) => {
  const { use_ssh } = config.secretData;
  const { username, password, auth_db, database, hosts, read_preference = 'secondaryPreferred', is_srv } = config.secretData.db_config;

  const host = use_ssh ? '127.0.0.1' : hosts[0]?.host;
  const port = use_ssh ? localPort : hosts[0]?.port || 27017;
  const connectionString = is_srv
    ? `mongodb+srv://${username}:${encodeURIComponent(password)}@${host}/${auth_db}?directConnection=true&readPreference=${read_preference}`
    : `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port}/${auth_db}?directConnection=true&readPreference=${read_preference}`;

  console.log(`Connecting to MongoDB URI: ${connectionString.replace(username, "<REDACTED>").replace(encodeURIComponent(password), "<REDACTED>")}`);

  // MongoDB client instance
  const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: CONNECTION_TIMEOUT });

  try {
    // Attempt to connect to MongoDB within the defined timeout
    await client.connect();
    console.log('MongoDB connection successful.');
    return client.db(database);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
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
 * @param {string} query - MongoDB query to execute.
 * @returns {Promise<Object>} The MongoDB database instance.
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
        const mongoConnection = await createMongoConnection(config, localPort);
        mongoConnection._tunnel = tunnel; // Store tunnel instance for cleanup
        return mongoConnection;
      })()
      : await createMongoConnection(config);

    // Cache the newly created connection
    connectionPool.set(configKey, connection);
    return connection;
  } catch (error) {
    console.error('Error creating connection:', error.message);
    throw error;
  }
};

/**
 * Executes a MongoDB query on the provided connection.
 * Transforms the query string to use the MongoDB collection method if necessary.
 * Handles different types of MongoDB operations and returns the result.
 *
 * @param {string} query - The MongoDB query string to execute.
 * @param {Object} connection - The MongoDB connection object.
 * @param {number} [limit=100] - The maximum number of documents to return for queries that return a cursor.
 * @returns {Promise<Array|Object>} The result of the query execution. For queries that return a cursor, returns an array of documents. For other operations, returns the result object.
 * @throws {Error} If the query is invalid or if an error occurs during query execution.
 */
const runQuery = async (query, connection, limit = 100) => {
  if (query && typeof query === 'string') {
    if (query.startsWith('db.') && !query.includes('collection')) {
      // Extract collection name and method name
      const parts = query.split('.').slice(1); // Extract parts after 'db.'

      if (parts.length >= 2) {
        const collectionPart = parts[0]; // The collection name
        const methodWithParams = parts.slice(1).join('.'); // The rest, which includes method and params

        // Transform query to `db.collection('collectionPart').methodWithParams`
        query = `db.collection('${collectionPart}').${methodWithParams}`;
      }
    }

    console.log('Executing query:', JSON.stringify(query));
    try {
      const executeCommand = new Function('db', 'ObjectId', `return ${query.replace(/ObjectId\(/g, 'new ObjectId(')}`);
      // Pass `ObjectId` from the `mongodb` library to the function
      const result = await executeCommand(connection, ObjectId);
      // Handle result based on query type
      if (result && typeof result.toArray === 'function') {
        // For queries that return a cursor (e.g., find)
        console.log(`Limiting to only ${limit} results`)
        return result.toArray().then((data) => data.slice(0, limit));
      } else {
        // For other operations (e.g., countDocuments, aggregate, insert, update)
        return result || [];
      }
    } catch (error) {
      console.error('Error executing query:', error.message);
      throw error;
    }
  } else {
    throw new Error("Invalid query", query);
  }
};

/**
 * Express.js handler for incoming requests.
 * Processes MongoDB queries based on provided configurations and query string.
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
    const db = await getOrCreateConnection({ secretData }, query);

    // Execute the provided query in the MongoDB instance
    const result = await runQuery(query, db, MAX_QUERY_LIMIT);

    console.log('Query executed successfully:', JSON.stringify(result));
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
  } catch (error) {
    console.error('Error handling request:', error.message);
    res.status(500).json({ error: error.message });
  }
};
