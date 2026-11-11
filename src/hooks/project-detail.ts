"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Project, Task } from "@/db/schema";
import { fmt, plural, t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { clearDraft, markUnsaved, readDraft, saveDraft } from "@/lib/unsaved";
import { qk } from "@/lib/query-keys";
import type { ActivityItem } from "@/server/activity-read";
import type { ProjectSummary } from "@/server/projects";

/** Rows as they arrive over JSON: Date columns become ISO strings. */
type Wire<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
export type ProjectRow = Wire<Project>;
export type TaskRow = Wire<Task>;
export type ProjectDetail = { project: ProjectRow; tasks: TaskRow[]; pinned: boolean; labelIds: string[] };
export type TaskPatch = Partial<Pick<TaskRow, "title" | "done" | "assigneeId" | "dueDate" | "note" | "waiting" | "waitingReason">>;
export type ProjectPatch = Partial<Pick<ProjectRow, "name" | "client" | "ownerId" | "status" | "priority" | "dueDate" | "contactName" | "contactEmail" | "contactPhone">>;

/** Shared with the sheet, which starts this fetch while the panel's code is still loading. */
export const projectQuery = (id: string) => ({ queryKey: qk.project(id), queryFn: () => api<ProjectDetail>(`/api/projects/${id}`) });

export function useProject(id: string) {
  return useQuery(projectQuery(id));
}

export function useProjectActivity(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.activity(id),
    queryFn: () => api<{ events: ActivityItem[] }>(`/api/projects/${id}/activity`).then((r) => r.events),
    enabled,
  });
}

export const errorText = (e: unknown) =>
  e instanceof ApiError && e.isOffline ? t.tasks.panel.offline : e instanceof ApiError && e.isConflict ? t.tasks.conflict : t.tasks.saveFailed;

// ---- cache helpers -------------------------------------------------------------------------

const scopeOf = (projectId: string) => ({ id: `project-detail:${projectId}` });
const mutationKeyOf = (projectId: string) => ["project-detail", projectId] as const;

function setDetail(qc: QueryClient, id: string, fn: (d: ProjectDetail) => ProjectDetail) {
  qc.setQueryData<ProjectDetail>(qk.project(id), (d) => (d ? fn(d) : d));
}
function setTask(qc: QueryClient, projectId: string, taskId: string, fn: (t: TaskRow) => TaskRow) {
  setDetail(qc, projectId, (d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === taskId ? fn(x) : x)) }));
}
function findTask(qc: QueryClient, projectId: string, taskId: string) {
  return qc.getQueryData<ProjectDetail>(qk.project(projectId))?.tasks.find((x) => x.id === taskId);
}
function setSummary(qc: QueryClient, id: string, fn: (s: ProjectSummary) => ProjectSummary) {
  qc.setQueriesData<ProjectSummary[]>({ queryKey: ["projects"] }, (list) => (Array.isArray(list) ? list.map((s) => (s.id === id ? fn(s) : s)) : list));
}

/**
 * After a write: refresh what it affects, once no other write of this panel is pending. Writes are
 * queued per panel, so ticking five steps in a row refetches the detail, list and counts once
 * instead of five times; the optimistic copy covers the gap.
 */
function refresh(qc: QueryClient, projectId: string) {
  if (qc.isMutating({ mutationKey: mutationKeyOf(projectId) }) > 1) return;
  qc.invalidateQueries({ queryKey: qk.project(projectId) });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: qk.counts() });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: qk.activity(projectId) });
}

/**
 * `taskPatch`/`projectPatch` on the server are `.partial()` of schemas with `.default()`s, so an
 * omitted `note`/`waiting` (task) or `status`/`priority` (project) is reset to its default. Until
 * that is fixed server-side, every PATCH carries those fields from the copy it is based on.
 */
const taskBody = (cur: TaskRow | undefined, patch: object) => ({ note: cur?.note, waiting: cur?.waiting, ...patch, version: cur?.version });
const projectBody = (cur: ProjectRow | undefined, patch: object) => ({ status: cur?.status, priority: cur?.priority, ...patch, version: cur?.version });

const pick = <T extends object>(o: T, keys: (keyof T)[]) => Object.fromEntries(keys.map((k) => [k, o[k]])) as Partial<T>;

// ---- tasks ---------------------------------------------------------------------------------

