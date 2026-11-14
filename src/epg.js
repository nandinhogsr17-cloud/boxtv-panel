import { norm } from './m3u.js';

const MINUTE = 60 * 1000;
const EPG_TTL_MS = 15 * MINUTE;

/**
 * Decodifica com segurança strings em Base64 retornadas pela API Xtream Codes
 */
function safeBase64Decode(str) {
  if (!str || typeof str !== 'string') return '';
  try {
    return Buffer.from(str, 'base64').toString('utf8').trim();
  } catch {
    return str.trim();
  }
}

/**
 * Converte timestamp ou string de data em timestamp Unix (ms)
 */
function toEpochMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') {
    return val > 10000000000 ? val : val * 1000;
  }
  const n = Number(val);
  if (!isNaN(n) && n > 0) {
    return n > 10000000000 ? n : n * 1000;
  }
  const parsed = Date.parse(val.replace(' ', 'T') + 'Z');
  return isNaN(parsed) ? 0 : parsed;
}

export class EpgService {
  constructor({ store, fetchFn = fetch }) {
    this.store = store;
    this.fetchFn = fetchFn;
    this.mem = new Map();
  }

  /**
   * Extrai o host, credenciais e streamId da URL do canal
   * Ex: http://yuzantor.online:80/live/Nando5247/dede12346/edc9bfda-2cb1-425a-a032-1ef8214a19fb.ts
   */
  parseStreamUrl(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      // Formato clássico Xtream: /live/username/password/streamId.ts
      if (parts.length >= 4 && parts[0] === 'live') {
        const username = parts[1];
        const password = parts[2];
        const file = parts[3];
        const streamId = file.replace(/\.[a-z0-9]+$/i, '');
        return {
          origin: u.origin,
          username,
          password,
          streamId,
        };
      }
    } catch {}
    return null;
  }

  /**
   * Retorna a programação atual e futura de um canal ao vivo
   */
  async getEpgForChannel(item) {
    if (!item || item.type !== 'live' || !item.url) return null;

    const parsed = this.parseStreamUrl(item.url);
    if (!parsed) return null;

    const cacheKey = `epg:${parsed.streamId}`;
    const now = Date.now();

    const memHit = this.mem.get(cacheKey);
    if (memHit && now - memHit.at < EPG_TTL_MS) {
      return this._formatEpg(memHit.data, now);
    }

    // Consulta cache no banco SQLite
    const dbHit = this.store.getMeta(cacheKey);
    if (dbHit && dbHit.value && now - dbHit.updatedAt < EPG_TTL_MS) {
      this.mem.set(cacheKey, { at: dbHit.updatedAt, data: dbHit.value });
      return this._formatEpg(dbHit.value, now);
    }

    try {
      const apiUrl = `${parsed.origin}/player_api.php?username=${encodeURIComponent(parsed.username)}&password=${encodeURIComponent(parsed.password)}&action=get_short_epg&stream_id=${encodeURIComponent(parsed.streamId)}`;
      const res = await this.fetchFn(apiUrl, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const rawList = json?.epg_listings || [];

      const programs = rawList.map((p) => ({
        id: p.id,
        title: safeBase64Decode(p.title),
        desc: safeBase64Decode(p.description),
        startMs: toEpochMs(p.start_timestamp || p.start),
        stopMs: toEpochMs(p.stop_timestamp || p.end),
        nowPlaying: !!p.now_playing,
      }));

      // Salva no banco e memória
      this.store.setMeta(cacheKey, programs);
      this.mem.set(cacheKey, { at: now, data: programs });

      return this._formatEpg(programs, now);
    } catch {
      return null;
    }
  }

  /**
   * Identifica programa atual, progresso e próximos programas
   */
  _formatEpg(programs, now = Date.now()) {
    if (!programs || !programs.length) return null;

    // Busca o programa que está passando agora
    let current = programs.find((p) => p.nowPlaying);
    if (!current) {
      current = programs.find((p) => p.startMs <= now && now < p.stopMs);
    }
    if (!current) {
      current = programs[0];
    }

    let progress = 0;
    if (current && current.stopMs > current.startMs) {
      progress = Math.min(1, Math.max(0, (now - current.startMs) / (current.stopMs - current.startMs)));
    }

    const currentIdx = programs.indexOf(current);
    const next = currentIdx >= 0 && currentIdx + 1 < programs.length ? programs[currentIdx + 1] : null;

    return {
      current: current
        ? {
            title: current.title || 'Programação Geral',
            desc: current.desc || '',
            startMs: current.startMs,
            stopMs: current.stopMs,
            progress: Math.round(progress * 100) / 100,
          }
        : null,
      next: next
        ? {
            title: next.title || '',
            desc: next.desc || '',
            startMs: next.startMs,
            stopMs: next.stopMs,
          }
        : null,
      upcoming: programs.slice(currentIdx + 1, currentIdx + 6).map((p) => ({
        title: p.title,
        desc: p.desc,
        startMs: p.startMs,
        stopMs: p.stopMs,
      })),
    };
  }
}
