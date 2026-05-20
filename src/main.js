import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './style.css'
import App from './App.vue'
import router from './router'
import { configureApiClient } from './api/client'
import { initializeLocalCache } from './api/localCache'
import { useOnlineStore } from './store/onlineStore'
import { useUserStore } from './store/userStore'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const userStore = useUserStore()
const onlineStore = useOnlineStore()

configureApiClient({
  onUnauthorized: () => {
    userStore.invalidateSession()
  }
})

onlineStore.initialize()
void initializeLocalCache()

userStore.initializeSession().finally(() => {
  app.mount('#app')
})
