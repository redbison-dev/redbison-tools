/**
 * User-Agent parsing. Browser, engine, OS, device and CPU come from
 * ua-parser-js (v1, MIT). Bots, crawlers, AI fetchers and HTTP libraries are
 * detected with our own pattern list, because ua-parser-js v1 does not
 * classify them. Notes explain the User-Agent reduction that Chrome, Edge,
 * Safari and Firefox apply, which caps what any parser can learn.
 */
import UAParser from 'ua-parser-js';
import { msg } from '../../msg';

export type BotCategory = 'search' | 'ai' | 'social' | 'seo' | 'monitoring' | 'library' | 'headless' | 'other';

export type BotInfo = { name: string; category: BotCategory; owner: string; verifyHint?: string };

type BotRule = { re: RegExp } & BotInfo;

/** Order matters: the first match wins, so specific rules come before generic ones. */
const BOT_RULES: BotRule[] = [
  { re: /Googlebot-Image/i, name: 'Googlebot-Image', category: 'search', owner: 'Google', verifyHint: msg('Reverse DNS should end in googlebot.com or google.com.') },
  { re: /Googlebot-Video/i, name: 'Googlebot-Video', category: 'search', owner: 'Google', verifyHint: msg('Reverse DNS should end in googlebot.com or google.com.') },
  { re: /Googlebot/i, name: 'Googlebot', category: 'search', owner: 'Google', verifyHint: msg('Reverse DNS should end in googlebot.com or google.com, and forward DNS must match the IP.') },
  { re: /Storebot-Google/i, name: 'Storebot-Google', category: 'search', owner: 'Google' },
  { re: /Google-InspectionTool/i, name: 'Google-InspectionTool', category: 'search', owner: 'Google' },
  { re: /GoogleOther/i, name: 'GoogleOther', category: 'search', owner: 'Google' },
  { re: /AdsBot-Google/i, name: 'AdsBot-Google', category: 'search', owner: 'Google' },
  { re: /Mediapartners-Google/i, name: 'Mediapartners-Google (AdSense)', category: 'search', owner: 'Google' },
  { re: /APIs-Google/i, name: 'APIs-Google', category: 'other', owner: 'Google' },
  { re: /Google-Extended/i, name: 'Google-Extended', category: 'ai', owner: 'Google' },
  { re: /bingbot/i, name: 'Bingbot', category: 'search', owner: 'Microsoft', verifyHint: msg('Reverse DNS should end in search.msn.com.') },
  { re: /BingPreview/i, name: 'BingPreview', category: 'search', owner: 'Microsoft' },
  { re: /AdIdxBot/i, name: 'AdIdxBot', category: 'search', owner: 'Microsoft' },
  { re: /DuckDuckBot/i, name: 'DuckDuckBot', category: 'search', owner: 'DuckDuckGo' },
  { re: /YandexBot|YandexImages|YandexMobileBot/i, name: 'YandexBot', category: 'search', owner: 'Yandex' },
  { re: /Baiduspider/i, name: 'Baiduspider', category: 'search', owner: 'Baidu' },
  { re: /Applebot-Extended/i, name: 'Applebot-Extended', category: 'ai', owner: 'Apple' },
  { re: /Applebot/i, name: 'Applebot', category: 'search', owner: 'Apple' },
  { re: /Slurp/i, name: 'Yahoo Slurp', category: 'search', owner: 'Yahoo' },
  { re: /SeznamBot/i, name: 'SeznamBot', category: 'search', owner: 'Seznam' },
  { re: /Sogou/i, name: 'Sogou spider', category: 'search', owner: 'Sogou' },
  { re: /PetalBot/i, name: 'PetalBot', category: 'search', owner: 'Huawei' },
  { re: /Qwantify|Qwantbot/i, name: 'Qwantbot', category: 'search', owner: 'Qwant' },
  { re: /GPTBot/i, name: 'GPTBot', category: 'ai', owner: 'OpenAI', verifyHint: msg('OpenAI publishes the IP ranges for its crawlers.') },
  { re: /OAI-SearchBot/i, name: 'OAI-SearchBot', category: 'ai', owner: 'OpenAI' },
  { re: /ChatGPT-User/i, name: 'ChatGPT-User', category: 'ai', owner: 'OpenAI' },
  { re: /ClaudeBot/i, name: 'ClaudeBot', category: 'ai', owner: 'Anthropic' },
  { re: /Claude-User/i, name: 'Claude-User', category: 'ai', owner: 'Anthropic' },
  { re: /Claude-SearchBot/i, name: 'Claude-SearchBot', category: 'ai', owner: 'Anthropic' },
  { re: /anthropic-ai/i, name: 'anthropic-ai', category: 'ai', owner: 'Anthropic' },
  { re: /PerplexityBot/i, name: 'PerplexityBot', category: 'ai', owner: 'Perplexity' },
  { re: /Perplexity-User/i, name: 'Perplexity-User', category: 'ai', owner: 'Perplexity' },
  { re: /CCBot/i, name: 'CCBot', category: 'ai', owner: 'Common Crawl' },
  { re: /Bytespider/i, name: 'Bytespider', category: 'ai', owner: 'ByteDance' },
  { re: /meta-externalagent/i, name: 'Meta-ExternalAgent', category: 'ai', owner: 'Meta' },
  { re: /Amazonbot/i, name: 'Amazonbot', category: 'ai', owner: 'Amazon' },
  { re: /cohere-ai/i, name: 'cohere-ai', category: 'ai', owner: 'Cohere' },
  { re: /facebookexternalhit|facebookcatalog/i, name: 'Facebook link preview', category: 'social', owner: 'Meta' },
  { re: /Twitterbot/i, name: 'Twitterbot', category: 'social', owner: 'X (Twitter)' },
  { re: /LinkedInBot/i, name: 'LinkedInBot', category: 'social', owner: 'LinkedIn' },
  { re: /Slackbot/i, name: 'Slackbot', category: 'social', owner: 'Slack' },
  { re: /Discordbot/i, name: 'Discordbot', category: 'social', owner: 'Discord' },
  { re: /TelegramBot/i, name: 'TelegramBot', category: 'social', owner: 'Telegram' },
  { re: /WhatsApp/i, name: 'WhatsApp link preview', category: 'social', owner: 'Meta' },
  { re: /Pinterestbot|Pinterest\//i, name: 'Pinterestbot', category: 'social', owner: 'Pinterest' },
  { re: /redditbot/i, name: 'redditbot', category: 'social', owner: 'Reddit' },
  { re: /Embedly/i, name: 'Embedly', category: 'social', owner: 'Embedly' },
  { re: /AhrefsBot|AhrefsSiteAudit/i, name: 'AhrefsBot', category: 'seo', owner: 'Ahrefs' },
  { re: /SemrushBot|SiteAuditBot/i, name: 'SemrushBot', category: 'seo', owner: 'Semrush' },
  { re: /MJ12bot/i, name: 'MJ12bot', category: 'seo', owner: 'Majestic' },
  { re: /DotBot/i, name: 'DotBot', category: 'seo', owner: 'Moz' },
  { re: /rogerbot/i, name: 'rogerbot', category: 'seo', owner: 'Moz' },
  { re: /Screaming Frog/i, name: 'Screaming Frog SEO Spider', category: 'seo', owner: 'Screaming Frog' },
  { re: /DataForSeoBot/i, name: 'DataForSeoBot', category: 'seo', owner: 'DataForSEO' },
  { re: /UptimeRobot/i, name: 'UptimeRobot', category: 'monitoring', owner: 'UptimeRobot' },
  { re: /Pingdom/i, name: 'Pingdom', category: 'monitoring', owner: 'SolarWinds' },
  { re: /StatusCake/i, name: 'StatusCake', category: 'monitoring', owner: 'StatusCake' },
  { re: /Datadog/i, name: 'Datadog Synthetics', category: 'monitoring', owner: 'Datadog' },
  { re: /Site24x7/i, name: 'Site24x7', category: 'monitoring', owner: 'Zoho' },
  { re: /Chrome-Lighthouse|Lighthouse/i, name: 'Lighthouse', category: 'monitoring', owner: 'Google' },
  { re: /HeadlessChrome/i, name: 'Headless Chrome', category: 'headless', owner: 'Puppeteer, Playwright or chrome --headless' },
  { re: /PhantomJS/i, name: 'PhantomJS', category: 'headless', owner: 'PhantomJS' },
  { re: /^curl\//i, name: 'curl', category: 'library', owner: 'curl project' },
  { re: /^Wget\//i, name: 'Wget', category: 'library', owner: 'GNU' },
  { re: /python-requests/i, name: 'Python Requests', category: 'library', owner: 'Python' },
  { re: /python-urllib|Python-urllib/i, name: 'Python urllib', category: 'library', owner: 'Python' },
  { re: /aiohttp/i, name: 'aiohttp', category: 'library', owner: 'Python' },
  { re: /python-httpx/i, name: 'HTTPX', category: 'library', owner: 'Python' },
  { re: /Scrapy/i, name: 'Scrapy', category: 'library', owner: 'Python' },
  { re: /Go-http-client/i, name: 'Go net/http', category: 'library', owner: 'Go' },
  { re: /okhttp/i, name: 'OkHttp', category: 'library', owner: 'Square' },
  { re: /Apache-HttpClient/i, name: 'Apache HttpClient', category: 'library', owner: 'Apache' },
  { re: /Java\/\d/i, name: 'Java HttpURLConnection', category: 'library', owner: 'Java' },
  { re: /axios\//i, name: 'axios', category: 'library', owner: 'Node.js' },
  { re: /node-fetch/i, name: 'node-fetch', category: 'library', owner: 'Node.js' },
  { re: /^node$|undici/i, name: 'Node.js fetch (undici)', category: 'library', owner: 'Node.js' },
  { re: /PostmanRuntime/i, name: 'Postman', category: 'library', owner: 'Postman' },
  { re: /insomnia/i, name: 'Insomnia', category: 'library', owner: 'Kong' },
  { re: /libwww-perl/i, name: 'libwww-perl', category: 'library', owner: 'Perl' },
  { re: /^Ruby|Faraday/i, name: 'Ruby HTTP client', category: 'library', owner: 'Ruby' },
  { re: /HTTPie/i, name: 'HTTPie', category: 'library', owner: 'HTTPie' },
  { re: /Dart\//i, name: 'Dart HTTP client', category: 'library', owner: 'Dart' },
  { re: /(?<!cu)bot\b|crawler|spider|fetcher|scraper/i, name: 'Unidentified bot', category: 'other', owner: 'Unknown' },
];

export function detectBot(ua: string): BotInfo | null {
  for (const r of BOT_RULES) {
    if (r.re.test(ua)) return { name: r.name, category: r.category, owner: r.owner, verifyHint: r.verifyHint };
  }
  return null;
}

export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'smarttv' | 'console' | 'wearable' | 'embedded' | 'xr' | 'bot' | 'unknown';

export type ParsedUA = {
  ua: string;
  browser: { name?: string; version?: string; major?: string };
  engine: { name?: string; version?: string };
  os: { name?: string; version?: string };
  device: { type: DeviceKind; vendor?: string; model?: string };
  cpu: { architecture?: string };
  bot: BotInfo | null;
  /** One-line human summary. */
  summary: string;
  /** Caveats about what the string can and cannot tell. */
  notes: string[];
  /** `notes` as interface text with {placeholders} (StepMsg shape), for pages to translate. */
  notesMsg: { text: string; vars: Record<string, string | number> }[];
};

/** The OS version shown for Windows NT 10.0, which covers Windows 10 and 11. */
export const WINDOWS_10_OR_11 = msg('10 or 11');

export function parseUserAgent(input: string): ParsedUA {
  const ua = input.trim();
  const r = new UAParser(ua).getResult();
  const bot = ua ? detectBot(ua) : null;
  const notesMsg: ParsedUA['notesMsg'] = [];
  const note = (text: string, vars: Record<string, string | number> = {}) => notesMsg.push({ text, vars });

  let type: DeviceKind;
  const rawType = r.device.type as string | undefined;
  if (bot) type = 'bot';
  else if (rawType && ['mobile', 'tablet', 'smarttv', 'console', 'wearable', 'embedded', 'xr'].includes(rawType)) type = rawType as DeviceKind;
  else if (r.os.name && /Windows|Mac OS|macOS|Linux|Ubuntu|Fedora|Debian|Chrom(e|ium) OS|FreeBSD|OpenBSD/i.test(r.os.name)) type = 'desktop';
  else type = 'unknown';

  let osVersion = r.os.version;
  if (r.os.name === 'Windows' && osVersion === '10') {
    osVersion = WINDOWS_10_OR_11;
    note(msg('Windows 11 still sends "Windows NT 10.0", so the User-Agent cannot tell Windows 10 from 11. Read the Sec-CH-UA-Platform-Version client hint (13.0.0 or higher means Windows 11).'));
  }
  if (r.os.name === 'Mac OS' && osVersion === '10.15.7') {
    note(msg('Safari, Chrome and Firefox freeze macOS at 10_15_7 in the User-Agent, so any modern Mac reports this version.'));
  }
  if (r.os.name === 'Android' && /;\s*K\)/.test(ua)) {
    note(msg('Chrome\'s reduced User-Agent replaces the Android device model with "K" and the version with the major number only. Use Sec-CH-UA-Model for the real model.'));
  }
  if (r.browser.version && /^\d+\.0\.0\.0$/.test(r.browser.version) && /Chrome|Edg|OPR/.test(ua)) {
    note(msg('Chromium browsers send only the major version (minor, build and patch are 0.0.0) since User-Agent reduction. Sec-CH-UA-Full-Version-List gives the full version.'));
  }
  if (r.device.model === 'iPad' || (r.os.name === 'Mac OS' && /Macintosh/.test(ua))) {
    note(msg('iPadOS Safari requests the desktop site by default and sends a Mac User-Agent, so an iPad can look like a Mac. Touch support in the page (navigator.maxTouchPoints) is the usual tie-breaker.'));
  }
  if (bot && bot.category !== 'library' && bot.category !== 'headless') {
    if (bot.verifyHint) note(msg('Anyone can send this string. To trust that it is really {name}, check the request IP: {hint}'), { name: bot.name, hint: bot.verifyHint });
    else note(msg('Anyone can send this string. To trust that it is really {name}, check the request IP: the operator publishes its IP ranges or a reverse-DNS domain.'), { name: bot.name });
  }
  if (!ua) note(msg('Empty User-Agent. Many WAFs block requests without one.'));

  const name = r.browser.name ? `${r.browser.name}${r.browser.major ? ' ' + r.browser.major : ''}` : bot ? bot.name : 'Unknown client';
  const os = r.os.name ? `${r.os.name === 'Mac OS' ? 'macOS' : r.os.name}${osVersion ? ' ' + osVersion : ''}` : '';
  const dev = r.device.vendor || r.device.model ? [r.device.vendor, r.device.model].filter(Boolean).join(' ') : '';
  const summary = [bot ? `${bot.name} (${bot.category} bot, ${bot.owner})` : name, os && `on ${os}`, dev && `(${dev})`, !bot && type !== 'unknown' && `· ${type}`]
    .filter(Boolean)
    .join(' ');

  const notes = notesMsg.map((n) => n.text.replace(/\{(\w+)\}/g, (_, k: string) => String(n.vars[k])));

  return {
    ua,
    browser: { name: r.browser.name, version: r.browser.version, major: r.browser.major },
    engine: { name: r.engine.name, version: r.engine.version },
    os: { name: r.os.name === 'Mac OS' ? 'macOS' : r.os.name, version: osVersion },
    device: { type, vendor: r.device.vendor, model: r.device.model },
    cpu: { architecture: r.cpu.architecture },
    bot,
    summary,
    notes,
    notesMsg,
  };
}

export const SAMPLE_USER_AGENTS: { label: string; ua: string }[] = [
  { label: msg('Chrome on Windows'), ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
  { label: msg('Safari on iPhone'), ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  { label: msg('Chrome on Android (reduced)'), ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  { label: msg('Samsung Galaxy S23 Ultra'), ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  { label: msg('Firefox on Linux'), ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0' },
  { label: msg('Edge on Windows'), ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' },
  { label: msg('Safari on Mac'), ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' },
  { label: msg('Googlebot smartphone'), ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.69 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { label: msg('GPTBot'), ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)' },
  { label: msg('curl'), ua: 'curl/8.4.0' },
];

/** Plain-text report used by the copy button and MCP. */
export function uaReport(p: ParsedUA): string {
  const rows: [string, string | undefined][] = [
    ['Summary', p.summary],
    ['Browser', p.browser.name && `${p.browser.name} ${p.browser.version ?? ''}`.trim()],
    ['Engine', p.engine.name && `${p.engine.name} ${p.engine.version ?? ''}`.trim()],
    ['OS', p.os.name && `${p.os.name} ${p.os.version ?? ''}`.trim()],
    ['Device', [p.device.type, p.device.vendor, p.device.model].filter(Boolean).join(', ')],
    ['CPU', p.cpu.architecture],
    ['Bot', p.bot ? `${p.bot.name} (${p.bot.category}, ${p.bot.owner})` : 'No'],
  ];
  return [...rows.filter((r) => r[1]).map((r) => `${r[0]}: ${r[1]}`), ...p.notes.map((n) => `Note: ${n}`)].join('\n');
}
