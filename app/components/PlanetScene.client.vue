<template>
  <div ref="container" class="planet-scene">
    <div ref="flagOverlay" class="surface-flag" aria-hidden="true">
      <span class="surface-flag__pole" />
      <img class="surface-flag__cloth" src="/nasa-flag.svg" alt="" />
    </div>
    <div class="lunar-labels" :aria-label="selected === 'mars' ? 'Martian landmarks' : 'Lunar landmarks'">
      <button v-for="label in labels" :key="label.name" type="button" class="lunar-label"
        :class="'lunar-label--' + label.tier"
        :style="{ left: label.x + 'px', top: label.y + 'px', maxWidth: label.availableWidth + 'px', '--label-angle': label.angle + 'deg' }"
        :title="label.kind + ' · ' + formatCoordinates(label.lat, label.lon, selected ?? 'moon')"
        @wheel="onWheel" @click="emit('landmark', label.name)">
        <span>{{ label.name }}</span>
      </button>
    </div>
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
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as THREE from 'three'
import { createSphericalTiles } from '~/utils/sphericalTiles'
import { formatCoordinates, MARS_FEATURES, MARS_LANDMARKS, MOON_FEATURES, MOON_LANDMARKS, MOON_MISSIONS } from '~/data/places'

type Planet = 'moon' | 'mars'
type Pose = { x: number; y: number; radius: number; opacity: number; turn: number; roll: number; yaw: number; pitch: number }
type Body = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  material: THREE.MeshStandardMaterial
  glow: THREE.Sprite
  pose: Pose
  from: Pose
  to: Pose
  texture?: THREE.Texture
  tiles: ReturnType<typeof createSphericalTiles>
}

const props = defineProps<{ selected: Planet | null; zoom: number; point: { lat: number; lon: number } | null; target: { lat: number; lon: number } | null; sheetExpanded: boolean }>()
const emit = defineEmits<{ select: [value: Planet]; mark: [value: { planet: Planet; lat: number; lon: number }]; landmark: [name: string]; zoom: [event: WheelEvent]; pinch: [direction: number]; orbit: [rotation: [number, number, number, number]]; scale: [value: { kilometers: number; pixels: number; segments: number }] }>()
const container = ref<HTMLElement | null>(null)
const flagOverlay = ref<HTMLDivElement | null>(null)
const webglFailed = ref(false)
type SurfaceLabel = { name: string; kind: string; lat: number; lon: number; tier: 'primary' | 'regional' | 'local'; x: number; y: number; width: number; availableWidth: number; angle: number }
const labels = shallowRef<SurfaceLabel[]>([])
const projectedLabel = new THREE.Vector3()
const labelTangent = new THREE.Vector3()
const surfacePoints = {
  moon: [
    ...MOON_MISSIONS.map(site => ({ ...site, diameter: 0, mission: true, notable: true })),
    ...MOON_FEATURES.map(site => ({ ...site, mission: false, notable: MOON_LANDMARKS.has(site.name) })),
  ].map(projectSite),
  mars: [
    ...MARS_LANDMARKS.map(site => ({ ...site, diameter: 0, mission: true, notable: true })),
    ...MARS_FEATURES.map(site => ({ ...site, mission: false, notable: false })),
  ].map(projectSite),
}

function projectSite<T extends { lat: number; lon: number }>(site: T) {
  const latitude = THREE.MathUtils.degToRad(site.lat)
  const longitude = THREE.MathUtils.degToRad(site.lon)
  return {
    ...site,
    normal: new THREE.Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), -Math.cos(latitude) * Math.sin(longitude)),
    east: new THREE.Vector3(-Math.sin(longitude), 0, -Math.cos(longitude)),
  }
}

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
let settleUntil = 0
let transitionStart = 0
let transitionDuration = 0
let focusing = false
let disposed = false
let isReducedMotion = false
let pointerDown: { x: number; y: number; lastX: number; lastY: number; planet: Planet | null; dragged: boolean } | null = null
const activeTouches = new Map<number, { x: number; y: number }>()
let pinchDistance = 0
let pinchActive = false
let viewport = { width: 1, height: 1 }
const bodies = {} as Record<Planet, Body>
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const viewAxis = new THREE.Vector3(0, 0, 1)
const flagPosition = new THREE.Vector3()
const flagNormal = new THREE.Vector3()
const rollRotation = new THREE.Quaternion()
const localCenter = new THREE.Vector3()
const inverseRotation = new THREE.Quaternion()
const skyRotation = new THREE.Quaternion()
const lastPlanetRotation = new THREE.Quaternion()
const skyDelta = new THREE.Quaternion()
let skyPlanet: Planet | null = null
let lastScale = { kilometers: 0, pixels: 0, segments: 2 }

