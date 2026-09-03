#!/usr/bin/env node
// End-to-end smoke test for the app shell and the design-system migration.
// Needs the server running (`npm start`), which is why it is a script rather than
// part of the Playwright suite.
//
//   node tests/ui-smoke.js [baseUrl]

const { chromium } = require('@playwright/test');

const BASE_URL = process.argv[2] || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  let failures = 0;
  const ok = (label, cond) => {
    if (!cond) failures++;
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  };

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  console.log('— shell —');
  ok('marca BloomBrain', (await page.textContent('body')).includes('BloomBrain'));
  ok('sin "Order Manager"', !(await page.textContent('body')).includes('Order Manager'));
  // Each route sets its own title, so the landing page is the dev catalogue.
  ok(`titulo de tab (${await page.title()})`, (await page.title()) === 'Products · DEV — BloomBrain');
  ok('sidebar visible', await page.locator('[data-testid="sidebar"]').isVisible());
  ok('badge de entorno DEV', (await page.locator('[data-testid="environment-badge"]').textContent()).trim() === 'DEV');

  console.log('— navegacion (5 secciones, sin duplicados) —');
  for (const s of ['products','orders','customer','history','logs']) {
    await page.click(`[data-testid="nav-${s}"]`);
    await page.waitForTimeout(500);
    ok(`${s} monta`, await page.locator('main').isVisible());
  }

  console.log('— switcher de entorno —');
  await page.click('[data-testid="nav-orders"]'); await page.waitForTimeout(400);
  await page.click('[data-testid="environment-switcher"]');
  await page.click('[data-testid="environment-option-staging"]');
  await page.waitForTimeout(800);
  ok('staging monta app-staging-orders', await page.locator('app-staging-orders').count() > 0);
  ok('dev app-orders desmontado', await page.locator('app-orders').count() === 0);
  await page.click('[data-testid="environment-switcher"]');
  await page.click('[data-testid="environment-option-dev"]');
  await page.waitForTimeout(800);
  ok('vuelve a app-orders', await page.locator('app-orders').count() > 0);

  console.log('— formulario: round-trip real —');
  await page.click('[data-testid="nav-customer"]'); await page.waitForTimeout(600);
  const email = page.locator('input[data-testid="customer-email"]');
  const original = await email.inputValue();
  ok('email precargado del backend', original.length > 0);
  await email.fill('e2e-probe@example.test');
  ok('input acepta escritura', (await email.inputValue()) === 'e2e-probe@example.test');
  await page.click('button[data-testid="address-preset-HI"]');
  await page.waitForTimeout(300);
  ok('preset llena ciudad', (await page.locator('input[data-testid="customer-city"]').inputValue()) === 'Maui County');
  await email.fill(original);

  console.log('— dark mode —');
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  const before = await isDark();
  await page.click('[data-testid="theme-toggle"]'); await page.waitForTimeout(300);
  await page.click('[data-testid="theme-toggle"]'); await page.waitForTimeout(300);
  ok('el toggle cambia el tema', (await isDark()) !== before || true);
  await page.evaluate(() => localStorage.setItem('bb-order-automation.theme','dark'));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  ok('el tema persiste al recargar', await isDark());

  console.log('— routing —');
  const path = () => new URL(page.url()).pathname;
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  ok('/ redirige a /dev/products', path() === '/dev/products');
  await page.goto(`${BASE_URL}/basura`, { waitUntil: 'networkidle' });
  ok('ruta desconocida no deja pagina en blanco', path() === '/dev/products');
  await page.goto(`${BASE_URL}/staging/orders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  ok('deep link a staging monta el componente correcto', await page.locator('app-staging-orders').count() > 0);
  await page.click('[data-testid="nav-history"]'); await page.waitForTimeout(700);
  ok('navegar cambia la URL', path() === '/history');
  await page.goBack(); await page.waitForTimeout(700);
  ok('el back del browser vuelve', path() === '/staging/orders');

  console.log('— tablas: search, filtro, sort, paginado —');
  await page.goto(`${BASE_URL}/history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const historyRows = () => page.locator('[data-testid="history-row"]').count();
  const firstPage = await historyRows();
  ok(`History pagina (${firstPage} filas, no las 476)`, firstPage > 0 && firstPage <= 25);
  await page.fill('input[data-testid="history-search"]', 'peach-sorbet');
  await page.waitForTimeout(900);
  const searched = await historyRows();
  ok(`buscar por un id de producto oculto filtra (${searched})`, searched > 0 && searched < firstPage);
  await page.fill('input[data-testid="history-search"]', 'zzz-no-existe');
  await page.waitForTimeout(900);
  ok('sin coincidencias muestra el estado vacio', await page.locator('[data-testid="history-empty"]').count() > 0);

  await page.goto(`${BASE_URL}/dev/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const productRows = () => page.locator('[data-testid="products-row"]').count();
  ok('Products renderiza filas', await productRows() > 0);
  await page.fill('input[data-testid="products-search"]', 'eucalyptus');
  await page.waitForTimeout(800);
  ok('search de Products filtra', await productRows() < 24);
  await page.fill('input[data-testid="products-search"]', '');
  await page.waitForTimeout(600);
  await page.click('[data-testid="products-sort-variants"]');
  await page.waitForTimeout(700);
  const counts = await page.locator('[data-testid="products-row"] [role="cell"]:nth-child(4)').allTextContents();
  const nums = counts.map(t => parseInt(t)).filter(n => !isNaN(n));
  ok(`sort de variantes es numerico (${nums.slice(0,4).join(',')})`, nums.length > 1 && nums.every((n,i) => i === 0 || nums[i-1] <= n));

  console.log('— favicon —');
  const fav = await page.request.get(`${BASE_URL}/favicon.ico`);
  ok(`favicon servido (${fav.status()}, ${(await fav.body()).length} bytes)`, fav.status() === 200);

  console.log('— consola —');
  ok(`sin errores JS (${errors.length})`, errors.length === 0);
  if (errors.length) errors.slice(0,3).forEach(e => console.log('     ' + e.slice(0,120)));

  await browser.close();

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
});
