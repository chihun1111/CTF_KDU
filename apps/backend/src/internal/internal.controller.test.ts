import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { InternalController } from "./internal.controller.js";

const METHOD_METADATA = "method";
const PATH_METADATA = "path";
const HEADERS_METADATA = "__headers__";

test("InternalController exposes GET /internal/challenges/:challengeId/flag without query-driven identity", async () => {
  const events: string[] = [];
  const controller = new InternalController(
    {
      async getChallengeFlag(input) {
        events.push(JSON.stringify(input));
        return {
          flagId: "FLAG-01",
          flag: "KDUCTF" + "{USER1_FLAG01}",
        };
      },
    },
    {
      async verifyClaim() {
        throw new Error("not used");
      },
      async issueClaim() {
        throw new Error("not used");
      },
    },
  );

  const body = await controller.getChallengeFlag("01", "Bearer internal-token", "ctf_session=session-token");

  assert.deepEqual(body, {
    flagId: "FLAG-01",
    flag: "KDUCTF" + "{USER1_FLAG01}",
  });
  assert.deepEqual(events, [
    JSON.stringify({
      challengeId: "01",
      authorizationHeader: "Bearer internal-token",
      cookieHeader: "ctf_session=session-token",
    }),
  ]);

  assert.equal(Reflect.getMetadata(PATH_METADATA, InternalController), "internal");
  assert.equal(Reflect.getMetadata(PATH_METADATA, InternalController.prototype.getChallengeFlag), "challenges/:challengeId/flag");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, InternalController.prototype.getChallengeFlag), RequestMethod.GET);
  assert.equal(JSON.stringify(Reflect.getMetadata(HEADERS_METADATA, InternalController.prototype.getChallengeFlag)).includes("no-store"), true);
});

test("InternalController exposes POST /internal/claims/verify without logging token in route metadata", async () => {
  const events: string[] = [];
  const controller = new InternalController(
    {
      async getChallengeFlag() {
        throw new Error("not used");
      },
    },
    {
      async verifyClaim(input) {
        events.push(JSON.stringify(input));
        return {
          flagId: "FLAG-08",
          flag: "KDUCTF" + "{USER1_FLAG08}",
        };
      },
      async issueClaim() {
        throw new Error("not used");
      },
    },
  );

  const body = await controller.verifyClaim(
    "Bearer internal-token",
    "ctf_session=session-token",
    {
      challengeId: "08",
      claimToken: "opaque-claim-token-with-at-least-32-bytes",
    },
  );

  assert.deepEqual(body, {
    flagId: "FLAG-08",
    flag: "KDUCTF" + "{USER1_FLAG08}",
  });
  assert.deepEqual(events, [
    JSON.stringify({
      authorizationHeader: "Bearer internal-token",
      cookieHeader: "ctf_session=session-token",
      body: {
        challengeId: "08",
        claimToken: "opaque-claim-token-with-at-least-32-bytes",
      },
    }),
  ]);

  assert.equal(Reflect.getMetadata(PATH_METADATA, InternalController.prototype.verifyClaim), "claims/verify");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, InternalController.prototype.verifyClaim), RequestMethod.POST);
  assert.equal(JSON.stringify(Reflect.getMetadata(HEADERS_METADATA, InternalController.prototype.verifyClaim)).includes("no-store"), true);
});

test("InternalController exposes POST /internal/claims/issue without returning identity material", async () => {
  const events: string[] = [];
  const controller = new InternalController(
    {
      async getChallengeFlag() {
        throw new Error("not used");
      },
    },
    {
      async verifyClaim() {
        throw new Error("not used");
      },
      async issueClaim(input) {
        events.push(JSON.stringify(input));
        return {
          challengeId: "08",
          claimToken: "opaque-issued-token-with-at-least-32-bytes",
        };
      },
    },
  );

  const body = await controller.issueClaim("Bearer internal-token", "ctf_session=session-token", { challengeId: "08" });

  assert.deepEqual(body, {
    challengeId: "08",
    claimToken: "opaque-issued-token-with-at-least-32-bytes",
  });
  assert.deepEqual(events, [
    JSON.stringify({
      authorizationHeader: "Bearer internal-token",
      cookieHeader: "ctf_session=session-token",
      body: {
        challengeId: "08",
      },
    }),
  ]);
  assert.equal(JSON.stringify(body).includes("KDUCTF{"), false);
  assert.equal(JSON.stringify(body).includes("user-1"), false);
  assert.equal(Reflect.getMetadata(PATH_METADATA, InternalController.prototype.issueClaim), "claims/issue");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, InternalController.prototype.issueClaim), RequestMethod.POST);
  assert.equal(JSON.stringify(Reflect.getMetadata(HEADERS_METADATA, InternalController.prototype.issueClaim)).includes("no-store"), true);
});
