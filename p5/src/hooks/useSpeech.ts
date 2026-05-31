import { useCallback, useEffect, useRef, useState } from 'react';

export const useSpeech = () => {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const lastWinRateRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const pendingSpeechRef = useRef<string | null>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
      }
    };
  }, []);

  const speakImmediately = useCallback((text: string) => {
    if (!synthRef.current) return;
    
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    
    synthRef.current.cancel();
    isSpeakingRef.current = true;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    utterance.onend = () => {
      isSpeakingRef.current = false;
    };
    
    utterance.onerror = () => {
      isSpeakingRef.current = false;
    };
    
    synthRef.current.speak(utterance);
  }, []);

  const speakDebounced = useCallback((text: string, delay: number = 300) => {
    if (!synthRef.current) return;
    
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
    }
    
    pendingSpeechRef.current = text;
    
    speechTimeoutRef.current = setTimeout(() => {
      if (pendingSpeechRef.current) {
        speakImmediately(pendingSpeechRef.current);
        pendingSpeechRef.current = null;
      }
    }, delay);
  }, [speakImmediately]);

  const speakWinRate = useCallback(
    (winRate: number, color: 'black' | 'white') => {
      if (lastWinRateRef.current !== null) {
        const diff = Math.abs(winRate - lastWinRateRef.current);
        if (diff < 8) {
          return;
        }
      }
      
      lastWinRateRef.current = winRate;
      const rate = Math.round(winRate);
      let comment = '';

      if (rate > 75) {
        comment = '形势大好';
      } else if (rate > 60) {
        comment = '略微领先';
      } else if (rate > 40) {
        comment = '局势胶着';
      } else if (rate > 25) {
        comment = '需要注意';
      } else {
        comment = '形势不利';
      }

      speakDebounced(comment, 200);
    },
    [speakDebounced]
  );

  const speakRecommendedMove = useCallback(
    (move: { x: number; y: number }, boardSize: number) => {
      const letters = 'ABCDEFGHJKLMNOPQRST';
      const col = letters[move.x];
      const row = boardSize - move.y;
      const text = `推荐 ${col}${row}`;
      speakDebounced(text, 500);
    },
    [speakDebounced]
  );

  const speakCapture = useCallback(
    (count: number) => {
      if (count > 0) {
        const text = count >= 5 ? `提子 ${count} 枚！` : `提子 ${count}`;
        speakImmediately(text);
      }
    },
    [speakImmediately]
  );

  const speakMoveNumber = useCallback(
    (moveNum: number) => {
      if (moveNum % 20 === 0) {
        speakDebounced(`第 ${moveNum} 手`, 800);
      }
    },
    [speakDebounced]
  );

  const stop = useCallback(() => {
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    pendingSpeechRef.current = null;
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    isSpeakingRef.current = false;
  }, []);

  const reset = useCallback(() => {
    lastWinRateRef.current = null;
    stop();
  }, [stop]);

  return { speak: speakImmediately, speakWinRate, speakRecommendedMove, speakCapture, speakMoveNumber, stop, reset };
};
