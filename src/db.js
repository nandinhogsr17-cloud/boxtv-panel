import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const nz = (v) => (v === undefined ? null : v);

/**
 * Status calculado do dispositivo.
 * blocked  -> bloqueado pelo admin
 * pending  -> registrado mas sem playlist
 * expired  -> validade vencida
 * active   -> liberado
 */
export function deviceStatus(d, now = Date.now()) {
  if (!d) return 'unknown';
  if (d.status === 'blocked') return 'blocked';
  if (!d.m3u_url) return 'pending';
  if (d.expires_at != null && d.expires_at < now) return 'expired';
  return 'active';
}

export function macToCode(mac) {
  if (!mac) return '';
  return 'BOX-' + String(mac).toUpperCase().replace(/[^0-9A-F]/g, '');
}

export function normCode(s) {
  if (!s) return null;
  const clean = String(s).toUpperCase().replace(/[^0-9A-F]/g, '');
  if (clean.length === 12) {
    return clean.match(/.{2}/g).join(':');
  }
  return clean || null;
}

export class Store {
  constructor(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.dataDir = dataDir;
    this.devicesJsonPath = path.join(dataDir, 'devices.json');
    this.db = new DatabaseSync(path.join(dataDir, 'panel.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS devices (
        mac TEXT PRIMARY KEY,
        device_key TEXT,
        name TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        m3u_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        last_seen INTEGER,
        last_ip TEXT,
        app_version TEXT,
        model TEXT
      );
      CREATE TABLE IF NOT EXISTS favorites (
        mac TEXT NOT NULL,
        item_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (mac, item_id)
      );
      CREATE TABLE IF NOT EXISTS progress (
        mac TEXT NOT NULL,
        item_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        series_id TEXT,
        position_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (mac, item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_progress_recent ON progress (mac, updated_at DESC);
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        competition TEXT NOT NULL DEFAULT '',
        home TEXT NOT NULL,
        away TEXT NOT NULL,
        channels TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_games_date ON games (date);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta_cache (
        key TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const p = (sql) => this.db.prepare(sql);
    this.s = {
      settingGet: p('SELECT value FROM settings WHERE key = ?'),
      settingSet: p('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      settingDel: p('DELETE FROM settings WHERE key = ?'),
      getDevice: p('SELECT * FROM devices WHERE mac = ?'),
      insertDevice: p(
        `INSERT INTO devices (mac, device_key, name, notes, m3u_url, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      touch: p(
        `UPDATE devices SET last_seen = ?, last_ip = ?,
           app_version = COALESCE(?, app_version), model = COALESCE(?, model) WHERE mac = ?`
      ),
      deleteDevice: p('DELETE FROM devices WHERE mac = ?'),
      deleteFavs: p('DELETE FROM favorites WHERE mac = ?'),
      deleteProg: p('DELETE FROM progress WHERE mac = ?'),
      favList: p('SELECT * FROM favorites WHERE mac = ? ORDER BY created_at DESC'),
      favAdd: p(
        `INSERT INTO favorites (mac, item_id, type, title, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(mac, item_id) DO UPDATE SET title = excluded.title`
      ),
      favDel: p('DELETE FROM favorites WHERE mac = ? AND item_id = ?'),
      progUpsert: p(
        `INSERT INTO progress (mac, item_id, type, title, series_id, position_ms, duration_ms, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(mac, item_id) DO UPDATE SET
           position_ms = excluded.position_ms, duration_ms = excluded.duration_ms,
           title = excluded.title, updated_at = excluded.updated_at`
      ),
      progList: p('SELECT * FROM progress WHERE mac = ? ORDER BY updated_at DESC LIMIT ?'),
      progGet: p('SELECT * FROM progress WHERE mac = ? AND item_id = ?'),
      progAll: p('SELECT * FROM progress WHERE mac = ?'),
      gamesByDate: p('SELECT * FROM games WHERE date = ? ORDER BY time'),
      gamesAll: p('SELECT * FROM games ORDER BY date DESC, time'),
      gameAdd: p(
        'INSERT INTO games (date, time, competition, home, away, channels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ),
      gameDel: p('DELETE FROM games WHERE id = ?'),
      gamesPurge: p('DELETE FROM games WHERE date < ?'),
      metaGet: p('SELECT json, updated_at FROM meta_cache WHERE key = ?'),
      metaSet: p(
        `INSERT INTO meta_cache (key, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
      ),
    };
    this._restoreDevicesFromJson();
  }

  _restoreDevicesFromJson() {
    try {
      if (!fs.existsSync(this.devicesJsonPath)) return;
      const count = this.db.prepare('SELECT COUNT(*) as c FROM devices').get().c;
      if (count > 0) return;
      const list = JSON.parse(fs.readFileSync(this.devicesJsonPath, 'utf8'));
      if (Array.isArray(list)) {
        for (const d of list) {
          if (d.mac) {
            this.db.prepare(`
              INSERT OR REPLACE INTO devices (mac, device_key, name, notes, m3u_url, status, expires_at, created_at, last_seen, last_ip, app_version, model)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              d.mac, nz(d.device_key), d.name || '', d.notes || '', d.m3u_url || '',
              d.status || 'active', nz(d.expires_at), d.created_at || Date.now(),
              nz(d.last_seen), nz(d.last_ip), nz(d.app_version), nz(d.model)
            );
          }
        }
      }
    } catch (e) {
      console.error('Erro ao restaurar devices.json:', e);
    }
  }

  _persistDevicesToJson() {
    try {
      const rows = this.db.prepare('SELECT * FROM devices ORDER BY COALESCE(last_seen, created_at) DESC').all();
      fs.writeFileSync(this.devicesJsonPath, JSON.stringify(rows, null, 2));
    } catch (e) {
      console.error('Erro ao salvar devices.json:', e);
    }
  }

  // ---- dispositivos ----
  getDevice(mac) {
    return this.s.getDevice.get(mac) ?? null;
  }

  createDevice({ mac, key = null, name = '', notes = '', m3uUrl = '', m3u_url, status = 'active', expiresAt = null }) {
    const url = m3u_url !== undefined ? m3u_url : m3uUrl;
    this.s.insertDevice.run(mac, nz(key), name, notes, url || '', status, nz(expiresAt), Date.now());
    const dev = this.getDevice(mac);
    this._persistDevicesToJson();
    return dev;
  }

  updateDevice(mac, fields) {
    const allowed = ['device_key', 'name', 'notes', 'm3u_url', 'status', 'expires_at'];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
      if (k in fields) {
        sets.push(`${k} = ?`);
        vals.push(nz(fields[k]));
      }
    }
    if (!sets.length) return this.getDevice(mac);
    this.db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE mac = ?`).run(...vals, mac);
    const dev = this.getDevice(mac);
    this._persistDevicesToJson();
    return dev;
  }

  touchDevice(mac, ip, appVersion = null, model = null) {
    this.s.touch.run(Date.now(), nz(ip), nz(appVersion), nz(model), mac);
  }

  deleteDevice(mac) {
    this.s.deleteFavs.run(mac);
    this.s.deleteProg.run(mac);
    const res = this.s.deleteDevice.run(mac).changes > 0;
    this._persistDevicesToJson();
    return res;
  }

  listDevices(search = '') {
    const rows = this.db.prepare('SELECT * FROM devices ORDER BY COALESCE(last_seen, created_at) DESC').all();
    const q = String(search || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      [d.mac, d.name, d.notes, d.m3u_url].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }

  // ---- favoritos ----
  listFavorites(mac) {
    return this.s.favList.all(mac);
  }
  favoriteIds(mac) {
    return new Set(this.s.favList.all(mac).map((r) => r.item_id));
  }
  addFavorite(mac, item) {
    this.s.favAdd.run(mac, item.id, item.type, item.title, Date.now());
  }
  removeFavorite(mac, id) {
    return this.s.favDel.run(mac, id).changes > 0;
  }

  // ---- progresso ----
  upsertProgress(mac, r) {
    this.s.progUpsert.run(mac, r.item_id, r.type, r.title, nz(r.series_id), r.position_ms, r.duration_ms, Date.now());
  }
  listProgress(mac, limit = 60) {
    return this.s.progList.all(mac, limit);
  }
  getProgress(mac, id) {
    return this.s.progGet.get(mac, id) ?? null;
  }
  progressMap(mac) {
    return new Map(this.s.progAll.all(mac).map((r) => [r.item_id, r]));
  }

  // ---- jogos manuais ----
  listManualGames(date) {
    return this.s.gamesByDate.all(date);
  }
  listAllManualGames() {
    return this.s.gamesAll.all();
  }
  addManualGame(g) {
    const r = this.s.gameAdd.run(g.date, g.time, g.competition || '', g.home, g.away, g.channels || '', Date.now());
    return Number(r.lastInsertRowid);
  }
  deleteManualGame(id) {
    return this.s.gameDel.run(id).changes > 0;
  }
  purgeOldGames(beforeDate) {
    this.s.gamesPurge.run(beforeDate);
  }

  // ---- configurações (chaves de API etc.) ----
  getSetting(key) {
    const r = this.s.settingGet.get(key);
    return r ? r.value : null;
  }
  setSetting(key, value) {
    if (value === '' || value == null) this.s.settingDel.run(key);
    else this.s.settingSet.run(key, String(value));
  }

  // ---- cache de metadados ----
  getMeta(key) {
    const r = this.s.metaGet.get(key);
    if (!r) return null;
    try {
      return { value: JSON.parse(r.json), updatedAt: r.updated_at };
    } catch {
      return null;
    }
  }
  setMeta(key, value) {
    this.s.metaSet.run(key, JSON.stringify(value), Date.now());
  }

  stats() {
    const rows = this.db.prepare('SELECT * FROM devices').all();
    const out = { total: rows.length, active: 0, pending: 0, expired: 0, blocked: 0 };
    for (const d of rows) out[deviceStatus(d)]++;
    return out;
  }

  close() {
    this.db.close();
  }
}
