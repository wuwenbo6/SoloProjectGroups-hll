function fft(signal) {
  const n = signal.length;
  if (n <= 1) return signal;

  const even = new Float64Array(n / 2);
  const odd = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    even[i] = signal[i * 2];
    odd[i] = signal[i * 2 + 1];
  }

  const fftEven = fft(Array.from(even));
  const fftOdd = fft(Array.from(odd));

  const result = new Array(n);
  for (let k = 0; k < n / 2; k++) {
    const angle = -2 * Math.PI * k / n;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tReal = fftOdd[k].real * cos - fftOdd[k].imag * sin;
    const tImag = fftOdd[k].real * sin + fftOdd[k].imag * cos;
    result[k] = {
      real: fftEven[k].real + tReal,
      imag: fftEven[k].imag + tImag
    };
    result[k + n / 2] = {
      real: fftEven[k].real - tReal,
      imag: fftEven[k].imag - tImag
    };
  }
  return result;
}

function ifft(spectrum) {
  const n = spectrum.length;
  const conj = spectrum.map(s => ({ real: s.real, imag: -s.imag }));
  const result = fft(conj);
  return result.map(s => ({ real: s.real / n, imag: -s.imag / n }));
}

function computeMagnitude(signal) {
  const n = signal.length;
  const padded = new Array(n);
  for (let i = 0; i < n; i++) {
    padded[i] = { real: signal[i] || 0, imag: 0 };
  }
  const spectrum = fft(padded);
  const magnitude = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    magnitude[i] = Math.sqrt(spectrum[i].real * spectrum[i].real + spectrum[i].imag * spectrum[i].imag);
  }
  return magnitude;
}

function hzToBark(hz) {
  return 13 * Math.atan(0.00076 * hz) + 3.5 * Math.atan((hz / 7500) * (hz / 7500));
}

function barkToHz(bark) {
  return (Math.exp(bark / 13) - Math.exp(-bark / 13)) / (2 * Math.exp(bark / 30.5));
}

function computeBarkSpectrum(magnitude, sampleRate, nfft) {
  const numBands = 24;
  const barkBands = new Float64Array(numBands);

  for (let i = 0; i < numBands; i++) {
    const barkCenter = i + 0.5;
    const hzCenter = barkCenter * 100;
    const hzLow = Math.max(0, hzCenter - 100);
    const hzHigh = hzCenter + 100;

    const binLow = Math.floor(hzLow * nfft / sampleRate);
    const binHigh = Math.min(nfft / 2 - 1, Math.ceil(hzHigh * nfft / sampleRate));

    let sum = 0;
    let count = 0;
    for (let j = binLow; j <= binHigh; j++) {
      sum += magnitude[j];
      count++;
    }
    barkBands[i] = count > 0 ? sum / count : 0;
  }

  return barkBands;
}

function computeLoudness(barkSpectrum) {
  const loudness = new Float64Array(barkBands.length);
  for (let i = 0; i < barkBands.length; i++) {
    const db = 20 * Math.log10(barkSpectrum[i] + 1e-10);
    loudness[i] = Math.max(0, Math.pow(10, (db - 60) / 40));
  }
  return loudness;
}

function computeAsymmetryDistortion(loudnessRef, loudnessTest) {
  let totalAsym = 0;
  let totalSym = 0;

  for (let i = 0; i < loudnessRef.length; i++) {
    const ref = loudnessRef[i];
    const test = loudnessTest[i];

    const diff = test - ref;
    if (diff > 0) {
      totalAsym += diff * diff;
    } else {
      totalSym += diff * diff;
    }
  }

  return { asym: Math.sqrt(totalAsym), sym: Math.sqrt(totalSym) };
}

