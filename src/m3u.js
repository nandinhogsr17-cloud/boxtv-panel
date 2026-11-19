import { sha1 } from './util.js';

/** Normaliza texto para comparação: sem acento, minúsculo, só letras/números. */
export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ATTR_RE = /([A-Za-z0-9_-]+)="([^"]*)"/g;

/** Lê um arquivo M3U/M3U8 e devolve entradas {name, logo, group, tvgId, url}. */
export function parseM3U(text) {
  const out = [];
  let cur = null;
  let extGrp = '';
  const str = String(text || '');
  let start = 0;
  const len = str.length;

  while (start < len) {
    let end = str.indexOf('\n', start);
    if (end === -1) end = len;
    let line = str.slice(start, end).trim();
    start = end + 1;
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const attrs = {};
      const rest = line.slice(7).replace(ATTR_RE, (_, k, v) => {
        attrs[k.toLowerCase()] = v;
        return '';
      });
      const comma = rest.indexOf(',');
      const name = (comma >= 0 ? rest.slice(comma + 1) : '').trim();
      cur = {
        name: name || attrs['tvg-name'] || '',
        logo: (attrs['tvg-logo'] || '').trim(),
        group: (attrs['group-title'] || '').trim(),
        tvgId: (attrs['tvg-id'] || '').trim(),
      };
    } else if (line.startsWith('#EXTGRP:')) {
      extGrp = line.slice(8).trim();
    } else if (line.startsWith('#')) {
      continue;
    } else if (cur) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
        out.push({ ...cur, group: cur.group || extGrp, url: line });
      }
      cur = null;
      extGrp = '';
    }
  }
  return out;
}

const VIDEO_EXT = /\.(mp4|mkv|avi|mov|mpg|mpeg|wmv|flv|m4v)(\?|$)/i;
const MOVIE_GROUP = /\b(filme|filmes|movie|movies|vod|cinema|lancamento|lancamentos|cine)\b/;
const SERIES_GROUP = /\b(serie|series|novela|novelas|dorama|doramas|anime|animes|temporada)\b/;
const H24 = /\b24 ?h\b|\b24 ?hs\b|24 horas/;

const EP1 = /^(.*?)[\s._\-–|:]*\bS(\d{1,2})\s*[\s._-]?\s*E(\d{1,3})\b[\s._\-–|:]*(.*)$/i;
const EP2 = /^(.*?)[\s._\-–|:]*\b(\d{1,2})x(\d{2,3})\b[\s._\-–|:]*(.*)$/i;

/** "Breaking Bad S01E02 - Título" -> {series, season, episode, rest} */
export function parseEpisode(name) {
  const s = String(name || '');
  const m = EP1.exec(s) || EP2.exec(s);
  if (!m || !m[1].trim()) return null;
  return { series: m[1].trim(), season: Number(m[2]), episode: Number(m[3]), rest: (m[4] || '').trim() };
}

/** Decide se a entrada é canal ao vivo, filme ou série. */
export function classify(e) {
  const u = e.url.toLowerCase();
  const g = norm(e.group);
  if (u.includes('/series/')) return 'series';
  if (u.includes('/movie/')) return 'movie';
  if (u.includes('/live/')) return 'live';
  if (H24.test(g + ' ' + norm(e.name))) return 'live';
  const ep = parseEpisode(e.name);
  const streamy = /\.m3u8(\?|$)|\.ts(\?|$)/.test(u);
  if (ep && (VIDEO_EXT.test(u) || SERIES_GROUP.test(g) || !streamy)) return 'series';
  if (SERIES_GROUP.test(g) && VIDEO_EXT.test(u)) return 'movie';
  if (MOVIE_GROUP.test(g)) return 'movie';
  if (VIDEO_EXT.test(u)) return 'movie';
  return 'live';
}

const QUALITY = /\b(4k|uhd|fhd|hd|sd|1080p|720p|2160p|dublado|legendado|dual audio|dual|dub|leg|nacional|h264|h265|hevc)\b/gi;

/** Limpa título: tira colchetes, tags de qualidade/idioma e extrai o ano. */
export function cleanTitle(raw) {
  let s = String(raw || '');
  let year = null;
  const maxYear = new Date().getFullYear() + 1;
  s = s.replace(/\((\d{4})\)/g, (_, y) => {
    const n = Number(y);
    if (!year && n >= 1900 && n <= maxYear) year = n;
    return ' ';
  });
  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  s = s.replace(/^\s*\|[A-Za-z]{2,4}\|\s*/, '');
  s = s.replace(/^\s*(?:BR|PT|PTBR|EN|ES|LAT|MX|US|UK)\s*[:|-]\s*/i, '');
  s = s.replace(QUALITY, ' ');
  const ty = /\s((?:19|20)\d{2})\s*$/.exec(s);
  if (ty) {
    const n = Number(ty[1]);
    const rest = s.slice(0, ty.index).trim();
    if (rest && n >= 1900 && n <= maxYear) {
      if (!year) year = n;
      s = rest;
    }
  }
  s = s.replace(/\s+/g, ' ').replace(/[\s\-–:|._]+$/, '').replace(/^[\s\-–:|._]+/, '').trim();
  return { title: s || String(raw || '').trim(), year };
}

/** Item público (sem a lista de episódios) pronto para o app. */
export function pub(it, extra = {}) {
  const o = {
    id: it.id,
    type: it.type,
    title: it.title,
    group: it.group || '',
    logo: it.logo || null,
    year: it.year || null,
    url: it.url || null,
    favorite: false,
    positionMs: 0,
    durationMs: 0,
  };
  if (it.type === 'series') o.episodeCount = it.episodes.length;
  if (it.type === 'episode') {
    o.seriesId = it.seriesId;
    o.season = it.season;
    o.episode = it.episode;
  }
  return { ...o, ...extra };
}

