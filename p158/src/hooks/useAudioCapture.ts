import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

interface UseAudioCaptureOptions {
  bufferSize?: number;
  onAudioData?: (samples: Float32Array, sampleRate: number) => void;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}) {
  const { bufferSize = 2048, onAudioData } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const {
    audio,
    setRecording,
    setSampleRate,
    setVolume,
    setDevices,
    setError,
  } = useAppStore();

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter((d) => d.kind === 'audioinput');
      setDevices(audioDevices);
      return audioDevices;
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      return [];
    }
  }, [setDevices]);

  const startCapture = useCallback(
    async (deviceId?: string) => {
      try {
        setError(null);

        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;

        const audioContext = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = bufferSize * 2;
        analyserRef.current = analyser;

        const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        scriptProcessorRef.current = scriptProcessor;

        source.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        scriptProcessor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);

          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          const volume = Math.min(1, rms * 10);
          setVolume(volume);

          onAudioData?.(inputData, audioContext.sampleRate);
        };

        setSampleRate(audioContext.sampleRate);
        setRecording(true);

        await enumerateDevices();

        return true;
      } catch (err) {
        console.error('Failed to start audio capture:', err);
        setError(err instanceof Error ? err.message : '无法访问麦克风');
        return false;
      }
    },
    [bufferSize, onAudioData, setError, setSampleRate, setRecording, setVolume, enumerateDevices]
  );

  const stopCapture = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setRecording(false);
    setVolume(0);
  }, [setRecording, setVolume]);

  const toggleCapture = useCallback(
    async (deviceId?: string) => {
      if (audio.isRecording) {
        stopCapture();
      } else {
        await startCapture(deviceId);
      }
    },
    [audio.isRecording, startCapture, stopCapture]
  );

  useEffect(() => {
    enumerateDevices();

    return () => {
      stopCapture();
    };
  }, [enumerateDevices, stopCapture]);

  return {
    startCapture,
    stopCapture,
    toggleCapture,
    enumerateDevices,
    isRecording: audio.isRecording,
  };
}
