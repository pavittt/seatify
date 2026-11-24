// The scrolling home page (v5, "Show night"). Smooth scroll is Locomotive Scroll v5 (which runs on
// Lenis); every section is a GSAP ScrollTrigger scene:
//   stage   – the word SEATIFY is a window onto a live 3D stadium, with a follow spot on the cursor.
//             Scrolling zooms through the letter I into the stadium, then flies down into a seat.
//   tapes   – two crossing stadium LED ribbon boards whose speed and skew follow scroll velocity
//   swarm   – the line-up poster title splits apart while show posters tumble up in 3D
//   shows   – a sideways row of tickets you can drag with inertia
//   cube    – a cube of seat views grows and turns under a stage beam
//   lines   – manifesto lines light up one by one on flame
//   compare – an LED scoreboard with a spotlight that follows the pointer
//   venues  – a split-flap departure board that flips on hover
//   footer  – flame haze and a wordmark that fills from the bottom
import { VENUES, SHOWS, CATS, LAYOUTS } from './data/venues.js';
import { priceOf, fmtINR, viewStats, zoneSpot } from './model.js';
import { REAL_PHOTOS } from './data/photos.js';
import { openMap, getModel, openDemo } from './app.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const hasGsap = !!window.gsap && !!window.ScrollTrigger;
const motion = hasGsap && !reduce;
if (hasGsap) { gsap.registerPlugin(ScrollTrigger); gsap.ticker.lagSmoothing(0); }
const cityOf = (v) => v.city.split(' (')[0];
const venueById = (id) => VENUES.find((v) => v.id === id);
const img = (id) => `assets/venues/${id}.jpg`;
const rnd = (a, b) => a + Math.random() * (b - a);
// a real photo of the venue where we have one, otherwise our own render
const realOf = (id) => (REAL_PHOTOS[id] || [])[0];
// best real photo per venue: night (show-like) shots first; null where we have none
const bestOf = (id) => { const l = REAL_PHOTOS[id] || []; return l.find((x) => x.when === 'night') || l[0] || null; };
const thumbOf = (id) => bestOf(id)?.thumb || null;
const bigOf = (id) => bestOf(id)?.src || null;
const used = new Map();   // every photo shown on the page, for the credits line
const photo = (ph) => { if (ph) used.set(ph.src, ph); return ph ? ph.src : ''; };
const venueImg = (id, cls = '', alt = '') => { const ph = bestOf(id); return ph ? `<img src="${esc(photo(ph))}" alt="${esc(alt)}" loading="lazy" draggable="false">` : `<span class="no-photo ${cls}"><b>${esc((venueById(id)?.name || '').split(' ')[0])}</b><em class="mono">Photo soon</em></span>`; };

// ---------- smooth scroll ----------
let loco = null, lenis = null, velocity = 0;
if (!reduce && window.LocomotiveScroll) {
  loco = new LocomotiveScroll({
    lenisOptions: { lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 },
    scrollCallback: (e) => { velocity = e.velocity || 0; if (hasGsap) ScrollTrigger.update(); },
  });
  lenis = loco.lenisInstance;
}
const scrollY_ = () => (lenis ? lenis.scroll : window.scrollY);
const scrollToY = (y, opts = {}) => { if (lenis) lenis.scrollTo(y, opts); else window.scrollTo(0, y); };
const scrollToEl = (sel) => { const el = $(sel); if (!el) return; if (loco) loco.scrollTo(el, { duration: 1.4 }); else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
for (const a of $$('a[data-scroll-to]')) a.addEventListener('click', (e) => { e.preventDefault(); scrollToEl(a.getAttribute('href')); });

window.addEventListener('seatify:layer', (e) => {
  if (e.detail.open) loco?.stop();
  else { loco?.start(); if (hasGsap) ScrollTrigger.refresh(); }
});

// ---------- helpers ----------
function splitChars(el) {
  const text = el.textContent; el.textContent = ''; el.setAttribute('data-split', '');
  for (const w of text.split(/(\s+)/)) {
    if (!w) continue;
    if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); continue; }
    const ws = document.createElement('span'); ws.className = 'w';
    for (const ch of w) { const c = document.createElement('span'); c.className = 'ch'; c.textContent = ch; ws.appendChild(c); }
    el.appendChild(ws);
  }
  return $$('.ch', el);
}
// buttons: the label rolls up and a fill sweeps in from below
for (const t of $$('.btn-t')) { const s = document.createElement('span'); s.textContent = t.textContent; t.textContent = ''; t.appendChild(s); }