function timeAlign(reference, test, maxShift = 100) {
  const refLen = reference.length;
  const testLen = test.length;
  const minLen = Math.min(refLen, testLen);

  let bestCorr = -Infinity;
  let bestShift = 0;

  for (let shift = -maxShift; shift <= maxShift; shift++) {
    let corr = 0;
    let refPow = 0;
    let testPow = 0;

    const start = Math.max(0, shift);
    const end = Math.min(minLen, minLen + shift);

    for (let i = start; i < end; i++) {
      const refIdx = i;
      const testIdx = i - shift;

      if (refIdx < refLen && testIdx >= 0 && testIdx < testLen) {
        corr += reference[refIdx] * test[testIdx];
        refPow += reference[refIdx] * reference[refIdx];
        testPow += test[testIdx] * test[testIdx];
      }
    }

    if (refPow > 0 && testPow > 0) {
      const normalizedCorr = corr / (Math.sqrt(refPow) * Math.sqrt(testPow));
      if (normalizedCorr > bestCorr) {
        bestCorr = normalizedCorr;
        bestShift = shift;
      }
    }
  }

  const aligned = new Float64Array(refLen);
  for (let i = 0; i < refLen; i++) {
    const testIdx = i - bestShift;
    if (testIdx >= 0 && testIdx < testLen) {
      aligned[i] = test[testIdx];
    }
  }

  return { aligned, shift: bestShift, correlation: bestCorr };
}

function computePESQ(reference, degraded, sampleRate) {
  const minLen = Math.min(reference.length, degraded.length);
  const ref = reference.slice(0, minLen);
  const test = degraded.slice(0, minLen);

  const { aligned } = timeAlign(ref, test, Math.floor(sampleRate * 0.05));

  let totalRefPow = 0;
  for (let i = 0; i < ref.length; i++) {
    totalRefPow += ref[i] * ref[i];
  }
  const avgRefPow = totalRefPow / ref.length;

  let activeFrames = 0;
  let totalD = 0;
  let totalA = 0;

  const frameSize = 1024;
  const hopSize = 512;
  const numFrames = Math.floor((ref.length - frameSize) / hopSize);

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    const end = start + frameSize;

    let frameRefPow = 0;
    for (let i = start; i < end; i++) {
      frameRefPow += ref[i] * ref[i];
    }
    const avgFramePow = frameRefPow / frameSize;

    if (avgFramePow < avgRefPow * 0.01) {
      continue;
    }

    activeFrames++;

    const refFrame = ref.slice(start, end);
    const testFrame = aligned.slice(start, end);

    const refMag = computeMagnitude(refFrame);
    const testMag = computeMagnitude(testFrame);

    const refBark = computeBarkSpectrum(refMag, sampleRate, frameSize);
    const testBark = computeBarkSpectrum(testMag, sampleRate, frameSize);

    const refLoudness = computeLoudness(refBark);
    const testLoudness = computeLoudness(testBark);

    const { asym, sym } = computeAsymmetryDistortion(refLoudness, testLoudness);

    totalD += asym;
    totalA += sym;
  }

  if (activeFrames === 0) {
    return { score: 4.5, d: 0, a: 0, activeFrames: 0 };
  }

  const avgD = totalD / activeFrames;
  const avgA = totalA / activeFrames;

  const rawScore = 4.5 - 0.1 * avgD - 0.05 * avgA;

  const pesqScore = Math.max(1, Math.min(5, rawScore));

  return {
    score: pesqScore,
    d: avgD,
    a: avgA,
    activeFrames,
    totalFrames: numFrames
  };
}

function calculateSNR(original, degraded) {
  let signalPower = 0;
  let noisePower = 0;

  for (let i = 0; i < original.length; i++) {
    signalPower += original[i] * original[i];
    const noise = original[i] - degraded[i];
    noisePower += noise * noise;
  }

  if (noisePower === 0) return Infinity;

  return 10 * Math.log10(signalPower / noisePower);
}

function calculateSegmentalSNR(original, degraded, sampleRate, segmentSize = 20) {
  const segmentSamples = Math.floor(sampleRate * segmentSize / 1000);
  const numSegments = Math.floor(original.length / segmentSamples);
  let totalSegSNR = 0;
  let validSegments = 0;

  for (let s = 0; s < numSegments; s++) {
    const start = s * segmentSamples;
    const end = start + segmentSamples;

    let segSignalPower = 0;
    let segNoisePower = 0;

    for (let i = start; i < end; i++) {
      segSignalPower += original[i] * original[i];
      const noise = original[i] - degraded[i];
      segNoisePower += noise * noise;
    }

    if (segSignalPower > 0.00001) {
      if (segNoisePower > 0) {
        const segSNR = 10 * Math.log10(segSignalPower / segNoisePower);
        const clampedSegSNR = Math.max(-10, Math.min(35, segSNR));
        totalSegSNR += clampedSegSNR;
        validSegments++;
      }
    }
  }

  if (validSegments === 0) return 0;

  return totalSegSNR / validSegments;
}

