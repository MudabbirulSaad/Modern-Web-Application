import { defineStore } from 'pinia'
import { ApiError, apiRequest } from '../api/client'
import {
  canonicalizePendingLocalActionKey,
  deletePendingLocalAction,
  getEntity,
  getPendingLocalActions,
  getStudentViewerScope,
  saveEntity,
  savePendingLocalAction
} from '../api/localCache'
import { useNotificationStore } from './notificationStore'
import { useUserStore } from './userStore'

const favoriteFailureMessage = 'Favorite could not be updated. Please try again.'
const favoriteBlockedMessage = 'Favorite could not be updated. Retry when your connection is stable.'
const retryBackoffMs = 30 * 1000
const maxRetryAttempts = 3
const pendingStatuses = {
  queued: 'queued',
  syncing: 'syncing',
  blocked: 'blocked'
}
const visiblePatchers = new Map()

const getPatcherKey = (targetKind, targetId) => `${targetKind}:${targetId}`

const normalizeTargetKind = (targetKind) => String(targetKind || '').trim().toLowerCase()

const getTargetNamespace = (targetKind) => (
  normalizeTargetKind(targetKind) === 'course' ? 'courses' : 'tutors'
)

const isRetriableSyncError = (err) => {
  if (!(err instanceof ApiError)) {
    return true
  }

  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500
}

const readServerEntity = (payload, action) => ({
  id: action.targetId,
  ...(payload || {}),
  has_favorite: payload?.has_favorite ?? action.desiredFavorite
})

const isBlockedAction = (action) => action?.status === pendingStatuses.blocked

const isSyncingAction = (action) => action?.status === pendingStatuses.syncing

const findActionRecord = (records, key) => records.find((record) => record.key === key)

const findReplayableRecord = (records) => records.find((record) => (
  !isBlockedAction(record.data) && Number(record.data?.nextAttemptAt || 0) <= Date.now()
))

export const registerFavoriteEntityPatcher = ({ targetKind, targetId, patch }) => {
  if (typeof patch !== 'function') {
    return
  }

  visiblePatchers.set(getPatcherKey(normalizeTargetKind(targetKind), targetId), patch)
}

const patchVisibleEntity = async ({ targetKind, targetId, entity }) => {
  const patch = visiblePatchers.get(getPatcherKey(normalizeTargetKind(targetKind), targetId))

  if (patch) {
    await patch(entity)
  }
}

const mergeCachedEntity = async (viewerScope, action, entity) => {
  const cachedRecord = await getEntity({
    viewerScope,
    namespace: getTargetNamespace(action.targetKind),
    id: action.targetId
  })

  return {
    ...(cachedRecord?.data || {}),
    ...entity
  }
}

