"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { qk, useMembers } from "@/hooks/queries";
import { fmt, plural, t } from "@/i18n";
import { api } from "@/lib/api";
import type { MemberSummary } from "@/server/members";
import { PageTitle, SettingsSection } from "./settings-section";

const m = t.settings.members;
type Role = MemberSummary["role"];

export function MembersSettings() {
  const session = useSession();
  const isAdmin = session.role === "admin";
  const members = useMembers();
  const list = members.data ?? [];
  const activeAdmins = list.filter((x) => x.role === "admin" && x.status === "active");

  return (
    <>
      <PageTitle>{m.title}</PageTitle>
      <SettingsSection
        title={m.listTitle}
        description={m.listHelp}
        aside={
          <>
            {members.data && <p className="num">{plural(list.length, m.count)}</p>}
            {!isAdmin && <p className="mt-2">{t.settings.adminOnly}</p>}
          </>
        }
      >
        {members.isPending ? (
          <ul aria-hidden className="flex flex-col">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex h-14 items-center gap-4 border-t first:border-t-0">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-4 w-24" />
              </li>
            ))}
          </ul>
        ) : members.isError ? (
          <div role="alert" className="flex items-center gap-3">
            <p className="flex-1 text-muted-foreground">{m.loadError}</p>
            <Button variant="outline" size="lg" onClick={() => members.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground">{m.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {list.map((p) => (
              <MemberRow
                key={p.id}
                person={p}
                isMe={p.id === session.membershipId}
                isAdmin={isAdmin}
                soleAdmin={p.role === "admin" && p.status === "active" && activeAdmins.length <= 1}
              />
            ))}
          </ul>
        )}
      </SettingsSection>
      {isAdmin && (
        <SettingsSection title={m.inviteTitle} description={m.inviteHelp}>
          <InviteForm />
        </SettingsSection>
      )}
    </>
  );
}

function MemberRow({ person, isMe, isAdmin, soleAdmin }: { person: MemberSummary; isMe: boolean; isAdmin: boolean; soleAdmin: boolean }) {
  const qc = useQueryClient();
  const noteId = useId();
  const setRole = useMutation({
    mutationFn: (role: Role) => api<{ member: MemberSummary }>(`/api/members/${person.id}`, { method: "PATCH", json: { role } }),
    onMutate: (role) => {
      const prev = qc.getQueryData<MemberSummary[]>(qk.members());
      qc.setQueryData<MemberSummary[]>(qk.members(), (l) => l?.map((x) => (x.id === person.id ? { ...x, role } : x)));
      return { prev };
    },
    onError: (e, _r, c) => {
      if (c?.prev) qc.setQueryData(qk.members(), c.prev);
      toast.error(e.message);
    },
    onSuccess: (r) => toast.success(fmt(m.roleChanged, { name: r.member.name, role: t.settings.roles[r.member.role].toLowerCase() })),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.members() }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/members/${person.id}`, { method: "DELETE" }),
    onSuccess: () => toast.success(fmt(m.removed, { name: person.name })),
    onError: (e) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.members() }),
  });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-medium">
          {person.name}
          {isMe && <span className="font-normal text-muted-foreground"> ({m.you})</span>}
        </p>
        {person.name !== person.email && <p className="truncate text-xs text-muted-foreground">{person.email}</p>}
      </div>
      <div className="flex items-center gap-3">
        {person.status === "invited" ? (
          <span className="rounded-full bg-pill-warning px-2 py-0.5 text-xs font-medium text-pill-warning-ink">{t.settings.statuses.invited}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t.settings.statuses.active}</span>
        )}
        {isAdmin ? (
          <Select value={person.role} onValueChange={(v) => setRole.mutate(v as Role)} disabled={soleAdmin || setRole.isPending}>
            <SelectTrigger className="w-28 data-[size=default]:h-9" aria-label={fmt(m.changeRoleFor, { name: person.name })} aria-describedby={soleAdmin ? noteId : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{t.settings.roles.admin}</SelectItem>
              <SelectItem value="member">{t.settings.roles.member}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="w-16">{t.settings.roles[person.role]}</span>
        )}
        {isAdmin &&
          (soleAdmin ? (
            <span id={noteId} className="w-40 text-xs text-muted-foreground">
              {m.lastAdmin}
            </span>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="lg" className="w-40 justify-end text-negative hover:text-negative" aria-label={fmt(m.removeFor, { name: person.name })} disabled={remove.isPending}>
                  {m.remove}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{fmt(m.removeTitle, { name: person.name })}</AlertDialogTitle>
                  <AlertDialogDescription>{fmt(m.removeBody, { name: person.name })}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                    {fmt(m.removeConfirm, { name: person.name })}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ))}
      </div>
    </li>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const id = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const invite = useMutation({
    mutationFn: () => api<{ member: MemberSummary }>("/api/members/invite", { method: "POST", json: { email, role } }),
    onSuccess: (r) => {
      toast.success(fmt(m.invited, { email: r.member.email }));
      setEmail("");
      setRole("member");
      qc.invalidateQueries({ queryKey: qk.members() });
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        invite.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>{m.inviteEmail}</Label>
          <Input
            id={`${id}-email`}
            type="email"
            required
            autoComplete="off"
            className="h-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invite.isError || undefined}
            aria-describedby={invite.isError ? `${id}-err` : undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-role`}>{m.inviteRole}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id={`${id}-role`} className="w-32 data-[size=default]:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">{t.settings.roles.member}</SelectItem>
              <SelectItem value="admin">{t.settings.roles.admin}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {invite.isError && (
        <p id={`${id}-err`} role="alert" className="text-negative">
          {invite.error.message}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={!email.trim() || invite.isPending}>
          {invite.isPending ? m.inviting : m.invite}
        </Button>
      </div>
    </form>
  );
}
