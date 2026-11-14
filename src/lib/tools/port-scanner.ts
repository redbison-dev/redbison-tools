import { msg } from '../msg';

/** Service names; the English words in them are msg()-marked and translated where the page shows them. */
export const PORT_SERVICES: Record<number, string> = {
  20: msg('FTP data'), 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3',
  143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS', 587: msg('SMTP submission'), 993: 'IMAPS', 995: 'POP3S',
  1433: 'Microsoft SQL Server', 1521: 'Oracle', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL',
  6379: 'Redis', 8000: msg('HTTP alt'), 8008: msg('HTTP alt'), 8080: msg('HTTP alt'), 8443: msg('HTTPS alt'), 8888: msg('HTTP alt'),
  27017: 'MongoDB',
};

/** Hard cap so a typo like 1-65535 does not lock the page. */
export const MAX_PORTS = 1024;

/**
 * Parse "80,443,8000-8010" into a sorted, de-duplicated list of ports
 * 1 to 65535. Tokens that are not plain numbers or ranges are ignored
 * (the old parseInt read "8080abc" as 8080 and "1-1024" as port 1).
 */
export function parsePortList(input: string): number[] {
  const set = new Set<number>();
  for (const raw of input.split(/[,\s]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const range = t.match(/^(\d{1,5})-(\d{1,5})$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a < 1 || b > 65535 || a > b) continue;
      for (let p = a; p <= b && set.size < MAX_PORTS; p++) set.add(p);
    } else if (/^\d{1,5}$/.test(t)) {
      const p = Number(t);
      if (p >= 1 && p <= 65535) set.add(p);
    }
    if (set.size >= MAX_PORTS) break;
  }
  return [...set].sort((x, y) => x - y);
}
