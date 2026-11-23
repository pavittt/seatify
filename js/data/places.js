// Where each venue really is, for the Google Maps panel.
// lat/lng come from OpenStreetMap (Nominatim) and point at the venue itself; `q` is the text
// Google Maps searches for, so the pin lands on Google's own place even where our point is rough.
// `exact: false` marks grounds whose concert enclosure moves between events, so the pin is the
// general area rather than the exact field.
export const PLACES = {
  nms: { lat: 23.09177, lng: 72.59733, q: 'Narendra Modi Stadium, Ahmedabad', zoom: 17, exact: true },
  dyp: { lat: 19.04205, lng: 73.02673, q: 'DY Patil Stadium, Navi Mumbai', zoom: 17, exact: true },
  jln: { lat: 28.58338, lng: 77.23354, q: 'Jawaharlal Nehru Stadium, New Delhi', zoom: 17, exact: true },
  saltlake: { lat: 22.56906, lng: 88.40902, q: 'Salt Lake Stadium, Kolkata', zoom: 17, exact: true },
  gachibowli: { lat: 17.4494, lng: 78.3485, q: 'GMC Balayogi Athletic Stadium, Gachibowli, Hyderabad', zoom: 17, exact: true },
  nsci: { lat: 18.98596, lng: 72.81547, q: 'NSCI Dome, Mumbai', zoom: 18, exact: true },
  mahalaxmi: { lat: 18.9852, lng: 72.8206, q: 'Mahalaxmi Racecourse, Mumbai', zoom: 16, exact: false },
  jwg: { lat: 19.06388, lng: 72.86664, q: 'Jio World Garden, BKC, Mumbai', zoom: 17, exact: true },
  nesco: { lat: 19.1525, lng: 72.855, q: 'NESCO Center, Goregaon East, Mumbai', zoom: 17, exact: false },
  palace: { lat: 12.99918, lng: 77.58974, q: 'Palace Grounds, Bengaluru', zoom: 16, exact: false },
  nice: { lat: null, lng: null, q: 'NICE Grounds, Bengaluru', zoom: 16, exact: false },
  huda: { lat: null, lng: null, q: 'HUDA Ground, Sector 29, Gurugram', zoom: 16, exact: false },
  hitex: { lat: 17.47081, lng: 78.37491, q: 'HITEX Exhibition Centre, Hyderabad', zoom: 16, exact: false },
  vagator: { lat: 15.59857, lng: 73.74081, q: 'Vagator, Goa', zoom: 15, exact: false },
};

const enc = encodeURIComponent;
const where = (p) => (p.lat != null ? `${p.lat},${p.lng}` : p.q);

// Keyless Google links. The embed is the classic maps "output=embed" page, which needs no API key.
export function mapsLinks(id) {
  const p = PLACES[id]; if (!p) return null;
  return {
    embed: (sat) => `https://maps.google.com/maps?q=${enc(p.exact ? where(p) : p.q)}&t=${sat ? 'k' : 'm'}&z=${p.zoom}&output=embed`,
    maps: `https://www.google.com/maps/search/?api=1&query=${enc(p.q)}`,
    earth: p.lat != null ? `https://earth.google.com/web/@${p.lat},${p.lng},60a,900d,35y,0h,55t,0r` : `https://earth.google.com/web/search/${enc(p.q)}`,
    street: p.lat != null ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}` : null,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${enc(p.q)}`,
    exact: p.exact,
  };
}
