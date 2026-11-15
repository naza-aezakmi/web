export type TerrainBody = 'moon' | 'mars'

export const featureIds = ['profile', 'range', 'slope', 'roughness'] as const
export type Feature = typeof featureIds[number]
export type Weights = Record<Feature, number>

export type Metrics = { range: number; slope: number; roughness: number }
export type CandidateExplanation = {
  method: 'exact_interventional_shap_additive_score'
  background: string
  background_size: number
  baseline_score: number
  score: number
  features: { feature: Feature; weight: number; penalty: number; baseline_penalty: number; shap_value: number }[]
}
export type TerrainMatch = Metrics & {
  position: number
  lat: number
  lon: number
  score: number
  error: number
  rotation: number
  values: number[]
  usa: boolean
  country?: string | null
  country_code?: string | null
  explanation?: CandidateExplanation | null
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

export type EnvironmentPassport = {
  body: 'earth' | TerrainBody
  status: 'available' | 'partial' | 'unavailable'
  metrics: { id: string; label: string; value: number | null; unit: string; description: string }[]
  source: { label: string; url: string; period: string } | null
  sampled_location: { lat: number; lon: number; note: string } | null
  coverage?: { valid_bins: number; total_bins: number }
  notes: string[]
}
export type EnvironmentPair = {
  reference: EnvironmentPassport
  earth: EnvironmentPassport
  used_in_ranking: false
  comparison_note: string
}
