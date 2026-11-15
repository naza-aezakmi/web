import { createError, defineEventHandler, readBody } from 'nuxt/server'
import type { EnvironmentPair } from '../../shared/terrain'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { planet, lat, lon, earth_lat, earth_lon } = body ?? {}
  if ((planet !== 'moon' && planet !== 'mars') || ![lat, lon, earth_lat, earth_lon].every(Number.isFinite) || Math.abs(lat) > 90 || lon < -180 || lon > 360 || Math.abs(earth_lat) > 90 || Math.abs(earth_lon) > 180) {
    throw createError({ statusCode: 400, statusMessage: 'Enter valid source and Earth coordinates' })
  }
  const endpoint = process.env.TERRAIN_CONTEXT_API_URL || (process.env.TERRAIN_API_URL || 'https://api.nasa.aezakmi.org/terrain/search').replace(/\/search\/?$/, '/context')
  try {
    return await $fetch<EnvironmentPair>(endpoint, { method: 'POST', body: { planet, lat, lon, earth_lat, earth_lon }, timeout: 32_000 })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Environmental context is temporarily unavailable' })
  }
})
