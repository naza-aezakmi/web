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
const number = (value: number) => new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(Math.abs(value) < 1e-12 ? 0 : value)
const signed = (value: number) => `${value > 1e-12 ? '+' : ''}${number(value)}`
</script>

<template>
  <section class="explanation" aria-labelledby="explanation-heading" data-testid="terrain-explanation">
    <div class="explanation-title"><h3 id="explanation-heading">Why this candidate?</h3><span>EXACT SHAP · TERRAIN SCORE</span></div>
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
    <div class="shap-legend"><span class="helps">← Closer than shortlist average</span><span class="hurts">Further from shortlist average →</span></div>
    <div class="shap-chart" role="list" aria-label="Feature effects on the terrain mismatch score">
      <div v-for="row in rows" :key="row.feature" class="shap-row" role="listitem">
        <div class="shap-label"><span>{{ t(`feature.${row.feature}`) }}</span><strong :class="row.shap_value < 0 ? 'helps' : 'hurts'">{{ signed(row.shap_value) }}</strong></div>
        <div class="shap-track" aria-hidden="true"><i :class="row.shap_value < 0 ? 'helps-bar' : 'hurts-bar'" :style="{ left: `${row.shap_value < 0 ? 50 - Math.abs(row.shap_value) / maximum * 48 : 50}%`, width: `${Math.abs(row.shap_value) / maximum * 48}%` }" /></div>
      </div>
    </div>
    <div class="score-equation">
      <span>Shortlist average <strong>{{ number(explanation.baseline_score) }}</strong></span><b aria-hidden="true">+</b>
      <span>Net feature effect <strong>{{ signed(explanation.score - explanation.baseline_score) }}</strong></span><b aria-hidden="true">=</b>
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
.explanation { padding: 22px; background: #111820; border: 1px solid #9bc8e330; border-radius: 19px; margin: 18px 0; }
.explanation-title { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
h3 { margin: 0; font-size: 1.12rem; }
.explanation-title > span { color: #9ab6cf; font-size: .65rem; letter-spacing: .08em; }
p { margin: 10px 0; color: #bdc8d4; font-size: .88rem; line-height: 1.65; }
.explanation-summary { color: #dfe7ef; font-size: .95rem; }
.explanation-summary strong { color: white; font-weight: 600; }
.explanation-priority { font-size: .8rem; }
.shap-legend { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px 18px; font-size: .7rem; margin-top: 22px; }
.helps { color: #9fd5f2; }.hurts { color: #e6b68f; }
.shap-chart { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 28px; margin: 16px 0 22px; }
.shap-label { display: flex; gap: 6px; align-items: baseline; justify-content: space-between; font-size: .8rem; }
.shap-label strong { font-weight: 500; font-variant-numeric: tabular-nums; }
.shap-track { position: relative; height: 8px; background: #ffffff08; border-radius: 5px; margin-top: 9px; }
.shap-track::after { content: ''; position: absolute; top: -4px; bottom: -4px; left: 50%; width: 1px; background: #ffffff55; }
.shap-track i { display: block; position: absolute; height: 100%; border-radius: 5px; }
.helps-bar { background: #91cce9; }.hurts-bar { background: #dda77b; }
.score-equation { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border: 1px solid #ffffff20; border-radius: 12px; }
.score-equation span { display: grid; gap: 5px; font-size: .72rem; color: #acbac9; }
.score-equation strong { font-size: 1rem; color: #f1f4f6; font-weight: 500; }
.score-equation b { font-weight: 400; color: #8194a7; }
.shap-caption { font-size: .76rem; }
.explanation-method { border-top: 1px solid #ffffff1a; padding-top: 13px; margin-top: 16px; font-size: .8rem; }
.explanation-method summary { cursor: pointer; color: #d0dce7; }
.explanation-method p,.explanation-method a { font-size: .77rem; }
a { color: #b7cfe3; }
@media(max-width: 600px) { .explanation { padding: 16px; }.shap-chart { grid-template-columns: 1fr; }.score-equation { padding: 12px 9px; }.score-equation span { font-size: .63rem; }.score-equation strong { font-size: .87rem; } }
</style>
