import { TreeError, TreeVisibility } from "./tree.js";
import { splice, tail } from "../../../common/arrays.js";
import { Delayer } from "../../../common/async.js";
import { MicrotaskDelay } from "../../../common/symbols.js";
import { LcsDiff } from "../../../common/diff/diff.js";
import { Emitter, EventBufferer } from "../../../common/event.js";
import { Iterable } from "../../../common/iterator.js";
function isFilterResult(obj) {
  return !!obj && obj.visibility !== void 0;
}
function getVisibleState(visibility) {
  switch (visibility) {
    case true:
      return TreeVisibility.Visible;
    case false:
      return TreeVisibility.Hidden;
    default:
      return visibility;
  }
}
function isCollapsibleStateUpdate(update) {
  return "collapsible" in update;
}
class IndexTreeModel {
  constructor(user, rootElement, options = {}) {
    this.user = user;
    this.rootRef = [];
    this.eventBufferer = new EventBufferer();
    this._onDidSpliceModel = new Emitter();
    this.onDidSpliceModel = this._onDidSpliceModel.event;
    this._onDidSpliceRenderedNodes = new Emitter();
    this.onDidSpliceRenderedNodes = this._onDidSpliceRenderedNodes.event;
    this._onDidChangeCollapseState = new Emitter();
    this.onDidChangeCollapseState = this.eventBufferer.wrapEvent(this._onDidChangeCollapseState.event);
    this._onDidChangeRenderNodeCount = new Emitter();
    this.onDidChangeRenderNodeCount = this.eventBufferer.wrapEvent(this._onDidChangeRenderNodeCount.event);
    this.refilterDelayer = new Delayer(MicrotaskDelay);
    this.collapseByDefault = typeof options.collapseByDefault === "undefined" ? false : options.collapseByDefault;
    this.allowNonCollapsibleParents = options.allowNonCollapsibleParents ?? false;
    this.filter = options.filter;
    this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === "undefined" ? false : options.autoExpandSingleChildren;
    this.root = {
      parent: void 0,
      element: rootElement,
      children: [],
      depth: 0,
      visibleChildrenCount: 0,
      visibleChildIndex: -1,
      collapsible: false,
      collapsed: false,
      renderNodeCount: 0,
      visibility: TreeVisibility.Visible,
      visible: true,
      filterData: void 0
    };
  }
  splice(location, deleteCount, toInsert = Iterable.empty(), options = {}) {
    if (location.length === 0) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    if (options.diffIdentityProvider) {
      this.spliceSmart(options.diffIdentityProvider, location, deleteCount, toInsert, options);
    } else {
      this.spliceSimple(location, deleteCount, toInsert, options);
    }
  }
  spliceSmart(identity, location, deleteCount, toInsertIterable = Iterable.empty(), options, recurseLevels = options.diffDepth ?? 0) {
    const { parentNode } = this.getParentNodeWithListIndex(location);
    if (!parentNode.lastDiffIds) {
      return this.spliceSimple(location, deleteCount, toInsertIterable, options);
    }
    const toInsert = [...toInsertIterable];
    const index = location[location.length - 1];
    const diff = new LcsDiff(
      { getElements: () => parentNode.lastDiffIds },
      {
        getElements: () => [
          ...parentNode.children.slice(0, index),
          ...toInsert,
          ...parentNode.children.slice(index + deleteCount)
        ].map((e) => identity.getId(e.element).toString())
      }
    ).ComputeDiff(false);
    if (diff.quitEarly) {
      parentNode.lastDiffIds = void 0;
      return this.spliceSimple(location, deleteCount, toInsert, options);
    }
    const locationPrefix = location.slice(0, -1);
    const recurseSplice = (fromOriginal, fromModified, count) => {
      if (recurseLevels > 0) {
        for (let i = 0; i < count; i++) {
          fromOriginal--;
          fromModified--;
          this.spliceSmart(
            identity,
            [...locationPrefix, fromOriginal, 0],
            Number.MAX_SAFE_INTEGER,
            toInsert[fromModified].children,
            options,
            recurseLevels - 1
          );
        }
      }
    };
    let lastStartO = Math.min(parentNode.children.length, index + deleteCount);
    let lastStartM = toInsert.length;
    for (const change of diff.changes.sort((a, b) => b.originalStart - a.originalStart)) {
      recurseSplice(lastStartO, lastStartM, lastStartO - (change.originalStart + change.originalLength));
      lastStartO = change.originalStart;
      lastStartM = change.modifiedStart - index;
      this.spliceSimple(
        [...locationPrefix, lastStartO],
        change.originalLength,
        Iterable.slice(toInsert, lastStartM, lastStartM + change.modifiedLength),
        options
      );
    }
    recurseSplice(lastStartO, lastStartM, lastStartO);
  }
  spliceSimple(location, deleteCount, toInsert = Iterable.empty(), { onDidCreateNode, onDidDeleteNode, diffIdentityProvider }) {
    const { parentNode, listIndex, revealed, visible } = this.getParentNodeWithListIndex(location);
    const treeListElementsToInsert = [];
    const nodesToInsertIterator = Iterable.map(toInsert, (el) => this.createTreeNode(el, parentNode, parentNode.visible ? TreeVisibility.Visible : TreeVisibility.Hidden, revealed, treeListElementsToInsert, onDidCreateNode));
    const lastIndex = location[location.length - 1];
    let visibleChildStartIndex = 0;
    for (let i = lastIndex; i >= 0 && i < parentNode.children.length; i--) {
      const child = parentNode.children[i];
      if (child.visible) {
        visibleChildStartIndex = child.visibleChildIndex;
        break;
      }
    }
    const nodesToInsert = [];
    let insertedVisibleChildrenCount = 0;
    let renderNodeCount = 0;
    for (const child of nodesToInsertIterator) {
      nodesToInsert.push(child);
      renderNodeCount += child.renderNodeCount;
      if (child.visible) {
        child.visibleChildIndex = visibleChildStartIndex + insertedVisibleChildrenCount++;
      }
    }
    const deletedNodes = splice(parentNode.children, lastIndex, deleteCount, nodesToInsert);
    if (!diffIdentityProvider) {
      parentNode.lastDiffIds = void 0;
    } else if (parentNode.lastDiffIds) {
      splice(parentNode.lastDiffIds, lastIndex, deleteCount, nodesToInsert.map((n) => diffIdentityProvider.getId(n.element).toString()));
    } else {
      parentNode.lastDiffIds = parentNode.children.map((n) => diffIdentityProvider.getId(n.element).toString());
    }
    let deletedVisibleChildrenCount = 0;
    for (const child of deletedNodes) {
      if (child.visible) {
        deletedVisibleChildrenCount++;
      }
    }
    if (deletedVisibleChildrenCount !== 0) {
      for (let i = lastIndex + nodesToInsert.length; i < parentNode.children.length; i++) {
        const child = parentNode.children[i];
        if (child.visible) {
          child.visibleChildIndex -= deletedVisibleChildrenCount;
        }
      }
    }
    parentNode.visibleChildrenCount += insertedVisibleChildrenCount - deletedVisibleChildrenCount;
    if (deletedNodes.length > 0 && onDidDeleteNode) {
      const visit = (node2) => {
        onDidDeleteNode(node2);
        node2.children.forEach(visit);
      };
      deletedNodes.forEach(visit);
    }
    if (revealed && visible) {
      const visibleDeleteCount = deletedNodes.reduce((r, node2) => r + (node2.visible ? node2.renderNodeCount : 0), 0);
      this._updateAncestorsRenderNodeCount(parentNode, renderNodeCount - visibleDeleteCount);
      this._onDidSpliceRenderedNodes.fire({ start: listIndex, deleteCount: visibleDeleteCount, elements: treeListElementsToInsert });
    }
    this._onDidSpliceModel.fire({ insertedNodes: nodesToInsert, deletedNodes });
    let node = parentNode;
    while (node) {
      if (node.visibility === TreeVisibility.Recurse) {
        this.refilterDelayer.trigger(() => this.refilter());
        break;
      }
      node = node.parent;
    }
  }
  rerender(location) {
    if (location.length === 0) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
    if (node.visible && revealed) {
      this._onDidSpliceRenderedNodes.fire({ start: listIndex, deleteCount: 1, elements: [node] });
    }
  }
  has(location) {
    return this.hasTreeNode(location);
  }
  getListIndex(location) {
    const { listIndex, visible, revealed } = this.getTreeNodeWithListIndex(location);
    return visible && revealed ? listIndex : -1;
  }
  getListRenderCount(location) {
    return this.getTreeNode(location).renderNodeCount;
  }
  isCollapsible(location) {
    return this.getTreeNode(location).collapsible;
  }
  setCollapsible(location, collapsible) {
    const node = this.getTreeNode(location);
    if (typeof collapsible === "undefined") {
      collapsible = !node.collapsible;
    }
    const update = { collapsible };
    return this.eventBufferer.bufferEvents(() => this._setCollapseState(location, update));
  }
  isCollapsed(location) {
    return this.getTreeNode(location).collapsed;
  }
  setCollapsed(location, collapsed, recursive) {
    const node = this.getTreeNode(location);
    if (typeof collapsed === "undefined") {
      collapsed = !node.collapsed;
    }
    const update = { collapsed, recursive: recursive || false };
    return this.eventBufferer.bufferEvents(() => this._setCollapseState(location, update));
  }
  _setCollapseState(location, update) {
    const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
    const result = this._setListNodeCollapseState(node, listIndex, revealed, update);
    if (node !== this.root && this.autoExpandSingleChildren && result && !isCollapsibleStateUpdate(update) && node.collapsible && !node.collapsed && !update.recursive) {
      let onlyVisibleChildIndex = -1;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.visible) {
          if (onlyVisibleChildIndex > -1) {
            onlyVisibleChildIndex = -1;
            break;
          } else {
            onlyVisibleChildIndex = i;
          }
        }
      }
      if (onlyVisibleChildIndex > -1) {
        this._setCollapseState([...location, onlyVisibleChildIndex], update);
      }
    }
    return result;
  }
  _setListNodeCollapseState(node, listIndex, revealed, update) {
    const result = this._setNodeCollapseState(node, update, false);
    if (!revealed || !node.visible || !result) {
      return result;
    }
    const previousRenderNodeCount = node.renderNodeCount;
    const toInsert = this.updateNodeAfterCollapseChange(node);
    const deleteCount = previousRenderNodeCount - (listIndex === -1 ? 0 : 1);
    this._onDidSpliceRenderedNodes.fire({ start: listIndex + 1, deleteCount, elements: toInsert.slice(1) });
    return result;
  }
  _setNodeCollapseState(node, update, deep) {
    let result;
    if (node === this.root) {
      result = false;
    } else {
      if (isCollapsibleStateUpdate(update)) {
        result = node.collapsible !== update.collapsible;
        node.collapsible = update.collapsible;
      } else if (!node.collapsible) {
        result = false;
      } else {
        result = node.collapsed !== update.collapsed;
        node.collapsed = update.collapsed;
      }
      if (result) {
        this._onDidChangeCollapseState.fire({ node, deep });
      }
    }
    if (!isCollapsibleStateUpdate(update) && update.recursive) {
      for (const child of node.children) {
        result = this._setNodeCollapseState(child, update, true) || result;
      }
    }
    return result;
  }
  expandTo(location) {
    this.eventBufferer.bufferEvents(() => {
      let node = this.getTreeNode(location);
      while (node.parent) {
        node = node.parent;
        location = location.slice(0, location.length - 1);
        if (node.collapsed) {
          this._setCollapseState(location, { collapsed: false, recursive: false });
        }
      }
    });
  }
  refilter() {
    const previousRenderNodeCount = this.root.renderNodeCount;
    const toInsert = this.updateNodeAfterFilterChange(this.root);
    this._onDidSpliceRenderedNodes.fire({ start: 0, deleteCount: previousRenderNodeCount, elements: toInsert });
    this.refilterDelayer.cancel();
  }
  createTreeNode(treeElement, parent, parentVisibility, revealed, treeListElements, onDidCreateNode) {
    const node = {
      parent,
      element: treeElement.element,
      children: [],
      depth: parent.depth + 1,
      visibleChildrenCount: 0,
      visibleChildIndex: -1,
      collapsible: typeof treeElement.collapsible === "boolean" ? treeElement.collapsible : typeof treeElement.collapsed !== "undefined",
      collapsed: typeof treeElement.collapsed === "undefined" ? this.collapseByDefault : treeElement.collapsed,
      renderNodeCount: 1,
      visibility: TreeVisibility.Visible,
      visible: true,
      filterData: void 0
    };
    const visibility = this._filterNode(node, parentVisibility);
    node.visibility = visibility;
    if (revealed) {
      treeListElements.push(node);
    }
    const childElements = treeElement.children || Iterable.empty();
    const childRevealed = revealed && visibility !== TreeVisibility.Hidden && !node.collapsed;
    let visibleChildrenCount = 0;
    let renderNodeCount = 1;
    for (const el of childElements) {
      const child = this.createTreeNode(el, node, visibility, childRevealed, treeListElements, onDidCreateNode);
      node.children.push(child);
      renderNodeCount += child.renderNodeCount;
      if (child.visible) {
        child.visibleChildIndex = visibleChildrenCount++;
      }
    }
    if (!this.allowNonCollapsibleParents) {
      node.collapsible = node.collapsible || node.children.length > 0;
    }
    node.visibleChildrenCount = visibleChildrenCount;
    node.visible = visibility === TreeVisibility.Recurse ? visibleChildrenCount > 0 : visibility === TreeVisibility.Visible;
    if (!node.visible) {
      node.renderNodeCount = 0;
      if (revealed) {
        treeListElements.pop();
      }
    } else if (!node.collapsed) {
      node.renderNodeCount = renderNodeCount;
    }
    onDidCreateNode?.(node);
    return node;
  }
  updateNodeAfterCollapseChange(node) {
    const previousRenderNodeCount = node.renderNodeCount;
    const result = [];
    this._updateNodeAfterCollapseChange(node, result);
    this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);
    return result;
  }
  _updateNodeAfterCollapseChange(node, result) {
    if (node.visible === false) {
      return 0;
    }
    result.push(node);
    node.renderNodeCount = 1;
    if (!node.collapsed) {
      for (const child of node.children) {
        node.renderNodeCount += this._updateNodeAfterCollapseChange(child, result);
      }
    }
    this._onDidChangeRenderNodeCount.fire(node);
    return node.renderNodeCount;
  }
  updateNodeAfterFilterChange(node) {
    const previousRenderNodeCount = node.renderNodeCount;
    const result = [];
    this._updateNodeAfterFilterChange(node, node.visible ? TreeVisibility.Visible : TreeVisibility.Hidden, result);
    this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);
    return result;
  }
  _updateNodeAfterFilterChange(node, parentVisibility, result, revealed = true) {
    let visibility;
    if (node !== this.root) {
      visibility = this._filterNode(node, parentVisibility);
      if (visibility === TreeVisibility.Hidden) {
        node.visible = false;
        node.renderNodeCount = 0;
        return false;
      }
      if (revealed) {
        result.push(node);
      }
    }
    const resultStartLength = result.length;
    node.renderNodeCount = node === this.root ? 0 : 1;
    let hasVisibleDescendants = false;
    if (!node.collapsed || visibility !== TreeVisibility.Hidden) {
      let visibleChildIndex = 0;
      for (const child of node.children) {
        hasVisibleDescendants = this._updateNodeAfterFilterChange(child, visibility, result, revealed && !node.collapsed) || hasVisibleDescendants;
        if (child.visible) {
          child.visibleChildIndex = visibleChildIndex++;
        }
      }
      node.visibleChildrenCount = visibleChildIndex;
    } else {
      node.visibleChildrenCount = 0;
    }
    if (node !== this.root) {
      node.visible = visibility === TreeVisibility.Recurse ? hasVisibleDescendants : visibility === TreeVisibility.Visible;
      node.visibility = visibility;
    }
    if (!node.visible) {
      node.renderNodeCount = 0;
      if (revealed) {
        result.pop();
      }
    } else if (!node.collapsed) {
      node.renderNodeCount += result.length - resultStartLength;
    }
    this._onDidChangeRenderNodeCount.fire(node);
    return node.visible;
  }
  _updateAncestorsRenderNodeCount(node, diff) {
    if (diff === 0) {
      return;
    }
    while (node) {
      node.renderNodeCount += diff;
      this._onDidChangeRenderNodeCount.fire(node);
      node = node.parent;
    }
  }
  _filterNode(node, parentVisibility) {
    const result = this.filter ? this.filter.filter(node.element, parentVisibility) : TreeVisibility.Visible;
    if (typeof result === "boolean") {
      node.filterData = void 0;
      return result ? TreeVisibility.Visible : TreeVisibility.Hidden;
    } else if (isFilterResult(result)) {
      node.filterData = result.data;
      return getVisibleState(result.visibility);
    } else {
      node.filterData = void 0;
      return getVisibleState(result);
    }
  }
  // cheap
  hasTreeNode(location, node = this.root) {
    if (!location || location.length === 0) {
      return true;
    }
    const [index, ...rest] = location;
    if (index < 0 || index > node.children.length) {
      return false;
    }
    return this.hasTreeNode(rest, node.children[index]);
  }
  // cheap
  getTreeNode(location, node = this.root) {
    if (!location || location.length === 0) {
      return node;
    }
    const [index, ...rest] = location;
    if (index < 0 || index > node.children.length) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    return this.getTreeNode(rest, node.children[index]);
  }
  // expensive
  getTreeNodeWithListIndex(location) {
    if (location.length === 0) {
      return { node: this.root, listIndex: -1, revealed: true, visible: false };
    }
    const { parentNode, listIndex, revealed, visible } = this.getParentNodeWithListIndex(location);
    const index = location[location.length - 1];
    if (index < 0 || index > parentNode.children.length) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    const node = parentNode.children[index];
    return { node, listIndex, revealed, visible: visible && node.visible };
  }
  getParentNodeWithListIndex(location, node = this.root, listIndex = 0, revealed = true, visible = true) {
    const [index, ...rest] = location;
    if (index < 0 || index > node.children.length) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    for (let i = 0; i < index; i++) {
      listIndex += node.children[i].renderNodeCount;
    }
    revealed = revealed && !node.collapsed;
    visible = visible && node.visible;
    if (rest.length === 0) {
      return { parentNode: node, listIndex, revealed, visible };
    }
    return this.getParentNodeWithListIndex(rest, node.children[index], listIndex + 1, revealed, visible);
  }
  getNode(location = []) {
    return this.getTreeNode(location);
  }
  // TODO@joao perf!
  getNodeLocation(node) {
    const location = [];
    let indexTreeNode = node;
    while (indexTreeNode.parent) {
      location.push(indexTreeNode.parent.children.indexOf(indexTreeNode));
      indexTreeNode = indexTreeNode.parent;
    }
    return location.reverse();
  }
  getParentNodeLocation(location) {
    if (location.length === 0) {
      return void 0;
    } else if (location.length === 1) {
      return [];
    } else {
      return tail(location)[0];
    }
  }
  getFirstElementChild(location) {
    const node = this.getTreeNode(location);
    if (node.children.length === 0) {
      return void 0;
    }
    return node.children[0].element;
  }
  getLastElementAncestor(location = []) {
    const node = this.getTreeNode(location);
    if (node.children.length === 0) {
      return void 0;
    }
    return this._getLastElementAncestor(node);
  }
  _getLastElementAncestor(node) {
    if (node.children.length === 0) {
      return node.element;
    }
    return this._getLastElementAncestor(node.children[node.children.length - 1]);
  }
}
export {
  IndexTreeModel,
  getVisibleState,
  isFilterResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL2luZGV4VHJlZU1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIgfSBmcm9tICcuLi9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudCwgSVRyZWVFbGVtZW50LCBJVHJlZUZpbHRlciwgSVRyZWVGaWx0ZXJEYXRhUmVzdWx0LCBJVHJlZUxpc3RTcGxpY2VEYXRhLCBJVHJlZU1vZGVsLCBJVHJlZU1vZGVsU3BsaWNlRXZlbnQsIElUcmVlTm9kZSwgVHJlZUVycm9yLCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4vdHJlZS5qcyc7XG5pbXBvcnQgeyBzcGxpY2UsIHRhaWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgTWljcm90YXNrRGVsYXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBMY3NEaWZmIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvZGlmZi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgRXZlbnRCdWZmZXJlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5cbi8vIEV4cG9ydGVkIGZvciB0ZXN0c1xuZXhwb3J0IGludGVyZmFjZSBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB7XG5cdHJlYWRvbmx5IHBhcmVudDogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjaGlsZHJlbjogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W107XG5cdHZpc2libGVDaGlsZHJlbkNvdW50OiBudW1iZXI7XG5cdHZpc2libGVDaGlsZEluZGV4OiBudW1iZXI7XG5cdGNvbGxhcHNpYmxlOiBib29sZWFuO1xuXHRjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdHJlbmRlck5vZGVDb3VudDogbnVtYmVyO1xuXHR2aXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eTtcblx0dmlzaWJsZTogYm9vbGVhbjtcblx0ZmlsdGVyRGF0YTogVEZpbHRlckRhdGEgfCB1bmRlZmluZWQ7XG5cdGxhc3REaWZmSWRzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpbHRlclJlc3VsdDxUPihvYmo6IHVua25vd24pOiBvYmogaXMgSVRyZWVGaWx0ZXJEYXRhUmVzdWx0PFQ+IHtcblx0cmV0dXJuICEhb2JqICYmICg8SVRyZWVGaWx0ZXJEYXRhUmVzdWx0PFQ+Pm9iaikudmlzaWJpbGl0eSAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmlzaWJsZVN0YXRlKHZpc2liaWxpdHk6IGJvb2xlYW4gfCBUcmVlVmlzaWJpbGl0eSk6IFRyZWVWaXNpYmlsaXR5IHtcblx0c3dpdGNoICh2aXNpYmlsaXR5KSB7XG5cdFx0Y2FzZSB0cnVlOiByZXR1cm4gVHJlZVZpc2liaWxpdHkuVmlzaWJsZTtcblx0XHRjYXNlIGZhbHNlOiByZXR1cm4gVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHRcdGRlZmF1bHQ6IHJldHVybiB2aXNpYmlsaXR5O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUluZGV4VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRyZWFkb25seSBjb2xsYXBzZUJ5RGVmYXVsdD86IGJvb2xlYW47IC8vIGRlZmF1bHRzIHRvIGZhbHNlXG5cdHJlYWRvbmx5IGFsbG93Tm9uQ29sbGFwc2libGVQYXJlbnRzPzogYm9vbGVhbjsgLy8gZGVmYXVsdHMgdG8gZmFsc2Vcblx0cmVhZG9ubHkgZmlsdGVyPzogSVRyZWVGaWx0ZXI8VCwgVEZpbHRlckRhdGE+O1xuXHRyZWFkb25seSBhdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW4/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbmRleFRyZWVNb2RlbFNwbGljZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IHtcblx0LyoqXG5cdCAqIElmIHNldCwgY2hpbGQgdXBkYXRlcyB3aWxsIHJlY3Vyc2UgdGhlIGdpdmVuIG51bWJlciBvZiBsZXZlbHMgZXZlbiBpZlxuXHQgKiBpdGVtcyBpbiB0aGUgc3BsaWNlIG9wZXJhdGlvbiBhcmUgdW5jaGFuZ2VkLiBgSW5maW5pdHlgIGlzIGEgdmFsaWQgdmFsdWUuXG5cdCAqL1xuXHRyZWFkb25seSBkaWZmRGVwdGg/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIElkZW50aXR5IHByb3ZpZGVyIHVzZWQgdG8gb3B0aW1pemUgc3BsaWNlKCkgY2FsbHMgaW4gdGhlIEluZGV4VHJlZS4gSWZcblx0ICogdGhpcyBpcyBub3QgcHJlc2VudCwgb3B0aW1pemVkIHNwbGljaW5nIGlzIG5vdCBlbmFibGVkLlxuXHQgKlxuXHQgKiBXYXJuaW5nOiBpZiB0aGlzIGlzIHByZXNlbnQsIGNhbGxzIHRvIGBzZXRDaGlsZHJlbigpYCB3aWxsIG5vdCByZXBsYWNlXG5cdCAqIG9yIHVwZGF0ZSBub2RlcyBpZiB0aGVpciBpZGVudGl0eSBpcyB0aGUgc2FtZSwgZXZlbiBpZiB0aGUgZWxlbWVudHMgYXJlXG5cdCAqIGRpZmZlcmVudC4gRm9yIHRoaXMsIHlvdSBzaG91bGQgY2FsbCBgcmVyZW5kZXIoKWAuXG5cdCAqL1xuXHRyZWFkb25seSBkaWZmSWRlbnRpdHlQcm92aWRlcj86IElJZGVudGl0eVByb3ZpZGVyPFQ+O1xuXG5cdC8qKlxuXHQgKiBDYWxsYmFjayBmb3Igd2hlbiBhIG5vZGUgaXMgY3JlYXRlZC5cblx0ICovXG5cdG9uRGlkQ3JlYXRlTm9kZT86IChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDYWxsYmFjayBmb3Igd2hlbiBhIG5vZGUgaXMgZGVsZXRlZC5cblx0ICovXG5cdG9uRGlkRGVsZXRlTm9kZT86IChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KSA9PiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgQ29sbGFwc2libGVTdGF0ZVVwZGF0ZSB7XG5cdHJlYWRvbmx5IGNvbGxhcHNpYmxlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgQ29sbGFwc2VkU3RhdGVVcGRhdGUge1xuXHRyZWFkb25seSBjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlY3Vyc2l2ZTogYm9vbGVhbjtcbn1cblxudHlwZSBDb2xsYXBzZVN0YXRlVXBkYXRlID0gQ29sbGFwc2libGVTdGF0ZVVwZGF0ZSB8IENvbGxhcHNlZFN0YXRlVXBkYXRlO1xuXG5mdW5jdGlvbiBpc0NvbGxhcHNpYmxlU3RhdGVVcGRhdGUodXBkYXRlOiBDb2xsYXBzZVN0YXRlVXBkYXRlKTogdXBkYXRlIGlzIENvbGxhcHNpYmxlU3RhdGVVcGRhdGUge1xuXHRyZXR1cm4gJ2NvbGxhcHNpYmxlJyBpbiB1cGRhdGU7XG59XG5cbmV4cG9ydCBjbGFzcyBJbmRleFRyZWVNb2RlbDxUIGV4dGVuZHMgRXhjbHVkZTx1bmtub3duLCB1bmRlZmluZWQ+LCBURmlsdGVyRGF0YSA9IHZvaWQ+IGltcGxlbWVudHMgSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgbnVtYmVyW10+IHtcblxuXHRyZWFkb25seSByb290UmVmID0gW107XG5cblx0cHJpdmF0ZSByb290OiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT47XG5cdHByaXZhdGUgZXZlbnRCdWZmZXJlciA9IG5ldyBFdmVudEJ1ZmZlcmVyKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTcGxpY2VNb2RlbCA9IG5ldyBFbWl0dGVyPElUcmVlTW9kZWxTcGxpY2VFdmVudDxULCBURmlsdGVyRGF0YT4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU3BsaWNlTW9kZWwgPSB0aGlzLl9vbkRpZFNwbGljZU1vZGVsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3BsaWNlUmVuZGVyZWROb2RlcyA9IG5ldyBFbWl0dGVyPElUcmVlTGlzdFNwbGljZURhdGE8VCwgVEZpbHRlckRhdGE+PigpO1xuXHRyZWFkb25seSBvbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMgPSB0aGlzLl9vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlID0gbmV3IEVtaXR0ZXI8SUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudDxULCBURmlsdGVyRGF0YT4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZTogRXZlbnQ8SUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudDxULCBURmlsdGVyRGF0YT4+ID0gdGhpcy5ldmVudEJ1ZmZlcmVyLndyYXBFdmVudCh0aGlzLl9vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUuZXZlbnQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50ID0gbmV3IEVtaXR0ZXI8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQ6IEV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+ID0gdGhpcy5ldmVudEJ1ZmZlcmVyLndyYXBFdmVudCh0aGlzLl9vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudC5ldmVudCk7XG5cblx0cHJpdmF0ZSBjb2xsYXBzZUJ5RGVmYXVsdDogYm9vbGVhbjtcblx0cHJpdmF0ZSBhbGxvd05vbkNvbGxhcHNpYmxlUGFyZW50czogYm9vbGVhbjtcblx0cHJpdmF0ZSBmaWx0ZXI/OiBJVHJlZUZpbHRlcjxULCBURmlsdGVyRGF0YT47XG5cdHByaXZhdGUgYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVmaWx0ZXJEZWxheWVyID0gbmV3IERlbGF5ZXIoTWljcm90YXNrRGVsYXkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdXNlcjogc3RyaW5nLFxuXHRcdHJvb3RFbGVtZW50OiBULFxuXHRcdG9wdGlvbnM6IElJbmRleFRyZWVNb2RlbE9wdGlvbnM8VCwgVEZpbHRlckRhdGE+ID0ge31cblx0KSB7XG5cdFx0dGhpcy5jb2xsYXBzZUJ5RGVmYXVsdCA9IHR5cGVvZiBvcHRpb25zLmNvbGxhcHNlQnlEZWZhdWx0ID09PSAndW5kZWZpbmVkJyA/IGZhbHNlIDogb3B0aW9ucy5jb2xsYXBzZUJ5RGVmYXVsdDtcblx0XHR0aGlzLmFsbG93Tm9uQ29sbGFwc2libGVQYXJlbnRzID0gb3B0aW9ucy5hbGxvd05vbkNvbGxhcHNpYmxlUGFyZW50cyA/PyBmYWxzZTtcblx0XHR0aGlzLmZpbHRlciA9IG9wdGlvbnMuZmlsdGVyO1xuXHRcdHRoaXMuYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuID0gdHlwZW9mIG9wdGlvbnMuYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuID09PSAndW5kZWZpbmVkJyA/IGZhbHNlIDogb3B0aW9ucy5hdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW47XG5cblx0XHR0aGlzLnJvb3QgPSB7XG5cdFx0XHRwYXJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGVsZW1lbnQ6IHJvb3RFbGVtZW50LFxuXHRcdFx0Y2hpbGRyZW46IFtdLFxuXHRcdFx0ZGVwdGg6IDAsXG5cdFx0XHR2aXNpYmxlQ2hpbGRyZW5Db3VudDogMCxcblx0XHRcdHZpc2libGVDaGlsZEluZGV4OiAtMSxcblx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRyZW5kZXJOb2RlQ291bnQ6IDAsXG5cdFx0XHR2aXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlLFxuXHRcdFx0dmlzaWJsZTogdHJ1ZSxcblx0XHRcdGZpbHRlckRhdGE6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRzcGxpY2UoXG5cdFx0bG9jYXRpb246IG51bWJlcltdLFxuXHRcdGRlbGV0ZUNvdW50OiBudW1iZXIsXG5cdFx0dG9JbnNlcnQ6IEl0ZXJhYmxlPElUcmVlRWxlbWVudDxUPj4gPSBJdGVyYWJsZS5lbXB0eSgpLFxuXHRcdG9wdGlvbnM6IElJbmRleFRyZWVNb2RlbFNwbGljZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+ID0ge30sXG5cdCk6IHZvaWQge1xuXHRcdGlmIChsb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy51c2VyLCAnSW52YWxpZCB0cmVlIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuZGlmZklkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuc3BsaWNlU21hcnQob3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciwgbG9jYXRpb24sIGRlbGV0ZUNvdW50LCB0b0luc2VydCwgb3B0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3BsaWNlU2ltcGxlKGxvY2F0aW9uLCBkZWxldGVDb3VudCwgdG9JbnNlcnQsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3BsaWNlU21hcnQoXG5cdFx0aWRlbnRpdHk6IElJZGVudGl0eVByb3ZpZGVyPFQ+LFxuXHRcdGxvY2F0aW9uOiBudW1iZXJbXSxcblx0XHRkZWxldGVDb3VudDogbnVtYmVyLFxuXHRcdHRvSW5zZXJ0SXRlcmFibGU6IEl0ZXJhYmxlPElUcmVlRWxlbWVudDxUPj4gPSBJdGVyYWJsZS5lbXB0eSgpLFxuXHRcdG9wdGlvbnM6IElJbmRleFRyZWVNb2RlbFNwbGljZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdHJlY3Vyc2VMZXZlbHMgPSBvcHRpb25zLmRpZmZEZXB0aCA/PyAwLFxuXHQpIHtcblx0XHRjb25zdCB7IHBhcmVudE5vZGUgfSA9IHRoaXMuZ2V0UGFyZW50Tm9kZVdpdGhMaXN0SW5kZXgobG9jYXRpb24pO1xuXHRcdGlmICghcGFyZW50Tm9kZS5sYXN0RGlmZklkcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3BsaWNlU2ltcGxlKGxvY2F0aW9uLCBkZWxldGVDb3VudCwgdG9JbnNlcnRJdGVyYWJsZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9JbnNlcnQgPSBbLi4udG9JbnNlcnRJdGVyYWJsZV07XG5cdFx0Y29uc3QgaW5kZXggPSBsb2NhdGlvbltsb2NhdGlvbi5sZW5ndGggLSAxXTtcblx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYoXG5cdFx0XHR7IGdldEVsZW1lbnRzOiAoKSA9PiBwYXJlbnROb2RlLmxhc3REaWZmSWRzISB9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRFbGVtZW50czogKCkgPT4gW1xuXHRcdFx0XHRcdC4uLnBhcmVudE5vZGUuY2hpbGRyZW4uc2xpY2UoMCwgaW5kZXgpLFxuXHRcdFx0XHRcdC4uLnRvSW5zZXJ0LFxuXHRcdFx0XHRcdC4uLnBhcmVudE5vZGUuY2hpbGRyZW4uc2xpY2UoaW5kZXggKyBkZWxldGVDb3VudCksXG5cdFx0XHRcdF0ubWFwKGUgPT4gaWRlbnRpdHkuZ2V0SWQoZS5lbGVtZW50KS50b1N0cmluZygpKVxuXHRcdFx0fSxcblx0XHQpLkNvbXB1dGVEaWZmKGZhbHNlKTtcblxuXHRcdC8vIGlmIHdlIHdlcmUgZ2l2ZW4gYSAnYmVzdCBlZmZvcnQnIGRpZmYsIHVzZSBkZWZhdWx0IGJlaGF2aW9yXG5cdFx0aWYgKGRpZmYucXVpdEVhcmx5KSB7XG5cdFx0XHRwYXJlbnROb2RlLmxhc3REaWZmSWRzID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHRoaXMuc3BsaWNlU2ltcGxlKGxvY2F0aW9uLCBkZWxldGVDb3VudCwgdG9JbnNlcnQsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uUHJlZml4ID0gbG9jYXRpb24uc2xpY2UoMCwgLTEpO1xuXHRcdGNvbnN0IHJlY3Vyc2VTcGxpY2UgPSAoZnJvbU9yaWdpbmFsOiBudW1iZXIsIGZyb21Nb2RpZmllZDogbnVtYmVyLCBjb3VudDogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAocmVjdXJzZUxldmVscyA+IDApIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0ZnJvbU9yaWdpbmFsLS07XG5cdFx0XHRcdFx0ZnJvbU1vZGlmaWVkLS07XG5cdFx0XHRcdFx0dGhpcy5zcGxpY2VTbWFydChcblx0XHRcdFx0XHRcdGlkZW50aXR5LFxuXHRcdFx0XHRcdFx0Wy4uLmxvY2F0aW9uUHJlZml4LCBmcm9tT3JpZ2luYWwsIDBdLFxuXHRcdFx0XHRcdFx0TnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsXG5cdFx0XHRcdFx0XHR0b0luc2VydFtmcm9tTW9kaWZpZWRdLmNoaWxkcmVuLFxuXHRcdFx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdFx0XHRcdHJlY3Vyc2VMZXZlbHMgLSAxLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IGxhc3RTdGFydE8gPSBNYXRoLm1pbihwYXJlbnROb2RlLmNoaWxkcmVuLmxlbmd0aCwgaW5kZXggKyBkZWxldGVDb3VudCk7XG5cdFx0bGV0IGxhc3RTdGFydE0gPSB0b0luc2VydC5sZW5ndGg7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZGlmZi5jaGFuZ2VzLnNvcnQoKGEsIGIpID0+IGIub3JpZ2luYWxTdGFydCAtIGEub3JpZ2luYWxTdGFydCkpIHtcblx0XHRcdHJlY3Vyc2VTcGxpY2UobGFzdFN0YXJ0TywgbGFzdFN0YXJ0TSwgbGFzdFN0YXJ0TyAtIChjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCkpO1xuXHRcdFx0bGFzdFN0YXJ0TyA9IGNoYW5nZS5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0bGFzdFN0YXJ0TSA9IGNoYW5nZS5tb2RpZmllZFN0YXJ0IC0gaW5kZXg7XG5cblx0XHRcdHRoaXMuc3BsaWNlU2ltcGxlKFxuXHRcdFx0XHRbLi4ubG9jYXRpb25QcmVmaXgsIGxhc3RTdGFydE9dLFxuXHRcdFx0XHRjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdEl0ZXJhYmxlLnNsaWNlKHRvSW5zZXJ0LCBsYXN0U3RhcnRNLCBsYXN0U3RhcnRNICsgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoKSxcblx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gYXQgdGhpcyBwb2ludCwgc3RhcnRPID09PSBzdGFydE0gPT09IGNvdW50IHNpbmNlIGFueSByZW1haW5pbmcgcHJlZml4IHNob3VsZCBtYXRjaFxuXHRcdHJlY3Vyc2VTcGxpY2UobGFzdFN0YXJ0TywgbGFzdFN0YXJ0TSwgbGFzdFN0YXJ0Tyk7XG5cdH1cblxuXHRwcml2YXRlIHNwbGljZVNpbXBsZShcblx0XHRsb2NhdGlvbjogbnVtYmVyW10sXG5cdFx0ZGVsZXRlQ291bnQ6IG51bWJlcixcblx0XHR0b0luc2VydDogSXRlcmFibGU8SVRyZWVFbGVtZW50PFQ+PiA9IEl0ZXJhYmxlLmVtcHR5KCksXG5cdFx0eyBvbkRpZENyZWF0ZU5vZGUsIG9uRGlkRGVsZXRlTm9kZSwgZGlmZklkZW50aXR5UHJvdmlkZXIgfTogSUluZGV4VHJlZU1vZGVsU3BsaWNlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sXG5cdCkge1xuXHRcdGNvbnN0IHsgcGFyZW50Tm9kZSwgbGlzdEluZGV4LCByZXZlYWxlZCwgdmlzaWJsZSB9ID0gdGhpcy5nZXRQYXJlbnROb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbik7XG5cdFx0Y29uc3QgdHJlZUxpc3RFbGVtZW50c1RvSW5zZXJ0OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10gPSBbXTtcblx0XHRjb25zdCBub2Rlc1RvSW5zZXJ0SXRlcmF0b3IgPSBJdGVyYWJsZS5tYXAodG9JbnNlcnQsIGVsID0+IHRoaXMuY3JlYXRlVHJlZU5vZGUoZWwsIHBhcmVudE5vZGUsIHBhcmVudE5vZGUudmlzaWJsZSA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW4sIHJldmVhbGVkLCB0cmVlTGlzdEVsZW1lbnRzVG9JbnNlcnQsIG9uRGlkQ3JlYXRlTm9kZSkpO1xuXG5cdFx0Y29uc3QgbGFzdEluZGV4ID0gbG9jYXRpb25bbG9jYXRpb24ubGVuZ3RoIC0gMV07XG5cblx0XHQvLyBmaWd1cmUgb3V0IHdoYXQncyB0aGUgdmlzaWJsZSBjaGlsZCBzdGFydCBpbmRleCByaWdodCBiZWZvcmUgdGhlXG5cdFx0Ly8gc3BsaWNlIHBvaW50XG5cdFx0bGV0IHZpc2libGVDaGlsZFN0YXJ0SW5kZXggPSAwO1xuXG5cdFx0Zm9yIChsZXQgaSA9IGxhc3RJbmRleDsgaSA+PSAwICYmIGkgPCBwYXJlbnROb2RlLmNoaWxkcmVuLmxlbmd0aDsgaS0tKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IHBhcmVudE5vZGUuY2hpbGRyZW5baV07XG5cblx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdHZpc2libGVDaGlsZFN0YXJ0SW5kZXggPSBjaGlsZC52aXNpYmxlQ2hpbGRJbmRleDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZXNUb0luc2VydDogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10gPSBbXTtcblx0XHRsZXQgaW5zZXJ0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudCA9IDA7XG5cdFx0bGV0IHJlbmRlck5vZGVDb3VudCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGVzVG9JbnNlcnRJdGVyYXRvcikge1xuXHRcdFx0bm9kZXNUb0luc2VydC5wdXNoKGNoaWxkKTtcblx0XHRcdHJlbmRlck5vZGVDb3VudCArPSBjaGlsZC5yZW5kZXJOb2RlQ291bnQ7XG5cblx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdGNoaWxkLnZpc2libGVDaGlsZEluZGV4ID0gdmlzaWJsZUNoaWxkU3RhcnRJbmRleCArIGluc2VydGVkVmlzaWJsZUNoaWxkcmVuQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkZWxldGVkTm9kZXMgPSBzcGxpY2UocGFyZW50Tm9kZS5jaGlsZHJlbiwgbGFzdEluZGV4LCBkZWxldGVDb3VudCwgbm9kZXNUb0luc2VydCk7XG5cblx0XHRpZiAoIWRpZmZJZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0XHRwYXJlbnROb2RlLmxhc3REaWZmSWRzID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAocGFyZW50Tm9kZS5sYXN0RGlmZklkcykge1xuXHRcdFx0c3BsaWNlKHBhcmVudE5vZGUubGFzdERpZmZJZHMsIGxhc3RJbmRleCwgZGVsZXRlQ291bnQsIG5vZGVzVG9JbnNlcnQubWFwKG4gPT4gZGlmZklkZW50aXR5UHJvdmlkZXIuZ2V0SWQobi5lbGVtZW50KS50b1N0cmluZygpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhcmVudE5vZGUubGFzdERpZmZJZHMgPSBwYXJlbnROb2RlLmNoaWxkcmVuLm1hcChuID0+IGRpZmZJZGVudGl0eVByb3ZpZGVyLmdldElkKG4uZWxlbWVudCkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gZmlndXJlIG91dCB3aGF0IGlzIHRoZSBjb3VudCBvZiBkZWxldGVkIHZpc2libGUgY2hpbGRyZW5cblx0XHRsZXQgZGVsZXRlZFZpc2libGVDaGlsZHJlbkNvdW50ID0gMDtcblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZGVsZXRlZE5vZGVzKSB7XG5cdFx0XHRpZiAoY2hpbGQudmlzaWJsZSkge1xuXHRcdFx0XHRkZWxldGVkVmlzaWJsZUNoaWxkcmVuQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBhbmQgYWRqdXN0IGZvciBhbGwgdmlzaWJsZSBjaGlsZHJlbiBhZnRlciB0aGUgc3BsaWNlIHBvaW50XG5cdFx0aWYgKGRlbGV0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudCAhPT0gMCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IGxhc3RJbmRleCArIG5vZGVzVG9JbnNlcnQubGVuZ3RoOyBpIDwgcGFyZW50Tm9kZS5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IHBhcmVudE5vZGUuY2hpbGRyZW5baV07XG5cblx0XHRcdFx0aWYgKGNoaWxkLnZpc2libGUpIHtcblx0XHRcdFx0XHRjaGlsZC52aXNpYmxlQ2hpbGRJbmRleCAtPSBkZWxldGVkVmlzaWJsZUNoaWxkcmVuQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB1cGRhdGUgcGFyZW50J3MgdmlzaWJsZSBjaGlsZHJlbiBjb3VudFxuXHRcdHBhcmVudE5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQgKz0gaW5zZXJ0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudCAtIGRlbGV0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudDtcblxuXHRcdGlmIChkZWxldGVkTm9kZXMubGVuZ3RoID4gMCAmJiBvbkRpZERlbGV0ZU5vZGUpIHtcblx0XHRcdGNvbnN0IHZpc2l0ID0gKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IHtcblx0XHRcdFx0b25EaWREZWxldGVOb2RlKG5vZGUpO1xuXHRcdFx0XHRub2RlLmNoaWxkcmVuLmZvckVhY2godmlzaXQpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZGVsZXRlZE5vZGVzLmZvckVhY2godmlzaXQpO1xuXHRcdH1cblxuXHRcdGlmIChyZXZlYWxlZCAmJiB2aXNpYmxlKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlRGVsZXRlQ291bnQgPSBkZWxldGVkTm9kZXMucmVkdWNlKChyLCBub2RlKSA9PiByICsgKG5vZGUudmlzaWJsZSA/IG5vZGUucmVuZGVyTm9kZUNvdW50IDogMCksIDApO1xuXG5cdFx0XHR0aGlzLl91cGRhdGVBbmNlc3RvcnNSZW5kZXJOb2RlQ291bnQocGFyZW50Tm9kZSwgcmVuZGVyTm9kZUNvdW50IC0gdmlzaWJsZURlbGV0ZUNvdW50KTtcblx0XHRcdHRoaXMuX29uRGlkU3BsaWNlUmVuZGVyZWROb2Rlcy5maXJlKHsgc3RhcnQ6IGxpc3RJbmRleCwgZGVsZXRlQ291bnQ6IHZpc2libGVEZWxldGVDb3VudCwgZWxlbWVudHM6IHRyZWVMaXN0RWxlbWVudHNUb0luc2VydCB9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZFNwbGljZU1vZGVsLmZpcmUoeyBpbnNlcnRlZE5vZGVzOiBub2Rlc1RvSW5zZXJ0LCBkZWxldGVkTm9kZXMgfSk7XG5cblx0XHRsZXQgbm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkID0gcGFyZW50Tm9kZTtcblxuXHRcdHdoaWxlIChub2RlKSB7XG5cdFx0XHRpZiAobm9kZS52aXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlKSB7XG5cdFx0XHRcdC8vIGRlbGF5ZWQgdG8gYXZvaWQgZXhjZXNzaXZlIHJlZmlsdGVyaW5nLCBzZWUgIzEzNTk0MVxuXHRcdFx0XHR0aGlzLnJlZmlsdGVyRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMucmVmaWx0ZXIoKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0fVxuXHR9XG5cblx0cmVyZW5kZXIobG9jYXRpb246IG51bWJlcltdKTogdm9pZCB7XG5cdFx0aWYgKGxvY2F0aW9uLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdJbnZhbGlkIHRyZWUgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IG5vZGUsIGxpc3RJbmRleCwgcmV2ZWFsZWQgfSA9IHRoaXMuZ2V0VHJlZU5vZGVXaXRoTGlzdEluZGV4KGxvY2F0aW9uKTtcblxuXHRcdGlmIChub2RlLnZpc2libGUgJiYgcmV2ZWFsZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkU3BsaWNlUmVuZGVyZWROb2Rlcy5maXJlKHsgc3RhcnQ6IGxpc3RJbmRleCwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBbbm9kZV0gfSk7XG5cdFx0fVxuXHR9XG5cblx0aGFzKGxvY2F0aW9uOiBudW1iZXJbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmhhc1RyZWVOb2RlKGxvY2F0aW9uKTtcblx0fVxuXG5cdGdldExpc3RJbmRleChsb2NhdGlvbjogbnVtYmVyW10pOiBudW1iZXIge1xuXHRcdGNvbnN0IHsgbGlzdEluZGV4LCB2aXNpYmxlLCByZXZlYWxlZCB9ID0gdGhpcy5nZXRUcmVlTm9kZVdpdGhMaXN0SW5kZXgobG9jYXRpb24pO1xuXHRcdHJldHVybiB2aXNpYmxlICYmIHJldmVhbGVkID8gbGlzdEluZGV4IDogLTE7XG5cdH1cblxuXHRnZXRMaXN0UmVuZGVyQ291bnQobG9jYXRpb246IG51bWJlcltdKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbikucmVuZGVyTm9kZUNvdW50O1xuXHR9XG5cblx0aXNDb2xsYXBzaWJsZShsb2NhdGlvbjogbnVtYmVyW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbikuY29sbGFwc2libGU7XG5cdH1cblxuXHRzZXRDb2xsYXBzaWJsZShsb2NhdGlvbjogbnVtYmVyW10sIGNvbGxhcHNpYmxlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKTtcblxuXHRcdGlmICh0eXBlb2YgY29sbGFwc2libGUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb2xsYXBzaWJsZSA9ICFub2RlLmNvbGxhcHNpYmxlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZTogQ29sbGFwc2libGVTdGF0ZVVwZGF0ZSA9IHsgY29sbGFwc2libGUgfTtcblx0XHRyZXR1cm4gdGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB0aGlzLl9zZXRDb2xsYXBzZVN0YXRlKGxvY2F0aW9uLCB1cGRhdGUpKTtcblx0fVxuXG5cdGlzQ29sbGFwc2VkKGxvY2F0aW9uOiBudW1iZXJbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKS5jb2xsYXBzZWQ7XG5cdH1cblxuXHRzZXRDb2xsYXBzZWQobG9jYXRpb246IG51bWJlcltdLCBjb2xsYXBzZWQ/OiBib29sZWFuLCByZWN1cnNpdmU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0VHJlZU5vZGUobG9jYXRpb24pO1xuXG5cdFx0aWYgKHR5cGVvZiBjb2xsYXBzZWQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb2xsYXBzZWQgPSAhbm9kZS5jb2xsYXBzZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlOiBDb2xsYXBzZWRTdGF0ZVVwZGF0ZSA9IHsgY29sbGFwc2VkLCByZWN1cnNpdmU6IHJlY3Vyc2l2ZSB8fCBmYWxzZSB9O1xuXHRcdHJldHVybiB0aGlzLmV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHRoaXMuX3NldENvbGxhcHNlU3RhdGUobG9jYXRpb24sIHVwZGF0ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29sbGFwc2VTdGF0ZShsb2NhdGlvbjogbnVtYmVyW10sIHVwZGF0ZTogQ29sbGFwc2VTdGF0ZVVwZGF0ZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHsgbm9kZSwgbGlzdEluZGV4LCByZXZlYWxlZCB9ID0gdGhpcy5nZXRUcmVlTm9kZVdpdGhMaXN0SW5kZXgobG9jYXRpb24pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fc2V0TGlzdE5vZGVDb2xsYXBzZVN0YXRlKG5vZGUsIGxpc3RJbmRleCwgcmV2ZWFsZWQsIHVwZGF0ZSk7XG5cblx0XHRpZiAobm9kZSAhPT0gdGhpcy5yb290ICYmIHRoaXMuYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuICYmIHJlc3VsdCAmJiAhaXNDb2xsYXBzaWJsZVN0YXRlVXBkYXRlKHVwZGF0ZSkgJiYgbm9kZS5jb2xsYXBzaWJsZSAmJiAhbm9kZS5jb2xsYXBzZWQgJiYgIXVwZGF0ZS5yZWN1cnNpdmUpIHtcblx0XHRcdGxldCBvbmx5VmlzaWJsZUNoaWxkSW5kZXggPSAtMTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gbm9kZS5jaGlsZHJlbltpXTtcblxuXHRcdFx0XHRpZiAoY2hpbGQudmlzaWJsZSkge1xuXHRcdFx0XHRcdGlmIChvbmx5VmlzaWJsZUNoaWxkSW5kZXggPiAtMSkge1xuXHRcdFx0XHRcdFx0b25seVZpc2libGVDaGlsZEluZGV4ID0gLTE7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0b25seVZpc2libGVDaGlsZEluZGV4ID0gaTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG9ubHlWaXNpYmxlQ2hpbGRJbmRleCA+IC0xKSB7XG5cdFx0XHRcdHRoaXMuX3NldENvbGxhcHNlU3RhdGUoWy4uLmxvY2F0aW9uLCBvbmx5VmlzaWJsZUNoaWxkSW5kZXhdLCB1cGRhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRMaXN0Tm9kZUNvbGxhcHNlU3RhdGUobm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBsaXN0SW5kZXg6IG51bWJlciwgcmV2ZWFsZWQ6IGJvb2xlYW4sIHVwZGF0ZTogQ29sbGFwc2VTdGF0ZVVwZGF0ZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3NldE5vZGVDb2xsYXBzZVN0YXRlKG5vZGUsIHVwZGF0ZSwgZmFsc2UpO1xuXG5cdFx0aWYgKCFyZXZlYWxlZCB8fCAhbm9kZS52aXNpYmxlIHx8ICFyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJOb2RlQ291bnQgPSBub2RlLnJlbmRlck5vZGVDb3VudDtcblx0XHRjb25zdCB0b0luc2VydCA9IHRoaXMudXBkYXRlTm9kZUFmdGVyQ29sbGFwc2VDaGFuZ2Uobm9kZSk7XG5cdFx0Y29uc3QgZGVsZXRlQ291bnQgPSBwcmV2aW91c1JlbmRlck5vZGVDb3VudCAtIChsaXN0SW5kZXggPT09IC0xID8gMCA6IDEpO1xuXHRcdHRoaXMuX29uRGlkU3BsaWNlUmVuZGVyZWROb2Rlcy5maXJlKHsgc3RhcnQ6IGxpc3RJbmRleCArIDEsIGRlbGV0ZUNvdW50OiBkZWxldGVDb3VudCwgZWxlbWVudHM6IHRvSW5zZXJ0LnNsaWNlKDEpIH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3NldE5vZGVDb2xsYXBzZVN0YXRlKG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgdXBkYXRlOiBDb2xsYXBzZVN0YXRlVXBkYXRlLCBkZWVwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0bGV0IHJlc3VsdDogYm9vbGVhbjtcblxuXHRcdGlmIChub2RlID09PSB0aGlzLnJvb3QpIHtcblx0XHRcdHJlc3VsdCA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNDb2xsYXBzaWJsZVN0YXRlVXBkYXRlKHVwZGF0ZSkpIHtcblx0XHRcdFx0cmVzdWx0ID0gbm9kZS5jb2xsYXBzaWJsZSAhPT0gdXBkYXRlLmNvbGxhcHNpYmxlO1xuXHRcdFx0XHRub2RlLmNvbGxhcHNpYmxlID0gdXBkYXRlLmNvbGxhcHNpYmxlO1xuXHRcdFx0fSBlbHNlIGlmICghbm9kZS5jb2xsYXBzaWJsZSkge1xuXHRcdFx0XHRyZXN1bHQgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdCA9IG5vZGUuY29sbGFwc2VkICE9PSB1cGRhdGUuY29sbGFwc2VkO1xuXHRcdFx0XHRub2RlLmNvbGxhcHNlZCA9IHVwZGF0ZS5jb2xsYXBzZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlLmZpcmUoeyBub2RlLCBkZWVwIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaXNDb2xsYXBzaWJsZVN0YXRlVXBkYXRlKHVwZGF0ZSkgJiYgdXBkYXRlLnJlY3Vyc2l2ZSkge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX3NldE5vZGVDb2xsYXBzZVN0YXRlKGNoaWxkLCB1cGRhdGUsIHRydWUpIHx8IHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwYW5kVG8obG9jYXRpb246IG51bWJlcltdKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRsZXQgbm9kZSA9IHRoaXMuZ2V0VHJlZU5vZGUobG9jYXRpb24pO1xuXG5cdFx0XHR3aGlsZSAobm9kZS5wYXJlbnQpIHtcblx0XHRcdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHRcdFx0XHRsb2NhdGlvbiA9IGxvY2F0aW9uLnNsaWNlKDAsIGxvY2F0aW9uLmxlbmd0aCAtIDEpO1xuXG5cdFx0XHRcdGlmIChub2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldENvbGxhcHNlU3RhdGUobG9jYXRpb24sIHsgY29sbGFwc2VkOiBmYWxzZSwgcmVjdXJzaXZlOiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVmaWx0ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJOb2RlQ291bnQgPSB0aGlzLnJvb3QucmVuZGVyTm9kZUNvdW50O1xuXHRcdGNvbnN0IHRvSW5zZXJ0ID0gdGhpcy51cGRhdGVOb2RlQWZ0ZXJGaWx0ZXJDaGFuZ2UodGhpcy5yb290KTtcblx0XHR0aGlzLl9vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMuZmlyZSh7IHN0YXJ0OiAwLCBkZWxldGVDb3VudDogcHJldmlvdXNSZW5kZXJOb2RlQ291bnQsIGVsZW1lbnRzOiB0b0luc2VydCB9KTtcblx0XHR0aGlzLnJlZmlsdGVyRGVsYXllci5jYW5jZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVHJlZU5vZGUoXG5cdFx0dHJlZUVsZW1lbnQ6IElUcmVlRWxlbWVudDxUPixcblx0XHRwYXJlbnQ6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPixcblx0XHRwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSxcblx0XHRyZXZlYWxlZDogYm9vbGVhbixcblx0XHR0cmVlTGlzdEVsZW1lbnRzOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10sXG5cdFx0b25EaWRDcmVhdGVOb2RlPzogKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IHZvaWRcblx0KTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0XHRjb25zdCBub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gPSB7XG5cdFx0XHRwYXJlbnQsXG5cdFx0XHRlbGVtZW50OiB0cmVlRWxlbWVudC5lbGVtZW50LFxuXHRcdFx0Y2hpbGRyZW46IFtdLFxuXHRcdFx0ZGVwdGg6IHBhcmVudC5kZXB0aCArIDEsXG5cdFx0XHR2aXNpYmxlQ2hpbGRyZW5Db3VudDogMCxcblx0XHRcdHZpc2libGVDaGlsZEluZGV4OiAtMSxcblx0XHRcdGNvbGxhcHNpYmxlOiB0eXBlb2YgdHJlZUVsZW1lbnQuY29sbGFwc2libGUgPT09ICdib29sZWFuJyA/IHRyZWVFbGVtZW50LmNvbGxhcHNpYmxlIDogKHR5cGVvZiB0cmVlRWxlbWVudC5jb2xsYXBzZWQgIT09ICd1bmRlZmluZWQnKSxcblx0XHRcdGNvbGxhcHNlZDogdHlwZW9mIHRyZWVFbGVtZW50LmNvbGxhcHNlZCA9PT0gJ3VuZGVmaW5lZCcgPyB0aGlzLmNvbGxhcHNlQnlEZWZhdWx0IDogdHJlZUVsZW1lbnQuY29sbGFwc2VkLFxuXHRcdFx0cmVuZGVyTm9kZUNvdW50OiAxLFxuXHRcdFx0dmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkuVmlzaWJsZSxcblx0XHRcdHZpc2libGU6IHRydWUsXG5cdFx0XHRmaWx0ZXJEYXRhOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0Y29uc3QgdmlzaWJpbGl0eSA9IHRoaXMuX2ZpbHRlck5vZGUobm9kZSwgcGFyZW50VmlzaWJpbGl0eSk7XG5cdFx0bm9kZS52aXNpYmlsaXR5ID0gdmlzaWJpbGl0eTtcblxuXHRcdGlmIChyZXZlYWxlZCkge1xuXHRcdFx0dHJlZUxpc3RFbGVtZW50cy5wdXNoKG5vZGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkRWxlbWVudHMgPSB0cmVlRWxlbWVudC5jaGlsZHJlbiB8fCBJdGVyYWJsZS5lbXB0eSgpO1xuXHRcdGNvbnN0IGNoaWxkUmV2ZWFsZWQgPSByZXZlYWxlZCAmJiB2aXNpYmlsaXR5ICE9PSBUcmVlVmlzaWJpbGl0eS5IaWRkZW4gJiYgIW5vZGUuY29sbGFwc2VkO1xuXG5cdFx0bGV0IHZpc2libGVDaGlsZHJlbkNvdW50ID0gMDtcblx0XHRsZXQgcmVuZGVyTm9kZUNvdW50ID0gMTtcblxuXHRcdGZvciAoY29uc3QgZWwgb2YgY2hpbGRFbGVtZW50cykge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSB0aGlzLmNyZWF0ZVRyZWVOb2RlKGVsLCBub2RlLCB2aXNpYmlsaXR5LCBjaGlsZFJldmVhbGVkLCB0cmVlTGlzdEVsZW1lbnRzLCBvbkRpZENyZWF0ZU5vZGUpO1xuXHRcdFx0bm9kZS5jaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHRcdHJlbmRlck5vZGVDb3VudCArPSBjaGlsZC5yZW5kZXJOb2RlQ291bnQ7XG5cblx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdGNoaWxkLnZpc2libGVDaGlsZEluZGV4ID0gdmlzaWJsZUNoaWxkcmVuQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuYWxsb3dOb25Db2xsYXBzaWJsZVBhcmVudHMpIHtcblx0XHRcdG5vZGUuY29sbGFwc2libGUgPSBub2RlLmNvbGxhcHNpYmxlIHx8IG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0XHR9XG5cblx0XHRub2RlLnZpc2libGVDaGlsZHJlbkNvdW50ID0gdmlzaWJsZUNoaWxkcmVuQ291bnQ7XG5cdFx0bm9kZS52aXNpYmxlID0gdmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuUmVjdXJzZSA/IHZpc2libGVDaGlsZHJlbkNvdW50ID4gMCA6ICh2aXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlKTtcblxuXHRcdGlmICghbm9kZS52aXNpYmxlKSB7XG5cdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCA9IDA7XG5cblx0XHRcdGlmIChyZXZlYWxlZCkge1xuXHRcdFx0XHR0cmVlTGlzdEVsZW1lbnRzLnBvcCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIW5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCA9IHJlbmRlck5vZGVDb3VudDtcblx0XHR9XG5cblx0XHRvbkRpZENyZWF0ZU5vZGU/Lihub2RlKTtcblxuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVOb2RlQWZ0ZXJDb2xsYXBzZUNoYW5nZShub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10ge1xuXHRcdGNvbnN0IHByZXZpb3VzUmVuZGVyTm9kZUNvdW50ID0gbm9kZS5yZW5kZXJOb2RlQ291bnQ7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10gPSBbXTtcblxuXHRcdHRoaXMuX3VwZGF0ZU5vZGVBZnRlckNvbGxhcHNlQ2hhbmdlKG5vZGUsIHJlc3VsdCk7XG5cdFx0dGhpcy5fdXBkYXRlQW5jZXN0b3JzUmVuZGVyTm9kZUNvdW50KG5vZGUucGFyZW50LCByZXN1bHQubGVuZ3RoIC0gcHJldmlvdXNSZW5kZXJOb2RlQ291bnQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU5vZGVBZnRlckNvbGxhcHNlQ2hhbmdlKG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgcmVzdWx0OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10pOiBudW1iZXIge1xuXHRcdGlmIChub2RlLnZpc2libGUgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChub2RlKTtcblx0XHRub2RlLnJlbmRlck5vZGVDb3VudCA9IDE7XG5cblx0XHRpZiAoIW5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0bm9kZS5yZW5kZXJOb2RlQ291bnQgKz0gdGhpcy5fdXBkYXRlTm9kZUFmdGVyQ29sbGFwc2VDaGFuZ2UoY2hpbGQsIHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQuZmlyZShub2RlKTtcblx0XHRyZXR1cm4gbm9kZS5yZW5kZXJOb2RlQ291bnQ7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU5vZGVBZnRlckZpbHRlckNoYW5nZShub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10ge1xuXHRcdGNvbnN0IHByZXZpb3VzUmVuZGVyTm9kZUNvdW50ID0gbm9kZS5yZW5kZXJOb2RlQ291bnQ7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10gPSBbXTtcblxuXHRcdHRoaXMuX3VwZGF0ZU5vZGVBZnRlckZpbHRlckNoYW5nZShub2RlLCBub2RlLnZpc2libGUgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuSGlkZGVuLCByZXN1bHQpO1xuXHRcdHRoaXMuX3VwZGF0ZUFuY2VzdG9yc1JlbmRlck5vZGVDb3VudChub2RlLnBhcmVudCwgcmVzdWx0Lmxlbmd0aCAtIHByZXZpb3VzUmVuZGVyTm9kZUNvdW50KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVOb2RlQWZ0ZXJGaWx0ZXJDaGFuZ2Uobm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSwgcmVzdWx0OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10sIHJldmVhbGVkID0gdHJ1ZSk6IGJvb2xlYW4ge1xuXHRcdGxldCB2aXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eTtcblxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QpIHtcblx0XHRcdHZpc2liaWxpdHkgPSB0aGlzLl9maWx0ZXJOb2RlKG5vZGUsIHBhcmVudFZpc2liaWxpdHkpO1xuXG5cdFx0XHRpZiAodmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuSGlkZGVuKSB7XG5cdFx0XHRcdG5vZGUudmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCA9IDA7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJldmVhbGVkKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdFN0YXJ0TGVuZ3RoID0gcmVzdWx0Lmxlbmd0aDtcblx0XHRub2RlLnJlbmRlck5vZGVDb3VudCA9IG5vZGUgPT09IHRoaXMucm9vdCA/IDAgOiAxO1xuXG5cdFx0bGV0IGhhc1Zpc2libGVEZXNjZW5kYW50cyA9IGZhbHNlO1xuXHRcdGlmICghbm9kZS5jb2xsYXBzZWQgfHwgdmlzaWJpbGl0eSEgIT09IFRyZWVWaXNpYmlsaXR5LkhpZGRlbikge1xuXHRcdFx0bGV0IHZpc2libGVDaGlsZEluZGV4ID0gMDtcblxuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGhhc1Zpc2libGVEZXNjZW5kYW50cyA9IHRoaXMuX3VwZGF0ZU5vZGVBZnRlckZpbHRlckNoYW5nZShjaGlsZCwgdmlzaWJpbGl0eSEsIHJlc3VsdCwgcmV2ZWFsZWQgJiYgIW5vZGUuY29sbGFwc2VkKSB8fCBoYXNWaXNpYmxlRGVzY2VuZGFudHM7XG5cblx0XHRcdFx0aWYgKGNoaWxkLnZpc2libGUpIHtcblx0XHRcdFx0XHRjaGlsZC52aXNpYmxlQ2hpbGRJbmRleCA9IHZpc2libGVDaGlsZEluZGV4Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bm9kZS52aXNpYmxlQ2hpbGRyZW5Db3VudCA9IHZpc2libGVDaGlsZEluZGV4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRub2RlLnZpc2libGVDaGlsZHJlbkNvdW50ID0gMDtcblx0XHR9XG5cblx0XHRpZiAobm9kZSAhPT0gdGhpcy5yb290KSB7XG5cdFx0XHRub2RlLnZpc2libGUgPSB2aXNpYmlsaXR5ISA9PT0gVHJlZVZpc2liaWxpdHkuUmVjdXJzZSA/IGhhc1Zpc2libGVEZXNjZW5kYW50cyA6ICh2aXNpYmlsaXR5ISA9PT0gVHJlZVZpc2liaWxpdHkuVmlzaWJsZSk7XG5cdFx0XHRub2RlLnZpc2liaWxpdHkgPSB2aXNpYmlsaXR5ITtcblx0XHR9XG5cblx0XHRpZiAoIW5vZGUudmlzaWJsZSkge1xuXHRcdFx0bm9kZS5yZW5kZXJOb2RlQ291bnQgPSAwO1xuXG5cdFx0XHRpZiAocmV2ZWFsZWQpIHtcblx0XHRcdFx0cmVzdWx0LnBvcCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIW5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCArPSByZXN1bHQubGVuZ3RoIC0gcmVzdWx0U3RhcnRMZW5ndGg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQuZmlyZShub2RlKTtcblx0XHRyZXR1cm4gbm9kZS52aXNpYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQW5jZXN0b3JzUmVuZGVyTm9kZUNvdW50KG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCwgZGlmZjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGRpZmYgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3aGlsZSAobm9kZSkge1xuXHRcdFx0bm9kZS5yZW5kZXJOb2RlQ291bnQgKz0gZGlmZjtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50LmZpcmUobm9kZSk7XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlsdGVyTm9kZShub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIHBhcmVudFZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5KTogVHJlZVZpc2liaWxpdHkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZmlsdGVyID8gdGhpcy5maWx0ZXIuZmlsdGVyKG5vZGUuZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSkgOiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09ICdib29sZWFuJykge1xuXHRcdFx0bm9kZS5maWx0ZXJEYXRhID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHJlc3VsdCA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0fSBlbHNlIGlmIChpc0ZpbHRlclJlc3VsdDxURmlsdGVyRGF0YT4ocmVzdWx0KSkge1xuXHRcdFx0bm9kZS5maWx0ZXJEYXRhID0gcmVzdWx0LmRhdGE7XG5cdFx0XHRyZXR1cm4gZ2V0VmlzaWJsZVN0YXRlKHJlc3VsdC52aXNpYmlsaXR5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bm9kZS5maWx0ZXJEYXRhID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIGdldFZpc2libGVTdGF0ZShyZXN1bHQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIGNoZWFwXG5cdHByaXZhdGUgaGFzVHJlZU5vZGUobG9jYXRpb246IG51bWJlcltdLCBub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gPSB0aGlzLnJvb3QpOiBib29sZWFuIHtcblx0XHRpZiAoIWxvY2F0aW9uIHx8IGxvY2F0aW9uLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2luZGV4LCAuLi5yZXN0XSA9IGxvY2F0aW9uO1xuXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IG5vZGUuY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaGFzVHJlZU5vZGUocmVzdCwgbm9kZS5jaGlsZHJlbltpbmRleF0pO1xuXHR9XG5cblx0Ly8gY2hlYXBcblx0cHJpdmF0ZSBnZXRUcmVlTm9kZShsb2NhdGlvbjogbnVtYmVyW10sIG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiA9IHRoaXMucm9vdCk6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB7XG5cdFx0aWYgKCFsb2NhdGlvbiB8fCBsb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBub2RlO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtpbmRleCwgLi4ucmVzdF0gPSBsb2NhdGlvbjtcblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPiBub2RlLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdJbnZhbGlkIHRyZWUgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRUcmVlTm9kZShyZXN0LCBub2RlLmNoaWxkcmVuW2luZGV4XSk7XG5cdH1cblxuXHQvLyBleHBlbnNpdmVcblx0cHJpdmF0ZSBnZXRUcmVlTm9kZVdpdGhMaXN0SW5kZXgobG9jYXRpb246IG51bWJlcltdKTogeyBub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT47IGxpc3RJbmRleDogbnVtYmVyOyByZXZlYWxlZDogYm9vbGVhbjsgdmlzaWJsZTogYm9vbGVhbiB9IHtcblx0XHRpZiAobG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBub2RlOiB0aGlzLnJvb3QsIGxpc3RJbmRleDogLTEsIHJldmVhbGVkOiB0cnVlLCB2aXNpYmxlOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcGFyZW50Tm9kZSwgbGlzdEluZGV4LCByZXZlYWxlZCwgdmlzaWJsZSB9ID0gdGhpcy5nZXRQYXJlbnROb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbik7XG5cdFx0Y29uc3QgaW5kZXggPSBsb2NhdGlvbltsb2NhdGlvbi5sZW5ndGggLSAxXTtcblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPiBwYXJlbnROb2RlLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdJbnZhbGlkIHRyZWUgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gcGFyZW50Tm9kZS5jaGlsZHJlbltpbmRleF07XG5cblx0XHRyZXR1cm4geyBub2RlLCBsaXN0SW5kZXgsIHJldmVhbGVkLCB2aXNpYmxlOiB2aXNpYmxlICYmIG5vZGUudmlzaWJsZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQYXJlbnROb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbjogbnVtYmVyW10sIG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiA9IHRoaXMucm9vdCwgbGlzdEluZGV4OiBudW1iZXIgPSAwLCByZXZlYWxlZCA9IHRydWUsIHZpc2libGUgPSB0cnVlKTogeyBwYXJlbnROb2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT47IGxpc3RJbmRleDogbnVtYmVyOyByZXZlYWxlZDogYm9vbGVhbjsgdmlzaWJsZTogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBbaW5kZXgsIC4uLnJlc3RdID0gbG9jYXRpb247XG5cblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID4gbm9kZS5jaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy51c2VyLCAnSW52YWxpZCB0cmVlIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVE9ET0Bqb2FvIHBlcmYhXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbmRleDsgaSsrKSB7XG5cdFx0XHRsaXN0SW5kZXggKz0gbm9kZS5jaGlsZHJlbltpXS5yZW5kZXJOb2RlQ291bnQ7XG5cdFx0fVxuXG5cdFx0cmV2ZWFsZWQgPSByZXZlYWxlZCAmJiAhbm9kZS5jb2xsYXBzZWQ7XG5cdFx0dmlzaWJsZSA9IHZpc2libGUgJiYgbm9kZS52aXNpYmxlO1xuXG5cdFx0aWYgKHJlc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBwYXJlbnROb2RlOiBub2RlLCBsaXN0SW5kZXgsIHJldmVhbGVkLCB2aXNpYmxlIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFyZW50Tm9kZVdpdGhMaXN0SW5kZXgocmVzdCwgbm9kZS5jaGlsZHJlbltpbmRleF0sIGxpc3RJbmRleCArIDEsIHJldmVhbGVkLCB2aXNpYmxlKTtcblx0fVxuXG5cdGdldE5vZGUobG9jYXRpb246IG51bWJlcltdID0gW10pOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbik7XG5cdH1cblxuXHQvLyBUT0RPQGpvYW8gcGVyZiFcblx0Z2V0Tm9kZUxvY2F0aW9uKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBudW1iZXJbXSB7XG5cdFx0Y29uc3QgbG9jYXRpb246IG51bWJlcltdID0gW107XG5cdFx0bGV0IGluZGV4VHJlZU5vZGUgPSBub2RlIGFzIElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjsgLy8gdHlwaW5nIHdvZXNcblxuXHRcdHdoaWxlIChpbmRleFRyZWVOb2RlLnBhcmVudCkge1xuXHRcdFx0bG9jYXRpb24ucHVzaChpbmRleFRyZWVOb2RlLnBhcmVudC5jaGlsZHJlbi5pbmRleE9mKGluZGV4VHJlZU5vZGUpKTtcblx0XHRcdGluZGV4VHJlZU5vZGUgPSBpbmRleFRyZWVOb2RlLnBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbG9jYXRpb24ucmV2ZXJzZSgpO1xuXHR9XG5cblx0Z2V0UGFyZW50Tm9kZUxvY2F0aW9uKGxvY2F0aW9uOiBudW1iZXJbXSk6IG51bWJlcltdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAobG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAobG9jYXRpb24ubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0YWlsKGxvY2F0aW9uKVswXTtcblx0XHR9XG5cdH1cblxuXHRnZXRGaXJzdEVsZW1lbnRDaGlsZChsb2NhdGlvbjogbnVtYmVyW10pOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbik7XG5cblx0XHRpZiAobm9kZS5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vZGUuY2hpbGRyZW5bMF0uZWxlbWVudDtcblx0fVxuXG5cdGdldExhc3RFbGVtZW50QW5jZXN0b3IobG9jYXRpb246IG51bWJlcltdID0gW10pOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbik7XG5cblx0XHRpZiAobm9kZS5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dldExhc3RFbGVtZW50QW5jZXN0b3Iobm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYXN0RWxlbWVudEFuY2VzdG9yKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBUIHtcblx0XHRpZiAobm9kZS5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBub2RlLmVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dldExhc3RFbGVtZW50QW5jZXN0b3Iobm9kZS5jaGlsZHJlbltub2RlLmNoaWxkcmVuLmxlbmd0aCAtIDFdKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBeUosV0FBVyxzQkFBc0I7QUFDMUwsU0FBUyxRQUFRLFlBQVk7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQWdCLHFCQUFxQjtBQUM5QyxTQUFTLGdCQUFnQjtBQWlCbEIsU0FBUyxlQUFrQixLQUErQztBQUNoRixTQUFPLENBQUMsQ0FBQyxPQUFrQyxJQUFLLGVBQWU7QUFDaEU7QUFFTyxTQUFTLGdCQUFnQixZQUFzRDtBQUNyRixVQUFRLFlBQVk7QUFBQSxJQUNuQixLQUFLO0FBQU0sYUFBTyxlQUFlO0FBQUEsSUFDakMsS0FBSztBQUFPLGFBQU8sZUFBZTtBQUFBLElBQ2xDO0FBQVMsYUFBTztBQUFBLEVBQ2pCO0FBQ0Q7QUFnREEsU0FBUyx5QkFBeUIsUUFBK0Q7QUFDaEcsU0FBTyxpQkFBaUI7QUFDekI7QUFFTyxNQUFNLGVBQTBIO0FBQUEsRUEwQnRJLFlBQ1MsTUFDUixhQUNBLFVBQWtELENBQUMsR0FDbEQ7QUFITztBQXpCVCxTQUFTLFVBQVUsQ0FBQztBQUdwQixTQUFRLGdCQUFnQixJQUFJLGNBQWM7QUFFMUMsU0FBaUIsb0JBQW9CLElBQUksUUFBK0M7QUFDeEYsU0FBUyxtQkFBbUIsS0FBSyxrQkFBa0I7QUFFbkQsU0FBaUIsNEJBQTRCLElBQUksUUFBNkM7QUFDOUYsU0FBUywyQkFBMkIsS0FBSywwQkFBMEI7QUFFbkUsU0FBaUIsNEJBQTRCLElBQUksUUFBbUQ7QUFDcEcsU0FBUywyQkFBNkUsS0FBSyxjQUFjLFVBQVUsS0FBSywwQkFBMEIsS0FBSztBQUV2SixTQUFpQiw4QkFBOEIsSUFBSSxRQUFtQztBQUN0RixTQUFTLDZCQUErRCxLQUFLLGNB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