// ---------- clock ----------
const clock = $('#clock');
const tick = () => { clock.textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()); };
tick(); setInterval(tick, 15000);

// ---------- CTAs ----------
const firstShow = SHOWS[0];
const openFirst = () => openMap({ show: firstShow, venue: venueById(firstShow.venue), layout: firstShow.layout });
$('#nav-cta').onclick = openFirst;
$('#hero-cta').onclick = openFirst;
$('#foot-cta').onclick = openFirst;
$('#hero-demo').onclick = () => openDemo();
$('#hero-sticker').onclick = () => openDemo();
$('#next-ticket').onclick = openFirst;
const ntPerf = () => { const t = $('#next-ticket'); t.style.setProperty('--perf', t.querySelector('.nt-top').offsetHeight + 'px'); };
ntPerf(); document.fonts?.ready.then(ntPerf); addEventListener('resize', ntPerf);

// ---------- STAGE: real photos from the stands, one per step ----------
const heroChars = $$('.hero-title .split').flatMap((el) => splitChars(el));
const fly = { visible: true };
const STEP_SHOTS = [
  ['dyp', 'dy_patil_ipl'],
  ['jln', 'jln_lower_night'],
  ['dyp', 'dyp_dualipa_2019'],
].map(([id, key]) => ({ id, ph: (REAL_PHOTOS[id] || []).find((x) => x.src.includes(key)) || bestOf(id) }));
function buildSteps() {
  $('#step-photos').innerHTML = STEP_SHOTS.map((s) => `<figure class="sp"><img src="${esc(photo(s.ph))}" alt="" loading="lazy"></figure>`).join('');
}
// ---------- MASK: a follow spot over a real concert photo ----------
// A 2D canvas laid over the hero photo: a dark veil with a soft hole that follows the cursor (it drifts
// on its own on touch screens). Scrolling pushes into the photo, the house goes dark, then the step photos fade up.
const mask = { cv: null, ctx: null, zq: 0, spot: { x: 0, y: 0, tx: 0, ty: 0, a: 0 }, L: null, done: false, raf: 0, user: false };
function layoutMask() {
  const cv = mask.cv; if (!cv) return;
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  mask.L = { W, H, dpr, r: Math.max(W, H) * (W > H ? 0.26 : 0.42) };
  if (!mask.spot.x) { mask.spot.x = mask.spot.tx = W * 0.5; mask.spot.y = mask.spot.ty = H * 0.3; }
  drawMask();
}
const photoEl = () => (mask.ph ||= $('#hero-photo'));
function drawMask() {
  const L = mask.L, ctx = mask.ctx; if (!L || !ctx) return;
  const z = mask.zq, finished = z >= 1;
  const ph = photoEl();
  if (ph) { ph.style.transform = `scale(${(1.04 + z * 0.5).toFixed(4)})`; ph.style.opacity = (1 - clamp01((z - 0.2) / 0.42)).toFixed(3); }
  if (finished !== mask.done) { mask.done = finished; mask.cv.style.visibility = finished ? 'hidden' : 'visible'; if (ph) ph.style.visibility = finished ? 'hidden' : 'visible'; }
  if (finished) return;
  const { W, H, dpr } = L;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  // the house goes to black between the hero photo and the step photos, then they fade up
  const veil = z < 0.62 ? 0.74 + 0.26 * (z / 0.62) : 1 - (z - 0.62) / 0.38;
  ctx.fillStyle = `rgba(5,5,5,${veil.toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  const sp = mask.spot, sa = sp.a * (1 - clamp01(z * 2.6));
  if (sa > 0.01) {
    ctx.globalCompositeOperation = 'destination-out';
    const gr = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, L.r);
    gr.addColorStop(0, `rgba(0,0,0,${sa})`); gr.addColorStop(0.45, `rgba(0,0,0,${0.75 * sa})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // a warm rim on the beam, like a gel on a follow spot
    ctx.globalCompositeOperation = 'source-over';
    const rim = ctx.createRadialGradient(sp.x, sp.y, L.r * 0.55, sp.x, sp.y, L.r);
    rim.addColorStop(0, 'rgba(255,75,31,0)'); rim.addColorStop(0.7, `rgba(255,75,31,${0.12 * sa})`); rim.addColorStop(1, 'rgba(255,75,31,0)');
    ctx.fillStyle = rim; ctx.fillRect(0, 0, W, H);
  }
}
function setupMask(pin) {
  mask.cv = $('#mask-canvas'); mask.ctx = mask.cv.getContext('2d');
  const go = () => layoutMask();
  go();
  addEventListener('resize', () => layoutMask());
  pin.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; mask.user = true; mask.spot.tx = e.clientX; mask.spot.ty = e.clientY; });
  // the spot drifts on its own until a mouse takes it; it eases toward its target every frame
  const t0 = performance.now();
  const loop = (now) => {
    mask.raf = requestAnimationFrame(loop);
    if (!mask.L || mask.done || !fly.visible || document.documentElement.classList.contains('layer-open')) return;
    const L = mask.L, sp = mask.spot, t = (now - t0) / 1000;
    if (!mask.user) { sp.tx = L.W * (0.5 + 0.28 * Math.sin(t * 0.45)); sp.ty = L.H * (0.34 + 0.14 * Math.sin(t * 0.83 + 1)); }
    sp.x += (sp.tx - sp.x) * 0.09; sp.y += (sp.ty - sp.y) * 0.09;
    drawMask();
  };
  mask.raf = requestAnimationFrame(loop);
}

