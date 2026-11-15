// Telas do app. Cada função recebe o contêiner e o contexto { open, play, go }.
import { api, ApiError, imgUrl, identity, setToken, logout } from './api.js';
import { h, spinner, message, card, artImage, toast } from './dom.js';
import { focusFirst } from './nav.js';

const errText = (e) => (e instanceof ApiError && e.code === 'offline') ? 'Sem conexão com o painel.' : 'Não foi possível carregar. Tente de novo.';
const retry = (root, fn) => root.replaceChildren(message(''), h('div', { class: 'btns', style: 'justify-content:center' }, h('button', { class: 'btn', 'data-f': true, onclick: fn }, 'Tentar de novo')));

// ------------------------------------------------------------------ Helpers
async function toggleFav(it) {
  const id = it.type === 'episode' ? it.seriesId : it.id;
  if (it.favorite) await api('/favorites/' + encodeURIComponent(id), { method: 'DELETE' });
  else await api('/favorites', { method: 'POST', body: { id } });
  it.favorite = !it.favorite;
  toast(it.favorite ? 'Adicionado à Minha lista' : 'Removido da Minha lista');
}

function strip(title, items, ctx, opts = {}) {
  const s = h('div', { class: 'strip' });
  for (const it of items) s.append(card(it, ctx.open, { ...opts, sub: opts.sub?.(it) }));
  return h('section', { class: 'row' }, h('h2', {}, title), s);
}

/** Normalize synopsis: returns a clean string or empty string if unavailable */
function cleanSynopsis(text) {
  if (!text) return '';
  const t = text.trim();
  if (!t) return '';
  const BAD = [
    'sinopse não disponível para este título.',
    'sinopse não disponível',
    'sinopse não encontrada.',
    'sinopse não encontrada',
    'não disponível',
    'n/a',
  ];
  if (BAD.includes(t.toLowerCase())) return '';
  return t;
}

function defaultSynopsis(item) {
  const type = item.type === 'series' ? 'série' : item.type === 'movie' ? 'filme' : 'conteúdo';
  return `Aproveite este ${type} em alta definição. Clique em Assistir para começar.`;
}

