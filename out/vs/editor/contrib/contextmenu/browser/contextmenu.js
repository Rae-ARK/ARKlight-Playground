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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../base/common/platform.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import * as nls from "../../../../nls.js";
import { IMenuService, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService, isStandaloneEditorWorkspace } from "../../../../platform/workspace/common/workspace.js";
let ContextMenuController = class {
  constructor(editor, _contextMenuService, _contextViewService, _contextKeyService, _keybindingService, _menuService, _configurationService, _workspaceContextService) {
    this._contextMenuService = _contextMenuService;
    this._contextViewService = _contextViewService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._configurationService = _configurationService;
    this._workspaceContextService = _workspaceContextService;
    this._toDispose = new DisposableStore();
    this._contextMenuIsBeingShownCount = 0;
    this._editor = editor;
    this._toDispose.add(this._editor.onContextMenu((e) => this._onContextMenu(e)));
    this._toDispose.add(this._editor.onMouseWheel((e) => {
      if (this._contextMenuIsBeingShownCount > 0) {
        const view = this._contextViewService.getContextViewElement();
        const target = e.srcElement;
        if (!(target.shadowRoot && dom.getShadowRoot(view) === target.shadowRoot)) {
          this._contextViewService.hideContextView();
        }
      }
    }));
    this._toDispose.add(this._editor.onKeyDown((e) => {
      if (!this._editor.getOption(EditorOption.contextmenu)) {
        return;
      }
      if (e.keyCode === KeyCode.ContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu();
      }
    }));
  }
  static get(editor) {
    return editor.getContribution(ContextMenuController.ID);
  }
  _onContextMenu(e) {
    if (!this._editor.hasModel()) {
      return;
    }
    if (!this._editor.getOption(EditorOption.contextmenu)) {
      this._editor.focus();
      if (e.target.position && !this._editor.getSelection().containsPosition(e.target.position)) {
        this._editor.setPosition(e.target.position);
      }
      return;
    }
    if (e.target.type === MouseTargetType.OVERLAY_WIDGET) {
      return;
    }
    if (e.target.type === MouseTargetType.CONTENT_TEXT && e.target.detail.injectedText) {
      return;
    }
    e.event.preventDefault();
    e.event.stopPropagation();
    if (e.target.type === MouseTargetType.SCROLLBAR) {
      return this._showScrollbarContextMenu(e.event);
    }
    if (e.target.type !== MouseTargetType.CONTENT_TEXT && e.target.type !== MouseTargetType.CONTENT_EMPTY && e.target.type !== MouseTargetType.TEXTAREA) {
      return;
    }
    this._editor.focus();
    if (e.target.position) {
      let hasSelectionAtPosition = false;
      for (const selection of this._editor.getSelections()) {
        if (selection.containsPosition(e.target.position)) {
          hasSelectionAtPosition = true;
          break;
        }
      }
      if (!hasSelectionAtPosition) {
        this._editor.setPosition(e.target.position);
      }
    }
    let anchor = null;
    if (e.target.type !== MouseTargetType.TEXTAREA) {
      anchor = e.event;
    }
    this.showContextMenu(anchor);
  }
  showContextMenu(anchor) {
    if (!this._editor.getOption(EditorOption.contextmenu)) {
      return;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    const menuActions = this._getMenuActions(
      this._editor.getModel(),
      this._editor.contextMenuId
    );
    if (menuActions.length > 0) {
      this._doShowContextMenu(menuActions, anchor);
    }
  }
  _getMenuActions(model, menuId) {
    const result = [];
    const groups = this._menuService.getMenuActions(menuId, this._contextKeyService, { arg: model.uri });
    for (const group of groups) {
      const [, actions] = group;
      let addedItems = 0;
      for (const action of actions) {
        if (action instanceof SubmenuItemAction) {
          const subActions = this._getMenuActions(model, action.item.submenu);
          if (subActions.length > 0) {
            result.push(new SubmenuAction(action.id, action.label, subActions));
            addedItems++;
          }
        } else {
          result.push(action);
          addedItems++;
        }
      }
      if (addedItems) {
        result.push(new Separator());
      }
    }
    if (result.length) {
      result.pop();
    }
    return result;
  }
  _doShowContextMenu(actions, event = null) {
    if (!this._editor.hasModel()) {
      return;
    }
    let anchor = event;
    if (!anchor) {
      this._editor.revealPosition(this._editor.getPosition(), ScrollType.Immediate);
      this._editor.render();
      const cursorCoords = this._editor.getScrolledVisiblePosition(this._editor.getPosition());
      const editorCoords = dom.getDomNodePagePosition(this._editor.getDomNode());
      const posx = editorCoords.left + cursorCoords.left;
      const posy = editorCoords.top + cursorCoords.top + cursorCoords.height;
      anchor = { x: posx, y: posy };
    }
    const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM) && !isIOS;
    this._contextMenuIsBeingShownCount++;
    this._contextMenuService.showContextMenu({
      domForShadowRoot: useShadowDOM ? this._editor.getOverflowWidgetsDomNode() ?? this._editor.getDomNode() : void 0,
      getAnchor: () => anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this._keybindingFor(action);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel(), isMenu: true });
        }
        const customAction = action;
        if (typeof customAction.getActionViewItem === "function") {
          return customAction.getActionViewItem();
        }
        return new ActionViewItem(action, action, { icon: true, label: true, isMenu: true });
      },
      getKeyBinding: (action) => {
        return this._keybindingFor(action);
      },
      onHide: (wasCancelled) => {
        this._contextMenuIsBeingShownCount--;
      }
    });
  }
  _showScrollbarContextMenu(anchor) {
    if (!this._editor.hasModel()) {
      return;
    }
    if (isStandaloneEditorWorkspace(this._workspaceContextService.getWorkspace())) {
      return;
    }
    const minimapOptions = this._editor.getOption(EditorOption.minimap);
    let lastId = 0;
    const createAction = (opts) => {
      return {
        id: `menu-action-${++lastId}`,
        label: opts.label,
        tooltip: "",
        class: void 0,
        enabled: typeof opts.enabled === "undefined" ? true : opts.enabled,
        checked: opts.checked,
        run: opts.run
      };
    };
    const createSubmenuAction = (label, actions2) => {
      return new SubmenuAction(
        `menu-action-${++lastId}`,
        label,
        actions2,
        void 0
      );
    };
    const createEnumAction = (label, enabled, configName, configuredValue, options) => {
      if (!enabled) {
        return createAction({ label, enabled, run: () => {
        } });
      }
      const createRunner = (value) => {
        return () => {
          this._configurationService.updateValue(configName, value);
        };
      };
      const actions2 = [];
      for (const option of options) {
        actions2.push(createAction({
          label: option.label,
          checked: configuredValue === option.value,
          run: createRunner(option.value)
        }));
      }
      return createSubmenuAction(
        label,
        actions2
      );
    };
    const actions = [];
    actions.push(createAction({
      label: nls.localize("context.minimap.minimap", "Minimap"),
      checked: minimapOptions.enabled,
      run: () => {
        this._configurationService.updateValue(`editor.minimap.enabled`, !minimapOptions.enabled);
      }
    }));
    actions.push(new Separator());
    actions.push(createAction({
      label: nls.localize("context.minimap.renderCharacters", "Render Characters"),
      enabled: minimapOptions.enabled,
      checked: minimapOptions.renderCharacters,
      run: () => {
        this._configurationService.updateValue(`editor.minimap.renderCharacters`, !minimapOptions.renderCharacters);
      }
    }));
    actions.push(createEnumAction(
      nls.localize("context.minimap.size", "Vertical size"),
      minimapOptions.enabled,
      "editor.minimap.size",
      minimapOptions.size,
      [{
        label: nls.localize("context.minimap.size.proportional", "Proportional"),
        value: "proportional"
      }, {
        label: nls.localize("context.minimap.size.fill", "Fill"),
        value: "fill"
      }, {
        label: nls.localize("context.minimap.size.fit", "Fit"),
        value: "fit"
      }]
    ));
    actions.push(createEnumAction(
      nls.localize("context.minimap.slider", "Slider"),
      minimapOptions.enabled,
      "editor.minimap.showSlider",
      minimapOptions.showSlider,
      [{
        label: nls.localize("context.minimap.slider.mouseover", "Mouse Over"),
        value: "mouseover"
      }, {
        label: nls.localize("context.minimap.slider.always", "Always"),
        value: "always"
      }]
    ));
    actions.push(createEnumAction(
      nls.localize("context.minimap.side", "Side"),
      minimapOptions.enabled,
      "editor.minimap.side",
      minimapOptions.side,
      [{
        label: nls.localize("context.minimap.side.right", "Right"),
        value: "right"
      }, {
        label: nls.localize("context.minimap.side.left", "Left"),
        value: "left"
      }]
    ));
    const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM) && !isIOS;
    this._contextMenuIsBeingShownCount++;
    this._contextMenuService.showContextMenu({
      domForShadowRoot: useShadowDOM ? this._editor.getDomNode() : void 0,
      getAnchor: () => anchor,
      getActions: () => actions,
      onHide: (wasCancelled) => {
        this._contextMenuIsBeingShownCount--;
        this._editor.focus();
      }
    });
  }
  _keybindingFor(action) {
    return this._keybindingService.lookupKeybinding(action.id);
  }
  dispose() {
    if (this._contextMenuIsBeingShownCount > 0) {
      this._contextViewService.hideContextView();
    }
    this._toDispose.dispose();
  }
};
ContextMenuController.ID = "editor.contrib.contextmenu";
ContextMenuController = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IWorkspaceContextService)
], ContextMenuController);
class ShowContextMenu extends EditorAction {
  constructor() {
    super({
      id: "editor.action.showContextMenu",
      label: nls.localize2("action.showContextMenu.label", "Show Editor Context Menu"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.Shift | KeyCode.F10,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    ContextMenuController.get(editor)?.showContextMenu();
  }
}
registerEditorContribution(ContextMenuController.ID, ContextMenuController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(ShowContextMenu);
export {
  ContextMenuController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvbnRleHRtZW51L2Jyb3dzZXIvY29udGV4dG1lbnUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElNb3VzZUV2ZW50LCBJTW91c2VXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzSU9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElFZGl0b3JNb3VzZUV2ZW50LCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgaXNTdGFuZGFsb25lRWRpdG9yV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1lbnVDb250cm9sbGVyIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5jb250ZXh0bWVudSc7XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IENvbnRleHRNZW51Q29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvbnRleHRNZW51Q29udHJvbGxlcj4oQ29udGV4dE1lbnVDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfY29udGV4dE1lbnVJc0JlaW5nU2hvd25Db3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25Db250ZXh0TWVudSgoZTogSUVkaXRvck1vdXNlRXZlbnQpID0+IHRoaXMuX29uQ29udGV4dE1lbnUoZSkpKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbk1vdXNlV2hlZWwoKGU6IElNb3VzZVdoZWVsRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50ID4gMCkge1xuXHRcdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmdldENvbnRleHRWaWV3RWxlbWVudCgpO1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnNyY0VsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRcdFx0Ly8gRXZlbnQgdHJpZ2dlcnMgb24gc2hhZG93IHJvb3QgaG9zdCBmaXJzdFxuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgY29udGV4dCB2aWV3IGlzIHVuZGVyIHRoaXMgaG9zdCBiZWZvcmUgaGlkaW5nIGl0ICMxMDMxNjlcblx0XHRcdFx0aWYgKCEodGFyZ2V0LnNoYWRvd1Jvb3QgJiYgZG9tLmdldFNoYWRvd1Jvb3QodmlldykgPT09IHRhcmdldC5zaGFkb3dSb290KSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbktleURvd24oKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvbnRleHRtZW51KSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIENvbnRleHQgbWVudSBpcyB0dXJuZWQgb2ZmIHRocm91Z2ggY29uZmlndXJhdGlvblxuXHRcdFx0fVxuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Db250ZXh0TWVudSkge1xuXHRcdFx0XHQvLyBDaHJvbWUgaXMgZnVubnkgbGlrZSB0aGF0XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5zaG93Q29udGV4dE1lbnUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNvbnRleHRNZW51KGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29udGV4dG1lbnUpKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdC8vIEVuc3VyZSB0aGUgY3Vyc29yIGlzIGF0IHRoZSBwb3NpdGlvbiBvZiB0aGUgbW91c2UgY2xpY2tcblx0XHRcdGlmIChlLnRhcmdldC5wb3NpdGlvbiAmJiAhdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpLmNvbnRhaW5zUG9zaXRpb24oZS50YXJnZXQucG9zaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbihlLnRhcmdldC5wb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47IC8vIENvbnRleHQgbWVudSBpcyB0dXJuZWQgb2ZmIHRocm91Z2ggY29uZmlndXJhdGlvblxuXHRcdH1cblxuXHRcdGlmIChlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuT1ZFUkxBWV9XSURHRVQpIHtcblx0XHRcdHJldHVybjsgLy8gYWxsb3cgbmF0aXZlIG1lbnUgb24gd2lkZ2V0cyB0byBzdXBwb3J0IHJpZ2h0IGNsaWNrIG9uIGlucHV0IGZpZWxkIGZvciBleGFtcGxlIGluIGZpbmRcblx0XHR9XG5cdFx0aWYgKGUudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQgJiYgZS50YXJnZXQuZGV0YWlsLmluamVjdGVkVGV4dCkge1xuXHRcdFx0cmV0dXJuOyAvLyBhbGxvdyBuYXRpdmUgbWVudSBvbiBpbmplY3RlZCB0ZXh0XG5cdFx0fVxuXG5cdFx0ZS5ldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRpZiAoZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLlNDUk9MTEJBUikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3dTY3JvbGxiYXJDb250ZXh0TWVudShlLmV2ZW50KTtcblx0XHR9XG5cblx0XHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCAmJiBlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9FTVBUWSAmJiBlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuVEVYVEFSRUEpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSBzdXBwb3J0IG1vdXNlIGNsaWNrIGludG8gdGV4dCBvciBuYXRpdmUgY29udGV4dCBtZW51IGtleSBmb3Igbm93XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBlZGl0b3IgZ2V0cyBmb2N1cyBpZiBpdCBoYXNuJ3QsIHNvIHRoZSByaWdodCBldmVudHMgYXJlIGJlaW5nIHNlbnQgdG8gb3RoZXIgY29udHJpYnV0aW9uc1xuXHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXG5cdFx0Ly8gRW5zdXJlIHRoZSBjdXJzb3IgaXMgYXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBtb3VzZSBjbGlja1xuXHRcdGlmIChlLnRhcmdldC5wb3NpdGlvbikge1xuXHRcdFx0bGV0IGhhc1NlbGVjdGlvbkF0UG9zaXRpb24gPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCkpIHtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5jb250YWluc1Bvc2l0aW9uKGUudGFyZ2V0LnBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdGhhc1NlbGVjdGlvbkF0UG9zaXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaGFzU2VsZWN0aW9uQXRQb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3Iuc2V0UG9zaXRpb24oZS50YXJnZXQucG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVubGVzcyB0aGUgdXNlciB0cmlnZ2VyZCB0aGUgY29udGV4dCBtZW51IHRocm91Z2ggU2hpZnQrRjEwLCB1c2UgdGhlIG1vdXNlIHBvc2l0aW9uIGFzIG1lbnUgcG9zaXRpb25cblx0XHRsZXQgYW5jaG9yOiBJTW91c2VFdmVudCB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuVEVYVEFSRUEpIHtcblx0XHRcdGFuY2hvciA9IGUuZXZlbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyB0aGUgY29udGV4dCBtZW51XG5cdFx0dGhpcy5zaG93Q29udGV4dE1lbnUoYW5jaG9yKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93Q29udGV4dE1lbnUoYW5jaG9yPzogSU1vdXNlRXZlbnQgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5jb250ZXh0bWVudSkpIHtcblx0XHRcdHJldHVybjsgLy8gQ29udGV4dCBtZW51IGlzIHR1cm5lZCBvZmYgdGhyb3VnaCBjb25maWd1cmF0aW9uXG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5kIGFjdGlvbnMgYXZhaWxhYmxlIGZvciBtZW51XG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLl9nZXRNZW51QWN0aW9ucyh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSxcblx0XHRcdHRoaXMuX2VkaXRvci5jb250ZXh0TWVudUlkKTtcblxuXHRcdC8vIFNob3cgbWVudSBpZiB3ZSBoYXZlIGFjdGlvbnMgdG8gc2hvd1xuXHRcdGlmIChtZW51QWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9kb1Nob3dDb250ZXh0TWVudShtZW51QWN0aW9ucywgYW5jaG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNZW51QWN0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgbWVudUlkOiBNZW51SWQpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUFjdGlvbltdID0gW107XG5cblx0XHQvLyBnZXQgbWVudSBncm91cHNcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhtZW51SWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB7IGFyZzogbW9kZWwudXJpIH0pO1xuXG5cdFx0Ly8gdHJhbnNsYXRlIHRoZW0gaW50byBvdGhlciBhY3Rpb25zXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IFssIGFjdGlvbnNdID0gZ3JvdXA7XG5cdFx0XHRsZXQgYWRkZWRJdGVtcyA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHN1YkFjdGlvbnMgPSB0aGlzLl9nZXRNZW51QWN0aW9ucyhtb2RlbCwgYWN0aW9uLml0ZW0uc3VibWVudSk7XG5cdFx0XHRcdFx0aWYgKHN1YkFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oYWN0aW9uLmlkLCBhY3Rpb24ubGFiZWwsIHN1YkFjdGlvbnMpKTtcblx0XHRcdFx0XHRcdGFkZGVkSXRlbXMrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goYWN0aW9uKTtcblx0XHRcdFx0XHRhZGRlZEl0ZW1zKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFkZGVkSXRlbXMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVzdWx0Lmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnBvcCgpOyAvLyByZW1vdmUgbGFzdCBzZXBhcmF0b3Jcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9TaG93Q29udGV4dE1lbnUoYWN0aW9uczogSUFjdGlvbltdLCBldmVudDogSU1vdXNlRXZlbnQgfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYW5jaG9yOiBJTW91c2VFdmVudCB8IElBbmNob3IgfCBudWxsID0gZXZlbnQ7XG5cdFx0aWYgKCFhbmNob3IpIHtcblx0XHRcdC8vIEVuc3VyZSBzZWxlY3Rpb24gaXMgdmlzaWJsZVxuXHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFBvc2l0aW9uKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cblx0XHRcdHRoaXMuX2VkaXRvci5yZW5kZXIoKTtcblx0XHRcdGNvbnN0IGN1cnNvckNvb3JkcyA9IHRoaXMuX2VkaXRvci5nZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbih0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cblx0XHRcdC8vIFRyYW5zbGF0ZSB0byBhYnNvbHV0ZSBlZGl0b3IgcG9zaXRpb25cblx0XHRcdGNvbnN0IGVkaXRvckNvb3JkcyA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkpO1xuXHRcdFx0Y29uc3QgcG9zeCA9IGVkaXRvckNvb3Jkcy5sZWZ0ICsgY3Vyc29yQ29vcmRzLmxlZnQ7XG5cdFx0XHRjb25zdCBwb3N5ID0gZWRpdG9yQ29vcmRzLnRvcCArIGN1cnNvckNvb3Jkcy50b3AgKyBjdXJzb3JDb29yZHMuaGVpZ2h0O1xuXG5cdFx0XHRhbmNob3IgPSB7IHg6IHBvc3gsIHk6IHBvc3kgfTtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VTaGFkb3dET00gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi51c2VTaGFkb3dET00pICYmICFpc0lPUzsgLy8gRG8gbm90IHVzZSBzaGFkb3cgZG9tIG9uIElPUyAjMTIyMDM1XG5cblx0XHQvLyBTaG93IG1lbnVcblx0XHR0aGlzLl9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50Kys7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRkb21Gb3JTaGFkb3dSb290OiB1c2VTaGFkb3dET00gPyB0aGlzLl9lZGl0b3IuZ2V0T3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSgpID8/IHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkgOiB1bmRlZmluZWQsXG5cblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ0ZvcihhY3Rpb24pO1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBhY3Rpb24sIHsgbGFiZWw6IHRydWUsIGtleWJpbmRpbmc6IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSwgaXNNZW51OiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3VzdG9tQWN0aW9uID0gYWN0aW9uIGFzIElBY3Rpb24gJiB7IGdldEFjdGlvblZpZXdJdGVtPzogKCkgPT4gQWN0aW9uVmlld0l0ZW0gfTtcblx0XHRcdFx0aWYgKHR5cGVvZiBjdXN0b21BY3Rpb24uZ2V0QWN0aW9uVmlld0l0ZW0gPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9tQWN0aW9uLmdldEFjdGlvblZpZXdJdGVtKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmV3IEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgYWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiB0cnVlLCBpc01lbnU6IHRydWUgfSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiAoYWN0aW9uKTogUmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2tleWJpbmRpbmdGb3IoYWN0aW9uKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uSGlkZTogKHdhc0NhbmNlbGxlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50LS07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93U2Nyb2xsYmFyQ29udGV4dE1lbnUoYW5jaG9yOiBJTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNTdGFuZGFsb25lRWRpdG9yV29ya3NwYWNlKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSkge1xuXHRcdFx0Ly8gY2FuJ3QgdXBkYXRlIHRoZSBjb25maWd1cmF0aW9uIHByb3Blcmx5IGluIHRoZSBzdGFuZGFsb25lIGVkaXRvclxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbmltYXBPcHRpb25zID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubWluaW1hcCk7XG5cblx0XHRsZXQgbGFzdElkID0gMDtcblx0XHRjb25zdCBjcmVhdGVBY3Rpb24gPSAob3B0czogeyBsYWJlbDogc3RyaW5nOyBlbmFibGVkPzogYm9vbGVhbjsgY2hlY2tlZD86IGJvb2xlYW47IHJ1bjogKCkgPT4gdm9pZCB9KTogSUFjdGlvbiA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogYG1lbnUtYWN0aW9uLSR7KytsYXN0SWR9YCxcblx0XHRcdFx0bGFiZWw6IG9wdHMubGFiZWwsXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbmFibGVkOiAodHlwZW9mIG9wdHMuZW5hYmxlZCA9PT0gJ3VuZGVmaW5lZCcgPyB0cnVlIDogb3B0cy5lbmFibGVkKSxcblx0XHRcdFx0Y2hlY2tlZDogb3B0cy5jaGVja2VkLFxuXHRcdFx0XHRydW46IG9wdHMucnVuXG5cdFx0XHR9O1xuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlU3VibWVudUFjdGlvbiA9IChsYWJlbDogc3RyaW5nLCBhY3Rpb25zOiBJQWN0aW9uW10pOiBTdWJtZW51QWN0aW9uID0+IHtcblx0XHRcdHJldHVybiBuZXcgU3VibWVudUFjdGlvbihcblx0XHRcdFx0YG1lbnUtYWN0aW9uLSR7KytsYXN0SWR9YCxcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGFjdGlvbnMsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9O1xuXHRcdGNvbnN0IGNyZWF0ZUVudW1BY3Rpb24gPSA8VD4obGFiZWw6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbiwgY29uZmlnTmFtZTogc3RyaW5nLCBjb25maWd1cmVkVmFsdWU6IFQsIG9wdGlvbnM6IHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IFQgfVtdKTogSUFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvbih7IGxhYmVsLCBlbmFibGVkLCBydW46ICgpID0+IHsgfSB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNyZWF0ZVJ1bm5lciA9ICh2YWx1ZTogVCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGNvbmZpZ05hbWUsIHZhbHVlKTtcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUFjdGlvbih7XG5cdFx0XHRcdFx0bGFiZWw6IG9wdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRjaGVja2VkOiBjb25maWd1cmVkVmFsdWUgPT09IG9wdGlvbi52YWx1ZSxcblx0XHRcdFx0XHRydW46IGNyZWF0ZVJ1bm5lcihvcHRpb24udmFsdWUpXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjcmVhdGVTdWJtZW51QWN0aW9uKFxuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0YWN0aW9uc1xuXHRcdFx0KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUFjdGlvbih7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAubWluaW1hcCcsIFwiTWluaW1hcFwiKSxcblx0XHRcdGNoZWNrZWQ6IG1pbmltYXBPcHRpb25zLmVuYWJsZWQsXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoYGVkaXRvci5taW5pbWFwLmVuYWJsZWRgLCAhbWluaW1hcE9wdGlvbnMuZW5hYmxlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdGFjdGlvbnMucHVzaChjcmVhdGVBY3Rpb24oe1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnJlbmRlckNoYXJhY3RlcnMnLCBcIlJlbmRlciBDaGFyYWN0ZXJzXCIpLFxuXHRcdFx0ZW5hYmxlZDogbWluaW1hcE9wdGlvbnMuZW5hYmxlZCxcblx0XHRcdGNoZWNrZWQ6IG1pbmltYXBPcHRpb25zLnJlbmRlckNoYXJhY3RlcnMsXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoYGVkaXRvci5taW5pbWFwLnJlbmRlckNoYXJhY3RlcnNgLCAhbWluaW1hcE9wdGlvbnMucmVuZGVyQ2hhcmFjdGVycyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGFjdGlvbnMucHVzaChjcmVhdGVFbnVtQWN0aW9uPCdwcm9wb3J0aW9uYWwnIHwgJ2ZpbGwnIHwgJ2ZpdCc+KFxuXHRcdFx0bmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAuc2l6ZScsIFwiVmVydGljYWwgc2l6ZVwiKSxcblx0XHRcdG1pbmltYXBPcHRpb25zLmVuYWJsZWQsXG5cdFx0XHQnZWRpdG9yLm1pbmltYXAuc2l6ZScsXG5cdFx0XHRtaW5pbWFwT3B0aW9ucy5zaXplLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnNpemUucHJvcG9ydGlvbmFsJywgXCJQcm9wb3J0aW9uYWxcIiksXG5cdFx0XHRcdHZhbHVlOiAncHJvcG9ydGlvbmFsJ1xuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAuc2l6ZS5maWxsJywgXCJGaWxsXCIpLFxuXHRcdFx0XHR2YWx1ZTogJ2ZpbGwnXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zaXplLmZpdCcsIFwiRml0XCIpLFxuXHRcdFx0XHR2YWx1ZTogJ2ZpdCdcblx0XHRcdH1dXG5cdFx0KSk7XG5cdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUVudW1BY3Rpb248J2Fsd2F5cycgfCAnbW91c2VvdmVyJz4oXG5cdFx0XHRubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zbGlkZXInLCBcIlNsaWRlclwiKSxcblx0XHRcdG1pbmltYXBPcHRpb25zLmVuYWJsZWQsXG5cdFx0XHQnZWRpdG9yLm1pbmltYXAuc2hvd1NsaWRlcicsXG5cdFx0XHRtaW5pbWFwT3B0aW9ucy5zaG93U2xpZGVyLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnNsaWRlci5tb3VzZW92ZXInLCBcIk1vdXNlIE92ZXJcIiksXG5cdFx0XHRcdHZhbHVlOiAnbW91c2VvdmVyJ1xuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAuc2xpZGVyLmFsd2F5cycsIFwiQWx3YXlzXCIpLFxuXHRcdFx0XHR2YWx1ZTogJ2Fsd2F5cydcblx0XHRcdH1dXG5cdFx0KSk7XG5cdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUVudW1BY3Rpb248J3JpZ2h0JyB8ICdsZWZ0Jz4oXG5cdFx0XHRubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zaWRlJywgXCJTaWRlXCIpLFxuXHRcdFx0bWluaW1hcE9wdGlvbnMuZW5hYmxlZCxcblx0XHRcdCdlZGl0b3IubWluaW1hcC5zaWRlJyxcblx0XHRcdG1pbmltYXBPcHRpb25zLnNpZGUsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAuc2lkZS5yaWdodCcsIFwiUmlnaHRcIiksXG5cdFx0XHRcdHZhbHVlOiAncmlnaHQnXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zaWRlLmxlZnQnLCBcIkxlZnRcIiksXG5cdFx0XHRcdHZhbHVlOiAnbGVmdCdcblx0XHRcdH1dXG5cdFx0KSk7XG5cblx0XHRjb25zdCB1c2VTaGFkb3dET00gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi51c2VTaGFkb3dET00pICYmICFpc0lPUzsgLy8gRG8gbm90IHVzZSBzaGFkb3cgZG9tIG9uIElPUyAjMTIyMDM1XG5cdFx0dGhpcy5fY29udGV4dE1lbnVJc0JlaW5nU2hvd25Db3VudCsrO1xuXHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0ZG9tRm9yU2hhZG93Um9vdDogdXNlU2hhZG93RE9NID8gdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdG9uSGlkZTogKHdhc0NhbmNlbGxlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50LS07XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfa2V5YmluZGluZ0ZvcihhY3Rpb246IElBY3Rpb24pOiBSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29udGV4dE1lbnVJc0JlaW5nU2hvd25Db3VudCA+IDApIHtcblx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFNob3dDb250ZXh0TWVudSBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnNob3dDb250ZXh0TWVudScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignYWN0aW9uLnNob3dDb250ZXh0TWVudS5sYWJlbCcsIFwiU2hvdyBFZGl0b3IgQ29udGV4dCBNZW51XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GMTAsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Q29udGV4dE1lbnVDb250cm9sbGVyLmdldChlZGl0b3IpPy5zaG93Q29udGV4dE1lbnUoKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsIENvbnRleHRNZW51Q29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5CZWZvcmVGaXJzdEludGVyYWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNob3dDb250ZXh0TWVudSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUdyQixTQUFTLHNCQUFzQjtBQUUvQixTQUFrQixXQUFXLHFCQUFxQjtBQUNsRCxTQUFTLFNBQVMsY0FBYztBQUVoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBeUMsdUJBQXVCO0FBQ2hFLFNBQVMsY0FBYyxpQ0FBaUMsc0JBQXNCLGtDQUFvRDtBQUNsSSxTQUFTLG9CQUFvQjtBQUM3QixTQUE4QixrQkFBa0I7QUFDaEQsU0FBUyx5QkFBeUI7QUFFbEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBc0IseUJBQXlCO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQixtQ0FBbUM7QUFFL0QsSUFBTSx3QkFBTixNQUEyRDtBQUFBLEVBWWpFLFlBQ0MsUUFDc0MscUJBQ0EscUJBQ0Qsb0JBQ0Esb0JBQ04sY0FDUyx1QkFDRywwQkFDMUM7QUFQcUM7QUFDQTtBQUNEO0FBQ0E7QUFDTjtBQUNTO0FBQ0c7QUFaNUMsU0FBaUIsYUFBYSxJQUFJLGdCQUFnQjtBQUNsRCxTQUFRLGdDQUF3QztBQWEvQyxTQUFLLFVBQVU7QUFFZixTQUFLLFdBQVcsSUFBSSxLQUFLLFFBQVEsY0FBYyxDQUFDLE1BQXlCLEtBQUssZUFBZSxDQUFDLENBQUMsQ0FBQztBQUNoRyxTQUFLLFdBQVcsSUFBSSxLQUFLLFFBQVEsYUFBYSxDQUFDLE1BQXdCO0FBQ3RFLFVBQUksS0FBSyxnQ0FBZ0MsR0FBRztBQUMzQyxjQUFNLE9BQU8sS0FBSyxvQkFBb0Isc0JBQXNCO0FBQzVELGNBQU0sU0FBUyxFQUFFO0FBSWpCLFlBQUksRUFBRSxPQUFPLGNBQWMsSUFBSSxjQUFjLElBQUksTUFBTSxPQUFPLGFBQWE7QUFDMUUsZUFBSyxvQkFBb0IsZ0JBQWdCO0FBQUEsUUFDMUM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFdBQVcsSUFBSSxLQUFLLFFBQVEsVUFBVSxDQUFDLE1BQXNCO0FBQ2pFLFVBQUksQ0FBQyxLQUFLLFFBQVEsVUFBVSxhQUFhLFdBQVcsR0FBRztBQUN0RDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEVBQUUsWUFBWSxRQUFRLGFBQWE7QUFFdEMsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBQ2xCLGFBQUssZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQTVDQSxPQUFjLElBQUksUUFBbUQ7QUFDcEUsV0FBTyxPQUFPLGdCQUF1QyxzQkFBc0IsRUFBRTtBQUFBLEVBQzlFO0FBQUEsRUE0Q1EsZUFBZSxHQUE0QjtBQUNsRCxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxRQUFRLFVBQVUsYUFBYSxXQUFXLEdBQUc7QUFDdEQsV0FBSyxRQUFRLE1BQU07QUFFbkIsVUFBSSxFQUFFLE9BQU8sWUFBWSxDQUFDLEtBQUssUUFBUSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxRQUFRLEdBQUc7QUFDMUYsYUFBSyxRQUFRLFlBQVksRUFBRSxPQUFPLFFBQVE7QUFBQSxNQUMzQztBQUNBO0FBQUEsSUFDRDtBQUVBLFFBQUksRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLGdCQUFnQjtBQUNyRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixnQkFBZ0IsRUFBRSxPQUFPLE9BQU8sY0FBYztBQUNuRjtBQUFBLElBQ0Q7QUFFQSxNQUFFLE1BQU0sZUFBZTtBQUN2QixNQUFFLE1BQU0sZ0JBQWdCO0FBRXhCLFFBQUksRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLFdBQVc7QUFDaEQsYUFBTyxLQUFLLDBCQUEwQixFQUFFLEtBQUs7QUFBQSxJQUM5QztBQUVBLFFBQUksRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLGdCQUFnQixFQUFFLE9BQU8sU0FBUyxnQkFBZ0IsaUJBQWlCLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixVQUFVO0FBQ3BKO0FBQUEsSUFDRDtBQUdBLFNBQUssUUFBUSxNQUFNO0FBR25CLFFBQUksRUFBRSxPQUFPLFVBQVU7QUFDdEIsVUFBSSx5QkFBeUI7QUFDN0IsaUJBQVcsYUFBYSxLQUFLLFFBQVEsY0FBYyxHQUFHO0FBQ3JELFlBQUksVUFBVSxpQkFBaUIsRUFBRSxPQUFPLFFBQVEsR0FBRztBQUNsRCxtQ0FBeUI7QUFDekI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyx3QkFBd0I7QUFDNUIsYUFBSyxRQUFRLFlBQVksRUFBRSxPQUFPLFFBQVE7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFHQSxRQUFJLFNBQTZCO0FBQ2pDLFFBQUksRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLFVBQVU7QUFDL0MsZUFBUyxFQUFFO0FBQUEsSUFDWjtBQUdBLFNBQUssZ0JBQWdCLE1BQU07QUFBQSxFQUM1QjtBQUFBLEVBRU8sZ0JBQWdCLFFBQW1DO0FBQ3pELFFBQUksQ0FBQyxLQUFLLFFBQVEsVUFBVSxhQUFhLFdBQVcsR0FBRztBQUN0RDtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFHQSxVQUFNLGNBQWMsS0FBSztBQUFBLE1BQWdCLEtBQUssUUFBUSxTQUFTO0FBQUEsTUFDOUQsS0FBSyxRQUFRO0FBQUEsSUFBYTtBQUczQixRQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCLFdBQUssbUJBQW1CLGFBQWEsTUFBTTtBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE9BQW1CLFFBQTJCO0FBQ3JFLFVBQU0sU0FBb0IsQ0FBQztBQUczQixVQUFNLFNBQVMsS0FBSyxhQUFhLGVBQWUsUUFBUSxLQUFLLG9CQUFvQixFQUFFLEtBQUssTUFBTSxJQUFJLENBQUM7QUFHbkcsZUFBVyxTQUFTLFFBQVE7QUFDM0IsWUFBTSxDQUFDLEVBQUUsT0FBTyxJQUFJO0FBQ3BCLFVBQUksYUFBYTtBQUNqQixpQkFBVyxVQUFVLFNBQVM7QUFDN0IsWUFBSSxrQkFBa0IsbUJBQW1CO0FBQ3hDLGdCQUFNLGFBQWEsS0FBSyxnQkFBZ0IsT0FBTyxPQUFPLEtBQUssT0FBTztBQUNsRSxjQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLG1CQUFPLEtBQUssSUFBSSxjQUFjLE9BQU8sSUFBSSxPQUFPLE9BQU8sVUFBVSxDQUFDO0FBQ2xFO0FBQUEsVUFDRDtBQUFBLFFBQ0QsT0FBTztBQUNOLGlCQUFPLEtBQUssTUFBTTtBQUNsQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxZQUFZO0FBQ2YsZUFBTyxLQUFLLElBQUksVUFBVSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxPQUFPLFFBQVE7QUFDbEIsYUFBTyxJQUFJO0FBQUEsSUFDWjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsU0FBb0IsUUFBNEIsTUFBWTtBQUN0RixRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQXVDO0FBQzNDLFFBQUksQ0FBQyxRQUFRO0FBRVosV0FBSyxRQUFRLGVBQWUsS0FBSyxRQUFRLFlBQVksR0FBRyxXQUFXLFNBQVM7QUFFNUUsV0FBSyxRQUFRLE9BQU87QUFDcEIsWUFBTSxlQUFlLEtBQUssUUFBUSwyQkFBMkIsS0FBSyxRQUFRLFlBQVksQ0FBQztBQUd2RixZQUFNLGVBQWUsSUFBSSx1QkFBdUIsS0FBSyxRQUFRLFdBQVcsQ0FBQztBQUN6RSxZQUFNLE9BQU8sYUFBYSxPQUFPLGFBQWE7QUFDOUMsWUFBTSxPQUFPLGFBQWEsTUFBTSxhQUFhLE1BQU0sYUFBYTtBQUVoRSxlQUFTLEVBQUUsR0FBRyxNQUFNLEdBQUcsS0FBSztBQUFBLElBQzdCO0FBRUEsVUFBTSxlQUFlLEtBQUssUUFBUSxVQUFVLGFBQWEsWUFBWSxLQUFLLENBQUM7QUFHM0UsU0FBSztBQUNMLFNBQUssb0JBQW9CLGdCQUFnQjtBQUFBLE1BQ3hDLGtCQUFrQixlQUFlLEtBQUssUUFBUSwwQkFBMEIsS0FBSyxLQUFLLFFBQVEsV0FBVyxJQUFJO0FBQUEsTUFFekcsV0FBVyxNQUFNO0FBQUEsTUFFakIsWUFBWSxNQUFNO0FBQUEsTUFFbEIsbUJBQW1CLENBQUMsV0FBVztBQUM5QixjQUFNLGFBQWEsS0FBSyxlQUFlLE1BQU07QUFDN0MsWUFBSSxZQUFZO0FBQ2YsaUJBQU8sSUFBSSxlQUFlLFFBQVEsUUFBUSxFQUFFLE9BQU8sTUFBTSxZQUFZLFdBQVcsU0FBUyxHQUFHLFFBQVEsS0FBSyxDQUFDO0FBQUEsUUFDM0c7QUFFQSxjQUFNLGVBQWU7QUFDckIsWUFBSSxPQUFPLGFBQWEsc0JBQXNCLFlBQVk7QUFDekQsaUJBQU8sYUFBYSxrQkFBa0I7QUFBQSxRQUN2QztBQUVBLGVBQU8sSUFBSSxlQUFlLFFBQVEsUUFBUSxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFBQSxNQUNwRjtBQUFBLE1BRUEsZUFBZSxDQUFDLFdBQTJDO0FBQzFELGVBQU8sS0FBSyxlQUFlLE1BQU07QUFBQSxNQUNsQztBQUFBLE1BRUEsUUFBUSxDQUFDLGlCQUEwQjtBQUNsQyxhQUFLO0FBQUEsTUFDTjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLDBCQUEwQixRQUEyQjtBQUM1RCxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLDRCQUE0QixLQUFLLHlCQUF5QixhQUFhLENBQUMsR0FBRztBQUU5RTtBQUFBLElBQ0Q7QUFFQSxVQUFNLGlCQUFpQixLQUFLLFFBQVEsVUFBVSxhQUFhLE9BQU87QUFFbEUsUUFBSSxTQUFTO0FBQ2IsVUFBTSxlQUFlLENBQUMsU0FBNEY7QUFDakgsYUFBTztBQUFBLFFBQ04sSUFBSSxlQUFlLEVBQUUsTUFBTTtBQUFBLFFBQzNCLE9BQU8sS0FBSztBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsU0FBVSxPQUFPLEtBQUssWUFBWSxjQUFjLE9BQU8sS0FBSztBQUFBLFFBQzVELFNBQVMsS0FBSztBQUFBLFFBQ2QsS0FBSyxLQUFLO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFDQSxVQUFNLHNCQUFzQixDQUFDLE9BQWVBLGFBQXNDO0FBQ2pGLGFBQU8sSUFBSTtBQUFBLFFBQ1YsZUFBZSxFQUFFLE1BQU07QUFBQSxRQUN2QjtBQUFBLFFBQ0FBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxtQkFBbUIsQ0FBSSxPQUFlLFNBQWtCLFlBQW9CLGlCQUFvQixZQUFvRDtBQUN6SixVQUFJLENBQUMsU0FBUztBQUNiLGVBQU8sYUFBYSxFQUFFLE9BQU8sU0FBUyxLQUFLLE1BQU07QUFBQSxRQUFFLEVBQUUsQ0FBQztBQUFBLE1BQ3ZEO0FBQ0EsWUFBTSxlQUFlLENBQUMsVUFBYTtBQUNsQyxlQUFPLE1BQU07QUFDWixlQUFLLHNCQUFzQixZQUFZLFlBQVksS0FBSztBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUNBLFlBQU1BLFdBQXFCLENBQUM7QUFDNUIsaUJBQVcsVUFBVSxTQUFTO0FBQzdCLFFBQUFBLFNBQVEsS0FBSyxhQUFhO0FBQUEsVUFDekIsT0FBTyxPQUFPO0FBQUEsVUFDZCxTQUFTLG9CQUFvQixPQUFPO0FBQUEsVUFDcEMsS0FBSyxhQUFhLE9BQU8sS0FBSztBQUFBLFFBQy9CLENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFDQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0FBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQXFCLENBQUM7QUFDNUIsWUFBUSxLQUFLLGFBQWE7QUFBQSxNQUN6QixPQUFPLElBQUksU0FBUywyQkFBMkIsU0FBUztBQUFBLE1BQ3hELFNBQVMsZUFBZTtBQUFBLE1BQ3hCLEtBQUssTUFBTTtBQUNWLGFBQUssc0JBQXNCLFlBQVksMEJBQTBCLENBQUMsZUFBZSxPQUFPO0FBQUEsTUFDekY7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFlBQVEsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUM1QixZQUFRLEtBQUssYUFBYTtBQUFBLE1BQ3pCLE9BQU8sSUFBSSxTQUFTLG9DQUFvQyxtQkFBbUI7QUFBQSxNQUMzRSxTQUFTLGVBQWU7QUFBQSxNQUN4QixTQUFTLGVBQWU7QUFBQSxNQUN4QixLQUFLLE1BQU07QUFDVixhQUFLLHNCQUFzQixZQUFZLG1DQUFtQyxDQUFDLGVBQWUsZ0JBQWdCO0FBQUEsTUFDM0c7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFlBQVEsS0FBSztBQUFBLE1BQ1osSUFBSSxTQUFTLHdCQUF3QixlQUFlO0FBQUEsTUFDcEQsZUFBZTtBQUFBLE1BQ2Y7QUFBQSxNQUNBLGVBQWU7QUFBQSxNQUNmLENBQUM7QUFBQSxRQUNBLE9BQU8sSUFBSSxTQUFTLHFDQUFxQyxjQUFjO0FBQUEsUUFDdkUsT0FBTztBQUFBLE1BQ1IsR0FBRztBQUFBLFFBQ0YsT0FBTyxJQUFJLFNBQVMsNkJBQTZCLE1BQU07QUFBQSxRQUN2RCxPQUFPO0FBQUEsTUFDUixHQUFHO0FBQUEsUUFDRixPQUFPLElBQUksU0FBUyw0QkFBNEIsS0FBSztBQUFBLFFBQ3JELE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxZQUFRLEtBQUs7QUFBQSxNQUNaLElBQUksU0FBUywwQkFBMEIsUUFBUTtBQUFBLE1BQy9DLGVBQWU7QUFBQSxNQUNmO0FBQUEsTUFDQSxlQUFlO0FBQUEsTUFDZixDQUFDO0FBQUEsUUFDQSxPQUFPLElBQUksU0FBUyxvQ0FBb0MsWUFBWTtBQUFBLFFBQ3BFLE9BQU87QUFBQSxNQUNSLEdBQUc7QUFBQSxRQUNGLE9BQU8sSUFBSSxTQUFTLGlDQUFpQyxRQUFRO0FBQUEsUUFDN0QsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFlBQVEsS0FBSztBQUFBLE1BQ1osSUFBSSxTQUFTLHdCQUF3QixNQUFNO0FBQUEsTUFDM0MsZUFBZTtBQUFBLE1BQ2Y7QUFBQSxNQUNBLGVBQWU7QUFBQSxNQUNmLENBQUM7QUFBQSxRQUNBLE9BQU8sSUFBSSxTQUFTLDhCQUE4QixPQUFPO0FBQUEsUUFDekQsT0FBTztBQUFBLE1BQ1IsR0FBRztBQUFBLFFBQ0YsT0FBTyxJQUFJLFNBQVMsNkJBQTZCLE1BQU07QUFBQSxRQUN2RCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxlQUFlLEtBQUssUUFBUSxVQUFVLGFBQWEsWUFBWSxLQUFLLENBQUM7QUFDM0UsU0FBSztBQUNMLFNBQUssb0JBQW9CLGdCQUFnQjtBQUFBLE1BQ3hDLGtCQUFrQixlQUFlLEtBQUssUUFBUSxXQUFXLElBQUk7QUFBQSxNQUM3RCxXQUFXLE1BQU07QUFBQSxNQUNqQixZQUFZLE1BQU07QUFBQSxNQUNsQixRQUFRLENBQUMsaUJBQTBCO0FBQ2xDLGFBQUs7QUFDTCxhQUFLLFFBQVEsTUFBTTtBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsZUFBZSxRQUFpRDtBQUN2RSxXQUFPLEtBQUssbUJBQW1CLGlCQUFpQixPQUFPLEVBQUU7QUFBQSxFQUMxRDtBQUFBLEVBRU8sVUFBZ0I7QUFDdEIsUUFBSSxLQUFLLGdDQUFnQyxHQUFHO0FBQzNDLFdBQUssb0JBQW9CLGdCQUFnQjtBQUFBLElBQzFDO0FBRUEsU0FBSyxXQUFXLFFBQVE7QUFBQSxFQUN6QjtBQUNEO0FBdFdhLHNCQUVXLEtBQUs7QUFGaEIsd0JBQU47QUFBQSxFQWNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwQlU7QUF3V2IsTUFBTSx3QkFBd0IsYUFBYTtBQUFBLEVBRTFDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSxnQ0FBZ0MsMEJBQTBCO0FBQUEsTUFDL0UsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUSxrQkFBa0I7QUFBQSxRQUMxQixTQUFTLE9BQU8sUUFBUSxRQUFRO0FBQUEsUUFDaEMsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLElBQUksVUFBNEIsUUFBMkI7QUFDakUsMEJBQXNCLElBQUksTUFBTSxHQUFHLGdCQUFnQjtBQUFBLEVBQ3BEO0FBQ0Q7QUFFQSwyQkFBMkIsc0JBQXNCLElBQUksdUJBQXVCLGdDQUFnQyxzQkFBc0I7QUFDbEkscUJBQXFCLGVBQWU7IiwKICAibmFtZXMiOiBbImFjdGlvbnMiXQp9Cg==
