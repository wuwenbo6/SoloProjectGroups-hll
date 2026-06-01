import { hl7Parser } from './parser.js'

export type AcknowledgmentCode = 'AA' | 'AR' | 'AE' | 'CA' | 'CR' | 'CE'

export interface ACKOptions {
  acknowledgmentCode: AcknowledgmentCode
  messageControlId: string
  textMessage?: string
  errorCode?: string
  sequenceNumber?: string
  expectedSequenceNumber?: string
  delayAcknowledgment?: string
  messageType?: string
  receivingApplication?: string
  receivingFacility?: string
}

export interface ParsedMSHInfo {
  fieldSeparator: string
  encodingCharacters: string
  sendingApplication: string
  sendingFacility: string
  receivingApplication?: string
  receivingFacility?: string
  messageControlId: string
  processingId: string
  versionId: string
}

class ACKGenerator {
  private readonly defaultReceivingApp = 'HL7_RECEIVER'
  private readonly defaultReceivingFacility = 'HL7_FACILITY'

  parseMSHForACK(rawMessage: string): ParsedMSHInfo | null {
    try {
      const parsed = hl7Parser.parse(rawMessage)
      return {
        fieldSeparator: parsed.msh.fieldSeparator,
        encodingCharacters: parsed.msh.encodingCharacters,
        sendingApplication: parsed.msh.sendingApplication,
        sendingFacility: parsed.msh.sendingFacility,
        receivingApplication: parsed.msh.receivingApplication,
        receivingFacility: parsed.msh.receivingFacility,
        messageControlId: parsed.msh.messageControlId,
        processingId: parsed.msh.processingId,
        versionId: parsed.msh.versionId
      }
    } catch {
      const mshMatch = rawMessage.match(/MSH\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/)
      if (mshMatch) {
        return {
          fieldSeparator: '|',
          encodingCharacters: mshMatch[1] || '^~\\&',
          sendingApplication: mshMatch[2] || '',
          sendingFacility: mshMatch[3] || '',
          receivingApplication: mshMatch[4] || '',
          receivingFacility: mshMatch[5] || '',
          messageControlId: mshMatch[8] || '',
          processingId: mshMatch[10] || 'P',
          versionId: mshMatch[11] || '2.5'
        }
      }
      return null
    }
  }

  generateACK(
    mshInfo: ParsedMSHInfo,
    options: ACKOptions
  ): string {
    const fs = mshInfo.fieldSeparator
    const enc = mshInfo.encodingCharacters
    const now = new Date()
    const timestamp = this.formatHL7Timestamp(now)

    const ackMsgControlId = `ACK${now.getTime().toString().slice(-12)}`

    const mshSegments: string[] = [
      'MSH',
      enc,
      this.defaultReceivingApp,
      this.defaultReceivingFacility,
      mshInfo.sendingApplication,
      mshInfo.sendingFacility,
      timestamp,
      '',
      'ACK',
      ackMsgControlId,
      mshInfo.processingId,
      mshInfo.versionId
    ]

    const msaSegments: string[] = [
      'MSA',
      options.acknowledgmentCode,
      options.messageControlId,
      options.textMessage || '',
      options.expectedSequenceNumber || '',
      options.delayAcknowledgment || '',
      options.errorCode || ''
    ]

    const msh = mshSegments.join(fs)
    const msa = msaSegments.join(fs)

    let ack = `${msh}\r${msa}\r`

    if (options.acknowledgmentCode !== 'AA') {
      const errSegments = this.generateERRSegment(options, fs)
      if (errSegments) {
        ack += `${errSegments}\r`
      }
    }

    return ack
  }

  private generateERRSegment(options: ACKOptions, fieldSep: string): string | null {
    if (!options.errorCode) return null

    const errSegments: string[] = [
      'ERR',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      options.errorCode.substring(0, 200)
    ]

    return errSegments.join(fieldSep)
  }

  generateAA(mshInfo: ParsedMSHInfo, messageControlId: string, textMessage?: string): string {
    return this.generateACK(mshInfo, {
      acknowledgmentCode: 'AA',
      messageControlId,
      textMessage: textMessage || 'Message accepted successfully'
    })
  }

  generateAE(mshInfo: ParsedMSHInfo, messageControlId: string, errorMessage: string, errorCode?: string): string {
    return this.generateACK(mshInfo, {
      acknowledgmentCode: 'AE',
      messageControlId,
      textMessage: errorMessage.substring(0, 80),
      errorCode: errorCode || '207'
    })
  }

  generateAR(mshInfo: ParsedMSHInfo, messageControlId: string, errorMessage: string, errorCode?: string): string {
    return this.generateACK(mshInfo, {
      acknowledgmentCode: 'AR',
      messageControlId,
      textMessage: errorMessage.substring(0, 80),
      errorCode: errorCode || '100'
    })
  }

  formatHL7Timestamp(date: Date): string {
    return date.getFullYear().toString() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0') +
      String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0') +
      String(date.getSeconds()).padStart(2, '0')
  }

  wrapMLLP(message: string): Buffer {
    const HL7_START = '\x0b'
    const HL7_END = '\x1c'
    const HL7_CR = '\x0d'
    return Buffer.from(HL7_START + message + HL7_END + HL7_CR, 'binary')
  }

  unwrapMLLP(buffer: Buffer): string {
    let data = buffer.toString('binary')
    const startIdx = data.indexOf('\x0b')
    const endIdx = data.indexOf('\x1c\x0d')
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return data.substring(startIdx + 1, endIdx)
    }
    return data
  }

  parseAcknowledgmentCode(code: string): AcknowledgmentCode {
    const validCodes: AcknowledgmentCode[] = ['AA', 'AR', 'AE', 'CA', 'CR', 'CE']
    if (validCodes.includes(code as AcknowledgmentCode)) {
      return code as AcknowledgmentCode
    }
    return 'AE'
  }

  getAcknowledgmentDescription(code: AcknowledgmentCode): string {
    const descriptions: Record<AcknowledgmentCode, string> = {
      'AA': 'Application Accept - 消息被成功接受并处理',
      'AR': 'Application Reject - 消息被拒绝，未处理',
      'AE': 'Application Error - 处理消息时发生应用程序错误',
      'CA': 'Commit Accept - 消息被接受',
      'CR': 'Commit Reject - 消息被拒绝',
      'CE': 'Commit Error - 提交消息时出错'
    }
    return descriptions[code]
  }
}

export const ackGenerator = new ACKGenerator()
export default ACKGenerator
