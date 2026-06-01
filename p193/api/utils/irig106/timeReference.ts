import type { TimeReference, TimeReferenceConfig, ParseResult, PacketSummary, PacketDetail } from '../../../shared/types';
import { formatTimestamp } from './packetHeader';

const NANOS_PER_SECOND = 1000000000n;
const UNIX_EPOCH_TO_IRIG_EPOCH_NS = 631152000n * NANOS_PER_SECOND;

function dateToNanos(date: Date): bigint {
  return BigInt(date.getTime()) * 1000000n;
}

export function detectTimeReferenceFromTmats(tmatsFields: Record<string, string | number | bigint>): TimeReference | null {
  const timeSourceKey = Object.keys(tmatsFields).find(k => 
    k.toLowerCase().includes('time') && k.toLowerCase().includes('source')
  );
  const epochKey = Object.keys(tmatsFields).find(k => 
    k.toLowerCase().includes('epoch') || (k.toLowerCase().includes('time') && k.toLowerCase().includes('ref'))
  );

  if (epochKey) {
    const value = tmatsFields[epochKey];
    if (typeof value === 'string') {
      const numMatch = value.match(/-?\d+/);
      if (numMatch) {
        return {
          referenceEpochNs: BigInt(numMatch[0]),
          referenceTime: new Date(Number(BigInt(numMatch[0]) / 1000000n)),
          timeSource: (timeSourceKey && String(tmatsFields[timeSourceKey])) || 'TMATS'
        };
      }
    }
  }

  return null;
}

export function resolveTimeReference(
  config: TimeReferenceConfig | undefined,
  tmatsFields?: Record<string, string | number | bigint>
): TimeReference | null {
  if (!config || !config.enabled) {
    return null;
  }

  if (config.autoDetectFromTmats && tmatsFields) {
    const detected = detectTimeReferenceFromTmats(tmatsFields);
    if (detected) return detected;
  }

  if (config.referenceEpochNs !== undefined) {
    return {
      referenceEpochNs: config.referenceEpochNs,
      referenceTime: config.referenceTime ? new Date(config.referenceTime) : new Date(Number(config.referenceEpochNs / 1000000n)),
      timeSource: 'USER'
    };
  }

  if (config.referenceTime) {
    const date = new Date(config.referenceTime);
    if (!isNaN(date.getTime())) {
      return {
        referenceEpochNs: dateToNanos(date),
        referenceTime: date,
        timeSource: 'USER'
      };
    }
  }

  return {
    referenceEpochNs: UNIX_EPOCH_TO_IRIG_EPOCH_NS,
    referenceTime: new Date('1990-01-01T00:00:00Z'),
    timeSource: 'DEFAULT_IRIG_1990'
  };
}

export function applyTimeReference(
  result: ParseResult,
  timeRef: TimeReference
): ParseResult {
  const packets = result.packets.map(pkt => ({
    ...pkt,
    timestampNs: pkt.timestampNs + timeRef.referenceEpochNs,
    timestamp: formatTimestamp(pkt.timestampNs + timeRef.referenceEpochNs)
  }));

  const packetDetails: Record<number, PacketDetail> = {};
  for (const [idxStr, detail] of Object.entries(result.packetDetails)) {
    const idx = parseInt(idxStr);
    const newTsNs = detail.timestampNs + timeRef.referenceEpochNs;
    packetDetails[idx] = {
      ...detail,
      timestampNs: newTsNs,
      timestamp: formatTimestamp(newTsNs),
      header: {
        ...detail.header,
        timestamp: newTsNs
      }
    };
  }

  return {
    ...result,
    packets,
    packetDetails
  };
}

export function formatDateTime(timestampNs: bigint): string {
  const ms = Number(timestampNs / 1000000n);
  const date = new Date(ms);
  const ns = Number(timestampNs % 1000000000n);
  return date.toISOString().replace('Z', `.${ns.toString().padStart(9, '0')}Z`);
}
