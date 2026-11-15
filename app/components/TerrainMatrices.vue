<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const props = defineProps<{ source: number[]; sourceName: string; earth: number[]; size: number; rotation: number }>()
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })

function centered(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.map(value => value - mean)
}

const reference = computed(() => centered(props.source))
const terrestrial = computed(() => centered(props.earth))
const residuals = computed(() => terrestrial.value.map((value, i) => value - reference.value[i]!))
const heightScale = computed(() => Math.max(1, ...reference.value.map(Math.abs), ...terrestrial.value.map(Math.abs)))
const residualScale = computed(() => Math.max(1, ...residuals.value.map(Math.abs)))
const matrices = computed(() => [
  { label: props.sourceName, values: reference.value, scale: heightScale.value },
  { label: t('results.earthAligned'), values: terrestrial.value, scale: heightScale.value },
  { label: t('results.earth') + ' − ' + props.sourceName, values: residuals.value, scale: residualScale.value },
])
const mae = computed(() => residuals.value.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.value.length)
const maxError = computed(() => Math.max(...residuals.value.map(Math.abs)))
const correlation = computed(() => {
  let product = 0
  let referenceSquares = 0
  let earthSquares = 0
  for (const [index, referenceHeight] of reference.value.entries()) {
    const earthHeight = terrestrial.value[index]!
    product += referenceHeight * earthHeight
    referenceSquares += referenceHeight ** 2
    earthSquares += earthHeight ** 2
  }
  const denominator = Math.sqrt(referenceSquares * earthSquares)
  return denominator ? Math.max(-1, Math.min(1, product / denominator)) : null
})
const correlationNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const metric = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function cellStyle(value: number, scale: number) {
  const strength = Math.abs(value) / scale
  const color = value < 0 ? '#84afff' : '#f4d4a8'
  return { backgroundColor: `color-mix(in srgb, ${color} ${Math.round(strength * 77)}%, #191b20)`,
    color: strength > .65 ? '#080d16' : '#f4f5f7' }
}
</script>

<template>
  <section class="terrain-matrices">
    <h3>{{ t('results.elevationMatrices') }}</h3>
    <p>{{ t('results.matrixDescription', { source: sourceName, rotation: (4 - rotation) % 4 * 90 }) }}</p>
    <div class="matrix-grid">
      <figure v-for="matrix in matrices" :key="matrix.label">
        <figcaption>{{ matrix.label }} <small>±{{ Math.ceil(matrix.scale) }} m</small></figcaption>
        <table :aria-label="t('results.elevationGrid', { name: matrix.label })">
          <tbody>
            <tr v-for="row in size" :key="row">
              <td v-for="col in size" :key="col" :style="cellStyle(matrix.values[(row - 1) * size + col - 1]!, matrix.scale)">
                {{ number.format(matrix.values[(row - 1) * size + col - 1]!) }}
              </td>
            </tr>
          </tbody>
        </table>
      </figure>
    </div>
    <dl class="matrix-evidence">
      <div><dt>{{ t('results.meanDifference') }}</dt><dd>{{ metric.format(mae) }} m</dd></div>
      <div><dt>{{ t('results.largestSample') }}</dt><dd>{{ metric.format(maxError) }} m</dd></div>
      <div>
        <dt>{{ t('results.pearson') }}</dt>
        <dd>{{ correlation === null ? t('results.undefined') : correlationNumber.format(correlation) }}</dd>
      </div>
      <div><dt>{{ t('results.samplePairs') }}</dt><dd>{{ residuals.length }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.terrain-matrices { margin: 20px 0; }
h3 { margin: 0; font-size: 1rem; }
p { margin: 6px 0 12px; color: #c0c5cf; font-size: .84rem; line-height: 1.55; }
.matrix-grid,.matrix-evidence { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,170px),1fr)); gap: 10px; }
figure { margin: 0; background: #141416; border: 1px solid #ffffff24; border-radius: 14px; padding: 8px; }
figcaption { display: flex; justify-content: space-between; gap: 4px; padding: 4px; font-size: .8rem; font-weight: 700; }
small { font-weight: 400; color: #bdc4ce; }
table { width: 100%; table-layout: fixed; border-spacing: 2px; font-variant-numeric: tabular-nums; }
td { overflow-wrap: anywhere; text-align: center; height: 28px; padding: 2px 0; border-radius: 3px; font-size: .62rem; }
.matrix-evidence { margin: 12px 0 0; }
.matrix-evidence > div { padding: 8px 10px; border: 1px solid #ffffff22; border-radius: 12px; }
dt { color: #bdc4ce; font-size: .76rem; }
dd { margin: 3px 0 0; font-weight: 700; }
</style>
