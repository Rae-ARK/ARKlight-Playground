import { localize } from "../../../../nls.js";
import { deepClone } from "../../../../base/common/objects.js";
import { badgeBackground, chartsBlue, chartsPurple, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { asCssVariable, registerColor } from "../../../../platform/theme/common/colorUtils.js";
import { SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from "../common/history.js";
import { rot } from "../../../../base/common/numbers.js";
import { $, svgElem } from "../../../../base/browser/dom.js";
import { PANEL_BACKGROUND } from "../../../common/theme.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isEmptyMarkdownString, isMarkdownString, MarkdownString } from "../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { findLastIdx } from "../../../../base/common/arraysFind.js";
const SWIMLANE_HEIGHT = 22;
const SWIMLANE_WIDTH = 11;
const SWIMLANE_CURVE_RADIUS = 5;
const CIRCLE_RADIUS = 4;
const CIRCLE_STROKE_WIDTH = 2;
const historyItemRefColor = registerColor("scmGraph.historyItemRefColor", chartsBlue, localize("scmGraphHistoryItemRefColor", "History item reference color."));
const historyItemRemoteRefColor = registerColor("scmGraph.historyItemRemoteRefColor", chartsPurple, localize("scmGraphHistoryItemRemoteRefColor", "History item remote reference color."));
const historyItemBaseRefColor = registerColor("scmGraph.historyItemBaseRefColor", "#EA5C00", localize("scmGraphHistoryItemBaseRefColor", "History item base reference color."));
const historyItemHoverDefaultLabelForeground = registerColor("scmGraph.historyItemHoverDefaultLabelForeground", foreground, localize("scmGraphHistoryItemHoverDefaultLabelForeground", "History item hover default label foreground color."));
const historyItemHoverDefaultLabelBackground = registerColor("scmGraph.historyItemHoverDefaultLabelBackground", badgeBackground, localize("scmGraphHistoryItemHoverDefaultLabelBackground", "History item hover default label background color."));
const historyItemHoverLabelForeground = registerColor("scmGraph.historyItemHoverLabelForeground", PANEL_BACKGROUND, localize("scmGraphHistoryItemHoverLabelForeground", "History item hover label foreground color."));
const historyItemHoverAdditionsForeground = registerColor("scmGraph.historyItemHoverAdditionsForeground", { light: "#587C0C", dark: "#81B88B", hcDark: "#A1E3AD", hcLight: "#374E06" }, localize("scmGraph.HistoryItemHoverAdditionsForeground", "History item hover additions foreground color."));
const historyItemHoverDeletionsForeground = registerColor("scmGraph.historyItemHoverDeletionsForeground", { light: "#AD0707", dark: "#C74E39", hcDark: "#C74E39", hcLight: "#AD0707" }, localize("scmGraph.HistoryItemHoverDeletionsForeground", "History item hover deletions foreground color."));
const colorRegistry = [
  registerColor("scmGraph.foreground1", "#FFB000", localize("scmGraphForeground1", "Source control graph foreground color (1).")),
  registerColor("scmGraph.foreground2", "#DC267F", localize("scmGraphForeground2", "Source control graph foreground color (2).")),
  registerColor("scmGraph.foreground3", "#994F00", localize("scmGraphForeground3", "Source control graph foreground color (3).")),
  registerColor("scmGraph.foreground4", "#40B0A6", localize("scmGraphForeground4", "Source control graph foreground color (4).")),
  registerColor("scmGraph.foreground5", "#B66DFF", localize("scmGraphForeground5", "Source control graph foreground color (5)."))
];
function getLabelColorIdentifier(historyItem, colorMap) {
  if (historyItem.id === SCMIncomingHistoryItemId) {
    return historyItemRemoteRefColor;
  } else if (historyItem.id === SCMOutgoingHistoryItemId) {
    return historyItemRefColor;
  } else {
    for (const ref of historyItem.references ?? []) {
      const colorIdentifier = colorMap.get(ref.id);
      if (colorIdentifier !== void 0) {
        return colorIdentifier;
      }
    }
  }
  return void 0;
}
function createPath(colorIdentifier, strokeWidth = 1) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", `${strokeWidth}px`);
  path.setAttribute("stroke-linecap", "round");
  path.style.stroke = asCssVariable(colorIdentifier);
  return path;
}
function drawCircle(index, radius, strokeWidth, colorIdentifier) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", `${SWIMLANE_WIDTH * (index + 1)}`);
  circle.setAttribute("cy", `${SWIMLANE_WIDTH}`);
  circle.setAttribute("r", `${radius}`);
  circle.style.strokeWidth = `${strokeWidth}px`;
  if (colorIdentifier) {
    circle.style.fill = asCssVariable(colorIdentifier);
  }
  return circle;
}
function drawDashedCircle(index, radius, strokeWidth, colorIdentifier) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", `${SWIMLANE_WIDTH * (index + 1)}`);
  circle.setAttribute("cy", `${SWIMLANE_WIDTH}`);
  circle.setAttribute("r", `${CIRCLE_RADIUS + 1}`);
  circle.style.stroke = asCssVariable(colorIdentifier);
  circle.style.strokeWidth = `${strokeWidth}px`;
  circle.style.strokeDasharray = "4,2";
  return circle;
}
function drawVerticalLine(x1, y1, y2, color, strokeWidth = 1) {
  const path = createPath(color, strokeWidth);
  path.setAttribute("d", `M ${x1} ${y1} V ${y2}`);
  return path;
}
function findLastIndex(nodes, id) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].id === id) {
      return i;
    }
  }
  return -1;
}
function renderSCMHistoryItemGraph(historyItemViewModel) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("graph");
  const historyItem = historyItemViewModel.historyItem;
  const inputSwimlanes = historyItemViewModel.inputSwimlanes;
  const outputSwimlanes = historyItemViewModel.outputSwimlanes;
  const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id);
  const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
  const circleColor = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color : circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemRefColor;
  let outputSwimlaneIndex = 0;
  for (let index = 0; index < inputSwimlanes.length; index++) {
    const color = inputSwimlanes[index].color;
    if (inputSwimlanes[index].id === historyItem.id) {
      if (index !== circleIndex) {
        const d = [];
        const path = createPath(color);
        d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
        d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * index} ${SWIMLANE_WIDTH}`);
        d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);
        path.setAttribute("d", d.join(" "));
        svg.append(path);
      } else {
        outputSwimlaneIndex++;
      }
    } else {
      if (outputSwimlaneIndex < outputSwimlanes.length && inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIndex].id) {
        if (index === outputSwimlaneIndex) {
          const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, color);
          svg.append(path);
        } else {
          const d = [];
          const path = createPath(color);
          d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
          d.push(`V 6`);
          d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${SWIMLANE_WIDTH * (index + 1) - SWIMLANE_CURVE_RADIUS} ${SWIMLANE_HEIGHT / 2}`);
          d.push(`H ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1) + SWIMLANE_CURVE_RADIUS}`);
          d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)} ${SWIMLANE_HEIGHT / 2 + SWIMLANE_CURVE_RADIUS}`);
          d.push(`V ${SWIMLANE_HEIGHT}`);
          path.setAttribute("d", d.join(" "));
          svg.append(path);
        }
        outputSwimlaneIndex++;
      }
    }
  }
  for (let i = 1; i < historyItem.parentIds.length; i++) {
    const parentOutputIndex = findLastIndex(outputSwimlanes, historyItem.parentIds[i]);
    if (parentOutputIndex === -1) {
      continue;
    }
    const d = [];
    const path = createPath(outputSwimlanes[parentOutputIndex].color);
    d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
    d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (parentOutputIndex + 1)} ${SWIMLANE_HEIGHT}`);
    d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
    d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)} `);
    path.setAttribute("d", d.join(" "));
    svg.append(path);
  }
  if (inputIndex !== -1) {
    const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, inputSwimlanes[inputIndex].color);
    svg.append(path);
  }
  if (historyItem.parentIds.length > 0) {
    const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), SWIMLANE_HEIGHT / 2, SWIMLANE_HEIGHT, circleColor);
    svg.append(path);
  }
  if (historyItemViewModel.kind === "HEAD") {
    const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
    svg.append(outerCircle);
    const innerCircle = drawCircle(circleIndex, CIRCLE_STROKE_WIDTH, CIRCLE_RADIUS);
    svg.append(innerCircle);
  } else if (historyItemViewModel.kind === "incoming-changes" || historyItemViewModel.kind === "outgoing-changes") {
    const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
    svg.append(outerCircle);
    const innerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH + 1);
    svg.append(innerCircle);
    const dashedCircle = drawDashedCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH - 1, circleColor);
    svg.append(dashedCircle);
  } else {
    if (historyItem.parentIds.length > 1) {
      const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 2, CIRCLE_STROKE_WIDTH, circleColor);
      svg.append(circleOuter);
      const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, CIRCLE_STROKE_WIDTH, circleColor);
      svg.append(circleInner);
    } else {
      const circle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH, circleColor);
      svg.append(circle);
    }
  }
  svg.style.height = `${SWIMLANE_HEIGHT}px`;
  svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;
  return svg;
}
function renderSCMHistoryGraphPlaceholder(columns, highlightIndex) {
  const elements = svgElem("svg", {
    style: { height: `${SWIMLANE_HEIGHT}px`, width: `${SWIMLANE_WIDTH * (columns.length + 1)}px` }
  });
  for (let index = 0; index < columns.length; index++) {
    const strokeWidth = index === highlightIndex ? 3 : 1;
    const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, columns[index].color, strokeWidth);
    elements.root.append(path);
  }
  return elements.root;
}
function toISCMHistoryItemViewModelArray(historyItems, colorMap = /* @__PURE__ */ new Map(), currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef, addIncomingChanges, addOutgoingChanges, mergeBase) {
  let colorIndex = -1;
  const viewModels = [];
  for (let index = 0; index < historyItems.length; index++) {
    const historyItem = historyItems[index];
    const kind = historyItem.id === currentHistoryItemRef?.revision ? "HEAD" : "node";
    const outputSwimlanesFromPreviousItem = viewModels.at(-1)?.outputSwimlanes ?? [];
    const inputSwimlanes = outputSwimlanesFromPreviousItem.map((i) => deepClone(i));
    const outputSwimlanes = [];
    let firstParentAdded = false;
    if (historyItem.parentIds.length > 0) {
      for (const node of inputSwimlanes) {
        if (node.id === historyItem.id) {
          if (!firstParentAdded) {
            outputSwimlanes.push({
              id: historyItem.parentIds[0],
              color: getLabelColorIdentifier(historyItem, colorMap) ?? node.color
            });
            firstParentAdded = true;
          }
          continue;
        }
        outputSwimlanes.push(deepClone(node));
      }
    }
    for (let i = firstParentAdded ? 1 : 0; i < historyItem.parentIds.length; i++) {
      let colorIdentifier;
      if (i === 0) {
        colorIdentifier = getLabelColorIdentifier(historyItem, colorMap);
      } else {
        const historyItemParent = historyItems.find((h) => h.id === historyItem.parentIds[i]);
        colorIdentifier = historyItemParent ? getLabelColorIdentifier(historyItemParent, colorMap) : void 0;
      }
      if (!colorIdentifier) {
        colorIndex = rot(colorIndex + 1, colorRegistry.length);
        colorIdentifier = colorRegistry[colorIndex];
      }
      outputSwimlanes.push({
        id: historyItem.parentIds[i],
        color: colorIdentifier
      });
    }
    const references = (historyItem.references ?? []).map((ref) => {
      let color = colorMap.get(ref.id);
      if (colorMap.has(ref.id) && color === void 0) {
        const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id);
        const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
        color = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color : circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemRefColor;
      }
      return { ...ref, color };
    });
    references.sort((ref1, ref2) => compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef));
    viewModels.push({
      historyItem: {
        ...historyItem,
        references
      },
      kind,
      inputSwimlanes,
      outputSwimlanes
    });
  }
  addIncomingOutgoingChangesHistoryItems(
    viewModels,
    currentHistoryItemRef,
    currentHistoryItemRemoteRef,
    addIncomingChanges,
    addOutgoingChanges,
    mergeBase
  );
  return viewModels;
}
function getHistoryItemIndex(historyItemViewModel) {
  const historyItem = historyItemViewModel.historyItem;
  const inputSwimlanes = historyItemViewModel.inputSwimlanes;
  const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id);
  return inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
}
function addIncomingOutgoingChangesHistoryItems(viewModels, currentHistoryItemRef, currentHistoryItemRemoteRef, addIncomingChanges, addOutgoingChanges, mergeBase) {
  if (currentHistoryItemRef?.revision !== currentHistoryItemRemoteRef?.revision && mergeBase) {
    if (addIncomingChanges && currentHistoryItemRemoteRef && currentHistoryItemRemoteRef.revision !== mergeBase) {
      const beforeHistoryItemIndex = findLastIdx(viewModels, (vm) => vm.outputSwimlanes.some((node) => node.id === mergeBase));
      const afterHistoryItemIndex = viewModels.findIndex((vm) => vm.historyItem.id === mergeBase);
      if (beforeHistoryItemIndex !== -1 && afterHistoryItemIndex !== -1) {
        const incomingChangeMerged = viewModels[beforeHistoryItemIndex].historyItem.parentIds.length === 2 && viewModels[beforeHistoryItemIndex].historyItem.parentIds.includes(mergeBase);
        if (!incomingChangeMerged) {
          viewModels[beforeHistoryItemIndex] = {
            ...viewModels[beforeHistoryItemIndex],
            inputSwimlanes: viewModels[beforeHistoryItemIndex].inputSwimlanes.map((node) => {
              return node.id === mergeBase && node.color === historyItemRemoteRefColor ? { ...node, id: SCMIncomingHistoryItemId } : node;
            }),
            outputSwimlanes: viewModels[beforeHistoryItemIndex].outputSwimlanes.map((node) => {
              return node.id === mergeBase && node.color === historyItemRemoteRefColor ? { ...node, id: SCMIncomingHistoryItemId } : node;
            })
          };
          const inputSwimlanes = viewModels[beforeHistoryItemIndex].outputSwimlanes.map((i) => deepClone(i));
          const outputSwimlanes = viewModels[afterHistoryItemIndex].inputSwimlanes.map((i) => deepClone(i));
          const displayIdLength = viewModels[0].historyItem.displayId?.length ?? 0;
          const incomingChangesHistoryItem = {
            id: SCMIncomingHistoryItemId,
            displayId: "0".repeat(displayIdLength),
            parentIds: [mergeBase],
            author: currentHistoryItemRemoteRef?.name,
            subject: localize("incomingChanges", "Incoming Changes"),
            message: ""
          };
          viewModels.splice(afterHistoryItemIndex, 0, {
            historyItem: incomingChangesHistoryItem,
            kind: "incoming-changes",
            inputSwimlanes,
            outputSwimlanes
          });
        }
      }
    }
    if (addOutgoingChanges && currentHistoryItemRef?.revision && currentHistoryItemRef.revision !== mergeBase) {
      const currentHistoryItemRefIndex = viewModels.findIndex((vm) => vm.kind === "HEAD" && vm.historyItem.id === currentHistoryItemRef.revision);
      if (currentHistoryItemRefIndex !== -1) {
        const outgoingChangesHistoryItem = {
          id: SCMOutgoingHistoryItemId,
          displayId: viewModels[0].historyItem.displayId ? "0".repeat(viewModels[0].historyItem.displayId.length) : void 0,
          parentIds: [currentHistoryItemRef.revision],
          author: currentHistoryItemRef?.name,
          subject: localize("outgoingChanges", "Outgoing Changes"),
          message: ""
        };
        const inputSwimlanes = viewModels[currentHistoryItemRefIndex].inputSwimlanes.slice(0);
        const outputSwimlanes = inputSwimlanes.slice(0).concat({
          id: currentHistoryItemRef.revision,
          color: historyItemRefColor
        });
        viewModels.splice(currentHistoryItemRefIndex, 0, {
          historyItem: outgoingChangesHistoryItem,
          kind: "outgoing-changes",
          inputSwimlanes,
          outputSwimlanes
        });
        viewModels[currentHistoryItemRefIndex + 1].inputSwimlanes.push({
          id: currentHistoryItemRef.revision,
          color: historyItemRefColor
        });
      }
    }
  }
}
function compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef) {
  const getHistoryItemRefOrder = (ref) => {
    if (ref.id === currentHistoryItemRef?.id) {
      return 1;
    } else if (ref.id === currentHistoryItemRemoteRef?.id) {
      return 2;
    } else if (ref.id === currentHistoryItemBaseRef?.id) {
      return 3;
    } else if (ref.color !== void 0) {
      return 4;
    }
    return 99;
  };
  const ref1Order = getHistoryItemRefOrder(ref1);
  const ref2Order = getHistoryItemRefOrder(ref2);
  return ref1Order - ref2Order;
}
function toHistoryItemHoverContent(markdownRendererService, historyItem, includeReferences) {
  const disposables = new DisposableStore();
  if (historyItem.tooltip === void 0) {
    return { content: historyItem.message, disposables };
  }
  if (isMarkdownString(historyItem.tooltip)) {
    return { content: historyItem.tooltip, disposables };
  }
  const tooltipSections = historyItem.tooltip.slice();
  if (includeReferences && historyItem.references?.length) {
    const markdownString = new MarkdownString("", { supportHtml: true, supportThemeIcons: true });
    for (const reference of historyItem.references) {
      const labelIconId = ThemeIcon.isThemeIcon(reference.icon) ? reference.icon.id : "";
      const labelBackgroundColor = reference.color ? asCssVariable(reference.color) : asCssVariable(historyItemHoverDefaultLabelBackground);
      const labelForegroundColor = reference.color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(historyItemHoverDefaultLabelForeground);
      markdownString.appendMarkdown(`<span style="color:${labelForegroundColor};background-color:${labelBackgroundColor};border-radius:10px;">&nbsp;$(${labelIconId})&nbsp;`);
      markdownString.appendText(reference.name);
      markdownString.appendMarkdown("&nbsp;&nbsp;</span>");
    }
    markdownString.appendMarkdown(`

