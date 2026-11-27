import { VENUES, SHOWS, CATS, LAYOUTS } from './data/venues.js';
import { buildModel, priceOf, fmtINR, viewStats, warningsFor, zoneSpot } from './model.js';
import { SeatMap, miniMap } from './map.js';
import { SeatView } from './scene3d.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const state = { tab: 'shows', city: 'All', show: null, venue: null, layout: 'end', model: null, pick: null, filter: null, qty: 2 };
const models = new Map();
function getModel(venue, layout) {
  const k = venue.id + ':' + layout;
  if (!models.has(k)) models.set(k, buildModel(venue, layout));
  return models.get(k);
}

// ---------------- screens ----------------
// The home page stays underneath; the map and seat view open as full-screen layers.
let current = 'screen-home';
function show(id) {
  const was = current; current = id;
  for (const s of document.querySelectorAll('.layer')) {
    const on = s.id === id;
    if (on && s.hidden) { s.hidden = false; s.classList.remove('leaving'); s.classList.add('entering'); requestAnimationFrame(() => requestAnimationFrame(() => s.classList.remove('entering'))); }
    else if (!on && !s.hidden) { s.classList.add('leaving'); setTimeout(() => { if (current !== s.id) { s.hidden = true; s.classList.remove('leaving'); } }, 420); }
  }
  document.documentElement.classList.toggle('layer-open', id !== 'screen-home');
  if (was !== id) window.dispatchEvent(new CustomEvent('seatify:layer', { detail: { open: id !== 'screen-home', id } }));
  if (id === 'screen-view') view.start(); else view.stop();
}

// ---------------- map ----------------
const seatMap = new SeatMap($('#map'), { onPick: (item) => pickItem(item) });

function openMap({ show: s, venue, layout }) {
  state.show = s; state.venue = venue; state.layout = layout; state.pick = null; state.filter = null;
  $('#map-title').textContent = s ? s.title : venue.name;
  $('#map-sub').textContent = s ? `${venue.name}, ${venue.city} · ${s.date}` : `${venue.city} · ${venue.capacity}`;
  $('#layout-switch').hidden = !!s;
  renderLayoutSwitch();
  loadModel();
  openStadium();
}

// The flat 2D seat plan, for picking an exact seat from the grid.
function openPlan() { show('screen-map'); }

function renderLayoutSwitch() {
  const box = $('#layout-switch'); box.innerHTML = '';
  for (const [id, L] of Object.entries(LAYOUTS)) {
    const b = h('button', 'seg' + (state.layout === id ? ' on' : ''), esc(L.label)); b.type = 'button';
    b.setAttribute('aria-pressed', state.layout === id);
    b.onclick = () => { state.layout = id; state.pick = null; renderLayoutSwitch(); loadModel(); if (current === 'screen-view') openStadium(); };
    box.appendChild(b);
  }
}

function loadModel() {
  state.model = getModel(state.venue, state.layout);
  seatMap.render(state.model);
  renderPriceChips();
  closeSheet();
  renderSelection();
  $('#accuracy').innerHTML = `<strong>Approximate layout.</strong> ${esc(state.venue.notes)} Section numbers, rows and prices are illustrative.`;
}

function renderPriceChips() {
  const m = state.model; const cats = new Set([...m.sections.filter((s) => !s.closed).map((s) => s.cat), ...m.zones.map((z) => z.cat)]);
  const box = $('#price-chips'); box.innerHTML = '';
  const box3 = $('#m3-chips'); if (box3) box3.innerHTML = '';
  const order = Object.keys(CATS).filter((c) => cats.has(c)).sort((a, b) => priceOf(m.venue, b) - priceOf(m.venue, a));
  for (const c of order) {
    const on = state.filter === c;
    const b = h('button', 'pchip' + (on ? ' on' : ''), `<i style="background:${CATS[c].color}"></i>${esc(CATS[c].label)} <b>${fmtINR(priceOf(m.venue, c))}</b>`);
    b.type = 'button'; b.setAttribute('aria-pressed', on);
    b.onclick = () => { state.filter = on ? null : c; seatMap.applyFilter(state.filter); view.setFilter?.(state.filter); renderPriceChips(); };
    box.appendChild(b);
    if (box3) { const b3 = b.cloneNode(true); b3.onclick = b.onclick; box3.appendChild(b3); }
  }
}

