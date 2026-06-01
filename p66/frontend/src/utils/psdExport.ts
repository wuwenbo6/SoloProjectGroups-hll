import { Layer } from '../types';

function writeShort(value: number): Uint8Array {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setInt16(0, value, false);
  return new Uint8Array(buf);
}

function writeInt(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, value, false);
  return new Uint8Array(buf);
}

function writePascalString(str: string, alignTo: number = 1): Uint8Array {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const length = Math.min(bytes.length, 255);
  const paddedLength = Math.ceil((length + 1) / alignTo) * alignTo;
  const result = new Uint8Array(paddedLength);
  result[0] = length;
  result.set(bytes.subarray(0, length), 1);
  return result;
}

function imageDataToRgb(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  
  return rgb;
}

function createPsdHeader(width: number, height: number, channelCount: number = 3): Uint8Array {
  const signature = new Uint8Array([0x38, 0x42, 0x50, 0x53]);
  const version = writeShort(1);
  const reserved = new Uint8Array(6);
  const channels = writeShort(channelCount);
  const heightBytes = writeInt(height);
  const widthBytes = writeInt(width);
  const depth = writeShort(8);
  const mode = writeShort(3);

  const totalLength = signature.length + version.length + reserved.length + 
                      channels.length + heightBytes.length + widthBytes.length + 
                      depth.length + mode.length;
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  result.set(signature, offset); offset += signature.length;
  result.set(version, offset); offset += version.length;
  result.set(reserved, offset); offset += reserved.length;
  result.set(channels, offset); offset += channels.length;
  result.set(heightBytes, offset); offset += heightBytes.length;
  result.set(widthBytes, offset); offset += widthBytes.length;
  result.set(depth, offset); offset += depth.length;
  result.set(mode, offset);
  
  return result;
}

function createColorModeData(): Uint8Array {
  return writeInt(0);
}

function createImageResources(): Uint8Array {
  const resolutionInfo = new Uint8Array(16);
  const view = new DataView(resolutionInfo.buffer);
  view.setInt32(0, 72 * 65536, false);
  view.setInt16(4, 1, false);
  view.setInt16(6, 1, false);
  view.setInt32(8, 72 * 65536, false);
  view.setInt16(12, 1, false);
  view.setInt16(14, 1, false);

  const resourceId = writeShort(1005);
  const resourceName = writePascalString('ResolutionInfo', 2);
  const resourceDataSize = writeInt(resolutionInfo.length);
  
  const resource = new Uint8Array(resourceId.length + resourceName.length + resourceDataSize.length + resolutionInfo.length);
  let offset = 0;
  resource.set(resourceId, offset); offset += resourceId.length;
  resource.set(resourceName, offset); offset += resourceName.length;
  resource.set(resourceDataSize, offset); offset += resourceDataSize.length;
  resource.set(resolutionInfo, offset);

  const totalSize = writeInt(resource.length);
  const result = new Uint8Array(totalSize.length + resource.length);
  result.set(totalSize);
  result.set(resource, totalSize.length);
  
  return result;
}

