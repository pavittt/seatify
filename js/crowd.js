// Concert crowd drawn as painted people, not blocks.
//
// Every fan is a camera-facing card cut from a texture atlas of hand-painted people: 16 outfits
// (kurtas, tees, hoodies, dupattas, caps, a turban, long and short hair, Indian skin tones), each
// painted from four angles (back, back three-quarter, side, front). The shader picks the angle from
// where the camera is, so a fan in front of you shows their back and a fan across the bowl shows
// their front. Stage light comes from in front of the crowd, so from behind people read the way
// they do in real gig photos: dark shapes with a bright rim and the glow of phone screens.
import * as THREE from 'three';

const COLS = 16, ROWS = 4, CW = 128, CH = 256; // atlas cells: 16 outfits x 4 views
const PX = 118; // pixels per metre inside a cell; ground line at y = 250
export const SPRITE_H = CH / PX; // card height in metres (2.17 m, room for raised hands)
export const SPRITE_W = CW / PX;

function rnd(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

const SKIN = ['#6b3f22', '#7d4a28', '#8d5524', '#a0662f', '#b07446', '#c68642', '#d29a6a', '#e0ac69'];
const HAIR = ['#0d0a08', '#15100c', '#1e1510', '#2a1d14', '#3a2819', '#111', '#5b3a24'];
const TOPS = ['#121216', '#1a1a20', '#f0ece4', '#24283a', '#7d1f2a', '#2e4a7d', '#3b5e3f', '#c9a227', '#5e3a7a', '#a83a5a', '#0e0f13', '#e2d8c4', '#335c67', '#b5542c', '#191919', '#ededed'];
const BOTTOMS = ['#26304a', '#1b1b22', '#3a4a6b', '#2f2a26', '#44445a', '#1e2a3a'];

// one outfit per column, the same person in all four views
function outfit(i) {
  const r = rnd(i + 11);
  const female = r() < 0.45;
  return {
    female,
    skin: SKIN[Math.floor(r() * SKIN.length)],
    hair: HAIR[Math.floor(r() * HAIR.length)],
    top: TOPS[i % TOPS.length],
    bottom: BOTTOMS[Math.floor(r() * BOTTOMS.length)],
    hairStyle: female ? (r() < 0.6 ? 'long' : r() < 0.5 ? 'bun' : 'pony') : (r() < 0.18 ? 'turban' : r() < 0.3 ? 'cap' : 'short'),
    kurta: r() < 0.22,
    dupatta: female && r() < 0.3,
    hoodie: !female && r() < 0.2,
    width: 0.92 + r() * 0.18,
    // arms: 0 both down, 1 right arm up with phone, 2 both up, 3 left arm up (pointing / waving)
    arms: [0, 1, 0, 2, 0, 3, 0, 0][i % 8],
    print: r() < 0.35,
  };
}

function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

// draws one person into ctx (colour) and emis (glowing phone screens) inside a cell at ox, oy
function drawPerson(ctx, emis, ox, oy, o, view) {
  const X = (x) => ox + CW / 2 + x * PX * o.width, Y = (y) => oy + 250 - y * PX;
  const side = view === 2, front = view === 3, three = view === 1;
  const sq = side ? 0.55 : three ? 0.82 : 1; // how wide the body looks from this angle
  const sx = (x) => X(x * sq);
  const blob = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), Y(y)) : ctx.moveTo(sx(x), Y(y)))); ctx.closePath(); ctx.fill(); };
  const ell = (x, y, rx, ry, col, rot = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sx(x), Y(y), rx * PX * o.width * sq, ry * PX, rot, 0, Math.PI * 2); ctx.fill(); };
  const limb = (x0, y0, x1, y1, w0, w1, col) => {
    const ax = sx(x0), ay = Y(y0), bx = sx(x1), by = Y(y1);
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const a = (w0 * PX * o.width) / 2, b = (w1 * PX * o.width) / 2;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(ax + nx * a, ay + ny * a); ctx.lineTo(bx + nx * b, by + ny * b); ctx.lineTo(bx - nx * b, by - ny * b); ctx.lineTo(ax - nx * a, ay - ny * a); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(ax, ay, a, 0, Math.PI * 2); ctx.arc(bx, by, b, 0, Math.PI * 2); ctx.fill();
  };
  const top = o.top, topD = shade(o.top, 0.72), skinD = shade(o.skin, 0.8);
  const hemY = o.kurta ? 0.55 : 0.82;
  // legs and shoes
  for (const s of side ? [0.02] : [-0.085, 0.085]) {
    limb(s, 0.86, s * 1.05, 0.08, 0.15, 0.11, o.female && o.kurta ? shade(o.bottom, 1.3) : o.bottom);
    ell(s * 1.05 + (side ? 0.04 : 0), 0.04, side ? 0.13 : 0.065, 0.045, '#141414');
  }
  // arms hanging (drawn behind the body from the back)
  const down = (s) => { limb(s * 0.215, 1.37, s * 0.255, 1.05, 0.125, 0.1, topD); limb(s * 0.255, 1.04, s * 0.26, 0.8, 0.09, 0.07, o.hoodie ? topD : o.skin); ell(s * 0.26, 0.77, 0.045, 0.055, o.skin); };
  const up = (s, phone) => {
    const hx = s * 0.16, hy = 1.9;
    limb(s * 0.2, 1.4, s * 0.3, 1.62, 0.125, 0.1, topD);
    limb(s * 0.3, 1.62, hx, hy - 0.04, 0.09, 0.07, o.hoodie ? topD : o.skin);
    ell(hx, hy, 0.04, 0.05, o.skin);
    if (phone) {
      // the phone, filming the stage: from behind you see its bright screen
      const pw = 0.075, ph = 0.14, px = sx(hx) - (pw * PX) / 2, py = Y(hy + 0.1);
      ctx.fillStyle = '#0c0c0f'; ctx.fillRect(px - 1, py - 1, pw * PX + 2, ph * PX + 2);
      if (!front) {
        ctx.fillStyle = '#cfd8e6'; ctx.fillRect(px, py, pw * PX, ph * PX);
        emis.fillStyle = '#ffffff'; emis.fillRect(px + 1, py + 1, pw * PX - 2, ph * PX - 2);
      }
    }
  };
  const armL = o.arms === 2 || o.arms === 3 ? 'up' : 'down', armR = o.arms === 1 || o.arms === 2 ? 'up' : 'down';
  if (!front) { if (armL === 'down') down(-1); if (armR === 'down') down(1); }
  // torso: shoulders round into the waist; kurtas run down to the knee
  const sh = o.female ? 0.2 : 0.235, wa = o.female ? 0.15 : 0.18;
  blob([[-wa - 0.01, hemY], [-wa, 0.98], [-sh + 0.01, 1.3], [-sh, 1.38], [-sh + 0.05, 1.44], [-0.06, 1.47], [0.06, 1.47], [sh - 0.05, 1.44], [sh, 1.38], [sh - 0.01, 1.3], [wa, 0.98], [wa + 0.01, hemY]], top);
  // cloth: a soft vertical fold and a darker band at the waist
  ctx.globalAlpha = 0.18; blob([[-0.03, hemY + 0.05], [0.0, 1.35], [0.03, hemY + 0.05]], '#000'); ctx.globalAlpha = 1;
  if (o.print && front) { ctx.globalAlpha = 0.8; ell(0, 1.2, 0.08, 0.07, shade(o.top, o.top > '#8' ? 0.4 : 2.2)); ctx.globalAlpha = 1; }
  if (o.hoodie && !front) blob([[-0.12, 1.42], [0, 1.36], [0.12, 1.42], [0.09, 1.5], [-0.09, 1.5]], topD);
  if (o.dupatta) { ctx.globalAlpha = 0.9; blob([[-0.2, 1.4], [-0.05, 1.46], [0.12, 1.1], [0.2, 0.75], [0.12, 0.72], [0.0, 1.05], [-0.22, 1.3]], shade(TOPS[(TOPS.indexOf(o.top) + 7) % TOPS.length], 1.1)); ctx.globalAlpha = 1; }
  if (front) { if (armL === 'down') down(-1); if (armR === 'down') down(1); }
  // neck and head
  limb(0, 1.44, 0, 1.52, 0.085, 0.08, skinD);
  const hx = side ? 0.025 : 0;
  ell(hx, 1.615, 0.078, 0.108, o.skin);
  if (!side) { ell(-0.08, 1.6, 0.016, 0.028, skinD); ell(0.08, 1.6, 0.016, 0.028, skinD); }
  else { ctx.fillStyle = o.skin; ctx.beginPath(); ctx.moveTo(sx(0.09), Y(1.63)); ctx.lineTo(sx(0.125), Y(1.6)); ctx.lineTo(sx(0.095), Y(1.585)); ctx.fill(); }
  if (front || three) {
    // a face in shadow: just brows and eyes, the way faces read from a distance under stage light
    const fx = three ? 0.03 : 0;
    ctx.fillStyle = 'rgba(20,12,8,0.55)';
    for (const e of three ? [0.0, 0.05] : [-0.03, 0.03]) ctx.fillRect(sx(fx + e) - 2.5, Y(1.635), 5, 2);
    if (!three) ctx.fillRect(sx(-0.012), Y(1.56), 3, 1.5);
  }
  // hair, cap or turban
  const H = o.hair, st = o.hairStyle;
  if (st === 'turban') {
    ell(hx, 1.685, 0.095, 0.075, '#c23a2b'); ell(hx, 1.66, 0.088, 0.06, '#d4473a');
  } else if (st === 'cap') {
    ell(hx, 1.67, 0.085, 0.055, '#1a1d27');
    if (side) ell(0.11, 1.655, 0.06, 0.015, '#1a1d27'); else if (!front) blob([[-0.03, 1.62], [0.03, 1.62], [0.02, 1.66], [-0.02, 1.66]], '#1a1d27');
  } else {
    const cover = front ? 0.45 : side ? 0.7 : 1;
    ctx.fillStyle = H; ctx.beginPath(); ctx.ellipse(sx(hx - (side ? 0.012 : 0)), Y(1.645), 0.084 * PX * o.width * sq, 0.1 * PX, 0, Math.PI, Math.PI * (2 + (cover < 1 ? 0 : 0))); ctx.fill();
    if (!front) ell(hx, 1.615, 0.081, 0.09 * cover, H);
    if (st === 'long') blob([[-0.085, 1.66], [0.085, 1.66], [0.1, 1.38], [0.0, 1.33], [-0.1, 1.38]].map(([x, y]) => [x * (front ? 1.15 : 1), y]), front ? shade(H, 1) : H);
    if (st === 'bun') ell(hx - (side ? 0.07 : 0), front ? 1.74 : 1.66, 0.045, 0.04, H);
    if (st === 'pony') limb(side ? -0.06 : 0, 1.64, side ? -0.09 : 0.01, 1.45, 0.05, 0.03, H);
  }
  if (front) { if (armL === 'up') up(-1, o.arms !== 3); if (armR === 'up') up(1, true); }
  else { if (armL === 'up') up(-1, o.arms !== 3); if (armR === 'up') up(1, true); }
}

