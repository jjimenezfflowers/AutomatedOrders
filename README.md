# 🌸 Order Manager - Playwright Automation

Sistema de automatización de órdenes con interfaz web usando Playwright, Node.js y Tailwind CSS.

## 🚀 Inicio Rápido

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Instalar navegadores de Playwright:**
   ```bash
   npx playwright install
   ```

3. **Iniciar la aplicación:**
   ```bash
   npm start
   ```

4. **Abrir en el navegador:**
   ```
   http://localhost:3000
   ```

## 📋 Características

- ✅ Gestión de productos con URLs y selectores
- ✅ Creación de órdenes con múltiples productos
- ✅ Información de cliente y pago guardada
- ✅ Ejecución automática de tests con Playwright
- ✅ Interfaz moderna con Tailwind CSS

## 📁 Estructura

```
PlayWright Order/
├── server.js              # Servidor Express
├── public/
│   ├── index.html         # Interfaz principal
│   └── app.js            # Lógica del frontend
├── tests/
│   ├── checkout.spec.js   # Test original
│   └── place-order.spec.js # Test con configuración
├── products.json          # Catálogo de productos
└── order-config.json      # Configuración de órdenes
```

## 🎯 Uso

### 1. Agregar Productos
- Ve a la pestaña **Products**
- Clic en **+ Add Product**
- Completa: ID, nombre, URL, selector de cantidad
- Clic en **Save Products**

### 2. Configurar Cliente
- Ve a la pestaña **Customer Info**
- Completa información del cliente y pago
- Clic en **Save Customer Info**

### 3. Crear Orden
- Ve a la pestaña **Orders**
- Selecciona fecha de entrega
- Clic en **+ Add Product** para agregar productos
- Selecciona producto y cantidad
- Clic en **Save Order**
- Clic en **🚀 Place Order** para ejecutar

## 🧪 Tests

Ejecutar test manualmente:
```bash
npx playwright test tests/place-order.spec.js --headed
```

Ejecutar la regresión segura de variantes/cantidad:
```bash
npm run test:product-form
```

Ejecutar el proceso de Peach Sorbet con su propia orden:
```bash
npm run test:peach-sorbet -- --headed
```

Ver reporte de errores:
```bash
npx playwright show-report
```

## 🐛 Troubleshooting

Si el test falla, revisa:
- Screenshots en `test-results/`
- Videos en `test-results/`
- Trace files para análisis detallado

Ver la guía completa: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

Errores comunes:
- **"There was a problem with our checkout"** - Rate limiting de Shopify, espera unos minutos
- **Timeout** - Aumenta el timeout en `playwright.config.js`
- **Selectores no encontrados** - Shopify cambió el HTML, actualiza los selectores

## 🔧 Configuración

Los archivos JSON se editan automáticamente desde la interfaz web, pero también puedes editarlos manualmente:

- `products.json` - Lista de productos
- `order-config.json` - Configuración de órdenes y cliente

## 📝 Notas

- El servidor corre en puerto 3000
- Los tests se ejecutan en modo headed (navegador visible)
- La información de pago es solo para pruebas (usar tarjetas de prueba)
