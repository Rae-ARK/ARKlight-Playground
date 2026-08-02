var _a, _b, _c, _d, _e, _f, _g, _h;
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { createCancelablePromise, raceCancellation } from "../../../../base/common/async.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { isCodeEditor } from "../../../browser/editorBrowser.js";
import { EditorAction2 } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import * as corePosition from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { isLocationLink } from "../../../common/languages.js";
import { ReferencesController } from "./peek/referencesController.js";
import { ReferencesModel } from "./referencesModel.js";
import { ISymbolNavigationService } from "./symbolNavigation.js";
import { MessageController } from "../../message/browser/messageController.js";
import { PeekContext } from "../../peekView/browser/peekView.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionRevealType, TextEditorSelectionSource } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { getDeclarationsAtPosition, getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition, getTypeDefinitionsAtPosition } from "./goToSymbol.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  submenu: MenuId.EditorContextPeek,
  title: nls.localize("peek.submenu", "Peek"),
  group: "navigation",
  order: 100
});
class SymbolNavigationAnchor {
  constructor(model, position) {
    this.model = model;
    this.position = position;
  }
  static is(thing) {
    if (!thing || typeof thing !== "object") {
      return false;
    }
    if (thing instanceof SymbolNavigationAnchor) {
      return true;
    }
    if (corePosition.Position.isIPosition(thing.position) && thing.model) {
      return true;
    }
    return false;
  }
}
const _SymbolNavigationAction = class _SymbolNavigationAction extends EditorAction2 {
  static all() {
    return _SymbolNavigationAction._allSymbolNavigationCommands.values();
  }
  static _patchConfig(opts) {
    const result = { ...opts, f1: true };
    if (result.menu) {
      for (const item of Iterable.wrap(result.menu)) {
        if (item.id === MenuId.EditorContext || item.id === MenuId.EditorContextPeek) {
          item.when = ContextKeyExpr.and(opts.precondition, item.when);
        }
      }
    }
    return result;
  }
  constructor(configuration, opts) {
    super(_SymbolNavigationAction._patchConfig(opts));
    this.configuration = configuration;
    _SymbolNavigationAction._allSymbolNavigationCommands.set(opts.id, this);
  }
  runEditorCommand(accessor, editor, arg, range) {
    if (!editor.hasModel()) {
      return Promise.resolve(void 0);
    }
    const notificationService = accessor.get(INotificationService);
    const editorService = accessor.get(ICodeEditorService);
    const progressService = accessor.get(IEditorProgressService);
    const symbolNavService = accessor.get(ISymbolNavigationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const instaService = accessor.get(IInstantiationService);
    const model = editor.getModel();
    const position = editor.getPosition();
    const anchor = SymbolNavigationAnchor.is(arg) ? arg : new SymbolNavigationAnchor(model, position);
    const cts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
    const promise = raceCancellation(this._getLocationModel(languageFeaturesService, anchor.model, anchor.position, cts.token), cts.token).then(async (references) => {
      if (!references || cts.token.isCancellationRequested) {
        return;
      }
      alert(references.ariaMessage);
      let altAction;
      if (references.referenceAt(model.uri, position)) {
        const altActionId = this._getAlternativeCommand(editor);
        if (altActionId !== void 0 && !_SymbolNavigationAction._activeAlternativeCommands.has(altActionId) && _SymbolNavigationAction._allSymbolNavigationCommands.has(altActionId)) {
          altAction = _SymbolNavigationAction._allSymbolNavigationCommands.get(altActionId);
        }
      }
      const referenceCount = references.references.length;
      if (referenceCount === 0) {
        if (!this.configuration.muteMessage) {
          const info = model.getWordAtPosition(position);
          MessageController.get(editor)?.showMessage(this._getNoResultFoundMessage(info), position);
        }
      } else if (referenceCount === 1 && altAction) {
        _SymbolNavigationAction._activeAlternativeCommands.add(this.desc.id);
        instaService.invokeFunction((accessor2) => altAction.runEditorCommand(accessor2, editor, arg, range).finally(() => {
          _SymbolNavigationAction._activeAlternativeCommands.delete(this.desc.id);
        }));
      } else {
        return this._onResult(editorService, symbolNavService, editor, references, range);
      }
    }, (err) => {
      notificationService.error(err);
    }).finally(() => {
      cts.dispose();
    });
    progressService.showWhile(promise, 250);
    return promise;
  }
  async _onResult(editorService, symbolNavService, editor, model, range) {
    const gotoLocation = this._getGoToPreference(editor);
    if (!(editor instanceof EmbeddedCodeEditorWidget) && (this.configuration.openInPeek || gotoLocation === "peek" && model.references.length > 1)) {
      this._openInPeek(editor, model, range);
    } else {
      const next = model.firstReference();
      const peek = model.references.length > 1 && gotoLocation === "gotoAndPeek";
      const targetEditor = await this._openReference(editor, editorService, next, this.configuration.openToSide, !peek);
      if (peek && targetEditor) {
        this._openInPeek(targetEditor, model, range);
      } else {
        model.dispose();
      }
      if (gotoLocation === "goto") {
        symbolNavService.put(next);
      }
    }
  }
  async _openReference(editor, editorService, reference, sideBySide, highlight) {
    let range = void 0;
    if (isLocationLink(reference)) {
      range = reference.targetSelectionRange;
    }
    if (!range) {
      range = reference.range;
    }
    if (!range) {
      return void 0;
    }
    const targetEditor = await editorService.openCodeEditor({
      resource: reference.uri,
      options: {
        selection: Range.collapseToStart(range),
        selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
        selectionSource: TextEditorSelectionSource.JUMP
      }
    }, editor, sideBySide);
    if (!targetEditor) {
      return void 0;
    }
    if (highlight) {
      const modelNow = targetEditor.getModel();
      const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: "symbol-navigate-action-highlight", className: "symbolHighlight" } }]);
      setTimeout(() => {
        if (targetEditor.getModel() === modelNow) {
          decorations.clear();
        }
      }, 350);
    }
    return targetEditor;
  }
  _openInPeek(target, model, range) {
    const controller = ReferencesController.get(target);
    if (controller && target.hasModel()) {
      controller.toggleWidget(range ?? target.getSelection(), createCancelablePromise((_) => Promise.resolve(model)), this.configuration.openInPeek);
    } else {
      model.dispose();
    }
  }
};
_SymbolNavigationAction._allSymbolNavigationCommands = /* @__PURE__ */ new Map();
_SymbolNavigationAction._activeAlternativeCommands = /* @__PURE__ */ new Set();
let SymbolNavigationAction = _SymbolNavigationAction;
class DefinitionAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, position, false, token), nls.localize("def.title", "Definitions"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("noResultWord", "No definition found for '{0}'", info.word) : nls.localize("generic.noResults", "No definition found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeDefinitionCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleDefinitions;
  }
}
registerAction2((_a = class extends DefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _a.id,
      title: {
        ...nls.localize2("actions.goToDecl.label", "Go to Definition"),
        mnemonicTitle: nls.localize({ key: "miGotoDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Definition")
      },
      precondition: EditorContextKeys.hasDefinitionProvider,
      keybinding: [{
        when: EditorContextKeys.editorTextFocus,
        primary: KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      }, {
        when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
        primary: KeyMod.CtrlCmd | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      }],
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.1
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 2
      }]
    });
    CommandsRegistry.registerCommandAlias("editor.action.goToDeclaration", _a.id);
  }
}, _a.id = "editor.action.revealDefinition", _a));
registerAction2((_b = class extends DefinitionAction {
  constructor() {
    super({
      openToSide: true,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _b.id,
      title: nls.localize2("actions.goToDeclToSide.label", "Open Definition to the Side"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDefinitionProvider,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: [{
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F12),
        weight: KeybindingWeight.EditorContrib
      }, {
        when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.F12),
        weight: KeybindingWeight.EditorContrib
      }]
    });
    CommandsRegistry.registerCommandAlias("editor.action.openDeclarationToTheSide", _b.id);
  }
}, _b.id = "editor.action.revealDefinitionAside", _b));
registerAction2((_c = class extends DefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: _c.id,
      title: nls.localize2("actions.previewDecl.label", "Peek Definition"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDefinitionProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyCode.F12,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10 },
        weight: KeybindingWeight.EditorContrib
      },
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 2
      }
    });
    CommandsRegistry.registerCommandAlias("editor.action.previewDeclaration", _c.id);
  }
}, _c.id = "editor.action.peekDefinition", _c));
class DeclarationAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, position, false, token), nls.localize("decl.title", "Declarations"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("decl.noResultWord", "No declaration found for '{0}'", info.word) : nls.localize("decl.generic.noResults", "No declaration found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeDeclarationCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleDeclarations;
  }
}
registerAction2((_d = class extends DeclarationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _d.id,
      title: {
        ...nls.localize2("actions.goToDeclaration.label", "Go to Declaration"),
        mnemonicTitle: nls.localize({ key: "miGotoDeclaration", comment: ["&& denotes a mnemonic"] }, "Go to &&Declaration")
      },
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDeclarationProvider,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.3
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 3
      }]
    });
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("decl.noResultWord", "No declaration found for '{0}'", info.word) : nls.localize("decl.generic.noResults", "No declaration found");
  }
}, _d.id = "editor.action.revealDeclaration", _d));
registerAction2(class PeekDeclarationAction extends DeclarationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: "editor.action.peekDeclaration",
      title: nls.localize2("actions.peekDecl.label", "Peek Declaration"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDeclarationProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 3
      }
    });
  }
});
class TypeDefinitionAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, position, false, token), nls.localize("typedef.title", "Type Definitions"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("goToTypeDefinition.noResultWord", "No type definition found for '{0}'", info.word) : nls.localize("goToTypeDefinition.generic.noResults", "No type definition found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeTypeDefinitionCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleTypeDefinitions;
  }
}
registerAction2((_e = class extends TypeDefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _e.ID,
      title: {
        ...nls.localize2("actions.goToTypeDefinition.label", "Go to Type Definition"),
        mnemonicTitle: nls.localize({ key: "miGotoTypeDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Type Definition")
      },
      precondition: EditorContextKeys.hasTypeDefinitionProvider,
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.4
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 3
      }]
    });
  }
}, _e.ID = "editor.action.goToTypeDefinition", _e));
registerAction2((_f = class extends TypeDefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: _f.ID,
      title: nls.localize2("actions.peekTypeDefinition.label", "Peek Type Definition"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasTypeDefinitionProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 4
      }
    });
  }
}, _f.ID = "editor.action.peekTypeDefinition", _f));
class ImplementationAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, position, false, token), nls.localize("impl.title", "Implementations"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("goToImplementation.noResultWord", "No implementation found for '{0}'", info.word) : nls.localize("goToImplementation.generic.noResults", "No implementation found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeImplementationCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleImplementations;
  }
}
registerAction2((_g = class extends ImplementationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _g.ID,
      title: {
        ...nls.localize2("actions.goToImplementation.label", "Go to Implementations"),
        mnemonicTitle: nls.localize({ key: "miGotoImplementation", comment: ["&& denotes a mnemonic"] }, "Go to &&Implementations")
      },
      precondition: EditorContextKeys.hasImplementationProvider,
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.45
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 4
      }]
    });
  }
}, _g.ID = "editor.action.goToImplementation", _g));
registerAction2((_h = class extends ImplementationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: _h.ID,
      title: nls.localize2("actions.peekImplementation.label", "Peek Implementations"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasImplementationProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      },
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 5
      }
    });
  }
}, _h.ID = "editor.action.peekImplementation", _h));
class ReferencesAction extends SymbolNavigationAction {
  _getNoResultFoundMessage(info) {
    return info ? nls.localize("references.no", "No references found for '{0}'", info.word) : nls.localize("references.noGeneric", "No references found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeReferenceCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleReferences;
  }
}
registerAction2(class GoToReferencesAction extends ReferencesAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: "editor.action.goToReferences",
      title: {
        ...nls.localize2("goToReferences.label", "Go to References"),
        mnemonicTitle: nls.localize({ key: "miGotoReference", comment: ["&& denotes a mnemonic"] }, "Go to &&References")
      },
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasReferenceProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Shift | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.45
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 5
      }]
    });
  }
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, true, false, token), nls.localize("ref.title", "References"));
  }
});
registerAction2(class PeekReferencesAction extends ReferencesAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: "editor.action.referenceSearch.trigger",
      title: nls.localize2("references.action.label", "Peek References"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasReferenceProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 6
      }
    });
  }
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, false, false, token), nls.localize("ref.title", "References"));
  }
});
class GenericGoToLocationAction extends SymbolNavigationAction {
  constructor(config, _references, _gotoMultipleBehaviour) {
    super(config, {
      id: "editor.action.goToLocation",
      title: nls.localize2("label.generic", "Go to Any Symbol"),
      precondition: ContextKeyExpr.and(
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      )
    });
    this._references = _references;
    this._gotoMultipleBehaviour = _gotoMultipleBehaviour;
  }
  async _getLocationModel(languageFeaturesService, _model, _position, _token) {
    return new ReferencesModel(this._references, nls.localize("generic.title", "Locations"));
  }
  _getNoResultFoundMessage(info) {
    return info && nls.localize("generic.noResult", "No results for '{0}'", info.word) || "";
  }
  _getGoToPreference(editor) {
    return this._gotoMultipleBehaviour ?? editor.getOption(EditorOption.gotoLocation).multipleReferences;
  }
  _getAlternativeCommand() {
    return void 0;
  }
}
CommandsRegistry.registerCommand({
  id: "editor.action.goToLocations",
  metadata: {
    description: "Go to locations from a position in a file",
    args: [
      { name: "uri", description: "The text document in which to start", constraint: URI },
      { name: "position", description: "The position at which to start", constraint: corePosition.Position.isIPosition },
      { name: "locations", description: "An array of locations.", constraint: Array },
      { name: "multiple", description: "Define what to do when having multiple results, either `peek`, `gotoAndPeek`, or `goto`" },
      { name: "noResultsMessage", description: "Human readable message that shows when locations is empty." }
    ]
  },
  handler: async (accessor, resource, position, references, multiple, noResultsMessage, openInPeek) => {
    assertType(URI.isUri(resource));
    assertType(corePosition.Position.isIPosition(position));
    assertType(Array.isArray(references));
    assertType(typeof multiple === "undefined" || typeof multiple === "string");
    assertType(typeof openInPeek === "undefined" || typeof openInPeek === "boolean");
    const editorService = accessor.get(ICodeEditorService);
    const editor = await editorService.openCodeEditor({ resource }, editorService.getFocusedCodeEditor());
    if (isCodeEditor(editor)) {
      editor.setPosition(position);
      editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
      return editor.invokeWithinContext((accessor2) => {
        const command = new class extends GenericGoToLocationAction {
          _getNoResultFoundMessage(info) {
            return noResultsMessage || super._getNoResultFoundMessage(info);
          }
        }({
          muteMessage: !Boolean(noResultsMessage),
          openInPeek: Boolean(openInPeek),
          openToSide: false
        }, references, multiple);
        accessor2.get(IInstantiationService).invokeFunction(command.run.bind(command), editor);
      });
    }
  }
});
CommandsRegistry.registerCommand({
  id: "editor.action.peekLocations",
  metadata: {
    description: "Peek locations from a position in a file",
    args: [
      { name: "uri", description: "The text document in which to start", constraint: URI },
      { name: "position", description: "The position at which to start", constraint: corePosition.Position.isIPosition },
      { name: "locations", description: "An array of locations.", constraint: Array },
      { name: "multiple", description: "Define what to do when having multiple results, either `peek`, `gotoAndPeek`, or `goto`" }
    ]
  },
  handler: async (accessor, resource, position, references, multiple) => {
    accessor.get(ICommandService).executeCommand("editor.action.goToLocations", resource, position, references, multiple, void 0, true);
  }
});
CommandsRegistry.registerCommand({
  id: "editor.action.findReferences",
  handler: (accessor, resource, position) => {
    assertType(URI.isUri(resource));
    assertType(corePosition.Position.isIPosition(position));
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const codeEditorService = accessor.get(ICodeEditorService);
    return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then((control) => {
      if (!isCodeEditor(control) || !control.hasModel()) {
        return void 0;
      }
      const controller = ReferencesController.get(control);
      if (!controller) {
        return void 0;
      }
      const references = createCancelablePromise((token) => getReferencesAtPosition(languageFeaturesService.referenceProvider, control.getModel(), corePosition.Position.lift(position), false, false, token).then((references2) => new ReferencesModel(references2, nls.localize("ref.title", "References"))));
      const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
      return Promise.resolve(controller.toggleWidget(range, references, false));
    });
  }
});
CommandsRegistry.registerCommandAlias("editor.action.showReferences", "editor.action.peekLocations");
export {
  DefinitionAction,
  SymbolNavigationAction,
  SymbolNavigationAnchor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9nb1RvQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yU3RhdGVGbGFnLCBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yU3RhdGUvYnJvd3Nlci9lZGl0b3JTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24yLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBHb1RvTG9jYXRpb25WYWx1ZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgY29yZVBvc2l0aW9uIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb25MaW5rLCBMb2NhdGlvbiwgTG9jYXRpb25MaW5rIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBSZWZlcmVuY2VzQ29udHJvbGxlciB9IGZyb20gJy4vcGVlay9yZWZlcmVuY2VzQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBSZWZlcmVuY2VzTW9kZWwgfSBmcm9tICcuL3JlZmVyZW5jZXNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU3ltYm9sTmF2aWdhdGlvblNlcnZpY2UgfSBmcm9tICcuL3N5bWJvbE5hdmlnYXRpb24uanMnO1xuaW1wb3J0IHsgTWVzc2FnZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9tZXNzYWdlL2Jyb3dzZXIvbWVzc2FnZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUGVla0NvbnRleHQgfSBmcm9tICcuLi8uLi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbjJGMVJlcXVpcmVkT3B0aW9ucywgSUFjdGlvbjJPcHRpb25zLCBJU3VibWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUsIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBnZXREZWNsYXJhdGlvbnNBdFBvc2l0aW9uLCBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24sIGdldEltcGxlbWVudGF0aW9uc0F0UG9zaXRpb24sIGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uLCBnZXRUeXBlRGVmaW5pdGlvbnNBdFBvc2l0aW9uIH0gZnJvbSAnLi9nb1RvU3ltYm9sLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwge1xuXHRzdWJtZW51OiBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWssXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ3BlZWsuc3VibWVudScsIFwiUGVla1wiKSxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDEwMFxufSBzYXRpc2ZpZXMgSVN1Ym1lbnVJdGVtKTtcblxuZXhwb3J0IGludGVyZmFjZSBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uQ29uZmlnIHtcblx0b3BlblRvU2lkZTogYm9vbGVhbjtcblx0b3BlbkluUGVlazogYm9vbGVhbjtcblx0bXV0ZU1lc3NhZ2U6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBTeW1ib2xOYXZpZ2F0aW9uQW5jaG9yIHtcblxuXHRzdGF0aWMgaXModGhpbmc6IGFueSk6IHRoaW5nIGlzIFN5bWJvbE5hdmlnYXRpb25BbmNob3Ige1xuXHRcdGlmICghdGhpbmcgfHwgdHlwZW9mIHRoaW5nICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpbmcgaW5zdGFuY2VvZiBTeW1ib2xOYXZpZ2F0aW9uQW5jaG9yKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGNvcmVQb3NpdGlvbi5Qb3NpdGlvbi5pc0lQb3NpdGlvbigoPFN5bWJvbE5hdmlnYXRpb25BbmNob3I+dGhpbmcpLnBvc2l0aW9uKSAmJiAoPFN5bWJvbE5hdmlnYXRpb25BbmNob3I+dGhpbmcpLm1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWwsIHJlYWRvbmx5IHBvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24pIHsgfVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU3ltYm9sTmF2aWdhdGlvbkFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdHByaXZhdGUgc3RhdGljIF9hbGxTeW1ib2xOYXZpZ2F0aW9uQ29tbWFuZHMgPSBuZXcgTWFwPHN0cmluZywgU3ltYm9sTmF2aWdhdGlvbkFjdGlvbj4oKTtcblx0cHJpdmF0ZSBzdGF0aWMgX2FjdGl2ZUFsdGVybmF0aXZlQ29tbWFuZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRzdGF0aWMgYWxsKCk6IEl0ZXJhYmxlSXRlcmF0b3I8U3ltYm9sTmF2aWdhdGlvbkFjdGlvbj4ge1xuXHRcdHJldHVybiBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hbGxTeW1ib2xOYXZpZ2F0aW9uQ29tbWFuZHMudmFsdWVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcGF0Y2hDb25maWcob3B0czogSUFjdGlvbjJPcHRpb25zICYgSUFjdGlvbjJGMVJlcXVpcmVkT3B0aW9ucyk6IElBY3Rpb24yT3B0aW9ucyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0geyAuLi5vcHRzLCBmMTogdHJ1ZSB9O1xuXHRcdC8vIHBhdGNoIGNvbnRleHQgbWVudSB3aGVuIGNsYXVzZVxuXHRcdGlmIChyZXN1bHQubWVudSkge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIEl0ZXJhYmxlLndyYXAocmVzdWx0Lm1lbnUpKSB7XG5cdFx0XHRcdGlmIChpdGVtLmlkID09PSBNZW51SWQuRWRpdG9yQ29udGV4dCB8fCBpdGVtLmlkID09PSBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWspIHtcblx0XHRcdFx0XHRpdGVtLndoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQob3B0cy5wcmVjb25kaXRpb24sIGl0ZW0ud2hlbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIDx0eXBlb2Ygb3B0cz5yZXN1bHQ7XG5cdH1cblxuXHRyZWFkb25seSBjb25maWd1cmF0aW9uOiBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uQ29uZmlnO1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZ3VyYXRpb246IFN5bWJvbE5hdmlnYXRpb25BY3Rpb25Db25maWcsIG9wdHM6IElBY3Rpb24yT3B0aW9ucyAmIElBY3Rpb24yRjFSZXF1aXJlZE9wdGlvbnMpIHtcblx0XHRzdXBlcihTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9wYXRjaENvbmZpZyhvcHRzKSk7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uID0gY29uZmlndXJhdGlvbjtcblx0XHRTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hbGxTeW1ib2xOYXZpZ2F0aW9uQ29tbWFuZHMuc2V0KG9wdHMuaWQsIHRoaXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnPzogU3ltYm9sTmF2aWdhdGlvbkFuY2hvciB8IHVua25vd24sIHJhbmdlPzogUmFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclByb2dyZXNzU2VydmljZSk7XG5cdFx0Y29uc3Qgc3ltYm9sTmF2U2VydmljZSA9IGFjY2Vzc29yLmdldChJU3ltYm9sTmF2aWdhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgYW5jaG9yID0gU3ltYm9sTmF2aWdhdGlvbkFuY2hvci5pcyhhcmcpID8gYXJnIDogbmV3IFN5bWJvbE5hdmlnYXRpb25BbmNob3IobW9kZWwsIHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlKGVkaXRvciwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSB8IENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHJhY2VDYW5jZWxsYXRpb24odGhpcy5fZ2V0TG9jYXRpb25Nb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgYW5jaG9yLm1vZGVsLCBhbmNob3IucG9zaXRpb24sIGN0cy50b2tlbiksIGN0cy50b2tlbikudGhlbihhc3luYyByZWZlcmVuY2VzID0+IHtcblxuXHRcdFx0aWYgKCFyZWZlcmVuY2VzIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGFsZXJ0KHJlZmVyZW5jZXMuYXJpYU1lc3NhZ2UpO1xuXG5cdFx0XHRsZXQgYWx0QWN0aW9uOiBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyZWZlcmVuY2VzLnJlZmVyZW5jZUF0KG1vZGVsLnVyaSwgcG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGFsdEFjdGlvbklkID0gdGhpcy5fZ2V0QWx0ZXJuYXRpdmVDb21tYW5kKGVkaXRvcik7XG5cdFx0XHRcdGlmIChhbHRBY3Rpb25JZCAhPT0gdW5kZWZpbmVkICYmICFTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hY3RpdmVBbHRlcm5hdGl2ZUNvbW1hbmRzLmhhcyhhbHRBY3Rpb25JZCkgJiYgU3ltYm9sTmF2aWdhdGlvbkFjdGlvbi5fYWxsU3ltYm9sTmF2aWdhdGlvbkNvbW1hbmRzLmhhcyhhbHRBY3Rpb25JZCkpIHtcblx0XHRcdFx0XHRhbHRBY3Rpb24gPSBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hbGxTeW1ib2xOYXZpZ2F0aW9uQ29tbWFuZHMuZ2V0KGFsdEFjdGlvbklkKSE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVmZXJlbmNlQ291bnQgPSByZWZlcmVuY2VzLnJlZmVyZW5jZXMubGVuZ3RoO1xuXG5cdFx0XHRpZiAocmVmZXJlbmNlQ291bnQgPT09IDApIHtcblx0XHRcdFx0Ly8gbm8gcmVzdWx0IC0+IHNob3cgbWVzc2FnZVxuXHRcdFx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvbi5tdXRlTWVzc2FnZSkge1xuXHRcdFx0XHRcdGNvbnN0IGluZm8gPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnNob3dNZXNzYWdlKHRoaXMuX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm8pLCBwb3NpdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocmVmZXJlbmNlQ291bnQgPT09IDEgJiYgYWx0QWN0aW9uKSB7XG5cdFx0XHRcdC8vIGFscmVhZHkgYXQgdGhlIG9ubHkgcmVzdWx0LCBydW4gYWx0ZXJuYXRpdmVcblx0XHRcdFx0U3ltYm9sTmF2aWdhdGlvbkFjdGlvbi5fYWN0aXZlQWx0ZXJuYXRpdmVDb21tYW5kcy5hZGQodGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0aW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4gYWx0QWN0aW9uLnJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3IsIGVkaXRvciwgYXJnLCByYW5nZSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0U3ltYm9sTmF2aWdhdGlvbkFjdGlvbi5fYWN0aXZlQWx0ZXJuYXRpdmVDb21tYW5kcy5kZWxldGUodGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBub3JtYWwgcmVzdWx0cyBoYW5kbGluZ1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fb25SZXN1bHQoZWRpdG9yU2VydmljZSwgc3ltYm9sTmF2U2VydmljZSwgZWRpdG9yLCByZWZlcmVuY2VzLCByYW5nZSk7XG5cdFx0XHR9XG5cblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHQvLyByZXBvcnQgYW4gZXJyb3Jcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRwcm9ncmVzc1NlcnZpY2Uuc2hvd1doaWxlKHByb21pc2UsIDI1MCk7XG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldExvY2F0aW9uTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsIHwgdW5kZWZpbmVkPjtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm86IElXb3JkQXRQb3NpdGlvbiB8IG51bGwpOiBzdHJpbmc7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldEdvVG9QcmVmZXJlbmNlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBHb1RvTG9jYXRpb25WYWx1ZXM7XG5cblx0cHJpdmF0ZSBhc3luYyBfb25SZXN1bHQoZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLCBzeW1ib2xOYXZTZXJ2aWNlOiBJU3ltYm9sTmF2aWdhdGlvblNlcnZpY2UsIGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsIG1vZGVsOiBSZWZlcmVuY2VzTW9kZWwsIHJhbmdlPzogUmFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGdvdG9Mb2NhdGlvbiA9IHRoaXMuX2dldEdvVG9QcmVmZXJlbmNlKGVkaXRvcik7XG5cdFx0aWYgKCEoZWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0KSAmJiAodGhpcy5jb25maWd1cmF0aW9uLm9wZW5JblBlZWsgfHwgKGdvdG9Mb2NhdGlvbiA9PT0gJ3BlZWsnICYmIG1vZGVsLnJlZmVyZW5jZXMubGVuZ3RoID4gMSkpKSB7XG5cdFx0XHR0aGlzLl9vcGVuSW5QZWVrKGVkaXRvciwgbW9kZWwsIHJhbmdlKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gbW9kZWwuZmlyc3RSZWZlcmVuY2UoKSE7XG5cdFx0XHRjb25zdCBwZWVrID0gbW9kZWwucmVmZXJlbmNlcy5sZW5ndGggPiAxICYmIGdvdG9Mb2NhdGlvbiA9PT0gJ2dvdG9BbmRQZWVrJztcblx0XHRcdGNvbnN0IHRhcmdldEVkaXRvciA9IGF3YWl0IHRoaXMuX29wZW5SZWZlcmVuY2UoZWRpdG9yLCBlZGl0b3JTZXJ2aWNlLCBuZXh0LCB0aGlzLmNvbmZpZ3VyYXRpb24ub3BlblRvU2lkZSwgIXBlZWspO1xuXHRcdFx0aWYgKHBlZWsgJiYgdGFyZ2V0RWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuX29wZW5JblBlZWsodGFyZ2V0RWRpdG9yLCBtb2RlbCwgcmFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBrZWVwIHJlbWFpbmluZyBsb2NhdGlvbnMgYXJvdW5kIHdoZW4gdXNpbmdcblx0XHRcdC8vICdnb3RvJy1tb2RlXG5cdFx0XHRpZiAoZ290b0xvY2F0aW9uID09PSAnZ290bycpIHtcblx0XHRcdFx0c3ltYm9sTmF2U2VydmljZS5wdXQobmV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlblJlZmVyZW5jZShlZGl0b3I6IElDb2RlRWRpdG9yLCBlZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsIHJlZmVyZW5jZTogTG9jYXRpb24gfCBMb2NhdGlvbkxpbmssIHNpZGVCeVNpZGU6IGJvb2xlYW4sIGhpZ2hsaWdodDogYm9vbGVhbik6IFByb21pc2U8SUNvZGVFZGl0b3IgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyByYW5nZSBpcyB0aGUgdGFyZ2V0LXNlbGVjdGlvbi1yYW5nZSB3aGVuIHdlIGhhdmUgb25lXG5cdFx0Ly8gYW5kIHRoZSBmYWxsYmFjayBpcyB0aGUgJ2Z1bGwnIHJhbmdlXG5cdFx0bGV0IHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzTG9jYXRpb25MaW5rKHJlZmVyZW5jZSkpIHtcblx0XHRcdHJhbmdlID0gcmVmZXJlbmNlLnRhcmdldFNlbGVjdGlvblJhbmdlO1xuXHRcdH1cblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyYW5nZSA9IHJlZmVyZW5jZS5yYW5nZTtcblx0XHR9XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRFZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiByZWZlcmVuY2UudXJpLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRzZWxlY3Rpb246IFJhbmdlLmNvbGxhcHNlVG9TdGFydChyYW5nZSksXG5cdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLk5lYXJUb3BJZk91dHNpZGVWaWV3cG9ydCxcblx0XHRcdFx0c2VsZWN0aW9uU291cmNlOiBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLkpVTVBcblx0XHRcdH1cblx0XHR9LCBlZGl0b3IsIHNpZGVCeVNpZGUpO1xuXG5cdFx0aWYgKCF0YXJnZXRFZGl0b3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGhpZ2hsaWdodCkge1xuXHRcdFx0Y29uc3QgbW9kZWxOb3cgPSB0YXJnZXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGFyZ2V0RWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbihbeyByYW5nZSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3N5bWJvbC1uYXZpZ2F0ZS1hY3Rpb24taGlnaGxpZ2h0JywgY2xhc3NOYW1lOiAnc3ltYm9sSGlnaGxpZ2h0JyB9IH1dKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGFyZ2V0RWRpdG9yLmdldE1vZGVsKCkgPT09IG1vZGVsTm93KSB7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMzUwKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGFyZ2V0RWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3BlbkluUGVlayh0YXJnZXQ6IElDb2RlRWRpdG9yLCBtb2RlbDogUmVmZXJlbmNlc01vZGVsLCByYW5nZT86IFJhbmdlKSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFJlZmVyZW5jZXNDb250cm9sbGVyLmdldCh0YXJnZXQpO1xuXHRcdGlmIChjb250cm9sbGVyICYmIHRhcmdldC5oYXNNb2RlbCgpKSB7XG5cdFx0XHRjb250cm9sbGVyLnRvZ2dsZVdpZGdldChyYW5nZSA/PyB0YXJnZXQuZ2V0U2VsZWN0aW9uKCksIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKF8gPT4gUHJvbWlzZS5yZXNvbHZlKG1vZGVsKSksIHRoaXMuY29uZmlndXJhdGlvbi5vcGVuSW5QZWVrKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG4vLyNyZWdpb24gLS0tIERFRklOSVRJT05cblxuZXhwb3J0IGNsYXNzIERlZmluaXRpb25BY3Rpb24gZXh0ZW5kcyBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIHtcblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsPiB7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwoYXdhaXQgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlciwgbW9kZWwsIHBvc2l0aW9uLCBmYWxzZSwgdG9rZW4pLCBubHMubG9jYWxpemUoJ2RlZi50aXRsZScsICdEZWZpbml0aW9ucycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbzogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGluZm8gJiYgaW5mby53b3JkXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnbm9SZXN1bHRXb3JkJywgXCJObyBkZWZpbml0aW9uIGZvdW5kIGZvciAnezB9J1wiLCBpbmZvLndvcmQpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZ2VuZXJpYy5ub1Jlc3VsdHMnLCBcIk5vIGRlZmluaXRpb24gZm91bmRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEFsdGVybmF0aXZlQ29tbWFuZChlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5hbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRHb1RvUHJlZmVyZW5jZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogR29Ub0xvY2F0aW9uVmFsdWVzIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5tdWx0aXBsZURlZmluaXRpb25zO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvRGVmaW5pdGlvbkFjdGlvbiBleHRlbmRzIERlZmluaXRpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdlZGl0b3IuYWN0aW9uLnJldmVhbERlZmluaXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogZmFsc2UsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogR29Ub0RlZmluaXRpb25BY3Rpb24uaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdhY3Rpb25zLmdvVG9EZWNsLmxhYmVsJywgXCJHbyB0byBEZWZpbml0aW9uXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9EZWZpbml0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmRGVmaW5pdGlvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhhc0RlZmluaXRpb25Qcm92aWRlcixcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5GMTIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIElzV2ViQ29udGV4dCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GMTIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuMVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJHb01lbnUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogbnVsbCxcblx0XHRcdFx0Z3JvdXA6ICc0X3N5bWJvbF9uYXYnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1dXG5cdFx0fSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnZWRpdG9yLmFjdGlvbi5nb1RvRGVjbGFyYXRpb24nLCBHb1RvRGVmaW5pdGlvbkFjdGlvbi5pZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlbkRlZmluaXRpb25Ub1NpZGVBY3Rpb24gZXh0ZW5kcyBEZWZpbml0aW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnZWRpdG9yLmFjdGlvbi5yZXZlYWxEZWZpbml0aW9uQXNpZGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IHRydWUsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBPcGVuRGVmaW5pdGlvblRvU2lkZUFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLmdvVG9EZWNsVG9TaWRlLmxhYmVsJywgXCJPcGVuIERlZmluaXRpb24gdG8gdGhlIFNpZGVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKCkpLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5GMTIpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBJc1dlYkNvbnRleHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkYxMiksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2VkaXRvci5hY3Rpb24ub3BlbkRlY2xhcmF0aW9uVG9UaGVTaWRlJywgT3BlbkRlZmluaXRpb25Ub1NpZGVBY3Rpb24uaWQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFBlZWtEZWZpbml0aW9uQWN0aW9uIGV4dGVuZHMgRGVmaW5pdGlvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2VkaXRvci5hY3Rpb24ucGVla0RlZmluaXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogdHJ1ZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBQZWVrRGVmaW5pdGlvbkFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLnByZXZpZXdEZWNsLmxhYmVsJywgXCJQZWVrIERlZmluaXRpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRQZWVrQ29udGV4dC5ub3RJblBlZWtFZGl0b3IsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMTIsXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GMTAgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWssXG5cdFx0XHRcdGdyb3VwOiAncGVlaycsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnZWRpdG9yLmFjdGlvbi5wcmV2aWV3RGVjbGFyYXRpb24nLCBQZWVrRGVmaW5pdGlvbkFjdGlvbi5pZCk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIC0tLSBERUNMQVJBVElPTlxuXG5jbGFzcyBEZWNsYXJhdGlvbkFjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0TG9jYXRpb25Nb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZWZlcmVuY2VzTW9kZWw+IHtcblx0XHRyZXR1cm4gbmV3IFJlZmVyZW5jZXNNb2RlbChhd2FpdCBnZXREZWNsYXJhdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlY2xhcmF0aW9uUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgZmFsc2UsIHRva2VuKSwgbmxzLmxvY2FsaXplKCdkZWNsLnRpdGxlJywgJ0RlY2xhcmF0aW9ucycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbzogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGluZm8gJiYgaW5mby53b3JkXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnZGVjbC5ub1Jlc3VsdFdvcmQnLCBcIk5vIGRlY2xhcmF0aW9uIGZvdW5kIGZvciAnezB9J1wiLCBpbmZvLndvcmQpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZGVjbC5nZW5lcmljLm5vUmVzdWx0cycsIFwiTm8gZGVjbGFyYXRpb24gZm91bmRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEFsdGVybmF0aXZlQ29tbWFuZChlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5hbHRlcm5hdGl2ZURlY2xhcmF0aW9uQ29tbWFuZDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0R29Ub1ByZWZlcmVuY2UoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IEdvVG9Mb2NhdGlvblZhbHVlcyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikubXVsdGlwbGVEZWNsYXJhdGlvbnM7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9EZWNsYXJhdGlvbkFjdGlvbiBleHRlbmRzIERlY2xhcmF0aW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnZWRpdG9yLmFjdGlvbi5yZXZlYWxEZWNsYXJhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBHb1RvRGVjbGFyYXRpb25BY3Rpb24uaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdhY3Rpb25zLmdvVG9EZWNsYXJhdGlvbi5sYWJlbCcsIFwiR28gdG8gRGVjbGFyYXRpb25cIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b0RlY2xhcmF0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmRGVjbGFyYXRpb25cIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc0RlY2xhcmF0aW9uUHJvdmlkZXIsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuM1xuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJHb01lbnUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogbnVsbCxcblx0XHRcdFx0Z3JvdXA6ICc0X3N5bWJvbF9uYXYnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvOiBJV29yZEF0UG9zaXRpb24gfCBudWxsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5mbyAmJiBpbmZvLndvcmRcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdkZWNsLm5vUmVzdWx0V29yZCcsIFwiTm8gZGVjbGFyYXRpb24gZm91bmQgZm9yICd7MH0nXCIsIGluZm8ud29yZClcblx0XHRcdDogbmxzLmxvY2FsaXplKCdkZWNsLmdlbmVyaWMubm9SZXN1bHRzJywgXCJObyBkZWNsYXJhdGlvbiBmb3VuZFwiKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQZWVrRGVjbGFyYXRpb25BY3Rpb24gZXh0ZW5kcyBEZWNsYXJhdGlvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogdHJ1ZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5wZWVrRGVjbGFyYXRpb24nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMucGVla0RlY2wubGFiZWwnLCBcIlBlZWsgRGVjbGFyYXRpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzRGVjbGFyYXRpb25Qcm92aWRlcixcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWssXG5cdFx0XHRcdGdyb3VwOiAncGVlaycsXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIC0tLSBUWVBFIERFRklOSVRJT05cblxuY2xhc3MgVHlwZURlZmluaXRpb25BY3Rpb24gZXh0ZW5kcyBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIHtcblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsPiB7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwoYXdhaXQgZ2V0VHlwZURlZmluaXRpb25zQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS50eXBlRGVmaW5pdGlvblByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIGZhbHNlLCB0b2tlbiksIG5scy5sb2NhbGl6ZSgndHlwZWRlZi50aXRsZScsICdUeXBlIERlZmluaXRpb25zJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvOiBJV29yZEF0UG9zaXRpb24gfCBudWxsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5mbyAmJiBpbmZvLndvcmRcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdnb1RvVHlwZURlZmluaXRpb24ubm9SZXN1bHRXb3JkJywgXCJObyB0eXBlIGRlZmluaXRpb24gZm91bmQgZm9yICd7MH0nXCIsIGluZm8ud29yZClcblx0XHRcdDogbmxzLmxvY2FsaXplKCdnb1RvVHlwZURlZmluaXRpb24uZ2VuZXJpYy5ub1Jlc3VsdHMnLCBcIk5vIHR5cGUgZGVmaW5pdGlvbiBmb3VuZFwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QWx0ZXJuYXRpdmVDb21tYW5kKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLmFsdGVybmF0aXZlVHlwZURlZmluaXRpb25Db21tYW5kO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRHb1RvUHJlZmVyZW5jZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogR29Ub0xvY2F0aW9uVmFsdWVzIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5tdWx0aXBsZVR5cGVEZWZpbml0aW9ucztcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR29Ub1R5cGVEZWZpbml0aW9uQWN0aW9uIGV4dGVuZHMgVHlwZURlZmluaXRpb25BY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi5nb1RvVHlwZURlZmluaXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogZmFsc2UsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogR29Ub1R5cGVEZWZpbml0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubmxzLmxvY2FsaXplMignYWN0aW9ucy5nb1RvVHlwZURlZmluaXRpb24ubGFiZWwnLCBcIkdvIHRvIFR5cGUgRGVmaW5pdGlvblwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvVHlwZURlZmluaXRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR28gdG8gJiZUeXBlIERlZmluaXRpb25cIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5oYXNUeXBlRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS40XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckdvTWVudSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBudWxsLFxuXHRcdFx0XHRncm91cDogJzRfc3ltYm9sX25hdicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQZWVrVHlwZURlZmluaXRpb25BY3Rpb24gZXh0ZW5kcyBUeXBlRGVmaW5pdGlvbkFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLnBlZWtUeXBlRGVmaW5pdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiB0cnVlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFBlZWtUeXBlRGVmaW5pdGlvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLnBlZWtUeXBlRGVmaW5pdGlvbi5sYWJlbCcsIFwiUGVlayBUeXBlIERlZmluaXRpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzVHlwZURlZmluaXRpb25Qcm92aWRlcixcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWssXG5cdFx0XHRcdGdyb3VwOiAncGVlaycsXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIC0tLSBJTVBMRU1FTlRBVElPTlxuXG5jbGFzcyBJbXBsZW1lbnRhdGlvbkFjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0TG9jYXRpb25Nb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZWZlcmVuY2VzTW9kZWw+IHtcblx0XHRyZXR1cm4gbmV3IFJlZmVyZW5jZXNNb2RlbChhd2FpdCBnZXRJbXBsZW1lbnRhdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmltcGxlbWVudGF0aW9uUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgZmFsc2UsIHRva2VuKSwgbmxzLmxvY2FsaXplKCdpbXBsLnRpdGxlJywgJ0ltcGxlbWVudGF0aW9ucycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbzogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGluZm8gJiYgaW5mby53b3JkXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnZ29Ub0ltcGxlbWVudGF0aW9uLm5vUmVzdWx0V29yZCcsIFwiTm8gaW1wbGVtZW50YXRpb24gZm91bmQgZm9yICd7MH0nXCIsIGluZm8ud29yZClcblx0XHRcdDogbmxzLmxvY2FsaXplKCdnb1RvSW1wbGVtZW50YXRpb24uZ2VuZXJpYy5ub1Jlc3VsdHMnLCBcIk5vIGltcGxlbWVudGF0aW9uIGZvdW5kXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikuYWx0ZXJuYXRpdmVJbXBsZW1lbnRhdGlvbkNvbW1hbmQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEdvVG9QcmVmZXJlbmNlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBHb1RvTG9jYXRpb25WYWx1ZXMge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLm11bHRpcGxlSW1wbGVtZW50YXRpb25zO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvSW1wbGVtZW50YXRpb25BY3Rpb24gZXh0ZW5kcyBJbXBsZW1lbnRhdGlvbkFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLmdvVG9JbXBsZW1lbnRhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBHb1RvSW1wbGVtZW50YXRpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdhY3Rpb25zLmdvVG9JbXBsZW1lbnRhdGlvbi5sYWJlbCcsIFwiR28gdG8gSW1wbGVtZW50YXRpb25zXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9JbXBsZW1lbnRhdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJkltcGxlbWVudGF0aW9uc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhhc0ltcGxlbWVudGF0aW9uUHJvdmlkZXIsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkYxMixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLjQ1XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckdvTWVudSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBudWxsLFxuXHRcdFx0XHRncm91cDogJzRfc3ltYm9sX25hdicsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQZWVrSW1wbGVtZW50YXRpb25BY3Rpb24gZXh0ZW5kcyBJbXBsZW1lbnRhdGlvbkFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLnBlZWtJbXBsZW1lbnRhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiB0cnVlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFBlZWtJbXBsZW1lbnRhdGlvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLnBlZWtJbXBsZW1lbnRhdGlvbi5sYWJlbCcsIFwiUGVlayBJbXBsZW1lbnRhdGlvbnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzSW1wbGVtZW50YXRpb25Qcm92aWRlcixcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYxMixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWssXG5cdFx0XHRcdGdyb3VwOiAncGVlaycsXG5cdFx0XHRcdG9yZGVyOiA1XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIC0tLSBSRUZFUkVOQ0VTXG5cbmFic3RyYWN0IGNsYXNzIFJlZmVyZW5jZXNBY3Rpb24gZXh0ZW5kcyBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIHtcblxuXHRwcm90ZWN0ZWQgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm86IElXb3JkQXRQb3NpdGlvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRcdHJldHVybiBpbmZvXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgncmVmZXJlbmNlcy5ubycsIFwiTm8gcmVmZXJlbmNlcyBmb3VuZCBmb3IgJ3swfSdcIiwgaW5mby53b3JkKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ3JlZmVyZW5jZXMubm9HZW5lcmljJywgXCJObyByZWZlcmVuY2VzIGZvdW5kXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikuYWx0ZXJuYXRpdmVSZWZlcmVuY2VDb21tYW5kO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRHb1RvUHJlZmVyZW5jZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogR29Ub0xvY2F0aW9uVmFsdWVzIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5tdWx0aXBsZVJlZmVyZW5jZXM7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9SZWZlcmVuY2VzQWN0aW9uIGV4dGVuZHMgUmVmZXJlbmNlc0FjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5nb1RvUmVmZXJlbmNlcycsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdnb1RvUmVmZXJlbmNlcy5sYWJlbCcsIFwiR28gdG8gUmVmZXJlbmNlc1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvUmVmZXJlbmNlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmUmVmZXJlbmNlc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzUmVmZXJlbmNlUHJvdmlkZXIsXG5cdFx0XHRcdFBlZWtDb250ZXh0Lm5vdEluUGVla0VkaXRvcixcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLnRvTmVnYXRlZCgpXG5cdFx0XHQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjEyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuNDVcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyR29NZW51LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IG51bGwsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRMb2NhdGlvbk1vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogY29yZVBvc2l0aW9uLlBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbD4ge1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKGF3YWl0IGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIHRydWUsIGZhbHNlLCB0b2tlbiksIG5scy5sb2NhbGl6ZSgncmVmLnRpdGxlJywgJ1JlZmVyZW5jZXMnKSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUGVla1JlZmVyZW5jZXNBY3Rpb24gZXh0ZW5kcyBSZWZlcmVuY2VzQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IHRydWUsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVmZXJlbmNlU2VhcmNoLnRyaWdnZXInLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JlZmVyZW5jZXMuYWN0aW9uLmxhYmVsJywgXCJQZWVrIFJlZmVyZW5jZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzUmVmZXJlbmNlUHJvdmlkZXIsXG5cdFx0XHRcdFBlZWtDb250ZXh0Lm5vdEluUGVla0VkaXRvcixcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLnRvTmVnYXRlZCgpXG5cdFx0XHQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHRQZWVrLFxuXHRcdFx0XHRncm91cDogJ3BlZWsnLFxuXHRcdFx0XHRvcmRlcjogNlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRMb2NhdGlvbk1vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogY29yZVBvc2l0aW9uLlBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbD4ge1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKGF3YWl0IGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIGZhbHNlLCBmYWxzZSwgdG9rZW4pLCBubHMubG9jYWxpemUoJ3JlZi50aXRsZScsICdSZWZlcmVuY2VzJykpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cblxuLy8jcmVnaW9uIC0tLSBHRU5FUklDIGdvdG8gc3ltYm9scyBjb21tYW5kXG5cbmNsYXNzIEdlbmVyaWNHb1RvTG9jYXRpb25BY3Rpb24gZXh0ZW5kcyBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWc6IFN5bWJvbE5hdmlnYXRpb25BY3Rpb25Db25maWcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVmZXJlbmNlczogTG9jYXRpb25bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nb3RvTXVsdGlwbGVCZWhhdmlvdXI6IEdvVG9Mb2NhdGlvblZhbHVlcyB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoY29uZmlnLCB7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZ29Ub0xvY2F0aW9uJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdsYWJlbC5nZW5lcmljJywgXCJHbyB0byBBbnkgU3ltYm9sXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFBlZWtDb250ZXh0Lm5vdEluUGVla0VkaXRvcixcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLnRvTmVnYXRlZCgpXG5cdFx0XHQpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRMb2NhdGlvbk1vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKHRoaXMuX3JlZmVyZW5jZXMsIG5scy5sb2NhbGl6ZSgnZ2VuZXJpYy50aXRsZScsICdMb2NhdGlvbnMnKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm86IElXb3JkQXRQb3NpdGlvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRcdHJldHVybiBpbmZvICYmIG5scy5sb2NhbGl6ZSgnZ2VuZXJpYy5ub1Jlc3VsdCcsIFwiTm8gcmVzdWx0cyBmb3IgJ3swfSdcIiwgaW5mby53b3JkKSB8fCAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0R29Ub1ByZWZlcmVuY2UoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IEdvVG9Mb2NhdGlvblZhbHVlcyB7XG5cdFx0cmV0dXJuIHRoaXMuX2dvdG9NdWx0aXBsZUJlaGF2aW91ciA/PyBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLm11bHRpcGxlUmVmZXJlbmNlcztcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QWx0ZXJuYXRpdmVDb21tYW5kKCk6IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnZWRpdG9yLmFjdGlvbi5nb1RvTG9jYXRpb25zJyxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogJ0dvIHRvIGxvY2F0aW9ucyBmcm9tIGEgcG9zaXRpb24gaW4gYSBmaWxlJyxcblx0XHRhcmdzOiBbXG5cdFx0XHR7IG5hbWU6ICd1cmknLCBkZXNjcmlwdGlvbjogJ1RoZSB0ZXh0IGRvY3VtZW50IGluIHdoaWNoIHRvIHN0YXJ0JywgY29uc3RyYWludDogVVJJIH0sXG5cdFx0XHR7IG5hbWU6ICdwb3NpdGlvbicsIGRlc2NyaXB0aW9uOiAnVGhlIHBvc2l0aW9uIGF0IHdoaWNoIHRvIHN0YXJ0JywgY29uc3RyYWludDogY29yZVBvc2l0aW9uLlBvc2l0aW9uLmlzSVBvc2l0aW9uIH0sXG5cdFx0XHR7IG5hbWU6ICdsb2NhdGlvbnMnLCBkZXNjcmlwdGlvbjogJ0FuIGFycmF5IG9mIGxvY2F0aW9ucy4nLCBjb25zdHJhaW50OiBBcnJheSB9LFxuXHRcdFx0eyBuYW1lOiAnbXVsdGlwbGUnLCBkZXNjcmlwdGlvbjogJ0RlZmluZSB3aGF0IHRvIGRvIHdoZW4gaGF2aW5nIG11bHRpcGxlIHJlc3VsdHMsIGVpdGhlciBgcGVla2AsIGBnb3RvQW5kUGVla2AsIG9yIGBnb3RvYCcgfSxcblx0XHRcdHsgbmFtZTogJ25vUmVzdWx0c01lc3NhZ2UnLCBkZXNjcmlwdGlvbjogJ0h1bWFuIHJlYWRhYmxlIG1lc3NhZ2UgdGhhdCBzaG93cyB3aGVuIGxvY2F0aW9ucyBpcyBlbXB0eS4nIH0sXG5cdFx0XVxuXHR9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiBhbnksIHBvc2l0aW9uOiBhbnksIHJlZmVyZW5jZXM6IGFueSwgbXVsdGlwbGU/OiBhbnksIG5vUmVzdWx0c01lc3NhZ2U/OiBzdHJpbmcsIG9wZW5JblBlZWs/OiBib29sZWFuKSA9PiB7XG5cdFx0YXNzZXJ0VHlwZShVUkkuaXNVcmkocmVzb3VyY2UpKTtcblx0XHRhc3NlcnRUeXBlKGNvcmVQb3NpdGlvbi5Qb3NpdGlvbi5pc0lQb3NpdGlvbihwb3NpdGlvbikpO1xuXHRcdGFzc2VydFR5cGUoQXJyYXkuaXNBcnJheShyZWZlcmVuY2VzKSk7XG5cdFx0YXNzZXJ0VHlwZSh0eXBlb2YgbXVsdGlwbGUgPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBtdWx0aXBsZSA9PT0gJ3N0cmluZycpO1xuXHRcdGFzc2VydFR5cGUodHlwZW9mIG9wZW5JblBlZWsgPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBvcGVuSW5QZWVrID09PSAnYm9vbGVhbicpO1xuXG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3IoeyByZXNvdXJjZSB9LCBlZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkpO1xuXG5cdFx0aWYgKGlzQ29kZUVkaXRvcihlZGl0b3IpKSB7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0ZWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChwb3NpdGlvbiwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXG5cdFx0XHRyZXR1cm4gZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gbmV3IGNsYXNzIGV4dGVuZHMgR2VuZXJpY0dvVG9Mb2NhdGlvbkFjdGlvbiB7XG5cdFx0XHRcdFx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvOiBJV29yZEF0UG9zaXRpb24gfCBudWxsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbm9SZXN1bHRzTWVzc2FnZSB8fCBzdXBlci5fZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KHtcblx0XHRcdFx0XHRtdXRlTWVzc2FnZTogIUJvb2xlYW4obm9SZXN1bHRzTWVzc2FnZSksXG5cdFx0XHRcdFx0b3BlbkluUGVlazogQm9vbGVhbihvcGVuSW5QZWVrKSxcblx0XHRcdFx0XHRvcGVuVG9TaWRlOiBmYWxzZVxuXHRcdFx0XHR9LCByZWZlcmVuY2VzLCBtdWx0aXBsZSBhcyBHb1RvTG9jYXRpb25WYWx1ZXMpO1xuXG5cdFx0XHRcdGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmludm9rZUZ1bmN0aW9uKGNvbW1hbmQucnVuLmJpbmQoY29tbWFuZCksIGVkaXRvcik7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnZWRpdG9yLmFjdGlvbi5wZWVrTG9jYXRpb25zJyxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogJ1BlZWsgbG9jYXRpb25zIGZyb20gYSBwb3NpdGlvbiBpbiBhIGZpbGUnLFxuXHRcdGFyZ3M6IFtcblx0XHRcdHsgbmFtZTogJ3VyaScsIGRlc2NyaXB0aW9uOiAnVGhlIHRleHQgZG9jdW1lbnQgaW4gd2hpY2ggdG8gc3RhcnQnLCBjb25zdHJhaW50OiBVUkkgfSxcblx0XHRcdHsgbmFtZTogJ3Bvc2l0aW9uJywgZGVzY3JpcHRpb246ICdUaGUgcG9zaXRpb24gYXQgd2hpY2ggdG8gc3RhcnQnLCBjb25zdHJhaW50OiBjb3JlUG9zaXRpb24uUG9zaXRpb24uaXNJUG9zaXRpb24gfSxcblx0XHRcdHsgbmFtZTogJ2xvY2F0aW9ucycsIGRlc2NyaXB0aW9uOiAnQW4gYXJyYXkgb2YgbG9jYXRpb25zLicsIGNvbnN0cmFpbnQ6IEFycmF5IH0sXG5cdFx0XHR7IG5hbWU6ICdtdWx0aXBsZScsIGRlc2NyaXB0aW9uOiAnRGVmaW5lIHdoYXQgdG8gZG8gd2hlbiBoYXZpbmcgbXVsdGlwbGUgcmVzdWx0cywgZWl0aGVyIGBwZWVrYCwgYGdvdG9BbmRQZWVrYCwgb3IgYGdvdG9gJyB9LFxuXHRcdF1cblx0fSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogYW55LCBwb3NpdGlvbjogYW55LCByZWZlcmVuY2VzOiBhbnksIG11bHRpcGxlPzogYW55KSA9PiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ2VkaXRvci5hY3Rpb24uZ29Ub0xvY2F0aW9ucycsIHJlc291cmNlLCBwb3NpdGlvbiwgcmVmZXJlbmNlcywgbXVsdGlwbGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuXG4vLyNyZWdpb24gLS0tIFJFRkVSRU5DRSBzZWFyY2ggc3BlY2lhbCBjb21tYW5kc1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnZWRpdG9yLmFjdGlvbi5maW5kUmVmZXJlbmNlcycsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IGFueSwgcG9zaXRpb246IGFueSkgPT4ge1xuXHRcdGFzc2VydFR5cGUoVVJJLmlzVXJpKHJlc291cmNlKSk7XG5cdFx0YXNzZXJ0VHlwZShjb3JlUG9zaXRpb24uUG9zaXRpb24uaXNJUG9zaXRpb24ocG9zaXRpb24pKTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRyZXR1cm4gY29kZUVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3IoeyByZXNvdXJjZSB9LCBjb2RlRWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpKS50aGVuKGNvbnRyb2wgPT4ge1xuXHRcdFx0aWYgKCFpc0NvZGVFZGl0b3IoY29udHJvbCkgfHwgIWNvbnRyb2wuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gUmVmZXJlbmNlc0NvbnRyb2xsZXIuZ2V0KGNvbnRyb2wpO1xuXHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlZmVyZW5jZXMgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiBnZXRSZWZlcmVuY2VzQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlciwgY29udHJvbC5nZXRNb2RlbCgpLCBjb3JlUG9zaXRpb24uUG9zaXRpb24ubGlmdChwb3NpdGlvbiksIGZhbHNlLCBmYWxzZSwgdG9rZW4pLnRoZW4ocmVmZXJlbmNlcyA9PiBuZXcgUmVmZXJlbmNlc01vZGVsKHJlZmVyZW5jZXMsIG5scy5sb2NhbGl6ZSgncmVmLnRpdGxlJywgJ1JlZmVyZW5jZXMnKSkpKTtcblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY29udHJvbGxlci50b2dnbGVXaWRnZXQocmFuZ2UsIHJlZmVyZW5jZXMsIGZhbHNlKSk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyB1c2UgTkVXIGNvbW1hbmRcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2VkaXRvci5hY3Rpb24uc2hvd1JlZmVyZW5jZXMnLCAnZWRpdG9yLmFjdGlvbi5wZWVrTG9jYXRpb25zJyk7XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBQUE7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUIsd0JBQXdCO0FBRTFELFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCLDBDQUEwQztBQUN4RSxTQUF5QyxvQkFBb0I7QUFDN0QsU0FBUyxxQkFBdUM7QUFDaEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBd0M7QUFDakQsWUFBWSxrQkFBa0I7QUFDOUIsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHNCQUE4QztBQUN2RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlC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
