import type { Metadata } from "next";
import { IntegrationsSettings } from "@/components/settings/integrations-settings";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: `${t.settings.integrations.title} · ${t.settings.title}` });

export default async function IntegrationsSettingsPage({ searchParams }: PageProps<"/settings/integrations">) {
  const q = await searchParams;
  const err = typeof q.google_error === "string" ? q.google_error : null;
  return <IntegrationsSettings connected={q.connected === "1"} callbackError={err} />;
}
