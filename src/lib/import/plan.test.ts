import { describe, expect, it } from "vitest";
import { autoMap } from "./mapping";
import { buildPlan, type SnapshotProject, type SnapshotTask, type WorkspaceSnapshot } from "./plan";
import type { Cell, ImportOptions } from "./types";

const P1 = "11111111-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
const ANA = "33333333-3333-4333-8333-333333333333";

const project = (o: Partial<SnapshotProject> = {}): SnapshotProject => ({
  id: P1, name: "Website", client: "Acme", status: "active", priority: "normal", ownerId: null, dueDate: null, notes: "", version: 3, archived: false, ...o,
});
const task = (o: Partial<SnapshotTask> = {}): SnapshotTask => ({
  id: T1, projectId: P1, title: "Wireframes", done: false, assigneeId: null, dueDate: null, note: "", version: 5, ...o,
});
const snap = (o: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot => ({ projects: [], tasks: [], members: [{ id: ANA, email: "ana@example.com" }], ...o });

function plan(table: Cell[][], options: Partial<ImportOptions> = {}, s = snap()) {
  const [header, ...rows] = table as string[][];
  return buildPlan({ source: "csv", label: "t", header, rows, mapping: autoMap(header), options: { mode: "create", ...options } }, s);
}

describe("buildPlan: grouping", () => {
  it("groups rows by project name + client; project-only rows create just the project", () => {
    const { plan: p, apply } = plan([
      ["Project", "Client", "Task", "Completed"],
      ["Website", "Acme", "Wireframes", "yes"],
      ["website ", "acme", "Copy", ""],
      ["Website", "Other", "Copy", ""],
      ["Empty project", "", "", ""],
    ]);
    expect(p.projects.map((x) => [x.name, x.client, x.tasks.length])).toEqual([
      ["Website", "Acme", 2],
      ["Website", "Other", 1],
      ["Empty project", null, 0],
    ]);
    expect(p.counts).toMatchObject({ rows: 4, projectsCreate: 3, tasksCreate: 3, errors: 0 });
    expect(apply[0].tasks[0]).toMatchObject({ action: "create", values: { title: "Wireframes", done: true } });
  });

  it("groups by Project ID when given, even if names differ", () => {
    const { plan: p } = plan(
      [
        ["Project ID", "Project", "Task"],
        [P1, "Website", "A"],
        [P1, "Website renamed", "B"],
      ],
      { mode: "update", createMissing: true },
      snap({ projects: [project()] }),
    );
    expect(p.projects).toHaveLength(1);
    expect(p.issues.map((i) => i.code)).toContain("conflictingValue");
  });

  it("reports invalid values per row with the sheet row number", () => {
    const { plan: p } = plan([
      ["Project", "Project status", "Priority", "Task", "Completed", "Task due date"],
      ["A", "busy", "", "x", "", ""],
      ["A", "", "urgent", "y", "", ""],
      ["A", "", "", "z", "maybe", ""],
      ["A", "", "", "w", "", "31/31/2026"],
      ["", "", "", "orphan", "", ""],
    ]);
    expect(p.issues.filter((i) => i.severity === "error").map((i) => [i.row, i.code])).toEqual([
      [2, "invalidStatus"],
      [3, "invalidPriority"],
      [4, "invalidBoolean"],
      [5, "invalidDate"],
      [6, "missingProject"],
    ]);
    expect(p.counts.errors).toBe(5);
  });

  it("asks for an order on ambiguous dates, then uses it", () => {
    const t: Cell[][] = [["Project", "Task", "Task due date"], ["A", "x", "03/04/2026"]];
    expect(plan(t).plan.issues[0]).toMatchObject({ code: "ambiguousDate", severity: "error" });
    expect(plan(t, { dateOrders: { taskDueDate: "dmy" } }).apply[0].tasks[0].values).toMatchObject({ dueDate: "2026-04-03" });
  });

  it("flags a formula with no cached value", () => {
    const { plan: p } = plan([["Project", "Task"], ["A", { formula: "B9", unsupported: true } as unknown as string]]);
    expect(p.issues[0]).toMatchObject({ code: "formula", severity: "error" });
  });

  it("strips the formula-injection quote on import", () => {
    const { apply } = plan([["Project", "Task"], ["A", "'=1+1"]]);
    expect(apply[0].tasks[0].values).toMatchObject({ title: "=1+1" });
  });
});

describe("buildPlan: people", () => {
  it("unknown email is a warning and leaves the task unassigned; strict makes it an error", () => {
    const t: Cell[][] = [["Project", "Task", "Assignee email"], ["A", "x", "nobody@example.com"], ["A", "y", "ANA@example.com"]];
    const lax = plan(t);
    expect(lax.plan.issues[0]).toMatchObject({ code: "unknownEmail", severity: "warning", skipped: false });
    expect(lax.apply[0].tasks.map((x) => x.values.assigneeId)).toEqual([undefined, ANA]);
    const strict = plan(t, { strictEmails: true });
    expect(strict.plan.issues[0]).toMatchObject({ code: "unknownEmail", severity: "error" });
    expect(strict.apply[0].tasks).toHaveLength(1);
  });
});

describe("buildPlan: duplicates (create mode)", () => {
  it("flags an existing project with the same name + client and skips it unless accepted", () => {
    const t: Cell[][] = [["Project", "Client", "Task"], ["Website", "ACME", "x"]];
    const s = snap({ projects: [project()] });
    const skipped = plan(t, {}, s);
    expect(skipped.plan.issues[0]).toMatchObject({ code: "duplicateProject", severity: "duplicate", skipped: true, row: 2 });
    expect(skipped.apply).toHaveLength(0);
    const accepted = plan(t, { acceptDuplicates: [2] }, s);
    expect(accepted.apply[0]).toMatchObject({ action: "create" });
  });

  it("flags the same task title twice in a project", () => {
    const { plan: p, apply } = plan([["Project", "Task"], ["A", "Call"], ["A", "call"]]);
    expect(p.issues[0]).toMatchObject({ row: 3, code: "duplicateTask", skipped: true });
    expect(apply[0].tasks).toHaveLength(1);
  });

  it("honours skipped rows", () => {
    const { plan: p, apply } = plan([["Project", "Task"], ["A", "One"], ["A", "Two"]], { skipRows: [3] });
    expect(apply[0].tasks).toHaveLength(1);
    expect(p.counts.skipped).toBe(1);
  });
});

describe("buildPlan: update mode", () => {
  const s = snap({ projects: [project()], tasks: [task()] });

  it("matches by ID only and lists field diffs", () => {
    const { plan: p, apply } = plan(
      [
        ["Project ID", "Task ID", "Project", "Client", "Task", "Completed", "Assignee email"],
        [P1, T1, "Website", "Acme", "Wireframes v2", "yes", "ana@example.com"],
      ],
      { mode: "update" },
      s,
    );
    expect(apply[0]).toMatchObject({ action: "unchanged", id: P1 });
    expect(apply[0].tasks[0]).toMatchObject({ action: "update", id: T1, version: 5, values: { title: "Wireframes v2", done: true, assigneeId: ANA } });
    expect(p.projects[0].tasks[0].diffs).toEqual([
      { field: "task", from: "Wireframes", to: "Wireframes v2" },
      { field: "completed", from: "no", to: "yes" },
      { field: "assigneeEmail", from: null, to: "ana@example.com" },
    ]);
  });

  it("never matches by name: rows without IDs are skipped unless opted in", () => {
    const t: Cell[][] = [["Project ID", "Project", "Client", "Task"], ["", "Website", "Acme", "New"]];
    const off = plan(t, { mode: "update" }, s);
    expect(off.apply).toHaveLength(0);
    expect(off.plan.issues[0]).toMatchObject({ code: "missingId", skipped: true });
    const on = plan(t, { mode: "update", createMissing: true }, s);
    expect(on.plan.issues[0]).toMatchObject({ code: "duplicateProject" }); // still flagged, never merged
  });

  it("rejects IDs that are not in the workspace", () => {
    const { plan: p } = plan([["Project ID", "Project"], ["99999999-9999-4999-8999-999999999999", "X"], ["not-a-uuid", "Y"]], { mode: "update" }, s);
    expect(p.issues.map((i) => [i.code, i.severity])).toEqual([
      ["unknownProjectId", "error"],
      ["unknownProjectId", "error"],
    ]);
  });

  it("does not clear an assignment because of an unknown email", () => {
    const withAna = snap({ projects: [project()], tasks: [task({ assigneeId: ANA })] });
    const { apply, plan: p } = plan([["Task ID", "Assignee email"], [T1, "ghost@example.com"]], { mode: "update" }, withAna);
    expect(p.issues[0].code).toBe("unknownEmailKept");
    expect(apply[0].tasks).toHaveLength(0);
  });

  it("identical rows produce no changes", () => {
    const { plan: p } = plan([["Project ID", "Task ID", "Project", "Client", "Task", "Completed"], [P1, T1, "Website", "Acme", "Wireframes", "no"]], { mode: "update" }, s);
    expect(p.counts).toMatchObject({ projectsUpdate: 0, tasksUpdate: 0, tasksCreate: 0, projectsCreate: 0, unchanged: 2 });
  });
});
