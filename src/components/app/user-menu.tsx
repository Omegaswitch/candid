"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";
import { initials } from "@/lib/people";
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
        <Button variant="ghost" size="icon" aria-label={`${t.nav.userMenu}: ${s.name}`}>
          <span className="flex size-6 items-center justify-center rounded-full bg-raised text-[11px] font-medium">{initials(s.name)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{s.name}</div>
          <div className="truncate text-xs text-muted-foreground">{s.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings className="size-4" />{t.nav.settings}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="size-4" />
          {t.common.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
