import React from 'react';
import { ListOrdered } from 'lucide-react';
import { ATTR } from '@/lib/report/attrs';
import { stepDateText, stepListJoin, type ReportStep, type StepMsg } from '@/lib/report/model';
import { useT } from '@/i18n';
import { intlTag } from '@/i18n/format';

/**
 * "Show the working": the calculation for the visitor's own inputs, one
 * step per line with the equation, the equation with numbers in and the
 * result, so anyone can check it by hand. Build `steps` with a pure
 * `<name>Steps()` function next to the calculator in src/lib/tools and test
 * that its last result equals the calculator's answer
 * (docs/calculation-standard.md). The report export reads the same markup.
 *
 * Step labels and formulas pass through t(): mark them with msg() where the
 * steps function defines them. Text built at run time ("Year 3 depreciation")
 * goes in `labelMsg`, `formulaMsg`, `workingMsg` or `resultMsg` as a template
 * plus values, with the plain field kept as the US English text.
 *
 * Dates and lists in that text follow the page's language too. A date is a
 * placeholder whose value is filled here: build the message with stepMsg()
 * and stepDate(iso, Intl options) (src/lib/report/model.ts), which keeps the
 * US English date in `vars` and the ISO date plus options in `dates`; this
 * component formats it for the locale (Intl, as useFormat().date does). A
 * list is one message per item (stepList()), joined here with
 * Intl.ListFormat (type unit, style short, "a, b, c" in US English) or with
 * a fixed symbol such as "; " (a separator with words, msg(' and '), goes
 * through t()). A phrase that is its own message ("2 years 4
 * months") goes in with stepPart(). Never pass a date or a joined list
 * formatted in English as a plain value.
 */
export default function CalculationSteps({ steps, title, note, defaultOpen = true }: { steps: ReportStep[]; title?: string; note?: string; defaultOpen?: boolean }) {
  const { t, locale } = useT();
  if (!steps.length) return null;
  const tag = intlTag(locale);
  // A step's *Msg field carries text built at run time; otherwise literal labels and formulas are msg()-marked keys.
  // Word values filled into a message (a material, a category band) are often msg()-marked data from other modules,
  // so string values go through t() too; a value with no catalog entry is returned unchanged.
  const fill = (vars: StepMsg['vars']) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' && /[A-Za-z]{2}/.test(v) ? t(v) : v]));
  const render = (m: StepMsg): string => {
    const vars = fill(m.vars);
    for (const [k, d] of Object.entries(m.dates ?? {})) vars[k] = stepDateText(d, tag);
    for (const [k, part] of Object.entries(m.msgs ?? {})) vars[k] = render(part);
    for (const [k, l] of Object.entries(m.lists ?? {})) vars[k] = stepListJoin(l.items.map(render), tag, l.join && /\p{L}/u.test(l.join) ? t(l.join) : l.join);
    return t(m.text, vars);
  };
  const say = (m: StepMsg | undefined, plain: string, literal: boolean) => (m ? render(m) : literal ? t(plain) : plain);
  return (
    <details open={defaultOpen} className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4" {...{ [ATTR.steps]: '' }}>
      <summary className="flex items-center gap-2 cursor-pointer select-none font-semibold text-sm text-black dark:text-white">
        <ListOrdered className="h-4 w-4 text-blue-600" aria-hidden="true" />
        {title ?? t('Show the working')}
        <span className="ml-auto text-xs font-normal text-gray-500 dark:text-gray-400 group-open:hidden">{t('{count} steps', { count: steps.length })}</span>
      </summary>
      <ol className="mt-3 space-y-3 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 min-w-0" {...{ [ATTR.step]: say(s.labelMsg, s.label, true) }}>
            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0 space-y-0.5">
              <div className="font-medium text-black dark:text-white" {...{ [ATTR.stepLabel]: '' }}>{say(s.labelMsg, s.label, true)}</div>
              {s.formula && <div className="font-mono text-gray-600 dark:text-gray-300 break-words" {...{ [ATTR.stepFormula]: '' }}>{say(s.formulaMsg, s.formula, true)}</div>}
              {s.working && (
                <div className="font-mono text-gray-700 dark:text-gray-200 break-words">
                  = <span {...{ [ATTR.stepWorking]: '' }}>{say(s.workingMsg, s.working, false)}</span>
                </div>
              )}
              <div className="font-mono font-semibold text-black dark:text-white break-words">
                = <span {...{ [ATTR.stepResult]: '' }}>{say(s.resultMsg, s.result, false)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {note && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </details>
  );
}
