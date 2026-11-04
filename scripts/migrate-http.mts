/**
 * Applies drizzle migrations to Neon over HTTPS (port 443) using Neon's SQL-over-HTTP endpoint.
 * For environments where outbound Postgres (5432) is blocked. Records the same journal table as
 * `drizzle-kit migrate`, so either can be used afterwards.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url?.includes("neon.tech")) throw new Error("DATABASE_URL(_UNPOOLED) must point at Neon");
await migrate(drizzle(neon(url)), { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
