<template>
  <div class="card rounded-4 shadow-sm h-100 base-card">
    <div v-if="$slots.header" class="card-header bg-transparent border-0 pt-4 px-4">
      <slot name="header"></slot>
    </div>
    <div class="card-body p-4">
      <slot></slot>
    </div>
    <div v-if="$slots.footer" class="card-footer bg-transparent border-0 pb-4 px-4">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<script setup>
/**
 * BaseCard component providing consistent styling for Course and Tutor cards.
 * Enforces rounded-4 corners, shadow-sm, and brand-aligned hover effects.
 */
</script>

<style scoped>
.base-card {
  transition: transform 0.2s ease-in-out, border-color 0.2s ease-in-out;
  border: 1px solid var(--bs-border-color);
  background-color: var(--bs-card-bg);
}

.base-card:hover {
  transform: translateY(-5px);
  border-color: var(--swinburne-punch) !important;
}

.base-card:focus-within {
  border-color: var(--swinburne-punch) !important;
  outline: none;
}

[data-bs-theme="dark"] .base-card {
  background-color: var(--bs-surface-color);
}
</style>
