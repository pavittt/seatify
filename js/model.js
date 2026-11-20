// Turns a venue spec + stage layout into sections, seats, standing zones,
// stage geometry and obstacles. Pure data, shared by the 2D map and the 3D view.
import { CATS } from './data/venues.js';

export const SEAT_W = 0.55;
export const ROW_D = 0.85;
export const EYE = 1.62; // eye height of a standing person, metres

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');
export function rowLabel(i) {
  return i < LETTERS.length ? LETTERS[i] : LETTERS[Math.floor(i / LETTERS.length) - 1] + LETTERS[i % LETTERS.length];
}

export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function priceOf(venue, cat) {
  return Math.round((CATS[cat].price * (venue.priceScale || 1)) / 250) * 250;
}

export const fmtINR = (n) => '₹' + n.toLocaleString('en-IN');

function sePoint(a, b, n, t) {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / n;
  return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

// Angle of a point measured from the far end of the venue (0 = straight
// in front of an end stage, 180 = directly behind it).
function phiOf(x, z) { return (Math.atan2(Math.abs(x), z) * 180) / Math.PI; }

function seatsAlong(sampler, len, n) {
  // sampler(u) -> [x,z] for u in [0,1]; returns n positions evenly by arc length
  const M = 48, pts = [], cum = [0];
  for (let i = 0; i <= M; i++) pts.push(sampler(i / M));
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[M], out = [];
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) / n) * total;
    let j = 1; while (j < M && cum[j] < target) j++;
    const f = (target - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
  }
  return out;
}

function arcLength(sampler) {
  let L = 0, p = sampler(0);
  for (let i = 1; i <= 32; i++) { const q = sampler(i / 32); L += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; }
  return L;
}

function availabilityFor(id) {
  const r = hash01('avail' + id);
  if (r < 0.1) return 'soldout';
  if (r < 0.35) return 'few';
  return 'open';
}
const SOLD_RATE = { open: 0.42, few: 0.9, soldout: 1 };

