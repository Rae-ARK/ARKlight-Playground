import { TrackedRangeStickiness } from "../model.js";
var ClassName = /* @__PURE__ */ ((ClassName2) => {
  ClassName2["EditorHintDecoration"] = "squiggly-hint";
  ClassName2["EditorInfoDecoration"] = "squiggly-info";
  ClassName2["EditorWarningDecoration"] = "squiggly-warning";
  ClassName2["EditorErrorDecoration"] = "squiggly-error";
  ClassName2["EditorUnnecessaryDecoration"] = "squiggly-unnecessary";
  ClassName2["EditorUnnecessaryInlineDecoration"] = "squiggly-inline-unnecessary";
  ClassName2["EditorDeprecatedInlineDecoration"] = "squiggly-inline-deprecated";
  return ClassName2;
})(ClassName || {});
var NodeColor = /* @__PURE__ */ ((NodeColor2) => {
  NodeColor2[NodeColor2["Black"] = 0] = "Black";
  NodeColor2[NodeColor2["Red"] = 1] = "Red";
  return NodeColor2;
})(NodeColor || {});
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["ColorMask"] = 1] = "ColorMask";
  Constants2[Constants2["ColorMaskInverse"] = 254] = "ColorMaskInverse";
  Constants2[Constants2["ColorOffset"] = 0] = "ColorOffset";
  Constants2[Constants2["IsVisitedMask"] = 2] = "IsVisitedMask";
  Constants2[Constants2["IsVisitedMaskInverse"] = 253] = "IsVisitedMaskInverse";
  Constants2[Constants2["IsVisitedOffset"] = 1] = "IsVisitedOffset";
  Constants2[Constants2["IsForValidationMask"] = 4] = "IsForValidationMask";
  Constants2[Constants2["IsForValidationMaskInverse"] = 251] = "IsForValidationMaskInverse";
  Constants2[Constants2["IsForValidationOffset"] = 2] = "IsForValidationOffset";
  Constants2[Constants2["StickinessMask"] = 24] = "StickinessMask";
  Constants2[Constants2["StickinessMaskInverse"] = 231] = "StickinessMaskInverse";
  Constants2[Constants2["StickinessOffset"] = 3] = "StickinessOffset";
  Constants2[Constants2["CollapseOnReplaceEditMask"] = 32] = "CollapseOnReplaceEditMask";
  Constants2[Constants2["CollapseOnReplaceEditMaskInverse"] = 223] = "CollapseOnReplaceEditMaskInverse";
  Constants2[Constants2["CollapseOnReplaceEditOffset"] = 5] = "CollapseOnReplaceEditOffset";
  Constants2[Constants2["IsMarginMask"] = 64] = "IsMarginMask";
  Constants2[Constants2["IsMarginMaskInverse"] = 191] = "IsMarginMaskInverse";
  Constants2[Constants2["IsMarginOffset"] = 6] = "IsMarginOffset";
  Constants2[Constants2["AffectsFontMask"] = 128] = "AffectsFontMask";
  Constants2[Constants2["AffectsFontMaskInverse"] = 127] = "AffectsFontMaskInverse";
  Constants2[Constants2["AffectsFontOffset"] = 7] = "AffectsFontOffset";
  Constants2[Constants2["MIN_SAFE_DELTA"] = -1073741824] = "MIN_SAFE_DELTA";
  Constants2[Constants2["MAX_SAFE_DELTA"] = 1073741824] = "MAX_SAFE_DELTA";
  return Constants2;
})(Constants || {});
function getNodeColor(node) {
  return (node.metadata & 1 /* ColorMask */) >>> 0 /* ColorOffset */;
}
function setNodeColor(node, color) {
  node.metadata = node.metadata & 254 /* ColorMaskInverse */ | color << 0 /* ColorOffset */;
}
function getNodeIsVisited(node) {
  return (node.metadata & 2 /* IsVisitedMask */) >>> 1 /* IsVisitedOffset */ === 1;
}
function setNodeIsVisited(node, value) {
  node.metadata = node.metadata & 253 /* IsVisitedMaskInverse */ | (value ? 1 : 0) << 1 /* IsVisitedOffset */;
}
function getNodeIsForValidation(node) {
  return (node.metadata & 4 /* IsForValidationMask */) >>> 2 /* IsForValidationOffset */ === 1;
}
function setNodeIsForValidation(node, value) {
  node.metadata = node.metadata & 251 /* IsForValidationMaskInverse */ | (value ? 1 : 0) << 2 /* IsForValidationOffset */;
}
function getNodeIsInGlyphMargin(node) {
  return (node.metadata & 64 /* IsMarginMask */) >>> 6 /* IsMarginOffset */ === 1;
}
function setNodeIsInGlyphMargin(node, value) {
  node.metadata = node.metadata & 191 /* IsMarginMaskInverse */ | (value ? 1 : 0) << 6 /* IsMarginOffset */;
}
function getNodeAffectsFont(node) {
  return (node.metadata & 128 /* AffectsFontMask */) >>> 7 /* AffectsFontOffset */ === 1;
}
function setNodeAffectsFont(node, value) {
  node.metadata = node.metadata & 127 /* AffectsFontMaskInverse */ | (value ? 1 : 0) << 7 /* AffectsFontOffset */;
}
function getNodeStickiness(node) {
  return (node.metadata & 24 /* StickinessMask */) >>> 3 /* StickinessOffset */;
}
function _setNodeStickiness(node, stickiness) {
  node.metadata = node.metadata & 231 /* StickinessMaskInverse */ | stickiness << 3 /* StickinessOffset */;
}
function getCollapseOnReplaceEdit(node) {
  return (node.metadata & 32 /* CollapseOnReplaceEditMask */) >>> 5 /* CollapseOnReplaceEditOffset */ === 1;
}
function setCollapseOnReplaceEdit(node, value) {
  node.metadata = node.metadata & 223 /* CollapseOnReplaceEditMaskInverse */ | (value ? 1 : 0) << 5 /* CollapseOnReplaceEditOffset */;
}
function setNodeStickiness(node, stickiness) {
  _setNodeStickiness(node, stickiness);
}
class IntervalNode {
  constructor(id, start, end) {
    this.metadata = 0;
    this.parent = this;
    this.left = this;
    this.right = this;
    setNodeColor(this, 1 /* Red */);
    this.start = start;
    this.end = end;
    this.delta = 0;
    this.maxEnd = end;
    this.id = id;
    this.ownerId = 0;
    this.options = null;
    setNodeIsForValidation(this, false);
    setNodeIsInGlyphMargin(this, false);
    _setNodeStickiness(this, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
    setCollapseOnReplaceEdit(this, false);
    setNodeAffectsFont(this, false);
    this.cachedVersionId = 0;
    this.cachedAbsoluteStart = start;
    this.cachedAbsoluteEnd = end;
    this.range = null;
    setNodeIsVisited(this, false);
  }
  reset(versionId, start, end, range) {
    this.start = start;
    this.end = end;
    this.maxEnd = end;
    this.cachedVersionId = versionId;
    this.cachedAbsoluteStart = start;
    this.cachedAbsoluteEnd = end;
    this.range = range;
  }
  setOptions(options) {
    this.options = options;
    const className = this.options.className;
    setNodeIsForValidation(this, className === "squiggly-error" /* EditorErrorDecoration */ || className === "squiggly-warning" /* EditorWarningDecoration */ || className === "squiggly-info" /* EditorInfoDecoration */);
    setNodeIsInGlyphMargin(this, this.options.glyphMarginClassName !== null);
    _setNodeStickiness(this, this.options.stickiness);
    setCollapseOnReplaceEdit(this, this.options.collapseOnReplaceEdit);
    setNodeAffectsFont(this, this.options.affectsFont ?? false);
  }
  setCachedOffsets(absoluteStart, absoluteEnd, cachedVersionId) {
    if (this.cachedVersionId !== cachedVersionId) {
      this.range = null;
    }
    this.cachedVersionId = cachedVersionId;
    this.cachedAbsoluteStart = absoluteStart;
    this.cachedAbsoluteEnd = absoluteEnd;
  }
  detach() {
    this.parent = null;
    this.left = null;
    this.right = null;
  }
}
const SENTINEL = new IntervalNode(null, 0, 0);
SENTINEL.parent = SENTINEL;
SENTINEL.left = SENTINEL;
SENTINEL.right = SENTINEL;
setNodeColor(SENTINEL, 0 /* Black */);
class IntervalTree {
  constructor() {
    this.root = SENTINEL;
    this.requestNormalizeDelta = false;
  }
  intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    if (this.root === SENTINEL) {
      return [];
    }
    return intervalSearch(this, start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
  }
  search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    if (this.root === SENTINEL) {
      return [];
    }
    return search(this, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
  }
  /**
   * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
   */
  collectNodesFromOwner(ownerId) {
    return collectNodesFromOwner(this, ownerId);
  }
  /**
   * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
   */
  collectNodesPostOrder() {
    return collectNodesPostOrder(this);
  }
  insert(node) {
    rbTreeInsert(this, node);
    this._normalizeDeltaIfNecessary();
  }
  delete(node) {
    rbTreeDelete(this, node);
    this._normalizeDeltaIfNecessary();
  }
  resolveNode(node, cachedVersionId) {
    const initialNode = node;
    let delta = 0;
    while (node !== this.root) {
      if (node === node.parent.right) {
        delta += node.parent.delta;
      }
      node = node.parent;
    }
    const nodeStart = initialNode.start + delta;
    const nodeEnd = initialNode.end + delta;
    initialNode.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
  }
  acceptReplace(offset, length, textLength, forceMoveMarkers) {
    const nodesOfInterest = searchForEditing(this, offset, offset + length);
    for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
      const node = nodesOfInterest[i];
      rbTreeDelete(this, node);
    }
    this._normalizeDeltaIfNecessary();
    noOverlapReplace(this, offset, offset + length, textLength);
    this._normalizeDeltaIfNecessary();
    for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
      const node = nodesOfInterest[i];
      node.start = node.cachedAbsoluteStart;
      node.end = node.cachedAbsoluteEnd;
      nodeAcceptEdit(node, offset, offset + length, textLength, forceMoveMarkers);
      node.maxEnd = node.end;
      rbTreeInsert(this, node);
    }
    this._normalizeDeltaIfNecessary();
  }
  getAllInOrder() {
    return search(this, 0, false, false, 0, false);
  }
  _normalizeDeltaIfNecessary() {
    if (!this.requestNormalizeDelta) {
      return;
    }
    this.requestNormalizeDelta = false;
    normalizeDelta(this);
  }
}
function normalizeDelta(T) {
  let node = T.root;
  let delta = 0;
  while (node !== SENTINEL) {
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
    node.start = delta + node.start;
    node.end = delta + node.end;
    node.delta = 0;
    recomputeMaxEnd(node);
    setNodeIsVisited(node, true);
    setNodeIsVisited(node.left, false);
    setNodeIsVisited(node.right, false);
    if (node === node.parent.right) {
      delta -= node.parent.delta;
    }
    node = node.parent;
  }
  setNodeIsVisited(T.root, false);
}
var MarkerMoveSemantics = /* @__PURE__ */ ((MarkerMoveSemantics2) => {
  MarkerMoveSemantics2[MarkerMoveSemantics2["MarkerDefined"] = 0] = "MarkerDefined";
  MarkerMoveSemantics2[MarkerMoveSemantics2["ForceMove"] = 1] = "ForceMove";
  MarkerMoveSemantics2[MarkerMoveSemantics2["ForceStay"] = 2] = "ForceStay";
  return MarkerMoveSemantics2;
})(MarkerMoveSemantics || {});
function adjustMarkerBeforeColumn(markerOffset, markerStickToPreviousCharacter, checkOffset, moveSemantics) {
  if (markerOffset < checkOffset) {
    return true;
  }
  if (markerOffset > checkOffset) {
    return false;
  }
  if (moveSemantics === 1 /* ForceMove */) {
    return false;
  }
  if (moveSemantics === 2 /* ForceStay */) {
    return true;
  }
  return markerStickToPreviousCharacter;
}
function nodeAcceptEdit(node, start, end, textLength, forceMoveMarkers) {
  const nodeStickiness = getNodeStickiness(node);
  const startStickToPreviousCharacter = nodeStickiness === TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges || nodeStickiness === TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
  const endStickToPreviousCharacter = nodeStickiness === TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges || nodeStickiness === TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
  const deletingCnt = end - start;
  const insertingCnt = textLength;
  const commonLength = Math.min(deletingCnt, insertingCnt);
  const nodeStart = node.start;
  let startDone = false;
  const nodeEnd = node.end;
  let endDone = false;
  if (start <= nodeStart && nodeEnd <= end && getCollapseOnReplaceEdit(node)) {
    node.start = start;
    startDone = true;
    node.end = start;
    endDone = true;
  }
  {
    const moveSemantics = forceMoveMarkers ? 1 /* ForceMove */ : deletingCnt > 0 ? 2 /* ForceStay */ : 0 /* MarkerDefined */;
    if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start, moveSemantics)) {
      startDone = true;
    }
    if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start, moveSemantics)) {
      endDone = true;
    }
  }
  if (commonLength > 0 && !forceMoveMarkers) {
    const moveSemantics = deletingCnt > insertingCnt ? 2 /* ForceStay */ : 0 /* MarkerDefined */;
    if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start + commonLength, moveSemantics)) {
      startDone = true;
    }
    if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start + commonLength, moveSemantics)) {
      endDone = true;
    }
  }
  {
    const moveSemantics = forceMoveMarkers ? 1 /* ForceMove */ : 0 /* MarkerDefined */;
    if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, end, moveSemantics)) {
      node.start = start + insertingCnt;
      startDone = true;
    }
    if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, end, moveSemantics)) {
      node.end = start + insertingCnt;
      endDone = true;
    }
  }
  const deltaColumn = insertingCnt - deletingCnt;
  if (!startDone) {
    node.start = Math.max(0, nodeStart + deltaColumn);
  }
  if (!endDone) {
    node.end = Math.max(0, nodeEnd + deltaColumn);
  }
  if (node.start > node.end) {
    node.end = node.start;
  }
}
function searchForEditing(T, start, end) {
  let node = T.root;
  let delta = 0;
  let nodeMaxEnd = 0;
  let nodeStart = 0;
  let nodeEnd = 0;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      node = node.parent;
      continue;
    }
    if (!getNodeIsVisited(node.left)) {
      nodeMaxEnd = delta + node.maxEnd;
      if (nodeMaxEnd < start) {
        setNodeIsVisited(node, true);
        continue;
      }
      if (node.left !== SENTINEL) {
        node = node.left;
        continue;
      }
    }
    nodeStart = delta + node.start;
    if (nodeStart > end) {
      setNodeIsVisited(node, true);
      continue;
    }
    nodeEnd = delta + node.end;
    if (nodeEnd >= start) {
      node.setCachedOffsets(nodeStart, nodeEnd, 0);
      result[resultLen++] = node;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function noOverlapReplace(T, start, end, textLength) {
  let node = T.root;
  let delta = 0;
  let nodeMaxEnd = 0;
  let nodeStart = 0;
  const editDelta = textLength - (end - start);
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      recomputeMaxEnd(node);
      node = node.parent;
      continue;
    }
    if (!getNodeIsVisited(node.left)) {
      nodeMaxEnd = delta + node.maxEnd;
      if (nodeMaxEnd < start) {
        setNodeIsVisited(node, true);
        continue;
      }
      if (node.left !== SENTINEL) {
        node = node.left;
        continue;
      }
    }
    nodeStart = delta + node.start;
    if (nodeStart > end) {
      node.start += editDelta;
      node.end += editDelta;
      node.delta += editDelta;
      if (node.delta < -1073741824 /* MIN_SAFE_DELTA */ || node.delta > 1073741824 /* MAX_SAFE_DELTA */) {
        T.requestNormalizeDelta = true;
      }
      setNodeIsVisited(node, true);
      continue;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
}
function collectNodesFromOwner(T, ownerId) {
  let node = T.root;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      node = node.parent;
      continue;
    }
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    if (node.ownerId === ownerId) {
      result[resultLen++] = node;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function collectNodesPostOrder(T) {
  let node = T.root;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      node = node.parent;
      continue;
    }
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      node = node.right;
      continue;
    }
    result[resultLen++] = node;
    setNodeIsVisited(node, true);
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function search(T, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
  let node = T.root;
  let delta = 0;
  let nodeStart = 0;
  let nodeEnd = 0;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      node = node.parent;
      continue;
    }
    if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
      node = node.left;
      continue;
    }
    nodeStart = delta + node.start;
    nodeEnd = delta + node.end;
    node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
    let include = true;
    if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
      include = false;
    }
    if (filterOutValidation && getNodeIsForValidation(node)) {
      include = false;
    }
    if (filterFontDecorations && getNodeAffectsFont(node)) {
      include = false;
    }
    if (onlyMarginDecorations && !getNodeIsInGlyphMargin(node)) {
      include = false;
    }
    if (include) {
      result[resultLen++] = node;
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function intervalSearch(T, intervalStart, intervalEnd, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
  let node = T.root;
  let delta = 0;
  let nodeMaxEnd = 0;
  let nodeStart = 0;
  let nodeEnd = 0;
  const result = [];
  let resultLen = 0;
  while (node !== SENTINEL) {
    if (getNodeIsVisited(node)) {
      setNodeIsVisited(node.left, false);
      setNodeIsVisited(node.right, false);
      if (node === node.parent.right) {
        delta -= node.parent.delta;
      }
      node = node.parent;
      continue;
    }
    if (!getNodeIsVisited(node.left)) {
      nodeMaxEnd = delta + node.maxEnd;
      if (nodeMaxEnd < intervalStart) {
        setNodeIsVisited(node, true);
        continue;
      }
      if (node.left !== SENTINEL) {
        node = node.left;
        continue;
      }
    }
    nodeStart = delta + node.start;
    if (nodeStart > intervalEnd) {
      setNodeIsVisited(node, true);
      continue;
    }
    nodeEnd = delta + node.end;
    if (nodeEnd >= intervalStart) {
      node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
      let include = true;
      if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
        include = false;
      }
      if (filterOutValidation && getNodeIsForValidation(node)) {
        include = false;
      }
      if (filterFontDecorations && getNodeAffectsFont(node)) {
        include = false;
      }
      if (onlyMarginDecorations && !getNodeIsInGlyphMargin(node)) {
        include = false;
      }
      if (include) {
        result[resultLen++] = node;
      }
    }
    setNodeIsVisited(node, true);
    if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
      delta += node.delta;
      node = node.right;
      continue;
    }
  }
  setNodeIsVisited(T.root, false);
  return result;
}
function rbTreeInsert(T, newNode) {
  if (T.root === SENTINEL) {
    newNode.parent = SENTINEL;
    newNode.left = SENTINEL;
    newNode.right = SENTINEL;
    setNodeColor(newNode, 0 /* Black */);
    T.root = newNode;
    return T.root;
  }
  treeInsert(T, newNode);
  recomputeMaxEndWalkToRoot(newNode.parent);
  let x = newNode;
  while (x !== T.root && getNodeColor(x.parent) === 1 /* Red */) {
    if (x.parent === x.parent.parent.left) {
      const y = x.parent.parent.right;
      if (getNodeColor(y) === 1 /* Red */) {
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(y, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        x = x.parent.parent;
      } else {
        if (x === x.parent.right) {
          x = x.parent;
          leftRotate(T, x);
        }
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        rightRotate(T, x.parent.parent);
      }
    } else {
      const y = x.parent.parent.left;
      if (getNodeColor(y) === 1 /* Red */) {
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(y, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        x = x.parent.parent;
      } else {
        if (x === x.parent.left) {
          x = x.parent;
          rightRotate(T, x);
        }
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(x.parent.parent, 1 /* Red */);
        leftRotate(T, x.parent.parent);
      }
    }
  }
  setNodeColor(T.root, 0 /* Black */);
  return newNode;
}
function treeInsert(T, z) {
  let delta = 0;
  let x = T.root;
  const zAbsoluteStart = z.start;
  const zAbsoluteEnd = z.end;
  while (true) {
    const cmp = intervalCompare(zAbsoluteStart, zAbsoluteEnd, x.start + delta, x.end + delta);
    if (cmp < 0) {
      if (x.left === SENTINEL) {
        z.start -= delta;
        z.end -= delta;
        z.maxEnd -= delta;
        x.left = z;
        break;
      } else {
        x = x.left;
      }
    } else {
      if (x.right === SENTINEL) {
        z.start -= delta + x.delta;
        z.end -= delta + x.delta;
        z.maxEnd -= delta + x.delta;
        x.right = z;
        break;
      } else {
        delta += x.delta;
        x = x.right;
      }
    }
  }
  z.parent = x;
  z.left = SENTINEL;
  z.right = SENTINEL;
  setNodeColor(z, 1 /* Red */);
}
function rbTreeDelete(T, z) {
  let x;
  let y;
  if (z.left === SENTINEL) {
    x = z.right;
    y = z;
    x.delta += z.delta;
    if (x.delta < -1073741824 /* MIN_SAFE_DELTA */ || x.delta > 1073741824 /* MAX_SAFE_DELTA */) {
      T.requestNormalizeDelta = true;
    }
    x.start += z.delta;
    x.end += z.delta;
  } else if (z.right === SENTINEL) {
    x = z.left;
    y = z;
  } else {
    y = leftest(z.right);
    x = y.right;
    x.start += y.delta;
    x.end += y.delta;
    x.delta += y.delta;
    if (x.delta < -1073741824 /* MIN_SAFE_DELTA */ || x.delta > 1073741824 /* MAX_SAFE_DELTA */) {
      T.requestNormalizeDelta = true;
    }
    y.start += z.delta;
    y.end += z.delta;
    y.delta = z.delta;
    if (y.delta < -1073741824 /* MIN_SAFE_DELTA */ || y.delta > 1073741824 /* MAX_SAFE_DELTA */) {
      T.requestNormalizeDelta = true;
    }
  }
  if (y === T.root) {
    T.root = x;
    setNodeColor(x, 0 /* Black */);
    z.detach();
    resetSentinel();
    recomputeMaxEnd(x);
    T.root.parent = SENTINEL;
    return;
  }
  const yWasRed = getNodeColor(y) === 1 /* Red */;
  if (y === y.parent.left) {
    y.parent.left = x;
  } else {
    y.parent.right = x;
  }
  if (y === z) {
    x.parent = y.parent;
  } else {
    if (y.parent === z) {
      x.parent = y;
    } else {
      x.parent = y.parent;
    }
    y.left = z.left;
    y.right = z.right;
    y.parent = z.parent;
    setNodeColor(y, getNodeColor(z));
    if (z === T.root) {
      T.root = y;
    } else {
      if (z === z.parent.left) {
        z.parent.left = y;
      } else {
        z.parent.right = y;
      }
    }
    if (y.left !== SENTINEL) {
      y.left.parent = y;
    }
    if (y.right !== SENTINEL) {
      y.right.parent = y;
    }
  }
  z.detach();
  if (yWasRed) {
    recomputeMaxEndWalkToRoot(x.parent);
    if (y !== z) {
      recomputeMaxEndWalkToRoot(y);
      recomputeMaxEndWalkToRoot(y.parent);
    }
    resetSentinel();
    return;
  }
  recomputeMaxEndWalkToRoot(x);
  recomputeMaxEndWalkToRoot(x.parent);
  if (y !== z) {
    recomputeMaxEndWalkToRoot(y);
    recomputeMaxEndWalkToRoot(y.parent);
  }
  let w;
  while (x !== T.root && getNodeColor(x) === 0 /* Black */) {
    if (x === x.parent.left) {
      w = x.parent.right;
      if (getNodeColor(w) === 1 /* Red */) {
        setNodeColor(w, 0 /* Black */);
        setNodeColor(x.parent, 1 /* Red */);
        leftRotate(T, x.parent);
        w = x.parent.right;
      }
      if (getNodeColor(w.left) === 0 /* Black */ && getNodeColor(w.right) === 0 /* Black */) {
        setNodeColor(w, 1 /* Red */);
        x = x.parent;
      } else {
        if (getNodeColor(w.right) === 0 /* Black */) {
          setNodeColor(w.left, 0 /* Black */);
          setNodeColor(w, 1 /* Red */);
          rightRotate(T, w);
          w = x.parent.right;
        }
        setNodeColor(w, getNodeColor(x.parent));
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(w.right, 0 /* Black */);
        leftRotate(T, x.parent);
        x = T.root;
      }
    } else {
      w = x.parent.left;
      if (getNodeColor(w) === 1 /* Red */) {
        setNodeColor(w, 0 /* Black */);
        setNodeColor(x.parent, 1 /* Red */);
        rightRotate(T, x.parent);
        w = x.parent.left;
      }
      if (getNodeColor(w.left) === 0 /* Black */ && getNodeColor(w.right) === 0 /* Black */) {
        setNodeColor(w, 1 /* Red */);
        x = x.parent;
      } else {
        if (getNodeColor(w.left) === 0 /* Black */) {
          setNodeColor(w.right, 0 /* Black */);
          setNodeColor(w, 1 /* Red */);
          leftRotate(T, w);
          w = x.parent.left;
        }
        setNodeColor(w, getNodeColor(x.parent));
        setNodeColor(x.parent, 0 /* Black */);
        setNodeColor(w.left, 0 /* Black */);
        rightRotate(T, x.parent);
        x = T.root;
      }
    }
  }
  setNodeColor(x, 0 /* Black */);
  resetSentinel();
}
function leftest(node) {
  while (node.left !== SENTINEL) {
    node = node.left;
  }
  return node;
}
function resetSentinel() {
  SENTINEL.parent = SENTINEL;
  SENTINEL.delta = 0;
  SENTINEL.start = 0;
  SENTINEL.end = 0;
}
function leftRotate(T, x) {
  const y = x.right;
  y.delta += x.delta;
  if (y.delta < -1073741824 /* MIN_SAFE_DELTA */ || y.delta > 1073741824 /* MAX_SAFE_DELTA */) {
    T.requestNormalizeDelta = true;
  }
  y.start += x.delta;
  y.end += x.delta;
  x.right = y.left;
  if (y.left !== SENTINEL) {
    y.left.parent = x;
  }
  y.parent = x.parent;
  if (x.parent === SENTINEL) {
    T.root = y;
  } else if (x === x.parent.left) {
    x.parent.left = y;
  } else {
    x.parent.right = y;
  }
  y.left = x;
  x.parent = y;
  recomputeMaxEnd(x);
  recomputeMaxEnd(y);
}
function rightRotate(T, y) {
  const x = y.left;
  y.delta -= x.delta;
  if (y.delta < -1073741824 /* MIN_SAFE_DELTA */ || y.delta > 1073741824 /* MAX_SAFE_DELTA */) {
    T.requestNormalizeDelta = true;
  }
  y.start -= x.delta;
  y.end -= x.delta;
  y.left = x.right;
  if (x.right !== SENTINEL) {
    x.right.parent = y;
  }
  x.parent = y.parent;
  if (y.parent === SENTINEL) {
    T.root = x;
  } else if (y === y.parent.right) {
    y.parent.right = x;
  } else {
    y.parent.left = x;
  }
  x.right = y;
  y.parent = x;
  recomputeMaxEnd(y);
  recomputeMaxEnd(x);
}
function computeMaxEnd(node) {
  let maxEnd = node.end;
  if (node.left !== SENTINEL) {
    const leftMaxEnd = node.left.maxEnd;
    if (leftMaxEnd > maxEnd) {
      maxEnd = leftMaxEnd;
    }
  }
  if (node.right !== SENTINEL) {
    const rightMaxEnd = node.right.maxEnd + node.delta;
    if (rightMaxEnd > maxEnd) {
      maxEnd = rightMaxEnd;
    }
  }
  return maxEnd;
}
function recomputeMaxEnd(node) {
  node.maxEnd = computeMaxEnd(node);
}
function recomputeMaxEndWalkToRoot(node) {
  while (node !== SENTINEL) {
    const maxEnd = computeMaxEnd(node);
    if (node.maxEnd === maxEnd) {
      return;
    }
    node.maxEnd = maxEnd;
    node = node.parent;
  }
}
function intervalCompare(aStart, aEnd, bStart, bEnd) {
  if (aStart === bStart) {
    return aEnd - bEnd;
  }
  return aStart - bStart;
}
export {
  ClassName,
  IntervalNode,
  IntervalTree,
  NodeColor,
  SENTINEL,
  getNodeColor,
  intervalCompare,
  nodeAcceptEdit,
  recomputeMaxEnd,
  setNodeStickiness
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvaW50ZXJ2YWxUcmVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgYXMgQWN0dWFsVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuL3RleHRNb2RlbC5qcyc7XG5cbi8vXG4vLyBUaGUgcmVkLWJsYWNrIHRyZWUgaXMgYmFzZWQgb24gdGhlIFwiSW50cm9kdWN0aW9uIHRvIEFsZ29yaXRobXNcIiBieSBDb3JtZW4sIExlaXNlcnNvbiBhbmQgUml2ZXN0LlxuLy9cblxuZXhwb3J0IGNvbnN0IGVudW0gQ2xhc3NOYW1lIHtcblx0RWRpdG9ySGludERlY29yYXRpb24gPSAnc3F1aWdnbHktaGludCcsXG5cdEVkaXRvckluZm9EZWNvcmF0aW9uID0gJ3NxdWlnZ2x5LWluZm8nLFxuXHRFZGl0b3JXYXJuaW5nRGVjb3JhdGlvbiA9ICdzcXVpZ2dseS13YXJuaW5nJyxcblx0RWRpdG9yRXJyb3JEZWNvcmF0aW9uID0gJ3NxdWlnZ2x5LWVycm9yJyxcblx0RWRpdG9yVW5uZWNlc3NhcnlEZWNvcmF0aW9uID0gJ3NxdWlnZ2x5LXVubmVjZXNzYXJ5Jyxcblx0RWRpdG9yVW5uZWNlc3NhcnlJbmxpbmVEZWNvcmF0aW9uID0gJ3NxdWlnZ2x5LWlubGluZS11bm5lY2Vzc2FyeScsXG5cdEVkaXRvckRlcHJlY2F0ZWRJbmxpbmVEZWNvcmF0aW9uID0gJ3NxdWlnZ2x5LWlubGluZS1kZXByZWNhdGVkJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBOb2RlQ29sb3Ige1xuXHRCbGFjayA9IDAsXG5cdFJlZCA9IDEsXG59XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0Q29sb3JNYXNrID0gMGIwMDAwMDAwMSxcblx0Q29sb3JNYXNrSW52ZXJzZSA9IDBiMTExMTExMTAsXG5cdENvbG9yT2Zmc2V0ID0gMCxcblxuXHRJc1Zpc2l0ZWRNYXNrID0gMGIwMDAwMDAxMCxcblx0SXNWaXNpdGVkTWFza0ludmVyc2UgPSAwYjExMTExMTAxLFxuXHRJc1Zpc2l0ZWRPZmZzZXQgPSAxLFxuXG5cdElzRm9yVmFsaWRhdGlvbk1hc2sgPSAwYjAwMDAwMTAwLFxuXHRJc0ZvclZhbGlkYXRpb25NYXNrSW52ZXJzZSA9IDBiMTExMTEwMTEsXG5cdElzRm9yVmFsaWRhdGlvbk9mZnNldCA9IDIsXG5cblx0U3RpY2tpbmVzc01hc2sgPSAwYjAwMDExMDAwLFxuXHRTdGlja2luZXNzTWFza0ludmVyc2UgPSAwYjExMTAwMTExLFxuXHRTdGlja2luZXNzT2Zmc2V0ID0gMyxcblxuXHRDb2xsYXBzZU9uUmVwbGFjZUVkaXRNYXNrID0gMGIwMDEwMDAwMCxcblx0Q29sbGFwc2VPblJlcGxhY2VFZGl0TWFza0ludmVyc2UgPSAwYjExMDExMTExLFxuXHRDb2xsYXBzZU9uUmVwbGFjZUVkaXRPZmZzZXQgPSA1LFxuXG5cdElzTWFyZ2luTWFzayA9IDBiMDEwMDAwMDAsXG5cdElzTWFyZ2luTWFza0ludmVyc2UgPSAwYjEwMTExMTExLFxuXHRJc01hcmdpbk9mZnNldCA9IDYsXG5cblx0QWZmZWN0c0ZvbnRNYXNrID0gMGIxMDAwMDAwMCxcblx0QWZmZWN0c0ZvbnRNYXNrSW52ZXJzZSA9IDBiMDExMTExMTEsXG5cdEFmZmVjdHNGb250T2Zmc2V0ID0gNyxcblxuXHQvKipcblx0ICogRHVlIHRvIGhvdyBkZWxldGlvbiB3b3JrcyAoaW4gb3JkZXIgdG8gYXZvaWQgYWx3YXlzIHdhbGtpbmcgdGhlIHJpZ2h0IHN1YnRyZWUgb2YgdGhlIGRlbGV0ZWQgbm9kZSksXG5cdCAqIHRoZSBkZWx0YXMgZm9yIG5vZGVzIGNhbiBncm93IGFuZCBzaHJpbmsgZHJhbWF0aWNhbGx5LiBJdCBoYXMgYmVlbiBvYnNlcnZlZCwgaW4gcHJhY3RpY2UsIHRoYXQgdW5sZXNzXG5cdCAqIHRoZSBkZWx0YXMgYXJlIGNvcnJlY3RlZCwgaW50ZWdlciBvdmVyZmxvdyB3aWxsIG9jY3VyLlxuXHQgKlxuXHQgKiBUaGUgaW50ZWdlciBvdmVyZmxvdyBvY2N1cnMgd2hlbiA1MyBiaXRzIGFyZSB1c2VkIGluIHRoZSBudW1iZXJzLCBidXQgd2Ugd2lsbCB0cnkgdG8gYXZvaWQgaXQgYXNcblx0ICogYSBub2RlJ3MgZGVsdGEgZ2V0cyBiZWxvdyBhIG5lZ2F0aXZlIDMwIGJpdHMgbnVtYmVyLlxuXHQgKlxuXHQgKiBNSU4gU01JIChTTWFsbCBJbnRlZ2VyKSBhcyBkZWZpbmVkIGluIHY4LlxuXHQgKiBvbmUgYml0IGlzIGxvc3QgZm9yIGJveGluZy91bmJveGluZyBmbGFnLlxuXHQgKiBvbmUgYml0IGlzIGxvc3QgZm9yIHNpZ24gZmxhZy5cblx0ICogU2VlIGh0dHBzOi8vdGhpYmF1bHRsYXVyZW5zLmdpdGh1Yi5pby9qYXZhc2NyaXB0LzIwMTMvMDQvMjkvaG93LXRoZS12OC1lbmdpbmUtd29ya3MvI3RhZ2dlZC12YWx1ZXNcblx0ICovXG5cdE1JTl9TQUZFX0RFTFRBID0gLSgxIDw8IDMwKSxcblx0LyoqXG5cdCAqIE1BWCBTTUkgKFNNYWxsIEludGVnZXIpIGFzIGRlZmluZWQgaW4gdjguXG5cdCAqIG9uZSBiaXQgaXMgbG9zdCBmb3IgYm94aW5nL3VuYm94aW5nIGZsYWcuXG5cdCAqIG9uZSBiaXQgaXMgbG9zdCBmb3Igc2lnbiBmbGFnLlxuXHQgKiBTZWUgaHR0cHM6Ly90aGliYXVsdGxhdXJlbnMuZ2l0aHViLmlvL2phdmFzY3JpcHQvMjAxMy8wNC8yOS9ob3ctdGhlLXY4LWVuZ2luZS13b3Jrcy8jdGFnZ2VkLXZhbHVlc1xuXHQgKi9cblx0TUFYX1NBRkVfREVMVEEgPSAxIDw8IDMwLFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Tm9kZUNvbG9yKG5vZGU6IEludGVydmFsTm9kZSk6IE5vZGVDb2xvciB7XG5cdHJldHVybiAoKG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuQ29sb3JNYXNrKSA+Pj4gQ29uc3RhbnRzLkNvbG9yT2Zmc2V0KTtcbn1cbmZ1bmN0aW9uIHNldE5vZGVDb2xvcihub2RlOiBJbnRlcnZhbE5vZGUsIGNvbG9yOiBOb2RlQ29sb3IpOiB2b2lkIHtcblx0bm9kZS5tZXRhZGF0YSA9IChcblx0XHQobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5Db2xvck1hc2tJbnZlcnNlKSB8IChjb2xvciA8PCBDb25zdGFudHMuQ29sb3JPZmZzZXQpXG5cdCk7XG59XG5mdW5jdGlvbiBnZXROb2RlSXNWaXNpdGVkKG5vZGU6IEludGVydmFsTm9kZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLklzVmlzaXRlZE1hc2spID4+PiBDb25zdGFudHMuSXNWaXNpdGVkT2Zmc2V0KSA9PT0gMTtcbn1cbmZ1bmN0aW9uIHNldE5vZGVJc1Zpc2l0ZWQobm9kZTogSW50ZXJ2YWxOb2RlLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRub2RlLm1ldGFkYXRhID0gKFxuXHRcdChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLklzVmlzaXRlZE1hc2tJbnZlcnNlKSB8ICgodmFsdWUgPyAxIDogMCkgPDwgQ29uc3RhbnRzLklzVmlzaXRlZE9mZnNldClcblx0KTtcbn1cbmZ1bmN0aW9uIGdldE5vZGVJc0ZvclZhbGlkYXRpb24obm9kZTogSW50ZXJ2YWxOb2RlKTogYm9vbGVhbiB7XG5cdHJldHVybiAoKG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuSXNGb3JWYWxpZGF0aW9uTWFzaykgPj4+IENvbnN0YW50cy5Jc0ZvclZhbGlkYXRpb25PZmZzZXQpID09PSAxO1xufVxuZnVuY3Rpb24gc2V0Tm9kZUlzRm9yVmFsaWRhdGlvbihub2RlOiBJbnRlcnZhbE5vZGUsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdG5vZGUubWV0YWRhdGEgPSAoXG5cdFx0KG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuSXNGb3JWYWxpZGF0aW9uTWFza0ludmVyc2UpIHwgKCh2YWx1ZSA/IDEgOiAwKSA8PCBDb25zdGFudHMuSXNGb3JWYWxpZGF0aW9uT2Zmc2V0KVxuXHQpO1xufVxuZnVuY3Rpb24gZ2V0Tm9kZUlzSW5HbHlwaE1hcmdpbihub2RlOiBJbnRlcnZhbE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuICgobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5Jc01hcmdpbk1hc2spID4+PiBDb25zdGFudHMuSXNNYXJnaW5PZmZzZXQpID09PSAxO1xufVxuZnVuY3Rpb24gc2V0Tm9kZUlzSW5HbHlwaE1hcmdpbihub2RlOiBJbnRlcnZhbE5vZGUsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdG5vZGUubWV0YWRhdGEgPSAoXG5cdFx0KG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuSXNNYXJnaW5NYXNrSW52ZXJzZSkgfCAoKHZhbHVlID8gMSA6IDApIDw8IENvbnN0YW50cy5Jc01hcmdpbk9mZnNldClcblx0KTtcbn1cbmZ1bmN0aW9uIGdldE5vZGVBZmZlY3RzRm9udChub2RlOiBJbnRlcnZhbE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuICgobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5BZmZlY3RzRm9udE1hc2spID4+PiBDb25zdGFudHMuQWZmZWN0c0ZvbnRPZmZzZXQpID09PSAxO1xufVxuZnVuY3Rpb24gc2V0Tm9kZUFmZmVjdHNGb250KG5vZGU6IEludGVydmFsTm9kZSwgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0bm9kZS5tZXRhZGF0YSA9IChcblx0XHQobm9kZS5tZXRhZGF0YSAmIENvbnN0YW50cy5BZmZlY3RzRm9udE1hc2tJbnZlcnNlKSB8ICgodmFsdWUgPyAxIDogMCkgPDwgQ29uc3RhbnRzLkFmZmVjdHNGb250T2Zmc2V0KVxuXHQpO1xufVxuZnVuY3Rpb24gZ2V0Tm9kZVN0aWNraW5lc3Mobm9kZTogSW50ZXJ2YWxOb2RlKTogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB7XG5cdHJldHVybiAoKG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuU3RpY2tpbmVzc01hc2spID4+PiBDb25zdGFudHMuU3RpY2tpbmVzc09mZnNldCk7XG59XG5mdW5jdGlvbiBfc2V0Tm9kZVN0aWNraW5lc3Mobm9kZTogSW50ZXJ2YWxOb2RlLCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzKTogdm9pZCB7XG5cdG5vZGUubWV0YWRhdGEgPSAoXG5cdFx0KG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuU3RpY2tpbmVzc01hc2tJbnZlcnNlKSB8IChzdGlja2luZXNzIDw8IENvbnN0YW50cy5TdGlja2luZXNzT2Zmc2V0KVxuXHQpO1xufVxuZnVuY3Rpb24gZ2V0Q29sbGFwc2VPblJlcGxhY2VFZGl0KG5vZGU6IEludGVydmFsTm9kZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKChub2RlLm1ldGFkYXRhICYgQ29uc3RhbnRzLkNvbGxhcHNlT25SZXBsYWNlRWRpdE1hc2spID4+PiBDb25zdGFudHMuQ29sbGFwc2VPblJlcGxhY2VFZGl0T2Zmc2V0KSA9PT0gMTtcbn1cbmZ1bmN0aW9uIHNldENvbGxhcHNlT25SZXBsYWNlRWRpdChub2RlOiBJbnRlcnZhbE5vZGUsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdG5vZGUubWV0YWRhdGEgPSAoXG5cdFx0KG5vZGUubWV0YWRhdGEgJiBDb25zdGFudHMuQ29sbGFwc2VPblJlcGxhY2VFZGl0TWFza0ludmVyc2UpIHwgKCh2YWx1ZSA/IDEgOiAwKSA8PCBDb25zdGFudHMuQ29sbGFwc2VPblJlcGxhY2VFZGl0T2Zmc2V0KVxuXHQpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNldE5vZGVTdGlja2luZXNzKG5vZGU6IEludGVydmFsTm9kZSwgc3RpY2tpbmVzczogQWN0dWFsVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyk6IHZvaWQge1xuXHRfc2V0Tm9kZVN0aWNraW5lc3Mobm9kZSwgPG51bWJlcj5zdGlja2luZXNzKTtcbn1cblxuZXhwb3J0IGNsYXNzIEludGVydmFsTm9kZSB7XG5cblx0LyoqXG5cdCAqIGNvbnRhaW5zIGJpbmFyeSBlbmNvZGVkIGluZm9ybWF0aW9uIGZvciBjb2xvciwgdmlzaXRlZCwgaXNGb3JWYWxpZGF0aW9uIGFuZCBzdGlja2luZXNzLlxuXHQgKi9cblx0cHVibGljIG1ldGFkYXRhOiBudW1iZXI7XG5cblx0cHVibGljIHBhcmVudDogSW50ZXJ2YWxOb2RlO1xuXHRwdWJsaWMgbGVmdDogSW50ZXJ2YWxOb2RlO1xuXHRwdWJsaWMgcmlnaHQ6IEludGVydmFsTm9kZTtcblxuXHRwdWJsaWMgc3RhcnQ6IG51bWJlcjtcblx0cHVibGljIGVuZDogbnVtYmVyO1xuXHRwdWJsaWMgZGVsdGE6IG51bWJlcjtcblx0cHVibGljIG1heEVuZDogbnVtYmVyO1xuXG5cdHB1YmxpYyBpZDogc3RyaW5nO1xuXHRwdWJsaWMgb3duZXJJZDogbnVtYmVyO1xuXHRwdWJsaWMgb3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblxuXHRwdWJsaWMgY2FjaGVkVmVyc2lvbklkOiBudW1iZXI7XG5cdHB1YmxpYyBjYWNoZWRBYnNvbHV0ZVN0YXJ0OiBudW1iZXI7XG5cdHB1YmxpYyBjYWNoZWRBYnNvbHV0ZUVuZDogbnVtYmVyO1xuXHRwdWJsaWMgcmFuZ2U6IFJhbmdlIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcikge1xuXHRcdHRoaXMubWV0YWRhdGEgPSAwO1xuXG5cdFx0dGhpcy5wYXJlbnQgPSB0aGlzO1xuXHRcdHRoaXMubGVmdCA9IHRoaXM7XG5cdFx0dGhpcy5yaWdodCA9IHRoaXM7XG5cdFx0c2V0Tm9kZUNvbG9yKHRoaXMsIE5vZGVDb2xvci5SZWQpO1xuXG5cdFx0dGhpcy5zdGFydCA9IHN0YXJ0O1xuXHRcdHRoaXMuZW5kID0gZW5kO1xuXHRcdC8vIEZPUkNFX09WRVJGTE9XSU5HX1RFU1Q6IHRoaXMuZGVsdGEgPSBzdGFydDtcblx0XHR0aGlzLmRlbHRhID0gMDtcblx0XHR0aGlzLm1heEVuZCA9IGVuZDtcblxuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLm93bmVySWQgPSAwO1xuXHRcdHRoaXMub3B0aW9ucyA9IG51bGwhO1xuXHRcdHNldE5vZGVJc0ZvclZhbGlkYXRpb24odGhpcywgZmFsc2UpO1xuXHRcdHNldE5vZGVJc0luR2x5cGhNYXJnaW4odGhpcywgZmFsc2UpO1xuXHRcdF9zZXROb2RlU3RpY2tpbmVzcyh0aGlzLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyk7XG5cdFx0c2V0Q29sbGFwc2VPblJlcGxhY2VFZGl0KHRoaXMsIGZhbHNlKTtcblx0XHRzZXROb2RlQWZmZWN0c0ZvbnQodGhpcywgZmFsc2UpO1xuXG5cdFx0dGhpcy5jYWNoZWRWZXJzaW9uSWQgPSAwO1xuXHRcdHRoaXMuY2FjaGVkQWJzb2x1dGVTdGFydCA9IHN0YXJ0O1xuXHRcdHRoaXMuY2FjaGVkQWJzb2x1dGVFbmQgPSBlbmQ7XG5cdFx0dGhpcy5yYW5nZSA9IG51bGw7XG5cblx0XHRzZXROb2RlSXNWaXNpdGVkKHRoaXMsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyByZXNldCh2ZXJzaW9uSWQ6IG51bWJlciwgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIHJhbmdlOiBSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLmVuZCA9IGVuZDtcblx0XHR0aGlzLm1heEVuZCA9IGVuZDtcblx0XHR0aGlzLmNhY2hlZFZlcnNpb25JZCA9IHZlcnNpb25JZDtcblx0XHR0aGlzLmNhY2hlZEFic29sdXRlU3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLmNhY2hlZEFic29sdXRlRW5kID0gZW5kO1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRPcHRpb25zKG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpIHtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdGNvbnN0IGNsYXNzTmFtZSA9IHRoaXMub3B0aW9ucy5jbGFzc05hbWU7XG5cdFx0c2V0Tm9kZUlzRm9yVmFsaWRhdGlvbih0aGlzLCAoXG5cdFx0XHRjbGFzc05hbWUgPT09IENsYXNzTmFtZS5FZGl0b3JFcnJvckRlY29yYXRpb25cblx0XHRcdHx8IGNsYXNzTmFtZSA9PT0gQ2xhc3NOYW1lLkVkaXRvcldhcm5pbmdEZWNvcmF0aW9uXG5cdFx0XHR8fCBjbGFzc05hbWUgPT09IENsYXNzTmFtZS5FZGl0b3JJbmZvRGVjb3JhdGlvblxuXHRcdCkpO1xuXHRcdHNldE5vZGVJc0luR2x5cGhNYXJnaW4odGhpcywgdGhpcy5vcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lICE9PSBudWxsKTtcblx0XHRfc2V0Tm9kZVN0aWNraW5lc3ModGhpcywgPG51bWJlcj50aGlzLm9wdGlvbnMuc3RpY2tpbmVzcyk7XG5cdFx0c2V0Q29sbGFwc2VPblJlcGxhY2VFZGl0KHRoaXMsIHRoaXMub3B0aW9ucy5jb2xsYXBzZU9uUmVwbGFjZUVkaXQpO1xuXHRcdHNldE5vZGVBZmZlY3RzRm9udCh0aGlzLCB0aGlzLm9wdGlvbnMuYWZmZWN0c0ZvbnQgPz8gZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIHNldENhY2hlZE9mZnNldHMoYWJzb2x1dGVTdGFydDogbnVtYmVyLCBhYnNvbHV0ZUVuZDogbnVtYmVyLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhY2hlZFZlcnNpb25JZCAhPT0gY2FjaGVkVmVyc2lvbklkKSB7XG5cdFx0XHR0aGlzLnJhbmdlID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5jYWNoZWRWZXJzaW9uSWQgPSBjYWNoZWRWZXJzaW9uSWQ7XG5cdFx0dGhpcy5jYWNoZWRBYnNvbHV0ZVN0YXJ0ID0gYWJzb2x1dGVTdGFydDtcblx0XHR0aGlzLmNhY2hlZEFic29sdXRlRW5kID0gYWJzb2x1dGVFbmQ7XG5cdH1cblxuXHRwdWJsaWMgZGV0YWNoKCk6IHZvaWQge1xuXHRcdHRoaXMucGFyZW50ID0gbnVsbCE7XG5cdFx0dGhpcy5sZWZ0ID0gbnVsbCE7XG5cdFx0dGhpcy5yaWdodCA9IG51bGwhO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBTRU5USU5FTDogSW50ZXJ2YWxOb2RlID0gbmV3IEludGVydmFsTm9kZShudWxsISwgMCwgMCk7XG5TRU5USU5FTC5wYXJlbnQgPSBTRU5USU5FTDtcblNFTlRJTkVMLmxlZnQgPSBTRU5USU5FTDtcblNFTlRJTkVMLnJpZ2h0ID0gU0VOVElORUw7XG5zZXROb2RlQ29sb3IoU0VOVElORUwsIE5vZGVDb2xvci5CbGFjayk7XG5cbmV4cG9ydCBjbGFzcyBJbnRlcnZhbFRyZWUge1xuXG5cdHB1YmxpYyByb290OiBJbnRlcnZhbE5vZGU7XG5cdHB1YmxpYyByZXF1ZXN0Tm9ybWFsaXplRGVsdGE6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5yb290ID0gU0VOVElORUw7XG5cdFx0dGhpcy5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEgPSBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBpbnRlcnZhbFNlYXJjaChzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0aWYgKHRoaXMucm9vdCA9PT0gU0VOVElORUwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGludGVydmFsU2VhcmNoKHRoaXMsIHN0YXJ0LCBlbmQsIGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHNlYXJjaChmaWx0ZXJPd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgY2FjaGVkVmVyc2lvbklkOiBudW1iZXIsIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IEludGVydmFsTm9kZVtdIHtcblx0XHRpZiAodGhpcy5yb290ID09PSBTRU5USU5FTCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VhcmNoKHRoaXMsIGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdpbGwgbm90IHNldCBgY2FjaGVkQWJzb2x1dGVTdGFydGAgbm9yIGBjYWNoZWRBYnNvbHV0ZUVuZGAgb24gdGhlIHJldHVybmVkIG5vZGVzIVxuXHQgKi9cblx0cHVibGljIGNvbGxlY3ROb2Rlc0Zyb21Pd25lcihvd25lcklkOiBudW1iZXIpOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0cmV0dXJuIGNvbGxlY3ROb2Rlc0Zyb21Pd25lcih0aGlzLCBvd25lcklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaWxsIG5vdCBzZXQgYGNhY2hlZEFic29sdXRlU3RhcnRgIG5vciBgY2FjaGVkQWJzb2x1dGVFbmRgIG9uIHRoZSByZXR1cm5lZCBub2RlcyFcblx0ICovXG5cdHB1YmxpYyBjb2xsZWN0Tm9kZXNQb3N0T3JkZXIoKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdHJldHVybiBjb2xsZWN0Tm9kZXNQb3N0T3JkZXIodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0KG5vZGU6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHRcdHJiVHJlZUluc2VydCh0aGlzLCBub2RlKTtcblx0XHR0aGlzLl9ub3JtYWxpemVEZWx0YUlmTmVjZXNzYXJ5KCk7XG5cdH1cblxuXHRwdWJsaWMgZGVsZXRlKG5vZGU6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHRcdHJiVHJlZURlbGV0ZSh0aGlzLCBub2RlKTtcblx0XHR0aGlzLl9ub3JtYWxpemVEZWx0YUlmTmVjZXNzYXJ5KCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZU5vZGUobm9kZTogSW50ZXJ2YWxOb2RlLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGluaXRpYWxOb2RlID0gbm9kZTtcblx0XHRsZXQgZGVsdGEgPSAwO1xuXHRcdHdoaWxlIChub2RlICE9PSB0aGlzLnJvb3QpIHtcblx0XHRcdGlmIChub2RlID09PSBub2RlLnBhcmVudC5yaWdodCkge1xuXHRcdFx0XHRkZWx0YSArPSBub2RlLnBhcmVudC5kZWx0YTtcblx0XHRcdH1cblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlU3RhcnQgPSBpbml0aWFsTm9kZS5zdGFydCArIGRlbHRhO1xuXHRcdGNvbnN0IG5vZGVFbmQgPSBpbml0aWFsTm9kZS5lbmQgKyBkZWx0YTtcblx0XHRpbml0aWFsTm9kZS5zZXRDYWNoZWRPZmZzZXRzKG5vZGVTdGFydCwgbm9kZUVuZCwgY2FjaGVkVmVyc2lvbklkKTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRSZXBsYWNlKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgdGV4dExlbmd0aDogbnVtYmVyLCBmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gT3VyIHN0cmF0ZWd5IGlzIHRvIHJlbW92ZSBhbGwgZGlyZWN0bHkgaW1wYWN0ZWQgbm9kZXMsIGFuZCB0aGVuIGFkZCB0aGVtIGJhY2sgdG8gdGhlIHRyZWUuXG5cblx0XHQvLyAoMSkgY29sbGVjdCBhbGwgbm9kZXMgdGhhdCBhcmUgaW50ZXJzZWN0aW5nIHRoaXMgZWRpdCBhcyBub2RlcyBvZiBpbnRlcmVzdFxuXHRcdGNvbnN0IG5vZGVzT2ZJbnRlcmVzdCA9IHNlYXJjaEZvckVkaXRpbmcodGhpcywgb2Zmc2V0LCBvZmZzZXQgKyBsZW5ndGgpO1xuXG5cdFx0Ly8gKDIpIHJlbW92ZSBhbGwgbm9kZXMgdGhhdCBhcmUgaW50ZXJzZWN0aW5nIHRoaXMgZWRpdFxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBub2Rlc09mSW50ZXJlc3QubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBub2Rlc09mSW50ZXJlc3RbaV07XG5cdFx0XHRyYlRyZWVEZWxldGUodGhpcywgbm9kZSk7XG5cdFx0fVxuXHRcdHRoaXMuX25vcm1hbGl6ZURlbHRhSWZOZWNlc3NhcnkoKTtcblxuXHRcdC8vICgzKSBlZGl0IGFsbCB0cmVlIG5vZGVzIGV4Y2VwdCB0aGUgbm9kZXMgb2YgaW50ZXJlc3Rcblx0XHRub092ZXJsYXBSZXBsYWNlKHRoaXMsIG9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoLCB0ZXh0TGVuZ3RoKTtcblx0XHR0aGlzLl9ub3JtYWxpemVEZWx0YUlmTmVjZXNzYXJ5KCk7XG5cblx0XHQvLyAoNCkgZWRpdCB0aGUgbm9kZXMgb2YgaW50ZXJlc3QgYW5kIGluc2VydCB0aGVtIGJhY2sgaW4gdGhlIHRyZWVcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbm9kZXNPZkludGVyZXN0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBub2RlID0gbm9kZXNPZkludGVyZXN0W2ldO1xuXHRcdFx0bm9kZS5zdGFydCA9IG5vZGUuY2FjaGVkQWJzb2x1dGVTdGFydDtcblx0XHRcdG5vZGUuZW5kID0gbm9kZS5jYWNoZWRBYnNvbHV0ZUVuZDtcblx0XHRcdG5vZGVBY2NlcHRFZGl0KG5vZGUsIG9mZnNldCwgKG9mZnNldCArIGxlbmd0aCksIHRleHRMZW5ndGgsIGZvcmNlTW92ZU1hcmtlcnMpO1xuXHRcdFx0bm9kZS5tYXhFbmQgPSBub2RlLmVuZDtcblx0XHRcdHJiVHJlZUluc2VydCh0aGlzLCBub2RlKTtcblx0XHR9XG5cdFx0dGhpcy5fbm9ybWFsaXplRGVsdGFJZk5lY2Vzc2FyeSgpO1xuXHR9XG5cblx0cHVibGljIGdldEFsbEluT3JkZXIoKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdHJldHVybiBzZWFyY2godGhpcywgMCwgZmFsc2UsIGZhbHNlLCAwLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9ub3JtYWxpemVEZWx0YUlmTmVjZXNzYXJ5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEgPSBmYWxzZTtcblx0XHRub3JtYWxpemVEZWx0YSh0aGlzKTtcblx0fVxufVxuXG4vLyNyZWdpb24gRGVsdGEgTm9ybWFsaXphdGlvblxuZnVuY3Rpb24gbm9ybWFsaXplRGVsdGEoVDogSW50ZXJ2YWxUcmVlKTogdm9pZCB7XG5cdGxldCBub2RlID0gVC5yb290O1xuXHRsZXQgZGVsdGEgPSAwO1xuXHR3aGlsZSAobm9kZSAhPT0gU0VOVElORUwpIHtcblxuXHRcdGlmIChub2RlLmxlZnQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCkpIHtcblx0XHRcdC8vIGdvIGxlZnRcblx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5yaWdodCAhPT0gU0VOVElORUwgJiYgIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCkpIHtcblx0XHRcdC8vIGdvIHJpZ2h0XG5cdFx0XHRkZWx0YSArPSBub2RlLmRlbHRhO1xuXHRcdFx0bm9kZSA9IG5vZGUucmlnaHQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgY3VycmVudCBub2RlXG5cdFx0bm9kZS5zdGFydCA9IGRlbHRhICsgbm9kZS5zdGFydDtcblx0XHRub2RlLmVuZCA9IGRlbHRhICsgbm9kZS5lbmQ7XG5cdFx0bm9kZS5kZWx0YSA9IDA7XG5cdFx0cmVjb21wdXRlTWF4RW5kKG5vZGUpO1xuXG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblxuXHRcdC8vIGdvaW5nIHVwIGZyb20gdGhpcyBub2RlXG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQsIGZhbHNlKTtcblx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQsIGZhbHNlKTtcblx0XHRpZiAobm9kZSA9PT0gbm9kZS5wYXJlbnQucmlnaHQpIHtcblx0XHRcdGRlbHRhIC09IG5vZGUucGFyZW50LmRlbHRhO1xuXHRcdH1cblx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdH1cblxuXHRzZXROb2RlSXNWaXNpdGVkKFQucm9vdCwgZmFsc2UpO1xufVxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBFZGl0aW5nXG5cbmNvbnN0IGVudW0gTWFya2VyTW92ZVNlbWFudGljcyB7XG5cdE1hcmtlckRlZmluZWQgPSAwLFxuXHRGb3JjZU1vdmUgPSAxLFxuXHRGb3JjZVN0YXkgPSAyXG59XG5cbmZ1bmN0aW9uIGFkanVzdE1hcmtlckJlZm9yZUNvbHVtbihtYXJrZXJPZmZzZXQ6IG51bWJlciwgbWFya2VyU3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyOiBib29sZWFuLCBjaGVja09mZnNldDogbnVtYmVyLCBtb3ZlU2VtYW50aWNzOiBNYXJrZXJNb3ZlU2VtYW50aWNzKTogYm9vbGVhbiB7XG5cdGlmIChtYXJrZXJPZmZzZXQgPCBjaGVja09mZnNldCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChtYXJrZXJPZmZzZXQgPiBjaGVja09mZnNldCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAobW92ZVNlbWFudGljcyA9PT0gTWFya2VyTW92ZVNlbWFudGljcy5Gb3JjZU1vdmUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKG1vdmVTZW1hbnRpY3MgPT09IE1hcmtlck1vdmVTZW1hbnRpY3MuRm9yY2VTdGF5KSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIG1hcmtlclN0aWNrVG9QcmV2aW91c0NoYXJhY3Rlcjtcbn1cblxuLyoqXG4gKiBUaGlzIGlzIGEgbG90IG1vcmUgY29tcGxpY2F0ZWQgdGhhbiBzdHJpY3RseSBuZWNlc3NhcnkgdG8gbWFpbnRhaW4gdGhlIHNhbWUgYmVoYXZpb3VyXG4gKiBhcyB3aGVuIGRlY29yYXRpb25zIHdlcmUgaW1wbGVtZW50ZWQgdXNpbmcgdHdvIG1hcmtlcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub2RlQWNjZXB0RWRpdChub2RlOiBJbnRlcnZhbE5vZGUsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCB0ZXh0TGVuZ3RoOiBudW1iZXIsIGZvcmNlTW92ZU1hcmtlcnM6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29uc3Qgbm9kZVN0aWNraW5lc3MgPSBnZXROb2RlU3RpY2tpbmVzcyhub2RlKTtcblx0Y29uc3Qgc3RhcnRTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXIgPSAoXG5cdFx0bm9kZVN0aWNraW5lc3MgPT09IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdHx8IG5vZGVTdGlja2luZXNzID09PSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmVcblx0KTtcblx0Y29uc3QgZW5kU3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyID0gKFxuXHRcdG5vZGVTdGlja2luZXNzID09PSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdHx8IG5vZGVTdGlja2luZXNzID09PSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmVcblx0KTtcblxuXHRjb25zdCBkZWxldGluZ0NudCA9IChlbmQgLSBzdGFydCk7XG5cdGNvbnN0IGluc2VydGluZ0NudCA9IHRleHRMZW5ndGg7XG5cdGNvbnN0IGNvbW1vbkxlbmd0aCA9IE1hdGgubWluKGRlbGV0aW5nQ250LCBpbnNlcnRpbmdDbnQpO1xuXG5cdGNvbnN0IG5vZGVTdGFydCA9IG5vZGUuc3RhcnQ7XG5cdGxldCBzdGFydERvbmUgPSBmYWxzZTtcblxuXHRjb25zdCBub2RlRW5kID0gbm9kZS5lbmQ7XG5cdGxldCBlbmREb25lID0gZmFsc2U7XG5cblx0aWYgKHN0YXJ0IDw9IG5vZGVTdGFydCAmJiBub2RlRW5kIDw9IGVuZCAmJiBnZXRDb2xsYXBzZU9uUmVwbGFjZUVkaXQobm9kZSkpIHtcblx0XHQvLyBUaGlzIGVkaXQgZW5jb21wYXNzZXMgdGhlIGVudGlyZSBkZWNvcmF0aW9uIHJhbmdlXG5cdFx0Ly8gYW5kIHRoZSBkZWNvcmF0aW9uIGhhcyBhc2tlZCB0byBiZWNvbWUgY29sbGFwc2VkXG5cdFx0bm9kZS5zdGFydCA9IHN0YXJ0O1xuXHRcdHN0YXJ0RG9uZSA9IHRydWU7XG5cdFx0bm9kZS5lbmQgPSBzdGFydDtcblx0XHRlbmREb25lID0gdHJ1ZTtcblx0fVxuXG5cdHtcblx0XHRjb25zdCBtb3ZlU2VtYW50aWNzID0gZm9yY2VNb3ZlTWFya2VycyA/IE1hcmtlck1vdmVTZW1hbnRpY3MuRm9yY2VNb3ZlIDogKGRlbGV0aW5nQ250ID4gMCA/IE1hcmtlck1vdmVTZW1hbnRpY3MuRm9yY2VTdGF5IDogTWFya2VyTW92ZVNlbWFudGljcy5NYXJrZXJEZWZpbmVkKTtcblx0XHRpZiAoIXN0YXJ0RG9uZSAmJiBhZGp1c3RNYXJrZXJCZWZvcmVDb2x1bW4obm9kZVN0YXJ0LCBzdGFydFN0aWNrVG9QcmV2aW91c0NoYXJhY3Rlciwgc3RhcnQsIG1vdmVTZW1hbnRpY3MpKSB7XG5cdFx0XHRzdGFydERvbmUgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWVuZERvbmUgJiYgYWRqdXN0TWFya2VyQmVmb3JlQ29sdW1uKG5vZGVFbmQsIGVuZFN0aWNrVG9QcmV2aW91c0NoYXJhY3Rlciwgc3RhcnQsIG1vdmVTZW1hbnRpY3MpKSB7XG5cdFx0XHRlbmREb25lID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRpZiAoY29tbW9uTGVuZ3RoID4gMCAmJiAhZm9yY2VNb3ZlTWFya2Vycykge1xuXHRcdGNvbnN0IG1vdmVTZW1hbnRpY3MgPSAoZGVsZXRpbmdDbnQgPiBpbnNlcnRpbmdDbnQgPyBNYXJrZXJNb3ZlU2VtYW50aWNzLkZvcmNlU3RheSA6IE1hcmtlck1vdmVTZW1hbnRpY3MuTWFya2VyRGVmaW5lZCk7XG5cdFx0aWYgKCFzdGFydERvbmUgJiYgYWRqdXN0TWFya2VyQmVmb3JlQ29sdW1uKG5vZGVTdGFydCwgc3RhcnRTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXIsIHN0YXJ0ICsgY29tbW9uTGVuZ3RoLCBtb3ZlU2VtYW50aWNzKSkge1xuXHRcdFx0c3RhcnREb25lID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFlbmREb25lICYmIGFkanVzdE1hcmtlckJlZm9yZUNvbHVtbihub2RlRW5kLCBlbmRTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXIsIHN0YXJ0ICsgY29tbW9uTGVuZ3RoLCBtb3ZlU2VtYW50aWNzKSkge1xuXHRcdFx0ZW5kRG9uZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0e1xuXHRcdGNvbnN0IG1vdmVTZW1hbnRpY3MgPSBmb3JjZU1vdmVNYXJrZXJzID8gTWFya2VyTW92ZVNlbWFudGljcy5Gb3JjZU1vdmUgOiBNYXJrZXJNb3ZlU2VtYW50aWNzLk1hcmtlckRlZmluZWQ7XG5cdFx0aWYgKCFzdGFydERvbmUgJiYgYWRqdXN0TWFya2VyQmVmb3JlQ29sdW1uKG5vZGVTdGFydCwgc3RhcnRTdGlja1RvUHJldmlvdXNDaGFyYWN0ZXIsIGVuZCwgbW92ZVNlbWFudGljcykpIHtcblx0XHRcdG5vZGUuc3RhcnQgPSBzdGFydCArIGluc2VydGluZ0NudDtcblx0XHRcdHN0YXJ0RG9uZSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmICghZW5kRG9uZSAmJiBhZGp1c3RNYXJrZXJCZWZvcmVDb2x1bW4obm9kZUVuZCwgZW5kU3RpY2tUb1ByZXZpb3VzQ2hhcmFjdGVyLCBlbmQsIG1vdmVTZW1hbnRpY3MpKSB7XG5cdFx0XHRub2RlLmVuZCA9IHN0YXJ0ICsgaW5zZXJ0aW5nQ250O1xuXHRcdFx0ZW5kRG9uZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRmluaXNoXG5cdGNvbnN0IGRlbHRhQ29sdW1uID0gKGluc2VydGluZ0NudCAtIGRlbGV0aW5nQ250KTtcblx0aWYgKCFzdGFydERvbmUpIHtcblx0XHRub2RlLnN0YXJ0ID0gTWF0aC5tYXgoMCwgbm9kZVN0YXJ0ICsgZGVsdGFDb2x1bW4pO1xuXHR9XG5cdGlmICghZW5kRG9uZSkge1xuXHRcdG5vZGUuZW5kID0gTWF0aC5tYXgoMCwgbm9kZUVuZCArIGRlbHRhQ29sdW1uKTtcblx0fVxuXG5cdGlmIChub2RlLnN0YXJ0ID4gbm9kZS5lbmQpIHtcblx0XHRub2RlLmVuZCA9IG5vZGUuc3RhcnQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2VhcmNoRm9yRWRpdGluZyhUOiBJbnRlcnZhbFRyZWUsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogSW50ZXJ2YWxOb2RlW10ge1xuXHQvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9JbnRlcnZhbF90cmVlI0F1Z21lbnRlZF90cmVlXG5cdC8vIE5vdywgaXQgaXMga25vd24gdGhhdCB0d28gaW50ZXJ2YWxzIEEgYW5kIEIgb3ZlcmxhcCBvbmx5IHdoZW4gYm90aFxuXHQvLyBBLmxvdyA8PSBCLmhpZ2ggYW5kIEEuaGlnaCA+PSBCLmxvdy4gV2hlbiBzZWFyY2hpbmcgdGhlIHRyZWVzIGZvclxuXHQvLyBub2RlcyBvdmVybGFwcGluZyB3aXRoIGEgZ2l2ZW4gaW50ZXJ2YWwsIHlvdSBjYW4gaW1tZWRpYXRlbHkgc2tpcDpcblx0Ly8gIGEpIGFsbCBub2RlcyB0byB0aGUgcmlnaHQgb2Ygbm9kZXMgd2hvc2UgbG93IHZhbHVlIGlzIHBhc3QgdGhlIGVuZCBvZiB0aGUgZ2l2ZW4gaW50ZXJ2YWwuXG5cdC8vICBiKSBhbGwgbm9kZXMgdGhhdCBoYXZlIHRoZWlyIG1heGltdW0gJ2hpZ2gnIHZhbHVlIGJlbG93IHRoZSBzdGFydCBvZiB0aGUgZ2l2ZW4gaW50ZXJ2YWwuXG5cdGxldCBub2RlID0gVC5yb290O1xuXHRsZXQgZGVsdGEgPSAwO1xuXHRsZXQgbm9kZU1heEVuZCA9IDA7XG5cdGxldCBub2RlU3RhcnQgPSAwO1xuXHRsZXQgbm9kZUVuZCA9IDA7XG5cdGNvbnN0IHJlc3VsdDogSW50ZXJ2YWxOb2RlW10gPSBbXTtcblx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdHdoaWxlIChub2RlICE9PSBTRU5USU5FTCkge1xuXHRcdGlmIChnZXROb2RlSXNWaXNpdGVkKG5vZGUpKSB7XG5cdFx0XHQvLyBnb2luZyB1cCBmcm9tIHRoaXMgbm9kZVxuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQsIGZhbHNlKTtcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCwgZmFsc2UpO1xuXHRcdFx0aWYgKG5vZGUgPT09IG5vZGUucGFyZW50LnJpZ2h0KSB7XG5cdFx0XHRcdGRlbHRhIC09IG5vZGUucGFyZW50LmRlbHRhO1xuXHRcdFx0fVxuXHRcdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFnZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCkpIHtcblx0XHRcdC8vIGZpcnN0IHRpbWUgc2VlaW5nIHRoaXMgbm9kZVxuXHRcdFx0bm9kZU1heEVuZCA9IGRlbHRhICsgbm9kZS5tYXhFbmQ7XG5cdFx0XHRpZiAobm9kZU1heEVuZCA8IHN0YXJ0KSB7XG5cdFx0XHRcdC8vIGNvdmVyIGNhc2UgYikgZnJvbSBhYm92ZVxuXHRcdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIHNlYXJjaCB0aGlzIG5vZGUgb3IgaXRzIGNoaWxkcmVuXG5cdFx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGhhbmRsZSBjdXJyZW50IG5vZGVcblx0XHRub2RlU3RhcnQgPSBkZWx0YSArIG5vZGUuc3RhcnQ7XG5cdFx0aWYgKG5vZGVTdGFydCA+IGVuZCkge1xuXHRcdFx0Ly8gY292ZXIgY2FzZSBhKSBmcm9tIGFib3ZlXG5cdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIHNlYXJjaCB0aGlzIG5vZGUgb3IgaXRzIHJpZ2h0IHN1YnRyZWVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRub2RlRW5kID0gZGVsdGEgKyBub2RlLmVuZDtcblx0XHRpZiAobm9kZUVuZCA+PSBzdGFydCkge1xuXHRcdFx0bm9kZS5zZXRDYWNoZWRPZmZzZXRzKG5vZGVTdGFydCwgbm9kZUVuZCwgMCk7XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbm9kZTtcblx0XHR9XG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblxuXHRcdGlmIChub2RlLnJpZ2h0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0KSkge1xuXHRcdFx0Ly8gZ28gcmlnaHRcblx0XHRcdGRlbHRhICs9IG5vZGUuZGVsdGE7XG5cdFx0XHRub2RlID0gbm9kZS5yaWdodDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0fVxuXG5cdHNldE5vZGVJc1Zpc2l0ZWQoVC5yb290LCBmYWxzZSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gbm9PdmVybGFwUmVwbGFjZShUOiBJbnRlcnZhbFRyZWUsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCB0ZXh0TGVuZ3RoOiBudW1iZXIpOiB2b2lkIHtcblx0Ly8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSW50ZXJ2YWxfdHJlZSNBdWdtZW50ZWRfdHJlZVxuXHQvLyBOb3csIGl0IGlzIGtub3duIHRoYXQgdHdvIGludGVydmFscyBBIGFuZCBCIG92ZXJsYXAgb25seSB3aGVuIGJvdGhcblx0Ly8gQS5sb3cgPD0gQi5oaWdoIGFuZCBBLmhpZ2ggPj0gQi5sb3cuIFdoZW4gc2VhcmNoaW5nIHRoZSB0cmVlcyBmb3Jcblx0Ly8gbm9kZXMgb3ZlcmxhcHBpbmcgd2l0aCBhIGdpdmVuIGludGVydmFsLCB5b3UgY2FuIGltbWVkaWF0ZWx5IHNraXA6XG5cdC8vICBhKSBhbGwgbm9kZXMgdG8gdGhlIHJpZ2h0IG9mIG5vZGVzIHdob3NlIGxvdyB2YWx1ZSBpcyBwYXN0IHRoZSBlbmQgb2YgdGhlIGdpdmVuIGludGVydmFsLlxuXHQvLyAgYikgYWxsIG5vZGVzIHRoYXQgaGF2ZSB0aGVpciBtYXhpbXVtICdoaWdoJyB2YWx1ZSBiZWxvdyB0aGUgc3RhcnQgb2YgdGhlIGdpdmVuIGludGVydmFsLlxuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0bGV0IGRlbHRhID0gMDtcblx0bGV0IG5vZGVNYXhFbmQgPSAwO1xuXHRsZXQgbm9kZVN0YXJ0ID0gMDtcblx0Y29uc3QgZWRpdERlbHRhID0gKHRleHRMZW5ndGggLSAoZW5kIC0gc3RhcnQpKTtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cdFx0aWYgKGdldE5vZGVJc1Zpc2l0ZWQobm9kZSkpIHtcblx0XHRcdC8vIGdvaW5nIHVwIGZyb20gdGhpcyBub2RlXG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCwgZmFsc2UpO1xuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0LCBmYWxzZSk7XG5cdFx0XHRpZiAobm9kZSA9PT0gbm9kZS5wYXJlbnQucmlnaHQpIHtcblx0XHRcdFx0ZGVsdGEgLT0gbm9kZS5wYXJlbnQuZGVsdGE7XG5cdFx0XHR9XG5cdFx0XHRyZWNvbXB1dGVNYXhFbmQobm9kZSk7XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0KSkge1xuXHRcdFx0Ly8gZmlyc3QgdGltZSBzZWVpbmcgdGhpcyBub2RlXG5cdFx0XHRub2RlTWF4RW5kID0gZGVsdGEgKyBub2RlLm1heEVuZDtcblx0XHRcdGlmIChub2RlTWF4RW5kIDwgc3RhcnQpIHtcblx0XHRcdFx0Ly8gY292ZXIgY2FzZSBiKSBmcm9tIGFib3ZlXG5cdFx0XHRcdC8vIHRoZXJlIGlzIG5vIG5lZWQgdG8gc2VhcmNoIHRoaXMgbm9kZSBvciBpdHMgY2hpbGRyZW5cblx0XHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChub2RlLmxlZnQgIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRcdC8vIGdvIGxlZnRcblx0XHRcdFx0bm9kZSA9IG5vZGUubGVmdDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIGN1cnJlbnQgbm9kZVxuXHRcdG5vZGVTdGFydCA9IGRlbHRhICsgbm9kZS5zdGFydDtcblx0XHRpZiAobm9kZVN0YXJ0ID4gZW5kKSB7XG5cdFx0XHRub2RlLnN0YXJ0ICs9IGVkaXREZWx0YTtcblx0XHRcdG5vZGUuZW5kICs9IGVkaXREZWx0YTtcblx0XHRcdG5vZGUuZGVsdGEgKz0gZWRpdERlbHRhO1xuXHRcdFx0aWYgKG5vZGUuZGVsdGEgPCBDb25zdGFudHMuTUlOX1NBRkVfREVMVEEgfHwgbm9kZS5kZWx0YSA+IENvbnN0YW50cy5NQVhfU0FGRV9ERUxUQSkge1xuXHRcdFx0XHRULnJlcXVlc3ROb3JtYWxpemVEZWx0YSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBjb3ZlciBjYXNlIGEpIGZyb20gYWJvdmVcblx0XHRcdC8vIHRoZXJlIGlzIG5vIG5lZWQgdG8gc2VhcmNoIHRoaXMgbm9kZSBvciBpdHMgcmlnaHQgc3VidHJlZVxuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cblx0XHRpZiAobm9kZS5yaWdodCAhPT0gU0VOVElORUwgJiYgIWdldE5vZGVJc1Zpc2l0ZWQobm9kZS5yaWdodCkpIHtcblx0XHRcdC8vIGdvIHJpZ2h0XG5cdFx0XHRkZWx0YSArPSBub2RlLmRlbHRhO1xuXHRcdFx0bm9kZSA9IG5vZGUucmlnaHQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdH1cblxuXHRzZXROb2RlSXNWaXNpdGVkKFQucm9vdCwgZmFsc2UpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlYXJjaGluZ1xuXG5mdW5jdGlvbiBjb2xsZWN0Tm9kZXNGcm9tT3duZXIoVDogSW50ZXJ2YWxUcmVlLCBvd25lcklkOiBudW1iZXIpOiBJbnRlcnZhbE5vZGVbXSB7XG5cdGxldCBub2RlID0gVC5yb290O1xuXHRjb25zdCByZXN1bHQ6IEludGVydmFsTm9kZVtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXHR3aGlsZSAobm9kZSAhPT0gU0VOVElORUwpIHtcblx0XHRpZiAoZ2V0Tm9kZUlzVmlzaXRlZChub2RlKSkge1xuXHRcdFx0Ly8gZ29pbmcgdXAgZnJvbSB0aGlzIG5vZGVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0LCBmYWxzZSk7XG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQsIGZhbHNlKTtcblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLmxlZnQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCkpIHtcblx0XHRcdC8vIGdvIGxlZnRcblx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgY3VycmVudCBub2RlXG5cdFx0aWYgKG5vZGUub3duZXJJZCA9PT0gb3duZXJJZCkge1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5vZGU7XG5cdFx0fVxuXG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblxuXHRcdGlmIChub2RlLnJpZ2h0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0KSkge1xuXHRcdFx0Ly8gZ28gcmlnaHRcblx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHR9XG5cblx0c2V0Tm9kZUlzVmlzaXRlZChULnJvb3QsIGZhbHNlKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0Tm9kZXNQb3N0T3JkZXIoVDogSW50ZXJ2YWxUcmVlKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0Y29uc3QgcmVzdWx0OiBJbnRlcnZhbE5vZGVbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblx0d2hpbGUgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cdFx0aWYgKGdldE5vZGVJc1Zpc2l0ZWQobm9kZSkpIHtcblx0XHRcdC8vIGdvaW5nIHVwIGZyb20gdGhpcyBub2RlXG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCwgZmFsc2UpO1xuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLnJpZ2h0LCBmYWxzZSk7XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCAmJiAhZ2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQpKSB7XG5cdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRub2RlID0gbm9kZS5sZWZ0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUucmlnaHQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQpKSB7XG5cdFx0XHQvLyBnbyByaWdodFxuXHRcdFx0bm9kZSA9IG5vZGUucmlnaHQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgY3VycmVudCBub2RlXG5cdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5vZGU7XG5cdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblx0fVxuXG5cdHNldE5vZGVJc1Zpc2l0ZWQoVC5yb290LCBmYWxzZSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gc2VhcmNoKFQ6IEludGVydmFsVHJlZSwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJbnRlcnZhbE5vZGVbXSB7XG5cdGxldCBub2RlID0gVC5yb290O1xuXHRsZXQgZGVsdGEgPSAwO1xuXHRsZXQgbm9kZVN0YXJ0ID0gMDtcblx0bGV0IG5vZGVFbmQgPSAwO1xuXHRjb25zdCByZXN1bHQ6IEludGVydmFsTm9kZVtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXHR3aGlsZSAobm9kZSAhPT0gU0VOVElORUwpIHtcblx0XHRpZiAoZ2V0Tm9kZUlzVmlzaXRlZChub2RlKSkge1xuXHRcdFx0Ly8gZ29pbmcgdXAgZnJvbSB0aGlzIG5vZGVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0LCBmYWxzZSk7XG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQsIGZhbHNlKTtcblx0XHRcdGlmIChub2RlID09PSBub2RlLnBhcmVudC5yaWdodCkge1xuXHRcdFx0XHRkZWx0YSAtPSBub2RlLnBhcmVudC5kZWx0YTtcblx0XHRcdH1cblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLmxlZnQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUubGVmdCkpIHtcblx0XHRcdC8vIGdvIGxlZnRcblx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgY3VycmVudCBub2RlXG5cdFx0bm9kZVN0YXJ0ID0gZGVsdGEgKyBub2RlLnN0YXJ0O1xuXHRcdG5vZGVFbmQgPSBkZWx0YSArIG5vZGUuZW5kO1xuXG5cdFx0bm9kZS5zZXRDYWNoZWRPZmZzZXRzKG5vZGVTdGFydCwgbm9kZUVuZCwgY2FjaGVkVmVyc2lvbklkKTtcblxuXHRcdGxldCBpbmNsdWRlID0gdHJ1ZTtcblx0XHRpZiAoZmlsdGVyT3duZXJJZCAmJiBub2RlLm93bmVySWQgJiYgbm9kZS5vd25lcklkICE9PSBmaWx0ZXJPd25lcklkKSB7XG5cdFx0XHRpbmNsdWRlID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChmaWx0ZXJPdXRWYWxpZGF0aW9uICYmIGdldE5vZGVJc0ZvclZhbGlkYXRpb24obm9kZSkpIHtcblx0XHRcdGluY2x1ZGUgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGZpbHRlckZvbnREZWNvcmF0aW9ucyAmJiBnZXROb2RlQWZmZWN0c0ZvbnQobm9kZSkpIHtcblx0XHRcdGluY2x1ZGUgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG9ubHlNYXJnaW5EZWNvcmF0aW9ucyAmJiAhZ2V0Tm9kZUlzSW5HbHlwaE1hcmdpbihub2RlKSkge1xuXHRcdFx0aW5jbHVkZSA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpbmNsdWRlKSB7XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbm9kZTtcblx0XHR9XG5cblx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUsIHRydWUpO1xuXG5cdFx0aWYgKG5vZGUucmlnaHQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQpKSB7XG5cdFx0XHQvLyBnbyByaWdodFxuXHRcdFx0ZGVsdGEgKz0gbm9kZS5kZWx0YTtcblx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHR9XG5cblx0c2V0Tm9kZUlzVmlzaXRlZChULnJvb3QsIGZhbHNlKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBpbnRlcnZhbFNlYXJjaChUOiBJbnRlcnZhbFRyZWUsIGludGVydmFsU3RhcnQ6IG51bWJlciwgaW50ZXJ2YWxFbmQ6IG51bWJlciwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJbnRlcnZhbE5vZGVbXSB7XG5cdC8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0ludGVydmFsX3RyZWUjQXVnbWVudGVkX3RyZWVcblx0Ly8gTm93LCBpdCBpcyBrbm93biB0aGF0IHR3byBpbnRlcnZhbHMgQSBhbmQgQiBvdmVybGFwIG9ubHkgd2hlbiBib3RoXG5cdC8vIEEubG93IDw9IEIuaGlnaCBhbmQgQS5oaWdoID49IEIubG93LiBXaGVuIHNlYXJjaGluZyB0aGUgdHJlZXMgZm9yXG5cdC8vIG5vZGVzIG92ZXJsYXBwaW5nIHdpdGggYSBnaXZlbiBpbnRlcnZhbCwgeW91IGNhbiBpbW1lZGlhdGVseSBza2lwOlxuXHQvLyAgYSkgYWxsIG5vZGVzIHRvIHRoZSByaWdodCBvZiBub2RlcyB3aG9zZSBsb3cgdmFsdWUgaXMgcGFzdCB0aGUgZW5kIG9mIHRoZSBnaXZlbiBpbnRlcnZhbC5cblx0Ly8gIGIpIGFsbCBub2RlcyB0aGF0IGhhdmUgdGhlaXIgbWF4aW11bSAnaGlnaCcgdmFsdWUgYmVsb3cgdGhlIHN0YXJ0IG9mIHRoZSBnaXZlbiBpbnRlcnZhbC5cblxuXHRsZXQgbm9kZSA9IFQucm9vdDtcblx0bGV0IGRlbHRhID0gMDtcblx0bGV0IG5vZGVNYXhFbmQgPSAwO1xuXHRsZXQgbm9kZVN0YXJ0ID0gMDtcblx0bGV0IG5vZGVFbmQgPSAwO1xuXHRjb25zdCByZXN1bHQ6IEludGVydmFsTm9kZVtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXHR3aGlsZSAobm9kZSAhPT0gU0VOVElORUwpIHtcblx0XHRpZiAoZ2V0Tm9kZUlzVmlzaXRlZChub2RlKSkge1xuXHRcdFx0Ly8gZ29pbmcgdXAgZnJvbSB0aGlzIG5vZGVcblx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZS5sZWZ0LCBmYWxzZSk7XG5cdFx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQsIGZhbHNlKTtcblx0XHRcdGlmIChub2RlID09PSBub2RlLnBhcmVudC5yaWdodCkge1xuXHRcdFx0XHRkZWx0YSAtPSBub2RlLnBhcmVudC5kZWx0YTtcblx0XHRcdH1cblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmICghZ2V0Tm9kZUlzVmlzaXRlZChub2RlLmxlZnQpKSB7XG5cdFx0XHQvLyBmaXJzdCB0aW1lIHNlZWluZyB0aGlzIG5vZGVcblx0XHRcdG5vZGVNYXhFbmQgPSBkZWx0YSArIG5vZGUubWF4RW5kO1xuXHRcdFx0aWYgKG5vZGVNYXhFbmQgPCBpbnRlcnZhbFN0YXJ0KSB7XG5cdFx0XHRcdC8vIGNvdmVyIGNhc2UgYikgZnJvbSBhYm92ZVxuXHRcdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIHNlYXJjaCB0aGlzIG5vZGUgb3IgaXRzIGNoaWxkcmVuXG5cdFx0XHRcdHNldE5vZGVJc1Zpc2l0ZWQobm9kZSwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobm9kZS5sZWZ0ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0XHQvLyBnbyBsZWZ0XG5cdFx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGhhbmRsZSBjdXJyZW50IG5vZGVcblx0XHRub2RlU3RhcnQgPSBkZWx0YSArIG5vZGUuc3RhcnQ7XG5cdFx0aWYgKG5vZGVTdGFydCA+IGludGVydmFsRW5kKSB7XG5cdFx0XHQvLyBjb3ZlciBjYXNlIGEpIGZyb20gYWJvdmVcblx0XHRcdC8vIHRoZXJlIGlzIG5vIG5lZWQgdG8gc2VhcmNoIHRoaXMgbm9kZSBvciBpdHMgcmlnaHQgc3VidHJlZVxuXHRcdFx0c2V0Tm9kZUlzVmlzaXRlZChub2RlLCB0cnVlKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdG5vZGVFbmQgPSBkZWx0YSArIG5vZGUuZW5kO1xuXG5cdFx0aWYgKG5vZGVFbmQgPj0gaW50ZXJ2YWxTdGFydCkge1xuXHRcdFx0Ly8gVGhlcmUgaXMgb3ZlcmxhcFxuXHRcdFx0bm9kZS5zZXRDYWNoZWRPZmZzZXRzKG5vZGVTdGFydCwgbm9kZUVuZCwgY2FjaGVkVmVyc2lvbklkKTtcblxuXHRcdFx0bGV0IGluY2x1ZGUgPSB0cnVlO1xuXHRcdFx0aWYgKGZpbHRlck93bmVySWQgJiYgbm9kZS5vd25lcklkICYmIG5vZGUub3duZXJJZCAhPT0gZmlsdGVyT3duZXJJZCkge1xuXHRcdFx0XHRpbmNsdWRlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlsdGVyT3V0VmFsaWRhdGlvbiAmJiBnZXROb2RlSXNGb3JWYWxpZGF0aW9uKG5vZGUpKSB7XG5cdFx0XHRcdGluY2x1ZGUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChmaWx0ZXJGb250RGVjb3JhdGlvbnMgJiYgZ2V0Tm9kZUFmZmVjdHNGb250KG5vZGUpKSB7XG5cdFx0XHRcdGluY2x1ZGUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChvbmx5TWFyZ2luRGVjb3JhdGlvbnMgJiYgIWdldE5vZGVJc0luR2x5cGhNYXJnaW4obm9kZSkpIHtcblx0XHRcdFx0aW5jbHVkZSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5jbHVkZSkge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbm9kZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXROb2RlSXNWaXNpdGVkKG5vZGUsIHRydWUpO1xuXG5cdFx0aWYgKG5vZGUucmlnaHQgIT09IFNFTlRJTkVMICYmICFnZXROb2RlSXNWaXNpdGVkKG5vZGUucmlnaHQpKSB7XG5cdFx0XHQvLyBnbyByaWdodFxuXHRcdFx0ZGVsdGEgKz0gbm9kZS5kZWx0YTtcblx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHR9XG5cblx0c2V0Tm9kZUlzVmlzaXRlZChULnJvb3QsIGZhbHNlKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEluc2VydGlvblxuZnVuY3Rpb24gcmJUcmVlSW5zZXJ0KFQ6IEludGVydmFsVHJlZSwgbmV3Tm9kZTogSW50ZXJ2YWxOb2RlKTogSW50ZXJ2YWxOb2RlIHtcblx0aWYgKFQucm9vdCA9PT0gU0VOVElORUwpIHtcblx0XHRuZXdOb2RlLnBhcmVudCA9IFNFTlRJTkVMO1xuXHRcdG5ld05vZGUubGVmdCA9IFNFTlRJTkVMO1xuXHRcdG5ld05vZGUucmlnaHQgPSBTRU5USU5FTDtcblx0XHRzZXROb2RlQ29sb3IobmV3Tm9kZSwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRULnJvb3QgPSBuZXdOb2RlO1xuXHRcdHJldHVybiBULnJvb3Q7XG5cdH1cblxuXHR0cmVlSW5zZXJ0KFQsIG5ld05vZGUpO1xuXG5cdHJlY29tcHV0ZU1heEVuZFdhbGtUb1Jvb3QobmV3Tm9kZS5wYXJlbnQpO1xuXG5cdC8vIHJlcGFpciB0cmVlXG5cdGxldCB4ID0gbmV3Tm9kZTtcblx0d2hpbGUgKHggIT09IFQucm9vdCAmJiBnZXROb2RlQ29sb3IoeC5wYXJlbnQpID09PSBOb2RlQ29sb3IuUmVkKSB7XG5cdFx0aWYgKHgucGFyZW50ID09PSB4LnBhcmVudC5wYXJlbnQubGVmdCkge1xuXHRcdFx0Y29uc3QgeSA9IHgucGFyZW50LnBhcmVudC5yaWdodDtcblxuXHRcdFx0aWYgKGdldE5vZGVDb2xvcih5KSA9PT0gTm9kZUNvbG9yLlJlZCkge1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih5LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQucGFyZW50LCBOb2RlQ29sb3IuUmVkKTtcblx0XHRcdFx0eCA9IHgucGFyZW50LnBhcmVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh4ID09PSB4LnBhcmVudC5yaWdodCkge1xuXHRcdFx0XHRcdHggPSB4LnBhcmVudDtcblx0XHRcdFx0XHRsZWZ0Um90YXRlKFQsIHgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldE5vZGVDb2xvcih4LnBhcmVudCwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LnBhcmVudCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdHJpZ2h0Um90YXRlKFQsIHgucGFyZW50LnBhcmVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHkgPSB4LnBhcmVudC5wYXJlbnQubGVmdDtcblxuXHRcdFx0aWYgKGdldE5vZGVDb2xvcih5KSA9PT0gTm9kZUNvbG9yLlJlZCkge1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih5LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQucGFyZW50LCBOb2RlQ29sb3IuUmVkKTtcblx0XHRcdFx0eCA9IHgucGFyZW50LnBhcmVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh4ID09PSB4LnBhcmVudC5sZWZ0KSB7XG5cdFx0XHRcdFx0eCA9IHgucGFyZW50O1xuXHRcdFx0XHRcdHJpZ2h0Um90YXRlKFQsIHgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldE5vZGVDb2xvcih4LnBhcmVudCwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LnBhcmVudCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdGxlZnRSb3RhdGUoVCwgeC5wYXJlbnQucGFyZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXROb2RlQ29sb3IoVC5yb290LCBOb2RlQ29sb3IuQmxhY2spO1xuXG5cdHJldHVybiBuZXdOb2RlO1xufVxuXG5mdW5jdGlvbiB0cmVlSW5zZXJ0KFQ6IEludGVydmFsVHJlZSwgejogSW50ZXJ2YWxOb2RlKTogdm9pZCB7XG5cdGxldCBkZWx0YTogbnVtYmVyID0gMDtcblx0bGV0IHggPSBULnJvb3Q7XG5cdGNvbnN0IHpBYnNvbHV0ZVN0YXJ0ID0gei5zdGFydDtcblx0Y29uc3QgekFic29sdXRlRW5kID0gei5lbmQ7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgY21wID0gaW50ZXJ2YWxDb21wYXJlKHpBYnNvbHV0ZVN0YXJ0LCB6QWJzb2x1dGVFbmQsIHguc3RhcnQgKyBkZWx0YSwgeC5lbmQgKyBkZWx0YSk7XG5cdFx0aWYgKGNtcCA8IDApIHtcblx0XHRcdC8vIHRoaXMgbm9kZSBzaG91bGQgYmUgaW5zZXJ0ZWQgdG8gdGhlIGxlZnRcblx0XHRcdC8vID0+IGl0IGlzIG5vdCBhZmZlY3RlZCBieSB0aGUgbm9kZSdzIGRlbHRhXG5cdFx0XHRpZiAoeC5sZWZ0ID09PSBTRU5USU5FTCkge1xuXHRcdFx0XHR6LnN0YXJ0IC09IGRlbHRhO1xuXHRcdFx0XHR6LmVuZCAtPSBkZWx0YTtcblx0XHRcdFx0ei5tYXhFbmQgLT0gZGVsdGE7XG5cdFx0XHRcdHgubGVmdCA9IHo7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0eCA9IHgubGVmdDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdGhpcyBub2RlIHNob3VsZCBiZSBpbnNlcnRlZCB0byB0aGUgcmlnaHRcblx0XHRcdC8vID0+IGl0IGlzIG5vdCBhZmZlY3RlZCBieSB0aGUgbm9kZSdzIGRlbHRhXG5cdFx0XHRpZiAoeC5yaWdodCA9PT0gU0VOVElORUwpIHtcblx0XHRcdFx0ei5zdGFydCAtPSAoZGVsdGEgKyB4LmRlbHRhKTtcblx0XHRcdFx0ei5lbmQgLT0gKGRlbHRhICsgeC5kZWx0YSk7XG5cdFx0XHRcdHoubWF4RW5kIC09IChkZWx0YSArIHguZGVsdGEpO1xuXHRcdFx0XHR4LnJpZ2h0ID0gejtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZWx0YSArPSB4LmRlbHRhO1xuXHRcdFx0XHR4ID0geC5yaWdodDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR6LnBhcmVudCA9IHg7XG5cdHoubGVmdCA9IFNFTlRJTkVMO1xuXHR6LnJpZ2h0ID0gU0VOVElORUw7XG5cdHNldE5vZGVDb2xvcih6LCBOb2RlQ29sb3IuUmVkKTtcbn1cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRGVsZXRpb25cbmZ1bmN0aW9uIHJiVHJlZURlbGV0ZShUOiBJbnRlcnZhbFRyZWUsIHo6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXG5cdGxldCB4OiBJbnRlcnZhbE5vZGU7XG5cdGxldCB5OiBJbnRlcnZhbE5vZGU7XG5cblx0Ly8gUkItREVMRVRFIGV4Y2VwdCB3ZSBkb24ndCBzd2FwIHogYW5kIHkgaW4gY2FzZSBjKVxuXHQvLyBpLmUuIHdlIGFsd2F5cyBkZWxldGUgd2hhdCdzIHBvaW50ZWQgYXQgYnkgei5cblxuXHRpZiAoei5sZWZ0ID09PSBTRU5USU5FTCkge1xuXHRcdHggPSB6LnJpZ2h0O1xuXHRcdHkgPSB6O1xuXG5cdFx0Ly8geCdzIGRlbHRhIGlzIG5vIGxvbmdlciBpbmZsdWVuY2VkIGJ5IHoncyBkZWx0YVxuXHRcdHguZGVsdGEgKz0gei5kZWx0YTtcblx0XHRpZiAoeC5kZWx0YSA8IENvbnN0YW50cy5NSU5fU0FGRV9ERUxUQSB8fCB4LmRlbHRhID4gQ29uc3RhbnRzLk1BWF9TQUZFX0RFTFRBKSB7XG5cdFx0XHRULnJlcXVlc3ROb3JtYWxpemVEZWx0YSA9IHRydWU7XG5cdFx0fVxuXHRcdHguc3RhcnQgKz0gei5kZWx0YTtcblx0XHR4LmVuZCArPSB6LmRlbHRhO1xuXG5cdH0gZWxzZSBpZiAoei5yaWdodCA9PT0gU0VOVElORUwpIHtcblx0XHR4ID0gei5sZWZ0O1xuXHRcdHkgPSB6O1xuXG5cdH0gZWxzZSB7XG5cdFx0eSA9IGxlZnRlc3Qoei5yaWdodCk7XG5cdFx0eCA9IHkucmlnaHQ7XG5cblx0XHQvLyB5J3MgZGVsdGEgaXMgbm8gbG9uZ2VyIGluZmx1ZW5jZWQgYnkgeidzIGRlbHRhLFxuXHRcdC8vIGJ1dCB3ZSBkb24ndCB3YW50IHRvIHdhbGsgdGhlIGVudGlyZSByaWdodC1oYW5kLXNpZGUgc3VidHJlZSBvZiB4LlxuXHRcdC8vIHdlIHRoZXJlZm9yZSBtYWludGFpbiB6J3MgZGVsdGEgaW4geSwgYW5kIGFkanVzdCBvbmx5IHhcblx0XHR4LnN0YXJ0ICs9IHkuZGVsdGE7XG5cdFx0eC5lbmQgKz0geS5kZWx0YTtcblx0XHR4LmRlbHRhICs9IHkuZGVsdGE7XG5cdFx0aWYgKHguZGVsdGEgPCBDb25zdGFudHMuTUlOX1NBRkVfREVMVEEgfHwgeC5kZWx0YSA+IENvbnN0YW50cy5NQVhfU0FGRV9ERUxUQSkge1xuXHRcdFx0VC5yZXF1ZXN0Tm9ybWFsaXplRGVsdGEgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHkuc3RhcnQgKz0gei5kZWx0YTtcblx0XHR5LmVuZCArPSB6LmRlbHRhO1xuXHRcdHkuZGVsdGEgPSB6LmRlbHRhO1xuXHRcdGlmICh5LmRlbHRhIDwgQ29uc3RhbnRzLk1JTl9TQUZFX0RFTFRBIHx8IHkuZGVsdGEgPiBDb25zdGFudHMuTUFYX1NBRkVfREVMVEEpIHtcblx0XHRcdFQucmVxdWVzdE5vcm1hbGl6ZURlbHRhID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRpZiAoeSA9PT0gVC5yb290KSB7XG5cdFx0VC5yb290ID0geDtcblx0XHRzZXROb2RlQ29sb3IoeCwgTm9kZUNvbG9yLkJsYWNrKTtcblxuXHRcdHouZGV0YWNoKCk7XG5cdFx0cmVzZXRTZW50aW5lbCgpO1xuXHRcdHJlY29tcHV0ZU1heEVuZCh4KTtcblx0XHRULnJvb3QucGFyZW50ID0gU0VOVElORUw7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgeVdhc1JlZCA9IChnZXROb2RlQ29sb3IoeSkgPT09IE5vZGVDb2xvci5SZWQpO1xuXG5cdGlmICh5ID09PSB5LnBhcmVudC5sZWZ0KSB7XG5cdFx0eS5wYXJlbnQubGVmdCA9IHg7XG5cdH0gZWxzZSB7XG5cdFx0eS5wYXJlbnQucmlnaHQgPSB4O1xuXHR9XG5cblx0aWYgKHkgPT09IHopIHtcblx0XHR4LnBhcmVudCA9IHkucGFyZW50O1xuXHR9IGVsc2Uge1xuXG5cdFx0aWYgKHkucGFyZW50ID09PSB6KSB7XG5cdFx0XHR4LnBhcmVudCA9IHk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHgucGFyZW50ID0geS5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0eS5sZWZ0ID0gei5sZWZ0O1xuXHRcdHkucmlnaHQgPSB6LnJpZ2h0O1xuXHRcdHkucGFyZW50ID0gei5wYXJlbnQ7XG5cdFx0c2V0Tm9kZUNvbG9yKHksIGdldE5vZGVDb2xvcih6KSk7XG5cblx0XHRpZiAoeiA9PT0gVC5yb290KSB7XG5cdFx0XHRULnJvb3QgPSB5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoeiA9PT0gei5wYXJlbnQubGVmdCkge1xuXHRcdFx0XHR6LnBhcmVudC5sZWZ0ID0geTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHoucGFyZW50LnJpZ2h0ID0geTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoeS5sZWZ0ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0eS5sZWZ0LnBhcmVudCA9IHk7XG5cdFx0fVxuXHRcdGlmICh5LnJpZ2h0ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0eS5yaWdodC5wYXJlbnQgPSB5O1xuXHRcdH1cblx0fVxuXG5cdHouZGV0YWNoKCk7XG5cblx0aWYgKHlXYXNSZWQpIHtcblx0XHRyZWNvbXB1dGVNYXhFbmRXYWxrVG9Sb290KHgucGFyZW50KTtcblx0XHRpZiAoeSAhPT0geikge1xuXHRcdFx0cmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdCh5KTtcblx0XHRcdHJlY29tcHV0ZU1heEVuZFdhbGtUb1Jvb3QoeS5wYXJlbnQpO1xuXHRcdH1cblx0XHRyZXNldFNlbnRpbmVsKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdCh4KTtcblx0cmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdCh4LnBhcmVudCk7XG5cdGlmICh5ICE9PSB6KSB7XG5cdFx0cmVjb21wdXRlTWF4RW5kV2Fsa1RvUm9vdCh5KTtcblx0XHRyZWNvbXB1dGVNYXhFbmRXYWxrVG9Sb290KHkucGFyZW50KTtcblx0fVxuXG5cdC8vIFJCLURFTEVURS1GSVhVUFxuXHRsZXQgdzogSW50ZXJ2YWxOb2RlO1xuXHR3aGlsZSAoeCAhPT0gVC5yb290ICYmIGdldE5vZGVDb2xvcih4KSA9PT0gTm9kZUNvbG9yLkJsYWNrKSB7XG5cblx0XHRpZiAoeCA9PT0geC5wYXJlbnQubGVmdCkge1xuXHRcdFx0dyA9IHgucGFyZW50LnJpZ2h0O1xuXG5cdFx0XHRpZiAoZ2V0Tm9kZUNvbG9yKHcpID09PSBOb2RlQ29sb3IuUmVkKSB7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih3LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5SZWQpO1xuXHRcdFx0XHRsZWZ0Um90YXRlKFQsIHgucGFyZW50KTtcblx0XHRcdFx0dyA9IHgucGFyZW50LnJpZ2h0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZ2V0Tm9kZUNvbG9yKHcubGVmdCkgPT09IE5vZGVDb2xvci5CbGFjayAmJiBnZXROb2RlQ29sb3Iody5yaWdodCkgPT09IE5vZGVDb2xvci5CbGFjaykge1xuXHRcdFx0XHRzZXROb2RlQ29sb3IodywgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdHggPSB4LnBhcmVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChnZXROb2RlQ29sb3Iody5yaWdodCkgPT09IE5vZGVDb2xvci5CbGFjaykge1xuXHRcdFx0XHRcdHNldE5vZGVDb2xvcih3LmxlZnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdFx0c2V0Tm9kZUNvbG9yKHcsIE5vZGVDb2xvci5SZWQpO1xuXHRcdFx0XHRcdHJpZ2h0Um90YXRlKFQsIHcpO1xuXHRcdFx0XHRcdHcgPSB4LnBhcmVudC5yaWdodDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNldE5vZGVDb2xvcih3LCBnZXROb2RlQ29sb3IoeC5wYXJlbnQpKTtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHgucGFyZW50LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRzZXROb2RlQ29sb3Iody5yaWdodCwgTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRcdFx0bGVmdFJvdGF0ZShULCB4LnBhcmVudCk7XG5cdFx0XHRcdHggPSBULnJvb3Q7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0dyA9IHgucGFyZW50LmxlZnQ7XG5cblx0XHRcdGlmIChnZXROb2RlQ29sb3IodykgPT09IE5vZGVDb2xvci5SZWQpIHtcblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHcsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih4LnBhcmVudCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0XHRcdHJpZ2h0Um90YXRlKFQsIHgucGFyZW50KTtcblx0XHRcdFx0dyA9IHgucGFyZW50LmxlZnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChnZXROb2RlQ29sb3Iody5sZWZ0KSA9PT0gTm9kZUNvbG9yLkJsYWNrICYmIGdldE5vZGVDb2xvcih3LnJpZ2h0KSA9PT0gTm9kZUNvbG9yLkJsYWNrKSB7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih3LCBOb2RlQ29sb3IuUmVkKTtcblx0XHRcdFx0eCA9IHgucGFyZW50O1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZ2V0Tm9kZUNvbG9yKHcubGVmdCkgPT09IE5vZGVDb2xvci5CbGFjaykge1xuXHRcdFx0XHRcdHNldE5vZGVDb2xvcih3LnJpZ2h0LCBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdFx0XHRcdHNldE5vZGVDb2xvcih3LCBOb2RlQ29sb3IuUmVkKTtcblx0XHRcdFx0XHRsZWZ0Um90YXRlKFQsIHcpO1xuXHRcdFx0XHRcdHcgPSB4LnBhcmVudC5sZWZ0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2V0Tm9kZUNvbG9yKHcsIGdldE5vZGVDb2xvcih4LnBhcmVudCkpO1xuXHRcdFx0XHRzZXROb2RlQ29sb3IoeC5wYXJlbnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHNldE5vZGVDb2xvcih3LmxlZnQsIE5vZGVDb2xvci5CbGFjayk7XG5cdFx0XHRcdHJpZ2h0Um90YXRlKFQsIHgucGFyZW50KTtcblx0XHRcdFx0eCA9IFQucm9vdDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXROb2RlQ29sb3IoeCwgTm9kZUNvbG9yLkJsYWNrKTtcblx0cmVzZXRTZW50aW5lbCgpO1xufVxuXG5mdW5jdGlvbiBsZWZ0ZXN0KG5vZGU6IEludGVydmFsTm9kZSk6IEludGVydmFsTm9kZSB7XG5cdHdoaWxlIChub2RlLmxlZnQgIT09IFNFTlRJTkVMKSB7XG5cdFx0bm9kZSA9IG5vZGUubGVmdDtcblx0fVxuXHRyZXR1cm4gbm9kZTtcbn1cblxuZnVuY3Rpb24gcmVzZXRTZW50aW5lbCgpOiB2b2lkIHtcblx0U0VOVElORUwucGFyZW50ID0gU0VOVElORUw7XG5cdFNFTlRJTkVMLmRlbHRhID0gMDsgLy8gb3B0aW9uYWxcblx0U0VOVElORUwuc3RhcnQgPSAwOyAvLyBvcHRpb25hbFxuXHRTRU5USU5FTC5lbmQgPSAwOyAvLyBvcHRpb25hbFxufVxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBSb3RhdGlvbnNcbmZ1bmN0aW9uIGxlZnRSb3RhdGUoVDogSW50ZXJ2YWxUcmVlLCB4OiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0Y29uc3QgeSA9IHgucmlnaHQ7XHRcdFx0XHQvLyBzZXQgeS5cblxuXHR5LmRlbHRhICs9IHguZGVsdGE7XHRcdFx0XHQvLyB5J3MgZGVsdGEgaXMgbm8gbG9uZ2VyIGluZmx1ZW5jZWQgYnkgeCdzIGRlbHRhXG5cdGlmICh5LmRlbHRhIDwgQ29uc3RhbnRzLk1JTl9TQUZFX0RFTFRBIHx8IHkuZGVsdGEgPiBDb25zdGFudHMuTUFYX1NBRkVfREVMVEEpIHtcblx0XHRULnJlcXVlc3ROb3JtYWxpemVEZWx0YSA9IHRydWU7XG5cdH1cblx0eS5zdGFydCArPSB4LmRlbHRhO1xuXHR5LmVuZCArPSB4LmRlbHRhO1xuXG5cdHgucmlnaHQgPSB5LmxlZnQ7XHRcdFx0XHQvLyB0dXJuIHkncyBsZWZ0IHN1YnRyZWUgaW50byB4J3MgcmlnaHQgc3VidHJlZS5cblx0aWYgKHkubGVmdCAhPT0gU0VOVElORUwpIHtcblx0XHR5LmxlZnQucGFyZW50ID0geDtcblx0fVxuXHR5LnBhcmVudCA9IHgucGFyZW50O1x0XHRcdC8vIGxpbmsgeCdzIHBhcmVudCB0byB5LlxuXHRpZiAoeC5wYXJlbnQgPT09IFNFTlRJTkVMKSB7XG5cdFx0VC5yb290ID0geTtcblx0fSBlbHNlIGlmICh4ID09PSB4LnBhcmVudC5sZWZ0KSB7XG5cdFx0eC5wYXJlbnQubGVmdCA9IHk7XG5cdH0gZWxzZSB7XG5cdFx0eC5wYXJlbnQucmlnaHQgPSB5O1xuXHR9XG5cblx0eS5sZWZ0ID0geDtcdFx0XHRcdFx0XHQvLyBwdXQgeCBvbiB5J3MgbGVmdC5cblx0eC5wYXJlbnQgPSB5O1xuXG5cdHJlY29tcHV0ZU1heEVuZCh4KTtcblx0cmVjb21wdXRlTWF4RW5kKHkpO1xufVxuXG5mdW5jdGlvbiByaWdodFJvdGF0ZShUOiBJbnRlcnZhbFRyZWUsIHk6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHRjb25zdCB4ID0geS5sZWZ0O1xuXG5cdHkuZGVsdGEgLT0geC5kZWx0YTtcblx0aWYgKHkuZGVsdGEgPCBDb25zdGFudHMuTUlOX1NBRkVfREVMVEEgfHwgeS5kZWx0YSA+IENvbnN0YW50cy5NQVhfU0FGRV9ERUxUQSkge1xuXHRcdFQucmVxdWVzdE5vcm1hbGl6ZURlbHRhID0gdHJ1ZTtcblx0fVxuXHR5LnN0YXJ0IC09IHguZGVsdGE7XG5cdHkuZW5kIC09IHguZGVsdGE7XG5cblx0eS5sZWZ0ID0geC5yaWdodDtcblx0aWYgKHgucmlnaHQgIT09IFNFTlRJTkVMKSB7XG5cdFx0eC5yaWdodC5wYXJlbnQgPSB5O1xuXHR9XG5cdHgucGFyZW50ID0geS5wYXJlbnQ7XG5cdGlmICh5LnBhcmVudCA9PT0gU0VOVElORUwpIHtcblx0XHRULnJvb3QgPSB4O1xuXHR9IGVsc2UgaWYgKHkgPT09IHkucGFyZW50LnJpZ2h0KSB7XG5cdFx0eS5wYXJlbnQucmlnaHQgPSB4O1xuXHR9IGVsc2Uge1xuXHRcdHkucGFyZW50LmxlZnQgPSB4O1xuXHR9XG5cblx0eC5yaWdodCA9IHk7XG5cdHkucGFyZW50ID0geDtcblxuXHRyZWNvbXB1dGVNYXhFbmQoeSk7XG5cdHJlY29tcHV0ZU1heEVuZCh4KTtcbn1cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gbWF4IGVuZCBjb21wdXRhdGlvblxuXG5mdW5jdGlvbiBjb21wdXRlTWF4RW5kKG5vZGU6IEludGVydmFsTm9kZSk6IG51bWJlciB7XG5cdGxldCBtYXhFbmQgPSBub2RlLmVuZDtcblx0aWYgKG5vZGUubGVmdCAhPT0gU0VOVElORUwpIHtcblx0XHRjb25zdCBsZWZ0TWF4RW5kID0gbm9kZS5sZWZ0Lm1heEVuZDtcblx0XHRpZiAobGVmdE1heEVuZCA+IG1heEVuZCkge1xuXHRcdFx0bWF4RW5kID0gbGVmdE1heEVuZDtcblx0XHR9XG5cdH1cblx0aWYgKG5vZGUucmlnaHQgIT09IFNFTlRJTkVMKSB7XG5cdFx0Y29uc3QgcmlnaHRNYXhFbmQgPSBub2RlLnJpZ2h0Lm1heEVuZCArIG5vZGUuZGVsdGE7XG5cdFx0aWYgKHJpZ2h0TWF4RW5kID4gbWF4RW5kKSB7XG5cdFx0XHRtYXhFbmQgPSByaWdodE1heEVuZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG1heEVuZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY29tcHV0ZU1heEVuZChub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0bm9kZS5tYXhFbmQgPSBjb21wdXRlTWF4RW5kKG5vZGUpO1xufVxuXG5mdW5jdGlvbiByZWNvbXB1dGVNYXhFbmRXYWxrVG9Sb290KG5vZGU6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHR3aGlsZSAobm9kZSAhPT0gU0VOVElORUwpIHtcblxuXHRcdGNvbnN0IG1heEVuZCA9IGNvbXB1dGVNYXhFbmQobm9kZSk7XG5cblx0XHRpZiAobm9kZS5tYXhFbmQgPT09IG1heEVuZCkge1xuXHRcdFx0Ly8gbm8gbmVlZCB0byBnbyBmdXJ0aGVyXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bm9kZS5tYXhFbmQgPSBtYXhFbmQ7XG5cdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gdXRpbHNcbmV4cG9ydCBmdW5jdGlvbiBpbnRlcnZhbENvbXBhcmUoYVN0YXJ0OiBudW1iZXIsIGFFbmQ6IG51bWJlciwgYlN0YXJ0OiBudW1iZXIsIGJFbmQ6IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChhU3RhcnQgPT09IGJTdGFydCkge1xuXHRcdHJldHVybiBhRW5kIC0gYkVuZDtcblx0fVxuXHRyZXR1cm4gYVN0YXJ0IC0gYlN0YXJ0O1xufVxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLDhCQUFzRjtBQU94RixJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDTixFQUFBQSxXQUFBLDBCQUF1QjtBQUN2QixFQUFBQSxXQUFBLDBCQUF1QjtBQUN2QixFQUFBQSxXQUFBLDZCQUEwQjtBQUMxQixFQUFBQSxXQUFBLDJCQUF3QjtBQUN4QixFQUFBQSxXQUFBLGlDQUE4QjtBQUM5QixFQUFBQSxXQUFBLHVDQUFvQztBQUNwQyxFQUFBQSxXQUFBLHNDQUFtQztBQVBsQixTQUFBQTtBQUFBLEdBQUE7QUFVWCxJQUFXLFlBQVgsa0JBQVdDLGVBQVg7QUFDTixFQUFBQSxzQkFBQSxXQUFRLEtBQVI7QUFDQSxFQUFBQSxzQkFBQSxTQUFNLEtBQU47QUFGaUIsU0FBQUE7QUFBQSxHQUFBO0FB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U0FBUyxLQUFLO0FBQzdDLFFBQUksY0FBYyxRQUFRO0FBQ3pCLGVBQVM7QUFBQSxJQUNWO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsZ0JBQWdCLE1BQTBCO0FBQ3pELE9BQUssU0FBUyxjQUFjLElBQUk7QUFDakM7QUFFQSxTQUFTLDBCQUEwQixNQUEwQjtBQUM1RCxTQUFPLFNBQVMsVUFBVTtBQUV6QixVQUFNLFNBQVMsY0FBYyxJQUFJO0FBRWpDLFFBQUksS0FBSyxXQUFXLFFBQVE7QUFFM0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxTQUFTO0FBQ2QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBS08sU0FBUyxnQkFBZ0IsUUFBZ0IsTUFBYyxRQUFnQixNQUFzQjtBQUNuRyxNQUFJLFdBQVcsUUFBUTtBQUN0QixXQUFPLE9BQU87QUFBQSxFQUNmO0FBQ0EsU0FBTyxTQUFTO0FBQ2pCOyIsCiAgIm5hbWVzIjogWyJDbGFzc05hbWUiLCAiTm9kZUNvbG9yIiwgIkNvbnN0YW50cyIsICJNYXJrZXJNb3ZlU2VtYW50aWNzIl0KfQo=
