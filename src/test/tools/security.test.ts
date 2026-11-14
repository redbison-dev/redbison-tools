/**
 * Regression tests for the security batch. Every tool below previously
 * returned hard-coded or random results; these tests pin the real behaviour.
 * Fixtures were generated with OpenSSL 3.6 (test-only keys, never used elsewhere).
 */
import { describe, it, expect } from 'vitest';
import {
  certificateFingerprints,
  daysUntil,
  parseCertificates,
  validityState,
} from '@/lib/tools/x509-parser';
import { analyzeChain, hostnameMatches, normalizeHostname, opensslCommand } from '@/lib/tools/ssl-checker';
import { analyzeSecurityHeaders, parseRawHeaders } from '@/lib/tools/security-headers-analyzer';
import { generateKeyPair, jwkThumbprint, jwkToPem, parseJwkInput, pemToJwk } from '@/lib/tools/jwk-tool';
import { decodeSignature, ecdsaDerToRaw, verifySignature } from '@/lib/tools/digital-signature-validator';
import { decodeSamlMessage, encodeSamlPost, encodeSamlRedirect, summarizeSaml } from '@/lib/tools/saml-tool';
import { hashBytes, hashesMatch, parseExpectedHash, verifyBytes } from '@/lib/tools/hash-file-verifier';
import { testSqlSecurity } from '@/lib/tools/sql-injection-tester';
import { categoryOptions } from '@/lib/tools/security-checklist';

const LEAF = `-----BEGIN CERTIFICATE-----
MIIDIDCCAsagAwIBAgIGChssPU5fMAoGCCqGSM49BAMCMEYxCzAJBgNVBAYTAlVT
MRgwFgYDVQQKDA9FeGFtcGxlIFRlc3QgQ0ExHTAbBgNVBAMMFEV4YW1wbGUgVGVz
dCBSb290IENBMB4XDTI2MDEwMTAwMDAwMFoXDTI3MDEwMTAwMDAwMFowazELMAkG
A1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDVNhbiBGcmFu
Y2lzY28xFTATBgNVBAoMDEV4YW1wbGUgQ29ycDEYMBYGA1UEAwwPd3d3LmV4YW1w
bGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAihm9oVmnVTyt
/G3DA6+A9guRUp2+K+iS0o1OcXe2vwSumA4JSWa06neb0/kcjZSEASj+Jeng+BCk
x10LAH68VO+n0sjqk73PYmxjKFOW0CEf9CxemNHyZY0iO8lGLJNzgZp9aqYELOdY
KZy7AQ6xaQFmVOQ8dJEv2NaCHajrO4usr+L1Fu+BGoXYCk8Cselj1oV9dUFAtI9v
FkDx5COcFmvxwAsU+edzUFt80yxlMPNDaUK9oxadcMYShAp0+G9xoX2CM6JMYuzg
Uns0PcZPC7hyn/DbOJaKsYga4Gzi6OuE0pX77HVmPuEeT66hAZrbnpOvdEezgC4g
OERY3qKaxQIDAQABo4GvMIGsMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgWg
MB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjAtBgNVHREEJjAkgg93d3cu
ZXhhbXBsZS5jb22CC2V4YW1wbGUuY29thwTAAAIKMB0GA1UdDgQWBBQpojCC08fY
Z2BsApQtVh9J3BLIJDAfBgNVHSMEGDAWgBTemJTWcSPPEXtkWcl779DqvXlILjAK
BggqhkjOPQQDAgNIADBFAiBlAu6xhmH4s591DUMVPjC1CCcuZfzsYLlQVH7fnWpi
zwIhAJsQVna1Iu6V0W20FRQbayIagvB5qqPXwYnltWoB+OYW
-----END CERTIFICATE-----`;

