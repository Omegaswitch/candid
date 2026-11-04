import { route } from "@/server/http";
import { listTrash } from "@/server/trash";

export const GET = route(async ({ ctx }) => ({ items: await listTrash(ctx) }));
