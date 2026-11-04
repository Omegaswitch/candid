CREATE TYPE "public"."connection_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('file', 'link');--> statement-breakpoint
CREATE TYPE "public"."favorite_kind" AS ENUM('project', 'document');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'invited', 'removed');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'waiting', 'completed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"project_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" "document_kind" NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" integer,
	"uploaded_at" timestamp with time zone,
	"position" double precision DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"kind" "favorite_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"membership_id" uuid,
	"idempotency_key" text NOT NULL,
	"source" text NOT NULL,
	"mode" text NOT NULL,
	"status" "import_status" DEFAULT 'running' NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_email" text,
	"scopes" text DEFAULT '' NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"status" "member_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client" text,
	"owner_id" uuid,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"due_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"notes_version" integer DEFAULT 1 NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"assignee_id" uuid,
	"due_date" date,
	"note" text DEFAULT '' NOT NULL,
	"waiting" boolean DEFAULT false NOT NULL,
	"waiting_reason" text,
	"position" double precision DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_memberships_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_memberships_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_archived_by_memberships_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_memberships_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_memberships_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_tasks" ADD CONSTRAINT "template_tasks_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_ws_created_idx" ON "activity_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_project_created_idx" ON "activity_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_ws_pos_idx" ON "documents" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_uq" ON "documents" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_member_entity_uq" ON "favorites" USING btree ("membership_id","kind","entity_id");--> statement-breakpoint
CREATE INDEX "favorites_ws_entity_idx" ON "favorites" USING btree ("workspace_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_runs_ws_key_uq" ON "import_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_member_provider_uq" ON "integration_connections" USING btree ("membership_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_ws_user_uq" ON "memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_ws_email_uq" ON "memberships" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_ws_name_uq" ON "project_templates" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "projects_ws_archived_pos_idx" ON "projects" USING btree ("workspace_id","archived_at","position");--> statement-breakpoint
CREATE INDEX "projects_ws_status_idx" ON "projects" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "projects_ws_due_idx" ON "projects" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "projects_ws_owner_idx" ON "projects" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE INDEX "tasks_project_pos_idx" ON "tasks" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "tasks_ws_assignee_idx" ON "tasks" USING btree ("workspace_id","assignee_id","done");--> statement-breakpoint
CREATE INDEX "tasks_ws_due_idx" ON "tasks" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_ws_waiting_idx" ON "tasks" USING btree ("workspace_id") WHERE "tasks"."waiting" and not "tasks"."done";--> statement-breakpoint
CREATE INDEX "template_tasks_tpl_pos_idx" ON "template_tasks" USING btree ("template_id","position");