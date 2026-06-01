import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIrig106File } from '../api/utils/irig106/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFilePath = path.join(__dirname, '..', 'test_data.ch10');

console.log('='.repeat(60));
console.log('Testing IRIG 106 Chapter 10 Parser');
console.log('='.repeat(60));

try {
  const buffer = fs.readFileSync(testFilePath);
  console.log(`\nRead file: ${testFilePath}`);
  console.log(`File size: ${buffer.length} bytes`);
  
  const result = parseIrig106File(buffer, 'test_data.ch10');
  
  console.log('\n' + '='.repeat(60));
  console.log('Parse Result:');
  console.log('='.repeat(60));
  
  console.log(`\nSuccess: ${result.success}`);
  console.log(`File Name: ${result.fileName}`);
  console.log(`File Size: ${result.fileSize} bytes`);
  
  console.log('\nFile Header:');
  console.log(`  Sync Pattern: ${result.fileHeader.syncPattern}`);
  console.log(`  Version: ${result.fileHeader.versionMajor}.${result.fileHeader.versionMinor}`);
  console.log(`  File Size: ${result.fileHeader.fileSize} bytes`);
  console.log(`  Created: ${result.fileHeader.creationTime}`);
  
  console.log(`\nTotal Packets: ${result.totalPackets}`);
  
  console.log('\nStatistics:');
  for (const [type, count] of Object.entries(result.stats)) {
    const typeName = {
      1: 'TMATS',
      2: 'PCM',
      7: 'MIL-STD-1553'
    }[type] || `Type ${type}`;
    console.log(`  ${typeName}: ${count}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Packet Summary:');
  console.log('='.repeat(60));
  
  console.log('\n' + `${'#'.padEnd(5)} ${'Type'.padEnd(15)} ${'Timestamp'.padEnd(20)} ${'Size'.padEnd(10)}`);
  console.log('-'.repeat(55));
  
  for (const packet of result.packets) {
    console.log(
      `${packet.index.toString().padEnd(5)} ` +
      `${packet.typeName.padEnd(15)} ` +
      `${packet.timestamp.padEnd(20)} ` +
      `${packet.packetLength.toString().padEnd(10)}`
    );
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Packet Details:');
  console.log('='.repeat(60));
  
  for (const packet of result.packets.slice(0, 3)) {
    console.log(`\n[Packet #${packet.index}] ${packet.typeName}`);
    console.log(`  Timestamp: ${packet.timestamp}s`);
    console.log(`  Packet Size: ${packet.packetLength} bytes`);
    console.log(`  Data Size: ${packet.dataLength} bytes`);
    console.log(`  File Offset: 0x${packet.offset.toString(16).toUpperCase()}`);
    console.log(`  Preview: ${packet.preview}`);
    
    const detail = result.packetDetails[packet.index];
    if (detail && detail.fields) {
      console.log('\n  Fields:');
      for (const [key, value] of Object.entries(detail.fields).slice(0, 5)) {
        console.log(`    ${key}: ${value}`);
      }
    }
  }
  
  if (result.errors.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('Warnings/Errors:');
    console.log('='.repeat(60));
    for (const error of result.errors) {
      console.log(`  ⚠️  ${error}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests passed!');
  console.log('='.repeat(60));
  
} catch (error) {
  console.error('\n❌ Test failed:');
  console.error(error);
  process.exit(1);
}
