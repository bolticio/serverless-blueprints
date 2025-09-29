import 'dotenv/config';
import { createClient, isErrorResponse } from '@boltic/sdk';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ENV_VARS = ['BOLTIC_API_KEY'];
const DEFAULT_ENVIRONMENT = 'sit';
const DEFAULT_TABLE = 'contact_us';
const MAX_BODY_SIZE_BYTES = 64 * 1024;
const MAX_PAGE_SIZE = 100;
const MAX_MESSAGE_LENGTH = 1500;
const MAX_NAME_LENGTH = 120;
const PHONE_MAX_LENGTH = 40;

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

const RAW_ENVIRONMENT = process.env.BOLTIC_ENVIRONMENT || process.env.ENVIRONMENT || DEFAULT_ENVIRONMENT;
const ENVIRONMENT = RAW_ENVIRONMENT.toLowerCase();
const CONTACT_TABLE = process.env.BOLTIC_CONTACT_TABLE || DEFAULT_TABLE;
const BOLTIC_DEBUG = process.env.BOLTIC_DEBUG === 'true';
const BOLTIC_TIMEOUT_MS = Number(process.env.BOLTIC_TIMEOUT_MS || 10000);

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

let bolticClient;
try {
  bolticClient = createClient(process.env.BOLTIC_API_KEY, {
    environment: ENVIRONMENT,
    retryAttempts: 3,
    debug: BOLTIC_DEBUG,
  });
} catch (error) {
  throw new Error(`Failed to initialize Boltic client: ${error.message}`);
}

const parseJSON = (req) => new Promise((resolve, reject) => {
  let payload = '';
  let received = 0;

  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_BODY_SIZE_BYTES) {
      reject(new Error('Request body too large'));
      return;
    }
    payload += chunk.toString();
  });

  req.on('end', () => {
    if (!payload) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(payload));
    } catch (error) {
      reject(new Error('Invalid JSON payload'));
    }
  });

  req.on('error', reject);
});

const sendJson = (res, statusCode, body) => {
  if (res.headersSent) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(body));
};

const sendSuccess = (res, statusCode, body = {}) => {
  sendJson(res, statusCode, {
    success: true,
    ...body,
  });
};