function pickItem(item) {
  seatMap.select(item.id);
  seatMap.zoomTo(item);
  if (item.kind === 'zone') openZoneSheet(item); else openSectionSheet(item);
}

const sheet = $('#sheet');
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; seatMap.select(null); }

function openSectionSheet(sec) {
  const m = state.model; const rows = sec.getRows();
  const total = rows.reduce((n, r) => n + r.seats.length, 0), free = rows.reduce((n, r) => n + r.seats.filter((s) => !s.sold).length, 0);
  sheet.hidden = false;
  sheet.innerHTML = `
    <div class="sheet-head">
      <div><div class="eyebrow">${esc(sec.tier)} · ${esc(CATS[sec.cat].label)}${sec.sideStage ? ' · Side-stage, limited view' : ''}</div><h3>${esc(sec.label)}</h3>
      <div class="meta">${fmtINR(priceOf(m.venue, sec.cat))} each · ${free.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} seats free</div></div>
      <button class="icon-btn" type="button" id="sheet-close" aria-label="Close section">✕</button>
    </div>
    <div class="stage-hint">▲ Stage this way</div>
    <div class="seat-grid" id="seat-grid"></div>`;
  $('#sheet-close').onclick = () => { closeSheet(); seatMap.resetView(); state.pick = null; renderSelection(); };
  const grid = $('#seat-grid');
  for (const r of rows) {
    const line = h('div', 'seat-row');
    line.appendChild(h('span', 'row-label', r.label));
    const seats = h('div', 'seats');
    for (const s of r.seats) {
      const b = h('button', 'seat' + (s.sold ? ' sold' : ''));
      b.type = 'button'; b.disabled = s.sold; b.title = `Row ${r.label} · Seat ${s.n}`;
      b.setAttribute('aria-label', `Row ${r.label}, seat ${s.n}${s.sold ? ', taken' : ''}`);
      b.style.setProperty('--c', CATS[sec.cat].color);
      if (state.pick && state.pick.seat === s) b.classList.add('on');
      b.onclick = () => {
        grid.querySelector('.seat.on')?.classList.remove('on'); b.classList.add('on');
        state.pick = { type: 'seat', section: sec, row: r, seat: s, cat: sec.cat, point: { x: s.x, y: s.y, z: s.z } };
        seatMap.showMarker(s); renderSelection();
      };
      seats.appendChild(b);
    }
    line.appendChild(seats);
    line.appendChild(h('span', 'row-label', r.label));
    grid.appendChild(line);
  }
}

function openZoneSheet(z) {
  const m = state.model;
  sheet.hidden = false;
  sheet.innerHTML = `
    <div class="sheet-head">
      <div><div class="eyebrow">Standing · ${esc(CATS[z.cat].label)}</div><h3>${esc(z.label)}</h3>
      <div class="meta">${fmtINR(priceOf(m.venue, z.cat))} each · about ${z.cap.toLocaleString('en-IN')} people · ${z.availability === 'few' ? 'Filling fast' : 'Available'}</div></div>
      <button class="icon-btn" type="button" id="sheet-close" aria-label="Close zone">✕</button>
    </div>
    <p class="meta">No fixed spot. Preview the view from different parts of the zone.</p>
    <div class="spot-row" id="spots"></div>`;
  $('#sheet-close').onclick = () => { closeSheet(); seatMap.resetView(); state.pick = null; renderSelection(); };
  const spots = $('#spots');
  for (const where of ['front', 'middle', 'back']) {
    const b = h('button', 'spot', `<b>${where[0].toUpperCase() + where.slice(1)}</b><span>of the zone</span>`); b.type = 'button';
    b.onclick = () => selectSpot(z, where);
    spots.appendChild(b);
  }
  selectSpot(z, 'middle');
}

function selectSpot(z, where) {
  for (const b of document.querySelectorAll('.spot')) b.classList.toggle('on', b.textContent.toLowerCase().startsWith(where));
  const p = zoneSpot(state.model, z, where);
  state.pick = { type: 'zone', zone: z, where, cat: z.cat, point: p };
  seatMap.showMarker(p); renderSelection();
}

