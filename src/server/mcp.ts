import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workspaceAnalytics } from "./analytics";
import type { Ctx } from "./context";
import { listDocuments } from "./documents";
import { AppError } from "./errors";
import { createLabel, listLabels, setProjectLabels, type Label } from "./labels";
import { listMembers, type MemberSummary } from "./members";
import { createProject, getProject, listProjectSummaries, setArchived, updateProject, updateProjectNotes } from "./projects";
import { search } from "./search";
import { createTask, listTaskView, loadTask, updateTask } from "./tasks";

/**
 * The MCP tools exposed at /api/mcp. Every tool runs as the token's member through the same
 * workspace-scoped services the UI uses, so scoping, validation and activity logging are identical.
 */

const todayUtc = () => new Date().toISOString().slice(0, 10);
const day = z.iso.date();
const today = day.optional().describe("Your local date (YYYY-MM-DD); decides what is overdue. Defaults to today in UTC.");
const id = (what: string) => z.uuid().describe(`${what} id`);
const status = z.enum(["active", "waiting", "completed"]);

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Maps service errors to a tool error the model can read, instead of a protocol failure. */
function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return json(await fn(args));
    } catch (e) {
      if (e instanceof AppError) return fail(`${e.code}: ${e.message}`);
      if (e instanceof z.ZodError) return fail(`invalid: ${z.prettifyError(e)}`);
      console.error(e);
      return fail("server: Something went wrong on the server");
    }
  };
}

/** A member by id, email or (unique) name. */
function findMember(members: MemberSummary[], ref: string) {
  const r = ref.trim().toLowerCase();
  const hits = members.filter((m) => m.status === "active" && (m.id === ref || m.email.toLowerCase() === r || m.name.toLowerCase() === r));
  if (hits.length !== 1) throw new AppError("invalid", hits.length ? `"${ref}" matches several members; use the email` : `No active member "${ref}"`);
  return hits[0].id;
}

const memberName = (members: MemberSummary[], mid: string | null) => (mid ? (members.find((m) => m.id === mid)?.name ?? null) : null);

