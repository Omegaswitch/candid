import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// All timestamps are timestamptz (UTC in the DB, shown in the viewer's timezone).
// Deadlines are `date` columns read as "YYYY-MM-DD" strings so they never shift across timezones.
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();
const day = (name: string) => date(name, { mode: "string" });

export const roleEnum = pgEnum("member_role", ["admin", "member"]);
export const memberStatusEnum = pgEnum("member_status", ["active", "invited", "removed"]);
export const projectStatusEnum = pgEnum("project_status", ["active", "waiting", "completed"]);
export const priorityEnum = pgEnum("priority", ["normal", "high"]);
export const documentKindEnum = pgEnum("document_kind", ["file", "link"]);
export const favoriteKindEnum = pgEnum("favorite_kind", ["project", "document"]);
export const importStatusEnum = pgEnum("import_status", ["running", "completed", "failed"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "revoked"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: created(),
  updatedAt: updated(),
});

// A person's seat in a workspace. `userId` is the auth provider's user id (Clerk `user_…`);
// it is null for an invite that has not been accepted yet, which binds by email on first sign-in.
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: roleEnum("role").notNull().default("member"),
    status: memberStatusEnum("status").notNull().default("invited"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("memberships_ws_user_uq").on(t.workspaceId, t.userId),
    uniqueIndex("memberships_ws_email_uq").on(t.workspaceId, t.email),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    client: text("client"),
    ownerId: uuid("owner_id").references(() => memberships.id, { onDelete: "set null" }),
    status: projectStatusEnum("status").notNull().default("active"),
    priority: priorityEnum("priority").notNull().default("normal"),
    dueDate: day("due_date"),
    notes: text("notes").notNull().default(""),
    // Client contact person (optional), shown as a contact card in the project panel.
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    // Next planned contact with the client: a date and a one-line reminder of why. Both optional.
    followUpOn: day("follow_up_on"),
    followUpNote: text("follow_up_note"),
    // Notes have their own version so a metadata edit never conflicts with someone typing notes.
    notesVersion: integer("notes_version").notNull().default(1),
    position: doublePrecision("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    archivedAt: ts("archived_at"),
    archivedBy: uuid("archived_by").references(() => memberships.id, { onDelete: "set null" }),
    // In the trash (deleted from the Archive): hidden everywhere, restorable for 10 days, then purged.
    deletedAt: ts("deleted_at"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
  },
  (t) => [
    index("projects_ws_archived_pos_idx").on(t.workspaceId, t.archivedAt, t.position),
    index("projects_ws_status_idx").on(t.workspaceId, t.status),
    index("projects_ws_due_idx").on(t.workspaceId, t.dueDate),
    index("projects_ws_owner_idx").on(t.workspaceId, t.ownerId),
    // Only projects with a follow-up set: the calendar range and the "Contact today" list.
    index("projects_ws_follow_up_idx").on(t.workspaceId, t.followUpOn).where(sql`${t.followUpOn} is not null`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    completedAt: ts("completed_at"),
    completedBy: uuid("completed_by").references(() => memberships.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => memberships.id, { onDelete: "set null" }),
    dueDate: day("due_date"),
    note: text("note").notNull().default(""),
    waiting: boolean("waiting").notNull().default(false),
    waitingReason: text("waiting_reason"),
    position: doublePrecision("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    // Soft delete so "remove" can be undone; purge later if needed.
    deletedAt: ts("deleted_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("tasks_project_pos_idx").on(t.projectId, t.position),
    index("tasks_ws_assignee_idx").on(t.workspaceId, t.assigneeId, t.done),
    index("tasks_ws_due_idx").on(t.workspaceId, t.dueDate),
    index("tasks_ws_waiting_idx").on(t.workspaceId).where(sql`${t.waiting} and not ${t.done}`),
    // Open tasks only (a small slice once projects finish): sidebar counts and the cross-project views.
    index("tasks_ws_open_due_idx").on(t.workspaceId, t.dueDate).where(sql`not ${t.done} and ${t.deletedAt} is null`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    kind: documentKindEnum("kind").notNull(),
    name: text("name").notNull(),
    url: text("url"), // external links only
    storageKey: text("storage_key"), // object key in the private bucket; never sent to the browser
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    // Uploads are pending until the server has verified the stored object.
    uploadedAt: ts("uploaded_at"),
    // Plain text extracted from PDFs at upload, for full-text search. Null = not extracted (yet).
    contentText: text("content_text"),
    textExtractedAt: ts("text_extracted_at"),
    position: doublePrecision("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    deletedAt: ts("deleted_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("documents_ws_pos_idx").on(t.workspaceId, t.position),
    index("documents_project_idx").on(t.projectId),
    uniqueIndex("documents_storage_key_uq").on(t.storageKey),
  ],
);

// Workspace-wide labels for grouping projects ("Stavebnictví", "Urgentní" …).
export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("neutral"), // a palette key, never raw CSS
    createdAt: created(),
  },
  (t) => [uniqueIndex("labels_ws_name_uq").on(t.workspaceId, t.name)],
);

export const projectLabels = pgTable(
  "project_labels",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("project_labels_pk").on(t.projectId, t.labelId), index("project_labels_label_idx").on(t.labelId)],
);

export const projectTemplates = pgTable(
  "project_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // The checklist every new project starts with (one per workspace, chosen in Settings).
    isDefault: boolean("is_default").notNull().default(false),
    version: integer("version").notNull().default(1),
    archivedAt: ts("archived_at"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("templates_ws_name_uq").on(t.workspaceId, t.name),
    uniqueIndex("templates_ws_default_uq").on(t.workspaceId).where(sql`${t.isDefault} and ${t.archivedAt} is null`),
  ],
);

export const templateTasks = pgTable(
  "template_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => projectTemplates.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    position: doublePrecision("position").notNull().default(0),
  },
  (t) => [index("template_tasks_tpl_pos_idx").on(t.templateId, t.position)],
);

// Useful changes only. `data` holds small structured facts (old/new status, counts) — never tokens
// or full note bodies.
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => memberships.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [
    index("activity_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("activity_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  membershipId: uuid("membership_id").primaryKey().references(() => memberships.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  prefs: jsonb("prefs").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updated(),
});

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    kind: favoriteKindEnum("kind").notNull(),
    entityId: uuid("entity_id").notNull(),
    position: doublePrecision("position").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("favorites_member_entity_uq").on(t.membershipId, t.kind, t.entityId),
    index("favorites_ws_entity_idx").on(t.workspaceId, t.entityId),
  ],
);

// One row per submitted import. The unique idempotency key makes a double-submit or retry a no-op.
export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    source: text("source").notNull(), // csv | xlsx | paste | google
    mode: text("mode").notNull(), // create | update
    status: importStatusEnum("status").notNull().default("running"),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    createdAt: created(),
    completedAt: ts("completed_at"),
  },
  (t) => [uniqueIndex("import_runs_ws_key_uq").on(t.workspaceId, t.idempotencyKey)],
);

