import "dotenv/config";
import { execSync } from "node:child_process";

/** Integration tests run against TEST_DATABASE_URL (a separate database), migrated fresh. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to a disposable database for tests");
  execSync("npx drizzle-kit migrate", { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }, stdio: "inherit" });
}
