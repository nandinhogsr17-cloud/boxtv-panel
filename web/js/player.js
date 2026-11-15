// Player em tela cheia: HLS (hls.js), TS ao vivo (mpegts.js) e arquivos mp4/webm (nativo).
// Reescrito completamente: autoplay imediato, controles avançados, visual moderno, Android TV.
import { api, ApiError, proxyAbs, setToken } from './api.js';
import { h, fmtTime, toast } from './dom.js';
import { setScope } from './nav.js';

const CFG = window.IPTV_CONFIG || {};
const libs = {};

/* ─────────────────────────── lib loader ─────────────────────────── */
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
const loadHls    = () => loadScript(CFG.hlsUrls    || ['vendor/hls.min.js'], 'Hls');
const loadMpegts = () => loadScript(CFG.mpegtsUrls || ['vendor/mpegts.js'], 'mpegts');

/* ─────────────────────────── helpers ────────────────────────────── */
function resolveKind(kind, url) {
  if (kind && kind !== 'unknown') return kind;
  const u = (url || '').toLowerCase().split('?')[0];
  if (u.endsWith('.m3u8') || u.endsWith('.m3u')) return 'hls';
  if (u.endsWith('.ts') || u.includes('/ts/')) return 'ts';
  if (u.endsWith('.mp4')) return 'mp4';
  return 'ts';
}

