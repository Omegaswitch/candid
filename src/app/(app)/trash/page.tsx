import type { Metadata } from "next";
import { TrashList } from "@/components/trash/trash-list";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.trash.title });

export default function TrashPage() {
  return <TrashList />;
}
