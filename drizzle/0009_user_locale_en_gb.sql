ALTER TABLE "user" ALTER COLUMN "locale" SET DEFAULT 'en-GB';--> statement-breakpoint
-- Migrate existing rows from the retired 'en' locale to the new default 'en-GB'.
UPDATE "user" SET "locale" = 'en-GB' WHERE "locale" = 'en';
