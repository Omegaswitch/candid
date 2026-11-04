"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMembers } from "@/hooks/queries";
import { useCreateProject, useTemplates } from "@/hooks/projects";
import { fmt, plural, t } from "@/i18n";

const c = t.projects.create;
const NONE = "none";

/** Top-bar primary: "Add project". Also opens from `/?new=1` (the command menu). */
export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="ml-1 h-8 px-2 sm:px-3" aria-label={c.title}>
        <Plus />
        <span className="hidden sm:inline">{t.nav.addProject}</span>
      </Button>
      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpen} />
      </Suspense>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">{open && <NewProjectForm onDone={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function OpenFromUrl({ onOpen }: { onOpen: (open: boolean) => void }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted = pathname === "/" && params.get("new") === "1";
  useEffect(() => {
    if (!wanted) return;
    onOpen(true);
    const rest = new URLSearchParams(params);
    rest.delete("new");
    router.replace(rest.size ? `/?${rest}` : "/", { scroll: false });
  }, [wanted, params, router, onOpen]);
  return null;
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const members = useMembers();
  const templates = useTemplates();
  const create = useCreateProject();
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [ownerId, setOwner] = useState<string>(session.membershipId);
  const [dueDate, setDue] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [templateId, setTemplate] = useState<string>(NONE);
  const [error, setError] = useState<string | null>(null);
  const list = templates.data ?? [];
  const chosen = list.find((x) => x.id === templateId);
  // The checklist starts from the template and stays editable before the project exists.
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");
  const pickTemplate = (id: string) => {
    setTemplate(id);
    setSteps(list.find((x) => x.id === id)?.tasks.map((x) => x.title) ?? []);
  };
  const addStep = () => {
    const v = newStep.trim();
    if (!v) return;
    setSteps((s) => [...s, v]);
    setNewStep("");
  };
  const moveStep = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(c.nameRequired);
    create.mutate(
      {
        name: name.trim(),
        client: client.trim() || null,
        ownerId: ownerId === NONE ? null : ownerId,
        dueDate: dueDate || null,
        priority,
        templateId: null,
        tasks: [...steps, ...(newStep.trim() ? [newStep.trim()] : [])].map((title) => ({ title })),
      },
      {
        onSuccess: (p) => {
          toast.success(fmt(c.created, { name: p.name }));
          onDone();
          const href = `/projects/${p.id}`;
          // On the dashboard the panel follows the URL without a navigation; elsewhere go there.
          if (pathname === "/" || pathname.startsWith("/projects/")) window.history.pushState(null, "", href);
          else router.push(href);
        },
        onError: (err) => setError(err.message || c.failed),
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{c.title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="np-name">{c.name}</Label>
        <Input
          id="np-name"
          autoFocus
          required
          maxLength={200}
          value={name}
          aria-invalid={!!error && !name.trim()}
          aria-describedby={error ? "np-error" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="np-client">{c.client}</Label>
        <Input id="np-client" maxLength={200} value={client} onChange={(e) => setClient(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="np-owner">{c.owner}</Label>
          <Select value={ownerId} onValueChange={setOwner}>
            <SelectTrigger id="np-owner" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t.projects.noOwner}</SelectItem>
              {(members.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="np-priority">{c.priority}</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as "normal" | "high")}>
            <SelectTrigger id="np-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">{t.projects.priority.normal}</SelectItem>
              <SelectItem value="high">{t.projects.priority.high}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="np-due">{c.due}</Label>
        <Input id="np-due" type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} className="w-full" />
      </div>
      {list.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="np-template">{c.template}</Label>
          <Select value={templateId} onValueChange={pickTemplate}>
            <SelectTrigger id="np-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{c.noTemplate}</SelectItem>
              {list.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && (
            <p className="text-xs text-muted-foreground">
              {plural(chosen.tasks.length, c.templateTasks)}
              {chosen.description ? ` · ${chosen.description}` : ""}
            </p>
          )}
        </div>
      )}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{c.steps}</legend>
        {steps.length > 0 && (
          <ol className="grid max-h-56 gap-1 overflow-y-auto">
            {steps.map((s, i) => (
              <li key={`${i}-${s}`} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                <span className="num w-5 flex-none text-right text-xs text-muted-foreground">{i + 1}.</span>
                <Input
                  value={s}
                  onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  onBlur={() => setSteps((all) => all.filter((x) => x.trim()))}
                  aria-label={fmt(c.stepN, { n: i + 1 })}
                  className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
                />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={fmt(c.moveUp, { n: i + 1 })} disabled={i === 0} onClick={() => moveStep(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={fmt(c.moveDown, { n: i + 1 })} disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={fmt(c.removeStep, { n: i + 1 })} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <div className="flex gap-2">
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStep();
              }
            }}
            placeholder={c.addStepPlaceholder}
            aria-label={c.addStep}
          />
          <Button type="button" variant="outline" onClick={addStep} disabled={!newStep.trim()}>
            <Plus /> {c.addStep}
          </Button>
        </div>
      </fieldset>
      {error && (
        <p id="np-error" role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? c.creating : c.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
