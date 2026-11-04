"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/app/session";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fmt, plural, t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { TemplateDto } from "@/server/templates";
import { SettingsSection } from "./settings-section";

const s = t.settings.templates;

// Same key and data (the template array) as useTemplates() in src/hooks/projects.ts.
function useTemplateList() {
  return useQuery({
    queryKey: qk.templates(),
    queryFn: () => api<{ templates: TemplateDto[] }>("/api/templates").then((r) => r.templates),
  });
}

export function TemplatesSettings() {
  const isAdmin = useSession().role === "admin";
  const list = useTemplateList();
  const [drafting, setDrafting] = useState(false);
  const templates = list.data ?? [];

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        {isAdmin && list.isSuccess && templates.length > 0 && !drafting && (
          <Button variant="outline" size="lg" onClick={() => setDrafting(true)}>
            <Plus aria-hidden />
            {s.add}
          </Button>
        )}
      </div>
      <p className="mb-8 max-w-2xl text-muted-foreground">
        {s.help} {!isAdmin && t.settings.adminOnly}
      </p>

      {list.isPending ? (
        <SettingsSection title={s.listTitle}>
          <div aria-hidden className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        </SettingsSection>
      ) : list.isError ? (
        <SettingsSection title={s.listTitle}>
          <div role="alert" className="flex items-center gap-3">
            <p className="flex-1 text-muted-foreground">{s.loadError}</p>
            <Button variant="outline" size="lg" onClick={() => list.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        </SettingsSection>
      ) : (
        <>
          {drafting && <TemplateEditor template={null} onDone={() => setDrafting(false)} />}
          {templates.length === 0 && !drafting ? (
            <SettingsSection title={s.listTitle}>
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted-foreground">{s.empty}</p>
                {isAdmin && (
                  <Button size="lg" onClick={() => setDrafting(true)}>
                    <Plus aria-hidden />
                    {s.add}
                  </Button>
                )}
              </div>
            </SettingsSection>
          ) : (
            templates.map((tpl) =>
              isAdmin ? <TemplateEditor key={tpl.id} template={tpl} /> : <TemplateReadOnly key={tpl.id} template={tpl} />,
            )
          )}
        </>
      )}
    </>
  );
}

function TemplateReadOnly({ template }: { template: TemplateDto }) {
  return (
    <SettingsSection title={template.name} description={template.description} aside={<p className="num">{plural(template.tasks.length, s.taskCount)}</p>}>
      {template.tasks.length === 0 ? (
        <p className="text-muted-foreground">{s.noTasks}</p>
      ) : (
        <ol className="flex flex-col">
          {template.tasks.map((task, i) => (
            <li key={task.id} className="flex h-10 items-center gap-3 border-t first:border-t-0">
              <span className="num w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 truncate">{task.title}</span>
            </li>
          ))}
        </ol>
      )}
    </SettingsSection>
  );
}

type DraftTask = { key: string; title: string; note: string };
type Draft = { name: string; description: string; tasks: DraftTask[] };
let keySeq = 0;
const nextKey = () => `k${++keySeq}`;
const toDraft = (tpl: TemplateDto | null): Draft => ({
  name: tpl?.name ?? "",
  description: tpl?.description ?? "",
  tasks: (tpl?.tasks ?? []).map((x) => ({ key: x.id, title: x.title, note: x.note })),
});
const same = (a: Draft, b: Draft) =>
  a.name === b.name && a.description === b.description && a.tasks.length === b.tasks.length && a.tasks.every((x, i) => x.title === b.tasks[i].title && x.note === b.tasks[i].note);

