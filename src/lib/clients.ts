/** The client page of a client name. The name is URL-encoded; matching on the server ignores case and accents. */
export const clientHref = (name: string) => `/clients/${encodeURIComponent(name.trim())}`;
