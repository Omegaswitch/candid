"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmt, t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { qk } from "@/lib/query-keys";
import type { ProjectSummary } from "@/server/projects";

export type TaskViewName = "mine" | "due-soon" | "overdue" | "waiting";
export type TaskViewItem = {
  task: {
    id: string;
    projectId: string;
    title: string;
    done: boolean;
    assigneeId: string | null;
    dueDate: string | null;
    waiting: boolean;
    waitingReason: string | null;
    version: number;
  };
  project: { id: string; name: string; client: string | null; priority: "normal" | "high" };
};

export function useTaskView(view: TaskViewName) {
  return useQuery({
    queryKey: qk.taskView(view),
    queryFn: () => api<{ items: TaskViewItem[] }>(`/api/tasks?view=${view}&today=${todayLocal()}`).then((r) => r.items),
  });
}

export type Template = { id: string; name: string; description: string | null; tasks: { id: string; title: string }[] };
/** Templates are optional: a missing endpoint or an error simply means "no templates". */
export function useTemplates(enabled = true) {
  return useQuery({
    queryKey: qk.templates(),
    enabled,
    queryFn: () =>
      api<{ templates: Template[] }>("/api/templates")
        .then((r) => r.templates ?? [])
        .catch(() => [] as Template[]),
    staleTime: 60_000,
  });
}

const ARCHIVE_PAGE = 30;
export function useArchivedProjects() {
  return useInfiniteQuery({
    queryKey: [...qk.projects(true), "pages"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ projects: ProjectSummary[] }>(`/api/projects?archived=1&today=${todayLocal()}&limit=${ARCHIVE_PAGE}&offset=${pageParam}`).then(
        (r) => r.projects,
      ),
    getNextPageParam: (last, all) => (last.length < ARCHIVE_PAGE ? undefined : all.length * ARCHIVE_PAGE),
  });
}

const setActive = (qc: QueryClient, fn: (list: ProjectSummary[]) => ProjectSummary[]) => {
  const prev = qc.getQueryData<ProjectSummary[]>(qk.projects());
  if (prev) qc.setQueryData(qk.projects(), fn(prev));
  return prev;
};
const afterProjectChange = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: qk.counts() });
  qc.invalidateQueries({ queryKey: ["tasks"] });
};

/** Optimistic reorder of the active list; the server rewrites every position. */
export function useReorderProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api("/api/projects/reorder", { method: "POST", json: { ids } }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.projects() });
      const prev = setActive(qc, (list) => {
        const byId = new Map(list.map((p) => [p.id, p]));
        return ids.map((id, i) => ({ ...byId.get(id)!, position: i })).filter((p) => p.id);
      });
      return { prev };
    },
    onError: (_e, _ids, c) => {
      if (c?.prev) qc.setQueryData(qk.projects(), c.prev);
      toast.error(t.projects.couldNotReorder);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects() }),
  });
}

export function useSetPinned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api("/api/favorites", { method: "POST", json: { kind: "project", entityId: id, pinned } }),
    onMutate: async ({ id, pinned }) => {
      await qc.cancelQueries({ queryKey: qk.projects() });
      const prev = setActive(qc, (list) => list.map((p) => (p.id === id ? { ...p, pinned } : p)));
      return { prev };
    },
    onError: (_e, _v, c) => {
      if (c?.prev) qc.setQueryData(qk.projects(), c.prev);
      toast.error(t.projects.couldNotPin);
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: qk.project(id) });
    },
  });
}

/** Archive or restore, each with an Undo toast that performs the opposite. */
export function useSetArchived() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean; name: string }) =>
      api(`/api/projects/${id}/archive`, { method: "POST", json: { archived } }),
    onMutate: async ({ id, archived }) => {
      if (!archived) return { prev: undefined };
      await qc.cancelQueries({ queryKey: qk.projects() });
      return { prev: setActive(qc, (list) => list.filter((p) => p.id !== id)) };
    },
    onError: (_e, { archived, name }, c) => {
      if (c?.prev) qc.setQueryData(qk.projects(), c.prev);
      toast.error(fmt(archived ? t.projects.couldNotArchive : t.projects.couldNotRestore, { name }));
    },
    onSuccess: (_d, v) => {
      toast.success(fmt(v.archived ? t.projects.archived : t.projects.restored, { name: v.name }), {
        action: { label: t.common.undo, onClick: () => m.mutate({ ...v, archived: !v.archived }) },
      });
    },
    onSettled: (_d, _e, { id }) => {
      afterProjectChange(qc);
      qc.invalidateQueries({ queryKey: qk.project(id) });
    },
  });
  return m;
}

export function useDuplicateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string; name: string; includeNotes: boolean; includeDates: boolean }) =>
      api<{ project: { id: string; name: string } }>(`/api/projects/${id}/duplicate`, { method: "POST", json: b }).then((r) => r.project),
    onSuccess: (p) => toast.success(fmt(t.projects.duplicate.done, { name: p.name })),
    onError: () => toast.error(t.projects.duplicate.failed),
    onSettled: () => afterProjectChange(qc),
  });
}

export type NewProject = {
  name: string;
  client: string | null;
  ownerId: string | null;
  dueDate: string | null;
  priority: "normal" | "high";
  templateId: string | null;
};
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: NewProject) => api<{ project: { id: string; name: string } }>("/api/projects", { method: "POST", json: b }).then((r) => r.project),
    onSettled: () => afterProjectChange(qc),
  });
}

/**
 * Optimistic complete/reopen from a cross-project view. The row stays (ticked) until the view
 * refreshes, so Undo has something to act on. Failure rolls back; a conflict refetches.
 */
export function useToggleTask() {
  const qc = useQueryClient();
  const patchViews = (id: string, patch: Partial<TaskViewItem["task"]>) =>
    qc.setQueriesData<TaskViewItem[]>({ queryKey: ["tasks"] }, (items) =>
      items?.map((it) => (it.task.id === id ? { ...it, task: { ...it.task, ...patch } } : it)),
    );
  return useMutation({
    mutationFn: ({ id, done, version }: { id: string; done: boolean; version: number; title: string }) =>
      api<{ task: TaskViewItem["task"] }>(`/api/tasks/${id}`, { method: "PATCH", json: { done, version } }).then((r) => r.task),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = qc.getQueriesData<TaskViewItem[]>({ queryKey: ["tasks"] });
      patchViews(id, { done });
      return { snapshot };
    },
    onError: (e, _v, c) => {
      c?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      if (e instanceof ApiError && e.isConflict) qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onSuccess: (task) => patchViews(task.id, { done: task.done, version: task.version }),
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: qk.counts() });
      qc.invalidateQueries({ queryKey: qk.projects() });
      const projectId = qc
        .getQueriesData<TaskViewItem[]>({ queryKey: ["tasks"] })
        .flatMap(([, d]) => d ?? [])
        .find((it) => it.task.id === id)?.task.projectId;
      if (projectId) qc.invalidateQueries({ queryKey: qk.project(projectId) });
    },
  });
}
