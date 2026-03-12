import { CheerioCrawler, ProxyConfiguration, RequestQueue } from 'crawlee';
import { gotScraping } from 'got-scraping';

// Windows local dev can set Lambda-like env vars, which triggers
// Crawlee's Linux-specific memory probe (cat /proc/meminfo).
if (process.platform === 'win32') {
  process.env.CRAWLEE_SYSTEM_INFO_V2 = '0';
}

// Serverless filesystems (e.g. Vercel) cannot write inside the deployment bundle.
// Force Crawlee storage to a writable temp directory.
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  process.env.CRAWLEE_STORAGE_DIR = process.env.CRAWLEE_STORAGE_DIR || '/tmp/crawlee_storage';
  // Vercel runtime does not provide `ps`, which Crawlee uses for memory snapshots
  // unless it detects a Lambda-like environment.
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '1024';
}
process.env.CRAWLEE_LOG_LEVEL = process.env.CRAWLEE_LOG_LEVEL || 'WARNING';

const SOCIAL_PATTERNS = {
  linkedin: /linkedin\.com\/(company|in|school)\//i,
  facebook: /facebook\.com\//i,
  instagram: /instagram\.com\//i,
  twitter: /(twitter\.com|x\.com)\//i,
  tiktok: /tiktok\.com\//i,
  youtube: /(youtube\.com|youtu\.be)\//i,
  pinterest: /pinterest\./i,
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
const PHONE_RE = /(?:\+?\d[\d()\s.-]{6,}\d)/g;
const PHONE_CONTEXT_RE = /(phone|mobile|mob|call|whatsapp|wa\.me|tel|contact|hotline|support|help\s*line|customer\s*care|যোগাযোগ|মোবাইল|ফোন)/i;
const CONTACT_HINTS = [/contact/i, /contact-us/i, /get-in-touch/i, /support/i, /nous-contacter/i, /contacto/i, /impressum/i];
const EMAIL_FIELD_RE = /(email|e-mail|mail)/i;
const BLOCKED_EMAIL_DOMAINS = [
  'sentry.io',
  'sentry.wixpress.com',
  'sentry-next.wixpress.com',
  'wixpress.com',
];
const BLOCKED_EMAIL_LOCAL_PARTS = [
  'example',
  'johndoe',
  'janedoe',
  'test',
  'noreply',
  'no-reply',
  'yourname',
  'username',
];

function normalizeUrl(url) {
  let value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function normalizeEmail(rawEmail) {
  return String(rawEmail || '')
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^[<(\\[{"'\s]+/, '')
    .replace(/[>)}\]"',;:!?.\s]+$/, '')
    .toLowerCase();
}

function isLikelyBusinessEmail(email) {
  const value = normalizeEmail(email);
  if (!value || !value.includes('@') || (value.match(/@/g) || []).length !== 1) return false;
  const [local, domain] = value.split('@');
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  if (local.startsWith('.') || local.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) return false;
  if (value.includes('..')) return false;

  if (BLOCKED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return false;
  }

  if (BLOCKED_EMAIL_LOCAL_PARTS.includes(local)) return false;
  if (local.endsWith('.invalid')) return false;
  if (!/^[a-z0-9._%+-]+$/i.test(local)) return false;
  if (!/^[a-z0-9.-]+$/i.test(domain)) return false;
  if (!/^[a-z]{2,24}$/i.test(domain.split('.').pop() || '')) return false;
  // Common Sentry/project-key pattern.
  if (/^[a-f0-9]{24,}$/i.test(local)) return false;
  if (/^(image|img|logo|icon|banner|photo|avatar)[-_]?\d*$/i.test(local)) return false;
  // Junk / impossible business emails.
  if (local.length < 2 || local.length > 64) return false;
  if (domain.length < 4 || domain.length > 190) return false;

  return true;
}

function collectEmailsFromJson(value, bucket = []) {
  if (!value) return bucket;
  if (typeof value === 'string') {
    if (value.includes('@')) bucket.push(value);
    return bucket;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEmailsFromJson(item, bucket);
    return bucket;
  }
  if (typeof value === 'object') {
    if (typeof value.email === 'string') bucket.push(value.email);
    if (Array.isArray(value.email)) {
      for (const email of value.email) {
        if (typeof email === 'string') bucket.push(email);
      }
    }
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === 'string' && EMAIL_FIELD_RE.test(key) && nested.includes('@')) {
        bucket.push(nested);
      } else if (nested && typeof nested === 'object') {
        collectEmailsFromJson(nested, bucket);
      }
    }
  }
  return bucket;
}

function extractEmails(html, $) {
  const fromHtml = html.match(EMAIL_RE) || [];
  const fromMailto = [];
  const fromStructured = [];

  $('a[href^="mailto:"]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;
    const value = decodeURIComponent(href.replace(/^mailto:/i, '').split('?')[0] || '');
    if (value) fromMailto.push(value);
  });

  $('[itemprop="email"], [property*="email"], [name*="email"]').each((_, el) => {
    const value = ($(el).attr('content') || $(el).attr('href') || $(el).text() || '').trim();
    if (value) fromStructured.push(value);
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    const jsonText = ($(el).html() || '').trim();
    if (!jsonText) return;
    try {
      const parsed = JSON.parse(jsonText);
      fromStructured.push(...collectEmailsFromJson(parsed));
    } catch {
      // Ignore malformed JSON-LD blobs.
    }
  });

  return uniq([...fromHtml, ...fromMailto, ...fromStructured].map(normalizeEmail).filter(isLikelyBusinessEmail));
}

function isSameOrSubdomain(baseDomain, candidateUrl) {
  try {
    const hostname = new URL(candidateUrl).hostname.replace(/^www\./i, '');
    return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
  } catch {
    return false;
  }
}

function absolutize(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

async function listWebshareProxies(apiKey, page = 1, pageSize = 25) {
  const url = new URL('https://proxy.webshare.io/api/v2/proxy/list/');
  url.searchParams.set('mode', 'direct');
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(pageSize));

  const req = await fetch(url.href, {
    method: 'GET',
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!req.ok) {
    const text = await req.text();
    throw new Error(`Webshare API ${req.status}: ${text}`);
  }

  return req.json();
}

function proxyRecordToUrl(record) {
  if (!record || typeof record !== 'object') return '';

  const host = String(record.proxy_address || record.address || record.host || record.ip_address || '').trim();
  const port = String(
    record.port
    || record.http_port
    || record.ports?.http
    || record.ports?.http_port
    || ''
  ).trim();
  const username = String(record.username || record.user || '').trim();
  const password = String(record.password || record.pass || '').trim();

  if (!host || !port || !username || !password) return '';
  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

async function buildProxyUrls() {
  const direct = process.env.WEBSHARE_PROXY_URL?.trim();
  const list = process.env.WEBSHARE_PROXY_URLS?.trim();
  const host = process.env.WEBSHARE_PROXY_HOST?.trim();
  const port = process.env.WEBSHARE_PROXY_PORT?.trim();
  const username = process.env.WEBSHARE_PROXY_USERNAME?.trim();
  const password = process.env.WEBSHARE_PROXY_PASSWORD?.trim();
  const apiKey = process.env.WEBSHARE_API_KEY?.trim();
  const apiPageSize = Math.max(1, Math.min(Number(process.env.WEBSHARE_PROXY_PAGE_SIZE || 25), 100));

  let urls = [];
  if (list) urls = list.split(',').map(v => v.trim()).filter(Boolean);
  else if (direct) urls = [direct];
  else if (host && port && username && password) urls = [`http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`];
  else if (apiKey) {
    try {
      const data = await listWebshareProxies(apiKey, 1, apiPageSize);
      const records = Array.isArray(data?.results) ? data.results : [];
      urls = records.map(proxyRecordToUrl).filter(Boolean);
    } catch (err) {
      console.warn(`Failed to load proxies from Webshare API: ${err.message}`);
    }
  }

  return uniq(urls);
}

function createProxyRotator(proxyUrls) {
  let nextIndex = 0;
  const urls = Array.isArray(proxyUrls) ? proxyUrls.filter(Boolean) : [];

  return {
    next() {
      if (!urls.length) return { proxyUrl: '', index: -1 };
      const index = nextIndex % urls.length;
      nextIndex += 1;
      return { proxyUrl: urls[index], index };
    },
  };
}

function buildRotatedProxyPool(proxyUrls, startIndex) {
  if (!Array.isArray(proxyUrls) || !proxyUrls.length) return [];
  if (!Number.isInteger(startIndex) || startIndex < 0) return [...proxyUrls];
  return [
    ...proxyUrls.slice(startIndex),
    ...proxyUrls.slice(0, startIndex),
  ];
}

async function fetchStatus(url, timeoutMs, proxyUrl) {
  try {
    const response = await gotScraping({
      url,
      timeout: { request: timeoutMs },
      proxyUrl: proxyUrl || undefined,
      method: 'GET',
      followRedirect: true,
      retry: { limit: 0 },
      throwHttpErrors: false,
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    return { statusCode: response.statusCode, url: response.url || url };
  } catch {
    return { statusCode: 'error', url };
  }
}

async function fetchHomepageMeta(url, timeoutMs, proxyUrl) {
  try {
    const response = await gotScraping({
      url,
      timeout: { request: timeoutMs },
      proxyUrl: proxyUrl || undefined,
      method: 'GET',
      followRedirect: true,
      retry: { limit: 0 },
      throwHttpErrors: false,
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    return {
      redirectedUrl: response.url || url,
      statusCode: response.statusCode,
    };
  } catch {
    return {
      redirectedUrl: url,
      statusCode: 'error',
    };
  }
}

function normalizePhone(rawPhone, { minDigits = 7 } = {}) {
  const raw = String(rawPhone || '').trim();
  if (!raw) return '';

  let compact = raw
    .replace(/(?:ext\.?|extension|x)\s*\d+$/i, '')
    .replace(/[^\d+]/g, '');

  if (!compact) return '';
  compact = compact.replace(/(?!^)\+/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;

  const digitsOnly = compact.replace(/\D/g, '');
  if (digitsOnly.length < minDigits || digitsOnly.length > 15) return '';
  if (/^(\d)\1{6,}$/.test(digitsOnly)) return '';
  return compact.startsWith('+') ? `+${digitsOnly}` : digitsOnly;
}

function looksLikeFakePhoneDigits(digitsOnly) {
  if (!digitsOnly) return true;
  if (/^(?:0+|1+|2+|3+|4+|5+|6+|7+|8+|9+)$/.test(digitsOnly)) return true;
  if (['0123456789', '1234567890', '9876543210'].includes(digitsOnly)) return true;
  if (/^(12345|123456|1234567|12345678|123456789)/.test(digitsOnly)) return true;
  return false;
}

function looksLikeDateOrTimestampDigits(digitsOnly) {
  if (!digitsOnly) return true;
  if (/^(19|20)\d{8,12}$/.test(digitsOnly)) return true;
  if (/^1\d{12}$/.test(digitsOnly)) return true;
  return false;
}

function sanitizePhoneCandidate(rawPhone, source = 'html') {
  const normalized = normalizePhone(rawPhone, { minDigits: source === 'html' ? 10 : 8 });
  if (!normalized) return '';

  const digitsOnly = normalized.replace(/\D/g, '');
  const hasPlus = normalized.startsWith('+');

  if (digitsOnly.length < 8 || looksLikeFakePhoneDigits(digitsOnly) || looksLikeDateOrTimestampDigits(digitsOnly)) {
    return '';
  }

  if (!hasPlus && digitsOnly.length > 11) {
    return '';
  }

  if (source === 'html' && !hasPlus && ![10, 11].includes(digitsOnly.length)) {
    return '';
  }

  if (!hasPlus && digitsOnly.length === 11 && !digitsOnly.startsWith('1')) {
    return '';
  }

  if (source !== 'html' && !hasPlus && ![10, 11].includes(digitsOnly.length)) {
    return '';
  }

  return normalized;
}

function hasPhoneContext(html, index, length) {
  const start = Math.max(0, index - 60);
  const end = Math.min(html.length, index + length + 60);
  const window = html.slice(start, end);
  return PHONE_CONTEXT_RE.test(window);
}

function looksLikePhoneToken(raw) {
  if (!raw) return false;
  const chunks = raw.match(/\d+/g) || [];
  if (!chunks.length) return false;
  if (chunks.length > 5) return false;
  if (!chunks.some((chunk) => chunk.length >= 3)) return false;
  if ((raw.match(/\./g) || []).length > 2) return false;
  return true;
}

function collectTelephonesFromJson(value, bucket = []) {
  if (!value) return bucket;
  if (typeof value === 'string') return bucket;
  if (Array.isArray(value)) {
    for (const item of value) collectTelephonesFromJson(item, bucket);
    return bucket;
  }
  if (typeof value === 'object') {
    if (typeof value.telephone === 'string') bucket.push(value.telephone);
    if (Array.isArray(value.telephone)) {
      for (const tel of value.telephone) {
        if (typeof tel === 'string') bucket.push(tel);
      }
    }
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === 'object') collectTelephonesFromJson(nested, bucket);
    }
  }
  return bucket;
}

function extractPhones(html, $) {
  const fromHtml = [];
  const fromTel = [];
  const fromStructured = [];
  const pageText = String(($('body').text() || '').replace(/\s+/g, ' ').trim());
  const textMatches = pageText.matchAll(PHONE_RE);

  for (const match of textMatches) {
    const raw = match[0];
    const idx = match.index || 0;
    const hasSeparator = /[\s().-]/.test(raw);
    const hasPlus = raw.trim().startsWith('+');
    const contextual = hasPhoneContext(pageText, idx, raw.length);
    if (!looksLikePhoneToken(raw)) continue;
    if (hasPlus || (hasSeparator && contextual) || (contextual && raw.replace(/\D/g, '').length >= 10)) {
      fromHtml.push(raw);
    }
  }

  $('a[href^="tel:"]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;
    const value = decodeURIComponent(href.replace(/^tel:/i, '').split('?')[0] || '');
    if (value) fromTel.push(value);
  });

  $('a[href*="wa.me/"], a[href*="api.whatsapp.com"]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;
    const match = href.match(/(?:wa\.me\/|phone=)(\+?\d{7,15})/i);
    if (match?.[1]) fromTel.push(match[1]);
  });

  $('[itemprop="telephone"], [property*="telephone"], [name*="telephone"]').each((_, el) => {
    const value = ($(el).attr('content') || $(el).text() || '').trim();
    if (value) fromStructured.push(value);
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    const jsonText = ($(el).html() || '').trim();
    if (!jsonText) return;
    try {
      const parsed = JSON.parse(jsonText);
      fromStructured.push(...collectTelephonesFromJson(parsed));
    } catch {
      // Ignore malformed JSON-LD blobs.
    }
  });

  const normalizedHtml = fromHtml.map((value) => sanitizePhoneCandidate(value, 'html'));
  const normalizedTrusted = [...fromTel, ...fromStructured].map((value) => sanitizePhoneCandidate(value, 'trusted'));

  return uniq([...normalizedTrusted, ...normalizedHtml].filter(Boolean));
}

function buildOriginCandidates(baseDomain, finalUrl) {
  const origins = [];
  const add = (origin) => {
    if (!origin || origins.includes(origin)) return;
    origins.push(origin);
  };

  try {
    const u = new URL(finalUrl);
    add(`${u.protocol}//${u.host}`);
  } catch {}

  if (!baseDomain) return origins;
  add(`https://${baseDomain}`);
  add(`http://${baseDomain}`);

  const noWww = baseDomain.replace(/^www\./i, '');
  add(`https://www.${noWww}`);
  add(`http://www.${noWww}`);

  return origins;
}

async function resolveTextFileStatus({ path, baseDomain, finalUrl, timeoutMs, proxyUrl }) {
  const origins = buildOriginCandidates(baseDomain, finalUrl);
  let fallback = { statusCode: 'error', url: '' };

  for (const origin of origins) {
    const url = `${origin.replace(/\/+$/, '')}${path}`;
    const result = await fetchStatus(url, timeoutMs, proxyUrl);

    if (result.statusCode === 200) {
      try {
        const verify = await gotScraping({
          url,
          timeout: { request: timeoutMs },
          proxyUrl: proxyUrl || undefined,
          method: 'GET',
          followRedirect: true,
          retry: { limit: 0 },
          throwHttpErrors: false,
          responseType: 'text',
          headers: { 'user-agent': 'Mozilla/5.0', 'accept': 'text/plain,*/*;q=0.8' }
        });
        const body = String(verify.body || '');
        const contentType = String(verify.headers?.['content-type'] || '').toLowerCase();
        const looksLikeTextFile = contentType.includes('text/plain') || body.includes('google.com, pub-') || body.includes('app-ads.txt');
        if (looksLikeTextFile || body.length > 0) {
          return { statusCode: 200, url: verify.url || result.url };
        }
      } catch {
        return result;
      }
    }
    if (fallback.statusCode === 'error' && result.statusCode !== 'error') fallback = result;
  }

  return fallback;
}

async function hydrateAdsStatuses(found, timeoutMs, proxyUrlForFetch, baseDomain) {
  const ads = await resolveTextFileStatus({
    path: '/ads.txt',
    baseDomain: found.scrape_domain || baseDomain,
    finalUrl: found.redirected_homepage_url || found.scrape_final_url,
    timeoutMs,
    proxyUrl: proxyUrlForFetch,
  });
  const appAds = await resolveTextFileStatus({
    path: '/app-ads.txt',
    baseDomain: found.scrape_domain || baseDomain,
    finalUrl: found.redirected_homepage_url || found.scrape_final_url,
    timeoutMs,
    proxyUrl: proxyUrlForFetch,
  });

  found.ads_txt_url = ads.url || found.ads_txt_url;
  found.ads_txt_status = ads.statusCode;
  found.app_ads_txt_url = appAds.url || found.app_ads_txt_url;
  found.app_ads_txt_status = appAds.statusCode;
}

async function crawlSingleSite(inputUrl, options) {
  const {
    maxPagesPerSite, maxDepth, timeoutMs, maxRetries, respectRobots,
    proxyUrls, proxyRotator, contactFirst, skipSocial
  } = options;

  const baseDomain = getDomain(inputUrl);
  const { proxyUrl: siteProxyUrl, index: siteProxyIndex } = proxyRotator?.next?.() || { proxyUrl: '', index: -1 };
  const proxyUrlForFetch = siteProxyUrl || '';
  const rotatedProxyUrls = buildRotatedProxyPool(proxyUrls, siteProxyIndex);
  const proxyConfiguration = rotatedProxyUrls.length
    ? new ProxyConfiguration({ proxyUrls: rotatedProxyUrls })
    : undefined;

  const found = {
    scrape_input_url: inputUrl,
    scrape_final_url: inputUrl,
    redirected_homepage_url: inputUrl,
    homepage_status_code: '',
    scrape_domain: baseDomain,
    contact_page: '',
    ads_txt_url: `https://${baseDomain}/ads.txt`,
    ads_txt_status: '',
    app_ads_txt_url: `https://${baseDomain}/app-ads.txt`,
    app_ads_txt_status: '',
    linkedin_urls: '',
    facebook_urls: '',
    instagram_urls: '',
    twitter_urls: '',
    tiktok_urls: '',
    youtube_urls: '',
    pinterest_urls: '',
    emails_found: '',
    phones_found: '',
    pages_visited: 0,
    proxy_used: proxyUrls?.length ? 'yes' : 'no',
    scrape_status: 'ok'
  };

  const socials = {
    linkedin: [], facebook: [], instagram: [], twitter: [],
    tiktok: [], youtube: [], pinterest: [], emails: [], phones: []
  };

  const homepageMeta = await fetchHomepageMeta(inputUrl, timeoutMs, proxyUrlForFetch);
  const homepageUrl = homepageMeta.redirectedUrl || inputUrl;
  const homepageDomain = getDomain(homepageUrl) || baseDomain;

  found.redirected_homepage_url = homepageUrl;
  found.homepage_status_code = homepageMeta.statusCode;
  found.scrape_final_url = homepageUrl;
  found.scrape_domain = homepageDomain;
  found.ads_txt_url = `https://${homepageDomain}/ads.txt`;
  found.app_ads_txt_url = `https://${homepageDomain}/app-ads.txt`;

  const homepageCode = homepageMeta.statusCode;
  const homepageCodeNum = Number(homepageCode);
  const homepageUnavailable = homepageCode === 'error';
  const homepageBlocked = Number.isFinite(homepageCodeNum) && homepageCodeNum >= 400;
  if (homepageUnavailable || homepageBlocked) {
    found.scrape_status = homepageUnavailable
      ? 'homepage-unreachable: error'
      : `homepage-blocked: ${homepageCodeNum}`;
    await hydrateAdsStatuses(found, timeoutMs, proxyUrlForFetch, baseDomain);
    return found;
  }

  const queue = await RequestQueue.open(`queue-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  await queue.addRequest({ url: homepageUrl, userData: { depth: 0, priority: 1 } });

  const crawler = new CheerioCrawler({
    requestQueue: queue,
    proxyConfiguration,
    maxRequestsPerCrawl: maxPagesPerSite,
    maxRequestRetries: maxRetries,
    // Prevent long retry/session-rotation loops on blocked/unreachable sites.
    maxSessionRotations: Math.min(Math.max(maxRetries, 0), 2),
    retryOnBlocked: false,
    requestHandlerTimeoutSecs: Math.ceil(timeoutMs / 1000),
    additionalMimeTypes: ['text/html'],
    respectRobotsTxtFile: Boolean(respectRobots),
    async requestHandler({ request, $, enqueueLinks, body }) {
      found.pages_visited += 1;
      const depth = Number(request.userData?.depth || 0);
      if (depth === 0) {
        found.scrape_final_url = request.loadedUrl || request.url;
      }

      const html = typeof body === 'string' ? body : $.html();
      const emails = extractEmails(html, $);
      const phones = extractPhones(html, $);
      socials.emails.push(...emails);
      socials.phones.push(...phones);

      const nextLinks = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const text = ($(el).text() || '').trim();
        const abs = absolutize(request.loadedUrl || request.url, href);
        if (!abs) return;

        const isContact = CONTACT_HINTS.some(re => re.test(abs) || re.test(text));
        if (!found.contact_page && isContact && isSameOrSubdomain(baseDomain, abs)) {
          found.contact_page = abs.split('#')[0];
        }

        if (!skipSocial) {
          for (const [key, regex] of Object.entries(SOCIAL_PATTERNS)) {
            if (regex.test(abs)) socials[key].push(abs.split('?')[0]);
          }
        }

        if (isSameOrSubdomain(baseDomain, abs)) {
          nextLinks.push({ url: abs, isContact });
        }
      });

      if (depth < maxDepth) {
        const remainingBudget = Math.max(0, maxPagesPerSite - found.pages_visited);
        if (!remainingBudget) return;

        const prioritized = nextLinks.filter((l) => contactFirst && l.isContact);
        const normal = nextLinks.filter((l) => !(contactFirst && l.isContact));
        const selected = [...prioritized, ...normal].slice(0, remainingBudget);
        if (!selected.length) return;

        await enqueueLinks({
          urls: selected.map((l) => l.url),
          transformRequestFunction: (req) => {
            const isContact = selected.some((l) => l.url === req.url && l.isContact);
            req.userData = { depth: depth + 1, priority: isContact ? 2 : 1 };
            return req;
          },
        });
      }
    },
    failedRequestHandler({ request }) {
      found.scrape_status = `failed: ${request.url}`;
    },
  });

  try {
    await crawler.run();
  } catch (err) {
    found.scrape_status = `error: ${err.message}`;
  }

  if (found.pages_visited === 0 && found.scrape_status === 'ok') {
    found.scrape_status = `homepage-unreachable: ${found.homepage_status_code}`;
  }

  found.linkedin_urls = uniq(socials.linkedin).join(' | ');
  found.facebook_urls = uniq(socials.facebook).join(' | ');
  found.instagram_urls = uniq(socials.instagram).join(' | ');
  found.twitter_urls = uniq(socials.twitter).join(' | ');
  found.tiktok_urls = uniq(socials.tiktok).join(' | ');
  found.youtube_urls = uniq(socials.youtube).join(' | ');
  found.pinterest_urls = uniq(socials.pinterest).join(' | ');
  found.emails_found = uniq(socials.emails).join(' | ');
  found.phones_found = uniq(socials.phones).join(' | ');

  await hydrateAdsStatuses(found, timeoutMs, proxyUrlForFetch, baseDomain);

  return found;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function buildMergedRows(originalRows, detectedUrlColumn, resultMap) {
  return originalRows.map((row) => {
    const raw = row[detectedUrlColumn] || '';
    const normalized = normalizeUrl(raw);
    const result = resultMap.get(normalized) || resultMap.get(`https://${getDomain(raw)}`) || {};
    return { ...row, ...result };
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Use POST' }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const inputUrls = Array.isArray(body.urls) ? uniq(body.urls.map(normalizeUrl)).slice(0, 200) : [];
    const originalHeader = Array.isArray(body.originalHeader) ? body.originalHeader : [];
    const originalRows = Array.isArray(body.originalRows) ? body.originalRows : [];
    const detectedUrlColumn = body.detectedUrlColumn || '';
    const outputMode = body.outputMode || 'merge';
    const contactFirst = body.contactFirst !== false;
    const skipSocial = body.skipSocial === true;
    const maxPagesPerSite = Math.max(1, Math.min(Number(body.maxPagesPerSite || 5), 25));
    const maxDepth = Math.max(0, Math.min(Number(body.maxDepth || 1), 3));
    const timeoutMs = Math.max(2000, Math.min(Number(body.timeoutMs || 10000), 30000));
    const concurrency = Math.max(1, Math.min(Number(body.concurrency || 3), 10));
    const maxRetries = Math.max(0, Math.min(Number(body.maxRetries || 1), 5));
    const respectRobots = body.respectRobots !== false;
    const useProxy = body.useProxy !== false;
    if (!inputUrls.length) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'No urls provided' }),
      };
    }

    const proxyUrls = useProxy ? await buildProxyUrls() : [];
    const proxyRotator = createProxyRotator(proxyUrls);

    const flatResults = await mapWithConcurrency(
      inputUrls,
      concurrency,
      (url) => crawlSingleSite(url, {
        maxPagesPerSite, maxDepth, timeoutMs, maxRetries, respectRobots,
        proxyUrls, proxyRotator, contactFirst, skipSocial
      })
    );

    let rows = flatResults;
    let header = Object.keys(flatResults[0] || {});

    if (outputMode === 'merge' && originalRows.length && detectedUrlColumn) {
      const resultMap = new Map(flatResults.map(r => [normalizeUrl(r.scrape_input_url), r]));
      rows = buildMergedRows(originalRows, detectedUrlColumn, resultMap);
      const appended = [
        'scrape_input_url','scrape_final_url','redirected_homepage_url','homepage_status_code','scrape_domain','contact_page',
        'ads_txt_url','ads_txt_status','app_ads_txt_url','app_ads_txt_status',
        'linkedin_urls','facebook_urls','instagram_urls','twitter_urls',
        'tiktok_urls','youtube_urls','pinterest_urls','emails_found',
        'phones_found','pages_visited','proxy_used','scrape_status'
      ];
      header = [...originalHeader, ...appended.filter(v => !originalHeader.includes(v))];
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rows, header, proxyEnabled: proxyUrls.length > 0, proxyCount: proxyUrls.length
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Unexpected error' }),
    };
  }
}


