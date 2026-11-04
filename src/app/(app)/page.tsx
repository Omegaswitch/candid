import type { Metadata } from "next";
import { Dashboard } from "@/components/projects/dashboard";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.projects.title };

export default function DashboardPage() {
  return <Dashboard />;
}
