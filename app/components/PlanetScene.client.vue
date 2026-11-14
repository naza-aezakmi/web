<template>
  <div ref="container" class="planet-scene" aria-hidden="true">
    <template v-if="webglFailed">
      <div
        class="fallback-planet fallback-planet--moon"
        :class="{ 'is-selected': selected === 'moon', 'is-hidden': selected === 'mars' }"
        @click="emit('select', 'moon')"
      />
      <div
        class="fallback-planet fallback-planet--mars"
        :class="{ 'is-selected': selected === 'mars', 'is-hidden': selected === 'moon' }"
        @click="emit('select', 'mars')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'

type Planet = 'moon' | 'mars'
type Pose = { x: number; y: number; radius: number; opacity: number; turn: number }
type Body = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  material: THREE.MeshStandardMaterial
  glow: THREE.Sprite
  pose: Pose
  from: Pose
  to: Pose
  texture?: THREE.Texture
}

const props = defineProps<{ selected: Planet | null }>()
const emit = defineEmits<{ select: [value: Planet] }>()
const container = ref<HTMLElement | null>(null)
const webglFailed = ref(false)

const VISIBLE_HEIGHT = 10
const PLANETS: Planet[] = ['moon', 'mars']

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let geometry: THREE.SphereGeometry | null = null
let glowTexture: THREE.CanvasTexture | null = null
let resizeObserver: ResizeObserver | null = null
let motionQuery: MediaQueryList | null = null
let raf = 0
let lastFrame = 0
let transitionStart = 0
let transitionDuration = 0
let disposed = false
let isReducedMotion = false
let pointerDown: { x: number; y: number } | null = null
let viewport = { width: 1, height: 1 }
const bodies = {} as Record<Planet, Body>
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function clonePose(pose: Pose): Pose {
  return { ...pose }
}

function glowMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64, 64, 25, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0.62)')
  gradient.addColorStop(0.48, 'rgba(255,255,255,0.16)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

function createBody(planet: Planet): Body {
  const moon = planet === 'moon'
  const material = new THREE.MeshStandardMaterial({
    color: moon ? 0xd9dee4 : 0xe7a58b,
    roughness: 1,
    metalness: 0,
    transparent: true,
  })
  const mesh = new THREE.Mesh(geometry!, material)
  mesh.rotation.x = moon ? 0.07 : 0.19
  mesh.rotation.y = moon ? -0.9 : 0.42
  mesh.userData.planet = planet
  scene!.add(mesh)

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: moon ? 0x8aaad1 : 0xd87a49,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  glow.position.z = -0.7
  scene!.add(glow)

  const initial: Pose = { x: 0, y: 0, radius: 1, opacity: 1, turn: 0 }
  return { mesh, material, glow, pose: clonePose(initial), from: clonePose(initial), to: clonePose(initial) }
}

function loadTexture(planet: Planet, url: string) {
  new THREE.TextureLoader().load(
    url,
    texture => {
      if (disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8)
      const body = bodies[planet]
      body.texture = texture
      body.material.map = texture
      body.material.bumpMap = texture
      body.material.bumpScale = planet === 'moon' ? 0.045 : 0.025
      body.material.color.set(planet === 'moon' ? 0xffffff : 0xffd7c9)
      body.material.needsUpdate = true
      render()
    },
    undefined,
    () => {
      // The lit material above remains usable if an image is unavailable.
    },
  )
}

function pixelToWorld(px: number): number {
  return (px / viewport.height) * VISIBLE_HEIGHT
}

function point(xFraction: number, yFraction: number) {
  return {
    x: (xFraction - 0.5) * VISIBLE_HEIGHT * (viewport.width / viewport.height),
    y: (0.5 - yFraction) * VISIBLE_HEIGHT,
  }
}

function targetPose(planet: Planet): Omit<Pose, 'turn'> {
  const { width, height } = viewport
  const mobile = width < 720
  const compactMobile = mobile && height < 800
  const atRest = mobile
    ? point(0.5, planet === 'moon' ? (compactMobile ? 0.39 : 0.43) : (compactMobile ? 0.76 : 0.75))
    : point(planet === 'moon' ? 0.28 : 0.72, 0.53)
  const baseRadiusPx = mobile
    ? Math.min(width * 0.245, height * 0.135, 110)
    : Math.min(height * 0.17, width * 0.16, 190)
  const radius = pixelToWorld(baseRadiusPx * (planet === 'mars' ? 1.04 : 1))

  if (!props.selected) return { ...atRest, radius, opacity: 1 }
  if (props.selected !== planet) {
    return { ...atRest, radius: radius * 0.72, opacity: 0 }
  }

  const selectedPosition = mobile ? point(1.09, 0.96) : point(0.92, 0.81)
  const selectedRadiusPx = mobile
    ? Math.min(height * 0.31, width * 0.62)
    : Math.min(height * 0.44, width * 0.39)
  return { ...selectedPosition, radius: pixelToWorld(selectedRadiusPx), opacity: 1 }
}

function arrange(animate: boolean, spinSelected = false) {
  if (!renderer) return
  for (const planet of PLANETS) {
    const body = bodies[planet]
    const target = targetPose(planet)
    body.from = clonePose(body.pose)
    body.to = {
      ...target,
      turn: body.pose.turn + (spinSelected && props.selected === planet ? Math.PI * 1.55 : 0),
    }
    if (!animate || isReducedMotion) body.pose = clonePose(body.to)
  }
  transitionStart = performance.now()
  transitionDuration = animate && !isReducedMotion ? 1350 : 0
  if (isReducedMotion) render()
}

function applyPose(body: Body, now: number, phase: number) {
  const bob = !isReducedMotion && !props.selected ? Math.sin(now * 0.00075 + phase) * 0.045 : 0
  body.mesh.position.set(body.pose.x, body.pose.y + bob, 0)
  body.mesh.scale.setScalar(body.pose.radius)
  body.mesh.rotation.y = (body.mesh.userData.planet === 'moon' ? -0.9 : 0.42) + body.pose.turn
  body.material.opacity = body.pose.opacity
  body.mesh.visible = body.pose.opacity > 0.005

  body.glow.position.set(body.pose.x, body.pose.y + bob, -0.7)
  body.glow.scale.set(body.pose.radius * 3.35, body.pose.radius * 3.35, 1)
  ;(body.glow.material as THREE.SpriteMaterial).opacity = body.pose.opacity * (props.selected ? 0.09 : 0.15)
  body.glow.visible = body.pose.opacity > 0.005
}

function render(now = performance.now()) {
  if (!renderer || !scene || !camera) return
  applyPose(bodies.moon, now, 0)
  applyPose(bodies.mars, now, Math.PI)
  renderer.render(scene, camera)
}

function frame(now: number) {
  if (disposed) return
  raf = isReducedMotion ? 0 : requestAnimationFrame(frame)
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0
  lastFrame = now

  if (transitionDuration > 0) {
    const t = Math.min((now - transitionStart) / transitionDuration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    for (const planet of PLANETS) {
      const body = bodies[planet]
      for (const key of ['x', 'y', 'radius', 'opacity', 'turn'] as const) {
        body.pose[key] = body.from[key] + (body.to[key] - body.from[key]) * eased
      }
    }
    if (t === 1) transitionDuration = 0
  }

  if (!isReducedMotion) {
    // A very slow surface rotation keeps both textured spheres visibly three dimensional.
    bodies.moon.pose.turn += dt * 0.035
    bodies.mars.pose.turn += dt * 0.045
  }
  render(now)
}

function resize() {
  if (!renderer || !camera || !container.value) return
  const rect = container.value.getBoundingClientRect()
  viewport = {
    width: Math.max(1, rect.width || window.innerWidth),
    height: Math.max(1, rect.height || window.innerHeight),
  }
  const aspect = viewport.width / viewport.height
  camera.left = -(VISIBLE_HEIGHT * aspect) / 2
  camera.right = (VISIBLE_HEIGHT * aspect) / 2
  camera.top = VISIBLE_HEIGHT / 2
  camera.bottom = -VISIBLE_HEIGHT / 2
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, viewport.width < 720 ? 1.75 : 2))
  renderer.setSize(viewport.width, viewport.height, false)
  arrange(false)
  render()
}

function hitTest(event: PointerEvent): Planet | null {
  if (!renderer || !camera || props.selected) return null
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(PLANETS.map(planet => bodies[planet].mesh), false)
  return (hits[0]?.object.userData.planet as Planet | undefined) ?? null
}

