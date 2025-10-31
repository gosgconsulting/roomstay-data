#!/usr/bin/env bun
import { createServer } from 'http';

// Create a simple HTTP server
const server = createServer((req, res) => {
  console.log(`[testing] Received request: ${req.method} ${req.url}`);
  console.log(`[testing] Headers: ${JSON.stringify(req.headers, null, 2)}`);
  
  // Log the host header
  console.log(`[testing] Host: ${req.headers.host}`);
  
  // Check if the host is allowed
  const allowedHosts = [
    'datagosgconsultingcom-production.up.railway.app',
    'localhost',
    '127.0.0.1',
    'localhost:3000',
    '127.0.0.1:3000'
  ];
  
  const host = req.headers.host?.split(':')[0];
  const isAllowed = host ? allowedHosts.includes(host) : false;
  
  console.log(`[testing] Host ${host} is ${isAllowed ? 'allowed' : 'not allowed'}`);
  
  // Send response
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Domain test server',
    host: req.headers.host,
    allowed: isAllowed,
    url: req.url
  }));
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[testing] Server running at http://0.0.0.0:${PORT}/`);
  console.log('[testing] Allowed hosts:', [
    'datagosgconsultingcom-production.up.railway.app',
    'localhost',
    '127.0.0.1'
  ]);
});
