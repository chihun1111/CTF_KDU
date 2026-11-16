import assert from "node:assert/strict";
import test from "node:test";
import { FLAG_IDS, challengeNumberOfFlagId, flagIdOfChallengeNumber } from "./index.js";

test("all eight flag IDs round-trip to their challenge number", () => {
  assert.equal(new Set(FLAG_IDS).size, 8);
  for (const flagId of FLAG_IDS) {
    assert.equal(flagIdOfChallengeNumber(challengeNumberOfFlagId(flagId)), flagId);
  }
});

test("unregistered and noncanonical challenge numbers are rejected", () => {
  for (const value of ["", "1", "00", "09", "FLAG-01", "../01", "01 "]) {
    assert.equal(flagIdOfChallengeNumber(value), null);
  }
});
