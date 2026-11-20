# Seatify

Concert ticketing for India's big venues, with a 3D **view from your seat** before you pay.

Live site: https://pavittt.github.io/seatify/

Pick a show or a venue, choose a price band on the seat map, tap a section and a seat (or a standing zone), and the camera flies into a 3D view of the stage from that exact spot. The scene is filled with chunky toy-block fans who bounce and hold up phone lights. A bottom sheet shows a mini-map, the distance to the stage, viewing angle, how far off-centre you are, how big the main screen looks, and warnings when something blocks the view.

## What's in it

- **14 venues** across Mumbai, Delhi NCR, Ahmedabad, Bengaluru, Hyderabad, Kolkata and Goa (see the table below).
- **3 stage layouts** for every venue: end stage, end stage with a catwalk and B-stage, and a 360° centre stage. Sections behind an end stage are marked "No view" and are not sold.
- **Seated sections** with rows and seat numbers, plus **standing zones** (Fan Pit, Floor, Gold and Silver standing) where you preview the view from the front, middle or back of the zone.
- **Line-of-sight check.** Rays are cast from your eye to the stage and screens. If the sound desk, a delay speaker tower, a stage tower or the tier above you is in the way, the sheet says how much of the view it blocks.
- **Viewing stats**: distance, angle, off-centre distance, height, and "the main screen looks like a 41″ TV from your sofa".
- **Checkout mock** with quantity, fees and a ticket. No payment is taken.
- A **toy heads** switch turns everyone's heads toy yellow.

## The homepage

The homepage is a scroll story rather than a list of cards:

