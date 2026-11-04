"use client";

import { LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmt, t } from "@/i18n";
import { initials } from "@/lib/people";
import { LanguageSwitch } from "./language-switch";
import { useSession } from "./session";

export function UserMenu() {
  const s = useSession();
  async function signOut() {
    if (s.authMode === "dev") {
      await fetch("/api/dev/sign-in", { method: "DELETE" });
      window.location.href = "/sign-in";
      return;
    }
    const { Clerk } = window as unknown as { Clerk?: { signOut: (o: { redirectUrl: string }) => Promise<void> } };
    await Clerk?.signOut({ redirectUrl: "/sign-in" });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The visible initials are part of the accessible name (WCAG 2.5.3 label in name). */}
        <Button variant="ghost" size="icon" aria-label={fmt(t.nav.userMenuLabel, { initials: initials(s.name), name: s.name })}>
          <span className="flex size-6 items-center justify-center rounded-full bg-raised text-[11px] font-medium">{initials(s.name)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{s.name}</div>
          <div className="truncate text-xs text-muted-foreground">{s.email}</div>
        </DropdownMenuLabel>
        <div className="px-2 pb-2" onKeyDown={(e) => e.stopPropagation()}>
          <LanguageSwitch className="w-full" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings className="size-4" />{t.nav.settings}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/privacy"><ShieldCheck className="size-4" />{t.nav.privacy}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="size-4" />
          {t.common.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
