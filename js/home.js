// The scrolling home page: smooth scroll (Locomotive Scroll v5, which runs on Lenis),
// GSAP + ScrollTrigger scenes, a Vanta fog hero and a scroll-driven 3D fly-in.
import * as THREE from 'three';
import { VENUES, SHOWS, CATS, LAYOUTS } from './data/venues.js';
import { priceOf, fmtINR, viewStats, zoneSpot } from './model.js';
import { SeatView } from './scene3d.js';
import { openMap, getModel, openDemo } from './app.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const hasGsap = !!window.gsap && !!window.ScrollTrigger;
if (hasGsap) gsap.registerPlugin(ScrollTrigger);
const cityOf = (v) => v.city.split(' (')[0];
const venueById = (id) => VENUES.find((v) => v.id === id);
const img = (id) => `assets/venues/${id}.jpg`;

// ---------- smooth scroll ----------
let loco = null, lenis = null, velocity = 0;
if (!reduce && window.LocomotiveScroll) {
  loco = new LocomotiveScroll({
    lenisOptions: { lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 },
    scrollCallback: (e) => { velocity = e.velocity || 0; if (hasGsap) ScrollTrigger.update(); },
  });
  lenis = loco.lenisInstance;
}
const scrollToEl = (sel) => { const el = $(sel); if (!el) return; if (loco) loco.scrollTo(el, { duration: 1.4 }); else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
for (const a of $$('a[data-scroll-to]')) a.addEventListener('click', (e) => { e.preventDefault(); scrollToEl(a.getAttribute('href')); });

// pause the page while the map or seat view is open
window.addEventListener('seatify:layer', (e) => {
  if (e.detail.open) { loco?.stop(); fly.view?.stop(); }
  else { loco?.start(); if (fly.visible) fly.view?.start(); if (hasGsap) ScrollTrigger.refresh(); }
});

// ---------- tiny helpers ----------
function splitChars(el) {
  const text = el.textContent; el.textContent = ''; el.setAttribute('data-split', '');
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); continue; }
    const ws = document.createElement('span'); ws.className = 'w';
    for (const ch of w) { const c = document.createElement('span'); c.className = 'ch'; c.textContent = ch; ws.appendChild(c); }
    el.appendChild(ws);
  }
  return $$('.ch', el);
}
function splitWords(el) {
  const text = el.textContent.trim(); el.textContent = '';
  return text.split(/\s+/).map((t, i) => { const s = document.createElement('span'); s.className = 'rw'; s.textContent = t; el.appendChild(s); el.appendChild(document.createTextNode(' ')); return s; });
}
function fitText(el, maxPx = 2000) {
  const parent = el.parentElement; el.style.fontSize = '100px';
  const w = el.scrollWidth; const target = parent.clientWidth;
  el.style.fontSize = Math.min(maxPx, (100 * target) / w) + 'px';
}

// ---------- clock ----------
const clock = $('#clock');
const tick = () => { clock.textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()); };
tick(); setInterval(tick, 15000);

// ---------- CTAs ----------
const firstShow = SHOWS[0];
$('#nav-cta').onclick = () => openMap({ show: firstShow, venue: venueById(firstShow.venue), layout: firstShow.layout });
$('#foot-cta').onclick = $('#nav-cta').onclick;
$('#hero-sticker').onclick = () => openDemo();

// ---------- hero ----------
const wm = $('.wm-split');
const wmChars = splitChars(wm);
const heroChars = $$('.hero-title .split').flatMap((el) => splitChars(el));
const fitWordmark = () => fitText(wm);
fitWordmark(); addEventListener('resize', fitWordmark);
document.fonts?.ready.then(fitWordmark);

let vanta = null;
function startVanta() {
  if (reduce || !window.VANTA?.FOG) return;
  try {
    vanta = VANTA.FOG({
      el: '#vanta', THREE, mouseControls: true, touchControls: true, gyroControls: false,
      minHeight: 200, minWidth: 200, highlightColor: 0xffb340, midtoneColor: 0xff2f7e, lowlightColor: 0x2a1466, baseColor: 0x0c0b0e,
      blurFactor: 0.62, speed: 1.1, zoom: 0.85,
    });
  } catch (err) { console.warn('Vanta fog could not start', err); }
}

