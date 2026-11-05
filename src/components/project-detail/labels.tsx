"use client";

import { Check, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LabelChips } from "@/components/projects/project-bits";
import { LABEL_COLORS, labelClass, useLabelMutations, useLabels, useSetProjectLabels, type LabelColor } from "@/hooks/labels";
import { fmt, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { CommitInput } from "./inline-text";

const l = t.projects.labels;

function Swatch({ color, selected, onClick, label }: { color: LabelColor; selected?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-5 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        labelClass[color],
        selected && "ring-2 ring-foreground/60",
      )}
    >
      {selected && <Check className="size-3" aria-hidden />}
    </button>
  );
}

/** The project's labels as chips, with a popover to assign, create, rename, recolour and delete workspace labels. */
export function ProjectLabels({ projectId, labelIds }: { projectId: string; labelIds: string[] }) {
  const labels = useLabels();
  const assign = useSetProjectLabels(projectId);
  const { create, update, remove } = useLabelMutations();
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("neutral");
  const all = labels.data ?? [];
  const chosen = all.filter((x) => labelIds.includes(x.id));

  const toggle = (id: string) => assign.mutate(labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id]);
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { name: n, color },
      {
        onSuccess: (created) => {
          setName("");
          assign.mutate([...labelIds, created.id]);
        },
      },
    );
  };
  const next = (c: LabelColor) => LABEL_COLORS[(LABEL_COLORS.indexOf(c) + 1) % LABEL_COLORS.length];

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5">
      <LabelChips labels={chosen} />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" aria-label={l.edit}>
            <Tag aria-hidden /> {chosen.length ? null : l.none}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-2 p-2">
          <ul className="grid max-h-64 gap-0.5 overflow-y-auto">
            {all.map((x) => {
              const on = labelIds.includes(x.id);
              return (
                <li key={x.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={x.name}
                    onClick={() => toggle(x.id)}
                    className="flex size-6 flex-none items-center justify-center rounded-md border outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {on && <Check className="size-3.5" aria-hidden />}
                  </button>
                  <Swatch color={x.color} label={`${l.newColor}: ${l.colors[x.color]}`} onClick={() => update.mutate({ id: x.id, color: next(x.color) })} />
                  <CommitInput
                    value={x.name}
                    aria-label={`${l.rename}: ${x.name}`}
                    maxLength={60}
                    onCommit={(v) => update.mutate({ id: x.id, name: v })}
                    className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 shadow-none hover:border-input"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 flex-none text-muted-foreground"
                    aria-label={`${l.remove}: ${x.name}`}
                    onClick={() => window.confirm(fmt(l.removeConfirm, { name: x.name })) && remove.mutate(x.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
          <form
            className="grid gap-2 border-t pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={l.search} aria-label={l.search} maxLength={60} className="h-8" />
            <div className="flex items-center gap-1.5" role="group" aria-label={l.newColor}>
              {LABEL_COLORS.map((c) => (
                <Swatch key={c} color={c} selected={c === color} label={l.colors[c]} onClick={() => setColor(c)} />
              ))}
              <Button type="submit" size="sm" className="ml-auto h-7" disabled={!name.trim() || create.isPending}>
                <Plus aria-hidden /> <span className="max-w-32 truncate">{fmt(l.create, { name: name.trim() || "…" })}</span>
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