function updateScale(planet: Planet) {
  const radiusPixels = bodies[planet].pose.radius * viewport.height / VISIBLE_HEIGHT
  const radiusKm = planet === 'moon' ? 1737.4 : 3389.5
  const targetDistance = 2 * radiusKm * Math.asin(Math.min(.75, 75 / radiusPixels))
  function roundedDistance(segments: number) {
    const targetSegment = targetDistance / segments
    const magnitude = 10 ** Math.floor(Math.log10(targetSegment))
    const step = targetSegment / magnitude
    return segments * magnitude * (step >= 5 ? 5 : step >= 2.5 ? 2.5 : step >= 2 ? 2 : 1)
  }
  const two = roundedDistance(2)
  const three = roundedDistance(3)
  const segments = three > two ? 3 : 2
  const kilometers = segments === 3 ? three : two
  const pixels = Math.round(2 * radiusPixels * Math.sin(kilometers / (2 * radiusKm)))
  if (pixels === lastScale.pixels && kilometers === lastScale.kilometers && segments === lastScale.segments) return
  lastScale = { kilometers, pixels, segments }
  emit('scale', lastScale)
}

function clonePose(pose: Pose): Pose {
  return { ...pose }
}

function glowMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64, 64, 25, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0.72)')
  gradient.addColorStop(0.38, 'rgba(255,255,255,0.5)')
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.09)')
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
    color: moon ? 0xcbdced : 0xd87a49,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  glow.position.z = -0.7
  scene!.add(glow)

  const initial: Pose = { x: 0, y: 0, radius: 1, opacity: 1, turn: 0, roll: 0, yaw: 0, pitch: 0 }
  return { mesh, material, glow, pose: clonePose(initial), from: clonePose(initial), to: clonePose(initial), tiles: createSphericalTiles(planet, mesh, requestRender) }
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
      body.material.color.set(0xffffff)
      body.material.needsUpdate = true
      requestRender()
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

function targetPose(planet: Planet): Omit<Pose, 'turn' | 'yaw' | 'pitch'> {
  const { width, height } = viewport
  const mobile = width <= 760
  const atRest = mobile
    ? point(0.5, planet === 'moon' ? .35 : .71)
    : point(planet === 'moon' ? 0.28 : 0.72, 0.53)
  const baseRadiusPx = mobile
    ? Math.min(width * .27, height * .13, 126)
    : Math.min(height * 0.17, width * 0.16, 190)
  const radius = pixelToWorld(baseRadiusPx * (planet === 'mars' ? 1.04 : 1))

  if (!props.selected) return { ...atRest, radius, opacity: 1, roll: 0 }
  if (props.selected !== planet) {
    return { ...atRest, radius: radius * 0.72, opacity: 0, roll: 0 }
  }

  const selectedPosition = mobile ? point(0.5, props.sheetExpanded ? .21 : .45) : point(0.65, 0.54)
  const selectedRadiusPx = mobile
    ? Math.min(height * 0.24, width * 0.43)
    : Math.min(height * 0.46, width * 0.38)
  const zoom = props.zoom
  const zoomScale = zoom < 1 ? 1.35 ** zoom : zoom < 2 ? 1.35 * (1.9 / 1.35) ** (zoom - 1) : 1.9 * 2 ** (zoom - 2)
  const selectedRadius = pixelToWorld(selectedRadiusPx * zoomScale)
  return { ...selectedPosition, radius: selectedRadius, opacity: 1, roll: 0 }
}