/** Task writes for one project: optimistic, serialised per panel, rolled back with a Retry toast on failure. */
export function useTaskActions(projectId: string) {
  const qc = useQueryClient();
  const common = { mutationKey: mutationKeyOf(projectId), scope: scopeOf(projectId) };
  const onSettled = () => refresh(qc, projectId);

  const patch = useMutation({
    ...common,
    // The version is read when the request leaves, after earlier writes in the queue have landed.
    mutationFn: ({ taskId, patch }: { taskId: string; patch: TaskPatch }) =>
      api<{ task: TaskRow }>(`/api/tasks/${taskId}`, { method: "PATCH", json: taskBody(findTask(qc, projectId, taskId), patch) }).then((r) => r.task),
    onMutate: async ({ taskId, patch }) => {
      await qc.cancelQueries({ queryKey: qk.project(projectId) });
      const prev = findTask(qc, projectId, taskId);
      setTask(qc, projectId, taskId, (x) => ({ ...x, ...patch }));
      if (prev && patch.done !== undefined && patch.done !== prev.done) {
        setSummary(qc, projectId, (s) => ({ ...s, doneCount: s.doneCount + (patch.done ? 1 : -1) }));
      }
      return { prev };
    },
    // Only the fields this write owns, so a later optimistic change to the same task is not undone.
    onSuccess: (server, { taskId, patch }) =>
      setTask(qc, projectId, taskId, (x) => ({ ...x, ...pick(server, [...(Object.keys(patch) as (keyof TaskRow)[]), "version", "updatedAt", "completedAt", "completedBy"]) })),
    onError: (e, { taskId, patch }, c) => {
      const current = e instanceof ApiError && e.isConflict ? ((e.details as { current?: TaskRow })?.current ?? null) : null;
      const restore = current ?? c?.prev;
      if (restore) setTask(qc, projectId, taskId, (x) => (current ? { ...x, ...current } : { ...x, ...pick(restore, Object.keys(patch) as (keyof TaskRow)[]) }));
    },
    onSettled,
  });

  const run = (taskId: string, p: TaskPatch, undoLabel?: string) => {
    const before = findTask(qc, projectId, taskId);
    const toastId = `task-${taskId}`;
    if (undoLabel && before) {
      const back = pick(before, Object.keys(p) as (keyof TaskRow)[]) as TaskPatch;
      toast(undoLabel, { id: toastId, action: { label: t.common.undo, onClick: () => run(taskId, back) } });
    }
    patch.mutate(
      { taskId, patch: p },
      { onError: (e) => toast.error(errorText(e), { id: toastId, action: { label: t.common.retry, onClick: () => run(taskId, p, undoLabel) } }) },
    );
  };

  const toggle = (task: TaskRow) => run(task.id, { done: !task.done }, fmt(task.done ? t.tasks.reopened : t.tasks.completed, { title: task.title }));

  const create = useMutation({
    ...common,
    mutationFn: (title: string) => api<{ task: TaskRow }>(`/api/projects/${projectId}/tasks`, { method: "POST", json: { title } }).then((r) => r.task),
    onSuccess: (task) => setDetail(qc, projectId, (d) => ({ ...d, tasks: [...d.tasks, task] })),
    onSettled,
  });

  const remove = useMutation({
    ...common,
    mutationFn: (taskId: string) => api(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: qk.project(projectId) });
      const prev = qc.getQueryData<ProjectDetail>(qk.project(projectId));
      setDetail(qc, projectId, (d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== taskId) }));
      return { prev };
    },
    onError: (_e, _id, c) => c?.prev && qc.setQueryData(qk.project(projectId), c.prev),
    onSettled,
  });
  const restore = useMutation({
    ...common,
    mutationFn: (taskId: string) => api(`/api/tasks/${taskId}/restore`, { method: "POST" }),
    onSettled,
  });
  const removeTask = (task: TaskRow) => {
    const toastId = `task-${task.id}`;
    toast(fmt(t.tasks.removed, { title: task.title }), {
      id: toastId,
      action: {
        label: t.common.undo,
        onClick: () => restore.mutate(task.id, { onError: (e) => toast.error(errorText(e), { id: toastId }) }),
      },
    });
    remove.mutate(task.id, {
      onError: (e) => toast.error(errorText(e), { id: toastId, action: { label: t.common.retry, onClick: () => removeTask(task) } }),
    });
  };

  const reorder = useMutation({
    ...common,
    mutationFn: (ids: string[]) => api(`/api/projects/${projectId}/tasks/reorder`, { method: "POST", json: { ids } }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.project(projectId) });
      const prev = qc.getQueryData<ProjectDetail>(qk.project(projectId));
      const byId = new Map(prev?.tasks.map((x) => [x.id, x]));
      setDetail(qc, projectId, (d) => ({ ...d, tasks: ids.map((id, i) => ({ ...byId.get(id)!, position: i })) }));
      return { prev };
    },
    onError: (e, ids, c) => {
      if (c?.prev) qc.setQueryData(qk.project(projectId), c.prev);
      toast.error(e instanceof ApiError && e.isOffline ? t.tasks.panel.offline : t.tasks.reorderFailed, {
        action: { label: t.common.retry, onClick: () => reorder.mutate(ids) },
      });
    },
    onSettled,
  });

  type BulkChange = { done?: boolean; assigneeId?: string | null; dueDate?: string | null };
  type Before = { id: string; done: boolean; assigneeId: string | null; dueDate: string | null };
  const bulk = useMutation({
    ...common,
    mutationFn: (v: { ids: string[] } & BulkChange) => api<{ before: Before[] }>("/api/tasks/bulk", { method: "POST", json: v }),
    onMutate: async ({ ids, ...change }) => {
      await qc.cancelQueries({ queryKey: qk.project(projectId) });
      const prev = qc.getQueryData<ProjectDetail>(qk.project(projectId));
      const set = new Set(ids);
      setDetail(qc, projectId, (d) => ({ ...d, tasks: d.tasks.map((x) => (set.has(x.id) ? { ...x, ...change } : x)) }));
      return { prev };
    },
    onError: (_e, _v, c) => c?.prev && qc.setQueryData(qk.project(projectId), c.prev),
    onSettled,
  });
  /** Undo groups the previous values, since one bulk call sets one value for all its ids. */
  const bulkUpdate = (ids: string[], change: BulkChange, opts: { undo?: boolean } = { undo: true }) => {
    bulk.mutate(
      { ids, ...change },
      {
        onSuccess: ({ before }) => {
          if (!opts.undo) return;
          const field = Object.keys(change)[0] as keyof BulkChange;
          const groups = new Map<string, string[]>();
          for (const b of before) {
            const key = JSON.stringify(b[field]);
            groups.set(key, [...(groups.get(key) ?? []), b.id]);
          }
          toast(plural(ids.length, t.tasks.bulkDone), {
            action: {
              label: t.common.undo,
              onClick: () => groups.forEach((gIds, key) => bulkUpdate(gIds, { [field]: JSON.parse(key) }, { undo: false })),
            },
          });
        },
        onError: (e) => toast.error(errorText(e), { action: { label: t.common.retry, onClick: () => bulkUpdate(ids, change, opts) } }),
      },
    );
  };

  return {
    patch: run,
    toggle,
    create,
    removeTask,
    reorder: (ids: string[]) => reorder.mutate(ids),
    bulkUpdate,
  };
}

