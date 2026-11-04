"use client";

import { ArrowDownUp, Download, FileDown, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getViewIds } from "@/lib/view-context";
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
  const pathname = usePathname();
  const projectId = PROJECT_PATH.exec(pathname ?? "")?.[1];
  const params = useSearchParams();
  const router = useRouter();
  const viewIds = pathname === "/" ? getViewIds() : null;

  // The command menu opens these via /?import=1 and /?export=1.
  useEffect(() => {
    const want = params.get("import") === "1" ? "import" : params.get("export") === "1" ? "export" : null;
    if (!want) return;
    if (want === "import") setSession((n) => n + 1);
    setOpen(want);
    router.replace(pathname ?? "/");
  }, [params, pathname, router]);

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
          preset={
            projectId
              ? { scope: "project", projectIds: [projectId] }
              : viewIds?.length
                ? { scope: "view", projectIds: viewIds }
                : undefined
          }
        />
      )}
    </>
  );
}