const ROOT = `-----BEGIN CERTIFICATE-----
MIIB8TCCAZegAwIBAgIUecPKYUvox4WNlNI2TFqRcxzbbckwCgYIKoZIzj0EAwIw
RjELMAkGA1UEBhMCVVMxGDAWBgNVBAoMD0V4YW1wbGUgVGVzdCBDQTEdMBsGA1UE
AwwURXhhbXBsZSBUZXN0IFJvb3QgQ0EwHhcNMjYwMTAxMDAwMDAwWhcNMzYwMTAx
MDAwMDAwWjBGMQswCQYDVQQGEwJVUzEYMBYGA1UECgwPRXhhbXBsZSBUZXN0IENB
MR0wGwYDVQQDDBRFeGFtcGxlIFRlc3QgUm9vdCBDQTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABM80LfyZln7P7qMZg1igalZL5spbZPzNVW3MaHqSfIL25Kufv4aQ
z7ljOOfouxUpoVzdUUnc/Mr9H/Doa4kVXnejYzBhMB0GA1UdDgQWBBTemJTWcSPP
EXtkWcl779DqvXlILjAfBgNVHSMEGDAWgBTemJTWcSPPEXtkWcl779DqvXlILjAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAgNIADBF
AiAZGBcKQKcdWAwdsirCCvLD09DfyVPONx8DeakyHqZPZwIhAKkEuJ7OoAuFdJGX
fy1NVy5P5Trp3cW0kuK5lxpF4HrR
-----END CERTIFICATE-----`;

const SELF_SIGNED_SHA1 = `-----BEGIN CERTIFICATE-----
MIIDHTCCAgWgAwIBAgIUZI5JYmeyGC1jgzISuazh3PozZhMwDQYJKoZIhvcNAQEF
BQAwHjEcMBoGA1UEAwwTbGVnYWN5LmV4YW1wbGUudGVzdDAeFw0yMDAxMDEwMDAw
MDBaFw0yMTAxMDEwMDAwMDBaMB4xHDAaBgNVBAMME2xlZ2FjeS5leGFtcGxlLnRl
c3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCKGb2hWadVPK38bcMD
r4D2C5FSnb4r6JLSjU5xd7a/BK6YDglJZrTqd5vT+RyNlIQBKP4l6eD4EKTHXQsA
frxU76fSyOqTvc9ibGMoU5bQIR/0LF6Y0fJljSI7yUYsk3OBmn1qpgQs51gpnLsB
DrFpAWZU5Dx0kS/Y1oIdqOs7i6yv4vUW74EahdgKTwKx6WPWhX11QUC0j28WQPHk
I5wWa/HACxT553NQW3zTLGUw80NpQr2jFp1wxhKECnT4b3GhfYIzokxi7OBSezQ9
xk8LuHKf8Ns4loqxiBrgbOLo64TSlfvsdWY+4R5PrqEBmtuek690R7OALiA4RFje
oprFAgMBAAGjUzBRMB0GA1UdDgQWBBQpojCC08fYZ2BsApQtVh9J3BLIJDAfBgNV
HSMEGDAWgBQpojCC08fYZ2BsApQtVh9J3BLIJDAPBgNVHRMBAf8EBTADAQH/MA0G
CSqGSIb3DQEBBQUAA4IBAQAhjOmu/pqCZwLq5Z6G7dEmnK66O9UJH6S8peUMvWeB
Dd88N7LxRByq04QWDq4tGV/6VJ5vpHoG2gahkWqy0dS7/H1UNir2I9CFQjJlqMZ3
TEliuJnQ/rs11ibJ2ITVFtSjFfsMjSRro0eiGLyP748++kpIQvz4hYjTPJzuGOR5
V9K0LMBZ5I9nyKgkcHNc689cdqfbUBy5gFAVuZyV8YNY296a+f0sPin+pAwMJsDt
E6kXAAJHLU6SaxQAGcwcvrR4a+MX0qWe8+Tc2ALne9erBB5Rk98grSk5KHLjbK/Q
hmRZ1IzgIRgxdJsHMq2SA44mDpU7M52H1m4bcVlhCfyc
-----END CERTIFICATE-----`;

