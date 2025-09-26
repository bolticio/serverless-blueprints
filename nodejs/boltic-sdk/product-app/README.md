# Boltic SDK Products API

A serverless CRUD API for managing products using the Boltic SDK. This blueprint demonstrates how to build a complete product management system with inventory tracking, categorization, and full CRUD operations.

## 🚀 Features

- **Complete CRUD Operations**: Create, Read, Update, and Delete products
- **Product Management**: Name, description, price, category, stock tracking
- **Inventory Control**: Stock quantity management and active/inactive status
- **Advanced Filtering**: Filter products by category and active status
- **Pagination Support**: Efficient handling of large product catalogs
- **Input Validation**: Comprehensive validation for product data
- **Error Handling**: Detailed error responses with proper HTTP status codes
- **CORS Support**: Ready for frontend integration
- **Auto Table Creation**: Automatically sets up the products table if it doesn't exist

## 📋 Product Schema

Each product contains the following fields:

```json
{
  "id": "string",           // Unique product identifier (auto-generated)
  "name": "string",         // Product name (required)
  "description": "string",  // Product description (optional)
  "price": "number",        // Product price (required, non-negative)
  "category": "string",     // Product category (optional)
  "stock": "number",        // Stock quantity (default: 0)
  "active": "boolean",      // Whether product is active (default: true)
  "createdAt": "datetime",  // Creation timestamp (auto-generated)
  "updatedAt": "datetime"   // Last update timestamp (auto-updated)
}
```

## 🛠️ Prerequisites

- Node.js 18+ 
- Boltic API key
- Boltic account with table creation permissions

## ⚙️ Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `BOLTIC_API_KEY` | Your Boltic API key | Yes | - |
| `BOLTIC_TABLE_NAME` | Name of the products table | No | `products` |
| `ENVIRONMENT` | Boltic environment | No | `uat` |
| `PORT` | Local server port | No | `3000` |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

```bash
export BOLTIC_API_KEY="your-boltic-api-key-here"
export BOLTIC_TABLE_NAME="products"  # Optional
```

### 3. Run Locally

```bash
npm start
# or
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Setup Products Table

First, create the products table (idempotent operation):

```bash
curl -X POST http://localhost:3000/setup
```

## 📚 API Endpoints

### Setup
- `POST /setup` - Create products table if it doesn't exist

### Products CRUD
- `GET /products` - List all products (with pagination and filtering)
- `GET /products/:id` - Get a specific product
- `POST /products` - Create a new product
- `PATCH /products/:id` - Update an existing product
- `DELETE /products/:id` - Delete a product

### CORS
- `OPTIONS *` - CORS preflight handler

## 🔧 API Usage Examples

### Create a Product

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wireless Headphones",
    "description": "High-quality wireless headphones with noise cancellation",
    "price": 299.99,
    "category": "Electronics",
    "stock": 50,
    "active": true
  }'
```

### List Products with Filtering

```bash
# Get all products
curl http://localhost:3000/products

# Get products with pagination
curl "http://localhost:3000/products?limit=10&offset=0"

# Filter by category
curl "http://localhost:3000/products?category=Electronics"

# Filter by active status
curl "http://localhost:3000/products?active=true"

# Combine filters
curl "http://localhost:3000/products?category=Electronics&active=true&limit=5"
```

### Get a Specific Product

```bash
curl http://localhost:3000/products/product_123
```

### Update a Product

```bash
curl -X PATCH http://localhost:3000/products/product_123 \
  -H "Content-Type: application/json" \
  -d '{
    "price": 279.99,
    "stock": 45
  }'
```

### Update Stock Quantity

```bash
curl -X PATCH http://localhost:3000/products/product_123 \
  -H "Content-Type: application/json" \
  -d '{
    "stock": 25
  }'
```

### Deactivate a Product

```bash
curl -X PATCH http://localhost:3000/products/product_123 \
  -H "Content-Type: application/json" \
  -d '{
    "active": false
  }'
```

### Delete a Product

```bash
curl -X DELETE http://localhost:3000/products/product_123
```

