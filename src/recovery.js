import crypto from 'node:crypto';

/**
 * "Chave de recuperação" da sessão: a conta Xtream cifrada com um segredo que só o servidor tem (WEB_SECRET).
 * O navegador guarda esse texto opaco; se o servidor reiniciar e perder o disco (Render grátis), o site
 * reativa o aparelho sozinho, sem pedir usuário e senha de novo. A senha nunca fica legível no navegador.
 */
const MAX_AGE_MS = 400 * 24 * 3600 * 1000;

const keyOf = (secret) => crypto.createHash('sha256').update('boxtv-recovery:' + String(secret)).digest();

export function sealRecovery(secret, data, now = Date.now()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify({ ...data, iat: now }), 'utf8'), cipher.final()]);
  return ['r1', iv.toString('base64url'), enc.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function openRecovery(secret, text, now = Date.now()) {
  try {
    const p = String(text || '').split('.');
    if (p.length !== 4 || p[0] !== 'r1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(p[1], 'base64url'));
    d.setAuthTag(Buffer.from(p[3], 'base64url'));
    const data = JSON.parse(Buffer.concat([d.update(Buffer.from(p[2], 'base64url')), d.final()]).toString('utf8'));
    if (!data || !data.u || typeof data.p !== 'string' || !(now - data.iat < MAX_AGE_MS)) return null;
    return { username: String(data.u), password: data.p, serverHost: data.h ? String(data.h) : '' };
  } catch {
    return null;
  }
}
