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
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/path.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { IAgentFeedbackService } from "./agentFeedbackService.js";
import { editorHoverBackground } from "../../../../platform/theme/common/colorRegistry.js";
const $ = dom.$;
function isFeedbackFileElement(element) {
  return element.type === "file";
}
class FeedbackTreeDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    return isFeedbackFileElement(element) ? FeedbackFileRenderer.TEMPLATE_ID : FeedbackCommentRenderer.TEMPLATE_ID;
  }
}
const _FeedbackFileRenderer = class _FeedbackFileRenderer {
  constructor(_labels, _agentFeedbackService, _sessionResource) {
    this._labels = _labels;
    this._agentFeedbackService = _agentFeedbackService;
    this._sessionResource = _sessionResource;
    this.templateId = _FeedbackFileRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this._labels.create(container, { supportHighlights: true, supportIcons: true }));
    const actionBarContainer = $("div.agent-feedback-hover-action-bar");
    label.element.appendChild(actionBarContainer);
    const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
    return { label, actionBar, templateDisposables };
  }
  renderElement(node, _index, templateData) {
    const element = node.element;
    templateData.label.element.style.display = "flex";
    const name = basename(element.uri.path);
    templateData.label.setResource(
      { resource: element.uri, name },
      { fileKind: FileKind.FILE }
    );
    templateData.actionBar.clear();
    if (this._agentFeedbackService) {
      const service = this._agentFeedbackService;
      const sessionResource = this._sessionResource;
      templateData.actionBar.push(new Action(
        "agentFeedback.removeFileComments",
        localize("agentFeedbackHover.removeAll", "Remove All"),
        ThemeIcon.asClassName(Codicon.close),
        true,
        () => {
          for (const item of element.items) {
            service.removeFeedback(sessionResource, item.id);
          }
        }
      ), { icon: true, label: false });
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_FeedbackFileRenderer.TEMPLATE_ID = "feedbackFile";
let FeedbackFileRenderer = _FeedbackFileRenderer;
const _FeedbackCommentRenderer = class _FeedbackCommentRenderer {
  constructor(_agentFeedbackService, _sessionResource, _hoverService, _languageService) {
    this._agentFeedbackService = _agentFeedbackService;
    this._sessionResource = _sessionResource;
    this._hoverService = _hoverService;
    this._languageService = _languageService;
    this.templateId = _FeedbackCommentRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const row = dom.append(container, $("div.agent-feedback-hover-comment-row"));
    const textElement = dom.append(row, $("div.agent-feedback-hover-comment-text"));
    const actionBarContainer = dom.append(row, $("div.agent-feedback-hover-action-bar"));
    const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
    const hoverDisposable = templateDisposables.add(new MutableDisposable());
    const templateData = { textElement, row, actionBar, templateDisposables, hoverDisposable, element: void 0 };
    if (this._agentFeedbackService) {
      const service = this._agentFeedbackService;
      const sessionResource = this._sessionResource;
      templateDisposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, (e) => {
        const data = templateData.element;
        if (data) {
          e.preventDefault();
          e.stopPropagation();
          service.revealFeedback(sessionResource, data.id);
        }
      }));
    }
    return templateData;
  }
  renderElement(node, _index, templateData) {
    const element = node.element;
    templateData.textElement.textContent = element.text;
    templateData.element = element;
    if (!this._agentFeedbackService) {
      templateData.hoverDisposable.value = this._hoverService.setupDelayedHover(
        templateData.row,
        () => this._buildCommentHover(element),
        { groupId: "agent-feedback-comment" }
      );
    }
    templateData.actionBar.clear();
    if (this._agentFeedbackService) {
      const service = this._agentFeedbackService;
      const sessionResource = this._sessionResource;
      templateData.actionBar.push(new Action(
        "agentFeedback.removeComment",
        localize("agentFeedbackHover.remove", "Remove"),
        ThemeIcon.asClassName(Codicon.close),
        true,
        () => {
          service.removeFeedback(sessionResource, element.id);
        }
      ), { icon: true, label: false });
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  _buildCommentHover(element) {
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    markdown.appendText(element.text);
    if (element.codeSelection) {
      const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(element.resourceUri);
      markdown.appendMarkdown("\n\n");
      markdown.appendCodeblock(languageId ?? "", element.codeSelection);
    }
    if (element.diffHunks) {
      markdown.appendMarkdown("\n\n");
      markdown.appendCodeblock("diff", element.diffHunks);
    }
    return {
      content: markdown,
      style: HoverStyle.Pointer,
      position: {
        hoverPosition: HoverPosition.RIGHT
      }
    };
  }
};
_FeedbackCommentRenderer.TEMPLATE_ID = "feedbackComment";
let FeedbackCommentRenderer = _FeedbackCommentRenderer;
let AgentFeedbackHover = class extends Disposable {
  constructor(_element, _attachment, _canDelete, _hoverService, _instantiationService, _agentFeedbackService, _languageService) {
    super();
    this._element = _element;
    this._attachment = _attachment;
    this._canDelete = _canDelete;
    this._hoverService = _hoverService;
    this._instantiationService = _instantiationService;
    this._agentFeedbackService = _agentFeedbackService;
    this._languageService = _languageService;
    this._store.add(this._hoverService.setupDelayedHover(
      this._element,
      () => this._store.add(this._buildHoverContent()),
      { groupId: "chat-attachments" }
    ));
    this._store.add(dom.addDisposableListener(this._element, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showHoverNow();
    }));
  }
  _showHoverNow() {
    const opts = this._buildHoverContent();
    this._register(opts);
    this._hoverService.showInstantHover({
      ...opts,
      target: this._element
    });
  }
  _buildHoverContent() {
    const disposables = new DisposableStore();
    const hoverElement = $("div.agent-feedback-hover");
    const treeContainer = dom.append(hoverElement, $(".results.show-file-icons.file-icon-themable-tree.agent-feedback-hover-tree"));
    const resourceLabels = disposables.add(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    const { children, commentElements } = this._buildTreeData();
    const tree = disposables.add(this._instantiationService.createInstance(
      WorkbenchObjectTree,
      "AgentFeedbackHoverTree",
      treeContainer,
      new FeedbackTreeDelegate(),
      [
        new FeedbackFileRenderer(resourceLabels, this._canDelete ? this._agentFeedbackService : void 0, this._attachment.sessionResource),
        new FeedbackCommentRenderer(this._canDelete ? this._agentFeedbackService : void 0, this._attachment.sessionResource, this._hoverService, this._languageService)
      ],
      {
        defaultIndent: 0,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            if (isFeedbackFileElement(element)) {
              return basename(element.uri.path);
            }
            return element.text;
          },
          getWidgetAriaLabel: () => localize("agentFeedbackHover.tree", "Feedback Comments")
        },
        identityProvider: {
          getId: (element) => {
            if (isFeedbackFileElement(element)) {
              return `file:${element.uri.toString()}`;
            }
            return `comment:${element.id}`;
          }
        },
        overrideStyles: {
          listFocusBackground: void 0,
          listInactiveFocusBackground: void 0,
          listActiveSelectionBackground: void 0,
          listFocusAndSelectionBackground: void 0,
          listInactiveSelectionBackground: void 0,
          listBackground: editorHoverBackground,
          listFocusForeground: void 0,
          treeStickyScrollBackground: editorHoverBackground
        }
      }
    ));
    tree.setChildren(null, children);
    const ROW_HEIGHT = 22;
    const MAX_ROWS = 8;
    const totalRows = commentElements.length + children.length;
    const treeHeight = Math.min(totalRows * ROW_HEIGHT, MAX_ROWS * ROW_HEIGHT);
    tree.layout(treeHeight, 200);
    treeContainer.style.height = `${treeHeight}px`;
    return {
      content: hoverElement,
      style: HoverStyle.Pointer,
      persistence: { hideOnHover: false },
      position: { hoverPosition: HoverPosition.ABOVE },
      trapFocus: true,
      appearance: { compact: true },
      additionalClasses: ["agent-feedback-hover-container"],
      dispose: () => disposables.dispose()
    };
  }
  _buildTreeData() {
    const byFile = /* @__PURE__ */ new Map();
    for (const item of this._attachment.feedbackItems) {
      const key = item.resourceUri.toString();
      let group = byFile.get(key);
      if (!group) {
        group = { uri: item.resourceUri, comments: [] };
        byFile.set(key, group);
      }
      group.comments.push({
        type: "comment",
        id: item.id,
        text: item.text,
        resourceUri: item.resourceUri,
        codeSelection: item.codeSelection,
        diffHunks: item.diffHunks
      });
    }
    const children = [];
    const allComments = [];
    for (const [, group] of byFile) {
      const fileElement = {
        type: "file",
        uri: group.uri,
        items: group.comments
      };
      allComments.push(...group.comments);
      children.push({
        element: fileElement,
        collapsible: true,
        collapsed: false,
        children: group.comments.map((comment) => ({
          element: comment,
          collapsible: false
        }))
      });
    }
    return { children, commentElements: allComments };
  }
};
AgentFeedbackHover = __decorateClass([
  __decorateParam(3, IHoverService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IAgentFeedbackService),
  __decorateParam(6, ILanguageService)
], AgentFeedbackHover);
export {
  AgentFeedbackHover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tIb3Zlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUsIElEZWxheWVkSG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElPYmplY3RUcmVlRWxlbWVudCwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGVkaXRvckhvdmVyQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vLyAtLS0gVHJlZSBFbGVtZW50IFR5cGVzIC0tLVxuXG5pbnRlcmZhY2UgSUZlZWRiYWNrRmlsZUVsZW1lbnQge1xuXHRyZWFkb25seSB0eXBlOiAnZmlsZSc7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBpdGVtczogUmVhZG9ubHlBcnJheTxJRmVlZGJhY2tDb21tZW50RWxlbWVudD47XG59XG5cbmludGVyZmFjZSBJRmVlZGJhY2tDb21tZW50RWxlbWVudCB7XG5cdHJlYWRvbmx5IHR5cGU6ICdjb21tZW50Jztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZVVyaTogVVJJO1xuXHRyZWFkb25seSBjb2RlU2VsZWN0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBkaWZmSHVua3M/OiBzdHJpbmc7XG59XG5cbnR5cGUgRmVlZGJhY2tUcmVlRWxlbWVudCA9IElGZWVkYmFja0ZpbGVFbGVtZW50IHwgSUZlZWRiYWNrQ29tbWVudEVsZW1lbnQ7XG5cbmZ1bmN0aW9uIGlzRmVlZGJhY2tGaWxlRWxlbWVudChlbGVtZW50OiBGZWVkYmFja1RyZWVFbGVtZW50KTogZWxlbWVudCBpcyBJRmVlZGJhY2tGaWxlRWxlbWVudCB7XG5cdHJldHVybiBlbGVtZW50LnR5cGUgPT09ICdmaWxlJztcbn1cblxuLy8gLS0tIFRyZWUgRGVsZWdhdGUgLS0tXG5cbmNsYXNzIEZlZWRiYWNrVHJlZURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8RmVlZGJhY2tUcmVlRWxlbWVudD4ge1xuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IEZlZWRiYWNrVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogRmVlZGJhY2tUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGlzRmVlZGJhY2tGaWxlRWxlbWVudChlbGVtZW50KVxuXHRcdFx0PyBGZWVkYmFja0ZpbGVSZW5kZXJlci5URU1QTEFURV9JRFxuXHRcdFx0OiBGZWVkYmFja0NvbW1lbnRSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG4vLyAtLS0gRmlsZSBSZW5kZXJlciAtLS1cblxuaW50ZXJmYWNlIElGZWVkYmFja0ZpbGVUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgRmVlZGJhY2tGaWxlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElGZWVkYmFja0ZpbGVFbGVtZW50LCB2b2lkLCBJRmVlZGJhY2tGaWxlVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2ZlZWRiYWNrRmlsZSc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBGZWVkYmFja0ZpbGVSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50RmVlZGJhY2tTZXJ2aWNlOiBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlOiBVUkksXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElGZWVkYmFja0ZpbGVUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fbGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2staG92ZXItYWN0aW9uLWJhcicpO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoYWN0aW9uQmFyQ29udGFpbmVyKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckNvbnRhaW5lcikpO1xuXG5cdFx0cmV0dXJuIHsgbGFiZWwsIGFjdGlvbkJhciwgdGVtcGxhdGVEaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUZlZWRiYWNrRmlsZUVsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmVlZGJhY2tGaWxlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cblx0XHRjb25zdCBuYW1lID0gYmFzZW5hbWUoZWxlbWVudC51cmkucGF0aCk7XG5cblxuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRSZXNvdXJjZShcblx0XHRcdHsgcmVzb3VyY2U6IGVsZW1lbnQudXJpLCBuYW1lIH0sXG5cdFx0XHR7IGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFIH0sXG5cdFx0KTtcblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UpIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3Nlc3Npb25SZXNvdXJjZTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnYWdlbnRGZWVkYmFjay5yZW1vdmVGaWxlQ29tbWVudHMnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRGZWVkYmFja0hvdmVyLnJlbW92ZUFsbCcsIFwiUmVtb3ZlIEFsbFwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGVsZW1lbnQuaXRlbXMpIHtcblx0XHRcdFx0XHRcdHNlcnZpY2UucmVtb3ZlRmVlZGJhY2soc2Vzc2lvblJlc291cmNlLCBpdGVtLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdCksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGZWVkYmFja0ZpbGVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyAtLS0gQ29tbWVudCBSZW5kZXJlciAtLS1cblxuaW50ZXJmYWNlIElGZWVkYmFja0NvbW1lbnRUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IHRleHRFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgcm93OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgaG92ZXJEaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG5cdGVsZW1lbnQ6IElGZWVkYmFja0NvbW1lbnRFbGVtZW50IHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBGZWVkYmFja0NvbW1lbnRSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SUZlZWRiYWNrQ29tbWVudEVsZW1lbnQsIHZvaWQsIElGZWVkYmFja0NvbW1lbnRUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnZmVlZGJhY2tDb21tZW50Jztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEZlZWRiYWNrQ29tbWVudFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50RmVlZGJhY2tTZXJ2aWNlOiBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZlZWRiYWNrQ29tbWVudFRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgcm93ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay1ob3Zlci1jb21tZW50LXJvdycpKTtcblxuXHRcdGNvbnN0IHRleHRFbGVtZW50ID0gZG9tLmFwcGVuZChyb3csICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay1ob3Zlci1jb21tZW50LXRleHQnKSk7XG5cblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBkb20uYXBwZW5kKHJvdywgJCgnZGl2LmFnZW50LWZlZWRiYWNrLWhvdmVyLWFjdGlvbi1iYXInKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihhY3Rpb25CYXJDb250YWluZXIpKTtcblxuXHRcdGNvbnN0IGhvdmVyRGlzcG9zYWJsZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YTogSUZlZWRiYWNrQ29tbWVudFRlbXBsYXRlID0geyB0ZXh0RWxlbWVudCwgcm93LCBhY3Rpb25CYXIsIHRlbXBsYXRlRGlzcG9zYWJsZXMsIGhvdmVyRGlzcG9zYWJsZSwgZWxlbWVudDogdW5kZWZpbmVkIH07XG5cblx0XHRpZiAodGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UpIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3Nlc3Npb25SZXNvdXJjZTtcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocm93LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGVtcGxhdGVEYXRhLmVsZW1lbnQ7XG5cdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0c2VydmljZS5yZXZlYWxGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UsIGRhdGEuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRlbXBsYXRlRGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElGZWVkYmFja0NvbW1lbnRFbGVtZW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZlZWRiYWNrQ29tbWVudFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblxuXHRcdHRlbXBsYXRlRGF0YS50ZXh0RWxlbWVudC50ZXh0Q29udGVudCA9IGVsZW1lbnQudGV4dDtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudCA9IGVsZW1lbnQ7XG5cblx0XHQvLyBJbiByZWFkLW9ubHkgbW9kZSwgc2V0IHVwIGEgcmljaCBtYXJrZG93biBob3ZlciB3aXRoIGNvbW1lbnQgKyBjb2RlIHNuaXBwZXRcblx0XHRpZiAoIXRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaG92ZXJEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKFxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucm93LFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9idWlsZENvbW1lbnRIb3ZlcihlbGVtZW50KSxcblx0XHRcdFx0eyBncm91cElkOiAnYWdlbnQtZmVlZGJhY2stY29tbWVudCcgfVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2U7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl9zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0J2FnZW50RmVlZGJhY2sucmVtb3ZlQ29tbWVudCcsXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrSG92ZXIucmVtb3ZlJywgXCJSZW1vdmVcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHNlcnZpY2UucmVtb3ZlRmVlZGJhY2soc2Vzc2lvblJlc291cmNlLCBlbGVtZW50LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0KSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZlZWRiYWNrQ29tbWVudFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRDb21tZW50SG92ZXIoZWxlbWVudDogSUZlZWRiYWNrQ29tbWVudEVsZW1lbnQpOiBJRGVsYXllZEhvdmVyT3B0aW9ucyB7XG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGVsZW1lbnQudGV4dCk7XG5cblx0XHRpZiAoZWxlbWVudC5jb2RlU2VsZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShlbGVtZW50LnJlc291cmNlVXJpKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZENvZGVibG9jayhsYW5ndWFnZUlkID8/ICcnLCBlbGVtZW50LmNvZGVTZWxlY3Rpb24pO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50LmRpZmZIdW5rcykge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kQ29kZWJsb2NrKCdkaWZmJywgZWxlbWVudC5kaWZmSHVua3MpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBtYXJrZG93bixcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLlJJR0hULFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59XG5cbi8vIC0tLSBIb3ZlciAtLS1cblxuLyoqXG4gKiBDcmVhdGVzIHRoZSBjdXN0b20gaG92ZXIgY29udGVudCBmb3IgdGhlIFwiTiBjb21tZW50c1wiIGF0dGFjaG1lbnQuXG4gKiBVc2VzIGEgV29ya2JlbmNoT2JqZWN0VHJlZSB0byByZW5kZXIgZmlsZXMgYXMgcGFyZW50IG5vZGVzIGFuZCBjb21tZW50cyBhcyBjaGlsZHJlbixcbiAqIHdpdGggcGVyLXJvdyBhY3Rpb24gYmFycyBmb3IgcmVtb3ZhbC5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50RmVlZGJhY2tIb3ZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2F0dGFjaG1lbnQ6IElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYW5EZWxldGU6IGJvb2xlYW4sXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50RmVlZGJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50RmVlZGJhY2tTZXJ2aWNlOiBJQWdlbnRGZWVkYmFja1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gU2hvdyBvbiBob3ZlciAoZGVsYXllZClcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKFxuXHRcdFx0dGhpcy5fZWxlbWVudCxcblx0XHRcdCgpID0+IHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9idWlsZEhvdmVyQ29udGVudCgpKSxcblx0XHRcdHsgZ3JvdXBJZDogJ2NoYXQtYXR0YWNobWVudHMnIH1cblx0XHQpKTtcblxuXHRcdC8vIFNob3cgaW1tZWRpYXRlbHkgb24gY2xpY2tcblx0XHR0aGlzLl9zdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX3Nob3dIb3Zlck5vdygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dIb3Zlck5vdygpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRzID0gdGhpcy5fYnVpbGRIb3ZlckNvbnRlbnQoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvcHRzKTtcblx0XHR0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHQuLi5vcHRzLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLl9lbGVtZW50LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRIb3ZlckNvbnRlbnQoKTogSURlbGF5ZWRIb3Zlck9wdGlvbnMgJiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLWhvdmVyJyk7XG5cblx0XHQvLyBUcmVlIGNvbnRhaW5lclxuXHRcdGNvbnN0IHRyZWVDb250YWluZXIgPSBkb20uYXBwZW5kKGhvdmVyRWxlbWVudCwgJCgnLnJlc3VsdHMuc2hvdy1maWxlLWljb25zLmZpbGUtaWNvbi10aGVtYWJsZS10cmVlLmFnZW50LWZlZWRiYWNrLWhvdmVyLXRyZWUnKSk7XG5cblx0XHQvLyBSZXNvdXJjZSBsYWJlbHMgKHNoYXJlZCBhY3Jvc3MgYWxsIGZpbGUgcmVuZGVyZXJzKVxuXHRcdGNvbnN0IHJlc291cmNlTGFiZWxzID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpKTtcblxuXHRcdC8vIEJ1aWxkIHRyZWUgZGF0YVxuXHRcdGNvbnN0IHsgY2hpbGRyZW4sIGNvbW1lbnRFbGVtZW50cyB9ID0gdGhpcy5fYnVpbGRUcmVlRGF0YSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRyZWVcblx0XHRjb25zdCB0cmVlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoT2JqZWN0VHJlZTxGZWVkYmFja1RyZWVFbGVtZW50Pixcblx0XHRcdCdBZ2VudEZlZWRiYWNrSG92ZXJUcmVlJyxcblx0XHRcdHRyZWVDb250YWluZXIsXG5cdFx0XHRuZXcgRmVlZGJhY2tUcmVlRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IEZlZWRiYWNrRmlsZVJlbmRlcmVyKHJlc291cmNlTGFiZWxzLCB0aGlzLl9jYW5EZWxldGUgPyB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZSA6IHVuZGVmaW5lZCwgdGhpcy5fYXR0YWNobWVudC5zZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0XHRuZXcgRmVlZGJhY2tDb21tZW50UmVuZGVyZXIodGhpcy5fY2FuRGVsZXRlID8gdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UgOiB1bmRlZmluZWQsIHRoaXMuX2F0dGFjaG1lbnQuc2Vzc2lvblJlc291cmNlLCB0aGlzLl9ob3ZlclNlcnZpY2UsIHRoaXMuX2xhbmd1YWdlU2VydmljZSksXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRkZWZhdWx0SW5kZW50OiAwLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGVsZW1lbnQ6IEZlZWRiYWNrVHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc0ZlZWRiYWNrRmlsZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKGVsZW1lbnQudXJpLnBhdGgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQudGV4dDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2tIb3Zlci50cmVlJywgXCJGZWVkYmFjayBDb21tZW50c1wiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoZWxlbWVudDogRmVlZGJhY2tUcmVlRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzRmVlZGJhY2tGaWxlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYGZpbGU6JHtlbGVtZW50LnVyaS50b1N0cmluZygpfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gYGNvbW1lbnQ6JHtlbGVtZW50LmlkfWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRcdGxpc3RGb2N1c0JhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckhvdmVyQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0Rm9jdXNGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dHJlZVN0aWNreVNjcm9sbEJhY2tncm91bmQ6IGVkaXRvckhvdmVyQmFja2dyb3VuZCxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gU2V0IHRyZWUgZGF0YVxuXHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgY2hpbGRyZW4pO1xuXG5cdFx0Ly8gTGF5b3V0IHRyZWU6IGNsYW1wIHRvIHJlYXNvbmFibGUgaGVpZ2h0XG5cdFx0Y29uc3QgUk9XX0hFSUdIVCA9IDIyO1xuXHRcdGNvbnN0IE1BWF9ST1dTID0gODtcblx0XHRjb25zdCB0b3RhbFJvd3MgPSBjb21tZW50RWxlbWVudHMubGVuZ3RoICsgY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdGNvbnN0IHRyZWVIZWlnaHQgPSBNYXRoLm1pbih0b3RhbFJvd3MgKiBST1dfSEVJR0hULCBNQVhfUk9XUyAqIFJPV19IRUlHSFQpO1xuXHRcdHRyZWUubGF5b3V0KHRyZWVIZWlnaHQsIDIwMCk7XG5cdFx0dHJlZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0cmVlSGVpZ2h0fXB4YDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBob3ZlckVsZW1lbnQsXG5cdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdFx0cGVyc2lzdGVuY2U6IHsgaGlkZU9uSG92ZXI6IGZhbHNlIH0sXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkFCT1ZFIH0sXG5cdFx0XHR0cmFwRm9jdXM6IHRydWUsXG5cdFx0XHRhcHBlYXJhbmNlOiB7IGNvbXBhY3Q6IHRydWUgfSxcblx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2FnZW50LWZlZWRiYWNrLWhvdmVyLWNvbnRhaW5lciddLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZFRyZWVEYXRhKCk6IHsgY2hpbGRyZW46IElPYmplY3RUcmVlRWxlbWVudDxGZWVkYmFja1RyZWVFbGVtZW50PltdOyBjb21tZW50RWxlbWVudHM6IElGZWVkYmFja0NvbW1lbnRFbGVtZW50W10gfSB7XG5cdFx0Ly8gR3JvdXAgZmVlZGJhY2sgaXRlbXMgYnkgZmlsZVxuXHRcdGNvbnN0IGJ5RmlsZSA9IG5ldyBNYXA8c3RyaW5nLCB7IHVyaTogVVJJOyBjb21tZW50czogSUZlZWRiYWNrQ29tbWVudEVsZW1lbnRbXSB9PigpO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuX2F0dGFjaG1lbnQuZmVlZGJhY2tJdGVtcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gaXRlbS5yZXNvdXJjZVVyaS50b1N0cmluZygpO1xuXHRcdFx0bGV0IGdyb3VwID0gYnlGaWxlLmdldChrZXkpO1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRncm91cCA9IHsgdXJpOiBpdGVtLnJlc291cmNlVXJpLCBjb21tZW50czogW10gfTtcblx0XHRcdFx0YnlGaWxlLnNldChrZXksIGdyb3VwKTtcblx0XHRcdH1cblx0XHRcdGdyb3VwLmNvbW1lbnRzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnY29tbWVudCcsXG5cdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHRcdHJlc291cmNlVXJpOiBpdGVtLnJlc291cmNlVXJpLFxuXHRcdFx0XHRjb2RlU2VsZWN0aW9uOiBpdGVtLmNvZGVTZWxlY3Rpb24sXG5cdFx0XHRcdGRpZmZIdW5rczogaXRlbS5kaWZmSHVua3MsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZHJlbjogSU9iamVjdFRyZWVFbGVtZW50PEZlZWRiYWNrVHJlZUVsZW1lbnQ+W10gPSBbXTtcblx0XHRjb25zdCBhbGxDb21tZW50czogSUZlZWRiYWNrQ29tbWVudEVsZW1lbnRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbLCBncm91cF0gb2YgYnlGaWxlKSB7XG5cdFx0XHRjb25zdCBmaWxlRWxlbWVudDogSUZlZWRiYWNrRmlsZUVsZW1lbnQgPSB7XG5cdFx0XHRcdHR5cGU6ICdmaWxlJyxcblx0XHRcdFx0dXJpOiBncm91cC51cmksXG5cdFx0XHRcdGl0ZW1zOiBncm91cC5jb21tZW50cyxcblx0XHRcdH07XG5cblx0XHRcdGFsbENvbW1lbnRzLnB1c2goLi4uZ3JvdXAuY29tbWVudHMpO1xuXG5cdFx0XHRjaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0ZWxlbWVudDogZmlsZUVsZW1lbnQsXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRjaGlsZHJlbjogZ3JvdXAuY29tbWVudHMubWFwKGNvbW1lbnQgPT4gKHtcblx0XHRcdFx0XHRlbGVtZW50OiBjb21tZW50LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgY2hpbGRyZW4sIGNvbW1lbnRFbGVtZW50czogYWxsQ29tbWVudHMgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBd0M7QUFDakQsU0FBUyxxQkFBcUI7QUFHOUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQyxzQkFBc0I7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