export function buildModel(venue, layoutId) {
  const stageSpec = venue.stage;
  const model = { venue, layoutId, sections: [], zones: [], obstacles: [], stands: [] };
  let floor, zBack;

  if (venue.bowl) {
    const { a, b, n } = venue.bowl;
    const k = n > 2.3 ? 0.8 : 0.72;
    floor = { x0: -a * k, x1: a * k, z0: -b * 0.92, z1: b * k };
    zBack = -b * (venue.kind === 'arena' ? 0.86 : 0.9);
    model.field = { type: 'bowl', a, b, n };
  } else {
    const { w, d } = venue.ground;
    floor = { x0: -w / 2 + (venue.ground.sideStands ? 16 : 6), x1: w / 2 - (venue.ground.sideStands ? 16 : 6), z0: -d / 2 + 2, z1: d / 2 - 24 };
    zBack = -d / 2 + 3;
    model.field = { type: 'ground', w, d };
  }

  // ---- stage ----
  const st = { ...stageSpec };
  if (layoutId === 'center') {
    const r = venue.kind === 'arena' ? 6 : 11;
    const cz = venue.bowl ? 0 : (floor.z0 + floor.z1) / 2;
    Object.assign(st, { type: 'center', r, x: 0, z: cz, front: [0, cz], screenW: venue.kind === 'arena' ? 10 : 16, screenH: venue.kind === 'arena' ? 5 : 8, screenY: venue.kind === 'arena' ? 9 : 15 });
  } else {
    const zFront = zBack + st.d;
    Object.assign(st, { type: 'end', x: 0, zBack, zFront, front: [0, zFront] });
    if (layoutId === 'catwalk') {
      const L = Math.min(48, (floor.z1 - zFront) * 0.38);
      st.catwalk = { w: 3.2, z0: zFront, z1: zFront + L };
      st.bstage = { r: venue.kind === 'arena' ? 3 : 6, z: zFront + L };
    }
  }
  model.stage = st;
  model.floor = floor;

  // ---- standing zones ----
  const f0 = layoutId === 'center' ? floor.z0 : st.zFront + 3;
  const depth = floor.z1 - f0;
  const isGround = !venue.bowl;
  const zone = (id, label, cat, x0, x1, z0, z1, extra = {}) => {
    const area = (x1 - x0) * (z1 - z0);
    const z = { id, label, cat, kind: 'zone', standing: true, rect: { x0, x1, z0, z1 }, cap: Math.round((area * (cat === 'PIT' ? 2.6 : 2.1)) / 50) * 50, ...extra };
    z.availability = availabilityFor(venue.id + layoutId + id);
    if (z.availability === 'soldout') z.availability = 'few';
    model.zones.push(z);
    return z;
  };
  if (layoutId === 'center') {
    zone('FLOOR', 'Floor standing', isGround ? 'GOLD' : 'GA', floor.x0, floor.x1, floor.z0, floor.z1, { hole: { x: 0, z: st.z, r: st.r + 24 } });
    model.zones.push({ id: 'PIT', label: 'Fan Pit (ring)', cat: 'PIT', kind: 'zone', standing: true, ring: { x: 0, z: st.z, r0: st.r + 2, r1: st.r + 22 }, cap: Math.round((Math.PI * ((st.r + 22) ** 2 - (st.r + 2) ** 2) * 2.6) / 50) * 50, availability: 'few' });
  } else if (st.catwalk) {
    const pitEnd = st.catwalk.z1 + 8;
    const cw = st.catwalk.w / 2 + 1.5;
    zone('PITL', 'Fan Pit Left', 'PIT', floor.x0, -cw, f0, pitEnd);
    zone('PITR', 'Fan Pit Right', 'PIT', cw, floor.x1, f0, pitEnd);
    if (isGround) {
      const mid = pitEnd + (floor.z1 - pitEnd) * 0.5;
      zone('GOLDGA', 'Gold Standing', 'GOLD', floor.x0, floor.x1, pitEnd + 2, mid);
      zone('SILVERGA', 'Silver Standing', 'SILVER', floor.x0, floor.x1, mid + 2, floor.z1);
    } else zone('FLOOR', 'Floor standing', 'GA', floor.x0, floor.x1, pitEnd + 2, floor.z1);
  } else {
    const pitEnd = f0 + Math.min(30, depth * 0.28);
    zone('PIT', 'Fan Pit', 'PIT', floor.x0, floor.x1, f0, pitEnd);
    if (isGround) {
      const mid = pitEnd + (floor.z1 - pitEnd) * 0.48;
      zone('GOLDGA', 'Gold Standing', 'GOLD', floor.x0, floor.x1, pitEnd + 2, mid);
      zone('SILVERGA', 'Silver Standing', 'SILVER', floor.x0, floor.x1, mid + 2, floor.z1);
    } else zone('FLOOR', 'Floor standing', 'GA', floor.x0, floor.x1, pitEnd + 2, floor.z1);
  }

  // ---- obstacles on the floor ----
  const small = venue.kind === 'arena';
  if (layoutId === 'center') {
    model.obstacles.push({ type: 'foh', label: 'Sound desk', x: 0, z: floor.z1 - (small ? 4 : 10), w: small ? 6 : 10, d: small ? 4 : 7, h: small ? 3.2 : 4.5 });
  } else {
    const fz = f0 + depth * (small ? 0.62 : 0.55);
    model.obstacles.push({ type: 'foh', label: 'Sound desk', x: 0, z: fz, w: small ? 6 : 10, d: small ? 4 : 8, h: small ? 3.2 : 4.5 });
    if (venue.delayTowers || isGround) {
      const dx = (floor.x1 - floor.x0) * 0.28;
      for (const sx of [-1, 1]) model.obstacles.push({ type: 'tower', label: 'Delay speaker tower', x: sx * dx, z: fz - 6, w: 1.8, d: 1.8, h: 15 });
    }
  }

  // ---- seated sections ----
  if (venue.bowl) buildBowlSections(model, venue, layoutId);
  if (venue.ground) buildGroundStands(model, venue, floor, layoutId);

  // bounds for the map
  let r = 0;
  if (venue.bowl) {
    const t = venue.bowl.tiers; const last = model.tierInfo[model.tierInfo.length - 1];
    r = last.dEnd + 4;
    model.bounds = { x0: -(venue.bowl.a + r), x1: venue.bowl.a + r, z0: -(venue.bowl.b + r), z1: venue.bowl.b + r };
  } else {
    const { w, d } = venue.ground;
    model.bounds = { x0: -w / 2 - 6, x1: w / 2 + 6, z0: -d / 2 - 6, z1: d / 2 + 6 };
  }
  return model;
}

function bowlCategory(tierIdx, tierCount, phi, layoutId, kind) {
  if (layoutId === 'center') return tierIdx === 0 ? 'PLAT' : tierIdx === tierCount - 1 ? 'SILVER' : 'GOLD';
  const top = tierIdx === tierCount - 1 && tierCount > 1;
  if (kind === 'arena') return phi > 100 ? 'PLAT' : phi > 50 ? 'GOLD' : 'SILVER';
  if (tierIdx === 0) return phi > 105 ? 'PLAT' : phi > 55 ? 'GOLD' : 'SILVER';
  if (top) return phi > 90 ? 'SILVER' : 'BRONZE';
  return phi > 90 ? 'GOLD' : 'SILVER';
}

