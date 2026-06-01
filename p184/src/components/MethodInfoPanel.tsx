import { Code2, Info } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';

export default function MethodInfoPanel() {
  const { selectedMethod, schema } = useGrpcStore();

  if (!selectedMethod) {
    return null;
  }

  const renderSchema = (schemaObj: Record<string, unknown>) => {
    return Object.entries(schemaObj).map(([key, value]) => {
      if (key === '_type') return null;
      const val = value as Record<string, unknown>;
      return (
        <div key={key} className="flex items-start gap-2 py-1">
          <span className="text-[var(--text-primary)] font-mono text-sm">{key}</span>
          <span className="text-teal-400 font-mono text-sm">{val.type as string}</span>
          {val.required && (
            <span className="text-xs text-red-400">required</span>
          )}
          <span className="text-[var(--text-secondary)] text-xs">
            (field number: {val.number as string})
          </span>
        </div>
      );
    });
  };

  return (
    <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border-color)]">
        <Info className="w-4 h-4 text-teal-400" />
        <span className="text-sm font-medium text-[var(--text-primary)]">方法签名</span>
      </div>
      <div className="px-4 py-3">
        <div className="mb-3">
          <div className="text-xs text-[var(--text-secondary)] mb-1">完整方法名</div>
          <code className="block bg-[var(--bg-primary)] px-3 py-2 rounded-lg font-mono text-sm text-teal-400 border border-[var(--border-color)]">
            {selectedMethod.fullMethod}
          </code>
        </div>

        {schema && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                <Code2 className="w-3 h-3" />
                请求类型: <span className="font-mono text-teal-400">{schema.inputType}</span>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-color)]">
                {renderSchema(schema.inputSchema)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                <Code2 className="w-3 h-3" />
                响应类型: <span className="font-mono text-teal-400">{schema.outputType}</span>
              </div>
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-color)]">
                {renderSchema(schema.outputSchema)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
