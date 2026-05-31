import React, { useState, useRef, useEffect } from 'react';
import { useJoystick } from '../hooks/useJoystick';
import { useStore } from '../store/useStore';
import { useWebRTC } from '../hooks/useWebRTC';

interface JoystickProps {
  side: 'left' | 'right';
  label: string;
  size?: number;
}

export const Joystick: React.FC<JoystickProps> = ({ side, label, size = 160 }) => {
  const { forceFeedback, webRTC } = useStore();
  const { sendCommand } = useWebRTC();
  const [lastSent, setLastSent] = useState(0);
  const [displayResistance, setDisplayResistance] = useState(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const animate = () => {
      setDisplayResistance(prev => {
        const diff = forceFeedback.resistance - prev;
        const alpha = 0.15;
        return prev + diff * alpha;
      });
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [forceFeedback.resistance]);

  const handleMove = (x: number, y: number) => {
    const now = Date.now();
    if (now - lastSent < 16) return;
    setLastSent(now);

    if (webRTC.dataChannelReady) {
      const speed = Math.sqrt(x ** 2 + y ** 2);
      const adjustedSpeed = Math.max(0, speed - displayResistance * 0.4);
      const scale = speed > 0 ? adjustedSpeed / speed : 0;
      
      sendCommand({
        type: 'move',
        joystickId: side,
        x: Math.round(x * scale * 100) / 100,
        y: Math.round(y * scale * 100) / 100,
        speed: Math.round(adjustedSpeed * 100) / 100,
        priority: speed > 0.5 ? 'high' : 'normal',
      });
    }
  };

  const {
    containerRef,
    handleMouseDown,
    handleTouchStart,
    joystickX,
    joystickY,
    isDragging,
  } = useJoystick({
    size,
    onMove: handleMove,
    resistance: displayResistance,
  });

  const warningColor = forceFeedback.warning === 'danger'
    ? 'rgba(255, 71, 87, 0.5)'
    : forceFeedback.warning === 'caution'
    ? 'rgba(255, 193, 7, 0.3)'
    : 'transparent';

  const shakeOffset = displayResistance > 0.5
    ? {
        x: (Math.random() - 0.5) * displayResistance * 8,
        y: (Math.random() - 0.5) * displayResistance * 8,
      }
    : { x: 0, y: 0 };

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-mono text-cyan-400 tracking-wider uppercase">
        {label}
      </span>
      <div
        ref={containerRef}
        className="relative rounded-full cursor-pointer select-none touch-none transition-all duration-100"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle, #0a1628 0%, #050d18 100%)`,
          boxShadow: isDragging
            ? `0 0 30px rgba(0, 212, 255, 0.4), inset 0 0 20px ${warningColor}`
            : `0 0 15px rgba(0, 212, 255, 0.15), inset 0 0 10px rgba(0, 0, 0, 0.5)`,
          border: `2px solid ${forceFeedback.warning !== 'none' ? '#ff4757' : 'rgba(0, 212, 255, 0.3)'}`,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div
          className="absolute rounded-full border border-cyan-500/20"
          style={{
            width: size - 20,
            height: size - 20,
            left: 10,
            top: 10,
          }}
        />
        <div
          className="absolute rounded-full border border-cyan-500/10"
          style={{
            width: size / 2,
            height: size / 2,
            left: size / 4,
            top: size / 4,
          }}
        />
        <div
          className="absolute rounded-full transition-transform duration-75"
          style={{
            width: 50,
            height: 50,
            left: size / 2 - 25 + joystickX + shakeOffset.x,
            top: size / 2 - 25 + joystickY + shakeOffset.y,
            background: isDragging
              ? 'linear-gradient(145deg, #00d4ff, #0099cc)'
              : 'linear-gradient(145deg, #1a3a5c, #0a1628)',
            boxShadow: isDragging
              ? '0 0 20px rgba(0, 212, 255, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2)'
              : '0 4px 15px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            border: forceFeedback.warning !== 'none'
              ? `2px solid ${forceFeedback.warning === 'danger' ? '#ff4757' : '#ffc107'}`
              : '1px solid rgba(0, 212, 255, 0.3)',
          }}
        >
          <div
            className="absolute rounded-full bg-cyan-400/30"
            style={{
              width: 16,
              height: 16,
              left: 17,
              top: 17,
            }}
          />
        </div>
        {displayResistance > 0 && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, transparent 60%, ${warningColor} 100%)`,
              animation: 'pulse 1s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  );
};
