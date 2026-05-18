import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CourseList from '../views/CourseList.vue'
import TutorList from '../views/TutorList.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/courses',
    name: 'courses',
    component: CourseList
  },
  {
    path: '/tutors',
    name: 'tutors',
    component: TutorList
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