function pickLabel(p) {
  if (!p) return '';
  if (p.type === 'seat') return `Sec ${p.section.id} · Row ${p.row.label} · Seat ${p.seat.n}`;
  return `${p.zone.label} · ${p.where[0].toUpperCase() + p.where.slice(1)}`;
}

function renderSelection() {
  const bar = $('#select-bar'); const p = state.pick;
  if (!p) { bar.hidden = true; seatMap.showMarker(null); return; }
  bar.hidden = false;
  $('#select-label').textContent = pickLabel(p);
  $('#select-price').textContent = fmtINR(priceOf(state.model.venue, p.cat));
}

// ---------------- view ----------------
const view = new SeatView($('#view-canvas'));

const scr = $('#screen-view');
function setMode(mode) {
  scr.classList.toggle('is-map', mode === 'map');
  scr.classList.toggle('is-diving', mode === 'dive');
  scr.classList.toggle('is-seat', mode === 'seat');
}

// ---------------- 3D stadium map ----------------
function openStadium() {
  const m = state.model;
  view.showTitle = state.show ? state.show.artist : state.venue.name;
  $('#m3-title').textContent = state.show ? state.show.title : state.venue.name;
  $('#m3-sub').textContent = state.show ? `${state.venue.name}, ${state.venue.city} · ${state.show.date}` : `${state.venue.city} · ${state.venue.capacity}`;
  const lay = $('#m3-layouts'); lay.innerHTML = ''; lay.hidden = !!state.show;
  if (!state.show) for (const [id, L] of Object.entries(LAYOUTS)) {
    const b = h('button', 'seg' + (state.layout === id ? ' on' : ''), esc(L.label)); b.type = 'button';
    b.onclick = () => { state.layout = id; state.pick = null; renderLayoutSwitch(); loadModel(); openStadium(); };
    lay.appendChild(b);
  }
  setMode('map');
  $('#m3-tip').hidden = true;
  const fresh = view.model !== m;
  if (current !== 'screen-view') show('screen-view');
  if (fresh) $('#view-loading').hidden = false;
  requestAnimationFrame(() => setTimeout(() => {
    view.load(m);
    view.setFilter(state.filter);
    view.markSeat(state.pick && state.pick.seat);
    view.enterOverview({ instant: fresh || !view.mode });
    $('#view-loading').hidden = true;
  }, 30));
}

function backToStadium() { $('#checkout').hidden = true; openStadium(); }

// the best free seat in a block: the middle row, as close to the centre line as possible
function bestSeat(sec) {
  const rows = sec.getRows(); const mid = Math.floor(rows.length * 0.45);
  const order = rows.map((r, i) => [r, Math.abs(i - mid)]).sort((a, b) => a[1] - b[1]);
  for (const [r] of order) {
    const c = (r.seats.length - 1) / 2;
    const seat = [...r.seats].filter((x) => !x.sold).sort((a, b) => Math.abs(a.n - 1 - c) - Math.abs(b.n - 1 - c))[0];
    if (seat) return { row: r, seat };
  }
  return null;
}

function pick3d(item) {
  $('#m3-tip').hidden = true;
  if (item.kind === 'zone') {
    const p = zoneSpot(state.model, item, 'middle');
    state.pick = { type: 'zone', zone: item, where: 'middle', cat: item.cat, point: p };
  } else {
    const b = bestSeat(item);
    if (!b) { showTip(item, null, null, 'Sold out. Try another block.'); return; }
    state.pick = { type: 'seat', section: item, row: b.row, seat: b.seat, cat: item.cat, point: { x: b.seat.x, y: b.seat.y, z: b.seat.z } };
  }
  seatMap.select(item.id); renderSelection();
  openView();
}

function showTip(item, x, y, note) {
  const tip = $('#m3-tip');
  if (!item) { tip.hidden = true; return; }
  const m = state.model;
  let free = '';
  if (item.kind === 'zone') free = item.availability === 'few' ? 'Filling fast' : 'Standing';
  else { let n = 0; for (const r of item.getRows()) for (const st of r.seats) if (!st.sold) n++; free = n ? `${n.toLocaleString('en-IN')} seats free` : 'Sold out'; }
  tip.innerHTML = `<b>${esc(item.kind === 'zone' ? item.label : 'Sec ' + item.id)}</b><span>${esc(item.kind === 'zone' ? 'Standing' : CATS[item.cat].label + ' · ' + item.tier)} · ${fmtINR(priceOf(m.venue, item.cat))}</span><em>${esc(note || free)}</em>`;
  tip.hidden = false;
  if (x != null) { tip.style.left = Math.min(innerWidth - 200, x + 18) + 'px'; tip.style.top = Math.max(70, y - 20) + 'px'; }
}

