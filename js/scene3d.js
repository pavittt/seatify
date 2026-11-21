// The 3D "view from your seat": stepped stands, stage, lights and a crowd of
// chunky toy-block people rendered with instancing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CATS } from './data/venues.js';
import { ROW_D, EYE, hash01, priceOf, fmtINR } from './model.js';
import { createCrowdMesh } from './crowd.js';

// Gig crowds dress dark: mostly black and band tees, a few whites and colours.
const SHIRTS = ['#111114', '#141418', '#1a1a20', '#0e0f13', '#22252e', '#2b2f3a', '#1d2433', '#f1ede4', '#e9e4da', '#7d1f2a', '#2e4a7d', '#3b5e3f', '#c9a227', '#5e3a7a', '#a83a5a', '#1e1e1e'];
const PANTS = ['#26304a', '#1b1b22', '#3a4a6b', '#5b4636', '#2f3e2f', '#44445a'];
const SKIN = ['#8d5524', '#a0662f', '#c68642', '#b87a4b', '#e0ac69', '#7a4a26', '#d29a6a'];
const TOY = ['#ffcf3a'];
// long side of the frame at 1x zoom, in degrees (phone main camera)
export const LENS_DEG = 68;
// a phone held up at eye level by a standing fan
const PHONE_Y = EYE + 0.13;
const HAIR = ['#14110f', '#2b1d14', '#3d2a1c', '#5a3b25', '#1c1c1c', '#c8572e', '#6b6b6b'];

function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function shape(g, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0 } = {}) {
  g.scale(sx, sy, sz); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g;
}
function merge(geoms) {
  // tiny merge for non-indexed copies
  const parts = geoms.map((g) => g.toNonIndexed());
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// A moulded plastic stadium seat: a dished pan that curves up into a tall back, the sides of
// both lifted like a bucket, on a short pedestal. Built as one bent sheet (double-sided).
function bucketSeat() {
  const prof = [[0.2, 0.43], [0.1, 0.415], [0.0, 0.41], [-0.1, 0.42], [-0.16, 0.45], [-0.19, 0.53], [-0.21, 0.63], [-0.225, 0.73], [-0.235, 0.81]];
  const U = 7, pos = [], idx = [];
  for (let j = 0; j < prof.length; j++) for (let i = 0; i <= U; i++) {
    const u = i / U - 0.5, x = u * 0.44, lip = (2 * u) ** 2;
    const [z, y] = prof[j], back = j >= 4;
    pos.push(x, y + (back ? 0 : lip * 0.045), z + (back ? lip * 0.05 : 0));
  }
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < U; i++) { const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const sheet = new THREE.BufferGeometry(); sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sheet.setIndex(idx); sheet.computeVertexNormals();
  const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.4, 6); stem.translate(0, 0.2, -0.02);
  return merge([sheet, stem]);
}

