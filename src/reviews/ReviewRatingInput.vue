<script setup>
import { computed } from 'vue'
import { useReviewRatingInput } from './reviewRatingInput'

const props = defineProps({
  modelValue: {
    type: Number,
    required: true
  },
  idPrefix: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  labelledby: {
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const ratingInput = useReviewRatingInput({
  idPrefix: () => props.idPrefix,
  name: () => props.name,
  modelValue: () => props.modelValue,
  updateModelValue: (value) => emit('update:modelValue', value),
  disabled: () => props.disabled
})
const ratingOptions = computed(() => ratingInput.options())
</script>

<template>
  <div class="review-star-input" role="radiogroup" :aria-labelledby="labelledby">
    <template v-for="option in ratingOptions" :key="option.value">
      <input
        :id="option.id"
        class="btn-check"
        type="radio"
        :name="option.name"
        :value="option.value"
        :checked="option.checked"
        :disabled="option.disabled"
        required
        @change="ratingInput.select(option.value)"
        @keydown="ratingInput.onKeydown"
      >
      <label
        class="review-star-button"
        :class="{ 'is-filled': option.filled }"
        :for="option.id"
      >
        <span aria-hidden="true">★</span>
        <span class="visually-hidden">{{ option.label }}</span>
      </label>
    </template>
  </div>
</template>

<style scoped>
.review-star-input {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.review-star-button {
  color: var(--bs-secondary-color);
  cursor: pointer;
  font-size: 1.8rem;
  line-height: 1;
  padding: 0.125rem;
  transition: color 0.15s ease, transform 0.15s ease;
}

.review-star-button:hover,
.review-star-button.is-filled {
  color: var(--swinburne-supernova);
}

.btn-check:focus + .review-star-button {
  border-radius: 0.25rem;
  box-shadow: 0 0 0 0.25rem var(--swinburne-focus-ring);
  outline: 0;
}

.btn-check:checked + .review-star-button {
  color: var(--swinburne-supernova);
  transform: translateY(-1px);
}

.btn-check:disabled + .review-star-button {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
