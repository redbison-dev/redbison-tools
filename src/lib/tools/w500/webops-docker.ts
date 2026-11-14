/**
 * docker run <-> Compose converter. Parses one or more `docker run` commands
 * (shell quoting, backslash line continuations, combined short flags) into a
 * Compose Specification file, and turns a compose.yaml back into docker run
 * commands. YAML is read and written with the `yaml` package.
 *
 * Flag names and Compose keys follow the Docker CLI reference for
 * `docker container run` and the Compose Specification (services,
 * volumes, networks). The obsolete top-level `version:` key is not emitted.
 */
import YAML from 'yaml';
import { msg } from '../../msg';

/** A warning as interface text with {placeholders} (StepMsg shape), so pages can translate it. */
export type WarningMsg = { text: string; vars: Record<string, string | number> };
const wm = (text: string, vars: WarningMsg['vars'] = {}): WarningMsg => ({ text, vars });
const fillWarning = (m: WarningMsg): string => m.text.replace(/\{(\w+)\}/g, (_, k: string) => String(m.vars[k] ?? `{${k}}`));

// ---------- Shell tokenizer ----------

/** Split a shell command line into words, honouring quotes, escapes and line continuations. */
export function shellSplit(input: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let cur = '';
  let inWord = false;
  let q: '"' | "'" | null = null;
  const s = input.replace(/\\\r?\n/g, ' ');
  const pushWord = () => {
    if (inWord) words.push(cur);
    cur = '';
    inWord = false;
  };
  const endCommand = () => {
    pushWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") q = null;
      else cur += c;
      continue;
    }
    if (q === '"') {
      if (c === '"') q = null;
      else if (c === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      inWord = true;
      continue;
    }
    if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
      inWord = true;
      continue;
    }
    if (c === '#' && !inWord) {
      while (i < s.length && s[i] !== '\n') i++;
      endCommand();
      continue;
    }
    if (c === '\n' || c === ';' || (c === '&' && s[i + 1] === '&')) {
      if (c === '&') i++;
      endCommand();
      continue;
    }
    if (/\s/.test(c)) {
      pushWord();
      continue;
    }
    cur += c;
    inWord = true;
  }
  if (q) throw new Error('Unclosed quote in the command.');
  endCommand();
  return commands;
}

