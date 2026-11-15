import marsGazetteer from "./mars-gazetteer.json"
import moonGazetteer from './moon-gazetteer.json'

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

export const TERRAIN_FEATURES = {
  profile: 'Terrain shape',
  range: 'Elevation range',
  slope: 'Slope',
  roughness: 'Surface roughness',
} as const

type TerrainFeature = keyof typeof TERRAIN_FEATURES

export type Study = {
  id: string
  title: string
  detail: string
  priorities?: TerrainFeature[]
}

export type Coordinates = { lat: number; lon: number }

export type ResolvedPoint = {
  title: string
  kind: string
  lat: number
  lon: number
  named: boolean
}

const featuredMoonSites: Site[] = [
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

// IAU-approved feature centers and diameters from the USGS Gazetteer (LOLA 2011).
export const MOON_FEATURES = (moonGazetteer as [string, string, number, number, number, number][])
  .map(([name, kind, lat, lon, diameter, id]) => ({ name, kind, lat, lon, diameter, id }))
const featuredNames = new Map(featuredMoonSites.map(site => [site.name, site]))
export const MOON_MISSIONS: Site[] = [
  ...featuredMoonSites.filter(site => site.kind.startsWith('Apollo')).map(site => ({
    ...site, name: site.kind, kind: 'Landing site', aliases: [site.name, ...(site.aliases ?? [])],
  })),
  { name: 'Chang’e 4', kind: 'Landing site', lat: -45.4561, lon: 177.5885, aliases: ["Chang'e 4", 'Yutu-2'] },
  { name: 'Chandrayaan-3', kind: 'Landing site', lat: -69.373, lon: 32.319, aliases: ['Vikram', 'Pragyan'] },
]
export const MOON_LANDMARKS = new Set(featuredNames.keys())
const officialNames = new Set(MOON_FEATURES.map(site => site.name))
const moonSites: Site[] = [
  ...featuredMoonSites.filter(site => !officialNames.has(site.name) && !site.kind.startsWith('Apollo')),
  ...MOON_MISSIONS,
  ...MOON_FEATURES.map(site => ({ ...site, aliases: featuredNames.get(site.name)?.aliases })),
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

export const MARS_LANDMARKS = marsSites
const pinnedMarsNames = new Set(MARS_LANDMARKS.map(site => site.name))
export const MARS_FEATURES = (marsGazetteer as [string, string, number, number, number, number][])
  .filter(([name]) => !pinnedMarsNames.has(name))
  .map(([name, kind, lat, lon, diameter, id]) => ({ name, kind, lat, lon, diameter, id }))

export const SITES: Record<Planet, Site[]> = { moon: moonSites, mars: [...MARS_LANDMARKS, ...MARS_FEATURES] }

export const STUDIES: Record<Planet, Study[]> = {
  moon: [
    { id: 'rover-testing', title: 'Lunar rover testing', detail: 'Prioritize slopes and uneven ground for a driving test.', priorities: ['slope', 'roughness', 'profile', 'range'] },
    { id: 'eva-training', title: 'Astronaut field training', detail: 'Prioritize the slopes and elevation changes of a walking route.', priorities: ['slope', 'range', 'profile', 'roughness'] },
    { id: 'landing-sensors', title: 'Landing sensor testing', detail: 'Prioritize landform shape and changes in elevation.', priorities: ['profile', 'range', 'slope', 'roughness'] },
    { id: 'excavation', title: 'Excavation site layout', detail: 'Prioritize ground slope and local surface unevenness.', priorities: ['slope', 'roughness', 'range', 'profile'] },
    { id: 'field-geology', title: 'Geology and sampling practice', detail: 'Prioritize similar landforms and relief along the traverse.', priorities: ['profile', 'range', 'roughness', 'slope'] },
  ],
  mars: [
    { id: 'rover-testing', title: 'Mars rover testing', detail: 'Prioritize slopes and uneven ground for a driving test.', priorities: ['slope', 'roughness', 'profile', 'range'] },
    { id: 'eva-training', title: 'Astronaut field training', detail: 'Prioritize the slopes and elevation changes of a walking route.', priorities: ['slope', 'range', 'profile', 'roughness'] },
    { id: 'landing-sensors', title: 'Landing sensor testing', detail: 'Prioritize landform shape and changes in elevation.', priorities: ['profile', 'range', 'slope', 'roughness'] },
    { id: 'excavation', title: 'Excavation site layout', detail: 'Prioritize ground slope and local surface unevenness.', priorities: ['slope', 'roughness', 'range', 'profile'] },
    { id: 'field-geology', title: 'Geology and sampling practice', detail: 'Prioritize similar landforms and relief along the traverse.', priorities: ['profile', 'range', 'roughness', 'slope'] },
  ],
}

const RADIUS_KM: Record<Planet, number> = { moon: 1737.4, mars: 3389.5 }

function normalizeLongitude(lon: number): number | null {
  if (lon < -180 || lon > 360) return null
  if (lon > 180) return lon - 360
  return lon
}

export function parseCoordinates(raw: string): Coordinates | null {
  const text = raw.trim().toLowerCase().replace(/[º˚]/g, '°').replace(/−/g, '-').replace(/,/g, ' ').replace(/\s+/g, ' ')
  const directions: Record<string, string> = { north: 'n', south: 's', east: 'e', west: 'w', 'север': 'n', 'юг': 's', 'восток': 'e', 'запад': 'w' }
  const normalizedText = text.replace(/north|south|east|west|север|юг|восток|запад/g, direction => directions[direction]!)
  const angle = String.raw`[+-]?\d+(?:\.\d+)?`
  const coordinate = String.raw`(?:([nsew])\s*(${angle})\s*°?|(${angle})\s*°?\s*([nsew]))`
  const directed = normalizedText.match(new RegExp(String.raw`^${coordinate}\s*${coordinate}$`))
  if (directed) {
    const first = directed[1] ?? directed[4]
    const second = directed[5] ?? directed[8]
    const firstValue = Math.abs(Number(directed[2] ?? directed[3]))
    const secondValue = Math.abs(Number(directed[6] ?? directed[7]))
    const firstIsLat = first === 'n' || first === 's'
    if (firstIsLat === (second === 'n' || second === 's')) return null
    const latDirection = firstIsLat ? first : second
    const lonDirection = firstIsLat ? second : first
    const lat = (firstIsLat ? firstValue : secondValue) * (latDirection === 's' ? -1 : 1)
    const lon = normalizeLongitude((firstIsLat ? secondValue : firstValue) * (lonDirection === 'w' ? -1 : 1))
    return Math.abs(lat) <= 90 && lon != null ? { lat, lon } : null
  }

  const numbers = text.match(new RegExp(String.raw`^(${angle})\s*°?\s+(${angle})\s*°?$`))
  if (!numbers) return null
  const lat = Number(numbers[1])
  const lon = Number(numbers[2])
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

function normalizeSearch(text: string): string {
  return text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '')
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + Number(a[i - 1] !== b[j - 1]))
    }
    previous = current
  }
  return previous[b.length]!
}

