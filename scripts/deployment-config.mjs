import { readFileSync, statSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";

// Match Compose's file-relative path rules. Never print environment values.
export function loadDeploymentConfig({ root = process.cwd(), composeFile, envFile }, environment = process.env) {
  const composePath = path.resolve(root, composeFile);
  const envPath = path.resolve(root, envFile);
  const env = { ...parseEnv(readFileSync(envPath, "utf8")), ...environment };
  const baseUrl = new URL(env.PUBLIC_BASE_URL || "http://localhost");
  if (baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new Error("PUBLIC_BASE_URL must be an origin without credentials, path, query or fragment");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && loopback)) {
    throw new Error("PUBLIC_BASE_URL must use HTTPS outside localhost (authentication cookies are Secure)");
  }
  const composeDirectory = path.dirname(composePath);
  const secretPath = env.RUNTIME_SECRETS_DIR || "../../secrets/runtime-only";
  const nginxPath = env.NGINX_CONFIG_FILE || "../nginx/nginx.conf";
  if (secretPath.includes("$") || nginxPath.includes("$")) {
    throw new Error("Use explicit or absolute paths for RUNTIME_SECRETS_DIR and NGINX_CONFIG_FILE");
  }
  const nginxConfigFile = path.resolve(composeDirectory, nginxPath);
  if (!statSync(nginxConfigFile).isFile()) {
    throw new Error("NGINX_CONFIG_FILE must resolve to a regular file relative to the Compose file");
  }
  return {
    publicBaseUrl: baseUrl.origin,
    runtimeSecretsDir: path.resolve(composeDirectory, secretPath),
    nginxConfigFile,
  };
}
