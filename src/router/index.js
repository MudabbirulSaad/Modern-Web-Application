import { createRouter, createWebHistory } from 'vue-router'
import { createAuthGuard } from './authGuard'
import { routes } from './routes.js'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(createAuthGuard())

export default router
