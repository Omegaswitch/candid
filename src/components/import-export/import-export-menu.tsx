"use client";

import { ArrowDownUp, Download, FileDown, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

// Dialogs (and exceljs/papaparse inside them) load only when opened.
const ImportWizard = dynamic(() => import("./import-wizard").then((m) => m.ImportWizard), { ssr: false });
const ExportDialog = dynamic(() => import("./export-dialog").then((m) => m.ExportDialog), { ssr: false });

const PROJECT_PATH = /^\/projects\/([0-9a-f-]{36})(?:\/|$)/i;

/** Top-bar "Import / export" menu. */
export function ImportExportMenu() {
  const s = t.importExport.menu;
  const [open, setOpen] = useState<"import" | "export" | null>(null);
  // Each opening of the wizard is a new import with its own idempotency key.
  const [session, setSession] = useState(0);
  const projectId = PROJECT_PATH.exec(usePathname() ?? "")?.[1];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="max-md:size-8 max-md:px-0" aria-label={s.button}>
            <ArrowDownUp className="size-4" />
            <span className="max-md:sr-only">{s.button}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            onSelect={() => {
              setSession((n) => n + 1);
              setOpen("import");
            }}
          >
            <Upload className="size-4" />
            {s.importProjects}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("export")}>
            <Download className="size-4" />
            {s.export}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/api/import/template" download>
              <FileDown className="size-4" />
              {s.template}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "import" && <ImportWizard key={session} open onOpenChange={(o) => !o && setOpen(null)} />}
      {open === "export" && (
        <ExportDialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          preset={projectId ? { scope: "project", projectIds: [projectId] } : undefined}
        />
      )}
    </>
  );
}
