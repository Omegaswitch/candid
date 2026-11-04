import type { Metadata } from "next";
import { GeneralSettings } from "@/components/settings/general-settings";
import { t } from "@/i18n";

export const metadata: Metadata = { title: `${t.settings.general.title} · ${t.settings.title}` };

export default function GeneralSettingsPage() {
  return <GeneralSettings />;
}
