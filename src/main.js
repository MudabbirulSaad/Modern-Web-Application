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
import { useFavoriteSyncStore } from './store/favoriteSyncStore'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const userStore = useUserStore()
const onlineStore = useOnlineStore()
const favoriteSyncStore = useFavoriteSyncStore()

configureApiClient({
  onUnauthorized: () => {
    userStore.invalidateSession()
  }
})

onlineStore.initialize()
onlineStore.onReconnect(() => favoriteSyncStore.replayPendingFavorites())
void initializeLocalCache()

userStore.initializeSession().finally(() => {
  void favoriteSyncStore.refreshPendingFavorites()
  void favoriteSyncStore.replayPendingFavorites()
  app.mount('#app')
})
