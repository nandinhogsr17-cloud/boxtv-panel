import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Normaliza qualquer formato de MAC para AA:BB:CC:DD:EE:FF (ou null). */
export function normMac(s) {
  const h = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (h.length !== 12) return null;
  return h.match(/.{2}/g).join(':');
}

/** Chave do dispositivo: 6 a 16 caracteres alfanuméricos, maiúsculos. */
export function normKey(s) {
  const k = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return k.length >= 6 && k.length <= 16 ? k : null;
}

export const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) {
    crypto.timingSafeEqual(A, A);
    return false;
  }
  return crypto.timingSafeEqual(A, B);
}

/** Limitador simples em memória (janela fixa por chave). */
export class Limiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.map = new Map();
  }
  _entry(key) {
    const now = Date.now();
    let e = this.map.get(key);
    if (!e || now >= e.reset) {
      e = { count: 0, reset: now + this.windowMs };
      this.map.set(key, e);
      if (this.map.size > 20000) {
        for (const [k, v] of this.map) if (now >= v.reset) this.map.delete(k);
      }
    }
    return e;
  }
  blocked(key) {
    return this._entry(key).count >= this.max;
  }
  hit(key) {
    this._entry(key).count++;
  }
}

export function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export async function readJson(req, max = 262144) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new HttpError(413, 'payload_too_large');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function parseBasic(header) {
  const m = /^Basic\s+(.+)$/i.exec(header || '');
  if (!m) return null;
  const s = Buffer.from(m[1], 'base64').toString('utf8');
  const i = s.indexOf(':');
  if (i < 0) return null;
  return { user: s.slice(0, i), pass: s.slice(i + 1) };
}

/** Data local YYYY-MM-DD no fuso informado. */
export function localDate(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Hora local HH:MM no fuso informado. */
export function localTime(tz, d) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

export function isHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Categorias adultas (pelo nome do grupo). Usado quando o app pede "adult=hide" (senha de conteúdo adulto). */
export function isAdultGroup(name) {
  const n = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /(^|[^a-z0-9])(xxx|adult[oa]?s?|porn[oa]?s?|erotic[oa]?s?|sexo|sex|hentai|sensual|sensuais|\+\s?18|18\s?\+|for adults)([^a-z0-9]|$)/.test(n);
}
