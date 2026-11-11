import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { activityEvents } from "@/db/schema";
import { makeCtx } from "../../test/factory";
import { calendarRange } from "./calendar";
import { completeFollowUp, listDueFollowUps, logContact } from "./follow-ups";
import { createProject, getProject, setArchived, updateProject } from "./projects";
import { createTask, updateTask } from "./tasks";

const actions = async (ctx: { workspaceId: string }, projectId: string) =>
  (await db.select().from(activityEvents).where(and(eq(activityEvents.workspaceId, ctx.workspaceId), eq(activityEvents.projectId, projectId)))).map((e) => e.action);

describe("follow-up date on a project", () => {
  it("is set and cleared through the versioned patch, with history", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Fasáda", tasks: [] });
    const set = await updateProject(ctx, p.id, { followUpOn: "2026-11-20", followUpNote: "  Zeptat se na rozpočet ", version: p.version });
    expect(set).toMatchObject({ followUpOn: "2026-11-20", followUpNote: "Zeptat se na rozpočet" });
    await expect(updateProject(ctx, p.id, { followUpOn: null, version: p.version })).rejects.toMatchObject({ code: "conflict" });
    // Clearing the date clears the note with it.
    const cleared = await updateProject(ctx, p.id, { followUpOn: null, version: set.version });
    expect(cleared).toMatchObject({ followUpOn: null, followUpNote: null });
    expect(await actions(ctx, p.id)).toEqual(expect.arrayContaining(["follow_up_set", "follow_up_cleared"]));
  });

  it("rejects a malformed date and leaves other fields alone", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Keep", client: "Klient" });
    await expect(updateProject(ctx, p.id, { followUpOn: "20.11.2026", version: p.version })).rejects.toThrow();
    const after = await updateProject(ctx, p.id, { followUpOn: "2026-11-20", version: p.version });
    expect(after.client).toBe("Klient");
  });
});

describe("Contact today", () => {
  it("lists due and overdue follow-ups of live projects in this workspace only", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const late = await createProject(ctx, { name: "Late", tasks: [] });
    const today = await createProject(ctx, { name: "Today", tasks: [] });
    const future = await createProject(ctx, { name: "Future", tasks: [] });
    const archived = await createProject(ctx, { name: "Archived", tasks: [] });
    const foreign = await createProject(other, { name: "Foreign", tasks: [] });
    await updateProject(ctx, late.id, { followUpOn: "2026-11-09", version: late.version });
    await updateProject(ctx, today.id, { followUpOn: "2026-11-11", followUpNote: "Call back", version: today.version });
    await updateProject(ctx, future.id, { followUpOn: "2026-11-12", version: future.version });
    await updateProject(ctx, archived.id, { followUpOn: "2026-11-01", version: archived.version });
    await setArchived(ctx, archived.id, true);
    await updateProject(other, foreign.id, { followUpOn: "2026-11-01", version: foreign.version });

    const list = await listDueFollowUps(ctx, "2026-11-11");
    expect(list.map((f) => f.name)).toEqual(["Late", "Today"]);
    expect(list[1]).toMatchObject({ followUpNote: "Call back" });
  });

  it("Done clears the follow-up, writes history and is idempotent", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const p = await createProject(ctx, { name: "Done", tasks: [] });
    await updateProject(ctx, p.id, { followUpOn: "2026-11-10", followUpNote: "Ring", version: p.version });
    await expect(completeFollowUp(other, p.id)).rejects.toMatchObject({ code: "not_found" });
    const after = await completeFollowUp(ctx, p.id);
    expect(after).toMatchObject({ followUpOn: null, followUpNote: null });
    expect(await listDueFollowUps(ctx, "2026-11-11")).toHaveLength(0);
    expect(await actions(ctx, p.id)).toContain("follow_up_done");
    await completeFollowUp(ctx, p.id); // already cleared: no error, no second entry
    expect((await actions(ctx, p.id)).filter((a) => a === "follow_up_done")).toHaveLength(1);
  });
});

