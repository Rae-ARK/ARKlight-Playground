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
import * as dom from "../../../../../../base/browser/dom.js";
import { $ } from "../../../../../../base/browser/dom.js";
import { toAction } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { combinedDisposable, Disposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, derivedOpts } from "../../../../../../base/common/observable.js";
import { basename, getComparisonKey, isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../../browser/labels.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { MultiDiffEditorInput } from "../../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { IChatResponseFileChangesService } from "../../chatResponseFileChangesService.js";
import { diffStatsEqual, EMPTY_DIFF_STATS, observeTurnStatusPillsEnabled, openChatTurnFile, previewFilesEqual, previewKind } from "../chatTurnPills.js";
import { renderChangesSummaryFileList } from "./chatChangesSummaryPart.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
let ChatTurnPillsContentPart = class extends Disposable {
  constructor(_content, _context, chatResponseFileChangesService, _openerService, _hoverService, _editorService, _configurationService, themeService, _instantiationService, _labelService) {
    super();
    this._content = _content;
    this._openerService = _openerService;
    this._hoverService = _hoverService;
    this._editorService = _editorService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this.domNode = $(".chat-turn-pills-part");
    this._diffs = chatResponseFileChangesService.getChangesForRequest(_content.sessionResource, _content.requestId) ?? constObservable([]);
    const stats = derivedOpts({ owner: this, equalsFn: diffStatsEqual }, (reader) => {
      const diffs = this._diffs.read(reader);
      if (diffs.length === 0) {
        return EMPTY_DIFF_STATS;
      }
      let insertions = 0, deletions = 0;
      for (const diff of diffs) {
        insertions += diff.added;
        deletions += diff.removed;
      }
      return { files: diffs.length, insertions, deletions };
    });
    const previewDiffs = chatResponseFileChangesService.getFileEditsForRequest?.(_content.sessionResource, _content.requestId) ?? this._diffs;
    const previewFiles = derivedOpts({ owner: this, equalsFn: previewFilesEqual }, (reader) => {
      const created = [];
      const edited = [];
      const seen = /* @__PURE__ */ new Set();
      const addDiffs = (diffs) => {
        for (const diff of diffs) {
          const kind = previewKind(diff.modifiedURI);
          if (!kind) {
            continue;
          }
          const key = getComparisonKey(diff.modifiedURI);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const isCreated = isEqual(diff.originalURI, diff.modifiedURI);
          (isCreated ? created : edited).push({ uri: diff.modifiedURI, kind, created: isCreated });
        }
      };
      addDiffs(previewDiffs.read(reader));
      addDiffs(this._diffs.read(reader));
      return [...created, ...edited];
    });
    const turnStatusPillsEnabled = observeTurnStatusPillsEnabled(this._configurationService);
    const changesEnabled = derived(this, (reader) => turnStatusPillsEnabled.read(reader));
    const previewEnabled = derived(this, (reader) => turnStatusPillsEnabled.read(reader));
    const showChanges = derived(this, (reader) => changesEnabled.read(reader) && stats.read(reader).files > 0);
    const showPreview = derived(this, (reader) => previewEnabled.read(reader) && previewFiles.read(reader).length > 0);
    const root = this.domNode.appendChild($(".checkpoint-file-changes-summary.checkpoint-file-changes-compact"));
    this._register(createFileIconThemableTreeContainerScope(root, themeService));
    const details = root.appendChild(document.createElement("details"));
    details.classList.add("checkpoint-file-changes-disclosure");
    const header = details.appendChild(document.createElement("summary"));
    header.classList.add("checkpoint-file-changes-summary-header");
    const resourceLabels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this._register(this._renderChangesHeader(header, stats, showChanges));
    this._register(this._renderPreviewAction(header, previewFiles, showPreview, resourceLabels));
    this._register(this._renderChevron(header, details, showChanges));
    this._register(dom.addDisposableListener(header, "click", () => {
      root.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
    }));
    const listDiffs = derived(this, (reader) => showChanges.read(reader) ? this._diffs.read(reader) : []);
    this._register(renderChangesSummaryFileList(details, listDiffs, this._instantiationService, this._editorService, this._configurationService, {
      getRowActions: (diff) => this._getRowActions(diff)
    }));
    this._register(autorun((reader) => {
      this.domNode.style.display = showChanges.read(reader) || showPreview.read(reader) ? "" : "none";
    }));
  }
  _renderChangesHeader(header, stats, showChanges) {
    const filesLabel = header.appendChild($("span.chat-file-changes-label"));
    const counts = header.appendChild(document.createElement("button"));
    counts.classList.add("chat-file-changes-counts");
    counts.type = "button";
    const addedLabel = counts.appendChild($("span.insertions"));
    const removedLabel = counts.appendChild($("span.deletions"));
    const hoverDisposable = this._hoverService.setupDelayedHover(counts, () => ({
      content: localize2("chat.viewTurnFileChangesSummary", "View All File Changes")
    }));
    const clickDisposable = dom.addDisposableListener(counts, "click", (e) => {
      this._openChanges();
      dom.EventHelper.stop(e, true);
    });
    return combinedDisposable(hoverDisposable, clickDisposable, autorun((reader) => {
      const { files, insertions, deletions } = stats.read(reader);
      const fileCountLabel = files === 1 ? localize("chat.turnChanges.oneFile", "1 file changed") : localize("chat.turnChanges.manyFiles", "{0} files changed", files);
      filesLabel.textContent = fileCountLabel;
      addedLabel.textContent = `+${insertions}`;
      removedLabel.textContent = `-${deletions}`;
      counts.setAttribute("aria-label", localize(
        "chat.turnChanges.viewAllAccessible",
        "View all file changes, {0} lines added, {1} lines deleted",
        insertions,
        deletions
      ));
      header.setAttribute("aria-label", localize(
        "chat.turnChanges.accessibleSummary",
        "{0}, {1} lines added, {2} lines deleted",
        fileCountLabel,
        insertions,
        deletions
      ));
      const show = showChanges.read(reader);
      filesLabel.classList.toggle("hidden", !show);
      counts.classList.toggle("hidden", !show);
    }));
  }
  _renderPreviewAction(header, previewFiles, showPreview, resourceLabels) {
    const container = header.appendChild($(".chat-turn-preview"));
    container.appendChild($("span.chat-turn-preview-separator", { "aria-hidden": "true" }));
    const button = container.appendChild(document.createElement("button"));
    button.classList.add("chat-turn-preview-action");
    button.type = "button";
    const label = this._register(resourceLabels.create(button, { hoverTargetOverride: button }));
    const clickDisposable = dom.addDisposableListener(button, "click", (e) => {
      this._openPrimaryPreview(previewFiles.get());
      dom.EventHelper.stop(e, true);
    });
    return combinedDisposable(clickDisposable, autorun((reader) => {
      const files = previewFiles.read(reader);
      const primaryFile = files.at(0);
      if (primaryFile) {
        const name = basename(primaryFile.uri);
        label.setResource(
          { resource: primaryFile.uri, name },
          {
            fileKind: FileKind.FILE,
            title: localize("chat.turnPreview.tooltip", "{0} \u2022 Open File", this._labelService.getUriLabel(primaryFile.uri))
          }
        );
        button.setAttribute("aria-label", localize("chat.turnPreview.ariaLabel", "Open File: {0}", name));
      }
      container.classList.toggle("hidden", !showPreview.read(reader));
    }));
  }
  _renderChevron(header, details, showChanges) {
    const chevron = header.appendChild($("span.chat-file-changes-chevron.chat-collapsible-hover-chevron", { "aria-hidden": "true" }));
    chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
    const setExpansionState = () => {
      header.setAttribute("aria-expanded", String(details.open));
      chevron.classList.toggle("expanded", details.open);
    };
    setExpansionState();
    return combinedDisposable(
      dom.addDisposableListener(details, "toggle", setExpansionState),
      autorun((reader) => {
        chevron.classList.toggle("hidden", !showChanges.read(reader));
      })
    );
  }
  _openChanges() {
    const diffs = this._diffs.get();
    if (diffs.length === 0) {
      return;
    }
    const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
    const input = this._instantiationService.createInstance(
      MultiDiffEditorInput,
      source,
      localize("chatTurnPills.changes.title", "Turn File Changes"),
      diffs.map((diff) => new MultiDiffEditorItem(diff.originalURI, diff.modifiedURI, void 0)),
      false
    );
    this._editorService.openEditor(input);
  }
  _openPrimaryPreview(files) {
    const primaryFile = files.at(0);
    if (primaryFile) {
      openChatTurnFile(primaryFile, this._openerService, this._configurationService);
    }
  }
  /**
   * Row actions for the changed-files list: markdown files get a labelless,
   * icon-free action that opens the file.
   */
  _getRowActions(diff) {
    const kind = previewKind(diff.modifiedURI);
    if (!kind) {
      return [];
    }
    const file = { uri: diff.modifiedURI, kind, created: isEqual(diff.originalURI, diff.modifiedURI) };
    return [toAction({
      id: "chat.turnChanges.previewFile",
      label: localize("chat.turnChanges.preview", "Preview"),
      run: () => openChatTurnFile(file, this._openerService, this._configurationService)
    })];
  }
  hasSameContent(other, _followingContent, _element) {
    return other.kind === "turnPills" && other.requestId === this._content.requestId && isEqual(other.sessionResource, this._content.sessionResource);
  }
};
ChatTurnPillsContentPart = __decorateClass([
  __decorateParam(2, IChatResponseFileChangesService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILabelService)
], ChatTurnPillsContentPart);
export {
  ChatTurnPillsContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VHVyblBpbGxzUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGdldENvbXBhcmlzb25LZXksIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9icm93c2VyL3ZpZXdzL2V4cGxvcmVyVmlldy5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvckl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRW50cnlEaWZmIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50LCBJQ2hhdFR1cm5QaWxsc1BhcnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGlmZlN0YXRzRXF1YWwsIEVNUFRZX0RJRkZfU1RBVFMsIElEaWZmU3RhdHMsIElQcmV2aWV3RmlsZSwgb2JzZXJ2ZVR1cm5TdGF0dXNQaWxsc0VuYWJsZWQsIG9wZW5DaGF0VHVybkZpbGUsIHByZXZpZXdGaWxlc0VxdWFsLCBwcmV2aWV3S2luZCB9IGZyb20gJy4uL2NoYXRUdXJuUGlsbHMuanMnO1xuaW1wb3J0IHsgcmVuZGVyQ2hhbmdlc1N1bW1hcnlGaWxlTGlzdCB9IGZyb20gJy4vY2hhdENoYW5nZXNTdW1tYXJ5UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuXG4vKipcbiAqIFJlbmRlcnMgYSBzaW5nbGUgYWdlbnQgdHVybidzIGNoYW5nZXMgYXMgYSBjaGVja3BvaW50LXN0eWxlIHN1bW1hcnk6IGFcbiAqIGBOIGZpbGVzIGNoYW5nZWQgK2lucyAtZGVsYCBoZWFkZXIgd2l0aCBhIFwiVmlldyBBbGwgRmlsZSBDaGFuZ2VzXCIgYWN0aW9uLCBhblxuICogb3B0aW9uYWwgaW5saW5lIHJlc291cmNlLWxhYmVsIGFjdGlvbiBmb3IgdGhlIGZpcnN0IHByZXZpZXdhYmxlIGZpbGUgdGhlIHR1cm5cbiAqIHByb2R1Y2VkLCBhbmQgYSBkaXNjbG9zdXJlIHRoYXQgZXhwYW5kcyB0byB0aGUgbGlzdCBvZiBjaGFuZ2VkIGZpbGVzLiBQcmV2aWV3XG4gKiBjYW5kaWRhdGVzIHByZWZlciB0aGUgdHVybidzIGZpbGUtZWRpdCBzdHJlYW0gc28gZmlsZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlXG4gKiBjYW4gYXBwZWFyLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFR1cm5QaWxsc0NvbnRlbnRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudDogSUNoYXRUdXJuUGlsbHNQYXJ0LFxuXHRcdF9jb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRASUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSBjaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2U6IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gJCgnLmNoYXQtdHVybi1waWxscy1wYXJ0Jyk7XG5cblx0XHR0aGlzLl9kaWZmcyA9IGNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRm9yUmVxdWVzdChfY29udGVudC5zZXNzaW9uUmVzb3VyY2UsIF9jb250ZW50LnJlcXVlc3RJZCkgPz8gY29uc3RPYnNlcnZhYmxlKFtdKTtcblxuXHRcdGNvbnN0IHN0YXRzID0gZGVyaXZlZE9wdHM8SURpZmZTdGF0cz4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGRpZmZTdGF0c0VxdWFsIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaWZmcyA9IHRoaXMuX2RpZmZzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChkaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIEVNUFRZX0RJRkZfU1RBVFM7XG5cdFx0XHR9XG5cdFx0XHRsZXQgaW5zZXJ0aW9ucyA9IDAsIGRlbGV0aW9ucyA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGRpZmYgb2YgZGlmZnMpIHtcblx0XHRcdFx0aW5zZXJ0aW9ucyArPSBkaWZmLmFkZGVkO1xuXHRcdFx0XHRkZWxldGlvbnMgKz0gZGlmZi5yZW1vdmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgZmlsZXM6IGRpZmZzLmxlbmd0aCwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmV2aWV3RGlmZnMgPSBjaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuZ2V0RmlsZUVkaXRzRm9yUmVxdWVzdD8uKF9jb250ZW50LnNlc3Npb25SZXNvdXJjZSwgX2NvbnRlbnQucmVxdWVzdElkKSA/PyB0aGlzLl9kaWZmcztcblx0XHRjb25zdCBwcmV2aWV3RmlsZXMgPSBkZXJpdmVkT3B0czxyZWFkb25seSBJUHJldmlld0ZpbGVbXT4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IHByZXZpZXdGaWxlc0VxdWFsIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjcmVhdGVkOiBJUHJldmlld0ZpbGVbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZWRpdGVkOiBJUHJldmlld0ZpbGVbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgYWRkRGlmZnMgPSAoZGlmZnM6IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiBkaWZmcykge1xuXHRcdFx0XHRcdGNvbnN0IGtpbmQgPSBwcmV2aWV3S2luZChkaWZmLm1vZGlmaWVkVVJJKTtcblx0XHRcdFx0XHRpZiAoIWtpbmQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBrZXkgPSBnZXRDb21wYXJpc29uS2V5KGRpZmYubW9kaWZpZWRVUkkpO1xuXHRcdFx0XHRcdGlmIChzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRcdFx0XHQvLyBUaGUgYWdlbnQgaG9zdCBwcm92aWRlciBtYXBzIGEgY3JlYXRlZCBmaWxlJ3MgYG9yaWdpbmFsVVJJYCB0byBpdHNcblx0XHRcdFx0XHQvLyBgbW9kaWZpZWRVUklgICh0aGVyZSBpcyBubyBiZWZvcmUtY29udGVudCksIHNvIGVxdWFsIFVSSXMgbWFyayBhXG5cdFx0XHRcdFx0Ly8gY3JlYXRpb24uIENyZWF0ZWQgZmlsZXMgYXJlIGxpc3RlZCBmaXJzdCBzbyB0aGUgcHJpbWFyeSBwcmV2aWV3IGlzXG5cdFx0XHRcdFx0Ly8gdGhlIGZpcnN0IGNyZWF0ZWQgZmlsZSwgZWxzZSB0aGUgZmlyc3QgZWRpdGVkIG9uZS5cblx0XHRcdFx0XHRjb25zdCBpc0NyZWF0ZWQgPSBpc0VxdWFsKGRpZmYub3JpZ2luYWxVUkksIGRpZmYubW9kaWZpZWRVUkkpO1xuXHRcdFx0XHRcdChpc0NyZWF0ZWQgPyBjcmVhdGVkIDogZWRpdGVkKS5wdXNoKHsgdXJpOiBkaWZmLm1vZGlmaWVkVVJJLCBraW5kLCBjcmVhdGVkOiBpc0NyZWF0ZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRhZGREaWZmcyhwcmV2aWV3RGlmZnMucmVhZChyZWFkZXIpKTtcblx0XHRcdGFkZERpZmZzKHRoaXMuX2RpZmZzLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRyZXR1cm4gWy4uLmNyZWF0ZWQsIC4uLmVkaXRlZF07XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0dXJuU3RhdHVzUGlsbHNFbmFibGVkID0gb2JzZXJ2ZVR1cm5TdGF0dXNQaWxsc0VuYWJsZWQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYW5nZXNFbmFibGVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdHVyblN0YXR1c1BpbGxzRW5hYmxlZC5yZWFkKHJlYWRlcikpO1xuXHRcdGNvbnN0IHByZXZpZXdFbmFibGVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdHVyblN0YXR1c1BpbGxzRW5hYmxlZC5yZWFkKHJlYWRlcikpO1xuXHRcdGNvbnN0IHNob3dDaGFuZ2VzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gY2hhbmdlc0VuYWJsZWQucmVhZChyZWFkZXIpICYmIHN0YXRzLnJlYWQocmVhZGVyKS5maWxlcyA+IDApO1xuXHRcdGNvbnN0IHNob3dQcmV2aWV3ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gcHJldmlld0VuYWJsZWQucmVhZChyZWFkZXIpICYmIHByZXZpZXdGaWxlcy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBSZXVzZSB0aGUgY2hlY2twb2ludCBzdW1tYXJ5J3Mgc3RydWN0dXJlIGFuZCBjbGFzc2VzIHNvIHRoZSB0d28gbG9va1xuXHRcdC8vIGlkZW50aWNhbC4gYHNob3ctZmlsZS1pY29uc2AgKGFkZGVkIGJ5IHRoZSB0aGVtYWJsZSB0cmVlIHNjb3BlIGJlbG93KVxuXHRcdC8vIGxldHMgdGhlIHByZXZpZXcgYWN0aW9uJ3MgcmVzb3VyY2UgbGFiZWwgcmVuZGVyIHRoZSBmaWxlJ3MgdGhlbWVkIGljb24uXG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZCgkKCcuY2hlY2twb2ludC1maWxlLWNoYW5nZXMtc3VtbWFyeS5jaGVja3BvaW50LWZpbGUtY2hhbmdlcy1jb21wYWN0JykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUocm9vdCwgdGhlbWVTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gcm9vdC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZXRhaWxzJykpO1xuXHRcdGRldGFpbHMuY2xhc3NMaXN0LmFkZCgnY2hlY2twb2ludC1maWxlLWNoYW5nZXMtZGlzY2xvc3VyZScpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRldGFpbHMuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3VtbWFyeScpKTtcblx0XHRoZWFkZXIuY2xhc3NMaXN0LmFkZCgnY2hlY2twb2ludC1maWxlLWNoYW5nZXMtc3VtbWFyeS1oZWFkZXInKTtcblxuXHRcdGNvbnN0IHJlc291cmNlTGFiZWxzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVuZGVyQ2hhbmdlc0hlYWRlcihoZWFkZXIsIHN0YXRzLCBzaG93Q2hhbmdlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbmRlclByZXZpZXdBY3Rpb24oaGVhZGVyLCBwcmV2aWV3RmlsZXMsIHNob3dQcmV2aWV3LCByZXNvdXJjZUxhYmVscykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbmRlckNoZXZyb24oaGVhZGVyLCBkZXRhaWxzLCBzaG93Q2hhbmdlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRyb290LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHR9KSk7XG5cblx0XHQvLyBPbmx5IGZlZWQgZGlmZnMgaW50byB0aGUgbGlzdCB3aGVuIHRoZSBjaGFuZ2VzIHN1bW1hcnkgaXMgc2hvd24sIHNvIHRoZVxuXHRcdC8vIGRpc2Nsb3N1cmUgc3RheXMgZW1wdHkgd2hlbiBqdXN0IHRoZSBwcmV2aWV3IGFjdGlvbiBpcyBlbmFibGVkLlxuXHRcdGNvbnN0IGxpc3REaWZmcyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHNob3dDaGFuZ2VzLnJlYWQocmVhZGVyKSA/IHRoaXMuX2RpZmZzLnJlYWQocmVhZGVyKSA6IFtdKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZW5kZXJDaGFuZ2VzU3VtbWFyeUZpbGVMaXN0KGRldGFpbHMsIGxpc3REaWZmcywgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuX2VkaXRvclNlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRnZXRSb3dBY3Rpb25zOiBkaWZmID0+IHRoaXMuX2dldFJvd0FjdGlvbnMoZGlmZiksXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAoc2hvd0NoYW5nZXMucmVhZChyZWFkZXIpIHx8IHNob3dQcmV2aWV3LnJlYWQocmVhZGVyKSkgPyAnJyA6ICdub25lJztcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDaGFuZ2VzSGVhZGVyKGhlYWRlcjogSFRNTEVsZW1lbnQsIHN0YXRzOiBJT2JzZXJ2YWJsZTxJRGlmZlN0YXRzPiwgc2hvd0NoYW5nZXM6IElPYnNlcnZhYmxlPGJvb2xlYW4+KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGZpbGVzTGFiZWwgPSBoZWFkZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jaGF0LWZpbGUtY2hhbmdlcy1sYWJlbCcpKTtcblx0XHRjb25zdCBjb3VudHMgPSBoZWFkZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJykpO1xuXHRcdGNvdW50cy5jbGFzc0xpc3QuYWRkKCdjaGF0LWZpbGUtY2hhbmdlcy1jb3VudHMnKTtcblx0XHRjb3VudHMudHlwZSA9ICdidXR0b24nO1xuXHRcdGNvbnN0IGFkZGVkTGFiZWwgPSBjb3VudHMuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5pbnNlcnRpb25zJykpO1xuXHRcdGNvbnN0IHJlbW92ZWRMYWJlbCA9IGNvdW50cy5hcHBlbmRDaGlsZCgkKCdzcGFuLmRlbGV0aW9ucycpKTtcblxuXHRcdGNvbnN0IGhvdmVyRGlzcG9zYWJsZSA9IHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihjb3VudHMsICgpID0+ICh7XG5cdFx0XHRjb250ZW50OiBsb2NhbGl6ZTIoJ2NoYXQudmlld1R1cm5GaWxlQ2hhbmdlc1N1bW1hcnknLCAnVmlldyBBbGwgRmlsZSBDaGFuZ2VzJylcblx0XHR9KSk7XG5cdFx0Y29uc3QgY2xpY2tEaXNwb3NhYmxlID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb3VudHMsICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vcGVuQ2hhbmdlcygpO1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKGhvdmVyRGlzcG9zYWJsZSwgY2xpY2tEaXNwb3NhYmxlLCBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB7IGZpbGVzLCBpbnNlcnRpb25zLCBkZWxldGlvbnMgfSA9IHN0YXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGZpbGVDb3VudExhYmVsID0gZmlsZXMgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC50dXJuQ2hhbmdlcy5vbmVGaWxlJywgJzEgZmlsZSBjaGFuZ2VkJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC50dXJuQ2hhbmdlcy5tYW55RmlsZXMnLCAnezB9IGZpbGVzIGNoYW5nZWQnLCBmaWxlcyk7XG5cdFx0XHRmaWxlc0xhYmVsLnRleHRDb250ZW50ID0gZmlsZUNvdW50TGFiZWw7XG5cdFx0XHRhZGRlZExhYmVsLnRleHRDb250ZW50ID0gYCske2luc2VydGlvbnN9YDtcblx0XHRcdHJlbW92ZWRMYWJlbC50ZXh0Q29udGVudCA9IGAtJHtkZWxldGlvbnN9YDtcblx0XHRcdGNvdW50cy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQudHVybkNoYW5nZXMudmlld0FsbEFjY2Vzc2libGUnLFxuXHRcdFx0XHQnVmlldyBhbGwgZmlsZSBjaGFuZ2VzLCB7MH0gbGluZXMgYWRkZWQsIHsxfSBsaW5lcyBkZWxldGVkJyxcblx0XHRcdFx0aW5zZXJ0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zXG5cdFx0XHQpKTtcblx0XHRcdGhlYWRlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQudHVybkNoYW5nZXMuYWNjZXNzaWJsZVN1bW1hcnknLFxuXHRcdFx0XHQnezB9LCB7MX0gbGluZXMgYWRkZWQsIHsyfSBsaW5lcyBkZWxldGVkJyxcblx0XHRcdFx0ZmlsZUNvdW50TGFiZWwsXG5cdFx0XHRcdGluc2VydGlvbnMsXG5cdFx0XHRcdGRlbGV0aW9uc1xuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNob3cgPSBzaG93Q2hhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRmaWxlc0xhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFzaG93KTtcblx0XHRcdGNvdW50cy5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvdyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyUHJldmlld0FjdGlvbihoZWFkZXI6IEhUTUxFbGVtZW50LCBwcmV2aWV3RmlsZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElQcmV2aWV3RmlsZVtdPiwgc2hvd1ByZXZpZXc6IElPYnNlcnZhYmxlPGJvb2xlYW4+LCByZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gaGVhZGVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LXR1cm4tcHJldmlldycpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jaGF0LXR1cm4tcHJldmlldy1zZXBhcmF0b3InLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cblx0XHRjb25zdCBidXR0b24gPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJykpO1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdjaGF0LXR1cm4tcHJldmlldy1hY3Rpb24nKTtcblx0XHRidXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fcmVnaXN0ZXIocmVzb3VyY2VMYWJlbHMuY3JlYXRlKGJ1dHRvbiwgeyBob3ZlclRhcmdldE92ZXJyaWRlOiBidXR0b24gfSkpO1xuXG5cdFx0Y29uc3QgY2xpY2tEaXNwb3NhYmxlID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vcGVuUHJpbWFyeVByZXZpZXcocHJldmlld0ZpbGVzLmdldCgpKTtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShjbGlja0Rpc3Bvc2FibGUsIGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGZpbGVzID0gcHJldmlld0ZpbGVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHByaW1hcnlGaWxlID0gZmlsZXMuYXQoMCk7XG5cdFx0XHRpZiAocHJpbWFyeUZpbGUpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lKHByaW1hcnlGaWxlLnVyaSk7XG5cdFx0XHRcdGxhYmVsLnNldFJlc291cmNlKFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IHByaW1hcnlGaWxlLnVyaSwgbmFtZSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LnR1cm5QcmV2aWV3LnRvb2x0aXAnLCBcInswfSBcdTIwMjIgT3BlbiBGaWxlXCIsIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChwcmltYXJ5RmlsZS51cmkpKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQudHVyblByZXZpZXcuYXJpYUxhYmVsJywgXCJPcGVuIEZpbGU6IHswfVwiLCBuYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXNob3dQcmV2aWV3LnJlYWQocmVhZGVyKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQ2hldnJvbihoZWFkZXI6IEhUTUxFbGVtZW50LCBkZXRhaWxzOiBIVE1MRGV0YWlsc0VsZW1lbnQsIHNob3dDaGFuZ2VzOiBJT2JzZXJ2YWJsZTxib29sZWFuPik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBjaGV2cm9uID0gaGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hhdC1maWxlLWNoYW5nZXMtY2hldnJvbi5jaGF0LWNvbGxhcHNpYmxlLWhvdmVyLWNoZXZyb24nLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0Y2hldnJvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2hldnJvblJpZ2h0KSk7XG5cblx0XHRjb25zdCBzZXRFeHBhbnNpb25TdGF0ZSA9ICgpID0+IHtcblx0XHRcdGhlYWRlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoZGV0YWlscy5vcGVuKSk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZGV0YWlscy5vcGVuKTtcblx0XHR9O1xuXHRcdHNldEV4cGFuc2lvblN0YXRlKCk7XG5cblx0XHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0ZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkZXRhaWxzLCAndG9nZ2xlJywgc2V0RXhwYW5zaW9uU3RhdGUpLFxuXHRcdFx0YXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFzaG93Q2hhbmdlcy5yZWFkKHJlYWRlcikpO1xuXHRcdFx0fSksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5DaGFuZ2VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpZmZzID0gdGhpcy5fZGlmZnMuZ2V0KCk7XG5cdFx0aWYgKGRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UoYG11bHRpLWRpZmYtZWRpdG9yOiR7RGF0ZS5ub3coKS50b1N0cmluZygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpfWApO1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNdWx0aURpZmZFZGl0b3JJbnB1dCxcblx0XHRcdHNvdXJjZSxcblx0XHRcdGxvY2FsaXplKCdjaGF0VHVyblBpbGxzLmNoYW5nZXMudGl0bGUnLCBcIlR1cm4gRmlsZSBDaGFuZ2VzXCIpLFxuXHRcdFx0ZGlmZnMubWFwKGRpZmYgPT4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oZGlmZi5vcmlnaW5hbFVSSSwgZGlmZi5tb2RpZmllZFVSSSwgdW5kZWZpbmVkKSksXG5cdFx0XHRmYWxzZSxcblx0XHQpO1xuXHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuUHJpbWFyeVByZXZpZXcoZmlsZXM6IHJlYWRvbmx5IElQcmV2aWV3RmlsZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJpbWFyeUZpbGUgPSBmaWxlcy5hdCgwKTtcblx0XHRpZiAocHJpbWFyeUZpbGUpIHtcblx0XHRcdG9wZW5DaGF0VHVybkZpbGUocHJpbWFyeUZpbGUsIHRoaXMuX29wZW5lclNlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUm93IGFjdGlvbnMgZm9yIHRoZSBjaGFuZ2VkLWZpbGVzIGxpc3Q6IG1hcmtkb3duIGZpbGVzIGdldCBhIGxhYmVsbGVzcyxcblx0ICogaWNvbi1mcmVlIGFjdGlvbiB0aGF0IG9wZW5zIHRoZSBmaWxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0Um93QWN0aW9ucyhkaWZmOiBJRWRpdFNlc3Npb25FbnRyeURpZmYpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGtpbmQgPSBwcmV2aWV3S2luZChkaWZmLm1vZGlmaWVkVVJJKTtcblx0XHRpZiAoIWtpbmQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZTogSVByZXZpZXdGaWxlID0geyB1cmk6IGRpZmYubW9kaWZpZWRVUkksIGtpbmQsIGNyZWF0ZWQ6IGlzRXF1YWwoZGlmZi5vcmlnaW5hbFVSSSwgZGlmZi5tb2RpZmllZFVSSSkgfTtcblx0XHRyZXR1cm4gW3RvQWN0aW9uKHtcblx0XHRcdGlkOiAnY2hhdC50dXJuQ2hhbmdlcy5wcmV2aWV3RmlsZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQudHVybkNoYW5nZXMucHJldmlldycsIFwiUHJldmlld1wiKSxcblx0XHRcdHJ1bjogKCkgPT4gb3BlbkNoYXRUdXJuRmlsZShmaWxlLCB0aGlzLl9vcGVuZXJTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0fSldO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBfZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgX2VsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAndHVyblBpbGxzJ1xuXHRcdFx0JiYgb3RoZXIucmVxdWVzdElkID09PSB0aGlzLl9jb250ZW50LnJlcXVlc3RJZFxuXHRcdFx0JiYgaXNFcXVhbChvdGhlci5zZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NvbnRlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTO0FBQ2xCLFNBQWtCLGdCQUFnQjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0Isa0JBQStCO0FBQzVELFNBQVMsU0FBUyxpQkFBaUIs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