let atlasCache = null;
export function crowdAtlas() {
  if (atlasCache) return atlasCache;
  const W = COLS * CW, Hh = ROWS * CH;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const em = document.createElement('canvas'); em.width = W; em.height = Hh;
  const ctx = cv.getContext('2d'), ectx = em.getContext('2d');
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, Hh);
  const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH; const t = tmp.getContext('2d');
  const etmp = document.createElement('canvas'); etmp.width = CW; etmp.height = CH; const et = etmp.getContext('2d');
  const rim = document.createElement('canvas'); rim.width = CW; rim.height = CH; const r = rim.getContext('2d');
  for (let i = 0; i < COLS; i++) {
    const o = outfit(i);
    for (let v = 0; v < ROWS; v++) {
      t.clearRect(0, 0, CW, CH); et.fillStyle = '#000'; et.fillRect(0, 0, CW, CH);
      // a slight weight shift so nobody stands like a mannequin, and a soft lens blur
      const lean = (((i * 7 + v * 3) % 5) - 2) * 0.018;
      for (const c of [t, et]) { c.save(); c.translate(CW / 2, 250); c.rotate(lean); c.translate(-CW / 2, -250); }
      t.filter = 'blur(0.6px)';
      drawPerson(t, et, 0, 0, o, v);
      t.filter = 'none';
      for (const c of [t, et]) c.restore();
      ectx.drawImage(etmp, i * CW, v * CH);
      // rim light: the stage is beyond the person, so light wraps round the outline. Build an edge
      // band by knocking the silhouette out of a shifted copy of itself, then blur it.
      r.clearRect(0, 0, CW, CH);
      r.globalCompositeOperation = 'source-over'; r.filter = 'none';
      r.drawImage(tmp, 0, 0);
      r.globalCompositeOperation = 'source-in'; r.fillStyle = v === 3 ? '#ffe3c2' : '#ffd7b0'; r.fillRect(0, 0, CW, CH);
      r.globalCompositeOperation = 'destination-out'; r.drawImage(tmp, 0, v === 3 ? -2 : 3);
      // shading: lit from the front, so the back view is darker in the middle
      t.globalCompositeOperation = 'source-atop';
      const g = t.createLinearGradient(0, 0, CW, 0);
      const mid = v === 3 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.38)';
      g.addColorStop(0, 'rgba(0,0,0,0.1)'); g.addColorStop(0.5, mid); g.addColorStop(1, 'rgba(0,0,0,0.1)');
      t.fillStyle = g; t.fillRect(0, 0, CW, CH);
      const g2 = t.createLinearGradient(0, 0, 0, CH); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.65, 'rgba(0,0,0,0.05)'); g2.addColorStop(1, 'rgba(0,0,0,0.45)');
      t.fillStyle = g2; t.fillRect(0, 0, CW, CH);
      t.globalAlpha = v === 3 ? 0.45 : 0.85; t.filter = 'blur(1.2px)'; t.drawImage(rim, 0, 0); t.filter = 'none'; t.globalAlpha = 1;
      t.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, i * CW, v * CH);
    }
  }
  const mk = (c) => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.anisotropy = 4; return tx; };
  atlasCache = { map: mk(cv), emis: mk(em), canvas: cv };
  return atlasCache;
}

