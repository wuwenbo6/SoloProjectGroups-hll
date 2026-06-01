import { helper } from '@ember/component/helper';

export function range([start, end]) {
  const result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

export default helper(range);
