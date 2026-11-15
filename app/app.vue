<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TerrainResults } from '../shared/terrain'
import { formatCoordinates, nearestSites, parseCoordinates, resolvePoint, searchSites, studiesFor, type Planet } from '~/data/places'

const { locale, t } = useI18n()
const selected = ref<Planet | null>(null)
const zoom = ref(0)
const mobileSheetExpanded = ref(false)

function showStudyStep() {
  if (!resolved.value) return
  pointOpen.value = false
  mobileSheetExpanded.value = true
}

const sheetHeight = ref<number>()
let sheetDrag: { pointer: number; startY: number; height: number; max: number } | undefined
let ignoreSheetClick = false

function startSheetDrag(event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  const panel = handle.closest('.mission-panel')
  if (!panel) return
  ignoreSheetClick = false
  sheetDrag = { pointer: event.pointerId, startY: event.clientY,
    height: panel.getBoundingClientRect().height, max: panel.getBoundingClientRect().bottom - 48 }
  handle.setPointerCapture(event.pointerId)
}

function moveSheetDrag(event: PointerEvent) {
  if (sheetDrag?.pointer !== event.pointerId) return
  const delta = sheetDrag.startY - event.clientY
  if (Math.abs(delta) > 8) ignoreSheetClick = true
  if (ignoreSheetClick) sheetHeight.value = Math.min(sheetDrag.max, Math.max(84, sheetDrag.height + delta))
}

function endSheetDrag(event: PointerEvent) {
  if (sheetDrag?.pointer !== event.pointerId) return
  const delta = sheetDrag.startY - event.clientY
  if (event.type !== 'pointercancel' && Math.abs(delta) > 30) mobileSheetExpanded.value = delta > 0
  sheetHeight.value = undefined
  sheetDrag = undefined
}

function toggleSheet(event: MouseEvent) {
  if (!ignoreSheetClick || event.detail === 0) mobileSheetExpanded.value = !mobileSheetExpanded.value
  ignoreSheetClick = false
}

function openPointInput() {
  pointOpen.value = true
  if (window.matchMedia('(max-width: 760px)').matches) mobileSheetExpanded.value = true
}
const mapTarget = ref<{ lat: number; lon: number } | null>(null)
const triedSearch = ref(false)
const mapScale = ref({ kilometers: 0, pixels: 0, segments: 2 })
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const sourceRevealed = ref(false)
const skyRotation = ref<[number, number, number, number]>([0, 0, 0, 1])

function moveStars(rotation: [number, number, number, number]) {
  skyRotation.value = rotation
}
const maxZoom = computed(() => selected.value === 'moon' ? 8 : 6)
let lastWheelEvent = -Infinity
let lastWheelZoom = -Infinity
let wheelDistance = 0
const introActive = ref(true)
const introVisible = ref(true)
const showTerrainResults = ref(false)
const terrainResults = ref<TerrainResults | null>(null)
const terrainLoading = ref(false)
const terrainError = ref('')
let terrainAbort: AbortController | undefined

function closeTerrainResults() {
  terrainAbort?.abort()
  showTerrainResults.value = false
  focusResult()
}

async function findTerrain() {
  const point = resolved.value
  if (!point || !selected.value) return
  terrainAbort?.abort()
  const request = new AbortController()
  terrainAbort = request
  showTerrainResults.value = true
  terrainResults.value = null
  terrainError.value = ''
  terrainLoading.value = true
  try {
    const result = await $fetch<TerrainResults>('/api/terrain-search', {
      method: 'POST',
      body: {
        planet: selected.value,
        lat: point.lat,
        lon: point.lon,
        priorities: activeStudy.value?.priorities,
        objective: form.value.studyId === 'other' ? form.value.studyOther : undefined,
      },
      signal: request.signal,
    })
    if (!request.signal.aborted) terrainResults.value = result
  } catch {
    if (!request.signal.aborted) terrainError.value = t('searchError')
  } finally {
    if (!request.signal.aborted) terrainLoading.value = false
  }
}
const triedSubmit = ref(false)
const pointOpen = ref(false)
const pointActive = ref(0)
const form = ref(blankForm())

