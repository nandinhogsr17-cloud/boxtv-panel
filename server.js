import { sealRecovery, openRecovery } from './src/recovery.js';
import { Snapshotter } from './src/snapshot.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, deviceStatus, macToCode, normCode } from './src/db.js';
import { CatalogStore } from './src/catalog.js';
import { pub } from './src/m3u.js';
import { createMsx } from './src/msx.js';
import { GamesService, matchChannels } from './src/games.js';
import { MetaService } from './src/meta.js';
import { EpgService } from './src/epg.js';
import {
  guardedFetch,
  checkPlaylist,
  PlaylistError,
  cleanPlaylistUrl,
  buildXtreamUrl,
  parseLoginInput,
  credentialsFromUrl,
  xtreamAccount,
  outputCandidates,
  XTREAM_OUTPUTS,
  REASON_TEXT,
  WARNING_TEXT,
} from './src/playlist.js';
import {
  safeGet,
  readLimited,
  readHead,
  sniffKind,
  kindFromUrl,
  rewritePlaylist,
  WebTokens,
  UpstreamError,
} from './src/proxy.js';
import {
  HttpError,
  normMac,
  normKey,
  safeEqual,
  Limiter,
  sendJson,
  readJson,
  parseBasic,
  isHttpUrl, isAdultGroup } from './src/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAY_MS = 24 * 3600 * 1000;

