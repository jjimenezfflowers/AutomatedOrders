const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory log storage (keep last 500 entries)
const logs = [];
const MAX_LOGS = 500;
// A Playwright run emits many lines within the same millisecond, so the ISO
// timestamp is not a usable identity for an entry. Each one gets its own id.
let nextLogId = 1;

function addLog(level, message, metadata = {}) {
  const logEntry = {
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };
  logs.push(logEntry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  
  // Also log to console
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`[${logEntry.timestamp}] ${prefix} ${message}`);
}

// The Logs tab polls /api/logs every 2s and health checks hit /api/health on their
// own schedule. Recording those requests let the log viewer flood the very ring
// buffer it displays: at 30 entries/min an idle open tab overwrote all MAX_LOGS
// entries in ~17 minutes, discarding the Playwright output the tab exists to show.
const LOG_EXCLUDED_PATHS = new Set(['/api/logs', '/api/health']);

function shouldLogRequest(requestPath) {
  return !LOG_EXCLUDED_PATHS.has(requestPath);
}

// Request logging middleware
app.use((req, res, next) => {
  if (!shouldLogRequest(req.path)) {
    return next();
  }

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  addLog('info', `${req.method} ${req.path}`, { 
    method: req.method, 
    path: req.path,
    ip: req.ip 
  });
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.static('angular-frontend/dist/angular-frontend/browser'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  console.log(`[HEALTH CHECK] Server is running. Uptime: ${Math.floor(uptime)}s`);
  res.json({ 
    status: 'ok', 
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const recentLogs = logs.slice(-limit);
  res.json({ logs: recentLogs, total: logs.length });
});

// Get products
app.get('/api/products', async (req, res) => {
  try {
    const data = await fs.readFile('products.json', 'utf8');
    addLog('info', 'Products retrieved successfully');
    res.json(JSON.parse(data));
  } catch (error) {
    addLog('error', `Failed to get products: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Save products
app.post('/api/products', async (req, res) => {
  const count = req.body.length;
  addLog('info', `Saving ${count} products`);
  try {
    await fs.writeFile('products.json', JSON.stringify(req.body, null, 2));
    addLog('info', 'Products saved successfully');
    res.json({ success: true });
  } catch (error) {
    addLog('error', `Failed to save products: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get staging products
app.get('/api/staging-products', async (req, res) => {
  try {
    const data = await fs.readFile('products-staging.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json([]);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Save staging products
app.post('/api/staging-products', async (req, res) => {
  try {
    await fs.writeFile('products-staging.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order config
app.get('/api/order-config', async (req, res) => {
  try {
    const data = await fs.readFile('order-config.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save order config
app.post('/api/order-config', async (req, res) => {
  try {
    await fs.writeFile('order-config.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get staging config
app.get('/api/staging-config', async (req, res) => {
  try {
    const data = await fs.readFile('staging-config.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ stagingBaseUrl: '' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Save staging config
app.post('/api/staging-config', async (req, res) => {
  try {
    await fs.writeFile('staging-config.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get staging order config
app.get('/api/staging-order-config', async (req, res) => {
  try {
    const data = await fs.readFile('order-config-staging.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ stagingBaseUrl: '', deliveryDate: '', orders: [] });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Save staging order config
app.post('/api/staging-order-config', async (req, res) => {
  try {
    await fs.writeFile('order-config-staging.json', JSON.stringify(req.body, null, 2));
    // Also sync stagingBaseUrl to staging-config.json for backward compat
    if (req.body.stagingBaseUrl !== undefined) {
      await fs.writeFile('staging-config.json', JSON.stringify({ stagingBaseUrl: req.body.stagingBaseUrl }, null, 2));
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order history
app.get('/api/order-history', async (req, res) => {
  try {
    const data = await fs.readFile('order-history.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json([]);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Run test
/**
 * The most recent entry in the order history, or null.
 *
 * Read after a run rather than parsed out of the test's stdout: the file is what
 * the run actually recorded, and stdout is prose that changes whenever a log line
 * is reworded.
 */
async function readLatestOrder() {
  const data = await fs.readFile(path.join(__dirname, 'order-history.json'), 'utf8');
  const history = JSON.parse(data);

  return history.length ? history[history.length - 1] : null;
}

app.post('/api/run-test', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 INICIANDO TEST DE PLAYWRIGHT');
  console.log('='.repeat(60) + '\n');
  addLog('info', '🧪 Starting Playwright test', { staging: req.body?.staging || false });

  // Resolve staging base URL if requested
  let stagingBaseUrl = '';
  let stagingConfigFile = '';
  if (req.body && req.body.staging) {
    try {
      const stagingOrderData = await fs.readFile('order-config-staging.json', 'utf8');
      const stagingOrderConfig = JSON.parse(stagingOrderData);
      stagingBaseUrl = stagingOrderConfig.stagingBaseUrl || '';
      stagingConfigFile = 'order-config-staging.json';
    } catch (e) {
      // fallback to staging-config.json for URL only
      try {
        const stagingData = await fs.readFile('staging-config.json', 'utf8');
        stagingBaseUrl = JSON.parse(stagingData).stagingBaseUrl || '';
      } catch (e2) {
        // ignore
      }
    }
  }

  try {
    // decide whether to launch headed or headless based on environment
    // Force headless on Linux (Docker) since there's no display server
    const headless = process.env.HEADLESS === 'true' || process.platform === 'linux';
    // construct base args
    const args = ['playwright', 'test', 'tests/place-order.spec.js', '--project=chromium', '--reporter=line'];
    if (!headless) {
      args.push('--headed');
    }

    // if headed mode on Linux (Docker), wrap with xvfb-run so Chrome can launch without real X
    let spawnCmd = 'npx';
    let spawnArgs = args;
    if (!headless && process.platform === 'linux') {
      // Xvfb is already running via start.sh, just set DISPLAY
      spawnArgs = args;
    }

    const testProcess = spawn(spawnCmd, spawnArgs, {
      cwd: __dirname,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        ...(stagingBaseUrl ? { STAGING_BASE_URL: stagingBaseUrl } : {}),
        ...(stagingConfigFile ? { STAGING_CONFIG: stagingConfigFile } : {})
      }
    });
    
    let output = '';
    let errorOutput = '';
    let responded = false;
    
    testProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('📝 OUTPUT:', text);
      // Log each line to the in-memory logs
      const lines = text.trim().split('\n').filter(line => line.trim());
      lines.forEach(line => addLog('info', `[TEST] ${line.trim()}`));
    });
    
    testProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('⚠️  ERROR:', text);
      // Log each error line to the in-memory logs
      const lines = text.trim().split('\n').filter(line => line.trim());
      lines.forEach(line => addLog('warn', `[TEST ERROR] ${line.trim()}`));
    });
    
    testProcess.on('close', (code) => {
      if (responded) return;
      responded = true;
      console.log('\n' + '='.repeat(60));
      console.log(`✅ Test finalizado con código: ${code}`);
      console.log('='.repeat(60) + '\n');
      
      if (code === 0) {
        addLog('info', `✅ Test completed successfully (exit code: ${code})`);
        /*
         * The run appends what it placed to the history file, so the newest entry
         * is this run's order. Returning it lets the page show what was actually
         * created instead of just "it worked".
         */
        readLatestOrder()
          .then((order) => res.json({ success: true, output, order }))
          .catch(() => res.json({ success: true, output, order: null }));
      } else {
        addLog('error', `❌ Test failed (exit code: ${code})`);
        res.json({ success: false, output: errorOutput || output });
      }
    });
    
    testProcess.on('error', (error) => {
      if (responded) return;
      responded = true;
      console.log('\n' + '='.repeat(60));
      console.log('❌ ERROR EN EL PROCESO:', error.message);
      console.log('='.repeat(60) + '\n');
      addLog('error', `Process error: ${error.message}`);
      res.json({ success: false, output: error.message });
    });
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ ERROR AL INICIAR TEST:', error.message);
    console.log('='.repeat(60) + '\n');
    addLog('error', `Failed to start test: ${error.message}`);
    res.json({ success: false, output: 'Error al iniciar test: ' + error.message });
  }
});

// Serve Angular app
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'angular-frontend/dist/angular-frontend/browser/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  // express.json() rejects a malformed body with a SyntaxError carrying status 400.
  // Reporting that as 500 tells the caller the server broke when in fact the request did.
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    addLog('warn', `Malformed JSON body on ${req.method} ${req.path}`);
    return res.status(400).json({ error: 'Malformed JSON body', message: err.message });
  }

  console.error('[ERROR]', err.stack);
  addLog('error', `Unhandled error on ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Guarded so tests can require this module without binding a port.
function start(port = PORT) {
  return app.listen(port, '0.0.0.0', function onListening() {
    const boundPort = this.address().port;
    const timestamp = new Date().toISOString();

    console.log('\n' + '='.repeat(50));
    console.log(`🚀 Server running at http://0.0.0.0:${boundPort}`);
    console.log(`   Local:   http://localhost:${boundPort}`);
    console.log(`   Port:    ${boundPort} (via ${process.env.PORT ? 'PORT env var' : 'default'})`);
    console.log(`   Started: ${timestamp}`);
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Node: ${process.version}`);
    console.log(`   PID: ${process.pid}`);
    console.log('='.repeat(50));
    console.log('📊 Server is ready to accept connections');
    console.log('💡 Use /api/health endpoint to check server status');
    console.log('='.repeat(50) + '\n');

    addLog('info', `🚀 Server started on port ${boundPort}`, {
      port: boundPort,
      platform: process.platform,
      nodeVersion: process.version,
    });
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, start, shouldLogRequest, LOG_EXCLUDED_PATHS };
