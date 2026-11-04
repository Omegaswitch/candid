import type { Metadata } from "next";
import { TemplatesSettings } from "@/components/settings/templates-settings";
import { t } from "@/i18n";

export const metadata: Metadata = { title: `${t.settings.templates.title} · ${t.settings.title}` };

export default function TemplatesSettingsPage() {
  return <TemplatesSettings />;
}