function setupStage() {
  const pin = $('.stage-pin');
  buildSteps();
  const steps = $$('.step'), shots = $$('#step-photos .sp'); const bar = $('#fly-bar');
  const hudVenue = $('#hud-venue'), hudSeat = $('#hud-seat'), hudCount = $('#hud-count');
  let last = -2;
  const setStep = (i) => {
    if (i === last) return; last = i;
    steps.forEach((el, k) => el.classList.toggle('on', k === i));
    if (i >= 0) {
      const s = STEP_SHOTS[i];
      hudCount.textContent = `0${i + 1} / 03`;
      hudVenue.textContent = venueById(s.id).name;
      hudSeat.textContent = s.ph ? `${s.ph.label} · ${s.ph.credit}, ${s.ph.licence}` : '';
      if (motion) gsap.fromTo(steps[i].children, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.07, ease: 'expo.out', overwrite: true });
    }
  };
  const update = (p) => {
    mask.zq = clamp01(p / 0.2); drawMask();
    const q = clamp01((p - 0.19) / 0.78);
    // each photo holds for a third of the run, cross-fading into the next while it slowly pushes in
    shots.forEach((el, k) => {
      const c = (k + 0.5) / 3, d = Math.abs(q - c) * 3;
      el.style.opacity = clamp01(1.6 - d * 1.4).toFixed(3);
      el.style.transform = `scale(${(1.06 + (q - c) * 0.35).toFixed(4)})`;
    });
    const sv = clamp01((p - 0.2) / 0.06);
    pin.style.setProperty('--steps', sv.toFixed(3));
    setStep(sv < 0.5 ? -1 : q < 0.34 ? 0 : q < 0.67 ? 1 : 2);
    bar.style.transform = `scaleX(${q})`;
  };
  setupMask(pin);
  if (!motion) { steps.forEach((s) => s.classList.add('on')); pin.style.setProperty('--steps', 1); shots.forEach((el) => (el.style.opacity = 1)); return; }
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#how', start: 'top top', end: () => '+=' + innerHeight * 3.4, pin, scrub: 0.6, invalidateOnRefresh: true, onUpdate: (self) => update(self.progress) },
  });
  tl.to('.hero-top', { y: -40, opacity: 0, duration: 0.06 }, 0)
    .to('.hero-title .ht-line:nth-child(1)', { xPercent: -30, opacity: 0, duration: 0.12 }, 0.01)
    .to('.hero-title .ht-line:nth-child(2)', { xPercent: 30, opacity: 0, duration: 0.12 }, 0.01)
    .to('#next-ticket', { y: -innerHeight * 0.5, rotate: 14, opacity: 0, duration: 0.12 }, 0)
    .to('.hero-credit', { opacity: 0, duration: 0.04 }, 0)
    .to('.hero-row', { y: 60, opacity: 0, duration: 0.07 }, 0)
    .to('.scroll-cue', { opacity: 0, duration: 0.04 }, 0)
    .to({}, { duration: 0.93 });
  update(0);
  ScrollTrigger.create({ trigger: '#how', start: 'top bottom', end: 'bottom top', onToggle: (self) => { fly.visible = self.isActive; } });
}

