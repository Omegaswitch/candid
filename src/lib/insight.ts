// Pure helpers for "how long has this project been like this": shared by the server (filters, tests)
// and the browser (badges, sort), so the rule lives in one place.

/** A project that is active or waiting and has had no movement for this many days is "idle". */
export const IDLE_DAYS = 14;

const DAY_MS = 86_400_000;

/** Whole days between an instant (ISO timestamp) and `now`; never negative. */
export function daysSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS));
}

type Idleable = { status: "active" | "waiting" | "completed"; lastActivityAt: string };

/** Days without any movement (history entry, step change, note) for an open project, else null. */
export function idleDays(p: Idleable, now = Date.now(), threshold = IDLE_DAYS) {
  if (p.status === "completed") return null;
  const days = daysSince(p.lastActivityAt, now);
  return days >= threshold ? days : null;
}

/** "Needs attention": idle, or has overdue steps. Completed projects never do. */
export function needsAttention(p: Idleable & { overdueCount: number }, now = Date.now()) {
  return p.status !== "completed" && (p.overdueCount > 0 || idleDays(p, now) !== null);
}
