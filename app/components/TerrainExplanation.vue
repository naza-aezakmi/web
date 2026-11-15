<script setup lang="ts">
import { computed } from 'vue'
import type { CandidateExplanation } from '../../shared/terrain'

const props = defineProps<{ explanation: CandidateExplanation }>()
const { t } = useI18n()
const rows = computed(() => [...props.explanation.features].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)))
const maximum = computed(() => Math.max(1e-12, ...rows.value.map(row => Math.abs(row.shap_value))))
const improvement = computed(() => [...rows.value].sort((a, b) => a.shap_value - b.shap_value).find(row => row.shap_value < -1e-12))
const drawback = computed(() => [...rows.value].sort((a, b) => b.shap_value - a.shap_value).find(row => row.shap_value > 1e-12))
const largestPenalty = computed(() => [...rows.value].sort((a, b) => b.penalty - a.penalty)[0])
const priority = computed(() => [...rows.value].sort((a, b) => b.weight - a.weight)[0])
const scoreFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 })
const number = (value: number) => {
  if (Math.abs(value) < 1e-12) return '0'
  return Math.abs(value) < 1e-4 ? value.toExponential(2) : scoreFormat.format(value)
}
const signed = (value: number) => `${value > 1e-12 ? '+' : ''}${number(value)}`
</script>

<template>
  <section class="explanation" aria-labelledby="explanation-heading" data-testid="terrain-explanation">
    <div class="explanation-title"><h3 id="explanation-heading">Why this candidate?</h3><span>Exact SHAP</span></div>
    <p class="explanation-summary">
      <template v-if="improvement">Compared with the average of these {{ explanation.background_size }} candidates, <strong>{{ t(`feature.${improvement.feature}`).toLowerCase() }}</strong> most improves this site's score.</template>
      <template v-else-if="drawback">Compared with the average of these {{ explanation.background_size }} candidates, <strong>{{ t(`feature.${drawback.feature}`).toLowerCase() }}</strong> adds the largest penalty.</template>
      <template v-else>This site's four terrain contributions equal the shortlist average.</template>
      <template v-if="largestPenalty && largestPenalty.penalty > 1e-12">
        <template v-if="improvement?.feature === largestPenalty.feature"> The other terrain penalties are smaller, so this feature also accounts for most of the remaining mismatch.</template>
        <template v-else> The largest remaining terrain mismatch is <strong>{{ t(`feature.${largestPenalty.feature}`).toLowerCase() }}</strong>.</template>
      </template>
    </p>
    <p v-if="priority" class="explanation-priority">For your selected objective, {{ t(`feature.${priority.feature}`).toLowerCase() }} receives the highest weight: {{ Math.round(priority.weight * 100) }}%.</p>
    <div class="shap-columns" aria-hidden="true"><span>Criterion</span><span>Effect on the terrain score</span><span>Δ score</span></div>
    <div class="shap-legend"><span class="helps">← Improves match</span><span class="hurts">Increases mismatch →</span></div>
    <div class="shap-chart" role="list" aria-label="Feature effects on the terrain mismatch score">
      <div v-for="row in rows" :key="row.feature" class="shap-row" role="listitem"
        :title="`Weight: ${Math.round(row.weight * 100)}%. Candidate penalty: ${number(row.penalty)}. Shortlist average penalty: ${number(row.baseline_penalty)}.`">
        <div class="shap-label"><span>{{ t(`feature.${row.feature}`) }}</span><small>{{ Math.round(row.weight * 100) }}% weight</small></div>
        <div class="shap-track" aria-hidden="true"><i :class="row.shap_value < 0 ? 'helps-bar' : row.shap_value > 0 ? 'hurts-bar' : ''" :style="{ left: `${row.shap_value < 0 ? 50 - Math.abs(row.shap_value) / maximum * 48 : 50}%`, width: `${Math.abs(row.shap_value) / maximum * 48}%` }" /></div>
        <strong class="shap-value" :class="row.shap_value < 0 ? 'helps' : row.shap_value > 0 ? 'hurts' : ''">{{ signed(row.shap_value) }}</strong>
      </div>
    </div>
    <div class="score-equation">
      <span>Shortlist average <strong>{{ number(explanation.baseline_score) }}</strong></span><b aria-hidden="true">+</b>
      <span>Feature adjustment <strong>{{ signed(explanation.score - explanation.baseline_score) }}</strong></span><b aria-hidden="true">=</b>
      <span>Candidate score <strong>{{ number(explanation.score) }}</strong></span>
    </div>
    <p class="shap-caption">Lower score means a closer terrain match. These bars explain the score relative to the displayed shortlist; they are not confidence percentages.</p>
    <details class="explanation-method"><summary>How to read this explanation</summary>
      <p>The score adds four weighted mismatch penalties. For this additive model, each exact interventional SHAP value is the feature's penalty minus its average penalty across these {{ explanation.background_size }} candidates. Negative values help; positive values increase mismatch. The average score plus all four SHAP values reconstructs the candidate score.</p>
      <p>The background is this shortlist, not all Earth locations. Land screening and the geographic allocation rule also affect which places reach the list. Climate is shown separately and does not enter the score.</p>
      <a href="https://shap.readthedocs.io/en/latest/generated/shap.AdditiveExplainer.html" target="_blank" rel="noopener noreferrer">Additive SHAP method ↗</a>
    </details>
  </section>
