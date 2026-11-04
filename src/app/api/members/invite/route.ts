import { body, route } from "@/server/http";
import { inviteInput, inviteMember } from "@/server/members-admin";

export const POST = route(async ({ ctx, req }) => ({ member: await inviteMember(ctx, await body(req, inviteInput)) }), { role: "admin" });
