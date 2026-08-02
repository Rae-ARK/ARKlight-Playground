const inheritableCSSProperties = /* @__PURE__ */ new Set([
  "color",
  "cursor",
  "direction",
  "font",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-size",
  "font-size-adjust",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "orphans",
  "overflow-wrap",
  "quotes",
  "tab-size",
  "text-align",
  "text-align-last",
  "text-indent",
  "text-transform",
  "visibility",
  "white-space",
  "widows",
  "word-break",
  "word-spacing",
  "writing-mode"
]);
const varReferenceRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const keyComputedProperties = /* @__PURE__ */ new Set([
  "display",
  "position",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-size",
  "font-family",
  "color",
  "background-color"
]);
const alwaysResolvedProperties = /* @__PURE__ */ new Set(["display", "height", "width"]);
function collectVarReferences(value, into) {
  for (const m of value.matchAll(varReferenceRegex)) {
    into.add(m[1]);
  }
}
function collectPropertyNames(cssProperties, into, inheritableOnly) {
  for (const prop of cssProperties) {
    if (!prop.name || !prop.value || prop.disabled || prop.name.startsWith("--")) {
      continue;
    }
    if (inheritableOnly && !inheritableCSSProperties.has(prop.name)) {
      continue;
    }
    into.add(prop.name);
  }
}
function filterInheritableDeclarations(cssText) {
  const declarations = cssText.split(";").map((d) => d.trim()).filter(Boolean);
  const filtered = declarations.filter((decl) => {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) {
      return false;
    }
    const propName = decl.substring(0, colonIdx).trim();
    return inheritableCSSProperties.has(propName);
  });
  return filtered.length > 0 ? filtered.join("; ") : void 0;
}
function formatMatchedStyles(matched) {
  const referencedVars = /* @__PURE__ */ new Set();
  const authorPropertyNames = /* @__PURE__ */ new Set();
  const userAgentPropertyNames = /* @__PURE__ */ new Set();
  const seenCssTexts = /* @__PURE__ */ new Set();
  const lines = [];
  if (matched.inlineStyle?.cssText?.trim()) {
    const cssText = matched.inlineStyle.cssText.trim();
    collectVarReferences(cssText, referencedVars);
    collectPropertyNames(matched.inlineStyle.cssProperties, authorPropertyNames);
    lines.push(`element { ${cssText} }`);
  }
  for (const ruleEntry of matched.matchedCSSRules ?? []) {
    if (ruleEntry.rule.origin === "user-agent") {
      collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames);
      continue;
    }
    const cssText = ruleEntry.rule.style.cssText?.trim();
    if (!cssText || seenCssTexts.has(cssText)) {
      continue;
    }
    seenCssTexts.add(cssText);
    collectVarReferences(cssText, referencedVars);
    collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames);
    const selectors = ruleEntry.rule.selectorList.selectors.map((s) => s.text).join(", ");
    lines.push(`${selectors} { ${cssText} }`);
  }
  if (matched.pseudoElements?.length) {
    const pseudoLines = [];
    for (const pseudo of matched.pseudoElements) {
      for (const ruleEntry of pseudo.matches ?? []) {
        if (ruleEntry.rule.origin === "user-agent") {
          collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames);
          continue;
        }
        const cssText = ruleEntry.rule.style.cssText?.trim();
        if (!cssText || seenCssTexts.has(cssText)) {
          continue;
        }
        seenCssTexts.add(cssText);
        collectVarReferences(cssText, referencedVars);
        collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames);
        const selectors = ruleEntry.rule.selectorList.selectors.map((s) => s.text).join(", ");
        pseudoLines.push(`${selectors} { ${cssText} }`);
      }
    }
    if (pseudoLines.length > 0) {
      lines.push("");
      lines.push("/* Pseudo-elements */");
      lines.push(...pseudoLines);
    }
  }
  const inheritedLines = [];
  for (const entry of matched.inherited ?? []) {
    for (const ruleEntry of entry.matchedCSSRules ?? []) {
      if (ruleEntry.rule.origin === "user-agent") {
        collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames, true);
        continue;
      }
      const cssText = ruleEntry.rule.style.cssText?.trim();
      if (!cssText) {
        continue;
      }
      const filtered = filterInheritableDeclarations(cssText);
      if (!filtered || seenCssTexts.has(filtered)) {
        continue;
      }
      seenCssTexts.add(filtered);
      collectVarReferences(filtered, referencedVars);
      collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames, true);
      const selectors = ruleEntry.rule.selectorList.selectors.map((s) => s.text).join(", ");
      inheritedLines.push(`${selectors} { ${filtered} }`);
    }
  }
  if (inheritedLines.length > 0) {
    lines.push("");
    lines.push("/* Inherited */");
    lines.push(...inheritedLines);
  }
  for (const prop of alwaysResolvedProperties) {
    authorPropertyNames.add(prop);
  }
  return { rulesText: lines.join("\n"), referencedVars, authorPropertyNames, userAgentPropertyNames };
}
const boxShorthands = [
  // margin: <margin-top> <margin-right> <margin-bottom> <margin-left>
  { shorthand: "margin", sides: ["margin-top", "margin-right", "margin-bottom", "margin-left"] },
  // padding: <padding-top> <padding-right> <padding-bottom> <padding-left>
  { shorthand: "padding", sides: ["padding-top", "padding-right", "padding-bottom", "padding-left"] },
  // border-radius: <TL> <TR> <BR> <BL>   (clockwise from top-left)
  { shorthand: "border-radius", sides: ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"] }
];
const borderSideGroups = [
  // border-width: initial medium per MDN (but computed is always an absolute length)
  { shorthand: "border-width", sides: ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"] },
  // border-style: initial none per MDN
  { shorthand: "border-style", sides: ["border-top-style", "border-right-style", "border-bottom-style", "border-left-style"] },
  // border-color: initial currentcolor per MDN
  { shorthand: "border-color", sides: ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"] }
];
const dropWhenAllDefault = [
  // border-image  (CSS Backgrounds & Borders 3 section 6.8)
  {
    longhands: {
      "border-image-source": "none",
      "border-image-slice": "100%",
      "border-image-width": "1",
      "border-image-outset": "0",
      "border-image-repeat": "stretch"
    }
  },
  // animation-range  (CSS Scroll-driven Animations section 5.2)  initial: normal
  {
    longhands: {
      "animation-range-start": "normal",
      "animation-range-end": "normal"
    }
  }
];
const backgroundCollapse = {
  colorLonghand: "background-color",
  otherLonghands: {
    // MDN background formal definition initial values:
    "background-image": "none",
    // initial: none
    "background-position-x": "0px",
    // initial: 0% (computed as 0px)
    "background-position-y": "0px",
    // initial: 0%
    "background-size": "auto",
    // initial: auto auto
    "background-repeat": "repeat",
    // initial: repeat
    "background-attachment": "scroll",
    // initial: scroll
    "background-origin": "padding-box",
    // initial: padding-box
    "background-clip": "border-box"
    // initial: border-box
  }
};
const simpleShorthands = [
  // text-decoration (CSS Text Decoration 4 section 3)
  // Constituents: text-decoration-line || text-decoration-style || text-decoration-color || text-decoration-thickness
  {
    shorthand: "text-decoration",
    longhands: [
      { name: "text-decoration-line", initial: "none" },
      { name: "text-decoration-style", initial: "solid" },
      { name: "text-decoration-color", initial: "currentcolor" },
      { name: "text-decoration-thickness", initial: "auto" }
    ]
  }
];
const whiteSpaceKeywords = [
  { collapse: "collapse", wrap: "wrap", keyword: "normal" },
  { collapse: "collapse", wrap: "nowrap", keyword: "nowrap" },
  { collapse: "preserve", wrap: "nowrap", keyword: "pre" },
  { collapse: "preserve", wrap: "wrap", keyword: "pre-wrap" },
  { collapse: "preserve-breaks", wrap: "wrap", keyword: "pre-line" },
  { collapse: "break-spaces", wrap: "wrap", keyword: "break-spaces" }
];
const listShorthands = [
  // transition (CSS Transitions 1 section 2.1)
  // Constituents: transition-property || transition-duration || transition-timing-function || transition-delay || transition-behavior
  {
    shorthand: "transition",
    longhands: [
      { name: "transition-property", initial: "all" },
      { name: "transition-duration", initial: "0s" },
      { name: "transition-timing-function", initial: "ease" },
      { name: "transition-delay", initial: "0s" },
      { name: "transition-behavior", initial: "normal" }
    ]
  },
  // animation (CSS Animations 1 section 3 + Scroll-driven Animations section 5)
  // Constituents: animation-name || animation-duration || animation-timing-function || animation-delay
  //             || animation-iteration-count || animation-direction || animation-fill-mode
  //             || animation-play-state || animation-timeline
  {
    shorthand: "animation",
    longhands: [
      { name: "animation-name", initial: "none" },
      { name: "animation-duration", initial: "0s" },
      { name: "animation-timing-function", initial: "ease" },
      { name: "animation-delay", initial: "0s" },
      { name: "animation-iteration-count", initial: "1" },
      { name: "animation-direction", initial: "normal" },
      { name: "animation-fill-mode", initial: "none" },
      { name: "animation-play-state", initial: "running" },
      { name: "animation-timeline", initial: "auto" }
    ]
  }
];
function collapseBoxValues(entries, sides) {
  const [topKey, rightKey, bottomKey, leftKey] = sides;
  const top = entries.get(topKey);
  const right = entries.get(rightKey);
  const bottom = entries.get(bottomKey);
  const left = entries.get(leftKey);
  if (top === void 0 || right === void 0 || bottom === void 0 || left === void 0) {
    return void 0;
  }
  entries.delete(topKey);
  entries.delete(rightKey);
  entries.delete(bottomKey);
  entries.delete(leftKey);
  if (top === right && right === bottom && bottom === left) {
    return top;
  }
  if (top === bottom && right === left) {
    return `${top} ${right}`;
  }
  if (right === left) {
    return `${top} ${right} ${bottom}`;
  }
  return `${top} ${right} ${bottom} ${left}`;
}
function splitCSSList(value) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === "," && depth === 0) {
      items.push(value.substring(start, i).trim());
      start = i + 1;
    }
  }
  items.push(value.substring(start).trim());
  return items;
}
function collapseListShorthand(entries, output, shorthand, longhands) {
  const values = longhands.map(({ name }) => entries.get(name));
  if (!values.every((v) => v !== void 0)) {
    return;
  }
  const lists = values.map((v) => splitCSSList(v));
  const itemCount = lists[0].length;
  if (!lists.every((l) => l.length === itemCount)) {
    return;
  }
  for (const { name } of longhands) {
    entries.delete(name);
  }
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const parts = [];
    for (let j = 0; j < longhands.length; j++) {
      const val = lists[j][i];
      if (val !== longhands[j].initial) {
        parts.push(val);
      }
    }
    items.push(parts.length > 0 ? parts.join(" ") : longhands[0].initial);
  }
  output.push(`${shorthand}: ${items.join(", ")};`);
}
function collapseToShorthands(entries) {
  const shorthandLines = [];
  for (const { shorthand, sides } of boxShorthands) {
    const collapsed = collapseBoxValues(entries, sides);
    if (collapsed !== void 0) {
      shorthandLines.push(`${shorthand}: ${collapsed};`);
    }
  }
  const borderVals = borderSideGroups.map((g) => g.sides.map((s) => entries.get(s)));
  const hasAllBorderProps = borderVals.every((group) => group.every((v) => v !== void 0));
  if (hasAllBorderProps) {
    const allUniform = borderVals.every((group) => group.every((v) => v === group[0]));
    if (allUniform) {
      for (const group of borderSideGroups) {
        for (const side of group.sides) {
          entries.delete(side);
        }
      }
      shorthandLines.push(`border: ${borderVals[0][0]} ${borderVals[1][0]} ${borderVals[2][0]};`);
    } else {
      for (const group of borderSideGroups) {
        const collapsed = collapseBoxValues(entries, group.sides);
        if (collapsed !== void 0) {
          shorthandLines.push(`${group.shorthand}: ${collapsed};`);
        }
      }
    }
  }
  for (const { longhands } of dropWhenAllDefault) {
    const allDefault = Object.entries(longhands).every(([k, v]) => entries.get(k) === v);
    if (allDefault && Object.keys(longhands).some((k) => entries.has(k))) {
      for (const key of Object.keys(longhands)) {
        entries.delete(key);
      }
    }
  }
  {
    const { colorLonghand, otherLonghands } = backgroundCollapse;
    const bgColor = entries.get(colorLonghand);
    const allOthersDefault = Object.entries(otherLonghands).every(([k, v]) => entries.get(k) === v);
    if (allOthersDefault && bgColor !== void 0) {
      entries.delete(colorLonghand);
      for (const key of Object.keys(otherLonghands)) {
        entries.delete(key);
      }
      shorthandLines.push(`background: ${bgColor};`);
    }
  }
  for (const { shorthand, longhands } of simpleShorthands) {
    const first = entries.get(longhands[0].name);
    if (first === void 0) {
      continue;
    }
    const values = longhands.map(({ name }) => entries.get(name));
    for (const { name } of longhands) {
      entries.delete(name);
    }
    const parts = [];
    for (let i = 0; i < longhands.length; i++) {
      const val = values[i] ?? longhands[i].initial;
      if (val !== longhands[i].initial) {
        parts.push(val);
      }
    }
    shorthandLines.push(`${shorthand}: ${parts.length > 0 ? parts.join(" ") : longhands[0].initial};`);
  }
  {
    const wsCollapse = entries.get("white-space-collapse");
    const textWrap = entries.get("text-wrap-mode");
    if (wsCollapse !== void 0 && textWrap !== void 0) {
      entries.delete("white-space-collapse");
      entries.delete("text-wrap-mode");
      const match = whiteSpaceKeywords.find((k) => k.collapse === wsCollapse && k.wrap === textWrap);
      shorthandLines.push(`white-space: ${match ? match.keyword : `${wsCollapse} ${textWrap}`};`);
    }
  }
  for (const { shorthand, longhands } of listShorthands) {
    collapseListShorthand(entries, shorthandLines, shorthand, longhands);
  }
  const remainingLines = [];
  for (const [name, value] of Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    remainingLines.push(`${name}: ${value};`);
  }
  return [...shorthandLines, ...remainingLines];
}
export {
  collapseToShorthands,
  filterInheritableDeclarations,
  formatMatchedStyles,
  keyComputedProperties
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9jc3NIZWxwZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gLS0gQ0RQIG1hdGNoZWQtc3R5bGVzIHR5cGVzIChzdWJzZXQgdXNlZCBieSBmb3JtYXRBdXRob3JTdHlsZXMpIC0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNTU1N0eWxlIHtcblx0Y3NzVGV4dD86IHN0cmluZztcblx0Y3NzUHJvcGVydGllczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmc7IGRpc2FibGVkPzogYm9vbGVhbiB9Pjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3Rvckxpc3Qge1xuXHRzZWxlY3RvcnM6IEFycmF5PHsgdGV4dDogc3RyaW5nIH0+O1xufVxuXG5pbnRlcmZhY2UgSUNTU1J1bGUge1xuXHRzZWxlY3Rvckxpc3Q6IElTZWxlY3Rvckxpc3Q7XG5cdG9yaWdpbjogc3RyaW5nO1xuXHRzdHlsZTogSUNTU1N0eWxlO1xufVxuXG5pbnRlcmZhY2UgSVJ1bGVNYXRjaCB7XG5cdHJ1bGU6IElDU1NSdWxlO1xufVxuXG5pbnRlcmZhY2UgSUluaGVyaXRlZFN0eWxlRW50cnkge1xuXHRpbmxpbmVTdHlsZT86IElDU1NTdHlsZTtcblx0bWF0Y2hlZENTU1J1bGVzOiBJUnVsZU1hdGNoW107XG59XG5cbmludGVyZmFjZSBJUHNldWRvRWxlbWVudE1hdGNoZXMge1xuXHRwc2V1ZG9UeXBlOiBzdHJpbmc7XG5cdG1hdGNoZXM6IElSdWxlTWF0Y2hbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWF0Y2hlZFN0eWxlcyB7XG5cdGlubGluZVN0eWxlPzogSUNTU1N0eWxlO1xuXHRtYXRjaGVkQ1NTUnVsZXM/OiBJUnVsZU1hdGNoW107XG5cdGluaGVyaXRlZD86IElJbmhlcml0ZWRTdHlsZUVudHJ5W107XG5cdHBzZXVkb0VsZW1lbnRzPzogSVBzZXVkb0VsZW1lbnRNYXRjaGVzW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZvcm1hdHRlZFN0eWxlcyB7XG5cdC8qKiBDb21wYWN0IENTUyB0ZXh0IGZvciB0aGUgYWdlbnQgcHJvbXB0IChydWxlcyBvbmx5LCB3aXRob3V0IHJlc29sdmVkIHZhbHVlcykuICovXG5cdHJ1bGVzVGV4dDogc3RyaW5nO1xuXHQvKiogU2V0IG9mIENTUyB2YXJpYWJsZSBuYW1lcyByZWZlcmVuY2VkIGJ5IHRoZSBlbGVtZW50J3MgcnVsZXMuICovXG5cdHJlZmVyZW5jZWRWYXJzOiBTZXQ8c3RyaW5nPjtcblx0LyoqIFNldCBvZiBDU1MgcHJvcGVydHkgbmFtZXMgdGhhdCB3ZXJlIGV4cGxpY2l0bHkgc2V0IGJ5IGF1dGhvciBydWxlcy4gKi9cblx0YXV0aG9yUHJvcGVydHlOYW1lczogU2V0PHN0cmluZz47XG5cdC8qKiBTZXQgb2YgQ1NTIHByb3BlcnR5IG5hbWVzIHRoYXQgd2VyZSBzZXQgYnkgdXNlci1hZ2VudCBydWxlcy4gKi9cblx0dXNlckFnZW50UHJvcGVydHlOYW1lczogU2V0PHN0cmluZz47XG59XG5cbi8vIC0tIENvbnN0YW50cyAtLVxuXG4vKipcbiAqIENTUyBwcm9wZXJ0aWVzIHRoYXQgYXJlIGluaGVyaXRlZCBieSBjaGlsZCBlbGVtZW50cy5cbiAqL1xuY29uc3QgaW5oZXJpdGFibGVDU1NQcm9wZXJ0aWVzID0gbmV3IFNldChbXG5cdCdjb2xvcicsICdjdXJzb3InLCAnZGlyZWN0aW9uJywgJ2ZvbnQnLCAnZm9udC1mYW1pbHknLCAnZm9udC1mZWF0dXJlLXNldHRpbmdzJyxcblx0J2ZvbnQta2VybmluZycsICdmb250LXNpemUnLCAnZm9udC1zaXplLWFkanVzdCcsICdmb250LXN0cmV0Y2gnLCAnZm9udC1zdHlsZScsXG5cdCdmb250LXZhcmlhbnQnLCAnZm9udC13ZWlnaHQnLCAnbGV0dGVyLXNwYWNpbmcnLCAnbGluZS1oZWlnaHQnLCAnbGlzdC1zdHlsZScsXG5cdCdsaXN0LXN0eWxlLWltYWdlJywgJ2xpc3Qtc3R5bGUtcG9zaXRpb24nLCAnbGlzdC1zdHlsZS10eXBlJywgJ29ycGhhbnMnLFxuXHQnb3ZlcmZsb3ctd3JhcCcsICdxdW90ZXMnLCAndGFiLXNpemUnLCAndGV4dC1hbGlnbicsICd0ZXh0LWFsaWduLWxhc3QnLFxuXHQndGV4dC1pbmRlbnQnLCAndGV4dC10cmFuc2Zvcm0nLCAndmlzaWJpbGl0eScsICd3aGl0ZS1zcGFjZScsICd3aWRvd3MnLFxuXHQnd29yZC1icmVhaycsICd3b3JkLXNwYWNpbmcnLCAnd3JpdGluZy1tb2RlJyxcbl0pO1xuXG5jb25zdCB2YXJSZWZlcmVuY2VSZWdleCA9IC92YXJcXChcXHMqKC0tW2EtekEtWjAtOV8tXSspL2c7XG5cbi8qKlxuICogS2V5IGNvbXB1dGVkIHByb3BlcnRpZXMgaW5jbHVkZWQgZm9yIGhvdmVyIGRpc3BsYXkgaW4gdGhlIFVJLlxuICovXG5leHBvcnQgY29uc3Qga2V5Q29tcHV0ZWRQcm9wZXJ0aWVzID0gbmV3IFNldChbXG5cdCdkaXNwbGF5JywgJ3Bvc2l0aW9uJywgJ21hcmdpbicsICdtYXJnaW4tdG9wJywgJ21hcmdpbi1yaWdodCcsICdtYXJnaW4tYm90dG9tJywgJ21hcmdpbi1sZWZ0Jyxcblx0J3BhZGRpbmcnLCAncGFkZGluZy10b3AnLCAncGFkZGluZy1yaWdodCcsICdwYWRkaW5nLWJvdHRvbScsICdwYWRkaW5nLWxlZnQnLFxuXHQnZm9udC1zaXplJywgJ2ZvbnQtZmFtaWx5JywgJ2NvbG9yJywgJ2JhY2tncm91bmQtY29sb3InLFxuXSk7XG5cbi8qKlxuICogUHJvcGVydGllcyBhbHdheXMgaW5jbHVkZWQgaW4gcmVzb2x2ZWQgdmFsdWVzIGV2ZW4gaWYgb25seSBzZXQgYnkgdXNlci1hZ2VudCBydWxlcyxcbiAqIG1hdGNoaW5nIENocm9tZSBEZXZUb29scycgYGFsd2F5c1Nob3duQ29tcHV0ZWRQcm9wZXJ0aWVzYC5cbiAqL1xuY29uc3QgYWx3YXlzUmVzb2x2ZWRQcm9wZXJ0aWVzID0gbmV3IFNldChbJ2Rpc3BsYXknLCAnaGVpZ2h0JywgJ3dpZHRoJ10pO1xuXG4vLyAtLSBIZWxwZXIgZnVuY3Rpb25zIC0tXG5cbi8qKlxuICogQ29sbGVjdHMgdmFyKC0tbmFtZSkgcmVmZXJlbmNlcyBmcm9tIGEgQ1NTIHZhbHVlIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gY29sbGVjdFZhclJlZmVyZW5jZXModmFsdWU6IHN0cmluZywgaW50bzogU2V0PHN0cmluZz4pOiB2b2lkIHtcblx0Zm9yIChjb25zdCBtIG9mIHZhbHVlLm1hdGNoQWxsKHZhclJlZmVyZW5jZVJlZ2V4KSkge1xuXHRcdGludG8uYWRkKG1bMV0pO1xuXHR9XG59XG5cbi8qKlxuICogQ29sbGVjdHMgbG9uZ2hhbmQgcHJvcGVydHkgbmFtZXMgZnJvbSB0aGUgYGNzc1Byb3BlcnRpZXNgIGFycmF5IG9mIGEgbWF0Y2hlZCBydWxlLlxuICogU2tpcHMgdmFyaWFibGUgZGVmaW5pdGlvbnMgYW5kIGRpc2FibGVkIHByb3BlcnRpZXMuXG4gKi9cbmZ1bmN0aW9uIGNvbGxlY3RQcm9wZXJ0eU5hbWVzKGNzc1Byb3BlcnRpZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nOyBkaXNhYmxlZD86IGJvb2xlYW4gfT4sIGludG86IFNldDxzdHJpbmc+LCBpbmhlcml0YWJsZU9ubHk/OiBib29sZWFuKTogdm9pZCB7XG5cdGZvciAoY29uc3QgcHJvcCBvZiBjc3NQcm9wZXJ0aWVzKSB7XG5cdFx0aWYgKCFwcm9wLm5hbWUgfHwgIXByb3AudmFsdWUgfHwgcHJvcC5kaXNhYmxlZCB8fCBwcm9wLm5hbWUuc3RhcnRzV2l0aCgnLS0nKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChpbmhlcml0YWJsZU9ubHkgJiYgIWluaGVyaXRhYmxlQ1NTUHJvcGVydGllcy5oYXMocHJvcC5uYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGludG8uYWRkKHByb3AubmFtZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBGaWx0ZXJzIENTUyBkZWNsYXJhdGlvbnMgdG8gb25seSBpbmhlcml0YWJsZSBwcm9wZXJ0aWVzIChub3QgdmFyaWFibGUgZGVmaW5pdGlvbnMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVySW5oZXJpdGFibGVEZWNsYXJhdGlvbnMoY3NzVGV4dDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZGVjbGFyYXRpb25zID0gY3NzVGV4dC5zcGxpdCgnOycpLm1hcChkID0+IGQudHJpbSgpKS5maWx0ZXIoQm9vbGVhbik7XG5cdGNvbnN0IGZpbHRlcmVkID0gZGVjbGFyYXRpb25zLmZpbHRlcihkZWNsID0+IHtcblx0XHRjb25zdCBjb2xvbklkeCA9IGRlY2wuaW5kZXhPZignOicpO1xuXHRcdGlmIChjb2xvbklkeCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvcE5hbWUgPSBkZWNsLnN1YnN0cmluZygwLCBjb2xvbklkeCkudHJpbSgpO1xuXHRcdHJldHVybiBpbmhlcml0YWJsZUNTU1Byb3BlcnRpZXMuaGFzKHByb3BOYW1lKTtcblx0fSk7XG5cdHJldHVybiBmaWx0ZXJlZC5sZW5ndGggPiAwID8gZmlsdGVyZWQuam9pbignOyAnKSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBGb3JtYXRzIG1hdGNoZWQgc3R5bGVzIGludG8gYSBjb21wYWN0IHJlcHJlc2VudGF0aW9uIGZvciBhZ2VudCBwcm9tcHRzLlxuICpcbiAqIE9ubHkgaW5jbHVkZXMgYXV0aG9yLW9yaWdpbiBydWxlcyAobm90IGJyb3dzZXIgZGVmYXVsdHMpLCB1c2VzIHRoZSByYXdcbiAqIGBjc3NUZXh0YCBpbnN0ZWFkIG9mIGV4cGFuZGVkIGxvbmdoYW5kIHByb3BlcnRpZXMsIGFuZCBmb3IgaW5oZXJpdGVkXG4gKiBydWxlcyBvbmx5IGtlZXBzIGluaGVyaXRhYmxlIENTUyBwcm9wZXJ0aWVzLlxuICpcbiAqIEFsc28gaW5jbHVkZXMgcHNldWRvLWVsZW1lbnQgc3R5bGVzICg6OmJlZm9yZSwgOjphZnRlciwgZXRjLikgd2hlbiBwcmVzZW50LlxuICpcbiAqIFVzZXMgYGNzc1Byb3BlcnRpZXNgICh0aGUgbG9uZ2hhbmQgYXJyYXkpIGZyb20gbWF0Y2hlZCBydWxlcyB0byBkZXRlcm1pbmVcbiAqIHdoaWNoIGNvbXB1dGVkIHByb3BlcnRpZXMgYXJlIGF1dGhvci1hZmZlY3RlZCwgbWF0Y2hpbmcgQ2hyb21lIERldlRvb2xzJ1xuICogYGNvbXB1dGVQcm9wZXJ0eVRyYWNlc2AgYXBwcm9hY2guXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzKTogSUZvcm1hdHRlZFN0eWxlcyB7XG5cdGNvbnN0IHJlZmVyZW5jZWRWYXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGF1dGhvclByb3BlcnR5TmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgdXNlckFnZW50UHJvcGVydHlOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBzZWVuQ3NzVGV4dHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0Ly8gSW5saW5lIHN0eWxlcyBvbiB0aGUgZWxlbWVudCBpdHNlbGZcblx0aWYgKG1hdGNoZWQuaW5saW5lU3R5bGU/LmNzc1RleHQ/LnRyaW0oKSkge1xuXHRcdGNvbnN0IGNzc1RleHQgPSBtYXRjaGVkLmlubGluZVN0eWxlLmNzc1RleHQudHJpbSgpO1xuXHRcdGNvbGxlY3RWYXJSZWZlcmVuY2VzKGNzc1RleHQsIHJlZmVyZW5jZWRWYXJzKTtcblx0XHRjb2xsZWN0UHJvcGVydHlOYW1lcyhtYXRjaGVkLmlubGluZVN0eWxlLmNzc1Byb3BlcnRpZXMsIGF1dGhvclByb3BlcnR5TmFtZXMpO1xuXHRcdGxpbmVzLnB1c2goYGVsZW1lbnQgeyAke2Nzc1RleHR9IH1gKTtcblx0fVxuXG5cdC8vIERpcmVjdCBhdXRob3IgcnVsZXM6IHVzZSBjc3NUZXh0IGZvciBkaXNwbGF5LCBjc3NQcm9wZXJ0aWVzIGZvciBwcm9wZXJ0eSB0cmFja2luZ1xuXHRmb3IgKGNvbnN0IHJ1bGVFbnRyeSBvZiBtYXRjaGVkLm1hdGNoZWRDU1NSdWxlcyA/PyBbXSkge1xuXHRcdGlmIChydWxlRW50cnkucnVsZS5vcmlnaW4gPT09ICd1c2VyLWFnZW50Jykge1xuXHRcdFx0Y29sbGVjdFByb3BlcnR5TmFtZXMocnVsZUVudHJ5LnJ1bGUuc3R5bGUuY3NzUHJvcGVydGllcywgdXNlckFnZW50UHJvcGVydHlOYW1lcyk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgY3NzVGV4dCA9IHJ1bGVFbnRyeS5ydWxlLnN0eWxlLmNzc1RleHQ/LnRyaW0oKTtcblx0XHRpZiAoIWNzc1RleHQgfHwgc2VlbkNzc1RleHRzLmhhcyhjc3NUZXh0KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHNlZW5Dc3NUZXh0cy5hZGQoY3NzVGV4dCk7XG5cdFx0Y29sbGVjdFZhclJlZmVyZW5jZXMoY3NzVGV4dCwgcmVmZXJlbmNlZFZhcnMpO1xuXHRcdGNvbGxlY3RQcm9wZXJ0eU5hbWVzKHJ1bGVFbnRyeS5ydWxlLnN0eWxlLmNzc1Byb3BlcnRpZXMsIGF1dGhvclByb3BlcnR5TmFtZXMpO1xuXHRcdGNvbnN0IHNlbGVjdG9ycyA9IHJ1bGVFbnRyeS5ydWxlLnNlbGVjdG9yTGlzdC5zZWxlY3RvcnMubWFwKHMgPT4gcy50ZXh0KS5qb2luKCcsICcpO1xuXHRcdGxpbmVzLnB1c2goYCR7c2VsZWN0b3JzfSB7ICR7Y3NzVGV4dH0gfWApO1xuXHR9XG5cblx0Ly8gUHNldWRvLWVsZW1lbnQgc3R5bGVzICg6OmJlZm9yZSwgOjphZnRlciwgZXRjLilcblx0aWYgKG1hdGNoZWQucHNldWRvRWxlbWVudHM/Lmxlbmd0aCkge1xuXHRcdGNvbnN0IHBzZXVkb0xpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHNldWRvIG9mIG1hdGNoZWQucHNldWRvRWxlbWVudHMpIHtcblx0XHRcdGZvciAoY29uc3QgcnVsZUVudHJ5IG9mIHBzZXVkby5tYXRjaGVzID8/IFtdKSB7XG5cdFx0XHRcdGlmIChydWxlRW50cnkucnVsZS5vcmlnaW4gPT09ICd1c2VyLWFnZW50Jykge1xuXHRcdFx0XHRcdGNvbGxlY3RQcm9wZXJ0eU5hbWVzKHJ1bGVFbnRyeS5ydWxlLnN0eWxlLmNzc1Byb3BlcnRpZXMsIHVzZXJBZ2VudFByb3BlcnR5TmFtZXMpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNzc1RleHQgPSBydWxlRW50cnkucnVsZS5zdHlsZS5jc3NUZXh0Py50cmltKCk7XG5cdFx0XHRcdGlmICghY3NzVGV4dCB8fCBzZWVuQ3NzVGV4dHMuaGFzKGNzc1RleHQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VlbkNzc1RleHRzLmFkZChjc3NUZXh0KTtcblx0XHRcdFx0Y29sbGVjdFZhclJlZmVyZW5jZXMoY3NzVGV4dCwgcmVmZXJlbmNlZFZhcnMpO1xuXHRcdFx0XHRjb2xsZWN0UHJvcGVydHlOYW1lcyhydWxlRW50cnkucnVsZS5zdHlsZS5jc3NQcm9wZXJ0aWVzLCBhdXRob3JQcm9wZXJ0eU5hbWVzKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0b3JzID0gcnVsZUVudHJ5LnJ1bGUuc2VsZWN0b3JMaXN0LnNlbGVjdG9ycy5tYXAocyA9PiBzLnRleHQpLmpvaW4oJywgJyk7XG5cdFx0XHRcdHBzZXVkb0xpbmVzLnB1c2goYCR7c2VsZWN0b3JzfSB7ICR7Y3NzVGV4dH0gfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocHNldWRvTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGluZXMucHVzaCgnJyk7XG5cdFx0XHRsaW5lcy5wdXNoKCcvKiBQc2V1ZG8tZWxlbWVudHMgKi8nKTtcblx0XHRcdGxpbmVzLnB1c2goLi4ucHNldWRvTGluZXMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEluaGVyaXRlZCBhdXRob3IgcnVsZXMgXHUyMDE0IG9ubHkgaW5oZXJpdGFibGUgcHJvcGVydGllc1xuXHRjb25zdCBpbmhlcml0ZWRMaW5lczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBtYXRjaGVkLmluaGVyaXRlZCA/PyBbXSkge1xuXHRcdGZvciAoY29uc3QgcnVsZUVudHJ5IG9mIGVudHJ5Lm1hdGNoZWRDU1NSdWxlcyA/PyBbXSkge1xuXHRcdFx0aWYgKHJ1bGVFbnRyeS5ydWxlLm9yaWdpbiA9PT0gJ3VzZXItYWdlbnQnKSB7XG5cdFx0XHRcdGNvbGxlY3RQcm9wZXJ0eU5hbWVzKHJ1bGVFbnRyeS5ydWxlLnN0eWxlLmNzc1Byb3BlcnRpZXMsIHVzZXJBZ2VudFByb3BlcnR5TmFtZXMsIHRydWUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNzc1RleHQgPSBydWxlRW50cnkucnVsZS5zdHlsZS5jc3NUZXh0Py50cmltKCk7XG5cdFx0XHRpZiAoIWNzc1RleHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBEaXNwbGF5OiBrZWVwIG9ubHkgaW5oZXJpdGFibGUgcHJvcGVydGllcyBmcm9tIGNzc1RleHRcblx0XHRcdGNvbnN0IGZpbHRlcmVkID0gZmlsdGVySW5oZXJpdGFibGVEZWNsYXJhdGlvbnMoY3NzVGV4dCk7XG5cdFx0XHRpZiAoIWZpbHRlcmVkIHx8IHNlZW5Dc3NUZXh0cy5oYXMoZmlsdGVyZWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2VlbkNzc1RleHRzLmFkZChmaWx0ZXJlZCk7XG5cdFx0XHQvLyBUcmFjazogdXNlIGNzc1Byb3BlcnRpZXMgbG9uZ2hhbmRzLCBpbmhlcml0YWJsZSBvbmx5XG5cdFx0XHRjb2xsZWN0VmFyUmVmZXJlbmNlcyhmaWx0ZXJlZCwgcmVmZXJlbmNlZFZhcnMpO1xuXHRcdFx0Y29sbGVjdFByb3BlcnR5TmFtZXMocnVsZUVudHJ5LnJ1bGUuc3R5bGUuY3NzUHJvcGVydGllcywgYXV0aG9yUHJvcGVydHlOYW1lcywgdHJ1ZSk7XG5cdFx0XHRjb25zdCBzZWxlY3RvcnMgPSBydWxlRW50cnkucnVsZS5zZWxlY3Rvckxpc3Quc2VsZWN0b3JzLm1hcChzID0+IHMudGV4dCkuam9pbignLCAnKTtcblx0XHRcdGluaGVyaXRlZExpbmVzLnB1c2goYCR7c2VsZWN0b3JzfSB7ICR7ZmlsdGVyZWR9IH1gKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoaW5oZXJpdGVkTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdGxpbmVzLnB1c2goJy8qIEluaGVyaXRlZCAqLycpO1xuXHRcdGxpbmVzLnB1c2goLi4uaW5oZXJpdGVkTGluZXMpO1xuXHR9XG5cblx0Ly8gQWx3YXlzIGluY2x1ZGUgRGV2VG9vbHMnIGFsd2F5c1Nob3duQ29tcHV0ZWRQcm9wZXJ0aWVzXG5cdGZvciAoY29uc3QgcHJvcCBvZiBhbHdheXNSZXNvbHZlZFByb3BlcnRpZXMpIHtcblx0XHRhdXRob3JQcm9wZXJ0eU5hbWVzLmFkZChwcm9wKTtcblx0fVxuXG5cdHJldHVybiB7IHJ1bGVzVGV4dDogbGluZXMuam9pbignXFxuJyksIHJlZmVyZW5jZWRWYXJzLCBhdXRob3JQcm9wZXJ0eU5hbWVzLCB1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzIH07XG59XG5cbi8qKlxuICogLS0gU2hvcnRoYW5kIGNvbGxhcHNpbmcgY29uZmlndXJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKlxuICogRWFjaCBjb25zdGFudCBiZWxvdyBkZXNjcmliZXMgb25lIGtpbmQgb2YgQ1NTIHNob3J0aGFuZCB0aGF0IGNhbiBiZVxuICogcmVjb25zdGl0dXRlZCBmcm9tIGNvbXB1dGVkIGxvbmdoYW5kIHZhbHVlcy4gIFRoZSBgY29sbGFwc2VUb1Nob3J0aGFuZHNgXG4gKiBmdW5jdGlvbiB3YWxrcyB0aGVzZSBsaXN0cyBpbiBkZWNsYXJhdGlvbiBvcmRlciBhbmQgcHJvZHVjZXMgY29tcGFjdFxuICogb3V0cHV0IGZvciB0aGUgYWdlbnQgcHJvbXB0LlxuICpcbiAqIFNvdXJjZXM6XG4gKiAgXHUyMDIyIE1ETiBcIkZvcm1hbCBkZWZpbml0aW9uIFx1MjE5MiBJbml0aWFsIHZhbHVlXCIgdGFibGVzXG4gKiAgXHUyMDIyIENTUyBCYWNrZ3JvdW5kcyAmIEJvcmRlcnMgMywgQ1NTIFRyYW5zaXRpb25zIDEsIENTUyBBbmltYXRpb25zIDEsXG4gKiAgICBDU1MgVGV4dCBEZWNvcmF0aW9uIDQsIENTUyBUZXh0IDRcbiAqL1xuXG4vLyAtLSBCb3ggbW9kZWwgKFQgUiBCIEwpIHNob3J0aGFuZHMgLS1cbi8vIENvbGxhcHNlZCB3aXRoIDEtNC12YWx1ZSBzeW50YXggcGVyIENTUyBzcGVjIHNlY3Rpb24gOC4zLlxuXG5pbnRlcmZhY2UgSUJveFNob3J0aGFuZCB7XG5cdHNob3J0aGFuZDogc3RyaW5nO1xuXHRzaWRlczogW3N0cmluZywgc3RyaW5nLCBzdHJpbmcsIHN0cmluZ107IC8vIHRvcC9UTCwgcmlnaHQvVFIsIGJvdHRvbS9CUiwgbGVmdC9CTFxufVxuXG5jb25zdCBib3hTaG9ydGhhbmRzOiBJQm94U2hvcnRoYW5kW10gPSBbXG5cdC8vIG1hcmdpbjogPG1hcmdpbi10b3A+IDxtYXJnaW4tcmlnaHQ+IDxtYXJnaW4tYm90dG9tPiA8bWFyZ2luLWxlZnQ+XG5cdHsgc2hvcnRoYW5kOiAnbWFyZ2luJywgc2lkZXM6IFsnbWFyZ2luLXRvcCcsICdtYXJnaW4tcmlnaHQnLCAnbWFyZ2luLWJvdHRvbScsICdtYXJnaW4tbGVmdCddIH0sXG5cdC8vIHBhZGRpbmc6IDxwYWRkaW5nLXRvcD4gPHBhZGRpbmctcmlnaHQ+IDxwYWRkaW5nLWJvdHRvbT4gPHBhZGRpbmctbGVmdD5cblx0eyBzaG9ydGhhbmQ6ICdwYWRkaW5nJywgc2lkZXM6IFsncGFkZGluZy10b3AnLCAncGFkZGluZy1yaWdodCcsICdwYWRkaW5nLWJvdHRvbScsICdwYWRkaW5nLWxlZnQnXSB9LFxuXHQvLyBib3JkZXItcmFkaXVzOiA8VEw+IDxUUj4gPEJSPiA8Qkw+ICAgKGNsb2Nrd2lzZSBmcm9tIHRvcC1sZWZ0KVxuXHR7IHNob3J0aGFuZDogJ2JvcmRlci1yYWRpdXMnLCBzaWRlczogWydib3JkZXItdG9wLWxlZnQtcmFkaXVzJywgJ2JvcmRlci10b3AtcmlnaHQtcmFkaXVzJywgJ2JvcmRlci1ib3R0b20tcmlnaHQtcmFkaXVzJywgJ2JvcmRlci1ib3R0b20tbGVmdC1yYWRpdXMnXSB9LFxuXTtcblxuLy8gLS0gQm9yZGVyIHBlci1zaWRlIGdyb3VwcyAoY29sbGFwc2UgdG8gYm9yZGVyOiBXIFMgQyB3aGVuIHVuaWZvcm0pIC0tXG5cbmNvbnN0IGJvcmRlclNpZGVHcm91cHM6IElCb3hTaG9ydGhhbmRbXSA9IFtcblx0Ly8gYm9yZGVyLXdpZHRoOiBpbml0aWFsIG1lZGl1bSBwZXIgTUROIChidXQgY29tcHV0ZWQgaXMgYWx3YXlzIGFuIGFic29sdXRlIGxlbmd0aClcblx0eyBzaG9ydGhhbmQ6ICdib3JkZXItd2lkdGgnLCBzaWRlczogWydib3JkZXItdG9wLXdpZHRoJywgJ2JvcmRlci1yaWdodC13aWR0aCcsICdib3JkZXItYm90dG9tLXdpZHRoJywgJ2JvcmRlci1sZWZ0LXdpZHRoJ10gfSxcblx0Ly8gYm9yZGVyLXN0eWxlOiBpbml0aWFsIG5vbmUgcGVyIE1ETlxuXHR7IHNob3J0aGFuZDogJ2JvcmRlci1zdHlsZScsIHNpZGVzOiBbJ2JvcmRlci10b3Atc3R5bGUnLCAnYm9yZGVyLXJpZ2h0LXN0eWxlJywgJ2JvcmRlci1ib3R0b20tc3R5bGUnLCAnYm9yZGVyLWxlZnQtc3R5bGUnXSB9LFxuXHQvLyBib3JkZXItY29sb3I6IGluaXRpYWwgY3VycmVudGNvbG9yIHBlciBNRE5cblx0eyBzaG9ydGhhbmQ6ICdib3JkZXItY29sb3InLCBzaWRlczogWydib3JkZXItdG9wLWNvbG9yJywgJ2JvcmRlci1yaWdodC1jb2xvcicsICdib3JkZXItYm90dG9tLWNvbG9yJywgJ2JvcmRlci1sZWZ0LWNvbG9yJ10gfSxcbl07XG5cbi8vIC0tIExvbmdoYW5kcyB0aGF0IGFyZSBkcm9wcGVkIGVudGlyZWx5IHdoZW4gYWxsIGF0IHRoZWlyIGluaXRpYWwgdmFsdWVzIC0tXG5cbmludGVyZmFjZSBJRGVmYXVsdHNHcm91cCB7XG5cdC8qKiBMb25naGFuZHMgdG8gY2hlY2sgYW5kIHJlbW92ZS4gKi9cblx0bG9uZ2hhbmRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5jb25zdCBkcm9wV2hlbkFsbERlZmF1bHQ6IElEZWZhdWx0c0dyb3VwW10gPSBbXG5cdC8vIGJvcmRlci1pbWFnZSAgKENTUyBCYWNrZ3JvdW5kcyAmIEJvcmRlcnMgMyBzZWN0aW9uIDYuOClcblx0e1xuXHRcdGxvbmdoYW5kczoge1xuXHRcdFx0J2JvcmRlci1pbWFnZS1zb3VyY2UnOiAnbm9uZScsXG5cdFx0XHQnYm9yZGVyLWltYWdlLXNsaWNlJzogJzEwMCUnLFxuXHRcdFx0J2JvcmRlci1pbWFnZS13aWR0aCc6ICcxJyxcblx0XHRcdCdib3JkZXItaW1hZ2Utb3V0c2V0JzogJzAnLFxuXHRcdFx0J2JvcmRlci1pbWFnZS1yZXBlYXQnOiAnc3RyZXRjaCcsXG5cdFx0fSxcblx0fSxcblx0Ly8gYW5pbWF0aW9uLXJhbmdlICAoQ1NTIFNjcm9sbC1kcml2ZW4gQW5pbWF0aW9ucyBzZWN0aW9uIDUuMikgIGluaXRpYWw6IG5vcm1hbFxuXHR7XG5cdFx0bG9uZ2hhbmRzOiB7XG5cdFx0XHQnYW5pbWF0aW9uLXJhbmdlLXN0YXJ0JzogJ25vcm1hbCcsXG5cdFx0XHQnYW5pbWF0aW9uLXJhbmdlLWVuZCc6ICdub3JtYWwnLFxuXHRcdH0sXG5cdH0sXG5dO1xuXG4vLyAtLSBCYWNrZ3JvdW5kIGNvbGxhcHNlIChjb2xvci1vbmx5IHNob3J0aGFuZCB3aGVuIGltYWdlcy9wb3NpdGlvbi9ldGMuIGRlZmF1bHQpIC0tXG5cbmludGVyZmFjZSBJQmFja2dyb3VuZENvbGxhcHNlR3JvdXAge1xuXHQvKiogYmFja2dyb3VuZC1jb2xvciBsb25naGFuZCAgKi9cblx0Y29sb3JMb25naGFuZDogc3RyaW5nO1xuXHQvKiogT3RoZXIgYmFja2dyb3VuZCBsb25naGFuZHMgdGhhdCBtdXN0IGFsbCBiZSBhdCB0aGVpciBpbml0aWFsIHZhbHVlLiAqL1xuXHRvdGhlckxvbmdoYW5kczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuY29uc3QgYmFja2dyb3VuZENvbGxhcHNlOiBJQmFja2dyb3VuZENvbGxhcHNlR3JvdXAgPSB7XG5cdGNvbG9yTG9uZ2hhbmQ6ICdiYWNrZ3JvdW5kLWNvbG9yJyxcblx0b3RoZXJMb25naGFuZHM6IHtcblx0XHQvLyBNRE4gYmFja2dyb3VuZCBmb3JtYWwgZGVmaW5pdGlvbiBpbml0aWFsIHZhbHVlczpcblx0XHQnYmFja2dyb3VuZC1pbWFnZSc6ICdub25lJywgICAgICAgICAgICAvLyBpbml0aWFsOiBub25lXG5cdFx0J2JhY2tncm91bmQtcG9zaXRpb24teCc6ICcwcHgnLCAgICAgICAgLy8gaW5pdGlhbDogMCUgKGNvbXB1dGVkIGFzIDBweClcblx0XHQnYmFja2dyb3VuZC1wb3NpdGlvbi15JzogJzBweCcsICAgICAgICAvLyBpbml0aWFsOiAwJVxuXHRcdCdiYWNrZ3JvdW5kLXNpemUnOiAnYXV0bycsICAgICAgICAgICAgIC8vIGluaXRpYWw6IGF1dG8gYXV0b1xuXHRcdCdiYWNrZ3JvdW5kLXJlcGVhdCc6ICdyZXBlYXQnLCAgICAgICAgIC8vIGluaXRpYWw6IHJlcGVhdFxuXHRcdCdiYWNrZ3JvdW5kLWF0dGFjaG1lbnQnOiAnc2Nyb2xsJywgICAgIC8vIGluaXRpYWw6IHNjcm9sbFxuXHRcdCdiYWNrZ3JvdW5kLW9yaWdpbic6ICdwYWRkaW5nLWJveCcsICAgIC8vIGluaXRpYWw6IHBhZGRpbmctYm94XG5cdFx0J2JhY2tncm91bmQtY2xpcCc6ICdib3JkZXItYm94JywgICAgICAgLy8gaW5pdGlhbDogYm9yZGVyLWJveFxuXHR9LFxufTtcblxuLy8gLS0gU2ltcGxlIHNob3J0aGFuZCBjb2xsYXBzZSAobG9uZ2hhbmRzIFx1MjE5MiBzaW5nbGUgc2hvcnRoYW5kLCBvbWl0IGRlZmF1bHRzKSAtLVxuXG5pbnRlcmZhY2UgSVNpbXBsZVNob3J0aGFuZCB7XG5cdHNob3J0aGFuZDogc3RyaW5nO1xuXHRsb25naGFuZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBpbml0aWFsOiBzdHJpbmcgfT47XG59XG5cbmNvbnN0IHNpbXBsZVNob3J0aGFuZHM6IElTaW1wbGVTaG9ydGhhbmRbXSA9IFtcblx0Ly8gdGV4dC1kZWNvcmF0aW9uIChDU1MgVGV4dCBEZWNvcmF0aW9uIDQgc2VjdGlvbiAzKVxuXHQvLyBDb25zdGl0dWVudHM6IHRleHQtZGVjb3JhdGlvbi1saW5lIHx8IHRleHQtZGVjb3JhdGlvbi1zdHlsZSB8fCB0ZXh0LWRlY29yYXRpb24tY29sb3IgfHwgdGV4dC1kZWNvcmF0aW9uLXRoaWNrbmVzc1xuXHR7XG5cdFx0c2hvcnRoYW5kOiAndGV4dC1kZWNvcmF0aW9uJyxcblx0XHRsb25naGFuZHM6IFtcblx0XHRcdHsgbmFtZTogJ3RleHQtZGVjb3JhdGlvbi1saW5lJywgaW5pdGlhbDogJ25vbmUnIH0sXG5cdFx0XHR7IG5hbWU6ICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnLCBpbml0aWFsOiAnc29saWQnIH0sXG5cdFx0XHR7IG5hbWU6ICd0ZXh0LWRlY29yYXRpb24tY29sb3InLCBpbml0aWFsOiAnY3VycmVudGNvbG9yJyB9LFxuXHRcdFx0eyBuYW1lOiAndGV4dC1kZWNvcmF0aW9uLXRoaWNrbmVzcycsIGluaXRpYWw6ICdhdXRvJyB9LFxuXHRcdF0sXG5cdH0sXG5dO1xuXG4vLyAtLSB3aGl0ZS1zcGFjZSAoQ1NTIFRleHQgNCBzZWN0aW9uIDMpIC0tXG4vLyBTaG9ydGhhbmQgZm9yIHdoaXRlLXNwYWNlLWNvbGxhcHNlIHx8IHRleHQtd3JhcC1tb2RlLlxuLy8gTmFtZWQga2V5d29yZCBtYXBwaW5ncyBmb3IgdGhlIHdlbGwta25vd24gY29tYmluYXRpb25zOlxuXG5jb25zdCB3aGl0ZVNwYWNlS2V5d29yZHM6IEFycmF5PHsgY29sbGFwc2U6IHN0cmluZzsgd3JhcDogc3RyaW5nOyBrZXl3b3JkOiBzdHJpbmcgfT4gPSBbXG5cdHsgY29sbGFwc2U6ICdjb2xsYXBzZScsIHdyYXA6ICd3cmFwJywga2V5d29yZDogJ25vcm1hbCcgfSxcblx0eyBjb2xsYXBzZTogJ2NvbGxhcHNlJywgd3JhcDogJ25vd3JhcCcsIGtleXdvcmQ6ICdub3dyYXAnIH0sXG5cdHsgY29sbGFwc2U6ICdwcmVzZXJ2ZScsIHdyYXA6ICdub3dyYXAnLCBrZXl3b3JkOiAncHJlJyB9LFxuXHR7IGNvbGxhcHNlOiAncHJlc2VydmUnLCB3cmFwOiAnd3JhcCcsIGtleXdvcmQ6ICdwcmUtd3JhcCcgfSxcblx0eyBjb2xsYXBzZTogJ3ByZXNlcnZlLWJyZWFrcycsIHdyYXA6ICd3cmFwJywga2V5d29yZDogJ3ByZS1saW5lJyB9LFxuXHR7IGNvbGxhcHNlOiAnYnJlYWstc3BhY2VzJywgd3JhcDogJ3dyYXAnLCBrZXl3b3JkOiAnYnJlYWstc3BhY2VzJyB9LFxuXTtcblxuLy8gLS0gQ29tbWEtc2VwYXJhdGVkIGxpc3Qgc2hvcnRoYW5kcyAodHJhbnNpdGlvbiwgYW5pbWF0aW9uKSAtLVxuXG5pbnRlcmZhY2UgSUxpc3RTaG9ydGhhbmQge1xuXHRzaG9ydGhhbmQ6IHN0cmluZztcblx0bG9uZ2hhbmRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgaW5pdGlhbDogc3RyaW5nIH0+O1xufVxuXG5jb25zdCBsaXN0U2hvcnRoYW5kczogSUxpc3RTaG9ydGhhbmRbXSA9IFtcblx0Ly8gdHJhbnNpdGlvbiAoQ1NTIFRyYW5zaXRpb25zIDEgc2VjdGlvbiAyLjEpXG5cdC8vIENvbnN0aXR1ZW50czogdHJhbnNpdGlvbi1wcm9wZXJ0eSB8fCB0cmFuc2l0aW9uLWR1cmF0aW9uIHx8IHRyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uIHx8IHRyYW5zaXRpb24tZGVsYXkgfHwgdHJhbnNpdGlvbi1iZWhhdmlvclxuXHR7XG5cdFx0c2hvcnRoYW5kOiAndHJhbnNpdGlvbicsXG5cdFx0bG9uZ2hhbmRzOiBbXG5cdFx0XHR7IG5hbWU6ICd0cmFuc2l0aW9uLXByb3BlcnR5JywgaW5pdGlhbDogJ2FsbCcgfSxcblx0XHRcdHsgbmFtZTogJ3RyYW5zaXRpb24tZHVyYXRpb24nLCBpbml0aWFsOiAnMHMnIH0sXG5cdFx0XHR7IG5hbWU6ICd0cmFuc2l0aW9uLXRpbWluZy1mdW5jdGlvbicsIGluaXRpYWw6ICdlYXNlJyB9LFxuXHRcdFx0eyBuYW1lOiAndHJhbnNpdGlvbi1kZWxheScsIGluaXRpYWw6ICcwcycgfSxcblx0XHRcdHsgbmFtZTogJ3RyYW5zaXRpb24tYmVoYXZpb3InLCBpbml0aWFsOiAnbm9ybWFsJyB9LFxuXHRcdF0sXG5cdH0sXG5cdC8vIGFuaW1hdGlvbiAoQ1NTIEFuaW1hdGlvbnMgMSBzZWN0aW9uIDMgKyBTY3JvbGwtZHJpdmVuIEFuaW1hdGlvbnMgc2VjdGlvbiA1KVxuXHQvLyBDb25zdGl0dWVudHM6IGFuaW1hdGlvbi1uYW1lIHx8IGFuaW1hdGlvbi1kdXJhdGlvbiB8fCBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uIHx8IGFuaW1hdGlvbi1kZWxheVxuXHQvLyAgICAgICAgICAgICB8fCBhbmltYXRpb24taXRlcmF0aW9uLWNvdW50IHx8IGFuaW1hdGlvbi1kaXJlY3Rpb24gfHwgYW5pbWF0aW9uLWZpbGwtbW9kZVxuXHQvLyAgICAgICAgICAgICB8fCBhbmltYXRpb24tcGxheS1zdGF0ZSB8fCBhbmltYXRpb24tdGltZWxpbmVcblx0e1xuXHRcdHNob3J0aGFuZDogJ2FuaW1hdGlvbicsXG5cdFx0bG9uZ2hhbmRzOiBbXG5cdFx0XHR7IG5hbWU6ICdhbmltYXRpb24tbmFtZScsIGluaXRpYWw6ICdub25lJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLWR1cmF0aW9uJywgaW5pdGlhbDogJzBzJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbicsIGluaXRpYWw6ICdlYXNlJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLWRlbGF5JywgaW5pdGlhbDogJzBzJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLWl0ZXJhdGlvbi1jb3VudCcsIGluaXRpYWw6ICcxJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLWRpcmVjdGlvbicsIGluaXRpYWw6ICdub3JtYWwnIH0sXG5cdFx0XHR7IG5hbWU6ICdhbmltYXRpb24tZmlsbC1tb2RlJywgaW5pdGlhbDogJ25vbmUnIH0sXG5cdFx0XHR7IG5hbWU6ICdhbmltYXRpb24tcGxheS1zdGF0ZScsIGluaXRpYWw6ICdydW5uaW5nJyB9LFxuXHRcdFx0eyBuYW1lOiAnYW5pbWF0aW9uLXRpbWVsaW5lJywgaW5pdGlhbDogJ2F1dG8nIH0sXG5cdFx0XSxcblx0fSxcbl07XG5cbi8vIC0tIEhlbHBlciBmdW5jdGlvbnMgLS1cblxuLyoqXG4gKiBUcmllcyB0byBjb2xsYXBzZSBhIGJveCBzaG9ydGhhbmQgKDQgc2lkZXMgXHUyMTkyIDEtNCB2YWx1ZSBzaG9ydGhhbmQpLlxuICogUmV0dXJucyB0aGUgY29sbGFwc2VkIHZhbHVlIG9yIHVuZGVmaW5lZCBpZiBub3QgYWxsIHNpZGVzIGFyZSBwcmVzZW50LlxuICovXG5mdW5jdGlvbiBjb2xsYXBzZUJveFZhbHVlcyhlbnRyaWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBzaWRlczogW3N0cmluZywgc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBbdG9wS2V5LCByaWdodEtleSwgYm90dG9tS2V5LCBsZWZ0S2V5XSA9IHNpZGVzO1xuXHRjb25zdCB0b3AgPSBlbnRyaWVzLmdldCh0b3BLZXkpO1xuXHRjb25zdCByaWdodCA9IGVudHJpZXMuZ2V0KHJpZ2h0S2V5KTtcblx0Y29uc3QgYm90dG9tID0gZW50cmllcy5nZXQoYm90dG9tS2V5KTtcblx0Y29uc3QgbGVmdCA9IGVudHJpZXMuZ2V0KGxlZnRLZXkpO1xuXG5cdGlmICh0b3AgPT09IHVuZGVmaW5lZCB8fCByaWdodCA9PT0gdW5kZWZpbmVkIHx8IGJvdHRvbSA9PT0gdW5kZWZpbmVkIHx8IGxlZnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRlbnRyaWVzLmRlbGV0ZSh0b3BLZXkpO1xuXHRlbnRyaWVzLmRlbGV0ZShyaWdodEtleSk7XG5cdGVudHJpZXMuZGVsZXRlKGJvdHRvbUtleSk7XG5cdGVudHJpZXMuZGVsZXRlKGxlZnRLZXkpO1xuXG5cdGlmICh0b3AgPT09IHJpZ2h0ICYmIHJpZ2h0ID09PSBib3R0b20gJiYgYm90dG9tID09PSBsZWZ0KSB7XG5cdFx0cmV0dXJuIHRvcDtcblx0fVxuXHRpZiAodG9wID09PSBib3R0b20gJiYgcmlnaHQgPT09IGxlZnQpIHtcblx0XHRyZXR1cm4gYCR7dG9wfSAke3JpZ2h0fWA7XG5cdH1cblx0aWYgKHJpZ2h0ID09PSBsZWZ0KSB7XG5cdFx0cmV0dXJuIGAke3RvcH0gJHtyaWdodH0gJHtib3R0b219YDtcblx0fVxuXHRyZXR1cm4gYCR7dG9wfSAke3JpZ2h0fSAke2JvdHRvbX0gJHtsZWZ0fWA7XG59XG5cbi8qKlxuICogU3BsaXRzIGEgQ1NTIHZhbHVlIGJ5IHRvcC1sZXZlbCBjb21tYXMsIHJlc3BlY3RpbmcgcGFyZW50aGVzaXplZCBncm91cHNcbiAqIGxpa2UgYGN1YmljLWJlemllcigwLjE2LCAxLCAwLjMsIDEpYC5cbiAqL1xuZnVuY3Rpb24gc3BsaXRDU1NMaXN0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGl0ZW1zOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgZGVwdGggPSAwO1xuXHRsZXQgc3RhcnQgPSAwO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY2ggPSB2YWx1ZVtpXTtcblx0XHRpZiAoY2ggPT09ICcoJykge1xuXHRcdFx0ZGVwdGgrKztcblx0XHR9IGVsc2UgaWYgKGNoID09PSAnKScpIHtcblx0XHRcdGRlcHRoLS07XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJywnICYmIGRlcHRoID09PSAwKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHZhbHVlLnN1YnN0cmluZyhzdGFydCwgaSkudHJpbSgpKTtcblx0XHRcdHN0YXJ0ID0gaSArIDE7XG5cdFx0fVxuXHR9XG5cdGl0ZW1zLnB1c2godmFsdWUuc3Vic3RyaW5nKHN0YXJ0KS50cmltKCkpO1xuXHRyZXR1cm4gaXRlbXM7XG59XG5cbi8qKlxuICogQ29sbGFwc2VzIGNvbW1hLXNlcGFyYXRlZCBsaXN0IGxvbmdoYW5kcyBpbnRvIGEgc2luZ2xlIHNob3J0aGFuZCBkZWNsYXJhdGlvbi5cbiAqL1xuZnVuY3Rpb24gY29sbGFwc2VMaXN0U2hvcnRoYW5kKFxuXHRlbnRyaWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHRvdXRwdXQ6IHN0cmluZ1tdLFxuXHRzaG9ydGhhbmQ6IHN0cmluZyxcblx0bG9uZ2hhbmRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgaW5pdGlhbDogc3RyaW5nIH0+LFxuKTogdm9pZCB7XG5cdGNvbnN0IHZhbHVlcyA9IGxvbmdoYW5kcy5tYXAoKHsgbmFtZSB9KSA9PiBlbnRyaWVzLmdldChuYW1lKSk7XG5cdGlmICghdmFsdWVzLmV2ZXJ5KHYgPT4gdiAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGxpc3RzID0gdmFsdWVzLm1hcCh2ID0+IHNwbGl0Q1NTTGlzdCh2IGFzIHN0cmluZykpO1xuXHRjb25zdCBpdGVtQ291bnQgPSBsaXN0c1swXS5sZW5ndGg7XG5cdGlmICghbGlzdHMuZXZlcnkobCA9PiBsLmxlbmd0aCA9PT0gaXRlbUNvdW50KSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGZvciAoY29uc3QgeyBuYW1lIH0gb2YgbG9uZ2hhbmRzKSB7XG5cdFx0ZW50cmllcy5kZWxldGUobmFtZSk7XG5cdH1cblxuXHRjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtQ291bnQ7IGkrKykge1xuXHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGogPSAwOyBqIDwgbG9uZ2hhbmRzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRjb25zdCB2YWwgPSBsaXN0c1tqXVtpXTtcblx0XHRcdGlmICh2YWwgIT09IGxvbmdoYW5kc1tqXS5pbml0aWFsKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2godmFsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aXRlbXMucHVzaChwYXJ0cy5sZW5ndGggPiAwID8gcGFydHMuam9pbignICcpIDogbG9uZ2hhbmRzWzBdLmluaXRpYWwpO1xuXHR9XG5cblx0b3V0cHV0LnB1c2goYCR7c2hvcnRoYW5kfTogJHtpdGVtcy5qb2luKCcsICcpfTtgKTtcbn1cblxuLy8gLS0gTWFpbiBlbnRyeSBwb2ludCAtLVxuXG4vKipcbiAqIENvbGxhcHNlcyByZXNvbHZlZCBjb21wdXRlZCBwcm9wZXJ0aWVzIGludG8gc2hvcnRoYW5kcyB3aGVyZSBwb3NzaWJsZSxcbiAqIHRoZW4gcmV0dXJucyBzb3J0ZWQgQ1NTIGRlY2xhcmF0aW9uIGxpbmVzLiAgRHJpdmVuIGVudGlyZWx5IGJ5IHRoZVxuICogY29uc3RhbnQgc2hvcnRoYW5kIGNvbmZpZ3VyYXRpb24gdGFibGVzIGFib3ZlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29sbGFwc2VUb1Nob3J0aGFuZHMoZW50cmllczogTWFwPHN0cmluZywgc3RyaW5nPik6IHN0cmluZ1tdIHtcblx0Y29uc3Qgc2hvcnRoYW5kTGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0Ly8gMS4gQm94IHNob3J0aGFuZHMgKG1hcmdpbiwgcGFkZGluZywgYm9yZGVyLXJhZGl1cylcblx0Zm9yIChjb25zdCB7IHNob3J0aGFuZCwgc2lkZXMgfSBvZiBib3hTaG9ydGhhbmRzKSB7XG5cdFx0Y29uc3QgY29sbGFwc2VkID0gY29sbGFwc2VCb3hWYWx1ZXMoZW50cmllcywgc2lkZXMpO1xuXHRcdGlmIChjb2xsYXBzZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2hvcnRoYW5kTGluZXMucHVzaChgJHtzaG9ydGhhbmR9OiAke2NvbGxhcHNlZH07YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gMi4gQm9yZGVyOiB0cnkgZnVsbCBgYm9yZGVyOiBXIFMgQ2Agd2hlbiBhbGwgZm91ciBzaWRlcyBhcmUgdW5pZm9ybSxcblx0Ly8gICAgb3RoZXJ3aXNlIGNvbGxhcHNlIGVhY2ggZ3JvdXAgKGJvcmRlci13aWR0aCwgYm9yZGVyLXN0eWxlLCBib3JkZXItY29sb3IpLlxuXHRjb25zdCBib3JkZXJWYWxzID0gYm9yZGVyU2lkZUdyb3Vwcy5tYXAoZyA9PiBnLnNpZGVzLm1hcChzID0+IGVudHJpZXMuZ2V0KHMpKSk7XG5cdGNvbnN0IGhhc0FsbEJvcmRlclByb3BzID0gYm9yZGVyVmFscy5ldmVyeShncm91cCA9PiBncm91cC5ldmVyeSh2ID0+IHYgIT09IHVuZGVmaW5lZCkpO1xuXHRpZiAoaGFzQWxsQm9yZGVyUHJvcHMpIHtcblx0XHRjb25zdCBhbGxVbmlmb3JtID0gYm9yZGVyVmFscy5ldmVyeShncm91cCA9PiBncm91cC5ldmVyeSh2ID0+IHYgPT09IGdyb3VwWzBdKSk7XG5cdFx0aWYgKGFsbFVuaWZvcm0pIHtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgYm9yZGVyU2lkZUdyb3Vwcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNpZGUgb2YgZ3JvdXAuc2lkZXMpIHtcblx0XHRcdFx0XHRlbnRyaWVzLmRlbGV0ZShzaWRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c2hvcnRoYW5kTGluZXMucHVzaChgYm9yZGVyOiAke2JvcmRlclZhbHNbMF1bMF19ICR7Ym9yZGVyVmFsc1sxXVswXX0gJHtib3JkZXJWYWxzWzJdWzBdfTtgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBib3JkZXJTaWRlR3JvdXBzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IGNvbGxhcHNlQm94VmFsdWVzKGVudHJpZXMsIGdyb3VwLnNpZGVzKTtcblx0XHRcdFx0aWYgKGNvbGxhcHNlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c2hvcnRoYW5kTGluZXMucHVzaChgJHtncm91cC5zaG9ydGhhbmR9OiAke2NvbGxhcHNlZH07YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAzLiBEcm9wLXdoZW4tYWxsLWRlZmF1bHQgZ3JvdXBzIChib3JkZXItaW1hZ2UsIGV0Yy4pXG5cdGZvciAoY29uc3QgeyBsb25naGFuZHMgfSBvZiBkcm9wV2hlbkFsbERlZmF1bHQpIHtcblx0XHRjb25zdCBhbGxEZWZhdWx0ID0gT2JqZWN0LmVudHJpZXMobG9uZ2hhbmRzKS5ldmVyeSgoW2ssIHZdKSA9PiBlbnRyaWVzLmdldChrKSA9PT0gdik7XG5cdFx0aWYgKGFsbERlZmF1bHQgJiYgT2JqZWN0LmtleXMobG9uZ2hhbmRzKS5zb21lKGsgPT4gZW50cmllcy5oYXMoaykpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhsb25naGFuZHMpKSB7XG5cdFx0XHRcdGVudHJpZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gNC4gQmFja2dyb3VuZCBjb2xsYXBzZSAoXHUyMTkyIGBiYWNrZ3JvdW5kOiA8Y29sb3I+YCB3aGVuIG90aGVyIHByb3BzIGF0IGRlZmF1bHQpXG5cdHtcblx0XHRjb25zdCB7IGNvbG9yTG9uZ2hhbmQsIG90aGVyTG9uZ2hhbmRzIH0gPSBiYWNrZ3JvdW5kQ29sbGFwc2U7XG5cdFx0Y29uc3QgYmdDb2xvciA9IGVudHJpZXMuZ2V0KGNvbG9yTG9uZ2hhbmQpO1xuXHRcdGNvbnN0IGFsbE90aGVyc0RlZmF1bHQgPSBPYmplY3QuZW50cmllcyhvdGhlckxvbmdoYW5kcykuZXZlcnkoKFtrLCB2XSkgPT4gZW50cmllcy5nZXQoaykgPT09IHYpO1xuXHRcdGlmIChhbGxPdGhlcnNEZWZhdWx0ICYmIGJnQ29sb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cmllcy5kZWxldGUoY29sb3JMb25naGFuZCk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvdGhlckxvbmdoYW5kcykpIHtcblx0XHRcdFx0ZW50cmllcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHRcdHNob3J0aGFuZExpbmVzLnB1c2goYGJhY2tncm91bmQ6ICR7YmdDb2xvcn07YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gNS4gU2ltcGxlIHNob3J0aGFuZHMgKHRleHQtZGVjb3JhdGlvbiwgZXRjLikgXHUyMDE0IGNvbWJpbmUgbG9uZ2hhbmRzLCBvbWl0IGRlZmF1bHRzXG5cdGZvciAoY29uc3QgeyBzaG9ydGhhbmQsIGxvbmdoYW5kcyB9IG9mIHNpbXBsZVNob3J0aGFuZHMpIHtcblx0XHRjb25zdCBmaXJzdCA9IGVudHJpZXMuZ2V0KGxvbmdoYW5kc1swXS5uYW1lKTtcblx0XHRpZiAoZmlyc3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIFNuYXBzaG90IHZhbHVlcyBiZWZvcmUgZGVsZXRpbmdcblx0XHRjb25zdCB2YWx1ZXMgPSBsb25naGFuZHMubWFwKCh7IG5hbWUgfSkgPT4gZW50cmllcy5nZXQobmFtZSkpO1xuXHRcdGZvciAoY29uc3QgeyBuYW1lIH0gb2YgbG9uZ2hhbmRzKSB7XG5cdFx0XHRlbnRyaWVzLmRlbGV0ZShuYW1lKTtcblx0XHR9XG5cdFx0Ly8gQnVpbGQgc2hvcnRoYW5kIHZhbHVlLCBvbWl0dGluZyBsb25naGFuZHMgYXQgdGhlaXIgaW5pdGlhbCB2YWx1ZVxuXHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbG9uZ2hhbmRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB2YWwgPSB2YWx1ZXNbaV0gPz8gbG9uZ2hhbmRzW2ldLmluaXRpYWw7XG5cdFx0XHRpZiAodmFsICE9PSBsb25naGFuZHNbaV0uaW5pdGlhbCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKHZhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNob3J0aGFuZExpbmVzLnB1c2goYCR7c2hvcnRoYW5kfTogJHtwYXJ0cy5sZW5ndGggPiAwID8gcGFydHMuam9pbignICcpIDogbG9uZ2hhbmRzWzBdLmluaXRpYWx9O2ApO1xuXHR9XG5cblx0Ly8gNi4gd2hpdGUtc3BhY2UgKENTUyBUZXh0IDQpIFx1MjAxNCBtYXAgbG9uZ2hhbmQgcGFpciB0byBuYW1lZCBrZXl3b3JkXG5cdHtcblx0XHRjb25zdCB3c0NvbGxhcHNlID0gZW50cmllcy5nZXQoJ3doaXRlLXNwYWNlLWNvbGxhcHNlJyk7XG5cdFx0Y29uc3QgdGV4dFdyYXAgPSBlbnRyaWVzLmdldCgndGV4dC13cmFwLW1vZGUnKTtcblx0XHRpZiAod3NDb2xsYXBzZSAhPT0gdW5kZWZpbmVkICYmIHRleHRXcmFwICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGVudHJpZXMuZGVsZXRlKCd3aGl0ZS1zcGFjZS1jb2xsYXBzZScpO1xuXHRcdFx0ZW50cmllcy5kZWxldGUoJ3RleHQtd3JhcC1tb2RlJyk7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHdoaXRlU3BhY2VLZXl3b3Jkcy5maW5kKGsgPT4gay5jb2xsYXBzZSA9PT0gd3NDb2xsYXBzZSAmJiBrLndyYXAgPT09IHRleHRXcmFwKTtcblx0XHRcdHNob3J0aGFuZExpbmVzLnB1c2goYHdoaXRlLXNwYWNlOiAke21hdGNoID8gbWF0Y2gua2V5d29yZCA6IGAke3dzQ29sbGFwc2V9ICR7dGV4dFdyYXB9YH07YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gNy4gQ29tbWEtc2VwYXJhdGVkIGxpc3Qgc2hvcnRoYW5kcyAodHJhbnNpdGlvbiwgYW5pbWF0aW9uKVxuXHRmb3IgKGNvbnN0IHsgc2hvcnRoYW5kLCBsb25naGFuZHMgfSBvZiBsaXN0U2hvcnRoYW5kcykge1xuXHRcdGNvbGxhcHNlTGlzdFNob3J0aGFuZChlbnRyaWVzLCBzaG9ydGhhbmRMaW5lcywgc2hvcnRoYW5kLCBsb25naGFuZHMpO1xuXHR9XG5cblx0Ly8gOC4gUmVtYWluaW5nIHByb3BlcnRpZXMgYXMgaW5kaXZpZHVhbCBsaW5lcywgc29ydGVkXG5cdGNvbnN0IHJlbWFpbmluZ0xpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgQXJyYXkuZnJvbShlbnRyaWVzLmVudHJpZXMoKSkuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpIHtcblx0XHRyZW1haW5pbmdMaW5lcy5wdXNoKGAke25hbWV9OiAke3ZhbHVlfTtgKTtcblx0fVxuXG5cdHJldHVybiBbLi4uc2hvcnRoYW5kTGluZXMsIC4uLnJlbWFpbmluZ0xpbmVzXTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQTJEQSxNQUFNLDJCQUEyQixvQkFBSSxJQUFJO0FBQUEsRUFD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