const studies = computed(() => studiesFor(selected.value))
function studyTitle(id: string) {
  return id === 'rover-testing' ? t(`study.${id}.${selected.value ?? 'moon'}`) : t(`study.${id}.title`)
}
function studyDetail(id: string) { return t(`study.${id}.detail`) }
const resolved = computed(() => resolvePoint(selected.value, form.value.pointQuery))
const activeStudy = computed(() => studies.value.find(study => study.id === form.value.studyId) ?? null)
const studyLabel = computed(() => {
  if (form.value.studyId === 'other') return form.value.studyOther.trim()
  return activeStudy.value ? studyTitle(activeStudy.value.id) : ''
})
const pointHint = computed(() => selected.value === 'mars'
  ? t('pointHintMars') : t('pointHintMoon'))
const pointPlaceholder = computed(() => selected.value === 'mars'
  ? t('pointPlaceholderMars') : t('pointPlaceholderMoon'))

const suggestions = computed(() => {
  const planet = selected.value
  if (!planet) return []
  const query = form.value.pointQuery
  const coords = parseCoordinates(query)
  if (coords) {
    const typed = formatCoordinates(coords.lat, coords.lon, planet)
    return [
      { key: 'coords', title: t('useCoordinates'), meta: typed, query: typed },
      ...nearestSites(planet, coords, 3).map(site => ({
        key: site.name,
        title: site.name,
        meta: `${site.kind} · ${formatCoordinates(site.lat, site.lon, planet)} · ${site.km < 1 ? '< 1' : Math.round(site.km)} km`,
        query: site.name,
      })),
    ]
  }
  return searchSites(planet, query).map(site => ({
    key: site.name,
    title: site.name,
    meta: `${site.kind} · ${formatCoordinates(site.lat, site.lon, planet)}`,
    query: site.name,
  }))
})

const pointError = computed(() => {
  if (!(triedSubmit.value || triedSearch.value) || resolved.value) return ''
  return form.value.pointQuery.trim()
    ? t('pointInvalid') : t('pointMissing')
})
const studyError = computed(() => {
  if (!triedSubmit.value || studyLabel.value) return ''
  return form.value.studyId === 'other' ? t('customMissing') : t('studyMissing')
})
function formatResolved(lat: number, lon: number) {
  return selected.value ? formatCoordinates(lat, lon, selected.value) : ''
}

function blankForm() {
  return { pointQuery: '', studyId: '', studyOther: '' }
}

function selectPlanet(planet: Planet) {
  mobileSheetExpanded.value = false
  zoom.value = 0
  mapTarget.value = null
  triedSearch.value = false
  wheelDistance = 0
  lastWheelEvent = -Infinity
  lastWheelZoom = -Infinity
  selected.value = planet
  triedSubmit.value = false
  pointOpen.value = false
  form.value = blankForm()
}

function changeZoom(direction: number) {
  const nextZoom = Math.min(maxZoom.value, Math.max(0, zoom.value + direction))
  if (nextZoom === zoom.value) return
  zoom.value = nextZoom
  sourceRevealed.value = false
}

function wheelZoom(event: WheelEvent) {
  if (Math.abs(event.deltaY) < Math.abs(event.deltaX) || !event.deltaY || event.metaKey) return
  const now = performance.now()
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
  const delta = Math.sign(event.deltaY) * Math.min(120, Math.abs(event.deltaY * unit))
  if (now - lastWheelEvent > 240 || (wheelDistance && Math.sign(wheelDistance) !== Math.sign(delta))) {
    wheelDistance = 0
  }
  lastWheelEvent = now
  wheelDistance = Math.max(-150, Math.min(150, wheelDistance + delta))
  if (Math.abs(wheelDistance) < 150 || now - lastWheelZoom < 350) return
  changeZoom(wheelDistance < 0 ? 1 : -1)
  wheelDistance = 0
  lastWheelZoom = now
}

function markPoint(point: { planet: Planet; lat: number; lon: number }) {
  if (selected.value !== point.planet) return
  form.value.pointQuery = formatCoordinates(point.lat, point.lon, point.planet)
  pointOpen.value = false
  triedSubmit.value = false
}

function markLandmark(name: string) {
  form.value.pointQuery = name
  pointOpen.value = false
  triedSubmit.value = false
}