// ---------- marquees: speed and skew follow scroll velocity ----------
const tracks = [];
function addTrack(el, html, copies, dir, base, skew = true) { el.innerHTML = html.repeat(copies); tracks.push({ el, copies, dir, base, x: 0, skew }); }
function setupMarquees() {
  const cities = [...new Set(VENUES.map(cityOf))];
  addTrack($('#mq-a'), cities.map((c, i) => (i % 2 ? `<em>${esc(c)}</em>` : `<span>${esc(c)}</span>`) + '<i>✦</i>').join(''), 3, 1, 0.7);
  addTrack($('#mq-b'), VENUES.map((v) => `<span>${esc(v.name)}</span><i>●</i>`).join(''), 2, -1, 0.55);
  addTrack($('#mq-c'), VENUES.slice(0, 8).map((v) => `<span>${esc(cityOf(v))}</span>`).join(''), 2, 1, 0.35, false);
  if (reduce) return;
  const step = () => {
    const boost = Math.min(22, Math.abs(velocity) * 0.7);
    const sign = velocity < 0 ? -1 : 1;
    for (const t of tracks) {
      const half = t.el.scrollWidth / t.copies;
      t.x -= (t.base + boost) * t.dir * sign;
      if (t.x <= -half) t.x += half; if (t.x > 0) t.x -= half;
      t.el.style.transform = `translate3d(${t.x.toFixed(1)}px,0,0)` + (t.skew ? ` skewX(${(-velocity * 0.2 * t.dir).toFixed(2)}deg)` : '');
    }
    velocity *= 0.92;
    stickerSpin(boost);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- fixed sticker spins faster while you scroll ----------
const stickerSvg = $('#hero-sticker svg'); let stickerA = 0;
function stickerSpin(boost) { stickerA = (stickerA + 0.35 + boost * 0.6) % 360; stickerSvg.style.transform = `rotate(${stickerA.toFixed(1)}deg)`; }

// ---------- SWARM: split title, show cards tumbling up in 3D ----------
function setupSwarm() {
  const sw = $('#swarm');
  const lefts = [4, 68, 30, 82, 12, 52, 74, 22, 60, 38];
  sw.innerHTML = SHOWS.map((s, i) => `<div class="sw-card" style="left:${lefts[i % lefts.length]}%">${venueImg(s.venue)}<span>${esc(s.title)}</span></div>`).join('');
  if (!motion) return;
  const cards = $$('.sw-card', sw);
  const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '.swarm-sec', start: 'top top', end: () => '+=' + innerHeight * 2.2, pin: '.swarm-pin', scrub: 0.8, invalidateOnRefresh: true } });
  tl.to('.st-a', { xPercent: -95, duration: 1 }, 0)
    .to('.st-b', { xPercent: 95, duration: 1 }, 0)
    .fromTo('.st-mid', { scale: 1 }, { scale: 2.4, opacity: 0.0, duration: 1 }, 0);
  cards.forEach((c, i) => {
    tl.fromTo(c,
      { y: () => innerHeight * 1.1, z: rnd(-500, 200), rotationX: rnd(-70, 70), rotationY: rnd(-80, 80), rotationZ: rnd(-30, 30) },
      { y: () => -innerHeight * 0.55, z: rnd(-200, 350), rotationX: rnd(-40, 40), rotationY: rnd(-60, 60), rotationZ: rnd(-20, 20), duration: 0.55 }, 0.04 * i);
  });
}