function calculateLSD(original, degraded, sampleRate, fftSize = 512) {
  const hopSize = fftSize / 2;
  const numFrames = Math.floor((original.length - fftSize) / hopSize);
  let totalLSD = 0;
  let validFrames = 0;

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;

    const origSpec = new Float64Array(fftSize / 2);
    const degSpec = new Float64Array(fftSize / 2);

    for (let k = 0; k < fftSize / 2; k++) {
      let origReal = 0, origImag = 0;
      let degReal = 0, degImag = 0;

      for (let n = 0; n < fftSize; n++) {
        const window = 0.5 * (1 - Math.cos(2 * Math.PI * n / (fftSize - 1)));
        const angle = -2 * Math.PI * k * n / fftSize;
        origReal += original[start + n] * window * Math.cos(angle);
        origImag += original[start + n] * window * Math.sin(angle);
        degReal += degraded[start + n] * window * Math.cos(angle);
        degImag += degraded[start + n] * window * Math.sin(angle);
      }

      origSpec[k] = Math.sqrt(origReal * origReal + origImag * origImag) + 1e-10;
      degSpec[k] = Math.sqrt(degReal * degReal + degImag * degImag) + 1e-10;
    }

    let frameLSD = 0;
    for (let k = 0; k < fftSize / 2; k++) {
      const logRatio = 20 * Math.log10(origSpec[k] / degSpec[k]);
      frameLSD += logRatio * logRatio;
    }
    frameLSD = Math.sqrt(frameLSD / (fftSize / 2));

    if (isFinite(frameLSD)) {
      totalLSD += frameLSD;
      validFrames++;
    }
  }

  if (validFrames === 0) return Infinity;

  return totalLSD / validFrames;
}

function calculateMOS(original, degraded, sampleRate) {
  if (original.length !== degraded.length) {
    const minLen = Math.min(original.length, degraded.length);
    original = original.slice(0, minLen);
    degraded = degraded.slice(0, minLen);
  }

  const globalSNR = calculateSNR(original, degraded);
  const segSNR = calculateSegmentalSNR(original, degraded, sampleRate);
  const lsd = calculateLSD(original, degraded, sampleRate);

  const pesqResult = computePESQ(original, degraded, sampleRate);
  const pesqScore = pesqResult.score;

  let confidence = '高';
  if (pesqResult.activeFrames < 5 || segSNR < 10 || lsd > 6) {
    confidence = '低';
  } else if (pesqResult.activeFrames < 10 || segSNR < 20 || lsd > 4) {
    confidence = '中';
  }

  let quality = '完美';
  if (pesqScore >= 4.5) {
    quality = '完美（几乎无失真）';
  } else if (pesqScore >= 4.0) {
    quality = '优秀（轻微失真）';
  } else if (pesqScore >= 3.5) {
    quality = '良好（可感知但不影响）';
  } else if (pesqScore >= 3.0) {
    quality = '一般（略有影响）';
  } else if (pesqScore >= 2.0) {
    quality = '较差（明显影响）';
  } else {
    quality = '很差（几乎不可用）';
  }

  return {
    score: pesqScore.toFixed(2),
    quality: quality,
    confidence: confidence,
    pesq: {
      score: pesqScore.toFixed(4),
      d: pesqResult.d.toFixed(4),
      a: pesqResult.a.toFixed(4),
      activeFrames: pesqResult.activeFrames
    },
    metrics: {
      globalSNR: isFinite(globalSNR) ? globalSNR.toFixed(2) : 'Inf',
      segmentalSNR: segSNR.toFixed(2),
      lsd: isFinite(lsd) ? lsd.toFixed(2) : 'Inf'
    }
  };
}

module.exports = {
  calculateMOS,
  computePESQ
};
