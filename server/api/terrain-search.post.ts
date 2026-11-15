import { createError, defineEventHandler, readBody } from 'nuxt/server'
import type { TerrainResults } from '../../shared/terrain'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { planet = 'moon', lat, lon, priorities, objective } = body ?? {}
  if ((planet !== 'moon' && planet !== 'mars') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || lon < -180 || lon > (planet === 'mars' ? 360 : 180)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a supported planet and valid coordinates' })
  }
  try {
    const response = await fetch(process.env.TERRAIN_API_URL || 'https://api.nasa.aezakmi.org/terrain/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planet, lat, lon, priorities, objective }),
      signal: AbortSignal.timeout(65_000),
    })
    if (!response.ok) throw createError({ statusCode: response.status })
    return await response.json() as TerrainResults
  } catch (error: any) {
    const status = error?.statusCode ?? error?.status
    throw createError({
      statusCode: status === 429 ? 429 : 503,
      statusMessage: status === 429 ? 'Terrain search is busy' : 'Terrain API is unavailable',
    })
  }
})
