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
  History,
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
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommandDialog, Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fmt, t } from "@/i18n";
import { api } from "@/lib/api";
import { formatDay, todayLocal } from "@/lib/dates";
import { highlight, type ParsedQuery } from "@/lib/search-query";
import { clearSearchHistory, readRecentProjects, readRecentQueries, rememberProject, rememberQuery } from "@/lib/search-history";
import { isTypingTarget } from "@/lib/keyboard";
import type { RecentProject, SearchResults, Snippet } from "@/server/search";

// A lazy view of the active locale (see src/i18n/index.ts), safe at module level.
const s = t.search;

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

const PROJECT_PATH = /^\/projects\/([^/?#]+)/;
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
};

const subscribeNone = () => () => {};
const isMac = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export function CommandMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  // Bumped when the stored history changes, so the lists below are re-read.
  const [historyVersion, setHistoryVersion] = useState(0);
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

  // Every project page visited is remembered for "Recently opened".
  useEffect(() => {
    const id = PROJECT_PATH.exec(pathname)?.[1];
    if (id) rememberProject(id);
  }, [pathname]);

  const term = q.trim().slice(0, 100);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(id);
  }, [term]);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: ({ signal }) =>
      api<SearchResults>(`/api/search?q=${encodeURIComponent(debounced)}&today=${todayLocal()}&tz=${encodeURIComponent(timeZone())}`, { signal }),
    enabled: open && debounced.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Read while open only: the server render and the first client render both see an empty history.
  const recentIds = useMemo(() => (open ? readRecentProjects() : []), [open, historyVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const recentQueries = useMemo(() => (open ? readRecentQueries() : []), [open, historyVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useQuery({
    queryKey: ["search", "recent", recentIds],
    queryFn: ({ signal }) => api<{ projects: RecentProject[] }>(`/api/search?recent=${recentIds.join(",")}`, { signal }),
    enabled: open && !term && recentIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const recentProjects = !term ? (recent.data?.projects ?? []) : [];

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQ("");
  };
  /** Closes the menu; a query that led to a result or command is remembered. */
  const leave = () => {
    rememberQuery(term);
    changeOpen(false);
  };
  const run = (entry: Entry) => {
    leave();
    entry.run((href) => router.push(href), setTheme);
  };
  const go = (href: string) => {
    leave();
    router.push(href);
  };
  const clearHistory = () => {
    clearSearchHistory();
    setHistoryVersion((v) => v + 1);
  };

  const f = fold(term);
  const nav = term ? NAVIGATION.filter((e) => fold(e.label).includes(f)) : NAVIGATION;
  const actions = term ? ACTIONS.filter((e) => fold(e.label).includes(f)) : ACTIONS;
  const data = term ? results.data : undefined;
  const terms = data?.query.terms ?? [];
  const hl = (text: string) => <Highlighted text={text} terms={terms} />;
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
            {!term && (recentProjects.length > 0 || recentQueries.length > 0) && (
              <>
                {recentProjects.length > 0 && (
                  <CommandGroup heading={s.recent}>
                    {recentProjects.map((p) => (
                      <CommandItem key={p.id} value={`recent:${p.id}`} onSelect={() => go(`/projects/${p.id}`)}>
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
                {recentQueries.length > 0 && (
                  <CommandGroup heading={s.history}>
                    {recentQueries.map((rq) => (
                      <CommandItem key={rq} value={`query:${rq}`} onSelect={() => setQ(rq)}>
                        <History strokeWidth={1.6} className="text-muted-foreground" />
                        <span className="truncate">{rq}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandGroup>
                  <CommandItem value="history:clear" onSelect={clearHistory} aria-label={s.clearRecentLabel}>
                    <span className="text-xs text-muted-foreground">{s.clearRecent}</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            {data && <QueryChips query={data.query} />}
            {showEmpty && <Status>{fmt(s.noMatches, { q: term })}</Status>}

            {!!data?.projects.length && (
              <CommandGroup heading={s.groups.projects}>
                {data.projects.map((p) => (
                  <CommandItem key={p.id} value={`project:${p.id}`} onSelect={() => go(`/projects/${p.id}`)}>
                    <FolderKanban strokeWidth={1.6} className="self-start text-muted-foreground" />
                    <ResultBody snippet={p.snippet} terms={terms}>
                      <span className="truncate">{hl(p.name)}</span>
                      {p.client && <span className="truncate text-xs text-muted-foreground">{hl(p.client)}</span>}
                      {p.labels.map((l) => (
                        <span key={l.name} className="shrink-0 rounded-sm bg-pill-neutral px-1.5 text-xs leading-5 text-pill-neutral-ink">
                          {hl(l.name)}
                        </span>
                      ))}
                    </ResultBody>
                    {p.archived && (
                      <span className="ml-auto shrink-0 self-start rounded-sm bg-pill-neutral px-1.5 text-xs leading-5 text-pill-neutral-ink">{s.archived}</span>
                    )}
                  </CommandItem>
                ))}
                {data.more.includes("project") && <More />}
              </CommandGroup>
            )}
            {!!data?.tasks.length && (
              <CommandGroup heading={s.groups.tasks}>
                {data.tasks.map((t) => (
                  <CommandItem key={t.id} value={`task:${t.id}`} onSelect={() => go(`/projects/${t.projectId}`)}>
                    {t.done ? (
                      <CircleCheck strokeWidth={1.6} className="self-start text-positive" aria-label={s.done} />
                    ) : (
                      <Circle strokeWidth={1.6} className="self-start text-muted-foreground" aria-hidden />
                    )}
                    <ResultBody snippet={t.snippet} terms={terms}>
                      <span className={t.done ? "truncate text-muted-foreground line-through" : "truncate"}>{hl(t.title)}</span>
                      {t.dueDate && (data.query.overdue || data.query.dates.some((d) => d.field === "due")) && <span className="shrink-0 text-xs text-negative">{formatDay(t.dueDate)}</span>}
                    </ResultBody>
                    <span className="ml-auto max-w-[40%] shrink-0 self-start truncate text-xs text-muted-foreground">{t.projectName}</span>
                  </CommandItem>
                ))}
                {data.more.includes("task") && <More />}
              </CommandGroup>
            )}
            {!!data?.documents.length && (
              <CommandGroup heading={s.groups.documents}>
                {data.documents.map((d) => (
                  <CommandItem key={d.id} value={`document:${d.id}`} onSelect={() => go(`/documents?open=${d.id}`)}>
                    <FileText strokeWidth={1.6} className="self-start text-muted-foreground" />
                    <ResultBody snippet={d.snippet} terms={terms}>
                      <span className="truncate">{hl(d.name)}</span>
                    </ResultBody>
                    {d.projectName && (
                      <span className="ml-auto max-w-[40%] shrink-0 self-start truncate text-xs text-muted-foreground">{d.projectName}</span>
                    )}
                  </CommandItem>
                ))}
                {data.more.includes("document") && <More />}
              </CommandGroup>
            )}

            <StaticGroup heading={s.groups.navigation} entries={nav} onRun={run} />
            <StaticGroup heading={s.groups.actions} entries={actions} onRun={run} />
            {!term && (
              <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">
                {s.syntaxHint}
                <br />
                {s.syntaxExample}
              </p>
            )}
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

/** Matching parts of `text` (accent/case-insensitive, same folding as the server) in <mark>. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  return (
    <>
      {highlight(text, terms).map((seg, i) =>
        seg.match ? (
          <mark key={i} className="rounded-[2px] bg-pill-warning px-px text-pill-warning-ink">
            {seg.text}
          </mark>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

/** Title row plus, when the match is in notes or PDF text, a snippet around it. */
function ResultBody({ children, snippet, terms }: { children: ReactNode; snippet: Snippet | null; terms: string[] }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      {snippet && (
        <p className="line-clamp-2 text-xs leading-snug break-words text-muted-foreground">
          {snippet.before && "…"}
          <Highlighted text={snippet.text} terms={terms} />
          {snippet.after && "…"}
        </p>
      )}
    </div>
  );
}

function dateValue(d: ParsedQuery["dates"][number]) {
  return d.kind === "today" ? s.filters.today : d.kind === "days" ? `${d.n}d` : d.day!;
}

function QueryChips({ query }: { query: ParsedQuery }) {
  const no = (text: string) => `${s.filters.not}: ${text}`;
  const chips = [
    query.client && `${s.filters.client}: ${query.client}`,
    query.label && `${s.filters.label}: ${query.label}`,
    query.assignee && `${s.filters.assignee}: ${query.assignee}`,
    query.owner && `${s.filters.owner}: ${query.owner}`,
    ...query.types.map((t) => s.types[t]),
    query.overdue && s.filters.overdue,
    ...query.dates.map((d) => {
      const text = `${s.filters[d.field]}: ${dateValue(d)}`;
      return d.negated ? no(text) : text;
    }),
    ...query.not.client.map((v) => no(`${s.filters.client}: ${v}`)),
    ...query.not.label.map((v) => no(`${s.filters.label}: ${v}`)),
    ...query.not.assignee.map((v) => no(`${s.filters.assignee}: ${v}`)),
    ...query.not.owner.map((v) => no(`${s.filters.owner}: ${v}`)),
    ...query.not.types.map((t) => no(s.types[t])),
    query.not.overdue && no(s.filters.overdue),
    ...query.notTerms.map((v) => no(v)),
  ].filter(Boolean) as string[];
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1 px-2 pt-2 pb-1">
      {chips.map((c, i) => (
        <span key={`${i}:${c}`} className="rounded-sm bg-pill-neutral px-1.5 text-xs leading-5 text-pill-neutral-ink">
          {c}
        </span>
      ))}
    </div>
  );
}

function More() {
  return <p className="px-2 py-1 text-xs text-muted-foreground">{s.more}</p>;
}
