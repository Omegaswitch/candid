import { body, route } from "@/server/http";
import { getPrefs, prefsSchema, savePrefs } from "@/server/preferences";

export const GET = route(async ({ ctx }) => ({ prefs: await getPrefs(ctx) }));
export const PATCH = route(async ({ ctx, req }) => ({ prefs: await savePrefs(ctx, await body(req, prefsSchema.partial())) }));
