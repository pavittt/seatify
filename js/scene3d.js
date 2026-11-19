// The 3D "view from your seat": stepped stands, stage, lights and a crowd of
// chunky toy-block people rendered with instancing.
import * as THREE from 'three';
import { CATS } from './data/venues.js';
import { ROW_D, EYE, hash01 } from './model.js';

const SHIRTS = ['#ff5c8a', '#ffb54a', '#3fe0a5', '#55c8ff', '#8b95ff', '#f3f0e8', '#1d1f2b', '#e5484d', '#ffd23f', '#2ec4b6', '#9b5de5', '#f15bb5', '#00bbf9', '#fee440', '#222222', '#fafafa'];
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
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07080f');
    this.scene.fog = new THREE.Fog('#07080f', 160, 520);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);
    this.clock = new THREE.Clock();
    this.uTime = { value: 0 };
    this.anim = [];
    this.yaw = 0; this.pitch = 0; this.fov = 58;
    this.running = false;
    this.toyHeads = false;
    this._bindControls();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
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

    this.root.add(new THREE.HemisphereLight('#9fb0ff', '#2a1a30', 0.95));
    const moon = new THREE.DirectionalLight('#c9d4ff', 0.55); moon.position.set(-80, 160, 120); this.root.add(moon);
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
      const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: v.kind === 'arena' ? '#1d1e26' : '#1f3a24' }));
      f.rotation.x = -Math.PI / 2; f.position.y = 0; this.root.add(f);
    } else {
      const { w, d } = model.field;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: v.scenery === 'palms' ? '#4a3d26' : '#26402a' }));
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
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(fl.x1 - fl.x0, fl.z1 - fl.z0), new THREE.MeshLambertMaterial({ color: '#20222c' }));
    deck.rotation.x = -Math.PI / 2; deck.position.set((fl.x0 + fl.x1) / 2, 0.02, (fl.z0 + fl.z1) / 2); this.root.add(deck);
    const barrierMat = new THREE.MeshLambertMaterial({ color: '#9aa3b8' });
    for (const z of model.zones) {
      const mat = new THREE.MeshBasicMaterial({ color: CATS[z.cat].color, transparent: true, opacity: 0.12, depthWrite: false });
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
      const base = new THREE.Color(s.closed ? '#22242e' : CATS[s.cat].color);
      const M = 10;
      for (let r = 0; r < s.rowsCount; r++) {
        const dIn = s.d0 + r * ROW_D - ROW_D / 2, dOut = dIn + ROW_D;
        const y = s.base + r * s.rake, yNext = y + s.rake;
        c.copy(base).multiplyScalar(s.closed ? 1 : (r % 2 ? 0.26 : 0.32));
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
      const cc = closed ? [0.05, 0.05, 0.08] : [0.95, 0.35, 0.75];
      for (let i = 0; i < 6; i++) rc.push(...cc);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.root.add(new THREE.Mesh(rg, ribbonMat));
    this.anim.push((t) => ribbonMat.color.setHSL((t * 0.08) % 1, 0.7, 0.65));

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
      const base = new THREE.Color(CATS[s.cat].color);
      for (let r = 0; r < s.rowsCount; r++) {
        const b0 = r * ROW_D - ROW_D / 2, b1 = b0 + ROW_D, y = s.base + r * s.rake;
        const c = base.clone().multiplyScalar(r % 2 ? 0.26 : 0.33);
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

  _screenTexture(w, h, kind) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round((512 * h) / w);
    const ctx = cv.getContext('2d'); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const title = this.showTitle || 'LIVE';
    const draw = (t) => {
      const W = cv.width, H = cv.height;
      const g = ctx.createLinearGradient(0, 0, W, H);
      const h1 = (t * 18) % 360, h2 = (h1 + 80) % 360;
      g.addColorStop(0, `hsl(${h1} 90% 55%)`); g.addColorStop(1, `hsl(${h2} 85% 35%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      for (let i = 0; i < 12; i++) { const x = ((i * 53 + t * 60) % (W + 80)) - 40; ctx.fillRect(x, 0, 14, H); }
      ctx.globalAlpha = 1;
      if (kind === 'main') {
        // a blocky performer silhouette
        const cx = W / 2 + Math.sin(t * 1.3) * W * 0.06, by = H * 0.95, s = H / 6;
        ctx.fillStyle = 'rgba(10,8,20,0.85)';
        ctx.fillRect(cx - s * 0.5, by - s * 2.2, s, s * 1.4);
        ctx.fillRect(cx - s * 0.32, by - s * 3.05, s * 0.64, s * 0.75);
        ctx.fillRect(cx - s * 0.95, by - s * 2.2 - Math.abs(Math.sin(t * 3)) * s * 0.6, s * 0.38, s * 1.1);
        ctx.fillRect(cx + s * 0.57, by - s * 2.2, s * 0.38, s * 1.1);
        ctx.fillRect(cx - s * 0.45, by - s * 0.8, s * 0.38, s * 0.8); ctx.fillRect(cx + s * 0.07, by - s * 0.8, s * 0.38, s * 0.8);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(H * 0.11)}px system-ui, sans-serif`; ctx.textAlign = 'left';
        ctx.fillText(title.toUpperCase(), W * 0.04, H * 0.16);
      }
      tex.needsUpdate = true;
    };
    draw(0);
    let last = 0;
    this.anim.push((t) => { if (t - last > 0.08) { last = t; draw(t); } });
    return tex;
  }

  _buildStage(model) {
    const st = model.stage, root = this.root;
    const deckMat = new THREE.MeshLambertMaterial({ color: '#1c1d26' });
    const trussMat = new THREE.MeshLambertMaterial({ color: '#4a4f62' });
    const blackMat = new THREE.MeshLambertMaterial({ color: '#0c0c11' });
    const addTarget = (m) => { this.targets.push(m); return m; };
    const beams = [];
    if (st.type === 'end') {
      const cz = st.zBack + st.d / 2;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), deckMat); deck.position.set(0, st.h / 2, cz); root.add(addTarget(deck));
      const edge = new THREE.Mesh(new THREE.BoxGeometry(st.w, 0.15, 0.2), new THREE.MeshBasicMaterial({ color: '#ff7ad9' })); edge.position.set(0, st.h, st.zFront); root.add(edge);
      // back wall + main screen
      const backH = st.screenY + st.screenH + 6;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(st.w + 8, backH, 1), blackMat); wall.position.set(0, backH / 2, st.zBack); root.add(wall);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(st.screenW, st.screenH), new THREE.MeshBasicMaterial({ map: this._screenTexture(st.screenW, st.screenH, 'main') }));
      scr.position.set(0, st.screenY + st.screenH / 2, st.zBack + 0.6); root.add(addTarget(scr));
      this.mainScreen = scr;
      // side screens
      const sw = st.screenH * 0.62, sh = st.screenH * 1.05;
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this._screenTexture(sw, sh, 'side') }));
        s.position.set(sx * (st.w / 2 + sw / 2 + 3), st.screenY + sh / 2 - 1, st.zBack + st.d * 0.4); s.rotation.y = -sx * 0.35; root.add(addTarget(s));
        const fr = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.6, sh + 0.6, 0.5), blackMat); fr.position.copy(s.position); fr.rotation.copy(s.rotation); fr.translateZ(-0.3); root.add(fr);
        // speaker hangs
        const spk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), blackMat); spk.position.set(sx * (st.w / 2 - 2), st.screenY + st.screenH - 2, st.zFront - 1.5); root.add(spk);
        spk.userData.label = 'Speaker hang'; this.blockers.push(spk);
        // truss towers
        const tw = new THREE.Mesh(new THREE.BoxGeometry(1.2, backH + 4, 1.2), trussMat); tw.position.set(sx * (st.w / 2 + 1), (backH + 4) / 2, st.zFront - 1); root.add(tw);
        tw.userData.label = 'Stage tower'; this.blockers.push(tw);
      }
      const roofTruss = new THREE.Mesh(new THREE.BoxGeometry(st.w + 4, 1.2, st.d), trussMat); roofTruss.position.set(0, backH + 3.4, cz); root.add(roofTruss);
      for (let i = 0; i < 10; i++) beams.push({ x: -st.w / 2 + 3 + (i * (st.w - 6)) / 9, y: backH + 2.6, z: st.zFront - 2 });
      if (st.catwalk) {
        const L = st.catwalk.z1 - st.catwalk.z0;
        const cw = new THREE.Mesh(new THREE.BoxGeometry(st.catwalk.w, st.h - 0.4, L), deckMat); cw.position.set(0, (st.h - 0.4) / 2, st.catwalk.z0 + L / 2); root.add(addTarget(cw));
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, L), new THREE.MeshBasicMaterial({ color: '#7af0ff' }));
        for (const sx of [-1, 1]) { const s2 = strip.clone(); s2.position.set(sx * st.catwalk.w / 2, st.h - 0.35, st.catwalk.z0 + L / 2); root.add(s2); }
        const bs = new THREE.Mesh(new THREE.CylinderGeometry(st.bstage.r, st.bstage.r, st.h - 0.4, 32), deckMat); bs.position.set(0, (st.h - 0.4) / 2, st.bstage.z); root.add(addTarget(bs));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(st.bstage.r, 0.12, 6, 48), new THREE.MeshBasicMaterial({ color: '#7af0ff' })); ring.rotation.x = Math.PI / 2; ring.position.set(0, st.h - 0.35, st.bstage.z); root.add(ring);
      }
      this.stageFocus = new THREE.Vector3(0, st.screenY * 0.7, st.zBack + st.d * 0.5);
    } else {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(st.r, st.r, st.h, 48), deckMat); deck.position.set(st.x, st.h / 2, st.z); root.add(addTarget(deck));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(st.r, 0.14, 6, 64), new THREE.MeshBasicMaterial({ color: '#ff7ad9' })); ring.rotation.x = Math.PI / 2; ring.position.set(st.x, st.h, st.z); root.add(ring);
      const cube = new THREE.Group(); cube.position.set(st.x, st.screenY + st.screenH / 2, st.z);
      const tex = this._screenTexture(st.screenW, st.screenH, 'main');
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(st.screenW, st.screenH), new THREE.MeshBasicMaterial({ map: tex }));
        s.rotation.y = (i * Math.PI) / 2; s.translateZ(st.screenW / 2); cube.add(s); this.targets.push(s);
      }
      root.add(cube); cube.updateMatrixWorld(true);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(st.r + 3, 0.5, 6, 48), trussMat); hoop.rotation.x = Math.PI / 2; hoop.position.set(st.x, st.screenY + st.screenH + 4, st.z); root.add(hoop);
      for (let i = 0; i < 12; i++) { const a2 = (i / 12) * Math.PI * 2; beams.push({ x: st.x + Math.cos(a2) * (st.r + 3), y: st.screenY + st.screenH + 3.4, z: st.z + Math.sin(a2) * (st.r + 3) }); }
      this.stageFocus = new THREE.Vector3(st.x, st.screenY * 0.55, st.z);
    }
    // light beams
    const beamGeo = new THREE.ConeGeometry(2.6, 60, 16, 1, true); beamGeo.translate(0, -30, 0);
    beams.forEach((b, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((i * 0.09) % 1, 0.9, 0.6), transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const m = new THREE.Mesh(beamGeo, mat); m.position.set(b.x, b.y, b.z); root.add(m);
      const ph = i * 0.7;
      this.anim.push((t) => { m.rotation.x = 0.55 + Math.sin(t * 0.7 + ph) * 0.45; m.rotation.z = Math.sin(t * 0.9 + ph * 1.3) * 0.6; mat.color.setHSL((t * 0.03 + i * 0.09) % 1, 0.9, 0.6); });
    });
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

  buildCrowd(focus) {
    const model = this.model;
    if (this.crowd) { this.root.remove(this.crowd); this.crowd.traverse((o) => o.dispose?.()); }
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cap = coarse ? 16000 : 38000;
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
      const s = 0.92 + hash01('h' + i) * 0.16; sc.set(s, s, s);
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
      const pm = new THREE.PointsMaterial({ color: '#fff6d8', size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
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
    this.yaw = 0; this.pitch = this._restPitch(); this.fov = 58;
    const look = this.stageFocus.clone();
    const endQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, look, new THREE.Vector3(0, 1, 0)));
    this.baseQ = endQ;
    const b = this.model.bounds;
    const startPos = new THREE.Vector3(eye.x * 0.4, Math.max(90, (b.z1 - b.z0) * 0.55), eye.z * 0.4 + (b.z1 - b.z0) * 0.35);
    const startQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(startPos, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)));
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
      this.yaw = Math.max(-1.6, Math.min(1.6, drag.yaw - (e.clientX - drag.x) * k));
      this.pitch = Math.max(-0.7, Math.min(0.9, drag.pitch - (e.clientY - drag.y) * k));
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = null; drag = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.fov = Math.max(14, Math.min(75, this.fov * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }

  zoom(f) { this.fov = Math.max(14, Math.min(75, this.fov * f)); }
  recentre() { this.yaw = 0; this.pitch = this._restPitch(); this.fov = 58; }
  // on tall phone screens the sheet covers the bottom half, so tilt down a little to keep the stage and crowd in view
  _restPitch() { return this.camera.aspect < 0.9 ? -0.2 : 0; }

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
    if (this.fly) {
      const k = Math.min(1, (t - this.fly.t0) / this.fly.dur); const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const mid = this.fly.startPos.clone().lerp(this.eye, e);
      mid.y += Math.sin(e * Math.PI) * 8;
      cam.position.copy(mid); cam.quaternion.copy(this.fly.startQ).slerp(finalQ, e);
      if (k >= 1) this.fly = null;
    } else { cam.position.copy(this.eye); cam.quaternion.copy(finalQ); }
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov += (this.fov - cam.fov) * 0.2; cam.updateProjectionMatrix(); }
    this.renderer.render(this.scene, cam);
  }
}
