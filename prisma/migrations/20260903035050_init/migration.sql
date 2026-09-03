-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "variantSelector" TEXT,
    "defaultVariant" TEXT,
    "quantitySelector" TEXT,
    "defaultQuantity" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductOrigin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductOrigin_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "defaultValue" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductOptionChoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "optionId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "price" REAL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductOptionChoice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderDraft" (
    "environment" TEXT NOT NULL PRIMARY KEY,
    "deliveryDate" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderDraftItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "environment" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "variant" TEXT,
    "deliveryDate" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderDraftItem_environment_fkey" FOREIGN KEY ("environment") REFERENCES "OrderDraft" ("environment") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderDraftItemOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderDraftItemId" INTEGER NOT NULL,
    "optionExternalId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "OrderDraftItemOption_orderDraftItemId_fkey" FOREIGN KEY ("orderDraftItemId") REFERENCES "OrderDraftItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "cardNumber" TEXT NOT NULL,
    "cvv" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "placedAt" DATETIME NOT NULL,
    "environment" TEXT,
    "orderNumber" TEXT,
    "confirmationNumber" TEXT,
    "orderId" TEXT,
    "adminUrl" TEXT,
    "statusUrl" TEXT,
    "correlationId" TEXT,
    "matchedBy" TEXT,
    "source" TEXT,
    "customerEmail" TEXT,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "destination" TEXT,
    "shippingMethod" TEXT,
    "subtotal" TEXT,
    "shipping" TEXT,
    "tax" TEXT,
    "discounts" TEXT,
    "total" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderRunRequestedItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderRunId" INTEGER NOT NULL,
    "productSlug" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "variant" TEXT,
    "deliveryDate" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderRunRequestedItem_orderRunId_fkey" FOREIGN KEY ("orderRunId") REFERENCES "OrderRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderRunRequestedItemOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestedItemId" INTEGER NOT NULL,
    "optionExternalId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "OrderRunRequestedItemOption_requestedItemId_fkey" FOREIGN KEY ("requestedItemId") REFERENCES "OrderRunRequestedItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderRunLineItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderRunId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "variant" TEXT,
    "sku" TEXT,
    "unitPrice" TEXT,
    "image" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderRunLineItem_orderRunId_fkey" FOREIGN KEY ("orderRunId") REFERENCES "OrderRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderRunTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderRunId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderRunTag_orderRunId_fkey" FOREIGN KEY ("orderRunId") REFERENCES "OrderRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Product_environment_position_idx" ON "Product"("environment", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Product_environment_slug_key" ON "Product"("environment", "slug");

-- CreateIndex
CREATE INDEX "ProductOrigin_productId_position_idx" ON "ProductOrigin"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOrigin_productId_value_key" ON "ProductOrigin"("productId", "value");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_position_idx" ON "ProductVariant"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_value_key" ON "ProductVariant"("productId", "value");

-- CreateIndex
CREATE INDEX "ProductOption_productId_position_idx" ON "ProductOption"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_externalId_key" ON "ProductOption"("productId", "externalId");

-- CreateIndex
CREATE INDEX "ProductOptionChoice_optionId_position_idx" ON "ProductOptionChoice"("optionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionChoice_optionId_value_key" ON "ProductOptionChoice"("optionId", "value");

-- CreateIndex
CREATE INDEX "OrderDraftItem_environment_position_idx" ON "OrderDraftItem"("environment", "position");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDraftItemOption_orderDraftItemId_optionExternalId_key" ON "OrderDraftItemOption"("orderDraftItemId", "optionExternalId");

-- CreateIndex
CREATE INDEX "OrderRun_placedAt_idx" ON "OrderRun"("placedAt");

-- CreateIndex
CREATE INDEX "OrderRun_environment_idx" ON "OrderRun"("environment");

-- CreateIndex
CREATE INDEX "OrderRun_orderNumber_idx" ON "OrderRun"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderRunRequestedItem_orderRunId_position_idx" ON "OrderRunRequestedItem"("orderRunId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRunRequestedItemOption_requestedItemId_optionExternalId_key" ON "OrderRunRequestedItemOption"("requestedItemId", "optionExternalId");

-- CreateIndex
CREATE INDEX "OrderRunLineItem_orderRunId_position_idx" ON "OrderRunLineItem"("orderRunId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRunTag_orderRunId_value_key" ON "OrderRunTag"("orderRunId", "value");
