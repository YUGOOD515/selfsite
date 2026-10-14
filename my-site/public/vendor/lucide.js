// work/package/dist/esm/defaultAttributes.mjs
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};

// work/package/dist/esm/createElement.mjs
var createSVGElement = ([tag, attrs, children]) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs).forEach((name) => {
    element.setAttribute(name, String(attrs[name]));
  });
  if (children?.length) {
    children.forEach((child) => {
      const childElement = createSVGElement(child);
      element.appendChild(childElement);
    });
  }
  return element;
};
var createElement = (iconNode, customAttrs = {}) => {
  const tag = "svg";
  const attrs = {
    ...defaultAttributes,
    ...customAttrs
  };
  return createSVGElement([tag, attrs, iconNode]);
};

// work/package/dist/esm/icons/arrow-right.mjs
var ArrowRight = [
  ["path", { d: "M5 12h14" }],
  ["path", { d: "m12 5 7 7-7 7" }]
];

// work/package/dist/esm/icons/circle-dot.mjs
var CircleDot = [
  ["circle", { cx: "12", cy: "12", r: "1" }],
  ["circle", { cx: "12", cy: "12", r: "10" }]
];

// work/package/dist/esm/icons/list.mjs
var List = [
  ["path", { d: "M3 5h.01" }],
  ["path", { d: "M3 12h.01" }],
  ["path", { d: "M3 19h.01" }],
  ["path", { d: "M8 5h13" }],
  ["path", { d: "M8 12h13" }],
  ["path", { d: "M8 19h13" }]
];

// work/package/dist/esm/icons/loader-circle.mjs
var LoaderCircle = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]];

// work/package/dist/esm/icons/x.mjs
var X = [
  ["path", { d: "M18 6 6 18" }],
  ["path", { d: "m6 6 12 12" }]
];
export {
  ArrowRight,
  CircleDot,
  List,
  LoaderCircle,
  X,
  createElement
};
/**
 * @license lucide v1.54.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
