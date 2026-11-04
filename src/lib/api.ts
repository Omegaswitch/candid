export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get isConflict() {
    return this.status === 409;
  }
  /** Network failure or offline: the change did not reach the server. */
  get isOffline() {
    return this.status === 0;
  }
}

/** JSON fetch for our own /api routes. Throws ApiError; status 0 means it never reached the server. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "offline", "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "server", e.message ?? res.statusText, e.details);
  }
  return data as T;
}
