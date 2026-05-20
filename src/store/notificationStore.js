import { defineStore } from 'pinia'

let nextNotificationId = 1

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    notifications: []
  }),
  actions: {
    notify({ message, variant = 'info', timeout = 5000 }) {
      const id = nextNotificationId
      nextNotificationId += 1

      const notification = {
        id,
        message,
        variant,
        createdAt: Date.now()
      }

      this.notifications.push(notification)

      if (timeout > 0) {
        notification.timeoutId = setTimeout(() => {
          this.dismiss(id)
        }, timeout)
      }

      return id
    },
    dismiss(id) {
      const notification = this.notifications.find((item) => item.id === id)

      if (notification?.timeoutId) {
        clearTimeout(notification.timeoutId)
      }

      this.notifications = this.notifications.filter((item) => item.id !== id)
    },
    clear() {
      this.notifications.forEach((notification) => {
        if (notification.timeoutId) {
          clearTimeout(notification.timeoutId)
        }
      })
      this.notifications = []
    }
  }
})