const RSA_PUB = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAihm9oVmnVTyt/G3DA6+A
9guRUp2+K+iS0o1OcXe2vwSumA4JSWa06neb0/kcjZSEASj+Jeng+BCkx10LAH68
VO+n0sjqk73PYmxjKFOW0CEf9CxemNHyZY0iO8lGLJNzgZp9aqYELOdYKZy7AQ6x
aQFmVOQ8dJEv2NaCHajrO4usr+L1Fu+BGoXYCk8Cselj1oV9dUFAtI9vFkDx5COc
FmvxwAsU+edzUFt80yxlMPNDaUK9oxadcMYShAp0+G9xoX2CM6JMYuzgUns0PcZP
C7hyn/DbOJaKsYga4Gzi6OuE0pX77HVmPuEeT66hAZrbnpOvdEezgC4gOERY3qKa
xQIDAQAB
-----END PUBLIC KEY-----`;

const RSA_PKCS1_PUB = `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAihm9oVmnVTyt/G3DA6+A9guRUp2+K+iS0o1OcXe2vwSumA4JSWa0
6neb0/kcjZSEASj+Jeng+BCkx10LAH68VO+n0sjqk73PYmxjKFOW0CEf9CxemNHy
ZY0iO8lGLJNzgZp9aqYELOdYKZy7AQ6xaQFmVOQ8dJEv2NaCHajrO4usr+L1Fu+B
GoXYCk8Cselj1oV9dUFAtI9vFkDx5COcFmvxwAsU+edzUFt80yxlMPNDaUK9oxad
cMYShAp0+G9xoX2CM6JMYuzgUns0PcZPC7hyn/DbOJaKsYga4Gzi6OuE0pX77HVm
PuEeT66hAZrbnpOvdEezgC4gOERY3qKaxQIDAQAB
-----END RSA PUBLIC KEY-----`;

const EC_PUB = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzzQt/JmWfs/uoxmDWKBqVkvmyltk
/M1VbcxoepJ8gvbkq5+/hpDPuWM45+i7FSmhXN1RSdz8yv0f8OhriRVedw==
-----END PUBLIC KEY-----`;

const EC_SEC1_PRIVATE = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIMGu7lFbz7o0kWQzoWqyCJFIkzTDfq9cKBXK70F3sVEhoAoGCCqGSM49
AwEHoUQDQgAEzzQt/JmWfs/uoxmDWKBqVkvmyltk/M1VbcxoepJ8gvbkq5+/hpDP
uWM45+i7FSmhXN1RSdz8yv0f8OhriRVedw==
-----END EC PRIVATE KEY-----`;

const ED_PUB = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEADxkUdAnqquwdoQkweshuIz7CVWRGhy/enSupRw3cyqo=
-----END PUBLIC KEY-----`;