// ---- project -------------------------------------------------------------------------------

export function useProjectActions(projectId: string) {
  const qc = useQueryClient();
  const common = { mutationKey: mutationKeyOf(projectId), scope: scopeOf(projectId) };
  const [conflict, setConflict] = useState<ProjectPatch | null>(null);

  const update = useMutation({
    ...common,
    mutationFn: (patch: ProjectPatch) => {
      const cur = qc.getQueryData<ProjectDetail>(qk.project(projectId))?.project;
      return api<{ project: ProjectRow }>(`/api/projects/${projectId}`, { method: "PATCH", json: projectBody(cur, patch) }).then((r) => r.project);
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.project(projectId) });
      const prev = qc.getQueryData<ProjectDetail>(qk.project(projectId))?.project;
      setDetail(qc, projectId, (d) => ({ ...d, project: { ...d.project, ...patch } }));
      setSummary(qc, projectId, (s) => ({ ...s, ...patch }));
      return { prev };
    },
    onSuccess: (project) => setDetail(qc, projectId, (d) => ({ ...d, project: { ...d.project, ...project } })),
    onError: (e, patch, c) => {
      if (e instanceof ApiError && e.isConflict) {
        const current = (e.details as { current?: ProjectRow })?.current;
        if (current) setDetail(qc, projectId, (d) => ({ ...d, project: { ...d.project, ...current } }));
        setConflict(patch);
        return;
      }
      if (c?.prev) setDetail(qc, projectId, (d) => ({ ...d, project: c.prev! }));
      toast.error(errorText(e), { action: { label: t.common.retry, onClick: () => save(patch) } });
    },
    onSettled: () => refresh(qc, projectId),
  });
  const save = (patch: ProjectPatch) => {
    setConflict(null);
    update.mutate(patch);
  };

  const pin = (pinned: boolean) => {
    setDetail(qc, projectId, (d) => ({ ...d, pinned }));
    setSummary(qc, projectId, (s) => ({ ...s, pinned }));
    api("/api/favorites", { method: "POST", json: { kind: "project", entityId: projectId, pinned } })
      .then(() => toast(pinned ? t.tasks.panel.pinned : t.tasks.panel.unpinned))
      .catch((e) => {
        setDetail(qc, projectId, (d) => ({ ...d, pinned: !pinned }));
        toast.error(errorText(e), { action: { label: t.common.retry, onClick: () => pin(pinned) } });
      })
      .finally(() => {
        qc.invalidateQueries({ queryKey: ["projects"] });
        qc.invalidateQueries({ queryKey: ["favorites"] });
      });
  };

  const archive = (archived: boolean, withUndo = true) =>
    api<{ project: ProjectRow }>(`/api/projects/${projectId}/archive`, { method: "POST", json: { archived } })
      .then(({ project }) => {
        setDetail(qc, projectId, (d) => ({ ...d, project: { ...d.project, ...project } }));
        if (withUndo) {
          toast(archived ? t.tasks.panel.archivedToast : t.tasks.panel.restoredToast, {
            action: { label: t.common.undo, onClick: () => archive(!archived, false) },
          });
        }
      })
      .catch((e) => toast.error(errorText(e), { action: { label: t.common.retry, onClick: () => archive(archived, withUndo) } }))
      .finally(() => refresh(qc, projectId));

  const duplicate = (opts: { name: string; includeNotes: boolean; includeDates: boolean }) =>
    api<{ project: ProjectRow }>(`/api/projects/${projectId}/duplicate`, { method: "POST", json: opts }).then((r) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: qk.counts() });
      return r.project;
    });

  return { save, conflict, dismissConflict: () => setConflict(null), pin, archive, duplicate };
}

