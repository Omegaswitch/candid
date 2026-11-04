import { getStatus } from "@/server/google";
import { route } from "@/server/http";

export const GET = route(async ({ ctx }) => getStatus(ctx));
