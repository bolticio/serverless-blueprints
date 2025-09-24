# Boltic SDK Todos API

A serverless CRUD API for managing todos using the **boltic-sdk** package exclusively. This implementation provides a tiny HTTP router inside a single `handler.js` file with full CRUD operations for a Boltic Table named `todos`.

## Features

- ✅ **Pure boltic-sdk** - No raw REST calls, no fetch, no fallbacks
- ✅ **Tiny HTTP Router** - Built-in routing without external dependencies
- ✅ **Full CRUD Operations** - Create, Read, Update, Delete todos
- ✅ **Table Setup Endpoint** - Idempotent table creation
- ✅ **Pagination Support** - List todos with limit/offset
- ✅ **CORS Enabled** - Permissive CORS headers for all endpoints
- ✅ **Input Validation** - Comprehensive validation with helpful error messages
- ✅ **Error Handling** - Consistent error response format
- ✅ **ESM Support** - Modern ES modules syntax
- ✅ **1MB Body Limit** - Protection against large payloads

## Table Schema

The `todos` table is created with the following schema:

| Column | Type | Description |
|--------|------|-------------|
| `id` | string/uuid | Primary key (auto-generated) |
| `title` | text | Todo title (required, non-empty) |
| `completed` | checkbox | Completion status (default: false) |
| `createdAt` | datetime | Creation timestamp (auto-set) |
| `updatedAt` | datetime | Last update timestamp (auto-updated) |

## Environment Variables

### Required

- `BOLTIC_API_KEY`: Your Boltic API key for authentication

### Optional

- `BOLTIC_TABLE_NAME`: Table name/slug for CRUD operations (default: `'todos'`)

## API Endpoints

### CORS Preflight

```
OPTIONS * → 200 OK
```

Handles CORS preflight for all endpoints.

### Setup Endpoint

```
POST /setup → 200 OK
```

Creates the `todos` table if it doesn't exist (idempotent operation).

**Response:**
```json
{
  "data": {
    "created": boolean,
    "alreadyExisted": boolean,
    "table": object
  }
}
```

**Note:** If the SDK doesn't support table creation, returns `501` with instructions to create the table manually via Boltic UI.

### List Todos

```
GET /todos?limit=20&offset=0 → 200 OK
```

**Query Parameters:**
- `limit`: Maximum number of todos to return (default: 20)
- `offset`: Number of todos to skip (default: 0)

**Response:**
```json
{
  "data": [
    {
      "id": "todo_123",
      "title": "Buy groceries",
      "completed": false,
      "createdAt": "2023-10-01T12:00:00Z",
      "updatedAt": "2023-10-01T12:00:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

### Get Single Todo

```
GET /todos/:id → 200 OK | 404 Not Found
```

**Response:**
```json
{
  "data": {
    "id": "todo_123",
    "title": "Buy groceries",
    "completed": false,
    "createdAt": "2023-10-01T12:00:00Z",
    "updatedAt": "2023-10-01T12:00:00Z"
  }
}
```

### Create Todo

```
POST /todos → 201 Created | 400 Bad Request
```

**Request Body:**
```json
{
  "title": "Buy groceries",
  "completed": false
}
```

**Response:**
```json
{
  "data": {
    "id": "todo_123",
    "title": "Buy groceries",
    "completed": false,
    "createdAt": "2023-10-01T12:00:00Z",
    "updatedAt": "2023-10-01T12:00:00Z"
  }
}
```

### Update Todo

```
PATCH /todos/:id → 200 OK | 400 Bad Request | 404 Not Found
```

**Request Body (partial update):**
```json
{
  "completed": true
}
```

**Response:**
```json
{
  "data": {
    "id": "todo_123",
    "title": "Buy groceries",
    "completed": true,
    "createdAt": "2023-10-01T12:00:00Z",
    "updatedAt": "2023-10-01T12:05:00Z"
  }
}
```

### Delete Todo

```
DELETE /todos/:id → 200 OK | 404 Not Found
```

**Response:**
```json
{
  "data": {
    "id": "todo_123",
    "deleted": true
  }
}
```

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Optional additional details"
  }
}
```