// step to the next or previous free seat in the same row (or the next row)
function stepSeat(dir) {
  const p = state.pick; if (!p || p.type !== 'seat') return;
  const rows = p.section.getRows(); let ri = rows.indexOf(p.row), si = p.row.seats.indexOf(p.seat);
  for (let guard = 0; guard < 2000; guard++) {
    si += dir;
    if (si < 0 || si >= rows[ri].seats.length) { ri += dir; if (ri < 0 || ri >= rows.length) return; si = dir > 0 ? 0 : rows[ri].seats.length - 1; }
    const s2 = rows[ri].seats[si];
    if (!s2.sold) { Object.assign(p, { row: rows[ri], seat: s2, point: { x: s2.x, y: s2.y, z: s2.z } }); break; }
  }
  renderSelection();
  view.buildCrowd({ x: p.point.x, y: p.point.y, z: p.point.z, seat: p.seat });
  view.hopTo(p.point, p.seat);
  $('#view-pill').textContent = `View from ${pickLabel(p)}`;
  setTimeout(renderViewSheet, 750);
}

function openView() {
  const p = state.pick; if (!p) return;
  const m = state.model;
  view.showTitle = state.show ? state.show.artist : state.venue.name;
  // On phones and short windows start with the compact sheet so the 3D view stays visible.
  const compact = innerWidth < 900 || innerHeight < 820;
  $('#view-sheet').classList.toggle('collapsed', compact);
  $('#sheet-toggle').setAttribute('aria-expanded', String(!compact));
  const fromMap = current === 'screen-view' && view.mode === 'overview' && view.model === m;
  if (current !== 'screen-view') show('screen-view');
  if (!fromMap) $('#view-loading').hidden = false;
  setMode('dive');
  requestAnimationFrame(() => setTimeout(() => {
    view.load(m);
    if (!fromMap) { view.setFilter(state.filter); view.enterOverview({ instant: true }); view._frame?.(); }
    view.buildCrowd({ x: p.point.x, y: p.point.y, z: p.point.z, seat: p.seat });
    view.onArrive = () => { setMode('seat'); renderViewSheet(); };
    view.diveTo(p.point, p.seat || null);
    $('#view-loading').hidden = true;
  }, 30));
  $('#view-pill').textContent = `View from ${pickLabel(p)}`;
  $('#seat-prev').hidden = $('#seat-next').hidden = p.type !== 'seat';
  const tabs = $('#spot-tabs'); tabs.hidden = p.type !== 'zone'; tabs.innerHTML = '';
  if (p.type === 'zone') for (const where of ['front', 'middle', 'back']) {
    const b = h('button', 'seg' + (p.where === where ? ' on' : ''), where[0].toUpperCase() + where.slice(1)); b.type = 'button';
    b.setAttribute('aria-pressed', p.where === where);
    b.onclick = () => {
      selectSpot(p.zone, where); const q = state.pick;
      for (const x of tabs.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }
      view.buildCrowd({ x: q.point.x, y: q.point.y, z: q.point.z }); view.hopTo(q.point, null);
      $('#view-pill').textContent = `View from ${pickLabel(q)}`; setTimeout(renderViewSheet, 750);
    };
    tabs.appendChild(b);
  }
}