function buildBowlSections(model, venue, layoutId) {
  const { a, b, n, tiers } = venue.bowl;
  let prevEnd = 0;
  model.tierInfo = [];
  tiers.forEach((tier, ti) => {
    const d0 = ti === 0 ? tier.gap : prevEnd + tier.gap;
    const dEnd = d0 + (tier.rows - 1) * ROW_D;
    prevEnd = dEnd;
    const info = { ...tier, d0, dEnd, top: tier.base + (tier.rows - 1) * tier.rake, index: ti };
    model.tierInfo.push(info);
    const N = tier.sections;
    for (let k = 0; k < N; k++) {
      const t0 = -Math.PI / 2 + (k * 2 * Math.PI) / N;
      const t1 = -Math.PI / 2 + ((k + 1) * 2 * Math.PI) / N;
      const tm = (t0 + t1) / 2;
      const [cx, cz] = sePoint(a + d0, b + d0, n, tm);
      const phi = phiOf(cx, cz);
      const closedLimit = venue.kind === 'arena' ? 138 : 146;
      const closed = layoutId !== 'center' && phi > closedLimit;
      const id = String(tier.prefix * 100 + k + 1);
      const sec = {
        id, label: 'Section ' + id, kind: 'arc', tier: tier.name, tierIdx: ti,
        t0, t1, d0, dEnd, base: tier.base, rake: tier.rake, rowsCount: tier.rows,
        cat: bowlCategory(ti, tiers.length, phi, layoutId, venue.kind), closed, phi,
        availability: closed ? 'closed' : availabilityFor(venue.id + layoutId + id),
      };
      const ring = (d) => (u) => sePoint(a + d, b + d, n, t0 + (t1 - t0) * u);
      sec.poly = [];
      for (let i = 0; i <= 8; i++) sec.poly.push(ring(d0 - ROW_D / 2)(i / 8));
      for (let i = 8; i >= 0; i--) sec.poly.push(ring(dEnd + ROW_D / 2)(i / 8));
      sec.center = sePoint(a + (d0 + dEnd) / 2, b + (d0 + dEnd) / 2, n, tm);
      sec.getRows = () => {
        if (sec._rows) return sec._rows;
        const rows = [];
        const rate = SOLD_RATE[sec.availability] ?? 1;
        for (let r = 0; r < tier.rows; r++) {
          const d = d0 + r * ROW_D, y = tier.base + r * tier.rake;
          const smp = ring(d);
          const cnt = Math.max(4, Math.floor(arcLength(smp) / SEAT_W));
          const pts = seatsAlong(smp, 0, cnt);
          const label = rowLabel(r);
          rows.push({ label, index: r, seats: pts.map((p, i) => ({ n: i + 1, x: p[0], y, z: p[1], sold: hash01(id + label + i) < rate })) });
        }
        sec._rows = rows;
        return rows;
      };
      model.sections.push(sec);
    }
  });
}

function buildGroundStands(model, venue, floor, layoutId) {
  const { w, d, sideStands } = venue.ground;
  const stands = [];
  // Raised lounge deck at the back, facing the stage
  const loungeLen = Math.min(60, (floor.x1 - floor.x0) * 0.5);
  stands.push({ prefix: 'L', name: 'Lounge', cat: 'LOUNGE', origin: [0, floor.z1 + 6], f: [0, -1], len: loungeLen, rows: 7, base: 1.6, rake: 0.5, chunk: loungeLen / 2 });
  if (sideStands) {
    const zMid = floor.z0 + (floor.z1 - floor.z0) * 0.42;
    const len = Math.min(70, (floor.z1 - floor.z0) * 0.5);
    for (const side of [-1, 1]) {
      let fx = -side, fz = -0.32; const m = Math.hypot(fx, fz); fx /= m; fz /= m;
      stands.push({ prefix: side < 0 ? 'GL' : 'GR', name: side < 0 ? 'Gold Stand Left' : 'Gold Stand Right', cat: layoutId === 'center' ? 'PLAT' : 'GOLD', origin: [side * (w / 2 - 14), zMid], f: [fx, fz], len, rows: 14, base: 1.2, rake: 0.5, chunk: len / 3 });
    }
  }
  model.stands = stands;
  for (const s of stands) {
    const [fx, fz] = s.f;
    const right = [-fz, fx];
    const chunks = Math.max(1, Math.round(s.len / s.chunk));
    for (let c = 0; c < chunks; c++) {
      const s0 = -s.len / 2 + (c * s.len) / chunks, s1 = -s.len / 2 + ((c + 1) * s.len) / chunks;
      const id = s.prefix + (c + 1);
      const at = (lat, back) => [s.origin[0] + right[0] * lat - fx * back, s.origin[1] + right[1] * lat - fz * back];
      const sec = {
        id, label: s.name + ' · Block ' + (c + 1), kind: 'line', tier: s.name, cat: s.cat, closed: false,
        stand: s, s0, s1, rowsCount: s.rows, base: s.base, rake: s.rake, right,
        availability: availabilityFor(venue.id + layoutId + id),
      };
      const backD = (s.rows - 1) * ROW_D + ROW_D / 2;
      sec.poly = [at(s0, -ROW_D / 2), at(s1, -ROW_D / 2), at(s1, backD), at(s0, backD)];
      sec.center = at((s0 + s1) / 2, backD / 2);
      sec.getRows = () => {
        if (sec._rows) return sec._rows;
        const rows = []; const rate = SOLD_RATE[sec.availability] ?? 1;
        const cnt = Math.floor((s1 - s0) / SEAT_W);
        for (let r = 0; r < s.rows; r++) {
          const label = rowLabel(r), y = s.base + r * s.rake, seats = [];
          for (let i = 0; i < cnt; i++) {
            const p = at(s0 + (i + 0.5) * SEAT_W, r * ROW_D);
            seats.push({ n: i + 1, x: p[0], y, z: p[1], sold: hash01(id + label + i) < rate });
          }
          rows.push({ label, index: r, seats });
        }
        sec._rows = rows; return rows;
      };
      model.sections.push(sec);
    }
  }
}

