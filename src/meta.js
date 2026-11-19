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

/**
 * Serviço Inteligente de Metadados e Sinopses / Spoilers (TMDB + Cache Ultrarrápido).
 * Fornece sinopse em pt-BR, pôster em alta resolução, backdrop/banner, nota, gêneros e ano.
 */
export class MetaService {
  constructor({ store, key = '', lang = 'pt-BR', fetchFn = fetch }) {
    this.store = store;
    this._key = key || '';
    this.lang = lang;
    this.fetchFn = fetchFn;
    this.memCache = new Map();
  }

  get key() {
    return this._key || '';
  }

  set key(val) {
    this._key = val && String(val).trim() ? String(val).trim() : '';
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

  async lookup(item) {
    if (!item) return null;
    if (!this.enabled) return null; // sem chave do TMDB: quem chama usa os dados do servidor
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
      let url =
        `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(cleanTitle)}` +
        `&language=${this.lang}&include_adult=false&api_key=${this.key}`;
      if (item.year) {
        url += type === 'movie' ? `&year=${item.year}` : `&first_air_date_year=${item.year}`;
      }

      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      let r = (data.results || [])[0];

      // Se não achou com o ano exato, tenta sem o filtro de ano
      if (!r && item.year) {
        try {
          const fallbackUrl = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(cleanTitle)}&language=${this.lang}&include_adult=false&api_key=${this.key}`;
          const fRes = await this.fetchFn(fallbackUrl, { signal: AbortSignal.timeout(4000) });
          if (fRes.ok) {
            const fData = await fRes.json();
            r = (fData.results || [])[0];
          }
        } catch {}
      }

      const genres = (r?.genre_ids || [])
        .map((id) => TMDB_GENRES[id])
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ');

      const value = r
        ? {
            overview: r.overview || 'Sinopse não disponível para este título.',
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
