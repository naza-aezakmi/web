<script setup lang="ts">
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import { computed, ref } from 'vue'
import { formatCoordinates, nearestSites, parseCoordinates, resolvePoint, searchSites, studiesFor, type Planet } from '~/data/places'

const selected = ref<Planet | null>(null)
const introActive = ref(true)
const introVisible = ref(true)
const submitted = ref(false)
const triedSubmit = ref(false)
const pointOpen = ref(false)
const pointActive = ref(0)
const form = ref({ name: '', email: '', pointQuery: '', studyId: '', studyOther: '' })

const currentPlanet = computed(() => selected.value === 'moon'
  ? { name: 'The Moon', number: '01', type: "EARTH'S MOON" }
  : { name: 'Mars', number: '02', type: 'THE RED PLANET' })

const studies = computed(() => studiesFor(selected.value))
const resolved = computed(() => resolvePoint(selected.value, form.value.pointQuery))
const activeStudy = computed(() => studies.value.find(study => study.id === form.value.studyId) ?? null)
const studyLabel = computed(() => {
  if (form.value.studyId === 'other') return form.value.studyOther.trim()
  return activeStudy.value?.title ?? ''
})
const pointHint = computed(() => selected.value === 'mars'
  ? 'IAU name, or planetocentric latitude and 0–360° east longitude'
  : 'IAU name, or Mean Earth latitude and east longitude')
const pointPlaceholder = computed(() => selected.value === 'mars'
  ? 'Jezero or 18.445°N, 77.451°E'
  : 'Shackleton or 89.67°S, 129.78°E')