---

`);
    tooltipSections.splice(tooltipSections.length - 1, 0, markdownString);
  }
  const hoverContainer = $(".history-item-hover-container");
  for (const markdownString of tooltipSections) {
    if (isEmptyMarkdownString(markdownString)) {
      continue;
    }
    const renderedContent = markdownRendererService.render(markdownString);
    hoverContainer.appendChild(renderedContent.element);
    disposables.add(renderedContent);
  }
  return { content: hoverContainer, disposables };
}
export {
  SWIMLANE_HEIGHT,
  SWIMLANE_WIDTH,
  colorRegistry,
  compareHistoryItemRefs,
  getHistoryItemIndex,
  historyItemBaseRefColor,
  historyItemHoverAdditionsForeground,
  historyItemHoverDefaultLabelBackground,
  historyItemHoverDefaultLabelForeground,
  historyItemHoverDeletionsForeground,
  historyItemHoverLabelForeground,
  historyItemRefColor,
  historyItemRemoteRefColor,
  renderSCMHistoryGraphPlaceholder,
  renderSCMHistoryItemGraph,
  toHistoryItemHoverContent,
  toISCMHistoryItemViewModelArray
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbUhpc3RvcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGJhZGdlQmFja2dyb3VuZCwgY2hhcnRzQmx1ZSwgY2hhcnRzUHVycGxlLCBmb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgQ29sb3JJZGVudGlmaWVyLCByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSVNDTUhpc3RvcnlJdGVtLCBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGUsIElTQ01IaXN0b3J5SXRlbVJlZiwgSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsLCBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQsIFNDTU91dGdvaW5nSGlzdG9yeUl0ZW1JZCB9IGZyb20gJy4uL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IHJvdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgJCwgc3ZnRWxlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNFbXB0eU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZmluZExhc3RJZHggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcblxuZXhwb3J0IGNvbnN0IFNXSU1MQU5FX0hFSUdIVCA9IDIyO1xuZXhwb3J0IGNvbnN0IFNXSU1MQU5FX1dJRFRIID0gMTE7XG5jb25zdCBTV0lNTEFORV9DVVJWRV9SQURJVVMgPSA1O1xuY29uc3QgQ0lSQ0xFX1JBRElVUyA9IDQ7XG5jb25zdCBDSVJDTEVfU1RST0tFX1dJRFRIID0gMjtcblxuLyoqXG4gKiBIaXN0b3J5IGl0ZW0gcmVmZXJlbmNlIGNvbG9ycyAobG9jYWwsIHJlbW90ZSwgYmFzZSlcbiAqL1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtUmVmQ29sb3IgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbVJlZkNvbG9yJywgY2hhcnRzQmx1ZSwgbG9jYWxpemUoJ3NjbUdyYXBoSGlzdG9yeUl0ZW1SZWZDb2xvcicsIFwiSGlzdG9yeSBpdGVtIHJlZmVyZW5jZSBjb2xvci5cIikpO1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmQ29sb3IgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbVJlbW90ZVJlZkNvbG9yJywgY2hhcnRzUHVycGxlLCBsb2NhbGl6ZSgnc2NtR3JhcGhIaXN0b3J5SXRlbVJlbW90ZVJlZkNvbG9yJywgXCJIaXN0b3J5IGl0ZW0gcmVtb3RlIHJlZmVyZW5jZSBjb2xvci5cIikpO1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtQmFzZVJlZkNvbG9yID0gcmVnaXN0ZXJDb2xvcignc2NtR3JhcGguaGlzdG9yeUl0ZW1CYXNlUmVmQ29sb3InLCAnI0VBNUMwMCcsIGxvY2FsaXplKCdzY21HcmFwaEhpc3RvcnlJdGVtQmFzZVJlZkNvbG9yJywgXCJIaXN0b3J5IGl0ZW0gYmFzZSByZWZlcmVuY2UgY29sb3IuXCIpKTtcblxuLyoqXG4gKiBIaXN0b3J5IGl0ZW0gaG92ZXIgY29sb3JcbiAqL1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignc2NtR3JhcGguaGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEZvcmVncm91bmQnLCBmb3JlZ3JvdW5kLCBsb2NhbGl6ZSgnc2NtR3JhcGhIaXN0b3J5SXRlbUhvdmVyRGVmYXVsdExhYmVsRm9yZWdyb3VuZCcsIFwiSGlzdG9yeSBpdGVtIGhvdmVyIGRlZmF1bHQgbGFiZWwgZm9yZWdyb3VuZCBjb2xvci5cIikpO1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignc2NtR3JhcGguaGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEJhY2tncm91bmQnLCBiYWRnZUJhY2tncm91bmQsIGxvY2FsaXplKCdzY21HcmFwaEhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxCYWNrZ3JvdW5kJywgXCJIaXN0b3J5IGl0ZW0gaG92ZXIgZGVmYXVsdCBsYWJlbCBiYWNrZ3JvdW5kIGNvbG9yLlwiKSk7XG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1Ib3ZlckxhYmVsRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmhpc3RvcnlJdGVtSG92ZXJMYWJlbEZvcmVncm91bmQnLCBQQU5FTF9CQUNLR1JPVU5ELCBsb2NhbGl6ZSgnc2NtR3JhcGhIaXN0b3J5SXRlbUhvdmVyTGFiZWxGb3JlZ3JvdW5kJywgXCJIaXN0b3J5IGl0ZW0gaG92ZXIgbGFiZWwgZm9yZWdyb3VuZCBjb2xvci5cIikpO1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtSG92ZXJBZGRpdGlvbnNGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignc2NtR3JhcGguaGlzdG9yeUl0ZW1Ib3ZlckFkZGl0aW9uc0ZvcmVncm91bmQnLCB7IGxpZ2h0OiAnIzU4N0MwQycsIGRhcms6ICcjODFCODhCJywgaGNEYXJrOiAnI0ExRTNBRCcsIGhjTGlnaHQ6ICcjMzc0RTA2JyB9LCBsb2NhbGl6ZSgnc2NtR3JhcGguSGlzdG9yeUl0ZW1Ib3ZlckFkZGl0aW9uc0ZvcmVncm91bmQnLCBcIkhpc3RvcnkgaXRlbSBob3ZlciBhZGRpdGlvbnMgZm9yZWdyb3VuZCBjb2xvci5cIikpO1xuZXhwb3J0IGNvbnN0IGhpc3RvcnlJdGVtSG92ZXJEZWxldGlvbnNGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignc2NtR3JhcGguaGlzdG9yeUl0ZW1Ib3ZlckRlbGV0aW9uc0ZvcmVncm91bmQnLCB7IGxpZ2h0OiAnI0FEMDcwNycsIGRhcms6ICcjQzc0RTM5JywgaGNEYXJrOiAnI0M3NEUzOScsIGhjTGlnaHQ6ICcjQUQwNzA3JyB9LCBsb2NhbGl6ZSgnc2NtR3JhcGguSGlzdG9yeUl0ZW1Ib3ZlckRlbGV0aW9uc0ZvcmVncm91bmQnLCBcIkhpc3RvcnkgaXRlbSBob3ZlciBkZWxldGlvbnMgZm9yZWdyb3VuZCBjb2xvci5cIikpO1xuXG4vKipcbiAqIEhpc3RvcnkgZ3JhcGggY29sb3IgcmVnaXN0cnlcbiAqL1xuZXhwb3J0IGNvbnN0IGNvbG9yUmVnaXN0cnk6IENvbG9ySWRlbnRpZmllcltdID0gW1xuXHRyZWdpc3RlckNvbG9yKCdzY21HcmFwaC5mb3JlZ3JvdW5kMScsICcjRkZCMDAwJywgbG9jYWxpemUoJ3NjbUdyYXBoRm9yZWdyb3VuZDEnLCBcIlNvdXJjZSBjb250cm9sIGdyYXBoIGZvcmVncm91bmQgY29sb3IgKDEpLlwiKSksXG5cdHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmZvcmVncm91bmQyJywgJyNEQzI2N0YnLCBsb2NhbGl6ZSgnc2NtR3JhcGhGb3JlZ3JvdW5kMicsIFwiU291cmNlIGNvbnRyb2wgZ3JhcGggZm9yZWdyb3VuZCBjb2xvciAoMikuXCIpKSxcblx0cmVnaXN0ZXJDb2xvcignc2NtR3JhcGguZm9yZWdyb3VuZDMnLCAnIzk5NEYwMCcsIGxvY2FsaXplKCdzY21HcmFwaEZvcmVncm91bmQzJywgXCJTb3VyY2UgY29udHJvbCBncmFwaCBmb3JlZ3JvdW5kIGNvbG9yICgzKS5cIikpLFxuXHRyZWdpc3RlckNvbG9yKCdzY21HcmFwaC5mb3JlZ3JvdW5kNCcsICcjNDBCMEE2JywgbG9jYWxpemUoJ3NjbUdyYXBoRm9yZWdyb3VuZDQnLCBcIlNvdXJjZSBjb250cm9sIGdyYXBoIGZvcmVncm91bmQgY29sb3IgKDQpLlwiKSksXG5cdHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmZvcmVncm91bmQ1JywgJyNCNjZERkYnLCBsb2NhbGl6ZSgnc2NtR3JhcGhGb3JlZ3JvdW5kNScsIFwiU291cmNlIGNvbnRyb2wgZ3JhcGggZm9yZWdyb3VuZCBjb2xvciAoNSkuXCIpKSxcbl07XG5cbmZ1bmN0aW9uIGdldExhYmVsQ29sb3JJZGVudGlmaWVyKGhpc3RvcnlJdGVtOiBJU0NNSGlzdG9yeUl0ZW0sIGNvbG9yTWFwOiBNYXA8c3RyaW5nLCBDb2xvcklkZW50aWZpZXIgfCB1bmRlZmluZWQ+KTogQ29sb3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKGhpc3RvcnlJdGVtLmlkID09PSBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRyZXR1cm4gaGlzdG9yeUl0ZW1SZW1vdGVSZWZDb2xvcjtcblx0fSBlbHNlIGlmIChoaXN0b3J5SXRlbS5pZCA9PT0gU0NNT3V0Z29pbmdIaXN0b3J5SXRlbUlkKSB7XG5cdFx0cmV0dXJuIGhpc3RvcnlJdGVtUmVmQ29sb3I7XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcyA/PyBbXSkge1xuXHRcdFx0Y29uc3QgY29sb3JJZGVudGlmaWVyID0gY29sb3JNYXAuZ2V0KHJlZi5pZCk7XG5cdFx0XHRpZiAoY29sb3JJZGVudGlmaWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbG9ySWRlbnRpZmllcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQYXRoKGNvbG9ySWRlbnRpZmllcjogc3RyaW5nLCBzdHJva2VXaWR0aCA9IDEpOiBTVkdQYXRoRWxlbWVudCB7XG5cdGNvbnN0IHBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3BhdGgnKTtcblx0cGF0aC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnbm9uZScpO1xuXHRwYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgYCR7c3Ryb2tlV2lkdGh9cHhgKTtcblx0cGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1saW5lY2FwJywgJ3JvdW5kJyk7XG5cdHBhdGguc3R5bGUuc3Ryb2tlID0gYXNDc3NWYXJpYWJsZShjb2xvcklkZW50aWZpZXIpO1xuXG5cdHJldHVybiBwYXRoO1xufVxuXG5mdW5jdGlvbiBkcmF3Q2lyY2xlKGluZGV4OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCBzdHJva2VXaWR0aDogbnVtYmVyLCBjb2xvcklkZW50aWZpZXI/OiBzdHJpbmcpOiBTVkdDaXJjbGVFbGVtZW50IHtcblx0Y29uc3QgY2lyY2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdjaXJjbGUnKTtcblx0Y2lyY2xlLnNldEF0dHJpYnV0ZSgnY3gnLCBgJHtTV0lNTEFORV9XSURUSCAqIChpbmRleCArIDEpfWApO1xuXHRjaXJjbGUuc2V0QXR0cmlidXRlKCdjeScsIGAke1NXSU1MQU5FX1dJRFRIfWApO1xuXHRjaXJjbGUuc2V0QXR0cmlidXRlKCdyJywgYCR7cmFkaXVzfWApO1xuXG5cdGNpcmNsZS5zdHlsZS5zdHJva2VXaWR0aCA9IGAke3N0cm9rZVdpZHRofXB4YDtcblx0aWYgKGNvbG9ySWRlbnRpZmllcikge1xuXHRcdGNpcmNsZS5zdHlsZS5maWxsID0gYXNDc3NWYXJpYWJsZShjb2xvcklkZW50aWZpZXIpO1xuXHR9XG5cblx0cmV0dXJuIGNpcmNsZTtcbn1cblxuZnVuY3Rpb24gZHJhd0Rhc2hlZENpcmNsZShpbmRleDogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgc3Ryb2tlV2lkdGg6IG51bWJlciwgY29sb3JJZGVudGlmaWVyOiBzdHJpbmcpOiBTVkdDaXJjbGVFbGVtZW50IHtcblx0Y29uc3QgY2lyY2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdjaXJjbGUnKTtcblx0Y2lyY2xlLnNldEF0dHJpYnV0ZSgnY3gnLCBgJHtTV0lNTEFORV9XSURUSCAqIChpbmRleCArIDEpfWApO1xuXHRjaXJjbGUuc2V0QXR0cmlidXRlKCdjeScsIGAke1NXSU1MQU5FX1dJRFRIfWApO1xuXHRjaXJjbGUuc2V0QXR0cmlidXRlKCdyJywgYCR7Q0lSQ0xFX1JBRElVUyArIDF9YCk7XG5cblx0Y2lyY2xlLnN0eWxlLnN0cm9rZSA9IGFzQ3NzVmFyaWFibGUoY29sb3JJZGVudGlmaWVyKTtcblx0Y2lyY2xlLnN0eWxlLnN0cm9rZVdpZHRoID0gYCR7c3Ryb2tlV2lkdGh9cHhgO1xuXHRjaXJjbGUuc3R5bGUuc3Ryb2tlRGFzaGFycmF5ID0gJzQsMic7XG5cblx0cmV0dXJuIGNpcmNsZTtcbn1cblxuZnVuY3Rpb24gZHJhd1ZlcnRpY2FsTGluZSh4MTogbnVtYmVyLCB5MTogbnVtYmVyLCB5MjogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBzdHJva2VXaWR0aCA9IDEpOiBTVkdQYXRoRWxlbWVudCB7XG5cdGNvbnN0IHBhdGggPSBjcmVhdGVQYXRoKGNvbG9yLCBzdHJva2VXaWR0aCk7XG5cdHBhdGguc2V0QXR0cmlidXRlKCdkJywgYE0gJHt4MX0gJHt5MX0gViAke3kyfWApO1xuXG5cdHJldHVybiBwYXRoO1xufVxuXG5mdW5jdGlvbiBmaW5kTGFzdEluZGV4KG5vZGVzOiBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGVbXSwgaWQ6IHN0cmluZyk6IG51bWJlciB7XG5cdGZvciAobGV0IGkgPSBub2Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGlmIChub2Rlc1tpXS5pZCA9PT0gaWQpIHtcblx0XHRcdHJldHVybiBpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiAtMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclNDTUhpc3RvcnlJdGVtR3JhcGgoaGlzdG9yeUl0ZW1WaWV3TW9kZWw6IElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbCk6IFNWR0VsZW1lbnQge1xuXHRjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuXHRzdmcuY2xhc3NMaXN0LmFkZCgnZ3JhcGgnKTtcblxuXHRjb25zdCBoaXN0b3J5SXRlbSA9IGhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXHRjb25zdCBpbnB1dFN3aW1sYW5lcyA9IGhpc3RvcnlJdGVtVmlld01vZGVsLmlucHV0U3dpbWxhbmVzO1xuXHRjb25zdCBvdXRwdXRTd2ltbGFuZXMgPSBoaXN0b3J5SXRlbVZpZXdNb2RlbC5vdXRwdXRTd2ltbGFuZXM7XG5cblx0Ly8gRmluZCB0aGUgaGlzdG9yeSBpdGVtIGluIHRoZSBpbnB1dCBzd2ltbGFuZXNcblx0Y29uc3QgaW5wdXRJbmRleCA9IGlucHV0U3dpbWxhbmVzLmZpbmRJbmRleChub2RlID0+IG5vZGUuaWQgPT09IGhpc3RvcnlJdGVtLmlkKTtcblxuXHQvLyBDaXJjbGUgaW5kZXggLSB1c2UgdGhlIGlucHV0IHN3aW1sYW5lIGluZGV4IGlmIHByZXNlbnQsIG90aGVyd2lzZSBhZGQgaXQgdG8gdGhlIGVuZFxuXHRjb25zdCBjaXJjbGVJbmRleCA9IGlucHV0SW5kZXggIT09IC0xID8gaW5wdXRJbmRleCA6IGlucHV0U3dpbWxhbmVzLmxlbmd0aDtcblxuXHQvLyBDaXJjbGUgY29sb3IgLSB1c2UgdGhlIG91dHB1dCBzd2ltbGFuZSBjb2xvciBpZiBwcmVzZW50LCBvdGhlcndpc2UgdGhlIGlucHV0IHN3aW1sYW5lIGNvbG9yXG5cdGNvbnN0IGNpcmNsZUNvbG9yID0gY2lyY2xlSW5kZXggPCBvdXRwdXRTd2ltbGFuZXMubGVuZ3RoID8gb3V0cHV0U3dpbWxhbmVzW2NpcmNsZUluZGV4XS5jb2xvciA6XG5cdFx0Y2lyY2xlSW5kZXggPCBpbnB1dFN3aW1sYW5lcy5sZW5ndGggPyBpbnB1dFN3aW1sYW5lc1tjaXJjbGVJbmRleF0uY29sb3IgOiBoaXN0b3J5SXRlbVJlZkNvbG9yO1xuXG5cdGxldCBvdXRwdXRTd2ltbGFuZUluZGV4ID0gMDtcblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGlucHV0U3dpbWxhbmVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IGNvbG9yID0gaW5wdXRTd2ltbGFuZXNbaW5kZXhdLmNvbG9yO1xuXG5cdFx0Ly8gQ3VycmVudCBjb21taXRcblx0XHRpZiAoaW5wdXRTd2ltbGFuZXNbaW5kZXhdLmlkID09PSBoaXN0b3J5SXRlbS5pZCkge1xuXHRcdFx0Ly8gQmFzZSBjb21taXRcblx0XHRcdGlmIChpbmRleCAhPT0gY2lyY2xlSW5kZXgpIHtcblx0XHRcdFx0Y29uc3QgZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgcGF0aCA9IGNyZWF0ZVBhdGgoY29sb3IpO1xuXG5cdFx0XHRcdC8vIERyYXcgL1xuXHRcdFx0XHRkLnB1c2goYE0gJHtTV0lNTEFORV9XSURUSCAqIChpbmRleCArIDEpfSAwYCk7XG5cdFx0XHRcdGQucHVzaChgQSAke1NXSU1MQU5FX1dJRFRIfSAke1NXSU1MQU5FX1dJRFRIfSAwIDAgMSAke1NXSU1MQU5FX1dJRFRIICogKGluZGV4KX0gJHtTV0lNTEFORV9XSURUSH1gKTtcblxuXHRcdFx0XHQvLyBEcmF3IC1cblx0XHRcdFx0ZC5wdXNoKGBIICR7U1dJTUxBTkVfV0lEVEggKiAoY2lyY2xlSW5kZXggKyAxKX1gKTtcblxuXHRcdFx0XHRwYXRoLnNldEF0dHJpYnV0ZSgnZCcsIGQuam9pbignICcpKTtcblx0XHRcdFx0c3ZnLmFwcGVuZChwYXRoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dFN3aW1sYW5lSW5kZXgrKztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm90IHRoZSBjdXJyZW50IGNvbW1pdFxuXHRcdFx0aWYgKG91dHB1dFN3aW1sYW5lSW5kZXggPCBvdXRwdXRTd2ltbGFuZXMubGVuZ3RoICYmXG5cdFx0XHRcdGlucHV0U3dpbWxhbmVzW2luZGV4XS5pZCA9PT0gb3V0cHV0U3dpbWxhbmVzW291dHB1dFN3aW1sYW5lSW5kZXhdLmlkKSB7XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gb3V0cHV0U3dpbWxhbmVJbmRleCkge1xuXHRcdFx0XHRcdC8vIERyYXcgfFxuXHRcdFx0XHRcdGNvbnN0IHBhdGggPSBkcmF3VmVydGljYWxMaW5lKFNXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSksIDAsIFNXSU1MQU5FX0hFSUdIVCwgY29sb3IpO1xuXHRcdFx0XHRcdHN2Zy5hcHBlbmQocGF0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBwYXRoID0gY3JlYXRlUGF0aChjb2xvcik7XG5cblx0XHRcdFx0XHQvLyBEcmF3IHxcblx0XHRcdFx0XHRkLnB1c2goYE0gJHtTV0lNTEFORV9XSURUSCAqIChpbmRleCArIDEpfSAwYCk7XG5cdFx0XHRcdFx0ZC5wdXNoKGBWIDZgKTtcblxuXHRcdFx0XHRcdC8vIERyYXcgL1xuXHRcdFx0XHRcdGQucHVzaChgQSAke1NXSU1MQU5FX0NVUlZFX1JBRElVU30gJHtTV0lNTEFORV9DVVJWRV9SQURJVVN9IDAgMCAxICR7KFNXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSkpIC0gU1dJTUxBTkVfQ1VSVkVfUkFESVVTfSAke1NXSU1MQU5FX0hFSUdIVCAvIDJ9YCk7XG5cblx0XHRcdFx0XHQvLyBEcmF3IC1cblx0XHRcdFx0XHRkLnB1c2goYEggJHsoU1dJTUxBTkVfV0lEVEggKiAob3V0cHV0U3dpbWxhbmVJbmRleCArIDEpKSArIFNXSU1MQU5FX0NVUlZFX1JBRElVU31gKTtcblxuXHRcdFx0XHRcdC8vIERyYXcgL1xuXHRcdFx0XHRcdGQucHVzaChgQSAke1NXSU1MQU5FX0NVUlZFX1JBRElVU30gJHtTV0lNTEFORV9DVVJWRV9SQURJVVN9IDAgMCAwICR7U1dJTUxBTkVfV0lEVEggKiAob3V0cHV0U3dpbWxhbmVJbmRleCArIDEpfSAkeyhTV0lNTEFORV9IRUlHSFQgLyAyKSArIFNXSU1MQU5FX0NVUlZFX1JBRElVU31gKTtcblxuXHRcdFx0XHRcdC8vIERyYXcgfFxuXHRcdFx0XHRcdGQucHVzaChgViAke1NXSU1MQU5FX0hFSUdIVH1gKTtcblxuXHRcdFx0XHRcdHBhdGguc2V0QXR0cmlidXRlKCdkJywgZC5qb2luKCcgJykpO1xuXHRcdFx0XHRcdHN2Zy5hcHBlbmQocGF0aCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvdXRwdXRTd2ltbGFuZUluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWRkIHJlbWFpbmluZyBwYXJlbnQocylcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBwYXJlbnRPdXRwdXRJbmRleCA9IGZpbmRMYXN0SW5kZXgob3V0cHV0U3dpbWxhbmVzLCBoaXN0b3J5SXRlbS5wYXJlbnRJZHNbaV0pO1xuXHRcdGlmIChwYXJlbnRPdXRwdXRJbmRleCA9PT0gLTEpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgLVxcXG5cdFx0Y29uc3QgZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwYXRoID0gY3JlYXRlUGF0aChvdXRwdXRTd2ltbGFuZXNbcGFyZW50T3V0cHV0SW5kZXhdLmNvbG9yKTtcblxuXHRcdC8vIERyYXcgXFxcblx0XHRkLnB1c2goYE0gJHtTV0lNTEFORV9XSURUSCAqIHBhcmVudE91dHB1dEluZGV4fSAke1NXSU1MQU5FX0hFSUdIVCAvIDJ9YCk7XG5cdFx0ZC5wdXNoKGBBICR7U1dJTUxBTkVfV0lEVEh9ICR7U1dJTUxBTkVfV0lEVEh9IDAgMCAxICR7U1dJTUxBTkVfV0lEVEggKiAocGFyZW50T3V0cHV0SW5kZXggKyAxKX0gJHtTV0lNTEFORV9IRUlHSFR9YCk7XG5cblx0XHQvLyBEcmF3IC1cblx0XHRkLnB1c2goYE0gJHtTV0lNTEFORV9XSURUSCAqIHBhcmVudE91dHB1dEluZGV4fSAke1NXSU1MQU5FX0hFSUdIVCAvIDJ9YCk7XG5cdFx0ZC5wdXNoKGBIICR7U1dJTUxBTkVfV0lEVEggKiAoY2lyY2xlSW5kZXggKyAxKX0gYCk7XG5cblx0XHRwYXRoLnNldEF0dHJpYnV0ZSgnZCcsIGQuam9pbignICcpKTtcblx0XHRzdmcuYXBwZW5kKHBhdGgpO1xuXHR9XG5cblx0Ly8gRHJhdyB8IHRvICpcblx0aWYgKGlucHV0SW5kZXggIT09IC0xKSB7XG5cdFx0Y29uc3QgcGF0aCA9IGRyYXdWZXJ0aWNhbExpbmUoU1dJTUxBTkVfV0lEVEggKiAoY2lyY2xlSW5kZXggKyAxKSwgMCwgU1dJTUxBTkVfSEVJR0hUIC8gMiwgaW5wdXRTd2ltbGFuZXNbaW5wdXRJbmRleF0uY29sb3IpO1xuXHRcdHN2Zy5hcHBlbmQocGF0aCk7XG5cdH1cblxuXHQvLyBEcmF3IHwgZnJvbSAqXG5cdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IHBhdGggPSBkcmF3VmVydGljYWxMaW5lKFNXSU1MQU5FX1dJRFRIICogKGNpcmNsZUluZGV4ICsgMSksIFNXSU1MQU5FX0hFSUdIVCAvIDIsIFNXSU1MQU5FX0hFSUdIVCwgY2lyY2xlQ29sb3IpO1xuXHRcdHN2Zy5hcHBlbmQocGF0aCk7XG5cdH1cblxuXHQvLyBEcmF3ICpcblx0aWYgKGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdIRUFEJykge1xuXHRcdC8vIEhFQURcblx0XHRjb25zdCBvdXRlckNpcmNsZSA9IGRyYXdDaXJjbGUoY2lyY2xlSW5kZXgsIENJUkNMRV9SQURJVVMgKyAzLCBDSVJDTEVfU1RST0tFX1dJRFRILCBjaXJjbGVDb2xvcik7XG5cdFx0c3ZnLmFwcGVuZChvdXRlckNpcmNsZSk7XG5cblx0XHRjb25zdCBpbm5lckNpcmNsZSA9IGRyYXdDaXJjbGUoY2lyY2xlSW5kZXgsIENJUkNMRV9TVFJPS0VfV0lEVEgsIENJUkNMRV9SQURJVVMpO1xuXHRcdHN2Zy5hcHBlbmQoaW5uZXJDaXJjbGUpO1xuXHR9IGVsc2UgaWYgKGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdpbmNvbWluZy1jaGFuZ2VzJyB8fCBoaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kID09PSAnb3V0Z29pbmctY2hhbmdlcycpIHtcblx0XHQvLyBJbmNvbWluZy9PdXRnb2luZyBjaGFuZ2VzXG5cdFx0Y29uc3Qgb3V0ZXJDaXJjbGUgPSBkcmF3Q2lyY2xlKGNpcmNsZUluZGV4LCBDSVJDTEVfUkFESVVTICsgMywgQ0lSQ0xFX1NUUk9LRV9XSURUSCwgY2lyY2xlQ29sb3IpO1xuXHRcdHN2Zy5hcHBlbmQob3V0ZXJDaXJjbGUpO1xuXG5cdFx0Y29uc3QgaW5uZXJDaXJjbGUgPSBkcmF3Q2lyY2xlKGNpcmNsZUluZGV4LCBDSVJDTEVfUkFESVVTICsgMSwgQ0lSQ0xFX1NUUk9LRV9XSURUSCArIDEpO1xuXHRcdHN2Zy5hcHBlbmQoaW5uZXJDaXJjbGUpO1xuXG5cdFx0Y29uc3QgZGFzaGVkQ2lyY2xlID0gZHJhd0Rhc2hlZENpcmNsZShjaXJjbGVJbmRleCwgQ0lSQ0xFX1JBRElVUyArIDEsIENJUkNMRV9TVFJPS0VfV0lEVEggLSAxLCBjaXJjbGVDb2xvcik7XG5cdFx0c3ZnLmFwcGVuZChkYXNoZWRDaXJjbGUpO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMSkge1xuXHRcdFx0Ly8gTXVsdGktcGFyZW50IG5vZGVcblx0XHRcdGNvbnN0IGNpcmNsZU91dGVyID0gZHJhd0NpcmNsZShjaXJjbGVJbmRleCwgQ0lSQ0xFX1JBRElVUyArIDIsIENJUkNMRV9TVFJPS0VfV0lEVEgsIGNpcmNsZUNvbG9yKTtcblx0XHRcdHN2Zy5hcHBlbmQoY2lyY2xlT3V0ZXIpO1xuXG5cdFx0XHRjb25zdCBjaXJjbGVJbm5lciA9IGRyYXdDaXJjbGUoY2lyY2xlSW5kZXgsIENJUkNMRV9SQURJVVMgLSAxLCBDSVJDTEVfU1RST0tFX1dJRFRILCBjaXJjbGVDb2xvcik7XG5cdFx0XHRzdmcuYXBwZW5kKGNpcmNsZUlubmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm9kZVxuXHRcdFx0Y29uc3QgY2lyY2xlID0gZHJhd0NpcmNsZShjaXJjbGVJbmRleCwgQ0lSQ0xFX1JBRElVUyArIDEsIENJUkNMRV9TVFJPS0VfV0lEVEgsIGNpcmNsZUNvbG9yKTtcblx0XHRcdHN2Zy5hcHBlbmQoY2lyY2xlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBTZXQgZGltZW5zaW9uc1xuXHRzdmcuc3R5bGUuaGVpZ2h0ID0gYCR7U1dJTUxBTkVfSEVJR0hUfXB4YDtcblx0c3ZnLnN0eWxlLndpZHRoID0gYCR7U1dJTUxBTkVfV0lEVEggKiAoTWF0aC5tYXgoaW5wdXRTd2ltbGFuZXMubGVuZ3RoLCBvdXRwdXRTd2ltbGFuZXMubGVuZ3RoLCAxKSArIDEpfXB4YDtcblxuXHRyZXR1cm4gc3ZnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU0NNSGlzdG9yeUdyYXBoUGxhY2Vob2xkZXIoY29sdW1uczogSVNDTUhpc3RvcnlJdGVtR3JhcGhOb2RlW10sIGhpZ2hsaWdodEluZGV4PzogbnVtYmVyKTogSFRNTEVsZW1lbnQge1xuXHRjb25zdCBlbGVtZW50cyA9IHN2Z0VsZW0oJ3N2ZycsIHtcblx0XHRzdHlsZTogeyBoZWlnaHQ6IGAke1NXSU1MQU5FX0hFSUdIVH1weGAsIHdpZHRoOiBgJHtTV0lNTEFORV9XSURUSCAqIChjb2x1bW5zLmxlbmd0aCArIDEpfXB4YCwgfVxuXHR9KTtcblxuXHQvLyBEcmF3IHxcblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvbHVtbnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3Qgc3Ryb2tlV2lkdGggPSBpbmRleCA9PT0gaGlnaGxpZ2h0SW5kZXggPyAzIDogMTtcblx0XHRjb25zdCBwYXRoID0gZHJhd1ZlcnRpY2FsTGluZShTV0lNTEFORV9XSURUSCAqIChpbmRleCArIDEpLCAwLCBTV0lNTEFORV9IRUlHSFQsIGNvbHVtbnNbaW5kZXhdLmNvbG9yLCBzdHJva2VXaWR0aCk7XG5cdFx0ZWxlbWVudHMucm9vdC5hcHBlbmQocGF0aCk7XG5cdH1cblxuXHRyZXR1cm4gZWxlbWVudHMucm9vdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsQXJyYXkoXG5cdGhpc3RvcnlJdGVtczogSVNDTUhpc3RvcnlJdGVtW10sXG5cdGNvbG9yTWFwID0gbmV3IE1hcDxzdHJpbmcsIENvbG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZD4oKSxcblx0Y3VycmVudEhpc3RvcnlJdGVtUmVmPzogSVNDTUhpc3RvcnlJdGVtUmVmLFxuXHRjdXJyZW50SGlzdG9yeUl0ZW1SZW1vdGVSZWY/OiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdGN1cnJlbnRIaXN0b3J5SXRlbUJhc2VSZWY/OiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdGFkZEluY29taW5nQ2hhbmdlcz86IGJvb2xlYW4sXG5cdGFkZE91dGdvaW5nQ2hhbmdlcz86IGJvb2xlYW4sXG5cdG1lcmdlQmFzZT86IHN0cmluZ1xuKTogSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsW10ge1xuXHRsZXQgY29sb3JJbmRleCA9IC0xO1xuXHRjb25zdCB2aWV3TW9kZWxzOiBJU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxbXSA9IFtdO1xuXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBoaXN0b3J5SXRlbXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBoaXN0b3J5SXRlbXNbaW5kZXhdO1xuXG5cdFx0Y29uc3Qga2luZCA9IGhpc3RvcnlJdGVtLmlkID09PSBjdXJyZW50SGlzdG9yeUl0ZW1SZWY/LnJldmlzaW9uID8gJ0hFQUQnIDogJ25vZGUnO1xuXHRcdGNvbnN0IG91dHB1dFN3aW1sYW5lc0Zyb21QcmV2aW91c0l0ZW0gPSB2aWV3TW9kZWxzLmF0KC0xKT8ub3V0cHV0U3dpbWxhbmVzID8/IFtdO1xuXHRcdGNvbnN0IGlucHV0U3dpbWxhbmVzID0gb3V0cHV0U3dpbWxhbmVzRnJvbVByZXZpb3VzSXRlbS5tYXAoaSA9PiBkZWVwQ2xvbmUoaSkpO1xuXHRcdGNvbnN0IG91dHB1dFN3aW1sYW5lczogSVNDTUhpc3RvcnlJdGVtR3JhcGhOb2RlW10gPSBbXTtcblxuXHRcdGxldCBmaXJzdFBhcmVudEFkZGVkID0gZmFsc2U7XG5cblx0XHQvLyBBZGQgZmlyc3QgcGFyZW50IHRvIHRoZSBvdXRwdXRcblx0XHRpZiAoaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBpbnB1dFN3aW1sYW5lcykge1xuXHRcdFx0XHRpZiAobm9kZS5pZCA9PT0gaGlzdG9yeUl0ZW0uaWQpIHtcblx0XHRcdFx0XHRpZiAoIWZpcnN0UGFyZW50QWRkZWQpIHtcblx0XHRcdFx0XHRcdG91dHB1dFN3aW1sYW5lcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGhpc3RvcnlJdGVtLnBhcmVudElkc1swXSxcblx0XHRcdFx0XHRcdFx0Y29sb3I6IGdldExhYmVsQ29sb3JJZGVudGlmaWVyKGhpc3RvcnlJdGVtLCBjb2xvck1hcCkgPz8gbm9kZS5jb2xvclxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRmaXJzdFBhcmVudEFkZGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG91dHB1dFN3aW1sYW5lcy5wdXNoKGRlZXBDbG9uZShub2RlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHVucHJvY2Vzc2VkIHBhcmVudChzKSB0byB0aGUgb3V0cHV0XG5cdFx0Zm9yIChsZXQgaSA9IGZpcnN0UGFyZW50QWRkZWQgPyAxIDogMDsgaSA8IGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Ly8gQ29sb3IgaW5kZXggKGxhYmVsIC0+IG5leHQgY29sb3IpXG5cdFx0XHRsZXQgY29sb3JJZGVudGlmaWVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdGNvbG9ySWRlbnRpZmllciA9IGdldExhYmVsQ29sb3JJZGVudGlmaWVyKGhpc3RvcnlJdGVtLCBjb2xvck1hcCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5SXRlbVBhcmVudCA9IGhpc3RvcnlJdGVtc1xuXHRcdFx0XHRcdC5maW5kKGggPT4gaC5pZCA9PT0gaGlzdG9yeUl0ZW0ucGFyZW50SWRzW2ldKTtcblx0XHRcdFx0Y29sb3JJZGVudGlmaWVyID0gaGlzdG9yeUl0ZW1QYXJlbnQgPyBnZXRMYWJlbENvbG9ySWRlbnRpZmllcihoaXN0b3J5SXRlbVBhcmVudCwgY29sb3JNYXApIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWNvbG9ySWRlbnRpZmllcikge1xuXHRcdFx0XHRjb2xvckluZGV4ID0gcm90KGNvbG9ySW5kZXggKyAxLCBjb2xvclJlZ2lzdHJ5Lmxlbmd0aCk7XG5cdFx0XHRcdGNvbG9ySWRlbnRpZmllciA9IGNvbG9yUmVnaXN0cnlbY29sb3JJbmRleF07XG5cdFx0XHR9XG5cblx0XHRcdG91dHB1dFN3aW1sYW5lcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGhpc3RvcnlJdGVtLnBhcmVudElkc1tpXSxcblx0XHRcdFx0Y29sb3I6IGNvbG9ySWRlbnRpZmllclxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGNvbG9ycyB0byByZWZlcmVuY2VzXG5cdFx0Y29uc3QgcmVmZXJlbmNlcyA9IChoaXN0b3J5SXRlbS5yZWZlcmVuY2VzID8/IFtdKVxuXHRcdFx0Lm1hcChyZWYgPT4ge1xuXHRcdFx0XHRsZXQgY29sb3IgPSBjb2xvck1hcC5nZXQocmVmLmlkKTtcblx0XHRcdFx0aWYgKGNvbG9yTWFwLmhhcyhyZWYuaWQpICYmIGNvbG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBGaW5kIHRoZSBoaXN0b3J5IGl0ZW0gaW4gdGhlIGlucHV0IHN3aW1sYW5lc1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0SW5kZXggPSBpbnB1dFN3aW1sYW5lcy5maW5kSW5kZXgobm9kZSA9PiBub2RlLmlkID09PSBoaXN0b3J5SXRlbS5pZCk7XG5cblx0XHRcdFx0XHQvLyBDaXJjbGUgaW5kZXggLSB1c2UgdGhlIGlucHV0IHN3aW1sYW5lIGluZGV4IGlmIHByZXNlbnQsIG90aGVyd2lzZSBhZGQgaXQgdG8gdGhlIGVuZFxuXHRcdFx0XHRcdGNvbnN0IGNpcmNsZUluZGV4ID0gaW5wdXRJbmRleCAhPT0gLTEgPyBpbnB1dEluZGV4IDogaW5wdXRTd2ltbGFuZXMubGVuZ3RoO1xuXG5cdFx0XHRcdFx0Ly8gQ2lyY2xlIGNvbG9yIC0gdXNlIHRoZSBvdXRwdXQgc3dpbWxhbmUgY29sb3IgaWYgcHJlc2VudCwgb3RoZXJ3aXNlIHRoZSBpbnB1dCBzd2ltbGFuZSBjb2xvclxuXHRcdFx0XHRcdGNvbG9yID0gY2lyY2xlSW5kZXggPCBvdXRwdXRTd2ltbGFuZXMubGVuZ3RoID8gb3V0cHV0U3dpbWxhbmVzW2NpcmNsZUluZGV4XS5jb2xvciA6XG5cdFx0XHRcdFx0XHRjaXJjbGVJbmRleCA8IGlucHV0U3dpbWxhbmVzLmxlbmd0aCA/IGlucHV0U3dpbWxhbmVzW2NpcmNsZUluZGV4XS5jb2xvciA6IGhpc3RvcnlJdGVtUmVmQ29sb3I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyAuLi5yZWYsIGNvbG9yIH07XG5cdFx0XHR9KTtcblxuXHRcdC8vIFNvcnQgcmVmZXJlbmNlc1xuXHRcdHJlZmVyZW5jZXMuc29ydCgocmVmMSwgcmVmMikgPT5cblx0XHRcdGNvbXBhcmVIaXN0b3J5SXRlbVJlZnMocmVmMSwgcmVmMiwgY3VycmVudEhpc3RvcnlJdGVtUmVmLCBjdXJyZW50SGlzdG9yeUl0ZW1SZW1vdGVSZWYsIGN1cnJlbnRIaXN0b3J5SXRlbUJhc2VSZWYpKTtcblxuXHRcdHZpZXdNb2RlbHMucHVzaCh7XG5cdFx0XHRoaXN0b3J5SXRlbToge1xuXHRcdFx0XHQuLi5oaXN0b3J5SXRlbSxcblx0XHRcdFx0cmVmZXJlbmNlc1xuXHRcdFx0fSxcblx0XHRcdGtpbmQsXG5cdFx0XHRpbnB1dFN3aW1sYW5lcyxcblx0XHRcdG91dHB1dFN3aW1sYW5lc1xuXHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbCk7XG5cdH1cblxuXHQvLyBBZGQgaW5jb21pbmcvb3V0Z29pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW0gdmlldyBtb2RlbHMuIFdoaWxlIHdvcmtpbmdcblx0Ly8gd2l0aCB0aGUgdmlldyBtb2RlbHMgaXMgYSBsaXR0bGUgYml0IG1vcmUgY29tcGxleCwgd2UgYXJlIGRvaW5nIHRoaXNcblx0Ly8gYWZ0ZXIgY3JlYXRpbmcgdGhlIHZpZXcgbW9kZWxzIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGUgc3dpbWxhbmUgY29sb3JzXG5cdC8vIHRvIGFkZCB0aGUgaW5jb21pbmcvb3V0Z29pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW1zIHZpZXcgbW9kZWxzIHRvIHRoZVxuXHQvLyBjb3JyZWN0IHN3aW1sYW5lcy5cblx0YWRkSW5jb21pbmdPdXRnb2luZ0NoYW5nZXNIaXN0b3J5SXRlbXMoXG5cdFx0dmlld01vZGVscyxcblx0XHRjdXJyZW50SGlzdG9yeUl0ZW1SZWYsXG5cdFx0Y3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmLFxuXHRcdGFkZEluY29taW5nQ2hhbmdlcyxcblx0XHRhZGRPdXRnb2luZ0NoYW5nZXMsXG5cdFx0bWVyZ2VCYXNlXG5cdCk7XG5cblx0cmV0dXJuIHZpZXdNb2RlbHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRIaXN0b3J5SXRlbUluZGV4KGhpc3RvcnlJdGVtVmlld01vZGVsOiBJU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWwpOiBudW1iZXIge1xuXHRjb25zdCBoaXN0b3J5SXRlbSA9IGhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXHRjb25zdCBpbnB1dFN3aW1sYW5lcyA9IGhpc3RvcnlJdGVtVmlld01vZGVsLmlucHV0U3dpbWxhbmVzO1xuXG5cdC8vIEZpbmQgdGhlIGhpc3RvcnkgaXRlbSBpbiB0aGUgaW5wdXQgc3dpbWxhbmVzXG5cdGNvbnN0IGlucHV0SW5kZXggPSBpbnB1dFN3aW1sYW5lcy5maW5kSW5kZXgobm9kZSA9PiBub2RlLmlkID09PSBoaXN0b3J5SXRlbS5pZCk7XG5cblx0Ly8gQ2lyY2xlIGluZGV4IC0gdXNlIHRoZSBpbnB1dCBzd2ltbGFuZSBpbmRleCBpZiBwcmVzZW50LCBvdGhlcndpc2UgYWRkIGl0IHRvIHRoZSBlbmRcblx0cmV0dXJuIGlucHV0SW5kZXggIT09IC0xID8gaW5wdXRJbmRleCA6IGlucHV0U3dpbWxhbmVzLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gYWRkSW5jb21pbmdPdXRnb2luZ0NoYW5nZXNIaXN0b3J5SXRlbXMoXG5cdHZpZXdNb2RlbHM6IElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFtdLFxuXHRjdXJyZW50SGlzdG9yeUl0ZW1SZWY/OiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZj86IElTQ01IaXN0b3J5SXRlbVJlZixcblx0YWRkSW5jb21pbmdDaGFuZ2VzPzogYm9vbGVhbixcblx0YWRkT3V0Z29pbmdDaGFuZ2VzPzogYm9vbGVhbixcblx0bWVyZ2VCYXNlPzogc3RyaW5nXG4pOiB2b2lkIHtcblx0aWYgKGN1cnJlbnRIaXN0b3J5SXRlbVJlZj8ucmV2aXNpb24gIT09IGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZj8ucmV2aXNpb24gJiYgbWVyZ2VCYXNlKSB7XG5cdFx0Ly8gSW5jb21pbmcgY2hhbmdlcyBub2RlXG5cdFx0aWYgKGFkZEluY29taW5nQ2hhbmdlcyAmJiBjdXJyZW50SGlzdG9yeUl0ZW1SZW1vdGVSZWYgJiYgY3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmLnJldmlzaW9uICE9PSBtZXJnZUJhc2UpIHtcblx0XHRcdC8vIEZpbmQgdGhlIGJlZm9yZS9hZnRlciBpbmRpY2VzIHVzaW5nIHRoZSBtZXJnZSBiYXNlIChtaWdodCBub3QgYmUgcHJlc2VudCBpZiB0aGUgbWVyZ2UgYmFzZSBoaXN0b3J5IGl0ZW0gaXMgbm90IGxvYWRlZCB5ZXQpXG5cdFx0XHRjb25zdCBiZWZvcmVIaXN0b3J5SXRlbUluZGV4ID0gZmluZExhc3RJZHgodmlld01vZGVscywgdm0gPT4gdm0ub3V0cHV0U3dpbWxhbmVzLnNvbWUobm9kZSA9PiBub2RlLmlkID09PSBtZXJnZUJhc2UpKTtcblx0XHRcdGNvbnN0IGFmdGVySGlzdG9yeUl0ZW1JbmRleCA9IHZpZXdNb2RlbHMuZmluZEluZGV4KHZtID0+IHZtLmhpc3RvcnlJdGVtLmlkID09PSBtZXJnZUJhc2UpO1xuXG5cdFx0XHRpZiAoYmVmb3JlSGlzdG9yeUl0ZW1JbmRleCAhPT0gLTEgJiYgYWZ0ZXJIaXN0b3J5SXRlbUluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHQvLyBUaGVyZSBpcyBhIGtub3duIGVkZ2UgY2FzZSBpbiB3aGljaCB0aGUgaW5jb21pbmcgY2hhbmdlcyBoYXZlIGFscmVhZHlcblx0XHRcdFx0Ly8gYmVlbiBtZXJnZWQuIEZvciB0aGlzIHNjZW5hcmlvLCB3ZSB3aWxsIG5vdCBiZSBzaG93aW5nIHRoZSBpbmNvbWluZ1xuXHRcdFx0XHQvLyBjaGFuZ2VzIGhpc3RvcnkgaXRlbS4gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NjA2NFxuXHRcdFx0XHRjb25zdCBpbmNvbWluZ0NoYW5nZU1lcmdlZCA9IHZpZXdNb2RlbHNbYmVmb3JlSGlzdG9yeUl0ZW1JbmRleF0uaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmxlbmd0aCA9PT0gMiAmJlxuXHRcdFx0XHRcdHZpZXdNb2RlbHNbYmVmb3JlSGlzdG9yeUl0ZW1JbmRleF0uaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmluY2x1ZGVzKG1lcmdlQmFzZSk7XG5cblx0XHRcdFx0aWYgKCFpbmNvbWluZ0NoYW5nZU1lcmdlZCkge1xuXHRcdFx0XHRcdC8vIFVwZGF0ZSB0aGUgYmVmb3JlIG5vZGUgc28gdGhhdCB0aGUgaW5jb21pbmcgYW5kIG91dGdvaW5nIHN3aW1sYW5lc1xuXHRcdFx0XHRcdC8vIHBvaW50IHRvIHRoZSBgaW5jb21pbmctY2hhbmdlc2Agbm9kZSBpbnN0ZWFkIG9mIHRoZSBtZXJnZSBiYXNlXG5cdFx0XHRcdFx0dmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XSA9IHtcblx0XHRcdFx0XHRcdC4uLnZpZXdNb2RlbHNbYmVmb3JlSGlzdG9yeUl0ZW1JbmRleF0sXG5cdFx0XHRcdFx0XHRpbnB1dFN3aW1sYW5lczogdmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XS5pbnB1dFN3aW1sYW5lc1xuXHRcdFx0XHRcdFx0XHQubWFwKG5vZGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBub2RlLmlkID09PSBtZXJnZUJhc2UgJiYgbm9kZS5jb2xvciA9PT0gaGlzdG9yeUl0ZW1SZW1vdGVSZWZDb2xvclxuXHRcdFx0XHRcdFx0XHRcdFx0PyB7IC4uLm5vZGUsIGlkOiBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQgfVxuXHRcdFx0XHRcdFx0XHRcdFx0OiBub2RlO1xuXHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdG91dHB1dFN3aW1sYW5lczogdmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XS5vdXRwdXRTd2ltbGFuZXNcblx0XHRcdFx0XHRcdFx0Lm1hcChub2RlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbm9kZS5pZCA9PT0gbWVyZ2VCYXNlICYmIG5vZGUuY29sb3IgPT09IGhpc3RvcnlJdGVtUmVtb3RlUmVmQ29sb3Jcblx0XHRcdFx0XHRcdFx0XHRcdD8geyAuLi5ub2RlLCBpZDogU0NNSW5jb21pbmdIaXN0b3J5SXRlbUlkIH1cblx0XHRcdFx0XHRcdFx0XHRcdDogbm9kZTtcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGluY29taW5nIGNoYW5nZXMgbm9kZVxuXHRcdFx0XHRcdGNvbnN0IGlucHV0U3dpbWxhbmVzID0gdmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XS5vdXRwdXRTd2ltbGFuZXMubWFwKGkgPT4gZGVlcENsb25lKGkpKTtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXRTd2ltbGFuZXMgPSB2aWV3TW9kZWxzW2FmdGVySGlzdG9yeUl0ZW1JbmRleF0uaW5wdXRTd2ltbGFuZXMubWFwKGkgPT4gZGVlcENsb25lKGkpKTtcblx0XHRcdFx0XHRjb25zdCBkaXNwbGF5SWRMZW5ndGggPSB2aWV3TW9kZWxzWzBdLmhpc3RvcnlJdGVtLmRpc3BsYXlJZD8ubGVuZ3RoID8/IDA7XG5cblx0XHRcdFx0XHRjb25zdCBpbmNvbWluZ0NoYW5nZXNIaXN0b3J5SXRlbSA9IHtcblx0XHRcdFx0XHRcdGlkOiBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQsXG5cdFx0XHRcdFx0XHRkaXNwbGF5SWQ6ICcwJy5yZXBlYXQoZGlzcGxheUlkTGVuZ3RoKSxcblx0XHRcdFx0XHRcdHBhcmVudElkczogW21lcmdlQmFzZV0sXG5cdFx0XHRcdFx0XHRhdXRob3I6IGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZj8ubmFtZSxcblx0XHRcdFx0XHRcdHN1YmplY3Q6IGxvY2FsaXplKCdpbmNvbWluZ0NoYW5nZXMnLCAnSW5jb21pbmcgQ2hhbmdlcycpLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogJydcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJU0NNSGlzdG9yeUl0ZW07XG5cblx0XHRcdFx0XHQvLyBJbnNlcnQgaW5jb21pbmcgY2hhbmdlcyBub2RlXG5cdFx0XHRcdFx0dmlld01vZGVscy5zcGxpY2UoYWZ0ZXJIaXN0b3J5SXRlbUluZGV4LCAwLCB7XG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbTogaW5jb21pbmdDaGFuZ2VzSGlzdG9yeUl0ZW0sXG5cdFx0XHRcdFx0XHRraW5kOiAnaW5jb21pbmctY2hhbmdlcycsXG5cdFx0XHRcdFx0XHRpbnB1dFN3aW1sYW5lcyxcblx0XHRcdFx0XHRcdG91dHB1dFN3aW1sYW5lc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3V0Z29pbmcgY2hhbmdlcyBub2RlXG5cdFx0aWYgKGFkZE91dGdvaW5nQ2hhbmdlcyAmJiBjdXJyZW50SGlzdG9yeUl0ZW1SZWY/LnJldmlzaW9uICYmIGN1cnJlbnRIaXN0b3J5SXRlbVJlZi5yZXZpc2lvbiAhPT0gbWVyZ2VCYXNlKSB7XG5cdFx0XHQvLyBGaW5kIHRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBoaXN0b3J5IGl0ZW0gdmlldyBtb2RlbCAobWlnaHQgbm90IGJlIHByZXNlbnQgaWYgdGhlIGN1cnJlbnQgaGlzdG9yeSBpdGVtIGlzIG5vdCBsb2FkZWQgeWV0KVxuXHRcdFx0Y29uc3QgY3VycmVudEhpc3RvcnlJdGVtUmVmSW5kZXggPSB2aWV3TW9kZWxzLmZpbmRJbmRleCh2bSA9PiB2bS5raW5kID09PSAnSEVBRCcgJiYgdm0uaGlzdG9yeUl0ZW0uaWQgPT09IGN1cnJlbnRIaXN0b3J5SXRlbVJlZi5yZXZpc2lvbik7XG5cblx0XHRcdGlmIChjdXJyZW50SGlzdG9yeUl0ZW1SZWZJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIG91dGdvaW5nIGNoYW5nZXMgbm9kZVxuXHRcdFx0XHRjb25zdCBvdXRnb2luZ0NoYW5nZXNIaXN0b3J5SXRlbSA9IHtcblx0XHRcdFx0XHRpZDogU0NNT3V0Z29pbmdIaXN0b3J5SXRlbUlkLFxuXHRcdFx0XHRcdGRpc3BsYXlJZDogdmlld01vZGVsc1swXS5oaXN0b3J5SXRlbS5kaXNwbGF5SWRcblx0XHRcdFx0XHRcdD8gJzAnLnJlcGVhdCh2aWV3TW9kZWxzWzBdLmhpc3RvcnlJdGVtLmRpc3BsYXlJZC5sZW5ndGgpXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwYXJlbnRJZHM6IFtjdXJyZW50SGlzdG9yeUl0ZW1SZWYucmV2aXNpb25dLFxuXHRcdFx0XHRcdGF1dGhvcjogY3VycmVudEhpc3RvcnlJdGVtUmVmPy5uYW1lLFxuXHRcdFx0XHRcdHN1YmplY3Q6IGxvY2FsaXplKCdvdXRnb2luZ0NoYW5nZXMnLCAnT3V0Z29pbmcgQ2hhbmdlcycpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICcnXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbTtcblxuXHRcdFx0XHQvLyBDb3B5IHRoZSBpbnB1dCBzd2ltbGFuZXMgZnJvbSB0aGUgY3VycmVudCBoaXN0b3J5IGl0ZW0gcmVmXG5cdFx0XHRcdGNvbnN0IGlucHV0U3dpbWxhbmVzID0gdmlld01vZGVsc1tjdXJyZW50SGlzdG9yeUl0ZW1SZWZJbmRleF0uaW5wdXRTd2ltbGFuZXMuc2xpY2UoMCk7XG5cblx0XHRcdFx0Ly8gQ29weSB0aGUgaW5wdXQgc3dpbWxhbmVzIGFuZCBhZGQgdGhlIGN1cnJlbnQgaGlzdG9yeSBpdGVtIHJlZlxuXHRcdFx0XHRjb25zdCBvdXRwdXRTd2ltbGFuZXMgPSBpbnB1dFN3aW1sYW5lcy5zbGljZSgwKS5jb25jYXQoe1xuXHRcdFx0XHRcdGlkOiBjdXJyZW50SGlzdG9yeUl0ZW1SZWYucmV2aXNpb24sXG5cdFx0XHRcdFx0Y29sb3I6IGhpc3RvcnlJdGVtUmVmQ29sb3Jcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNDTUhpc3RvcnlJdGVtR3JhcGhOb2RlKTtcblxuXHRcdFx0XHQvLyBJbnNlcnQgb3V0Z29pbmcgY2hhbmdlcyBub2RlXG5cdFx0XHRcdHZpZXdNb2RlbHMuc3BsaWNlKGN1cnJlbnRIaXN0b3J5SXRlbVJlZkluZGV4LCAwLCB7XG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW06IG91dGdvaW5nQ2hhbmdlc0hpc3RvcnlJdGVtLFxuXHRcdFx0XHRcdGtpbmQ6ICdvdXRnb2luZy1jaGFuZ2VzJyxcblx0XHRcdFx0XHRpbnB1dFN3aW1sYW5lcyxcblx0XHRcdFx0XHRvdXRwdXRTd2ltbGFuZXNcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBpbnB1dCBzd2ltbGFuZSBmb3IgdGhlIGN1cnJlbnQgaGlzdG9yeSBpdGVtXG5cdFx0XHRcdC8vIHJlZiBzbyB0aGF0IGl0IGNvbm5lY3RzIHdpdGggdGhlIG91dGdvaW5nIGNoYW5nZXMgbm9kZVxuXHRcdFx0XHR2aWV3TW9kZWxzW2N1cnJlbnRIaXN0b3J5SXRlbVJlZkluZGV4ICsgMV0uaW5wdXRTd2ltbGFuZXMucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IGN1cnJlbnRIaXN0b3J5SXRlbVJlZi5yZXZpc2lvbixcblx0XHRcdFx0XHRjb2xvcjogaGlzdG9yeUl0ZW1SZWZDb2xvclxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcGFyZUhpc3RvcnlJdGVtUmVmcyhcblx0cmVmMTogSVNDTUhpc3RvcnlJdGVtUmVmLFxuXHRyZWYyOiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdGN1cnJlbnRIaXN0b3J5SXRlbVJlZj86IElTQ01IaXN0b3J5SXRlbVJlZixcblx0Y3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmPzogSVNDTUhpc3RvcnlJdGVtUmVmLFxuXHRjdXJyZW50SGlzdG9yeUl0ZW1CYXNlUmVmPzogSVNDTUhpc3RvcnlJdGVtUmVmXG4pOiBudW1iZXIge1xuXHRjb25zdCBnZXRIaXN0b3J5SXRlbVJlZk9yZGVyID0gKHJlZjogSVNDTUhpc3RvcnlJdGVtUmVmKSA9PiB7XG5cdFx0aWYgKHJlZi5pZCA9PT0gY3VycmVudEhpc3RvcnlJdGVtUmVmPy5pZCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmIChyZWYuaWQgPT09IGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZj8uaWQpIHtcblx0XHRcdHJldHVybiAyO1xuXHRcdH0gZWxzZSBpZiAocmVmLmlkID09PSBjdXJyZW50SGlzdG9yeUl0ZW1CYXNlUmVmPy5pZCkge1xuXHRcdFx0cmV0dXJuIDM7XG5cdFx0fSBlbHNlIGlmIChyZWYuY29sb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDk5O1xuXHR9O1xuXG5cdC8vIEFzc2lnbiBvcmRlciAoY3VycmVudCA+IHJlbW90ZSA+IGJhc2UgPiBjb2xvcilcblx0Y29uc3QgcmVmMU9yZGVyID0gZ2V0SGlzdG9yeUl0ZW1SZWZPcmRlcihyZWYxKTtcblx0Y29uc3QgcmVmMk9yZGVyID0gZ2V0SGlzdG9yeUl0ZW1SZWZPcmRlcihyZWYyKTtcblxuXHRyZXR1cm4gcmVmMU9yZGVyIC0gcmVmMk9yZGVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9IaXN0b3J5SXRlbUhvdmVyQ29udGVudChtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBoaXN0b3J5SXRlbTogSVNDTUhpc3RvcnlJdGVtLCBpbmNsdWRlUmVmZXJlbmNlczogYm9vbGVhbik6IHsgY29udGVudDogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZSB9IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0aWYgKGhpc3RvcnlJdGVtLnRvb2x0aXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB7IGNvbnRlbnQ6IGhpc3RvcnlJdGVtLm1lc3NhZ2UsIGRpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRpZiAoaXNNYXJrZG93blN0cmluZyhoaXN0b3J5SXRlbS50b29sdGlwKSkge1xuXHRcdHJldHVybiB7IGNvbnRlbnQ6IGhpc3RvcnlJdGVtLnRvb2x0aXAsIGRpc3Bvc2FibGVzIH07XG5cdH1cblxuXHQvLyBSZWZlcmVuY2VzIGFzIFwiaW5qZWN0ZWRcIiBpbnRvIHRoZSBob3ZlciBoZXJlIHNpbmNlIHRoZSBleHRlbnNpb24gZG9lc1xuXHQvLyBub3Qga25vdyB0aGF0IGNvbG9yIHVzZWQgaW4gdGhlIGdyYXBoIHRvIHJlbmRlciB0aGUgaGlzdG9yeSBpdGVtIGF0IHdoaWNoXG5cdC8vIHRoZSByZWZlcmVuY2UgaXMgcG9pbnRpbmcgdG8uIFRoZXkgYXJlIGJlaW5nIGFkZGVkIGJlZm9yZSB0aGUgbGFzdCBlbGVtZW50XG5cdC8vIG9mIHRoZSBhcnJheSB3aGljaCBpcyBhc3N1bWVkIHRvIGNvbnRhaW4gdGhlIGhvdmVyIGNvbW1hbmRzLlxuXHRjb25zdCB0b29sdGlwU2VjdGlvbnMgPSBoaXN0b3J5SXRlbS50b29sdGlwLnNsaWNlKCk7XG5cblx0aWYgKGluY2x1ZGVSZWZlcmVuY2VzICYmIGhpc3RvcnlJdGVtLnJlZmVyZW5jZXM/Lmxlbmd0aCkge1xuXHRcdGNvbnN0IG1hcmtkb3duU3RyaW5nID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IHN1cHBvcnRIdG1sOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblxuXHRcdGZvciAoY29uc3QgcmVmZXJlbmNlIG9mIGhpc3RvcnlJdGVtLnJlZmVyZW5jZXMpIHtcblx0XHRcdGNvbnN0IGxhYmVsSWNvbklkID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKHJlZmVyZW5jZS5pY29uKSA/IHJlZmVyZW5jZS5pY29uLmlkIDogJyc7XG5cblx0XHRcdGNvbnN0IGxhYmVsQmFja2dyb3VuZENvbG9yID0gcmVmZXJlbmNlLmNvbG9yID8gYXNDc3NWYXJpYWJsZShyZWZlcmVuY2UuY29sb3IpIDogYXNDc3NWYXJpYWJsZShoaXN0b3J5SXRlbUhvdmVyRGVmYXVsdExhYmVsQmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCBsYWJlbEZvcmVncm91bmRDb2xvciA9IHJlZmVyZW5jZS5jb2xvciA/IGFzQ3NzVmFyaWFibGUoaGlzdG9yeUl0ZW1Ib3ZlckxhYmVsRm9yZWdyb3VuZCkgOiBhc0Nzc1ZhcmlhYmxlKGhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxGb3JlZ3JvdW5kKTtcblx0XHRcdG1hcmtkb3duU3RyaW5nLmFwcGVuZE1hcmtkb3duKGA8c3BhbiBzdHlsZT1cImNvbG9yOiR7bGFiZWxGb3JlZ3JvdW5kQ29sb3J9O2JhY2tncm91bmQtY29sb3I6JHtsYWJlbEJhY2tncm91bmRDb2xvcn07Ym9yZGVyLXJhZGl1czoxMHB4O1wiPiZuYnNwOyQoJHtsYWJlbEljb25JZH0pJm5ic3A7YCk7XG5cdFx0XHRtYXJrZG93blN0cmluZy5hcHBlbmRUZXh0KHJlZmVyZW5jZS5uYW1lKTtcblx0XHRcdG1hcmtkb3duU3RyaW5nLmFwcGVuZE1hcmtkb3duKCcmbmJzcDsmbmJzcDs8L3NwYW4+Jyk7XG5cdFx0fVxuXG5cdFx0bWFya2Rvd25TdHJpbmcuYXBwZW5kTWFya2Rvd24oYFxcblxcbi0tLVxcblxcbmApO1xuXHRcdHRvb2x0aXBTZWN0aW9ucy5zcGxpY2UodG9vbHRpcFNlY3Rpb25zLmxlbmd0aCAtIDEsIDAsIG1hcmtkb3duU3RyaW5nKTtcblx0fVxuXG5cdC8vIFJlbmRlciB0b29sdGlwIGNvbnRlbnRcblx0Y29uc3QgaG92ZXJDb250YWluZXIgPSAkKCcuaGlzdG9yeS1pdGVtLWhvdmVyLWNvbnRhaW5lcicpO1xuXHRmb3IgKGNvbnN0IG1hcmtkb3duU3RyaW5nIG9mIHRvb2x0aXBTZWN0aW9ucykge1xuXHRcdGlmIChpc0VtcHR5TWFya2Rvd25TdHJpbmcobWFya2Rvd25TdHJpbmcpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJlZENvbnRlbnQgPSBtYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobWFya2Rvd25TdHJpbmcpO1xuXHRcdGhvdmVyQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkQ29udGVudC5lbGVtZW50KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVuZGVyZWRDb250ZW50KTtcblx0fVxuXG5cdHJldHVybiB7IGNvbnRlbnQ6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
