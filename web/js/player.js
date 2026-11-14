// Player em tela cheia: HLS (hls.js), TS ao vivo (mpegts.js) e arquivos mp4/webm (nativo).
import { api, ApiError, proxyAbs, setToken } from './api.js';
import { h, fmtTime, toast } from './dom.js';
import { setScope } from './nav.js';

const CFG = window.IPTV_CONFIG || {};
const libs = {};

function loadScript(urls, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (libs[globalName]) return libs[globalName];
  libs[globalName] = new Promise((resolve, reject) => {
    const tryNext = (i) => {
      if (i >= urls.length) { delete libs[globalName]; return reject(new Error('lib_unavailable')); }
      const s = document.createElement('script');
      s.src = urls[i];
      s.onload = () => (window[globalName] ? resolve(window[globalName]) : tryNext(i + 1));
      s.onerror = () => { s.remove(); tryNext(i + 1); };
      document.head.append(s);
    };
    tryNext(0);
  });
  return libs[globalName];
}
const loadHls = () => loadScript(CFG.hlsUrls || ['vendor/hls.min.js'], 'Hls');
const loadMpegts = () => loadScript(CFG.mpegtsUrls || ['vendor/mpegts.js'], 'mpegts');

/** Detecta o tipo real do stream pela URL e pelo kind retornado pelo servidor */
function resolveKind(kind, url) {
  if (kind && kind !== 'unknown') return kind;
  const u = (url || '').toLowerCase().split('?')[0];
  if (u.endsWith('.m3u8') || u.endsWith('.m3u')) return 'hls';
  if (u.endsWith('.ts') || u.includes('/ts/')) return 'ts';
  if (u.endsWith('.mp4')) return 'mp4';
  return 'ts'; // default para streams ao vivo desconhecidos
}

let current = null;
export const playerOpen = () => !!current;

/**
 * @param {{items:object[], index:number, heading?:string, onClose?:()=>void}} req
 */
