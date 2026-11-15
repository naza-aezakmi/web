<template>
  <canvas ref="canvas" class="starfield" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Quaternion, Vector3 } from 'three'
import catalog from '~/data/bright-stars.json'

const props = defineProps<{ orbit: [number, number, number, number]; parallax: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const rotation = new Quaternion()
const direction = new Vector3()
const toRadians = Math.PI / 180
const stars = catalog.map(([ra, dec, magnitude, colorIndex]) => {
  const longitude = ra * toRadians
  const latitude = dec * toRadians
  const cosLatitude = Math.cos(latitude)
  const brightness = Math.pow(10, -.2 * (magnitude + 1.46))
  return {
    direction: new Vector3(cosLatitude * Math.sin(longitude), Math.sin(latitude), cosLatitude * Math.cos(longitude)),
    radius: .65 + brightness * 1.65,
    opacity: .35 + brightness * .65,
    color: colorIndex == null ? '#ffffff' : colorIndex < .25 ? '#e0ebff' : colorIndex > .85 ? '#ffe9d2' : '#fffaf1',
    glow: magnitude <= 2.8,
  }
})

let context: CanvasRenderingContext2D | null = null
let halo: HTMLCanvasElement | null = null
let frame = 0
let width = 0
let height = 0
let pointerX = 0
let pointerY = 0
let driftX = 0
let driftY = 0
let reducedMotion = false

function createHalo() {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 32
  const ctx = sprite.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, '#ffffff70')
  gradient.addColorStop(.4, '#ffffff24')
  gradient.addColorStop(1, '#ffffff00')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  return sprite
}

function draw() {
  frame = 0
  if (!context) return
  driftX += (pointerX - driftX) * .07
  driftY += (pointerY - driftY) * .07
  context.fillStyle = '#000000'
  context.fillRect(0, 0, width, height)
  rotation.fromArray(props.orbit)
  const focalLength = height * .65

  for (const star of stars) {
    direction.copy(star.direction).applyQuaternion(rotation)
    if (direction.z <= 0) continue
    const scale = focalLength / direction.z
    const depth = .55 + star.radius * .35
    const x = width / 2 + direction.x * scale + driftX * depth * 12
    const y = height / 2 - direction.y * scale + driftY * depth * 12
    const extent = star.glow ? star.radius * 3 : star.radius
    if (x < -extent || x > width + extent || y < -extent || y > height + extent) continue
    context.globalAlpha = star.opacity
    if (star.glow && halo) context.drawImage(halo, x - extent, y - extent, extent * 2, extent * 2)
    context.fillStyle = star.color
    context.beginPath()
    context.arc(x, y, star.radius, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
  if (Math.abs(pointerX - driftX) > .002 || Math.abs(pointerY - driftY) > .002) queueDraw()
}

function queueDraw() {
  if (!frame) frame = requestAnimationFrame(draw)
}

function resize() {
  if (!canvas.value) return
  const bounds = canvas.value.getBoundingClientRect()
  width = bounds.width
  height = bounds.height
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.value.width = Math.round(width * ratio)
  canvas.value.height = Math.round(height * ratio)
  context = canvas.value.getContext('2d', { alpha: false })
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  queueDraw()
}

watch(() => props.orbit, queueDraw)
watch(() => props.parallax, active => {
  if (!active) { pointerX = 0; pointerY = 0; queueDraw() }
})
function onPointerMove(event: PointerEvent) {
  if (!props.parallax || reducedMotion || event.pointerType === 'touch') return
  pointerX = event.clientX / window.innerWidth * 2 - 1
  pointerY = event.clientY / window.innerHeight * 2 - 1
  queueDraw()
}
onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  halo = createHalo()
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onPointerMove)
})
</script>

<style scoped>
.starfield {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