function sePoint(a, b, n, t) {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / n;
  return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

// Flat layers on the field (grass, track, deck, zone tints) sit a few cm apart. Seen from the
// 300 m hero shot that is below depth precision, so they flickered into jagged stripes and
// wedges. Lift each layer and give it a polygon offset so the upper one always wins.
function flatLayer(m, k) {
  m.material.polygonOffset = true; m.material.polygonOffsetFactor = -k; m.material.polygonOffsetUnits = -4 * k;
  return m;
}

export class SeatView {
  constructor(canvas, { interactive = true, background = '#07080f' } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07080f');
    // light night air: the far stand of a 230 m bowl should still be there, just a little hazy
    this.scene.fog = new THREE.Fog('#07080f', 280, 1600);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.2, 1500);
    // bloom makes LED walls, lenses and beams glow like they do through haze
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // the composer's buffers have no MSAA, so smooth edges with FXAA (an MSAA buffer drew a black
    // block over the hero on Mac GPUs)
    this.fxaa = new ShaderPass(FXAAShader); this.composer.addPass(this.fxaa);
    this.clock = new THREE.Clock();
    this.uTime = { value: 0 };
    this.anim = [];
    this.yaw = 0; this.pitch = 0; this.fov = 50;
    // light-up wave across the chairs: seats within `reveal` metres of `revealOrigin` are lit
    this.reveal = { value: 1e6 }; this.revealOrigin = { value: new THREE.Vector2() };
    this.running = false;
    this.toyHeads = false;
    if (interactive) this._bindControls();
    this.scene.background = new THREE.Color(background); this.scene.fog.color.set(background);
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.bloom.resolution.set((w * pr) / 2, (h * pr) / 2);
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.camera.aspect = w / h;
    if (this.eye) {
      // keep whatever zoom the viewer chose (1x, 2x...) when the window changes shape
      const k = this.rest ? this.rest.fov / this.fov : 1;
      this._frameStage(); this.fov = this.rest.fov / k;
    }
    this.camera.updateProjectionMatrix();
  }

  // ---------- scene building ----------
  load(model) {
    if (this.model === model) return;
    this.model = model;
    if (this.root) { this.scene.remove(this.root); this.root.traverse((o) => { o.geometry?.dispose?.(); }); }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.fog.near = 280; this.scene.fog.far = 1600; this._fog0 = null;
    this.blockers = [];
    this.targets = [];
    this.anim = [];

    this.hemi = new THREE.HemisphereLight('#7f8fc7', '#2a2228', 1.0); this.root.add(this.hemi);
    this.house = new THREE.AmbientLight('#e8eeff', 0); this.root.add(this.house);
    // stadium floodlights, on with the house lights (Empty venue / walk-in)
    this.flood = new THREE.DirectionalLight('#fff3df', 0); this.flood.position.set(70, 140, 50); this.root.add(this.flood);
    // the arena's working lights: a wash from high over the middle of the bowl
    this.ovLight = new THREE.PointLight('#d6e2ff', 0, 0, 0); this.ovLight.position.set(0, 70, 0); this.root.add(this.ovLight);
    const moon = new THREE.DirectionalLight('#b9c6ff', 0.45); moon.position.set(-80, 160, 120); this.root.add(moon);
    // light spilling off the stage onto the crowd's faces
    const spill = new THREE.DirectionalLight('#ffb38a', 0.55); spill.position.set(0, 30, model.stage.type === 'center' ? 0 : model.stage.zBack); spill.target.position.set(0, 0, 60); this.root.add(spill, spill.target);
    this.anim.push((t) => spill.color.setHSL((0.03 + t * 0.02) % 1, 0.6, 0.65));
    const stageGlow = new THREE.PointLight('#ff7ad9', 2.2, 260, 1.2);
    const st = model.stage;
    stageGlow.position.set(0, 20, st.type === 'center' ? st.z : st.zFront + 8);
    this.root.add(stageGlow);
    this.anim.push((t) => { stageGlow.color.setHSL((t * 0.05) % 1, 0.8, 0.6); });

    this._buildGround(model);
    if (model.venue.bowl) this._buildBowl(model);
    this._buildStands(model);
    this._buildStage(model);
    this._buildObstacles(model);
    this._buildSky(model);
    this._buildSeatField(model);
    this._buildPickers(model);
    this.marker = null; this.hover = null; this._hiddenIdx = null;
  }

  _buildSky(model) {
    if (model.venue.bowl?.dome) return;
    const g = new THREE.BufferGeometry(); const N = 900; const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = hash01('s' + i) * Math.PI * 2, ph = 0.12 + hash01('p' + i) * 1.3, R = 900;
      p.set([Math.cos(th) * Math.cos(ph) * R, Math.sin(ph) * R, Math.sin(th) * Math.cos(ph) * R], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.6, sizeAttenuation: false, fog: false }));
    this.root.add(stars);
  }

  _maxAniso() { return this.renderer.capabilities.getMaxAnisotropy(); }

  // mown stadium grass: soft 6 m stripes with fine noise. Smooth, mipmapped and anisotropic so it
  // stays clean (no shimmer or pixel steps) when you look down at it from the top tier.
  _grassTex() {
    if (this._grass) return this._grass;
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    for (let i = 0; i < 512; i++) {
      const s = 0.5 + 0.5 * Math.cos((i / 512) * Math.PI * 2);
      x.fillStyle = `rgb(${Math.round(58 + 14 * s)},${Math.round(100 + 18 * s)},${Math.round(48 + 8 * s)})`;
      x.fillRect(i, 0, 1, 512);
    }
    const img = x.getImageData(0, 0, 512, 512), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.6; }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 12, 1 / 12); t.anisotropy = this._maxAniso();
    return (this._grass = t);
  }

  // floor protection decking over the pitch: 2 x 1 m grey panels, faint seams
  _deckTex(w, d) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#2a2b30'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3;
    for (let i = 0; i <= 256; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
    for (let j = 0; j <= 256; j += 64) { x.beginPath(); x.moveTo(0, j); x.lineTo(256, j); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 4, d / 4); t.anisotropy = this._maxAniso();
    return t;
  }

  _buildGround(model) {
    const v = model.venue;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: v.scenery === 'palms' ? '#2a2418' : '#141a16' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; this.root.add(ground);

    if (model.field.type === 'bowl') {
      const { a, b, n } = model.field; const shape = new THREE.Shape();
      for (let i = 0; i <= 96; i++) { const [x, z] = sePoint(a, b, n, (i / 96) * Math.PI * 2); i ? shape.lineTo(x, -z) : shape.moveTo(x, -z); }
      const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), v.kind === 'arena'
        ? new THREE.MeshLambertMaterial({ color: '#2a2a2e' })
        : new THREE.MeshLambertMaterial({ map: this._grassTex() }));
      f.rotation.x = -Math.PI / 2; f.position.y = 0; this.root.add(f);
    } else {
      const { w, d } = model.field;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: v.scenery === 'palms' ? '#2e271c' : '#18201a' }));
      f.rotation.x = -Math.PI / 2; this.root.add(f);
      // perimeter fence
      const fenceMat = new THREE.MeshLambertMaterial({ color: '#2b2f3d' });
      for (const [x, z, sx, sz] of [[0, -d / 2, w, 0.3], [0, d / 2, w, 0.3], [-w / 2, 0, 0.3, d], [w / 2, 0, 0.3, d]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.4, sz), fenceMat); m.position.set(x, 1.2, z); this.root.add(m);
      }
      this._buildScenery(model);
    }
    // floor deck and standing zones
    const fl = model.floor;
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(fl.x1 - fl.x0, fl.z1 - fl.z0), new THREE.MeshLambertMaterial({ color: '#26272c' }));
    deck.rotation.x = -Math.PI / 2; deck.position.set((fl.x0 + fl.x1) / 2, 0.12, (fl.z0 + fl.z1) / 2); flatLayer(deck, 2); this.root.add(deck);
    deck.material.map = this._deckTex(fl.x1 - fl.x0, fl.z1 - fl.z0); deck.material.color.set('#ffffff');
    const barrierMat = new THREE.MeshLambertMaterial({ color: '#9aa3b8' });
    for (const z of model.zones) {
      const mat = new THREE.MeshBasicMaterial({ color: CATS[z.cat].color, transparent: true, opacity: 0.035, depthWrite: false });
      if (z.ring) {
        const m = new THREE.Mesh(new THREE.RingGeometry(z.ring.r0, z.ring.r1, 48), mat);
        m.rotation.x = -Math.PI / 2; m.position.set(z.ring.x, 0.16, z.ring.z); flatLayer(m, 3); this.root.add(m);
      } else {
        const r = z.rect;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), mat);
        m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, 0.16, (r.z0 + r.z1) / 2); flatLayer(m, 3); this.root.add(m);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 1.1, 0.15), barrierMat);
        bar.position.set((r.x0 + r.x1) / 2, 0.55, r.z0 - 0.5); this.root.add(bar);
      }
    }
  }

  _buildScenery(model) {
    const { w, d } = model.field; const kind = model.venue.scenery;
    if (kind === 'city') {
      // unlit: the skyline is a dark silhouette at night, it should not catch the stage wash
      const mat = new THREE.MeshBasicMaterial({ color: '#0d1018' });
      const winMat = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
      for (let i = 0; i < 70; i++) {
        const ang = hash01('b' + i) * Math.PI * 2, R = Math.max(w, d) * 0.8 + hash01('r' + i) * 260;
        const h = 18 + hash01('h' + i) * 90, bw = 14 + hash01('w' + i) * 30;
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bw), mat);
        m.position.set(Math.cos(ang) * R, h / 2, Math.sin(ang) * R); this.root.add(m);
        if (hash01('l' + i) > 0.4) { const win = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.6, h * 0.7), winMat); win.material = winMat.clone(); win.material.transparent = true; win.material.opacity = 0.08 + hash01('o' + i) * 0.12; win.position.copy(m.position); win.lookAt(0, h / 2, 0); win.translateZ(bw / 2 + 0.2); this.root.add(win); }
      }
    } else if (kind === 'palms' || kind === 'trees') {
      const trunk = new THREE.MeshLambertMaterial({ color: '#3b2a1c' });
      const leaf = new THREE.MeshLambertMaterial({ color: kind === 'palms' ? '#1f4a2a' : '#1a3a22' });
      for (let i = 0; i < 90; i++) {
        const ang = hash01('t' + i) * Math.PI * 2, R = Math.max(w, d) * 0.62 + hash01('tr' + i) * 120;
        const h = 8 + hash01('th' + i) * 8; const g = new THREE.Group();
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 6), trunk); t.position.y = h / 2; g.add(t);
        const top = kind === 'palms' ? new THREE.Mesh(new THREE.ConeGeometry(4, 2.5, 7), leaf) : new THREE.Mesh(new THREE.IcosahedronGeometry(4.5, 0), leaf);
        top.position.y = h + 0.5; g.add(top);
        g.position.set(Math.cos(ang) * R, 0, Math.sin(ang) * R); this.root.add(g);
      }
    }
  }

  _buildBowl(model) {
    const { a, b, n } = model.field;
    const pos = [], col = [];
    const c = new THREE.Color();
    const quad = (p1, p2, p3, p4, color) => { pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4); for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b); };
    const ribbonPos = [], boxQuads = [];
    for (const s of model.sections) {
      if (s.kind !== 'arc') continue;
      const base = new THREE.Color(s.closed ? '#22242e' : '#3a3f4f').lerp(new THREE.Color(CATS[s.cat].color), s.closed ? 0 : 0.18);
      const M = 12;
      for (let r = 0; r < s.rowsCount; r++) {
        const dIn = s.d0 + r * ROW_D - ROW_D / 2, dOut = dIn + ROW_D;
        const y = s.base + r * s.rake, yNext = y + s.rake;
        // treads take the colour of the seats bolted to them (from far away a stand reads as its
        // seat colour), risers are the darker concrete face between rows
        // `seats` is one palette for the whole bowl, or one palette per tier
        const sp = model.venue.bowl.seats || ['#2a3550'];
        const pal = Array.isArray(sp[0]) ? sp[Math.min(s.tierIdx, sp.length - 1)] : sp;
        const secIdx = model.sections.indexOf(s);
        const mixed = model.venue.bowl.seatMix === 'random';
        c.set(pal[(secIdx + s.tierIdx) % pal.length]).multiplyScalar((r % 2 ? 0.86 : 1) * (s.closed ? 0.45 : 1));
        const zig = model.venue.bowl.zigzag && s.tierIdx === model.venue.bowl.zigzag.tier ? new THREE.Color(model.venue.bowl.zigzag.color) : null;
        const cZig = zig && zig.clone().multiplyScalar((r % 2 ? 0.86 : 1) * (s.closed ? 0.45 : 1));
        const riser = new THREE.Color('#55565c').multiplyScalar(s.closed ? 0.5 : 1);
        const concrete = new THREE.Color('#8a8b90').multiplyScalar(s.closed ? 0.5 : 1);
        const seatCol = new THREE.Color(s.closed ? '#121318' : '#262a36').lerp(new THREE.Color(CATS[s.cat].color), 0.22);
        const seatTop = seatCol.clone().multiplyScalar(1.25);
        for (let i = 0; i < M; i++) {
          const ta = s.t0 + ((s.t1 - s.t0) * i) / M, tb = s.t0 + ((s.t1 - s.t0) * (i + 1)) / M;
          const A = sePoint(a + dIn, b + dIn, n, ta), B = sePoint(a + dIn, b + dIn, n, tb);
          const C = sePoint(a + dOut, b + dOut, n, tb), D = sePoint(a + dOut, b + dOut, n, ta);
          const aisle = i === 0;
          let tc = c;
          if (mixed) tc = new THREE.Color(pal[Math.floor(hash01('m' + secIdx + r + i) * pal.length)]).multiplyScalar((r % 2 ? 0.86 : 1) * (s.closed ? 0.45 : 1));
          if (zig) {
            // the big chevrons picked out in the seats, as in the Motera upper tier
            const u = (secIdx % 36) * M + i, P = 30, tri = Math.abs((u % P) - P / 2) / (P / 2);
            if (Math.abs(r - (4 + tri * (s.rowsCount - 10))) < 2.2) tc = cZig;
          }
          quad([A[0], y, A[1]], [B[0], y, B[1]], [C[0], y, C[1]], [D[0], y, D[1]], aisle ? concrete : tc);
          if (!aisle && !s.closed && this.lowDetail) {
            // a row of plastic seat backs near the back of each tread
            const P = [A[0] + (D[0] - A[0]) * 0.7, A[1] + (D[1] - A[1]) * 0.7], Q = [B[0] + (C[0] - B[0]) * 0.7, B[1] + (C[1] - B[1]) * 0.7];
            quad([P[0], y + 0.05, P[1]], [Q[0], y + 0.05, Q[1]], [Q[0], y + 0.5, Q[1]], [P[0], y + 0.5, P[1]], seatCol);
            quad([P[0], y + 0.42, P[1]], [Q[0], y + 0.42, Q[1]], [Q[0] + (C[0] - Q[0]) * 0.4, y + 0.44, Q[1] + (C[1] - Q[1]) * 0.4], [P[0] + (D[0] - P[0]) * 0.4, y + 0.44, P[1] + (D[1] - P[1]) * 0.4], seatTop);
          }
          const top = r === s.rowsCount - 1 ? y + 2.2 : yNext;
          quad([D[0], y, D[1]], [C[0], y, C[1]], [C[0], top, C[1]], [D[0], top, D[1]], riser);
          if (r === 0) {
            const yb = s.tierIdx === 0 ? 0 : y - 1.3;
            const fc = new THREE.Color('#15161d');
            quad([A[0], yb, A[1]], [B[0], yb, B[1]], [B[0], y, B[1]], [A[0], y, A[1]], fc);
            ribbonPos.push([A, B, y - 0.75, s.closed]);
            if (s.tierIdx > 0) {
              // the box / concourse level under the overhang: a band of lit glass behind the lower tier
              const below = model.tierInfo[s.tierIdx - 1];
              const dB = below.dEnd + ROW_D * 1.5, y0 = below.top + 0.6, y1 = Math.min(s.base - 1.6, y0 + 4.2);
              if (y1 > y0 + 1) {
                const P1 = sePoint(a + dB, b + dB, n, ta), P2 = sePoint(a + dB, b + dB, n, tb);
                const lit = i % 3 === 1 ? 0.25 : 0.85 + hash01('bx' + secIdx + i) * 0.3;
                boxQuads.push([[P1[0], y0, P1[1]], [P2[0], y0, P2[1]], [P2[0], y1, P2[1]], [P1[0], y1, P1[1]], s.closed ? 0.05 : lit]);
              }
            }
          }
          if (s.tierIdx > 0 && r === s.rowsCount - 1) {
            // underside of an overhanging tier, from the fascia back to the top row
            const A0 = sePoint(a + s.d0 - ROW_D / 2, b + s.d0 - ROW_D / 2, n, ta), B0 = sePoint(a + s.d0 - ROW_D / 2, b + s.d0 - ROW_D / 2, n, tb);
            quad([A0[0], s.base - 1.3, A0[1]], [B0[0], s.base - 1.3, B0[1]], [C[0], top - 3, C[1]], [D[0], top - 3, D[1]], new THREE.Color('#4a4b52'));
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const standMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // close up you see the grey concrete steps between the chairs; far away the chairs are too
    // small to draw, so the steps take the seat colour and the stand reads the way it does in photos
    standMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying float vCamD;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n  vCamD = -mvPosition.z;');
      sh.fragmentShader = 'varying float vCamD;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(0.36, 0.36, 0.38), diffuseColor.rgb, smoothstep(10.0, 45.0, vCamD));');
    };
    const stands = new THREE.Mesh(g, standMat);
    stands.userData.label = 'Tier above';
    this.root.add(stands);
    this.blockers.push(stands);

    if (boxQuads.length) {
      const bp = [], bc = [], warm = new THREE.Color('#ffcf94');
      for (const [p1, p2, p3, p4, k] of boxQuads) { bp.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4); for (let i = 0; i < 6; i++) bc.push(warm.r * k * 0.55, warm.g * k * 0.55, warm.b * k * 0.55); }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      this.root.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
    // LED ribbon boards on each tier fascia
    const rp = [], rc = [];
    for (const [A, B, y, closed] of ribbonPos) {
      const h = 0.45;
      rp.push(A[0], y - h, A[1], B[0], y - h, B[1], B[0], y + h, B[1], A[0], y - h, A[1], B[0], y + h, B[1], A[0], y + h, A[1]);
      const cc = closed ? [0.05, 0.05, 0.08] : [0.75, 0.75, 0.75];
      for (let i = 0; i < 6; i++) rc.push(...cc);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    this.root.add(new THREE.Mesh(rg, ribbonMat));
    // fascia boards are dimmed for a show, not a rainbow
    ribbonMat.color.setRGB(0.32, 0.34, 0.4);
    this._buildPriceBoards(model);

    const last = model.tierInfo[model.tierInfo.length - 1];
    const v = model.venue;
    if (v.bowl.roof) this._buildRoof(model, last);
    if (v.bowl.track) this._buildTrack(model);
    if (v.bowl.dome) {
      const R = a + last.dEnd + 3, Rz = b + last.dEnd + 3;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#171a26', side: THREE.BackSide }));
      dome.scale.set(R, last.top + 18, Rz); this.root.add(dome);
      const ribs = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.LineBasicMaterial({ color: '#2b3150' }));
      ribs.scale.copy(dome.scale).multiplyScalar(0.995); this.root.add(ribs);
      this.scene.fog.near = 120; this.scene.fog.far = 700;
    } else { this.scene.fog.near = 280; this.scene.fog.far = 1600; }
    this._fog0 = { near: this.scene.fog.near, far: this.scene.fog.far };
  }

  // Stadium roofs from the venue spec: a canopy from the inner edge (d, y) out past the top row
  // (yOut), optionally only over some stands (spans, in degrees round the bowl), split into
  // gull-wing panels (DY Patil), folded into membrane ridges (JLN) or lit by an LED ring (NMS).
  _buildRoof(model, last) {
    const { a, b, n } = model.field, R = model.venue.bowl.roof;
    const dIn = R.d, dOut = last.dEnd + 3, yIn = R.y, yOut = R.yOut ?? R.y;
    const spans = (R.spans || [[-180, 180]]).map(([f, t]) => [(f * Math.PI) / 180, (t * Math.PI) / 180]);
    const pos = [], edge = [], M = 180;
    const P = (d, t, y) => { const q = sePoint(a + d, b + d, n, t); return [q[0], y, q[1]]; };
    for (const [from, to] of spans) {
      const steps = Math.max(8, Math.round((M * (to - from)) / (2 * Math.PI)));
      for (let i = 0; i < steps; i++) {
        const ta = from + ((to - from) * i) / steps, tb = from + ((to - from) * (i + 1)) / steps;
        if (R.gullWing) {
          // separate canopy panels with a gap between them, each lifted at the front edge
          const panel = 14, k = i % panel;
          if (k === panel - 1) continue;
        }
        // membrane: alternate ridge and valley lines round the ring
        const fold = R.membrane ? (i % 2 ? -1.4 : 1.4) : 0;
        const A = P(dIn, ta, yIn + (R.membrane ? -fold : 0)), B = P(dIn, tb, yIn + fold), C = P(dOut, tb, yOut + fold * 0.3), D = P(dOut, ta, yOut - fold * 0.3);
        pos.push(...A, ...B, ...C, ...A, ...C, ...D);
        edge.push(new THREE.Vector3(A[0], A[1] - 0.3, A[2]), new THREE.Vector3(B[0], B[1] - 0.3, B[2]));
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const roof = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: R.color || '#c9ccd2', side: THREE.DoubleSide, emissive: new THREE.Color(R.color || '#c9ccd2').multiplyScalar(0.05) }));
    roof.userData.label = 'Roof';
    this.root.add(roof); this.blockers.push(roof);
    // the outer wall of the bowl up to the roof, so the stadium reads as closed from inside
    const wall = [];
    for (let i = 0; i < M; i++) {
      const ta = -Math.PI + (2 * Math.PI * i) / M, tb = -Math.PI + (2 * Math.PI * (i + 1)) / M;
      const inSpan = spans.some(([f, t]) => ta >= f - 1e-6 && tb <= t + 1e-6);
      const top = inSpan ? yOut : last.top + 2.5;
      const A = P(dOut, ta, last.top), B = P(dOut, tb, last.top), C = P(dOut, tb, top), D = P(dOut, ta, top);
      wall.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3)); wg.computeVertexNormals();
    this.root.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: '#3a3c44', side: THREE.DoubleSide })));
    // roof edge: a lit LED ring (NMS), white edge trim, or floodlight banks (Salt Lake)
    const edgeMat = new THREE.LineBasicMaterial({ color: R.ledRing ? new THREE.Color('#ffd8a8').multiplyScalar(1.6) : '#cfd6e6', toneMapped: !R.ledRing });
    this.root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edge), edgeMat));
    if (R.ledRing) this.anim.push((t) => edgeMat.color.setHSL((0.08 + t * 0.03) % 1, 0.9, 0.62));
    if (R.floodlights || R.membrane) {
      // banks of floodlights hung under the roof edge, switched off for the show but visible
      const bank = new THREE.BoxGeometry(4.5, 1.2, 0.8);
      const mat = new THREE.MeshLambertMaterial({ color: '#2a2c33', emissive: new THREE.Color('#1c1e26') });
      const N = 40; const im = new THREE.InstancedMesh(bank, mat, N); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2; const [x, y, z] = P(dIn + 1.5, t, yIn - 1.4);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-x, -z)); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4);
      }
      this.root.add(im);
    }
    if (R.membrane) {
      // the ring of white masts and the colonnade that carry the JLN roof
      const mast = new THREE.CylinderGeometry(0.5, 0.7, 1, 6);
      const N = 48; const im = new THREE.InstancedMesh(mast, new THREE.MeshLambertMaterial({ color: '#e9ecef' }), N); const m4 = new THREE.Matrix4();
      for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2; const [x, , z] = P(dOut + 6, t, 0); m4.compose(new THREE.Vector3(x, (yOut + 10) / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, yOut + 10, 1)); im.setMatrixAt(i, m4); }
      this.root.add(im);
    }
  }

  // red athletics track round the infield (JLN, Salt Lake, Gachibowli)
  _buildTrack(model) {
    const { a, b, n } = model.field, shape = new THREE.Shape(), hole = new THREE.Path();
    const pts = (k, path) => { for (let i = 0; i <= 120; i++) { const [x, z] = sePoint(a - k, b - k, n, (i / 120) * Math.PI * 2); i ? path.lineTo(x, -z) : path.moveTo(x, -z); } };
    pts(0, shape); pts(13, hole); shape.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshLambertMaterial({ color: '#8f3a2a' }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; flatLayer(m, 1); this.root.add(m);
  }

  _buildStands(model) {
    const pos = [], col = [];
    const quad = (p1, p2, p3, p4, c) => { pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4); for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b); };
    for (const s of model.sections) {
      if (s.kind !== 'line') continue;
      const [fx, fz] = s.stand.f, [rx, rz] = s.right, o = s.stand.origin;
      const at = (lat, back, y) => [o[0] + rx * lat - fx * back, y, o[1] + rz * lat - fz * back];
      const base = new THREE.Color('#3a3f4f').lerp(new THREE.Color(CATS[s.cat].color), 0.18);
      for (let r = 0; r < s.rowsCount; r++) {
        const b0 = r * ROW_D - ROW_D / 2, b1 = b0 + ROW_D, y = s.base + r * s.rake;
        const c = base.clone().multiplyScalar(r % 2 ? 0.55 : 0.68);
        quad(at(s.s0, b0, y), at(s.s1, b0, y), at(s.s1, b1, y), at(s.s0, b1, y), c);
        quad(at(s.s0, b1, y), at(s.s1, b1, y), at(s.s1, b1, y + s.rake), at(s.s0, b1, y + s.rake), c.clone().multiplyScalar(0.6));
        if (r === 0) quad(at(s.s0, b0, 0), at(s.s1, b0, 0), at(s.s1, b0, y), at(s.s0, b0, y), new THREE.Color('#15161d'));
      }
      // back rail
      const bk = (s.rowsCount - 0.5) * ROW_D, yt = s.base + s.rowsCount * s.rake;
      quad(at(s.s0, bk, 0), at(s.s1, bk, 0), at(s.s1, bk, yt + 1.1), at(s.s0, bk, yt + 1.1), new THREE.Color('#1a1c26'));
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  // LED wall content: drawn small and scaled up with nearest filtering, then a dark
  // pixel grid on top, so up close it reads as an LED panel rather than a flat picture.
  _drapeTexture() {
    if (this._drape) return this._drape;
    const c = document.createElement('canvas'); c.width = 256; c.height = 16;
    const g = c.getContext('2d');
    for (let x = 0; x < 256; x++) { const v = 70 + 45 * Math.sin(x * 0.42) + 18 * Math.sin(x * 1.3 + 1); g.fillStyle = `rgb(${v | 0},${v | 0},${(v + 6) | 0})`; g.fillRect(x, 0, 1, 16); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace;
    return (this._drape = t);
  }

  _screenTexture(w, h, kind) {
    const PX = kind === 'main' ? 192 : 72;
    const cv = document.createElement('canvas'); cv.width = PX * 2; cv.height = Math.max(8, Math.round((PX * h) / w)) * 2;
    const ctx = cv.getContext('2d'); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
    const title = (this.showTitle || 'LIVE').toUpperCase();
    const draw = (t) => {
      const W = cv.width, H = cv.height;
      const hue = (t * 14) % 360;
      if (kind === 'side' || kind === 'cam') {
        // IMAG camera feed: a close-up of the singer, warm key light, dark background
        const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, H * 0.8);
        g.addColorStop(0, `hsl(${hue} 70% 32%)`); g.addColorStop(1, '#05040a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const sway = Math.sin(t * 1.4) * W * 0.04, cx = W / 2 + sway;
        ctx.fillStyle = '#0d0a10';
        ctx.beginPath(); ctx.ellipse(cx, H * 1.05, W * 0.36, H * 0.42, 0, 0, Math.PI * 2); ctx.fill(); // shoulders
        ctx.fillStyle = '#c98b5e'; ctx.beginPath(); ctx.ellipse(cx, H * 0.47, W * 0.15, H * 0.2, 0, 0, Math.PI * 2); ctx.fill(); // face
        ctx.fillStyle = '#16100c'; ctx.beginPath(); ctx.ellipse(cx, H * 0.33, W * 0.17, H * 0.11, 0, Math.PI, 0); ctx.fill(); // hair
        ctx.fillStyle = `hsl(${(hue + 180) % 360} 80% 60%)`; ctx.globalAlpha = 0.45; ctx.fillRect(cx + W * 0.08, H * 0.3, W * 0.1, H * 0.4); ctx.globalAlpha = 1; // rim light
        ctx.fillStyle = '#222'; ctx.fillRect(cx - W * 0.02, H * 0.6, W * 0.04, H * 0.5); // mic
        ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(cx, H * 0.6, W * 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `600 ${Math.round(H * 0.06)}px system-ui, sans-serif`; ctx.fillText('● LIVE', W * 0.05, H * 0.1);
      } else {
        // main wall: big gradient sweep, light bars and the artist name
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, `hsl(${hue} 95% 52%)`); g.addColorStop(0.5, `hsl(${(hue + 50) % 360} 90% 30%)`); g.addColorStop(1, `hsl(${(hue + 110) % 360} 95% 12%)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
        for (let i = 0; i < 14; i++) { const x = ((i * 47 + t * 80) % (W + 60)) - 30; ctx.fillRect(x, 0, 10 + (i % 3) * 6, H); }
        ctx.globalAlpha = 1;
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.fillStyle = `rgba(255,255,255,${0.15 + pulse * 0.2})`; ctx.fillRect(0, H * 0.78, W, H * 0.04);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let fs = Math.round(H * 0.28); ctx.font = `900 ${fs}px system-ui, sans-serif`;
        while (ctx.measureText(title).width > W * 0.9 && fs > 8) { fs -= 2; ctx.font = `900 ${fs}px system-ui, sans-serif`; }
        ctx.fillText(title, W / 2, H * 0.48);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      // LED pixel grid
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let x = 1; x < W; x += 2) ctx.fillRect(x, 0, 1, H);
      for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
      tex.needsUpdate = true;
    };
    draw(0);
    let last = 0;
    this.anim.push((t) => { if (t - last > 0.1) { last = t; draw(t); } });
    return tex;
  }

  // A box truss between two points: four chords plus zig-zag lacing, merged into one geometry.
  _truss(a, b, size = 0.52, into) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A); const L = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const s = size / 2, r = 0.035;
    const out = into || [];
    const piece = (x0, y0, z0, x1, y1, z1, rad) => {
      const p0 = new THREE.Vector3(x0, y0, z0), p1 = new THREE.Vector3(x1, y1, z1);
      const d = p1.clone().sub(p0); const len = d.length();
      const g = new THREE.CylinderGeometry(rad, rad, len, 4, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.applyQuaternion(q); g.translate(A.x, A.y, A.z);
      out.push(g);
    };
    const C = [[-s, -s], [s, -s], [s, s], [-s, s]];
    for (const [x, z] of C) piece(x, 0, z, x, L, z, r * 1.4);
    const n = Math.max(1, Math.round(L / size));
    for (let i = 0; i < n; i++) {
      const y0 = (i * L) / n, y1 = ((i + 1) * L) / n;
      for (let f = 0; f < 4; f++) { const [x0, z0] = C[f], [x1, z1] = C[(f + 1) % 4]; i % 2 ? piece(x0, y0, z0, x1, y1, z1, r) : piece(x1, y0, z1, x0, y1, z0, r); }
    }
    return out;
  }

  _addMerged(geoms, mat, label) {
    if (!geoms.length) return null;
    const m = new THREE.Mesh(merge(geoms), mat); this.root.add(m);
    if (label) { m.userData.label = label; this.blockers.push(m); }
    return m;
  }

  // Volumetric-looking beam: additive cone that fades along its length and at its edges.
  _beamMaterial(color) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uLen: { value: 60 }, uOpacity: { value: 0.32 } },
      vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; uniform float uLen;
        void main(){ vT = clamp(-position.y / uLen, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vT; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uOpacity;
        void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float fade = pow(1.0 - vT, 1.8);
          gl_FragColor = vec4(uColor, uOpacity * edge * fade); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }

  _hazeTexture() {
    if (this._haze) return this._haze;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const ctx = cv.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 20 + hash01('hx' + i) * 88, y = 20 + hash01('hy' + i) * 88, r = 18 + hash01('hr' + i) * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    }
    const mask = ctx.createRadialGradient(64, 64, 20, 64, 64, 64); mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = mask; ctx.fillRect(0, 0, 128, 128);
    this._haze = new THREE.CanvasTexture(cv); return this._haze;
  }

  _addHaze(cx, cy, cz, spreadX, spreadZ, count, size, color, opacity) {
    const tex = this._hazeTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const s = new THREE.Sprite(mat);
      const x = cx + (hash01('hzx' + i + cz) - 0.5) * spreadX, z = cz + (hash01('hzz' + i + cx) - 0.5) * spreadZ, y = cy + hash01('hzy' + i) * size * 0.4;
      const k = size * (0.7 + hash01('hzs' + i) * 0.6);
      s.scale.set(k, k * 0.6, 1); s.position.set(x, y, z); this.root.add(s);
      const ph = i * 1.3; this.anim.push((t) => { s.position.x = x + Math.sin(t * 0.07 + ph) * 3; mat.rotation = Math.sin(t * 0.05 + ph) * 0.3; });
    }
  }

  // A moving-head fixture hung from truss, with a beam into the haze.
  _fixture(x, y, z, i, len, opts = {}) {
    const root = this.root;
    const body = new THREE.Mesh(this._fxBody || (this._fxBody = new THREE.BoxGeometry(0.45, 0.5, 0.45)), this._fxMat || (this._fxMat = new THREE.MeshLambertMaterial({ color: '#16171d' })));
    body.position.set(x, y - 0.35, z); root.add(body);
    const lens = new THREE.Mesh(this._lensGeo || (this._lensGeo = new THREE.CircleGeometry(0.16, 12)), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    lens.rotation.x = Math.PI / 2; lens.position.set(x, y - 0.61, z); root.add(lens);
    const geo = new THREE.ConeGeometry(opts.spread || 2.2, len, 20, 1, true); geo.translate(0, -len / 2, 0);
    const mat = this._beamMaterial('#ffffff'); mat.uniforms.uLen.value = len; mat.uniforms.uOpacity.value = opts.opacity || 0.3;
    const beam = new THREE.Mesh(geo, mat); beam.position.set(x, y - 0.6, z); beam.frustumCulled = false; root.add(beam);
    const ph = i * 0.73, up = opts.up ? Math.PI : 0, base = opts.tilt ?? 0.35;
    this.anim.push((t) => {
      const cue = Math.floor(t / 8) % 4; // lighting cues change every 8s
      const sweep = cue === 0 ? Math.sin(t * 0.8 + ph) * 0.5 : cue === 1 ? Math.sin(t * 1.6) * 0.35 : cue === 2 ? 0.25 * Math.sin(ph) : Math.sin(t * 0.5 + ph * 2) * 0.7;
      beam.rotation.set(up + base + Math.sin(t * 0.6 + ph) * 0.18 * (cue === 2 ? 0 : 1), 0, sweep);
      const hue = cue === 3 ? (t * 0.05 + i * 0.08) % 1 : [0.92, 0.6, 0.12, 0.8][cue];
      const c = mat.uniforms.uColor.value.setHSL(hue, cue === 2 ? 0.2 : 0.95, 0.6);
      lens.material.color.copy(c).multiplyScalar(2.2);
      mat.uniforms.uOpacity.value = (opts.opacity || 0.3) * (cue === 1 ? 0.6 + 0.4 * Math.max(0, Math.sin(t * 6 + ph)) : 1);
    });
  }

  // Blocky band members on stage.
  _band(cx, y, cz, facing, scale = 1) {
    const G = this._personGeoms();
    const mats = { shirt: new THREE.MeshLambertMaterial({ color: '#111216' }), skin: new THREE.MeshLambertMaterial({ color: '#b07850' }), hair: new THREE.MeshLambertMaterial({ color: '#15110e' }), pants: new THREE.MeshLambertMaterial({ color: '#1d2233' }), gear: new THREE.MeshLambertMaterial({ color: '#2a2b33' }), chrome: new THREE.MeshLambertMaterial({ color: '#c9ccd6' }), red: new THREE.MeshLambertMaterial({ color: '#9c1d2c' }) };
    const person = (x, z, s, up, shirt) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(G.legs, mats.pants), new THREE.Mesh(up ? G.bodyUp : G.body, shirt || mats.shirt), new THREE.Mesh(G.head, mats.skin), new THREE.Mesh(G.hair, mats.hair));
      g.scale.setScalar(s); g.position.set(x, y, z); g.rotation.y = facing; this.root.add(g); return g;
    };
    const fwd = (d) => [Math.sin(facing) * d, Math.cos(facing) * d];
    const side = (d) => [Math.cos(facing) * d, -Math.sin(facing) * d];
    const at = (lat, dep) => { const a = side(lat), b = fwd(dep); return [cx + a[0] + b[0], cz + a[1] + b[1]]; };
    const S = 1.25 * scale;
    // singer + mic stand
    let [x, z] = at(0, 3.2 * scale); const singer = person(x, z, S * 1.05, true, new THREE.MeshLambertMaterial({ color: '#e8e2d6' }));
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5 * S, 6), mats.chrome); stand.position.set(x + fwd(0.45)[0], y + 0.75 * S, z + fwd(0.45)[1]); this.root.add(stand);
    // guitarist and bassist
    const g1 = person(...at(-5 * scale, 1.2), S, false); const g2 = person(...at(5 * scale, 1.2), S, false);
    for (const g of [g1, g2]) { const gtr = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.32, 0.08), mats.red); gtr.position.set(0, 0.85, 0.2); gtr.rotation.z = 0.5; g.add(gtr); }
    // drum riser and kit
    [x, z] = at(0, -2.5 * scale);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(4.5 * scale, 0.6, 3.2 * scale), mats.gear); riser.position.set(x, y + 0.3, z); riser.rotation.y = facing; this.root.add(riser);
    const drummer = person(...at(0, -3.1 * scale), S, false); drummer.position.y = y + 0.6;
    const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16), mats.shirt); kick.rotation.x = Math.PI / 2; kick.rotation.z = facing; const kp = at(0, -2.2 * scale); kick.position.set(kp[0], y + 1.05, kp[1]); this.root.add(kick);
    for (const [l, d, h] of [[-0.7, -2.4, 1.6], [0.7, -2.4, 1.6], [-1.1, -2.9, 1.9], [1.1, -2.9, 1.9]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 14), new THREE.MeshLambertMaterial({ color: '#c9a640' })); const p = at(l * scale, d * scale); c.position.set(p[0], y + h, p[1]); c.rotation.x = 0.2; this.root.add(c); }
    // keys + amps
    const kp2 = at(-8 * scale, -1.5); const keys = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.45), mats.gear); keys.position.set(kp2[0], y + 0.95, kp2[1]); keys.rotation.y = facing; this.root.add(keys);
    person(...at(-8 * scale, -2.1), S, false);
    for (const l of [-6.5, -3.5, 3.5, 6.5]) { const p = at(l * scale, -0.6); const amp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.4), mats.gear); amp.position.set(p[0], y + 0.35, p[1]); amp.rotation.y = facing; this.root.add(amp); }
    for (const l of [-3, -1.2, 1.2, 3]) { const p = at(l * scale, 3.6); const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), mats.gear); wedge.position.set(p[0], y + 0.18, p[1]); wedge.rotation.y = facing; wedge.rotation.x = -0.4; this.root.add(wedge); }
    this.anim.push((t) => { singer.position.y = y + Math.abs(Math.sin(t * 2.6)) * 0.12; singer.rotation.y = facing + Math.sin(t * 0.7) * 0.4; g1.rotation.y = facing + 0.3 + Math.sin(t * 1.3) * 0.15; g2.rotation.y = facing - 0.3 - Math.sin(t * 1.1) * 0.15; drummer.position.y = y + 0.6 + Math.abs(Math.sin(t * 5.2)) * 0.05; });
    this.bandFocus = new THREE.Vector3(cx, y + 1.6, cz);
  }

  // Line array: a gently curved hang of boxes.
  _lineArray(x, yTop, z, faceY, boxes = 12, label = 'Speaker hang') {
    const g = new THREE.Group(); const mat = new THREE.MeshLambertMaterial({ color: '#0d0d11' });
    let y = 0, tilt = 0;
    for (let i = 0; i < boxes; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.7), mat); tilt += i < 4 ? 0.01 : 0.045;
      b.position.set(0, y - 0.21, Math.sin(tilt) * 0.35 * i); b.rotation.x = tilt; g.add(b); y -= 0.43;
      b.userData.label = label; this.blockers.push(b);
    }
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), new THREE.MeshLambertMaterial({ color: '#3b3d47' })); bumper.position.y = 0.06; g.add(bumper);
    g.position.set(x, yTop, z); g.rotation.y = faceY; this.root.add(g); g.updateMatrixWorld(true);
  }

  _buildStage(model) {
    const st = model.stage, root = this.root;
    const deckMat = new THREE.MeshLambertMaterial({ color: '#16171d' });
    const topMat = new THREE.MeshLambertMaterial({ color: '#24252c' });
    const trussMat = new THREE.MeshLambertMaterial({ color: '#9aa0ad' });
    const blackMat = new THREE.MeshLambertMaterial({ color: '#08080b' });
    const addTarget = (m) => { this.targets.push(m); return m; };
    const trussGeoms = [];
    const arena = model.venue.kind === 'arena';

    if (st.type === 'end') {
      const cz = st.zBack + st.d / 2;
      // deck with a dark skirt and a light strip on the front edge
      const deck = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), deckMat); deck.position.set(0, st.h / 2, cz); root.add(addTarget(deck));
      const top = new THREE.Mesh(new THREE.PlaneGeometry(st.w - 0.2, st.d - 0.2), topMat); top.rotation.x = -Math.PI / 2; top.position.set(0, st.h + 0.01, cz); root.add(top);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(st.w, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); lip.position.set(0, st.h - 0.05, st.zFront + 0.02); root.add(lip);
      this.anim.push((t) => lip.material.color.setHSL((t * 0.05) % 1, 0.9, 0.35));
      // front-of-stage barricade with a security pit
      const bar = new THREE.Mesh(new THREE.BoxGeometry(st.w + 6, 1.2, 0.5), new THREE.MeshLambertMaterial({ color: '#6c7280' })); bar.position.set(0, 0.6, st.zFront + 2.6); root.add(bar);

      // roof structure: four towers, front and back truss beams, cross beams
      const roofY = st.trim ?? st.screenY + st.screenH + (arena ? 2.5 : 4.5);
      const hw = st.w / 2 + (arena ? 1.5 : 3);
      const zF = st.zFront - 0.6, zB = st.zBack - 1;
      for (const sx of [-1, 1]) for (const z of [zF, zB]) this._truss([sx * hw, 0, z], [sx * hw, roofY, z], 0.75, trussGeoms);
      for (const z of [zF, zB, (zF + zB) / 2]) this._truss([-hw, roofY, z], [hw, roofY, z], 0.6, trussGeoms);
      for (const sx of [-1, -0.33, 0.33, 1]) this._truss([sx * hw, roofY, zB], [sx * hw, roofY, zF], 0.5, trussGeoms);
      // stage roof canopy
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3, zF - zB + 4), new THREE.MeshLambertMaterial({ color: '#0d0e13', side: THREE.DoubleSide }));
      canopy.rotation.x = -Math.PI / 2; canopy.position.set(0, roofY + 1.6, (zF + zB) / 2); root.add(canopy);
      // wings for PA and side screens
      const wingX = hw + (st.wings ?? (arena ? 4 : 9));
      for (const sx of [-1, 1]) {
        this._truss([sx * hw, roofY - 0.4, zF + 1], [sx * wingX, roofY - 0.4, zF + 1], 0.45, trussGeoms);
        this._truss([sx * wingX, 0, zF + 1], [sx * wingX, roofY - 0.4, zF + 1], 0.55, trussGeoms);
      }
      this._addMerged(trussGeoms.splice(0), trussMat, 'Stage tower');

      // the back of the set: scaffold behind the video wall, black drapes, side masking and backstage kit.
      // From side-stage seats this is what you actually see.
      const backZ = st.zBack - 1.8;
      const nCol = Math.max(4, Math.round((st.w + 2) / 3.2));
      for (let i = 0; i <= nCol; i++) { const x = -(st.w + 2) / 2 + (i * (st.w + 2)) / nCol; this._truss([x, 0, backZ], [x, roofY - 0.5, backZ], 0.32, trussGeoms); }
      for (let yy = 3; yy < roofY - 1; yy += 4.5) this._truss([-(st.w + 2) / 2, yy, backZ], [(st.w + 2) / 2, yy, backZ], 0.28, trussGeoms);
      for (let i = 0; i <= nCol; i += 2) { const x = -(st.w + 2) / 2 + (i * (st.w + 2)) / nCol; this._truss([x, 0, backZ - 4], [x, roofY * 0.55, backZ], 0.22, trussGeoms); }
      const drapeTex = this._drapeTexture();
      const drapeMat = new THREE.MeshLambertMaterial({ map: drapeTex, color: '#3a3a44', side: THREE.DoubleSide });
      const rear = new THREE.Mesh(new THREE.PlaneGeometry(st.w + 2, roofY), drapeMat); rear.position.set(0, roofY / 2, st.zBack - 0.75); root.add(rear);
      const legW = st.d * 0.3;
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(legW, roofY - 1), drapeMat); side.rotation.y = Math.PI / 2;
        side.position.set(sx * (st.w / 2 + 0.6), (roofY - 1) / 2, st.zBack + legW / 2); root.add(side);
        // flight cases and a dimmer rack stacked in the wings
        for (let k = 0; k < 5; k++) {
          const cw = 1.2 + hash01('fc' + k + sx) * 0.8, chh = 0.8 + hash01('fh' + k + sx) * 0.7;
          const fc = new THREE.Mesh(new THREE.BoxGeometry(cw, chh, 0.9), new THREE.MeshLambertMaterial({ color: k % 2 ? '#202229' : '#2b2d36' }));
          fc.position.set(sx * (st.w / 2 + 2.5 + (k % 3) * 1.6), chh / 2, st.zBack - 3 - Math.floor(k / 3) * 1.5); root.add(fc);
        }
      }
      this._addMerged(trussGeoms.splice(0), trussMat, 'Stage set');
      // main LED wall with a black border, and LED columns either side
      const wall = new THREE.Mesh(new THREE.BoxGeometry(st.w + 2, roofY, 0.6), blackMat); wall.position.set(0, roofY / 2, st.zBack - 0.4); root.add(wall);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(st.screenW, st.screenH), new THREE.MeshBasicMaterial({ map: this._screenTexture(st.screenW, st.screenH, 'main'), toneMapped: false }));
      scr.position.set(0, st.screenY + st.screenH / 2, st.zBack); root.add(addTarget(scr)); this.mainScreen = scr;
      const colTex = this._screenTexture(4, 24, 'col');
      const nCols = arena ? 2 : 3;
      for (const sx of [-1, 1]) for (let i = 0; i < nCols; i++) {
        const cw = arena ? 1.4 : 2.4, ch = st.screenH + st.screenY - 1;
        const col = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ map: colTex, toneMapped: false }));
        col.position.set(sx * (st.screenW / 2 + 2 + i * (cw + (arena ? 1 : 2.4))), ch / 2 + 1, st.zBack + 0.5 + i * 0.8); root.add(col);
      }
      // IMAG side screens flown from the wings, angled toward the crowd
      const sw = arena ? 6 : 12, sh = sw * 0.5625;
      const camTex = this._screenTexture(sw, sh, 'cam');
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: camTex, toneMapped: false })); g.add(addTarget(s));
        const fr = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.4, sh + 0.4, 0.3), blackMat); fr.position.z = -0.2; g.add(fr);
        g.position.set(sx * (wingX - (arena ? 1 : 2)), roofY - 1.4 - sh / 2, zF + 2); g.rotation.y = -sx * 0.32; root.add(g); g.updateMatrixWorld(true);
        // PA hang between stage and side screen
        this._lineArray(sx * (hw + (arena ? 1.6 : 3)), roofY - 1.2, zF + 1.4, -sx * 0.18, arena ? 9 : 14);
        // subs on the floor
        for (let k = 0; k < 3; k++) { const sub = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1), blackMat); sub.position.set(sx * (st.w / 2 - 2 - k * 1.4), 0.45, st.zFront + 1.2); root.add(sub); }
      }
      // fixtures on the front, mid and back truss; floor fixtures shooting up through the haze
      const nF = arena ? 7 : 11;
      for (let i = 0; i < nF; i++) { const x = -hw + 1.5 + (i * (2 * hw - 3)) / (nF - 1); this._fixture(x, roofY - 0.3, zF, i, roofY * 2.6, { tilt: 0.5 }); }
      for (let i = 0; i < nF - 2; i++) { const x = -hw + 3 + (i * (2 * hw - 6)) / (nF - 3); this._fixture(x, roofY - 0.3, (zF + zB) / 2, i + 20, roofY * 1.6, { tilt: 0.1, spread: 1.6, opacity: 0.22 }); }
      for (let i = 0; i < 6; i++) { const x = -st.w / 2 + 4 + (i * (st.w - 8)) / 5; this._fixture(x, st.h + 0.6, st.zBack + 1.5, i + 40, roofY * 3, { up: true, tilt: -0.25, spread: 1.4, opacity: 0.2 }); }
      if (st.catwalk) {
        const L = st.catwalk.z1 - st.catwalk.z0;
        const cw = new THREE.Mesh(new THREE.BoxGeometry(st.catwalk.w, st.h - 0.4, L), deckMat); cw.position.set(0, (st.h - 0.4) / 2, st.catwalk.z0 + L / 2); root.add(addTarget(cw));
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, L), new THREE.MeshBasicMaterial({ color: '#9af4ff', toneMapped: false }));
        for (const sx of [-1, 1]) { const s2 = strip.clone(); s2.position.set(sx * st.catwalk.w / 2, st.h - 0.42, st.catwalk.z0 + L / 2); root.add(s2); }
        const bs = new THREE.Mesh(new THREE.CylinderGeometry(st.bstage.r, st.bstage.r, st.h - 0.4, 32), deckMat); bs.position.set(0, (st.h - 0.4) / 2, st.bstage.z); root.add(addTarget(bs));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(st.bstage.r, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: '#9af4ff', toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.set(0, st.h - 0.38, st.bstage.z); root.add(ring);
      }
      this._band(0, st.h, st.zBack + st.d * (arena ? 0.5 : 0.62), 0, arena ? 0.75 : 1);
      // stage wash lights
      const wash = new THREE.PointLight('#ff9a6a', arena ? 40 : 160, st.w * 1.6, 1.6); wash.position.set(0, roofY - 2, st.zFront + 4); root.add(wash);
      const back = new THREE.PointLight('#6a7dff', arena ? 30 : 120, st.w * 1.4, 1.6); back.position.set(0, roofY - 3, st.zBack + 2); root.add(back);
      this.anim.push((t) => { wash.color.setHSL((0.05 + Math.sin(t * 0.1) * 0.05 + 1) % 1, 0.7, 0.6); back.color.setHSL((t * 0.04) % 1, 0.8, 0.55); });
      // haze hanging over the stage and the front of the floor
      this._addHaze(0, st.h + 2, cz, st.w, st.d, arena ? 6 : 10, arena ? 16 : 28, '#b9a7ff', 0.22);
      this._addHaze(0, 3, st.zFront + 14, st.w * 1.4, 30, arena ? 4 : 8, arena ? 18 : 34, '#8f7dd8', 0.12);
      this.stageFocus = new THREE.Vector3(0, (st.h + st.screenY + st.screenH) / 2, st.zBack + st.d * 0.4);
      this.framePts = [[-st.w / 2, st.h, st.zFront], [st.w / 2, st.h, st.zFront], [-st.screenW / 2, st.screenY + st.screenH, st.zBack], [st.screenW / 2, st.screenY + st.screenH, st.zBack], [0, st.h, st.zFront]].map((p) => new THREE.Vector3(...p));
    } else {
      // centre (in-the-round) stage
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(st.r, st.r, st.h, 48), deckMat); deck.position.set(st.x, st.h / 2, st.z); root.add(addTarget(deck));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(st.r, 0.08, 6, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.set(st.x, st.h - 0.05, st.z); root.add(ring);
      this.anim.push((t) => ring.material.color.setHSL((t * 0.05) % 1, 0.9, 0.6).multiplyScalar(1.6));
      const cube = new THREE.Group(); cube.position.set(st.x, st.screenY + st.screenH / 2, st.z);
      const tex = this._screenTexture(st.screenW, st.screenH, 'main');
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(st.screenW, st.screenH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        s.rotation.y = (i * Math.PI) / 2; s.translateZ(st.screenW / 2); cube.add(s); this.targets.push(s);
      }
      const box2 = new THREE.Mesh(new THREE.BoxGeometry(st.screenW - 0.1, st.screenH - 0.1, st.screenW - 0.1), blackMat); cube.add(box2);
      root.add(cube); cube.updateMatrixWorld(true);
      // circular truss grid built from straight segments, with fixtures and four PA hangs
      const R = st.r + 2, ry = st.screenY + st.screenH + 3, N = 16;
      for (let i = 0; i < N; i++) { const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2; this._truss([st.x + Math.cos(a0) * R, ry, st.z + Math.sin(a0) * R], [st.x + Math.cos(a1) * R, ry, st.z + Math.sin(a1) * R], 0.5, trussGeoms); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; this._truss([st.x + Math.cos(a) * R, ry, st.z + Math.sin(a) * R], [st.x + Math.cos(a) * R, ry + 30, st.z + Math.sin(a) * R], 0.3, trussGeoms); }
      this._addMerged(trussGeoms.splice(0), trussMat);
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; this._fixture(st.x + Math.cos(a) * R, ry - 0.3, st.z + Math.sin(a) * R, i, ry * 2.5, { tilt: 0.4 }); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; this._lineArray(st.x + Math.cos(a) * (R + 1.5), ry - 1, st.z + Math.sin(a) * (R + 1.5), Math.PI / 2 - a, arena ? 8 : 12); }
      this._band(st.x, st.h, st.z, 0, arena ? 0.6 : 0.8);
      const wash = new THREE.PointLight('#ff9a6a', arena ? 40 : 140, st.r * 8, 1.6); wash.position.set(st.x, ry - 2, st.z); root.add(wash);
      this._addHaze(st.x, st.h + 2, st.z, st.r * 3, st.r * 3, 8, st.r * 2.5, '#b9a7ff', 0.2);
      this.stageFocus = new THREE.Vector3(st.x, st.screenY * 0.6, st.z);
      const pts = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(new THREE.Vector3(st.x + Math.cos(a) * st.r, st.h, st.z + Math.sin(a) * st.r)); pts.push(new THREE.Vector3(st.x + Math.cos(a) * st.screenW * 0.6, st.screenY + st.screenH, st.z + Math.sin(a) * st.screenW * 0.6)); }
      this.framePts = pts;
    }
  }

  _buildObstacles(model) {
    const tentMat = new THREE.MeshLambertMaterial({ color: '#2a2c38' });
    for (const o of model.obstacles) {
      if (o.type === 'foh') {
        // a real front-of-house position: a low riser with the mixing desks, an open-sided
        // tent on thin poles and a dark canopy. You see through it under the roof.
        const g = new THREE.Group();
        const riserH = 0.9, poleH = 3.6;
        const dark = new THREE.MeshLambertMaterial({ color: '#1a1b22' });
        const plat = new THREE.Mesh(new THREE.BoxGeometry(o.w, riserH, o.d), new THREE.MeshLambertMaterial({ color: '#2a2c36' })); plat.position.y = riserH / 2; g.add(plat);
        for (const dx of [-o.w * 0.22, o.w * 0.22]) {
          const desk = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.34, 0.95, 1.1), dark); desk.position.set(dx, riserH + 0.48, o.d * 0.1); desk.rotation.x = -0.12; g.add(desk);
          const lit = new THREE.Mesh(new THREE.PlaneGeometry(o.w * 0.3, 0.5), new THREE.MeshBasicMaterial({ color: '#53f2c4', toneMapped: false })); lit.position.set(dx, riserH + 1.0, o.d * 0.1 - 0.4); lit.rotation.set(-1.0, Math.PI, 0); g.add(lit);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.06, 0.06), dark); rail.position.set(0, riserH + 1.05, -o.d / 2); g.add(rail);
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, poleH, 6), dark); p.position.set((px * o.w) / 2, riserH + poleH / 2, (pz * o.d) / 2); g.add(p); }
        const roof = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.6, 0.18, o.d + 0.6), new THREE.MeshLambertMaterial({ color: '#23242c' })); roof.position.y = riserH + poleH; g.add(roof);
        const valance = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.6, 0.5, 0.04), dark); valance.position.set(0, riserH + poleH - 0.3, -(o.d + 0.6) / 2); g.add(valance);
        g.position.set(o.x, 0, o.z); this.root.add(g);
        plat.userData.label = roof.userData.label = 'Sound desk';
        this.blockers.push(plat, roof);
      } else {
        // a delay tower is a slim truss mast on a ballast base with a short line array at the top
        const g2 = [], h = o.h * 0.75;
        for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) this._truss([o.x + dx, 0, o.z + dz], [o.x + dx, h, o.z + dz], 0.18, g2);
        this._addMerged(g2, new THREE.MeshLambertMaterial({ color: '#7c818c' }), 'Delay speaker tower');
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2.4), new THREE.MeshLambertMaterial({ color: '#1c1d22' })); base.position.set(o.x, 0.5, o.z); this.root.add(base);
        this._lineArray(o.x, h + 0.2, o.z + 0.6, 0, 8, 'Delay speaker tower');
        base.userData.label = 'Delay speaker tower';
        this.blockers.push(base);
      }
    }
  }

  // ---------- crowd ----------
  _personGeoms() {
    // rounded bodies with human proportions (about 1.72 m tall before per-person scaling)
    if (this._pg) return this._pg;
    const leg = (x) => shape(new THREE.CylinderGeometry(0.08, 0.062, 0.9, 5, 1, true), { x, y: 0.45 });
    const legs = merge([leg(-0.095), leg(0.095)]);
    const torso = () => shape(new THREE.CapsuleGeometry(0.16, 0.4, 2, 7), { y: 1.12, sx: 1.18, sz: 0.66 });
    const armDown = (sx) => shape(new THREE.CapsuleGeometry(0.048, 0.5, 1, 4), { x: sx * 0.235, y: 1.1, rz: sx * 0.12 });
    const armUp = (sx) => shape(new THREE.CapsuleGeometry(0.048, 0.52, 1, 4), { x: sx * 0.24, y: 1.62, z: 0.05, rz: -sx * 0.2, rx: -0.15 });
    const body = merge([torso(), armDown(-1), armDown(1)]);
    // raised arms are their own mesh so they can be skin-coloured (bare forearms holding phones)
    const bodyUp = merge([torso(), shape(new THREE.CapsuleGeometry(0.05, 0.16, 1, 4), { x: -0.235, y: 1.36, rz: 0.25 }), shape(new THREE.CapsuleGeometry(0.05, 0.16, 1, 4), { x: 0.235, y: 1.36, rz: -0.25 })]);
    const armsUp = merge([armUp(-1), armUp(1)]);
    const head = shape(new THREE.SphereGeometry(0.105, 8, 6), { y: 1.6, sx: 0.88, sy: 1.15 });
    const hair = shape(new THREE.SphereGeometry(0.112, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.52), { y: 1.62, z: -0.012, sx: 0.9, sy: 1.08 });
    this._pg = { legs, body, bodyUp, armsUp, head, hair };
    return this._pg;
  }

  _crowdMaterial(color) {
    const mat = new THREE.MeshLambertMaterial({ color });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          float jumper = step(0.55, fract(sin(ph) * 43758.5453));
          transformed.y += max(0.0, sin(uTime * 5.2 + ph)) * 0.12 * jumper;
        #endif`);
    };
    return mat;
  }

  buildCrowd(focus, opts = {}) {
    const model = this.model;
    if (this.crowd) { this.root.remove(this.crowd); this.crowd.traverse((o) => o.dispose?.()); }
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cap = opts.cap || (coarse ? 30000 : 90000);
    const spots = [];
    const st = model.stage;
    const target = st.type === 'center' ? [st.x, st.z] : [0, st.zBack + st.d];
    const near = (x, z) => focus && Math.hypot(x - focus.x, z - focus.z) < 22;

    // count roughly first so we can thin evenly
    let seated = 0;
    for (const s of model.sections) if (!s.closed) { const rows = s.getRows(); for (const r of rows) seated += r.seats.length; }
    let floorArea = 0; for (const z of model.zones) floorArea += z.rect ? (z.rect.x1 - z.rect.x0) * (z.rect.z1 - z.rect.z0) : Math.PI * (z.ring.r1 ** 2 - z.ring.r0 ** 2);
    const floorPeople = floorArea * 1.1;
    const keep = Math.min(1, cap / (seated * 0.85 + floorPeople));

    for (const s of model.sections) {
      if (s.closed) continue;
      for (const r of s.getRows()) for (const seat of r.seats) {
        if (focus && seat === focus.seat) continue;
        const isNear = near(seat.x, seat.z) && Math.abs(seat.y - focus.y) < 6;
        const occupied = isNear ? seat.sold || hash01('o' + seat.x + seat.z) < 0.6 : hash01('k' + seat.x.toFixed(2) + seat.z.toFixed(2)) < keep * 0.88;
        if (occupied) spots.push([seat.x, seat.y, seat.z]);
      }
    }
    const fohs = model.obstacles;
    const blocked = (x, z) => {
      for (const o of fohs) if (Math.abs(x - o.x) < o.w / 2 + 0.6 && Math.abs(z - o.z) < o.d / 2 + 0.6) return true;
      if (st.catwalk && Math.abs(x) < st.catwalk.w / 2 + 0.8 && z < st.catwalk.z1 + 1) return true;
      if (st.bstage && Math.hypot(x, z - st.bstage.z) < st.bstage.r + 1) return true;
      if (st.type === 'center' && Math.hypot(x - st.x, z - st.z) < st.r + 1.5) return true;
      return false;
    };
    const step = 0.95;
    for (const zn of model.zones) {
      const R = zn.rect || { x0: zn.ring.x - zn.ring.r1, x1: zn.ring.x + zn.ring.r1, z0: zn.ring.z - zn.ring.r1, z1: zn.ring.z + zn.ring.r1 };
      for (let x = R.x0 + 0.4; x < R.x1; x += step) for (let z = R.z0 + 0.4; z < R.z1; z += step) {
        const jx = x + (hash01('x' + x + z) - 0.5) * 0.6, jz = z + (hash01('z' + x + z) - 0.5) * 0.6;
        if (zn.ring) { const d = Math.hypot(jx - zn.ring.x, jz - zn.ring.z); if (d < zn.ring.r0 || d > zn.ring.r1) continue; }
        if (zn.hole && Math.hypot(jx - zn.hole.x, jz - zn.hole.z) < zn.hole.r) continue;
        if (blocked(jx, jz)) continue;
        // keep a little personal space round the viewer so nobody's head fills the lens
        if (focus) {
          const dx = jx - focus.x, dz = jz - focus.z, dd = Math.hypot(dx, dz);
          if (dd < 2) continue;
          // and a gap straight ahead, the way you find a sight line through a crowd
          if (dd < 5 && this.stageFocus) { const sx = this.stageFocus.x - focus.x, sz = this.stageFocus.z - focus.z, sl = Math.hypot(sx, sz) || 1; if ((dx * sx + dz * sz) / (dd * sl) > 0.93) continue; }
        }
        const isNear = near(jx, jz) && focus.y < 1;
        const density = zn.cat === 'PIT' ? 1 : 0.82;
        if (hash01('f' + jx.toFixed(2) + jz.toFixed(2)) < (isNear ? density : density * keep)) spots.push([jx, 0, jz]);
      }
    }

    // In a stadium the promoter sells the whole field, so fill the outfield round the ticketed
    // zones with standing fans up to a few metres from the stands, the way it looks on the night.
    if (model.field.type === 'bowl' && st.type === 'end') {
      const { a, b, n } = model.field, inZone = (x, z) => model.zones.some((zn) => zn.rect && x > zn.rect.x0 && x < zn.rect.x1 && z > zn.rect.z0 && z < zn.rect.z1);
      const margin = model.venue.bowl.track ? 14 : 6;
      for (let x = -a; x < a; x += 1.15) for (let z = st.zFront + 4; z < b; z += 1.15) {
        const jx = x + (hash01('X' + x + z) - 0.5) * 0.7, jz = z + (hash01('Z' + x + z) - 0.5) * 0.7;
        if (Math.pow(Math.abs(jx) / (a - margin), n) + Math.pow(Math.abs(jz) / (b - margin), n) > 1) continue;
        if (inZone(jx, jz) || blocked(jx, jz)) continue;
        if (focus && Math.hypot(jx - focus.x, jz - focus.z) < 2) continue;
        const isNear = near(jx, jz) && focus.y < 1;
        if (hash01('F' + jx.toFixed(2) + jz.toFixed(2)) < (isNear ? 0.7 : 0.7 * keep)) spots.push([jx, 0, jz]);
      }
    }
    const N = spots.length;
    const group = new THREE.Group();
    // painted people (see crowd.js); a few phone lights as sparkle across the far stands
    const people = [], phones = [];
    const stageX = target[0], stageZ = target[1];
    for (let i = 0; i < N; i++) {
      const [x, y, z] = spots[i];
      const yaw = Math.atan2(target[0] - x, target[1] - z) + (hash01('y' + i) - 0.5) * 0.5;
      const dStage = Math.hypot(x - stageX, z - stageZ);
      const close = focus && Math.hypot(x - focus.x, z - focus.z) < 3;
      let variant = Math.floor(hash01('v' + i) * 16);
      // nobody right next to you holds a phone up in your face
      if (close && [1, 2, 3, 5, 6].includes(variant % 8)) variant = (variant & ~7) | 0;
      const scale = (0.86 + hash01('h' + i) * 0.14);
      // people near the stage catch more of the wash
      const light = 0.55 + 0.6 * Math.max(0, 1 - dStage / 90) + hash01('l' + i) * 0.25;
      people.push({ x, y, z, yaw, scale, light, variant });
      const far = !focus || Math.hypot(x - focus.x, z - focus.z) > 30;
      if (far && hash01('ph' + i) < 0.22) phones.push(x, y + 1.9 * scale, z);
    }
    const mesh = createCrowdMesh(people, { uTime: this.uTime, fog: this.scene.fog });
    this.crowdMat = mesh.material;
    group.add(mesh);
    if (phones.length) {
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(phones, 3));
      const pm = new THREE.PointsMaterial({ color: new THREE.Color('#fff6d8').multiplyScalar(2.2), toneMapped: false, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
      group.add(new THREE.Points(pg, pm));
    }
    group.visible = !this.empty;
    this.crowd = group;
    this.crowdCount = N;
    this.root.add(group);
  }

  // Every seat near you is a real chair, tinted by price band; your own seat glows lime.
  _buildChairs(focus, radius) {
    if (this.chairs) { this.root.remove(this.chairs); this.chairs.traverse((o) => o.geometry?.dispose?.()); }
    const model = this.model, st = model.stage;
    const target = st.type === 'center' ? [st.x, st.z] : [0, st.zBack + st.d];
    const cx = focus ? focus.x : 0, cz = focus ? focus.z : 0;
    const list = [];
    for (const sec of model.sections) {
      if (sec.closed) continue;
      const c = sec.center; if (focus && Math.hypot(c[0] - cx, c[1] - cz) > radius + 40) continue;
      for (const r of sec.getRows()) for (const seat of r.seats) if (!focus || Math.hypot(seat.x - cx, seat.z - cz) < radius) list.push([seat, sec.cat]);
    }
    const group = new THREE.Group();
    if (!list.length) { this.chairs = group; this.root.add(group); return; }
    if (!this._chairGeo) {
      // tip-up stadium seat: thin pan, tilted shell back, armrests, a single stem
      const back = new THREE.BoxGeometry(0.4, 0.46, 0.04); back.rotateX(-0.14); back.translate(0, 0.72, -0.17);
      this._chairGeo = merge([box(0.4, 0.045, 0.36, 0, 0.43, 0.02), back, box(0.035, 0.035, 0.3, -0.235, 0.6, -0.02), box(0.035, 0.035, 0.3, 0.235, 0.6, -0.02), box(0.035, 0.2, 0.035, -0.235, 0.5, -0.12), box(0.035, 0.2, 0.035, 0.235, 0.5, -0.12), box(0.05, 0.42, 0.05, 0, 0.21, -0.05)]);
    }
    const mesh = new THREE.InstancedMesh(this._chairGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), list.length);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const tints = {};
    let mine = null;
    list.forEach(([seat, cat], i) => {
      const yaw = Math.atan2(target[0] - seat.x, target[1] - seat.z);
      q.setFromAxisAngle(up, yaw);
      // the chair sits a little behind where a standing fan's feet are
      p.set(seat.x - Math.sin(yaw) * 0.22, seat.y, seat.z - Math.cos(yaw) * 0.22);
      m4.compose(p, q, one); mesh.setMatrixAt(i, m4);
      tints[cat] ||= new THREE.Color('#1d4596').lerp(new THREE.Color(CATS[cat].color), 0.16);
      mesh.setColorAt(i, col.copy(tints[cat]).multiplyScalar(0.85 + hash01('c' + i) * 0.25));
      if (focus && seat === focus.seat) mine = m4.clone();
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    if (mine) {
      const me = new THREE.Mesh(this._chairGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#c6ff3d').multiplyScalar(1.4), toneMapped: false }));
      me.applyMatrix4(mine); group.add(me);
    }
    this.chairs = group; this.chairCount = list.length;
    this.root.add(group);
  }

  // ---------- stadium map ----------
  // Every open seat in the venue is a real chair. Free seats are bright blue, taken seats dark,
  // so from the overview you can read availability the way the reel's arena map does.
  _buildSeatField(model) {
    const st = model.stage;
    const target = st.type === 'center' ? [st.x, st.z] : [0, st.zBack + st.d];
    const list = [];
    for (const sec of model.sections) { if (sec.closed) continue; for (const r of sec.getRows()) for (const seat of r.seats) list.push([seat, sec, r]); }
    this.seatIndex = new Map(); this.secSeats = new Map();
    if (!list.length) { this.seatField = null; return; }
    if (!this._fieldGeo) {
      this._fieldGeo = bucketSeat();
      const back2 = new THREE.BoxGeometry(0.4, 0.46, 0.04); back2.rotateX(-0.14); back2.translate(0, 0.72, -0.17);
      this._chairGeo = merge([box(0.4, 0.045, 0.36, 0, 0.43, 0.02), back2, box(0.035, 0.035, 0.3, -0.235, 0.6, -0.02), box(0.035, 0.035, 0.3, 0.235, 0.6, -0.02), box(0.035, 0.2, 0.035, -0.235, 0.5, -0.12), box(0.035, 0.2, 0.035, 0.235, 0.5, -0.12), box(0.05, 0.42, 0.05, 0, 0.21, -0.05)]);
    }
    const fieldMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    fieldMat.onBeforeCompile = (sh) => {
      sh.uniforms.uReveal = this.reveal; sh.uniforms.uOrigin = this.revealOrigin;
      sh.vertexShader = 'uniform vec2 uOrigin;\nvarying float vDist;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDist = distance(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), uOrigin);');
      sh.fragmentShader = 'uniform float uReveal;\nvarying float vDist;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float litK = 1.0 - smoothstep(uReveal - 14.0, uReveal, vDist);
  diffuseColor.rgb *= mix(0.015, 1.0, litK);
  float rim = 1.0 - smoothstep(0.0, 7.0, abs(vDist - uReveal + 5.0));
  totalEmissiveRadiance += vec3(0.78, 1.0, 0.24) * rim * 1.6;`);
    };
    const mesh = new THREE.InstancedMesh(this._fieldGeo, fieldMat, list.length);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    this._seatMats = new Float32Array(list.length * 16);
    list.forEach(([seat, sec], i) => {
      const yaw = Math.atan2(target[0] - seat.x, target[1] - seat.z);
      q.setFromAxisAngle(up, yaw);
      p.set(seat.x - Math.sin(yaw) * 0.22, seat.y, seat.z - Math.cos(yaw) * 0.22);
      m4.compose(p, q, one); mesh.setMatrixAt(i, m4); m4.toArray(this._seatMats, i * 16);
      this.seatIndex.set(seat, i);
      if (!this.secSeats.has(sec.id)) this.secSeats.set(sec.id, []);
      this.secSeats.get(sec.id).push(i);
    });
    this._seatList = list;
    this.seatField = mesh;
    this.root.add(mesh);
    this._paintSeats();
    this.chairCount = list.length;
  }

  // colours every chair: free = blue, taken = dark slate; the hovered block and the price
  // filter light up, everything else dims
  // The colour the seat really is (from photos), used whenever you are in a seat. The overview map
  // repaints the same chairs blue/dark to show what is free.
  _realSeatColor(sec, r, frac) {
    const bowl = this.model.venue.bowl;
    if (!bowl) return new THREE.Color('#1d4596').lerp(new THREE.Color(CATS[sec.cat].color), 0.16);
    const sp = bowl.seats || ['#2a3550'];
    const pal = Array.isArray(sp[0]) ? sp[Math.min(sec.tierIdx, sp.length - 1)] : sp;
    const secIdx = this.model.sections.indexOf(sec);
    const c = new THREE.Color(bowl.seatMix === 'random' ? pal[Math.floor(hash01('s' + secIdx + r.index + frac) * pal.length)] : pal[(secIdx + sec.tierIdx) % pal.length]);
    const zz = bowl.zigzag;
    if (zz && sec.tierIdx === zz.tier) {
      const u = (secIdx % 36) * 12 + Math.floor(frac * 12), P = 30, tri = Math.abs((u % P) - P / 2) / (P / 2);
      if (Math.abs(r.index - (4 + tri * (sec.rowsCount - 10))) < 2.2) c.set(zz.color);
    }
    return c;
  }

  _paintSeats() {
    const mesh = this.seatField; if (!mesh) return;
    this._paintedMode = this.mode;
    if (this.mode !== 'overview') {
      const col = new THREE.Color();
      this._seatList.forEach(([seat, sec, r], i) => {
        col.copy(this._realSeatColor(sec, r, (seat.n - 0.5) / r.seats.length)).multiplyScalar(0.85 + hash01('c' + i) * 0.25);
        mesh.setColorAt(i, col);
      });
      mesh.instanceColor.needsUpdate = true;
      return;
    }
    const free = new THREE.Color('#3a74ff'), taken = new THREE.Color('#1f2b52'), lit = new THREE.Color('#c6ff3d'), litTaken = new THREE.Color('#4d5a2a');
    const dimFree = new THREE.Color('#16295c');
    const col = new THREE.Color();
    const hov = this.hover && this.hover.kind !== 'zone' ? this.hover.id : null;
    this._seatList.forEach(([seat, sec], i) => {
      const on = hov === sec.id;
      const dim = this.filter && sec.cat !== this.filter;
      col.copy(on ? (seat.sold ? litTaken : lit) : seat.sold ? taken : dim ? dimFree : free);
      if (!on && !seat.sold) col.multiplyScalar(0.9 + hash01('c' + i) * 0.2);
      mesh.setColorAt(i, col);
    });
    mesh.instanceColor.needsUpdate = true;
  }

  setFilter(cat) { this.filter = cat; this._paintSeats(); this._paintPickers(); }

  // flat, invisible hit areas for each block and standing zone, plus a lime outline for hover
  _buildPickers(model) {
    const g = new THREE.Group(); this.pickers = [];
    this._hideMat ||= new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    this._hlMat ||= new THREE.MeshBasicMaterial({ color: new THREE.Color('#c6ff3d'), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#c6ff3d').multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.95 });
    const add = (verts, outline, item) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this._hideMat); m.userData.item = item; m.renderOrder = 3;
      const ln = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline.map((v) => new THREE.Vector3(...v))), lineMat); ln.visible = false; ln.renderOrder = 4;
      m.userData.outline = ln; g.add(m, ln); this.pickers.push(m);
    };
    for (const sec of model.sections) {
      if (sec.closed) continue;
      const lift = 1.0, yF = sec.base + lift, yB = sec.base + (sec.rowsCount - 1) * sec.rake + lift;
      const P = sec.poly, v = [], o = [];
      if (sec.kind === 'arc') {
        const N = (P.length / 2) - 1; // front points 0..N, back points reversed
        for (let i = 0; i < N; i++) {
          const f0 = P[i], f1 = P[i + 1], b1 = P[P.length - 2 - i], b0 = P[P.length - 1 - i];
          v.push(f0[0], yF, f0[1], f1[0], yF, f1[1], b1[0], yB, b1[1], f0[0], yF, f0[1], b1[0], yB, b1[1], b0[0], yB, b0[1]);
        }
        for (let i = 0; i <= N; i++) o.push([P[i][0], yF, P[i][1]]);
        for (let i = N + 1; i < P.length; i++) o.push([P[i][0], yB, P[i][1]]);
      } else {
        const [a, b, c, d] = P;
        v.push(a[0], yF, a[1], b[0], yF, b[1], c[0], yB, c[1], a[0], yF, a[1], c[0], yB, c[1], d[0], yB, d[1]);
        o.push([a[0], yF, a[1]], [b[0], yF, b[1]], [c[0], yB, c[1]], [d[0], yB, d[1]]);
      }
      add(v, o, sec);
    }
    for (const z of model.zones) {
      const y = 0.12, v = [], o = [];
      if (z.ring) {
        const M = 48;
        for (let i = 0; i < M; i++) {
          const a0 = (i / M) * Math.PI * 2, a1 = ((i + 1) / M) * Math.PI * 2;
          const p = (r, a) => [z.ring.x + Math.cos(a) * r, y, z.ring.z + Math.sin(a) * r];
          v.push(...p(z.ring.r0, a0), ...p(z.ring.r1, a0), ...p(z.ring.r1, a1), ...p(z.ring.r0, a0), ...p(z.ring.r1, a1), ...p(z.ring.r0, a1));
          o.push(p(z.ring.r1, a0));
        }
      } else {
        const { x0, x1, z0, z1 } = z.rect;
        v.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
        o.push([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
      }
      add(v, o, z);
    }
    this.root.add(g);
  }

  _paintPickers() {
    for (const m of this.pickers || []) {
      const it = m.userData.item, on = this.hover === it;
      const lit = on || (this.filter && it.cat === this.filter && it.kind === 'zone');
      m.material = lit ? this._hlMat : this._hideMat;
      m.userData.outline.visible = on;
    }
  }

  setHover(item) {
    if (this.hover === item) return;
    this.hover = item; this._paintSeats(); this._paintPickers();
  }

  pickAt(clientX, clientY) {
    if (!this.pickers) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._ray ||= new THREE.Raycaster();
    this._ray.setFromCamera(ndc, this.camera);
    const hit = this._ray.intersectObjects(this.pickers, false)[0];
    return hit ? hit.object.userData.item : null;
  }

  // your seat: a lime chair in place of the blue one
  markSeat(seat) {
    if (this.marker) { this.root.remove(this.marker); this.marker = null; }
    const mesh = this.seatField; if (!mesh) return;
    const m4 = new THREE.Matrix4();
    if (this._hiddenIdx != null) { m4.fromArray(this._seatMats, this._hiddenIdx * 16); mesh.setMatrixAt(this._hiddenIdx, m4); this._hiddenIdx = null; }
    const i = seat ? this.seatIndex.get(seat) : undefined;
    if (i != null) {
      m4.fromArray(this._seatMats, i * 16);
      const me = new THREE.Mesh(this._chairGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#c6ff3d').multiplyScalar(1.3), toneMapped: false }));
      me.applyMatrix4(m4); this.root.add(me); this.marker = me;
      mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this._hiddenIdx = i;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _overviewPose() {
    const b = this.model.bounds, ov = this.ov;
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const dist = span * 1.32 * ov.zoom * Math.max(1, 1 / ((this.camera.aspect || 1) * 1.25));
    const pos = new THREE.Vector3(Math.sin(ov.theta) * Math.cos(ov.phi), Math.sin(ov.phi), Math.cos(ov.theta) * Math.cos(ov.phi)).multiplyScalar(dist).add(ov.target);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, ov.target, new THREE.Vector3(0, 1, 0)));
    return { pos, q, fov: this.camera.aspect < 0.9 ? 52 : 38 };
  }

  // The stadium map: a high, slowly settling camera over the whole bowl, house lights up.
  enterOverview({ instant = false } = {}) {
    const fromSeat = this.mode === 'seat';
    this.mode = 'overview'; this.dive = null; this.fly = null; this.scrubP = null; this.setHover(null);
    const st = this.model.stage;
    this.ov ||= {};
    Object.assign(this.ov, { theta: st.type === 'center' ? 0.5 : 0, phi: this.camera.aspect < 0.9 ? 1.08 : 0.92, zoom: 1, target: new THREE.Vector3(0, 0, st.type === 'center' ? st.z : 0) });
    this.ovGoal = { ...this.ov };
    this.houseTarget = 1;
    if (this.crowd) this.crowd.visible = false;
    if (instant || !fromSeat) { this.houseMix = 1; this.trans = null; this._applyHouse(); }
    else this.trans = { t0: this.clock.getElapsedTime(), dur: 1.6, pos: this.camera.position.clone(), q: this.camera.quaternion.clone(), fov: this.camera.fov };
  }

  _applyHouse() {
    const k = this.houseMix ?? 0;
    const ovm = this.mode === 'overview';
    if (this.hemi) this.hemi.intensity = 1.0 + ((ovm ? 3.6 : 2.2) - 1.0) * k;
    if (this.house) this.house.intensity = 0.8 * k;
    if (this.flood) this.flood.intensity = (ovm ? 0.6 : 1.8) * k;
    if (this.crowdMat) this.crowdMat.uniforms.uLight.value = 0.6 + 0.6 * k;
    if (this.ovLight) this.ovLight.intensity = (ovm ? 3.2 : 0.6) * k;
    this.renderer.toneMappingExposure = 1.15 + 0.2 * k;
    if (this.bloom) this.bloom.strength = 0.85 - 0.45 * k;
    // no haze over the long overview shot, the night haze returns once you are in the seat
    const f = this.scene.fog; this._fog0 ||= { near: f.near, far: f.far };
    f.near = this._fog0.near + (2600 - this._fog0.near) * k; f.far = this._fog0.far + (5200 - this._fog0.far) * k;
  }

  // One continuous camera move from the stadium map into the seat: over the block, down to the
  // chair (yours glows lime), then sit and turn to the stage. Click anywhere to skip.
  diveTo(point, seat) {
    const cam = this.camera;
    const P0 = cam.position.clone(), Q0 = cam.quaternion.clone(), fov0 = cam.fov;
    this.mode = 'seat'; this.trans = null; this.setHover(null);
    this.flyTo(point, { instant: true });
    this.markSeat(seat || null);
    const finalQ = this.baseQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')));
    const S = new THREE.Vector3(point.x, point.y + 0.55, point.z);
    const out = new THREE.Vector3(S.x - this.stageFocus.x, 0, S.z - this.stageFocus.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const P1 = S.clone().addScaledVector(out, 16).addScaledVector(side, 6); P1.y += 24;
    const P2 = S.clone().addScaledVector(out, 2.4).addScaledVector(side, 0.9); P2.y += 1.9;
    const look = (from, at) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, at, new THREE.Vector3(0, 1, 0)));
    const curve = new THREE.CatmullRomCurve3([P0, P1, P2, this.eye.clone()], false, 'centripetal');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dive = reduce ? null : { t0: this.clock.getElapsedTime(), durs: [1.7, 1.5, 1.5].map((x) => x * (this.diveScale || 1)), curve, qs: [Q0, look(P1, S), look(P2, S), finalQ], fovs: [fov0, 46, 58, this.fov] };
    this.houseTarget = this.empty ? 1 : 1; // lights stay up until you are in the seat
    if (!this.dive) this._arrive();
  }

  _arrive() {
    this.dive = null;
    this.houseTarget = this.empty ? 1 : 0;
    this.onArrive?.();
  }

  skipDive() { if (this.dive && !this.dive.manual) { this.dive = null; this._arrive(); } }

  // The same swoop, but scrubbed by the page scroll (0 = stadium overview, 1 = in the seat).
  prepareScrubDive(point, seat, { shiftX = 0, zoom = 1 } = {}) {
    this.enterOverview({ instant: true });
    this.ov.target.x += shiftX; this.ov.zoom = zoom; this.ovGoal = { ...this.ov, target: this.ov.target.clone() };
    const pose = this._overviewPose();
    this.camera.position.copy(pose.pos); this.camera.quaternion.copy(pose.q); this.camera.fov = pose.fov; this.camera.updateProjectionMatrix();
    this.diveTo(point, seat);
    if (this.dive) { this.dive.manual = true; this.dive.durs = [1, 1, 1]; }
    this.diveP = 0;
  }
  setDiveP(p) {
    this.diveP = Math.max(0, Math.min(1, p));
    if (this.dive?.manual && this.diveP > 0.001) this.houseTarget = this.diveP > 0.985 ? 0 : 1;
  }

  // quick sideways hop to a neighbouring seat
  hopTo(point, seat) {
    const startPos = this.camera.position.clone(), startQ = this.camera.quaternion.clone();
    this.flyTo(point, { instant: true });
    this.markSeat(seat || null);
    this.fly = { t0: this.clock.getElapsedTime(), dur: 0.7, startPos, startQ, bump: 0.3 };
  }

  // LED boards along each tier front that show the price band, like real stadium fascia boards.
  _buildPriceBoards(model) {
    const { a, b, n } = model.venue.bowl;
    const texFor = {};
    const tex = (cat) => {
      if (texFor[cat]) return texFor[cat];
      const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#040406'; g.fillRect(0, 0, 1024, 64);
      g.fillStyle = CATS[cat].color; g.fillRect(14, 22, 20, 20);
      g.font = '700 38px Archivo, Arial Narrow, Arial, sans-serif'; g.textBaseline = 'middle';
      g.fillStyle = '#f5efe4'; const label = CATS[cat].label.toUpperCase();
      g.fillText(label, 50, 34);
      const w = g.measureText(label).width;
      g.fillStyle = '#c6ff3d'; g.fillText('FROM ' + fmtINR(priceOf(model.venue, cat)), 50 + w + 30, 34);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return (texFor[cat] = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const sec of model.sections) {
      if (sec.closed || sec.kind !== 'arc') continue;
      const d = sec.d0 - ROW_D / 2;
      const A = sePoint(a + d, b + d, n, sec.t0 + (sec.t1 - sec.t0) * 0.08), B = sePoint(a + d, b + d, n, sec.t1 - (sec.t1 - sec.t0) * 0.08);
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < 4) continue;
      const h = Math.min(0.8, len / 16);
      const m = new THREE.Mesh(geo, tex(sec.cat));
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      let nx = -(B[1] - A[1]), nz = B[0] - A[0];
      if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
      m.scale.set(len, h, 1);
      m.position.set(mx + (nx / len) * 0.06, sec.base - 0.75, mz + (nz / len) * 0.06);
      m.rotation.y = Math.atan2(nx, nz);
      this.root.add(m);
    }
  }

  // "Empty venue": house lights up, no crowd, seated eye height, so you can judge the seat itself.
  setEmpty(on) {
    this.empty = on;
    if (this.crowd) this.crowd.visible = !on;
    if (this.mode !== 'overview') this.houseTarget = on ? 1 : 0;
    if (this.lastPoint) this.flyTo(this.lastPoint, { instant: true });
  }

  setToyHeads(on) {
    this.toyHeads = on;
    if (!this.headMesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < this.headMesh.count; i++) this.headMesh.setColorAt(i, c.set(on ? TOY[0] : this._headColors[i]));
    this.headMesh.instanceColor.needsUpdate = true;
  }

  // ---------- camera ----------
  flyTo(point, { instant = false } = {}) {
    this.lastPoint = point;
    const eye = new THREE.Vector3(point.x, point.y + (this.empty && point.y > 0.5 ? 1.18 : PHONE_Y), point.z);
    this.eye = eye;
    const look = this.stageFocus.clone();
    const endQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, look, new THREE.Vector3(0, 1, 0)));
    this.baseQ = endQ;
    this._frameStage();
    this.yaw = this.rest.yaw; this.pitch = this.rest.pitch; this.fov = this.rest.fov; this.camera.fov = this.fov; this.camera.updateProjectionMatrix();
    const b = this.model.bounds;
    let startPos = new THREE.Vector3(eye.x * 0.4, Math.max(90, (b.z1 - b.z0) * 0.55), eye.z * 0.4 + (b.z1 - b.z0) * 0.35);
    let startLook = new THREE.Vector3(0, 0, 0);
    if (this.heroStart) {
      // a crane shot over the crowd, facing the stage: the opening frame of the home page
      const f = this.stageFocus, d = new THREE.Vector3(-f.x, 0, -f.z);
      if (d.lengthSq() < 1) d.set(0, 0, 1);
      d.normalize();
      const L = Math.max(60, Math.min(170, (b.z1 - b.z0) * 0.42));
      startPos = f.clone().addScaledVector(d, L).add(new THREE.Vector3(d.z * L * 0.18, 0, -d.x * L * 0.18));
      startPos.y = f.y + L * 0.24;
      startLook = f.clone(); startLook.y = f.y * 0.75;
    }
    const startQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(startPos, startLook, new THREE.Vector3(0, 1, 0)));
    this.path = { startPos, startQ };
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.fly = null; return; }
    this.fly = { t0: this.clock.getElapsedTime(), dur: 1.9, startPos, startQ };
  }

  analyse() {
    // Cast rays from the eye to points on the stage and screens to see what is in the way.
    const ray = new THREE.Raycaster();
    const eye = this.eye;
    const pts = [];
    const st = this.model.stage;
    if (st.type === 'end') {
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) pts.push({ kind: 'screen', v: new THREE.Vector3(-st.screenW / 2 + (st.screenW * (i + 0.5)) / 5, st.screenY + (st.screenH * (j + 0.5)) / 3, st.zBack + 0.7) });
      for (let i = 0; i < 7; i++) pts.push({ kind: 'stage', v: new THREE.Vector3(-st.w * 0.4 + (st.w * 0.8 * i) / 6, st.h + 1.7, st.zBack + st.d * 0.65) });
    } else {
      const dx = eye.x - st.x, dz = eye.z - st.z, d = Math.hypot(dx, dz) || 1;
      for (let i = -2; i <= 2; i++) for (let j = 0; j < 3; j++) { const side = new THREE.Vector3(-dz / d, 0, dx / d); pts.push({ kind: 'screen', v: new THREE.Vector3(st.x + (dx / d) * (st.screenW / 2), st.screenY + (st.screenH * (j + 0.5)) / 3, st.z + (dz / d) * (st.screenW / 2)).addScaledVector(side, (i * st.screenW) / 5) }); }
      for (let i = -3; i <= 3; i++) { const a = Math.atan2(dz, dx) + i * 0.25; pts.push({ kind: 'stage', v: new THREE.Vector3(st.x + Math.cos(a) * st.r * 0.6, st.h + 1.7, st.z + Math.sin(a) * st.r * 0.6) }); }
    }
    const res = { screen: [0, 0], stage: [0, 0], by: {} };
    for (const p of pts) {
      const dir = p.v.clone().sub(eye); const dist = dir.length(); dir.normalize();
      ray.set(eye.clone().addScaledVector(dir, 0.8), dir); ray.far = dist - 1.2;
      const hit = ray.intersectObjects(this.blockers, false)[0];
      res[p.kind][1]++;
      if (hit) { res[p.kind][0]++; const l = hit.object.userData.label || 'Structure'; res.by[l] = (res.by[l] || 0) + 1; }
    }
    const top = Object.entries(res.by).sort((a, b) => b[1] - a[1])[0];
    return { screenBlocked: res.screen[0] / res.screen[1], stageBlocked: res.stage[0] / res.stage[1], cause: top ? top[0] : null };
  }

  _bindControls() {
    const c = this.canvas; let drag = null; const pts = new Map(); let pinch = null; let down = null;
    c.addEventListener('pointerdown', (e) => {
      if (this.dive) { this.skipDive(); return; }
      pts.set(e.pointerId, [e.clientX, e.clientY]); c.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, theta: this.ovGoal?.theta, phi: this.ovGoal?.phi }; this.fly = null;
    });
    c.addEventListener('pointermove', (e) => {
      if (this.mode === 'overview' && !pts.size && e.pointerType === 'mouse') {
        const it = this.pickAt(e.clientX, e.clientY); this.setHover(it); this.onHover?.(it, e.clientX, e.clientY);
        c.style.cursor = it ? 'pointer' : 'grab';
      }
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) { if (this.mode === 'overview') this.ovGoal.zoom = Math.max(0.35, Math.min(1.5, this.ovGoal.zoom * (pinch / d))); else this.zoom(pinch / d); }
        pinch = d; return;
      }
      if (!drag) return;
      if (this.mode === 'overview') {
        this.ovGoal.theta = drag.theta - (e.clientX - drag.x) * 0.006;
        this.ovGoal.phi = Math.max(0.35, Math.min(1.45, drag.phi + (e.clientY - drag.y) * 0.004));
        return;
      }
      const k = (this.fov / 58) * 0.0042;
      this.yaw = Math.max(-2, Math.min(2, drag.yaw - (e.clientX - drag.x) * k));
      this.pitch = Math.max(-0.7, Math.min(0.9, drag.pitch - (e.clientY - drag.y) * k));
    });
    const up = (e) => {
      const was = pts.has(e.pointerId); pts.delete(e.pointerId); pinch = null; drag = null;
      if (was && down && this.mode === 'overview' && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) {
        const it = this.pickAt(e.clientX, e.clientY);
        if (it) { this.setHover(it); this.onPick?.(it); }
      }
      down = null;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.dive) return;
      if (this.mode === 'overview') {
        // scroll to sink into the bowl towards whatever is under the pointer
        const g = this.ovGoal, before = g.zoom;
        g.zoom = Math.max(0.3, Math.min(1.5, g.zoom * Math.exp(e.deltaY * 0.0012)));
        const it = this.pickAt(e.clientX, e.clientY);
        if (it && g.zoom < before) { const cx = it.center ? it.center[0] : it.rect ? (it.rect.x0 + it.rect.x1) / 2 : 0, cz = it.center ? it.center[1] : it.rect ? (it.rect.z0 + it.rect.z1) / 2 : it.ring.z; g.target = g.target.clone().lerp(new THREE.Vector3(cx, 0, cz), 0.12); }
        if (g.zoom > 0.95) g.target = g.target.clone().lerp(new THREE.Vector3(0, 0, this.model.stage.type === 'center' ? this.model.stage.z : 0), 0.2);
        return;
      }
      this.zoom(Math.exp(e.deltaY * 0.001));
    }, { passive: false });
  }

  scrub(p) { this.scrubP = p; this.fly = null; }

  zoom(f) { this.fov = Math.max(8, Math.min(this.rest ? this.rest.fov * 1.12 : 75, this.fov * f)); }
  // 1 = the phone's 1x lens, 2 = 2x and so on
  get zoomLevel() { return this.rest ? Math.tan(THREE.MathUtils.degToRad(this.rest.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(this.fov) / 2) : 1; }
  recentre() { this.yaw = this.rest.yaw; this.pitch = this.rest.pitch; this.fov = this.rest.fov; }

  // A phone camera at 1x: the long side of the frame spans about 68 degrees (a 26 mm-equivalent
  // main camera), the same lens fans use for the photos and reels people compare seats with.
  // The lens never zooms itself, so a far seat really looks far. Zoom is the 2x/3x buttons.
  lensFov(aspect = this.camera.aspect || 1) {
    const LONG = THREE.MathUtils.degToRad(LENS_DEG);
    const v = aspect >= 1 ? 2 * Math.atan(Math.tan(LONG / 2) / aspect) : LONG;
    return THREE.MathUtils.radToDeg(v);
  }

  // Point the camera at the stage the way a person does: turn to face it and tilt so the deck
  // and the screens sit a little above the middle of the frame. No zoom.
  _frameStage() {
    const eye = this.eye, aspect = this.camera.aspect || 1;
    const inv = new THREE.Matrix4().compose(eye, this.baseQ, new THREE.Vector3(1, 1, 1)).invert();
    let h0 = Infinity, h1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of this.framePts || []) {
      const c = p.clone().applyMatrix4(inv); if (c.z > -0.5) continue;
      const h = Math.atan2(c.x, -c.z), v = Math.atan2(c.y, -c.z);
      h0 = Math.min(h0, h); h1 = Math.max(h1, h); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const fov = this.lensFov(aspect);
    if (!isFinite(h0)) { this.rest = { yaw: 0, pitch: 0, fov }; return; }
    const vf = THREE.MathUtils.degToRad(fov);
    // phones: the bottom sheet covers the lower part of the frame, so keep the stage higher
    const lift = vf * (aspect < 0.9 ? 0.16 : 0.08);
    let pitch = (v0 + v1) / 2 - lift;
    // never tilt so far that the top of the stage roof leaves the frame
    pitch = Math.max(pitch, v1 - vf * 0.45);
    this.rest = { yaw: -(h0 + h1) / 2, pitch, fov };
    // empty venue: tilt down a touch so the seats around you are in the frame too
    if (this.empty) this.rest.pitch -= THREE.MathUtils.degToRad(5);
  }

  start() { if (this.running) return; this.running = true; this.resize(); const loop = () => { if (!this.running) return; this._frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.running = false; }

  _frame() {
    if (!this.baseQ && this.mode !== 'overview') return;
    if (this.seatField && this._paintedMode !== this.mode) this._paintSeats();
    const t = this.clock.getElapsedTime();
    this.uTime.value = t;
    for (const f of this.anim) f(t);
    const cam = this.camera;
    if (this.houseTarget != null) {
      this.houseMix = (this.houseMix ?? 0) + (this.houseTarget - (this.houseMix ?? 0)) * 0.05;
      this._applyHouse();
      const diving = this.dive && !(this.dive.manual && this.diveP > 0.985);
      if (this.crowd) this.crowd.visible = this.mode === 'seat' && !diving && !this.empty && this.houseMix < 0.6;
    }
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
    if (this.mode === 'overview') {
      const ov = this.ov, g = this.ovGoal;
      for (const k of ['theta', 'phi', 'zoom']) ov[k] += (g[k] - ov[k]) * 0.12;
      ov.target.lerp(g.target, 0.12);
      const pose = this._overviewPose();
      if (this.trans) {
        const k = Math.min(1, (t - this.trans.t0) / this.trans.dur), e = ease(k);
        cam.position.copy(this.trans.pos).lerp(pose.pos, e); cam.position.y += Math.sin(e * Math.PI) * 12;
        cam.quaternion.copy(this.trans.q).slerp(pose.q, e);
        cam.fov = this.trans.fov + (pose.fov - this.trans.fov) * e;
        if (k >= 1) this.trans = null;
      } else { cam.position.copy(pose.pos); cam.quaternion.copy(pose.q); cam.fov += (pose.fov - cam.fov) * 0.2; }
      cam.updateProjectionMatrix();
      this.composer.render();
      return;
    }
    if (this.dive) {
      const d = this.dive, tot = d.durs[0] + d.durs[1] + d.durs[2], el = d.manual ? this.diveP * tot * 0.99999 : t - d.t0;
      let seg = 0, acc = 0; while (seg < 2 && el > acc + d.durs[seg]) acc += d.durs[seg++];
      const local = Math.min(1, (el - acc) / d.durs[seg]);
      // ease in at the start, ease out at the end, keep moving through the middle beats
      const e = seg === 0 ? (local < 0.5 ? 2 * local * local : 1 - (-2 * local + 2) ** 2 / 2) : seg === 1 ? 0.5 - Math.cos(local * Math.PI) / 2 : ease(local);
      cam.position.copy(d.curve.getPoint((seg + e) / 3));
      cam.quaternion.copy(d.qs[seg]).slerp(d.qs[seg + 1], e);
      cam.fov = d.fovs[seg] + (d.fovs[seg + 1] - d.fovs[seg]) * e; cam.updateProjectionMatrix();
      this.onDive?.(Math.min(1, el / tot));
      if (!d.manual && el >= tot) this._arrive();
      this.composer.render();
      return;
    }
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const finalQ = this.baseQ.clone().multiply(look);
    if (this.scrubP != null && this.path) {
      // scroll-driven camera: 0 = high overview, 1 = in the seat
      const k = Math.max(0, Math.min(1, this.scrubP)); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const mid = this.path.startPos.clone().lerp(this.eye, e); mid.y += Math.sin(e * Math.PI) * 10;
      cam.position.copy(mid); cam.quaternion.copy(this.path.startQ).slerp(finalQ, e);
    } else if (this.fly) {
      const k = Math.min(1, (t - this.fly.t0) / this.fly.dur); const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const mid = this.fly.startPos.clone().lerp(this.eye, e);
      mid.y += Math.sin(e * Math.PI) * (this.fly.bump ?? 8);
      cam.position.copy(mid); cam.quaternion.copy(this.fly.startQ).slerp(finalQ, e);
      if (k >= 1) this.fly = null;
    } else { cam.position.copy(this.eye); cam.quaternion.copy(finalQ); }
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov += (this.fov - cam.fov) * 0.2; cam.updateProjectionMatrix(); }
    this.composer.render();
  }
}
