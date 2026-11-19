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
  LOUNGE: { label: 'Lounge', price: 25000, color: '#f3d36b' },
  PIT: { label: 'Fan Pit', price: 15000, color: '#ff5c8a' },
  PLAT: { label: 'Platinum', price: 11000, color: '#c792ff' },
  GOLD: { label: 'Gold', price: 7500, color: '#ffb54a' },
  GA: { label: 'Floor standing', price: 5500, color: '#3fe0a5' },
  SILVER: { label: 'Silver', price: 4000, color: '#55c8ff' },
  BRONZE: { label: 'Bronze', price: 2000, color: '#8b95ff' },
};

export const LAYOUTS = {
  end: { label: 'End stage', blurb: 'Stage at one end, the classic stadium setup.' },
  catwalk: { label: 'Catwalk + B-stage', blurb: 'A runway into the crowd with a small second stage.' },
  center: { label: '360° centre stage', blurb: 'Stage in the middle, seats on every side.' },
};

const STADIUM_STAGE = { w: 62, d: 18, h: 2.4, screenW: 46, screenH: 15, screenY: 7 };
const GROUND_STAGE = { w: 54, d: 16, h: 2.2, screenW: 38, screenH: 13, screenY: 6 };
const ARENA_STAGE = { w: 22, d: 10, h: 1.8, screenW: 16, screenH: 7, screenY: 4 };

export const VENUES = [
  {
    id: 'nms', name: 'Narendra Modi Stadium', city: 'Ahmedabad', kind: 'stadium',
    capacity: '1,32,000 seats · 1 lakh+ at concerts',
    notes: 'The largest cricket stadium in the world. A round three-tier bowl with a canopy roof over the seats. Concerts use an end stage on the outfield.',
    bowl: {
      a: 86, b: 86, n: 2,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 34, gap: 5, base: 1.2, rake: 0.42, sections: 36 },
        { name: 'Middle', prefix: 2, rows: 12, gap: -5, base: 19.5, rake: 0.52, sections: 36 },
        { name: 'Upper', prefix: 3, rows: 38, gap: -3, base: 28, rake: 0.56, sections: 36 },
      ],
      roof: { inset: 26, lift: 6 },
    },
    stage: STADIUM_STAGE, priceScale: 1, scenery: 'city', delayTowers: true,
  },
  {
    id: 'dyp', name: 'DY Patil Stadium', city: 'Navi Mumbai', kind: 'stadium',
    capacity: '~55,000 seats · 60,000+ at concerts',
    notes: 'Oval two-tier bowl in Nerul. Used for big stadium tours with an end stage at the south end. Roof cover is not modelled.',
    bowl: {
      a: 78, b: 70, n: 2.1,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 26, gap: 4, base: 1.2, rake: 0.42, sections: 28 },
        { name: 'Upper', prefix: 2, rows: 30, gap: -3, base: 15.5, rake: 0.56, sections: 28 },
      ],
    },
    stage: STADIUM_STAGE, priceScale: 1.05, scenery: 'city', delayTowers: true,
  },
  {
    id: 'jln', name: 'Jawaharlal Nehru Stadium', city: 'New Delhi', kind: 'stadium',
    capacity: '~60,000 seats',
    notes: 'Athletics stadium with a running track around the field and a membrane roof over all stands, added for the 2010 Commonwealth Games.',
    bowl: {
      a: 96, b: 62, n: 2.7,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 26, gap: 8, base: 1.4, rake: 0.42, sections: 32 },
        { name: 'Upper', prefix: 2, rows: 28, gap: -2, base: 14, rake: 0.55, sections: 32 },
      ],
      roof: { inset: 30, lift: 7 },
    },
    stage: STADIUM_STAGE, priceScale: 1, scenery: 'city', delayTowers: true,
  },
  {
    id: 'saltlake', name: 'Salt Lake Stadium', city: 'Kolkata', kind: 'stadium',
    capacity: '~68,000 seats',
    notes: 'Vivekananda Yuba Bharati Krirangan, a two-tier football bowl with a running track and a roof over the upper tier.',
    bowl: {
      a: 92, b: 76, n: 2.3,
      tiers: [
        { name: 'Lower', prefix: 1, rows: 30, gap: 8, base: 1.3, rake: 0.42, sections: 32 },
        { name: 'Upper', prefix: 2, rows: 32, gap: -2, base: 16, rake: 0.56, sections: 32 },
      ],
      roof: { inset: 18, lift: 6 },
    },
    stage: STADIUM_STAGE, priceScale: 0.85, scenery: 'city', delayTowers: true,
  },
  {
    id: 'gachibowli', name: 'GMC Balayogi Stadium', city: 'Hyderabad (Gachibowli)', kind: 'stadium',
    capacity: '~30,000 seats',
    notes: 'Single-tier athletics stadium in Gachibowli with a roofed pavilion stand on one long side.',
    bowl: {
      a: 88, b: 56, n: 2.7,
      tiers: [
        { name: 'Stand', prefix: 1, rows: 30, gap: 8, base: 1.3, rake: 0.46, sections: 28 },
      ],
      roof: { inset: 16, lift: 6, from: -40, to: 40 },
    },
    stage: STADIUM_STAGE, priceScale: 0.85, scenery: 'city', delayTowers: true,
  },
  {
    id: 'nsci', name: 'NSCI Dome', city: 'Mumbai (Worli)', kind: 'arena',
    capacity: '~8,000 at concerts',
    notes: 'Indoor domed arena at the National Sports Club of India. Raked seating around a flat floor that becomes a standing zone.',
    bowl: {
      a: 27, b: 21, n: 3,
      tiers: [
        { name: 'Bowl', prefix: 1, rows: 18, gap: 3, base: 1.4, rake: 0.5, sections: 16 },
      ],
      dome: true,
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
