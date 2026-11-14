import React, { useMemo, useState } from 'react';
import { Container, Terminal, FileCode2, ArrowLeftRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { WebPage, WebHeader, Panel, Segmented, CopyButton, DownloadButton, CodeOut, ErrorNote, LocalNote, useWebAnalytics } from './webopsShared';
import { dockerRunToCompose, composeToDockerRun, type WarningMsg } from '@/lib/tools/w500/webops-docker';
import { useT } from '@/i18n';

const RUN_SAMPLE = `docker run -d --name db \\
  -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=app \\
  -v pgdata:/var/lib/postgresql/data \\
  -p 5432:5432 --restart unless-stopped \\
  --health-cmd "pg_isready -U postgres" --health-interval 10s \\
  postgres:16

docker run -d --name web -p 8080:80 \\
  -v ./site:/usr/share/nginx/html:ro \\
  --restart unless-stopped nginx:1.27-alpine`;

const COMPOSE_SAMPLE = `services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: always
volumes:
  redis-data:
`;

export default function DockerRunToCompose() {
  const { t } = useT();
  const track = useWebAnalytics('docker-run-to-compose');
  const [dir, setDir] = useState('run2compose');
  const [runText, setRunText] = useState(RUN_SAMPLE);
  const [composeText, setComposeText] = useState(COMPOSE_SAMPLE);
  const [project, setProject] = useState('myproject');

  const res = useMemo(() => {
    try {
      if (dir === 'run2compose') {
        const r = dockerRunToCompose(runText);
        return { output: r.yaml, warnings: r.warningMsgs, error: null as string | null };
      }
      const r = composeToDockerRun(composeText, { project: project.trim() || 'myproject' });
      return { output: r.commands.join('\n\n') + '\n', warnings: r.warningMsgs, error: null as string | null };
    } catch (e) {
      return { output: '', warnings: [] as WarningMsg[], error: (e as Error).message };
    }
  }, [dir, runText, composeText, project]);

  const toCompose = dir === 'run2compose';

  return (
    <WebPage>
      <WebHeader h1={t('Docker Run to Compose Converter')} icon={Container} tagline={t('Paste docker run commands to get a docker-compose.yml with ports, volumes, environment, health checks and GPU settings mapped, or paste a compose file to get the docker run commands back.')} />
      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label={t('Direction')}
          value={dir}
          onChange={(v) => {
            setDir(v);
            track('direction', { dir: v });
          }}
          options={[
            { value: 'run2compose', label: t('docker run → Compose') },
            { value: 'compose2run', label: t('Compose → docker run') },
          ]}
        />
        {res.output && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (toCompose) {
                setComposeText(res.output);
                setDir('compose2run');
              } else {
                setRunText(res.output);
                setDir('run2compose');
              }
            }}
          >
            <ArrowLeftRight className="h-4 w-4 mr-1" />{' '}{t('Use output as input')}
          </Button>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={toCompose ? t('docker run commands') : 'compose.yaml'} icon={toCompose ? Terminal : FileCode2}>
          {toCompose ? (
            <Textarea aria-label={t('docker run commands')} value={runText} onChange={(e) => setRunText(e.target.value)} rows={14} className="font-mono text-xs sm:text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
          ) : (
            <>
              <Textarea aria-label={t('Compose file')} value={composeText} onChange={(e) => setComposeText(e.target.value)} rows={14} className="font-mono text-xs sm:text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              <div className="max-w-xs">
                <Label htmlFor="proj" className="text-sm font-medium text-black dark:text-white">
                  {t('Project name (prefix for volumes and networks)')}
                </Label>
                <Input id="proj" value={project} onChange={(e) => setProject(e.target.value)} className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
            </>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">{toCompose ? t('Several commands are fine: separate them with new lines, ; or &&. Backslash line breaks and quotes are understood.') : t('Compose names volumes and networks <project>_<name>; the commands use the same names so data is shared with docker compose up.')}</p>
          <LocalNote />
        </Panel>
        <Panel title={toCompose ? 'docker-compose.yml' : t('docker run')} icon={toCompose ? FileCode2 : Terminal}>
          {res.error ? (
            <ErrorNote>{res.error}</ErrorNote>
          ) : (
            <>
              <div data-testid="docker-output">
                <CodeOut value={res.output} label={t('Converted output')} maxH="max-h-[36rem]" />
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={res.output} label={t('Copy')} onCopied={() => track('copy', { dir })} />
                <DownloadButton text={res.output} filename={toCompose ? 'compose.yaml' : 'run.sh'} mime={toCompose ? 'application/yaml' : 'text/x-sh'} onDone={() => track('download', { dir })} />
              </div>
            </>
          )}
          {res.warnings.length > 0 && (
            <ul className="text-sm text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-1">
              {res.warnings.map((w) => {
                const text = t(w.text, w.vars);
                return <li key={text}>{text}</li>;
              })}
            </ul>
          )}
        </Panel>
      </div>
    </WebPage>
  );
}
