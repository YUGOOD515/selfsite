import { createElement, ArrowRight, CircleDot, List, LoaderCircle, X } from './vendor/lucide.js';

const icons = { 'arrow-right': ArrowRight, 'circle-dot': CircleDot, list: List, 'loader-circle': LoaderCircle, x: X };

export function icon(name) {
  return createElement(icons[name], {
    class: `lucide lucide-${name}`,
    'aria-hidden': 'true',
    focusable: 'false',
    'stroke-width': 1.6,
  });
}
