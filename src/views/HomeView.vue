<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="home-hero">
    <div class="home-hero__content">
      <p class="home-hero__eyebrow">Swinburne Course & Tutor Directory</p>
      <h1>Choose courses with clearer student insight.</h1>
      <p class="home-hero__lead">
        Compare course profiles, discover teaching staff, and use student reviews to plan your next academic move.
      </p>

      <div class="home-hero__actions">
        <div class="dropdown">
          <button
            class="btn btn-primary btn-lg dropdown-toggle"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            Explore
          </button>
          <ul class="dropdown-menu shadow border-0">
            <li>
              <RouterLink class="dropdown-item" to="/courses">Browse courses</RouterLink>
            </li>
            <li>
              <RouterLink class="dropdown-item" to="/tutors">Browse tutors</RouterLink>
            </li>
          </ul>
        </div>

        <RouterLink class="btn btn-outline-primary btn-lg" to="/register">
          Register
        </RouterLink>
      </div>
    </div>

    <div class="home-hero__visual" aria-label="Directory highlights">
      <div class="home-hero__rail" aria-hidden="true"></div>
      <div class="home-hero__signals">
        <div class="home-hero__signal">
          <span>01</span>
          <strong>Courses</strong>
          <p>Browse by department</p>
        </div>
        <div class="home-hero__signal">
          <span>02</span>
          <strong>Tutors</strong>
          <p>Compare profiles</p>
        </div>
        <div class="home-hero__signal">
          <span>03</span>
          <strong>Reviews</strong>
          <p>Read student feedback</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  width: 100vw;
  min-height: min(78vh, 760px);
  margin: -1.5rem calc(50% - 50vw) 0;
  padding:
    clamp(3rem, 7vw, 6.5rem)
    max(1.5rem, calc((100vw - 1320px) / 2 + 1.5rem));
  background:
    linear-gradient(110deg, rgba(var(--swinburne-punch-rgb), 0.09), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #f8f9fa 76%, var(--bs-body-bg) 100%);
  overflow: hidden;
  position: relative;
}

.home-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(var(--swinburne-punch-rgb), 0.28) 0 2px, transparent 2px 100%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.045) 0 1px, transparent 1px 100%);
  background-size: 8.5rem 100%, 100% 5rem;
  mask-image: linear-gradient(90deg, black, transparent 72%);
  opacity: 0.55;
}

.home-hero::after {
  content: "";
  position: absolute;
  top: 16%;
  right: max(1.5rem, calc((100vw - 1320px) / 2 + 1.5rem));
  width: min(34vw, 28rem);
  height: min(34vw, 28rem);
  border: 1px solid rgba(var(--swinburne-punch-rgb), 0.24);
  transform: rotate(10deg);
  opacity: 0.55;
}

.home-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 760px;
}

.home-hero__eyebrow {
  color: var(--swinburne-punch);
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 1rem;
  text-transform: uppercase;
}

.home-hero h1 {
  color: var(--swinburne-black);
  font-size: clamp(3rem, 8vw, 7.25rem);
  line-height: 0.88;
  max-width: 9.4ch;
  margin-bottom: 1.25rem;
}

.home-hero__lead {
  color: #414141;
  font-size: clamp(1.1rem, 2vw, 1.35rem);
  line-height: 1.65;
  max-width: 680px;
  margin-bottom: 2rem;
}

.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
}

.home-hero__actions .dropdown-menu {
  border-radius: 0.75rem;
  min-width: 13rem;
  padding: 0.45rem;
}

.home-hero__actions .dropdown-item {
  border-radius: 0.5rem;
  font-weight: 700;
  padding: 0.7rem 0.85rem;
}

.home-hero__actions .dropdown-item:active,
.home-hero__actions .dropdown-item:hover {
  color: var(--swinburne-white);
  background-color: var(--swinburne-punch);
}

.home-hero__visual {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1.5rem;
  align-items: center;
  min-height: 28rem;
}

.home-hero__rail {
  width: 0.25rem;
  height: 100%;
  background:
    linear-gradient(180deg, var(--swinburne-punch), var(--swinburne-supernova));
  box-shadow: 0 0 0 1px rgba(var(--swinburne-punch-rgb), 0.12);
}

.home-hero__signals {
  display: grid;
  gap: clamp(1.5rem, 4vw, 3rem);
}

.home-hero__signal {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  column-gap: 1rem;
  align-items: baseline;
  padding-block: 0.25rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.home-hero__signal span {
  color: var(--swinburne-punch);
  font-size: 0.85rem;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.home-hero__signal strong {
  color: var(--swinburne-black);
  font-size: clamp(1.75rem, 3vw, 3rem);
  line-height: 1;
}

.home-hero__signal p {
  grid-column: 2;
  display: block;
  color: #4b4b4b;
  font-size: 1rem;
  margin: 0.35rem 0 1rem;
}

[data-bs-theme="dark"] .home-hero {
  background:
    linear-gradient(110deg, rgba(var(--swinburne-punch-rgb), 0.18), transparent 34%),
    linear-gradient(180deg, #121212 0%, #101010 76%, var(--bs-body-bg) 100%);
}

[data-bs-theme="dark"] .home-hero h1,
[data-bs-theme="dark"] .home-hero__signal strong {
  color: var(--swinburne-white);
}

[data-bs-theme="dark"] .home-hero__lead,
[data-bs-theme="dark"] .home-hero__signal p {
  color: #d6d6d6;
}

[data-bs-theme="dark"] .home-hero__signal {
  border-bottom-color: rgba(255, 255, 255, 0.16);
}

@media (max-width: 900px) {
  .home-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    margin-top: -1rem;
  }

  .home-hero h1 {
    max-width: 100%;
  }

  .home-hero__visual {
    min-height: auto;
  }
}
</style>
