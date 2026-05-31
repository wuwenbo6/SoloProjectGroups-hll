import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { ControlCommand, SensorData } from '../types';

class SequenceGenerator {
  private sequence: number = 0;
  next(): number {
    this.sequence = (this.sequence + 1) % Number.MAX_SAFE_INTEGER;
    return this.sequence;
  }
  reset(): void {
    this.sequence = 0;
  }
}

class PredictiveFilter {
  private history: { value: number; timestamp: number }[] = [];
  private maxHistory: number = 8;
  private smoothedValue: number = 0;
  private lastTimestamp: number = 0;

  addMeasurement(value: number, timestamp: number): number {
    this.history.push({ value, timestamp });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const dt = timestamp - this.lastTimestamp;
    if (dt > 0 && dt < 500) {
      const alpha = Math.min(0.4, dt / 80);
      this.smoothedValue = this.smoothedValue + alpha * (value - this.smoothedValue);
    } else {
      this.smoothedValue = value;
    }
    this.lastTimestamp = timestamp;
    return this.smoothedValue;
  }

  predict(msAhead: number): number {
    if (this.history.length < 3) return this.smoothedValue;

    const recent = this.history.slice(-4);
    let velocity = 0;
    let count = 0;

    for (let i = 1; i < recent.length; i++) {
      const dt = recent[i].timestamp - recent[i - 1].timestamp;
      if (dt > 0) {
        velocity += (recent[i].value - recent[i - 1].value) / dt;
        count++;
      }
    }

    if (count === 0) return this.smoothedValue;
    return this.smoothedValue + (velocity / count) * msAhead;
  }

  getValue(): number {
    return this.smoothedValue;
  }

  reset(): void {
    this.history = [];
    this.smoothedValue = 0;
    this.lastTimestamp = 0;
  }
}

const PREDICTION_MS = 100;
const VIRTUAL_WALL_DISTANCE = 50;
const MAX_COMMAND_AGE = 80;

export const useWebRTC = () => {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sequenceGenerator = useRef(new SequenceGenerator());
  const distanceFilter = useRef(new PredictiveFilter());
  const lastProcessedSequence = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastForceUpdate = useRef(0);

  const {
    setWebRTCState,
    setDataChannel,
    setRobotStatus,
    setForceFeedback,
  } = useStore();

  const calculateForceFeedback = useCallback((predictedDistance: number) => {
    if (predictedDistance >= VIRTUAL_WALL_DISTANCE) {
      return { resistance: 0, warning: 'none' as const };
    }

    const normalizedDistance = Math.max(0, predictedDistance);
    const resistance = Math.min(1, Math.pow((VIRTUAL_WALL_DISTANCE - normalizedDistance) / VIRTUAL_WALL_DISTANCE, 1.5));
    
    let warning: 'none' | 'caution' | 'danger' = 'none';
    if (resistance > 0.7) {
      warning = 'danger';
    } else if (resistance > 0.3) {
      warning = 'caution';
    }

    return { resistance, warning };
  }, []);

  const updateForceFeedbackLoop = useCallback(() => {
    const now = Date.now();
    const predictedDistance = distanceFilter.current.predict(PREDICTION_MS);
    const { resistance, warning } = calculateForceFeedback(predictedDistance);
    
    const smoothResistance = distanceFilter.current.getValue();
    const displayDistance = Math.max(0, smoothResistance);
    
    setRobotStatus({ distance: Math.round(displayDistance * 10) / 10 });
    setForceFeedback({
      resistance,
      direction: { x: 0, y: -1 },
      warning,
    });

    lastForceUpdate.current = now;
    animationFrameRef.current = requestAnimationFrame(updateForceFeedbackLoop);
  }, [calculateForceFeedback, setRobotStatus, setForceFeedback]);

  const handleSensorData = useCallback((sensorData: SensorData) => {
    if (!sensorData.sequence) {
      sensorData.sequence = Date.now();
    }

    if (sensorData.type === 'distance' && sensorData.distance !== undefined) {
      const now = Date.now();
      const age = now - sensorData.timestamp;
      
      if (age > MAX_COMMAND_AGE * 3) {
        return;
      }

      distanceFilter.current.addMeasurement(sensorData.distance, sensorData.timestamp);
    }
    
    if (sensorData.type === 'status') {
      if (sensorData.battery !== undefined) {
        setRobotStatus({ battery: sensorData.battery });
      }
    }
  }, [setRobotStatus]);

  const createPeerConnection = useCallback(() => {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setWebRTCState({ connectionStatus: 'connected', isConnected: true });
        animationFrameRef.current = requestAnimationFrame(updateForceFeedbackLoop);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setWebRTCState({ connectionStatus: 'disconnected', isConnected: false, dataChannelReady: false });
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } else if (state === 'connecting') {
        setWebRTCState({ connectionStatus: 'connecting' });
      }
    };

    pc.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    const dc = pc.createDataChannel('control', {
      ordered: false,
      maxRetransmits: 1,
    });

    dc.onopen = () => {
      console.log('Data channel opened');
      setWebRTCState({ dataChannelReady: true });
      setDataChannel(dc);
      dataChannelRef.current = dc;
      sequenceGenerator.current.reset();
    };

    dc.onclose = () => {
      console.log('Data channel closed');
      setWebRTCState({ dataChannelReady: false });
      setDataChannel(null);
      dataChannelRef.current = null;
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sensor') {
          handleSensorData(data.data);
        }
      } catch (err) {
        console.error('Failed to parse data channel message:', err);
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [setWebRTCState, setDataChannel, handleSensorData, updateForceFeedbackLoop]);

  const connect = useCallback(async () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    distanceFilter.current.reset();
    lastProcessedSequence.current = 0;

    const ws = new WebSocket(`ws://${window.location.hostname}:3001/ws`);
    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('WebSocket connected');
      const pc = createPeerConnection();
      
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
          type: 'offer',
          sdp: offer,
        }));
      } catch (err) {
        console.error('Failed to create offer:', err);
        setWebRTCState({ connectionStatus: 'error' });
      }
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'answer' && peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(message.sdp)
        );
      } else if (message.type === 'candidate' && peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(message.candidate)
        );
      } else if (message.type === 'offer' && peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(message.sdp)
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        
        ws.send(JSON.stringify({
          type: 'answer',
          sdp: answer,
        }));
      } else if (message.type === 'sensor') {
        handleSensorData(message.data);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setWebRTCState({ connectionStatus: 'disconnected', isConnected: false });
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setWebRTCState({ connectionStatus: 'error' });
    };
  }, [createPeerConnection, handleSensorData, setWebRTCState]);

  const disconnect = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWebRTCState({ connectionStatus: 'disconnected', isConnected: false, dataChannelReady: false });
    setDataChannel(null);
    distanceFilter.current.reset();
  }, [setWebRTCState, setDataChannel]);

  const sendCommand = useCallback((command: Omit<ControlCommand, 'sequence' | 'timestamp' | 'priority'> & { priority?: 'low' | 'normal' | 'high' }) => {
    const fullCommand: ControlCommand = {
      ...command,
      sequence: sequenceGenerator.current.next(),
      timestamp: Date.now(),
      priority: command.priority || 'normal',
    };

    const message = JSON.stringify({ type: 'command', command: fullCommand });

    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(message);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    }
  }, []);

  const setVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendCommand,
    setVideoElement,
  };
};
