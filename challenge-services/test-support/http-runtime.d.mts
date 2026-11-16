import type { Server } from "node:http";

export function registerHttpRuntimeTests(options: {
  createServer: () => Server;
  challengeId: string;
  protectedPath?: string;
}): void;
