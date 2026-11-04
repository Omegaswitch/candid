"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const ITEMS = [
  { href: "/settings", get label() { return t.settings.nav.general; } },
  { href: "/settings/members", get label() { return t.settings.nav.members; } },
  { href: "/settings/templates", get label() { return t.settings.nav.templates; } },
  { href: "/settings/integrations", get label() { return t.settings.nav.integrations; } },
] as const;

/** Plain links, one per settings area; each area is its own route with its own h1. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label={t.settings.navLabel} className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 px-1">
        {ITEMS.map((item) => {
          const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-3 whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring",
                  active ? "bg-raised font-medium text-foreground" : "text-muted-foreground hover:bg-raised/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
