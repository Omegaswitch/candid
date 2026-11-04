import { body, route, uuidParam } from "@/server/http";
import { changeRole, removeMember, roleInput } from "@/server/members-admin";

export const PATCH = route(
  async ({ ctx, req, params }) => ({ member: await changeRole(ctx, uuidParam(params.id, "Member"), await body(req, roleInput)) }),
  { role: "admin" },
);

export const DELETE = route(async ({ ctx, params }) => {
  await removeMember(ctx, uuidParam(params.id, "Member"));
}, { role: "admin" });
