import { norm } from './m3u.js';

const DAY = 24 * 3600 * 1000;
const TMDB_GENRES = {
  28: 'Ação',
  12: 'Aventura',
  16: 'Animação',
  35: 'Comédia',
  80: 'Crime',
  99: 'Documentário',
  18: 'Drama',
  10751: 'Família',
  14: 'Fantasia',
  36: 'História',
  27: 'Terror',
  10402: 'Música',
  9648: 'Mistério',
  10749: 'Romance',
  878: 'Ficção Científica',
  10770: 'Cinema TV',
  53: 'Suspense',
  10752: 'Guerra',
  37: 'Faroeste',
  10759: 'Ação e Aventura',
  10762: 'Infantil',
  10763: 'Notícias',
  10764: 'Reality',
  10765: 'Sci-Fi e Fantasia',
  10766: 'Novela',
  10767: 'Talk Show',
  10768: 'Guerra e Política',
};

const DEFAULT_TMDB_KEY = 'f090bb54758cabf231fb605d3e3e0468';

/**
 * Serviço Inteligente de Metadados e Sinopses / Spoilers (TMDB + Cache Ultrarrápido).
 * Fornece sinopse em pt-BR, pôster em alta resolução, backdrop/banner, nota, gêneros e ano.
 */
export class MetaService {
  constructor({ store, key = '', lang = 'pt-BR', fetchFn = fetch }) {
    this.store = store;
    this._key = key || DEFAULT_TMDB_KEY;
    this.lang = lang;
    this.fetchFn = fetchFn;
    this.memCache = new Map();
  }

  get key() {
    return this._key || DEFAULT_TMDB_KEY;
  }

  set key(val) {
    this._key = val && String(val).trim() ? String(val).trim() : DEFAULT_TMDB_KEY;
  }

  get enabled() {
    return !!this.key;
  }

  cleanTitle(rawTitle) {
    return (rawTitle || '')
      .replace(/^[\+\#\*\-\s]+/, '')
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/\b(4k|uhd|fhd|hd|sd|dublado|legendado|leg|dub|dual|audio|h264|h265|hevc|web-dl|bluray)\b/gi, '')
      .replace(/\s*S\d+\s*E\d+.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _simplifyTitle(title) {
    // Remove ano entre parênteses ou no fim, remove números do fim
    return title
      .replace(/\s*\(\d{4}\)\s*$/, '')
      .replace(/\s+\d{4}$/, '')
      .replace(/\s+\d+$/, '')
      .trim();
  }

  async _search(type, title, year, key) {
    let url =
      `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(title)}` +
      `&language=${this.lang}&include_adult=false&api_key=${key}`;
    if (year) {
      url += type === 'movie' ? `&year=${year}` : `&first_air_date_year=${year}`;
    }
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(6000) });
    if (res.status === 401) throw Object.assign(new Error('HTTP 401'), { status: 401 });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.results || [];
  }

  async lookup(item) {
    if (!item) return null;
    const type = item.type === 'series' ? 'tv' : 'movie';
    const cleanTitle = this.cleanTitle(item.title);
    if (!cleanTitle) return null;

    const cacheKey = `${type}:${norm(cleanTitle)}:${item.year || ''}`;

    if (this.memCache.has(cacheKey)) {
      return this.memCache.get(cacheKey);
    }

    const cached = this.store.getMeta(cacheKey);
    if (cached) {
      const ttl = cached.value ? 30 * DAY : 2 * DAY;
      if (Date.now() - cached.updatedAt < ttl) {
        this.memCache.set(cacheKey, cached.value);
        return cached.value;
      }
    }

    try {
      let activeKey = this.key;
      let results = [];

      // Tentativa 1: título limpo + ano + chave ativa
      try {
        results = await this._search(type, cleanTitle, item.year, activeKey);
      } catch (e) {
        if (e.status === 401) {
          // Chave inválida: fazer fallback para DEFAULT_TMDB_KEY
          activeKey = DEFAULT_TMDB_KEY;
          results = await this._search(type, cleanTitle, item.year, activeKey);
        } else {
          throw e;
        }
      }

      // Tentativa 2: sem filtro de ano
      if (!results.length && item.year) {
        try {
          results = await this._search(type, cleanTitle, null, activeKey);
        } catch {}
      }

      // Tentativa 3: título simplificado (remove números/ano do fim)
      if (!results.length) {
        const simplified = this._simplifyTitle(cleanTitle);
        if (simplified && simplified !== cleanTitle) {
          try {
            results = await this._search(type, simplified, null, activeKey);
          } catch {}
        }
      }

      const r = results[0] || null;

      const genres = (r?.genre_ids || [])
        .map((id) => TMDB_GENRES[id])
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ');

      const value = r
        ? {
            overview: r.overview && r.overview.trim() ? r.overview : 'Sem sinopse disponível neste idioma.',
            poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
            backdrop: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : null,
            rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
            voteCount: r.vote_count || null,
            genres: genres || null,
            year: Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || item.year || null,
          }
        : null;

      this.store.setMeta(cacheKey, value);
      this.memCache.set(cacheKey, value);
      return value;
    } catch {
      return null;
    }
  }
}
