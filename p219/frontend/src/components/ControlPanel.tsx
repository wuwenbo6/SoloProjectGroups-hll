import React from 'react';
import { FlashStatus } from '../types';

interface ControlPanelProps {
  onFlash: () => void;
  onErase: () => void;
  onStop: () => void;
  status: FlashStatus;
  canFlash: boolean;
}

export function ControlPanel({ onFlash, onErase, onStop, status, canFlash }: ControlPanelProps) {
  const isBusy = status === 'connecting' || status === 'flashing' || status === 'verifying';

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={onFlash}
        disabled={!canFlash || isBusy}
        className={`flex-1 min-w-[140px] px-6 py-3 rounded-lg font-medium transition-all duration-200
          flex items-center justify-center gap-2
          ${canFlash && !isBusy
            ? 'bg-accent-green text-black hover:bg-accent-green/90 shadow-lg shadow-accent-green/20 hover:shadow-accent-green/40'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {isBusy ? '烧录中...' : '开始烧录'}
      </button>

      <button
        onClick={onErase}
        disabled={isBusy}
        className={`px-6 py-3 rounded-lg font-medium transition-all duration-200
          flex items-center justify-center gap-2
          ${!isBusy
            ? 'bg-dark-card border border-dark-border text-white hover:border-accent-orange hover:text-accent-orange'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        擦除芯片
      </button>

      {isBusy && (
        <button
          onClick={onStop}
          className="px-6 py-3 rounded-lg font-medium transition-all duration-200
            flex items-center justify-center gap-2
            bg-accent-red/20 border border-accent-red text-accent-red
            hover:bg-accent-red hover:text-white
          "
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
          停止
        </button>
      )}
    </div>
  );
}