export const useFavoriteSyncStore = defineStore('favoriteSync', {
  state: () => ({
    pendingFavoriteKeys: [],
    blockedFavoriteKeys: [],
    syncingFavoriteKeys: [],
    replaying: false,
    replayGeneration: 0
  }),
  actions: {
    stopPendingFavoriteReplay() {
      this.replayGeneration += 1
      this.replaying = false
      this.pendingFavoriteKeys = []
      this.blockedFavoriteKeys = []
      this.syncingFavoriteKeys = []
    },
    getStudentViewerScope() {
      const userStore = useUserStore()

      if (!userStore.isStudent || !userStore.userId) {
        return null
      }

      return getStudentViewerScope(userStore.userId)
    },
    getFavoriteActionKey(targetKind, targetId) {
      return canonicalizePendingLocalActionKey({
        type: 'favorite',
        targetKind,
        targetId
      })
    },
    hasPendingFavorite(targetKind, targetId) {
      return this.pendingFavoriteKeys.includes(this.getFavoriteActionKey(targetKind, targetId))
    },
    hasBlockedFavorite(targetKind, targetId) {
      return this.blockedFavoriteKeys.includes(this.getFavoriteActionKey(targetKind, targetId))
    },
    isFavoriteSyncing(targetKind, targetId) {
      const key = this.getFavoriteActionKey(targetKind, targetId)
      return this.pendingFavoriteKeys.includes(key) && !this.blockedFavoriteKeys.includes(key)
    },
    async refreshPendingFavorites() {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope) {
        this.pendingFavoriteKeys = []
        this.blockedFavoriteKeys = []
        this.syncingFavoriteKeys = []
        return []
      }

      const records = await getPendingLocalActions(viewerScope)
      const favoriteRecords = records.filter((record) => record.data?.type === 'favorite')
      this.pendingFavoriteKeys = favoriteRecords.map((record) => record.key)
      this.blockedFavoriteKeys = favoriteRecords
        .filter((record) => isBlockedAction(record.data))
        .map((record) => record.key)
      this.syncingFavoriteKeys = favoriteRecords
        .filter((record) => isSyncingAction(record.data))
        .map((record) => record.key)

      return favoriteRecords
    },
    async enqueueFavorite({ targetKind, targetId, desiredFavorite, previousFavorite, entity }) {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope) {
        return false
      }

      const action = {
        type: 'favorite',
        targetKind: normalizeTargetKind(targetKind),
        targetId,
        desiredFavorite,
        previousFavorite,
        attemptCount: 0,
        nextAttemptAt: 0,
        status: pendingStatuses.queued,
        lastError: ''
      }

      await Promise.all([
        savePendingLocalAction({ viewerScope, action }),
        saveEntity({
          viewerScope,
          namespace: getTargetNamespace(action.targetKind),
          row: {
            ...(entity || { id: targetId }),
            has_favorite: desiredFavorite
          }
        })
      ])
      await this.refreshPendingFavorites()

      void this.replayPendingFavorites()
      return true
    },
    async reconcileFavorite(action, entity, replayViewerScope = this.getStudentViewerScope()) {
      const viewerScope = replayViewerScope

      if (!viewerScope || this.getStudentViewerScope() !== viewerScope) {
        return false
      }

      const mergedEntity = await mergeCachedEntity(viewerScope, action, entity)

      await Promise.all([
        saveEntity({
          viewerScope,
          namespace: getTargetNamespace(action.targetKind),
          row: mergedEntity
        }),
        patchVisibleEntity({
          targetKind: action.targetKind,
          targetId: action.targetId,
          entity: mergedEntity
        })
      ])

      return true
    },
    async keepForRetry(viewerScope, record, err) {
      const attemptCount = Number(record.data?.attemptCount || 0) + 1
      const blocked = attemptCount >= maxRetryAttempts

      await savePendingLocalAction({
        viewerScope,
        action: {
          ...record.data,
          attemptCount,
          status: blocked ? pendingStatuses.blocked : pendingStatuses.queued,
          nextAttemptAt: blocked ? 0 : Date.now() + (retryBackoffMs * attemptCount),
          lastError: err.message || favoriteFailureMessage
        }
      })
      await this.refreshPendingFavorites()

      if (blocked) {
        useNotificationStore().notify({
          message: favoriteBlockedMessage,
          variant: 'warning'
        })
      }
    },
    async retryFavorite(targetKind, targetId) {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope) {
        return false
      }

      const key = this.getFavoriteActionKey(targetKind, targetId)
      const records = await getPendingLocalActions(viewerScope)
      const record = findActionRecord(records, key)

      if (!record?.data || !isBlockedAction(record.data)) {
        return false
      }

      await savePendingLocalAction({
        viewerScope,
        action: {
          ...record.data,
          status: pendingStatuses.queued,
          nextAttemptAt: 0,
          lastError: ''
        }
      })
      await this.refreshPendingFavorites()
      await this.replayPendingFavorites()
      return true
    },
    async discardAndReconcile(viewerScope, record) {
      const rollbackEntity = {
        id: record.data.targetId,
        has_favorite: record.data.previousFavorite ?? !record.data.desiredFavorite
      }

      await Promise.all([
        deletePendingLocalAction({ viewerScope, action: record.data }),
        this.reconcileFavorite(record.data, rollbackEntity, viewerScope)
      ])
      await this.refreshPendingFavorites()
      useNotificationStore().notify({
        message: favoriteFailureMessage,
        variant: 'warning'
      })
    },
    async replayPendingFavorites() {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope || this.replaying) {
        return
      }

      this.replaying = true
      const replayGeneration = this.replayGeneration

      try {
        let records = await this.refreshPendingFavorites()

        while (records.length > 0 && this.replayGeneration === replayGeneration) {
          const record = findReplayableRecord(records)

          if (!record) {
            break
          }

          const action = record.data

          try {
            await savePendingLocalAction({
              viewerScope,
              action: {
                ...action,
                status: pendingStatuses.syncing
              }
            })
            await this.refreshPendingFavorites()
            const payload = await apiRequest('/api/me/favorite', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                entity_type: action.targetKind,
                entity_id: action.targetId,
                favorite: action.desiredFavorite
              })
            })
            const latestRecords = await getPendingLocalActions(viewerScope)
            const latestRecord = latestRecords.find((item) => item.key === record.key)

            if (this.replayGeneration !== replayGeneration) {
              break
            }

            if (latestRecord?.data?.desiredFavorite !== action.desiredFavorite) {
              records = await this.refreshPendingFavorites()
              continue
            }

            if (this.getStudentViewerScope() !== viewerScope) {
              break
            }

            await this.reconcileFavorite(action, readServerEntity(payload, action), viewerScope)
            await deletePendingLocalAction({ viewerScope, action })
            records = await this.refreshPendingFavorites()
          } catch (err) {
            if (isRetriableSyncError(err)) {
              await this.keepForRetry(viewerScope, record, err)
            } else {
              await this.discardAndReconcile(viewerScope, record)
            }
            break
          }
        }
      } finally {
        if (this.replayGeneration === replayGeneration) {
          this.replaying = false
        }
      }
    }
  }
})