// ---- notes saves (fed to useAutosave) -----------------------------------------------------

export function useProjectNotesSave(projectId: string) {
  const qc = useQueryClient();
  return (notes: string, notesVersion: number) =>
    api<{ notes: string; notesVersion: number; updatedAt: string }>(`/api/projects/${projectId}/notes`, { method: "PUT", json: { notes, notesVersion } }).then((r) => {
      setDetail(qc, projectId, (d) => ({ ...d, project: { ...d.project, notes: r.notes, notesVersion: r.notesVersion, updatedAt: r.updatedAt } }));
      qc.invalidateQueries({ queryKey: qk.activity(projectId) });
      return { text: r.notes, version: r.notesVersion, savedAt: r.updatedAt };
    });
}

/** Task notes share the task's version, so they queue behind the panel's other task writes. */
export function useTaskNoteSave(projectId: string) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationKey: mutationKeyOf(projectId),
    scope: scopeOf(projectId),
    mutationFn: ({ taskId, note, version }: { taskId: string; note: string; version: number }) =>
      api<{ task: TaskRow }>(`/api/tasks/${taskId}`, { method: "PATCH", json: { ...taskBody(findTask(qc, projectId, taskId), { note }), version } }).then((r) => r.task),
    onSuccess: (task) => setTask(qc, projectId, task.id, (x) => ({ ...x, note: task.note, version: task.version, updatedAt: task.updatedAt })),
  });
  return (taskId: string, note: string, version: number) =>
    m.mutateAsync({ taskId, note, version }).then((x) => ({ text: x.note, version: x.version, savedAt: x.updatedAt }));
}

// ---- autosave ------------------------------------------------------------------------------

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";
export type TextConflict = { mine: string; theirs: string; theirsVersion: number; theirsSavedAt: string };
type Saved = { text: string; version: number; savedAt: string };

