import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { FlagId } from "@campus-ctf/shared";
import { CryptoService, type EncryptedStorageValue } from "../crypto/crypto.service.js";

export type ChallengeForFlagIssuance = {
  id: string;
  flagId: FlagId;
};

export type IssuedChallengeFlagRecord = {
  challengeId: string;
  flagCiphertext: EncryptedStorageValue["ciphertext"];
  flagKeyVersion: string;
  flagHash: string;
};

@Injectable()
export class FlagIssuanceService {
  constructor(private readonly crypto: CryptoService) {}

  issueChallengeFlagsForUser(challenges: readonly ChallengeForFlagIssuance[]): IssuedChallengeFlagRecord[] {
    return challenges.map((challenge) => {
      const storage = this.crypto.prepareFlagForStorage(this.generateFlag());
      return {
        challengeId: challenge.id,
        flagCiphertext: storage.ciphertext,
        flagKeyVersion: storage.keyVersion,
        flagHash: storage.hash,
      };
    });
  }

  private generateFlag(): string {
    return `KDUCTF${"{"}${randomBytes(24).toString("base64url")}}`;
  }
}
