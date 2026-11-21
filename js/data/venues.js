// Venue specs for Seatify.
//
// Every layout here is APPROXIMATE. Shapes and capacities come from public
// information (news coverage of recent concerts, venue fact sheets, Wikipedia).
// Section numbers, row counts, prices and enclosure names are illustrative,
// because promoters re-draw the plan for every show. Units are metres.
//
// Bowl venues (stadiums, arenas) are described as a superellipse (a, b, n)
// around the playing field, plus tiers of raked rows outside it.
// Ground venues (open-air grounds) are a fenced rectangle with standing zones
// and temporary seated stands.

export const CATS = {
  LOUNGE: { label: 'Lounge', price: 25000, color: '#f4f3ee' },
  PIT: { label: 'Fan Pit', price: 15000, color: '#d7ff3a' },
  PLAT: { label: 'Platinum', price: 11000, color: '#b9b4ff' },
  GOLD: { label: 'Gold', price: 7500, color: '#f1c65b' },
  GA: { label: 'Floor standing', price: 5500, color: '#7be3b4' },
  SILVER: { label: 'Silver', price: 4000, color: '#7fb2ff' },
  BRONZE: { label: 'Bronze', price: 2000, color: '#9a8f86' },
};

export const LAYOUTS = {
  end: { label: 'End stage', blurb: 'Stage at one end, the classic stadium setup.' },
  catwalk: { label: 'Catwalk + B-stage', blurb: 'A runway into the crowd with a small second stage.' },
  center: { label: '360° centre stage', blurb: 'Stage in the middle, seats on every side.' },
};

// Stage sizes follow what actually tours Indian venues: ground-supported roofs (Stageco
// Classic 4-tower, aluminium roofs) rig at about 15 m, decks sit about 2 m above the floor.
// trim = height of the roof grid; wings = how far the PA/IMAG wings reach past the deck.
const STADIUM_STAGE = { w: 40, d: 16, h: 2.0, trim: 17, wings: 10, screenW: 26, screenH: 11, screenY: 3.6 };
const GROUND_STAGE = { w: 34, d: 14, h: 2.0, trim: 15, wings: 9, screenW: 20, screenH: 9, screenY: 3.2 };
const ARENA_STAGE = { w: 20, d: 10, h: 1.5, trim: 10.5, wings: 4, screenW: 12, screenH: 6, screenY: 2.6 };

