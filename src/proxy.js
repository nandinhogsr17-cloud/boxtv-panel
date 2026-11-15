import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import crypto from 'node:crypto';

/**
 * Proxy para o site (navegador).
 * O navegador não consegue tocar direto a maioria dos streams IPTV: falta CORS no servidor do provedor
 * e links http:// são bloqueados dentro de página https://. Então o painel busca o stream e entrega.
 * Segurança: só http/https, bloqueia endereços internos (SSRF) na hora da conexão, limita redirecionamentos.
 */

// ------------------------------------------------------------------ endereços proibidos
export function isPrivateAddress(addr) {
  const fam = net.isIP(addr);
  if (fam === 4) {
    const [a, b] = addr.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }
  if (fam === 6) {
    const s = addr.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]);
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff');
  }
  return true;
}

function guardedLookup(allowPrivate) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const ok = addrs.filter((a) => allowPrivate || !isPrivateAddress(a.address));
      if (!ok.length) return cb(Object.assign(new Error('blocked_address'), { code: 'EBLOCKED' }));
      if (options && options.all) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  };
}

// ------------------------------------------------------------------ requisição com redirecionamento manual
export class UpstreamError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/**
 * GET em uma URL externa. Devolve { res, url } (res = IncomingMessage já com cabeçalhos).
 * `signal` cancela (ex.: o player fechou).
 */
export function safeGet(rawUrl, { headers = {}, allowPrivate = false, maxRedirects = 5, timeoutMs = 15000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (urlStr, left) => {
      let u;
      try {
        u = new URL(urlStr);
      } catch {
        return reject(new UpstreamError('bad_url'));
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new UpstreamError('bad_protocol'));
      const host = u.hostname.replace(/^\[|\]$/g, '');
      if (net.isIP(host) && !allowPrivate && isPrivateAddress(host)) return reject(new UpstreamError('blocked_address'));
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        u,
        {
          method: 'GET',
          headers: { 'accept-encoding': 'identity', ...headers },
          lookup: guardedLookup(allowPrivate),
          timeout: timeoutMs,
          signal,
        },
        (res) => {
          const code = res.statusCode || 0;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (left <= 0) return reject(new UpstreamError('too_many_redirects'));
            let next;
            try {
              next = new URL(res.headers.location, u).toString();
            } catch {
              return reject(new UpstreamError('bad_redirect'));
            }
            return attempt(next, left - 1);
          }
          // Remove o timeout de conexão para permitir que streams ao vivo (MPEG-TS/HLS) fluam indefinidamente
          req.setTimeout(0);
          resolve({ res, url: u });
        }
      );
      req.on('timeout', () => req.destroy(new UpstreamError('timeout')));
      req.on('error', (e) => {
        if (e instanceof UpstreamError) return reject(e);
        if (e.code === 'EBLOCKED') return reject(new UpstreamError('blocked_address'));
        if (e.name === 'AbortError') return reject(new UpstreamError('aborted'));
        reject(new UpstreamError('unreachable'));
      });
      req.end();
    };
    attempt(rawUrl, maxRedirects);
  });
}

/** Lê até `max` bytes do corpo (e fecha o resto). */
export async function readLimited(res, max) {
  const chunks = [];
  let size = 0;
  for await (const c of res) {
    size += c.length;
    if (size > max) {
      res.destroy();
      throw new UpstreamError('too_large');
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Lê só o começo do corpo (para descobrir o formato) e fecha a conexão. */
export async function readHead(res, n = 1500) {
  const chunks = [];
  let size = 0;
  try {
    for await (const c of res) {
      chunks.push(c);
      size += c.length;
      if (size >= n) break;
    }
  } finally {
    res.destroy();
  }
  return Buffer.concat(chunks);
}

// ------------------------------------------------------------------ formato
/** hls | ts | mp4 | mkv | unknown, olhando os primeiros bytes (mais confiável que a extensão). */
export function sniffKind(buf) {
  if (!buf || buf.length < 4) return 'unknown';
  const head = buf.subarray(0, 16).toString('latin1');
  if (head.includes('#EXTM3U')) return 'hls';
  if (buf[0] === 0x47 && (buf.length < 189 || buf[188] === 0x47)) return 'ts';
  if (buf.length >= 8 && buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'mkv';
  // TS com lixo antes do primeiro sincronismo
  if (buf.length >= 600) {
    for (let i = 0; i < 188; i++) if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) return 'ts';
  }
  return 'unknown';
}

export function kindFromUrl(urlStr) {
  let p = '';
  try {
    p = new URL(urlStr).pathname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (p.endsWith('.m3u8') || p.endsWith('.m3u') || p.includes('.m3u8')) return 'hls';
  if (p.endsWith('.ts') || p.includes('/live/') || p.includes('/ts/')) return 'ts';
  if (p.endsWith('.mp4') || p.endsWith('.m4v') || p.endsWith('.mov') || p.endsWith('.webm') || p.includes('/movie/') || p.includes('/series/')) return 'mp4';
  if (p.endsWith('.mkv')) return 'mkv';
  return 'unknown';
}

// ------------------------------------------------------------------ playlist HLS
/** Reescreve todas as URLs da playlist para passarem pelo proxy. wrap(absUrl, isPlaylist) => string */
export function rewritePlaylist(text, baseUrl, wrap) {
  const abs = (s) => {
    try {
      return new URL(s, baseUrl).toString();
    } catch {
      return null;
    }
  };
  const isPl = (u) => /\.m3u8?(\?|$)/i.test(u) || /\.m3u8?/i.test(new URL(u).pathname);
  const lines = text.split(/\r?\n/);
  let afterStreamInf = false;
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      if (t.startsWith('#EXT-X-STREAM-INF')) afterStreamInf = true;
      return line.replace(/URI="([^"]*)"/g, (m, uri) => {
        const a = abs(uri);
        if (!a) return m;
        const isKey = /^#EXT-X-(SESSION-)?KEY/.test(t) || t.startsWith('#EXT-X-MAP');
        return `URI="${wrap(a, !isKey && isPl(a))}"`;
      });
    }
    const a = abs(t);
    if (!a) return line;
    const pl = afterStreamInf || isPl(a);
    afterStreamInf = false;
    return wrap(a, pl);
  });
  return out.join('\n');
}

// ------------------------------------------------------------------ token do navegador
/** Token curto assinado: mac.expira.assinatura (o navegador não consegue mandar cabeçalhos em <img>/<video>). */
export class WebTokens {
  constructor(secret, ttlMs = 12 * 3600 * 1000) {
    this.secret = secret || crypto.randomBytes(32).toString('hex');
    this.ttlMs = ttlMs;
  }
  sign(mac, now = Date.now()) {
    const exp = now + this.ttlMs;
    const body = `${mac}.${exp}`;
    return `${body}.${this._mac(body)}`;
  }
  verify(token, now = Date.now()) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [mac, exp, sig] = parts;
    const want = this._mac(`${mac}.${exp}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (!(Number(exp) > now)) return null;
    return mac;
  }
  _mac(s) {
    return crypto.createHmac('sha256', this.secret).update(s).digest('base64url').slice(0, 32);
  }
}
