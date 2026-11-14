/** Matches a modular-crypt bcrypt string: $2a$, $2b$ or $2y$, a two-digit cost, then 53 bcrypt-base64 characters. */
export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(value.trim());
}