// spots: [{x, y, z, yaw, scale, light}] -> one instanced mesh of camera-facing people
export function createCrowdMesh(spots, { uTime, fog }) {
  const atlas = crowdAtlas();
  const base = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H); base.translate(0, SPRITE_H / 2, 0);
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const N = spots.length, P = new Float32Array(N * 3), D = new Float32Array(N * 4);
  spots.forEach((s, i) => { P.set([s.x, s.y, s.z], i * 3); D.set([s.variant, s.yaw, s.scale, s.light], i * 4); });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(D, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: atlas.map }, uEmis: { value: atlas.emis }, uTime, uLight: { value: 0.6 },
      uRim: { value: new THREE.Color('#ffb98a') }, fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far },
    },
    vertexShader: `
      attribute vec3 iPos; attribute vec4 iData;
      uniform float uTime;
      varying vec2 vUv; varying float vLight; varying float vFog;
      uniform float fogNear; uniform float fogFar;
      void main() {
        float yaw = iData.y, sc = iData.z;
        vec3 toCam = cameraPosition - iPos; toCam.y = 0.0; float L = length(toCam); toCam /= max(L, 1e-4);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        // which view of the person faces the camera: back, back 3/4, side or front
        vec2 f = vec2(sin(yaw), cos(yaw)), v = toCam.xz;
        float d = dot(f, v), crs = f.x * v.y - f.y * v.x;
        float row = d < -0.72 ? 0.0 : d < -0.2 ? 1.0 : d < 0.4 ? 2.0 : 3.0;
        float flip = (row > 0.5 && row < 2.5 && crs < 0.0) || (row > 2.5 && crs > 0.0) ? -1.0 : 1.0;
        float ph = iPos.x * 1.7 + iPos.z * 2.3;
        float jumper = step(0.6, fract(sin(ph) * 43758.5453));
        float hop = max(0.0, sin(uTime * 5.2 + ph)) * 0.1 * jumper;
        vec3 p = iPos + right * position.x * sc * flip + vec3(0.0, position.y * sc + hop, 0.0);
        vUv = vec2((iData.x + uv.x) / ${COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ROWS}.0);
        vLight = iData.w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFog = smoothstep(fogNear, fogFar, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform sampler2D uEmis; uniform float uLight; uniform vec3 fogColor;
      varying vec2 vUv; varying float vLight; varying float vFog;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.38) discard;
        vec3 e = texture2D(uEmis, vUv).rgb;
        vec3 col = c.rgb * uLight * vLight + e * vec3(0.55, 0.55, 0.52);
        gl_FragColor = vec4(mix(col, fogColor, vFog), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.userData.crowd = true;
  return mesh;
}