1. **Hero** with a Vanta.js fog backdrop in stage colours, split-letter headline and a wordmark whose width animates in (Archivo's variable `wdth` axis).
2. **Fly-in**: the section pins and your scroll drives the real three.js scene, dropping the camera out of the sky into Sec 115, Row K, with a camera-viewfinder HUD and three steps (pick a seat, fly in, know before).
3. **Marquee** of cities and venues whose speed follows your scroll velocity.
4. **Shows** scroll sideways while the section is pinned (desktop) or swipe (phone), with tilt-on-hover cards and parallax images.
5. **Manifesto** that lights up word by word, a **seat comparison** table, and a **venue index** with a cursor-following preview image.

Booking screens open as full-screen layers over the homepage with a wipe transition, and Escape steps back.

**Libraries:** GSAP 3.12.5 + ScrollTrigger (cdnjs), Locomotive Scroll 5 beta, which runs on Lenis for smooth scrolling (jsDelivr), Vanta.js 0.5.24 FOG (jsDelivr), three.js 0.160.0. The React Bits patterns used (SplitText, ScrollReveal, ScrollVelocity, Magnet, TiltedCard, Counter) are re-written in plain JS in `js/home.js`, so there is still no build step. Everything respects `prefers-reduced-motion`.

**Look:** monochrome near-black and bone with one acid-lime signal colour (prices, buttons) and a soft lavender secondary. Archivo at medium weight in sentence case for display, Instrument Serif italic for accent words, Geist and Geist Mono for body and data.

**Seat view realism:** the camera aims and zooms so the whole stage is in frame from any seat. The stage has box truss towers and roof grid, an LED main wall with visible pixel pitch, LED columns, flown IMAG side screens with a live camera feed, curved line-array PA hangs, subs, a barricade, a blocky band with drum riser and amps, moving-head fixtures whose beams change cues every 8 seconds, haze, and bloom post-processing (three.js UnrealBloomPass). The crowd dresses dark like a real gig crowd and holds up phone lights.

**Images:** the venue images in `assets/venues/` are 1600×1000 renders from Seatify's own 3D scene, so there are no licensing issues. Swap in licensed photos with the same file names if you want real venue shots.

## Run it

It is a static site with no build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000. Add `#demo` to the URL to jump straight into a seat view.

three.js (0.160.0) loads from jsDelivr through an import map, and fonts load from Google Fonts.

## Code layout

| File | What it does |
| --- | --- |
| `js/data/venues.js` | Venue specs, price bands, stage layouts and sample shows |
| `js/model.js` | Turns a venue and layout into sections, seats, standing zones, stage and obstacles; viewing stats and warnings |
| `js/map.js` | The top-down SVG seat map (pan, pinch, zoom, price filter) and the mini-map |
| `js/scene3d.js` | The three.js scene: stepped stands, stage and screens, light beams, instanced blocky crowd, camera fly-in, line-of-sight rays |
| `js/app.js` | Booking flow layers (seat map, seat view, checkout) |
| `js/home.js` | Homepage: preloader, smooth scroll, fly-in, marquee, shows, venue index, cursor |

### Adding a venue

Add an entry to `VENUES` in `js/data/venues.js`.

- A **stadium or arena** gets a `bowl`: the field as a superellipse (`a`, `b` half-widths in metres, `n` squareness, 2 = ellipse) and a list of `tiers` (`rows`, `gap` from the previous tier where a negative gap makes it overhang, `base` height, `rake` rise per row, number of `sections`). It can have a `roof` (optionally only over an arc) or a `dome`.
- An **open ground** gets a `ground` with its width and depth, and `sideStands: true` if it has temporary seated stands at the sides. A lounge deck at the back is always added.

## Venue accuracy

**Every layout is approximate.** Shapes and capacities come from public information (venue fact sheets, Wikipedia, and news coverage of recent concerts). Section numbers, row counts, prices and enclosure names are made up, because promoters redraw the plan for every show. Before a real launch, each show needs the promoter's official seating plan.

| Venue | City | Type | Capacity used | Confidence |
| --- | --- | --- | --- | --- |
| Narendra Modi Stadium | Ahmedabad | 3-tier round bowl, roof canopy | 1,32,000 seats | Shape good, tiers approximate |
| DY Patil Stadium | Navi Mumbai | 2-tier oval | ~55,000 seats | Shape good, roof not modelled |
| Jawaharlal Nehru Stadium | New Delhi | Athletics bowl, membrane roof | ~60,000 | Shape good, tiers approximate |
| Salt Lake Stadium (VYBK) | Kolkata | 2-tier football bowl | ~68,000 | Approximate |
| GMC Balayogi Stadium | Hyderabad | Single-tier athletics stadium | ~30,000 | Approximate |
| NSCI Dome | Mumbai | Indoor arena | ~8,000 | Approximate |
| Mahalaxmi Racecourse | Mumbai | Open ground (festival enclosure) | ~40,000 a day | Enclosure varies by event |
| Jio World Garden | Mumbai | Open-air garden venue | ~15,000 to 20,000 | Approximate |
| NESCO Grounds | Mumbai | Open ground | ~10,000 to 15,000 | Approximate |
| Palace Grounds | Bengaluru | Open ground (named enclosures) | ~30,000 to 50,000 | Enclosure varies by event |
| NICE Grounds | Bengaluru | Open ground | ~40,000 | Approximate |
| HUDA Ground | Gurugram | Open ground | ~25,000 to 35,000 | Approximate |
| HITEX Open Arena | Hyderabad | Open-air arena | ~20,000 | Approximate |
| Vagator Festival Grounds | Goa | Hilltop festival ground | ~40,000 a day | Only the main stage modelled |

Artists and shows in the app are made up for the demo.

## Ideas for next steps

- Load official seating plans per show (JSON from the promoter), replacing the generated sections.
- Tour-specific stage files (stage width, catwalk shape, screen sizes) chosen per show.
- A backend for live seat availability, holds and payments.
- Photo-matched views: overlay real fan photos taken from a section next to the 3D view.

## Credits

The "view from your seat" flow was inspired by concept reels from designer raminnasibov and by seat simulators such as CinemaView. The look, code and models here are original.
