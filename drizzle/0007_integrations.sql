CREATE TYPE "public"."integration_kind" AS ENUM('webhook');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('slack', 'discord', 'msteams');--> statement-breakpoint
CREATE TABLE "calendar_feed_token" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_token_owner_unique" UNIQUE NULLS NOT DISTINCT("user_id","org_id"),
	CONSTRAINT "calendar_feed_token_owner_xor" CHECK (num_nonnulls("calendar_feed_token"."user_id", "calendar_feed_token"."org_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "integration_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"user_id" text,
	"provider" "integration_provider" NOT NULL,
	"kind" "integration_kind" DEFAULT 'webhook' NOT NULL,
	"webhook_url" text NOT NULL,
	"label" text,
	"created_by_id" text NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connection_owner_xor" CHECK (num_nonnulls("integration_connection"."org_id", "integration_connection"."user_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "calendar_feed_token" ADD CONSTRAINT "calendar_feed_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feed_token" ADD CONSTRAINT "calendar_feed_token_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_connection_org_idx" ON "integration_connection" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "integration_connection_user_idx" ON "integration_connection" USING btree ("user_id");