## 📊 Response Examples

### Success Response (Create Product)

```json
{
  "data": {
    "id": "product_123",
    "name": "Wireless Headphones",
    "description": "High-quality wireless headphones with noise cancellation",
    "price": 299.99,
    "category": "Electronics",
    "stock": 50,
    "active": true,
    "createdAt": "2023-10-01T12:00:00Z",
    "updatedAt": "2023-10-01T12:00:00Z"
  }
}
```

### Success Response (List Products)

```json
{
  "data": [
    {
      "id": "product_123",
      "name": "Wireless Headphones",
      "description": "High-quality wireless headphones with noise cancellation",
      "price": 299.99,
      "category": "Electronics",
      "stock": 50,
      "active": true,
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

### Error Response

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product with id product_123 not found"
  }
}
```

## 🚨 Error Codes

| Code | Description |
|------|-------------|
| `SETUP_ERROR` | Failed to setup products table |
| `FETCH_ERROR` | Failed to fetch products |
| `CREATE_ERROR` | Failed to create product |
| `UPDATE_ERROR` | Failed to update product |
| `DELETE_ERROR` | Failed to delete product |
| `PRODUCT_NOT_FOUND` | Product not found |
| `INVALID_INPUT` | Invalid input data |
| `INVALID_JSON` | Invalid JSON in request body |
| `PAYLOAD_TOO_LARGE` | Request body too large |
| `ROUTE_NOT_FOUND` | API route not found |
| `INTERNAL_ERROR` | Internal server error |

## 🔍 Query Parameters

### GET /products

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum products to return | 20 |
| `offset` | integer | Number of products to skip | 0 |
| `category` | string | Filter by product category | - |
| `active` | boolean | Filter by active status | - |

## 📝 Request Body Validation

### Create Product (POST /products)

**Required fields:**
- `name` (string, non-empty)
- `price` (number, non-negative)

**Optional fields:**
- `description` (string)
- `category` (string)
- `stock` (number, non-negative, default: 0)
- `active` (boolean, default: true)

### Update Product (PATCH /products/:id)

**At least one field required:**
- `name` (string, non-empty)
- `description` (string, nullable)
- `price` (number, non-negative)
- `category` (string, nullable)
- `stock` (number, non-negative)
- `active` (boolean)

## 🏗️ Project Structure

```
xyz/
├── handler.js          # Main serverless handler with CRUD logic
├── blueprint.yaml      # Serverless function configuration
├── package.json        # Node.js dependencies and scripts
├── local-server.mjs    # Local development server
├── README.md           # This documentation
└── package-lock.json   # Dependency lock file
```

## 🔧 Development

### Local Development

```bash
# Start the local server
npm run dev

# The server will be available at http://localhost:3000
```

### Testing the API

Use the provided curl commands or your favorite HTTP client (Postman, Insomnia, etc.) to test the API endpoints.

## 🚀 Deployment

This serverless function can be deployed to any platform that supports Node.js serverless functions:

- AWS Lambda
- Vercel
- Netlify Functions
- Google Cloud Functions
- Azure Functions

Make sure to set the required environment variables in your deployment platform.

## 🔒 Security Considerations

1. **API Key Protection**: Never expose your Boltic API key in client-side code
2. **Input Validation**: All inputs are validated for type and content
3. **Rate Limiting**: Consider implementing rate limiting in production
4. **CORS**: Configure CORS settings appropriately for your use case
5. **HTTPS**: Always use HTTPS in production

## 🐛 Troubleshooting

### Common Issues

1. **Missing API Key**: Ensure `BOLTIC_API_KEY` environment variable is set
2. **Table Creation Failed**: Check Boltic account permissions
3. **Connection Issues**: Verify network connectivity to Boltic API
4. **Validation Errors**: Check request body format and required fields

### Debug Mode

Enable debug mode by setting environment variable:

```bash
export DEBUG=true
```

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For issues related to:
- **Boltic SDK**: Check Boltic documentation
- **This Blueprint**: Open an issue in the repository
- **General Questions**: Check the FAQ or create a discussion 