<template>
  <div ref="container" class="planet-scene">
    <img ref="flagOverlay" class="surface-flag" src="/nasa-flag.svg" alt="" aria-hidden="true" />
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
type Pose = { x: number; y: number; radius: number; opacity: number; turn: number; roll: number }
type Body = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  material: THREE.MeshStandardMaterial
  glow: THREE.Sprite
  marker: THREE.Group
  yaw: number
  pitch: number
  pose: Pose
  from: Pose
  to: Pose
  texture?: THREE.Texture
  tiles: ReturnType<typeof createSphericalTiles>
}

const props = defineProps<{ selected: Planet | null; zoom: number; point: { lat: number; lon: number } | null; target: { lat: number; lon: number } | null }>()
const emit = defineEmits<{ select: [value: Planet]; mark: [value: { planet: Planet; lat: number; lon: number }]; landmark: [name: string]; zoom: [event: WheelEvent]; pinch: [direction: number]; orbit: [rotation: [number, number, number, number]]; scale: [value: { kilometers: number; pixels: number; segments: number }] }>()
const container = ref<HTMLElement | null>(null)
const flagOverlay = ref<HTMLImageElement | null>(null)
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
let disposed = false
let isReducedMotion = false
let pointerDown: { x: number; y: number; lastX: number; lastY: number; planet: Planet | null } | null = null
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

  const marker = new THREE.Group()
  marker.visible = false
  mesh.add(marker)

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

  const initial: Pose = { x: 0, y: 0, radius: 1, opacity: 1, turn: 0, roll: 0 }
  return { mesh, material, glow, marker, yaw: 0, pitch: 0, pose: clonePose(initial), from: clonePose(initial), to: clonePose(initial), tiles: createSphericalTiles(planet, mesh, requestRender) }
}

