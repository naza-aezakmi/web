import * as THREE from 'three'
import type { Planet } from '~/data/places'

export const trekLayers = {
  moon: 'Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02',
  mars: 'Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m',
}

type Tile = {
  level: number
  seen: number
  wanted: boolean
  mesh?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
}

type TileView = {
  level: number
  preload: boolean
  center: THREE.Vector3
  radius: number
  reach: number
}

export function createSphericalTiles(planet: Planet, sphere: THREE.Mesh, invalidate: () => void) {
  const tiles = new Map<string, Tile>()
  const loader = new THREE.TextureLoader()
  const url = `https://trek.nasa.gov/tiles/${trekLayers[planet]}/1.0.0/default/default028mm`
  let pending = 0
  let lastRefresh = -Infinity
  let lastLevel = -1

  function finishLoad() {
    pending--
    lastRefresh = -Infinity
    invalidate()
  }

  function load(level: number, row: number, column: number, key: string, now: number) {
    const tile: Tile = { level, seen: now, wanted: true }
    tiles.set(key, tile)
    pending++
    loader.load(`${url}/${level}/${row}/${column}.jpg`, (texture) => {
      finishLoad()
      if (tiles.get(key) !== tile) {
        texture.dispose()
        return
      }

      const rows = 2 ** level
      const step = Math.PI / rows
      const geometry = new THREE.SphereGeometry(
        1.0006, Math.max(4, 128 / rows), Math.max(4, 128 / rows),
        column * step, step, row * step, step,
      )
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        roughness: 1,
      })
      tile.mesh = new THREE.Mesh(geometry, material)
      tile.mesh.renderOrder = level + 10
      sphere.add(tile.mesh)
    }, undefined, finishLoad)
  }

  function remove(key: string, tile: Tile) {
    if (tile.mesh) {
      sphere.remove(tile.mesh)
      tile.mesh.geometry.dispose()
      tile.mesh.material.map?.dispose()
      tile.mesh.material.dispose()
    }
    tiles.delete(key)
  }

  function update(view: TileView | null, now: number, fade: number) {
    const currentLevel = view?.level ?? -1
    if (currentLevel !== lastLevel || now - lastRefresh >= 85) {
      lastRefresh = now
      lastLevel = currentLevel
      for (const tile of tiles.values()) tile.wanted = false
      if (view) {
        const latitude = Math.asin(THREE.MathUtils.clamp(view.center.y, -1, 1))
        const longitude = Math.atan2(view.center.z, -view.center.x)
        const extent = Math.asin(Math.min(1, view.reach / Math.max(1, view.radius)))
        const sinLatitude = Math.sin(latitude)
        const cosLatitude = Math.cos(latitude)

        // Both bundled base mosaics have the resolution of level 3.
        const firstLevel = 4
        for (let level = firstLevel; level <= view.level + Number(view.preload); level++) {
          const ahead = level > view.level
          const rows = 2 ** level
          const step = Math.PI / rows
          // At the next zoom step the view covers less surface. Keep a ring
          // around that area warm so a short drag doesn't cause a cold load.
          const margin = (ahead ? extent * .6 : extent) + step
          const first = Math.max(0, Math.floor((Math.PI / 2 - latitude - margin) / step))
          const last = Math.min(rows - 1, Math.floor((Math.PI / 2 - latitude + margin) / step))
          const cutoff = Math.cos(Math.min(Math.PI, margin))
          const candidates: { key: string; row: number; column: number; score: number }[] = []

          for (let row = first; row <= last; row++) {
            const lat = Math.PI / 2 - (row + .5) * step
            const a = Math.sin(lat) * sinLatitude
            const b = Math.cos(lat) * cosLatitude
            for (let column = 0; column < rows * 2; column++) {
              const score = a + b * Math.cos((column + .5) * step - longitude)
              if (score >= cutoff) candidates.push({ key: `${level}/${row}/${column}`, row, column, score })
            }
          }

          candidates.sort((a, b) => b.score - a.score)
          for (const { key, row, column } of candidates.slice(0, ahead ? 12 : 72)) {
            const tile = tiles.get(key)
            if (tile) {
              tile.wanted = true
              tile.seen = now
            } else if (pending < (ahead ? 4 : 16)) {
              load(level, row, column, key, now)
            }
          }
        }
      }
    }

    let animating = false
    for (const [key, tile] of tiles) {
      if (tile.mesh) {
        const active = view && tile.level <= view.level && tile.wanted
        const opacity = tile.mesh.material.opacity
        tile.mesh.material.opacity = active ? Math.min(1, opacity + fade) : Math.max(0, opacity - fade)
        tile.mesh.visible = tile.mesh.material.opacity > 0
        if (tile.mesh.material.opacity !== (active ? 1 : 0)) animating = true
      }
      if (!tile.wanted && now - tile.seen > 3500) remove(key, tile)
    }
    return animating
  }

  return {
    update,
    dispose: () => { for (const [key, tile] of tiles) remove(key, tile) },
  }
}
