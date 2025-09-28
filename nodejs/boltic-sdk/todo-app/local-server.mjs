#!/usr/bin/env node

import { startLocalServer } from './handler.js';

const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Boltic Todo App locally...');

if (!process.env.BOLTIC_API_KEY) {
  console.error('❌ BOLTIC_API_KEY environment variable is required');
  process.exit(1);
}

process.env.LOCAL_TEST = process.env.LOCAL_TEST || '1';

startLocalServer()
  .then(() => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log('💡 Open the URL in your browser to manage todos and use /api/todos for programmatic access.');
    console.log('🛑 Press Ctrl+C to stop the server.');
  })
  .catch((error) => {
    console.error('❌ Failed to start local server:', error);
    process.exit(1);
  });
