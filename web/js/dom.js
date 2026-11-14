// Utilidades de DOM. Nunca usa innerHTML com texto vindo da lista (títulos são dados não confiáveis).
import { imgUrl } from './api.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'data-f') el.setAttribute('data-f', '');
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const spinner = () => h('div', { class: 'spin', role: 'progressbar', 'aria-label': 'Carregando' });
export const message = (t, cls = '') => h('div', { class: 'msg ' + cls }, t);

let toastTimer;
export function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

export function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

/** <img> com plano B (iniciais do título) se a imagem não carregar. */
export function artImage(item, container) {
  const src = imgUrl(item.logo);
  const ph = () => h('div', { class: 'ph' }, (item.title || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 18) || '▶');
  if (!src) { container.append(ph()); return; }
  const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => { img.replaceWith(ph()); }, { once: true });
  container.append(img);
}

/** Cartão de filme/série/canal/episódio. */
export function card(item, onOpen, opts = {}) {
  const live = item.type === 'live';
  const art = h('div', { class: 'art' });
  artImage(item, art);
  if (item.favorite) art.append(h('span', { class: 'fav', 'aria-label': 'Favorito' }, '★'));
  
  // Barra de progresso estilo Netflix
  if (item.durationMs > 0 && item.positionMs > 0) {
    const pct = Math.min(100, Math.max(3, (item.positionMs / item.durationMs) * 100));
    art.append(h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })));
  }

  // Efeito play ao passar o mouse ou focar
  art.append(h('div', { class: 'card-play-overlay' }, h('span', { class: 'play-icon' }, '▶')));

  const sub = opts.sub ?? (item.type === 'series' && item.episodeCount ? `${item.episodeCount} episódios` : item.year || '');
  const el = h('button', {
    class: 'card' + (live ? ' live' : '') + (opts.wide ? ' wide' : ''),
    'data-f': true,
    title: item.title,
    onclick: () => onOpen(item),
    oncontextmenu: opts.onMenu ? (e) => { e.preventDefault(); opts.onMenu(item); } : null,
  }, art, h('div', { class: 'cap' }, item.title, sub ? h('small', {}, sub) : null));
  if (opts.onMenu) el.dataset.menu = '1';
  return el;
}
