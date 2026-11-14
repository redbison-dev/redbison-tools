/**
 * Market-version tool gaps for localization wave 1, batch h3: drink-driving
 * limit sets for the BAC calculator and guideline-specific blood pressure
 * classifiers. The US defaults ('intl' limits, ACC/AHA) must stay unchanged.
 */
import { describe, expect, it } from 'vitest';
import { BAC_LIMIT_SETS, STANDARD_DRINKS, alcoholGrams, bacLimitSet, stLbToKg, widmarkBac } from '@/lib/tools/calculators/fitness';
import { ACC_AHA_LABELS, BP_GUIDELINES, asBpGuideline, bpBands, classifyAccAha, classifyBpGuideline, summariseReadings } from '@/lib/tools/w500/health2';
import { bloodPressureSteps } from '@/lib/tools/steps/s8';

describe('BAC limit sets by market', () => {
  it('keeps the original international table as the default', () => {
    expect(bacLimitSet('intl').rows.map((r) => r.level)).toEqual([0.08, 0.05, 0.02]);
    expect(bacLimitSet('nonsense')).toBe(BAC_LIMIT_SETS.intl);
  });

  it('UK: 80 mg in England, Wales and NI; 50 mg in Scotland, with the breath figures from GOV.UK', () => {
    const gb = bacLimitSet('gb').rows;
    expect(gb.map((r) => r.level)).toEqual([0.08, 0.05]);
    expect(gb[0].where).toMatch(/35 µg per 100 ml of breath/);
    expect(gb[1].where).toMatch(/Scotland.*22 µg/);
  });

  it('Canada: criminal 0.08, provincial 0.05 warn range and a zero row', () => {
    expect(bacLimitSet('ca').rows.map((r) => r.level)).toEqual([0.08, 0.05, 0]);
  });

  it('Australia (Queensland): 0.05 general and a zero row for learners and P-platers', () => {
    expect(bacLimitSet('au').rows.map((r) => r.level)).toEqual([0.05, 0]);
  });

  it('every set says being under a limit is not the same as being fit to drive', () => {
    for (const set of Object.values(BAC_LIMIT_SETS)) expect(set.note).toMatch(/does not mean you are (unimpaired|safe to drive)/);
  });

  it('UK weight in stones and pounds feeds the same Widmark estimate', () => {
    const kg = stLbToKg('12', '8');
    expect(kg).toBeCloseTo(79.83, 2);
    // Two pints of 4% lager and a 175 ml glass of 13% wine, 2 hours on, male.
    const grams = 2 * alcoholGrams(568, 4) + alcoholGrams(175, 13);
    const r = widmarkBac({ grams, weightKg: kg, sex: 'male', hours: 2 })!;
    expect(grams / STANDARD_DRINKS.find((s) => s.id === 'uk')!.grams).toBeCloseTo(6.73, 1);
    expect(r.current.toFixed(3)).toBe('0.069');
    expect(r.hoursUntil(0.05)).toBeGreaterThan(0);
  });
});

describe('blood pressure guidelines', () => {
  it('ACC/AHA stays the default and matches the original classifier', () => {
    expect(asBpGuideline('')).toBe('acc-aha');
    for (const [s, d] of [[118, 76], [125, 78], [134, 82], [145, 88], [185, 100]]) {
      const band = classifyBpGuideline('acc-aha', 'clinic', s, d);
      expect(band.label).toBe(ACC_AHA_LABELS[classifyAccAha(s, d)]);
      // Home setting is ignored for ACC/AHA.
      expect(classifyBpGuideline('acc-aha', 'home', s, d)).toEqual(band);
    }
  });

  it('NICE NG136 clinic stages: 140/90, 160/100, 180/120', () => {
    const c = (s: number, d: number) => classifyBpGuideline('nice', 'clinic', s, d).id;
    expect(c(139, 89)).toBe('below');
    expect(c(140, 70)).toBe('stage1');
    expect(c(120, 90)).toBe('stage1');
    expect(c(159, 99)).toBe('stage1');
    expect(c(160, 80)).toBe('stage2');
    expect(c(150, 100)).toBe('stage2');
    expect(c(179, 119)).toBe('stage2');
    expect(c(180, 90)).toBe('severe');
    expect(c(150, 120)).toBe('severe');
  });

  it('NICE NG136 home or ambulatory averages: 135/85 and 150/95', () => {
    const h = (s: number, d: number) => classifyBpGuideline('nice', 'home', s, d).id;
    expect(h(134, 84)).toBe('below');
    expect(h(135, 80)).toBe('stage1');
    expect(h(130, 85)).toBe('stage1');
    expect(h(149, 94)).toBe('stage1');
    expect(h(150, 80)).toBe('stage2');
    expect(h(140, 95)).toBe('stage2');
    // 138/86 is stage 1 at home but below the clinic threshold.
    expect(classifyBpGuideline('nice', 'clinic', 138, 86).id).toBe('below');
  });

  it('Hypertension Canada 2025: 130/80 threshold, 140/90 medication threshold, same at home', () => {
    const c = (s: number, d: number) => classifyBpGuideline('hc', 'clinic', s, d).id;
    expect(c(129, 79)).toBe('below');
    expect(c(130, 70)).toBe('htn');
    expect(c(120, 80)).toBe('htn');
    expect(c(139, 89)).toBe('htn');
    expect(c(140, 85)).toBe('treat');
    expect(c(128, 90)).toBe('treat');
    expect(BP_GUIDELINES.hc.homeAware).toBe(false);
    expect(classifyBpGuideline('hc', 'home', 132, 78).id).toBe('htn');
  });

  it('ESH 2023 grades come from the existing ESH classifier', () => {
    expect(classifyBpGuideline('esh', 'clinic', 132, 86).id).toBe('high-normal');
    expect(classifyBpGuideline('esh', 'clinic', 165, 95).id).toBe('grade2');
    expect(bpBands('esh').map((b) => b.id)).toEqual(['optimal', 'normal', 'high-normal', 'grade1', 'grade2', 'grade3']);
  });

  it('a week of home readings averaged and classified by NICE', () => {
    const s = summariseReadings([{ sys: 150, dia: 92 }, { sys: 138, dia: 86 }, { sys: 136, dia: 84 }, { sys: 140, dia: 88 }], true)!;
    expect(Math.round(s.sys)).toBe(138);
    expect(Math.round(s.dia)).toBe(86);
    expect(classifyBpGuideline('nice', 'home', 138, 86).label).toBe('Stage 1 hypertension range (home)');
  });

  it('report steps add the chosen guideline and leave the US steps unchanged', () => {
    const us = bloodPressureSteps([{ sys: 136, dia: 84 }]);
    expect(bloodPressureSteps([{ sys: 136, dia: 84 }], false, { guideline: 'acc-aha', setting: 'clinic' })).toEqual(us);
    const ca = bloodPressureSteps([{ sys: 136, dia: 84 }], false, { guideline: 'hc', setting: 'clinic' });
    expect(ca.length).toBe(us.length + 1);
    expect(ca.at(-1)!.result).toBe('Hypertension range (130/80 or higher)');
    const gb = bloodPressureSteps([{ sys: 136, dia: 84 }], false, { guideline: 'nice', setting: 'home' });
    expect(gb.at(-1)!.label).toMatch(/home or ambulatory average/);
    expect(gb.at(-1)!.result).toBe('Stage 1 hypertension range (home)');
  });
});
