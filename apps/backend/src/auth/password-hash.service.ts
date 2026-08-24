import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

@Injectable()
export class PasswordHashService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
