"use client";

import { Mail, Phone, User } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import type { ProjectPatch, ProjectRow } from "@/hooks/project-detail";
import { fmt, t } from "@/i18n";
import { InlineText } from "./inline-text";

const p = t.tasks.panel;
const email = z.email();
const phone = /^[+\d\s()./-]*$/;

type Field = "contactName" | "contactEmail" | "contactPhone";

/** Client contact person: each line edits inline; email and phone also link out (mailto:, tel:). */
export function ContactCard({ project, onSave }: { project: ProjectRow; onSave: (patch: ProjectPatch) => void }) {
  const [error, setError] = useState<string | null>(null);
  const save = (field: Field, v: string) => {
    const value = v.trim() || null;
    if (value && field === "contactEmail" && !email.safeParse(value).success) return setError(p.invalidEmail);
    if (value && field === "contactPhone" && !phone.test(value)) return setError(p.invalidPhone);
    setError(null);
    onSave({ [field]: value });
  };
  const rows = [
    { field: "contactName" as const, label: p.contactName, Icon: User, href: null },
    { field: "contactEmail" as const, label: p.contactEmail, Icon: Mail, href: project.contactEmail && `mailto:${project.contactEmail}` },
    { field: "contactPhone" as const, label: p.contactPhone, Icon: Phone, href: project.contactPhone && `tel:${project.contactPhone.replace(/[^+\d]/g, "")}` },
  ];
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-medium">{p.contact}</h3>
      <div className="grid gap-0.5 rounded-lg border bg-card px-2 py-1.5">
        {rows.map(({ field, label, Icon, href }) => {
          const value = project[field] ?? "";
          return (
            <div key={field} className="flex min-h-8 items-center gap-2 text-sm">
              <Icon aria-hidden className="size-4 flex-none text-muted-foreground" />
              <span className="sr-only">{label}</span>
              <div className="min-w-0 flex-1">
                <InlineText
                  value={value}
                  allowEmpty
                  onSave={(v) => save(field, v)}
                  label={label}
                  editLabel={fmt(p.contactEdit, { field: label })}
                  placeholder={label}
                  className="block w-full truncate py-1"
                >
                  {value || <span className="text-muted-foreground">{`${label} · ${p.contactAdd}`}</span>}
                </InlineText>
              </div>
              {href && (
                <a href={href} className="flex-none rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`${label}: ${value}`}>
                  <Icon aria-hidden className="size-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </section>
  );
}
