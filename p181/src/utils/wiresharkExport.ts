import { TLP, ModifiedTLP } from '@/types/tlp';

function writeUint32LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

function writeUint16LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = (value >> 24) & 0xff;
  buf[offset + 1] = (value >> 16) & 0xff;
  buf[offset + 2] = (value >> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function writeUint64LE(buf: Uint8Array, offset: number, value: number) {
  writeUint32LE(buf, offset, value & 0xffffffff);
  writeUint32LE(buf, offset + 4, Math.floor(value / 0x100000000) & 0xffffffff);
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xa0010000 : 0);
      crc = ((crc >>> 1) ^ (crc & 1 ? 0x80000000 : 0)) >>> 0;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function computeBlockCRC(buf: Uint8Array, length: number): number {
  const data = buf.slice(0, length);
  return crc32(data);
}

const DLT_USER0 = 147;
const PCAPNG_MAGIC = 0x0a0d0d0a;
const PCAPNG_VERSION_MAJOR = 1;
const PCAPNG_VERSION_MINOR = 0;

export function exportToPcapng(
  tlps: TLP[],
  modifiedTLPs: Map<number, ModifiedTLP>
): Blob {
  const blocks: Uint8Array[] = [];

  {
    const shbLength = 28;
    const shb = new Uint8Array(shbLength);
    writeUint32LE(shb, 0, PCAPNG_MAGIC);
    writeUint32LE(shb, 4, PCAPNG_VERSION_MAJOR | (PCAPNG_VERSION_MINOR << 16));
    writeUint64LE(shb, 8, -1);
    writeUint32LE(shb, 16, shbLength);
    writeUint32LE(shb, shbLength - 4, shbLength);
    blocks.push(shb);
  }

  {
    const idbLength = 20;
    const idb = new Uint8Array(idbLength);
    writeUint32LE(idb, 0, 0x00000001);
    writeUint16LE(idb, 4, 0x0001);
    writeUint16LE(idb, 6, 0x0000);
    writeUint32LE(idb, 8, 65535);
    writeUint32LE(idb, 12, DLT_USER0);
    writeUint32LE(idb, 16, idbLength);
    writeUint32LE(idb, idbLength - 4, idbLength);
    blocks.push(idb);
  }

  for (let i = 0; i < tlps.length; i++) {
    const tlp = tlps[i];
    const modified = modifiedTLPs.get(tlp.index);
    const packetData = modified ? modified.modifiedData : tlp.rawData;

    const paddedLength = Math.ceil(packetData.length / 4) * 4;
    const epbLength = 32 + paddedLength;
    const totalLength = epbLength;

    const epb = new Uint8Array(totalLength);
    writeUint32LE(epb, 0, 0x00000006);
    writeUint32LE(epb, 4, 0);
    writeUint16LE(epb, 8, 0);
    writeUint16LE(epb, 10, 0);
    writeUint64LE(epb, 12, i);
    writeUint32LE(epb, 20, packetData.length);
    writeUint32LE(epb, 24, paddedLength);
    epb.set(packetData, 28);
    writeUint32LE(epb, totalLength - 4, totalLength);

    blocks.push(epb);
  }

  const totalSize = blocks.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }

  return new Blob([result], { type: 'application/octet-stream' });
}

