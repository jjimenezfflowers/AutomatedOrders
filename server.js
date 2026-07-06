const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static('angular-frontend/dist/angular-frontend/browser'));

// Get products
app.get('/api/products', async (req, res) => {
  try {
    const data = await fs.readFile('products.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save products
app.post('/api/products', async (req, res) => {
  console.log('Received products:', req.body); // Debug
  try {
    await fs.writeFile('products.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
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
app.post('/api/run-test', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 INICIANDO TEST DE PLAYWRIGHT');
  console.log('='.repeat(60) + '\n');

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
    });
    
    testProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('⚠️  ERROR:', text);
    });
    
    testProcess.on('close', (code) => {
      if (responded) return;
      responded = true;
      console.log('\n' + '='.repeat(60));
      console.log(`✅ Test finalizado con código: ${code}`);
      console.log('='.repeat(60) + '\n');
      
      if (code === 0) {
        res.json({ success: true, output: output });
      } else {
        res.json({ success: false, output: errorOutput || output });
      }
    });
    
    testProcess.on('error', (error) => {
      if (responded) return;
      responded = true;
      console.log('\n' + '='.repeat(60));
      console.log('❌ ERROR EN EL PROCESO:', error.message);
      console.log('='.repeat(60) + '\n');
      res.json({ success: false, output: error.message });
    });
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ ERROR AL INICIAR TEST:', error.message);
    console.log('='.repeat(60) + '\n');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Port:    ${PORT} (via ${process.env.PORT ? 'PORT env var' : 'default'})`);
  console.log('='.repeat(50));
});
