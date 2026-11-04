"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, t } from "@/i18n";
import { api } from "@/lib/api";
import { formatBytes } from "@/components/documents/file-types";

// Cloudflare R2's free allowance; past it, R2 bills per GB. shortcut: fixed figure, make it an env var if the plan changes.
const FREE_BYTES = 10 * 1024 ** 3;

/** How much of the document storage this workspace uses, as a bar against the free 10 GB. */
export function StorageUsage() {
  const s = t.settings.storage;
  const q = useQuery({
    queryKey: ["documents", "usage"],
    queryFn: () => api<{ files: number; bytes: number; removedBytes: number }>("/api/documents/usage"),
  });
  if (q.isPending) return <Skeleton className="h-14 w-full" />;
  if (q.isError) return <p className="text-muted-foreground">{t.common.errorGeneric}</p>;
  const { files, bytes, removedBytes } = q.data;
  const total = bytes + removedBytes;
  const pct = Math.min(100, (total / FREE_BYTES) * 100);
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="num text-lg font-semibold">{formatBytes(total) ?? "0 B"}</span>
        <span className="num text-sm text-muted-foreground">{fmt(s.of, { limit: "10 GB", pct: pct < 1 && total > 0 ? "<1" : Math.round(pct) })}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={s.title}>
        <div className={pct > 90 ? "h-full bg-negative" : pct > 70 ? "h-full bg-warning" : "h-full bg-hue"} style={{ width: `${Math.max(pct, total ? 1 : 0)}%` }} />
      </div>
      <p className="num text-sm text-muted-foreground">
        {fmt(s.files, { n: files })}
        {removedBytes > 0 && ` · ${fmt(s.pending, { size: formatBytes(removedBytes) ?? "" })}`}
      </p>
    </div>
  );
}
