ALTER TABLE "integration_connection" DROP CONSTRAINT "integration_connection_created_by_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "integration_connection" ALTER COLUMN "created_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;