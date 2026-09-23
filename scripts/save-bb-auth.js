const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const environment = process.env.RUN_ENVIRONMENT === 'dev' ? 'dev' : 'staging';
const baseUrl = process.env.BB_BASE_URL || `https://bloom-brain-${environment === 'staging' ? 'stage' : 'dev'}.fiftyflowers.com`;
const statePath = path.join(__dirname, '..', 'tests', '.auth', `bb-${environment}.json`);
const profilePath = path.join(__dirname, '..', 'tests', '.auth', `bb-${environment}-profile`);
const projectRoot = path.join(__dirname, '..');

fs.mkdirSync(profilePath, { recursive: true });

console.log(`Opening ${baseUrl}. Sign in to BB, then close the browser and Playwright Inspector.`);
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'playwright',
    'codegen',
    '--channel=chrome',
    `--save-storage=${statePath}`,
    `--user-data-dir=${profilePath}`,
    `${baseUrl}/v2/order-manager/draft-orders`,
  ],
  { cwd: projectRoot, stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.status === 0 && fs.existsSync(statePath)) {
  console.log(`BB ${environment} session saved to ${statePath}`);
} else {
  process.exitCode = result.status || 1;
}
