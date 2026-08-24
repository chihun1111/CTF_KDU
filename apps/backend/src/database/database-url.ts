import { readFileSync } from "node:fs";

export type DatabaseUrlEnv = Record<string, string | undefined>;

function required(env: DatabaseUrlEnv, name: string, fallback?: string): string {
  const value = env[name] ?? fallback;
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function databasePassword(env: DatabaseUrlEnv): string {
  const filePath = env.DATABASE_PASSWORD_FILE?.trim();
  if (filePath) {
    return readFileSync(filePath, "utf8").trim();
  }

  const value = env.DATABASE_PASSWORD?.trim();
  if (!value) {
    throw new Error("DATABASE_PASSWORD or DATABASE_PASSWORD_FILE is required");
  }

  return value;
}

export function buildDatabaseUrl(env: DatabaseUrlEnv = process.env): string {
  const explicitUrl = env.DATABASE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const user = required(env, "DATABASE_USER", "campus_ctf");
  const password = databasePassword(env);
  const host = required(env, "DATABASE_HOST", "postgres");
  const port = required(env, "DATABASE_PORT", "5432");
  const name = required(env, "DATABASE_NAME", "campus_ctf");

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}`;
}
