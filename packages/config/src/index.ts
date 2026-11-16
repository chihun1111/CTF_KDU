import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

export type RuntimeSecrets = {
  SESSION_SECRET: string;
  FLAG_ENCRYPTION_KEY: string;
  FLAG_HASH_PEPPER: string;
  STUDENT_ID_ENCRYPTION_KEY: string;
  STUDENT_ID_HASH_PEPPER: string;
  CLEAR_VIEW_TOKEN_SECRET: string;
  CLAIM_TOKEN_SECRET: string;
  INTERNAL_SERVICE_TOKENS: Record<InternalChallengeId, string>;
};

export const INTERNAL_CHALLENGE_IDS = ["01", "02", "03", "04", "05", "06", "07", "08"] as const;
export type InternalChallengeId = (typeof INTERNAL_CHALLENGE_IDS)[number];

export function isInternalChallengeId(value: string): value is InternalChallengeId {
  return INTERNAL_CHALLENGE_IDS.includes(value as InternalChallengeId);
}

export type EncryptedFieldBundle = {
  alg: "AES-256-GCM";
  keyVersion: string;
  iv: string;
  ciphertext: string;
  tag: string;
};

type EnvLike = Record<string, string | undefined>;

function readSecretValue(env: EnvLike, name: string): string {
  const file = env[`${name}_FILE`]?.trim();
  if (file) {
    const value = readFileSync(file, "utf8").trim();
    if (value) {
      return value;
    }
    throw new Error(`Runtime secret ${name} file is empty`);
  }

  const direct = env[name]?.trim();
  if (direct) {
    return direct;
  }

  throw new Error(`Runtime secret ${name} is not configured`);
}

export function loadRuntimeSecrets(env: EnvLike = process.env): RuntimeSecrets {
  const internalServiceTokens = Object.fromEntries(
    INTERNAL_CHALLENGE_IDS.map((challengeId) => [
      challengeId,
      readSecretValue(env, `INTERNAL_SERVICE_TOKEN_${challengeId}`),
    ]),
  ) as Record<InternalChallengeId, string>;

  const secrets: RuntimeSecrets = {
    SESSION_SECRET: readSecretValue(env, "SESSION_SECRET"),
    FLAG_ENCRYPTION_KEY: readSecretValue(env, "FLAG_ENCRYPTION_KEY"),
    FLAG_HASH_PEPPER: readSecretValue(env, "FLAG_HASH_PEPPER"),
    STUDENT_ID_ENCRYPTION_KEY: readSecretValue(env, "STUDENT_ID_ENCRYPTION_KEY"),
    STUDENT_ID_HASH_PEPPER: readSecretValue(env, "STUDENT_ID_HASH_PEPPER"),
    CLEAR_VIEW_TOKEN_SECRET: readSecretValue(env, "CLEAR_VIEW_TOKEN_SECRET"),
    CLAIM_TOKEN_SECRET: readSecretValue(env, "CLAIM_TOKEN_SECRET"),
    INTERNAL_SERVICE_TOKENS: internalServiceTokens,
  };
  if (env.NODE_ENV === "production") {
    const entries = [
      ...Object.entries(secrets).filter(([name]) => name !== "INTERNAL_SERVICE_TOKENS"),
      ...Object.entries(internalServiceTokens).map(([id, value]) => [`INTERNAL_SERVICE_TOKEN_${id}`, value]),
    ] as [string, string][];
    const used = new Set<string>();
    for (const [name, value] of entries) {
      if (value.length < 32) {
        throw new Error(`Runtime secret ${name} must contain at least 32 characters`);
      }
      if (used.has(value)) {
        throw new Error(`Runtime secret ${name} must be unique`);
      }
      used.add(value);
      if (name.endsWith("ENCRYPTION_KEY") &&
          (Buffer.from(value, "base64").byteLength !== 32 || Buffer.from(value, "base64").toString("base64") !== value)) {
        throw new Error(`Runtime secret ${name} must be a base64-encoded 32-byte key`);
      }
    }
  }
  return secrets;
}

function encryptionKeyBytes(secret: string): Buffer {
  return createHash("sha256").update(`ctf-field:${secret}`).digest();
}

function hmacKeyBytes(secret: string): Buffer {
  return createHash("sha256").update(`hmac-key:${secret}`).digest();
}

export function encryptField(plaintext: string, secret: string, keyVersion: string): EncryptedFieldBundle {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeyBytes(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: "AES-256-GCM",
    keyVersion,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptField(bundle: EncryptedFieldBundle, secret: string): string {
  if (bundle.alg !== "AES-256-GCM") {
    throw new Error("Unsupported encrypted field algorithm");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKeyBytes(secret), Buffer.from(bundle.iv, "base64"));
  decipher.setAuthTag(Buffer.from(bundle.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export function hmacLookupHash(secret: string, value: string): string {
  return createHmac("sha256", hmacKeyBytes(secret)).update(value).digest("hex");
}

export function timingSafeHashEqual(left: string, right: string): boolean {
  // Buffer.from(..., "hex") silently truncates malformed input. Reject it before
  // comparing so empty or partially decoded values can never authenticate.
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function normalizeFlagInput(flag: string): string {
  return flag.trim().replace(/\s+/g, "");
}

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}