function arrange(animate: boolean, spin = 0, spinningPlanet: Planet | null = props.selected, focus?: { lat: number; lon: number }) {
  if (!renderer) return
  focusing = false
  for (const planet of PLANETS) {
    const body = bodies[planet]
    const target = targetPose(planet)
    body.from = clonePose(body.pose)
    body.to = {
      ...target,
      turn: spinningPlanet === planet && spin ? body.pose.turn + spin * Math.PI * 1.55 : body.to.turn,
      yaw: body.to.yaw,
      pitch: body.to.pitch,
    }
    if (focus && props.selected === planet) {
      const yaw = THREE.MathUtils.degToRad(-90 - focus.lon) - (planet === 'moon' ? -.9 : .42) - body.to.turn
      const delta = yaw - body.pose.yaw
      body.to.pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(focus.lat, -90, 90)) - (planet === 'moon' ? .07 : .19)
      body.to.yaw = body.pose.yaw + Math.atan2(Math.sin(delta), Math.cos(delta))
      focusing = Math.hypot(body.to.pitch - body.pose.pitch, body.to.yaw - body.pose.yaw, body.to.turn - body.pose.turn) > .01
    }
    if (!animate || isReducedMotion) body.pose = clonePose(body.to)
  }
  transitionStart = performance.now()
  transitionDuration = animate && !isReducedMotion ? (focusing ? 800 : spin || !props.selected ? 1350 : 600) : 0
  requestRender()
}

function applyPose(body: Body) {
  body.mesh.position.set(body.pose.x, body.pose.y, 0)
  body.mesh.scale.setScalar(body.pose.radius)
  body.mesh.rotation.set(
    (body.mesh.userData.planet === 'moon' ? 0.07 : 0.19) + body.pose.pitch,
    (body.mesh.userData.planet === 'moon' ? -0.9 : 0.42) + body.pose.turn + body.pose.yaw,
    0,
  )
  body.mesh.quaternion.premultiply(rollRotation.setFromAxisAngle(viewAxis, body.pose.roll))
  body.material.opacity = body.pose.opacity
  body.mesh.visible = body.pose.opacity > 0.005

  const isMoon = body.mesh.userData.planet === 'moon'
  const haloOpacity = isMoon ? 0.52 / (1 + props.zoom * .55) : 0.12
  body.glow.position.set(body.pose.x, body.pose.y, -body.pose.radius - 0.1)
  const haloSize = body.pose.radius * (isMoon ? 2.65 : 3.35)
  body.glow.scale.set(haloSize, haloSize, 1)
  ;(body.glow.material as THREE.SpriteMaterial).opacity = body.pose.opacity * haloOpacity
  body.glow.visible = body.pose.opacity > 0.005
}

function updateLabels() {
  const planet = props.selected
  if (!planet || props.zoom === 0 || !camera) {
    if (labels.value.length) labels.value = []
    return
  }
  const body = bodies[planet]
  const pixelsPerUnit = viewport.height / VISIBLE_HEIGHT
  const radius = body.pose.radius * pixelsPerUnit
  const sidebar = container.value?.parentElement?.querySelector('.mission-panel')?.getBoundingClientRect()
  const bounds = container.value?.getBoundingClientRect()
  if (!bounds) return
  const previous = new Set(labels.value.map(label => label.name))
  const candidates: (SurfaceLabel & { score: number })[] = []

  for (const site of surfacePoints[planet]) {
    projectedLabel.copy(site.normal).applyQuaternion(body.mesh.quaternion)
    if (projectedLabel.z <= 0.005) continue
    projectedLabel.copy(site.normal).applyMatrix4(body.mesh.matrixWorld).project(camera)
    const x = (projectedLabel.x + 1) * bounds.width / 2
    const y = (1 - projectedLabel.y) * bounds.height / 2
    if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) continue
    const diameterPx = site.diameter * radius / (planet === 'moon' ? 1737.4 : 3389.5)
    const wasVisible = previous.has(site.name)
    if (!site.notable && diameterPx < (wasVisible ? 16 : 20)) continue
    const tier = site.mission || site.notable || site.diameter >= 350 ? 'primary' : site.diameter >= 90 ? 'regional' : 'local'
    const fontWidth = tier === 'primary' ? 7 : tier === 'regional' ? 6.5 : 5.8
    const availableWidth = bounds.width - x - 2
    const width = Math.min(site.name.length * fontWidth + 14, availableWidth)
    if (y < 9 || y > bounds.height - 9 || width < 25) continue
    if (sidebar && x + bounds.left < sidebar.right + 8 && x + bounds.left + width > sidebar.left
      && y + bounds.top > sidebar.top - 12 && y + bounds.top < sidebar.bottom + 12) continue
    const score = (tier === 'primary' ? 100 : tier === 'regional' ? 50 : 0) + Math.min(45, diameterPx) + (wasVisible ? 12 : 0)
    labelTangent.copy(site.east).applyQuaternion(body.mesh.quaternion)
    const angle = THREE.MathUtils.radToDeg(Math.atan2(-labelTangent.y, labelTangent.x))
    const tilt = THREE.MathUtils.clamp(((angle + 270) % 180 - 90) * .1, -4, 4)
    candidates.push({ ...site, x, y, width, availableWidth, score, tier, angle: tilt })
  }
  candidates.sort((a, b) => b.score - a.score)
  const visible: typeof candidates = []
  for (const label of candidates) {
    const overlaps = visible.some(other => Math.abs(other.y - label.y) < 25
      && other.x + other.width + 6 > label.x && label.x + label.width + 6 > other.x)
    if (!overlaps) visible.push(label)
    if (visible.length >= 20) break
  }
  labels.value = visible
}

