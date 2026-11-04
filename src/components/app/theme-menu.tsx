"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.common.theme.label}>
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t.common.theme.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun className="size-4" />{t.common.theme.light}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="size-4" />{t.common.theme.dark}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="size-4" />{t.common.theme.system}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
