var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { getWindow } from "../../../../../../base/browser/dom.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { DeferredPromise, runWhenGlobalIdle } from "../../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { getExtensionForMimeType, isTextStreamMime } from "../../../../../../base/common/mime.js";
import { FileAccess, Schemas, matchesScheme, matchesSomeScheme } from "../../../../../../base/common/network.js";
import { equals } from "../../../../../../base/common/objects.js";
import * as osPath from "../../../../../../base/common/path.js";
import { isMacintosh, isWeb } from "../../../../../../base/common/platform.js";
import { dirname, extname, isEqual, joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import * as UUID from "../../../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../../../editor/common/languages/supports/tokenization.js";
import { tokenizeToString } from "../../../../../../editor/common/languages/textToHtmlTokenizer.js";
import * as nls from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { EditorOpenSource } from "../../../../../../platform/editor/common/editor.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { extractSelection, IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { editorFindMatch, editorFindMatchHighlight } from "../../../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { CellEditState, RenderOutputType } from "../../notebookBrowser.js";
import { NOTEBOOK_WEBVIEW_BOUNDARY } from "../notebookCellList.js";
import { preloadsScriptStr } from "./webviewPreloads.js";
import { transformWebviewThemeVars } from "./webviewThemeMapping.js";
import { MarkupCellViewModel } from "../../viewModel/markupCellViewModel.js";
import { CellUri, RendererMessagingSpec } from "../../../common/notebookCommon.js";
import { INotebookLoggingService } from "../../../common/notebookLoggingService.js";
import { INotebookService } from "../../../common/notebookService.js";
import { IWebviewService, WebviewContentPurpose, WebviewOriginStore } from "../../../../webview/browser/webview.js";
import { WebviewWindowDragMonitor } from "../../../../webview/browser/webviewWindowDragMonitor.js";
import { asWebviewUri, webviewGenericCspSource } from "../../../../webview/common/webview.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { getOutputText, getOutputStreamText, TEXT_BASED_MIMETYPES } from "../../viewModel/cellOutputTextHelper.js";
const LINE_COLUMN_REGEX = /:([\d]+)(?::([\d]+))?$/;
const LineQueryRegex = /line=(\d+)$/;
const FRAGMENT_REGEX = /^(.*)#([^#]*)$/;
let BackLayerWebView = class extends Themable {
  constructor(notebookEditor, id, notebookViewType, documentUri, options, rendererMessaging, webviewService, openerService, notebookService, contextService, environmentService, fileDialogService, fileService, contextMenuService, contextKeyService, workspaceTrustManagementService, configurationService, languageService, workspaceContextService, editorGroupService, editorService, storageService, pathService, notebookLogService, themeService, telemetryService) {
    super(themeService);
    this.notebookEditor = notebookEditor;
    this.id = id;
    this.notebookViewType = notebookViewType;
    this.documentUri = documentUri;
    this.options = options;
    this.rendererMessaging = rendererMessaging;
    this.webviewService = webviewService;
    this.openerService = openerService;
    this.notebookService = notebookService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.configurationService = configurationService;
    this.languageService = languageService;
    this.workspaceContextService = workspaceContextService;
    this.editorGroupService = editorGroupService;
    this.editorService = editorService;
    this.storageService = storageService;
    this.pathService = pathService;
    this.notebookLogService = notebookLogService;
    this.telemetryService = telemetryService;
    this.webview = void 0;
    this.insetMapping = /* @__PURE__ */ new Map();
    this.pendingWebviewIdleCreationRequest = /* @__PURE__ */ new Map();
    this.pendingWebviewIdleInsetMapping = /* @__PURE__ */ new Map();
    this.reversedPendingWebviewIdleInsetMapping = /* @__PURE__ */ new Map();
    this.markupPreviewMapping = /* @__PURE__ */ new Map();
    this.hiddenInsetMapping = /* @__PURE__ */ new Set();
    this.reversedInsetMapping = /* @__PURE__ */ new Map();
    this.localResourceRootsCache = void 0;
    this._onMessage = this._register(new Emitter());
    this._preloadsCache = /* @__PURE__ */ new Set();
    this.onMessage = this._onMessage.event;
    this._disposed = false;
    this.firstInit = true;
    this.nonce = UUID.generateUuid();
    this._logRendererDebugMessage("Creating backlayer webview for notebook");
    this.element = document.createElement("div");
    this.element.style.height = "1400px";
    this.element.style.position = "absolute";
    if (rendererMessaging) {
      this._register(rendererMessaging);
      rendererMessaging.receiveMessageHandler = (rendererId, message) => {
        if (!this.webview || this._disposed) {
          return Promise.resolve(false);
        }
        this._sendMessageToWebview({
          __vscode_notebook_message: true,
          type: "customRendererMessage",
          rendererId,
          message
        });
        return Promise.resolve(true);
      };
    }
    this._register(workspaceTrustManagementService.onDidChangeTrust((e) => {
      const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), void 0);
      const htmlContent = this.generateContent(baseUrl.toString());
      this.webview?.setHtml(htmlContent);
    }));
    this._register(TokenizationRegistry.onDidChange(() => {
      this._sendMessageToWebview({
        type: "tokenizedStylesChanged",
        css: getTokenizationCss()
      });
    }));
  }
  static getOriginStore(storageService) {
    this._originStore ??= new WebviewOriginStore("notebook.backlayerWebview.origins", storageService);
    return this._originStore;
  }
  updateOptions(options) {
    this.options = options;
    this._updateStyles();
    this._updateOptions();
  }
  _logRendererDebugMessage(msg) {
    this.notebookLogService.debug("BacklayerWebview", `${this.documentUri} (${this.id}) - ${msg}`);
  }
  _updateStyles() {
    this._sendMessageToWebview({
      type: "notebookStyles",
      styles: this._generateStyles()
    });
  }
  _updateOptions() {
    this._sendMessageToWebview({
      type: "notebookOptions",
      options: {
        dragAndDropEnabled: this.options.dragAndDropEnabled
      },
      renderOptions: {
        lineLimit: this.options.outputLineLimit,
        outputScrolling: this.options.outputScrolling,
        outputWordWrap: this.options.outputWordWrap,
        linkifyFilePaths: this.options.outputLinkifyFilePaths,
        minimalError: this.options.minimalError
      }
    });
  }
  _generateStyles() {
    return {
      "notebook-output-left-margin": `${this.options.leftMargin + this.options.runGutter}px`,
      "notebook-output-width": `calc(100% - ${this.options.leftMargin + this.options.rightMargin + this.options.runGutter}px)`,
      "notebook-output-node-padding": `${this.options.outputNodePadding}px`,
      "notebook-run-gutter": `${this.options.runGutter}px`,
      "notebook-preview-node-padding": `${this.options.previewNodePadding}px`,
      "notebook-markdown-left-margin": `${this.options.markdownLeftMargin}px`,
      "notebook-output-node-left-padding": `${this.options.outputNodeLeftPadding}px`,
      "notebook-markdown-min-height": `${this.options.previewNodePadding * 2}px`,
      "notebook-markup-font-size": typeof this.options.markupFontSize === "number" && this.options.markupFontSize > 0 ? `${this.options.markupFontSize}px` : `calc(${this.options.fontSize}px * 1.2)`,
      "notebook-markdown-line-height": typeof this.options.markdownLineHeight === "number" && this.options.markdownLineHeight > 0 ? `${this.options.markdownLineHeight}px` : `normal`,
      "notebook-cell-output-font-size": `${this.options.outputFontSize || this.options.fontSize}px`,
      "notebook-cell-output-line-height": `${this.options.outputLineHeight}px`,
      "notebook-cell-output-max-height": `${this.options.outputLineHeight * this.options.outputLineLimit + 2}px`,
      "notebook-cell-output-font-family": this.options.outputFontFamily || this.options.fontFamily,
      "notebook-cell-markup-empty-content": nls.localize("notebook.emptyMarkdownPlaceholder", "Empty markdown cell, double-click or press enter to edit."),
      "notebook-cell-renderer-not-found-error": nls.localize({
        key: "notebook.error.rendererNotFound",
        comment: ["$0 is a placeholder for the mime type"]
      }, "No renderer found for '$0'"),
      "notebook-cell-renderer-fallbacks-exhausted": nls.localize({
        key: "notebook.error.rendererFallbacksExhausted",
        comment: ["$0 is a placeholder for the mime type"]
      }, "Could not render content for '$0'"),
      "notebook-markup-font-family": this.options.markupFontFamily
    };
  }
  generateContent(baseUrl) {
    const renderersData = this.getRendererData();
    const preloadsData = this.getStaticPreloadsData();
    const renderOptions = {
      lineLimit: this.options.outputLineLimit,
      outputScrolling: this.options.outputScrolling,
      outputWordWrap: this.options.outputWordWrap,
      linkifyFilePaths: this.options.outputLinkifyFilePaths,
      minimalError: this.options.minimalError
    };
    const preloadScript = preloadsScriptStr(
      {
        ...this.options,
        tokenizationCss: getTokenizationCss()
      },
      { dragAndDropEnabled: this.options.dragAndDropEnabled },
      renderOptions,
      renderersData,
      preloadsData,
      this.workspaceTrustManagementService.isWorkspaceTrusted(),
      this.nonce
    );
    const enableCsp = this.configurationService.getValue("notebook.experimental.enableCsp");
    const currentHighlight = this.getColor(editorFindMatch);
    const findMatchHighlight = this.getColor(editorFindMatchHighlight);
    return (
      /* html */
      `
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<base href="${baseUrl}/" />
				${enableCsp ? `<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					script-src ${webviewGenericCspSource} 'unsafe-inline' 'unsafe-eval';
					style-src ${webviewGenericCspSource} 'unsafe-inline';
					img-src ${webviewGenericCspSource} https: http: data:;
					font-src ${webviewGenericCspSource} https:;
					connect-src https:;
					child-src https: data:;
				">` : ""}
				<style nonce="${this.nonce}">
					::highlight(find-highlight) {
						background-color: var(--vscode-editor-findMatchBackground, ${findMatchHighlight});
					}

					::highlight(current-find-highlight) {
						background-color: var(--vscode-editor-findMatchHighlightBackground, ${currentHighlight});
					}

					#container .cell_container {
						width: 100%;
					}

					#container .output_container {
						width: 100%;
					}

					#container .cell_container.nb-insertHighlight div.output_container div.output {
						background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
					}

					#container > div > div > div.output {
						font-size: var(--notebook-cell-output-font-size);
						width: var(--notebook-output-width);
						margin-left: var(--notebook-output-left-margin);
						background-color: var(--theme-notebook-output-background);
						padding-top: var(--notebook-output-node-padding);
						padding-right: var(--notebook-output-node-padding);
						padding-bottom: var(--notebook-output-node-padding);
						padding-left: var(--notebook-output-node-left-padding);
						box-sizing: border-box;
						border-top: none;
					}

					/* markdown */
					#container div.preview {
						width: 100%;
						padding-right: var(--notebook-preview-node-padding);
						padding-left: var(--notebook-markdown-left-margin);
						padding-top: var(--notebook-preview-node-padding);
						padding-bottom: var(--notebook-preview-node-padding);

						box-sizing: border-box;
						white-space: nowrap;
						overflow: hidden;
						white-space: initial;

						font-size: var(--notebook-markup-font-size);
						line-height: var(--notebook-markdown-line-height);
						color: var(--theme-ui-foreground);
						font-family: var(--notebook-markup-font-family);
					}

					#container div.preview.draggable {
						user-select: none;
						-webkit-user-select: none;
						-ms-user-select: none;
						cursor: grab;
					}

					#container div.preview.selected {
						background: var(--theme-notebook-cell-selected-background);
					}

					#container div.preview.dragging {
						background-color: var(--theme-background);
						opacity: 0.5 !important;
					}

					.monaco-workbench.vs-dark .notebookOverlay .cell.markdown .latex img,
					.monaco-workbench.vs-dark .notebookOverlay .cell.markdown .latex-block img {
						filter: brightness(0) invert(1)
					}

					#container .markup > div.nb-symbolHighlight {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .markup > div.nb-insertHighlight {
						background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
					}

					#container .nb-symbolHighlight .output_container .output {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .markup > div.nb-multiCellHighlight {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .nb-multiCellHighlight .output_container .output {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .nb-chatGenerationHighlight .output_container .output {
						background-color: var(--vscode-notebook-selectedCellBackground);
					}

					#container > div.nb-cellDeleted .output_container {
						background-color: var(--theme-notebook-diff-removed-background);
					}

					#container > div.nb-cellAdded .output_container {
						background-color: var(--theme-notebook-diff-inserted-background);
					}

					#container > div > div:not(.preview) > div {
						overflow-x: auto;
					}

					#container .no-renderer-error {
						color: var(--vscode-editorError-foreground);
					}

					body {
						padding: 0px;
						height: 100%;
						width: 100%;
					}

					table, thead, tr, th, td, tbody {
						border: none;
						border-color: transparent;
						border-spacing: 0;
						border-collapse: collapse;
					}

					table, th, tr {
						vertical-align: middle;
						text-align: right;
					}

					thead {
						font-weight: bold;
						background-color: rgba(130, 130, 130, 0.16);
					}

					th, td {
						padding: 4px 8px;
					}

					tr:nth-child(even) {
						background-color: rgba(130, 130, 130, 0.08);
					}

					tbody th {
						font-weight: normal;
					}

					.find-match {
						background-color: var(--vscode-editor-findMatchHighlightBackground);
					}

					.current-find-match {
						background-color: var(--vscode-editor-findMatchBackground);
					}

					#_defaultColorPalatte {
						color: var(--vscode-editor-findMatchHighlightBackground);
						background-color: var(--vscode-editor-findMatchBackground);
					}
				</style>
			</head>
			<body style="overflow: hidden;">
				<div id='findStart' tabIndex=-1></div>
				<div id='container' class="widgetarea" style="position: absolute;width:100%;top: 0px"></div>
				<div id="_defaultColorPalatte"></div>
				<script type="module">${preloadScript}<\/script>
			</body>
		</html>`
    );
  }
  getRendererData() {
    return this.notebookService.getRenderers().map((renderer) => {
      const entrypoint = {
        extends: renderer.entrypoint.extends,
        path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString()
      };
      return {
        id: renderer.id,
        entrypoint,
        mimeTypes: renderer.mimeTypes,
        messaging: renderer.messaging !== RendererMessagingSpec.Never && !!this.rendererMessaging,
        isBuiltin: renderer.isBuiltin
      };
    });
  }
  getStaticPreloadsData() {
    return Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), (preload) => {
      return { entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation).toString().toString() };
    });
  }
  asWebviewUri(uri, fromExtension) {
    return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : void 0);
  }
  postKernelMessage(message) {
    this._sendMessageToWebview({
      __vscode_notebook_message: true,
      type: "customKernelMessage",
      message
    });
  }
  resolveOutputId(id) {
    const output = this.reversedInsetMapping.get(id);
    if (!output) {
      return;
    }
    const cellInfo = this.insetMapping.get(output).cellInfo;
    return { cellInfo, output };
  }
  isResolved() {
    return !!this.webview;
  }
  createWebview(targetWindow) {
    const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), void 0);
    const htmlContent = this.generateContent(baseUrl.toString());
    return this._initialize(htmlContent, targetWindow);
  }
  getNotebookBaseUri() {
    if (this.documentUri.scheme === Schemas.untitled) {
      const folder = this.workspaceContextService.getWorkspaceFolder(this.documentUri);
      if (folder) {
        return folder.uri;
      }
      const folders = this.workspaceContextService.getWorkspace().folders;
      if (folders.length) {
        return folders[0].uri;
      }
    }
    return dirname(this.documentUri);
  }
  getBuiltinLocalResourceRoots() {
    if (!this.documentUri.path.toLowerCase().endsWith(".ipynb")) {
      return [];
    }
    if (isWeb) {
      return [];
    }
    return [
      dirname(FileAccess.asFileUri("vs/nls.js"))
    ];
  }
  _initialize(content, targetWindow) {
    if (!getWindow(this.element).document.body.contains(this.element)) {
      throw new Error("Element is already detached from the DOM tree");
    }
    this.webview = this._createInset(this.webviewService, content);
    this.webview.mountTo(this.element, targetWindow);
    this._register(this.webview);
    this._register(new WebviewWindowDragMonitor(targetWindow, () => this.webview));
    const initializePromise = new DeferredPromise();
    this._register(this.webview.onFatalError((e) => {
      initializePromise.error(new Error(`Could not initialize webview: ${e.message}}`));
    }));
    this._register(this.webview.onMessage(async (message) => {
      const data = message.message;
      if (this._disposed) {
        return;
      }
      if (!data.__vscode_notebook_message) {
        return;
      }
      switch (data.type) {
        case "initialized": {
          initializePromise.complete();
          this.initializeWebViewState();
          break;
        }
        case "initializedMarkup": {
          if (this.initializeMarkupPromise?.requestId === data.requestId) {
            this.initializeMarkupPromise?.p.complete();
            this.initializeMarkupPromise = void 0;
          }
          break;
        }
        case "dimension": {
          for (const update of data.updates) {
            const height = update.height;
            if (update.isOutput) {
              const resolvedResult = this.resolveOutputId(update.id);
              if (resolvedResult) {
                const { cellInfo, output } = resolvedResult;
                this.notebookEditor.updateOutputHeight(cellInfo, output, height, !!update.init, "webview#dimension");
                this.notebookEditor.scheduleOutputHeightAck(cellInfo, update.id, height);
              } else if (update.init) {
                const outputRequest = this.reversedPendingWebviewIdleInsetMapping.get(update.id);
                if (outputRequest) {
                  const inset = this.pendingWebviewIdleInsetMapping.get(outputRequest);
                  this.pendingWebviewIdleCreationRequest.delete(outputRequest);
                  this.pendingWebviewIdleCreationRequest.delete(outputRequest);
                  const cellInfo = inset.cellInfo;
                  this.reversedInsetMapping.set(update.id, outputRequest);
                  this.insetMapping.set(outputRequest, inset);
                  this.notebookEditor.updateOutputHeight(cellInfo, outputRequest, height, !!update.init, "webview#dimension");
                  this.notebookEditor.scheduleOutputHeightAck(cellInfo, update.id, height);
                }
                this.reversedPendingWebviewIdleInsetMapping.delete(update.id);
              }
              {
                if (!update.init) {
                  continue;
                }
                const output = this.reversedInsetMapping.get(update.id);
                if (!output) {
                  continue;
                }
                const inset = this.insetMapping.get(output);
                inset.initialized = true;
              }
            } else {
              this.notebookEditor.updateMarkupCellHeight(update.id, height, !!update.init);
            }
          }
          break;
        }
        case "mouseenter": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsHovered = true;
            }
          }
          break;
        }
        case "mouseleave": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsHovered = false;
            }
          }
          break;
        }
        case "outputFocus": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsFocused = true;
              this.notebookEditor.focusNotebookCell(latestCell, "output", { outputId: resolvedResult.output.model.outputId, skipReveal: true, outputWebviewFocused: true });
            }
          }
          break;
        }
        case "outputBlur": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsFocused = false;
              latestCell.inputInOutputIsFocused = false;
            }
          }
          break;
        }
        case "scroll-ack": {
          break;
        }
        case "scroll-to-reveal": {
          this.notebookEditor.setScrollTop(data.scrollTop - NOTEBOOK_WEBVIEW_BOUNDARY);
          break;
        }
        case "did-scroll-wheel": {
          this.notebookEditor.triggerScroll({
            ...data.payload,
            preventDefault: () => {
            },
            stopPropagation: () => {
            }
          });
          break;
        }
        case "focus-editor": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell) {
            if (data.focusNext) {
              this.notebookEditor.focusNextNotebookCell(cell, "editor");
            } else {
              await this.notebookEditor.focusNotebookCell(cell, "editor");
            }
          }
          break;
        }
        case "clicked-data-url": {
          this._onDidClickDataLink(data);
          break;
        }
        case "clicked-link": {
          if (matchesScheme(data.href, Schemas.command)) {
            const uri = URI.parse(data.href);
            if (uri.path === "workbench.action.openLargeOutput") {
              const outputId = uri.query;
              const group = this.editorGroupService.activeGroup;
              if (group) {
                if (group.activeEditor) {
                  group.pinEditor(group.activeEditor);
                }
              }
              this.openerService.open(CellUri.generateCellOutputUriWithId(this.documentUri, outputId));
              return;
            }
            if (uri.path === "cellOutput.enableScrolling") {
              const outputId = uri.query;
              const cell = this.reversedInsetMapping.get(outputId);
              if (cell) {
                this.telemetryService.publicLog2("workbenchActionExecuted", { id: "notebook.cell.toggleOutputScrolling", from: "inlineLink" });
                cell.cellViewModel.outputsViewModels.forEach((vm) => {
                  if (vm.model.metadata) {
                    vm.model.metadata["scrollable"] = true;
                    vm.resetRenderer();
                  }
                });
              }
              return;
            }
            this.openerService.open(data.href, {
              fromUserGesture: true,
              fromWorkspace: true,
              allowCommands: [
                "github-issues.authNow",
                "workbench.extensions.search",
                "workbench.action.openSettings",
                "_notebook.selectKernel",
                // TODO@rebornix explore open output channel with name command
                "jupyter.viewOutput",
                "jupyter.createPythonEnvAndSelectController"
              ]
            });
            return;
          }
          if (matchesSomeScheme(data.href, Schemas.http, Schemas.https, Schemas.mailto)) {
            this.openerService.open(data.href, { fromUserGesture: true, fromWorkspace: true });
          } else if (matchesScheme(data.href, Schemas.vscodeNotebookCell)) {
            const uri = URI.parse(data.href);
            await this._handleNotebookCellResource(uri);
          } else if (!/^[\w\-]+:/.test(data.href)) {
            await this._handleResourceOpening(tryDecodeURIComponent(data.href));
          } else {
            if (osPath.isAbsolute(data.href)) {
              await this._openUri(URI.file(data.href));
            } else {
              await this._openUri(URI.parse(data.href));
            }
          }
          break;
        }
        case "customKernelMessage": {
          this._onMessage.fire({ message: data.message });
          break;
        }
        case "customRendererMessage": {
          this.rendererMessaging?.postMessage(data.rendererId, data.message);
          break;
        }
        case "clickMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell) {
            if (data.shiftKey || (isMacintosh ? data.metaKey : data.ctrlKey)) {
              this.notebookEditor.toggleNotebookCellSelection(
                cell,
                /* fromPrevious */
                data.shiftKey
              );
            } else {
              await this.notebookEditor.focusNotebookCell(cell, "container", { skipReveal: true });
            }
          }
          break;
        }
        case "contextMenuMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell) {
            await this.notebookEditor.focusNotebookCell(cell, "container", { skipReveal: true });
            const webviewRect = this.element.getBoundingClientRect();
            this.contextMenuService.showContextMenu({
              menuId: MenuId.NotebookCellTitle,
              contextKeyService: this.contextKeyService,
              getAnchor: () => ({
                x: webviewRect.x + data.clientX,
                y: webviewRect.y + data.clientY
              })
            });
          }
          break;
        }
        case "toggleMarkupPreview": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell && !this.notebookEditor.creationOptions.isReadOnly) {
            this.notebookEditor.setMarkupCellEditState(data.cellId, CellEditState.Editing);
            await this.notebookEditor.focusNotebookCell(cell, "editor", { skipReveal: true });
          }
          break;
        }
        case "mouseEnterMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell instanceof MarkupCellViewModel) {
            cell.cellIsHovered = true;
          }
          break;
        }
        case "mouseLeaveMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell instanceof MarkupCellViewModel) {
            cell.cellIsHovered = false;
          }
          break;
        }
        case "cell-drag-start": {
          this.notebookEditor.didStartDragMarkupCell(data.cellId, data);
          break;
        }
        case "cell-drag": {
          this.notebookEditor.didDragMarkupCell(data.cellId, data);
          break;
        }
        case "cell-drop": {
          this.notebookEditor.didDropMarkupCell(data.cellId, {
            dragOffsetY: data.dragOffsetY,
            ctrlKey: data.ctrlKey,
            altKey: data.altKey
          });
          break;
        }
        case "cell-drag-end": {
          this.notebookEditor.didEndDragMarkupCell(data.cellId);
          break;
        }
        case "renderedMarkup": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell instanceof MarkupCellViewModel) {
            cell.renderedHtml = data.html;
          }
          this._handleHighlightCodeBlock(data.codeBlocks);
          break;
        }
        case "renderedCellOutput": {
          this._handleHighlightCodeBlock(data.codeBlocks);
          break;
        }
        case "outputResized": {
          this.notebookEditor.didResizeOutput(data.cellId);
          break;
        }
        case "getOutputItem": {
          const resolvedResult = this.resolveOutputId(data.outputId);
          const output = resolvedResult?.output.model.outputs.find((output2) => output2.mime === data.mime);
          this._sendMessageToWebview({
            type: "returnOutputItem",
            requestId: data.requestId,
            output: output ? { mime: output.mime, valueBytes: output.data.buffer } : void 0
          });
          break;
        }
        case "logRendererDebugMessage": {
          this._logRendererDebugMessage(`${data.message}${data.data ? " " + JSON.stringify(data.data, null, 4) : ""}`);
          break;
        }
        case "notebookPerformanceMessage": {
          this.notebookEditor.updatePerformanceMetadata(data.cellId, data.executionId, data.duration, data.rendererId);
          if (data.outputSize && data.rendererId === "vscode.builtin-renderer") {
            this._sendPerformanceData(data.outputSize, data.duration);
          }
          break;
        }
        case "outputInputFocus": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.inputInOutputIsFocused = data.inputFocused;
            }
          }
          this.notebookEditor.didFocusOutputInputChange(data.inputFocused);
        }
      }
    }));
    return initializePromise.p;
  }
  _sendPerformanceData(outputSize, renderTime) {
    const telemetryData = {
      outputSize,
      renderTime
    };
    this.telemetryService.publicLog2("NotebookCellOutputRender", telemetryData);
  }
  _handleNotebookCellResource(uri) {
    const notebookResource = uri.path.length > 0 ? uri : this.documentUri;
    const lineMatch = /(?:^|&)line=([^&]+)/.exec(uri.query);
    let editorOptions = void 0;
    if (lineMatch) {
      const parsedLineNumber = parseInt(lineMatch[1], 10);
      if (!isNaN(parsedLineNumber)) {
        const lineNumber = parsedLineNumber;
        editorOptions = {
          selection: { startLineNumber: lineNumber, startColumn: 1 }
        };
      }
    }
    const executionMatch = /(?:^|&)execution_count=([^&]+)/.exec(uri.query);
    if (executionMatch) {
      const executionCount = parseInt(executionMatch[1], 10);
      if (!isNaN(executionCount)) {
        const notebookModel = this.notebookService.getNotebookTextModel(notebookResource);
        const cell = notebookModel?.cells.slice().reverse().find((cell2) => {
          return cell2.internalMetadata.executionOrder === executionCount;
        });
        if (cell?.uri) {
          return this.openerService.open(cell.uri, {
            fromUserGesture: true,
            fromWorkspace: true,
            editorOptions
          });
        }
      }
    }
    const fragmentLineMatch = /\?line=(\d+)$/.exec(uri.fragment);
    if (fragmentLineMatch) {
      const parsedLineNumber = parseInt(fragmentLineMatch[1], 10);
      if (!isNaN(parsedLineNumber)) {
        const lineNumber = parsedLineNumber + 1;
        const fragment = uri.fragment.substring(0, fragmentLineMatch.index);
        const editorOptions2 = {
          selection: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 }
        };
        return this.openerService.open(notebookResource.with({ fragment }), {
          fromUserGesture: true,
          fromWorkspace: true,
          editorOptions: editorOptions2
        });
      }
    }
    return this.openerService.open(notebookResource, { fromUserGesture: true, fromWorkspace: true });
  }
  async _handleResourceOpening(href) {
    let linkToOpen = void 0;
    let fragment = void 0;
    const hrefWithFragment = FRAGMENT_REGEX.exec(href);
    if (hrefWithFragment) {
      href = hrefWithFragment[1];
      fragment = hrefWithFragment[2];
    }
    if (href.startsWith("/")) {
      linkToOpen = await this.pathService.fileURI(href);
      const folders = this.workspaceContextService.getWorkspace().folders;
      if (folders.length) {
        linkToOpen = linkToOpen.with({
          scheme: folders[0].uri.scheme,
          authority: folders[0].uri.authority
        });
      }
    } else if (href.startsWith("~")) {
      const userHome = await this.pathService.userHome();
      if (userHome) {
        linkToOpen = URI.joinPath(userHome, href.substring(2));
      }
    } else {
      if (this.documentUri.scheme === Schemas.untitled) {
        const folders = this.workspaceContextService.getWorkspace().folders;
        if (!folders.length) {
          return;
        }
        linkToOpen = URI.joinPath(folders[0].uri, href);
      } else {
        linkToOpen = URI.joinPath(dirname(this.documentUri), href);
      }
    }
    if (linkToOpen) {
      if (fragment) {
        linkToOpen = linkToOpen.with({ fragment });
      }
      await this._openUri(linkToOpen);
    }
  }
  async _openUri(uri) {
    let lineNumber = void 0;
    let column = void 0;
    const lineCol = LINE_COLUMN_REGEX.exec(uri.path);
    if (lineCol) {
      uri = uri.with({
        path: uri.path.slice(0, lineCol.index),
        fragment: `L${lineCol[0].slice(1)}`
      });
      lineNumber = parseInt(lineCol[1], 10);
      column = lineCol[2] ? parseInt(lineCol[2], 10) : 1;
    }
    const lineMatch = LineQueryRegex.exec(uri.query);
    if (lineMatch) {
      const parsedLineNumber = parseInt(lineMatch[1], 10);
      if (!isNaN(parsedLineNumber)) {
        lineNumber = parsedLineNumber + 1;
        column = 1;
        uri = uri.with({ fragment: `L${lineNumber}` });
      }
    }
    uri = uri.with({
      query: null
    });
    const extractedSelection = extractSelection(uri);
    const selection = lineNumber !== void 0 && column !== void 0 ? { startLineNumber: lineNumber, startColumn: column } : extractedSelection.selection;
    const resource = extractedSelection.uri;
    if (!this.fileService.hasProvider(resource) || this.workspaceContextService.isInsideWorkspace(resource)) {
      await this.openerService.open(uri, { fromUserGesture: true, fromWorkspace: true });
      return;
    }
    let match = void 0;
    for (const group of this.editorGroupService.groups) {
      const editorInput = group.editors.find((editor) => editor.resource && isEqual(editor.resource, resource, true));
      if (editorInput) {
        match = { group, editor: editorInput };
        break;
      }
    }
    const options = {
      selection,
      source: EditorOpenSource.USER
    };
    if (match) {
      await this.editorService.openEditors([{
        editor: match.editor,
        options
      }], match.group, { validateTrust: true });
    } else {
      await this.editorService.openEditors([{
        resource,
        options
      }], void 0, { validateTrust: true });
    }
  }
  _handleHighlightCodeBlock(codeBlocks) {
    for (const { id, value, lang } of codeBlocks) {
      const languageId = this.languageService.getLanguageIdByLanguageName(lang);
      if (!languageId) {
        continue;
      }
      tokenizeToString(this.languageService, value, languageId).then((html) => {
        if (this._disposed) {
          return;
        }
        this._sendMessageToWebview({
          type: "tokenizedCodeBlock",
          html,
          codeBlockId: id
        });
      });
    }
  }
  async _onDidClickDataLink(event) {
    if (typeof event.data !== "string") {
      return;
    }
    const [splitStart, splitData] = event.data.split(";base64,");
    if (!splitData || !splitStart) {
      return;
    }
    const defaultDir = extname(this.documentUri) === ".interactive" ? this.workspaceContextService.getWorkspace().folders[0]?.uri ?? await this.fileDialogService.defaultFilePath() : dirname(this.documentUri);
    let defaultName;
    if (event.downloadName) {
      defaultName = event.downloadName;
    } else {
      const mimeType = splitStart.replace(/^data:/, "");
      const candidateExtension = mimeType && getExtensionForMimeType(mimeType);
      defaultName = candidateExtension ? `download${candidateExtension}` : "download";
    }
    const defaultUri = joinPath(defaultDir, defaultName);
    const newFileUri = await this.fileDialogService.showSaveDialog({
      defaultUri
    });
    if (!newFileUri) {
      return;
    }
    const buff = decodeBase64(splitData);
    await this.fileService.writeFile(newFileUri, buff);
    await this.openerService.open(newFileUri);
  }
  _createInset(webviewService, content) {
    this.localResourceRootsCache = this._getResourceRootsCache();
    const webview = webviewService.createWebviewElement({
      origin: BackLayerWebView.getOriginStore(this.storageService).getOrigin(this.notebookViewType, void 0),
      title: nls.localize("webview title", "Notebook webview content"),
      options: {
        purpose: WebviewContentPurpose.NotebookRenderer,
        enableFindWidget: false,
        transformCssVariables: transformWebviewThemeVars
      },
      contentOptions: {
        allowMultipleAPIAcquire: true,
        allowScripts: true,
        forwardUntrustedKeypressEvents: false,
        localResourceRoots: this.localResourceRootsCache
      },
      extension: void 0,
      providedViewType: "notebook.output"
    });
    webview.setHtml(content);
    webview.setContextKeyService(this.contextKeyService);
    return webview;
  }
  _getResourceRootsCache() {
    const workspaceFolders = this.contextService.getWorkspace().folders.map((x) => x.uri);
    const notebookDir = this.getNotebookBaseUri();
    return [
      this.notebookService.getNotebookProviderResourceRoots(),
      this.notebookService.getRenderers().map((x) => dirname(x.entrypoint.path)),
      ...Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), (x) => [
        dirname(x.entrypoint),
        ...x.localResourceRoots
      ]),
      workspaceFolders,
      notebookDir,
      this.getBuiltinLocalResourceRoots()
    ].flat();
  }
  initializeWebViewState() {
    this._preloadsCache.clear();
    if (this._currentKernel) {
      this._updatePreloadsFromKernel(this._currentKernel);
    }
    for (const [output, inset] of this.insetMapping.entries()) {
      this._sendMessageToWebview({ ...inset.cachedCreation, initiallyHidden: this.hiddenInsetMapping.has(output) });
    }
    if (this.initializeMarkupPromise?.isFirstInit) {
    } else {
      const mdCells = [...this.markupPreviewMapping.values()];
      this.markupPreviewMapping.clear();
      this.initializeMarkup(mdCells);
    }
    this._updateStyles();
    this._updateOptions();
  }
  shouldUpdateInset(cell, output, cellTop, outputOffset) {
    if (this._disposed) {
      return false;
    }
    if ("isOutputCollapsed" in cell && cell.isOutputCollapsed) {
      return false;
    }
    if (this.hiddenInsetMapping.has(output)) {
      return true;
    }
    const outputCache = this.insetMapping.get(output);
    if (!outputCache) {
      return false;
    }
    if (outputOffset === outputCache.cachedCreation.outputOffset && cellTop === outputCache.cachedCreation.cellTop) {
      return false;
    }
    return true;
  }
  ackHeight(updates) {
    this._sendMessageToWebview({
      type: "ack-dimension",
      updates
    });
  }
  updateScrollTops(outputRequests, markupPreviews) {
    if (this._disposed) {
      return;
    }
    const widgets = coalesce(outputRequests.map((request) => {
      const outputCache = this.insetMapping.get(request.output);
      if (!outputCache) {
        return;
      }
      if (!request.forceDisplay && !this.shouldUpdateInset(request.cell, request.output, request.cellTop, request.outputOffset)) {
        return;
      }
      const id = outputCache.outputId;
      outputCache.cachedCreation.cellTop = request.cellTop;
      outputCache.cachedCreation.outputOffset = request.outputOffset;
      this.hiddenInsetMapping.delete(request.output);
      return {
        cellId: request.cell.id,
        outputId: id,
        cellTop: request.cellTop,
        outputOffset: request.outputOffset,
        forceDisplay: request.forceDisplay
      };
    }));
    if (!widgets.length && !markupPreviews.length) {
      return;
    }
    this._sendMessageToWebview({
      type: "view-scroll",
      widgets,
      markupCells: markupPreviews
    });
  }
  async createMarkupPreview(initialization) {
    if (this._disposed) {
      return;
    }
    if (this.markupPreviewMapping.has(initialization.cellId)) {
      console.error("Trying to create markup preview that already exists");
      return;
    }
    this.markupPreviewMapping.set(initialization.cellId, initialization);
    this._sendMessageToWebview({
      type: "createMarkupCell",
      cell: initialization
    });
  }
  async showMarkupPreview(newContent) {
    if (this._disposed) {
      return;
    }
    const entry = this.markupPreviewMapping.get(newContent.cellId);
    if (!entry) {
      return this.createMarkupPreview(newContent);
    }
    const sameContent = newContent.content === entry.content;
    const sameMetadata = equals(newContent.metadata, entry.metadata);
    if (!sameContent || !sameMetadata || !entry.visible) {
      this._sendMessageToWebview({
        type: "showMarkupCell",
        id: newContent.cellId,
        handle: newContent.cellHandle,
        // If the content has not changed, we still want to make sure the
        // preview is visible but don't need to send anything over
        content: sameContent ? void 0 : newContent.content,
        top: newContent.offset,
        metadata: sameMetadata ? void 0 : newContent.metadata
      });
    }
    entry.metadata = newContent.metadata;
    entry.content = newContent.content;
    entry.offset = newContent.offset;
    entry.visible = true;
  }
  async hideMarkupPreviews(cellIds) {
    if (this._disposed) {
      return;
    }
    const cellsToHide = [];
    for (const cellId of cellIds) {
      const entry = this.markupPreviewMapping.get(cellId);
      if (entry) {
        if (entry.visible) {
          cellsToHide.push(cellId);
          entry.visible = false;
        }
      }
    }
    if (cellsToHide.length) {
      this._sendMessageToWebview({
        type: "hideMarkupCells",
        ids: cellsToHide
      });
    }
  }
  async unhideMarkupPreviews(cellIds) {
    if (this._disposed) {
      return;
    }
    const toUnhide = [];
    for (const cellId of cellIds) {
      const entry = this.markupPreviewMapping.get(cellId);
      if (entry) {
        if (!entry.visible) {
          entry.visible = true;
          toUnhide.push(cellId);
        }
      } else {
        console.error(`Trying to unhide a preview that does not exist: ${cellId}`);
      }
    }
    this._sendMessageToWebview({
      type: "unhideMarkupCells",
      ids: toUnhide
    });
  }
  async deleteMarkupPreviews(cellIds) {
    if (this._disposed) {
      return;
    }
    for (const id of cellIds) {
      if (!this.markupPreviewMapping.has(id)) {
        console.error(`Trying to delete a preview that does not exist: ${id}`);
      }
      this.markupPreviewMapping.delete(id);
    }
    if (cellIds.length) {
      this._sendMessageToWebview({
        type: "deleteMarkupCell",
        ids: cellIds
      });
    }
  }
  async updateMarkupPreviewSelections(selectedCellsIds) {
    if (this._disposed) {
      return;
    }
    this._sendMessageToWebview({
      type: "updateSelectedMarkupCells",
      selectedCellIds: selectedCellsIds.filter((id) => this.markupPreviewMapping.has(id))
    });
  }
  async initializeMarkup(cells) {
    if (this._disposed) {
      return;
    }
    this.initializeMarkupPromise?.p.complete();
    const requestId = UUID.generateUuid();
    this.initializeMarkupPromise = { p: new DeferredPromise(), requestId, isFirstInit: this.firstInit };
    this.firstInit = false;
    for (const cell of cells) {
      this.markupPreviewMapping.set(cell.cellId, cell);
    }
    this._sendMessageToWebview({
      type: "initializeMarkup",
      cells,
      requestId
    });
    return this.initializeMarkupPromise.p.p;
  }
  /**
   * Validate if cached inset is out of date and require a rerender
   * Note that it doesn't account for output content change.
   */
  _cachedInsetEqual(cachedInset, content) {
    if (content.type === RenderOutputType.Extension) {
      return cachedInset.renderer?.id === content.renderer.id;
    } else {
      return cachedInset.cachedCreation.type === "html";
    }
  }
  requestCreateOutputWhenWebviewIdle(cellInfo, content, cellTop, offset) {
    if (this._disposed) {
      return;
    }
    if (this.insetMapping.has(content.source)) {
      return;
    }
    if (this.pendingWebviewIdleCreationRequest.has(content.source)) {
      return;
    }
    if (this.pendingWebviewIdleInsetMapping.has(content.source)) {
      return;
    }
    this.pendingWebviewIdleCreationRequest.set(content.source, runWhenGlobalIdle(() => {
      const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, true, true);
      this._sendMessageToWebview(message, transferable);
      this.pendingWebviewIdleInsetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo, renderer, cachedCreation: message });
      this.reversedPendingWebviewIdleInsetMapping.set(message.outputId, content.source);
      this.pendingWebviewIdleCreationRequest.delete(content.source);
    }));
  }
  createOutput(cellInfo, content, cellTop, offset) {
    if (this._disposed) {
      return;
    }
    const cachedInset = this.insetMapping.get(content.source);
    this.pendingWebviewIdleCreationRequest.get(content.source)?.dispose();
    this.pendingWebviewIdleCreationRequest.delete(content.source);
    this.pendingWebviewIdleInsetMapping.delete(content.source);
    if (cachedInset) {
      this.reversedPendingWebviewIdleInsetMapping.delete(cachedInset.outputId);
    }
    if (cachedInset && this._cachedInsetEqual(cachedInset, content)) {
      this.hiddenInsetMapping.delete(content.source);
      this._sendMessageToWebview({
        type: "showOutput",
        cellId: cachedInset.cellInfo.cellId,
        outputId: cachedInset.outputId,
        cellTop,
        outputOffset: offset
      });
      return;
    }
    const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, false, false);
    this._sendMessageToWebview(message, transferable);
    this.insetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo, renderer, cachedCreation: message });
    this.hiddenInsetMapping.delete(content.source);
    this.reversedInsetMapping.set(message.outputId, content.source);
  }
  createMetadata(output, mimeType) {
    if (mimeType.startsWith("image")) {
      const buffer = output.outputs.find((out) => out.mime === "text/plain")?.data.buffer;
      if (buffer?.length && buffer?.length > 0) {
        const altText = new TextDecoder().decode(buffer);
        return { ...output.metadata, vscode_altText: altText };
      }
    }
    return output.metadata;
  }
  _createOutputCreationMessage(cellInfo, content, cellTop, offset, createOnIdle, initiallyHidden) {
    const messageBase = {
      type: "html",
      executionId: cellInfo.executionId,
      cellId: cellInfo.cellId,
      cellTop,
      outputOffset: offset,
      left: 0,
      requiredPreloads: [],
      createOnIdle
    };
    const transfer = [];
    let message;
    let renderer;
    if (content.type === RenderOutputType.Extension) {
      const output = content.source.model;
      renderer = content.renderer;
      const first = output.outputs.find((op) => op.mime === content.mimeType);
      const metadata = this.createMetadata(output, content.mimeType);
      const valueBytes = copyBufferIfNeeded(first.data.buffer, transfer);
      message = {
        ...messageBase,
        outputId: output.outputId,
        rendererId: content.renderer.id,
        content: {
          type: RenderOutputType.Extension,
          outputId: output.outputId,
          metadata,
          output: {
            mime: first.mime,
            valueBytes
          },
          allOutputs: output.outputs.map((output2) => ({ mime: output2.mime }))
        },
        initiallyHidden
      };
    } else {
      message = {
        ...messageBase,
        outputId: UUID.generateUuid(),
        content: {
          type: content.type,
          htmlContent: content.htmlContent
        },
        initiallyHidden
      };
    }
    return {
      message,
      renderer,
      transfer
    };
  }
  updateOutput(cellInfo, content, cellTop, offset) {
    if (this._disposed) {
      return;
    }
    if (!this.insetMapping.has(content.source)) {
      this.createOutput(cellInfo, content, cellTop, offset);
      return;
    }
    const outputCache = this.insetMapping.get(content.source);
    if (outputCache.versionId === content.source.model.versionId) {
      return;
    }
    this.hiddenInsetMapping.delete(content.source);
    let updatedContent = void 0;
    const transfer = [];
    if (content.type === RenderOutputType.Extension) {
      const output = content.source.model;
      const firstBuffer = output.outputs.find((op) => op.mime === content.mimeType);
      const appenededData = output.appendedSinceVersion(outputCache.versionId, content.mimeType);
      const appended = appenededData ? { valueBytes: appenededData.buffer, previousVersion: outputCache.versionId } : void 0;
      const valueBytes = copyBufferIfNeeded(firstBuffer.data.buffer, transfer);
      updatedContent = {
        type: RenderOutputType.Extension,
        outputId: outputCache.outputId,
        metadata: output.metadata,
        output: {
          mime: content.mimeType,
          valueBytes,
          appended
        },
        allOutputs: output.outputs.map((output2) => ({ mime: output2.mime }))
      };
    }
    this._sendMessageToWebview({
      type: "showOutput",
      cellId: outputCache.cellInfo.cellId,
      outputId: outputCache.outputId,
      cellTop,
      outputOffset: offset,
      content: updatedContent
    }, transfer);
    outputCache.versionId = content.source.model.versionId;
    return;
  }
  async copyImage(output) {
    const textAlternates = [];
    const cellOutput = output.model;
    for (const outputItem of cellOutput.outputs) {
      if (TEXT_BASED_MIMETYPES.includes(outputItem.mime)) {
        const text = isTextStreamMime(outputItem.mime) ? getOutputStreamText(output).text : getOutputText(outputItem.mime, outputItem);
        textAlternates.push({
          mimeType: outputItem.mime,
          content: text
        });
      }
    }
    this._sendMessageToWebview({
      type: "copyImage",
      outputId: output.model.outputId,
      altOutputId: output.model.alternativeOutputId,
      textAlternates: textAlternates.length > 0 ? textAlternates : void 0
    });
  }
  removeInsets(outputs) {
    if (this._disposed) {
      return;
    }
    for (const output of outputs) {
      const outputCache = this.insetMapping.get(output);
      if (!outputCache) {
        continue;
      }
      const id = outputCache.outputId;
      this._sendMessageToWebview({
        type: "clearOutput",
        rendererId: outputCache.cachedCreation.rendererId,
        cellUri: outputCache.cellInfo.cellUri.toString(),
        outputId: id,
        cellId: outputCache.cellInfo.cellId
      });
      this.insetMapping.delete(output);
      this.pendingWebviewIdleCreationRequest.get(output)?.dispose();
      this.pendingWebviewIdleCreationRequest.delete(output);
      this.pendingWebviewIdleInsetMapping.delete(output);
      this.reversedPendingWebviewIdleInsetMapping.delete(id);
      this.reversedInsetMapping.delete(id);
    }
  }
  hideInset(output) {
    if (this._disposed) {
      return;
    }
    const outputCache = this.insetMapping.get(output);
    if (!outputCache) {
      return;
    }
    this.hiddenInsetMapping.add(output);
    this._sendMessageToWebview({
      type: "hideOutput",
      outputId: outputCache.outputId,
      cellId: outputCache.cellInfo.cellId
    });
  }
  focusWebview() {
    if (this._disposed) {
      return;
    }
    this.webview?.focus();
  }
  selectOutputContents(cell) {
    if (this._disposed) {
      return;
    }
    const output = cell.outputsViewModels.find((o) => o.model.outputId === cell.focusedOutputId);
    const outputId = output ? this.insetMapping.get(output)?.outputId : void 0;
    this._sendMessageToWebview({
      type: "select-output-contents",
      cellOrOutputId: outputId || cell.id
    });
  }
  selectInputContents(cell) {
    if (this._disposed) {
      return;
    }
    const output = cell.outputsViewModels.find((o) => o.model.outputId === cell.focusedOutputId);
    const outputId = output ? this.insetMapping.get(output)?.outputId : void 0;
    this._sendMessageToWebview({
      type: "select-input-contents",
      cellOrOutputId: outputId || cell.id
    });
  }
  focusOutput(cellOrOutputId, alternateId, viewFocused) {
    if (this._disposed) {
      return;
    }
    if (!viewFocused) {
      this.webview?.focus();
    }
    this._sendMessageToWebview({
      type: "focus-output",
      cellOrOutputId,
      alternateId
    });
  }
  blurOutput() {
    if (this._disposed) {
      return;
    }
    this._sendMessageToWebview({
      type: "blur-output"
    });
  }
  async find(query, options) {
    if (query === "") {
      this._sendMessageToWebview({
        type: "findStop",
        ownerID: options.ownerID
      });
      return [];
    }
    const p = new Promise((resolve) => {
      const sub = this.webview?.onMessage((e) => {
        if (e.message.type === "didFind") {
          resolve(e.message.matches);
          sub?.dispose();
        }
      });
    });
    this._sendMessageToWebview({
      type: "find",
      query,
      options
    });
    const ret = await p;
    return ret;
  }
  findStop(ownerID) {
    this._sendMessageToWebview({
      type: "findStop",
      ownerID
    });
  }
  async findHighlightCurrent(index, ownerID) {
    const p = new Promise((resolve) => {
      const sub = this.webview?.onMessage((e) => {
        if (e.message.type === "didFindHighlightCurrent") {
          resolve(e.message.offset);
          sub?.dispose();
        }
      });
    });
    this._sendMessageToWebview({
      type: "findHighlightCurrent",
      index,
      ownerID
    });
    const ret = await p;
    return ret;
  }
  async findUnHighlightCurrent(index, ownerID) {
    this._sendMessageToWebview({
      type: "findUnHighlightCurrent",
      index,
      ownerID
    });
  }
  deltaCellOutputContainerClassNames(cellId, added, removed) {
    this._sendMessageToWebview({
      type: "decorations",
      cellId,
      addedClassNames: added,
      removedClassNames: removed
    });
  }
  deltaMarkupPreviewClassNames(cellId, added, removed) {
    if (this.markupPreviewMapping.get(cellId)) {
      this._sendMessageToWebview({
        type: "markupDecorations",
        cellId,
        addedClassNames: added,
        removedClassNames: removed
      });
    }
  }
  updateOutputRenderers() {
    if (!this.webview) {
      return;
    }
    const renderersData = this.getRendererData();
    this.localResourceRootsCache = this._getResourceRootsCache();
    const mixedResourceRoots = [
      ...this.localResourceRootsCache || [],
      ...this._currentKernel ? [this._currentKernel.localResourceRoot] : []
    ];
    this.webview.localResourcesRoot = mixedResourceRoots;
    this._sendMessageToWebview({
      type: "updateRenderers",
      rendererData: renderersData
    });
  }
  async updateKernelPreloads(kernel) {
    if (this._disposed || kernel === this._currentKernel) {
      return;
    }
    const previousKernel = this._currentKernel;
    this._currentKernel = kernel;
    if (previousKernel && previousKernel.preloadUris.length > 0) {
      this.webview?.reload();
    } else if (kernel) {
      this._updatePreloadsFromKernel(kernel);
    }
  }
  _updatePreloadsFromKernel(kernel) {
    const resources = [];
    for (const preload of kernel.preloadUris) {
      const uri = this.environmentService.isExtensionDevelopment && (preload.scheme === "http" || preload.scheme === "https") ? preload : this.asWebviewUri(preload, void 0);
      if (!this._preloadsCache.has(uri.toString())) {
        resources.push({ uri: uri.toString(), originalUri: preload.toString() });
        this._preloadsCache.add(uri.toString());
      }
    }
    if (!resources.length) {
      return;
    }
    this._updatePreloads(resources);
  }
  _updatePreloads(resources) {
    if (!this.webview) {
      return;
    }
    const mixedResourceRoots = [
      ...this.localResourceRootsCache || [],
      ...this._currentKernel ? [this._currentKernel.localResourceRoot] : []
    ];
    this.webview.localResourcesRoot = mixedResourceRoots;
    this._sendMessageToWebview({
      type: "preload",
      resources
    });
  }
  _sendMessageToWebview(message, transfer) {
    if (this._disposed) {
      return;
    }
    this.webview?.postMessage(message, transfer);
  }
  dispose() {
    this._disposed = true;
    this.webview?.dispose();
    this.webview = void 0;
    this.notebookEditor = null;
    this.insetMapping.clear();
    this.pendingWebviewIdleCreationRequest.clear();
    super.dispose();
  }
};
BackLayerWebView = __decorateClass([
  __decorateParam(6, IWebviewService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, INotebookService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IFileDialogService),
  __decorateParam(12, IFileService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IWorkspaceTrustManagementService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, ILanguageService),
  __decorateParam(18, IWorkspaceContextService),
  __decorateParam(19, IEditorGroupsService),
  __decorateParam(20, IEditorService),
  __decorateParam(21, IStorageService),
  __decorateParam(22, IPathService),
  __decorateParam(23, INotebookLoggingService),
  __decorateParam(24, IThemeService),
  __decorateParam(25, ITelemetryService)
], BackLayerWebView);
function copyBufferIfNeeded(buffer, transfer) {
  if (buffer.byteLength === buffer.buffer.byteLength) {
    return buffer;
  } else {
    const valueBytes = new Uint8Array(buffer);
    transfer.push(valueBytes.buffer);
    return valueBytes;
  }
}
function getTokenizationCss() {
  const colorMap = TokenizationRegistry.getColorMap();
  const tokenizationCss = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
  return tokenizationCss;
}
function tryDecodeURIComponent(uri) {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}
export {
  BackLayerWebView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9yZW5kZXJlcnMvYmFja0xheWVyV2ViVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcnVuV2hlbkdsb2JhbElkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZSwgaXNUZXh0U3RyZWFtTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcywgbWF0Y2hlc1NjaGVtZSwgbWF0Y2hlc1NvbWVTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgb3NQYXRoIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgZXh0bmFtZSwgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIFVVSUQgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcbmltcG9ydCB7IHRva2VuaXplVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy90ZXh0VG9IdG1sVG9rZW5pemVyLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcGVuU291cmNlLCBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZXh0cmFjdFNlbGVjdGlvbiwgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZWRpdG9yRmluZE1hdGNoLCBlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgSUNlbGxWaWV3TW9kZWwsIElDb21tb25DZWxsSW5mbywgSURpc3BsYXlPdXRwdXRMYXlvdXRVcGRhdGVSZXF1ZXN0LCBJRGlzcGxheU91dHB1dFZpZXdNb2RlbCwgSUZvY3VzTm90ZWJvb2tDZWxsT3B0aW9ucywgSUdlbmVyaWNDZWxsVmlld01vZGVsLCBJSW5zZXRSZW5kZXJPdXRwdXQsIElOb3RlYm9va0VkaXRvckNyZWF0aW9uT3B0aW9ucywgSU5vdGVib29rV2Vidmlld01lc3NhZ2UsIFJlbmRlck91dHB1dFR5cGUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfV0VCVklFV19CT1VOREFSWSB9IGZyb20gJy4uL25vdGVib29rQ2VsbExpc3QuanMnO1xuaW1wb3J0IHsgcHJlbG9hZHNTY3JpcHRTdHIgfSBmcm9tICcuL3dlYnZpZXdQcmVsb2Fkcy5qcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1XZWJ2aWV3VGhlbWVWYXJzIH0gZnJvbSAnLi93ZWJ2aWV3VGhlbWVNYXBwaW5nLmpzJztcbmltcG9ydCB7IE1hcmt1cENlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbWFya3VwQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBJQ2VsbE91dHB1dCwgSU5vdGVib29rUmVuZGVyZXJJbmZvLCBSZW5kZXJlck1lc3NhZ2luZ1NwZWMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTY29wZWRSZW5kZXJlck1lc3NhZ2luZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld0VsZW1lbnQsIElXZWJ2aWV3U2VydmljZSwgV2Vidmlld0NvbnRlbnRQdXJwb3NlLCBXZWJ2aWV3T3JpZ2luU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3V2luZG93RHJhZ01vbml0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlld1dpbmRvd0RyYWdNb25pdG9yLmpzJztcbmltcG9ydCB7IGFzV2Vidmlld1VyaSwgd2Vidmlld0dlbmVyaWNDc3BTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93ZWJ2aWV3L2NvbW1vbi93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRnJvbVdlYnZpZXdNZXNzYWdlLCBJQWNrT3V0cHV0SGVpZ2h0LCBJQ2xpY2tlZERhdGFVcmxNZXNzYWdlLCBJQ29kZUJsb2NrSGlnaGxpZ2h0UmVxdWVzdCwgSUNvbnRlbnRXaWRnZXRUb3BSZXF1ZXN0LCBJQ29udHJvbGxlclByZWxvYWQsIElDcmVhdGlvbkNvbnRlbnQsIElDcmVhdGlvblJlcXVlc3RNZXNzYWdlLCBJRmluZE1hdGNoLCBJTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uLCBSZW5kZXJlck1ldGFkYXRhLCBTdGF0aWNQcmVsb2FkTWV0YWRhdGEsIFRvV2Vidmlld01lc3NhZ2UgfSBmcm9tICcuL3dlYnZpZXdNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBnZXRPdXRwdXRUZXh0LCBnZXRPdXRwdXRTdHJlYW1UZXh0LCBURVhUX0JBU0VEX01JTUVUWVBFUyB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jZWxsT3V0cHV0VGV4dEhlbHBlci5qcyc7XG5cbmNvbnN0IExJTkVfQ09MVU1OX1JFR0VYID0gLzooW1xcZF0rKSg/OjooW1xcZF0rKSk/JC87XG5jb25zdCBMaW5lUXVlcnlSZWdleCA9IC9saW5lPShcXGQrKSQvO1xuY29uc3QgRlJBR01FTlRfUkVHRVggPSAvXiguKikjKFteI10qKSQvO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDYWNoZWRJbnNldDxLIGV4dGVuZHMgSUNvbW1vbkNlbGxJbmZvPiB7XG5cdG91dHB1dElkOiBzdHJpbmc7XG5cdHZlcnNpb25JZDogbnVtYmVyO1xuXHRjZWxsSW5mbzogSztcblx0cmVuZGVyZXI/OiBJTm90ZWJvb2tSZW5kZXJlckluZm87XG5cdGNhY2hlZENyZWF0aW9uOiBJQ3JlYXRpb25SZXF1ZXN0TWVzc2FnZTtcblx0aW5pdGlhbGl6ZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZEJhY2tMYXllcldlYnZpZXcge1xuXHR3ZWJ2aWV3OiBJV2Vidmlld0VsZW1lbnQ7XG59XG5cbi8qKlxuICogTm90ZWJvb2sgRWRpdG9yIERlbGVnYXRlIGZvciBiYWNrIGxheWVyIHdlYnZpZXdcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tEZWxlZ2F0ZUZvcldlYnZpZXcge1xuXHRyZWFkb25seSBjcmVhdGlvbk9wdGlvbnM6IElOb3RlYm9va0VkaXRvckNyZWF0aW9uT3B0aW9ucztcblx0Z2V0Q2VsbEJ5SWQoY2VsbElkOiBzdHJpbmcpOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdGZvY3VzTm90ZWJvb2tDZWxsKGNlbGw6IElHZW5lcmljQ2VsbFZpZXdNb2RlbCwgZm9jdXM6ICdlZGl0b3InIHwgJ2NvbnRhaW5lcicgfCAnb3V0cHV0Jywgb3B0aW9ucz86IElGb2N1c05vdGVib29rQ2VsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHR0b2dnbGVOb3RlYm9va0NlbGxTZWxlY3Rpb24oY2VsbDogSUdlbmVyaWNDZWxsVmlld01vZGVsLCBzZWxlY3RGcm9tUHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkO1xuXHRnZXRDZWxsQnlJbmZvKGNlbGxJbmZvOiBJQ29tbW9uQ2VsbEluZm8pOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWw7XG5cdGZvY3VzTmV4dE5vdGVib29rQ2VsbChjZWxsOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWwsIGZvY3VzOiAnZWRpdG9yJyB8ICdjb250YWluZXInIHwgJ291dHB1dCcpOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVPdXRwdXRIZWlnaHQoY2VsbEluZm86IElDb21tb25DZWxsSW5mbywgb3V0cHV0OiBJRGlzcGxheU91dHB1dFZpZXdNb2RlbCwgaGVpZ2h0OiBudW1iZXIsIGlzSW5pdDogYm9vbGVhbiwgc291cmNlPzogc3RyaW5nKTogdm9pZDtcblx0c2NoZWR1bGVPdXRwdXRIZWlnaHRBY2soY2VsbEluZm86IElDb21tb25DZWxsSW5mbywgb3V0cHV0SWQ6IHN0cmluZywgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xuXHR1cGRhdGVNYXJrdXBDZWxsSGVpZ2h0KGNlbGxJZDogc3RyaW5nLCBoZWlnaHQ6IG51bWJlciwgaXNJbml0OiBib29sZWFuKTogdm9pZDtcblx0c2V0TWFya3VwQ2VsbEVkaXRTdGF0ZShjZWxsSWQ6IHN0cmluZywgZWRpdFN0YXRlOiBDZWxsRWRpdFN0YXRlKTogdm9pZDtcblx0ZGlkU3RhcnREcmFnTWFya3VwQ2VsbChjZWxsSWQ6IHN0cmluZywgZXZlbnQ6IHsgZHJhZ09mZnNldFk6IG51bWJlciB9KTogdm9pZDtcblx0ZGlkRHJhZ01hcmt1cENlbGwoY2VsbElkOiBzdHJpbmcsIGV2ZW50OiB7IGRyYWdPZmZzZXRZOiBudW1iZXIgfSk6IHZvaWQ7XG5cdGRpZERyb3BNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nLCBldmVudDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyOyBjdHJsS2V5OiBib29sZWFuOyBhbHRLZXk6IGJvb2xlYW4gfSk6IHZvaWQ7XG5cdGRpZEVuZERyYWdNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nKTogdm9pZDtcblx0ZGlkUmVzaXplT3V0cHV0KGNlbGxJZDogc3RyaW5nKTogdm9pZDtcblx0c2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZDtcblx0dHJpZ2dlclNjcm9sbChldmVudDogSU1vdXNlV2hlZWxFdmVudCk6IHZvaWQ7XG5cdHVwZGF0ZVBlcmZvcm1hbmNlTWV0YWRhdGEoY2VsbElkOiBzdHJpbmcsIGV4ZWN1dGlvbklkOiBzdHJpbmcsIGR1cmF0aW9uOiBudW1iZXIsIHJlbmRlcmVySWQ6IHN0cmluZyk6IHZvaWQ7XG5cdGRpZEZvY3VzT3V0cHV0SW5wdXRDaGFuZ2UoaW5wdXRGb2N1c2VkOiBib29sZWFuKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIEJhY2tsYXllcldlYnZpZXdPcHRpb25zIHtcblx0cmVhZG9ubHkgb3V0cHV0Tm9kZVBhZGRpbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0Tm9kZUxlZnRQYWRkaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IHByZXZpZXdOb2RlUGFkZGluZzogbnVtYmVyO1xuXHRyZWFkb25seSBtYXJrZG93bkxlZnRNYXJnaW46IG51bWJlcjtcblx0cmVhZG9ubHkgbGVmdE1hcmdpbjogbnVtYmVyO1xuXHRyZWFkb25seSByaWdodE1hcmdpbjogbnVtYmVyO1xuXHRyZWFkb25seSBydW5HdXR0ZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgZHJhZ0FuZERyb3BFbmFibGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBmb250U2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRwdXRGb250U2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBmb250RmFtaWx5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG91dHB1dEZvbnRGYW1pbHk6IHN0cmluZztcblx0cmVhZG9ubHkgbWFya3VwRm9udFNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgbWFya2Rvd25MaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dExpbmVIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0U2Nyb2xsaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBvdXRwdXRXb3JkV3JhcDogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0TGluZUxpbWl0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dExpbmtpZnlGaWxlUGF0aHM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbmltYWxFcnJvcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWFya3VwRm9udEZhbWlseTogc3RyaW5nO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBCYWNrTGF5ZXJXZWJWaWV3PFQgZXh0ZW5kcyBJQ29tbW9uQ2VsbEluZm8+IGV4dGVuZHMgVGhlbWFibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIF9vcmlnaW5TdG9yZT86IFdlYnZpZXdPcmlnaW5TdG9yZTtcblxuXHRwcml2YXRlIHN0YXRpYyBnZXRPcmlnaW5TdG9yZShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogV2Vidmlld09yaWdpblN0b3JlIHtcblx0XHR0aGlzLl9vcmlnaW5TdG9yZSA/Pz0gbmV3IFdlYnZpZXdPcmlnaW5TdG9yZSgnbm90ZWJvb2suYmFja2xheWVyV2Vidmlldy5vcmlnaW5zJywgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHJldHVybiB0aGlzLl9vcmlnaW5TdG9yZTtcblx0fVxuXG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHR3ZWJ2aWV3OiBJV2Vidmlld0VsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGluc2V0TWFwcGluZzogTWFwPElEaXNwbGF5T3V0cHV0Vmlld01vZGVsLCBJQ2FjaGVkSW5zZXQ8VD4+ID0gbmV3IE1hcCgpO1xuXHRwZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3Q6IE1hcDxJRGlzcGxheU91dHB1dFZpZXdNb2RlbCwgSURpc3Bvc2FibGU+ID0gbmV3IE1hcCgpO1xuXHRwZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmc6IE1hcDxJRGlzcGxheU91dHB1dFZpZXdNb2RlbCwgSUNhY2hlZEluc2V0PFQ+PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZXZlcnNlZFBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZzogTWFwPHN0cmluZywgSURpc3BsYXlPdXRwdXRWaWV3TW9kZWw+ID0gbmV3IE1hcCgpO1xuXG5cdHJlYWRvbmx5IG1hcmt1cFByZXZpZXdNYXBwaW5nID0gbmV3IE1hcDxzdHJpbmcsIElNYXJrdXBDZWxsSW5pdGlhbGl6YXRpb24+KCk7XG5cdHByaXZhdGUgaGlkZGVuSW5zZXRNYXBwaW5nOiBTZXQ8SURpc3BsYXlPdXRwdXRWaWV3TW9kZWw+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIHJldmVyc2VkSW5zZXRNYXBwaW5nOiBNYXA8c3RyaW5nLCBJRGlzcGxheU91dHB1dFZpZXdNb2RlbD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgbG9jYWxSZXNvdXJjZVJvb3RzQ2FjaGU6IFVSSVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tXZWJ2aWV3TWVzc2FnZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZWxvYWRzQ2FjaGUgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTWVzc2FnZTogRXZlbnQ8SU5vdGVib29rV2Vidmlld01lc3NhZ2U+ID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9jdXJyZW50S2VybmVsPzogSU5vdGVib29rS2VybmVsO1xuXG5cdHByaXZhdGUgZmlyc3RJbml0ID0gdHJ1ZTtcblx0cHJpdmF0ZSBpbml0aWFsaXplTWFya3VwUHJvbWlzZT86IHsgcmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7IHJlYWRvbmx5IHA6IERlZmVycmVkUHJvbWlzZTx2b2lkPjsgcmVhZG9ubHkgaXNGaXJzdEluaXQ6IGJvb2xlYW4gfTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG5vbmNlID0gVVVJRC5nZW5lcmF0ZVV1aWQoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0RlbGVnYXRlRm9yV2Vidmlldyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG5vdGVib29rVmlld1R5cGU6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZG9jdW1lbnRVcmk6IFVSSSxcblx0XHRwcml2YXRlIG9wdGlvbnM6IEJhY2tsYXllcldlYnZpZXdPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyZXJNZXNzYWdpbmc6IElTY29wZWRSZW5kZXJlck1lc3NhZ2luZyB8IHVuZGVmaW5lZCxcblx0XHRASVdlYnZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2Vidmlld1NlcnZpY2U6IElXZWJ2aWV3U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rTG9nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLl9sb2dSZW5kZXJlckRlYnVnTWVzc2FnZSgnQ3JlYXRpbmcgYmFja2xheWVyIHdlYnZpZXcgZm9yIG5vdGVib29rJyk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTQwMHB4Jztcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXG5cdFx0aWYgKHJlbmRlcmVyTWVzc2FnaW5nKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZW5kZXJlck1lc3NhZ2luZyk7XG5cdFx0XHRyZW5kZXJlck1lc3NhZ2luZy5yZWNlaXZlTWVzc2FnZUhhbmRsZXIgPSAocmVuZGVyZXJJZCwgbWVzc2FnZSkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMud2VidmlldyB8fCB0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHRcdF9fdnNjb2RlX25vdGVib29rX21lc3NhZ2U6IHRydWUsXG5cdFx0XHRcdFx0dHlwZTogJ2N1c3RvbVJlbmRlcmVyTWVzc2FnZScsXG5cdFx0XHRcdFx0cmVuZGVyZXJJZDogcmVuZGVyZXJJZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdChlID0+IHtcblx0XHRcdGNvbnN0IGJhc2VVcmwgPSB0aGlzLmFzV2Vidmlld1VyaSh0aGlzLmdldE5vdGVib29rQmFzZVVyaSgpLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgaHRtbENvbnRlbnQgPSB0aGlzLmdlbmVyYXRlQ29udGVudChiYXNlVXJsLnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy53ZWJ2aWV3Py5zZXRIdG1sKGh0bWxDb250ZW50KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihUb2tlbml6YXRpb25SZWdpc3RyeS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHRcdHR5cGU6ICd0b2tlbml6ZWRTdHlsZXNDaGFuZ2VkJyxcblx0XHRcdFx0Y3NzOiBnZXRUb2tlbml6YXRpb25Dc3MoKSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogQmFja2xheWVyV2Vidmlld09wdGlvbnMpIHtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuX3VwZGF0ZVN0eWxlcygpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ1JlbmRlcmVyRGVidWdNZXNzYWdlKG1zZzogc3RyaW5nKSB7XG5cdFx0dGhpcy5ub3RlYm9va0xvZ1NlcnZpY2UuZGVidWcoJ0JhY2tsYXllcldlYnZpZXcnLCBgJHt0aGlzLmRvY3VtZW50VXJpfSAoJHt0aGlzLmlkfSkgLSAke21zZ31gKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0eWxlcygpIHtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnbm90ZWJvb2tTdHlsZXMnLFxuXHRcdFx0c3R5bGVzOiB0aGlzLl9nZW5lcmF0ZVN0eWxlcygpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVPcHRpb25zKCkge1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdub3RlYm9va09wdGlvbnMnLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkcmFnQW5kRHJvcEVuYWJsZWQ6IHRoaXMub3B0aW9ucy5kcmFnQW5kRHJvcEVuYWJsZWRcblx0XHRcdH0sXG5cdFx0XHRyZW5kZXJPcHRpb25zOiB7XG5cdFx0XHRcdGxpbmVMaW1pdDogdGhpcy5vcHRpb25zLm91dHB1dExpbmVMaW1pdCxcblx0XHRcdFx0b3V0cHV0U2Nyb2xsaW5nOiB0aGlzLm9wdGlvbnMub3V0cHV0U2Nyb2xsaW5nLFxuXHRcdFx0XHRvdXRwdXRXb3JkV3JhcDogdGhpcy5vcHRpb25zLm91dHB1dFdvcmRXcmFwLFxuXHRcdFx0XHRsaW5raWZ5RmlsZVBhdGhzOiB0aGlzLm9wdGlvbnMub3V0cHV0TGlua2lmeUZpbGVQYXRocyxcblx0XHRcdFx0bWluaW1hbEVycm9yOiB0aGlzLm9wdGlvbnMubWluaW1hbEVycm9yXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZVN0eWxlcygpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0J25vdGVib29rLW91dHB1dC1sZWZ0LW1hcmdpbic6IGAke3RoaXMub3B0aW9ucy5sZWZ0TWFyZ2luICsgdGhpcy5vcHRpb25zLnJ1bkd1dHRlcn1weGAsXG5cdFx0XHQnbm90ZWJvb2stb3V0cHV0LXdpZHRoJzogYGNhbGMoMTAwJSAtICR7dGhpcy5vcHRpb25zLmxlZnRNYXJnaW4gKyB0aGlzLm9wdGlvbnMucmlnaHRNYXJnaW4gKyB0aGlzLm9wdGlvbnMucnVuR3V0dGVyfXB4KWAsXG5cdFx0XHQnbm90ZWJvb2stb3V0cHV0LW5vZGUtcGFkZGluZyc6IGAke3RoaXMub3B0aW9ucy5vdXRwdXROb2RlUGFkZGluZ31weGAsXG5cdFx0XHQnbm90ZWJvb2stcnVuLWd1dHRlcic6IGAke3RoaXMub3B0aW9ucy5ydW5HdXR0ZXJ9cHhgLFxuXHRcdFx0J25vdGVib29rLXByZXZpZXctbm9kZS1wYWRkaW5nJzogYCR7dGhpcy5vcHRpb25zLnByZXZpZXdOb2RlUGFkZGluZ31weGAsXG5cdFx0XHQnbm90ZWJvb2stbWFya2Rvd24tbGVmdC1tYXJnaW4nOiBgJHt0aGlzLm9wdGlvbnMubWFya2Rvd25MZWZ0TWFyZ2lufXB4YCxcblx0XHRcdCdub3RlYm9vay1vdXRwdXQtbm9kZS1sZWZ0LXBhZGRpbmcnOiBgJHt0aGlzLm9wdGlvbnMub3V0cHV0Tm9kZUxlZnRQYWRkaW5nfXB4YCxcblx0XHRcdCdub3RlYm9vay1tYXJrZG93bi1taW4taGVpZ2h0JzogYCR7dGhpcy5vcHRpb25zLnByZXZpZXdOb2RlUGFkZGluZyAqIDJ9cHhgLFxuXHRcdFx0J25vdGVib29rLW1hcmt1cC1mb250LXNpemUnOiB0eXBlb2YgdGhpcy5vcHRpb25zLm1hcmt1cEZvbnRTaXplID09PSAnbnVtYmVyJyAmJiB0aGlzLm9wdGlvbnMubWFya3VwRm9udFNpemUgPiAwID8gYCR7dGhpcy5vcHRpb25zLm1hcmt1cEZvbnRTaXplfXB4YCA6IGBjYWxjKCR7dGhpcy5vcHRpb25zLmZvbnRTaXplfXB4ICogMS4yKWAsXG5cdFx0XHQnbm90ZWJvb2stbWFya2Rvd24tbGluZS1oZWlnaHQnOiB0eXBlb2YgdGhpcy5vcHRpb25zLm1hcmtkb3duTGluZUhlaWdodCA9PT0gJ251bWJlcicgJiYgdGhpcy5vcHRpb25zLm1hcmtkb3duTGluZUhlaWdodCA+IDAgPyBgJHt0aGlzLm9wdGlvbnMubWFya2Rvd25MaW5lSGVpZ2h0fXB4YCA6IGBub3JtYWxgLFxuXHRcdFx0J25vdGVib29rLWNlbGwtb3V0cHV0LWZvbnQtc2l6ZSc6IGAke3RoaXMub3B0aW9ucy5vdXRwdXRGb250U2l6ZSB8fCB0aGlzLm9wdGlvbnMuZm9udFNpemV9cHhgLFxuXHRcdFx0J25vdGVib29rLWNlbGwtb3V0cHV0LWxpbmUtaGVpZ2h0JzogYCR7dGhpcy5vcHRpb25zLm91dHB1dExpbmVIZWlnaHR9cHhgLFxuXHRcdFx0J25vdGVib29rLWNlbGwtb3V0cHV0LW1heC1oZWlnaHQnOiBgJHt0aGlzLm9wdGlvbnMub3V0cHV0TGluZUhlaWdodCAqIHRoaXMub3B0aW9ucy5vdXRwdXRMaW5lTGltaXQgKyAyfXB4YCxcblx0XHRcdCdub3RlYm9vay1jZWxsLW91dHB1dC1mb250LWZhbWlseSc6IHRoaXMub3B0aW9ucy5vdXRwdXRGb250RmFtaWx5IHx8IHRoaXMub3B0aW9ucy5mb250RmFtaWx5LFxuXHRcdFx0J25vdGVib29rLWNlbGwtbWFya3VwLWVtcHR5LWNvbnRlbnQnOiBubHMubG9jYWxpemUoJ25vdGVib29rLmVtcHR5TWFya2Rvd25QbGFjZWhvbGRlcicsIFwiRW1wdHkgbWFya2Rvd24gY2VsbCwgZG91YmxlLWNsaWNrIG9yIHByZXNzIGVudGVyIHRvIGVkaXQuXCIpLFxuXHRcdFx0J25vdGVib29rLWNlbGwtcmVuZGVyZXItbm90LWZvdW5kLWVycm9yJzogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnbm90ZWJvb2suZXJyb3IucmVuZGVyZXJOb3RGb3VuZCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnJDAgaXMgYSBwbGFjZWhvbGRlciBmb3IgdGhlIG1pbWUgdHlwZSddXG5cdFx0XHR9LCBcIk5vIHJlbmRlcmVyIGZvdW5kIGZvciAnJDAnXCIpLFxuXHRcdFx0J25vdGVib29rLWNlbGwtcmVuZGVyZXItZmFsbGJhY2tzLWV4aGF1c3RlZCc6IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ25vdGVib29rLmVycm9yLnJlbmRlcmVyRmFsbGJhY2tzRXhoYXVzdGVkJyxcblx0XHRcdFx0Y29tbWVudDogWyckMCBpcyBhIHBsYWNlaG9sZGVyIGZvciB0aGUgbWltZSB0eXBlJ11cblx0XHRcdH0sIFwiQ291bGQgbm90IHJlbmRlciBjb250ZW50IGZvciAnJDAnXCIpLFxuXHRcdFx0J25vdGVib29rLW1hcmt1cC1mb250LWZhbWlseSc6IHRoaXMub3B0aW9ucy5tYXJrdXBGb250RmFtaWx5LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlQ29udGVudChiYXNlVXJsOiBzdHJpbmcpIHtcblx0XHRjb25zdCByZW5kZXJlcnNEYXRhID0gdGhpcy5nZXRSZW5kZXJlckRhdGEoKTtcblx0XHRjb25zdCBwcmVsb2Fkc0RhdGEgPSB0aGlzLmdldFN0YXRpY1ByZWxvYWRzRGF0YSgpO1xuXHRcdGNvbnN0IHJlbmRlck9wdGlvbnMgPSB7XG5cdFx0XHRsaW5lTGltaXQ6IHRoaXMub3B0aW9ucy5vdXRwdXRMaW5lTGltaXQsXG5cdFx0XHRvdXRwdXRTY3JvbGxpbmc6IHRoaXMub3B0aW9ucy5vdXRwdXRTY3JvbGxpbmcsXG5cdFx0XHRvdXRwdXRXb3JkV3JhcDogdGhpcy5vcHRpb25zLm91dHB1dFdvcmRXcmFwLFxuXHRcdFx0bGlua2lmeUZpbGVQYXRoczogdGhpcy5vcHRpb25zLm91dHB1dExpbmtpZnlGaWxlUGF0aHMsXG5cdFx0XHRtaW5pbWFsRXJyb3I6IHRoaXMub3B0aW9ucy5taW5pbWFsRXJyb3Jcblx0XHR9O1xuXHRcdGNvbnN0IHByZWxvYWRTY3JpcHQgPSBwcmVsb2Fkc1NjcmlwdFN0cihcblx0XHRcdHtcblx0XHRcdFx0Li4udGhpcy5vcHRpb25zLFxuXHRcdFx0XHR0b2tlbml6YXRpb25Dc3M6IGdldFRva2VuaXphdGlvbkNzcygpLFxuXHRcdFx0fSxcblx0XHRcdHsgZHJhZ0FuZERyb3BFbmFibGVkOiB0aGlzLm9wdGlvbnMuZHJhZ0FuZERyb3BFbmFibGVkIH0sXG5cdFx0XHRyZW5kZXJPcHRpb25zLFxuXHRcdFx0cmVuZGVyZXJzRGF0YSxcblx0XHRcdHByZWxvYWRzRGF0YSxcblx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSxcblx0XHRcdHRoaXMubm9uY2UpO1xuXG5cdFx0Y29uc3QgZW5hYmxlQ3NwID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnbm90ZWJvb2suZXhwZXJpbWVudGFsLmVuYWJsZUNzcCcpO1xuXHRcdGNvbnN0IGN1cnJlbnRIaWdobGlnaHQgPSB0aGlzLmdldENvbG9yKGVkaXRvckZpbmRNYXRjaCk7XG5cdFx0Y29uc3QgZmluZE1hdGNoSGlnaGxpZ2h0ID0gdGhpcy5nZXRDb2xvcihlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHQpO1xuXHRcdHJldHVybiAvKiBodG1sICovYFxuXHRcdDxodG1sIGxhbmc9XCJlblwiPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxtZXRhIGNoYXJzZXQ9XCJVVEYtOFwiPlxuXHRcdFx0XHQ8YmFzZSBocmVmPVwiJHtiYXNlVXJsfS9cIiAvPlxuXHRcdFx0XHQke2VuYWJsZUNzcCA/XG5cdFx0XHRcdGA8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiXG5cdFx0XHRcdFx0ZGVmYXVsdC1zcmMgJ25vbmUnO1xuXHRcdFx0XHRcdHNjcmlwdC1zcmMgJHt3ZWJ2aWV3R2VuZXJpY0NzcFNvdXJjZX0gJ3Vuc2FmZS1pbmxpbmUnICd1bnNhZmUtZXZhbCc7XG5cdFx0XHRcdFx0c3R5bGUtc3JjICR7d2Vidmlld0dlbmVyaWNDc3BTb3VyY2V9ICd1bnNhZmUtaW5saW5lJztcblx0XHRcdFx0XHRpbWctc3JjICR7d2Vidmlld0dlbmVyaWNDc3BTb3VyY2V9IGh0dHBzOiBodHRwOiBkYXRhOjtcblx0XHRcdFx0XHRmb250LXNyYyAke3dlYnZpZXdHZW5lcmljQ3NwU291cmNlfSBodHRwczo7XG5cdFx0XHRcdFx0Y29ubmVjdC1zcmMgaHR0cHM6O1xuXHRcdFx0XHRcdGNoaWxkLXNyYyBodHRwczogZGF0YTo7XG5cdFx0XHRcdFwiPmAgOiAnJ31cblx0XHRcdFx0PHN0eWxlIG5vbmNlPVwiJHt0aGlzLm5vbmNlfVwiPlxuXHRcdFx0XHRcdDo6aGlnaGxpZ2h0KGZpbmQtaGlnaGxpZ2h0KSB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZpbmRNYXRjaEJhY2tncm91bmQsICR7ZmluZE1hdGNoSGlnaGxpZ2h0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0OjpoaWdobGlnaHQoY3VycmVudC1maW5kLWhpZ2hsaWdodCkge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1maW5kTWF0Y2hIaWdobGlnaHRCYWNrZ3JvdW5kLCAke2N1cnJlbnRIaWdobGlnaHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5jZWxsX2NvbnRhaW5lciB7XG5cdFx0XHRcdFx0XHR3aWR0aDogMTAwJTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5vdXRwdXRfY29udGFpbmVyIHtcblx0XHRcdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLmNlbGxfY29udGFpbmVyLm5iLWluc2VydEhpZ2hsaWdodCBkaXYub3V0cHV0X2NvbnRhaW5lciBkaXYub3V0cHV0IHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1kaWZmRWRpdG9yLWluc2VydGVkTGluZUJhY2tncm91bmQsIHZhcigtLXZzY29kZS1kaWZmRWRpdG9yLWluc2VydGVkVGV4dEJhY2tncm91bmQpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyID4gZGl2ID4gZGl2ID4gZGl2Lm91dHB1dCB7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IHZhcigtLW5vdGVib29rLWNlbGwtb3V0cHV0LWZvbnQtc2l6ZSk7XG5cdFx0XHRcdFx0XHR3aWR0aDogdmFyKC0tbm90ZWJvb2stb3V0cHV0LXdpZHRoKTtcblx0XHRcdFx0XHRcdG1hcmdpbi1sZWZ0OiB2YXIoLS1ub3RlYm9vay1vdXRwdXQtbGVmdC1tYXJnaW4pO1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdGhlbWUtbm90ZWJvb2stb3V0cHV0LWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0cGFkZGluZy10b3A6IHZhcigtLW5vdGVib29rLW91dHB1dC1ub2RlLXBhZGRpbmcpO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1yaWdodDogdmFyKC0tbm90ZWJvb2stb3V0cHV0LW5vZGUtcGFkZGluZyk7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWJvdHRvbTogdmFyKC0tbm90ZWJvb2stb3V0cHV0LW5vZGUtcGFkZGluZyk7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWxlZnQ6IHZhcigtLW5vdGVib29rLW91dHB1dC1ub2RlLWxlZnQtcGFkZGluZyk7XG5cdFx0XHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXRvcDogbm9uZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBtYXJrZG93biAqL1xuXHRcdFx0XHRcdCNjb250YWluZXIgZGl2LnByZXZpZXcge1xuXHRcdFx0XHRcdFx0d2lkdGg6IDEwMCU7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXJpZ2h0OiB2YXIoLS1ub3RlYm9vay1wcmV2aWV3LW5vZGUtcGFkZGluZyk7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWxlZnQ6IHZhcigtLW5vdGVib29rLW1hcmtkb3duLWxlZnQtbWFyZ2luKTtcblx0XHRcdFx0XHRcdHBhZGRpbmctdG9wOiB2YXIoLS1ub3RlYm9vay1wcmV2aWV3LW5vZGUtcGFkZGluZyk7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWJvdHRvbTogdmFyKC0tbm90ZWJvb2stcHJldmlldy1ub2RlLXBhZGRpbmcpO1xuXG5cdFx0XHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHRcdFx0d2hpdGUtc3BhY2U6IG5vd3JhcDtcblx0XHRcdFx0XHRcdG92ZXJmbG93OiBoaWRkZW47XG5cdFx0XHRcdFx0XHR3aGl0ZS1zcGFjZTogaW5pdGlhbDtcblxuXHRcdFx0XHRcdFx0Zm9udC1zaXplOiB2YXIoLS1ub3RlYm9vay1tYXJrdXAtZm9udC1zaXplKTtcblx0XHRcdFx0XHRcdGxpbmUtaGVpZ2h0OiB2YXIoLS1ub3RlYm9vay1tYXJrZG93bi1saW5lLWhlaWdodCk7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdGhlbWUtdWktZm9yZWdyb3VuZCk7XG5cdFx0XHRcdFx0XHRmb250LWZhbWlseTogdmFyKC0tbm90ZWJvb2stbWFya3VwLWZvbnQtZmFtaWx5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIGRpdi5wcmV2aWV3LmRyYWdnYWJsZSB7XG5cdFx0XHRcdFx0XHR1c2VyLXNlbGVjdDogbm9uZTtcblx0XHRcdFx0XHRcdC13ZWJraXQtdXNlci1zZWxlY3Q6IG5vbmU7XG5cdFx0XHRcdFx0XHQtbXMtdXNlci1zZWxlY3Q6IG5vbmU7XG5cdFx0XHRcdFx0XHRjdXJzb3I6IGdyYWI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciBkaXYucHJldmlldy5zZWxlY3RlZCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiB2YXIoLS10aGVtZS1ub3RlYm9vay1jZWxsLXNlbGVjdGVkLWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgZGl2LnByZXZpZXcuZHJhZ2dpbmcge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdGhlbWUtYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRvcGFjaXR5OiAwLjUgIWltcG9ydGFudDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaC52cy1kYXJrIC5ub3RlYm9va092ZXJsYXkgLmNlbGwubWFya2Rvd24gLmxhdGV4IGltZyxcblx0XHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaC52cy1kYXJrIC5ub3RlYm9va092ZXJsYXkgLmNlbGwubWFya2Rvd24gLmxhdGV4LWJsb2NrIGltZyB7XG5cdFx0XHRcdFx0XHRmaWx0ZXI6IGJyaWdodG5lc3MoMCkgaW52ZXJ0KDEpXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciAubWFya3VwID4gZGl2Lm5iLXN5bWJvbEhpZ2hsaWdodCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS10aGVtZS1ub3RlYm9vay1zeW1ib2wtaGlnaGxpZ2h0LWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLm1hcmt1cCA+IGRpdi5uYi1pbnNlcnRIaWdobGlnaHQge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWRpZmZFZGl0b3ItaW5zZXJ0ZWRMaW5lQmFja2dyb3VuZCwgdmFyKC0tdnNjb2RlLWRpZmZFZGl0b3ItaW5zZXJ0ZWRUZXh0QmFja2dyb3VuZCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLm5iLXN5bWJvbEhpZ2hsaWdodCAub3V0cHV0X2NvbnRhaW5lciAub3V0cHV0IHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXRoZW1lLW5vdGVib29rLXN5bWJvbC1oaWdobGlnaHQtYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciAubWFya3VwID4gZGl2Lm5iLW11bHRpQ2VsbEhpZ2hsaWdodCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS10aGVtZS1ub3RlYm9vay1zeW1ib2wtaGlnaGxpZ2h0LWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLm5iLW11bHRpQ2VsbEhpZ2hsaWdodCAub3V0cHV0X2NvbnRhaW5lciAub3V0cHV0IHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXRoZW1lLW5vdGVib29rLXN5bWJvbC1oaWdobGlnaHQtYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciAubmItY2hhdEdlbmVyYXRpb25IaWdobGlnaHQgLm91dHB1dF9jb250YWluZXIgLm91dHB1dCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2stc2VsZWN0ZWRDZWxsQmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciA+IGRpdi5uYi1jZWxsRGVsZXRlZCAub3V0cHV0X2NvbnRhaW5lciB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS10aGVtZS1ub3RlYm9vay1kaWZmLXJlbW92ZWQtYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciA+IGRpdi5uYi1jZWxsQWRkZWQgLm91dHB1dF9jb250YWluZXIge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdGhlbWUtbm90ZWJvb2stZGlmZi1pbnNlcnRlZC1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyID4gZGl2ID4gZGl2Om5vdCgucHJldmlldykgPiBkaXYge1xuXHRcdFx0XHRcdFx0b3ZlcmZsb3cteDogYXV0bztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5uby1yZW5kZXJlci1lcnJvciB7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvckVycm9yLWZvcmVncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJvZHkge1xuXHRcdFx0XHRcdFx0cGFkZGluZzogMHB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxMDAlO1xuXHRcdFx0XHRcdFx0d2lkdGg6IDEwMCU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGFibGUsIHRoZWFkLCB0ciwgdGgsIHRkLCB0Ym9keSB7XG5cdFx0XHRcdFx0XHRib3JkZXI6IG5vbmU7XG5cdFx0XHRcdFx0XHRib3JkZXItY29sb3I6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXNwYWNpbmc6IDA7XG5cdFx0XHRcdFx0XHRib3JkZXItY29sbGFwc2U6IGNvbGxhcHNlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRhYmxlLCB0aCwgdHIge1xuXHRcdFx0XHRcdFx0dmVydGljYWwtYWxpZ246IG1pZGRsZTtcblx0XHRcdFx0XHRcdHRleHQtYWxpZ246IHJpZ2h0O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoZWFkIHtcblx0XHRcdFx0XHRcdGZvbnQtd2VpZ2h0OiBib2xkO1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogcmdiYSgxMzAsIDEzMCwgMTMwLCAwLjE2KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aCwgdGQge1xuXHRcdFx0XHRcdFx0cGFkZGluZzogNHB4IDhweDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cjpudGgtY2hpbGQoZXZlbikge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogcmdiYSgxMzAsIDEzMCwgMTMwLCAwLjA4KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0Ym9keSB0aCB7XG5cdFx0XHRcdFx0XHRmb250LXdlaWdodDogbm9ybWFsO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC5maW5kLW1hdGNoIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3ItZmluZE1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0LmN1cnJlbnQtZmluZC1tYXRjaCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZpbmRNYXRjaEJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNfZGVmYXVsdENvbG9yUGFsYXR0ZSB7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1maW5kTWF0Y2hIaWdobGlnaHRCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3ItZmluZE1hdGNoQmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQ8L3N0eWxlPlxuXHRcdFx0PC9oZWFkPlxuXHRcdFx0PGJvZHkgc3R5bGU9XCJvdmVyZmxvdzogaGlkZGVuO1wiPlxuXHRcdFx0XHQ8ZGl2IGlkPSdmaW5kU3RhcnQnIHRhYkluZGV4PS0xPjwvZGl2PlxuXHRcdFx0XHQ8ZGl2IGlkPSdjb250YWluZXInIGNsYXNzPVwid2lkZ2V0YXJlYVwiIHN0eWxlPVwicG9zaXRpb246IGFic29sdXRlO3dpZHRoOjEwMCU7dG9wOiAwcHhcIj48L2Rpdj5cblx0XHRcdFx0PGRpdiBpZD1cIl9kZWZhdWx0Q29sb3JQYWxhdHRlXCI+PC9kaXY+XG5cdFx0XHRcdDxzY3JpcHQgdHlwZT1cIm1vZHVsZVwiPiR7cHJlbG9hZFNjcmlwdH08L3NjcmlwdD5cblx0XHRcdDwvYm9keT5cblx0XHQ8L2h0bWw+YDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVuZGVyZXJEYXRhKCk6IFJlbmRlcmVyTWV0YWRhdGFbXSB7XG5cdFx0cmV0dXJuIHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldFJlbmRlcmVycygpLm1hcCgocmVuZGVyZXIpOiBSZW5kZXJlck1ldGFkYXRhID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5cG9pbnQgPSB7XG5cdFx0XHRcdGV4dGVuZHM6IHJlbmRlcmVyLmVudHJ5cG9pbnQuZXh0ZW5kcyxcblx0XHRcdFx0cGF0aDogdGhpcy5hc1dlYnZpZXdVcmkocmVuZGVyZXIuZW50cnlwb2ludC5wYXRoLCByZW5kZXJlci5leHRlbnNpb25Mb2NhdGlvbikudG9TdHJpbmcoKVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiByZW5kZXJlci5pZCxcblx0XHRcdFx0ZW50cnlwb2ludCxcblx0XHRcdFx0bWltZVR5cGVzOiByZW5kZXJlci5taW1lVHlwZXMsXG5cdFx0XHRcdG1lc3NhZ2luZzogcmVuZGVyZXIubWVzc2FnaW5nICE9PSBSZW5kZXJlck1lc3NhZ2luZ1NwZWMuTmV2ZXIgJiYgISF0aGlzLnJlbmRlcmVyTWVzc2FnaW5nLFxuXHRcdFx0XHRpc0J1aWx0aW46IHJlbmRlcmVyLmlzQnVpbHRpblxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RhdGljUHJlbG9hZHNEYXRhKCk6IFN0YXRpY1ByZWxvYWRNZXRhZGF0YVtdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLm5vdGVib29rU2VydmljZS5nZXRTdGF0aWNQcmVsb2Fkcyh0aGlzLm5vdGVib29rVmlld1R5cGUpLCBwcmVsb2FkID0+IHtcblx0XHRcdHJldHVybiB7IGVudHJ5cG9pbnQ6IHRoaXMuYXNXZWJ2aWV3VXJpKHByZWxvYWQuZW50cnlwb2ludCwgcHJlbG9hZC5leHRlbnNpb25Mb2NhdGlvbikudG9TdHJpbmcoKS50b1N0cmluZygpIH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzV2Vidmlld1VyaSh1cmk6IFVSSSwgZnJvbUV4dGVuc2lvbjogVVJJIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGFzV2Vidmlld1VyaSh1cmksIGZyb21FeHRlbnNpb24/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUgPyB7IGlzUmVtb3RlOiB0cnVlLCBhdXRob3JpdHk6IGZyb21FeHRlbnNpb24uYXV0aG9yaXR5IH0gOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cG9zdEtlcm5lbE1lc3NhZ2UobWVzc2FnZTogYW55KSB7XG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0X192c2NvZGVfbm90ZWJvb2tfbWVzc2FnZTogdHJ1ZSxcblx0XHRcdHR5cGU6ICdjdXN0b21LZXJuZWxNZXNzYWdlJyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVPdXRwdXRJZChpZDogc3RyaW5nKTogeyBjZWxsSW5mbzogVDsgb3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvdXRwdXQgPSB0aGlzLnJldmVyc2VkSW5zZXRNYXBwaW5nLmdldChpZCk7XG5cdFx0aWYgKCFvdXRwdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsSW5mbyA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQpIS5jZWxsSW5mbztcblx0XHRyZXR1cm4geyBjZWxsSW5mbywgb3V0cHV0IH07XG5cdH1cblxuXHRpc1Jlc29sdmVkKCk6IHRoaXMgaXMgSVJlc29sdmVkQmFja0xheWVyV2VidmlldyB7XG5cdFx0cmV0dXJuICEhdGhpcy53ZWJ2aWV3O1xuXHR9XG5cblx0Y3JlYXRlV2Vidmlldyh0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiYXNlVXJsID0gdGhpcy5hc1dlYnZpZXdVcmkodGhpcy5nZXROb3RlYm9va0Jhc2VVcmkoKSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBodG1sQ29udGVudCA9IHRoaXMuZ2VuZXJhdGVDb250ZW50KGJhc2VVcmwudG9TdHJpbmcoKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxpemUoaHRtbENvbnRlbnQsIHRhcmdldFdpbmRvdyk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5vdGVib29rQmFzZVVyaSgpIHtcblx0XHRpZiAodGhpcy5kb2N1bWVudFVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdGNvbnN0IGZvbGRlciA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHRoaXMuZG9jdW1lbnRVcmkpO1xuXHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gZm9sZGVyLnVyaTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZm9sZGVyc1swXS51cmk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpcm5hbWUodGhpcy5kb2N1bWVudFVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEJ1aWx0aW5Mb2NhbFJlc291cmNlUm9vdHMoKTogVVJJW10ge1xuXHRcdC8vIFB5dGhvbiBub3RlYm9va3MgYXNzdW1lIHRoYXQgcmVxdWlyZWpzIGlzIGEgZ2xvYmFsLlxuXHRcdC8vIEZvciBhbGwgb3RoZXIgbm90ZWJvb2tzLCB0aGV5IG5lZWQgdG8gcHJvdmlkZSB0aGVpciBvd24gbG9hZGVyLlxuXHRcdGlmICghdGhpcy5kb2N1bWVudFVyaS5wYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoJy5pcHluYicpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIHNjcmlwdCBpcyBpbmxpbmVkXG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtcblx0XHRcdGRpcm5hbWUoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL25scy5qcycpKSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdGlhbGl6ZShjb250ZW50OiBzdHJpbmcsIHRhcmdldFdpbmRvdzogQ29kZVdpbmRvdyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZ2V0V2luZG93KHRoaXMuZWxlbWVudCkuZG9jdW1lbnQuYm9keS5jb250YWlucyh0aGlzLmVsZW1lbnQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VsZW1lbnQgaXMgYWxyZWFkeSBkZXRhY2hlZCBmcm9tIHRoZSBET00gdHJlZScpO1xuXHRcdH1cblxuXHRcdHRoaXMud2VidmlldyA9IHRoaXMuX2NyZWF0ZUluc2V0KHRoaXMud2Vidmlld1NlcnZpY2UsIGNvbnRlbnQpO1xuXHRcdHRoaXMud2Vidmlldy5tb3VudFRvKHRoaXMuZWxlbWVudCwgdGFyZ2V0V2luZG93KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndlYnZpZXcpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IFdlYnZpZXdXaW5kb3dEcmFnTW9uaXRvcih0YXJnZXRXaW5kb3csICgpID0+IHRoaXMud2VidmlldykpO1xuXG5cdFx0Y29uc3QgaW5pdGlhbGl6ZVByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndlYnZpZXcub25GYXRhbEVycm9yKGUgPT4ge1xuXHRcdFx0aW5pdGlhbGl6ZVByb21pc2UuZXJyb3IobmV3IEVycm9yKGBDb3VsZCBub3QgaW5pdGlhbGl6ZSB3ZWJ2aWV3OiAke2UubWVzc2FnZX19YCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2Vidmlldy5vbk1lc3NhZ2UoYXN5bmMgKG1lc3NhZ2UpID0+IHtcblx0XHRcdGNvbnN0IGRhdGE6IEZyb21XZWJ2aWV3TWVzc2FnZSB8IHsgcmVhZG9ubHkgX192c2NvZGVfbm90ZWJvb2tfbWVzc2FnZTogdW5kZWZpbmVkIH0gPSBtZXNzYWdlLm1lc3NhZ2U7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWRhdGEuX192c2NvZGVfbm90ZWJvb2tfbWVzc2FnZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAoZGF0YS50eXBlKSB7XG5cdFx0XHRcdGNhc2UgJ2luaXRpYWxpemVkJzoge1xuXHRcdFx0XHRcdGluaXRpYWxpemVQcm9taXNlLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0dGhpcy5pbml0aWFsaXplV2ViVmlld1N0YXRlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnaW5pdGlhbGl6ZWRNYXJrdXAnOiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaW5pdGlhbGl6ZU1hcmt1cFByb21pc2U/LnJlcXVlc3RJZCA9PT0gZGF0YS5yZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5pdGlhbGl6ZU1hcmt1cFByb21pc2U/LnAuY29tcGxldGUoKTtcblx0XHRcdFx0XHRcdHRoaXMuaW5pdGlhbGl6ZU1hcmt1cFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2RpbWVuc2lvbic6IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHVwZGF0ZSBvZiBkYXRhLnVwZGF0ZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGhlaWdodCA9IHVwZGF0ZS5oZWlnaHQ7XG5cdFx0XHRcdFx0XHRpZiAodXBkYXRlLmlzT3V0cHV0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkUmVzdWx0ID0gdGhpcy5yZXNvbHZlT3V0cHV0SWQodXBkYXRlLmlkKTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlc29sdmVkUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgeyBjZWxsSW5mbywgb3V0cHV0IH0gPSByZXNvbHZlZFJlc3VsdDtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnVwZGF0ZU91dHB1dEhlaWdodChjZWxsSW5mbywgb3V0cHV0LCBoZWlnaHQsICEhdXBkYXRlLmluaXQsICd3ZWJ2aWV3I2RpbWVuc2lvbicpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3Iuc2NoZWR1bGVPdXRwdXRIZWlnaHRBY2soY2VsbEluZm8sIHVwZGF0ZS5pZCwgaGVpZ2h0KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmICh1cGRhdGUuaW5pdCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIG1pZ2h0IGJlIGlkbGUgcmVuZGVyIHJlcXVlc3QncyBhY2tcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBvdXRwdXRSZXF1ZXN0ID0gdGhpcy5yZXZlcnNlZFBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5nZXQodXBkYXRlLmlkKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAob3V0cHV0UmVxdWVzdCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgaW5zZXQgPSB0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5nZXQob3V0cHV0UmVxdWVzdCkhO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBjbGVhciB0aGUgcGVuZGluZyBtYXBwaW5nXG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5kZWxldGUob3V0cHV0UmVxdWVzdCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5kZWxldGUob3V0cHV0UmVxdWVzdCk7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNlbGxJbmZvID0gaW5zZXQuY2VsbEluZm87XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnJldmVyc2VkSW5zZXRNYXBwaW5nLnNldCh1cGRhdGUuaWQsIG91dHB1dFJlcXVlc3QpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5pbnNldE1hcHBpbmcuc2V0KG91dHB1dFJlcXVlc3QsIGluc2V0KTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IudXBkYXRlT3V0cHV0SGVpZ2h0KGNlbGxJbmZvLCBvdXRwdXRSZXF1ZXN0LCBoZWlnaHQsICEhdXBkYXRlLmluaXQsICd3ZWJ2aWV3I2RpbWVuc2lvbicpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5zY2hlZHVsZU91dHB1dEhlaWdodEFjayhjZWxsSW5mbywgdXBkYXRlLmlkLCBoZWlnaHQpO1xuXG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5yZXZlcnNlZFBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5kZWxldGUodXBkYXRlLmlkKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIXVwZGF0ZS5pbml0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBvdXRwdXQgPSB0aGlzLnJldmVyc2VkSW5zZXRNYXBwaW5nLmdldCh1cGRhdGUuaWQpO1xuXG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFvdXRwdXQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGluc2V0ID0gdGhpcy5pbnNldE1hcHBpbmcuZ2V0KG91dHB1dCkhO1xuXHRcdFx0XHRcdFx0XHRcdGluc2V0LmluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci51cGRhdGVNYXJrdXBDZWxsSGVpZ2h0KHVwZGF0ZS5pZCwgaGVpZ2h0LCAhIXVwZGF0ZS5pbml0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbW91c2VlbnRlcic6IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFJlc3VsdCA9IHRoaXMucmVzb2x2ZU91dHB1dElkKGRhdGEuaWQpO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZFJlc3VsdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGF0ZXN0Q2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SW5mbyhyZXNvbHZlZFJlc3VsdC5jZWxsSW5mbyk7XG5cdFx0XHRcdFx0XHRpZiAobGF0ZXN0Q2VsbCkge1xuXHRcdFx0XHRcdFx0XHRsYXRlc3RDZWxsLm91dHB1dElzSG92ZXJlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ21vdXNlbGVhdmUnOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQgPSB0aGlzLnJlc29sdmVPdXRwdXRJZChkYXRhLmlkKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWRSZXN1bHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdGVzdENlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUluZm8ocmVzb2x2ZWRSZXN1bHQuY2VsbEluZm8pO1xuXHRcdFx0XHRcdFx0aWYgKGxhdGVzdENlbGwpIHtcblx0XHRcdFx0XHRcdFx0bGF0ZXN0Q2VsbC5vdXRwdXRJc0hvdmVyZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb3V0cHV0Rm9jdXMnOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQgPSB0aGlzLnJlc29sdmVPdXRwdXRJZChkYXRhLmlkKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWRSZXN1bHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdGVzdENlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUluZm8ocmVzb2x2ZWRSZXN1bHQuY2VsbEluZm8pO1xuXHRcdFx0XHRcdFx0aWYgKGxhdGVzdENlbGwpIHtcblx0XHRcdFx0XHRcdFx0bGF0ZXN0Q2VsbC5vdXRwdXRJc0ZvY3VzZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGxhdGVzdENlbGwsICdvdXRwdXQnLCB7IG91dHB1dElkOiByZXNvbHZlZFJlc3VsdC5vdXRwdXQubW9kZWwub3V0cHV0SWQsIHNraXBSZXZlYWw6IHRydWUsIG91dHB1dFdlYnZpZXdGb2N1c2VkOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdvdXRwdXRCbHVyJzoge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkUmVzdWx0ID0gdGhpcy5yZXNvbHZlT3V0cHV0SWQoZGF0YS5pZCk7XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVkUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXRlc3RDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJbmZvKHJlc29sdmVkUmVzdWx0LmNlbGxJbmZvKTtcblx0XHRcdFx0XHRcdGlmIChsYXRlc3RDZWxsKSB7XG5cdFx0XHRcdFx0XHRcdGxhdGVzdENlbGwub3V0cHV0SXNGb2N1c2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGxhdGVzdENlbGwuaW5wdXRJbk91dHB1dElzRm9jdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdzY3JvbGwtYWNrJzoge1xuXHRcdFx0XHRcdC8vIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuXHRcdFx0XHRcdC8vIGNvbnN0IHRvcCA9IGRhdGEuZGF0YS50b3A7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ2FjayB0b3AgJywgdG9wLCAnIHZlcnNpb246ICcsIGRhdGEudmVyc2lvbiwgJyAtICcsIGRhdGUuZ2V0TWludXRlcygpICsgJzonICsgZGF0ZS5nZXRTZWNvbmRzKCkgKyAnOicgKyBkYXRlLmdldE1pbGxpc2Vjb25kcygpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdzY3JvbGwtdG8tcmV2ZWFsJzoge1xuXHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3Iuc2V0U2Nyb2xsVG9wKGRhdGEuc2Nyb2xsVG9wIC0gTk9URUJPT0tfV0VCVklFV19CT1VOREFSWSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnZGlkLXNjcm9sbC13aGVlbCc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnRyaWdnZXJTY3JvbGwoe1xuXHRcdFx0XHRcdFx0Li4uZGF0YS5wYXlsb2FkLFxuXHRcdFx0XHRcdFx0cHJldmVudERlZmF1bHQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRcdHN0b3BQcm9wYWdhdGlvbjogKCkgPT4geyB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnZm9jdXMtZWRpdG9yJzoge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUlkKGRhdGEuY2VsbElkKTtcblx0XHRcdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRcdFx0aWYgKGRhdGEuZm9jdXNOZXh0KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOZXh0Tm90ZWJvb2tDZWxsKGNlbGwsICdlZGl0b3InKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2VkaXRvcicpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdjbGlja2VkLWRhdGEtdXJsJzoge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2tEYXRhTGluayhkYXRhKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdjbGlja2VkLWxpbmsnOiB7XG5cdFx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUoZGF0YS5ocmVmLCBTY2hlbWFzLmNvbW1hbmQpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoZGF0YS5ocmVmKTtcblxuXHRcdFx0XHRcdFx0aWYgKHVyaS5wYXRoID09PSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuTGFyZ2VPdXRwdXQnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG91dHB1dElkID0gdXJpLnF1ZXJ5O1xuXHRcdFx0XHRcdFx0XHRjb25zdCBncm91cCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdFx0XHRcdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoZ3JvdXAuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRncm91cC5waW5FZGl0b3IoZ3JvdXAuYWN0aXZlRWRpdG9yKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihDZWxsVXJpLmdlbmVyYXRlQ2VsbE91dHB1dFVyaVdpdGhJZCh0aGlzLmRvY3VtZW50VXJpLCBvdXRwdXRJZCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodXJpLnBhdGggPT09ICdjZWxsT3V0cHV0LmVuYWJsZVNjcm9sbGluZycpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3V0cHV0SWQgPSB1cmkucXVlcnk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLnJldmVyc2VkSW5zZXRNYXBwaW5nLmdldChvdXRwdXRJZCk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPlxuXHRcdFx0XHRcdFx0XHRcdFx0KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6ICdub3RlYm9vay5jZWxsLnRvZ2dsZU91dHB1dFNjcm9sbGluZycsIGZyb206ICdpbmxpbmVMaW5rJyB9KTtcblxuXHRcdFx0XHRcdFx0XHRcdGNlbGwuY2VsbFZpZXdNb2RlbC5vdXRwdXRzVmlld01vZGVscy5mb3JFYWNoKCh2bSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHZtLm1vZGVsLm1ldGFkYXRhKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHZtLm1vZGVsLm1ldGFkYXRhWydzY3JvbGxhYmxlJ10gPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR2bS5yZXNldFJlbmRlcmVyKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFdlIGFsbG93IGEgdmVyeSBsaW1pdGVkIHNldCBvZiBjb21tYW5kc1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oZGF0YS5ocmVmLCB7XG5cdFx0XHRcdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0ZnJvbVdvcmtzcGFjZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0YWxsb3dDb21tYW5kczogW1xuXHRcdFx0XHRcdFx0XHRcdCdnaXRodWItaXNzdWVzLmF1dGhOb3cnLFxuXHRcdFx0XHRcdFx0XHRcdCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2gnLFxuXHRcdFx0XHRcdFx0XHRcdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsXG5cdFx0XHRcdFx0XHRcdFx0J19ub3RlYm9vay5zZWxlY3RLZXJuZWwnLFxuXHRcdFx0XHRcdFx0XHRcdC8vIFRPRE9AcmVib3JuaXggZXhwbG9yZSBvcGVuIG91dHB1dCBjaGFubmVsIHdpdGggbmFtZSBjb21tYW5kXG5cdFx0XHRcdFx0XHRcdFx0J2p1cHl0ZXIudmlld091dHB1dCcsXG5cdFx0XHRcdFx0XHRcdFx0J2p1cHl0ZXIuY3JlYXRlUHl0aG9uRW52QW5kU2VsZWN0Q29udHJvbGxlcicsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAobWF0Y2hlc1NvbWVTY2hlbWUoZGF0YS5ocmVmLCBTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMsIFNjaGVtYXMubWFpbHRvKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oZGF0YS5ocmVmLCB7IGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSwgZnJvbVdvcmtzcGFjZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKG1hdGNoZXNTY2hlbWUoZGF0YS5ocmVmLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShkYXRhLmhyZWYpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlTm90ZWJvb2tDZWxsUmVzb3VyY2UodXJpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCEvXltcXHdcXC1dKzovLnRlc3QoZGF0YS5ocmVmKSkge1xuXHRcdFx0XHRcdFx0Ly8gVXJpIHdpdGhvdXQgc2NoZW1lLCBzdWNoIGFzIGEgZmlsZSBwYXRoXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVSZXNvdXJjZU9wZW5pbmcodHJ5RGVjb2RlVVJJQ29tcG9uZW50KGRhdGEuaHJlZikpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyB1cmkgd2l0aCBzY2hlbWVcblx0XHRcdFx0XHRcdGlmIChvc1BhdGguaXNBYnNvbHV0ZShkYXRhLmhyZWYpKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX29wZW5VcmkoVVJJLmZpbGUoZGF0YS5ocmVmKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9vcGVuVXJpKFVSSS5wYXJzZShkYXRhLmhyZWYpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY3VzdG9tS2VybmVsTWVzc2FnZSc6IHtcblx0XHRcdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZSh7IG1lc3NhZ2U6IGRhdGEubWVzc2FnZSB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdjdXN0b21SZW5kZXJlck1lc3NhZ2UnOiB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJlck1lc3NhZ2luZz8ucG9zdE1lc3NhZ2UoZGF0YS5yZW5kZXJlcklkLCBkYXRhLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2NsaWNrTWFya3VwQ2VsbCc6IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJZChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRcdGlmIChkYXRhLnNoaWZ0S2V5IHx8IChpc01hY2ludG9zaCA/IGRhdGEubWV0YUtleSA6IGRhdGEuY3RybEtleSkpIHtcblx0XHRcdFx0XHRcdFx0Ly8gTW9kaWZ5IHNlbGVjdGlvblxuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnRvZ2dsZU5vdGVib29rQ2VsbFNlbGVjdGlvbihjZWxsLCAvKiBmcm9tUHJldmlvdXMgKi8gZGF0YS5zaGlmdEtleSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBOb3JtYWwgY2xpY2tcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjZWxsLCAnY29udGFpbmVyJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdjb250ZXh0TWVudU1hcmt1cENlbGwnOiB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SWQoZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0XHQvLyBGb2N1cyB0aGUgY2VsbCBmaXJzdFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjZWxsLCAnY29udGFpbmVyJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXG5cdFx0XHRcdFx0XHQvLyBUaGVuIHNob3cgdGhlIGNvbnRleHQgbWVudVxuXHRcdFx0XHRcdFx0Y29uc3Qgd2Vidmlld1JlY3QgPSB0aGlzLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHR4OiB3ZWJ2aWV3UmVjdC54ICsgZGF0YS5jbGllbnRYLFxuXHRcdFx0XHRcdFx0XHRcdHk6IHdlYnZpZXdSZWN0LnkgKyBkYXRhLmNsaWVudFlcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICd0b2dnbGVNYXJrdXBQcmV2aWV3Jzoge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUlkKGRhdGEuY2VsbElkKTtcblx0XHRcdFx0XHRpZiAoY2VsbCAmJiAhdGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMuaXNSZWFkT25seSkge1xuXHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5zZXRNYXJrdXBDZWxsRWRpdFN0YXRlKGRhdGEuY2VsbElkLCBDZWxsRWRpdFN0YXRlLkVkaXRpbmcpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjZWxsLCAnZWRpdG9yJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdtb3VzZUVudGVyTWFya3VwQ2VsbCc6IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJZChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBNYXJrdXBDZWxsVmlld01vZGVsKSB7XG5cdFx0XHRcdFx0XHRjZWxsLmNlbGxJc0hvdmVyZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdtb3VzZUxlYXZlTWFya3VwQ2VsbCc6IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJZChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBNYXJrdXBDZWxsVmlld01vZGVsKSB7XG5cdFx0XHRcdFx0XHRjZWxsLmNlbGxJc0hvdmVyZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY2VsbC1kcmFnLXN0YXJ0Jzoge1xuXHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZGlkU3RhcnREcmFnTWFya3VwQ2VsbChkYXRhLmNlbGxJZCwgZGF0YSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY2VsbC1kcmFnJzoge1xuXHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZGlkRHJhZ01hcmt1cENlbGwoZGF0YS5jZWxsSWQsIGRhdGEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2NlbGwtZHJvcCc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmRpZERyb3BNYXJrdXBDZWxsKGRhdGEuY2VsbElkLCB7XG5cdFx0XHRcdFx0XHRkcmFnT2Zmc2V0WTogZGF0YS5kcmFnT2Zmc2V0WSxcblx0XHRcdFx0XHRcdGN0cmxLZXk6IGRhdGEuY3RybEtleSxcblx0XHRcdFx0XHRcdGFsdEtleTogZGF0YS5hbHRLZXksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY2VsbC1kcmFnLWVuZCc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmRpZEVuZERyYWdNYXJrdXBDZWxsKGRhdGEuY2VsbElkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdyZW5kZXJlZE1hcmt1cCc6IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJZChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBNYXJrdXBDZWxsVmlld01vZGVsKSB7XG5cdFx0XHRcdFx0XHRjZWxsLnJlbmRlcmVkSHRtbCA9IGRhdGEuaHRtbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVIaWdobGlnaHRDb2RlQmxvY2soZGF0YS5jb2RlQmxvY2tzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdyZW5kZXJlZENlbGxPdXRwdXQnOiB7XG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlSGlnaGxpZ2h0Q29kZUJsb2NrKGRhdGEuY29kZUJsb2Nrcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb3V0cHV0UmVzaXplZCc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmRpZFJlc2l6ZU91dHB1dChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnZ2V0T3V0cHV0SXRlbSc6IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFJlc3VsdCA9IHRoaXMucmVzb2x2ZU91dHB1dElkKGRhdGEub3V0cHV0SWQpO1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dCA9IHJlc29sdmVkUmVzdWx0Py5vdXRwdXQubW9kZWwub3V0cHV0cy5maW5kKG91dHB1dCA9PiBvdXRwdXQubWltZSA9PT0gZGF0YS5taW1lKTtcblxuXHRcdFx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0XHRcdHR5cGU6ICdyZXR1cm5PdXRwdXRJdGVtJyxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogZGF0YS5yZXF1ZXN0SWQsXG5cdFx0XHRcdFx0XHRvdXRwdXQ6IG91dHB1dCA/IHsgbWltZTogb3V0cHV0Lm1pbWUsIHZhbHVlQnl0ZXM6IG91dHB1dC5kYXRhLmJ1ZmZlciB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2xvZ1JlbmRlcmVyRGVidWdNZXNzYWdlJzoge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1JlbmRlcmVyRGVidWdNZXNzYWdlKGAke2RhdGEubWVzc2FnZX0ke2RhdGEuZGF0YSA/ICcgJyArIEpTT04uc3RyaW5naWZ5KGRhdGEuZGF0YSwgbnVsbCwgNCkgOiAnJ31gKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdub3RlYm9va1BlcmZvcm1hbmNlTWVzc2FnZSc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnVwZGF0ZVBlcmZvcm1hbmNlTWV0YWRhdGEoZGF0YS5jZWxsSWQsIGRhdGEuZXhlY3V0aW9uSWQsIGRhdGEuZHVyYXRpb24sIGRhdGEucmVuZGVyZXJJZCk7XG5cdFx0XHRcdFx0aWYgKGRhdGEub3V0cHV0U2l6ZSAmJiBkYXRhLnJlbmRlcmVySWQgPT09ICd2c2NvZGUuYnVpbHRpbi1yZW5kZXJlcicpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NlbmRQZXJmb3JtYW5jZURhdGEoZGF0YS5vdXRwdXRTaXplLCBkYXRhLmR1cmF0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb3V0cHV0SW5wdXRGb2N1cyc6IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFJlc3VsdCA9IHRoaXMucmVzb2x2ZU91dHB1dElkKGRhdGEuaWQpO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZFJlc3VsdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGF0ZXN0Q2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SW5mbyhyZXNvbHZlZFJlc3VsdC5jZWxsSW5mbyk7XG5cdFx0XHRcdFx0XHRpZiAobGF0ZXN0Q2VsbCkge1xuXHRcdFx0XHRcdFx0XHRsYXRlc3RDZWxsLmlucHV0SW5PdXRwdXRJc0ZvY3VzZWQgPSBkYXRhLmlucHV0Rm9jdXNlZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5kaWRGb2N1c091dHB1dElucHV0Q2hhbmdlKGRhdGEuaW5wdXRGb2N1c2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBpbml0aWFsaXplUHJvbWlzZS5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFBlcmZvcm1hbmNlRGF0YShvdXRwdXRTaXplOiBudW1iZXIsIHJlbmRlclRpbWU6IG51bWJlcikge1xuXHRcdHR5cGUgTm90ZWJvb2tPdXRwdXRSZW5kZXJDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYW11bmdlcic7XG5cdFx0XHRjb21tZW50OiAnVHJhY2sgcGVyZm9ybWFuY2UgZGF0YSBmb3Igb3V0cHV0IHJlbmRlcmluZyc7XG5cdFx0XHRvdXRwdXRTaXplOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnU2l6ZSBvZiB0aGUgb3V0cHV0IGRhdGEgYnVmZmVyLic7IGlzTWVhc3VyZW1lbnQ6IHRydWUgfTtcblx0XHRcdHJlbmRlclRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaW1lIHNwZW50IHJlbmRlcmluZyBvdXRwdXQuJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdH07XG5cblx0XHR0eXBlIE5vdGVib29rT3V0cHV0UmVuZGVyRXZlbnQgPSB7XG5cdFx0XHRvdXRwdXRTaXplOiBudW1iZXI7XG5cdFx0XHRyZW5kZXJUaW1lOiBudW1iZXI7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlbGVtZXRyeURhdGEgPSB7XG5cdFx0XHRvdXRwdXRTaXplLFxuXHRcdFx0cmVuZGVyVGltZVxuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxOb3RlYm9va091dHB1dFJlbmRlckV2ZW50LCBOb3RlYm9va091dHB1dFJlbmRlckNsYXNzaWZpY2F0aW9uPignTm90ZWJvb2tDZWxsT3V0cHV0UmVuZGVyJywgdGVsZW1ldHJ5RGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVOb3RlYm9va0NlbGxSZXNvdXJjZSh1cmk6IFVSSSkge1xuXHRcdGNvbnN0IG5vdGVib29rUmVzb3VyY2UgPSB1cmkucGF0aC5sZW5ndGggPiAwID8gdXJpIDogdGhpcy5kb2N1bWVudFVyaTtcblxuXHRcdGNvbnN0IGxpbmVNYXRjaCA9IC8oPzpefCYpbGluZT0oW14mXSspLy5leGVjKHVyaS5xdWVyeSk7XG5cdFx0bGV0IGVkaXRvck9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAobGluZU1hdGNoKSB7XG5cdFx0XHRjb25zdCBwYXJzZWRMaW5lTnVtYmVyID0gcGFyc2VJbnQobGluZU1hdGNoWzFdLCAxMCk7XG5cdFx0XHRpZiAoIWlzTmFOKHBhcnNlZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwYXJzZWRMaW5lTnVtYmVyO1xuXG5cdFx0XHRcdGVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7IHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlciwgc3RhcnRDb2x1bW46IDEgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGlvbk1hdGNoID0gLyg/Ol58JilleGVjdXRpb25fY291bnQ9KFteJl0rKS8uZXhlYyh1cmkucXVlcnkpO1xuXHRcdGlmIChleGVjdXRpb25NYXRjaCkge1xuXHRcdFx0Y29uc3QgZXhlY3V0aW9uQ291bnQgPSBwYXJzZUludChleGVjdXRpb25NYXRjaFsxXSwgMTApO1xuXHRcdFx0aWYgKCFpc05hTihleGVjdXRpb25Db3VudCkpIHtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tNb2RlbCA9IHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKG5vdGVib29rUmVzb3VyY2UpO1xuXHRcdFx0XHQvLyBtdWx0aXBsZSBjZWxscyB3aXRoIHRoZSBzYW1lIGV4ZWN1dGlvbiBjb3VudCBjYW4gZXhpc3QgaWYgdGhlIGtlcm5lbCBpcyByZXN0YXJ0ZWRcblx0XHRcdFx0Ly8gc28gbG9vayBmb3IgdGhlIG1vc3QgcmVjZW50bHkgYWRkZWQgY2VsbCB3aXRoIHRoZSBtYXRjaGluZyBleGVjdXRpb24gY291bnQuXG5cdFx0XHRcdC8vIFNvbWV3aGF0IG1vcmUgbGlrZWx5IHRvIGJlIGNvcnJlY3QgaW4gbm90ZWJvb2tzLCBhbiBtdWNoIG1vcmUgbGlrZWx5IGZvciB0aGUgaW50ZXJhY3RpdmUgd2luZG93XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBub3RlYm9va01vZGVsPy5jZWxscy5zbGljZSgpLnJldmVyc2UoKS5maW5kKGNlbGwgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBjZWxsLmludGVybmFsTWV0YWRhdGEuZXhlY3V0aW9uT3JkZXIgPT09IGV4ZWN1dGlvbkNvdW50O1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGNlbGw/LnVyaSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihjZWxsLnVyaSwge1xuXHRcdFx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZnJvbVdvcmtzcGFjZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGVkaXRvck9wdGlvbnM6IGVkaXRvck9wdGlvbnNcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVSTHMgYnVpbHQgYnkgdGhlIGp1cHl0ZXIgZXh0ZW5zaW9uIHB1dCB0aGUgbGluZSBxdWVyeSBwYXJhbSBpbiB0aGUgZnJhZ21lbnRcblx0XHQvLyBUaGV5IGFsc28gaGF2ZSB0aGUgY2VsbCBmcmFnbWVudCBwcmUtY2FsY3VsYXRlZFxuXHRcdGNvbnN0IGZyYWdtZW50TGluZU1hdGNoID0gL1xcP2xpbmU9KFxcZCspJC8uZXhlYyh1cmkuZnJhZ21lbnQpO1xuXHRcdGlmIChmcmFnbWVudExpbmVNYXRjaCkge1xuXHRcdFx0Y29uc3QgcGFyc2VkTGluZU51bWJlciA9IHBhcnNlSW50KGZyYWdtZW50TGluZU1hdGNoWzFdLCAxMCk7XG5cdFx0XHRpZiAoIWlzTmFOKHBhcnNlZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwYXJzZWRMaW5lTnVtYmVyICsgMTtcblx0XHRcdFx0Y29uc3QgZnJhZ21lbnQgPSB1cmkuZnJhZ21lbnQuc3Vic3RyaW5nKDAsIGZyYWdtZW50TGluZU1hdGNoLmluZGV4KTtcblxuXHRcdFx0XHQvLyBvcGVuIHRoZSB1cmkgd2l0aCBzZWxlY3Rpb25cblx0XHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRcdHNlbGVjdGlvbjogeyBzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBlbmRDb2x1bW46IDEgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihub3RlYm9va1Jlc291cmNlLndpdGgoeyBmcmFnbWVudCB9KSwge1xuXHRcdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0XHRmcm9tV29ya3NwYWNlOiB0cnVlLFxuXHRcdFx0XHRcdGVkaXRvck9wdGlvbnM6IGVkaXRvck9wdGlvbnNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3BlbmVyU2VydmljZS5vcGVuKG5vdGVib29rUmVzb3VyY2UsIHsgZnJvbVVzZXJHZXN0dXJlOiB0cnVlLCBmcm9tV29ya3NwYWNlOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUmVzb3VyY2VPcGVuaW5nKGhyZWY6IHN0cmluZykge1xuXHRcdGxldCBsaW5rVG9PcGVuOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGZyYWdtZW50OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBTZXBhcmF0ZSBvdXQgdGhlIGZyYWdtZW50IHNvIHRoYXQgdGhlIHN1YnNlcXVlbnQgY2FsbHNcblx0XHQvLyB0byBVUkkuam9pblBhdGgoKSBkb24ndCBVUkwgZW5jb2RlIGl0LiBUaGlzIGFsbG93cyBvcGVuaW5nXG5cdFx0Ly8gbGlua3Mgd2l0aCBib3RoIHBhdGhzIGFuZCBmcmFnbWVudHMuXG5cdFx0Y29uc3QgaHJlZldpdGhGcmFnbWVudCA9IEZSQUdNRU5UX1JFR0VYLmV4ZWMoaHJlZik7XG5cdFx0aWYgKGhyZWZXaXRoRnJhZ21lbnQpIHtcblx0XHRcdGhyZWYgPSBocmVmV2l0aEZyYWdtZW50WzFdO1xuXHRcdFx0ZnJhZ21lbnQgPSBocmVmV2l0aEZyYWdtZW50WzJdO1xuXHRcdH1cblxuXHRcdGlmIChocmVmLnN0YXJ0c1dpdGgoJy8nKSkge1xuXHRcdFx0bGlua1RvT3BlbiA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UuZmlsZVVSSShocmVmKTtcblx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRpZiAoZm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0bGlua1RvT3BlbiA9IGxpbmtUb09wZW4ud2l0aCh7XG5cdFx0XHRcdFx0c2NoZW1lOiBmb2xkZXJzWzBdLnVyaS5zY2hlbWUsXG5cdFx0XHRcdFx0YXV0aG9yaXR5OiBmb2xkZXJzWzBdLnVyaS5hdXRob3JpdHlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChocmVmLnN0YXJ0c1dpdGgoJ34nKSkge1xuXHRcdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0XHRpZiAodXNlckhvbWUpIHtcblx0XHRcdFx0bGlua1RvT3BlbiA9IFVSSS5qb2luUGF0aCh1c2VySG9tZSwgaHJlZi5zdWJzdHJpbmcoMikpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5kb2N1bWVudFVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdFx0aWYgKCFmb2xkZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsaW5rVG9PcGVuID0gVVJJLmpvaW5QYXRoKGZvbGRlcnNbMF0udXJpLCBocmVmKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFJlc29sdmUgcmVsYXRpdmUgdG8gbm90ZWJvb2sgZG9jdW1lbnRcblx0XHRcdFx0bGlua1RvT3BlbiA9IFVSSS5qb2luUGF0aChkaXJuYW1lKHRoaXMuZG9jdW1lbnRVcmkpLCBocmVmKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGlua1RvT3Blbikge1xuXHRcdFx0Ly8gUmUtYXR0YWNoIGZyYWdtZW50IG5vdyB0aGF0IHdlIGhhdmUgdGhlIGZ1bGwgZmlsZSBwYXRoLlxuXHRcdFx0aWYgKGZyYWdtZW50KSB7XG5cdFx0XHRcdGxpbmtUb09wZW4gPSBsaW5rVG9PcGVuLndpdGgoeyBmcmFnbWVudCB9KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX29wZW5VcmkobGlua1RvT3Blbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlblVyaSh1cmk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBsaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbHVtbjogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxpbmVDb2wgPSBMSU5FX0NPTFVNTl9SRUdFWC5leGVjKHVyaS5wYXRoKTtcblx0XHRpZiAobGluZUNvbCkge1xuXHRcdFx0dXJpID0gdXJpLndpdGgoe1xuXHRcdFx0XHRwYXRoOiB1cmkucGF0aC5zbGljZSgwLCBsaW5lQ29sLmluZGV4KSxcblx0XHRcdFx0ZnJhZ21lbnQ6IGBMJHtsaW5lQ29sWzBdLnNsaWNlKDEpfWBcblx0XHRcdH0pO1xuXHRcdFx0bGluZU51bWJlciA9IHBhcnNlSW50KGxpbmVDb2xbMV0sIDEwKTtcblx0XHRcdGNvbHVtbiA9IGxpbmVDb2xbMl0gPyBwYXJzZUludChsaW5lQ29sWzJdLCAxMCkgOiAxO1xuXHRcdH1cblxuXHRcdC8vI3JlZ2lvbiBlcnJvciByZW5kZXJlciBtaWdyYXRpb24sIHJlbW92ZSBvbmNlIGRvbmVcblx0XHRjb25zdCBsaW5lTWF0Y2ggPSBMaW5lUXVlcnlSZWdleC5leGVjKHVyaS5xdWVyeSk7XG5cdFx0aWYgKGxpbmVNYXRjaCkge1xuXHRcdFx0Y29uc3QgcGFyc2VkTGluZU51bWJlciA9IHBhcnNlSW50KGxpbmVNYXRjaFsxXSwgMTApO1xuXHRcdFx0aWYgKCFpc05hTihwYXJzZWRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gcGFyc2VkTGluZU51bWJlciArIDE7XG5cdFx0XHRcdGNvbHVtbiA9IDE7XG5cdFx0XHRcdHVyaSA9IHVyaS53aXRoKHsgZnJhZ21lbnQ6IGBMJHtsaW5lTnVtYmVyfWAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dXJpID0gdXJpLndpdGgoe1xuXHRcdFx0cXVlcnk6IG51bGxcblx0XHR9KTtcblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdGNvbnN0IGV4dHJhY3RlZFNlbGVjdGlvbiA9IGV4dHJhY3RTZWxlY3Rpb24odXJpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBsaW5lTnVtYmVyICE9PSB1bmRlZmluZWQgJiYgY29sdW1uICE9PSB1bmRlZmluZWQgPyB7IHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlciwgc3RhcnRDb2x1bW46IGNvbHVtbiB9IDogZXh0cmFjdGVkU2VsZWN0aW9uLnNlbGVjdGlvbjtcblx0XHRjb25zdCByZXNvdXJjZSA9IGV4dHJhY3RlZFNlbGVjdGlvbi51cmk7XG5cblx0XHRpZiAoIXRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpIHx8IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgZnJvbVVzZXJHZXN0dXJlOiB0cnVlLCBmcm9tV29ya3NwYWNlOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBtYXRjaDogeyBncm91cDogSUVkaXRvckdyb3VwOyBlZGl0b3I6IEVkaXRvcklucHV0IH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcykge1xuXHRcdFx0Y29uc3QgZWRpdG9ySW5wdXQgPSBncm91cC5lZGl0b3JzLmZpbmQoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZSAmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgcmVzb3VyY2UsIHRydWUpKTtcblx0XHRcdGlmIChlZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRtYXRjaCA9IHsgZ3JvdXAsIGVkaXRvcjogZWRpdG9ySW5wdXQgfTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdHNlbGVjdGlvbixcblx0XHRcdHNvdXJjZTogRWRpdG9yT3BlblNvdXJjZS5VU0VSXG5cdFx0fTtcblxuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKFt7XG5cdFx0XHRcdGVkaXRvcjogbWF0Y2guZWRpdG9yLFxuXHRcdFx0XHRvcHRpb25zXG5cdFx0XHR9XSwgbWF0Y2guZ3JvdXAsIHsgdmFsaWRhdGVUcnVzdDogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKFt7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRvcHRpb25zXG5cdFx0XHR9XSwgdW5kZWZpbmVkLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSGlnaGxpZ2h0Q29kZUJsb2NrKGNvZGVCbG9ja3M6IFJlYWRvbmx5QXJyYXk8SUNvZGVCbG9ja0hpZ2hsaWdodFJlcXVlc3Q+KSB7XG5cdFx0Zm9yIChjb25zdCB7IGlkLCB2YWx1ZSwgbGFuZyB9IG9mIGNvZGVCbG9ja3MpIHtcblx0XHRcdC8vIFRoZSBsYW5ndWFnZSBpZCBtYXkgYmUgYSBsYW5ndWFnZSBhbGlhc2VzIChlLmcuanMgaW5zdGVhZCBvZiBqYXZhc2NyaXB0KVxuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShsYW5nKTtcblx0XHRcdGlmICghbGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dG9rZW5pemVUb1N0cmluZyh0aGlzLmxhbmd1YWdlU2VydmljZSwgdmFsdWUsIGxhbmd1YWdlSWQpLnRoZW4oKGh0bWwpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0XHR0eXBlOiAndG9rZW5pemVkQ29kZUJsb2NrJyxcblx0XHRcdFx0XHRodG1sLFxuXHRcdFx0XHRcdGNvZGVCbG9ja0lkOiBpZFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIGFzeW5jIF9vbkRpZENsaWNrRGF0YUxpbmsoZXZlbnQ6IElDbGlja2VkRGF0YVVybE1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIGV2ZW50LmRhdGEgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3NwbGl0U3RhcnQsIHNwbGl0RGF0YV0gPSBldmVudC5kYXRhLnNwbGl0KCc7YmFzZTY0LCcpO1xuXHRcdGlmICghc3BsaXREYXRhIHx8ICFzcGxpdFN0YXJ0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdERpciA9IGV4dG5hbWUodGhpcy5kb2N1bWVudFVyaSkgPT09ICcuaW50ZXJhY3RpdmUnID9cblx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpID8/IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCkgOlxuXHRcdFx0ZGlybmFtZSh0aGlzLmRvY3VtZW50VXJpKTtcblx0XHRsZXQgZGVmYXVsdE5hbWU6IHN0cmluZztcblx0XHRpZiAoZXZlbnQuZG93bmxvYWROYW1lKSB7XG5cdFx0XHRkZWZhdWx0TmFtZSA9IGV2ZW50LmRvd25sb2FkTmFtZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbWltZVR5cGUgPSBzcGxpdFN0YXJ0LnJlcGxhY2UoL15kYXRhOi8sICcnKTtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZUV4dGVuc2lvbiA9IG1pbWVUeXBlICYmIGdldEV4dGVuc2lvbkZvck1pbWVUeXBlKG1pbWVUeXBlKTtcblx0XHRcdGRlZmF1bHROYW1lID0gY2FuZGlkYXRlRXh0ZW5zaW9uID8gYGRvd25sb2FkJHtjYW5kaWRhdGVFeHRlbnNpb259YCA6ICdkb3dubG9hZCc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdFVyaSA9IGpvaW5QYXRoKGRlZmF1bHREaXIsIGRlZmF1bHROYW1lKTtcblx0XHRjb25zdCBuZXdGaWxlVXJpID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHRkZWZhdWx0VXJpXG5cdFx0fSk7XG5cdFx0aWYgKCFuZXdGaWxlVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVmZiA9IGRlY29kZUJhc2U2NChzcGxpdERhdGEpO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG5ld0ZpbGVVcmksIGJ1ZmYpO1xuXHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKG5ld0ZpbGVVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSW5zZXQod2Vidmlld1NlcnZpY2U6IElXZWJ2aWV3U2VydmljZSwgY29udGVudDogc3RyaW5nKSB7XG5cdFx0dGhpcy5sb2NhbFJlc291cmNlUm9vdHNDYWNoZSA9IHRoaXMuX2dldFJlc291cmNlUm9vdHNDYWNoZSgpO1xuXHRcdGNvbnN0IHdlYnZpZXcgPSB3ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3RWxlbWVudCh7XG5cdFx0XHRvcmlnaW46IEJhY2tMYXllcldlYlZpZXcuZ2V0T3JpZ2luU3RvcmUodGhpcy5zdG9yYWdlU2VydmljZSkuZ2V0T3JpZ2luKHRoaXMubm90ZWJvb2tWaWV3VHlwZSwgdW5kZWZpbmVkKSxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3dlYnZpZXcgdGl0bGUnLCBcIk5vdGVib29rIHdlYnZpZXcgY29udGVudFwiKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0cHVycG9zZTogV2Vidmlld0NvbnRlbnRQdXJwb3NlLk5vdGVib29rUmVuZGVyZXIsXG5cdFx0XHRcdGVuYWJsZUZpbmRXaWRnZXQ6IGZhbHNlLFxuXHRcdFx0XHR0cmFuc2Zvcm1Dc3NWYXJpYWJsZXM6IHRyYW5zZm9ybVdlYnZpZXdUaGVtZVZhcnMsXG5cdFx0XHR9LFxuXHRcdFx0Y29udGVudE9wdGlvbnM6IHtcblx0XHRcdFx0YWxsb3dNdWx0aXBsZUFQSUFjcXVpcmU6IHRydWUsXG5cdFx0XHRcdGFsbG93U2NyaXB0czogdHJ1ZSxcblx0XHRcdFx0Zm9yd2FyZFVudHJ1c3RlZEtleXByZXNzRXZlbnRzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZVJvb3RzOiB0aGlzLmxvY2FsUmVzb3VyY2VSb290c0NhY2hlLFxuXHRcdFx0fSxcblx0XHRcdGV4dGVuc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0cHJvdmlkZWRWaWV3VHlwZTogJ25vdGVib29rLm91dHB1dCdcblx0XHR9KTtcblxuXHRcdHdlYnZpZXcuc2V0SHRtbChjb250ZW50KTtcblx0XHR3ZWJ2aWV3LnNldENvbnRleHRLZXlTZXJ2aWNlKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHJldHVybiB3ZWJ2aWV3O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVzb3VyY2VSb290c0NhY2hlKCk6IFVSSVtdIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcCh4ID0+IHgudXJpKTtcblx0XHRjb25zdCBub3RlYm9va0RpciA9IHRoaXMuZ2V0Tm90ZWJvb2tCYXNlVXJpKCk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rUHJvdmlkZXJSZXNvdXJjZVJvb3RzKCksXG5cdFx0XHR0aGlzLm5vdGVib29rU2VydmljZS5nZXRSZW5kZXJlcnMoKS5tYXAoeCA9PiBkaXJuYW1lKHguZW50cnlwb2ludC5wYXRoKSksXG5cdFx0XHQuLi5BcnJheS5mcm9tKHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldFN0YXRpY1ByZWxvYWRzKHRoaXMubm90ZWJvb2tWaWV3VHlwZSksIHggPT4gW1xuXHRcdFx0XHRkaXJuYW1lKHguZW50cnlwb2ludCksXG5cdFx0XHRcdC4uLngubG9jYWxSZXNvdXJjZVJvb3RzLFxuXHRcdFx0XSksXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXJzLFxuXHRcdFx0bm90ZWJvb2tEaXIsXG5cdFx0XHR0aGlzLmdldEJ1aWx0aW5Mb2NhbFJlc291cmNlUm9vdHMoKVxuXHRcdF0uZmxhdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplV2ViVmlld1N0YXRlKCkge1xuXHRcdHRoaXMuX3ByZWxvYWRzQ2FjaGUuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fY3VycmVudEtlcm5lbCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlUHJlbG9hZHNGcm9tS2VybmVsKHRoaXMuX2N1cnJlbnRLZXJuZWwpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW291dHB1dCwgaW5zZXRdIG9mIHRoaXMuaW5zZXRNYXBwaW5nLmVudHJpZXMoKSkge1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoeyAuLi5pbnNldC5jYWNoZWRDcmVhdGlvbiwgaW5pdGlhbGx5SGlkZGVuOiB0aGlzLmhpZGRlbkluc2V0TWFwcGluZy5oYXMob3V0cHV0KSB9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbml0aWFsaXplTWFya3VwUHJvbWlzZT8uaXNGaXJzdEluaXQpIHtcblx0XHRcdC8vIE9uIGZpcnN0IHJ1biB0aGUgY29udGVudHMgaGF2ZSBhbHJlYWR5IGJlZW4gaW5pdGlhbGl6ZWQgc28gd2UgZG9uJ3QgbmVlZCB0byBpbml0IHRoZW0gYWdhaW5cblx0XHRcdC8vIG5vIG9wXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1kQ2VsbHMgPSBbLi4udGhpcy5tYXJrdXBQcmV2aWV3TWFwcGluZy52YWx1ZXMoKV07XG5cdFx0XHR0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVNYXJrdXAobWRDZWxscyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlU3R5bGVzKCk7XG5cdFx0dGhpcy5fdXBkYXRlT3B0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRVcGRhdGVJbnNldChjZWxsOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWwsIG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsIGNlbGxUb3A6IG51bWJlciwgb3V0cHV0T2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoJ2lzT3V0cHV0Q29sbGFwc2VkJyBpbiBjZWxsICYmIChjZWxsIGFzIElDZWxsVmlld01vZGVsKS5pc091dHB1dENvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmhpZGRlbkluc2V0TWFwcGluZy5oYXMob3V0cHV0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0cHV0Q2FjaGUgPSB0aGlzLmluc2V0TWFwcGluZy5nZXQob3V0cHV0KTtcblx0XHRpZiAoIW91dHB1dENhY2hlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG91dHB1dE9mZnNldCA9PT0gb3V0cHV0Q2FjaGUuY2FjaGVkQ3JlYXRpb24ub3V0cHV0T2Zmc2V0ICYmIGNlbGxUb3AgPT09IG91dHB1dENhY2hlLmNhY2hlZENyZWF0aW9uLmNlbGxUb3ApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFja0hlaWdodCh1cGRhdGVzOiByZWFkb25seSBJQWNrT3V0cHV0SGVpZ2h0W10pOiB2b2lkIHtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnYWNrLWRpbWVuc2lvbicsXG5cdFx0XHR1cGRhdGVzXG5cdFx0fSk7XG5cdH1cblxuXHR1cGRhdGVTY3JvbGxUb3BzKG91dHB1dFJlcXVlc3RzOiBJRGlzcGxheU91dHB1dExheW91dFVwZGF0ZVJlcXVlc3RbXSwgbWFya3VwUHJldmlld3M6IHsgaWQ6IHN0cmluZzsgdG9wOiBudW1iZXIgfVtdKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0cyA9IGNvYWxlc2NlKG91dHB1dFJlcXVlc3RzLm1hcCgocmVxdWVzdCk6IElDb250ZW50V2lkZ2V0VG9wUmVxdWVzdCB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXRDYWNoZSA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChyZXF1ZXN0Lm91dHB1dCk7XG5cdFx0XHRpZiAoIW91dHB1dENhY2hlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFyZXF1ZXN0LmZvcmNlRGlzcGxheSAmJiAhdGhpcy5zaG91bGRVcGRhdGVJbnNldChyZXF1ZXN0LmNlbGwsIHJlcXVlc3Qub3V0cHV0LCByZXF1ZXN0LmNlbGxUb3AsIHJlcXVlc3Qub3V0cHV0T2Zmc2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlkID0gb3V0cHV0Q2FjaGUub3V0cHV0SWQ7XG5cdFx0XHRvdXRwdXRDYWNoZS5jYWNoZWRDcmVhdGlvbi5jZWxsVG9wID0gcmVxdWVzdC5jZWxsVG9wO1xuXHRcdFx0b3V0cHV0Q2FjaGUuY2FjaGVkQ3JlYXRpb24ub3V0cHV0T2Zmc2V0ID0gcmVxdWVzdC5vdXRwdXRPZmZzZXQ7XG5cdFx0XHR0aGlzLmhpZGRlbkluc2V0TWFwcGluZy5kZWxldGUocmVxdWVzdC5vdXRwdXQpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjZWxsSWQ6IHJlcXVlc3QuY2VsbC5pZCxcblx0XHRcdFx0b3V0cHV0SWQ6IGlkLFxuXHRcdFx0XHRjZWxsVG9wOiByZXF1ZXN0LmNlbGxUb3AsXG5cdFx0XHRcdG91dHB1dE9mZnNldDogcmVxdWVzdC5vdXRwdXRPZmZzZXQsXG5cdFx0XHRcdGZvcmNlRGlzcGxheTogcmVxdWVzdC5mb3JjZURpc3BsYXksXG5cdFx0XHR9O1xuXHRcdH0pKTtcblxuXHRcdGlmICghd2lkZ2V0cy5sZW5ndGggJiYgIW1hcmt1cFByZXZpZXdzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICd2aWV3LXNjcm9sbCcsXG5cdFx0XHR3aWRnZXRzOiB3aWRnZXRzLFxuXHRcdFx0bWFya3VwQ2VsbHM6IG1hcmt1cFByZXZpZXdzLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVNYXJrdXBQcmV2aWV3KGluaXRpYWxpemF0aW9uOiBJTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuaGFzKGluaXRpYWxpemF0aW9uLmNlbGxJZCkpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1RyeWluZyB0byBjcmVhdGUgbWFya3VwIHByZXZpZXcgdGhhdCBhbHJlYWR5IGV4aXN0cycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuc2V0KGluaXRpYWxpemF0aW9uLmNlbGxJZCwgaW5pdGlhbGl6YXRpb24pO1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdjcmVhdGVNYXJrdXBDZWxsJyxcblx0XHRcdGNlbGw6IGluaXRpYWxpemF0aW9uXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzaG93TWFya3VwUHJldmlldyhuZXdDb250ZW50OiBJTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmdldChuZXdDb250ZW50LmNlbGxJZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlTWFya3VwUHJldmlldyhuZXdDb250ZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCBzYW1lQ29udGVudCA9IG5ld0NvbnRlbnQuY29udGVudCA9PT0gZW50cnkuY29udGVudDtcblx0XHRjb25zdCBzYW1lTWV0YWRhdGEgPSAoZXF1YWxzKG5ld0NvbnRlbnQubWV0YWRhdGEsIGVudHJ5Lm1ldGFkYXRhKSk7XG5cdFx0aWYgKCFzYW1lQ29udGVudCB8fCAhc2FtZU1ldGFkYXRhIHx8ICFlbnRyeS52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHRcdHR5cGU6ICdzaG93TWFya3VwQ2VsbCcsXG5cdFx0XHRcdGlkOiBuZXdDb250ZW50LmNlbGxJZCxcblx0XHRcdFx0aGFuZGxlOiBuZXdDb250ZW50LmNlbGxIYW5kbGUsXG5cdFx0XHRcdC8vIElmIHRoZSBjb250ZW50IGhhcyBub3QgY2hhbmdlZCwgd2Ugc3RpbGwgd2FudCB0byBtYWtlIHN1cmUgdGhlXG5cdFx0XHRcdC8vIHByZXZpZXcgaXMgdmlzaWJsZSBidXQgZG9uJ3QgbmVlZCB0byBzZW5kIGFueXRoaW5nIG92ZXJcblx0XHRcdFx0Y29udGVudDogc2FtZUNvbnRlbnQgPyB1bmRlZmluZWQgOiBuZXdDb250ZW50LmNvbnRlbnQsXG5cdFx0XHRcdHRvcDogbmV3Q29udGVudC5vZmZzZXQsXG5cdFx0XHRcdG1ldGFkYXRhOiBzYW1lTWV0YWRhdGEgPyB1bmRlZmluZWQgOiBuZXdDb250ZW50Lm1ldGFkYXRhXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0ZW50cnkubWV0YWRhdGEgPSBuZXdDb250ZW50Lm1ldGFkYXRhO1xuXHRcdGVudHJ5LmNvbnRlbnQgPSBuZXdDb250ZW50LmNvbnRlbnQ7XG5cdFx0ZW50cnkub2Zmc2V0ID0gbmV3Q29udGVudC5vZmZzZXQ7XG5cdFx0ZW50cnkudmlzaWJsZSA9IHRydWU7XG5cdH1cblxuXHRhc3luYyBoaWRlTWFya3VwUHJldmlld3MoY2VsbElkczogcmVhZG9ubHkgc3RyaW5nW10pIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsc1RvSGlkZTogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGxJZCBvZiBjZWxsSWRzKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuZ2V0KGNlbGxJZCk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0aWYgKGVudHJ5LnZpc2libGUpIHtcblx0XHRcdFx0XHRjZWxsc1RvSGlkZS5wdXNoKGNlbGxJZCk7XG5cdFx0XHRcdFx0ZW50cnkudmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNlbGxzVG9IaWRlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAnaGlkZU1hcmt1cENlbGxzJyxcblx0XHRcdFx0aWRzOiBjZWxsc1RvSGlkZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdW5oaWRlTWFya3VwUHJldmlld3MoY2VsbElkczogcmVhZG9ubHkgc3RyaW5nW10pIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b1VuaGlkZTogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGxJZCBvZiBjZWxsSWRzKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuZ2V0KGNlbGxJZCk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0aWYgKCFlbnRyeS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0ZW50cnkudmlzaWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0dG9VbmhpZGUucHVzaChjZWxsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBUcnlpbmcgdG8gdW5oaWRlIGEgcHJldmlldyB0aGF0IGRvZXMgbm90IGV4aXN0OiAke2NlbGxJZH1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAndW5oaWRlTWFya3VwQ2VsbHMnLFxuXHRcdFx0aWRzOiB0b1VuaGlkZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZU1hcmt1cFByZXZpZXdzKGNlbGxJZHM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpZCBvZiBjZWxsSWRzKSB7XG5cdFx0XHRpZiAoIXRoaXMubWFya3VwUHJldmlld01hcHBpbmcuaGFzKGlkKSkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBUcnlpbmcgdG8gZGVsZXRlIGEgcHJldmlldyB0aGF0IGRvZXMgbm90IGV4aXN0OiAke2lkfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5tYXJrdXBQcmV2aWV3TWFwcGluZy5kZWxldGUoaWQpO1xuXHRcdH1cblxuXHRcdGlmIChjZWxsSWRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAnZGVsZXRlTWFya3VwQ2VsbCcsXG5cdFx0XHRcdGlkczogY2VsbElkc1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlTWFya3VwUHJldmlld1NlbGVjdGlvbnMoc2VsZWN0ZWRDZWxsc0lkczogc3RyaW5nW10pIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAndXBkYXRlU2VsZWN0ZWRNYXJrdXBDZWxscycsXG5cdFx0XHRzZWxlY3RlZENlbGxJZHM6IHNlbGVjdGVkQ2VsbHNJZHMuZmlsdGVyKGlkID0+IHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuaGFzKGlkKSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplTWFya3VwKGNlbGxzOiByZWFkb25seSBJTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmluaXRpYWxpemVNYXJrdXBQcm9taXNlPy5wLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gVVVJRC5nZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLmluaXRpYWxpemVNYXJrdXBQcm9taXNlID0geyBwOiBuZXcgRGVmZXJyZWRQcm9taXNlKCksIHJlcXVlc3RJZCwgaXNGaXJzdEluaXQ6IHRoaXMuZmlyc3RJbml0IH07XG5cblx0XHR0aGlzLmZpcnN0SW5pdCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHR0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLnNldChjZWxsLmNlbGxJZCwgY2VsbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2luaXRpYWxpemVNYXJrdXAnLFxuXHRcdFx0Y2VsbHMsXG5cdFx0XHRyZXF1ZXN0SWQsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplTWFya3VwUHJvbWlzZS5wLnA7XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGUgaWYgY2FjaGVkIGluc2V0IGlzIG91dCBvZiBkYXRlIGFuZCByZXF1aXJlIGEgcmVyZW5kZXJcblx0ICogTm90ZSB0aGF0IGl0IGRvZXNuJ3QgYWNjb3VudCBmb3Igb3V0cHV0IGNvbnRlbnQgY2hhbmdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FjaGVkSW5zZXRFcXVhbChjYWNoZWRJbnNldDogSUNhY2hlZEluc2V0PFQ+LCBjb250ZW50OiBJSW5zZXRSZW5kZXJPdXRwdXQpIHtcblx0XHRpZiAoY29udGVudC50eXBlID09PSBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbikge1xuXHRcdFx0Ly8gVXNlIGEgbmV3IHJlbmRlcmVyXG5cdFx0XHRyZXR1cm4gY2FjaGVkSW5zZXQucmVuZGVyZXI/LmlkID09PSBjb250ZW50LnJlbmRlcmVyLmlkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUaGUgbmV3IHJlbmRlcmVyIGlzIHRoZSBkZWZhdWx0IEhUTUwgcmVuZGVyZXJcblx0XHRcdHJldHVybiBjYWNoZWRJbnNldC5jYWNoZWRDcmVhdGlvbi50eXBlID09PSAnaHRtbCc7XG5cdFx0fVxuXHR9XG5cblx0cmVxdWVzdENyZWF0ZU91dHB1dFdoZW5XZWJ2aWV3SWRsZShjZWxsSW5mbzogVCwgY29udGVudDogSUluc2V0UmVuZGVyT3V0cHV0LCBjZWxsVG9wOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5zZXRNYXBwaW5nLmhhcyhjb250ZW50LnNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3QuaGFzKGNvbnRlbnQuc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5oYXMoY29udGVudC5zb3VyY2UpKSB7XG5cdFx0XHQvLyBoYW5kbGVkIGluIHJlbmRlcmVyIHByb2Nlc3MsIHdhaXRpbmcgZm9yIHdlYnZpZXcgdG8gcHJvY2VzcyBpdCB3aGVuIGlkbGVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5zZXQoY29udGVudC5zb3VyY2UsIHJ1bldoZW5HbG9iYWxJZGxlKCgpID0+IHtcblx0XHRcdGNvbnN0IHsgbWVzc2FnZSwgcmVuZGVyZXIsIHRyYW5zZmVyOiB0cmFuc2ZlcmFibGUgfSA9IHRoaXMuX2NyZWF0ZU91dHB1dENyZWF0aW9uTWVzc2FnZShjZWxsSW5mbywgY29udGVudCwgY2VsbFRvcCwgb2Zmc2V0LCB0cnVlLCB0cnVlKTtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KG1lc3NhZ2UsIHRyYW5zZmVyYWJsZSk7XG5cdFx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5zZXQoY29udGVudC5zb3VyY2UsIHsgb3V0cHV0SWQ6IG1lc3NhZ2Uub3V0cHV0SWQsIHZlcnNpb25JZDogY29udGVudC5zb3VyY2UubW9kZWwudmVyc2lvbklkLCBjZWxsSW5mbzogY2VsbEluZm8sIHJlbmRlcmVyLCBjYWNoZWRDcmVhdGlvbjogbWVzc2FnZSB9KTtcblx0XHRcdHRoaXMucmV2ZXJzZWRQZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuc2V0KG1lc3NhZ2Uub3V0cHV0SWQsIGNvbnRlbnQuc291cmNlKTtcblx0XHRcdHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0LmRlbGV0ZShjb250ZW50LnNvdXJjZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Y3JlYXRlT3V0cHV0KGNlbGxJbmZvOiBULCBjb250ZW50OiBJSW5zZXRSZW5kZXJPdXRwdXQsIGNlbGxUb3A6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZWRJbnNldCA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChjb250ZW50LnNvdXJjZSk7XG5cblx0XHQvLyB3ZSBub3cgcmVxdWVzdCB0byByZW5kZXIgdGhlIG91dHB1dCBpbW1lZGlhdGVseSwgc28gd2UgY2FuIHJlbW92ZSB0aGUgcGVuZGluZyByZXF1ZXN0XG5cdFx0Ly8gZGlzcG9zZSB0aGUgcGVuZGluZyByZXF1ZXN0IGluIHJlbmRlcmVyIHByb2Nlc3MgaWYgaXQgZXhpc3RzXG5cdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3QuZ2V0KGNvbnRlbnQuc291cmNlKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0LmRlbGV0ZShjb250ZW50LnNvdXJjZSk7XG5cblx0XHQvLyBpZiByZXF1ZXN0IGhhcyBhbHJlYWR5IGJlZW4gc2VudCBvdXQsIHdlIHRoZW4gcmVtb3ZlIGl0IGZyb20gdGhlIHBlbmRpbmcgbWFwcGluZ1xuXHRcdHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlSW5zZXRNYXBwaW5nLmRlbGV0ZShjb250ZW50LnNvdXJjZSk7XG5cdFx0aWYgKGNhY2hlZEluc2V0KSB7XG5cdFx0XHR0aGlzLnJldmVyc2VkUGVuZGluZ1dlYnZpZXdJZGxlSW5zZXRNYXBwaW5nLmRlbGV0ZShjYWNoZWRJbnNldC5vdXRwdXRJZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhY2hlZEluc2V0ICYmIHRoaXMuX2NhY2hlZEluc2V0RXF1YWwoY2FjaGVkSW5zZXQsIGNvbnRlbnQpKSB7XG5cdFx0XHR0aGlzLmhpZGRlbkluc2V0TWFwcGluZy5kZWxldGUoY29udGVudC5zb3VyY2UpO1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAnc2hvd091dHB1dCcsXG5cdFx0XHRcdGNlbGxJZDogY2FjaGVkSW5zZXQuY2VsbEluZm8uY2VsbElkLFxuXHRcdFx0XHRvdXRwdXRJZDogY2FjaGVkSW5zZXQub3V0cHV0SWQsXG5cdFx0XHRcdGNlbGxUb3A6IGNlbGxUb3AsXG5cdFx0XHRcdG91dHB1dE9mZnNldDogb2Zmc2V0XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgbmV3IG91dHB1dFxuXHRcdGNvbnN0IHsgbWVzc2FnZSwgcmVuZGVyZXIsIHRyYW5zZmVyOiB0cmFuc2ZlcmFibGUgfSA9IHRoaXMuX2NyZWF0ZU91dHB1dENyZWF0aW9uTWVzc2FnZShjZWxsSW5mbywgY29udGVudCwgY2VsbFRvcCwgb2Zmc2V0LCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KG1lc3NhZ2UsIHRyYW5zZmVyYWJsZSk7XG5cdFx0dGhpcy5pbnNldE1hcHBpbmcuc2V0KGNvbnRlbnQuc291cmNlLCB7IG91dHB1dElkOiBtZXNzYWdlLm91dHB1dElkLCB2ZXJzaW9uSWQ6IGNvbnRlbnQuc291cmNlLm1vZGVsLnZlcnNpb25JZCwgY2VsbEluZm86IGNlbGxJbmZvLCByZW5kZXJlciwgY2FjaGVkQ3JlYXRpb246IG1lc3NhZ2UgfSk7XG5cdFx0dGhpcy5oaWRkZW5JbnNldE1hcHBpbmcuZGVsZXRlKGNvbnRlbnQuc291cmNlKTtcblx0XHR0aGlzLnJldmVyc2VkSW5zZXRNYXBwaW5nLnNldChtZXNzYWdlLm91dHB1dElkLCBjb250ZW50LnNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1ldGFkYXRhKG91dHB1dDogSUNlbGxPdXRwdXQsIG1pbWVUeXBlOiBzdHJpbmcpIHtcblx0XHRpZiAobWltZVR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UnKSkge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gb3V0cHV0Lm91dHB1dHMuZmluZChvdXQgPT4gb3V0Lm1pbWUgPT09ICd0ZXh0L3BsYWluJyk/LmRhdGEuYnVmZmVyO1xuXHRcdFx0aWYgKGJ1ZmZlcj8ubGVuZ3RoICYmIGJ1ZmZlcj8ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBhbHRUZXh0ID0gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZmZlcik7XG5cdFx0XHRcdHJldHVybiB7IC4uLm91dHB1dC5tZXRhZGF0YSwgdnNjb2RlX2FsdFRleHQ6IGFsdFRleHQgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5tZXRhZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU91dHB1dENyZWF0aW9uTWVzc2FnZShjZWxsSW5mbzogVCwgY29udGVudDogSUluc2V0UmVuZGVyT3V0cHV0LCBjZWxsVG9wOiBudW1iZXIsIG9mZnNldDogbnVtYmVyLCBjcmVhdGVPbklkbGU6IGJvb2xlYW4sIGluaXRpYWxseUhpZGRlbjogYm9vbGVhbik6IHsgcmVhZG9ubHkgbWVzc2FnZTogSUNyZWF0aW9uUmVxdWVzdE1lc3NhZ2U7IHJlYWRvbmx5IHJlbmRlcmVyOiBJTm90ZWJvb2tSZW5kZXJlckluZm8gfCB1bmRlZmluZWQ7IHRyYW5zZmVyOiByZWFkb25seSBBcnJheUJ1ZmZlcltdIH0ge1xuXHRcdGNvbnN0IG1lc3NhZ2VCYXNlID0ge1xuXHRcdFx0dHlwZTogJ2h0bWwnLFxuXHRcdFx0ZXhlY3V0aW9uSWQ6IGNlbGxJbmZvLmV4ZWN1dGlvbklkLFxuXHRcdFx0Y2VsbElkOiBjZWxsSW5mby5jZWxsSWQsXG5cdFx0XHRjZWxsVG9wOiBjZWxsVG9wLFxuXHRcdFx0b3V0cHV0T2Zmc2V0OiBvZmZzZXQsXG5cdFx0XHRsZWZ0OiAwLFxuXHRcdFx0cmVxdWlyZWRQcmVsb2FkczogW10sXG5cdFx0XHRjcmVhdGVPbklkbGU6IGNyZWF0ZU9uSWRsZVxuXHRcdH0gYXMgY29uc3Q7XG5cblx0XHRjb25zdCB0cmFuc2ZlcjogQXJyYXlCdWZmZXJbXSA9IFtdO1xuXG5cdFx0bGV0IG1lc3NhZ2U6IElDcmVhdGlvblJlcXVlc3RNZXNzYWdlO1xuXHRcdGxldCByZW5kZXJlcjogSU5vdGVib29rUmVuZGVyZXJJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZW50LnR5cGUgPT09IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uKSB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBjb250ZW50LnNvdXJjZS5tb2RlbDtcblx0XHRcdHJlbmRlcmVyID0gY29udGVudC5yZW5kZXJlcjtcblx0XHRcdGNvbnN0IGZpcnN0ID0gb3V0cHV0Lm91dHB1dHMuZmluZChvcCA9PiBvcC5taW1lID09PSBjb250ZW50Lm1pbWVUeXBlKSE7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuY3JlYXRlTWV0YWRhdGEob3V0cHV0LCBjb250ZW50Lm1pbWVUeXBlKTtcblx0XHRcdGNvbnN0IHZhbHVlQnl0ZXMgPSBjb3B5QnVmZmVySWZOZWVkZWQoZmlyc3QuZGF0YS5idWZmZXIsIHRyYW5zZmVyKTtcblx0XHRcdG1lc3NhZ2UgPSB7XG5cdFx0XHRcdC4uLm1lc3NhZ2VCYXNlLFxuXHRcdFx0XHRvdXRwdXRJZDogb3V0cHV0Lm91dHB1dElkLFxuXHRcdFx0XHRyZW5kZXJlcklkOiBjb250ZW50LnJlbmRlcmVyLmlkLFxuXHRcdFx0XHRjb250ZW50OiB7XG5cdFx0XHRcdFx0dHlwZTogUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24sXG5cdFx0XHRcdFx0b3V0cHV0SWQ6IG91dHB1dC5vdXRwdXRJZCxcblx0XHRcdFx0XHRtZXRhZGF0YTogbWV0YWRhdGEsXG5cdFx0XHRcdFx0b3V0cHV0OiB7XG5cdFx0XHRcdFx0XHRtaW1lOiBmaXJzdC5taW1lLFxuXHRcdFx0XHRcdFx0dmFsdWVCeXRlcyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsbE91dHB1dHM6IG91dHB1dC5vdXRwdXRzLm1hcChvdXRwdXQgPT4gKHsgbWltZTogb3V0cHV0Lm1pbWUgfSkpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbml0aWFsbHlIaWRkZW46IGluaXRpYWxseUhpZGRlblxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IHtcblx0XHRcdFx0Li4ubWVzc2FnZUJhc2UsXG5cdFx0XHRcdG91dHB1dElkOiBVVUlELmdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRjb250ZW50OiB7XG5cdFx0XHRcdFx0dHlwZTogY29udGVudC50eXBlLFxuXHRcdFx0XHRcdGh0bWxDb250ZW50OiBjb250ZW50Lmh0bWxDb250ZW50LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbml0aWFsbHlIaWRkZW46IGluaXRpYWxseUhpZGRlblxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHJlbmRlcmVyLFxuXHRcdFx0dHJhbnNmZXIsXG5cdFx0fTtcblx0fVxuXG5cdHVwZGF0ZU91dHB1dChjZWxsSW5mbzogVCwgY29udGVudDogSUluc2V0UmVuZGVyT3V0cHV0LCBjZWxsVG9wOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmluc2V0TWFwcGluZy5oYXMoY29udGVudC5zb3VyY2UpKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZU91dHB1dChjZWxsSW5mbywgY29udGVudCwgY2VsbFRvcCwgb2Zmc2V0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdXRwdXRDYWNoZSA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChjb250ZW50LnNvdXJjZSkhO1xuXG5cdFx0aWYgKG91dHB1dENhY2hlLnZlcnNpb25JZCA9PT0gY29udGVudC5zb3VyY2UubW9kZWwudmVyc2lvbklkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IHNlbnQgdGhpcyBvdXRwdXQgdmVyc2lvbiB0byB0aGUgcmVuZGVyZXJcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGRlbkluc2V0TWFwcGluZy5kZWxldGUoY29udGVudC5zb3VyY2UpO1xuXHRcdGxldCB1cGRhdGVkQ29udGVudDogSUNyZWF0aW9uQ29udGVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHRyYW5zZmVyOiBBcnJheUJ1ZmZlcltdID0gW107XG5cdFx0aWYgKGNvbnRlbnQudHlwZSA9PT0gUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IGNvbnRlbnQuc291cmNlLm1vZGVsO1xuXHRcdFx0Y29uc3QgZmlyc3RCdWZmZXIgPSBvdXRwdXQub3V0cHV0cy5maW5kKG9wID0+IG9wLm1pbWUgPT09IGNvbnRlbnQubWltZVR5cGUpITtcblx0XHRcdGNvbnN0IGFwcGVuZWRlZERhdGEgPSBvdXRwdXQuYXBwZW5kZWRTaW5jZVZlcnNpb24ob3V0cHV0Q2FjaGUudmVyc2lvbklkLCBjb250ZW50Lm1pbWVUeXBlKTtcblx0XHRcdGNvbnN0IGFwcGVuZGVkID0gYXBwZW5lZGVkRGF0YSA/IHsgdmFsdWVCeXRlczogYXBwZW5lZGVkRGF0YS5idWZmZXIsIHByZXZpb3VzVmVyc2lvbjogb3V0cHV0Q2FjaGUudmVyc2lvbklkIH0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHZhbHVlQnl0ZXMgPSBjb3B5QnVmZmVySWZOZWVkZWQoZmlyc3RCdWZmZXIuZGF0YS5idWZmZXIsIHRyYW5zZmVyKTtcblx0XHRcdHVwZGF0ZWRDb250ZW50ID0ge1xuXHRcdFx0XHR0eXBlOiBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbixcblx0XHRcdFx0b3V0cHV0SWQ6IG91dHB1dENhY2hlLm91dHB1dElkLFxuXHRcdFx0XHRtZXRhZGF0YTogb3V0cHV0Lm1ldGFkYXRhLFxuXHRcdFx0XHRvdXRwdXQ6IHtcblx0XHRcdFx0XHRtaW1lOiBjb250ZW50Lm1pbWVUeXBlLFxuXHRcdFx0XHRcdHZhbHVlQnl0ZXMsXG5cdFx0XHRcdFx0YXBwZW5kZWQ6IGFwcGVuZGVkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFsbE91dHB1dHM6IG91dHB1dC5vdXRwdXRzLm1hcChvdXRwdXQgPT4gKHsgbWltZTogb3V0cHV0Lm1pbWUgfSkpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdzaG93T3V0cHV0Jyxcblx0XHRcdGNlbGxJZDogb3V0cHV0Q2FjaGUuY2VsbEluZm8uY2VsbElkLFxuXHRcdFx0b3V0cHV0SWQ6IG91dHB1dENhY2hlLm91dHB1dElkLFxuXHRcdFx0Y2VsbFRvcDogY2VsbFRvcCxcblx0XHRcdG91dHB1dE9mZnNldDogb2Zmc2V0LFxuXHRcdFx0Y29udGVudDogdXBkYXRlZENvbnRlbnRcblx0XHR9LCB0cmFuc2Zlcik7XG5cblx0XHRvdXRwdXRDYWNoZS52ZXJzaW9uSWQgPSBjb250ZW50LnNvdXJjZS5tb2RlbC52ZXJzaW9uSWQ7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YXN5bmMgY29weUltYWdlKG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDb2xsZWN0IHRleHQgYWx0ZXJuYXRlcyBmcm9tIHRoZSBzYW1lIGNlbGwgb3V0cHV0XG5cdFx0Y29uc3QgdGV4dEFsdGVybmF0ZXM6IHsgbWltZVR5cGU6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGNlbGxPdXRwdXQgPSBvdXRwdXQubW9kZWw7XG5cblx0XHRmb3IgKGNvbnN0IG91dHB1dEl0ZW0gb2YgY2VsbE91dHB1dC5vdXRwdXRzKSB7XG5cdFx0XHRpZiAoVEVYVF9CQVNFRF9NSU1FVFlQRVMuaW5jbHVkZXMob3V0cHV0SXRlbS5taW1lKSkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gaXNUZXh0U3RyZWFtTWltZShvdXRwdXRJdGVtLm1pbWUpID9cblx0XHRcdFx0XHRnZXRPdXRwdXRTdHJlYW1UZXh0KG91dHB1dCkudGV4dCA6XG5cdFx0XHRcdFx0Z2V0T3V0cHV0VGV4dChvdXRwdXRJdGVtLm1pbWUsIG91dHB1dEl0ZW0pO1xuXHRcdFx0XHR0ZXh0QWx0ZXJuYXRlcy5wdXNoKHtcblx0XHRcdFx0XHRtaW1lVHlwZTogb3V0cHV0SXRlbS5taW1lLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHRleHRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2NvcHlJbWFnZScsXG5cdFx0XHRvdXRwdXRJZDogb3V0cHV0Lm1vZGVsLm91dHB1dElkLFxuXHRcdFx0YWx0T3V0cHV0SWQ6IG91dHB1dC5tb2RlbC5hbHRlcm5hdGl2ZU91dHB1dElkLFxuXHRcdFx0dGV4dEFsdGVybmF0ZXM6IHRleHRBbHRlcm5hdGVzLmxlbmd0aCA+IDAgPyB0ZXh0QWx0ZXJuYXRlcyA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cmVtb3ZlSW5zZXRzKG91dHB1dHM6IHJlYWRvbmx5IElDZWxsT3V0cHV0Vmlld01vZGVsW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG91dHB1dCBvZiBvdXRwdXRzKSB7XG5cdFx0XHRjb25zdCBvdXRwdXRDYWNoZSA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQpO1xuXHRcdFx0aWYgKCFvdXRwdXRDYWNoZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaWQgPSBvdXRwdXRDYWNoZS5vdXRwdXRJZDtcblxuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAnY2xlYXJPdXRwdXQnLFxuXHRcdFx0XHRyZW5kZXJlcklkOiBvdXRwdXRDYWNoZS5jYWNoZWRDcmVhdGlvbi5yZW5kZXJlcklkLFxuXHRcdFx0XHRjZWxsVXJpOiBvdXRwdXRDYWNoZS5jZWxsSW5mby5jZWxsVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG91dHB1dElkOiBpZCxcblx0XHRcdFx0Y2VsbElkOiBvdXRwdXRDYWNoZS5jZWxsSW5mby5jZWxsSWRcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5pbnNldE1hcHBpbmcuZGVsZXRlKG91dHB1dCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5nZXQob3V0cHV0KT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3QuZGVsZXRlKG91dHB1dCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5kZWxldGUob3V0cHV0KTtcblx0XHRcdHRoaXMucmV2ZXJzZWRQZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMucmV2ZXJzZWRJbnNldE1hcHBpbmcuZGVsZXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlSW5zZXQob3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dENhY2hlID0gdGhpcy5pbnNldE1hcHBpbmcuZ2V0KG91dHB1dCk7XG5cdFx0aWYgKCFvdXRwdXRDYWNoZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaGlkZGVuSW5zZXRNYXBwaW5nLmFkZChvdXRwdXQpO1xuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2hpZGVPdXRwdXQnLFxuXHRcdFx0b3V0cHV0SWQ6IG91dHB1dENhY2hlLm91dHB1dElkLFxuXHRcdFx0Y2VsbElkOiBvdXRwdXRDYWNoZS5jZWxsSW5mby5jZWxsSWQsXG5cdFx0fSk7XG5cdH1cblxuXHRmb2N1c1dlYnZpZXcoKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy53ZWJ2aWV3Py5mb2N1cygpO1xuXHR9XG5cblx0c2VsZWN0T3V0cHV0Q29udGVudHMoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0cHV0ID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5maW5kKG8gPT4gby5tb2RlbC5vdXRwdXRJZCA9PT0gY2VsbC5mb2N1c2VkT3V0cHV0SWQpO1xuXHRcdGNvbnN0IG91dHB1dElkID0gb3V0cHV0ID8gdGhpcy5pbnNldE1hcHBpbmcuZ2V0KG91dHB1dCk/Lm91dHB1dElkIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdzZWxlY3Qtb3V0cHV0LWNvbnRlbnRzJyxcblx0XHRcdGNlbGxPck91dHB1dElkOiBvdXRwdXRJZCB8fCBjZWxsLmlkXG5cdFx0fSk7XG5cdH1cblxuXHRzZWxlY3RJbnB1dENvbnRlbnRzKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG91dHB1dCA9IGNlbGwub3V0cHV0c1ZpZXdNb2RlbHMuZmluZChvID0+IG8ubW9kZWwub3V0cHV0SWQgPT09IGNlbGwuZm9jdXNlZE91dHB1dElkKTtcblx0XHRjb25zdCBvdXRwdXRJZCA9IG91dHB1dCA/IHRoaXMuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQpPy5vdXRwdXRJZCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnc2VsZWN0LWlucHV0LWNvbnRlbnRzJyxcblx0XHRcdGNlbGxPck91dHB1dElkOiBvdXRwdXRJZCB8fCBjZWxsLmlkXG5cdFx0fSk7XG5cdH1cblxuXHRmb2N1c091dHB1dChjZWxsT3JPdXRwdXRJZDogc3RyaW5nLCBhbHRlcm5hdGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB2aWV3Rm9jdXNlZDogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdmlld0ZvY3VzZWQpIHtcblx0XHRcdHRoaXMud2Vidmlldz8uZm9jdXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnZm9jdXMtb3V0cHV0Jyxcblx0XHRcdGNlbGxPck91dHB1dElkOiBjZWxsT3JPdXRwdXRJZCxcblx0XHRcdGFsdGVybmF0ZUlkOiBhbHRlcm5hdGVJZFxuXHRcdH0pO1xuXHR9XG5cblx0Ymx1ck91dHB1dCgpIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnYmx1ci1vdXRwdXQnXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmaW5kKHF1ZXJ5OiBzdHJpbmcsIG9wdGlvbnM6IHsgd2hvbGVXb3JkPzogYm9vbGVhbjsgY2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47IGluY2x1ZGVNYXJrdXA6IGJvb2xlYW47IGluY2x1ZGVPdXRwdXQ6IGJvb2xlYW47IHNob3VsZEdldFNlYXJjaFByZXZpZXdJbmZvOiBib29sZWFuOyBvd25lcklEOiBzdHJpbmc7IGZpbmRJZHM6IHN0cmluZ1tdIH0pOiBQcm9taXNlPElGaW5kTWF0Y2hbXT4ge1xuXHRcdGlmIChxdWVyeSA9PT0gJycpIHtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0dHlwZTogJ2ZpbmRTdG9wJyxcblx0XHRcdFx0b3duZXJJRDogb3B0aW9ucy5vd25lcklEXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBwID0gbmV3IFByb21pc2U8SUZpbmRNYXRjaFtdPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHN1YiA9IHRoaXMud2Vidmlldz8ub25NZXNzYWdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5tZXNzYWdlLnR5cGUgPT09ICdkaWRGaW5kJykge1xuXHRcdFx0XHRcdHJlc29sdmUoZS5tZXNzYWdlLm1hdGNoZXMpO1xuXHRcdFx0XHRcdHN1Yj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdmaW5kJyxcblx0XHRcdHF1ZXJ5OiBxdWVyeSxcblx0XHRcdG9wdGlvbnNcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJldCA9IGF3YWl0IHA7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGZpbmRTdG9wKG93bmVySUQ6IHN0cmluZykge1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdmaW5kU3RvcCcsXG5cdFx0XHRvd25lcklEXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmaW5kSGlnaGxpZ2h0Q3VycmVudChpbmRleDogbnVtYmVyLCBvd25lcklEOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHAgPSBuZXcgUHJvbWlzZTxudW1iZXI+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViID0gdGhpcy53ZWJ2aWV3Py5vbk1lc3NhZ2UoZSA9PiB7XG5cdFx0XHRcdGlmIChlLm1lc3NhZ2UudHlwZSA9PT0gJ2RpZEZpbmRIaWdobGlnaHRDdXJyZW50Jykge1xuXHRcdFx0XHRcdHJlc29sdmUoZS5tZXNzYWdlLm9mZnNldCk7XG5cdFx0XHRcdFx0c3ViPy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2ZpbmRIaWdobGlnaHRDdXJyZW50Jyxcblx0XHRcdGluZGV4LFxuXHRcdFx0b3duZXJJRFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmV0ID0gYXdhaXQgcDtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0YXN5bmMgZmluZFVuSGlnaGxpZ2h0Q3VycmVudChpbmRleDogbnVtYmVyLCBvd25lcklEOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnZmluZFVuSGlnaGxpZ2h0Q3VycmVudCcsXG5cdFx0XHRpbmRleCxcblx0XHRcdG93bmVySURcblx0XHR9KTtcblx0fVxuXG5cblx0ZGVsdGFDZWxsT3V0cHV0Q29udGFpbmVyQ2xhc3NOYW1lcyhjZWxsSWQ6IHN0cmluZywgYWRkZWQ6IHN0cmluZ1tdLCByZW1vdmVkOiBzdHJpbmdbXSkge1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdkZWNvcmF0aW9ucycsXG5cdFx0XHRjZWxsSWQsXG5cdFx0XHRhZGRlZENsYXNzTmFtZXM6IGFkZGVkLFxuXHRcdFx0cmVtb3ZlZENsYXNzTmFtZXM6IHJlbW92ZWRcblx0XHR9KTtcblx0fVxuXG5cdGRlbHRhTWFya3VwUHJldmlld0NsYXNzTmFtZXMoY2VsbElkOiBzdHJpbmcsIGFkZGVkOiBzdHJpbmdbXSwgcmVtb3ZlZDogc3RyaW5nW10pIHtcblx0XHRpZiAodGhpcy5tYXJrdXBQcmV2aWV3TWFwcGluZy5nZXQoY2VsbElkKSkge1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAnbWFya3VwRGVjb3JhdGlvbnMnLFxuXHRcdFx0XHRjZWxsSWQsXG5cdFx0XHRcdGFkZGVkQ2xhc3NOYW1lczogYWRkZWQsXG5cdFx0XHRcdHJlbW92ZWRDbGFzc05hbWVzOiByZW1vdmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVPdXRwdXRSZW5kZXJlcnMoKSB7XG5cdFx0aWYgKCF0aGlzLndlYnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJlcnNEYXRhID0gdGhpcy5nZXRSZW5kZXJlckRhdGEoKTtcblx0XHR0aGlzLmxvY2FsUmVzb3VyY2VSb290c0NhY2hlID0gdGhpcy5fZ2V0UmVzb3VyY2VSb290c0NhY2hlKCk7XG5cdFx0Y29uc3QgbWl4ZWRSZXNvdXJjZVJvb3RzID0gW1xuXHRcdFx0Li4uKHRoaXMubG9jYWxSZXNvdXJjZVJvb3RzQ2FjaGUgfHwgW10pLFxuXHRcdFx0Li4uKHRoaXMuX2N1cnJlbnRLZXJuZWwgPyBbdGhpcy5fY3VycmVudEtlcm5lbC5sb2NhbFJlc291cmNlUm9vdF0gOiBbXSksXG5cdFx0XTtcblxuXHRcdHRoaXMud2Vidmlldy5sb2NhbFJlc291cmNlc1Jvb3QgPSBtaXhlZFJlc291cmNlUm9vdHM7XG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ3VwZGF0ZVJlbmRlcmVycycsXG5cdFx0XHRyZW5kZXJlckRhdGE6IHJlbmRlcmVyc0RhdGFcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUtlcm5lbFByZWxvYWRzKGtlcm5lbDogSU5vdGVib29rS2VybmVsIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkIHx8IGtlcm5lbCA9PT0gdGhpcy5fY3VycmVudEtlcm5lbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzS2VybmVsID0gdGhpcy5fY3VycmVudEtlcm5lbDtcblx0XHR0aGlzLl9jdXJyZW50S2VybmVsID0ga2VybmVsO1xuXG5cdFx0aWYgKHByZXZpb3VzS2VybmVsICYmIHByZXZpb3VzS2VybmVsLnByZWxvYWRVcmlzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMud2Vidmlldz8ucmVsb2FkKCk7IC8vIHByZWxvYWRzIHdpbGwgYmUgcmVzdG9yZWQgYWZ0ZXIgcmVsb2FkXG5cdFx0fSBlbHNlIGlmIChrZXJuZWwpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVByZWxvYWRzRnJvbUtlcm5lbChrZXJuZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVByZWxvYWRzRnJvbUtlcm5lbChrZXJuZWw6IElOb3RlYm9va0tlcm5lbCkge1xuXHRcdGNvbnN0IHJlc291cmNlczogSUNvbnRyb2xsZXJQcmVsb2FkW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHByZWxvYWQgb2Yga2VybmVsLnByZWxvYWRVcmlzKSB7XG5cdFx0XHRjb25zdCB1cmkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50ICYmIChwcmVsb2FkLnNjaGVtZSA9PT0gJ2h0dHAnIHx8IHByZWxvYWQuc2NoZW1lID09PSAnaHR0cHMnKVxuXHRcdFx0XHQ/IHByZWxvYWQgOiB0aGlzLmFzV2Vidmlld1VyaShwcmVsb2FkLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX3ByZWxvYWRzQ2FjaGUuaGFzKHVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRyZXNvdXJjZXMucHVzaCh7IHVyaTogdXJpLnRvU3RyaW5nKCksIG9yaWdpbmFsVXJpOiBwcmVsb2FkLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRcdHRoaXMuX3ByZWxvYWRzQ2FjaGUuYWRkKHVyaS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVQcmVsb2FkcyhyZXNvdXJjZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUHJlbG9hZHMocmVzb3VyY2VzOiBJQ29udHJvbGxlclByZWxvYWRbXSkge1xuXHRcdGlmICghdGhpcy53ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWl4ZWRSZXNvdXJjZVJvb3RzID0gW1xuXHRcdFx0Li4uKHRoaXMubG9jYWxSZXNvdXJjZVJvb3RzQ2FjaGUgfHwgW10pLFxuXHRcdFx0Li4uKHRoaXMuX2N1cnJlbnRLZXJuZWwgPyBbdGhpcy5fY3VycmVudEtlcm5lbC5sb2NhbFJlc291cmNlUm9vdF0gOiBbXSksXG5cdFx0XTtcblxuXHRcdHRoaXMud2Vidmlldy5sb2NhbFJlc291cmNlc1Jvb3QgPSBtaXhlZFJlc291cmNlUm9vdHM7XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAncHJlbG9hZCcsXG5cdFx0XHRyZXNvdXJjZXM6IHJlc291cmNlcyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KG1lc3NhZ2U6IFRvV2Vidmlld01lc3NhZ2UsIHRyYW5zZmVyPzogcmVhZG9ubHkgQXJyYXlCdWZmZXJbXSkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMud2Vidmlldz8ucG9zdE1lc3NhZ2UobWVzc2FnZSwgdHJhbnNmZXIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy53ZWJ2aWV3Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy53ZWJ2aWV3ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IgPSBudWxsITtcblx0XHR0aGlzLmluc2V0TWFwcGluZy5jbGVhcigpO1xuXHRcdHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0LmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvcHlCdWZmZXJJZk5lZWRlZChidWZmZXI6IFVpbnQ4QXJyYXksIHRyYW5zZmVyOiBBcnJheUJ1ZmZlcltdKTogVWludDhBcnJheSB7XG5cdGlmIChidWZmZXIuYnl0ZUxlbmd0aCA9PT0gYnVmZmVyLmJ1ZmZlci5ieXRlTGVuZ3RoKSB7XG5cdFx0Ly8gTm8gY29weSBuZWVkZWQgYnV0IHdlIGNhbid0IHRyYW5zZmVyIGVpdGhlclxuXHRcdHJldHVybiBidWZmZXI7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gVGhlIGJ1ZmZlciBpcyBzbWFsbGVyIHRoYW4gaXRzIGJhY2tpbmcgYXJyYXkgYnVmZmVyLlxuXHRcdC8vIENyZWF0ZSBhIGNvcHkgdG8gYXZvaWQgc2VuZGluZyB0aGUgZW50aXJlIGFycmF5IGJ1ZmZlci5cblx0XHRjb25zdCB2YWx1ZUJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblx0XHR0cmFuc2Zlci5wdXNoKHZhbHVlQnl0ZXMuYnVmZmVyKTtcblx0XHRyZXR1cm4gdmFsdWVCeXRlcztcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRUb2tlbml6YXRpb25Dc3MoKSB7XG5cdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblx0Y29uc3QgdG9rZW5pemF0aW9uQ3NzID0gY29sb3JNYXAgPyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwKGNvbG9yTWFwKSA6ICcnO1xuXHRyZXR1cm4gdG9rZW5pemF0aW9uQ3NzO1xufVxuXG5mdW5jdGlvbiB0cnlEZWNvZGVVUklDb21wb25lbnQodXJpOiBzdHJpbmcpIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHVyaSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1cmk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUI7QUFJMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyx5QkFBeUIsd0JBQXdCO0FBQzFELFNBQVMsWUFBWSxTQUFTLGVBQWUseUJBQXlCO0FBQ3RFLFNBQVMsY0FBYztBQUN2QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxhQUFhLGFBQWE7QUFDbkMsU0FBUyxTQUFTLFNBQVMsU0FBUyxnQkFBZ0I7QUFDcEQsU0FBUyxXQUFXO0FBQ3BCLFlBQVksVUFBVTtBQUN0QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHdCQUF3QjtBQUNqQyxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQTRDO0FBQ3JELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQixnQ0FBZ0M7QUFDMUQsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdDQUF3QztBQUVqRCxTQUFTLGVBQWlRLHdCQUF3QjtBQUNsUyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDJCQUEyQjtB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QixXQUFpQztBQUN4RCxRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsSUFDRDtBQUVBLFVBQU0scUJBQXFCO0FBQUEsTUFDMUIsR0FBSSxLQUFLLDJCQUEyQixDQUFDO0FBQUEsTUFDckMsR0FBSSxLQUFLLGlCQUFpQixDQUFDLEtBQUssZUFBZSxpQkFBaUIsSUFBSSxDQUFDO0FBQUEsSUFDdEU7QUFFQSxTQUFLLFFBQVEscUJBQXFCO0FBRWxDLFNBQUssc0JBQXNCO0FBQUEsTUFDMUIsTUFBTTtBQUFBLE1BQ047QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxzQkFBc0IsU0FBMkIsVUFBbUM7QUFDM0YsUUFBSSxLQUFLLFdBQVc7QUFDbkI7QUFBQSxJQUNEO0FBRUEsU0FBSyxTQUFTLFlBQVksU0FBUyxRQUFRO0FBQUEsRUFDNUM7QUFBQSxFQUVTLFVBQVU7QUFDbEIsU0FBSyxZQUFZO0FBQ2pCLFNBQUssU0FBUyxRQUFRO0FBQ3RCLFNBQUssVUFBVTtBQUNmLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssYUFBYSxNQUFNO0FBQ3hCLFNBQUssa0NBQWtDLE1BQU07QUFDN0MsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBbjFEYSxtQkFBTjtBQUFBLEVBc0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBekRVO0FBcTFEYixTQUFTLG1CQUFtQixRQUFvQixVQUFxQztBQUNwRixNQUFJLE9BQU8sZUFBZSxPQUFPLE9BQU8sWUFBWTtBQUVuRCxXQUFPO0FBQUEsRUFDUixPQUFPO0FBR04sVUFBTSxhQUFhLElBQUksV0FBVyxNQUFNO0FBQ3hDLGFBQVMsS0FBSyxXQUFXLE1BQU07QUFDL0IsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMscUJBQXFCO0FBQzdCLFFBQU0sV0FBVyxxQkFBcUIsWUFBWTtBQUNsRCxRQUFNLGtCQUFrQixXQUFXLDZCQUE2QixRQUFRLElBQUk7QUFDNUUsU0FBTztBQUNSO0FBRUEsU0FBUyxzQkFBc0IsS0FBYTtBQUMzQyxNQUFJO0FBQ0gsV0FBTyxtQkFBbUIsR0FBRztBQUFBLEVBQzlCLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJvdXRwdXQiLCAiY2VsbCIsICJlZGl0b3JPcHRpb25zIl0KfQo=
