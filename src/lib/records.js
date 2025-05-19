export function better(measure) {
    return measure === 'time' ? Math.min : Math.max;
  }