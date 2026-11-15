import { createError, defineEventHandler, readBody } from 'nuxt/server'
import { rankWeights } from '../../shared/terrain'
import { rankCustomStudy } from '../utils/terrain-prompt'
import { searchTerrain } from '../utils/terrain-worker'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { planet = 'moon', lat, lon, priorities, objective } = body ?? {}
  if ((planet !== 'moon' && planet !== 'mars') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || lon < -180 || lon > (planet === 'mars' ? 360 : 180)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a supported planet and valid coordinates' })
  }
  const custom = typeof objective === 'string' && objective.trim() ? objective.trim().slice(0, 600) : ''
  const order = custom ? await rankCustomStudy(custom) : null
  const result = await searchTerrain(planet, lat, lon, rankWeights(order ?? priorities)).catch((error) => {
    if (error.statusCode === 429) throw error
    throw createError({ statusCode: 503, statusMessage: 'Terrain index is unavailable' })
  })
  return { ...result, prioritySource: custom ? (order ? 'ai' : 'default') : 'preset' }
})
