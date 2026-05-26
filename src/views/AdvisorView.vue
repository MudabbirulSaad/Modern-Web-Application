<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ADVISOR_EXPERIENCE_CONFIDENCE,
  ADVISOR_INTEREST_AREAS,
  ADVISOR_LEARNING_FOCUS,
  ADVISOR_RECOMMENDATION_GOALS,
  useAdvisorDiscovery
} from '../advisor/useAdvisorDiscovery.js'
import {
  applyAdvisorFavoriteState,
  buildAdvisorPersonalizationNotice,
  buildAdvisorRecommendationCards,
  buildAdvisorStatusNotice
} from '../advisor/advisorPresentation.js'
import BaseCard from '../components/common/BaseCard.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import { useFavoriteWorkflow } from '../favorites/useFavoriteWorkflow.js'
import { useUserStore } from '../store/userStore'

const userStore = useUserStore()
const advisor = useAdvisorDiscovery()
const cards = computed(() => buildAdvisorRecommendationCards(advisor.result.value?.recommendations || []))
const statusNotice = computed(() => buildAdvisorStatusNotice(advisor.result.value))
const personalizationNotice = computed(() => buildAdvisorPersonalizationNotice(advisor.result.value))
const favoriteWorkflow = useFavoriteWorkflow({
  entityType: 'course',
  userStore,
  applyFavoriteState: (courseId, hasFavorite) => {
    applyAdvisorFavoriteState(advisor.result, courseId, hasFavorite)
  }
})
const favoriteError = favoriteWorkflow.favoriteError
const isUpdatingFavorite = favoriteWorkflow.isUpdatingFavorite
const toggleFavorite = favoriteWorkflow.toggleFavorite
</script>

