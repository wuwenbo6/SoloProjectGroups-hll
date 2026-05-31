import React, { useState, useRef } from 'react';
import { Terminal, Sparkles, X } from 'lucide-react';
import { COMMAND_TEMPLATES, TEMPLATE_CATEGORIES } from '@/types';

interface TerminalInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TerminalInput({ value, onChange, disabled }: TerminalInputProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = activeCategory === 'all'
    ? COMMAND_TEMPLATES
    : COMMAND_TEMPLATES.filter(t => t.category === activeCategory);

  const handleTemplateSelect = (command: string) => {
    onChange(command);
    setShowTemplates(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setShowTemplates(prev => !prev);
    }
    if (e.key === 'Escape') {
      setShowTemplates(false);
    }
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = TEMPLATE_CATEGORIES.find(c => c.id === categoryId);
    return category?.name || categoryId;
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-medium">FFmpeg 命令</span>
        </div>
        <button
          type="button"
          onClick={() => setShowTemplates(prev => !prev)}
          className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          disabled={disabled}
        >
          <Sparkles className="w-3 h-3" />
          {showTemplates ? '关闭模板' : '快捷模板'}
        </button>
      </div>

      <div className="terminal rounded-lg overflow-hidden font-mono text-sm">
        <div className="flex items-center gap-2 px-4 py-2 bg-dark-800 border-b border-dark-700">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-error" />
            <div className="w-3 h-3 rounded-full bg-warning" />
            <div className="w-3 h-3 rounded-full bg-success" />
          </div>
          <span className="text-xs text-dark-300 ml-2">ffmpeg</span>
        </div>
        
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="text-success">$</span>
            <span className="text-primary-400">ffmpeg</span>
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder="-i input.mp4 output.avi"
                className="w-full bg-transparent text-white outline-none placeholder-dark-400"
                spellCheck={false}
              />
            </div>
            <span className="terminal-cursor text-primary-400">▋</span>
          </div>
        </div>
      </div>

      {showTemplates && (
        <div className="mt-2 glass rounded-lg p-3 animate-fade-in max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-dark-200">按 Tab 键切换显示 | ESC 关闭</p>
            <button
              type="button"
              onClick={() => setShowTemplates(false)}
              className="p-1 hover:bg-dark-600 rounded"
            >
              <X className="w-4 h-4 text-dark-200" />
            </button>
          </div>
          
          <div className="flex flex-wrap gap-1 mb-3">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                activeCategory === 'all'
                  ? 'bg-primary-500 text-white'
                  : 'bg-dark-700 hover:bg-dark-600'
              }`}
            >
              全部
            </button>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 hover:bg-dark-600'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredTemplates.map((template) => (
              <button
                key={template.name + template.command}
                type="button"
                onClick={() => handleTemplateSelect(template.command)}
                disabled={disabled}
                className="p-3 text-left rounded-lg bg-dark-700/50 hover:bg-dark-600/50 transition-colors disabled:opacity-50 border border-transparent hover:border-primary-500/30"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`
                    w-2 h-2 rounded-full
                    ${template.category === 'convert' ? 'bg-primary-400' : ''}
                    ${template.category === 'compress' ? 'bg-success' : ''}
                    ${template.category === 'gif' ? 'bg-warning' : ''}
                    ${template.category === 'audio' ? 'bg-purple-400' : ''}
                    ${template.category === 'image' ? 'bg-pink-400' : ''}
                    ${template.category === 'other' ? 'bg-dark-300' : ''}
                  `} />
                  <p className="font-medium text-sm">{template.name}</p>
                </div>
                <p className="text-xs text-dark-200">{template.description}</p>
                <p className="text-xs text-primary-400 mt-1 font-mono truncate">
                  {template.command}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-dark-300 mt-2">
        提示: 使用 <code className="px-1 py-0.5 bg-dark-700 rounded">input.*</code> 代表输入文件，<code className="px-1 py-0.5 bg-dark-700 rounded">output.*</code> 代表输出文件
      </p>
    </div>
  );
}
