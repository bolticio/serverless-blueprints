import 'dotenv/config';
import { createClient, isErrorResponse } from '@boltic/sdk';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ENV_VARS = ['BOLTIC_API_KEY'];
const DEFAULT_ENVIRONMENT = 'sit';
const DEFAULT_TABLE = 'budget_items';
const MAX_BODY_SIZE_BYTES = 64 * 1024;
const MAX_PAGE_SIZE = 100;
const MAX_CATEGORY_LENGTH = 120;
const MAX_NOTES_LENGTH = 1500;
const MAX_AMOUNT = 100_000_000;

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

const RAW_ENVIRONMENT = process.env.BOLTIC_ENVIRONMENT || process.env.ENVIRONMENT || DEFAULT_ENVIRONMENT;
const ENVIRONMENT = RAW_ENVIRONMENT.toLowerCase();
const BUDGET_TABLE = process.env.BOLTIC_BUDGET_TABLE || DEFAULT_TABLE;
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

const requiredColumns = [
  {
    name: 'category',
    type: 'text',
    is_nullable: false,
    description: 'Spending or income category',
    field_order: 1,
  },
  {
    name: 'amount',
    type: 'text',
    is_nullable: false,
    description: 'Monetary amount stored as text',
    field_order: 2,
  },
  {
    name: 'entryType',
    type: 'text',
    is_nullable: false,
    description: 'Entry classification (expense or income)',
    field_order: 3,
  },
  {
    name: 'dueDate',
    type: 'date-time',
    is_nullable: true,
    description: 'Optional due date for the item',
    field_order: 4,
  },
  {
    name: 'notes',
    type: 'long-text',
    is_nullable: true,
    description: 'Additional notes for the entry',
    field_order: 5,
  },
  {
    name: 'createdAt',
    type: 'date-time',
    is_nullable: false,
    description: 'Timestamp when the entry was created',
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
      bolticClient.tables.findByName(BUDGET_TABLE),
      'Boltic table lookup',
    );
  } catch (error) {
    throw new Error(formatBolticError('Failed to query budget table', error));
  }

  if (!isErrorResponse(lookup) && lookup.data) {
    return lookup.data;
  }

  const tableDefinition = {
    name: BUDGET_TABLE,
    description: 'Budget planner entries captured via the Boltic SDK example',
    fields: requiredColumns,
  };

  let creationResult;
  try {
    creationResult = await withTimeout(
      bolticClient.tables.create(tableDefinition),
      'Boltic table creation',
    );
  } catch (error) {
    throw new Error(formatBolticError(`Failed to create Boltic table '${BUDGET_TABLE}'`, error));
  }

  if (isErrorResponse(creationResult)) {
    const message = creationResult.error?.message || 'Failed to create budget table';
    throw new Error(message);
  }

  let verify;
  try {
    verify = await withTimeout(
      bolticClient.tables.findByName(BUDGET_TABLE),
      'Boltic table verification',
    );
  } catch (error) {
    throw new Error(formatBolticError('Unable to verify Boltic budget table creation', error));
  }

  if (isErrorResponse(verify) || !verify.data) {
    throw new Error('Unable to verify Boltic budget table creation');
  }

  console.log(`Created Boltic table '${BUDGET_TABLE}' (id: ${verify.data.id}).`);
  return verify.data;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeEntryType = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed !== 'expense' && trimmed !== 'income') {
    return undefined;
  }
  return trimmed;
};

const normalizeDueDate = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
};

const normalizeAmount = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return parsed;
  }
  return undefined;
};

const validateBudgetPayload = ({ category, amount, entryType, dueDate, notes }) => {
  if (!category) {
    return 'Category is required.';
  }
  if (category.length > MAX_CATEGORY_LENGTH) {
    return `Category is too long. Keep it under ${MAX_CATEGORY_LENGTH} characters.`;
  }
  if (amount === null) {
    return 'Amount is required.';
  }
  if (amount === undefined || Number.isNaN(amount) || !Number.isFinite(amount)) {
    return 'Amount must be a valid number.';
  }
  if (Math.abs(amount) > MAX_AMOUNT) {
    return 'Amount is too large.';
  }
  if (amount <= 0) {
    return 'Amount must be greater than zero.';
  }
  if (!entryType) {
    return 'Entry type must be expense or income.';
  }
  if (entryType === undefined) {
    return 'Entry type must be either expense or income.';
  }
  if (dueDate === undefined) {
    return 'Due date is invalid. Provide a valid ISO date or leave it blank.';
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return 'Notes are too long.';
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
      message: 'Boltic setup complete. Ready to capture budget entries.',
      data: tableInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to setup budget table';
    const isNotSupported = typeof message === 'string' && (message.includes('not supported') || error?.status === 501);

    if (isNotSupported) {
      sendError(
        res,
        501,
        'TABLE_CREATION_NOT_SUPPORTED',
        'SDK-based table creation is not supported. Create the table manually with columns: category (text), amount (text), entryType (text), dueDate (date-time), notes (long-text), createdAt (date-time).',
      );
      return;
    }

    sendError(res, 500, 'SETUP_ERROR', 'Failed to setup budget table', message);
  }
};