function goBack() {
  mobileSheetExpanded.value = false
  zoom.value = 0
  selected.value = null
}

function submitForm() {
  triedSubmit.value = true
  if (!resolved.value || !studyLabel.value) return
  pointOpen.value = false
  void findTerrain()
}

function onPointInput() {
  triedSearch.value = false
  pointOpen.value = true
  pointActive.value = 0
}

function closePointSoon() {
  window.setTimeout(() => {
    pointOpen.value = false
  }, 80)
}

function chooseSuggestion(index: number) {
  const suggestion = suggestions.value[index]
  if (!suggestion) return
  form.value.pointQuery = suggestion.query
  focusResult()
}

function focusResult() {
  triedSearch.value = true
  const point = resolved.value
  if (!point) return
  pointOpen.value = false
  if (mobileSheetExpanded.value) document.getElementById('map-point')?.blur()
  mobileSheetExpanded.value = false
  mapTarget.value = { lat: point.lat, lon: point.lon }
  zoom.value = selected.value === 'moon' && Math.abs(point.lat) > 72 ? 2 : Math.max(zoom.value, 2)
  sourceRevealed.value = false
}

function searchPoint() {
  if (resolved.value || !suggestions.value.length || !form.value.pointQuery.trim()) focusResult()
  else chooseSuggestion(pointActive.value)
}

function onPointKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const count = suggestions.value.length
    if (!count) return
    if (!pointOpen.value) {
      pointOpen.value = true
      pointActive.value = 0
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : -1
    pointActive.value = (pointActive.value + step + count) % count
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (pointOpen.value && pointActive.value > 0) chooseSuggestion(pointActive.value)
    else searchPoint()
    return
  }
  if (event.key === 'Escape') pointOpen.value = false
}

function chooseStudy(id: string) {
  if (form.value.studyId === id) return
  form.value.studyId = id
}

function revealPlanets() {
  introActive.value = false
}

function finishIntro() {
  introActive.value = false
  introVisible.value = false
}

useHead({
  htmlAttrs: { lang: locale },
  title: () => t('title'),
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'description', content: () => t('description') },
    { name: 'theme-color', content: '#000000' },
  ],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/nasa-logo.svg' }],
})
</script>

