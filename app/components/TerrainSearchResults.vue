<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TerrainResults } from '../../shared/terrain'
import { TERRAIN_FEATURES, formatCoordinates, type Planet } from '~/data/places'

const props = defineProps<{
  planet: Planet
  reference: string
  objective: string
  results: TerrainResults | null
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ edit: []; retry: [] }>()
const sourceName = computed(() => props.planet === 'mars' ? 'Mars' : 'Moon')
const active = ref(0)
const candidate = computed(() => props.results?.matches[active.value])
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const coordinates = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)}°${lon < 0 ? 'W' : 'E'}`
const format = (value: number, unit: string) => `${number.format(value)}${unit === '°' ? '' : ' '}${unit}`
const comparison = computed(() => {
  const site = candidate.value
  const result = props.results
  if (!site || !result) return []
  const rows = [
    { id: 'profile', source: 0, earth: site.error, unit: 'm', normalization: 100 },
    { id: 'range', source: result.criteria.range, earth: site.range, unit: 'm', normalization: 150 },
    { id: 'slope', source: result.criteria.slope, earth: site.slope, unit: '°', normalization: 2 },
    { id: 'roughness', source: result.criteria.roughness, earth: site.roughness, unit: 'm', normalization: 50 },
  ] as const
  return rows.map(row => {
    const delta = Math.abs(row.earth - row.source)
    const weight = result.weights[row.id]
    return { ...row, label: TERRAIN_FEATURES[row.id], delta, weight, contribution: weight * (delta / row.normalization) ** 2 }
  }).sort((a, b) => b.weight - a.weight)
})
const largestDifference = computed(() => comparison.value.reduce<(typeof comparison.value)[number] | undefined>(
  (largest, row) => !largest || row.contribution > largest.contribution ? row : largest, undefined))
</script>

<template>
  <main class="terrain-results">
    <div class="results-overview" :class="{ 'has-map': results && candidate }">
      <header class="results-nav">
        <div class="results-brand"><img src="/nasa-logo.svg" alt="NASA"> NASA x AEZAKMI</div>
        <button class="results-back" type="button" @click="emit('edit')">← Edit search</button>
      </header>
      <section class="results-intro">
        <h1>Earth terrain analogues</h1>
        <div class="results-reference">
          <p>{{ reference }}</p>
          <p class="objective">{{ objective }}</p>
        </div>
      </section>

      <div v-if="loading" class="results-status" role="status">
        <span class="results-spinner" aria-hidden="true" />
        <div><strong>Comparing elevation profiles</strong><p>The first search loads the terrain index on the server.</p></div>
      </div>
      <div v-else-if="error" class="results-status" role="alert">
        <div><strong>Search unavailable</strong><p>{{ error }}</p></div>
        <button type="button" class="results-back" @click="emit('retry')">Retry</button>
      </div>
      <div v-else-if="results && candidate" class="results-layout">
        <nav class="results-list" aria-label="Ranked Earth candidates">
          <h2>Ranked sites</h2>
          <p>{{ number.format(results.eligibleCount) }} windows passed the land screen</p>
          <button v-for="(site, index) in results.matches" :key="site.position" class="results-choice"
            :class="{ 'is-active': active === index }" :aria-pressed="active === index" @click="active = index">
            <span class="results-rank">{{ String(index + 1).padStart(2, '0') }}</span>
            <span><strong>{{ coordinates(site.lat, site.lon) }}</strong><small>{{ site.usa ? 'United States · ' : '' }}{{ format(site.error, 'm') }} profile RMSE</small></span>
          </button>
        </nav>
        <article class="results-detail" aria-label="Selected Earth candidate">
          <div class="site-title"><h2>Site {{ String(active + 1).padStart(2, '0') }}</h2><p>{{ coordinates(candidate.lat, candidate.lon) }}</p></div>
          <TerrainSatellite :key="candidate.position" :site="candidate" :step="results.step" :radius="results.earth.radius" />
        </article>
      </div>
      <p v-else class="results-status" role="status">No matching land windows were returned.</p>
    </div>
    <section v-if="results && candidate" class="results-report" aria-label="Selected site analysis">
      <h2>Site {{ String(active + 1).padStart(2, '0') }} · Terrain analysis</h2>
      <p>After subtracting the mean elevation and testing 90° rotations, the two profiles differ by
        <strong>{{ format(candidate.error, 'm') }} RMS</strong> across {{ results.size ** 2 }} elevations.
        <template v-if="largestDifference?.contribution">
          The largest penalty in the weighted score came from {{ largestDifference.label.toLowerCase() }}
          ({{ format(largestDifference.delta, largestDifference.unit) }} difference).
        </template>
      </p>
      <div class="comparison-scroll">
        <table>
          <thead><tr><th scope="col">Criterion</th><th scope="col">Weight</th><th scope="col">{{ sourceName }}</th><th scope="col">Earth</th><th scope="col">Difference</th></tr></thead>
          <tbody>
            <tr v-for="row in comparison" :key="row.id">
              <th scope="row">{{ row.label }}</th><td>{{ number.format(row.weight * 100) }}%</td>
              <td v-if="row.id === 'profile'" colspan="2">Aligned relative profiles</td>
              <template v-else><td>{{ format(row.source, row.unit) }}</td><td>{{ format(row.earth, row.unit) }}</td></template>
              <td>{{ format(row.delta, row.unit) }}{{ row.id === 'profile' ? ' RMS' : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <TerrainMatrices :source-name="sourceName" :source="results.query" :earth="candidate.values" :size="results.size" :rotation="candidate.rotation" />
      <h3>Field screening</h3>
      <p class="results-method">The full search window passes the coastal and lake mask. The mask represents mapped water at regional scale. Check smaller streams, seasonal flooding, access and ground conditions before field testing.
        <a href="https://www.naturalearthdata.com/downloads/10m-physical-vectors/" target="_blank" rel="noopener noreferrer">Natural Earth ↗</a>
      </p>
      <p v-if="results.prioritySource === 'ai'" class="results-method">AI ranked the four terrain criteria from your objective. The elevation index calculated and ranked the matches.</p>
      <p v-if="results.prioritySource === 'default'" class="results-method">Default terrain weights were used because AI prioritization was unavailable.</p>
      <h3>Data and scale</h3>
      <p class="results-method">Reference window centre {{ formatCoordinates(results.source.lat, results.source.lon, planet) }}.
        {{ results.source.label }} ({{ format(results.source.resolution, 'm') }}) and {{ results.earth.label }} ({{ format(results.earth.resolution, 'm') }}).
        Both elevation profiles use {{ results.size }} × {{ results.size }} samples spaced {{ format(results.step / (results.size - 1) / 1000, 'km') }} apart.
        This supports regional screening. A 500 m test plot requires a finer elevation model and field verification.</p>
    </section>
  </main>
</template>

<style scoped>
.terrain-results { position: fixed; inset: 0; overflow: auto; background: #090909; color: #f4f5f7; font-family: Manrope, sans-serif; --results-top: clamp(16px, 2.6vw, 42px); padding: var(--results-top) clamp(18px, 4vw, 64px) 28px; }
.results-overview,.results-report { max-width: 1320px; margin-inline: auto; }
.results-overview { display: flex; flex-direction: column; }
.results-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.results-brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: .9rem; letter-spacing: .05em; }
.results-brand img { width: 46px; }
.results-back { flex: none; border: 1px solid #ffffff30; border-radius: 99px; background: #ffffff12; color: #fff; padding: 9px 14px; font: inherit; cursor: pointer; }
.results-back:hover { background: #ffffff24; }
.results-intro { display: flex; justify-content: space-between; align-items: end; gap: 10px 24px; margin-block: 16px; }
.results-reference { text-align: right; max-width: min(42%, 28rem); }
.results-reference p { margin: 3px 0; font-size: .9rem; }
h1 { font-size: clamp(2rem, 4vw, 3.65rem); letter-spacing: -.065em; line-height: 1.05; margin: 0; }
h2 { margin: 0; font-size: 1.18rem; }
p { margin: 6px 0; color: #bfc5cd; overflow-wrap: anywhere; }
.objective { color: #f0f2f6; }
.results-layout { display: grid; grid-template-columns: minmax(230px, 300px) minmax(0, 1fr); align-items: stretch; gap: clamp(16px, 3vw, 36px); }
.results-list,.results-report,.results-status { background: linear-gradient(135deg, #242424, #141414); border: 1px solid #ffffff25; border-radius: 24px; padding: 18px; }
.results-list > p,.results-method { font-size: .86rem; line-height: 1.65; }
.results-choice { display: flex; align-items: center; gap: 10px; text-align: left; width: 100%; margin-top: 8px; padding: 10px; border: 1px solid transparent; border-radius: 13px; background: #ffffff08; color: #fff; font: inherit; font-size: .85rem; cursor: pointer; }
.results-choice:hover { border-color: #ffffff50; }
.results-choice.is-active { background: #f1f3f6; color: #15171a; }
.results-choice small { display: block; opacity: .74; margin-top: 3px; }
.results-rank { opacity: .66; font-variant-numeric: tabular-nums; }
.site-title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; margin: 0 0 10px; }
.results-report { margin-block: 20px 0; }
.results-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.results-method a { color: inherit; }
.results-report > p { line-height: 1.65; }
.results-report h3 { margin: 20px 0 0; font-size: .95rem; }
.comparison-scroll { overflow-x: auto; }
table { width: 100%; text-align: left; border-collapse: collapse; margin: 12px 0; font-size: .85rem; }
th,td { padding: 9px 8px; border-bottom: 1px solid #ffffff1c; }
td { white-space: nowrap; color: #d6dbe2; }
.results-status { display: flex; gap: 14px; align-items: center; }
.results-spinner { display: block; width: 22px; height: 22px; flex: none; border: 2px solid #ffffff40; border-top-color: #fff; border-radius: 50%; animation: terrain-spin .8s linear infinite; }
@keyframes terrain-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .results-spinner { animation: none; } }
@media (min-width: 761px) {
  .results-overview.has-map { height: max(500px, calc(100dvh - var(--results-top) - 8px)); }
  .results-layout { flex: 1; min-height: 0; }
  .results-list { overflow-y: auto; }
  .results-detail :deep(.satellite) { flex: 1; min-height: 0; }
}
@media (max-width: 760px) {
  .results-intro { align-items: start; flex-direction: column; }
  .results-reference { text-align: left; max-width: 100%; }
  .results-layout { grid-template-columns: minmax(0, 1fr); }
  .results-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 156px), 1fr)); gap: 6px; }
  .results-list h2,.results-list > p { grid-column: 1 / -1; }
  .results-choice { margin-top: 0; }
}
</style>
