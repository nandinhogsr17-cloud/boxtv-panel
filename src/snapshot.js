import crypto from 'node:crypto';

/**
 * Cópia de segurança do estado (aparelhos, favoritos, "continuar assistindo", ajustes) em um endereço externo.
 * No Render grátis o disco some a cada reinício; com SNAPSHOT_URL o painel salva (PUT) e restaura (GET) sozinho.
 * O conteúdo vai cifrado (AES-256-GCM) com um segredo só do servidor, então o armazenamento pode ser qualquer
 * endereço HTTP que aceite PUT e GET (Cloudflare Worker/KV, S3 com URL assinada, JSON bin, outro servidor).
 */
const TABLES = {
  devices: null,
  favorites: null,
  progress: null,
  settings: null,
};

const keyOf = (secret) => crypto.createHash('sha256').update('boxtv-snapshot:' + String(secret)).digest();

export function sealSnapshot(secret, data) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  return ['s1', iv.toString('base64url'), enc.toString('base64url'), c.getAuthTag().toString('base64url')].join('.');
}

export function openSnapshot(secret, text) {
  try {
    const p = String(text || '').trim().split('.');
    if (p.length !== 4 || p[0] !== 's1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(p[1], 'base64url'));
    d.setAuthTag(Buffer.from(p[3], 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(p[2], 'base64url')), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function dumpState(db) {
  const out = { v: 1, at: Date.now(), tables: {} };
  for (const t of Object.keys(TABLES)) out.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return out;
}

/** Restaura só tabelas conhecidas e colunas que existem. Devolve quantas linhas entraram. */
export function restoreState(db, state) {
  if (!state || state.v !== 1 || typeof state.tables !== 'object') return 0;
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const t of Object.keys(TABLES)) {
      const rows = Array.isArray(state.tables[t]) ? state.tables[t] : [];
      const cols = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
      for (const row of rows) {
        const keys = Object.keys(row || {}).filter((k) => cols.has(k));
        if (!keys.length) continue;
        db.prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]));
        n++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return n;
}

export class Snapshotter {
  constructor({ url, token = '', secret, db, fetchFn = fetch, intervalMs = 120000, log = () => {} }) {
    this.url = url;
    this.token = token;
    this.secret = secret;
    this.db = db;
    this.fetchFn = fetchFn;
    this.intervalMs = intervalMs;
    this.log = log;
    this.lastHash = '';
    this.timer = null;
  }

  get enabled() {
    return !!this.url;
  }

  _headers(extra = {}) {
    return { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  /** Chamado no começo: se este disco está vazio, busca o que foi salvo. */
  async restoreIfEmpty() {
    if (!this.enabled) return 0;
    const has = this.db.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
    if (has > 0) return 0;
    try {
      const res = await this.fetchFn(this.url, { headers: this._headers(), signal: AbortSignal.timeout(15000) });
      if (!res.ok) return 0;
      const state = openSnapshot(this.secret, await res.text());
      const n = restoreState(this.db, state);
      if (n) this.log(`snapshot: ${n} registros restaurados`);
      return n;
    } catch (e) {
      this.log('snapshot: falha ao restaurar: ' + (e?.message || e));
      return 0;
    }
  }

  async save(force = false) {
    if (!this.enabled) return false;
    try {
      const state = dumpState(this.db);
      const hash = crypto.createHash('sha1').update(JSON.stringify(state.tables)).digest('hex');
      if (!force && hash === this.lastHash) return false;
      const res = await this.fetchFn(this.url, {
        method: 'PUT',
        headers: this._headers({ 'content-type': 'text/plain' }),
        body: sealSnapshot(this.secret, state),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.lastHash = hash;
      return true;
    } catch (e) {
      this.log('snapshot: falha ao salvar: ' + (e?.message || e));
      return false;
    }
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.save(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
