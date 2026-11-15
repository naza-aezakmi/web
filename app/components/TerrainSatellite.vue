<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TerrainMatch } from '../../shared/terrain'

const props = defineProps<{ site: TerrainMatch; step: number; radius: number }>()
const service = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
const adjustment = ref(0)
const failures = ref(0)
watch(() => props.site.position, () => { adjustment.value = 0; failures.value = 0 })

const radians = Math.PI / 180
const polar = computed(() => Math.abs(props.site.lat) > 84.9)
const zoom = computed(() => Math.max(2, Math.floor(12 + Math.log2(Math.cos(props.site.lat * radians))) + adjustment.value))
const map = computed(() => {
  if (polar.value) return null
  const count = 2 ** zoom.value
  const pixels = count * 256
  const x = (props.site.lon + 180) / 360 * pixels
  function y(latitude: number) {
    return (1 - Math.asinh(Math.tan(Math.max(-85.051128, Math.min(85.051128, latitude)) * radians)) / Math.PI) / 2 * pixels
  }
  const centerY = y(props.site.lat)
  const left = x - 400
  const top = centerY - 300
  const tiles = []
  for (let i = Math.floor(left / 256); i <= Math.floor((left + 800) / 256); i++) {
    for (let j = Math.max(0, Math.floor(top / 256)); j < count && j <= Math.floor((top + 600) / 256); j++) {
      tiles.push({ url: `${service}/tile/${zoom.value}/${j}/${(i % count + count) % count}`, x: i * 256 - left, y: j * 256 - top })
    }
  }

  // Same spherical projection as the indexed 5 × 5 elevation windows.
  const half = props.step / 2
  const phi = props.site.lat * radians
  const angle = Math.SQRT2 * half / props.radius
  const offset = Math.sin(angle) / Math.SQRT2
  const polygon = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([east, north]) => {
    const radial = Math.cos(phi) * Math.cos(angle) - Math.sin(phi) * north! * offset
    const z = Math.sin(phi) * Math.cos(angle) + Math.cos(phi) * north! * offset
    const latitude = Math.atan2(z, Math.hypot(radial, east! * offset)) / radians
    const dx = Math.atan2(east! * offset, radial) / (2 * Math.PI) * pixels
    return `${400 + dx},${y(latitude) - top}`
  }).join(' ')
  return { tiles, polygon }
})

function changeZoom(delta: number) {
  adjustment.value = Math.min(2, Math.max(-2, adjustment.value + delta))
  failures.value = 0
}
</script>

<template>
  <figure class="satellite">
    <div v-if="map" class="satellite__frame">
      <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Satellite map with the ranked terrain window outlined">
        <image v-for="tile in map.tiles" :key="tile.url + tile.x" :href="tile.url" :x="tile.x" :y="tile.y"
          width="256" height="256" @error="failures++" />
        <polygon :points="map.polygon" fill="#8dc9ff" fill-opacity=".17" stroke="#bde5ff" stroke-width="2" vector-effect="non-scaling-stroke" />
        <circle cx="400" cy="300" r="4.5" fill="#fff" stroke="#192e45" stroke-width="2" />
      </svg>
      <div class="satellite__zoom" aria-label="Satellite zoom" role="group">
        <button type="button" aria-label="Zoom in" :disabled="adjustment === 2" @click="changeZoom(1)">+</button>
        <button type="button" aria-label="Zoom out" :disabled="adjustment === -2" @click="changeZoom(-1)">−</button>
      </div>
      <p v-if="failures" class="satellite__notice">Some imagery tiles are unavailable.</p>
    </div>
    <p v-else class="satellite__notice">This site lies beyond the polar coverage of the satellite basemap.</p>
    <figcaption>Outlined terrain window · {{ step / 1000 }} × {{ step / 1000 }} km
      <a :href="service" target="_blank" rel="noopener noreferrer">Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community ↗</a>
    </figcaption>
  </figure>
</template>

<style scoped>
.satellite { margin: 0; display: flex; flex-direction: column; }
.satellite__frame { position: relative; background: #171b20; border: 1px solid #ffffff26; border-radius: 22px; overflow: hidden; }
.satellite svg { display: block; width: 100%; aspect-ratio: 4 / 3; }
@media (min-width: 761px) {
  .satellite__frame { flex: 1; min-height: 0; }
  .satellite svg { position: absolute; inset: 0; height: 100%; aspect-ratio: auto; }
}
.satellite__zoom { position: absolute; top: 12px; right: 12px; display: grid; overflow: hidden; border: 1px solid #ffffff44; border-radius: 12px; }
.satellite__zoom button { width: 38px; height: 36px; background: #141414e8; color: white; border: 0; font-size: 20px; cursor: pointer; }
.satellite__zoom button + button { border-top: 1px solid #ffffff30; }
.satellite__zoom button:disabled { color: #858585; cursor: default; }
.satellite__notice { padding: 8px 12px; color: #e0e3e7; background: #171b20; border-radius: 12px; font-size: .82rem; }
.satellite__frame .satellite__notice { position: absolute; left: 10px; bottom: 10px; margin: 0; }
.satellite figcaption { display: flex; justify-content: space-between; gap: 6px 16px; flex-wrap: wrap; padding: 10px 2px; color: #c2c8d0; font-size: .75rem; }
.satellite a { color: inherit; }
</style>