<template>
  <section class="advisor-page">
    <div class="advisor-page__header mb-4">
      <p class="text-uppercase text-primary fw-bold small mb-2">AI Course Advisor</p>
      <h1 class="mb-3">Guided course discovery</h1>
      <p class="lead text-body-secondary mb-0">
        Choose structured preferences to receive Course-first recommendations grounded in directory data.
      </p>
    </div>

    <div class="row g-4 align-items-start">
      <div class="col-12 col-xl-4">
        <form class="advisor-panel border rounded-3 p-3 p-md-4" @submit.prevent="advisor.submitPreferences">
          <div class="mb-3">
            <label class="form-label" for="advisor-interest">Interest area</label>
            <select
              id="advisor-interest"
              v-model="advisor.preferences.interestArea.value"
              class="form-select"
            >
              <option
                v-for="area in ADVISOR_INTEREST_AREAS"
                :key="area"
                :value="area"
              >
                {{ area }}
              </option>
            </select>
          </div>

          <fieldset class="mb-3">
            <legend class="form-label mb-2">Learning focus</legend>
            <div class="advisor-chip-group" aria-label="Learning focus options">
              <button
                v-for="focus in ADVISOR_LEARNING_FOCUS"
                :key="focus"
                class="btn btn-sm advisor-chip"
                :class="advisor.preferences.learningFocus.value.includes(focus) ? 'btn-primary' : 'btn-outline-secondary'"
                type="button"
                :aria-pressed="advisor.preferences.learningFocus.value.includes(focus)"
                @click="advisor.toggleLearningFocus(focus)"
              >
                {{ focus }}
              </button>
            </div>
          </fieldset>

          <div class="mb-3">
            <label class="form-label" for="advisor-goal">Recommendation goal</label>
            <select
              id="advisor-goal"
              v-model="advisor.preferences.recommendationGoal.value"
              class="form-select"
            >
              <option
                v-for="goal in ADVISOR_RECOMMENDATION_GOALS"
                :key="goal"
                :value="goal"
              >
                {{ goal }}
              </option>
            </select>
          </div>

          <fieldset class="mb-3">
            <legend class="form-label mb-2">Experience confidence</legend>
            <div class="advisor-segment" role="radiogroup" aria-label="Experience confidence">
              <label
                v-for="confidence in ADVISOR_EXPERIENCE_CONFIDENCE"
                :key="confidence"
                class="advisor-segment__item"
              >
                <input
                  v-model="advisor.preferences.experienceConfidence.value"
                  class="btn-check"
                  type="radio"
                  name="experience-confidence"
                  :value="confidence"
                >
                <span>{{ confidence }}</span>
              </label>
            </div>
          </fieldset>

          <div class="mb-4">
            <label class="form-label" for="advisor-personal-goal">Personal goal</label>
            <textarea
              id="advisor-personal-goal"
              v-model="advisor.preferences.personalGoal.value"
              class="form-control"
              rows="3"
              placeholder="Optional context"
            ></textarea>
          </div>

          <button
            class="btn btn-directory-action w-100"
            type="submit"
            :disabled="advisor.loading.value || !advisor.hasRequiredPreferences.value"
          >
            {{ advisor.loading.value ? 'Finding matches...' : 'Get recommendations' }}
          </button>
        </form>
      </div>

      <div class="col-12 col-xl-8">
        <div v-if="advisor.loading.value" class="row g-4" aria-label="Loading advisor recommendations">
          <div v-for="index in 2" :key="index" class="col-12 col-lg-6">
            <BaseCard>
              <div class="placeholder-glow">
                <span class="placeholder col-8 mb-3"></span>
                <span class="placeholder col-5 mb-4"></span>
                <span class="placeholder col-12"></span>
                <span class="placeholder col-10"></span>
                <span class="placeholder col-7"></span>
              </div>
            </BaseCard>
          </div>
        </div>

        <div v-else-if="advisor.error.value" class="alert alert-danger" role="alert">
          {{ advisor.error.value }}
        </div>

        <div v-else-if="!advisor.result.value" class="advisor-empty border rounded-3 p-4" role="status">
          <h2 class="h5 mb-2">Ready for guided discovery</h2>
          <p class="text-body-secondary mb-0">
            Select at least one learning focus to generate Course recommendations.
          </p>
        </div>

        <div v-else>
          <div class="d-flex flex-column flex-md-row justify-content-between gap-2 align-items-md-start mb-3">
            <div>
              <p class="text-uppercase text-primary fw-bold small mb-2">Recommendations</p>
              <h2 class="h4 mb-1">{{ advisor.result.value.summary }}</h2>
            </div>
            <span class="badge rounded-pill text-bg-light border text-uppercase">
              {{ advisor.result.value.mode === 'ai' ? 'AI ranked' : 'Local mode' }}
            </span>
          </div>

          <div
            v-if="statusNotice"
            class="alert mb-4"
            :class="statusNotice.tone === 'warning' ? 'alert-warning' : 'alert-info'"
            role="status"
          >
            <strong>{{ statusNotice.title }}</strong>
            <ul class="mb-0 mt-2">
              <li v-for="message in statusNotice.messages" :key="message">{{ message }}</li>
            </ul>
          </div>

          <div
            v-if="personalizationNotice"
            class="alert mb-4"
            :class="personalizationNotice.tone === 'info' ? 'alert-info' : 'alert-secondary'"
            role="status"
          >
            <strong>{{ personalizationNotice.title }}</strong>
            <ul class="mb-0 mt-2">
              <li v-for="message in personalizationNotice.messages" :key="message">{{ message }}</li>
            </ul>
          </div>

          <div v-if="cards.length === 0" class="alert alert-secondary" role="status">
            No Course recommendations are available for these preferences yet.
          </div>

          <div v-else class="row g-4">
            <div v-if="favoriteError" class="col-12">
              <div class="alert alert-warning mb-0" role="alert">{{ favoriteError }}</div>
            </div>

            <div v-for="card in cards" :key="card.key" class="col-12 col-lg-6">
              <BaseCard>
                <template #header>
                  <div class="d-flex justify-content-between gap-3 align-items-center">
                    <span class="badge rounded-pill text-bg-light border">{{ card.department }}</span>
                    <FavoriteButton
                      v-if="userStore.isStudent"
                      :active="card.hasFavorite"
                      :loading="isUpdatingFavorite(card.courseId)"
                      @toggle="toggleFavorite(card.favoriteItem)"
                    />
                  </div>
                </template>

                <h3 class="h4 mb-3">{{ card.courseTitle }}</h3>
                <p class="text-body-secondary mb-3">{{ card.description }}</p>
                <p class="mb-3">{{ card.reason }}</p>

                <div class="mb-3">
                  <p class="small text-uppercase fw-bold text-body-secondary mb-2">Evidence</p>
                  <div class="advisor-chip-group">
                    <span
                      v-for="signal in card.evidence"
                      :key="signal"
                      class="badge rounded-pill text-bg-light border"
                    >
                      {{ signal }}
                    </span>
                  </div>
                </div>

                <div class="mb-3">
                  <p class="small text-uppercase fw-bold text-body-secondary mb-2">Supporting Tutors</p>
                  <div v-if="card.tutors.length" class="d-flex flex-column gap-2">
                    <RouterLink
                      v-for="tutor in card.tutors"
                      :key="tutor.id"
                      class="advisor-tutor-link"
                      :to="tutor.to"
                    >
                      <span class="fw-bold">{{ tutor.name }}</span>
                      <span class="text-body-secondary">{{ tutor.department }}</span>
                    </RouterLink>
                  </div>
                  <p v-else class="text-body-secondary mb-0">Tutors to be announced</p>
                </div>

                <div v-if="card.limitations.length" class="alert alert-secondary py-2 small" role="status">
                  <p class="fw-bold mb-1">Limitations</p>
                  <ul class="mb-0">
                    <li v-for="limitation in card.limitations" :key="limitation">{{ limitation }}</li>
                  </ul>
                </div>

                <template #footer>
                  <RouterLink class="btn btn-directory-action btn-sm" :to="card.courseTo">
                    View course
                  </RouterLink>
                </template>
              </BaseCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.advisor-page {
  max-width: 1180px;
  margin: 0 auto;
}

.advisor-page__header {
  max-width: 760px;
}

.advisor-panel,
.advisor-empty {
  background-color: var(--bs-body-bg);
}

.advisor-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.advisor-chip {
  font-weight: 700;
  min-width: 4.6rem;
}

.advisor-segment {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  overflow: hidden;
}

.advisor-segment__item {
  margin: 0;
}

.advisor-segment__item span {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.5rem;
  border-right: 1px solid var(--bs-border-color);
  color: var(--bs-body-color);
  cursor: pointer;
  font-weight: 700;
  text-align: center;
}

.advisor-segment__item:last-child span {
  border-right: 0;
}

.advisor-segment__item input:checked + span {
  color: var(--swinburne-white);
  background-color: var(--swinburne-punch);
}

.advisor-tutor-link {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35rem 1rem;
  padding: 0.65rem 0;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--bs-border-color);
}

.advisor-tutor-link:hover {
  color: var(--swinburne-punch);
}

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}

@media (max-width: 575.98px) {
  .advisor-segment {
    grid-template-columns: 1fr;
  }

  .advisor-segment__item span {
    border-right: 0;
    border-bottom: 1px solid var(--bs-border-color);
  }

  .advisor-segment__item:last-child span {
    border-bottom: 0;
  }
}
</style>
