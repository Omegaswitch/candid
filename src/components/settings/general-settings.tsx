"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useSession } from "@/components/app/session";
import { t } from "@/i18n";
import { formatInstant } from "@/lib/dates";
import { Field, PageTitle, SettingsSection } from "./settings-section";

const g = t.settings.general;

export function GeneralSettings() {
  const session = useSession();
  const { theme } = useTheme();
  // Browser-only values: read after mount so server and client render the same first frame.
  const [local, setLocal] = useState<{ zone: string; now: string; theme: string } | null>(null);
  useEffect(() => {
    setLocal({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: formatInstant(new Date()),
      theme: t.common.theme[(theme ?? "system") as "light" | "dark" | "system"] ?? t.common.theme.system,
    });
  }, [theme]);

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
    </>
  );
}
