import { Injectable } from "@nestjs/common";
import {
  decryptField,
  encryptField,
  type EncryptedFieldBundle,
  generateOpaqueToken,
  hmacLookupHash,
  normalizeFlagInput,
  timingSafeHashEqual,
} from "@campus-ctf/config";
import type { InternalChallengeId } from "@campus-ctf/config";
import { RuntimeConfigService } from "../config/runtime-config.service.js";

export type EncryptedStorageValue = {
  ciphertext: EncryptedFieldBundle;
  hash: string;
  keyVersion: string;
};

@Injectable()
export class CryptoService {
  constructor(private readonly config: RuntimeConfigService) {}

  generateOpaqueToken(): string {
    return generateOpaqueToken();
  }

  sessionHash(sessionToken: string): string {
    return hmacLookupHash(this.config.getRuntimeSecrets().SESSION_SECRET, sessionToken);
  }

  requestMetadataHash(value: string): string {
    return hmacLookupHash(this.config.getRuntimeSecrets().SESSION_SECRET, value);
  }

  prepareStudentIdForStorage(studentId: string): EncryptedStorageValue {
    const secrets = this.config.getRuntimeSecrets();
    const keyVersion = "student-id-v1";

    return {
      keyVersion,
      ciphertext: encryptField(studentId, secrets.STUDENT_ID_ENCRYPTION_KEY, keyVersion),
      hash: hmacLookupHash(secrets.STUDENT_ID_HASH_PEPPER, studentId),
    };
  }

  studentIdHash(studentId: string): string {
    return hmacLookupHash(this.config.getRuntimeSecrets().STUDENT_ID_HASH_PEPPER, studentId);
  }

  decryptStudentIdForClearCertificate(ciphertext: EncryptedFieldBundle): string {
    return decryptField(ciphertext, this.config.getRuntimeSecrets().STUDENT_ID_ENCRYPTION_KEY);
  }

  decryptStudentIdForAdminView(ciphertext: EncryptedFieldBundle): string {
    return decryptField(ciphertext, this.config.getRuntimeSecrets().STUDENT_ID_ENCRYPTION_KEY);
  }

  clearViewTokenHash(clearViewToken: string): string {
    return hmacLookupHash(this.config.getRuntimeSecrets().CLEAR_VIEW_TOKEN_SECRET, clearViewToken);
  }

  claimTokenHash(claimToken: string): string {
    return hmacLookupHash(this.config.getRuntimeSecrets().CLAIM_TOKEN_SECRET, claimToken);
  }

  flagHash(flag: string): string {
    return hmacLookupHash(this.config.getRuntimeSecrets().FLAG_HASH_PEPPER, normalizeFlagInput(flag));
  }

  prepareFlagForStorage(flag: string): EncryptedStorageValue {
    const normalizedFlag = normalizeFlagInput(flag);
    const secrets = this.config.getRuntimeSecrets();
    const keyVersion = "flag-v1";

    return {
      keyVersion,
      ciphertext: encryptField(normalizedFlag, secrets.FLAG_ENCRYPTION_KEY, keyVersion),
      hash: hmacLookupHash(secrets.FLAG_HASH_PEPPER, normalizedFlag),
    };
  }

  timingSafeHashEqual(left: string, right: string): boolean {
    return timingSafeHashEqual(left, right);
  }

  decryptFlagForInternalApi(ciphertext: EncryptedFieldBundle): string {
    return decryptField(ciphertext, this.config.getRuntimeSecrets().FLAG_ENCRYPTION_KEY);
  }

  internalServiceTokenMatches(challengeId: InternalChallengeId, token: string): boolean {
    if (!token) {
      return false;
    }

    const secrets = this.config.getRuntimeSecrets();
    const expectedToken = secrets.INTERNAL_SERVICE_TOKENS[challengeId];
    if (!expectedToken) {
      return false;
    }

    return timingSafeHashEqual(
      hmacLookupHash(secrets.SESSION_SECRET, token),
      hmacLookupHash(secrets.SESSION_SECRET, expectedToken),
    );
  }
}