// ---------- SHOWS: horizontal gallery, scroll or drag ----------
function setupShows() {
  const track = $('#shows-track');
  $('#shows-count').textContent = SHOWS.length;
  track.innerHTML = SHOWS.map((s, i) => {
    const v = venueById(s.venue);
    const from = Math.min(...Object.keys(CATS).map((c) => priceOf(v, c)));
    const tag = i === 0 ? 'Fast selling' : i % 4 === 1 ? 'Few left' : i % 3 === 0 ? 'New' : '';
    return `<button class="show-card tilt" type="button" data-cursor="Pick seats" data-i="${i}">
      <span class="sc-top">
        <span class="sc-img">${venueImg(s.venue, '', `Photo of ${v.name}`)}</span>
        ${tag ? `<span class="sc-tag mono">${tag}</span>` : ''}
        <span class="sc-n">${String(i + 1).padStart(2, '0')}</span>
        <span class="sc-meta mono">${esc(s.date)} · ${esc(s.time)} · ${esc(cityOf(v))}</span>
        <span class="sc-title">${esc(s.title)}</span>
        <span class="sc-artist">${esc(s.artist)} <em>at ${esc(v.name)}</em></span>
      </span>
      <span class="sc-stub">
        <span class="sc-admit">ADMIT ONE</span>
        <span class="sc-from">From</span>
        <span class="sc-price">${fmtINR(from)}</span>
        <span class="sc-code" aria-hidden="true"></span>
        <span class="sc-lay">${esc(LAYOUTS[s.layout].label)}</span>
      </span>
    </button>`;
  }).join('');
  // the perforation notches line up with the dashed tear line
  const perf = () => { for (const el of $$('.show-card', track)) el.style.setProperty('--perf', el.querySelector('.sc-top').offsetHeight + 'px'); };
  perf(); document.fonts?.ready.then(perf); addEventListener('resize', perf);
  let moved = false;
  for (const el of $$('.show-card', track)) el.addEventListener('click', (e) => { if (moved) { e.preventDefault(); return; } const s = SHOWS[+el.dataset.i]; openMap({ show: s, venue: venueById(s.venue), layout: s.layout }); });
  if (!motion) return;
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    const dist = () => track.scrollWidth - track.parentElement.clientWidth + 40;
    const tween = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.shows', pin: '.shows-pin', start: 'top top', end: () => '+=' + dist(), scrub: 0.8, invalidateOnRefresh: true } });
    for (const im of $$('.sc-img img', track)) gsap.fromTo(im, { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: im.closest('.show-card'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
    // drag sideways: the drag moves the page scroll that drives the pin, and keeps gliding on release
    let down = false, sx = 0, sy = 0, lx = 0, vx = 0;
    const onDown = (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; sx = lx = e.clientX; sy = scrollY_(); vx = 0; };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - sx; if (Math.abs(dx) > 5) { moved = true; track.classList.add('dragging'); }
      vx = e.clientX - lx; lx = e.clientX;
      if (moved) scrollToY(sy - dx * 1.2, { immediate: true });
    };
    const onUp = () => { if (!down) return; down = false; track.classList.remove('dragging'); if (moved) scrollToY(scrollY_() - vx * 22, { duration: 1.1 }); setTimeout(() => { moved = false; }, 0); };
    track.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
    return () => { track.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); };
  });
}

