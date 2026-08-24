import assert from "node:assert/strict";
import test from "node:test";
import { generateChallengeArtifact } from "./challenge-artifact-generator.js";

const sampleFlag = "KDUCTF" + "{artifact_user_flag}";

test("generateChallengeArtifact creates a JPEG with an appended memo zip for FLAG-02", () => {
  const artifact = generateChallengeArtifact("02", sampleFlag);

  assert.equal(artifact.extension, "jpg");
  assert.equal(artifact.body[0], 0xff);
  assert.equal(artifact.body[1], 0xd8);
  assert(artifact.body.includes(Buffer.from("memo.txt")));
  assert(artifact.body.includes(Buffer.from(sampleFlag)));
});

test("generateChallengeArtifact creates a PCAP containing ordered DNS hex labels for FLAG-04", () => {
  const artifact = generateChallengeArtifact("04", sampleFlag);
  const flagHexPrefix = Buffer.from(sampleFlag, "utf8").toString("hex").slice(0, 8);

  assert.equal(artifact.extension, "pcap");
  assert.equal(artifact.body.readUInt32LE(0), 0xa1b2c3d4);
  assert(artifact.body.includes(Buffer.from(`01-${flagHexPrefix}`)));
  assert.equal(artifact.body.includes(Buffer.from(sampleFlag)), false);
});

test("generateChallengeArtifact creates an access log with a URL-encoded FLAG-05 memo", () => {
  const artifact = generateChallengeArtifact("05", sampleFlag);
  const text = artifact.body.toString("utf8");

  assert.equal(artifact.extension, "log");
  assert(text.includes(`memo=${encodeURIComponent(sampleFlag)}`));
  assert.equal(text.includes(sampleFlag), false);
});

test("generateChallengeArtifact creates a FLAG-06 tool that emits a claim token without a flag", () => {
  const claimToken = "claim-token-with-at-least-32-bytes";
  const artifact = generateChallengeArtifact("06", claimToken);
  const text = artifact.body.toString("utf8");

  assert.equal(artifact.extension, "bin");
  assert(text.includes(Buffer.from(claimToken, "utf8").toString("base64")));
  assert.equal(text.includes(claimToken), false);
  assert.equal(text.includes("KDUCTF" + "{"), false);
});

test("generateChallengeArtifact creates different FLAG-02/04/05 artifacts for different user flags", () => {
  const currentFlag = "KDUCTF" + "{aaaaaaaa}";
  const otherFlag = "KDUCTF" + "{zzzzzzzz}";

  for (const challengeId of ["02", "04", "05"] as const) {
    const current = generateChallengeArtifact(challengeId, currentFlag);
    const other = generateChallengeArtifact(challengeId, otherFlag);

    assert.notDeepEqual(current.body, other.body);
    assert.equal(current.body.includes(Buffer.from(otherFlag)), false);

    if (challengeId === "04") {
      const otherUniqueHexChunk = Buffer.from("zzzz", "utf8").toString("hex");
      assert.equal(current.body.includes(Buffer.from(otherUniqueHexChunk)), false);
    }

    if (challengeId === "05") {
      assert.equal(current.body.toString("utf8").includes(encodeURIComponent(otherFlag)), false);
    }
  }
});
