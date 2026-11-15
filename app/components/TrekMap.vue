<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Planet } from '~/data/places'
import { trekLayers } from '~/utils/sphericalTiles'

const props = defineProps<{
  planet: Planet
  center: { lat: number; lon: number }
  level: number
}>()
type Coordinates = { lat: number; lon: number }
const emit = defineEmits<{ mark: [point: Coordinates & { planet: Planet }]; pan: [center: Coordinates] }>()
const surface = ref<HTMLElement | null>(null)
const origin = ref<HTMLElement | null>(null)
const size = ref({ width: 0, height: 0, anchorX: 0, anchorY: 0 })
const dragging = ref(false)
let observer: ResizeObserver | undefined
let gesture: { id: number; x: number; y: number; center: Coordinates } | null = null
const wrap = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180
const clamp = (lat: number) => Math.max(-90, Math.min(90, lat))
const texture = computed(() => props.planet === 'moon' ? '/textures/moon-color.jpg' : '/textures/mars-trek-global.webp')

const map = computed(() => {
  const rows = 2 ** props.level
  const columns = rows * 2
  const x = (wrap(props.center.lon) + 180) / 360 * columns
  const y = Math.min(rows - .000001, Math.max(0, (90 - props.center.lat) / 180 * rows))
  const tiles = []
  const { width, height, anchorX, anchorY } = size.value
  for (let row = Math.max(0, Math.floor(y - anchorY / 256)); row < Math.min(rows, Math.ceil(y + (height - anchorY) / 256)); row++) {
    for (let col = Math.floor(x - anchorX / 256); col < Math.ceil(x + (width - anchorX) / 256); col++) {
      const wrapped = ((col % columns) + columns) % columns
      const url = `https://trek.nasa.gov/tiles/${trekLayers[props.planet]}/1.0.0/default/default028mm/${props.level}/${row}/${wrapped}.jpg`
      tiles.push({ row, col, wrapped, url, left: (col - x) * 256, top: (row - y) * 256 })
    }
  }
  return { tiles, x, y, rows, columns }
})

function translated(center: Coordinates, x: number, y: number) {
  const degreesPerPixel = 180 / (map.value.rows * 256)
  return { lat: center.lat - y * degreesPerPixel, lon: wrap(center.lon + x * degreesPerPixel) }
}

function start(event: PointerEvent) {
  if (gesture || event.button !== 0) return
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, center: props.center }
  surface.value?.setPointerCapture(event.pointerId)
}

function move(event: PointerEvent) {
  if (gesture?.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!dragging.value && Math.hypot(dx, dy) < 5) return
  dragging.value = true
  const center = translated(gesture.center, -dx, -dy)
  emit('pan', { ...center, lat: clamp(center.lat) })
}

function end(event: PointerEvent) {
  if (gesture?.id !== event.pointerId || !surface.value) return
  if (!dragging.value) {
    const rect = surface.value.getBoundingClientRect()
    const point = translated(props.center, event.clientX - rect.left - size.value.anchorX, event.clientY - rect.top - size.value.anchorY)
    if (Math.abs(point.lat) <= 90) emit('mark', { planet: props.planet, ...point })
  }
  cancel()
}

function cancel() {
  dragging.value = false
  gesture = null
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry && origin.value) {
      size.value = { width: entry.contentRect.width, height: entry.contentRect.height, anchorX: origin.value.offsetLeft, anchorY: origin.value.offsetTop }
    }
  })
  if (surface.value) observer.observe(surface.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section class="trek-map" aria-label="NASA Trek surface map">
    <div ref="surface" class="trek-map__tiles" :class="{ 'is-dragging': dragging }"
      @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="cancel" @lostpointercapture="cancel">
      <div class="trek-map__fallback" :style="{
        backgroundImage: 'url(' + texture + ')',
        backgroundSize: map.columns * 256 + 'px ' + map.rows * 256 + 'px',
        backgroundPosition: (size.anchorX - map.x * 256) + 'px ' + (size.anchorY - map.y * 256) + 'px',
      }" />
      <div ref="origin" class="trek-map__origin">
        <img v-for="tile in map.tiles" :key="tile.url + ':' + tile.col" :src="tile.url"
          :style="{ left: tile.left + 'px', top: tile.top + 'px' }"
          alt="" draggable="false" @error="($event.currentTarget as HTMLImageElement).style.visibility = 'hidden'" />
      </div>
      <span class="trek-map__pin" aria-hidden="true">+</span>
    </div>
    <footer><a :href="'https://trek.nasa.gov/' + planet + '/'" target="_blank" rel="noopener">NASA / JPL {{ planet === 'moon' ? 'Moon Trek' : 'Mars Trek' }} ↗</a></footer>
  </section>
</template>