const MESSAGE = 'Release 4.2.0 approved for production.';
const SIG_RSA = 'VHwQHg+vNwRHURZvS9fdeNIOdcbq6x+WHlyJmvzwoLt05IZWMEU4+z1C0dbp1zTLhzBiV5tZ6pCMNTZjubLSJJX2yWwKS+aH081Xlp28+d2HytAMxijaazE0ynnekmrFp3T7Rbhoz+tAz/M6rwyoTK99AtYOEGXSWi0aUIfyNe4NXc0bHshrRpMlSXIYz2LHiXc/Q4TZqM4BHCTpzQU1PLH8qSDFrNz1NSq0bQ26NwSPTQtPfC+ULL06CpxyNqHWjdz8Oflih1n6ATdLIe0H+L2pgECtlTSeyEHYUDyrRoIuYKEDWqtujgc02tQ8usJxOdiyK3uiBC6AsrpAm+luUg==';
const SIG_PSS = 'XP+FI0x+91WTdCmQoAS07yDV5jdQiMzDFDHIH6gLKNGHpS9s/JkE/+GSooGmzC6uiIDvs1HyJjjxZjDcWr9Tm7kJvBYa6+GY3Z2LcXqFDMsokD/78+dlpboWnvbXtoec+NgS3EBtkfHDJMshruQAmQcZU6gH84DZcbFKvHhTyzal4a9DD/lQcNoeVbBED2IW/5ooh8tI4CVRfTyWrfvGkVxheRg0bpvnsvkzomdsWKwntaNEuN9CRWNCrRPVCA7mw7qSOcuWN6KYGya35l75Oo6mznKrgvDldwNMNfcLDBEQTqZ2kZGD/qPLmFRTrEzDP/IsQ8OD3/OMCXJpTjaf9Q==';
const SIG_EC_DER = 'MEQCIHUFmg8NM6b/0g+GdcMARNrqZ3tlClrhXzy96bfsvdA4AiAFd9IhTPm9ONjF1dQ6RQlh1+2yC63UuvFILyl4TeuiwQ==';
const SIG_ED = 'wLI10xRc/FerIbT96Uqtr2Iaz/806Ia1n7k7YrvnhjF4F0VjAA69lxLHhYWxJLemT6FcFv6RWmsdOu+Iql3CAg==';

