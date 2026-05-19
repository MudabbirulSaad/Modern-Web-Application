import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CourseList from '../views/CourseList.vue'
import CourseDetail from '../views/CourseDetail.vue'
import TutorList from '../views/TutorList.vue'
import TutorDetail from '../views/TutorDetail.vue'
import Register from '../views/Register.vue'
import Login from '../views/Login.vue'

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
    path: '/courses/:id',
    name: 'course-detail',
    component: CourseDetail
  },
  {
    path: '/tutors',
    name: 'tutors',
    component: TutorList
  },
  {
    path: '/tutors/:id',
    name: 'tutor-detail',
    component: TutorDetail
  },
  {
    path: '/register',
    name: 'register',
    component: Register
  },
  {
    path: '/login',
    name: 'login',
    component: Login
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