describe("logContact", () => {
  it("records a structured contact event, optionally scheduling the next contact", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Hovor", tasks: [] });
    await logContact(ctx, p.id, { kind: "call", outcome: " Chce nabídku do pátku " });
    expect((await getProject(ctx, p.id)).project.followUpOn).toBeNull();
    const withNext = await logContact(ctx, p.id, { kind: "meeting", outcome: "", followUpOn: "2026-12-01" });
    expect(withNext).toMatchObject({ followUpOn: "2026-12-01", followUpNote: null });
    const events = await db.select().from(activityEvents).where(eq(activityEvents.projectId, p.id));
    const contacts = events.filter((e) => e.action === "contact_logged");
    expect(contacts.map((e) => e.data)).toEqual(expect.arrayContaining([{ kind: "call", outcome: "Chce nabídku do pátku" }, { kind: "meeting" }]));
    expect(contacts.every((e) => e.entityType === "project" && e.actorId === ctx.membershipId)).toBe(true);
    expect(events.map((e) => e.action)).toContain("follow_up_set");
  });

  it("validates the kind and length, and refuses another workspace's project", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const p = await createProject(ctx, { name: "Valid", tasks: [] });
    await expect(logContact(ctx, p.id, { kind: "fax" as "call" })).rejects.toThrow();
    await expect(logContact(ctx, p.id, { kind: "call", outcome: "x".repeat(301) })).rejects.toThrow();
    await expect(logContact(other, p.id, { kind: "call" })).rejects.toMatchObject({ code: "not_found" });
    expect(await actions(ctx, p.id)).not.toContain("contact_logged");
  });
});

describe("calendarRange", () => {
  it("returns open steps, project due dates and follow-ups inside the range for this workspace", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const p = await createProject(ctx, { name: "Kalendář", dueDate: "2026-11-30", tasks: [] });
    await updateProject(ctx, p.id, { followUpOn: "2026-11-12", followUpNote: "Zavolat", version: p.version });
    const inRange = await createTask(ctx, p.id, { title: "In range", dueDate: "2026-11-15" });
    const done = await createTask(ctx, p.id, { title: "Done", dueDate: "2026-11-16" });
    await updateTask(ctx, done.id, { done: true, version: done.version });
    await createTask(ctx, p.id, { title: "Outside", dueDate: "2026-12-15" });
    await createTask(ctx, p.id, { title: "No date" });
    const foreign = await createProject(other, { name: "Foreign", dueDate: "2026-11-20", tasks: [] });
    await createTask(other, foreign.id, { title: "Theirs", dueDate: "2026-11-15" });

    const r = await calendarRange(ctx, { from: "2026-10-26", to: "2026-12-06" });
    expect(r.steps.map((s) => s.title)).toEqual(["In range"]);
    expect(r.steps[0]).toMatchObject({ id: inRange.id, projectName: "Kalendář", version: inRange.version });
    expect(r.deadlines.map((d) => d.name)).toEqual(["Kalendář"]);
    expect(r.followUps).toEqual([expect.objectContaining({ followUpOn: "2026-11-12", followUpNote: "Zavolat" })]);

    // Archived projects disappear from the calendar.
    await setArchived(ctx, p.id, true);
    expect(await calendarRange(ctx, { from: "2026-10-26", to: "2026-12-06" })).toEqual({ steps: [], deadlines: [], followUps: [] });
  });

  it("refuses a reversed or oversized range", async () => {
    const ctx = await makeCtx();
    await expect(calendarRange(ctx, { from: "2026-12-06", to: "2026-10-26" })).rejects.toThrow();
    await expect(calendarRange(ctx, { from: "2026-01-01", to: "2026-12-31" })).rejects.toThrow();
    await expect(calendarRange(ctx, { from: "nope", to: "2026-12-31" })).rejects.toThrow();
  });
});