export function searchSites(planet: Planet, query: string): Site[] {
  const q = normalizeSearch(query)
  const sites = SITES[planet]
  if (!q) return query.trim() ? [] : sites.filter(site => site.name === (planet === 'moon' ? 'Apollo 11' : 'Jezero')).slice(0, 1)
  const apolloQuery = planet === 'moon' ? q.match(/^([a-z]+)(\d+)$/) : null
  const missionMatch = apolloQuery && editDistance(apolloQuery[1]!, 'apollo') <= 3 ? 'apollo' + apolloQuery[2] : null
  const maxEdits = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0
  return sites
    .map((site, index) => {
      const name = normalizeSearch(site.name)
      const aliases = (site.aliases ?? []).map(normalizeSearch)
      let score = 0
      if (name === q) score = 100
      else if (aliases.includes(q) || name === missionMatch) score = 90
      else if (name.startsWith(q)) score = 80
      else if (name.includes(q)) score = 60
      else if (aliases.some(alias => alias.includes(q)) || normalizeSearch(site.kind).includes(q)) score = 40
      else if (maxEdits && Math.abs(name.length - q.length) <= maxEdits) {
        const distance = editDistance(name, q)
        if (distance <= maxEdits) score = 25 - distance * 5
      }
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
  const site = SITES[planet].find(item => item.name.toLowerCase() === folded)
    ?? SITES[planet].find(item => item.aliases?.some(alias => alias.toLowerCase() === folded))
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
