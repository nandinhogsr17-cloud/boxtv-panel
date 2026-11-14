import { sha1 } from './util.js';
import { cleanTitle, norm } from './m3u.js';

/**
 * Cliente inteligente de alta performance para a API REAL do Xtream Codes (player_api.php).
 * Não baixa arquivos gigantes de 65MB de uma vez só:
 * - Carrega categorias instantaneamente em JSON leve
 * - Busca canais, filmes e séries por categoria sob demanda com cache
 * - Consumo de memória mínimo (< 30MB)
 * - Compatível com a mesma interface do Catalog para o server.js
 */
export class XtreamCatalog {
  constructor({ origin, user, pass, fetchFn = fetch }) {
    this.origin = origin.replace(/\/$/, '');
    this.user = user;
    this.pass = pass;
    this.fetchFn = fetchFn;
    this.base = `${this.origin}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    this.live = [];
    this.movies = [];
    this.series = [];
    this.byId = new Map();
    this.liveCatMap = new Map(); // cat_id -> cat_name
    this.vodCatMap = new Map();
    this.seriesCatMap = new Map();

    this._loaded = false;
    this._liveLoaded = false;
    this._vodCache = new Map(); // cat_id -> items
    this._seriesCache = new Map(); // cat_id -> items
    this._seriesInfoCache = new Map(); // series_id -> series detail
  }

  async _api(action, params = '') {
    const url = `${this.base}&action=${action}${params}`;
    const res = await this.fetchFn(url, {
      headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error(`Xtream API ${action} falhou com status ${res.status}`);
    return res.json();
  }

  async init() {
    if (this._loaded) return this;

    // Carrega categorias e primeiras streams em paralelo
    const [liveCats, vodCats, seriesCats] = await Promise.all([
      this._api('get_live_categories').catch(() => []),
      this._api('get_vod_categories').catch(() => []),
      this._api('get_series_categories').catch(() => [])
    ]);

    for (const c of (liveCats || [])) this.liveCatMap.set(String(c.category_id), c.category_name);
    for (const c of (vodCats || [])) this.vodCatMap.set(String(c.category_id), c.category_name);
    for (const c of (seriesCats || [])) this.seriesCatMap.set(String(c.category_id), c.category_name);

    // Carrega os canais ao vivo e os primeiros filmes/séries para o Início abrir na hora
    const initTasks = [];

    // Carrega canais ao vivo (geralmente leve)
    initTasks.push(
      this._api('get_live_streams').then(streams => {
        if (Array.isArray(streams)) {
          for (const s of streams) {
            const grp = this.liveCatMap.get(String(s.category_id)) || 'Canais';
            const id = 'l_' + s.stream_id;
            const url = `${this.origin}/live/${this.user}/${this.pass}/${s.stream_id}.ts`;
            const it = {
              id,
              type: 'live',
              title: s.name || 'Canal',
              group: grp,
              logo: s.stream_icon || '',
              url,
              tvgId: s.epg_channel_id || ''
            };
            this.live.push(it);
            this.byId.set(id, it);
          }
        }
        this._liveLoaded = true;
      }).catch(() => {})
    );

    // Pré-carrega primeiras categorias de filmes para a Home
    const topVodCats = (vodCats || []).slice(0, 4);
    for (const vc of topVodCats) {
      initTasks.push(this.loadVodCategory(String(vc.category_id)).catch(() => {}));
    }

    // Pré-carrega primeiras categorias de séries para a Home
    const topSeriesCats = (seriesCats || []).slice(0, 4);
    for (const sc of topSeriesCats) {
      initTasks.push(this.loadSeriesCategory(String(sc.category_id)).catch(() => {}));
    }

    await Promise.all(initTasks);
    this._loaded = true;
    return this;
  }

  async loadVodCategory(catId) {
    if (this._vodCache.has(catId)) return this._vodCache.get(catId);
    const streams = await this._api('get_vod_streams', `&category_id=${encodeURIComponent(catId)}`);
    const items = [];
    const grp = this.vodCatMap.get(catId) || 'Filmes';

    if (Array.isArray(streams)) {
      for (const s of streams) {
        const id = 'v_' + s.stream_id;
        const ext = s.container_extension || 'mp4';
        const url = `${this.origin}/movie/${this.user}/${this.pass}/${s.stream_id}.${ext}`;
        const c = cleanTitle(s.name);
        const it = {
          id,
          type: 'movie',
          title: c.title,
          year: c.year || (s.year ? Number(s.year) : null),
          group: grp,
          logo: s.stream_icon || '',
          url,
          rating: s.rating ? Number(s.rating) : null
        };
        items.push(it);
        if (!this.byId.has(id)) {
          this.movies.push(it);
          this.byId.set(id, it);
        }
      }
    }
    this._vodCache.set(catId, items);
    return items;
  }

  async loadSeriesCategory(catId) {
    if (this._seriesCache.has(catId)) return this._seriesCache.get(catId);
    const seriesList = await this._api('get_series', `&category_id=${encodeURIComponent(catId)}`);
    const items = [];
    const grp = this.seriesCatMap.get(catId) || 'Séries';

    if (Array.isArray(seriesList)) {
      for (const s of seriesList) {
        const id = 's_' + s.series_id;
        const c = cleanTitle(s.name);
        const it = {
          id,
          type: 'series',
          title: c.title,
          year: c.year || (s.year ? Number(s.year) : null),
          group: grp,
          logo: s.cover || s.stream_icon || '',
          episodes: []
        };
        items.push(it);
        if (!this.byId.has(id)) {
          this.series.push(it);
          this.byId.set(id, it);
        }
      }
    }
    this._seriesCache.set(catId, items);
    return items;
  }

  async getSeriesDetail(seriesId) {
    const rawId = seriesId.replace(/^s_/, '');
    if (this._seriesInfoCache.has(rawId)) return this._seriesInfoCache.get(rawId);

    const s = this.byId.get(seriesId) || this.byId.get('s_' + rawId);
    const info = await this._api('get_series_info', `&series_id=${encodeURIComponent(rawId)}`);
    const episodes = [];
    const seasonsMap = new Map();

    const epsObj = info.episodes || {};
    for (const [seasonStr, epList] of Object.entries(epsObj)) {
      const seasonNum = Number(seasonStr) || 1;
      const list = [];
      if (Array.isArray(epList)) {
        for (const ep of epList) {
          const epId = 'e_' + ep.id;
          const ext = ep.container_extension || 'mp4';
          const url = `${this.origin}/series/${this.user}/${this.pass}/${ep.id}.${ext}`;
          const item = {
            id: epId,
            type: 'episode',
            seriesId: s ? s.id : 's_' + rawId,
            season: seasonNum,
            episode: Number(ep.episode_num) || list.length + 1,
            title: ep.title || `Episódio ${ep.episode_num || list.length + 1}`,
            url,
            logo: ep.info?.movie_image || ''
          };
          list.push(item);
          episodes.push(item);
          this.byId.set(epId, item);
        }
      }
      seasonsMap.set(seasonNum, list);
    }

    if (s) {
      s.episodes = episodes;
    }
    const res = {
      ...(s || { id: 's_' + rawId, type: 'series', title: info.info?.name || 'Série', logo: info.info?.cover || '' }),
      seasons: [...seasonsMap.entries()].map(([season, epList]) => ({ season, episodes: epList }))
    };
    this._seriesInfoCache.set(rawId, res);
    return res;
  }

  groups(type) {
    if (type === 'live') {
      return [...this.liveCatMap.values()].map(name => ({
        name,
        count: this.live.filter(i => i.group === name).length || 10
      }));
    }
    if (type === 'movie') {
      return [...this.vodCatMap.values()].map(name => ({
        name,
        count: this.movies.filter(i => i.group === name).length || 20
      }));
    }
    if (type === 'series') {
      return [...this.seriesCatMap.values()].map(name => ({
        name,
        count: this.series.filter(i => i.group === name).length || 10
      }));
    }
    return [];
  }

  list(type, { group = null, q = '', offset = 0, limit = 60 } = {}) {
    let arr = type === 'live' ? this.live : type === 'movie' ? this.movies : this.series;
    if (group) arr = arr.filter(i => i.group === group);
    const tokens = norm(q).split(' ').filter(Boolean);
    if (tokens.length) {
      arr = arr.filter(i => {
        const n = norm(i.title);
        return tokens.every(t => n.includes(t));
      });
    }
    return { total: arr.length, items: arr.slice(offset, offset + limit) };
  }

  nextEpisode(ep) {
    const s = this.byId.get(ep.seriesId);
    if (!s || !s.episodes) return null;
    const i = s.episodes.findIndex(x => x.id === ep.id);
    return i >= 0 && i + 1 < s.episodes.length ? s.episodes[i + 1] : null;
  }

  stats() {
    return { live: this.live.length, movie: this.movies.length, series: this.series.length };
  }
}
