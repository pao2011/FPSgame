import * as THREE from 'three';

const tmpColor = new THREE.Color();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vn = new THREE.Vector3();

// Acumula geometría estática (con color por vértice) en un único buffer para
// dibujar todos los edificios en muy pocas draw calls.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  _color(hex, jitter = 0) {
    tmpColor.setHex(hex); // convierte sRGB -> lineal
    if (jitter) {
      const j = 1 + (Math.random() - 0.5) * jitter;
      tmpColor.r *= j;
      tmpColor.g *= j;
      tmpColor.b *= j;
    }
    return tmpColor;
  }

  // Polígono convexo (array de [x,y,z]). `inside` = punto interior del sólido
  // para orientar la normal hacia fuera.
  poly(verts, hex, inside, jitter = 0) {
    va.fromArray(verts[0]);
    vb.fromArray(verts[1]);
    vc.fromArray(verts[2]);
    vn.subVectors(vb, va).cross(vc.sub(va)).normalize();
    let order = verts;
    if (inside) {
      const dx = verts[0][0] - inside[0], dy = verts[0][1] - inside[1], dz = verts[0][2] - inside[2];
      if (vn.x * dx + vn.y * dy + vn.z * dz < 0) {
        order = verts.slice().reverse();
        vn.negate();
      }
    }
    const c = this._color(hex, jitter);
    for (let i = 1; i < order.length - 1; i++) {
      for (const v of [order[0], order[i], order[i + 1]]) {
        this.pos.push(v[0], v[1], v[2]);
        this.nor.push(vn.x, vn.y, vn.z);
        this.col.push(c.r, c.g, c.b);
      }
    }
  }

  box(minX, minY, minZ, maxX, maxY, maxZ, hex, jitter = 0.06) {
    const c = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    const base = this._color(hex);
    const r = base.r * j, g = base.g * j, b = base.b * j;
    const faces = [
      [[maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ]],
      [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]],
      [[minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ]],
      [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]],
      [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]],
      [[minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [maxX, minY, minZ]],
    ];
    for (const f of faces) {
      this.poly(f, 0, c);
      // sobrescribe el color del último quad (6 vértices)
      const n = this.col.length;
      for (let k = n - 18; k < n; k += 3) {
        this.col[k] = r;
        this.col[k + 1] = g;
        this.col[k + 2] = b;
      }
    }
  }

  // Añade una BufferGeometry arbitraria transformada por `matrix`.
  geometry(geo, hex, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const c = this._color(hex, 0.05);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }

  build(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material || new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
