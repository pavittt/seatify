// Top-down SVG seat map. World x -> svg x, world z -> svg y, so the stage
// (negative z) sits at the top.
import { CATS } from './data/venues.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const pts = (arr) => arr.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

function sePath(a, b, n, steps = 96) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), e = 2 / n;
    out.push([a * Math.sign(c) * Math.abs(c) ** e, b * Math.sign(s) * Math.abs(s) ** e]);
  }
  return out;
}

export function drawStage(g, model, mini = false) {
  const st = model.stage;
  if (st.type === 'center') {
    el('circle', { cx: st.x, cy: st.z, r: st.r, class: 'm-stage' }, g);
    if (!mini) el('text', { x: st.x, y: st.z + 1.5, class: 'm-stage-label', 'font-size': st.r * 0.4 }, g).textContent = 'STAGE';
  } else {
    el('rect', { x: -st.w / 2, y: st.zBack, width: st.w, height: st.d, rx: 1.5, class: 'm-stage' }, g);
    if (st.catwalk) {
      el('rect', { x: -st.catwalk.w / 2, y: st.catwalk.z0 - 0.5, width: st.catwalk.w, height: st.catwalk.z1 - st.catwalk.z0, class: 'm-stage' }, g);
      el('circle', { cx: 0, cy: st.bstage.z, r: st.bstage.r, class: 'm-stage' }, g);
    }
    if (!mini) el('text', { x: 0, y: st.zBack + st.d * 0.62, class: 'm-stage-label', 'font-size': Math.min(6, st.d * 0.4) }, g).textContent = 'STAGE';
  }
}

export function drawBase(g, model) {
  if (model.field.type === 'bowl') {
    const { a, b, n } = model.field;
    el('polygon', { points: pts(sePath(a, b, n)), class: 'm-field' }, g);
  } else {
    const { w, d } = model.field;
    el('rect', { x: -w / 2, y: -d / 2, width: w, height: d, rx: 4, class: 'm-field' }, g);
  }
}

export class SeatMap {
  constructor(container, { onPick }) {
    this.container = container;
    this.onPick = onPick;
    this.svg = el('svg', { class: 'seatmap', role: 'img', 'aria-label': 'Seat map' });
    container.appendChild(this.svg);
    this.filter = null;
    this.selectedId = null;
    this._bindPanZoom();
  }

