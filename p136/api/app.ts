/**
 * STM32 Firmware Sign & Encrypt API Server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import multer from 'multer'
import firmwareRoutes from './routes/firmware'
import verifyRoutes from './routes/verify'
import logRoutes from './routes/logs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/firmware', firmwareRoutes)
app.use('/api/verify', verifyRoutes)
app.use('/api/logs', logRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'STM32 Firmware Sign & Encrypt API is running',
      timestamp: Date.now(),
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${error.message}`,
    })
  }
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: error.message,
    })
  }
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error: ' + error.message,
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
