import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Macro, MacroStep } from '../types';
import { useWebRTC } from './useWebRTC';

export const useMacroPlayback = () => {
  const { 
    macros, 
    macroPlayback, 
    startMacroPlayback, 
    stopMacroPlayback,
    pauseMacroPlayback,
    resumeMacroPlayback,
  } = useStore();
  
  const { sendCommand } = useWebRTC();
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStepRef = useRef(0);
  const isPausedRef = useRef(false);

  const executeStep = useCallback((step: MacroStep) => {
    sendCommand({
      type: step.command.type as 'move' | 'stop',
      joystickId: step.command.joystickId,
      x: step.command.x,
      y: step.command.y,
      speed: step.command.speed,
      priority: step.command.priority,
    });
  }, [sendCommand]);

  const playMacro = useCallback((macroId: string) => {
    const macro = macros.find(m => m.id === macroId);
    if (!macro) return;

    startMacroPlayback(macroId);
    currentStepRef.current = 0;
    isPausedRef.current = false;
    executeSteps(macro);
  }, [macros, startMacroPlayback]);

  const executeSteps = useCallback((macro: Macro) => {
    const executeNextStep = () => {
      if (currentStepRef.current >= macro.steps.length) {
        stopMacroPlayback();
        return;
      }

      if (isPausedRef.current) {
        return;
      }

      const step = macro.steps[currentStepRef.current];
      
      setTimeout(() => {
        if (isPausedRef.current) return;
        executeStep(step);
        
        useStore.setState({
          macroPlayback: {
            ...useStore.getState().macroPlayback,
            currentStep: currentStepRef.current,
          }
        });

        if (step.duration > 0) {
          intervalRef.current = setInterval(() => {
            if (!isPausedRef.current) {
              executeStep(step);
            }
          }, 50);
        }

        playbackTimeoutRef.current = setTimeout(() => {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          currentStepRef.current++;
          executeNextStep();
        }, step.duration);
      }, step.delay);
    };

    executeNextStep();
  }, [executeStep, stopMacroPlayback]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    pauseMacroPlayback();
  }, [pauseMacroPlayback]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    resumeMacroPlayback();
    const macro = macros.find(m => m.id === macroPlayback.macroId);
    if (macro) {
      executeSteps(macro);
    }
  }, [resumeMacroPlayback, macros, macroPlayback.macroId, executeSteps]);

  const stop = useCallback(() => {
    isPausedRef.current = false;
    currentStepRef.current = 0;
    
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    stopMacroPlayback();
  }, [stopMacroPlayback]);

  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    playMacro,
    pause,
    resume,
    stop,
    isPlaying: macroPlayback.isPlaying,
    isPaused: macroPlayback.isPaused,
    currentStep: macroPlayback.currentStep,
    totalSteps: macros.find(m => m.id === macroPlayback.macroId)?.steps.length || 0,
    macros,
  };
};
