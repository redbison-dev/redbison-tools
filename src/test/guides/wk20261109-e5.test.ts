/**
 * Worked examples in the week 2026-11-09 batch e5 posts, computed by the same
 * src/lib/tools functions the linked tools use. If a number here changes,
 * update the post (and its SVG) to match.
 */
import { describe, it, expect } from 'vitest';
import { decodeJwt } from '@/lib/tools/jwt-decoder';
import { jwkThumbprint, parseJwkInput } from '@/lib/tools/jwk-tool';
import { generateBackupScripts, type BackupConfig } from '@/lib/tools/database-backup-generator';
import { hashBytes, parseExpectedHash, verifyBytes } from '@/lib/tools/hash-file-verifier';

describe('access-tokens-vs-refresh-tokens', () => {
  // Public half of the ES256 example key in RFC 7515 Appendix A.3. Never use it for real tokens.
  const jwks = '{"keys":[{"kty":"EC","crv":"P-256","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0","use":"sig","alg":"ES256"}]}';
  // Signed once with the matching private key (ES256 signatures are randomised, so the token is pinned, not regenerated).
  const accessToken =
    'eyJhbGciOiJFUzI1NiIsInR5cCI6ImF0K2p3dCIsImtpZCI6Im9LSXl3dkdVcFRWVHl4TVEzYndJSWVRVXVkZnJfQ2tMTWpDRTE5RUNELVUifQ' +
    '.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJzdWIiOiJ1c2VyLTQ4MjEiLCJhdWQiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImNsaWVudF9pZCI6Im9yZGVycy13ZWIiLCJzY29wZSI6Im9yZGVyczpyZWFkIiwiaWF0IjoxNzkzNzgyODAwLCJleHAiOjE3OTM3ODM3MDAsImp0aSI6ImIxZTdjM2QyLTlmNGEtNGM2MS04YTJlLTVkMGY3ZTlhMWMzNCJ9' +
    '.d3U4YxXS57QYO2A3Z-eSh6mpUyyk9RC19zyBdKY2B_I4UMnVlVsSFe40F8qRN2MNB7qzpF4XjvRrz-t5eth1og';

  it('decodes the header and payload the post prints', () => {
    const { header, payload } = decodeJwt(accessToken);
    expect(header).toEqual({ alg: 'ES256', typ: 'at+jwt', kid: 'oKIywvGUpTVTyxMQ3bwIIeQUudfr_CkLMjCE19ECD-U' });
    expect(payload).toEqual({
      iss: 'https://auth.example.com',
      sub: 'user-4821',
      aud: 'https://api.example.com',
      client_id: 'orders-web',
      scope: 'orders:read',
      iat: 1793782800,
      exp: 1793783700,
      jti: 'b1e7c3d2-9f4a-4c61-8a2e-5d0f7e9a1c34',
    });
  });

  it('accepts the token with a "Bearer " prefix, as copied from an Authorization header', () => {
    expect(decodeJwt(`Bearer ${accessToken}`).header).toMatchObject({ typ: 'at+jwt' });
  });

  it('iat is 09:00:00 UTC on 4 November 2026 and the token lives 900 seconds (15 minutes)', () => {
    const { payload } = decodeJwt(accessToken) as { payload: { iat: number; exp: number } };
    expect(new Date(payload.iat * 1000).toISOString()).toBe('2026-11-04T09:00:00.000Z');
    expect(new Date(payload.exp * 1000).toISOString()).toBe('2026-11-04T09:15:00.000Z');
    expect(payload.exp - payload.iat).toBe(900);
    // An 8-hour working session with 15-minute access tokens needs 32 of them, so 31 refreshes after login.
    expect((8 * 3600) / (payload.exp - payload.iat)).toBe(32);
  });

  it('the JWK Set key has the RFC 7638 thumbprint used as kid', async () => {
    const keys = parseJwkInput(jwks);
    expect(keys).toHaveLength(1);
    expect(await jwkThumbprint(keys[0])).toBe('oKIywvGUpTVTyxMQ3bwIIeQUudfr_CkLMjCE19ECD-U');
  });

  it('the signature verifies with that public key', async () => {
    const [h, p, s] = accessToken.split('.');
    const key = await crypto.subtle.importKey('jwk', { ...parseJwkInput(jwks)[0], ext: true } as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it('an opaque refresh token is not a JWT, so the decoder rejects it', () => {
    expect(() => decodeJwt('8xLOxBtZp8kq2T3mWQyR0Jv5nHc7aEdUfgIsPo1VbN4')).toThrow('Invalid JWT format');
  });
});

describe('3-2-1-backup-rule-ransomware', () => {
  const base: BackupConfig = {
    dbType: 'postgresql',
    host: 'localhost',
    port: '5432',
    database: 'shop',
    username: 'backup_user',
    includeTables: true,
    includeData: true,
    compression: true,
    customOptions: '',
  };

  it('the PostgreSQL backup script uses custom format, writes .dump files and stops on failure', () => {
    const { backup, backupFileName } = generateBackupScripts(base);
    expect(backupFileName).toBe('shop_backup.sh');
    expect(backup).toContain('--format=custom');
    expect(backup).toContain('--no-owner');
    expect(backup).toContain('BACKUP_DIR=/backup/postgresql');
    expect(backup).toContain('FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"');
    expect(backup).toContain('echo "Backup failed with exit code $STATUS" >&2');
    expect(backup).toContain('chmod 600 "$FILE"');
  });

  it('the restore-test script restores into shop_restore_test with pg_restore and --exit-on-error', () => {
    const { restore } = generateBackupScripts({ ...base, database: 'shop_restore_test' });
    expect(restore).toContain("DB_NAME='shop_restore_test'");
    expect(restore).toContain('--clean --if-exists --no-owner --exit-on-error "$FILE"');
    expect(restore).toContain('Usage: $0 <backup.dump>');
  });

  it('the downloaded restore-test script hashes to bd7a73ce...88c1 and matches its sha256sum line', async () => {
    const { restore } = generateBackupScripts({ ...base, database: 'shop_restore_test' });
    const bytes = new TextEncoder().encode(restore);
    expect(bytes.length).toBe(894);
    const hex = await hashBytes(bytes, 'SHA-256');
    expect(hex).toBe('bd7a73cef0e419879f515863982343470c623e4e8c6e9586b7b4e2b3420488c1');
    const line = `${hex}  shop_restore_test_restore.sh`;
    expect(parseExpectedHash(line)).toMatchObject({ algorithm: 'SHA-256', format: 'coreutils' });
    const outcome = await verifyBytes(bytes, line);
    expect(outcome).toMatchObject({ algorithm: 'SHA-256', match: true });
  });

  it('changing one character (port 5432 to 5433) gives a completely different hash', async () => {
    const { restore } = generateBackupScripts({ ...base, database: 'shop_restore_test' });
    const edited = new TextEncoder().encode(restore.replace("DB_PORT='5432'", "DB_PORT='5433'"));
    const outcome = await verifyBytes(edited, 'bd7a73cef0e419879f515863982343470c623e4e8c6e9586b7b4e2b3420488c1  shop_restore_test_restore.sh');
    expect(outcome.match).toBe(false);
    expect(outcome.actual).toBe('dca92916d2e519ed8bf68737553ab648255c686c63e394bdfb861b0ac2ddab8f');
  });
});
