import 'dotenv/config';
import { createClient, isErrorResponse } from '@boltic/sdk';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ENV_VARS = ['BOLTIC_API_KEY'];
const DEFAULT_ENVIRONMENT = 'sit';
const DEFAULT_TABLE = 'products';
const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1MB limit
const MAX_NAME_LENGTH = 160;
const MAX_CATEGORY_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_PRICE = 1_000_000_000;
const MAX_STOCK = 1_000_000;

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

const RAW_ENVIRONMENT = process.env.BOLTIC_ENVIRONMENT || process.env.ENVIRONMENT || DEFAULT_ENVIRONMENT;
const ENVIRONMENT = RAW_ENVIRONMENT.toLowerCase();
const PRODUCTS_TABLE = process.env.BOLTIC_TABLE_NAME || DEFAULT_TABLE;
const BOLTIC_DEBUG = process.env.BOLTIC_DEBUG === 'true';
const BOLTIC_TIMEOUT_MS = Number(process.env.BOLTIC_TIMEOUT_MS || 10_000);

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
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET,POST,PATCH,DELETE');
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
        return segment.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
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

const productFields = [
  {
    name: 'name',
    type: 'text',
    is_nullable: false,
    description: 'Product name',
    field_order: 1,
  },
  {
    name: 'description',
    type: 'long-text',
    is_nullable: true,
    description: 'Product description',
    field_order: 2,
  },
  {
    name: 'price',
    type: 'number',
    is_nullable: false,
    description: 'Product price',
    field_order: 3,
  },
  {
    name: 'category',
    type: 'text',
    is_nullable: true,
    description: 'Product category',
    field_order: 4,
  },
  {
    name: 'stock',
    type: 'number',
    is_nullable: false,
    default_value: 0,
    description: 'Stock quantity available',
    field_order: 5,
  },
  {
    name: 'active',
    type: 'checkbox',
    is_nullable: false,
    default_value: true,
    description: 'Whether the product is active',
    field_order: 6,
  },
  {
    name: 'createdAt',
    type: 'date-time',
    is_nullable: false,
    description: 'Creation timestamp',
    field_order: 7,
  },
  {
    name: 'updatedAt',
    type: 'date-time',
    is_nullable: false,
    description: 'Last update timestamp',
    field_order: 8,
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
      bolticClient.tables.findByName(PRODUCTS_TABLE),
      'Boltic table lookup',
    );
  } catch (error) {
    throw new Error(formatBolticError('Failed to query products table', error));
  }

  if (!isErrorResponse(lookup) && lookup.data) {
    return lookup.data;
  }

  const tableDefinition = {
    name: PRODUCTS_TABLE,
    description: 'Products managed through the Boltic SDK product app sample',
    fields: productFields,
  };

  let creationResult;
  try {
    creationResult = await withTimeout(
      bolticClient.tables.create(tableDefinition),
      'Boltic table creation',
    );
  } catch (error) {
    throw new Error(formatBolticError(`Failed to create Boltic table '${PRODUCTS_TABLE}'`, error));
  }

  if (isErrorResponse(creationResult)) {
    const message = creationResult.error?.message || 'Failed to create products table';
    throw new Error(message);
  }

  let verify;
  try {
    verify = await withTimeout(
      bolticClient.tables.findByName(PRODUCTS_TABLE),
      'Boltic table verification',
    );
  } catch (error) {
    throw new Error(formatBolticError('Unable to verify Boltic products table creation', error));
  }

  if (isErrorResponse(verify) || !verify.data) {
    throw new Error('Unable to verify Boltic products table creation');
  }

  console.log(`Created Boltic table '${PRODUCTS_TABLE}' (id: ${verify.data.id}).`);
  return verify.data;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const parseBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') {
      return true;
    }
    if (lower === 'false') {
      return false;
    }
  }
  return null;
};

const handleOptions = async (req, res) => {
  sendSuccess(res, 200, { message: 'OK' });
};

