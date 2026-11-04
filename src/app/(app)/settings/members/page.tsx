import type { Metadata } from "next";
import { MembersSettings } from "@/components/settings/members-settings";
import { t } from "@/i18n";

export const metadata: Metadata = { title: `${t.settings.members.title} · ${t.settings.title}` };

export default function MembersSettingsPage() {
  return <MembersSettings />;
}
