/** Query keys in one place so mutations invalidate exactly what they affect. */
export const qk = {
  projects: (archived = false) => ["projects", { archived }] as const,
  project: (id: string) => ["project", id] as const,
  counts: () => ["counts"] as const,
  members: () => ["members"] as const,
  prefs: () => ["prefs"] as const,
  taskView: (view: string) => ["tasks", view] as const,
  documents: () => ["documents"] as const,
  templates: () => ["templates"] as const,
  labels: () => ["labels"] as const,
  googleStatus: () => ["google", "status"] as const,
  search: (q: string) => ["search", q] as const,
  activity: (projectId: string) => ["activity", projectId] as const,
  calendar: (from: string, to: string) => ["calendar", from, to] as const,
  followUps: () => ["follow-ups"] as const,
  apiTokens: () => ["api-tokens"] as const,
};