export function buildMcpServer(ctx: Ctx) {
  const server = new McpServer(
    { name: "candid", version: "1.0.0" },
    { instructions: `Candid project management for workspace member ${ctx.name}. Dates are YYYY-MM-DD. Ids are UUIDs; get them from search, list_projects or get_project.` },
  );

  server.registerTool(
    "search",
    {
      description:
        'Search projects, tasks and documents. Every word must match. Filters: client:X (klient:), label:X (štítek:), type:project|task|document (typ:), "overdue" (po termínu). Quote values with spaces: client:"Stavby Novák". A double-quoted phrase is matched exactly: "site visit".',
      inputSchema: { query: z.string().min(1).max(100), today },
      annotations: { readOnlyHint: true },
    },
    tool(async ({ query, today: t }) => {
      const r = await search(ctx, query, { today: t });
      return { projects: r.projects, tasks: r.tasks, documents: r.documents, more: r.more };
    }),
  );

  server.registerTool(
    "list_projects",
    {
      description: "List projects (not archived unless archived=true) with task counts, labels and next task.",
      inputSchema: {
        status: status.optional(),
        label: z.string().optional().describe("Label name (case-insensitive substring)"),
        client: z.string().optional().describe("Client (case-insensitive substring)"),
        archived: z.boolean().optional(),
        today,
      },
      annotations: { readOnlyHint: true },
    },
    tool(async (a) => {
      const [list, members] = await Promise.all([listProjectSummaries(ctx, { archived: a.archived, today: a.today }), listMembers(ctx)]);
      const has = (v: string | null, q?: string) => !q || (v ?? "").toLowerCase().includes(q.toLowerCase());
      return list
        .filter((p) => (!a.status || p.status === a.status) && has(p.client, a.client) && (!a.label || p.labels.some((l) => has(l.name, a.label))))
        .map((p) => ({
          id: p.id,
          name: p.name,
          client: p.client,
          status: p.status,
          priority: p.priority,
          dueDate: p.dueDate,
          owner: memberName(members, p.ownerId),
          labels: p.labels.map((l) => l.name),
          tasks: { total: p.taskCount, done: p.doneCount, overdue: p.overdueCount, waiting: p.waitingCount },
          nextTask: p.nextTask?.title ?? null,
        }));
    }),
  );

  server.registerTool(
    "get_project",
    {
      description: "One project with its tasks, notes, client contact, labels and document names.",
      inputSchema: { projectId: id("Project") },
      annotations: { readOnlyHint: true },
    },
    tool(async ({ projectId }) => {
      const [{ project: p, tasks, labelIds }, labels, docs, members] = await Promise.all([
        getProject(ctx, projectId),
        listLabels(ctx),
        listDocuments(ctx, { projectId }),
        listMembers(ctx),
      ]);
      return {
        id: p.id,
        name: p.name,
        client: p.client,
        status: p.status,
        priority: p.priority,
        dueDate: p.dueDate,
        owner: memberName(members, p.ownerId),
        archived: !!p.archivedAt,
        contact: { name: p.contactName, email: p.contactEmail, phone: p.contactPhone },
        labels: labels.filter((l) => labelIds.includes(l.id)).map((l) => l.name),
        notes: p.notes,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          done: t.done,
          dueDate: t.dueDate,
          assignee: memberName(members, t.assigneeId),
          waiting: t.waiting,
          note: t.note || undefined,
        })),
        documents: docs.map((d) => d.name),
      };
    }),
  );

  const taskRow = (members: MemberSummary[]) => (r: Awaited<ReturnType<typeof listTaskView>>[number]) => ({
    id: r.task.id,
    title: r.task.title,
    dueDate: r.task.dueDate,
    assignee: memberName(members, r.task.assigneeId),
    project: { id: r.project.id, name: r.project.name, client: r.project.client },
  });

  server.registerTool(
    "my_tasks",
    { description: "Open tasks assigned to you, soonest due first.", inputSchema: { today }, annotations: { readOnlyHint: true } },
    tool(async ({ today: t }) => (await listTaskView(ctx, "mine", { today: t ?? todayUtc() })).map(taskRow(await listMembers(ctx)))),
  );

  server.registerTool(
    "overdue",
    { description: "Open tasks past their due date, across all active projects.", inputSchema: { today }, annotations: { readOnlyHint: true } },
    tool(async ({ today: t }) => (await listTaskView(ctx, "overdue", { today: t ?? todayUtc() })).map(taskRow(await listMembers(ctx)))),
  );

  server.registerTool(
    "analytics_summary",
    {
      description: "Workspace numbers: projects by status, overdue tasks, on-time rate, weekly completions, top clients, busiest members.",
      inputSchema: { today },
      annotations: { readOnlyHint: true },
    },
    tool(async ({ today: t }) => workspaceAnalytics(ctx, t ?? todayUtc())),
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a project. Without `tasks` it starts from the workspace's default template.",
      inputSchema: {
        name: z.string().min(1).max(200),
        client: z.string().max(200).optional(),
        status: status.optional(),
        priority: z.enum(["normal", "high"]).optional(),
        dueDate: day.optional(),
        notes: z.string().max(100_000).optional(),
        owner: z.string().optional().describe("Member email, name or id"),
        tasks: z.array(z.string().min(1).max(500)).max(200).optional().describe("Task titles; replaces the default template"),
      },
    },
    tool(async (a) => {
      const ownerId = a.owner ? findMember(await listMembers(ctx), a.owner) : undefined;
      const p = await createProject(ctx, { ...a, ownerId, tasks: a.tasks?.map((title) => ({ title })) });
      return { id: p.id, name: p.name, version: p.version };
    }),
  );

  server.registerTool(
    "update_project",
    {
      description: "Change a project. Only the fields given change; pass null to clear. Notes replace the whole note text.",
      inputSchema: {
        projectId: id("Project"),
        name: z.string().min(1).max(200).optional(),
        status: status.optional(),
        priority: z.enum(["normal", "high"]).optional(),
        dueDate: day.nullable().optional(),
        client: z.string().max(200).nullable().optional(),
        owner: z.string().nullable().optional().describe("Member email, name or id; null clears"),
        contactName: z.string().max(200).nullable().optional(),
        contactEmail: z.string().max(200).nullable().optional(),
        contactPhone: z.string().max(50).nullable().optional(),
        notes: z.string().max(100_000).optional(),
      },
    },
    tool(async ({ projectId, notes, owner, ...patch }) => {
      const cur = (await getProject(ctx, projectId)).project;
      const ownerId = owner === undefined ? undefined : owner === null ? null : findMember(await listMembers(ctx), owner);
      let p = cur;
      if (Object.values({ ...patch, ownerId }).some((v) => v !== undefined)) {
        p = await updateProject(ctx, projectId, { ...patch, ownerId, version: cur.version });
      }
      if (notes !== undefined && notes !== cur.notes) await updateProjectNotes(ctx, projectId, notes, cur.notesVersion);
      return { id: p.id, name: p.name, status: p.status, dueDate: p.dueDate, client: p.client, version: p.version };
    }),
  );

  server.registerTool(
    "add_note",
    {
      description:
        "Append text to a project's notes (after a blank line), keeping what is already there. Pass notesVersion (from an earlier read) to fail with a conflict if someone edited the notes since; otherwise the current version is used.",
      inputSchema: {
        projectId: id("Project"),
        text: z.string().min(1).max(100_000),
        notesVersion: z.int().optional().describe("The notes version you last saw"),
      },
    },
    tool(async ({ projectId, text, notesVersion }) => {
      const cur = (await getProject(ctx, projectId)).project;
      const next = cur.notes.trim() ? `${cur.notes.replace(/\s+$/, "")}\n\n${text}` : text;
      const p = await updateProjectNotes(ctx, projectId, next, notesVersion ?? cur.notesVersion);
      return { projectId, notesVersion: p.notesVersion, length: p.notes.length };
    }),
  );

  server.registerTool(
    "list_members",
    {
      description: "Workspace members (active and invited) with id, name, email and role. Use the email wherever a tool asks for an owner or assignee.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tool(async () => (await listMembers(ctx)).map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, status: m.status }))),
  );

  const archiveTool = (archived: boolean) =>
    tool(async ({ projectId }: { projectId: string }) => {
      const { project } = await getProject(ctx, projectId);
      const p = project.archivedAt ? (archived ? project : await setArchived(ctx, projectId, false)) : archived ? await setArchived(ctx, projectId, true) : project;
      return { id: p.id, name: p.name, archived: !!p.archivedAt, version: p.version };
    });

  server.registerTool(
    "archive_project",
    { description: "Archive a project: it leaves the overview but nothing is deleted, and it can be restored. Does nothing if already archived.", inputSchema: { projectId: id("Project") } },
    archiveTool(true),
  );

  server.registerTool(
    "restore_project",
    { description: "Restore an archived project to the overview. Does nothing if it is not archived.", inputSchema: { projectId: id("Project") } },
    archiveTool(false),
  );

  server.registerTool(
    "add_task",
    {
      description: "Add a task to the end of a project's checklist.",
      inputSchema: {
        projectId: id("Project"),
        title: z.string().min(1).max(500),
        dueDate: day.optional(),
        assignee: z.string().optional().describe("Member email, name or id"),
        note: z.string().max(20_000).optional(),
      },
    },
    tool(async ({ projectId, assignee, ...rest }) => {
      const assigneeId = assignee ? findMember(await listMembers(ctx), assignee) : undefined;
      const t = await createTask(ctx, projectId, { ...rest, assigneeId });
      return { id: t.id, title: t.title, projectId: t.projectId };
    }),
  );

  server.registerTool(
    "update_task",
    {
      description: "Change a task: title, done, due date, assignee or note. Only fields given change; null clears.",
      inputSchema: {
        taskId: id("Task"),
        title: z.string().min(1).max(500).optional(),
        done: z.boolean().optional(),
        dueDate: day.nullable().optional(),
        assignee: z.string().nullable().optional().describe("Member email, name or id; null unassigns"),
        note: z.string().max(20_000).optional(),
      },
    },
    tool(async ({ taskId, assignee, ...patch }) => {
      const cur = await loadTask(ctx, taskId);
      if (cur.deletedAt) throw new AppError("not_found", "Task not found");
      const assigneeId = assignee === undefined ? undefined : assignee === null ? null : findMember(await listMembers(ctx), assignee);
      const t = await updateTask(ctx, taskId, { ...patch, assigneeId, version: cur.version });
      return { id: t.id, title: t.title, done: t.done, dueDate: t.dueDate, version: t.version };
    }),
  );

  const labelTool = (add: boolean) =>
    tool(async ({ projectId, label, create }: { projectId: string; label: string; create?: boolean }) => {
      const [{ labelIds }, all] = await Promise.all([getProject(ctx, projectId), listLabels(ctx)]);
      let l: Label | undefined = all.find((x) => x.id === label || x.name.toLowerCase() === label.trim().toLowerCase());
      if (!l && add && create) l = await createLabel(ctx, { name: label });
      if (!l) throw new AppError("not_found", `No label "${label}". Existing: ${all.map((x) => x.name).join(", ") || "none"}`);
      const next = add ? [...new Set([...labelIds, l.id])] : labelIds.filter((x) => x !== l.id);
      if (next.length !== labelIds.length) await setProjectLabels(ctx, projectId, next);
      return { projectId, labels: all.concat(all.some((x) => x.id === l.id) ? [] : [l]).filter((x) => next.includes(x.id)).map((x) => x.name) };
    });

  server.registerTool(
    "add_label_to_project",
    {
      description: "Put a label on a project (by label name or id).",
      inputSchema: { projectId: id("Project"), label: z.string().min(1).max(60), create: z.boolean().optional().describe("Create the label if it does not exist") },
    },
    labelTool(true),
  );

  server.registerTool(
    "remove_label_from_project",
    { description: "Take a label off a project (by label name or id).", inputSchema: { projectId: id("Project"), label: z.string().min(1).max(60) } },
    labelTool(false),
  );

  return server;
}
