"use client";

import { createContext, use, type ReactNode } from "react";

export type Session = { membershipId: string; role: "admin" | "member"; name: string; email: string; workspaceName: string; authMode: "clerk" | "dev" };
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const s = use(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
