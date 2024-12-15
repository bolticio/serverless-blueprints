import Redis from 'ioredis';
import { createTunnel } from 'tunnel-ssh';

// Maximum allowed connections in the connection pool
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '10');
// Connection pool to manage Redis connections
const connectionPool = new Map();
// Timeout for Redis connections, configurable via environment variables
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT || '10000');

/**
 * Validates the request body for required fields and structure.
 * Ensures all necessary fields for Redis and SSH configurations are provided.
 * @param {Object} body - Request body containing Redis commands and secretData.
 * @throws {Error} If validation fails.
 */
const validateRequestBody = ({ command, secretData }) => {
  const errors = [];

  // Ensure the Redis command is provided
  if (!command) {
    errors.push('Redis command is required.');
  }

  // Validate Redis configuration
  const { db_config, ssh_config, use_ssh } = secretData || {};
  if (!db_config) {
    errors.push('secretData.db_config is required.');
  }

  const { host, port, password } = db_config || {};
  if (!host) errors.push('db_config.host is required.');
  if (!port) errors.push('db_config.port is required.');
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
    throw new Error(`Validation errors: ${errors.join(' ')}`);
  }
};

/**
 * Creates a Redis connection with optional SSH tunneling.
 * @param {Object} config - Configuration for Redis.
 * @param {number} [localPort=null] - Local port for SSH tunneling.
 * @returns {Promise<Redis>} The Redis client instance.
 */
const createRedisConnection = async (config, localPort = null) => {
  const { use_ssh } = config.secretData;
  const { host, port, password } = config.secretData.db_config;

  const connectionHost = use_ssh ? '127.0.0.1' : host;
  const connectionPort = use_ssh ? localPort : port;

  const client = new Redis({
    host: connectionHost,
    port: connectionPort,
    password,
    connectTimeout: CONNECTION_TIMEOUT,
  });

  console.log(`Connecting to Redis at ${connectionHost}:${connectionPort}`);

  return new Promise((resolve, reject) => {
    client.on('connect', () => {
      console.log('Redis connection successful.');
      resolve(client);
    });

    client.on('error', (error) => {
      console.error(`Redis connection failed: ${error.message}`);
      reject(error);
    });
  });
};

/**
 * Establishes an SSH tunnel for secure Redis connections.
 * Provides port forwarding from a local port to the remote Redis server.
 * @param {Object} sshConfig - SSH configuration.
 * @param {string} redisHost - Redis host.
 * @param {number} redisPort - Redis port.
 * @returns {Promise<Object>} The SSH tunnel and local port.
 */
const createSSHTunnel = async (sshConfig, redisHost, redisPort) => {
  try {
    const { host, port, username, private_key_file, auth_method } = sshConfig;
    const tunnelOptions = { autoClose: true };
    const forwardOptions = { dstAddr: redisHost, dstPort: redisPort };
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
 * @returns {Promise<Redis>} The Redis client instance.
 */
const getOrCreateConnection = async (config) => {
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
        const { host: redisHost, port: redisPort } = db_config;
        const { tunnel, localPort } = await createSSHTunnel(ssh_config, redisHost, redisPort);
        const redisConnection = await createRedisConnection(config, localPort);
        redisConnection._tunnel = tunnel; // Store tunnel instance for cleanup
        return redisConnection;
      })()
      : await createRedisConnection(config);

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
 * Processes Redis commands based on provided configurations.
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

    const { command, args, secretData } = body;
    const client = await getOrCreateConnection({ secretData });

    // Execute the provided Redis command
    const result = await client.call(command, ...(args || []));

    console.log('Command executed successfully:', JSON.stringify(result));
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ result });
  } catch (error) {
    console.error('Error handling request:', error.message);
    res.status(500).json({ error: error.message });
  }
};
