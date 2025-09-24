import { createClient } from 'boltic-sdk';

// Environment variable validation at module load
const REQUIRED_ENV_VARS = ['BOLTIC_API_KEY'];
const OPTIONAL_ENV_VARS = ['BOLTIC_TABLE_ID'];

// Validate required environment variables
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Default table name if not provided
const BOLTIC_TABLE_ID = process.env.BOLTIC_TABLE_ID || 'todos';

// Initialize Boltic client (global)
let bolticClient;
try {
  const clientOptions = {
    debug: false,
    retryAttempts: 3,
    environment: 'uat'
  };
  
  bolticClient = createClient(process.env.BOLTIC_API_KEY, clientOptions);
} catch (error) {
  throw new Error(`Failed to initialize Boltic client: ${error.message}`);
}

// Utility functions
const parseJSON = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    let contentLength = 0;
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit
    
    req.on('data', (chunk) => {
      contentLength += chunk.length;
      if (contentLength > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    
    req.on('error', reject);
  });
};

const sendResponse = (res, statusCode, data) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
};

const sendError = (res, statusCode, code, message, details = null) => {
  const errorResponse = {
    error: {
      code,
      message,
      ...(details && { details })
    }
  };
  sendResponse(res, statusCode, errorResponse);
};

// Router implementation
const router = {
  routes: [],
  
  add(method, path, handler) {
    // Handle wildcard route specially
    if (path === '*') {
      this.routes.push({
        method,
        path,
        pathRegex: null, // Special marker for wildcard
        paramNames: [],
        handler
      });
      return;
    }
    
    const pathRegex = path.replace(/:\w+/g, '([^/]+)');
    const paramNames = (path.match(/:\w+/g) || []).map(p => p.slice(1));
    this.routes.push({
      method,
      path,
      pathRegex: new RegExp(`^${pathRegex}$`),
      paramNames,
      handler
    });
  },
  
  match(method, url) {
    for (const route of this.routes) {
      if (route.method === method) {
        // Handle wildcard route
        if (route.path === '*') {
          return { handler: route.handler, params: {} };
        }
        
        // Handle normal routes
        if (route.pathRegex) {
          const match = url.match(route.pathRegex);
          if (match) {
            const params = {};
            route.paramNames.forEach((name, index) => {
              params[name] = match[index + 1];
            });
            return { handler: route.handler, params };
          }
        }
      }
    }
    return null;
  }
};

// CORS preflight handler
const handleOptions = async (req, res, params, client) => {
  sendResponse(res, 200, {});
};

// Setup endpoint - creates todos table if it doesn't exist
const handleSetup = async (req, res, params, client) => {
    console.log("Setting up table:", BOLTIC_TABLE_ID);
    console.log("Client:", client);
  try {
    // Check if table exists first
    let tableExists = false;
    let table = null;
    console.log("Finding table by name:", BOLTIC_TABLE_ID);
    console.log("Client:", client);
    try {
      // Use the correct SDK method to find table by name
      const response = await client.tables.findByName(BOLTIC_TABLE_ID);
      
      if (response.data && !response.error) {
        tableExists = true;
        table = response.data;
      }
    } catch (error) {
      if (error.message?.includes('not found') || error.status === 404) {
        tableExists = false;
      } else {
        throw error;
      }
    }
    
    if (!tableExists) {
      try {
        // Use the direct tables.create method instead of table builder
        const tableCreateRequest = {
          name: BOLTIC_TABLE_ID,
          description: 'Todos table for task management',
          fields: [
            {
              name: 'title',
              type: 'text',
              is_nullable: false,
              description: 'Todo title'
            },
            {
              name: 'completed',
              type: 'checkbox',
              is_nullable: false,
              default_value: false,
              description: 'Whether the todo is completed'
            },
            {
              name: 'createdAt',
              type: 'date-time',
              is_nullable: false,
              description: 'When the todo was created'
            },
            {
              name: 'updatedAt',
              type: 'date-time',
              is_nullable: false,
              description: 'When the todo was last updated'
            }
          ]
        };
        
        const createResponse = await client.tables.create(tableCreateRequest);
        
        if (createResponse.error) {
          throw new Error(createResponse.error.message || 'Failed to create table');
        }
        
        sendResponse(res, 200, {
          data: {
            created: true,
            alreadyExisted: false,
            table: createResponse.data
          }
        });
      } catch (createError) {
        if (createError.message?.includes('not supported') || createError.status === 501) {
          sendError(res, 501, 'TABLE_CREATION_NOT_SUPPORTED', 
            'Table creation via SDK failed. Please create the table manually via Boltic UI with the following schema: title (text, required), completed (checkbox, default false), createdAt (datetime), updatedAt (datetime)');
        } else {
          throw createError;
        }
      }
    } else {
      sendResponse(res, 200, {
        data: {
          created: false,
          alreadyExisted: true,
          table: table
        }
      });
    }
  } catch (error) {
    console.error('Setup error:', error);
    sendError(res, 500, 'SETUP_ERROR', 'Failed to setup table', error.message);
  }
};

// Get all todos with pagination
const handleGetTodos = async (req, res, params, client) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    
    // Calculate page number (SDK uses page-based pagination)
    const pageNo = Math.floor(offset / limit) + 1;
    
    const response = await client.records.findAll(BOLTIC_TABLE_ID, {
        page: {
          page_no: pageNo,
          page_size: limit,
        },
      });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch todos');
    }
    
    const records = response.data || [];
    const pagination = response.pagination || {};
    
    sendResponse(res, 200, {
      data: records,
      pagination: {
        limit,
        offset,
        total: pagination.total_count || 0
      }
    });
  } catch (error) {
    console.error('Get todos error:', error);
    sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch todos', error.message);
  }
};

