import type { IncomingHttpHeaders, Server } from "node:http";
import type { TestContext } from "node:test";

export function startServer(t: TestContext, createServer: () => Server): Promise<number>;
export function configureBackend(t: TestContext): Promise<void>;
export function send(
  port: number,
  path: string,
  method?: string,
  cookie?: string,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>;

export function registerHttpRuntimeTests(options: {
  createServer: () => Server;
  challengeId: string;
  protectedPath?: string;
}): void;
