import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import pluginRoutes from './routes/plugins.js'
import uploadRoutes from './routes/upload.js'
import qgisRoutes from './routes/qgis.js'
import dependencyRoutes from './routes/dependencies.js'
import developmentRoutes from './routes/development.js'
import { pluginController } from './controllers/plugin.controller.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

const storagePath = path.resolve(process.env.STORAGE_PATH || './storage')
app.use('/icons', express.static(path.join(storagePath, 'icons')))
app.use('/storage', express.static(storagePath))

app.get('/plugins.xml', pluginController.getPluginsXml)
app.get('/rss.xml', pluginController.getRssXml)

app.use('/api/auth', authRoutes)
app.use('/api/plugins', pluginRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/qgis', qgisRoutes)
app.use('/api/dependencies', dependencyRoutes)
app.use('/api/development', developmentRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', error)
  res.status(500).json({
    success: false,
    error: error.message || 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
