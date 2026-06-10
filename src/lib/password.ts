import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string, rounds = SALT_ROUNDS) {
  return bcrypt.hash(password, rounds);
}

export async function checkPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
