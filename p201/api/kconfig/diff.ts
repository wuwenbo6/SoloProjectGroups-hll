import type { ConfigValue, DiffItem, DiffResult, DiffType } from '../../shared/types';

function valueEqual(
  a: string | boolean | number | undefined,
  b: string | boolean | number | undefined
): boolean {
  if (a === b) return true;
  if ((a === true && b === 'y') || (a === 'y' && b === true)) return true;
  if ((a === false || a === undefined || a === null) && (b === false || b === undefined || b === null)) return true;
  return false;
}

export function compareConfigs(
  current: ConfigValue,
  reference: ConfigValue
): DiffResult {
  const items: DiffItem[] = [];
  const allNames = new Set([...Object.keys(current), ...Object.keys(reference)]);

  let addedCount = 0, removedCount = 0, modifiedCount = 0, unchangedCount = 0;

  for (const name of allNames) {
    const currentValue = current[name];
    const referenceValue = reference[name];
    let type: DiffType;

    if (valueEqual(currentValue, referenceValue)) {
      type = 'unchanged';
      unchangedCount++;
    } else if (referenceValue === undefined) {
      type = 'added';
      addedCount++;
    } else if (currentValue === undefined || currentValue === false) {
      type = 'removed';
      removedCount++;
    } else {
      type = 'modified';
      modifiedCount++;
    }

    items.push({ name, type, currentValue, referenceValue });
  }

  items.sort((a, b) => {
    const order: Record<DiffType, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    return a.name.localeCompare(b.name);
  });

  return { items, addedCount, removedCount, modifiedCount, unchangedCount };
}
