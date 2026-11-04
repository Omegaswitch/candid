"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProjects } from "@/hooks/queries";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const MAX = 8;

/** Sidebar group: the viewer's pinned projects, in dashboard order. */
export function PinnedProjects({ onNavigate }: { onNavigate?: () => void }) {
  const projects = useProjects();
  const pathname = usePathname();
  const pinned = (projects.data ?? []).filter((p) => p.pinned).slice(0, MAX);
  return (
    <section aria-labelledby="pinned-projects-label" className="flex flex-col gap-0.5">
      <h2 id="pinned-projects-label" className="mb-1 px-2.5 text-xs font-normal text-muted-foreground">
        {t.nav.pinned}
      </h2>
      {projects.isPending ? null : pinned.length === 0 ? (
        <p className="px-2.5 text-xs text-muted-foreground">{t.nav.noPinned}</p>
      ) : (
        pinned.map((p) => {
          const href = `/projects/${p.id}`;
          const active = pathname === href;
          return (
            <Link
              key={p.id}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                active && "bg-sidebar-accent text-foreground",
              )}
            >
              <span className="truncate">{p.name}</span>
            </Link>
          );
        })
      )}
    </section>
  );
}
