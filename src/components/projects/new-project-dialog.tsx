"use client";

import { Plus } from "lucide-react";
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
        templateId: templateId === NONE ? null : templateId,
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
          <Select value={templateId} onValueChange={setTemplate}>
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
