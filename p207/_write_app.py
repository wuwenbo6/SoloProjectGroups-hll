import os

app_content = """import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createSimulationRoutes } from './routes/simulation.js'
import { SimulationEngine } from './simulation/simulationEngine.js'

dotenv.config()

const app: express.Application = express()

export const simulationEngine = new SimulationEngine()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/simulation', createSimulationRoutes(simulationEngine))

app.use('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'ok' })
})

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ success: false, error: 'Server internal error' })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'API not found' })
})

export default app
"""

with open('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p207/api/app.ts', 'w') as f:
    f.write(app_content)
print('app.ts written successfully')
