<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EnvironmentPair, TerrainBody } from '../../shared/terrain'

const props = defineProps<{ planet: TerrainBody; source: { lat: number; lon: number }; site: { lat: number; lon: number; country?: string | null } }>()
const result = ref<EnvironmentPair | null>(null)
const loading = ref(false)
const error = ref('')
const cache = new Map<string, EnvironmentPair>()
let controller: AbortController | undefined
let generation = 0
const passports = computed(() => result.value ? [result.value.reference, result.value.earth] : [])
const hasUnavailable = computed(() => passports.value.some(p => p.status === 'unavailable'))
const number = (value: number, digits = 1) => value.toLocaleString('en-US', { maximumFractionDigits: digits })
const location = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`
function title(body: string) { return body === 'earth' ? `Earth · ${props.site.country || 'candidate'}` : body === 'moon' ? 'Moon · surface observations' : 'Mars · model snapshot' }

async function load(force = false) {
  controller?.abort()
  const current = ++generation
  const key = JSON.stringify([props.planet, props.source.lat, props.source.lon, props.site.lat, props.site.lon])
  error.value = ''
  if (!force && cache.has(key)) { result.value = cache.get(key)!; loading.value = false; return }
  result.value = null
  loading.value = true
  const request = new AbortController()
  controller = request
  try {
    const data = await $fetch<EnvironmentPair>('/api/terrain-context', {
      method: 'POST', body: { planet: props.planet, lat: props.source.lat, lon: props.source.lon, earth_lat: props.site.lat, earth_lon: props.site.lon }, signal: request.signal,
    })
    if (current !== generation || request.signal.aborted) return
    result.value = data
    if (data.earth.status !== 'unavailable' && data.reference.status !== 'unavailable') cache.set(key, data)
  } catch {
    if (current === generation && !request.signal.aborted) error.value = 'Environmental data could not be loaded. You can retry while continuing to explore terrain matches.'
  } finally {
    if (current === generation && !request.signal.aborted) loading.value = false
  }
}
watch(() => [props.planet, props.source.lat, props.source.lon, props.site.lat, props.site.lon], () => { void load() }, { immediate: true })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="environment" aria-labelledby="environment-heading" data-testid="environment-passport">
    <div class="environment-heading"><h3 id="environment-heading">Conditions at the two locations</h3><span>PLANNING CONTEXT · OUTSIDE THE SCORE</span></div>
    <p class="environment-intro">Terrain can be similar while temperature and atmosphere differ greatly. These passports describe those differences and help plan a field test.</p>
    <p v-if="loading" class="environment-loading" role="status">Loading source data and Earth climate normals…</p>
    <div v-else-if="error" role="status"><p>{{ error }}</p><button class="environment-retry" type="button" @click="load(true)">Retry conditions</button></div>
    <template v-else-if="result">
      <div class="passport-grid">
        <article v-for="passport in passports" :key="passport.body" class="passport" :data-body="passport.body">
          <h4>{{ title(passport.body) }}</h4>
          <p v-if="passport.source" class="passport-period">{{ passport.source.period }}</p>
          <p v-if="passport.status === 'unavailable'" class="passport-unavailable">{{ passport.notes[0] }}</p>
          <dl v-else class="metric-grid">
            <div v-for="metric in passport.metrics" :key="metric.id" :title="metric.description">
              <dt>{{ metric.label }}</dt><dd v-if="metric.value !== null">{{ number(metric.value, metric.id === 'precipitation_mm_day' ? 2 : 1) }} <small>{{ metric.unit }}</small></dd><dd v-else class="metric-missing">Not available</dd>
            </div>
          </dl>
          <p v-if="passport.coverage" class="passport-coverage">{{ passport.coverage.valid_bins }} / {{ passport.coverage.total_bins }} local-time bins contain observations. Gaps can miss temperature extremes.</p>
          <p v-if="passport.body === 'moon' && passport.notes[0]" class="passport-grid-location">{{ passport.notes[0] }}</p>
          <p v-if="passport.sampled_location" class="passport-grid-location">Sampled at {{ location(passport.sampled_location.lat, passport.sampled_location.lon) }}.<br />{{ passport.sampled_location.note }}</p>
          <details v-if="passport.notes.length && passport.status !== 'unavailable'" class="passport-notes"><summary>What these values mean</summary><p v-for="note in passport.notes" :key="note">{{ note }}</p><p v-for="metric in passport.metrics" :key="metric.id"><strong>{{ metric.label }}:</strong> {{ metric.description }}</p></details>
          <a v-if="passport.source" class="passport-source" :href="passport.source.url" target="_blank" rel="noopener noreferrer">{{ passport.source.label }} ↗</a>
        </article>
      </div>
      <p class="environment-comparison">{{ result.comparison_note }}</p>
      <button v-if="hasUnavailable" class="environment-retry" type="button" @click="load(true)">Retry missing conditions</button>
    </template>
  </section>
</template>

<style scoped>
.environment { border-block: 1px solid #ffffff20; padding-block: 22px; margin: 22px 0; }
.environment-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px 18px; flex-wrap: wrap; }
h3 { margin: 0; font-size: 1.12rem; }
.environment-heading > span { color: #b3bfcb; font-size: .63rem; letter-spacing: .06em; }
p { font-size: .85rem; line-height: 1.65; color: #b8c3ce; }
.environment-intro { margin: 9px 0 16px; }
.passport-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.passport { padding: 18px; border: 1px solid #ffffff1f; border-radius: 16px; background: #14181d; min-width: 0; }
h4 { font-size: 1rem; font-weight: 600; margin: 0 0 8px; }
.passport-period { font-size: .72rem; color: #aebdcb; margin: 6px 0 15px; }
.metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.metric-grid > div { padding: 12px 10px; border-radius: 10px; background: #ffffff06; }
dt { font-size: .7rem; color: #b2bdc8; margin-bottom: 6px; }
dd { font-size: 1.17rem; color: #f2f5f7; margin: 0; font-variant-numeric: tabular-nums; }
dd small { font-size: .72rem; color: #b3c9db; }
.metric-missing { font-size: .78rem; color: #8898a8; }
.passport-grid-location,.passport-coverage { font-size: .71rem; margin: 12px 0; }
.passport-coverage { color: #d1ba98; }
.passport-notes { font-size: .72rem; margin: 14px 0; }
.passport-notes summary { color: #d1dce5; cursor: pointer; }
.passport-notes p { font-size: .72rem; }
.passport-source { color: #accbe5; font-size: .72rem; overflow-wrap: anywhere; }
.environment-comparison { font-size: .77rem; }
.environment-retry { min-height: 42px; border: 1px solid #ffffff38; padding: 10px 15px; border-radius: 99px; background: #ffffff08; color: white; font: inherit; font-size: .8rem; cursor: pointer; }
.environment-loading { padding: 18px; border-radius: 12px; background: #ffffff06; }
@media(max-width: 760px) { .passport-grid { grid-template-columns: 1fr; }.passport { padding: 15px; } }
</style>
