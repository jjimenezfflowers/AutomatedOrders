-- Keep the checkout's numeric Shopify order alongside the BB order id.
ALTER TABLE "OrderRun" ADD COLUMN "shopifyOrderNumber" TEXT;