// Bowl geometry, all in metres, measured from real sources (see docs/venue-research.md):
//   a, b, n  the inner edge of the seating as a superellipse; b is always the long axis, so an
//            end stage sits at a short end the way real promoters set it up.
//   tiers    gap = distance from the end of the tier below (negative when the tier overhangs it),
//            base = height of the first row above the field, rake = rise per 0.8 m row.
//   roof     inner edge distance from the field (d), edge height (y), outer height (yOut).
//   seats    the colours of the seats as they appear in photos.
export const VENUES = [
  {
    id: 'nms', name: 'Narendra Modi Stadium', city: 'Ahmedabad', kind: 'stadium',
    capacity: '1,32,000 seats · 1,11,989 at Coldplay (record)',
    notes: 'The largest cricket stadium in the world. A two-tier round bowl, 55 m deep, around a 165 × 141 m outfield, with a 30 m PTFE canopy lit by an LED ring. Concerts put the stage at one end of the outfield, so the far stand is about 160 m away.',
    bowl: {
      a: 70.5, b: 82.5, n: 2,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 32, gap: 6, base: 1.5, rake: 0.4, sections: 36 },
        { name: 'Upper', prefix: 3, rows: 40, gap: -6, base: 21, rake: 0.56, sections: 36 },
      ],
      roof: { d: 27, y: 47, yOut: 50, ledRing: true, color: '#d9dde4' },
      seats: [['#e8742c', '#df5f2a', '#e8742c', '#d3452e'], ['#2a55b4', '#2e5cc0', '#264ea6']],
      zigzag: { tier: 1, color: '#e8742c' },
    },
    stage: STADIUM_STAGE, priceScale: 1, scenery: 'city', delayTowers: true,
  },
  {
    id: 'dyp', name: 'DY Patil Stadium', city: 'Navi Mumbai', kind: 'stadium',
    capacity: '45,300 seats · ~55,000 at concerts with the floor',
    notes: 'A round two-tier cricket bowl in Nerul around a 146 m outfield, blue bucket seats, a band of corporate boxes between the tiers and white gull-wing roof canopies over the upper tier. Coldplay and U2 used an end stage on the outfield.',
    bowl: {
      a: 72, b: 73, n: 2,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 24, gap: 5, base: 1.6, rake: 0.42, sections: 28 },
        { name: 'Upper', prefix: 2, rows: 24, gap: -3, base: 16, rake: 0.58, sections: 28 },
      ],
      roof: { d: 24, y: 34, yOut: 30, gullWing: true, color: '#e8e4da' },
      seats: ['#2457b8', '#2a62c9', '#1e4c9e'],
    },
    stage: STADIUM_STAGE, priceScale: 1.05, scenery: 'city', delayTowers: true,
  },
  {
    id: 'jln', name: 'Jawaharlal Nehru Stadium', city: 'New Delhi', kind: 'stadium',
    capacity: '60,254 seats · more with the floor',
    notes: 'Athletics stadium with a 400 m track round a 106 × 68 m field. The 2010 membrane roof (350 × 290 m, 45 m high) covers every seat. Concerts like Diljit Dosanjh put the stage at one end of the track, so the floor is long and narrow.',
    bowl: {
      a: 63, b: 97, n: 2.6,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 30, gap: 3, base: 1.2, rake: 0.4, sections: 32 },
        { name: 'Upper', prefix: 2, rows: 34, gap: -2, base: 15.5, rake: 0.55, sections: 32 },
      ],
      roof: { d: 2, y: 37, yOut: 45, membrane: true, color: '#f1f1ee' },
      track: true,
      seats: ['#2b3a55', '#33476b', '#25324a'],
    },
    stage: STADIUM_STAGE, priceScale: 1, scenery: 'city', delayTowers: true,
  },
  {
    id: 'saltlake', name: 'Salt Lake Stadium', city: 'Kolkata', kind: 'stadium',
    capacity: '68,000 seats',
    notes: 'Vivekananda Yuba Bharati Krirangan: three tiers of concrete galleries round a 105 × 70 m pitch and running track, with a metal roof and floodlights over the top tier. The top tier is high and far from the floor.',
    bowl: {
      a: 60, b: 92, n: 2.4,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 26, gap: 4, base: 1.5, rake: 0.38, sections: 32 },
        { name: 'Middle', prefix: 2, rows: 20, gap: -2, base: 14, rake: 0.5, sections: 32 },
        { name: 'Upper', prefix: 3, rows: 26, gap: -2, base: 26, rake: 0.56, sections: 32 },
      ],
      roof: { d: 40, y: 45, yOut: 47, color: '#9aa0a8', floodlights: true },
      track: true,
      seats: ['#c7372f', '#e0b52b', '#2c62b4', '#2f8f4e'], seatMix: 'random',
    },
    stage: STADIUM_STAGE, priceScale: 0.85, scenery: 'city', delayTowers: true,
  },
  {
    id: 'gachibowli', name: 'GMC Balayogi Stadium', city: 'Hyderabad (Gachibowli)', kind: 'stadium',
    capacity: '~18,000 seats',
    notes: 'A low single-tier athletics stadium in Gachibowli: an eight-lane track round a 105 × 68 m pitch, with 25 m cantilevered roofs over both long stands and open ends. Everything is close and low.',
    bowl: {
      a: 54, b: 88, n: 2.7,
      tiers: [
        { name: 'Stand', prefix: 1, rows: 18, gap: 6, base: 1.4, rake: 0.45, sections: 28 },
      ],
      roof: { d: 2, y: 19, yOut: 17, color: '#d8d2c6', spans: [[-42, 42], [138, 222]] },
      track: true,
      seats: ['#c9cbd0', '#3a63b0', '#c9cbd0'],
    },
    stage: STADIUM_STAGE, priceScale: 0.85, scenery: 'city', delayTowers: true,
  },
  {
    id: 'nsci', name: 'NSCI Dome', city: 'Mumbai (Worli)', kind: 'arena',
    capacity: '~6,000 to 8,000 at concerts',
    notes: 'Indoor domed arena (Dome SVP Stadium) at the National Sports Club of India. A ring of raked seats round a flat floor that becomes the standing zone, under a steel dome.',
    bowl: {
      a: 22, b: 28, n: 2.6,
      tiers: [
        { name: 'Bowl', prefix: 1, rows: 18, gap: 3, base: 1.4, rake: 0.5, sections: 16 },
      ],
      dome: true,
      seats: ['#8a1f2b', '#a12634'],
    },
    stage: ARENA_STAGE, priceScale: 1.15, scenery: 'none', delayTowers: false,
  },
  {
    id: 'mahalaxmi', name: 'Mahalaxmi Racecourse', city: 'Mumbai', kind: 'ground',
    capacity: '~40,000 a day at festivals',
    notes: 'Open turf inside the racecourse. Festivals fence off part of the grounds, with standing zones and raised lounges. The real enclosure moves from event to event.',
    ground: { w: 230, d: 190, sideStands: true },
    stage: GROUND_STAGE, priceScale: 1, scenery: 'city',
  },
  {
    id: 'jwg', name: 'Jio World Garden', city: 'Mumbai (BKC)', kind: 'ground',
    capacity: '~15,000 to 20,000',
    notes: 'Landscaped open-air venue in Bandra Kurla Complex next to the Jio World Centre. Mostly standing, with a raised VIP deck.',
    ground: { w: 150, d: 110, sideStands: false },
    stage: GROUND_STAGE, priceScale: 1.1, scenery: 'city',
  },
  {
    id: 'nesco', name: 'NESCO Grounds', city: 'Mumbai (Goregaon)', kind: 'ground',
    capacity: '~10,000 to 15,000',
    notes: 'Open grounds at the NESCO Centre, used for club-style gigs and festivals. Standing floor with a small lounge stand.',
    ground: { w: 130, d: 100, sideStands: false },
    stage: GROUND_STAGE, priceScale: 0.95, scenery: 'city',
  },
  {
    id: 'palace', name: 'Palace Grounds', city: 'Bengaluru', kind: 'ground',
    capacity: '~30,000 to 50,000 (depends on the enclosure)',
    notes: 'Huge grounds around Bangalore Palace, split into named enclosures. Concerts use one enclosure with standing zones and side stands.',
    ground: { w: 210, d: 160, sideStands: true },
    stage: GROUND_STAGE, priceScale: 0.95, scenery: 'trees',
  },
  {
    id: 'nice', name: 'NICE Grounds', city: 'Bengaluru', kind: 'ground',
    capacity: '~40,000',
    notes: 'Open grounds off the NICE Road on the edge of the city, used for large festivals.',
    ground: { w: 230, d: 170, sideStands: true },
    stage: GROUND_STAGE, priceScale: 0.9, scenery: 'trees',
  },
  {
    id: 'huda', name: 'HUDA Ground', city: 'Gurugram', kind: 'ground',
    capacity: '~25,000 to 35,000',
    notes: 'Open city ground used for concerts and festivals in Gurugram. Standing floor plus temporary stands.',
    ground: { w: 180, d: 130, sideStands: true },
    stage: GROUND_STAGE, priceScale: 0.95, scenery: 'city',
  },
  {
    id: 'hitex', name: 'HITEX Open Arena', city: 'Hyderabad', kind: 'ground',
    capacity: '~20,000',
    notes: 'Open-air arena at the HITEX exhibition complex in Madhapur.',
    ground: { w: 160, d: 120, sideStands: false },
    stage: GROUND_STAGE, priceScale: 0.9, scenery: 'city',
  },
  {
    id: 'vagator', name: 'Vagator Festival Grounds', city: 'Goa', kind: 'ground',
    capacity: '~40,000 a day',
    notes: 'Hilltop festival grounds near Vagator, the traditional home of big December dance festivals. Real festivals run several stages, only the main stage is modelled.',
    ground: { w: 250, d: 190, sideStands: true },
    stage: GROUND_STAGE, priceScale: 0.9, scenery: 'palms',
  },
];