function fmt(secs) {
  if (!Number.isFinite(secs) || secs < 0) return '00:00';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ─────────────────────────── inline styles ──────────────────────── */
function injectStyles() {
  if (document.getElementById('bxtv-player-styles')) return;
  const css = `
/* ═══════════ BOXTV PLAYER ═══════════ */
#bxtv-player {
  position:fixed; inset:0; z-index:9999;
  background:#000;
  display:flex; align-items:center; justify-content:center;
  font-family:'Inter','Poppins',system-ui,sans-serif;
  opacity:0; transition:opacity .25s ease;
}
#bxtv-player.ready { opacity:1; }
#bxtv-player video {
  width:100%; height:100%; object-fit:contain; display:block;
}

/* ── overlay wrapper ── */
#bxtv-player .bx-ov {
  position:absolute; inset:0;
  display:flex; flex-direction:column; justify-content:space-between;
  pointer-events:none;
  opacity:1; transition:opacity .4s ease;
}
#bxtv-player.idle .bx-ov { opacity:0; }
#bxtv-player .bx-ov * { pointer-events:auto; }

/* ── top bar ── */
#bxtv-player .bx-top {
  padding:14px 18px 60px;
  background:linear-gradient(to bottom,rgba(0,0,0,.85) 0%,transparent 100%);
  display:flex; align-items:flex-start; gap:12px;
}
#bxtv-player .bx-top-info { flex:1; min-width:0; }
#bxtv-player .bx-title {
  font-family:'Poppins',sans-serif; font-size:1.1rem; font-weight:700;
  color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#bxtv-player .bx-sub {
  font-size:.78rem; color:#ccc; margin-top:3px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:70vw;
}
#bxtv-player .bx-badge-live {
  display:inline-flex; align-items:center; gap:5px;
  background:#e53935; color:#fff; font-size:.7rem; font-weight:700;
  padding:3px 8px; border-radius:4px; letter-spacing:.05em;
  animation:bxPulse 1.5s ease-in-out infinite;
}
@keyframes bxPulse { 0%,100%{opacity:1} 50%{opacity:.55} }

/* ── bottom bar ── */
#bxtv-player .bx-bot {
  padding:50px 14px 10px;
  background:linear-gradient(to top,rgba(0,0,0,.88) 0%,transparent 100%);
}

/* ── seek bar ── */
#bxtv-player .bx-seek-wrap {
  position:relative; height:18px; display:flex; align-items:center; cursor:pointer;
  margin-bottom:4px;
}
#bxtv-player .bx-seek-track {
  position:relative; width:100%; height:4px; background:rgba(255,255,255,.25);
  border-radius:4px; overflow:hidden; transition:height .15s;
}
#bxtv-player .bx-seek-wrap:hover .bx-seek-track { height:6px; }
#bxtv-player .bx-seek-fill {
  position:absolute; left:0; top:0; height:100%;
  background:linear-gradient(90deg,#7c3aed,#a855f7);
  border-radius:4px; width:0%; transition:width .1s linear;
  pointer-events:none;
}
#bxtv-player .bx-seek-thumb {
  position:absolute; top:50%; width:14px; height:14px;
  background:#a855f7; border-radius:50%; transform:translate(-50%,-50%) scale(0);
  transition:transform .15s; pointer-events:none; left:0%;
}
#bxtv-player .bx-seek-wrap:hover .bx-seek-thumb { transform:translate(-50%,-50%) scale(1); }
#bxtv-player .bx-seek-tooltip {
  position:absolute; bottom:28px; transform:translateX(-50%);
  background:rgba(0,0,0,.85); color:#fff; font-size:.72rem; padding:3px 7px;
  border-radius:5px; white-space:nowrap; pointer-events:none;
  display:none; left:0%;
}
#bxtv-player .bx-seek-wrap:hover .bx-seek-tooltip { display:block; }

/* ── controls row ── */
#bxtv-player .bx-ctl {
  display:flex; align-items:center; gap:4px; flex-wrap:wrap;
}
#bxtv-player .bx-ib {
  background:none; border:none; cursor:pointer;
  color:#e0e0ff; font-size:1.1rem; padding:6px 8px; border-radius:8px;
  line-height:1; transition:background .15s, color .15s, transform .1s;
  flex-shrink:0;
}
#bxtv-player .bx-ib:hover { background:rgba(124,58,237,.35); color:#fff; transform:scale(1.12); }
#bxtv-player .bx-ib:active { transform:scale(.95); }
#bxtv-player .bx-ib.bx-active { color:#a855f7; }
#bxtv-player .bx-spacer { flex:1; }
#bxtv-player .bx-time {
  font-size:.78rem; color:#ccc; white-space:nowrap; padding:0 4px; align-self:center;
}

/* ── volume ── */
#bxtv-player .bx-vol-wrap {
  position:relative; display:flex; align-items:center;
}
#bxtv-player .bx-vol-slider-wrap {
  position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%);
  background:rgba(10,10,20,.92); border:1px solid rgba(255,255,255,.12);
  border-radius:10px; padding:10px 8px; display:flex; flex-direction:column;
  align-items:center; gap:6px;
  opacity:0; pointer-events:none; transition:opacity .2s;
}
#bxtv-player .bx-vol-wrap:hover .bx-vol-slider-wrap,
#bxtv-player .bx-vol-slider-wrap:hover { opacity:1; pointer-events:auto; }
#bxtv-player .bx-vol-pct { font-size:.7rem; color:#ccc; }
#bxtv-player input[type=range].bx-vol-range {
  -webkit-appearance:none; appearance:none;
  writing-mode:vertical-lr; direction:rtl;
  width:4px; height:80px; cursor:pointer;
  background:transparent;
}
#bxtv-player input[type=range].bx-vol-range::-webkit-slider-runnable-track {
  background:rgba(255,255,255,.2); border-radius:4px; width:4px;
}
#bxtv-player input[type=range].bx-vol-range::-webkit-slider-thumb {
  -webkit-appearance:none; width:14px; height:14px;
  background:#a855f7; border-radius:50%; margin-left:-5px;
}
#bxtv-player input[type=range].bx-vol-range::-moz-range-track {
  background:rgba(255,255,255,.2); border-radius:4px; width:4px;
}
#bxtv-player input[type=range].bx-vol-range::-moz-range-thumb {
  width:14px; height:14px; background:#a855f7; border:none; border-radius:50%;
}

/* ── popup menus (speed/quality) ── */
#bxtv-player .bx-popup-btn {
  position:relative; display:inline-flex;
}
#bxtv-player .bx-popup-menu {
  position:absolute; bottom:calc(100% + 8px); right:0;
  background:rgba(10,10,20,.95); border:1px solid rgba(255,255,255,.12);
  border-radius:10px; overflow:hidden; min-width:110px;
  display:none; flex-direction:column;
  box-shadow:0 8px 32px rgba(0,0,0,.7);
}
#bxtv-player .bx-popup-menu.open { display:flex; }
#bxtv-player .bx-popup-menu button {
  background:none; border:none; color:#e0e0ff; padding:9px 16px;
  font-size:.82rem; text-align:left; cursor:pointer; transition:background .12s;
}
#bxtv-player .bx-popup-menu button:hover { background:rgba(124,58,237,.35); }
#bxtv-player .bx-popup-menu button.selected { color:#a855f7; font-weight:600; }

/* ── spinner ── */
#bxtv-player .bx-spin-wrap {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  pointer-events:none;
}
#bxtv-player .bx-spinner {
  width:52px; height:52px; position:relative;
}
#bxtv-player .bx-spinner::before,
#bxtv-player .bx-spinner::after {
  content:''; position:absolute; border-radius:50%; border:3px solid transparent;
}
#bxtv-player .bx-spinner::before {
  inset:0; border-top-color:#7c3aed; animation:bxSpin1 .9s linear infinite;
}
#bxtv-player .bx-spinner::after {
  inset:8px; border-bottom-color:#a855f7; animation:bxSpin2 .7s linear infinite reverse;
}
@keyframes bxSpin1 { to { transform:rotate(360deg) } }
@keyframes bxSpin2 { to { transform:rotate(360deg) } }

/* ── autoplay-blocked overlay ── */
#bxtv-player .bx-play-overlay {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.55);
}
#bxtv-player .bx-play-overlay button {
  background:linear-gradient(135deg,#7c3aed,#a855f7);
  border:none; color:#fff; font-size:1.2rem; font-weight:700;
  padding:16px 36px; border-radius:14px; cursor:pointer;
  box-shadow:0 8px 32px rgba(124,58,237,.5);
  transition:transform .15s, box-shadow .15s;
}
#bxtv-player .bx-play-overlay button:hover {
  transform:scale(1.06); box-shadow:0 12px 40px rgba(124,58,237,.7);
}

/* ── close button ── */
#bxtv-player .bx-close {
  background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.18);
  color:#fff; font-size:1.1rem; width:36px; height:36px;
  border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:background .15s, transform .1s;
}
#bxtv-player .bx-close:hover { background:rgba(255,60,60,.5); transform:scale(1.12); }
`;
  const style = document.createElement('style');
  style.id = 'bxtv-player-styles';
  style.textContent = css;
  document.head.append(style);
}

/* ─────────────────────────── state ──────────────────────────────── */
let current = null;
export const playerOpen = () => !!current;

/* ─────────────────────────── main export ────────────────────────── */
/**
 * @param {{items:object[], index:number, heading?:string, onClose?:()=>void}} req
 */
export function openPlayer(req) {
  if (current) current.close();
  injectStyles();

  const items  = req.items;
  let idx      = Math.max(0, Math.min(req.index || 0, items.length - 1));
  let gen      = 0;
  let hls      = null, mp = null;
  let retries  = 0;
  let kind     = 'mp4', live = false;
  let idleTimer = null, saveTimer = null;
  let closed   = false;
  let startAt  = 0;
  let currentSpeed = 1;
  let isSeeking = false;

  /* ── video element ── */
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  Object.assign(video.style, { width:'100%', height:'100%', objectFit:'contain', display:'block' });

  /* ── spinner ── */
  const spinWrap = h('div', { class:'bx-spin-wrap' }, h('div', { class:'bx-spinner' }));

  /* ── autoplay blocked overlay ── */
  const playOverlay = (() => {
    const wrap = h('div', { class:'bx-play-overlay', style:'display:none' });
    const pbtn = h('button', {}, '▶ Iniciar Reprodução');
    pbtn.addEventListener('click', () => {
      video.muted = false;
      video.play().catch(() => {});
      wrap.style.display = 'none';
    });
    wrap.append(pbtn);
    return wrap;
  })();

  /* ── seek bar ── */
  const seekFill    = h('div', { class:'bx-seek-fill' });
  const seekThumb   = h('div', { class:'bx-seek-thumb' });
  const seekTip     = h('div', { class:'bx-seek-tooltip' }, '0:00');
  const seekTrack   = h('div', { class:'bx-seek-track' }, seekFill, seekThumb);
  const seekWrap    = h('div', { class:'bx-seek-wrap', role:'slider', 'aria-label':'Posição' }, seekTip, seekTrack);

  /* ── time display ── */
  const timeEl = h('span', { class:'bx-time' }, '');

  /* ── helper: icon button ── */
  const ib = (label, text, fn, extraClass = '') => {
    const b = h('button', {
      class: 'bx-ib' + (extraClass ? ' ' + extraClass : ''),
      'aria-label': label, title: label, tabindex: '-1'
    }, text);
    b.addEventListener('click', (e) => { fn(); e.currentTarget.blur(); });
    return b;
  };

  /* ── controls ── */
  const bPlay   = ib('Pausar / Continuar (Espaço)', '⏸', () => toggle());
  const bPrev   = ib('Anterior (↑)',  '⏮', () => step(-1));
  const bNext   = ib('Próximo (↓)',   '⏭', () => step(1));
  const bBack10 = ib('Voltar 10s (←)',   '◀ 10s', () => skip(-10));
  const bFwd10  = ib('Avançar 10s (→)',  '10s ▶', () => skip(10));
  const bBack30 = ib('Voltar 30s',       '⏪ 30s', () => skip(-30));
  const bFwd30  = ib('Avançar 30s',      '30s ⏩', () => skip(30));
  const bReload = ib('Recarregar transmissão', '🔄', () => { retries = 0; start(true); });
  const bFav    = ib('Favoritar', '☆', () => toggleFav());
  const bFull   = ib('Tela cheia (F)', '⛶', () => fullscreen());

  /* ── PiP ── */
  const bPip = document.pictureInPictureEnabled
    ? ib('Picture-in-Picture', '⧉', () => {
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else video.requestPictureInPicture().catch(() => {});
      })
    : null;

  /* ── volume ── */
  const volPct   = h('span', { class:'bx-vol-pct' }, '100%');
  const volRange = document.createElement('input');
  volRange.type = 'range'; volRange.min = '0'; volRange.max = '1'; volRange.step = '0.05'; volRange.value = '1';
  volRange.className = 'bx-vol-range';
  volRange.addEventListener('input', () => {
    video.volume  = parseFloat(volRange.value);
    video.muted   = video.volume === 0;
    volPct.textContent = Math.round(video.volume * 100) + '%';
    updateVolIcon();
  });
  const volSliderWrap = h('div', { class:'bx-vol-slider-wrap' }, volPct, volRange);
  const bVol = h('button', { class:'bx-ib', title:'Volume', 'aria-label':'Volume', tabindex:'-1' }, '🔊');
  bVol.addEventListener('click', () => {
    video.muted = !video.muted;
    volRange.value = video.muted ? '0' : String(video.volume || 1);
    volPct.textContent = video.muted ? '0%' : Math.round(video.volume * 100) + '%';
    updateVolIcon();
  });
  const volWrap = h('div', { class:'bx-vol-wrap' }, bVol, volSliderWrap);
  function updateVolIcon() { bVol.textContent = (video.muted || video.volume === 0) ? '🔇' : (video.volume < 0.5 ? '🔉' : '🔊'); }

  /* ── speed popup (VOD only) ── */
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const speedMenu  = h('div', { class:'bx-popup-menu' });
  const speedLabel = document.createTextNode('1×');
  const bSpeedWrap = h('div', { class:'bx-popup-btn' });
  const bSpeed = h('button', { class:'bx-ib', title:'Velocidade', tabindex:'-1' });
  bSpeed.append(speedLabel);
  SPEEDS.forEach(s => {
    const opt = h('button', {}, s + '×');
    if (s === 1) opt.classList.add('selected');
    opt.addEventListener('click', () => {
      currentSpeed = s;
      video.playbackRate = s;
      speedLabel.nodeValue = s + '×';
      speedMenu.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === opt));
      speedMenu.classList.remove('open');
    });
    speedMenu.append(opt);
  });
  bSpeed.addEventListener('click', (e) => { e.stopPropagation(); speedMenu.classList.toggle('open'); qualityMenu.classList.remove('open'); });
  bSpeedWrap.append(bSpeed, speedMenu);

  /* ── quality popup ── */
  const QUALITIES = ['Auto', '1080p', '720p', '480p'];
  const qualityMenu  = h('div', { class:'bx-popup-menu' });
  const qualityLabel = document.createTextNode('HD');
  const bQualWrap    = h('div', { class:'bx-popup-btn' });
  const bQual = h('button', { class:'bx-ib', title:'Qualidade', tabindex:'-1' });
  bQual.append(qualityLabel);
  QUALITIES.forEach((q, i) => {
    const opt = h('button', {}, q);
    if (i === 0) opt.classList.add('selected');
    opt.addEventListener('click', () => {
      qualityLabel.nodeValue = q === 'Auto' ? 'HD' : q;
      qualityMenu.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === opt));
      qualityMenu.classList.remove('open');
      // If using hls.js, switch level
      if (hls) {
        if (q === 'Auto') { hls.currentLevel = -1; return; }
        const target = parseInt(q);
        const levels = hls.levels || [];
        let best = -1, bestDiff = Infinity;
        levels.forEach((lv, i) => {
          const h_ = lv.height || 0;
          const diff = Math.abs(h_ - target);
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        });
        if (best >= 0) hls.currentLevel = best;
      }
    });
    qualityMenu.append(opt);
  });
  bQual.addEventListener('click', (e) => { e.stopPropagation(); qualityMenu.classList.toggle('open'); speedMenu.classList.remove('open'); });
  bQualWrap.append(bQual, qualityMenu);

  /* close popups on outside click */
  document.addEventListener('click', () => { speedMenu.classList.remove('open'); qualityMenu.classList.remove('open'); }, true);

  /* ── title / subtitle / badge ── */
  const badgeLive = h('span', { class:'bx-badge-live' }, '● AO VIVO');
  const titleEl   = h('div', { class:'bx-title' }, '');
  const subEl     = h('div', { class:'bx-sub'   }, '');

  /* ── close button ── */
  const bClose = h('button', { class:'bx-close', tabindex:'-1', 'aria-label':'Fechar (Esc)', title:'Fechar (Esc)' }, '✕');
  bClose.addEventListener('click', () => close());

  /* ── build controls row ── */
  const ctlItems = [bPrev, bBack30, bBack10, bPlay, bFwd10, bFwd30, bNext,
    h('span', { class:'bx-spacer' }),
    timeEl, volWrap, bQualWrap, bSpeedWrap,
    ...(bPip ? [bPip] : []),
    bReload, bFav, bFull];
  const ctlRow = h('div', { class:'bx-ctl' }, ...ctlItems);

  /* ── assemble overlay ── */
  const topBar = h('div', { class:'bx-top' },
    h('div', { class:'bx-top-info' }, titleEl, subEl),
    bClose);
  const botBar = h('div', { class:'bx-bot' }, seekWrap, ctlRow);
  const overlay = h('div', { class:'bx-ov' }, topBar, botBar);

  /* ── root element ── */
  const el = h('div', { id:'bxtv-player', tabindex:'-1' }, video, spinWrap, playOverlay, overlay);
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  setScope(el);
  requestAnimationFrame(() => el.classList.add('ready')); // fade-in

  /* ═══════════════════════ interface helpers ══════════════════════ */
  const cur = () => items[idx];

  function showSpin(on) { spinWrap.style.display = on ? 'flex' : 'none'; }

  function showUi() {
    el.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!video.paused) el.classList.add('idle'); }, 3000);
  }

  function paint() {
    const it = cur();
    titleEl.textContent = it.title || '';

    // synopsis / metadata (uses description/overview/plot from meta.js fallback)
    const synopsis = it.overview || it.description || it.plot || '';
    if (!live && synopsis) {
      subEl.textContent = synopsis.length > 120 ? synopsis.slice(0, 120) + '…' : synopsis;
    } else if (live) {
      subEl.textContent = '';
    } else {
      subEl.textContent = req.heading || '';
    }

    // Live badge
    if (badgeLive.parentNode) badgeLive.remove();
    if (live) subEl.prepend(badgeLive);

    bFav.textContent = it.favorite ? '★' : '☆';
    const hasMultiple = items.length > 1;
    bPrev.style.display = bNext.style.display = hasMultiple ? '' : 'none';

    // Hide seek controls for live
    const vodOnly = [seekWrap, bBack10, bFwd10, bBack30, bFwd30, timeEl, bSpeedWrap];
    vodOnly.forEach(el => { el.style.display = live ? 'none' : ''; });

    // EPG for live
    if (live) {
      api('/epg?id=' + encodeURIComponent(it.id)).then((r) => {
        if (cur() !== it || !r?.epg?.current) return;
        const curProg = r.epg.current;
        const st = curProg.startMs ? new Date(curProg.startMs).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
        const en = curProg.stopMs  ? new Date(curProg.stopMs ).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
        const prog = `  🔴 ${curProg.title}${st && en ? ` (${st}–${en})` : ''}`;
        const next = r.epg.next?.title ? `  ·  A seguir: ${r.epg.next.title}` : '';
        subEl.textContent = prog + next;
        subEl.prepend(badgeLive);
      }).catch(() => {});
    }
  }

  function tick() {
    if (live || isSeeking) return;
    const d = video.duration;
    const cur_ = video.currentTime;
    if (Number.isFinite(d) && d > 0) {
      const pct = (cur_ / d) * 100;
      seekFill.style.width  = pct + '%';
      seekThumb.style.left  = pct + '%';
      timeEl.textContent    = `${fmt(cur_)} / ${fmt(d)}`;
    } else {
      seekFill.style.width = '0%';
      seekThumb.style.left = '0%';
      timeEl.textContent   = fmt(cur_);
    }
  }

  /* ═══════════════════════ actions ═══════════════════════════════ */
  function toggle() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showUi();
  }

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
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else (el.requestFullscreen?.() || Promise.resolve()).catch(() => {});
  }

  async function toggleFav() {
    const it = cur();
    try {
      if (it.favorite) await api('/favorites/' + encodeURIComponent(it.id), { method:'DELETE' });
      else             await api('/favorites', { method:'POST', body:{ id: it.type === 'episode' ? it.seriesId : it.id } });
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
    api('/progress', { method:'POST', body:{ id:it.id, positionMs:pos, durationMs:dur } }).catch(() => {});
  }

  /* ═══════════════════════ seek interaction ═══════════════════════ */
  function seekPct(e) {
    const r = seekTrack.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  seekWrap.addEventListener('pointermove', (e) => {
    if (!Number.isFinite(video.duration)) return;
    const pct = seekPct(e);
    seekTip.textContent = fmt(pct * video.duration);
    seekTip.style.left = (pct * 100) + '%';
  });

  seekWrap.addEventListener('pointerdown', (e) => {
    isSeeking = true;
    seekWrap.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const pct = seekPct(ev);
      seekFill.style.width = (pct * 100) + '%';
      seekThumb.style.left = (pct * 100) + '%';
      if (Number.isFinite(video.duration)) {
        seekTip.textContent = fmt(pct * video.duration);
        seekTip.style.left  = (pct * 100) + '%';
      }
    };
    const up = (ev) => {
      isSeeking = false;
      if (Number.isFinite(video.duration)) video.currentTime = seekPct(ev) * video.duration;
      tick();
      seekWrap.removeEventListener('pointermove', move);
      seekWrap.removeEventListener('pointerup', up);
    };
    seekWrap.addEventListener('pointermove', move);
    seekWrap.addEventListener('pointerup', up);
    move(e);
  });

  /* ═══════════════════════ stream loading ═════════════════════════ */
  function teardown() {
    try { hls?.destroy(); } catch { /* already destroyed */ }
    try { mp?.pause(); mp?.unload(); mp?.detachMediaElement(); mp?.destroy(); } catch { /* already destroyed */ }
    hls = mp = null;
    video.removeAttribute('src');
    video.load();
  }

  function fail(msg, canRetry = true) {
    showSpin(false);
    playOverlay.style.display = 'none';
    const wrap = h('div', { style:'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:rgba(0,0,0,.7)' },
      h('div', { style:'font-size:1rem;color:#ffdede;max-width:380px;line-height:1.5' }, msg),
      h('div', { style:'display:flex;gap:10px;flex-wrap:wrap;justify-content:center' },
        ...(canRetry ? [(() => {
          const b = h('button', { style:'background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;color:#fff;padding:10px 24px;border-radius:10px;cursor:pointer;font-size:.9rem;font-weight:600' }, 'Tentar de novo');
          b.onclick = () => { wrap.remove(); retries = 0; start(); };
          return b;
        })()] : []),
        (() => {
          const b = h('button', { style:'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;padding:10px 24px;border-radius:10px;cursor:pointer;font-size:.9rem' }, 'Fechar');
          b.onclick = () => close();
          return b;
        })()
      )
    );
    el.append(wrap);
    el.classList.remove('idle');
  }

  function reconnect(reason) {
    if (closed) return;
    const maxRetries = 3;
    if (live && retries < maxRetries) {
      retries++;
      showSpin(true);
      const delay = [2000, 4000, 8000][retries - 1] || 8000;
      const my = gen;
      setTimeout(() => { if (!closed && my === gen) start(true); }, delay);
    } else {
      fail(reason || 'Não foi possível reproduzir.');
    }
  }

  async function start(isRetry = false) {
    const my = ++gen;
    const it  = cur();
    live = it.type === 'live';
    paint();
    tick();
    playOverlay.style.display = 'none';
    if (!isRetry) showSpin(true);
    teardown();

    startAt = !live && it.positionMs > 10000 && it.durationMs > 0 && it.positionMs / it.durationMs < 0.95
      ? it.positionMs / 1000 : 0;

    let info;
    try {
      info = await api('/web/play?id=' + encodeURIComponent(it.id));
    } catch (e) {
      if (closed || my !== gen) return;
      if (e instanceof ApiError && e.code === 'upstream_status') {
        const code = e.body?.upstreamStatus;
        if (code === 403) return fail('⚠️ Limite de conexões do provedor atingido (máx. 3 telas). Feche outras telas do BoxTv ou aguarde 1 minuto.', true);
        return reconnect(`O servidor respondeu erro ${code || ''}.`);
      }
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        return fail('Seu acesso não está ativo. Volte e confira a validade.', false);
      return reconnect('Sem conexão com o painel.');
    }
    if (closed || my !== gen) return;

    kind = resolveKind(info.kind, it.url);
    if (info.token) setToken(info.token);
    const src = proxyAbs(info.src);

    try {
      if      (kind === 'hls')              await attachHls(src, my);
      else if (kind === 'ts')               await attachTs(src, my);
      else if (kind === 'mp4' || kind === 'mkv') { video.src = src; video.load(); }
      else {
        if (live) await attachTs(src, my).catch(() => attachHls(src, my));
        else      { video.src = src; video.load(); }
      }
      if (closed || my !== gen) return;

      if (mp) {
        try { mp.play(); } catch { }
      }

      /* ── Autoplay: try unmuted, fallback to muted if browser policy blocks ── */
      try {
        await video.play();
        showSpin(false);
      } catch {
        try {
          video.muted = true;
          await video.play();
          showSpin(false);
          toast('🔊 Clique na tela para ativar o som');
          const unmute = () => { video.muted = false; updateVolIcon(); };
          window.addEventListener('click', unmute, { once: true });
          window.addEventListener('keydown', unmute, { once: true });
        } catch {
          if (!closed && my === gen) {
            showSpin(false);
            playOverlay.style.display = 'flex';
          }
        }
      }
      updateVolIcon();
    } catch (e) {
      if (closed || my !== gen) return;
      if (e?.message === 'lib_unavailable') return fail('Não consegui carregar o player de vídeo (hls.js/mpegts.js). Recarregue a página.', false);
      if (e?.message === 'unsupported')     return fail('Este navegador não consegue tocar este tipo de stream. Tente Chrome/Edge ou use o aplicativo Android TV.', false);
      reconnect('Falha ao iniciar o vídeo.');
    }
  }

  /* ── HLS.js ── */
  async function attachHls(src, my) {
    const native = video.canPlayType('application/vnd.apple.mpegurl');
    const Hls = await loadHls().catch(() => null);
    if (closed || my !== gen) return;
    if (!Hls || !Hls.isSupported()) {
      if (native) { video.src = src; return; }
      throw new Error(Hls ? 'unsupported' : 'lib_unavailable');
    }
    hls = new Hls({
      liveSyncDurationCount: 3, maxBufferLength: 30,
      startPosition: startAt || -1,
      manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 4
    });
    let mediaRecovered = false;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal || closed || my !== gen) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return; }
      reconnect(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'A conexão com o canal caiu.' : 'Este vídeo não pôde ser decodificado.');
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  }

  /* ── mpegts.js ── */
  async function attachTs(src, my) {
    const mpegts = await loadMpegts();
    if (closed || my !== gen) return;
    if (!mpegts.isSupported()) throw new Error('unsupported');
    mp = mpegts.createPlayer(
      { type:'mpegts', isLive:live, url:src },
      { enableWorker:false, lazyLoad:false, enableStashBuffer:true,
        stashInitialSize:384*1024, liveBufferLatencyChasing:false, autoCleanupSourceBuffer:true }
    );
    mp.on(mpegts.Events.ERROR, () => { if (!closed && my === gen) reconnect('A conexão com o canal caiu.'); });
    mp.attachMediaElement(video);
    mp.load();
    try { mp.play(); } catch { }
  }

  /* ═══════════════════════ video events ══════════════════════════ */
  video.addEventListener('loadedmetadata', () => {
    if (startAt > 0 && Number.isFinite(video.duration)) {
      try { video.currentTime = startAt; toast(`Continuando em ${fmt(startAt)}`); } catch { /* no seek */ }
    }
  });
  video.addEventListener('playing', () => { showSpin(false); playOverlay.style.display = 'none'; retries = 0; bPlay.textContent = '⏸'; showUi(); });
  video.addEventListener('pause',   () => { bPlay.textContent = '▶'; el.classList.remove('idle'); saveProgress(); });
  video.addEventListener('waiting', () => { if (!video.paused) showSpin(true); });
  video.addEventListener('canplay', () => { if (!video.paused) showSpin(false); });
  video.addEventListener('timeupdate',    tick);
  video.addEventListener('durationchange', tick);
  video.addEventListener('volumechange',  () => {
    volRange.value = video.muted ? '0' : String(video.volume);
    volPct.textContent = video.muted ? '0%' : Math.round(video.volume * 100) + '%';
    updateVolIcon();
  });
  video.addEventListener('ended', () => {
    if (live) return reconnect('A transmissão terminou.');
    const it = cur();
    it.positionMs = it.durationMs = Math.floor(video.duration * 1000) || 1;
    api('/progress', { method:'POST', body:{ id:it.id, positionMs:it.positionMs, durationMs:it.durationMs } }).catch(() => {});
    if (it.type === 'episode' && idx < items.length - 1) { idx++; retries = 0; start(); }
    else close();
  });
  video.addEventListener('error', () => {
    if (closed || kind === 'hls' || kind === 'ts') return;
    const c = video.error?.code;
    fail(c === 4
      ? 'O navegador não consegue tocar este formato. Tente Chrome/Edge ou use o aplicativo Android TV.'
      : 'Erro ao reproduzir o vídeo.', c !== 4);
  });
  video.addEventListener('click',    toggle);
  video.addEventListener('dblclick', fullscreen);

  /* ═══════════════════════ keyboard / remote ══════════════════════ */
  function onKey(e) {
    if (closed) return;
    const k = e.key;
    let handled = true;

    if      (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack') {
      if (document.fullscreenElement && k === 'Escape') return;
      close();
    }
    else if (k === ' ' || k === 'Enter' || k === 'k' || k === 'MediaPlayPause') toggle();
    else if (k === 'MediaPlay')                video.play().catch(() => {});
    else if (k === 'MediaPause')               video.pause();
    else if (k === 'ArrowLeft'  || k === 'MediaRewind')       skip(e.shiftKey ? -30 : -10);
    else if (k === 'ArrowRight' || k === 'MediaFastForward')  skip(e.shiftKey ?  30 :  10);
    else if (k === 'j' || k === 'J')           skip(-10);
    else if (k === 'l' || k === 'L')           skip(10);
    else if (k === 'r' || k === 'R')           { retries = 0; start(true); }
    else if (k === 'f' || k === 'F')           fullscreen();
    else if (k === 'm' || k === 'M')           { bVol.click(); }
    else if (k === 'MediaTrackNext')           step(1);
    else if (k === 'MediaTrackPrevious')       step(-1);
    else if (k === 'ContextMenu')              toggleFav();
    else if (k === 'ArrowUp' || k === 'ChannelUp' || k === 'PageUp') {
      if (live || items.length > 1) step(-1); else { video.volume = Math.min(1, video.volume + 0.1); }
    }
    else if (k === 'ArrowDown' || k === 'ChannelDown' || k === 'PageDown') {
      if (live || items.length > 1) step(1); else { video.volume = Math.max(0, video.volume - 0.1); }
    }
    // Number keys 1-9: jump to % of content (VOD only)
    else if (!live && /^[1-9]$/.test(k) && Number.isFinite(video.duration)) {
      video.currentTime = (parseInt(k) / 10) * video.duration;
      tick();
    }
    else handled = false;

    if (handled) { e.preventDefault(); e.stopPropagation(); showUi(); }
  }
  document.addEventListener('keydown', onKey, true);
  ['mousemove', 'pointerdown', 'touchstart'].forEach(ev => el.addEventListener(ev, showUi, { passive:true }));

  /* ═══════════════════════ periodic save ═════════════════════════ */
  saveTimer = setInterval(() => { if (!video.paused) saveProgress(); }, 15000);
  const onHide = () => { if (document.visibilityState === 'hidden') saveProgress(); };
  document.addEventListener('visibilitychange', onHide);

  /* ═══════════════════════ close ═════════════════════════════════ */
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
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if (document.pictureInPictureElement) document.exitPictureInPicture?.().catch(() => {});
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s ease';
    setTimeout(() => { el.remove(); }, 260);
    document.body.style.overflow = '';
    setScope(document);
    current = null;
    req.onClose?.();
  }

  /* ═══════════════════════ kick off ══════════════════════════════ */
  current = { close };
  el.focus();
  start();
  return current;
}