// ---------- fly-in 3D section ----------
const fly = { view: null, visible: false, built: false };
function buildFly() {
  const v = venueById('nms');
  const model = getModel(v, 'catwalk');
  const sec = model.sections.filter((s) => s.tierIdx === 0 && !s.closed && s.availability !== 'soldout').sort((a, b) => Math.abs(a.phi - 38) - Math.abs(b.phi - 38))[0];
  const row = sec.getRows()[9]; const seat = row.seats[Math.floor(row.seats.length / 2)];
  const view = new SeatView($('#fly-canvas'), { interactive: false, background: '#0c0b0e' });
  view.showTitle = firstShow.artist;
  view.load(model);
  view.buildCrowd({ x: seat.x, y: seat.y, z: seat.z, seat }, { cap: finePointer ? 26000 : 11000 });
  view.flyTo({ x: seat.x, y: seat.y, z: seat.z }, { instant: true });
  view.scrub(0);
  fly.view = view; fly.built = true;
  fly.label = `SEC ${sec.id} · ROW ${row.label} · SEAT ${seat.n}`;
  const s = viewStats(model, { x: seat.x, y: seat.y, z: seat.z });
  fly.stats = s;
}

function setupFly() {
  const steps = $$('.step'); const bar = $('#fly-bar');
  const hudAlt = $('#hud-alt'), hudSeat = $('#hud-seat'), hudCount = $('#hud-count');
  let lastStep = -1;
  const setStep = (i) => {
    if (i === lastStep) return; lastStep = i;
    steps.forEach((el, k) => el.classList.toggle('on', k === i));
    hudCount.textContent = `0${i + 1} — 03`;
  };
  setStep(0);
  const update = (p) => {
    fly.view?.scrub(Math.min(1, p * 1.18));
    setStep(p < 0.34 ? 0 : p < 0.7 ? 1 : 2);
    bar.style.transform = `scaleX(${p})`;
    if (fly.view) hudAlt.textContent = `ALT ${Math.max(0, Math.round(fly.view.camera.position.y))} M`;
    hudSeat.textContent = p > 0.55 && fly.label ? fly.label + (p > 0.78 ? ` · ${Math.round(fly.stats.dist)} M TO STAGE · CLEAR VIEW` : '') : 'SEC — · ROW — · SEAT —';
  };
  if (!hasGsap) return;
  ScrollTrigger.create({
    trigger: '#how', start: 'top top', end: () => '+=' + innerHeight * (reduce ? 1 : 2.6), pin: '.fly-pin', scrub: reduce ? false : 0.6,
    onUpdate: (self) => update(self.progress),
  });
  ScrollTrigger.create({
    trigger: '#how', start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { fly.visible = self.isActive; if (self.isActive && !document.documentElement.classList.contains('layer-open')) fly.view?.start(); else fly.view?.stop(); },
  });
}

// ---------- marquee driven by scroll velocity ----------
function setupMarquee() {
  const cities = [...new Set(VENUES.map(cityOf))];
  const a = $('#mq-a'), b = $('#mq-b');
  const rowA = cities.map((c) => `<span>${esc(c)}</span><i>✦</i>`).join('');
  const rowB = VENUES.map((v) => `<span>${esc(v.name)}</span><i>/</i>`).join('');
  a.innerHTML = rowA + rowA + rowA; b.innerHTML = rowB + rowB;
  const tracks = [{ el: a, x: 0, dir: 1, base: 0.6 }, { el: b, x: 0, dir: -1, base: 0.45 }];
  const step = () => {
    const boost = Math.min(18, Math.abs(velocity) * 0.6);
    const sign = velocity < 0 ? -1 : 1;
    for (const t of tracks) {
      const half = t.el.scrollWidth / (t.el === a ? 3 : 2);
      t.x -= (t.base + boost) * t.dir * sign;
      if (t.x <= -half) t.x += half; if (t.x > 0) t.x -= half;
      t.el.style.transform = `translate3d(${t.x}px,0,0) skewX(${(-velocity * 0.15 * t.dir).toFixed(2)}deg)`;
    }
    velocity *= 0.92;
    if (!reduce) requestAnimationFrame(step);
  };
  if (!reduce) requestAnimationFrame(step);
}

