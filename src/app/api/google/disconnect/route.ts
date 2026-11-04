import { disconnect } from "@/server/google";
import { route } from "@/server/http";

export const POST = route(async ({ ctx }) => {
  await disconnect(ctx);
});
