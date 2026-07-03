CREATE TABLE "notification_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ooo_in_app" boolean DEFAULT true NOT NULL,
	"ooo_email" boolean DEFAULT true NOT NULL,
	"shared_in_app" boolean DEFAULT true NOT NULL,
	"shared_email" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD COLUMN "notify_ooo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;