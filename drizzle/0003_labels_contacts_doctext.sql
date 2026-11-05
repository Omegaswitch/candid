CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_labels" (
	"project_id" uuid NOT NULL,
	"label_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "text_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_ws_name_uq" ON "labels" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "project_labels_pk" ON "project_labels" USING btree ("project_id","label_id");--> statement-breakpoint
CREATE INDEX "project_labels_label_idx" ON "project_labels" USING btree ("label_id");