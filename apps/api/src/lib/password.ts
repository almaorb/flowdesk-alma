import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * A bcrypt hash of a throwaway value. Used to burn a comparable amount of CPU
 * when an unknown email is submitted, so login timing does not reveal which
 * addresses exist.
 */
const DUMMY_HASH = bcrypt.hashSync('flowdesk-timing-equaliser', 10);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
