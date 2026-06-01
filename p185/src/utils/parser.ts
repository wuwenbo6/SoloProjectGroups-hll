import type { AvcRecord, ParseResult, TclassStats, ParseProgress } from '@/types';

const AVC_REGEX = /avc:\s+denied\s+\{([^}]+)\}\s+for\s+pid=(\d+)\s+comm="([^"]+)"(?:\s+name="[^"]*")?.*scontext=(\S+)\s+tcontext=(\S+)\s+tclass=(\S+)/;
const TIMESTAMP_REGEX = /msg=audit\(([\d.]+):\d+\)/;

const CHUNK_SIZE = 1000;

export interface ParseLineResult {
  record: AvcRecord | null;
  tclassMap: Map<string, number>;
  uniqueSubjects: Set<string>;
  uniqueObjects: Set<string>;
}

export function parseSingleLine(
  line: string,
  index: number,
  tclassMap: Map<string, number>,
  uniqueSubjects: Set<string>,
  uniqueObjects: Set<string>
): ParseLineResult {
  if (!line.includes('avc: denied')) {
    return { record: null, tclassMap, uniqueSubjects, uniqueObjects };
  }

  const match = line.match(AVC_REGEX);
  if (!match) {
    return { record: null, tclassMap, uniqueSubjects, uniqueObjects };
  }

  const [, permissionsStr, pid, comm, scontext, tcontext, tclass] = match;
  const permissions = permissionsStr.trim().split(/\s+/);

  let timestamp = '';
  const tsMatch = line.match(TIMESTAMP_REGEX);
  if (tsMatch) {
    const ts = parseFloat(tsMatch[1]);
    timestamp = new Date(ts * 1000).toISOString();
  }

  const record: AvcRecord = {
    id: `${pid}-${Date.now()}-${index}`,
    timestamp,
    pid,
    comm,
    scontext,
    tcontext,
    tclass,
    permissions,
    raw: line.trim(),
  };

  uniqueSubjects.add(scontext);
  uniqueObjects.add(tcontext);
  const current = tclassMap.get(tclass) || 0;
  tclassMap.set(tclass, current + 1);

  return { record, tclassMap, uniqueSubjects, uniqueObjects };
}

export function buildParseResult(
  records: AvcRecord[],
  tclassMap: Map<string, number>,
  uniqueSubjects: Set<string>,
  uniqueObjects: Set<string>
): ParseResult {
  const tclassDistribution: TclassStats[] = Array.from(tclassMap.entries())
    .map(([tclass, count]) => ({
      tclass,
      count,
      percentage: records.length > 0 ? (count / records.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    records,
    stats: {
      totalRecords: records.length,
      uniqueSubjects: uniqueSubjects.size,
      uniqueObjects: uniqueObjects.size,
      uniqueTclasses: tclassMap.size,
    },
    tclassDistribution,
  };
}

export function parseAuditLog(logContent: string): ParseResult {
  const lines = logContent.split('\n');
  const records: AvcRecord[] = [];
  const tclassMap = new Map<string, number>();
  const uniqueSubjects = new Set<string>();
  const uniqueObjects = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const result = parseSingleLine(lines[i], i, tclassMap, uniqueSubjects, uniqueObjects);
    if (result.record) {
      records.push(result.record);
    }
  }

  return buildParseResult(records, tclassMap, uniqueSubjects, uniqueObjects);
}

export async function* streamParseAuditLog(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): AsyncGenerator<AvcRecord[], ParseResult, unknown> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lineIndex = 0;
  let processedLines = 0;
  let foundRecords = 0;

  const records: AvcRecord[] = [];
  const tclassMap = new Map<string, number>();
  const uniqueSubjects = new Set<string>();
  const uniqueObjects = new Set<string>();

  const batch: AvcRecord[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      processedLines++;
      const result = parseSingleLine(
        line,
        lineIndex++,
        tclassMap,
        uniqueSubjects,
        uniqueObjects
      );

      if (result.record) {
        foundRecords++;
        records.push(result.record);
        batch.push(result.record);

        if (batch.length >= CHUNK_SIZE) {
          onProgress?.({
            processedLines,
            foundRecords,
            isComplete: false,
          });
          yield [...batch];
          batch.length = 0;
        }
      }

      if (processedLines % 10000 === 0) {
        onProgress?.({
          processedLines,
          foundRecords,
          isComplete: false,
        });
      }
    }
  }

  if (buffer) {
    processedLines++;
    const result = parseSingleLine(
      buffer,
      lineIndex++,
      tclassMap,
      uniqueSubjects,
      uniqueObjects
    );
    if (result.record) {
      foundRecords++;
      records.push(result.record);
      batch.push(result.record);
    }
  }

  if (batch.length > 0) {
    yield [...batch];
  }

  onProgress?.({
    processedLines,
    foundRecords,
    isComplete: true,
  });

  return buildParseResult(records, tclassMap, uniqueSubjects, uniqueObjects);
}
