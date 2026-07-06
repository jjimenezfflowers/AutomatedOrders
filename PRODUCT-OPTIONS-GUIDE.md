# Product Options Guide

## Nuevo Tipo de Producto: Product Options

Hemos implementado soporte para productos con múltiples opciones personalizables (dropdowns).

### Producto Ejemplo: Wedding Flower Kit

**URL**: https://bloom-brain-dev.myshopify.com/products/200-roses-and-300-carnations-diy-wedding-flower-kit

Este producto tiene 5 opciones configurables:
1. Choose 5 Soft Greenery Bunches
2. Choose 5 Hearty Greenery Bunches  
3. Choose 300 Carnations Color
4. Choose 10 Filler Flower Bunches
5. Choose 100 Rose Color

### Estructura en products.json

```json
{
  "id": "wedding-flower-kit",
  "name": "200 Roses and 300 Carnations DIY Wedding Flower Kit",
  "url": "https://bloom-brain-dev.myshopify.com/products/...",
  "type": "product-options",
  "variantSelector": "#option-0",
  "variants": ["Wedding Combo Box"],
  "defaultVariant": "Wedding Combo Box",
  "productOptions": [
    {
      "id": "vo_0_1381",
      "label": "Choose 5 Soft Greenery Bunches",
      "selector": "select[name='vo_0_1381']",
      "options": [
        "Bear Grass 40 shoots per Bunch",
        "Horsetail 10 Stem Bunches",
        ...
      ],
      "defaultValue": "Bear Grass 40 shoots per Bunch"
    },
    ...
  ],
  "quantitySelector": "#quantity-8173251297420-2",
  "defaultQuantity": 1
}
```

### Estructura en order-config.json

```json
{
  "orders": [
    {
      "productId": "wedding-flower-kit",
      "quantity": 1,
      "variant": "Wedding Combo Box",
      "productOptions": {
        "vo_0_1381": "Bear Grass 40 shoots per Bunch",
        "vo_1_1382": "Aspidistras Green 5-8 Stem Bunches",
        "vo_2_1383": "White",
        "vo_3_1384": "White Spray Roses 8 Stem Bunches",
        "vo_4_1385": "White"
      }
    }
  ]
}
```

### Cómo Funciona en Playwright

1. El test detecta productos con `type: "product-options"`
2. Configura cada opción usando los selectores definidos
3. Espera 2 segundos para que la página actualice
4. Continúa con la selección de fecha y cantidad

### Cómo se Ve en Angular

En el frontend Angular:
- **Products Tab**: Muestra un dropdown "Type" para seleccionar "Product with Options"
- **Orders Tab**: Muestra todas las opciones con sus dropdowns cuando seleccionas un producto de tipo "product-options"
- Los valores se guardan en order-config.json con la estructura correcta

### Ejemplo de Test

Copia `order-config-example-with-options.json` a `order-config.json` para probar:

```bash
cp order-config-example-with-options.json order-config.json
npx playwright test tests/place-order.spec.js --headed
```

### Diferencias con Productos Simples

| Feature | Producto Simple | Producto con Options |
|---------|----------------|---------------------|
| Type | (vacío) | "product-options" |
| Variants | Lista simple | Lista simple + productOptions |
| Order Config | Solo variant | variant + productOptions object |
| UI Angular | Dropdown simple | Múltiples dropdowns |
| Playwright | 1 select | Múltiples selects + espera |

### Agregar Más Opciones

Para agregar más opciones de producto, edita `products.json` y agrega más objetos al array `productOptions`:

```json
{
  "id": "nuevo_id",
  "label": "Label que se muestra",
  "selector": "select[name='nuevo_id']",
  "options": ["Opción 1", "Opción 2", ...],
  "defaultValue": "Opción 1"
}
```

El ID debe coincidir con el `name` del select en la página de Shopify.
