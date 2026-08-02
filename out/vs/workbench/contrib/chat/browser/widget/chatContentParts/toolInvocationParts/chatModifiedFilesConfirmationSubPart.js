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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Button, ButtonWithIcon } from "../../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { basename, isEqual } from "../../../../../../../base/common/resources.js";
import { hasKey } from "../../../../../../../base/common/types.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { IMarkdownRendererService } from "../../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { ModifiedFileEntryState } from "../../../../common/editing/chatEditingService.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { renderFileWidgets } from "../chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "../chatMarkdownAnchorService.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
import { createApprovalReasonBadge } from "./toolRiskBadgeHelper.js";
function isCreatedFile(file) {
  return file.editKind === "create" || file.editKind === void 0 && !file.originalUri && !file.originalContentUri && !!file.modifiedContentUri;
}
function findModifiedFileConfirmationEntry(modifiedFiles, resource) {
  return modifiedFiles.find((file) => isEqual(URI.revive(file.uri), resource));
}
function getModifiedFilesSummaryLabel(modifiedFiles) {
  const allFilesCreated = modifiedFiles.length > 0 && modifiedFiles.every(isCreatedFile);
  if (allFilesCreated) {
    return modifiedFiles.length === 1 ? localize("oneFileCreated", "1 file created") : localize("manyFilesCreated", "{0} files created", modifiedFiles.length);
  }
  return modifiedFiles.length === 1 ? localize("oneFileChanged", "1 file changed") : localize("manyFilesChanged", "{0} files changed", modifiedFiles.length);
}
function createModifiedFilePreviewEditorInput(resource, originalUri, modifiedContentUri, title, options) {
  const modifiedUri = modifiedContentUri ?? resource;
  if (originalUri) {
    return {
      original: { resource: originalUri },
      modified: { resource: modifiedUri },
      options
    };
  }
  if (modifiedContentUri) {
    return {
      label: title ?? basename(resource),
      original: { resource: void 0, contents: "" },
      modified: { resource: modifiedContentUri },
      options
    };
  }
  return { resource, options };
}
let ChatModifiedFilesConfirmationSubPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, listPool, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, markdownRendererService, chatMarkdownAnchorService, editorService, commandService, riskAssessmentService) {
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.listPool = listPool;
    this.markdownRendererService = markdownRendererService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.editorService = editorService;
    this.commandService = commandService;
    this.codeblocks = [];
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
      throw new Error("Modified files confirmation messages are missing");
    }
    const data = toolInvocation.toolSpecificData;
    if (!data || data.kind !== "modifiedFilesConfirmation") {
      throw new Error("Modified files confirmation data is missing");
    }
    const tool = languageModelToolsService.getTool(toolInvocation.toolId);
    const confirmWidget = this._register(this.instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      this.context,
      {
        title: this.getTitle(),
        icon: tool?.icon && hasKey(tool.icon, { id: true }) ? tool.icon : Codicon.tools,
        subtitle: typeof toolInvocation.originMessage === "string" ? toolInvocation.originMessage : toolInvocation.originMessage?.value,
        buttons: this.createButtons(data.options),
        message: this.createWidgetContentElement(state.confirmationMessages.message, data),
        footerBanner: createApprovalReasonBadge(this._store, this.instantiationService, state.confirmationMessages.approvalReason)?.domNode ?? this.createRiskBadgeDomNode(state.parameters)
      }
    ));
    const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
    hasToolConfirmation.set(true);
    this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
      button.data();
      if (!isTouchClick) {
        this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
      }
    }));
    this._register(toDisposable(() => hasToolConfirmation.reset()));
    this.domNode = confirmWidget.domNode;
  }
  createButtons(options) {
    const [primaryOption, ...secondaryOptions] = options;
    return [
      {
        label: primaryOption,
        data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: primaryOption }),
        moreActions: secondaryOptions.map((option) => ({
          label: option,
          data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: option })
        }))
      }
    ];
  }
  createWidgetContentElement(message, data) {
    const container = dom.$(".chat-modified-files-confirmation");
    if (message) {
      const renderedMessage = this._register(this.markdownRendererService.render(typeof message === "string" ? new MarkdownString(message) : message));
      renderFileWidgets(renderedMessage.element, this.instantiationService, this.chatMarkdownAnchorService, this._store, {
        ...this.openedEditors.fileWidgetOptions,
        openResource: (resource, editorOptions) => this.openModifiedFilePreview(data, resource, editorOptions)
      });
      container.append(renderedMessage.element);
    }
    container.append(this.createModifiedFilesElement(data));
    return container;
  }
  createModifiedFilesElement(data) {
    const container = dom.$(".chat-modified-files-confirmation-list.chat-editing-session-container.show-file-icons");
    const overview = dom.append(container, dom.$(".chat-editing-session-overview"));
    const title = dom.append(overview, dom.$(".working-set-title"));
    const titleButton = this._register(new ButtonWithIcon(title, {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      supportIcons: true
    }));
    const actions = dom.append(overview, dom.$(".chat-editing-session-actions"));
    const countsContainer = dom.$(".working-set-line-counts");
    const addedSpan = dom.append(countsContainer, dom.$(".working-set-lines-added"));
    const removedSpan = dom.append(countsContainer, dom.$(".working-set-lines-removed"));
    titleButton.element.appendChild(countsContainer);
    const filesLabel = getModifiedFilesSummaryLabel(data.modifiedFiles);
    titleButton.label = filesLabel;
    let added = 0;
    let removed = 0;
    let hasDiffStats = false;
    for (const file of data.modifiedFiles) {
      if (typeof file.insertions === "number" || typeof file.deletions === "number") {
        hasDiffStats = true;
        added += file.insertions ?? 0;
        removed += file.deletions ?? 0;
      }
    }
    if (hasDiffStats) {
      addedSpan.textContent = `+${added}`;
      removedSpan.textContent = `-${removed}`;
      titleButton.element.setAttribute("aria-label", localize("modifiedFilesSummaryWithCounts", "{0}, {1} lines added, {2} lines removed", filesLabel, added, removed));
      countsContainer.setAttribute("aria-label", localize("modifiedFilesCounts", "{0} lines added, {1} lines removed", added, removed));
    } else {
      countsContainer.remove();
      titleButton.element.setAttribute("aria-label", filesLabel);
    }
    const viewAllChangesButton = this._register(new Button(actions, {
      ...defaultButtonStyles,
      secondary: true,
      small: true,
      supportIcons: true,
      ariaLabel: localize("viewAllChanges", "View All Changes"),
      title: localize("viewAllChanges", "View All Changes")
    }));
    viewAllChangesButton.element.classList.add("default-colors");
    viewAllChangesButton.icon = Codicon.diffMultiple;
    viewAllChangesButton.label = " ";
    this._register(viewAllChangesButton.onDidClick(async () => {
      await this.openAllChanges(data);
    }));
    const listReference = this._register(this.listPool.get());
    const list = listReference.object;
    const listItems = data.modifiedFiles.map((file) => {
      const resource = URI.revive(file.uri);
      const originalUri = file.originalUri ? URI.revive(file.originalUri) : void 0;
      const modifiedContentUri = file.modifiedContentUri ? URI.revive(file.modifiedContentUri) : void 0;
      const originalContentUri = file.originalContentUri ? URI.revive(file.originalContentUri) : void 0;
      return {
        kind: "reference",
        reference: resource,
        title: file.title,
        description: file.description,
        state: ModifiedFileEntryState.Accepted,
        showModifiedState: true,
        options: {
          diffMeta: typeof file.insertions === "number" || typeof file.deletions === "number" ? {
            added: file.insertions ?? 0,
            removed: file.deletions ?? 0
          } : void 0,
          originalUri: originalContentUri ?? originalUri,
          modifiedUri: modifiedContentUri,
          status: void 0
        }
      };
    });
    this._register(list.onDidOpen(async (e) => {
      if (e.element?.kind !== "reference" || !URI.isUri(e.element.reference)) {
        return;
      }
      const options = e.element.options;
      await this.editorService.openEditor(createModifiedFilePreviewEditorInput(
        e.element.reference,
        options?.originalUri,
        options?.modifiedUri,
        e.element.title,
        e.editorOptions
      ));
    }));
    const maxItemsShown = 6;
    const itemsShown = Math.min(listItems.length, maxItemsShown);
    const height = itemsShown * 22;
    const workingSetContainer = dom.append(container, dom.$(".chat-editing-session-list.collapsed"));
    list.layout(height);
    list.getHTMLElement().style.height = `${height}px`;
    list.splice(0, list.length, listItems);
    workingSetContainer.append(list.getHTMLElement());
    let isCollapsed = true;
    const setExpansionState = () => {
      titleButton.icon = isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
      workingSetContainer.classList.toggle("collapsed", isCollapsed);
    };
    setExpansionState();
    const toggleWorkingSet = () => {
      isCollapsed = !isCollapsed;
      setExpansionState();
    };
    this._register(titleButton.onDidClick(toggleWorkingSet));
    this._register(dom.addDisposableListener(overview, "click", (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target;
      if (target.closest(".monaco-button")) {
        return;
      }
      toggleWorkingSet();
    }));
    return container;
  }
  async openModifiedFilePreview(data, resource, editorOptions) {
    const file = findModifiedFileConfirmationEntry(data.modifiedFiles, resource);
    if (!file) {
      return false;
    }
    await this.editorService.openEditor(createModifiedFilePreviewEditorInput(
      resource,
      file.originalContentUri ? URI.revive(file.originalContentUri) : file.originalUri ? URI.revive(file.originalUri) : void 0,
      file.modifiedContentUri ? URI.revive(file.modifiedContentUri) : void 0,
      file.title,
      editorOptions
    ));
    return true;
  }
  async openAllChanges(data) {
    await this.commandService.executeCommand("_workbench.openMultiDiffEditor", {
      title: localize("modifiedFilesAllChangesTitle", "All Changes"),
      resources: data.modifiedFiles.map((file) => ({
        originalUri: file.originalContentUri ? URI.revive(file.originalContentUri) : file.originalUri ? URI.revive(file.originalUri) : void 0,
        modifiedUri: file.modifiedContentUri ? URI.revive(file.modifiedContentUri) : URI.revive(file.uri)
      }))
    });
  }
  createContentElement() {
    throw new Error("Not used");
  }
  getTitle() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const title = state.confirmationMessages?.title;
    return typeof title === "string" ? title : title?.value ?? "";
  }
};
ChatModifiedFilesConfirmationSubPart = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, ILanguageModelToolsService),
  __decorateParam(8, IMarkdownRendererService),
  __decorateParam(9, IChatMarkdownAnchorService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, IChatToolRiskAssessmentService)
], ChatModifiedFilesConfirmationSubPart);
export {
  ChatModifiedFilesConfirmationSubPart,
  createModifiedFilePreviewEditorInput,
  findModifiedFileConfirmationEntry,
  getModifiedFilesSummaryLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uU3ViUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uV2l0aEljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSwgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0LCBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbiB9IGZyb20gJy4uL2NoYXRDb25maXJtYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgcmVuZGVyRmlsZVdpZGdldHMgfSBmcm9tICcuLi9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzaWJsZUxpc3RQb29sLCBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0gfSBmcm9tICcuLi9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IElVbnR5cGVkRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQgfSBmcm9tICcuL2Fic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlQXBwcm92YWxSZWFzb25CYWRnZSB9IGZyb20gJy4vdG9vbFJpc2tCYWRnZUhlbHBlci5qcyc7XG5cbnR5cGUgTW9kaWZpZWRGaWxlQ29uZmlybWF0aW9uRW50cnkgPSBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhWydtb2RpZmllZEZpbGVzJ11bbnVtYmVyXTtcblxuZnVuY3Rpb24gaXNDcmVhdGVkRmlsZShmaWxlOiBNb2RpZmllZEZpbGVDb25maXJtYXRpb25FbnRyeSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZmlsZS5lZGl0S2luZCA9PT0gJ2NyZWF0ZScgfHwgKGZpbGUuZWRpdEtpbmQgPT09IHVuZGVmaW5lZCAmJiAhZmlsZS5vcmlnaW5hbFVyaSAmJiAhZmlsZS5vcmlnaW5hbENvbnRlbnRVcmkgJiYgISFmaWxlLm1vZGlmaWVkQ29udGVudFVyaSk7XG59XG5cbi8qKiBSZXR1cm5zIHRoZSBwZW5kaW5nIGZpbGUgZW50cnkgcmVmZXJlbmNlZCBieSBhIGNvbmZpcm1hdGlvbi1tZXNzYWdlIGxpbmsuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZE1vZGlmaWVkRmlsZUNvbmZpcm1hdGlvbkVudHJ5KG1vZGlmaWVkRmlsZXM6IHJlYWRvbmx5IE1vZGlmaWVkRmlsZUNvbmZpcm1hdGlvbkVudHJ5W10sIHJlc291cmNlOiBVUkkpOiBNb2RpZmllZEZpbGVDb25maXJtYXRpb25FbnRyeSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBtb2RpZmllZEZpbGVzLmZpbmQoZmlsZSA9PiBpc0VxdWFsKFVSSS5yZXZpdmUoZmlsZS51cmkpLCByZXNvdXJjZSkpO1xufVxuXG4vKiogUmV0dXJucyB0aGUgc3VtbWFyeSBzaG93biBhYm92ZSBwZW5kaW5nIGZpbGUgY2hhbmdlcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RpZmllZEZpbGVzU3VtbWFyeUxhYmVsKG1vZGlmaWVkRmlsZXM6IHJlYWRvbmx5IE1vZGlmaWVkRmlsZUNvbmZpcm1hdGlvbkVudHJ5W10pOiBzdHJpbmcge1xuXHRjb25zdCBhbGxGaWxlc0NyZWF0ZWQgPSBtb2RpZmllZEZpbGVzLmxlbmd0aCA+IDAgJiYgbW9kaWZpZWRGaWxlcy5ldmVyeShpc0NyZWF0ZWRGaWxlKTtcblx0aWYgKGFsbEZpbGVzQ3JlYXRlZCkge1xuXHRcdHJldHVybiBtb2RpZmllZEZpbGVzLmxlbmd0aCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnb25lRmlsZUNyZWF0ZWQnLCAnMSBmaWxlIGNyZWF0ZWQnKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbWFueUZpbGVzQ3JlYXRlZCcsICd7MH0gZmlsZXMgY3JlYXRlZCcsIG1vZGlmaWVkRmlsZXMubGVuZ3RoKTtcblx0fVxuXG5cdHJldHVybiBtb2RpZmllZEZpbGVzLmxlbmd0aCA9PT0gMVxuXHRcdD8gbG9jYWxpemUoJ29uZUZpbGVDaGFuZ2VkJywgJzEgZmlsZSBjaGFuZ2VkJylcblx0XHQ6IGxvY2FsaXplKCdtYW55RmlsZXNDaGFuZ2VkJywgJ3swfSBmaWxlcyBjaGFuZ2VkJywgbW9kaWZpZWRGaWxlcy5sZW5ndGgpO1xufVxuXG4vKiogQ3JlYXRlcyB0aGUgZWRpdG9yIGlucHV0IHVzZWQgdG8gcHJldmlldyBhIHBlbmRpbmcgZmlsZSBjaGFuZ2UuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRGaWxlUHJldmlld0VkaXRvcklucHV0KHJlc291cmNlOiBVUkksIG9yaWdpbmFsVXJpOiBVUkkgfCB1bmRlZmluZWQsIG1vZGlmaWVkQ29udGVudFVyaTogVVJJIHwgdW5kZWZpbmVkLCB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IElVbnR5cGVkRWRpdG9ySW5wdXQge1xuXHRjb25zdCBtb2RpZmllZFVyaSA9IG1vZGlmaWVkQ29udGVudFVyaSA/PyByZXNvdXJjZTtcblx0aWYgKG9yaWdpbmFsVXJpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBvcmlnaW5hbFVyaSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IG1vZGlmaWVkVXJpIH0sXG5cdFx0XHRvcHRpb25zLFxuXHRcdH07XG5cdH1cblxuXHRpZiAobW9kaWZpZWRDb250ZW50VXJpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiB0aXRsZSA/PyBiYXNlbmFtZShyZXNvdXJjZSksXG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogdW5kZWZpbmVkLCBjb250ZW50czogJycgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBtb2RpZmllZENvbnRlbnRVcmkgfSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiB7IHJlc291cmNlLCBvcHRpb25zIH07XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblN1YlBhcnQgZXh0ZW5kcyBBYnN0cmFjdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IHtcblx0cHVibGljIG92ZXJyaWRlIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwdWJsaWMgb3ZlcnJpZGUgcmVhZG9ubHkgY29kZWJsb2NrczogSUNoYXRDb2RlQmxvY2tJbmZvW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSByaXNrQXNzZXNzbWVudFNlcnZpY2U6IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodG9vbEludm9jYXRpb24sIGNvbnRleHQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCByaXNrQXNzZXNzbWVudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiB8fCAhc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01vZGlmaWVkIGZpbGVzIGNvbmZpcm1hdGlvbiBtZXNzYWdlcyBhcmUgbWlzc2luZycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXHRcdGlmICghZGF0YSB8fCBkYXRhLmtpbmQgIT09ICdtb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNb2RpZmllZCBmaWxlcyBjb25maXJtYXRpb24gZGF0YSBpcyBtaXNzaW5nJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9vbCA9IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbCh0b29sSW52b2NhdGlvbi50b29sSWQpO1xuXHRcdGNvbnN0IGNvbmZpcm1XaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdEN1c3RvbUNvbmZpcm1hdGlvbldpZGdldDwoKSA9PiB2b2lkPixcblx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdHtcblx0XHRcdFx0dGl0bGU6IHRoaXMuZ2V0VGl0bGUoKSxcblx0XHRcdFx0aWNvbjogdG9vbD8uaWNvbiAmJiBoYXNLZXkodG9vbC5pY29uLCB7IGlkOiB0cnVlIH0pID8gdG9vbC5pY29uIDogQ29kaWNvbi50b29scyxcblx0XHRcdFx0c3VidGl0bGU6IHR5cGVvZiB0b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlID09PSAnc3RyaW5nJyA/IHRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2UgOiB0b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlPy52YWx1ZSxcblx0XHRcdFx0YnV0dG9uczogdGhpcy5jcmVhdGVCdXR0b25zKGRhdGEub3B0aW9ucyksXG5cdFx0XHRcdG1lc3NhZ2U6IHRoaXMuY3JlYXRlV2lkZ2V0Q29udGVudEVsZW1lbnQoc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZSwgZGF0YSksXG5cdFx0XHRcdGZvb3RlckJhbm5lcjogY3JlYXRlQXBwcm92YWxSZWFzb25CYWRnZSh0aGlzLl9zdG9yZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXMuYXBwcm92YWxSZWFzb24pPy5kb21Ob2RlXG5cdFx0XHRcdFx0Pz8gdGhpcy5jcmVhdGVSaXNrQmFkZ2VEb21Ob2RlKHN0YXRlLnBhcmFtZXRlcnMpLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgaGFzVG9vbENvbmZpcm1hdGlvbiA9IENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1Rvb2xDb25maXJtYXRpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGhhc1Rvb2xDb25maXJtYXRpb24uc2V0KHRydWUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlybVdpZGdldC5vbkRpZENsaWNrKCh7IGJ1dHRvbiwgaXNUb3VjaENsaWNrIH0pID0+IHtcblx0XHRcdGJ1dHRvbi5kYXRhKCk7XG5cdFx0XHRpZiAoIWlzVG91Y2hDbGljaykge1xuXHRcdFx0XHR0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk/LmZvY3VzSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gaGFzVG9vbENvbmZpcm1hdGlvbi5yZXNldCgpKSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gY29uZmlybVdpZGdldC5kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCdXR0b25zKG9wdGlvbnM6IHJlYWRvbmx5IHN0cmluZ1tdKTogSUNoYXRDb25maXJtYXRpb25CdXR0b248KCkgPT4gdm9pZD5bXSB7XG5cdFx0Y29uc3QgW3ByaW1hcnlPcHRpb24sIC4uLnNlY29uZGFyeU9wdGlvbnNdID0gb3B0aW9ucztcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogcHJpbWFyeU9wdGlvbixcblx0XHRcdFx0ZGF0YTogKCkgPT4gdGhpcy5jb25maXJtV2l0aCh0aGlzLnRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uLCBzZWxlY3RlZEJ1dHRvbjogcHJpbWFyeU9wdGlvbiB9KSxcblx0XHRcdFx0bW9yZUFjdGlvbnM6IHNlY29uZGFyeU9wdGlvbnMubWFwKG9wdGlvbiA9PiAoe1xuXHRcdFx0XHRcdGxhYmVsOiBvcHRpb24sXG5cdFx0XHRcdFx0ZGF0YTogKCkgPT4gdGhpcy5jb25maXJtV2l0aCh0aGlzLnRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uLCBzZWxlY3RlZEJ1dHRvbjogb3B0aW9uIH0pLFxuXHRcdFx0XHR9KSlcblx0XHRcdH1cblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVXaWRnZXRDb250ZW50RWxlbWVudChtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsIGRhdGE6IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJy5jaGF0LW1vZGlmaWVkLWZpbGVzLWNvbmZpcm1hdGlvbicpO1xuXG5cdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlKSA6IG1lc3NhZ2UpKTtcblx0XHRcdHJlbmRlckZpbGVXaWRnZXRzKHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50LCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIHRoaXMuX3N0b3JlLCB7XG5cdFx0XHRcdC4uLnRoaXMub3BlbmVkRWRpdG9ycy5maWxlV2lkZ2V0T3B0aW9ucyxcblx0XHRcdFx0b3BlblJlc291cmNlOiAocmVzb3VyY2UsIGVkaXRvck9wdGlvbnMpID0+IHRoaXMub3Blbk1vZGlmaWVkRmlsZVByZXZpZXcoZGF0YSwgcmVzb3VyY2UsIGVkaXRvck9wdGlvbnMpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kKHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50KTtcblx0XHR9XG5cblx0XHRjb250YWluZXIuYXBwZW5kKHRoaXMuY3JlYXRlTW9kaWZpZWRGaWxlc0VsZW1lbnQoZGF0YSkpO1xuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1vZGlmaWVkRmlsZXNFbGVtZW50KGRhdGE6IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJy5jaGF0LW1vZGlmaWVkLWZpbGVzLWNvbmZpcm1hdGlvbi1saXN0LmNoYXQtZWRpdGluZy1zZXNzaW9uLWNvbnRhaW5lci5zaG93LWZpbGUtaWNvbnMnKTtcblx0XHRjb25zdCBvdmVydmlldyA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLW92ZXJ2aWV3JykpO1xuXHRcdGNvbnN0IHRpdGxlID0gZG9tLmFwcGVuZChvdmVydmlldywgZG9tLiQoJy53b3JraW5nLXNldC10aXRsZScpKTtcblx0XHRjb25zdCB0aXRsZUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b25XaXRoSWNvbih0aXRsZSwge1xuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2VwYXJhdG9yOiB1bmRlZmluZWQsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBkb20uYXBwZW5kKG92ZXJ2aWV3LCBkb20uJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgY291bnRzQ29udGFpbmVyID0gZG9tLiQoJy53b3JraW5nLXNldC1saW5lLWNvdW50cycpO1xuXHRcdGNvbnN0IGFkZGVkU3BhbiA9IGRvbS5hcHBlbmQoY291bnRzQ29udGFpbmVyLCBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLWFkZGVkJykpO1xuXHRcdGNvbnN0IHJlbW92ZWRTcGFuID0gZG9tLmFwcGVuZChjb3VudHNDb250YWluZXIsIGRvbS4kKCcud29ya2luZy1zZXQtbGluZXMtcmVtb3ZlZCcpKTtcblx0XHR0aXRsZUJ1dHRvbi5lbGVtZW50LmFwcGVuZENoaWxkKGNvdW50c0NvbnRhaW5lcik7XG5cblx0XHRjb25zdCBmaWxlc0xhYmVsID0gZ2V0TW9kaWZpZWRGaWxlc1N1bW1hcnlMYWJlbChkYXRhLm1vZGlmaWVkRmlsZXMpO1xuXHRcdHRpdGxlQnV0dG9uLmxhYmVsID0gZmlsZXNMYWJlbDtcblxuXHRcdGxldCBhZGRlZCA9IDA7XG5cdFx0bGV0IHJlbW92ZWQgPSAwO1xuXHRcdGxldCBoYXNEaWZmU3RhdHMgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGF0YS5tb2RpZmllZEZpbGVzKSB7XG5cdFx0XHRpZiAodHlwZW9mIGZpbGUuaW5zZXJ0aW9ucyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIGZpbGUuZGVsZXRpb25zID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRoYXNEaWZmU3RhdHMgPSB0cnVlO1xuXHRcdFx0XHRhZGRlZCArPSBmaWxlLmluc2VydGlvbnMgPz8gMDtcblx0XHRcdFx0cmVtb3ZlZCArPSBmaWxlLmRlbGV0aW9ucyA/PyAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChoYXNEaWZmU3RhdHMpIHtcblx0XHRcdGFkZGVkU3Bhbi50ZXh0Q29udGVudCA9IGArJHthZGRlZH1gO1xuXHRcdFx0cmVtb3ZlZFNwYW4udGV4dENvbnRlbnQgPSBgLSR7cmVtb3ZlZH1gO1xuXHRcdFx0dGl0bGVCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbW9kaWZpZWRGaWxlc1N1bW1hcnlXaXRoQ291bnRzJywgJ3swfSwgezF9IGxpbmVzIGFkZGVkLCB7Mn0gbGluZXMgcmVtb3ZlZCcsIGZpbGVzTGFiZWwsIGFkZGVkLCByZW1vdmVkKSk7XG5cdFx0XHRjb3VudHNDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21vZGlmaWVkRmlsZXNDb3VudHMnLCAnezB9IGxpbmVzIGFkZGVkLCB7MX0gbGluZXMgcmVtb3ZlZCcsIGFkZGVkLCByZW1vdmVkKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvdW50c0NvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRpdGxlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZmlsZXNMYWJlbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0FsbENoYW5nZXNCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGFjdGlvbnMsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRzbWFsbDogdHJ1ZSxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3ZpZXdBbGxDaGFuZ2VzJywgJ1ZpZXcgQWxsIENoYW5nZXMnKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndmlld0FsbENoYW5nZXMnLCAnVmlldyBBbGwgQ2hhbmdlcycpLFxuXHRcdH0pKTtcblx0XHR2aWV3QWxsQ2hhbmdlc0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RlZmF1bHQtY29sb3JzJyk7XG5cdFx0dmlld0FsbENoYW5nZXNCdXR0b24uaWNvbiA9IENvZGljb24uZGlmZk11bHRpcGxlO1xuXHRcdHZpZXdBbGxDaGFuZ2VzQnV0dG9uLmxhYmVsID0gJyAnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdBbGxDaGFuZ2VzQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5vcGVuQWxsQ2hhbmdlcyhkYXRhKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBsaXN0UmVmZXJlbmNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0UG9vbC5nZXQoKSk7XG5cdFx0Y29uc3QgbGlzdCA9IGxpc3RSZWZlcmVuY2Uub2JqZWN0O1xuXHRcdGNvbnN0IGxpc3RJdGVtcyA9IGRhdGEubW9kaWZpZWRGaWxlcy5tYXA8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPihmaWxlID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnJldml2ZShmaWxlLnVyaSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IGZpbGUub3JpZ2luYWxVcmkgPyBVUkkucmV2aXZlKGZpbGUub3JpZ2luYWxVcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRDb250ZW50VXJpID0gZmlsZS5tb2RpZmllZENvbnRlbnRVcmkgPyBVUkkucmV2aXZlKGZpbGUubW9kaWZpZWRDb250ZW50VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG9yaWdpbmFsQ29udGVudFVyaSA9IGZpbGUub3JpZ2luYWxDb250ZW50VXJpID8gVVJJLnJldml2ZShmaWxlLm9yaWdpbmFsQ29udGVudFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAncmVmZXJlbmNlJyxcblx0XHRcdFx0cmVmZXJlbmNlOiByZXNvdXJjZSxcblx0XHRcdFx0dGl0bGU6IGZpbGUudGl0bGUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmaWxlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCxcblx0XHRcdFx0c2hvd01vZGlmaWVkU3RhdGU6IHRydWUsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkaWZmTWV0YTogdHlwZW9mIGZpbGUuaW5zZXJ0aW9ucyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIGZpbGUuZGVsZXRpb25zID09PSAnbnVtYmVyJyA/IHtcblx0XHRcdFx0XHRcdGFkZGVkOiBmaWxlLmluc2VydGlvbnMgPz8gMCxcblx0XHRcdFx0XHRcdHJlbW92ZWQ6IGZpbGUuZGVsZXRpb25zID8/IDAsXG5cdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogb3JpZ2luYWxDb250ZW50VXJpID8/IG9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdG1vZGlmaWVkVXJpOiBtb2RpZmllZENvbnRlbnRVcmksXG5cdFx0XHRcdFx0c3RhdHVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uRGlkT3Blbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQ/LmtpbmQgIT09ICdyZWZlcmVuY2UnIHx8ICFVUkkuaXNVcmkoZS5lbGVtZW50LnJlZmVyZW5jZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcHRpb25zID0gZS5lbGVtZW50Lm9wdGlvbnM7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihjcmVhdGVNb2RpZmllZEZpbGVQcmV2aWV3RWRpdG9ySW5wdXQoXG5cdFx0XHRcdGUuZWxlbWVudC5yZWZlcmVuY2UsXG5cdFx0XHRcdG9wdGlvbnM/Lm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRvcHRpb25zPy5tb2RpZmllZFVyaSxcblx0XHRcdFx0ZS5lbGVtZW50LnRpdGxlLFxuXHRcdFx0XHRlLmVkaXRvck9wdGlvbnMsXG5cdFx0XHQpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtYXhJdGVtc1Nob3duID0gNjtcblx0XHRjb25zdCBpdGVtc1Nob3duID0gTWF0aC5taW4obGlzdEl0ZW1zLmxlbmd0aCwgbWF4SXRlbXNTaG93bik7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gaXRlbXNTaG93biAqIDIyO1xuXHRcdGNvbnN0IHdvcmtpbmdTZXRDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1saXN0LmNvbGxhcHNlZCcpKTtcblx0XHRsaXN0LmxheW91dChoZWlnaHQpO1xuXHRcdGxpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdGxpc3Quc3BsaWNlKDAsIGxpc3QubGVuZ3RoLCBsaXN0SXRlbXMpO1xuXHRcdHdvcmtpbmdTZXRDb250YWluZXIuYXBwZW5kKGxpc3QuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cblx0XHRsZXQgaXNDb2xsYXBzZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHNldEV4cGFuc2lvblN0YXRlID0gKCkgPT4ge1xuXHRcdFx0dGl0bGVCdXR0b24uaWNvbiA9IGlzQ29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duO1xuXHRcdFx0d29ya2luZ1NldENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCBpc0NvbGxhcHNlZCk7XG5cdFx0fTtcblx0XHRzZXRFeHBhbnNpb25TdGF0ZSgpO1xuXG5cdFx0Y29uc3QgdG9nZ2xlV29ya2luZ1NldCA9ICgpID0+IHtcblx0XHRcdGlzQ29sbGFwc2VkID0gIWlzQ29sbGFwc2VkO1xuXHRcdFx0c2V0RXhwYW5zaW9uU3RhdGUoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGl0bGVCdXR0b24ub25EaWRDbGljayh0b2dnbGVXb3JraW5nU2V0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvdmVydmlldywgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRpZiAoZS5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRpZiAodGFyZ2V0LmNsb3Nlc3QoJy5tb25hY28tYnV0dG9uJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0b2dnbGVXb3JraW5nU2V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk1vZGlmaWVkRmlsZVByZXZpZXcoZGF0YTogSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSwgcmVzb3VyY2U6IFVSSSwgZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBmaWxlID0gZmluZE1vZGlmaWVkRmlsZUNvbmZpcm1hdGlvbkVudHJ5KGRhdGEubW9kaWZpZWRGaWxlcywgcmVzb3VyY2UpO1xuXHRcdGlmICghZmlsZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGNyZWF0ZU1vZGlmaWVkRmlsZVByZXZpZXdFZGl0b3JJbnB1dChcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0ZmlsZS5vcmlnaW5hbENvbnRlbnRVcmkgPyBVUkkucmV2aXZlKGZpbGUub3JpZ2luYWxDb250ZW50VXJpKSA6IGZpbGUub3JpZ2luYWxVcmkgPyBVUkkucmV2aXZlKGZpbGUub3JpZ2luYWxVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0ZmlsZS5tb2RpZmllZENvbnRlbnRVcmkgPyBVUkkucmV2aXZlKGZpbGUubW9kaWZpZWRDb250ZW50VXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdGZpbGUudGl0bGUsXG5cdFx0XHRlZGl0b3JPcHRpb25zLFxuXHRcdCkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQWxsQ2hhbmdlcyhkYXRhOiBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX3dvcmtiZW5jaC5vcGVuTXVsdGlEaWZmRWRpdG9yJywge1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtb2RpZmllZEZpbGVzQWxsQ2hhbmdlc1RpdGxlJywgJ0FsbCBDaGFuZ2VzJyksXG5cdFx0XHRyZXNvdXJjZXM6IGRhdGEubW9kaWZpZWRGaWxlcy5tYXAoZmlsZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFVyaTogZmlsZS5vcmlnaW5hbENvbnRlbnRVcmkgPyBVUkkucmV2aXZlKGZpbGUub3JpZ2luYWxDb250ZW50VXJpKSA6IGZpbGUub3JpZ2luYWxVcmkgPyBVUkkucmV2aXZlKGZpbGUub3JpZ2luYWxVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RpZmllZFVyaTogZmlsZS5tb2RpZmllZENvbnRlbnRVcmkgPyBVUkkucmV2aXZlKGZpbGUubW9kaWZpZWRDb250ZW50VXJpKSA6IFVSSS5yZXZpdmUoZmlsZS51cmkpLFxuXHRcdFx0fSkpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQ29udGVudEVsZW1lbnQoKTogSFRNTEVsZW1lbnQgfCBzdHJpbmcge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHVzZWQnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy50b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlID0gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlO1xuXHRcdHJldHVybiB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZT8udmFsdWUgPz8gJyc7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSxzQkFBc0I7QUFDdkMsU0FBUyxlQUFlO0FBQ3hCLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTZDLHFCQUFxQix1QkFBdUI7QUFDekYsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBNkIsMEJBQTBCO0FBQ3ZELFNBQVMsc0NBQXNDO0FBRS9DLFNBQVMsb0NBQTZEO0FBQ3RFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQWtDO0FBRzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsaUNBQWlDO0FBSTFDLFNBQVMsY0FBYyxNQUE4QztBQUNwRSxTQUFPLEtBQUssYUFBYSxZQUFhLEtBQUssYUFBYSxVQUFhLENBQUMsS0FBSyxlQUFlLENBQUMsS0FBSyxzQkFBc0IsQ0FBQyxDQUFDLEtBQUs7QUFDOUg7QUFHTyxTQUFTLGtDQUFrQyxlQUF5RCxVQUEwRDtBQUNwSyxTQUFPLGNBQWMsS0FBSyxVQUFRLFFBQVEsSUFBSSxPQUFPLEtBQUssR0FBRyxHQUFHLFFBQVEsQ0FBQztBQUMxRTtBQUdPLFNBQVMsNkJBQTZCLGVBQWlFO0FB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
