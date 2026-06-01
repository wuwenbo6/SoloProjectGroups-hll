import React, { useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { monokai } from '@uiw/codemirror-theme-monokai';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from '@codemirror/view';
import { foldGutter, indentOnInput } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  placeholder?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  height = '100%',
  placeholder = 'Enter C code here...',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  const extensions = [
    cpp(),
    monokai,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    foldGutter(),
    indentOnInput(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      },
      '.cm-content': {
        padding: '12px 0',
      },
      '.cm-gutters': {
        backgroundColor: '#1e1e2e',
        borderRight: '1px solid #313244',
        color: '#6c7086',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#313244',
        color: '#a6e3a1',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(49, 50, 68, 0.5)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(137, 180, 250, 0.3) !important',
      },
      '.cm-cursor': {
        borderLeftColor: '#f5e0dc',
      },
    }),
  ];

  return (
    <div ref={editorRef} className="w-full h-full overflow-hidden rounded-lg border border-slate-700">
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: false,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          foldGutter: false,
        }}
      />
    </div>
  );
};

export default CodeEditor;
