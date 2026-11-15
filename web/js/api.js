// Identidade do aparelho (MAC + chave), chamadas ao painel e endereços do proxy.
const CFG = window.IPTV_CONFIG || {};
export const API_BASE = (CFG.apiBase || '').replace(/\/$/, '');
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LS = { mac: 'iptv.mac', key: 'iptv.key' };

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch { /* navegador bloqueou o armazenamento */ }
  return memory[k] ?? null;
}
const memory = {}; // plano B se o navegador não deixar gravar (a identidade vale só até fechar a página)

export function randomMac() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  b[0] = (b[0] | 0x02) & 0xfe; // "administrado localmente" + unicast: nunca colide com MAC de fábrica
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join(':').toUpperCase();
}
export function randomKey() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => KEY_ALPHABET[x % KEY_ALPHABET.length]).join('');
}
export function cleanMac(s) {
  const h = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return h.length === 12 ? h.match(/.{2}/g).join(':') : null;
}
export function cleanKey(s) {
  const k = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return k.length >= 6 && k.length <= 16 ? k : null;
}

export const identity = {
  get mac() {
    let m = store(LS.mac);
    if (!cleanMac(m)) {
      m = randomMac();
      memory[LS.mac] = m;
      store(LS.mac, m);
    }
    return m;
  },
  get key() {
    let k = store(LS.key);
    if (!cleanKey(k)) {
      k = randomKey();
      memory[LS.key] = k;
      store(LS.key, k);
    }
    return k;
  },
  set(mac, key) {
    memory[LS.mac] = mac; memory[LS.key] = key;
    store(LS.mac, mac);
    store(LS.key, key);
  },
  clear() {
    delete memory[LS.mac]; delete memory[LS.key];
    store(LS.mac, null);
    store(LS.key, null);
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'http_' + status);
    this.status = status;
    this.code = (body && body.error) || null;
    this.body = body || {};
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'X-Mac': identity.mac, 'X-Key': identity.key };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(API_BASE + '/api/v1' + path, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, { error: 'offline' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const login = (username, password, serverHost) =>
  api('/auth/login', {
    method: 'POST',
    body: {
      username,
      password,
      serverHost,
      mac: identity.mac,
      key: identity.key,
      appVersion: 'web-1.0',
      model: navigator.platform || 'Web'
    }
  });

export const logout = () => {
  localStorage.removeItem('iptv.logged_user');
  identity.clear();
  location.reload();
};

// ---- token para <img>/<video> (que não conseguem mandar cabeçalhos)
let tokenInfo = null;
export async function ensureToken(force = false) {
  if (!force && tokenInfo && tokenInfo.exp > Date.now() + 60000) return tokenInfo.token;
  const r = await api('/web/token');
  tokenInfo = { token: r.token, exp: Date.now() + Math.min(r.expiresIn, 12 * 3600e3) - 5 * 60e3 };
  return tokenInfo.token;
}
export function setToken(t) { tokenInfo = { token: t, exp: Date.now() + 11 * 3600e3 }; }

/** Imagem: https direto; http (bloqueado em página https) passa pelo proxy do painel. */
export function imgUrl(u) {
  if (!u) return null;
  if (/^https:\/\//i.test(u)) return u;
  if (!/^http:\/\//i.test(u)) return null;
  if (!tokenInfo) return null;
  return `${API_BASE}/p/i?t=${encodeURIComponent(tokenInfo.token)}&u=${encodeURIComponent(u)}`;
}
export const proxyAbs = (p) => (p.startsWith('http') ? p : API_BASE + p);

/** Ativação pelo próprio app: manda a lista; o painel confere e só grava se funcionar. */
export const activate = (m3uUrl) =>
  api('/activate', { method: 'POST', body: { mac: identity.mac, key: identity.key, m3uUrl } });

// ====================================================================== 🏧 Dispositivos e Ativação Remota
export const getDeviceCode = () => 'BOX-' + identity.mac.toUpperCase().replace(/[^0-9A-F]/g, '');

export const listDevices = () => api('/devices');

export const activateDevice = (code, name, m3uUrl) =>
  api('/devices/activate', { method: 'POST', body: { code, name, m3uUrl } });

export const editDevice = (code, name, m3uUrl) =>
  api('/devices/' + encodeURIComponent(code), { method: 'PUT', body: { name, m3uUrl } });

export const removeDevice = (code) =>
  api('/devices/' + encodeURIComponent(code), { method: 'DELETE' });