const handleSetup = async (req, res) => {
  try {
    const tableInfo = await ensureBolticSetup();
    sendSuccess(res, 200, {
      message: 'Boltic setup complete. Ready to manage products.',
      data: tableInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to setup products table';
    const isNotSupported = typeof message === 'string' && (message.includes('not supported') || error?.status === 501);

    if (isNotSupported) {
      sendError(
        res,
        501,
        'TABLE_CREATION_NOT_SUPPORTED',
        'SDK-based table creation is not supported. Create the table manually with columns: name (text), description (long-text), price (number), category (text), stock (number), active (checkbox), createdAt (date-time), updatedAt (date-time).',
      );
      return;
    }

    sendError(res, 500, 'SETUP_ERROR', 'Failed to setup products table', message);
  }
};

const handleListProducts = async (req, res, params, client, url) => {
  try {
    await ensureBolticSetup();

    const limit = clampNumber(Number(url.searchParams.get('limit')) || 20, 1, 200) ?? 20;
    const offsetRaw = Number(url.searchParams.get('offset')) || 0;
    const offset = clampNumber(offsetRaw, 0, 10_000) ?? 0;
    const category = normalizeString(url.searchParams.get('category') ?? '');
    const activeParam = url.searchParams.get('active');
    const active = activeParam === null ? null : parseBoolean(activeParam);

    const pageNo = Math.floor(offset / limit) + 1;

    const queryOptions = {
      page: {
        page_no: pageNo,
        page_size: limit,
      },
    };

    if (category || active !== null) {
      queryOptions.filter = {};
      if (category) {
        queryOptions.filter.category = category;
      }
      if (active !== null) {
        queryOptions.filter.active = active;
      }
    }

    const response = await withTimeout(
      client.records.findAll(PRODUCTS_TABLE, queryOptions),
      'Boltic product list',
    );

    if (isErrorResponse(response)) {
      throw new Error(response.error?.message || 'Failed to fetch products');
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
    console.error('Get products error:', error);
    sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch products', error.message);
  }
};

const handleGetProduct = async (req, res, params, client) => {
  try {
    await ensureBolticSetup();

    const response = await withTimeout(
      client.records.findOne(PRODUCTS_TABLE, params.id),
      'Boltic product lookup',
    );

    if (isErrorResponse(response)) {
      if (response.error?.code?.includes('not_found') || response.error?.message?.includes('not found')) {
        sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error?.message || 'Failed to fetch product');
    }

    if (!response.data) {
      sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
      return;
    }

    sendSuccess(res, 200, { data: response.data });
  } catch (error) {
    console.error('Get product error:', error);
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
      return;
    }
    sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch product', error.message);
  }
};

const handleCreateProduct = async (req, res, params, client) => {
  try {
    const body = await parseJSON(req);
    const name = normalizeString(body.name);
    const description = normalizeString(body.description ?? '');
    const category = normalizeString(body.category ?? '');

    if (!name) {
      sendError(res, 400, 'INVALID_INPUT', 'Name is required and must be a non-empty string.');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      sendError(res, 400, 'INVALID_INPUT', `Name must be at most ${MAX_NAME_LENGTH} characters.`);
      return;
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      sendError(res, 400, 'INVALID_INPUT', 'Description is too long.');
      return;
    }
    if (category.length > MAX_CATEGORY_LENGTH) {
      sendError(res, 400, 'INVALID_INPUT', `Category must be at most ${MAX_CATEGORY_LENGTH} characters.`);
      return;
    }

    const price = clampNumber(Number(body.price), 0, MAX_PRICE);
    if (price === null) {
      sendError(res, 400, 'INVALID_INPUT', 'Price must be a number.');
      return;
    }

    const stock = clampNumber(Number(body.stock ?? 0), 0, MAX_STOCK);
    if (stock === null) {
      sendError(res, 400, 'INVALID_INPUT', 'Stock must be a number.');
      return;
    }

    const active = parseBoolean(body.active);
    const now = new Date().toISOString();

    await ensureBolticSetup();

    const payload = {
      name,
      description: description || null,
      price,
      category: category || null,
      stock,
      active: active === null ? true : active,
      createdAt: now,
      updatedAt: now,
    };

    const response = await withTimeout(
      client.records.insert(PRODUCTS_TABLE, payload),
      'Boltic product insert',
    );

    if (isErrorResponse(response)) {
      throw new Error(response.error?.message || 'Failed to create product');
    }

    sendSuccess(res, 201, { data: response.data });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.message?.includes('Invalid JSON')) {
      sendError(res, 400, 'INVALID_JSON', error.message);
    } else if (error.message?.includes('too large')) {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', error.message);
    } else if (error.message === 'Invalid JSON payload') {
      sendError(res, 400, 'INVALID_JSON', error.message);
    } else {
      sendError(res, 500, 'CREATE_ERROR', 'Failed to create product', error.message);
    }
  }
};

const handleUpdateProduct = async (req, res, params, client) => {
  try {
    const body = await parseJSON(req);

    const updates = {};
    let hasUpdates = false;

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = normalizeString(body.name);
      if (!name) {
        sendError(res, 400, 'INVALID_INPUT', 'Name must be a non-empty string.');
        return;
      }
      if (name.length > MAX_NAME_LENGTH) {
        sendError(res, 400, 'INVALID_INPUT', `Name must be at most ${MAX_NAME_LENGTH} characters.`);
        return;
      }
      updates.name = name;
      hasUpdates = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      const description = normalizeString(body.description ?? '');
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        sendError(res, 400, 'INVALID_INPUT', 'Description is too long.');
        return;
      }
      updates.description = description || null;
      hasUpdates = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      const category = normalizeString(body.category ?? '');
      if (category.length > MAX_CATEGORY_LENGTH) {
        sendError(res, 400, 'INVALID_INPUT', `Category must be at most ${MAX_CATEGORY_LENGTH} characters.`);
        return;
      }
      updates.category = category || null;
      hasUpdates = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'price')) {
      const price = clampNumber(Number(body.price), 0, MAX_PRICE);
      if (price === null) {
        sendError(res, 400, 'INVALID_INPUT', 'Price must be a number.');
        return;
      }
      updates.price = price;
      hasUpdates = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'stock')) {
      const stock = clampNumber(Number(body.stock), 0, MAX_STOCK);
      if (stock === null) {
        sendError(res, 400, 'INVALID_INPUT', 'Stock must be a number.');
        return;
      }
      updates.stock = stock;
      hasUpdates = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'active')) {
      const active = parseBoolean(body.active);
      if (active === null) {
        sendError(res, 400, 'INVALID_INPUT', 'Active must be true or false.');
        return;
      }
      updates.active = active;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      sendError(res, 400, 'INVALID_INPUT', 'Provide at least one updatable field: name, description, price, category, stock, active.');
      return;
    }

    updates.updatedAt = new Date().toISOString();

    await ensureBolticSetup();

    const response = await withTimeout(
      client.records.updateById(PRODUCTS_TABLE, params.id, updates),
      'Boltic product update',
    );

    if (isErrorResponse(response)) {
      if (response.error?.code?.includes('not_found') || response.error?.message?.includes('not found')) {
        sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error?.message || 'Failed to update product');
    }

    sendSuccess(res, 200, { data: response.data });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
    } else if (error.message?.includes('Invalid JSON')) {
      sendError(res, 400, 'INVALID_JSON', error.message);
    } else if (error.message?.includes('too large')) {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', error.message);
    } else {
      sendError(res, 500, 'UPDATE_ERROR', 'Failed to update product', error.message);
    }
  }
};