// ---------- CUBE: seat views on a cube that grows and turns ----------
function setupCube() {
  const ids = ['nms', 'dyp', 'jln', 'vagator', 'saltlake', 'mahalaxmi'];
  const picks = ids.map(venueById).filter(Boolean);
  while (picks.length < 6) picks.push(VENUES[picks.length]);
  const cube = $('#cube'), label = $('#cube-label');
  cube.innerHTML = picks.map((v) => `<div class="cube-face">${venueImg(v.id, '', `Photo of ${v.name}`)}<span>${esc(v.name)}</span></div>`).join('');
  const names = picks.map((v) => `${v.name} · ${cityOf(v)}`);
  label.textContent = names[0];
  if (!motion) { cube.style.transform = 'rotateX(-14deg) rotateY(24deg)'; return; }
  const stops = [
    { rx: -8, ry: 0, f: 0 }, { rx: -8, ry: -90, f: 1 }, { rx: -8, ry: -180, f: 2 }, { rx: -8, ry: -270, f: 3 }, { rx: -90, ry: -360, f: 4 }, { rx: 90, ry: -360, f: 5 },
  ];
  gsap.set(cube, { rotationX: -30, rotationY: 40 });
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: '.cube-sec', start: 'top top', end: () => '+=' + innerHeight * 3.4, pin: '.cube-pin', scrub: 0.8, invalidateOnRefresh: true,
      onUpdate: (self) => { const t = self.progress * tl.duration(); let f = 0; for (const s of stops) if (t >= s.t - 0.25) f = s.f; if (label.dataset.f !== String(f)) { label.dataset.f = f; label.textContent = names[f]; if (motion) gsap.fromTo(label, { scale: 0.85 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' }); } },
    },
  });
  tl.fromTo('.cube-scene', { scale: 0.16 }, { scale: 1, duration: 1.2, ease: 'power2.out' }, 0)
    .to(cube, { rotationX: stops[0].rx, rotationY: stops[0].ry, duration: 1.2 }, 0);
  stops[0].t = 1.2;
  let t = 1.6;
  for (const s of stops.slice(1)) { tl.to(cube, { rotationX: s.rx, rotationY: s.ry, duration: 0.8 }, t); s.t = t + 0.8; t += 1.2; }
  tl.to({}, { duration: 0.4 });
  gsap.fromTo('#mq-c', { xPercent: 0 }, { xPercent: -30, ease: 'none', scrollTrigger: { trigger: '.cube-sec', start: 'top top', end: () => '+=' + innerHeight * 3.4, scrub: true } });
}

// ---------- MANIFESTO: lines light up one after another ----------
function setupLines() {
  if (!motion) return;
  const lis = $$('#lines li');
  const tl = gsap.timeline({ scrollTrigger: { trigger: '#lines', start: 'top 78%', end: 'bottom 42%', scrub: true } });
  lis.forEach((li, i) => tl.fromTo(li, { opacity: 0.2, x: -24 }, { opacity: 1, x: 0, duration: 1, ease: 'none' }, i));
}

// ---------- COMPARE: live numbers from the 3D model + spotlight ----------
function setupCompare() {
  const v = venueById('nms'); const m = getModel(v, 'catwalk');
  const pit = m.zones.find((z) => z.cat === 'PIT');
  const pitP = zoneSpot(m, pit, 'front');
  const gold = m.sections.filter((s) => s.tierIdx === 0 && s.cat === 'GOLD' && !s.closed).sort((a, b) => Math.abs(a.phi - 70) - Math.abs(b.phi - 70))[0];
  const gs = gold.getRows()[10].seats[20];
  const top = m.sections.filter((s) => s.tierIdx === m.tierInfo.length - 1 && !s.closed).sort((a, b) => a.phi - b.phi)[0];
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
    <tbody>${rows.map(([label, get, fmt], ri) => `<tr><th scope="row">${label}</th>${cols.map((c) => { const n = get(c); return `<td data-n="${n}" data-f="${ri}">${fmt(n)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  if (finePointer && !reduce) {
    const sec = $('.compare');
    sec.addEventListener('pointermove', (e) => { const r = sec.getBoundingClientRect(); sec.style.setProperty('--gx', (e.clientX - r.left) + 'px'); sec.style.setProperty('--gy', (e.clientY - r.top) + 'px'); });
  }
  if (!motion) return;
  gsap.fromTo('.cmp-shot', { clipPath: 'inset(16% 20% 16% 20% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 22px)', ease: 'none', scrollTrigger: { trigger: '.cmp-shot', start: 'top 95%', end: 'center 55%', scrub: true } });
  gsap.fromTo('.cmp-shot img', { scale: 1.4 }, { scale: 1.05, ease: 'none', scrollTrigger: { trigger: '.cmp-shot', start: 'top bottom', end: 'bottom top', scrub: true } });
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

// ---------- VENUES ----------
let cityFilter = 'All';
function renderVenues() {
  const cities = ['All', ...new Set(VENUES.map(cityOf))];
  $('#city-filter').innerHTML = cities.map((c) => `<button type="button" class="${c === cityFilter ? 'on' : ''}" aria-pressed="${c === cityFilter}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  for (const b of $$('#city-filter button')) b.onclick = () => { cityFilter = b.dataset.c; renderVenues(); if (hasGsap) ScrollTrigger.refresh(); };
  const list = VENUES.filter((v) => cityFilter === 'All' || cityOf(v) === cityFilter);
  $('#v-index').innerHTML = list.map((v) => `
    <li><button type="button" class="v-row" data-id="${v.id}" data-cursor="Open map">
      <span class="v-n mono">${String(VENUES.indexOf(v) + 1).padStart(2, '0')}</span>
      <span class="v-thumb">${thumbOf(v.id) ? `<img src="${esc(thumbOf(v.id))}" alt="" loading="lazy">` : '<span class="no-photo"></span>'}</span>
      <span class="v-name" aria-label="${esc(v.name)}">${flaps(v.name)}</span>
      <span class="v-city mono">${esc(v.city)}</span>
      <span class="v-kind mono">${v.kind === 'ground' ? 'Open ground' : v.kind === 'arena' ? 'Indoor arena' : 'Stadium'}</span>
      <span class="v-cap mono">${esc(v.capacity.split(' · ')[0])}</span>
      <span class="v-stat">${SHOWS.some((s) => s.venue === v.id) ? 'ON SALE' : 'SOON'}</span>
      <span class="v-arrow" aria-hidden="true">↗</span>
    </button></li>`).join('');
  for (const b of $$('.v-row')) {
    b.onclick = () => openMap({ show: null, venue: venueById(b.dataset.id), layout: 'end' });
    if (finePointer && !reduce) b.addEventListener('pointerenter', () => flip(b));
  }
}
function flaps(name) {
  return name.toUpperCase().split(/\s+/).map((w) => `<span class="fw" aria-hidden="true">${[...w].map((c) => `<span class="fl">${esc(c)}</span>`).join('')}</span>`).join('');
}
// split-flap: every tile shuffles through letters before it settles, left to right
const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function flip(row) {
  if (row._flipping) return; row._flipping = true;
  const tiles = $$('.fl', row.querySelector('.v-name'));
  let left = tiles.length;
  tiles.forEach((t, i) => {
    const final = t.dataset.c || (t.dataset.c = t.textContent);
    let n = 3 + i;
    const step = () => {
      if (n-- <= 0) { t.textContent = final; t.classList.remove('flip'); if (--left === 0) row._flipping = false; return; }
      t.classList.add('flip');
      t.textContent = FLAP[(Math.random() * FLAP.length) | 0];
      setTimeout(step, 38);
    };
    setTimeout(step, i * 14);
  });
}
function setupVenuePreview() {
  if (!finePointer || !motion) return;
  const pv = $('#v-preview'), pimg = $('#v-preview-img');
  const xTo = gsap.quickTo(pv, 'x', { duration: 0.5, ease: 'power3' }), yTo = gsap.quickTo(pv, 'y', { duration: 0.5, ease: 'power3' });
  let lastX = 0;
  $('#v-index').addEventListener('pointermove', (e) => {
    const row = e.target.closest('.v-row'); if (!row) return;
    const src = bigOf(row.dataset.id); if (!src) { pv.classList.remove('on'); return; } if (!pimg.src.endsWith(src)) pimg.src = src;
    xTo(e.clientX); yTo(e.clientY);
    gsap.to(pv, { rotate: Math.max(-8, Math.min(8, (e.clientX - lastX) * 0.4)), duration: 0.4 }); lastX = e.clientX;
    pv.classList.add('on');
  });
  $('#v-index').addEventListener('pointerleave', () => pv.classList.remove('on'));
}

// ---------- FOOTER: a ticket rises over the crowd; the stub tears off as you reach the end ----------
function setupFooter() {
  const seat = $('#ft-seat');
  const seats = ['SEC 113 · ROW K · SEAT 15', 'FAN PIT · FRONT', 'SEC 204 · ROW C · SEAT 8', 'SEC 319 · ROW AK · SEAT 40', 'GOLD · SEC 105 · ROW F'];
  let si = 0;
  $('#ft-stub').addEventListener('pointerenter', () => { si = (si + 1) % seats.length; seat.textContent = seats[si]; });
  if (!motion) return;
  gsap.fromTo('.foot-photo img', { scale: 1.25, yPercent: -6 }, { scale: 1.02, yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  gsap.fromTo('#foot-ticket', { y: 160, rotate: -3 }, { y: 0, rotate: 0, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'top 25%', scrub: true } });
  gsap.fromTo('#ft-stub', { rotate: 0, x: 0, y: 0 }, { rotate: 5, x: 16, y: 20, ease: 'power1.in', scrollTrigger: { trigger: '.foot', start: 'center bottom', end: 'bottom bottom', scrub: true } });
}

// ---------- pointer: card tilt + glare, magnetic buttons, cursor ----------
function setupPointerFx() {
  if (!finePointer || reduce) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.tilt');
    for (const c of $$('.tilt.hovering')) if (c !== card) { c.classList.remove('hovering'); c.style.transform = ''; c.querySelector('.sc-img')?.style.setProperty('transform', ''); }
    if (!card || card.closest('.dragging')) return;
    const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add('hovering');
    card.style.transform = `perspective(900px) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg) translateZ(0)`;
    const im = card.querySelector('.sc-img');
    im?.style.setProperty('transform', `translate3d(${(-x * 10).toFixed(1)}px, ${(-y * 10).toFixed(1)}px, 30px)`);
    im?.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%'); im?.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
  });
  for (const el of $$('.magnetic, .sticker')) {
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.28}px, ${(e.clientY - r.top - r.height / 2) * 0.32}px)`; });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
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

// ---------- big headings: letters rise as they enter ----------
function setupReveals() {
  if (!motion) { document.documentElement.classList.add("scrolled"); return; }
  for (const el of $$('.display .split')) {
    const chars = splitChars(el);
    gsap.from(chars, { yPercent: 115, rotate: 8, duration: 1, ease: 'expo.out', stagger: 0.02, scrollTrigger: { trigger: el, start: 'top 90%' } });
  }
  for (const el of $$('.v-row')) gsap.from(el, { y: 40, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 94%' } });
  // the flame manifesto wipes up over the dark page like a lighting cue
  gsap.fromTo('.manifesto', { clipPath: 'inset(18% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: '.manifesto', start: 'top bottom', end: 'top 30%', scrub: true } });
  ScrollTrigger.create({ start: 240, end: 'max', onToggle: (self) => document.documentElement.classList.toggle('scrolled', self.isActive) });
  ScrollTrigger.create({ start: 120, end: 'max', onUpdate: (self) => $('#nav').classList.toggle('tucked', self.direction === 1 && self.scroll() > 200) });
}

// ---------- intro: preloader lifts, violet curtain lifts, frame opens, title rises ----------
function intro() {
  document.documentElement.classList.add('ready');
  if (!motion) { $('#curtain')?.remove(); mask.spot.a = 1; drawMask(); return; }
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.to('#curtain', { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.0, ease: 'expo.inOut', onComplete: () => $('#curtain')?.remove() }, 0.1)
    .fromTo('#hero-photo', { scale: 1.25, filter: 'brightness(0)' }, { scale: 1.04, filter: 'brightness(1)', duration: 2.4, ease: 'expo.out', clearProps: 'filter' }, 0.3)
    .from(heroChars, { yPercent: 115, duration: 1.2, stagger: 0.025 }, 0.7)
    .from('#next-ticket', { y: -160, rotate: -24, opacity: 0, duration: 1.4, ease: 'back.out(1.4)' }, 1.3)
    .to(mask.spot, { a: 1, duration: 1.6, ease: 'power2.inOut' }, 1.1)
    .from('.nav > *', { y: -20, opacity: 0, duration: 0.8, stagger: 0.06 }, 0.9)
    .from(['.hero-title', '.hero-lede', '.hero-ctas > *'], { y: 30, opacity: 0, duration: 1, stagger: 0.08 }, 1.3)
    .from('.hero-top > *', { clipPath: 'inset(0% 100% 0% 0%)', duration: 1.2, ease: 'power3.inOut' }, 1.1)
    .from('#hero-sticker', { scale: 0, rotate: -180, duration: 1.4 }, 1.6);
}

function preload(work) {
  const fill = $('#pl-fill'), count = $('#pl-count'), pre = $('#preloader');
  const shown = { v: 0 };
  const draw = () => { fill.style.transform = `scaleX(${shown.v / 100})`; count.textContent = String(Math.round(shown.v)).padStart(3, '0'); };
  draw();
  const done = () => {
    if (motion) gsap.to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'expo.inOut', onComplete: () => pre.remove() });
    else pre.remove();
    intro();
  };
  if (!motion) { try { work(); } catch (err) { console.error(err); } done(); return; }
  gsap.to(shown, { v: 70, duration: 0.7, ease: 'power2.out', onUpdate: draw, onComplete: () => {
    setTimeout(() => { try { work(); } catch (err) { console.error(err); } gsap.to(shown, { v: 100, duration: 0.45, ease: 'power2.in', onUpdate: draw, onComplete: done }); }, 30);
  } });
}

// ---------- boot ----------
setupStage();
setupMarquees();
setupSwarm();
setupShows();
setupCube();
setupLines();
setupCompare();
renderVenues();
setupVenuePreview();
setupPointerFx();
setupReveals();
setupFooter();
// credits for every photo shown, plus the two hero/footer festival shots
const fixed = (REAL_PHOTOS.vagator || []).filter((x) => /sunburn_(pyro|crowd)/.test(x.src));
for (const ph of fixed) used.set(ph.src, ph);
$('#photo-credits').textContent = 'Photos from Wikimedia Commons: ' + [...used.values()].map((ph) => `${ph.credit} (${ph.licence})`).filter((v, i, a) => a.indexOf(v) === i).join(', ') + '.';
preload(() => { if (hasGsap) ScrollTrigger.refresh(); });
