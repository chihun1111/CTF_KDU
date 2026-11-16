import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  // Generated proposals must not overwrite the reviewed, checksum-tracked SQL.
  out: "./drizzle-drafts",
});
