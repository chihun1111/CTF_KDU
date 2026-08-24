import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { AdminRoleGuard } from "./admin-role.guard.js";

function createContext(role: "participant" | "admin" | undefined): ExecutionContext {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return {
            authSession: role
              ? {
                  sessionId: "session-1",
                  userId: "user-1",
                  role,
                }
              : undefined,
          };
        },
      };
    },
  } as ExecutionContext;
}

test("AdminRoleGuard allows only authenticated admin sessions", () => {
  const guard = new AdminRoleGuard();

  assert.equal(guard.canActivate(createContext("admin")), true);
  assert.throws(() => guard.canActivate(createContext("participant")), ForbiddenException);
  assert.throws(() => guard.canActivate(createContext(undefined)), ForbiddenException);
});