// ------------------------------------------------------------------ Hero Block
function heroBlock(it, ctx) {
  const bg = h('div', { class: 'bg' });
  const u = imgUrl(it.logo);
  if (u) bg.style.backgroundImage = `url("${u.replace(/"/g, '%22')}")`;

  const resume = it.positionMs > 10000 && it.durationMs > 0;
  const pct = resume ? Math.min(100, Math.round(it.positionMs / it.durationMs * 100)) : 0;

  const typeLabels = { movie: 'FILME', series: 'SÉRIE', live: 'AO VIVO', episode: 'EPISÓDIO' };
  const typeBadge = h('span', {
    class: 'hero-type-badge',
    style: `background:${it.type === 'live' ? '#ef4444' : 'var(--accent)'};color:#fff;font-size:.7rem;font-weight:900;letter-spacing:.12em;padding:3px 10px;border-radius:4px;text-transform:uppercase`
  }, typeLabels[it.type] || it.type.toUpperCase());

  const synopsisEl = h('p', { class: 'hero-desc' }, '⌛ Carregando informações…');
  const ratingEl = h('span', { class: 'hero-rating', style: 'display:none' }, '');

  // Fetch meta asynchronously
  api('/meta?id=' + encodeURIComponent(it.id)).then((meta) => {
    if (!meta) {
      synopsisEl.textContent = defaultSynopsis(it);
      return;
    }
    const syn = cleanSynopsis(meta.overview);
    synopsisEl.textContent = syn || defaultSynopsis(it);
    if (meta.backdrop) bg.style.backgroundImage = `url("${meta.backdrop.replace(/"/g, '%22')}")`;
    if (meta.rating) {
      ratingEl.textContent = `⭐ ${meta.rating}`;
      ratingEl.style.display = 'inline-block';
    }
  }).catch(() => {
    synopsisEl.textContent = defaultSynopsis(it);
  });

  const metaRow = h('div', { class: 'sub', style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
    h('span', {}, [it.year, it.group].filter(Boolean).join(' · ')),
    ratingEl
  );

  // Play button (possibly with progress bar)
  let playBtnContent;
  if (resume && pct > 0) {
    const progressBar = h('div', { style: 'position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.3);border-radius:0 0 6px 6px;width:100%' },
      h('div', { style: `height:100%;width:${pct}%;background:var(--accent2);border-radius:inherit;transition:width .3s` })
    );
    playBtnContent = [h('span', {}, '▶ Continuar assistindo'), progressBar];
  } else {
    playBtnContent = '▶ Assistir';
  }

  const playBtn = h('button', {
    class: 'btn primary hero-play-btn',
    'data-f': true,
    style: 'position:relative;overflow:hidden',
    onclick: () => ctx.open(it, true)  // direct=true → opens player immediately
  }, ...(Array.isArray(playBtnContent) ? playBtnContent : [playBtnContent]));

  return h('section', { class: 'hero' }, bg,
    h('div', { class: 'in' },
      typeBadge,
      h('h1', {}, it.title),
      metaRow,
      synopsisEl,
      h('div', { class: 'btns' },
        playBtn,
        h('button', { class: 'btn', 'data-f': true, onclick: async (e) => { try { await toggleFav(it); e.currentTarget.textContent = it.favorite ? '✓ Na minha lista' : '＋ Minha lista'; } catch { toast('Não foi possível favoritar'); } } }, it.favorite ? '✓ Na minha lista' : '＋ Minha lista'),
        it.type === 'series' || it.type === 'movie' ? h('button', { class: 'btn', 'data-f': true, onclick: () => ctx.open(it) }, 'ⓘ Mais detalhes') : null
      )
    )
  );
}

// ------------------------------------------------------------------ Game Card
function gameCard(g, ctx, showDate = false) {
  const side = (name, crest) => {
    const box = h('div', { class: 'team' });
    const u = imgUrl(crest);
    if (u) box.append(h('img', { src: u, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.currentTarget.remove() }));
    box.append(h('span', {}, name));
    return box;
  };
  const isLive = !!g.isLive || /live|progress|in_play|paused/i.test(g.status || '');
  const mid = g.score && /\d/.test(g.score) ? g.score.replace(/\s*[-x:]\s*/, ' × ') : (g.time || 'A definir');
  const statusLabel = isLive ? (g.statusDetail || 'AO VIVO') : (g.statusDetail || g.time);

  let datePrefix = '';
  if (showDate && g.date) {
    const [y, m, d] = g.date.split('-');
    if (d && m) datePrefix = `${d}/${m} · `;
  }

  return h('div', { class: 'game' + (isLive ? ' is-live' : '') },
    h('div', { class: 'meta' },
      h('span', {}, `${datePrefix}${g.competition || 'Futebol'}`),
      isLive
        ? h('span', { class: 'tag live live-pulse' }, '🔴 AO VIVO')
        : h('span', { class: 'tag' }, statusLabel)
    ),
    h('div', { class: 'teams' },
      side(g.home, g.homeCrest),
      h('div', { class: 'vs' + (isLive ? ' live-score' : '') }, mid),
      side(g.away, g.awayCrest)
    ),
    g.channels && g.channels.length
      ? h('div', { class: 'chs' }, g.channels.slice(0, 6).map((c, i) =>
          h('button', { class: 'btn sm primary', 'data-f': true, title: c.title, onclick: () => ctx.play({ items: g.channels, index: i }) },
            '⚽ ' + (c.title.length > 22 ? c.title.slice(0, 21) + '…' : c.title)
          )
        ))
      : h('div', { class: 'hint' }, g.channelHint ? `Passa em: ${g.channelHint} (canal não encontrado na sua lista)` : 'Canal não informado')
  );
}

// ------------------------------------------------------------------ Início
export async function homePage(root, ctx) {
  root.replaceChildren(spinner());
  let data;
  try { data = await api('/home'); } catch (e) { return retry(root, () => homePage(root, ctx)); }
  const frag = document.createDocumentFragment();
  if (data.hero) frag.append(heroBlock(data.hero, ctx));

  // Continuar Assistindo
  const continueRow = data.rows.find(r => r.kind === 'continue');
  if (continueRow && continueRow.items.length) {
    frag.append(strip('▶ Continuar assistindo', continueRow.items, ctx, {
      wide: true,
      sub: (it) => {
        if (!it.durationMs || !it.positionMs) return '';
        const remMin = Math.max(1, Math.round((it.durationMs - it.positionMs) / 60000));
        return `${remMin} min restantes`;
      }
    }));
  }

  // Jogos
  if (data.games && data.games.length) {
    const s = h('div', { class: 'strip' });
    for (const g of data.games.slice(0, 8)) {
      const isLive = !!g.isLive || /live|progress|in_play|paused/i.test(g.status || '');
      s.append(h('button', { class: 'card wide', 'data-f': true, onclick: () => ctx.go('games') },
        h('div', { class: 'art', style: 'aspect-ratio:16/9;flex-direction:column;gap:6px;padding:8px;text-align:center' },
          isLive ? h('div', { class: 'live-pulse', style: 'font-size:.7rem;font-weight:900;color:#ef4444;letter-spacing:.1em;margin-bottom:4px' }, '🔴 AO VIVO') : null,
          h('div', { style: 'font-weight:800;font-size:1.4rem' }, g.time),
          h('div', { style: 'font-size:.85rem;font-weight:700' }, `${g.home} × ${g.away}`)),
        h('div', { class: 'cap' }, g.competition || 'Futebol', h('small', {}, g.channels.length ? g.channels[0].title : g.channelHint || ''))));
    }
    frag.append(h('section', { class: 'row' }, h('h2', {}, '⚽ Jogos em destaque'), s));
  }

  // Demais categorias
  for (const r of data.rows) {
    if (r.kind === 'continue') continue;
    frag.append(strip(r.title, r.items, ctx, { wide: r.kind === 'continue' }));
  }

  if (!data.hero && !data.rows.length) frag.append(message('Sua lista está vazia. Confira se sua playlist foi carregada.'));
  root.replaceChildren(frag);
  focusFirst(root);
}

// ------------------------------------------------------------------ Live Preview State
let activeLiveTeardown = null;
export function stopLivePreview() {
  if (typeof activeLiveTeardown === 'function') {
    try { activeLiveTeardown(); } catch { }
    activeLiveTeardown = null;
  }
}

// ------------------------------------------------------------------ Canais Ao Vivo
export async function livePage(root, ctx) {
  const catList = h('div', { class: 'live-cats' }, h('h3', {}, '📡 Categorias'));
  const searchInput = h('input', { type: 'search', placeholder: '🔍 Buscar canal…', autocomplete: 'off', 'aria-label': 'Buscar canal' });
  const chList = h('div', { class: 'live-list' });
  const listWrap = h('div', { class: 'live-list-wrap' },
    h('div', { class: 'live-search' }, searchInput),
    chList);

  const pvVideo = h('video', { playsinline: true, autoplay: true, muted: true, style: 'width:100%;height:100%;background:#000;object-fit:contain' });
  const pvBadge = h('div', { class: 'pv-live-badge live-pulse' }, '🔴 AO VIVO');
  const pvOv = h('div', { class: 'pv-ov' }, h('div', { class: 'pv-idle' }, h('span', {}, '📺'), 'Escolha um canal'));
  const pvPlayerBox = h('div', { class: 'live-player-box', style: 'cursor:pointer', title: 'Clique para abrir em tela cheia', onclick: () => pvFullBtn.click() }, pvVideo, pvBadge, pvOv);
  const pvTitle = h('span', { class: 'pv-title' }, 'Nenhum canal');
  const pvFavBtn = h('button', { title: 'Favoritar', style: 'font-size:1.1rem' }, '☆');
  const pvFullBtn = h('button', { class: 'pv-full', 'data-f': true }, '⛶ Tela Cheia');
  const pvBar = h('div', { class: 'pv-bar' }, pvTitle, pvFavBtn, pvFullBtn);
  const pvInfo = h('div', { class: 'pv-info' },
    h('div', { class: 'pv-no-ch' }, h('span', {}, '📡'), 'Selecione um canal para assistir'));
  const preview = h('div', { class: 'live-preview' }, pvPlayerBox, pvBar, pvInfo);

  root.replaceChildren(h('div', { class: 'live-layout' }, catList, listWrap, preview));

  let allChannels = [], allGroups = [], currentGroup = null, currentItem = null;
  let pvHls = null, pvMp = null, pvRetries = 0;
  const libs = {};

  function loadScript(urls, name) {
    if (window[name]) return Promise.resolve(window[name]);
    if (libs[name]) return libs[name];
    libs[name] = new Promise((res, rej) => {
      const try_ = (i) => {
        if (i >= urls.length) return rej(new Error('unavailable'));
        const s = document.createElement('script');
        s.src = urls[i];
        s.onload = () => window[name] ? res(window[name]) : try_(i + 1);
        s.onerror = () => { s.remove(); try_(i + 1); };
        document.head.append(s);
      };
      try_(0);
    });
    return libs[name];
  }

  function pvSetState(state, msg) {
    if (state === 'playing') {
      pvPlayerBox.classList.add('playing');
      pvBadge.style.display = 'block';
    } else {
      pvPlayerBox.classList.remove('playing');
      pvBadge.style.display = 'none';
    }
    if (state === 'loading') {
      pvOv.style.display = '';
      pvOv.replaceChildren(h('div', { class: 'pv-spin' }));
    } else if (state === 'idle') {
      pvOv.style.display = '';
      pvOv.replaceChildren(h('div', { class: 'pv-idle' }, h('span', {}, '📺'), msg || 'Escolha um canal'));
    } else if (state === 'error') {
      pvOv.style.display = '';
      pvOv.replaceChildren(h('div', { class: 'pv-err' }, msg || 'Erro ao carregar o canal.'));
    } else {
      pvOv.style.display = 'none';
    }
  }

  function pvTeardown() {
    pvPlayerBox.classList.remove('playing');
    pvBadge.style.display = 'none';
    try { pvHls?.destroy(); } catch { }
    try { pvMp?.pause(); pvMp?.unload(); pvMp?.detachMediaElement(); pvMp?.destroy(); } catch { }
    pvHls = pvMp = null;
    pvVideo.removeAttribute('src');
    pvVideo.load();
    pvRetries = 0;
  }
  activeLiveTeardown = pvTeardown;

  async function pvLoad(item) {
    pvSetState('loading');
    pvTeardown();
    let info;
    try { info = await api('/web/play?id=' + encodeURIComponent(item.id)); }
    catch (e) { pvSetState('error', 'Erro ao obter o stream.'); return; }
    const { kind, src, token } = info;
    if (token) setToken(token);
    const absUrl = src.startsWith('http') ? src : (window.location.origin + src);
    try {
      if (kind === 'hls') {
        const Hls = await loadScript(['vendor/hls.min.js'], 'Hls');
        if (Hls && Hls.isSupported()) {
          pvHls = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 20, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2 });
          pvHls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (pvRetries++ < 3) setTimeout(() => pvLoad(item), 2000); else pvSetState('error', 'Stream interrompido.'); } });
          pvHls.on(Hls.Events.MANIFEST_PARSED, () => pvVideo.play().catch(() => {}));
          pvHls.loadSource(absUrl);
          pvHls.attachMedia(pvVideo);
        } else {
          pvVideo.src = absUrl;
          pvVideo.play().catch(() => {});
        }
      } else if (kind === 'ts') {
        const mpegts = await loadScript(['vendor/mpegts.js'], 'mpegts');
        if (mpegts && mpegts.isSupported()) {
          pvMp = mpegts.createPlayer(
            { type: 'mpegts', isLive: true, url: absUrl },
            { enableWorker: false, liveBufferLatencyChasing: true, liveBufferLatencyMaxLatency: 10, liveBufferLatencyMinRemain: 2, lazyLoad: false }
          );
          pvMp.on(mpegts.Events.ERROR, () => {
            if (pvRetries++ < 3) setTimeout(() => pvLoad(item), 2500);
            else pvSetState('error', 'Stream interrompido.');
          });
          pvMp.attachMediaElement(pvVideo);
          pvMp.load();
          try { pvMp.play(); } catch { }
          pvVideo.play().catch(() => {});
        } else {
          pvSetState('error', 'Navegador não suporta este formato.');
        }
      } else {
        pvVideo.src = absUrl;
        pvVideo.play().catch(() => {});
      }
    } catch { pvSetState('error', 'Falha ao iniciar o player.'); }
  }

  pvVideo.addEventListener('playing', () => pvSetState('playing'));
  pvVideo.addEventListener('waiting', () => { if (!pvVideo.paused) pvSetState('loading'); });
  pvVideo.addEventListener('canplay', () => { if (!pvVideo.paused) pvSetState('playing'); });
  pvVideo.addEventListener('error', () => {
    if (pvRetries++ < 3 && currentItem) setTimeout(() => pvLoad(currentItem), 2500);
    else pvSetState('error', 'Erro de mídia.');
  });

  pvFullBtn.addEventListener('click', () => {
    pvTeardown();
    const filtered = currentGroup ? allChannels.filter(x => x.group === currentGroup) : allChannels;
    const idx = currentItem ? filtered.indexOf(currentItem) : 0;
    ctx.play({ items: filtered, index: Math.max(0, idx) });
  });

  function selectChannel(item) {
    if (currentItem === item) return;
    currentItem = item;
    pvRetries = 0;
    chList.querySelectorAll('.live-ch').forEach(el => el.classList.remove('active'));
    const el = chList.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
    pvTitle.textContent = item.title;
    pvFavBtn.textContent = item.favorite ? '★' : '☆';
    const epgBox = h('div', { class: 'pv-epg' }, h('span', { class: 'pv-epg-load' }, '📡 Consultando guia de programação (EPG)…'));
    pvInfo.replaceChildren(
      h('div', { class: 'pv-ch-name' }, item.title),
      h('div', { class: 'pv-ch-grp' }, item.group || ''),
      epgBox,
    );
    api('/epg?id=' + encodeURIComponent(item.id)).then((res) => {
      if (currentItem !== item) return;
      if (!res || !res.epg || !res.epg.current) {
        epgBox.replaceChildren(h('div', { class: 'pv-no-epg' }, 'Programação atual não informada'));
        return;
      }
      const cur = res.epg.current, next = res.epg.next;
      const startTime = cur.startMs ? new Date(cur.startMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const stopTime = cur.stopMs ? new Date(cur.stopMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const timeStr = startTime && stopTime ? ` (${startTime} - ${stopTime})` : '';
      epgBox.replaceChildren(
        h('div', { class: 'pv-now' },
          h('div', { class: 'pv-now-tag' }, '🔴 NO AR'),
          h('div', { class: 'pv-now-title' }, cur.title + timeStr),
          cur.desc ? h('div', { class: 'pv-now-desc' }, cur.desc) : null,
          cur.progress > 0 ? h('div', { class: 'pv-progress-bar' }, h('div', { class: 'pv-progress-fill', style: `width:${Math.round(cur.progress * 100)}%` })) : null
        ),
        next ? h('div', { class: 'pv-next' },
          h('span', { class: 'pv-next-tag' }, 'A SEGUIR:'),
          h('span', { class: 'pv-next-title' }, next.title)
        ) : null
      );
    }).catch(() => {
      if (currentItem === item) epgBox.replaceChildren(h('div', { class: 'pv-no-epg' }, 'Guia não disponível'));
    });
    pvLoad(item);
  }

  pvFavBtn.addEventListener('click', async () => {
    if (!currentItem) return;
    try { await toggleFav(currentItem); pvFavBtn.textContent = currentItem.favorite ? '★' : '☆'; }
    catch { toast('Não foi possível favoritar'); }
  });

  function buildChannelList(items) {
    chList.replaceChildren();
    if (!items.length) { chList.append(message('Nenhum canal encontrado.')); return; }
    items.forEach((it, i) => {
      const logo = h('div', { class: 'ch-logo' });
      const src = imgUrl(it.logo);
      if (src) {
        const img = h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => { img.replaceWith(h('div', { class: 'ch-ph' }, (it.title || '?').slice(0, 4))); }, { once: true });
        logo.append(img);
      } else {
        logo.append(h('div', { class: 'ch-ph' }, (it.title || '?').slice(0, 4)));
      }
      const el = h('button', {
        class: 'live-ch' + (it === currentItem ? ' active' : ''),
        'data-id': it.id, 'data-f': true, title: it.title,
        onclick: () => selectChannel(it),
        ondblclick: () => ctx.play({ items, index: i }),
      },
        logo,
        h('div', { class: 'ch-info' },
          h('div', { class: 'ch-name' }, it.title),
          h('div', { class: 'ch-sub' }, it.group || '')),
        h('span', { class: 'play-ic', title: 'Assistir em tela cheia', onclick: (e) => { e.stopPropagation(); pvTeardown(); ctx.play({ items, index: i }); } }, '▶'));
      chList.append(el);
    });
  }

  function filterChannels() {
    const q = searchInput.value.trim().toLowerCase();
    const base = currentGroup ? allChannels.filter(x => x.group === currentGroup) : allChannels;
    return q ? base.filter(x => (x.title || '').toLowerCase().includes(q)) : base;
  }

  function applyFilter() { buildChannelList(filterChannels()); }
  searchInput.addEventListener('input', applyFilter);

  function buildCats() {
    catList.querySelectorAll('.live-cat-btn').forEach(e => e.remove());
    const mk = (name, label, count) => {
      const btn = h('button', {
        class: 'live-cat-btn' + (currentGroup === name ? ' on' : ''), onclick: () => {
          currentGroup = name;
          catList.querySelectorAll('.live-cat-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
          searchInput.value = '';
          applyFilter();
        }
      }, label, count != null ? h('span', { class: 'cnt' }, String(count)) : null);
      return btn;
    };
    catList.append(mk(null, '📋 Todos', allChannels.length));
    for (const g of allGroups) {
      const icon = /esporte|sport|futebol|foot/i.test(g.name) ? '⚽' :
        /filme|movie|cine/i.test(g.name) ? '🎬' :
          /notícia|news|jornal/i.test(g.name) ? '📰' :
            /infantil|kids|cartoon/i.test(g.name) ? '🧒' :
              /série|series/i.test(g.name) ? '🎭' : '📺';
      catList.append(mk(g.name, `${icon} ${g.name}`, g.count));
    }
  }

  chList.replaceChildren(spinner());
  try {
    const r = await api('/browse?type=live&offset=0&limit=2000');
    allChannels = r.items || [];
    allGroups = r.groups || [];
    buildCats();
    buildChannelList(allChannels);
    if (allChannels.length) {
      const first = allChannels[0];
      currentItem = first;
      pvTitle.textContent = first.title;
      pvFavBtn.textContent = first.favorite ? '★' : '☆';
      pvInfo.replaceChildren(
        h('div', { class: 'pv-ch-name' }, first.title),
        h('div', { class: 'pv-ch-grp' }, first.group || ''),
      );
      pvLoad(first);
      const firstEl = chList.querySelector('.live-ch');
      if (firstEl) firstEl.classList.add('active');
    }
  } catch (e) {
    chList.replaceChildren(message(errText(e)));
  }
}

// ------------------------------------------------------------------ Catálogo Filmes / Séries
export async function vodPage(root, ctx, type) {
  const isMovie = type === 'movie';
  const label = isMovie ? 'Filmes' : 'Séries';
  const state = { group: null, offset: 0, total: 0, loading: false, search: '' };
  let allGroups = [];
  let shownItems = [];

  const searchInput = h('input', { type: 'search', placeholder: `🔍 Buscar ${label.toLowerCase()}…`, autocomplete: 'off', 'aria-label': `Buscar ${label}` });
  const resultsInfo = h('span', { class: 'vod-results' }, '');
  const toolbar = h('div', { class: 'vod-toolbar' }, searchInput, resultsInfo);
  const foldersWrap = h('div', {});
  const grid = h('div', { class: 'grid' });
  const moreBtn = h('div', { class: 'more' });
  const breadcrumb = h('div', { class: 'vod-breadcrumb' });
  root.replaceChildren(toolbar, breadcrumb, foldersWrap, grid, moreBtn);

  function catIcon(name) {
    if (!name) return '📂';
    const n = name.toLowerCase();
    if (/lançamento|2026|2025|estreia/.test(n)) return '🆕';
    if (/ação|action/.test(n)) return '💥';
    if (/comédia|comedy/.test(n)) return '😂';
    if (/drama/.test(n)) return '🎭';
    if (/terror|horror|medo/.test(n)) return '👻';
    if (/romance|amor/.test(n)) return '❤️';
    if (/animação|animation|anime/.test(n)) return '🎨';
    if (/infantil|kids|família|family/.test(n)) return '🧒';
    if (/documentário|doc/.test(n)) return '📽️';
    if (/netflix/.test(n)) return '🔴';
    if (/hbo|max/.test(n)) return '🟣';
    if (/prime|amazon/.test(n)) return '🔵';
    if (/disney/.test(n)) return '🏰';
    if (/esporte|sport|futebol/.test(n)) return '⚽';
    if (/luta|ufc|boxe|mma/.test(n)) return '🥊';
    if (/nacional|brasil/.test(n)) return '🇧🇷';
    if (/dorama|k-drama|coreano/.test(n)) return '🇰🇷';
    if (/suspense|thriller/.test(n)) return '🔍';
    if (/ficção|sci.fi/.test(n)) return '🚀';
    if (/western|faroeste/.test(n)) return '🤠';
    if (/musical|music/.test(n)) return '🎵';
    if (/guerra|war/.test(n)) return '⚔️';
    return isMovie ? '🎬' : '🎭';
  }

  function buildBreadcrumb() {
    breadcrumb.replaceChildren();
    const homeBtn = h('button', { 'data-f': true, onclick: () => { state.group = null; searchInput.value = ''; state.search = ''; renderFolders(); loadItems(true); } }, `${isMovie ? '🎬' : '🎭'} ${label}`);
    breadcrumb.append(homeBtn);
    if (state.group) {
      breadcrumb.append(h('span', { style: 'color:var(--dim2)' }, ' › '));
      breadcrumb.append(h('span', { class: 'cur' }, state.group));
    }
  }

  function renderFolders() {
    if (state.group || state.search) { foldersWrap.replaceChildren(); return; }
    if (!allGroups.length) { foldersWrap.replaceChildren(); return; }
    const fg = h('div', { class: 'folder-grid' });
    const totalAll = allGroups.reduce((s, g) => s + g.count, 0);
    fg.append(h('button', { class: 'folder-btn', 'data-f': true, onclick: () => { state.group = null; renderFolders(); loadItems(true); } },
      h('span', { class: 'fol-icon' }, isMovie ? '🎬' : '🎭'),
      h('span', { class: 'fol-name' }, `Todos os ${label}`),
      h('span', { class: 'fol-count' }, `${totalAll} itens`)));
    for (const g of allGroups) {
      const icon = catIcon(g.name);
      fg.append(h('button', { class: 'folder-btn', 'data-f': true, onclick: () => { state.group = g.name; renderFolders(); buildBreadcrumb(); loadItems(true); } },
        h('span', { class: 'fol-icon' }, icon),
        h('span', { class: 'fol-name' }, g.name.replace(/^(filmes|séries|series)\s*[-–]\s*/i, '').replace(/-PLUS$/i, '').trim()),
        h('span', { class: 'fol-count' }, `${g.count} itens`)));
    }
    foldersWrap.replaceChildren(fg);
  }

  async function loadItems(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.offset = 0; shownItems = []; grid.replaceChildren(spinner()); moreBtn.replaceChildren(); }
    try {
      let q = `/browse?type=${type}&offset=${state.offset}&limit=60`;
      if (state.group) q += '&group=' + encodeURIComponent(state.group);
      if (state.search) q += '&q=' + encodeURIComponent(state.search);
      const r = await api(q);
      if (!allGroups.length && r.groups) allGroups = r.groups;
      state.total = r.total;
      if (reset) grid.replaceChildren();
      for (const it of r.items) {
        shownItems.push(it);
        grid.append(card(it, ctx.open, {
          onMenu: async (x) => { try { await toggleFav(x); } catch { toast('Não foi possível favoritar'); } }
        }));
      }
      state.offset += r.items.length;
      resultsInfo.textContent = state.total ? `${state.total} ${label.toLowerCase()}` : '';
      if (!grid.childNodes.length) grid.append(message('Nada por aqui.'));
      moreBtn.replaceChildren();
      if (state.offset < state.total) {
        moreBtn.append(h('button', { class: 'btn', 'data-f': true, onclick: () => loadItems(false) },
          `Carregar mais (${state.total - state.offset})`));
      }
      if (reset) { buildBreadcrumb(); renderFolders(); focusFirst(grid); }
    } catch (e) {
      grid.replaceChildren(message(errText(e)));
      moreBtn.replaceChildren(h('button', { class: 'btn', 'data-f': true, onclick: () => loadItems(true) }, 'Tentar de novo'));
    } finally { state.loading = false; }
  }

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = searchInput.value.trim(); state.group = null; foldersWrap.replaceChildren(); loadItems(true); }, 350);
  });

  await loadItems(true);
}

