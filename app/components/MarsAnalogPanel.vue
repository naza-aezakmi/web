<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MarsAnalogResult, TerrainFeatures } from '../../shared/marsAnalog'

const props = defineProps<{
  result: MarsAnalogResult | null
  point: { lat: number; lon: number }
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; retry: [] }>()
const active = ref(0)
const imageFailed = ref(false)
const imageLoaded = ref(false)
const closeButton = ref<HTMLButtonElement | null>(null)
const candidate = computed(() => props.result?.candidates[active.value])
watch(() => props.result, () => { active.value = 0 })
watch(() => candidate.value?.id, () => { imageFailed.value = false; imageLoaded.value = false })
const coordinates = (lat: number, lon: number) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`
const number = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: digits })
const featureLabels: Record<keyof TerrainFeatures, string> = {
  median_slope_deg: 'Median slope', p90_slope_deg: '90th percentile slope', relief_p95_p05_m: 'Elevation relief',
}
const comparisons = computed(() => candidate.value?.match_explanation.comparisons ?? [])
const cover = computed(() => candidate.value?.landcover)
const outsideImageryCoverage = computed(() => Math.abs(candidate.value?.lat ?? 0) > 85.05)
const hasVegetation = computed(() => (cover.value?.vegetated_fraction ?? 0) > .5)
const imageryService = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
const satelliteUrl = computed(() => {
  const c = candidate.value
  if (!c) return ''
  const halfLat = .14, halfLon = .24 / Math.max(.05, Math.cos(c.lat * Math.PI / 180))
  const params = new URLSearchParams({
    bbox: `${c.lon - halfLon},${Math.max(-90, c.lat - halfLat)},${c.lon + halfLon},${Math.min(90, c.lat + halfLat)}`,
    bboxSR: '4326', imageSR: '4326', size: '1000,600', format: 'jpg', f: 'image', adjustAspectRatio: 'false',
  })
  return `${imageryService}/export?${params}`
})
const mapLink = computed(() => candidate.value ? `https://www.google.com/maps/search/?api=1&query=${candidate.value.lat},${candidate.value.lon}` : '')
const biggestResidual = computed(() => [...comparisons.value].sort((a, b) => b.mismatch_share - a.mismatch_share)[0])
function escape(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }
onMounted(() => { closeButton.value?.focus({ preventScroll: true }); window.addEventListener('keydown', escape) })
onBeforeUnmount(() => window.removeEventListener('keydown', escape))
</script>