export function createApp(options = {}) {
  const env = process.env;
  const cfg = {
    port: Number(options.port ?? env.PORT ?? 8080),
    dataDir: options.dataDir ?? env.DATA_DIR ?? path.join(__dirname, 'data'),
    adminUser: options.adminUser ?? env.ADMIN_USER ?? 'admin',
    adminPassword: options.adminPassword ?? env.ADMIN_PASSWORD ?? '',
    // senha para trocar o servidor IPTV de todos os aparelhos (app, TV e site). Troque no Render com SERVER_EDIT_PASSWORD.
    serverEditPassword: options.serverEditPassword ?? env.SERVER_EDIT_PASSWORD ?? 'box54321',
    footballToken: options.footballToken ?? env.FOOTBALL_DATA_TOKEN ?? '',
    competitions: options.competitions ?? env.FOOTBALL_COMPETITIONS ?? '',
    tmdbKey: options.tmdbKey ?? env.TMDB_KEY ?? '',
    tz: options.tz ?? env.TZ_NAME ?? 'America/Sao_Paulo',
    ttlMin: Number(options.ttlMin ?? env.CATALOG_TTL_MIN ?? 360),
    trustProxy: (options.trustProxy ?? env.TRUST_PROXY) === '1' || options.trustProxy === true || (options.trustProxy === undefined && env.TRUST_PROXY === undefined && !!env.RENDER), // no Render liga sozinho
    autoRegister: (options.autoRegister ?? env.AUTO_REGISTER ?? '1') !== '0',
    // Site (navegador): proxy de vídeo/imagem
    webDir: options.webDir ?? env.WEB_DIR ?? path.join(__dirname, 'web'),
    webSecret: options.webSecret ?? env.WEB_SECRET ?? '',
    corsOrigin: options.corsOrigin ?? env.CORS_ORIGIN ?? '', // "*" ou lista separada por vírgula (só se o site ficar em outro domínio)
    allowPrivate: (options.allowPrivate ?? env.ALLOW_PRIVATE_STREAMS) === '1' || options.allowPrivate === true,
    streamUa: options.streamUa ?? env.STREAM_UA ?? 'VLC/3.0.20 LibVLC/3.0.20',
    // Ativação feita pelo próprio cliente (API legada; o app e o site não usam mais)
    selfActivate: (options.selfActivate ?? env.SELF_ACTIVATE ?? '1') !== '0' && options.selfActivate !== false,
    xtreamHost: options.xtreamHost ?? env.DEFAULT_XTREAM_HOST ?? 'http://trevorcdn.online:80', // servidor padrão BoxTv, editável pelo login/admin
    xtreamOutput: options.xtreamOutput ?? env.DEFAULT_XTREAM_OUTPUT ?? 'mpegts',
    activateMax: Number(options.activateMax ?? env.ACTIVATE_MAX ?? 15), // tentativas de ativação por IP a cada 10 min
    selfDays: Number(options.selfDays ?? env.SELF_DAYS ?? 0), // validade dada à ativação do cliente (0 = sem validade)
    extraUrl: options.extraUrl ?? env.EXTRA_M3U_URL ?? '',
    extraLabel: options.extraLabel ?? env.EXTRA_LABEL ?? 'Extras',
    snapshotUrl: options.snapshotUrl ?? env.SNAPSHOT_URL ?? '',
    snapshotToken: options.snapshotToken ?? env.SNAPSHOT_TOKEN ?? '',
    selfReplace: (options.selfReplace ?? env.SELF_REPLACE ?? '1') !== '0' && options.selfReplace !== false,
  };
  const fetchFn = options.fetchFn ?? fetch;

  let generatedPassword = false;
  if (!cfg.adminPassword) {
    cfg.adminPassword = crypto.randomBytes(24).toString('base64url');
    generatedPassword = true;
  }

  const store = new Store(cfg.dataDir);
  const snapshot = new Snapshotter({
    url: cfg.snapshotUrl,
    token: cfg.snapshotToken,
    secret: cfg.webSecret || store.credentialKey.toString('hex'),
    db: store.db,
    fetchFn: options.snapshotFetch ?? fetch,
    intervalMs: options.snapshotIntervalMs ?? 120000,
    log: (m) => console.log(m),
  });
  const catalogs = new CatalogStore({
    dir: path.join(cfg.dataDir, 'cache'),
    ttlMs: cfg.ttlMin * 60000,
    encryptionKey: store.credentialKey,
    extraUrl: cfg.extraUrl,
    extraLabel: cfg.extraLabel,
    // Listas ativadas por clientes são endereços digitados por qualquer pessoa: só internet pública.
    fetchFn: options.fetchFn ?? guardedFetch({ allowPrivate: cfg.allowPrivate }),
  });
  const gamesSvc = new GamesService({
    store,
    tz: cfg.tz,
    token: cfg.footballToken,
    competitions: cfg.competitions,
    fetchFn,
  });
  const metaSvc = new MetaService({ store, key: cfg.tmdbKey, fetchFn });
  const epgSvc = new EpgService({ store, fetchFn });

  // Chaves de API salvas no admin (tela "Integrações") valem mais que as variáveis de ambiente.
  const applyIntegrations = () => {
    const tok = store.getSetting('football_token');
    const comp = store.getSetting('football_competitions');
    const tmdb = store.getSetting('tmdb_key');
    gamesSvc.token = tok ?? cfg.footballToken;
    gamesSvc.competitions = comp ?? cfg.competitions;
    gamesSvc.cache.clear();
    gamesSvc.resultCache.clear();
    metaSvc.key = tmdb ?? cfg.tmdbKey;
  };
  applyIntegrations();
  const getM3uTemplate = () =>
    store.getSetting('m3u_template') ||
    process.env.M3U_TEMPLATE ||
    (xtreamHost() ? `${xtreamHost()}/get.php?username={user}&password={pass}&type=m3u_plus&output=${xtreamOutput()}` : '');

  const xtreamHost = () => {
    const saved = store.getSetting('xtream_host');
    const h = saved ?? cfg.xtreamHost ?? '';
    return String(h).trim().replace(/\/$/, '');
  };
  const xtreamOutput = () => store.getSetting('xtream_output') ?? cfg.xtreamOutput ?? 'ts';

  const mask = (v) => (v ? (v.length <= 8 ? '••••' : v.slice(0, 3) + '••••••' + v.slice(-3)) : '');

  const generalLimiter = new Limiter(600, 60000);
  const failLimiter = new Limiter(30, 60000);
  const regLimiter = new Limiter(60, 10 * 60000);
  const refreshLimiter = new Map();
  const proxyLimiter = new Limiter(9000, 60000);
  const activateLimiter = new Limiter(cfg.activateMax, 10 * 60000);
  const loginIpLimiter = new Limiter(20, 10 * 60000); // logins errados por IP (o MAC é escolhido pelo cliente, então só ele não basta)
  const authFailLimiter = new Limiter(10, 60 * 60000); // senhas erradas por aparelho (evita adivinhar logins pelo painel)
  let activating = 0; // verificações de lista em andamento (limita o custo de downloads simultâneos)
  const webTokens = new WebTokens(cfg.webSecret);
  // Segredo da chave de recuperação: WEB_SECRET (fixo no Render). Sem ele, usa a chave do banco.
  const recoverySecret = cfg.webSecret || store.credentialKey.toString('hex');
  const corsList = cfg.corsOrigin.split(',').map((x) => x.trim()).filter(Boolean);

  const adminHtmlPath = path.join(__dirname, 'admin', 'index.html');

  const clientIp = (req) => {
    if (cfg.trustProxy) {
      const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (xf) return xf;
    }
    return req.socket.remoteAddress || '?';
  };

  // ---------------------------------------------------------------- CORS e arquivos do site
  function corsHeaders(req) {
    if (!corsList.length) return {};
    const origin = req.headers.origin;
    let allow = null;
    if (corsList.includes('*')) allow = '*';
    else if (origin && corsList.includes(origin)) allow = origin;
    if (!allow) return {};
    return {
      'access-control-allow-origin': allow,
      vary: 'Origin',
      'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges',
    };
  }

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
  };
  const CSP =
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: blob:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; " +
    "frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    if (rel === '/') rel = '/index.html';
    if (rel.includes('\0') || rel.includes('..')) return false;
    const root = path.resolve(cfg.webDir);
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep)) return false;
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return false;
    }
    if (!st.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-store, no-cache, must-revalidate' : 'public, max-age=86400',
    };
    if (ext === '.html') headers['content-security-policy'] = CSP;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  }

  // ---------------------------------------------------------------- roteador
  const routes = [];
  const add = (method, pattern, fn, opts = {}) => {
    const keys = [];
    const re = new RegExp(
      '^' +
      pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '/?$'
    );
    routes.push({ method, re, keys, fn, ...opts });
  };
  const match = (method, pathname) => {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
    }
    return null;
  };

  // ---------------------------------------------------------------- autenticação
  async function deviceCtx(req, ip, allowInactive) {
    if (failLimiter.blocked(ip)) throw new HttpError(429, 'too_many_attempts');
    const rawMac = req.headers['x-mac'] || req.headers['x-code'];
    const mac = normMac(rawMac) || normCode(rawMac);
    const key = normKey(req.headers['x-key']);
    let d = mac && key ? store.getDevice(mac) : null;
    if (!d && mac && key && cfg.autoRegister) {
      d = store.createDevice({ mac, key });
    }
    if (!d || !d.device_key || !safeEqual(d.device_key, key)) {
      failLimiter.hit(ip);
      throw new HttpError(401, 'invalid_credentials');
    }
    const status = deviceStatus(d);
    if (status !== 'active' && !allowInactive) {
      throw new HttpError(403, 'device_not_active', { status, expiresAt: d.expires_at });
    }
    if (Date.now() - (d.last_seen || 0) > 60000) store.touchDevice(mac, ip);
    return { mac, device: d, status, getCatalog: (options) => catalogs.get(d.m3u_url, options) };
  }

  function adminAuth(ctx) {
    const { req, res, ip } = ctx;
    if (failLimiter.blocked(ip)) throw new HttpError(429, 'too_many_attempts');
    const cred = parseBasic(req.headers.authorization);
    const ok =
      cred &&
      safeEqual(cred.user, cfg.adminUser) &&
      safeEqual(cred.pass, cfg.adminPassword);
    if (!ok) {
      failLimiter.hit(ip);
      res.setHeader('www-authenticate', 'Basic realm="Painel IPTV", charset="UTF-8"');
      throw new HttpError(401, 'unauthorized');
    }
    // Proteção contra CSRF: o navegador reenvia o login Basic sozinho, então exigimos um cabeçalho
    // customizado em qualquer ação que altere dados (outro site não consegue enviá-lo).
    if (req.method !== 'GET' && req.headers['x-admin-csrf'] !== '1') {
      throw new HttpError(403, 'csrf');
    }
  }

  // ---------------------------------------------------------------- helpers de catálogo
  function hydrate(cat, mac, ids, limit = 100) {
    const out = [];
    for (const id of ids) {
      const it = cat.byId.get(id);
      if (it) out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  }

  function continueItems(mac, cat) {
    const rows = store.listProgress(mac, 80);
    const out = [];
    const seenSeries = new Set();
    for (const r of rows) {
      const it = cat.byId.get(r.item_id);
      if (!it) continue;
      const finished = r.duration_ms > 0 && r.position_ms / r.duration_ms > 0.95;
      if (it.type === 'episode') {
        if (seenSeries.has(it.seriesId)) continue;
        seenSeries.add(it.seriesId);
        const s = cat.byId.get(it.seriesId);
        const label = (ep) => `${s.title} · T${ep.season}E${ep.episode}`;
        if (finished) {
          // Terminou o episódio: sugere o próximo (como a Netflix).
          const next = cat.nextEpisode(it);
          if (next) out.push(pub(next, { title: label(next), logo: next.logo || s.logo || null }));
        } else if (r.position_ms >= 10000) {
          out.push(
            pub(it, {
              title: label(it),
              logo: it.logo || s.logo || null,
              positionMs: r.position_ms,
              durationMs: r.duration_ms,
            })
          );
        }
      } else if (it.type === 'movie') {
        if (finished || r.position_ms < 10000) continue;
        out.push(pub(it, { positionMs: r.position_ms, durationMs: r.duration_ms }));
      }
      if (out.length >= 20) break;
    }
    return out;
  }

  // Aceita itens do catálogo e itens já públicos (ex.: "continuar assistindo", que carrega a posição).
  function withFav(items, favIds) {
    return items.map((it) =>
      'positionMs' in it ? { ...it, favorite: favIds.has(it.id) } : pub(it, { favorite: favIds.has(it.id) })
    );
  }

  function mapGamesFor(cat, games) {
    const mapped = games.map((g) => ({
      id: g.id,
      date: g.date,
      time: g.time,
      competition: g.competition,
      home: g.home,
      away: g.away,
      homeCrest: g.homeCrest,
      awayCrest: g.awayCrest,
      status: g.status,
      statusDetail: g.statusDetail || null,
      isLive: !!g.isLive,
      score: g.score,
      channelHint: (g.broadcasters || []).join(', '),
      channels: matchChannels(g, cat.live).map((c) => pub(c)),
    }));
    mapped.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return mapped;
  }

  function gamesPreviewFor(cat) {
    const date = gamesSvc.today();
    const cached = gamesSvc.peekDate(date) || [];
    const manual = gamesSvc.manualForDate(date);
    const external = cached.filter((game) => !String(game.id).startsWith('m'));
    return mapGamesFor(cat, [...manual, ...external]).slice(0, 10);
  }

  async function gamesFor(cat, reqDate = null) {
    const isAll = reqDate === 'all';
    const games = isAll ? await gamesSvc.allWeekly() : await gamesSvc.forDate(reqDate || gamesSvc.today());
    return mapGamesFor(cat, games);
  }

  // ---------------------------------------------------------------- API do app
  add('GET', '/healthz', () => ({ ok: true }));

  add('POST', '/api/v1/register', (ctx) => {
    const mac = normMac(ctx.body?.mac) || normMac(ctx.req.headers['x-mac']);
    const key = normKey(ctx.body?.key) || normKey(ctx.req.headers['x-key']);
    if (!mac || !key) throw new HttpError(400, 'invalid_mac_or_key');
    const existing = store.getDevice(mac);
    if (!existing) {
      if (!cfg.autoRegister) throw new HttpError(403, 'registration_disabled');
      const d = store.createDevice({
        mac,
        key,
        status: 'pending',
      });
      store.touchDevice(mac, ctx.ip, ctx.body.appVersion, ctx.body.model);
      const updated = store.getDevice(mac);
      return { status: deviceStatus(updated), expiresAt: updated.expires_at };
    }
    if (!existing.device_key) {
      const d = store.updateDevice(mac, {
        device_key: key,
      });
      store.touchDevice(mac, ctx.ip, ctx.body.appVersion, ctx.body.model);
      const updated = store.getDevice(mac);
      return { status: deviceStatus(updated), expiresAt: updated.expires_at };
    }
    if (!safeEqual(existing.device_key, key)) {
      throw new HttpError(403, 'key_mismatch');
    }
    store.touchDevice(mac, ctx.ip, ctx.body.appVersion, ctx.body.model);
    return { status: deviceStatus(existing), expiresAt: existing.expires_at };
  });

  add('POST', '/api/v1/auth/login', async (ctx) => {
    const { body, ip } = ctx;
    // Chave de recuperação (guardada pelo navegador): reativa o aparelho sem digitar a senha de novo.
    let rec = null;
    if (body.recovery) {
      rec = openRecovery(recoverySecret, body.recovery);
      if (!rec) throw new HttpError(400, 'invalid_recovery', { message: 'Sessão salva inválida. Entre novamente.' });
    }
    const user = String(rec ? rec.username : body.username || '').trim();
    const pass = String(rec ? rec.password : body.password ?? '');
    const mac = normMac(body.mac) || normMac(ctx.req.headers['x-mac']);
    const key = normKey(body.key) || normKey(ctx.req.headers['x-key']);

    if (!user || !pass) {
      throw new HttpError(400, 'missing_credentials', { message: 'Informe o usuário e a senha.' });
    }
    if (!mac || !key) {
      throw new HttpError(400, 'invalid_identity', { message: 'Identificador do aparelho ausente.' });
    }

    let requestedHost = String((rec ? rec.serverHost : body.serverHost) || '').trim();
    // Servidor trocado para todos: uma chave de recuperação antiga que aponta para o servidor velho passa a usar o atual.
    if (rec && requestedHost && oldServerHosts().includes(originOf(requestedHost))) requestedHost = '';
    const normalizedHost = requestedHost ? cleanPlaylistUrl(requestedHost) : xtreamHost();
    if (requestedHost && !normalizedHost) throw new HttpError(400, 'invalid_server_host', { message: 'Endereço do servidor Xtream inválido.' });
    const host = normalizedHost ? new URL(normalizedHost).origin : '';
    if (!host) throw new HttpError(422, 'no_default_server', { message: 'Configure o servidor Xtream.' });
    if (loginIpLimiter.blocked(ip)) throw new HttpError(429, 'too_many_attempts', { message: 'Muitas tentativas. Aguarde alguns minutos.' });
    if (authFailLimiter.blocked(mac)) throw new HttpError(429, 'too_many_attempts', { message: 'Muitas senhas erradas neste aparelho. Aguarde uma hora.' });
    const existing = store.getDevice(mac);
    if (existing && existing.device_key && !safeEqual(existing.device_key, key)) {
      throw new HttpError(403, 'key_mismatch', { message: 'A chave não confere com este aparelho.' });
    }
    if (existing?.status === 'blocked') throw new HttpError(403, 'device_blocked', { message: 'Este aparelho está bloqueado.' });
    if (!existing && !cfg.autoRegister) throw new HttpError(403, 'device_not_registered', { message: 'Este aparelho ainda não foi cadastrado.' });

    const m3uUrl = buildXtreamUrl({ host, user, pass, output: xtreamOutput() });
    if (!m3uUrl) throw new HttpError(422, 'invalid_login', { message: 'Confira os dados da conta Xtream.' });
    let account;
    try {
      account = await xtreamAccount(host, user, pass, { allowPrivate: cfg.allowPrivate, userAgent: cfg.streamUa });
      if (!account) throw new HttpError(502, 'provider_unavailable', { message: 'O servidor Xtream não respondeu com uma conta válida.' });
    } catch (e) {
      if (e instanceof PlaylistError && e.reason === 'auth_failed') { authFailLimiter.hit(mac); loginIpLimiter.hit(ip); }
      if (e instanceof PlaylistError) throw new HttpError(422, e.reason, { message: REASON_TEXT[e.reason] || 'A conta Xtream não foi aceita.', ...e.extra });
      throw e;
    }
    // Garante que o dispositivo exista e esteja ativo com a lista
    let d = existing;
    if (!d) {
      d = store.createDevice({ mac, key });
    } else if (!d.device_key) {
      d = store.updateDevice(mac, { device_key: key });
    }

    // Atualiza a playlist e status do aparelho
    d = store.updateDevice(mac, {
      m3u_url: m3uUrl,
      status: 'active',
      name: user,
      expires_at: account.expiresAt
    });
    store.touchDevice(mac, ip);

    // Pré-carrega o catálogo em segundo plano para o Início abrir instantaneamente
    catalogs.get(m3uUrl).catch(() => { });

    return {
      ok: true,
      status: 'active',
      username: user,
      expiresAt: account.expiresAt,
      serverHost: host,
      recovery: sealRecovery(recoverySecret, { u: user, p: pass, h: host }),
    };
  });

  // Rotas antigas /api/v1/devices* e /api/v1/config/server foram removidas: eram públicas (sem login)
  // e expunham chaves/senhas Xtream. Use /admin/api/devices e /admin/api/integrations (protegidas).

  add(
    'GET',
    '/api/v1/status',
    (ctx) => ({
      status: ctx.status,
      expiresAt: ctx.device.expires_at,
      name: ctx.device.name || null,
    }),
    { device: true, allowInactive: true }
  );

  add(
    'GET',
    '/api/v1/home',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const mac = ctx.dev.mac;
      const favIds = store.favoriteIds(mac);
      const rows = [];

      const hideAdult = ctx.query.adult === 'hide';
      const cont = continueItems(mac, cat);
      if (cont.length) rows.push({ id: 'continue', title: 'Continuar assistindo', kind: 'continue', items: withFav(cont, favIds) });

      const favItems = hydrate(cat, mac, [...favIds], 30);
      if (favItems.length) rows.push({ id: 'favorites', title: 'Minha lista', kind: 'favorites', items: withFav(favItems, favIds) });

      for (const type of ['movie', 'series']) {
        for (const g of cat.groups(type).filter((x) => !(hideAdult && isAdultGroup(x.name))).slice(0, 4)) {
          const { items } = cat.list(type, { group: g.name, limit: 20 });
          rows.push({ id: `g:${type}:${g.name}`, title: g.name, kind: type, items: withFav(items, favIds) });
        }
      }
      if (!cat.movies.length && !cat.series.length) {
        for (const g of cat.groups('live').filter((x) => !(hideAdult && isAdultGroup(x.name))).slice(0, 3)) {
          const { items } = cat.list('live', { group: g.name, limit: 20 });
          rows.push({ id: `g:live:${g.name}`, title: g.name, kind: 'live', items: withFav(items, favIds) });
        }
      }

      let hero = null;
      if (cont.length) {
        hero = withFav([cont[0]], favIds)[0];
      } else {
        const pool = [...cat.movies.slice(0, 200), ...cat.series.slice(0, 200)].filter((i) => i.logo && !(hideAdult && isAdultGroup(i.group)));
        if (pool.length) hero = withFav([pool[Math.floor(Date.now() / DAY_MS) % pool.length]], favIds)[0];
      }
      // Usa uma prévia local/cacheada; consultas externas seguem em /games sem atrasar a lista IPTV.
      return { hero, rows, games: gamesPreviewFor(cat) };
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/browse',
    async (ctx) => {
      const { type, group, q } = ctx.query;
      if (!['live', 'movie', 'series'].includes(type)) throw new HttpError(400, 'invalid_type');
      const cat = await ctx.dev.getCatalog({ force: ctx.query.force === '1' });

      // Se for Xtream e tiver grupo selecionado, carrega sob demanda se ainda não carregou
      if (typeof cat.loadVodCategory === 'function' && group) {
        if (type === 'movie') {
          for (const [cid, cname] of cat.vodCatMap.entries()) {
            if (cname === group) { await cat.loadVodCategory(cid); break; }
          }
        } else if (type === 'series') {
          for (const [cid, cname] of cat.seriesCatMap.entries()) {
            if (cname === group) { await cat.loadSeriesCategory(cid); break; }
          }
        }
      }

      const hide = ctx.query.adult === 'hide';
      const exclude = hide ? (i) => isAdultGroup(i.group) : null;
      const offset = Math.max(0, parseInt(ctx.query.offset) || 0);
      // Canais ao vivo podem ter lista grande; filmes/séries ficam no limite de 200 por página
      const maxLimit = type === 'live' ? 3000 : 200;
      const limit = Math.min(maxLimit, Math.max(1, parseInt(ctx.query.limit) || 60));
      const favIds = store.favoriteIds(ctx.dev.mac);
      const lockedGroup = hide && group && isAdultGroup(group);
      const { total, items } = lockedGroup ? { total: 0, items: [] } : cat.list(type, { group: group || null, q: q || '', offset, limit, exclude });
      const out = { total, items: withFav(items, favIds) };
      if (offset === 0 && !q) out.groups = hide ? cat.groups(type).filter((g) => !isAdultGroup(g.name)) : cat.groups(type);
      if (cat.warnings?.length) out.warning = 'Parte do catalogo Xtream nao carregou. Confira a conexao e tente atualizar.';
      return out;
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/search',
    async (ctx) => {
      const q = String(ctx.query.q || '').trim();
      if (q.length < 2) return { live: [], movie: [], series: [] };
      const cat = await ctx.dev.getCatalog();
      const favIds = store.favoriteIds(ctx.dev.mac);
      const res = {};
      const exclude = ctx.query.adult === 'hide' ? (i) => isAdultGroup(i.group) : null;
      for (const t of ['live', 'movie', 'series']) res[t] = withFav(cat.list(t, { q, limit: 30, exclude }).items, favIds);
      return res;
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/series/:id',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      if (typeof cat.getSeriesDetail === 'function') {
        const detail = await cat.getSeriesDetail(ctx.params.id);
        const prog = store.progressMap(ctx.dev.mac);
        const favIds = store.favoriteIds(ctx.dev.mac);
        return {
          ...detail,
          favorite: favIds.has(detail.id),
          seasons: (detail.seasons || []).map(s => ({
            season: s.season,
            episodes: (s.episodes || []).map(ep => {
              const p = prog.get(ep.id);
              return pub(ep, { positionMs: p?.position_ms || 0, durationMs: p?.duration_ms || 0 });
            })
          }))
        };
      }
      const s = cat.byId.get(ctx.params.id);
      if (!s || s.type !== 'series') throw new HttpError(404, 'not_found');
      const prog = store.progressMap(ctx.dev.mac);
      const favIds = store.favoriteIds(ctx.dev.mac);
      const seasons = new Map();
      for (const ep of s.episodes) {
        const p = prog.get(ep.id);
        if (!seasons.has(ep.season)) seasons.set(ep.season, []);
        seasons.get(ep.season).push(pub(ep, { positionMs: p?.position_ms || 0, durationMs: p?.duration_ms || 0 }));
      }
      return {
        ...pub(s, { favorite: favIds.has(s.id) }),
        seasons: [...seasons].map(([season, episodes]) => ({ season, episodes })),
      };
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/item/:id',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const it = cat.byId.get(ctx.params.id);
      if (!it) throw new HttpError(404, 'not_found');
      const p = store.getProgress(ctx.dev.mac, it.id);
      const favIds = store.favoriteIds(ctx.dev.mac);
      return pub(it, { favorite: favIds.has(it.id), positionMs: p?.position_ms || 0, durationMs: p?.duration_ms || 0 });
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/epg',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const it = cat.byId.get(String(ctx.query.id || ''));
      if (!it || it.type !== 'live') return { id: ctx.query.id, epg: null };
      const epg = await epgSvc.getEpgForChannel(it);
      return { id: it.id, epg };
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/meta',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      let it = cat.byId.get(String(ctx.query.id || ''));
      if (!it) throw new HttpError(404, 'not_found');
      if (it.type === 'episode') it = cat.byId.get(it.seriesId);
      if (!it) return {};
      if (it.type === 'live') {
        const epg = await epgSvc.getEpgForChannel(it);
        return { epg };
      }
      let m = metaSvc.enabled ? await metaSvc.lookup(it) : null;
      if (m && !m.source) m = { ...m, source: 'TMDB' };
      const noText = !m || !m.overview || /^Sinopse não disponível/.test(m.overview);
      if (noText && typeof cat.metaFor === 'function') {
        // Sem TMDB (ou sem resultado): usa a sinopse/gêneros/nota que o próprio servidor Xtream informa.
        const x = await cat.metaFor(it).catch(() => null);
        if (x) {
          const merged = { ...(m || {}) };
          for (const [k, v] of Object.entries(x)) if (v && (!merged[k] || (k === 'overview' && noText))) merged[k] = v;
          m = merged;
        }
      }
      return m || {};
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/favorites',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const favIds = store.favoriteIds(ctx.dev.mac);
      const items = hydrate(cat, ctx.dev.mac, [...favIds], 500).filter((i) => !ctx.query.type || i.type === ctx.query.type);
      return { items: withFav(items, favIds) };
    },
    { device: true }
  );

  add(
    'POST',
    '/api/v1/favorites',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const it = cat.byId.get(String(ctx.body.id || ''));
      if (!it || it.type === 'episode') throw new HttpError(404, 'not_found');
      store.addFavorite(ctx.dev.mac, it);
      return { ok: true };
    },
    { device: true }
  );

  add(
    'DELETE',
    '/api/v1/favorites/:id',
    (ctx) => {
      store.removeFavorite(ctx.dev.mac, ctx.params.id);
      return { ok: true };
    },
    { device: true }
  );

  add(
    'POST',
    '/api/v1/progress',
    async (ctx) => {
      const pos = Math.floor(Number(ctx.body.positionMs));
      const dur = Math.floor(Number(ctx.body.durationMs));
      if (!Number.isFinite(pos) || !Number.isFinite(dur) || pos < 0 || dur < 0) throw new HttpError(400, 'invalid_progress');
      const cat = await ctx.dev.getCatalog();
      const it = cat.byId.get(String(ctx.body.id || ''));
      if (!it) throw new HttpError(404, 'not_found');
      if (it.type === 'live') return { ok: true, ignored: true };
      store.upsertProgress(ctx.dev.mac, {
        item_id: it.id,
        type: it.type,
        title: it.title,
        series_id: it.seriesId || null,
        position_ms: pos,
        duration_ms: dur,
      });
      return { ok: true };
    },
    { device: true }
  );

  // Limpa "Continuar assistindo" (progresso de todos os filmes e episódios deste aparelho).
  add(
    'DELETE',
    '/api/v1/history',
    (ctx) => {
      store.clearProgress(ctx.dev.mac);
      return { ok: true };
    },
    { device: true }
  );

  // Dados da assinatura que só o provedor sabe (telas simultâneas). Cache curto para não sobrecarregar o provedor.
  const accountCache = new Map();
  add(
    'GET',
    '/api/v1/account',
    async (ctx) => {
      const mac = ctx.dev.mac;
      const hit = accountCache.get(mac);
      if (hit && Date.now() - hit.t < 60000) return hit.data;
      let data = { maxConnections: null, activeConnections: null };
      try {
        const u = new URL(ctx.device.m3u_url);
        const acc = await xtreamAccount(u.origin, u.searchParams.get('username') || '', u.searchParams.get('password') || '', { allowPrivate: cfg.allowPrivate, userAgent: cfg.streamUa });
        if (acc) data = { maxConnections: acc.maxConnections, activeConnections: acc.activeConnections };
      } catch { /* provedor fora do ar ou conta vencida: mostra só o que já se sabe */ }
      if (accountCache.size > 500) accountCache.clear();
      accountCache.set(mac, { t: Date.now(), data });
      return data;
    },
    { device: true }
  );

  add(
    'GET',
    '/api/v1/games',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const targetDate = ctx.query.date || gamesSvc.today();
      return { date: targetDate, games: await gamesFor(cat, targetDate) };
    },
    { device: true }
  );

  add(
    'POST',
    '/api/v1/refresh',
    (ctx) => {
      const last = refreshLimiter.get(ctx.dev.mac) || 0;
      if (Date.now() - last < 60000) throw new HttpError(429, 'wait_a_minute');
      refreshLimiter.set(ctx.dev.mac, Date.now());
      catalogs.invalidate(ctx.dev.device.m3u_url);
      return { ok: true };
    },
    { device: true }
  );

  // ---------------------------------------------------------------- integrações (APIs externas)
  add('GET', '/admin/api/integrations', () => ({
    football: {
      configured: !!gamesSvc.token,
      token: mask(gamesSvc.token),
      competitions: gamesSvc.competitions || '',
      source: store.getSetting('football_token') != null ? 'painel' : gamesSvc.token ? 'ambiente' : null,
    },
    xtream: { host: xtreamHost() || '', defaultHost: cfg.xtreamHost, output: xtreamOutput(), source: store.getSetting('xtream_host') != null ? 'painel' : xtreamHost() ? 'ambiente' : null },
    tmdb: {
      configured: !!metaSvc.key,
      key: mask(metaSvc.key),
      source: store.getSetting('tmdb_key') != null ? 'painel' : metaSvc.key ? 'ambiente' : null,
    },
  }), { admin: true });

  add('PUT', '/admin/api/integrations', (ctx) => {
    const b = ctx.body;
    const clean = (v, max) => String(v).trim().replace(/\s+/g, '').slice(0, max);
    // texto vazio = apagar (volta ao valor do ambiente); campo ausente = não mexe
    if (b.footballToken !== undefined) store.setSetting('football_token', clean(b.footballToken, 200));
    if (b.competitions !== undefined) store.setSetting('football_competitions', clean(b.competitions, 200).toUpperCase());
    if (b.tmdbKey !== undefined) store.setSetting('tmdb_key', clean(b.tmdbKey, 400));
    if (b.xtreamHost !== undefined) {
      const raw = String(b.xtreamHost).trim();
      if (raw === '') store.setSetting('xtream_host', '');
      else {
        const u = cleanPlaylistUrl(raw);
        if (!u) throw new HttpError(400, 'invalid_host');
        store.setSetting('xtream_host', new URL(u).origin); // guarda só protocolo + servidor + porta
      }
    }
    if (b.xtreamOutput !== undefined) {
      if (!XTREAM_OUTPUTS.includes(b.xtreamOutput)) throw new HttpError(400, 'invalid_output');
      store.setSetting('xtream_output', b.xtreamOutput);
    }
    applyIntegrations();
    return { ok: true };
  }, { admin: true });

  // Chamada de verdade à API, para você saber na hora se a chave funciona.
  add('POST', '/admin/api/integrations/test', async (ctx) => {
    const which = ctx.body.which;
    const say = (res, extra = {}) => ({ ok: false, httpStatus: res.status, ...extra });
    try {
      if (which === 'football') {
        if (!gamesSvc.token) return { ok: false, message: 'Cole o token do football-data.org primeiro.' };
        const d = gamesSvc.today();
        let url = `https://api.football-data.org/v4/matches?dateFrom=${d}&dateTo=${d}`;
        if (gamesSvc.competitions) url += `&competitions=${encodeURIComponent(gamesSvc.competitions)}`;
        const res = await fetchFn(url, { headers: { 'X-Auth-Token': gamesSvc.token }, signal: AbortSignal.timeout(15000) });
        if (res.status === 400 || res.status === 403) {
          return say(res, { message: res.status === 403 ? 'Token recusado ou campeonato fora do seu plano grátis. Tire o filtro de campeonatos e teste de novo.' : 'Pedido recusado (confira os códigos dos campeonatos, ex.: BSA,CL).' });
        }
        if (res.status === 429) return say(res, { message: 'Limite de pedidos por minuto atingido (plano grátis: 10/min). Espere um minuto.' });
        if (!res.ok) return say(res, { message: 'O servidor respondeu erro ' + res.status + '.' });
        const j = await res.json();
        const n = (j.matches || []).length;
        return { ok: true, message: n ? `Funcionando: ${n} jogo(s) hoje na API.` : 'Funcionando, mas a API não tem jogos hoje (nos campeonatos do seu plano).', matches: n };
      }
      if (which === 'tmdb') {
        if (!metaSvc.key) return { ok: false, message: 'Cole a chave do TMDB primeiro.' };
        let url = 'https://api.themoviedb.org/3/search/movie?query=Matrix&language=pt-BR';
        const headers = { accept: 'application/json' };
        if (metaSvc.key.length > 40) headers.authorization = `Bearer ${metaSvc.key}`;
        else url += `&api_key=${encodeURIComponent(metaSvc.key)}`;
        const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(15000) });
        if (res.status === 401) return say(res, { message: 'Chave recusada pelo TMDB.' });
        if (!res.ok) return say(res, { message: 'O TMDB respondeu erro ' + res.status + '.' });
        const j = await res.json();
        return { ok: (j.results || []).length > 0, message: (j.results || []).length ? 'Funcionando: o TMDB respondeu com resultados.' : 'O TMDB respondeu, mas sem resultados.' };
      }
      throw new HttpError(400, 'invalid_target');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      return { ok: false, message: 'Não consegui falar com a API (sem internet no servidor ou bloqueio).' };
    }
  }, { admin: true });

  // ---------------------------------------------------------------- ativação pelo cliente
  // Qualquer pessoa que tenha o MAC + a chave (mostrados no app) pode colocar a lista, de qualquer lugar.
  // A lista só é gravada se for verificada (baixa, é M3U de verdade, tem itens). Se falhar, nada muda.
  const planReason = (reason, status = 422, extra = {}) =>
    new HttpError(status, 'playlist_invalid', { reason, message: REASON_TEXT[reason] || 'Lista inválida.', ...extra });

  // O front-end pergunta: tem servidor fixo (então o cliente só digita usuário e senha)?
  // ---------------------------------------------------------------- servidor IPTV único para todos
  // GET: aplicativos e site perguntam qual é o servidor atual. POST (com senha): troca para todos os aparelhos.
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
  const oldServerHosts = () => { try { return JSON.parse(store.getSetting('server_old_hosts') || '[]'); } catch { return []; } };
  const serverLimiter = new Limiter(5, 15 * 60000); // 5 senhas erradas = 15 min de espera
  const serverInfo = () => ({
    host: xtreamHost(),
    rev: Number(store.getSetting('server_rev') || 0),
    updatedAt: Number(store.getSetting('server_updated_at') || 0),
  });

  add('GET', '/api/v1/server', () => serverInfo());

  add('POST', '/api/v1/server', async (ctx) => {
    const { ip, body } = ctx;
    if (serverLimiter.blocked(ip)) throw new HttpError(429, 'too_many_attempts', { message: 'Muitas senhas erradas. Aguarde 15 minutos.' });
    if (!safeEqual(String(body.password || ''), cfg.serverEditPassword)) {
      serverLimiter.hit(ip);
      throw new HttpError(401, 'wrong_password', { message: 'Senha incorreta.' });
    }
    const cleaned = cleanPlaylistUrl(String(body.host || '').trim());
    if (!cleaned) throw new HttpError(400, 'invalid_host', { message: 'Endereço inválido. Use algo como http://servidor.com:80' });
    const origin = new URL(cleaned).origin;
    // Confere se o servidor responde antes de mudar todo mundo (a menos que force = true).
    if (!body.force) {
      try {
        const r = await fetch(`${origin}/player_api.php`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
        await r.arrayBuffer().catch(() => {});
      } catch {
        throw new HttpError(422, 'unreachable', { message: 'Não consegui falar com esse servidor. Confira o endereço (ou confirme para salvar mesmo assim).' });
      }
    }
    const old = originOf(xtreamHost());
    let migrated = 0;
    if (old && old !== origin) {
      const prev = oldServerHosts().filter((h) => h !== origin);
      prev.push(old);
      store.setSetting('server_old_hosts', JSON.stringify(prev.slice(-10)));
      // aparelhos já ativados guardam o link da lista: troca o servidor nele, mantendo usuário e senha
      for (const d of store.listDevices()) {
        if (!d.m3u_url) continue;
        try {
          const u = new URL(d.m3u_url);
          if (u.origin !== old) continue;
          catalogs.invalidate(d.m3u_url);
          const to = new URL(origin);
          u.protocol = to.protocol;
          u.host = to.host;
          store.updateDevice(d.mac, { m3u_url: u.toString() });
          migrated++;
        } catch { /* link inválido: ignora */ }
      }
    }
    store.setSetting('xtream_host', origin);
    store.setSetting('server_rev', String(Number(store.getSetting('server_rev') || 0) + 1));
    store.setSetting('server_updated_at', String(Date.now()));
    let hist = [];
    try { hist = JSON.parse(store.getSetting('server_history') || '[]'); } catch { /* recomeça */ }
    hist.push({ at: Date.now(), ip, from: old, to: origin });
    store.setSetting('server_history', JSON.stringify(hist.slice(-20)));
    applyIntegrations();
    console.log(`[servidor] trocado ${old || '(vazio)'} -> ${origin} por ${ip}; ${migrated} aparelho(s) migrado(s)`);
    return { ok: true, ...serverInfo(), migrated };
  });

  add('GET', '/api/v1/activate/config', () => ({ loginMode: xtreamHost() ? 'userpass' : 'link', selfActivate: cfg.selfActivate, serverHost: xtreamHost() }));

  add('POST', '/api/v1/activate', async (ctx) => {
    const { body, ip, req } = ctx;
    if (!cfg.selfActivate) throw new HttpError(403, 'self_activation_disabled', { message: 'A ativação pelo cliente está desligada. Fale com o seu fornecedor.' });
    if (failLimiter.blocked(ip) || activateLimiter.blocked(ip)) throw new HttpError(429, 'too_many_attempts', { message: 'Muitas tentativas. Aguarde alguns minutos.' });
    const mac = normMac(body.mac ?? req.headers['x-mac']);
    const key = normKey(body.key ?? req.headers['x-key']);
    if (!mac || !key) throw new HttpError(400, 'invalid_identity', { message: 'MAC ou chave inválidos. Confira o que aparece na tela do aplicativo.' });
    activateLimiter.hit(ip);

    const d = store.getDevice(mac);
    if (!d || !d.device_key) {
      failLimiter.hit(ip);
      throw new HttpError(404, 'device_not_found', { message: 'Esse MAC ainda não apareceu no sistema. Abra o aplicativo no aparelho uma vez (com internet) e tente de novo.' });
    }
    if (!safeEqual(d.device_key, key)) {
      failLimiter.hit(ip);
      throw new HttpError(403, 'key_mismatch', { message: 'A chave não confere com este MAC.' });
    }
    if (d.status === 'blocked') throw new HttpError(403, 'device_blocked', { message: 'Este aparelho está bloqueado. Fale com o seu fornecedor.' });
    if (d.m3u_url && !cfg.selfReplace) throw new HttpError(403, 'already_activated', { message: 'Este aparelho já tem uma lista. Peça ao fornecedor para trocar.' });

    if (authFailLimiter.blocked(mac)) throw new HttpError(429, 'too_many_attempts', { message: 'Muitas senhas erradas neste aparelho. Aguarde uma hora ou fale com o seu fornecedor.' });

    // 1) De onde vem a lista? (usuário+senha com servidor fixo, servidor+usuário+senha, ou link)
    let candidates = [];
    if (body.login !== undefined) {
      const host = xtreamHost();
      if (!host) throw planReason('no_default_server');
      const pl = parseLoginInput(body.login && body.login.user, body.login && body.login.pass);
      if (!pl) throw planReason('invalid_login');
      if (pl.link) candidates = [cleanPlaylistUrl(pl.link)];
      else candidates = outputCandidates(xtreamOutput()).map((o) => buildXtreamUrl({ host, user: pl.user, pass: pl.pass, output: o }));
    } else if (body.xtream) {
      candidates = [buildXtreamUrl({ ...body.xtream, output: xtreamOutput() })];
    } else {
      candidates = [cleanPlaylistUrl(body.m3uUrl)];
    }
    candidates = candidates.filter(Boolean);
    if (!candidates.length) throw planReason('invalid_url');
    if (activating >= 4) throw new HttpError(503, 'busy', { message: 'Servidor ocupado verificando outras listas. Tente de novo em 30 segundos.' });

    // 2) Confere a conta no próprio servidor (senha certa? vencida?) e depois baixa e valida a lista.
    let result, url, account = null;
    activating++;
    try {
      const cred = credentialsFromUrl(candidates[0]);
      if (cred) {
        try {
          account = await xtreamAccount(cred.origin, cred.user, cred.pass, { allowPrivate: cfg.allowPrivate, userAgent: cfg.streamUa });
        } catch (e) {
          if (e instanceof PlaylistError) {
            if (e.reason === 'auth_failed') authFailLimiter.hit(mac);
            throw e;
          }
        }
      }
      let firstErr = null;
      const RETRY = new Set(['http_error', 'not_m3u', 'no_entries', 'html_page', 'unreachable', 'timeout']);
      for (const cand of candidates) {
        try {
          result = await checkPlaylist(cand, { allowPrivate: cfg.allowPrivate, userAgent: cfg.streamUa });
          url = cand;
          break;
        } catch (e) {
          if (!(e instanceof PlaylistError)) throw e;
          firstErr = firstErr || e;
          if (!RETRY.has(e.reason)) throw e;
        }
      }
      if (!result) throw firstErr || new PlaylistError('unreachable');
    } catch (e) {
      if (e instanceof PlaylistError) throw planReason(e.reason, 422, e.extra);
      throw planReason('unreachable');
    } finally {
      activating--;
    }

    const warnings = result.warnings.map((w) => ({ code: w, message: WARNING_TEXT[w] || w }));
    const dry = body.dryRun === true;
    if (!dry) {
      const fields = { m3u_url: url };
      if (d.expires_at == null && cfg.selfDays > 0) fields.expires_at = Date.now() + cfg.selfDays * DAY_MS;
      const stamp = `[cliente ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ip ${ip}] lista ${d.m3u_url ? 'trocada' : 'ativada'} pelo próprio cliente`;
      fields.notes = (d.notes ? d.notes + '\n' : '').concat(stamp).slice(-1500);
      store.updateDevice(mac, fields);
      catalogs.prime(url, result.text); // a primeira abertura do app já encontra tudo pronto
      store.touchDevice(mac, ip);
    }
    const now = store.getDevice(mac);
    return { ok: true, dryRun: dry, status: deviceStatus(now), expiresAt: now.expires_at, counts: result.counts, warnings, account };
  });

  // ---------------------------------------------------------------- site (navegador)
  add(
    'GET',
    '/api/v1/web/token',
    (ctx) => ({ token: webTokens.sign(ctx.dev.mac), expiresIn: webTokens.ttlMs }),
    { device: true }
  );

  const proxyUrl = (token, abs, isPlaylist) =>
    `/p/v?t=${encodeURIComponent(token)}&u=${encodeURIComponent(abs)}${isPlaylist ? '&k=hls' : ''}`;

  // Descobre o formato do item e devolve o endereço (pelo proxy) que o player do navegador deve usar.
  add(
    'GET',
    '/api/v1/web/play',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const it = cat.byId.get(String(ctx.query.id || ''));
      if (!it || !it.url) throw new HttpError(404, 'not_found');
      let kind = kindFromUrl(it.url);
      if (kind === 'unknown' || kind === 'mkv') {
        try {
          const { res } = await safeGet(it.url, {
            headers: { 'user-agent': cfg.streamUa },
            allowPrivate: cfg.allowPrivate,
            timeoutMs: 10000,
          });
          if (res.statusCode >= 400) {
            res.destroy();
            throw new HttpError(502, 'upstream_status', { upstreamStatus: res.statusCode });
          }
          const sniffed = sniffKind(await readHead(res));
          if (sniffed !== 'unknown') kind = sniffed;
        } catch (e) {
          if (e instanceof HttpError) throw e;
          throw new HttpError(502, e instanceof UpstreamError ? e.code : 'unreachable');
        }
      }
      if (kind === 'unknown') kind = it.type === 'live' ? 'ts' : 'mp4';
      const token = webTokens.sign(ctx.dev.mac);
      return { kind, src: proxyUrl(token, it.url, kind === 'hls'), live: it.type === 'live', token };
    },
    { device: true }
  );

  // Diagnóstico depois de uma falha: o servidor do provedor aceita a conexão? (usado só para explicar o erro ao usuário)
  add(
    'GET',
    '/api/v1/web/diag',
    async (ctx) => {
      const cat = await ctx.dev.getCatalog();
      const it = cat.byId.get(String(ctx.query.id || ''));
      if (!it || !it.url) throw new HttpError(404, 'not_found');
      try {
        const { res } = await safeGet(it.url, { headers: { 'user-agent': cfg.streamUa }, allowPrivate: cfg.allowPrivate, timeoutMs: 8000 });
        const status = res.statusCode || 0;
        res.destroy();
        return { ok: status < 400, status };
      } catch (e) {
        return { ok: false, code: e instanceof UpstreamError ? e.code : 'unreachable' };
      }
    },
    { device: true }
  );

  function proxyAuth(ctx) {
    const mac = webTokens.verify(ctx.query.t);
    const d = mac && store.getDevice(mac);
    if (!d || deviceStatus(d) !== 'active') throw new HttpError(401, 'invalid_token');
    return mac;
  }

  function sendUpstreamError(res, e) {
    if (res.headersSent) return res.destroy();
    const code = e instanceof UpstreamError ? e.code : 'unreachable';
    sendJson(res, code === 'blocked_address' || code === 'bad_url' || code === 'bad_protocol' ? 400 : 502, { error: code });
  }

  // Imagens (capas/logos http:// ou sem CORS)
  add(
    'GET',
    '/p/i',
    async (ctx) => {
      proxyAuth(ctx);
      const { req, res } = ctx;
      const ac = new AbortController();
      res.on('close', () => ac.abort());
      req.setTimeout?.(0);
      res.setTimeout?.(0);
      try {
        const { res: up } = await safeGet(String(ctx.query.u || ''), {
          headers: { 'user-agent': cfg.streamUa, accept: 'image/*' },
          allowPrivate: cfg.allowPrivate,
          timeoutMs: 8000,
          signal: ac.signal,
        });
        const type = String(up.headers['content-type'] || '').toLowerCase();
        if (up.statusCode !== 200 || !type.startsWith('image/') || type.includes('svg')) {
          up.destroy();
          throw new HttpError(404, 'not_image');
        }
        const body = await readLimited(up, 4 * 1024 * 1024);
        res.writeHead(200, {
          'content-type': type,
          'content-length': body.length,
          'cache-control': 'public, max-age=86400',
          ...corsHeaders(req),
        });
        res.end(body);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        sendUpstreamError(res, e);
      }
    },
    { proxy: true }
  );

  // Vídeo: arquivo (com Range), TS ao vivo ou playlist HLS (reescrita)
  add(
    'GET',
    '/p/v',
    async (ctx) => {
      proxyAuth(ctx);
      const { req, res } = ctx;
      const target = String(ctx.query.u || '');
      const token = String(ctx.query.t || '');
      const ac = new AbortController();
      res.on('close', () => ac.abort());
      req.setTimeout?.(0);
      res.setTimeout?.(0);
      const headers = { 'user-agent': cfg.streamUa, accept: '*/*' };
      if (req.headers.range) headers.range = req.headers.range;
      let up, finalUrl;
      try {
        ({ res: up, url: finalUrl } = await safeGet(target, {
          headers,
          allowPrivate: cfg.allowPrivate,
          signal: ac.signal,
        }));
      } catch (e) {
        return sendUpstreamError(res, e);
      }
      const code = up.statusCode || 502;
      if (code >= 400 && code !== 416) {
        up.destroy();
        return sendJson(res, 502, { error: 'upstream_status', upstreamStatus: code });
      }
      const ctype = String(up.headers['content-type'] || '');
      const looksPlaylist = ctx.query.k === 'hls' || /mpegurl/i.test(ctype);
      const cors = corsHeaders(req);
      if (looksPlaylist) {
        try {
          const raw = await readLimited(up, 5 * 1024 * 1024);
          const text = raw.toString('utf8');
          if (!text.includes('#EXTM3U')) {
            // não era playlist: entrega como veio
            res.writeHead(200, { 'content-type': ctype || 'application/octet-stream', 'content-length': raw.length, 'cache-control': 'no-store', ...cors });
            return res.end(raw);
          }
          const body = rewritePlaylist(text, finalUrl.toString(), (abs, pl) => proxyUrl(token, abs, pl));
          res.writeHead(200, {
            'content-type': 'application/vnd.apple.mpegurl',
            'content-length': Buffer.byteLength(body),
            'cache-control': 'no-store',
            ...cors,
          });
          return res.end(body);
        } catch (e) {
          return sendUpstreamError(res, e);
        }
      }
      const out = {
        'content-type': ctype || 'application/octet-stream',
        'cache-control': 'no-store',
        'accept-ranges': up.headers['accept-ranges'] || 'none',
        ...cors,
      };
      for (const h of ['content-length', 'content-range']) if (up.headers[h]) out[h] = up.headers[h];
      res.writeHead(code === 416 ? 416 : code, out);
      up.on('error', () => res.destroy());
      res.on('close', () => up.destroy());
      up.pipe(res);
    },
    { proxy: true }
  );

  // ---------------------------------------------------------------- admin
  const adminDevice = (d) => ({
    mac: d.mac,
    key: d.device_key,
    name: d.name,
    notes: d.notes,
    m3uUrl: d.m3u_url,
    status: deviceStatus(d),
    blocked: d.status === 'blocked',
    expiresAt: d.expires_at,
    createdAt: d.created_at,
    lastSeen: d.last_seen,
    lastIp: d.last_ip,
    appVersion: d.app_version,
    model: d.model,
  });

  function readDeviceFields(body, { creating }) {
    const f = {};
    if ('name' in body) f.name = String(body.name || '').slice(0, 120);
    if ('notes' in body) f.notes = String(body.notes || '').slice(0, 1000);
    if ('m3uUrl' in body) {
      const u = String(body.m3uUrl || '').trim();
      if (u && !isHttpUrl(u)) throw new HttpError(400, 'invalid_m3u_url');
      f.m3u_url = u;
    }
    if ('blocked' in body) f.status = body.blocked ? 'blocked' : 'active';
    if ('expiresAt' in body) {
      if (body.expiresAt == null || body.expiresAt === '') f.expires_at = null;
      else {
        const n = Number(body.expiresAt);
        if (!Number.isFinite(n)) throw new HttpError(400, 'invalid_expires_at');
        f.expires_at = Math.floor(n);
      }
    }
    if (creating && 'days' in body && body.days != null && body.days !== '') {
      const d = Number(body.days);
      if (!Number.isFinite(d) || d < 0) throw new HttpError(400, 'invalid_days');
      f.expires_at = Date.now() + Math.round(d * DAY_MS);
    }
    return f;
  }

  add('GET', '/admin', (ctx) => {
    const html = fs.readFileSync(adminHtmlPath);
    ctx.res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'",
      'x-frame-options': 'DENY',
    });
    ctx.res.end(html);
  }, { admin: true });

  add('GET', '/admin/api/devices', (ctx) => ({
    devices: store.listDevices(ctx.query.q).map(adminDevice),
    stats: store.stats(),
    serverTime: Date.now(),
  }), { admin: true });

  add('POST', '/admin/api/devices', (ctx) => {
    const mac = normMac(ctx.body.mac);
    if (!mac) throw new HttpError(400, 'invalid_mac');
    if (store.getDevice(mac)) throw new HttpError(409, 'already_exists');
    let key = null;
    if (ctx.body.key) {
      key = normKey(ctx.body.key);
      if (!key) throw new HttpError(400, 'invalid_key');
    }
    const f = readDeviceFields(ctx.body, { creating: true });
    const d = store.createDevice({
      mac,
      key,
      name: f.name ?? '',
      notes: f.notes ?? '',
      m3uUrl: f.m3u_url ?? '',
      status: f.status ?? 'active',
      expiresAt: f.expires_at ?? null,
    });
    return adminDevice(d);
  }, { admin: true });

  add('PATCH', '/admin/api/devices/:mac', (ctx) => {
    const mac = normMac(ctx.params.mac);
    const d = mac && store.getDevice(mac);
    if (!d) throw new HttpError(404, 'not_found');
    const f = readDeviceFields(ctx.body, { creating: false });
    if (ctx.body.addDays != null) {
      const add = Number(ctx.body.addDays);
      if (!Number.isFinite(add)) throw new HttpError(400, 'invalid_days');
      const base = Math.max(Date.now(), d.expires_at || 0);
      f.expires_at = base + Math.round(add * DAY_MS);
    }
    if (ctx.body.resetKey) f.device_key = null;
    return adminDevice(store.updateDevice(mac, f));
  }, { admin: true });

  add('DELETE', '/admin/api/devices/:mac', (ctx) => {
    const mac = normMac(ctx.params.mac);
    if (!mac || !store.deleteDevice(mac)) throw new HttpError(404, 'not_found');
    return { ok: true };
  }, { admin: true });

  add('GET', '/admin/api/devices/:mac/preview', async (ctx) => {
    const mac = normMac(ctx.params.mac);
    const d = mac && store.getDevice(mac);
    if (!d) throw new HttpError(404, 'not_found');
    if (!d.m3u_url) throw new HttpError(400, 'no_playlist');
    const cat = await catalogs.get(d.m3u_url, { force: ctx.query.force === '1' });
    return {
      ...cat.stats(),
      liveGroups: cat.groups('live').length,
      movieGroups: cat.groups('movie').length,
      seriesGroups: cat.groups('series').length,
    };
  }, { admin: true });

  add('GET', '/admin/api/games', () => ({ games: store.listAllManualGames() }), { admin: true });

  add('POST', '/admin/api/games', (ctx) => {
    const b = ctx.body;
    const home = String(b.home || '').trim();
    const away = String(b.away || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) throw new HttpError(400, 'invalid_date');
    if (!/^\d{2}:\d{2}$/.test(String(b.time || ''))) throw new HttpError(400, 'invalid_time');
    if (!home || !away) throw new HttpError(400, 'invalid_teams');
    const id = store.addManualGame({
      date: b.date,
      time: b.time,
      competition: String(b.competition || '').slice(0, 80),
      home: home.slice(0, 60),
      away: away.slice(0, 60),
      channels: String(b.channels || '').slice(0, 200),
    });
    return { id };
  }, { admin: true });

  add('DELETE', '/admin/api/games/:id', (ctx) => {
    if (!store.deleteManualGame(Number(ctx.params.id))) throw new HttpError(404, 'not_found');
    return { ok: true };
  }, { admin: true });

  // ---------------------------------------------------------------- Media Station X
  const msx = env.MSX_USER && env.MSX_PASS
    ? createMsx({ host: () => env.MSX_HOST || xtreamHost() || 'http://trevorcdn.online:80', user: env.MSX_USER, pass: env.MSX_PASS, liveFormat: env.MSX_LIVE_FORMAT || 'm3u8' })
    : null;

  // ---------------------------------------------------------------- servidor HTTP
  const server = http.createServer(async (req, res) => {
    const ip = clientIp(req);
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('x-content-type-options', 'nosniff');
      const isProxy = url.pathname.startsWith('/p/');
      const lim = isProxy ? proxyLimiter : generalLimiter;
      if (lim.blocked(ip)) throw new HttpError(429, 'too_many_requests');
      lim.hit(ip);

      // CORS só se CORS_ORIGIN estiver definido (site hospedado em outro domínio)
      if (req.method === 'OPTIONS' && corsList.length) {
        res.writeHead(204, {
          ...corsHeaders(req),
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'X-Mac, X-Key, Content-Type, Range',
          'access-control-max-age': '86400',
        });
        return res.end();
      }
      if (url.pathname.startsWith('/api/')) for (const [k, v] of Object.entries(corsHeaders(req))) res.setHeader(k, v);

      // Media Station X: /msx/*.json (só liga se MSX_USER e MSX_PASS estiverem definidos)
      if (url.pathname.startsWith('/msx/') && msx) {
        const proto = (req.headers['x-forwarded-proto'] || 'http').toString().split(',')[0];
        const base = `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
        let body;
        try {
          body = await msx.route(base, url.pathname, Object.fromEntries(url.searchParams));
        } catch (e) {
          res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
          return res.end(JSON.stringify({ type: 'pages', headline: 'Erro', items: [{ title: 'Não consegui falar com o servidor de IPTV. Tente de novo.', icon: 'error' }] }));
        }
        if (!body) throw new HttpError(404, 'not_found');
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
        return res.end(JSON.stringify(body));
      }

      const m = match(req.method, url.pathname);
      if (!m) {
        if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/admin') && serveStatic(req, res, url.pathname)) return;
        throw new HttpError(404, 'not_found');
      }
      const ctx = {
        req,
        res,
        url,
        ip,
        params: m.params,
        query: Object.fromEntries(url.searchParams),
        body: {},
      };
      if (m.route.admin) adminAuth(ctx);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) ctx.body = await readJson(req);
      if (m.route.device) {
        const d = await deviceCtx(req, ip, !!m.route.allowInactive);
        ctx.dev = d;
        ctx.device = d.device;
        ctx.status = d.status;
      }
      const out = await m.route.fn(ctx);
      if (out !== undefined) sendJson(res, 200, out);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.code, ...err.extra });
      } else {
        console.error('[erro]', err);
        sendJson(res, 500, { error: 'internal' });
      }
    }
  });

  return {
    cfg,
    store,
    server,
    snapshot,
    generatedPassword,
    async listen() {
      await snapshot.restoreIfEmpty();
      snapshot.start();
      return new Promise((resolve) => server.listen(cfg.port, '0.0.0.0', () => resolve(server.address().port)));
    },
    async close() {
      snapshot.stop();
      await snapshot.save();
      return new Promise((resolve) => {
        server.close(() => {
          store.close();
          resolve();
        });
        server.closeAllConnections?.();
      });
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = createApp();
  app.store.purgeOldGames(new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10));
  // O Render avisa com SIGTERM antes de desligar: salva a cópia externa e sai.
  process.once('SIGTERM', () => {
    app.snapshot.save(true).finally(() => process.exit(0));
  });
  app.listen().then((port) => {
    console.log(`Painel IPTV rodando na porta ${port}`);
    console.log(`Admin: http://localhost:${port}/admin  (usuário: ${app.cfg.adminUser})`);
    if (app.generatedPassword) {
      console.log(`ADMIN_PASSWORD não definida. Senha temporária desta execução: ${app.cfg.adminPassword}`);
      console.log('Defina ADMIN_PASSWORD no ambiente para fixar a senha.');
    }
    console.log(app.snapshot.enabled ? 'Cópia externa (SNAPSHOT_URL) ligada.' : 'Sem SNAPSHOT_URL: favoritos e aparelhos se perdem se o disco do host for apagado.');
    if (!app.cfg.footballToken) console.log('Jogos automáticos desligados (FOOTBALL_DATA_TOKEN vazio): use os jogos manuais no admin.');
  });
}