// ------------------------------------------------------------------ Catálogo geral
export async function browsePage(root, ctx, type) {
  if (type === 'live') return livePage(root, ctx);
  return vodPage(root, ctx, type);
}

// ------------------------------------------------------------------ Favoritos
export async function favsPage(root, ctx) {
  root.replaceChildren(spinner());
  let r;
  try { r = await api('/favorites'); } catch (e) { return retry(root, () => favsPage(root, ctx)); }
  const frag = document.createDocumentFragment();
  const names = { live: 'Canais', movie: 'Filmes', series: 'Séries' };
  for (const t of ['live', 'movie', 'series']) {
    const list = r.items.filter((i) => i.type === t);
    if (!list.length) continue;
    const s = h('div', { class: 'grid' + (t === 'live' ? ' live' : '') });
    list.forEach((it, i) => s.append(card(it, t === 'live' ? () => ctx.play({ items: list, index: i }) : ctx.open, {
      onMenu: async (x) => { try { await toggleFav(x); favsPage(root, ctx); } catch { } },
    })));
    frag.append(h('section', { class: 'row' }, h('h2', {}, names[t]), s));
  }
  if (!r.items.length) frag.append(message('Sua lista está vazia. Em qualquer filme, série ou canal use ＋ Minha lista.'));
  root.replaceChildren(frag);
  focusFirst(root);
}

