// Búsqueda de servidores de Isla Royale en la red local (misma Wi-Fi).
// Prueba http://<ip>:8080/estado en las subredes domésticas más habituales.
// Sólo funciona desde páginas http (la app Android o un servidor local):
// desde https el navegador bloquea las peticiones http.

const COMMON = [
  '192.168.1', '192.168.0', '192.168.100', '192.168.18', '192.168.2', '192.168.8', '192.168.31',
  '192.168.43', '172.20.10', '10.0.0', '192.168.10', '192.168.20', '192.168.50', '192.168.68',
  '192.168.88', '192.168.3', '192.168.4', '192.168.5', '10.0.1', '192.168.178',
];

export function canScan() {
  return location.protocol !== 'https:' && typeof fetch === 'function' && typeof AbortController === 'function';
}

function subnetOf(host) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(String(host || '').split(':')[0]);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const priv = a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168);
  return priv ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

async function probe(host, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`http://${host}/estado`, { signal: ctrl.signal, cache: 'no-store' });
    const j = await r.json();
    if (j && j.ok && (j.juego === 'isla-royale' || 'isla' in j)) return { host, online: j.online || 0, isla: j.isla };
  } catch {
    /* no hay servidor en esa dirección */
  } finally {
    clearTimeout(timer);
  }
  return null;
}

// Devuelve los servidores encontrados en la primera subred que tenga alguno.
// onProgress(hechas, total, subred) · stop() cancela la búsqueda.
export function scanLan({ port = 8080, hints = [], onProgress } = {}) {
  let stopped = false;
  const subnets = [];
  for (const h of hints) {
    const s = subnetOf(h);
    if (s && !subnets.includes(s)) subnets.push(s);
  }
  for (const s of COMMON) if (!subnets.includes(s)) subnets.push(s);
  const total = subnets.length * 254;
  let done = 0;

  const run = async () => {
    for (const net of subnets) {
      if (stopped) return [];
      const found = [];
      const hosts = [];
      // primero las direcciones típicas de un PC (las de DHCP bajas)
      for (let i = 2; i < 255; i++) hosts.push(`${net}.${i}`);
      hosts.push(`${net}.1`);
      let next = 0;
      const worker = async () => {
        while (!stopped && next < hosts.length) {
          const h = hosts[next++];
          const r = await probe(`${h}:${port}`, 1400);
          done++;
          if (r) found.push(r);
          onProgress?.(done, total, net);
        }
      };
      await Promise.all(Array.from({ length: 48 }, worker));
      if (found.length) return found;
    }
    return [];
  };
  const promise = run();
  return { promise, stop: () => (stopped = true) };
}