/** One panel per template; one Save per panel. A new template is a local draft until saved. */
function TemplateEditor({ template, onDone }: { template: TemplateDto | null; onDone?: () => void }) {
  const qc = useQueryClient();
  const id = useId();
  const [base, setBase] = useState(() => toDraft(template));
  const [version, setVersion] = useState(template?.version ?? 1);
  const [draft, setDraft] = useState(base);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const dirty = !template || !same(draft, base);

  const save = useMutation({
    mutationFn: () => {
      const json = { name: draft.name, description: draft.description || null, tasks: draft.tasks.map(({ title, note }) => ({ title, note })) };
      return template
        ? api<{ template: TemplateDto }>(`/api/templates/${template.id}`, { method: "PUT", json: { ...json, version } })
        : api<{ template: TemplateDto }>("/api/templates", { method: "POST", json });
    },
    onSuccess: ({ template: saved }) => {
      toast.success(template ? s.saved : s.created);
      qc.setQueryData<TemplateDto[]>(qk.templates(), (l) => {
        const rest = (l ?? []).filter((x) => x.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      if (template) {
        const next = toDraft(saved);
        setBase(next);
        setDraft(next);
        setVersion(saved.version);
      } else onDone?.();
      setNotice(null);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.isConflict) {
        const current = (e.details as { current?: TemplateDto })?.current;
        if (current) {
          const next = toDraft(current);
          setBase(next);
          setDraft(next);
          setVersion(current.version);
        }
        setNotice(s.conflict);
        qc.invalidateQueries({ queryKey: qk.templates() });
      } else setNotice(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/templates/${template!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(fmt(s.deleted, { name: template!.name }));
      qc.setQueryData<TemplateDto[]>(qk.templates(), (l) => l?.filter((x) => x.id !== template!.id));
    },
    onError: (e) => toast.error(e.message),
  });

  const setTask = (i: number, patch: Partial<DraftTask>) => setDraft((d) => ({ ...d, tasks: d.tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const focusTask = (i: number) => requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLInputElement>("input")[i]?.focus());
  const move = (i: number, by: -1 | 1) => {
    setDraft((d) => {
      const tasks = [...d.tasks];
      [tasks[i], tasks[i + by]] = [tasks[i + by], tasks[i]];
      return { ...d, tasks };
    });
  };
  const addTask = () => {
    setDraft((d) => ({ ...d, tasks: [...d.tasks, { key: nextKey(), title: "", note: "" }] }));
    focusTask(draft.tasks.length);
  };

  const submit = () => {
    setProblem(null);
    if (!draft.name.trim()) return setProblem(s.nameRequired);
    if (draft.tasks.some((x) => !x.title.trim())) return setProblem(s.taskRequired);
    save.mutate();
  };

  const title = template?.name ?? s.newName;
  return (
    <SettingsSection
      title={title}
      description={template?.description}
      aside={<p className="num">{plural(draft.tasks.length, s.taskCount)}</p>}
    >
      <form
        className="flex flex-col gap-4"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && dirty && template) {
            e.preventDefault();
            setDraft(base);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>{s.name}</Label>
          <Input id={`${id}-name`} className="h-9" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus={!template} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-desc`}>{s.description}</Label>
          <Textarea
            id={`${id}-desc`}
            rows={2}
            maxLength={500}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            aria-describedby={`${id}-desc-hint`}
          />
          <p id={`${id}-desc-hint`} className="text-xs text-muted-foreground">
            {s.descriptionHint}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">{s.tasks}</legend>
          {draft.tasks.length === 0 ? (
            <p className="text-muted-foreground">{s.noTasks}</p>
          ) : (
            <ol ref={listRef} className="flex flex-col gap-2">
              {draft.tasks.map((task, i) => {
                const name = task.title.trim() || s.untitled;
                return (
                  <li key={task.key} className="flex items-center gap-2">
                    <span className="num w-5 shrink-0 text-right text-xs text-muted-foreground" aria-hidden>
                      {i + 1}
                    </span>
                    <Input
                      className="h-9 min-w-0 flex-1"
                      value={task.title}
                      maxLength={200}
                      placeholder={s.taskPlaceholder}
                      aria-label={fmt(s.taskTitle, { n: i + 1 })}
                      onChange={(e) => setTask(i, { title: e.target.value })}
                    />
                    <Button type="button" variant="ghost" size="icon-lg" aria-label={fmt(s.moveUp, { title: name })} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={fmt(s.moveDown, { title: name })}
                      disabled={i === draft.tasks.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={fmt(s.removeTask, { title: name })}
                      onClick={() => {
                        setDraft((d) => ({ ...d, tasks: d.tasks.filter((_, j) => j !== i) }));
                        focusTask(Math.max(0, i - 1));
                      }}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
          <div>
            <Button type="button" variant="outline" size="lg" onClick={addTask}>
              <Plus aria-hidden />
              {s.addTask}
            </Button>
          </div>
        </fieldset>

        {(problem || notice) && (
          <p role="alert" className="text-negative">
            {problem ?? notice}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {template ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="lg" className="text-negative hover:text-negative" disabled={remove.isPending}>
                  {s.delete}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{fmt(s.deleteTitle, { name: template.name })}</AlertDialogTitle>
                  <AlertDialogDescription>{s.deleteBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                    {fmt(s.deleteConfirm, { name: template.name })}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button type="button" variant="ghost" size="lg" onClick={onDone}>
              {t.common.cancel}
            </Button>
          )}
          <div className="flex items-center gap-3">
            {template && dirty && <span className="text-xs text-muted-foreground">{s.unsaved}</span>}
            <Button type="submit" size="lg" variant={dirty ? "default" : "outline"} disabled={!dirty || save.isPending}>
              {save.isPending ? t.common.saving : s.save}
            </Button>
          </div>
        </div>
      </form>
    </SettingsSection>
  );
}