<template>
  <aside class="analog-panel" aria-labelledby="analog-heading" data-testid="mars-analog-panel">
    <header class="analog-header">
      <div><span class="analog-kicker">MARS <span aria-hidden="true">↗</span> EARTH</span><h1 id="analog-heading">Find your Earth analog<span>.</span></h1></div>
      <button ref="closeButton" type="button" class="analog-close" aria-label="Close Earth analogs" @click="emit('close')">×</button>
    </header>
    <p class="analog-point">Selected on Mars <strong>{{ coordinates(point.lat, point.lon) }}</strong></p>
    <div v-if="loading" class="analog-status" role="status"><span class="analog-loader" />Loading the terrain model…</div>
    <div v-else-if="error" class="analog-status" role="alert"><p>{{ error }}</p><button type="button" class="analog-action" @click="emit('retry')">Try again</button></div>
    <template v-else-if="result && candidate">
      <div class="analog-type"><span>TYPE {{ String(result.terrainType.id + 1).padStart(2, '0') }} / 10</span><strong>{{ result.terrainType.display_name }}</strong></div>
      <nav class="analog-choices" aria-label="Earth candidates">
        <button v-for="(site, index) in result.candidates" :key="site.id" type="button" :aria-pressed="active === index" :class="{ active: active === index }" @click="active = index">
          <span>{{ String(index + 1).padStart(2, '0') }}</span> {{ site.location.country }}
        </button>
      </nav>
      <article :key="candidate.id" class="analog-site">
        <div class="analog-site-heading"><span class="analog-kicker">EARTH CANDIDATE {{ active + 1 }}</span><h2>{{ candidate.location.label }}</h2><p>{{ coordinates(candidate.lat, candidate.lon) }}</p></div>
        <figure class="analog-photo">
          <div class="analog-image-frame" :aria-busy="!imageLoaded && !imageFailed && !outsideImageryCoverage">
            <img v-if="!imageFailed && !outsideImageryCoverage" :src="satelliteUrl" :alt="`Satellite view centered on ${candidate.location.label}, ${coordinates(candidate.lat, candidate.lon)}`" @load="imageLoaded = true" @error="imageFailed = true" />
            <span v-if="!imageFailed && !outsideImageryCoverage" class="analog-pin" aria-hidden="true" />
            <p v-if="imageFailed || outsideImageryCoverage" class="analog-image-status">Satellite imagery is unavailable{{ outsideImageryCoverage ? ' at this latitude' : '' }}.<br />You can still open the exact coordinates on the map.</p>
            <p v-else-if="!imageLoaded" class="analog-image-status" role="status">Loading satellite imagery…</p>
            <a class="analog-map-link" :href="mapLink" target="_blank" rel="noopener noreferrer">Open on Earth map ↗</a>
          </div>
          <figcaption>{{ outsideImageryCoverage ? 'Coordinates only · polar imagery coverage unavailable' : 'Satellite view · regional candidate' }}<br /><a :href="imageryService" target="_blank" rel="noopener noreferrer">Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community</a></figcaption>
        </figure>
        <section class="analog-evidence" aria-labelledby="analog-why">
          <h3 id="analog-why">Why this place?</h3>
          <p>The model compares three terrain measurements with the trained Mars type prototype. Smaller distance means closer regional terrain.</p>
          <table>
            <caption class="sr-only">Terrain comparison with the Mars type prototype</caption>
            <thead><tr><th scope="col">Terrain</th><th scope="col">Mars type</th><th scope="col">Earth</th></tr></thead>
            <tbody><tr v-for="row in comparisons" :key="row.feature"><th scope="row">{{ featureLabels[row.feature] }}</th><td>{{ number(row.mars_prototype_value, row.feature === 'relief_p95_p05_m' ? 0 : 2) }}{{ row.feature === 'relief_p95_p05_m' ? ' m' : '°' }}</td><td>{{ number(row.earth_value, row.feature === 'relief_p95_p05_m' ? 0 : 2) }}{{ row.feature === 'relief_p95_p05_m' ? ' m' : '°' }}</td></tr></tbody>
          </table>
          <div class="analog-distance"><span>Terrain distance <strong>{{ number(candidate.distance, 4) }}</strong></span><span>Raw terrain rank <strong>#{{ candidate.match_explanation.terrain_rank_before_diversity_and_cover }}</strong></span></div>
          <p v-if="candidate.match_explanation.visible_partial_match" class="analog-caveat">Partial terrain match: at least one feature differs by 20% or more. This display threshold is not an engineering acceptance limit.</p>
          <p v-if="hasVegetation" class="analog-caveat">Similar terrain, different surface: {{ number(cover!.vegetated_fraction * 100, 0) }}% of the screened Earth area is vegetated.</p>
          <p v-else-if="cover" class="analog-cover">Earth cover: {{ number(cover.bare_sparse_fraction * 100, 0) }}% bare / sparse · {{ number(cover.snow_ice_fraction * 100, 0) }}% snow / ice</p>
          <p v-else class="analog-cover">Land-cover screening is unavailable here.</p>
        </section>
        <details class="analog-details">
          <summary>Model explanation & climate context</summary>
          <p>MiniBatchKMeans groups Mars into 10 regional terrain types. The catalog retrieves nearest Earth terrain from 1,323,499 eligible locations using log-transformed, robust-scaled features. Three locations are separated by over 500 km; bare / sparse candidates are shown first within that shortlist.</p>
          <p>Largest contribution to the remaining distance: <strong>{{ biggestResidual ? featureLabels[biggestResidual.feature].toLowerCase() : 'Unavailable' }}</strong>. The bars split squared distance into exact feature contributions; they are not confidence scores.</p>
          <div v-for="row in comparisons" :key="row.feature" class="analog-contribution"><span>{{ featureLabels[row.feature] }}</span><span>{{ number(row.mismatch_share * 100, 0) }}%</span><div><i :style="{ width: `${row.mismatch_share * 100}%` }" /></div></div>
          <h4>Climate is context, outside the terrain score</h4>
          <p>Earth long-term climatology (NASA POWER): air temperature at 2 m {{ number(candidate.climate?.air_temperature_2m_c) }} °C; precipitation {{ number(candidate.climate?.precipitation_mm_day) }} mm/day; relative humidity {{ number(candidate.climate?.relative_humidity_pct) }}%.</p>
          <p>Mars model snapshot (MCD 6.2): surface temperature {{ number(result.climate?.surface_temperature_c) }} °C; atmospheric pressure at 10 m {{ number(result.climate?.pressure_10m_pa, 0) }} Pa. Ls = 0°, local noon, average solar scenario. These periods and quantities are not equivalent to Earth's climatology.</p>
          <p>Mars humidity and precipitation: unavailable. Soil composition, rocks and wheel-scale obstacles are not predicted.</p>
          <a :href="candidate.location.source" target="_blank" rel="noopener noreferrer">Region labels: Natural Earth ↗</a>
        </details>
      </article>
      <footer class="analog-footnote">Regional screening · 0.5° lookup · terrain descriptors over about 50 km radius. Every point in one type shares the same Earth catalog. Field inspection is needed before rover testing.</footer>
    </template>
  </aside>
