<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiRequest } from '../api/client'
import {
  createCommandPaletteShortcutHandler,
  submitCommandPaletteIntent
} from '../commandPalette/commandPalette'
import { useOnlineStore } from '../store/onlineStore'

const router = useRouter()
const onlineStore = useOnlineStore()
const inputRef = ref(null)
const isOpen = ref(false)
const intent = ref('')
const feedback = ref('')
const submitting = ref(false)

const focusInput = () => nextTick(() => inputRef.value?.focus())

const openPalette = () => {
  isOpen.value = true
  feedback.value = ''
}

const closePalette = () => {
  isOpen.value = false
  intent.value = ''
  feedback.value = ''
  submitting.value = false
}

const updateIntent = (event) => {
  intent.value = event.target.value
  feedback.value = ''
}

const submit = async () => {
  if (submitting.value) {
    return
  }

  submitting.value = true

  const result = await submitCommandPaletteIntent({
    intent: intent.value,
    apiRequest,
    router,
    online: onlineStore.online
  })

  submitting.value = false

  if (result.executed) {
    closePalette()
    return
  }

  feedback.value = result.feedback
}

const handleShortcut = createCommandPaletteShortcutHandler({
  open: openPalette,
  focusInput
})

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="command-palette-backdrop"
      role="presentation"
      @click.self="closePalette"
    >
      <section
        class="command-palette shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
      >
        <form @submit.prevent="submit">
          <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
            <h2 id="command-palette-title" class="h5 mb-0">Command Palette</h2>
            <button
              class="btn-close"
              type="button"
              aria-label="Close command palette"
              @click="closePalette"
            ></button>
          </div>

          <label class="form-label" for="command-palette-input">Command</label>
          <div class="input-group">
            <input
              id="command-palette-input"
              ref="inputRef"
              class="form-control form-control-lg"
              :value="intent"
              type="search"
              autocomplete="off"
              placeholder="Courses, Tutors, or search courses for databases"
              @input="updateIntent"
              @keydown.esc.prevent="closePalette"
            >
            <button
              class="btn btn-directory-action"
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? 'Running' : 'Run' }}
            </button>
          </div>

          <p
            v-if="feedback"
            class="alert alert-warning mt-3 mb-0"
            role="status"
          >
            {{ feedback }}
          </p>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.command-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 1rem 1rem;
  background-color: rgba(0, 0, 0, 0.45);
}

.command-palette {
  width: min(42rem, 100%);
  padding: 1.25rem;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  background-color: var(--bs-body-bg);
}

.command-palette .input-group {
  align-items: stretch;
}

.command-palette .btn-directory-action {
  min-width: 5.5rem;
}
</style>
