import type { ConfigValue, KconfigSymbol } from '../../shared/types';

const isTruthy = (v: string | boolean | number | undefined): boolean =>
  v === true || v === 'y' || v === 'm';

const isFalsy = (v: string | boolean | number | undefined): boolean =>
  !v || v === 'n' || (v as unknown) === false;

export interface DepChangeSet {
  values: ConfigValue;
  autoEnabled: string[];
  autoDisabled: string[];
  autoSelected: string[];
}

export function resolveToggle(
  symbolName: string,
  newValue: string | boolean,
  currentValues: ConfigValue,
  symbols: Record<string, KconfigSymbol>,
  nodeSelects: Record<string, string[]>
): DepChangeSet {
  const values: ConfigValue = { ...currentValues };
  const autoEnabled: string[] = [];
  const autoDisabled: string[] = [];
  const autoSelected: string[] = [];
  const visited = new Set<string>();

  function enableForward(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const sym = symbols[name];
    if (!sym) return;
    for (const dep of sym.dependencies) {
      if (isFalsy(values[dep])) {
        values[dep] = 'y';
        autoEnabled.push(dep);
        enableForward(dep);
      }
    }
  }

  function selectDownward(name: string) {
    const selects = nodeSelects[name];
    if (!selects) return;
    for (const target of selects) {
      if (isFalsy(values[target])) {
        values[target] = 'y';
        autoSelected.push(target);
      }
    }
  }

  function disableDependents(name: string) {
    if (visited.has('disable:' + name)) return;
    visited.add('disable:' + name);
    for (const [symName, sym] of Object.entries(symbols)) {
      if (sym.dependencies.includes(name) && isTruthy(values[symName])) {
        values[symName] = 'n';
        autoDisabled.push(symName);
        disableDependents(symName);
        unselectOrphans(symName);
      }
    }
  }

  function unselectOrphans(name: string) {
    const selects = nodeSelects[name];
    if (!selects) return;
    for (const target of selects) {
      if (!isFalsy(values[target])) continue;
      let stillSelected = false;
      for (const [otherName, otherSelects] of Object.entries(nodeSelects)) {
        if (otherName === name) continue;
        if (otherSelects.includes(target) && isTruthy(values[otherName])) {
          stillSelected = true;
          break;
        }
      }
      if (!stillSelected) {
        const targetSym = symbols[target];
        if (targetSym && targetSym.dependencies.length === 0) {
          values[target] = 'n';
          autoDisabled.push(target);
        }
      }
    }
  }

  if (isTruthy(newValue)) {
    enableForward(symbolName);
    values[symbolName] = newValue;
    selectDownward(symbolName);
  } else {
    values[symbolName] = newValue;
    disableDependents(symbolName);
    unselectOrphans(symbolName);
  }

  return { values, autoEnabled, autoDisabled, autoSelected };
}
