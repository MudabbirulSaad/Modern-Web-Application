export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue')
  },
  {
    path: '/courses',
    name: 'courses',
    component: () => import('../views/CourseList.vue')
  },
  {
    path: '/courses/:id',
    name: 'course-detail',
    component: () => import('../views/CourseDetail.vue')
  },
  {
    path: '/tutors',
    name: 'tutors',
    component: () => import('../views/TutorList.vue')
  },
  {
    path: '/tutors/:id',
    name: 'tutor-detail',
    component: () => import('../views/TutorDetail.vue')
  },
  {
    path: '/departments',
    name: 'departments',
    component: () => import('../views/DepartmentsView.vue')
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/Register.vue'),
    meta: {
      requiresGuest: true
    }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: {
      requiresGuest: true
    }
  },
  {
    path: '/dashboard',
    name: 'student-dashboard',
    component: () => import('../views/StudentDashboard.vue'),
    meta: {
      requiresStudent: true
    }
  },
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: () => import('../views/AdminDashboard.vue'),
    meta: {
      requiresAdmin: true
    }
  }
]
