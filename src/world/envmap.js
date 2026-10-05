import * as THREE from 'three';

// Mapa de entorno (IBL) generado a partir de un cielo simplificado: da a los
// materiales PBR reflejos suaves y luz ambiental con dirección (cielo azul
// arriba, suelo verde abajo y el sol), en vez del color plano de antes.
export function makeEnvironment(renderer, sunDir) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(100, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sunDir: { value: sunDir.clone().normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.32, 0.55, 0.95);
        vec3 hor = vec3(0.86, 0.92, 1.0);
        vec3 gnd = vec3(0.30, 0.36, 0.22);
        vec3 col = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor * 0.8, gnd, pow(-h, 0.35));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 64.0) * 6.0 + pow(s, 6.0) * 0.4);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return tex;
}