function updateFlagOverlay() {
  const flag = flagOverlay.value
  const planet = props.selected
  if (!flag || !planet || !props.point || !camera || !bodies[planet]) {
    if (flag) flag.style.visibility = 'hidden'
    return
  }
  const body = bodies[planet]
  body.mesh.updateMatrixWorld(true)
  flagNormal.copy(projectSite(props.point).normal)
  flagPosition.copy(flagNormal).applyMatrix4(body.mesh.matrixWorld)
  flagNormal.applyQuaternion(body.mesh.quaternion)
  if (flagNormal.z <= 0.02 || body.pose.opacity < 0.1) {
    flag.style.visibility = 'hidden'
    return
  }
  flagPosition.project(camera)
  const x = (flagPosition.x + 1) * viewport.width / 2
  const y = (1 - flagPosition.y) * viewport.height / 2
  const radiusPixels = body.pose.radius * viewport.height / VISIBLE_HEIGHT
  const zoomScale = THREE.MathUtils.clamp(0.38 + Math.log2(Math.max(1, radiusPixels / 100)) * 0.09, 0.38, 0.82)
  const scale = zoomScale * THREE.MathUtils.lerp(.58, 1.24, flagNormal.z)
  // The surface normal points out of the globe. Near nadir its screen
  // projection is almost zero, so blend to an upright flag for legibility.
  const radial = THREE.MathUtils.smoothstep(Math.hypot(flagNormal.x, flagNormal.y), .04, .45)
  const outwardX = flagNormal.x * radial
  const outwardY = -flagNormal.y * radial - (1 - radial)
  const outwardLength = Math.hypot(outwardX, outwardY)
  const dx = outwardLength > .001 ? outwardX / outwardLength : 0
  const dy = outwardLength > .001 ? outwardY / outwardLength : -1
  const mast = 69 * scale
  flag.style.setProperty('--mast-length', `${mast}px`)
  flag.style.setProperty('--mast-angle', `${Math.atan2(dx, -dy)}rad`)
  // Map the artwork's left edge (SVG x=16, y=9…74) onto two points on the mast.
  const upperX = mast * dx * .92
  const upperY = mast * dy * .92
  const c = -mast * dx * .56 / 39
  const d = -mast * dy * .56 / 39
  // Extend the free edge along the downward-facing tangent.
  const side = dx < -.15 ? -1 : 1
  const a = -dy * side * scale
  const b = Math.abs(dx) * scale
  flag.style.setProperty('--cloth-transform', `matrix(${a}, ${b}, ${c}, ${d}, ${upperX - a * 9.6 - c * 5.4}, ${upperY - b * 9.6 - d * 5.4})`)
  flag.style.left = `${x}px`
  flag.style.top = `${y}px`
  flag.style.visibility = x >= -80 && x <= viewport.width + 80 && y >= -80 && y <= viewport.height + 80 ? 'visible' : 'hidden'
}

function updatePanelBackdrop() {
  // The mobile sheet uses a CSS backdrop; its canvas is hidden there.
  if (viewport.width <= 760) return
  const canvas = container.value?.parentElement?.querySelector<HTMLCanvasElement>('.mission-blur-backdrop')
  if (!canvas || !renderer || !container.value) return
  const panel = canvas.getBoundingClientRect()
  const sceneBounds = container.value.getBoundingClientRect()
  if (!panel.width || !panel.height) return
  const width = Math.ceil(panel.width)
  const height = Math.ceil(panel.height)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  const scaleX = renderer.domElement.width / sceneBounds.width
  const scaleY = renderer.domElement.height / sceneBounds.height
  context.drawImage(renderer.domElement,
    (panel.left - sceneBounds.left) * scaleX,
    (panel.top - sceneBounds.top) * scaleY,
    panel.width * scaleX, panel.height * scaleY,
    0, 0, width, height)
}

