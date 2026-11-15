<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
let previousFocus: HTMLElement | null = null
onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})
</script>

<template>
  <dialog ref="dialog" class="onboarding" aria-labelledby="onboarding-title" aria-describedby="onboarding-intro"
    data-testid="onboarding" @cancel.prevent="emit('close')">
    <button class="onboarding-close" type="button" aria-label="Skip introduction" @click="emit('close')">×</button>
    <p class="onboarding-kicker">EARTH · MOON · MARS</p>
    <h2 id="onboarding-title">Find a place on Earth<br>to prepare for space.</h2>
    <p id="onboarding-intro">Find landscapes with terrain similar to your Moon or Mars destination, and compare candidates for field tests.</p>
    <ol class="onboarding-steps">
      <li><span aria-hidden="true">01</span><div><h3>Choose the Moon or Mars</h3><p>Drag to rotate the globe. Scroll or pinch to zoom.</p></div></li>
      <li><span aria-hidden="true">02</span><div><h3>Mark your destination</h3><p>Tap the surface, select a landmark, or enter coordinates to place the flag.</p></div></li>
      <li><span aria-hidden="true">03</span><div><h3>Choose what you want to test</h3><p>Find ten Earth candidates. Open a site to see its location, terrain comparison and why it was selected.</p></div></li>
    </ol>
    <p class="onboarding-note">Temperature and atmosphere are shown separately. These are regional candidates for further investigation and field verification.</p>
    <button class="onboarding-start" type="button" autofocus @click="emit('close')">Start exploring <span aria-hidden="true">↗</span></button>
    <p class="onboarding-footer">You can reopen this guide with “How it works”.</p>
  </dialog>
</template>

<style scoped>
.onboarding { position: fixed; width: min(580px, calc(100% - 32px)); max-height: calc(100dvh - 32px); margin: auto; overflow: auto; padding: clamp(24px, 5vw, 40px); border: 1px solid #ffffff28; border-radius: 24px; color: #f4f3f0; background: #12151a; box-shadow: 0 24px 100px #0009; font-family: Geist, Arial, sans-serif; }
.onboarding::backdrop { background: #000b; backdrop-filter: blur(8px); }
.onboarding-close { position: absolute; top: 12px; right: 14px; width: 36px; height: 36px; border: 0; border-radius: 50%; color: #c0cad8; background: transparent; font-size: 26px; }
.onboarding-close:hover { background: #ffffff10; }
.onboarding-kicker { margin: 0 0 18px; color: #9fc5ff; font-size: 10px; letter-spacing: .2em; }
.onboarding h2 { margin: 0 0 14px; font-size: clamp(26px, 5vw, 35px); font-weight: 500; line-height: 1.13; letter-spacing: -.045em; }
#onboarding-intro { margin: 0; max-width: 45ch; color: #bdc7d6; font-size: 14px; line-height: 1.6; }
.onboarding-steps { display: grid; gap: 20px; margin: 26px 0; padding: 0; list-style: none; }
.onboarding-steps li { display: flex; gap: 16px; }
.onboarding-steps li > span { flex: none; padding-top: 1px; color: #9fc5ff; font-size: 12px; font-variant-numeric: tabular-nums; }
.onboarding h3 { margin: 0 0 5px; font-size: 14px; font-weight: 600; }
.onboarding-steps p { margin: 0; color: #9eabbd; font-size: 13px; line-height: 1.5; }
.onboarding-note { margin: 0 0 22px; padding-top: 18px; border-top: 1px solid #ffffff18; color: #9eabbd; font-size: 12px; line-height: 1.5; }
.onboarding-start { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 15px 18px; border: 0; border-radius: 12px; background: #a9ccff; color: #111820; font-size: 14px; font-weight: 600; }
.onboarding-start:hover { background: #c6ddff; }
.onboarding-footer { margin: 12px 0 0; color: #7f8b9c; font-size: 11px; text-align: center; }
@media (max-width: 400px) { .onboarding-steps { gap: 16px; margin-block: 20px; } }
</style>
