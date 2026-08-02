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
import { Event, Emitter } from "../../../base/common/event.js";
import { EditorsOrder, EditorExtensions, SideBySideEditor, EditorCloseContext, GroupModelChangeKind } from "../editor.js";
import { EditorInput } from "./editorInput.js";
import { SideBySideEditorInput } from "./sideBySideEditorInput.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { dispose, Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { coalesce } from "../../../base/common/arrays.js";
const EditorOpenPositioning = {
  LEFT: "left",
  RIGHT: "right",
  FIRST: "first",
  LAST: "last"
};
function isSerializedEditorGroupModel(group) {
  const candidate = group;
  return !!(candidate && typeof candidate === "object" && Array.isArray(candidate.editors) && Array.isArray(candidate.mru));
}
function isGroupEditorChangeEvent(e) {
  const candidate = e;
  return candidate.editor && candidate.editorIndex !== void 0;
}
function isGroupEditorOpenEvent(e) {
  const candidate = e;
  return candidate.kind === GroupModelChangeKind.EDITOR_OPEN && candidate.editorIndex !== void 0;
}
function isGroupEditorMoveEvent(e) {
  const candidate = e;
  return candidate.kind === GroupModelChangeKind.EDITOR_MOVE && candidate.editorIndex !== void 0 && candidate.oldEditorIndex !== void 0;
}
function isGroupEditorCloseEvent(e) {
  const candidate = e;
  return candidate.kind === GroupModelChangeKind.EDITOR_CLOSE && candidate.editorIndex !== void 0 && candidate.context !== void 0 && candidate.sticky !== void 0;
}
let EditorGroupModel = class extends Disposable {
  constructor(labelOrSerializedGroup, instantiationService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    //#region events
    this._onDidModelChange = this._register(new Emitter({
      leakWarningThreshold: 500,
      leakWarningName: "EditorGroupModel._onDidModelChange"
      /* increased for users with hundreds of inputs opened */
    }));
    this.onDidModelChange = this._onDidModelChange.event;
    this.editors = [];
    this.mru = [];
    this.editorListeners = /* @__PURE__ */ new Set();
    this.locked = false;
    this.selection = [];
    this.preview = null;
    // editor in preview state
    this.sticky = -1;
    // index of first editor in sticky state
    this.transient = /* @__PURE__ */ new Set();
    if (isSerializedEditorGroupModel(labelOrSerializedGroup)) {
      this._id = this.deserialize(labelOrSerializedGroup);
    } else {
      this._id = EditorGroupModel.IDS++;
    }
    this.onConfigurationUpdated();
    this.registerListeners();
  }
  get id() {
    return this._id;
  }
  // editors in selected state, first one is active
  get active() {
    return this.selection[0] ?? null;
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
  }
  onConfigurationUpdated(e) {
    if (e && !e.affectsConfiguration("workbench.editor.openPositioning") && !e.affectsConfiguration("workbench.editor.focusRecentEditorAfterClose")) {
      return;
    }
    this.editorOpenPositioning = this.configurationService.getValue("workbench.editor.openPositioning");
    this.focusRecentEditorAfterClose = this.configurationService.getValue("workbench.editor.focusRecentEditorAfterClose");
  }
  get count() {
    return this.editors.length;
  }
  get stickyCount() {
    return this.sticky + 1;
  }
  getEditors(order, options) {
    const editors = order === EditorsOrder.MOST_RECENTLY_ACTIVE ? this.mru.slice(0) : this.editors.slice(0);
    if (options?.excludeSticky) {
      if (order === EditorsOrder.MOST_RECENTLY_ACTIVE) {
        return editors.filter((editor) => !this.isSticky(editor));
      }
      return editors.slice(this.sticky + 1);
    }
    return editors;
  }
  getEditorByIndex(index) {
    return this.editors[index];
  }
  get activeEditor() {
    return this.active;
  }
  isActive(candidate) {
    return this.matches(this.active, candidate);
  }
  get previewEditor() {
    return this.preview;
  }
  openEditor(candidate, options) {
    const makeSticky = options?.sticky || typeof options?.index === "number" && this.isSticky(options.index);
    const makePinned = options?.pinned || options?.sticky;
    const makeTransient = !!options?.transient;
    const makeActive = options?.active || !this.activeEditor || !makePinned && this.preview === this.activeEditor;
    const existingEditorAndIndex = this.findEditor(candidate, options);
    if (!existingEditorAndIndex) {
      const newEditor = candidate;
      const indexOfActive = this.indexOf(this.active);
      let targetIndex;
      if (options && typeof options.index === "number") {
        targetIndex = options.index;
      } else if (this.editorOpenPositioning === EditorOpenPositioning.FIRST) {
        targetIndex = 0;
        if (!makeSticky && this.isSticky(targetIndex)) {
          targetIndex = this.sticky + 1;
        }
      } else if (this.editorOpenPositioning === EditorOpenPositioning.LAST) {
        targetIndex = this.editors.length;
      } else {
        if (this.editorOpenPositioning === EditorOpenPositioning.LEFT) {
          if (indexOfActive === 0 || !this.editors.length) {
            targetIndex = 0;
          } else {
            targetIndex = indexOfActive;
          }
        } else {
          targetIndex = indexOfActive + 1;
        }
        if (!makeSticky && this.isSticky(targetIndex)) {
          targetIndex = this.sticky + 1;
        }
      }
      if (makeSticky) {
        this.sticky++;
        if (!this.isSticky(targetIndex)) {
          targetIndex = this.sticky;
        }
      }
      if (makePinned || !this.preview) {
        this.splice(targetIndex, false, newEditor);
      }
      if (makeTransient) {
        this.doSetTransient(newEditor, targetIndex, true);
      }
      if (!makePinned) {
        if (this.preview) {
          const indexOfPreview = this.indexOf(this.preview);
          if (targetIndex > indexOfPreview) {
            targetIndex--;
          }
          this.replaceEditor(this.preview, newEditor, targetIndex, !makeActive);
        }
        this.preview = newEditor;
      }
      this.registerEditorListeners(newEditor);
      const event = {
        kind: GroupModelChangeKind.EDITOR_OPEN,
        editor: newEditor,
        editorIndex: targetIndex
      };
      this._onDidModelChange.fire(event);
      this.setSelection(makeActive ? newEditor : this.activeEditor, options?.inactiveSelection ?? []);
      return {
        editor: newEditor,
        isNew: true
      };
    } else {
      const [existingEditor, existingEditorIndex] = existingEditorAndIndex;
      this.doSetTransient(existingEditor, existingEditorIndex, makeTransient === false ? false : this.isTransient(existingEditor));
      if (makePinned) {
        this.doPin(existingEditor, existingEditorIndex);
      }
      this.setSelection(makeActive ? existingEditor : this.activeEditor, options?.inactiveSelection ?? []);
      if (options && typeof options.index === "number") {
        this.moveEditor(existingEditor, options.index);
      }
      if (makeSticky) {
        this.doStick(existingEditor, this.indexOf(existingEditor));
      }
      return {
        editor: existingEditor,
        isNew: false
      };
    }
  }
  registerEditorListeners(editor) {
    const listeners = new DisposableStore();
    this.editorListeners.add(listeners);
    listeners.add(Event.once(editor.onWillDispose)(() => {
      const editorIndex = this.editors.indexOf(editor);
      if (editorIndex >= 0) {
        const event = {
          kind: GroupModelChangeKind.EDITOR_WILL_DISPOSE,
          editor,
          editorIndex
        };
        this._onDidModelChange.fire(event);
      }
    }));
    listeners.add(editor.onDidChangeDirty(() => {
      const event = {
        kind: GroupModelChangeKind.EDITOR_DIRTY,
        editor,
        editorIndex: this.editors.indexOf(editor)
      };
      this._onDidModelChange.fire(event);
    }));
    listeners.add(editor.onDidChangeLabel(() => {
      const event = {
        kind: GroupModelChangeKind.EDITOR_LABEL,
        editor,
        editorIndex: this.editors.indexOf(editor)
      };
      this._onDidModelChange.fire(event);
    }));
    listeners.add(editor.onDidChangeCapabilities(() => {
      const event = {
        kind: GroupModelChangeKind.EDITOR_CAPABILITIES,
        editor,
        editorIndex: this.editors.indexOf(editor)
      };
      this._onDidModelChange.fire(event);
    }));
    listeners.add(this.onDidModelChange((event) => {
      if (event.kind === GroupModelChangeKind.EDITOR_CLOSE && event.editor?.matches(editor)) {
        dispose(listeners);
        this.editorListeners.delete(listeners);
      }
    }));
  }
  replaceEditor(toReplace, replaceWith, replaceIndex, openNext = true) {
    const closeResult = this.doCloseEditor(toReplace, EditorCloseContext.REPLACE, openNext);
    this.splice(replaceIndex, false, replaceWith);
    if (closeResult) {
      const event = {
        kind: GroupModelChangeKind.EDITOR_CLOSE,
        ...closeResult
      };
      this._onDidModelChange.fire(event);
    }
  }
  closeEditor(candidate, context = EditorCloseContext.UNKNOWN, openNext = true) {
    const closeResult = this.doCloseEditor(candidate, context, openNext);
    if (closeResult) {
      const event = {
        kind: GroupModelChangeKind.EDITOR_CLOSE,
        ...closeResult
      };
      this._onDidModelChange.fire(event);
      return closeResult;
    }
    return void 0;
  }
  doCloseEditor(candidate, context, openNext) {
    const index = this.indexOf(candidate);
    if (index === -1) {
      return void 0;
    }
    const editor = this.editors[index];
    const sticky = this.isSticky(index);
    const isActiveEditor = this.active === editor;
    if (openNext && isActiveEditor) {
      if (this.mru.length > 1) {
        let newActive;
        if (this.focusRecentEditorAfterClose) {
          newActive = this.mru[1];
        } else {
          if (index === this.editors.length - 1) {
            newActive = this.editors[index - 1];
          } else {
            newActive = this.editors[index + 1];
          }
        }
        const newInactiveSelectedEditors = this.selection.filter((selected) => selected !== editor && selected !== newActive);
        this.doSetSelection(newActive, this.editors.indexOf(newActive), newInactiveSelectedEditors);
      } else {
        this.doSetSelection(null, void 0, []);
      }
    } else if (!isActiveEditor) {
      if (this.doIsSelected(editor)) {
        const newInactiveSelectedEditors = this.selection.filter((selected) => selected !== editor && selected !== this.activeEditor);
        this.doSetSelection(this.activeEditor, this.indexOf(this.activeEditor), newInactiveSelectedEditors);
      }
    }
    if (this.preview === editor) {
      this.preview = null;
    }
    this.transient.delete(editor);
    this.splice(index, true);
    return { editor, sticky, editorIndex: index, context };
  }
  moveEditor(candidate, toIndex) {
    if (toIndex >= this.editors.length) {
      toIndex = this.editors.length - 1;
    } else if (toIndex < 0) {
      toIndex = 0;
    }
    const index = this.indexOf(candidate);
    if (index < 0 || toIndex === index) {
      return;
    }
    const editor = this.editors[index];
    const sticky = this.sticky;
    if (this.isSticky(index) && toIndex > this.sticky) {
      this.sticky--;
    } else if (!this.isSticky(index) && toIndex <= this.sticky) {
      this.sticky++;
    }
    this.editors.splice(index, 1);
    this.editors.splice(toIndex, 0, editor);
    const event = {
      kind: GroupModelChangeKind.EDITOR_MOVE,
      editor,
      oldEditorIndex: index,
      editorIndex: toIndex
    };
    this._onDidModelChange.fire(event);
    if (sticky !== this.sticky) {
      const event2 = {
        kind: GroupModelChangeKind.EDITOR_STICKY,
        editor,
        editorIndex: toIndex
      };
      this._onDidModelChange.fire(event2);
    }
    return editor;
  }
  setActive(candidate) {
    let result;
    if (!candidate) {
      this.setGroupActive();
    } else {
      result = this.setEditorActive(candidate);
    }
    return result;
  }
  setGroupActive() {
    this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_ACTIVE });
  }
  setEditorActive(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doSetSelection(editor, editorIndex, []);
    return editor;
  }
  get selectedEditors() {
    return this.editors.filter((editor) => this.doIsSelected(editor));
  }
  isSelected(editorCandidateOrIndex) {
    let editor;
    if (typeof editorCandidateOrIndex === "number") {
      editor = this.editors[editorCandidateOrIndex];
    } else {
      editor = this.findEditor(editorCandidateOrIndex)?.[0];
    }
    return !!editor && this.doIsSelected(editor);
  }
  doIsSelected(editor) {
    return this.selection.includes(editor);
  }
  setSelection(activeSelectedEditorCandidate, inactiveSelectedEditorCandidates) {
    const res = this.findEditor(activeSelectedEditorCandidate);
    if (!res) {
      return;
    }
    const [activeSelectedEditor, activeSelectedEditorIndex] = res;
    const inactiveSelectedEditors = /* @__PURE__ */ new Set();
    for (const inactiveSelectedEditorCandidate of inactiveSelectedEditorCandidates) {
      const res2 = this.findEditor(inactiveSelectedEditorCandidate);
      if (!res2) {
        return;
      }
      const [inactiveSelectedEditor] = res2;
      if (inactiveSelectedEditor === activeSelectedEditor) {
        continue;
      }
      inactiveSelectedEditors.add(inactiveSelectedEditor);
    }
    this.doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, Array.from(inactiveSelectedEditors));
  }
  doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, inactiveSelectedEditors) {
    const previousActiveEditor = this.activeEditor;
    const previousSelection = this.selection;
    let newSelection;
    if (activeSelectedEditor) {
      newSelection = [activeSelectedEditor, ...inactiveSelectedEditors];
    } else {
      newSelection = [];
    }
    this.selection = newSelection;
    const activeEditorChanged = activeSelectedEditor && typeof activeSelectedEditorIndex === "number" && previousActiveEditor !== activeSelectedEditor;
    if (activeEditorChanged) {
      const mruIndex = this.indexOf(activeSelectedEditor, this.mru);
      this.mru.splice(mruIndex, 1);
      this.mru.unshift(activeSelectedEditor);
      const event = {
        kind: GroupModelChangeKind.EDITOR_ACTIVE,
        editor: activeSelectedEditor,
        editorIndex: activeSelectedEditorIndex
      };
      this._onDidModelChange.fire(event);
    }
    if (activeEditorChanged || previousSelection.length !== newSelection.length || previousSelection.some((editor) => !newSelection.includes(editor))) {
      const event = {
        kind: GroupModelChangeKind.EDITORS_SELECTION
      };
      this._onDidModelChange.fire(event);
    }
  }
  setIndex(index) {
    this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_INDEX });
  }
  setLabel(label) {
    this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_LABEL });
  }
  pin(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doPin(editor, editorIndex);
    return editor;
  }
  doPin(editor, editorIndex) {
    if (this.isPinned(editor)) {
      return;
    }
    this.setTransient(editor, false);
    this.preview = null;
    const event = {
      kind: GroupModelChangeKind.EDITOR_PIN,
      editor,
      editorIndex
    };
    this._onDidModelChange.fire(event);
  }
  unpin(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doUnpin(editor, editorIndex);
    return editor;
  }
  doUnpin(editor, editorIndex) {
    if (!this.isPinned(editor)) {
      return;
    }
    const oldPreview = this.preview;
    this.preview = editor;
    const event = {
      kind: GroupModelChangeKind.EDITOR_PIN,
      editor,
      editorIndex
    };
    this._onDidModelChange.fire(event);
    if (oldPreview) {
      this.closeEditor(oldPreview, EditorCloseContext.UNPIN);
    }
  }
  isPinned(editorCandidateOrIndex) {
    let editor;
    if (typeof editorCandidateOrIndex === "number") {
      editor = this.editors[editorCandidateOrIndex];
    } else {
      editor = editorCandidateOrIndex;
    }
    return !this.matches(this.preview, editor);
  }
  stick(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doStick(editor, editorIndex);
    return editor;
  }
  doStick(editor, editorIndex) {
    if (this.isSticky(editorIndex)) {
      return;
    }
    this.pin(editor);
    const newEditorIndex = this.sticky + 1;
    this.moveEditor(editor, newEditorIndex);
    this.sticky++;
    const event = {
      kind: GroupModelChangeKind.EDITOR_STICKY,
      editor,
      editorIndex: newEditorIndex
    };
    this._onDidModelChange.fire(event);
  }
  unstick(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doUnstick(editor, editorIndex);
    return editor;
  }
  doUnstick(editor, editorIndex) {
    if (!this.isSticky(editorIndex)) {
      return;
    }
    const newEditorIndex = this.sticky;
    this.moveEditor(editor, newEditorIndex);
    this.sticky--;
    const event = {
      kind: GroupModelChangeKind.EDITOR_STICKY,
      editor,
      editorIndex: newEditorIndex
    };
    this._onDidModelChange.fire(event);
  }
  isSticky(candidateOrIndex) {
    if (this.sticky < 0) {
      return false;
    }
    let index;
    if (typeof candidateOrIndex === "number") {
      index = candidateOrIndex;
    } else {
      index = this.indexOf(candidateOrIndex);
    }
    if (index < 0) {
      return false;
    }
    return index <= this.sticky;
  }
  setTransient(candidate, transient) {
    if (!transient && this.transient.size === 0) {
      return;
    }
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doSetTransient(editor, editorIndex, transient);
    return editor;
  }
  doSetTransient(editor, editorIndex, transient) {
    if (transient) {
      if (this.transient.has(editor)) {
        return;
      }
      this.transient.add(editor);
    } else {
      if (!this.transient.has(editor)) {
        return;
      }
      this.transient.delete(editor);
    }
    const event = {
      kind: GroupModelChangeKind.EDITOR_TRANSIENT,
      editor,
      editorIndex
    };
    this._onDidModelChange.fire(event);
  }
  isTransient(editorCandidateOrIndex) {
    if (this.transient.size === 0) {
      return false;
    }
    let editor;
    if (typeof editorCandidateOrIndex === "number") {
      editor = this.editors[editorCandidateOrIndex];
    } else {
      editor = this.findEditor(editorCandidateOrIndex)?.[0];
    }
    return !!editor && this.transient.has(editor);
  }
  splice(index, del, editor) {
    const editorToDeleteOrReplace = this.editors[index];
    if (del && this.isSticky(index)) {
      this.sticky--;
    }
    if (editor) {
      this.editors.splice(index, del ? 1 : 0, editor);
    } else {
      this.editors.splice(index, del ? 1 : 0);
    }
    {
      if (!del && editor) {
        if (this.mru.length === 0) {
          this.mru.push(editor);
        } else {
          this.mru.splice(1, 0, editor);
        }
      } else {
        const indexInMRU = this.indexOf(editorToDeleteOrReplace, this.mru);
        if (del && !editor) {
          this.mru.splice(indexInMRU, 1);
        } else if (del && editor) {
          this.mru.splice(indexInMRU, 1, editor);
        }
      }
    }
  }
  indexOf(candidate, editors = this.editors, options) {
    let index = -1;
    if (!candidate) {
      return index;
    }
    for (let i = 0; i < editors.length; i++) {
      const editor = editors[i];
      if (this.matches(editor, candidate, options)) {
        if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
          index = i;
        } else {
          index = i;
          break;
        }
      }
    }
    return index;
  }
  findEditor(candidate, options) {
    const index = this.indexOf(candidate, this.editors, options);
    if (index === -1) {
      return void 0;
    }
    return [this.editors[index], index];
  }
  isFirst(candidate, editors = this.editors) {
    return this.matches(editors[0], candidate);
  }
  isLast(candidate, editors = this.editors) {
    return this.matches(editors[editors.length - 1], candidate);
  }
  contains(candidate, options) {
    return this.indexOf(candidate, this.editors, options) !== -1;
  }
  matches(editor, candidate, options) {
    if (!editor || !candidate) {
      return false;
    }
    if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
      switch (options.supportSideBySide) {
        case SideBySideEditor.ANY:
          if (this.matches(editor.primary, candidate, options) || this.matches(editor.secondary, candidate, options)) {
            return true;
          }
          break;
        case SideBySideEditor.BOTH:
          if (this.matches(editor.primary, candidate, options) && this.matches(editor.secondary, candidate, options)) {
            return true;
          }
          break;
      }
    }
    const strictEquals = editor === candidate;
    if (options?.strictEquals) {
      return strictEquals;
    }
    return strictEquals || editor.matches(candidate);
  }
  get isLocked() {
    return this.locked;
  }
  lock(locked) {
    if (this.isLocked !== locked) {
      this.locked = locked;
      this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_LOCKED });
    }
  }
  clone() {
    const clone = this.instantiationService.createInstance(EditorGroupModel, void 0);
    clone.editors = this.editors.slice(0);
    clone.mru = this.mru.slice(0);
    clone.preview = this.preview;
    clone.selection = this.selection.slice(0);
    clone.sticky = this.sticky;
    for (const editor of clone.editors) {
      clone.registerEditorListeners(editor);
    }
    return clone;
  }
  serialize() {
    const registry = Registry.as(EditorExtensions.EditorFactory);
    const serializableEditors = [];
    const serializedEditors = [];
    let serializablePreviewIndex;
    let serializableSticky = this.sticky;
    for (let i = 0; i < this.editors.length; i++) {
      const editor = this.editors[i];
      let canSerializeEditor = false;
      const editorSerializer = registry.getEditorSerializer(editor);
      if (editorSerializer) {
        const value = editorSerializer.canSerialize(editor) ? editorSerializer.serialize(editor) : void 0;
        if (typeof value === "string") {
          canSerializeEditor = true;
          serializedEditors.push({ id: editor.typeId, value });
          serializableEditors.push(editor);
          if (this.preview === editor) {
            serializablePreviewIndex = serializableEditors.length - 1;
          }
        } else {
          canSerializeEditor = false;
        }
      }
      if (!canSerializeEditor && this.isSticky(i)) {
        serializableSticky--;
      }
    }
    const serializableMru = this.mru.map((editor) => this.indexOf(editor, serializableEditors)).filter((i) => i >= 0);
    return {
      id: this.id,
      locked: this.locked ? true : void 0,
      editors: serializedEditors,
      mru: serializableMru,
      preview: serializablePreviewIndex,
      sticky: serializableSticky >= 0 ? serializableSticky : void 0
    };
  }
  deserialize(data) {
    const registry = Registry.as(EditorExtensions.EditorFactory);
    if (typeof data.id === "number") {
      this._id = data.id;
      EditorGroupModel.IDS = Math.max(data.id + 1, EditorGroupModel.IDS);
    } else {
      this._id = EditorGroupModel.IDS++;
    }
    if (data.locked) {
      this.locked = true;
    }
    this.editors = coalesce(data.editors.map((e, index) => {
      let editor;
      const editorSerializer = registry.getEditorSerializer(e.id);
      if (editorSerializer) {
        const deserializedEditor = editorSerializer.deserialize(this.instantiationService, e.value);
        if (deserializedEditor instanceof EditorInput) {
          editor = deserializedEditor;
          this.registerEditorListeners(editor);
        }
      }
      if (!editor && typeof data.sticky === "number" && index <= data.sticky) {
        data.sticky--;
      }
      return editor;
    }));
    this.mru = coalesce(data.mru.map((i) => this.editors[i]));
    this.selection = this.mru.length > 0 ? [this.mru[0]] : [];
    if (typeof data.preview === "number") {
      this.preview = this.editors[data.preview];
    }
    if (typeof data.sticky === "number") {
      this.sticky = data.sticky;
    }
    return this._id;
  }
  dispose() {
    dispose(Array.from(this.editorListeners));
    this.editorListeners.clear();
    this.transient.clear();
    super.dispose();
  }
};
EditorGroupModel.IDS = 0;
EditorGroupModel = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService)
], EditorGroupModel);
export {
  EditorGroupModel,
  isGroupEditorChangeEvent,
  isGroupEditorCloseEvent,
  isGroupEditorMoveEvent,
  isGroupEditorOpenEvent,
  isSerializedEditorGroupModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvckdyb3VwTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEdyb3VwSWRlbnRpZmllciwgRWRpdG9yc09yZGVyLCBFZGl0b3JFeHRlbnNpb25zLCBJVW50eXBlZEVkaXRvcklucHV0LCBTaWRlQnlTaWRlRWRpdG9yLCBFZGl0b3JDbG9zZUNvbnRleHQsIElNYXRjaEVkaXRvck9wdGlvbnMsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kIH0gZnJvbSAnLi4vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxuY29uc3QgRWRpdG9yT3BlblBvc2l0aW9uaW5nID0ge1xuXHRMRUZUOiAnbGVmdCcsXG5cdFJJR0hUOiAncmlnaHQnLFxuXHRGSVJTVDogJ2ZpcnN0Jyxcblx0TEFTVDogJ2xhc3QnXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JPcGVuT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHBpbm5lZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0aWNreT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRyYW5zaWVudD86IGJvb2xlYW47XG5cdGFjdGl2ZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluYWN0aXZlU2VsZWN0aW9uPzogRWRpdG9ySW5wdXRbXTtcblx0cmVhZG9ubHkgaW5kZXg/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHN1cHBvcnRTaWRlQnlTaWRlPzogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfCBTaWRlQnlTaWRlRWRpdG9yLkJPVEg7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvck9wZW5SZXN1bHQge1xuXHRyZWFkb25seSBlZGl0b3I6IEVkaXRvcklucHV0O1xuXHRyZWFkb25seSBpc05ldzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZEVkaXRvcklucHV0IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwge1xuXHRyZWFkb25seSBpZDogbnVtYmVyO1xuXHRyZWFkb25seSBsb2NrZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBlZGl0b3JzOiBJU2VyaWFsaXplZEVkaXRvcklucHV0W107XG5cdHJlYWRvbmx5IG1ydTogbnVtYmVyW107XG5cdHJlYWRvbmx5IHByZXZpZXc/OiBudW1iZXI7XG5cdHN0aWNreT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwoZ3JvdXA/OiB1bmtub3duKTogZ3JvdXAgaXMgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gZ3JvdXAgYXMgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIShjYW5kaWRhdGUgJiYgdHlwZW9mIGNhbmRpZGF0ZSA9PT0gJ29iamVjdCcgJiYgQXJyYXkuaXNBcnJheShjYW5kaWRhdGUuZWRpdG9ycykgJiYgQXJyYXkuaXNBcnJheShjYW5kaWRhdGUubXJ1KSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoZSBraW5kIG9mIGNoYW5nZSB0aGF0IG9jY3VycmVkIGluIHRoZSBncm91cCBtb2RlbC5cblx0ICovXG5cdHJlYWRvbmx5IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kO1xuXG5cdC8qKlxuXHQgKiBPbmx5IGFwcGxpZXMgd2hlbiBlZGl0b3JzIGNoYW5nZSBwcm92aWRpbmdcblx0ICogYWNjZXNzIHRvIHRoZSBlZGl0b3IgdGhlIGV2ZW50IGlzIGFib3V0LlxuXHQgKi9cblx0cmVhZG9ubHkgZWRpdG9yPzogRWRpdG9ySW5wdXQ7XG5cblx0LyoqXG5cdCAqIE9ubHkgYXBwbGllcyB3aGVuIGVkaXRvcnMgY2hhbmdlIHByb3ZpZGluZ1xuXHQgKiBhY2Nlc3MgdG8gdGhlIGluZGV4IG9mIHRoZSBlZGl0b3IgdGhlIGV2ZW50XG5cdCAqIGlzIGFib3V0LlxuXHQgKi9cblx0cmVhZG9ubHkgZWRpdG9ySW5kZXg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgZXh0ZW5kcyBJR3JvdXBNb2RlbENoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgZWRpdG9yOiBFZGl0b3JJbnB1dDtcblx0cmVhZG9ubHkgZWRpdG9ySW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzR3JvdXBFZGl0b3JDaGFuZ2VFdmVudChlOiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50KTogZSBpcyBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGUgYXMgSUdyb3VwRWRpdG9yT3BlbkV2ZW50O1xuXG5cdHJldHVybiBjYW5kaWRhdGUuZWRpdG9yICYmIGNhbmRpZGF0ZS5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHcm91cEVkaXRvck9wZW5FdmVudCBleHRlbmRzIElHcm91cEVkaXRvckNoYW5nZUV2ZW50IHtcblxuXHRyZWFkb25seSBraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfT1BFTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzR3JvdXBFZGl0b3JPcGVuRXZlbnQoZTogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCk6IGUgaXMgSUdyb3VwRWRpdG9yT3BlbkV2ZW50IHtcblx0Y29uc3QgY2FuZGlkYXRlID0gZSBhcyBJR3JvdXBFZGl0b3JPcGVuRXZlbnQ7XG5cblx0cmV0dXJuIGNhbmRpZGF0ZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfT1BFTiAmJiBjYW5kaWRhdGUuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR3JvdXBFZGl0b3JNb3ZlRXZlbnQgZXh0ZW5kcyBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCB7XG5cblx0cmVhZG9ubHkga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkU7XG5cblx0LyoqXG5cdCAqIFNpZ25pZmllcyB0aGUgaW5kZXggdGhlIGVkaXRvciBpcyBtb3ZpbmcgZnJvbS5cblx0ICogYGVkaXRvckluZGV4YCB3aWxsIGNvbnRhaW4gdGhlIGluZGV4IHRoZSBlZGl0b3Jcblx0ICogaXMgbW92aW5nIHRvLlxuXHQgKi9cblx0cmVhZG9ubHkgb2xkRWRpdG9ySW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzR3JvdXBFZGl0b3JNb3ZlRXZlbnQoZTogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCk6IGUgaXMgSUdyb3VwRWRpdG9yTW92ZUV2ZW50IHtcblx0Y29uc3QgY2FuZGlkYXRlID0gZSBhcyBJR3JvdXBFZGl0b3JNb3ZlRXZlbnQ7XG5cblx0cmV0dXJuIGNhbmRpZGF0ZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTU9WRSAmJiBjYW5kaWRhdGUuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCAmJiBjYW5kaWRhdGUub2xkRWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR3JvdXBFZGl0b3JDbG9zZUV2ZW50IGV4dGVuZHMgSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQge1xuXG5cdHJlYWRvbmx5IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRTtcblxuXHQvKipcblx0ICogU2lnbmlmaWVzIHRoZSBjb250ZXh0IGluIHdoaWNoIHRoZSBlZGl0b3Jcblx0ICogaXMgYmVpbmcgY2xvc2VkLiBUaGlzIGFsbG93cyBmb3IgdW5kZXJzdGFuZGluZ1xuXHQgKiBpZiBhIHJlcGxhY2Ugb3IgcmVvcGVuIGlzIG9jY3VycmluZ1xuXHQgKi9cblx0cmVhZG9ubHkgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0O1xuXG5cdC8qKlxuXHQgKiBTaWduaWZpZXMgd2hldGhlciBvciBub3QgdGhlIGNsb3NlZCBlZGl0b3Igd2FzXG5cdCAqIHN0aWNreS4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXN1ZSBzdGF0ZSBpcyBsb3N0XG5cdCAqIGFmdGVyIGNsb3NpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBzdGlja3k6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0dyb3VwRWRpdG9yQ2xvc2VFdmVudChlOiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50KTogZSBpcyBJR3JvdXBFZGl0b3JDbG9zZUV2ZW50IHtcblx0Y29uc3QgY2FuZGlkYXRlID0gZSBhcyBJR3JvdXBFZGl0b3JDbG9zZUV2ZW50O1xuXG5cdHJldHVybiBjYW5kaWRhdGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFICYmIGNhbmRpZGF0ZS5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkICYmIGNhbmRpZGF0ZS5jb250ZXh0ICE9PSB1bmRlZmluZWQgJiYgY2FuZGlkYXRlLnN0aWNreSAhPT0gdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUVkaXRvckNsb3NlUmVzdWx0IHtcblx0cmVhZG9ubHkgZWRpdG9yOiBFZGl0b3JJbnB1dDtcblx0cmVhZG9ubHkgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0O1xuXHRyZWFkb25seSBlZGl0b3JJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBzdGlja3k6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlYWRvbmx5RWRpdG9yR3JvdXBNb2RlbCB7XG5cblx0cmVhZG9ubHkgb25EaWRNb2RlbENoYW5nZTogRXZlbnQ8SUdyb3VwTW9kZWxDaGFuZ2VFdmVudD47XG5cblx0cmVhZG9ubHkgaWQ6IEdyb3VwSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgY291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RpY2t5Q291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgaXNMb2NrZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFjdGl2ZUVkaXRvcjogRWRpdG9ySW5wdXQgfCBudWxsO1xuXHRyZWFkb25seSBwcmV2aWV3RWRpdG9yOiBFZGl0b3JJbnB1dCB8IG51bGw7XG5cdHJlYWRvbmx5IHNlbGVjdGVkRWRpdG9yczogRWRpdG9ySW5wdXRbXTtcblxuXHRnZXRFZGl0b3JzKG9yZGVyOiBFZGl0b3JzT3JkZXIsIG9wdGlvbnM/OiB7IGV4Y2x1ZGVTdGlja3k/OiBib29sZWFuIH0pOiBFZGl0b3JJbnB1dFtdO1xuXHRnZXRFZGl0b3JCeUluZGV4KGluZGV4OiBudW1iZXIpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0aW5kZXhPZihlZGl0b3I6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IG51bGwsIGVkaXRvcnM/OiBFZGl0b3JJbnB1dFtdLCBvcHRpb25zPzogSU1hdGNoRWRpdG9yT3B0aW9ucyk6IG51bWJlcjtcblx0aXNBY3RpdmUoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuO1xuXHRpc1Bpbm5lZChlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW47XG5cdGlzU3RpY2t5KGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKTogYm9vbGVhbjtcblx0aXNTZWxlY3RlZChlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW47XG5cdGlzVHJhbnNpZW50KGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKTogYm9vbGVhbjtcblx0aXNGaXJzdChlZGl0b3I6IEVkaXRvcklucHV0LCBlZGl0b3JzPzogRWRpdG9ySW5wdXRbXSk6IGJvb2xlYW47XG5cdGlzTGFzdChlZGl0b3I6IEVkaXRvcklucHV0LCBlZGl0b3JzPzogRWRpdG9ySW5wdXRbXSk6IGJvb2xlYW47XG5cdGZpbmRFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IG51bGwsIG9wdGlvbnM/OiBJTWF0Y2hFZGl0b3JPcHRpb25zKTogW0VkaXRvcklucHV0LCBudW1iZXIgLyogaW5kZXggKi9dIHwgdW5kZWZpbmVkO1xuXHRjb250YWlucyhlZGl0b3I6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElNYXRjaEVkaXRvck9wdGlvbnMpOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUVkaXRvckdyb3VwTW9kZWwgZXh0ZW5kcyBJUmVhZG9ubHlFZGl0b3JHcm91cE1vZGVsIHtcblx0b3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUVkaXRvck9wZW5PcHRpb25zKTogSUVkaXRvck9wZW5SZXN1bHQ7XG5cdGNsb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGNvbnRleHQ/OiBFZGl0b3JDbG9zZUNvbnRleHQsIG9wZW5OZXh0PzogYm9vbGVhbik6IElFZGl0b3JDbG9zZVJlc3VsdCB8IHVuZGVmaW5lZDtcblx0bW92ZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCB0b0luZGV4OiBudW1iZXIpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0c2V0QWN0aXZlKGVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0c2V0U2VsZWN0aW9uKGFjdGl2ZVNlbGVjdGVkRWRpdG9yOiBFZGl0b3JJbnB1dCwgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnM6IEVkaXRvcklucHV0W10pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yR3JvdXBNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBNb2RlbCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgSURTID0gMDtcblxuXHQvLyNyZWdpb24gZXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNb2RlbENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElHcm91cE1vZGVsQ2hhbmdlRXZlbnQ+KHsgbGVha1dhcm5pbmdUaHJlc2hvbGQ6IDUwMCwgbGVha1dhcm5pbmdOYW1lOiAnRWRpdG9yR3JvdXBNb2RlbC5fb25EaWRNb2RlbENoYW5nZScgLyogaW5jcmVhc2VkIGZvciB1c2VycyB3aXRoIGh1bmRyZWRzIG9mIGlucHV0cyBvcGVuZWQgKi8gfSkpO1xuXHRyZWFkb25seSBvbkRpZE1vZGVsQ2hhbmdlID0gdGhpcy5fb25EaWRNb2RlbENoYW5nZS5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIF9pZDogR3JvdXBJZGVudGlmaWVyO1xuXHRnZXQgaWQoKTogR3JvdXBJZGVudGlmaWVyIHsgcmV0dXJuIHRoaXMuX2lkOyB9XG5cblx0cHJpdmF0ZSBlZGl0b3JzOiBFZGl0b3JJbnB1dFtdID0gW107XG5cdHByaXZhdGUgbXJ1OiBFZGl0b3JJbnB1dFtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JMaXN0ZW5lcnMgPSBuZXcgU2V0PERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRwcml2YXRlIGxvY2tlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgc2VsZWN0aW9uOiBFZGl0b3JJbnB1dFtdID0gW107XHRcdFx0XHRcdC8vIGVkaXRvcnMgaW4gc2VsZWN0ZWQgc3RhdGUsIGZpcnN0IG9uZSBpcyBhY3RpdmVcblxuXHRwcml2YXRlIGdldCBhY3RpdmUoKTogRWRpdG9ySW5wdXQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5zZWxlY3Rpb25bMF0gPz8gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgcHJldmlldzogRWRpdG9ySW5wdXQgfCBudWxsID0gbnVsbDsgXHRcdFx0Ly8gZWRpdG9yIGluIHByZXZpZXcgc3RhdGVcblx0cHJpdmF0ZSBzdGlja3kgPSAtMTtcdFx0XHRcdFx0XHRcdFx0XHQvLyBpbmRleCBvZiBmaXJzdCBlZGl0b3IgaW4gc3RpY2t5IHN0YXRlXG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhbnNpZW50ID0gbmV3IFNldDxFZGl0b3JJbnB1dD4oKTsgXHQvLyBlZGl0b3JzIGluIHRyYW5zaWVudCBzdGF0ZVxuXG5cdHByaXZhdGUgZWRpdG9yT3BlblBvc2l0aW9uaW5nOiAoJ2xlZnQnIHwgJ3JpZ2h0JyB8ICdmaXJzdCcgfCAnbGFzdCcpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZvY3VzUmVjZW50RWRpdG9yQWZ0ZXJDbG9zZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsYWJlbE9yU2VyaWFsaXplZEdyb3VwOiBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChpc1NlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsKGxhYmVsT3JTZXJpYWxpemVkR3JvdXApKSB7XG5cdFx0XHR0aGlzLl9pZCA9IHRoaXMuZGVzZXJpYWxpemUobGFiZWxPclNlcmlhbGl6ZWRHcm91cCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lkID0gRWRpdG9yR3JvdXBNb2RlbC5JRFMrKztcblx0XHR9XG5cblx0XHR0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZT86IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmVkaXRvci5vcGVuUG9zaXRpb25pbmcnKSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmVkaXRvci5mb2N1c1JlY2VudEVkaXRvckFmdGVyQ2xvc2UnKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yT3BlblBvc2l0aW9uaW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLmVkaXRvci5vcGVuUG9zaXRpb25pbmcnKTtcblx0XHR0aGlzLmZvY3VzUmVjZW50RWRpdG9yQWZ0ZXJDbG9zZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC5lZGl0b3IuZm9jdXNSZWNlbnRFZGl0b3JBZnRlckNsb3NlJyk7XG5cdH1cblxuXHRnZXQgY291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JzLmxlbmd0aDtcblx0fVxuXG5cdGdldCBzdGlja3lDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnN0aWNreSArIDE7XG5cdH1cblxuXHRnZXRFZGl0b3JzKG9yZGVyOiBFZGl0b3JzT3JkZXIsIG9wdGlvbnM/OiB7IGV4Y2x1ZGVTdGlja3k/OiBib29sZWFuIH0pOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRjb25zdCBlZGl0b3JzID0gb3JkZXIgPT09IEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSA/IHRoaXMubXJ1LnNsaWNlKDApIDogdGhpcy5lZGl0b3JzLnNsaWNlKDApO1xuXG5cdFx0aWYgKG9wdGlvbnM/LmV4Y2x1ZGVTdGlja3kpIHtcblxuXHRcdFx0Ly8gTVJVOiBuZWVkIHRvIGNoZWNrIGZvciBpbmRleCBvbiBlYWNoXG5cdFx0XHRpZiAob3JkZXIgPT09IEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkge1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9ycy5maWx0ZXIoZWRpdG9yID0+ICF0aGlzLmlzU3RpY2t5KGVkaXRvcikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZXF1ZW50aWFsOiBzaW1wbHkgc3RhcnQgYWZ0ZXIgc3RpY2t5IGluZGV4XG5cdFx0XHRyZXR1cm4gZWRpdG9ycy5zbGljZSh0aGlzLnN0aWNreSArIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JzO1xuXHR9XG5cblx0Z2V0RWRpdG9yQnlJbmRleChpbmRleDogbnVtYmVyKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvcnNbaW5kZXhdO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUVkaXRvcigpOiBFZGl0b3JJbnB1dCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZTtcblx0fVxuXG5cdGlzQWN0aXZlKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWF0Y2hlcyh0aGlzLmFjdGl2ZSwgY2FuZGlkYXRlKTtcblx0fVxuXG5cdGdldCBwcmV2aWV3RWRpdG9yKCk6IEVkaXRvcklucHV0IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMucHJldmlldztcblx0fVxuXG5cdG9wZW5FZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElFZGl0b3JPcGVuT3B0aW9ucyk6IElFZGl0b3JPcGVuUmVzdWx0IHtcblx0XHRjb25zdCBtYWtlU3RpY2t5ID0gb3B0aW9ucz8uc3RpY2t5IHx8ICh0eXBlb2Ygb3B0aW9ucz8uaW5kZXggPT09ICdudW1iZXInICYmIHRoaXMuaXNTdGlja3kob3B0aW9ucy5pbmRleCkpO1xuXHRcdGNvbnN0IG1ha2VQaW5uZWQgPSBvcHRpb25zPy5waW5uZWQgfHwgb3B0aW9ucz8uc3RpY2t5O1xuXHRcdGNvbnN0IG1ha2VUcmFuc2llbnQgPSAhIW9wdGlvbnM/LnRyYW5zaWVudDtcblx0XHRjb25zdCBtYWtlQWN0aXZlID0gb3B0aW9ucz8uYWN0aXZlIHx8ICF0aGlzLmFjdGl2ZUVkaXRvciB8fCAoIW1ha2VQaW5uZWQgJiYgdGhpcy5wcmV2aWV3ID09PSB0aGlzLmFjdGl2ZUVkaXRvcik7XG5cblx0XHRjb25zdCBleGlzdGluZ0VkaXRvckFuZEluZGV4ID0gdGhpcy5maW5kRWRpdG9yKGNhbmRpZGF0ZSwgb3B0aW9ucyk7XG5cblx0XHQvLyBOZXcgZWRpdG9yXG5cdFx0aWYgKCFleGlzdGluZ0VkaXRvckFuZEluZGV4KSB7XG5cdFx0XHRjb25zdCBuZXdFZGl0b3IgPSBjYW5kaWRhdGU7XG5cdFx0XHRjb25zdCBpbmRleE9mQWN0aXZlID0gdGhpcy5pbmRleE9mKHRoaXMuYWN0aXZlKTtcblxuXHRcdFx0Ly8gSW5zZXJ0IGludG8gc3BlY2lmaWMgcG9zaXRpb25cblx0XHRcdGxldCB0YXJnZXRJbmRleDogbnVtYmVyO1xuXHRcdFx0aWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMuaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRhcmdldEluZGV4ID0gb3B0aW9ucy5pbmRleDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5zZXJ0IHRvIHRoZSBCRUdJTk5JTkdcblx0XHRcdGVsc2UgaWYgKHRoaXMuZWRpdG9yT3BlblBvc2l0aW9uaW5nID09PSBFZGl0b3JPcGVuUG9zaXRpb25pbmcuRklSU1QpIHtcblx0XHRcdFx0dGFyZ2V0SW5kZXggPSAwO1xuXG5cdFx0XHRcdC8vIEFsd2F5cyBtYWtlIHN1cmUgdGFyZ2V0SW5kZXggaXMgYWZ0ZXIgc3RpY2t5IGVkaXRvcnNcblx0XHRcdFx0Ly8gdW5sZXNzIHdlIGFyZSBleHBsaWNpdGx5IHRvbGQgdG8gbWFrZSB0aGUgZWRpdG9yIHN0aWNreVxuXHRcdFx0XHRpZiAoIW1ha2VTdGlja3kgJiYgdGhpcy5pc1N0aWNreSh0YXJnZXRJbmRleCkpIHtcblx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IHRoaXMuc3RpY2t5ICsgMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnNlcnQgdG8gdGhlIEVORFxuXHRcdFx0ZWxzZSBpZiAodGhpcy5lZGl0b3JPcGVuUG9zaXRpb25pbmcgPT09IEVkaXRvck9wZW5Qb3NpdGlvbmluZy5MQVNUKSB7XG5cdFx0XHRcdHRhcmdldEluZGV4ID0gdGhpcy5lZGl0b3JzLmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5zZXJ0IHRvIExFRlQgb3IgUklHSFQgb2YgYWN0aXZlIGVkaXRvclxuXHRcdFx0ZWxzZSB7XG5cblx0XHRcdFx0Ly8gSW5zZXJ0IHRvIHRoZSBMRUZUIG9mIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdFx0aWYgKHRoaXMuZWRpdG9yT3BlblBvc2l0aW9uaW5nID09PSBFZGl0b3JPcGVuUG9zaXRpb25pbmcuTEVGVCkge1xuXHRcdFx0XHRcdGlmIChpbmRleE9mQWN0aXZlID09PSAwIHx8ICF0aGlzLmVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IDA7IC8vIHRvIHRoZSBsZWZ0IGJlY29taW5nIGZpcnN0IGVkaXRvciBpbiBsaXN0XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRhcmdldEluZGV4ID0gaW5kZXhPZkFjdGl2ZTsgLy8gdG8gdGhlIGxlZnQgb2YgYWN0aXZlIGVkaXRvclxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEluc2VydCB0byB0aGUgUklHSFQgb2YgYWN0aXZlIGVkaXRvclxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IGluZGV4T2ZBY3RpdmUgKyAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWx3YXlzIG1ha2Ugc3VyZSB0YXJnZXRJbmRleCBpcyBhZnRlciBzdGlja3kgZWRpdG9yc1xuXHRcdFx0XHQvLyB1bmxlc3Mgd2UgYXJlIGV4cGxpY2l0bHkgdG9sZCB0byBtYWtlIHRoZSBlZGl0b3Igc3RpY2t5XG5cdFx0XHRcdGlmICghbWFrZVN0aWNreSAmJiB0aGlzLmlzU3RpY2t5KHRhcmdldEluZGV4KSkge1xuXHRcdFx0XHRcdHRhcmdldEluZGV4ID0gdGhpcy5zdGlja3kgKyAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBlZGl0b3IgYmVjb21lcyBzdGlja3ksIGluY3JlbWVudCB0aGUgc3RpY2t5IGluZGV4IGFuZCBhZGp1c3Rcblx0XHRcdC8vIHRoZSB0YXJnZXRJbmRleCB0byBiZSBhdCB0aGUgZW5kIG9mIHN0aWNreSBlZGl0b3JzIHVubGVzcyBhbHJlYWR5LlxuXHRcdFx0aWYgKG1ha2VTdGlja3kpIHtcblx0XHRcdFx0dGhpcy5zdGlja3krKztcblxuXHRcdFx0XHRpZiAoIXRoaXMuaXNTdGlja3kodGFyZ2V0SW5kZXgpKSB7XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXggPSB0aGlzLnN0aWNreTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnNlcnQgaW50byBvdXIgbGlzdCBvZiBlZGl0b3JzIGlmIHBpbm5lZCBvciB3ZSBoYXZlIG5vIHByZXZpZXcgZWRpdG9yXG5cdFx0XHRpZiAobWFrZVBpbm5lZCB8fCAhdGhpcy5wcmV2aWV3KSB7XG5cdFx0XHRcdHRoaXMuc3BsaWNlKHRhcmdldEluZGV4LCBmYWxzZSwgbmV3RWRpdG9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIHRyYW5zaWVudFxuXHRcdFx0aWYgKG1ha2VUcmFuc2llbnQpIHtcblx0XHRcdFx0dGhpcy5kb1NldFRyYW5zaWVudChuZXdFZGl0b3IsIHRhcmdldEluZGV4LCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIHByZXZpZXdcblx0XHRcdGlmICghbWFrZVBpbm5lZCkge1xuXG5cdFx0XHRcdC8vIFJlcGxhY2UgZXhpc3RpbmcgcHJldmlldyB3aXRoIHRoaXMgZWRpdG9yIGlmIHdlIGhhdmUgYSBwcmV2aWV3XG5cdFx0XHRcdGlmICh0aGlzLnByZXZpZXcpIHtcblx0XHRcdFx0XHRjb25zdCBpbmRleE9mUHJldmlldyA9IHRoaXMuaW5kZXhPZih0aGlzLnByZXZpZXcpO1xuXHRcdFx0XHRcdGlmICh0YXJnZXRJbmRleCA+IGluZGV4T2ZQcmV2aWV3KSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRJbmRleC0tOyAvLyBhY2NvbW1vZGF0ZSBmb3IgdGhlIGZhY3QgdGhhdCB0aGUgcHJldmlldyBlZGl0b3IgY2xvc2VzXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5yZXBsYWNlRWRpdG9yKHRoaXMucHJldmlldywgbmV3RWRpdG9yLCB0YXJnZXRJbmRleCwgIW1ha2VBY3RpdmUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5wcmV2aWV3ID0gbmV3RWRpdG9yO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMaXN0ZW5lcnNcblx0XHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMobmV3RWRpdG9yKTtcblxuXHRcdFx0Ly8gRXZlbnRcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JPcGVuRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOLFxuXHRcdFx0XHRlZGl0b3I6IG5ld0VkaXRvcixcblx0XHRcdFx0ZWRpdG9ySW5kZXg6IHRhcmdldEluZGV4XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblxuXHRcdFx0Ly8gSGFuZGxlIGFjdGl2ZSBlZGl0b3IgLyBzZWxlY3RlZCBlZGl0b3JzXG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbihtYWtlQWN0aXZlID8gbmV3RWRpdG9yIDogdGhpcy5hY3RpdmVFZGl0b3IsIG9wdGlvbnM/LmluYWN0aXZlU2VsZWN0aW9uID8/IFtdKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWRpdG9yOiBuZXdFZGl0b3IsXG5cdFx0XHRcdGlzTmV3OiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEV4aXN0aW5nIGVkaXRvclxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgW2V4aXN0aW5nRWRpdG9yLCBleGlzdGluZ0VkaXRvckluZGV4XSA9IGV4aXN0aW5nRWRpdG9yQW5kSW5kZXg7XG5cblx0XHRcdC8vIFVwZGF0ZSB0cmFuc2llbnQgKGV4aXN0aW5nIGVkaXRvcnMgZG8gbm90IHR1cm4gdHJhbnNpZW50IGlmIHRoZXkgd2VyZSBub3QgYmVmb3JlKVxuXHRcdFx0dGhpcy5kb1NldFRyYW5zaWVudChleGlzdGluZ0VkaXRvciwgZXhpc3RpbmdFZGl0b3JJbmRleCwgbWFrZVRyYW5zaWVudCA9PT0gZmFsc2UgPyBmYWxzZSA6IHRoaXMuaXNUcmFuc2llbnQoZXhpc3RpbmdFZGl0b3IpKTtcblxuXHRcdFx0Ly8gUGluIGl0XG5cdFx0XHRpZiAobWFrZVBpbm5lZCkge1xuXHRcdFx0XHR0aGlzLmRvUGluKGV4aXN0aW5nRWRpdG9yLCBleGlzdGluZ0VkaXRvckluZGV4KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIGFjdGl2ZSBlZGl0b3IgLyBzZWxlY3RlZCBlZGl0b3JzXG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbihtYWtlQWN0aXZlID8gZXhpc3RpbmdFZGl0b3IgOiB0aGlzLmFjdGl2ZUVkaXRvciwgb3B0aW9ucz8uaW5hY3RpdmVTZWxlY3Rpb24gPz8gW10pO1xuXG5cdFx0XHQvLyBSZXNwZWN0IGluZGV4XG5cdFx0XHRpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5pbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGhpcy5tb3ZlRWRpdG9yKGV4aXN0aW5nRWRpdG9yLCBvcHRpb25zLmluZGV4KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RpY2sgaXQgKGludGVudGlvbmFsbHkgYWZ0ZXIgdGhlIG1vdmVFZGl0b3IgY2FsbCBpbiBjYXNlXG5cdFx0XHQvLyB0aGUgZWRpdG9yIHdhcyBhbHJlYWR5IG1vdmVkIGludG8gdGhlIHN0aWNreSByYW5nZSlcblx0XHRcdGlmIChtYWtlU3RpY2t5KSB7XG5cdFx0XHRcdHRoaXMuZG9TdGljayhleGlzdGluZ0VkaXRvciwgdGhpcy5pbmRleE9mKGV4aXN0aW5nRWRpdG9yKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRvcjogZXhpc3RpbmdFZGl0b3IsXG5cdFx0XHRcdGlzTmV3OiBmYWxzZVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRWRpdG9yTGlzdGVuZXJzKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5lZGl0b3JMaXN0ZW5lcnMuYWRkKGxpc3RlbmVycyk7XG5cblx0XHQvLyBSZS1lbWl0IGRpc3Bvc2FsIG9mIGVkaXRvciBpbnB1dCBhcyBvdXIgb3duIGV2ZW50XG5cdFx0bGlzdGVuZXJzLmFkZChFdmVudC5vbmNlKGVkaXRvci5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JJbmRleCA9IHRoaXMuZWRpdG9ycy5pbmRleE9mKGVkaXRvcik7XG5cdFx0XHRpZiAoZWRpdG9ySW5kZXggPj0gMCkge1xuXHRcdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1dJTExfRElTUE9TRSxcblx0XHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFx0ZWRpdG9ySW5kZXhcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1FbWl0IGRpcnR5IHN0YXRlIGNoYW5nZXNcblx0XHRsaXN0ZW5lcnMuYWRkKGVkaXRvci5vbkRpZENoYW5nZURpcnR5KCgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0RJUlRZLFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdGVkaXRvckluZGV4OiB0aGlzLmVkaXRvcnMuaW5kZXhPZihlZGl0b3IpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1FbWl0IGxhYmVsIGNoYW5nZXNcblx0XHRsaXN0ZW5lcnMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUxhYmVsKCgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0xBQkVMLFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdGVkaXRvckluZGV4OiB0aGlzLmVkaXRvcnMuaW5kZXhPZihlZGl0b3IpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1FbWl0IGNhcGFiaWxpdHkgY2hhbmdlc1xuXHRcdGxpc3RlbmVycy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzKCgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NBUEFCSUxJVElFUyxcblx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JJbmRleDogdGhpcy5lZGl0b3JzLmluZGV4T2YoZWRpdG9yKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgZGlzcG9zZSBsaXN0ZW5lcnMgb25jZSB0aGUgZWRpdG9yIGdldHMgY2xvc2VkXG5cdFx0bGlzdGVuZXJzLmFkZCh0aGlzLm9uRGlkTW9kZWxDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRSAmJiBldmVudC5lZGl0b3I/Lm1hdGNoZXMoZWRpdG9yKSkge1xuXHRcdFx0XHRkaXNwb3NlKGxpc3RlbmVycyk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVwbGFjZUVkaXRvcih0b1JlcGxhY2U6IEVkaXRvcklucHV0LCByZXBsYWNlV2l0aDogRWRpdG9ySW5wdXQsIHJlcGxhY2VJbmRleDogbnVtYmVyLCBvcGVuTmV4dCA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBjbG9zZVJlc3VsdCA9IHRoaXMuZG9DbG9zZUVkaXRvcih0b1JlcGxhY2UsIEVkaXRvckNsb3NlQ29udGV4dC5SRVBMQUNFLCBvcGVuTmV4dCk7IC8vIG9wdGltaXphdGlvbiB0byBwcmV2ZW50IG11bHRpcGxlIHNldEFjdGl2ZSgpIGluIG9uZSBjYWxsXG5cblx0XHQvLyBXZSB3YW50IHRvIGZpcnN0IGFkZCB0aGUgbmV3IGVkaXRvciBpbnRvIG91ciBtb2RlbCBiZWZvcmUgZW1pdHRpbmcgdGhlIGNsb3NlIGV2ZW50IGJlY2F1c2Vcblx0XHQvLyBmaXJpbmcgdGhlIGNsb3NlIGV2ZW50IGNhbiB0cmlnZ2VyIGEgZGlzcG9zZSBvbiB0aGUgc2FtZSBlZGl0b3IgdGhhdCBpcyBub3cgYmVpbmcgYWRkZWQuXG5cdFx0Ly8gVGhpcyBjYW4gbGVhZCBpbnRvIG9wZW5pbmcgYSBkaXNwb3NlZCBlZGl0b3Igd2hpY2ggaXMgbm90IHdoYXQgd2Ugd2FudC5cblx0XHR0aGlzLnNwbGljZShyZXBsYWNlSW5kZXgsIGZhbHNlLCByZXBsYWNlV2l0aCk7XG5cblx0XHRpZiAoY2xvc2VSZXN1bHQpIHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDbG9zZUV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0UsXG5cdFx0XHRcdC4uLmNsb3NlUmVzdWx0XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRjbG9zZUVkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0LCBjb250ZXh0ID0gRWRpdG9yQ2xvc2VDb250ZXh0LlVOS05PV04sIG9wZW5OZXh0ID0gdHJ1ZSk6IElFZGl0b3JDbG9zZVJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2xvc2VSZXN1bHQgPSB0aGlzLmRvQ2xvc2VFZGl0b3IoY2FuZGlkYXRlLCBjb250ZXh0LCBvcGVuTmV4dCk7XG5cblx0XHRpZiAoY2xvc2VSZXN1bHQpIHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDbG9zZUV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0UsXG5cdFx0XHRcdC4uLmNsb3NlUmVzdWx0XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblxuXHRcdFx0cmV0dXJuIGNsb3NlUmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGRvQ2xvc2VFZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCwgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0LCBvcGVuTmV4dDogYm9vbGVhbik6IElFZGl0b3JDbG9zZVJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmluZGV4T2YoY2FuZGlkYXRlKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBub3QgZm91bmRcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvcnNbaW5kZXhdO1xuXHRcdGNvbnN0IHN0aWNreSA9IHRoaXMuaXNTdGlja3koaW5kZXgpO1xuXG5cdFx0Ly8gQWN0aXZlIGVkaXRvciBjbG9zZWRcblx0XHRjb25zdCBpc0FjdGl2ZUVkaXRvciA9IHRoaXMuYWN0aXZlID09PSBlZGl0b3I7XG5cdFx0aWYgKG9wZW5OZXh0ICYmIGlzQWN0aXZlRWRpdG9yKSB7XG5cblx0XHRcdC8vIE1vcmUgdGhhbiBvbmUgZWRpdG9yXG5cdFx0XHRpZiAodGhpcy5tcnUubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRsZXQgbmV3QWN0aXZlOiBFZGl0b3JJbnB1dDtcblx0XHRcdFx0aWYgKHRoaXMuZm9jdXNSZWNlbnRFZGl0b3JBZnRlckNsb3NlKSB7XG5cdFx0XHRcdFx0bmV3QWN0aXZlID0gdGhpcy5tcnVbMV07IC8vIGFjdGl2ZSBlZGl0b3IgaXMgYWx3YXlzIGZpcnN0IGluIE1SVSwgc28gcGljayBzZWNvbmQgZWRpdG9yIGFmdGVyIGFzIG5ldyBhY3RpdmVcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoaW5kZXggPT09IHRoaXMuZWRpdG9ycy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0XHRuZXdBY3RpdmUgPSB0aGlzLmVkaXRvcnNbaW5kZXggLSAxXTsgLy8gbGFzdCBlZGl0b3IgaXMgY2xvc2VkLCBwaWNrIHByZXZpb3VzIGFzIG5ldyBhY3RpdmVcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bmV3QWN0aXZlID0gdGhpcy5lZGl0b3JzW2luZGV4ICsgMV07IC8vIHBpY2sgbmV4dCBlZGl0b3IgYXMgbmV3IGFjdGl2ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNlbGVjdCBlZGl0b3IgYXMgYWN0aXZlXG5cdFx0XHRcdGNvbnN0IG5ld0luYWN0aXZlU2VsZWN0ZWRFZGl0b3JzID0gdGhpcy5zZWxlY3Rpb24uZmlsdGVyKHNlbGVjdGVkID0+IHNlbGVjdGVkICE9PSBlZGl0b3IgJiYgc2VsZWN0ZWQgIT09IG5ld0FjdGl2ZSk7XG5cdFx0XHRcdHRoaXMuZG9TZXRTZWxlY3Rpb24obmV3QWN0aXZlLCB0aGlzLmVkaXRvcnMuaW5kZXhPZihuZXdBY3RpdmUpLCBuZXdJbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExhc3QgZWRpdG9yIGNsb3NlZDogY2xlYXIgc2VsZWN0aW9uXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5kb1NldFNlbGVjdGlvbihudWxsLCB1bmRlZmluZWQsIFtdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbmFjdGl2ZSBlZGl0b3IgY2xvc2VkXG5cdFx0ZWxzZSBpZiAoIWlzQWN0aXZlRWRpdG9yKSB7XG5cblx0XHRcdC8vIFJlbW92ZSBlZGl0b3IgZnJvbSBpbmFjdGl2ZSBzZWxlY3Rpb25cblx0XHRcdGlmICh0aGlzLmRvSXNTZWxlY3RlZChlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0luYWN0aXZlU2VsZWN0ZWRFZGl0b3JzID0gdGhpcy5zZWxlY3Rpb24uZmlsdGVyKHNlbGVjdGVkID0+IHNlbGVjdGVkICE9PSBlZGl0b3IgJiYgc2VsZWN0ZWQgIT09IHRoaXMuYWN0aXZlRWRpdG9yKTtcblx0XHRcdFx0dGhpcy5kb1NldFNlbGVjdGlvbih0aGlzLmFjdGl2ZUVkaXRvciwgdGhpcy5pbmRleE9mKHRoaXMuYWN0aXZlRWRpdG9yKSwgbmV3SW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFByZXZpZXcgRWRpdG9yIGNsb3NlZFxuXHRcdGlmICh0aGlzLnByZXZpZXcgPT09IGVkaXRvcikge1xuXHRcdFx0dGhpcy5wcmV2aWV3ID0gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZnJvbSB0cmFuc2llbnRcblx0XHR0aGlzLnRyYW5zaWVudC5kZWxldGUoZWRpdG9yKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIGFycmF5c1xuXHRcdHRoaXMuc3BsaWNlKGluZGV4LCB0cnVlKTtcblxuXHRcdC8vIEV2ZW50XG5cdFx0cmV0dXJuIHsgZWRpdG9yLCBzdGlja3ksIGVkaXRvckluZGV4OiBpbmRleCwgY29udGV4dCB9O1xuXHR9XG5cblx0bW92ZUVkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0LCB0b0luZGV4OiBudW1iZXIpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBFbnN1cmUgdG9JbmRleCBpcyBpbiBib3VuZHMgb2Ygb3VyIG1vZGVsXG5cdFx0aWYgKHRvSW5kZXggPj0gdGhpcy5lZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0dG9JbmRleCA9IHRoaXMuZWRpdG9ycy5sZW5ndGggLSAxO1xuXHRcdH0gZWxzZSBpZiAodG9JbmRleCA8IDApIHtcblx0XHRcdHRvSW5kZXggPSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbmRleE9mKGNhbmRpZGF0ZSk7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCB0b0luZGV4ID09PSBpbmRleCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZWRpdG9yc1tpbmRleF07XG5cdFx0Y29uc3Qgc3RpY2t5ID0gdGhpcy5zdGlja3k7XG5cblx0XHQvLyBBZGp1c3Qgc3RpY2t5IGluZGV4OiBlZGl0b3IgbW92ZWQgb3V0IG9mIHN0aWNreSBzdGF0ZSBpbnRvIHVuc3RpY2t5IHN0YXRlXG5cdFx0aWYgKHRoaXMuaXNTdGlja3koaW5kZXgpICYmIHRvSW5kZXggPiB0aGlzLnN0aWNreSkge1xuXHRcdFx0dGhpcy5zdGlja3ktLTtcblx0XHR9XG5cblx0XHQvLyAuLi5vciBlZGl0b3IgbW92ZWQgaW50byBzdGlja3kgc3RhdGUgZnJvbSB1bnN0aWNreSBzdGF0ZVxuXHRcdGVsc2UgaWYgKCF0aGlzLmlzU3RpY2t5KGluZGV4KSAmJiB0b0luZGV4IDw9IHRoaXMuc3RpY2t5KSB7XG5cdFx0XHR0aGlzLnN0aWNreSsrO1xuXHRcdH1cblxuXHRcdC8vIE1vdmVcblx0XHR0aGlzLmVkaXRvcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLmVkaXRvcnMuc3BsaWNlKHRvSW5kZXgsIDAsIGVkaXRvcik7XG5cblx0XHQvLyBNb3ZlIEV2ZW50XG5cdFx0Y29uc3QgZXZlbnQ6IElHcm91cEVkaXRvck1vdmVFdmVudCA9IHtcblx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9NT1ZFLFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0b2xkRWRpdG9ySW5kZXg6IGluZGV4LFxuXHRcdFx0ZWRpdG9ySW5kZXg6IHRvSW5kZXhcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cblx0XHQvLyBTdGlja3kgRXZlbnQgKGlmIHN0aWNreSBjaGFuZ2VkIGFzIHBhcnQgb2YgdGhlIG1vdmUpXG5cdFx0aWYgKHN0aWNreSAhPT0gdGhpcy5zdGlja3kpIHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1NUSUNLWSxcblx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JJbmRleDogdG9JbmRleFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHNldEFjdGl2ZShjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdHRoaXMuc2V0R3JvdXBBY3RpdmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gdGhpcy5zZXRFZGl0b3JBY3RpdmUoY2FuZGlkYXRlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRHcm91cEFjdGl2ZSgpOiB2b2lkIHtcblx0XHQvLyBXZSBkbyBub3QgcmVhbGx5IGtlZXAgdGhlIGBhY3RpdmVgIHN0YXRlIGluIG91ciBtb2RlbCBiZWNhdXNlXG5cdFx0Ly8gaXQgaGFzIG5vIHNwZWNpYWwgbWVhbmluZyB0byB1cyBoZXJlLiBCdXQgZm9yIGNvbnNpc3RlbmN5XG5cdFx0Ly8gd2UgZW1pdCBhIGBvbkRpZE1vZGVsQ2hhbmdlYCBldmVudCBzbyB0aGF0IGNvbXBvbmVudHMgY2FuXG5cdFx0Ly8gcmVhY3QuXG5cdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKHsga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfQUNUSVZFIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFZGl0b3JBY3RpdmUoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXMgPSB0aGlzLmZpbmRFZGl0b3IoY2FuZGlkYXRlKTtcblx0XHRpZiAoIXJlcykge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgZm91bmRcblx0XHR9XG5cblx0XHRjb25zdCBbZWRpdG9yLCBlZGl0b3JJbmRleF0gPSByZXM7XG5cblx0XHR0aGlzLmRvU2V0U2VsZWN0aW9uKGVkaXRvciwgZWRpdG9ySW5kZXgsIFtdKTtcblxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRnZXQgc2VsZWN0ZWRFZGl0b3JzKCk6IEVkaXRvcklucHV0W10ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiB0aGlzLmRvSXNTZWxlY3RlZChlZGl0b3IpKTsgLy8gcmV0dXJuIGluIHNlcXVlbnRpYWwgb3JkZXJcblx0fVxuXG5cdGlzU2VsZWN0ZWQoZWRpdG9yQ2FuZGlkYXRlT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuIHtcblx0XHRsZXQgZWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGVkaXRvckNhbmRpZGF0ZU9ySW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRlZGl0b3IgPSB0aGlzLmVkaXRvcnNbZWRpdG9yQ2FuZGlkYXRlT3JJbmRleF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVkaXRvciA9IHRoaXMuZmluZEVkaXRvcihlZGl0b3JDYW5kaWRhdGVPckluZGV4KT8uWzBdO1xuXHRcdH1cblxuXHRcdHJldHVybiAhIWVkaXRvciAmJiB0aGlzLmRvSXNTZWxlY3RlZChlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0lzU2VsZWN0ZWQoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdGlvbi5pbmNsdWRlcyhlZGl0b3IpO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9uKGFjdGl2ZVNlbGVjdGVkRWRpdG9yQ2FuZGlkYXRlOiBFZGl0b3JJbnB1dCwgaW5hY3RpdmVTZWxlY3RlZEVkaXRvckNhbmRpZGF0ZXM6IEVkaXRvcklucHV0W10pOiB2b2lkIHtcblx0XHRjb25zdCByZXMgPSB0aGlzLmZpbmRFZGl0b3IoYWN0aXZlU2VsZWN0ZWRFZGl0b3JDYW5kaWRhdGUpO1xuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdH1cblxuXHRcdGNvbnN0IFthY3RpdmVTZWxlY3RlZEVkaXRvciwgYWN0aXZlU2VsZWN0ZWRFZGl0b3JJbmRleF0gPSByZXM7XG5cblx0XHRjb25zdCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyA9IG5ldyBTZXQ8RWRpdG9ySW5wdXQ+KCk7XG5cdFx0Zm9yIChjb25zdCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9yQ2FuZGlkYXRlIG9mIGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JDYW5kaWRhdGVzKSB7XG5cdFx0XHRjb25zdCByZXMgPSB0aGlzLmZpbmRFZGl0b3IoaW5hY3RpdmVTZWxlY3RlZEVkaXRvckNhbmRpZGF0ZSk7XG5cdFx0XHRpZiAoIXJlcykge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBbaW5hY3RpdmVTZWxlY3RlZEVkaXRvcl0gPSByZXM7XG5cdFx0XHRpZiAoaW5hY3RpdmVTZWxlY3RlZEVkaXRvciA9PT0gYWN0aXZlU2VsZWN0ZWRFZGl0b3IpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIGFscmVhZHkgc2VsZWN0ZWRcblx0XHRcdH1cblxuXHRcdFx0aW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMuYWRkKGluYWN0aXZlU2VsZWN0ZWRFZGl0b3IpO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9TZXRTZWxlY3Rpb24oYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIGFjdGl2ZVNlbGVjdGVkRWRpdG9ySW5kZXgsIEFycmF5LmZyb20oaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMpKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZXRTZWxlY3Rpb24oYWN0aXZlU2VsZWN0ZWRFZGl0b3I6IEVkaXRvcklucHV0IHwgbnVsbCwgYWN0aXZlU2VsZWN0ZWRFZGl0b3JJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlRWRpdG9yID0gdGhpcy5hY3RpdmVFZGl0b3I7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbjtcblxuXHRcdGxldCBuZXdTZWxlY3Rpb246IEVkaXRvcklucHV0W107XG5cdFx0aWYgKGFjdGl2ZVNlbGVjdGVkRWRpdG9yKSB7XG5cdFx0XHRuZXdTZWxlY3Rpb24gPSBbYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIC4uLmluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3U2VsZWN0aW9uID0gW107XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHNlbGVjdGlvblxuXHRcdHRoaXMuc2VsZWN0aW9uID0gbmV3U2VsZWN0aW9uO1xuXG5cdFx0Ly8gVXBkYXRlIGFjdGl2ZSBlZGl0b3IgaWYgaXQgaGFzIGNoYW5nZWRcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VkID0gYWN0aXZlU2VsZWN0ZWRFZGl0b3IgJiYgdHlwZW9mIGFjdGl2ZVNlbGVjdGVkRWRpdG9ySW5kZXggPT09ICdudW1iZXInICYmIHByZXZpb3VzQWN0aXZlRWRpdG9yICE9PSBhY3RpdmVTZWxlY3RlZEVkaXRvcjtcblx0XHRpZiAoYWN0aXZlRWRpdG9yQ2hhbmdlZCkge1xuXG5cdFx0XHQvLyBCcmluZyB0byBmcm9udCBpbiBNUlUgbGlzdFxuXHRcdFx0Y29uc3QgbXJ1SW5kZXggPSB0aGlzLmluZGV4T2YoYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIHRoaXMubXJ1KTtcblx0XHRcdHRoaXMubXJ1LnNwbGljZShtcnVJbmRleCwgMSk7XG5cdFx0XHR0aGlzLm1ydS51bnNoaWZ0KGFjdGl2ZVNlbGVjdGVkRWRpdG9yKTtcblxuXHRcdFx0Ly8gRXZlbnRcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0FDVElWRSxcblx0XHRcdFx0ZWRpdG9yOiBhY3RpdmVTZWxlY3RlZEVkaXRvcixcblx0XHRcdFx0ZWRpdG9ySW5kZXg6IGFjdGl2ZVNlbGVjdGVkRWRpdG9ySW5kZXhcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHRcdH1cblxuXHRcdC8vIEZpcmUgZXZlbnQgaWYgdGhlIHNlbGVjdGlvbiBoYXMgY2hhbmdlZFxuXHRcdGlmIChcblx0XHRcdGFjdGl2ZUVkaXRvckNoYW5nZWQgfHxcblx0XHRcdHByZXZpb3VzU2VsZWN0aW9uLmxlbmd0aCAhPT0gbmV3U2VsZWN0aW9uLmxlbmd0aCB8fFxuXHRcdFx0cHJldmlvdXNTZWxlY3Rpb24uc29tZShlZGl0b3IgPT4gIW5ld1NlbGVjdGlvbi5pbmNsdWRlcyhlZGl0b3IpKVxuXHRcdCkge1xuXHRcdFx0Y29uc3QgZXZlbnQ6IElHcm91cE1vZGVsQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUlNfU0VMRUNUSU9OXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRzZXRJbmRleChpbmRleDogbnVtYmVyKSB7XG5cdFx0Ly8gV2UgZG8gbm90IHJlYWxseSBrZWVwIHRoZSBgaW5kZXhgIGluIG91ciBtb2RlbCBiZWNhdXNlXG5cdFx0Ly8gaXQgaGFzIG5vIHNwZWNpYWwgbWVhbmluZyB0byB1cyBoZXJlLiBCdXQgZm9yIGNvbnNpc3RlbmN5XG5cdFx0Ly8gd2UgZW1pdCBhIGBvbkRpZE1vZGVsQ2hhbmdlYCBldmVudCBzbyB0aGF0IGNvbXBvbmVudHMgY2FuXG5cdFx0Ly8gcmVhY3QuXG5cdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKHsga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfSU5ERVggfSk7XG5cdH1cblxuXHRzZXRMYWJlbChsYWJlbDogc3RyaW5nKSB7XG5cdFx0Ly8gV2UgZG8gbm90IHJlYWxseSBrZWVwIHRoZSBgbGFiZWxgIGluIG91ciBtb2RlbCBiZWNhdXNlXG5cdFx0Ly8gaXQgaGFzIG5vIHNwZWNpYWwgbWVhbmluZyB0byB1cyBoZXJlLiBCdXQgZm9yIGNvbnNpc3RlbmN5XG5cdFx0Ly8gd2UgZW1pdCBhIGBvbkRpZE1vZGVsQ2hhbmdlYCBldmVudCBzbyB0aGF0IGNvbXBvbmVudHMgY2FuXG5cdFx0Ly8gcmVhY3QuXG5cdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKHsga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTEFCRUwgfSk7XG5cdH1cblxuXHRwaW4oY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXMgPSB0aGlzLmZpbmRFZGl0b3IoY2FuZGlkYXRlKTtcblx0XHRpZiAoIXJlcykge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgZm91bmRcblx0XHR9XG5cblx0XHRjb25zdCBbZWRpdG9yLCBlZGl0b3JJbmRleF0gPSByZXM7XG5cblx0XHR0aGlzLmRvUGluKGVkaXRvciwgZWRpdG9ySW5kZXgpO1xuXG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgZG9QaW4oZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzUGlubmVkKGVkaXRvcikpIHtcblx0XHRcdHJldHVybjsgLy8gY2FuIG9ubHkgcGluIGEgcHJldmlldyBlZGl0b3Jcblx0XHR9XG5cblx0XHQvLyBDbGVhciBUcmFuc2llbnRcblx0XHR0aGlzLnNldFRyYW5zaWVudChlZGl0b3IsIGZhbHNlKTtcblxuXHRcdC8vIENvbnZlcnQgdGhlIHByZXZpZXcgZWRpdG9yIHRvIGJlIGEgcGlubmVkIGVkaXRvclxuXHRcdHRoaXMucHJldmlldyA9IG51bGw7XG5cblx0XHQvLyBFdmVudFxuXHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9QSU4sXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRlZGl0b3JJbmRleFxuXHRcdH07XG5cdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHVucGluKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzID0gdGhpcy5maW5kRWRpdG9yKGNhbmRpZGF0ZSk7XG5cdFx0aWYgKCFyZXMpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGZvdW5kXG5cdFx0fVxuXG5cdFx0Y29uc3QgW2VkaXRvciwgZWRpdG9ySW5kZXhdID0gcmVzO1xuXG5cdFx0dGhpcy5kb1VucGluKGVkaXRvciwgZWRpdG9ySW5kZXgpO1xuXG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgZG9VbnBpbihlZGl0b3I6IEVkaXRvcklucHV0LCBlZGl0b3JJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUGlubmVkKGVkaXRvcikpIHtcblx0XHRcdHJldHVybjsgLy8gY2FuIG9ubHkgdW5waW4gYSBwaW5uZWQgZWRpdG9yXG5cdFx0fVxuXG5cdFx0Ly8gU2V0IG5ld1xuXHRcdGNvbnN0IG9sZFByZXZpZXcgPSB0aGlzLnByZXZpZXc7XG5cdFx0dGhpcy5wcmV2aWV3ID0gZWRpdG9yO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfUElOLFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0ZWRpdG9ySW5kZXhcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cblx0XHQvLyBDbG9zZSBvbGQgcHJldmlldyBlZGl0b3IgaWYgYW55XG5cdFx0aWYgKG9sZFByZXZpZXcpIHtcblx0XHRcdHRoaXMuY2xvc2VFZGl0b3Iob2xkUHJldmlldywgRWRpdG9yQ2xvc2VDb250ZXh0LlVOUElOKTtcblx0XHR9XG5cdH1cblxuXHRpc1Bpbm5lZChlZGl0b3JDYW5kaWRhdGVPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGxldCBlZGl0b3I6IEVkaXRvcklucHV0O1xuXHRcdGlmICh0eXBlb2YgZWRpdG9yQ2FuZGlkYXRlT3JJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGVkaXRvciA9IHRoaXMuZWRpdG9yc1tlZGl0b3JDYW5kaWRhdGVPckluZGV4XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWRpdG9yID0gZWRpdG9yQ2FuZGlkYXRlT3JJbmRleDtcblx0XHR9XG5cblx0XHRyZXR1cm4gIXRoaXMubWF0Y2hlcyh0aGlzLnByZXZpZXcsIGVkaXRvcik7XG5cdH1cblxuXHRzdGljayhjYW5kaWRhdGU6IEVkaXRvcklucHV0KTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcyA9IHRoaXMuZmluZEVkaXRvcihjYW5kaWRhdGUpO1xuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdH1cblxuXHRcdGNvbnN0IFtlZGl0b3IsIGVkaXRvckluZGV4XSA9IHJlcztcblxuXHRcdHRoaXMuZG9TdGljayhlZGl0b3IsIGVkaXRvckluZGV4KTtcblxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIGRvU3RpY2soZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzU3RpY2t5KGVkaXRvckluZGV4KSkge1xuXHRcdFx0cmV0dXJuOyAvLyBjYW4gb25seSBzdGljayBhIG5vbi1zdGlja3kgZWRpdG9yXG5cdFx0fVxuXG5cdFx0Ly8gUGluIGVkaXRvclxuXHRcdHRoaXMucGluKGVkaXRvcik7XG5cblx0XHQvLyBNb3ZlIGVkaXRvciB0byBiZSB0aGUgbGFzdCBzdGlja3kgZWRpdG9yXG5cdFx0Y29uc3QgbmV3RWRpdG9ySW5kZXggPSB0aGlzLnN0aWNreSArIDE7XG5cdFx0dGhpcy5tb3ZlRWRpdG9yKGVkaXRvciwgbmV3RWRpdG9ySW5kZXgpO1xuXG5cdFx0Ly8gQWRqdXN0IHN0aWNreSBpbmRleFxuXHRcdHRoaXMuc3RpY2t5Kys7XG5cblx0XHQvLyBFdmVudFxuXHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCA9IHtcblx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1ksXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRlZGl0b3JJbmRleDogbmV3RWRpdG9ySW5kZXhcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHR1bnN0aWNrKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzID0gdGhpcy5maW5kRWRpdG9yKGNhbmRpZGF0ZSk7XG5cdFx0aWYgKCFyZXMpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGZvdW5kXG5cdFx0fVxuXG5cdFx0Y29uc3QgW2VkaXRvciwgZWRpdG9ySW5kZXhdID0gcmVzO1xuXG5cdFx0dGhpcy5kb1Vuc3RpY2soZWRpdG9yLCBlZGl0b3JJbmRleCk7XG5cblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Vuc3RpY2soZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1N0aWNreShlZGl0b3JJbmRleCkpIHtcblx0XHRcdHJldHVybjsgLy8gY2FuIG9ubHkgdW5zdGljayBhIHN0aWNreSBlZGl0b3Jcblx0XHR9XG5cblx0XHQvLyBNb3ZlIGVkaXRvciB0byBiZSB0aGUgZmlyc3Qgbm9uLXN0aWNreSBlZGl0b3Jcblx0XHRjb25zdCBuZXdFZGl0b3JJbmRleCA9IHRoaXMuc3RpY2t5O1xuXHRcdHRoaXMubW92ZUVkaXRvcihlZGl0b3IsIG5ld0VkaXRvckluZGV4KTtcblxuXHRcdC8vIEFkanVzdCBzdGlja3kgaW5kZXhcblx0XHR0aGlzLnN0aWNreS0tO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfU1RJQ0tZLFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0ZWRpdG9ySW5kZXg6IG5ld0VkaXRvckluZGV4XG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0aXNTdGlja3koY2FuZGlkYXRlT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5zdGlja3kgPCAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vIHN0aWNreSBlZGl0b3Jcblx0XHR9XG5cblx0XHRsZXQgaW5kZXg6IG51bWJlcjtcblx0XHRpZiAodHlwZW9mIGNhbmRpZGF0ZU9ySW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRpbmRleCA9IGNhbmRpZGF0ZU9ySW5kZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluZGV4ID0gdGhpcy5pbmRleE9mKGNhbmRpZGF0ZU9ySW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXggPD0gdGhpcy5zdGlja3k7XG5cdH1cblxuXHRzZXRUcmFuc2llbnQoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCwgdHJhbnNpZW50OiBib29sZWFuKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdHJhbnNpZW50ICYmIHRoaXMudHJhbnNpZW50LnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjsgLy8gbm8gdHJhbnNpZW50IGVkaXRvclxuXHRcdH1cblxuXHRcdGNvbnN0IHJlcyA9IHRoaXMuZmluZEVkaXRvcihjYW5kaWRhdGUpO1xuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdH1cblxuXHRcdGNvbnN0IFtlZGl0b3IsIGVkaXRvckluZGV4XSA9IHJlcztcblxuXHRcdHRoaXMuZG9TZXRUcmFuc2llbnQoZWRpdG9yLCBlZGl0b3JJbmRleCwgdHJhbnNpZW50KTtcblxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0VHJhbnNpZW50KGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIsIHRyYW5zaWVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0cmFuc2llbnQpIHtcblx0XHRcdGlmICh0aGlzLnRyYW5zaWVudC5oYXMoZWRpdG9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJhbnNpZW50LmFkZChlZGl0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMudHJhbnNpZW50LmhhcyhlZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50cmFuc2llbnQuZGVsZXRlKGVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfVFJBTlNJRU5ULFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0ZWRpdG9ySW5kZXhcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHRpc1RyYW5zaWVudChlZGl0b3JDYW5kaWRhdGVPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnRyYW5zaWVudC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vIHRyYW5zaWVudCBlZGl0b3Jcblx0XHR9XG5cblx0XHRsZXQgZWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGVkaXRvckNhbmRpZGF0ZU9ySW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRlZGl0b3IgPSB0aGlzLmVkaXRvcnNbZWRpdG9yQ2FuZGlkYXRlT3JJbmRleF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVkaXRvciA9IHRoaXMuZmluZEVkaXRvcihlZGl0b3JDYW5kaWRhdGVPckluZGV4KT8uWzBdO1xuXHRcdH1cblxuXHRcdHJldHVybiAhIWVkaXRvciAmJiB0aGlzLnRyYW5zaWVudC5oYXMoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgc3BsaWNlKGluZGV4OiBudW1iZXIsIGRlbDogYm9vbGVhbiwgZWRpdG9yPzogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JUb0RlbGV0ZU9yUmVwbGFjZSA9IHRoaXMuZWRpdG9yc1tpbmRleF07XG5cblx0XHQvLyBQZXJmb3JtIG9uIHN0aWNreSBpbmRleFxuXHRcdGlmIChkZWwgJiYgdGhpcy5pc1N0aWNreShpbmRleCkpIHtcblx0XHRcdHRoaXMuc3RpY2t5LS07XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBvbiBlZGl0b3JzIGFycmF5XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0dGhpcy5lZGl0b3JzLnNwbGljZShpbmRleCwgZGVsID8gMSA6IDAsIGVkaXRvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdG9ycy5zcGxpY2UoaW5kZXgsIGRlbCA/IDEgOiAwKTtcblx0XHR9XG5cblx0XHQvLyBQZXJmb3JtIG9uIE1SVVxuXHRcdHtcblx0XHRcdC8vIEFkZFxuXHRcdFx0aWYgKCFkZWwgJiYgZWRpdG9yKSB7XG5cdFx0XHRcdGlmICh0aGlzLm1ydS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyB0aGUgbGlzdCBvZiBtb3N0IHJlY2VudCBlZGl0b3JzIGlzIGVtcHR5XG5cdFx0XHRcdFx0Ly8gc28gdGhpcyBlZGl0b3IgY2FuIG9ubHkgYmUgdGhlIG1vc3QgcmVjZW50XG5cdFx0XHRcdFx0dGhpcy5tcnUucHVzaChlZGl0b3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHdlIGhhdmUgbW9zdCByZWNlbnQgZWRpdG9ycy4gYXMgc3VjaCB3ZVxuXHRcdFx0XHRcdC8vIHB1dCB0aGlzIG5ld2x5IG9wZW5lZCBlZGl0b3IgcmlnaHQgYWZ0ZXJcblx0XHRcdFx0XHQvLyB0aGUgY3VycmVudCBtb3N0IHJlY2VudCBvbmUgYmVjYXVzZSBpdCBjYW5ub3Rcblx0XHRcdFx0XHQvLyBiZSB0aGUgbW9zdCByZWNlbnRseSBhY3RpdmUgb25lIHVubGVzc1xuXHRcdFx0XHRcdC8vIGl0IGJlY29tZXMgYWN0aXZlLiBidXQgaXQgaXMgc3RpbGwgbW9yZVxuXHRcdFx0XHRcdC8vIGFjdGl2ZSB0aGVuIGFueSBvdGhlciBlZGl0b3IgaW4gdGhlIGxpc3QuXG5cdFx0XHRcdFx0dGhpcy5tcnUuc3BsaWNlKDEsIDAsIGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIC8gUmVwbGFjZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4SW5NUlUgPSB0aGlzLmluZGV4T2YoZWRpdG9yVG9EZWxldGVPclJlcGxhY2UsIHRoaXMubXJ1KTtcblxuXHRcdFx0XHQvLyBSZW1vdmVcblx0XHRcdFx0aWYgKGRlbCAmJiAhZWRpdG9yKSB7XG5cdFx0XHRcdFx0dGhpcy5tcnUuc3BsaWNlKGluZGV4SW5NUlUsIDEpOyAvLyByZW1vdmUgZnJvbSBNUlVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlcGxhY2Vcblx0XHRcdFx0ZWxzZSBpZiAoZGVsICYmIGVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMubXJ1LnNwbGljZShpbmRleEluTVJVLCAxLCBlZGl0b3IpOyAvLyByZXBsYWNlIE1SVSBhdCBsb2NhdGlvblxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW5kZXhPZihjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IG51bGwsIGVkaXRvcnMgPSB0aGlzLmVkaXRvcnMsIG9wdGlvbnM/OiBJTWF0Y2hFZGl0b3JPcHRpb25zKTogbnVtYmVyIHtcblx0XHRsZXQgaW5kZXggPSAtMTtcblx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWRpdG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9yc1tpXTtcblxuXHRcdFx0aWYgKHRoaXMubWF0Y2hlcyhlZGl0b3IsIGNhbmRpZGF0ZSwgb3B0aW9ucykpIHtcblx0XHRcdFx0Ly8gSWYgd2UgYXJlIHRvIHN1cHBvcnQgc2lkZSBieSBzaWRlIG1hdGNoaW5nLCBpdCBpcyBwb3NzaWJsZSB0aGF0XG5cdFx0XHRcdC8vIGEgYmV0dGVyIGRpcmVjdCBtYXRjaCBpcyBmb3VuZCBsYXRlci4gQXMgc3VjaCwgd2UgY29udGludWUgZmluZGluZ1xuXHRcdFx0XHQvLyBhIG1hdGNoaW5nIGVkaXRvciBhbmQgcHJlZmVyIHRoYXQgbWF0Y2ggb3ZlciB0aGUgc2lkZSBieSBzaWRlIG9uZS5cblx0XHRcdFx0aWYgKG9wdGlvbnM/LnN1cHBvcnRTaWRlQnlTaWRlICYmIGVkaXRvciBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCAmJiAhKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCkpIHtcblx0XHRcdFx0XHRpbmRleCA9IGk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZGV4O1xuXHR9XG5cblx0ZmluZEVkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgbnVsbCwgb3B0aW9ucz86IElNYXRjaEVkaXRvck9wdGlvbnMpOiBbRWRpdG9ySW5wdXQsIG51bWJlciAvKiBpbmRleCAqL10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbmRleE9mKGNhbmRpZGF0ZSwgdGhpcy5lZGl0b3JzLCBvcHRpb25zKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBbdGhpcy5lZGl0b3JzW2luZGV4XSwgaW5kZXhdO1xuXHR9XG5cblx0aXNGaXJzdChjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgbnVsbCwgZWRpdG9ycyA9IHRoaXMuZWRpdG9ycyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1hdGNoZXMoZWRpdG9yc1swXSwgY2FuZGlkYXRlKTtcblx0fVxuXG5cdGlzTGFzdChjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgbnVsbCwgZWRpdG9ycyA9IHRoaXMuZWRpdG9ycyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1hdGNoZXMoZWRpdG9yc1tlZGl0b3JzLmxlbmd0aCAtIDFdLCBjYW5kaWRhdGUpO1xuXHR9XG5cblx0Y29udGFpbnMoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJTWF0Y2hFZGl0b3JPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXhPZihjYW5kaWRhdGUsIHRoaXMuZWRpdG9ycywgb3B0aW9ucykgIT09IC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBudWxsIHwgdW5kZWZpbmVkLCBjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IG51bGwsIG9wdGlvbnM/OiBJTWF0Y2hFZGl0b3JPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFlZGl0b3IgfHwgIWNhbmRpZGF0ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSAmJiBlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgJiYgIShjYW5kaWRhdGUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRzd2l0Y2ggKG9wdGlvbnMuc3VwcG9ydFNpZGVCeVNpZGUpIHtcblx0XHRcdFx0Y2FzZSBTaWRlQnlTaWRlRWRpdG9yLkFOWTpcblx0XHRcdFx0XHRpZiAodGhpcy5tYXRjaGVzKGVkaXRvci5wcmltYXJ5LCBjYW5kaWRhdGUsIG9wdGlvbnMpIHx8IHRoaXMubWF0Y2hlcyhlZGl0b3Iuc2Vjb25kYXJ5LCBjYW5kaWRhdGUsIG9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU2lkZUJ5U2lkZUVkaXRvci5CT1RIOlxuXHRcdFx0XHRcdGlmICh0aGlzLm1hdGNoZXMoZWRpdG9yLnByaW1hcnksIGNhbmRpZGF0ZSwgb3B0aW9ucykgJiYgdGhpcy5tYXRjaGVzKGVkaXRvci5zZWNvbmRhcnksIGNhbmRpZGF0ZSwgb3B0aW9ucykpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdHJpY3RFcXVhbHMgPSBlZGl0b3IgPT09IGNhbmRpZGF0ZTtcblxuXHRcdGlmIChvcHRpb25zPy5zdHJpY3RFcXVhbHMpIHtcblx0XHRcdHJldHVybiBzdHJpY3RFcXVhbHM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0cmljdEVxdWFscyB8fCBlZGl0b3IubWF0Y2hlcyhjYW5kaWRhdGUpO1xuXHR9XG5cblx0Z2V0IGlzTG9ja2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmxvY2tlZDtcblx0fVxuXG5cdGxvY2sobG9ja2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNMb2NrZWQgIT09IGxvY2tlZCkge1xuXHRcdFx0dGhpcy5sb2NrZWQgPSBsb2NrZWQ7XG5cblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZSh7IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xPQ0tFRCB9KTtcblx0XHR9XG5cdH1cblxuXHRjbG9uZSgpOiBFZGl0b3JHcm91cE1vZGVsIHtcblx0XHRjb25zdCBjbG9uZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIENvcHkgb3ZlciBncm91cCBwcm9wZXJ0aWVzXG5cdFx0Y2xvbmUuZWRpdG9ycyA9IHRoaXMuZWRpdG9ycy5zbGljZSgwKTtcblx0XHRjbG9uZS5tcnUgPSB0aGlzLm1ydS5zbGljZSgwKTtcblx0XHRjbG9uZS5wcmV2aWV3ID0gdGhpcy5wcmV2aWV3O1xuXHRcdGNsb25lLnNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uLnNsaWNlKDApO1xuXHRcdGNsb25lLnN0aWNreSA9IHRoaXMuc3RpY2t5O1xuXG5cdFx0Ly8gRW5zdXJlIHRvIHJlZ2lzdGVyIGxpc3RlbmVycyBmb3IgZWFjaCBlZGl0b3Jcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjbG9uZS5lZGl0b3JzKSB7XG5cdFx0XHRjbG9uZS5yZWdpc3RlckVkaXRvckxpc3RlbmVycyhlZGl0b3IpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjbG9uZTtcblx0fVxuXG5cdHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KTtcblxuXHRcdC8vIFNlcmlhbGl6ZSBhbGwgZWRpdG9yIGlucHV0cyBzbyB0aGF0IHdlIGNhbiBzdG9yZSB0aGVtLlxuXHRcdC8vIEVkaXRvcnMgdGhhdCBjYW5ub3QgYmUgc2VyaWFsaXplZCBuZWVkIHRvIGJlIGlnbm9yZWRcblx0XHQvLyBmcm9tIG1ydSwgYWN0aXZlLCBwcmV2aWV3IGFuZCBzdGlja3kgaWYgYW55LlxuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZUVkaXRvcnM6IEVkaXRvcklucHV0W10gPSBbXTtcblx0XHRjb25zdCBzZXJpYWxpemVkRWRpdG9yczogSVNlcmlhbGl6ZWRFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0bGV0IHNlcmlhbGl6YWJsZVByZXZpZXdJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZXJpYWxpemFibGVTdGlja3kgPSB0aGlzLnN0aWNreTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5lZGl0b3JzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvcnNbaV07XG5cdFx0XHRsZXQgY2FuU2VyaWFsaXplRWRpdG9yID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGVkaXRvclNlcmlhbGl6ZXIgPSByZWdpc3RyeS5nZXRFZGl0b3JTZXJpYWxpemVyKGVkaXRvcik7XG5cdFx0XHRpZiAoZWRpdG9yU2VyaWFsaXplcikge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVkaXRvclNlcmlhbGl6ZXIuY2FuU2VyaWFsaXplKGVkaXRvcikgPyBlZGl0b3JTZXJpYWxpemVyLnNlcmlhbGl6ZShlZGl0b3IpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIEVkaXRvciBjYW4gYmUgc2VyaWFsaXplZFxuXHRcdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNhblNlcmlhbGl6ZUVkaXRvciA9IHRydWU7XG5cblx0XHRcdFx0XHRzZXJpYWxpemVkRWRpdG9ycy5wdXNoKHsgaWQ6IGVkaXRvci50eXBlSWQsIHZhbHVlIH0pO1xuXHRcdFx0XHRcdHNlcmlhbGl6YWJsZUVkaXRvcnMucHVzaChlZGl0b3IpO1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMucHJldmlldyA9PT0gZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRzZXJpYWxpemFibGVQcmV2aWV3SW5kZXggPSBzZXJpYWxpemFibGVFZGl0b3JzLmxlbmd0aCAtIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRWRpdG9yIGNhbm5vdCBiZSBzZXJpYWxpemVkXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNhblNlcmlhbGl6ZUVkaXRvciA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkanVzdCBpbmRleCBvZiBzdGlja3kgZWRpdG9ycyBpZiB0aGUgZWRpdG9yIGNhbm5vdCBiZSBzZXJpYWxpemVkIGFuZCBpcyBwaW5uZWRcblx0XHRcdGlmICghY2FuU2VyaWFsaXplRWRpdG9yICYmIHRoaXMuaXNTdGlja3koaSkpIHtcblx0XHRcdFx0c2VyaWFsaXphYmxlU3RpY2t5LS07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VyaWFsaXphYmxlTXJ1ID0gdGhpcy5tcnUubWFwKGVkaXRvciA9PiB0aGlzLmluZGV4T2YoZWRpdG9yLCBzZXJpYWxpemFibGVFZGl0b3JzKSkuZmlsdGVyKGkgPT4gaSA+PSAwKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdGxvY2tlZDogdGhpcy5sb2NrZWQgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0ZWRpdG9yczogc2VyaWFsaXplZEVkaXRvcnMsXG5cdFx0XHRtcnU6IHNlcmlhbGl6YWJsZU1ydSxcblx0XHRcdHByZXZpZXc6IHNlcmlhbGl6YWJsZVByZXZpZXdJbmRleCxcblx0XHRcdHN0aWNreTogc2VyaWFsaXphYmxlU3RpY2t5ID49IDAgPyBzZXJpYWxpemFibGVTdGlja3kgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBkZXNlcmlhbGl6ZShkYXRhOiBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KTtcblxuXHRcdGlmICh0eXBlb2YgZGF0YS5pZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuX2lkID0gZGF0YS5pZDtcblxuXHRcdFx0RWRpdG9yR3JvdXBNb2RlbC5JRFMgPSBNYXRoLm1heChkYXRhLmlkICsgMSwgRWRpdG9yR3JvdXBNb2RlbC5JRFMpOyAvLyBtYWtlIHN1cmUgb3VyIElEIGdlbmVyYXRvciBpcyBhbHdheXMgbGFyZ2VyXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lkID0gRWRpdG9yR3JvdXBNb2RlbC5JRFMrKzsgLy8gYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHR9XG5cblx0XHRpZiAoZGF0YS5sb2NrZWQpIHtcblx0XHRcdHRoaXMubG9ja2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvcnMgPSBjb2FsZXNjZShkYXRhLmVkaXRvcnMubWFwKChlLCBpbmRleCkgPT4ge1xuXHRcdFx0bGV0IGVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGVkaXRvclNlcmlhbGl6ZXIgPSByZWdpc3RyeS5nZXRFZGl0b3JTZXJpYWxpemVyKGUuaWQpO1xuXHRcdFx0aWYgKGVkaXRvclNlcmlhbGl6ZXIpIHtcblx0XHRcdFx0Y29uc3QgZGVzZXJpYWxpemVkRWRpdG9yID0gZWRpdG9yU2VyaWFsaXplci5kZXNlcmlhbGl6ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBlLnZhbHVlKTtcblx0XHRcdFx0aWYgKGRlc2VyaWFsaXplZEVkaXRvciBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0ZWRpdG9yID0gZGVzZXJpYWxpemVkRWRpdG9yO1xuXHRcdFx0XHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWVkaXRvciAmJiB0eXBlb2YgZGF0YS5zdGlja3kgPT09ICdudW1iZXInICYmIGluZGV4IDw9IGRhdGEuc3RpY2t5KSB7XG5cdFx0XHRcdGRhdGEuc3RpY2t5LS07IC8vIGlmIGVkaXRvciBjYW5ub3QgYmUgZGVzZXJpYWxpemVkIGJ1dCB3YXMgc3RpY2t5LCB3ZSBuZWVkIHRvIGRlY3JlYXNlIHN0aWNreSBpbmRleFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMubXJ1ID0gY29hbGVzY2UoZGF0YS5tcnUubWFwKGkgPT4gdGhpcy5lZGl0b3JzW2ldKSk7XG5cblx0XHR0aGlzLnNlbGVjdGlvbiA9IHRoaXMubXJ1Lmxlbmd0aCA+IDAgPyBbdGhpcy5tcnVbMF1dIDogW107XG5cblx0XHRpZiAodHlwZW9mIGRhdGEucHJldmlldyA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMucHJldmlldyA9IHRoaXMuZWRpdG9yc1tkYXRhLnByZXZpZXddO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgZGF0YS5zdGlja3kgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLnN0aWNreSA9IGRhdGEuc3RpY2t5O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZShBcnJheS5mcm9tKHRoaXMuZWRpdG9yTGlzdGVuZXJzKSk7XG5cdFx0dGhpcy5lZGl0b3JMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdHRoaXMudHJhbnNpZW50LmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNw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
