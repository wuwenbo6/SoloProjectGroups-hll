import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import uploadRoutes from './routes/upload.js'
import rinexRoutes from './routes/rinex.js'
import snrRoutes from './routes/snr.js'
import mwRoutes from './routes/mw.js'
import sppRoutes from './routes/spp.js'
import rtcmRoutes from './routes/rtcm.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '500mb' }))
app.use(express.urlencoded({ extended: true, limit: '500mb' }))

app.use('/api/upload', uploadRoutes)
app.use('/api/rinex', rinexRoutes)
app.use('/api/snr', snrRoutes)
app.use('/api/mw', mwRoutes)
app.use('/api/spp', sppRoutes)
app.use('/api/rtcm', rtcmRoutes)

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
  console.error('Unhandled error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
