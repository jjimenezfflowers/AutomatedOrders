# Troubleshooting Guide

## Error: "Element is not enabled" - Retrying click action

**Error message:** `element is not enabled` with continuous retries

This happens when an element is visible but disabled, usually because:
- JavaScript validation hasn't completed
- Required form fields aren't filled yet
- The page is still processing a previous action

**Common causes:**
1. **Add to Cart button** - Disabled until variant/options/date are selected
2. **Calendar day cells** - Disabled dates or calendar not fully loaded
3. **Checkout buttons** - Disabled until cart is ready

**Solutions:**
- The test now includes automatic retries with force click as fallback
- Increase `waitForTimeout` values if your network/server is slow
- Check browser console for JavaScript errors that might prevent elements from enabling
- Verify all required fields are being filled before clicking buttons

**Manual debugging:**
1. Run test in headed mode: `npx playwright test --headed`
2. Watch which element is stuck in disabled state
3. Check browser console for errors
4. Verify the element's `disabled` attribute in DevTools

## Error: Timeout waiting for quantity selector

**Error message:** `Timeout 5000ms exceeded` or `waiting for locator('#quantity-...') to be visible`

This happens when the quantity selector doesn't appear or the ID changes after variant/option selection.

**Solutions:**
- The test now includes automatic fallback to generic quantity selectors
- Increase timeout if your network is slow
- Update `products.json` with the correct `quantitySelector` ID after inspecting the page
- Use generic selectors like `select[id*="quantity"]` if IDs are dynamic

**To find the correct selector:**
1. Open the product page in a browser
2. Select the variant/options
3. Right-click the quantity dropdown → Inspect
4. Copy the `id` attribute and update `products.json`

## Error: "There was a problem with our checkout"

Este error puede ocurrir por varias razones:

### 1. Rate Limiting de Shopify
Shopify puede bloquear múltiples órdenes en poco tiempo desde la misma sesión.

**Solución:**
- Espera 5-10 minutos entre órdenes
- Usa diferentes navegadores o limpia cookies
- Contacta con Shopify para aumentar límites en dev/staging

### 2. Tarjeta de Prueba Inválida
Shopify puede rechazar algunas tarjetas de prueba.

**Solución:**
- Usa tarjetas de prueba válidas de Shopify:
  - `1` (Visa)
  - Cualquier fecha futura (ej: `12/26`)
  - Cualquier CVV de 3 dígitos (ej: `123`)

### 3. Problemas de Red/Timeout
El servidor puede estar temporalmente no disponible.

**Solución:**
- El test ahora reintenta automáticamente 1 vez
- Espera unos minutos y vuelve a intentar
- Verifica que el sitio esté disponible manualmente

### 4. Datos de Checkout Incompletos
Algún campo requerido puede estar faltando.

**Solución:**
- Verifica que todos los campos en `order-config.json` estén completos
- Asegúrate de que el código postal sea válido para el estado

## Debugging

Cuando falla un test, Playwright automáticamente guarda:

1. **Screenshot** en `test-results/`
2. **Video** en `test-results/`
3. **Trace** para análisis detallado

Para ver el trace:
```bash
npx playwright show-trace test-results/[carpeta-del-test]/trace.zip
```

Para ver el último reporte HTML:
```bash
npx playwright show-report
```

## Configuración Actual

- Timeout del test: 120 segundos
- Retries automáticos: 1
- Screenshots: Solo en fallo
- Videos: Solo en fallo
- SlowMo: 1 segundo entre acciones
