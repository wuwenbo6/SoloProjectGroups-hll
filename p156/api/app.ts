import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import session from 'express-session'
import { fileURLToPath } from 'url'
import databaseRoutes from './routes/database.js'
import { startSessionCleanup, stopSessionCleanup } from './services/sessionCleanup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

const SESSION_MAX_AGE = 1000 * 60 * 60 * 24

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'sqlite-browser-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
    },
  }),
)

startSessionCleanup()

process.on('SIGTERM', () => {
  stopSessionCleanup()
})

process.on('SIGINT', () => {
  stopSessionCleanup()
})

app.use('/api', databaseRoutes)

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
  console.error('Server error:', error)
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
