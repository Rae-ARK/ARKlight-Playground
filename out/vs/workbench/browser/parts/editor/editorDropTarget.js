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
import "./media/editordroptarget.css";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, isAncestor } from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { isMacintosh, isWeb } from "../../../../base/common/platform.js";
import { assertReturnsAllDefined, assertReturnsDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { activeContrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { isTemporaryWorkspace, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { CodeDataTransfers, containsDragType, Extensions as DragAndDropExtensions, LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, extractTreeDropData, ResourcesDropHandler } from "../../dnd.js";
import { prepareMoveCopyEditors } from "./editor.js";
import { EditorInputCapabilities } from "../../../common/editor.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BORDER, EDITOR_DROP_INTO_PROMPT_FOREGROUND } from "../../../common/theme.js";
import { GroupDirection, IEditorGroupsService, MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITreeViewsDnDService } from "../../../../editor/common/services/treeViewsDndService.js";
import { DraggedTreeItemsIdentifier } from "../../../../editor/common/services/treeViewsDnd.js";
function isDropIntoEditorEnabledGlobally(configurationService) {
  return configurationService.getValue("editor.dropIntoEditor.enabled");
}
function isDragIntoEditorEvent(e) {
  return e.shiftKey;
}
let DropOverlay = class extends Themable {
  constructor(groupView, themeService, configurationService, instantiationService, editorService, editorGroupService, treeViewsDragAndDropService, contextService) {
    super(themeService);
    this.groupView = groupView;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.treeViewsDragAndDropService = treeViewsDragAndDropService;
    this.contextService = contextService;
    this.editorTransfer = LocalSelectionTransfer.getInstance();
    this.groupTransfer = LocalSelectionTransfer.getInstance();
    this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
    this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
    this.enableDropIntoEditor = isDropIntoEditorEnabledGlobally(this.configurationService) && this.isDropIntoActiveEditorEnabled();
    this.create();
  }
  get disposed() {
    return !!this._disposed;
  }
  create() {
    const overlayOffsetHeight = this.getOverlayOffsetHeight();
    const container = this.container = $("div", { id: DropOverlay.OVERLAY_ID });
    container.style.top = `${overlayOffsetHeight}px`;
    this.groupView.element.appendChild(container);
    this.groupView.element.classList.add("dragged-over");
    this._register(toDisposable(() => {
      container.remove();
      this.groupView.element.classList.remove("dragged-over");
    }));
    this.overlay = $(".editor-group-overlay-indicator");
    container.appendChild(this.overlay);
    if (this.enableDropIntoEditor) {
      this.dropIntoPromptElement = renderFormattedText(localize("dropIntoEditorPrompt", "Hold __{0}__ to drop into editor", isMacintosh ? "\u21E7" : "Shift"), {});
      this.dropIntoPromptElement.classList.add("editor-group-overlay-drop-into-prompt");
      this.overlay.appendChild(this.dropIntoPromptElement);
    }
    this.registerListeners(container);
    this.updateStyles();
  }
  updateStyles() {
    const overlay = assertReturnsDefined(this.overlay);
    overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || "";
    const activeContrastBorderColor = this.getColor(activeContrastBorder);
    overlay.style.outlineColor = activeContrastBorderColor || "";
    overlay.style.outlineOffset = activeContrastBorderColor ? "-2px" : "";
    overlay.style.outlineStyle = activeContrastBorderColor ? "dashed" : "";
    overlay.style.outlineWidth = activeContrastBorderColor ? "2px" : "";
    if (this.dropIntoPromptElement) {
      this.dropIntoPromptElement.style.backgroundColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BACKGROUND) ?? "";
      this.dropIntoPromptElement.style.color = this.getColor(EDITOR_DROP_INTO_PROMPT_FOREGROUND) ?? "";
      const borderColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BORDER);
      if (borderColor) {
        this.dropIntoPromptElement.style.borderWidth = "1px";
        this.dropIntoPromptElement.style.borderStyle = "solid";
        this.dropIntoPromptElement.style.borderColor = borderColor;
      } else {
        this.dropIntoPromptElement.style.borderWidth = "0";
      }
    }
  }
  registerListeners(container) {
    this._register(new DragAndDropObserver(container, {
      onDragOver: (e) => {
        if (this.enableDropIntoEditor && isDragIntoEditorEvent(e)) {
          this.dispose();
          return;
        }
        const isDraggingGroup = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
        const isDraggingEditor = this.editorTransfer.hasData(DraggedEditorIdentifier.prototype);
        if (!isDraggingEditor && !isDraggingGroup && e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
        let isCopy = true;
        if (isDraggingGroup) {
          isCopy = this.isCopyOperation(e);
        } else if (isDraggingEditor) {
          const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
          if (Array.isArray(data) && data.length > 0) {
            isCopy = this.isCopyOperation(e, data[0].identifier);
          }
        }
        if (!isCopy) {
          const sourceGroupView = this.findSourceGroupView();
          if (sourceGroupView === this.groupView) {
            if (isDraggingGroup || isDraggingEditor && sourceGroupView.count < 2) {
              this.hideOverlay();
              return;
            }
          }
        }
        let splitOnDragAndDrop = !!this.groupView.groupsView.partOptions.splitOnDragAndDrop;
        if (this.isToggleSplitOperation(e)) {
          splitOnDragAndDrop = !splitOnDragAndDrop;
        }
        this.positionOverlay(e.offsetX, e.offsetY, isDraggingGroup, splitOnDragAndDrop);
        if (this.cleanupOverlayScheduler.isScheduled()) {
          this.cleanupOverlayScheduler.cancel();
        }
      },
      onDragLeave: (e) => this.dispose(),
      onDragEnd: (e) => this.dispose(),
      onDrop: (e) => {
        EventHelper.stop(e, true);
        this.dispose();
        if (this.currentDropOperation) {
          this.handleDrop(e, this.currentDropOperation.splitDirection);
        }
      }
    }));
    this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
      if (!this.cleanupOverlayScheduler.isScheduled()) {
        this.cleanupOverlayScheduler.schedule();
      }
    }));
  }
  isDropIntoActiveEditorEnabled() {
    return !!this.groupView.activeEditor?.hasCapability(EditorInputCapabilities.CanDropIntoEditor);
  }
  findSourceGroupView() {
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        return this.editorGroupService.getGroup(data[0].identifier);
      }
    } else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        return this.editorGroupService.getGroup(data[0].identifier.groupId);
      }
    }
    return void 0;
  }
  async handleDrop(event, splitDirection) {
    const ensureTargetGroup = () => {
      let targetGroup;
      if (typeof splitDirection === "number") {
        targetGroup = this.editorGroupService.addGroup(this.groupView, splitDirection);
      } else {
        targetGroup = this.groupView;
      }
      return targetGroup;
    };
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const sourceGroup = this.editorGroupService.getGroup(data[0].identifier);
        if (sourceGroup) {
          if (typeof splitDirection !== "number" && sourceGroup === this.groupView) {
            return;
          }
          let targetGroup;
          if (typeof splitDirection === "number") {
            if (this.isCopyOperation(event)) {
              targetGroup = this.editorGroupService.copyGroup(sourceGroup, this.groupView, splitDirection);
            } else {
              targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
            }
          } else {
            let mergeGroupOptions = void 0;
            if (this.isCopyOperation(event)) {
              mergeGroupOptions = { mode: MergeGroupMode.COPY_EDITORS };
            }
            this.editorGroupService.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
          }
          if (targetGroup) {
            this.editorGroupService.activateGroup(targetGroup);
          }
        }
        this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
      }
    } else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const draggedEditors = data;
        const firstDraggedEditor = data[0].identifier;
        const sourceGroup = this.editorGroupService.getGroup(firstDraggedEditor.groupId);
        if (sourceGroup) {
          const copyEditor = this.isCopyOperation(event, firstDraggedEditor);
          let targetGroup = void 0;
          if (this.groupView.groupsView.partOptions.closeEmptyGroups && sourceGroup.count === 1 && typeof splitDirection === "number" && !copyEditor) {
            targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
          } else {
            targetGroup = ensureTargetGroup();
            if (sourceGroup === targetGroup) {
              return;
            }
            const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map((editor) => editor.identifier.editor));
            if (!copyEditor) {
              sourceGroup.moveEditors(editorsWithOptions, targetGroup);
            } else {
              sourceGroup.copyEditors(editorsWithOptions, targetGroup);
            }
          }
          targetGroup.focus();
        }
        this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
      }
    } else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
      const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const editors = [];
        for (const id of data) {
          const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
          if (dataTransferItem) {
            const treeDropData = await extractTreeDropData(dataTransferItem);
            editors.push(...treeDropData.map((editor) => ({ ...editor, options: { ...editor.options, pinned: true } })));
          }
        }
        if (editors.length) {
          this.editorService.openEditors(editors, ensureTargetGroup(), { validateTrust: true });
        }
      }
      this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
    } else {
      const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: !isWeb || isTemporaryWorkspace(this.contextService.getWorkspace()) });
      dropHandler.handleDrop(event, getWindow(this.groupView.element), () => ensureTargetGroup(), (targetGroup) => targetGroup?.focus());
    }
  }
  isCopyOperation(e, draggedEditor) {
    if (draggedEditor?.editor.hasCapability(EditorInputCapabilities.Singleton)) {
      return false;
    }
    return e.ctrlKey && !isMacintosh || e.altKey && isMacintosh;
  }
  isToggleSplitOperation(e) {
    return e.altKey && !isMacintosh || e.shiftKey && isMacintosh;
  }
  positionOverlay(mousePosX, mousePosY, isDraggingGroup, enableSplitting) {
    const preferSplitVertically = this.groupView.groupsView.partOptions.openSideBySideDirection === "right";
    const editorControlWidth = this.groupView.element.clientWidth;
    const editorControlHeight = this.groupView.element.clientHeight - this.getOverlayOffsetHeight();
    let edgeWidthThresholdFactor;
    let edgeHeightThresholdFactor;
    if (enableSplitting) {
      if (isDraggingGroup) {
        edgeWidthThresholdFactor = preferSplitVertically ? 0.3 : 0.1;
      } else {
        edgeWidthThresholdFactor = 0.1;
      }
      if (isDraggingGroup) {
        edgeHeightThresholdFactor = preferSplitVertically ? 0.1 : 0.3;
      } else {
        edgeHeightThresholdFactor = 0.1;
      }
    } else {
      edgeWidthThresholdFactor = 0;
      edgeHeightThresholdFactor = 0;
    }
    const edgeWidthThreshold = editorControlWidth * edgeWidthThresholdFactor;
    const edgeHeightThreshold = editorControlHeight * edgeHeightThresholdFactor;
    const splitWidthThreshold = editorControlWidth / 3;
    const splitHeightThreshold = editorControlHeight / 3;
    let splitDirection;
    if (mousePosX > edgeWidthThreshold && mousePosX < editorControlWidth - edgeWidthThreshold && mousePosY > edgeHeightThreshold && mousePosY < editorControlHeight - edgeHeightThreshold) {
      splitDirection = void 0;
    } else {
      if (preferSplitVertically) {
        if (mousePosX < splitWidthThreshold) {
          splitDirection = GroupDirection.LEFT;
        } else if (mousePosX > splitWidthThreshold * 2) {
          splitDirection = GroupDirection.RIGHT;
        } else if (mousePosY < editorControlHeight / 2) {
          splitDirection = GroupDirection.UP;
        } else {
          splitDirection = GroupDirection.DOWN;
        }
      } else {
        if (mousePosY < splitHeightThreshold) {
          splitDirection = GroupDirection.UP;
        } else if (mousePosY > splitHeightThreshold * 2) {
          splitDirection = GroupDirection.DOWN;
        } else if (mousePosX < editorControlWidth / 2) {
          splitDirection = GroupDirection.LEFT;
        } else {
          splitDirection = GroupDirection.RIGHT;
        }
      }
    }
    switch (splitDirection) {
      case GroupDirection.UP:
        this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "50%" });
        this.toggleDropIntoPrompt(false);
        break;
      case GroupDirection.DOWN:
        this.doPositionOverlay({ top: "50%", left: "0", width: "100%", height: "50%" });
        this.toggleDropIntoPrompt(false);
        break;
      case GroupDirection.LEFT:
        this.doPositionOverlay({ top: "0", left: "0", width: "50%", height: "100%" });
        this.toggleDropIntoPrompt(false);
        break;
      case GroupDirection.RIGHT:
        this.doPositionOverlay({ top: "0", left: "50%", width: "50%", height: "100%" });
        this.toggleDropIntoPrompt(false);
        break;
      default:
        this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "100%" });
        this.toggleDropIntoPrompt(true);
    }
    const overlay = assertReturnsDefined(this.overlay);
    overlay.style.opacity = "1";
    setTimeout(() => overlay.classList.add("overlay-move-transition"), 0);
    this.currentDropOperation = { splitDirection };
  }
  doPositionOverlay(options) {
    const [container, overlay] = assertReturnsAllDefined(this.container, this.overlay);
    const offsetHeight = this.getOverlayOffsetHeight();
    if (offsetHeight) {
      container.style.height = `calc(100% - ${offsetHeight}px)`;
    } else {
      container.style.height = "100%";
    }
    overlay.style.top = options.top;
    overlay.style.left = options.left;
    overlay.style.width = options.width;
    overlay.style.height = options.height;
  }
  getOverlayOffsetHeight() {
    if (!this.groupView.isEmpty && this.groupView.groupsView.partOptions.showTabs === "multiple") {
      return this.groupView.titleHeight.offset;
    }
    return 0;
  }
  hideOverlay() {
    const overlay = assertReturnsDefined(this.overlay);
    this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "100%" });
    overlay.style.opacity = "0";
    overlay.classList.remove("overlay-move-transition");
    this.currentDropOperation = void 0;
  }
  toggleDropIntoPrompt(showing) {
    if (!this.dropIntoPromptElement) {
      return;
    }
    this.dropIntoPromptElement.style.opacity = showing ? "1" : "0";
  }
  contains(element) {
    return element === this.container || element === this.overlay;
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
DropOverlay.OVERLAY_ID = "monaco-workbench-editor-drop-overlay";
DropOverlay = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, ITreeViewsDnDService),
  __decorateParam(7, IWorkspaceContextService)
], DropOverlay);
let EditorDropTarget = class extends Themable {
  constructor(groupsView, container, delegate, editorGroupService, themeService, configurationService, instantiationService) {
    super(themeService);
    this.groupsView = groupsView;
    this.container = container;
    this.delegate = delegate;
    this.editorGroupService = editorGroupService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.counter = 0;
    this.editorTransfer = LocalSelectionTransfer.getInstance();
    this.groupTransfer = LocalSelectionTransfer.getInstance();
    this.registerListeners();
  }
  get overlay() {
    if (this._overlay && !this._overlay.disposed) {
      return this._overlay;
    }
    return void 0;
  }
  registerListeners() {
    this._register(addDisposableListener(this.container, EventType.DRAG_ENTER, (e) => this.onDragEnter(e)));
    this._register(addDisposableListener(this.container, EventType.DRAG_LEAVE, () => this.onDragLeave()));
    for (const target of [this.container, getWindow(this.container)]) {
      this._register(addDisposableListener(target, EventType.DRAG_END, () => this.onDragEnd()));
    }
  }
  onDragEnter(event) {
    if (isDropIntoEditorEnabledGlobally(this.configurationService) && isDragIntoEditorEvent(event)) {
      return;
    }
    this.counter++;
    if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype) && !this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype) && event.dataTransfer) {
      const dndContributions = Registry.as(DragAndDropExtensions.DragAndDropContribution).getAll();
      const dndContributionKeys = Array.from(dndContributions).map((e) => e.dataFormatKey);
      if (!containsDragType(event, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES, CodeDataTransfers.EDITORS, ...dndContributionKeys)) {
        event.dataTransfer.dropEffect = "none";
        return;
      }
    }
    if (!this.groupsView.partOptions.allowDropIntoGroup) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      return;
    }
    this.updateContainer(true);
    const target = event.target;
    if (target) {
      if (this.overlay && !this.overlay.contains(target)) {
        this.disposeOverlay();
      }
      if (!this.overlay) {
        const targetGroupView = this.findTargetGroupView(target);
        if (targetGroupView) {
          this._overlay = this.instantiationService.createInstance(DropOverlay, targetGroupView);
        }
      }
    }
  }
  onDragLeave() {
    this.counter--;
    if (this.counter === 0) {
      this.updateContainer(false);
    }
  }
  onDragEnd() {
    this.counter = 0;
    this.updateContainer(false);
    this.disposeOverlay();
  }
  findTargetGroupView(child) {
    const groups = this.editorGroupService.groups;
    return groups.find((groupView) => isAncestor(child, groupView.element) || this.delegate.containsGroup?.(groupView));
  }
  updateContainer(isDraggedOver) {
    this.container.classList.toggle("dragged-over", isDraggedOver);
  }
  dispose() {
    super.dispose();
    this.disposeOverlay();
  }
  disposeOverlay() {
    if (this.overlay) {
      this.overlay.dispose();
      this._overlay = void 0;
    }
  }
};
EditorDropTarget = __decorateClass([
  __decorateParam(3, IEditorGroupsService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService)
], EditorDropTarget);
export {
  EditorDropTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JEcm9wVGFyZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2VkaXRvcmRyb3B0YXJnZXQuY3NzJztcbmltcG9ydCB7IERhdGFUcmFuc2ZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRHJhZ0FuZERyb3BPYnNlcnZlciwgRXZlbnRIZWxwZXIsIEV2ZW50VHlwZSwgZ2V0V2luZG93LCBpc0FuY2VzdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJGb3JtYXR0ZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zvcm1hdHRlZFRleHRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNBbGxEZWZpbmVkLCBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1RlbXBvcmFyeVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29kZURhdGFUcmFuc2ZlcnMsIGNvbnRhaW5zRHJhZ1R5cGUsIEV4dGVuc2lvbnMgYXMgRHJhZ0FuZERyb3BFeHRlbnNpb25zLCBJRHJhZ0FuZERyb3BDb250cmlidXRpb25SZWdpc3RyeSwgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLCBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllciwgZXh0cmFjdFRyZWVEcm9wRGF0YSwgUmVzb3VyY2VzRHJvcEhhbmRsZXIgfSBmcm9tICcuLi8uLi9kbmQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1ZpZXcsIElFZGl0b3JHcm91cFZpZXcsIHByZXBhcmVNb3ZlQ29weUVkaXRvcnMgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSUVkaXRvcklkZW50aWZpZXIsIElVbnR5cGVkRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsIEVESVRPUl9EUk9QX0lOVE9fUFJPTVBUX0JBQ0tHUk9VTkQsIEVESVRPUl9EUk9QX0lOVE9fUFJPTVBUX0JPUkRFUiwgRURJVE9SX0RST1BfSU5UT19QUk9NUFRfRk9SRUdST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBHcm91cERpcmVjdGlvbiwgSUVkaXRvckRyb3BUYXJnZXREZWxlZ2F0ZSwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgSU1lcmdlR3JvdXBPcHRpb25zLCBNZXJnZUdyb3VwTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHJlZVZpZXdzRG5EU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVZpZXdzRG5kU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVZpZXdzRG5kLmpzJztcblxuaW50ZXJmYWNlIElEcm9wT3BlcmF0aW9uIHtcblx0c3BsaXREaXJlY3Rpb24/OiBHcm91cERpcmVjdGlvbjtcbn1cblxuZnVuY3Rpb24gaXNEcm9wSW50b0VkaXRvckVuYWJsZWRHbG9iYWxseShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLmRyb3BJbnRvRWRpdG9yLmVuYWJsZWQnKTtcbn1cblxuZnVuY3Rpb24gaXNEcmFnSW50b0VkaXRvckV2ZW50KGU6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZS5zaGlmdEtleTtcbn1cblxuY2xhc3MgRHJvcE92ZXJsYXkgZXh0ZW5kcyBUaGVtYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgT1ZFUkxBWV9JRCA9ICdtb25hY28td29ya2JlbmNoLWVkaXRvci1kcm9wLW92ZXJsYXknO1xuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBvdmVybGF5OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkcm9wSW50b1Byb21wdEVsZW1lbnQ/OiBIVE1MU3BhbkVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50RHJvcE9wZXJhdGlvbjogSURyb3BPcGVyYXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGdldCBkaXNwb3NlZCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5fZGlzcG9zZWQ7IH1cblxuXHRwcml2YXRlIGNsZWFudXBPdmVybGF5U2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRFZGl0b3JJZGVudGlmaWVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJlZUl0ZW1zVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZW5hYmxlRHJvcEludG9FZGl0b3I6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXcsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElUcmVlVmlld3NEbkRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlOiBJVHJlZVZpZXdzRG5EU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZGlzcG9zZSgpLCAzMDApKTtcblxuXHRcdHRoaXMuZW5hYmxlRHJvcEludG9FZGl0b3IgPSBpc0Ryb3BJbnRvRWRpdG9yRW5hYmxlZEdsb2JhbGx5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpICYmIHRoaXMuaXNEcm9wSW50b0FjdGl2ZUVkaXRvckVuYWJsZWQoKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5T2Zmc2V0SGVpZ2h0ID0gdGhpcy5nZXRPdmVybGF5T2Zmc2V0SGVpZ2h0KCk7XG5cblx0XHQvLyBDb250YWluZXJcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lciA9ICQoJ2RpdicsIHsgaWQ6IERyb3BPdmVybGF5Lk9WRVJMQVlfSUQgfSk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLnRvcCA9IGAke292ZXJsYXlPZmZzZXRIZWlnaHR9cHhgO1xuXG5cdFx0Ly8gUGFyZW50XG5cdFx0dGhpcy5ncm91cFZpZXcuZWxlbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHRoaXMuZ3JvdXBWaWV3LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZHJhZ2dlZC1vdmVyJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuZ3JvdXBWaWV3LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dlZC1vdmVyJyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT3ZlcmxheVxuXHRcdHRoaXMub3ZlcmxheSA9ICQoJy5lZGl0b3ItZ3JvdXAtb3ZlcmxheS1pbmRpY2F0b3InKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5vdmVybGF5KTtcblxuXHRcdGlmICh0aGlzLmVuYWJsZURyb3BJbnRvRWRpdG9yKSB7XG5cdFx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudCA9IHJlbmRlckZvcm1hdHRlZFRleHQobG9jYWxpemUoJ2Ryb3BJbnRvRWRpdG9yUHJvbXB0JywgXCJIb2xkIF9fezB9X18gdG8gZHJvcCBpbnRvIGVkaXRvclwiLCBpc01hY2ludG9zaCA/ICdcdTIxRTcnIDogJ1NoaWZ0JyksIHt9KTtcblx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2VkaXRvci1ncm91cC1vdmVybGF5LWRyb3AtaW50by1wcm9tcHQnKTtcblx0XHRcdHRoaXMub3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3ZlcmxheSBFdmVudCBIYW5kbGluZ1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoY29udGFpbmVyKTtcblxuXHRcdC8vIFN0eWxlc1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMub3ZlcmxheSk7XG5cblx0XHQvLyBPdmVybGF5IGRyb3AgYmFja2dyb3VuZFxuXHRcdG92ZXJsYXkuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihFRElUT1JfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EKSB8fCAnJztcblxuXHRcdC8vIE92ZXJsYXkgY29udHJhc3QgYm9yZGVyIChpZiBhbnkpXG5cdFx0Y29uc3QgYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoYWN0aXZlQ29udHJhc3RCb3JkZXIpO1xuXHRcdG92ZXJsYXkuc3R5bGUub3V0bGluZUNvbG9yID0gYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciB8fCAnJztcblx0XHRvdmVybGF5LnN0eWxlLm91dGxpbmVPZmZzZXQgPSBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID8gJy0ycHgnIDogJyc7XG5cdFx0b3ZlcmxheS5zdHlsZS5vdXRsaW5lU3R5bGUgPSBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID8gJ2Rhc2hlZCcgOiAnJztcblx0XHRvdmVybGF5LnN0eWxlLm91dGxpbmVXaWR0aCA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnMnB4JyA6ICcnO1xuXG5cdFx0aWYgKHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50KSB7XG5cdFx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKEVESVRPUl9EUk9QX0lOVE9fUFJPTVBUX0JBQ0tHUk9VTkQpID8/ICcnO1xuXHRcdFx0dGhpcy5kcm9wSW50b1Byb21wdEVsZW1lbnQuc3R5bGUuY29sb3IgPSB0aGlzLmdldENvbG9yKEVESVRPUl9EUk9QX0lOVE9fUFJPTVBUX0ZPUkVHUk9VTkQpID8/ICcnO1xuXG5cdFx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoRURJVE9SX0RST1BfSU5UT19QUk9NUFRfQk9SREVSKTtcblx0XHRcdGlmIChib3JkZXJDb2xvcikge1xuXHRcdFx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudC5zdHlsZS5ib3JkZXJXaWR0aCA9ICcxcHgnO1xuXHRcdFx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudC5zdHlsZS5ib3JkZXJTdHlsZSA9ICdzb2xpZCc7XG5cdFx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LnN0eWxlLmJvcmRlckNvbG9yID0gYm9yZGVyQ29sb3I7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudC5zdHlsZS5ib3JkZXJXaWR0aCA9ICcwJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcihjb250YWluZXIsIHtcblx0XHRcdG9uRHJhZ092ZXI6IGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5lbmFibGVEcm9wSW50b0VkaXRvciAmJiBpc0RyYWdJbnRvRWRpdG9yRXZlbnQoZSkpIHtcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc0RyYWdnaW5nR3JvdXAgPSB0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdGNvbnN0IGlzRHJhZ2dpbmdFZGl0b3IgPSB0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKTtcblxuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGRyb3BFZmZlY3QgdG8gXCJjb3B5XCIgaWYgdGhlcmUgaXMgbm8gbG9jYWwgZGF0YSB0byBiZSBkcmFnZ2VkIGJlY2F1c2Vcblx0XHRcdFx0Ly8gaW4gdGhhdCBjYXNlIHdlIGNhbiBvbmx5IGNvcHkgdGhlIGRhdGEgaW50byBhbmQgbm90IG1vdmUgaXQgZnJvbSBpdHMgc291cmNlXG5cdFx0XHRcdGlmICghaXNEcmFnZ2luZ0VkaXRvciAmJiAhaXNEcmFnZ2luZ0dyb3VwICYmIGUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdjb3B5Jztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZpbmQgb3V0IGlmIG9wZXJhdGlvbiBpcyB2YWxpZFxuXHRcdFx0XHRsZXQgaXNDb3B5ID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGlzRHJhZ2dpbmdHcm91cCkge1xuXHRcdFx0XHRcdGlzQ29weSA9IHRoaXMuaXNDb3B5T3BlcmF0aW9uKGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzRHJhZ2dpbmdFZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5lZGl0b3JUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRpc0NvcHkgPSB0aGlzLmlzQ29weU9wZXJhdGlvbihlLCBkYXRhWzBdLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaXNDb3B5KSB7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXBWaWV3ID0gdGhpcy5maW5kU291cmNlR3JvdXBWaWV3KCk7XG5cdFx0XHRcdFx0aWYgKHNvdXJjZUdyb3VwVmlldyA9PT0gdGhpcy5ncm91cFZpZXcpIHtcblx0XHRcdFx0XHRcdGlmIChpc0RyYWdnaW5nR3JvdXAgfHwgKGlzRHJhZ2dpbmdFZGl0b3IgJiYgc291cmNlR3JvdXBWaWV3LmNvdW50IDwgMikpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5oaWRlT3ZlcmxheSgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBhbGxvdyB0byBkcm9wIGdyb3VwL2VkaXRvciBvbiBpdHNlbGYgaWYgdGhpcyByZXN1bHRzIGluIGFuIGVtcHR5IGdyb3VwXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUG9zaXRpb24gb3ZlcmxheSBhbmQgY29uZGl0aW9uYWxseSBlbmFibGUgb3IgZGlzYWJsZVxuXHRcdFx0XHQvLyBlZGl0b3IgZ3JvdXAgc3BsaXR0aW5nIHN1cHBvcnQgYmFzZWQgb24gc2V0dGluZyBhbmRcblx0XHRcdFx0Ly8ga2V5bW9kaWZpZXJzIHVzZWQuXG5cdFx0XHRcdGxldCBzcGxpdE9uRHJhZ0FuZERyb3AgPSAhIXRoaXMuZ3JvdXBWaWV3Lmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuc3BsaXRPbkRyYWdBbmREcm9wO1xuXHRcdFx0XHRpZiAodGhpcy5pc1RvZ2dsZVNwbGl0T3BlcmF0aW9uKGUpKSB7XG5cdFx0XHRcdFx0c3BsaXRPbkRyYWdBbmREcm9wID0gIXNwbGl0T25EcmFnQW5kRHJvcDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnBvc2l0aW9uT3ZlcmxheShlLm9mZnNldFgsIGUub2Zmc2V0WSwgaXNEcmFnZ2luZ0dyb3VwLCBzcGxpdE9uRHJhZ0FuZERyb3ApO1xuXG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byBzdG9wIGFueSBydW5uaW5nIGNsZWFudXAgc2NoZWR1bGVyIHRvIHJlbW92ZSB0aGUgb3ZlcmxheVxuXHRcdFx0XHRpZiAodGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0b25EcmFnTGVhdmU6IGUgPT4gdGhpcy5kaXNwb3NlKCksXG5cdFx0XHRvbkRyYWdFbmQ6IGUgPT4gdGhpcy5kaXNwb3NlKCksXG5cblx0XHRcdG9uRHJvcDogZSA9PiB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdFx0Ly8gRGlzcG9zZSBvdmVybGF5XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdC8vIEhhbmRsZSBkcm9wIGlmIHdlIGhhdmUgYSB2YWxpZCBvcGVyYXRpb25cblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudERyb3BPcGVyYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZURyb3AoZSwgdGhpcy5jdXJyZW50RHJvcE9wZXJhdGlvbi5zcGxpdERpcmVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4ge1xuXHRcdFx0Ly8gVW5kZXIgc29tZSBjaXJjdW1zdGFuY2VzIHdlIGhhdmUgc2VlbiByZXBvcnRzIHdoZXJlIHRoZSBkcm9wIG92ZXJsYXkgaXMgbm90IGJlaW5nXG5cdFx0XHQvLyBjbGVhbmVkIHVwIGFuZCBhcyBzdWNoIHRoZSBlZGl0b3IgYXJlYSByZW1haW5zIHVuZGVyIHRoZSBvdmVybGF5IHNvIHRoYXQgeW91IGNhbm5vdFxuXHRcdFx0Ly8gdHlwZSBpbnRvIHRoZSBlZGl0b3IgYW55bW9yZS4gVGhpcyBzZWVtcyByZWxhdGVkIHRvIHVzaW5nIFZNcyBhbmQgRE5EIHZpYSBob3N0IGFuZFxuXHRcdFx0Ly8gZ3Vlc3QgT1MsIHRob3VnaCBzb21lIHVzZXJzIGFsc28gc2F3IGl0IHdpdGhvdXQgVk1zLlxuXHRcdFx0Ly8gVG8gcHJvdGVjdCBhZ2FpbnN0IHRoaXMgaXNzdWUgd2UgYWx3YXlzIGRlc3Ryb3kgdGhlIG92ZXJsYXkgYXMgc29vbiBhcyB3ZSBkZXRlY3QgYVxuXHRcdFx0Ly8gbW91c2UgZXZlbnQgb3ZlciBpdC4gVGhlIGRlbGF5IGlzIHVzZWQgdG8gZ3VhcmFudGVlIHdlIGFyZSBub3QgaW50ZXJmZXJpbmcgd2l0aCB0aGVcblx0XHRcdC8vIGFjdHVhbCBEUk9QIGV2ZW50IHRoYXQgY2FuIGFsc28gdHJpZ2dlciBhIG1vdXNlIG92ZXIgZXZlbnQuXG5cdFx0XHRpZiAoIXRoaXMuY2xlYW51cE92ZXJsYXlTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0Ryb3BJbnRvQWN0aXZlRWRpdG9yRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmdyb3VwVmlldy5hY3RpdmVFZGl0b3I/Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuRHJvcEludG9FZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kU291cmNlR3JvdXBWaWV3KCk6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBDaGVjayBmb3IgZ3JvdXAgdHJhbnNmZXJcblx0XHRpZiAodGhpcy5ncm91cFRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5ncm91cFRyYW5zZmVyLmdldERhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChkYXRhWzBdLmlkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBlZGl0b3IgdHJhbnNmZXJcblx0XHRlbHNlIGlmICh0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZWRpdG9yVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChkYXRhWzBdLmlkZW50aWZpZXIuZ3JvdXBJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlRHJvcChldmVudDogRHJhZ0V2ZW50LCBzcGxpdERpcmVjdGlvbj86IEdyb3VwRGlyZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBEZXRlcm1pbmUgdGFyZ2V0IGdyb3VwXG5cdFx0Y29uc3QgZW5zdXJlVGFyZ2V0R3JvdXAgPSAoKSA9PiB7XG5cdFx0XHRsZXQgdGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cDtcblx0XHRcdGlmICh0eXBlb2Ygc3BsaXREaXJlY3Rpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWRkR3JvdXAodGhpcy5ncm91cFZpZXcsIHNwbGl0RGlyZWN0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gdGhpcy5ncm91cFZpZXc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0YXJnZXRHcm91cDtcblx0XHR9O1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIGdyb3VwIHRyYW5zZmVyXG5cdFx0aWYgKHRoaXMuZ3JvdXBUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZ3JvdXBUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGRhdGEpICYmIGRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGRhdGFbMF0uaWRlbnRpZmllcik7XG5cdFx0XHRcdGlmIChzb3VyY2VHcm91cCkge1xuXHRcdFx0XHRcdGlmICh0eXBlb2Ygc3BsaXREaXJlY3Rpb24gIT09ICdudW1iZXInICYmIHNvdXJjZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFNwbGl0IHRvIG5ldyBncm91cFxuXHRcdFx0XHRcdGxldCB0YXJnZXRHcm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0eXBlb2Ygc3BsaXREaXJlY3Rpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5pc0NvcHlPcGVyYXRpb24oZXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldEdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuY29weUdyb3VwKHNvdXJjZUdyb3VwLCB0aGlzLmdyb3VwVmlldywgc3BsaXREaXJlY3Rpb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tb3ZlR3JvdXAoc291cmNlR3JvdXAsIHRoaXMuZ3JvdXBWaWV3LCBzcGxpdERpcmVjdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTWVyZ2UgaW50byBleGlzdGluZyBncm91cFxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0bGV0IG1lcmdlR3JvdXBPcHRpb25zOiBJTWVyZ2VHcm91cE9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5pc0NvcHlPcGVyYXRpb24oZXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRcdG1lcmdlR3JvdXBPcHRpb25zID0geyBtb2RlOiBNZXJnZUdyb3VwTW9kZS5DT1BZX0VESVRPUlMgfTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWVyZ2VHcm91cChzb3VyY2VHcm91cCwgdGhpcy5ncm91cFZpZXcsIG1lcmdlR3JvdXBPcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGFyZ2V0R3JvdXApIHtcblx0XHRcdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2YXRlR3JvdXAodGFyZ2V0R3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZ3JvdXBUcmFuc2Zlci5jbGVhckRhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBlZGl0b3IgdHJhbnNmZXJcblx0XHRlbHNlIGlmICh0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZWRpdG9yVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGRyYWdnZWRFZGl0b3JzID0gZGF0YTtcblx0XHRcdFx0Y29uc3QgZmlyc3REcmFnZ2VkRWRpdG9yID0gZGF0YVswXS5pZGVudGlmaWVyO1xuXG5cdFx0XHRcdGNvbnN0IHNvdXJjZUdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoZmlyc3REcmFnZ2VkRWRpdG9yLmdyb3VwSWQpO1xuXHRcdFx0XHRpZiAoc291cmNlR3JvdXApIHtcblx0XHRcdFx0XHRjb25zdCBjb3B5RWRpdG9yID0gdGhpcy5pc0NvcHlPcGVyYXRpb24oZXZlbnQsIGZpcnN0RHJhZ2dlZEVkaXRvcik7XG5cdFx0XHRcdFx0bGV0IHRhcmdldEdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHQvLyBPcHRpbWl6YXRpb246IGlmIHdlIG1vdmUgdGhlIGxhc3QgZWRpdG9yIG9mIGFuIGVkaXRvciBncm91cFxuXHRcdFx0XHRcdC8vIGFuZCB3ZSBhcmUgY29uZmlndXJlZCB0byBjbG9zZSBlbXB0eSBlZGl0b3IgZ3JvdXBzLCB3ZSBjYW5cblx0XHRcdFx0XHQvLyByYXRoZXIgbW92ZSB0aGUgZW50aXJlIGVkaXRvciBncm91cCBhY2NvcmRpbmcgdG8gdGhlIGRpcmVjdGlvblxuXHRcdFx0XHRcdGlmICh0aGlzLmdyb3VwVmlldy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmNsb3NlRW1wdHlHcm91cHMgJiYgc291cmNlR3JvdXAuY291bnQgPT09IDEgJiYgdHlwZW9mIHNwbGl0RGlyZWN0aW9uID09PSAnbnVtYmVyJyAmJiAhY29weUVkaXRvcikge1xuXHRcdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tb3ZlR3JvdXAoc291cmNlR3JvdXAsIHRoaXMuZ3JvdXBWaWV3LCBzcGxpdERpcmVjdGlvbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gSW4gYW55IG90aGVyIGNhc2UgZG8gYSBub3JtYWwgbW92ZS9jb3B5IG9wZXJhdGlvblxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlbnN1cmVUYXJnZXRHcm91cCgpO1xuXHRcdFx0XHRcdFx0aWYgKHNvdXJjZUdyb3VwID09PSB0YXJnZXRHcm91cCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvcnNXaXRoT3B0aW9ucyA9IHByZXBhcmVNb3ZlQ29weUVkaXRvcnModGhpcy5ncm91cFZpZXcsIGRyYWdnZWRFZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLmlkZW50aWZpZXIuZWRpdG9yKSk7XG5cdFx0XHRcdFx0XHRpZiAoIWNvcHlFZGl0b3IpIHtcblx0XHRcdFx0XHRcdFx0c291cmNlR3JvdXAubW92ZUVkaXRvcnMoZWRpdG9yc1dpdGhPcHRpb25zLCB0YXJnZXRHcm91cCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzb3VyY2VHcm91cC5jb3B5RWRpdG9ycyhlZGl0b3JzV2l0aE9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBFbnN1cmUgdGFyZ2V0IGhhcyBmb2N1c1xuXHRcdFx0XHRcdHRhcmdldEdyb3VwLmZvY3VzKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmVkaXRvclRyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciB0cmVlIGl0ZW1zXG5cdFx0ZWxzZSBpZiAodGhpcy50cmVlSXRlbXNUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmdldERhdGEoRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGRhdGEpICYmIGRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzOiBJVW50eXBlZEVkaXRvcklucHV0W10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBkYXRhKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YVRyYW5zZmVySXRlbSA9IGF3YWl0IHRoaXMudHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlLnJlbW92ZURyYWdPcGVyYXRpb25UcmFuc2ZlcihpZC5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRpZiAoZGF0YVRyYW5zZmVySXRlbSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdHJlZURyb3BEYXRhID0gYXdhaXQgZXh0cmFjdFRyZWVEcm9wRGF0YShkYXRhVHJhbnNmZXJJdGVtKTtcblx0XHRcdFx0XHRcdGVkaXRvcnMucHVzaCguLi50cmVlRHJvcERhdGEubWFwKGVkaXRvciA9PiAoeyAuLi5lZGl0b3IsIG9wdGlvbnM6IHsgLi4uZWRpdG9yLm9wdGlvbnMsIHBpbm5lZDogdHJ1ZSB9IH0pKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhlZGl0b3JzLCBlbnN1cmVUYXJnZXRHcm91cCgpLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy50cmVlSXRlbXNUcmFuc2Zlci5jbGVhckRhdGEoRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgVVJJIHRyYW5zZmVyXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBkcm9wSGFuZGxlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VzRHJvcEhhbmRsZXIsIHsgYWxsb3dXb3Jrc3BhY2VPcGVuOiAhaXNXZWIgfHwgaXNUZW1wb3JhcnlXb3Jrc3BhY2UodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkgfSk7XG5cdFx0XHRkcm9wSGFuZGxlci5oYW5kbGVEcm9wKGV2ZW50LCBnZXRXaW5kb3codGhpcy5ncm91cFZpZXcuZWxlbWVudCksICgpID0+IGVuc3VyZVRhcmdldEdyb3VwKCksIHRhcmdldEdyb3VwID0+IHRhcmdldEdyb3VwPy5mb2N1cygpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzQ29weU9wZXJhdGlvbihlOiBEcmFnRXZlbnQsIGRyYWdnZWRFZGl0b3I/OiBJRWRpdG9ySWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdGlmIChkcmFnZ2VkRWRpdG9yPy5lZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIFNpbmdsZXRvbiBlZGl0b3JzIGNhbm5vdCBiZSBzcGxpdFxuXHRcdH1cblxuXHRcdHJldHVybiAoZS5jdHJsS2V5ICYmICFpc01hY2ludG9zaCkgfHwgKGUuYWx0S2V5ICYmIGlzTWFjaW50b3NoKTtcblx0fVxuXG5cdHByaXZhdGUgaXNUb2dnbGVTcGxpdE9wZXJhdGlvbihlOiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKGUuYWx0S2V5ICYmICFpc01hY2ludG9zaCkgfHwgKGUuc2hpZnRLZXkgJiYgaXNNYWNpbnRvc2gpO1xuXHR9XG5cblx0cHJpdmF0ZSBwb3NpdGlvbk92ZXJsYXkobW91c2VQb3NYOiBudW1iZXIsIG1vdXNlUG9zWTogbnVtYmVyLCBpc0RyYWdnaW5nR3JvdXA6IGJvb2xlYW4sIGVuYWJsZVNwbGl0dGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHByZWZlclNwbGl0VmVydGljYWxseSA9IHRoaXMuZ3JvdXBWaWV3Lmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMub3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCc7XG5cblx0XHRjb25zdCBlZGl0b3JDb250cm9sV2lkdGggPSB0aGlzLmdyb3VwVmlldy5lbGVtZW50LmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2xIZWlnaHQgPSB0aGlzLmdyb3VwVmlldy5lbGVtZW50LmNsaWVudEhlaWdodCAtIHRoaXMuZ2V0T3ZlcmxheU9mZnNldEhlaWdodCgpO1xuXG5cdFx0bGV0IGVkZ2VXaWR0aFRocmVzaG9sZEZhY3RvcjogbnVtYmVyO1xuXHRcdGxldCBlZGdlSGVpZ2h0VGhyZXNob2xkRmFjdG9yOiBudW1iZXI7XG5cdFx0aWYgKGVuYWJsZVNwbGl0dGluZykge1xuXHRcdFx0aWYgKGlzRHJhZ2dpbmdHcm91cCkge1xuXHRcdFx0XHRlZGdlV2lkdGhUaHJlc2hvbGRGYWN0b3IgPSBwcmVmZXJTcGxpdFZlcnRpY2FsbHkgPyAwLjMgOiAwLjE7IC8vIGdpdmUgbGFyZ2VyIHRocmVzaG9sZCB3aGVuIGRyYWdnaW5nIGdyb3VwIGRlcGVuZGluZyBvbiBwcmVmZXJyZWQgc3BsaXQgZGlyZWN0aW9uXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlZGdlV2lkdGhUaHJlc2hvbGRGYWN0b3IgPSAwLjE7IC8vIDEwJSB0aHJlc2hvbGQgdG8gc3BsaXQgaWYgZHJhZ2dpbmcgZWRpdG9yc1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNEcmFnZ2luZ0dyb3VwKSB7XG5cdFx0XHRcdGVkZ2VIZWlnaHRUaHJlc2hvbGRGYWN0b3IgPSBwcmVmZXJTcGxpdFZlcnRpY2FsbHkgPyAwLjEgOiAwLjM7IC8vIGdpdmUgbGFyZ2VyIHRocmVzaG9sZCB3aGVuIGRyYWdnaW5nIGdyb3VwIGRlcGVuZGluZyBvbiBwcmVmZXJyZWQgc3BsaXQgZGlyZWN0aW9uXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlZGdlSGVpZ2h0VGhyZXNob2xkRmFjdG9yID0gMC4xOyAvLyAxMCUgdGhyZXNob2xkIHRvIHNwbGl0IGlmIGRyYWdnaW5nIGVkaXRvcnNcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWRnZVdpZHRoVGhyZXNob2xkRmFjdG9yID0gMDtcblx0XHRcdGVkZ2VIZWlnaHRUaHJlc2hvbGRGYWN0b3IgPSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkZ2VXaWR0aFRocmVzaG9sZCA9IGVkaXRvckNvbnRyb2xXaWR0aCAqIGVkZ2VXaWR0aFRocmVzaG9sZEZhY3Rvcjtcblx0XHRjb25zdCBlZGdlSGVpZ2h0VGhyZXNob2xkID0gZWRpdG9yQ29udHJvbEhlaWdodCAqIGVkZ2VIZWlnaHRUaHJlc2hvbGRGYWN0b3I7XG5cblx0XHRjb25zdCBzcGxpdFdpZHRoVGhyZXNob2xkID0gZWRpdG9yQ29udHJvbFdpZHRoIC8gMztcdFx0Ly8gb2ZmZXIgdG8gc3BsaXQgbGVmdC9yaWdodCBhdCAzMyVcblx0XHRjb25zdCBzcGxpdEhlaWdodFRocmVzaG9sZCA9IGVkaXRvckNvbnRyb2xIZWlnaHQgLyAzO1x0Ly8gb2ZmZXIgdG8gc3BsaXQgdXAvZG93biBhdCAzMyVcblxuXHRcdC8vIE5vIHNwbGl0IGlmIG1vdXNlIGlzIGFib3ZlIGNlcnRhaW4gdGhyZXNob2xkIGluIHRoZSBjZW50ZXIgb2YgdGhlIHZpZXdcblx0XHRsZXQgc3BsaXREaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChcblx0XHRcdG1vdXNlUG9zWCA+IGVkZ2VXaWR0aFRocmVzaG9sZCAmJiBtb3VzZVBvc1ggPCBlZGl0b3JDb250cm9sV2lkdGggLSBlZGdlV2lkdGhUaHJlc2hvbGQgJiZcblx0XHRcdG1vdXNlUG9zWSA+IGVkZ2VIZWlnaHRUaHJlc2hvbGQgJiYgbW91c2VQb3NZIDwgZWRpdG9yQ29udHJvbEhlaWdodCAtIGVkZ2VIZWlnaHRUaHJlc2hvbGRcblx0XHQpIHtcblx0XHRcdHNwbGl0RGlyZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE9mZmVyIHRvIHNwbGl0IG90aGVyd2lzZVxuXHRcdGVsc2Uge1xuXG5cdFx0XHQvLyBVc2VyIHByZWZlcnMgdG8gc3BsaXQgdmVydGljYWxseTogb2ZmZXIgYSBsYXJnZXIgaGl0em9uZVxuXHRcdFx0Ly8gZm9yIHRoaXMgZGlyZWN0aW9uIGxpa2Ugc286XG5cdFx0XHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHQvLyB8XHRcdHxcdFx0U1BMSVQgVVBcdFx0fFx0XHRcdHxcblx0XHRcdC8vIHwgU1BMSVQgXHR8LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18XHRTUExJVFx0fFxuXHRcdFx0Ly8gfFx0XHR8XHRcdCAgTUVSR0VcdFx0XHR8XHRcdFx0fFxuXHRcdFx0Ly8gfCBMRUZUXHR8LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18XHRSSUdIVFx0fFxuXHRcdFx0Ly8gfFx0XHR8XHRcdFNQTElUIERPV05cdFx0fFx0XHRcdHxcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdGlmIChwcmVmZXJTcGxpdFZlcnRpY2FsbHkpIHtcblx0XHRcdFx0aWYgKG1vdXNlUG9zWCA8IHNwbGl0V2lkdGhUaHJlc2hvbGQpIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLkxFRlQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAobW91c2VQb3NYID4gc3BsaXRXaWR0aFRocmVzaG9sZCAqIDIpIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLlJJR0hUO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1vdXNlUG9zWSA8IGVkaXRvckNvbnRyb2xIZWlnaHQgLyAyKSB7XG5cdFx0XHRcdFx0c3BsaXREaXJlY3Rpb24gPSBHcm91cERpcmVjdGlvbi5VUDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLkRPV047XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVXNlciBwcmVmZXJzIHRvIHNwbGl0IGhvcml6b250YWxseTogb2ZmZXIgYSBsYXJnZXIgaGl0em9uZVxuXHRcdFx0Ly8gZm9yIHRoaXMgZGlyZWN0aW9uIGxpa2Ugc286XG5cdFx0XHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHQvLyB8XHRcdFx0XHRTUExJVCBVUFx0XHRcdFx0XHR8XG5cdFx0XHQvLyB8LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18XG5cdFx0XHQvLyB8ICBTUExJVCBMRUZUICB8XHQgICBNRVJHRVx0fCAgU1BMSVQgUklHSFQgIHxcblx0XHRcdC8vIHwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXxcblx0XHRcdC8vIHxcdFx0XHRcdFNQTElUIERPV05cdFx0XHRcdFx0fFxuXHRcdFx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGlmIChtb3VzZVBvc1kgPCBzcGxpdEhlaWdodFRocmVzaG9sZCkge1xuXHRcdFx0XHRcdHNwbGl0RGlyZWN0aW9uID0gR3JvdXBEaXJlY3Rpb24uVVA7XG5cdFx0XHRcdH0gZWxzZSBpZiAobW91c2VQb3NZID4gc3BsaXRIZWlnaHRUaHJlc2hvbGQgKiAyKSB7XG5cdFx0XHRcdFx0c3BsaXREaXJlY3Rpb24gPSBHcm91cERpcmVjdGlvbi5ET1dOO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1vdXNlUG9zWCA8IGVkaXRvckNvbnRyb2xXaWR0aCAvIDIpIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLkxFRlQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3BsaXREaXJlY3Rpb24gPSBHcm91cERpcmVjdGlvbi5SSUdIVDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERyYXcgb3ZlcmxheSBiYXNlZCBvbiBzcGxpdCBkaXJlY3Rpb25cblx0XHRzd2l0Y2ggKHNwbGl0RGlyZWN0aW9uKSB7XG5cdFx0XHRjYXNlIEdyb3VwRGlyZWN0aW9uLlVQOlxuXHRcdFx0XHR0aGlzLmRvUG9zaXRpb25PdmVybGF5KHsgdG9wOiAnMCcsIGxlZnQ6ICcwJywgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnNTAlJyB9KTtcblx0XHRcdFx0dGhpcy50b2dnbGVEcm9wSW50b1Byb21wdChmYWxzZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cERpcmVjdGlvbi5ET1dOOlxuXHRcdFx0XHR0aGlzLmRvUG9zaXRpb25PdmVybGF5KHsgdG9wOiAnNTAlJywgbGVmdDogJzAnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICc1MCUnIH0pO1xuXHRcdFx0XHR0aGlzLnRvZ2dsZURyb3BJbnRvUHJvbXB0KGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwRGlyZWN0aW9uLkxFRlQ6XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgbGVmdDogJzAnLCB3aWR0aDogJzUwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdFx0XHR0aGlzLnRvZ2dsZURyb3BJbnRvUHJvbXB0KGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwRGlyZWN0aW9uLlJJR0hUOlxuXHRcdFx0XHR0aGlzLmRvUG9zaXRpb25PdmVybGF5KHsgdG9wOiAnMCcsIGxlZnQ6ICc1MCUnLCB3aWR0aDogJzUwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdFx0XHR0aGlzLnRvZ2dsZURyb3BJbnRvUHJvbXB0KGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLmRvUG9zaXRpb25PdmVybGF5KHsgdG9wOiAnMCcsIGxlZnQ6ICcwJywgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScgfSk7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRHJvcEludG9Qcm9tcHQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBvdmVybGF5IGlzIHZpc2libGUgbm93XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMub3ZlcmxheSk7XG5cdFx0b3ZlcmxheS5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuXG5cdFx0Ly8gRW5hYmxlIHRyYW5zaXRpb24gYWZ0ZXIgYSB0aW1lb3V0IHRvIHByZXZlbnQgaW5pdGlhbCBhbmltYXRpb25cblx0XHRzZXRUaW1lb3V0KCgpID0+IG92ZXJsYXkuY2xhc3NMaXN0LmFkZCgnb3ZlcmxheS1tb3ZlLXRyYW5zaXRpb24nKSwgMCk7XG5cblx0XHQvLyBSZW1lbWJlciBhcyBjdXJyZW50IHNwbGl0IGRpcmVjdGlvblxuXHRcdHRoaXMuY3VycmVudERyb3BPcGVyYXRpb24gPSB7IHNwbGl0RGlyZWN0aW9uIH07XG5cdH1cblxuXHRwcml2YXRlIGRvUG9zaXRpb25PdmVybGF5KG9wdGlvbnM6IHsgdG9wOiBzdHJpbmc7IGxlZnQ6IHN0cmluZzsgd2lkdGg6IHN0cmluZzsgaGVpZ2h0OiBzdHJpbmcgfSk6IHZvaWQge1xuXHRcdGNvbnN0IFtjb250YWluZXIsIG92ZXJsYXldID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy5jb250YWluZXIsIHRoaXMub3ZlcmxheSk7XG5cblx0XHQvLyBDb250YWluZXJcblx0XHRjb25zdCBvZmZzZXRIZWlnaHQgPSB0aGlzLmdldE92ZXJsYXlPZmZzZXRIZWlnaHQoKTtcblx0XHRpZiAob2Zmc2V0SGVpZ2h0KSB7XG5cdFx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYGNhbGMoMTAwJSAtICR7b2Zmc2V0SGVpZ2h0fXB4KWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0fVxuXG5cdFx0Ly8gT3ZlcmxheVxuXHRcdG92ZXJsYXkuc3R5bGUudG9wID0gb3B0aW9ucy50b3A7XG5cdFx0b3ZlcmxheS5zdHlsZS5sZWZ0ID0gb3B0aW9ucy5sZWZ0O1xuXHRcdG92ZXJsYXkuc3R5bGUud2lkdGggPSBvcHRpb25zLndpZHRoO1xuXHRcdG92ZXJsYXkuc3R5bGUuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldE92ZXJsYXlPZmZzZXRIZWlnaHQoKTogbnVtYmVyIHtcblxuXHRcdC8vIFdpdGggdGFicyBhbmQgb3BlbmVkIGVkaXRvcnM6IHVzZSB0aGUgYXJlYSBiZWxvdyB0YWJzIGFzIGRyb3AgdGFyZ2V0XG5cdFx0aWYgKCF0aGlzLmdyb3VwVmlldy5pc0VtcHR5ICYmIHRoaXMuZ3JvdXBWaWV3Lmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmdyb3VwVmlldy50aXRsZUhlaWdodC5vZmZzZXQ7XG5cdFx0fVxuXG5cdFx0Ly8gV2l0aG91dCB0YWJzIG9yIGVtcHR5IGdyb3VwOiB1c2UgZW50aXJlIGVkaXRvciBhcmVhIGFzIGRyb3AgdGFyZ2V0XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVPdmVybGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IG92ZXJsYXkgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLm92ZXJsYXkpO1xuXG5cdFx0Ly8gUmVzZXQgb3ZlcmxheVxuXHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgbGVmdDogJzAnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJyB9KTtcblx0XHRvdmVybGF5LnN0eWxlLm9wYWNpdHkgPSAnMCc7XG5cdFx0b3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCdvdmVybGF5LW1vdmUtdHJhbnNpdGlvbicpO1xuXG5cdFx0Ly8gUmVzZXQgY3VycmVudCBvcGVyYXRpb25cblx0XHR0aGlzLmN1cnJlbnREcm9wT3BlcmF0aW9uID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVEcm9wSW50b1Byb21wdChzaG93aW5nOiBib29sZWFuKSB7XG5cdFx0aWYgKCF0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gc2hvd2luZyA/ICcxJyA6ICcwJztcblx0fVxuXG5cdGNvbnRhaW5zKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgPT09IHRoaXMuY29udGFpbmVyIHx8IGVsZW1lbnQgPT09IHRoaXMub3ZlcmxheTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JEcm9wVGFyZ2V0IGV4dGVuZHMgVGhlbWFibGUge1xuXG5cdHByaXZhdGUgX292ZXJsYXk/OiBEcm9wT3ZlcmxheTtcblxuXHRwcml2YXRlIGNvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRFZGl0b3JJZGVudGlmaWVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBncm91cHNWaWV3OiBJRWRpdG9yR3JvdXBzVmlldyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSUVkaXRvckRyb3BUYXJnZXREZWxlZ2F0ZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgb3ZlcmxheSgpOiBEcm9wT3ZlcmxheSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX292ZXJsYXkgJiYgIXRoaXMuX292ZXJsYXkuZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9vdmVybGF5O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLkRSQUdfRU5URVIsIGUgPT4gdGhpcy5vbkRyYWdFbnRlcihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLkRSQUdfTEVBVkUsICgpID0+IHRoaXMub25EcmFnTGVhdmUoKSkpO1xuXHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIFt0aGlzLmNvbnRhaW5lciwgZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKV0pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXQsIEV2ZW50VHlwZS5EUkFHX0VORCwgKCkgPT4gdGhpcy5vbkRyYWdFbmQoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EcmFnRW50ZXIoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGlmIChpc0Ryb3BJbnRvRWRpdG9yRW5hYmxlZEdsb2JhbGx5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpICYmIGlzRHJhZ0ludG9FZGl0b3JFdmVudChldmVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvdW50ZXIrKztcblxuXHRcdC8vIFZhbGlkYXRlIHRyYW5zZmVyXG5cdFx0aWYgKFxuXHRcdFx0IXRoaXMuZWRpdG9yVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpICYmXG5cdFx0XHQhdGhpcy5ncm91cFRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpICYmXG5cdFx0XHRldmVudC5kYXRhVHJhbnNmZXJcblx0XHQpIHtcblx0XHRcdGNvbnN0IGRuZENvbnRyaWJ1dGlvbnMgPSBSZWdpc3RyeS5hczxJRHJhZ0FuZERyb3BDb250cmlidXRpb25SZWdpc3RyeT4oRHJhZ0FuZERyb3BFeHRlbnNpb25zLkRyYWdBbmREcm9wQ29udHJpYnV0aW9uKS5nZXRBbGwoKTtcblx0XHRcdGNvbnN0IGRuZENvbnRyaWJ1dGlvbktleXMgPSBBcnJheS5mcm9tKGRuZENvbnRyaWJ1dGlvbnMpLm1hcChlID0+IGUuZGF0YUZvcm1hdEtleSk7XG5cdFx0XHRpZiAoIWNvbnRhaW5zRHJhZ1R5cGUoZXZlbnQsIERhdGFUcmFuc2ZlcnMuRklMRVMsIENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTLCBEYXRhVHJhbnNmZXJzLlJFU09VUkNFUywgQ29kZURhdGFUcmFuc2ZlcnMuRURJVE9SUywgLi4uZG5kQ29udHJpYnV0aW9uS2V5cykpIHsgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTc4OVxuXHRcdFx0XHRldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdub25lJztcblx0XHRcdFx0cmV0dXJuOyAvLyB1bnN1cHBvcnRlZCB0cmFuc2ZlclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGRyb3BwaW5nIGludG8gZ3JvdXAgaXMgYWxsb3dlZFxuXHRcdGlmICghdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmFsbG93RHJvcEludG9Hcm91cCkge1xuXHRcdFx0aWYgKGV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdub25lJztcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTaWduYWwgRE5EIHN0YXJ0XG5cdFx0dGhpcy51cGRhdGVDb250YWluZXIodHJ1ZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0aWYgKHRhcmdldCkge1xuXG5cdFx0XHQvLyBTb21laG93IHdlIG1hbmFnZWQgdG8gbW92ZSB0aGUgbW91c2UgcXVpY2tseSBvdXQgb2YgdGhlIGN1cnJlbnQgb3ZlcmxheSwgc28gZGVzdHJveSBpdFxuXHRcdFx0aWYgKHRoaXMub3ZlcmxheSAmJiAhdGhpcy5vdmVybGF5LmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlT3ZlcmxheSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDcmVhdGUgb3ZlcmxheSBvdmVyIHRhcmdldFxuXHRcdFx0aWYgKCF0aGlzLm92ZXJsYXkpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0R3JvdXBWaWV3ID0gdGhpcy5maW5kVGFyZ2V0R3JvdXBWaWV3KHRhcmdldCk7XG5cdFx0XHRcdGlmICh0YXJnZXRHcm91cFZpZXcpIHtcblx0XHRcdFx0XHR0aGlzLl9vdmVybGF5ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wT3ZlcmxheSwgdGFyZ2V0R3JvdXBWaWV3KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EcmFnTGVhdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5jb3VudGVyLS07XG5cblx0XHRpZiAodGhpcy5jb3VudGVyID09PSAwKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcihmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5jb3VudGVyID0gMDtcblxuXHRcdHRoaXMudXBkYXRlQ29udGFpbmVyKGZhbHNlKTtcblx0XHR0aGlzLmRpc3Bvc2VPdmVybGF5KCk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRUYXJnZXRHcm91cFZpZXcoY2hpbGQ6IEhUTUxFbGVtZW50KTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzIGFzIElFZGl0b3JHcm91cFZpZXdbXTtcblxuXHRcdHJldHVybiBncm91cHMuZmluZChncm91cFZpZXcgPT4gaXNBbmNlc3RvcihjaGlsZCwgZ3JvdXBWaWV3LmVsZW1lbnQpIHx8IHRoaXMuZGVsZWdhdGUuY29udGFpbnNHcm91cD8uKGdyb3VwVmlldykpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb250YWluZXIoaXNEcmFnZ2VkT3ZlcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2RyYWdnZWQtb3ZlcicsIGlzRHJhZ2dlZE92ZXIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLmRpc3Bvc2VPdmVybGF5KCk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VPdmVybGF5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm92ZXJsYXkpIHtcblx0XHRcdHRoaXMub3ZlcmxheS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdH1c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
