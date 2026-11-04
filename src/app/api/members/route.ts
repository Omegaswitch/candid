import { route } from "@/server/http";
import { listMembers } from "@/server/members";

export const GET = route(async ({ ctx }) => ({ members: await listMembers(ctx), me: { id: ctx.membershipId, role: ctx.role } }));
