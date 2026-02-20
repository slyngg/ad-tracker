#!/usr/bin/env node

// OpticData — GitHub Webhook Listener
// Lightweight HTTP server that receives GitHub push events
// and triggers the deploy script.
//
// Usage: WEBHOOK_SECRET=your-secret node webhook-listener.js
// Runs on port 9000 by default (WEBHOOK_PORT env to override)

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');

const PORT = parseInt(process.env.WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh');
const BRANCH = 'refs/heads/main';

if (!SECRET) {
  console.error('[webhook] WEBHOOK_SECRET env var is required');
  process.exit(1);
}

let deploying = false;

function verifySignature(payload, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const digest = 'sha256=' + hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', deploying }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    // Verify GitHub signature
    const signature = req.headers['x-hub-signature-256'];
    if (!verifySignature(body, signature)) {
      console.log('[webhook] Invalid signature, rejecting');
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    // Only deploy on push to main
    if (payload.ref !== BRANCH) {
      console.log(`[webhook] Push to ${payload.ref}, ignoring (only ${BRANCH} triggers deploy)`);
      res.writeHead(200);
      res.end('OK (ignored branch)');
      return;
    }

    // Prevent concurrent deploys
    if (deploying) {
      console.log('[webhook] Deploy already in progress, skipping');
      res.writeHead(200);
      res.end('OK (deploy in progress)');
      return;
    }

    console.log(`[webhook] Push to main by ${payload.pusher?.name || 'unknown'}: ${payload.head_commit?.message || ''}`);
    res.writeHead(200);
    res.end('OK (deploying)');

    // Run deploy script
    deploying = true;
    console.log('[webhook] Starting deploy...');
    execFile('/bin/bash', [DEPLOY_SCRIPT], { timeout: 600000 }, (err, stdout, stderr) => {
      deploying = false;
      if (err) {
        console.error('[webhook] Deploy failed:', err.message);
        if (stderr) console.error('[webhook] stderr:', stderr);
      } else {
        console.log('[webhook] Deploy succeeded');
      }
      if (stdout) console.log(stdout);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[webhook] Listening on 0.0.0.0:${PORT}`);
  console.log(`[webhook] POST /webhook — GitHub push events`);
  console.log(`[webhook] GET  /health  — Health check`);
});
