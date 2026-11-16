// @vitest-environment jsdom
/**
 * Pins the three dependencies that were upgraded to clear published advisories,
 * so a reinstall, a lockfile reset or a re-export cannot quietly drop back to a
 * vulnerable version. Each one is checked twice: the version floor, and the API
 * this repo actually uses — a floor alone would not catch a major that installs
 * cleanly and then behaves differently.
 *
 * These versions run ahead of the main redbison.dev repo on purpose;
 * opensource/export.ts (OSS_VERSIONS) records why, advisory by advisory.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import * as mathjs from 'mathjs';
import { parse as parseToml } from 'smol-toml';
import Ajv from 'ajv';
import * as XLSX from 'xlsx';
import { evaluateCalculatorExpression, formatCalcResult } from '@/lib/tools/advanced-calculator';
import { readWorkbook, sheetToJson } from '@/lib/tools/excel-to-json-converter';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

/** True when `version` is at or above `floor`. Both are plain x.y.z strings. */
function atLeast(version: string, floor: string): boolean {
  const read = (v: string): number[] => {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(v);
    if (!m) throw new Error(`no version found in: ${v}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const a = read(version);
  const b = read(floor);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

describe('advisory floors in package.json', () => {
  // The declared ranges, which is what a fresh `bun install` resolves from and
  // what a re-export would overwrite if the override were ever dropped.
  it('keeps mathjs at or above 15.2.0', () => {
    expect(atLeast(pkg.dependencies.mathjs, '15.2.0')).toBe(true);
  });

  it('keeps react-router-dom at or above 7.18.0', () => {
    expect(atLeast(pkg.dependencies['react-router-dom'], '7.18.0')).toBe(true);
  });

  it('keeps smol-toml at or above 1.6.1 and ajv at or above 8.18.0', () => {
    expect(atLeast(pkg.dependencies['smol-toml'], '1.6.1')).toBe(true);
    expect(atLeast(pkg.dependencies.ajv, '8.18.0')).toBe(true);
  });

  it('takes xlsx from the SheetJS registry, where the fixed builds live', () => {
    // SheetJS stopped publishing to npm at 0.18.5, which is still vulnerable,
    // so a plain "xlsx": "^0.18.5" here would be a silent regression.
    const spec = pkg.dependencies.xlsx;
    expect(spec).toMatch(/^https:\/\/cdn\.sheetjs\.com\//);
    expect(atLeast(spec, '0.19.3')).toBe(true);
  });
});

describe('mathjs', () => {
  // GHSA-29qv-4j9f-fjw5 and GHSA-jvff-x2qm-6286, both high: an unsafe object
  // property setter let an expression reach Object.prototype. Every 14.x is
  // affected; 15.2.0 is the first fixed release.
  it('installs at or above the fixed version', () => {
    expect(atLeast(mathjs.version, '15.2.0')).toBe(true);
  });

  it('refuses the prototype-pollution vectors from the advisories', () => {
    for (const expression of [
      'obj["__proto__"]["polluted"] = 1',
      'obj.constructor.prototype.polluted = 1',
      'obj["constructor"] = 1',
    ]) {
      expect(() => mathjs.evaluate(expression, { obj: {} })).toThrow(/No access to property/);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('still evaluates, formats and parses the way the calculators expect', () => {
    expect(mathjs.evaluate('2 + 3 * 4')).toBe(14);
    expect(mathjs.format(1 / 3, { precision: 4 })).toBe('0.3333');
    expect(mathjs.parse('1 + 2').toString()).toBe('1 + 2');
    expect(evaluateCalculatorExpression('2 + 3 * 4')).toBe('14');
    expect(formatCalcResult(1 / 4)).toBe('0.25');
  });
});

describe('xlsx (SheetJS)', () => {
  // GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS),
  // both high, fixed in 0.19.3.
  it('installs the patched build, not the last npm release', () => {
    expect(atLeast(XLSX.version, '0.19.3')).toBe(true);
    expect(XLSX.version).not.toBe('0.18.5');
  });

  it('still round-trips a workbook through the Excel-to-JSON tool', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['name', 'qty'],
      ['widget', 3],
      ['gasket', 11],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const read = readWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
    expect(read.SheetNames).toEqual(['Sheet1']);
    expect(sheetToJson(read, 'Sheet1', { includeHeaders: true, outputFormat: 'object' })).toEqual([
      { name: 'widget', qty: 3 },
      { name: 'gasket', qty: 11 },
    ]);
  });
});

describe('smol-toml and ajv', () => {
  // smol-toml: GHSA-7w5x-hrqm-74c2 (high) plus two moderate denial-of-service
  // reports, all fixed by 1.6.1. ajv: GHSA-2g4f-4pwh-qvx6, ReDoS via $data,
  // fixed in 8.18.0. Both parse whatever a visitor pastes in, so the point is
  // that they survive bad input rather than that they are merely current.
  it('still parses TOML, and rejects malformed input without hanging', () => {
    expect(parseToml('title = "demo"\n[owner]\nname = "Ada"')).toEqual({
      title: 'demo',
      owner: { name: 'Ada' },
    });
    const started = Date.now();
    expect(() => parseToml('key = "unterminated\nother = [1, 2')).toThrow();
    expect(() => parseToml('#\n'.repeat(20_000) + 'a = 1')).not.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('still compiles and runs a JSON Schema', () => {
    const validate = new Ajv().compile({
      type: 'object',
      properties: { n: { type: 'number' } },
      required: ['n'],
    });
    expect(validate({ n: 1 })).toBe(true);
    expect(validate({ n: 'no' })).toBe(false);
  });
});

describe('react-router-dom', () => {
  // GHSA-wrjc-x8rr-h8h6 (open redirect via mixed slashes) and
  // GHSA-337j-9hxr-rhxg (constructor injection in SSR hydration), fixed in
  // 7.18.0 by the router's own URL normalization — not something this app can
  // assert from outside, hence the floor above. What this covers is the other
  // half of the upgrade: that the v6 APIs the tools use survived the major.
  function ToolPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    return (
      <div>
        <h1>tool {id}</h1>
        <button onClick={() => navigate('/')}>back</button>
      </div>
    );
  }

  it('routes, reads params and navigates', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <div>
                <h1>home</h1>
                <Link to="/tool/json-formatter">to tool</Link>
              </div>
            }
          />
          <Route path="/tool/:id" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading').textContent).toBe('home');
    fireEvent.click(screen.getByText('to tool'));
    expect(screen.getByRole('heading').textContent).toBe('tool json-formatter');
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByRole('heading').textContent).toBe('home');
  });
});