function updateSky() {
  const planet = props.selected
  if (planet !== skyPlanet) {
    skyPlanet = planet
    if (planet) lastPlanetRotation.copy(bodies[planet].mesh.quaternion)
    return
  }
  if (!planet) return
  const rotation = bodies[planet].mesh.quaternion
  if (rotation.equals(lastPlanetRotation)) return
  // The sky moves opposite to the globe's change in screen-space orientation.
  skyDelta.copy(rotation).invert().premultiply(lastPlanetRotation)
  skyRotation.premultiply(skyDelta).normalize()
  lastPlanetRotation.copy(rotation)
  emit('orbit', [skyRotation.x, skyRotation.y, skyRotation.z, skyRotation.w])
}

function requestRender() {
  if (!disposed && !raf) raf = requestAnimationFrame(frame)
}

function frame(now: number) {
  raf = 0
  if (disposed || !renderer || !scene || !camera) return
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60
  lastFrame = now

  if (transitionDuration > 0) {
    const t = Math.min((now - transitionStart) / transitionDuration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    for (const planet of PLANETS) {
      const body = bodies[planet]
      const zoomT = focusing ? Math.max(0, (t - .32) / .68) : t
      const zoomEase = 1 - Math.pow(1 - zoomT, 3)
      for (const key of ['x', 'y', 'radius', 'opacity', 'turn', 'roll', 'yaw', 'pitch'] as const) {
        const progress = key === 'radius' || key === 'x' || key === 'y' ? zoomEase : eased
        body.pose[key] = THREE.MathUtils.lerp(body.from[key], body.to[key], progress)
      }
    }
    if (t === 1) transitionDuration = 0
  }

  let animatingTiles = false
  for (const planet of PLANETS) {
    const body = bodies[planet]
    applyPose(body)
    const level = Math.min(planet === 'moon' ? 8 : 7, Math.floor(props.zoom) + 3)
    const view = props.selected === planet ? {
      level,
      preload: level < (planet === 'moon' ? 8 : 7),
      center: localCenter.copy(viewAxis).applyQuaternion(inverseRotation.copy(body.mesh.quaternion).invert()),
      radius: body.pose.radius,
      reach: Math.hypot(camera.right + Math.abs(body.pose.x), camera.top + Math.abs(body.pose.y)),
    } : null
    if (body.tiles.update(view, now, isReducedMotion ? 1 : dt / .32)) animatingTiles = true
  }
  const active = props.selected ? bodies[props.selected] : null
  camera.position.z = Math.max(20, (active?.pose.radius ?? 0) + 20)
  renderer.render(scene, camera)
  updatePanelBackdrop()
  updateFlagOverlay()
  updateLabels()
  updateSky()
  if (props.selected) updateScale(props.selected)
  if (transitionDuration > 0 || animatingTiles || now < settleUntil) requestRender()
  else lastFrame = 0
}

function resize() {
  if (!renderer || !camera || !container.value) return
  // Layout dimensions are stable while the intro scales the scene visually.
  viewport = {
    width: Math.max(1, container.value.clientWidth || window.innerWidth),
    height: Math.max(1, container.value.clientHeight || window.innerHeight),
  }
  const aspect = viewport.width / viewport.height
  camera.left = -(VISIBLE_HEIGHT * aspect) / 2
  camera.right = (VISIBLE_HEIGHT * aspect) / 2
  camera.top = VISIBLE_HEIGHT / 2
  camera.bottom = -VISIBLE_HEIGHT / 2
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(viewport.width, viewport.height, false)
  arrange(false)
  settleUntil = performance.now() + 100
  requestRender()
}

function surfaceHit(event: PointerEvent): THREE.Intersection | null {
  if (!renderer || !camera) return null
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const meshes = props.selected ? [bodies[props.selected].mesh] : PLANETS.map(planet => bodies[planet].mesh)
  return raycaster.intersectObjects(meshes, false)[0] ?? null
}

function hitTest(event: PointerEvent): Planet | null {
  return (surfaceHit(event)?.object.userData.planet as Planet | undefined) ?? null
}

function onWheel(event: WheelEvent) {
  if (props.selected) {
    event.preventDefault()
    emit('zoom', event)
  }
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' && activeTouches.has(event.pointerId)) {
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (activeTouches.size >= 2) {
      const [first, second] = [...activeTouches.values()]
      const distance = Math.hypot(first!.x - second!.x, first!.y - second!.y)
      if (props.selected && pinchDistance >= 8 && distance >= 8) {
        emit('pinch', Math.log2(distance / pinchDistance) * 1.35)
      }
      pinchDistance = distance
      return
    }
  }
  if (pointerDown?.planet && props.selected === pointerDown.planet && !pinchActive) {
    if (!pointerDown.dragged && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 5) return
    pointerDown.dragged = true
    const body = bodies[pointerDown.planet]
    const radiansPerPixel = VISIBLE_HEIGHT / (viewport.height * body.pose.radius)
    const tilt = pointerDown.planet === 'moon' ? .07 : .19
    const horizontalScale = Math.max(.18, Math.cos(body.pose.pitch + tilt))
    const dx = event.clientX - pointerDown.lastX
    const dy = event.clientY - pointerDown.lastY
    const pitchLimit = Math.PI / 2
    body.pose.yaw += dx * radiansPerPixel / horizontalScale
    body.pose.pitch = THREE.MathUtils.clamp(body.pose.pitch + dy * radiansPerPixel, -pitchLimit - tilt, pitchLimit - tilt)
    // A drag takes over orientation while the current zoom can continue.
    for (const pose of [body.from, body.to]) {
      pose.yaw = body.pose.yaw
      pose.pitch = body.pose.pitch
      pose.turn = body.pose.turn
    }
    pointerDown.lastX = event.clientX
    pointerDown.lastY = event.clientY
    if (renderer) renderer.domElement.style.cursor = 'grabbing'
    settleUntil = performance.now() + 100
    requestRender()
    return
  }
  if (renderer) renderer.domElement.style.cursor = hitTest(event) ? (props.selected ? 'grab' : 'pointer') : 'default'
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    renderer?.domElement.setPointerCapture(event.pointerId)
    if (activeTouches.size >= 2) {
      const [first, second] = [...activeTouches.values()]
      pinchDistance = Math.hypot(first!.x - second!.x, first!.y - second!.y)
      pinchActive = true
      if (props.selected) {
        const body = bodies[props.selected]
        body.to = clonePose(body.pose)
      }
      pointerDown = null
      return
    }
  }
  const planet = hitTest(event)
  pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, planet, dragged: false }
  if (planet && props.selected === planet) renderer?.domElement.setPointerCapture(event.pointerId)
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    activeTouches.delete(event.pointerId)
    if (pinchActive) {
      if (activeTouches.size < 2) {
        pinchActive = false
        pinchDistance = 0
        const remaining = activeTouches.values().next().value
        pointerDown = remaining
          ? { ...remaining, lastX: remaining.x, lastY: remaining.y, planet: props.selected, dragged: true }
          : null
      }
      return
    }
  }
  if (!pointerDown) return
  const moved = pointerDown.dragged || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8
  pointerDown = null
  if (moved) return
  const hit = surfaceHit(event)
  const planet = hit?.object.userData.planet as Planet | undefined
  if (!planet) return
  if (!props.selected) {
    emit('select', planet)
  } else if (props.selected === planet && hit) {
    const local = bodies[planet].mesh.worldToLocal(hit.point.clone()).normalize()
    emit('mark', {
      planet,
      lat: Number(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(local.y, -1, 1))).toFixed(3)),
      lon: Number(THREE.MathUtils.radToDeg(Math.atan2(-local.z, local.x)).toFixed(3)),
    })
  }
}