const handleDeleteProduct = async (req, res, params, client) => {
  try {
    await ensureBolticSetup();

    const response = await withTimeout(
      client.records.deleteById(PRODUCTS_TABLE, params.id),
      'Boltic product delete',
    );

    if (isErrorResponse(response)) {
      if (response.error?.code?.includes('not_found') || response.error?.message?.includes('not found')) {
        sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error?.message || 'Failed to delete product');
    }

    sendSuccess(res, 200, {
      data: {
        id: params.id,
        deleted: true,
      },
    });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'PRODUCT_NOT_FOUND', `Product with id ${params.id} not found`);
    } else {
      sendError(res, 500, 'DELETE_ERROR', 'Failed to delete product', error.message);
    }
  }
};

const handleHealth = async (req, res) => {
  sendSuccess(res, 200, { message: 'ok' });
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
router.add('POST', '/api/setup', handleSetup);
router.add('POST', '/setup', handleSetup);
router.add('GET', '/api/products', handleListProducts);
router.add('GET', '/products', handleListProducts);
router.add('GET', '/api/products/:id', handleGetProduct);
router.add('GET', '/products/:id', handleGetProduct);
router.add('POST', '/api/products', handleCreateProduct);
router.add('POST', '/products', handleCreateProduct);
router.add('PATCH', '/api/products/:id', handleUpdateProduct);
router.add('PATCH', '/products/:id', handleUpdateProduct);
router.add('DELETE', '/api/products/:id', handleDeleteProduct);
router.add('DELETE', '/products/:id', handleDeleteProduct);
router.add('GET', '/health', handleHealth);
router.add('GET', '*', handleNotFound);
router.add('POST', '*', handleNotFound);
router.add('PATCH', '*', handleNotFound);
router.add('DELETE', '*', handleNotFound);

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

export const startLocalServer = async () => {
  const http = await import('node:http');
  const port = Number(process.env.PORT || 3000);

  try {
    await ensureBolticSetup();
    console.log('Boltic setup complete. Ready to manage products.');
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
    console.log(`Product app listening on http://localhost:${port}`);
  });

  const shutdown = () => {
    console.log('Shutting down product app server…');
    server.close(() => {
      console.log('Product app server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
};


  startLocalServer().catch((error) => {
    console.error('Failed to start local server', error);
  });

