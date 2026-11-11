"use client";

import { createContext, use, type ReactNode } from "react";

export type Session = { membershipId: string; role: "admin" | "member"; name: string; email: string; workspaceName: string; authMode: "clerk" | "dev";
  /** The server render already had the date-dependent lists (projects, counts): see the app layout. */
  seeded?: boolean;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const s = use(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
