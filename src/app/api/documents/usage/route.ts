import { route } from "@/server/http";
import { storageUsage } from "@/server/documents";

export const GET = route(async ({ ctx }) => storageUsage(ctx));
