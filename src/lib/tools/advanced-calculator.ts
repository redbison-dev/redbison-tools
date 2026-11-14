import { evaluate, format } from 'mathjs';

export type NumberBase = 'HEX' | 'DEC' | 'OCT' | 'BIN';

const RADIX: Record<NumberBase, number> = { HEX: 16, DEC: 10, OCT: 8, BIN: 2 };
const DIGITS: Record<NumberBase, RegExp> = {
  HEX: /^[0-9A-F]+$/,
  DEC: /^\d+$/,
  OCT: /^[0-7]+$/,
  BIN: /^[01]+$/,
};

/**
 * Display a mathjs result. Integers are shown exactly; everything else is
 * rounded to 14 significant digits so 0.1 + 0.2 reads 0.3 while 1e-12 is not
 * flattened to 0 (the old toFixed(10) did that).
 */
export function formatCalcResult(result: unknown): string {
  if (typeof result === 'number') {
    if (!Number.isFinite(result)) return String(result);
    if (Number.isInteger(result) && Math.abs(result) < 1e21) return result.toString();
    return format(result, { precision: 14 });
  }
  return format(result as Parameters<typeof format>[0], { precision: 14 });
}

/** Translate the calculator's display symbols into mathjs syntax. */
export function toMathjsExpression(expression: string): string {
  return expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
    .replace(/\blog\(/g, 'log10(')
    .replace(/\bln\(/g, 'log(');
}

/** Evaluate a basic/scientific expression with mathjs (no eval/Function). */
export function evaluateCalculatorExpression(expression: string): string {
  return formatCalcResult(evaluate(toMathjsExpression(expression)));
}

export function parseInBase(value: string, base: NumberBase): number {
  const s = value.trim().toUpperCase();
  const negative = s.startsWith('-');
  const digits = negative ? s.slice(1) : s;
  if (base === 'DEC') {
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  }
  if (!DIGITS[base].test(digits)) return NaN;
  const n = parseInt(digits, RADIX[base]);
  return negative ? -n : n;
}

export function formatInBase(value: number, base: NumberBase): string {
  const n = Math.trunc(value);
  return base === 'HEX' ? n.toString(16).toUpperCase() : n.toString(RADIX[base]);
}

/**
 * Evaluate a programmer-mode expression. Operands are read in the active base,
 * ^ means XOR (as on programmer calculators), and the result is an integer in
 * the same base. Only digits, whitespace, parentheses and integer/bitwise
 * operators are accepted, and mathjs evaluates the result.
 */
export function evaluateProgrammerExpression(expression: string, base: NumberBase): string {
  const expr = expression.replace(/×/g, '*').replace(/÷/g, '/').toUpperCase();
  if (!/^[\s0-9A-F.()+\-*/&|^~<>]*$/.test(expr)) throw new Error('Unsupported characters');
  const decimal = expr.replace(/[0-9A-F.]+/g, (token) => {
    if (base === 'DEC') {
      if (!/^\d+(\.\d+)?$/.test(token)) throw new Error(`Invalid number ${token}`);
      return token;
    }
    const n = parseInBase(token, base);
    if (Number.isNaN(n)) throw new Error(`${token} is not a ${base} number`);
    return String(n);
  });
  const mathjsExpr = decimal.replace(/\^/g, '^|');
  const result = evaluate(mathjsExpr);
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Non-numeric result');
  return formatInBase(result, base);
}
