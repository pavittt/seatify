# Venue research for the 3D seat view

What each venue in `js/data/venues.js` is built from, and why the seat view now looks the way it
does. All sizes are metres. Where a number is an estimate, it says so.

## Why it felt like a toy world

1. **The camera zoomed itself.** The old view picked a lens per seat so the stage always filled
   about 60% of the screen. A seat 196 m away got a 15° telephoto lens and looked as close as a
   seat 78 m away. Real fan photos and reels are shot on a phone's 1x camera (about 68° across the
   long side), so a far seat shows a small stage inside a huge bowl. The view now uses that fixed
   lens; zoom is a separate 2x/3x control, like a phone.
2. **Wrong stage scale.** Stage roofs were 26 m tall with a 46 m wide screen. Shows in India use
   ground-supported roofs that rig at about 15 m (Pollstar on BookMyShow Live's Stageco Classic
   4-tower roof: "trim heights of approximately 15 meters"). Stages are now a 40 m deck at 2 m
   high, a 17 m roof grid, a 26 × 11 m upstage LED wall and 12 × 6.75 m side IMAG screens.
3. **Night fog ate the bowl.** Fog started at 160 m, so the far side of a 230 m stadium dissolved
   into black and you never felt inside a stadium. Fog now starts at 280 m.
4. **The seats were painted as the availability map.** In the seat view every chair was blue (free)
   or dark navy (sold), so the stands read as black. Chairs now take their real colours from
   photos; the blue/dark availability colours only show on the stadium map.
5. **Lego people.** The crowd was capsules and spheres. It is now painted people with human
   proportions, 16 outfits (tees, kurtas, hoodies, dupattas, caps, a turban, long and short hair,
   Indian skin tones), each painted from the back, three-quarter, side and front. The view picked
   matches the camera, so the fans in front of you show their backs and the far stand shows faces.
   Stage light rims their outlines and phone screens glow, the way crowds look in real gig photos.
6. **Stages were on the wrong side.** In oval stadiums the end stage sat on a long side. The long
   axis is now always the stage axis, so the stage is at a short end as real promoters set it.

## Stadiums and arena

| Venue | Measured | Built as |
| --- | --- | --- |
| **Narendra Modi Stadium**, Ahmedabad | Outfield 165 × 141 m (OSM pitch outline; Wikipedia gives 160 × 140). Outer footprint 311 × 288 m (OSM). Seating bowl 55 m deep, two tiers, a three-tier pavilion, 30 m PTFE canopy cantilevered from a perimeter ring, LED ring on the roof edge (Wikipedia, worldsteel/Walter P Moore). 1,32,000 seats; Coldplay drew 1,11,989. | Inner edge 141 × 165 m ellipse. Lower tier 32 rows from 1.5 m, upper tier 40 rows from 21 m, total depth 56 m, top row 43 m up. Canopy edge at 47 m. Lower tier orange/red seats, upper tier blue with orange chevrons, as in photos. Box level glass band between the tiers. |
| **DY Patil Stadium**, Navi Mumbai | Outfield 146 × 145 m, stadium outline 229 × 208 m (OSM). 45,300 seats (Wikipedia). Bucket seats, cantilever gull-wing roofs, corporate boxes (Wikipedia, Hafeez Contractor). | 146 m round field, lower tier 24 rows, upper tier 24 rows from 16 m, outer edge about 226 m across (matches the 229 m outline). Blue seats, white gull-wing canopy panels with gaps. |
| **Jawaharlal Nehru Stadium**, Delhi | 106 × 68 m field inside a 400 m track; 60,254 seats. Membrane roof 350 × 290 m, 45 m above the field, 70 m deep, 57,000 seats under it (sbp, Wikipedia). | Inner edge 126 × 194 m round the track, lower tier 30 rows, upper tier 34 rows from 15.5 m. White folded membrane roof from 37 m at the inner edge to 45 m, with a ring of masts and floodlight banks. Red track. |
| **Salt Lake Stadium**, Kolkata | 105 × 70 m pitch with a running track; three tiers of concrete galleries; metal roof with floodlights; 68,000 seats; outline 309 × 239 m (Wikipedia, OSM). | Three tiers (26, 20 and 26 rows, from 1.5, 14 and 26 m), roof over the top tier at 45 m with floodlights, mixed red/yellow/blue/green seats. |
| **GMC Balayogi Stadium**, Gachibowli | 105 × 68 m pitch in an eight-lane track; 18,000 seats; 25 m cantilevered roofs over the stands (Wikipedia); outline 267 × 185 m (OSM). The old 30,000 figure was wrong. | One low tier of 18 rows (top row 9 m up), roofs over the two long stands only, open ends. |
| **NSCI Dome**, Mumbai | Indoor arena, 6,000+ seats (Wikipedia, Dome SVP Stadium). Exact plan not published. | Estimate: 44 × 56 m floor, 18 raked rows, steel dome. Arena stage: 20 m deck at 1.5 m, 10.5 m grid. |

## Open grounds

Mahalaxmi Racecourse, Jio World Garden, NESCO, Palace Grounds, NICE Grounds, HUDA Ground, HITEX and
Vagator have no permanent stands: every promoter fences a different enclosure. Their sizes stay as
estimates that fit the published capacities at about 2 people per square metre, and they now use a
real ground-show stage (34 m deck at 2 m, 15 m roof grid, 20 × 9 m LED wall). What a seat looks like
there depends mostly on how far back you stand, which the view now shows honestly.

## Reference photos used for checking

Free-licence photos from Wikimedia Commons, used to compare colours, tier heights and roof shapes:

- Narendra Modi Stadium view from the gallery (A Cricket Premi, CC BY-SA 4.0)
- Narendra Modi Stadium Border Gavaskar Trophy 2023 (Prime Minister's Office, GODL-India)
- Narendra modi stadium 2023 Final (Ishi6181, CC0)
- DY Patil IPL (Sankarshan Mukhopadhyay, CC BY-SA 2.0), DY Patil Stadium (Redtigerxyz, CC BY-SA 3.0)
- Jawaharlal Nehru Stadium Delhi (Subhajit Nag, CC BY-SA 4.0), Panoramic JLN (Harsh Rawat, CC BY-SA 4.0)
- Salt Lake Stadium (Lovedimpy, public domain)
- Gachibowli Outdoor 35 and 75 (Sanyam Bahga, CC BY-SA 3.0)

## Sources

- Wikipedia articles for each venue (capacities, field sizes, structure)
- OpenStreetMap outlines via the Overpass API (stadium, pitch and track footprints)
- sbp (Schlaich Bergermann Partner), JNS Jawaharlal Nehru Stadium project page
- worldsteel.org steel story on the Narendra Modi Stadium roof (Walter P Moore)
- Pollstar, "India's BookMyShow Live Invests In Stageco Equipment" (2 Sep 2026)