describe('x509-parser: real DER parsing instead of a hard-coded mock', () => {
  const [leaf] = parseCertificates(LEAF);

  it('reads subject, issuer, serial and validity from the certificate', () => {
    expect(leaf.version).toBe(3);
    expect(leaf.serialNumber).toBe('0A:1B:2C:3D:4E:5F');
    expect(leaf.subjectString).toBe('C=US, ST=California, L=San Francisco, O=Example Corp, CN=www.example.com');
    expect(leaf.issuerString).toBe('C=US, O=Example Test CA, CN=Example Test Root CA');
    expect(leaf.notBefore.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(leaf.notAfter.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(leaf.signatureAlgorithm).toBe('ecdsa-with-SHA256');
  });

  it('reads the key and v3 extensions', () => {
    expect(leaf.publicKey).toMatchObject({ algorithm: 'RSA', keySize: 2048, exponent: 65537 });
    expect(leaf.subjectAltNames).toEqual(['DNS:www.example.com', 'DNS:example.com', 'IP:192.0.2.10']);
    expect(leaf.keyUsage).toEqual(['Digital Signature', 'Key Encipherment']);
    expect(leaf.extendedKeyUsage).toEqual(['Server Authentication', 'Client Authentication']);
    expect(leaf.basicConstraints).toEqual({ ca: false });
    expect(leaf.subjectKeyId).toBe('29:A2:30:82:D3:C7:D8:67:60:6C:02:94:2D:56:1F:49:DC:12:C8:24');
    expect(leaf.authorityKeyId).toBe('DE:98:94:D6:71:23:CF:11:7B:64:59:C9:7B:EF:D0:EA:BD:79:48:2E');
    expect(leaf.selfIssued).toBe(false);
  });

  it('computes the same fingerprints as openssl x509 -fingerprint', async () => {
    const fp = await certificateFingerprints(leaf.der);
    expect(fp.sha256).toBe('DF:6E:7E:B2:54:7F:ED:B0:44:42:F9:77:C8:47:75:89:7E:61:A7:6F:BA:2C:AD:B1:F5:07:20:48:4B:52:8E:EA');
    expect(fp.sha1).toBe('0C:DF:E3:57:78:E6:C4:C4:DF:74:1C:D6:A8:7C:79:F9:A0:69:7F:23');
  });

  it('parses EC root keys and every certificate in a bundle', () => {
    const certs = parseCertificates(`${LEAF}\n${ROOT}`);
    expect(certs).toHaveLength(2);
    expect(certs[1].publicKey).toMatchObject({ algorithm: 'EC', curve: 'P-256', keySize: 256 });
    expect(certs[1].basicConstraints).toEqual({ ca: true });
    expect(certs[1].selfIssued).toBe(true);
  });

  it('rejects input that is not a certificate', () => {
    expect(() => parseCertificates(RSA_PUB)).toThrow(/not a CERTIFICATE/);
    expect(() => parseCertificates('hello')).toThrow();
  });

  it('computes validity state and days remaining', () => {
    const now = new Date('2026-12-02T12:00:00Z');
    expect(validityState(leaf, now)).toBe('valid');
    expect(daysUntil(leaf.notAfter, now)).toBe(29);
    expect(validityState(leaf, new Date('2027-02-01T00:00:00Z'))).toBe('expired');
  });
});

describe('ssl-checker: analyses a pasted chain instead of inventing one', () => {
  it('matches hostnames against SANs with single-label wildcards', () => {
    expect(hostnameMatches('https://Example.com/path', ['DNS:example.com'])).toBe(true);
    expect(hostnameMatches('www.example.com', ['DNS:*.example.com'])).toBe(true);
    expect(hostnameMatches('example.com', ['DNS:*.example.com'])).toBe(false);
    expect(hostnameMatches('a.b.example.com', ['DNS:*.example.com'])).toBe(false);
    expect(hostnameMatches('192.0.2.10', ['IP:192.0.2.10'])).toBe(true);
    expect(normalizeHostname('HTTPS://Shop.Example.com:8443/x?y')).toBe('shop.example.com');
    expect(opensslCommand('example.com')).toBe('openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null');
  });

  it('reports real expiry, hostname and chain-order results', () => {
    const report = analyzeChain(`${LEAF}\n${ROOT}`, 'example.com', new Date('2026-06-01T00:00:00Z'));
    expect(report.daysUntilExpiry).toBe(214);
    expect(report.hostnameMatch).toBe(true);
    expect(report.checks.find((c) => c.id === 'expiry')?.level).toBe('pass');
    expect(report.checks.some((c) => c.id.startsWith('order-'))).toBe(false);

    const wrongOrder = analyzeChain(`${ROOT}\n${LEAF}`, '', new Date('2026-06-01T00:00:00Z'));
    expect(wrongOrder.checks.some((c) => c.id === 'leaf-ca')).toBe(true);
    expect(wrongOrder.checks.some((c) => c.id.startsWith('order-') && c.level === 'fail')).toBe(true);
  });

  it('flags expired, self-signed and SHA-1 certificates', () => {
    const report = analyzeChain(SELF_SIGNED_SHA1, 'legacy.example.test', new Date('2026-06-01T00:00:00Z'));
    expect(report.validity).toBe('expired');
    const ids = report.checks.filter((c) => c.level !== 'pass').map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['expiry', 'signature', 'self-signed', 'hostname']));
  });
});

describe('security-headers-analyzer: grades pasted headers instead of a fixed mock', () => {
  const raw = `HTTP/1.1 301 Moved Permanently
Location: https://example.com/

HTTP/2 200
strict-transport-security: max-age=300
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'
X-Content-Type-Options: nosniff
x-powered-by: Express
server: nginx/1.25.3
`;

  it('uses the last response block and lowercases names', () => {
    const parsed = parseRawHeaders(raw);
    expect(parsed.statusLine).toBe('HTTP/2 200');
    expect(parsed.headers.location).toBeUndefined();
    expect(parsed.headers['x-content-type-options']).toBe('nosniff');
  });

  it('marks short HSTS and unsafe-inline CSP as weak and lists disclosures', () => {
    const r = analyzeSecurityHeaders(raw);
    const by = Object.fromEntries(r.findings.map((f) => [f.key, f.status]));
    expect(by['strict-transport-security']).toBe('weak');
    expect(by['content-security-policy']).toBe('weak');
    expect(by['x-content-type-options']).toBe('present');
    expect(by['x-frame-options']).toBe('missing');
    expect(by['x-xss-protection']).toBe('info');
    expect(r.disclosures.map((d) => d.header)).toEqual(['server', 'x-powered-by']);
    expect(r.criticalMissing).toBe(0);
  });

  it('accepts CSP frame-ancestors in place of X-Frame-Options', () => {
    const r = analyzeSecurityHeaders("Strict-Transport-Security: max-age=31536000; includeSubDomains\nContent-Security-Policy: default-src 'none'; script-src 'self'; frame-ancestors 'none'");
    const by = Object.fromEntries(r.findings.map((f) => [f.key, f.status]));
    expect(by['x-frame-options']).toBe('present');
    expect(by['strict-transport-security']).toBe('present');
    expect(by['content-security-policy']).toBe('present');
  });

  it('throws when nothing header-like was pasted', () => {
    expect(() => analyzeSecurityHeaders('https://example.com')).toThrow(/No headers/);
    expect(() => analyzeSecurityHeaders('')).toThrow();
  });
});

