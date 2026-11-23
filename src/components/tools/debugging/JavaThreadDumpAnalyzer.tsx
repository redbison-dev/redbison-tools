/**
 * Java Thread Dump Analyzer: paste or drop jstack / jcmd Thread.print
 * output. All parsing is src/lib/tools/jvm-thread-dump.ts (tested in
 * src/test/tools/dump-analyzers.test.ts); this component only renders the
 * analysis, verdict first: deadlocks, then states, contention, pools,
 * identical stacks and CPU. Nothing is uploaded.
 */
import React, { useMemo, useState } from 'react';
import { Activity, FileText, Lock, OctagonAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseThreadDump, renderThreadDumpSummary, type ThreadDumpAnalysis } from '@/lib/tools/jvm-thread-dump';
import { reportChart, reportInput } from '@/lib/report/attrs';
import { useT } from '@/i18n';
import { CodeArea, PRIVACY_NOTE } from '@/components/tools/devformat/shared';
import { DebugPage, DebugHeader, Panel, Notice, Stat, FileDrop, CopyDownload, useDevActions } from './shared';

/** Colors keyed by java.lang.Thread.State; unknown states fall back to gray. */
const STATE_COLOR: Record<string, string> = {
  RUNNABLE: '#16a34a',
  TIMED_WAITING: '#2563eb',
  WAITING: '#d97706',
  BLOCKED: '#dc2626',
  NEW: '#9ca3af',
  TERMINATED: '#6b7280',
};

/** A small real dump (OpenJDK 17, jcmd Thread.print): a deadlocked pair and a sleeping pool. */
const SAMPLE = `2026-11-22 14:56:33
Full thread dump OpenJDK 64-Bit Server VM (17.0.21.1+0 mixed mode, sharing):

"main" #1 prio=5 os_prio=31 cpu=29.70ms elapsed=3.18s tid=0x0000000104e9e160 nid=0x2703 waiting on condition  [0x000000016ba62000]
   java.lang.Thread.State: TIMED_WAITING (sleeping)
\tat java.lang.Thread.sleep(java.base@17.0.21.1/Native Method)
\tat Leaky.main(Leaky.java:19)

"Finalizer" #3 daemon prio=8 os_prio=31 cpu=0.11ms elapsed=3.17s tid=0x0000000ac10ccc00 nid=0x5e03 in Object.wait()  [0x000000016cac2000]
   java.lang.Thread.State: WAITING (on object monitor)
\tat java.lang.Object.wait(java.base@17.0.21.1/Native Method)
\t- waiting on <0x0000000318402f40> (a java.lang.ref.ReferenceQueue$Lock)
\tat java.lang.ref.ReferenceQueue.remove(java.base@17.0.21.1/ReferenceQueue.java:155)
\t- locked <0x0000000318402f40> (a java.lang.ref.ReferenceQueue$Lock)
\tat java.lang.ref.Finalizer$FinalizerThread.run(java.base@17.0.21.1/Finalizer.java:172)

"C2 CompilerThread0" #7 daemon prio=9 os_prio=31 cpu=18.28ms elapsed=3.17s tid=0x0000000ac10cea00 nid=0x6603 waiting on condition  [0x0000000000000000]
   java.lang.Thread.State: RUNNABLE
   No compile task

"deadlock-a" #14 prio=5 os_prio=31 cpu=0.30ms elapsed=3.15s tid=0x0000000ac1111200 nid=0x8103 waiting for monitor entry  [0x000000016e052000]
   java.lang.Thread.State: BLOCKED (on object monitor)
\tat Leaky.lambda$main$0(Leaky.java:16)
\t- waiting to lock <0x000000031841b588> (a java.lang.Object)
\t- locked <0x000000031841b578> (a java.lang.Object)
\tat Leaky$$Lambda$1/0x0000007001000a08.run(Unknown Source)
\tat java.lang.Thread.run(java.base@17.0.21.1/Thread.java:840)

"deadlock-b" #15 prio=5 os_prio=31 cpu=0.26ms elapsed=3.15s tid=0x0000000ac1111800 nid=0xa903 waiting for monitor entry  [0x000000016e25e000]
   java.lang.Thread.State: BLOCKED (on object monitor)
\tat Leaky.lambda$main$1(Leaky.java:17)
\t- waiting to lock <0x000000031841b578> (a java.lang.Object)
\t- locked <0x000000031841b588> (a java.lang.Object)
\tat Leaky$$Lambda$2/0x0000007001000c28.run(Unknown Source)
\tat java.lang.Thread.run(java.base@17.0.21.1/Thread.java:840)

"pool-worker-0" #16 prio=5 os_prio=31 cpu=1.15ms elapsed=3.15s tid=0x0000000ac1111e00 nid=0xa703 waiting on condition  [0x000000016e46a000]
   java.lang.Thread.State: TIMED_WAITING (sleeping)
\tat java.lang.Thread.sleep(java.base@17.0.21.1/Native Method)
\tat Leaky.sleep(Leaky.java:22)
\tat Leaky.spin(Leaky.java:21)
\tat Leaky$$Lambda$3/0x0000007001002800.run(Unknown Source)
\tat java.lang.Thread.run(java.base@17.0.21.1/Thread.java:840)

"pool-worker-1" #17 prio=5 os_prio=31 cpu=1.09ms elapsed=3.15s tid=0x0000000ac1112400 nid=0xa503 waiting on condition  [0x000000016e676000]
   java.lang.Thread.State: TIMED_WAITING (sleeping)
\tat java.lang.Thread.sleep(java.base@17.0.21.1/Native Method)
\tat Leaky.sleep(Leaky.java:22)
\tat Leaky.spin(Leaky.java:21)
\tat Leaky$$Lambda$3/0x0000007001002800.run(Unknown Source)
\tat java.lang.Thread.run(java.base@17.0.21.1/Thread.java:840)

"VM Thread" os_prio=31 cpu=0.38ms elapsed=3.17s tid=0x0000000104ead850 nid=0x4c03 runnable

Found one Java-level deadlock:
=============================
"deadlock-a":
  waiting to lock monitor 0x0000000ac0c7a840 (object 0x000000031841b588, a java.lang.Object),
  which is held by "deadlock-b"

"deadlock-b":
  waiting to lock monitor 0x0000000ac0c7a920 (object 0x000000031841b578, a java.lang.Object),
  which is held by "deadlock-a"

Java stack information for the threads listed above:
===================================================
"deadlock-a":
\tat Leaky.lambda$main$0(Leaky.java:16)
"deadlock-b":
\tat Leaky.lambda$main$1(Leaky.java:17)

Found 1 deadlock.
`;

