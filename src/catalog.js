import fs from 'node:fs';
import path from 'node:path';
import { parseM3U, Catalog } from './m3u.js';
import { sha1, HttpError } from './util.js';

/**
 * Baixa e interpreta a playlist M3U no servidor (o app recebe JSON pronto).
 * - cache em memória (TTL) + cópia em disco para quando o provedor cair
 * - uma única requisição por URL ao mesmo tempo
 */
export class CatalogStore {
  constructor({ dir, ttlMs = 6 * 3600 * 1000, userAgent = 'IPTVPanel/1.0', maxEntries = 2, fetchFn = fetch }) {
    this.dir = dir;
    this.ttlMs = ttlMs;
    this.userAgent = userAgent;
    this.maxEntries = maxEntries;
    this.fetchFn = fetchFn;
    this.mem = new Map();
    this.inflight = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }

  async get(url, { force = false } = {}) {
    const hit = this.mem.get(url);
    if (hit && !force && Date.now() - hit.at < this.ttlMs) {
      this.mem.delete(url);
      this.mem.set(url, hit);
      return hit.catalog;
    }
    if (this.inflight.has(url)) return this.inflight.get(url);
    const p = this._load(url, hit).finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  /** Guarda uma lista que já foi baixada e validada (evita baixar duas vezes na ativação). */
  prime(url, text) {
    const catalog = new Catalog(parseM3U(text));
    try {
      fs.writeFileSync(path.join(this.dir, sha1(url) + '.m3u'), text);
    } catch {
      /* sem disco: segue só em memória */
    }
    this._put(url, catalog);
    return catalog;
  }

  invalidate(url) {
    this.mem.delete(url);
  }

  cachedCount() {
    return this.mem.size;
  }

  _put(url, catalog, retryInMs = null) {
    const at = retryInMs == null ? Date.now() : Date.now() - this.ttlMs + retryInMs;
    this.mem.delete(url);
    this.mem.set(url, { catalog, at });
    while (this.mem.size > this.maxEntries) this.mem.delete(this.mem.keys().next().value);
  }

  async _load(url, stale) {
    const file = path.join(this.dir, sha1(url) + '.m3u');
    let replaceHost = '';
    try {
      const u = new URL(url);
      if (u.hostname) replaceHost = u.hostname;
    } catch { }

    try {
      const res = await this.fetchFn(url, {
        headers: { 'user-agent': this.userAgent },
        redirect: 'follow',
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text.includes('#EXTINF')) throw new Error('A resposta não parece ser uma playlist M3U');

      try {
        fs.writeFileSync(file, text);
      } catch { }

      const catalog = new Catalog(text, replaceHost);
      this._put(url, catalog);
      return catalog;
    } catch (err) {
      // Provedor fora do ar: usa a última versão conhecida e tenta de novo em 1 minuto.
      if (stale) {
        this._put(url, stale.catalog, 60000);
        return stale.catalog;
      }
      if (fs.existsSync(file)) {
        try {
          const catalog = new Catalog(fs.readFileSync(file, 'utf8'), replaceHost);
          this._put(url, catalog, 60000);
          return catalog;
        } catch { }
      }
      throw new HttpError(502, 'playlist_unavailable', { detail: String(err.message || err) });
    }
  }
}