describe('jwk-tool: real conversion instead of placeholder PEM text', () => {
  const RFC7638_KEY = {
    kty: 'RSA',
    n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
    e: 'AQAB',
    alg: 'RS256',
    kid: '2011-04-29',
  };

  it('computes the RFC 7638 section 3.1 example thumbprint', async () => {
    expect(await jwkThumbprint(RFC7638_KEY)).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
  });

  it('round-trips PEM -> JWK -> PEM for RSA, EC and Ed25519', async () => {
    for (const pem of [RSA_PUB, EC_PUB, ED_PUB]) {
      const { publicJwk } = await pemToJwk(pem);
      const back = await jwkToPem(publicJwk);
      expect(back.publicPem.replace(/\s+/g, '')).toBe(pem.replace(/\s+/g, ''));
    }
  });

  it('reads PKCS#1, SEC1 and certificate inputs', async () => {
    const fromPkcs1 = await pemToJwk(RSA_PKCS1_PUB);
    const fromSpki = await pemToJwk(RSA_PUB);
    const fromCert = await pemToJwk(LEAF);
    expect(fromPkcs1.thumbprint).toBe(fromSpki.thumbprint);
    expect(fromCert.thumbprint).toBe(fromSpki.thumbprint);
    const ec = await pemToJwk(EC_SEC1_PRIVATE);
    expect(ec.privateJwk?.d).toBeTruthy();
    expect(ec.thumbprint).toBe((await pemToJwk(EC_PUB)).thumbprint);
  });

  it('accepts JWKs whose alg would make Web Crypto reject them, and JWK Sets', async () => {
    const pem = await jwkToPem({ ...RFC7638_KEY, alg: 'PS512', key_ops: ['verify'] });
    expect(pem.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(parseJwkInput(JSON.stringify({ keys: [RFC7638_KEY, RFC7638_KEY] }))).toHaveLength(2);
    await expect(jwkToPem({ kty: 'oct', k: 'AAAA' })).rejects.toThrow(/Symmetric/);
  });

  it('generates real key pairs whose kid is the thumbprint', async () => {
    const pair = await generateKeyPair('ES256');
    expect(pair.publicJwk.kid).toBe(await jwkThumbprint(pair.publicJwk));
    expect(pair.publicJwk.d).toBeUndefined();
    expect(pair.privateJwk.d).toBeTruthy();
    expect((await pemToJwk(pair.publicPem)).thumbprint).toBe(pair.thumbprint);
  });
});

describe('digital-signature-validator: Web Crypto verification instead of Math.random()', () => {
  it('verifies OpenSSL RSA PKCS#1 v1.5, RSA-PSS, DER ECDSA and Ed25519 signatures', async () => {
    const cases: [string, string, string][] = [
      [RSA_PUB, SIG_RSA, 'RS256'],
      [RSA_PUB, SIG_PSS, 'PS256'],
      [EC_PUB, SIG_EC_DER, 'ES256'],
      [ED_PUB, SIG_ED, 'Ed25519'],
    ];
    for (const [publicKey, signature, alg] of cases) {
      const r = await verifySignature({ message: MESSAGE, signature, publicKey });
      expect(r.valid, alg).toBe(true);
      expect(r.matchedAlgorithm).toBe(alg);
    }
  });

  it('rejects a tampered message every time', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await verifySignature({ message: `${MESSAGE}\n`, signature: SIG_RSA, publicKey: RSA_PUB });
      expect(r.valid).toBe(false);
    }
  });

  it('takes the key from a certificate and refuses a mismatched algorithm', async () => {
    const r = await verifySignature({ message: MESSAGE, signature: SIG_RSA, publicKey: LEAF, algorithm: 'RS256' });
    expect(r.valid).toBe(true);
    await expect(verifySignature({ message: MESSAGE, signature: SIG_RSA, publicKey: RSA_PUB, algorithm: 'ES256' })).rejects.toThrow(/does not match/);
  });

  it('decodes hex and base64url signatures and converts DER ECDSA to r||s', () => {
    expect(decodeSignature('0a:ff').encoding).toBe('hex');
    expect(decodeSignature('ab-_').encoding).toBe('base64url');
    const raw = ecdsaDerToRaw(decodeSignature(SIG_EC_DER).bytes, 32);
    expect(raw).toHaveLength(64);
  });
});

