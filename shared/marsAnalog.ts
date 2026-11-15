// This file is exported from the ml repository. Edit ml/runtime, then run scripts/export.py.
export type TerrainFeatures = {
  median_slope_deg: number
  p90_slope_deg: number
  relief_p95_p05_m: number
}
export type FeatureComparison = {
  feature: keyof TerrainFeatures
  mars_prototype_value: number
  earth_value: number
  squared_distance_contribution: number
  mismatch_share: number
}
export type EarthCandidate = {
  id: string; lat: number; lon: number; distance: number
  features: TerrainFeatures
  location: { label: string; region: string; country: string; source: string }
  climate?: { air_temperature_2m_c?: number | null; precipitation_mm_day?: number | null; relative_humidity_pct?: number | null }
  landcover?: { bare_sparse_fraction: number; vegetated_fraction: number; snow_ice_fraction: number }
  match_explanation: {
    comparisons: FeatureComparison[]
    visible_partial_match: boolean
    terrain_rank_before_diversity_and_cover: number
  }
}
export type MarsTerrainType = {
  id: number; label: string; display_name: string; area_fraction: number
  features_median: TerrainFeatures; retrieval_prototype: TerrainFeatures
  earth_candidates: EarthCandidate[]
}
type ClimateGrid = {
  latitudes: number[]; longitudes: number[]
  fields: Record<string, number[][]>
  context: Record<string, number | string>
}
export type MarsCatalog = {
  version: number | string
  grid: { width: number; height: number; step_degrees: number }
  types: MarsTerrainType[]
  mars_climate?: ClimateGrid
}
export type MarsAnalogResult = {
  body: 'mars'; modelVersion: string
  point: { lat: number; lon: number }
  terrainType: Omit<MarsTerrainType, 'earth_candidates'>
  candidates: EarthCandidate[]
  climate: (Record<string, unknown> & { surface_temperature_c?: number; pressure_10m_pa?: number }) | null
  scale: { gridStepDegrees: number; descriptorRadiusKm: number }
  note: string
}
export const ANALOG_NOTE = 'Regional terrain screening. Class prototype values are not exact measurements at the clicked point. Soil properties and rover passability are not predicted.'
export function normalizeLongitude(lon: number) { return ((lon + 180) % 360 + 360) % 360 - 180 }
export function gridIndex(lat: number, lon: number, grid: MarsCatalog['grid']) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) throw new RangeError('Invalid Mars coordinates')
  const row = Math.min(grid.height - 1, Math.floor((90 - lat) / grid.step_degrees))
  const col = Math.min(grid.width - 1, Math.floor((normalizeLongitude(lon) + 180) / grid.step_degrees))
  return row * grid.width + col
}
export function lookupMars(lat: number, lon: number, catalog: MarsCatalog, labels: Uint8Array): MarsAnalogResult {
  const typeId = labels[gridIndex(lat, lon, catalog.grid)]
  const type = catalog.types.find(item => item.id === typeId)
  if (!type) throw new Error('Catalog/grid mismatch')
  const { earth_candidates: candidates, ...terrainType } = type
  let climate: MarsAnalogResult['climate'] = null
  const c = catalog.mars_climate
  if (c) {
    const nearest = (values: number[], x: number, circular = false) => values.reduce((best, v, i) => {
      const distance = (n: number) => circular ? Math.abs(normalizeLongitude(n - x)) : Math.abs(n - x)
      return distance(v) < distance(values[best]!) ? i : best
    }, 0)
    const y = nearest(c.latitudes, lat), x = nearest(c.longitudes, normalizeLongitude(lon), true)
    climate = { context: c.context, source: 'MCD 6.2 model snapshot', grid_lat: c.latitudes[y], grid_lon: c.longitudes[x], relative_humidity: null, precipitation: null }
    for (const [name, values] of Object.entries(c.fields)) climate[name] = values[y]![x]
  }
  return {
    body: 'mars', modelVersion: String(catalog.version), point: { lat, lon: normalizeLongitude(lon) },
    terrainType, candidates, climate, scale: { gridStepDegrees: catalog.grid.step_degrees, descriptorRadiusKm: 50 }, note: ANALOG_NOTE,
  }
}
let pending: Promise<{ lookup: (lat: number, lon: number) => MarsAnalogResult }> | undefined
export function loadMarsModel() {
  if (!pending) pending = (async () => {
    const [catalogResponse, gridResponse] = await Promise.all([
      fetch('/ml/mars/mars_types.json'), fetch('/ml/mars/mars_types_grid.bin'),
    ])
    if (!catalogResponse.ok || !gridResponse.ok) throw new Error('Mars model is unavailable')
    const catalog = await catalogResponse.json() as MarsCatalog
    const labels = new Uint8Array(await gridResponse.arrayBuffer())
    if (labels.length !== catalog.grid.width * catalog.grid.height || labels.some(id => !catalog.types.some(t => t.id === id))) throw new Error('Invalid Mars model grid')
    return { lookup: (lat: number, lon: number) => lookupMars(lat, lon, catalog, labels) }
  })().catch(error => { pending = undefined; throw error })
  return pending
}
