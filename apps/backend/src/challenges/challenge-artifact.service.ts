import { createHash } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import type { EncryptedFieldBundle } from "@campus-ctf/config";
import type { AuditService } from "../audit/audit.service.js";
import type { CryptoService } from "../crypto/crypto.service.js";
import { generateChallengeArtifact } from "./challenge-artifact-generator.js";
import { publicServiceIdFromSlug } from "./challenges.service.js";

const ARTIFACT_VERSION = "artifact-v1";
const CLAIM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const ARTIFACT_RESPONSE_METADATA: Record<string, { contentType: string; filename: string }> = {
  "02": {
    contentType: "image/jpeg",
    filename: "student-support-attachment.jpg",
  },
  "04": {
    contentType: "application/vnd.tcpdump.pcap",
    filename: "network-maintenance.pcap",
  },
  "05": {
    contentType: "text/plain; charset=utf-8",
    filename: "lost-item-access.log",
  },
  "06": {
    contentType: "application/octet-stream",
    filename: "club-fee-tool.bin",
  },
};

export type CachedChallengeArtifact = {
  artifactPath: string;
  artifactHash: string;
};

export type ChallengeArtifactStore = {
  findArtifactForUser(input: {
    userId: string;
    publicChallengeId: string;
    artifactVersion: string;
  }): Promise<CachedChallengeArtifact | null>;
  findFlagForArtifact(input: { userId: string; publicChallengeId: string }): Promise<{ flagCiphertext: EncryptedFieldBundle } | null>;
  createArtifactForUser(input: {
    userId: string;
    publicChallengeId: string;
    artifactVersion: string;
    artifactPath: string;
    artifactHash: string;
  }): Promise<void>;
  createClaimTokenForUser(input: {
    userId: string;
    publicChallengeId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
};

export type ArtifactFileReader = {
  readArtifact(artifactPath: string): Promise<Buffer>;
};

export type ArtifactFileWriter = {
  writeArtifact(artifactPath: string, body: Buffer): Promise<void>;
};

type ChallengeArtifactCrypto = Pick<CryptoService, "claimTokenHash" | "decryptFlagForInternalApi" | "generateOpaqueToken">;
type ArtifactFailureRecorder = Pick<AuditService, "recordArtifactGenerationFailure">;
type Clock = {
  now(): Date;
};

export type ChallengeArtifactDownload = {
  body: Buffer;
  contentType: string;
  filename: string;
  etag: string;
};

function getArtifactMetadata(publicServiceSlug: string): { publicChallengeId: string; contentType: string; filename: string } | null {
  const publicChallengeId = publicServiceIdFromSlug(publicServiceSlug);
  const metadata = publicChallengeId ? ARTIFACT_RESPONSE_METADATA[publicChallengeId] : null;
  return publicChallengeId && metadata ? { publicChallengeId, ...metadata } : null;
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export class ChallengeArtifactService {
  constructor(
    private readonly store: ChallengeArtifactStore,
    private readonly fileReader: ArtifactFileReader,
    private readonly fileWriter: ArtifactFileWriter,
    private readonly crypto: ChallengeArtifactCrypto,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly artifactFailureRecorder?: ArtifactFailureRecorder,
  ) {}

  async getArtifactForParticipant(userId: string, publicServiceSlug: string): Promise<ChallengeArtifactDownload> {
    const metadata = getArtifactMetadata(publicServiceSlug);
    if (!metadata) {
      throw new NotFoundException("Artifact not found");
    }
    const { publicChallengeId } = metadata;

    const artifact = await this.store.findArtifactForUser({
      userId,
      publicChallengeId,
      artifactVersion: ARTIFACT_VERSION,
    });
    if (artifact) {
      return this.readCachedArtifact(userId, publicChallengeId, artifact, metadata);
    }

    return this.generateAndStoreArtifact(userId, publicChallengeId, metadata);
  }

  private async readCachedArtifact(
    userId: string,
    publicChallengeId: string,
    artifact: CachedChallengeArtifact,
    metadata: { contentType: string; filename: string },
  ): Promise<ChallengeArtifactDownload> {
    if (!isSha256Hex(artifact.artifactHash)) {
      throw new NotFoundException("Artifact not found");
    }
    try {
      return {
        body: await this.fileReader.readArtifact(artifact.artifactPath),
        contentType: metadata.contentType,
        filename: metadata.filename,
        etag: `"${artifact.artifactHash}"`,
      };
    } catch {
      await this.recordArtifactFailure(userId, publicChallengeId, "read_failed");
      throw new NotFoundException("Artifact not found");
    }
  }

  private async generateAndStoreArtifact(
    userId: string,
    publicChallengeId: string,
    metadata: { contentType: string; filename: string },
  ): Promise<ChallengeArtifactDownload> {
    let generated: ReturnType<typeof generateChallengeArtifact>;
    let failureReason: "missing_flag" | "generate_failed" = "generate_failed";
    try {
      if (publicChallengeId === "06") {
        generated = await this.generateClaimTokenArtifact(userId, publicChallengeId);
      } else {
        const flagRecord = await this.store.findFlagForArtifact({ userId, publicChallengeId });
        if (!flagRecord) {
          failureReason = "missing_flag";
          throw new Error("Missing user flag");
        }
        const flag = this.crypto.decryptFlagForInternalApi(flagRecord.flagCiphertext);
        generated = generateChallengeArtifact(publicChallengeId, flag);
      }
    } catch {
      await this.recordArtifactFailure(userId, publicChallengeId, failureReason);
      throw new NotFoundException("Artifact not found");
    }

    const artifactHash = createHash("sha256").update(generated.body).digest("hex");
    const artifactPath = `${publicChallengeId}/${ARTIFACT_VERSION}/${artifactHash}.${generated.extension}`;

    try {
      await this.fileWriter.writeArtifact(artifactPath, generated.body);
      await this.store.createArtifactForUser({
        userId,
        publicChallengeId,
        artifactVersion: ARTIFACT_VERSION,
        artifactPath,
        artifactHash,
      });
    } catch {
      await this.recordArtifactFailure(userId, publicChallengeId, "write_failed");
      throw new NotFoundException("Artifact not found");
    }

    return {
      body: generated.body,
      contentType: metadata.contentType,
      filename: metadata.filename,
      etag: `"${artifactHash}"`,
    };
  }

  private async generateClaimTokenArtifact(
    userId: string,
    publicChallengeId: string,
  ): Promise<ReturnType<typeof generateChallengeArtifact>> {
    const claimToken = this.crypto.generateOpaqueToken();
    await this.store.createClaimTokenForUser({
      userId,
      publicChallengeId,
      tokenHash: this.crypto.claimTokenHash(claimToken),
      expiresAt: new Date(this.clock.now().getTime() + CLAIM_TOKEN_TTL_MS),
    });

    return generateChallengeArtifact(publicChallengeId, claimToken);
  }

  private async recordArtifactFailure(
    userId: string,
    publicChallengeId: string,
    reason: "missing_flag" | "generate_failed" | "write_failed" | "read_failed",
  ): Promise<void> {
    try {
      await this.artifactFailureRecorder?.recordArtifactGenerationFailure({
        userId,
        challengeId: publicChallengeId,
        reason,
      });
    } catch {
      // Audit logging must not expose details or change the participant-facing response.
    }
  }
}
