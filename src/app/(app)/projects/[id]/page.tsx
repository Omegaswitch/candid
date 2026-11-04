import type { Metadata } from "next";
import { Dashboard } from "@/components/projects/dashboard";
import { t } from "@/i18n";

// Static on purpose: the title (and the link preview) never carries the project name.
export const metadata: Metadata = { title: t.projects.panelTitle };

/** Shareable address of an open project: the dashboard with that project's panel open (archived ones too). */
export default function ProjectPage() {
  return <Dashboard />;
}
