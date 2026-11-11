"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProjectRow } from "@/hooks/project-detail";
import { fmt, t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { formatDay, todayLocal } from "@/lib/dates";
import { qk } from "@/lib/query-keys";
import type { CalendarRange, CalendarStep } from "@/server/calendar";
import type { ContactKind, FollowUp } from "@/server/follow-ups";

const c = t.calendar;

/** Steps, project due dates and follow-ups for one visible range, in a single request. */
export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: qk.calendar(from, to),
    queryFn: () => api<CalendarRange>(`/api/calendar?from=${from}&to=${to}`),
    // Paging months keeps the old grid on screen until the next one lands.
    placeholderData: keepPreviousData,
  });
}

const patchSteps = (qc: QueryClient, fn: (s: CalendarStep) => CalendarStep) =>
  qc.setQueriesData<CalendarRange>({ queryKey: ["calendar"] }, (d) => (d ? { ...d, steps: d.steps.map(fn) } : d));

/** What a change to a project's dates or steps can affect elsewhere. */
export function invalidateAfterDateChange(qc: QueryClient, projectId?: string) {
  qc.invalidateQueries({ queryKey: ["calendar"] });
  qc.invalidateQueries({ queryKey: qk.followUps() });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: qk.counts() });
  if (projectId) {
    qc.invalidateQueries({ queryKey: qk.project(projectId) });
    qc.invalidateQueries({ queryKey: qk.activity(projectId) });
  }
}

/**
 * Drag a step to another day: the existing task PATCH with its version, optimistic on the calendar,
 * with an Undo toast that moves it back (using the version the first write returned).
 */
export function useMoveStep() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ step, dueDate }: { step: CalendarStep; dueDate: string }) =>
      api<{ task: { version: number } }>(`/api/tasks/${step.id}`, { method: "PATCH", json: { dueDate, version: step.version } }).then((r) => r.task),
    onMutate: async ({ step, dueDate }) => {
      await qc.cancelQueries({ queryKey: ["calendar"] });
      const prev = qc.getQueriesData<CalendarRange>({ queryKey: ["calendar"] });
      patchSteps(qc, (s) => (s.id === step.id ? { ...s, dueDate } : s));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (_d, _e, { step }) => invalidateAfterDateChange(qc, step.projectId),
  });

  const move = (step: CalendarStep, dueDate: string, undoable = true) => {
    if (step.dueDate === dueDate) return;
    m.mutate(
      { step, dueDate },
      {
        onSuccess: (task) => {
          patchSteps(qc, (s) => (s.id === step.id ? { ...s, version: task.version } : s));
          const text = fmt(c.moved, { title: step.title, date: formatDay(dueDate, todayLocal())! });
          if (undoable) toast(text, { action: { label: t.common.undo, onClick: () => move({ ...step, dueDate, version: task.version }, step.dueDate, false) } });
          else toast(text);
        },
        onError: (e) =>
          toast.error(fmt(e instanceof ApiError && e.isConflict ? c.changedElsewhere : c.moveFailed, { title: step.title }), {
            action: e instanceof ApiError && e.isConflict ? undefined : { label: t.common.retry, onClick: () => move(step, dueDate, undoable) },
          }),
      },
    );
  };
  return move;
}

/** Follow-ups due today or earlier, for the "Contact today" list. */
export function useDueFollowUps() {
  return useQuery({
    queryKey: qk.followUps(),
    queryFn: () => api<{ items: FollowUp[] }>(`/api/follow-ups?today=${todayLocal()}`).then((r) => r.items),
  });
}

/** "Done": clears the follow-up on the server (which writes the history entry). Optimistic in the list. */
export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: Pick<FollowUp, "projectId" | "name">) => api(`/api/follow-ups/${f.projectId}`, { method: "DELETE" }),
    onMutate: async (f) => {
      await qc.cancelQueries({ queryKey: qk.followUps() });
      const prev = qc.getQueryData<FollowUp[]>(qk.followUps());
      qc.setQueryData<FollowUp[]>(qk.followUps(), (list) => list?.filter((x) => x.projectId !== f.projectId));
      return { prev };
    },
    onSuccess: (_d, f) => toast(fmt(c.due.doneToast, { name: f.name })),
    onError: (_e, f, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.followUps(), ctx.prev);
      toast.error(fmt(c.due.failed, { name: f.name }));
    },
    onSettled: (_d, _e, f) => invalidateAfterDateChange(qc, f.projectId),
  });
}

/** Quick contact log in the project panel. */
export function useLogContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: ContactKind; outcome: string; followUpOn?: string | null }) =>
      api<{ project: ProjectRow }>(`/api/projects/${projectId}/contact`, { method: "POST", json: v }).then((r) => r.project),
    onSuccess: (project) => {
      qc.setQueryData<{ project: ProjectRow }>(qk.project(projectId), (d) => (d ? { ...d, project: { ...d.project, ...project } } : d));
      toast(c.contact.saved);
    },
    onError: () => toast.error(c.contact.failed),
    onSettled: () => invalidateAfterDateChange(qc, projectId),
  });
}
