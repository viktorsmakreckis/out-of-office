CREATE TYPE "public"."notification_type" AS ENUM('team_invite', 'calendar_shared', 'event_created', 'event_updated');--> statement-breakpoint
CREATE TABLE "calendar_share" (
	"id" text PRIMARY KEY NOT NULL,
	"sharer_user_id" text,
	"sharer_org_id" text,
	"target_user_id" text,
	"target_org_id" text,
	"target_email" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_share_unique" UNIQUE NULLS NOT DISTINCT("sharer_user_id","sharer_org_id","target_user_id","target_org_id","target_email"),
	CONSTRAINT "calendar_share_sharer_xor" CHECK (num_nonnulls("calendar_share"."sharer_user_id", "calendar_share"."sharer_org_id") = 1),
	CONSTRAINT "calendar_share_target_xor" CHECK (num_nonnulls("calendar_share"."target_user_id", "calendar_share"."target_org_id", "calendar_share"."target_email") = 1)
);
--> statement-breakpoint
CREATE TABLE "calendar_share_hide" (
	"user_id" text NOT NULL,
	"share_id" text NOT NULL,
	CONSTRAINT "calendar_share_hide_user_id_share_id_pk" PRIMARY KEY("user_id","share_id")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"actor_name" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_share" ADD CONSTRAINT "calendar_share_sharer_user_id_user_id_fk" FOREIGN KEY ("sharer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_share" ADD CONSTRAINT "calendar_share_sharer_org_id_organization_id_fk" FOREIGN KEY ("sharer_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_share" ADD CONSTRAINT "calendar_share_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_share" ADD CONSTRAINT "calendar_share_target_org_id_organization_id_fk" FOREIGN KEY ("target_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_share" ADD CONSTRAINT "calendar_share_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_share_hide" ADD CONSTRAINT "calendar_share_hide_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_share_hide" ADD CONSTRAINT "calendar_share_hide_share_id_calendar_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."calendar_share"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_share_target_user_idx" ON "calendar_share" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "calendar_share_target_org_idx" ON "calendar_share" USING btree ("target_org_id");--> statement-breakpoint
CREATE INDEX "calendar_share_sharer_user_idx" ON "calendar_share" USING btree ("sharer_user_id");--> statement-breakpoint
CREATE INDEX "calendar_share_sharer_org_idx" ON "calendar_share" USING btree ("sharer_org_id");--> statement-breakpoint
CREATE INDEX "calendar_share_target_email_idx" ON "calendar_share" USING btree ("target_email");--> statement-breakpoint
CREATE INDEX "notification_user_id_idx" ON "notification" USING btree ("user_id","created_at");