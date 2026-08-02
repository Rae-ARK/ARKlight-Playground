import { alert } from "../../base/browser/ui/aria/aria.js";
import { mainWindow } from "../../base/browser/window.js";
import { Emitter } from "../../base/common/event.js";
import { localize } from "../../nls.js";
import { Parts } from "../../workbench/services/layout/browser/layoutService.js";
import { DockedEditorInput } from "../common/dockedEditorInput.js";
import { DockedAuxiliaryBarController } from "./dockedAuxiliaryBarController.js";
import { EDITOR_PART_MINIMUM_WIDTH, SIDE_PANE_WIDTH_RATIO } from "./parts/editorPartSizing.js";
import { Workbench } from "./workbench.js";
class DockedEditorSizeMemento {
  /** Drop the sidebar-collapse snapshots, e.g. once the node returns to the detail width. */
  clearSidebarGrowSnapshots() {
    this.editorSizeGrownForSidebarHide = void 0;
    this.detailWidthGrownForSidebarHide = void 0;
  }
}
const _SinglePaneWorkbench = class _SinglePaneWorkbench extends Workbench {
  constructor() {
    super(...arguments);
    this._dockedAuxiliaryBarWidth = DockedAuxiliaryBarController.DEFAULT_WIDTH;
    this._syncingEditorVisibility = false;
    this._detailHiddenForEditorResize = false;
    this._memento = new DockedEditorSizeMemento();
    this._onDidRevealSidePane = this._register(new Emitter());
    this.onDidRevealSidePane = this._onDidRevealSidePane.event;
  }
  get isSinglePaneLayoutEnabled() {
    return true;
  }
  isEditorPaneVisible() {
    return this.workbenchGrid ? this.workbenchGrid.isViewVisible(this.editorPartView) : super.isEditorPaneVisible();
  }
  toggleSecondarySideBar() {
    this.toggleEditorPane();
  }
  isSecondarySideBarVisible() {
    return this.isVisible(Parts.EDITOR_PART, mainWindow);
  }
  toggleEditorPane() {
    const visible = !this.isSecondarySideBarVisible();
    const editorHadFocus = !visible && this.hasFocus(Parts.EDITOR_PART);
    this.setEditorHidden(
      !visible,
      /* explicit */
      true
    );
    if (editorHadFocus) {
      this.focusPart(this.isVisible(Parts.AUXILIARYBAR_PART) ? Parts.AUXILIARYBAR_PART : Parts.SESSIONS_PART);
    }
    alert(visible ? localize("editorPaneVisible", "Editor pane shown") : localize("editorPaneHidden", "Editor pane hidden"));
  }
  _onSidePaneRevealed() {
    this._onDidRevealSidePane.fire();
  }
  /**
   * A docked-detail editor (Changes/Files) renders its content in the docked
   * detail panel. While that panel is open and the editor area is closed,
   * re-activating such an editor (closing a neighbouring tab, or clicking the
   * tab) must not reveal the editor area. When the detail panel is closed the
   * base reveal still runs so the content becomes visible.
   */
  revealEditorOnOpen(e) {
    if (e.editor instanceof DockedEditorInput && this.partVisibility.auxiliaryBar && !this.partVisibility.editor) {
      return;
    }
    super.revealEditorOnOpen(e);
  }
  getDockedAuxiliaryBarWidth() {
    return this._dockedAuxiliaryBarWidth;
  }
  setDockedAuxiliaryBarWidth(width) {
    this._dockedAuxiliaryBarWidth = width;
  }
  /** Re-layouts the docked auxiliary bar, which the editor part owns. */
  _layoutDockedAuxBar() {
    this.editorGroupService.mainPart.layoutDockedAuxiliaryBar();
  }
  _applyLayoutContainerClass() {
    this.mainContainer.classList.toggle("dock-detail-panel", true);
  }
  _auxiliaryBarLayoutWidth() {
    return this._dockedAuxiliaryBarWidth;
  }
  _auxiliaryBarViewSize() {
    return { width: this._dockedAuxiliaryBarWidth, height: this._editorPartContainer?.clientHeight ?? 0 };
  }
  _setAuxiliaryBarViewSize(size) {
    this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, size.width);
    this._layoutDockedAuxBar();
  }
  _resizeAuxiliaryBarBy(deltaWidth, _deltaHeight) {
    this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, this._dockedAuxiliaryBarWidth + deltaWidth);
    this._layoutDockedAuxBar();
  }
  _restoreAuxiliaryBarWidth(width) {
    this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, width);
  }
  _persistedEditorWidth(editorGridWidth) {
    if (typeof editorGridWidth !== "number") {
      return editorGridWidth;
    }
    const dockedDetailWidth = this.partVisibility.auxiliaryBar ? this._dockedAuxiliaryBarWidth : 0;
    return Math.max(0, editorGridWidth - dockedDetailWidth);
  }
  _persistedGridViewSize(view, dimension, visible) {
    if (view === this.auxiliaryBarPartView) {
      return this._memento.detailWidthGrownForSidebarHide ?? this._dockedAuxiliaryBarWidth;
    }
    return super._persistedGridViewSize(view, dimension, visible);
  }
  _defaultSideBarSize(policySideBarSize) {
    return Math.min(policySideBarSize, 280);
  }
  _editorNodeSize(effectiveEditorWidth, effectiveAuxBarWidth) {
    return effectiveEditorWidth + effectiveAuxBarWidth;
  }
  _editorNodeVisible(editorVisible, auxBarVisible) {
    return editorVisible || auxBarVisible;
  }
  _topRightSectionChildren(sessionsNode, editorNode, _auxiliaryBarNode, customViewGridNode) {
    return [sessionsNode, editorNode, customViewGridNode];
  }
  _layoutSidePane() {
    this._layoutDockedAuxBar();
  }
  _applyEditorAreaVisibility() {
    this.workbenchGrid.setViewVisible(this.editorPartView, this._editorNodeShouldBeVisible());
    this._layoutDockedAuxBar();
  }
  _onGridDidChange() {
    this._syncEditorVisibility(this.workbenchGrid.getViewSize(this.editorPartView).width);
  }
  _onEditorNodeResized(nodeWidth) {
    this._syncEditorVisibility(nodeWidth);
  }
  _fireDidChangePartVisibility(partId, visible, source) {
    if (partId === Parts.AUXILIARYBAR_PART && source !== "resize") {
      this._detailHiddenForEditorResize = false;
    }
    super._fireDidChangePartVisibility(partId, visible, source);
  }
  _syncEditorVisibility(nodeWidth) {
    if (this._syncingEditorVisibility) {
      return;
    }
    if (this._isEditorPartAutoVisibilitySuppressed) {
      return;
    }
    this._syncingEditorVisibility = true;
    try {
      const detailFitsBesideEditor = nodeWidth >= this._dockedAuxiliaryBarWidth + EDITOR_PART_MINIMUM_WIDTH;
      if (this.partVisibility.editor && this.partVisibility.auxiliaryBar && !detailFitsBesideEditor) {
        this._detailHiddenForEditorResize = true;
        this.setAuxiliaryBarHiddenForResize(true);
        return;
      }
      const detailShowThreshold = this._dockedAuxiliaryBarWidth + EDITOR_PART_MINIMUM_WIDTH + _SinglePaneWorkbench._DETAIL_AUTO_SHOW_MARGIN;
      if (this.partVisibility.editor && !this.partVisibility.auxiliaryBar && this._detailHiddenForEditorResize && nodeWidth >= detailShowThreshold) {
        this.setAuxiliaryBarHiddenForResize(false);
        this._detailHiddenForEditorResize = false;
        return;
      }
      const editorContentVisible = nodeWidth > this._dockedAuxiliaryBarWidth + _SinglePaneWorkbench._EDITOR_CONTENT_VISIBLE_THRESHOLD;
      if (this.partVisibility.editor && !editorContentVisible && this.partVisibility.auxiliaryBar) {
        this.partVisibility.editor = false;
        this._setMainEditorAreaHidden(true);
        this._editorRevealedExplicitly = false;
        this._memento.clearSidebarGrowSnapshots();
        this._layoutDockedAuxBar();
        this._fireDidChangePartVisibility(Parts.EDITOR_PART, false);
        this._savePartVisibility();
        return;
      }
    } finally {
      this._syncingEditorVisibility = false;
    }
  }
  _runWithEditorResizeSyncSuspended(fn) {
    this._syncingEditorVisibility = true;
    try {
      fn();
    } finally {
      this._syncingEditorVisibility = false;
    }
  }
  _applyEditorVisibility(hidden) {
    if (hidden) {
      const contentWidth = this._persistedEditorWidth(this.workbenchGrid.getViewSize(this.editorPartView).width);
      if (contentWidth !== void 0 && contentWidth >= EDITOR_PART_MINIMUM_WIDTH) {
        this._savedPartSizes = { ...this._savedPartSizes, editor: contentWidth };
      }
    }
    const dockedEditorSizeBeforeHide = this._memento.dockedEditorSizeBeforeHide;
    const savedEditorWidth = this._savedPartSizes.editor;
    const canRestoreSavedWidth = savedEditorWidth !== void 0 && savedEditorWidth >= EDITOR_PART_MINIMUM_WIDTH;
    const shouldRestoreDockedEditorSize = !hidden && !!dockedEditorSizeBeforeHide;
    const shouldRestoreSavedWidth = !hidden && !shouldRestoreDockedEditorSize && canRestoreSavedWidth;
    const shouldApplyEvenSplit = !hidden && !shouldRestoreDockedEditorSize && !shouldRestoreSavedWidth;
    this.workbenchGrid.setViewVisible(this.editorPartView, this._editorNodeShouldBeVisible());
    if (hidden) {
      if (this.partVisibility.auxiliaryBar) {
        this._memento.dockedEditorSizeBeforeHide = this.workbenchGrid.getViewSize(this.editorPartView);
        this.workbenchGrid.resizeView(this.editorPartView, {
          width: this._dockedAuxiliaryBarWidth,
          height: this._memento.dockedEditorSizeBeforeHide.height
        });
        this._memento.clearSidebarGrowSnapshots();
      } else {
        this._memento.dockedEditorSizeBeforeHide = void 0;
        this._memento.clearSidebarGrowSnapshots();
      }
    } else if (dockedEditorSizeBeforeHide) {
      this.workbenchGrid.resizeView(this.editorPartView, dockedEditorSizeBeforeHide);
      this._memento.dockedEditorSizeBeforeHide = void 0;
    } else if (shouldRestoreSavedWidth) {
      const height = this.workbenchGrid.getViewSize(this.editorPartView).height;
      const detailWidth = this.partVisibility.auxiliaryBar ? this._dockedAuxiliaryBarWidth : 0;
      this.workbenchGrid.resizeView(this.editorPartView, { width: savedEditorWidth + detailWidth, height });
    }
    if (shouldApplyEvenSplit) {
      this._hasAppliedInitialEditorSplit = true;
      this._applyEditorSplitSize(this.workbenchGrid.width);
    }
    this._layoutDockedAuxBar();
    this._fireDidChangePartVisibility(Parts.EDITOR_PART, !hidden);
    this._notifyContainerDidLayout();
  }
  _applyEditorSplitSize(_mainAreaWidth) {
    const targetEditorWidth = Math.max(EDITOR_PART_MINIMUM_WIDTH, Math.floor(this.workbenchGrid.width * SIDE_PANE_WIDTH_RATIO));
    const currentEditorSize = this.workbenchGrid.getViewSize(this.editorPartView);
    this.workbenchGrid.resizeView(this.editorPartView, {
      width: targetEditorWidth,
      height: currentEditorSize.height
    });
  }
  _onWillHideAuxiliaryBar(hidden) {
    if (hidden && !this.partVisibility.editor && !this._isEditorPartAutoVisibilitySuppressed) {
      this.setEditorHidden(
        false,
        /* explicit */
        true
      );
    }
  }
  /**
   * No-op unless detail-only (editor content hidden): there the shared node is a
   * snap view, so sash-drag collapse/reveal maps onto hiding/showing the auxiliary bar.
   */
  _onEditorPartGridVisibilityChange(visible) {
    if (this.partVisibility.editor) {
      return;
    }
    if (!visible) {
      const suppression = this.suppressEditorPartAutoVisibility();
      try {
        this.setAuxiliaryBarHiddenForResize(true);
      } finally {
        suppression.dispose();
      }
      return;
    }
    this.setAuxiliaryBarHiddenForResize(false);
  }
  _applyAuxiliaryBarVisibility(hidden, source) {
    if (this.workbenchGrid) {
      this.workbenchGrid.setViewVisible(
        this.editorPartView,
        this._editorNodeShouldBeVisible()
      );
      if (!hidden && !this.partVisibility.editor) {
        this._syncingEditorVisibility = true;
        try {
          this.workbenchGrid.resizeView(this.editorPartView, {
            width: this._dockedAuxiliaryBarWidth,
            height: this.workbenchGrid.getViewSize(this.editorPartView).height
          });
        } finally {
          this._syncingEditorVisibility = false;
        }
      }
    }
    this._layoutDockedAuxBar();
    this._fireDidChangePartVisibility(Parts.AUXILIARYBAR_PART, !hidden, source);
    this._notifyContainerDidLayout();
  }
  _shouldOpenAuxiliaryPaneComposite(containerId) {
    return this._isAuxViewContainerActive(containerId);
  }
  _handleAllEditorsClosed() {
    if (!this.partVisibility.editor && !this.partVisibility.auxiliaryBar) {
      return;
    }
    if (this.partVisibility.editor) {
      this.rememberAttachedEditorMaximizedState();
    }
    const suppress = this.suppressEditorPartAutoVisibility();
    try {
      if (this.partVisibility.editor) {
        this.setEditorHidden(true);
      }
      if (this.partVisibility.auxiliaryBar) {
        this.setAuxiliaryBarHidden(true);
      }
    } finally {
      suppress.dispose();
    }
  }
  _prepareSideBarResize(hidden) {
    const shouldResize = this.partVisibility.editor || this.partVisibility.auxiliaryBar;
    const growEditorNode = shouldResize && this.partVisibility.editor;
    const growDetailPanel = shouldResize && !this.partVisibility.editor;
    return {
      freedSideBarWidth: hidden && shouldResize ? this.workbenchGrid.getViewSize(this.sideBarPartView).width : 0,
      editorSizeBeforeSideBarHide: hidden && growEditorNode ? this.workbenchGrid.getViewSize(this.editorPartView) : void 0,
      detailWidthBeforeSideBarHide: hidden && growDetailPanel ? this._dockedAuxiliaryBarWidth : void 0
    };
  }
  _applySideBarResize(hidden, context) {
    const { freedSideBarWidth, editorSizeBeforeSideBarHide, detailWidthBeforeSideBarHide } = context;
    if (editorSizeBeforeSideBarHide) {
      this._memento.editorSizeGrownForSidebarHide = editorSizeBeforeSideBarHide;
      this._resizeEditorAfterSidebarChange({
        width: editorSizeBeforeSideBarHide.width + freedSideBarWidth,
        height: editorSizeBeforeSideBarHide.height
      });
    } else if (detailWidthBeforeSideBarHide !== void 0) {
      this._memento.detailWidthGrownForSidebarHide = detailWidthBeforeSideBarHide;
      this._growDetailAfterSidebarChange(detailWidthBeforeSideBarHide + freedSideBarWidth);
    } else if (!hidden && this._memento.editorSizeGrownForSidebarHide) {
      this._resizeEditorAfterSidebarChange(this._memento.editorSizeGrownForSidebarHide);
      this._memento.editorSizeGrownForSidebarHide = void 0;
    } else if (!hidden && this._memento.detailWidthGrownForSidebarHide !== void 0) {
      this._growDetailAfterSidebarChange(this._memento.detailWidthGrownForSidebarHide);
      this._memento.detailWidthGrownForSidebarHide = void 0;
    } else if (!hidden) {
      this._memento.clearSidebarGrowSnapshots();
    }
  }
  _resizeEditorAfterSidebarChange(size) {
    this._syncingEditorVisibility = true;
    try {
      this.workbenchGrid.resizeView(this.editorPartView, size);
    } finally {
      this._syncingEditorVisibility = false;
    }
    this._layoutDockedAuxBar();
  }
  _growDetailAfterSidebarChange(width) {
    this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, width);
    this._syncingEditorVisibility = true;
    try {
      this.workbenchGrid.resizeView(this.editorPartView, {
        width: this._dockedAuxiliaryBarWidth,
        height: this.workbenchGrid.getViewSize(this.editorPartView).height
      });
    } finally {
      this._syncingEditorVisibility = false;
    }
    this._layoutDockedAuxBar();
  }
};
/** Node width past the detail width at which editor content counts as visible. */
_SinglePaneWorkbench._EDITOR_CONTENT_VISIBLE_THRESHOLD = 4;
_SinglePaneWorkbench._DETAIL_AUTO_SHOW_MARGIN = 100;
let SinglePaneWorkbench = _SinglePaneWorkbench;
export {
  DockedEditorSizeMemento,
  SinglePaneWorkbench
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvc2luZ2xlUGFuZVdvcmtiZW5jaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTZXJpYWxpemFibGVWaWV3LCBJU2VyaWFsaXplZE5vZGUsIElWaWV3U2l6ZSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldpbGxPcGVuRXZlbnQgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBQYXJ0cyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERvY2tlZEVkaXRvcklucHV0IH0gZnJvbSAnLi4vY29tbW9uL2RvY2tlZEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IERvY2tlZEF1eGlsaWFyeUJhckNvbnRyb2xsZXIgfSBmcm9tICcuL2RvY2tlZEF1eGlsaWFyeUJhckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgU2luZ2xlUGFuZU1haW5FZGl0b3JQYXJ0IH0gZnJvbSAnLi9wYXJ0cy9zaW5nbGVQYW5lRWRpdG9yUGFydC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfUEFSVF9NSU5JTVVNX1dJRFRILCBTSURFX1BBTkVfV0lEVEhfUkFUSU8gfSBmcm9tICcuL3BhcnRzL2VkaXRvclBhcnRTaXppbmcuanMnO1xuaW1wb3J0IHsgSVNpZGVCYXJSZXNpemVDb250ZXh0LCBXb3JrYmVuY2ggfSBmcm9tICcuL3dvcmtiZW5jaC5qcyc7XG5cbmludGVyZmFjZSBJRG9ja2VkU2lkZUJhclJlc2l6ZUNvbnRleHQgZXh0ZW5kcyBJU2lkZUJhclJlc2l6ZUNvbnRleHQge1xuXHRyZWFkb25seSBmcmVlZFNpZGVCYXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBlZGl0b3JTaXplQmVmb3JlU2lkZUJhckhpZGU6IElWaWV3U2l6ZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZGV0YWlsV2lkdGhCZWZvcmVTaWRlQmFySGlkZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlbWVtYmVycyBlZGl0b3IvZGV0YWlsIHdpZHRocyBjYXB0dXJlZCBhcm91bmQgdmlzaWJpbGl0eSBhbmQgc2lkZWJhci1jb2xsYXBzZVxuICogdHJhbnNpdGlvbnMgc28gdGhlIGRvY2tlZCBzaWRlIHBhbmUgcmVzdG9yZXMgdGhlIHVzZXIncyBjaG9zZW4gc2l6ZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBEb2NrZWRFZGl0b3JTaXplTWVtZW50byB7XG5cdC8qKiBFZGl0b3Igbm9kZSBzaXplIGNhcHR1cmVkIHdoZW4gXCJIaWRlIEVkaXRvclwiIGlzIHVzZWQgd2l0aCB0aGUgZGV0YWlsIHN0aWxsIHZpc2libGUuICovXG5cdGRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlOiBJVmlld1NpemUgfCB1bmRlZmluZWQ7XG5cdC8qKiBFZGl0b3Igbm9kZSBzaXplIGdyb3duIHdoaWxlIHRoZSBzaWRlYmFyIGlzIGNvbGxhcHNlZCAoZWRpdG9yIGNvbnRlbnQgdmlzaWJsZSkuICovXG5cdGVkaXRvclNpemVHcm93bkZvclNpZGViYXJIaWRlOiBJVmlld1NpemUgfCB1bmRlZmluZWQ7XG5cdC8qKiBEZXRhaWwtcGFuZWwgd2lkdGggZ3Jvd24gd2hpbGUgdGhlIHNpZGViYXIgaXMgY29sbGFwc2VkIChlZGl0b3IgY29udGVudCBoaWRkZW4pLiAqL1xuXHRkZXRhaWxXaWR0aEdyb3duRm9yU2lkZWJhckhpZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHQvKiogRHJvcCB0aGUgc2lkZWJhci1jb2xsYXBzZSBzbmFwc2hvdHMsIGUuZy4gb25jZSB0aGUgbm9kZSByZXR1cm5zIHRvIHRoZSBkZXRhaWwgd2lkdGguICovXG5cdGNsZWFyU2lkZWJhckdyb3dTbmFwc2hvdHMoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFNpbmdsZS1wYW5lIHdvcmtiZW5jaDogdGhlIGF1eGlsaWFyeSBiYXIgaXMgZG9ja2VkIGluc2lkZSB0aGUgZWRpdG9yIHBhcnQgKGJlbG93XG4gKiBhIHNoYXJlZCB0YWIgYmFyKSByYXRoZXIgdGhhbiBiZWluZyBpdHMgb3duIGdyaWQgY29sdW1uLiBUaGUgZWRpdG9yIHBhcnRcbiAqICh7QGxpbmsgU2luZ2xlUGFuZU1haW5FZGl0b3JQYXJ0fSkgb3ducyB0aGUgYXV4aWxpYXJ5IGJhciBhbmQgaXRzIGRvY2tlZFxuICogY29udHJvbGxlcjsgdGhpcyB3b3JrYmVuY2ggb3ducyB0aGUgZG9ja2VkIHdpZHRoLCB0aGUgcmV2ZWFsLXN5bmMsIGFuZCB0aGVcbiAqIGRvY2tlZCBzaXplIGJvb2trZWVwaW5nLlxuICovXG5leHBvcnQgY2xhc3MgU2luZ2xlUGFuZVdvcmtiZW5jaCBleHRlbmRzIFdvcmtiZW5jaCB7XG5cblx0LyoqIE5vZGUgd2lkdGggcGFzdCB0aGUgZGV0YWlsIHdpZHRoIGF0IHdoaWNoIGVkaXRvciBjb250ZW50IGNvdW50cyBhcyB2aXNpYmxlLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRURJVE9SX0NPTlRFTlRfVklTSUJMRV9USFJFU0hPTEQgPSA0O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfREVUQUlMX0FVVE9fU0hPV19NQVJHSU4gPSAxMDA7XG5cblx0cHJpdmF0ZSBfZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGggPSBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyLkRFRkFVTFRfV0lEVEg7XG5cdHByaXZhdGUgX3N5bmNpbmdFZGl0b3JWaXNpYmlsaXR5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2RldGFpbEhpZGRlbkZvckVkaXRvclJlc2l6ZSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZW1lbnRvID0gbmV3IERvY2tlZEVkaXRvclNpemVNZW1lbnRvKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXZlYWxTaWRlUGFuZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJldmVhbFNpZGVQYW5lOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmV2ZWFsU2lkZVBhbmUuZXZlbnQ7XG5cblx0b3ZlcnJpZGUgZ2V0IGlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBpc0VkaXRvclBhbmVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWRcblx0XHRcdD8gdGhpcy53b3JrYmVuY2hHcmlkLmlzVmlld1Zpc2libGUodGhpcy5lZGl0b3JQYXJ0Vmlldylcblx0XHRcdDogc3VwZXIuaXNFZGl0b3JQYW5lVmlzaWJsZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9nZ2xlU2Vjb25kYXJ5U2lkZUJhcigpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZUVkaXRvclBhbmUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzU2Vjb25kYXJ5U2lkZUJhclZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KTtcblx0fVxuXG5cdHRvZ2dsZUVkaXRvclBhbmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9ICF0aGlzLmlzU2Vjb25kYXJ5U2lkZUJhclZpc2libGUoKTtcblx0XHRjb25zdCBlZGl0b3JIYWRGb2N1cyA9ICF2aXNpYmxlICYmIHRoaXMuaGFzRm9jdXMoUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKCF2aXNpYmxlLCAvKiBleHBsaWNpdCAqLyB0cnVlKTtcblx0XHRpZiAoZWRpdG9ySGFkRm9jdXMpIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KHRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIDogUGFydHMuU0VTU0lPTlNfUEFSVCk7XG5cdFx0fVxuXHRcdGFsZXJ0KHZpc2libGVcblx0XHRcdD8gbG9jYWxpemUoJ2VkaXRvclBhbmVWaXNpYmxlJywgXCJFZGl0b3IgcGFuZSBzaG93blwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZWRpdG9yUGFuZUhpZGRlbicsIFwiRWRpdG9yIHBhbmUgaGlkZGVuXCIpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25TaWRlUGFuZVJldmVhbGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkUmV2ZWFsU2lkZVBhbmUuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZG9ja2VkLWRldGFpbCBlZGl0b3IgKENoYW5nZXMvRmlsZXMpIHJlbmRlcnMgaXRzIGNvbnRlbnQgaW4gdGhlIGRvY2tlZFxuXHQgKiBkZXRhaWwgcGFuZWwuIFdoaWxlIHRoYXQgcGFuZWwgaXMgb3BlbiBhbmQgdGhlIGVkaXRvciBhcmVhIGlzIGNsb3NlZCxcblx0ICogcmUtYWN0aXZhdGluZyBzdWNoIGFuIGVkaXRvciAoY2xvc2luZyBhIG5laWdoYm91cmluZyB0YWIsIG9yIGNsaWNraW5nIHRoZVxuXHQgKiB0YWIpIG11c3Qgbm90IHJldmVhbCB0aGUgZWRpdG9yIGFyZWEuIFdoZW4gdGhlIGRldGFpbCBwYW5lbCBpcyBjbG9zZWQgdGhlXG5cdCAqIGJhc2UgcmV2ZWFsIHN0aWxsIHJ1bnMgc28gdGhlIGNvbnRlbnQgYmVjb21lcyB2aXNpYmxlLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJldmVhbEVkaXRvck9uT3BlbihlOiBJRWRpdG9yV2lsbE9wZW5FdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmVkaXRvciBpbnN0YW5jZW9mIERvY2tlZEVkaXRvcklucHV0ICYmIHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyICYmICF0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdXBlci5yZXZlYWxFZGl0b3JPbk9wZW4oZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldERvY2tlZEF1eGlsaWFyeUJhcldpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCA9IHdpZHRoO1xuXHR9XG5cblx0LyoqIFJlLWxheW91dHMgdGhlIGRvY2tlZCBhdXhpbGlhcnkgYmFyLCB3aGljaCB0aGUgZWRpdG9yIHBhcnQgb3ducy4gKi9cblx0cHJpdmF0ZSBfbGF5b3V0RG9ja2VkQXV4QmFyKCk6IHZvaWQge1xuXHRcdCh0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydCBhcyBTaW5nbGVQYW5lTWFpbkVkaXRvclBhcnQpLmxheW91dERvY2tlZEF1eGlsaWFyeUJhcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseUxheW91dENvbnRhaW5lckNsYXNzKCk6IHZvaWQge1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkb2NrLWRldGFpbC1wYW5lbCcsIHRydWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hdXhpbGlhcnlCYXJMYXlvdXRXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYXV4aWxpYXJ5QmFyVmlld1NpemUoKTogSVZpZXdTaXplIHtcblx0XHRyZXR1cm4geyB3aWR0aDogdGhpcy5fZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGgsIGhlaWdodDogdGhpcy5fZWRpdG9yUGFydENvbnRhaW5lcj8uY2xpZW50SGVpZ2h0ID8/IDAgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc2V0QXV4aWxpYXJ5QmFyVmlld1NpemUoc2l6ZTogSVZpZXdTaXplKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGggPSBNYXRoLm1heChEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyLk1JTl9XSURUSCwgc2l6ZS53aWR0aCk7XG5cdFx0dGhpcy5fbGF5b3V0RG9ja2VkQXV4QmFyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3Jlc2l6ZUF1eGlsaWFyeUJhckJ5KGRlbHRhV2lkdGg6IG51bWJlciwgX2RlbHRhSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCA9IE1hdGgubWF4KERvY2tlZEF1eGlsaWFyeUJhckNvbnRyb2xsZXIuTUlOX1dJRFRILCB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCArIGRlbHRhV2lkdGgpO1xuXHRcdHRoaXMuX2xheW91dERvY2tlZEF1eEJhcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZXN0b3JlQXV4aWxpYXJ5QmFyV2lkdGgod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoID0gTWF0aC5tYXgoRG9ja2VkQXV4aWxpYXJ5QmFyQ29udHJvbGxlci5NSU5fV0lEVEgsIHdpZHRoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcGVyc2lzdGVkRWRpdG9yV2lkdGgoZWRpdG9yR3JpZFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgZWRpdG9yR3JpZFdpZHRoICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIGVkaXRvckdyaWRXaWR0aDtcblx0XHR9XG5cdFx0Ly8gVGhlIGRvY2tlZCBkZXRhaWwgcGFuZWwgbGl2ZXMgaW5zaWRlIHRoZSBlZGl0b3IgZ3JpZCBub2RlIG9ubHkgd2hpbGUgdGhlXG5cdFx0Ly8gZGV0YWlsIChhdXhpbGlhcnkgYmFyKSBpcyB2aXNpYmxlLiBTdWJ0cmFjdCBpdCBvbmx5IGluIHRoYXQgY2FzZSBzbyB0aGVcblx0XHQvLyBwZXJzaXN0ZWQgdmFsdWUgaXMgdGhlIHB1cmUgZWRpdG9yLWNvbnRlbnQgd2lkdGggXHUyMDE0IG1pcnJvcmluZyB0aGUgZ3JpZFxuXHRcdC8vIGRlc2NyaXB0b3IsIHdoaWNoIGFkZHMgdGhlIGRldGFpbCB3aWR0aCBiYWNrIG9ubHkgd2hlbiB0aGUgZGV0YWlsIGlzXG5cdFx0Ly8gdmlzaWJsZS4gU3VidHJhY3RpbmcgaXQgdW5jb25kaXRpb25hbGx5IHdvdWxkIHNocmluayBhbiBFZGl0b3Itb25seVxuXHRcdC8vIHNlc3Npb24ncyBzaWRlIHBhbmUgYnkgdGhlIGRldGFpbCB3aWR0aCBvbiBldmVyeSByZWxvYWQgKGNvbXBvdW5kaW5nKS5cblx0XHRjb25zdCBkb2NrZWREZXRhaWxXaWR0aCA9IHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID8gdGhpcy5fZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGggOiAwO1xuXHRcdHJldHVybiBNYXRoLm1heCgwLCBlZGl0b3JHcmlkV2lkdGggLSBkb2NrZWREZXRhaWxXaWR0aCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3BlcnNpc3RlZEdyaWRWaWV3U2l6ZSh2aWV3OiBJU2VyaWFsaXphYmxlVmlldywgZGltZW5zaW9uOiAnd2lkdGgnIHwgJ2hlaWdodCcsIHZpc2libGU6IGJvb2xlYW4pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRoZSBkb2NrZWQgYXV4aWxpYXJ5IGJhciBpcyBub3QgYSBncmlkIHZpZXcgKGl0IGxpdmVzIGluc2lkZSB0aGUgZWRpdG9yXG5cdFx0Ly8gbm9kZSksIHNvIGl0cyB3aWR0aCBjb21lcyBmcm9tIHRoZSBkb2NrZWQgbGF5b3V0IHN0YXRlLCBub3QgdGhlIGdyaWQuXG5cdFx0aWYgKHZpZXcgPT09IHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSA/PyB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLl9wZXJzaXN0ZWRHcmlkVmlld1NpemUodmlldywgZGltZW5zaW9uLCB2aXNpYmxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZGVmYXVsdFNpZGVCYXJTaXplKHBvbGljeVNpZGVCYXJTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLm1pbihwb2xpY3lTaWRlQmFyU2l6ZSwgMjgwKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZWRpdG9yTm9kZVNpemUoZWZmZWN0aXZlRWRpdG9yV2lkdGg6IG51bWJlciwgZWZmZWN0aXZlQXV4QmFyV2lkdGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Ly8gVGhlIGVkaXRvciBwYXJ0IHNwYW5zIHRoZSBlZGl0b3IgKyBhdXhpbGlhcnkgYmFyIHdpZHRoICh0aGUgYXV4IGJhciBpc1xuXHRcdC8vIGRvY2tlZCBpbnNpZGUgaXQsIG5vdCBhIGdyaWQgY29sdW1uKSBzbyB0aGUgZWRpdG9yIHRhYiBiYXIgc3BhbnMgdGhlIGZ1bGwgd2lkdGguXG5cdFx0cmV0dXJuIGVmZmVjdGl2ZUVkaXRvcldpZHRoICsgZWZmZWN0aXZlQXV4QmFyV2lkdGg7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2VkaXRvck5vZGVWaXNpYmxlKGVkaXRvclZpc2libGU6IGJvb2xlYW4sIGF1eEJhclZpc2libGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWRpdG9yVmlzaWJsZSB8fCBhdXhCYXJWaXNpYmxlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF90b3BSaWdodFNlY3Rpb25DaGlsZHJlbihzZXNzaW9uc05vZGU6IElTZXJpYWxpemVkTm9kZSwgZWRpdG9yTm9kZTogSVNlcmlhbGl6ZWROb2RlLCBfYXV4aWxpYXJ5QmFyTm9kZTogSVNlcmlhbGl6ZWROb2RlLCBjdXN0b21WaWV3R3JpZE5vZGU6IElTZXJpYWxpemVkTm9kZSk6IElTZXJpYWxpemVkTm9kZVtdIHtcblx0XHQvLyBUaGUgYXV4aWxpYXJ5IGJhciBpcyBpbnNpZGUgdGhlIGVkaXRvciBwYXJ0IGFuZCBvbWl0dGVkIGZyb20gdGhlIGdyaWQuXG5cdFx0cmV0dXJuIFtzZXNzaW9uc05vZGUsIGVkaXRvck5vZGUsIGN1c3RvbVZpZXdHcmlkTm9kZV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2xheW91dFNpZGVQYW5lKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xheW91dERvY2tlZEF1eEJhcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseUVkaXRvckFyZWFWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdC8vIFRoZSBhdXhpbGlhcnkgYmFyIGlzIGRvY2tlZCBpbnNpZGUgdGhlIGVkaXRvciBub2RlIHJhdGhlciB0aGFuIGJlaW5nIGFcblx0XHQvLyBncmlkIHZpZXcgb2YgaXRzIG93biwgc28gdGhlIG5vZGUgY292ZXJzIGJvdGguXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuZWRpdG9yUGFydFZpZXcsIHRoaXMuX2VkaXRvck5vZGVTaG91bGRCZVZpc2libGUoKSk7XG5cdFx0dGhpcy5fbGF5b3V0RG9ja2VkQXV4QmFyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uR3JpZERpZENoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zeW5jRWRpdG9yVmlzaWJpbGl0eSh0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5lZGl0b3JQYXJ0Vmlldykud2lkdGgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbkVkaXRvck5vZGVSZXNpemVkKG5vZGVXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fc3luY0VkaXRvclZpc2liaWxpdHkobm9kZVdpZHRoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlyZURpZENoYW5nZVBhcnRWaXNpYmlsaXR5KHBhcnRJZDogUGFydHMsIHZpc2libGU6IGJvb2xlYW4sIHNvdXJjZT86ICdyZXNpemUnKTogdm9pZCB7XG5cdFx0aWYgKHBhcnRJZCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgc291cmNlICE9PSAncmVzaXplJykge1xuXHRcdFx0dGhpcy5fZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplID0gZmFsc2U7XG5cdFx0fVxuXHRcdHN1cGVyLl9maXJlRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkocGFydElkLCB2aXNpYmxlLCBzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY0VkaXRvclZpc2liaWxpdHkobm9kZVdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3luY2luZ0VkaXRvclZpc2liaWxpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQSBzZXNzaW9uLXN3aXRjaCAvIHJlbG9hZCBsYXlvdXQgcmVzdG9yZSBob2xkcyBgc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlgXG5cdFx0Ly8gd2hpbGUgaXQgYXBwbGllcyB0aGUgd29ya2luZyBzZXQsIHdoaWNoIGNhbiB3aWRlbiB0aGUgZG9ja2VkIG5vZGUgYmVmb3JlIHRoZVxuXHRcdC8vIGNvbnRyb2xsZXIgaGFzIHNldCB0aGUgdGFyZ2V0IGVkaXRvci1wYXJ0IHZpc2liaWxpdHkuIFRoZSB3aWR0aC1iYXNlZCBzeW5jIG11c3Rcblx0XHQvLyBub3QgcmFjZSB0aGF0OiByZXZlYWxpbmcgKG9yIGhpZGluZykgdGhlIGVkaXRvciBoZXJlIGZyb20gdGhlIHJlc3RvcmVkIGdlb21ldHJ5XG5cdFx0Ly8gZmxpY2tlcnMgdGhlIGVkaXRvciBvcGVuIGZvciBhIERldGFpbC1vbmx5IHNlc3Npb24gKGFuZCBjYW4gcGVyc2lzdCBpdCBvbiByZWxvYWQpLlxuXHRcdC8vIE9ubHkgdGhlIHVzZXIgZHJhZ2dpbmcgdGhlIHNhc2ggKHVuc3VwcHJlc3NlZCkgc2hvdWxkIGRyaXZlIHdpZHRoLWJhc2VkIHZpc2liaWxpdHkuXG5cdFx0aWYgKHRoaXMuX2lzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N5bmNpbmdFZGl0b3JWaXNpYmlsaXR5ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGV0YWlsRml0c0Jlc2lkZUVkaXRvciA9IG5vZGVXaWR0aCA+PSB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCArIEVESVRPUl9QQVJUX01JTklNVU1fV0lEVEg7XG5cdFx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgJiYgdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIgJiYgIWRldGFpbEZpdHNCZXNpZGVFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW5Gb3JSZXNpemUodHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGV0YWlsU2hvd1RocmVzaG9sZCA9IHRoaXMuX2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoICsgRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSCArIFNpbmdsZVBhbmVXb3JrYmVuY2guX0RFVEFJTF9BVVRPX1NIT1dfTUFSR0lOO1xuXHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yICYmICF0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciAmJiB0aGlzLl9kZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemUgJiYgbm9kZVdpZHRoID49IGRldGFpbFNob3dUaHJlc2hvbGQpIHtcblx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW5Gb3JSZXNpemUoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3JDb250ZW50VmlzaWJsZSA9IG5vZGVXaWR0aCA+IHRoaXMuX2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoICsgU2luZ2xlUGFuZVdvcmtiZW5jaC5fRURJVE9SX0NPTlRFTlRfVklTSUJMRV9USFJFU0hPTEQ7XG5cblx0XHRcdC8vIEhpZGU6IGVkaXRvciBjb250ZW50IGlzIHZpc2libGUgYW5kIHRoZSBub2RlIGlzIHNxdWVlemVkIGRvd24gdG8gdGhlIGRldGFpbFxuXHRcdFx0Ly8gd2lkdGguIE9ubHkgaGlkZSB3aGVuIHRoZSBkZXRhaWwgaXMgdmlzaWJsZSwgc28gd2UgZG9uJ3QgaGlkZSB3aGVuIGJvdGggcGFydHNcblx0XHRcdC8vIGFyZSBjbG9zZWQuXG5cdFx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgJiYgIWVkaXRvckNvbnRlbnRWaXNpYmxlICYmIHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3NldE1haW5FZGl0b3JBcmVhSGlkZGVuKHRydWUpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fbWVtZW50by5jbGVhclNpZGViYXJHcm93U25hcHNob3RzKCk7XG5cdFx0XHRcdHRoaXMuX2xheW91dERvY2tlZEF1eEJhcigpO1xuXHRcdFx0XHR0aGlzLl9maXJlRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fc2F2ZVBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zeW5jaW5nRWRpdG9yVmlzaWJpbGl0eSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcnVuV2l0aEVkaXRvclJlc2l6ZVN5bmNTdXNwZW5kZWQoZm46ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zeW5jaW5nRWRpdG9yVmlzaWJpbGl0eSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGZuKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3N5bmNpbmdFZGl0b3JWaXNpYmlsaXR5ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseUVkaXRvclZpc2liaWxpdHkoaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gUGFydCBzaXplcyBhcmUgd29ya2JlbmNoLWdsb2JhbCwgc28gaGlkaW5nIHRoZSBzaWRlIHBhbmUgbXVzdCBub3QgZGlzY2FyZCB0aGVcblx0XHQvLyB1c2VyJ3MgY2hvc2VuIGVkaXRvciB3aWR0aC4gQ2FwdHVyZSB0aGUgY3VycmVudCBlZGl0b3IgY29udGVudCB3aWR0aCBiZWZvcmUgdGhlXG5cdFx0Ly8gZ3JpZCBjb2xsYXBzZXMgdGhlIG5vZGUsIHNvIHJldmVhbGluZyBsYXRlciBcdTIwMTQgZS5nLiBzd2l0Y2hpbmcgYmFjayBmcm9tIGEgc2Vzc2lvblxuXHRcdC8vIHRoYXQgY2xvc2VkIHRoZSBwYW5lIFx1MjAxNCByZXN0b3JlcyBpdCBpbnN0ZWFkIG9mIHJlc2V0dGluZyB0byB0aGUgZGVmYXVsdCBzcGxpdC5cblx0XHRpZiAoaGlkZGVuKSB7XG5cdFx0XHRjb25zdCBjb250ZW50V2lkdGggPSB0aGlzLl9wZXJzaXN0ZWRFZGl0b3JXaWR0aCh0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5lZGl0b3JQYXJ0Vmlldykud2lkdGgpO1xuXHRcdFx0aWYgKGNvbnRlbnRXaWR0aCAhPT0gdW5kZWZpbmVkICYmIGNvbnRlbnRXaWR0aCA+PSBFRElUT1JfUEFSVF9NSU5JTVVNX1dJRFRIKSB7XG5cdFx0XHRcdHRoaXMuX3NhdmVkUGFydFNpemVzID0geyAuLi50aGlzLl9zYXZlZFBhcnRTaXplcywgZWRpdG9yOiBjb250ZW50V2lkdGggfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXaGVuIHJldmVhbGluZyB3aXRob3V0IGEgY2FwdHVyZWQgXCJIaWRlIEVkaXRvclwiIHNpemUgdG8gcmVzdG9yZSwgcHJlZmVyIHRoZVxuXHRcdC8vIHJlbWVtYmVyZWQgZ2xvYmFsIGVkaXRvciB3aWR0aCBhbmQgb25seSBmYWxsIGJhY2sgdG8gdGhlIDYwJS1vZi13aW5kb3cgc3BsaXRcblx0XHQvLyB3aGVuIHRoZXJlIGlzIG5vIGtub3duIGdvb2Qgd2lkdGggKGEgZ2VudWluZSBmaXJzdCBvcGVuKS5cblx0XHRjb25zdCBkb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSA9IHRoaXMuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGU7XG5cdFx0Y29uc3Qgc2F2ZWRFZGl0b3JXaWR0aCA9IHRoaXMuX3NhdmVkUGFydFNpemVzLmVkaXRvcjtcblx0XHRjb25zdCBjYW5SZXN0b3JlU2F2ZWRXaWR0aCA9IHNhdmVkRWRpdG9yV2lkdGggIT09IHVuZGVmaW5lZCAmJiBzYXZlZEVkaXRvcldpZHRoID49IEVESVRPUl9QQVJUX01JTklNVU1fV0lEVEg7XG5cdFx0Y29uc3Qgc2hvdWxkUmVzdG9yZURvY2tlZEVkaXRvclNpemUgPSAhaGlkZGVuICYmICEhZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGU7XG5cdFx0Y29uc3Qgc2hvdWxkUmVzdG9yZVNhdmVkV2lkdGggPSAhaGlkZGVuICYmICFzaG91bGRSZXN0b3JlRG9ja2VkRWRpdG9yU2l6ZSAmJiBjYW5SZXN0b3JlU2F2ZWRXaWR0aDtcblx0XHRjb25zdCBzaG91bGRBcHBseUV2ZW5TcGxpdCA9ICFoaWRkZW4gJiYgIXNob3VsZFJlc3RvcmVEb2NrZWRFZGl0b3JTaXplICYmICFzaG91bGRSZXN0b3JlU2F2ZWRXaWR0aDtcblxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmVkaXRvclBhcnRWaWV3LCB0aGlzLl9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKCkpO1xuXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0Ly8gT25seSBcIkhpZGUgRWRpdG9yXCIgKGRldGFpbCBzdGlsbCB2aXNpYmxlKSBrZWVwcyB0aGUgZWRpdG9yIGdyaWQgbm9kZVxuXHRcdFx0Ly8gdmlzaWJsZSwgc28gaXRzIHdpZHRoIGlzIGEgcmVhbCB1c2VyLWNob3NlbiB3aWR0aCB0byByZXN0b3JlIGxhdGVyLlxuXHRcdFx0Ly8gQ2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIGNvbGxhcHNlcyB0aGUgbm9kZSB0byAwcHgsIHNvIHJlc2V0IGluc3RlYWQuXG5cdFx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0dGhpcy5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmVkaXRvclBhcnRWaWV3KTtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCxcblx0XHRcdFx0XHRoZWlnaHQ6IHRoaXMuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUuaGVpZ2h0XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9tZW1lbnRvLmNsZWFyU2lkZWJhckdyb3dTbmFwc2hvdHMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX21lbWVudG8uY2xlYXJTaWRlYmFyR3Jvd1NuYXBzaG90cygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuZWRpdG9yUGFydFZpZXcsIGRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlKTtcblx0XHRcdHRoaXMuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChzaG91bGRSZXN0b3JlU2F2ZWRXaWR0aCkge1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuZWRpdG9yUGFydFZpZXcpLmhlaWdodDtcblx0XHRcdGNvbnN0IGRldGFpbFdpZHRoID0gdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIgPyB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCA6IDA7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmVkaXRvclBhcnRWaWV3LCB7IHdpZHRoOiBzYXZlZEVkaXRvcldpZHRoICsgZGV0YWlsV2lkdGgsIGhlaWdodCB9KTtcblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkQXBwbHlFdmVuU3BsaXQpIHtcblx0XHRcdHRoaXMuX2hhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fYXBwbHlFZGl0b3JTcGxpdFNpemUodGhpcy53b3JrYmVuY2hHcmlkLndpZHRoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXlvdXREb2NrZWRBdXhCYXIoKTtcblx0XHR0aGlzLl9maXJlRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoUGFydHMuRURJVE9SX1BBUlQsICFoaWRkZW4pO1xuXHRcdHRoaXMuX25vdGlmeUNvbnRhaW5lckRpZExheW91dCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseUVkaXRvclNwbGl0U2l6ZShfbWFpbkFyZWFXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gVGhlIHNpbmdsZS1wYW5lIHNpZGUgcGFuZSBvcGVucyB0byBhIGZpeGVkIGZyYWN0aW9uIG9mIHRoZSBmdWxsIHdpbmRvdyB3aWR0aFxuXHRcdC8vIChub3QgYW4gZXZlbiBzcGxpdCBvZiB0aGUgbWFpbiBhcmVhKSwgc28gaXQgYWx3YXlzIHJldmVhbHMgYXQgYSBjb21mb3J0YWJsZSBzaXplLlxuXHRcdGNvbnN0IHRhcmdldEVkaXRvcldpZHRoID0gTWF0aC5tYXgoRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSCwgTWF0aC5mbG9vcih0aGlzLndvcmtiZW5jaEdyaWQud2lkdGggKiBTSURFX1BBTkVfV0lEVEhfUkFUSU8pKTtcblx0XHRjb25zdCBjdXJyZW50RWRpdG9yU2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmVkaXRvclBhcnRWaWV3KTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmVkaXRvclBhcnRWaWV3LCB7XG5cdFx0XHR3aWR0aDogdGFyZ2V0RWRpdG9yV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IGN1cnJlbnRFZGl0b3JTaXplLmhlaWdodFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpbGxIaWRlQXV4aWxpYXJ5QmFyKGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChoaWRkZW4gJiYgIXRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yICYmICF0aGlzLl9pc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzZWQpIHtcblx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKGZhbHNlLCAvKiBleHBsaWNpdCAqLyB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTm8tb3AgdW5sZXNzIGRldGFpbC1vbmx5IChlZGl0b3IgY29udGVudCBoaWRkZW4pOiB0aGVyZSB0aGUgc2hhcmVkIG5vZGUgaXMgYVxuXHQgKiBzbmFwIHZpZXcsIHNvIHNhc2gtZHJhZyBjb2xsYXBzZS9yZXZlYWwgbWFwcyBvbnRvIGhpZGluZy9zaG93aW5nIHRoZSBhdXhpbGlhcnkgYmFyLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbkVkaXRvclBhcnRHcmlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbkZvclJlc2l6ZSh0cnVlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN1cHByZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW5Gb3JSZXNpemUoZmFsc2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseUF1eGlsaWFyeUJhclZpc2liaWxpdHkoaGlkZGVuOiBib29sZWFuLCBzb3VyY2U/OiAncmVzaXplJyk6IHZvaWQge1xuXHRcdC8vIFRoZSBhdXhpbGlhcnkgYmFyIGlzIGRvY2tlZCBpbnNpZGUgdGhlIGVkaXRvciBwYXJ0IChub3QgYSBncmlkIHZpZXcpLCBzb1xuXHRcdC8vIGRyaXZlIGl0cyB2aXNpYmlsaXR5IHRocm91Z2ggdGhlIGRvY2tlZCBsYXlvdXQgYW5kIGZpcmUgdGhlIHZpc2liaWxpdHlcblx0XHQvLyBldmVudCB0aGUgZ3JpZCBwYXRoIHdvdWxkIG90aGVyd2lzZSByYWlzZSAodGhlIGxheW91dCBjb250cm9sbGVyIGxpc3RlbnNcblx0XHQvLyBmb3IgaXQgdG8gY2FwdHVyZSBwZXItc2Vzc2lvbiBzdGF0ZSkuXG5cdFx0aWYgKHRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKFxuXHRcdFx0XHR0aGlzLmVkaXRvclBhcnRWaWV3LFxuXHRcdFx0XHR0aGlzLl9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKClcblx0XHRcdCk7XG5cdFx0XHRpZiAoIWhpZGRlbiAmJiAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fc3luY2luZ0VkaXRvclZpc2liaWxpdHkgPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuZWRpdG9yUGFydFZpZXcsIHtcblx0XHRcdFx0XHRcdHdpZHRoOiB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCxcblx0XHRcdFx0XHRcdGhlaWdodDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuZWRpdG9yUGFydFZpZXcpLmhlaWdodFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX3N5bmNpbmdFZGl0b3JWaXNpYmlsaXR5ID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbGF5b3V0RG9ja2VkQXV4QmFyKCk7XG5cdFx0dGhpcy5fZmlyZURpZENoYW5nZVBhcnRWaXNpYmlsaXR5KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCAhaGlkZGVuLCBzb3VyY2UpO1xuXHRcdHRoaXMuX25vdGlmeUNvbnRhaW5lckRpZExheW91dCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRPcGVuQXV4aWxpYXJ5UGFuZUNvbXBvc2l0ZShjb250YWluZXJJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Ly8gTmV2ZXIgZm9yY2Utb3BlbiBhIGNvbnRhaW5lciB0aGF0IGhhcyBubyBhY3RpdmUgdmlld3M6IGRvaW5nIHNvIHdvdWxkIGxlYXZlXG5cdFx0Ly8gdGhlIGRldGFpbCBwYW5lbCByZW5kZXJlZCBidXQgYmxhbmsgd2hpbGUgdGhlIHRvZ2dsZS9jb250ZXh0IGtleSByZWFkcyBcIm9uXCIuXG5cdFx0cmV0dXJuIHRoaXMuX2lzQXV4Vmlld0NvbnRhaW5lckFjdGl2ZShjb250YWluZXJJZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2hhbmRsZUFsbEVkaXRvcnNDbG9zZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvciAmJiAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yKSB7XG5cdFx0XHR0aGlzLnJlbWVtYmVyQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBzdXBwcmVzcyA9IHRoaXMuc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdXBwcmVzcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9wcmVwYXJlU2lkZUJhclJlc2l6ZShoaWRkZW46IGJvb2xlYW4pOiBJU2lkZUJhclJlc2l6ZUNvbnRleHQge1xuXHRcdGNvbnN0IHNob3VsZFJlc2l6ZSA9IHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yIHx8IHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyO1xuXHRcdC8vIEdyb3cgdGhlIGVkaXRvciBub2RlIHdoZW4gdGhlIGVkaXRvciBpcyB2aXNpYmxlLCBlbHNlIHRoZSBkZXRhaWwgKGtlZXBzIG5vZGUgPT0gZGV0YWlsIHdpZHRoIHNvIHJldmVhbC1zeW5jIGNhbid0IG1pc2ZpcmUpLlxuXHRcdGNvbnN0IGdyb3dFZGl0b3JOb2RlID0gc2hvdWxkUmVzaXplICYmIHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yO1xuXHRcdGNvbnN0IGdyb3dEZXRhaWxQYW5lbCA9IHNob3VsZFJlc2l6ZSAmJiAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3I7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZyZWVkU2lkZUJhcldpZHRoOiBoaWRkZW4gJiYgc2hvdWxkUmVzaXplID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS53aWR0aCA6IDAsXG5cdFx0XHRlZGl0b3JTaXplQmVmb3JlU2lkZUJhckhpZGU6IGhpZGRlbiAmJiBncm93RWRpdG9yTm9kZSA/IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmVkaXRvclBhcnRWaWV3KSA6IHVuZGVmaW5lZCxcblx0XHRcdGRldGFpbFdpZHRoQmVmb3JlU2lkZUJhckhpZGU6IGhpZGRlbiAmJiBncm93RGV0YWlsUGFuZWwgPyB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCA6IHVuZGVmaW5lZCxcblx0XHR9IHNhdGlzZmllcyBJRG9ja2VkU2lkZUJhclJlc2l6ZUNvbnRleHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2FwcGx5U2lkZUJhclJlc2l6ZShoaWRkZW46IGJvb2xlYW4sIGNvbnRleHQ6IElTaWRlQmFyUmVzaXplQ29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZnJlZWRTaWRlQmFyV2lkdGgsIGVkaXRvclNpemVCZWZvcmVTaWRlQmFySGlkZSwgZGV0YWlsV2lkdGhCZWZvcmVTaWRlQmFySGlkZSB9ID0gY29udGV4dCBhcyBJRG9ja2VkU2lkZUJhclJlc2l6ZUNvbnRleHQ7XG5cblx0XHRpZiAoZWRpdG9yU2l6ZUJlZm9yZVNpZGVCYXJIaWRlKSB7XG5cdFx0XHR0aGlzLl9tZW1lbnRvLmVkaXRvclNpemVHcm93bkZvclNpZGViYXJIaWRlID0gZWRpdG9yU2l6ZUJlZm9yZVNpZGVCYXJIaWRlO1xuXHRcdFx0dGhpcy5fcmVzaXplRWRpdG9yQWZ0ZXJTaWRlYmFyQ2hhbmdlKHtcblx0XHRcdFx0d2lkdGg6IGVkaXRvclNpemVCZWZvcmVTaWRlQmFySGlkZS53aWR0aCArIGZyZWVkU2lkZUJhcldpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IGVkaXRvclNpemVCZWZvcmVTaWRlQmFySGlkZS5oZWlnaHRcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoZGV0YWlsV2lkdGhCZWZvcmVTaWRlQmFySGlkZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSA9IGRldGFpbFdpZHRoQmVmb3JlU2lkZUJhckhpZGU7XG5cdFx0XHR0aGlzLl9ncm93RGV0YWlsQWZ0ZXJTaWRlYmFyQ2hhbmdlKGRldGFpbFdpZHRoQmVmb3JlU2lkZUJhckhpZGUgKyBmcmVlZFNpZGVCYXJXaWR0aCk7XG5cdFx0fSBlbHNlIGlmICghaGlkZGVuICYmIHRoaXMuX21lbWVudG8uZWRpdG9yU2l6ZUdyb3duRm9yU2lkZWJhckhpZGUpIHtcblx0XHRcdHRoaXMuX3Jlc2l6ZUVkaXRvckFmdGVyU2lkZWJhckNoYW5nZSh0aGlzLl9tZW1lbnRvLmVkaXRvclNpemVHcm93bkZvclNpZGViYXJIaWRlKTtcblx0XHRcdHRoaXMuX21lbWVudG8uZWRpdG9yU2l6ZUdyb3duRm9yU2lkZWJhckhpZGUgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICghaGlkZGVuICYmIHRoaXMuX21lbWVudG8uZGV0YWlsV2lkdGhHcm93bkZvclNpZGViYXJIaWRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2dyb3dEZXRhaWxBZnRlclNpZGViYXJDaGFuZ2UodGhpcy5fbWVtZW50by5kZXRhaWxXaWR0aEdyb3duRm9yU2lkZWJhckhpZGUpO1xuXHRcdFx0dGhpcy5fbWVtZW50by5kZXRhaWxXaWR0aEdyb3duRm9yU2lkZWJhckhpZGUgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICghaGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9tZW1lbnRvLmNsZWFyU2lkZWJhckdyb3dTbmFwc2hvdHMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNpemVFZGl0b3JBZnRlclNpZGViYXJDaGFuZ2Uoc2l6ZTogSVZpZXdTaXplKTogdm9pZCB7XG5cdFx0dGhpcy5fc3luY2luZ0VkaXRvclZpc2liaWxpdHkgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmVkaXRvclBhcnRWaWV3LCBzaXplKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3luY2luZ0VkaXRvclZpc2liaWxpdHkgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbGF5b3V0RG9ja2VkQXV4QmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9ncm93RGV0YWlsQWZ0ZXJTaWRlYmFyQ2hhbmdlKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCA9IE1hdGgubWF4KERvY2tlZEF1eGlsaWFyeUJhckNvbnRyb2xsZXIuTUlOX1dJRFRILCB3aWR0aCk7XG5cdFx0dGhpcy5fc3luY2luZ0VkaXRvclZpc2liaWxpdHkgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmVkaXRvclBhcnRWaWV3LCB7XG5cdFx0XHRcdHdpZHRoOiB0aGlzLl9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCxcblx0XHRcdFx0aGVpZ2h0OiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5lZGl0b3JQYXJ0VmlldykuaGVpZ2h0XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3luY2luZ0VkaXRvclZpc2liaWxpdHkgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbGF5b3V0RG9ja2VkQXV4QmFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9DQUFvQztBQUU3QyxTQUFTLDJCQUEyQiw2QkFBNkI7QUFDakUsU0FBZ0MsaUJBQWlCO0FBWTFDLE1BQU0sd0JBQXdCO0FBQUE7QUFBQSxFQVNwQyw0QkFBa0M7QUFDakMsU0FBSyxnQ0FBZ0M7QUFDckMsU0FBSyxpQ0FBaUM7QUFBQSxFQUN2QztBQUNEO0FBU08sTUFBTSx1QkFBTixNQUFNLDZCQUE0QixVQUFVO0FBQUEsRUFBNUM7QUFBQTtBQU1OLFNBQVEsMkJBQTJCLDZCQUE2QjtBQUNoRSxTQUFRLDJCQUEyQjtBQUNuQyxTQUFRLCtCQUErQjtBQUN2QyxTQUFpQixXQUFXLElBQUksd0JBQXdCO0FBRXhELFNBQWlCLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDMUUsU0FBa0Isc0JBQW1DLEtBQUsscUJBQXFCO0FBQUE7QUFBQSxFQUUvRSxJQUFhLDRCQUFxQztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVMsc0JBQStCO0FBQ3ZDLFdBQU8sS0FBSyxnQkFDVCxLQUFLLGNBQWMsY0FBYyxLQUFLLGNBQWMsSUFDcEQsTUFBTSxvQkFBb0I7QUFBQSxFQUM5QjtBQUFBLEVBRVMseUJBQStCO0FBQ3ZDLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVTLDRCQUFxQztBQUM3QyxXQUFPLEtBQUssVUFBVSxNQUFNLGFBQWEsVUFBVTtBQUFBLEVBQ3BEO0FBQUEsRUFFQSxtQkFBeUI7QUFDeEIsVUFBTSxVQUFVLENBQUMsS0FBSywwQkFBMEI7QUFDaEQsVUFBTSxpQkFBaUIs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
