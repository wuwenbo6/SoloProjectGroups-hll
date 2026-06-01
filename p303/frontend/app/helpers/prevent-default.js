import { helper } from '@ember/component/helper';

export function preventDefault([fn]) {
  return function(event) {
    event.preventDefault();
    return fn.apply(this, arguments);
  };
}

export default helper(preventDefault);
