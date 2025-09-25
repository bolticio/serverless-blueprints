#!/usr/bin/env node

import http from 'http';
import { handler } from './handler.js';

const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Boltic SDK Products API server locally...\n');

// Validate environment
if (!process.env.BOLTIC_API_KEY) {
  console.error('❌ BOLTIC_API_KEY environment variable is required');
  process.exit(1);
}

console.log('✅ Environment validated');
console.log('🔑 Using API key:', process.env.BOLTIC_API_KEY.substring(0, 8) + '...');

// Create HTTP server that uses our serverless handler
const server = http.createServer(async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.url}`);
  
  try {
    // Call our serverless handler
    await handler(req, res);
  } catch (error) {
    console.error('Server error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log('\n🏪 Available endpoints:');
  console.log(`   POST   http://localhost:${PORT}/setup`);
  console.log(`   GET    http://localhost:${PORT}/products`);
  console.log(`   GET    http://localhost:${PORT}/products/:id`);
  console.log(`   POST   http://localhost:${PORT}/products`);
  console.log(`   PATCH  http://localhost:${PORT}/products/:id`);
  console.log(`   DELETE http://localhost:${PORT}/products/:id`);
  console.log('\n💡 Quick tests:');
  console.log(`   curl -X POST http://localhost:${PORT}/setup`);
  console.log(`   curl http://localhost:${PORT}/products`);
  console.log(`   curl -X POST http://localhost:${PORT}/products -H "Content-Type: application/json" -d '{"name":"Laptop","price":999.99,"category":"Electronics","stock":10}'`);
  console.log(`   curl "http://localhost:${PORT}/products?category=Electronics&active=true"`);
  console.log('\n🛑 Press Ctrl+C to stop the server\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 