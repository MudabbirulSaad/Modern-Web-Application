<script setup>
defineProps({
  tag: {
    type: String,
    default: 'div'
  },
  name: {
    type: String,
    default: 'directory-list'
  },
  listClass: {
    type: [String, Array, Object],
    default: ''
  }
})
</script>

<template>
  <TransitionGroup
    :tag="tag"
    :name="name"
    :class="['base-transition-list', listClass]"
    move-class="directory-list-move"
  >
    <slot />
  </TransitionGroup>
</template>

<style>
.base-transition-list {
  position: relative;
}

.directory-list-move,
.directory-list-enter-active,
.directory-list-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}

.directory-list-enter-from,
.directory-list-leave-to {
  opacity: 0;
  transform: translateY(0.75rem);
}

.directory-list-leave-active {
  position: absolute;
}
</style>