</template>

<style scoped>
/* Hesoyam's dark tokens and Blocks rhythm, inherited type from the explorer.
   No component-library runtime is needed for these four deterministic bars. */
.explanation { --ex-bg: var(--ds-background-100, #000); --ex-text: var(--ds-gray-1000, #ededed); --ex-muted: var(--ds-gray-900, #a0a0a0); --ex-rule: var(--ds-gray-alpha-400, #ffffff24); --ex-blue: var(--ds-blue-900, #52a8ff); --ex-red: var(--ds-red-900, #ff6369); margin: 24px 0; padding: 24px 0 0; border-block: 1px solid var(--ex-rule); background: var(--ex-bg); color: var(--ex-text); }
.explanation-title { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
h3 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -.025em; }
.explanation-title > span { border: 1px solid #2e2e2e; border-radius: 6px; padding: 4px 7px; color: var(--ex-muted); background: #1a1a1a; font-size: 11px; line-height: 1; white-space: nowrap; }
p { margin: 12px 0; color: var(--ex-muted); font-size: 13px; line-height: 1.65; }
.explanation-summary { max-width: 90ch; color: var(--ex-text); font-size: 14px; }
.explanation-summary strong { font-weight: 500; }
.explanation-priority { font-size: 12px; }
.shap-columns,.shap-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(120px, 2.6fr) 92px; align-items: center; gap: 20px; }
.shap-columns { margin-top: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--ex-rule); color: var(--ex-muted); font-size: 11px; }
.shap-columns > :last-child { text-align: right; }
.shap-legend { display: flex; justify-content: space-between; gap: 8px; margin: 12px 112px 0 calc((100% - 132px) / 3.6 + 20px); font-size: 10px; }
.helps { color: var(--ex-blue); }.hurts { color: var(--ex-red); }
.shap-row { min-height: 67px; border-bottom: 1px solid #ffffff12; }
.shap-row:last-child { border: 0; }
.shap-label { display: grid; gap: 5px; font-size: 13px; }
.shap-label small { color: var(--ex-muted); font-size: 11px; }
.shap-value { font-size: 13px; font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }
.shap-track { position: relative; height: 8px; background: #1a1a1a; }
.shap-track::after { content: ''; position: absolute; top: -13px; bottom: -13px; left: 50%; width: 1px; background: #ffffff40; }
.shap-track i { display: block; position: absolute; height: 100%; border-radius: 1px; }
.helps-bar { background: var(--ex-blue); }.hurts-bar { background: var(--ex-red); }
.score-equation { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 20px; padding: 20px 0; border-block: 1px solid var(--ex-rule); }
.score-equation span { display: grid; gap: 9px; color: var(--ex-muted); font-size: 11px; }
.score-equation strong { color: var(--ex-text); font-size: 22px; font-weight: 500; letter-spacing: -.025em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.score-equation b { color: #666; font-size: 16px; font-weight: 400; }
.shap-caption { font-size: 11px; }
.explanation-method { padding: 14px 0; border-top: 1px solid var(--ex-rule); font-size: 12px; }
.explanation-method summary { cursor: pointer; color: var(--ex-text); }
.explanation-method p,.explanation-method a { font-size: 12px; }
a { color: var(--ex-blue); text-underline-offset: 3px; }
@media(max-width: 600px) { .explanation { padding-top: 20px; }.shap-columns,.shap-row { grid-template-columns: minmax(86px, 1fr) minmax(70px, 1.2fr) 70px; gap: 10px; }.shap-columns { font-size: 10px; }.shap-legend { margin: 12px 0 0; font-size: 10px; }.shap-label { font-size: 12px; }.shap-value { font-size: 11px; }.score-equation { gap: 9px; }.score-equation span { font-size: 10px; }.score-equation strong { font-size: 15px; } }
</style>