const TYPE_ARRAY = { live: 'live', movie: 'movies', series: 'series' };

export class Catalog {
  constructor(input, replaceHost = null) {
    this.live = [];
    this.movies = [];
    this.series = [];
    this.byId = new Map();
    this._groups = {};
    const seriesMap = new Map();
    const seen = new Set();

    if (typeof input === 'string') {
      const str = input;
      const len = str.length;
      let cur = null;
      let extGrp = '';
      let start = 0;
      const ATTR_RE = /([A-Za-z0-9_-]+)="([^"]*)"/g;

      while (start < len) {
        let end = str.indexOf('\n', start);
        if (end === -1) end = len;
        let line = str.slice(start, end).trim();
        start = end + 1;
        if (!line) continue;

        if (line.startsWith('#EXTINF')) {
          const attrs = {};
          const rest = line.slice(7).replace(ATTR_RE, (_, k, v) => {
            attrs[k.toLowerCase()] = v;
            return '';
          });
          const comma = rest.indexOf(',');
          const name = (comma >= 0 ? rest.slice(comma + 1) : '').trim();
          cur = {
            name: name || attrs['tvg-name'] || '',
            logo: (attrs['tvg-logo'] || '').trim(),
            group: (attrs['group-title'] || '').trim(),
            tvgId: (attrs['tvg-id'] || '').trim(),
          };
        } else if (line.startsWith('#EXTGRP:')) {
          extGrp = line.slice(8).trim();
        } else if (line.startsWith('#')) {
          continue;
        } else if (cur) {
          if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
            let streamUrl = line;
            if (replaceHost && streamUrl.includes('//vujuva.online')) {
              streamUrl = streamUrl.replaceAll('//vujuva.online', '//' + replaceHost);
            }
            if (!seen.has(streamUrl)) {
              seen.add(streamUrl);
              const e = { ...cur, group: cur.group || extGrp, url: streamUrl };
              this._addEntry(e, seriesMap);
            }
          }
          cur = null;
          extGrp = '';
        }
      }
    } else if (Array.isArray(input)) {
      for (const e of input) {
        if (seen.has(e.url)) continue;
        seen.add(e.url);
        this._addEntry(e, seriesMap);
      }
    }

    for (const s of this.series) {
      s.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    }
  }

  _addEntry(e, seriesMap) {
    const kind = classify(e);
    const group = (e.group || '').trim() || 'Sem grupo';
    const logo = e.logo || '';
    const hash = sha1(e.url).slice(0, 12);

    if (kind === 'live') {
      const it = { id: 'l_' + hash, type: 'live', title: e.name || 'Canal', group, logo, url: e.url, tvgId: e.tvgId };
      this.live.push(it);
      this.byId.set(it.id, it);
    } else if (kind === 'movie') {
      const c = cleanTitle(e.name);
      const it = { id: 'v_' + hash, type: 'movie', title: c.title, year: c.year, group, logo, url: e.url };
      this.movies.push(it);
      this.byId.set(it.id, it);
    } else {
      const ep = parseEpisode(e.name);
      let sname;
      let year = null;
      let season = 1;
      let epn = null;
      let rest = '';
      if (ep) {
        const c = cleanTitle(ep.series);
        sname = c.title;
        year = c.year;
        season = ep.season;
        epn = ep.episode;
        rest = cleanTitle(ep.rest).title;
        if (!ep.rest) rest = '';
      } else {
        sname = cleanTitle(e.name).title;
      }
      const key = norm(sname);
      let s = seriesMap.get(key);
      if (!s) {
        s = { id: 's_' + sha1(key).slice(0, 12), type: 'series', title: sname, year, group, logo, episodes: [] };
        seriesMap.set(key, s);
        this.series.push(s);
        this.byId.set(s.id, s);
      }
      if (!s.logo && logo) s.logo = logo;
      if (!s.year && year) s.year = year;
      if (epn == null) epn = s.episodes.length + 1;
      const item = {
        id: 'e_' + hash,
        type: 'episode',
        seriesId: s.id,
        season,
        episode: epn,
        title: rest || `Episódio ${epn}`,
        url: e.url,
      };
      s.episodes.push(item);
      this.byId.set(item.id, item);
    }
  }

  stats() {
    return { live: this.live.length, movie: this.movies.length, series: this.series.length };
  }

  _arr(type) {
    const k = TYPE_ARRAY[type];
    if (!k) return [];
    return this[k];
  }

  groups(type) {
    if (this._groups[type]) return this._groups[type];
    const m = new Map();
    for (const it of this._arr(type)) m.set(it.group, (m.get(it.group) || 0) + 1);
    this._groups[type] = [...m].map(([name, count]) => ({ name, count }));
    return this._groups[type];
  }

  list(type, { group = null, q = '', offset = 0, limit = 60, exclude = null } = {}) {
    let arr = this._arr(type);
    if (group) arr = arr.filter((i) => i.group === group);
    if (exclude) arr = arr.filter((i) => !exclude(i));
    const tokens = norm(q).split(' ').filter(Boolean);
    if (tokens.length) {
      arr = arr.filter((i) => {
        const n = norm(i.title);
        return tokens.every((t) => n.includes(t));
      });
    }
    return { total: arr.length, items: arr.slice(offset, offset + limit) };
  }

  nextEpisode(ep) {
    const s = this.byId.get(ep.seriesId);
    if (!s) return null;
    const i = s.episodes.findIndex((x) => x.id === ep.id);
    return i >= 0 && i + 1 < s.episodes.length ? s.episodes[i + 1] : null;
  }
}