export function openPlayer(req) {
  if (current) current.close();
  const items = req.items;
  let idx = Math.max(0, Math.min(req.index || 0, items.length - 1));
  let gen = 0;            // identifica a "sessão" de reprodução atual (ignora respostas atrasadas)
  let hls = null, mp = null;
  let retries = 0;
  let kind = 'mp4', live = false;
  let idleTimer = null, saveTimer = null;
  let closed = false;
  let startAt = 0;

  const video = h('video', { playsinline: true, autoplay: true, preload: 'auto' });
  const titleB = h('b', {}, '');
  const titleS = h('span', {}, '');
  const centerBox = h('div', { class: 'center' });
  const seekFill = h('div', { class: 'fl' });
  const seek = h('div', { class: 'seek', role: 'slider', 'aria-label': 'Posição' }, h('div', { class: 'tr' }, seekFill));
  const timeEl = h('span', { class: 'time' }, '');
  const btn = (label, text, fn) => h('button', { class: 'ib', 'aria-label': label, title: label, tabindex: '-1', onclick: (e) => { fn(); e.currentTarget.blur(); } }, text);
  const bPlay = btn('Pausar / continuar', '⏯', () => toggle());
  const bBack = btn('Voltar 10 s', '⏪ 10', () => skip(-10));
  const bFwd = btn('Avançar 10 s', '10 ⏩', () => skip(10));
  const bPrev = btn('Anterior', '⏮', () => step(-1));
  const bNext = btn('Próximo', '⏭', () => step(1));
  const bFav = btn('Favoritar', '☆', () => toggleFav());
  const bMute = btn('Som', '🔊', () => { video.muted = !video.muted; bMute.textContent = video.muted ? '🔇' : '🔊'; });
  const bFull = btn('Tela cheia', '⛶', () => fullscreen());
  const bClose = h('button', { class: 'ib', tabindex: '-1', 'aria-label': 'Fechar', title: 'Fechar (Esc)', onclick: () => close() }, '✕');

  const el = h('div', { id: 'player', tabindex: '-1' }, video,
    h('div', { class: 'ov' },
      h('div', { class: 'tb' }, bClose, h('div', { class: 'tt' }, titleB, titleS)),
      h('div', { class: 'bt' }, seek,
        h('div', { class: 'ctl' }, bPrev, bBack, bPlay, bFwd, bNext, timeEl, h('span', { class: 'spacer' }), bFav, bMute, bFull))),
    centerBox);
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  setScope(el);

  // ---------------------------------------------------------------- interface
  const cur = () => items[idx];
  function status(node) { centerBox.replaceChildren(...(node ? [node] : [])); }
  const busy = () => status(h('div', { class: 'spin' }));
  function showUi() {
    el.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!video.paused) el.classList.add('idle'); }, 3500);
  }
  function paint() {
    const it = cur();
    titleB.textContent = it.title;
    titleS.textContent = live ? 'AO VIVO' : req.heading || '';
    bFav.textContent = it.favorite ? '★' : '☆';
    bPrev.style.display = bNext.style.display = items.length > 1 ? '' : 'none';
    seek.style.display = bBack.style.display = bFwd.style.display = timeEl.style.display = live ? 'none' : '';

    if (live) {
      api('/epg?id=' + encodeURIComponent(it.id)).then((r) => {
        if (cur() !== it || !r?.epg?.current) return;
        const curProg = r.epg.current;
        const st = curProg.startMs ? new Date(curProg.startMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const en = curProg.stopMs ? new Date(curProg.stopMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        titleS.textContent = `🔴 No ar: ${curProg.title}${st && en ? ` (${st} - ${en})` : ''}` + (r.epg.next?.title ? `  ·  A seguir: ${r.epg.next.title}` : '');
      }).catch(() => { });
    }
  }
  function tick() {
    if (live) return;
    const d = video.duration;
    timeEl.textContent = Number.isFinite(d) ? `${fmtTime(video.currentTime * 1000)} / ${fmtTime(d * 1000)}` : fmtTime(video.currentTime * 1000);
    seekFill.style.width = Number.isFinite(d) && d > 0 ? `${(video.currentTime / d) * 100}%` : '0%';
  }

  // ---------------------------------------------------------------- ações
  function toggle() { if (video.paused) video.play().catch(() => { }); else video.pause(); showUi(); }
  function skip(sec) {
    if (live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + sec));
    tick(); showUi();
  }
  function step(dir) {
    if (items.length < 2) return;
    saveProgress();
    idx = (idx + dir + items.length) % items.length;
    retries = 0;
    start();
  }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (el.requestFullscreen?.() || Promise.resolve()).catch(() => { });
  }
  async function toggleFav() {
    const it = cur();
    try {
      if (it.favorite) await api('/favorites/' + encodeURIComponent(it.id), { method: 'DELETE' });
      else await api('/favorites', { method: 'POST', body: { id: it.type === 'episode' ? it.seriesId : it.id } });
      it.favorite = !it.favorite;
      paint();
      toast(it.favorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
    } catch { toast('Não foi possível favoritar'); }
  }
  function saveProgress() {
    const it = cur();
    if (live || !it || !Number.isFinite(video.duration) || video.duration < 1) return;
    const pos = Math.floor(video.currentTime * 1000), dur = Math.floor(video.duration * 1000);
    it.positionMs = pos; it.durationMs = dur;
    api('/progress', { method: 'POST', body: { id: it.id, positionMs: pos, durationMs: dur } }).catch(() => { });
  }

  // Salva o progresso automaticamente a cada 5 segundos para nunca perder o ponto exato
  saveTimer = setInterval(saveProgress, 5000);

  // ---------------------------------------------------------------- carregar
  function teardown() {
    try { hls?.destroy(); } catch { /* já destruído */ }
    try { mp?.pause(); mp?.unload(); mp?.detachMediaElement(); mp?.destroy(); } catch { /* já destruído */ }
    hls = mp = null;
    video.removeAttribute('src');
    video.load();
  }

  function fail(msg, canRetry = true) {
    status(h('div', {},
      h('div', { class: 'err', style: 'font-size:1.1rem;margin-bottom:12px' }, msg),
      h('div', { class: 'btns', style: 'justify-content:center' },
        canRetry ? h('button', { class: 'btn primary', onclick: () => { retries = 0; start(); } }, 'Tentar de novo') : null,
        h('button', { class: 'btn', onclick: () => close() }, 'Fechar'))));
    el.classList.remove('idle');
  }

  function reconnect(reason) {
    if (closed) return;
    if (live && retries < 5) {
      retries++;
      busy();
      const my = gen;
      setTimeout(() => { if (!closed && my === gen) start(true); }, 1200 * retries);
    } else {
      fail(reason || 'Não foi possível reproduzir.');
    }
  }

  async function start(isRetry = false) {
    const my = ++gen;
    const it = cur();
    live = it.type === 'live';
    paint();
    tick();
    if (!isRetry) busy();
    teardown();
    startAt = !live && it.positionMs > 10000 && it.durationMs > 0 && it.positionMs / it.durationMs < 0.95 ? it.positionMs / 1000 : 0;
    let info;
    try {
      info = await api('/web/play?id=' + encodeURIComponent(it.id));
    } catch (e) {
      if (closed || my !== gen) return;
      if (e instanceof ApiError && e.code === 'upstream_status') return reconnect(`O servidor do canal respondeu erro ${e.body.upstreamStatus || ''}.`);
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return fail('Seu acesso não está ativo. Volte e confira a validade.', false);
      return reconnect('Sem conexão com o painel.');
    }
    if (closed || my !== gen) return;
    kind = resolveKind(info.kind, it.url);
    if (info.token) setToken(info.token);
    const src = proxyAbs(info.src);
    try {
      if (kind === 'hls') await attachHls(src, my);
      else if (kind === 'ts') await attachTs(src, my);
      else if (kind === 'mp4' || kind === 'mkv') {
        video.src = src;
      } else {
        // Fallback: tenta ts primeiro para streams ao vivo
        if (live) await attachTs(src, my).catch(() => attachHls(src, my));
        else video.src = src;
      }
      if (closed || my !== gen) return;
      const p = video.play();
      if (p) p.catch(() => { if (!closed && my === gen) status(h('button', { class: 'btn primary', style: 'pointer-events:auto', onclick: () => { video.play(); status(null); } }, '▶ Assistir')); });
    } catch (e) {
      if (closed || my !== gen) return;
      if (e && e.message === 'lib_unavailable') return fail('Não consegui carregar o player de vídeo (hls.js/mpegts.js). Veja o README: coloque os arquivos em web/vendor ou libere o acesso ao CDN.', false);
      if (e && e.message === 'unsupported') return fail('Este navegador não consegue tocar este tipo de stream. Tente Chrome/Edge ou use o aplicativo Android TV.', false);
      reconnect('Falha ao iniciar o vídeo.');
    }
  }

  async function attachHls(src, my) {
    const native = video.canPlayType('application/vnd.apple.mpegurl');
    const Hls = await loadHls().catch(() => null);
    if (closed || my !== gen) return;
    if (!Hls || !Hls.isSupported()) {
      if (native) { video.src = src; return; } // Safari/iOS: HLS nativo
      throw new Error(Hls ? 'unsupported' : 'lib_unavailable');
    }
    hls = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 30, startPosition: startAt || -1, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 4 });
    let mediaRecovered = false;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal || closed || my !== gen) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return; }
      reconnect(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'A conexão com o canal caiu.' : 'Este vídeo não pôde ser decodificado.');
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  }

  async function attachTs(src, my) {
    const mpegts = await loadMpegts();
    if (closed || my !== gen) return;
    if (!mpegts.isSupported()) throw new Error('unsupported');
    mp = mpegts.createPlayer(
      { type: 'mpegts', isLive: live, url: src },
      {
        enableWorker: false,
        lazyLoad: false,
        enableStashBuffer: true,
        stashInitialSize: 384 * 1024,
        liveBufferLatencyChasing: false,
        autoCleanupSourceBuffer: true,
      }
    );
    mp.on(mpegts.Events.ERROR, () => { if (!closed && my === gen) reconnect('A conexão com o canal caiu.'); });
    mp.attachMediaElement(video);
    mp.load();
  }

  // ---------------------------------------------------------------- eventos do vídeo
  video.addEventListener('loadedmetadata', () => {
    if (startAt > 0 && Number.isFinite(video.duration)) {
      try {
        video.currentTime = startAt;
        toast(`Continuando em ${fmtTime(startAt * 1000)}`);
      } catch { /* sem seek */ }
    }
  });
  video.addEventListener('playing', () => { status(null); retries = 0; bPlay.textContent = '⏸'; showUi(); });
  video.addEventListener('pause', () => { bPlay.textContent = '▶'; el.classList.remove('idle'); saveProgress(); });
  video.addEventListener('waiting', () => { if (!video.paused) busy(); });
  video.addEventListener('canplay', () => { if (!video.paused) status(null); });
  video.addEventListener('timeupdate', tick);
  video.addEventListener('durationchange', tick);
  video.addEventListener('ended', () => {
    if (live) return reconnect('A transmissão terminou.');
    const it = cur();
    it.positionMs = it.durationMs = Math.floor(video.duration * 1000) || 1;
    api('/progress', { method: 'POST', body: { id: it.id, positionMs: it.positionMs, durationMs: it.durationMs } }).catch(() => { });
    if (it.type === 'episode' && idx < items.length - 1) { idx++; retries = 0; start(); }
    else close();
  });
  video.addEventListener('error', () => {
    if (closed || kind === 'hls' || kind === 'ts') return;
    const c = video.error && video.error.code;
    fail(c === 4 ? 'O navegador não consegue tocar este formato (comum em .mkv/.avi). Use o aplicativo Android TV, ou tente outro navegador.' : 'Erro ao reproduzir o vídeo.', c !== 4);
  });
  video.addEventListener('click', toggle);
  video.addEventListener('dblclick', fullscreen);

  seek.addEventListener('pointerdown', (e) => {
    const move = (ev) => {
      const r = seek.getBoundingClientRect();
      if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * video.duration;
      tick();
    };
    seek.setPointerCapture(e.pointerId);
    move(e);
    seek.addEventListener('pointermove', move);
    seek.addEventListener('pointerup', () => seek.removeEventListener('pointermove', move), { once: true });
  });

  // ---------------------------------------------------------------- teclado / controle remoto
  function onKey(e) {
    if (closed) return;
    const k = e.key;
    let handled = true;
    if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack') { if (document.fullscreenElement && k === 'Escape') return; close(); }
    else if (k === ' ' || k === 'Enter' || k === 'k' || k === 'MediaPlayPause') toggle();
    else if (k === 'MediaPlay') video.play().catch(() => { });
    else if (k === 'MediaPause') video.pause();
    else if (k === 'ArrowLeft' || k === 'MediaRewind') skip(-10);
    else if (k === 'ArrowRight' || k === 'MediaFastForward') skip(10);
    else if (k === 'j') skip(-10);
    else if (k === 'l') skip(10);
    else if (k === 'ArrowUp' || k === 'ChannelUp' || k === 'PageUp') { if (live || items.length > 1) step(-1); else { video.volume = Math.min(1, video.volume + 0.1); } }
    else if (k === 'ArrowDown' || k === 'ChannelDown' || k === 'PageDown') { if (live || items.length > 1) step(1); else { video.volume = Math.max(0, video.volume - 0.1); } }
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'm' || k === 'M') bMute.click();
    else if (k === 'ContextMenu' || k === 'MediaTrackNext') { if (k === 'MediaTrackNext') step(1); else toggleFav(); }
    else if (k === 'MediaTrackPrevious') step(-1);
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); showUi(); }
  }
  document.addEventListener('keydown', onKey, true);
  ['mousemove', 'pointerdown', 'touchstart'].forEach((ev) => el.addEventListener(ev, showUi, { passive: true }));

  saveTimer = setInterval(() => { if (!video.paused) saveProgress(); }, 15000);
  const onHide = () => { if (document.visibilityState === 'hidden') saveProgress(); };
  document.addEventListener('visibilitychange', onHide);

  function close() {
    if (closed) return;
    saveProgress();
    closed = true;
    gen++;
    clearInterval(saveTimer);
    clearTimeout(idleTimer);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onHide);
    teardown();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
    el.remove();
    document.body.style.overflow = '';
    setScope(document);
    current = null;
    req.onClose?.();
  }

  current = { close };
  el.focus();
  start();
  return current;
}