<template>
  <TerrainSearchResults v-if="showTerrainResults" :reference="resolved ? resolved.title + ' · ' + formatResolved(resolved.lat, resolved.lon) : ''"
    :planet="selected ?? 'moon'" :objective="studyLabel" :results="terrainResults" :loading="terrainLoading" :error="terrainError"
    @edit="closeTerrainResults" @retry="findTerrain" />
  <div v-else class="app-shell" :class="{ 'is-intro': introActive, 'is-exploring': selected, 'is-moon': selected === 'moon', 'is-mars': selected === 'mars' }">
    <NuxtRouteAnnouncer />

    <ClientOnly><Starfield :orbit="skyRotation" :parallax="!selected && !introActive" /></ClientOnly>
    <ClientOnly><PlanetScene :selected="selected" :zoom="zoom" :point="resolved" :target="mapTarget" :sheet-expanded="mobileSheetExpanded" @select="selectPlanet" @mark="markPoint" @landmark="markLandmark" @zoom="wheelZoom" @pinch="changeZoom" @orbit="moveStars" @scale="mapScale = $event" /></ClientOnly>

    <ClientOnly><NasaIntro v-if="introVisible" @leaving="revealPlanets" @finished="finishIntro" /></ClientOnly>

    <header v-if="selected" class="site-header">
      <a class="brand" href="/"  :aria-label="t('backDestinations')" @click.prevent="goBack">
        <img class="brand-logo" src="/nasa-logo.svg" alt="NASA" />
        <span class="brand-cross" aria-hidden="true">×</span><img class="brand-aezakmi" src="/aezakmi-logo.svg" alt="AEZAKMI" />
      </a>
    </header>

    <div v-if="selected && mapScale.kilometers" class="map-scale" :style="{ width: mapScale.pixels + 'px' }">
      <div class="map-scale__numbers">
        <span v-for="index in mapScale.segments + 1" :key="index" :style="{ left: (index - 1) / mapScale.segments * 100 + '%' }">
          {{ numberFormat.format(mapScale.kilometers * (index - 1) / mapScale.segments) }}{{ index === mapScale.segments + 1 ? ' km' : '' }}
        </span>
      </div>
      <div class="map-scale__bar" :class="{ 'has-three-segments': mapScale.segments === 3 }" aria-hidden="true" />
    </div>
    <div v-if="selected" class="planet-instruction">
      <span>{{ t('rotate') }}</span>
      <span>{{ t('zoom') }}</span>
    </div>

    <button v-if="selected && zoom > 0 && !sourceRevealed" type="button" class="surface-credit is-compact"
      :aria-label="t('showSource')" @click="sourceRevealed = true">
      <span class="surface-credit__icon" aria-hidden="true">i</span>
    </button>
    <a v-else-if="selected" class="surface-credit"
      :href="'https://trek.nasa.gov/' + selected + '/'" target="_blank" rel="noopener"
      :aria-label="selected === 'moon' ? 'NASA / JPL data from Moon Trek' : 'NASA / JPL data from Mars Trek'"
      :title="selected === 'moon' ? 'NASA / JPL Moon Trek' : 'NASA / JPL Mars Trek'">
      <span class="surface-credit__icon" aria-hidden="true">i</span>
      <span class="surface-credit__label" aria-hidden="true">{{ t('nasaData') }}</span>
    </a>
    <div v-if="selected" class="planet-zoom" role="group" :aria-label="t('surfaceZoom')">
      <button type="button" :aria-label="t('zoomIn')" :disabled="zoom >= maxZoom" @click="changeZoom(1)">+</button>
      <button type="button" :aria-label="t('zoomOut')" :disabled="zoom === 0" @click="changeZoom(-1)">−</button>
    </div>

    <Transition name="home-content">
      <main v-if="!selected" class="home-content" :inert="introActive">
        <h1 class="home-title">{{ t('choosePlanet') }}<span class="period">.</span></h1>

        <div class="planet-choices" :aria-label="t('chooseDestination')">
          <button class="planet-choice planet-choice--moon" type="button" :aria-label="t('moon')" @click="selectPlanet('moon')">
            <span class="planet-choice__ring" aria-hidden="true" />
            <span class="planet-choice__label">
              <span class="planet-choice__title">{{ t('moon') }}</span>
              <span class="planet-choice__subtitle">{{ t('earthMoon') }}</span>
            </span>
          </button>
          <button class="planet-choice planet-choice--mars" type="button" :aria-label="t('mars')" @click="selectPlanet('mars')">
            <span class="planet-choice__ring" aria-hidden="true" />
            <span class="planet-choice__label">
              <span class="planet-choice__title">{{ t('mars') }}</span>
              <span class="planet-choice__subtitle">{{ t('redPlanet') }}</span>
            </span>
          </button>
        </div>
      </main>
    </Transition>

    <button v-if="selected && resolved && !mobileSheetExpanded" type="button" class="mobile-continue"
      @click="showStudyStep">
      <span>{{ resolved.title === 'Custom point' ? formatResolved(resolved.lat, resolved.lon) : resolved.title }}</span>
      <strong>{{ t('chooseStudyStep') }} <span aria-hidden="true">↑</span></strong>
    </button>

    <Transition name="mission-panel">
      <main v-if="selected" class="mission-panel" :class="{ 'is-sheet-expanded': mobileSheetExpanded, 'is-sheet-dragging': sheetHeight }"
        :style="sheetHeight ? { '--sheet-drag-height': sheetHeight + 'px' } : undefined">
        <canvas class="mission-blur-backdrop" aria-hidden="true" />
        <button class="back-button" type="button" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12H4m0 0 6-6m-6 6 6 6" stroke="currentColor" stroke-width="1.5" /></svg>
          {{ t('backDestinations') }}
        </button>
        <button class="sheet-toggle" type="button" :aria-expanded="mobileSheetExpanded"
          :aria-label="mobileSheetExpanded ? t('showMap') : t('expandForm')"
          @pointerdown="startSheetDrag" @pointermove="moveSheetDrag"
          @pointerup="endSheetDrag" @pointercancel="endSheetDrag" @lostpointercapture="endSheetDrag"
          @click="toggleSheet">
          <span>{{ mobileSheetExpanded ? t('showMap') : t('expandForm') }}</span>
          <i aria-hidden="true" />
        </button>

        <div class="mission-content">
          <form class="mission-form" @submit.prevent="submitForm">
              <section class="point-block" :aria-label="t('mapSearch')">
                <label class="point-label" for="map-point">{{ t('choosePlace') }}</label>
                <div class="point-search-box">
                <div class="point-search-row">
                  <input
                    id="map-point"
                    v-model="form.pointQuery"
                    type="text"
                    name="point"
                    role="combobox"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="pointPlaceholder"
                    :aria-expanded="pointOpen && !resolved?.named"
                    aria-controls="point-menu"
                    aria-autocomplete="list"
                    :aria-activedescendant="pointOpen && suggestions[pointActive] ? `point-opt-${pointActive}` : undefined"
                    :aria-invalid="pointError ? true : undefined"
                    @focus="openPointInput"
                    @blur="closePointSoon"
                    @input="onPointInput"
                    @keydown="onPointKeydown"
                  />
                  <button type="button" class="point-search" @click="searchPoint">{{ t('find') }}</button>
                </div>
                <ul v-show="pointOpen && !resolved?.named" id="point-menu" class="point-menu" role="listbox">
                  <li v-if="!suggestions.length" class="point-empty">{{ t('noPlace') }}</li>
                  <li v-for="(suggestion, index) in suggestions" :key="suggestion.key" role="presentation">
                    <button
                      :id="`point-opt-${index}`"
                      type="button"
                      role="option"
                      class="point-option"
                      :class="{ 'is-active': index === pointActive }"
                      :aria-selected="index === pointActive"
                      @mouseenter="pointActive = index"
                      @click="chooseSuggestion(index)"
                    >
                      {{ suggestion.title }}
                      <small>{{ suggestion.meta }}</small>
                    </button>
                  </li>
                </ul>
                </div>
                <p v-if="!form.pointQuery.trim()" class="field-hint">{{ pointHint }}</p>
                <p v-if="resolved" class="point-readout">
                  <b>{{ resolved.title }}</b>
                  <span>{{ formatResolved(resolved.lat, resolved.lon) }}</span>
                </p>
                <p v-if="pointError" class="field-error">{{ pointError }}</p>
              </section>

              <div class="study-field">
                <p class="field-kicker" id="study-label"><b>{{ t('studyQuestion') }}</b></p>
                <div class="study-grid" role="radiogroup" aria-labelledby="study-label">
                  <button
                    v-for="study in studies"
                    :key="study.id"
                    type="button"
                    role="radio"
                    class="study-chip"
                    :class="{ 'is-selected': form.studyId === study.id }"
                    :aria-checked="form.studyId === study.id"
                    @click="chooseStudy(study.id)"
                  >
                    {{ studyTitle(study.id) }}
                  </button>
                </div>
                <button
                  type="button"
                  class="study-other"
                  :class="{ 'is-selected': form.studyId === 'other' }"
                  :aria-pressed="form.studyId === 'other'"
                  @click="chooseStudy('other')"
                >
                  {{ t('otherUse') }}
                  <span>+</span>
                </button>
                <p v-if="activeStudy" class="study-detail">{{ studyDetail(activeStudy.id) }}</p>
                <div v-if="activeStudy?.priorities?.length" class="criteria-review terrain-priorities">
                  <strong>{{ t('terrainPriorities') }}</strong>
                  <ol><li v-for="feature in activeStudy.priorities" :key="feature">{{ t(`feature.${feature}`) }}</li></ol>
                </div>
                <div v-if="form.studyId === 'other'" class="custom-research">
                  <label class="other-label">
                    <span>{{ t('customQuestion') }}</span>
                    <textarea v-model.trim="form.studyOther" name="study-other" rows="3" maxlength="600"
                      :placeholder="t('customPlaceholder')" required />
                  </label>
                </div>
                <p v-if="studyError" class="field-error">{{ studyError }}</p>
              </div>
              <button class="submit-button" type="submit">{{ t('findAnalogues') }} <span class="submit-arrow" aria-hidden="true"></span></button>
          </form>
        </div>

      </main>
    </Transition>
  </div>
</template>