function updateMarker() {
  for (const planet of PLANETS) {
    const body = bodies[planet]
    if (!body) continue
    body.marker.visible = props.selected === planet && !!props.point
    if (!body.marker.visible || !props.point) continue
    const theta = (90 - props.point.lat) * Math.PI / 180
    const phi = (props.point.lon + 180) * Math.PI / 180
    const normal = new THREE.Vector3(
      -Math.cos(phi) * Math.sin(theta),
      Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
    )
    body.marker.position.copy(normal).multiplyScalar(1.001)
    body.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  }
  requestRender()
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

function targetPose(planet: Planet): Omit<Pose, 'turn'> {
  const { width, height } = viewport
  const mobile = width <= 760
  const compactMobile = mobile && height < 800
  const atRest = mobile
    ? point(0.5, planet === 'moon' ? (compactMobile ? 0.39 : 0.43) : (compactMobile ? 0.76 : 0.75))
    : point(planet === 'moon' ? 0.28 : 0.72, 0.53)
  const baseRadiusPx = mobile
    ? Math.min(width * 0.245, height * 0.135, 110)
    : Math.min(height * 0.17, width * 0.16, 190)
  const radius = pixelToWorld(baseRadiusPx * (planet === 'mars' ? 1.04 : 1))

  if (!props.selected) return { ...atRest, radius, opacity: 1, roll: 0 }
  if (props.selected !== planet) {
    return { ...atRest, radius: radius * 0.72, opacity: 0, roll: 0 }
  }

  const selectedPosition = mobile ? point(0.5, 0.31) : point(0.65, 0.54)
  const selectedRadiusPx = mobile
    ? Math.min(height * 0.19, width * 0.36)
    : Math.min(height * 0.46, width * 0.38)
  const zoomScale = props.zoom < 2 ? [1, 1.35][props.zoom]! : 1.9 * 2 ** (props.zoom - 2)
  const selectedRadius = pixelToWorld(selectedRadiusPx * zoomScale)
  if (props.point && props.zoom >= 2 && bodies[planet]) {
    const markerOffset = bodies[planet].marker.position.clone().applyQuaternion(bodies[planet].mesh.quaternion)
    return {
      x: selectedPosition.x - markerOffset.x * selectedRadius,
      y: selectedPosition.y - markerOffset.y * selectedRadius,
      radius: selectedRadius,
      opacity: 1,
      roll: 0,
    }
  }
  return { ...selectedPosition, radius: selectedRadius, opacity: 1, roll: 0 }
}

function arrange(animate: boolean, spin = 0, spinningPlanet: Planet | null = props.selected) {
  if (!renderer) return
  for (const planet of PLANETS) {
    const body = bodies[planet]
    const target = targetPose(planet)
    body.from = clonePose(body.pose)
    body.to = {
      ...target,
      turn: body.pose.turn + (spinningPlanet === planet ? spin * Math.PI * 1.55 : 0),
    }
    if (!animate || isReducedMotion) body.pose = clonePose(body.to)
  }
  transitionStart = performance.now()
  transitionDuration = animate && !isReducedMotion ? (spin || !props.selected ? 1350 : 600) : 0
  requestRender()
}

function applyPose(body: Body) {
  body.mesh.position.set(body.pose.x, body.pose.y, 0)
  body.mesh.scale.setScalar(body.pose.radius)
  const radiusPx = body.pose.radius * viewport.height / VISIBLE_HEIGHT
  body.marker.scale.setScalar(Math.min(1, 125 / radiusPx))
  body.mesh.rotation.set(
    (body.mesh.userData.planet === 'moon' ? 0.07 : 0.19) + body.pitch,
    (body.mesh.userData.planet === 'moon' ? -0.9 : 0.42) + body.pose.turn + body.yaw,
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
  body.marker.getWorldPosition(flagPosition)
  flagNormal.copy(body.marker.position).applyQuaternion(body.mesh.quaternion)
  if (flagNormal.z <= 0.02 || body.pose.opacity < 0.1) {
    flag.style.visibility = 'hidden'
    return
  }
  flagPosition.project(camera)
  const x = (flagPosition.x + 1) * viewport.width / 2
  const y = (1 - flagPosition.y) * viewport.height / 2
  // Lean the pole outward with the surface normal and foreshorten the cloth.
  const a = 0.68 + 0.32 * flagNormal.z
  const b = -flagNormal.x * 0.08
  const c = -flagNormal.x * 0.52
  const d = 0.9 + 0.1 * flagNormal.z
  const anchorX = 7.2
  const anchorY = 72.2
  flag.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${-a * anchorX - c * anchorY}, ${-b * anchorX - d * anchorY})`
  flag.style.left = `${x}px`
  flag.style.top = `${y}px`
  flag.style.visibility = x >= -80 && x <= viewport.width + 80 && y >= -80 && y <= viewport.height + 80 ? 'visible' : 'hidden'
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
      for (const key of ['x', 'y', 'radius', 'opacity', 'turn', 'roll'] as const) {
        body.pose[key] = body.from[key] + (body.to[key] - body.from[key]) * eased
      }
    }
    if (t === 1) transitionDuration = 0
  }

  let animatingTiles = false
  for (const planet of PLANETS) {
    const body = bodies[planet]
    applyPose(body)
    const level = Math.min(planet === 'moon' ? 8 : 7, props.zoom + 3)
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
  updateFlagOverlay()
  updateLabels()
  updateSky()
  if (props.selected) updateScale(props.selected)
  if (transitionDuration > 0 || animatingTiles || now < settleUntil) requestRender()
  else lastFrame = 0
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
      if (pinchDistance && (distance > pinchDistance * 1.27 || distance < pinchDistance / 1.27)) {
        emit('pinch', distance > pinchDistance ? 1 : -1)
        pinchDistance = distance
      }
      return
    }
  }
  if (pointerDown?.planet && props.selected === pointerDown.planet) {
    const body = bodies[pointerDown.planet]
    const radiansPerPixel = VISIBLE_HEIGHT / (viewport.height * body.pose.radius)
    const tilt = pointerDown.planet === 'moon' ? .07 : .19
    const horizontalScale = Math.max(.18, Math.cos(body.pitch + tilt))
    const dx = event.clientX - pointerDown.lastX
    const dy = event.clientY - pointerDown.lastY
    const pitchLimit = THREE.MathUtils.degToRad(pointerDown.planet === 'moon' ? 72 : 90)
    body.yaw += dx * radiansPerPixel / horizontalScale
    body.pitch = THREE.MathUtils.clamp(body.pitch + dy * radiansPerPixel, -pitchLimit - tilt, pitchLimit - tilt)
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
      pointerDown = null
      return
    }
  }
  const planet = hitTest(event)
  pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, planet }
  if (planet && props.selected === planet) renderer?.domElement.setPointerCapture(event.pointerId)
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    activeTouches.delete(event.pointerId)
    if (pinchActive) {
      pointerDown = null
      if (!activeTouches.size) {
        pinchActive = false
        pinchDistance = 0
      }
      return
    }
  }
  if (!pointerDown) return
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  pointerDown = null
  if (moved > 8) return
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
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
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
  updateMarker()
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
  updateMarker()
})
watch(() => props.zoom, () => arrange(true))
watch(() => [props.point?.lat, props.point?.lon], updateMarker)
watch(() => props.target, target => {
  const planet = props.selected
  if (!planet || !target || !bodies[planet]) return
  const body = bodies[planet]
  const limit = planet === 'moon' ? 72 : 90
  body.pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(target.lat, -limit, limit)) - (planet === 'moon' ? .07 : .19)
  body.yaw = THREE.MathUtils.degToRad(-90 - target.lon) - (planet === 'moon' ? -.9 : .42) - body.pose.turn
  settleUntil = performance.now() + 100
  requestRender()
})

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
    body.marker.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      ;(object.material as THREE.Material).dispose()
    })
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
  width: 72px;
  height: 77px;
  transform-origin: top left;
  pointer-events: none;
  visibility: hidden;
  filter: drop-shadow(0 2px 3px #05070bcc);
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
  .fallback-planet--moon { top: 43%; }
  .fallback-planet--mars { top: 75%; }
  .fallback-planet.is-selected {
    left: 50%;
    top: 30%;
    width: min(36vh, 58vw);
  }
}

@media (max-width: 760px) and (max-height: 780px) {
  .fallback-planet--moon { top: 39%; }
  .fallback-planet--mars { top: 76%; }
}

@media (prefers-reduced-motion: reduce) {
  .fallback-planet { transition: none; }
}
</style>