const suggestions = computed(() => {
  const planet = selected.value
  if (!planet) return []
  const query = form.value.pointQuery
  const coords = parseCoordinates(query)
  if (coords) {
    const typed = formatCoordinates(coords.lat, coords.lon, planet)
    return [
      { key: 'coords', title: 'Use these coordinates', meta: typed, query: typed },
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
  if (!triedSubmit.value || resolved.value) return ''
  return form.value.pointQuery.trim()
    ? 'Use a listed name, or latitude and longitude such as 18.445°N, 77.451°E.'
    : 'Mark a point by name or by coordinates.'
})
const studyError = computed(() => {
  if (!triedSubmit.value || studyLabel.value) return ''
  return form.value.studyId === 'other' ? 'Name the other study.' : 'Choose a study, or Other.'
})
const successSummary = computed(() => {
  const point = resolved.value
  if (!point || !selected.value || !studyLabel.value) return ''
  return `${point.title} · ${formatCoordinates(point.lat, point.lon, selected.value)}. Study: ${studyLabel.value}.`
})

function formatResolved(lat: number, lon: number) {
  return selected.value ? formatCoordinates(lat, lon, selected.value) : ''
}

function blankForm() {
  return { name: '', email: '', pointQuery: '', studyId: '', studyOther: '' }
}

function selectPlanet(planet: Planet) {
  selected.value = planet
  submitted.value = false
  triedSubmit.value = false
  pointOpen.value = false
  form.value = blankForm()
}

function markPoint(point: { planet: Planet; lat: number; lon: number }) {
  if (selected.value !== point.planet) return
  form.value.pointQuery = formatCoordinates(point.lat, point.lon, point.planet)
  pointOpen.value = false
  triedSubmit.value = false
}

function goBack() {
  selected.value = null
  submitted.value = false
}

function submitForm() {
  triedSubmit.value = true
  if (!resolved.value || !studyLabel.value) return
  pointOpen.value = false
  submitted.value = true
}

function onPointInput() {
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
  pointOpen.value = false
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
  if (event.key === 'Enter' && pointOpen.value && suggestions.value.length) {
    event.preventDefault()
    chooseSuggestion(pointActive.value)
    return
  }
  if (event.key === 'Escape') pointOpen.value = false
}

function chooseStudy(id: string) {
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
  htmlAttrs: { lang: 'en' },
  title: 'NASA — Choose the Moon or Mars',
  meta: [
    { name: 'description', content: 'Explore the Moon and Mars in an interactive 3D atlas.' },
    { name: 'theme-color', content: '#050506' },
  ],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/nasa-logo.svg' }],
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-intro': introActive, 'is-exploring': selected, 'is-moon': selected === 'moon', 'is-mars': selected === 'mars' }">
    <NuxtRouteAnnouncer />

    <ClientOnly><Starfield /></ClientOnly>
    <div class="ambient-shade" aria-hidden="true" />
    <div class="screen-grain" aria-hidden="true" />
    <ClientOnly><PlanetScene :selected="selected" :point="resolved ? { lat: resolved.lat, lon: resolved.lon } : null" @select="selectPlanet" @mark="markPoint" /></ClientOnly>

    <ClientOnly><NasaIntro v-if="introVisible" @leaving="revealPlanets" @finished="finishIntro" /></ClientOnly>

    <header v-if="selected" class="site-header">
      <a class="brand" href="/" aria-label="Back to planet selection" @click.prevent="goBack">
        <img class="brand-logo" src="/nasa-logo.svg" alt="NASA" />
      </a>
    </header>

    <p v-if="selected" class="planet-instruction">DRAG TO ROTATE <span>·</span> CLICK TO MARK</p>

    <Transition name="home-content">
      <main v-if="!selected" class="home-content" :inert="introActive">
        <h1 class="home-title">CHOOSE A<br class="mobile-title-break"> PLANET<span class="period">.</span></h1>

        <div class="planet-choices" aria-label="Choose a destination">
          <button class="planet-choice planet-choice--moon" type="button" aria-label="Choose the Moon" @click="selectPlanet('moon')">
            <span class="planet-choice__ring" aria-hidden="true" />
            <span class="planet-choice__label">
              <span class="planet-choice__title">MOON</span>
              <span class="planet-choice__subtitle">EARTH'S MOON</span>
            </span>
          </button>
          <button class="planet-choice planet-choice--mars" type="button" aria-label="Choose Mars" @click="selectPlanet('mars')">
            <span class="planet-choice__ring" aria-hidden="true" />
            <span class="planet-choice__label">
              <span class="planet-choice__title">MARS</span>
              <span class="planet-choice__subtitle">THE RED PLANET</span>
            </span>
          </button>
        </div>
      </main>
    </Transition>

    <Transition name="mission-panel">
      <main v-if="selected" class="mission-panel">
        <button class="back-button" type="button" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12H4m0 0 6-6m-6 6 6 6" stroke="currentColor" stroke-width="1.5" /></svg>
          BACK TO DESTINATIONS
        </button>

        <div class="mission-content">
          <p class="mission-overline"><span class="mission-overline__line" /> MISSION {{ currentPlanet.number }} <span>/ {{ currentPlanet.type }}</span></p>
          <h2>EXPLORE<br><span>{{ currentPlanet.name.toUpperCase() }}<i>.</i></span></h2>
          <p class="mission-description">Drag the planet to explore its surface, then click to mark a point. You can also enter a location below.</p>

          <Transition name="form-swap" mode="out-in">
            <div v-if="submitted" class="form-success" role="status">
              <div class="form-success__mark">✓</div>
              <h3>COURSE<br>CHARTED.</h3>
              <p class="form-success__course">{{ successSummary }}</p>
              <p>Demo form complete. Your information was not sent anywhere.</p>
              <button type="button" @click="submitted = false">EDIT DETAILS <span>↗</span></button>
            </div>
            <form v-else class="mission-form" @submit.prevent="submitForm">
              <label>
                <span>01 <b>YOUR NAME</b></span>
                <input v-model.trim="form.name" type="text" name="name" autocomplete="name" placeholder="What should we call you?" required />
              </label>
              <label>
                <span>02 <b>EMAIL ADDRESS</b></span>
                <input v-model.trim="form.email" type="email" name="email" autocomplete="email" placeholder="you@example.com" required />
              </label>
              <div class="point-block">
                <label class="point-label">
                  <span>03 <b>SURFACE POINT</b></span>
                  <input
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
                    @focus="pointOpen = true"
                    @blur="closePointSoon"
                    @input="onPointInput"
                    @keydown="onPointKeydown"
                  />
                </label>
                <ul v-show="pointOpen && !resolved?.named" id="point-menu" class="point-menu" role="listbox">
                  <li v-if="!suggestions.length" class="point-empty">No place with that name. Enter coordinates.</li>
                  <li v-for="(suggestion, index) in suggestions" :key="suggestion.key" role="presentation">
                    <button
                      :id="`point-opt-${index}`"
                      type="button"
                      role="option"
                      class="point-option"
                      :class="{ 'is-active': index === pointActive }"
                      :aria-selected="index === pointActive"
                      @mouseenter="pointActive = index"
                      @mousedown.prevent="chooseSuggestion(index)"
                    >
                      {{ suggestion.title }}
                      <small>{{ suggestion.meta }}</small>
                    </button>
                  </li>
                </ul>
                <p class="field-hint">{{ pointHint }}</p>
                <p v-if="resolved" class="point-readout">
                  <b>{{ resolved.title }}</b>
                  <span>{{ formatResolved(resolved.lat, resolved.lon) }}</span>
                </p>
                <p v-if="pointError" class="field-error">{{ pointError }}</p>
              </div>

              <div class="study-field">
                <p class="field-kicker" id="study-label">04 <b>STUDIED ON EARTH</b></p>
                <div class="study-grid" role="radiogroup" aria-labelledby="study-label">
                  <button
                    v-for="(study, index) in studies"
                    :key="study.id"
                    type="button"
                    role="radio"
                    class="study-chip"
                    :class="{ 'is-selected': form.studyId === study.id }"
                    :aria-checked="form.studyId === study.id"
                    @click="chooseStudy(study.id)"
                  >
                    <em>{{ String(index + 1).padStart(2, '0') }}</em>
                    {{ study.title }}
                  </button>
                </div>
                <button
                  type="button"
                  class="study-other"
                  :class="{ 'is-selected': form.studyId === 'other' }"
                  :aria-pressed="form.studyId === 'other'"
                  @click="chooseStudy('other')"
                >
                  OTHER
                  <span>+</span>
                </button>
                <p v-if="activeStudy" class="study-detail">{{ activeStudy.detail }}</p>
                <label v-if="form.studyId === 'other'" class="other-label">
                  <input v-model.trim="form.studyOther" type="text" name="study-other" placeholder="Name the study" required />
                </label>
                <p v-if="studyError" class="field-error">{{ studyError }}</p>
              </div>
              <button class="submit-button" type="submit">BEGIN EXPEDITION <span>↗</span></button>
            </form>
          </Transition>
        </div>

        <div class="mission-footnote">NASA / MISSION CONTROL <span>© 2026</span></div>
      </main>
    </Transition>
  </div>
</template>
