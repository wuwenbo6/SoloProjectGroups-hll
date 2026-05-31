import { useState, useRef, useCallback, useEffect } from 'react';

interface JoystickPosition {
  x: number;
  y: number;
}

interface UseJoystickOptions {
  size?: number;
  onMove?: (x: number, y: number) => void;
  onRelease?: () => void;
  resistance?: number;
}

export const useJoystick = ({ size = 150, onMove, onRelease, resistance = 0 }: UseJoystickOptions = {}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<JoystickPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - 25;

  const calculatePosition = useCallback((clientX: number, clientY: number): JoystickPosition => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left - centerX;
    const relativeY = clientY - rect.top - centerY;

    const distance = Math.sqrt(relativeX ** 2 + relativeY ** 2);
    const angle = Math.atan2(relativeY, relativeX);

    let effectiveRadius = Math.min(distance, maxRadius);
    
    if (resistance > 0 && isDraggingRef.current) {
      effectiveRadius = effectiveRadius * (1 - resistance * 0.5);
    }

    return {
      x: (Math.cos(angle) * effectiveRadius) / maxRadius,
      y: (Math.sin(angle) * effectiveRadius) / maxRadius,
    };
  }, [centerX, centerY, maxRadius, resistance]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    const pos = calculatePosition(clientX, clientY);
    setPosition(pos);
    onMove?.(pos.x, pos.y);
  }, [calculatePosition, onMove]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const pos = calculatePosition(clientX, clientY);
    setPosition(pos);
    onMove?.(pos.x, pos.y);
  }, [calculatePosition, onMove]);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
    isDraggingRef.current = false;
    setPosition({ x: 0, y: 0 });
    onMove?.(0, 0);
    onRelease?.();
  }, [onMove, onRelease]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleMouseUp = () => handleEnd();
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches[0]) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [handleStart]);

  const joystickX = position.x * maxRadius;
  const joystickY = position.y * maxRadius;

  return {
    containerRef,
    handleMouseDown,
    handleTouchStart,
    joystickX,
    joystickY,
    isDragging,
    position,
    size,
    maxRadius,
  };
};