### Common Error Codes

- `INVALID_INPUT`: Validation failed (400)
- `INVALID_JSON`: Malformed JSON in request body (400)
- `PAYLOAD_TOO_LARGE`: Request body exceeds 1MB limit (413)
- `TODO_NOT_FOUND`: Todo with specified ID not found (404)
- `ROUTE_NOT_FOUND`: Endpoint not found (404)
- `TABLE_CREATION_NOT_SUPPORTED`: SDK doesn't support table creation (501)
- `SETUP_ERROR`: Table setup failed (500)
- `FETCH_ERROR`: Failed to retrieve data (500)
- `CREATE_ERROR`: Failed to create todo (500)
- `UPDATE_ERROR`: Failed to update todo (500)
- `DELETE_ERROR`: Failed to delete todo (500)
- `INTERNAL_ERROR`: Unexpected server error (500)

## Usage Examples

### 1. Setup the Table

```bash
curl -X POST https://your-function-url/setup
```

### 2. Create a Todo

```bash
curl -X POST https://your-function-url/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn Boltic SDK", "completed": false}'
```

### 3. List All Todos

```bash
curl https://your-function-url/todos
```

### 4. Get a Specific Todo

```bash
curl https://your-function-url/todos/todo_123
```

### 5. Update a Todo

```bash
curl -X PATCH https://your-function-url/todos/todo_123 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

### 6. Delete a Todo

```bash
curl -X DELETE https://your-function-url/todos/todo_123
```

## Deployment

1. Set the required environment variables:
   ```bash
   export BOLTIC_API_KEY="your-api-key"
   export BOLTIC_TABLE_NAME="todos"  # optional
   ```

2. Deploy the `handler.js` file to your serverless runtime

3. The function is ready to handle requests at the `/setup` and `/todos` endpoints

## SDK Implementation

This implementation uses the official **boltic-sdk** v0.0.1 with the following methods:

### Table Operations
```javascript
// Create table using builder pattern
bolticClient.table(tableName)
  .describe(description)
  .text(fieldName, options)
  .checkbox(fieldName, options)
  .dateTime(fieldName, options)
  .create()

// Find table by name
bolticClient.tables.findByName(tableName)
```

### Record Operations
```javascript
// Insert record
bolticClient.records.insert(tableName, data)

// Find record by ID
bolticClient.records.findOne(tableName, recordId)

// List records with pagination
bolticClient.from(tableName).records().list().page(pageNo, pageSize).orderBy(field, direction)

// Update record by ID
bolticClient.records.updateById(tableName, recordId, data)

// Delete record by ID
bolticClient.records.deleteById(tableName, recordId)
```

## Validation Rules

### Todo Title
- **Required**: Must be provided
- **Type**: String
- **Non-empty**: Cannot be empty or whitespace-only
- **Trimmed**: Leading/trailing whitespace is removed

### Todo Completed
- **Optional**: Defaults to `false`
- **Type**: Boolean
- **Coercion**: Only `true` is considered true, everything else is `false`

### Update Operations
- **Partial**: Only provided fields are updated
- **At least one field**: Must provide at least one valid field to update
- **Timestamp**: `updatedAt` is automatically set to current time

## CORS Configuration

The API includes permissive CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Security Considerations

- **API Key**: The Boltic API key is validated at module load
- **Input Validation**: All inputs are validated before processing
- **Body Size Limit**: Request bodies are limited to 1MB
- **Error Handling**: Sensitive information is not exposed in error messages
- **No SQL Injection**: Using SDK methods prevents SQL injection attacks

## Node.js Version

This function requires **Node.js 18+** for ESM support and modern JavaScript features.

## Dependencies

- `boltic-sdk`: The official Boltic SDK package (v0.0.1)

## License

This blueprint is provided as-is for educational and development purposes.
