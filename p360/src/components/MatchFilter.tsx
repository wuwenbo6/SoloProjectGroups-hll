import { useState } from 'react';
import { Plus, Trash2, Filter, FilterX, Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';
import type { MatchFilter, MatchCondition, MatchOperator } from '../../shared/types.js';

interface MatchFilterProps {
  currentFilter: MatchFilter | null;
  matchedCount: number;
  onFilterChange: (filter: MatchFilter | null) => void;
}

const OPERATORS: { value: MatchOperator; label: string }[] = [
  { value: '$eq', label: '等于 ($eq)' },
  { value: '$ne', label: '不等于 ($ne)' },
  { value: '$gt', label: '大于 ($gt)' },
  { value: '$gte', label: '大于等于 ($gte)' },
  { value: '$lt', label: '小于 ($lt)' },
  { value: '$lte', label: '小于等于 ($lte)' },
  { value: '$in', label: '包含 ($in)' },
  { value: '$nin', label: '不包含 ($nin)' },
  { value: '$exists', label: '存在 ($exists)' },
  { value: '$regex', label: '正则 ($regex)' },
];

const PRESET_FIELDS = ['name', 'age', 'email', 'status', 'category', 'price', 'score', 'active', '_id'];

export function MatchFilter({ currentFilter, matchedCount, onFilterChange }: MatchFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState<MatchFilter>(
    currentFilter || {
      id: Date.now().toString(),
      name: '默认过滤器',
      enabled: true,
      conditions: [{ field: '', operator: '$eq', value: '' }],
      logicalOp: '$and',
    }
  );

  const addCondition = () => {
    setFilter((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { field: '', operator: '$eq', value: '' }],
    }));
  };

  const removeCondition = (index: number) => {
    if (filter.conditions.length <= 1) return;
    setFilter((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  };

  const updateCondition = (index: number, key: keyof MatchCondition, value: any) => {
    setFilter((prev) => ({
      ...prev,
      conditions: prev.conditions.map((cond, i) =>
        i === index ? { ...cond, [key]: value } : cond
      ),
    }));
  };

  const applyFilter = () => {
    const hasEmptyField = filter.conditions.some((c) => !c.field.trim());
    if (hasEmptyField) return;

    const processedConditions = filter.conditions.map((cond) => {
      let processedValue = cond.value;
      if (cond.operator === '$exists') {
        processedValue = cond.value !== 'false';
      } else if (cond.operator === '$in' || cond.operator === '$nin') {
        processedValue = String(cond.value)
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v);
      } else if (['$gt', '$gte', '$lt', '$lte'].includes(cond.operator)) {
        const num = Number(cond.value);
        if (!isNaN(num)) processedValue = num;
      }
      return { ...cond, value: processedValue };
    });

    onFilterChange({ ...filter, conditions: processedConditions });
  };

  const clearFilter = () => {
    setFilter({
      id: Date.now().toString(),
      name: '默认过滤器',
      enabled: true,
      conditions: [{ field: '', operator: '$eq', value: '' }],
      logicalOp: '$and',
    });
    onFilterChange(null);
  };

  const toggleEnabled = () => {
    const newFilter = { ...filter, enabled: !filter.enabled };
    setFilter(newFilter);
    if (newFilter.conditions.some((c) => c.field.trim())) {
      onFilterChange(newFilter);
    }
  };

  const getOperatorInputType = (operator: MatchOperator) => {
    switch (operator) {
      case '$exists':
        return 'select';
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
        return 'number';
      case '$regex':
        return 'text';
      default:
        return 'text';
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg mb-4 overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-1.5 rounded-md',
            currentFilter?.enabled ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700 text-zinc-500'
          )}>
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">
              $match 过滤条件
            </div>
            <div className="text-xs text-zinc-400">
              {currentFilter?.enabled
                ? `已启用 - 匹配 ${matchedCount} 个历史事件`
                : currentFilter
                ? '已禁用'
                : '未设置'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentFilter && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-mono',
              currentFilter.enabled ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700 text-zinc-500'
            )}>
              {currentFilter.conditions.length} 条件
            </span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', isExpanded && 'rotate-180')} />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-zinc-700 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-400 whitespace-nowrap">逻辑运算:</label>
            <select
              value={filter.logicalOp}
              onChange={(e) => setFilter((prev) => ({ ...prev, logicalOp: e.target.value as '$and' | '$or' }))}
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            >
              <option value="$and">AND (全部满足)</option>
              <option value="$or">OR (任一满足)</option>
            </select>
            <button
              onClick={toggleEnabled}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter.enabled
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  : 'bg-zinc-700 text-zinc-400 border border-zinc-600 hover:bg-zinc-600'
              )}
            >
              <Check className="w-4 h-4" />
              {filter.enabled ? '已启用' : '已禁用'}
            </button>
          </div>

          <div className="space-y-2">
            {filter.conditions.map((condition, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="text-xs text-zinc-500 font-mono w-8 text-center">
                    {filter.logicalOp === '$and' ? 'AND' : 'OR'}
                  </span>
                )}
                {index === 0 && <div className="w-8" />}

                <input
                  type="text"
                  value={condition.field}
                  onChange={(e) => updateCondition(index, 'field', e.target.value)}
                  placeholder="字段名 (如 name, age)"
                  className="flex-1 bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  list="field-suggestions"
                />

                <select
                  value={condition.operator}
                  onChange={(e) => updateCondition(index, 'operator', e.target.value as MatchOperator)}
                  className="w-40 bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {getOperatorInputType(condition.operator) === 'select' ? (
                  <select
                    value={String(condition.value)}
                    onChange={(e) => updateCondition(index, 'value', e.target.value)}
                    className="w-28 bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={getOperatorInputType(condition.operator)}
                    value={condition.value}
                    onChange={(e) => updateCondition(index, 'value', e.target.value)}
                    placeholder={condition.operator === '$in' || condition.operator === '$nin' ? '值1,值2,值3' : '值'}
                    className="flex-1 bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                )}

                <button
                  onClick={() => removeCondition(index)}
                  disabled={filter.conditions.length <= 1}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    filter.conditions.length <= 1
                      ? 'text-zinc-600 cursor-not-allowed'
                      : 'text-red-400 hover:bg-red-500/20'
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <datalist id="field-suggestions">
            {PRESET_FIELDS.map((field) => (
              <option key={field} value={field} />
            ))}
          </datalist>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-700">
            <button
              onClick={addCondition}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加条件
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={clearFilter}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-zinc-400 bg-zinc-700 border border-zinc-600 hover:bg-zinc-600 transition-colors"
              >
                <FilterX className="w-4 h-4" />
                清除
              </button>
              <button
                onClick={applyFilter}
                disabled={filter.conditions.some((c) => !c.field.trim())}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  filter.conditions.some((c) => !c.field.trim())
                    ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                    : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                )}
              >
                <Check className="w-4 h-4" />
                应用过滤
              </button>
            </div>
          </div>

          {currentFilter && (
            <div className="mt-3 p-3 bg-zinc-800/50 rounded-md border border-zinc-700">
              <div className="text-xs text-zinc-400 mb-1">当前过滤条件:</div>
              <pre className="text-xs text-zinc-300 font-mono overflow-x-auto">
                {JSON.stringify(
                  {
                    $match: {
                      [currentFilter.logicalOp]: currentFilter.conditions.map((c) => ({
                        [c.field]: { [c.operator]: c.value },
                      })),
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
