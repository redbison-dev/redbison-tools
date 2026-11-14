/**
 * Lane 3 (web ops): edge, corner, positive and negative cases for the docker,
 * cron, redirect, chmod, User-Agent and .gitignore helpers.
 *
 * Expected values come from the Docker CLI reference and Compose
 * Specification, crontab(5) / Quartz / AWS EventBridge documentation, the
 * Apache / nginx / Netlify / Vercel redirect docs, POSIX and GNU coreutils
 * chmod(1), and gitignore(5). Each non-obvious figure has its derivation in
 * a comment.
 */
import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import { shellSplit, shellQuote, dockerRunToCompose, composeToDockerRun, formatCommand } from '@/lib/tools/w500/webops-docker';
import {
  validateField,
  expandField,
  compressValues,
  renderField,
  specToExpression,
  plainToSpec,
  platformOutputs,
  describeExpression,
  nextRuns,
  formatRun,
  impossibleDate,
  buildCron,
  parseField,
  expressionToSpec,
  CRON_PRESETS,
  type CronSpec,
} from '@/lib/tools/w500/webops-cron';
import { parseRules, generateRedirects, platformNotes } from '@/lib/tools/w500/webops-redirect';
import {
  hasBit,
  setBit,
  parseOctal,
  toOctal,
  toSymbolic,
  parseSymbolic,
  applySymbolic,
  umaskDefaults,
  describeMode,
  modeWarnings,
  convertChmod,
  toSymbolicArg,
} from '@/lib/tools/w500/webops-chmod';
import { parseUserAgent, detectBot, uaReport } from '@/lib/tools/w500/webops-ua';
import { GITIGNORE_TEMPLATES, getTemplate, findTemplates, buildGitignore, compileGitignore, checkIgnored } from '@/lib/tools/w500/webops-gitignore';

const svc = (yaml: string, name: string) => (YAML.parse(yaml) as { services: Record<string, Record<string, unknown>> }).services[name];
const oneLine = (cmd: string) => cmd.replace(/ \\\n\s+/g, ' ');
const runOf = (cmds: string[], name: string) => oneLine(cmds.find((c) => c.startsWith('docker run') && c.includes(`--name ${name} `))!);

