import React, { useState, useRef } from 'react';
import { RecognitionResult } from '../types';

interface SentenceBuilderProps {
  results: RecognitionResult[];
  minConfidence?: number;
  onSentenceChange?: (sentence: string) => void;
}

export const SentenceBuilder: React.FC<SentenceBuilderProps> = ({
  results,
  minConfidence = 0.6,
  onSentenceChange
}) => {
  const [sentence, setSentence] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const lastConsonantRef = useRef<string | null>(null);

  const handleResult = (result: RecognitionResult) => {
    if (!isRecording || result.confidence < minConfidence) return;
    if (result.consonant === 'silence') return;

    if (lastConsonantRef.current !== result.consonant) {
      setSentence(prev => prev + result.consonant);
      lastConsonantRef.current = result.consonant;
      
      if (onSentenceChange) {
        onSentenceChange(sentence + result.consonant);
      }
    }
  };

  React.useEffect(() => {
    if (results.length > 0) {
      handleResult(results[results.length - 1]);
    }
  }, [results]);

  const handleClear = () => {
    setSentence('');
    lastConsonantRef.current = null;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sentence);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleSpace = () => {
    setSentence(prev => prev + ' ');
  };

  const handleBackspace = () => {
    setSentence(prev => prev.slice(0, -1));
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          句子模式
        </h3>
        
        <button
          onClick={() => setIsRecording(!isRecording)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            isRecording 
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`}></span>
          {isRecording ? '录制中' : '开始录制'}
        </button>
      </div>

      <div className="relative">
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="识别的文字将显示在这里..."
          className="w-full h-32 bg-gray-900 text-white rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-600"
        />
        
        {isRecording && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
            <span className="text-xs text-red-400">REC</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={handleSpace}
          className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
        >
          空格
        </button>
        <button
          onClick={handleBackspace}
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
        >
          ← 退格
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
        >
          清空
        </button>
        <button
          onClick={handleCopy}
          disabled={!sentence}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          复制
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-gray-500 text-xs">
          提示：清晰地发出辅音（b、p、m、f等），保持脸部正对摄像头，光线充足。
        </p>
      </div>
    </div>
  );
};
