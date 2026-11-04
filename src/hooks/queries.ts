"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import type { MemberSummary } from "@/server/members";
import type { Prefs } from "@/server/preferences";
import type { ProjectSummary } from "@/server/projects";
import { qk } from "@/lib/query-keys";

export { qk };

export function useProjects(archived = false) {
  return useQuery({
    queryKey: qk.projects(archived),
    queryFn: () => api<{ projects: ProjectSummary[] }>(`/api/projects?today=${todayLocal()}${archived ? "&archived=1" : ""}`).then((r) => r.projects),
  });
}

export type Counts = { activeProjects: number; overdue: number; dueThisWeek: number; mine: number; waiting: number };
export function useCounts() {
  return useQuery({ queryKey: qk.counts(), queryFn: () => api<Counts>(`/api/counts?today=${todayLocal()}`) });
}

export function useMembers() {
  return useQuery({
    queryKey: qk.members(),
    queryFn: () => api<{ members: MemberSummary[] }>("/api/members").then((r) => r.members),
    staleTime: 5 * 60_000,
  });
}

export function usePrefs() {
  return useQuery({ queryKey: qk.prefs(), queryFn: () => api<{ prefs: Prefs }>("/api/preferences").then((r) => r.prefs), staleTime: Infinity, refetchInterval: false });
}

/** Optimistic: the UI changes at once, the server copy follows. */
export function useSavePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Prefs>) => api<{ prefs: Prefs }>("/api/preferences", { method: "PATCH", json: patch }).then((r) => r.prefs),
    onMutate: (patch) => {
      const prev = qc.getQueryData<Prefs>(qk.prefs());
      if (prev) qc.setQueryData(qk.prefs(), { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, c) => c?.prev && qc.setQueryData(qk.prefs(), c.prev),
    onSuccess: (prefs) => qc.setQueryData(qk.prefs(), prefs),
  });
}
