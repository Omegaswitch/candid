/**
 * The development stand-ins (AUTH_MODE=dev, STORAGE_DRIVER=local) fail closed: never on Vercel or
 * CI, and not in a production build unless ALLOW_DEV_STAND_INS=1 (local performance runs only).
 */
export function assertLocalStandInAllowed(what: string) {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.CI) {
    throw new Error(`${what} is a development stand-in and must not run on a deployment or CI.`);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_STAND_INS !== "1") {
    throw new Error(`${what} is a development stand-in. Refusing in a production build (set ALLOW_DEV_STAND_INS=1 only for local testing).`);
  }
}

/** Requests to a stand-in must come to this machine itself. */
export const isLocalHost = (host: string | null) => !!host && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