</template>

<style scoped>
.analog-panel { position: fixed; z-index: 20; inset: 14px auto 14px 14px; width: min(50vw, 740px); min-width: 390px; padding: clamp(20px, 2.4vw, 34px); overflow-y: auto; overscroll-behavior: contain; border: 1px solid #ffffff30; border-radius: 30px; background: #101318f5; color: #f4f5f7; box-shadow: 20px 0 80px #0007; backdrop-filter: blur(24px); font-family: Geist, Arial, sans-serif; scrollbar-width: thin; scrollbar-color: #62676f transparent; }
.analog-panel * { box-sizing: border-box; }
.analog-header { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
.analog-kicker { color: #a8c6dc; font-size: 10px; font-weight: 650; letter-spacing: .15em; }
h1 { font-size: clamp(24px, 2.8vw, 40px); font-weight: 500; line-height: 1.08; letter-spacing: -.05em; margin: 10px 0 0; }
h1 > span { color: #9dc3ef; }
.analog-close { flex: none; width: 44px; height: 44px; border: 1px solid #ffffff32; border-radius: 50%; background: #ffffff0c; color: #fff; font-family: inherit; font-size: 28px; line-height: 1; cursor: pointer; }
.analog-point { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: #aab2bd; margin: 18px 0; }
.analog-point strong { color: #e4e9ef; font-weight: 500; }
.analog-type { padding: 12px 0; border-top: 1px solid #ffffff20; display: grid; gap: 7px; }
.analog-type > span { color: #9dc3ef; font-size: 10px; letter-spacing: .12em; }
.analog-type > strong { font-size: 15px; font-weight: 500; }
.analog-choices { display: flex; gap: 7px; margin: 6px 0 20px; }
.analog-choices button { flex: 1; min-width: 0; min-height: 44px; padding: 9px 10px; text-align: left; border: 1px solid #ffffff20; border-radius: 12px; background: #ffffff06; color: #cad0d8; font: 11px/1.4 Geist, Arial, sans-serif; cursor: pointer; }
.analog-choices button > span { display: block; font-size: 9px; opacity: .65; }
.analog-choices button.active { background: #edf2f6; color: #1b222b; border-color: #fff; }
.analog-site-heading h2 { margin: 6px 0; font-size: clamp(22px, 2.2vw, 32px); font-weight: 500; line-height: 1.12; letter-spacing: -.04em; }
.analog-site-heading p { margin: 5px 0 15px; color: #c7d3df; font-size: 12px; }
.analog-photo { margin: 0; }
.analog-image-frame { position: relative; overflow: hidden; aspect-ratio: 5 / 3; border-radius: 18px; background: radial-gradient(ellipse at 50% 60%, #334338, #181f28); }
.analog-image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
.analog-pin { position: absolute; top: 50%; left: 50%; width: 11px; height: 11px; border: 2px solid #fff; background: #6fb9dd; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 7px #0004, 0 2px 10px #000; }
.analog-map-link { position: absolute; bottom: 12px; right: 12px; padding: 10px 13px; border: 1px solid #ffffff60; border-radius: 99px; background: #111b22dd; color: white; text-decoration: none; font-size: 11px; }
.analog-photo figcaption { font-size: 9px; color: #919ba8; line-height: 1.6; margin-top: 7px; }
.analog-photo a,.analog-details a { color: inherit; }
.analog-image-status { position: absolute; inset: 0; display: grid; align-content: center; text-align: center; padding: 24px; color: #e4e9ef; font-size: 12px; }
.analog-evidence { margin-top: 24px; }
h3 { font-size: 18px; font-weight: 500; margin: 0 0 8px; letter-spacing: -.025em; }
.analog-evidence > p,.analog-details p { font-size: 11px; color: #b8c1cc; line-height: 1.65; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 11px; margin-top: 14px; }
th,td { padding: 10px 0; border-bottom: 1px solid #ffffff16; }
thead th { color: #8998a9; font-size: 10px; font-weight: 400; }
tbody th { font-weight: 400; color: #c8d0db; }
td { font-variant-numeric: tabular-nums; white-space: nowrap; }
td,thead th:not(:first-child) { text-align: right; }
.analog-distance { display: flex; flex-wrap: wrap; gap: 6px 20px; padding-top: 12px; color: #9aa9ba; font-size: 10px; }
.analog-distance strong { color: #d4e4f0; font-weight: 500; margin-left: 4px; }
.analog-evidence .analog-caveat { color: #e4c99f; padding: 10px 12px; border-left: 2px solid #b59565; background: #c7a06809; }
.analog-details { padding: 16px 0; border-block: 1px solid #ffffff1c; margin-top: 22px; font-size: 11px; }
.analog-details summary { cursor: pointer; color: #d4e0ea; min-height: 26px; }
.analog-details h4 { font-size: 12px; margin-bottom: 7px; }
.analog-contribution { display: flex; flex-wrap: wrap; gap: 5px; justify-content: space-between; color: #aab9c8; margin: 12px 0; font-size: 10px; }
.analog-contribution > div { flex-basis: 100%; height: 4px; border-radius: 3px; background: #ffffff10; }
.analog-contribution i { display: block; height: 100%; border-radius: inherit; background: #9fbfd6; }
.analog-footnote { font-size: 10px; line-height: 1.7; color: #8493a3; margin-top: 16px; }
.analog-status { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 14px; min-height: 160px; color: #c8d5e2; }
.analog-loader { width: 22px; height: 22px; border: 2px solid #ffffff30; border-top-color: #c4def2; border-radius: 50%; animation: analog-spin 1s linear infinite; }
.analog-action { border: 1px solid #ffffff40; border-radius: 99px; padding: 10px 18px; background: transparent; color: white; font: inherit; cursor: pointer; }
.analog-panel button:focus-visible,.analog-panel a:focus-visible,.analog-panel summary:focus-visible { outline: 2px solid #c4def2; outline-offset: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@keyframes analog-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .analog-panel { inset: auto 0 0; width: 100%; min-width: 0; max-height: 70dvh; padding: 22px 20px calc(22px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; }
  h1 { font-size: 29px; }
  .analog-type > strong { font-size: 14px; }
  .analog-choices button { font-size: 11px; }
  .analog-evidence > p,.analog-details p,table { font-size: 12px; }
  .analog-point,.analog-footnote { font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .analog-loader { animation: none; } }
</style>
