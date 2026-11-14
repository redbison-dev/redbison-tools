import React, { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { shouldConfirmSampleOverwrite } from '@/lib/tools/sample-data-guard';
import { useT } from '@/i18n';

/**
 * Guards "Load Sample" buttons: when the form holds something other than the
 * defaults or the last sample loaded, it asks before replacing it.
 *
 * `requestSampleLoad(nextState, apply)` takes the state the form will hold
 * after loading (used to recognise an unedited sample later) and the function
 * that actually loads it. `requestSampleLoad(apply)` does the same but reads
 * the loaded state back after the next render, for samples built inside the
 * load function (random ids, dates, per-option variants).
 *
 * Render `confirmDialog` anywhere inside the tool.
 */
export function useSampleOverwriteConfirm<T>(current: T, defaults: T, knownSamples: readonly T[] = []) {
  const { t } = useT();
  const [pending, setPending] = useState<{ apply: () => void; next?: T } | null>(null);
  const lastSampleRef = useRef<T | null>(null);
  const captureRef = useRef(false);

  // After a load without an explicit snapshot, remember what the form now holds.
  useEffect(() => {
    if (captureRef.current) {
      captureRef.current = false;
      lastSampleRef.current = current;
    }
  });

  const run = (apply: () => void, next?: T) => {
    if (next === undefined) {
      captureRef.current = true;
    } else {
      lastSampleRef.current = next;
    }
    apply();
  };

  function requestSampleLoad(apply: () => void): void;
  function requestSampleLoad(next: T, apply: () => void): void;
  function requestSampleLoad(nextOrApply: T | (() => void), maybeApply?: () => void): void {
    const apply = (maybeApply ?? nextOrApply) as () => void;
    const next = maybeApply ? (nextOrApply as T) : undefined;
    const samples = lastSampleRef.current ? [...knownSamples, lastSampleRef.current] : knownSamples;
    if (shouldConfirmSampleOverwrite(current, defaults, samples)) {
      setPending({ apply, next });
    } else {
      run(apply, next);
    }
  }

  const confirmDialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Replace your data with the sample?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Loading the sample overwrites what you have entered here, including the copy saved in this browser. Download or copy your work first if you want to keep it.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Keep my data')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pending) run(pending.apply, pending.next);
              setPending(null);
            }}
          >
            {t('Load sample')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestSampleLoad, confirmDialog };
}

/**
 * The value a form held on its first render. For tools whose state starts at
 * its defaults (plain useState, or storage loaded in an effect) this is the
 * "untouched" baseline to pass as `defaults`.
 */
export function useInitialSnapshot<T>(value: T): T {
  return useState(value)[0];
}
