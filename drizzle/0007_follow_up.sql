ALTER TABLE "projects" ADD COLUMN "follow_up_on" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "follow_up_note" text;--> statement-breakpoint
CREATE INDEX "projects_ws_follow_up_idx" ON "projects" USING btree ("workspace_id","follow_up_on") WHERE "projects"."follow_up_on" is not null;