// ------------------------------------------------------------------ Jogos
export async function gamesPage(root, ctx) {
  root.replaceChildren(spinner());

  function getLocalDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const todayStr = getLocalDateStr();
  let currentSelection = todayStr;

  const navBar = h('div', { class: 'games-filter-bar', style: 'display:flex;gap:8px;margin-bottom:18px;align-items:center;flex-wrap:wrap' });
  const container = h('div', {});
  root.replaceChildren(h('div', {}, navBar, container));

  async function loadData(target) {
    currentSelection = target;
    updateButtonStyles();
    container.replaceChildren(spinner());
    try {
      if (target === 'live') {
        const r = await api('/games?date=all');
        renderContent(r, 'live');
      } else if (target === 'all') {
        const r = await api('/games?date=all');
        renderContent(r, 'all');
      } else {
        const r = await api(`/games?date=${target}`);
        renderContent(r, 'single');
      }
    } catch (e) { container.replaceChildren(message(errText(e))); }
  }

  function updateButtonStyles() {
    navBar.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('primary', b.getAttribute('data-target') === currentSelection);
    });
  }

  function buildFilterButtons() {
    navBar.replaceChildren();
    const today = new Date();
    const buttons = [
      { label: '⚽ Hoje', target: todayStr },
      { label: '🔴 Ao Vivo', target: 'live', isLiveBtn: true },
      { label: '🔥 Todos da Semana', target: 'all' },
    ];
    const offsets = [{ off: 1, label: 'Amanhã' }, { off: -1, label: 'Ontem' }, { off: 2 }, { off: 3 }];
    for (const o of offsets) {
      const d = new Date(today);
      d.setDate(today.getDate() + o.off);
      const iso = getLocalDateStr(d);
      const lbl = o.label || d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      buttons.push({ label: lbl, target: iso });
    }
    for (const b of buttons) {
      navBar.append(h('button', {
        class: 'btn' + (b.target === currentSelection ? ' primary' : '') + (b.isLiveBtn ? ' badge-live' : ''),
        'data-target': b.target, 'data-f': true,
        onclick: () => loadData(b.target),
      }, b.label));
    }
  }

  function renderContent(r, mode) {
    let list = r.games || [];
    let titleText = '';
    if (mode === 'live') {
      list = list.filter((g) => g.isLive);
      titleText = `🔴 Jogos em Andamento (${list.length})`;
    } else if (mode === 'all') {
      titleText = `🏆 Todos os Jogos da Semana (${list.length})`;
    } else {
      const [y, m, d] = (r.date || todayStr).split('-');
      titleText = `⚽ Jogos · ${d}/${m}/${y} (${list.length})`;
    }
    const title = h('div', { class: 'sec', style: 'padding-top:4px;display:flex;align-items:center;justify-content:space-between' },
      h('h2', {}, titleText),
      h('button', { class: 'btn sm', 'data-f': true, onclick: () => loadData(currentSelection) }, '↻ Atualizar placares')
    );
    if (!list.length) {
      const emptyMsg = mode === 'live'
        ? 'Nenhum jogo ao vivo no momento. Clique em "⚽ Hoje" ou "🔥 Todos da Semana" para ver os jogos agendados!'
        : 'Nenhum jogo encontrado para esta seleção. Use os botões acima para ver os outros dias!';
      container.replaceChildren(title, message(emptyMsg));
    } else {
      const showDateOnCard = mode === 'all' || mode === 'live';
      container.replaceChildren(title, h('div', { class: 'games' }, list.map((g) => gameCard(g, ctx, showDateOnCard))));
    }
    focusFirst(container);
  }

  buildFilterButtons();
  await loadData(currentSelection);
}

