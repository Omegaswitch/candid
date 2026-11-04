"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Archive,
  CalendarClock,
  Circle,
  CircleAlert,
  CircleCheck,
  Download,
  FileText,
  FolderKanban,
  Hourglass,
  ListChecks,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommandDialog, Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fmt } from "@/i18n";
import { search as s } from "@/i18n/en/search";
import { api } from "@/lib/api";
import { isTypingTarget } from "@/lib/keyboard";
import type { SearchResults } from "@/server/search";

type Entry = { id: string; label: string; icon: LucideIcon; run: (go: (href: string) => void, setTheme: (t: string) => void) => void };

const NAVIGATION: Entry[] = [
  { id: "nav:all", label: s.nav.allProjects, icon: FolderKanban, run: (go) => go("/") },
  { id: "nav:mine", label: s.nav.myTasks, icon: ListChecks, run: (go) => go("/my-tasks") },
  { id: "nav:due", label: s.nav.dueSoon, icon: CalendarClock, run: (go) => go("/due-soon") },
  { id: "nav:overdue", label: s.nav.overdue, icon: CircleAlert, run: (go) => go("/overdue") },
  { id: "nav:waiting", label: s.nav.waiting, icon: Hourglass, run: (go) => go("/waiting") },
  { id: "nav:archive", label: s.nav.archive, icon: Archive, run: (go) => go("/archive") },
  { id: "nav:documents", label: s.nav.documents, icon: FileText, run: (go) => go("/documents") },
  { id: "nav:settings", label: s.nav.settings, icon: Settings, run: (go) => go("/settings") },
];

const ACTIONS: Entry[] = [
  { id: "act:new", label: s.actions.addProject, icon: Plus, run: (go) => go("/?new=1") },
  { id: "act:import", label: s.actions.importProjects, icon: Upload, run: (go) => go("/?import=1") },
  { id: "act:export", label: s.actions.export, icon: Download, run: (go) => go("/?export=1") },
  { id: "act:light", label: s.actions.themeLight, icon: Sun, run: (_, setTheme) => setTheme("light") },
  { id: "act:dark", label: s.actions.themeDark, icon: Moon, run: (_, setTheme) => setTheme("dark") },
  { id: "act:system", label: s.actions.themeSystem, icon: Monitor, run: (_, setTheme) => setTheme("system") },
];

/** Same folding as the server: case and diacritics ignored. */
const fold = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const subscribeNone = () => () => {};
const isMac = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export function CommandMenu() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  // Server render cannot know the platform; the client corrects it after hydration.
  const mac = useSyncExternalStore(subscribeNone, isMac, () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim().slice(0, 100);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(id);
  }, [term]);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: ({ signal }) => api<SearchResults>(`/api/search?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: open && debounced.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQ("");
  };
  const run = (entry: Entry) => {
    changeOpen(false);
    entry.run((href) => router.push(href), setTheme);
  };
  const go = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  const f = fold(term);
  const nav = term ? NAVIGATION.filter((e) => fold(e.label).includes(f)) : NAVIGATION;
  const actions = term ? ACTIONS.filter((e) => fold(e.label).includes(f)) : ACTIONS;
  const data = term ? results.data : undefined;
  const serverCount = data ? data.projects.length + data.tasks.length + data.documents.length : 0;
  const pending = !!term && (term !== debounced || results.isFetching);
  const showEmpty = !!term && !pending && !results.isError && serverCount === 0 && nav.length === 0 && actions.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-full items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
        <span className="truncate">{s.placeholder}</span>
        <kbd className="ml-auto shrink-0 rounded border bg-background px-1.5 font-sans text-xs leading-5 text-muted-foreground">
          {mac ? s.shortcutMac : s.shortcutOther}
        </kbd>
      </button>
      <div className="flex justify-end sm:hidden">
        <Button variant="ghost" size="icon" aria-label={s.label} onClick={() => setOpen(true)}>
          <Search className="size-4" />
        </Button>
      </div>

      <CommandDialog open={open} onOpenChange={changeOpen} title={s.dialogTitle} description={s.dialogDescription} className="sm:max-w-xl">
        <Command shouldFilter={false} loop>
          <CommandInput value={q} onValueChange={setQ} placeholder={s.inputPlaceholder} maxLength={100} />
          <CommandList className="max-h-[min(24rem,60vh)]">
            {pending && !data && (
              <div className="p-1" role="status" aria-label={s.searching}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex h-8 items-center gap-2 px-2">
                    <Skeleton className="size-4" />
                    <Skeleton className={`h-3.5 ${i ? "w-1/3" : "w-1/2"}`} />
                  </div>
                ))}
              </div>
            )}
            {term && results.isError && !pending && (
              <div role="alert" className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                <span className="text-muted-foreground">{s.failed}</span>
                <Button variant="outline" size="sm" onClick={() => results.refetch()}>
                  {s.retry}
                </Button>
              </div>
            )}
            {showEmpty && <Status>{fmt(s.noMatches, { q: term })}</Status>}

            {!!data?.projects.length && (
              <CommandGroup heading={s.groups.projects}>
                {data.projects.map((p) => (
                  <CommandItem key={p.id} value={`project:${p.id}`} onSelect={() => go(`/projects/${p.id}`)}>
                    <FolderKanban strokeWidth={1.6} className="text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                    {p.client && <span className="truncate text-xs text-muted-foreground">{p.client}</span>}
                    {p.archived && (
                      <span className="ml-auto shrink-0 rounded-sm bg-pill-neutral px-1.5 text-xs leading-5 text-pill-neutral-ink">{s.archived}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.tasks.length && (
              <CommandGroup heading={s.groups.tasks}>
                {data.tasks.map((t) => (
                  <CommandItem key={t.id} value={`task:${t.id}`} onSelect={() => go(`/projects/${t.projectId}`)}>
                    {t.done ? (
                      <CircleCheck strokeWidth={1.6} className="text-positive" aria-label={s.done} />
                    ) : (
                      <Circle strokeWidth={1.6} className="text-muted-foreground" aria-hidden />
                    )}
                    <span className={t.done ? "truncate text-muted-foreground line-through" : "truncate"}>{t.title}</span>
                    <span className="ml-auto max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{t.projectName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.documents.length && (
              <CommandGroup heading={s.groups.documents}>
                {data.documents.map((d) => (
                  <CommandItem key={d.id} value={`document:${d.id}`} onSelect={() => go(`/documents?open=${d.id}`)}>
                    <FileText strokeWidth={1.6} className="text-muted-foreground" />
                    <span className="truncate">{d.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <StaticGroup heading={s.groups.navigation} entries={nav} onRun={run} />
            <StaticGroup heading={s.groups.actions} entries={actions} onRun={run} />
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function StaticGroup({ heading, entries, onRun }: { heading: string; entries: Entry[]; onRun: (e: Entry) => void }) {
  if (!entries.length) return null;
  return (
    <CommandGroup heading={heading}>
      {entries.map((e) => (
        <CommandItem key={e.id} value={e.id} onSelect={() => onRun(e)}>
          <e.icon strokeWidth={1.6} className="text-muted-foreground" />
          <span>{e.label}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function Status({ children }: { children: string }) {
  return (
    <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
