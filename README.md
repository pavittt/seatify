# Seatify

Concert ticketing for India's big venues, with a 3D **view from your seat** before you pay.

Live site: https://pavittt.github.io/seatify/

Pick a show or a venue and the whole stadium opens in 3D, with every seat drawn as a chair (bright blue if free, dark if taken). Hover a block to see its price and free seats, tap it, and the camera swoops over the block, down to your chair (lit lime) and into the seat, turning to face the stage. ‹ › steps to the next free seat, Other seats flies back up to the stadium, and the flat 2D plan is one tap away for picking an exact seat. The scene is filled with fans who bounce and hold up phone lights. A bottom sheet shows a mini-map, the distance to the stage, viewing angle, how far off-centre you are, how big the main screen looks, and warnings when something blocks the view.

## What's in it

- **14 venues** across Mumbai, Delhi NCR, Ahmedabad, Bengaluru, Hyderabad, Kolkata and Goa (see the table below).
- **3 stage layouts** for every venue: end stage, end stage with a catwalk and B-stage, and a 360° centre stage. Sections behind an end stage are marked "No view" and are not sold.
- **Seated sections** with rows and seat numbers, plus **standing zones** (Fan Pit, Floor, Gold and Silver standing) where you preview the view from the front, middle or back of the zone.
- **Line-of-sight check.** Rays are cast from your eye to the stage and screens. If the sound desk, a delay speaker tower, a stage tower or the tier above you is in the way, the sheet says how much of the view it blocks.
- **Viewing stats**: distance, angle, off-centre distance, height, and "the main screen looks like a 41″ TV from your sofa".
- **Checkout mock** with quantity, fees and a ticket. No payment is taken.
- An **Empty venue** switch takes the crowd away, brings the house lights up and drops you to seated eye height, so you can judge the seat itself (like the empty-stadium seat views real venues publish).

## The homepage

The homepage is a scroll story. Every section has its own scroll scene, each one rebuilt with Seatify's own content from a technique on the reference sites:

1. **Stage (from Danilo De Marco):** after the preloader and a violet curtain lift, a live three.js concert plays in a rounded frame. As you scroll, the frame grows to full screen, the headline splits apart, and the camera flies from a crane shot over the crowd into Sec 115, Row K. A viewfinder HUD and three steps (pick, fly, know) go with it.
2. **Crossing tapes (from Airborne):** a lime band and a pink band cross at an angle. They carry the cities and venues, and their speed and skew follow how fast you scroll.
3. **Split title with tumbling cards (from Bleibtgleich):** "Shows 26—27" pulls apart while show cards tumble up through it in 3D.
4. **Drag gallery (from Niccolò Miranda):** the shows scroll sideways while the section is pinned, or you can drag them with inertia. Phones swipe instead. Cards tilt and catch a glare under the pointer.
5. **Cube of seat views (from Ning H.):** a tiny cube grows and turns face by face as you scroll. Each face is a seat view at a different venue, and a giant outline serif marquee runs behind it.
6. **Lines that light up (from Airborne):** the "flat map lies" manifesto sits on a hot pink panel, and its lines light up one by one.
7. **Spotlight comparison (from Thibaut):** a coloured spotlight follows the pointer. The view image opens from an inset to full size, and the numbers count up.
8. **Venue index on a lime panel:** rows fill with ink on hover and a preview image follows the cursor.
9. **Footer (from Danilo De Marco):** a violet and pink Vanta fog plays behind it, and the SEATIFY wordmark fills with lime from the bottom as you reach the end.

A fixed sticker spins faster while you scroll and opens a seat view (from Airborne). Buttons have a fill that sweeps up and a label that rolls over. Booking screens open as full-screen layers over the homepage with a wipe transition, and Escape steps back.

**Libraries:** GSAP 3.12.5 + ScrollTrigger (cdnjs), Locomotive Scroll 5 beta, which runs on Lenis for smooth scrolling (jsDelivr), Vanta.js 0.5.24 FOG (jsDelivr), three.js 0.160.0. The React Bits patterns used (SplitText, ScrollVelocity, Magnet, TiltedCard, Counter) are re-written in plain JS in `js/home.js`, so there is still no build step. Everything respects `prefers-reduced-motion`.

**Look:** a night palette of ink and cream, with acid lime, hot pink and electric violet as big rounded colour panels. Display type is Archivo at its heaviest weight and widest width, in caps, mixed with Instrument Serif italic letters. Body text is Geist and data is Geist Mono, with a fine film grain over everything.

**Seat view realism:** the camera aims and zooms so the whole stage is in frame from any seat. The stage has box truss towers and roof grid, an LED main wall with visible pixel pitch, LED columns, flown IMAG side screens with a live camera feed, curved line-array PA hangs, subs, a barricade, a band with drum riser and amps, moving-head fixtures whose beams change cues every 8 seconds, haze, and bloom post-processing (three.js UnrealBloomPass). The back of the set is built too: scaffold behind the video wall, black rear and side drapes, and flight cases in the wings, so side-stage seats see what they would really see. The crowd has human proportions (rounded bodies, varied heights and builds) and dresses dark like a real gig crowd, holding up phone lights. The stands have rows of seat backs, aisles and concrete steps. Every seat near you is a real tip-up chair facing the stage, and yours glows lime. LED fascia boards along each tier front show that block's price band and starting price.

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

**Which seats can see the stage** is worked out from where the stage actually is, not from the middle of the venue. For an end stage, any block whose middle sits level with or behind the video wall is closed (no view), and any seat behind that line is not sold. Blocks more than 65° round the side of the video wall are sold as *side-stage, limited view* at the lowest price, with a warning in the seat view. Real tours close different blocks for each stage design, so this still needs checking against each show's plan.

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