/** Quote a word for a POSIX shell only when needed. */
export function shellQuote(w: string): string {
  if (w === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(w)) return w;
  return `'${w.replace(/'/g, `'\\''`)}'`;
}

// ---------- Flag table ----------

type FlagKind = 'bool' | 'value';
const FLAGS: Record<string, { kind: FlagKind; key: string }> = {};
const def = (names: string[], kind: FlagKind, key: string) => names.forEach((n) => (FLAGS[n] = { kind, key }));

def(['-d', '--detach'], 'bool', 'detach');
def(['-i', '--interactive'], 'bool', 'interactive');
def(['-t', '--tty'], 'bool', 'tty');
def(['--rm'], 'bool', 'rm');
def(['--privileged'], 'bool', 'privileged');
def(['--init'], 'bool', 'init');
def(['--read-only'], 'bool', 'read_only');
def(['-P', '--publish-all'], 'bool', 'publish_all');
def(['--no-healthcheck'], 'bool', 'no_healthcheck');
def(['--oom-kill-disable'], 'bool', 'oom_kill_disable');
def(['--name'], 'value', 'name');
def(['-p', '--publish'], 'value', 'ports');
def(['-v', '--volume'], 'value', 'volumes');
def(['--mount'], 'value', 'mount');
def(['-e', '--env'], 'value', 'environment');
def(['--env-file'], 'value', 'env_file');
def(['--restart'], 'value', 'restart');
def(['--network', '--net'], 'value', 'network');
def(['--network-alias', '--net-alias'], 'value', 'network_alias');
def(['-w', '--workdir'], 'value', 'working_dir');
def(['-u', '--user'], 'value', 'user');
def(['--entrypoint'], 'value', 'entrypoint');
def(['-h', '--hostname'], 'value', 'hostname');
def(['--domainname'], 'value', 'domainname');
def(['-l', '--label'], 'value', 'labels');
def(['--add-host'], 'value', 'extra_hosts');
def(['--dns'], 'value', 'dns');
def(['--dns-search'], 'value', 'dns_search');
def(['--dns-option', '--dns-opt'], 'value', 'dns_opt');
def(['--cap-add'], 'value', 'cap_add');
def(['--cap-drop'], 'value', 'cap_drop');
def(['--device'], 'value', 'devices');
def(['--gpus'], 'value', 'gpus');
def(['-m', '--memory'], 'value', 'mem_limit');
def(['--memory-reservation'], 'value', 'mem_reservation');
def(['--memory-swap'], 'value', 'memswap_limit');
def(['--cpus'], 'value', 'cpus');
def(['--cpu-shares', '-c'], 'value', 'cpu_shares');
def(['--cpuset-cpus'], 'value', 'cpuset');
def(['--shm-size'], 'value', 'shm_size');
def(['--tmpfs'], 'value', 'tmpfs');
def(['--ulimit'], 'value', 'ulimits');
def(['--log-driver'], 'value', 'log_driver');
def(['--log-opt'], 'value', 'log_opt');
def(['--health-cmd'], 'value', 'health_cmd');
def(['--health-interval'], 'value', 'health_interval');
def(['--health-timeout'], 'value', 'health_timeout');
def(['--health-retries'], 'value', 'health_retries');
def(['--health-start-period'], 'value', 'health_start_period');
def(['--platform'], 'value', 'platform');
def(['--pull'], 'value', 'pull_policy');
def(['--sysctl'], 'value', 'sysctls');
def(['--security-opt'], 'value', 'security_opt');
def(['--expose'], 'value', 'expose');
def(['--pid'], 'value', 'pid');
def(['--ipc'], 'value', 'ipc');
def(['--stop-signal'], 'value', 'stop_signal');
def(['--stop-timeout'], 'value', 'stop_timeout');
def(['--link'], 'value', 'links');
def(['--volumes-from'], 'value', 'volumes_from');
def(['--group-add'], 'value', 'group_add');
def(['--pids-limit'], 'value', 'pids_limit');
def(['--runtime'], 'value', 'runtime');
def(['--isolation'], 'value', 'isolation');
def(['--userns'], 'value', 'userns_mode');
def(['--cgroup-parent'], 'value', 'cgroup_parent');
def(['--mac-address'], 'value', 'mac_address');
def(['--ip'], 'value', 'ipv4_address');
def(['--ip6'], 'value', 'ipv6_address');
def(['--attach', '-a'], 'value', 'attach');
def(['--sig-proxy'], 'value', 'sig_proxy');

export type ConvertResult = { yaml: string; warnings: string[]; warningMsgs: WarningMsg[]; services: string[] };

type Svc = Record<string, unknown>;

const SIZE_KEYS = new Set(['mem_limit', 'mem_reservation', 'memswap_limit', 'shm_size']);

function serviceNameFromImage(image: string): string {
  const noTag = image.split('@')[0].replace(/:[^/]*$/, '');
  const last = noTag.split('/').pop() || 'app';
  return last.replace(/[^a-zA-Z0-9_.-]/g, '-').toLowerCase() || 'app';
}

function asNumberIfInt(v: string): string | number {
  return /^\d+$/.test(v) ? Number(v) : v;
}

/** A numeric flag value; docker itself rejects anything that is not a number. */
function numberFlag(flag: string, v: string): number {
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n)) throw new Error(`${flag} needs a number, got "${v}".`);
  return n;
}

/** Split "key=value"; --sysctl and --log-opt reject entries without "=". */
function keyValue(flag: string, e: string): [string, string] {
  const eq = e.indexOf('=');
  if (eq <= 0) throw new Error(`${flag} needs key=value, got "${e}".`);
  return [e.slice(0, eq), e.slice(eq + 1)];
}

/** "--mount type=bind,source=/a,target=/b,readonly" -> long volume syntax */
function mountToVolume(spec: string): Record<string, unknown> {
  const o: Record<string, string | boolean> = {};
  for (const part of spec.split(',')) {
    const [k, ...rest] = part.split('=');
    const v = rest.join('=');
    o[k.trim()] = rest.length ? v : true;
  }
  const out: Record<string, unknown> = { type: (o.type as string) || 'volume' };
  const src = (o.source ?? o.src) as string | undefined;
  const dst = (o.target ?? o.destination ?? o.dst) as string | undefined;
  if (src) out.source = src;
  if (dst) out.target = dst;
  if (o.readonly === true || o.readonly === 'true' || o.ro === true || o.ro === 'true') out.read_only = true;
  if (o['bind-propagation']) out.bind = { propagation: o['bind-propagation'] };
  if (o['volume-nocopy']) out.volume = { nocopy: true };
  if (o['tmpfs-size']) out.tmpfs = { size: asNumberIfInt(String(o['tmpfs-size'])) };
  return out;
}

/** A -v source that is a name, not a path, is a named volume. */
function namedVolumeOf(spec: string): string | null {
  const src = spec.split(':')[0];
  if (!spec.includes(':')) return null; // anonymous volume
  if (src.startsWith('/') || src.startsWith('.') || src.startsWith('~') || src.startsWith('$') || /^[A-Za-z]:[\\/]/.test(spec)) return null;
  return src;
}

/** Parse one docker run command (already tokenized). */
function parseRun(words: string[], warnings: WarningMsg[], index: number): { name: string; svc: Svc; volumes: string[]; networks: string[] } {
  let i = 0;
  if (words[i] === 'sudo') i++;
  if (words[i] === 'docker' || words[i] === 'podman') i++;
  else throw new Error(`Command ${index + 1} does not start with "docker run".`);
  if (words[i] === 'container') i++;
  if (words[i] !== 'run' && words[i] !== 'create') throw new Error(`Command ${index + 1} is "docker ${words[i] ?? ''}", not "docker run".`);
  i++;
  const raw: Record<string, string[]> = {};
  const bools = new Set<string>();
  const add = (key: string, v: string) => (raw[key] = [...(raw[key] ?? []), v]);
  let image = '';
  for (; i < words.length; i++) {
    const w = words[i];
    if (w === '--') {
      // "--" ends the options; the next word is the image.
      image = words[++i] ?? '';
      i++;
      break;
    }
    if (!w.startsWith('-') || w === '-') {
      image = w;
      i++;
      break;
    }
    let flag = w;
    let val: string | undefined;
    if (w.startsWith('--') && w.includes('=')) {
      flag = w.slice(0, w.indexOf('='));
      val = w.slice(w.indexOf('=') + 1);
    }
    const known = FLAGS[flag];
    if (known) {
      if (known.kind === 'bool') {
        if (val === undefined || val === 'true') bools.add(known.key);
        continue;
      }
      if (val === undefined) val = words[++i];
      if (val === undefined) throw new Error(`${flag} needs a value.`);
      add(known.key, val);
      continue;
    }
    // Combined short flags: -it, -dit, -itd, or -p8080:80 / -eFOO=bar
    if (/^-[A-Za-z]{2,}$/.test(w) && [...w.slice(1)].every((c) => FLAGS['-' + c]?.kind === 'bool')) {
      for (const c of w.slice(1)) bools.add(FLAGS['-' + c].key);
      continue;
    }
    if (/^-[a-zA-Z]./.test(w) && FLAGS[w.slice(0, 2)]?.kind === 'value') {
      add(FLAGS[w.slice(0, 2)].key, w.slice(2));
      continue;
    }
    // Unknown option: guess that it takes a value when another word still follows for the image.
    if (val === undefined && words[i + 1] && !words[i + 1].startsWith('-') && i + 2 < words.length) {
      warnings.push(wm(msg('Unknown option {flag} {value} was skipped. Check that {image} is the image.'), { flag, value: words[i + 1], image: words[i + 2] }));
      i++;
    } else warnings.push(wm(msg('Unknown option {flag} was skipped.'), { flag }));
  }
  if (!image) throw new Error(`Command ${index + 1} has no image name.`);
  const args = words.slice(i);

  const svc: Svc = { image };
  const volumes: string[] = [];
  const networks: string[] = [];
  const name = raw.name?.[0] ?? serviceNameFromImage(image);
  if (raw.name) svc.container_name = raw.name[0];
  if (raw.entrypoint) svc.entrypoint = raw.entrypoint[0];
  if (args.length) svc.command = args;
  if (raw.restart) svc.restart = raw.restart[0];
  if (raw.ports) svc.ports = raw.ports;
  if (raw.expose) svc.expose = raw.expose.map((e) => String(e));
  if (raw.environment) {
    const env: Record<string, string | null> = {};
    for (const e of raw.environment) {
      const eq = e.indexOf('=');
      if (eq < 0) env[e] = null;
      else env[e.slice(0, eq)] = e.slice(eq + 1);
    }
    svc.environment = env;
  }
  if (raw.env_file) svc.env_file = raw.env_file;
  if (raw.volumes || raw.mount || raw.tmpfs) {
    const list: unknown[] = [];
    for (const v of raw.volumes ?? []) {
      list.push(v);
      const named = namedVolumeOf(v);
      if (named) volumes.push(named);
    }
    for (const m of raw.mount ?? []) {
      const lv = mountToVolume(m);
      if (lv.type === 'tmpfs') {
        list.push(lv);
        continue;
      }
      list.push(lv);
      if (lv.type === 'volume' && typeof lv.source === 'string') volumes.push(lv.source);
    }
    if (list.length) svc.volumes = list;
    if (raw.tmpfs) svc.tmpfs = raw.tmpfs;
  }
  if (raw.network) {
    const n = raw.network[0];
    if (['host', 'none', 'bridge'].includes(n) || n.startsWith('container:')) {
      svc.network_mode = n === 'bridge' ? 'bridge' : n.startsWith('container:') ? `container:${n.slice(10)}` : n;
      if (n.startsWith('container:')) warnings.push(wm(msg('network_mode: container:{container} uses a container name; in Compose you can write service:<name> instead.'), { container: n.slice(10) }));
    } else {
      networks.push(n);
      if (raw.network_alias || raw.ipv4_address || raw.ipv6_address) {
        const cfg: Record<string, unknown> = {};
        if (raw.network_alias) cfg.aliases = raw.network_alias;
        if (raw.ipv4_address) cfg.ipv4_address = raw.ipv4_address[0];
        if (raw.ipv6_address) cfg.ipv6_address = raw.ipv6_address[0];
        svc.networks = { [n]: cfg };
      } else svc.networks = [n];
    }
  }
  const copy: [string, string][] = [
    ['working_dir', 'working_dir'],
    ['user', 'user'],
    ['hostname', 'hostname'],
    ['domainname', 'domainname'],
    ['platform', 'platform'],
    ['pull_policy', 'pull_policy'],
    ['pid', 'pid'],
    ['ipc', 'ipc'],
    ['stop_signal', 'stop_signal'],
    ['runtime', 'runtime'],
    ['isolation', 'isolation'],
    ['userns_mode', 'userns_mode'],
    ['cgroup_parent', 'cgroup_parent'],
    ['mac_address', 'mac_address'],
    ['mem_limit', 'mem_limit'],
    ['mem_reservation', 'mem_reservation'],
    ['memswap_limit', 'memswap_limit'],
    ['shm_size', 'shm_size'],
    ['cpuset', 'cpuset'],
  ];
  for (const [from, to] of copy) if (raw[from]) svc[to] = SIZE_KEYS.has(to) ? asNumberIfInt(raw[from][0]) : raw[from][0];
  if (raw.pull_policy && raw.pull_policy[0] === 'missing') svc.pull_policy = 'missing';
  if (raw.cpus) svc.cpus = numberFlag('--cpus', raw.cpus[0]);
  if (raw.cpu_shares) svc.cpu_shares = numberFlag('--cpu-shares', raw.cpu_shares[0]);
  if (raw.pids_limit) svc.pids_limit = numberFlag('--pids-limit', raw.pids_limit[0]);
  if (raw.stop_timeout) svc.stop_grace_period = `${raw.stop_timeout[0]}s`;
  for (const k of ['cap_add', 'cap_drop', 'devices', 'dns', 'dns_search', 'dns_opt', 'security_opt', 'links', 'volumes_from', 'group_add', 'extra_hosts']) {
    if (raw[k]) svc[k] = raw[k];
  }
  if (raw.labels) {
    const l: Record<string, string> = {};
    for (const e of raw.labels) {
      const eq = e.indexOf('=');
      l[eq < 0 ? e : e.slice(0, eq)] = eq < 0 ? '' : e.slice(eq + 1);
    }
    svc.labels = l;
  }
  if (raw.sysctls) {
    const l: Record<string, string | number> = {};
    for (const e of raw.sysctls) {
      const [k, v] = keyValue('--sysctl', e);
      l[k] = asNumberIfInt(v);
    }
    svc.sysctls = l;
  }
  if (raw.ulimits) {
    const u: Record<string, unknown> = {};
    for (const e of raw.ulimits) {
      const [k, v] = e.split('=');
      const [soft, hard] = (v ?? '').split(':');
      u[k] = hard !== undefined ? { soft: asNumberIfInt(soft), hard: asNumberIfInt(hard) } : asNumberIfInt(soft);
    }
    svc.ulimits = u;
  }
  if (raw.log_driver || raw.log_opt) {
    const logging: Record<string, unknown> = {};
    if (raw.log_driver) logging.driver = raw.log_driver[0];
    if (raw.log_opt) {
      const o: Record<string, string> = {};
      for (const e of raw.log_opt) {
        const [k, v] = keyValue('--log-opt', e);
        o[k] = v;
      }
      logging.options = o;
    }
    svc.logging = logging;
  }
  if (bools.has('no_healthcheck')) svc.healthcheck = { disable: true };
  else if (raw.health_cmd || raw.health_interval || raw.health_timeout || raw.health_retries || raw.health_start_period) {
    const hc: Record<string, unknown> = {};
    if (raw.health_cmd) hc.test = ['CMD-SHELL', raw.health_cmd[0]];
    if (raw.health_interval) hc.interval = raw.health_interval[0];
    if (raw.health_timeout) hc.timeout = raw.health_timeout[0];
    if (raw.health_retries) hc.retries = numberFlag('--health-retries', raw.health_retries[0]);
    if (raw.health_start_period) hc.start_period = raw.health_start_period[0];
    svc.healthcheck = hc;
  }
  if (raw.gpus) {
    const g = raw.gpus[0];
    const dev: Record<string, unknown> = { driver: 'nvidia', capabilities: ['gpu'] };
    if (g === 'all') dev.count = 'all';
    else if (/^\d+$/.test(g)) dev.count = Number(g);
    else if (/device=/.test(g)) dev.device_ids = g.replace(/^"?device=/, '').replace(/"$/, '').split(',');
    svc.deploy = { resources: { reservations: { devices: [dev] } } };
  }
  if (bools.has('interactive')) svc.stdin_open = true;
  if (bools.has('tty')) svc.tty = true;
  if (bools.has('privileged')) svc.privileged = true;
  if (bools.has('init')) svc.init = true;
  if (bools.has('read_only')) svc.read_only = true;
  if (bools.has('oom_kill_disable')) svc.oom_kill_disable = true;
  if (bools.has('rm')) warnings.push(wm(msg('{name}: --rm has no Compose key. "docker compose down" removes the containers; "docker compose run --rm" exists for one-off runs.'), { name }));
  if (bools.has('publish_all')) warnings.push(wm(msg('{name}: -P (publish all exposed ports to random host ports) has no Compose equivalent. List the ports you need under ports.'), { name }));
  if (raw.attach || raw.sig_proxy) warnings.push(wm(msg('{name}: --attach and --sig-proxy only affect the CLI session and were dropped.'), { name }));
  return { name, svc, volumes, networks };
}

export function dockerRunToCompose(input: string): ConvertResult {
  const warnings: WarningMsg[] = [];
  const cmds = shellSplit(input).filter((c) => c.length);
  if (!cmds.length) throw new Error('Paste at least one docker run command.');
  const services: Record<string, Svc> = {};
  const vols = new Set<string>();
  const nets = new Set<string>();
  cmds.forEach((words, idx) => {
    const { name, svc, volumes, networks } = parseRun(words, warnings, idx);
    let n = name;
    let k = 2;
    while (services[n]) n = `${name}-${k++}`;
    services[n] = svc;
    volumes.forEach((v) => vols.add(v));
    networks.forEach((v) => nets.add(v));
  });
  const doc: Record<string, unknown> = { services };
  if (vols.size) doc.volumes = Object.fromEntries([...vols].map((v) => [v, {}]));
  if (nets.size) {
    doc.networks = Object.fromEntries([...nets].map((v) => [v, { external: true }]));
    warnings.push(wm(msg('Network {networks} is marked external because docker run expects it to exist already. Remove "external: true" to let Compose create it.'), { networks: [...nets].join(', ') }));
  }
  if (cmds.length > 1) warnings.push(wm(msg('Several services were created. Add depends_on if one must start before another.')));
  const yaml = YAML.stringify(doc, { lineWidth: 0, nullStr: '' }).replace(/: \n/g, ':\n').replace(/: \{\}\n/g, ':\n');
  return { yaml, warnings: warnings.map(fillWarning), warningMsgs: warnings, services: Object.keys(services) };
}

// ---------- Compose -> docker run ----------

const rawList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);

function envPairs(env: unknown): string[] {
  if (Array.isArray(env)) return env.map(String);
  if (env && typeof env === 'object') return Object.keys(env as Record<string, unknown>).map((k) => {
      const v = (env as Record<string, unknown>)[k];
      return v === null || v === undefined ? k : `${k}=${v}`;
    });
  return [];
}

function mapPairs(m: unknown, sep = '='): string[] {
  if (Array.isArray(m)) return m.map(String);
  if (m && typeof m === 'object') return Object.keys(m as Record<string, unknown>).map((k) => `${k}${sep}${(m as Record<string, unknown>)[k] ?? ''}`);
  return [];
}

export function composeToDockerRun(yamlText: string, opts: { project?: string } = {}): { commands: string[]; warnings: string[]; warningMsgs: WarningMsg[] } {
  const warnings: WarningMsg[] = [];
  let doc: unknown;
  try {
    doc = YAML.parse(yamlText);
  } catch (e) {
    throw new Error(`YAML error: ${(e as Error).message.split('\n')[0]}`);
  }
  const services = (doc as { services?: Record<string, Record<string, unknown>> })?.services;
  if (!services || typeof services !== 'object') throw new Error('No "services:" section found.');
  const topVolumes = ((doc as Record<string, unknown>).volumes ?? {}) as Record<string, unknown>;
  const topNets = ((doc as Record<string, unknown>).networks ?? {}) as Record<string, Record<string, unknown> | null>;
  const project = opts.project || 'myproject';
  const commands: string[] = [];
  const createdNets = new Set<string>();
  const prelude: string[] = [];
  for (const [name, s] of Object.entries(services)) {
    if (!s || typeof s !== 'object') continue;
    const a: string[] = ['docker', 'run', '-d'];
    a.push('--name', String(s.container_name ?? name));
    if (s.build && !s.image) {
      warnings.push(wm(msg('{name}: uses build:, so run "docker build -t {name} {context}" first.'), { name, context: typeof s.build === 'string' ? s.build : '.' }));
    }
    const flag = (f: string, v: unknown) => {
      if (v !== undefined && v !== null && v !== '') a.push(f, String(v));
    };
    if (s.restart) flag('--restart', s.restart);
    // Short ("8080:80") and long ({ target, published, host_ip, protocol }) port syntax, in file order.
    for (const p of rawList(s.ports)) {
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        a.push('-p', `${o.host_ip ? o.host_ip + ':' : ''}${o.published ? o.published + ':' : ''}${o.target}${o.protocol && o.protocol !== 'tcp' ? '/' + o.protocol : ''}`);
      } else if (p !== null && p !== '') a.push('-p', String(p));
    }
    for (const e of envPairs(s.environment)) a.push('-e', e);
    for (const f of rawList(s.env_file)) a.push('--env-file', f && typeof f === 'object' ? String((f as Record<string, unknown>).path) : String(f));
    if (Array.isArray(s.volumes)) {
      for (const v of s.volumes) {
        if (typeof v === 'string') {
          const src = v.split(':')[0];
          const isNamed = v.includes(':') && !/^[./~$]/.test(src) && !/^[A-Za-z]:[\\/]/.test(v);
          if (isNamed && topVolumes && src in topVolumes) {
            const cfg = topVolumes[src] as Record<string, unknown> | null;
            const real = cfg && cfg.name ? String(cfg.name) : cfg && cfg.external ? src : `${project}_${src}`;
            a.push('-v', real + v.slice(src.length));
          } else {
            if (/^\.\.?[\\/]/.test(v)) warnings.push(wm(msg('{name}: relative bind mount {source} needs Docker 23 or later in docker run; older versions need an absolute path (for example with "$(pwd)").'), { name, source: src }));
            a.push('-v', v);
          }
        } else if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          const parts = [`type=${o.type ?? 'volume'}`];
          if (o.source) parts.push(`source=${o.source}`);
          if (o.target) parts.push(`target=${o.target}`);
          if (o.read_only) parts.push('readonly');
          a.push('--mount', parts.join(','));
        }
      }
    }
    for (const t of asList(s.tmpfs)) a.push('--tmpfs', t);
    if (s.network_mode) {
      const nm = String(s.network_mode);
      if (nm.startsWith('service:')) {
        a.push('--network', `container:${nm.slice(8)}`);
      } else a.push('--network', nm);
    } else if (s.networks) {
      const list = Array.isArray(s.networks) ? (s.networks as string[]) : Object.keys(s.networks as object);
      list.forEach((n, k) => {
        const cfg = topNets[n];
        const real = cfg && cfg.name ? String(cfg.name) : cfg && cfg.external ? n : `${project}_${n}`;
        if (!(cfg && cfg.external) && !createdNets.has(real)) {
          createdNets.add(real);
          prelude.push(`docker network create ${shellQuote(real)}`);
        }
        if (k === 0) a.push('--network', real);
        else warnings.push(wm(msg('{name}: docker run joins one network at start; connect the rest with "docker network connect {network} {container}".'), { name, network: real, container: String(s.container_name ?? name) }));
        if (!Array.isArray(s.networks)) {
          const nc = (s.networks as Record<string, Record<string, unknown> | null>)[n];
          if (k === 0 && nc?.aliases) for (const al of asList(nc.aliases)) a.push('--network-alias', al);
          if (k === 0 && nc?.ipv4_address) a.push('--ip', String(nc.ipv4_address));
        }
      });
    } else {
      const real = `${project}_default`;
      if (!createdNets.has(real)) {
        createdNets.add(real);
        prelude.push(`docker network create ${real}`);
      }
      a.push('--network', real, '--network-alias', name);
    }
    flag('-w', s.working_dir);
    flag('-u', s.user);
    flag('-h', s.hostname);
    flag('--platform', s.platform);
    if (s.pull_policy) {
      const pp = s.pull_policy === 'if_not_present' ? 'missing' : String(s.pull_policy);
      if (['always', 'missing', 'never'].includes(pp)) a.push('--pull', pp);
      else warnings.push(wm(msg('{name}: pull_policy {policy} has no docker run --pull equivalent (always, missing, never).'), { name, policy: pp }));
    }
    flag('--pid', s.pid);
    flag('--ipc', s.ipc);
    flag('--stop-signal', s.stop_signal);
    flag('-m', s.mem_limit);
    flag('--memory-reservation', s.mem_reservation);
    flag('--memory-swap', s.memswap_limit);
    flag('--shm-size', s.shm_size);
    flag('--cpus', s.cpus);
    flag('--cpu-shares', s.cpu_shares);
    flag('--cpuset-cpus', s.cpuset);
    flag('--pids-limit', s.pids_limit);
    flag('--runtime', s.runtime);
    if (s.stop_grace_period) {
      const m = String(s.stop_grace_period).match(/^(\d+)s$/);
      if (m) a.push('--stop-timeout', m[1]);
      else warnings.push(wm(msg('{name}: stop_grace_period {period} must be given in whole seconds to --stop-timeout.'), { name, period: String(s.stop_grace_period) }));
    }
    for (const c of asList(s.cap_add)) a.push('--cap-add', c);
    for (const c of asList(s.cap_drop)) a.push('--cap-drop', c);
    for (const c of asList(s.devices)) a.push('--device', c);
    for (const c of asList(s.dns)) a.push('--dns', c);
    for (const c of asList(s.dns_search)) a.push('--dns-search', c);
    for (const c of asList(s.security_opt)) a.push('--security-opt', c);
    for (const c of asList(s.group_add)) a.push('--group-add', c);
    for (const c of asList(s.expose)) a.push('--expose', c);
    for (const c of asList(s.links)) a.push('--link', c);
    for (const c of mapPairs(s.extra_hosts, ':')) a.push('--add-host', c.replace(/=/, ':'));
    for (const c of mapPairs(s.labels)) a.push('-l', c);
    for (const c of mapPairs(s.sysctls)) a.push('--sysctl', c);
    if (s.ulimits && typeof s.ulimits === 'object') {
      for (const [k, v] of Object.entries(s.ulimits as Record<string, unknown>)) {
        if (v && typeof v === 'object') a.push('--ulimit', `${k}=${(v as Record<string, unknown>).soft}:${(v as Record<string, unknown>).hard}`);
        else a.push('--ulimit', `${k}=${v}`);
      }
    }
    const logging = s.logging as Record<string, unknown> | undefined;
    if (logging?.driver) a.push('--log-driver', String(logging.driver));
    for (const c of mapPairs(logging?.options)) a.push('--log-opt', c);
    const hc = s.healthcheck as Record<string, unknown> | undefined;
    if (hc?.disable) a.push('--no-healthcheck');
    else if (hc) {
      const test = hc.test;
      if (Array.isArray(test)) {
        if (test[0] === 'CMD-SHELL') a.push('--health-cmd', String(test[1]));
        else if (test[0] === 'CMD') a.push('--health-cmd', test.slice(1).map((x) => shellQuote(String(x))).join(' '));
        else if (test[0] === 'NONE') a.push('--no-healthcheck');
      } else if (typeof test === 'string') a.push('--health-cmd', test);
      flag('--health-interval', hc.interval);
      flag('--health-timeout', hc.timeout);
      flag('--health-retries', hc.retries);
      flag('--health-start-period', hc.start_period);
    }
    type Deploy = { resources?: { reservations?: { devices?: Record<string, unknown>[] } } };
    const devs = (s.deploy as Deploy | undefined)?.resources?.reservations?.devices ?? [];
    for (const d of devs) {
      if (asList(d.capabilities).includes('gpu')) {
        if (d.device_ids) a.push('--gpus', `"device=${asList(d.device_ids).join(',')}"`);
        else a.push('--gpus', d.count === undefined ? 'all' : String(d.count));
      }
    }
    if (s.stdin_open) a.push('-i');
    if (s.tty) a.push('-t');
    if (s.privileged) a.push('--privileged');
    if (s.init) a.push('--init');
    if (s.read_only) a.push('--read-only');
    if (s.depends_on) warnings.push(wm(msg('{name}: depends_on has no docker run flag; start the commands in order.'), { name }));
    if (s.profiles) warnings.push(wm(msg('{name}: profiles are a Compose feature and were ignored.'), { name }));
    if (s.entrypoint !== undefined) {
      const ep = s.entrypoint;
      if (Array.isArray(ep)) {
        a.push('--entrypoint', String(ep[0]));
        if (ep.length > 1) warnings.push(wm(msg('{name}: docker run --entrypoint takes one executable; the extra entrypoint arguments were moved before the command.'), { name }));
      } else a.push('--entrypoint', String(ep).split(/\s+/)[0]);
    }
    const image = String(s.image ?? name);
    a.push(image);
    if (Array.isArray(s.entrypoint) && s.entrypoint.length > 1) a.push(...s.entrypoint.slice(1).map(String));
    if (Array.isArray(s.command)) a.push(...s.command.map(String));
    else if (typeof s.command === 'string') a.push(...shellSplit(s.command)[0] ?? []);
    const words = a.map((w, k) => (k < 2 ? w : w.startsWith('"device=') ? `'${w}'` : shellQuote(w)));
    commands.push(formatCommand(words));
  }
  for (const v of Object.entries(topVolumes)) {
    const cfg = v[1] as Record<string, unknown> | null;
    if (!(cfg && cfg.external)) prelude.push(`docker volume create ${shellQuote(cfg && cfg.name ? String(cfg.name) : `${project}_${v[0]}`)}`);
  }
  return { commands: [...prelude, ...commands], warnings: warnings.map(fillWarning), warningMsgs: warnings };
}

/** Break a long command across lines with backslashes, keeping flag/value pairs together. */
export function formatCommand(words: string[]): string {
  const lines: string[] = [];
  let line = words.slice(0, 3).join(' ');
  for (let i = 3; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    const piece = w.startsWith('-') && next !== undefined && !next.startsWith('-') && FLAGS[w]?.kind !== 'bool' ? `${w} ${words[++i]}` : w;
    if (line.length + piece.length > 76) {
      lines.push(line + ' \\');
      line = '  ' + piece;
    } else line += ' ' + piece;
  }
  lines.push(line);
  return lines.join('\n');
}
