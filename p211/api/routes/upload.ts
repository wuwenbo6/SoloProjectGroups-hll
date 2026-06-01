import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { parseUbxBuffer } from '../services/ubxParser.js'
import { generateRinex } from '../services/rinexGenerator.js'
import { extractSnrData } from '../services/snrExtractor.js'
import { analyzeMW } from '../services/mwCycleSlip.js'
import { computeAllSPP, computeAveragePosition } from '../services/sppSolver.js'
import * as store from '../store/dataStore.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } })
const router = Router()

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ success: false, error: 'No file uploaded' })
      return
    }

    if (!file.originalname.toLowerCase().endsWith('.ubx')) {
      res.status(400).json({ success: false, error: 'Only .ubx files are supported' })
      return
    }

    const buffer = file.buffer
    const parsed = parseUbxBuffer(buffer)

    if (parsed.epochs.length === 0) {
      res.status(400).json({ success: false, error: 'No RAWX messages found in the UBX file' })
      return
    }

    const fileId = uuidv4()
    const rinex = generateRinex(parsed, file.originalname)
    const snrData = extractSnrData(parsed)
    const mwData = analyzeMW(parsed)
    const sppResults = computeAllSPP(parsed)
    const avgPosition = sppResults.length > 0 ? computeAveragePosition(sppResults) : null

    store.set(fileId, { parsed, rinex, fileName: file.originalname, mwData, sppResults })

    res.json({
      success: true,
      fileId,
      fileName: file.originalname,
      fileSize: file.size,
      stats: parsed.stats,
      snrData,
      mwData: mwData.map((m) => ({
        system: m.system,
        svId: m.svId,
        signalType1: m.signalType1,
        signalType2: m.signalType2,
        meanMW: m.meanMW,
        stdMW: m.stdMW,
        cycleSlipCount: m.cycleSlips.length,
        halfCycleCount: m.halfCycleCount,
        epochCount: m.mwData.length,
      })),
      position: avgPosition
        ? {
            lat: avgPosition.lat,
            lon: avgPosition.lon,
            height: avgPosition.height,
            sigmaLat: avgPosition.sigmaLat,
            sigmaLon: avgPosition.sigmaLon,
            sigmaHeight: avgPosition.sigmaHeight,
            avgPdop: avgPosition.avgPdop,
            avgSats: avgPosition.avgSats,
          }
        : null,
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ success: false, error: 'Failed to parse UBX file' })
  }
})

export default router