// ------------------------------------------------------------------ Busca
export function searchPage(root, ctx) {
  const out = h('div', {});
  let timer, seq = 0;
  const input = h('input', {
    type: 'search', placeholder: 'Buscar canais, filmes e séries…', 'data-f': true, autocomplete: 'off', 'aria-label': 'Buscar',
    oninput: () => { clearTimeout(timer); timer = setTimeout(run, 350); }
  });
  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) return out.replaceChildren(message('Digite pelo menos 2 letras.'));
    out.replaceChildren(spinner());
    try {
      const r = await api('/search?q=' + encodeURIComponent(q));
      if (my !== seq) return;
      const frag = document.createDocumentFragment();
      const names = { live: 'Canais', movie: 'Filmes', series: 'Séries' };
      for (const t of ['movie', 'series', 'live']) {
        if (!r[t].length) continue;
        const s = h('div', { class: 'strip' });
        r[t].forEach((it, i) => s.append(card(it, t === 'live' ? () => ctx.play({ items: r[t], index: i }) : ctx.open)));
        frag.append(h('section', { class: 'row' }, h('h2', {}, names[t]), s));
      }
      if (!frag.childNodes.length) frag.append(message('Nada encontrado.'));
      out.replaceChildren(frag);
    } catch (e) { if (my === seq) out.replaceChildren(message(errText(e))); }
  }
  root.replaceChildren(h('div', { class: 'search-wrap' }, input), out);
  out.append(message('Digite para buscar.'));
  input.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ Detalhe (filme / série)
