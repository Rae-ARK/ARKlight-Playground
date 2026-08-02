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
import { n } from "../../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { KeybindingLabel } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { autorun, constObservable, derived, observableFromEvent, observableValue } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { nativeHoverDelegate } from "../../../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { defaultKeybindingLabelStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, descriptionForeground, editorActionListForeground, editorHoverBorder } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { hideInlineCompletionId, inlineSuggestCommitAlternativeActionId, inlineSuggestCommitId, toggleShowCollapsedId } from "../../../controller/commandIds.js";
let GutterIndicatorMenuContent = class {
  constructor(_editorObs, _data, _close, _contextKeyService, _keybindingService, _commandService) {
    this._editorObs = _editorObs;
    this._data = _data;
    this._close = _close;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._commandService = _commandService;
    this._inlineEditsShowCollapsed = this._editorObs.getOption(EditorOption.inlineSuggest).map((s) => s.edits.showCollapsed);
  }
  toDisposableLiveElement() {
    return this._createHoverContent().toDisposableLiveElement();
  }
  _createHoverContent() {
    const activeElement = observableValue("active", void 0);
    const createOptionArgs = (options) => {
      return {
        title: options.title,
        icon: options.icon,
        keybinding: typeof options.commandId === "string" ? this._getKeybinding(options.commandArgs ? void 0 : options.commandId) : derived(this, (reader) => typeof options.commandId === "string" ? void 0 : this._getKeybinding(options.commandArgs ? void 0 : options.commandId.read(reader)).read(reader)),
        isActive: activeElement.map((v) => v === options.id),
        onHoverChange: (v) => activeElement.set(v ? options.id : void 0, void 0),
        onAction: () => {
          const commandId = typeof options.commandId === "string" ? options.commandId : options.commandId.get();
          this._close(true, commandId);
          return this._commandService.executeCommand(commandId, ...options.commandArgs ?? []);
        }
      };
    };
    const extensionCommandGroups = this._data.extensionCommands.map(
      (group) => group.map((c, idx) => option(createOptionArgs({
        id: c.command.id + "_" + idx,
        title: c.command.title,
        icon: c.icon ?? Codicon.symbolEvent,
        commandId: c.command.id,
        commandArgs: c.command.arguments
      })))
    );
    const extensionCommandNodes = [];
    for (const group of extensionCommandGroups) {
      if (group.length > 0) {
        extensionCommandNodes.push(separator());
        extensionCommandNodes.push(...group);
      }
    }
    if (this._data.extensionCommandsOnly) {
      return hoverContent(extensionCommandNodes.slice(1));
    }
    const title = header(this._data.displayName);
    const gotoAndAccept = option(createOptionArgs({
      id: "gotoAndAccept",
      title: localize("gotoAndAccept", "Go To / Accept"),
      icon: Codicon.check,
      commandId: inlineSuggestCommitId
    }));
    const reject = option(createOptionArgs({
      id: "reject",
      title: localize("reject", "Reject"),
      icon: Codicon.close,
      commandId: hideInlineCompletionId
    }));
    const alternativeCommand = this._data.alternativeAction ? option(createOptionArgs({
      id: "alternativeCommand",
      title: this._data.alternativeAction.command.title,
      icon: this._data.alternativeAction.icon,
      commandId: inlineSuggestCommitAlternativeActionId
    })) : void 0;
    const showModelEnabled = false;
    const modelOptions = showModelEnabled ? this._data.modelInfo?.models.map((m) => option({
      title: m.name,
      icon: m.id === this._data.modelInfo?.currentModelId ? Codicon.check : Codicon.circle,
      keybinding: constObservable(void 0),
      isActive: activeElement.map((v) => v === "model_" + m.id),
      onHoverChange: (v) => activeElement.set(v ? "model_" + m.id : void 0, void 0),
      onAction: () => {
        this._close(true);
        this._data.setModelId?.(m.id);
      }
    })) ?? [] : [];
    const toggleCollapsedMode = this._inlineEditsShowCollapsed.map(
      (showCollapsed) => showCollapsed ? option(createOptionArgs({
        id: "showExpanded",
        title: localize("showExpanded", "Show Expanded"),
        icon: Codicon.expandAll,
        commandId: toggleShowCollapsedId
      })) : option(createOptionArgs({
        id: "showCollapsed",
        title: localize("showCollapsed", "Show Collapsed"),
        icon: Codicon.collapseAll,
        commandId: toggleShowCollapsedId
      }))
    );
    const snooze = option(createOptionArgs({
      id: "snooze",
      title: localize("snooze", "Snooze"),
      icon: Codicon.bellSlash,
      commandId: "editor.action.inlineSuggest.snooze"
    }));
    const settings = option(createOptionArgs({
      id: "settings",
      title: localize("settings", "Settings"),
      icon: Codicon.gear,
      commandId: "workbench.action.openSettings",
      commandArgs: ["@tag:nextEditSuggestions"]
    }));
    const actions = this._data.action ? [this._data.action] : [];
    const actionBarFooter = actions.length > 0 ? actionBar(
      actions.map((action) => ({
        id: action.id,
        label: action.title + "...",
        enabled: true,
        run: () => this._commandService.executeCommand(action.id, ...action.arguments ?? []),
        class: void 0,
        tooltip: action.tooltip ?? action.title
      })),
      {
        hoverDelegate: nativeHoverDelegate
        /* unable to show hover inside another hover */
      }
    ) : void 0;
    return hoverContent([
      title,
      gotoAndAccept,
      alternativeCommand,
      reject,
      toggleCollapsedMode,
      modelOptions.length ? separator() : void 0,
      ...modelOptions,
      snooze,
      settings,
      ...extensionCommandNodes,
      actionBarFooter ? separator() : void 0,
      actionBarFooter
    ]);
  }
  _getKeybinding(commandId) {
    if (!commandId) {
      return constObservable(void 0);
    }
    return observableFromEvent(this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId));
  }
};
GutterIndicatorMenuContent = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, ICommandService)
], GutterIndicatorMenuContent);
function hoverContent(content) {
  return n.div({
    class: "content",
    style: {
      margin: 4,
      minWidth: 180
    }
  }, content);
}
function header(title) {
  return n.div({
    class: "header",
    style: {
      color: asCssVariable(descriptionForeground),
      fontSize: "13px",
      fontWeight: "600",
      padding: "0 4px",
      lineHeight: 28
    }
  }, [title]);
}
function option(props) {
  return derived({ name: "inlineEdits.option" }, (_reader) => n.div({
    class: ["monaco-menu-option", props.isActive?.map((v) => v && "active")],
    onmouseenter: () => props.onHoverChange?.(true),
    onmouseleave: () => props.onHoverChange?.(false),
    onclick: props.onAction,
    onkeydown: (e) => {
      if (e.key === "Enter") {
        props.onAction?.();
      }
    },
    tabIndex: 0,
    style: {
      borderRadius: 3
      // same as hover widget border radius
    }
  }, [
    n.elem("span", {
      style: {
        fontSize: 16,
        display: "flex"
      }
    }, [ThemeIcon.isThemeIcon(props.icon) ? renderIcon(props.icon) : props.icon.map((icon) => renderIcon(icon))]),
    n.elem("span", {}, [props.title]),
    n.div({
      style: { marginLeft: "auto" },
      ref: (elem) => {
        const keybindingLabel = _reader.store.add(new KeybindingLabel(elem, OS, {
          disableTitle: true,
          ...defaultKeybindingLabelStyles,
          keybindingLabelShadow: void 0,
          keybindingLabelForeground: asCssVariable(descriptionForeground),
          keybindingLabelBackground: "transparent",
          keybindingLabelBorder: "transparent",
          keybindingLabelBottomBorder: void 0
        }));
        _reader.store.add(autorun((reader) => {
          keybindingLabel.set(props.keybinding.read(reader));
        }));
      }
    })
  ]));
}
function actionBar(actions, options) {
  return derived({ name: "inlineEdits.actionBar" }, (_reader) => n.div({
    class: ["action-widget-action-bar"],
    style: {
      padding: "3px 24px"
    }
  }, [
    n.div({
      ref: (elem) => {
        const actionBar2 = _reader.store.add(new ActionBar(elem, options));
        actionBar2.push(actions, { icon: false, label: true });
      }
    })
  ]));
}
function separator() {
  return n.div({
    id: "inline-edit-gutter-indicator-menu-separator",
    class: "menu-separator",
    style: {
      color: asCssVariable(editorActionListForeground),
      padding: "2px 0"
    }
  }, n.div({
    style: {
      borderBottom: `1px solid ${asCssVariable(editorHoverBorder)}`
    }
  }));
}
export {
  GutterIndicatorMenuContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9jb21wb25lbnRzL2d1dHRlckluZGljYXRvck1lbnUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoaWxkTm9kZSwgTGl2ZUVsZW1lbnQsIG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgSUFjdGlvbkJhck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBkZXNjcmlwdGlvbkZvcmVncm91bmQsIGVkaXRvckFjdGlvbkxpc3RGb3JlZ3JvdW5kLCBlZGl0b3JIb3ZlckJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgaGlkZUlubGluZUNvbXBsZXRpb25JZCwgaW5saW5lU3VnZ2VzdENvbW1pdEFsdGVybmF0aXZlQWN0aW9uSWQsIGlubGluZVN1Z2dlc3RDb21taXRJZCwgdG9nZ2xlU2hvd0NvbGxhcHNlZElkIH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbGxlci9jb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IEZpcnN0Rm5BcmcsIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhIH0gZnJvbSAnLi9ndXR0ZXJJbmRpY2F0b3JWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIEd1dHRlckluZGljYXRvck1lbnVDb250ZW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lRWRpdHNTaG93Q29sbGFwc2VkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM6IE9ic2VydmFibGVDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RhdGE6IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZTogKGZvY3VzRWRpdG9yOiBib29sZWFuLCBjb21tYW5kSWQ/OiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2lubGluZUVkaXRzU2hvd0NvbGxhcHNlZCA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpLm1hcChzID0+IHMuZWRpdHMuc2hvd0NvbGxhcHNlZCk7XG5cdH1cblxuXHRwdWJsaWMgdG9EaXNwb3NhYmxlTGl2ZUVsZW1lbnQoKTogTGl2ZUVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVIb3ZlckNvbnRlbnQoKS50b0Rpc3Bvc2FibGVMaXZlRWxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSG92ZXJDb250ZW50KCkge1xuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignYWN0aXZlJywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNyZWF0ZU9wdGlvbkFyZ3MgPSAob3B0aW9uczogeyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBpY29uOiBJT2JzZXJ2YWJsZTxUaGVtZUljb24+IHwgVGhlbWVJY29uOyBjb21tYW5kSWQ6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz47IGNvbW1hbmRBcmdzPzogdW5rbm93bltdIH0pOiBGaXJzdEZuQXJnPHR5cGVvZiBvcHRpb24+ID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRpdGxlOiBvcHRpb25zLnRpdGxlLFxuXHRcdFx0XHRpY29uOiBvcHRpb25zLmljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHR5cGVvZiBvcHRpb25zLmNvbW1hbmRJZCA9PT0gJ3N0cmluZycgPyB0aGlzLl9nZXRLZXliaW5kaW5nKG9wdGlvbnMuY29tbWFuZEFyZ3MgPyB1bmRlZmluZWQgOiBvcHRpb25zLmNvbW1hbmRJZCkgOiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0eXBlb2Ygb3B0aW9ucy5jb21tYW5kSWQgPT09ICdzdHJpbmcnID8gdW5kZWZpbmVkIDogdGhpcy5fZ2V0S2V5YmluZGluZyhvcHRpb25zLmNvbW1hbmRBcmdzID8gdW5kZWZpbmVkIDogb3B0aW9ucy5jb21tYW5kSWQucmVhZChyZWFkZXIpKS5yZWFkKHJlYWRlcikpLFxuXHRcdFx0XHRpc0FjdGl2ZTogYWN0aXZlRWxlbWVudC5tYXAodiA9PiB2ID09PSBvcHRpb25zLmlkKSxcblx0XHRcdFx0b25Ib3ZlckNoYW5nZTogdiA9PiBhY3RpdmVFbGVtZW50LnNldCh2ID8gb3B0aW9ucy5pZCA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0b25BY3Rpb246ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kSWQgPSB0eXBlb2Ygb3B0aW9ucy5jb21tYW5kSWQgPT09ICdzdHJpbmcnID8gb3B0aW9ucy5jb21tYW5kSWQgOiBvcHRpb25zLmNvbW1hbmRJZC5nZXQoKTtcblx0XHRcdFx0XHR0aGlzLl9jbG9zZSh0cnVlLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQsIC4uLihvcHRpb25zLmNvbW1hbmRBcmdzID8/IFtdKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCBleHRlbnNpb25Db21tYW5kR3JvdXBzID0gdGhpcy5fZGF0YS5leHRlbnNpb25Db21tYW5kcy5tYXAoZ3JvdXAgPT5cblx0XHRcdGdyb3VwLm1hcCgoYywgaWR4KSA9PiBvcHRpb24oY3JlYXRlT3B0aW9uQXJncyh7XG5cdFx0XHRcdGlkOiBjLmNvbW1hbmQuaWQgKyAnXycgKyBpZHgsXG5cdFx0XHRcdHRpdGxlOiBjLmNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdGljb246IGMuaWNvbiA/PyBDb2RpY29uLnN5bWJvbEV2ZW50LFxuXHRcdFx0XHRjb21tYW5kSWQ6IGMuY29tbWFuZC5pZCxcblx0XHRcdFx0Y29tbWFuZEFyZ3M6IGMuY29tbWFuZC5hcmd1bWVudHNcblx0XHRcdH0pKSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uQ29tbWFuZE5vZGVzOiBDaGlsZE5vZGUgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGV4dGVuc2lvbkNvbW1hbmRHcm91cHMpIHtcblx0XHRcdGlmIChncm91cC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGV4dGVuc2lvbkNvbW1hbmROb2Rlcy5wdXNoKHNlcGFyYXRvcigpKTtcblx0XHRcdFx0ZXh0ZW5zaW9uQ29tbWFuZE5vZGVzLnB1c2goLi4uZ3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kYXRhLmV4dGVuc2lvbkNvbW1hbmRzT25seSkge1xuXHRcdFx0Ly8gZHJvcCBsZWFkaW5nIHNlcGFyYXRvclxuXHRcdFx0cmV0dXJuIGhvdmVyQ29udGVudChleHRlbnNpb25Db21tYW5kTm9kZXMuc2xpY2UoMSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlID0gaGVhZGVyKHRoaXMuX2RhdGEuZGlzcGxheU5hbWUpO1xuXG5cdFx0Y29uc3QgZ290b0FuZEFjY2VwdCA9IG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdGlkOiAnZ290b0FuZEFjY2VwdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dvdG9BbmRBY2NlcHQnLCBcIkdvIFRvIC8gQWNjZXB0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdGNvbW1hbmRJZDogaW5saW5lU3VnZ2VzdENvbW1pdElkLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlamVjdCA9IG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdGlkOiAncmVqZWN0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVqZWN0JywgXCJSZWplY3RcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0Y29tbWFuZElkOiBoaWRlSW5saW5lQ29tcGxldGlvbklkXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWx0ZXJuYXRpdmVDb21tYW5kID0gdGhpcy5fZGF0YS5hbHRlcm5hdGl2ZUFjdGlvbiA/IG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdGlkOiAnYWx0ZXJuYXRpdmVDb21tYW5kJyxcblx0XHRcdHRpdGxlOiB0aGlzLl9kYXRhLmFsdGVybmF0aXZlQWN0aW9uLmNvbW1hbmQudGl0bGUsXG5cdFx0XHRpY29uOiB0aGlzLl9kYXRhLmFsdGVybmF0aXZlQWN0aW9uLmljb24sXG5cdFx0XHRjb21tYW5kSWQ6IGlubGluZVN1Z2dlc3RDb21taXRBbHRlcm5hdGl2ZUFjdGlvbklkLFxuXHRcdH0pKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHNob3dNb2RlbEVuYWJsZWQgPSBmYWxzZTtcblx0XHRjb25zdCBtb2RlbE9wdGlvbnMgPSBzaG93TW9kZWxFbmFibGVkID8gdGhpcy5fZGF0YS5tb2RlbEluZm8/Lm1vZGVscy5tYXAoKG06IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0pID0+IG9wdGlvbih7XG5cdFx0XHR0aXRsZTogbS5uYW1lLFxuXHRcdFx0aWNvbjogbS5pZCA9PT0gdGhpcy5fZGF0YS5tb2RlbEluZm8/LmN1cnJlbnRNb2RlbElkID8gQ29kaWNvbi5jaGVjayA6IENvZGljb24uY2lyY2xlLFxuXHRcdFx0a2V5YmluZGluZzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRpc0FjdGl2ZTogYWN0aXZlRWxlbWVudC5tYXAodiA9PiB2ID09PSAnbW9kZWxfJyArIG0uaWQpLFxuXHRcdFx0b25Ib3ZlckNoYW5nZTogdiA9PiBhY3RpdmVFbGVtZW50LnNldCh2ID8gJ21vZGVsXycgKyBtLmlkIDogdW5kZWZpbmVkLCB1bmRlZmluZWQpLFxuXHRcdFx0b25BY3Rpb246ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY2xvc2UodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX2RhdGEuc2V0TW9kZWxJZD8uKG0uaWQpO1xuXHRcdFx0fSxcblx0XHR9KSkgPz8gW10gOiBbXTtcblxuXHRcdGNvbnN0IHRvZ2dsZUNvbGxhcHNlZE1vZGUgPSB0aGlzLl9pbmxpbmVFZGl0c1Nob3dDb2xsYXBzZWQubWFwKHNob3dDb2xsYXBzZWQgPT4gc2hvd0NvbGxhcHNlZCA/XG5cdFx0XHRvcHRpb24oY3JlYXRlT3B0aW9uQXJncyh7XG5cdFx0XHRcdGlkOiAnc2hvd0V4cGFuZGVkJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93RXhwYW5kZWQnLCBcIlNob3cgRXhwYW5kZWRcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uZXhwYW5kQWxsLFxuXHRcdFx0XHRjb21tYW5kSWQ6IHRvZ2dsZVNob3dDb2xsYXBzZWRJZFxuXHRcdFx0fSkpXG5cdFx0XHQ6IG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdFx0aWQ6ICdzaG93Q29sbGFwc2VkJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93Q29sbGFwc2VkJywgXCJTaG93IENvbGxhcHNlZFwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdFx0Y29tbWFuZElkOiB0b2dnbGVTaG93Q29sbGFwc2VkSWRcblx0XHRcdH0pKVxuXHRcdCk7XG5cblx0XHRjb25zdCBzbm9vemUgPSBvcHRpb24oY3JlYXRlT3B0aW9uQXJncyh7XG5cdFx0XHRpZDogJ3Nub296ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nub296ZScsIFwiU25vb3plXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5iZWxsU2xhc2gsXG5cdFx0XHRjb21tYW5kSWQ6ICdlZGl0b3IuYWN0aW9uLmlubGluZVN1Z2dlc3Quc25vb3plJ1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNldHRpbmdzID0gb3B0aW9uKGNyZWF0ZU9wdGlvbkFyZ3Moe1xuXHRcdFx0aWQ6ICdzZXR0aW5ncycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldHRpbmdzJywgXCJTZXR0aW5nc1wiKSxcblx0XHRcdGljb246IENvZGljb24uZ2Vhcixcblx0XHRcdGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyxcblx0XHRcdGNvbW1hbmRBcmdzOiBbJ0B0YWc6bmV4dEVkaXRTdWdnZXN0aW9ucyddXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuX2RhdGEuYWN0aW9uID8gW3RoaXMuX2RhdGEuYWN0aW9uXSA6IFtdO1xuXHRcdGNvbnN0IGFjdGlvbkJhckZvb3RlciA9IGFjdGlvbnMubGVuZ3RoID4gMCA/IGFjdGlvbkJhcihcblx0XHRcdGFjdGlvbnMubWFwKGFjdGlvbiA9PiAoe1xuXHRcdFx0XHRpZDogYWN0aW9uLmlkLFxuXHRcdFx0XHRsYWJlbDogYWN0aW9uLnRpdGxlICsgJy4uLicsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoYWN0aW9uLmlkLCAuLi4oYWN0aW9uLmFyZ3VtZW50cyA/PyBbXSkpLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sdGlwOiBhY3Rpb24udG9vbHRpcCA/PyBhY3Rpb24udGl0bGVcblx0XHRcdH0pKSxcblx0XHRcdHsgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSAvKiB1bmFibGUgdG8gc2hvdyBob3ZlciBpbnNpZGUgYW5vdGhlciBob3ZlciAqLyB9XG5cdFx0KSA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiBob3ZlckNvbnRlbnQoW1xuXHRcdFx0dGl0bGUsXG5cdFx0XHRnb3RvQW5kQWNjZXB0LFxuXHRcdFx0YWx0ZXJuYXRpdmVDb21tYW5kLFxuXHRcdFx0cmVqZWN0LFxuXHRcdFx0dG9nZ2xlQ29sbGFwc2VkTW9kZSxcblx0XHRcdG1vZGVsT3B0aW9ucy5sZW5ndGggPyBzZXBhcmF0b3IoKSA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLm1vZGVsT3B0aW9ucyxcblx0XHRcdHNub296ZSxcblx0XHRcdHNldHRpbmdzLFxuXG5cdFx0XHQuLi5leHRlbnNpb25Db21tYW5kTm9kZXMsXG5cblx0XHRcdGFjdGlvbkJhckZvb3RlciA/IHNlcGFyYXRvcigpIDogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uQmFyRm9vdGVyXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRLZXliaW5kaW5nKGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFjb21tYW5kSWQpIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5fY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCAoKSA9PiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRJZCkpOyAvLyBUT0RPOiB1c2UgY29udGV4dGtleXNlcnZpY2UgdG8gdXNlIGRpZmZlcmVudCByZW5kZXJpbmdzXG5cdH1cbn1cblxuZnVuY3Rpb24gaG92ZXJDb250ZW50KGNvbnRlbnQ6IENoaWxkTm9kZSkge1xuXHRyZXR1cm4gbi5kaXYoe1xuXHRcdGNsYXNzOiAnY29udGVudCcsXG5cdFx0c3R5bGU6IHtcblx0XHRcdG1hcmdpbjogNCxcblx0XHRcdG1pbldpZHRoOiAxODAsXG5cdFx0fVxuXHR9LCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gaGVhZGVyKHRpdGxlOiBzdHJpbmcgfCBJT2JzZXJ2YWJsZTxzdHJpbmc+KSB7XG5cdHJldHVybiBuLmRpdih7XG5cdFx0Y2xhc3M6ICdoZWFkZXInLFxuXHRcdHN0eWxlOiB7XG5cdFx0XHRjb2xvcjogYXNDc3NWYXJpYWJsZShkZXNjcmlwdGlvbkZvcmVncm91bmQpLFxuXHRcdFx0Zm9udFNpemU6ICcxM3B4Jyxcblx0XHRcdGZvbnRXZWlnaHQ6ICc2MDAnLFxuXHRcdFx0cGFkZGluZzogJzAgNHB4Jyxcblx0XHRcdGxpbmVIZWlnaHQ6IDI4LFxuXHRcdH1cblx0fSwgW3RpdGxlXSk7XG59XG5cbmZ1bmN0aW9uIG9wdGlvbihwcm9wczoge1xuXHR0aXRsZTogc3RyaW5nO1xuXHRpY29uOiBJT2JzZXJ2YWJsZTxUaGVtZUljb24+IHwgVGhlbWVJY29uO1xuXHRrZXliaW5kaW5nOiBJT2JzZXJ2YWJsZTxSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQ+O1xuXHRpc0FjdGl2ZT86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRvbkhvdmVyQ2hhbmdlPzogKGlzSG92ZXJlZDogYm9vbGVhbikgPT4gdm9pZDtcblx0b25BY3Rpb24/OiAoKSA9PiB2b2lkO1xufSkge1xuXHRyZXR1cm4gZGVyaXZlZCh7IG5hbWU6ICdpbmxpbmVFZGl0cy5vcHRpb24nIH0sIChfcmVhZGVyKSA9PiBuLmRpdih7XG5cdFx0Y2xhc3M6IFsnbW9uYWNvLW1lbnUtb3B0aW9uJywgcHJvcHMuaXNBY3RpdmU/Lm1hcCh2ID0+IHYgJiYgJ2FjdGl2ZScpXSxcblx0XHRvbm1vdXNlZW50ZXI6ICgpID0+IHByb3BzLm9uSG92ZXJDaGFuZ2U/Lih0cnVlKSxcblx0XHRvbm1vdXNlbGVhdmU6ICgpID0+IHByb3BzLm9uSG92ZXJDaGFuZ2U/LihmYWxzZSksXG5cdFx0b25jbGljazogcHJvcHMub25BY3Rpb24sXG5cdFx0b25rZXlkb3duOiBlID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuXHRcdFx0XHRwcm9wcy5vbkFjdGlvbj8uKCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHR0YWJJbmRleDogMCxcblx0XHRzdHlsZToge1xuXHRcdFx0Ym9yZGVyUmFkaXVzOiAzLCAvLyBzYW1lIGFzIGhvdmVyIHdpZGdldCBib3JkZXIgcmFkaXVzXG5cdFx0fVxuXHR9LCBbXG5cdFx0bi5lbGVtKCdzcGFuJywge1xuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0Zm9udFNpemU6IDE2LFxuXHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHR9XG5cdFx0fSwgW1RoZW1lSWNvbi5pc1RoZW1lSWNvbihwcm9wcy5pY29uKSA/IHJlbmRlckljb24ocHJvcHMuaWNvbikgOiBwcm9wcy5pY29uLm1hcChpY29uID0+IHJlbmRlckljb24oaWNvbikpXSksXG5cdFx0bi5lbGVtKCdzcGFuJywge30sIFtwcm9wcy50aXRsZV0pLFxuXHRcdG4uZGl2KHtcblx0XHRcdHN0eWxlOiB7IG1hcmdpbkxlZnQ6ICdhdXRvJyB9LFxuXHRcdFx0cmVmOiBlbGVtID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gX3JlYWRlci5zdG9yZS5hZGQobmV3IEtleWJpbmRpbmdMYWJlbChlbGVtLCBPUywge1xuXHRcdFx0XHRcdGRpc2FibGVUaXRsZTogdHJ1ZSxcblx0XHRcdFx0XHQuLi5kZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbFNoYWRvdzogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbEZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nTGFiZWxCYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbEJvcmRlcjogJ3RyYW5zcGFyZW50Jyxcblx0XHRcdFx0XHRrZXliaW5kaW5nTGFiZWxCb3R0b21Cb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRfcmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0a2V5YmluZGluZ0xhYmVsLnNldChwcm9wcy5rZXliaW5kaW5nLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KVxuXHRdKSk7XG59XG5cbi8vIFRPRE86IG1ha2UgdGhpcyBvYnNlcnZhYmxlXG5mdW5jdGlvbiBhY3Rpb25CYXIoYWN0aW9uczogSUFjdGlvbltdLCBvcHRpb25zOiBJQWN0aW9uQmFyT3B0aW9ucykge1xuXHRyZXR1cm4gZGVyaXZlZCh7IG5hbWU6ICdpbmxpbmVFZGl0cy5hY3Rpb25CYXInIH0sIChfcmVhZGVyKSA9PiBuLmRpdih7XG5cdFx0Y2xhc3M6IFsnYWN0aW9uLXdpZGdldC1hY3Rpb24tYmFyJ10sXG5cdFx0c3R5bGU6IHtcblx0XHRcdHBhZGRpbmc6ICczcHggMjRweCcsXG5cdFx0fVxuXHR9LCBbXG5cdFx0bi5kaXYoe1xuXHRcdFx0cmVmOiBlbGVtID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uQmFyID0gX3JlYWRlci5zdG9yZS5hZGQobmV3IEFjdGlvbkJhcihlbGVtLCBvcHRpb25zKSk7XG5cdFx0XHRcdGFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pXG5cdF0pKTtcbn1cblxuZnVuY3Rpb24gc2VwYXJhdG9yKCkge1xuXHRyZXR1cm4gbi5kaXYoe1xuXHRcdGlkOiAnaW5saW5lLWVkaXQtZ3V0dGVyLWluZGljYXRvci1tZW51LXNlcGFyYXRvcicsXG5cdFx0Y2xhc3M6ICdtZW51LXNlcGFyYXRvcicsXG5cdFx0c3R5bGU6IHtcblx0XHRcdGNvbG9yOiBhc0Nzc1ZhcmlhYmxlKGVkaXRvckFjdGlvbkxpc3RGb3JlZ3JvdW5kKSxcblx0XHRcdHBhZGRpbmc6ICcycHggMCcsXG5cdFx0fVxuXHR9LCBuLmRpdih7XG5cdFx0c3R5bGU6IHtcblx0XHRcdGJvcmRlckJvdHRvbTogYDFweCBzb2xpZCAke2FzQ3NzVmFyaWFibGUoZWRpdG9ySG92ZXJCb3JkZXIpfWAsXG5cdFx0fVxuXHR9KSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVNBLFNBQWlDLFNBQVM7QUFDMUMsU0FBUyxpQkFBb0M7QUFDN0MsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxlQUFlO0FBRXhCLFNBQXNCLFNBQVMsaUJBQWlCLFNBQVMscUJBQXFCLHVCQUF1QjtBQUNyRyxTQUFTLFVBQVU7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUFlLHVCQUF1Qiw0QkFBNEIseUJBQXlCO0FBRXBHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCLHdDQUF3Qyx1QkFBdUIsNkJBQTZCO0FBSXRILElBQU0sNkJBQU4sTUFBaUM7QUFBQSxFQUd2QyxZQUNrQixZQUNBLE9BQ0EsUUFDb0Isb0JBQ0Esb0JBQ0gsaUJBQ2pDO0FBTmdCO0FBQ0E7QUFDQTtBQUNvQjtBQUNBO0FBQ0g7QUFFbEMsU0FBSyw0QkFBNEIsS0FBSyxXQUFXLFVBQVUsYUFBYSxhQUFhLEVBQUUsSUFBSSxPQUFLLEVBQUUsTUFBTSxhQUFhO0FBQUEsRUFDdEg7QUFBQSxFQUVPLDBCQUF1QztBQUM3QyxXQUFPLEtBQUssb0JBQW9CLEVBQUUsd0JBQXdCO0FBQUEsRUFDM0Q7QUFBQSxFQUVRLHNCQUFzQjtBQUM3QixVQUFNLGdCQUFnQixnQkFBb0MsVUFBVSxNQUFTO0FBRTdFLFVBQU0sbUJBQW1CLENBQUMsWUFBa0w7QUFDM00sYUFBTztBQUFBLFFBQ04sT0FBTyxRQUFRO0FBQUEsUUFDZixNQUFNLFFBQVE7QUFBQSxRQUNkLFlBQVksT0FBTyxRQUFRLGNBQWMsV0FBVyxLQUFLLGVBQWUsUUFBUSxjQUFjLFNBQVksUUFBUSxTQUFTLElBQUksUUFBUSxNQUFNLFlBQVUsT0FBTyxRQUFRLGNBQWMsV0FBVyxTQUFZLEtBQUssZUFBZSxRQUFRLGNBQWMsU0FBWSxRQUFRLFVBQVUsS0FBSyxNQUFNLENBQUMsRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUFBLFFBQzdTLFVBQVUsY0FBYyxJQUFJLE9BQUssTUFBTSxRQUFRLEVBQUU7QUFBQSxRQUNqRCxlQUFlLE9BQUssY0FBYyxJQUFJLElBQUksUUFBUSxLQUFLLFFBQVcsTUFBUztBQUFBLFFBQzNFLFVBQVUsTUFBTTtBQUNmLGdCQUFNLFlBQVksT0FBTyxRQUFRLGNBQWMsV0FBVyxRQUFRLFlBQVksUUFBUSxVQUFVLElBQUk7QUFDcEcsZUFBSyxPQUFPLE1BQU0sU0FBUztBQUMzQixpQkFBTyxLQUFLLGdCQUFnQixlQUFlLFdBQVcsR0FBSSxRQUFRLGVBQWUsQ0FBQyxDQUFFO0FBQUEsUUFDckY7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0seUJBQXlCLEtBQUssTUFBTSxrQkFBa0I7QUFBQSxNQUFJLFdBQy9ELE1BQU0sSUFBSSxDQUFDLEdBQUcsUUFBUSxPQUFPLGlCQUFpQjtBQUFBLFFBQzdDLElBQUksRUFBRSxRQUFRLEtBQUssTUFBTTtBQUFBLFFBQ3pCLE9BQU8sRUFBRSxRQUFRO0FBQUEsUUFDakIsTUFBTSxFQUFFLFFBQVEsUUFBUTtBQUFBLFFBQ3hCLFdBQVcsRUFBRSxRQUFRO0FBQUEsUUFDckIsYUFBYSxFQUFFLFFBQVE7QUFBQSxNQUN4QixDQUFDLENBQUMsQ0FBQztBQUFBLElBQ0o7QUFFQSxVQUFNLHdCQUFtQyxDQUFDO0FBQzFDLGVBQVcsU0FBUyx3QkFBd0I7QUFDM0MsVUFBSSxNQUFNLFNBQVMsR0FBRztBQUNyQiw4QkFBc0IsS0FBSyxVQUFVLENBQUM7QUFDdEMsOEJBQXNCLEtBQUssR0FBRyxLQUFLO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLE1BQU0sdUJBQXVCO0FBRXJDLGFBQU8sYUFBYSxzQkFBc0IsTUFBTSxDQUFDLENBQUM7QUFBQSxJQUNuRDtBQUVBLFVBQU0sUUFBUSxPQUFPLEtBQUssTUFBTSxXQUFXO0FBRTNDLFVBQU0sZ0JBQWdCLE9BQU8saUJBQWlCO0FBQUEsTUFDN0MsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNqRCxNQUFNLFFBQVE7QUFBQSxNQUNkLFdBQVc7QUFBQSxJQUNaLENBQUMsQ0FBQztBQUVGLFVBQU0sU0FBUyxPQUFPLGlCQUFpQjtBQUFBLE1BQ3RDLElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUyxVQUFVLFFBQVE7QUFBQSxNQUNsQyxNQUFNLFFBQVE7QUFBQSxNQUNkLFdBQVc7QUFBQSxJQUNaLENBQUMsQ0FBQztBQUVGLFVBQU0scUJBQXFCLEtBQUssTUFBTSxvQkFBb0IsT0FBTyxpQkFBaUI7QUFBQSxNQUNqRixJQUFJO0FBQUEsTUFDSixPQUFPLEtBQUssTUFBTSxrQkFBa0IsUUFBUTtBQUFBLE1BQzVDLE1BQU0sS0FBSyxNQUFNLGtCQUFrQjtBQUFBLE1BQ25DLFdBQVc7QUFBQSxJQUNaLENBQUMsQ0FBQyxJQUFJO0FBRU4sVUFBTSxtQkFBbUI7QUFDekIsVUFBTSxlQUFlLG1CQUFtQixLQUFLLE1BQU0sV0FBVyxPQUFPLElBQUksQ0FBQyxNQUFvQyxPQUFPO0FBQUEsTUFDcEgsT0FBTyxFQUFFO0FBQUEsTUFDVCxNQUFNLEVBQUUsT0FBTyxLQUFLLE1BQU0sV0FBVyxpQkFBaUIsUUFBUSxRQUFRLFFBQVE7QUFBQSxNQUM5RSxZQUFZLGdCQUFnQixNQUFTO0FBQUEsTUFDckMsVUFBVSxjQUFjLElBQUksT0FBSyxNQUFNLFdBQVcsRUFBRSxFQUFFO0FBQUEsTUFDdEQsZUFBZSxPQUFLLGNBQWMsSUFBSSxJQUFJLFdBQVcsRUFBRSxLQUFLLFFBQVcsTUFBUztBQUFBLE1BQ2hGLFVBQVUsTUFBTTtBQUNmLGFBQUssT0FBTyxJQUFJO0FBQ2hCLGFBQUssTUFBTSxhQUFhLEVBQUUsRUFBRTtBQUFBLE1BQzdCO0FBQUEsSUFDRCxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztBQUViLFVBQU0sc0JBQXNCLEtBQUssMEJBQTBCO0FBQUEsTUFBSSxtQkFBaUIsZ0JBQy9FLE9BQU8saUJBQWlCO0FBQUEsUUFDdkIsSUFBSTtBQUFBLFFBQ0osT0FBTyxTQUFTLGdCQUFnQixlQUFlO0FBQUEsUUFDL0MsTUFBTSxRQUFRO0FBQUEsUUFDZCxXQUFXO0FBQUEsTUFDWixDQUFDLENBQUMsSUFDQSxPQUFPLGlCQUFpQjtBQUFBLFFBQ3pCLElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUEsUUFDakQsTUFBTSxRQUFRO0FBQUEsUUFDZCxXQUFXO0FBQUEsTUFDWixDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsVUFBTSxTQUFTLE9BQU8saUJBQWlCO0FBQUEsTUFDdEMsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLFVBQVUsUUFBUTtBQUFBLE1BQ2xDLE1BQU0sUUFBUTtBQUFBLE1BQ2QsV0FBVztBQUFBLElBQ1osQ0FBQyxDQUFDO0FBRUYsVUFBTSxXQUFXLE9BQU8saUJBQWlCO0FBQUEsTUFDeEMsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLFlBQVksVUFBVTtBQUFBLE1BQ3RDLE1BQU0sUUFBUTtBQUFBLE1BQ2QsV0FBVztBQUFBLE1BQ1gsYUFBYSxDQUFDLDBCQUEwQjtBQUFBLElBQ3pDLENBQUMsQ0FBQztBQUVGLFVBQU0sVUFBVSxLQUFLLE1BQU0sU0FBUyxDQUFDLEtBQUssTUFBTSxNQUFNLElBQUksQ0FBQztBQUMzRCxVQUFNLGtCQUFrQixRQUFRLFNBQVMsSUFBSTtBQUFBLE1BQzVDLFFBQVEsSUFBSSxhQUFXO0FBQUEsUUFDdEIsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPLE9BQU8sUUFBUTtBQUFBLFFBQ3RCLFNBQVM7QUFBQSxRQUNULEtBQUssTUFBTSxLQUFLLGdCQUFnQixlQUFlLE9BQU8sSUFBSSxHQUFJLE9BQU8sYUFBYSxDQUFDLENBQUU7QUFBQSxRQUNyRixPQUFPO0FBQUEsUUFDUCxTQUFTLE9BQU8sV0FBVyxPQUFPO0FBQUEsTUFDbkMsRUFBRTtBQUFBLE1BQ0Y7QUFBQSxRQUFFLGVBQWU7QUFBQTtBQUFBLE1BQW9FO0FBQUEsSUFDdEYsSUFBSTtBQUVKLFdBQU8sYUFBYTtBQUFBLE1BQ25CO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsYUFBYSxTQUFTLFVBQVUsSUFBSTtBQUFBLE1BQ3BDLEdBQUc7QUFBQSxNQUNIO0FBQUEsTUFDQTtBQUFBLE1BRUEsR0FBRztBQUFBLE1BRUgsa0JBQWtCLFVBQVUsSUFBSTtBQUFBLE1BQ2hDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsZUFBZSxXQUErQjtBQUNyRCxRQUFJLENBQUMsV0FBVztBQUNmLGFBQU8sZ0JBQWdCLE1BQVM7QUFBQSxJQUNqQztBQUNBLFdBQU8sb0JBQW9CLEtBQUssbUJBQW1CLG9CQUFvQixNQUFNLEtBQUssbUJBQW1CLGlCQUFpQixTQUFTLENBQUM7QUFBQSxFQUNqSTtBQUNEO0FBbEthLDZCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTtBQW9LYixTQUFTLGFBQWEsU0FBb0I7QUFDekMsU0FBTyxFQUFFLElBQUk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxJQUNYO0FBQUEsRUFDRCxHQUFHLE9BQU87QUFDWDtBQUVBLFNBQVMsT0FBTyxPQUFxQztBQUNwRCxTQUFPLEVBQUUsSUFBSTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ04sT0FBTyxjQUFjLHFCQUFxQjtBQUFBLE1BQzFDLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxNQUNaLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxJQUNiO0FBQUEsRUFDRCxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQ1g7QUFFQSxTQUFTLE9BQU8sT0FPYjtBQUNGLFNBQU8sUUFBUSxFQUFFLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxZQUFZLEVBQUUsSUFBSTtBQUFBLElBQ2pFLE9BQU8sQ0FBQyxzQkFBc0IsTUFBTSxVQUFVLElBQUksT0FBSyxLQUFLLFFBQVEsQ0FBQztBQUFBLElBQ3JFLGNBQWMsTUFBTSxNQUFNLGdCQUFnQixJQUFJO0FBQUEsSUFDOUMsY0FBYyxNQUFNLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxJQUMvQyxTQUFTLE1BQU07QUFBQSxJQUNmLFdBQVcsT0FBSztBQUNmLFVBQUksRUFBRSxRQUFRLFNBQVM7QUFDdEIsY0FBTSxXQUFXO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVO0FBQUEsSUFDVixPQUFPO0FBQUEsTUFDTixjQUFjO0FBQUE7QUFBQSxJQUNmO0FBQUEsRUFDRCxHQUFHO0FBQUEsSUFDRixFQUFFLEtBQUssUUFBUTtBQUFBLE1BQ2QsT0FBTztBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELEdBQUcsQ0FBQyxVQUFVLFlBQVksTUFBTSxJQUFJLElBQUksV0FBVyxNQUFNLElBQUksSUFBSSxNQUFNLEtBQUssSUFBSSxVQUFRLFdBQVcsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzFHLEVBQUUsS0FBSyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDO0FBQUEsSUFDaEMsRUFBRSxJQUFJO0FBQUEsTUFDTCxPQUFPLEVBQUUsWUFBWSxPQUFPO0FBQUEsTUFDNUIsS0FBSyxVQUFRO0FBQ1osY0FBTSxrQkFBa0IsUUFBUSxNQUFNLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxJQUFJO0FBQUEsVUFDdkUsY0FBYztBQUFBLFVBQ2QsR0FBRztBQUFBLFVBQ0gsdUJBQXVCO0FBQUEsVUFDdkIsMkJBQTJCLGNBQWMscUJBQXFCO0FBQUEsVUFDOUQsMkJBQTJCO0FBQUEsVUFDM0IsdUJBQXVCO0FBQUEsVUFDdkIsNkJBQTZCO0FBQUEsUUFDOUIsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVEsTUFBTSxJQUFJLFFBQVEsWUFBVTtBQUNuQywwQkFBZ0IsSUFBSSxNQUFNLFdBQVcsS0FBSyxNQUFNLENBQUM7QUFBQSxRQUNsRCxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDLENBQUM7QUFDSDtBQUdBLFNBQVMsVUFBVSxTQUFvQixTQUE0QjtBQUNsRSxTQUFPLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixHQUFHLENBQUMsWUFBWSxFQUFFLElBQUk7QUFBQSxJQUNwRSxPQUFPLENBQUMsMEJBQTBCO0FBQUEsSUFDbEMsT0FBTztBQUFBLE1BQ04sU0FBUztBQUFBLElBQ1Y7QUFBQSxFQUNELEdBQUc7QUFBQSxJQUNGLEVBQUUsSUFBSTtBQUFBLE1BQ0wsS0FBSyxVQUFRO0FBQ1osY0FBTUEsYUFBWSxRQUFRLE1BQU0sSUFBSSxJQUFJLFVBQVUsTUFBTSxPQUFPLENBQUM7QUFDaEUsUUFBQUEsV0FBVSxLQUFLLFNBQVMsRUFBRSxNQUFNLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFBQSxNQUNyRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQyxDQUFDO0FBQ0g7QUFFQSxTQUFTLFlBQVk7QUFDcEIsU0FBTyxFQUFFLElBQUk7QUFBQSxJQUNaLElBQUk7QUFBQSxJQUNKLE9BQU87QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNOLE9BQU8sY0FBYywwQkFBMEI7QUFBQSxNQUMvQyxTQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0QsR0FBRyxFQUFFLElBQUk7QUFBQSxJQUNSLE9BQU87QUFBQSxNQUNOLGNBQWMsYUFBYSxjQUFjLGlCQUFpQixDQUFDO0FBQUEsSUFDNUQ7QUFBQSxFQUNELENBQUMsQ0FBQztBQUNIOyIsCiAgIm5hbWVzIjogWyJhY3Rpb25CYXIiXQp9Cg==
