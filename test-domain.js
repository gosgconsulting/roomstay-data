/**
 * [testing] Domain test server - Updated to allow all domains
 * This server tests domain accessibility without restrictions
 */

const { createServer } = require('http');

const PORT = process.env.PORT || 3000;

const server = createServer((req, res) => {
  console.log(`[testing] Request from host: ${req.headers.host}`);
  
  // Allow all hosts - no restrictions
  console.log(`[testing] ✅ All domains allowed - Host: ${req.headers.host}`);

  // Set CORS headers for all domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Respond with success
  res.writeHead(200);
  res.end(JSON.stringify({
    message: 'Domain test successful',
    host: req.headers.host,
    timestamp: new Date().toISOString(),
    status: 'All domains allowed'
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[testing] Server running at http://0.0.0.0:${PORT}/`);
  console.log('[testing] ✅ All domains are now allowed');
  console.log('[testing] No domain restrictions applied');
});
