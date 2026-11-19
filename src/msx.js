// Conteúdo para o aplicativo Media Station X (MSX): menu + listas em JSON, montados na hora a partir do Xtream.
// O MSX carrega "<servidor>/msx/start.json". Precisa de CORS aberto e de usuário/senha Xtream configurados no servidor.

const UA = 'VLC/3.0.20 LibVLC/3.0.20';
const CACHE_MS = 5 * 60_000;
const MAX_ITEMS = 600; // por lista (o MSX fica pesado com listas gigantes)

export function createMsx({ host, user, pass, liveFormat = 'm3u8', fetchImpl = fetch }) {
  const cache = new Map();
  const originNow = () => String(typeof host === 'function' ? host() : host || '').trim().replace(/\/+$/, '');
  const enc = encodeURIComponent;

  async function api(action, params = '') {
    const key = originNow() + action + params;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const r = await fetchImpl(`${originNow()}/player_api.php?username=${enc(user)}&password=${enc(pass)}&action=${action}${params}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error('provedor HTTP ' + r.status);
    const data = await r.json();
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return data;
  }

  const arr = (x) => (Array.isArray(x) ? x : []);
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const img = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined);

  const template = (kind) => ({
    type: 'separate',
    layout: kind === 'live' ? '0,0,3,2' : '0,0,2,3',
    color: 'msx-glass',
    imageFiller: kind === 'live' ? 'smart' : 'cover',
  });

  function page(headline, kind, items) {
    const list = items.slice(0, MAX_ITEMS);
    return { type: 'pages', headline: items.length > MAX_ITEMS ? `${headline} (${MAX_ITEMS} de ${items.length})` : headline, template: template(kind), items: list };
  }

  /** Categorias como cartões; abrir um leva à lista da categoria. */
  function catPage(base, headline, kind, cats, prefix) {
    return {
      type: 'pages', headline,
      template: { type: 'separate', layout: '0,0,3,2', color: 'msx-glass', icon: 'folder' },
      items: arr(cats).map((c) => ({ title: clean(c.category_name) || 'Sem categoria', action: `content:${base}/msx/${prefix}/${enc(c.category_id)}.json` })),
    };
  }

  const liveExt = (fmt) => (fmt === 'ts' ? 'ts' : 'm3u8');

  async function route(base, path, query = {}) {
    const fmt = liveExt(query.fmt || liveFormat);
    if (path === '/msx/start.json') {
      return { name: 'BoxTv', version: '1.0.0', parameter: `menu:${base}/msx/menu.json` };
    }
    if (path === '/msx/menu.json') {
      return {
        headline: 'BoxTv',
        menu: [
          { icon: 'live-tv', label: 'Ao vivo', data: `${base}/msx/live.json` },
          { icon: 'movie', label: 'Filmes', data: `${base}/msx/movies.json` },
          { icon: 'tv', label: 'Séries', data: `${base}/msx/series.json` },
        ],
      };
    }
    if (path === '/msx/live.json') return catPage(base, 'Ao vivo', 'live', await api('get_live_categories'), 'live');
    if (path === '/msx/movies.json') return catPage(base, 'Filmes', 'movie', await api('get_vod_categories'), 'movies');
    if (path === '/msx/series.json') return catPage(base, 'Séries', 'series', await api('get_series_categories'), 'series');
    let m;
    if ((m = /^\/msx\/live\/([^/]+)\.json$/.exec(path))) {
      const cat = decodeURIComponent(m[1]);
      const items = arr(await api('get_live_streams', `&category_id=${enc(cat)}`)).map((s) => ({
        title: clean(s.name) || 'Canal', image: img(s.stream_icon), playerLabel: clean(s.name),
        action: `video:${originNow()}/live/${enc(user)}/${enc(pass)}/${s.stream_id}.${fmt}`,
      }));
      return page('Canais', 'live', items);
    }
    if ((m = /^\/msx\/movies\/([^/]+)\.json$/.exec(path))) {
      const cat = decodeURIComponent(m[1]);
      const items = arr(await api('get_vod_streams', `&category_id=${enc(cat)}`)).map((s) => ({
        title: clean(s.name) || 'Filme', image: img(s.stream_icon), playerLabel: clean(s.name),
        action: `video:${originNow()}/movie/${enc(user)}/${enc(pass)}/${s.stream_id}.${clean(s.container_extension) || 'mp4'}`,
      }));
      return page('Filmes', 'movie', items);
    }
    if ((m = /^\/msx\/series\/([^/]+)\.json$/.exec(path))) {
      const cat = decodeURIComponent(m[1]);
      const items = arr(await api('get_series', `&category_id=${enc(cat)}`)).map((s) => ({
        title: clean(s.name) || 'Série', image: img(s.cover) || img(s.stream_icon),
        action: `content:${base}/msx/show/${enc(s.series_id)}.json`,
      }));
      return page('Séries', 'series', items);
    }
    if ((m = /^\/msx\/show\/([^/]+)\.json$/.exec(path))) {
      const id = decodeURIComponent(m[1]);
      const info = await api('get_series_info', `&series_id=${enc(id)}`);
      const eps = [];
      const raw = info && info.episodes;
      const seasons = Array.isArray(raw) ? raw.map((a, i) => [String(i + 1), a]) : Object.entries(raw || {});
      seasons.sort((a, b) => Number(a[0]) - Number(b[0]));
      for (const [season, list] of seasons) {
        for (const e of arr(list)) {
          const n = e.episode_num ?? '';
          eps.push({
            title: `T${season} E${n} · ${clean(e.title) || 'Episódio'}`.slice(0, 90),
            image: img(e.info && e.info.movie_image) || img(info.info && info.info.cover),
            playerLabel: `${clean(info.info && info.info.name)} T${season}E${n}`.trim(),
            action: `video:${originNow()}/series/${enc(user)}/${enc(pass)}/${e.id}.${clean(e.container_extension) || 'mp4'}`,
          });
        }
      }
      return page(clean(info.info && info.info.name) || 'Episódios', 'movie', eps);
    }
    return null;
  }

  return { route, api };
}
