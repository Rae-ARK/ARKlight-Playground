async function webviewPreloads(ctx) {
  const userAgent = navigator.userAgent;
  const isChrome = userAgent.indexOf("Chrome") >= 0;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  function promiseWithResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  let currentOptions = ctx.options;
  const isWorkspaceTrusted = ctx.isWorkspaceTrusted;
  let currentRenderOptions = ctx.renderOptions;
  const settingChange = createEmitter();
  const acquireVsCodeApi = globalThis.acquireVsCodeApi;
  const vscode = acquireVsCodeApi();
  delete globalThis.acquireVsCodeApi;
  const tokenizationStyle = new CSSStyleSheet();
  tokenizationStyle.replaceSync(ctx.style.tokenizationCss);
  const runWhenIdle = typeof requestIdleCallback !== "function" || typeof cancelIdleCallback !== "function" ? (runner) => {
    setTimeout(() => {
      if (disposed) {
        return;
      }
      const end = Date.now() + 15;
      runner(Object.freeze({
        didTimeout: true,
        timeRemaining() {
          return Math.max(0, end - Date.now());
        }
      }));
    });
    let disposed = false;
    return {
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
      }
    };
  } : (runner, timeout) => {
    const handle = requestIdleCallback(runner, typeof timeout === "number" ? { timeout } : void 0);
    let disposed = false;
    return {
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
        cancelIdleCallback(handle);
      }
    };
  };
  function getOutputContainer(event) {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.classList.contains("output")) {
        return {
          id: node.id
        };
      }
    }
    return;
  }
  let lastFocusedOutput = void 0;
  const handleOutputFocusOut = (event) => {
    const outputFocus = event && getOutputContainer(event);
    if (!outputFocus) {
      return;
    }
    lastFocusedOutput = void 0;
    setTimeout(() => {
      if (lastFocusedOutput?.id === outputFocus.id) {
        return;
      }
      postNotebookMessage("outputBlur", outputFocus);
    }, 0);
  };
  const hasActiveEditableElement = (parent, root = document) => {
    const element = root.activeElement;
    return !!(element && parent.contains(element) && (element.matches(":read-write") || element.tagName.toLowerCase() === "select" || element.shadowRoot && hasActiveEditableElement(element.shadowRoot, element.shadowRoot)));
  };
  const checkOutputInputFocus = (e) => {
    lastFocusedOutput = getOutputContainer(e);
    const activeElement = window.document.activeElement;
    if (!activeElement) {
      return;
    }
    const id = lastFocusedOutput?.id;
    if (id && hasActiveEditableElement(activeElement, window.document)) {
      postNotebookMessage("outputInputFocus", { inputFocused: true, id });
      activeElement.addEventListener("blur", () => {
        postNotebookMessage("outputInputFocus", { inputFocused: false, id });
      }, { once: true });
    }
  };
  const handleInnerClick = (event) => {
    if (!event || !event.view || !event.view.document) {
      return;
    }
    const outputFocus = lastFocusedOutput = getOutputContainer(event);
    for (const node of event.composedPath()) {
      if (node instanceof HTMLAnchorElement && node.href) {
        if (node.href.startsWith("blob:")) {
          if (outputFocus) {
            postNotebookMessage("outputFocus", outputFocus);
          }
          handleBlobUrlClick(node.href, node.download);
        } else if (node.href.startsWith("data:")) {
          if (outputFocus) {
            postNotebookMessage("outputFocus", outputFocus);
          }
          handleDataUrl(node.href, node.download);
        } else if (node.getAttribute("href")?.trim().startsWith("#")) {
          if (!node.hash) {
            postNotebookMessage("scroll-to-reveal", { scrollTop: 0 });
            return;
          }
          const targetId = node.hash.substring(1);
          let scrollTarget = event.view.document.getElementById(targetId);
          if (!scrollTarget) {
            for (const preview of event.view.document.querySelectorAll(".preview")) {
              scrollTarget = preview.shadowRoot?.getElementById(targetId);
              if (scrollTarget) {
                break;
              }
            }
          }
          if (scrollTarget) {
            const scrollTop = scrollTarget.getBoundingClientRect().top + event.view.scrollY;
            postNotebookMessage("scroll-to-reveal", { scrollTop });
            return;
          }
        } else {
          const href = node.getAttribute("href");
          if (href) {
            if (href.startsWith("command:") && outputFocus) {
              postNotebookMessage("outputFocus", outputFocus);
            }
            postNotebookMessage("clicked-link", { href });
          }
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (outputFocus) {
      postNotebookMessage("outputFocus", outputFocus);
    }
  };
  const blurOutput = () => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
  };
  const selectOutputContents = (cellOrOutputId) => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const cellOutputContainer = window.document.getElementById(cellOrOutputId);
    if (!cellOutputContainer) {
      return;
    }
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNode(cellOutputContainer);
    selection.addRange(range);
  };
  const selectInputContents = (cellOrOutputId) => {
    const cellOutputContainer = window.document.getElementById(cellOrOutputId);
    if (!cellOutputContainer) {
      return;
    }
    const activeElement = window.document.activeElement;
    if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
      activeElement.select();
    }
  };
  const onPageUpDownSelectionHandler = (e) => {
    if (!lastFocusedOutput?.id || !e.shiftKey) {
      return;
    }
    if (e.shiftKey && (e.code === "ArrowUp" || e.code === "ArrowDown")) {
      e.stopPropagation();
      return;
    }
    if (!(e.code === "PageUp" || e.code === "PageDown") && !(e.metaKey && (e.code === "ArrowDown" || e.code === "ArrowUp"))) {
      return;
    }
    const outputContainer = window.document.getElementById(lastFocusedOutput.id);
    const selection = window.getSelection();
    if (!outputContainer || !selection?.anchorNode) {
      return;
    }
    const activeElement = window.document.activeElement;
    if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const { anchorNode, anchorOffset } = selection;
    const range = document.createRange();
    if (e.code === "PageDown" || e.code === "ArrowDown") {
      range.setStart(anchorNode, anchorOffset);
      range.setEnd(outputContainer, 1);
    } else {
      range.setStart(outputContainer, 0);
      range.setEnd(anchorNode, anchorOffset);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const disableNativeSelectAll = (e) => {
    if (!lastFocusedOutput?.id) {
      return;
    }
    const activeElement = window.document.activeElement;
    if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
      return;
    }
    if (e.key === "a" && e.ctrlKey || e.metaKey && e.key === "a") {
      e.preventDefault();
      return;
    }
  };
  const handleDataUrl = async (data, downloadName) => {
    postNotebookMessage("clicked-data-url", {
      data,
      downloadName
    });
  };
  const handleBlobUrlClick = async (url, downloadName) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        handleDataUrl(reader.result, downloadName);
      });
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e.message);
    }
  };
  window.document.body.addEventListener("click", handleInnerClick);
  window.document.body.addEventListener("focusin", checkOutputInputFocus);
  window.document.body.addEventListener("focusout", handleOutputFocusOut);
  window.document.body.addEventListener("keydown", onPageUpDownSelectionHandler);
  window.document.body.addEventListener("keydown", disableNativeSelectAll);
  function createKernelContext() {
    return Object.freeze({
      onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
      postKernelMessage: (data) => postNotebookMessage("customKernelMessage", { message: data })
    });
  }
  async function runKernelPreload(url) {
    try {
      return await activateModuleKernelPreload(url);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  async function activateModuleKernelPreload(url) {
    const module = await __import(url);
    if (!module.activate) {
      console.error(`Notebook preload '${url}' was expected to be a module but it does not export an 'activate' function`);
      return;
    }
    return module.activate(createKernelContext());
  }
  const dimensionUpdater = new class {
    constructor() {
      this.pending = /* @__PURE__ */ new Map();
    }
    updateHeight(id, height, options) {
      if (!this.pending.size) {
        setTimeout(() => {
          this.updateImmediately();
        }, 0);
      }
      const update = this.pending.get(id);
      if (update && update.isOutput) {
        this.pending.set(id, {
          id,
          height,
          init: update.init,
          isOutput: update.isOutput
        });
      } else {
        this.pending.set(id, {
          id,
          height,
          ...options
        });
      }
    }
    updateImmediately() {
      if (!this.pending.size) {
        return;
      }
      postNotebookMessage("dimension", {
        updates: Array.from(this.pending.values())
      });
      this.pending.clear();
    }
  }();
  function elementHasContent(height) {
    return height > 2.1;
  }
  const resizeObserver = new class {
    constructor() {
      this._observedElements = /* @__PURE__ */ new WeakMap();
      this._observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (!window.document.body.contains(entry.target)) {
            continue;
          }
          const observedElementInfo = this._observedElements.get(entry.target);
          if (!observedElementInfo) {
            continue;
          }
          this.postResizeMessage(observedElementInfo.cellId);
          if (entry.target.id !== observedElementInfo.id) {
            continue;
          }
          if (!entry.contentRect) {
            continue;
          }
          if (!observedElementInfo.output) {
            this.updateHeight(observedElementInfo, entry.target.offsetHeight);
            continue;
          }
          const hasContent = elementHasContent(entry.contentRect.height);
          const shouldUpdatePadding = hasContent && observedElementInfo.lastKnownPadding === 0 || !hasContent && observedElementInfo.lastKnownPadding !== 0;
          if (shouldUpdatePadding) {
            window.requestAnimationFrame(() => {
              if (hasContent) {
                entry.target.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}px`;
              } else {
                entry.target.style.padding = `0px`;
              }
              this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
            });
          } else {
            this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
          }
        }
      });
    }
    updateHeight(observedElementInfo, offsetHeight) {
      if (observedElementInfo.lastKnownHeight !== offsetHeight) {
        observedElementInfo.lastKnownHeight = offsetHeight;
        dimensionUpdater.updateHeight(observedElementInfo.id, offsetHeight, {
          isOutput: observedElementInfo.output
        });
      }
    }
    observe(container, id, output, cellId) {
      if (this._observedElements.has(container)) {
        return;
      }
      this._observedElements.set(container, { id, output, lastKnownPadding: ctx.style.outputNodePadding, lastKnownHeight: -1, cellId });
      this._observer.observe(container);
    }
    postResizeMessage(cellId) {
      clearTimeout(this._outputResizeTimer);
      this._outputResizeTimer = setTimeout(() => {
        postNotebookMessage("outputResized", {
          cellId
        });
      }, 250);
    }
  }();
  let previousDelta;
  let scrollTimeout;
  let scrolledElement;
  let lastTimeScrolled;
  function flagRecentlyScrolled(node, deltaY) {
    scrolledElement = node;
    if (deltaY === void 0) {
      lastTimeScrolled = Date.now();
      previousDelta = void 0;
      node.setAttribute("recentlyScrolled", "true");
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrolledElement?.removeAttribute("recentlyScrolled");
      }, 300);
      return true;
    }
    if (node.hasAttribute("recentlyScrolled")) {
      if (lastTimeScrolled && Date.now() - lastTimeScrolled > 400) {
        if (!!previousDelta && deltaY < 0 && deltaY < previousDelta - 8) {
          clearTimeout(scrollTimeout);
          scrolledElement?.removeAttribute("recentlyScrolled");
          return false;
        } else if (!!previousDelta && deltaY > 0 && deltaY > previousDelta + 8) {
          clearTimeout(scrollTimeout);
          scrolledElement?.removeAttribute("recentlyScrolled");
          return false;
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          scrolledElement?.removeAttribute("recentlyScrolled");
        }, 50);
      } else {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          scrolledElement?.removeAttribute("recentlyScrolled");
        }, 300);
      }
      previousDelta = deltaY;
      return true;
    }
    return false;
  }
  function eventTargetShouldHandleScroll(event) {
    for (let node = event.target; node; node = node.parentNode) {
      if (!(node instanceof Element) || node.id === "container" || node.classList.contains("cell_container") || node.classList.contains("markup") || node.classList.contains("output_container")) {
        return false;
      }
      if (event.deltaY < 0 && node.scrollTop > 0) {
        flagRecentlyScrolled(node);
        return true;
      }
      if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
        if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
          continue;
        }
        if (window.getComputedStyle(node).overflowY === "hidden" || window.getComputedStyle(node).overflowY === "visible") {
          continue;
        }
        flagRecentlyScrolled(node);
        return true;
      }
      if (flagRecentlyScrolled(node, event.deltaY)) {
        return true;
      }
    }
    return false;
  }
  const handleWheel = (event) => {
    if (event.defaultPrevented || eventTargetShouldHandleScroll(event)) {
      return;
    }
    postNotebookMessage("did-scroll-wheel", {
      payload: {
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        // Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
        wheelDelta: event.wheelDelta && isChrome ? event.wheelDelta / window.devicePixelRatio : event.wheelDelta,
        wheelDeltaX: event.wheelDeltaX && isChrome ? event.wheelDeltaX / window.devicePixelRatio : event.wheelDeltaX,
        wheelDeltaY: event.wheelDeltaY && isChrome ? event.wheelDeltaY / window.devicePixelRatio : event.wheelDeltaY,
        detail: event.detail,
        shiftKey: event.shiftKey,
        type: event.type
      }
    });
  };
  function focusFirstFocusableOrContainerInOutput(cellOrOutputId, alternateId) {
    const cellOutputContainer = window.document.getElementById(cellOrOutputId) ?? (!!alternateId ? window.document.getElementById(alternateId) : void 0);
    if (!!cellOutputContainer) {
      if (cellOutputContainer.contains(window.document.activeElement)) {
        return;
      }
      let focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea');
      if (!focusableElement) {
        focusableElement = cellOutputContainer;
        focusableElement.tabIndex = -1;
      }
      if (lastFocusedOutput?.id !== cellOutputContainer.id) {
        lastFocusedOutput = cellOutputContainer;
        postNotebookMessage("outputFocus", { id: cellOutputContainer.id });
      }
      focusableElement.focus();
    }
  }
  function createFocusSink(cellId, focusNext) {
    const element = document.createElement("div");
    element.id = `focus-sink-${cellId}`;
    element.tabIndex = 0;
    element.addEventListener("focus", () => {
      postNotebookMessage("focus-editor", {
        cellId,
        focusNext
      });
    });
    return element;
  }
  function _internalHighlightRange(range, tagName = "mark", attributes = {}) {
    function _textNodesInRange(range2) {
      if (!range2.startContainer.ownerDocument) {
        return [];
      }
      if (range2.startContainer.nodeType === Node.TEXT_NODE && range2.startOffset > 0) {
        const startContainer = range2.startContainer;
        const endOffset = range2.endOffset;
        const createdNode = startContainer.splitText(range2.startOffset);
        if (range2.endContainer === startContainer) {
          range2.setEnd(createdNode, endOffset - range2.startOffset);
        }
        range2.setStart(createdNode, 0);
      }
      if (range2.endContainer.nodeType === Node.TEXT_NODE && range2.endOffset < range2.endContainer.length) {
        range2.endContainer.splitText(range2.endOffset);
      }
      const walker = range2.startContainer.ownerDocument.createTreeWalker(
        range2.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        (node) => range2.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      );
      walker.currentNode = range2.startContainer;
      const nodes2 = [];
      if (walker.currentNode.nodeType === Node.TEXT_NODE) {
        nodes2.push(walker.currentNode);
      }
      while (walker.nextNode() && range2.comparePoint(walker.currentNode, 0) !== 1) {
        if (walker.currentNode.nodeType === Node.TEXT_NODE) {
          nodes2.push(walker.currentNode);
        }
      }
      return nodes2;
    }
    function wrapNodeInHighlight(node, tagName2, attributes2) {
      const highlightElement = node.ownerDocument.createElement(tagName2);
      Object.keys(attributes2).forEach((key) => {
        highlightElement.setAttribute(key, attributes2[key]);
      });
      const tempRange = node.ownerDocument.createRange();
      tempRange.selectNode(node);
      tempRange.surroundContents(highlightElement);
      return highlightElement;
    }
    if (range.collapsed) {
      return {
        remove: () => {
        },
        update: () => {
        }
      };
    }
    const nodes = _textNodesInRange(range);
    const highlightElements = [];
    for (const nodeIdx in nodes) {
      const highlightElement = wrapNodeInHighlight(nodes[nodeIdx], tagName, attributes);
      highlightElements.push(highlightElement);
    }
    function _removeHighlight(highlightElement) {
      if (highlightElement.childNodes.length === 1) {
        highlightElement.replaceWith(highlightElement.firstChild);
      } else {
        while (highlightElement.firstChild) {
          highlightElement.parentNode?.insertBefore(highlightElement.firstChild, highlightElement);
        }
        highlightElement.remove();
      }
    }
    function _removeHighlights() {
      for (const highlightIdx in highlightElements) {
        _removeHighlight(highlightElements[highlightIdx]);
      }
    }
    function _updateHighlight(highlightElement, attributes2 = {}) {
      Object.keys(attributes2).forEach((key) => {
        highlightElement.setAttribute(key, attributes2[key]);
      });
    }
    function updateHighlights(attributes2) {
      for (const highlightIdx in highlightElements) {
        _updateHighlight(highlightElements[highlightIdx], attributes2);
      }
    }
    return {
      remove: _removeHighlights,
      update: updateHighlights
    };
  }
  function selectRange(_range) {
    const sel = window.getSelection();
    if (sel) {
      try {
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(_range.startContainer, _range.startOffset);
        r.setEnd(_range.endContainer, _range.endOffset);
        sel.addRange(r);
      } catch (e) {
        console.log(e);
      }
    }
  }
  function highlightRange(range, useCustom, tagName = "mark", attributes = {}) {
    if (useCustom) {
      const ret = _internalHighlightRange(range, tagName, attributes);
      return {
        range,
        dispose: ret.remove,
        update: (color, className) => {
          if (className === void 0) {
            ret.update({
              "style": `background-color: ${color}`
            });
          } else {
            ret.update({
              "class": className
            });
          }
        }
      };
    } else {
      window.document.execCommand("hiliteColor", false, matchColor);
      const cloneRange = window.getSelection().getRangeAt(0).cloneRange();
      const _range = {
        collapsed: cloneRange.collapsed,
        commonAncestorContainer: cloneRange.commonAncestorContainer,
        endContainer: cloneRange.endContainer,
        endOffset: cloneRange.endOffset,
        startContainer: cloneRange.startContainer,
        startOffset: cloneRange.startOffset
      };
      return {
        range: _range,
        dispose: () => {
          selectRange(_range);
          try {
            document.designMode = "On";
            window.document.execCommand("removeFormat", false, void 0);
            document.designMode = "Off";
            window.getSelection()?.removeAllRanges();
          } catch (e) {
            console.log(e);
          }
        },
        update: (color, className) => {
          selectRange(_range);
          try {
            document.designMode = "On";
            window.document.execCommand("removeFormat", false, void 0);
            window.document.execCommand("hiliteColor", false, color);
            document.designMode = "Off";
            window.getSelection()?.removeAllRanges();
          } catch (e) {
            console.log(e);
          }
        }
      };
    }
  }
  function createEmitter(listenerChange = () => void 0) {
    const listeners = /* @__PURE__ */ new Set();
    return {
      fire(data) {
        for (const listener of [...listeners]) {
          listener.fn.call(listener.thisArg, data);
        }
      },
      event(fn, thisArg, disposables) {
        const listenerObj = { fn, thisArg };
        const disposable = {
          dispose: () => {
            listeners.delete(listenerObj);
            listenerChange(listeners);
          }
        };
        listeners.add(listenerObj);
        listenerChange(listeners);
        if (disposables instanceof Array) {
          disposables.push(disposable);
        } else if (disposables) {
          disposables.add(disposable);
        }
        return disposable;
      }
    };
  }
  function showRenderError(errorText, outputNode, errors) {
    outputNode.innerText = errorText;
    const errList = document.createElement("ul");
    for (const result of errors) {
      console.error(result);
      const item = document.createElement("li");
      item.innerText = result.message;
      errList.appendChild(item);
    }
    outputNode.appendChild(errList);
  }
  const outputItemRequests = new class {
    constructor() {
      this._requestPool = 0;
      this._requests = /* @__PURE__ */ new Map();
    }
    getOutputItem(outputId, mime) {
      const requestId = this._requestPool++;
      const { promise, resolve } = promiseWithResolvers();
      this._requests.set(requestId, { resolve });
      postNotebookMessage("getOutputItem", { requestId, outputId, mime });
      return promise;
    }
    resolveOutputItem(requestId, output) {
      const request = this._requests.get(requestId);
      if (!request) {
        return;
      }
      this._requests.delete(requestId);
      request.resolve(output);
    }
  }();
  let hasWarnedAboutAllOutputItemsProposal = false;
  function createOutputItem(id, mime, metadata, valueBytes, allOutputItemData, appended) {
    function create(id2, mime2, metadata2, valueBytes2, appended2) {
      return Object.freeze({
        id: id2,
        mime: mime2,
        metadata: metadata2,
        appendedText() {
          if (appended2) {
            return textDecoder.decode(appended2.valueBytes);
          }
          return void 0;
        },
        data() {
          return valueBytes2;
        },
        text() {
          return textDecoder.decode(valueBytes2);
        },
        json() {
          return JSON.parse(this.text());
        },
        blob() {
          return new Blob([valueBytes2], { type: this.mime });
        },
        get _allOutputItems() {
          if (!hasWarnedAboutAllOutputItemsProposal) {
            hasWarnedAboutAllOutputItemsProposal = true;
            console.warn(`'_allOutputItems' is proposed API. DO NOT ship an extension that depends on it!`);
          }
          return allOutputItemList;
        }
      });
    }
    const allOutputItemCache = /* @__PURE__ */ new Map();
    const allOutputItemList = Object.freeze(allOutputItemData.map((outputItem) => {
      const mime2 = outputItem.mime;
      return Object.freeze({
        mime: mime2,
        getItem() {
          const existingTask = allOutputItemCache.get(mime2);
          if (existingTask) {
            return existingTask;
          }
          const task = outputItemRequests.getOutputItem(id, mime2).then((item2) => {
            return item2 ? create(id, item2.mime, metadata, item2.valueBytes) : void 0;
          });
          allOutputItemCache.set(mime2, task);
          return task;
        }
      });
    }));
    const item = create(id, mime, metadata, valueBytes, appended);
    allOutputItemCache.set(mime, Promise.resolve(item));
    return item;
  }
  const onDidReceiveKernelMessage = createEmitter();
  const ttPolicy = window.trustedTypes?.createPolicy("notebookRenderer", {
    createHTML: (value) => value,
    // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
    createScript: (value) => value
    // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
  });
  window.addEventListener("wheel", handleWheel);
  const matchColor = window.getComputedStyle(window.document.getElementById("_defaultColorPalatte")).color;
  const currentMatchColor = window.getComputedStyle(window.document.getElementById("_defaultColorPalatte")).backgroundColor;
  class JSHighlighter {
    constructor() {
      this._activeHighlightInfo = /* @__PURE__ */ new Map();
    }
    addHighlights(matches, ownerID) {
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const ret = highlightRange(match.originalRange, true, "mark", match.isShadow ? {
          "style": "background-color: " + matchColor + ";"
        } : {
          "class": "find-match"
        });
        match.highlightResult = ret;
      }
      const highlightInfo = {
        matches,
        currentMatchIndex: -1
      };
      this._activeHighlightInfo.set(ownerID, highlightInfo);
    }
    removeHighlights(ownerID) {
      this._activeHighlightInfo.get(ownerID)?.matches.forEach((match) => {
        match.highlightResult?.dispose();
      });
      this._activeHighlightInfo.delete(ownerID);
    }
    highlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        console.error("Modified current highlight match before adding highlight list.");
        return;
      }
      const oldMatch = highlightInfo.matches[highlightInfo.currentMatchIndex];
      oldMatch?.highlightResult?.update(matchColor, oldMatch.isShadow ? void 0 : "find-match");
      const match = highlightInfo.matches[index];
      highlightInfo.currentMatchIndex = index;
      const sel = window.getSelection();
      if (!!match && !!sel && match.highlightResult) {
        let offset = 0;
        try {
          const outputOffset = window.document.getElementById(match.id).getBoundingClientRect().top;
          const tempRange = document.createRange();
          tempRange.selectNode(match.highlightResult.range.startContainer);
          match.highlightResult.range.startContainer.parentElement?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
          const rangeOffset = tempRange.getBoundingClientRect().top;
          tempRange.detach();
          offset = rangeOffset - outputOffset;
        } catch (e) {
          console.error(e);
        }
        match.highlightResult?.update(currentMatchColor, match.isShadow ? void 0 : "current-find-match");
        window.document.getSelection()?.removeAllRanges();
        postNotebookMessage("didFindHighlightCurrent", {
          offset
        });
      }
    }
    unHighlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        return;
      }
      const oldMatch = highlightInfo.matches[index];
      if (oldMatch && oldMatch.highlightResult) {
        oldMatch.highlightResult.update(matchColor, oldMatch.isShadow ? void 0 : "find-match");
      }
    }
    dispose() {
      window.document.getSelection()?.removeAllRanges();
      this._activeHighlightInfo.forEach((highlightInfo) => {
        highlightInfo.matches.forEach((match) => {
          match.highlightResult?.dispose();
        });
      });
    }
  }
  class CSSHighlighter {
    constructor() {
      this._activeHighlightInfo = /* @__PURE__ */ new Map();
      this._matchesHighlight = new Highlight();
      this._matchesHighlight.priority = 1;
      this._currentMatchesHighlight = new Highlight();
      this._currentMatchesHighlight.priority = 2;
      CSS.highlights?.set(`find-highlight`, this._matchesHighlight);
      CSS.highlights?.set(`current-find-highlight`, this._currentMatchesHighlight);
    }
    _refreshRegistry(updateMatchesHighlight = true) {
      if (updateMatchesHighlight) {
        this._matchesHighlight.clear();
      }
      this._currentMatchesHighlight.clear();
      this._activeHighlightInfo.forEach((highlightInfo) => {
        if (updateMatchesHighlight) {
          for (let i = 0; i < highlightInfo.matches.length; i++) {
            this._matchesHighlight.add(highlightInfo.matches[i].originalRange);
          }
        }
        if (highlightInfo.currentMatchIndex < highlightInfo.matches.length && highlightInfo.currentMatchIndex >= 0) {
          this._currentMatchesHighlight.add(highlightInfo.matches[highlightInfo.currentMatchIndex].originalRange);
        }
      });
    }
    addHighlights(matches, ownerID) {
      for (let i = 0; i < matches.length; i++) {
        this._matchesHighlight.add(matches[i].originalRange);
      }
      const newEntry = {
        matches,
        currentMatchIndex: -1
      };
      this._activeHighlightInfo.set(ownerID, newEntry);
    }
    highlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        console.error("Modified current highlight match before adding highlight list.");
        return;
      }
      highlightInfo.currentMatchIndex = index;
      const match = highlightInfo.matches[index];
      if (match) {
        let offset = 0;
        try {
          const outputOffset = window.document.getElementById(match.id).getBoundingClientRect().top;
          match.originalRange.startContainer.parentElement?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
          const rangeOffset = match.originalRange.getBoundingClientRect().top;
          offset = rangeOffset - outputOffset;
          postNotebookMessage("didFindHighlightCurrent", {
            offset
          });
        } catch (e) {
          console.error(e);
        }
      }
      this._refreshRegistry(false);
    }
    unHighlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        return;
      }
      highlightInfo.currentMatchIndex = -1;
    }
    removeHighlights(ownerID) {
      this._activeHighlightInfo.delete(ownerID);
      this._refreshRegistry();
    }
    dispose() {
      window.document.getSelection()?.removeAllRanges();
      this._currentMatchesHighlight.clear();
      this._matchesHighlight.clear();
    }
  }
  const _highlighter = CSS.highlights ? new CSSHighlighter() : new JSHighlighter();
  function extractSelectionLine(selection) {
    const range = selection.getRangeAt(0);
    const oldRange = range.cloneRange();
    const captureLength = selection.toString().length;
    selection.collapseToStart();
    selection.modify("move", "backward", "lineboundary");
    selection.modify("extend", "forward", "lineboundary");
    const line = selection.toString();
    const rangeStart = getStartOffset(selection.getRangeAt(0), oldRange);
    const lineRange = {
      start: rangeStart,
      end: rangeStart + captureLength
    };
    selection.removeAllRanges();
    selection.addRange(oldRange);
    return { line, range: lineRange };
  }
  function getStartOffset(lineRange, originalRange) {
    const firstCommonAncestor = findFirstCommonAncestor(lineRange.startContainer, originalRange.startContainer);
    const selectionOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, lineRange.startContainer) + lineRange.startOffset;
    const textOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, originalRange.startContainer) + originalRange.startOffset;
    return textOffset - selectionOffset;
  }
  function findFirstCommonAncestor(nodeA, nodeB) {
    const range = new Range();
    range.setStart(nodeA, 0);
    range.setEnd(nodeB, 0);
    return range.commonAncestorContainer;
  }
  function getTextContentLength(node) {
    let length = 0;
    if (node.nodeType === Node.TEXT_NODE) {
      length += node.textContent?.length || 0;
    } else {
      for (const childNode of node.childNodes) {
        length += getTextContentLength(childNode);
      }
    }
    return length;
  }
  function getSelectionOffsetRelativeTo(parentElement, currentNode) {
    if (!currentNode) {
      return 0;
    }
    let offset = 0;
    if (currentNode === parentElement || !parentElement.contains(currentNode)) {
      return offset;
    }
    let prevSibling = currentNode.previousSibling;
    while (prevSibling) {
      offset += getTextContentLength(prevSibling);
      prevSibling = prevSibling.previousSibling;
    }
    return offset + getSelectionOffsetRelativeTo(parentElement, currentNode.parentNode);
  }
  const find = (query, options) => {
    let find2 = true;
    let matches = [];
    const range = document.createRange();
    range.selectNodeContents(window.document.getElementById("findStart"));
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    viewModel.toggleDragDropEnabled(false);
    try {
      document.designMode = "On";
      while (find2 && matches.length < 500) {
        find2 = window.find(
          query,
          /* caseSensitive*/
          !!options.caseSensitive,
          /* backwards*/
          false,
          /* wrapAround*/
          false,
          /* wholeWord */
          !!options.wholeWord,
          /* searchInFrames*/
          true,
          false
        );
        if (find2) {
          const selection = window.getSelection();
          if (!selection) {
            console.log("no selection");
            break;
          }
          if (options.includeMarkup && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1 && selection.getRangeAt(0).startContainer.classList.contains("markup")) {
            const preview = selection.anchorNode?.firstChild;
            const root = preview.shadowRoot;
            const shadowSelection = root?.getSelection ? root?.getSelection() : null;
            if (shadowSelection && shadowSelection.anchorNode) {
              matches.push({
                type: "preview",
                id: preview.id,
                cellId: preview.id,
                container: preview,
                isShadow: true,
                originalRange: shadowSelection.getRangeAt(0),
                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : void 0
              });
            }
          }
          if (options.includeOutput && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1 && selection.getRangeAt(0).startContainer.classList.contains("output_container")) {
            const cellId = selection.getRangeAt(0).startContainer.parentElement.id;
            const outputNode = selection.anchorNode?.firstChild;
            const root = outputNode.shadowRoot;
            const shadowSelection = root?.getSelection ? root?.getSelection() : null;
            if (shadowSelection && shadowSelection.anchorNode) {
              matches.push({
                type: "output",
                id: outputNode.id,
                cellId,
                container: outputNode,
                isShadow: true,
                originalRange: shadowSelection.getRangeAt(0),
                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : void 0
              });
            }
          }
          const anchorNode = selection.anchorNode?.parentElement;
          if (anchorNode) {
            const lastEl = matches.length ? matches[matches.length - 1] : null;
            if (lastEl && lastEl.container.contains(anchorNode) && options.includeOutput) {
              matches.push({
                type: lastEl.type,
                id: lastEl.id,
                cellId: lastEl.cellId,
                container: lastEl.container,
                isShadow: false,
                originalRange: selection.getRangeAt(0),
                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : void 0
              });
            } else {
              for (let node = anchorNode; node; node = node.parentElement) {
                if (!(node instanceof Element)) {
                  break;
                }
                if (node.classList.contains("output") && options.includeOutput) {
                  const cellId = node.parentElement?.parentElement?.id;
                  if (cellId) {
                    matches.push({
                      type: "output",
                      id: node.id,
                      cellId,
                      container: node,
                      isShadow: false,
                      originalRange: selection.getRangeAt(0),
                      searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : void 0
                    });
                  }
                  break;
                }
                if (node.id === "container" || node === window.document.body) {
                  break;
                }
              }
            }
          } else {
            break;
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
    matches = matches.filter((match) => options.findIds.length ? options.findIds.includes(match.cellId) : true);
    _highlighter.addHighlights(matches, options.ownerID);
    window.document.getSelection()?.removeAllRanges();
    viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
    document.designMode = "Off";
    postNotebookMessage("didFind", {
      matches: matches.map((match, index) => ({
        type: match.type,
        id: match.id,
        cellId: match.cellId,
        index,
        searchPreviewInfo: match.searchPreviewInfo
      }))
    });
  };
  const copyOutputImage = async (outputId, altOutputId, textAlternates, retries = 5) => {
    if (!window.document.hasFocus() && retries > 0) {
      setTimeout(() => {
        copyOutputImage(outputId, altOutputId, textAlternates, retries - 1);
      }, 50);
      return;
    }
    try {
      const outputElement = window.document.getElementById(outputId) ?? window.document.getElementById(altOutputId);
      let image = outputElement?.querySelector("img");
      if (!image) {
        const svgImage = outputElement?.querySelector("svg.output-image") ?? outputElement?.querySelector("div.svgContainerStyle > svg");
        if (svgImage) {
          image = new Image();
          image.src = "data:image/svg+xml," + encodeURIComponent(svgImage.outerHTML);
        }
      }
      if (image) {
        const ensureImageLoaded = (img) => {
          return new Promise((resolve, reject) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve(img);
            } else {
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error("Failed to load image"));
              setTimeout(() => reject(new Error("Image load timeout")), 5e3);
            }
          });
        };
        const imageToCopy = await ensureImageLoaded(image);
        const clipboardData = {
          "image/png": new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = imageToCopy.naturalWidth;
            canvas.height = imageToCopy.naturalHeight;
            const context = canvas.getContext("2d");
            context.drawImage(imageToCopy, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                console.error("No blob data to write to clipboard");
              }
              canvas.remove();
            }, "image/png");
          })
        };
        if (textAlternates) {
          for (const alternate of textAlternates) {
            clipboardData[alternate.mimeType] = alternate.content;
          }
        }
        await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
      } else {
        console.error("Could not find image element to copy for output with id", outputId);
      }
    } catch (e) {
      console.error("Could not copy image:", e);
    }
  };
  window.addEventListener("message", async (rawEvent) => {
    const event = rawEvent;
    switch (event.data.type) {
      case "initializeMarkup": {
        try {
          await Promise.all(event.data.cells.map((info) => viewModel.ensureMarkupCell(info)));
        } finally {
          dimensionUpdater.updateImmediately();
          postNotebookMessage("initializedMarkup", { requestId: event.data.requestId });
        }
        break;
      }
      case "createMarkupCell":
        viewModel.ensureMarkupCell(event.data.cell);
        break;
      case "showMarkupCell":
        viewModel.showMarkupCell(event.data.id, event.data.top, event.data.content, event.data.metadata);
        break;
      case "hideMarkupCells":
        for (const id of event.data.ids) {
          viewModel.hideMarkupCell(id);
        }
        break;
      case "unhideMarkupCells":
        for (const id of event.data.ids) {
          viewModel.unhideMarkupCell(id);
        }
        break;
      case "deleteMarkupCell":
        for (const id of event.data.ids) {
          viewModel.deleteMarkupCell(id);
        }
        break;
      case "updateSelectedMarkupCells":
        viewModel.updateSelectedCells(event.data.selectedCellIds);
        break;
      case "html": {
        const data = event.data;
        if (data.createOnIdle) {
          outputRunner.enqueueIdle(data.outputId, (signal) => {
            return viewModel.renderOutputCell(data, signal);
          });
        } else {
          outputRunner.enqueue(data.outputId, (signal) => {
            return viewModel.renderOutputCell(data, signal);
          });
        }
        break;
      }
      case "view-scroll": {
        event.data.widgets.forEach((widget) => {
          outputRunner.enqueue(widget.outputId, () => {
            viewModel.updateOutputsScroll([widget]);
          });
        });
        viewModel.updateMarkupScrolls(event.data.markupCells);
        break;
      }
      case "clear":
        renderers.clearAll();
        viewModel.clearAll();
        window.document.getElementById("container").innerText = "";
        break;
      case "clearOutput": {
        const { cellId, rendererId, outputId } = event.data;
        outputRunner.cancelOutput(outputId);
        viewModel.clearOutput(cellId, outputId, rendererId);
        break;
      }
      case "hideOutput": {
        const { cellId, outputId } = event.data;
        outputRunner.enqueue(outputId, () => {
          viewModel.hideOutput(cellId);
        });
        break;
      }
      case "showOutput": {
        const { outputId, cellTop, cellId, content } = event.data;
        outputRunner.enqueue(outputId, () => {
          viewModel.showOutput(cellId, outputId, cellTop);
          if (content) {
            viewModel.updateAndRerender(cellId, outputId, content);
          }
        });
        break;
      }
      case "copyImage": {
        await copyOutputImage(event.data.outputId, event.data.altOutputId, event.data.textAlternates);
        break;
      }
      case "ack-dimension": {
        for (const { cellId, outputId, height } of event.data.updates) {
          viewModel.updateOutputHeight(cellId, outputId, height);
        }
        break;
      }
      case "preload": {
        const resources = event.data.resources;
        for (const { uri } of resources) {
          kernelPreloads.load(uri);
        }
        break;
      }
      case "updateRenderers": {
        const { rendererData } = event.data;
        renderers.updateRendererData(rendererData);
        break;
      }
      case "focus-output":
        focusFirstFocusableOrContainerInOutput(event.data.cellOrOutputId, event.data.alternateId);
        break;
      case "blur-output":
        blurOutput();
        break;
      case "select-output-contents":
        selectOutputContents(event.data.cellOrOutputId);
        break;
      case "select-input-contents":
        selectInputContents(event.data.cellOrOutputId);
        break;
      case "decorations": {
        let outputContainer = window.document.getElementById(event.data.cellId);
        if (!outputContainer) {
          viewModel.ensureOutputCell(event.data.cellId, -1e5, true);
          outputContainer = window.document.getElementById(event.data.cellId);
        }
        outputContainer?.classList.add(...event.data.addedClassNames);
        outputContainer?.classList.remove(...event.data.removedClassNames);
        break;
      }
      case "markupDecorations": {
        const markupCell = window.document.getElementById(event.data.cellId);
        if (markupCell) {
          markupCell?.classList.add(...event.data.addedClassNames);
          markupCell?.classList.remove(...event.data.removedClassNames);
        }
        break;
      }
      case "customKernelMessage":
        onDidReceiveKernelMessage.fire(event.data.message);
        break;
      case "customRendererMessage":
        renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
        break;
      case "notebookStyles": {
        const documentStyle = window.document.documentElement.style;
        for (let i = documentStyle.length - 1; i >= 0; i--) {
          const property = documentStyle[i];
          if (property && property.startsWith("--notebook-")) {
            documentStyle.removeProperty(property);
          }
        }
        for (const [name, value] of Object.entries(event.data.styles)) {
          documentStyle.setProperty(`--${name}`, value);
        }
        break;
      }
      case "notebookOptions":
        currentOptions = event.data.options;
        viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
        currentRenderOptions = event.data.renderOptions;
        settingChange.fire(currentRenderOptions);
        break;
      case "tokenizedCodeBlock": {
        const { codeBlockId, html } = event.data;
        MarkdownCodeBlock.highlightCodeBlock(codeBlockId, html);
        break;
      }
      case "tokenizedStylesChanged": {
        tokenizationStyle.replaceSync(event.data.css);
        break;
      }
      case "find": {
        _highlighter.removeHighlights(event.data.options.ownerID);
        find(event.data.query, event.data.options);
        break;
      }
      case "findHighlightCurrent": {
        _highlighter?.highlightCurrentMatch(event.data.index, event.data.ownerID);
        break;
      }
      case "findUnHighlightCurrent": {
        _highlighter?.unHighlightCurrentMatch(event.data.index, event.data.ownerID);
        break;
      }
      case "findStop": {
        _highlighter.removeHighlights(event.data.ownerID);
        break;
      }
      case "returnOutputItem": {
        outputItemRequests.resolveOutputItem(event.data.requestId, event.data.output);
      }
    }
  });
  const renderFallbackErrorName = "vscode.fallbackToNextRenderer";
  class Renderer {
    constructor(data) {
      this.data = data;
      this._onMessageEvent = createEmitter();
    }
    receiveMessage(message) {
      this._onMessageEvent.fire(message);
    }
    async renderOutputItem(item, element, signal) {
      try {
        await this.load();
      } catch (e) {
        if (!signal.aborted) {
          showRenderError(`Error loading renderer '${this.data.id}'`, element, e instanceof Error ? [e] : []);
        }
        return;
      }
      if (!this._api) {
        if (!signal.aborted) {
          showRenderError(`Renderer '${this.data.id}' does not implement renderOutputItem`, element, []);
        }
        return;
      }
      try {
        const renderStart = performance.now();
        await this._api.renderOutputItem(item, element, signal);
        this.postDebugMessage("Rendered output item", { id: item.id, duration: `${performance.now() - renderStart}ms` });
      } catch (e) {
        if (signal.aborted) {
          return;
        }
        if (e instanceof Error && e.name === renderFallbackErrorName) {
          throw e;
        }
        showRenderError(`Error rendering output item using '${this.data.id}'`, element, e instanceof Error ? [e] : []);
        this.postDebugMessage("Rendering output item failed", { id: item.id, error: e + "" });
      }
    }
    disposeOutputItem(id) {
      this._api?.disposeOutputItem?.(id);
    }
    createRendererContext() {
      const { id, messaging } = this.data;
      const context = {
        setState: (newState) => vscode.setState({ ...vscode.getState(), [id]: newState }),
        getState: () => {
          const state = vscode.getState();
          return typeof state === "object" && state ? state[id] : void 0;
        },
        getRenderer: async (id2) => {
          const renderer = renderers.getRenderer(id2);
          if (!renderer) {
            return void 0;
          }
          if (renderer._api) {
            return renderer._api;
          }
          return renderer.load();
        },
        workspace: {
          get isTrusted() {
            return isWorkspaceTrusted;
          }
        },
        settings: {
          get lineLimit() {
            return currentRenderOptions.lineLimit;
          },
          get outputScrolling() {
            return currentRenderOptions.outputScrolling;
          },
          get outputWordWrap() {
            return currentRenderOptions.outputWordWrap;
          },
          get linkifyFilePaths() {
            return currentRenderOptions.linkifyFilePaths;
          },
          get minimalError() {
            return currentRenderOptions.minimalError;
          }
        },
        get onDidChangeSettings() {
          return settingChange.event;
        }
      };
      if (messaging) {
        context.onDidReceiveMessage = this._onMessageEvent.event;
        context.postMessage = (message) => postNotebookMessage("customRendererMessage", { rendererId: id, message });
      }
      return Object.freeze(context);
    }
    load() {
      this._loadPromise ??= this._load();
      return this._loadPromise;
    }
    /** Inner function cached in the _loadPromise(). */
    async _load() {
      this.postDebugMessage("Start loading renderer");
      try {
        await kernelPreloads.waitForAllCurrent();
        const importStart = performance.now();
        const module = await __import(this.data.entrypoint.path);
        this.postDebugMessage("Imported renderer", { duration: `${performance.now() - importStart}ms` });
        if (!module) {
          return;
        }
        this._api = await module.activate(this.createRendererContext());
        this.postDebugMessage("Activated renderer", { duration: `${performance.now() - importStart}ms` });
        const dependantRenderers = ctx.rendererData.filter((d) => d.entrypoint.extends === this.data.id);
        if (dependantRenderers.length) {
          this.postDebugMessage("Activating dependant renderers", { dependents: dependantRenderers.map((x) => x.id).join(", ") });
        }
        await Promise.all(dependantRenderers.map(async (d) => {
          const renderer = renderers.getRenderer(d.id);
          if (!renderer) {
            throw new Error(`Could not find extending renderer: ${d.id}`);
          }
          try {
            return await renderer.load();
          } catch (e) {
            console.error(e);
            this.postDebugMessage("Activating dependant renderer failed", { dependent: d.id, error: e + "" });
            return void 0;
          }
        }));
        return this._api;
      } catch (e) {
        this.postDebugMessage("Loading renderer failed");
        throw e;
      }
    }
    postDebugMessage(msg, data) {
      postNotebookMessage("logRendererDebugMessage", {
        message: `[renderer ${this.data.id}] - ${msg}`,
        data
      });
    }
  }
  const kernelPreloads = new class {
    constructor() {
      this.preloads = /* @__PURE__ */ new Map();
    }
    /**
     * Returns a promise that resolves when the given preload is activated.
     */
    waitFor(uri) {
      return this.preloads.get(uri) || Promise.resolve(new Error(`Preload not ready: ${uri}`));
    }
    /**
     * Loads a preload.
     * @param uri URI to load from
     * @param originalUri URI to show in an error message if the preload is invalid.
     */
    load(uri) {
      const promise = Promise.all([
        runKernelPreload(uri),
        this.waitForAllCurrent()
      ]);
      this.preloads.set(uri, promise);
      return promise;
    }
    /**
     * Returns a promise that waits for all currently-registered preloads to
     * activate before resolving.
     */
    waitForAllCurrent() {
      return Promise.all([...this.preloads.values()].map((p) => p.catch((err) => err)));
    }
  }();
  const outputRunner = new class {
    constructor() {
      this.outputs = /* @__PURE__ */ new Map();
      this.pendingOutputCreationRequest = /* @__PURE__ */ new Map();
    }
    /**
     * Pushes the action onto the list of actions for the given output ID,
     * ensuring that it's run in-order.
     */
    enqueue(outputId, action) {
      this.pendingOutputCreationRequest.get(outputId)?.dispose();
      this.pendingOutputCreationRequest.delete(outputId);
      const record = this.outputs.get(outputId);
      if (!record) {
        const controller = new AbortController();
        this.outputs.set(outputId, { abort: controller, queue: new Promise((r) => r(action(controller.signal))) });
      } else {
        record.queue = record.queue.then(async (r) => {
          if (!record.abort.signal.aborted) {
            await action(record.abort.signal);
          }
        });
      }
    }
    enqueueIdle(outputId, action) {
      this.pendingOutputCreationRequest.get(outputId)?.dispose();
      outputRunner.pendingOutputCreationRequest.set(outputId, runWhenIdle(() => {
        outputRunner.enqueue(outputId, action);
        outputRunner.pendingOutputCreationRequest.delete(outputId);
      }));
    }
    /**
     * Cancels the rendering of all outputs.
     */
    cancelAll() {
      this.pendingOutputCreationRequest.forEach((r) => r.dispose());
      this.pendingOutputCreationRequest.clear();
      for (const { abort } of this.outputs.values()) {
        abort.abort();
      }
      this.outputs.clear();
    }
    /**
     * Cancels any ongoing rendering out an output.
     */
    cancelOutput(outputId) {
      this.pendingOutputCreationRequest.get(outputId)?.dispose();
      this.pendingOutputCreationRequest.delete(outputId);
      const output = this.outputs.get(outputId);
      if (output) {
        output.abort.abort();
        this.outputs.delete(outputId);
      }
    }
  }();
  const renderers = new class {
    constructor() {
      this._renderers = /* @__PURE__ */ new Map();
      for (const renderer of ctx.rendererData) {
        this.addRenderer(renderer);
      }
    }
    getRenderer(id) {
      return this._renderers.get(id);
    }
    rendererEqual(a, b) {
      if (a.id !== b.id || a.entrypoint.path !== b.entrypoint.path || a.entrypoint.extends !== b.entrypoint.extends || a.messaging !== b.messaging) {
        return false;
      }
      if (a.mimeTypes.length !== b.mimeTypes.length) {
        return false;
      }
      for (let i = 0; i < a.mimeTypes.length; i++) {
        if (a.mimeTypes[i] !== b.mimeTypes[i]) {
          return false;
        }
      }
      return true;
    }
    updateRendererData(rendererData) {
      const oldKeys = new Set(this._renderers.keys());
      const newKeys = new Set(rendererData.map((d) => d.id));
      for (const renderer of rendererData) {
        const existing = this._renderers.get(renderer.id);
        if (existing && this.rendererEqual(existing.data, renderer)) {
          continue;
        }
        this.addRenderer(renderer);
      }
      for (const key of oldKeys) {
        if (!newKeys.has(key)) {
          this._renderers.delete(key);
        }
      }
    }
    addRenderer(renderer) {
      this._renderers.set(renderer.id, new Renderer(renderer));
    }
    clearAll() {
      outputRunner.cancelAll();
      for (const renderer of this._renderers.values()) {
        renderer.disposeOutputItem();
      }
    }
    clearOutput(rendererId, outputId) {
      outputRunner.cancelOutput(outputId);
      this._renderers.get(rendererId)?.disposeOutputItem(outputId);
    }
    async render(item, preferredRendererId, element, signal) {
      const primaryRenderer = this.findRenderer(preferredRendererId, item);
      if (!primaryRenderer) {
        const errorMessage2 = (window.document.documentElement.style.getPropertyValue("--notebook-cell-renderer-not-found-error") || "").replace("$0", () => item.mime);
        this.showRenderError(item, element, errorMessage2);
        return;
      }
      if (!(await this._doRender(item, element, primaryRenderer, signal)).continue) {
        return;
      }
      for (const additionalItemData of item._allOutputItems) {
        if (additionalItemData.mime === item.mime) {
          continue;
        }
        const additionalItem = await additionalItemData.getItem();
        if (signal.aborted) {
          return;
        }
        if (additionalItem) {
          const renderer = this.findRenderer(void 0, additionalItem);
          if (renderer) {
            if (!(await this._doRender(additionalItem, element, renderer, signal)).continue) {
              return;
            }
          }
        }
      }
      const errorMessage = (window.document.documentElement.style.getPropertyValue("--notebook-cell-renderer-fallbacks-exhausted") || "").replace("$0", () => item.mime);
      this.showRenderError(item, element, errorMessage);
    }
    async _doRender(item, element, renderer, signal) {
      try {
        await renderer.renderOutputItem(item, element, signal);
        return { continue: false };
      } catch (e) {
        if (signal.aborted) {
          return { continue: false };
        }
        if (e instanceof Error && e.name === renderFallbackErrorName) {
          return { continue: true };
        } else {
          throw e;
        }
      }
    }
    findRenderer(preferredRendererId, info) {
      let renderer;
      if (typeof preferredRendererId === "string") {
        renderer = Array.from(this._renderers.values()).find((renderer2) => renderer2.data.id === preferredRendererId);
      } else {
        const renderers2 = Array.from(this._renderers.values()).filter((renderer2) => renderer2.data.mimeTypes.includes(info.mime) && !renderer2.data.entrypoint.extends);
        if (renderers2.length) {
          renderers2.sort((a, b) => +a.data.isBuiltin - +b.data.isBuiltin);
          renderer = renderers2[0];
        }
      }
      return renderer;
    }
    showRenderError(info, element, errorMessage) {
      const errorContainer = document.createElement("div");
      const error = document.createElement("div");
      error.className = "no-renderer-error";
      error.innerText = errorMessage;
      const cellText = document.createElement("div");
      cellText.innerText = info.text();
      errorContainer.appendChild(error);
      errorContainer.appendChild(cellText);
      element.innerText = "";
      element.appendChild(errorContainer);
    }
  }();
  const viewModel = new class ViewModel {
    constructor() {
      this._markupCells = /* @__PURE__ */ new Map();
      this._outputCells = /* @__PURE__ */ new Map();
    }
    clearAll() {
      for (const cell of this._markupCells.values()) {
        cell.dispose();
      }
      this._markupCells.clear();
      for (const output of this._outputCells.values()) {
        output.dispose();
      }
      this._outputCells.clear();
    }
    async createMarkupCell(init, top, visible) {
      const existing = this._markupCells.get(init.cellId);
      if (existing) {
        console.error(`Trying to create markup that already exists: ${init.cellId}`);
        return existing;
      }
      const cell = new MarkupCell(init.cellId, init.mime, init.content, top, init.metadata);
      cell.element.style.visibility = visible ? "" : "hidden";
      this._markupCells.set(init.cellId, cell);
      await cell.ready;
      return cell;
    }
    async ensureMarkupCell(info) {
      let cell = this._markupCells.get(info.cellId);
      if (cell) {
        cell.element.style.visibility = info.visible ? "" : "hidden";
        await cell.updateContentAndRender(info.content, info.metadata);
      } else {
        cell = await this.createMarkupCell(info, info.offset, info.visible);
      }
    }
    deleteMarkupCell(id) {
      const cell = this.getExpectedMarkupCell(id);
      if (cell) {
        cell.remove();
        cell.dispose();
        this._markupCells.delete(id);
      }
    }
    async updateMarkupContent(id, newContent, metadata) {
      const cell = this.getExpectedMarkupCell(id);
      await cell?.updateContentAndRender(newContent, metadata);
    }
    showMarkupCell(id, top, newContent, metadata) {
      const cell = this.getExpectedMarkupCell(id);
      cell?.show(top, newContent, metadata);
    }
    hideMarkupCell(id) {
      const cell = this.getExpectedMarkupCell(id);
      cell?.hide();
    }
    unhideMarkupCell(id) {
      const cell = this.getExpectedMarkupCell(id);
      cell?.unhide();
    }
    getExpectedMarkupCell(id) {
      const cell = this._markupCells.get(id);
      if (!cell) {
        console.log(`Could not find markup cell '${id}'`);
        return void 0;
      }
      return cell;
    }
    updateSelectedCells(selectedCellIds) {
      const selectedCellSet = new Set(selectedCellIds);
      for (const cell of this._markupCells.values()) {
        cell.setSelected(selectedCellSet.has(cell.id));
      }
    }
    toggleDragDropEnabled(dragAndDropEnabled) {
      for (const cell of this._markupCells.values()) {
        cell.toggleDragDropEnabled(dragAndDropEnabled);
      }
    }
    updateMarkupScrolls(markupCells) {
      for (const { id, top } of markupCells) {
        const cell = this._markupCells.get(id);
        if (cell) {
          cell.element.style.top = `${top}px`;
        }
      }
    }
    async renderOutputCell(data, signal) {
      const preloadErrors = await Promise.all(
        data.requiredPreloads.map((p) => kernelPreloads.waitFor(p.uri).then(() => void 0, (err) => err))
      );
      if (signal.aborted) {
        return;
      }
      const cellOutput = this.ensureOutputCell(data.cellId, data.cellTop, false);
      return cellOutput.renderOutputElement(data, preloadErrors, signal);
    }
    ensureOutputCell(cellId, cellTop, skipCellTopUpdateIfExist) {
      let cell = this._outputCells.get(cellId);
      const existed = !!cell;
      if (!cell) {
        cell = new OutputCell(cellId);
        this._outputCells.set(cellId, cell);
      }
      if (existed && skipCellTopUpdateIfExist) {
        return cell;
      }
      cell.element.style.top = cellTop + "px";
      return cell;
    }
    clearOutput(cellId, outputId, rendererId) {
      const cell = this._outputCells.get(cellId);
      cell?.clearOutput(outputId, rendererId);
    }
    showOutput(cellId, outputId, top) {
      const cell = this._outputCells.get(cellId);
      cell?.show(outputId, top);
    }
    updateAndRerender(cellId, outputId, content) {
      const cell = this._outputCells.get(cellId);
      cell?.updateContentAndRerender(outputId, content);
    }
    hideOutput(cellId) {
      const cell = this._outputCells.get(cellId);
      cell?.hide();
    }
    updateOutputHeight(cellId, outputId, height) {
      const cell = this._outputCells.get(cellId);
      cell?.updateOutputHeight(outputId, height);
    }
    updateOutputsScroll(updates) {
      for (const request of updates) {
        const cell = this._outputCells.get(request.cellId);
        cell?.updateScroll(request);
      }
    }
  }();
  const _MarkdownCodeBlock = class _MarkdownCodeBlock {
    static highlightCodeBlock(id, html) {
      const el = _MarkdownCodeBlock.pendingCodeBlocksToHighlight.get(id);
      if (!el) {
        return;
      }
      const trustedHtml = ttPolicy?.createHTML(html) ?? html;
      el.innerHTML = trustedHtml;
      const root = el.getRootNode();
      if (root instanceof ShadowRoot) {
        if (!root.adoptedStyleSheets.includes(tokenizationStyle)) {
          root.adoptedStyleSheets.push(tokenizationStyle);
        }
      }
    }
    static requestHighlightCodeBlock(root) {
      const codeBlocks = [];
      let i = 0;
      for (const el of root.querySelectorAll(".vscode-code-block")) {
        const lang = el.getAttribute("data-vscode-code-block-lang");
        if (el.textContent && lang) {
          const id = `${Date.now()}-${i++}`;
          codeBlocks.push({ value: el.textContent, lang, id });
          _MarkdownCodeBlock.pendingCodeBlocksToHighlight.set(id, el);
        }
      }
      return codeBlocks;
    }
  };
  _MarkdownCodeBlock.pendingCodeBlocksToHighlight = /* @__PURE__ */ new Map();
  let MarkdownCodeBlock = _MarkdownCodeBlock;
  class MarkupCell {
    constructor(id, mime, content, top, metadata) {
      this._isDisposed = false;
      const self = this;
      this.id = id;
      this._content = { value: content, version: 0, metadata };
      const { promise, resolve, reject } = promiseWithResolvers();
      this.ready = promise;
      let cachedData;
      this.outputItem = Object.freeze({
        id,
        mime,
        get metadata() {
          return self._content.metadata;
        },
        text: () => {
          return this._content.value;
        },
        json: () => {
          return void 0;
        },
        data: () => {
          if (cachedData?.version === this._content.version) {
            return cachedData.value;
          }
          const data = textEncoder.encode(this._content.value);
          cachedData = { version: this._content.version, value: data };
          return data;
        },
        blob() {
          return new Blob([this.data()], { type: this.mime });
        },
        _allOutputItems: [{
          mime,
          getItem: async () => this.outputItem
        }]
      });
      const root = window.document.getElementById("container");
      const markupCell = document.createElement("div");
      markupCell.className = "markup";
      markupCell.style.position = "absolute";
      markupCell.style.width = "100%";
      this.element = document.createElement("div");
      this.element.id = this.id;
      this.element.classList.add("preview");
      this.element.style.position = "absolute";
      this.element.style.top = top + "px";
      this.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
      markupCell.appendChild(this.element);
      root.appendChild(markupCell);
      this.addEventListeners();
      this.updateContentAndRender(this._content.value, this._content.metadata).then(() => {
        if (!this._isDisposed) {
          resizeObserver.observe(this.element, this.id, false, this.id);
        }
        resolve();
      }, () => reject());
    }
    dispose() {
      this._isDisposed = true;
      this.renderTaskAbort?.abort();
      this.renderTaskAbort = void 0;
    }
    addEventListeners() {
      this.element.addEventListener("dblclick", () => {
        postNotebookMessage("toggleMarkupPreview", { cellId: this.id });
      });
      this.element.addEventListener("click", (e) => {
        postNotebookMessage("clickMarkupCell", {
          cellId: this.id,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey
        });
      });
      this.element.addEventListener("contextmenu", (e) => {
        postNotebookMessage("contextMenuMarkupCell", {
          cellId: this.id,
          clientX: e.clientX,
          clientY: e.clientY
        });
      });
      this.element.addEventListener("mouseenter", () => {
        postNotebookMessage("mouseEnterMarkupCell", { cellId: this.id });
      });
      this.element.addEventListener("mouseleave", () => {
        postNotebookMessage("mouseLeaveMarkupCell", { cellId: this.id });
      });
      this.element.addEventListener("dragstart", (e) => {
        markupCellDragManager.startDrag(e, this.id);
      });
      this.element.addEventListener("drag", (e) => {
        markupCellDragManager.updateDrag(e, this.id);
      });
      this.element.addEventListener("dragend", (e) => {
        markupCellDragManager.endDrag(e, this.id);
      });
    }
    async updateContentAndRender(newContent, metadata) {
      this._content = { value: newContent, version: this._content.version + 1, metadata };
      this.renderTaskAbort?.abort();
      const controller = new AbortController();
      this.renderTaskAbort = controller;
      try {
        await renderers.render(this.outputItem, void 0, this.element, this.renderTaskAbort.signal);
      } finally {
        if (this.renderTaskAbort === controller) {
          this.renderTaskAbort = void 0;
        }
      }
      const root = this.element.shadowRoot ?? this.element;
      const html = [];
      for (const child of root.children) {
        switch (child.tagName) {
          case "LINK":
          case "SCRIPT":
          case "STYLE":
            break;
          default:
            html.push(child.outerHTML);
            break;
        }
      }
      const codeBlocks = MarkdownCodeBlock.requestHighlightCodeBlock(root);
      postNotebookMessage("renderedMarkup", {
        cellId: this.id,
        html: html.join(""),
        codeBlocks
      });
      dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
        isOutput: false
      });
    }
    show(top, newContent, metadata) {
      this.element.style.visibility = "";
      this.element.style.top = `${top}px`;
      if (typeof newContent === "string" || metadata) {
        this.updateContentAndRender(newContent ?? this._content.value, metadata ?? this._content.metadata);
      } else {
        this.updateMarkupDimensions();
      }
    }
    hide() {
      this.element.style.visibility = "hidden";
    }
    unhide() {
      this.element.style.visibility = "";
      this.updateMarkupDimensions();
    }
    remove() {
      this.element.remove();
    }
    async updateMarkupDimensions() {
      dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
        isOutput: false
      });
    }
    setSelected(selected) {
      this.element.classList.toggle("selected", selected);
    }
    toggleDragDropEnabled(enabled) {
      if (enabled) {
        this.element.classList.add("draggable");
        this.element.setAttribute("draggable", "true");
      } else {
        this.element.classList.remove("draggable");
        this.element.removeAttribute("draggable");
      }
    }
  }
  class OutputCell {
    constructor(cellId) {
      this.outputElements = /* @__PURE__ */ new Map();
      const container = window.document.getElementById("container");
      const upperWrapperElement = createFocusSink(cellId);
      container.appendChild(upperWrapperElement);
      this.element = document.createElement("div");
      this.element.style.position = "absolute";
      this.element.style.outline = "0";
      this.element.id = cellId;
      this.element.classList.add("cell_container");
      container.appendChild(this.element);
      this.element = this.element;
      const lowerWrapperElement = createFocusSink(cellId, true);
      container.appendChild(lowerWrapperElement);
    }
    dispose() {
      for (const output of this.outputElements.values()) {
        output.dispose();
      }
      this.outputElements.clear();
    }
    createOutputElement(data) {
      let outputContainer = this.outputElements.get(data.outputId);
      if (!outputContainer) {
        outputContainer = new OutputContainer(data.outputId);
        this.element.appendChild(outputContainer.element);
        this.outputElements.set(data.outputId, outputContainer);
      }
      return outputContainer.createOutputElement(data.outputId, data.outputOffset, data.left, data.cellId);
    }
    async renderOutputElement(data, preloadErrors, signal) {
      const startTime = Date.now();
      const outputElement = this.createOutputElement(data);
      await outputElement.render(data.content, data.rendererId, preloadErrors, signal);
      outputElement.element.style.visibility = data.initiallyHidden ? "hidden" : "";
      if (!!data.executionId && !!data.rendererId) {
        let outputSize = void 0;
        if (data.content.type === 1) {
          outputSize = data.content.output.valueBytes.length;
        }
        if (outputSize !== void 0 && outputSize > 0 && outputSize < 100 * 1024) {
          postNotebookMessage("notebookPerformanceMessage", {
            cellId: data.cellId,
            executionId: data.executionId,
            duration: Date.now() - startTime,
            rendererId: data.rendererId,
            outputSize
          });
        }
      }
    }
    clearOutput(outputId, rendererId) {
      const output = this.outputElements.get(outputId);
      output?.clear(rendererId);
      output?.dispose();
      this.outputElements.delete(outputId);
    }
    show(outputId, top) {
      const outputContainer = this.outputElements.get(outputId);
      if (!outputContainer) {
        return;
      }
      this.element.style.visibility = "";
      this.element.style.top = `${top}px`;
    }
    hide() {
      this.element.style.visibility = "hidden";
    }
    updateContentAndRerender(outputId, content) {
      this.outputElements.get(outputId)?.updateContentAndRender(content);
    }
    updateOutputHeight(outputId, height) {
      this.outputElements.get(outputId)?.updateHeight(height);
    }
    updateScroll(request) {
      this.element.style.top = `${request.cellTop}px`;
      const outputElement = this.outputElements.get(request.outputId);
      if (outputElement) {
        outputElement.updateScroll(request.outputOffset);
        if (request.forceDisplay && outputElement.outputNode) {
          outputElement.outputNode.element.style.visibility = "";
        }
      }
      if (request.forceDisplay) {
        this.element.style.visibility = "";
      }
    }
  }
  class OutputContainer {
    constructor(outputId) {
      this.outputId = outputId;
      this.element = document.createElement("div");
      this.element.classList.add("output_container");
      this.element.setAttribute("data-vscode-context", JSON.stringify({ "preventDefaultContextMenuItems": true }));
      this.element.style.position = "absolute";
      this.element.style.overflow = "hidden";
    }
    get outputNode() {
      return this._outputNode;
    }
    dispose() {
      this._outputNode?.dispose();
    }
    clear(rendererId) {
      if (rendererId) {
        renderers.clearOutput(rendererId, this.outputId);
      }
      this.element.remove();
    }
    updateHeight(height) {
      this.element.style.maxHeight = `${height}px`;
      this.element.style.height = `${height}px`;
    }
    updateScroll(outputOffset) {
      this.element.style.top = `${outputOffset}px`;
    }
    createOutputElement(outputId, outputOffset, left, cellId) {
      this.element.innerText = "";
      this.element.style.maxHeight = "0px";
      this.element.style.top = `${outputOffset}px`;
      this._outputNode?.dispose();
      this._outputNode = new OutputElement(outputId, left, cellId);
      this.element.appendChild(this._outputNode.element);
      return this._outputNode;
    }
    updateContentAndRender(content) {
      this._outputNode?.updateAndRerender(content);
    }
  }
  vscode.postMessage({
    __vscode_notebook_message: true,
    type: "initialized"
  });
  for (const preload of ctx.staticPreloadsData) {
    kernelPreloads.load(preload.entrypoint);
  }
  function postNotebookMessage(type, properties) {
    vscode.postMessage({
      __vscode_notebook_message: true,
      type,
      ...properties
    });
  }
  class OutputElement {
    constructor(outputId, left, cellId) {
      this.outputId = outputId;
      this.cellId = cellId;
      this.hasResizeObserver = false;
      this.isImageOutput = false;
      this.element = document.createElement("div");
      this.element.id = outputId;
      this.element.classList.add("output");
      this.element.style.position = "absolute";
      this.element.style.top = `0px`;
      this.element.style.left = left + "px";
      this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
      this.element.addEventListener("mouseenter", () => {
        postNotebookMessage("mouseenter", { id: outputId });
      });
      this.element.addEventListener("mouseleave", () => {
        postNotebookMessage("mouseleave", { id: outputId });
      });
      this.element.addEventListener("dragstart", (e) => {
        if (!e.dataTransfer) {
          return;
        }
        const outputData = {
          outputId: this.outputId
        };
        e.dataTransfer.setData("notebook-cell-output", JSON.stringify(outputData));
      });
      window.addEventListener("keydown", (e) => {
        if (e.altKey) {
          this.element.draggable = true;
        }
      });
      window.addEventListener("keyup", (e) => {
        if (!e.altKey) {
          this.element.draggable = this.isImageOutput;
        }
      });
      window.addEventListener("blur", () => {
        this.element.draggable = this.isImageOutput;
      });
    }
    dispose() {
      this.renderTaskAbort?.abort();
      this.renderTaskAbort = void 0;
    }
    async render(content, preferredRendererId, preloadErrors, signal) {
      this.renderTaskAbort?.abort();
      this.renderTaskAbort = void 0;
      this._content = { preferredRendererId, preloadErrors };
      if (content.type === 0) {
        const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
        this.element.innerHTML = trustedHtml;
      } else if (preloadErrors.some((e) => e instanceof Error)) {
        const errors = preloadErrors.filter((e) => e instanceof Error);
        showRenderError(`Error loading preloads`, this.element, errors);
      } else {
        const imageMimeTypes = ["image/png", "image/jpeg", "image/svg"];
        this.isImageOutput = imageMimeTypes.includes(content.output.mime);
        this.element.draggable = this.isImageOutput;
        const item = createOutputItem(this.outputId, content.output.mime, content.metadata, content.output.valueBytes, content.allOutputs, content.output.appended);
        const controller = new AbortController();
        this.renderTaskAbort = controller;
        signal?.addEventListener("abort", () => controller.abort());
        try {
          await renderers.render(item, preferredRendererId, this.element, controller.signal);
        } finally {
          if (this.renderTaskAbort === controller) {
            this.renderTaskAbort = void 0;
          }
        }
      }
      if (!this.hasResizeObserver) {
        this.hasResizeObserver = true;
        resizeObserver.observe(this.element, this.outputId, true, this.cellId);
      }
      const offsetHeight = this.element.offsetHeight;
      const cps = document.defaultView.getComputedStyle(this.element);
      const verticalPadding = parseFloat(cps.paddingTop) + parseFloat(cps.paddingBottom);
      const contentHeight = offsetHeight - verticalPadding;
      if (elementHasContent(contentHeight) && cps.padding === "0px") {
        dimensionUpdater.updateHeight(this.outputId, offsetHeight + ctx.style.outputNodePadding * 2, {
          isOutput: true,
          init: true
        });
        this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
      } else if (elementHasContent(contentHeight)) {
        dimensionUpdater.updateHeight(this.outputId, this.element.offsetHeight, {
          isOutput: true,
          init: true
        });
        this.element.style.padding = `0 ${ctx.style.outputNodePadding}px 0 ${ctx.style.outputNodeLeftPadding}`;
      } else {
        dimensionUpdater.updateHeight(this.outputId, 0, {
          isOutput: true,
          init: true
        });
      }
      const root = this.element.shadowRoot ?? this.element;
      const codeBlocks = MarkdownCodeBlock.requestHighlightCodeBlock(root);
      if (codeBlocks.length > 0) {
        postNotebookMessage("renderedCellOutput", {
          codeBlocks
        });
      }
    }
    updateAndRerender(content) {
      if (this._content) {
        this.render(content, this._content.preferredRendererId, this._content.preloadErrors);
      }
    }
  }
  const markupCellDragManager = new class MarkupCellDragManager {
    constructor() {
      window.document.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      window.document.addEventListener("drop", (e) => {
        e.preventDefault();
        const drag = this.currentDrag;
        if (!drag) {
          return;
        }
        this.currentDrag = void 0;
        postNotebookMessage("cell-drop", {
          cellId: drag.cellId,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          dragOffsetY: e.clientY
        });
      });
    }
    startDrag(e, cellId) {
      if (!e.dataTransfer) {
        return;
      }
      if (!currentOptions.dragAndDropEnabled) {
        return;
      }
      this.currentDrag = { cellId, clientY: e.clientY };
      const overlayZIndex = 9999;
      if (!this.dragOverlay) {
        this.dragOverlay = document.createElement("div");
        this.dragOverlay.style.position = "absolute";
        this.dragOverlay.style.top = "0";
        this.dragOverlay.style.left = "0";
        this.dragOverlay.style.zIndex = `${overlayZIndex}`;
        this.dragOverlay.style.width = "100%";
        this.dragOverlay.style.height = "100%";
        this.dragOverlay.style.background = "transparent";
        window.document.body.appendChild(this.dragOverlay);
      }
      e.target.style.zIndex = `${overlayZIndex + 1}`;
      e.target.classList.add("dragging");
      postNotebookMessage("cell-drag-start", {
        cellId,
        dragOffsetY: e.clientY
      });
      const trySendDragUpdate = () => {
        if (this.currentDrag?.cellId !== cellId) {
          return;
        }
        postNotebookMessage("cell-drag", {
          cellId,
          dragOffsetY: this.currentDrag.clientY
        });
        window.requestAnimationFrame(trySendDragUpdate);
      };
      window.requestAnimationFrame(trySendDragUpdate);
    }
    updateDrag(e, cellId) {
      if (cellId !== this.currentDrag?.cellId) {
        this.currentDrag = void 0;
      } else {
        this.currentDrag = { cellId, clientY: e.clientY };
      }
    }
    endDrag(e, cellId) {
      this.currentDrag = void 0;
      e.target.classList.remove("dragging");
      postNotebookMessage("cell-drag-end", {
        cellId
      });
      if (this.dragOverlay) {
        this.dragOverlay.remove();
        this.dragOverlay = void 0;
      }
      e.target.style.zIndex = "";
    }
  }();
}
function preloadsScriptStr(styleValues, options, renderOptions, renderers, preloads, isWorkspaceTrusted, nonce) {
  const ctx = {
    style: styleValues,
    options,
    renderOptions,
    rendererData: renderers,
    staticPreloadsData: preloads,
    isWorkspaceTrusted,
    nonce
  };
  return `
		const __import = (x) => import(x);
		(${webviewPreloads})(
			JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(ctx))}"))
		)
//# sourceURL=notebookWebviewPreloads.js
`;
}
export {
  preloadsScriptStr
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9yZW5kZXJlcnMvd2Vidmlld1ByZWxvYWRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB3ZWJ2aWV3TWVzc2FnZXMgZnJvbSAnLi93ZWJ2aWV3TWVzc2FnZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBOb3RlYm9va0NlbGxNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHJlbmRlcmVyQXBpIGZyb20gJ3ZzY29kZS1ub3RlYm9vay1yZW5kZXJlcic7XG5pbXBvcnQgdHlwZSB7IE5vdGVib29rQ2VsbE91dHB1dFRyYW5zZmVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5cbi8vICEhIElNUE9SVEFOVCAhISAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBpbXBvcnQgeyBSZW5kZXJPdXRwdXRUeXBlIH0gZnJvbSAndnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXInO1xuLy8gV2UgY2FuIE9OTFkgSU1QT1JUIGFzIHR5cGUgaW4gdGhpcyBtb2R1bGUuIFRoaXMgYWxzbyBhcHBsaWVzIHRvIGNvbnN0IGVudW1zIHRoYXQgd291bGQgZXZhcG9yYXRlXG4vLyBpbiBub3JtYWwgY29tcGlsZXMgYnV0IHJlbWFpbiBhIGRlcGVuZGVuY3kgaW4gdHJhbnNwaWxlLW9ubHkgY29tcGlsZXNcbi8vICEhIElNUE9SVEFOVCAhISAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8vICEhIElNUE9SVEFOVCAhISBldmVyeXRoaW5nIG11c3QgYmUgaW4tbGluZSB3aXRoaW4gdGhlIHdlYnZpZXdQcmVsb2Fkc1xuLy8gZnVuY3Rpb24uIEltcG9ydHMgYXJlIG5vdCBhbGxvd2VkLiBUaGlzIGlzIHN0cmluZ2lmaWVkIGFuZCBpbmplY3RlZCBpbnRvXG4vLyB0aGUgd2Vidmlldy5cblxuZGVjbGFyZSBuYW1lc3BhY2UgZ2xvYmFsVGhpcyB7XG5cdGNvbnN0IGFjcXVpcmVWc0NvZGVBcGk6ICgpID0+ICh7XG5cdFx0Z2V0U3RhdGUoKTogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH07XG5cdFx0c2V0U3RhdGUoZGF0YTogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0pOiB2b2lkO1xuXHRcdHBvc3RNZXNzYWdlOiAobXNnOiB1bmtub3duKSA9PiB2b2lkO1xuXHR9KTtcbn1cblxuZGVjbGFyZSBjbGFzcyBSZXNpemVPYnNlcnZlciB7XG5cdGNvbnN0cnVjdG9yKG9uQ2hhbmdlOiAoZW50cmllczogeyB0YXJnZXQ6IEhUTUxFbGVtZW50OyBjb250ZW50UmVjdD86IENsaWVudFJlY3QgfVtdKSA9PiB2b2lkKTtcblx0b2JzZXJ2ZShlbGVtZW50OiBFbGVtZW50KTogdm9pZDtcblx0ZGlzY29ubmVjdCgpOiB2b2lkO1xufVxuXG5kZWNsYXJlIGNsYXNzIEhpZ2hsaWdodCB7XG5cdGNvbnN0cnVjdG9yKCk7XG5cdGFkZChyYW5nZTogQWJzdHJhY3RSYW5nZSk6IHZvaWQ7XG5cdGNsZWFyKCk6IHZvaWQ7XG5cdHByaW9yaXR5OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDU1NIaWdobGlnaHRzIHtcblx0c2V0KHJ1bGU6IHN0cmluZywgaGlnaGxpZ2h0OiBIaWdobGlnaHQpOiB2b2lkO1xufVxuZGVjbGFyZSBuYW1lc3BhY2UgQ1NTIHtcblx0bGV0IGhpZ2hsaWdodHM6IENTU0hpZ2hsaWdodHMgfCB1bmRlZmluZWQ7XG59XG5cblxudHlwZSBMaXN0ZW5lcjxUPiA9IHsgZm46IChldnQ6IFQpID0+IHZvaWQ7IHRoaXNBcmc6IHVua25vd24gfTtcblxuaW50ZXJmYWNlIEVtaXR0ZXJMaWtlPFQ+IHtcblx0ZmlyZShkYXRhOiBUKTogdm9pZDtcblx0cmVhZG9ubHkgZXZlbnQ6IEV2ZW50PFQ+O1xufVxuXG5pbnRlcmZhY2UgUHJlbG9hZFN0eWxlcyB7XG5cdHJlYWRvbmx5IG91dHB1dE5vZGVQYWRkaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dE5vZGVMZWZ0UGFkZGluZzogbnVtYmVyO1xuXHRyZWFkb25seSB0b2tlbml6YXRpb25Dc3M6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVsb2FkT3B0aW9ucyB7XG5cdGRyYWdBbmREcm9wRW5hYmxlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZW5kZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgbGluZUxpbWl0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dFNjcm9sbGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0V29yZFdyYXA6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxpbmtpZnlGaWxlUGF0aHM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbmltYWxFcnJvcjogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFByZWxvYWRDb250ZXh0IHtcblx0cmVhZG9ubHkgbm9uY2U6IHN0cmluZztcblx0cmVhZG9ubHkgc3R5bGU6IFByZWxvYWRTdHlsZXM7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IFByZWxvYWRPcHRpb25zO1xuXHRyZWFkb25seSByZW5kZXJPcHRpb25zOiBSZW5kZXJPcHRpb25zO1xuXHRyZWFkb25seSByZW5kZXJlckRhdGE6IHJlYWRvbmx5IHdlYnZpZXdNZXNzYWdlcy5SZW5kZXJlck1ldGFkYXRhW107XG5cdHJlYWRvbmx5IHN0YXRpY1ByZWxvYWRzRGF0YTogcmVhZG9ubHkgd2Vidmlld01lc3NhZ2VzLlN0YXRpY1ByZWxvYWRNZXRhZGF0YVtdO1xuXHRyZWFkb25seSBpc1dvcmtzcGFjZVRydXN0ZWQ6IGJvb2xlYW47XG59XG5cbmRlY2xhcmUgZnVuY3Rpb24gcmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjazogKGFyZ3M6IElkbGVEZWFkbGluZSkgPT4gdm9pZCwgb3B0aW9ucz86IHsgdGltZW91dDogbnVtYmVyIH0pOiBudW1iZXI7XG5kZWNsYXJlIGZ1bmN0aW9uIGNhbmNlbElkbGVDYWxsYmFjayhoYW5kbGU6IG51bWJlcik6IHZvaWQ7XG5cbmRlY2xhcmUgZnVuY3Rpb24gX19pbXBvcnQocGF0aDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuXG5hc3luYyBmdW5jdGlvbiB3ZWJ2aWV3UHJlbG9hZHMoY3R4OiBQcmVsb2FkQ29udGV4dCkge1xuXG5cdC8qIGVzbGludC1kaXNhYmxlIG5vLXJlc3RyaWN0ZWQtZ2xvYmFscywgbm8tcmVzdHJpY3RlZC1zeW50YXggKi9cblxuXHQvLyBUaGUgdXNlIG9mIGdsb2JhbCBgd2luZG93YCBzaG91bGQgYmUgZmluZSBpbiB0aGlzIGNvbnRleHQsIGV2ZW5cblx0Ly8gd2l0aCBhdXggd2luZG93cy4gVGhpcyBjb2RlIGlzIHJ1bm5pbmcgZnJvbSB3aXRoaW4gYW4gYGlmcmFtZWBcblx0Ly8gd2hlcmUgdGhlcmUgaXMgb25seSBvbmUgYHdpbmRvd2Agb2JqZWN0IGFueXdheS5cblxuXHRjb25zdCB1c2VyQWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuXHRjb25zdCBpc0Nocm9tZSA9ICh1c2VyQWdlbnQuaW5kZXhPZignQ2hyb21lJykgPj0gMCk7XG5cdGNvbnN0IHRleHRFbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cdGNvbnN0IHRleHREZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG5cblx0ZnVuY3Rpb24gcHJvbWlzZVdpdGhSZXNvbHZlcnM8VD4oKTogeyBwcm9taXNlOiBQcm9taXNlPFQ+OyByZXNvbHZlOiAodmFsdWU6IFQgfCBQcm9taXNlTGlrZTxUPikgPT4gdm9pZDsgcmVqZWN0OiAoZXJyPzogYW55KSA9PiB2b2lkIH0ge1xuXHRcdGxldCByZXNvbHZlOiAodmFsdWU6IFQgfCBQcm9taXNlTGlrZTxUPikgPT4gdm9pZDtcblx0XHRsZXQgcmVqZWN0OiAocmVhc29uPzogYW55KSA9PiB2b2lkO1xuXHRcdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTxUPigocmVzLCByZWopID0+IHtcblx0XHRcdHJlc29sdmUgPSByZXM7XG5cdFx0XHRyZWplY3QgPSByZWo7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHsgcHJvbWlzZSwgcmVzb2x2ZTogcmVzb2x2ZSEsIHJlamVjdDogcmVqZWN0ISB9O1xuXHR9XG5cblx0bGV0IGN1cnJlbnRPcHRpb25zID0gY3R4Lm9wdGlvbnM7XG5cdGNvbnN0IGlzV29ya3NwYWNlVHJ1c3RlZCA9IGN0eC5pc1dvcmtzcGFjZVRydXN0ZWQ7XG5cdGxldCBjdXJyZW50UmVuZGVyT3B0aW9ucyA9IGN0eC5yZW5kZXJPcHRpb25zO1xuXHRjb25zdCBzZXR0aW5nQ2hhbmdlOiBFbWl0dGVyTGlrZTxSZW5kZXJPcHRpb25zPiA9IGNyZWF0ZUVtaXR0ZXI8UmVuZGVyT3B0aW9ucz4oKTtcblxuXHRjb25zdCBhY3F1aXJlVnNDb2RlQXBpID0gZ2xvYmFsVGhpcy5hY3F1aXJlVnNDb2RlQXBpO1xuXHRjb25zdCB2c2NvZGUgPSBhY3F1aXJlVnNDb2RlQXBpKCk7XG5cdGRlbGV0ZSAoZ2xvYmFsVGhpcyBhcyB7IGFjcXVpcmVWc0NvZGVBcGk6IHVua25vd24gfSkuYWNxdWlyZVZzQ29kZUFwaTtcblxuXHRjb25zdCB0b2tlbml6YXRpb25TdHlsZSA9IG5ldyBDU1NTdHlsZVNoZWV0KCk7XG5cdHRva2VuaXphdGlvblN0eWxlLnJlcGxhY2VTeW5jKGN0eC5zdHlsZS50b2tlbml6YXRpb25Dc3MpO1xuXG5cdGNvbnN0IHJ1bldoZW5JZGxlOiAoY2FsbGJhY2s6IChpZGxlOiBJZGxlRGVhZGxpbmUpID0+IHZvaWQsIHRpbWVvdXQ/OiBudW1iZXIpID0+IElEaXNwb3NhYmxlID0gKHR5cGVvZiByZXF1ZXN0SWRsZUNhbGxiYWNrICE9PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBjYW5jZWxJZGxlQ2FsbGJhY2sgIT09ICdmdW5jdGlvbicpXG5cdFx0PyAocnVubmVyKSA9PiB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVuZCA9IERhdGUubm93KCkgKyAxNTsgLy8gb25lIGZyYW1lIGF0IDY0ZnBzXG5cdFx0XHRcdHJ1bm5lcihPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0XHRkaWRUaW1lb3V0OiB0cnVlLFxuXHRcdFx0XHRcdHRpbWVSZW1haW5pbmcoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgZW5kIC0gRGF0ZS5ub3coKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblx0XHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHQ6IChydW5uZXIsIHRpbWVvdXQ/KSA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGU6IG51bWJlciA9IHJlcXVlc3RJZGxlQ2FsbGJhY2socnVubmVyLCB0eXBlb2YgdGltZW91dCA9PT0gJ251bWJlcicgPyB7IHRpbWVvdXQgfSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRjYW5jZWxJZGxlQ2FsbGJhY2soaGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9O1xuXHRmdW5jdGlvbiBnZXRPdXRwdXRDb250YWluZXIoZXZlbnQ6IEZvY3VzRXZlbnQgfCBNb3VzZUV2ZW50KSB7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIGV2ZW50LmNvbXBvc2VkUGF0aCgpKSB7XG5cdFx0XHRpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmIG5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdvdXRwdXQnKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBub2RlLmlkXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXHRsZXQgbGFzdEZvY3VzZWRPdXRwdXQ6IHsgaWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRjb25zdCBoYW5kbGVPdXRwdXRGb2N1c091dCA9IChldmVudDogRm9jdXNFdmVudCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dEZvY3VzID0gZXZlbnQgJiYgZ2V0T3V0cHV0Q29udGFpbmVyKGV2ZW50KTtcblx0XHRpZiAoIW91dHB1dEZvY3VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFBvc3NpYmxlIHdlJ3JlIHRhYmJpbmcgdGhyb3VnaCB0aGUgZWxlbWVudHMgb2YgdGhlIHNhbWUgb3V0cHV0LlxuXHRcdC8vIExldHMgc2VlIGlmIGZvY3VzIGlzIHNldCBiYWNrIHRvIHRoZSBzYW1lIG91dHB1dC5cblx0XHRsYXN0Rm9jdXNlZE91dHB1dCA9IHVuZGVmaW5lZDtcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmIChsYXN0Rm9jdXNlZE91dHB1dD8uaWQgPT09IG91dHB1dEZvY3VzLmlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklPdXRwdXRCbHVyTWVzc2FnZT4oJ291dHB1dEJsdXInLCBvdXRwdXRGb2N1cyk7XG5cdFx0fSwgMCk7XG5cdH07XG5cblx0Y29uc3QgaGFzQWN0aXZlRWRpdGFibGVFbGVtZW50ID0gKFxuXHRcdHBhcmVudDogTm9kZSB8IERvY3VtZW50RnJhZ21lbnQsXG5cdFx0cm9vdDogU2hhZG93Um9vdCB8IERvY3VtZW50ID0gZG9jdW1lbnRcblx0KTogYm9vbGVhbiA9PiB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHJvb3QuYWN0aXZlRWxlbWVudDtcblx0XHRyZXR1cm4gISEoZWxlbWVudCAmJiBwYXJlbnQuY29udGFpbnMoZWxlbWVudClcblx0XHRcdCYmIChlbGVtZW50Lm1hdGNoZXMoJzpyZWFkLXdyaXRlJykgfHwgZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdzZWxlY3QnXG5cdFx0XHRcdHx8IChlbGVtZW50LnNoYWRvd1Jvb3QgJiYgaGFzQWN0aXZlRWRpdGFibGVFbGVtZW50KGVsZW1lbnQuc2hhZG93Um9vdCwgZWxlbWVudC5zaGFkb3dSb290KSkpXG5cdFx0KTtcblx0fTtcblxuXHQvLyBjaGVjayBpZiBhbiBpbnB1dCBlbGVtZW50IGlzIGZvY3VzZWQgd2l0aGluIHRoZSBvdXRwdXQgZWxlbWVudFxuXHRjb25zdCBjaGVja091dHB1dElucHV0Rm9jdXMgPSAoZTogRm9jdXNFdmVudCkgPT4ge1xuXHRcdGxhc3RGb2N1c2VkT3V0cHV0ID0gZ2V0T3V0cHV0Q29udGFpbmVyKGUpO1xuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRpZiAoIWFjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpZCA9IGxhc3RGb2N1c2VkT3V0cHV0Py5pZDtcblx0XHRpZiAoaWQgJiYgKGhhc0FjdGl2ZUVkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50LCB3aW5kb3cuZG9jdW1lbnQpKSkge1xuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU91dHB1dElucHV0Rm9jdXNNZXNzYWdlPignb3V0cHV0SW5wdXRGb2N1cycsIHsgaW5wdXRGb2N1c2VkOiB0cnVlLCBpZCB9KTtcblxuXHRcdFx0YWN0aXZlRWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4ge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JT3V0cHV0SW5wdXRGb2N1c01lc3NhZ2U+KCdvdXRwdXRJbnB1dEZvY3VzJywgeyBpbnB1dEZvY3VzZWQ6IGZhbHNlLCBpZCB9KTtcblx0XHRcdH0sIHsgb25jZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgaGFuZGxlSW5uZXJDbGljayA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdGlmICghZXZlbnQgfHwgIWV2ZW50LnZpZXcgfHwgIWV2ZW50LnZpZXcuZG9jdW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdXRwdXRGb2N1cyA9IGxhc3RGb2N1c2VkT3V0cHV0ID0gZ2V0T3V0cHV0Q29udGFpbmVyKGV2ZW50KTtcblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgZXZlbnQuY29tcG9zZWRQYXRoKCkpIHtcblx0XHRcdGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEFuY2hvckVsZW1lbnQgJiYgbm9kZS5ocmVmKSB7XG5cdFx0XHRcdGlmIChub2RlLmhyZWYuc3RhcnRzV2l0aCgnYmxvYjonKSkge1xuXHRcdFx0XHRcdGlmIChvdXRwdXRGb2N1cykge1xuXHRcdFx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU91dHB1dEZvY3VzTWVzc2FnZT4oJ291dHB1dEZvY3VzJywgb3V0cHV0Rm9jdXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGhhbmRsZUJsb2JVcmxDbGljayhub2RlLmhyZWYsIG5vZGUuZG93bmxvYWQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5vZGUuaHJlZi5zdGFydHNXaXRoKCdkYXRhOicpKSB7XG5cdFx0XHRcdFx0aWYgKG91dHB1dEZvY3VzKSB7XG5cdFx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JT3V0cHV0Rm9jdXNNZXNzYWdlPignb3V0cHV0Rm9jdXMnLCBvdXRwdXRGb2N1cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGhhbmRsZURhdGFVcmwobm9kZS5ocmVmLCBub2RlLmRvd25sb2FkKTtcblx0XHRcdFx0fSBlbHNlIGlmIChub2RlLmdldEF0dHJpYnV0ZSgnaHJlZicpPy50cmltKCkuc3RhcnRzV2l0aCgnIycpKSB7XG5cdFx0XHRcdFx0Ly8gU2Nyb2xsaW5nIHRvIGxvY2F0aW9uIHdpdGhpbiBjdXJyZW50IGRvY1xuXG5cdFx0XHRcdFx0aWYgKCFub2RlLmhhc2gpIHtcblx0XHRcdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklTY3JvbGxUb1JldmVhbE1lc3NhZ2U+KCdzY3JvbGwtdG8tcmV2ZWFsJywgeyBzY3JvbGxUb3A6IDAgfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0SWQgPSBub2RlLmhhc2guc3Vic3RyaW5nKDEpO1xuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgb3V0ZXIgZG9jdW1lbnQgZmlyc3Rcblx0XHRcdFx0XHRsZXQgc2Nyb2xsVGFyZ2V0OiBFbGVtZW50IHwgbnVsbCB8IHVuZGVmaW5lZCA9IGV2ZW50LnZpZXcuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGFyZ2V0SWQpO1xuXG5cdFx0XHRcdFx0aWYgKCFzY3JvbGxUYXJnZXQpIHtcblx0XHRcdFx0XHRcdC8vIEZhbGxiYWNrIHRvIGNoZWNraW5nIHByZXZpZXcgc2hhZG93IGRvbXNcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcHJldmlldyBvZiBldmVudC52aWV3LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wcmV2aWV3JykpIHtcblx0XHRcdFx0XHRcdFx0c2Nyb2xsVGFyZ2V0ID0gcHJldmlldy5zaGFkb3dSb290Py5nZXRFbGVtZW50QnlJZCh0YXJnZXRJZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChzY3JvbGxUYXJnZXQpIHtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChzY3JvbGxUYXJnZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHNjcm9sbFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3AgKyBldmVudC52aWV3LnNjcm9sbFk7XG5cdFx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JU2Nyb2xsVG9SZXZlYWxNZXNzYWdlPignc2Nyb2xsLXRvLXJldmVhbCcsIHsgc2Nyb2xsVG9wIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBocmVmID0gbm9kZS5nZXRBdHRyaWJ1dGUoJ2hyZWYnKTtcblx0XHRcdFx0XHRpZiAoaHJlZikge1xuXHRcdFx0XHRcdFx0aWYgKGhyZWYuc3RhcnRzV2l0aCgnY29tbWFuZDonKSAmJiBvdXRwdXRGb2N1cykge1xuXHRcdFx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JT3V0cHV0Rm9jdXNNZXNzYWdlPignb3V0cHV0Rm9jdXMnLCBvdXRwdXRGb2N1cyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JQ2xpY2tlZExpbmtNZXNzYWdlPignY2xpY2tlZC1saW5rJywgeyBocmVmIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG91dHB1dEZvY3VzKSB7XG5cdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JT3V0cHV0Rm9jdXNNZXNzYWdlPignb3V0cHV0Rm9jdXMnLCBvdXRwdXRGb2N1cyk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IGJsdXJPdXRwdXQgPSAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlbGVjdGlvbi5yZW1vdmVBbGxSYW5nZXMoKTtcblx0fTtcblxuXHRjb25zdCBzZWxlY3RPdXRwdXRDb250ZW50cyA9IChjZWxsT3JPdXRwdXRJZDogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGxPdXRwdXRDb250YWluZXIgPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2VsbE9yT3V0cHV0SWQpO1xuXHRcdGlmICghY2VsbE91dHB1dENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZWxlY3Rpb24ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuXHRcdHJhbmdlLnNlbGVjdE5vZGUoY2VsbE91dHB1dENvbnRhaW5lcik7XG5cdFx0c2VsZWN0aW9uLmFkZFJhbmdlKHJhbmdlKTtcblxuXHR9O1xuXG5cdGNvbnN0IHNlbGVjdElucHV0Q29udGVudHMgPSAoY2VsbE9yT3V0cHV0SWQ6IHN0cmluZykgPT4ge1xuXHRcdGNvbnN0IGNlbGxPdXRwdXRDb250YWluZXIgPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2VsbE9yT3V0cHV0SWQpO1xuXHRcdGlmICghY2VsbE91dHB1dENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gd2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKGFjdGl2ZUVsZW1lbnQgJiYgaGFzQWN0aXZlRWRpdGFibGVFbGVtZW50KGFjdGl2ZUVsZW1lbnQsIHdpbmRvdy5kb2N1bWVudCkpIHtcblx0XHRcdChhY3RpdmVFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnNlbGVjdCgpO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBvblBhZ2VVcERvd25TZWxlY3Rpb25IYW5kbGVyID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRpZiAoIWxhc3RGb2N1c2VkT3V0cHV0Py5pZCB8fCAhZS5zaGlmdEtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlJ3JlIHByZXNzaW5nIGBTaGlmdCtVcC9Eb3duYCB0aGVuIHdlIHdhbnQgdG8gc2VsZWN0IGEgbGluZSBhdCBhIHRpbWUuXG5cdFx0aWYgKGUuc2hpZnRLZXkgJiYgKGUuY29kZSA9PT0gJ0Fycm93VXAnIHx8IGUuY29kZSA9PT0gJ0Fycm93RG93bicpKSB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpOyAvLyBXZSBkb24ndCB3YW50IHRoZSBub3RlYm9vayB0byBoYW5kbGUgdGhpcywgZGVmYXVsdCBiZWhhdmlvciBpcyB3aGF0IHdlIG5lZWQuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2Ugd2FudCB0byBoYW5kbGUganVzdCBgU2hpZnQgKyBQYWdlVXAvUGFnZURvd25gICYgYFNoaWZ0ICsgQ21kICsgQXJyb3dVcC9BcnJvd0Rvd25gIChmb3IgbWFjKVxuXHRcdGlmICghKGUuY29kZSA9PT0gJ1BhZ2VVcCcgfHwgZS5jb2RlID09PSAnUGFnZURvd24nKSAmJiAhKGUubWV0YUtleSAmJiAoZS5jb2RlID09PSAnQXJyb3dEb3duJyB8fCBlLmNvZGUgPT09ICdBcnJvd1VwJykpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG91dHB1dENvbnRhaW5lciA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChsYXN0Rm9jdXNlZE91dHB1dC5pZCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghb3V0cHV0Q29udGFpbmVyIHx8ICFzZWxlY3Rpb24/LmFuY2hvck5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IHdpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdGlmIChhY3RpdmVFbGVtZW50ICYmIGhhc0FjdGl2ZUVkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50LCB3aW5kb3cuZG9jdW1lbnQpKSB7XG5cdFx0XHQvLyBMZWF2ZSBmb3IgZGVmYXVsdCBiZWhhdmlvci5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGVzZSBzaG91bGQgY2hhbmdlIHRoZSBzY3JvbGwgcG9zaXRpb24sIG5vdCBhZGp1c3QgdGhlIHNlbGVjdGVkIGNlbGwgaW4gdGhlIG5vdGVib29rXG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8gV2UgZG9uJ3Qgd2FudCB0aGUgbm90ZWJvb2sgdG8gaGFuZGxlIHRoaXMuXG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpOyAvLyBXZSB3aWxsIGhhbmRsZSBzZWxlY3Rpb24uXG5cblx0XHRjb25zdCB7IGFuY2hvck5vZGUsIGFuY2hvck9mZnNldCB9ID0gc2VsZWN0aW9uO1xuXHRcdGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0XHRpZiAoZS5jb2RlID09PSAnUGFnZURvd24nIHx8IGUuY29kZSA9PT0gJ0Fycm93RG93bicpIHtcblx0XHRcdHJhbmdlLnNldFN0YXJ0KGFuY2hvck5vZGUsIGFuY2hvck9mZnNldCk7XG5cdFx0XHRyYW5nZS5zZXRFbmQob3V0cHV0Q29udGFpbmVyLCAxKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRyYW5nZS5zZXRTdGFydChvdXRwdXRDb250YWluZXIsIDApO1xuXHRcdFx0cmFuZ2Uuc2V0RW5kKGFuY2hvck5vZGUsIGFuY2hvck9mZnNldCk7XG5cdFx0fVxuXHRcdHNlbGVjdGlvbi5yZW1vdmVBbGxSYW5nZXMoKTtcblx0XHRzZWxlY3Rpb24uYWRkUmFuZ2UocmFuZ2UpO1xuXHR9O1xuXG5cdGNvbnN0IGRpc2FibGVOYXRpdmVTZWxlY3RBbGwgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdGlmICghbGFzdEZvY3VzZWRPdXRwdXQ/LmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRpZiAoYWN0aXZlRWxlbWVudCAmJiBoYXNBY3RpdmVFZGl0YWJsZUVsZW1lbnQoYWN0aXZlRWxlbWVudCwgd2luZG93LmRvY3VtZW50KSkge1xuXHRcdFx0Ly8gVGhlIGlucHV0IGVsZW1lbnQgd2lsbCBoYW5kbGUgdGhpcy5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoKGUua2V5ID09PSAnYScgJiYgZS5jdHJsS2V5KSB8fCAoZS5tZXRhS2V5ICYmIGUua2V5ID09PSAnYScpKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IC8vIFdlIHdpbGwgaGFuZGxlIHNlbGVjdGlvbiBpbiBlZGl0b3IgY29kZS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgaGFuZGxlRGF0YVVybCA9IGFzeW5jIChkYXRhOiBzdHJpbmcgfCBBcnJheUJ1ZmZlciB8IG51bGwsIGRvd25sb2FkTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNsaWNrZWREYXRhVXJsTWVzc2FnZT4oJ2NsaWNrZWQtZGF0YS11cmwnLCB7XG5cdFx0XHRkYXRhLFxuXHRcdFx0ZG93bmxvYWROYW1lXG5cdFx0fSk7XG5cdH07XG5cblx0Y29uc3QgaGFuZGxlQmxvYlVybENsaWNrID0gYXN5bmMgKHVybDogc3RyaW5nLCBkb3dubG9hZE5hbWU6IHN0cmluZykgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XG5cdFx0XHRjb25zdCBibG9iID0gYXdhaXQgcmVzcG9uc2UuYmxvYigpO1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblx0XHRcdHJlYWRlci5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgKCkgPT4ge1xuXHRcdFx0XHRoYW5kbGVEYXRhVXJsKHJlYWRlci5yZXN1bHQsIGRvd25sb2FkTmFtZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlYWRlci5yZWFkQXNEYXRhVVJMKGJsb2IpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZS5tZXNzYWdlKTtcblx0XHR9XG5cdH07XG5cblx0d2luZG93LmRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVJbm5lckNsaWNrKTtcblx0d2luZG93LmRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNpbicsIGNoZWNrT3V0cHV0SW5wdXRGb2N1cyk7XG5cdHdpbmRvdy5kb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0JywgaGFuZGxlT3V0cHV0Rm9jdXNPdXQpO1xuXHR3aW5kb3cuZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25QYWdlVXBEb3duU2VsZWN0aW9uSGFuZGxlcik7XG5cdHdpbmRvdy5kb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBkaXNhYmxlTmF0aXZlU2VsZWN0QWxsKTtcblxuXHRpbnRlcmZhY2UgUmVuZGVyZXJDb250ZXh0IGV4dGVuZHMgcmVuZGVyZXJBcGkuUmVuZGVyZXJDb250ZXh0PHVua25vd24+IHtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZVNldHRpbmdzOiBFdmVudDxSZW5kZXJPcHRpb25zPjtcblx0XHRyZWFkb25seSBzZXR0aW5nczogUmVuZGVyT3B0aW9ucztcblx0fVxuXG5cdGludGVyZmFjZSBSZW5kZXJlck1vZHVsZSB7XG5cdFx0cmVhZG9ubHkgYWN0aXZhdGU6IHJlbmRlcmVyQXBpLkFjdGl2YXRpb25GdW5jdGlvbjtcblx0fVxuXG5cdGludGVyZmFjZSBLZXJuZWxQcmVsb2FkQ29udGV4dCB7XG5cdFx0cmVhZG9ubHkgb25EaWRSZWNlaXZlS2VybmVsTWVzc2FnZTogRXZlbnQ8dW5rbm93bj47XG5cdFx0cG9zdEtlcm5lbE1lc3NhZ2UoZGF0YTogdW5rbm93bik6IHZvaWQ7XG5cdH1cblxuXHRpbnRlcmZhY2UgS2VybmVsUHJlbG9hZE1vZHVsZSB7XG5cdFx0YWN0aXZhdGUoY3R4OiBLZXJuZWxQcmVsb2FkQ29udGV4dCk6IFByb21pc2U8dm9pZD4gfCB2b2lkO1xuXHR9XG5cblx0aW50ZXJmYWNlIElPYnNlcnZlZEVsZW1lbnQge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0b3V0cHV0OiBib29sZWFuO1xuXHRcdGxhc3RLbm93blBhZGRpbmc6IG51bWJlcjtcblx0XHRsYXN0S25vd25IZWlnaHQ6IG51bWJlcjtcblx0XHRjZWxsSWQ6IHN0cmluZztcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUtlcm5lbENvbnRleHQoKTogS2VybmVsUHJlbG9hZENvbnRleHQge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRcdG9uRGlkUmVjZWl2ZUtlcm5lbE1lc3NhZ2U6IG9uRGlkUmVjZWl2ZUtlcm5lbE1lc3NhZ2UuZXZlbnQsXG5cdFx0XHRwb3N0S2VybmVsTWVzc2FnZTogKGRhdGE6IHVua25vd24pID0+IHBvc3ROb3RlYm9va01lc3NhZ2UoJ2N1c3RvbUtlcm5lbE1lc3NhZ2UnLCB7IG1lc3NhZ2U6IGRhdGEgfSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBydW5LZXJuZWxQcmVsb2FkKHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBhY3RpdmF0ZU1vZHVsZUtlcm5lbFByZWxvYWQodXJsKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZU1vZHVsZUtlcm5lbFByZWxvYWQodXJsOiBzdHJpbmcpIHtcblx0XHRjb25zdCBtb2R1bGU6IEtlcm5lbFByZWxvYWRNb2R1bGUgPSBhd2FpdCBfX2ltcG9ydCh1cmwpO1xuXHRcdGlmICghbW9kdWxlLmFjdGl2YXRlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBOb3RlYm9vayBwcmVsb2FkICcke3VybH0nIHdhcyBleHBlY3RlZCB0byBiZSBhIG1vZHVsZSBidXQgaXQgZG9lcyBub3QgZXhwb3J0IGFuICdhY3RpdmF0ZScgZnVuY3Rpb25gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZHVsZS5hY3RpdmF0ZShjcmVhdGVLZXJuZWxDb250ZXh0KCkpO1xuXHR9XG5cblx0Y29uc3QgZGltZW5zaW9uVXBkYXRlciA9IG5ldyBjbGFzcyB7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nID0gbmV3IE1hcDxzdHJpbmcsIHdlYnZpZXdNZXNzYWdlcy5EaW1lbnNpb25VcGRhdGU+KCk7XG5cblx0XHR1cGRhdGVIZWlnaHQoaWQ6IHN0cmluZywgaGVpZ2h0OiBudW1iZXIsIG9wdGlvbnM6IHsgaW5pdD86IGJvb2xlYW47IGlzT3V0cHV0PzogYm9vbGVhbiB9KSB7XG5cdFx0XHRpZiAoIXRoaXMucGVuZGluZy5zaXplKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlSW1tZWRpYXRlbHkoKTtcblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGUgPSB0aGlzLnBlbmRpbmcuZ2V0KGlkKTtcblx0XHRcdGlmICh1cGRhdGUgJiYgdXBkYXRlLmlzT3V0cHV0KSB7XG5cdFx0XHRcdHRoaXMucGVuZGluZy5zZXQoaWQsIHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRoZWlnaHQsXG5cdFx0XHRcdFx0aW5pdDogdXBkYXRlLmluaXQsXG5cdFx0XHRcdFx0aXNPdXRwdXQ6IHVwZGF0ZS5pc091dHB1dFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucGVuZGluZy5zZXQoaWQsIHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRoZWlnaHQsXG5cdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dXBkYXRlSW1tZWRpYXRlbHkoKSB7XG5cdFx0XHRpZiAoIXRoaXMucGVuZGluZy5zaXplKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSURpbWVuc2lvbk1lc3NhZ2U+KCdkaW1lbnNpb24nLCB7XG5cdFx0XHRcdHVwZGF0ZXM6IEFycmF5LmZyb20odGhpcy5wZW5kaW5nLnZhbHVlcygpKVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLnBlbmRpbmcuY2xlYXIoKTtcblx0XHR9XG5cdH07XG5cblx0ZnVuY3Rpb24gZWxlbWVudEhhc0NvbnRlbnQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHQvLyB3ZSBuZWVkIHRvIGFjY291bnQgZm9yIGEgcG90ZW50aWFsIDFweCB0b3AgYW5kIGJvdHRvbSBib3JkZXIgb24gYSBjaGlsZCB3aXRoaW4gdGhlIG91dHB1dCBjb250YWluZXJcblx0XHRyZXR1cm4gaGVpZ2h0ID4gMi4xO1xuXHR9XG5cblx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSBuZXcgY2xhc3Mge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb2JzZXJ2ZXI6IFJlc2l6ZU9ic2VydmVyO1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb2JzZXJ2ZWRFbGVtZW50cyA9IG5ldyBXZWFrTWFwPEVsZW1lbnQsIElPYnNlcnZlZEVsZW1lbnQ+KCk7XG5cdFx0cHJpdmF0ZSBfb3V0cHV0UmVzaXplVGltZXI6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHRoaXMuX29ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKGVudHJpZXMgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0XHRpZiAoIXdpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGVudHJ5LnRhcmdldCkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG9ic2VydmVkRWxlbWVudEluZm8gPSB0aGlzLl9vYnNlcnZlZEVsZW1lbnRzLmdldChlbnRyeS50YXJnZXQpO1xuXHRcdFx0XHRcdGlmICghb2JzZXJ2ZWRFbGVtZW50SW5mbykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5wb3N0UmVzaXplTWVzc2FnZShvYnNlcnZlZEVsZW1lbnRJbmZvLmNlbGxJZCk7XG5cblx0XHRcdFx0XHRpZiAoZW50cnkudGFyZ2V0LmlkICE9PSBvYnNlcnZlZEVsZW1lbnRJbmZvLmlkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIWVudHJ5LmNvbnRlbnRSZWN0KSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIW9ic2VydmVkRWxlbWVudEluZm8ub3V0cHV0KSB7XG5cdFx0XHRcdFx0XHQvLyBtYXJrdXAsIHVwZGF0ZSBkaXJlY3RseVxuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVIZWlnaHQob2JzZXJ2ZWRFbGVtZW50SW5mbywgZW50cnkudGFyZ2V0Lm9mZnNldEhlaWdodCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBoYXNDb250ZW50ID0gZWxlbWVudEhhc0NvbnRlbnQoZW50cnkuY29udGVudFJlY3QuaGVpZ2h0KTtcblx0XHRcdFx0XHRjb25zdCBzaG91bGRVcGRhdGVQYWRkaW5nID1cblx0XHRcdFx0XHRcdChoYXNDb250ZW50ICYmIG9ic2VydmVkRWxlbWVudEluZm8ubGFzdEtub3duUGFkZGluZyA9PT0gMCkgfHxcblx0XHRcdFx0XHRcdCghaGFzQ29udGVudCAmJiBvYnNlcnZlZEVsZW1lbnRJbmZvLmxhc3RLbm93blBhZGRpbmcgIT09IDApO1xuXG5cdFx0XHRcdFx0aWYgKHNob3VsZFVwZGF0ZVBhZGRpbmcpIHtcblx0XHRcdFx0XHRcdC8vIERvIG5vdCB1cGRhdGUgZGltZW5zaW9uIGluIHJlc2l6ZSBvYnNlcnZlclxuXHRcdFx0XHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChoYXNDb250ZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0ZW50cnkudGFyZ2V0LnN0eWxlLnBhZGRpbmcgPSBgJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZUxlZnRQYWRkaW5nfXB4YDtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRlbnRyeS50YXJnZXQuc3R5bGUucGFkZGluZyA9IGAwcHhgO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlSGVpZ2h0KG9ic2VydmVkRWxlbWVudEluZm8sIGhhc0NvbnRlbnQgPyBlbnRyeS50YXJnZXQub2Zmc2V0SGVpZ2h0IDogMCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVIZWlnaHQob2JzZXJ2ZWRFbGVtZW50SW5mbywgaGFzQ29udGVudCA/IGVudHJ5LnRhcmdldC5vZmZzZXRIZWlnaHQgOiAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgdXBkYXRlSGVpZ2h0KG9ic2VydmVkRWxlbWVudEluZm86IElPYnNlcnZlZEVsZW1lbnQsIG9mZnNldEhlaWdodDogbnVtYmVyKSB7XG5cdFx0XHRpZiAob2JzZXJ2ZWRFbGVtZW50SW5mby5sYXN0S25vd25IZWlnaHQgIT09IG9mZnNldEhlaWdodCkge1xuXHRcdFx0XHRvYnNlcnZlZEVsZW1lbnRJbmZvLmxhc3RLbm93bkhlaWdodCA9IG9mZnNldEhlaWdodDtcblx0XHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVIZWlnaHQob2JzZXJ2ZWRFbGVtZW50SW5mby5pZCwgb2Zmc2V0SGVpZ2h0LCB7XG5cdFx0XHRcdFx0aXNPdXRwdXQ6IG9ic2VydmVkRWxlbWVudEluZm8ub3V0cHV0XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBvYnNlcnZlKGNvbnRhaW5lcjogRWxlbWVudCwgaWQ6IHN0cmluZywgb3V0cHV0OiBib29sZWFuLCBjZWxsSWQ6IHN0cmluZykge1xuXHRcdFx0aWYgKHRoaXMuX29ic2VydmVkRWxlbWVudHMuaGFzKGNvbnRhaW5lcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vYnNlcnZlZEVsZW1lbnRzLnNldChjb250YWluZXIsIHsgaWQsIG91dHB1dCwgbGFzdEtub3duUGFkZGluZzogY3R4LnN0eWxlLm91dHB1dE5vZGVQYWRkaW5nLCBsYXN0S25vd25IZWlnaHQ6IC0xLCBjZWxsSWQgfSk7XG5cdFx0XHR0aGlzLl9vYnNlcnZlci5vYnNlcnZlKGNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBwb3N0UmVzaXplTWVzc2FnZShjZWxsSWQ6IHN0cmluZykge1xuXHRcdFx0Ly8gRGVib3VuY2UgdGhpcyBjYWxsYmFjayB0byBvbmx5IGhhcHBlbiBhZnRlclxuXHRcdFx0Ly8gMjUwIG1zLiBEb24ndCBuZWVkIHJlc2l6ZSBldmVudHMgdGhhdCBvZnRlbi5cblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9vdXRwdXRSZXNpemVUaW1lcik7XG5cdFx0XHR0aGlzLl9vdXRwdXRSZXNpemVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlKCdvdXRwdXRSZXNpemVkJywge1xuXHRcdFx0XHRcdGNlbGxJZFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sIDI1MCk7XG5cblx0XHR9XG5cdH07XG5cblx0bGV0IHByZXZpb3VzRGVsdGE6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IHNjcm9sbFRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdGxldCBzY3JvbGxlZEVsZW1lbnQ6IEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdGxldCBsYXN0VGltZVNjcm9sbGVkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGZ1bmN0aW9uIGZsYWdSZWNlbnRseVNjcm9sbGVkKG5vZGU6IEVsZW1lbnQsIGRlbHRhWT86IG51bWJlcikge1xuXHRcdHNjcm9sbGVkRWxlbWVudCA9IG5vZGU7XG5cdFx0aWYgKGRlbHRhWSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsYXN0VGltZVNjcm9sbGVkID0gRGF0ZS5ub3coKTtcblx0XHRcdHByZXZpb3VzRGVsdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRub2RlLnNldEF0dHJpYnV0ZSgncmVjZW50bHlTY3JvbGxlZCcsICd0cnVlJyk7XG5cdFx0XHRjbGVhclRpbWVvdXQoc2Nyb2xsVGltZW91dCk7XG5cdFx0XHRzY3JvbGxUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7IHNjcm9sbGVkRWxlbWVudD8ucmVtb3ZlQXR0cmlidXRlKCdyZWNlbnRseVNjcm9sbGVkJyk7IH0sIDMwMCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5oYXNBdHRyaWJ1dGUoJ3JlY2VudGx5U2Nyb2xsZWQnKSkge1xuXHRcdFx0aWYgKGxhc3RUaW1lU2Nyb2xsZWQgJiYgRGF0ZS5ub3coKSAtIGxhc3RUaW1lU2Nyb2xsZWQgPiA0MDApIHtcblx0XHRcdFx0Ly8gaXQgaGFzIGJlZW4gYSB3aGlsZSBzaW5jZSB3ZSBhY3R1YWxseSBzY3JvbGxlZFxuXHRcdFx0XHQvLyBpZiBzY3JvbGwgdmVsb2NpdHkgaW5jcmVhc2VzIHNpZ25pZmljYW50bHksIGl0J3MgbGlrZWx5IGEgbmV3IHNjcm9sbCBldmVudFxuXHRcdFx0XHRpZiAoISFwcmV2aW91c0RlbHRhICYmIGRlbHRhWSA8IDAgJiYgZGVsdGFZIDwgcHJldmlvdXNEZWx0YSAtIDgpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoc2Nyb2xsVGltZW91dCk7XG5cdFx0XHRcdFx0c2Nyb2xsZWRFbGVtZW50Py5yZW1vdmVBdHRyaWJ1dGUoJ3JlY2VudGx5U2Nyb2xsZWQnKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSBpZiAoISFwcmV2aW91c0RlbHRhICYmIGRlbHRhWSA+IDAgJiYgZGVsdGFZID4gcHJldmlvdXNEZWx0YSArIDgpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoc2Nyb2xsVGltZW91dCk7XG5cdFx0XHRcdFx0c2Nyb2xsZWRFbGVtZW50Py5yZW1vdmVBdHRyaWJ1dGUoJ3JlY2VudGx5U2Nyb2xsZWQnKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB0aGUgdGFpbCBlbmQgb2YgYSBzbW9vdGggc2Nyb2xsaW5nIGV2ZW50IChmcm9tIGEgdHJhY2twYWQpIGNhbiBnbyBvbiBmb3IgYSB3aGlsZVxuXHRcdFx0XHQvLyBzbyBrZWVwIHN3YWxsb3dpbmcgaXQsIGJ1dCB3ZSBjYW4gc2hvcnRlbiB0aGUgdGltZW91dCBzaW5jZSB0aGUgZXZlbnRzIG9jY3VyIHJhcGlkbHlcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHNjcm9sbFRpbWVvdXQpO1xuXHRcdFx0XHRzY3JvbGxUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7IHNjcm9sbGVkRWxlbWVudD8ucmVtb3ZlQXR0cmlidXRlKCdyZWNlbnRseVNjcm9sbGVkJyk7IH0sIDUwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChzY3JvbGxUaW1lb3V0KTtcblx0XHRcdFx0c2Nyb2xsVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4geyBzY3JvbGxlZEVsZW1lbnQ/LnJlbW92ZUF0dHJpYnV0ZSgncmVjZW50bHlTY3JvbGxlZCcpOyB9LCAzMDApO1xuXHRcdFx0fVxuXG5cdFx0XHRwcmV2aW91c0RlbHRhID0gZGVsdGFZO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gZXZlbnRUYXJnZXRTaG91bGRIYW5kbGVTY3JvbGwoZXZlbnQ6IFdoZWVsRXZlbnQpIHtcblx0XHRmb3IgKGxldCBub2RlID0gZXZlbnQudGFyZ2V0IGFzIE5vZGUgfCBudWxsOyBub2RlOyBub2RlID0gbm9kZS5wYXJlbnROb2RlKSB7XG5cdFx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgRWxlbWVudCkgfHwgbm9kZS5pZCA9PT0gJ2NvbnRhaW5lcicgfHwgbm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NlbGxfY29udGFpbmVyJykgfHwgbm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ21hcmt1cCcpIHx8IG5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdvdXRwdXRfY29udGFpbmVyJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzY3JvbGwgdXBcblx0XHRcdGlmIChldmVudC5kZWx0YVkgPCAwICYmIG5vZGUuc2Nyb2xsVG9wID4gMCkge1xuXHRcdFx0XHQvLyB0aGVyZSBpcyBzdGlsbCBzb21lIGNvbnRlbnQgdG8gc2Nyb2xsXG5cdFx0XHRcdGZsYWdSZWNlbnRseVNjcm9sbGVkKG5vZGUpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2Nyb2xsIGRvd25cblx0XHRcdGlmIChldmVudC5kZWx0YVkgPiAwICYmIG5vZGUuc2Nyb2xsVG9wICsgbm9kZS5jbGllbnRIZWlnaHQgPCBub2RlLnNjcm9sbEhlaWdodCkge1xuXHRcdFx0XHQvLyBwZXIgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VsZW1lbnQvc2Nyb2xsSGVpZ2h0XG5cdFx0XHRcdC8vIHNjcm9sbFRvcCBpcyBub3Qgcm91bmRlZCBidXQgc2Nyb2xsSGVpZ2h0IGFuZCBjbGllbnRIZWlnaHQgYXJlXG5cdFx0XHRcdC8vIHNvIHdlIG5lZWQgdG8gY2hlY2sgaWYgdGhlIGRpZmZlcmVuY2UgaXMgbGVzcyB0aGFuIHNvbWUgdGhyZXNob2xkXG5cdFx0XHRcdGlmIChub2RlLnNjcm9sbEhlaWdodCAtIG5vZGUuc2Nyb2xsVG9wIC0gbm9kZS5jbGllbnRIZWlnaHQgPCAyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBpZiB0aGUgbm9kZSBpcyBub3Qgc2Nyb2xsYWJsZSwgd2UgY2FuIGNvbnRpbnVlLiBXZSBkb24ndCBjaGVjayB0aGUgY29tcHV0ZWQgc3R5bGUgYWx3YXlzIGFzIGl0J3MgZXhwZW5zaXZlXG5cdFx0XHRcdGlmICh3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShub2RlKS5vdmVyZmxvd1kgPT09ICdoaWRkZW4nIHx8IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKG5vZGUpLm92ZXJmbG93WSA9PT0gJ3Zpc2libGUnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmbGFnUmVjZW50bHlTY3JvbGxlZChub2RlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmbGFnUmVjZW50bHlTY3JvbGxlZChub2RlLCBldmVudC5kZWx0YVkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IGhhbmRsZVdoZWVsID0gKGV2ZW50OiBXaGVlbEV2ZW50ICYgeyB3aGVlbERlbHRhWD86IG51bWJlcjsgd2hlZWxEZWx0YVk/OiBudW1iZXI7IHdoZWVsRGVsdGE/OiBudW1iZXIgfSkgPT4ge1xuXHRcdGlmIChldmVudC5kZWZhdWx0UHJldmVudGVkIHx8IGV2ZW50VGFyZ2V0U2hvdWxkSGFuZGxlU2Nyb2xsKGV2ZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JV2hlZWxNZXNzYWdlPignZGlkLXNjcm9sbC13aGVlbCcsIHtcblx0XHRcdHBheWxvYWQ6IHtcblx0XHRcdFx0ZGVsdGFNb2RlOiBldmVudC5kZWx0YU1vZGUsXG5cdFx0XHRcdGRlbHRhWDogZXZlbnQuZGVsdGFYLFxuXHRcdFx0XHRkZWx0YVk6IGV2ZW50LmRlbHRhWSxcblx0XHRcdFx0ZGVsdGFaOiBldmVudC5kZWx0YVosXG5cdFx0XHRcdC8vIFJlZnMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0NjQwMyNpc3N1ZWNvbW1lbnQtMTg1NDUzODkyOFxuXHRcdFx0XHR3aGVlbERlbHRhOiBldmVudC53aGVlbERlbHRhICYmIGlzQ2hyb21lID8gKGV2ZW50LndoZWVsRGVsdGEgLyB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbykgOiBldmVudC53aGVlbERlbHRhLFxuXHRcdFx0XHR3aGVlbERlbHRhWDogZXZlbnQud2hlZWxEZWx0YVggJiYgaXNDaHJvbWUgPyAoZXZlbnQud2hlZWxEZWx0YVggLyB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbykgOiBldmVudC53aGVlbERlbHRhWCxcblx0XHRcdFx0d2hlZWxEZWx0YVk6IGV2ZW50LndoZWVsRGVsdGFZICYmIGlzQ2hyb21lID8gKGV2ZW50LndoZWVsRGVsdGFZIC8gd2luZG93LmRldmljZVBpeGVsUmF0aW8pIDogZXZlbnQud2hlZWxEZWx0YVksXG5cdFx0XHRcdGRldGFpbDogZXZlbnQuZGV0YWlsLFxuXHRcdFx0XHRzaGlmdEtleTogZXZlbnQuc2hpZnRLZXksXG5cdFx0XHRcdHR5cGU6IGV2ZW50LnR5cGVcblx0XHRcdH1cblx0XHR9KTtcblx0fTtcblxuXHRmdW5jdGlvbiBmb2N1c0ZpcnN0Rm9jdXNhYmxlT3JDb250YWluZXJJbk91dHB1dChjZWxsT3JPdXRwdXRJZDogc3RyaW5nLCBhbHRlcm5hdGVJZD86IHN0cmluZykge1xuXHRcdGNvbnN0IGNlbGxPdXRwdXRDb250YWluZXIgPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2VsbE9yT3V0cHV0SWQpID8/XG5cdFx0XHQoISFhbHRlcm5hdGVJZCA/IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChhbHRlcm5hdGVJZCkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghIWNlbGxPdXRwdXRDb250YWluZXIpIHtcblx0XHRcdGlmIChjZWxsT3V0cHV0Q29udGFpbmVyLmNvbnRhaW5zKHdpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgZm9jdXNhYmxlRWxlbWVudCA9IGNlbGxPdXRwdXRDb250YWluZXIucXVlcnlTZWxlY3RvcignW3RhYmluZGV4PVwiMFwiXSwgW2hyZWZdLCBidXR0b24sIGlucHV0LCBvcHRpb24sIHNlbGVjdCwgdGV4dGFyZWEnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRpZiAoIWZvY3VzYWJsZUVsZW1lbnQpIHtcblx0XHRcdFx0Zm9jdXNhYmxlRWxlbWVudCA9IGNlbGxPdXRwdXRDb250YWluZXI7XG5cdFx0XHRcdGZvY3VzYWJsZUVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGxhc3RGb2N1c2VkT3V0cHV0Py5pZCAhPT0gY2VsbE91dHB1dENvbnRhaW5lci5pZCkge1xuXHRcdFx0XHRsYXN0Rm9jdXNlZE91dHB1dCA9IGNlbGxPdXRwdXRDb250YWluZXI7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklPdXRwdXRGb2N1c01lc3NhZ2U+KCdvdXRwdXRGb2N1cycsIHsgaWQ6IGNlbGxPdXRwdXRDb250YWluZXIuaWQgfSk7XG5cdFx0XHR9XG5cdFx0XHRmb2N1c2FibGVFbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRm9jdXNTaW5rKGNlbGxJZDogc3RyaW5nLCBmb2N1c05leHQ/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuaWQgPSBgZm9jdXMtc2luay0ke2NlbGxJZH1gO1xuXHRcdGVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXMnLCAoKSA9PiB7XG5cdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JRm9jdXNFZGl0b3JNZXNzYWdlPignZm9jdXMtZWRpdG9yJywge1xuXHRcdFx0XHRjZWxsSWQ6IGNlbGxJZCxcblx0XHRcdFx0Zm9jdXNOZXh0XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0ZnVuY3Rpb24gX2ludGVybmFsSGlnaGxpZ2h0UmFuZ2UocmFuZ2U6IFJhbmdlLCB0YWdOYW1lID0gJ21hcmsnLCBhdHRyaWJ1dGVzID0ge30pIHtcblx0XHQvLyBkZXJpdmVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL1RyZW9yYS9kb20taGlnaGxpZ2h0LXJhbmdlL2Jsb2IvbWFzdGVyL2hpZ2hsaWdodC1yYW5nZS5qc1xuXG5cdFx0Ly8gUmV0dXJuIGFuIGFycmF5IG9mIHRoZSB0ZXh0IG5vZGVzIGluIHRoZSByYW5nZS4gU3BsaXQgdGhlIHN0YXJ0IGFuZCBlbmQgbm9kZXMgaWYgcmVxdWlyZWQuXG5cdFx0ZnVuY3Rpb24gX3RleHROb2Rlc0luUmFuZ2UocmFuZ2U6IFJhbmdlKTogVGV4dFtdIHtcblx0XHRcdGlmICghcmFuZ2Uuc3RhcnRDb250YWluZXIub3duZXJEb2N1bWVudCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBzdGFydCBvciBlbmQgbm9kZSBpcyBhIHRleHQgbm9kZSBhbmQgb25seSBwYXJ0bHkgaW4gdGhlIHJhbmdlLCBzcGxpdCBpdC5cblx0XHRcdGlmIChyYW5nZS5zdGFydENvbnRhaW5lci5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUgJiYgcmFuZ2Uuc3RhcnRPZmZzZXQgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0Q29udGFpbmVyID0gcmFuZ2Uuc3RhcnRDb250YWluZXIgYXMgVGV4dDtcblx0XHRcdFx0Y29uc3QgZW5kT2Zmc2V0ID0gcmFuZ2UuZW5kT2Zmc2V0OyAvLyAodGhpcyBtYXkgZ2V0IGxvc3Qgd2hlbiB0aGUgc3BsaXR0aW5nIHRoZSBub2RlKVxuXHRcdFx0XHRjb25zdCBjcmVhdGVkTm9kZSA9IHN0YXJ0Q29udGFpbmVyLnNwbGl0VGV4dChyYW5nZS5zdGFydE9mZnNldCk7XG5cdFx0XHRcdGlmIChyYW5nZS5lbmRDb250YWluZXIgPT09IHN0YXJ0Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlIGVuZCB3YXMgaW4gdGhlIHNhbWUgY29udGFpbmVyLCBpdCB3aWxsIG5vdyBiZSBpbiB0aGUgbmV3bHkgY3JlYXRlZCBub2RlLlxuXHRcdFx0XHRcdHJhbmdlLnNldEVuZChjcmVhdGVkTm9kZSwgZW5kT2Zmc2V0IC0gcmFuZ2Uuc3RhcnRPZmZzZXQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmFuZ2Uuc2V0U3RhcnQoY3JlYXRlZE5vZGUsIDApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdHJhbmdlLmVuZENvbnRhaW5lci5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREVcblx0XHRcdFx0JiYgcmFuZ2UuZW5kT2Zmc2V0IDwgKHJhbmdlLmVuZENvbnRhaW5lciBhcyBUZXh0KS5sZW5ndGhcblx0XHRcdCkge1xuXHRcdFx0XHQocmFuZ2UuZW5kQ29udGFpbmVyIGFzIFRleHQpLnNwbGl0VGV4dChyYW5nZS5lbmRPZmZzZXQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb2xsZWN0IHRoZSB0ZXh0IG5vZGVzLlxuXHRcdFx0Y29uc3Qgd2Fsa2VyID0gcmFuZ2Uuc3RhcnRDb250YWluZXIub3duZXJEb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKFxuXHRcdFx0XHRyYW5nZS5jb21tb25BbmNlc3RvckNvbnRhaW5lcixcblx0XHRcdFx0Tm9kZUZpbHRlci5TSE9XX1RFWFQsXG5cdFx0XHRcdG5vZGUgPT4gcmFuZ2UuaW50ZXJzZWN0c05vZGUobm9kZSkgPyBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQgOiBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1QsXG5cdFx0XHQpO1xuXG5cdFx0XHR3YWxrZXIuY3VycmVudE5vZGUgPSByYW5nZS5zdGFydENvbnRhaW5lcjtcblxuXHRcdFx0Ly8gLy8gT3B0aW1pc2UgYnkgc2tpcHBpbmcgbm9kZXMgdGhhdCBhcmUgZXhwbGljaXRseSBvdXRzaWRlIHRoZSByYW5nZS5cblx0XHRcdC8vIGNvbnN0IE5vZGVUeXBlc1dpdGhDaGFyYWN0ZXJPZmZzZXQgPSBbXG5cdFx0XHQvLyAgTm9kZS5URVhUX05PREUsXG5cdFx0XHQvLyAgTm9kZS5QUk9DRVNTSU5HX0lOU1RSVUNUSU9OX05PREUsXG5cdFx0XHQvLyAgTm9kZS5DT01NRU5UX05PREUsXG5cdFx0XHQvLyBdO1xuXHRcdFx0Ly8gaWYgKCFOb2RlVHlwZXNXaXRoQ2hhcmFjdGVyT2Zmc2V0LmluY2x1ZGVzKHJhbmdlLnN0YXJ0Q29udGFpbmVyLm5vZGVUeXBlKSkge1xuXHRcdFx0Ly8gICBpZiAocmFuZ2Uuc3RhcnRPZmZzZXQgPCByYW5nZS5zdGFydENvbnRhaW5lci5jaGlsZE5vZGVzLmxlbmd0aCkge1xuXHRcdFx0Ly8gICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IHJhbmdlLnN0YXJ0Q29udGFpbmVyLmNoaWxkTm9kZXNbcmFuZ2Uuc3RhcnRPZmZzZXRdO1xuXHRcdFx0Ly8gICB9IGVsc2Uge1xuXHRcdFx0Ly8gICAgIHdhbGtlci5uZXh0U2libGluZygpOyAvLyBUT0RPIHZlcmlmeSB0aGlzIGlzIGNvcnJlY3QuXG5cdFx0XHQvLyAgIH1cblx0XHRcdC8vIH1cblxuXHRcdFx0Y29uc3Qgbm9kZXM6IFRleHRbXSA9IFtdO1xuXHRcdFx0aWYgKHdhbGtlci5jdXJyZW50Tm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcblx0XHRcdFx0bm9kZXMucHVzaCh3YWxrZXIuY3VycmVudE5vZGUgYXMgVGV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdHdoaWxlICh3YWxrZXIubmV4dE5vZGUoKSAmJiByYW5nZS5jb21wYXJlUG9pbnQod2Fsa2VyLmN1cnJlbnROb2RlLCAwKSAhPT0gMSkge1xuXHRcdFx0XHRpZiAod2Fsa2VyLmN1cnJlbnROb2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkge1xuXHRcdFx0XHRcdG5vZGVzLnB1c2god2Fsa2VyLmN1cnJlbnROb2RlIGFzIFRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBub2Rlcztcblx0XHR9XG5cblx0XHQvLyBSZXBsYWNlIFtub2RlXSB3aXRoIDx0YWdOYW1lIC4uLmF0dHJpYnV0ZXM+W25vZGVdPC90YWdOYW1lPlxuXHRcdGZ1bmN0aW9uIHdyYXBOb2RlSW5IaWdobGlnaHQobm9kZTogVGV4dCwgdGFnTmFtZTogc3RyaW5nLCBhdHRyaWJ1dGVzOiBhbnkpIHtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodEVsZW1lbnQgPSBub2RlLm93bmVyRG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcblx0XHRcdE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpLmZvckVhY2goa2V5ID0+IHtcblx0XHRcdFx0aGlnaGxpZ2h0RWxlbWVudC5zZXRBdHRyaWJ1dGUoa2V5LCBhdHRyaWJ1dGVzW2tleV0pO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0ZW1wUmFuZ2UgPSBub2RlLm93bmVyRG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0XHRcdHRlbXBSYW5nZS5zZWxlY3ROb2RlKG5vZGUpO1xuXHRcdFx0dGVtcFJhbmdlLnN1cnJvdW5kQ29udGVudHMoaGlnaGxpZ2h0RWxlbWVudCk7XG5cdFx0XHRyZXR1cm4gaGlnaGxpZ2h0RWxlbWVudDtcblx0XHR9XG5cblx0XHRpZiAocmFuZ2UuY29sbGFwc2VkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0dXBkYXRlOiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRmlyc3QgcHV0IGFsbCBub2RlcyBpbiBhbiBhcnJheSAoc3BsaXRzIHN0YXJ0IGFuZCBlbmQgbm9kZXMgaWYgbmVlZGVkKVxuXHRcdGNvbnN0IG5vZGVzID0gX3RleHROb2Rlc0luUmFuZ2UocmFuZ2UpO1xuXG5cdFx0Ly8gSGlnaGxpZ2h0IGVhY2ggbm9kZVxuXHRcdGNvbnN0IGhpZ2hsaWdodEVsZW1lbnRzOiBFbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG5vZGVJZHggaW4gbm9kZXMpIHtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodEVsZW1lbnQgPSB3cmFwTm9kZUluSGlnaGxpZ2h0KG5vZGVzW25vZGVJZHhdLCB0YWdOYW1lLCBhdHRyaWJ1dGVzKTtcblx0XHRcdGhpZ2hsaWdodEVsZW1lbnRzLnB1c2goaGlnaGxpZ2h0RWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGEgaGlnaGxpZ2h0IGVsZW1lbnQgY3JlYXRlZCB3aXRoIHdyYXBOb2RlSW5IaWdobGlnaHQuXG5cdFx0ZnVuY3Rpb24gX3JlbW92ZUhpZ2hsaWdodChoaWdobGlnaHRFbGVtZW50OiBFbGVtZW50KSB7XG5cdFx0XHRpZiAoaGlnaGxpZ2h0RWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRoaWdobGlnaHRFbGVtZW50LnJlcGxhY2VXaXRoKGhpZ2hsaWdodEVsZW1lbnQuZmlyc3RDaGlsZCEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGhpZ2hsaWdodCBzb21laG93IGNvbnRhaW5zIG11bHRpcGxlIG5vZGVzIG5vdywgbW92ZSB0aGVtIGFsbC5cblx0XHRcdFx0d2hpbGUgKGhpZ2hsaWdodEVsZW1lbnQuZmlyc3RDaGlsZCkge1xuXHRcdFx0XHRcdGhpZ2hsaWdodEVsZW1lbnQucGFyZW50Tm9kZT8uaW5zZXJ0QmVmb3JlKGhpZ2hsaWdodEVsZW1lbnQuZmlyc3RDaGlsZCwgaGlnaGxpZ2h0RWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGlnaGxpZ2h0RWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gYSBmdW5jdGlvbiB0aGF0IGNsZWFucyB1cCB0aGUgaGlnaGxpZ2h0RWxlbWVudHMuXG5cdFx0ZnVuY3Rpb24gX3JlbW92ZUhpZ2hsaWdodHMoKSB7XG5cdFx0XHQvLyBSZW1vdmUgZWFjaCBvZiB0aGUgY3JlYXRlZCBoaWdobGlnaHRFbGVtZW50cy5cblx0XHRcdGZvciAoY29uc3QgaGlnaGxpZ2h0SWR4IGluIGhpZ2hsaWdodEVsZW1lbnRzKSB7XG5cdFx0XHRcdF9yZW1vdmVIaWdobGlnaHQoaGlnaGxpZ2h0RWxlbWVudHNbaGlnaGxpZ2h0SWR4XSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gX3VwZGF0ZUhpZ2hsaWdodChoaWdobGlnaHRFbGVtZW50OiBFbGVtZW50LCBhdHRyaWJ1dGVzOiBhbnkgPSB7fSkge1xuXHRcdFx0T2JqZWN0LmtleXMoYXR0cmlidXRlcykuZm9yRWFjaChrZXkgPT4ge1xuXHRcdFx0XHRoaWdobGlnaHRFbGVtZW50LnNldEF0dHJpYnV0ZShrZXksIGF0dHJpYnV0ZXNba2V5XSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB1cGRhdGVIaWdobGlnaHRzKGF0dHJpYnV0ZXM6IGFueSkge1xuXHRcdFx0Zm9yIChjb25zdCBoaWdobGlnaHRJZHggaW4gaGlnaGxpZ2h0RWxlbWVudHMpIHtcblx0XHRcdFx0X3VwZGF0ZUhpZ2hsaWdodChoaWdobGlnaHRFbGVtZW50c1toaWdobGlnaHRJZHhdLCBhdHRyaWJ1dGVzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVtb3ZlOiBfcmVtb3ZlSGlnaGxpZ2h0cyxcblx0XHRcdHVwZGF0ZTogdXBkYXRlSGlnaGxpZ2h0c1xuXHRcdH07XG5cdH1cblxuXHRpbnRlcmZhY2UgSUNvbW1vblJhbmdlIHtcblx0XHRjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdFx0Y29tbW9uQW5jZXN0b3JDb250YWluZXI6IE5vZGU7XG5cdFx0ZW5kQ29udGFpbmVyOiBOb2RlO1xuXHRcdGVuZE9mZnNldDogbnVtYmVyO1xuXHRcdHN0YXJ0Q29udGFpbmVyOiBOb2RlO1xuXHRcdHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cblx0fVxuXG5cdGludGVyZmFjZSBJSGlnaGxpZ2h0UmVzdWx0IHtcblx0XHRyYW5nZTogSUNvbW1vblJhbmdlO1xuXHRcdGRpc3Bvc2U6ICgpID0+IHZvaWQ7XG5cdFx0dXBkYXRlOiAoY29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCwgY2xhc3NOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBzZWxlY3RSYW5nZShfcmFuZ2U6IElDb21tb25SYW5nZSkge1xuXHRcdGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0XHRcdGNvbnN0IHIgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuXHRcdFx0XHRyLnNldFN0YXJ0KF9yYW5nZS5zdGFydENvbnRhaW5lciwgX3JhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0ci5zZXRFbmQoX3JhbmdlLmVuZENvbnRhaW5lciwgX3JhbmdlLmVuZE9mZnNldCk7XG5cdFx0XHRcdHNlbC5hZGRSYW5nZShyKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaGlnaGxpZ2h0UmFuZ2UocmFuZ2U6IFJhbmdlLCB1c2VDdXN0b206IGJvb2xlYW4sIHRhZ05hbWUgPSAnbWFyaycsIGF0dHJpYnV0ZXMgPSB7fSk6IElIaWdobGlnaHRSZXN1bHQge1xuXHRcdGlmICh1c2VDdXN0b20pIHtcblx0XHRcdGNvbnN0IHJldCA9IF9pbnRlcm5hbEhpZ2hsaWdodFJhbmdlKHJhbmdlLCB0YWdOYW1lLCBhdHRyaWJ1dGVzKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdFx0ZGlzcG9zZTogcmV0LnJlbW92ZSxcblx0XHRcdFx0dXBkYXRlOiAoY29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCwgY2xhc3NOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0XHRpZiAoY2xhc3NOYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldC51cGRhdGUoe1xuXHRcdFx0XHRcdFx0XHQnc3R5bGUnOiBgYmFja2dyb3VuZC1jb2xvcjogJHtjb2xvcn1gXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0LnVwZGF0ZSh7XG5cdFx0XHRcdFx0XHRcdCdjbGFzcyc6IGNsYXNzTmFtZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aW5kb3cuZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2hpbGl0ZUNvbG9yJywgZmFsc2UsIG1hdGNoQ29sb3IpO1xuXHRcdFx0Y29uc3QgY2xvbmVSYW5nZSA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKSEuZ2V0UmFuZ2VBdCgwKS5jbG9uZVJhbmdlKCk7XG5cdFx0XHRjb25zdCBfcmFuZ2UgPSB7XG5cdFx0XHRcdGNvbGxhcHNlZDogY2xvbmVSYW5nZS5jb2xsYXBzZWQsXG5cdFx0XHRcdGNvbW1vbkFuY2VzdG9yQ29udGFpbmVyOiBjbG9uZVJhbmdlLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyLFxuXHRcdFx0XHRlbmRDb250YWluZXI6IGNsb25lUmFuZ2UuZW5kQ29udGFpbmVyLFxuXHRcdFx0XHRlbmRPZmZzZXQ6IGNsb25lUmFuZ2UuZW5kT2Zmc2V0LFxuXHRcdFx0XHRzdGFydENvbnRhaW5lcjogY2xvbmVSYW5nZS5zdGFydENvbnRhaW5lcixcblx0XHRcdFx0c3RhcnRPZmZzZXQ6IGNsb25lUmFuZ2Uuc3RhcnRPZmZzZXRcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogX3JhbmdlLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0c2VsZWN0UmFuZ2UoX3JhbmdlKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuZGVzaWduTW9kZSA9ICdPbic7XG5cdFx0XHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ3JlbW92ZUZvcm1hdCcsIGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuZGVzaWduTW9kZSA9ICdPZmYnO1xuXHRcdFx0XHRcdFx0d2luZG93LmdldFNlbGVjdGlvbigpPy5yZW1vdmVBbGxSYW5nZXMoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVwZGF0ZTogKGNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdFx0c2VsZWN0UmFuZ2UoX3JhbmdlKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuZGVzaWduTW9kZSA9ICdPbic7XG5cdFx0XHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ3JlbW92ZUZvcm1hdCcsIGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0d2luZG93LmRvY3VtZW50LmV4ZWNDb21tYW5kKCdoaWxpdGVDb2xvcicsIGZhbHNlLCBjb2xvcik7XG5cdFx0XHRcdFx0XHRkb2N1bWVudC5kZXNpZ25Nb2RlID0gJ09mZic7XG5cdFx0XHRcdFx0XHR3aW5kb3cuZ2V0U2VsZWN0aW9uKCk/LnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVFbWl0dGVyPFQ+KGxpc3RlbmVyQ2hhbmdlOiAobGlzdGVuZXJzOiBTZXQ8TGlzdGVuZXI8VD4+KSA9PiB2b2lkID0gKCkgPT4gdW5kZWZpbmVkKTogRW1pdHRlckxpa2U8VD4ge1xuXHRcdGNvbnN0IGxpc3RlbmVycyA9IG5ldyBTZXQ8TGlzdGVuZXI8VD4+KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpcmUoZGF0YSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIFsuLi5saXN0ZW5lcnNdKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZm4uY2FsbChsaXN0ZW5lci50aGlzQXJnLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGV2ZW50KGZuLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5lck9iaiA9IHsgZm4sIHRoaXNBcmcgfTtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSB7XG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lck9iaik7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lckNoYW5nZShsaXN0ZW5lcnMpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0bGlzdGVuZXJzLmFkZChsaXN0ZW5lck9iaik7XG5cdFx0XHRcdGxpc3RlbmVyQ2hhbmdlKGxpc3RlbmVycyk7XG5cblx0XHRcdFx0aWYgKGRpc3Bvc2FibGVzIGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5wdXNoKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzaG93UmVuZGVyRXJyb3IoZXJyb3JUZXh0OiBzdHJpbmcsIG91dHB1dE5vZGU6IEhUTUxFbGVtZW50LCBlcnJvcnM6IHJlYWRvbmx5IEVycm9yW10pIHtcblx0XHRvdXRwdXROb2RlLmlubmVyVGV4dCA9IGVycm9yVGV4dDtcblx0XHRjb25zdCBlcnJMaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiBlcnJvcnMpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IocmVzdWx0KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuXHRcdFx0aXRlbS5pbm5lclRleHQgPSByZXN1bHQubWVzc2FnZTtcblx0XHRcdGVyckxpc3QuYXBwZW5kQ2hpbGQoaXRlbSk7XG5cdFx0fVxuXHRcdG91dHB1dE5vZGUuYXBwZW5kQ2hpbGQoZXJyTGlzdCk7XG5cdH1cblxuXHRjb25zdCBvdXRwdXRJdGVtUmVxdWVzdHMgPSBuZXcgY2xhc3Mge1xuXHRcdHByaXZhdGUgX3JlcXVlc3RQb29sID0gMDtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0cyA9IG5ldyBNYXA8LypyZXF1ZXN0SWQqL251bWJlciwgeyByZXNvbHZlOiAoeDogd2Vidmlld01lc3NhZ2VzLk91dHB1dEl0ZW1FbnRyeSB8IHVuZGVmaW5lZCkgPT4gdm9pZCB9PigpO1xuXG5cdFx0Z2V0T3V0cHV0SXRlbShvdXRwdXRJZDogc3RyaW5nLCBtaW1lOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRoaXMuX3JlcXVlc3RQb29sKys7XG5cblx0XHRcdGNvbnN0IHsgcHJvbWlzZSwgcmVzb2x2ZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8d2Vidmlld01lc3NhZ2VzLk91dHB1dEl0ZW1FbnRyeSB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdHRoaXMuX3JlcXVlc3RzLnNldChyZXF1ZXN0SWQsIHsgcmVzb2x2ZSB9KTtcblxuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUdldE91dHB1dEl0ZW1NZXNzYWdlPignZ2V0T3V0cHV0SXRlbScsIHsgcmVxdWVzdElkLCBvdXRwdXRJZCwgbWltZSB9KTtcblx0XHRcdHJldHVybiBwcm9taXNlO1xuXHRcdH1cblxuXHRcdHJlc29sdmVPdXRwdXRJdGVtKHJlcXVlc3RJZDogbnVtYmVyLCBvdXRwdXQ6IHdlYnZpZXdNZXNzYWdlcy5PdXRwdXRJdGVtRW50cnkgfCB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLl9yZXF1ZXN0cy5nZXQocmVxdWVzdElkKTtcblx0XHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlcXVlc3RzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0cmVxdWVzdC5yZXNvbHZlKG91dHB1dCk7XG5cdFx0fVxuXHR9O1xuXG5cdGludGVyZmFjZSBBZGRpdGlvbmFsT3V0cHV0SXRlbUluZm8ge1xuXHRcdHJlYWRvbmx5IG1pbWU6IHN0cmluZztcblx0XHRnZXRJdGVtKCk6IFByb21pc2U8cmVuZGVyZXJBcGkuT3V0cHV0SXRlbSB8IHVuZGVmaW5lZD47XG5cdH1cblxuXHRpbnRlcmZhY2UgRXh0ZW5kZWRPdXRwdXRJdGVtIGV4dGVuZHMgcmVuZGVyZXJBcGkuT3V0cHV0SXRlbSB7XG5cdFx0cmVhZG9ubHkgX2FsbE91dHB1dEl0ZW1zOiBSZWFkb25seUFycmF5PEFkZGl0aW9uYWxPdXRwdXRJdGVtSW5mbz47XG5cdFx0YXBwZW5kZWRUZXh0PygpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgaGFzV2FybmVkQWJvdXRBbGxPdXRwdXRJdGVtc1Byb3Bvc2FsID0gZmFsc2U7XG5cblx0ZnVuY3Rpb24gY3JlYXRlT3V0cHV0SXRlbShcblx0XHRpZDogc3RyaW5nLFxuXHRcdG1pbWU6IHN0cmluZyxcblx0XHRtZXRhZGF0YTogdW5rbm93bixcblx0XHR2YWx1ZUJ5dGVzOiBVaW50OEFycmF5LFxuXHRcdGFsbE91dHB1dEl0ZW1EYXRhOiBSZWFkb25seUFycmF5PHsgcmVhZG9ubHkgbWltZTogc3RyaW5nIH0+LFxuXHRcdGFwcGVuZGVkPzogeyB2YWx1ZUJ5dGVzOiBVaW50OEFycmF5OyBwcmV2aW91c1ZlcnNpb246IG51bWJlciB9XG5cdCk6IEV4dGVuZGVkT3V0cHV0SXRlbSB7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGUoXG5cdFx0XHRpZDogc3RyaW5nLFxuXHRcdFx0bWltZTogc3RyaW5nLFxuXHRcdFx0bWV0YWRhdGE6IHVua25vd24sXG5cdFx0XHR2YWx1ZUJ5dGVzOiBVaW50OEFycmF5LFxuXHRcdFx0YXBwZW5kZWQ/OiB7IHZhbHVlQnl0ZXM6IFVpbnQ4QXJyYXk7IHByZXZpb3VzVmVyc2lvbjogbnVtYmVyIH1cblx0XHQpOiBFeHRlbmRlZE91dHB1dEl0ZW0ge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5mcmVlemU8RXh0ZW5kZWRPdXRwdXRJdGVtPih7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRtaW1lLFxuXHRcdFx0XHRtZXRhZGF0YSxcblxuXHRcdFx0XHRhcHBlbmRlZFRleHQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0XHRpZiAoYXBwZW5kZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0ZXh0RGVjb2Rlci5kZWNvZGUoYXBwZW5kZWQudmFsdWVCeXRlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0ZGF0YSgpOiBVaW50OEFycmF5IHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWVCeXRlcztcblx0XHRcdFx0fSxcblxuXHRcdFx0XHR0ZXh0KCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIHRleHREZWNvZGVyLmRlY29kZSh2YWx1ZUJ5dGVzKTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRqc29uKCkge1xuXHRcdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMudGV4dCgpKTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRibG9iKCk6IEJsb2Ige1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQmxvYihbdmFsdWVCeXRlcyBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPl0sIHsgdHlwZTogdGhpcy5taW1lIH0pO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGdldCBfYWxsT3V0cHV0SXRlbXMoKSB7XG5cdFx0XHRcdFx0aWYgKCFoYXNXYXJuZWRBYm91dEFsbE91dHB1dEl0ZW1zUHJvcG9zYWwpIHtcblx0XHRcdFx0XHRcdGhhc1dhcm5lZEFib3V0QWxsT3V0cHV0SXRlbXNQcm9wb3NhbCA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oYCdfYWxsT3V0cHV0SXRlbXMnIGlzIHByb3Bvc2VkIEFQSS4gRE8gTk9UIHNoaXAgYW4gZXh0ZW5zaW9uIHRoYXQgZGVwZW5kcyBvbiBpdCFgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGFsbE91dHB1dEl0ZW1MaXN0O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsT3V0cHV0SXRlbUNhY2hlID0gbmV3IE1hcDwvKm1pbWUqL3N0cmluZywgUHJvbWlzZTwocmVuZGVyZXJBcGkuT3V0cHV0SXRlbSAmIEV4dGVuZGVkT3V0cHV0SXRlbSkgfCB1bmRlZmluZWQ+PigpO1xuXHRcdGNvbnN0IGFsbE91dHB1dEl0ZW1MaXN0ID0gT2JqZWN0LmZyZWV6ZShhbGxPdXRwdXRJdGVtRGF0YS5tYXAob3V0cHV0SXRlbSA9PiB7XG5cdFx0XHRjb25zdCBtaW1lID0gb3V0cHV0SXRlbS5taW1lO1xuXHRcdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRtaW1lLFxuXHRcdFx0XHRnZXRJdGVtKCkge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nVGFzayA9IGFsbE91dHB1dEl0ZW1DYWNoZS5nZXQobWltZSk7XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nVGFzaykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nVGFzaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB0YXNrID0gb3V0cHV0SXRlbVJlcXVlc3RzLmdldE91dHB1dEl0ZW0oaWQsIG1pbWUpLnRoZW4oaXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbSA/IGNyZWF0ZShpZCwgaXRlbS5taW1lLCBtZXRhZGF0YSwgaXRlbS52YWx1ZUJ5dGVzKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhbGxPdXRwdXRJdGVtQ2FjaGUuc2V0KG1pbWUsIHRhc2spO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBjcmVhdGUoaWQsIG1pbWUsIG1ldGFkYXRhLCB2YWx1ZUJ5dGVzLCBhcHBlbmRlZCk7XG5cdFx0YWxsT3V0cHV0SXRlbUNhY2hlLnNldChtaW1lLCBQcm9taXNlLnJlc29sdmUoaXRlbSkpO1xuXHRcdHJldHVybiBpdGVtO1xuXHR9XG5cblx0Y29uc3Qgb25EaWRSZWNlaXZlS2VybmVsTWVzc2FnZSA9IGNyZWF0ZUVtaXR0ZXI8dW5rbm93bj4oKTtcblxuXHRjb25zdCB0dFBvbGljeSA9IHdpbmRvdy50cnVzdGVkVHlwZXM/LmNyZWF0ZVBvbGljeSgnbm90ZWJvb2tSZW5kZXJlcicsIHtcblx0XHRjcmVhdGVIVE1MOiB2YWx1ZSA9PiB2YWx1ZSwgLy8gQ29kZVFMIFtTTTAzNzEyXSBUaGUgcmVuZGVyZWQgY29udGVudCBpcyBwcm92aWRlZCBieSByZW5kZXJlciBleHRlbnNpb25zLCB3aGljaCBhcmUgcmVzcG9uc2libGUgZm9yIHNhbml0aXppbmcgdGhlaXIgY29udGVudCB0aGVtc2VsdmVzLiBUaGUgbm90ZWJvb2sgd2VidmlldyBpcyBhbHNvIHNhbmRib3hlZC5cblx0XHRjcmVhdGVTY3JpcHQ6IHZhbHVlID0+IHZhbHVlLCAvLyBDb2RlUUwgW1NNMDM3MTJdIFRoZSByZW5kZXJlZCBjb250ZW50IGlzIHByb3ZpZGVkIGJ5IHJlbmRlcmVyIGV4dGVuc2lvbnMsIHdoaWNoIGFyZSByZXNwb25zaWJsZSBmb3Igc2FuaXRpemluZyB0aGVpciBjb250ZW50IHRoZW1zZWx2ZXMuIFRoZSBub3RlYm9vayB3ZWJ2aWV3IGlzIGFsc28gc2FuZGJveGVkLlxuXHR9KTtcblxuXHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBoYW5kbGVXaGVlbCk7XG5cblx0aW50ZXJmYWNlIElGaW5kTWF0Y2gge1xuXHRcdHR5cGU6ICdwcmV2aWV3JyB8ICdvdXRwdXQnO1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0Y2VsbElkOiBzdHJpbmc7XG5cdFx0Y29udGFpbmVyOiBOb2RlO1xuXHRcdG9yaWdpbmFsUmFuZ2U6IFJhbmdlO1xuXHRcdGlzU2hhZG93OiBib29sZWFuO1xuXHRcdHNlYXJjaFByZXZpZXdJbmZvPzogSVNlYXJjaFByZXZpZXdJbmZvO1xuXHRcdGhpZ2hsaWdodFJlc3VsdD86IElIaWdobGlnaHRSZXN1bHQ7XG5cdH1cblxuXHRpbnRlcmZhY2UgSVNlYXJjaFByZXZpZXdJbmZvIHtcblx0XHRsaW5lOiBzdHJpbmc7XG5cdFx0cmFuZ2U6IHtcblx0XHRcdHN0YXJ0OiBudW1iZXI7XG5cdFx0XHRlbmQ6IG51bWJlcjtcblx0XHR9O1xuXHR9XG5cblx0aW50ZXJmYWNlIElIaWdobGlnaHRlciB7XG5cdFx0YWRkSGlnaGxpZ2h0cyhtYXRjaGVzOiBJRmluZE1hdGNoW10sIG93bmVySUQ6IHN0cmluZyk6IHZvaWQ7XG5cdFx0cmVtb3ZlSGlnaGxpZ2h0cyhvd25lcklEOiBzdHJpbmcpOiB2b2lkO1xuXHRcdGhpZ2hsaWdodEN1cnJlbnRNYXRjaChpbmRleDogbnVtYmVyLCBvd25lcklEOiBzdHJpbmcpOiB2b2lkO1xuXHRcdHVuSGlnaGxpZ2h0Q3VycmVudE1hdGNoKGluZGV4OiBudW1iZXIsIG93bmVySUQ6IHN0cmluZyk6IHZvaWQ7XG5cdFx0ZGlzcG9zZSgpOiB2b2lkO1xuXHR9XG5cblx0aW50ZXJmYWNlIElIaWdobGlnaHRJbmZvIHtcblx0XHRtYXRjaGVzOiBJRmluZE1hdGNoW107XG5cdFx0Y3VycmVudE1hdGNoSW5kZXg6IG51bWJlcjtcblx0fVxuXG5cdGNvbnN0IG1hdGNoQ29sb3IgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSh3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ19kZWZhdWx0Q29sb3JQYWxhdHRlJykhKS5jb2xvcjtcblx0Y29uc3QgY3VycmVudE1hdGNoQ29sb3IgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSh3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ19kZWZhdWx0Q29sb3JQYWxhdHRlJykhKS5iYWNrZ3JvdW5kQ29sb3I7XG5cblx0Y2xhc3MgSlNIaWdobGlnaHRlciBpbXBsZW1lbnRzIElIaWdobGlnaHRlciB7XG5cdFx0cHJpdmF0ZSBfYWN0aXZlSGlnaGxpZ2h0SW5mbzogTWFwPHN0cmluZywgSUhpZ2hsaWdodEluZm8+O1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvID0gbmV3IE1hcCgpO1xuXHRcdH1cblxuXHRcdGFkZEhpZ2hsaWdodHMobWF0Y2hlczogSUZpbmRNYXRjaFtdLCBvd25lcklEOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGZvciAobGV0IGkgPSBtYXRjaGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gbWF0Y2hlc1tpXTtcblx0XHRcdFx0Y29uc3QgcmV0ID0gaGlnaGxpZ2h0UmFuZ2UobWF0Y2gub3JpZ2luYWxSYW5nZSwgdHJ1ZSwgJ21hcmsnLCBtYXRjaC5pc1NoYWRvdyA/IHtcblx0XHRcdFx0XHQnc3R5bGUnOiAnYmFja2dyb3VuZC1jb2xvcjogJyArIG1hdGNoQ29sb3IgKyAnOycsXG5cdFx0XHRcdH0gOiB7XG5cdFx0XHRcdFx0J2NsYXNzJzogJ2ZpbmQtbWF0Y2gnXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRtYXRjaC5oaWdobGlnaHRSZXN1bHQgPSByZXQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhpZ2hsaWdodEluZm86IElIaWdobGlnaHRJbmZvID0ge1xuXHRcdFx0XHRtYXRjaGVzLFxuXHRcdFx0XHRjdXJyZW50TWF0Y2hJbmRleDogLTFcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvLnNldChvd25lcklELCBoaWdobGlnaHRJbmZvKTtcblx0XHR9XG5cblx0XHRyZW1vdmVIaWdobGlnaHRzKG93bmVySUQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5nZXQob3duZXJJRCk/Lm1hdGNoZXMuZm9yRWFjaChtYXRjaCA9PiB7XG5cdFx0XHRcdG1hdGNoLmhpZ2hsaWdodFJlc3VsdD8uZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvLmRlbGV0ZShvd25lcklEKTtcblx0XHR9XG5cblx0XHRoaWdobGlnaHRDdXJyZW50TWF0Y2goaW5kZXg6IG51bWJlciwgb3duZXJJRDogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRJbmZvID0gdGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5nZXQob3duZXJJRCk7XG5cdFx0XHRpZiAoIWhpZ2hsaWdodEluZm8pIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignTW9kaWZpZWQgY3VycmVudCBoaWdobGlnaHQgbWF0Y2ggYmVmb3JlIGFkZGluZyBoaWdobGlnaHQgbGlzdC4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb2xkTWF0Y2ggPSBoaWdobGlnaHRJbmZvLm1hdGNoZXNbaGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleF07XG5cdFx0XHRvbGRNYXRjaD8uaGlnaGxpZ2h0UmVzdWx0Py51cGRhdGUobWF0Y2hDb2xvciwgb2xkTWF0Y2guaXNTaGFkb3cgPyB1bmRlZmluZWQgOiAnZmluZC1tYXRjaCcpO1xuXG5cdFx0XHRjb25zdCBtYXRjaCA9IGhpZ2hsaWdodEluZm8ubWF0Y2hlc1tpbmRleF07XG5cdFx0XHRoaWdobGlnaHRJbmZvLmN1cnJlbnRNYXRjaEluZGV4ID0gaW5kZXg7XG5cdFx0XHRjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoISFtYXRjaCAmJiAhIXNlbCAmJiBtYXRjaC5oaWdobGlnaHRSZXN1bHQpIHtcblx0XHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3V0cHV0T2Zmc2V0ID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG1hdGNoLmlkKSEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdGNvbnN0IHRlbXBSYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG5cdFx0XHRcdFx0dGVtcFJhbmdlLnNlbGVjdE5vZGUobWF0Y2guaGlnaGxpZ2h0UmVzdWx0LnJhbmdlLnN0YXJ0Q29udGFpbmVyKTtcblxuXHRcdFx0XHRcdG1hdGNoLmhpZ2hsaWdodFJlc3VsdC5yYW5nZS5zdGFydENvbnRhaW5lci5wYXJlbnRFbGVtZW50Py5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnYXV0bycsIGJsb2NrOiAnZW5kJywgaW5saW5lOiAnbmVhcmVzdCcgfSk7XG5cblx0XHRcdFx0XHRjb25zdCByYW5nZU9mZnNldCA9IHRlbXBSYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3A7XG5cdFx0XHRcdFx0dGVtcFJhbmdlLmRldGFjaCgpO1xuXG5cdFx0XHRcdFx0b2Zmc2V0ID0gcmFuZ2VPZmZzZXQgLSBvdXRwdXRPZmZzZXQ7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bWF0Y2guaGlnaGxpZ2h0UmVzdWx0Py51cGRhdGUoY3VycmVudE1hdGNoQ29sb3IsIG1hdGNoLmlzU2hhZG93ID8gdW5kZWZpbmVkIDogJ2N1cnJlbnQtZmluZC1tYXRjaCcpO1xuXG5cdFx0XHRcdHdpbmRvdy5kb2N1bWVudC5nZXRTZWxlY3Rpb24oKT8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2UoJ2RpZEZpbmRIaWdobGlnaHRDdXJyZW50Jywge1xuXHRcdFx0XHRcdG9mZnNldFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR1bkhpZ2hsaWdodEN1cnJlbnRNYXRjaChpbmRleDogbnVtYmVyLCBvd25lcklEOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodEluZm8gPSB0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvLmdldChvd25lcklEKTtcblx0XHRcdGlmICghaGlnaGxpZ2h0SW5mbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvbGRNYXRjaCA9IGhpZ2hsaWdodEluZm8ubWF0Y2hlc1tpbmRleF07XG5cdFx0XHRpZiAob2xkTWF0Y2ggJiYgb2xkTWF0Y2guaGlnaGxpZ2h0UmVzdWx0KSB7XG5cdFx0XHRcdG9sZE1hdGNoLmhpZ2hsaWdodFJlc3VsdC51cGRhdGUobWF0Y2hDb2xvciwgb2xkTWF0Y2guaXNTaGFkb3cgPyB1bmRlZmluZWQgOiAnZmluZC1tYXRjaCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHR3aW5kb3cuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk/LnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5mb3JFYWNoKGhpZ2hsaWdodEluZm8gPT4ge1xuXHRcdFx0XHRoaWdobGlnaHRJbmZvLm1hdGNoZXMuZm9yRWFjaChtYXRjaCA9PiB7XG5cdFx0XHRcdFx0bWF0Y2guaGlnaGxpZ2h0UmVzdWx0Py5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgQ1NTSGlnaGxpZ2h0ZXIgaW1wbGVtZW50cyBJSGlnaGxpZ2h0ZXIge1xuXHRcdHByaXZhdGUgX2FjdGl2ZUhpZ2hsaWdodEluZm86IE1hcDxzdHJpbmcsIElIaWdobGlnaHRJbmZvPjtcblx0XHRwcml2YXRlIF9tYXRjaGVzSGlnaGxpZ2h0OiBIaWdobGlnaHQ7XG5cdFx0cHJpdmF0ZSBfY3VycmVudE1hdGNoZXNIaWdobGlnaHQ6IEhpZ2hsaWdodDtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mbyA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX21hdGNoZXNIaWdobGlnaHQgPSBuZXcgSGlnaGxpZ2h0KCk7XG5cdFx0XHR0aGlzLl9tYXRjaGVzSGlnaGxpZ2h0LnByaW9yaXR5ID0gMTtcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaGVzSGlnaGxpZ2h0ID0gbmV3IEhpZ2hsaWdodCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudE1hdGNoZXNIaWdobGlnaHQucHJpb3JpdHkgPSAyO1xuXHRcdFx0Q1NTLmhpZ2hsaWdodHM/LnNldChgZmluZC1oaWdobGlnaHRgLCB0aGlzLl9tYXRjaGVzSGlnaGxpZ2h0KTtcblx0XHRcdENTUy5oaWdobGlnaHRzPy5zZXQoYGN1cnJlbnQtZmluZC1oaWdobGlnaHRgLCB0aGlzLl9jdXJyZW50TWF0Y2hlc0hpZ2hsaWdodCk7XG5cdFx0fVxuXG5cdFx0X3JlZnJlc2hSZWdpc3RyeSh1cGRhdGVNYXRjaGVzSGlnaGxpZ2h0ID0gdHJ1ZSkge1xuXHRcdFx0Ly8gZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMsIG9ubHkgdXBkYXRlIHRoZSBmdWxsIGxpc3Qgb2YgaGlnaGxpZ2h0cyB3aGVuIHdlIG5lZWQgdG9cblx0XHRcdGlmICh1cGRhdGVNYXRjaGVzSGlnaGxpZ2h0KSB7XG5cdFx0XHRcdHRoaXMuX21hdGNoZXNIaWdobGlnaHQuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY3VycmVudE1hdGNoZXNIaWdobGlnaHQuY2xlYXIoKTtcblxuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5mb3JFYWNoKChoaWdobGlnaHRJbmZvKSA9PiB7XG5cblx0XHRcdFx0aWYgKHVwZGF0ZU1hdGNoZXNIaWdobGlnaHQpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGhpZ2hsaWdodEluZm8ubWF0Y2hlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0dGhpcy5fbWF0Y2hlc0hpZ2hsaWdodC5hZGQoaGlnaGxpZ2h0SW5mby5tYXRjaGVzW2ldLm9yaWdpbmFsUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleCA8IGhpZ2hsaWdodEluZm8ubWF0Y2hlcy5sZW5ndGggJiYgaGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudE1hdGNoZXNIaWdobGlnaHQuYWRkKGhpZ2hsaWdodEluZm8ubWF0Y2hlc1toaWdobGlnaHRJbmZvLmN1cnJlbnRNYXRjaEluZGV4XS5vcmlnaW5hbFJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YWRkSGlnaGxpZ2h0cyhcblx0XHRcdG1hdGNoZXM6IElGaW5kTWF0Y2hbXSxcblx0XHRcdG93bmVySUQ6IHN0cmluZ1xuXHRcdCkge1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1hdGNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dGhpcy5fbWF0Y2hlc0hpZ2hsaWdodC5hZGQobWF0Y2hlc1tpXS5vcmlnaW5hbFJhbmdlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3RW50cnk6IElIaWdobGlnaHRJbmZvID0ge1xuXHRcdFx0XHRtYXRjaGVzLFxuXHRcdFx0XHRjdXJyZW50TWF0Y2hJbmRleDogLTEsXG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvLnNldChvd25lcklELCBuZXdFbnRyeSk7XG5cdFx0fVxuXG5cdFx0aGlnaGxpZ2h0Q3VycmVudE1hdGNoKGluZGV4OiBudW1iZXIsIG93bmVySUQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0SW5mbyA9IHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZ2V0KG93bmVySUQpO1xuXHRcdFx0aWYgKCFoaWdobGlnaHRJbmZvKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ01vZGlmaWVkIGN1cnJlbnQgaGlnaGxpZ2h0IG1hdGNoIGJlZm9yZSBhZGRpbmcgaGlnaGxpZ2h0IGxpc3QuJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleCA9IGluZGV4O1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBoaWdobGlnaHRJbmZvLm1hdGNoZXNbaW5kZXhdO1xuXG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3V0cHV0T2Zmc2V0ID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG1hdGNoLmlkKSEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdG1hdGNoLm9yaWdpbmFsUmFuZ2Uuc3RhcnRDb250YWluZXIucGFyZW50RWxlbWVudD8uc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ2F1dG8nLCBibG9jazogJ2VuZCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlT2Zmc2V0ID0gbWF0Y2gub3JpZ2luYWxSYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3A7XG5cdFx0XHRcdFx0b2Zmc2V0ID0gcmFuZ2VPZmZzZXQgLSBvdXRwdXRPZmZzZXQ7XG5cdFx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZSgnZGlkRmluZEhpZ2hsaWdodEN1cnJlbnQnLCB7XG5cdFx0XHRcdFx0XHRvZmZzZXRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZnJlc2hSZWdpc3RyeShmYWxzZSk7XG5cdFx0fVxuXG5cdFx0dW5IaWdobGlnaHRDdXJyZW50TWF0Y2goaW5kZXg6IG51bWJlciwgb3duZXJJRDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRJbmZvID0gdGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5nZXQob3duZXJJRCk7XG5cdFx0XHRpZiAoIWhpZ2hsaWdodEluZm8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRoaWdobGlnaHRJbmZvLmN1cnJlbnRNYXRjaEluZGV4ID0gLTE7XG5cdFx0fVxuXG5cdFx0cmVtb3ZlSGlnaGxpZ2h0cyhvd25lcklEOiBzdHJpbmcpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZGVsZXRlKG93bmVySUQpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaFJlZ2lzdHJ5KCk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdHdpbmRvdy5kb2N1bWVudC5nZXRTZWxlY3Rpb24oKT8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2hlc0hpZ2hsaWdodC5jbGVhcigpO1xuXHRcdFx0dGhpcy5fbWF0Y2hlc0hpZ2hsaWdodC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IF9oaWdobGlnaHRlciA9IChDU1MuaGlnaGxpZ2h0cykgPyBuZXcgQ1NTSGlnaGxpZ2h0ZXIoKSA6IG5ldyBKU0hpZ2hsaWdodGVyKCk7XG5cblx0ZnVuY3Rpb24gZXh0cmFjdFNlbGVjdGlvbkxpbmUoc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiBJU2VhcmNoUHJldmlld0luZm8ge1xuXHRcdGNvbnN0IHJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlQXQoMCk7XG5cblx0XHQvLyB3ZSBuZWVkIHRvIGtlZXAgYSByZWZlcmVuY2UgdG8gdGhlIG9sZCBzZWxlY3Rpb24gcmFuZ2UgdG8gcmUtYXBwbHkgbGF0ZXJcblx0XHRjb25zdCBvbGRSYW5nZSA9IHJhbmdlLmNsb25lUmFuZ2UoKTtcblx0XHRjb25zdCBjYXB0dXJlTGVuZ3RoID0gc2VsZWN0aW9uLnRvU3RyaW5nKCkubGVuZ3RoO1xuXG5cdFx0Ly8gdXNlIHNlbGVjdGlvbiBBUEkgdG8gbW9kaWZ5IHNlbGVjdGlvbiB0byBnZXQgZW50aXJlIGxpbmUgKHRoZSBmaXJzdCBsaW5lIGlmIG11bHRpLXNlbGVjdClcblxuXHRcdC8vIGNvbGxhcHNlIHNlbGVjdGlvbiB0byBzdGFydCBzbyB0aGF0IHRoZSBjdXJzb3IgcG9zaXRpb24gaXMgYXQgYmVnaW5uaW5nIG9mIG1hdGNoXG5cdFx0c2VsZWN0aW9uLmNvbGxhcHNlVG9TdGFydCgpO1xuXG5cdFx0Ly8gZXh0ZW5kIHNlbGVjdGlvbiBpbiBib3RoIGRpcmVjdGlvbnMgdG8gc2VsZWN0IHRoZSBsaW5lXG5cdFx0c2VsZWN0aW9uLm1vZGlmeSgnbW92ZScsICdiYWNrd2FyZCcsICdsaW5lYm91bmRhcnknKTtcblx0XHRzZWxlY3Rpb24ubW9kaWZ5KCdleHRlbmQnLCAnZm9yd2FyZCcsICdsaW5lYm91bmRhcnknKTtcblxuXHRcdGNvbnN0IGxpbmUgPSBzZWxlY3Rpb24udG9TdHJpbmcoKTtcblxuXHRcdC8vIHVzaW5nIHRoZSBvcmlnaW5hbCByYW5nZSBhbmQgdGhlIG5ldyByYW5nZSwgd2UgY2FuIGZpbmQgdGhlIG9mZnNldCBvZiB0aGUgbWF0Y2ggZnJvbSB0aGUgbGluZSBzdGFydC5cblx0XHRjb25zdCByYW5nZVN0YXJ0ID0gZ2V0U3RhcnRPZmZzZXQoc2VsZWN0aW9uLmdldFJhbmdlQXQoMCksIG9sZFJhbmdlKTtcblxuXHRcdC8vIGxpbmUgcmFuZ2UgZm9yIG1hdGNoXG5cdFx0Y29uc3QgbGluZVJhbmdlID0ge1xuXHRcdFx0c3RhcnQ6IHJhbmdlU3RhcnQsXG5cdFx0XHRlbmQ6IHJhbmdlU3RhcnQgKyBjYXB0dXJlTGVuZ3RoLFxuXHRcdH07XG5cblx0XHQvLyByZS1hZGQgdGhlIG9sZCByYW5nZSBzbyB0aGF0IHRoZSBzZWxlY3Rpb24gaXMgcmVzdG9yZWRcblx0XHRzZWxlY3Rpb24ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0c2VsZWN0aW9uLmFkZFJhbmdlKG9sZFJhbmdlKTtcblxuXHRcdHJldHVybiB7IGxpbmUsIHJhbmdlOiBsaW5lUmFuZ2UgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldFN0YXJ0T2Zmc2V0KGxpbmVSYW5nZTogUmFuZ2UsIG9yaWdpbmFsUmFuZ2U6IFJhbmdlKSB7XG5cdFx0Ly8gc29tZXRpbWVzLCB0aGUgb2xkIGFuZCBuZXcgcmFuZ2UgYXJlIGluIGRpZmZlcmVudCBET00gZWxlbWVudHMgKGllOiB3aGVuIHRoZSBtYXRjaCBpcyBpbnNpZGUgb2YgPGI+PC9iPilcblx0XHQvLyBzbyB3ZSBuZWVkIHRvIGZpbmQgdGhlIGZpcnN0IGNvbW1vbiBhbmNlc3RvciBET00gZWxlbWVudCBhbmQgZmluZCB0aGUgcG9zaXRpb25zIG9mIHRoZSBvbGQgYW5kIG5ldyByYW5nZSByZWxhdGl2ZSB0byB0aGF0LlxuXHRcdGNvbnN0IGZpcnN0Q29tbW9uQW5jZXN0b3IgPSBmaW5kRmlyc3RDb21tb25BbmNlc3RvcihsaW5lUmFuZ2Uuc3RhcnRDb250YWluZXIsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uT2Zmc2V0ID0gZ2V0U2VsZWN0aW9uT2Zmc2V0UmVsYXRpdmVUbyhmaXJzdENvbW1vbkFuY2VzdG9yLCBsaW5lUmFuZ2Uuc3RhcnRDb250YWluZXIpICsgbGluZVJhbmdlLnN0YXJ0T2Zmc2V0O1xuXHRcdGNvbnN0IHRleHRPZmZzZXQgPSBnZXRTZWxlY3Rpb25PZmZzZXRSZWxhdGl2ZVRvKGZpcnN0Q29tbW9uQW5jZXN0b3IsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb250YWluZXIpICsgb3JpZ2luYWxSYW5nZS5zdGFydE9mZnNldDtcblx0XHRyZXR1cm4gdGV4dE9mZnNldCAtIHNlbGVjdGlvbk9mZnNldDtcblx0fVxuXG5cdC8vIG1vZGlmaWVkIGZyb20gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzY4NTgzNDY2LzE2MjUzODIzXG5cdGZ1bmN0aW9uIGZpbmRGaXJzdENvbW1vbkFuY2VzdG9yKG5vZGVBOiBOb2RlLCBub2RlQjogTm9kZSkge1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKCk7XG5cdFx0cmFuZ2Uuc2V0U3RhcnQobm9kZUEsIDApO1xuXHRcdHJhbmdlLnNldEVuZChub2RlQiwgMCk7XG5cdFx0cmV0dXJuIHJhbmdlLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0VGV4dENvbnRlbnRMZW5ndGgobm9kZTogTm9kZSk6IG51bWJlciB7XG5cdFx0bGV0IGxlbmd0aCA9IDA7XG5cblx0XHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcblx0XHRcdGxlbmd0aCArPSBub2RlLnRleHRDb250ZW50Py5sZW5ndGggfHwgMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZE5vZGUgb2Ygbm9kZS5jaGlsZE5vZGVzKSB7XG5cdFx0XHRcdGxlbmd0aCArPSBnZXRUZXh0Q29udGVudExlbmd0aChjaGlsZE5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsZW5ndGg7XG5cdH1cblxuXHQvLyBtb2RpZmllZCBmcm9tIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS80ODgxMjUyOS8xNjI1MzgyM1xuXHRmdW5jdGlvbiBnZXRTZWxlY3Rpb25PZmZzZXRSZWxhdGl2ZVRvKHBhcmVudEVsZW1lbnQ6IE5vZGUsIGN1cnJlbnROb2RlOiBOb2RlIHwgbnVsbCk6IG51bWJlciB7XG5cdFx0aWYgKCFjdXJyZW50Tm9kZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGxldCBvZmZzZXQgPSAwO1xuXG5cdFx0aWYgKGN1cnJlbnROb2RlID09PSBwYXJlbnRFbGVtZW50IHx8ICFwYXJlbnRFbGVtZW50LmNvbnRhaW5zKGN1cnJlbnROb2RlKSkge1xuXHRcdFx0cmV0dXJuIG9mZnNldDtcblx0XHR9XG5cblxuXHRcdC8vIGNvdW50IHRoZSBudW1iZXIgb2YgY2hhcnMgYmVmb3JlIHRoZSBjdXJyZW50IGRvbSBlbGVtIGFuZCB0aGUgc3RhcnQgb2YgdGhlIGRvbVxuXHRcdGxldCBwcmV2U2libGluZyA9IGN1cnJlbnROb2RlLnByZXZpb3VzU2libGluZztcblx0XHR3aGlsZSAocHJldlNpYmxpbmcpIHtcblx0XHRcdG9mZnNldCArPSBnZXRUZXh0Q29udGVudExlbmd0aChwcmV2U2libGluZyk7XG5cdFx0XHRwcmV2U2libGluZyA9IHByZXZTaWJsaW5nLnByZXZpb3VzU2libGluZztcblx0XHR9XG5cblx0XHRyZXR1cm4gb2Zmc2V0ICsgZ2V0U2VsZWN0aW9uT2Zmc2V0UmVsYXRpdmVUbyhwYXJlbnRFbGVtZW50LCBjdXJyZW50Tm9kZS5wYXJlbnROb2RlKTtcblx0fVxuXG5cdGNvbnN0IGZpbmQgPSAocXVlcnk6IHN0cmluZywgb3B0aW9uczogeyB3aG9sZVdvcmQ/OiBib29sZWFuOyBjYXNlU2Vuc2l0aXZlPzogYm9vbGVhbjsgaW5jbHVkZU1hcmt1cDogYm9vbGVhbjsgaW5jbHVkZU91dHB1dDogYm9vbGVhbjsgc2hvdWxkR2V0U2VhcmNoUHJldmlld0luZm86IGJvb2xlYW47IG93bmVySUQ6IHN0cmluZzsgZmluZElkczogc3RyaW5nW10gfSkgPT4ge1xuXHRcdGxldCBmaW5kID0gdHJ1ZTtcblx0XHRsZXQgbWF0Y2hlczogSUZpbmRNYXRjaFtdID0gW107XG5cblx0XHRjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG5cdFx0cmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmluZFN0YXJ0JykhKTtcblx0XHRjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0c2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcblx0XHRzZWw/LmFkZFJhbmdlKHJhbmdlKTtcblxuXHRcdHZpZXdNb2RlbC50b2dnbGVEcmFnRHJvcEVuYWJsZWQoZmFsc2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGRvY3VtZW50LmRlc2lnbk1vZGUgPSAnT24nO1xuXG5cdFx0XHR3aGlsZSAoZmluZCAmJiBtYXRjaGVzLmxlbmd0aCA8IDUwMCkge1xuXHRcdFx0XHRmaW5kID0gKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgZmluZDogKHF1ZXJ5OiBzdHJpbmcsIGNhc2VTZW5zaXRpdmU6IGJvb2xlYW4sIGJhY2t3YXJkczogYm9vbGVhbiwgd3JhcEFyb3VuZDogYm9vbGVhbiwgd2hvbGVXb3JkOiBib29sZWFuLCBzZWFyY2hJbkZyYW1lczogYm9vbGVhbiwgaW5jbHVkZU1hcmt1cDogYm9vbGVhbikgPT4gYm9vbGVhbiB9KS5maW5kKHF1ZXJ5LCAvKiBjYXNlU2Vuc2l0aXZlKi8gISFvcHRpb25zLmNhc2VTZW5zaXRpdmUsXG5cdFx0XHRcdC8qIGJhY2t3YXJkcyovIGZhbHNlLFxuXHRcdFx0XHQvKiB3cmFwQXJvdW5kKi8gZmFsc2UsXG5cdFx0XHRcdC8qIHdob2xlV29yZCAqLyAhIW9wdGlvbnMud2hvbGVXb3JkLFxuXHRcdFx0XHQvKiBzZWFyY2hJbkZyYW1lcyovIHRydWUsXG5cdFx0XHRcdFx0ZmFsc2UpO1xuXG5cdFx0XHRcdGlmIChmaW5kKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdGlmICghc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZygnbm8gc2VsZWN0aW9uJyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBNYXJrZG93biBwcmV2aWV3IGFyZSByZW5kZXJlZCBpbiBhIHNoYWRvdyBET00uXG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuaW5jbHVkZU1hcmt1cCAmJiBzZWxlY3Rpb24ucmFuZ2VDb3VudCA+IDAgJiYgc2VsZWN0aW9uLmdldFJhbmdlQXQoMCkuc3RhcnRDb250YWluZXIubm9kZVR5cGUgPT09IDFcblx0XHRcdFx0XHRcdCYmIChzZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKS5zdGFydENvbnRhaW5lciBhcyBFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ21hcmt1cCcpKSB7XG5cdFx0XHRcdFx0XHQvLyBtYXJrZG93biBwcmV2aWV3IGNvbnRhaW5lclxuXHRcdFx0XHRcdFx0Y29uc3QgcHJldmlldyA9IChzZWxlY3Rpb24uYW5jaG9yTm9kZT8uZmlyc3RDaGlsZCBhcyBFbGVtZW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IHJvb3QgPSBwcmV2aWV3LnNoYWRvd1Jvb3QgYXMgU2hhZG93Um9vdCAmIHsgZ2V0U2VsZWN0aW9uOiAoKSA9PiBTZWxlY3Rpb24gfTtcblx0XHRcdFx0XHRcdGNvbnN0IHNoYWRvd1NlbGVjdGlvbiA9IHJvb3Q/LmdldFNlbGVjdGlvbiA/IHJvb3Q/LmdldFNlbGVjdGlvbigpIDogbnVsbDtcblx0XHRcdFx0XHRcdC8vIGZpbmQgdGhlIG1hdGNoIGluIHRoZSBzaGFkb3cgZG9tIGJ5IGNoZWNraW5nIHRoZSBzZWxlY3Rpb24gaW5zaWRlIHRoZSBzaGFkb3cgZG9tXG5cdFx0XHRcdFx0XHRpZiAoc2hhZG93U2VsZWN0aW9uICYmIHNoYWRvd1NlbGVjdGlvbi5hbmNob3JOb2RlKSB7XG5cdFx0XHRcdFx0XHRcdG1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3ByZXZpZXcnLFxuXHRcdFx0XHRcdFx0XHRcdGlkOiBwcmV2aWV3LmlkLFxuXHRcdFx0XHRcdFx0XHRcdGNlbGxJZDogcHJldmlldy5pZCxcblx0XHRcdFx0XHRcdFx0XHRjb250YWluZXI6IHByZXZpZXcsXG5cdFx0XHRcdFx0XHRcdFx0aXNTaGFkb3c6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxSYW5nZTogc2hhZG93U2VsZWN0aW9uLmdldFJhbmdlQXQoMCksXG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUHJldmlld0luZm86IG9wdGlvbnMuc2hvdWxkR2V0U2VhcmNoUHJldmlld0luZm8gPyBleHRyYWN0U2VsZWN0aW9uTGluZShzaGFkb3dTZWxlY3Rpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBPdXRwdXRzIG1pZ2h0IGJlIHJlbmRlcmVkIGluc2lkZSBhIHNoYWRvdyBET00uXG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuaW5jbHVkZU91dHB1dCAmJiBzZWxlY3Rpb24ucmFuZ2VDb3VudCA+IDAgJiYgc2VsZWN0aW9uLmdldFJhbmdlQXQoMCkuc3RhcnRDb250YWluZXIubm9kZVR5cGUgPT09IDFcblx0XHRcdFx0XHRcdCYmIChzZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKS5zdGFydENvbnRhaW5lciBhcyBFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ291dHB1dF9jb250YWluZXInKSkge1xuXHRcdFx0XHRcdFx0Ly8gb3V0cHV0IGNvbnRhaW5lclxuXHRcdFx0XHRcdFx0Y29uc3QgY2VsbElkID0gc2VsZWN0aW9uLmdldFJhbmdlQXQoMCkuc3RhcnRDb250YWluZXIucGFyZW50RWxlbWVudCEuaWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXROb2RlID0gKHNlbGVjdGlvbi5hbmNob3JOb2RlPy5maXJzdENoaWxkIGFzIEVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgcm9vdCA9IG91dHB1dE5vZGUuc2hhZG93Um9vdCBhcyBTaGFkb3dSb290ICYgeyBnZXRTZWxlY3Rpb246ICgpID0+IFNlbGVjdGlvbiB9O1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2hhZG93U2VsZWN0aW9uID0gcm9vdD8uZ2V0U2VsZWN0aW9uID8gcm9vdD8uZ2V0U2VsZWN0aW9uKCkgOiBudWxsO1xuXHRcdFx0XHRcdFx0aWYgKHNoYWRvd1NlbGVjdGlvbiAmJiBzaGFkb3dTZWxlY3Rpb24uYW5jaG9yTm9kZSkge1xuXHRcdFx0XHRcdFx0XHRtYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvdXRwdXQnLFxuXHRcdFx0XHRcdFx0XHRcdGlkOiBvdXRwdXROb2RlLmlkLFxuXHRcdFx0XHRcdFx0XHRcdGNlbGxJZDogY2VsbElkLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRhaW5lcjogb3V0cHV0Tm9kZSxcblx0XHRcdFx0XHRcdFx0XHRpc1NoYWRvdzogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlOiBzaGFkb3dTZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKSxcblx0XHRcdFx0XHRcdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzogb3B0aW9ucy5zaG91bGRHZXRTZWFyY2hQcmV2aWV3SW5mbyA/IGV4dHJhY3RTZWxlY3Rpb25MaW5lKHNoYWRvd1NlbGVjdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGFuY2hvck5vZGUgPSBzZWxlY3Rpb24uYW5jaG9yTm9kZT8ucGFyZW50RWxlbWVudDtcblxuXHRcdFx0XHRcdGlmIChhbmNob3JOb2RlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXN0RWw6IGFueSA9IG1hdGNoZXMubGVuZ3RoID8gbWF0Y2hlc1ttYXRjaGVzLmxlbmd0aCAtIDFdIDogbnVsbDtcblxuXHRcdFx0XHRcdFx0Ly8gT3B0aW1pemF0aW9uOiBhdm9pZCBzZWFyY2hpbmcgZm9yIHRoZSBvdXRwdXQgY29udGFpbmVyXG5cdFx0XHRcdFx0XHRpZiAobGFzdEVsICYmIGxhc3RFbC5jb250YWluZXIuY29udGFpbnMoYW5jaG9yTm9kZSkgJiYgb3B0aW9ucy5pbmNsdWRlT3V0cHV0KSB7XG5cdFx0XHRcdFx0XHRcdG1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogbGFzdEVsLnR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0aWQ6IGxhc3RFbC5pZCxcblx0XHRcdFx0XHRcdFx0XHRjZWxsSWQ6IGxhc3RFbC5jZWxsSWQsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGFpbmVyOiBsYXN0RWwuY29udGFpbmVyLFxuXHRcdFx0XHRcdFx0XHRcdGlzU2hhZG93OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlOiBzZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKSxcblx0XHRcdFx0XHRcdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzogb3B0aW9ucy5zaG91bGRHZXRTZWFyY2hQcmV2aWV3SW5mbyA/IGV4dHJhY3RTZWxlY3Rpb25MaW5lKHNlbGVjdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBUcmF2ZXJzZSB1cCB0aGUgRE9NIHRvIGZpbmQgdGhlIGNvbnRhaW5lclxuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBub2RlID0gYW5jaG9yTm9kZSBhcyBFbGVtZW50IHwgbnVsbDsgbm9kZTsgbm9kZSA9IG5vZGUucGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0aWYgKG5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdvdXRwdXQnKSAmJiBvcHRpb25zLmluY2x1ZGVPdXRwdXQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIGluc2lkZSBvdXRwdXRcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNlbGxJZCA9IG5vZGUucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudD8uaWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2VsbElkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ291dHB1dCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWQ6IG5vZGUuaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y2VsbElkOiBjZWxsSWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGFpbmVyOiBub2RlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlzU2hhZG93OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlOiBzZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzogb3B0aW9ucy5zaG91bGRHZXRTZWFyY2hQcmV2aWV3SW5mbyA/IGV4dHJhY3RTZWxlY3Rpb25MaW5lKHNlbGVjdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0aWYgKG5vZGUuaWQgPT09ICdjb250YWluZXInIHx8IG5vZGUgPT09IHdpbmRvdy5kb2N1bWVudC5ib2R5KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhlKTtcblx0XHR9XG5cblxuXHRcdG1hdGNoZXMgPSBtYXRjaGVzLmZpbHRlcihtYXRjaCA9PiBvcHRpb25zLmZpbmRJZHMubGVuZ3RoID8gb3B0aW9ucy5maW5kSWRzLmluY2x1ZGVzKG1hdGNoLmNlbGxJZCkgOiB0cnVlKTtcblx0XHRfaGlnaGxpZ2h0ZXIuYWRkSGlnaGxpZ2h0cyhtYXRjaGVzLCBvcHRpb25zLm93bmVySUQpO1xuXHRcdHdpbmRvdy5kb2N1bWVudC5nZXRTZWxlY3Rpb24oKT8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cblx0XHR2aWV3TW9kZWwudG9nZ2xlRHJhZ0Ryb3BFbmFibGVkKGN1cnJlbnRPcHRpb25zLmRyYWdBbmREcm9wRW5hYmxlZCk7XG5cblx0XHRkb2N1bWVudC5kZXNpZ25Nb2RlID0gJ09mZic7XG5cblx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlKCdkaWRGaW5kJywge1xuXHRcdFx0bWF0Y2hlczogbWF0Y2hlcy5tYXAoKG1hdGNoLCBpbmRleCkgPT4gKHtcblx0XHRcdFx0dHlwZTogbWF0Y2gudHlwZSxcblx0XHRcdFx0aWQ6IG1hdGNoLmlkLFxuXHRcdFx0XHRjZWxsSWQ6IG1hdGNoLmNlbGxJZCxcblx0XHRcdFx0aW5kZXgsXG5cdFx0XHRcdHNlYXJjaFByZXZpZXdJbmZvOiBtYXRjaC5zZWFyY2hQcmV2aWV3SW5mbyxcblx0XHRcdH0pKVxuXHRcdH0pO1xuXHR9O1xuXG5cdGNvbnN0IGNvcHlPdXRwdXRJbWFnZSA9IGFzeW5jIChvdXRwdXRJZDogc3RyaW5nLCBhbHRPdXRwdXRJZDogc3RyaW5nLCB0ZXh0QWx0ZXJuYXRlcz86IHsgbWltZVR5cGU6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH1bXSwgcmV0cmllcyA9IDUpID0+IHtcblx0XHRpZiAoIXdpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpICYmIHJldHJpZXMgPiAwKSB7XG5cdFx0XHQvLyBjb3B5SW1hZ2UgY2FuIGJlIGNhbGxlZCBmcm9tIG91dHNpZGUgb2YgdGhlIHdlYnZpZXcsIHdoaWNoIG1lYW5zIHRoaXMgZnVuY3Rpb24gbWF5IGJlIHJ1bm5pbmcgd2hpbHN0IHRoZSB3ZWJ2aWV3IGlzIGdhaW5pbmcgZm9jdXMuXG5cdFx0XHQvLyBTaW5jZSBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlIHJlcXVpcmVzIHRoZSBkb2N1bWVudCB0byBiZSBmb2N1c2VkLCB3ZSBuZWVkIHRvIHdhaXQgZm9yIGZvY3VzLlxuXHRcdFx0Ly8gV2UgY2Fubm90IHVzZSBhIGxpc3RlbmVyLCBhcyB0aGVyZSBpcyBhIGhpZ2ggY2hhbmNlIHRoZSBmb2N1cyBpcyBnYWluZWQgZHVyaW5nIHRoZSBzZXR1cCBvZiB0aGUgbGlzdGVuZXIgcmVzdWx0aW5nIGluIHVzIG1pc3NpbmcgaXQuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHsgY29weU91dHB1dEltYWdlKG91dHB1dElkLCBhbHRPdXRwdXRJZCwgdGV4dEFsdGVybmF0ZXMsIHJldHJpZXMgLSAxKTsgfSwgNTApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvdXRwdXRFbGVtZW50ID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG91dHB1dElkKVxuXHRcdFx0XHQ/PyB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWx0T3V0cHV0SWQpO1xuXG5cdFx0XHRsZXQgaW1hZ2UgPSBvdXRwdXRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdpbWcnKTtcblxuXHRcdFx0aWYgKCFpbWFnZSkge1xuXHRcdFx0XHRjb25zdCBzdmdJbWFnZSA9IG91dHB1dEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ3N2Zy5vdXRwdXQtaW1hZ2UnKSA/P1xuXHRcdFx0XHRcdG91dHB1dEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ2Rpdi5zdmdDb250YWluZXJTdHlsZSA+IHN2ZycpO1xuXG5cdFx0XHRcdGlmIChzdmdJbWFnZSkge1xuXHRcdFx0XHRcdGltYWdlID0gbmV3IEltYWdlKCk7XG5cdFx0XHRcdFx0aW1hZ2Uuc3JjID0gJ2RhdGE6aW1hZ2Uvc3ZnK3htbCwnICsgZW5jb2RlVVJJQ29tcG9uZW50KHN2Z0ltYWdlLm91dGVySFRNTCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGltYWdlKSB7XG5cdFx0XHRcdGNvbnN0IGVuc3VyZUltYWdlTG9hZGVkID0gKGltZzogSFRNTEltYWdlRWxlbWVudCk6IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4gPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaW1nLmNvbXBsZXRlICYmIGltZy5uYXR1cmFsV2lkdGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoaW1nKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGltZy5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKGltZyk7XG5cdFx0XHRcdFx0XHRcdGltZy5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignRmFpbGVkIHRvIGxvYWQgaW1hZ2UnKSk7XG5cdFx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignSW1hZ2UgbG9hZCB0aW1lb3V0JykpLCA1MDAwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgaW1hZ2VUb0NvcHkgPSBhd2FpdCBlbnN1cmVJbWFnZUxvYWRlZChpbWFnZSk7XG5cblx0XHRcdFx0Ly8gQnVpbGQgY2xpcGJvYXJkIGRhdGEgd2l0aCBib3RoIGltYWdlIGFuZCB0ZXh0IGZvcm1hdHNcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkRGF0YTogUmVjb3JkPHN0cmluZywgYW55PiA9IHtcblx0XHRcdFx0XHQnaW1hZ2UvcG5nJzogbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdFx0XHRcdFx0Y2FudmFzLndpZHRoID0gaW1hZ2VUb0NvcHkubmF0dXJhbFdpZHRoO1xuXHRcdFx0XHRcdFx0Y2FudmFzLmhlaWdodCA9IGltYWdlVG9Db3B5Lm5hdHVyYWxIZWlnaHQ7XG5cdFx0XHRcdFx0XHRjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0XHRcdFx0XHRjb250ZXh0IS5kcmF3SW1hZ2UoaW1hZ2VUb0NvcHksIDAsIDApO1xuXG5cdFx0XHRcdFx0XHRjYW52YXMudG9CbG9iKChibG9iKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChibG9iKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZShibG9iKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdObyBibG9iIGRhdGEgdG8gd3JpdGUgdG8gY2xpcGJvYXJkJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y2FudmFzLnJlbW92ZSgpO1xuXHRcdFx0XHRcdFx0fSwgJ2ltYWdlL3BuZycpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gQWRkIHRleHQgYWx0ZXJuYXRlcyBpZiBwcm92aWRlZFxuXHRcdFx0XHRpZiAodGV4dEFsdGVybmF0ZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFsdGVybmF0ZSBvZiB0ZXh0QWx0ZXJuYXRlcykge1xuXHRcdFx0XHRcdFx0Y2xpcGJvYXJkRGF0YVthbHRlcm5hdGUubWltZVR5cGVdID0gYWx0ZXJuYXRlLmNvbnRlbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZShbbmV3IENsaXBib2FyZEl0ZW0oY2xpcGJvYXJkRGF0YSldKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBmaW5kIGltYWdlIGVsZW1lbnQgdG8gY29weSBmb3Igb3V0cHV0IHdpdGggaWQnLCBvdXRwdXRJZCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignQ291bGQgbm90IGNvcHkgaW1hZ2U6JywgZSk7XG5cdFx0fVxuXHR9O1xuXG5cdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgYXN5bmMgcmF3RXZlbnQgPT4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gcmF3RXZlbnQgYXMgKHsgZGF0YTogd2Vidmlld01lc3NhZ2VzLlRvV2Vidmlld01lc3NhZ2UgfSk7XG5cblx0XHRzd2l0Y2ggKGV2ZW50LmRhdGEudHlwZSkge1xuXHRcdFx0Y2FzZSAnaW5pdGlhbGl6ZU1hcmt1cCc6IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChldmVudC5kYXRhLmNlbGxzLm1hcChpbmZvID0+IHZpZXdNb2RlbC5lbnN1cmVNYXJrdXBDZWxsKGluZm8pKSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVJbW1lZGlhdGVseSgpO1xuXHRcdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2UoJ2luaXRpYWxpemVkTWFya3VwJywgeyByZXF1ZXN0SWQ6IGV2ZW50LmRhdGEucmVxdWVzdElkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY3JlYXRlTWFya3VwQ2VsbCc6XG5cdFx0XHRcdHZpZXdNb2RlbC5lbnN1cmVNYXJrdXBDZWxsKGV2ZW50LmRhdGEuY2VsbCk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdzaG93TWFya3VwQ2VsbCc6XG5cdFx0XHRcdHZpZXdNb2RlbC5zaG93TWFya3VwQ2VsbChldmVudC5kYXRhLmlkLCBldmVudC5kYXRhLnRvcCwgZXZlbnQuZGF0YS5jb250ZW50LCBldmVudC5kYXRhLm1ldGFkYXRhKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2hpZGVNYXJrdXBDZWxscyc6XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgZXZlbnQuZGF0YS5pZHMpIHtcblx0XHRcdFx0XHR2aWV3TW9kZWwuaGlkZU1hcmt1cENlbGwoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICd1bmhpZGVNYXJrdXBDZWxscyc6XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgZXZlbnQuZGF0YS5pZHMpIHtcblx0XHRcdFx0XHR2aWV3TW9kZWwudW5oaWRlTWFya3VwQ2VsbChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2RlbGV0ZU1hcmt1cENlbGwnOlxuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGV2ZW50LmRhdGEuaWRzKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsLmRlbGV0ZU1hcmt1cENlbGwoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICd1cGRhdGVTZWxlY3RlZE1hcmt1cENlbGxzJzpcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGVkQ2VsbHMoZXZlbnQuZGF0YS5zZWxlY3RlZENlbGxJZHMpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnaHRtbCc6IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGV2ZW50LmRhdGE7XG5cdFx0XHRcdGlmIChkYXRhLmNyZWF0ZU9uSWRsZSkge1xuXHRcdFx0XHRcdG91dHB1dFJ1bm5lci5lbnF1ZXVlSWRsZShkYXRhLm91dHB1dElkLCBzaWduYWwgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gY2FuY2VsIHRoZSBpZGxlIGNhbGxiYWNrIGlmIGl0IGV4aXN0c1xuXHRcdFx0XHRcdFx0cmV0dXJuIHZpZXdNb2RlbC5yZW5kZXJPdXRwdXRDZWxsKGRhdGEsIHNpZ25hbCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3V0cHV0UnVubmVyLmVucXVldWUoZGF0YS5vdXRwdXRJZCwgc2lnbmFsID0+IHtcblx0XHRcdFx0XHRcdC8vIGNhbmNlbCB0aGUgaWRsZSBjYWxsYmFjayBpZiBpdCBleGlzdHNcblx0XHRcdFx0XHRcdHJldHVybiB2aWV3TW9kZWwucmVuZGVyT3V0cHV0Q2VsbChkYXRhLCBzaWduYWwpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndmlldy1zY3JvbGwnOlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS5sb2coJy0tLS0tIHdpbGwgc2Nyb2xsIC0tLS0gICcsIGRhdGUuZ2V0TWludXRlcygpICsgJzonICsgZGF0ZS5nZXRTZWNvbmRzKCkgKyAnOicgKyBkYXRlLmdldE1pbGxpc2Vjb25kcygpKTtcblxuXHRcdFx0XHRcdGV2ZW50LmRhdGEud2lkZ2V0cy5mb3JFYWNoKHdpZGdldCA9PiB7XG5cdFx0XHRcdFx0XHRvdXRwdXRSdW5uZXIuZW5xdWV1ZSh3aWRnZXQub3V0cHV0SWQsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZU91dHB1dHNTY3JvbGwoW3dpZGdldF0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZU1hcmt1cFNjcm9sbHMoZXZlbnQuZGF0YS5tYXJrdXBDZWxscyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgJ2NsZWFyJzpcblx0XHRcdFx0cmVuZGVyZXJzLmNsZWFyQWxsKCk7XG5cdFx0XHRcdHZpZXdNb2RlbC5jbGVhckFsbCgpO1xuXHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbnRhaW5lcicpIS5pbm5lclRleHQgPSAnJztcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2NsZWFyT3V0cHV0Jzoge1xuXHRcdFx0XHRjb25zdCB7IGNlbGxJZCwgcmVuZGVyZXJJZCwgb3V0cHV0SWQgfSA9IGV2ZW50LmRhdGE7XG5cdFx0XHRcdG91dHB1dFJ1bm5lci5jYW5jZWxPdXRwdXQob3V0cHV0SWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuY2xlYXJPdXRwdXQoY2VsbElkLCBvdXRwdXRJZCwgcmVuZGVyZXJJZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaGlkZU91dHB1dCc6IHtcblx0XHRcdFx0Y29uc3QgeyBjZWxsSWQsIG91dHB1dElkIH0gPSBldmVudC5kYXRhO1xuXHRcdFx0XHRvdXRwdXRSdW5uZXIuZW5xdWV1ZShvdXRwdXRJZCwgKCkgPT4ge1xuXHRcdFx0XHRcdHZpZXdNb2RlbC5oaWRlT3V0cHV0KGNlbGxJZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Nob3dPdXRwdXQnOiB7XG5cdFx0XHRcdGNvbnN0IHsgb3V0cHV0SWQsIGNlbGxUb3AsIGNlbGxJZCwgY29udGVudCB9ID0gZXZlbnQuZGF0YTtcblx0XHRcdFx0b3V0cHV0UnVubmVyLmVucXVldWUob3V0cHV0SWQsICgpID0+IHtcblx0XHRcdFx0XHR2aWV3TW9kZWwuc2hvd091dHB1dChjZWxsSWQsIG91dHB1dElkLCBjZWxsVG9wKTtcblx0XHRcdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUFuZFJlcmVuZGVyKGNlbGxJZCwgb3V0cHV0SWQsIGNvbnRlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY29weUltYWdlJzoge1xuXHRcdFx0XHRhd2FpdCBjb3B5T3V0cHV0SW1hZ2UoZXZlbnQuZGF0YS5vdXRwdXRJZCwgZXZlbnQuZGF0YS5hbHRPdXRwdXRJZCwgZXZlbnQuZGF0YS50ZXh0QWx0ZXJuYXRlcyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYWNrLWRpbWVuc2lvbic6IHtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGNlbGxJZCwgb3V0cHV0SWQsIGhlaWdodCB9IG9mIGV2ZW50LmRhdGEudXBkYXRlcykge1xuXHRcdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVPdXRwdXRIZWlnaHQoY2VsbElkLCBvdXRwdXRJZCwgaGVpZ2h0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3ByZWxvYWQnOiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlcyA9IGV2ZW50LmRhdGEucmVzb3VyY2VzO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgdXJpIH0gb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0a2VybmVsUHJlbG9hZHMubG9hZCh1cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndXBkYXRlUmVuZGVyZXJzJzoge1xuXHRcdFx0XHRjb25zdCB7IHJlbmRlcmVyRGF0YSB9ID0gZXZlbnQuZGF0YTtcblx0XHRcdFx0cmVuZGVyZXJzLnVwZGF0ZVJlbmRlcmVyRGF0YShyZW5kZXJlckRhdGEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2ZvY3VzLW91dHB1dCc6XG5cdFx0XHRcdGZvY3VzRmlyc3RGb2N1c2FibGVPckNvbnRhaW5lckluT3V0cHV0KGV2ZW50LmRhdGEuY2VsbE9yT3V0cHV0SWQsIGV2ZW50LmRhdGEuYWx0ZXJuYXRlSWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2JsdXItb3V0cHV0Jzpcblx0XHRcdFx0Ymx1ck91dHB1dCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3NlbGVjdC1vdXRwdXQtY29udGVudHMnOlxuXHRcdFx0XHRzZWxlY3RPdXRwdXRDb250ZW50cyhldmVudC5kYXRhLmNlbGxPck91dHB1dElkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzZWxlY3QtaW5wdXQtY29udGVudHMnOlxuXHRcdFx0XHRzZWxlY3RJbnB1dENvbnRlbnRzKGV2ZW50LmRhdGEuY2VsbE9yT3V0cHV0SWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2RlY29yYXRpb25zJzoge1xuXHRcdFx0XHRsZXQgb3V0cHV0Q29udGFpbmVyID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGV2ZW50LmRhdGEuY2VsbElkKTtcblx0XHRcdFx0aWYgKCFvdXRwdXRDb250YWluZXIpIHtcblx0XHRcdFx0XHR2aWV3TW9kZWwuZW5zdXJlT3V0cHV0Q2VsbChldmVudC5kYXRhLmNlbGxJZCwgLTEwMDAwMCwgdHJ1ZSk7XG5cdFx0XHRcdFx0b3V0cHV0Q29udGFpbmVyID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGV2ZW50LmRhdGEuY2VsbElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdXRwdXRDb250YWluZXI/LmNsYXNzTGlzdC5hZGQoLi4uZXZlbnQuZGF0YS5hZGRlZENsYXNzTmFtZXMpO1xuXHRcdFx0XHRvdXRwdXRDb250YWluZXI/LmNsYXNzTGlzdC5yZW1vdmUoLi4uZXZlbnQuZGF0YS5yZW1vdmVkQ2xhc3NOYW1lcyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnbWFya3VwRGVjb3JhdGlvbnMnOiB7XG5cdFx0XHRcdGNvbnN0IG1hcmt1cENlbGwgPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZXZlbnQuZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHQvLyBUaGUgY2VsbCBtYXkgbm90IGhhdmUgYmVlbiBhZGRlZCB5ZXQgaWYgaXQgaXMgb3V0IG9mIHZpZXcuXG5cdFx0XHRcdC8vIERlY29yYXRpb25zIHdpbGwgYmUgYWRkZWQgd2hlbiB0aGUgY2VsbCBpcyBzaG93bi5cblx0XHRcdFx0aWYgKG1hcmt1cENlbGwpIHtcblx0XHRcdFx0XHRtYXJrdXBDZWxsPy5jbGFzc0xpc3QuYWRkKC4uLmV2ZW50LmRhdGEuYWRkZWRDbGFzc05hbWVzKTtcblx0XHRcdFx0XHRtYXJrdXBDZWxsPy5jbGFzc0xpc3QucmVtb3ZlKC4uLmV2ZW50LmRhdGEucmVtb3ZlZENsYXNzTmFtZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY3VzdG9tS2VybmVsTWVzc2FnZSc6XG5cdFx0XHRcdG9uRGlkUmVjZWl2ZUtlcm5lbE1lc3NhZ2UuZmlyZShldmVudC5kYXRhLm1lc3NhZ2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2N1c3RvbVJlbmRlcmVyTWVzc2FnZSc6XG5cdFx0XHRcdHJlbmRlcmVycy5nZXRSZW5kZXJlcihldmVudC5kYXRhLnJlbmRlcmVySWQpPy5yZWNlaXZlTWVzc2FnZShldmVudC5kYXRhLm1lc3NhZ2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ25vdGVib29rU3R5bGVzJzoge1xuXHRcdFx0XHRjb25zdCBkb2N1bWVudFN0eWxlID0gd2luZG93LmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gZG9jdW1lbnRTdHlsZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3BlcnR5ID0gZG9jdW1lbnRTdHlsZVtpXTtcblxuXHRcdFx0XHRcdC8vIERvbid0IHJlbW92ZSBwcm9wZXJ0aWVzIHRoYXQgdGhlIHdlYnZpZXcgbWlnaHQgaGF2ZSBhZGRlZCBzZXBhcmF0ZWx5XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5ICYmIHByb3BlcnR5LnN0YXJ0c1dpdGgoJy0tbm90ZWJvb2stJykpIHtcblx0XHRcdFx0XHRcdGRvY3VtZW50U3R5bGUucmVtb3ZlUHJvcGVydHkocHJvcGVydHkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlLWFkZCBuZXcgcHJvcGVydGllc1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZXZlbnQuZGF0YS5zdHlsZXMpKSB7XG5cdFx0XHRcdFx0ZG9jdW1lbnRTdHlsZS5zZXRQcm9wZXJ0eShgLS0ke25hbWV9YCwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnbm90ZWJvb2tPcHRpb25zJzpcblx0XHRcdFx0Y3VycmVudE9wdGlvbnMgPSBldmVudC5kYXRhLm9wdGlvbnM7XG5cdFx0XHRcdHZpZXdNb2RlbC50b2dnbGVEcmFnRHJvcEVuYWJsZWQoY3VycmVudE9wdGlvbnMuZHJhZ0FuZERyb3BFbmFibGVkKTtcblx0XHRcdFx0Y3VycmVudFJlbmRlck9wdGlvbnMgPSBldmVudC5kYXRhLnJlbmRlck9wdGlvbnM7XG5cdFx0XHRcdHNldHRpbmdDaGFuZ2UuZmlyZShjdXJyZW50UmVuZGVyT3B0aW9ucyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAndG9rZW5pemVkQ29kZUJsb2NrJzoge1xuXHRcdFx0XHRjb25zdCB7IGNvZGVCbG9ja0lkLCBodG1sIH0gPSBldmVudC5kYXRhO1xuXHRcdFx0XHRNYXJrZG93bkNvZGVCbG9jay5oaWdobGlnaHRDb2RlQmxvY2soY29kZUJsb2NrSWQsIGh0bWwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rva2VuaXplZFN0eWxlc0NoYW5nZWQnOiB7XG5cdFx0XHRcdHRva2VuaXphdGlvblN0eWxlLnJlcGxhY2VTeW5jKGV2ZW50LmRhdGEuY3NzKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmaW5kJzoge1xuXHRcdFx0XHRfaGlnaGxpZ2h0ZXIucmVtb3ZlSGlnaGxpZ2h0cyhldmVudC5kYXRhLm9wdGlvbnMub3duZXJJRCk7XG5cdFx0XHRcdGZpbmQoZXZlbnQuZGF0YS5xdWVyeSwgZXZlbnQuZGF0YS5vcHRpb25zKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmaW5kSGlnaGxpZ2h0Q3VycmVudCc6IHtcblx0XHRcdFx0X2hpZ2hsaWdodGVyPy5oaWdobGlnaHRDdXJyZW50TWF0Y2goZXZlbnQuZGF0YS5pbmRleCwgZXZlbnQuZGF0YS5vd25lcklEKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmaW5kVW5IaWdobGlnaHRDdXJyZW50Jzoge1xuXHRcdFx0XHRfaGlnaGxpZ2h0ZXI/LnVuSGlnaGxpZ2h0Q3VycmVudE1hdGNoKGV2ZW50LmRhdGEuaW5kZXgsIGV2ZW50LmRhdGEub3duZXJJRCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZmluZFN0b3AnOiB7XG5cdFx0XHRcdF9oaWdobGlnaHRlci5yZW1vdmVIaWdobGlnaHRzKGV2ZW50LmRhdGEub3duZXJJRCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAncmV0dXJuT3V0cHV0SXRlbSc6IHtcblx0XHRcdFx0b3V0cHV0SXRlbVJlcXVlc3RzLnJlc29sdmVPdXRwdXRJdGVtKGV2ZW50LmRhdGEucmVxdWVzdElkLCBldmVudC5kYXRhLm91dHB1dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCByZW5kZXJGYWxsYmFja0Vycm9yTmFtZSA9ICd2c2NvZGUuZmFsbGJhY2tUb05leHRSZW5kZXJlcic7XG5cblx0Y2xhc3MgUmVuZGVyZXIge1xuXG5cdFx0cHJpdmF0ZSBfb25NZXNzYWdlRXZlbnQgPSBjcmVhdGVFbWl0dGVyKCk7XG5cdFx0cHJpdmF0ZSBfbG9hZFByb21pc2U/OiBQcm9taXNlPHJlbmRlcmVyQXBpLlJlbmRlcmVyQXBpIHwgdW5kZWZpbmVkPjtcblx0XHRwcml2YXRlIF9hcGk6IHJlbmRlcmVyQXBpLlJlbmRlcmVyQXBpIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgZGF0YTogd2Vidmlld01lc3NhZ2VzLlJlbmRlcmVyTWV0YWRhdGEsXG5cdFx0KSB7IH1cblxuXHRcdHB1YmxpYyByZWNlaXZlTWVzc2FnZShtZXNzYWdlOiB1bmtub3duKSB7XG5cdFx0XHR0aGlzLl9vbk1lc3NhZ2VFdmVudC5maXJlKG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBhc3luYyByZW5kZXJPdXRwdXRJdGVtKGl0ZW06IHJlbmRlcmVyQXBpLk91dHB1dEl0ZW0sIGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmxvYWQoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKCFzaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRcdHNob3dSZW5kZXJFcnJvcihgRXJyb3IgbG9hZGluZyByZW5kZXJlciAnJHt0aGlzLmRhdGEuaWR9J2AsIGVsZW1lbnQsIGUgaW5zdGFuY2VvZiBFcnJvciA/IFtlXSA6IFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fYXBpKSB7XG5cdFx0XHRcdGlmICghc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRzaG93UmVuZGVyRXJyb3IoYFJlbmRlcmVyICcke3RoaXMuZGF0YS5pZH0nIGRvZXMgbm90IGltcGxlbWVudCByZW5kZXJPdXRwdXRJdGVtYCwgZWxlbWVudCwgW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYXBpLnJlbmRlck91dHB1dEl0ZW0oaXRlbSwgZWxlbWVudCwgc2lnbmFsKTtcblx0XHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdSZW5kZXJlZCBvdXRwdXQgaXRlbScsIHsgaWQ6IGl0ZW0uaWQsIGR1cmF0aW9uOiBgJHtwZXJmb3JtYW5jZS5ub3coKSAtIHJlbmRlclN0YXJ0fW1zYCB9KTtcblxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubmFtZSA9PT0gcmVuZGVyRmFsbGJhY2tFcnJvck5hbWUpIHtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2hvd1JlbmRlckVycm9yKGBFcnJvciByZW5kZXJpbmcgb3V0cHV0IGl0ZW0gdXNpbmcgJyR7dGhpcy5kYXRhLmlkfSdgLCBlbGVtZW50LCBlIGluc3RhbmNlb2YgRXJyb3IgPyBbZV0gOiBbXSk7XG5cdFx0XHRcdHRoaXMucG9zdERlYnVnTWVzc2FnZSgnUmVuZGVyaW5nIG91dHB1dCBpdGVtIGZhaWxlZCcsIHsgaWQ6IGl0ZW0uaWQsIGVycm9yOiBlICsgJycgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIGRpc3Bvc2VPdXRwdXRJdGVtKGlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHR0aGlzLl9hcGk/LmRpc3Bvc2VPdXRwdXRJdGVtPy4oaWQpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgY3JlYXRlUmVuZGVyZXJDb250ZXh0KCk6IFJlbmRlcmVyQ29udGV4dCB7XG5cdFx0XHRjb25zdCB7IGlkLCBtZXNzYWdpbmcgfSA9IHRoaXMuZGF0YTtcblx0XHRcdGNvbnN0IGNvbnRleHQ6IFJlbmRlcmVyQ29udGV4dCA9IHtcblx0XHRcdFx0c2V0U3RhdGU6IG5ld1N0YXRlID0+IHZzY29kZS5zZXRTdGF0ZSh7IC4uLnZzY29kZS5nZXRTdGF0ZSgpLCBbaWRdOiBuZXdTdGF0ZSB9KSxcblx0XHRcdFx0Z2V0U3RhdGU6IDxUPigpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHZzY29kZS5nZXRTdGF0ZSgpO1xuXHRcdFx0XHRcdHJldHVybiB0eXBlb2Ygc3RhdGUgPT09ICdvYmplY3QnICYmIHN0YXRlID8gc3RhdGVbaWRdIGFzIFQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFJlbmRlcmVyOiBhc3luYyAoaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVyID0gcmVuZGVyZXJzLmdldFJlbmRlcmVyKGlkKTtcblx0XHRcdFx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocmVuZGVyZXIuX2FwaSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlbmRlcmVyLl9hcGk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZW5kZXJlci5sb2FkKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdvcmtzcGFjZToge1xuXHRcdFx0XHRcdGdldCBpc1RydXN0ZWQoKSB7IHJldHVybiBpc1dvcmtzcGFjZVRydXN0ZWQ7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRnZXQgbGluZUxpbWl0KCkgeyByZXR1cm4gY3VycmVudFJlbmRlck9wdGlvbnMubGluZUxpbWl0OyB9LFxuXHRcdFx0XHRcdGdldCBvdXRwdXRTY3JvbGxpbmcoKSB7IHJldHVybiBjdXJyZW50UmVuZGVyT3B0aW9ucy5vdXRwdXRTY3JvbGxpbmc7IH0sXG5cdFx0XHRcdFx0Z2V0IG91dHB1dFdvcmRXcmFwKCkgeyByZXR1cm4gY3VycmVudFJlbmRlck9wdGlvbnMub3V0cHV0V29yZFdyYXA7IH0sXG5cdFx0XHRcdFx0Z2V0IGxpbmtpZnlGaWxlUGF0aHMoKSB7IHJldHVybiBjdXJyZW50UmVuZGVyT3B0aW9ucy5saW5raWZ5RmlsZVBhdGhzOyB9LFxuXHRcdFx0XHRcdGdldCBtaW5pbWFsRXJyb3IoKSB7IHJldHVybiBjdXJyZW50UmVuZGVyT3B0aW9ucy5taW5pbWFsRXJyb3I7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBvbkRpZENoYW5nZVNldHRpbmdzKCkgeyByZXR1cm4gc2V0dGluZ0NoYW5nZS5ldmVudDsgfVxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKG1lc3NhZ2luZykge1xuXHRcdFx0XHRjb250ZXh0Lm9uRGlkUmVjZWl2ZU1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2VFdmVudC5ldmVudDtcblx0XHRcdFx0Y29udGV4dC5wb3N0TWVzc2FnZSA9IG1lc3NhZ2UgPT4gcG9zdE5vdGVib29rTWVzc2FnZSgnY3VzdG9tUmVuZGVyZXJNZXNzYWdlJywgeyByZW5kZXJlcklkOiBpZCwgbWVzc2FnZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBsb2FkKCk6IFByb21pc2U8cmVuZGVyZXJBcGkuUmVuZGVyZXJBcGkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdHRoaXMuX2xvYWRQcm9taXNlID8/PSB0aGlzLl9sb2FkKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbG9hZFByb21pc2U7XG5cdFx0fVxuXG5cdFx0LyoqIElubmVyIGZ1bmN0aW9uIGNhY2hlZCBpbiB0aGUgX2xvYWRQcm9taXNlKCkuICovXG5cdFx0cHJpdmF0ZSBhc3luYyBfbG9hZCgpOiBQcm9taXNlPHJlbmRlcmVyQXBpLlJlbmRlcmVyQXBpIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHR0aGlzLnBvc3REZWJ1Z01lc3NhZ2UoJ1N0YXJ0IGxvYWRpbmcgcmVuZGVyZXInKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gUHJlbG9hZHMgbmVlZCB0byBiZSBsb2FkZWQgYmVmb3JlIGxvYWRpbmcgcmVuZGVyZXJzLlxuXHRcdFx0XHRhd2FpdCBrZXJuZWxQcmVsb2Fkcy53YWl0Rm9yQWxsQ3VycmVudCgpO1xuXG5cdFx0XHRcdGNvbnN0IGltcG9ydFN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0XHRcdGNvbnN0IG1vZHVsZTogUmVuZGVyZXJNb2R1bGUgPSBhd2FpdCBfX2ltcG9ydCh0aGlzLmRhdGEuZW50cnlwb2ludC5wYXRoKTtcblx0XHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdJbXBvcnRlZCByZW5kZXJlcicsIHsgZHVyYXRpb246IGAke3BlcmZvcm1hbmNlLm5vdygpIC0gaW1wb3J0U3RhcnR9bXNgIH0pO1xuXG5cdFx0XHRcdGlmICghbW9kdWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fYXBpID0gYXdhaXQgbW9kdWxlLmFjdGl2YXRlKHRoaXMuY3JlYXRlUmVuZGVyZXJDb250ZXh0KCkpO1xuXHRcdFx0XHR0aGlzLnBvc3REZWJ1Z01lc3NhZ2UoJ0FjdGl2YXRlZCByZW5kZXJlcicsIHsgZHVyYXRpb246IGAke3BlcmZvcm1hbmNlLm5vdygpIC0gaW1wb3J0U3RhcnR9bXNgIH0pO1xuXG5cdFx0XHRcdGNvbnN0IGRlcGVuZGFudFJlbmRlcmVycyA9IGN0eC5yZW5kZXJlckRhdGFcblx0XHRcdFx0XHQuZmlsdGVyKGQgPT4gZC5lbnRyeXBvaW50LmV4dGVuZHMgPT09IHRoaXMuZGF0YS5pZCk7XG5cblx0XHRcdFx0aWYgKGRlcGVuZGFudFJlbmRlcmVycy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLnBvc3REZWJ1Z01lc3NhZ2UoJ0FjdGl2YXRpbmcgZGVwZW5kYW50IHJlbmRlcmVycycsIHsgZGVwZW5kZW50czogZGVwZW5kYW50UmVuZGVyZXJzLm1hcCh4ID0+IHguaWQpLmpvaW4oJywgJykgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb2FkIGFsbCByZW5kZXJlcnMgdGhhdCBleHRlbmQgdGhpcyByZW5kZXJlclxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChkZXBlbmRhbnRSZW5kZXJlcnMubWFwKGFzeW5jIGQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVyID0gcmVuZGVyZXJzLmdldFJlbmRlcmVyKGQuaWQpO1xuXHRcdFx0XHRcdGlmICghcmVuZGVyZXIpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgZXh0ZW5kaW5nIHJlbmRlcmVyOiAke2QuaWR9YCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCByZW5kZXJlci5sb2FkKCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0Ly8gU3F1YXNoIGFueSBlcnJvcnMgZXh0ZW5kcyBlcnJvcnMuIFRoZXkgd29uJ3QgcHJldmVudCB0aGUgcmVuZGVyZXJcblx0XHRcdFx0XHRcdC8vIGl0c2VsZiBmcm9tIHdvcmtpbmcsIHNvIGp1c3QgbG9nIHRoZW0uXG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdBY3RpdmF0aW5nIGRlcGVuZGFudCByZW5kZXJlciBmYWlsZWQnLCB7IGRlcGVuZGVudDogZC5pZCwgZXJyb3I6IGUgKyAnJyB9KTtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FwaTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdMb2FkaW5nIHJlbmRlcmVyIGZhaWxlZCcpO1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByaXZhdGUgcG9zdERlYnVnTWVzc2FnZShtc2c6IHN0cmluZywgZGF0YT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHtcblx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklMb2dSZW5kZXJlckRlYnVnTWVzc2FnZT4oJ2xvZ1JlbmRlcmVyRGVidWdNZXNzYWdlJywge1xuXHRcdFx0XHRtZXNzYWdlOiBgW3JlbmRlcmVyICR7dGhpcy5kYXRhLmlkfV0gLSAke21zZ31gLFxuXHRcdFx0XHRkYXRhXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBrZXJuZWxQcmVsb2FkcyA9IG5ldyBjbGFzcyB7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcmVsb2FkcyA9IG5ldyBNYXA8c3RyaW5nIC8qIHVyaSAqLywgUHJvbWlzZTx1bmtub3duPj4oKTtcblxuXHRcdC8qKlxuXHRcdCAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgZ2l2ZW4gcHJlbG9hZCBpcyBhY3RpdmF0ZWQuXG5cdFx0ICovXG5cdFx0cHVibGljIHdhaXRGb3IodXJpOiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiB0aGlzLnByZWxvYWRzLmdldCh1cmkpIHx8IFByb21pc2UucmVzb2x2ZShuZXcgRXJyb3IoYFByZWxvYWQgbm90IHJlYWR5OiAke3VyaX1gKSk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogTG9hZHMgYSBwcmVsb2FkLlxuXHRcdCAqIEBwYXJhbSB1cmkgVVJJIHRvIGxvYWQgZnJvbVxuXHRcdCAqIEBwYXJhbSBvcmlnaW5hbFVyaSBVUkkgdG8gc2hvdyBpbiBhbiBlcnJvciBtZXNzYWdlIGlmIHRoZSBwcmVsb2FkIGlzIGludmFsaWQuXG5cdFx0ICovXG5cdFx0cHVibGljIGxvYWQodXJpOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHJ1bktlcm5lbFByZWxvYWQodXJpKSxcblx0XHRcdFx0dGhpcy53YWl0Rm9yQWxsQ3VycmVudCgpLFxuXHRcdFx0XSk7XG5cblx0XHRcdHRoaXMucHJlbG9hZHMuc2V0KHVyaSwgcHJvbWlzZSk7XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdhaXRzIGZvciBhbGwgY3VycmVudGx5LXJlZ2lzdGVyZWQgcHJlbG9hZHMgdG9cblx0XHQgKiBhY3RpdmF0ZSBiZWZvcmUgcmVzb2x2aW5nLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyB3YWl0Rm9yQWxsQ3VycmVudCgpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbLi4udGhpcy5wcmVsb2Fkcy52YWx1ZXMoKV0ubWFwKHAgPT4gcC5jYXRjaChlcnIgPT4gZXJyKSkpO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBvdXRwdXRSdW5uZXIgPSBuZXcgY2xhc3Mge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGFib3J0OiBBYm9ydENvbnRyb2xsZXI7IHF1ZXVlOiBQcm9taXNlPHVua25vd24+IH0+KCk7XG5cblx0XHQvKipcblx0XHQgKiBQdXNoZXMgdGhlIGFjdGlvbiBvbnRvIHRoZSBsaXN0IG9mIGFjdGlvbnMgZm9yIHRoZSBnaXZlbiBvdXRwdXQgSUQsXG5cdFx0ICogZW5zdXJpbmcgdGhhdCBpdCdzIHJ1biBpbi1vcmRlci5cblx0XHQgKi9cblx0XHRwdWJsaWMgZW5xdWV1ZShvdXRwdXRJZDogc3RyaW5nLCBhY3Rpb246IChjYW5jZWxTaWduYWw6IEFib3J0U2lnbmFsKSA9PiB1bmtub3duKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdPdXRwdXRDcmVhdGlvblJlcXVlc3QuZ2V0KG91dHB1dElkKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LmRlbGV0ZShvdXRwdXRJZCk7XG5cblx0XHRcdGNvbnN0IHJlY29yZCA9IHRoaXMub3V0cHV0cy5nZXQob3V0cHV0SWQpO1xuXHRcdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdFx0dGhpcy5vdXRwdXRzLnNldChvdXRwdXRJZCwgeyBhYm9ydDogY29udHJvbGxlciwgcXVldWU6IG5ldyBQcm9taXNlKHIgPT4gcihhY3Rpb24oY29udHJvbGxlci5zaWduYWwpKSkgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWNvcmQucXVldWUgPSByZWNvcmQucXVldWUudGhlbihhc3luYyByID0+IHtcblx0XHRcdFx0XHRpZiAoIXJlY29yZC5hYm9ydC5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgYWN0aW9uKHJlY29yZC5hYm9ydC5zaWduYWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBwZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0OiBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4gPSBuZXcgTWFwKCk7XG5cblx0XHRwdWJsaWMgZW5xdWV1ZUlkbGUob3V0cHV0SWQ6IHN0cmluZywgYWN0aW9uOiAoY2FuY2VsU2lnbmFsOiBBYm9ydFNpZ25hbCkgPT4gdW5rbm93bikge1xuXHRcdFx0dGhpcy5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LmdldChvdXRwdXRJZCk/LmRpc3Bvc2UoKTtcblx0XHRcdG91dHB1dFJ1bm5lci5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LnNldChvdXRwdXRJZCwgcnVuV2hlbklkbGUoKCkgPT4ge1xuXHRcdFx0XHRvdXRwdXRSdW5uZXIuZW5xdWV1ZShvdXRwdXRJZCwgYWN0aW9uKTtcblx0XHRcdFx0b3V0cHV0UnVubmVyLnBlbmRpbmdPdXRwdXRDcmVhdGlvblJlcXVlc3QuZGVsZXRlKG91dHB1dElkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBDYW5jZWxzIHRoZSByZW5kZXJpbmcgb2YgYWxsIG91dHB1dHMuXG5cdFx0ICovXG5cdFx0cHVibGljIGNhbmNlbEFsbCgpIHtcblx0XHRcdC8vIERlbGV0ZSBhbGwgcGVuZGluZyBpZGxlIHJlcXVlc3RzXG5cdFx0XHR0aGlzLnBlbmRpbmdPdXRwdXRDcmVhdGlvblJlcXVlc3QuZm9yRWFjaChyID0+IHIuZGlzcG9zZSgpKTtcblx0XHRcdHRoaXMucGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdC5jbGVhcigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHsgYWJvcnQgfSBvZiB0aGlzLm91dHB1dHMudmFsdWVzKCkpIHtcblx0XHRcdFx0YWJvcnQuYWJvcnQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMub3V0cHV0cy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIENhbmNlbHMgYW55IG9uZ29pbmcgcmVuZGVyaW5nIG91dCBhbiBvdXRwdXQuXG5cdFx0ICovXG5cdFx0cHVibGljIGNhbmNlbE91dHB1dChvdXRwdXRJZDogc3RyaW5nKSB7XG5cdFx0XHQvLyBEZWxldGUgdGhlIHBlbmRpbmcgaWRsZSByZXF1ZXN0IGlmIGl0IGV4aXN0c1xuXHRcdFx0dGhpcy5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LmdldChvdXRwdXRJZCk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdC5kZWxldGUob3V0cHV0SWQpO1xuXG5cdFx0XHRjb25zdCBvdXRwdXQgPSB0aGlzLm91dHB1dHMuZ2V0KG91dHB1dElkKTtcblx0XHRcdGlmIChvdXRwdXQpIHtcblx0XHRcdFx0b3V0cHV0LmFib3J0LmFib3J0KCk7XG5cdFx0XHRcdHRoaXMub3V0cHV0cy5kZWxldGUob3V0cHV0SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRjb25zdCByZW5kZXJlcnMgPSBuZXcgY2xhc3Mge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVycyA9IG5ldyBNYXA8LyogaWQgKi8gc3RyaW5nLCBSZW5kZXJlcj4oKTtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiBjdHgucmVuZGVyZXJEYXRhKSB7XG5cdFx0XHRcdHRoaXMuYWRkUmVuZGVyZXIocmVuZGVyZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBnZXRSZW5kZXJlcihpZDogc3RyaW5nKTogUmVuZGVyZXIgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVycy5nZXQoaWQpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgcmVuZGVyZXJFcXVhbChhOiB3ZWJ2aWV3TWVzc2FnZXMuUmVuZGVyZXJNZXRhZGF0YSwgYjogd2Vidmlld01lc3NhZ2VzLlJlbmRlcmVyTWV0YWRhdGEpIHtcblx0XHRcdGlmIChhLmlkICE9PSBiLmlkIHx8IGEuZW50cnlwb2ludC5wYXRoICE9PSBiLmVudHJ5cG9pbnQucGF0aCB8fCBhLmVudHJ5cG9pbnQuZXh0ZW5kcyAhPT0gYi5lbnRyeXBvaW50LmV4dGVuZHMgfHwgYS5tZXNzYWdpbmcgIT09IGIubWVzc2FnaW5nKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGEubWltZVR5cGVzLmxlbmd0aCAhPT0gYi5taW1lVHlwZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhLm1pbWVUeXBlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoYS5taW1lVHlwZXNbaV0gIT09IGIubWltZVR5cGVzW2ldKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVSZW5kZXJlckRhdGEocmVuZGVyZXJEYXRhOiByZWFkb25seSB3ZWJ2aWV3TWVzc2FnZXMuUmVuZGVyZXJNZXRhZGF0YVtdKSB7XG5cdFx0XHRjb25zdCBvbGRLZXlzID0gbmV3IFNldCh0aGlzLl9yZW5kZXJlcnMua2V5cygpKTtcblx0XHRcdGNvbnN0IG5ld0tleXMgPSBuZXcgU2V0KHJlbmRlcmVyRGF0YS5tYXAoZCA9PiBkLmlkKSk7XG5cblx0XHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgcmVuZGVyZXJEYXRhKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcmVuZGVyZXJzLmdldChyZW5kZXJlci5pZCk7XG5cdFx0XHRcdGlmIChleGlzdGluZyAmJiB0aGlzLnJlbmRlcmVyRXF1YWwoZXhpc3RpbmcuZGF0YSwgcmVuZGVyZXIpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmFkZFJlbmRlcmVyKHJlbmRlcmVyKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygb2xkS2V5cykge1xuXHRcdFx0XHRpZiAoIW5ld0tleXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJlcnMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRwcml2YXRlIGFkZFJlbmRlcmVyKHJlbmRlcmVyOiB3ZWJ2aWV3TWVzc2FnZXMuUmVuZGVyZXJNZXRhZGF0YSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyZXJzLnNldChyZW5kZXJlci5pZCwgbmV3IFJlbmRlcmVyKHJlbmRlcmVyKSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGNsZWFyQWxsKCkge1xuXHRcdFx0b3V0cHV0UnVubmVyLmNhbmNlbEFsbCgpO1xuXHRcdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiB0aGlzLl9yZW5kZXJlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0cmVuZGVyZXIuZGlzcG9zZU91dHB1dEl0ZW0oKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgY2xlYXJPdXRwdXQocmVuZGVyZXJJZDogc3RyaW5nLCBvdXRwdXRJZDogc3RyaW5nKSB7XG5cdFx0XHRvdXRwdXRSdW5uZXIuY2FuY2VsT3V0cHV0KG91dHB1dElkKTtcblx0XHRcdHRoaXMuX3JlbmRlcmVycy5nZXQocmVuZGVyZXJJZCk/LmRpc3Bvc2VPdXRwdXRJdGVtKG91dHB1dElkKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgYXN5bmMgcmVuZGVyKGl0ZW06IEV4dGVuZGVkT3V0cHV0SXRlbSwgcHJlZmVycmVkUmVuZGVyZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBlbGVtZW50OiBIVE1MRWxlbWVudCwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgcHJpbWFyeVJlbmRlcmVyID0gdGhpcy5maW5kUmVuZGVyZXIocHJlZmVycmVkUmVuZGVyZXJJZCwgaXRlbSk7XG5cdFx0XHRpZiAoIXByaW1hcnlSZW5kZXJlcikge1xuXHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSAod2luZG93LmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLW5vdGVib29rLWNlbGwtcmVuZGVyZXItbm90LWZvdW5kLWVycm9yJykgfHwgJycpLnJlcGxhY2UoJyQwJywgKCkgPT4gaXRlbS5taW1lKTtcblx0XHRcdFx0dGhpcy5zaG93UmVuZGVyRXJyb3IoaXRlbSwgZWxlbWVudCwgZXJyb3JNZXNzYWdlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgcHJpbWFyeSByZW5kZXJlciBmaXJzdFxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fZG9SZW5kZXIoaXRlbSwgZWxlbWVudCwgcHJpbWFyeVJlbmRlcmVyLCBzaWduYWwpKS5jb250aW51ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByaW1hcnkgcmVuZGVyZXIgZmFpbGVkIGluIGFuIGV4cGVjdGVkIHdheS4gRmFsbGJhY2sgdG8gcmVuZGVyIHRoZSBuZXh0IG1pbWUgdHlwZXNcblx0XHRcdGZvciAoY29uc3QgYWRkaXRpb25hbEl0ZW1EYXRhIG9mIGl0ZW0uX2FsbE91dHB1dEl0ZW1zKSB7XG5cdFx0XHRcdGlmIChhZGRpdGlvbmFsSXRlbURhdGEubWltZSA9PT0gaXRlbS5taW1lKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsSXRlbSA9IGF3YWl0IGFkZGl0aW9uYWxJdGVtRGF0YS5nZXRJdGVtKCk7XG5cdFx0XHRcdGlmIChzaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhZGRpdGlvbmFsSXRlbSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5maW5kUmVuZGVyZXIodW5kZWZpbmVkLCBhZGRpdGlvbmFsSXRlbSk7XG5cdFx0XHRcdFx0aWYgKHJlbmRlcmVyKSB7XG5cdFx0XHRcdFx0XHRpZiAoIShhd2FpdCB0aGlzLl9kb1JlbmRlcihhZGRpdGlvbmFsSXRlbSwgZWxlbWVudCwgcmVuZGVyZXIsIHNpZ25hbCkpLmNvbnRpbnVlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjsgLy8gV2UgcmVuZGVyZWQgc3VjY2Vzc2Z1bGx5XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFsbCByZW5kZXJlcnMgaGF2ZSBmYWlsZWQgYW5kIHRoZXJlIGlzIG5vdGhpbmcgbGVmdCB0byBmYWxsYmFjayB0b1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gKHdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1ub3RlYm9vay1jZWxsLXJlbmRlcmVyLWZhbGxiYWNrcy1leGhhdXN0ZWQnKSB8fCAnJykucmVwbGFjZSgnJDAnLCAoKSA9PiBpdGVtLm1pbWUpO1xuXHRcdFx0dGhpcy5zaG93UmVuZGVyRXJyb3IoaXRlbSwgZWxlbWVudCwgZXJyb3JNZXNzYWdlKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGFzeW5jIF9kb1JlbmRlcihpdGVtOiByZW5kZXJlckFwaS5PdXRwdXRJdGVtLCBlbGVtZW50OiBIVE1MRWxlbWVudCwgcmVuZGVyZXI6IFJlbmRlcmVyLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTx7IGNvbnRpbnVlOiBib29sZWFuIH0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJlbmRlcmVyLnJlbmRlck91dHB1dEl0ZW0oaXRlbSwgZWxlbWVudCwgc2lnbmFsKTtcblx0XHRcdFx0cmV0dXJuIHsgY29udGludWU6IGZhbHNlIH07IC8vIFdlIHJlbmRlcmVkIHN1Y2Nlc3NmdWxseVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBjb250aW51ZTogZmFsc2UgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5uYW1lID09PSByZW5kZXJGYWxsYmFja0Vycm9yTmFtZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRpbnVlOiB0cnVlIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgZTsgLy8gQmFpbCBhbmQgbGV0IGNhbGxlcnMgaGFuZGxlIHVua25vd24gZXJyb3JzXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRwcml2YXRlIGZpbmRSZW5kZXJlcihwcmVmZXJyZWRSZW5kZXJlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGluZm86IHJlbmRlcmVyQXBpLk91dHB1dEl0ZW0pIHtcblx0XHRcdGxldCByZW5kZXJlcjogUmVuZGVyZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmICh0eXBlb2YgcHJlZmVycmVkUmVuZGVyZXJJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVuZGVyZXIgPSBBcnJheS5mcm9tKHRoaXMuX3JlbmRlcmVycy52YWx1ZXMoKSlcblx0XHRcdFx0XHQuZmluZCgocmVuZGVyZXIpID0+IHJlbmRlcmVyLmRhdGEuaWQgPT09IHByZWZlcnJlZFJlbmRlcmVySWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZXJzID0gQXJyYXkuZnJvbSh0aGlzLl9yZW5kZXJlcnMudmFsdWVzKCkpXG5cdFx0XHRcdFx0LmZpbHRlcigocmVuZGVyZXIpID0+IHJlbmRlcmVyLmRhdGEubWltZVR5cGVzLmluY2x1ZGVzKGluZm8ubWltZSkgJiYgIXJlbmRlcmVyLmRhdGEuZW50cnlwb2ludC5leHRlbmRzKTtcblxuXHRcdFx0XHRpZiAocmVuZGVyZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIERlLXByaW9yaXRpemUgYnVpbHQtaW4gcmVuZGVyZXJzXG5cdFx0XHRcdFx0cmVuZGVyZXJzLnNvcnQoKGEsIGIpID0+ICthLmRhdGEuaXNCdWlsdGluIC0gK2IuZGF0YS5pc0J1aWx0aW4pO1xuXG5cdFx0XHRcdFx0Ly8gVXNlIGZpcnN0IHJlbmRlcmVyIHdlIGZpbmQgaW4gc29ydGVkIGxpc3Rcblx0XHRcdFx0XHRyZW5kZXJlciA9IHJlbmRlcmVyc1swXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlbmRlcmVyO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgc2hvd1JlbmRlckVycm9yKGluZm86IHJlbmRlcmVyQXBpLk91dHB1dEl0ZW0sIGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBlcnJvck1lc3NhZ2U6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgZXJyb3JDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdFx0Y29uc3QgZXJyb3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGVycm9yLmNsYXNzTmFtZSA9ICduby1yZW5kZXJlci1lcnJvcic7XG5cdFx0XHRlcnJvci5pbm5lclRleHQgPSBlcnJvck1lc3NhZ2U7XG5cblx0XHRcdGNvbnN0IGNlbGxUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjZWxsVGV4dC5pbm5lclRleHQgPSBpbmZvLnRleHQoKTtcblxuXHRcdFx0ZXJyb3JDb250YWluZXIuYXBwZW5kQ2hpbGQoZXJyb3IpO1xuXHRcdFx0ZXJyb3JDb250YWluZXIuYXBwZW5kQ2hpbGQoY2VsbFRleHQpO1xuXG5cdFx0XHRlbGVtZW50LmlubmVyVGV4dCA9ICcnO1xuXHRcdFx0ZWxlbWVudC5hcHBlbmRDaGlsZChlcnJvckNvbnRhaW5lcik7XG5cdFx0fVxuXHR9KCk7XG5cblx0Y29uc3Qgdmlld01vZGVsID0gbmV3IGNsYXNzIFZpZXdNb2RlbCB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrdXBDZWxscyA9IG5ldyBNYXA8c3RyaW5nLCBNYXJrdXBDZWxsPigpO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX291dHB1dENlbGxzID0gbmV3IE1hcDxzdHJpbmcsIE91dHB1dENlbGw+KCk7XG5cblx0XHRwdWJsaWMgY2xlYXJBbGwoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgdGhpcy5fbWFya3VwQ2VsbHMudmFsdWVzKCkpIHtcblx0XHRcdFx0Y2VsbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tYXJrdXBDZWxscy5jbGVhcigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IG91dHB1dCBvZiB0aGlzLl9vdXRwdXRDZWxscy52YWx1ZXMoKSkge1xuXHRcdFx0XHRvdXRwdXQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3V0cHV0Q2VsbHMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGFzeW5jIGNyZWF0ZU1hcmt1cENlbGwoaW5pdDogd2Vidmlld01lc3NhZ2VzLklNYXJrdXBDZWxsSW5pdGlhbGl6YXRpb24sIHRvcDogbnVtYmVyLCB2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTxNYXJrdXBDZWxsPiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21hcmt1cENlbGxzLmdldChpbml0LmNlbGxJZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVHJ5aW5nIHRvIGNyZWF0ZSBtYXJrdXAgdGhhdCBhbHJlYWR5IGV4aXN0czogJHtpbml0LmNlbGxJZH1gKTtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjZWxsID0gbmV3IE1hcmt1cENlbGwoaW5pdC5jZWxsSWQsIGluaXQubWltZSwgaW5pdC5jb250ZW50LCB0b3AsIGluaXQubWV0YWRhdGEpO1xuXHRcdFx0Y2VsbC5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSB2aXNpYmxlID8gJycgOiAnaGlkZGVuJztcblx0XHRcdHRoaXMuX21hcmt1cENlbGxzLnNldChpbml0LmNlbGxJZCwgY2VsbCk7XG5cblx0XHRcdGF3YWl0IGNlbGwucmVhZHk7XG5cdFx0XHRyZXR1cm4gY2VsbDtcblx0XHR9XG5cblx0XHRwdWJsaWMgYXN5bmMgZW5zdXJlTWFya3VwQ2VsbChpbmZvOiB3ZWJ2aWV3TWVzc2FnZXMuSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0bGV0IGNlbGwgPSB0aGlzLl9tYXJrdXBDZWxscy5nZXQoaW5mby5jZWxsSWQpO1xuXHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0Y2VsbC5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSBpbmZvLnZpc2libGUgPyAnJyA6ICdoaWRkZW4nO1xuXHRcdFx0XHRhd2FpdCBjZWxsLnVwZGF0ZUNvbnRlbnRBbmRSZW5kZXIoaW5mby5jb250ZW50LCBpbmZvLm1ldGFkYXRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNlbGwgPSBhd2FpdCB0aGlzLmNyZWF0ZU1hcmt1cENlbGwoaW5mbywgaW5mby5vZmZzZXQsIGluZm8udmlzaWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIGRlbGV0ZU1hcmt1cENlbGwoaWQ6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuZ2V0RXhwZWN0ZWRNYXJrdXBDZWxsKGlkKTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdGNlbGwucmVtb3ZlKCk7XG5cdFx0XHRcdGNlbGwuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9tYXJrdXBDZWxscy5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBhc3luYyB1cGRhdGVNYXJrdXBDb250ZW50KGlkOiBzdHJpbmcsIG5ld0NvbnRlbnQ6IHN0cmluZywgbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5nZXRFeHBlY3RlZE1hcmt1cENlbGwoaWQpO1xuXHRcdFx0YXdhaXQgY2VsbD8udXBkYXRlQ29udGVudEFuZFJlbmRlcihuZXdDb250ZW50LCBtZXRhZGF0YSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHNob3dNYXJrdXBDZWxsKGlkOiBzdHJpbmcsIHRvcDogbnVtYmVyLCBuZXdDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQsIG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuZ2V0RXhwZWN0ZWRNYXJrdXBDZWxsKGlkKTtcblx0XHRcdGNlbGw/LnNob3codG9wLCBuZXdDb250ZW50LCBtZXRhZGF0YSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGhpZGVNYXJrdXBDZWxsKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldEV4cGVjdGVkTWFya3VwQ2VsbChpZCk7XG5cdFx0XHRjZWxsPy5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVuaGlkZU1hcmt1cENlbGwoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuZ2V0RXhwZWN0ZWRNYXJrdXBDZWxsKGlkKTtcblx0XHRcdGNlbGw/LnVuaGlkZSgpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgZ2V0RXhwZWN0ZWRNYXJrdXBDZWxsKGlkOiBzdHJpbmcpOiBNYXJrdXBDZWxsIHwgdW5kZWZpbmVkIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9tYXJrdXBDZWxscy5nZXQoaWQpO1xuXHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBDb3VsZCBub3QgZmluZCBtYXJrdXAgY2VsbCAnJHtpZH0nYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2VsbDtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlU2VsZWN0ZWRDZWxscyhzZWxlY3RlZENlbGxJZHM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZENlbGxTZXQgPSBuZXcgU2V0PHN0cmluZz4oc2VsZWN0ZWRDZWxsSWRzKTtcblx0XHRcdGZvciAoY29uc3QgY2VsbCBvZiB0aGlzLl9tYXJrdXBDZWxscy52YWx1ZXMoKSkge1xuXHRcdFx0XHRjZWxsLnNldFNlbGVjdGVkKHNlbGVjdGVkQ2VsbFNldC5oYXMoY2VsbC5pZCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyB0b2dnbGVEcmFnRHJvcEVuYWJsZWQoZHJhZ0FuZERyb3BFbmFibGVkOiBib29sZWFuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgdGhpcy5fbWFya3VwQ2VsbHMudmFsdWVzKCkpIHtcblx0XHRcdFx0Y2VsbC50b2dnbGVEcmFnRHJvcEVuYWJsZWQoZHJhZ0FuZERyb3BFbmFibGVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlTWFya3VwU2Nyb2xscyhtYXJrdXBDZWxsczogcmVhZG9ubHkgd2Vidmlld01lc3NhZ2VzLklNYXJrdXBDZWxsU2Nyb2xsVG9wc1tdKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgaWQsIHRvcCB9IG9mIG1hcmt1cENlbGxzKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9tYXJrdXBDZWxscy5nZXQoaWQpO1xuXHRcdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRcdGNlbGwuZWxlbWVudC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIGFzeW5jIHJlbmRlck91dHB1dENlbGwoZGF0YTogd2Vidmlld01lc3NhZ2VzLklDcmVhdGlvblJlcXVlc3RNZXNzYWdlLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBwcmVsb2FkRXJyb3JzID0gYXdhaXQgUHJvbWlzZS5hbGw8dW5kZWZpbmVkIHwgRXJyb3I+KFxuXHRcdFx0XHRkYXRhLnJlcXVpcmVkUHJlbG9hZHMubWFwKHAgPT4ga2VybmVsUHJlbG9hZHMud2FpdEZvcihwLnVyaSkudGhlbigoKSA9PiB1bmRlZmluZWQsIGVyciA9PiBlcnIpKVxuXHRcdFx0KTtcblx0XHRcdGlmIChzaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNlbGxPdXRwdXQgPSB0aGlzLmVuc3VyZU91dHB1dENlbGwoZGF0YS5jZWxsSWQsIGRhdGEuY2VsbFRvcCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIGNlbGxPdXRwdXQucmVuZGVyT3V0cHV0RWxlbWVudChkYXRhLCBwcmVsb2FkRXJyb3JzLCBzaWduYWwpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBlbnN1cmVPdXRwdXRDZWxsKGNlbGxJZDogc3RyaW5nLCBjZWxsVG9wOiBudW1iZXIsIHNraXBDZWxsVG9wVXBkYXRlSWZFeGlzdDogYm9vbGVhbik6IE91dHB1dENlbGwge1xuXHRcdFx0bGV0IGNlbGwgPSB0aGlzLl9vdXRwdXRDZWxscy5nZXQoY2VsbElkKTtcblx0XHRcdGNvbnN0IGV4aXN0ZWQgPSAhIWNlbGw7XG5cdFx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdFx0Y2VsbCA9IG5ldyBPdXRwdXRDZWxsKGNlbGxJZCk7XG5cdFx0XHRcdHRoaXMuX291dHB1dENlbGxzLnNldChjZWxsSWQsIGNlbGwpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXhpc3RlZCAmJiBza2lwQ2VsbFRvcFVwZGF0ZUlmRXhpc3QpIHtcblx0XHRcdFx0cmV0dXJuIGNlbGw7XG5cdFx0XHR9XG5cblx0XHRcdGNlbGwuZWxlbWVudC5zdHlsZS50b3AgPSBjZWxsVG9wICsgJ3B4Jztcblx0XHRcdHJldHVybiBjZWxsO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBjbGVhck91dHB1dChjZWxsSWQ6IHN0cmluZywgb3V0cHV0SWQ6IHN0cmluZywgcmVuZGVyZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fb3V0cHV0Q2VsbHMuZ2V0KGNlbGxJZCk7XG5cdFx0XHRjZWxsPy5jbGVhck91dHB1dChvdXRwdXRJZCwgcmVuZGVyZXJJZCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHNob3dPdXRwdXQoY2VsbElkOiBzdHJpbmcsIG91dHB1dElkOiBzdHJpbmcsIHRvcDogbnVtYmVyKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fb3V0cHV0Q2VsbHMuZ2V0KGNlbGxJZCk7XG5cdFx0XHRjZWxsPy5zaG93KG91dHB1dElkLCB0b3ApO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVBbmRSZXJlbmRlcihjZWxsSWQ6IHN0cmluZywgb3V0cHV0SWQ6IHN0cmluZywgY29udGVudDogd2Vidmlld01lc3NhZ2VzLklDcmVhdGlvbkNvbnRlbnQpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9vdXRwdXRDZWxscy5nZXQoY2VsbElkKTtcblx0XHRcdGNlbGw/LnVwZGF0ZUNvbnRlbnRBbmRSZXJlbmRlcihvdXRwdXRJZCwgY29udGVudCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGhpZGVPdXRwdXQoY2VsbElkOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9vdXRwdXRDZWxscy5nZXQoY2VsbElkKTtcblx0XHRcdGNlbGw/LmhpZGUoKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlT3V0cHV0SGVpZ2h0KGNlbGxJZDogc3RyaW5nLCBvdXRwdXRJZDogc3RyaW5nLCBoZWlnaHQ6IG51bWJlcikge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX291dHB1dENlbGxzLmdldChjZWxsSWQpO1xuXHRcdFx0Y2VsbD8udXBkYXRlT3V0cHV0SGVpZ2h0KG91dHB1dElkLCBoZWlnaHQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVPdXRwdXRzU2Nyb2xsKHVwZGF0ZXM6IHdlYnZpZXdNZXNzYWdlcy5JQ29udGVudFdpZGdldFRvcFJlcXVlc3RbXSkge1xuXHRcdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHVwZGF0ZXMpIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX291dHB1dENlbGxzLmdldChyZXF1ZXN0LmNlbGxJZCk7XG5cdFx0XHRcdGNlbGw/LnVwZGF0ZVNjcm9sbChyZXF1ZXN0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0oKTtcblxuXHRjbGFzcyBNYXJrZG93bkNvZGVCbG9jayB7XG5cdFx0cHJpdmF0ZSBzdGF0aWMgcGVuZGluZ0NvZGVCbG9ja3NUb0hpZ2hsaWdodCA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRWxlbWVudD4oKTtcblxuXHRcdHB1YmxpYyBzdGF0aWMgaGlnaGxpZ2h0Q29kZUJsb2NrKGlkOiBzdHJpbmcsIGh0bWw6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgZWwgPSBNYXJrZG93bkNvZGVCbG9jay5wZW5kaW5nQ29kZUJsb2Nrc1RvSGlnaGxpZ2h0LmdldChpZCk7XG5cdFx0XHRpZiAoIWVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRydXN0ZWRIdG1sID0gdHRQb2xpY3k/LmNyZWF0ZUhUTUwoaHRtbCkgPz8gaHRtbDtcblx0XHRcdGVsLmlubmVySFRNTCA9IHRydXN0ZWRIdG1sIGFzIHN0cmluZzsgLy8gQ29kZVFMIFtTTTAzNzEyXSBUaGUgcmVuZGVyZWQgY29udGVudCBjb21lcyBmcm9tIFZTIENvZGUncyB0b2tlbml6ZXIgYW5kIGlzIGNvbnNpZGVyZWQgc2FmZVxuXHRcdFx0Y29uc3Qgcm9vdCA9IGVsLmdldFJvb3ROb2RlKCk7XG5cdFx0XHRpZiAocm9vdCBpbnN0YW5jZW9mIFNoYWRvd1Jvb3QpIHtcblx0XHRcdFx0aWYgKCFyb290LmFkb3B0ZWRTdHlsZVNoZWV0cy5pbmNsdWRlcyh0b2tlbml6YXRpb25TdHlsZSkpIHtcblx0XHRcdFx0XHRyb290LmFkb3B0ZWRTdHlsZVNoZWV0cy5wdXNoKHRva2VuaXphdGlvblN0eWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBzdGF0aWMgcmVxdWVzdEhpZ2hsaWdodENvZGVCbG9jayhyb290OiBIVE1MRWxlbWVudCB8IFNoYWRvd1Jvb3QpIHtcblx0XHRcdGNvbnN0IGNvZGVCbG9ja3M6IEFycmF5PHsgdmFsdWU6IHN0cmluZzsgbGFuZzogc3RyaW5nOyBpZDogc3RyaW5nIH0+ID0gW107XG5cdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGVsIG9mIHJvb3QucXVlcnlTZWxlY3RvckFsbCgnLnZzY29kZS1jb2RlLWJsb2NrJykpIHtcblx0XHRcdFx0Y29uc3QgbGFuZyA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS12c2NvZGUtY29kZS1ibG9jay1sYW5nJyk7XG5cdFx0XHRcdGlmIChlbC50ZXh0Q29udGVudCAmJiBsYW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBgJHtEYXRlLm5vdygpfS0ke2krK31gO1xuXHRcdFx0XHRcdGNvZGVCbG9ja3MucHVzaCh7IHZhbHVlOiBlbC50ZXh0Q29udGVudCwgbGFuZzogbGFuZywgaWQgfSk7XG5cdFx0XHRcdFx0TWFya2Rvd25Db2RlQmxvY2sucGVuZGluZ0NvZGVCbG9ja3NUb0hpZ2hsaWdodC5zZXQoaWQsIGVsIGFzIEhUTUxFbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY29kZUJsb2Nrcztcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBNYXJrdXBDZWxsIHtcblxuXHRcdHB1YmxpYyByZWFkb25seSByZWFkeTogUHJvbWlzZTx2b2lkPjtcblxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdHB1YmxpYyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0SXRlbTogRXh0ZW5kZWRPdXRwdXRJdGVtO1xuXG5cdFx0Ly8vIEludGVybmFsIGZpZWxkIHRoYXQgaG9sZHMgdGV4dCBjb250ZW50XG5cdFx0cHJpdmF0ZSBfY29udGVudDogeyByZWFkb25seSB2YWx1ZTogc3RyaW5nOyByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7IHJlYWRvbmx5IG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YSB9O1xuXG5cdFx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHByaXZhdGUgcmVuZGVyVGFza0Fib3J0PzogQWJvcnRDb250cm9sbGVyO1xuXG5cdFx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgbWltZTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcsIHRvcDogbnVtYmVyLCBtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGEpIHtcblx0XHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdFx0dGhpcy5pZCA9IGlkO1xuXHRcdFx0dGhpcy5fY29udGVudCA9IHsgdmFsdWU6IGNvbnRlbnQsIHZlcnNpb246IDAsIG1ldGFkYXRhOiBtZXRhZGF0YSB9O1xuXG5cdFx0XHRjb25zdCB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8dm9pZD4oKTtcblx0XHRcdHRoaXMucmVhZHkgPSBwcm9taXNlO1xuXG5cdFx0XHRsZXQgY2FjaGVkRGF0YTogeyByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7IHJlYWRvbmx5IHZhbHVlOiBVaW50OEFycmF5IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLm91dHB1dEl0ZW0gPSBPYmplY3QuZnJlZXplPEV4dGVuZGVkT3V0cHV0SXRlbT4oe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0bWltZSxcblxuXHRcdFx0XHRnZXQgbWV0YWRhdGEoKTogTm90ZWJvb2tDZWxsTWV0YWRhdGEge1xuXHRcdFx0XHRcdHJldHVybiBzZWxmLl9jb250ZW50Lm1ldGFkYXRhO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdHRleHQ6ICgpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jb250ZW50LnZhbHVlO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGpzb246ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGRhdGE6ICgpOiBVaW50OEFycmF5ID0+IHtcblx0XHRcdFx0XHRpZiAoY2FjaGVkRGF0YT8udmVyc2lvbiA9PT0gdGhpcy5fY29udGVudC52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2FjaGVkRGF0YS52YWx1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdGV4dEVuY29kZXIuZW5jb2RlKHRoaXMuX2NvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHRcdGNhY2hlZERhdGEgPSB7IHZlcnNpb246IHRoaXMuX2NvbnRlbnQudmVyc2lvbiwgdmFsdWU6IGRhdGEgfTtcblx0XHRcdFx0XHRyZXR1cm4gZGF0YTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRibG9iKCk6IEJsb2Ige1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQmxvYihbdGhpcy5kYXRhKCkgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj5dLCB7IHR5cGU6IHRoaXMubWltZSB9KTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRfYWxsT3V0cHV0SXRlbXM6IFt7XG5cdFx0XHRcdFx0bWltZSxcblx0XHRcdFx0XHRnZXRJdGVtOiBhc3luYyAoKSA9PiB0aGlzLm91dHB1dEl0ZW0sXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdCA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udGFpbmVyJykhO1xuXHRcdFx0Y29uc3QgbWFya3VwQ2VsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bWFya3VwQ2VsbC5jbGFzc05hbWUgPSAnbWFya3VwJztcblx0XHRcdG1hcmt1cENlbGwuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0bWFya3VwQ2VsbC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblxuXHRcdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuaWQgPSB0aGlzLmlkO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3ByZXZpZXcnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudG9wID0gdG9wICsgJ3B4Jztcblx0XHRcdHRoaXMudG9nZ2xlRHJhZ0Ryb3BFbmFibGVkKGN1cnJlbnRPcHRpb25zLmRyYWdBbmREcm9wRW5hYmxlZCk7XG5cdFx0XHRtYXJrdXBDZWxsLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRyb290LmFwcGVuZENoaWxkKG1hcmt1cENlbGwpO1xuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XG5cblx0XHRcdHRoaXMudXBkYXRlQ29udGVudEFuZFJlbmRlcih0aGlzLl9jb250ZW50LnZhbHVlLCB0aGlzLl9jb250ZW50Lm1ldGFkYXRhKS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmVsZW1lbnQsIHRoaXMuaWQsIGZhbHNlLCB0aGlzLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9LCAoKSA9PiByZWplY3QoKSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGRpc3Bvc2UoKSB7XG5cdFx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0Py5hYm9ydCgpO1xuXHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhZGRFdmVudExpc3RlbmVycygpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdkYmxjbGljaycsICgpID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSVRvZ2dsZU1hcmt1cFByZXZpZXdNZXNzYWdlPigndG9nZ2xlTWFya3VwUHJldmlldycsIHsgY2VsbElkOiB0aGlzLmlkIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4ge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JQ2xpY2tNYXJrdXBDZWxsTWVzc2FnZT4oJ2NsaWNrTWFya3VwQ2VsbCcsIHtcblx0XHRcdFx0XHRjZWxsSWQ6IHRoaXMuaWQsXG5cdFx0XHRcdFx0YWx0S2V5OiBlLmFsdEtleSxcblx0XHRcdFx0XHRjdHJsS2V5OiBlLmN0cmxLZXksXG5cdFx0XHRcdFx0bWV0YUtleTogZS5tZXRhS2V5LFxuXHRcdFx0XHRcdHNoaWZ0S2V5OiBlLnNoaWZ0S2V5LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCBlID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNvbnRleHRNZW51TWFya3VwQ2VsbE1lc3NhZ2U+KCdjb250ZXh0TWVudU1hcmt1cENlbGwnLCB7XG5cdFx0XHRcdFx0Y2VsbElkOiB0aGlzLmlkLFxuXHRcdFx0XHRcdGNsaWVudFg6IGUuY2xpZW50WCxcblx0XHRcdFx0XHRjbGllbnRZOiBlLmNsaWVudFksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JTW91c2VFbnRlck1hcmt1cENlbGxNZXNzYWdlPignbW91c2VFbnRlck1hcmt1cENlbGwnLCB7IGNlbGxJZDogdGhpcy5pZCB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU1vdXNlTGVhdmVNYXJrdXBDZWxsTWVzc2FnZT4oJ21vdXNlTGVhdmVNYXJrdXBDZWxsJywgeyBjZWxsSWQ6IHRoaXMuaWQgfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIGUgPT4ge1xuXHRcdFx0XHRtYXJrdXBDZWxsRHJhZ01hbmFnZXIuc3RhcnREcmFnKGUsIHRoaXMuaWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdkcmFnJywgZSA9PiB7XG5cdFx0XHRcdG1hcmt1cENlbGxEcmFnTWFuYWdlci51cGRhdGVEcmFnKGUsIHRoaXMuaWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgZSA9PiB7XG5cdFx0XHRcdG1hcmt1cENlbGxEcmFnTWFuYWdlci5lbmREcmFnKGUsIHRoaXMuaWQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGFzeW5jIHVwZGF0ZUNvbnRlbnRBbmRSZW5kZXIobmV3Q29udGVudDogc3RyaW5nLCBtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHRoaXMuX2NvbnRlbnQgPSB7IHZhbHVlOiBuZXdDb250ZW50LCB2ZXJzaW9uOiB0aGlzLl9jb250ZW50LnZlcnNpb24gKyAxLCBtZXRhZGF0YSB9O1xuXG5cdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydD8uYWJvcnQoKTtcblxuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0ID0gY29udHJvbGxlcjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJlbmRlcmVycy5yZW5kZXIodGhpcy5vdXRwdXRJdGVtLCB1bmRlZmluZWQsIHRoaXMuZWxlbWVudCwgdGhpcy5yZW5kZXJUYXNrQWJvcnQuc2lnbmFsKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmICh0aGlzLnJlbmRlclRhc2tBYm9ydCA9PT0gY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJvb3QgPSAodGhpcy5lbGVtZW50LnNoYWRvd1Jvb3QgPz8gdGhpcy5lbGVtZW50KTtcblx0XHRcdGNvbnN0IGh0bWwgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygcm9vdC5jaGlsZHJlbikge1xuXHRcdFx0XHRzd2l0Y2ggKGNoaWxkLnRhZ05hbWUpIHtcblx0XHRcdFx0XHRjYXNlICdMSU5LJzpcblx0XHRcdFx0XHRjYXNlICdTQ1JJUFQnOlxuXHRcdFx0XHRcdGNhc2UgJ1NUWUxFJzpcblx0XHRcdFx0XHRcdC8vIG5vdCB3b3J0aCBzZW5kaW5nIG92ZXIgc2luY2UgaXQgd2lsbCBiZSBzdHJpcHBlZCBiZWZvcmUgcmVuZGVyaW5nXG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRodG1sLnB1c2goY2hpbGQub3V0ZXJIVE1MKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvZGVCbG9ja3M6IEFycmF5PHsgdmFsdWU6IHN0cmluZzsgbGFuZzogc3RyaW5nOyBpZDogc3RyaW5nIH0+ID0gTWFya2Rvd25Db2RlQmxvY2sucmVxdWVzdEhpZ2hsaWdodENvZGVCbG9jayhyb290KTtcblxuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSVJlbmRlcmVkTWFya3VwTWVzc2FnZT4oJ3JlbmRlcmVkTWFya3VwJywge1xuXHRcdFx0XHRjZWxsSWQ6IHRoaXMuaWQsXG5cdFx0XHRcdGh0bWw6IGh0bWwuam9pbignJyksXG5cdFx0XHRcdGNvZGVCbG9ja3Ncblx0XHRcdH0pO1xuXG5cdFx0XHRkaW1lbnNpb25VcGRhdGVyLnVwZGF0ZUhlaWdodCh0aGlzLmlkLCB0aGlzLmVsZW1lbnQub2Zmc2V0SGVpZ2h0LCB7XG5cdFx0XHRcdGlzT3V0cHV0OiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHNob3codG9wOiBudW1iZXIsIG5ld0NvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICcnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdFx0XHRpZiAodHlwZW9mIG5ld0NvbnRlbnQgPT09ICdzdHJpbmcnIHx8IG1ldGFkYXRhKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ29udGVudEFuZFJlbmRlcihuZXdDb250ZW50ID8/IHRoaXMuX2NvbnRlbnQudmFsdWUsIG1ldGFkYXRhID8/IHRoaXMuX2NvbnRlbnQubWV0YWRhdGEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGVNYXJrdXBEaW1lbnNpb25zKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIGhpZGUoKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1bmhpZGUoKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICcnO1xuXHRcdFx0dGhpcy51cGRhdGVNYXJrdXBEaW1lbnNpb25zKCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJlbW92ZSgpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGFzeW5jIHVwZGF0ZU1hcmt1cERpbWVuc2lvbnMoKSB7XG5cdFx0XHRkaW1lbnNpb25VcGRhdGVyLnVwZGF0ZUhlaWdodCh0aGlzLmlkLCB0aGlzLmVsZW1lbnQub2Zmc2V0SGVpZ2h0LCB7XG5cdFx0XHRcdGlzT3V0cHV0OiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHNldFNlbGVjdGVkKHNlbGVjdGVkOiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBzZWxlY3RlZCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHRvZ2dsZURyYWdEcm9wRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG5cdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZHJhZ2dhYmxlJyk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICd0cnVlJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dhYmxlJyk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2RyYWdnYWJsZScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNsYXNzIE91dHB1dENlbGwge1xuXHRcdHB1YmxpYyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0XHRwcml2YXRlIHJlYWRvbmx5IG91dHB1dEVsZW1lbnRzID0gbmV3IE1hcDwvKm91dHB1dElkKi8gc3RyaW5nLCBPdXRwdXRDb250YWluZXI+KCk7XG5cblx0XHRjb25zdHJ1Y3RvcihjZWxsSWQ6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb250YWluZXInKSE7XG5cblx0XHRcdGNvbnN0IHVwcGVyV3JhcHBlckVsZW1lbnQgPSBjcmVhdGVGb2N1c1NpbmsoY2VsbElkKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh1cHBlcldyYXBwZXJFbGVtZW50KTtcblxuXHRcdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLm91dGxpbmUgPSAnMCc7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5pZCA9IGNlbGxJZDtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjZWxsX2NvbnRhaW5lcicpO1xuXG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcblx0XHRcdHRoaXMuZWxlbWVudCA9IHRoaXMuZWxlbWVudDtcblxuXHRcdFx0Y29uc3QgbG93ZXJXcmFwcGVyRWxlbWVudCA9IGNyZWF0ZUZvY3VzU2luayhjZWxsSWQsIHRydWUpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGxvd2VyV3JhcHBlckVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdFx0Zm9yIChjb25zdCBvdXRwdXQgb2YgdGhpcy5vdXRwdXRFbGVtZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRvdXRwdXQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5vdXRwdXRFbGVtZW50cy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgY3JlYXRlT3V0cHV0RWxlbWVudChkYXRhOiB3ZWJ2aWV3TWVzc2FnZXMuSUNyZWF0aW9uUmVxdWVzdE1lc3NhZ2UpOiBPdXRwdXRFbGVtZW50IHtcblx0XHRcdGxldCBvdXRwdXRDb250YWluZXIgPSB0aGlzLm91dHB1dEVsZW1lbnRzLmdldChkYXRhLm91dHB1dElkKTtcblx0XHRcdGlmICghb3V0cHV0Q29udGFpbmVyKSB7XG5cdFx0XHRcdG91dHB1dENvbnRhaW5lciA9IG5ldyBPdXRwdXRDb250YWluZXIoZGF0YS5vdXRwdXRJZCk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChvdXRwdXRDb250YWluZXIuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMub3V0cHV0RWxlbWVudHMuc2V0KGRhdGEub3V0cHV0SWQsIG91dHB1dENvbnRhaW5lcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBvdXRwdXRDb250YWluZXIuY3JlYXRlT3V0cHV0RWxlbWVudChkYXRhLm91dHB1dElkLCBkYXRhLm91dHB1dE9mZnNldCwgZGF0YS5sZWZ0LCBkYXRhLmNlbGxJZCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGFzeW5jIHJlbmRlck91dHB1dEVsZW1lbnQoZGF0YTogd2Vidmlld01lc3NhZ2VzLklDcmVhdGlvblJlcXVlc3RNZXNzYWdlLCBwcmVsb2FkRXJyb3JzOiBSZWFkb25seUFycmF5PEVycm9yIHwgdW5kZWZpbmVkPiwgc2lnbmFsOiBBYm9ydFNpZ25hbCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IG91dHB1dEVsZW1lbnQgLyoqIG91dHB1dE5vZGUgKi8gPSB0aGlzLmNyZWF0ZU91dHB1dEVsZW1lbnQoZGF0YSk7XG5cdFx0XHRhd2FpdCBvdXRwdXRFbGVtZW50LnJlbmRlcihkYXRhLmNvbnRlbnQsIGRhdGEucmVuZGVyZXJJZCwgcHJlbG9hZEVycm9ycywgc2lnbmFsKTtcblxuXHRcdFx0Ly8gZG9uJ3QgaGlkZSB1bnRpbCBhZnRlciB0aGlzIHN0ZXAgc28gdGhhdCB0aGUgaGVpZ2h0IGlzIHJpZ2h0XG5cdFx0XHRvdXRwdXRFbGVtZW50LyoqIG91dHB1dE5vZGUgKi8uZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gZGF0YS5pbml0aWFsbHlIaWRkZW4gPyAnaGlkZGVuJyA6ICcnO1xuXG5cdFx0XHRpZiAoISFkYXRhLmV4ZWN1dGlvbklkICYmICEhZGF0YS5yZW5kZXJlcklkKSB7XG5cdFx0XHRcdGxldCBvdXRwdXRTaXplOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChkYXRhLmNvbnRlbnQudHlwZSA9PT0gMSAvKiBleHRlbnNpb24gKi8pIHtcblx0XHRcdFx0XHRvdXRwdXRTaXplID0gZGF0YS5jb250ZW50Lm91dHB1dC52YWx1ZUJ5dGVzLmxlbmd0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9ubHkgc2VuZCBwZXJmb3JtYW5jZSBtZXNzYWdlcyBmb3Igbm9uLWVtcHR5IG91dHB1dHMgdXAgdG8gYSBjZXJ0YWluIHNpemVcblx0XHRcdFx0aWYgKG91dHB1dFNpemUgIT09IHVuZGVmaW5lZCAmJiBvdXRwdXRTaXplID4gMCAmJiBvdXRwdXRTaXplIDwgMTAwICogMTAyNCkge1xuXHRcdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklQZXJmb3JtYW5jZU1lc3NhZ2U+KCdub3RlYm9va1BlcmZvcm1hbmNlTWVzc2FnZScsIHtcblx0XHRcdFx0XHRcdGNlbGxJZDogZGF0YS5jZWxsSWQsXG5cdFx0XHRcdFx0XHRleGVjdXRpb25JZDogZGF0YS5leGVjdXRpb25JZCxcblx0XHRcdFx0XHRcdGR1cmF0aW9uOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lLFxuXHRcdFx0XHRcdFx0cmVuZGVyZXJJZDogZGF0YS5yZW5kZXJlcklkLFxuXHRcdFx0XHRcdFx0b3V0cHV0U2l6ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIGNsZWFyT3V0cHV0KG91dHB1dElkOiBzdHJpbmcsIHJlbmRlcmVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5vdXRwdXRFbGVtZW50cy5nZXQob3V0cHV0SWQpO1xuXHRcdFx0b3V0cHV0Py5jbGVhcihyZW5kZXJlcklkKTtcblx0XHRcdG91dHB1dD8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5vdXRwdXRFbGVtZW50cy5kZWxldGUob3V0cHV0SWQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBzaG93KG91dHB1dElkOiBzdHJpbmcsIHRvcDogbnVtYmVyKSB7XG5cdFx0XHRjb25zdCBvdXRwdXRDb250YWluZXIgPSB0aGlzLm91dHB1dEVsZW1lbnRzLmdldChvdXRwdXRJZCk7XG5cdFx0XHRpZiAoIW91dHB1dENvbnRhaW5lcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJyc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHR9XG5cblx0XHRwdWJsaWMgaGlkZSgpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZUNvbnRlbnRBbmRSZXJlbmRlcihvdXRwdXRJZDogc3RyaW5nLCBjb250ZW50OiB3ZWJ2aWV3TWVzc2FnZXMuSUNyZWF0aW9uQ29udGVudCkge1xuXHRcdFx0dGhpcy5vdXRwdXRFbGVtZW50cy5nZXQob3V0cHV0SWQpPy51cGRhdGVDb250ZW50QW5kUmVuZGVyKGNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVPdXRwdXRIZWlnaHQob3V0cHV0SWQ6IHN0cmluZywgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRcdHRoaXMub3V0cHV0RWxlbWVudHMuZ2V0KG91dHB1dElkKT8udXBkYXRlSGVpZ2h0KGhlaWdodCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZVNjcm9sbChyZXF1ZXN0OiB3ZWJ2aWV3TWVzc2FnZXMuSUNvbnRlbnRXaWRnZXRUb3BSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudG9wID0gYCR7cmVxdWVzdC5jZWxsVG9wfXB4YDtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0RWxlbWVudCA9IHRoaXMub3V0cHV0RWxlbWVudHMuZ2V0KHJlcXVlc3Qub3V0cHV0SWQpO1xuXHRcdFx0aWYgKG91dHB1dEVsZW1lbnQpIHtcblx0XHRcdFx0b3V0cHV0RWxlbWVudC51cGRhdGVTY3JvbGwocmVxdWVzdC5vdXRwdXRPZmZzZXQpO1xuXG5cdFx0XHRcdGlmIChyZXF1ZXN0LmZvcmNlRGlzcGxheSAmJiBvdXRwdXRFbGVtZW50Lm91dHB1dE5vZGUpIHtcblx0XHRcdFx0XHQvLyBUT0RPIEByZWJvcm5peCBAbWpidnosIHRoZXJlIGlzIGEgbWlzYWxpZ25tZW50IGhlcmUuXG5cdFx0XHRcdFx0Ly8gV2Ugc2V0IG91dHB1dCB2aXNpYmlsaXR5IG9uIGNlbGwgY29udGFpbmVyLCBvdGhlciB0aGFuIG91dHB1dCBjb250YWluZXIgb3Igb3V0cHV0IG5vZGUgaXRzZWxmLlxuXHRcdFx0XHRcdG91dHB1dEVsZW1lbnQub3V0cHV0Tm9kZS5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVxdWVzdC5mb3JjZURpc3BsYXkpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjbGFzcyBPdXRwdXRDb250YWluZXIge1xuXG5cdFx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdFx0cHJpdmF0ZSBfb3V0cHV0Tm9kZT86IE91dHB1dEVsZW1lbnQ7XG5cblx0XHRnZXQgb3V0cHV0Tm9kZSgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9vdXRwdXROb2RlO1xuXHRcdH1cblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRJZDogc3RyaW5nLFxuXHRcdCkge1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnb3V0cHV0X2NvbnRhaW5lcicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS12c2NvZGUtY29udGV4dCcsIEpTT04uc3RyaW5naWZ5KHsgJ3ByZXZlbnREZWZhdWx0Q29udGV4dE1lbnVJdGVtcyc6IHRydWUgfSkpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdFx0dGhpcy5fb3V0cHV0Tm9kZT8uZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBjbGVhcihyZW5kZXJlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChyZW5kZXJlcklkKSB7XG5cdFx0XHRcdHJlbmRlcmVycy5jbGVhck91dHB1dChyZW5kZXJlcklkLCB0aGlzLm91dHB1dElkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlSGVpZ2h0KGhlaWdodDogbnVtYmVyKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUubWF4SGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVTY3JvbGwob3V0cHV0T2Zmc2V0OiBudW1iZXIpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS50b3AgPSBgJHtvdXRwdXRPZmZzZXR9cHhgO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBjcmVhdGVPdXRwdXRFbGVtZW50KG91dHB1dElkOiBzdHJpbmcsIG91dHB1dE9mZnNldDogbnVtYmVyLCBsZWZ0OiBudW1iZXIsIGNlbGxJZDogc3RyaW5nKTogT3V0cHV0RWxlbWVudCB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUubWF4SGVpZ2h0ID0gJzBweCc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudG9wID0gYCR7b3V0cHV0T2Zmc2V0fXB4YDtcblxuXHRcdFx0dGhpcy5fb3V0cHV0Tm9kZT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fb3V0cHV0Tm9kZSA9IG5ldyBPdXRwdXRFbGVtZW50KG91dHB1dElkLCBsZWZ0LCBjZWxsSWQpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX291dHB1dE5vZGUuZWxlbWVudCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3V0cHV0Tm9kZTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlQ29udGVudEFuZFJlbmRlcihjb250ZW50OiB3ZWJ2aWV3TWVzc2FnZXMuSUNyZWF0aW9uQ29udGVudCkge1xuXHRcdFx0dGhpcy5fb3V0cHV0Tm9kZT8udXBkYXRlQW5kUmVyZW5kZXIoY29udGVudCk7XG5cdFx0fVxuXHR9XG5cblx0dnNjb2RlLnBvc3RNZXNzYWdlKHtcblx0XHRfX3ZzY29kZV9ub3RlYm9va19tZXNzYWdlOiB0cnVlLFxuXHRcdHR5cGU6ICdpbml0aWFsaXplZCdcblx0fSk7XG5cblx0Zm9yIChjb25zdCBwcmVsb2FkIG9mIGN0eC5zdGF0aWNQcmVsb2Fkc0RhdGEpIHtcblx0XHRrZXJuZWxQcmVsb2Fkcy5sb2FkKHByZWxvYWQuZW50cnlwb2ludCk7XG5cdH1cblxuXHRmdW5jdGlvbiBwb3N0Tm90ZWJvb2tNZXNzYWdlPFQgZXh0ZW5kcyB3ZWJ2aWV3TWVzc2FnZXMuRnJvbVdlYnZpZXdNZXNzYWdlPihcblx0XHR0eXBlOiBUWyd0eXBlJ10sXG5cdFx0cHJvcGVydGllczogT21pdDxULCAnX192c2NvZGVfbm90ZWJvb2tfbWVzc2FnZScgfCAndHlwZSc+XG5cdCkge1xuXHRcdHZzY29kZS5wb3N0TWVzc2FnZSh7XG5cdFx0XHRfX3ZzY29kZV9ub3RlYm9va19tZXNzYWdlOiB0cnVlLFxuXHRcdFx0dHlwZSxcblx0XHRcdC4uLnByb3BlcnRpZXNcblx0XHR9KTtcblx0fVxuXG5cdGNsYXNzIE91dHB1dEVsZW1lbnQge1xuXHRcdHB1YmxpYyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0XHRwcml2YXRlIF9jb250ZW50Pzoge1xuXHRcdFx0cmVhZG9ubHkgcHJlZmVycmVkUmVuZGVyZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgcHJlbG9hZEVycm9yczogUmVhZG9ubHlBcnJheTxFcnJvciB8IHVuZGVmaW5lZD47XG5cdFx0fTtcblx0XHRwcml2YXRlIGhhc1Jlc2l6ZU9ic2VydmVyID0gZmFsc2U7XG5cblx0XHRwcml2YXRlIHJlbmRlclRhc2tBYm9ydD86IEFib3J0Q29udHJvbGxlcjtcblx0XHRwcml2YXRlIGlzSW1hZ2VPdXRwdXQgPSBmYWxzZTtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRJZDogc3RyaW5nLFxuXHRcdFx0bGVmdDogbnVtYmVyLFxuXHRcdFx0cHVibGljIHJlYWRvbmx5IGNlbGxJZDogc3RyaW5nXG5cdFx0KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5pZCA9IG91dHB1dElkO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ291dHB1dCcpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS50b3AgPSBgMHB4YDtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5sZWZ0ID0gbGVmdCArICdweCc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucGFkZGluZyA9IGAke2N0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZ31weCAke2N0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZ31weCAke2N0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZ31weCAke2N0eC5zdHlsZS5vdXRwdXROb2RlTGVmdFBhZGRpbmd9YDtcblxuXHRcdFx0dGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklNb3VzZUVudGVyTWVzc2FnZT4oJ21vdXNlZW50ZXInLCB7IGlkOiBvdXRwdXRJZCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklNb3VzZUxlYXZlTWVzc2FnZT4oJ21vdXNlbGVhdmUnLCB7IGlkOiBvdXRwdXRJZCB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBZGQgZHJhZyBoYW5kbGVyXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIWUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgb3V0cHV0RGF0YTogTm90ZWJvb2tDZWxsT3V0cHV0VHJhbnNmZXJEYXRhID0ge1xuXHRcdFx0XHRcdG91dHB1dElkOiB0aGlzLm91dHB1dElkLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGUuZGF0YVRyYW5zZmVyLnNldERhdGEoJ25vdGVib29rLWNlbGwtb3V0cHV0JywgSlNPTi5zdHJpbmdpZnkob3V0cHV0RGF0YSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFkZCBhbHQga2V5IGhhbmRsZXJzXG5cdFx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLmFsdEtleSkge1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5kcmFnZ2FibGUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgKGUpID0+IHtcblx0XHRcdFx0aWYgKCFlLmFsdEtleSkge1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5kcmFnZ2FibGUgPSB0aGlzLmlzSW1hZ2VPdXRwdXQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBIYW5kbGUgd2luZG93IGJsdXIgdG8gcmVzZXQgZHJhZ2dhYmxlIHN0YXRlXG5cdFx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRyYWdnYWJsZSA9IHRoaXMuaXNJbWFnZU91dHB1dDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQ/LmFib3J0KCk7XG5cdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRwdWJsaWMgYXN5bmMgcmVuZGVyKGNvbnRlbnQ6IHdlYnZpZXdNZXNzYWdlcy5JQ3JlYXRpb25Db250ZW50LCBwcmVmZXJyZWRSZW5kZXJlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHByZWxvYWRFcnJvcnM6IFJlYWRvbmx5QXJyYXk8RXJyb3IgfCB1bmRlZmluZWQ+LCBzaWduYWw/OiBBYm9ydFNpZ25hbCkge1xuXHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQ/LmFib3J0KCk7XG5cdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhpcy5fY29udGVudCA9IHsgcHJlZmVycmVkUmVuZGVyZXJJZCwgcHJlbG9hZEVycm9ycyB9O1xuXHRcdFx0aWYgKGNvbnRlbnQudHlwZSA9PT0gMCAvKiBSZW5kZXJPdXRwdXRUeXBlLkh0bWwgKi8pIHtcblx0XHRcdFx0Y29uc3QgdHJ1c3RlZEh0bWwgPSB0dFBvbGljeT8uY3JlYXRlSFRNTChjb250ZW50Lmh0bWxDb250ZW50KSA/PyBjb250ZW50Lmh0bWxDb250ZW50O1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuaW5uZXJIVE1MID0gdHJ1c3RlZEh0bWwgYXMgc3RyaW5nOyAgLy8gQ29kZVFMIFtTTTAzNzEyXSBUaGUgY29udGVudCBjb21lcyBmcm9tIHJlbmRlcmVyIGV4dGVuc2lvbnMsIG5vdCBmcm9tIGRpcmVjdCB1c2VyIGlucHV0LlxuXHRcdFx0fSBlbHNlIGlmIChwcmVsb2FkRXJyb3JzLnNvbWUoZSA9PiBlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9ycyA9IHByZWxvYWRFcnJvcnMuZmlsdGVyKChlKTogZSBpcyBFcnJvciA9PiBlIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdFx0XHRzaG93UmVuZGVyRXJyb3IoYEVycm9yIGxvYWRpbmcgcHJlbG9hZHNgLCB0aGlzLmVsZW1lbnQsIGVycm9ycyk7XG5cdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdGNvbnN0IGltYWdlTWltZVR5cGVzID0gWydpbWFnZS9wbmcnLCAnaW1hZ2UvanBlZycsICdpbWFnZS9zdmcnXTtcblx0XHRcdFx0dGhpcy5pc0ltYWdlT3V0cHV0ID0gaW1hZ2VNaW1lVHlwZXMuaW5jbHVkZXMoY29udGVudC5vdXRwdXQubWltZSk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kcmFnZ2FibGUgPSB0aGlzLmlzSW1hZ2VPdXRwdXQ7XG5cblx0XHRcdFx0Y29uc3QgaXRlbSA9IGNyZWF0ZU91dHB1dEl0ZW0odGhpcy5vdXRwdXRJZCwgY29udGVudC5vdXRwdXQubWltZSwgY29udGVudC5tZXRhZGF0YSwgY29udGVudC5vdXRwdXQudmFsdWVCeXRlcywgY29udGVudC5hbGxPdXRwdXRzLCBjb250ZW50Lm91dHB1dC5hcHBlbmRlZCk7XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQgPSBjb250cm9sbGVyO1xuXG5cdFx0XHRcdC8vIEFib3J0IHJlbmRlcmluZyBpZiBjYWxsZXIgYWJvcnRzXG5cdFx0XHRcdHNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCAoKSA9PiBjb250cm9sbGVyLmFib3J0KCkpO1xuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgcmVuZGVyZXJzLnJlbmRlcihpdGVtLCBwcmVmZXJyZWRSZW5kZXJlcklkLCB0aGlzLmVsZW1lbnQsIGNvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAodGhpcy5yZW5kZXJUYXNrQWJvcnQgPT09IGNvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuaGFzUmVzaXplT2JzZXJ2ZXIpIHtcblx0XHRcdFx0dGhpcy5oYXNSZXNpemVPYnNlcnZlciA9IHRydWU7XG5cdFx0XHRcdHJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5lbGVtZW50LCB0aGlzLm91dHB1dElkLCB0cnVlLCB0aGlzLmNlbGxJZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9mZnNldEhlaWdodCA9IHRoaXMuZWxlbWVudC5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRjb25zdCBjcHMgPSBkb2N1bWVudC5kZWZhdWx0VmlldyEuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgdmVydGljYWxQYWRkaW5nID0gcGFyc2VGbG9hdChjcHMucGFkZGluZ1RvcCkgKyBwYXJzZUZsb2F0KGNwcy5wYWRkaW5nQm90dG9tKTtcblx0XHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSBvZmZzZXRIZWlnaHQgLSB2ZXJ0aWNhbFBhZGRpbmc7XG5cdFx0XHRpZiAoZWxlbWVudEhhc0NvbnRlbnQoY29udGVudEhlaWdodCkgJiYgY3BzLnBhZGRpbmcgPT09ICcwcHgnKSB7XG5cdFx0XHRcdC8vIHdlIHNldCBwYWRkaW5nIHRvIHplcm8gaWYgdGhlIG91dHB1dCBoYXMgbm8gY29udGVudCAodGhlbiB3ZSBjYW4gaGF2ZSBhIHplcm8taGVpZ2h0IG91dHB1dCBET00gbm9kZSlcblx0XHRcdFx0Ly8gdGh1cyB3ZSBuZWVkIHRvIGVuc3VyZSB0aGUgcGFkZGluZyBpcyBhY2NvdW50ZWQgd2hlbiB1cGRhdGluZyB0aGUgaW5pdCBoZWlnaHQgb2YgdGhlIG91dHB1dFxuXHRcdFx0XHRkaW1lbnNpb25VcGRhdGVyLnVwZGF0ZUhlaWdodCh0aGlzLm91dHB1dElkLCBvZmZzZXRIZWlnaHQgKyBjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmcgKiAyLCB7XG5cdFx0XHRcdFx0aXNPdXRwdXQ6IHRydWUsXG5cdFx0XHRcdFx0aW5pdDogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucGFkZGluZyA9IGAke2N0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZ31weCAke2N0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZ31weCAke2N0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZ31weCAke2N0eC5zdHlsZS5vdXRwdXROb2RlTGVmdFBhZGRpbmd9YDtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudEhhc0NvbnRlbnQoY29udGVudEhlaWdodCkpIHtcblx0XHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVIZWlnaHQodGhpcy5vdXRwdXRJZCwgdGhpcy5lbGVtZW50Lm9mZnNldEhlaWdodCwge1xuXHRcdFx0XHRcdGlzT3V0cHV0OiB0cnVlLFxuXHRcdFx0XHRcdGluaXQ6IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wYWRkaW5nID0gYDAgJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggMCAke2N0eC5zdHlsZS5vdXRwdXROb2RlTGVmdFBhZGRpbmd9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHdlIGhhdmUgYSB6ZXJvLWhlaWdodCBvdXRwdXQgRE9NIG5vZGVcblx0XHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVIZWlnaHQodGhpcy5vdXRwdXRJZCwgMCwge1xuXHRcdFx0XHRcdGlzT3V0cHV0OiB0cnVlLFxuXHRcdFx0XHRcdGluaXQ6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByb290ID0gdGhpcy5lbGVtZW50LnNoYWRvd1Jvb3QgPz8gdGhpcy5lbGVtZW50O1xuXHRcdFx0Y29uc3QgY29kZUJsb2NrczogQXJyYXk8eyB2YWx1ZTogc3RyaW5nOyBsYW5nOiBzdHJpbmc7IGlkOiBzdHJpbmcgfT4gPSBNYXJrZG93bkNvZGVCbG9jay5yZXF1ZXN0SGlnaGxpZ2h0Q29kZUJsb2NrKHJvb3QpO1xuXG5cdFx0XHRpZiAoY29kZUJsb2Nrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklSZW5kZXJlZENlbGxPdXRwdXRNZXNzYWdlPigncmVuZGVyZWRDZWxsT3V0cHV0Jywge1xuXHRcdFx0XHRcdGNvZGVCbG9ja3Ncblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZUFuZFJlcmVuZGVyKGNvbnRlbnQ6IHdlYnZpZXdNZXNzYWdlcy5JQ3JlYXRpb25Db250ZW50KSB7XG5cdFx0XHRpZiAodGhpcy5fY29udGVudCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlcihjb250ZW50LCB0aGlzLl9jb250ZW50LnByZWZlcnJlZFJlbmRlcmVySWQsIHRoaXMuX2NvbnRlbnQucHJlbG9hZEVycm9ycyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgbWFya3VwQ2VsbERyYWdNYW5hZ2VyID0gbmV3IGNsYXNzIE1hcmt1cENlbGxEcmFnTWFuYWdlciB7XG5cblx0XHRwcml2YXRlIGN1cnJlbnREcmFnOiB7IGNlbGxJZDogc3RyaW5nOyBjbGllbnRZOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIFRyYW5zcGFyZW50IG92ZXJsYXkgdGhhdCBwcmV2ZW50cyBlbGVtZW50cyBmcm9tIGluc2lkZSB0aGUgd2VidmlldyBmcm9tIGVhdGluZ1xuXHRcdC8vIGRyYWcgZXZlbnRzLlxuXHRcdHByaXZhdGUgZHJhZ092ZXJsYXk/OiBIVE1MRWxlbWVudDtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0d2luZG93LmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgZSA9PiB7XG5cdFx0XHRcdC8vIEFsbG93IGRyb3BwaW5nIGRyYWdnZWQgbWFya3VwIGNlbGxzXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR3aW5kb3cuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJvcCcsIGUgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0Y29uc3QgZHJhZyA9IHRoaXMuY3VycmVudERyYWc7XG5cdFx0XHRcdGlmICghZHJhZykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuY3VycmVudERyYWcgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklDZWxsRHJvcE1lc3NhZ2U+KCdjZWxsLWRyb3AnLCB7XG5cdFx0XHRcdFx0Y2VsbElkOiBkcmFnLmNlbGxJZCxcblx0XHRcdFx0XHRjdHJsS2V5OiBlLmN0cmxLZXksXG5cdFx0XHRcdFx0YWx0S2V5OiBlLmFsdEtleSxcblx0XHRcdFx0XHRkcmFnT2Zmc2V0WTogZS5jbGllbnRZLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHN0YXJ0RHJhZyhlOiBEcmFnRXZlbnQsIGNlbGxJZDogc3RyaW5nKSB7XG5cdFx0XHRpZiAoIWUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjdXJyZW50T3B0aW9ucy5kcmFnQW5kRHJvcEVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnID0geyBjZWxsSWQsIGNsaWVudFk6IGUuY2xpZW50WSB9O1xuXG5cdFx0XHRjb25zdCBvdmVybGF5WkluZGV4ID0gOTk5OTtcblx0XHRcdGlmICghdGhpcy5kcmFnT3ZlcmxheSkge1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdHRoaXMuZHJhZ092ZXJsYXkuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5LnN0eWxlLnRvcCA9ICcwJztcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheS5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5LnN0eWxlLnpJbmRleCA9IGAke292ZXJsYXlaSW5kZXh9YDtcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheS5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheS5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0XHRcdHRoaXMuZHJhZ092ZXJsYXkuc3R5bGUuYmFja2dyb3VuZCA9ICd0cmFuc3BhcmVudCc7XG5cdFx0XHRcdHdpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuZHJhZ092ZXJsYXkpO1xuXHRcdFx0fVxuXHRcdFx0KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5zdHlsZS56SW5kZXggPSBgJHtvdmVybGF5WkluZGV4ICsgMX1gO1xuXHRcdFx0KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuXG5cdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JQ2VsbERyYWdTdGFydE1lc3NhZ2U+KCdjZWxsLWRyYWctc3RhcnQnLCB7XG5cdFx0XHRcdGNlbGxJZDogY2VsbElkLFxuXHRcdFx0XHRkcmFnT2Zmc2V0WTogZS5jbGllbnRZLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIENvbnRpbnVvdXNseSBzZW5kIHVwZGF0ZXMgd2hpbGUgZHJhZ2dpbmcgaW5zdGVhZCBvZiByZWx5aW5nIG9uIGB1cGRhdGVEcmFnYC5cblx0XHRcdC8vIFRoaXMgbGV0cyB1cyBzY3JvbGwgdGhlIGxpc3QgYmFzZWQgb24gZHJhZyBwb3NpdGlvbi5cblx0XHRcdGNvbnN0IHRyeVNlbmREcmFnVXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50RHJhZz8uY2VsbElkICE9PSBjZWxsSWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JQ2VsbERyYWdNZXNzYWdlPignY2VsbC1kcmFnJywge1xuXHRcdFx0XHRcdGNlbGxJZDogY2VsbElkLFxuXHRcdFx0XHRcdGRyYWdPZmZzZXRZOiB0aGlzLmN1cnJlbnREcmFnLmNsaWVudFksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRyeVNlbmREcmFnVXBkYXRlKTtcblx0XHRcdH07XG5cdFx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRyeVNlbmREcmFnVXBkYXRlKTtcblx0XHR9XG5cblx0XHR1cGRhdGVEcmFnKGU6IERyYWdFdmVudCwgY2VsbElkOiBzdHJpbmcpIHtcblx0XHRcdGlmIChjZWxsSWQgIT09IHRoaXMuY3VycmVudERyYWc/LmNlbGxJZCkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnREcmFnID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50RHJhZyA9IHsgY2VsbElkLCBjbGllbnRZOiBlLmNsaWVudFkgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbmREcmFnKGU6IERyYWdFdmVudCwgY2VsbElkOiBzdHJpbmcpIHtcblx0XHRcdHRoaXMuY3VycmVudERyYWcgPSB1bmRlZmluZWQ7XG5cdFx0XHQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJyk7XG5cdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JQ2VsbERyYWdFbmRNZXNzYWdlPignY2VsbC1kcmFnLWVuZCcsIHtcblx0XHRcdFx0Y2VsbElkOiBjZWxsSWRcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy5kcmFnT3ZlcmxheSkge1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLnN0eWxlLnpJbmRleCA9ICcnO1xuXHRcdH1cblx0fSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJlbG9hZHNTY3JpcHRTdHIoc3R5bGVWYWx1ZXM6IFByZWxvYWRTdHlsZXMsIG9wdGlvbnM6IFByZWxvYWRPcHRpb25zLCByZW5kZXJPcHRpb25zOiBSZW5kZXJPcHRpb25zLCByZW5kZXJlcnM6IHJlYWRvbmx5IHdlYnZpZXdNZXNzYWdlcy5SZW5kZXJlck1ldGFkYXRhW10sIHByZWxvYWRzOiByZWFkb25seSB3ZWJ2aWV3TWVzc2FnZXMuU3RhdGljUHJlbG9hZE1ldGFkYXRhW10sIGlzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbiwgbm9uY2U6IHN0cmluZykge1xuXHRjb25zdCBjdHg6IFByZWxvYWRDb250ZXh0ID0ge1xuXHRcdHN0eWxlOiBzdHlsZVZhbHVlcyxcblx0XHRvcHRpb25zLFxuXHRcdHJlbmRlck9wdGlvbnMsXG5cdFx0cmVuZGVyZXJEYXRhOiByZW5kZXJlcnMsXG5cdFx0c3RhdGljUHJlbG9hZHNEYXRhOiBwcmVsb2Fkcyxcblx0XHRpc1dvcmtzcGFjZVRydXN0ZWQsXG5cdFx0bm9uY2UsXG5cdH07XG5cdC8vIFRTIHdpbGwgdHJ5IGNvbXBpbGluZyBgaW1wb3J0KClgIGluIHdlYnZpZXdQcmVsb2Fkcywgc28gdXNlIGEgaGVscGVyIGZ1bmN0aW9uIGluc3RlYWRcblx0Ly8gb2YgdXNpbmcgYGltcG9ydCguLi4pYCBkaXJlY3RseVxuXHRyZXR1cm4gYFxuXHRcdGNvbnN0IF9faW1wb3J0ID0gKHgpID0+IGltcG9ydCh4KTtcblx0XHQoJHt3ZWJ2aWV3UHJlbG9hZHN9KShcblx0XHRcdEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KFwiJHtlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoY3R4KSl9XCIpKVxuXHRcdClcXG4vLyMgc291cmNlVVJMPW5vdGVib29rV2Vidmlld1ByZWxvYWRzLmpzXFxuYDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQTJGQSxlQUFlLGdCQUFnQixLQUFxQjtB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QUFjO0FBQUEsTUFDcEIsT0FBTztBQUNOLGFBQUssY0FBYyxFQUFFLFFBQVEsU0FBUyxFQUFFLFFBQVE7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFBQSxJQUVBLFFBQVEsR0FBYyxRQUFnQjtBQUNyQyxXQUFLLGNBQWM7QUFDbkIsTUFBQyxFQUFFLE9BQXVCLFVBQVUsT0FBTyxVQUFVO0FBQ3JELDBCQUF5RCxpQkFBaUI7QUFBQSxRQUN6RTtBQUFBLE1BQ0QsQ0FBQztBQUVELFVBQUksS0FBSyxhQUFhO0FBQ3JCLGFBQUssWUFBWSxPQUFPO0FBQ3hCLGFBQUssY0FBYztBQUFBLE1BQ3BCO0FBRUEsTUFBQyxFQUFFLE9BQXVCLE1BQU0sU0FBUztBQUFBLElBQzFDO0FBQUEsRUFDRCxFQUFFO0FBQ0g7QUFFTyxTQUFTLGtCQUFrQixhQUE0QixTQUF5QixlQUE4QixXQUF3RCxVQUE0RCxvQkFBNkIsT0FBZTtBQUNwUixRQUFNLE1BQXNCO0FBQUEsSUFDM0IsT0FBTztBQUFBLElBQ1A7QUFBQSxJQUNBO0FBQUEsSUFDQSxjQUFjO0FBQUEsSUFDZCxvQkFBb0I7QUFBQSxJQUNwQjtBQUFBLElBQ0E7QUFBQSxFQUNEO0FBR0EsU0FBTztBQUFBO0FBQUEsS0FFSCxlQUFlO0FBQUEsb0NBQ2dCLG1CQUFtQixLQUFLLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQTtBQUFBO0FBQUE7QUFFM0U7IiwKICAibmFtZXMiOiBbInJhbmdlIiwgIm5vZGVzIiwgInRhZ05hbWUiLCAiYXR0cmlidXRlcyIsICJpZCIsICJtaW1lIiwgIm1ldGFkYXRhIiwgInZhbHVlQnl0ZXMiLCAiYXBwZW5kZWQiLCAiaXRlbSIsICJmaW5kIiwgImVycm9yTWVzc2FnZSIsICJyZW5kZXJlciIsICJyZW5kZXJlcnMiXQp9Cg==