describe('saml-tool: binding-aware decoding', () => {
  const REDIRECT_VALUE =
    'fZBNC4JAEIb%2FiuxdXTWCBl0QvAh1qejQJTZbUHA%2F2hnBn58agV46zrwzzzxMjlL3DsqBWnNW70EhBaPuDcISFGzwBqzEDsFIrRCogUt5OkIacXDekm1sz4K6KthDPpskzVhwUx47awo2zUwR4qBqgyQNTS2e7sOEh%2Bnuyg%2BQcUj4nQXVdLYzkpatlsghxHH3cpEapXa9ihqrY0TLRD5rwcL0K9H%2FnhJR%2BRnOxA%2BOG3Yer7DiW22fIj4%3D';

  it('inflates HTTP-Redirect values (the old decoder returned binary garbage)', () => {
    const d = decodeSamlMessage(`https://idp.example.com/sso?SAMLRequest=${REDIRECT_VALUE}&RelayState=x`);
    expect(d.binding).toBe('HTTP-Redirect');
    expect(d.parameter).toBe('SAMLRequest');
    expect(d.xml.startsWith('<samlp:AuthnRequest')).toBe(true);
    expect(summarizeSaml(d.xml)).toMatchObject({ messageType: 'AuthnRequest', id: '_abc123', issuer: 'https://sp.example.com', signed: false });
  });

  it('round-trips UTF-8 through both bindings without altering whitespace', () => {
    const xml = '<samlp:Response ID="_r1">\n  <saml:AttributeValue>José Müller</saml:AttributeValue>\n</samlp:Response>';
    expect(decodeSamlMessage(encodeSamlPost(xml))).toEqual({ xml, binding: 'HTTP-POST', parameter: undefined });
    expect(decodeSamlMessage(encodeSamlRedirect(xml)).xml).toBe(xml);
  });

  it('restores + signs that a form decoder turned into spaces', () => {
    const encoded = encodeSamlPost('<a>??>>??</a>');
    expect(encoded).toContain('+');
    expect(decodeSamlMessage(encoded.replace(/\+/g, ' ')).xml).toBe('<a>??>>??</a>');
  });
});