function createLayerAndMaskInfo(layers: Layer[], width: number, height: number): Uint8Array {
  const layerRecords: Uint8Array[] = [];
  const channelData: Uint8Array[] = [];

  let layerIndex = 0;
  for (const layer of [...layers].reverse()) {
    if (!layer.imageData || layerIndex >= 56) continue;
    
    const top = 0;
    const left = 0;
    const bottom = height;
    const right = width;
    const channelCount = 3;

    const topBytes = writeInt(top);
    const leftBytes = writeInt(left);
    const bottomBytes = writeInt(bottom);
    const rightBytes = writeInt(right);
    const channelCountBytes = writeShort(channelCount);

    const channelInfo = new Uint8Array(channelCount * 6);
    for (let c = 0; c < channelCount; c++) {
      const view = new DataView(channelInfo.buffer, c * 6, 6);
      view.setInt16(0, c, false);
      view.setInt16(2, 0, false);
    }

    const blendMode = new Uint8Array([0x38, 0x42, 0x49, 0x4D]);
    const blendKey = layer.blendMode === 'multiply' ? new Uint8Array([0x6D, 0x75, 0x6C, 0x74]) :
                     layer.blendMode === 'screen' ? new Uint8Array([0x73, 0x63, 0x72, 0x6E]) :
                     layer.blendMode === 'overlay' ? new Uint8Array([0x6F, 0x76, 0x72, 0x6C]) :
                     new Uint8Array([0x6E, 0x6F, 0x72, 0x6D]);
    
    const opacity = new Uint8Array([Math.round(layer.opacity * 255)]);
    const clipping = new Uint8Array([0]);
    const flags = new Uint8Array([layer.visible ? 0 : 2]);
    const filler = new Uint8Array([0]);

    const layerName = writePascalString(layer.name || `Layer ${layerIndex + 1}`, 4);

    const extraDataLength = writeInt(0);

    const layerRecord = new Uint8Array(
      topBytes.length + leftBytes.length + bottomBytes.length + rightBytes.length +
      channelCountBytes.length + channelInfo.length + blendMode.length + blendKey.length +
      opacity.length + clipping.length + flags.length + filler.length + layerName.length +
      extraDataLength.length
    );

    let offset = 0;
    layerRecord.set(topBytes, offset); offset += topBytes.length;
    layerRecord.set(leftBytes, offset); offset += leftBytes.length;
    layerRecord.set(bottomBytes, offset); offset += bottomBytes.length;
    layerRecord.set(rightBytes, offset); offset += rightBytes.length;
    layerRecord.set(channelCountBytes, offset); offset += channelCountBytes.length;
    layerRecord.set(channelInfo, offset); offset += channelInfo.length;
    layerRecord.set(blendMode, offset); offset += blendMode.length;
    layerRecord.set(blendKey, offset); offset += blendKey.length;
    layerRecord.set(opacity, offset); offset += opacity.length;
    layerRecord.set(clipping, offset); offset += clipping.length;
    layerRecord.set(flags, offset); offset += flags.length;
    layerRecord.set(filler, offset); offset += filler.length;
    layerRecord.set(layerName, offset); offset += layerName.length;
    layerRecord.set(extraDataLength, offset);

    layerRecords.push(layerRecord);

    const rgbData = imageDataToRgb(layer.imageData);
    const planeSize = width * height;
    
    for (let c = 0; c < 3; c++) {
      const channel = new Uint8Array(planeSize);
      for (let i = 0; i < planeSize; i++) {
        channel[i] = rgbData[i * 3 + c];
      }
      
      const compression = writeShort(0);
      const channelPlane = new Uint8Array(compression.length + channel.length);
      channelPlane.set(compression);
      channelPlane.set(channel, compression.length);
      channelData.push(channelPlane);
    }

    layerIndex++;
  }

  const layerCountShort = writeShort(Math.min(layerIndex, 56));
  const layerRecordsCombined = mergeUint8Arrays(layerRecords);
  const channelDataCombined = mergeUint8Arrays(channelData);
  
  const layerInfoSize = layerCountShort.length + layerRecordsCombined.length + channelDataCombined.length;
  const globalLayerMaskInfo = writeInt(0);
  
  const totalSize = writeInt(layerInfoSize + globalLayerMaskInfo.length);
  
  const result = new Uint8Array(
    totalSize.length + layerInfoSize + globalLayerMaskInfo.length
  );
  
  let offset = 0;
  result.set(totalSize, offset); offset += totalSize.length;
  result.set(layerCountShort, offset); offset += layerCountShort.length;
  result.set(layerRecordsCombined, offset); offset += layerRecordsCombined.length;
  result.set(channelDataCombined, offset); offset += channelDataCombined.length;
  result.set(globalLayerMaskInfo, offset);

  return result;
}

function mergeUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function createImageData(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const planeSize = width * height;
  
  const compression = writeShort(0);
  const totalSize = writeInt(
    compression.length * 3 + planeSize * 3
  );
  
  const result = new Uint8Array(
    totalSize.length + compression.length * 3 + planeSize * 3
  );
  
  let offset = totalSize.length;
  result.set(totalSize);
  
  for (let c = 0; c < 3; c++) {
    result.set(compression, offset);
    offset += compression.length;
    
    for (let i = 0; i < planeSize; i++) {
      result[offset++] = data[i * 4 + c];
    }
  }
  
  return result;
}

export function exportToPSD(layers: Layer[], width: number, height: number): Blob {
  const visibleLayers = layers.filter(l => l.visible && l.imageData);
  
  if (visibleLayers.length === 0) {
    throw new Error('No visible layers to export');
  }

  const composited = visibleLayers[visibleLayers.length - 1].imageData!;

  const header = createPsdHeader(width, height, 3);
  const colorMode = createColorModeData();
  const imageResources = createImageResources();
  const layerAndMaskInfo = createLayerAndMaskInfo(visibleLayers, width, height);
  const imageDataSection = createImageData(composited);

  const totalSize = header.length + colorMode.length + imageResources.length + 
                    layerAndMaskInfo.length + imageDataSection.length;
  
  const psdFile = new Uint8Array(totalSize);
  let offset = 0;
  
  psdFile.set(header, offset); offset += header.length;
  psdFile.set(colorMode, offset); offset += colorMode.length;
  psdFile.set(imageResources, offset); offset += imageResources.length;
  psdFile.set(layerAndMaskInfo, offset); offset += layerAndMaskInfo.length;
  psdFile.set(imageDataSection, offset);

  return new Blob([psdFile], { type: 'image/vnd.adobe.photoshop' });
}

export function downloadPSD(layers: Layer[], width: number, height: number, filename: string = 'image.psd') {
  const blob = exportToPSD(layers, width, height);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
