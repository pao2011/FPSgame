// Base de datos mínima en un archivo JSON: cuentas, amigos, sesiones y
// estadísticas. Suficiente para jugar con amigos sin instalar nada más.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const DIR = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = join(DIR, 'db.json');

export const NAME_RE = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ]{3,16}$/;

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

  register(name, pass) {
    if (!NAME_RE.test(name || '')) return { error: 'El nombre debe tener de 3 a 16 letras, números o _' };
    if (typeof pass !== 'string' || pass.length < 4 || pass.length > 64) return { error: 'La contraseña debe tener al menos 4 caracteres' };
    const key = name.toLowerCase();
    if (this.data.users[key]) return { error: 'Ese nombre ya está en uso' };
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
