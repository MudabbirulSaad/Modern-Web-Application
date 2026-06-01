import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

const projectRoot = process.cwd()
dotenv.config({ path: path.join(projectRoot, '.env') })

const templatePath = path.join(projectRoot, 'config', 'mercury', '.htaccess.template')
const outputPath = path.join(projectRoot, 'dist', '.htaccess')

const basePath = process.env.VITE_BASE_PATH || '/cos30043/s105281389/swindir/'
const backendPort = process.env.MERCURY_BACKEND_PORT || '41389'

const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`
const template = fs.readFileSync(templatePath, 'utf8')

const htaccess = template
  .replaceAll('__MERCURY_BASE_PATH__', normalizedBasePath)
  .replaceAll('__MERCURY_BACKEND_PORT__', backendPort)

fs.writeFileSync(outputPath, htaccess)

console.log(`Mercury .htaccess written to ${path.relative(projectRoot, outputPath)}`)
console.log(`API proxy target: http://127.0.0.1:${backendPort}/api`)
console.log(`Backend command: HOST=127.0.0.1 PORT=${backendPort} nohup npm run server > backend.log 2>&1 &`)
console.log(`Health check: https://mercury.swin.edu.au${normalizedBasePath}api/health`)
