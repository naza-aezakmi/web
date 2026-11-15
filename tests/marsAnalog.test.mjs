import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gridIndex, lookupMars, loadMarsModel } from '../shared/marsAnalog.ts'

const catalog = JSON.parse(readFileSync(new URL('../public/ml/mars/mars_types.json', import.meta.url)))
const labels = new Uint8Array(readFileSync(new URL('../public/ml/mars/mars_types_grid.bin', import.meta.url)))

test('all global cells point to a type with three named Earth candidates', () => {
  assert.equal(labels.length, 720 * 360)
  assert.equal(new Set(labels).size, 10)
  for (const type of catalog.types) {
    assert.equal(type.earth_candidates.length, 3)
    assert.ok(type.display_name)
    for (const candidate of type.earth_candidates) {
      assert.ok(candidate.location.country)
      const sum = candidate.match_explanation.comparisons.reduce((s, c) => s + c.squared_distance_contribution, 0)
      assert.ok(Math.abs(sum - candidate.distance ** 2) < 1e-7)
    }
  }
})

test('poles, longitude conventions and dateline produce valid identical catalogs', () => {
  assert.equal(gridIndex(90, -180, catalog.grid), 0)
  assert.equal(gridIndex(-90, 180, catalog.grid), 359 * 720)
  for (const lat of [-90, -45, 0, 18.44, 90]) {
    for (const lon of [-180, -133, 0, 77.45, 180]) {
      const a = lookupMars(lat, lon, catalog, labels)
      const b = lookupMars(lat, lon + 360, catalog, labels)
      assert.equal(a.terrainType.id, b.terrainType.id)
      assert.equal(a.candidates.length, 3)
      assert.deepEqual(a.climate, b.climate)
      assert.equal(a.climate.precipitation, null)
      assert.equal(a.climate.relative_humidity, null)
    }
  }
  for (const [lat, lon] of [[91, 0], [-91, 0], [NaN, 0], [0, Infinity]]) {
    assert.throws(() => lookupMars(lat, lon, catalog, labels), RangeError)
  }
})

test('failed fetch can retry and successful model is fetched only once', async () => {
  const original = globalThis.fetch
  let failed = true, requests = 0
  globalThis.fetch = async (url) => {
    requests++
    if (failed) return new Response('', { status: 503 })
    return new Response(url.endsWith('.bin') ? labels : JSON.stringify(catalog))
  }
  try {
    await assert.rejects(loadMarsModel())
    failed = false
    const a = await loadMarsModel(), b = await loadMarsModel()
    assert.strictEqual(a, b)
    assert.equal(requests, 4)
    assert.equal(a.lookup(18.44, 77.45).candidates.length, 3)
  } finally { globalThis.fetch = original }
})