const handleCreateEntry = async (req, res, _params, client) => {
  try {
    const body = await parseJSON(req);
    const category = normalizeString(body.category);
    const entryType = normalizeEntryType(body.entryType ?? body.type ?? 'expense');
    const amount = normalizeAmount(body.amount);
    const dueDate = normalizeDueDate(body.dueDate ?? body.due_date ?? body.due ?? null);
    const notes = normalizeString(body.notes ?? '');

    const validationError = validateBudgetPayload({
      category,
      amount,
      entryType,
      dueDate,
      notes,
    });

    if (validationError) {
      sendError(res, 400, 'INVALID_INPUT', validationError);
      return;
    }

    await ensureBolticSetup();

    const createdAt = new Date().toISOString();

    let result;
    try {
      result = await withTimeout(
        client.records.insert(BUDGET_TABLE, {
          category,
          amount: String(amount),
          entryType,
          dueDate,
          notes: notes || null,
          createdAt,
        }),
        'Boltic budget entry creation',
      );
    } catch (error) {
      throw new Error(formatBolticError('Failed to create budget entry', error));
    }

    if (isErrorResponse(result)) {
      const message = result.error?.message || 'Failed to create budget entry';
      sendError(res, 500, 'CREATE_ERROR', message);
      return;
    }

    sendSuccess(res, 201, {
      message: 'Budget entry saved.',
      data: result.data,
    });
  } catch (error) {
    console.error('Create budget entry error:', error);
    if (error.message === 'Invalid JSON payload') {
      sendError(res, 400, 'INVALID_JSON', error.message);
    } else if (error.message === 'Request body too large') {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', error.message);
    } else {
      sendError(res, 500, 'CREATE_ERROR', 'Failed to create budget entry', error.message);
    }
  }
};

const handleListEntries = async (req, res, _params, client, url) => {
  try {
    const limitParam = parseInt(url.searchParams.get('limit'), 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_SIZE)
      : 20;

    const offsetParam = parseInt(url.searchParams.get('offset'), 10);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const typeParam = url.searchParams.get('type');
    const normalizedType = typeParam ? normalizeEntryType(typeParam) : null;
    if (normalizedType === undefined) {
      sendError(res, 400, 'INVALID_FILTER', 'type must be expense or income when provided.');
      return;
    }

    const pageNo = Math.floor(offset / limit) + 1;

    await ensureBolticSetup();

    const baseQuery = {
      page: {
        page_no: pageNo,
        page_size: limit,
      },
      sort: {
        field: 'createdAt',
        direction: 'desc',
      },
    };

    if (normalizedType) {
      baseQuery.filter = {
        entryType: normalizedType,
      };
    }

    const executeQuery = async (options) => withTimeout(
      client.records.findAll(BUDGET_TABLE, options),
      'Boltic budget entries fetch',
    );

    let response = await executeQuery(baseQuery);

    if (isErrorResponse(response)) {
      const message = response.error?.message || '';
      const metaText = Array.isArray(response.error?.meta)
        ? response.error.meta.join(' ').toLowerCase()
        : '';
      const combined = `${message} ${metaText}`.toLowerCase();
      const needsFallback = combined.includes('sort') || combined.includes('field');
      if (needsFallback) {
        const fallbackQuery = { ...baseQuery };
        delete fallbackQuery.sort;
        console.warn('Budget list query fallback triggered:', combined.trim() || 'Sort error');
        response = await executeQuery(fallbackQuery);
      }
    }

    if (isErrorResponse(response)) {
      console.error('Budget list error response:', response.error);
      throw new Error(response.error?.message || 'Failed to fetch budget entries');
    }

    const records = response.data || [];
    const pagination = response.pagination || {};

    const summary = records.reduce((acc, record) => {
      const amountValue = typeof record.amount === 'number' ? record.amount : Number(record.amount);
      if (!Number.isFinite(amountValue)) {
        return acc;
      }
      if ((record.entryType || '').toLowerCase() === 'income') {
        acc.totalIncome += amountValue;
      } else {
        acc.totalExpenses += amountValue;
      }
      return acc;
    }, { totalIncome: 0, totalExpenses: 0 });

    summary.net = summary.totalIncome - summary.totalExpenses;

    sendSuccess(res, 200, {
      data: records,
      summary,
      pagination: {
        limit,
        offset,
        total: pagination.total_count || 0,
      },
    });
  } catch (error) {
    console.error('Budget list failure:', error);
    sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch budget entries', error.message);
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
router.add('POST', '/setup', handleSetup);
router.add('POST', '/api/setup', handleSetup);
router.add('POST', '/', handleCreateEntry);
router.add('POST', '/api/budget', handleCreateEntry);
router.add('POST', '/budget', handleCreateEntry);
router.add('GET', '/api/budget', handleListEntries);
router.add('GET', '/budget', handleListEntries);
router.add('GET', '/health', handleHealth);
router.add('GET', '*', handleNotFound);
router.add('POST', '*', handleNotFound);

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
    console.log('Boltic setup complete. Ready to capture budget entries.');
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
    console.log(`Budget planner listening on http://localhost:${port}`);
  });

  return server;
};


startLocalServer().catch((error) => {
  console.error('Failed to start local server', error);
});
