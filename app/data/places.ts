// Moon coordinates use the IAU Mean Earth / polar axis frame (the same one NASA
// publishes for Apollo and Artemis): north latitude, east longitude −180…180.
// Mars coordinates use planetocentric latitude and east longitude, shown 0…360°E.

export type Planet = 'moon' | 'mars'

export type Site = {
  name: string
  kind: string
  lat: number
  lon: number
  aliases?: string[]
}

export type Study = {
  id: string
  title: string
  detail: string
}

export type Coordinates = { lat: number; lon: number }

export type ResolvedPoint = {
  title: string
  kind: string
  lat: number
  lon: number
  named: boolean
}

const moonSites: Site[] = [
  { name: 'Shackleton', kind: 'South pole', lat: -89.67, lon: 129.78, aliases: ['south pole', 'artemis'] },
  { name: 'Tranquility Base', kind: 'Apollo 11', lat: 0.67416, lon: 23.47314, aliases: ['apollo 11', 'tranquillity', 'sea of tranquility'] },
  { name: 'Taurus–Littrow', kind: 'Apollo 17', lat: 20.1911, lon: 30.7723, aliases: ['apollo 17', 'taurus littrow'] },
  { name: 'Tycho', kind: 'Crater', lat: -43.31, lon: -11.36 },
  { name: 'South Pole–Aitken', kind: 'Basin', lat: -53, lon: -169, aliases: ['spa', 'aitken'] },
  { name: 'Nobile', kind: 'Artemis region', lat: -85.28, lon: 53.27, aliases: ['artemis', 'south pole'] },
  { name: 'Ocean of Storms', kind: 'Apollo 12', lat: -3.0128, lon: -23.4219, aliases: ['apollo 12', 'mare insularum'] },
  { name: 'Fra Mauro', kind: 'Apollo 14', lat: -3.64589, lon: -17.47194, aliases: ['apollo 14'] },
  { name: 'Hadley–Apennine', kind: 'Apollo 15', lat: 26.13239, lon: 3.6333, aliases: ['apollo 15', 'hadley', 'apennine'] },
  { name: 'Descartes Highlands', kind: 'Apollo 16', lat: -8.9734, lon: 15.5011, aliases: ['apollo 16', 'descartes'] },
  { name: 'Copernicus', kind: 'Crater', lat: 9.62, lon: -20.08 },
  { name: 'Aristarchus', kind: 'Crater', lat: 23.73, lon: -47.49 },
  { name: 'Cabeus', kind: 'LCROSS', lat: -85.33, lon: -42.13, aliases: ['south pole', 'lcross'] },
  { name: 'Haworth', kind: 'Polar crater', lat: -87.5, lon: -5.2, aliases: ['south pole'] },
  { name: 'de Gerlache', kind: 'Polar crater', lat: -88.5, lon: -87.1, aliases: ['south pole', 'gerlache'] },
  { name: 'Schrödinger', kind: 'Basin', lat: -75, lon: 132.4, aliases: ['schrodinger'] },
  { name: 'Mare Imbrium', kind: 'Mare', lat: 32.8, lon: -15.6, aliases: ['imbrium', 'sea of rains'] },
  { name: 'Mare Serenitatis', kind: 'Mare', lat: 28, lon: 17.5, aliases: ['serenitatis', 'sea of serenity'] },
  { name: 'Mare Tranquillitatis', kind: 'Mare', lat: 8.5, lon: 31.4, aliases: ['tranquillitatis', 'sea of tranquility'] },
  { name: 'Orientale', kind: 'Basin', lat: -19.4, lon: -92.8 },
]

const marsSites: Site[] = [
  { name: 'Jezero', kind: 'Perseverance', lat: 18.4447, lon: 77.4508, aliases: ['perseverance', 'jezero crater', 'octavia e. butler'] },
  { name: 'Gale', kind: 'Curiosity', lat: -4.5895, lon: 137.4417, aliases: ['curiosity', 'gale crater', 'mount sharp', 'bradbury'] },
  { name: 'Olympus Mons', kind: 'Volcano', lat: 18.65, lon: -133.8, aliases: ['olympus'] },
  { name: 'Valles Marineris', kind: 'Canyon', lat: -13.9, lon: -59.2, aliases: ['marineris', 'mariner valley'] },
  { name: 'Hellas Planitia', kind: 'Basin', lat: -42.4, lon: 70.5, aliases: ['hellas'] },
  { name: 'Syrtis Major', kind: 'Dark plain', lat: 8.4, lon: 69.5, aliases: ['syrtis'] },
  { name: 'Meridiani Planum', kind: 'Opportunity', lat: -1.9462, lon: -5.5266, aliases: ['opportunity', 'meridiani'] },
  { name: 'Gusev', kind: 'Spirit', lat: -14.5684, lon: 175.4726, aliases: ['spirit', 'gusev crater'] },
  { name: 'Elysium Planitia', kind: 'InSight', lat: 4.5024, lon: 135.6234, aliases: ['insight', 'elysium'] },
  { name: 'Utopia Planitia', kind: 'Zhurong', lat: 25.066, lon: 109.925, aliases: ['zhurong', 'utopia'] },
  { name: 'Chryse Planitia', kind: 'Viking 1', lat: 22.697, lon: -47.947, aliases: ['viking 1', 'viking', 'chryse'] },
  { name: 'Viking 2 Site', kind: 'Utopia Planitia', lat: 47.64, lon: 134.29, aliases: ['viking 2', 'viking'] },
]

export const SITES: Record<Planet, Site[]> = { moon: moonSites, mars: marsSites }

