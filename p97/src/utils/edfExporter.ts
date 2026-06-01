import { EEGData } from '../hooks/useBluetooth';

export class EDFExporter {
  private static readonly HEADER_SIZE = 256;
  private static readonly RECORD_SIZE = 256 * 2 * 4;

  static exportToEDF(
    eegData: EEGData[],
    patientName: string = 'Unknown',
    recordingName: string = 'EEG_Recording'
  ): Blob {
    if (eegData.length === 0) {
      throw new Error('No EEG data to export');
    }

    const numSamples = eegData.length;
    const numChannels = 4;
    const samplingRate = 256;
    const numDataRecords = Math.ceil(numSamples / samplingRate);
    const duration = 1;

    const header = this.createHeader(
      patientName,
      recordingName,
      numChannels,
      numDataRecords,
      duration,
      samplingRate
    );

    const dataRecords = this.createDataRecords(eegData, numChannels, numDataRecords, samplingRate);

    return new Blob([header, dataRecords], { type: 'application/x-edf' });
  }

  private static createHeader(
    patientName: string,
    recordingName: string,
    numChannels: number,
    numDataRecords: number,
    duration: number,
    samplingRate: number
  ): Uint8Array {
    const header = new Uint8Array(this.HEADER_SIZE + numChannels * 256);
    const encoder = new TextEncoder();

    const writeString = (offset: number, str: string, length: number) => {
      const bytes = encoder.encode(str.padEnd(length, ' ').slice(0, length));
      header.set(bytes, offset);
    };

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '.');

    let offset = 0;
    writeString(offset, '0', 8); offset += 8;
    writeString(offset, patientName.slice(0, 80).padEnd(80, ' '), 80); offset += 80;
    writeString(offset, recordingName.slice(0, 80).padEnd(80, ' '), 80); offset += 80;
    writeString(offset, dateStr, 8); offset += 8;
    writeString(offset, timeStr, 8); offset += 8;
    writeString(offset, (this.HEADER_SIZE + numChannels * 256).toString(), 8); offset += 8;
    writeString(offset, 'EDF+C', 44); offset += 44;
    writeString(offset, numDataRecords.toString(), 8); offset += 8;
    writeString(offset, duration.toString(), 8); offset += 8;
    writeString(offset, numChannels.toString(), 4); offset += 4;

    const channelLabels = ['EEG TP9', 'EEG AF7', 'EEG AF8', 'EEG TP10'];
    for (let i = 0; i < numChannels; i++) {
      writeString(offset, channelLabels[i] || `EEG ${i + 1}`, 16); offset += 16;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, 'Muse', 80); offset += 80;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, 'uV', 8); offset += 8;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, '-1000', 8); offset += 8;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, '1000', 8); offset += 8;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, '-32768', 8); offset += 8;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, '32767', 8); offset += 8;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, 'HP:0.5Hz LP:50Hz', 80); offset += 80;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, samplingRate.toString(), 8); offset += 8;
    }

    for (let i = 0; i < numChannels; i++) {
      writeString(offset, '', 32); offset += 32;
    }

    return header;
  }

  private static createDataRecords(
    eegData: EEGData[],
    numChannels: number,
    numDataRecords: number,
    samplesPerRecord: number
  ): Uint8Array {
    const totalSamples = numDataRecords * samplesPerRecord * numChannels;
    const data = new Int16Array(totalSamples);
    const view = new DataView(data.buffer);

    for (let record = 0; record < numDataRecords; record++) {
      for (let channel = 0; channel < numChannels; channel++) {
        for (let sample = 0; sample < samplesPerRecord; sample++) {
          const dataIndex = record * samplesPerRecord + sample;
          const viewIndex = (record * numChannels * samplesPerRecord + channel * samplesPerRecord + sample) * 2;

          if (dataIndex < eegData.length) {
            const value = eegData[dataIndex].channelData[channel] || 0;
            const scaledValue = Math.max(-32768, Math.min(32767, Math.round(value * 1000000)));
            view.setInt16(viewIndex, scaledValue, true);
          } else {
            view.setInt16(viewIndex, 0, true);
          }
        }
      }
    }

    return new Uint8Array(data.buffer);
  }

  static downloadEDF(
    eegData: EEGData[],
    patientName?: string,
    filename?: string
  ): void {
    const blob = this.exportToEDF(eegData, patientName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `EEG_${new Date().toISOString().slice(0, 10)}.edf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static exportToCSV(eegData: EEGData[]): Blob {
    const headers = ['timestamp', 'TP9', 'AF7', 'AF8', 'TP10'];
    const rows = eegData.map(d => 
      `${d.timestamp},${d.channelData.map(v => v.toFixed(9)).join(',')}`
    );
    const csv = [headers.join(','), ...rows].join('\n');
    return new Blob([csv], { type: 'text/csv' });
  }

  static downloadCSV(eegData: EEGData[], filename?: string): void {
    const blob = this.exportToCSV(eegData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `EEG_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
