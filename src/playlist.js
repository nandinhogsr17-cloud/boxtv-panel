import { safeGet, readLimited, readHead, UpstreamError } from './proxy.js';
import { parseM3U, Catalog } from './m3u.js';

export const MAX_PLAYLIST_BYTES = 250 * 1024 * 1024;

/** fetch() que só fala com a internet pública (bloqueia localhost/rede interna) e limita o tamanho. */
export function guardedFetch({ allowPrivate = false, userAgent = 'IPTVPanel/1.0' } = {}) {
  return async (url, opts = {}) => {
    const { res } = await safeGet(String(url), {
      headers: { 'user-agent': userAgent, ...(opts.headers || {}) },
      allowPrivate,
      timeoutMs: 30000,
      signal: opts.signal,
    });
    const buf = await readLimited(res, MAX_PLAYLIST_BYTES);
    return new Response(buf, { status: res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 502 });
  };
}

// ------------------------------------------------------------------ entrada do usuário
/** Limpa o link colado (espaços, quebras de linha, aspas) e confere se é http(s). Devolve null se não servir. */
export function cleanPlaylistUrl(input) {
  let s = String(input ?? '').trim().replace(/^["'<]+|["'>]+$/g, '').replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s; // colou sem http://
  if (s.length > 2000) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && !/^\[/.test(u.hostname) && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const XTREAM_OUTPUTS = ['mpegts', 'ts', 'm3u8'];

/** Servidor + usuário + senha (estilo Xtream Codes) viram o link M3U. */
export function buildXtreamUrl({ host, user, pass, output = 'ts' } = {}) {
  const h = String(host ?? '').trim().replace(/\s+/g, '');
  const u = String(user ?? '').trim();
  const p = String(pass ?? '').trim();
  if (!h || !u || !p || u.length > 200 || p.length > 200) return null;
  const out = XTREAM_OUTPUTS.includes(output) ? output : 'ts';
  const base = cleanPlaylistUrl(h);
  if (!base) return null;
  try {
    const x = new URL(base);
    return `${x.protocol}//${x.host}/get.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&type=m3u_plus&output=${out}`;
  } catch {
    return null;
  }
}

/** Ordem de tentativa dos formatos de saída: o configurado primeiro, depois os outros. */
export const outputCandidates = (preferred) => [...new Set([XTREAM_OUTPUTS.includes(preferred) ? preferred : 'ts', 'ts', 'm3u8'])];

/**
 * Entrada "inteligente" do login: aceita usuário e senha em campos separados, "usuario:senha" / "usuario senha"
 * num campo só, ou o link inteiro colado (get.php?username=...&password=...).
 * Devolve { user, pass } ou { link } ou null.
 */
export function parseLoginInput(userRaw, passRaw) {
  const u = String(userRaw ?? '').trim();
  const p = String(passRaw ?? '').trim();
  if (/^https?:\/\//i.test(u) || /get\.php\?/i.test(u)) return { link: u };
  if (u && !p) {
    const parts = u.split(/[\s:;|]+/).filter(Boolean);
    if (parts.length === 2) return { user: parts[0], pass: parts[1] };
    return null;
  }
  if (!u || !p) return null;
  return { user: u, pass: p };
}

/** Pega usuário e senha de um link get.php (para consultar a conta no player_api). */
export function credentialsFromUrl(urlStr) {
  try {
    const x = new URL(urlStr);
    const user = x.searchParams.get('username');
    const pass = x.searchParams.get('password');
    return user && pass ? { origin: x.origin, user, pass } : null;
  } catch {
    return null;
  }
}

/**
 * Consulta a conta no próprio servidor Xtream (player_api.php): senha certa? conta vencida? quantas telas?
 * Devolve null se o servidor não tiver essa API (aí segue só com a lista).
 * Lança PlaylistError('auth_failed' | 'account_expired' | 'account_disabled') quando a conta não presta.
 */
export async function xtreamAccount(origin, user, pass, { allowPrivate = false, userAgent = 'IPTVPanel/1.0', now = Date.now() } = {}) {
  let j;
  try {
    const url = `${origin}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const { res } = await safeGet(url, { headers: { 'user-agent': userAgent, accept: 'application/json' }, allowPrivate, timeoutMs: 12000 });
    if (res.statusCode >= 400) {
      res.destroy();
      return null;
    }
    j = JSON.parse((await readLimited(res, 2 * 1024 * 1024)).toString('utf8'));
  } catch {
    return null;
  }
  const ui = j && j.user_info;
  if (!ui || typeof ui !== 'object') return null;
  const authOk = ui.auth === 1 || ui.auth === '1' || ui.auth === true;
  if (!authOk) throw new PlaylistError('auth_failed');
  const status = String(ui.status || '').toLowerCase();
  const exp = Number(ui.exp_date);
  const expMs = Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  if (status === 'disabled' || status === 'banned') throw new PlaylistError('account_disabled');
  if (status === 'expired' || (expMs && expMs < now)) throw new PlaylistError('account_expired', { expiresAt: expMs });
  return {
    status: ui.status || 'Active',
    expiresAt: expMs,
    maxConnections: Number(ui.max_connections) || null,
    activeConnections: Number(ui.active_cons) || 0,
    trial: ui.is_trial === 1 || ui.is_trial === '1',
    allowedOutputs: Array.isArray(ui.allowed_output_formats) ? ui.allowed_output_formats : null,
  };
}

// ------------------------------------------------------------------ verificação
export const REASON_TEXT = {
  invalid_url: 'O link não parece válido. Cole o endereço completo da lista (começa com http:// ou https://).',
  blocked_address: 'Esse endereço não é permitido (rede interna). Use o link público da sua lista.',
  unreachable: 'Não consegui acessar o servidor da lista. Confira o endereço e se a lista está no ar.',
  timeout: 'O servidor da lista demorou demais para responder. Tente de novo em instantes.',
  http_error: 'O servidor da lista respondeu com erro. Confira usuário/senha ou peça outro link ao seu fornecedor.',
  too_big: 'A lista é grande demais para ser aceita.',
  too_many_redirects: 'O link da lista redireciona demais. Peça um link direto ao seu fornecedor.',
  html_page: 'Esse link abre uma página da web, não uma lista M3U. Peça ao fornecedor o link da lista (M3U).',
  auth_failed: 'Usuário ou senha incorretos. Confira e digite de novo.',
  account_expired: 'Esta conta venceu no servidor da lista. Fale com o seu fornecedor para renovar.',
  account_disabled: 'Esta conta está desativada ou bloqueada no servidor da lista. Fale com o seu fornecedor.',
  no_default_server: 'O servidor da lista ainda não foi configurado. Fale com o seu fornecedor.',
  invalid_login: 'Digite o usuário e a senha.',
  not_m3u: 'O conteúdo desse link não é uma lista M3U.',
  no_entries: 'A lista abriu, mas não tem nenhum canal, filme ou série.',
};
export const WARNING_TEXT = {
  streams_unreachable:
    'A lista é válida, mas este servidor não conseguiu abrir os canais de teste. Pode ser bloqueio por IP no seu provedor, lista vencida ou provedor fora do ar. O aplicativo no aparelho pode funcionar normalmente.',
  few_entries: 'A lista tem pouquíssimos itens. Confira se é a lista certa.',
};

export class PlaylistError extends Error {
  constructor(reason, extra = {}) {
    super(reason);
    this.reason = reason;
    this.extra = extra;
  }
}

/** Baixa o texto da lista (com todas as proteções). */
export async function downloadPlaylist(url, { allowPrivate = false, userAgent = 'IPTVPanel/1.0', signal } = {}) {
  try {
    const { res } = await safeGet(url, { headers: { 'user-agent': userAgent, accept: '*/*' }, allowPrivate, timeoutMs: 30000, signal });
    if (res.statusCode >= 400) {
      res.destroy();
      throw new PlaylistError('http_error', { httpStatus: res.statusCode });
    }
    const buf = await readLimited(res, MAX_PLAYLIST_BYTES);
    return buf.toString('utf8').replace(/^﻿/, '');
  } catch (e) {
    if (e instanceof PlaylistError) throw e;
    if (e instanceof UpstreamError) {
      const map = { bad_url: 'invalid_url', bad_protocol: 'invalid_url', bad_redirect: 'unreachable', aborted: 'timeout' };
      throw new PlaylistError(map[e.code] || e.code || 'unreachable');
    }
    throw new PlaylistError('unreachable');
  }
}

/** Diz se o texto é uma M3U utilizável. Lança PlaylistError se não for. */
export function validatePlaylistText(text) {
  const head = text.slice(0, 2000).trimStart();
  if (/^<(!doctype|html|\?xml|head|body)/i.test(head)) throw new PlaylistError('html_page');
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const j = JSON.parse(text.slice(0, 200000));
      const auth = j?.user_info?.auth;
      if (auth === 0 || auth === '0' || String(j?.user_info?.status || '').toLowerCase() === 'expired') throw new PlaylistError('auth_failed');
    } catch (e) {
      if (e instanceof PlaylistError) throw e;
    }
    throw new PlaylistError('not_m3u');
  }
  if (!text.includes('#EXTINF')) throw new PlaylistError(text.includes('#EXTM3U') ? 'no_entries' : 'not_m3u');
  const items = parseM3U(text);
  if (!items.length) throw new PlaylistError('no_entries');
  const catalog = new Catalog(items);
  const counts = catalog.stats();
  if (counts.live + counts.movie + counts.series === 0) throw new PlaylistError('no_entries');
  return { catalog, counts };
}

/** Testa alguns streams da lista (não bloqueia: só gera aviso). */
export async function probeStreams(catalog, { allowPrivate = false, userAgent = 'IPTVPanel/1.0', timeoutMs = 7000 } = {}) {
  const pick = [];
  const take = (arr, i) => arr[Math.min(arr.length - 1, Math.max(0, i))];
  if (catalog.live.length) pick.push(take(catalog.live, 0), take(catalog.live, Math.floor(catalog.live.length / 2)));
  if (catalog.movies.length) pick.push(take(catalog.movies, 0));
  else if (catalog.series.length && catalog.series[0].episodes?.length) pick.push(catalog.series[0].episodes[0]);
  const urls = [...new Set(pick.map((i) => i && i.url).filter(Boolean))].slice(0, 3);
  const tests = urls.map(async (u) => {
    try {
      const { res } = await safeGet(u, { headers: { 'user-agent': userAgent, range: 'bytes=0-1023' }, allowPrivate, timeoutMs });
      const ok = res.statusCode < 400;
      if (ok) await readHead(res, 64);
      else res.destroy();
      return ok;
    } catch {
      return false;
    }
  });
  const results = await Promise.all(tests);
  return { tested: results.length, reachable: results.filter(Boolean).length };
}

/** Pipeline completo: baixa → valida → testa streams. */
export async function checkPlaylist(url, opts = {}) {
  const text = await downloadPlaylist(url, opts);
  const { catalog, counts } = validatePlaylistText(text);
  const warnings = [];
  const total = counts.live + counts.movie + counts.series;
  if (total < 3) warnings.push('few_entries');
  const probe = await probeStreams(catalog, opts);
  if (probe.tested > 0 && probe.reachable === 0) warnings.push('streams_unreachable');
  return { text, catalog, counts, warnings, probe };
}