// OAuth connection per member. Tokens are AES-256-GCM encrypted at rest and never leave the server.
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accountEmail: text("account_email"),
    scopes: text("scopes").notNull().default(""),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: ts("expires_at"),
    status: connectionStatusEnum("status").notNull().default("active"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("integration_member_provider_uq").on(t.membershipId, t.provider)],
);

// Personal access tokens for the MCP endpoint (/api/mcp). Only the sha256 of the token is stored;
// the plain token is shown once on creation. `prefix` is the first characters, for display.
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    createdAt: created(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash), index("api_tokens_member_idx").on(t.membershipId)],
);

// OAuth 2.1 for MCP connectors (Claude, ChatGPT). Clients register themselves (RFC 7591, public
// clients only); a grant is one member's consent for one client. Codes and tokens are stored as sha256.
export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").primaryKey().defaultRandom(), // the client_id
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: created(),
});

export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    refreshHash: text("refresh_hash").notNull(),
    /** The refresh token this one replaced, to detect replay of a rotated token. */
    prevRefreshHash: text("prev_refresh_hash"),
    refreshExpiresAt: ts("refresh_expires_at").notNull(),
    rotatedAt: ts("rotated_at"),
    createdAt: created(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("oauth_grants_refresh_uq").on(t.refreshHash),
    index("oauth_grants_prev_refresh_idx").on(t.prevRefreshHash),
    index("oauth_grants_member_idx").on(t.membershipId),
  ],
);

export const oauthCodes = pgTable(
  "oauth_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: uuid("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    /** Set once exchanged, so a replayed code can revoke what it issued. */
    grantId: uuid("grant_id").references(() => oauthGrants.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
);

export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    grantId: uuid("grant_id").notNull().references(() => oauthGrants.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("oauth_access_tokens_grant_idx").on(t.grantId)],
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type TemplateTask = typeof templateTasks.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type ImportRun = typeof importRuns.$inferSelect;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;