// Moon: the work Earth labs and Artemis planning actually center on.
// Mars: the first five science objectives in the 2025 National Academies
// report "A Science Strategy for the Human Exploration of Mars".
export const STUDIES: Record<Planet, Study[]> = {
  moon: [
    { id: 'ice', title: 'Polar water ice', detail: 'Ice in craters the Sun never reaches. Mapped by LRO, then tested in Earth labs.' },
    { id: 'origin', title: 'Origin of the Moon', detail: 'Apollo samples kept on Earth, and the giant-impact model built from them.' },
    { id: 'spa', title: 'South Pole–Aitken', detail: 'The oldest, deepest basin. The sample Earth laboratories want most.' },
    { id: 'regolith', title: 'Regolith resources', detail: 'Oxygen and metals from the soil, rehearsed with lunar simulant on Earth.' },
    { id: 'quakes', title: 'Moonquakes', detail: 'Apollo seismometers. The deep interior is still read from Earth.' },
  ],
  mars: [
    { id: 'life', title: 'Search for life', detail: 'First objective in the 2025 National Academies Mars strategy: past or present life.' },
    { id: 'water', title: 'Water and CO₂', detail: 'Where the rivers, ice, and the thick atmosphere went.' },
    { id: 'geology', title: 'Geologic record', detail: 'Volcanoes, impacts, and the layered rocks rovers send home to Earth.' },
    { id: 'crew', title: 'Effect on crew', detail: 'How the Martian environment changes body, mind, and a team. Ranked fourth.' },
    { id: 'dust', title: 'Dust storms', detail: 'What starts the storms that wrap the whole planet. Ranked fifth.' },
  ],
}

const RADIUS_KM: Record<Planet, number> = { moon: 1737.4, mars: 3389.5 }

function normalizeLongitude(lon: number): number | null {
  if (lon < -180 || lon > 360) return null
  if (lon > 180) return lon - 360
  return lon
}

export function parseCoordinates(raw: string): Coordinates | null {
  const text = raw.trim().replace(/[º˚]/g, '°').replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!text) return null

  const withHemisphere = text.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([ns])\s+(-?\d+(?:\.\d+)?)\s*°?\s*([ew])$/i)
  if (withHemisphere) {
    let lat = Math.abs(Number(withHemisphere[1]))
    let lon = Math.abs(Number(withHemisphere[3]))
    if (withHemisphere[2].toUpperCase() === 'S') lat = -lat
    if (withHemisphere[4].toUpperCase() === 'W') lon = -lon
    if (lat < -90 || lat > 90) return null
    const normalized = normalizeLongitude(lon)
    if (normalized == null) return null
    return { lat, lon: normalized }
  }

  if (/[a-z]/i.test(text)) return null
  const numbers = text.match(/-?\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length !== 2) return null
  const lat = Number(numbers[0])
  const lon = Number(numbers[1])
  if (lat < -90 || lat > 90) return null
  const normalized = normalizeLongitude(lon)
  if (normalized == null) return null
  return { lat, lon: normalized }
}

function trimNumber(value: number): string {
  return Math.abs(value).toFixed(3).replace(/\.?0+$/, '')
}

export function formatCoordinates(lat: number, lon: number, planet: Planet): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const latitude = `${trimNumber(lat)}°${ns}`
  if (planet === 'mars') {
    const east = ((lon % 360) + 360) % 360
    return `${latitude}, ${trimNumber(east)}°E`
  }
  const ew = lon >= 0 ? 'E' : 'W'
  return `${latitude}, ${trimNumber(lon)}°${ew}`
}

export function distanceKm(planet: Planet, a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * RADIUS_KM[planet] * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function searchSites(planet: Planet, query: string): Site[] {
  const q = query.trim().toLowerCase()
  const sites = SITES[planet]
  if (!q) return sites.slice(0, 6)
  return sites
    .map((site, index) => {
      const name = site.name.toLowerCase()
      const haystack = [name, site.kind.toLowerCase(), ...(site.aliases ?? []).map(alias => alias.toLowerCase())]
      let score = 0
      if (name === q) score = 100
      else if (name.startsWith(q)) score = 80
      else if (name.includes(q)) score = 60
      else if (haystack.some(part => part.includes(q))) score = 40
      return { site, index, score }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)
    .map(item => item.site)
}

export function nearestSites(planet: Planet, point: Coordinates, limit = 3): Array<Site & { km: number }> {
  return SITES[planet]
    .map(site => ({ ...site, km: distanceKm(planet, point, site) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
}

export function resolvePoint(planet: Planet | null, query: string): ResolvedPoint | null {
  if (!planet) return null
  const trimmed = query.trim()
  if (!trimmed) return null
  const folded = trimmed.toLowerCase()
  const site = SITES[planet].find(item =>
    item.name.toLowerCase() === folded
    || item.aliases?.some(alias => alias.toLowerCase() === folded))
  if (site) return { title: site.name, kind: site.kind, lat: site.lat, lon: site.lon, named: true }
  const coords = parseCoordinates(trimmed)
  if (!coords) return null
  const [nearest] = nearestSites(planet, coords, 1)
  if (nearest && nearest.km < 15) {
    return { title: nearest.name, kind: nearest.kind, lat: coords.lat, lon: coords.lon, named: false }
  }
  return { title: 'Custom point', kind: 'Coordinates', lat: coords.lat, lon: coords.lon, named: false }
}

export function studiesFor(planet: Planet | null): Study[] {
  return planet ? STUDIES[planet] : []
}
