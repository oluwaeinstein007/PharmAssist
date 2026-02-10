#!/usr/bin/env node
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './server.js';

// Bun runtime type declarations (only used when running under Bun)
declare const Bun: {
  version: string;
  serve(options: { port: number; hostname: string; fetch: any }): { port: number };
} | undefined;

const app = createApp();

const port = parseInt(process.env.API_PORT || '5000', 10);
const host = process.env.API_HOST || '0.0.0.0';

console.log('╔══════════════════════════════════════════════════╗');
console.log('║          PharmAssist Unified API Server          ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

// Detect runtime
const isBun = typeof Bun !== 'undefined';
const runtime = isBun ? 'Bun' : 'Node.js';

if (isBun && Bun) {
  // Bun native serve — higher performance, no @hono/node-server overhead
  const server = Bun.serve({
    port,
    hostname: host,
    fetch: app.fetch,
  });
  console.log(`🚀 Running on ${runtime} ${Bun.version}`);
  console.log(`📡 API server listening on http://${host}:${server.port}`);
} else {
  // Node.js via @hono/node-server
  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`🚀 Running on ${runtime} ${process.version}`);
    console.log(`📡 API server listening on http://${host}:${info.port}`);
  });
}

console.log('');
console.log('Endpoints:');
console.log(`  Health:        GET  /api/v1/health`);
console.log(`  Chat:          POST /api/v1/chat`);
console.log(`  Chat Stream:   POST /api/v1/chat/stream`);
console.log(`  Search:        GET  /api/v1/search?q=...`);
console.log(`  Batch Search:  POST /api/v1/search/batch`);
console.log(`  Stock:         GET  /api/v1/stock/:barcode`);
console.log(`  Cart:          POST /api/v1/cart`);
console.log(`  Alternatives:  GET  /api/v1/alternatives/:medicineId`);
console.log(`  Medicine:      GET  /api/v1/medicine/:id`);
console.log('');
console.log(`Auth: ${process.env.AUTH_ENABLED !== 'false' ? 'ENABLED' : 'DISABLED (dev mode)'}`);
console.log('');