// ---------- shows ----------
function setupShows() {
  const track = $('#shows-track');
  $('#shows-count').textContent = SHOWS.length;
  track.innerHTML = SHOWS.map((s, i) => {
    const v = venueById(s.venue);
    const from = Math.min(...Object.keys(CATS).map((c) => priceOf(v, c)));
    const tag = i === 0 ? 'Fast selling' : i % 4 === 1 ? 'Few left' : i % 3 === 0 ? 'New' : '';
    return `<button class="show-card tilt" type="button" data-cursor="Pick seats" data-i="${i}">
      <span class="sc-img"><img src="${img(s.venue)}" alt="Seatify render of ${esc(v.name)} from the stands" loading="lazy" width="1600" height="1000"></span>
      ${tag ? `<span class="sc-tag mono">${tag}</span>` : ''}
      <span class="sc-n mono">${String(i + 1).padStart(2, '0')}</span>
      <span class="sc-meta mono">${esc(s.date)} · ${esc(cityOf(v))}</span>
      <span class="sc-title">${esc(s.title)}</span>
      <span class="sc-artist">${esc(s.artist)} <em>at ${esc(v.name)}</em></span>
      <span class="sc-foot mono"><span>${esc(LAYOUTS[s.layout].label)}</span><span>from ${fmtINR(from)}</span></span>
    </button>`;
  }).join('');
  for (const el of $$('.show-card', track)) el.addEventListener('click', () => { const s = SHOWS[+el.dataset.i]; openMap({ show: s, venue: venueById(s.venue), layout: s.layout }); });
  if (!hasGsap || reduce) return;
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    const dist = () => track.scrollWidth - track.parentElement.clientWidth + 40;
    const tween = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.shows', pin: '.shows-pin', start: 'top top', end: () => '+=' + dist(), scrub: 0.8, invalidateOnRefresh: true } });
    for (const im of $$('.sc-img img', track)) gsap.fromTo(im, { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: im.closest('.show-card'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
  });
}

// ---------- tilt (cards) and magnetic buttons ----------
function setupPointerFx() {
  if (!finePointer || reduce) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.tilt');
    for (const c of $$('.tilt.hovering')) if (c !== card) { c.classList.remove('hovering'); c.style.transform = ''; c.querySelector('.sc-img')?.style.setProperty('transform', ''); }
    if (!card) return;
    const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add('hovering');
    card.style.transform = `perspective(900px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 11).toFixed(2)}deg) translateZ(0)`;
    card.querySelector('.sc-img')?.style.setProperty('transform', `translate3d(${(-x * 10).toFixed(1)}px, ${(-y * 10).toFixed(1)}px, 30px)`);
  });
  for (const el of $$('.magnetic')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * 0.28}px, ${y * 0.32}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
  // custom cursor
  const cur = $('#cursor'), label = $('#cursor-label');
  document.documentElement.classList.add('has-cursor');
  let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
    const t = e.target.closest?.('[data-cursor], button, a, .hit, .seat');
    cur.classList.toggle('big', !!t?.dataset?.cursor);
    cur.classList.toggle('link', !!t && !t.dataset?.cursor);
    label.textContent = t?.dataset?.cursor || '';
  });
  const loop = () => { cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2; cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; requestAnimationFrame(loop); };
  loop();
}

