// The 3D "view from your seat": stepped stands, stage, lights and a crowd of
// chunky toy-block people rendered with instancing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CATS } from './data/venues.js';
import { ROW_D, EYE, hash01 } from './model.js';

// Gig crowds dress dark: mostly black and band tees, a few whites and colours.
const SHIRTS = ['#111114', '#141418', '#1a1a20', '#0e0f13', '#22252e', '#2b2f3a', '#1d2433', '#f1ede4', '#e9e4da', '#7d1f2a', '#2e4a7d', '#3b5e3f', '#c9a227', '#5e3a7a', '#a83a5a', '#1e1e1e'];
const PANTS = ['#26304a', '#1b1b22', '#3a4a6b', '#5b4636', '#2f3e2f', '#44445a'];
const SKIN = ['#8d5524', '#a0662f', '#c68642', '#b87a4b', '#e0ac69', '#7a4a26', '#d29a6a'];
const TOY = ['#ffcf3a'];
const HAIR = ['#14110f', '#2b1d14', '#3d2a1c', '#5a3b25', '#1c1c1c', '#c8572e', '#6b6b6b'];

function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
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

function sePoint(a, b, n, t) {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / n;
  return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)];
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
    this.scene.fog = new THREE.Fog('#07080f', 160, 520);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);
    // bloom makes LED walls, lenses and beams glow like they do through haze
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.clock = new THREE.Clock();
    this.uTime = { value: 0 };
    this.anim = [];
    this.yaw = 0; this.pitch = 0; this.fov = 58;
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
    this.camera.aspect = w / h;
    if (this.eye) this._frameStage();
    this.camera.updateProjectionMatrix();
  }

  // ---------- scene building ----------
  load(model) {
    if (this.model === model) return;
    this.model = model;
    if (this.root) { this.scene.remove(this.root); this.root.traverse((o) => { o.geometry?.dispose?.(); }); }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.blockers = [];
    this.targets = [];
    this.anim = [];

    this.root.add(new THREE.HemisphereLight('#7f8fc7', '#1a1420', 0.7));
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

  _buildGround(model) {
    const v = model.venue;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: v.scenery === 'palms' ? '#2a2418' : '#141a16' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; this.root.add(ground);

    if (model.field.type === 'bowl') {
      const { a, b, n } = model.field; const shape = new THREE.Shape();
      for (let i = 0; i <= 96; i++) { const [x, z] = sePoint(a, b, n, (i / 96) * Math.PI * 2); i ? shape.lineTo(x, -z) : shape.moveTo(x, -z); }
      const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: v.kind === 'arena' ? '#1a1a1d' : '#17201a' }));
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
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(fl.x1 - fl.x0, fl.z1 - fl.z0), new THREE.MeshLambertMaterial({ color: '#141416' }));
    deck.rotation.x = -Math.PI / 2; deck.position.set((fl.x0 + fl.x1) / 2, 0.02, (fl.z0 + fl.z1) / 2); this.root.add(deck);
    const barrierMat = new THREE.MeshLambertMaterial({ color: '#9aa3b8' });
    for (const z of model.zones) {
      const mat = new THREE.MeshBasicMaterial({ color: CATS[z.cat].color, transparent: true, opacity: 0.035, depthWrite: false });
      if (z.ring) {
        const m = new THREE.Mesh(new THREE.RingGeometry(z.ring.r0, z.ring.r1, 48), mat);
        m.rotation.x = -Math.PI / 2; m.position.set(z.ring.x, 0.04, z.ring.z); this.root.add(m);
      } else {
        const r = z.rect;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), mat);
        m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2); this.root.add(m);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 1.1, 0.15), barrierMat);
        bar.position.set((r.x0 + r.x1) / 2, 0.55, r.z0 - 0.5); this.root.add(bar);
      }
    }
  }

  _buildScenery(model) {
    const { w, d } = model.field; const kind = model.venue.scenery;
    if (kind === 'city') {
      const mat = new THREE.MeshLambertMaterial({ color: '#141724' });
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
    const ribbonPos = [];
    for (const s of model.sections) {
      if (s.kind !== 'arc') continue;
      const base = new THREE.Color(s.closed ? '#22242e' : '#3a3f4f').lerp(new THREE.Color(CATS[s.cat].color), s.closed ? 0 : 0.18);
      const M = 10;
      for (let r = 0; r < s.rowsCount; r++) {
        const dIn = s.d0 + r * ROW_D - ROW_D / 2, dOut = dIn + ROW_D;
        const y = s.base + r * s.rake, yNext = y + s.rake;
        c.copy(base).multiplyScalar(s.closed ? 1 : (r % 2 ? 0.55 : 0.68));
        const riser = c.clone().multiplyScalar(0.6);
        for (let i = 0; i < M; i++) {
          const ta = s.t0 + ((s.t1 - s.t0) * i) / M, tb = s.t0 + ((s.t1 - s.t0) * (i + 1)) / M;
          const A = sePoint(a + dIn, b + dIn, n, ta), B = sePoint(a + dIn, b + dIn, n, tb);
          const C = sePoint(a + dOut, b + dOut, n, tb), D = sePoint(a + dOut, b + dOut, n, ta);
          quad([A[0], y, A[1]], [B[0], y, B[1]], [C[0], y, C[1]], [D[0], y, D[1]], c);
          const top = r === s.rowsCount - 1 ? y + 2.2 : yNext;
          quad([D[0], y, D[1]], [C[0], y, C[1]], [C[0], top, C[1]], [D[0], top, D[1]], riser);
          if (r === 0) {
            const yb = s.tierIdx === 0 ? 0 : y - 1.3;
            const fc = new THREE.Color('#15161d');
            quad([A[0], yb, A[1]], [B[0], yb, B[1]], [B[0], y, B[1]], [A[0], y, A[1]], fc);
            ribbonPos.push([A, B, y - 0.75, s.closed]);
          }
          if (s.tierIdx > 0 && r === s.rowsCount - 1) {
            // underside of an overhanging tier, from the fascia back to the top row
            const A0 = sePoint(a + s.d0 - ROW_D / 2, b + s.d0 - ROW_D / 2, n, ta), B0 = sePoint(a + s.d0 - ROW_D / 2, b + s.d0 - ROW_D / 2, n, tb);
            quad([A0[0], s.base - 1.3, A0[1]], [B0[0], s.base - 1.3, B0[1]], [C[0], top - 3, C[1]], [D[0], top - 3, D[1]], new THREE.Color('#101118'));
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const stands = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    stands.userData.label = 'Tier above';
    this.root.add(stands);
    this.blockers.push(stands);

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
    this.anim.push((t) => ribbonMat.color.setHSL((t * 0.08) % 1, 0.8, 0.5));

    const last = model.tierInfo[model.tierInfo.length - 1];
    const v = model.venue;
    if (v.bowl.roof) {
      const R = v.bowl.roof; const dOut = last.dEnd + 2, dIn = last.dEnd - R.inset; const y = last.top + R.lift;
      const from = ((R.from ?? -180) * Math.PI) / 180, to = ((R.to ?? 180) * Math.PI) / 180;
      const rp2 = []; const M = 120;
      for (let i = 0; i < M; i++) {
        const ta = from + ((to - from) * i) / M, tb = from + ((to - from) * (i + 1)) / M;
        const A = sePoint(a + dIn, b + dIn, n, ta), B = sePoint(a + dIn, b + dIn, n, tb), C = sePoint(a + dOut, b + dOut, n, tb), D = sePoint(a + dOut, b + dOut, n, ta);
        rp2.push(A[0], y, A[1], B[0], y, B[1], C[0], y + 3, C[1], A[0], y, A[1], C[0], y + 3, C[1], D[0], y + 3, D[1]);
      }
      const roofG = new THREE.BufferGeometry(); roofG.setAttribute('position', new THREE.Float32BufferAttribute(rp2, 3)); roofG.computeVertexNormals();
      const roof = new THREE.Mesh(roofG, new THREE.MeshLambertMaterial({ color: '#2a2d3a', side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
      roof.userData.label = 'Roof edge';
      this.root.add(roof); this.blockers.push(roof);
      // roof edge light strip
      const edge = []; for (let i = 0; i <= M; i++) { const t = from + ((to - from) * i) / M; const P = sePoint(a + dIn, b + dIn, n, t); edge.push(new THREE.Vector3(P[0], y - 0.2, P[1])); }
      this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: '#8fb3ff' })));
    }
    if (v.bowl.dome) {
      const R = a + last.dEnd + 3, Rz = b + last.dEnd + 3;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#171a26', side: THREE.BackSide }));
      dome.scale.set(R, last.top + 18, Rz); this.root.add(dome);
      const ribs = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.LineBasicMaterial({ color: '#2b3150' }));
      ribs.scale.copy(dome.scale).multiplyScalar(0.995); this.root.add(ribs);
      this.scene.fog.near = 80;
    } else this.scene.fog.near = 160;
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
      const roofY = st.screenY + st.screenH + (arena ? 2.5 : 4.5);
      const hw = st.w / 2 + (arena ? 1.5 : 3);
      const zF = st.zFront - 0.6, zB = st.zBack - 1;
      for (const sx of [-1, 1]) for (const z of [zF, zB]) this._truss([sx * hw, 0, z], [sx * hw, roofY, z], 0.75, trussGeoms);
      for (const z of [zF, zB, (zF + zB) / 2]) this._truss([-hw, roofY, z], [hw, roofY, z], 0.6, trussGeoms);
      for (const sx of [-1, -0.33, 0.33, 1]) this._truss([sx * hw, roofY, zB], [sx * hw, roofY, zF], 0.5, trussGeoms);
      // stage roof canopy
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3, zF - zB + 4), new THREE.MeshLambertMaterial({ color: '#0d0e13', side: THREE.DoubleSide }));
      canopy.rotation.x = -Math.PI / 2; canopy.position.set(0, roofY + 1.6, (zF + zB) / 2); root.add(canopy);
      // wings for PA and side screens
      const wingX = hw + (arena ? 4 : 9);
      for (const sx of [-1, 1]) {
        this._truss([sx * hw, roofY - 0.4, zF + 1], [sx * wingX, roofY - 0.4, zF + 1], 0.45, trussGeoms);
        this._truss([sx * wingX, 0, zF + 1], [sx * wingX, roofY - 0.4, zF + 1], 0.55, trussGeoms);
      }
      this._addMerged(trussGeoms.splice(0), trussMat, 'Stage tower');

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
      const sw = arena ? 7 : 14, sh = sw * 0.5625;
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
        const g = new THREE.Group();
        const plat = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), tentMat); plat.position.y = o.h / 2; g.add(plat);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(o.w + 1, 0.4, o.d + 1), new THREE.MeshLambertMaterial({ color: '#3a3d4e' })); roof.position.y = o.h + 2.4; g.add(roof);
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), tentMat); p.position.set((px * o.w) / 2, o.h + 1.2, (pz * o.d) / 2); g.add(p); }
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(o.w * 0.8, 0.6), new THREE.MeshBasicMaterial({ color: '#53f2c4' })); glow.position.set(0, o.h + 0.6, -o.d / 2 - 0.01); glow.rotation.y = Math.PI; g.add(glow);
        g.position.set(o.x, 0, o.z); this.root.add(g);
        plat.userData.label = 'Sound desk'; roof.userData.label = 'Sound desk';
        this.blockers.push(plat, roof);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), new THREE.MeshLambertMaterial({ color: '#3a3f52' }));
        m.position.set(o.x, o.h / 2, o.z); this.root.add(m);
        const spk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 1.4), new THREE.MeshLambertMaterial({ color: '#0b0b10' })); spk.position.set(o.x, o.h + 2, o.z); this.root.add(spk);
        m.userData.label = spk.userData.label = 'Delay speaker tower';
        this.blockers.push(m, spk);
      }
    }
  }

  // ---------- crowd ----------
  _personGeoms() {
    if (this._pg) return this._pg;
    const legs = merge([box(0.15, 0.55, 0.2, -0.095, 0.275, 0), box(0.15, 0.55, 0.2, 0.095, 0.275, 0)]);
    const body = merge([box(0.44, 0.5, 0.25, 0, 0.8, 0), box(0.12, 0.44, 0.14, -0.29, 0.82, 0), box(0.12, 0.44, 0.14, 0.29, 0.82, 0)]);
    const bodyUp = merge([box(0.44, 0.5, 0.25, 0, 0.8, 0), box(0.12, 0.46, 0.14, -0.27, 1.26, 0.04), box(0.12, 0.46, 0.14, 0.27, 1.26, 0.04)]);
    const headG = new THREE.CylinderGeometry(0.15, 0.15, 0.28, 10, 1, false); headG.translate(0, 1.2, 0);
    const head = merge([headG, box(0.12, 0.06, 0.12, 0, 1.075, 0)]);
    const hair = merge([box(0.33, 0.09, 0.33, 0, 1.37, -0.01), box(0.33, 0.16, 0.06, 0, 1.28, -0.15)]);
    this._pg = { legs, body, bodyUp, head, hair };
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
    const cap = opts.cap || (coarse ? 16000 : 38000);
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
        if (focus && Math.hypot(jx - focus.x, jz - focus.z) < 0.7) continue;
        const isNear = near(jx, jz) && focus.y < 1;
        const density = zn.cat === 'PIT' ? 1 : 0.82;
        if (hash01('f' + jx.toFixed(2) + jz.toFixed(2)) < (isNear ? density : density * keep)) spots.push([jx, 0, jz]);
      }
    }

    const N = spots.length;
    const G = this._personGeoms();
    const group = new THREE.Group();
    const upIdx = [], downIdx = [];
    for (let i = 0; i < N; i++) (hash01('u' + i) < 0.28 ? upIdx : downIdx).push(i);
    const mk = (geo, color, count) => { const m = new THREE.InstancedMesh(geo, this._crowdMaterial(color), Math.max(1, count)); m.count = count; m.frustumCulled = false; group.add(m); return m; };
    const legs = mk(G.legs, '#ffffff', N), head = mk(G.head, '#ffffff', N), hair = mk(G.hair, '#ffffff', N);
    const bodyDown = mk(G.body, '#ffffff', downIdx.length), bodyUp = mk(G.bodyUp, '#ffffff', upIdx.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    const isUp = new Uint8Array(N); upIdx.forEach((i) => (isUp[i] = 1));
    let di = 0, ui = 0;
    const phones = [];
    this._headColors = [];
    for (let i = 0; i < N; i++) {
      const [x, y, z] = spots[i];
      const yaw = Math.atan2(target[0] - x, target[1] - z) + (hash01('y' + i) - 0.5) * 0.5;
      q.setFromAxisAngle(up, yaw); p.set(x, y, z);
      const s = 1.08 + hash01('h' + i) * 0.18; sc.set(s, s, s);
      m4.compose(p, q, sc);
      legs.setMatrixAt(i, m4); head.setMatrixAt(i, m4); hair.setMatrixAt(i, m4);
      legs.setColorAt(i, col.set(PANTS[Math.floor(hash01('pa' + i) * PANTS.length)]));
      const skin = SKIN[Math.floor(hash01('sk' + i) * SKIN.length)];
      this._headColors.push(skin);
      head.setColorAt(i, col.set(this.toyHeads ? TOY[0] : skin));
      hair.setColorAt(i, col.set(HAIR[Math.floor(hash01('ha' + i) * HAIR.length)]));
      const shirt = col.set(SHIRTS[Math.floor(hash01('sh' + i) * SHIRTS.length)]);
      if (isUp[i]) {
        bodyUp.setMatrixAt(ui, m4); bodyUp.setColorAt(ui++, shirt);
        if (hash01('ph' + i) < 0.4 && !(focus && Math.hypot(x - focus.x, z - focus.z) < 4)) { const fwd = 0.1; phones.push(x + Math.sin(yaw) * fwd + Math.cos(yaw) * 0.27 * s, y + 1.52 * s, z + Math.cos(yaw) * fwd - Math.sin(yaw) * 0.27 * s); }
      } else { bodyDown.setMatrixAt(di, m4); bodyDown.setColorAt(di++, shirt); }
    }
    for (const m of group.children) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.headMesh = head;
    if (phones.length) {
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(phones, 3));
      const pm = new THREE.PointsMaterial({ color: new THREE.Color('#fff6d8').multiplyScalar(2.5), toneMapped: false, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      group.add(new THREE.Points(pg, pm));
    }
    this.crowd = group;
    this.crowdCount = N;
    this.root.add(group);
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
    const eye = new THREE.Vector3(point.x, point.y + EYE, point.z);
    this.eye = eye;
    const look = this.stageFocus.clone();
    const endQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, look, new THREE.Vector3(0, 1, 0)));
    this.baseQ = endQ;
    this._frameStage();
    this.yaw = this.rest.yaw; this.pitch = this.rest.pitch; this.fov = this.rest.fov; this.camera.fov = this.fov; this.camera.updateProjectionMatrix();
    const b = this.model.bounds;
    const startPos = new THREE.Vector3(eye.x * 0.4, Math.max(90, (b.z1 - b.z0) * 0.55), eye.z * 0.4 + (b.z1 - b.z0) * 0.35);
    const startQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(startPos, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)));
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
    const c = this.canvas; let drag = null; const pts = new Map(); let pinch = null;
    c.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.fly = null; });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.fov = Math.max(14, Math.min(75, this.fov * (pinch / d))); pinch = d; return; }
      if (!drag) return;
      const k = (this.fov / 58) * 0.0042;
      this.yaw = Math.max(-2, Math.min(2, drag.yaw - (e.clientX - drag.x) * k));
      this.pitch = Math.max(-0.7, Math.min(0.9, drag.pitch - (e.clientY - drag.y) * k));
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = null; drag = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.fov = Math.max(14, Math.min(75, this.fov * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }

  scrub(p) { this.scrubP = p; this.fly = null; }

  zoom(f) { this.fov = Math.max(14, Math.min(75, this.fov * f)); }
  recentre() { this.yaw = this.rest.yaw; this.pitch = this.rest.pitch; this.fov = this.rest.fov; }

  // Aim and zoom so the whole stage (deck to top of the main screen) sits in the upper-middle of
  // the frame from any seat: far seats get a longer lens, close seats a wider one.
  _frameStage() {
    const eye = this.eye, aspect = this.camera.aspect || 1;
    const inv = new THREE.Matrix4().compose(eye, this.baseQ, new THREE.Vector3(1, 1, 1)).invert();
    let h0 = Infinity, h1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of this.framePts || []) {
      const c = p.clone().applyMatrix4(inv); if (c.z > -0.5) continue;
      const h = Math.atan2(c.x, -c.z), v = Math.atan2(c.y, -c.z);
      h0 = Math.min(h0, h); h1 = Math.max(h1, h); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    if (!isFinite(h0)) { this.rest = { yaw: 0, pitch: 0, fov: 58 }; return; }
    const hHalf = (h1 - h0) / 2, vHalf = (v1 - v0) / 2;
    // stage should fill ~62% of the width (wide screens) and leave room for the sheet on phones
    const fill = aspect < 0.9 ? 0.92 : 0.62;
    const needV = Math.max(vHalf / 0.55, Math.atan(Math.tan(hHalf / fill) / aspect));
    const fov = Math.max(14, Math.min(64, THREE.MathUtils.radToDeg(needV * 2)));
    // place the stage a little above centre (the bottom sheet covers the lower part on phones)
    const lift = THREE.MathUtils.degToRad(fov) * (aspect < 0.9 ? 0.16 : 0.06);
    this.rest = { yaw: -(h0 + h1) / 2, pitch: (v0 + v1) / 2 - lift, fov };
  }

  start() { if (this.running) return; this.running = true; this.resize(); const loop = () => { if (!this.running) return; this._frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.running = false; }

  _frame() {
    if (!this.baseQ) return;
    const t = this.clock.getElapsedTime();
    this.uTime.value = t;
    for (const f of this.anim) f(t);
    const cam = this.camera;
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
      mid.y += Math.sin(e * Math.PI) * 8;
      cam.position.copy(mid); cam.quaternion.copy(this.fly.startQ).slerp(finalQ, e);
      if (k >= 1) this.fly = null;
    } else { cam.position.copy(this.eye); cam.quaternion.copy(finalQ); }
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov += (this.fov - cam.fov) * 0.2; cam.updateProjectionMatrix(); }
    this.composer.render();
  }
}
