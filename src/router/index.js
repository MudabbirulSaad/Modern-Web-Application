import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CourseList from '../views/CourseList.vue'
import CourseDetail from '../views/CourseDetail.vue'
import TutorList from '../views/TutorList.vue'
import TutorDetail from '../views/TutorDetail.vue'
import Register from '../views/Register.vue'
import Login from '../views/Login.vue'
import AdminDashboard from '../views/AdminDashboard.vue'
import StudentDashboard from '../views/StudentDashboard.vue'
import { useUserStore } from '../store/userStore'

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
  },
  {
    path: '/dashboard',
    name: 'student-dashboard',
    component: StudentDashboard,
    meta: {
      requiresStudent: true
    }
  },
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: AdminDashboard,
    meta: {
      requiresAdmin: true
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to) => {
  if (!to.meta.requiresAdmin && !to.meta.requiresStudent) {
    return true
  }

  const userStore = useUserStore()

  if (!userStore.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.requiresStudent && !userStore.isStudent) {
    return { name: 'home' }
  }

  if (to.meta.requiresAdmin && !userStore.isAdmin) {
    return { name: 'home' }
  }

  return true
})

export default router