// ---------- manifesto: words light up with scroll ----------
function setupManifesto() {
  const el = $('#manifesto');
  const words = splitWords(el);
  for (const w of words) if (/^(204|AK|tower,|seat|spot\.)/.test(w.textContent) || ['Block', 'Row'].includes(w.textContent)) w.classList.add('hl');
  if (!hasGsap || reduce) return;
  gsap.fromTo(words, { opacity: 0.12, filter: 'blur(6px)', yPercent: 12 }, { opacity: 1, filter: 'blur(0px)', yPercent: 0, stagger: 0.04, ease: 'none', scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 40%', scrub: true } });
}

// ---------- compare table with numbers from the 3D model ----------
function setupCompare() {
  const v = venueById('nms'); const m = getModel(v, 'catwalk');
  const pit = m.zones.find((z) => z.cat === 'PIT');
  const pitP = zoneSpot(m, pit, 'front');
  const gold = m.sections.filter((s) => s.tierIdx === 0 && s.cat === 'GOLD' && !s.closed).sort((a, b) => Math.abs(a.phi - 70) - Math.abs(b.phi - 70))[0];
  const gs = gold.getRows()[10].seats[20];
  const top = m.sections.filter((s) => s.tierIdx === 2 && !s.closed).sort((a, b) => a.phi - b.phi)[0];
  const ts = top.getRows()[28].seats[10];
  const cols = [
    { name: 'Fan Pit', sub: 'Front of the pit', cat: 'PIT', s: viewStats(m, pitP) },
    { name: 'Gold', sub: `Sec ${gold.id}, Row K`, cat: gold.cat, s: viewStats(m, gs) },
    { name: 'Upper tier', sub: `Sec ${top.id}, Row ${top.getRows()[28].label}`, cat: top.cat, s: viewStats(m, ts) },
  ];
  const rows = [
    ['Price', (c) => priceOf(v, c.cat), (n) => fmtINR(n)],
    ['To the stage', (c) => Math.round(c.s.dist), (n) => n + ' m'],
    ['Viewing angle', (c) => Math.round(c.s.angle), (n) => n + '°'],
    ['Height', (c) => Math.round(c.s.height), (n) => (n < 1 ? 'Floor' : n + ' m')],
    ['Screen looks like', (c) => c.s.tvInches, (n) => n + '″ TV'],
  ];
  const t = $('#cmp-table');
  t.innerHTML = `<thead><tr><th scope="col"><span class="sr">Measure</span></th>${cols.map((c) => `<th scope="col"><i style="background:${CATS[c.cat].color}"></i>${esc(c.name)}<small>${esc(c.sub)}</small></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, get, fmt]) => `<tr><th scope="row">${label}</th>${cols.map((c) => { const n = get(c); return `<td data-n="${n}" data-f="${rows.findIndex((r) => r[0] === label)}">${fmt(n)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  if (!hasGsap || reduce) return;
  ScrollTrigger.create({
    trigger: t, start: 'top 80%', once: true,
    onEnter: () => {
      for (const td of $$('td', t)) {
        const n = +td.dataset.n, fmt = rows[+td.dataset.f][2]; const o = { v: 0 };
        gsap.to(o, { v: n, duration: 1.4, ease: 'power3.out', onUpdate: () => { td.textContent = fmt(Math.round(o.v)); } });
      }
    },
  });
}

// ---------- venue index ----------
let cityFilter = 'All';
function renderVenues() {
  const cities = ['All', ...new Set(VENUES.map(cityOf))];
  $('#city-filter').innerHTML = cities.map((c) => `<button type="button" class="${c === cityFilter ? 'on' : ''}" aria-pressed="${c === cityFilter}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  for (const b of $$('#city-filter button')) b.onclick = () => { cityFilter = b.dataset.c; renderVenues(); if (hasGsap) ScrollTrigger.refresh(); };
  const list = VENUES.filter((v) => cityFilter === 'All' || cityOf(v) === cityFilter);
  $('#v-index').innerHTML = list.map((v) => `
    <li><button type="button" class="v-row" data-id="${v.id}" data-cursor="Open map">
      <span class="v-n mono">${String(VENUES.indexOf(v) + 1).padStart(2, '0')}</span>
      <span class="v-thumb"><img src="${img(v.id)}" alt="" loading="lazy" width="1600" height="1000"></span>
      <span class="v-name">${esc(v.name)}</span>
      <span class="v-city mono">${esc(v.city)}</span>
      <span class="v-kind mono">${v.kind === 'ground' ? 'Open ground' : v.kind === 'arena' ? 'Indoor arena' : 'Stadium'}</span>
      <span class="v-cap mono">${esc(v.capacity.split(' · ')[0])}</span>
      <span class="v-arrow" aria-hidden="true">↗</span>
    </button></li>`).join('');
  for (const b of $$('.v-row')) b.onclick = () => openMap({ show: null, venue: venueById(b.dataset.id), layout: 'end' });
}
function setupVenuePreview() {
  if (!finePointer || reduce || !hasGsap) return;
  const pv = $('#v-preview'), pimg = $('#v-preview-img');
  const xTo = gsap.quickTo(pv, 'x', { duration: 0.5, ease: 'power3' }), yTo = gsap.quickTo(pv, 'y', { duration: 0.5, ease: 'power3' });
  let lastX = 0;
  $('#v-index').addEventListener('pointermove', (e) => {
    const row = e.target.closest('.v-row'); if (!row) return;
    const src = img(row.dataset.id); if (!pimg.src.endsWith(src)) pimg.src = src;
    xTo(e.clientX); yTo(e.clientY);
    gsap.to(pv, { rotate: Math.max(-8, Math.min(8, (e.clientX - lastX) * 0.4)), duration: 0.4 }); lastX = e.clientX;
    pv.classList.add('on');
  });
  $('#v-index').addEventListener('pointerleave', () => pv.classList.remove('on'));
}

// ---------- reveals ----------
function setupReveals() {
  if (!hasGsap || reduce) return;
  for (const el of $$('.sec-head .split')) {
    const chars = splitChars(el);
    gsap.from(chars, { yPercent: 115, rotate: 6, duration: 0.9, ease: 'expo.out', stagger: 0.018, scrollTrigger: { trigger: el, start: 'top 88%' } });
  }
  for (const el of $$('.reveal-up')) gsap.from(el, { y: 30, opacity: 0, duration: 1, ease: 'power3.out', delay: 0.9 });
  for (const el of $$('.v-row')) gsap.from(el, { y: 40, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 94%' } });
  // the hero wordmark drifts apart letter by letter as you scroll away
  gsap.to(wmChars, { yPercent: (i) => (i % 2 ? -40 : 40) * (1 + i * 0.12), ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-inner', { yPercent: -25, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  // footer wordmark stretches as it arrives (Archivo's width axis)
  gsap.fromTo('.foot-mark', { '--wd': 62, yPercent: 30 }, { '--wd': 125, yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  // nav hides on the way down, returns on the way up
  ScrollTrigger.create({ start: 120, end: 'max', onUpdate: (self) => $('#nav').classList.toggle('tucked', self.direction === 1 && self.scroll() > 200) });
}

// ---------- intro after the preloader ----------
function intro() {
  document.documentElement.classList.add('ready');
  startVanta();
  if (!hasGsap || reduce) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from(heroChars, { yPercent: 120, rotate: 8, duration: 1.2, stagger: 0.025 }, 0.05)
    .fromTo(wmChars, { '--wd': 62, yPercent: 105 }, { '--wd': 125, yPercent: 0, duration: 1.6, stagger: 0.05, onUpdate: fitWordmark }, 0.2)
    .from('.nav > *', { y: -20, opacity: 0, duration: 0.8, stagger: 0.06 }, 0.4)
    .from('#hero-sticker .sticker-core', { scale: 0, duration: 1.2 }, 0.7)
    .from('#hero-sticker svg', { opacity: 0, duration: 1.2 }, 0.8)
    .from('.scroll-cue', { opacity: 0, duration: 1 }, 1.1);
}

function preload(work) {
  const fill = $('#pl-fill'), count = $('#pl-count'), pre = $('#preloader');
  const C = 2 * Math.PI * 54; fill.style.strokeDasharray = C;
  const shown = { v: 0 };
  const draw = () => { fill.style.strokeDashoffset = C * (1 - shown.v / 100); count.textContent = String(Math.round(shown.v)).padStart(3, '0'); };
  draw();
  const done = () => {
    if (hasGsap && !reduce) gsap.to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'expo.inOut', onComplete: () => pre.remove() });
    else pre.remove();
    intro();
  };
  if (!hasGsap || reduce) { work(); done(); return; }
  gsap.to(shown, { v: 70, duration: 0.7, ease: 'power2.out', onUpdate: draw, onComplete: () => {
    setTimeout(() => { try { work(); } catch (err) { console.error(err); } gsap.to(shown, { v: 100, duration: 0.45, ease: 'power2.in', onUpdate: draw, onComplete: done }); }, 30);
  } });
}

// ---------- boot ----------
setupFly();
setupMarquee();
setupShows();
setupManifesto();
setupCompare();
renderVenues();
setupVenuePreview();
setupPointerFx();
setupReveals();
preload(() => { buildFly(); if (hasGsap) ScrollTrigger.refresh(); });
