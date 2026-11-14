
export interface DiagnosticResult {
  /** Which check this is (the icon follows it; `test` is the translated title). */
  kind: 'http' | 'ping' | 'whois';
  test: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  duration?: number;
  details?: string[];
}

export interface NetworkDiagnosticsProps {
  domain: string;
}