function renderViewSheet() {
  const p = state.pick, m = state.model;
  const s = viewStats(m, p.point);
  const block = view.analyse();
  const warns = warningsFor(m, s, { standing: p.type === 'zone', where: p.where });
  if (block.stageBlocked > 0.25 || block.screenBlocked > 0.25) {
    const what = block.stageBlocked >= block.screenBlocked ? 'the stage' : 'the main screen';
    const pct = Math.round(Math.max(block.stageBlocked, block.screenBlocked) * 100);
    const cause = block.cause === 'Tier above' ? 'the tier above you' : (block.cause || 'a structure').toLowerCase();
    warns.unshift({ level: 'bad', text: `Restricted view. ${cause[0].toUpperCase() + cause.slice(1)} blocks about ${pct}% of ${what} from here.` });
  } else if (block.stageBlocked > 0.05 || block.screenBlocked > 0.05) {
    const cause = block.cause === 'Tier above' ? 'The tier above' : block.cause || 'A structure';
    warns.unshift({ level: 'warn', text: `Slightly restricted. ${cause} cuts into a small part of the view.` });
  } else warns.unshift({ level: 'good', text: 'Clear line of sight to the stage and main screen.' });

  const side = s.offCentre < -1 ? 'left' : s.offCentre > 1 ? 'right' : '';
  $('#view-stats').innerHTML = `
    <div class="stat"><span>To stage</span><b>${Math.round(s.dist)} m</b></div>
    <div class="stat"><span>Viewing angle</span><b>${m.stage.type === 'center' ? 'Facing' : Math.round(s.angle) + '°'}</b></div>
    <div class="stat"><span>Off centre</span><b>${m.stage.type === 'center' ? '360°' : side ? Math.round(Math.abs(s.offCentre)) + ' m ' + side : 'Centre'}</b></div>
    <div class="stat"><span>Height</span><b>${s.height < 0.5 ? 'Floor' : Math.round(s.height) + ' m up'}</b></div>`;
  $('#view-tv').innerHTML = `The main screen looks like a <b>${s.tvInches}″ TV</b> seen from your sofa (2.5 m away).`;
  $('#view-warn').innerHTML = warns.map((w) => `<li class="w-${w.level}">${esc(w.text)}</li>`).join('');
  $('#view-buy').textContent = `Buy · ${fmtINR(priceOf(m.venue, p.cat))}`;
  $('#view-crowd').textContent = `${view.crowdCount.toLocaleString('en-IN')} fans drawn around you`;
  miniMap($('#view-minimap'), m, p.point);
}

// ---------------- checkout ----------------
function openCheckout() {
  const p = state.pick, m = state.model; const price = priceOf(m.venue, p.cat);
  const dlg = $('#checkout');
  const max = p.type === 'zone' ? 10 : 6;
  state.qty = Math.min(state.qty, max);
  const render = () => {
    const sub = price * state.qty, fee = Math.round(sub * 0.1);
    dlg.innerHTML = `
      <div class="dlg-card" role="dialog" aria-modal="true" aria-labelledby="co-title">
        <div class="sheet-head"><div><div class="eyebrow">${esc(state.show ? state.show.date : 'Demo booking')}</div><h3 id="co-title">${esc(state.show ? state.show.title : m.venue.name)}</h3><div class="meta">${esc(m.venue.name)} · ${esc(pickLabel(p))}</div></div>
        <button class="icon-btn" type="button" id="co-close" aria-label="Close checkout">✕</button></div>
        <div class="qty"><span>Tickets</span><div class="stepper"><button type="button" id="q-minus" aria-label="One fewer">−</button><output id="q-val">${state.qty}</output><button type="button" id="q-plus" aria-label="One more">+</button></div></div>
        ${p.type === 'seat' ? `<p class="meta">Seats ${p.seat.n}${state.qty > 1 ? '–' + (p.seat.n + state.qty - 1) : ''} in Row ${esc(p.row.label)}, next to each other where free.</p>` : `<p class="meta">Standing tickets. Entry wristbands are scanned at the zone gate.</p>`}
        <dl class="bill"><dt>${state.qty} × ${fmtINR(price)}</dt><dd>${fmtINR(sub)}</dd><dt>Booking fee</dt><dd>${fmtINR(fee)}</dd><dt class="total">Total</dt><dd class="total">${fmtINR(sub + fee)}</dd></dl>
        <button class="primary wide" type="button" id="co-pay">Pay ${fmtINR(sub + fee)}</button>
        <p class="fine">Demo only. No payment is taken.</p>
      </div>`;
    $('#co-close').onclick = () => (dlg.hidden = true);
    $('#q-minus').onclick = () => { state.qty = Math.max(1, state.qty - 1); render(); };
    $('#q-plus').onclick = () => { state.qty = Math.min(max, state.qty + 1); render(); };
    $('#co-pay').onclick = () => renderTicket(sub + fee);
  };
  render();
  dlg.hidden = false;
}

