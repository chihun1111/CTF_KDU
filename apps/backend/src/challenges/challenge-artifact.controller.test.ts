import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod, StreamableFile } from "@nestjs/common";
import { SessionAuthGuard, type AuthenticatedRequest } from "../auth/session-auth.guard.js";
import { ChallengeArtifactController } from "./challenge-artifact.controller.js";
import { ChallengesModule } from "./challenges.module.js";

const GUARDS_METADATA = "__guards__";
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

test("legacy ChallengeArtifactController is not registered by ChallengesModule", async () => {
  const headers = new Map<string, string | number>();
  const controller = new ChallengeArtifactController({
    async getArtifactForParticipant(userId, publicChallengeSlug) {
      assert.equal(userId, "user-1");
      assert.equal(publicChallengeSlug, "it-center-status");
      return {
        body: Buffer.from("artifact"),
        contentType: "image/jpeg",
        filename: "service-status-attachment.jpg",
        etag: `"${"a".repeat(64)}"`,
      };
    },
  });

  const body = await controller.download(
    {
      authSession: {
        sessionId: "session-1",
        userId: "user-1",
        role: "participant",
      },
    } as AuthenticatedRequest,
    "it-center-status",
    {
      setHeader(name: string, value: string | number) {
        headers.set(name.toLowerCase(), value);
      },
    },
  );

  assert(body instanceof StreamableFile);
  assert.equal(headers.get("content-type"), "image/jpeg");
  assert.equal(headers.get("content-disposition"), 'attachment; filename="service-status-attachment.jpg"');
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("etag"), `"${"a".repeat(64)}"`);
  assert.equal(JSON.stringify([...headers]).includes("user-1"), false);
  assert.equal(JSON.stringify([...headers]).includes("session-1"), false);

  assert.equal(Reflect.getMetadata(PATH_METADATA, ChallengeArtifactController), "api/services");
  assert.equal(Reflect.getMetadata(PATH_METADATA, ChallengeArtifactController.prototype.download), ":slug/artifact");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, ChallengeArtifactController.prototype.download), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, ChallengeArtifactController.prototype.download), [SessionAuthGuard]);

  const controllers = Reflect.getMetadata("controllers", ChallengesModule) as unknown[] | undefined;
  assert.equal(controllers?.includes(ChallengeArtifactController), false);
});
