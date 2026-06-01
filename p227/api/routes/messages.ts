import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { processHL7Message } from '../hl7/processor.js'
import { getMessages, getMessageById } from '../db/database.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/', (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const result = getMessages(page, limit)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const message = getMessageById(id)
    if (!message) {
      res.status(404).json({ success: false, error: 'Message not found' })
      return
    }
    res.json({ success: true, data: message })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' })
      return
    }

    const content = req.file.buffer.toString('utf-8')
    const messages = extractMessagesFromFile(content)

    const results = []
    for (const msg of messages) {
      const result = await processHL7Message(msg, 'file')
      results.push(result)
    }

    res.json({
      success: true,
      uploaded: messages.length,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.post('/raw', async (req: Request, res: Response) => {
  try {
    const { message } = req.body
    if (!message) {
      res.status(400).json({ success: false, error: 'No message provided' })
      return
    }

    const result = await processHL7Message(message, 'api')
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

function extractMessagesFromFile(content: string): string[] {
  const messages: string[] = []
  const HL7_START_BLOCK = '\x0b'
  const HL7_END_BLOCK = '\x1c'
  const HL7_CR = '\r'

  if (content.includes(HL7_START_BLOCK) && content.includes(HL7_END_BLOCK)) {
    let remaining = content
    while (true) {
      const startIdx = remaining.indexOf(HL7_START_BLOCK)
      const endIdx = remaining.indexOf(HL7_END_BLOCK)
      if (startIdx === -1 || endIdx === -1) break
      messages.push(remaining.substring(startIdx + 1, endIdx))
      remaining = remaining.substring(endIdx + 1)
    }
  } else {
    const candidate = content.replace(/\n/g, HL7_CR)
    if (candidate.includes('MSH|')) {
      messages.push(candidate)
    }
  }

  return messages
}

export default router
