"use client";

import {
  Archive,
  CalendarClock,
  ChartNoAxesColumn,
  CircleAlert,
  CircleHelp,
  Trash2,
  FolderKanban,
  Hourglass,
  ListChecks,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DocumentShelf } from "@/components/documents/document-shelf";
import { ImportExportMenu } from "@/components/import-export/import-export-menu";
import { NewProjectButton } from "@/components/projects/new-project-dialog";
import { PinnedProjects } from "@/components/projects/pinned-projects";
import { CommandMenu } from "@/components/search/command-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCounts, usePrefs, useSavePrefs } from "@/hooks/queries";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useSession } from "./session";
import { ThemeMenu } from "./theme-menu";
import { UserMenu } from "./user-menu";
import { OfflineNotice } from "./offline-notice";
import { ShortcutsDialog } from "./shortcuts-dialog";

type NavItem = { href: string; label: string; icon: LucideIcon; count?: "mine" | "dueThisWeek" | "overdue" | "waiting" };

const NAV: NavItem[] = [
  { href: "/", get label() { return t.nav.allProjects; }, icon: FolderKanban },
  { href: "/my-tasks", get label() { return t.nav.myTasks; }, icon: ListChecks, count: "mine" },
  { href: "/due-soon", get label() { return t.nav.dueSoon; }, icon: CalendarClock, count: "dueThisWeek" },
  { href: "/overdue", get label() { return t.nav.overdue; }, icon: CircleAlert, count: "overdue" },
  { href: "/waiting", get label() { return t.nav.waiting; }, icon: Hourglass, count: "waiting" },
  { href: "/analytics", get label() { return t.nav.analytics; }, icon: ChartNoAxesColumn },
  { href: "/archive", get label() { return t.nav.archive; }, icon: Archive },
  { href: "/trash", get label() { return t.nav.trash; }, icon: Trash2 },
];

/** The product mark: a ticked line over an open line — a checklist, drawn for Candid. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn("size-5", className)}>
      <rect x="1" y="1" width="18" height="18" rx="5" className="fill-foreground" />
      <path d="M5 7.2l1.6 1.6L9.6 5.8" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-background" />
      <path d="M11.5 7.5H15M5 13h10" fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-background" />
    </svg>
  );
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useCounts();
  const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/projects/") : pathname.startsWith(item.href);
  const n = item.count ? counts.data?.[item.count] : undefined;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-3 text-[15px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className="size-[18px] shrink-0" strokeWidth={1.6} aria-hidden />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
      {!collapsed && !!n && (
        <span className={cn("num ml-auto text-xs", item.count === "overdue" ? "font-medium text-negative" : "text-muted-foreground")}>{n}</span>
      )}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {n ? ` · ${n}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const session = useSession();
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 pb-3 pt-4">
      <div className={cn("flex items-center gap-2.5 px-2.5", collapsed && "justify-center px-0")}>
        <Mark />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="font-semibold">{t.common.appName}</div>
            {/* The workspace line only when it says something the app name does not. */}
            {session.workspaceName && session.workspaceName !== t.common.appName && (
              <div className="truncate text-xs text-muted-foreground">{session.workspaceName}</div>
            )}
          </div>
        )}
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
      {!collapsed && (
        <>
          <PinnedProjects onNavigate={onNavigate} />
          <DocumentShelf />
        </>
      )}
      <div className="mt-auto flex flex-col gap-0.5">
        <NavLink item={{ href: "/help", get label() { return t.nav.help; }, icon: CircleHelp }} collapsed={collapsed} onNavigate={onNavigate} />
        <NavLink item={{ href: "/settings", get label() { return t.nav.settings; }, icon: Settings }} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const savePrefs = useSavePrefs();
  const collapsed = prefs.data?.sidebarCollapsed ?? false;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        {t.nav.skipToContent}
      </a>
      {/* Desktop sidebar: on the page ground, one hairline, folds to a labelled-by-tooltip rail. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-150 lg:block",
          collapsed ? "w-16" : "w-72",
        )}
      >
        <SidebarBody collapsed={collapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(20rem,88vw)] bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t.nav.openMenu}</SheetTitle>
          </SheetHeader>
          <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/100 px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t.nav.openMenu} onClick={() => setMobileOpen(true)}>
            <Menu className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
            aria-pressed={collapsed}
            onClick={() => savePrefs.mutate({ sidebarCollapsed: !collapsed })}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <div className="flex lg:hidden items-center gap-2">
            <Mark className="size-4" />
          </div>
          <div className="mx-auto w-full max-w-md">
            <CommandMenu />
          </div>
          <div className="flex items-center gap-1">
            <ImportExportMenu />
            <ThemeMenu />
            <UserMenu />
            <NewProjectButton />
          </div>
        </header>
        <OfflineNotice />
        <ShortcutsDialog />
        <main id="main" tabIndex={-1} className="flex-1 px-4 pb-10 pt-6 outline-none lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