/**
 * Plain-text autosave: debounced after typing stops, flushed on blur and unmount, never replaced by
 * a refetch while local changes are unsaved. A 409 whose server text still equals what we started
 * from (another field bumped the version) re-saves silently; a real conflict is handed to the UI.
 */
export function useAutosave(opts: {
  /** Stable id for drafts and the unsaved registry, e.g. `notes:<projectId>`. */
  key: string;
  serverText: string;
  serverVersion: number;
  save: (text: string, version: number) => Promise<Saved>;
  /** Reads the server copy out of a 409's `details.current`. */
  fromConflict: (current: unknown) => Saved;
  delay?: number;
}) {
  const { key, serverText, serverVersion, delay = 800 } = opts;
  // A draft left by a failed save (or a closed panel) comes back instead of the server text.
  const [text, setTextState] = useState(() => readDraft(key) ?? serverText);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<TextConflict | null>(null);
  const r = useRef({ text, base: serverText, version: serverVersion, saving: false, conflict: false, timer: 0 as unknown as ReturnType<typeof setTimeout> | 0 });
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const dirty = () => r.current.text !== r.current.base;

  // Follow the server only while nothing local is pending.
  useEffect(() => {
    const s = r.current;
    if (s.saving || s.conflict || s.text !== s.base || serverVersion < s.version) return;
    s.text = s.base = serverText;
    s.version = serverVersion;
    setTextState(serverText);
  }, [serverText, serverVersion]);

  const doSave = useCallback(async (): Promise<void> => {
    const s = r.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = 0;
    if (s.saving || s.conflict || !dirty()) return;
    const sending = s.text;
    s.saving = true;
    setStatus("saving");
    try {
      const out = await optsRef.current.save(sending, s.version);
      s.base = sending;
      s.version = out.version;
    } catch (e) {
      s.saving = false;
      if (!(e instanceof ApiError && e.isConflict)) {
        saveDraft(optsRef.current.key, s.text);
        return void setStatus(e instanceof ApiError && e.isOffline ? "offline" : "error");
      }
      const cur = optsRef.current.fromConflict((e.details as { current?: unknown })?.current);
      if (cur.text === s.base || cur.text === sending) {
        // Only the version moved (another field changed), or they saved the same text: no real conflict.
        s.version = cur.version;
        if (cur.text === sending) s.base = sending;
        return doSave();
      }
      s.conflict = true;
      setStatus("idle");
      setConflict({ mine: s.text, theirs: cur.text, theirsVersion: cur.version, theirsSavedAt: cur.savedAt });
      return;
    }
    s.saving = false;
    clearDraft(optsRef.current.key);
    setStatus("saved");
    if (dirty()) return doSave(); // typed while the request was out
  }, []);

  const setText = (v: string) => {
    const s = r.current;
    s.text = v;
    setTextState(v);
    if (s.timer) clearTimeout(s.timer);
    if (!s.conflict) s.timer = setTimeout(doSave, delay);
  };

  const resolve = (choice: "mine" | "theirs" | "both") => {
    const s = r.current;
    const c = conflict;
    if (!c) return;
    s.conflict = false;
    setConflict(null);
    s.version = c.theirsVersion;
    s.base = c.theirs;
    // Anything typed while the dialog was open is part of "mine".
    const next = choice === "theirs" ? c.theirs : choice === "mine" ? s.text : `${c.theirs}\n\n————————\n\n${s.text}`;
    s.text = next;
    setTextState(next);
    if (choice === "theirs") setStatus("saved");
    else void doSave();
  };

  // The registry lets the panel ask before closing over unsaved text; a restored draft saves at once.
  useEffect(() => {
    markUnsaved(key, text !== r.current.base || r.current.saving);
  }, [key, text, status]);
  useEffect(() => {
    if (dirty()) void doSave();
    return () => markUnsaved(key, false);
  }, [key, doSave]);

  // Flush on unmount (panel closed) and warn before leaving with unsaved text.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty() || r.current.saving) e.preventDefault();
    };
    const onOnline = () => void doSave();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      void doSave();
    };
  }, [doSave]);

  return { text, setText, flush: doSave, retry: doSave, status, conflict, resolve, dirty: text !== r.current.base };
}