const JavaThreadDumpAnalyzer = () => {
  const { t } = useT();
  const { copy, download, track } = useDevActions('java-thread-dump-analyzer');
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<ThreadDumpAnalysis | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const analyze = (text: string, source: string) => {
    setError('');
    setAnalysis(null);
    if (!text.trim()) {
      setError(t('Paste a thread dump first, or drop the file jstack wrote.'));
      return;
    }
    try {
      setAnalysis(parseThreadDump(text));
      track('analyze', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    setFileName(f.name);
    const text = await f.text();
    setInput(text);
    analyze(text, 'file');
  };

  const summary = useMemo(() => (analysis ? renderThreadDumpSummary(analysis) : ''), [analysis]);
  const total = analysis ? analysis.javaThreadCount : 0;
  const stateRows = analysis
    ? Object.entries(analysis.states).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <DebugPage>
      <DebugHeader
        h1={t('Java Thread Dump Analyzer')}
        tagline={t('Deadlocks, lock contention, thread pools and CPU from jstack or jcmd Thread.print output, parsed in your browser')}
        icon={Activity}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Thread dump')} icon={FileText}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CodeArea
              id="thread-dump-input"
              label={t('Paste the dump')}
              value={input}
              onChange={setInput}
              rows={10}
              placeholder={t('The output of jstack <pid>, jcmd <pid> Thread.print, or a kill -3 print from the log')}
            />
            <div className="flex flex-col gap-3">
              <FileDrop
                id="thread-dump-file"
                label={fileName || t('Drop a dump file here')}
                hint={t('Or click to choose one. Text files of any size; nothing is uploaded.')}
                accept=".txt,.log,.tdump,text/plain"
                onFile={onFile}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="tool-button" onClick={() => analyze(input, 'paste')}>
                  {t('Analyze dump')}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setInput(SAMPLE); setFileName(''); analyze(SAMPLE, 'sample'); }}>
                  {t('Load a sample')}
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t(PRIVACY_NOTE)}</p>
            </div>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {analysis && (
          <>
            {analysis.deadlocks.length > 0 && (
              <div role="alert" data-testid="td-deadlock" className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-900/20 p-4">
                <div className="flex items-start gap-3">
                  <OctagonAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">
                      {analysis.deadlocks.length === 1 ? t('Deadlock found') : t('{n} deadlocks found', { n: analysis.deadlocks.length })}
                    </div>
                    <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                      {t('These threads each hold a monitor the next one needs. None of them can ever proceed; only restarting the JVM clears it.')}
                    </p>
                    {analysis.deadlocks.map((d, i) => (
                      <div key={i} className="font-mono text-sm mt-2 text-red-900 dark:text-red-100 break-words">
                        {d.cycle.join(' → ')} {'→'} {d.cycle[0]}
                        {!d.reportedByJvm && (
                          <span className="font-sans text-xs ml-2 text-red-700 dark:text-red-300">
                            {t('(found from the lock graph; the dump has no JVM deadlock report)')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {analysis.deadlocks.length === 0 && (
              <Notice tone="ok" title={t('No monitor deadlock: no cycle in the waits-for graph of BLOCKED threads.')} />
            )}

            <Panel title={t('Threads and states')} icon={Users}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="td-stats">
                <Stat label={t('Java threads')} value={String(analysis.javaThreadCount)} sub={t('{n} daemon', { n: analysis.daemonCount })} />
                <Stat label={t('VM threads')} value={String(analysis.vmThreadCount)} sub={t('GC, JIT and other internals')} />
                <Stat label={t('BLOCKED')} value={String(analysis.states.BLOCKED ?? 0)} sub={t('waiting for a monitor')} tone={analysis.states.BLOCKED ? 'accent' : 'default'} />
                <Stat label={t('RUNNABLE')} value={String(analysis.states.RUNNABLE ?? 0)} sub={t('running or ready to run')} />
              </div>
              {(analysis.jvm || analysis.timestamp) && (
                <p className="text-xs text-gray-500 dark:text-gray-400" {...reportInput(t('Dump'), `${analysis.timestamp ?? ''} ${analysis.jvm ?? ''}`.trim())}>
                  {[analysis.timestamp, analysis.jvm].filter(Boolean).join(' · ')}
                </p>
              )}
              {/* One stacked bar: each java.lang.Thread.State's share of the Java threads. */}
              <div {...reportChart(t('Thread states'), { head: [t('State'), t('Threads')], rows: stateRows })}>
                <div className="flex h-5 w-full overflow-hidden rounded-full" role="img" aria-label={stateRows.map(([s, n]) => `${n} ${s}`).join(', ')}>
                  {stateRows.map(([s, n]) => (
                    <div key={s} style={{ width: `${(n / total) * 100}%`, backgroundColor: STATE_COLOR[s] ?? '#9ca3af' }} title={`${s}: ${n}`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" data-testid="td-states">
                  {stateRows.map(([s, n]) => (
                    <span key={s} className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                      <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ backgroundColor: STATE_COLOR[s] ?? '#9ca3af' }} />
                      <span className="font-mono">{s}</span> {n}
                    </span>
                  ))}
                </div>
              </div>
            </Panel>

            {analysis.contention.length > 0 && (
              <Panel title={t('Lock contention')} icon={Lock}>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('Monitors that BLOCKED threads are queuing on, busiest first. The holder is the thread to read first.')}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="td-contention">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3 font-medium">{t('Monitor')}</th>
                        <th className="py-1.5 pr-3 font-medium">{t('Waiting')}</th>
                        <th className="py-1.5 font-medium">{t('Held by')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {analysis.contention.slice(0, 10).map((c) => (
                        <tr key={c.address}>
                          <td className="py-1.5 pr-3 font-mono text-xs break-all">&lt;{c.address}&gt; ({c.className})</td>
                          <td className="py-1.5 pr-3">{c.waiters.length}</td>
                          <td className="py-1.5 font-mono text-xs break-all">{c.holder ?? t('not in this dump')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {analysis.pools.length > 0 && (
              <Panel title={t('Thread pools')}>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('Threads grouped by a shared name prefix. A pool whose threads all wait in the same state is idle or starved; read the identical stacks below to see which.')}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="td-pools">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3 font-medium">{t('Pool')}</th>
                        <th className="py-1.5 pr-3 font-medium">{t('Threads')}</th>
                        <th className="py-1.5 font-medium">{t('States')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {analysis.pools.slice(0, 12).map((p) => (
                        <tr key={p.prefix}>
                          <td className="py-1.5 pr-3 font-mono text-xs break-all">{p.prefix}*</td>
                          <td className="py-1.5 pr-3">{p.count}</td>
                          <td className="py-1.5 font-mono text-xs">{Object.entries(p.states).map(([s, n]) => `${n} ${s}`).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {analysis.hotStacks.length > 0 && (
              <Panel title={t('Identical stacks')}>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('Threads stopped at the same frames. Many threads parked in one place usually means a stuck pool, an empty queue or a slow downstream call.')}
                </p>
                <div className="space-y-3" data-testid="td-stacks">
                  {analysis.hotStacks.map((h, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <div className="text-sm font-semibold text-black dark:text-white">
                        {t('{n} threads', { n: h.count })}
                        <span className="font-normal text-xs text-gray-500 dark:text-gray-400 ml-2 break-all">{h.threads.slice(0, 6).join(', ')}{h.threads.length > 6 ? ', …' : ''}</span>
                      </div>
                      <pre className="font-mono text-xs mt-1 overflow-x-auto text-gray-700 dark:text-gray-300">{h.top.join('\n')}</pre>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {analysis.topCpu.length > 0 && (
              <Panel title={t('CPU since thread start')}>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('From the cpu= attribute (JDK 11+; older jstack output has none). It is total CPU since each thread started, not current load; compare two dumps taken seconds apart to see who is burning CPU now.')}
                </p>
                <table className="w-full text-sm max-w-md" data-testid="td-cpu">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {analysis.topCpu.map((c) => (
                      <tr key={c.name}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{c.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.cpuMs.toFixed(1)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={summary} filename="thread-dump-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="td-summary">{summary}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default JavaThreadDumpAnalyzer;
