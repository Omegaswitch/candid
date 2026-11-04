"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useSession } from "@/components/app/session";
import { t } from "@/i18n";
import { formatInstant } from "@/lib/dates";
import { Field, PageTitle, SettingsSection } from "./settings-section";

const g = t.settings.general;
const noop = () => () => {};

export function GeneralSettings() {
  const session = useSession();
  const { theme } = useTheme();
  // Browser-only values: false on the server and during hydration, so both render the same first frame.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const local = mounted
    ? {
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        now: formatInstant(new Date()),
        theme: t.common.theme[(theme ?? "system") as "light" | "dark" | "system"] ?? t.common.theme.system,
      }
    : null;

  return (
    <>
      <PageTitle>{g.title}</PageTitle>
      <SettingsSection title={g.profileTitle} description={g.profileHelp}>
        <dl>
          <Field label={g.name}>{session.name}</Field>
          <Field label={g.email}>{session.email}</Field>
          <Field label={g.role}>{t.settings.roles[session.role]}</Field>
          <Field label={g.workspace}>{session.workspaceName || t.common.none}</Field>
        </dl>
      </SettingsSection>
      <SettingsSection title={g.appearanceTitle} description={g.appearanceHelp}>
        <p>{g.themeNote}</p>
        <dl className="mt-3">
          <Field label={g.currentTheme}>{local?.theme ?? t.common.none}</Field>
        </dl>
      </SettingsSection>
      <SettingsSection title={g.timezoneTitle} description={g.timezoneHelp}>
        <dl>
          <Field label={g.timezone}>{local?.zone ?? t.common.none}</Field>
          <Field label={g.localTime}>
            <span className="num">{local?.now ?? t.common.none}</span>
          </Field>
        </dl>
      </SettingsSection>
      <SettingsSection title={g.privacyTitle} description={g.privacyHelp}>
        <Link href="/privacy" className="font-medium underline-offset-4 hover:underline">
          {g.privacyLink}
        </Link>
      </SettingsSection>
    </>
  );
}
