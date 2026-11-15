import { createError } from 'nuxt/server'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { TerrainBody, TerrainResults, Weights } from '../../shared/terrain'

// Run the same worker as the Atlas without sending its elevation packs to the browser.
const bootstrap = `
const {parentPort, workerData} = require('node:worker_threads')
const {readFileSync, createReadStream} = require('node:fs')
const {join} = require('node:path')
const {Readable} = require('node:stream')
const {gunzipSync} = require('node:zlib')
const {directory} = workerData
const read = (file) => readFileSync(join(directory, file), 'utf8')
const manifest = JSON.parse(read('relief/index.json'))
const screen = gunzipSync(readFileSync(join(directory, 'relief/field-screen-v1.gz')))
if (screen.length !== manifest.worlds.earth.count) throw new Error('Invalid field screen')
const fetch = async (file) => new Response(Readable.toWeb(createReadStream(join(directory, file))))
const scope = {postMessage: (result) => {
  if (result.kind !== 'results') {
    if (result.kind === 'error') parentPort.postMessage(result)
    return
  }
  const {earth} = manifest.worlds
  parentPort.postMessage({
    ...result, step: manifest.step,
    earth: {label: earth.label, resolution: earth.resolution, radius: earth.radius},
    source: sourceWindow,
  })
}}
let sourceWindow
new Function('fetch', 'self', read('relief-codec.js') + '\\n' +
  read('relief-worker.js').replace('importScripts("relief-codec.js");', '') +
  '\\nself.cellCenter = point;')(fetch, scope)
parentPort.on('message', ({id, body, lat, lon, weights}) => {
  const {radius, rows, label, resolution} = manifest.worlds[body]
  const radians = Math.PI / 180
  const phi = lat * radians
  const longitude = ((lon + 180) % 360 + 360) % 360 - 180
  const j = Math.floor(radius * phi / manifest.step)
  const i = Math.abs(lat) === 90 ? 0 : Math.floor(radius * longitude * radians * Math.cos(phi) / manifest.step)
  const row = rows[rows[0][0] - j]
  if (!row || i < -row[1] || i >= row[1]) return parentPort.postMessage({id, kind: 'error'})
  const position = row[2] + row[1] + i
  sourceWindow = {...scope.cellCenter(rows, radius, manifest.step, position), label, resolution}
  scope.onmessage({data: {id, body, position, weights, screen}})
})
`

let worker: Worker | undefined
let searchQueue: Promise<unknown> = Promise.resolve()
let pending = 0

async function startWorker() {
  const directory = resolve(process.env.TERRAIN_ATLAS_PATH || '../../sites/atlas-10/dist')
  await access(resolve(directory, 'relief/index.json'))
  return new Worker(bootstrap, { eval: true, workerData: { directory } })
}

async function runSearch(body: TerrainBody, lat: number, lon: number, weights: Weights): Promise<TerrainResults> {
  const active = worker ??= await startWorker()
  return new Promise((accept, reject) => {
    const timeout = setTimeout(() => fail(new Error('Terrain search timed out')), 45_000)
    function cleanup() {
      clearTimeout(timeout)
      active.off('message', receive)
      active.off('error', fail)
      active.off('exit', onExit)
    }
    function fail(error: Error) {
      cleanup()
      worker = undefined
      void active.terminate()
      reject(error)
    }
    function onExit() {
      fail(new Error('Terrain worker exited'))
    }
    function receive(message: TerrainResults & { kind: string }) {
      if (message.kind !== 'results') return fail(new Error('Terrain index could not be read'))
      cleanup()
      const { matches, criteria, landCount, eligibleCount, query, step, size, source, earth } = message
      accept({ matches: matches.map(({ position, lat, lon, score, error, range, slope, roughness, rotation, usa, values }) =>
        ({ position, lat, lon, score, error, range, slope, roughness, rotation, usa, values })),
      criteria, landCount, eligibleCount, query, step, size, source, earth, weights })
    }
    active.on('message', receive)
    active.on('error', fail)
    active.on('exit', onExit)
    active.postMessage({ id: 1, body, lat, lon, weights })
  })
}

export function searchTerrain(body: TerrainBody, lat: number, lon: number, weights: Weights) {
  if (pending >= 8) throw createError({ statusCode: 429, statusMessage: 'Terrain search is busy' })
  pending++
  const search = searchQueue.then(() => runSearch(body, lat, lon, weights))
  searchQueue = search.catch(() => undefined)
  return search.finally(() => { pending-- })
}
