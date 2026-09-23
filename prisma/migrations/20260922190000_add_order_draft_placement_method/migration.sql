-- Keep the user's storefront/BB choice with each environment's draft.
ALTER TABLE "OrderDraft" ADD COLUMN "placementMethod" TEXT NOT NULL DEFAULT 'storefront';