function onPointerMove(event: PointerEvent) {
  if (renderer) renderer.domElement.style.cursor = hitTest(event) ? 'pointer' : 'default'
}

function onPointerDown(event: PointerEvent) {
  pointerDown = { x: event.clientX, y: event.clientY }
}

function onPointerUp(event: PointerEvent) {
  if (!pointerDown) return
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  pointerDown = null
  if (moved > 8) return
  const planet = hitTest(event)
  if (planet) emit('select', planet)
}

function onPointerCancel() {
  pointerDown = null
}

function onMotionChange(event: MediaQueryListEvent) {
  isReducedMotion = event.matches
  if (isReducedMotion) {
    cancelAnimationFrame(raf)
    raf = 0
    transitionDuration = 0
    for (const planet of PLANETS) bodies[planet].pose = clonePose(bodies[planet].to)
    render()
  } else if (!raf) {
    lastFrame = 0
    raf = requestAnimationFrame(frame)
  }
}

onMounted(() => {
  if (!container.value) return
  disposed = false
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  isReducedMotion = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.domElement.setAttribute('aria-hidden', 'true')
    container.value.appendChild(renderer.domElement)
  } catch {
    webglFailed.value = true
    return
  }

  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
  camera.position.set(0, 0, 20)
  camera.lookAt(0, 0, 0)
  geometry = new THREE.SphereGeometry(1, 96, 64)
  glowTexture = glowMap()

  scene.add(new THREE.AmbientLight(0x9eafc5, 1.05))
  const sun = new THREE.DirectionalLight(0xfff2df, 2.5)
  sun.position.set(-5, 3.5, 7)
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0x7897c5, 0.5)
  rim.position.set(5, -2, -3)
  scene.add(rim)

  bodies.moon = createBody('moon')
  bodies.mars = createBody('mars')
  resize()
  loadTexture('moon', '/textures/moon-color.jpg')
  loadTexture('mars', '/textures/mars-color.jpg')

  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerCancel)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container.value)
  window.addEventListener('resize', resize)
  if (!isReducedMotion) raf = requestAnimationFrame(frame)
})

watch(() => props.selected, (selected, previous) => {
  arrange(true, selected !== null && selected !== previous)
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  motionQuery?.removeEventListener('change', onMotionChange)
  if (renderer) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
    renderer.domElement.remove()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  for (const planet of PLANETS) {
    const body = bodies[planet]
    if (!body) continue
    body.texture?.dispose()
    body.material.dispose()
    ;(body.glow.material as THREE.SpriteMaterial).dispose()
  }
  geometry?.dispose()
  glowTexture?.dispose()
})
</script>

<style scoped>
.planet-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: auto;
}

.planet-scene :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.fallback-planet {
  position: absolute;
  top: 53%;
  width: min(34vh, 32vw, 380px);
  aspect-ratio: 1;
  border-radius: 50%;
  cursor: pointer;
  transform: translate(-50%, -50%);
  box-shadow: inset -30px -20px 45px #050810aa, 0 0 40px #7a9ac540;
  transition: left 1.3s cubic-bezier(.2, .7, .2, 1), top 1.3s cubic-bezier(.2, .7, .2, 1), width 1.3s cubic-bezier(.2, .7, .2, 1), opacity .7s ease;
}

.fallback-planet--moon {
  left: 28%;
  background: radial-gradient(circle at 35% 30%, #e2e2dc, #8d9296 62%, #323947);
}

.fallback-planet--mars {
  left: 72%;
  background: radial-gradient(circle at 35% 30%, #d9a078, #9c5741 65%, #352019);
}

.fallback-planet.is-selected {
  left: 92%;
  top: 81%;
  width: min(88vh, 78vw);
}

.fallback-planet.is-hidden { opacity: 0; }

@media (max-width: 719px) {
  .fallback-planet {
    left: 50%;
    width: min(49vw, 27vh, 220px);
  }
  .fallback-planet--moon { top: 43%; }
  .fallback-planet--mars { top: 75%; }
  .fallback-planet.is-selected {
    left: 109%;
    top: 96%;
    width: min(62vh, 124vw);
  }
}

@media (max-width: 719px) and (max-height: 780px) {
  .fallback-planet--moon { top: 39%; }
  .fallback-planet--mars { top: 76%; }
}

@media (prefers-reduced-motion: reduce) {
  .fallback-planet { transition: none; }
}
</style>
