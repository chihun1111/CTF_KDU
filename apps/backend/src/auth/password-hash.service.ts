import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const HASH_PREFIX = "ctf-bcrypt-sha256-v1$";

// This is a public dummy hash, never a credential. Unknown accounts do the same
// expensive password work as existing accounts before returning a generic error.
export const DUMMY_PASSWORD_HASH = `${HASH_PREFIX}$2b$12$lrAHSDbzC6ad5XgGVg.kZuQOjsixqtamjmZm6DQu7/DeRBZ9euUia`;

function passwordMaterial(password: string): string {
  // Domain separation avoids reusing an ordinary SHA-256 password digest. The
  // base64 digest is 44 ASCII bytes, below bcrypt's 72-byte input limit.
  return createHash("sha256").update("campus-ctf:password:v1\0").update(password, "utf8").digest("base64");
}

@Injectable()
export class PasswordHashService {
  async hashPassword(password: string): Promise<string> {
    return HASH_PREFIX + await bcrypt.hash(passwordMaterial(password), BCRYPT_COST);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (hash.startsWith(HASH_PREFIX)) {
      return bcrypt.compare(passwordMaterial(password), hash.slice(HASH_PREFIX.length));
    }
    // Keep existing accounts usable. Legacy records retain bcrypt's original
    // truncation behavior until their password is replaced with a versioned hash.
    if (/^\$2[aby]\$/.test(hash)) {
      return bcrypt.compare(password, hash);
    }
    return false;
  }
}
