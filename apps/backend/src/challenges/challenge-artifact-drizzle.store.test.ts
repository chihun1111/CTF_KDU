import assert from "node:assert/strict";
import test from "node:test";
import { ChallengeArtifactDrizzleStore } from "./challenge-artifact-drizzle.store.js";

function tableName(table: unknown): string {
  return String((table as { [key: symbol]: string | undefined })[Symbol.for("drizzle:Name")] ?? "unknown");
}

test("ChallengeArtifactDrizzleStore looks up cached artifacts by current user and public challenge id", async () => {
  const events: string[] = [];
  const db = {
    select(selection?: unknown) {
      const keys = Object.keys((selection ?? {}) as Record<string, unknown>);
      return {
        from(table: unknown) {
          events.push(`from:${tableName(table)}`);
          return {
            innerJoin(joinTable: unknown) {
              events.push(`join:${tableName(joinTable)}`);
              return {
                where() {
                  events.push("where");
                  return {
                    limit(count: number) {
                      events.push(`limit:${count}`);
                      assert.deepEqual(keys, ["artifactPath", "artifactHash"]);
                      return Promise.resolve([
                        {
                          artifactPath: "02/cache/file-1.jpg",
                          artifactHash: "a".repeat(64),
                        },
                      ]);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const store = new ChallengeArtifactDrizzleStore({ db } as unknown as ConstructorParameters<typeof ChallengeArtifactDrizzleStore>[0]);

  const result = await store.findArtifactForUser({
    userId: "user-1",
    publicChallengeId: "02",
    artifactVersion: "artifact-v1",
  });

  assert.deepEqual(result, {
    artifactPath: "02/cache/file-1.jpg",
    artifactHash: "a".repeat(64),
  });
  assert.deepEqual(events, ["from:challenge_artifacts", "join:challenges", "where", "limit:1"]);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
});
