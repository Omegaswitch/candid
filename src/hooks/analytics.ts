"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import type { Analytics } from "@/server/analytics";

const analyticsKey = () => ["analytics"] as const;

export function useAnalytics() {
  return useQuery({ queryKey: analyticsKey(), queryFn: () => api<Analytics>(`/api/analytics?today=${todayLocal()}`), staleTime: 60_000 });
}
