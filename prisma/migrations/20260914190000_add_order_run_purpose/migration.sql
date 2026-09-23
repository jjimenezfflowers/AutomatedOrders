-- Preserve the optional draft purpose on the completed run history.
ALTER TABLE "OrderRun" ADD COLUMN "purpose" TEXT;