describe('hash-file-verifier: algorithms and expected-hash formats', () => {
  const bytes = new TextEncoder().encode(MESSAGE);
  const SHA256 = 'efc9197ad2d06ab99b50a13539f765a35877c49c396772e936f4e56121e1c8c5';

  it('hashes with MD5, SHA-1, SHA-256 and SHA-512 like the coreutils tools', async () => {
    expect(await hashBytes(bytes, 'MD5')).toBe('5425028af4415088eb2b76df468033e7');
    expect(await hashBytes(bytes, 'SHA-1')).toBe('889004b2edf5036101880de55dd9e56de50b62eb');
    expect(await hashBytes(bytes, 'SHA-256')).toBe(SHA256);
    expect(await hashBytes(bytes, 'SHA-512')).toBe('24f76516d2555aa0dc58862f7b80e8467441fa07ab8fd16afb4806a9bb9fb3ca8df750ca83901bd7b910eb42f1c0b9dca765ed1aaca60da4d1f3a409fd90b9e0');
  });

  it('matches pasted values with whitespace, filenames, uppercase or colons (previously reported as mismatches)', async () => {
    for (const expected of [
      `  ${SHA256.toUpperCase()}  `,
      `${SHA256}  release.tar.gz`,
      `${SHA256} *release.tar.gz`,
      `SHA256 (release.tar.gz) = ${SHA256}`,
      SHA256.match(/../g)!.join(':'),
    ]) {
      const r = await verifyBytes(bytes, expected);
      expect(r.match, expected).toBe(true);
      expect(r.algorithm).toBe('SHA-256');
    }
  });

  it('auto-detects MD5, SHA-1 and SRI sha384 values', async () => {
    expect((await verifyBytes(bytes, '5425028AF4415088EB2B76DF468033E7')).algorithm).toBe('MD5');
    expect((await verifyBytes(bytes, '889004b2edf5036101880de55dd9e56de50b62eb')).match).toBe(true);
    const sri = await verifyBytes(bytes, 'sha384-8z7nyK/6MGkbjckrAxhOlrhBxWbwcLjDBiAUkMX0OeRezNvEfVF+uwuLWFmojYUV');
    expect(sri).toMatchObject({ algorithm: 'SHA-384', match: true });
  });

  it('reports a real mismatch and refuses ambiguous lengths', async () => {
    expect((await verifyBytes(bytes, SHA256.replace(/^e/, 'f'))).match).toBe(false);
    await expect(verifyBytes(bytes, 'abcd')).rejects.toThrow(/Cannot tell the algorithm/);
    expect(parseExpectedHash(`${SHA256}  file`).format).toBe('coreutils');
    expect(hashesMatch('', '')).toBe(false);
  });
});

describe('sql-injection-tester', () => {
  it('flags ${} template interpolation (the built-in sample used to score 100/100)', () => {
    const sample = "SELECT * FROM users WHERE username = '${username}' AND password = '${password}';";
    const r = testSqlSecurity(sample);
    expect(r.vulnerabilities.map((v) => v.type)).toContain('Interpolated Value');
    expect(r.securityScore).toBeLessThan(80);
  });

  it('flags string concatenation and PHP variables', () => {
    expect(testSqlSecurity(`"SELECT * FROM t WHERE name = '" + name + "'"`).vulnerabilities.map((v) => v.type)).toContain('String Concatenation');
    expect(testSqlSecurity('SELECT * FROM t WHERE id = $id').vulnerabilities.map((v) => v.type)).toContain('Unescaped Variable');
  });

  it('does not flag bound parameters ($1, ?, :name, %s)', () => {
    for (const q of ['SELECT id FROM t WHERE id = $1 LIMIT 1', 'SELECT id FROM t WHERE id = ? LIMIT 1', 'SELECT id FROM t WHERE id = :id LIMIT 1', 'SELECT id FROM t WHERE id = %s LIMIT 1']) {
      const r = testSqlSecurity(q);
      expect(r.vulnerabilities, q).toEqual([]);
      expect(r.securityScore).toBe(100);
    }
  });
});

describe('security-checklist', () => {
  it('offers every category present in the data', () => {
    expect(categoryOptions([{ category: 'Malware Security' }, { category: 'API Security' }, { category: 'API Security' }])).toEqual(['all', 'API Security', 'Malware Security']);
  });
});
