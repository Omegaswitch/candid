import type { Metadata } from "next";
import { ArchiveList } from "@/components/projects/archive-list";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.projects.archive.title });

export default function ArchivePage() {
  return <ArchiveList />;
}