// ---- spots for standing zones: front / middle / back ----
export function zoneSpot(model, zone, where) {
  const f = { front: 0.12, middle: 0.5, back: 0.9 }[where];
  if (zone.ring) {
    const r = zone.ring.r0 + (zone.ring.r1 - zone.ring.r0) * f;
    return { x: 0, y: 0, z: zone.ring.z + r };
  }
  const { x0, x1, z0, z1 } = zone.rect;
  let x = (x0 + x1) / 2;
  const z = z0 + (z1 - z0) * f;
  // never drop the viewer inside the sound desk or a tower
  for (const o of model.obstacles) if (Math.abs(x - o.x) < o.w / 2 + 1.5 && Math.abs(z - o.z) < o.d / 2 + 1.5) x = o.x + o.w / 2 + 3;
  if (where === 'back' && x === (x0 + x1) / 2) x += (x1 - x0) * 0.08;
  // step off the centre line so the sound desk is not right in front of you
  if (zone.hole) return { x: 0, y: 0, z: zone.hole.z + zone.hole.r + (z1 - zone.hole.z - zone.hole.r) * f };
  return { x, y: 0, z };
}

// ---- viewing stats from a point ----
export function viewStats(model, p) {
  const st = model.stage;
  const eyeY = p.y + EYE;
  let tx, tz;
  if (st.type === 'center') {
    const dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz) || 1;
    tx = st.x + (dx / d) * st.r; tz = st.z + (dz / d) * st.r;
  } else {
    tx = Math.max(-st.w / 2, Math.min(st.w / 2, p.x)); tz = st.zFront;
  }
  const dist = Math.hypot(p.x - tx, p.z - tz);
  const centreX = st.type === 'center' ? st.x : 0, centreZ = st.type === 'center' ? st.z : st.zFront;
  const toStage = [centreX - p.x, centreZ - p.z];
  const horiz = Math.hypot(toStage[0], toStage[1]) || 1;
  // angle between your line of sight and the stage's facing direction
  const angle = st.type === 'center' ? 0 : Math.abs((Math.atan2(-toStage[0], -toStage[1]) * 180) / Math.PI);
  const elev = (Math.atan2(eyeY - st.h, horiz) * 180) / Math.PI;
  const screenDist = Math.hypot(horiz, eyeY - (st.screenY + st.screenH / 2));
  const tvInches = Math.round(((2.5 * st.screenW) / screenDist / 0.8716 / 0.0254));
  const offCentre = st.type === 'center' ? 0 : p.x;
  return { dist, angle, elev, height: p.y, offCentre, tvInches, screenDist, horiz };
}

export function warningsFor(model, stats, opts = {}) {
  const w = [];
  const st = model.stage;
  if (st.type === 'end' && stats.angle > 68) w.push({ level: 'warn', text: 'Side view. You see the stage from the side and will watch most of it on the side screens.' });
  else if (st.type === 'end' && stats.angle > 45) w.push({ level: 'info', text: 'Angled view of the stage. The main screen looks a little squashed from here.' });
  if (stats.dist > 120) w.push({ level: 'warn', text: 'Far from the stage. Performers look tiny, so the screens do the work.' });
  if (stats.elev > 18) w.push({ level: 'info', text: 'High up. A great overview of the light show, with steep stairs.' });
  if (opts.standing && opts.where === 'back') w.push({ level: 'info', text: 'Standing at the back. Taller people in front may cut off the stage; the screens stay visible.' });
  if (opts.standing && opts.where === 'front') w.push({ level: 'good', text: 'Right at the barrier side of the zone. Expect a packed, loud crowd.' });
  return w;
}