// ---------------------------------------------------------------------------
// docker run <-> Compose
// ---------------------------------------------------------------------------
describe('shellSplit / shellQuote (POSIX shell word splitting)', () => {
  it('positive: separates commands on newline, ; and &&, and keeps quoted text', () => {
    expect(shellSplit(`a 'b c' "d\\"e" f\\ g; h && i\nj`)).toEqual([['a', 'b c', 'd"e', 'f g'], ['h'], ['i'], ['j']]);
  });
  it('edge: empty input, only comments and only separators give no commands', () => {
    expect(shellSplit('')).toEqual([]);
    expect(shellSplit('# just a comment\n   \n;;')).toEqual([]);
  });
  it('corner: a # inside a word is literal, a # after a space starts a comment; CRLF continuations join lines', () => {
    expect(shellSplit('echo a#b # gone')).toEqual([['echo', 'a#b']]);
    expect(shellSplit('docker run \\\r\n  alpine')).toEqual([['docker', 'run', 'alpine']]);
    // An empty quoted string is still a word ("" in POSIX sh yields an empty argument).
    expect(shellSplit(`x "" y`)).toEqual([['x', '', 'y']]);
  });
  it('negative: an unclosed single or double quote is a clear error', () => {
    expect(() => shellSplit(`echo 'oops`)).toThrow(/Unclosed quote/);
    expect(() => shellSplit(`echo "oops`)).toThrow(/Unclosed quote/);
  });
  it('shellQuote only quotes when needed and escapes single quotes the POSIX way', () => {
    expect(shellQuote('')).toBe("''");
    expect(shellQuote('nginx:1.27-alpine')).toBe('nginx:1.27-alpine');
    expect(shellQuote('a b')).toBe("'a b'");
    // it's -> 'it'\''s' (close quote, escaped quote, reopen)
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe('dockerRunToCompose (Docker CLI reference -> Compose Specification)', () => {
  it('positive: combined short flags, attached values and the long flag=value form', () => {
    const r = dockerRunToCompose('docker run -dit -eFOO=bar -p8080:80 --name=web --memory=1g -m 512 --cpus=1.5 --pids-limit 100 alpine:3.20 sh -c "echo hi"');
    const s = svc(r.yaml, 'web');
    expect(s).toMatchObject({
      image: 'alpine:3.20',
      container_name: 'web',
      environment: { FOO: 'bar' },
      ports: ['8080:80'],
      stdin_open: true,
      tty: true,
      cpus: 1.5,
      pids_limit: 100,
      command: ['sh', '-c', 'echo hi'],
    });
    // First -m/--memory wins; "1g" stays a string, a bare integer is bytes (Compose accepts an int).
    expect(s.mem_limit).toBe('1g');
    expect(r.yaml).not.toMatch(/^version:/m);
  });

  it('positive: sudo, podman and "container create" are accepted', () => {
    expect(dockerRunToCompose('sudo docker container create redis:7').services).toEqual(['redis']);
    expect(dockerRunToCompose('podman run redis:7').services).toEqual(['redis']);
  });

  it('edge: "--" ends the options, so the next word is the image (Docker CLI / getopt convention)', () => {
    const r = dockerRunToCompose('docker run -d -- alpine echo hi');
    expect(svc(r.yaml, 'alpine')).toMatchObject({ image: 'alpine', command: ['echo', 'hi'] });
  });

  it('edge: bool flags given =false are not set; =true is', () => {
    const s = svc(dockerRunToCompose('docker run --privileged=true --init=false --read-only nginx').yaml, 'nginx');
    expect(s.privileged).toBe(true);
    expect(s.init).toBeUndefined();
    expect(s.read_only).toBe(true);
  });

  it('volumes: named, anonymous, bind, Windows, $PWD and ~ sources; only named ones are declared', () => {
    const r = dockerRunToCompose('docker run -v data:/data -v /cache -v ./src:/src -v C:\\\\work:/w -v $PWD:/app -v ~/x:/x nginx');
    const doc = YAML.parse(r.yaml);
    expect(doc.services.nginx.volumes).toEqual(['data:/data', '/cache', './src:/src', 'C:\\work:/w', '$PWD:/app', '~/x:/x']);
    expect(Object.keys(doc.volumes)).toEqual(['data']);
  });

  it('--mount: volume, bind (readonly, propagation), tmpfs with size, and --tmpfs', () => {
    const r = dockerRunToCompose(
      'docker run --mount type=volume,src=vol,dst=/d,volume-nocopy --mount type=bind,source=/srv,target=/s,ro=true,bind-propagation=rshared --mount type=tmpfs,destination=/t,tmpfs-size=64000000 --tmpfs /run nginx',
    );
    const doc = YAML.parse(r.yaml);
    expect(doc.services.nginx.volumes).toEqual([
      { type: 'volume', source: 'vol', target: '/d', volume: { nocopy: true } },
      { type: 'bind', source: '/srv', target: '/s', read_only: true, bind: { propagation: 'rshared' } },
      { type: 'tmpfs', target: '/t', tmpfs: { size: 64000000 } },
    ]);
    expect(doc.services.nginx.tmpfs).toEqual(['/run']);
    expect(Object.keys(doc.volumes)).toEqual(['vol']);
  });

  it('networks: host/none/bridge/container: become network_mode; a custom network is external with alias and IPs', () => {
    expect(svc(dockerRunToCompose('docker run --net host nginx').yaml, 'nginx').network_mode).toBe('host');
    expect(svc(dockerRunToCompose('docker run --network none nginx').yaml, 'nginx').network_mode).toBe('none');
    expect(svc(dockerRunToCompose('docker run --network bridge nginx').yaml, 'nginx').network_mode).toBe('bridge');
    const c = dockerRunToCompose('docker run --network container:db nginx');
    expect(svc(c.yaml, 'nginx').network_mode).toBe('container:db');
    expect(c.warnings.join(' ')).toContain('service:<name>');

    const r = dockerRunToCompose('docker run --network backend --network-alias api --ip 172.20.0.5 --ip6 fd00::5 nginx');
    const doc = YAML.parse(r.yaml);
    expect(doc.services.nginx.networks).toEqual({ backend: { aliases: ['api'], ipv4_address: '172.20.0.5', ipv6_address: 'fd00::5' } });
    expect(doc.networks).toEqual({ backend: { external: true } });
    expect(r.warnings.join(' ')).toContain('external');
    expect(YAML.parse(dockerRunToCompose('docker run --network backend nginx').yaml).services.nginx.networks).toEqual(['backend']);
  });

  it('labels, sysctls, ulimits, logging, health check, GPUs and the copied scalar keys', () => {
    const r = dockerRunToCompose(
      'docker run -l tier=web --label flag --sysctl net.core.somaxconn=1024 --ulimit nproc=65535 --ulimit nofile=1024:2048 --log-driver json-file --log-opt max-size=10m ' +
        '--health-cmd "curl -f http://localhost/" --health-interval 30s --health-timeout 5s --health-retries 3 --health-start-period 10s ' +
        '--gpus 2 -w /app -u 1000:1000 -h box --domainname example.com --platform linux/arm64 --pull missing --pid host --ipc host ' +
        '--stop-signal SIGINT --stop-timeout 20 --runtime runc --isolation default --userns host --cgroup-parent /x --mac-address 02:42:ac:11:00:02 ' +
        '--memory-reservation 256m --memory-swap 1g --shm-size 64m --cpu-shares 512 --cpuset-cpus 0-1 --cap-add NET_ADMIN --cap-drop ALL --device /dev/fuse ' +
        '--dns 1.1.1.1 --dns-search example.com --dns-opt ndots:2 --security-opt no-new-privileges --link db --volumes-from data --group-add audio --add-host h:10.0.0.1 ' +
        '--expose 9000 --env-file .env --entrypoint /bin/sh --oom-kill-disable --restart on-failure:3 nginx',
    );
    const s = svc(r.yaml, 'nginx');
    expect(s.labels).toEqual({ tier: 'web', flag: '' });
    expect(s.sysctls).toEqual({ 'net.core.somaxconn': 1024 });
    expect(s.ulimits).toEqual({ nproc: 65535, nofile: { soft: 1024, hard: 2048 } });
    expect(s.logging).toEqual({ driver: 'json-file', options: { 'max-size': '10m' } });
    expect(s.healthcheck).toEqual({ test: ['CMD-SHELL', 'curl -f http://localhost/'], interval: '30s', timeout: '5s', retries: 3, start_period: '10s' });
    expect(s.deploy).toEqual({ resources: { reservations: { devices: [{ driver: 'nvidia', capabilities: ['gpu'], count: 2 }] } } });
    expect(s).toMatchObject({
      working_dir: '/app', user: '1000:1000', hostname: 'box', domainname: 'example.com', platform: 'linux/arm64', pull_policy: 'missing',
      pid: 'host', ipc: 'host', stop_signal: 'SIGINT', stop_grace_period: '20s', runtime: 'runc', isolation: 'default', userns_mode: 'host',
      cgroup_parent: '/x', mac_address: '02:42:ac:11:00:02', mem_reservation: '256m', memswap_limit: '1g', shm_size: '64m', cpu_shares: 512,
      cpuset: '0-1', cap_add: ['NET_ADMIN'], cap_drop: ['ALL'], devices: ['/dev/fuse'], dns: ['1.1.1.1'], dns_search: ['example.com'],
      dns_opt: ['ndots:2'], security_opt: ['no-new-privileges'], links: ['db'], volumes_from: ['data'], group_add: ['audio'],
      extra_hosts: ['h:10.0.0.1'], expose: ['9000'], env_file: ['.env'], entrypoint: '/bin/sh', oom_kill_disable: true, restart: 'on-failure:3',
    });
  });

  it('GPU forms: all, a count and a device list', () => {
    const dev = (flag: string) => (svc(dockerRunToCompose(`docker run --gpus ${flag} cuda`).yaml, 'cuda').deploy as { resources: { reservations: { devices: Record<string, unknown>[] } } }).resources.reservations.devices[0];
    expect(dev('all').count).toBe('all');
    expect(dev(`'"device=0,2"'`).device_ids).toEqual(['0', '2']);
  });

  it('--no-healthcheck wins over --health-* flags', () => {
    expect(svc(dockerRunToCompose('docker run --no-healthcheck --health-interval 5s nginx').yaml, 'nginx').healthcheck).toEqual({ disable: true });
  });

  it('warnings for --rm, -P, --attach, unknown options and several services; duplicate names get a suffix', () => {
    const r = dockerRunToCompose('docker run --rm -P -a stdout --frobnicate 7 nginx\ndocker run --weird nginx');
    expect(r.services).toEqual(['nginx', 'nginx-2']);
    const w = r.warnings.join('\n');
    expect(w).toContain('--rm has no Compose key');
    expect(w).toContain('-P (publish all');
    expect(w).toContain('--attach and --sig-proxy');
    expect(w).toContain('Unknown option --frobnicate 7 was skipped. Check that nginx is the image.');
    expect(w).toContain('Unknown option --weird was skipped.');
    expect(w).toContain('Several services were created');
  });

  it('service names come from the image: registry, port, tag and digest are dropped', () => {
    expect(dockerRunToCompose('docker run registry.example.com:5000/team/My_App:1.2').services).toEqual(['my_app']);
    expect(dockerRunToCompose('docker run ghcr.io/org/tool@sha256:abcd').services).toEqual(['tool']);
  });

  it('negative: missing value, missing image, wrong subcommand and empty input are clear errors', () => {
    expect(() => dockerRunToCompose('docker run nginx --name')).not.toThrow(); // --name after the image is an argument
    expect(() => dockerRunToCompose('docker run --name')).toThrow('--name needs a value.');
    expect(() => dockerRunToCompose('docker run -d')).toThrow('Command 1 has no image name.');
    expect(() => dockerRunToCompose('docker build .')).toThrow('Command 1 is "docker build", not "docker run".');
    expect(() => dockerRunToCompose('kubectl run x')).toThrow('Command 1 does not start with "docker run".');
    expect(() => dockerRunToCompose('docker')).toThrow('Command 1 is "docker ", not "docker run".');
    expect(() => dockerRunToCompose('   ')).toThrow('Paste at least one docker run command.');
  });

  it('negative: values Docker itself rejects are errors, not NaN or truncated keys in the YAML', () => {
    // docker: invalid argument "abc" for "--cpus" flag: failed to parse abc as a rational number
    expect(() => dockerRunToCompose('docker run --cpus abc nginx')).toThrow(/--cpus/);
    expect(() => dockerRunToCompose('docker run --cpu-shares lots nginx')).toThrow(/--cpu-shares/);
    expect(() => dockerRunToCompose('docker run --health-retries x nginx')).toThrow(/--health-retries/);
    // docker: --sysctl and --log-opt need key=value
    expect(() => dockerRunToCompose('docker run --sysctl foo nginx')).toThrow(/key=value/);
    expect(() => dockerRunToCompose('docker run --log-opt max-size nginx')).toThrow(/key=value/);
  });
});

describe('composeToDockerRun (Compose Specification -> docker run)', () => {
  it('positive: long-syntax ports and env_file entries become proper flags (no "[object Object]")', () => {
    const { commands } = composeToDockerRun(
      [
        'services:',
        '  web:',
        '    image: nginx',
        '    ports:',
        '      - "443:443"',
        '      - target: 80',
        '        published: 8080',
        '        host_ip: 127.0.0.1',
        '        protocol: udp',
        '      - target: 9000',
        '    env_file:',
        '      - path: ./default.env',
        '        required: true',
        '      - ./override.env',
      ].join('\n'),
    );
    const run = runOf(commands, 'web');
    expect(run).not.toContain('object Object');
    // Compose long syntax target 80, published 8080, host_ip 127.0.0.1, protocol udp == -p 127.0.0.1:8080:80/udp
    expect(run).toContain('-p 443:443 -p 127.0.0.1:8080:80/udp -p 9000');
    expect(run).toContain('--env-file ./default.env --env-file ./override.env');
  });

  it('volumes: project-prefixed named volume, name: override, external, relative bind warning, long syntax', () => {
    const { commands, warnings } = composeToDockerRun(
      [
        'services:',
        '  app:',
        '    image: app',
        '    volumes:',
        '      - data:/data',
        '      - logs:/logs:ro',
        '      - shared:/shared',
        '      - ./conf:/conf',
        '      - type: bind',
        '        source: /srv',
        '        target: /srv',
        '        read_only: true',
        '      - type: tmpfs',
        '        target: /tmp',
        'volumes:',
        '  data:',
        '  logs:',
        '    name: real-logs',
        '  shared:',
        '    external: true',
      ].join('\n'),
      { project: 'p' },
    );
    const run = runOf(commands, 'app');
    expect(run).toContain('-v p_data:/data -v real-logs:/logs:ro -v shared:/shared -v ./conf:/conf --mount type=bind,source=/srv,target=/srv,readonly --mount type=tmpfs,target=/tmp');
    expect(commands).toContain('docker volume create p_data');
    expect(commands).toContain('docker volume create real-logs');
    expect(commands.join('\n')).not.toContain('volume create shared');
    expect(warnings.join(' ')).toContain('relative bind mount ./conf needs Docker 23');
  });

  it('networks: service:, multiple networks, aliases and IPs, external and named networks', () => {
    const { commands, warnings } = composeToDockerRun(
      [
        'services:',
        '  a:',
        '    image: a',
        '    network_mode: service:b',
        '  b:',
        '    image: b',
        '    networks: [front, back]',
        '  c:',
        '    image: c',
        '    networks:',
        '      ext:',
        '        aliases: [cee]',
        '        ipv4_address: 10.5.0.9',
        '  d:',
        '    image: d',
        '    network_mode: host',
        '  e:',
        '    image: e',
        '    networks: [named]',
        'networks:',
        '  front:',
        '  back:',
        '  ext:',
        '    external: true',
        '  named:',
        '    name: my-net',
      ].join('\n'),
      { project: 'shop' },
    );
    expect(runOf(commands, 'a')).toContain('--network container:b');
    expect(runOf(commands, 'b')).toContain('--network shop_front');
    expect(warnings.join(' ')).toContain('docker network connect shop_back b');
    expect(runOf(commands, 'c')).toContain('--network ext --network-alias cee --ip 10.5.0.9');
    expect(runOf(commands, 'd')).toContain('--network host');
    expect(runOf(commands, 'e')).toContain('--network my-net');
    expect(commands.filter((c) => c.startsWith('docker network create'))).toEqual(['docker network create shop_front', 'docker network create shop_back', 'docker network create my-net']);
  });

  it('scalar flags, pull_policy mapping, stop_grace_period, ulimits, logging, healthchecks and GPUs', () => {
    const { commands, warnings } = composeToDockerRun(
      [
        'services:',
        '  s:',
        '    image: s',
        '    container_name: custom',
        '    restart: always',
        '    working_dir: /w',
        '    user: "1000"',
        '    hostname: h',
        '    platform: linux/amd64',
        '    pull_policy: if_not_present',
        '    pid: host',
        '    stop_signal: SIGTERM',
        '    mem_limit: 512m',
        '    cpus: 0.5',
        '    stop_grace_period: 45s',
        '    cap_add: [SYS_ADMIN]',
        '    extra_hosts:',
        '      host.docker.internal: host-gateway',
        '    labels:',
        '      a: b',
        '    sysctls:',
        '      net.ipv4.ip_forward: 1',
        '    ulimits:',
        '      nproc: 65535',
        '      nofile: {soft: 1024, hard: 2048}',
        '    logging:',
        '      driver: json-file',
        '      options: {max-size: 10m}',
        '    healthcheck:',
        '      test: [CMD, curl, -f, "http://x/"]',
        '      interval: 30s',
        '      retries: 3',
        '    deploy:',
        '      resources:',
        '        reservations:',
        '          devices:',
        '            - capabilities: [gpu]',
        '              device_ids: ["0", "1"]',
        '    stdin_open: true',
        '    tty: true',
        '    privileged: true',
        '    init: true',
        '    read_only: true',
        '    depends_on: [db]',
        '    profiles: [debug]',
        '    entrypoint: [/bin/sh, -c]',
        '    command: echo "hi there"',
        '  p:',
        '    image: p',
        '    pull_policy: build',
        '    stop_grace_period: 1m30s',
        '    healthcheck: {test: [NONE]}',
        '    deploy: {resources: {reservations: {devices: [{capabilities: [gpu]}]}}}',
        '  q:',
        '    image: q',
        '    healthcheck: {test: "pg_isready"}',
        '    entrypoint: /entry.sh --flag',
        '  r:',
        '    build: ./r',
        '    healthcheck: {disable: true}',
      ].join('\n'),
    );
    const s = runOf(commands, 'custom');
    expect(s).toContain('--restart always');
    expect(s).toContain('-w /w -u 1000 -h h --platform linux/amd64 --pull missing --pid host --stop-signal SIGTERM -m 512m --cpus 0.5 --stop-timeout 45 --cap-add SYS_ADMIN');
    expect(s).toContain('--add-host host.docker.internal:host-gateway -l a=b --sysctl net.ipv4.ip_forward=1 --ulimit nproc=65535 --ulimit nofile=1024:2048');
    expect(s).toContain('--log-driver json-file --log-opt max-size=10m');
    expect(s).toContain(`--health-cmd 'curl -f http://x/' --health-interval 30s --health-retries 3`);
    expect(s).toContain(`--gpus '"device=0,1"'`);
    expect(s).toContain('-i -t --privileged --init --read-only --entrypoint /bin/sh s -c echo');
    expect(s.endsWith(`s -c echo 'hi there'`)).toBe(true);
    const p = runOf(commands, 'p');
    expect(p).toContain('--no-healthcheck');
    expect(p).toContain('--gpus all');
    expect(p).not.toContain('--pull');
    const q = runOf(commands, 'q');
    expect(q).toContain('--health-cmd pg_isready');
    expect(q).toContain('--entrypoint /entry.sh q');
    const r = runOf(commands, 'r');
    expect(r).toContain('--no-healthcheck');
    expect(r.endsWith(' r')).toBe(true);
    const w = warnings.join('\n');
    expect(w).toContain('s: depends_on has no docker run flag');
    expect(w).toContain('s: profiles are a Compose feature');
    expect(w).toContain('s: docker run --entrypoint takes one executable');
    expect(w).toContain('p: pull_policy build has no docker run --pull equivalent');
    expect(w).toContain('p: stop_grace_period 1m30s must be given in whole seconds');
    expect(w).toContain('r: uses build:, so run "docker build -t r ./r" first.');
  });

  it('edge: non-object services are skipped; default project name is myproject', () => {
    const { commands } = composeToDockerRun('services:\n  bad: null\n  ok:\n    image: x\n');
    expect(commands).toEqual(['docker network create myproject_default', 'docker run -d --name ok --network myproject_default --network-alias ok x']);
  });

  it('negative: invalid YAML, no services and an empty document are clear errors', () => {
    expect(() => composeToDockerRun('services: [\n')).toThrow(/^YAML error:/);
    expect(() => composeToDockerRun('version: "3"\n')).toThrow('No "services:" section found.');
    expect(() => composeToDockerRun('')).toThrow('No "services:" section found.');
  });

  it('round trip: run -> compose -> run keeps the image, ports, env and restart policy', () => {
    const cmd = 'docker run -d --name cache -p 6379:6379 -e TZ=UTC --restart unless-stopped redis:7 redis-server --save 60 1';
    const back = runOf(composeToDockerRun(dockerRunToCompose(cmd).yaml, { project: 'x' }).commands, 'cache');
    expect(back).toBe('docker run -d --name cache --restart unless-stopped -p 6379:6379 -e TZ=UTC --network x_default --network-alias cache redis:7 redis-server --save 60 1');
  });
});

describe('formatCommand (line wrapping)', () => {
  it('keeps the first three words together and never splits a flag from its value', () => {
    const words = ['docker', 'run', '-d', '--name', 'a-very-long-container-name-for-wrapping', '-e', 'SOME_VARIABLE=some-long-value-here', '-i', 'image:tag'];
    const out = formatCommand(words);
    const lines = out.split('\n');
    expect(lines[0].startsWith('docker run -d --name a-very-long-container-name-for-wrapping')).toBe(true);
    expect(lines.slice(0, -1).every((l) => l.endsWith(' \\'))).toBe(true);
    expect(out).toContain('-e SOME_VARIABLE=some-long-value-here');
    // -i is a boolean flag, so it is not glued to the image.
    expect(oneLine(out)).toBe(words.join(' '));
  });
  it('edge: a short command stays on one line', () => {
    expect(formatCommand(['docker', 'run', '-d', 'x'])).toBe('docker run -d x');
  });
});

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------
const every = { mode: 'every' } as const;
const spec = (p: Partial<CronSpec>): CronSpec => ({ minute: every, hour: every, dom: every, month: every, dow: every, ...p });

describe('cron field validation, expansion and rendering (crontab(5))', () => {
  it('negative: every validateField branch gives a readable message', () => {
    expect(() => validateField('minute', { mode: 'step', step: 0 })).toThrow('The minute interval must be a whole number from 1 to 60.');
    expect(() => validateField('hour', { mode: 'step', step: 25 })).toThrow('from 1 to 24');
    expect(() => validateField('hour', { mode: 'step', step: 1.5 })).toThrow('whole number');
    expect(() => validateField('minute', { mode: 'step', step: 5, start: 60 })).toThrow('The minute start must be between 0 and 59.');
    expect(() => validateField('dow', { mode: 'list', values: [] })).toThrow('Pick at least one day of week.');
    expect(() => validateField('dom', { mode: 'list', values: [0] })).toThrow('0 is not a valid day of month (1 to 31).');
    expect(() => validateField('month', { mode: 'range', from: 0, to: 12 })).toThrow('The month range must be within 1 to 12.');
    expect(() => validateField('month', { mode: 'range', from: 6, to: 3 })).toThrow('The month range starts after it ends.');
    expect(() => validateField('hour', { mode: 'range', from: 1, to: 5, step: 0 })).toThrow('range step must be a whole number of at least 1');
    expect(() => validateField('minute', { mode: 'list', values: [Number.NaN] })).toThrow('NaN is not a valid minute');
  });
  it('edge: the largest legal step for each field is accepted (a step equal to the field width)', () => {
    expect(() => validateField('minute', { mode: 'step', step: 60 })).not.toThrow();
    expect(() => validateField('dom', { mode: 'step', step: 31 })).not.toThrow();
    expect(() => validateField('dow', { mode: 'step', step: 7 })).not.toThrow();
  });
  it('expandField: every, step with a start, range with a step, list with duplicates', () => {
    expect(expandField('dow', every)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // 5-59/15 -> 5, 20, 35, 50
    expect(expandField('minute', { mode: 'step', step: 15, start: 5 })).toEqual([5, 20, 35, 50]);
    // 1-10/4 -> 1, 5, 9
    expect(expandField('hour', { mode: 'range', from: 1, to: 10, step: 4 })).toEqual([1, 5, 9]);
    expect(expandField('month', { mode: 'list', values: [12, 1, 1, 6] })).toEqual([1, 6, 12]);
  });
  it('compressValues collapses runs of 3+ only, with optional names', () => {
    expect(compressValues([1, 2, 3, 5, 6, 9])).toBe('1-3,5,6,9');
    expect(compressValues([])).toBe('');
    expect(compressValues([1, 2, 3, 4, 5], (n) => ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][n])).toBe('MON-FRI');
  });
  it('renderField: step 1 is *, a step from a non-zero start uses start-max/step (Vixie cron accepts that form)', () => {
    expect(renderField('minute', { mode: 'step', step: 1 })).toBe('*');
    expect(renderField('minute', { mode: 'step', step: 15, start: 0 })).toBe('*/15');
    expect(renderField('minute', { mode: 'step', step: 15, start: 5 })).toBe('5-59/15');
    expect(renderField('dom', { mode: 'step', step: 2, start: 1 })).toBe('*/2');
    expect(renderField('hour', { mode: 'range', from: 9, to: 17 })).toBe('9-17');
    expect(renderField('hour', { mode: 'range', from: 9, to: 17, step: 2 })).toBe('9-17/2');
    expect(renderField('hour', { mode: 'range', from: 9, to: 17, step: 1 })).toBe('9-17');
  });
  it('specToExpression validates every field first', () => {
    expect(specToExpression(spec({ minute: { mode: 'list', values: [30] }, hour: { mode: 'list', values: [9] } }))).toBe('30 9 * * *');
    expect(() => specToExpression(spec({ hour: { mode: 'list', values: [24] } }))).toThrow('24 is not a valid hour (0 to 23).');
  });
});

describe('plainToSpec (plain schedule choices)', () => {
  const expr = (p: Parameters<typeof plainToSpec>[0]) => specToExpression(plainToSpec(p));
  it('positive: every frequency, with the defaults the UI documents', () => {
    expect(expr({ frequency: 'minutes' })).toBe('*/5 * * * *');
    expect(expr({ frequency: 'minutes', interval: 1 })).toBe('* * * * *');
    expect(expr({ frequency: 'hourly' })).toBe('0 * * * *');
    expect(expr({ frequency: 'hourly', interval: 6, minute: 15 })).toBe('15 */6 * * *');
    expect(expr({ frequency: 'daily' })).toBe('0 0 * * *');
    expect(expr({ frequency: 'daily', hours: [8, 20], minute: 5 })).toBe('5 8,20 * * *');
    expect(expr({ frequency: 'weekly' })).toBe('0 0 * * 1');
    expect(expr({ frequency: 'monthly' })).toBe('0 0 1 * *');
    expect(expr({ frequency: 'yearly' })).toBe('0 0 1 1 *');
  });
  it('edge: Sunday given as 7 becomes 0; empty arrays fall back to the defaults', () => {
    expect(expr({ frequency: 'weekly', daysOfWeek: [7, 6], hours: [] })).toBe('0 0 * * 0,6');
    expect(expr({ frequency: 'yearly', months: [], daysOfMonth: [] })).toBe('0 0 1 1 *');
  });
  it('every preset produces a valid expression', () => {
    for (const p of CRON_PRESETS) expect(() => describeExpression(specToExpression(plainToSpec(p.plain))), p.label).not.toThrow();
  });
});

describe('platformOutputs (Quartz, AWS EventBridge, GitHub Actions)', () => {
  it('weekday schedule: Quartz uses ? for day of month, EventBridge appends the year field', () => {
    const p = platformOutputs(expressionToSpec('0 9 * * MON-FRI'));
    // Quartz: "0 0 9 ? * MON-FRI" (seconds first). EventBridge docs: cron(0 9 ? * MON-FRI *)
    expect(p.find((x) => x.id === 'quartz')!.value).toBe('0 0 9 ? * MON-FRI');
    expect(p.find((x) => x.id === 'eventbridge')!.value).toBe('cron(0 9 ? * MON-FRI *)');
  });
  it('corner: day of month AND day of week set -> OR note in crontab, no Quartz/EventBridge equivalent', () => {
    const p = platformOutputs(expressionToSpec('0 0 13 * 5'));
    expect(p.find((x) => x.id === 'unix')!.notes.join(' ')).toContain('EITHER matches');
    expect(p.find((x) => x.id === 'quartz')!.value).toBeNull();
    expect(p.find((x) => x.id === 'eventbridge')!.value).toBeNull();
  });
  it('GitHub throttling note: a step under 5, every minute, or more than 12 runs an hour all day', () => {
    const note = (e: string) => platformOutputs(expressionToSpec(e)).find((x) => x.id === 'github')!.notes.join(' ').includes('at most once every 5 minutes');
    expect(note('*/2 * * * *')).toBe(true);
    expect(note('* * * * *')).toBe(true);
    // 13 listed minutes, every hour -> more than 12 runs an hour
    expect(note('0,1,2,3,4,5,6,7,8,9,10,11,12 * * * *')).toBe(true);
    expect(note('0,1,2,3,4,5,6,7,8,9,10,11,12 9 * * *')).toBe(false);
    expect(note('*/5 * * * *')).toBe(false);
  });
  it('step minutes keep the start in Quartz form (start/step)', () => {
    const s = spec({ minute: { mode: 'step', step: 10, start: 5 } });
    expect(platformOutputs(s).find((x) => x.id === 'quartz')!.value).toBe('0 5/10 * * * ?');
  });
});

describe('describe, next runs and buildCron', () => {
  it('describeExpression (cronstrue) and its negative path', () => {
    expect(describeExpression('30 9 * * 1-5')).toBe('At 09:30, Monday through Friday');
    expect(describeExpression('30 21 * * *', false)).toBe('At 09:30 PM');
    expect(() => describeExpression('61 * * * *')).toThrow();
  });
  it('nextRuns from a fixed instant (Fri 30 Oct 2026 00:00 UTC) skips the weekend', () => {
    const runs = nextRuns('30 9 * * 1-5', 3, new Date('2026-10-30T00:00:00Z'), 'UTC').map((d) => d.toISOString());
    expect(runs).toEqual(['2026-10-30T09:30:00.000Z', '2026-11-02T09:30:00.000Z', '2026-11-03T09:30:00.000Z']);
  });
  it('nextRuns honours the time zone: 09:00 in New York in winter is 14:00 UTC (EST, UTC-5)', () => {
    const [first] = nextRuns('0 9 * * *', 1, new Date('2026-12-01T00:00:00Z'), 'America/New_York');
    expect(first.toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
  // ICU versions differ on the comma after the weekday in en-GB, so it is optional here.
  it('formatRun renders "Thu 29 Oct 2026, 09:30" style in the given zone', () => {
    expect(formatRun(new Date('2026-10-29T09:30:00Z'), 'UTC')).toMatch(/^Thu,? 29 Oct 2026, 09:30$/);
    // 23:30 UTC on 31 Dec is 00:30 on 1 Jan in Paris (CET, UTC+1)
    expect(formatRun(new Date('2026-12-31T23:30:00Z'), 'Europe/Paris')).toMatch(/^Fri,? 01 Jan 2027, 00:30$/);
  });
  it('impossibleDate: 30/31 February never runs; 31 in a mix of months does; a weekday filter disables the check', () => {
    expect(impossibleDate(expressionToSpec('0 0 30,31 2 *'))).toBe('Day 30,31 never occurs in February, so this schedule would never run.');
    expect(impossibleDate(expressionToSpec('0 0 31 2,3 *'))).toBeNull();
    expect(impossibleDate(expressionToSpec('0 0 29 2 *'))).toBeNull(); // 29 Feb exists in leap years
    expect(impossibleDate(expressionToSpec('0 0 31 2 1'))).toBeNull();
  });
  it('buildCron: never-running schedule has no runs; day 31 is warned about; a bad time zone becomes a warning', () => {
    const never = buildCron(expressionToSpec('0 0 31 4 *'), { from: new Date('2026-01-01T00:00:00Z') });
    expect(never.nextRuns).toEqual([]);
    expect(never.warnings[0]).toContain('never occurs in April');
    const d31 = buildCron(expressionToSpec('0 0 31 * *'), { from: new Date('2026-01-01T00:00:00Z'), count: 2 });
    expect(d31.nextRuns.map((r) => r.replace(/^(\w{3}),/, '$1'))).toEqual(['Sat 31 Jan 2026, 00:00', 'Tue 31 Mar 2026, 00:00']);
    expect(d31.warnings.join(' ')).toContain('Months without day 31 are skipped');
    const badTz = buildCron(expressionToSpec('0 0 * * *'), { from: new Date('2026-01-01T00:00:00Z'), tz: 'Mars/Olympus' });
    expect(badTz.nextRuns).toEqual([]);
    expect(badTz.warnings).toEqual(['Unknown time zone "Mars/Olympus". Use an IANA name such as Europe/London.']);
    // "*" in day of month runs on every day that exists, so there is nothing to warn about.
    expect(buildCron(expressionToSpec('0 0 * * *'), { from: new Date('2026-01-01T00:00:00Z') }).warnings).toEqual([]);
    expect(buildCron(expressionToSpec('0 0 */2 * *'), { from: new Date('2026-01-01T00:00:00Z') }).warnings.join(' ')).toContain('Months without day 29, 31');
    expect(badTz.timezone).toBe('Mars/Olympus');
  });
});

describe('parseField / expressionToSpec (reading crontab expressions back)', () => {
  it('positive: names, 7 as Sunday, wrap-around FRI-SUN and N/step', () => {
    expect(parseField('dow', 'mon-fri')).toEqual({ mode: 'list', values: [1, 2, 3, 4, 5] });
    expect(parseField('dow', '7')).toEqual({ mode: 'list', values: [0] });
    // FRI-SUN: Sunday may be written as 7 at the end of a range -> 5,6,0
    expect(parseField('dow', 'FRI-SUN')).toEqual({ mode: 'list', values: [0, 5, 6] });
    expect(parseField('dow', '5-7')).toEqual({ mode: 'list', values: [0, 5, 6] });
    expect(parseField('month', 'JAN,jul')).toEqual({ mode: 'list', values: [1, 7] });
    // 5/15 in minutes = 5-59/15 -> 5, 20, 35, 50
    expect(parseField('minute', '5/15')).toEqual({ mode: 'list', values: [5, 20, 35, 50] });
    expect(parseField('hour', '*/6')).toEqual({ mode: 'step', step: 6 });
  });
  it('edge: a list or range covering the whole field collapses to every', () => {
    expect(parseField('dow', '0-6')).toEqual({ mode: 'every' });
    expect(parseField('dow', 'SUN-SAT')).toEqual({ mode: 'every' });
    expect(parseField('hour', '*/1')).toEqual({ mode: 'step', step: 1 });
    expect(parseField('hour', '0-23/1')).toEqual({ mode: 'every' });
    expect(parseField('minute', ' * ')).toEqual({ mode: 'every' });
  });
  it('negative: Quartz/AWS extensions, out-of-range values, junk and zero steps are rejected', () => {
    expect(() => parseField('dom', 'L')).toThrow(/Quartz\/AWS extensions/);
    expect(() => parseField('dom', '15W')).toThrow(/Quartz\/AWS extensions/);
    expect(() => parseField('dow', '5#3')).toThrow(/Quartz\/AWS extensions/);
    expect(() => parseField('dom', '?')).toThrow(/Quartz\/AWS extensions/);
    expect(() => parseField('dom', '0')).toThrow('"0" is outside 1-31 for day of month.');
    expect(() => parseField('minute', '60')).toThrow('outside 0-59');
    expect(() => parseField('hour', '10-2')).toThrow('outside 0-23');
    expect(() => parseField('minute', 'abc')).toThrow('"abc" is not a valid minute value.');
    expect(() => parseField('minute', '1-2-3')).toThrow();
    expect(() => parseField('minute', '1-5/0')).toThrow('A step must be at least 1.');
    expect(() => parseField('minute', '')).toThrow();
    // crontab(5): a step of 0 is invalid; "*/0" must not become a zero-step spec (which loops forever when expanded)
    expect(() => parseField('minute', '*/0')).toThrow(/step/i);
  });
  it('expressionToSpec needs exactly five fields', () => {
    expect(() => expressionToSpec('0 0 * *')).toThrow('Expected 5 fields (minute hour day-of-month month day-of-week), got 4.');
    expect(() => expressionToSpec('0 0 0 * * *')).toThrow('got 6');
    expect(specToExpression(expressionToSpec('  0   12  1,15  *  1-5 '))).toBe('0 12 1,15 * 1-5');
  });
});

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------
describe('parseRules (redirect list checks)', () => {
  it('positive: comments, blank lines, comma/tab separators, 301! and CRLF', () => {
    const { rules, issues } = parseRules('# comment\r\n\r\n/a,/b\r\n/c\t/d\t308\r\n/e /f 301!\r\n', 302);
    expect(issues).toEqual([]);
    expect(rules.map((r) => [r.from, r.to, r.code, r.line])).toEqual([
      ['/a', '/b', 302, 3],
      ['/c', '/d', 308, 4],
      ['/e', '/f', 301, 5],
    ]);
  });
  it('negative: every malformed-line error', () => {
    const { rules, issues } = parseRules(['/only', '/a /b 303', 'old /new', '/a*b /c', '/a ftp://x'].join('\n'));
    expect(rules).toEqual([]);
    expect(issues.map((i) => `${i.line}:${i.level}`)).toEqual(['1:error', '2:error', '3:error', '4:error', '5:error']);
    expect(issues[1].message).toBe('"303" is not a redirect code. Use 301, 302, 307 or 308.');
    expect(issues[2].message).toBe('Source "old" must start with "/".');
    expect(issues[3].message).toBe('A "*" is only allowed at the end of the source.');
    expect(issues[4].message).toBe('Destination "ftp://x" must start with "/" or http(s)://.');
  });
  it('warnings: absolute source URL, query string in the source, duplicate source', () => {
    const { rules, issues } = parseRules('https://example.com/old?x=1 /new\n/old/ /other');
    expect(rules[0].from).toBe('/old');
    expect(issues.map((i) => i.message).join('\n')).toMatch(/only the path is used[\s\S]*Query strings in the source are ignored[\s\S]*Duplicate source; line 1 already redirects \/old\//);
    expect(parseRules('https://example.com /home').rules[0].from).toBe('/');
  });
  it('loops: self, mutual, and a destination inside the redirected prefix', () => {
    expect(parseRules('/a /a/').issues[0].message).toBe('Redirects to itself, which loops forever.');
    const mutual = parseRules('/a /b\n/b /a').issues.filter((i) => i.level === 'error');
    expect(mutual.map((i) => i.message)).toEqual(['Loop: /a and /b redirect to each other.', 'Loop: /b and /a redirect to each other.']);
    expect(parseRules('/blog/* /blog/archive/').issues[0].message).toContain('inside the prefix');
    expect(parseRules('/blog/* /blog').issues.map((i) => i.level)).toEqual(['error']);
    expect(parseRules('/* /new/').issues.map((i) => i.level)).toEqual(['error']);
  });
  it('edge: a destination that only shares leading characters with the prefix is not a loop (/blog/ vs /blog-new/)', () => {
    // /blog-new/x does not start with /blog/, so nothing loops.
    expect(parseRules('/blog/* /blog-new/').issues).toEqual([]);
    expect(parseRules('/docs* /documentation/').issues).toEqual([]);
    expect(parseRules('/blog/* https://example.com/blog/').issues).toEqual([]);
  });
  it('chains are reported with a shortcut suggestion', () => {
    expect(parseRules('/a /b\n/b /c').issues).toEqual([{ line: 1, level: 'warning', message: 'Chain: /a → /b → /c. Point line 1 straight at /c to save a round trip.' }]);
  });
  it(':splat and trailing * are stripped from destinations', () => {
    expect(parseRules('/blog/* /news/:splat').rules[0]).toMatchObject({ from: '/blog/', to: '/news/', prefix: true });
    expect(parseRules('/blog/* /news/*').rules[0].to).toBe('/news/');
  });
});

describe('generateRedirects per platform', () => {
  const RULES = '/old /new\n/blog/* /news/ 302\n/ /home 308\n/* /v2/ 307';
  it('Apache: anchored patterns without the leading slash, QSD when the query is dropped', () => {
    const out = generateRedirects(RULES, 'apache', { keepQuery: false }).output;
    expect(out).toContain('RewriteRule ^old/?$ /new [R=301,L,QSD]');
    expect(out).toContain('RewriteRule ^blog/(.*)$ /news/$1 [R=302,L,QSD]');
    expect(out).toContain('RewriteRule ^/?$ /home [R=308,L,QSD]');
    expect(out).toContain('RewriteRule ^(.*)$ /v2/$1 [R=307,L,QSD]');
    expect(generateRedirects('/a.b /c', 'apache').output).toContain('RewriteRule ^a\\.b/?$ /c [R=301,L]');
  });
  it('nginx: exact location plus trailing-slash twin; prefix as regex; root has no twin', () => {
    const out = generateRedirects(RULES, 'nginx').output;
    expect(out).toContain('location = /old {\n    return 301 /new$is_args$args;\n}\nlocation = /old/ {');
    expect(out).toContain('location ~ ^/blog/(.*)$ {\n    return 302 /news/$1$is_args$args;\n}');
    expect(out).toContain('location = / {\n    return 308 /home$is_args$args;\n}');
    expect(out).not.toContain('location = // {');
    expect(out).toContain('location ~ ^/(.*)$ {');
    expect(generateRedirects('/a /b', 'nginx', { keepQuery: false }).output).toContain('return 301 /b;');
  });
  it('Netlify: padded columns, /* with :splat, root prefix as /*', () => {
    const out = generateRedirects(RULES, 'netlify').output.split('\n');
    expect(out).toContain('/old        /new  301');
    expect(out).toContain('/blog/*     /news/:splat  302');
    expect(out).toContain('/*          /v2/:splat  307');
  });
  it('Vercel: 308/307 as permanent true/false, 301/302 as statusCode, prefix as :path*', () => {
    const json = JSON.parse(generateRedirects(RULES, 'vercel').output);
    expect(json.redirects).toEqual([
      { source: '/old', destination: '/new', statusCode: 301 },
      { source: '/blog/:path*', destination: '/news/:path*', statusCode: 302 },
      { source: '/', destination: '/home', permanent: true },
      { source: '/:path*', destination: '/v2/:path*', permanent: false },
    ]);
  });
  it('site rules: canonical host and HTTPS on every platform; a pasted URL as the domain is normalised', () => {
    const site = { forceHttps: true, host: 'www' as const, domain: 'https://example.com/' };
    const apache = generateRedirects('', 'apache', { site }).output;
    expect(apache).toContain('RewriteCond %{HTTP_HOST} ^example\\.com$ [NC]\nRewriteRule ^(.*)$ https://www.example.com/$1 [R=301,L]');
    expect(apache).toContain('RewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://www.example.com/$1 [R=301,L]');
    const nginx = generateRedirects('', 'nginx', { site: { ...site, host: 'apex' } }).output;
    expect(nginx).toContain('#     server_name example.com www.example.com;\n#     return 301 https://example.com$request_uri;');
    expect(nginx).toContain('#     server_name www.example.com;');
    const netlify = generateRedirects('', 'netlify', { site }).output;
    expect(netlify).toContain('https://example.com/*  https://www.example.com/:splat  301!');
    expect(netlify).toContain('HTTPS is enforced by Netlify');
    const vercel = JSON.parse(generateRedirects('', 'vercel', { site }).output);
    // The same normalised host as the other platforms, not the raw "https://example.com/" text.
    expect(vercel.redirects[0]).toEqual({ source: '/:path(.*)', has: [{ type: 'host', value: 'example.com' }], destination: 'https://www.example.com/:path', permanent: true });
  });
  it('edge: HTTPS only (no host rule) and host rule without a domain', () => {
    expect(generateRedirects('', 'apache', { site: { forceHttps: true } }).output).toContain('https://%{HTTP_HOST}/$1');
    expect(generateRedirects('', 'nginx', { site: { forceHttps: true } }).output).toContain('return 301 https://$host$request_uri;');
    expect(generateRedirects('', 'apache', { site: { host: 'www' } }).output).not.toContain('Canonical host');
    expect(JSON.parse(generateRedirects('', 'vercel', { site: { host: 'www' } }).output).redirects).toEqual([]);
  });
  it('platformNotes mention the query-string behaviour and HTTPS', () => {
    expect(platformNotes('netlify', false, {}).join(' ')).toContain('no switch to drop the query string');
    expect(platformNotes('nginx', false, {}).join(' ')).toContain('The query string is dropped');
    expect(platformNotes('vercel', true, { forceHttps: true }).join(' ')).toContain('redirects HTTP automatically');
    expect(platformNotes('apache', true, {}).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// chmod
// ---------------------------------------------------------------------------
describe('chmod octal and symbolic forms (POSIX chmod, GNU coreutils)', () => {
  it('hasBit / setBit', () => {
    expect(hasBit(0o750, 'g', 'x')).toBe(true);
    expect(hasBit(0o750, 'o', 'r')).toBe(false);
    expect(setBit(0o644, 'u', 'x', true)).toBe(0o744);
    expect(setBit(0o644, 'u', 'w', false)).toBe(0o444);
  });
  it('parseOctal: 1 to 4 digits with optional 0o; anything else, including modes over 7777, is an error', () => {
    expect(parseOctal('755')).toBe(0o755);
    expect(parseOctal(' 0o4755 ')).toBe(0o4755);
    expect(parseOctal('7777')).toBe(0o7777);
    expect(parseOctal('0')).toBe(0);
    for (const bad of ['', '8', '17777', '07777x', '-1', '0x1ff', '7.5']) expect(() => parseOctal(bad), bad).toThrow('Enter 1 to 4 octal digits');
  });
  it('toOctal / toSymbolic with s/S and t/T (ls -l conventions)', () => {
    expect(toOctal(0o755)).toBe('755');
    expect(toOctal(0o755, true)).toBe('0755');
    expect(toOctal(0o4755)).toBe('4755');
    expect(toOctal(0)).toBe('000');
    expect(toSymbolic(0o4755)).toBe('rwsr-xr-x');
    expect(toSymbolic(0o4644)).toBe('rwSr--r--');
    expect(toSymbolic(0o2755)).toBe('rwxr-sr-x');
    expect(toSymbolic(0o1777)).toBe('rwxrwxrwt');
    expect(toSymbolic(0o1776)).toBe('rwxrwxrwT');
    expect(toSymbolic(0o7000)).toBe('--S--S--T');
    expect(toSymbolic(0)).toBe('---------');
  });
  it('parseSymbolic: bare, with file type, ls suffix, and the error', () => {
    expect(parseSymbolic('rwxr-xr-x')).toEqual({ mode: 0o755, type: undefined });
    expect(parseSymbolic('drwxrwxrwt')).toEqual({ mode: 0o1777, type: 'd' });
    expect(parseSymbolic('-rwsr-sr-x.')).toEqual({ mode: 0o6755, type: '-' });
    expect(parseSymbolic('lrwxrwxrwx 1 root root')).toEqual({ mode: 0o777, type: 'l' });
    expect(() => parseSymbolic('rwxrwxrw')).toThrow('Expected nine characters');
    expect(() => parseSymbolic('rwxrwxrwz')).toThrow('Expected nine characters');
    expect(() => parseSymbolic('rwtrwxrwx')).toThrow('Expected nine characters'); // t only in the others triad
  });
  it('applySymbolic matches GNU chmod examples', () => {
    expect(applySymbolic(0o644, 'u+x')).toBe(0o744);
    expect(applySymbolic(0o777, 'go-w')).toBe(0o755);
    // a=rX on a file without any x: X adds nothing -> r--r--r--
    expect(applySymbolic(0o644, 'a=rX')).toBe(0o444);
    // a=rX on a directory: X adds x -> r-xr-xr-x
    expect(applySymbolic(0o700, 'a=rX', { isDir: true })).toBe(0o555);
    // a=rX on a file that already has some x: X counts -> r-xr-xr-x
    expect(applySymbolic(0o744, 'a=rX')).toBe(0o555);
    expect(applySymbolic(0o750, 'o=u')).toBe(0o757);
    expect(applySymbolic(0o640, 'g=u,o=g')).toBe(0o666);
    expect(applySymbolic(0o755, 'u+s,g+s')).toBe(0o6755);
    expect(applySymbolic(0o777, '+t')).toBe(0o1777);
    expect(applySymbolic(0o1777, 'o-t')).toBe(0o777);
    expect(applySymbolic(0o644, 'u=rw,g=r,o=')).toBe(0o640);
    expect(applySymbolic(0o644, 'u+')).toBe(0o644);
    expect(applySymbolic(0o644, 'u+x-w')).toBe(0o544);
  });
  it('corner: no "who" letter -> umask bits are left alone (POSIX)', () => {
    // +x with umask 022 -> 0111 & ~022 = 0111 -> 644 becomes 755
    expect(applySymbolic(0o644, '+x')).toBe(0o755);
    // +w with umask 022 -> 0222 & ~022 = 0200 -> 444 becomes 644
    expect(applySymbolic(0o444, '+w')).toBe(0o644);
    // =r with umask 022 on 777: clears r/w/x except the masked 022 bits, then sets 0444 -> 0466
    expect(applySymbolic(0o777, '=r')).toBe(0o466);
    expect(applySymbolic(0o444, '+w', { umask: 0 })).toBe(0o666);
  });
  it('corner: "=" on a directory keeps setuid/setgid unless named (GNU coreutils)', () => {
    expect(applySymbolic(0o2775, 'g=rx', { isDir: true })).toBe(0o2755);
    expect(applySymbolic(0o2775, 'g=rx')).toBe(0o0755);
    expect(applySymbolic(0o2775, 'g=rxs', { isDir: true })).toBe(0o2755);
  });
  it('negative: empty and malformed expressions', () => {
    expect(() => applySymbolic(0o644, '')).toThrow('Enter a symbolic mode');
    expect(() => applySymbolic(0o644, 'u+z')).toThrow('"u+z" is not a valid symbolic mode');
    expect(() => applySymbolic(0o644, 'x+u')).toThrow();
    expect(() => applySymbolic(0o644, 'u+x,')).toThrow('"" is not a valid symbolic mode');
  });
  it('umaskDefaults: 022 -> 644/755, 077 -> 600/700, 002 -> 664/775, 0 -> 666/777', () => {
    expect(umaskDefaults(0o022)).toEqual({ file: 0o644, dir: 0o755 });
    expect(umaskDefaults(0o077)).toEqual({ file: 0o600, dir: 0o700 });
    expect(umaskDefaults(0o002)).toEqual({ file: 0o664, dir: 0o775 });
    expect(umaskDefaults(0)).toEqual({ file: 0o666, dir: 0o777 });
  });
  it('describeMode and modeWarnings', () => {
    expect(describeMode(0)).toEqual(['Owner: no access', 'Group: no access', 'Others: no access']);
    expect(describeMode(0o7755).slice(3).map((s) => s.split(':')[0])).toEqual(['Setuid', 'Setgid', 'Sticky']);
    const w = (m: number, dir = false) => modeWarnings(m, dir).join(' | ');
    expect(w(0o644)).toBe('');
    expect(w(0o777)).toContain('World-writable: any user');
    expect(w(0o1777, true)).toContain('like /tmp');
    expect(w(0o4644)).toContain('Setuid without owner execute');
    expect(w(0o2644)).toContain('Setgid without group execute');
    expect(w(0o2644, true)).not.toContain('Setgid without group execute');
    expect(w(0o4777)).toContain('Setuid together with group or world write');
    expect(w(0o1644)).toContain('sticky bit on a regular file');
    expect(w(0o644, true)).toContain('read but no execute');
    expect(w(0o044)).toContain('The owner cannot read this.');
  });
  it('convertChmod accepts octal, ls -l text and chmod expressions', () => {
    expect(convertChmod('0o4755')).toMatchObject({ octal: '4755', symbolic: 'rwsr-xr-x', ls: '-rwsr-xr-x', command: 'chmod 4755 file' });
    expect(convertChmod('drwxr-x---@', { isDir: true, path: ' /srv/app ' })).toMatchObject({ octal: '750', ls: 'drwxr-x---', command: 'chmod 750 /srv/app' });
    expect(convertChmod('u+x').octal).toBe('744');
    expect(convertChmod('g+w', { isDir: true }).octal).toBe('775');
    expect(convertChmod('+w', { start: '444', umask: '077' }).octal).toBe('644');
    expect(() => convertChmod('17777')).toThrow(/not a valid symbolic mode/);
    expect(() => convertChmod('rwx')).toThrow(/not a valid symbolic mode/);
    expect(() => convertChmod('u+x', { start: '9' })).toThrow('Enter 1 to 4 octal digits');
  });
  it('toSymbolicArg round-trips through applySymbolic', () => {
    expect(toSymbolicArg(0o4755)).toBe('u=rwxs,g=rx,o=rx');
    expect(toSymbolicArg(0o1777)).toBe('u=rwx,g=rwx,o=rwxt');
    expect(toSymbolicArg(0o4644)).toBe('u=rws,g=r,o=r');
    expect(toSymbolicArg(0)).toBe('u=,g=,o=');
    for (const m of [0, 0o644, 0o755, 0o1777, 0o2750, 0o4711, 0o6000]) expect(applySymbolic(0o7777, toSymbolicArg(m)), m.toString(8)).toBe(m);
  });
});

// ---------------------------------------------------------------------------
// User-Agent
// ---------------------------------------------------------------------------
describe('parseUserAgent / detectBot / uaReport', () => {
  it('positive: iPad Safari is a tablet; a smart TV is a smarttv', () => {
    const ipad = parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
    expect(ipad.device.type).toBe('tablet');
    expect(ipad.notes.join(' ')).toContain('iPadOS Safari');
    const tv = parseUserAgent('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1');
    expect(tv.device.type).toBe('smarttv');
  });
  it('bots: library bots get no "anyone can send this" note; crawlers do; the cubot phone is not a bot', () => {
    expect(parseUserAgent('python-requests/2.32.3').notes.join(' ')).not.toContain('Anyone can send this');
    expect(parseUserAgent('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)').notes.join(' ')).toContain('search.msn.com');
    expect(parseUserAgent('Mozilla/5.0 (compatible; ClaudeBot/1.0)').notes.join(' ')).toContain('publishes its IP ranges');
    expect(detectBot('Mozilla/5.0 (Linux; Android 9; CUBOT X19) AppleWebKit/537.36')).toBeNull();
    expect(detectBot('MyCrawler/1.0')?.name).toBe('Unidentified bot');
    expect(detectBot('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0')?.category).toBe('headless');
    expect(detectBot('Googlebot-Image/1.0')?.name).toBe('Googlebot-Image');
    expect(detectBot('')).toBeNull();
  });
  it('edge: an empty or whitespace UA', () => {
    const p = parseUserAgent('   ');
    expect(p.ua).toBe('');
    expect(p.bot).toBeNull();
    expect(p.device.type).toBe('unknown');
    expect(p.summary).toBe('Unknown client');
    expect(p.notes).toEqual(['Empty User-Agent. Many WAFs block requests without one.']);
  });
  it('uaReport lists only known rows and appends notes', () => {
    const chrome = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    const text = uaReport(chrome);
    expect(text.split('\n').slice(0, 7)).toEqual([
      'Summary: Chrome 130 on Windows 10 or 11 · desktop',
      'Browser: Chrome 130.0.0.0',
      'Engine: Blink 130.0.0.0',
      'OS: Windows 10 or 11',
      'Device: desktop',
      'CPU: amd64',
      'Bot: No',
    ]);
    expect(text).toContain('Note: Windows 11 still sends "Windows NT 10.0"');
    const curl = uaReport(parseUserAgent('curl/8.4.0'));
    expect(curl).toBe('Summary: curl (library bot, curl project)\nDevice: bot\nBot: curl (library, curl project)');
    expect(uaReport(parseUserAgent(''))).toBe('Summary: Unknown client\nDevice: unknown\nBot: No\nNote: Empty User-Agent. Many WAFs block requests without one.');
  });
});

// ---------------------------------------------------------------------------
// .gitignore
// ---------------------------------------------------------------------------
describe('gitignore templates and builder', () => {
  it('getTemplate / findTemplates', () => {
    expect(getTemplate('node')?.name).toBeTruthy();
    expect(getTemplate('nope')).toBeUndefined();
    expect(findTemplates('   ')).toBe(GITIGNORE_TEMPLATES);
    expect(findTemplates('DS_STORE').map((t) => t.id)).toEqual(['macos']);
    expect(findTemplates('zzzz-no-match')).toEqual([]);
  });
  it('buildGitignore: unknown ids, case-insensitive names, dedupe across templates, custom block, no header', () => {
    const r = buildGitignore(['macOS', 'linux', ' Vim ', 'nope', 'linux'], 'secret.txt\r\n\r\n  \n*.bak  ', { header: false });
    expect(r.unknown).toEqual(['nope']);
    // "*~" appears in Linux and again in Vim: the Vim copy is dropped.
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.content.startsWith('### macOS ###')).toBe(true);
    expect(r.content.match(/^\*~$/gm)?.length).toBe(1);
    expect(r.content.endsWith('### Custom ###\nsecret.txt\n*.bak\n')).toBe(true);
    expect(buildGitignore([]).content).toBe('# Generated with the RedBison .gitignore Generator (templates based on github/gitignore, CC0)\n');
  });
  it('a comment header disappears with its block when every pattern in it is a duplicate', () => {
    const r = buildGitignore(['linux', 'vim', 'emacs'], '', { header: false });
    // Emacs starts with "*~", already in Linux; the rest of the Emacs block stays.
    const emacs = r.content.split('### Emacs ###\n')[1];
    expect(emacs.startsWith('\\#*\\#')).toBe(true);
  });
});

describe('checkIgnored follows gitignore(5)', () => {
  const ig = (content: string, path: string) => checkIgnored(content, path).ignored;
  it('anchoring: a slash at the start or middle anchors; a trailing slash means directories only', () => {
    expect(ig('doc/frotz/', 'doc/frotz/')).toBe(true);
    expect(ig('doc/frotz/', 'a/doc/frotz/')).toBe(false);
    expect(ig('frotz/', 'a/frotz/x.txt')).toBe(true);
    expect(ig('frotz/', 'frotz')).toBe(false); // a file named frotz is not matched by "frotz/"
    expect(ig('/root.txt', 'root.txt')).toBe(true);
    expect(ig('/root.txt', 'sub/root.txt')).toBe(false);
  });
  it('foo/* matches foo/test.json and foo/bar; foo/bar/hello.c is excluded because its parent is', () => {
    expect(ig('foo/*', 'foo/test.json')).toBe(true);
    expect(checkIgnored('foo/*', 'foo/bar/hello.c')).toEqual({ ignored: true, rule: { pattern: 'foo/*', line: 1, negate: false }, via: 'foo/bar/' });
  });
  it('** forms from gitignore(5)', () => {
    expect(ig('**/foo', 'a/b/foo')).toBe(true);
    expect(ig('**/foo/bar', 'x/foo/bar')).toBe(true);
    expect(ig('abc/**', 'abc/x/y')).toBe(true);
    expect(ig('abc/**', 'abc')).toBe(false);
    expect(ig('a/**/b', 'a/b')).toBe(true);
    expect(ig('a/**/b', 'a/x/y/b')).toBe(true);
    expect(ig('a/**/b', 'a/xb')).toBe(false);
    expect(ig('***.txt', 'x.txt')).toBe(true);
  });
  it('negation re-includes a file, but not one inside an excluded directory', () => {
    expect(checkIgnored('*.log\n!important.log', 'logs/important.log')).toEqual({ ignored: false, rule: { pattern: '!important.log', line: 2, negate: true } });
    expect(checkIgnored('build/\n!build/keep.txt', 'build/keep.txt')).toMatchObject({ ignored: true, via: 'build/' });
  });
  it('wildcards, classes, escapes and trailing spaces', () => {
    expect(ig('?.txt', 'a.txt')).toBe(true);
    expect(ig('?.txt', 'ab.txt')).toBe(false);
    expect(ig('[!a]bc', 'xbc')).toBe(true);
    expect(ig('[!a]bc', 'abc')).toBe(false);
    expect(ig('[a-c]*.md', 'b-notes.md')).toBe(true);
    expect(ig('[abc', '[abc')).toBe(true); // an unterminated class is a literal "["
    expect(ig('\\#notes', '#notes')).toBe(true);
    expect(ig('\\!bang', '!bang')).toBe(true);
    expect(ig('a+b(c).txt', 'a+b(c).txt')).toBe(true);
    expect(ig('trail   ', 'trail')).toBe(true);
    // An escaped trailing space is kept (checkIgnored trims the typed path, so test the compiled rule).
    const [rule] = compileGitignore('space\\ ');
    expect(rule.re.test('space ')).toBe(true);
    expect(rule.re.test('space')).toBe(false);
  });
  it('corner: CRLF files, Windows paths, ./ and / prefixes, comments and an empty path', () => {
    expect(ig('# comment\r\n*.tmp\r\n', '.\\sub\\x.tmp')).toBe(true);
    expect(ig('*.tmp', '/x.tmp')).toBe(true);
    expect(ig('*.tmp', '   ')).toBe(false);
    expect(checkIgnored('', 'x')).toEqual({ ignored: false });
    expect(compileGitignore('# only\n\n').length).toBe(0);
  });
});