function onPointerCancel(event: PointerEvent) {
  activeTouches.delete(event.pointerId)
  if (!activeTouches.size) {
    pinchActive = false
    pinchDistance = 0
  }
  pointerDown = null
}

function onMotionChange(event: MediaQueryListEvent) {
  isReducedMotion = event.matches
  if (isReducedMotion) {
    transitionDuration = 0
    for (const planet of PLANETS) bodies[planet].pose = clonePose(bodies[planet].to)
    requestRender()
  }
}

onMounted(() => {
  if (!container.value) return
  disposed = false
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  isReducedMotion = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.domElement.setAttribute('aria-label', 'Interactive planet. Drag to rotate and click to mark a point.')
    renderer.domElement.style.touchAction = 'none'
    container.value.appendChild(renderer.domElement)
  } catch {
    webglFailed.value = true
    return
  }

  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 10000)
  camera.position.set(0, 0, 20)
  camera.lookAt(0, 0, 0)
  geometry = new THREE.SphereGeometry(1, 128, 96)
  glowTexture = glowMap()

  scene.add(new THREE.AmbientLight(0xd5dfea, 1.25))
  const sun = new THREE.DirectionalLight(0xfff5e9, 2.15)
  sun.position.set(-3.5, 3, 8)
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0x9eafc5, 0.3)
  rim.position.set(5, -2, -3)
  scene.add(rim)

  bodies.moon = createBody('moon')
  bodies.mars = createBody('mars')
  resize()
  if (props.target) arrange(false, 0, props.selected, props.target)
  loadTexture('moon', '/textures/moon-trek-global.webp')
  loadTexture('mars', '/textures/mars-trek-global.webp')

  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerCancel)
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container.value)
  window.addEventListener('resize', resize)
  requestRender()
})

