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
  }
})

defineEmits(['toggle'])
</script>

<template>
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
</template>
