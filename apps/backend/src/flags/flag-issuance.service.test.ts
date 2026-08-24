import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FLAG_IDS } from "@campus-ctf/shared";
import { FlagIssuanceService } from "./flag-issuance.service.js";

test("FlagIssuanceService creates one encrypted flag record for each challenge", () => {
  const preparedFlags: string[] = [];
  const service = new FlagIssuanceService({
    prepareFlagForStorage: (flag: string) => {
      preparedFlags.push(flag);
      return {
        keyVersion: "flag-v1",
        hash: `hash:${flag}`,
        ciphertext: {
          alg: "AES-256-GCM",
          keyVersion: "flag-v1",
          iv: "iv",
          ciphertext: `cipher:${flag}`,
          tag: "tag",
        },
      };
    },
  } as unknown as ConstructorParameters<typeof FlagIssuanceService>[0]);

  const records = service.issueChallengeFlagsForUser(
    FLAG_IDS.map((flagId, index) => ({ id: `challenge-${index + 1}`, flagId })),
  );

  assert.equal(records.length, 8);
  assert.deepEqual(
    records.map((record) => record.challengeId),
    FLAG_IDS.map((_, index) => `challenge-${index + 1}`),
  );
  assert.equal(new Set(preparedFlags).size, 8);
  assert(preparedFlags.every((flag) => /^KDUCTF\{[A-Za-z0-9_-]{32}\}$/.test(flag)));
  assert(records.every((record) => record.flagKeyVersion === "flag-v1"));
});

test("FlagIssuanceService uses the concrete CryptoService type for Nest injection metadata", () => {
  const source = readFileSync("src/flags/flag-issuance.service.ts", "utf8");

  assert.match(source, /constructor\(private readonly crypto: CryptoService\)/);
  assert.doesNotMatch(source, /Pick<CryptoService/);
});
