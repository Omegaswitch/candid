import type { Metadata } from "next";
import { DocumentsPage } from "@/components/documents/documents-page";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.documents.title });

export default function Page() {
  return <DocumentsPage />;
}
