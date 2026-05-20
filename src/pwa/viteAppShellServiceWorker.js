import fs from 'node:fs'
import path from 'node:path'
import {
  createServiceWorkerSource,
  defaultServiceWorkerCacheName,
  serviceWorkerFileName
} from './serviceWorkerTemplate.js'

const listPublicAssets = (publicDir) => {
  if (!fs.existsSync(publicDir)) {
    return []
  }

  const assets = []
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      const publicPath = path.posix.join(prefix, entry.name)

      if (entry.isDirectory()) {
        visit(entryPath, publicPath)
      } else if (entry.isFile()) {
        assets.push(`/${publicPath}`)
      }
    }
  }

  visit(publicDir)
  return assets
}

export const createAppShellServiceWorkerPlugin = ({
  publicDir = 'public',
  cacheName = defaultServiceWorkerCacheName
} = {}) => ({
  name: 'swindirectory-app-shell-service-worker',
  apply: 'build',
  generateBundle(_options, bundle) {
    const buildAssets = Object.values(bundle)
      .map((item) => item.fileName)
      .filter((fileName) => fileName && fileName !== serviceWorkerFileName)
      .map((fileName) => `/${fileName}`)
    const appShellAssets = [
      '/',
      '/index.html',
      ...buildAssets,
      ...listPublicAssets(path.resolve(process.cwd(), publicDir))
    ]

    this.emitFile({
      type: 'asset',
      fileName: serviceWorkerFileName,
      source: createServiceWorkerSource({
        assets: appShellAssets,
        cacheName
      })
    })
  }
})
