<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggle'])
</script>

<template>
  <button
    type="button"
    class="btn btn-sm"
    :class="active ? 'btn-primary' : 'btn-outline-primary'"
    :disabled="disabled"
    :aria-pressed="active ? 'true' : 'false'"
    @click="$emit('toggle')"
  >
    {{ active ? 'Saved' : 'Favorite' }}
  </button>
</template>
