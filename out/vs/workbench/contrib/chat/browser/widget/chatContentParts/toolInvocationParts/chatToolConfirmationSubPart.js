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
import { Separator } from "../../../../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../../../../base/common/async.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { count } from "../../../../../../../base/common/strings.js";
import { isEmptyObject } from "../../../../../../../base/common/types.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { ElementSizeObserver } from "../../../../../../../editor/browser/config/elementSizeObserver.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { IMarkerService, MarkerSeverity } from "../../../../../../../platform/markers/common/markers.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { createToolSchemaUri, ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelToolsConfirmationService } from "../../../../common/tools/languageModelToolsConfirmationService.js";
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { renderFileWidgets } from "../chatInlineAnchorWidget.js";
import { CodeBlockPart } from "../codeBlockPart.js";
import { IChatMarkdownAnchorService } from "../chatMarkdownAnchorService.js";
import { ChatMarkdownContentPart } from "../chatMarkdownContentPart.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
const SHOW_MORE_MESSAGE_HEIGHT_TRIGGER = 100;
let ToolConfirmationSubPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, instantiationService, keybindingService, languageService, contextKeyService, chatWidgetService, commandService, markerService, languageModelToolsService, chatMarkdownAnchorService, confirmationService, riskAssessmentService) {
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
      throw new Error("Confirmation messages are missing");
    }
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.renderer = renderer;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.codeBlockStartIndex = codeBlockStartIndex;
    this.languageService = languageService;
    this.commandService = commandService;
    this.markerService = markerService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.confirmationService = confirmationService;
    this.markdownParts = [];
    this.render({
      allowActionId: AcceptToolConfirmationActionId,
      skipActionId: SkipToolConfirmationActionId,
      allowLabel: state.confirmationMessages.confirmResults ? localize("allowReview", "Allow and Review Once") : localize("allow", "Allow Once"),
      skipLabel: localize("skip.detail", "Proceed without running this tool"),
      partType: "chatToolConfirmation",
      subtitle: typeof toolInvocation.originMessage === "string" ? toolInvocation.originMessage : toolInvocation.originMessage?.value
    });
  }
  get codeblocks() {
    return this.markdownParts.flatMap((part) => part.codeblocks);
  }
  additionalPrimaryActions() {
    const actions = super.additionalPrimaryActions();
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return actions;
    }
    if (state.confirmationMessages?.allowAutoConfirm !== false) {
      const approveCombination = state.confirmationMessages?.approveCombination;
      const combination = approveCombination ? {
        label: typeof approveCombination.label === "string" ? approveCombination.label : approveCombination.label.value,
        key: approveCombination.key,
        arguments: approveCombination.arguments
      } : void 0;
      const confirmActions = this.confirmationService.getPreConfirmActions({
        toolId: this.toolInvocation.toolId,
        source: this.toolInvocation.source,
        parameters: state.parameters,
        chatSessionResource: this.context.element.sessionResource,
        combination
      });
      for (const action of confirmActions) {
        if (action.divider) {
          actions.push(new Separator());
        }
        actions.push({
          label: action.label,
          tooltip: action.detail,
          scope: action.scope,
          data: async () => {
            const shouldConfirm = await action.select();
            if (shouldConfirm) {
              this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
            }
          }
        });
      }
    }
    if (state.confirmationMessages?.confirmResults) {
      actions.unshift(
        {
          label: localize("allowSkip", "Allow and Skip Reviewing Result"),
          data: () => {
            state.confirmationMessages.confirmResults = void 0;
            this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
          }
        },
        new Separator()
      );
    }
    return actions;
  }
  useAllowOnceAsPrimary() {
    const state = this.toolInvocation.state.get();
    if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return !!state.confirmationMessages?.approveCombination;
    }
    return false;
  }
  createContentElement() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const { message, disclaimer } = state.confirmationMessages;
    const toolInvocation = this.toolInvocation;
    if (typeof message === "string" && !disclaimer) {
      return message;
    } else {
      const codeBlockRenderOptions = {
        hideToolbar: true,
        reserveWidth: 19,
        verticalPadding: 5,
        editorOptions: {
          tabFocusMode: true,
          ariaLabel: this.getTitle()
        }
      };
      const elements = dom.h("div", [
        dom.h(".message@messageContainer", [
          dom.h(".message-wrapper@message"),
          dom.h(".see-more@showMore", [
            dom.h("a", [localize("showMore", "Show More")])
          ])
        ]),
        dom.h(".editor@editor"),
        dom.h(".disclaimer@disclaimer")
      ]);
      if (toolInvocation.toolSpecificData?.kind === "input" && toolInvocation.toolSpecificData.rawInput && !isEmptyObject(toolInvocation.toolSpecificData.rawInput)) {
        const titleEl = document.createElement("h3");
        titleEl.textContent = localize("chat.input", "Input");
        elements.editor.appendChild(titleEl);
        const inputData = toolInvocation.toolSpecificData;
        const codeBlockRenderOptions2 = {
          hideToolbar: true,
          reserveWidth: 19,
          maxHeightInLines: 13,
          verticalPadding: 5,
          editorOptions: {
            wordWrap: "off",
            readOnly: false,
            ariaLabel: this.getTitle()
          }
        };
        const langId = this.languageService.getLanguageIdByLanguageName("json");
        const rawJsonInput = JSON.stringify(inputData.rawInput ?? {}, null, 1);
        const canSeeMore = count(rawJsonInput, "\n") > 2;
        const initialText = rawJsonInput.replace(/\n */g, " ");
        const key = CodeBlockPart.poolKey(this.context.element.id, this.codeBlockStartIndex);
        const editor = this._register(this.editorPool.get(key));
        editor.object.render({
          codeBlockIndex: this.codeBlockStartIndex,
          element: this.context.element,
          languageId: langId ?? "json",
          text: initialText,
          renderOptions: codeBlockRenderOptions2,
          chatSessionResource: this.context.element.sessionResource
        }, this.currentWidthDelegate());
        const model = editor.object.editor.getModel();
        const markerOwner = generateUuid();
        const schemaUri = createToolSchemaUri(toolInvocation.toolId);
        const validator = new RunOnceScheduler(async () => {
          const newMarker = [];
          const result = await this.commandService.executeCommand("json.validate", schemaUri, model.getValue());
          for (const item of result ?? []) {
            if (item.range && item.message) {
              newMarker.push({
                severity: item.severity === "Error" ? MarkerSeverity.Error : MarkerSeverity.Warning,
                message: item.message,
                startLineNumber: item.range[0].line + 1,
                startColumn: item.range[0].character + 1,
                endLineNumber: item.range[1].line + 1,
                endColumn: item.range[1].character + 1,
                code: item.code ? String(item.code) : void 0
              });
            }
          }
          this.markerService.changeOne(markerOwner, model.uri, newMarker);
        }, 500);
        validator.schedule();
        this._register(model.onDidChangeContent(() => validator.schedule()));
        this._register(toDisposable(() => this.markerService.remove(markerOwner, [model.uri])));
        this._register(validator);
        this.codeblocks.push({
          codeBlockIndex: this.codeBlockStartIndex,
          codemapperUri: void 0,
          elementId: this.context.element.id,
          focus: () => editor.object.focus(),
          ownerMarkdownPartId: this.codeblocksPartId,
          uri: model.uri,
          chatSessionResource: this.context.element.sessionResource
        });
        this._register(model.onDidChangeContent((e) => {
          try {
            inputData.rawInput = JSON.parse(model.getValue());
          } catch {
          }
        }));
        elements.editor.append(editor.object.element);
        if (canSeeMore) {
          const seeMore = dom.h("div.see-more", [dom.h("a@link")]);
          seeMore.link.textContent = localize("seeMore", "See more");
          this._register(dom.addDisposableGenericMouseDownListener(seeMore.link, () => {
            try {
              const parsed = JSON.parse(model.getValue());
              model.setValue(JSON.stringify(parsed, null, 2));
              editor.object.editor.updateOptions({ tabFocusMode: false });
              editor.object.editor.updateOptions({ wordWrap: "on" });
            } catch {
            }
            seeMore.root.remove();
          }));
          elements.editor.append(seeMore.root);
        }
      }
      const mdPart = this._makeMarkdownPart(elements.message, message, codeBlockRenderOptions);
      const messageSeeMoreObserver = this._register(new ElementSizeObserver(mdPart.domNode, void 0));
      const updateSeeMoreDisplayed = () => {
        const show = messageSeeMoreObserver.getHeight() > SHOW_MORE_MESSAGE_HEIGHT_TRIGGER;
        if (elements.messageContainer.classList.contains("can-see-more") !== show) {
          elements.messageContainer.classList.toggle("can-see-more", show);
        }
      };
      this._register(dom.addDisposableListener(elements.showMore, "click", () => {
        elements.messageContainer.classList.toggle("can-see-more", false);
        messageSeeMoreObserver.dispose();
      }));
      this._register(messageSeeMoreObserver.onDidChange(updateSeeMoreDisplayed));
      messageSeeMoreObserver.startObserving();
      if (disclaimer) {
        this._makeMarkdownPart(elements.disclaimer, disclaimer, codeBlockRenderOptions);
      } else {
        elements.disclaimer.remove();
      }
      return elements.root;
    }
  }
  getTitle() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const title = state.confirmationMessages?.title;
    if (!title) {
      return "";
    }
    return typeof title === "string" ? title : title.value;
  }
  _makeMarkdownPart(container, message, codeBlockRenderOptions) {
    const part = this._register(this.instantiationService.createInstance(
      ChatMarkdownContentPart,
      {
        kind: "markdownContent",
        content: typeof message === "string" ? new MarkdownString().appendMarkdown(message) : message
      },
      this.context,
      this.editorPool,
      false,
      this.codeBlockStartIndex,
      this.renderer,
      void 0,
      this.currentWidthDelegate(),
      { codeBlockRenderOptions }
    ));
    renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store, this.openedEditors.fileWidgetOptions);
    container.append(part.domNode);
    return part;
  }
};
ToolConfirmationSubPart = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IChatWidgetService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, IMarkerService),
  __decorateParam(13, ILanguageModelToolsService),
  __decorateParam(14, IChatMarkdownAnchorService),
  __decorateParam(15, ILanguageModelToolsConfirmationService),
  __decorateParam(16, IChatToolRiskAssessmentService)
], ToolConfirmationSubPart);
export {
  ToolConfirmationSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sQ29uZmlybWF0aW9uU3ViUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzRW1wdHlPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEVsZW1lbnRTaXplT2JzZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZWxlbWVudFNpemVPYnNlcnZlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUb29sU2NoZW1hVXJpLCBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXB0VG9vbENvbmZpcm1hdGlvbkFjdGlvbklkLCBTa2lwVG9vbENvbmZpcm1hdGlvbkFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9ucy9jaGF0VG9vbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlbmRlckZpbGVXaWRnZXRzIH0gZnJvbSAnLi4vY2hhdElubGluZUFuY2hvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDb2RlQmxvY2tQYXJ0LCBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25Db250ZW50UGFydCB9IGZyb20gJy4uL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQgfSBmcm9tICcuL2Fic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCB9IGZyb20gJy4uL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcblxuY29uc3QgU0hPV19NT1JFX01FU1NBR0VfSEVJR0hUX1RSSUdHRVIgPSAxMDA7XG5cbmV4cG9ydCBjbGFzcyBUb29sQ29uZmlybWF0aW9uU3ViUGFydCBleHRlbmRzIEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQge1xuXHRwcml2YXRlIG1hcmtkb3duUGFydHM6IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0W10gPSBbXTtcblx0cHVibGljIGdldCBjb2RlYmxvY2tzKCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5tYXJrZG93blBhcnRzLmZsYXRNYXAocGFydCA9PiBwYXJ0LmNvZGVibG9ja3MpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQb29sOiBFZGl0b3JQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFdpZHRoRGVsZWdhdGU6ICgpID0+IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U6IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpcm1hdGlvblNlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2Ugcmlza0Fzc2Vzc21lbnRTZXJ2aWNlOiBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gfHwgIXN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb25maXJtYXRpb24gbWVzc2FnZXMgYXJlIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHRzdXBlcih0b29sSW52b2NhdGlvbiwgY29udGV4dCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHJpc2tBc3Nlc3NtZW50U2VydmljZSk7XG5cblx0XHR0aGlzLnJlbmRlcih7XG5cdFx0XHRhbGxvd0FjdGlvbklkOiBBY2NlcHRUb29sQ29uZmlybWF0aW9uQWN0aW9uSWQsXG5cdFx0XHRza2lwQWN0aW9uSWQ6IFNraXBUb29sQ29uZmlybWF0aW9uQWN0aW9uSWQsXG5cdFx0XHRhbGxvd0xhYmVsOiBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcy5jb25maXJtUmVzdWx0cyA/IGxvY2FsaXplKCdhbGxvd1JldmlldycsIFwiQWxsb3cgYW5kIFJldmlldyBPbmNlXCIpIDogbG9jYWxpemUoJ2FsbG93JywgXCJBbGxvdyBPbmNlXCIpLFxuXHRcdFx0c2tpcExhYmVsOiBsb2NhbGl6ZSgnc2tpcC5kZXRhaWwnLCAnUHJvY2VlZCB3aXRob3V0IHJ1bm5pbmcgdGhpcyB0b29sJyksXG5cdFx0XHRwYXJ0VHlwZTogJ2NoYXRUb29sQ29uZmlybWF0aW9uJyxcblx0XHRcdHN1YnRpdGxlOiB0eXBlb2YgdG9vbEludm9jYXRpb24ub3JpZ2luTWVzc2FnZSA9PT0gJ3N0cmluZycgPyB0b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlIDogdG9vbEludm9jYXRpb24ub3JpZ2luTWVzc2FnZT8udmFsdWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYWRkaXRpb25hbFByaW1hcnlBY3Rpb25zKCkge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzdXBlci5hZGRpdGlvbmFsUHJpbWFyeUFjdGlvbnMoKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy50b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hbGxvd0F1dG9Db25maXJtICE9PSBmYWxzZSkge1xuXHRcdFx0Ly8gR2V0IGNvbWJpbmF0aW9uIGxhYmVsIGFuZCBwcmVjb21wdXRlZCBrZXkgaWYgcHJlc2VudFxuXHRcdFx0Y29uc3QgYXBwcm92ZUNvbWJpbmF0aW9uID0gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmVDb21iaW5hdGlvbjtcblx0XHRcdGNvbnN0IGNvbWJpbmF0aW9uID0gYXBwcm92ZUNvbWJpbmF0aW9uXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdGxhYmVsOiB0eXBlb2YgYXBwcm92ZUNvbWJpbmF0aW9uLmxhYmVsID09PSAnc3RyaW5nJyA/IGFwcHJvdmVDb21iaW5hdGlvbi5sYWJlbCA6IGFwcHJvdmVDb21iaW5hdGlvbi5sYWJlbC52YWx1ZSxcblx0XHRcdFx0XHRrZXk6IGFwcHJvdmVDb21iaW5hdGlvbi5rZXksXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBhcHByb3ZlQ29tYmluYXRpb24uYXJndW1lbnRzLFxuXHRcdFx0XHR9XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBHZXQgYWN0aW9ucyBmcm9tIGNvbmZpcm1hdGlvbiBzZXJ2aWNlXG5cdFx0XHRjb25zdCBjb25maXJtQWN0aW9ucyA9IHRoaXMuY29uZmlybWF0aW9uU2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyh7XG5cdFx0XHRcdHRvb2xJZDogdGhpcy50b29sSW52b2NhdGlvbi50b29sSWQsXG5cdFx0XHRcdHNvdXJjZTogdGhpcy50b29sSW52b2NhdGlvbi5zb3VyY2UsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHN0YXRlLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0Y29tYmluYXRpb24sXG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgY29uZmlybUFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKGFjdGlvbi5kaXZpZGVyKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGFjdGlvbi5kZXRhaWwsXG5cdFx0XHRcdFx0c2NvcGU6IGFjdGlvbi5zY29wZSxcblx0XHRcdFx0XHRkYXRhOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBzaG91bGRDb25maXJtID0gYXdhaXQgYWN0aW9uLnNlbGVjdCgpO1xuXHRcdFx0XHRcdFx0aWYgKHNob3VsZENvbmZpcm0pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5jb25maXJtV2l0aCh0aGlzLnRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybVJlc3VsdHMpIHtcblx0XHRcdGFjdGlvbnMudW5zaGlmdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTa2lwJywgJ0FsbG93IGFuZCBTa2lwIFJldmlld2luZyBSZXN1bHQnKSxcblx0XHRcdFx0XHRkYXRhOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHQoc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXMgYXMgSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcykuY29uZmlybVJlc3VsdHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbmZpcm1XaXRoKHRoaXMudG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVzZUFsbG93T25jZUFzUHJpbWFyeSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdHJldHVybiAhIXN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hcHByb3ZlQ29tYmluYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVDb250ZW50RWxlbWVudCgpOiBIVE1MRWxlbWVudCB8IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IHsgbWVzc2FnZSwgZGlzY2xhaW1lciB9ID0gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXMhO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gdGhpcy50b29sSW52b2NhdGlvbiBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXG5cdFx0aWYgKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyAmJiAhZGlzY2xhaW1lcikge1xuXHRcdFx0cmV0dXJuIG1lc3NhZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNvZGVCbG9ja1JlbmRlck9wdGlvbnM6IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zID0ge1xuXHRcdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdFx0cmVzZXJ2ZVdpZHRoOiAxOSxcblx0XHRcdFx0dmVydGljYWxQYWRkaW5nOiA1LFxuXHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0dGFiRm9jdXNNb2RlOiB0cnVlLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdGhpcy5nZXRUaXRsZSgpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBkb20uaCgnZGl2JywgW1xuXHRcdFx0XHRkb20uaCgnLm1lc3NhZ2VAbWVzc2FnZUNvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRkb20uaCgnLm1lc3NhZ2Utd3JhcHBlckBtZXNzYWdlJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5zZWUtbW9yZUBzaG93TW9yZScsIFtcblx0XHRcdFx0XHRcdGRvbS5oKCdhJywgW2xvY2FsaXplKCdzaG93TW9yZScsIFwiU2hvdyBNb3JlXCIpXSlcblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGRvbS5oKCcuZWRpdG9yQGVkaXRvcicpLFxuXHRcdFx0XHRkb20uaCgnLmRpc2NsYWltZXJAZGlzY2xhaW1lcicpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnICYmIHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQgJiYgIWlzRW1wdHlPYmplY3QodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dCkpIHtcblxuXHRcdFx0XHRjb25zdCB0aXRsZUVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaDMnKTtcblx0XHRcdFx0dGl0bGVFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LmlucHV0JywgXCJJbnB1dFwiKTtcblx0XHRcdFx0ZWxlbWVudHMuZWRpdG9yLmFwcGVuZENoaWxkKHRpdGxlRWwpO1xuXG5cdFx0XHRcdGNvbnN0IGlucHV0RGF0YSA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cblx0XHRcdFx0Y29uc3QgY29kZUJsb2NrUmVuZGVyT3B0aW9uczogSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0aGlkZVRvb2xiYXI6IHRydWUsXG5cdFx0XHRcdFx0cmVzZXJ2ZVdpZHRoOiAxOSxcblx0XHRcdFx0XHRtYXhIZWlnaHRJbkxpbmVzOiAxMyxcblx0XHRcdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRcdFx0ZWRpdG9yT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0d29yZFdyYXA6ICdvZmYnLFxuXHRcdFx0XHRcdFx0cmVhZE9ubHk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0YXJpYUxhYmVsOiB0aGlzLmdldFRpdGxlKCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGxhbmdJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnanNvbicpO1xuXHRcdFx0XHRjb25zdCByYXdKc29uSW5wdXQgPSBKU09OLnN0cmluZ2lmeShpbnB1dERhdGEucmF3SW5wdXQgPz8ge30sIG51bGwsIDEpO1xuXHRcdFx0XHRjb25zdCBjYW5TZWVNb3JlID0gY291bnQocmF3SnNvbklucHV0LCAnXFxuJykgPiAyOyAvLyBpZiBtb3JlIHRoYW4gb25lIGtleTp2YWx1ZVxuXHRcdFx0XHQvLyBWaWV3IGEgc2luZ2xlIEpTT04gbGluZSBieSBkZWZhdWx0IHVudGlsIHRoZXkgJ3NlZSBtb3JlJ1xuXHRcdFx0XHRjb25zdCBpbml0aWFsVGV4dCA9IHJhd0pzb25JbnB1dC5yZXBsYWNlKC9cXG4gKi9nLCAnICcpO1xuXG5cdFx0XHRcdGNvbnN0IGtleSA9IENvZGVCbG9ja1BhcnQucG9vbEtleSh0aGlzLmNvbnRleHQuZWxlbWVudC5pZCwgdGhpcy5jb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JQb29sLmdldChrZXkpKTtcblx0XHRcdFx0ZWRpdG9yLm9iamVjdC5yZW5kZXIoe1xuXHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdFx0ZWxlbWVudDogdGhpcy5jb250ZXh0LmVsZW1lbnQsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ0lkID8/ICdqc29uJyxcblx0XHRcdFx0XHR0ZXh0OiBpbml0aWFsVGV4dCxcblx0XHRcdFx0XHRyZW5kZXJPcHRpb25zOiBjb2RlQmxvY2tSZW5kZXJPcHRpb25zLFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZVxuXHRcdFx0XHR9LCB0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlKCkpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5vYmplY3QuZWRpdG9yLmdldE1vZGVsKCkhO1xuXG5cdFx0XHRcdGNvbnN0IG1hcmtlck93bmVyID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdGNvbnN0IHNjaGVtYVVyaSA9IGNyZWF0ZVRvb2xTY2hlbWFVcmkodG9vbEludm9jYXRpb24udG9vbElkKTtcblx0XHRcdFx0Y29uc3QgdmFsaWRhdG9yID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRcdFx0Y29uc3QgbmV3TWFya2VyOiBJTWFya2VyRGF0YVtdID0gW107XG5cblx0XHRcdFx0XHR0eXBlIEpzb25EaWFnbm9zdGljID0ge1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHRcdFx0cmFuZ2U6IHsgbGluZTogbnVtYmVyOyBjaGFyYWN0ZXI6IG51bWJlciB9W107XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogc3RyaW5nO1xuXHRcdFx0XHRcdFx0Y29kZT86IHN0cmluZyB8IG51bWJlcjtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxKc29uRGlhZ25vc3RpY1tdPignanNvbi52YWxpZGF0ZScsIHNjaGVtYVVyaSwgbW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdCA/PyBbXSkge1xuXHRcdFx0XHRcdFx0aWYgKGl0ZW0ucmFuZ2UgJiYgaXRlbS5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRcdG5ld01hcmtlci5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRzZXZlcml0eTogaXRlbS5zZXZlcml0eSA9PT0gJ0Vycm9yJyA/IE1hcmtlclNldmVyaXR5LkVycm9yIDogTWFya2VyU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBpdGVtLm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBpdGVtLnJhbmdlWzBdLmxpbmUgKyAxLFxuXHRcdFx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBpdGVtLnJhbmdlWzBdLmNoYXJhY3RlciArIDEsXG5cdFx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogaXRlbS5yYW5nZVsxXS5saW5lICsgMSxcblx0XHRcdFx0XHRcdFx0XHRlbmRDb2x1bW46IGl0ZW0ucmFuZ2VbMV0uY2hhcmFjdGVyICsgMSxcblx0XHRcdFx0XHRcdFx0XHRjb2RlOiBpdGVtLmNvZGUgPyBTdHJpbmcoaXRlbS5jb2RlKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKG1hcmtlck93bmVyLCBtb2RlbC51cmksIG5ld01hcmtlcik7XG5cdFx0XHRcdH0sIDUwMCk7XG5cblx0XHRcdFx0dmFsaWRhdG9yLnNjaGVkdWxlKCk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB2YWxpZGF0b3Iuc2NoZWR1bGUoKSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5tYXJrZXJTZXJ2aWNlLnJlbW92ZShtYXJrZXJPd25lciwgW21vZGVsLnVyaV0pKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHZhbGlkYXRvcik7XG5cblx0XHRcdFx0dGhpcy5jb2RlYmxvY2tzLnB1c2goe1xuXHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdFx0Y29kZW1hcHBlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVsZW1lbnRJZDogdGhpcy5jb250ZXh0LmVsZW1lbnQuaWQsXG5cdFx0XHRcdFx0Zm9jdXM6ICgpID0+IGVkaXRvci5vYmplY3QuZm9jdXMoKSxcblx0XHRcdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0dXJpOiBtb2RlbC51cmksXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlucHV0RGF0YS5yYXdJbnB1dCA9IEpTT04ucGFyc2UobW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRlbGVtZW50cy5lZGl0b3IuYXBwZW5kKGVkaXRvci5vYmplY3QuZWxlbWVudCk7XG5cblx0XHRcdFx0aWYgKGNhblNlZU1vcmUpIHtcblx0XHRcdFx0XHRjb25zdCBzZWVNb3JlID0gZG9tLmgoJ2Rpdi5zZWUtbW9yZScsIFtkb20uaCgnYUBsaW5rJyldKTtcblx0XHRcdFx0XHRzZWVNb3JlLmxpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2VlTW9yZScsIFwiU2VlIG1vcmVcIik7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoc2VlTW9yZS5saW5rLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5zZXRWYWx1ZShKU09OLnN0cmluZ2lmeShwYXJzZWQsIG51bGwsIDIpKTtcblx0XHRcdFx0XHRcdFx0ZWRpdG9yLm9iamVjdC5lZGl0b3IudXBkYXRlT3B0aW9ucyh7IHRhYkZvY3VzTW9kZTogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHRcdGVkaXRvci5vYmplY3QuZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyB3b3JkV3JhcDogJ29uJyB9KTtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmVkXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzZWVNb3JlLnJvb3QucmVtb3ZlKCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGVsZW1lbnRzLmVkaXRvci5hcHBlbmQoc2VlTW9yZS5yb290KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZFBhcnQgPSB0aGlzLl9tYWtlTWFya2Rvd25QYXJ0KGVsZW1lbnRzLm1lc3NhZ2UsIG1lc3NhZ2UhLCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zKTtcblxuXHRcdFx0Y29uc3QgbWVzc2FnZVNlZU1vcmVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbGVtZW50U2l6ZU9ic2VydmVyKG1kUGFydC5kb21Ob2RlLCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHVwZGF0ZVNlZU1vcmVEaXNwbGF5ZWQgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNob3cgPSBtZXNzYWdlU2VlTW9yZU9ic2VydmVyLmdldEhlaWdodCgpID4gU0hPV19NT1JFX01FU1NBR0VfSEVJR0hUX1RSSUdHRVI7XG5cdFx0XHRcdGlmIChlbGVtZW50cy5tZXNzYWdlQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnY2FuLXNlZS1tb3JlJykgIT09IHNob3cpIHtcblx0XHRcdFx0XHRlbGVtZW50cy5tZXNzYWdlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Nhbi1zZWUtbW9yZScsIHNob3cpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnRzLnNob3dNb3JlLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdGVsZW1lbnRzLm1lc3NhZ2VDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2FuLXNlZS1tb3JlJywgZmFsc2UpO1xuXHRcdFx0XHRtZXNzYWdlU2VlTW9yZU9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblxuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtZXNzYWdlU2VlTW9yZU9ic2VydmVyLm9uRGlkQ2hhbmdlKHVwZGF0ZVNlZU1vcmVEaXNwbGF5ZWQpKTtcblx0XHRcdG1lc3NhZ2VTZWVNb3JlT2JzZXJ2ZXIuc3RhcnRPYnNlcnZpbmcoKTtcblxuXHRcdFx0aWYgKGRpc2NsYWltZXIpIHtcblx0XHRcdFx0dGhpcy5fbWFrZU1hcmtkb3duUGFydChlbGVtZW50cy5kaXNjbGFpbWVyLCBkaXNjbGFpbWVyLCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVsZW1lbnRzLmRpc2NsYWltZXIucmVtb3ZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBlbGVtZW50cy5yb290O1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy50b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCB0aXRsZSA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZTtcblx0XHRpZiAoIXRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX21ha2VNYXJrZG93blBhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zOiBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucykge1xuXHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0Y29udGVudDogdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24obWVzc2FnZSkgOiBtZXNzYWdlLFxuXHRcdFx0fSxcblx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdHRoaXMuZWRpdG9yUG9vbCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dGhpcy5jb2RlQmxvY2tTdGFydEluZGV4LFxuXHRcdFx0dGhpcy5yZW5kZXJlcixcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuY3VycmVudFdpZHRoRGVsZWdhdGUoKSxcblx0XHRcdHsgY29kZUJsb2NrUmVuZGVyT3B0aW9ucyB9LFxuXHRcdCkpO1xuXHRcdHJlbmRlckZpbGVXaWRnZXRzKHBhcnQuZG9tTm9kZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCB0aGlzLl9zdG9yZSwgdGhpcy5vcGVuZWRFZGl0b3JzLmZpbGVXaWRnZXRPcHRpb25zKTtcblx0XHRjb250YWluZXIuYXBwZW5kKHBhcnQuZG9tTm9kZSk7XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxufVxuIl0sCiAg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