export async function detailPage(root, ctx, base) {
  root.replaceChildren(spinner());
  let full;
  try {
    full = base.type === 'series'
      ? await api('/series/' + encodeURIComponent(base.id))
      : await api('/item/' + encodeURIComponent(base.id));
  } catch (e) {
    return root.replaceChildren(message(e instanceof ApiError && e.status === 404
      ? 'Item não encontrado (a lista pode ter mudado).'
      : errText(e)));
  }

  const detailBox = h('div', { class: 'detail', style: 'position:relative;overflow:hidden;border-radius:var(--radius);padding:24px;background:var(--card);transition:background-image 0.4s ease' });
  const poster = h('div', { class: 'poster' });
  artImage(full, poster);

  const synopsisTitle = h('h3', { style: 'margin-top:16px;margin-bottom:6px;font-size:1.05rem;color:var(--accent);font-weight:800' }, '📖 Sinopse / Detalhes');
  const synopsis = h('p', { style: 'font-size:.95rem;line-height:1.6;color:var(--txt);max-width:850px' }, '⌛ Carregando sinopse e detalhes…');
  const src = h('div', { class: 'src', style: 'margin-top:8px;font-size:.8rem;color:var(--dim)' });
  const tags = h('div', { class: 'tags' },
    [full.type === 'series' ? 'Série' : 'Filme', full.year, full.group,
     full.type === 'series' ? `${full.episodeCount} episódios` : null]
      .filter(Boolean).map((t) => h('span', {}, t))
  );
  const favBtn = h('button', {
    class: 'btn', 'data-f': true,
    onclick: async () => { try { await toggleFav(full); favBtn.textContent = full.favorite ? '✓ Na minha lista' : '＋ Minha lista'; } catch { toast('Não foi possível favoritar'); } }
  }, full.favorite ? '✓ Na minha lista' : '＋ Minha lista');

  const btns = h('div', { class: 'btns', style: 'margin:14px 0' });
  const epsBox = h('div', { class: 'eps' });

  let playBtn;
  if (full.type === 'movie') {
    const resume = full.positionMs > 10000 && full.durationMs > 0 && full.positionMs / full.durationMs < 0.95;
    playBtn = h('button', {
      class: 'btn primary', 'data-f': true,
      onclick: () => ctx.play({ items: [full], index: 0 })  // direct play, no detail re-render
    }, resume ? '▶ Continuar' : '▶ Assistir');
  }
  btns.append(...[playBtn, favBtn, h('button', { class: 'btn', 'data-f': true, onclick: ctx.back }, '← Voltar')].filter(Boolean));

  detailBox.append(poster, h('div', { class: 'info' }, h('h1', {}, full.title), tags, btns, synopsisTitle, synopsis, src));
  root.replaceChildren(detailBox, epsBox);

  // Fetch meta – handle bad / missing synopsis gracefully
  api('/meta?id=' + encodeURIComponent(full.id)).then((m) => {
    if (!m) {
      synopsis.textContent = defaultSynopsis(full);
      return;
    }
    const syn = cleanSynopsis(m.overview);
    synopsis.textContent = syn || defaultSynopsis(full);

    if (m.rating) {
      tags.prepend(h('span', { style: 'background:#f59e0b;color:#000;font-weight:800;border-radius:4px;padding:2px 8px;font-size:.82rem' }, `★ ${m.rating}`));
    }
    if (m.genres) tags.append(h('span', { style: 'color:var(--txt);font-weight:600' }, m.genres));
    if (m.backdrop) {
      detailBox.style.backgroundImage = `linear-gradient(to right, rgba(11,9,20,0.95) 0%, rgba(11,9,20,0.85) 45%, rgba(11,9,20,0.4) 100%), url(${m.backdrop})`;
      detailBox.style.backgroundSize = 'cover';
      detailBox.style.backgroundPosition = 'center';
    }
    if (m.poster) {
      const hiImg = new Image();
      hiImg.src = m.poster;
      hiImg.onload = () => { poster.replaceChildren(h('img', { src: m.poster, alt: '', style: 'width:100%;height:100%;object-fit:cover;border-radius:8px' })); };
    }
    src.textContent = 'Metadados: TMDB' + (m.rating ? ` · Nota ${m.rating}/10` : '') + (m.year ? ` · Ano ${m.year}` : '');
  }).catch(() => {
    synopsis.textContent = defaultSynopsis(full);
  });

  if (full.type === 'series') {
    const seasons = full.seasons || [];
    const all = seasons.flatMap((s) => s.episodes);
    const unfinished = (e) => !(e.durationMs > 0 && e.positionMs / e.durationMs > 0.95);
    const inProg = all.find((e) => e.positionMs > 10000 && unfinished(e));
    const lastDone = [...all].reverse().find((e) => !unfinished(e));
    const nextEp = inProg || (lastDone ? all[all.indexOf(lastDone) + 1] : null) || all[0];
    if (nextEp) {
      const label = `${inProg ? '▶ Continuar' : lastDone ? '▶ Próximo' : '▶ Assistir'} T${nextEp.season}E${nextEp.episode}`;
      btns.prepend(h('button', {
        class: 'btn primary', 'data-f': true,
        onclick: () => ctx.play({ items: all, index: all.indexOf(nextEp), heading: full.title })
      }, label));
    }
    let cur = nextEp ? nextEp.season : seasons[0]?.season;
    const chips = h('div', { class: 'chips', style: 'padding-left:0' });
    const list = h('div', {});
    const draw = () => {
      chips.replaceChildren(...seasons.map((s) =>
        h('button', {
          class: 'chip' + (s.season === cur ? ' on' : ''), 'data-f': true,
          onclick: () => { cur = s.season; draw(); }
        }, seasons.length === 1 && s.season === 0 ? 'Episódios' : `Temporada ${s.season}`)
      ));
      const s = seasons.find((x) => x.season === cur);
      list.replaceChildren(...(s ? s.episodes : []).map((ep) =>
        h('button', {
          class: 'ep', 'data-f': true,
          onclick: () => ctx.play({ items: all, index: all.indexOf(ep), heading: `${full.title} · T${ep.season}E${ep.episode}` })
        },
          h('span', { class: 'n' }, ep.episode),
          h('span', { class: 't' }, ep.title),
          ep.durationMs > 0 && ep.positionMs > 0
            ? h('span', { class: 'pg' }, h('i', { style: `width:${Math.min(100, ep.positionMs / ep.durationMs * 100)}%` }))
            : null
        )
      ));
    };
    draw();
    epsBox.append(chips, list);
  }

  (btns.querySelector('[data-f]') || root).focus?.({ preventScroll: true });
}

// ------------------------------------------------------------------ Conta
export async function accountPage(root, ctx, info) {
  const loggedUser = localStorage.getItem('iptv.logged_user') || info.name || 'Conectado';
  const stat = { active: 'Ativo', pending: 'Aguardando lista', expired: 'Expirado', blocked: 'Bloqueado' }[info.status] || info.status || 'Ativo';
  root.replaceChildren(h('div', { class: 'panel', style: 'max-width:500px' },
    h('h1', {}, 'Minha conta'),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Usuário'), h('dd', { class: 'mono' }, loggedUser),
      h('dt', {}, 'Status'), h('dd', {}, stat)),
    h('div', { class: 'btns', style: 'margin-top:20px' },
      h('button', {
        class: 'btn', 'data-f': true, onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await api('/refresh', { method: 'POST', body: {} }); toast('Lista atualizada com sucesso'); ctx.go('home'); }
          catch { toast('Lista atualizada!'); }
          finally { e.currentTarget.disabled = false; }
        }
      }, '↻ Atualizar lista'),
      h('button', {
        class: 'btn primary', 'data-f': true, onclick: () => { if (confirm('Deseja sair e trocar de usuário?')) logout(); }
      }, 'Sair da conta'))));
  focusFirst(root);
}
