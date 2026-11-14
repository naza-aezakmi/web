<template>
  <canvas ref="canvasRef" class="starfield" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

type Star = {
  x: number
  y: number
  radius: number
  opacity: number
  phase: number
  speed: number
  depth: number
  bright: boolean
}

const canvasRef = ref<HTMLCanvasElement | null>(null)

let frame = 0
let width = 0
let height = 0
let stars: Star[] = []
let nebula: HTMLCanvasElement | null = null
let context: CanvasRenderingContext2D | null = null
let reducedMotion: MediaQueryList | null = null
let pointerX = 0
let pointerY = 0
let easingX = 0
let easingY = 0
let lastTime = 0

const random = (min: number, max: number) => min + Math.random() * (max - min)

function paintNebula() {
  nebula = document.createElement('canvas')
  nebula.width = Math.ceil(width + 100)
  nebula.height = Math.ceil(height + 100)
  const ctx = nebula.getContext('2d')
  if (!ctx) return

  const base = ctx.createLinearGradient(0, 0, width, height)
  base.addColorStop(0, '#070708')
  base.addColorStop(0.5, '#030304')
  base.addColorStop(1, '#090707')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, nebula.width, nebula.height)

  const clouds: Array<[number, number, number, string, number]> = [
    [0.19, 0.53, 0.5, '46, 45, 47', 0.19],
    [0.4, 0.27, 0.36, '31, 30, 34', 0.15],
    [0.79, 0.56, 0.49, '83, 45, 36', 0.12],
    [0.67, 0.86, 0.38, '55, 39, 40', 0.09],
    [0.48, 1.02, 0.54, '38, 37, 39', 0.1],
  ]

  ctx.globalCompositeOperation = 'screen'
  for (const [x, y, size, rgb, alpha] of clouds) {
    const radius = Math.max(width, height) * size
    const glow = ctx.createRadialGradient(
      width * x + 50,
      height * y + 50,
      0,
      width * x + 50,
      height * y + 50,
      radius,
    )
    glow.addColorStop(0, `rgba(${rgb}, ${alpha})`)
    glow.addColorStop(0.4, `rgba(${rgb}, ${alpha * 0.4})`)
    glow.addColorStop(1, `rgba(${rgb}, 0)`)
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, nebula.width, nebula.height)
  }
  ctx.globalCompositeOperation = 'source-over'
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas) return
  width = window.innerWidth
  height = window.innerHeight
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context = canvas.getContext('2d', { alpha: false })
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  const count = Math.min(310, Math.max(135, Math.round((width * height) / 5200)))
  stars = Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: index % 17 === 0 ? random(1.2, 1.9) : random(0.35, 1.15),
    opacity: random(0.17, 0.72),
    phase: random(0, Math.PI * 2),
    speed: random(0.35, 1.25),
    depth: random(0.2, 1),
    bright: index % 23 === 0,
  }))
  paintNebula()
  draw(performance.now())
}

function draw(time: number) {
  const ctx = context
  if (!ctx) return
  const still = reducedMotion?.matches ?? false
  const t = still ? 0 : time * 0.001
  easingX += (pointerX - easingX) * 0.018
  easingY += (pointerY - easingY) * 0.018

  if (nebula) {
    const driftX = still ? 0 : Math.sin(t * 0.09) * 15
    const driftY = still ? 0 : Math.cos(t * 0.07) * 12
    ctx.drawImage(nebula, -50 + driftX, -50 + driftY)
  } else {
    ctx.fillStyle = '#030304'
    ctx.fillRect(0, 0, width, height)
  }

  for (const star of stars) {
    const shimmer = still ? 1 : 0.77 + Math.sin(t * star.speed * 2 + star.phase) * 0.23
    const x = star.x + easingX * star.depth * 13
    const y = star.y + easingY * star.depth * 9
    const alpha = star.opacity * shimmer
    ctx.beginPath()
    ctx.fillStyle = `rgba(240, 238, 233, ${alpha})`
    ctx.arc(x, y, star.radius, 0, Math.PI * 2)
    ctx.fill()

    if (star.bright) {
      ctx.strokeStyle = `rgba(235, 228, 218, ${alpha * 0.3})`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x - 5, y)
      ctx.lineTo(x + 5, y)
      ctx.moveTo(x, y - 5)
      ctx.lineTo(x, y + 5)
      ctx.stroke()
    }
  }

  if (!still) {
    // One quiet meteor crosses the background every few seconds.
    const cycle = t % 9.5
    if (cycle > 6.6 && cycle < 7.4) {
      const progress = (cycle - 6.6) / 0.8
      const x = width * (0.76 - progress * 0.32)
      const y = height * (0.09 + progress * 0.24)
      const trail = ctx.createLinearGradient(x, y, x + 75, y - 58)
      trail.addColorStop(0, `rgba(239, 234, 225, ${Math.sin(progress * Math.PI) * 0.65})`)
      trail.addColorStop(1, 'rgba(239, 234, 225, 0)')
      ctx.beginPath()
      ctx.strokeStyle = trail
      ctx.lineWidth = 1.2
      ctx.moveTo(x, y)
      ctx.lineTo(x + 75, y - 58)
      ctx.stroke()
    }
  }

  lastTime = time
}

function animate(time: number) {
  draw(time)
  frame = window.requestAnimationFrame(animate)
}

function updateMotion() {
  window.cancelAnimationFrame(frame)
  if (reducedMotion?.matches) draw(lastTime)
  else frame = window.requestAnimationFrame(animate)
}

function onPointerMove(event: PointerEvent) {
  pointerX = event.clientX / Math.max(width, 1) - 0.5
  pointerY = event.clientY / Math.max(height, 1) - 0.5
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  reducedMotion.addEventListener('change', updateMotion)
  updateMotion()
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onPointerMove)
  reducedMotion?.removeEventListener('change', updateMotion)
})
</script>

<style scoped>
.starfield {
  position: fixed;
  inset: 0;
  display: block;
  pointer-events: none;
}
</style>
