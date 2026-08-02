import { getVisibleState, isFilterResult } from "./indexTreeModel.js";
import { ObjectTreeModel } from "./objectTreeModel.js";
import { TreeError, WeakMapper } from "./tree.js";
import { equals } from "../../../common/arrays.js";
import { Event } from "../../../common/event.js";
import { Iterable } from "../../../common/iterator.js";
function noCompress(element) {
  const elements = [element.element];
  const incompressible = element.incompressible || false;
  return {
    element: { elements, incompressible },
    children: Iterable.map(Iterable.from(element.children), noCompress),
    collapsible: element.collapsible,
    collapsed: element.collapsed
  };
}
function compress(element) {
  const elements = [element.element];
  const incompressible = element.incompressible || false;
  let childrenIterator;
  let children;
  while (true) {
    [children, childrenIterator] = Iterable.consume(Iterable.from(element.children), 2);
    if (children.length !== 1) {
      break;
    }
    if (children[0].incompressible) {
      break;
    }
    element = children[0];
    elements.push(element.element);
  }
  return {
    element: { elements, incompressible },
    children: Iterable.map(Iterable.concat(children, childrenIterator), compress),
    collapsible: element.collapsible,
    collapsed: element.collapsed
  };
}
function _decompress(element, index = 0) {
  let children;
  if (index < element.element.elements.length - 1) {
    children = [_decompress(element, index + 1)];
  } else {
    children = Iterable.map(Iterable.from(element.children), (el) => _decompress(el, 0));
  }
  if (index === 0 && element.element.incompressible) {
    return {
      element: element.element.elements[index],
      children,
      incompressible: true,
      collapsible: element.collapsible,
      collapsed: element.collapsed
    };
  }
  return {
    element: element.element.elements[index],
    children,
    collapsible: element.collapsible,
    collapsed: element.collapsed
  };
}
function decompress(element) {
  return _decompress(element, 0);
}
function splice(treeElement, element, children) {
  if (treeElement.element === element) {
    return { ...treeElement, children };
  }
  return { ...treeElement, children: Iterable.map(Iterable.from(treeElement.children), (e) => splice(e, element, children)) };
}
const wrapIdentityProvider = (base) => ({
  getId(node) {
    return node.elements.map((e) => base.getId(e).toString()).join("\0");
  },
  getGroupId: base.getGroupId ? (node) => {
    return base.getGroupId(node.elements[node.elements.length - 1]);
  } : void 0
});
class CompressedObjectTreeModel {
  constructor(user, options = {}) {
    this.user = user;
    this.rootRef = null;
    this.nodes = /* @__PURE__ */ new Map();
    this.model = new ObjectTreeModel(user, options);
    this.enabled = typeof options.compressionEnabled === "undefined" ? true : options.compressionEnabled;
    this.identityProvider = options.identityProvider;
  }
  get onDidSpliceRenderedNodes() {
    return this.model.onDidSpliceRenderedNodes;
  }
  get onDidSpliceModel() {
    return this.model.onDidSpliceModel;
  }
  get onDidChangeCollapseState() {
    return this.model.onDidChangeCollapseState;
  }
  get onDidChangeRenderNodeCount() {
    return this.model.onDidChangeRenderNodeCount;
  }
  get size() {
    return this.nodes.size;
  }
  setChildren(element, children = Iterable.empty(), options) {
    const diffIdentityProvider = options.diffIdentityProvider && wrapIdentityProvider(options.diffIdentityProvider);
    if (element === null) {
      const compressedChildren = Iterable.map(children, this.enabled ? compress : noCompress);
      this._setChildren(null, compressedChildren, { diffIdentityProvider, diffDepth: Infinity });
      return;
    }
    const compressedNode = this.nodes.get(element);
    if (!compressedNode) {
      throw new TreeError(this.user, "Unknown compressed tree node");
    }
    const node = this.model.getNode(compressedNode);
    const compressedParentNode = this.model.getParentNodeLocation(compressedNode);
    const parent = this.model.getNode(compressedParentNode);
    const decompressedElement = decompress(node);
    const splicedElement = splice(decompressedElement, element, children);
    const recompressedElement = (this.enabled ? compress : noCompress)(splicedElement);
    const elementComparator = options.diffIdentityProvider ? ((a, b) => options.diffIdentityProvider.getId(a) === options.diffIdentityProvider.getId(b)) : void 0;
    if (equals(recompressedElement.element.elements, node.element.elements, elementComparator)) {
      this._setChildren(compressedNode, recompressedElement.children || Iterable.empty(), { diffIdentityProvider, diffDepth: 1 });
      return;
    }
    const parentChildren = parent.children.map((child) => child === node ? recompressedElement : child);
    this._setChildren(parent.element, parentChildren, {
      diffIdentityProvider,
      diffDepth: node.depth - parent.depth
    });
  }
  isCompressionEnabled() {
    return this.enabled;
  }
  setCompressionEnabled(enabled) {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;
    const root = this.model.getNode();
    const rootChildren = root.children;
    const decompressedRootChildren = Iterable.map(rootChildren, decompress);
    const recompressedRootChildren = Iterable.map(decompressedRootChildren, enabled ? compress : noCompress);
    this._setChildren(null, recompressedRootChildren, {
      diffIdentityProvider: this.identityProvider,
      diffDepth: Infinity
    });
  }
  _setChildren(node, children, options) {
    const insertedElements = /* @__PURE__ */ new Set();
    const onDidCreateNode = (node2) => {
      for (const element of node2.element.elements) {
        insertedElements.add(element);
        this.nodes.set(element, node2.element);
      }
    };
    const onDidDeleteNode = (node2) => {
      for (const element of node2.element.elements) {
        if (!insertedElements.has(element)) {
          this.nodes.delete(element);
        }
      }
    };
    this.model.setChildren(node, children, { ...options, onDidCreateNode, onDidDeleteNode });
  }
  has(element) {
    return this.nodes.has(element);
  }
  getListIndex(location) {
    const node = this.getCompressedNode(location);
    return this.model.getListIndex(node);
  }
  getListRenderCount(location) {
    const node = this.getCompressedNode(location);
    return this.model.getListRenderCount(node);
  }
  getNode(location) {
    if (typeof location === "undefined") {
      return this.model.getNode();
    }
    const node = this.getCompressedNode(location);
    return this.model.getNode(node);
  }
  // TODO: review this
  getNodeLocation(node) {
    const compressedNode = this.model.getNodeLocation(node);
    if (compressedNode === null) {
      return null;
    }
    return compressedNode.elements[compressedNode.elements.length - 1];
  }
  // TODO: review this
  getParentNodeLocation(location) {
    const compressedNode = this.getCompressedNode(location);
    const parentNode = this.model.getParentNodeLocation(compressedNode);
    if (parentNode === null) {
      return null;
    }
    return parentNode.elements[parentNode.elements.length - 1];
  }
  getFirstElementChild(location) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.getFirstElementChild(compressedNode);
  }
  getLastElementAncestor(location) {
    const compressedNode = typeof location === "undefined" ? void 0 : this.getCompressedNode(location);
    return this.model.getLastElementAncestor(compressedNode);
  }
  isCollapsible(location) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.isCollapsible(compressedNode);
  }
  setCollapsible(location, collapsible) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.setCollapsible(compressedNode, collapsible);
  }
  isCollapsed(location) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.isCollapsed(compressedNode);
  }
  setCollapsed(location, collapsed, recursive) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.setCollapsed(compressedNode, collapsed, recursive);
  }
  expandTo(location) {
    const compressedNode = this.getCompressedNode(location);
    this.model.expandTo(compressedNode);
  }
  rerender(location) {
    const compressedNode = this.getCompressedNode(location);
    this.model.rerender(compressedNode);
  }
  refilter() {
    this.model.refilter();
  }
  resort(location = null, recursive = true) {
    const compressedNode = this.getCompressedNode(location);
    this.model.resort(compressedNode, recursive);
  }
  getCompressedNode(element) {
    if (element === null) {
      return null;
    }
    const node = this.nodes.get(element);
    if (!node) {
      throw new TreeError(this.user, `Tree element not found: ${element}`);
    }
    return node;
  }
}
const DefaultElementMapper = (elements) => elements[elements.length - 1];
class CompressedTreeNodeWrapper {
  constructor(unwrapper, node) {
    this.unwrapper = unwrapper;
    this.node = node;
  }
  get element() {
    return this.node.element === null ? null : this.unwrapper(this.node.element);
  }
  get children() {
    return this.node.children.map((node) => new CompressedTreeNodeWrapper(this.unwrapper, node));
  }
  get depth() {
    return this.node.depth;
  }
  get visibleChildrenCount() {
    return this.node.visibleChildrenCount;
  }
  get visibleChildIndex() {
    return this.node.visibleChildIndex;
  }
  get collapsible() {
    return this.node.collapsible;
  }
  get collapsed() {
    return this.node.collapsed;
  }
  get visible() {
    return this.node.visible;
  }
  get filterData() {
    return this.node.filterData;
  }
}
function mapOptions(compressedNodeUnwrapper, options) {
  return {
    ...options,
    identityProvider: options.identityProvider && {
      getId(node) {
        return options.identityProvider.getId(compressedNodeUnwrapper(node));
      },
      getGroupId: options.identityProvider.getGroupId ? (node) => {
        return options.identityProvider.getGroupId(compressedNodeUnwrapper(node));
      } : void 0
    },
    sorter: options.sorter && {
      compare(node, otherNode) {
        return options.sorter.compare(node.elements[0], otherNode.elements[0]);
      }
    },
    filter: options.filter && {
      filter(node, parentVisibility) {
        const elements = node.elements;
        for (let i = 0; i < elements.length - 1; i++) {
          const result = options.filter.filter(elements[i], parentVisibility);
          parentVisibility = getVisibleState(isFilterResult(result) ? result.visibility : result);
        }
        return options.filter.filter(elements[elements.length - 1], parentVisibility);
      }
    }
  };
}
class CompressibleObjectTreeModel {
  constructor(user, options = {}) {
    this.rootRef = null;
    this.elementMapper = options.elementMapper || DefaultElementMapper;
    const compressedNodeUnwrapper = (node) => this.elementMapper(node.elements);
    this.nodeMapper = new WeakMapper((node) => new CompressedTreeNodeWrapper(compressedNodeUnwrapper, node));
    this.model = new CompressedObjectTreeModel(user, mapOptions(compressedNodeUnwrapper, options));
  }
  get onDidSpliceModel() {
    return Event.map(this.model.onDidSpliceModel, ({ insertedNodes, deletedNodes }) => ({
      insertedNodes: insertedNodes.map((node) => this.nodeMapper.map(node)),
      deletedNodes: deletedNodes.map((node) => this.nodeMapper.map(node))
    }));
  }
  get onDidSpliceRenderedNodes() {
    return Event.map(this.model.onDidSpliceRenderedNodes, ({ start, deleteCount, elements }) => ({
      start,
      deleteCount,
      elements: elements.map((node) => this.nodeMapper.map(node))
    }));
  }
  get onDidChangeCollapseState() {
    return Event.map(this.model.onDidChangeCollapseState, ({ node, deep }) => ({
      node: this.nodeMapper.map(node),
      deep
    }));
  }
  get onDidChangeRenderNodeCount() {
    return Event.map(this.model.onDidChangeRenderNodeCount, (node) => this.nodeMapper.map(node));
  }
  setChildren(element, children = Iterable.empty(), options = {}) {
    this.model.setChildren(element, children, options);
  }
  isCompressionEnabled() {
    return this.model.isCompressionEnabled();
  }
  setCompressionEnabled(enabled) {
    this.model.setCompressionEnabled(enabled);
  }
  has(location) {
    return this.model.has(location);
  }
  getListIndex(location) {
    return this.model.getListIndex(location);
  }
  getListRenderCount(location) {
    return this.model.getListRenderCount(location);
  }
  getNode(location) {
    return this.nodeMapper.map(this.model.getNode(location));
  }
  getNodeLocation(node) {
    return node.element;
  }
  getParentNodeLocation(location) {
    return this.model.getParentNodeLocation(location);
  }
  getFirstElementChild(location) {
    const result = this.model.getFirstElementChild(location);
    if (result === null || typeof result === "undefined") {
      return result;
    }
    return this.elementMapper(result.elements);
  }
  getLastElementAncestor(location) {
    const result = this.model.getLastElementAncestor(location);
    if (result === null || typeof result === "undefined") {
      return result;
    }
    return this.elementMapper(result.elements);
  }
  isCollapsible(location) {
    return this.model.isCollapsible(location);
  }
  setCollapsible(location, collapsed) {
    return this.model.setCollapsible(location, collapsed);
  }
  isCollapsed(location) {
    return this.model.isCollapsed(location);
  }
  setCollapsed(location, collapsed, recursive) {
    return this.model.setCollapsed(location, collapsed, recursive);
  }
  expandTo(location) {
    return this.model.expandTo(location);
  }
  rerender(location) {
    return this.model.rerender(location);
  }
  refilter() {
    return this.model.refilter();
  }
  resort(element = null, recursive = true) {
    return this.model.resort(element, recursive);
  }
  getCompressedTreeNode(location = null) {
    return this.model.getNode(location);
  }
}
export {
  CompressedObjectTreeModel,
  CompressibleObjectTreeModel,
  DefaultElementMapper,
  compress,
  decompress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL2NvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlIH0gZnJvbSAnLi4vbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IGdldFZpc2libGVTdGF0ZSwgSUluZGV4VHJlZU1vZGVsU3BsaWNlT3B0aW9ucywgaXNGaWx0ZXJSZXN1bHQgfSBmcm9tICcuL2luZGV4VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElPYmplY3RUcmVlTW9kZWwsIElPYmplY3RUcmVlTW9kZWxPcHRpb25zLCBJT2JqZWN0VHJlZU1vZGVsU2V0Q2hpbGRyZW5PcHRpb25zLCBPYmplY3RUcmVlTW9kZWwgfSBmcm9tICcuL29iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50LCBJT2JqZWN0VHJlZUVsZW1lbnQsIElUcmVlTGlzdFNwbGljZURhdGEsIElUcmVlTW9kZWwsIElUcmVlTW9kZWxTcGxpY2VFdmVudCwgSVRyZWVOb2RlLCBUcmVlRXJyb3IsIFRyZWVGaWx0ZXJSZXN1bHQsIFRyZWVWaXNpYmlsaXR5LCBXZWFrTWFwcGVyIH0gZnJvbSAnLi90cmVlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaXRlcmF0b3IuanMnO1xuXG4vLyBFeHBvcnRlZCBvbmx5IGZvciB0ZXN0IHJlYXNvbnMsIGRvIG5vdCB1c2UgZGlyZWN0bHlcbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPiBleHRlbmRzIElPYmplY3RUcmVlRWxlbWVudDxUPiB7XG5cdHJlYWRvbmx5IGNoaWxkcmVuPzogSXRlcmFibGU8SUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPj47XG5cdHJlYWRvbmx5IGluY29tcHJlc3NpYmxlPzogYm9vbGVhbjtcbn1cblxuLy8gRXhwb3J0ZWQgb25seSBmb3IgdGVzdCByZWFzb25zLCBkbyBub3QgdXNlIGRpcmVjdGx5XG5leHBvcnQgaW50ZXJmYWNlIElDb21wcmVzc2VkVHJlZU5vZGU8VD4ge1xuXHRyZWFkb25seSBlbGVtZW50czogVFtdO1xuXHRyZWFkb25seSBpbmNvbXByZXNzaWJsZTogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gbm9Db21wcmVzczxUPihlbGVtZW50OiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+KTogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+PiB7XG5cdGNvbnN0IGVsZW1lbnRzID0gW2VsZW1lbnQuZWxlbWVudF07XG5cdGNvbnN0IGluY29tcHJlc3NpYmxlID0gZWxlbWVudC5pbmNvbXByZXNzaWJsZSB8fCBmYWxzZTtcblxuXHRyZXR1cm4ge1xuXHRcdGVsZW1lbnQ6IHsgZWxlbWVudHMsIGluY29tcHJlc3NpYmxlIH0sXG5cdFx0Y2hpbGRyZW46IEl0ZXJhYmxlLm1hcChJdGVyYWJsZS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLCBub0NvbXByZXNzKSxcblx0XHRjb2xsYXBzaWJsZTogZWxlbWVudC5jb2xsYXBzaWJsZSxcblx0XHRjb2xsYXBzZWQ6IGVsZW1lbnQuY29sbGFwc2VkXG5cdH07XG59XG5cbi8vIEV4cG9ydGVkIG9ubHkgZm9yIHRlc3QgcmVhc29ucywgZG8gbm90IHVzZSBkaXJlY3RseVxuZXhwb3J0IGZ1bmN0aW9uIGNvbXByZXNzPFQ+KGVsZW1lbnQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PElDb21wcmVzc2VkVHJlZU5vZGU8VD4+IHtcblx0Y29uc3QgZWxlbWVudHMgPSBbZWxlbWVudC5lbGVtZW50XTtcblx0Y29uc3QgaW5jb21wcmVzc2libGUgPSBlbGVtZW50LmluY29tcHJlc3NpYmxlIHx8IGZhbHNlO1xuXG5cdGxldCBjaGlsZHJlbkl0ZXJhdG9yOiBJdGVyYWJsZTxJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+Pjtcblx0bGV0IGNoaWxkcmVuOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+W107XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRbY2hpbGRyZW4sIGNoaWxkcmVuSXRlcmF0b3JdID0gSXRlcmFibGUuY29uc3VtZShJdGVyYWJsZS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLCAyKTtcblxuXHRcdGlmIChjaGlsZHJlbi5sZW5ndGggIT09IDEpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChjaGlsZHJlblswXS5pbmNvbXByZXNzaWJsZSkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0ZWxlbWVudCA9IGNoaWxkcmVuWzBdO1xuXHRcdGVsZW1lbnRzLnB1c2goZWxlbWVudC5lbGVtZW50KTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogeyBlbGVtZW50cywgaW5jb21wcmVzc2libGUgfSxcblx0XHRjaGlsZHJlbjogSXRlcmFibGUubWFwKEl0ZXJhYmxlLmNvbmNhdChjaGlsZHJlbiwgY2hpbGRyZW5JdGVyYXRvciksIGNvbXByZXNzKSxcblx0XHRjb2xsYXBzaWJsZTogZWxlbWVudC5jb2xsYXBzaWJsZSxcblx0XHRjb2xsYXBzZWQ6IGVsZW1lbnQuY29sbGFwc2VkXG5cdH07XG59XG5cbmZ1bmN0aW9uIF9kZWNvbXByZXNzPFQ+KGVsZW1lbnQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxUPj4sIGluZGV4ID0gMCk6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4ge1xuXHRsZXQgY2hpbGRyZW46IEl0ZXJhYmxlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4+O1xuXG5cdGlmIChpbmRleCA8IGVsZW1lbnQuZWxlbWVudC5lbGVtZW50cy5sZW5ndGggLSAxKSB7XG5cdFx0Y2hpbGRyZW4gPSBbX2RlY29tcHJlc3MoZWxlbWVudCwgaW5kZXggKyAxKV07XG5cdH0gZWxzZSB7XG5cdFx0Y2hpbGRyZW4gPSBJdGVyYWJsZS5tYXAoSXRlcmFibGUuZnJvbShlbGVtZW50LmNoaWxkcmVuKSwgZWwgPT4gX2RlY29tcHJlc3MoZWwsIDApKTtcblx0fVxuXG5cdGlmIChpbmRleCA9PT0gMCAmJiBlbGVtZW50LmVsZW1lbnQuaW5jb21wcmVzc2libGUpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogZWxlbWVudC5lbGVtZW50LmVsZW1lbnRzW2luZGV4XSxcblx0XHRcdGNoaWxkcmVuLFxuXHRcdFx0aW5jb21wcmVzc2libGU6IHRydWUsXG5cdFx0XHRjb2xsYXBzaWJsZTogZWxlbWVudC5jb2xsYXBzaWJsZSxcblx0XHRcdGNvbGxhcHNlZDogZWxlbWVudC5jb2xsYXBzZWRcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRlbGVtZW50OiBlbGVtZW50LmVsZW1lbnQuZWxlbWVudHNbaW5kZXhdLFxuXHRcdGNoaWxkcmVuLFxuXHRcdGNvbGxhcHNpYmxlOiBlbGVtZW50LmNvbGxhcHNpYmxlLFxuXHRcdGNvbGxhcHNlZDogZWxlbWVudC5jb2xsYXBzZWRcblx0fTtcbn1cblxuLy8gRXhwb3J0ZWQgb25seSBmb3IgdGVzdCByZWFzb25zLCBkbyBub3QgdXNlIGRpcmVjdGx5XG5leHBvcnQgZnVuY3Rpb24gZGVjb21wcmVzczxUPihlbGVtZW50OiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PElDb21wcmVzc2VkVHJlZU5vZGU8VD4+KTogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPiB7XG5cdHJldHVybiBfZGVjb21wcmVzcyhlbGVtZW50LCAwKTtcbn1cblxuZnVuY3Rpb24gc3BsaWNlPFQ+KHRyZWVFbGVtZW50OiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+LCBlbGVtZW50OiBULCBjaGlsZHJlbjogSXRlcmFibGU8SUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPj4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+IHtcblx0aWYgKHRyZWVFbGVtZW50LmVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRyZXR1cm4geyAuLi50cmVlRWxlbWVudCwgY2hpbGRyZW4gfTtcblx0fVxuXG5cdHJldHVybiB7IC4uLnRyZWVFbGVtZW50LCBjaGlsZHJlbjogSXRlcmFibGUubWFwKEl0ZXJhYmxlLmZyb20odHJlZUVsZW1lbnQuY2hpbGRyZW4pLCBlID0+IHNwbGljZShlLCBlbGVtZW50LCBjaGlsZHJlbikpIH07XG59XG5cbmludGVyZmFjZSBJQ29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbE9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IGV4dGVuZHMgSU9iamVjdFRyZWVNb2RlbE9wdGlvbnM8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+IHtcblx0cmVhZG9ubHkgY29tcHJlc3Npb25FbmFibGVkPzogYm9vbGVhbjtcbn1cblxuY29uc3Qgd3JhcElkZW50aXR5UHJvdmlkZXIgPSA8VD4oYmFzZTogSUlkZW50aXR5UHJvdmlkZXI8VD4pOiBJSWRlbnRpdHlQcm92aWRlcjxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+PiA9PiAoe1xuXHRnZXRJZChub2RlKSB7XG5cdFx0cmV0dXJuIG5vZGUuZWxlbWVudHMubWFwKGUgPT4gYmFzZS5nZXRJZChlKS50b1N0cmluZygpKS5qb2luKCdcXDAnKTtcblx0fSxcblx0Z2V0R3JvdXBJZDogYmFzZS5nZXRHcm91cElkID8gKG5vZGU6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4pOiBudW1iZXIgfCBOb3RTZWxlY3RhYmxlR3JvdXBJZFR5cGUgPT4ge1xuXHRcdHJldHVybiBiYXNlLmdldEdyb3VwSWQhKG5vZGUuZWxlbWVudHNbbm9kZS5lbGVtZW50cy5sZW5ndGggLSAxXSk7XG5cdH0gOiB1bmRlZmluZWRcbn0pO1xuXG4vLyBFeHBvcnRlZCBvbmx5IGZvciB0ZXN0IHJlYXNvbnMsIGRvIG5vdCB1c2UgZGlyZWN0bHlcbmV4cG9ydCBjbGFzcyBDb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gaW1wbGVtZW50cyBJVHJlZU1vZGVsPElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsLCBURmlsdGVyRGF0YSwgVCB8IG51bGw+IHtcblxuXHRyZWFkb25seSByb290UmVmID0gbnVsbDtcblxuXHRnZXQgb25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzKCk6IEV2ZW50PElUcmVlTGlzdFNwbGljZURhdGE8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwsIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5tb2RlbC5vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXM7IH1cblx0Z2V0IG9uRGlkU3BsaWNlTW9kZWwoKTogRXZlbnQ8SVRyZWVNb2RlbFNwbGljZUV2ZW50PElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsLCBURmlsdGVyRGF0YT4+IHsgcmV0dXJuIHRoaXMubW9kZWwub25EaWRTcGxpY2VNb2RlbDsgfVxuXHRnZXQgb25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKCk6IEV2ZW50PElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+PiB7IHJldHVybiB0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZTsgfVxuXHRnZXQgb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQoKTogRXZlbnQ8SVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5tb2RlbC5vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudDsgfVxuXG5cdHByaXZhdGUgbW9kZWw6IE9iamVjdFRyZWVNb2RlbDxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT47XG5cdHByaXZhdGUgbm9kZXMgPSBuZXcgTWFwPFQgfCBudWxsLCBJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+PigpO1xuXHRwcml2YXRlIGVuYWJsZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgaWRlbnRpdHlQcm92aWRlcj86IElJZGVudGl0eVByb3ZpZGVyPElDb21wcmVzc2VkVHJlZU5vZGU8VD4+O1xuXG5cdGdldCBzaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGVzLnNpemU7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHVzZXI6IHN0cmluZyxcblx0XHRvcHRpb25zOiBJQ29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbE9wdGlvbnM8VCwgVEZpbHRlckRhdGE+ID0ge31cblx0KSB7XG5cdFx0dGhpcy5tb2RlbCA9IG5ldyBPYmplY3RUcmVlTW9kZWwodXNlciwgb3B0aW9ucyk7XG5cdFx0dGhpcy5lbmFibGVkID0gdHlwZW9mIG9wdGlvbnMuY29tcHJlc3Npb25FbmFibGVkID09PSAndW5kZWZpbmVkJyA/IHRydWUgOiBvcHRpb25zLmNvbXByZXNzaW9uRW5hYmxlZDtcblx0XHR0aGlzLmlkZW50aXR5UHJvdmlkZXIgPSBvcHRpb25zLmlkZW50aXR5UHJvdmlkZXI7XG5cdH1cblxuXHRzZXRDaGlsZHJlbihcblx0XHRlbGVtZW50OiBUIHwgbnVsbCxcblx0XHRjaGlsZHJlbjogSXRlcmFibGU8SUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPj4gPSBJdGVyYWJsZS5lbXB0eSgpLFxuXHRcdG9wdGlvbnM6IElPYmplY3RUcmVlTW9kZWxTZXRDaGlsZHJlbk9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHQpOiB2b2lkIHtcblx0XHQvLyBEaWZmcyBtdXN0IGJlIGRlZXAsIHNpbmNlIHRoZSBjb21wcmVzc2lvbiBjYW4gYWZmZWN0IG5lc3RlZCBlbGVtZW50cy5cblx0XHQvLyBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTE0MjM3I2lzc3VlY29tbWVudC03NTk0MjUwMzRcblxuXHRcdGNvbnN0IGRpZmZJZGVudGl0eVByb3ZpZGVyID0gb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciAmJiB3cmFwSWRlbnRpdHlQcm92aWRlcihvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyKTtcblx0XHRpZiAoZWxlbWVudCA9PT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgY29tcHJlc3NlZENoaWxkcmVuID0gSXRlcmFibGUubWFwKGNoaWxkcmVuLCB0aGlzLmVuYWJsZWQgPyBjb21wcmVzcyA6IG5vQ29tcHJlc3MpO1xuXHRcdFx0dGhpcy5fc2V0Q2hpbGRyZW4obnVsbCwgY29tcHJlc3NlZENoaWxkcmVuLCB7IGRpZmZJZGVudGl0eVByb3ZpZGVyLCBkaWZmRGVwdGg6IEluZmluaXR5IH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy5ub2Rlcy5nZXQoZWxlbWVudCk7XG5cblx0XHRpZiAoIWNvbXByZXNzZWROb2RlKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ1Vua25vd24gY29tcHJlc3NlZCB0cmVlIG5vZGUnKTtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy5tb2RlbC5nZXROb2RlKGNvbXByZXNzZWROb2RlKSBhcyBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+O1xuXHRcdGNvbnN0IGNvbXByZXNzZWRQYXJlbnROb2RlID0gdGhpcy5tb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24oY29tcHJlc3NlZE5vZGUpO1xuXHRcdGNvbnN0IHBhcmVudCA9IHRoaXMubW9kZWwuZ2V0Tm9kZShjb21wcmVzc2VkUGFyZW50Tm9kZSkgYXMgSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPjtcblxuXHRcdGNvbnN0IGRlY29tcHJlc3NlZEVsZW1lbnQgPSBkZWNvbXByZXNzKG5vZGUpO1xuXHRcdGNvbnN0IHNwbGljZWRFbGVtZW50ID0gc3BsaWNlKGRlY29tcHJlc3NlZEVsZW1lbnQsIGVsZW1lbnQsIGNoaWxkcmVuKTtcblx0XHRjb25zdCByZWNvbXByZXNzZWRFbGVtZW50ID0gKHRoaXMuZW5hYmxlZCA/IGNvbXByZXNzIDogbm9Db21wcmVzcykoc3BsaWNlZEVsZW1lbnQpO1xuXG5cdFx0Ly8gSWYgdGhlIHJlY29tcHJlc3NlZCBub2RlIGlzIGlkZW50aWNhbCB0byB0aGUgb3JpZ2luYWwsIGp1c3Qgc2V0IGl0cyBjaGlsZHJlbi5cblx0XHQvLyBTYXZlcyB3b3JrIGFuZCBjaHVybiBkaWZmaW5nIHRoZSBwYXJlbnQgZWxlbWVudC5cblx0XHRjb25zdCBlbGVtZW50Q29tcGFyYXRvciA9IG9wdGlvbnMuZGlmZklkZW50aXR5UHJvdmlkZXJcblx0XHRcdD8gKChhOiBULCBiOiBUKSA9PiBvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyIS5nZXRJZChhKSA9PT0gb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoYikpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoZXF1YWxzKHJlY29tcHJlc3NlZEVsZW1lbnQuZWxlbWVudC5lbGVtZW50cywgbm9kZS5lbGVtZW50LmVsZW1lbnRzLCBlbGVtZW50Q29tcGFyYXRvcikpIHtcblx0XHRcdHRoaXMuX3NldENoaWxkcmVuKGNvbXByZXNzZWROb2RlLCByZWNvbXByZXNzZWRFbGVtZW50LmNoaWxkcmVuIHx8IEl0ZXJhYmxlLmVtcHR5KCksIHsgZGlmZklkZW50aXR5UHJvdmlkZXIsIGRpZmZEZXB0aDogMSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnRDaGlsZHJlbiA9IHBhcmVudC5jaGlsZHJlblxuXHRcdFx0Lm1hcChjaGlsZCA9PiBjaGlsZCA9PT0gbm9kZSA/IHJlY29tcHJlc3NlZEVsZW1lbnQgOiBjaGlsZCk7XG5cblx0XHR0aGlzLl9zZXRDaGlsZHJlbihwYXJlbnQuZWxlbWVudCwgcGFyZW50Q2hpbGRyZW4sIHtcblx0XHRcdGRpZmZJZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0ZGlmZkRlcHRoOiBub2RlLmRlcHRoIC0gcGFyZW50LmRlcHRoLFxuXHRcdH0pO1xuXHR9XG5cblx0aXNDb21wcmVzc2lvbkVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZW5hYmxlZDtcblx0fVxuXG5cdHNldENvbXByZXNzaW9uRW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGVuYWJsZWQgPT09IHRoaXMuZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cblx0XHRjb25zdCByb290ID0gdGhpcy5tb2RlbC5nZXROb2RlKCk7XG5cdFx0Y29uc3Qgcm9vdENoaWxkcmVuID0gcm9vdC5jaGlsZHJlbiBhcyBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPj5bXTtcblx0XHRjb25zdCBkZWNvbXByZXNzZWRSb290Q2hpbGRyZW4gPSBJdGVyYWJsZS5tYXAocm9vdENoaWxkcmVuLCBkZWNvbXByZXNzKTtcblx0XHRjb25zdCByZWNvbXByZXNzZWRSb290Q2hpbGRyZW4gPSBJdGVyYWJsZS5tYXAoZGVjb21wcmVzc2VkUm9vdENoaWxkcmVuLCBlbmFibGVkID8gY29tcHJlc3MgOiBub0NvbXByZXNzKTtcblxuXHRcdC8vIGl0IHNob3VsZCBiZSBzYWZlIHRvIGFsd2F5cyB1c2UgZGVlcCBkaWZmIG1vZGUgaGVyZSBpZiBhbiBpZGVudGl0eVxuXHRcdC8vIHByb3ZpZGVyIGlzIGF2YWlsYWJsZSwgc2luY2Ugd2Uga25vdyB0aGUgcmF3IG5vZGVzIGFyZSB1bmNoYW5nZWQuXG5cdFx0dGhpcy5fc2V0Q2hpbGRyZW4obnVsbCwgcmVjb21wcmVzc2VkUm9vdENoaWxkcmVuLCB7XG5cdFx0XHRkaWZmSWRlbnRpdHlQcm92aWRlcjogdGhpcy5pZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0ZGlmZkRlcHRoOiBJbmZpbml0eSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldENoaWxkcmVuKFxuXHRcdG5vZGU6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsLFxuXHRcdGNoaWxkcmVuOiBJdGVyYWJsZTxJT2JqZWN0VHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxUPj4+LFxuXHRcdG9wdGlvbnM6IElJbmRleFRyZWVNb2RlbFNwbGljZU9wdGlvbnM8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+LFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBpbnNlcnRlZEVsZW1lbnRzID0gbmV3IFNldDxUIHwgbnVsbD4oKTtcblx0XHRjb25zdCBvbkRpZENyZWF0ZU5vZGUgPSAobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPikgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIG5vZGUuZWxlbWVudC5lbGVtZW50cykge1xuXHRcdFx0XHRpbnNlcnRlZEVsZW1lbnRzLmFkZChlbGVtZW50KTtcblx0XHRcdFx0dGhpcy5ub2Rlcy5zZXQoZWxlbWVudCwgbm9kZS5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgb25EaWREZWxldGVOb2RlID0gKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT4pID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBub2RlLmVsZW1lbnQuZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKCFpbnNlcnRlZEVsZW1lbnRzLmhhcyhlbGVtZW50KSkge1xuXHRcdFx0XHRcdHRoaXMubm9kZXMuZGVsZXRlKGVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMubW9kZWwuc2V0Q2hpbGRyZW4obm9kZSwgY2hpbGRyZW4sIHsgLi4ub3B0aW9ucywgb25EaWRDcmVhdGVOb2RlLCBvbkRpZERlbGV0ZU5vZGUgfSk7XG5cdH1cblxuXHRoYXMoZWxlbWVudDogVCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcy5oYXMoZWxlbWVudCk7XG5cdH1cblxuXHRnZXRMaXN0SW5kZXgobG9jYXRpb246IFQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KG5vZGUpO1xuXHR9XG5cblx0Z2V0TGlzdFJlbmRlckNvdW50KGxvY2F0aW9uOiBUIHwgbnVsbCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpc3RSZW5kZXJDb3VudChub2RlKTtcblx0fVxuXG5cdGdldE5vZGUobG9jYXRpb24/OiBUIHwgbnVsbCB8IHVuZGVmaW5lZCk6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+IHtcblx0XHRpZiAodHlwZW9mIGxvY2F0aW9uID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0Tm9kZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXROb2RlKG5vZGUpO1xuXHR9XG5cblx0Ly8gVE9ETzogcmV2aWV3IHRoaXNcblx0Z2V0Tm9kZUxvY2F0aW9uKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT4pOiBUIHwgbnVsbCB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblxuXHRcdGlmIChjb21wcmVzc2VkTm9kZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXByZXNzZWROb2RlLmVsZW1lbnRzW2NvbXByZXNzZWROb2RlLmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHR9XG5cblx0Ly8gVE9ETzogcmV2aWV3IHRoaXNcblx0Z2V0UGFyZW50Tm9kZUxvY2F0aW9uKGxvY2F0aW9uOiBUIHwgbnVsbCk6IFQgfCBudWxsIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdGNvbnN0IHBhcmVudE5vZGUgPSB0aGlzLm1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihjb21wcmVzc2VkTm9kZSk7XG5cblx0XHRpZiAocGFyZW50Tm9kZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcmVudE5vZGUuZWxlbWVudHNbcGFyZW50Tm9kZS5lbGVtZW50cy5sZW5ndGggLSAxXTtcblx0fVxuXG5cdGdldEZpcnN0RWxlbWVudENoaWxkKGxvY2F0aW9uOiBUIHwgbnVsbCk6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldEZpcnN0RWxlbWVudENoaWxkKGNvbXByZXNzZWROb2RlKTtcblx0fVxuXG5cdGdldExhc3RFbGVtZW50QW5jZXN0b3IobG9jYXRpb24/OiBUIHwgbnVsbCB8IHVuZGVmaW5lZCk6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHR5cGVvZiBsb2NhdGlvbiA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMYXN0RWxlbWVudEFuY2VzdG9yKGNvbXByZXNzZWROb2RlKTtcblx0fVxuXG5cdGlzQ29sbGFwc2libGUobG9jYXRpb246IFQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0NvbGxhcHNpYmxlKGNvbXByZXNzZWROb2RlKTtcblx0fVxuXG5cdHNldENvbGxhcHNpYmxlKGxvY2F0aW9uOiBUIHwgbnVsbCwgY29sbGFwc2libGU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzaWJsZShjb21wcmVzc2VkTm9kZSwgY29sbGFwc2libGUpO1xuXHR9XG5cblx0aXNDb2xsYXBzZWQobG9jYXRpb246IFQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0NvbGxhcHNlZChjb21wcmVzc2VkTm9kZSk7XG5cdH1cblxuXHRzZXRDb2xsYXBzZWQobG9jYXRpb246IFQgfCBudWxsLCBjb2xsYXBzZWQ/OiBib29sZWFuIHwgdW5kZWZpbmVkLCByZWN1cnNpdmU/OiBib29sZWFuIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQoY29tcHJlc3NlZE5vZGUsIGNvbGxhcHNlZCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGV4cGFuZFRvKGxvY2F0aW9uOiBUIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0dGhpcy5tb2RlbC5leHBhbmRUbyhjb21wcmVzc2VkTm9kZSk7XG5cdH1cblxuXHRyZXJlbmRlcihsb2NhdGlvbjogVCB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHRoaXMubW9kZWwucmVyZW5kZXIoY29tcHJlc3NlZE5vZGUpO1xuXHR9XG5cblx0cmVmaWx0ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5yZWZpbHRlcigpO1xuXHR9XG5cblx0cmVzb3J0KGxvY2F0aW9uOiBUIHwgbnVsbCA9IG51bGwsIHJlY3Vyc2l2ZSA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHRoaXMubW9kZWwucmVzb3J0KGNvbXByZXNzZWROb2RlLCByZWN1cnNpdmUpO1xuXHR9XG5cblx0Z2V0Q29tcHJlc3NlZE5vZGUoZWxlbWVudDogVCB8IG51bGwpOiBJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+IHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLm5vZGVzLmdldChlbGVtZW50KTtcblxuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsIGBUcmVlIGVsZW1lbnQgbm90IGZvdW5kOiAke2VsZW1lbnR9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cbn1cblxuLy8gQ29tcHJlc3NpYmxlIE9iamVjdCBUcmVlXG5cbmV4cG9ydCB0eXBlIEVsZW1lbnRNYXBwZXI8VD4gPSAoZWxlbWVudHM6IFRbXSkgPT4gVDtcbmV4cG9ydCBjb25zdCBEZWZhdWx0RWxlbWVudE1hcHBlcjogRWxlbWVudE1hcHBlcjx1bmtub3duPiA9IGVsZW1lbnRzID0+IGVsZW1lbnRzW2VsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXG5leHBvcnQgdHlwZSBDb21wcmVzc2VkTm9kZVVud3JhcHBlcjxUPiA9IChub2RlOiBJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+KSA9PiBUO1xudHlwZSBDb21wcmVzc2VkTm9kZVdlYWtNYXBwZXI8VCwgVEZpbHRlckRhdGE+ID0gV2Vha01hcHBlcjxJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwsIFRGaWx0ZXJEYXRhPiwgSVRyZWVOb2RlPFQgfCBudWxsLCBURmlsdGVyRGF0YT4+O1xuXG5jbGFzcyBDb21wcmVzc2VkVHJlZU5vZGVXcmFwcGVyPFQsIFRGaWx0ZXJEYXRhPiBpbXBsZW1lbnRzIElUcmVlTm9kZTxUIHwgbnVsbCwgVEZpbHRlckRhdGE+IHtcblxuXHRnZXQgZWxlbWVudCgpOiBUIHwgbnVsbCB7IHJldHVybiB0aGlzLm5vZGUuZWxlbWVudCA9PT0gbnVsbCA/IG51bGwgOiB0aGlzLnVud3JhcHBlcih0aGlzLm5vZGUuZWxlbWVudCk7IH1cblx0Z2V0IGNoaWxkcmVuKCk6IElUcmVlTm9kZTxUIHwgbnVsbCwgVEZpbHRlckRhdGE+W10geyByZXR1cm4gdGhpcy5ub2RlLmNoaWxkcmVuLm1hcChub2RlID0+IG5ldyBDb21wcmVzc2VkVHJlZU5vZGVXcmFwcGVyKHRoaXMudW53cmFwcGVyLCBub2RlKSk7IH1cblx0Z2V0IGRlcHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGUuZGVwdGg7IH1cblx0Z2V0IHZpc2libGVDaGlsZHJlbkNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQ7IH1cblx0Z2V0IHZpc2libGVDaGlsZEluZGV4KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGUudmlzaWJsZUNoaWxkSW5kZXg7IH1cblx0Z2V0IGNvbGxhcHNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5ub2RlLmNvbGxhcHNpYmxlOyB9XG5cdGdldCBjb2xsYXBzZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLm5vZGUuY29sbGFwc2VkOyB9XG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5ub2RlLnZpc2libGU7IH1cblx0Z2V0IGZpbHRlckRhdGEoKTogVEZpbHRlckRhdGEgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5ub2RlLmZpbHRlckRhdGE7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHVud3JhcHBlcjogQ29tcHJlc3NlZE5vZGVVbndyYXBwZXI8VD4sXG5cdFx0cHJpdmF0ZSBub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwsIFRGaWx0ZXJEYXRhPlxuXHQpIHsgfVxufVxuXG5mdW5jdGlvbiBtYXBPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPihjb21wcmVzc2VkTm9kZVVud3JhcHBlcjogQ29tcHJlc3NlZE5vZGVVbndyYXBwZXI8VD4sIG9wdGlvbnM6IElDb21wcmVzc2libGVPYmplY3RUcmVlTW9kZWxPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPik6IElDb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRyZXR1cm4ge1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0aWRlbnRpdHlQcm92aWRlcjogb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyICYmIHtcblx0XHRcdGdldElkKG5vZGU6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4pOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoY29tcHJlc3NlZE5vZGVVbndyYXBwZXIobm9kZSkpO1xuXHRcdFx0fSxcblx0XHRcdGdldEdyb3VwSWQ6IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCA/IChub2RlOiBJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+KTogbnVtYmVyIHwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCEoY29tcHJlc3NlZE5vZGVVbndyYXBwZXIobm9kZSkpO1xuXHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdH0sXG5cdFx0c29ydGVyOiBvcHRpb25zLnNvcnRlciAmJiB7XG5cdFx0XHRjb21wYXJlKG5vZGU6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIG90aGVyTm9kZTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLnNvcnRlciEuY29tcGFyZShub2RlLmVsZW1lbnRzWzBdLCBvdGhlck5vZGUuZWxlbWVudHNbMF0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZmlsdGVyOiBvcHRpb25zLmZpbHRlciAmJiB7XG5cdFx0XHRmaWx0ZXIobm9kZTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PFRGaWx0ZXJEYXRhPiB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnRzID0gbm9kZS5lbGVtZW50cztcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50cy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBvcHRpb25zLmZpbHRlciEuZmlsdGVyKGVsZW1lbnRzW2ldLCBwYXJlbnRWaXNpYmlsaXR5KTtcblx0XHRcdFx0XHRwYXJlbnRWaXNpYmlsaXR5ID0gZ2V0VmlzaWJsZVN0YXRlKGlzRmlsdGVyUmVzdWx0KHJlc3VsdCkgPyByZXN1bHQudmlzaWJpbGl0eSA6IHJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuZmlsdGVyIS5maWx0ZXIoZWxlbWVudHNbZWxlbWVudHMubGVuZ3RoIC0gMV0sIHBhcmVudFZpc2liaWxpdHkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBJT2JqZWN0VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRyZWFkb25seSBjb21wcmVzc2lvbkVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBlbGVtZW50TWFwcGVyPzogRWxlbWVudE1hcHBlcjxUPjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbXByZXNzaWJsZU9iamVjdFRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGltcGxlbWVudHMgSU9iamVjdFRyZWVNb2RlbDxULCBURmlsdGVyRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHJvb3RSZWYgPSBudWxsO1xuXG5cdGdldCBvbkRpZFNwbGljZU1vZGVsKCk6IEV2ZW50PElUcmVlTW9kZWxTcGxpY2VFdmVudDxUIHwgbnVsbCwgVEZpbHRlckRhdGE+PiB7XG5cdFx0cmV0dXJuIEV2ZW50Lm1hcCh0aGlzLm1vZGVsLm9uRGlkU3BsaWNlTW9kZWwsICh7IGluc2VydGVkTm9kZXMsIGRlbGV0ZWROb2RlcyB9KSA9PiAoe1xuXHRcdFx0aW5zZXJ0ZWROb2RlczogaW5zZXJ0ZWROb2Rlcy5tYXAobm9kZSA9PiB0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpKSxcblx0XHRcdGRlbGV0ZWROb2RlczogZGVsZXRlZE5vZGVzLm1hcChub2RlID0+IHRoaXMubm9kZU1hcHBlci5tYXAobm9kZSkpLFxuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBvbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMoKTogRXZlbnQ8SVRyZWVMaXN0U3BsaWNlRGF0YTxUIHwgbnVsbCwgVEZpbHRlckRhdGE+PiB7XG5cdFx0cmV0dXJuIEV2ZW50Lm1hcCh0aGlzLm1vZGVsLm9uRGlkU3BsaWNlUmVuZGVyZWROb2RlcywgKHsgc3RhcnQsIGRlbGV0ZUNvdW50LCBlbGVtZW50cyB9KSA9PiAoe1xuXHRcdFx0c3RhcnQsXG5cdFx0XHRkZWxldGVDb3VudCxcblx0XHRcdGVsZW1lbnRzOiBlbGVtZW50cy5tYXAobm9kZSA9PiB0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpKVxuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoKTogRXZlbnQ8SUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudDxUIHwgbnVsbCwgVEZpbHRlckRhdGE+PiB7XG5cdFx0cmV0dXJuIEV2ZW50Lm1hcCh0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSwgKHsgbm9kZSwgZGVlcCB9KSA9PiAoe1xuXHRcdFx0bm9kZTogdGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKSxcblx0XHRcdGRlZXBcblx0XHR9KSk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQoKTogRXZlbnQ8SVRyZWVOb2RlPFQgfCBudWxsLCBURmlsdGVyRGF0YT4+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMubW9kZWwub25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQsIG5vZGUgPT4gdGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKSk7XG5cdH1cblxuXHRwcml2YXRlIGVsZW1lbnRNYXBwZXI6IEVsZW1lbnRNYXBwZXI8VD47XG5cdHByaXZhdGUgbm9kZU1hcHBlcjogQ29tcHJlc3NlZE5vZGVXZWFrTWFwcGVyPFQsIFRGaWx0ZXJEYXRhPjtcblx0cHJpdmF0ZSBtb2RlbDogQ29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbDxULCBURmlsdGVyRGF0YT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdG9wdGlvbnM6IElDb21wcmVzc2libGVPYmplY3RUcmVlTW9kZWxPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9XG5cdCkge1xuXHRcdHRoaXMuZWxlbWVudE1hcHBlciA9IG9wdGlvbnMuZWxlbWVudE1hcHBlciB8fCAoRGVmYXVsdEVsZW1lbnRNYXBwZXIgYXMgRWxlbWVudE1hcHBlcjxUPik7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGVVbndyYXBwZXI6IENvbXByZXNzZWROb2RlVW53cmFwcGVyPFQ+ID0gbm9kZSA9PiB0aGlzLmVsZW1lbnRNYXBwZXIobm9kZS5lbGVtZW50cyk7XG5cdFx0dGhpcy5ub2RlTWFwcGVyID0gbmV3IFdlYWtNYXBwZXIobm9kZSA9PiBuZXcgQ29tcHJlc3NlZFRyZWVOb2RlV3JhcHBlcihjb21wcmVzc2VkTm9kZVVud3JhcHBlciwgbm9kZSkpO1xuXG5cdFx0dGhpcy5tb2RlbCA9IG5ldyBDb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsKHVzZXIsIG1hcE9wdGlvbnMoY29tcHJlc3NlZE5vZGVVbndyYXBwZXIsIG9wdGlvbnMpKTtcblx0fVxuXG5cdHNldENoaWxkcmVuKFxuXHRcdGVsZW1lbnQ6IFQgfCBudWxsLFxuXHRcdGNoaWxkcmVuOiBJdGVyYWJsZTxJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+PiA9IEl0ZXJhYmxlLmVtcHR5KCksXG5cdFx0b3B0aW9uczogSU9iamVjdFRyZWVNb2RlbFNldENoaWxkcmVuT3B0aW9uczxULCBURmlsdGVyRGF0YT4gPSB7fSxcblx0KTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5zZXRDaGlsZHJlbihlbGVtZW50LCBjaGlsZHJlbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRpc0NvbXByZXNzaW9uRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0NvbXByZXNzaW9uRW5hYmxlZCgpO1xuXHR9XG5cblx0c2V0Q29tcHJlc3Npb25FbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldENvbXByZXNzaW9uRW5hYmxlZChlbmFibGVkKTtcblx0fVxuXG5cdGhhcyhsb2NhdGlvbjogVCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5oYXMobG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0TGlzdEluZGV4KGxvY2F0aW9uOiBUIHwgbnVsbCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KGxvY2F0aW9uKTtcblx0fVxuXG5cdGdldExpc3RSZW5kZXJDb3VudChsb2NhdGlvbjogVCB8IG51bGwpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpc3RSZW5kZXJDb3VudChsb2NhdGlvbik7XG5cdH1cblxuXHRnZXROb2RlKGxvY2F0aW9uPzogVCB8IG51bGwgfCB1bmRlZmluZWQpOiBJVHJlZU5vZGU8VCB8IG51bGwsIFRGaWx0ZXJEYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZU1hcHBlci5tYXAodGhpcy5tb2RlbC5nZXROb2RlKGxvY2F0aW9uKSk7XG5cdH1cblxuXHRnZXROb2RlTG9jYXRpb24obm9kZTogSVRyZWVOb2RlPFQgfCBudWxsLCBURmlsdGVyRGF0YT4pOiBUIHwgbnVsbCB7XG5cdFx0cmV0dXJuIG5vZGUuZWxlbWVudDtcblx0fVxuXG5cdGdldFBhcmVudE5vZGVMb2NhdGlvbihsb2NhdGlvbjogVCB8IG51bGwpOiBUIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0UGFyZW50Tm9kZUxvY2F0aW9uKGxvY2F0aW9uKTtcblx0fVxuXG5cdGdldEZpcnN0RWxlbWVudENoaWxkKGxvY2F0aW9uOiBUIHwgbnVsbCk6IFQgfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1vZGVsLmdldEZpcnN0RWxlbWVudENoaWxkKGxvY2F0aW9uKTtcblxuXHRcdGlmIChyZXN1bHQgPT09IG51bGwgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudE1hcHBlcihyZXN1bHQuZWxlbWVudHMpO1xuXHR9XG5cblx0Z2V0TGFzdEVsZW1lbnRBbmNlc3Rvcihsb2NhdGlvbj86IFQgfCBudWxsIHwgdW5kZWZpbmVkKTogVCB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubW9kZWwuZ2V0TGFzdEVsZW1lbnRBbmNlc3Rvcihsb2NhdGlvbik7XG5cblx0XHRpZiAocmVzdWx0ID09PSBudWxsIHx8IHR5cGVvZiByZXN1bHQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRNYXBwZXIocmVzdWx0LmVsZW1lbnRzKTtcblx0fVxuXG5cdGlzQ29sbGFwc2libGUobG9jYXRpb246IFQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNDb2xsYXBzaWJsZShsb2NhdGlvbik7XG5cdH1cblxuXHRzZXRDb2xsYXBzaWJsZShsb2NhdGlvbjogVCB8IG51bGwsIGNvbGxhcHNlZD86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzaWJsZShsb2NhdGlvbiwgY29sbGFwc2VkKTtcblx0fVxuXG5cdGlzQ29sbGFwc2VkKGxvY2F0aW9uOiBUIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzQ29sbGFwc2VkKGxvY2F0aW9uKTtcblx0fVxuXG5cdHNldENvbGxhcHNlZChsb2NhdGlvbjogVCB8IG51bGwsIGNvbGxhcHNlZD86IGJvb2xlYW4gfCB1bmRlZmluZWQsIHJlY3Vyc2l2ZT86IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIGNvbGxhcHNlZCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGV4cGFuZFRvKGxvY2F0aW9uOiBUIHwgbnVsbCk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmV4cGFuZFRvKGxvY2F0aW9uKTtcblx0fVxuXG5cdHJlcmVuZGVyKGxvY2F0aW9uOiBUIHwgbnVsbCk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnJlcmVuZGVyKGxvY2F0aW9uKTtcblx0fVxuXG5cdHJlZmlsdGVyKCk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnJlZmlsdGVyKCk7XG5cdH1cblxuXHRyZXNvcnQoZWxlbWVudDogVCB8IG51bGwgPSBudWxsLCByZWN1cnNpdmUgPSB0cnVlKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwucmVzb3J0KGVsZW1lbnQsIHJlY3Vyc2l2ZSk7XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkVHJlZU5vZGUobG9jYXRpb246IFQgfCBudWxsID0gbnVsbCk6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5n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O0FBQUEsRUFDeEQ7QUFBQSxFQUVBLGdCQUFnQixNQUFrRDtBQUNqRSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxzQkFBc0IsVUFBOEI7QUFDbkQsV0FBTyxLQUFLLE1BQU0sc0JBQXNCLFFBQVE7QUFBQSxFQUNqRDtBQUFBLEVBRUEscUJBQXFCLFVBQTBDO0FBQzlELFVBQU0sU0FBUyxLQUFLLE1BQU0scUJBQXFCLFFBQVE7QUFFdkQsUUFBSSxXQUFXLFFBQVEsT0FBTyxXQUFXLGFBQWE7QUFDckQsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssY0FBYyxPQUFPLFFBQVE7QUFBQSxFQUMxQztBQUFBLEVBRUEsdUJBQXVCLFVBQXVEO0FBQzdFLFVBQU0sU0FBUyxLQUFLLE1BQU0sdUJBQXVCLFFBQVE7QUFFekQsUUFBSSxXQUFXLFFBQVEsT0FBTyxXQUFXLGFBQWE7QUFDckQsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssY0FBYyxPQUFPLFFBQVE7QUFBQSxFQUMxQztBQUFBLEVBRUEsY0FBYyxVQUE2QjtBQUMxQyxXQUFPLEtBQUssTUFBTSxjQUFjLFFBQVE7QUFBQSxFQUN6QztBQUFBLEVBRUEsZUFBZSxVQUFvQixXQUE4QjtBQUNoRSxXQUFPLEtBQUssTUFBTSxlQUFlLFVBQVUsU0FBUztBQUFBLEVBQ3JEO0FBQUEsRUFFQSxZQUFZLFVBQTZCO0FBQ3hDLFdBQU8sS0FBSyxNQUFNLFlBQVksUUFBUTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxhQUFhLFVBQW9CLFdBQWlDLFdBQTBDO0FBQzNHLFdBQU8sS0FBSyxNQUFNLGFBQWEsVUFBVSxXQUFXLFNBQVM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsU0FBUyxVQUEwQjtBQUNsQyxXQUFPLEtBQUssTUFBTSxTQUFTLFFBQVE7QUFBQSxFQUNwQztBQUFBLEVBRUEsU0FBUyxVQUEwQjtBQUNsQyxXQUFPLEtBQUssTUFBTSxTQUFTLFFBQVE7QUFBQSxFQUNwQztBQUFBLEVBRUEsV0FBaUI7QUFDaEIsV0FBTyxLQUFLLE1BQU0sU0FBUztBQUFBLEVBQzVCO0FBQUEsRUFFQSxPQUFPLFVBQW9CLE1BQU0sWUFBWSxNQUFZO0FBQ3hELFdBQU8sS0FBSyxNQUFNLE9BQU8sU0FBUyxTQUFTO0FBQUEsRUFDNUM7QUFBQSxFQUVBLHNCQUFzQixXQUFxQixNQUE2RDtBQUN2RyxXQUFPLEtBQUssTUFBTSxRQUFRLFFBQVE7QUFBQSxFQUNuQztBQUNEOyIsCiAgIm5hbWVzIjogWyJub2RlIl0KfQo=
