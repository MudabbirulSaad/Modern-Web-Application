<script setup>
import { computed } from 'vue'

const props = defineProps({
  page: {
    type: Number,
    required: true
  },
  limit: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['update:page'])

const totalPages = computed(() => Math.max(Math.ceil(props.total / props.limit), 1))
const isFirstPage = computed(() => props.page <= 1)
const isLastPage = computed(() => props.page >= totalPages.value)
const firstItem = computed(() => (props.total === 0 ? 0 : ((props.page - 1) * props.limit) + 1))
const lastItem = computed(() => Math.min(props.page * props.limit, props.total))
const visiblePages = computed(() => {
  const pages = []
  const start = Math.max(Math.min(props.page - 1, totalPages.value - 2), 1)
  const end = Math.min(start + 2, totalPages.value)

  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pages.push(pageNumber)
  }

  return pages
})

const setPage = (pageNumber) => {
  if (pageNumber < 1 || pageNumber > totalPages.value || pageNumber === props.page) {
    return
  }

  emit('update:page', pageNumber)
}
</script>

<template>
  <nav
    v-if="totalPages > 1"
    class="pagination-controls d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mt-4"
    aria-label="Directory pagination"
  >
    <p class="small text-body-secondary mb-0">
      Showing {{ firstItem }}-{{ lastItem }} of {{ total }}
    </p>

    <ul class="pagination mb-0">
      <li class="page-item" :class="{ disabled: isFirstPage }">
        <button
          class="page-link"
          type="button"
          :disabled="isFirstPage"
          @click="setPage(page - 1)"
        >
          Previous
        </button>
      </li>

      <li
        v-for="pageNumber in visiblePages"
        :key="pageNumber"
        class="page-item"
        :class="{ active: pageNumber === page }"
      >
        <button
          class="page-link"
          type="button"
          :aria-current="pageNumber === page ? 'page' : undefined"
          @click="setPage(pageNumber)"
        >
          {{ pageNumber }}
        </button>
      </li>

      <li class="page-item" :class="{ disabled: isLastPage }">
        <button
          class="page-link"
          type="button"
          :disabled="isLastPage"
          @click="setPage(page + 1)"
        >
          Next
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.pagination-controls {
  min-height: 2.375rem;
}

.page-link {
  min-width: 2.5rem;
  text-align: center;
}
</style>