// Get single todo by ID
const handleGetTodo = async (req, res, params, client) => {
  try {
    // Use the correct SDK method to find a record by ID
    const response = await client.records.findOne(BOLTIC_TABLE_ID, params.id);
    
    if (response.error) {
      if (response.error.code?.includes('not_found') || response.error.message?.includes('not found')) {
        sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error.message || 'Failed to fetch todo');
    }
    
    if (!response.data) {
      sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
      return;
    }
    
    sendResponse(res, 200, { data: response.data });
  } catch (error) {
    console.error('Get todo error:', error);
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
    } else {
      sendError(res, 500, 'FETCH_ERROR', 'Failed to fetch todo', error.message);
    }
  }
};

// Create new todo
const handleCreateTodo = async (req, res, params, client) => {
  try {
    const body = await parseJSON(req);
    
    // Validation
    if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
      sendError(res, 400, 'INVALID_INPUT', 'Title is required and must be a non-empty string');
      return;
    }
    
    const todoData = {
      title: body.title.trim(),
      completed: body.completed === true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Use the correct SDK method to insert a record
    const response = await client.records.insert(BOLTIC_TABLE_ID, todoData);
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create todo');
    }
    
    sendResponse(res, 201, { data: response.data });
  } catch (error) {
    console.error('Create todo error:', error);
    if (error.message?.includes('Invalid JSON')) {
      sendError(res, 400, 'INVALID_JSON', error.message);
    } else if (error.message?.includes('too large')) {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', error.message);
    } else {
      sendError(res, 500, 'CREATE_ERROR', 'Failed to create todo', error.message);
    }
  }
};

// Update todo by ID
const handleUpdateTodo = async (req, res, params, client) => {
  try {
    const body = await parseJSON(req);
    
    // Validate that at least one updateable field is provided
    const allowedFields = ['title', 'completed'];
    const updateData = {};
    let hasValidUpdate = false;
    
    for (const field of allowedFields) {
      if (body.hasOwnProperty(field)) {
        if (field === 'title') {
          if (typeof body.title !== 'string' || body.title.trim() === '') {
            sendError(res, 400, 'INVALID_INPUT', 'Title must be a non-empty string');
            return;
          }
          updateData.title = body.title.trim();
        } else if (field === 'completed') {
          updateData.completed = body.completed === true;
        }
        hasValidUpdate = true;
      }
    }
    
    if (!hasValidUpdate) {
      sendError(res, 400, 'INVALID_INPUT', 'At least one of the following fields must be provided: title, completed');
      return;
    }
    
    updateData.updatedAt = new Date().toISOString();
    
    // Use the correct SDK method to update a record by ID
    const response = await client.records.updateById(BOLTIC_TABLE_ID, params.id, updateData);
    
    if (response.error) {
      if (response.error.code?.includes('not_found') || response.error.message?.includes('not found')) {
        sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error.message || 'Failed to update todo');
    }
    
    sendResponse(res, 200, { data: response.data });
  } catch (error) {
    console.error('Update todo error:', error);
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
    } else if (error.message?.includes('Invalid JSON')) {
      sendError(res, 400, 'INVALID_JSON', error.message);
    } else {
      sendError(res, 500, 'UPDATE_ERROR', 'Failed to update todo', error.message);
    }
  }
};

// Delete todo by ID
const handleDeleteTodo = async (req, res, params, client) => {
  try {
    // Use the correct SDK method to delete a record by ID
    const response = await client.records.deleteById(BOLTIC_TABLE_ID, params.id);
    
    if (response.error) {
      if (response.error.code?.includes('not_found') || response.error.message?.includes('not found')) {
        sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
        return;
      }
      throw new Error(response.error.message || 'Failed to delete todo');
    }
    
    sendResponse(res, 200, {
      data: {
        id: params.id,
        deleted: true
      }
    });
  } catch (error) {
    console.error('Delete todo error:', error);
    if (error.status === 404 || error.message?.includes('not found')) {
      sendError(res, 404, 'TODO_NOT_FOUND', `Todo with id ${params.id} not found`);
    } else {
      sendError(res, 500, 'DELETE_ERROR', 'Failed to delete todo', error.message);
    }
  }
};

// Route definitions
router.add('OPTIONS', '*', handleOptions);
router.add('POST', '/setup', handleSetup);
router.add('GET', '/todos', handleGetTodos);
router.add('GET', '/todos/:id', handleGetTodo);
router.add('POST', '/todos', handleCreateTodo);
router.add('PATCH', '/todos/:id', handleUpdateTodo);
router.add('DELETE', '/todos/:id', handleDeleteTodo);

// Main handler
export const handler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;
    
    // Handle OPTIONS for any path
    if (method === 'OPTIONS') {
      return handleOptions(req, res, {}, bolticClient);
    }
    
    // Find matching route
    const match = router.match(method, pathname);
    
    if (!match) {
      sendError(res, 404, 'ROUTE_NOT_FOUND', `Route ${method} ${pathname} not found`);
      return;
    }
    
    // Execute handler with bolticClient passed as parameter
    await match.handler(req, res, match.params, bolticClient);
    
  } catch (error) {
    console.error('Handler error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
