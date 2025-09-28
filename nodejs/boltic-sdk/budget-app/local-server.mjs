#!/usr/bin/env node

import { startLocalServer } from './handler.js';

const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Boltic Micro Budget Planner locally...');

if (!process.env.BOLTIC_API_KEY) {
  console.error('❌ BOLTIC_API_KEY environment variable is required');
  process.exit(1);
}

process.env.LOCAL_TEST = process.env.LOCAL_TEST || '1';

startLocalServer()
  .then(() => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log('💡 Use the form to add income or expense items and see the live summary.');
    console.log('🛑 Press Ctrl+C to stop the server.');
  })
  .catch((error) => {
    console.error('❌ Failed to start local server:', error);
    process.exit(1);
  });