const sendError = (res, statusCode, code, message, details) => {
  sendJson(res, statusCode, {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[+\d().\-\s]*$/;

const validateContactPayload = ({ name, email, message, phone }) => {
  if (!name) {
    return 'Name is required.';
  }
  if (name.length > MAX_NAME_LENGTH) {
    return 'Name is too long.';
  }
  if (!email || !emailRegex.test(email)) {
    return 'A valid email address is required.';
  }
  if (!message) {
    return 'Message cannot be empty.';
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`;
  }
  if (phone) {
    if (!phoneRegex.test(phone)) {
      return 'Phone number has invalid characters.';
    }
    if (phone.length > PHONE_MAX_LENGTH) {
      return 'Phone number is too long.';
    }
  }
  return null;
};

const router = {
  routes: [],

  add(method, path, handler) {
    if (path === '*') {
      this.routes.push({ method, path, pathRegex: null, paramNames: [], handler });
      return;
    }

    const paramNames = [];
    const pathRegex = path
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          paramNames.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[-/\^$*+?.()|[\]{}]/g, '\$&');
      })
      .join('/');

    this.routes.push({
      method,
      path,
      pathRegex: new RegExp(`^${pathRegex}$`),
      paramNames,
      handler,
    });
  },

  match(method, urlPath) {
    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }
      if (route.path === '*') {
        return { handler: route.handler, params: {} };
      }
      const match = route.pathRegex?.exec(urlPath);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  },
};

const getStaticContentType = (filename) => {
  switch (extname(filename).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
};

const serveStaticFile = async (res, relativePath) => {
  try {
    const absolutePath = join(MODULE_DIR, relativePath);
    const fileBuffer = await readFile(absolutePath);

    if (res.headersSent) {
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', getStaticContentType(relativePath));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(fileBuffer);
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (!res.headersSent) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end('Not Found');
      }
      return;
    }

    console.error('Failed to serve static asset:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end('Failed to serve requested file.');
    }
  }
};

const staticAssetHandler = (assetPath) => async (req, res) => {
  await serveStaticFile(res, assetPath);
};

const withTimeout = async (promise, description) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${description} timed out after ${BOLTIC_TIMEOUT_MS}ms`));
        }, BOLTIC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const requiredColumns = [
  {
    name: 'name',
    type: 'text',
    is_nullable: false,
    description: 'Sender name',
    field_order: 1,
  },
  {
    name: 'email',
    type: 'text',
    is_nullable: false,
    is_indexed: true,
    description: 'Sender email',
    field_order: 2,
  },
  {
    name: 'message',
    type: 'long-text',
    is_nullable: false,
    description: 'Message body',
    field_order: 3,
  },
  {
    name: 'phone',
    type: 'text',
    is_nullable: true,
    description: 'Optional phone number',
    field_order: 4,
  },
  {
    name: 'source',
    type: 'text',
    is_nullable: false,
    description: 'Submission source channel',
    field_order: 5,
  },
  {
    name: 'submittedAt',
    type: 'date-time',
    is_nullable: false,
    description: 'Submission timestamp',
    field_order: 6,
  },
];

let setupPromise = null;

const formatBolticError = (prefix, error) => {
  if (error && typeof error === 'object') {
    if (error.response && typeof error.response === 'object') {
      const message = error.response.message || error.response.error;
      if (message) {
        return `${prefix}: ${message}`;
      }
    }
    if (error.message) {
      return `${prefix}: ${error.message}`;
    }
  }
  if (typeof error === 'string') {
    return `${prefix}: ${error}`;
  }
  return prefix;
};

const ensureBolticSetup = async () => {
  if (setupPromise) {
    return setupPromise;
  }

  setupPromise = (async () => findOrCreateTable())().catch((error) => {
    setupPromise = null;
    throw error;
  });

  return setupPromise;
};

const findOrCreateTable = async () => {
  let lookup;
  try {
    lookup = await withTimeout(
      bolticClient.tables.findByName(CONTACT_TABLE),
      'Boltic table lookup'
    );
  } catch (error) {
    throw new Error(formatBolticError('Failed to query contact table', error));
  }

  if (!isErrorResponse(lookup) && lookup.data) {
    return lookup.data;
  }

  const tableDefinition = {
    name: CONTACT_TABLE,
    description: 'Contact form submissions stored from the serverless blueprint sample',
    fields: requiredColumns,
  };

  let creationResult;
  try {
    creationResult = await withTimeout(
      bolticClient.tables.create(tableDefinition),
      'Boltic table creation'
    );
  } catch (error) {
    throw new Error(formatBolticError(`Failed to create Boltic table '${CONTACT_TABLE}'`, error));
  }

  if (isErrorResponse(creationResult)) {
    const message = creationResult.error?.message || 'Failed to create contact submissions table';
    throw new Error(message);
  }

  let verify;
  try {
    verify = await withTimeout(
      bolticClient.tables.findByName(CONTACT_TABLE),
      'Boltic table verification'
    );
  } catch (error) {
    throw new Error(formatBolticError('Unable to verify Boltic contact table creation', error));
  }

  if (isErrorResponse(verify) || !verify.data) {
    throw new Error('Unable to verify Boltic contact table creation');
  }

  console.log(`Created Boltic table '${CONTACT_TABLE}' (id: ${verify.data.id}).`);
  return verify.data;
};

const handleOptions = async (req, res) => {
  sendSuccess(res, 200, { message: 'OK' });
};

const handleSetup = async (req, res, params, client) => {
  try {
    const tableInfo = await ensureBolticSetup();

    sendSuccess(res, 200, {
      message: 'Boltic setup complete. Ready to accept submissions.',
      data: tableInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to setup contact table';
    const isNotSupported = typeof message === 'string' && (message.includes('not supported') || error?.status === 501);

    if (isNotSupported) {
      sendError(
        res,
        501,
        'TABLE_CREATION_NOT_SUPPORTED',
        'SDK-based table creation is not supported. Please create the table manually with columns: name (text), email (text), message (long-text), phone (text, optional), source (text), submittedAt (date-time).'
      );
      return;
    }

    sendError(res, 500, 'SETUP_ERROR', 'Failed to setup contact table', message);
  }
};

const handleCreateContact = async (req, res, params, client) => {
  try {
    const body = await parseJSON(req);
    const payload = {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      message: typeof body.message === 'string' ? body.message.trim() : '',
    };

    const validationError = validateContactPayload(payload);
    if (validationError) {
      sendError(res, 400, 'INVALID_INPUT', validationError);
      return;
    }

    await ensureBolticSetup();

    const submittedAt = new Date().toISOString();
    const source = typeof body.source === 'string' && body.source.trim().length > 0
      ? body.source.trim()
      : 'web';

    let result;
    try {
      result = await withTimeout(
        client.records.insert(CONTACT_TABLE, {
          name: payload.name,
          email: payload.email,
          phone: payload.phone || null,
          message: payload.message,
          source,
          submittedAt,
        }),
        'Boltic record insert'
      );
    } catch (error) {
      throw new Error(formatBolticError('Failed to save contact submission', error));
    }

    if (isErrorResponse(result) || result?.error) {
      const errorMessage = result?.error?.message || 'Failed to save your message. Please try again later.';
      console.error('Boltic insert error:', result?.error || result);
      sendError(res, 502, 'CREATE_ERROR', errorMessage);
      return;
    }

    sendSuccess(res, 201, {
      message: 'Thanks for reaching out! We will get back to you soon.',
      data: {
        id: result?.data?.id,
        submittedAt,
      },
    });
  } catch (error) {
    if (error.message === 'Invalid JSON payload') {
      sendError(res, 400, 'INVALID_JSON', error.message);
      return;
    }
    if (error.message === 'Request body too large') {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', error.message);
      return;
    }
    const fallback = 'Unexpected server error. Please try again later.';
    const message = error instanceof Error ? error.message : fallback;
    const shouldSignalUnavailable = typeof message === 'string' && (message.includes('Boltic') || message.includes('contact table'));
    const status = shouldSignalUnavailable ? 503 : 500;
    sendError(res, status, shouldSignalUnavailable ? 'SERVICE_UNAVAILABLE' : 'CREATE_ERROR', message);
  }
};

const handleListContacts = async (req, res, params, client, url) => {
  try {
    const limitParam = parseInt(url.searchParams.get('limit'), 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_SIZE)
      : 20;

    const offsetParam = parseInt(url.searchParams.get('offset'), 10);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const pageNo = Math.floor(offset / limit) + 1;

    await ensureBolticSetup();

    const response = await withTimeout(
      client.records.findAll(CONTACT_TABLE, {
        page: {
          page_no: pageNo,
          page_size: limit,
        },
      }),
      'Boltic contact list fetch'
    );

    if (isErrorResponse(response)) {
      throw new Error(response.error?.message || 'Failed to fetch contacts');
    }

    const records = response.data || [];
    const pagination = response.pagination || {};

    sendSuccess(res, 200, {
      data: records,
      pagination: {
        limit,
        offset,
        total: pagination.total_count || 0,
      },
    });
  } catch (error) {
    sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch contacts', error.message);
  }
};

const handleGetContact = async (req, res, params, client) => {
  try {
    await ensureBolticSetup();

    const response = await withTimeout(
      client.records.findOne(CONTACT_TABLE, params.id),
      'Boltic contact lookup'
    );
    if (isErrorResponse(response)) {
      if (response.error?.code?.includes('not_found') || response.error?.message?.includes('not found')) {
        sendError(res, 404, 'CONTACT_NOT_FOUND', `Contact with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error?.message || 'Failed to fetch contact');
    }

    if (!response.data) {
      sendError(res, 404, 'CONTACT_NOT_FOUND', `Contact with id ${params.id} not found`);
      return;
    }

    sendSuccess(res, 200, { data: response.data });
  } catch (error) {
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'CONTACT_NOT_FOUND', `Contact with id ${params.id} not found`);
      return;
    }
    sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch contact', error.message);
  }
};

const handleNotFound = async (req, res) => {
  const acceptsHtml = typeof req.headers.accept === 'string' && req.headers.accept.includes('text/html');

  if (req.method === 'GET' && acceptsHtml) {
    await serveStaticFile(res, 'index.html');
    if (res.writableEnded) {
      return;
    }
  }

  sendError(res, 404, 'NOT_FOUND', 'The requested resource was not found');
};

router.add('OPTIONS', '*', handleOptions);
router.add('GET', '/', staticAssetHandler('index.html'));
router.add('GET', '/index.html', staticAssetHandler('index.html'));
router.add('GET', '/app.js', staticAssetHandler('app.js'));
router.add('GET', '/style.css', staticAssetHandler('style.css'));
router.add('GET', '/styles.css', staticAssetHandler('style.css'));
router.add('POST', '/api/contact', handleCreateContact);
router.add('POST', '/contact', handleCreateContact);
router.add('POST', '/', handleCreateContact);
router.add('GET', '/api/contact', handleListContacts);
router.add('GET', '/api/contact/:id', handleGetContact);
router.add('POST', '/setup', handleSetup);
router.add('GET', '/health', async (req, res) => {
  sendSuccess(res, 200, { message: 'ok' });
});

export const handler = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const match = router.match(req.method, url.pathname) || router.match(req.method, '*');

  if (!match) {
    await handleNotFound(req, res);
    return;
  }

  try {
    await match.handler(req, res, match.params, bolticClient, url);
  } catch (error) {
    console.error('Unhandled handler error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error', error.message);
  }
};

const startLocalServer = async () => {
  const http = await import('node:http');
  const port = Number(process.env.PORT || 3000);

  try {
    await ensureBolticSetup();
    console.log('Boltic setup complete. Ready to accept submissions.');
  } catch (error) {
    console.warn(formatBolticError('Boltic setup could not be completed during startup', error));
  }

  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      console.error('Unhandled handler error', error);
      sendError(res, 500, 'INTERNAL_ERROR', 'Unhandled exception', error.message);
    });
  });

  server.listen(port, () => {
    console.log(`Contact Us handler listening on http://localhost:${port}`);
  });
};

// if (process.env.LOCAL_TEST) {
//   startLocalServer().catch((error) => {
//     console.error('Failed to start local server', error);
//   });
// }

startLocalServer().catch((error) => {
    console.error('Failed to start local server', error);
});