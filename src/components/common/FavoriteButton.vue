<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  blocked: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggle', 'retry'])
</script>

<template>
  <div class="favorite-button-stack">
    <button
      type="button"
      class="btn btn-sm btn-favorite"
      :class="active ? 'btn-favorite-saved' : 'btn-favorite-unsaved'"
      :disabled="disabled"
      :aria-pressed="active ? 'true' : 'false'"
      :aria-busy="loading ? 'true' : 'false'"
      @click="$emit('toggle')"
    >
      {{ loading ? 'Syncing...' : active ? 'Saved' : 'Favorite' }}
    </button>
    <div v-if="blocked" class="favorite-blocked-warning" role="status">
      <span>Sync paused</span>
      <button type="button" class="btn btn-link btn-sm p-0" @click="$emit('retry')">Retry</button>
    </div>
  </div>
</template>

<style scoped>
.favorite-button-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.favorite-blocked-warning {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--bs-warning-text-emphasis);
  font-size: 0.8125rem;
  line-height: 1.2;
  white-space: nowrap;
}
</style>