// Sample shows. Artists and tours are made up for the demo.
export const SHOWS = [
  { id: 's1', title: 'Neon Monsoon World Tour', artist: 'Aarav & The Satellites', venue: 'nms', layout: 'catwalk', date: 'Sat 12 Dec 2026', time: '7:00 PM' },
  { id: 's2', title: 'Capital Roar', artist: 'Rhea Malhotra', venue: 'jln', layout: 'end', date: 'Sun 20 Dec 2026', time: '6:30 PM' },
  { id: 's3', title: 'Sunset Coast Festival', artist: 'Main stage line-up', venue: 'vagator', layout: 'end', date: 'Mon 28 Dec 2026', time: '4:00 PM' },
  { id: 's4', title: 'Darbar in the Round', artist: 'The Darbar Collective', venue: 'dyp', layout: 'center', date: 'Sat 16 Jan 2027', time: '7:30 PM' },
  { id: 's5', title: 'Ghazal After Dark', artist: 'Meher Qadri', venue: 'nsci', layout: 'end', date: 'Fri 22 Jan 2027', time: '8:00 PM' },
  { id: 's6', title: 'Bassline Bombay', artist: 'Festival line-up', venue: 'mahalaxmi', layout: 'end', date: 'Sat 30 Jan 2027', time: '3:00 PM' },
  { id: 's7', title: 'Baul Electric', artist: 'Ektara Sound System', venue: 'saltlake', layout: 'catwalk', date: 'Sun 7 Feb 2027', time: '6:00 PM' },
  { id: 's8', title: 'Garden City Loud', artist: 'Kaveri Lines', venue: 'palace', layout: 'end', date: 'Sat 13 Feb 2027', time: '6:00 PM' },
  { id: 's9', title: 'Deccan Drift Live', artist: 'Noor & Nizam', venue: 'gachibowli', layout: 'end', date: 'Sat 27 Feb 2027', time: '7:00 PM' },
  { id: 's10', title: 'Indie Garden Sessions', artist: 'Paper Boats', venue: 'jwg', layout: 'end', date: 'Fri 5 Mar 2027', time: '7:30 PM' },
];
