function buildHistoryFromTasks(tasks, startTime, logs = []) {
  const rootByTrace = /* @__PURE__ */ new Map();
  const roots = [];
  const eventByTrace = /* @__PURE__ */ new Map();
  const taskEvents = [];
  for (const task of tasks) {
    const trace = task.trace;
    if (!trace) {
      continue;
    }
    let root = rootByTrace.get(trace.root);
    if (!root) {
      root = { label: trace.root.label };
      rootByTrace.set(trace.root, root);
      roots.push(root);
    }
    let parentEvent;
    for (let p = trace.parent; p; p = p.parent) {
      const e = eventByTrace.get(p);
      if (e) {
        parentEvent = e;
        break;
      }
    }
    const event = {
      time: task.time - startTime,
      label: `${task.source}`,
      root,
      parent: parentEvent,
      detail: extractCallerFrame(task.source.stackTrace)
    };
    eventByTrace.set(trace, event);
    taskEvents.push(event);
  }
  const logsByParent = /* @__PURE__ */ new Map();
  for (const entry of logs) {
    let parentEvent;
    for (let p = entry.trace; p; p = p.parent) {
      const e = eventByTrace.get(p);
      if (e) {
        parentEvent = e;
        break;
      }
    }
    if (!parentEvent) {
      continue;
    }
    const logEvent = {
      time: parentEvent.time,
      label: `log: ${entry.message}`,
      root: parentEvent.root,
      parent: parentEvent
    };
    const bucket = logsByParent.get(parentEvent);
    if (bucket) {
      bucket.push(logEvent);
    } else {
      logsByParent.set(parentEvent, [logEvent]);
    }
  }
  const events = [];
  for (const e of taskEvents) {
    events.push(e);
    const ls = logsByParent.get(e);
    if (ls) {
      events.push(...ls);
    }
  }
  return { roots, events };
}
const _skipFramePatterns = [
  /[\\/]virtualScheduling[\\/]/,
  /[\\/]vs[\\/]base[\\/]common[\\/]async\./,
  /timeTravelScheduler|traceableTimeApi/,
  /RunOnceScheduler\.schedule/,
  /scheduleAtNextAnimationFrame/,
  /TimeoutTimer\.cancelAndSet/,
  /TimeoutTimer\.setIfNotSet/,
  /timeoutDeferred/,
  /createTimeout/
];
const MAX_DETAIL_FRAMES = 5;
function extractCallerFrame(stackTrace) {
  if (!stackTrace) {
    return void 0;
  }
  const frames = [];
  for (const line of stackTrace.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) {
      continue;
    }
    if (_skipFramePatterns.some((p) => p.test(trimmed))) {
      continue;
    }
    frames.push(trimmed.slice(3));
    if (frames.length >= MAX_DETAIL_FRAMES) {
      break;
    }
  }
  return frames.length === 0 ? void 0 : frames.join("\n");
}
function renderSwimlanes(history) {
  const { roots, events } = history;
  if (events.length === 0) {
    return "(empty history)";
  }
  if (roots.length === 0) {
    return events.map((e) => `[+${e.time}ms] ${e.label}`).join("\n");
  }
  const n = events.length;
  const parentOf = new Array(n).fill(-1);
  const childrenOf = Array.from({ length: n }, () => []);
  const indexOfEvent = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    indexOfEvent.set(events[i], i);
  }
  for (let i = 0; i < n; i++) {
    const p = events[i].parent;
    if (p) {
      const pi = indexOfEvent.get(p);
      if (pi !== void 0) {
        parentOf[i] = pi;
        childrenOf[pi].push(i);
      }
    }
  }
  const isLastChild = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const p = parentOf[i];
    if (p >= 0 && childrenOf[p][childrenOf[p].length - 1] === i) {
      isLastChild[i] = true;
    }
  }
  const COLLAPSE_DEPTH_THRESHOLD = 6;
  const depthOf = new Array(n).fill(0);
  const slotOf = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = parentOf[i];
    if (p >= 0) {
      depthOf[i] = depthOf[p] + 1;
      const collapse = isLastChild[i] && depthOf[i] >= COLLAPSE_DEPTH_THRESHOLD;
      slotOf[i] = slotOf[p] + (collapse ? 0 : 1);
    }
  }
  const displayLabelOf = new Array(n);
  const detailLinesOf = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = events[i];
    const frames = e.detail ? e.detail.split("\n") : [];
    displayLabelOf[i] = frames.length > 0 ? `${e.label} \xB7 ${frames[0]}` : e.label;
    detailLinesOf[i] = frames.slice(1);
  }
  const widthOf = /* @__PURE__ */ new Map();
  for (const r of roots) {
    widthOf.set(r, r.label.length);
  }
  for (let i = 0; i < n; i++) {
    const baseIndent = slotOf[i] * 3 + 3;
    const maxLen = Math.max(displayLabelOf[i].length, ...detailLinesOf[i].map((l) => l.length + 2));
    const w = baseIndent + maxLen;
    const cur = widthOf.get(events[i].root) ?? 0;
    if (w > cur) {
      widthOf.set(events[i].root, w);
    }
  }
  const maxTime = n > 0 ? Math.max(...events.map((e) => Math.round(e.time))) : 0;
  const timeColWidth = `+${maxTime}ms`.length;
  const lines = [];
  const header = [];
  for (const r of roots) {
    const w = widthOf.get(r);
    header.push(r.label.padStart(Math.ceil((w + r.label.length) / 2)).padEnd(w));
  }
  lines.push(`${" ".repeat(timeColWidth)} ${header.join("  ")}`.trimEnd());
  const lastChildOf = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const kids = childrenOf[i];
    if (kids.length > 0) {
      lastChildOf[i] = kids[kids.length - 1];
    }
  }
  const laneStacks = /* @__PURE__ */ new Map();
  for (const r of roots) {
    laneStacks.set(r, /* @__PURE__ */ new Set());
  }
  for (let i = 0; i < n; i++) {
    const event = events[i];
    const timeStr = `+${Math.round(event.time)}ms`.padStart(timeColWidth);
    const parts = [];
    for (const r of roots) {
      const w = widthOf.get(r);
      const stack2 = laneStacks.get(r);
      if (r === event.root) {
        const slot = slotOf[i];
        const indent = [];
        for (let s = 0; s < slot; s++) {
          let hasActive = false;
          for (const a of stack2) {
            if (slotOf[a] === s && lastChildOf[a] > i) {
              hasActive = true;
              break;
            }
          }
          indent.push(hasActive ? "\u2502  " : "   ");
        }
        const prefix = isLastChild[i] ? "\u2514\u2500 " : "\u251C\u2500 ";
        parts.push(`${indent.join("")}${prefix}${displayLabelOf[i]}`.padEnd(w));
      } else {
        const activeSlots = [];
        for (const a of stack2) {
          if (lastChildOf[a] > i) {
            activeSlots.push(slotOf[a]);
          }
        }
        const maxSlot = Math.max(...activeSlots, -1);
        const chars = new Array(Math.max(maxSlot + 1, 0)).fill("   ");
        for (const s of activeSlots) {
          chars[s] = "\u2502  ";
        }
        let nextJ = -1;
        for (let j = i + 1; j < n; j++) {
          if (events[j].root === r) {
            nextJ = j;
            break;
          }
        }
        if (nextJ >= 0 && parentOf[nextJ] >= 0) {
          const s = slotOf[nextJ];
          if (!isLastChild[nextJ]) {
            while (chars.length <= s) {
              chars.push("   ");
            }
            if (chars[s] === "   ") {
              chars[s] = "|  ";
            }
          }
        }
        while (chars.length > 0 && chars[chars.length - 1] === "   ") {
          chars.pop();
        }
        parts.push(chars.join("").padEnd(w));
      }
    }
    lines.push(`${timeStr} ${parts.join("  ")}`.trimEnd());
    const extras = detailLinesOf[i];
    if (extras.length > 0) {
      const slot = slotOf[i];
      const stackForExtras = laneStacks.get(event.root);
      const hasOpenChildren = childrenOf[i].length > 0;
      const extraIndent = [];
      for (let s = 0; s < slot; s++) {
        let hasActive = false;
        for (const a of stackForExtras) {
          if (slotOf[a] === s && lastChildOf[a] > i) {
            hasActive = true;
            break;
          }
        }
        extraIndent.push(hasActive ? "\u2502  " : "   ");
      }
      extraIndent.push(hasOpenChildren ? "\u2502  " : "   ");
      for (const extra of extras) {
        const extrasParts = [];
        for (const r of roots) {
          const w = widthOf.get(r);
          if (r === event.root) {
            extrasParts.push(`${extraIndent.join("")}${extra}`.padEnd(w));
          } else {
            const otherStack = laneStacks.get(r);
            const activeSlots = [];
            for (const a of otherStack) {
              if (lastChildOf[a] > i) {
                activeSlots.push(slotOf[a]);
              }
            }
            const maxSlot = Math.max(...activeSlots, -1);
            const chars = new Array(Math.max(maxSlot + 1, 0)).fill("   ");
            for (const s of activeSlots) {
              chars[s] = "\u2502  ";
            }
            while (chars.length > 0 && chars[chars.length - 1] === "   ") {
              chars.pop();
            }
            extrasParts.push(chars.join("").padEnd(w));
          }
        }
        const timePad = " ".repeat(timeColWidth);
        lines.push(`${timePad} ${extrasParts.join("  ")}`.trimEnd());
      }
    }
    const stack = laneStacks.get(event.root);
    if (childrenOf[i].length > 0) {
      stack.add(i);
    }
    let cur = i;
    while (isLastChild[cur]) {
      const p = parentOf[cur];
      if (p < 0) {
        break;
      }
      stack.delete(p);
      cur = p;
    }
  }
  return lines.join("\n");
}
function renderLaneGraph(history) {
  const { events } = history;
  if (events.length === 0) {
    return "";
  }
  const nodes = [];
  const syntheticForRoot = /* @__PURE__ */ new Map();
  const nodeByEvent = /* @__PURE__ */ new Map();
  const rootsWithChildren = /* @__PURE__ */ new Set();
  for (const e of events) {
    if (!e.parent) {
      rootsWithChildren.add(e.root);
    }
  }
  for (const e of events) {
    if (rootsWithChildren.has(e.root) && !syntheticForRoot.has(e.root)) {
      const syn = { label: `+${e.root.label}`, parent: void 0, isSynthetic: true };
      syntheticForRoot.set(e.root, syn);
      nodes.push(syn);
    }
    const timeStr = `+${e.time}ms`.padStart(7);
    const parent = e.parent ? nodeByEvent.get(e.parent) : syntheticForRoot.get(e.root);
    const node = { label: `[${timeStr}] ${e.label}`, parent, isSynthetic: false };
    nodeByEvent.set(e, node);
    nodes.push(node);
  }
  const n = nodes.length;
  const parentOf = new Array(n).fill(-1);
  const childrenOf = Array.from({ length: n }, () => []);
  const indexOfNode = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    indexOfNode.set(nodes[i], i);
  }
  for (let i = 0; i < n; i++) {
    const p = nodes[i].parent;
    if (p) {
      const pi = indexOfNode.get(p);
      if (pi !== void 0) {
        parentOf[i] = pi;
        childrenOf[pi].push(i);
      }
    }
  }
  const colOf = new Array(n).fill(-1);
  let totalCols = 0;
  for (let i = 0; i < n; i++) {
    if (childrenOf[i].length > 0) {
      colOf[i] = totalCols++;
    }
  }
  if (totalCols === 0) {
    return events.map((e) => `[+${`${e.time}ms`.padStart(5)}] ${e.label}`).join("\n");
  }
  const active = new Array(totalCols).fill(-1);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const pIdx = parentOf[i];
    const connectCol = pIdx >= 0 ? colOf[pIdx] : -1;
    const last = pIdx >= 0 && childrenOf[pIdx][childrenOf[pIdx].length - 1] === i;
    const opensCol = childrenOf[i].length > 0 ? colOf[i] : -1;
    const horizEnd = pIdx >= 0 ? opensCol >= 0 ? opensCol : totalCols : -1;
    const chars = [];
    for (let c = 0; c < totalCols; c++) {
      const isActive = active[c] >= 0;
      const isConnect = c === connectCol;
      const isOpen = c === opensCol && !isConnect;
      const inHoriz = connectCol >= 0 && c > connectCol && c < horizEnd;
      let g, s;
      if (isConnect) {
        g = last ? "\u2514" : "\u251C";
        s = "\u2500";
      } else if (isOpen && node.isSynthetic) {
        g = "+";
        s = node.label.slice(1, 2) || "?";
      } else if (isOpen && connectCol >= 0) {
        g = "\u2577";
        s = "\u2500";
      } else if (isOpen) {
        g = "\u2577";
        s = " ";
      } else if (inHoriz && isActive) {
        g = "\u253C";
        s = "\u2500";
      } else if (inHoriz) {
        g = "\u2500";
        s = "\u2500";
      } else if (isActive) {
        g = "\u2502";
        s = " ";
      } else {
        g = " ";
        s = " ";
      }
      chars.push(g, s);
    }
    if (last) {
      active[colOf[pIdx]] = -1;
    }
    if (opensCol >= 0) {
      active[opensCol] = i;
    }
    if (node.isSynthetic) {
      lines.push(chars.join("").trimEnd());
    } else {
      lines.push(`${chars.join("")}${node.label}`);
    }
  }
  return lines.join("\n");
}
export {
  buildHistoryFromTasks,
  renderLaneGraph,
  renderSwimlanes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZXhlY3V0aW9uR3JhcGgudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFBsYWluLCByZW5kZXJlci1mcmllbmRseSBkZXNjcmlwdGlvbiBvZiBhbiBleGVjdXRpb24gaGlzdG9yeSBwcm9kdWNlZCBieSBhXG4gKiB0cmFjZWQgc2NoZWR1bGVyLiBUaGVzZSB0eXBlcyBoYXZlIG5vIGRlcGVuZGVuY3kgb24gdGhlIHRyYWNpbmcgb3JcbiAqIHNjaGVkdWxpbmcgaW1wbGVtZW50YXRpb24gXHUyMDE0IHRoZXkgY2FuIGJlIGJ1aWx0IGJ5IGhhbmQgaW4gdGVzdHMgb3IgYnkgdGhlXG4gKiBgYnVpbGRIaXN0b3J5RnJvbVRhc2tzYCBhZGFwdGVyIGJlbG93LlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgRXhlY3V0aW9uUm9vdCB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXhlY3V0aW9uRXZlbnQge1xuXHQvKiogUmVsYXRpdmUgdGltZSAoZS5nLiBtcyBzaW5jZSBzdGFydFRpbWUpLiBNdXN0IGJlID49IDAgYW5kIG5vbi1kZWNyZWFzaW5nIGluIGhpc3Rvcnkgb3JkZXIuICovXG5cdHJlYWRvbmx5IHRpbWU6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgcm9vdDogRXhlY3V0aW9uUm9vdDtcblx0LyoqIGB1bmRlZmluZWRgIG1lYW5zIHRoaXMgZXZlbnQgaXMgYSBkaXJlY3QgY2hpbGQgb2YgaXRzIHJvb3QuICovXG5cdHJlYWRvbmx5IHBhcmVudDogRXhlY3V0aW9uRXZlbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBDYWxsZXIgZnJhbWUgZXh0cmFjdGVkIGZyb20gdGhlIHNjaGVkdWxpbmcgc3RhY2sgdHJhY2UuICovXG5cdHJlYWRvbmx5IGRldGFpbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFeGVjdXRpb25IaXN0b3J5IHtcblx0LyoqIFJvb3RzIGluIGZpcnN0LWFwcGVhcmFuY2Ugb3JkZXIgKGNvbHVtbiBvcmRlciBmb3IgcmVuZGVyZXJzKS4gKi9cblx0cmVhZG9ubHkgcm9vdHM6IHJlYWRvbmx5IEV4ZWN1dGlvblJvb3RbXTtcblx0LyoqIEV2ZW50cyBpbiB0aW1lIG9yZGVyLiAqL1xuXHRyZWFkb25seSBldmVudHM6IHJlYWRvbmx5IEV4ZWN1dGlvbkV2ZW50W107XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBBZGFwdGVyOiBTY2hlZHVsZWRUYXNrW10gLT4gRXhlY3V0aW9uSGlzdG9yeVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIFRyYWNlTGlrZSB7XG5cdHJlYWRvbmx5IHBhcmVudDogVHJhY2VMaWtlIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByb290OiB7IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgfTtcbn1cblxuaW50ZXJmYWNlIFNjaGVkdWxlZFRhc2tMaWtlIHtcblx0cmVhZG9ubHkgdGltZTogbnVtYmVyO1xuXHRyZWFkb25seSBzb3VyY2U6IHsgdG9TdHJpbmcoKTogc3RyaW5nOyByZWFkb25seSBzdGFja1RyYWNlPzogc3RyaW5nIH07XG5cdHJlYWRvbmx5IHRyYWNlPzogVHJhY2VMaWtlO1xufVxuXG4vKipcbiAqIEEgbG9nIGVudHJ5IHRvIHdlYXZlIGludG8gdGhlIGhpc3RvcnkgYWxvbmdzaWRlIHNjaGVkdWxlZCB0YXNrcy4gRWFjaCBsb2cgaXNcbiAqIHRhZ2dlZCB3aXRoIHRoZSB0cmFjZSB0aGF0IHdhcyBjdXJyZW50IHdoZW4gaXQgd2FzIGVtaXR0ZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTG9nRW50cnlMaWtlIHtcblx0cmVhZG9ubHkgdHJhY2U6IFRyYWNlTGlrZTtcblx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIENvbnZlcnQgYSBsaXN0IG9mIHNjaGVkdWxlZCB0YXNrcyAoZWFjaCBjYXJyeWluZyBhIGNhdXNhbCBgdHJhY2VgKSBpbnRvIGFcbiAqIHBsYWluIGBFeGVjdXRpb25IaXN0b3J5YC4gVW50cmFjZWQgdGFza3MgYXJlIGRyb3BwZWQuIEEgdGFzaydzIHBhcmVudCBldmVudFxuICogaXMgdGhlIG1vc3QgcmVjZW50IGVhcmxpZXIgdGFzayB3aG9zZSBgdHJhY2VgIGlzIGB0YXNrLnRyYWNlLnBhcmVudGA7IGlmXG4gKiBgdGFzay50cmFjZS5wYXJlbnRgIGlzIHRoZSB0cmFjZSByb290IGl0c2VsZiwgdGhlIGV2ZW50IGhhcyBubyBwYXJlbnQgZXZlbnRcbiAqIChpdCBpcyBhIGRpcmVjdCBjaGlsZCBvZiB0aGUgcm9vdCkuXG4gKlxuICogYGxvZ3NgIChpZiBnaXZlbikgYXJlIGludGVybGVhdmVkIGFzIHN5bnRoZXRpYyBldmVudHM6IGVhY2ggbG9nJ3MgcGFyZW50IGlzXG4gKiB0aGUgdGFzayBldmVudCB3aG9zZSB0cmFjZSBtYXRjaGVzIHRoZSBsb2cncyBjdXJyZW50IHRyYWNlIGF0IGVtaXNzaW9uXG4gKiB0aW1lIChvciB0aGUgbmVhcmVzdCBhbmNlc3RvciB0YXNrIGV2ZW50KSwgYW5kIGl0cyB0aW1lIGlzIGluaGVyaXRlZCBmcm9tXG4gKiB0aGF0IHBhcmVudC4gV2l0aGluIGEgc2luZ2xlIHBhcmVudCB0YXNrLCBsb2dzIGFyZSBrZXB0IGluIGVtaXNzaW9uIG9yZGVyXG4gKiBhbmQgaW5zZXJ0ZWQgZGlyZWN0bHkgYWZ0ZXIgdGhlIHBhcmVudCBldmVudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkSGlzdG9yeUZyb21UYXNrcyhcblx0dGFza3M6IHJlYWRvbmx5IFNjaGVkdWxlZFRhc2tMaWtlW10sXG5cdHN0YXJ0VGltZTogbnVtYmVyLFxuXHRsb2dzOiByZWFkb25seSBMb2dFbnRyeUxpa2VbXSA9IFtdLFxuKTogRXhlY3V0aW9uSGlzdG9yeSB7XG5cdGNvbnN0IHJvb3RCeVRyYWNlID0gbmV3IE1hcDx1bmtub3duLCBFeGVjdXRpb25Sb290PigpO1xuXHRjb25zdCByb290czogRXhlY3V0aW9uUm9vdFtdID0gW107XG5cdGNvbnN0IGV2ZW50QnlUcmFjZSA9IG5ldyBNYXA8dW5rbm93biwgRXhlY3V0aW9uRXZlbnQ+KCk7XG5cdGNvbnN0IHRhc2tFdmVudHM6IEV4ZWN1dGlvbkV2ZW50W10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRjb25zdCB0cmFjZSA9IHRhc2sudHJhY2U7XG5cdFx0aWYgKCF0cmFjZSkgeyBjb250aW51ZTsgfVxuXG5cdFx0bGV0IHJvb3QgPSByb290QnlUcmFjZS5nZXQodHJhY2Uucm9vdCk7XG5cdFx0aWYgKCFyb290KSB7XG5cdFx0XHRyb290ID0geyBsYWJlbDogdHJhY2Uucm9vdC5sYWJlbCB9O1xuXHRcdFx0cm9vdEJ5VHJhY2Uuc2V0KHRyYWNlLnJvb3QsIHJvb3QpO1xuXHRcdFx0cm9vdHMucHVzaChyb290KTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBwYXJlbnQgZXZlbnQgYnkgd2Fsa2luZyB1cCB0aGUgdHJhY2UgY2hhaW4gdW50aWwgd2UgaGl0XG5cdFx0Ly8gZWl0aGVyIGEgdHJhY2Ugd2hvc2UgZXZlbnQgd2Uga25vdywgb3IgdGhlIHRyYWNlIHJvb3QuXG5cdFx0bGV0IHBhcmVudEV2ZW50OiBFeGVjdXRpb25FdmVudCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBwID0gdHJhY2UucGFyZW50OyBwOyBwID0gcC5wYXJlbnQpIHtcblx0XHRcdGNvbnN0IGUgPSBldmVudEJ5VHJhY2UuZ2V0KHApO1xuXHRcdFx0aWYgKGUpIHsgcGFyZW50RXZlbnQgPSBlOyBicmVhazsgfVxuXHRcdH1cblxuXHRcdGNvbnN0IGV2ZW50OiBFeGVjdXRpb25FdmVudCA9IHtcblx0XHRcdHRpbWU6IHRhc2sudGltZSAtIHN0YXJ0VGltZSxcblx0XHRcdGxhYmVsOiBgJHt0YXNrLnNvdXJjZX1gLFxuXHRcdFx0cm9vdCxcblx0XHRcdHBhcmVudDogcGFyZW50RXZlbnQsXG5cdFx0XHRkZXRhaWw6IGV4dHJhY3RDYWxsZXJGcmFtZSh0YXNrLnNvdXJjZS5zdGFja1RyYWNlKSxcblx0XHR9O1xuXHRcdGV2ZW50QnlUcmFjZS5zZXQodHJhY2UsIGV2ZW50KTtcblx0XHR0YXNrRXZlbnRzLnB1c2goZXZlbnQpO1xuXHR9XG5cblx0Ly8gR3JvdXAgbG9nIGVudHJpZXMgYnkgdGhlaXIgcGFyZW50IHRhc2sgZXZlbnQsIHByZXNlcnZpbmcgZW1pc3Npb25cblx0Ly8gb3JkZXIgd2l0aGluIGVhY2ggZ3JvdXAuIEEgbG9nIHdpdGhvdXQgYW4gZW5jbG9zaW5nIHRhc2sgZXZlbnQgaXNcblx0Ly8gZHJvcHBlZCAoZS5nLiBsb2dzIGVtaXR0ZWQgYXQgcm9vdCBiZWZvcmUgYW55IHRhc2sgcmFuKS5cblx0Y29uc3QgbG9nc0J5UGFyZW50ID0gbmV3IE1hcDxFeGVjdXRpb25FdmVudCwgRXhlY3V0aW9uRXZlbnRbXT4oKTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBsb2dzKSB7XG5cdFx0bGV0IHBhcmVudEV2ZW50OiBFeGVjdXRpb25FdmVudCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBwOiBUcmFjZUxpa2UgfCB1bmRlZmluZWQgPSBlbnRyeS50cmFjZTsgcDsgcCA9IHAucGFyZW50KSB7XG5cdFx0XHRjb25zdCBlID0gZXZlbnRCeVRyYWNlLmdldChwKTtcblx0XHRcdGlmIChlKSB7IHBhcmVudEV2ZW50ID0gZTsgYnJlYWs7IH1cblx0XHR9XG5cdFx0aWYgKCFwYXJlbnRFdmVudCkgeyBjb250aW51ZTsgfVxuXG5cdFx0Y29uc3QgbG9nRXZlbnQ6IEV4ZWN1dGlvbkV2ZW50ID0ge1xuXHRcdFx0dGltZTogcGFyZW50RXZlbnQudGltZSxcblx0XHRcdGxhYmVsOiBgbG9nOiAke2VudHJ5Lm1lc3NhZ2V9YCxcblx0XHRcdHJvb3Q6IHBhcmVudEV2ZW50LnJvb3QsXG5cdFx0XHRwYXJlbnQ6IHBhcmVudEV2ZW50LFxuXHRcdH07XG5cdFx0Y29uc3QgYnVja2V0ID0gbG9nc0J5UGFyZW50LmdldChwYXJlbnRFdmVudCk7XG5cdFx0aWYgKGJ1Y2tldCkgeyBidWNrZXQucHVzaChsb2dFdmVudCk7IH1cblx0XHRlbHNlIHsgbG9nc0J5UGFyZW50LnNldChwYXJlbnRFdmVudCwgW2xvZ0V2ZW50XSk7IH1cblx0fVxuXG5cdC8vIEludGVybGVhdmU6IGVhY2ggdGFzayBldmVudCBmb2xsb3dlZCBieSBpdHMgbG9ncyBpbiBlbWlzc2lvbiBvcmRlci5cblx0Y29uc3QgZXZlbnRzOiBFeGVjdXRpb25FdmVudFtdID0gW107XG5cdGZvciAoY29uc3QgZSBvZiB0YXNrRXZlbnRzKSB7XG5cdFx0ZXZlbnRzLnB1c2goZSk7XG5cdFx0Y29uc3QgbHMgPSBsb2dzQnlQYXJlbnQuZ2V0KGUpO1xuXHRcdGlmIChscykgeyBldmVudHMucHVzaCguLi5scyk7IH1cblx0fVxuXG5cdHJldHVybiB7IHJvb3RzLCBldmVudHMgfTtcbn1cblxuLyoqXG4gKiBFeHRyYWN0IHVwIHRvIHtAbGluayBNQVhfREVUQUlMX0ZSQU1FU30gc3RhY2sgZnJhbWVzIHRoYXQgYXJlIG5vdCBmcm9tXG4gKiB0aGUgc2NoZWR1bGVyL3RyYWNpbmcgaW5mcmFzdHJ1Y3R1cmUuIFJldHVybnMgdGhlIGZyYW1lcyBqb2luZWQgYnlcbiAqIG5ld2xpbmUgKGNhbGxlcnMgbWF5IHJlbmRlciB0aGVtIHN0YWNrZWQpIG9yIGB1bmRlZmluZWRgIHdoZW4gbm9uZS5cbiAqL1xuY29uc3QgX3NraXBGcmFtZVBhdHRlcm5zID0gW1xuXHQvW1xcXFwvXXZpcnR1YWxTY2hlZHVsaW5nW1xcXFwvXS8sXG5cdC9bXFxcXC9ddnNbXFxcXC9dYmFzZVtcXFxcL11jb21tb25bXFxcXC9dYXN5bmNcXC4vLFxuXHQvdGltZVRyYXZlbFNjaGVkdWxlcnx0cmFjZWFibGVUaW1lQXBpLyxcblx0L1J1bk9uY2VTY2hlZHVsZXJcXC5zY2hlZHVsZS8sXG5cdC9zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lLyxcblx0L1RpbWVvdXRUaW1lclxcLmNhbmNlbEFuZFNldC8sXG5cdC9UaW1lb3V0VGltZXJcXC5zZXRJZk5vdFNldC8sXG5cdC90aW1lb3V0RGVmZXJyZWQvLFxuXHQvY3JlYXRlVGltZW91dC8sXG5dO1xuXG5jb25zdCBNQVhfREVUQUlMX0ZSQU1FUyA9IDU7XG5cbmZ1bmN0aW9uIGV4dHJhY3RDYWxsZXJGcmFtZShzdGFja1RyYWNlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXN0YWNrVHJhY2UpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb25zdCBmcmFtZXM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBzdGFja1RyYWNlLnNwbGl0KCdcXG4nKSkge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcblx0XHRpZiAoIXRyaW1tZWQuc3RhcnRzV2l0aCgnYXQgJykpIHsgY29udGludWU7IH1cblx0XHRpZiAoX3NraXBGcmFtZVBhdHRlcm5zLnNvbWUocCA9PiBwLnRlc3QodHJpbW1lZCkpKSB7IGNvbnRpbnVlOyB9XG5cdFx0ZnJhbWVzLnB1c2godHJpbW1lZC5zbGljZSgzKSk7XG5cdFx0aWYgKGZyYW1lcy5sZW5ndGggPj0gTUFYX0RFVEFJTF9GUkFNRVMpIHsgYnJlYWs7IH1cblx0fVxuXHRyZXR1cm4gZnJhbWVzLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IGZyYW1lcy5qb2luKCdcXG4nKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFJlbmRlcmVyOiBzd2ltbGFuZSAob25lIGNvbHVtbiBwZXIgcm9vdClcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUmVuZGVyIGBoaXN0b3J5YCBhcyBhIHN3aW1sYW5lIGRpYWdyYW06IG9uZSBjb2x1bW4gcGVyIHJvb3QsIGV2ZW50cyBpbiB0aGVcbiAqIGNvbHVtbiBvZiB0aGVpciByb290LCBwYXJlbnRcdTIxOTJjaGlsZCBzaG93biB2aWEgYFx1MjUxQ1x1MjUwMGAvYFx1MjUxNFx1MjUwMGAgaW5kZW50YXRpb24sIGFjdGl2ZVxuICogYW5jZXN0b3JzIHNob3duIHZpYSBgXHUyNTAyYCBjb250aW51YXRpb24gbGluZXMuXG4gKlxuICogRXhhbXBsZTpcbiAqIGBgYFxuICogICAgICAgICAgICAgICAgICBBICAgICAgICAgICBCXG4gKiAgICswbXMgXHUyNTFDXHUyNTAwIHNldFRpbWVvdXRcbiAqICArMTBtcyBcdTI1MDIgICAgICAgICAgIFx1MjUxQ1x1MjUwMCBzZXRUaW1lb3V0XG4gKiAgKzE2bXMgXHUyNTFDXHUyNTAwIHJBRiAgICAgIFx1MjUwMlxuICogICs1MG1zIFx1MjUxNFx1MjUwMCBzZXRUaW1lb3V0XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclN3aW1sYW5lcyhoaXN0b3J5OiBFeGVjdXRpb25IaXN0b3J5KTogc3RyaW5nIHtcblx0Y29uc3QgeyByb290cywgZXZlbnRzIH0gPSBoaXN0b3J5O1xuXHRpZiAoZXZlbnRzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm4gJyhlbXB0eSBoaXN0b3J5KSc7IH1cblx0aWYgKHJvb3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBldmVudHMubWFwKGUgPT4gYFsrJHtlLnRpbWV9bXNdICR7ZS5sYWJlbH1gKS5qb2luKCdcXG4nKTtcblx0fVxuXG5cdGNvbnN0IG4gPSBldmVudHMubGVuZ3RoO1xuXG5cdC8vIFBhcmVudCBpbmRleCBwZXIgZXZlbnQgKC0xID0gZGlyZWN0IGNoaWxkIG9mIHJvb3QpLlxuXHRjb25zdCBwYXJlbnRPZiA9IG5ldyBBcnJheTxudW1iZXI+KG4pLmZpbGwoLTEpO1xuXHRjb25zdCBjaGlsZHJlbk9mOiBudW1iZXJbXVtdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogbiB9LCAoKSA9PiBbXSk7XG5cdGNvbnN0IGluZGV4T2ZFdmVudCA9IG5ldyBNYXA8RXhlY3V0aW9uRXZlbnQsIG51bWJlcj4oKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHsgaW5kZXhPZkV2ZW50LnNldChldmVudHNbaV0sIGkpOyB9XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgcCA9IGV2ZW50c1tpXS5wYXJlbnQ7XG5cdFx0aWYgKHApIHtcblx0XHRcdGNvbnN0IHBpID0gaW5kZXhPZkV2ZW50LmdldChwKTtcblx0XHRcdGlmIChwaSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhcmVudE9mW2ldID0gcGk7XG5cdFx0XHRcdGNoaWxkcmVuT2ZbcGldLnB1c2goaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gSXMgdGhpcyBldmVudCB0aGUgbGFzdCBjaGlsZCBvZiBpdHMgcGFyZW50IGV2ZW50P1xuXHRjb25zdCBpc0xhc3RDaGlsZCA9IG5ldyBBcnJheTxib29sZWFuPihuKS5maWxsKGZhbHNlKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBwID0gcGFyZW50T2ZbaV07XG5cdFx0aWYgKHAgPj0gMCAmJiBjaGlsZHJlbk9mW3BdW2NoaWxkcmVuT2ZbcF0ubGVuZ3RoIC0gMV0gPT09IGkpIHsgaXNMYXN0Q2hpbGRbaV0gPSB0cnVlOyB9XG5cdH1cblxuXHQvLyBTbG90ID0gdmlzdWFsIGNvbHVtbiBpbmRleCBmb3IgaW5kZW50YXRpb24uIEJ5IGRlZmF1bHQgZXZlcnkgY2hpbGRcblx0Ly8gZ2V0cyBpdHMgb3duIGNvbHVtbiAoc2xvdCA9IHBhcmVudC5zbG90ICsgMSkgc28gcHVyZSBsYXN0LWNoaWxkIGNoYWluc1xuXHQvLyBzdGlsbCBzaG93IHRoZWlyIGRlcHRoIHN0cnVjdHVyZS4gT25jZSB3ZSBwYXNzIHRoZSBkZXB0aCB0aHJlc2hvbGQsXG5cdC8vIGxhc3QtY2hpbGRyZW4gY29sbGFwc2UgaW50byB0aGVpciBwYXJlbnQncyBzbG90IHRvIGtlZXAgZGVlcGx5IG5lc3RlZFxuXHQvLyB0cmFjZXMgZnJvbSB3YWxraW5nIG9mZiB0aGUgc2NyZWVuLlxuXHRjb25zdCBDT0xMQVBTRV9ERVBUSF9USFJFU0hPTEQgPSA2O1xuXHRjb25zdCBkZXB0aE9mID0gbmV3IEFycmF5PG51bWJlcj4obikuZmlsbCgwKTtcblx0Y29uc3Qgc2xvdE9mID0gbmV3IEFycmF5PG51bWJlcj4obikuZmlsbCgwKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBwID0gcGFyZW50T2ZbaV07XG5cdFx0aWYgKHAgPj0gMCkge1xuXHRcdFx0ZGVwdGhPZltpXSA9IGRlcHRoT2ZbcF0gKyAxO1xuXHRcdFx0Y29uc3QgY29sbGFwc2UgPSBpc0xhc3RDaGlsZFtpXSAmJiBkZXB0aE9mW2ldID49IENPTExBUFNFX0RFUFRIX1RIUkVTSE9MRDtcblx0XHRcdHNsb3RPZltpXSA9IHNsb3RPZltwXSArIChjb2xsYXBzZSA/IDAgOiAxKTtcblx0XHR9XG5cdH1cblxuXHQvLyBEaXNwbGF5IGxhYmVsID0gbGFiZWwgcGx1cyB0aGUgY2FsbGVyIHN0YWNrIGZyYW1lIHdoZW4gcHJlc2VudCxcblx0Ly8gZS5nLiBgc2V0VGltZW91dCBcdTAwQjcgTXlDbGFzcy5mb28gKGZpbGUudHM6NDIpYC4gQ29tcHV0ZWQgb25jZSBzbyB3aWR0aFxuXHQvLyBtYXRoIGFuZCB0aGUgcGVyLXJvdyByZW5kZXIgYWdyZWUuIGBkZXRhaWxMaW5lc2AgaG9sZHMgYW55IGFkZGl0aW9uYWxcblx0Ly8gc3RhY2sgZnJhbWVzIGJleW9uZCB0aGUgZmlyc3Q7IHRoZXkgYXJlIHJlbmRlcmVkIGFzIGNvbnRpbnVhdGlvbiByb3dzLlxuXHRjb25zdCBkaXNwbGF5TGFiZWxPZiA9IG5ldyBBcnJheTxzdHJpbmc+KG4pO1xuXHRjb25zdCBkZXRhaWxMaW5lc09mID0gbmV3IEFycmF5PHJlYWRvbmx5IHN0cmluZ1tdPihuKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBlID0gZXZlbnRzW2ldO1xuXHRcdGNvbnN0IGZyYW1lcyA9IGUuZGV0YWlsID8gZS5kZXRhaWwuc3BsaXQoJ1xcbicpIDogW107XG5cdFx0ZGlzcGxheUxhYmVsT2ZbaV0gPSBmcmFtZXMubGVuZ3RoID4gMCA/IGAke2UubGFiZWx9IFx1MDBCNyAke2ZyYW1lc1swXX1gIDogZS5sYWJlbDtcblx0XHRkZXRhaWxMaW5lc09mW2ldID0gZnJhbWVzLnNsaWNlKDEpO1xuXHR9XG5cblx0Ly8gQ29sdW1uIHdpZHRoIHBlciByb290OiBpbmRlbnRhdGlvbiB1c2VzIHNsb3RzIChsYXN0LWNoaWxkcmVuIGNvbGxhcHNlXG5cdC8vIGludG8gdGhlaXIgcGFyZW50J3Mgc2xvdCksIHNvIHdpZHRoIG11c3QgYmUgc2xvdC1iYXNlZCB0byBhdm9pZFxuXHQvLyByZXNlcnZpbmcgZW1wdHkgc3BhY2UgZm9yIGRlZ2VuZXJhdGUgbGFzdC1jaGlsZCBjaGFpbnMuXG5cdGNvbnN0IHdpZHRoT2YgPSBuZXcgTWFwPEV4ZWN1dGlvblJvb3QsIG51bWJlcj4oKTtcblx0Zm9yIChjb25zdCByIG9mIHJvb3RzKSB7IHdpZHRoT2Yuc2V0KHIsIHIubGFiZWwubGVuZ3RoKTsgfVxuXHRmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuXHRcdGNvbnN0IGJhc2VJbmRlbnQgPSBzbG90T2ZbaV0gKiAzICsgMztcblx0XHRjb25zdCBtYXhMZW4gPSBNYXRoLm1heChkaXNwbGF5TGFiZWxPZltpXS5sZW5ndGgsIC4uLmRldGFpbExpbmVzT2ZbaV0ubWFwKGwgPT4gbC5sZW5ndGggKyAyKSk7XG5cdFx0Y29uc3QgdyA9IGJhc2VJbmRlbnQgKyBtYXhMZW47XG5cdFx0Y29uc3QgY3VyID0gd2lkdGhPZi5nZXQoZXZlbnRzW2ldLnJvb3QpID8/IDA7XG5cdFx0aWYgKHcgPiBjdXIpIHsgd2lkdGhPZi5zZXQoZXZlbnRzW2ldLnJvb3QsIHcpOyB9XG5cdH1cblxuXHQvLyBDb21wdXRlIHRpbWUgY29sdW1uIHdpZHRoIGJhc2VkIG9uIG1heCB0aW1lIChyb3VuZGVkKS5cblx0Y29uc3QgbWF4VGltZSA9IG4gPiAwID8gTWF0aC5tYXgoLi4uZXZlbnRzLm1hcChlID0+IE1hdGgucm91bmQoZS50aW1lKSkpIDogMDtcblx0Y29uc3QgdGltZUNvbFdpZHRoID0gYCske21heFRpbWV9bXNgLmxlbmd0aDtcblxuXHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHQvLyBIZWFkZXI6IHJvb3QgbGFiZWxzIGNlbnRlcmVkIGluIHRoZWlyIGNvbHVtbnMuXG5cdGNvbnN0IGhlYWRlcjogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCByIG9mIHJvb3RzKSB7XG5cdFx0Y29uc3QgdyA9IHdpZHRoT2YuZ2V0KHIpITtcblx0XHRoZWFkZXIucHVzaChyLmxhYmVsLnBhZFN0YXJ0KE1hdGguY2VpbCgodyArIHIubGFiZWwubGVuZ3RoKSAvIDIpKS5wYWRFbmQodykpO1xuXHR9XG5cdGxpbmVzLnB1c2goYCR7JyAnLnJlcGVhdCh0aW1lQ29sV2lkdGgpfSAke2hlYWRlci5qb2luKCcgICcpfWAudHJpbUVuZCgpKTtcblxuXHQvLyBDb21wdXRlIGxhc3RDaGlsZCBpbmRleCBmb3IgZWFjaCBldmVudCAoZm9yIGRyYXdpbmcgY29udGludWF0aW9uIGxpbmVzKS5cblx0Y29uc3QgbGFzdENoaWxkT2YgPSBuZXcgQXJyYXk8bnVtYmVyPihuKS5maWxsKC0xKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBraWRzID0gY2hpbGRyZW5PZltpXTtcblx0XHRpZiAoa2lkcy5sZW5ndGggPiAwKSB7IGxhc3RDaGlsZE9mW2ldID0ga2lkc1traWRzLmxlbmd0aCAtIDFdOyB9XG5cdH1cblxuXHQvLyBQZXItcm9vdDogc2V0IG9mIFwiYWN0aXZlIGFuY2VzdG9yXCIgZXZlbnQgaW5kaWNlcyAoZXZlbnRzIHdpdGggY2hpbGRyZW5cblx0Ly8gd2hvc2UgbGFzdCBjaGlsZCBoYXMgbm90IHlldCBiZWVuIHJlbmRlcmVkLCBpLmUuIGxhc3RDaGlsZE9mW2FdID4gaSkuXG5cdGNvbnN0IGxhbmVTdGFja3MgPSBuZXcgTWFwPEV4ZWN1dGlvblJvb3QsIFNldDxudW1iZXI+PigpO1xuXHRmb3IgKGNvbnN0IHIgb2Ygcm9vdHMpIHsgbGFuZVN0YWNrcy5zZXQociwgbmV3IFNldCgpKTsgfVxuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgZXZlbnQgPSBldmVudHNbaV07XG5cdFx0Y29uc3QgdGltZVN0ciA9IGArJHtNYXRoLnJvdW5kKGV2ZW50LnRpbWUpfW1zYC5wYWRTdGFydCh0aW1lQ29sV2lkdGgpO1xuXG5cdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCByIG9mIHJvb3RzKSB7XG5cdFx0XHRjb25zdCB3ID0gd2lkdGhPZi5nZXQocikhO1xuXHRcdFx0Y29uc3Qgc3RhY2sgPSBsYW5lU3RhY2tzLmdldChyKSE7XG5cblx0XHRcdGlmIChyID09PSBldmVudC5yb290KSB7XG5cdFx0XHRcdC8vIEV2ZW50IGxpbmU6IHNsb3QtYmFzZWQgaW5kZW50YXRpb24sIHRoZW4gYFx1MjUxQ1x1MjUwMGAvYFx1MjUxNFx1MjUwMGAgKyBsYWJlbC5cblx0XHRcdFx0Ly8gRm9yIGVhY2ggc2xvdCBzIGluIDAuLihzbG90LTEpLCBzaG93IGBcdTI1MDIgIGAgaWYgYW4gYW5jZXN0b3Jcblx0XHRcdFx0Ly8gYXQgc2xvdCBzIGlzIHN0aWxsIGFjdGl2ZSAobGFzdENoaWxkID4gY3VycmVudCksIGVsc2UgYCAgIGAuXG5cdFx0XHRcdGNvbnN0IHNsb3QgPSBzbG90T2ZbaV07XG5cdFx0XHRcdGNvbnN0IGluZGVudDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzbG90OyBzKyspIHtcblx0XHRcdFx0XHRsZXQgaGFzQWN0aXZlID0gZmFsc2U7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIHN0YWNrKSB7XG5cdFx0XHRcdFx0XHRpZiAoc2xvdE9mW2FdID09PSBzICYmIGxhc3RDaGlsZE9mW2FdID4gaSkgeyBoYXNBY3RpdmUgPSB0cnVlOyBicmVhazsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpbmRlbnQucHVzaChoYXNBY3RpdmUgPyAnXHUyNTAyICAnIDogJyAgICcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByZWZpeCA9IGlzTGFzdENoaWxkW2ldID8gJ1x1MjUxNFx1MjUwMCAnIDogJ1x1MjUxQ1x1MjUwMCAnO1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGAke2luZGVudC5qb2luKCcnKX0ke3ByZWZpeH0ke2Rpc3BsYXlMYWJlbE9mW2ldfWAucGFkRW5kKHcpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIENyb3NzLWxhbmUgY29udGludWF0aW9uLiBEcmF3IGBcdTI1MDJgIGF0IGVhY2ggc2xvdCBvY2N1cGllZCBieVxuXHRcdFx0XHQvLyBhbiBhY3RpdmUgYW5jZXN0b3IgKGxhc3RDaGlsZCA+IGkpLiBBbHNvIHNob3cgYSBgfGAgcGxhY2Vob2xkZXJcblx0XHRcdFx0Ly8gYXQgdGhlIHNsb3Qgb2YgdGhlIG5leHQgdXBjb21pbmcgZXZlbnQgaWYgaXQncyBhIG5vbi1sYXN0IGNoaWxkLlxuXHRcdFx0XHRjb25zdCBhY3RpdmVTbG90czogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIHN0YWNrKSB7XG5cdFx0XHRcdFx0aWYgKGxhc3RDaGlsZE9mW2FdID4gaSkgeyBhY3RpdmVTbG90cy5wdXNoKHNsb3RPZlthXSk7IH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtYXhTbG90ID0gTWF0aC5tYXgoLi4uYWN0aXZlU2xvdHMsIC0xKTtcblx0XHRcdFx0Y29uc3QgY2hhcnM6IHN0cmluZ1tdID0gbmV3IEFycmF5KE1hdGgubWF4KG1heFNsb3QgKyAxLCAwKSkuZmlsbCgnICAgJyk7XG5cdFx0XHRcdGZvciAoY29uc3QgcyBvZiBhY3RpdmVTbG90cykgeyBjaGFyc1tzXSA9ICdcdTI1MDIgICc7IH1cblxuXHRcdFx0XHQvLyBGaW5kIHRoZSBuZXh0IGV2ZW50IGluIHJvb3QgciBzdHJpY3RseSBhZnRlciBpLlxuXHRcdFx0XHRsZXQgbmV4dEogPSAtMTtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgbjsgaisrKSB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50c1tqXS5yb290ID09PSByKSB7IG5leHRKID0gajsgYnJlYWs7IH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmV4dEogPj0gMCAmJiBwYXJlbnRPZltuZXh0Sl0gPj0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHMgPSBzbG90T2ZbbmV4dEpdO1xuXHRcdFx0XHRcdC8vIFJlc2VydmUgc2xvdCBpZiBuZXh0IGV2ZW50IHdpbGwgb3BlbiBhIG5ldyBicmFuY2ggKFx1MjUxQ1x1MjUwMCkuXG5cdFx0XHRcdFx0aWYgKCFpc0xhc3RDaGlsZFtuZXh0Sl0pIHtcblx0XHRcdFx0XHRcdHdoaWxlIChjaGFycy5sZW5ndGggPD0gcykgeyBjaGFycy5wdXNoKCcgICAnKTsgfVxuXHRcdFx0XHRcdFx0aWYgKGNoYXJzW3NdID09PSAnICAgJykgeyBjaGFyc1tzXSA9ICd8ICAnOyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVHJpbSB0cmFpbGluZyBlbXB0eSBjZWxscy5cblx0XHRcdFx0d2hpbGUgKGNoYXJzLmxlbmd0aCA+IDAgJiYgY2hhcnNbY2hhcnMubGVuZ3RoIC0gMV0gPT09ICcgICAnKSB7IGNoYXJzLnBvcCgpOyB9XG5cdFx0XHRcdHBhcnRzLnB1c2goY2hhcnMuam9pbignJykucGFkRW5kKHcpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsaW5lcy5wdXNoKGAke3RpbWVTdHJ9ICR7cGFydHMuam9pbignICAnKX1gLnRyaW1FbmQoKSk7XG5cblx0XHQvLyBDb250aW51YXRpb24gbGluZXMgZm9yIGFueSBleHRyYSBzdGFjayBmcmFtZXMuIEluZGVudGVkIHVuZGVyIHRoZVxuXHRcdC8vIGxhYmVsLCB3aXRoIG5vIHRpbWUgY29sdW1uLCBubyBgXHUyNTFDXHUyNTAwYC9gXHUyNTE0XHUyNTAwYCBnbHlwaCwgYW5kIGBcdTI1MDIgIGBcblx0XHQvLyBjb250aW51YXRpb25zIGZvciBhY3RpdmUgYW5jZXN0b3IgbGFuZXMgKGluY2x1ZGluZyB0aGlzIGV2ZW50IGl0c2VsZlxuXHRcdC8vIHdoZW4gaXQgaGFzIGNoaWxkcmVuIHRoYXQgaGF2ZW4ndCBiZWVuIHJlbmRlcmVkIHlldCkuXG5cdFx0Y29uc3QgZXh0cmFzID0gZGV0YWlsTGluZXNPZltpXTtcblx0XHRpZiAoZXh0cmFzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNsb3QgPSBzbG90T2ZbaV07XG5cdFx0XHRjb25zdCBzdGFja0ZvckV4dHJhcyA9IGxhbmVTdGFja3MuZ2V0KGV2ZW50LnJvb3QpITtcblx0XHRcdC8vIFByZXRlbmQgdGhpcyBldmVudCBpcyBhbHJlYWR5IG9uIHRoZSBsYW5lIHN0YWNrIHNvIGl0cyBjb2x1bW5cblx0XHRcdC8vIGdldHMgYSBjb250aW51YXRpb24gZ2x5cGggYmVuZWF0aCB0aGUgYFx1MjUxQ1x1MjUwMGAvYFx1MjUxNFx1MjUwMGAuXG5cdFx0XHRjb25zdCBoYXNPcGVuQ2hpbGRyZW4gPSBjaGlsZHJlbk9mW2ldLmxlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCBleHRyYUluZGVudDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2xvdDsgcysrKSB7XG5cdFx0XHRcdGxldCBoYXNBY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIHN0YWNrRm9yRXh0cmFzKSB7XG5cdFx0XHRcdFx0aWYgKHNsb3RPZlthXSA9PT0gcyAmJiBsYXN0Q2hpbGRPZlthXSA+IGkpIHsgaGFzQWN0aXZlID0gdHJ1ZTsgYnJlYWs7IH1cblx0XHRcdFx0fVxuXHRcdFx0XHRleHRyYUluZGVudC5wdXNoKGhhc0FjdGl2ZSA/ICdcdTI1MDIgICcgOiAnICAgJyk7XG5cdFx0XHR9XG5cdFx0XHRleHRyYUluZGVudC5wdXNoKGhhc09wZW5DaGlsZHJlbiA/ICdcdTI1MDIgICcgOiAnICAgJyk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dHJhIG9mIGV4dHJhcykge1xuXHRcdFx0XHRjb25zdCBleHRyYXNQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJvb3RzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdyA9IHdpZHRoT2YuZ2V0KHIpITtcblx0XHRcdFx0XHRpZiAociA9PT0gZXZlbnQucm9vdCkge1xuXHRcdFx0XHRcdFx0ZXh0cmFzUGFydHMucHVzaChgJHtleHRyYUluZGVudC5qb2luKCcnKX0ke2V4dHJhfWAucGFkRW5kKHcpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gUmV1c2UgdGhlIHNhbWUgY29udGludWF0aW9uIGxvZ2ljOiBhbnkgYWN0aXZlIGxhbmUgb25cblx0XHRcdFx0XHRcdC8vIG90aGVyIHJvb3RzIG5lZWRzIGBcdTI1MDJgIGdseXBocy5cblx0XHRcdFx0XHRcdGNvbnN0IG90aGVyU3RhY2sgPSBsYW5lU3RhY2tzLmdldChyKSE7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVTbG90czogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYSBvZiBvdGhlclN0YWNrKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChsYXN0Q2hpbGRPZlthXSA+IGkpIHsgYWN0aXZlU2xvdHMucHVzaChzbG90T2ZbYV0pOyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBtYXhTbG90ID0gTWF0aC5tYXgoLi4uYWN0aXZlU2xvdHMsIC0xKTtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYXJzOiBzdHJpbmdbXSA9IG5ldyBBcnJheShNYXRoLm1heChtYXhTbG90ICsgMSwgMCkpLmZpbGwoJyAgICcpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIGFjdGl2ZVNsb3RzKSB7IGNoYXJzW3NdID0gJ1x1MjUwMiAgJzsgfVxuXHRcdFx0XHRcdFx0d2hpbGUgKGNoYXJzLmxlbmd0aCA+IDAgJiYgY2hhcnNbY2hhcnMubGVuZ3RoIC0gMV0gPT09ICcgICAnKSB7IGNoYXJzLnBvcCgpOyB9XG5cdFx0XHRcdFx0XHRleHRyYXNQYXJ0cy5wdXNoKGNoYXJzLmpvaW4oJycpLnBhZEVuZCh3KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRpbWVQYWQgPSAnICcucmVwZWF0KHRpbWVDb2xXaWR0aCk7XG5cdFx0XHRcdGxpbmVzLnB1c2goYCR7dGltZVBhZH0gJHtleHRyYXNQYXJ0cy5qb2luKCcgICcpfWAudHJpbUVuZCgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTdGFjayBtYWludGVuYW5jZTogcHVzaCB0aGlzIGV2ZW50IGlmIGl0IGhhcyBjaGlsZHJlbiwgdGhlbiBwb3Bcblx0XHQvLyBhbnkgYW5jZXN0b3JzIHdob3NlIGxhc3QgY2hpbGQgd2FzIGp1c3QgcmVuZGVyZWQgKHByb3BhZ2F0aW5nIHVwKS5cblx0XHRjb25zdCBzdGFjayA9IGxhbmVTdGFja3MuZ2V0KGV2ZW50LnJvb3QpITtcblx0XHRpZiAoY2hpbGRyZW5PZltpXS5sZW5ndGggPiAwKSB7IHN0YWNrLmFkZChpKTsgfVxuXHRcdGxldCBjdXIgPSBpO1xuXHRcdHdoaWxlIChpc0xhc3RDaGlsZFtjdXJdKSB7XG5cdFx0XHRjb25zdCBwID0gcGFyZW50T2ZbY3VyXTtcblx0XHRcdGlmIChwIDwgMCkgeyBicmVhazsgfVxuXHRcdFx0c3RhY2suZGVsZXRlKHApO1xuXHRcdFx0Y3VyID0gcDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBSZW5kZXJlcjogaW50ZXJsZWF2ZWQgbGFuZSBncmFwaCAoZ2l0LWxvZyBzdHlsZSlcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUmVuZGVyIGBoaXN0b3J5YCBhcyBhbiBpbnRlcmxlYXZlZC1sYW5lIFwiZ2l0IGxvZ1wiIHN0eWxlIGdyYXBoLiBFYWNoIHBhcmVudFxuICogZXZlbnQgZ2V0cyBhIGNvbHVtbjsgY29sdW1ucyBhcmUgbGFpZCBvdXQgbGVmdC10by1yaWdodCBpbiBldmVudCBvcmRlci5cbiAqIFRyYWNlIHJvb3RzIHdpdGggYXQgbGVhc3Qgb25lIGRpcmVjdCBjaGlsZCBiZWNvbWUgc3ludGhldGljIGArbGFiZWxgIHJvd3NcbiAqIGluc2VydGVkIGJlZm9yZSB0aGVpciBmaXJzdCBjaGlsZC5cbiAqXG4gKiBHbHlwaHM6XG4gKiAgIGBcdTI1NzdgICBsYW5lIG9yaWdpbiAodGhpcyBub2RlIGlzIGEgcGFyZW50KVxuICogICBgXHUyNTAyYCAgbGFuZSBwYXNzZXMgdGhyb3VnaFxuICogICBgXHUyNTFDXHUyNTAwYCBjaGlsZCBjb25uZWN0czsgbGFuZSBjb250aW51ZXNcbiAqICAgYFx1MjUxNFx1MjUwMGAgbGFzdCBjaGlsZCBjb25uZWN0czsgbGFuZSBjbG9zZXNcbiAqICAgYFx1MjUzQ1x1MjUwMGAgaG9yaXpvbnRhbCBjb25uZWN0b3IgY3Jvc3NlcyBhbiBhY3RpdmUgbGFuZVxuICogICBgXHUyNTAwXHUyNTAwYCBob3Jpem9udGFsIGNvbm5lY3RvciBjcm9zc2VzIGFuIGVtcHR5IGNvbHVtblxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyTGFuZUdyYXBoKGhpc3Rvcnk6IEV4ZWN1dGlvbkhpc3RvcnkpOiBzdHJpbmcge1xuXHRjb25zdCB7IGV2ZW50cyB9ID0gaGlzdG9yeTtcblx0aWYgKGV2ZW50cy5sZW5ndGggPT09IDApIHsgcmV0dXJuICcnOyB9XG5cblx0aW50ZXJmYWNlIE5vZGUge1xuXHRcdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcGFyZW50OiBOb2RlIHwgdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IGlzU3ludGhldGljOiBib29sZWFuO1xuXHR9XG5cblx0Ly8gSW5zZXJ0IHN5bnRoZXRpYyByb290IG5vZGVzIGJlZm9yZSB0aGVpciBmaXJzdCBjaGlsZC5cblx0Y29uc3Qgbm9kZXM6IE5vZGVbXSA9IFtdO1xuXHRjb25zdCBzeW50aGV0aWNGb3JSb290ID0gbmV3IE1hcDxFeGVjdXRpb25Sb290LCBOb2RlPigpO1xuXHRjb25zdCBub2RlQnlFdmVudCA9IG5ldyBNYXA8RXhlY3V0aW9uRXZlbnQsIE5vZGU+KCk7XG5cblx0Ly8gV2hpY2ggcm9vdHMgaGF2ZSBhdCBsZWFzdCBvbmUgZGlyZWN0IGNoaWxkIGV2ZW50P1xuXHRjb25zdCByb290c1dpdGhDaGlsZHJlbiA9IG5ldyBTZXQ8RXhlY3V0aW9uUm9vdD4oKTtcblx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykgeyBpZiAoIWUucGFyZW50KSB7IHJvb3RzV2l0aENoaWxkcmVuLmFkZChlLnJvb3QpOyB9IH1cblxuXHRmb3IgKGNvbnN0IGUgb2YgZXZlbnRzKSB7XG5cdFx0aWYgKHJvb3RzV2l0aENoaWxkcmVuLmhhcyhlLnJvb3QpICYmICFzeW50aGV0aWNGb3JSb290LmhhcyhlLnJvb3QpKSB7XG5cdFx0XHRjb25zdCBzeW46IE5vZGUgPSB7IGxhYmVsOiBgKyR7ZS5yb290LmxhYmVsfWAsIHBhcmVudDogdW5kZWZpbmVkLCBpc1N5bnRoZXRpYzogdHJ1ZSB9O1xuXHRcdFx0c3ludGhldGljRm9yUm9vdC5zZXQoZS5yb290LCBzeW4pO1xuXHRcdFx0bm9kZXMucHVzaChzeW4pO1xuXHRcdH1cblx0XHRjb25zdCB0aW1lU3RyID0gYCske2UudGltZX1tc2AucGFkU3RhcnQoNyk7XG5cdFx0Y29uc3QgcGFyZW50ID0gZS5wYXJlbnQgPyBub2RlQnlFdmVudC5nZXQoZS5wYXJlbnQpISA6IHN5bnRoZXRpY0ZvclJvb3QuZ2V0KGUucm9vdCk7XG5cdFx0Y29uc3Qgbm9kZTogTm9kZSA9IHsgbGFiZWw6IGBbJHt0aW1lU3RyfV0gJHtlLmxhYmVsfWAsIHBhcmVudCwgaXNTeW50aGV0aWM6IGZhbHNlIH07XG5cdFx0bm9kZUJ5RXZlbnQuc2V0KGUsIG5vZGUpO1xuXHRcdG5vZGVzLnB1c2gobm9kZSk7XG5cdH1cblxuXHRjb25zdCBuID0gbm9kZXMubGVuZ3RoO1xuXHRjb25zdCBwYXJlbnRPZiA9IG5ldyBBcnJheTxudW1iZXI+KG4pLmZpbGwoLTEpO1xuXHRjb25zdCBjaGlsZHJlbk9mOiBudW1iZXJbXVtdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogbiB9LCAoKSA9PiBbXSk7XG5cdGNvbnN0IGluZGV4T2ZOb2RlID0gbmV3IE1hcDxOb2RlLCBudW1iZXI+KCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7IGluZGV4T2ZOb2RlLnNldChub2Rlc1tpXSwgaSk7IH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBwID0gbm9kZXNbaV0ucGFyZW50O1xuXHRcdGlmIChwKSB7XG5cdFx0XHRjb25zdCBwaSA9IGluZGV4T2ZOb2RlLmdldChwKTtcblx0XHRcdGlmIChwaSAhPT0gdW5kZWZpbmVkKSB7IHBhcmVudE9mW2ldID0gcGk7IGNoaWxkcmVuT2ZbcGldLnB1c2goaSk7IH1cblx0XHR9XG5cdH1cblxuXHQvLyBBc3NpZ24gY29sdW1uczogZXZlcnkgbm9kZSB3aXRoIGNoaWxkcmVuIGdldHMgaXRzIG93biBjb2x1bW4uXG5cdGNvbnN0IGNvbE9mID0gbmV3IEFycmF5PG51bWJlcj4obikuZmlsbCgtMSk7XG5cdGxldCB0b3RhbENvbHMgPSAwO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuXHRcdGlmIChjaGlsZHJlbk9mW2ldLmxlbmd0aCA+IDApIHsgY29sT2ZbaV0gPSB0b3RhbENvbHMrKzsgfVxuXHR9XG5cblx0aWYgKHRvdGFsQ29scyA9PT0gMCkge1xuXHRcdHJldHVybiBldmVudHMubWFwKGUgPT4gYFsrJHtgJHtlLnRpbWV9bXNgLnBhZFN0YXJ0KDUpfV0gJHtlLmxhYmVsfWApLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0Y29uc3QgYWN0aXZlID0gbmV3IEFycmF5PG51bWJlcj4odG90YWxDb2xzKS5maWxsKC0xKTtcblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBub2RlID0gbm9kZXNbaV07XG5cdFx0Y29uc3QgcElkeCA9IHBhcmVudE9mW2ldO1xuXHRcdGNvbnN0IGNvbm5lY3RDb2wgPSBwSWR4ID49IDAgPyBjb2xPZltwSWR4XSA6IC0xO1xuXHRcdGNvbnN0IGxhc3QgPSBwSWR4ID49IDAgJiYgY2hpbGRyZW5PZltwSWR4XVtjaGlsZHJlbk9mW3BJZHhdLmxlbmd0aCAtIDFdID09PSBpO1xuXHRcdGNvbnN0IG9wZW5zQ29sID0gY2hpbGRyZW5PZltpXS5sZW5ndGggPiAwID8gY29sT2ZbaV0gOiAtMTtcblx0XHRjb25zdCBob3JpekVuZCA9IHBJZHggPj0gMCA/IChvcGVuc0NvbCA+PSAwID8gb3BlbnNDb2wgOiB0b3RhbENvbHMpIDogLTE7XG5cblx0XHRjb25zdCBjaGFyczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBjID0gMDsgYyA8IHRvdGFsQ29sczsgYysrKSB7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGFjdGl2ZVtjXSA+PSAwO1xuXHRcdFx0Y29uc3QgaXNDb25uZWN0ID0gYyA9PT0gY29ubmVjdENvbDtcblx0XHRcdGNvbnN0IGlzT3BlbiA9IGMgPT09IG9wZW5zQ29sICYmICFpc0Nvbm5lY3Q7XG5cdFx0XHRjb25zdCBpbkhvcml6ID0gY29ubmVjdENvbCA+PSAwICYmIGMgPiBjb25uZWN0Q29sICYmIGMgPCBob3JpekVuZDtcblxuXHRcdFx0bGV0IGc6IHN0cmluZywgczogc3RyaW5nO1xuXHRcdFx0aWYgKGlzQ29ubmVjdCkge1xuXHRcdFx0XHRnID0gbGFzdCA/ICdcdTI1MTQnIDogJ1x1MjUxQyc7XG5cdFx0XHRcdHMgPSAnXHUyNTAwJztcblx0XHRcdH0gZWxzZSBpZiAoaXNPcGVuICYmIG5vZGUuaXNTeW50aGV0aWMpIHtcblx0XHRcdFx0ZyA9ICcrJztcblx0XHRcdFx0cyA9IG5vZGUubGFiZWwuc2xpY2UoMSwgMikgfHwgJz8nO1xuXHRcdFx0fSBlbHNlIGlmIChpc09wZW4gJiYgY29ubmVjdENvbCA+PSAwKSB7XG5cdFx0XHRcdGcgPSAnXHUyNTc3JzsgcyA9ICdcdTI1MDAnO1xuXHRcdFx0fSBlbHNlIGlmIChpc09wZW4pIHtcblx0XHRcdFx0ZyA9ICdcdTI1NzcnOyBzID0gJyAnO1xuXHRcdFx0fSBlbHNlIGlmIChpbkhvcml6ICYmIGlzQWN0aXZlKSB7XG5cdFx0XHRcdGcgPSAnXHUyNTNDJzsgcyA9ICdcdTI1MDAnO1xuXHRcdFx0fSBlbHNlIGlmIChpbkhvcml6KSB7XG5cdFx0XHRcdGcgPSAnXHUyNTAwJzsgcyA9ICdcdTI1MDAnO1xuXHRcdFx0fSBlbHNlIGlmIChpc0FjdGl2ZSkge1xuXHRcdFx0XHRnID0gJ1x1MjUwMic7IHMgPSAnICc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnID0gJyAnOyBzID0gJyAnO1xuXHRcdFx0fVxuXHRcdFx0Y2hhcnMucHVzaChnLCBzKTtcblx0XHR9XG5cblx0XHRpZiAobGFzdCkgeyBhY3RpdmVbY29sT2ZbcElkeF1dID0gLTE7IH1cblx0XHRpZiAob3BlbnNDb2wgPj0gMCkgeyBhY3RpdmVbb3BlbnNDb2xdID0gaTsgfVxuXG5cdFx0aWYgKG5vZGUuaXNTeW50aGV0aWMpIHtcblx0XHRcdGxpbmVzLnB1c2goY2hhcnMuam9pbignJykudHJpbUVuZCgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGluZXMucHVzaChgJHtjaGFycy5qb2luKCcnKX0ke25vZGUubGFiZWx9YCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBdUVPLFNBQVMsc0JBQ2YsT0FDQSxXQUNBLE9BQWdDLENBQUMsR0FDZDtBQUNuQixRQUFNLGNBQWMsb0JBQUksSUFBNEI7QUFDcEQsUUFBTSxRQUF5QixDQUFDO0FBQ2hDLFFBQU0sZUFBZSxvQkFBSSxJQUE2QjtBQUN0RCxRQUFNLGFBQStCLENBQUM7QUFFdEMsYUFBVyxRQUFRLE9BQU87QUFDekIsVUFBTSxRQUFRLEtBQUs7QUFDbkIsUUFBSSxDQUFDLE9BQU87QUFBRTtBQUFBLElBQVU7QUFFeEIsUUFBSSxPQUFPLFlBQVksSUFBSSxNQUFNLElBQUk7QUFDckMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLEVBQUUsT0FBTyxNQUFNLEtBQUssTUFBTTtBQUNqQyxrQkFBWSxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQ2hDLFlBQU0sS0FBSyxJQUFJO0FBQUEsSUFDaEI7QUFJQSxRQUFJO0FBQ0osYUFBUyxJQUFJLE1BQU0sUUFBUSxHQUFHLElBQUksRUFBRSxRQUFRO0FBQzNDLFlBQU0sSUFBSSxhQUFhLElBQUksQ0FBQztBQUM1QixVQUFJLEdBQUc7QUFBRSxzQkFBYztBQUFHO0FBQUEsTUFBTztBQUFBLElBQ2xDO0FBRUEsVUFBTSxRQUF3QjtBQUFBLE1BQzdCLE1BQU0sS0FBSyxPQUFPO0FBQUEsTUFDbEIsT0FBTyxHQUFHLEtBQUssTUFBTTtBQUFBLE1BQ3JCO0FBQUEsTUFDQSxRQUFRO0FBQUEsTUFDUixRQUFRLG1CQUFtQixLQUFLLE9BQU8sVUFBVTtBQUFBLElBQ2xEO0FBQ0EsaUJBQWEsSUFBSSxPQUFPLEtBQUs7QUFDN0IsZUFBVyxLQUFLLEtBQUs7QUFBQSxFQUN0QjtBQUtBLFFBQU0sZUFBZSxvQkFBSSxJQUFzQztBQUMvRCxhQUFXLFNBQVMsTUFBTTtBQUN6QixRQUFJO0FBQ0osYUFBUyxJQUEyQixNQUFNLE9BQU8sR0FBRyxJQUFJLEVBQUUsUUFBUTtBQUNqRSxZQUFNLElBQUksYUFBYSxJQUFJLENBQUM7QUFDNUIsVUFBSSxHQUFHO0FBQUUsc0JBQWM7QUFBRztBQUFBLE1BQU87QUFBQSxJQUNsQztBQUNBLFFBQUksQ0FBQyxhQUFhO0FBQUU7QUFBQSxJQUFVO0FBRTlCLFVBQU0sV0FBMkI7QUFBQSxNQUNoQyxNQUFNLFlBQVk7QUFBQSxNQUNsQixPQUFPLFFBQVEsTUFBTSxPQUFPO0FBQUEsTUFDNUIsTUFBTSxZQUFZO0FBQUEsTUFDbEIsUUFBUTtBQUFBLElBQ1Q7QUFDQSxVQUFNLFNBQVMsYUFBYSxJQUFJLFdBQVc7QUFDM0MsUUFBSSxRQUFRO0FBQUUsYUFBTyxLQUFLLFFBQVE7QUFBQSxJQUFHLE9BQ2hDO0FBQUUsbUJBQWEsSUFBSSxhQUFhLENBQUMsUUFBUSxDQUFDO0FBQUEsSUFBRztBQUFBLEVBQ25EO0FBR0EsUUFBTSxTQUEyQixDQUFDO0FBQ2xDLGFBQVcsS0FBSyxZQUFZO0FBQzNCLFdBQU8sS0FBSyxDQUFDO0FBQ2IsVUFBTSxLQUFLLGFBQWEsSUFBSSxDQUFDO0FBQzdCLFFBQUksSUFBSTtBQUFFLGFBQU8sS0FBSyxHQUFHLEVBQUU7QUFBQSxJQUFHO0FBQUEsRUFDL0I7QUFFQSxTQUFPLEVBQUUsT0FBTyxPQUFPO0FBQ3hCO0FBT0EsTUFBTSxxQkFBcUI7QUFBQSxFQUMxQjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFQSxNQUFNLG9CQUFvQjtBQUUxQixTQUFTLG1CQUFtQixZQUFvRDtBQUMvRSxNQUFJLENBQUMsWUFBWTtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQ3JDLFFBQU0sU0FBbUIsQ0FBQztBQUMxQixhQUFXLFFBQVEsV0FBVyxNQUFNLElBQUksR0FBRztBQUMxQyxVQUFNLFVBQVUsS0FBSyxLQUFLO0FBQzFCLFFBQUksQ0FBQyxRQUFRLFdBQVcsS0FBSyxHQUFHO0FBQUU7QUFBQSxJQUFVO0FBQzVDLFFBQUksbUJBQW1CLEtBQUssT0FBSyxFQUFFLEtBQUssT0FBTyxDQUFDLEdBQUc7QUFBRTtBQUFBLElBQVU7QUFDL0QsV0FBTyxLQUFLLFFBQVEsTUFBTSxDQUFDLENBQUM7QUFDNUIsUUFBSSxPQUFPLFVBQVUsbUJBQW1CO0FBQUU7QUFBQSxJQUFPO0FBQUEsRUFDbEQ7QUFDQSxTQUFPLE9BQU8sV0FBVyxJQUFJLFNBQVksT0FBTyxLQUFLLElBQUk7QUFDMUQ7QUFvQk8sU0FBUyxnQkFBZ0IsU0FBbUM7QUFDbEUsUUFBTSxFQUFFLE9BQU8sT0FBTyxJQUFJO0FBQzFCLE1BQUksT0FBTyxXQUFXLEdBQUc7QUFBRSxXQUFPO0FBQUEsRUFBbUI7QUFDckQsTUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixXQUFPLE9BQU8sSUFBSSxPQUFLLEtBQUssRUFBRSxJQUFJLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxLQUFLLElBQUk7QUFBQSxFQUM5RDtBQUVBLFFBQU0sSUFBSSxPQUFPO0FBR2pCLFFBQU0sV0FBVyxJQUFJLE1BQWMsQ0FBQyxFQUFFLEtBQUssRUFBRTtBQUM3QyxRQUFNLGFBQXlCLE1BQU0sS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDO0FBQ2pFLFFBQU0sZUFBZSxvQkFBSSxJQUE0QjtBQUNyRCxXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUFFLGlCQUFhLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQztBQUFBLEVBQUc7QUFDOUQsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsVUFBTSxJQUFJLE9BQU8sQ0FBQyxFQUFFO0FBQ3BCLFFBQUksR0FBRztBQUNOLFlBQU0sS0FBSyxhQUFhLElBQUksQ0FBQztBQUM3QixVQUFJLE9BQU8sUUFBVztBQUNyQixpQkFBUyxDQUFDLElBQUk7QUFDZCxtQkFBVyxFQUFFLEVBQUUsS0FBSyxDQUFDO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUdBLFFBQU0sY0FBYyxJQUFJLE1BQWUsQ0FBQyxFQUFFLEtBQUssS0FBSztBQUNwRCxXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMzQixVQUFNLElBQUksU0FBUyxDQUFDO0FBQ3BCLFFBQUksS0FBSyxLQUFLLFdBQVcsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxNQUFNLEdBQUc7QUFBRSxrQkFBWSxDQUFDLElBQUk7QUFBQSxJQUFNO0FBQUEsRUFDdkY7QUFPQSxRQUFNLDJCQUEyQjtBQUNqQyxRQUFNLFVBQVUsSUFBSSxNQUFjLENBQUMsRUFBRSxLQUFLLENBQUM7QUFDM0MsUUFBTSxTQUFTLElBQUksTUFBYyxDQUFDLEVBQUUsS0FBSyxDQUFDO0FBQzFDLFdBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLFVBQU0sSUFBSSxTQUFTLENBQUM7QUFDcEIsUUFBSSxLQUFLLEdBQUc7QUFDWCxjQUFRLENBQUMsSUFBSSxRQUFRLENBQUMsSUFBSTtBQUMxQixZQUFNLFdBQVcsWUFBWSxDQUFDLEtBQUssUUFBUSxDQUFDLEtBQUs7QUFDakQsYUFBTyxDQUFDLElBQUksT0FBTyxDQUFDLEtBQUssV0FBVyxJQUFJO0FBQUEsSUFDekM7QUFBQSxFQUNEO0FBTUEsUUFBTSxpQkFBaUIsSUFBSSxNQUFjLENBQUM7QUFDMUMsUUFBTSxnQkFBZ0IsSUFBSSxNQUF5QixDQUFDO0FBQ3BELFdBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLFVBQU0sSUFBSSxPQUFPLENBQUM7QUFDbEIsVUFBTSxTQUFTLEVBQUUsU0FBUyxFQUFFLE9BQU8sTUFBTSxJQUFJLElBQUksQ0FBQztBQUNsRCxtQkFBZSxDQUFDLElBQUksT0FBTyxTQUFTLElBQUksR0FBRyxFQUFFLEtBQUssU0FBTSxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUU7QUFDeEUsa0JBQWMsQ0FBQyxJQUFJLE9BQU8sTUFBTSxDQUFDO0FBQUEsRUFDbEM7QUFLQSxRQUFNLFVBQVUsb0JBQUksSUFBMkI7QUFDL0MsYUFBVyxLQUFLLE9BQU87QUFBRSxZQUFRLElBQUksR0FBRyxFQUFFLE1BQU0sTUFBTTtBQUFBLEVBQUc7QUFDekQsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsVUFBTSxhQUFhLE9BQU8sQ0FBQyxJQUFJLElBQUk7QUFDbkMsVUFBTSxTQUFTLEtBQUssSUFBSSxlQUFlLENBQUMsRUFBRSxRQUFRLEdBQUcsY0FBYyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDNUYsVUFBTSxJQUFJLGFBQWE7QUFDdkIsVUFBTSxNQUFNLFFBQVEsSUFBSSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUs7QUFDM0MsUUFBSSxJQUFJLEtBQUs7QUFBRSxjQUFRLElBQUksT0FBTyxDQUFDLEVBQUUsTUFBTSxDQUFDO0FBQUEsSUFBRztBQUFBLEVBQ2hEO0FBR0EsUUFBTSxVQUFVLElBQUksSUFBSSxLQUFLLElBQUksR0FBRyxPQUFPLElBQUksT0FBSyxLQUFLLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJO0FBQzNFLFFBQU0sZUFBZSxJQUFJLE9BQU8sS0FBSztBQUVyQyxRQUFNLFFBQWtCLENBQUM7QUFHekIsUUFBTSxTQUFtQixDQUFDO0FBQzFCLGFBQVcsS0FBSyxPQUFPO0FBQ3RCLFVBQU0sSUFBSSxRQUFRLElBQUksQ0FBQztBQUN2QixXQUFPLEtBQUssRUFBRSxNQUFNLFNBQVMsS0FBSyxNQUFNLElBQUksRUFBRSxNQUFNLFVBQVUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUM1RTtBQUNBLFFBQU0sS0FBSyxHQUFHLElBQUksT0FBTyxZQUFZLENBQUMsSUFBSSxPQUFPLEtBQUssSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDO0FBR3ZFLFFBQU0sY0FBYyxJQUFJLE1BQWMsQ0FBQyxFQUFFLEtBQUssRUFBRTtBQUNoRCxXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMzQixVQUFNLE9BQU8sV0FBVyxDQUFDO0FBQ3pCLFFBQUksS0FBSyxTQUFTLEdBQUc7QUFBRSxrQkFBWSxDQUFDLElBQUksS0FBSyxLQUFLLFNBQVMsQ0FBQztBQUFBLElBQUc7QUFBQSxFQUNoRTtBQUlBLFFBQU0sYUFBYSxvQkFBSSxJQUFnQztBQUN2RCxhQUFXLEtBQUssT0FBTztBQUFFLGVBQVcsSUFBSSxHQUFHLG9CQUFJLElBQUksQ0FBQztBQUFBLEVBQUc7QUFFdkQsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsVUFBTSxRQUFRLE9BQU8sQ0FBQztBQUN0QixVQUFNLFVBQVUsSUFBSSxLQUFLLE1BQU0sTUFBTSxJQUFJLENBQUMsS0FBSyxTQUFTLFlBQVk7QUFFcEUsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLGVBQVcsS0FBSyxPQUFPO0FBQ3RCLFlBQU0sSUFBSSxRQUFRLElBQUksQ0FBQztBQUN2QixZQUFNQSxTQUFRLFdBQVcsSUFBSSxDQUFDO0FBRTlCLFVBQUksTUFBTSxNQUFNLE1BQU07QUFJckIsY0FBTSxPQUFPLE9BQU8sQ0FBQztBQUNyQixjQUFNLFNBQW1CLENBQUM7QUFDMUIsaUJBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxLQUFLO0FBQzlCLGNBQUksWUFBWTtBQUNoQixxQkFBVyxLQUFLQSxRQUFPO0FBQ3RCLGdCQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssWUFBWSxDQUFDLElBQUksR0FBRztBQUFFLDBCQUFZO0FBQU07QUFBQSxZQUFPO0FBQUEsVUFDdkU7QUFDQSxpQkFBTyxLQUFLLFlBQVksYUFBUSxLQUFLO0FBQUEsUUFDdEM7QUFDQSxjQUFNLFNBQVMsWUFBWSxDQUFDLElBQUksa0JBQVE7QUFDeEMsY0FBTSxLQUFLLEdBQUcsT0FBTyxLQUFLLEVBQUUsQ0FBQyxHQUFHLE1BQU0sR0FBRyxlQUFlLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDdkUsT0FBTztBQUlOLGNBQU0sY0FBd0IsQ0FBQztBQUMvQixtQkFBVyxLQUFLQSxRQUFPO0FBQ3RCLGNBQUksWUFBWSxDQUFDLElBQUksR0FBRztBQUFFLHdCQUFZLEtBQUssT0FBTyxDQUFDLENBQUM7QUFBQSxVQUFHO0FBQUEsUUFDeEQ7QUFDQSxjQUFNLFVBQVUsS0FBSyxJQUFJLEdBQUcsYUFBYSxFQUFFO0FBQzNDLGNBQU0sUUFBa0IsSUFBSSxNQUFNLEtBQUssSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxLQUFLO0FBQ3RFLG1CQUFXLEtBQUssYUFBYTtBQUFFLGdCQUFNLENBQUMsSUFBSTtBQUFBLFFBQU87QUFHakQsWUFBSSxRQUFRO0FBQ1osaUJBQVMsSUFBSSxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDL0IsY0FBSSxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUc7QUFBRSxvQkFBUTtBQUFHO0FBQUEsVUFBTztBQUFBLFFBQy9DO0FBQ0EsWUFBSSxTQUFTLEtBQUssU0FBUyxLQUFLLEtBQUssR0FBRztBQUN2QyxnQkFBTSxJQUFJLE9BQU8sS0FBSztBQUV0QixjQUFJLENBQUMsWUFBWSxLQUFLLEdBQUc7QUFDeEIsbUJBQU8sTUFBTSxVQUFVLEdBQUc7QUFBRSxvQkFBTSxLQUFLLEtBQUs7QUFBQSxZQUFHO0FBQy9DLGdCQUFJLE1BQU0sQ0FBQyxNQUFNLE9BQU87QUFBRSxvQkFBTSxDQUFDLElBQUk7QUFBQSxZQUFPO0FBQUEsVUFDN0M7QUFBQSxRQUNEO0FBR0EsZUFBTyxNQUFNLFNBQVMsS0FBSyxNQUFNLE1BQU0sU0FBUyxDQUFDLE1BQU0sT0FBTztBQUFFLGdCQUFNLElBQUk7QUFBQSxRQUFHO0FBQzdFLGNBQU0sS0FBSyxNQUFNLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLEdBQUcsT0FBTyxJQUFJLE1BQU0sS0FBSyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUM7QUFNckQsVUFBTSxTQUFTLGNBQWMsQ0FBQztBQUM5QixRQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLFlBQU0sT0FBTyxPQUFPLENBQUM7QUFDckIsWUFBTSxpQkFBaUIsV0FBVyxJQUFJLE1BQU0sSUFBSTtBQUdoRCxZQUFNLGtCQUFrQixXQUFXLENBQUMsRUFBRSxTQUFTO0FBQy9DLFlBQU0sY0FBd0IsQ0FBQztBQUMvQixlQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sS0FBSztBQUM5QixZQUFJLFlBQVk7QUFDaEIsbUJBQVcsS0FBSyxnQkFBZ0I7QUFDL0IsY0FBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFlBQVksQ0FBQyxJQUFJLEdBQUc7QUFBRSx3QkFBWTtBQUFNO0FBQUEsVUFBTztBQUFBLFFBQ3ZFO0FBQ0Esb0JBQVksS0FBSyxZQUFZLGFBQVEsS0FBSztBQUFBLE1BQzNDO0FBQ0Esa0JBQVksS0FBSyxrQkFBa0IsYUFBUSxLQUFLO0FBQ2hELGlCQUFXLFNBQVMsUUFBUTtBQUMzQixjQUFNLGNBQXdCLENBQUM7QUFDL0IsbUJBQVcsS0FBSyxPQUFPO0FBQ3RCLGdCQUFNLElBQUksUUFBUSxJQUFJLENBQUM7QUFDdkIsY0FBSSxNQUFNLE1BQU0sTUFBTTtBQUNyQix3QkFBWSxLQUFLLEdBQUcsWUFBWSxLQUFLLEVBQUUsQ0FBQyxHQUFHLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQztBQUFBLFVBQzdELE9BQU87QUFHTixrQkFBTSxhQUFhLFdBQVcsSUFBSSxDQUFDO0FBQ25DLGtCQUFNLGNBQXdCLENBQUM7QUFDL0IsdUJBQVcsS0FBSyxZQUFZO0FBQzNCLGtCQUFJLFlBQVksQ0FBQyxJQUFJLEdBQUc7QUFBRSw0QkFBWSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQUEsY0FBRztBQUFBLFlBQ3hEO0FBQ0Esa0JBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxhQUFhLEVBQUU7QUFDM0Msa0JBQU0sUUFBa0IsSUFBSSxNQUFNLEtBQUssSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxLQUFLO0FBQ3RFLHVCQUFXLEtBQUssYUFBYTtBQUFFLG9CQUFNLENBQUMsSUFBSTtBQUFBLFlBQU87QUFDakQsbUJBQU8sTUFBTSxTQUFTLEtBQUssTUFBTSxNQUFNLFNBQVMsQ0FBQyxNQUFNLE9BQU87QUFBRSxvQkFBTSxJQUFJO0FBQUEsWUFBRztBQUM3RSx3QkFBWSxLQUFLLE1BQU0sS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFBQSxVQUMxQztBQUFBLFFBQ0Q7QUFDQSxjQUFNLFVBQVUsSUFBSSxPQUFPLFlBQVk7QUFDdkMsY0FBTSxLQUFLLEdBQUcsT0FBTyxJQUFJLFlBQVksS0FBSyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUM7QUFBQSxNQUM1RDtBQUFBLElBQ0Q7QUFJQSxVQUFNLFFBQVEsV0FBVyxJQUFJLE1BQU0sSUFBSTtBQUN2QyxRQUFJLFdBQVcsQ0FBQyxFQUFFLFNBQVMsR0FBRztBQUFFLFlBQU0sSUFBSSxDQUFDO0FBQUEsSUFBRztBQUM5QyxRQUFJLE1BQU07QUFDVixXQUFPLFlBQVksR0FBRyxHQUFHO0FBQ3hCLFlBQU0sSUFBSSxTQUFTLEdBQUc7QUFDdEIsVUFBSSxJQUFJLEdBQUc7QUFBRTtBQUFBLE1BQU87QUFDcEIsWUFBTSxPQUFPLENBQUM7QUFDZCxZQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFFQSxTQUFPLE1BQU0sS0FBSyxJQUFJO0FBQ3ZCO0FBb0JPLFNBQVMsZ0JBQWdCLFNBQW1DO0FBQ2xFLFFBQU0sRUFBRSxPQUFPLElBQUk7QUFDbkIsTUFBSSxPQUFPLFdBQVcsR0FBRztBQUFFLFdBQU87QUFBQSxFQUFJO0FBU3RDLFFBQU0sUUFBZ0IsQ0FBQztBQUN2QixRQUFNLG1CQUFtQixvQkFBSSxJQUF5QjtBQUN0RCxRQUFNLGNBQWMsb0JBQUksSUFBMEI7QUFHbEQsUUFBTSxvQkFBb0Isb0JBQUksSUFBbUI7QUFDakQsYUFBVyxLQUFLLFFBQVE7QUFBRSxRQUFJLENBQUMsRUFBRSxRQUFRO0FBQUUsd0JBQWtCLElBQUksRUFBRSxJQUFJO0FBQUEsSUFBRztBQUFBLEVBQUU7QUFFNUUsYUFBVyxLQUFLLFFBQVE7QUFDdkIsUUFBSSxrQkFBa0IsSUFBSSxFQUFFLElBQUksS0FBSyxDQUFDLGlCQUFpQixJQUFJLEVBQUUsSUFBSSxHQUFHO0FBQ25FLFlBQU0sTUFBWSxFQUFFLE9BQU8sSUFBSSxFQUFFLEtBQUssS0FBSyxJQUFJLFFBQVEsUUFBVyxhQUFhLEtBQUs7QUFDcEYsdUJBQWlCLElBQUksRUFBRSxNQUFNLEdBQUc7QUFDaEMsWUFBTSxLQUFLLEdBQUc7QUFBQSxJQUNmO0FBQ0EsVUFBTSxVQUFVLElBQUksRUFBRSxJQUFJLEtBQUssU0FBUyxDQUFDO0FBQ3pDLFVBQU0sU0FBUyxFQUFFLFNBQVMsWUFBWSxJQUFJLEVBQUUsTUFBTSxJQUFLLGlCQUFpQixJQUFJLEVBQUUsSUFBSTtBQUNsRixVQUFNLE9BQWEsRUFBRSxPQUFPLElBQUksT0FBTyxLQUFLLEVBQUUsS0FBSyxJQUFJLFFBQVEsYUFBYSxNQUFNO0FBQ2xGLGdCQUFZLElBQUksR0FBRyxJQUFJO0FBQ3ZCLFVBQU0sS0FBSyxJQUFJO0FBQUEsRUFDaEI7QUFFQSxRQUFNLElBQUksTUFBTTtBQUNoQixRQUFNLFdBQVcsSUFBSSxNQUFjLENBQUMsRUFBRSxLQUFLLEVBQUU7QUFDN0MsUUFBTSxhQUF5QixNQUFNLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQztBQUNqRSxRQUFNLGNBQWMsb0JBQUksSUFBa0I7QUFDMUMsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFBRSxnQkFBWSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUM7QUFBQSxFQUFHO0FBQzVELFdBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLFVBQU0sSUFBSSxNQUFNLENBQUMsRUFBRTtBQUNuQixRQUFJLEdBQUc7QUFDTixZQUFNLEtBQUssWUFBWSxJQUFJLENBQUM7QUFDNUIsVUFBSSxPQUFPLFFBQVc7QUFBRSxpQkFBUyxDQUFDLElBQUk7QUFBSSxtQkFBVyxFQUFFLEVBQUUsS0FBSyxDQUFDO0FBQUEsTUFBRztBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUdBLFFBQU0sUUFBUSxJQUFJLE1BQWMsQ0FBQyxFQUFFLEtBQUssRUFBRTtBQUMxQyxNQUFJLFlBQVk7QUFDaEIsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsUUFBSSxXQUFXLENBQUMsRUFBRSxTQUFTLEdBQUc7QUFBRSxZQUFNLENBQUMsSUFBSTtBQUFBLElBQWE7QUFBQSxFQUN6RDtBQUVBLE1BQUksY0FBYyxHQUFHO0FBQ3BCLFdBQU8sT0FBTyxJQUFJLE9BQUssS0FBSyxHQUFHLEVBQUUsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxLQUFLLElBQUk7QUFBQSxFQUMvRTtBQUVBLFFBQU0sU0FBUyxJQUFJLE1BQWMsU0FBUyxFQUFFLEtBQUssRUFBRTtBQUNuRCxRQUFNLFFBQWtCLENBQUM7QUFFekIsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsVUFBTSxPQUFPLE1BQU0sQ0FBQztBQUNwQixVQUFNLE9BQU8sU0FBUyxDQUFDO0FBQ3ZCLFVBQU0sYUFBYSxRQUFRLElBQUksTUFBTSxJQUFJLElBQUk7QUFDN0MsVUFBTSxPQUFPLFFBQVEsS0FBSyxXQUFXLElBQUksRUFBRSxXQUFXLElBQUksRUFBRSxTQUFTLENBQUMsTUFBTTtBQUM1RSxVQUFNLFdBQVcsV0FBVyxDQUFDLEVBQUUsU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJO0FBQ3ZELFVBQU0sV0FBVyxRQUFRLElBQUssWUFBWSxJQUFJLFdBQVcsWUFBYTtBQUV0RSxVQUFNLFFBQWtCLENBQUM7QUFDekIsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLEtBQUs7QUFDbkMsWUFBTSxXQUFXLE9BQU8sQ0FBQyxLQUFLO0FBQzlCLFlBQU0sWUFBWSxNQUFNO0FBQ3hCLFlBQU0sU0FBUyxNQUFNLFlBQVksQ0FBQztBQUNsQyxZQUFNLFVBQVUsY0FBYyxLQUFLLElBQUksY0FBYyxJQUFJO0FBRXpELFVBQUksR0FBVztBQUNmLFVBQUksV0FBVztBQUNkLFlBQUksT0FBTyxXQUFNO0FBQ2pCLFlBQUk7QUFBQSxNQUNMLFdBQVcsVUFBVSxLQUFLLGFBQWE7QUFDdEMsWUFBSTtBQUNKLFlBQUksS0FBSyxNQUFNLE1BQU0sR0FBRyxDQUFDLEtBQUs7QUFBQSxNQUMvQixXQUFXLFVBQVUsY0FBYyxHQUFHO0FBQ3JDLFlBQUk7QUFBSyxZQUFJO0FBQUEsTUFDZCxXQUFXLFFBQVE7QUFDbEIsWUFBSTtBQUFLLFlBQUk7QUFBQSxNQUNkLFdBQVcsV0FBVyxVQUFVO0FBQy9CLFlBQUk7QUFBSyxZQUFJO0FBQUEsTUFDZCxXQUFXLFNBQVM7QUFDbkIsWUFBSTtBQUFLLFlBQUk7QUFBQSxNQUNkLFdBQVcsVUFBVTtBQUNwQixZQUFJO0FBQUssWUFBSTtBQUFBLE1BQ2QsT0FBTztBQUNOLFlBQUk7QUFBSyxZQUFJO0FBQUEsTUFDZDtBQUNBLFlBQU0sS0FBSyxHQUFHLENBQUM7QUFBQSxJQUNoQjtBQUVBLFFBQUksTUFBTTtBQUFFLGFBQU8sTUFBTSxJQUFJLENBQUMsSUFBSTtBQUFBLElBQUk7QUFDdEMsUUFBSSxZQUFZLEdBQUc7QUFBRSxhQUFPLFFBQVEsSUFBSTtBQUFBLElBQUc7QUFFM0MsUUFBSSxLQUFLLGFBQWE7QUFDckIsWUFBTSxLQUFLLE1BQU0sS0FBSyxFQUFFLEVBQUUsUUFBUSxDQUFDO0FBQUEsSUFDcEMsT0FBTztBQUNOLFlBQU0sS0FBSyxHQUFHLE1BQU0sS0FBSyxFQUFFLENBQUMsR0FBRyxLQUFLLEtBQUssRUFBRTtBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUVBLFNBQU8sTUFBTSxLQUFLLElBQUk7QUFDdkI7IiwKICAibmFtZXMiOiBbInN0YWNrIl0KfQo=