function renderTicket(total) {
  const p = state.pick, m = state.model, dlg = $('#checkout');
  const code = 'SSC-' + Math.abs((p.point.x * 977 + p.point.z * 131) | 0).toString(36).toUpperCase().padStart(5, '0');
  dlg.innerHTML = `
    <div class="dlg-card ticket" role="dialog" aria-modal="true" aria-labelledby="tk-title">
      <div class="eyebrow">Booking confirmed · ${esc(code)}</div>
      <h3 id="tk-title">${esc(state.show ? state.show.title : m.venue.name)}</h3>
      <div class="meta">${esc(m.venue.name)}, ${esc(m.venue.city)}${state.show ? ' · ' + esc(state.show.date) + ' · ' + esc(state.show.time) : ''}</div>
      <div class="ticket-seat">${esc(pickLabel(p))}</div>
      <canvas id="tk-code" width="168" height="168" aria-label="Ticket code"></canvas>
      <div class="meta">${state.qty} ticket${state.qty > 1 ? 's' : ''} · ${fmtINR(total)} (demo)</div>
      <button class="primary wide" type="button" id="tk-done">Done</button>
    </div>`;
  const cv = $('#tk-code'), ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 168, 168); ctx.fillStyle = '#0b0b12';
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const on = corner ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5)) && !(x === 20 || y === 20) || (x > 13 && y < 7 && (x === 14 || x === 20)) : ((x * 7 + y * 13 + code.charCodeAt((x + y) % code.length)) % 3) === 0;
    if (on) ctx.fillRect(x * 8, y * 8, 8, 8);
  }
  $('#tk-done').onclick = () => { dlg.hidden = true; show('screen-home'); };
}

// ---------------- wiring ----------------
$('#map-back').onclick = () => openStadium();
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !$('#checkout').hidden) return;
  if (current === 'screen-view') { if (scr.classList.contains('is-map')) show('screen-home'); else if (scr.classList.contains('is-diving')) view.skipDive(); else backToStadium(); }
  else if (current === 'screen-map') openStadium();
});
$('#map-reset').onclick = () => seatMap.resetView();
$('#select-view').onclick = openView;
$('#view-back').onclick = () => (scr.classList.contains('is-map') ? show('screen-home') : backToStadium());
$('#view-change').onclick = backToStadium;
$('#m3-plan').onclick = openPlan;
$('#seat-prev').onclick = () => stepSeat(-1);
$('#seat-next').onclick = () => stepSeat(1);
view.onHover = (it, x, y) => showTip(it, x, y);
$('#view-canvas').addEventListener('pointerleave', () => { if (view.mode === 'overview') { view.setHover(null); showTip(null); } });
view.onPick = (it) => pick3d(it);
$('#view-buy').onclick = openCheckout;
$('#select-buy').onclick = openCheckout;
$('#zoom-in').onclick = () => view.zoom(0.75);
$('#zoom-out').onclick = () => view.zoom(1.33);
$('#recentre').onclick = () => view.recentre();
$('#empty-venue').onchange = (e) => view.setEmpty(e.target.checked);
$('#sheet-toggle').onclick = () => { const vs = $('#view-sheet'); const c = vs.classList.toggle('collapsed'); $('#sheet-toggle').setAttribute('aria-expanded', !c); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#checkout').hidden) $('#checkout').hidden = true; });


// The demo jumps straight into a good seat for the first show.
function openDemo() {
  const s = SHOWS[0]; openMap({ show: s, venue: VENUES.find((v) => v.id === s.venue), layout: s.layout });
  const sec = state.model.sections.filter((x) => x.tierIdx === 0 && !x.closed && x.availability === 'open').sort((a, b) => Math.abs(a.phi - 62) - Math.abs(b.phi - 62))[0];
  const r = sec.getRows()[10]; const seat = r.seats.find((x) => !x.sold) || r.seats[0];
  state.pick = { type: 'seat', section: sec, row: r, seat, cat: sec.cat, point: { x: seat.x, y: seat.y, z: seat.z } };
  renderSelection(); openView();
}
if (location.hash === '#demo') openDemo();
window.__seatify = { state, view, openView, pickItem, getModel, VENUES, openStadium, pick3d, stepSeat };
export { openMap, getModel, show, openDemo };
