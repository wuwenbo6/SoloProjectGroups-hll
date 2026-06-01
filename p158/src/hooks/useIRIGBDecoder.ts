import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  normalizeSamples,
  detectEdgesDC,
  extractSymbols,
  findFrameSync,
  decodeFrame,
  SYMBOLS_PER_FRAME,
  generateTestSignal,
  detectFormat,
  calculateOptimalBufferSize,
} from '../utils/irigbDecoder';
import { getCurrentSystemTime } from '../utils/timeUtils';
import { FormatInfo } from '../types';

interface UseIRIGBDecoderOptions {
  threshold?: number;
  useTestSignal?: boolean;
}

export function useIRIGBDecoder(options: UseIRIGBDecoderOptions = {}) {
  const { threshold = 0.3, useTestSignal = false } = options;

  const sampleBufferRef = useRef<Float32Array>(new Float32Array(0));
  const sampleRateRef = useRef<number>(48000);
  const lastDecodeTimeRef = useRef<number>(0);
  const frameStartIndexRef = useRef<number>(-1);
  const formatDetectTimeRef = useRef<number>(0);
  const currentFormatRef = useRef<FormatInfo | null>(null);

  const {
    setDecodedTime,
    setSymbols,
    setWaveformData,
    addAccuracySample,
    setFrameLocked,
    setFormatInfo,
    setBufferSize,
    audio,
  } = useAppStore();

  const processAudioData = useCallback(
    (samples: Float32Array, sampleRate: number) => {
      sampleRateRef.current = sampleRate;

      const targetBufferSize = sampleRate * 2;
      let newBuffer = new Float32Array(sampleBufferRef.current.length + samples.length);
      newBuffer.set(sampleBufferRef.current);
      newBuffer.set(samples, sampleBufferRef.current.length);

      if (newBuffer.length > targetBufferSize) {
        newBuffer = newBuffer.slice(-targetBufferSize);
      }
      sampleBufferRef.current = newBuffer;

      const waveformPoints: number[] = [];
      const step = Math.max(1, Math.floor(samples.length / 500));
      for (let i = 0; i < samples.length; i += step) {
        waveformPoints.push(samples[i]);
      }
      setWaveformData(waveformPoints);

      const now = Date.now();
      if (now - lastDecodeTimeRef.current < 100) {
        return;
      }
      lastDecodeTimeRef.current = now;

      const normalizedSamples = normalizeSamples(sampleBufferRef.current);

      const { risingEdges, fallingEdges } = detectEdgesDC(normalizedSamples, sampleRate, threshold);
      const symbols = extractSymbols(risingEdges, fallingEdges, sampleRate);

      setSymbols(symbols);

      if (symbols.length >= 10 && now - formatDetectTimeRef.current > 500) {
        formatDetectTimeRef.current = now;
        const formatResult = detectFormat(symbols, sampleRate);

        const optimalBufferSize = calculateOptimalBufferSize(
          sampleRate,
          formatResult.symbolDuration,
          200
        );

        const newFormatInfo: FormatInfo = {
          format: formatResult.format,
          symbolDuration: formatResult.symbolDuration,
          confidence: formatResult.confidence,
          description: formatResult.description,
          bufferSize: optimalBufferSize,
        };

        if (
          !currentFormatRef.current ||
          currentFormatRef.current.format !== newFormatInfo.format
        ) {
          currentFormatRef.current = newFormatInfo;
          setFormatInfo(newFormatInfo);

          if (optimalBufferSize !== audio.bufferSize) {
            setBufferSize(optimalBufferSize);
          }
        }
      }

      if (symbols.length >= SYMBOLS_PER_FRAME) {
        const symbolDuration = currentFormatRef.current?.symbolDuration || 10;

        let frameStart = frameStartIndexRef.current;

        if (frameStart < 0 || symbols[frameStart]?.type !== 'P') {
          frameStart = findFrameSync(symbols, symbolDuration);
          frameStartIndexRef.current = frameStart;
        }

        if (frameStart >= 0) {
          const decoded = decodeFrame(symbols, frameStart);
          if (decoded) {
            setDecodedTime(decoded);
            setFrameLocked(true);

            const systemTime = getCurrentSystemTime();
            const decodedDateTime = new Date(
              decoded.fullYear,
              0,
              decoded.dayOfYear,
              decoded.hour,
              decoded.minute,
              decoded.second
            );
            const deviation = systemTime.timestamp - decodedDateTime.getTime();
            addAccuracySample(deviation);
          } else {
            frameStartIndexRef.current = -1;
          }
        }
      }
    },
    [threshold, setDecodedTime, setSymbols, setWaveformData, addAccuracySample, setFrameLocked, setFormatInfo, setBufferSize, audio.bufferSize]
  );

  const startTestSignal = useCallback(() => {
    if (!useTestSignal) return;

    const sampleRate = 48000;
    const testSamples = generateTestSignal(sampleRate, 1);

    const intervalId = setInterval(() => {
      const offset = Math.floor(Math.random() * 1000);
      const samples = testSamples.slice(offset, offset + 2048);
      processAudioData(samples, sampleRate);
    }, 50);

    return () => clearInterval(intervalId);
  }, [useTestSignal, processAudioData]);

  const reset = useCallback(() => {
    sampleBufferRef.current = new Float32Array(0);
    frameStartIndexRef.current = -1;
    currentFormatRef.current = null;
    setDecodedTime(null);
    setSymbols([]);
    setFrameLocked(false);
    setFormatInfo(null);
  }, [setDecodedTime, setSymbols, setFrameLocked, setFormatInfo]);

  useEffect(() => {
    if (useTestSignal) {
      const cleanup = startTestSignal();
      return cleanup;
    }
  }, [useTestSignal, startTestSignal]);

  return {
    processAudioData,
    reset,
  };
}
