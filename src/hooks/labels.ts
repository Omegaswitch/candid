"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { Label, LabelColor } from "@/server/labels";
import type { ProjectSummary } from "@/server/projects";
import type { ProjectDetail } from "./project-detail";

export type { Label, LabelColor };
export const LABEL_COLORS: LabelColor[] = ["neutral", "hue", "positive", "warning", "negative"];
export const labelClass: Record<LabelColor, string> = {
  neutral: "bg-pill-neutral text-pill-neutral-ink",
  hue: "bg-pill-hue text-pill-hue-ink",
  positive: "bg-pill-positive text-pill-positive-ink",
  warning: "bg-pill-warning text-pill-warning-ink",
  negative: "bg-pill-negative text-pill-negative-ink",
};

export function useLabels() {
  return useQuery({
    queryKey: qk.labels(),
    queryFn: () => api<{ labels: Label[] }>("/api/labels").then((r) => r.labels),
    staleTime: 60_000,
    refetchInterval: 60_000, // labels change rarely; the shared 30 s poll is for tasks and projects
  });
}

const failed = (e: unknown) => toast.error(e instanceof ApiError && e.status === 422 ? t.projects.labels.duplicate : t.projects.labels.saveFailed);

/** Create, rename/recolour and delete workspace labels. Project summaries refresh after each. */
export function useLabelMutations() {
  const qc = useQueryClient();
  const settle = () => {
    qc.invalidateQueries({ queryKey: qk.labels() });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const create = useMutation({
    mutationFn: (b: { name: string; color: LabelColor }) => api<{ label: Label }>("/api/labels", { method: "POST", json: b }).then((r) => r.label),
    onError: failed,
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ id, ...b }: { id: string; name?: string; color?: LabelColor }) =>
      api<{ label: Label }>(`/api/labels/${id}`, { method: "PATCH", json: b }).then((r) => r.label),
    onError: failed,
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/labels/${id}`, { method: "DELETE" }),
    onError: failed,
    onSettled: (_d, _e, id) => {
      settle();
      qc.setQueriesData<ProjectDetail>({ queryKey: ["project"] }, (d) => (d?.labelIds ? { ...d, labelIds: d.labelIds.filter((x) => x !== id) } : d));
    },
  });
  return { create, update, remove };
}

/** Optimistic: the panel and the cards show the new set at once; failure rolls back. */
export function useSetProjectLabels(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelIds: string[]) => api(`/api/projects/${projectId}/labels`, { method: "PUT", json: { labelIds } }),
    onMutate: async (labelIds) => {
      await qc.cancelQueries({ queryKey: qk.project(projectId) });
      const prev = qc.getQueryData<ProjectDetail>(qk.project(projectId));
      if (prev) qc.setQueryData(qk.project(projectId), { ...prev, labelIds });
      const all = qc.getQueryData<Label[]>(qk.labels()) ?? [];
      const chosen = all.filter((l) => labelIds.includes(l.id));
      qc.setQueriesData<ProjectSummary[]>({ queryKey: ["projects"] }, (list) =>
        Array.isArray(list) ? list.map((s) => (s.id === projectId ? { ...s, labels: chosen } : s)) : list,
      );
      return { prev };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(qk.project(projectId), c.prev);
      failed(e);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: qk.activity(projectId) });
    },
  });
}