  render(model) {
    this.model = model;
    const svg = this.svg;
    svg.innerHTML = '';
    const { x0, x1, z0, z1 } = model.bounds;
    this.home = [x0, z0, x1 - x0, z1 - z0];
    this.vb = [...this.home];
    this._applyVB();
    const g = el('g', {}, svg);
    drawBase(g, model);
    this.items = new Map();

    for (const z of model.zones) {
      let shape;
      if (z.ring) {
        const { x, z: cz, r0, r1 } = z.ring;
        const d = `M ${x - r1} ${cz} a ${r1} ${r1} 0 1 0 ${2 * r1} 0 a ${r1} ${r1} 0 1 0 ${-2 * r1} 0 M ${x - r0} ${cz} a ${r0} ${r0} 0 1 1 ${2 * r0} 0 a ${r0} ${r0} 0 1 1 ${-2 * r0} 0`;
        shape = el('path', { d, 'fill-rule': 'evenodd' }, g);
      } else {
        const { x0, x1, z0, z1 } = z.rect;
        shape = el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, rx: 2 }, g);
      }
      shape.setAttribute('class', 'm-zone');
      shape.style.setProperty('--c', CATS[z.cat].color);
      this._makeInteractive(shape, z);
      const lx = z.ring ? z.ring.x : (z.rect.x0 + z.rect.x1) / 2;
      const ly = z.ring ? z.ring.z + (z.ring.r0 + z.ring.r1) / 2 : (z.rect.z0 + z.rect.z1) / 2;
      const fs = z.ring ? 4 : Math.min(7, (z.rect.x1 - z.rect.x0) / 9, (z.rect.z1 - z.rect.z0) / 3);
      el('text', { x: lx, y: ly, class: 'm-zone-label', 'font-size': fs.toFixed(1) }, g).textContent = z.label.toUpperCase();
      this.items.set(z.id, { shape, item: z });
    }

    for (const o of model.obstacles) {
      el('rect', { x: o.x - o.w / 2, y: o.z - o.d / 2, width: o.w, height: o.d, class: o.type === 'foh' ? 'm-foh' : 'm-tower' }, g);
      if (o.type === 'foh') el('text', { x: o.x, y: o.z + 1, class: 'm-foh-label', 'font-size': 2.4 }, g).textContent = 'FOH';
    }
    drawStage(g, model);

    for (const s of model.sections) {
      const shape = el('polygon', { points: pts(s.poly), class: 'm-sec' }, g);
      shape.style.setProperty('--c', CATS[s.cat].color);
      shape.dataset.avail = s.availability;
      if (!s.closed && s.availability !== 'soldout') this._makeInteractive(shape, s);
      const [cx, cz] = s.center;
      const size = model.venue.kind === 'arena' ? 2.6 : s.kind === 'line' ? 3.2 : 4.2;
      const t = el('text', { x: cx, y: cz + size * 0.35, class: 'm-sec-label', 'font-size': size }, g);
      t.textContent = s.closed ? '' : s.id;
      if (s.availability === 'few') el('circle', { cx: cx + size * 1.3, cy: cz - size * 0.5, r: size * 0.28, class: 'm-few' }, g);
      this.items.set(s.id, { shape, item: s });
    }
    this.marker = el('g', { class: 'm-marker', visibility: 'hidden' }, svg);
    el('circle', { r: 3.2, class: 'm-marker-ring' }, this.marker);
    el('circle', { r: 1.4, class: 'm-marker-dot' }, this.marker);
    this.applyFilter(this.filter);
  }

  _makeInteractive(shape, item) {
    shape.classList.add('hit');
    shape.setAttribute('tabindex', '0');
    shape.setAttribute('role', 'button');
    shape.setAttribute('aria-label', item.label);
    shape.addEventListener('click', (e) => { if (this._dragged) return; e.stopPropagation(); this.onPick(item); });
    shape.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onPick(item); } });
  }

  applyFilter(cat) {
    this.filter = cat;
    if (!this.items) return;
    for (const { shape, item } of this.items.values()) shape.classList.toggle('dim', !!cat && item.cat !== cat);
  }

  select(id) {
    if (this.selectedId && this.items.get(this.selectedId)) this.items.get(this.selectedId).shape.classList.remove('sel');
    this.selectedId = id;
    if (id && this.items.get(id)) this.items.get(id).shape.classList.add('sel');
  }

  showMarker(p) {
    if (!p) { this.marker.setAttribute('visibility', 'hidden'); return; }
    this.marker.setAttribute('visibility', 'visible');
    this.marker.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.z.toFixed(1)})`);
  }

  zoomTo(item) {
    const P = item.poly || (item.rect ? [[item.rect.x0, item.rect.z0], [item.rect.x1, item.rect.z1]] : null);
    if (!P) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const w = Math.min(this.home[2], Math.max(this.home[2] * 0.45, (x1 - x0) * 2.2)), h = w * (this.home[3] / this.home[2]);
    // keep the picked item in the upper part of the map, clear of the bottom sheet
    this._animateVB([(x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - h * 0.3, w, h]);
  }

  resetView() { this._animateVB([...this.home]); }

  _animateVB(to) {
    const from = [...this.vb], t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 380), e = 1 - (1 - k) ** 3;
      this.vb = from.map((v, i) => v + (to[i] - v) * e);
      this._applyVB();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _applyVB() { this.svg.setAttribute('viewBox', this.vb.map((v) => v.toFixed(2)).join(' ')); }

  _bindPanZoom() {
    const svg = this.svg;
    const pointers = new Map();
    let start = null;
    const toWorld = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      const s = Math.max(this.vb[2] / r.width, this.vb[3] / r.height);
      const ox = this.vb[0] + (this.vb[2] - r.width * s) / 2, oy = this.vb[1] + (this.vb[3] - r.height * s) / 2;
      return [ox + (cx - r.left) * s, oy + (cy - r.top) * s, s];
    };
    const zoomAt = (cx, cy, f) => {
      const [wx, wy] = toWorld(cx, cy);
      const nw = Math.min(this.home[2] * 1.4, Math.max(this.home[2] * 0.08, this.vb[2] * f));
      const k = nw / this.vb[2];
      this.vb = [wx - (wx - this.vb[0]) * k, wy - (wy - this.vb[1]) * k, this.vb[2] * k, this.vb[3] * k];
      this._applyVB();
    };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this._dragged = false;
      start = { vb: [...this.vb], pts: new Map(pointers) };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const r = svg.getBoundingClientRect();
      const s = Math.max(this.vb[2] / r.width, this.vb[3] / r.height);
      if (pointers.size === 1 && start) {
        const [sx, sy] = start.pts.get(e.pointerId) || [e.clientX, e.clientY];
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.hypot(dx, dy) > 6) { this._dragged = true; if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId); }
        if (this._dragged) { this.vb[0] = start.vb[0] - dx * s; this.vb[1] = start.vb[1] - dy * s; this._applyVB(); }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this._pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, this._pinch / d);
        this._pinch = d; this._dragged = true;
      }
    });
    const end = (e) => { pointers.delete(e.pointerId); this._pinch = null; if (pointers.size === 0) setTimeout(() => (this._dragged = false), 0); start = { vb: [...this.vb], pts: new Map(pointers) }; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }
}

// Small static map for the view sheet
export function miniMap(container, model, p) {
  container.innerHTML = '';
  const { x0, x1, z0, z1 } = model.bounds;
  const svg = el('svg', { viewBox: `${x0} ${z0} ${x1 - x0} ${z1 - z0}`, class: 'minimap', 'aria-hidden': 'true' }, container);
  drawBase(svg, model);
  for (const z of model.zones) {
    if (z.rect) { const r = z.rect; const e = el('rect', { x: r.x0, y: r.z0, width: r.x1 - r.x0, height: r.z1 - r.z0, class: 'mm-zone' }, svg); e.style.setProperty('--c', CATS[z.cat].color); }
  }
  for (const s of model.sections) { const e = el('polygon', { points: pts(s.poly), class: 'mm-sec' + (s.closed ? ' closed' : '') }, svg); e.style.setProperty('--c', CATS[s.cat].color); }
  drawStage(svg, model, true);
  const st = model.stage;
  const tx = st.type === 'center' ? st.x : 0, tz = st.type === 'center' ? st.z : st.zFront;
  const sw = (x1 - x0) / 140;
  el('line', { x1: p.x, y1: p.z, x2: tx, y2: tz, class: 'mm-line', 'stroke-width': sw * 1.4, 'stroke-dasharray': `${sw * 4} ${sw * 3}` }, svg);
  el('circle', { cx: p.x, cy: p.z, r: sw * 6, class: 'mm-you-ring' }, svg);
  el('circle', { cx: p.x, cy: p.z, r: sw * 3, class: 'mm-you' }, svg);
}
