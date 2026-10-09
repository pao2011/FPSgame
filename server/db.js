// Base de datos mínima en un archivo JSON: cuentas, amigos, sesiones y
// estadísticas. Suficiente para jugar con amigos sin instalar nada más.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const DIR = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = join(DIR, 'db.json');

export const NAME_RE = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ]{3,16}$/;

const RESERVED = /^(admin|administrador|moderador|mod|servidor|server|sistema|system|bot|isla_?royale)$/i;

// Contraseñas nuevas: de 6 a 64 caracteres y que no sean el propio nombre ni
// de las más típicas. (Las cuentas antiguas con 4 siguen pudiendo entrar.)
const WEAK = new Set(['123456', '1234567', '12345678', '123456789', 'password', 'contraseña', 'qwerty', '111111', '000000', 'abc123', 'abcdef']);
export function passProblem(pass, name = '') {
  if (typeof pass !== 'string' || pass.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
  if (pass.length > 64) return 'La contraseña es demasiado larga (máximo 64)';
  if (pass.toLowerCase() === String(name).toLowerCase()) return 'La contraseña no puede ser tu nombre';
  if (WEAK.has(pass.toLowerCase())) return 'Esa contraseña es demasiado fácil de adivinar';
  return null;
}

function hashPass(pass, salt) {
  return scryptSync(pass, salt, 32).toString('hex');
}

export class DB {
  constructor() {
    this.data = { users: {}, tokens: {} };
    try {
      if (existsSync(FILE)) this.data = { users: {}, tokens: {}, ...JSON.parse(readFileSync(FILE, 'utf8')) };
    } catch (err) {
      console.error('[db] No se pudo leer la base de datos, se empieza de cero:', err.message);
    }
    this.timer = null;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 800);
  }

  flush() {
    try {
      mkdirSync(DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, FILE);
    } catch (err) {
      console.error('[db] Error al guardar:', err.message);
    }
  }

  user(name) {
    return this.data.users[String(name || '').toLowerCase()] || null;
  }

  // ¿Se puede usar este nombre? Devuelve el motivo si no.
  nameProblem(name) {
    if (!NAME_RE.test(name || '')) return 'El nombre debe tener de 3 a 16 letras, números o _ (sin espacios)';
    if (RESERVED.test(name)) return 'Ese nombre está reservado';
    if (this.data.users[name.toLowerCase()]) return 'Ese nombre ya está en uso';
    return null;
  }

  register(name, pass) {
    const bad = this.nameProblem(name);
    if (bad) return { error: bad, field: 'name' };
    const pe = passProblem(pass, name);
    if (pe) return { error: pe, field: 'pass' };
    const key = name.toLowerCase();
    const salt = randomBytes(16).toString('hex');
    const u = {
      name, salt, hash: hashPass(pass, salt), created: Date.now(),
      friends: [], incoming: [], outgoing: [],
      outfit: null, stats: { matches: 0, wins: 0, kills: 0 },
    };
    this.data.users[key] = u;
    this.save();
    return { user: u, token: this.newToken(key) };
  }

  login(name, pass) {
    const u = this.user(name);
    if (!u || typeof pass !== 'string') return { error: 'Usuario o contraseña incorrectos' };
    const a = Buffer.from(hashPass(pass, u.salt), 'hex');
    const b = Buffer.from(u.hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: 'Usuario o contraseña incorrectos' };
    return { user: u, token: this.newToken(u.name.toLowerCase()) };
  }

  // Cambiar la contraseña: cierra las demás sesiones abiertas de la cuenta.
  changePass(key, oldPass, newPass, keepToken) {
    const u = this.data.users[key];
    if (!u || typeof oldPass !== 'string') return { error: 'La contraseña actual no es correcta' };
    const a = Buffer.from(hashPass(oldPass, u.salt), 'hex');
    const b = Buffer.from(u.hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: 'La contraseña actual no es correcta' };
    const pe = passProblem(newPass, u.name);
    if (pe) return { error: pe };
    u.salt = randomBytes(16).toString('hex');
    u.hash = hashPass(newPass, u.salt);
    for (const [t, k] of Object.entries(this.data.tokens)) if (k === key && t !== keepToken) delete this.data.tokens[t];
    this.save();
    return { ok: true };
  }

  resume(token) {
    const key = typeof token === 'string' ? this.data.tokens[token] : null;
    const u = key ? this.data.users[key] : null;
    return u ? { user: u, token } : { error: 'Sesión caducada, vuelve a entrar' };
  }

  newToken(key) {
    const t = randomBytes(24).toString('hex');
    this.data.tokens[t] = key;
    this.save();
    return t;
  }

  logout(token) {
    delete this.data.tokens[token];
    this.save();
  }
}
