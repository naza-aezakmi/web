export type TerrainBody = 'moon' | 'mars'

export const featureIds = ['profile', 'range', 'slope', 'roughness'] as const
export type Feature = typeof featureIds[number]
export type Weights = Record<Feature, number>

export type Metrics = { range: number; slope: number; roughness: number }
export type TerrainMatch = Metrics & {
  position: number
  lat: number
  lon: number
  score: number
  error: number
  rotation: number
  values: number[]
  usa: boolean
}
export type TerrainResults = {
  matches: TerrainMatch[]
  criteria: Metrics
  landCount: number
  eligibleCount: number
  query: number[]
  step: number
  size: number
  source: { lat: number; lon: number; label: string; resolution: number }
  earth: { label: string; resolution: number; radius: number }
  prioritySource?: 'ai' | 'default' | 'preset'
  weights: Weights
}
