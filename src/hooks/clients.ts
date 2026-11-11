"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import type { ClientDetail } from "@/server/clients";

export function useClient(name: string) {
  return useQuery({
    queryKey: ["projects", "client", name] as const,
    queryFn: () => api<ClientDetail>(`/api/clients?name=${encodeURIComponent(name)}&today=${todayLocal()}`),
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
  });
}
