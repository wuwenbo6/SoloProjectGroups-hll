import { Layer, BlendMode } from '../types';

function blendNormal(base: number, blend: number, opacity: number): number {
  return base * (1 - opacity) + blend * opacity;
}

function blendMultiply(base: number, blend: number, opacity: number): number {
  const result = (base * blend) / 255;
  return blendNormal(base, result, opacity);
}

function blendScreen(base: number, blend: number, opacity: number): number {
  const result = 255 - ((255 - base) * (255 - blend)) / 255;
  return blendNormal(base, result, opacity);
}

function blendOverlay(base: number, blend: number, opacity: number): number {
  let result: number;
  if (base < 128) {
    result = (2 * base * blend) / 255;
  } else {
    result = 255 - (2 * (255 - base) * (255 - blend)) / 255;
  }
  return blendNormal(base, result, opacity);
}

function getBlendFunction(mode: BlendMode): (base: number, blend: number, opacity: number) => number {
  switch (mode) {
    case 'multiply':
      return blendMultiply;
    case 'screen':
      return blendScreen;
    case 'overlay':
      return blendOverlay;
    default:
      return blendNormal;
  }
}

export function compositeLayers(layers: Layer[], width: number, height: number): ImageData {
  const result = new ImageData(width, height);
  const data = result.data;

  for (let i = 0; i < width * height * 4; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }

  const visibleLayers = layers.filter(layer => layer.visible && layer.imageData);

  for (const layer of visibleLayers) {
    const layerData = layer.imageData!.data;
    const blendFn = getBlendFunction(layer.blendMode);
    const opacity = layer.opacity;

    for (let i = 0; i < width * height * 4; i += 4) {
      const layerAlpha = layerData[i + 3] / 255;
      const effectiveOpacity = opacity * layerAlpha;

      if (effectiveOpacity > 0) {
        data[i] = blendFn(data[i], layerData[i], effectiveOpacity);
        data[i + 1] = blendFn(data[i + 1], layerData[i + 1], effectiveOpacity);
        data[i + 2] = blendFn(data[i + 2], layerData[i + 2], effectiveOpacity);
      }
    }
  }

  return result;
}
