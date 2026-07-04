CREATE TABLE "team_digest_config" (
	"org_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"weekday" integer NOT NULL,
	"hour" integer NOT NULL,
	"timezone" text NOT NULL,
	"post_when_empty" boolean DEFAULT false NOT NULL,
	"last_sent_week_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_digest_config_weekday_range" CHECK ("team_digest_config"."weekday" between 1 and 7),
	CONSTRAINT "team_digest_config_hour_range" CHECK ("team_digest_config"."hour" between 0 and 23)
);
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD COLUMN "notify_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "team_digest_config" ADD CONSTRAINT "team_digest_config_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;