export function exportToPcap(
  tlps: TLP[],
  modifiedTLPs: Map<number, ModifiedTLP>
): Blob {
  const PCAP_MAGIC = 0xa1b2c3d4;
  const PCAP_VERSION_MAJOR = 2;
  const PCAP_VERSION_MINOR = 4;
  const PCAP_THISZONE = 0;
  const PCAP_SIGFIGS = 0;
  const PCAP_SNAPLEN = 65535;

  const globalHeader = new Uint8Array(24);
  writeUint32LE(globalHeader, 0, PCAP_MAGIC);
  writeUint16LE(globalHeader, 4, PCAP_VERSION_MAJOR);
  writeUint16LE(globalHeader, 6, PCAP_VERSION_MINOR);
  writeUint32LE(globalHeader, 8, PCAP_THISZONE);
  writeUint32LE(globalHeader, 12, PCAP_SIGFIGS);
  writeUint32LE(globalHeader, 16, PCAP_SNAPLEN);
  writeUint32LE(globalHeader, 20, DLT_USER0);

  const packetHeaders: Uint8Array[] = [];
  const packetDatas: Uint8Array[] = [];

  for (let i = 0; i < tlps.length; i++) {
    const tlp = tlps[i];
    const modified = modifiedTLPs.get(tlp.index);
    const packetData = modified ? modified.modifiedData : tlp.rawData;

    const pktHeader = new Uint8Array(16);
    writeUint32LE(pktHeader, 0, 0);
    writeUint32LE(pktHeader, 4, 0);
    writeUint32LE(pktHeader, 8, packetData.length);
    writeUint32LE(pktHeader, 12, packetData.length);

    packetHeaders.push(pktHeader);
    packetDatas.push(packetData);
  }

  const totalSize = 24 + packetHeaders.reduce((s, h) => s + h.length, 0) + packetDatas.reduce((s, d) => s + d.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  result.set(globalHeader, offset);
  offset += 24;

  for (let i = 0; i < tlps.length; i++) {
    result.set(packetHeaders[i], offset);
    offset += 16;
    result.set(packetDatas[i], offset);
    offset += packetDatas[i].length;
  }

  return new Blob([result], { type: 'application/octet-stream' });
}

export function exportToHexDump(
  tlps: TLP[],
  modifiedTLPs: Map<number, ModifiedTLP>
): string {
  const lines: string[] = [];

  lines.push('# ============================================================');
  lines.push('# PCIe TLP Capture - Hex Dump Format');
  lines.push('# Compatible with Wireshark "Import from Hex Dump"');
  lines.push('# Import: Wireshark -> File -> Import -> From Hex Dump');
  lines.push('# Set: Direction = In, Timestamp = No, Encapsulation = PCIe');
  lines.push('# ============================================================');
  lines.push('');

  for (let i = 0; i < tlps.length; i++) {
    const tlp = tlps[i];
    const modified = modifiedTLPs.get(tlp.index);
    const data = modified ? modified.modifiedData : tlp.rawData;

    lines.push(`# TLP #${i + 1}: ${tlp.header.type}, Length: ${data.length} bytes`);

    for (let j = 0; j < data.length; j += 16) {
      const slice = data.slice(j, Math.min(j + 16, data.length));
      const offset = j.toString(16).padStart(8, '0');
      const hexParts: string[] = [];
      for (let k = 0; k < slice.length; k++) {
        hexParts.push(slice[k].toString(16).padStart(2, '0'));
        if (k === 7) hexParts.push(' ');
      }
      const hex = hexParts.join(' ');
      const ascii = Array.from(slice)
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
        .join('');
      lines.push(`${offset}  ${hex.padEnd(49)}  |${ascii}|`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function exportToWiresharkXML(
  tlps: TLP[],
  modifiedTLPs: Map<number, ModifiedTLP>
): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0"?>');
  lines.push('<?xml-stylesheet type="text/xsl" href="pdml2html.xsl"?>');
  lines.push('<pdml>');
  lines.push('');

  for (let i = 0; i < tlps.length; i++) {
    const tlp = tlps[i];
    const modified = modifiedTLPs.get(tlp.index);
    const data = modified ? modified.modifiedData : tlp.rawData;

    const hexBytes = Array.from(data)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    lines.push(`  <packet>`);
    lines.push(`    <proto name="pcie" showname="PCI Express" size="${data.length}" pos="0">`);

    const dw0 = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    const format = (dw0 >>> 29) & 0x7;
    const typeCode = (dw0 >>> 24) & 0x1f;
    const length = dw0 & 0x3ff;
    const tc = (dw0 >>> 20) & 0x7;
    const td = (dw0 >>> 15) & 0x1;
    const ep = (dw0 >>> 14) & 0x1;
    const attr = ((dw0 >>> 18) & 0x3) | ((dw0 >>> 13) & 0x4);

    lines.push(`      <field name="pcie.tlp.format" showname="Format: ${format}" size="1" pos="0" show="${format}" value="${(dw0 >>> 28).toString(16).padStart(2, '0')}"/>`);
    lines.push(`      <field name="pcie.tlp.type" showname="Type: ${tlp.header.type}" size="1" pos="0" show="${typeCode}" value="${typeCode.toString(16).padStart(2, '0')}"/>`);
    lines.push(`      <field name="pcie.tlp.traffic_class" showname="Traffic Class: ${tc}" size="1" pos="0" show="${tc}" value="${tc.toString(16).padStart(2, '0')}"/>`);
    lines.push(`      <field name="pcie.tlp.length" showname="Length: ${length} DW" size="2" pos="2" show="${length}" value="${length.toString(16).padStart(4, '0')}"/>`);
    lines.push(`      <field name="pcie.tlp.td" showname="TLP Digest: ${td ? 'Yes' : 'No'}" size="0" pos="0" show="${td}" value="${td}"/>`);
    lines.push(`      <field name="pcie.tlp.ep" showname="Error Poisoned: ${ep ? 'Yes' : 'No'}" size="0" pos="0" show="${ep}" value="${ep}"/>`);
    lines.push(`      <field name="pcie.tlp.attr" showname="Attributes: ${attr}" size="0" pos="0" show="${attr}" value="${attr.toString(16)}"/>`);

    if (tlp.header.requesterId !== undefined) {
      lines.push(`      <field name="pcie.tlp.requester_id" showname="Requester ID: 0x${tlp.header.requesterId.toString(16).padStart(4, '0')}" size="2" pos="4" show="0x${tlp.header.requesterId.toString(16).padStart(4, '0')}" value="${tlp.header.requesterId.toString(16).padStart(4, '0')}"/>`);
    }
    if (tlp.header.tag !== undefined) {
      lines.push(`      <field name="pcie.tlp.tag" showname="Tag: 0x${tlp.header.tag.toString(16).padStart(2, '0')}" size="1" pos="6" show="0x${tlp.header.tag.toString(16).padStart(2, '0')}" value="${tlp.header.tag.toString(16).padStart(2, '0')}"/>`);
    }
    if (tlp.header.address !== undefined) {
      lines.push(`      <field name="pcie.tlp.address" showname="Address: 0x${tlp.header.address.toString(16).padStart(8, '0')}" size="4" pos="8" show="0x${tlp.header.address.toString(16).padStart(8, '0')}" value="${tlp.header.address.toString(16).padStart(8, '0')}"/>`);
    }
    if (tlp.header.completerId !== undefined) {
      lines.push(`      <field name="pcie.tlp.completer_id" showname="Completer ID: 0x${tlp.header.completerId.toString(16).padStart(4, '0')}" size="2" pos="4" show="0x${tlp.header.completerId.toString(16).padStart(4, '0')}" value="${tlp.header.completerId.toString(16).padStart(4, '0')}"/>`);
    }
    if (tlp.header.statusCode !== undefined) {
      lines.push(`      <field name="pcie.tlp.status" showname="Status: ${tlp.header.status}" size="0" pos="0" show="${tlp.header.statusCode}" value="${tlp.header.statusCode.toString(16)}"/>`);
    }
    if (tlp.header.byteCount !== undefined) {
      lines.push(`      <field name="pcie.tlp.byte_count" showname="Byte Count: ${tlp.header.byteCount}" size="2" pos="6" show="${tlp.header.byteCount}" value="${tlp.header.byteCount.toString(16).padStart(4, '0')}"/>`);
    }

    lines.push(`      <field name="pcie.tlp.raw" showname="Raw Data" size="${data.length}" pos="0" show="${hexBytes}" value="${hexBytes}"/>`);
    lines.push(`    </proto>`);
    lines.push(`  </packet>`);
    lines.push('');
  }

  lines.push('</pdml>');
  return lines.join('\n');
}

export type ExportFormat = 'pcap' | 'pcapng' | 'hexdump' | 'pdml';

export function exportFile(
  tlps: TLP[],
  modifiedTLPs: Map<number, ModifiedTLP>,
  format: ExportFormat,
  fileName: string
): void {
  let blob: Blob;
  let extension: string;

  switch (format) {
    case 'pcap': {
      blob = exportToPcap(tlps, modifiedTLPs);
      extension = '.pcap';
      break;
    }
    case 'pcapng': {
      blob = exportToPcapng(tlps, modifiedTLPs);
      extension = '.pcapng';
      break;
    }
    case 'hexdump': {
      const content = exportToHexDump(tlps, modifiedTLPs);
      blob = new Blob([content], { type: 'text/plain' });
      extension = '.txt';
      break;
    }
    case 'pdml': {
      const content = exportToWiresharkXML(tlps, modifiedTLPs);
      blob = new Blob([content], { type: 'application/xml' });
      extension = '.pdml.xml';
      break;
    }
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const exportName = `${baseName}_pcie${extension}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
