function mdct(signal, n) {
  const output = new Float64Array(n / 2);
  const N = n;
  const halfN = N / 2;

  for (let k = 0; k < halfN; k++) {
    let sum = 0;
    for (let nIdx = 0; nIdx < N; nIdx++) {
      const angle = Math.PI * (2 * nIdx + 1 + halfN) * (2 * k + 1) / (2 * N);
      sum += signal[nIdx] * Math.cos(angle);
    }
    output[k] = sum;
  }
  return output;
}

function imdct(coeffs, n) {
  const output = new Float64Array(n);
  const N = n;
  const halfN = N / 2;

  for (let nIdx = 0; nIdx < N; nIdx++) {
    let sum = 0;
    for (let k = 0; k < halfN; k++) {
      const angle = Math.PI * (2 * nIdx + 1 + halfN) * (2 * k + 1) / (2 * N);
      sum += coeffs[k] * Math.cos(angle);
    }
    output[nIdx] = (2.0 / N) * sum;
  }
  return output;
}

function applyWindow(signal, windowType = 'sine') {
  const n = signal.length;
  const windowed = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    let w;
    if (windowType === 'sine') {
      w = Math.sin(Math.PI * (i + 0.5) / n);
    } else if (windowType === 'hann') {
      w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    } else {
      w = 1;
    }
    windowed[i] = signal[i] * w;
  }
  return windowed;
}

function quantize(coeffs, bits) {
  const maxVal = Math.max(...coeffs.map(Math.abs)) || 1;
  const scale = (1 << bits) - 1;
  const quantized = new Int32Array(coeffs.length);

  for (let i = 0; i < coeffs.length; i++) {
    const normalized = coeffs[i] / maxVal;
    quantized[i] = Math.round(normalized * scale);
  }

  return {
    quantized: Array.from(quantized),
    maxVal,
    scale
  };
}

function dequantize(quantized, maxVal, bits) {
  const scale = (1 << bits) - 1;
  const coeffs = new Float64Array(quantized.length);

  for (let i = 0; i < quantized.length; i++) {
    coeffs[i] = (quantized[i] / scale) * maxVal;
  }
  return coeffs;
}

function encodeFrame(frame, bitrate, sampleRate) {
  const frameSize = frame.length;
  const windowed = applyWindow(frame, 'sine');
  const mdctCoeffs = mdct(windowed, frameSize);

  const targetBitsPerFrame = bitrate * (frameSize / sampleRate);
  const bitsPerCoeff = Math.max(2, Math.floor(targetBitsPerFrame / mdctCoeffs.length));
  const effectiveBits = Math.min(14, Math.max(2, bitsPerCoeff));

  const { quantized, maxVal } = quantize(mdctCoeffs, effectiveBits);

  return {
    quantized,
    maxVal,
    bits: effectiveBits
  };
}

function decodeFrame(frameData) {
  const { quantized, maxVal, bits } = frameData;
  const coeffs = dequantize(quantized, maxVal, bits);
  const frameSize = coeffs.length * 2;
  const reconstructed = imdct(coeffs, frameSize);
  return reconstructed;
}

function lc3Encode(channelData, sampleRate, bitrate, numChannels) {
  const samplesPerChannel = channelData[0].length;
  const frameSizeMs = 7.5;
  const frameSize = Math.floor(sampleRate * frameSizeMs / 1000);
  const totalSamples = samplesPerChannel;
  const numFrames = Math.ceil(totalSamples / frameSize);
  const totalPaddedSamples = numFrames * frameSize;

  const frames = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const channelFrames = [];
    const channel = channelData[ch];

    for (let f = 0; f < numFrames; f++) {
      const start = f * frameSize;
      const end = Math.min(start + frameSize, totalSamples);
      const frame = new Float64Array(frameSize);

      for (let i = start; i < end; i++) {
        frame[i - start] = channel[i];
      }

      const encoded = encodeFrame(frame, bitrate, sampleRate);
      channelFrames.push(encoded);
    }
    frames.push(channelFrames);
  }

  const encodedData = {
    sampleRate,
    bitrate,
    numChannels,
    frameSize,
    numFrames,
    originalSamples: totalSamples,
    totalPaddedSamples,
    frameSizeMs,
    frames
  };

  return Buffer.from(JSON.stringify(encodedData));
}

function lc3Decode(encodedBuffer, sampleRate, bitrate, numChannels) {
  const encodedData = JSON.parse(encodedBuffer.toString());
  const { frameSize, numFrames, frames, originalSamples } = encodedData;

  const outputChannels = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const channelOutput = new Float64Array(numFrames * frameSize);
    const channelFrames = frames[ch];

    let overlap = new Float64Array(frameSize);

    for (let f = 0; f < numFrames; f++) {
      const frameData = channelFrames[f];
      const reconstructed = decodeFrame(frameData);

      for (let i = 0; i < frameSize; i++) {
        if (f > 0) {
          channelOutput[(f - 1) * frameSize + i] += overlap[i];
        }
        overlap[i] = reconstructed[i];
      }
    }

    for (let i = 0; i < frameSize; i++) {
      channelOutput[(numFrames - 1) * frameSize + i] += overlap[i];
    }

    const finalOutput = new Float64Array(originalSamples);
    for (let i = 0; i < originalSamples; i++) {
      finalOutput[i] = Math.max(-1, Math.min(1, channelOutput[i] * 2));
    }

    outputChannels.push(finalOutput);
  }

  return outputChannels;
}

module.exports = {
  lc3Encode,
  lc3Decode
};
