interface ChannelData {
  channelIndex: number;
  channelName: string;
  samples: number[];
}

interface ExportOptions {
  includeTimestamp?: boolean;
  sampleRate?: number;
  startTimeNs?: bigint;
}

export function channelsToCsv(
  channels: ChannelData[],
  options: ExportOptions = {}
): string {
  const { includeTimestamp = false, sampleRate = 1, startTimeNs = 0n } = options;

  if (channels.length === 0) {
    return '';
  }

  const maxSamples = Math.max(...channels.map(c => c.samples.length));

  const headers: string[] = [];

  if (includeTimestamp) {
    headers.push('Sample Index');
    headers.push('Time (s)');
  } else {
    headers.push('Sample Index');
  }

  for (const ch of channels) {
    headers.push(ch.channelName);
  }

  const rows: string[] = [headers.join(',')];

  for (let i = 0; i < maxSamples; i++) {
    const row: string[] = [];

    if (includeTimestamp) {
      row.push(String(i));
      const timeNs = startTimeNs + BigInt(Math.floor(i / sampleRate) * 1000000000);
      const timeS = Number(timeNs) / 1e9;
      row.push(timeS.toFixed(9));
    } else {
      row.push(String(i));
    }

    for (const ch of channels) {
      const value = i < ch.samples.length ? ch.samples[i] : '';
      row.push(String(value));
    }

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

export function downloadCsv(
  channels: ChannelData[],
  fileName: string,
  options: ExportOptions = {}
): void {
  const csv = channelsToCsv(channels, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateFileName(
  channels: ChannelData[],
  baseName: string
): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  return `${baseName}_pcm_channels_${timestamp}.csv`;
}
