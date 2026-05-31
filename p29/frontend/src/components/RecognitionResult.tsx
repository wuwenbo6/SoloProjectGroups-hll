import React from 'react';
import { RecognitionResult as RecognitionResultType } from '../types';

interface RecognitionResultProps {
  result: RecognitionResultType | null;
  history: RecognitionResultType[];
  confidenceThreshold?: number;
}

export const RecognitionResult: React.FC<RecognitionResultProps> = ({
  result,
  history,
  confidenceThreshold = 0.5
}) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#00ff88';
    if (confidence >= 0.6) return '#ffcc00';
    return '#ff4444';
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400"></span>
        实时识别
      </h3>

      <div className="bg-gray-900 rounded-lg p-6 text-center mb-4">
        <div 
          className="text-6xl font-bold transition-all duration-200"
          style={{ 
            color: result ? getConfidenceColor(result.confidence) : '#374151',
            textShadow: result && result.confidence > 0.7 ? '0 0 20px currentColor' : 'none'
          }}
        >
          {result ? result.consonant.toUpperCase() : '—'}
        </div>
        
        {result && (
          <div className="mt-4">
            <div className="flex items-center justify-center gap-3">
              <span className="text-gray-400 text-sm">置信度</span>
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full transition-all duration-300 rounded-full"
                  style={{ 
                    width: `${result.confidence * 100}%`,
                    backgroundColor: getConfidenceColor(result.confidence)
                  }}
                />
              </div>
              <span 
                className="text-sm font-medium w-12"
                style={{ color: getConfidenceColor(result.confidence) }}
              >
                {(result.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {result && result.confidence < confidenceThreshold && (
          <div className="mt-3 text-xs text-yellow-500 flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            置信度较低，请正对摄像头并清晰发音
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <p className="text-gray-400 text-sm mb-2">最近识别</p>
          <div className="flex flex-wrap gap-2">
            {history.slice(-10).map((item, index) => (
              <div
                key={index}
                className="px-2 py-1 bg-gray-700 rounded text-sm"
                style={{ 
                  color: getConfidenceColor(item.confidence),
                  opacity: 0.5 + (index / history.length) * 0.5
                }}
              >
                {item.consonant}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