watch(() => props.selected, (selected, previous) => {
  arrange(true, selected ? 1 : previous ? -1 : 0, selected ?? previous)
})
watch([() => props.zoom, () => props.target], ([zoom, target], [previousZoom, previousTarget]) => {
  const focus = target !== previousTarget && target ? target : zoom > previousZoom ? props.point : null
  if (pinchActive) arrange(false)
  else arrange(true, 0, props.selected, focus ?? undefined)
})
watch(() => props.sheetExpanded, () => {
  if (viewport.width <= 760) arrange(true)
  settleUntil = performance.now() + 450
  requestRender()
})
watch(() => [props.point?.lat, props.point?.lon], requestRender)
onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  motionQuery?.removeEventListener('change', onMotionChange)
  if (renderer) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('wheel', onWheel)
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
    body.tiles.dispose()
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

.surface-flag {
  position: absolute;
  z-index: 3;
  pointer-events: none;
  visibility: hidden;
  filter: drop-shadow(0 2px 3px #05070bcc);
}

.surface-flag__pole {
  position: absolute;
  left: -1.5px;
  bottom: 0;
  width: 3px;
  height: var(--mast-length);
  border-radius: 2px;
  background: linear-gradient(90deg, #8793a4, #f5f8fb);
  transform-origin: 50% 100%;
  transform: rotate(var(--mast-angle));
}
.surface-flag__cloth {
  position: absolute;
  width: 72px;
  max-width: none;
  height: auto;
  left: 0;
  top: 0;
  /* Preserve the artwork and clip its original painted pole. */
  clip-path: inset(7.03% 0 42.1875% 13.3333%);
  transform-origin: 0 0;
  transform: var(--cloth-transform);
}

.lunar-labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.lunar-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  transform: translate(-6.5px, -50%) rotate(var(--label-angle));
  transform-origin: 6.5px center;
  padding: 4px;
  border: 0;
  background: transparent;
  color: #eaf0f5;
  font: 600 10px/1.2 Geist, Arial, sans-serif;
  text-shadow: 0 1px 3px #000;
  white-space: nowrap;
  pointer-events: auto;
}
.lunar-label::before { content: ''; width: 5px; height: 5px; box-sizing: border-box; flex: none; border: 1px solid currentColor; border-radius: 50%; box-shadow: 0 1px 3px #0008; }
.lunar-label span { overflow: hidden; text-overflow: ellipsis; }
.lunar-label--primary { color: #fff; font-size: 12px; font-weight: 750; }
.lunar-label--regional { color: #e0e5eb; font-size: 11px; }
.lunar-label--local { color: #b8c1cb; }
.lunar-label:hover, .lunar-label:focus-visible { text-decoration: underline; outline-offset: 1px; }

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
  left: 75%;
  top: 52%;
  width: min(62vh, 44vw);
}

.fallback-planet.is-hidden { opacity: 0; }

@media (max-width: 760px) {
  .fallback-planet {
    left: 50%;
    width: min(49vw, 27vh, 220px);
  }
  .fallback-planet--moon { top: 35%; }
  .fallback-planet--mars { top: 71%; }
  .fallback-planet.is-selected {
    left: 50%;
    top: 30%;
    width: min(36vh, 58vw);
  }
}

@media (max-width: 760px) and (max-height: 780px) {
  .fallback-planet--moon { top: 35%; }
  .fallback-planet--mars { top: 71%; }
}

@media (prefers-reduced-motion: reduce) {
  .fallback-planet { transition: none; }
}
</style>
