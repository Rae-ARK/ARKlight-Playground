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
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Disposable, isDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import Severity from "../../../base/common/severity.js";
import * as nls from "../../../nls.js";
import { IDialogService } from "../../dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { INotificationService } from "../../notification/common/notification.js";
import { IUndoRedoService, ResourceEditStackSnapshot, UndoRedoElementType, UndoRedoGroup, UndoRedoSource } from "./undoRedo.js";
const DEBUG = false;
function getResourceLabel(resource) {
  return resource.scheme === Schemas.file ? resource.fsPath : resource.path;
}
let stackElementCounter = 0;
class ResourceStackElement {
  constructor(actual, resourceLabel, strResource, groupId, groupOrder, sourceId, sourceOrder) {
    this.id = ++stackElementCounter;
    this.type = UndoRedoElementType.Resource;
    this.actual = actual;
    this.label = actual.label;
    this.confirmBeforeUndo = actual.confirmBeforeUndo || false;
    this.resourceLabel = resourceLabel;
    this.strResource = strResource;
    this.resourceLabels = [this.resourceLabel];
    this.strResources = [this.strResource];
    this.groupId = groupId;
    this.groupOrder = groupOrder;
    this.sourceId = sourceId;
    this.sourceOrder = sourceOrder;
    this.isValid = true;
  }
  setValid(isValid) {
    this.isValid = isValid;
  }
  toString() {
    return `[id:${this.id}] [group:${this.groupId}] [${this.isValid ? "  VALID" : "INVALID"}] ${this.actual.constructor.name} - ${this.actual}`;
  }
}
var RemovedResourceReason = /* @__PURE__ */ ((RemovedResourceReason2) => {
  RemovedResourceReason2[RemovedResourceReason2["ExternalRemoval"] = 0] = "ExternalRemoval";
  RemovedResourceReason2[RemovedResourceReason2["NoParallelUniverses"] = 1] = "NoParallelUniverses";
  return RemovedResourceReason2;
})(RemovedResourceReason || {});
class ResourceReasonPair {
  constructor(resourceLabel, reason) {
    this.resourceLabel = resourceLabel;
    this.reason = reason;
  }
}
class RemovedResources {
  constructor() {
    this.elements = /* @__PURE__ */ new Map();
  }
  createMessage() {
    const externalRemoval = [];
    const noParallelUniverses = [];
    for (const [, element] of this.elements) {
      const dest = element.reason === 0 /* ExternalRemoval */ ? externalRemoval : noParallelUniverses;
      dest.push(element.resourceLabel);
    }
    const messages = [];
    if (externalRemoval.length > 0) {
      messages.push(
        nls.localize(
          { key: "externalRemoval", comment: ["{0} is a list of filenames"] },
          "The following files have been closed and modified on disk: {0}.",
          externalRemoval.join(", ")
        )
      );
    }
    if (noParallelUniverses.length > 0) {
      messages.push(
        nls.localize(
          { key: "noParallelUniverses", comment: ["{0} is a list of filenames"] },
          "The following files have been modified in an incompatible way: {0}.",
          noParallelUniverses.join(", ")
        )
      );
    }
    return messages.join("\n");
  }
  get size() {
    return this.elements.size;
  }
  has(strResource) {
    return this.elements.has(strResource);
  }
  set(strResource, value) {
    this.elements.set(strResource, value);
  }
  delete(strResource) {
    return this.elements.delete(strResource);
  }
}
class WorkspaceStackElement {
  constructor(actual, resourceLabels, strResources, groupId, groupOrder, sourceId, sourceOrder) {
    this.id = ++stackElementCounter;
    this.type = UndoRedoElementType.Workspace;
    this.actual = actual;
    this.label = actual.label;
    this.confirmBeforeUndo = actual.confirmBeforeUndo || false;
    this.resourceLabels = resourceLabels;
    this.strResources = strResources;
    this.groupId = groupId;
    this.groupOrder = groupOrder;
    this.sourceId = sourceId;
    this.sourceOrder = sourceOrder;
    this.removedResources = null;
    this.invalidatedResources = null;
  }
  canSplit() {
    return typeof this.actual.split === "function";
  }
  removeResource(resourceLabel, strResource, reason) {
    if (!this.removedResources) {
      this.removedResources = new RemovedResources();
    }
    if (!this.removedResources.has(strResource)) {
      this.removedResources.set(strResource, new ResourceReasonPair(resourceLabel, reason));
    }
  }
  setValid(resourceLabel, strResource, isValid) {
    if (isValid) {
      if (this.invalidatedResources) {
        this.invalidatedResources.delete(strResource);
        if (this.invalidatedResources.size === 0) {
          this.invalidatedResources = null;
        }
      }
    } else {
      if (!this.invalidatedResources) {
        this.invalidatedResources = new RemovedResources();
      }
      if (!this.invalidatedResources.has(strResource)) {
        this.invalidatedResources.set(strResource, new ResourceReasonPair(resourceLabel, 0 /* ExternalRemoval */));
      }
    }
  }
  toString() {
    return `[id:${this.id}] [group:${this.groupId}] [${this.invalidatedResources ? "INVALID" : "  VALID"}] ${this.actual.constructor.name} - ${this.actual}`;
  }
}
class ResourceEditStack {
  constructor(resourceLabel, strResource) {
    this.resourceLabel = resourceLabel;
    this.strResource = strResource;
    this._past = [];
    this._future = [];
    this.locked = false;
    this.versionId = 1;
  }
  dispose() {
    for (const element of this._past) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    for (const element of this._future) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    this.versionId++;
  }
  toString() {
    const result = [];
    result.push(`* ${this.strResource}:`);
    for (let i = 0; i < this._past.length; i++) {
      result.push(`   * [UNDO] ${this._past[i]}`);
    }
    for (let i = this._future.length - 1; i >= 0; i--) {
      result.push(`   * [REDO] ${this._future[i]}`);
    }
    return result.join("\n");
  }
  flushAllElements() {
    this._past = [];
    this._future = [];
    this.versionId++;
  }
  setElementsIsValid(isValid) {
    for (const element of this._past) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.setValid(this.resourceLabel, this.strResource, isValid);
      } else {
        element.setValid(isValid);
      }
    }
    for (const element of this._future) {
      if (element.type === UndoRedoElementType.Workspace) {
        element.setValid(this.resourceLabel, this.strResource, isValid);
      } else {
        element.setValid(isValid);
      }
    }
  }
  _setElementValidFlag(element, isValid) {
    if (element.type === UndoRedoElementType.Workspace) {
      element.setValid(this.resourceLabel, this.strResource, isValid);
    } else {
      element.setValid(isValid);
    }
  }
  setElementsValidFlag(isValid, filter) {
    for (const element of this._past) {
      if (filter(element.actual)) {
        this._setElementValidFlag(element, isValid);
      }
    }
    for (const element of this._future) {
      if (filter(element.actual)) {
        this._setElementValidFlag(element, isValid);
      }
    }
  }
  pushElement(element) {
    for (const futureElement of this._future) {
      if (futureElement.type === UndoRedoElementType.Workspace) {
        futureElement.removeResource(this.resourceLabel, this.strResource, 1 /* NoParallelUniverses */);
      }
    }
    this._future = [];
    this._past.push(element);
    this.versionId++;
  }
  createSnapshot(resource) {
    const elements = [];
    for (let i = 0, len = this._past.length; i < len; i++) {
      elements.push(this._past[i].id);
    }
    for (let i = this._future.length - 1; i >= 0; i--) {
      elements.push(this._future[i].id);
    }
    return new ResourceEditStackSnapshot(resource, elements);
  }
  restoreSnapshot(snapshot) {
    const snapshotLength = snapshot.elements.length;
    let isOK = true;
    let snapshotIndex = 0;
    let removePastAfter = -1;
    for (let i = 0, len = this._past.length; i < len; i++, snapshotIndex++) {
      const element = this._past[i];
      if (isOK && (snapshotIndex >= snapshotLength || element.id !== snapshot.elements[snapshotIndex])) {
        isOK = false;
        removePastAfter = i;
      }
      if (!isOK && element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    let removeFutureBefore = -1;
    for (let i = this._future.length - 1; i >= 0; i--, snapshotIndex++) {
      const element = this._future[i];
      if (isOK && (snapshotIndex >= snapshotLength || element.id !== snapshot.elements[snapshotIndex])) {
        isOK = false;
        removeFutureBefore = i;
      }
      if (!isOK && element.type === UndoRedoElementType.Workspace) {
        element.removeResource(this.resourceLabel, this.strResource, 0 /* ExternalRemoval */);
      }
    }
    if (removePastAfter !== -1) {
      this._past = this._past.slice(0, removePastAfter);
    }
    if (removeFutureBefore !== -1) {
      this._future = this._future.slice(removeFutureBefore + 1);
    }
    this.versionId++;
  }
  getElements() {
    const past = [];
    const future = [];
    for (const element of this._past) {
      past.push(element.actual);
    }
    for (const element of this._future) {
      future.push(element.actual);
    }
    return { past, future };
  }
  getClosestPastElement() {
    if (this._past.length === 0) {
      return null;
    }
    return this._past[this._past.length - 1];
  }
  getSecondClosestPastElement() {
    if (this._past.length < 2) {
      return null;
    }
    return this._past[this._past.length - 2];
  }
  getClosestFutureElement() {
    if (this._future.length === 0) {
      return null;
    }
    return this._future[this._future.length - 1];
  }
  hasPastElements() {
    return this._past.length > 0;
  }
  hasFutureElements() {
    return this._future.length > 0;
  }
  splitPastWorkspaceElement(toRemove, individualMap) {
    for (let j = this._past.length - 1; j >= 0; j--) {
      if (this._past[j] === toRemove) {
        if (individualMap.has(this.strResource)) {
          this._past[j] = individualMap.get(this.strResource);
        } else {
          this._past.splice(j, 1);
        }
        break;
      }
    }
    this.versionId++;
  }
  splitFutureWorkspaceElement(toRemove, individualMap) {
    for (let j = this._future.length - 1; j >= 0; j--) {
      if (this._future[j] === toRemove) {
        if (individualMap.has(this.strResource)) {
          this._future[j] = individualMap.get(this.strResource);
        } else {
          this._future.splice(j, 1);
        }
        break;
      }
    }
    this.versionId++;
  }
  moveBackward(element) {
    this._past.pop();
    this._future.push(element);
    this.versionId++;
  }
  moveForward(element) {
    this._future.pop();
    this._past.push(element);
    this.versionId++;
  }
}
class EditStackSnapshot {
  constructor(editStacks) {
    this.editStacks = editStacks;
    this._versionIds = [];
    for (let i = 0, len = this.editStacks.length; i < len; i++) {
      this._versionIds[i] = this.editStacks[i].versionId;
    }
  }
  isValid() {
    for (let i = 0, len = this.editStacks.length; i < len; i++) {
      if (this._versionIds[i] !== this.editStacks[i].versionId) {
        return false;
      }
    }
    return true;
  }
}
const missingEditStack = new ResourceEditStack("", "");
missingEditStack.locked = true;
let UndoRedoService = class {
  constructor(_dialogService, _notificationService) {
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._editStacks = /* @__PURE__ */ new Map();
    this._uriComparisonKeyComputers = [];
  }
  registerUriComparisonKeyComputer(scheme, uriComparisonKeyComputer) {
    this._uriComparisonKeyComputers.push([scheme, uriComparisonKeyComputer]);
    return {
      dispose: () => {
        for (let i = 0, len = this._uriComparisonKeyComputers.length; i < len; i++) {
          if (this._uriComparisonKeyComputers[i][1] === uriComparisonKeyComputer) {
            this._uriComparisonKeyComputers.splice(i, 1);
            return;
          }
        }
      }
    };
  }
  getUriComparisonKey(resource) {
    for (const uriComparisonKeyComputer of this._uriComparisonKeyComputers) {
      if (uriComparisonKeyComputer[0] === resource.scheme) {
        return uriComparisonKeyComputer[1].getComparisonKey(resource);
      }
    }
    return resource.toString();
  }
  _print(label) {
    console.log(`------------------------------------`);
    console.log(`AFTER ${label}: `);
    const str = [];
    for (const element of this._editStacks) {
      str.push(element[1].toString());
    }
    console.log(str.join("\n"));
  }
  pushElement(element, group = UndoRedoGroup.None, source = UndoRedoSource.None) {
    if (element.type === UndoRedoElementType.Resource) {
      const resourceLabel = getResourceLabel(element.resource);
      const strResource = this.getUriComparisonKey(element.resource);
      this._pushElement(new ResourceStackElement(element, resourceLabel, strResource, group.id, group.nextOrder(), source.id, source.nextOrder()));
    } else {
      const seen = /* @__PURE__ */ new Set();
      const resourceLabels = [];
      const strResources = [];
      for (const resource of element.resources) {
        const resourceLabel = getResourceLabel(resource);
        const strResource = this.getUriComparisonKey(resource);
        if (seen.has(strResource)) {
          continue;
        }
        seen.add(strResource);
        resourceLabels.push(resourceLabel);
        strResources.push(strResource);
      }
      if (resourceLabels.length === 1) {
        this._pushElement(new ResourceStackElement(element, resourceLabels[0], strResources[0], group.id, group.nextOrder(), source.id, source.nextOrder()));
      } else {
        this._pushElement(new WorkspaceStackElement(element, resourceLabels, strResources, group.id, group.nextOrder(), source.id, source.nextOrder()));
      }
    }
    if (DEBUG) {
      this._print("pushElement");
    }
  }
  _pushElement(element) {
    for (let i = 0, len = element.strResources.length; i < len; i++) {
      const resourceLabel = element.resourceLabels[i];
      const strResource = element.strResources[i];
      let editStack;
      if (this._editStacks.has(strResource)) {
        editStack = this._editStacks.get(strResource);
      } else {
        editStack = new ResourceEditStack(resourceLabel, strResource);
        this._editStacks.set(strResource, editStack);
      }
      editStack.pushElement(element);
    }
  }
  getLastElement(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      if (editStack.hasFutureElements()) {
        return null;
      }
      const closestPastElement = editStack.getClosestPastElement();
      return closestPastElement ? closestPastElement.actual : null;
    }
    return null;
  }
  _splitPastWorkspaceElement(toRemove, ignoreResources) {
    const individualArr = toRemove.actual.split();
    const individualMap = /* @__PURE__ */ new Map();
    for (const _element of individualArr) {
      const resourceLabel = getResourceLabel(_element.resource);
      const strResource = this.getUriComparisonKey(_element.resource);
      const element = new ResourceStackElement(_element, resourceLabel, strResource, 0, 0, 0, 0);
      individualMap.set(element.strResource, element);
    }
    for (const strResource of toRemove.strResources) {
      if (ignoreResources && ignoreResources.has(strResource)) {
        continue;
      }
      const editStack = this._editStacks.get(strResource);
      editStack.splitPastWorkspaceElement(toRemove, individualMap);
    }
  }
  _splitFutureWorkspaceElement(toRemove, ignoreResources) {
    const individualArr = toRemove.actual.split();
    const individualMap = /* @__PURE__ */ new Map();
    for (const _element of individualArr) {
      const resourceLabel = getResourceLabel(_element.resource);
      const strResource = this.getUriComparisonKey(_element.resource);
      const element = new ResourceStackElement(_element, resourceLabel, strResource, 0, 0, 0, 0);
      individualMap.set(element.strResource, element);
    }
    for (const strResource of toRemove.strResources) {
      if (ignoreResources && ignoreResources.has(strResource)) {
        continue;
      }
      const editStack = this._editStacks.get(strResource);
      editStack.splitFutureWorkspaceElement(toRemove, individualMap);
    }
  }
  removeElements(resource) {
    const strResource = typeof resource === "string" ? resource : this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      editStack.dispose();
      this._editStacks.delete(strResource);
    }
    if (DEBUG) {
      this._print("removeElements");
    }
  }
  setElementsValidFlag(resource, isValid, filter) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      editStack.setElementsValidFlag(isValid, filter);
    }
    if (DEBUG) {
      this._print("setElementsValidFlag");
    }
  }
  hasElements(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.hasPastElements() || editStack.hasFutureElements();
    }
    return false;
  }
  createSnapshot(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.createSnapshot(resource);
    }
    return new ResourceEditStackSnapshot(resource, []);
  }
  restoreSnapshot(snapshot) {
    const strResource = this.getUriComparisonKey(snapshot.resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      editStack.restoreSnapshot(snapshot);
      if (!editStack.hasPastElements() && !editStack.hasFutureElements()) {
        editStack.dispose();
        this._editStacks.delete(strResource);
      }
    }
    if (DEBUG) {
      this._print("restoreSnapshot");
    }
  }
  getElements(resource) {
    const strResource = this.getUriComparisonKey(resource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.getElements();
    }
    return { past: [], future: [] };
  }
  _findClosestUndoElementWithSource(sourceId) {
    if (!sourceId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestPastElement();
      if (!candidate) {
        continue;
      }
      if (candidate.sourceId === sourceId) {
        if (!matchedElement || candidate.sourceOrder > matchedElement.sourceOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  canUndo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestUndoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? true : false;
    }
    const strResource = this.getUriComparisonKey(resourceOrSource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.hasPastElements();
    }
    return false;
  }
  _onError(err, element) {
    onUnexpectedError(err);
    for (const strResource of element.strResources) {
      this.removeElements(strResource);
    }
    this._notificationService.error(err);
  }
  _acquireLocks(editStackSnapshot) {
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.locked) {
        throw new Error("Cannot acquire edit stack lock");
      }
    }
    for (const editStack of editStackSnapshot.editStacks) {
      editStack.locked = true;
    }
    return () => {
      for (const editStack of editStackSnapshot.editStacks) {
        editStack.locked = false;
      }
    };
  }
  _safeInvokeWithLocks(element, invoke, editStackSnapshot, cleanup, continuation) {
    const releaseLocks = this._acquireLocks(editStackSnapshot);
    let result;
    try {
      result = invoke();
    } catch (err) {
      releaseLocks();
      cleanup.dispose();
      return this._onError(err, element);
    }
    if (result) {
      return result.then(
        () => {
          releaseLocks();
          cleanup.dispose();
          return continuation();
        },
        (err) => {
          releaseLocks();
          cleanup.dispose();
          return this._onError(err, element);
        }
      );
    } else {
      releaseLocks();
      cleanup.dispose();
      return continuation();
    }
  }
  async _invokeWorkspacePrepare(element) {
    if (typeof element.actual.prepareUndoRedo === "undefined") {
      return Disposable.None;
    }
    const result = element.actual.prepareUndoRedo();
    if (typeof result === "undefined") {
      return Disposable.None;
    }
    return result;
  }
  _invokeResourcePrepare(element, callback) {
    if (element.actual.type !== UndoRedoElementType.Workspace || typeof element.actual.prepareUndoRedo === "undefined") {
      return callback(Disposable.None);
    }
    const r = element.actual.prepareUndoRedo();
    if (!r) {
      return callback(Disposable.None);
    }
    if (isDisposable(r)) {
      return callback(r);
    }
    return r.then((disposable) => {
      return callback(disposable);
    });
  }
  _getAffectedEditStacks(element) {
    const affectedEditStacks = [];
    for (const strResource of element.strResources) {
      affectedEditStacks.push(this._editStacks.get(strResource) || missingEditStack);
    }
    return new EditStackSnapshot(affectedEditStacks);
  }
  _tryToSplitAndUndo(strResource, element, ignoreResources, message) {
    if (element.canSplit()) {
      this._splitPastWorkspaceElement(element, ignoreResources);
      this._notificationService.warn(message);
      return new WorkspaceVerificationError(this._undo(strResource, 0, true));
    } else {
      for (const strResource2 of element.strResources) {
        this.removeElements(strResource2);
      }
      this._notificationService.warn(message);
      return new WorkspaceVerificationError();
    }
  }
  _checkWorkspaceUndo(strResource, element, editStackSnapshot, checkInvalidatedResources) {
    if (element.removedResources) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        element.removedResources,
        nls.localize(
          { key: "cannotWorkspaceUndo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not undo '{0}' across all files. {1}",
          element.label,
          element.removedResources.createMessage()
        )
      );
    }
    if (checkInvalidatedResources && element.invalidatedResources) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        element.invalidatedResources,
        nls.localize(
          { key: "cannotWorkspaceUndo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not undo '{0}' across all files. {1}",
          element.label,
          element.invalidatedResources.createMessage()
        )
      );
    }
    const cannotUndoDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.getClosestPastElement() !== element) {
        cannotUndoDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotUndoDueToResources.length > 0) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceUndoDueToChanges", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not undo '{0}' across all files because changes were made to {1}",
          element.label,
          cannotUndoDueToResources.join(", ")
        )
      );
    }
    const cannotLockDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.locked) {
        cannotLockDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotLockDueToResources.length > 0) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceUndoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not undo '{0}' across all files because there is already an undo or redo operation running on {1}",
          element.label,
          cannotLockDueToResources.join(", ")
        )
      );
    }
    if (!editStackSnapshot.isValid()) {
      return this._tryToSplitAndUndo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceUndoDueToInMeantimeUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not undo '{0}' across all files because an undo or redo operation occurred in the meantime",
          element.label
        )
      );
    }
    return null;
  }
  _workspaceUndo(strResource, element, undoConfirmed) {
    const affectedEditStacks = this._getAffectedEditStacks(element);
    const verificationError = this._checkWorkspaceUndo(
      strResource,
      element,
      affectedEditStacks,
      /*invalidated resources will be checked after the prepare call*/
      false
    );
    if (verificationError) {
      return verificationError.returnValue;
    }
    return this._confirmAndExecuteWorkspaceUndo(strResource, element, affectedEditStacks, undoConfirmed);
  }
  _isPartOfUndoGroup(element) {
    if (!element.groupId) {
      return false;
    }
    for (const [, editStack] of this._editStacks) {
      const pastElement = editStack.getClosestPastElement();
      if (!pastElement) {
        continue;
      }
      if (pastElement === element) {
        const secondPastElement = editStack.getSecondClosestPastElement();
        if (secondPastElement && secondPastElement.groupId === element.groupId) {
          return true;
        }
      }
      if (pastElement.groupId === element.groupId) {
        return true;
      }
    }
    return false;
  }
  async _confirmAndExecuteWorkspaceUndo(strResource, element, editStackSnapshot, undoConfirmed) {
    if (element.canSplit() && !this._isPartOfUndoGroup(element)) {
      let UndoChoice;
      ((UndoChoice2) => {
        UndoChoice2[UndoChoice2["All"] = 0] = "All";
        UndoChoice2[UndoChoice2["This"] = 1] = "This";
        UndoChoice2[UndoChoice2["Cancel"] = 2] = "Cancel";
      })(UndoChoice || (UndoChoice = {}));
      const { result } = await this._dialogService.prompt({
        type: Severity.Info,
        message: nls.localize("confirmWorkspace", "Would you like to undo '{0}' across all files?", element.label),
        buttons: [
          {
            label: nls.localize({ key: "ok", comment: ["{0} denotes a number that is > 1, && denotes a mnemonic"] }, "&&Undo in {0} Files", editStackSnapshot.editStacks.length),
            run: () => 0 /* All */
          },
          {
            label: nls.localize({ key: "nok", comment: ["&& denotes a mnemonic"] }, "Undo this &&File"),
            run: () => 1 /* This */
          }
        ],
        cancelButton: {
          run: () => 2 /* Cancel */
        }
      });
      if (result === 2 /* Cancel */) {
        return;
      }
      if (result === 1 /* This */) {
        this._splitPastWorkspaceElement(element, null);
        return this._undo(strResource, 0, true);
      }
      const verificationError1 = this._checkWorkspaceUndo(
        strResource,
        element,
        editStackSnapshot,
        /*invalidated resources will be checked after the prepare call*/
        false
      );
      if (verificationError1) {
        return verificationError1.returnValue;
      }
      undoConfirmed = true;
    }
    let cleanup;
    try {
      cleanup = await this._invokeWorkspacePrepare(element);
    } catch (err) {
      return this._onError(err, element);
    }
    const verificationError2 = this._checkWorkspaceUndo(
      strResource,
      element,
      editStackSnapshot,
      /*now also check that there are no more invalidated resources*/
      true
    );
    if (verificationError2) {
      cleanup.dispose();
      return verificationError2.returnValue;
    }
    for (const editStack of editStackSnapshot.editStacks) {
      editStack.moveBackward(element);
    }
    return this._safeInvokeWithLocks(element, () => element.actual.undo(), editStackSnapshot, cleanup, () => this._continueUndoInGroup(element.groupId, undoConfirmed));
  }
  _resourceUndo(editStack, element, undoConfirmed) {
    if (!element.isValid) {
      editStack.flushAllElements();
      return;
    }
    if (editStack.locked) {
      const message = nls.localize(
        { key: "cannotResourceUndoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation."] },
        "Could not undo '{0}' because there is already an undo or redo operation running.",
        element.label
      );
      this._notificationService.warn(message);
      return;
    }
    return this._invokeResourcePrepare(element, (cleanup) => {
      editStack.moveBackward(element);
      return this._safeInvokeWithLocks(element, () => element.actual.undo(), new EditStackSnapshot([editStack]), cleanup, () => this._continueUndoInGroup(element.groupId, undoConfirmed));
    });
  }
  _findClosestUndoElementInGroup(groupId) {
    if (!groupId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestPastElement();
      if (!candidate) {
        continue;
      }
      if (candidate.groupId === groupId) {
        if (!matchedElement || candidate.groupOrder > matchedElement.groupOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  _continueUndoInGroup(groupId, undoConfirmed) {
    if (!groupId) {
      return;
    }
    const [, matchedStrResource] = this._findClosestUndoElementInGroup(groupId);
    if (matchedStrResource) {
      return this._undo(matchedStrResource, 0, undoConfirmed);
    }
  }
  undo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestUndoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? this._undo(matchedStrResource, resourceOrSource.id, false) : void 0;
    }
    if (typeof resourceOrSource === "string") {
      return this._undo(resourceOrSource, 0, false);
    }
    return this._undo(this.getUriComparisonKey(resourceOrSource), 0, false);
  }
  _undo(strResource, sourceId = 0, undoConfirmed) {
    if (!this._editStacks.has(strResource)) {
      return;
    }
    const editStack = this._editStacks.get(strResource);
    const element = editStack.getClosestPastElement();
    if (!element) {
      return;
    }
    if (element.groupId) {
      const [matchedElement, matchedStrResource] = this._findClosestUndoElementInGroup(element.groupId);
      if (element !== matchedElement && matchedStrResource) {
        return this._undo(matchedStrResource, sourceId, undoConfirmed);
      }
    }
    const shouldPromptForConfirmation = element.sourceId !== sourceId || element.confirmBeforeUndo;
    if (shouldPromptForConfirmation && !undoConfirmed) {
      return this._confirmAndContinueUndo(strResource, sourceId, element);
    }
    try {
      if (element.type === UndoRedoElementType.Workspace) {
        return this._workspaceUndo(strResource, element, undoConfirmed);
      } else {
        return this._resourceUndo(editStack, element, undoConfirmed);
      }
    } finally {
      if (DEBUG) {
        this._print("undo");
      }
    }
  }
  async _confirmAndContinueUndo(strResource, sourceId, element) {
    const result = await this._dialogService.confirm({
      message: nls.localize("confirmDifferentSource", "Would you like to undo '{0}'?", element.label),
      primaryButton: nls.localize({ key: "confirmDifferentSource.yes", comment: ["&& denotes a mnemonic"] }, "&&Yes"),
      cancelButton: nls.localize("confirmDifferentSource.no", "No")
    });
    if (!result.confirmed) {
      return;
    }
    return this._undo(strResource, sourceId, true);
  }
  _findClosestRedoElementWithSource(sourceId) {
    if (!sourceId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestFutureElement();
      if (!candidate) {
        continue;
      }
      if (candidate.sourceId === sourceId) {
        if (!matchedElement || candidate.sourceOrder < matchedElement.sourceOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  canRedo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestRedoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? true : false;
    }
    const strResource = this.getUriComparisonKey(resourceOrSource);
    if (this._editStacks.has(strResource)) {
      const editStack = this._editStacks.get(strResource);
      return editStack.hasFutureElements();
    }
    return false;
  }
  _tryToSplitAndRedo(strResource, element, ignoreResources, message) {
    if (element.canSplit()) {
      this._splitFutureWorkspaceElement(element, ignoreResources);
      this._notificationService.warn(message);
      return new WorkspaceVerificationError(this._redo(strResource));
    } else {
      for (const strResource2 of element.strResources) {
        this.removeElements(strResource2);
      }
      this._notificationService.warn(message);
      return new WorkspaceVerificationError();
    }
  }
  _checkWorkspaceRedo(strResource, element, editStackSnapshot, checkInvalidatedResources) {
    if (element.removedResources) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        element.removedResources,
        nls.localize(
          { key: "cannotWorkspaceRedo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not redo '{0}' across all files. {1}",
          element.label,
          element.removedResources.createMessage()
        )
      );
    }
    if (checkInvalidatedResources && element.invalidatedResources) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        element.invalidatedResources,
        nls.localize(
          { key: "cannotWorkspaceRedo", comment: ["{0} is a label for an operation. {1} is another message."] },
          "Could not redo '{0}' across all files. {1}",
          element.label,
          element.invalidatedResources.createMessage()
        )
      );
    }
    const cannotRedoDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.getClosestFutureElement() !== element) {
        cannotRedoDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotRedoDueToResources.length > 0) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceRedoDueToChanges", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not redo '{0}' across all files because changes were made to {1}",
          element.label,
          cannotRedoDueToResources.join(", ")
        )
      );
    }
    const cannotLockDueToResources = [];
    for (const editStack of editStackSnapshot.editStacks) {
      if (editStack.locked) {
        cannotLockDueToResources.push(editStack.resourceLabel);
      }
    }
    if (cannotLockDueToResources.length > 0) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceRedoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not redo '{0}' across all files because there is already an undo or redo operation running on {1}",
          element.label,
          cannotLockDueToResources.join(", ")
        )
      );
    }
    if (!editStackSnapshot.isValid()) {
      return this._tryToSplitAndRedo(
        strResource,
        element,
        null,
        nls.localize(
          { key: "cannotWorkspaceRedoDueToInMeantimeUndoRedo", comment: ["{0} is a label for an operation. {1} is a list of filenames."] },
          "Could not redo '{0}' across all files because an undo or redo operation occurred in the meantime",
          element.label
        )
      );
    }
    return null;
  }
  _workspaceRedo(strResource, element) {
    const affectedEditStacks = this._getAffectedEditStacks(element);
    const verificationError = this._checkWorkspaceRedo(
      strResource,
      element,
      affectedEditStacks,
      /*invalidated resources will be checked after the prepare call*/
      false
    );
    if (verificationError) {
      return verificationError.returnValue;
    }
    return this._executeWorkspaceRedo(strResource, element, affectedEditStacks);
  }
  async _executeWorkspaceRedo(strResource, element, editStackSnapshot) {
    let cleanup;
    try {
      cleanup = await this._invokeWorkspacePrepare(element);
    } catch (err) {
      return this._onError(err, element);
    }
    const verificationError = this._checkWorkspaceRedo(
      strResource,
      element,
      editStackSnapshot,
      /*now also check that there are no more invalidated resources*/
      true
    );
    if (verificationError) {
      cleanup.dispose();
      return verificationError.returnValue;
    }
    for (const editStack of editStackSnapshot.editStacks) {
      editStack.moveForward(element);
    }
    return this._safeInvokeWithLocks(element, () => element.actual.redo(), editStackSnapshot, cleanup, () => this._continueRedoInGroup(element.groupId));
  }
  _resourceRedo(editStack, element) {
    if (!element.isValid) {
      editStack.flushAllElements();
      return;
    }
    if (editStack.locked) {
      const message = nls.localize(
        { key: "cannotResourceRedoDueToInProgressUndoRedo", comment: ["{0} is a label for an operation."] },
        "Could not redo '{0}' because there is already an undo or redo operation running.",
        element.label
      );
      this._notificationService.warn(message);
      return;
    }
    return this._invokeResourcePrepare(element, (cleanup) => {
      editStack.moveForward(element);
      return this._safeInvokeWithLocks(element, () => element.actual.redo(), new EditStackSnapshot([editStack]), cleanup, () => this._continueRedoInGroup(element.groupId));
    });
  }
  _findClosestRedoElementInGroup(groupId) {
    if (!groupId) {
      return [null, null];
    }
    let matchedElement = null;
    let matchedStrResource = null;
    for (const [strResource, editStack] of this._editStacks) {
      const candidate = editStack.getClosestFutureElement();
      if (!candidate) {
        continue;
      }
      if (candidate.groupId === groupId) {
        if (!matchedElement || candidate.groupOrder < matchedElement.groupOrder) {
          matchedElement = candidate;
          matchedStrResource = strResource;
        }
      }
    }
    return [matchedElement, matchedStrResource];
  }
  _continueRedoInGroup(groupId) {
    if (!groupId) {
      return;
    }
    const [, matchedStrResource] = this._findClosestRedoElementInGroup(groupId);
    if (matchedStrResource) {
      return this._redo(matchedStrResource);
    }
  }
  redo(resourceOrSource) {
    if (resourceOrSource instanceof UndoRedoSource) {
      const [, matchedStrResource] = this._findClosestRedoElementWithSource(resourceOrSource.id);
      return matchedStrResource ? this._redo(matchedStrResource) : void 0;
    }
    if (typeof resourceOrSource === "string") {
      return this._redo(resourceOrSource);
    }
    return this._redo(this.getUriComparisonKey(resourceOrSource));
  }
  _redo(strResource) {
    if (!this._editStacks.has(strResource)) {
      return;
    }
    const editStack = this._editStacks.get(strResource);
    const element = editStack.getClosestFutureElement();
    if (!element) {
      return;
    }
    if (element.groupId) {
      const [matchedElement, matchedStrResource] = this._findClosestRedoElementInGroup(element.groupId);
      if (element !== matchedElement && matchedStrResource) {
        return this._redo(matchedStrResource);
      }
    }
    try {
      if (element.type === UndoRedoElementType.Workspace) {
        return this._workspaceRedo(strResource, element);
      } else {
        return this._resourceRedo(editStack, element);
      }
    } finally {
      if (DEBUG) {
        this._print("redo");
      }
    }
  }
};
UndoRedoService = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, INotificationService)
], UndoRedoService);
class WorkspaceVerificationError {
  constructor(returnValue) {
    this.returnValue = returnValue;
  }
}
registerSingleton(IUndoRedoService, UndoRedoService, InstantiationType.Delayed);
export {
  UndoRedoService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkb1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgaXNEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQYXN0RnV0dXJlRWxlbWVudHMsIElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudCwgSVVuZG9SZWRvRWxlbWVudCwgSVVuZG9SZWRvU2VydmljZSwgSVdvcmtzcGFjZVVuZG9SZWRvRWxlbWVudCwgUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdCwgVW5kb1JlZG9FbGVtZW50VHlwZSwgVW5kb1JlZG9Hcm91cCwgVW5kb1JlZG9Tb3VyY2UsIFVyaUNvbXBhcmlzb25LZXlDb21wdXRlciB9IGZyb20gJy4vdW5kb1JlZG8uanMnO1xuXG5jb25zdCBERUJVRyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBnZXRSZXNvdXJjZUxhYmVsKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRyZXR1cm4gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyByZXNvdXJjZS5mc1BhdGggOiByZXNvdXJjZS5wYXRoO1xufVxuXG5sZXQgc3RhY2tFbGVtZW50Q291bnRlciA9IDA7XG5cbmNsYXNzIFJlc291cmNlU3RhY2tFbGVtZW50IHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gKCsrc3RhY2tFbGVtZW50Q291bnRlcik7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZTtcblx0cHVibGljIHJlYWRvbmx5IGFjdHVhbDogSVVuZG9SZWRvRWxlbWVudDtcblx0cHVibGljIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBjb25maXJtQmVmb3JlVW5kbzogYm9vbGVhbjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgcmVzb3VyY2VMYWJlbDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RyUmVzb3VyY2U6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHJlc291cmNlTGFiZWxzOiBzdHJpbmdbXTtcblx0cHVibGljIHJlYWRvbmx5IHN0clJlc291cmNlczogc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSBncm91cElkOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBncm91cE9yZGVyOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzb3VyY2VJZDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc291cmNlT3JkZXI6IG51bWJlcjtcblx0cHVibGljIGlzVmFsaWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoYWN0dWFsOiBJVW5kb1JlZG9FbGVtZW50LCByZXNvdXJjZUxhYmVsOiBzdHJpbmcsIHN0clJlc291cmNlOiBzdHJpbmcsIGdyb3VwSWQ6IG51bWJlciwgZ3JvdXBPcmRlcjogbnVtYmVyLCBzb3VyY2VJZDogbnVtYmVyLCBzb3VyY2VPcmRlcjogbnVtYmVyKSB7XG5cdFx0dGhpcy5hY3R1YWwgPSBhY3R1YWw7XG5cdFx0dGhpcy5sYWJlbCA9IGFjdHVhbC5sYWJlbDtcblx0XHR0aGlzLmNvbmZpcm1CZWZvcmVVbmRvID0gYWN0dWFsLmNvbmZpcm1CZWZvcmVVbmRvIHx8IGZhbHNlO1xuXHRcdHRoaXMucmVzb3VyY2VMYWJlbCA9IHJlc291cmNlTGFiZWw7XG5cdFx0dGhpcy5zdHJSZXNvdXJjZSA9IHN0clJlc291cmNlO1xuXHRcdHRoaXMucmVzb3VyY2VMYWJlbHMgPSBbdGhpcy5yZXNvdXJjZUxhYmVsXTtcblx0XHR0aGlzLnN0clJlc291cmNlcyA9IFt0aGlzLnN0clJlc291cmNlXTtcblx0XHR0aGlzLmdyb3VwSWQgPSBncm91cElkO1xuXHRcdHRoaXMuZ3JvdXBPcmRlciA9IGdyb3VwT3JkZXI7XG5cdFx0dGhpcy5zb3VyY2VJZCA9IHNvdXJjZUlkO1xuXHRcdHRoaXMuc291cmNlT3JkZXIgPSBzb3VyY2VPcmRlcjtcblx0XHR0aGlzLmlzVmFsaWQgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIHNldFZhbGlkKGlzVmFsaWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmlzVmFsaWQgPSBpc1ZhbGlkO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBbaWQ6JHt0aGlzLmlkfV0gW2dyb3VwOiR7dGhpcy5ncm91cElkfV0gWyR7dGhpcy5pc1ZhbGlkID8gJyAgVkFMSUQnIDogJ0lOVkFMSUQnfV0gJHt0aGlzLmFjdHVhbC5jb25zdHJ1Y3Rvci5uYW1lfSAtICR7dGhpcy5hY3R1YWx9YDtcblx0fVxufVxuXG5jb25zdCBlbnVtIFJlbW92ZWRSZXNvdXJjZVJlYXNvbiB7XG5cdEV4dGVybmFsUmVtb3ZhbCA9IDAsXG5cdE5vUGFyYWxsZWxVbml2ZXJzZXMgPSAxXG59XG5cbmNsYXNzIFJlc291cmNlUmVhc29uUGFpciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXNvdXJjZUxhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlYXNvbjogUmVtb3ZlZFJlc291cmNlUmVhc29uXG5cdCkgeyB9XG59XG5cbmNsYXNzIFJlbW92ZWRSZXNvdXJjZXMge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIFJlc291cmNlUmVhc29uUGFpcj4oKTtcblxuXHRwdWJsaWMgY3JlYXRlTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGV4dGVybmFsUmVtb3ZhbDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBub1BhcmFsbGVsVW5pdmVyc2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgWywgZWxlbWVudF0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0Y29uc3QgZGVzdCA9IChcblx0XHRcdFx0ZWxlbWVudC5yZWFzb24gPT09IFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5FeHRlcm5hbFJlbW92YWxcblx0XHRcdFx0XHQ/IGV4dGVybmFsUmVtb3ZhbFxuXHRcdFx0XHRcdDogbm9QYXJhbGxlbFVuaXZlcnNlc1xuXHRcdFx0KTtcblx0XHRcdGRlc3QucHVzaChlbGVtZW50LnJlc291cmNlTGFiZWwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChleHRlcm5hbFJlbW92YWwubGVuZ3RoID4gMCkge1xuXHRcdFx0bWVzc2FnZXMucHVzaChcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnZXh0ZXJuYWxSZW1vdmFsJywgY29tbWVudDogWyd7MH0gaXMgYSBsaXN0IG9mIGZpbGVuYW1lcyddIH0sXG5cdFx0XHRcdFx0XCJUaGUgZm9sbG93aW5nIGZpbGVzIGhhdmUgYmVlbiBjbG9zZWQgYW5kIG1vZGlmaWVkIG9uIGRpc2s6IHswfS5cIiwgZXh0ZXJuYWxSZW1vdmFsLmpvaW4oJywgJylcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKG5vUGFyYWxsZWxVbml2ZXJzZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0bWVzc2FnZXMucHVzaChcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnbm9QYXJhbGxlbFVuaXZlcnNlcycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGlzdCBvZiBmaWxlbmFtZXMnXSB9LFxuXHRcdFx0XHRcdFwiVGhlIGZvbGxvd2luZyBmaWxlcyBoYXZlIGJlZW4gbW9kaWZpZWQgaW4gYW4gaW5jb21wYXRpYmxlIHdheTogezB9LlwiLCBub1BhcmFsbGVsVW5pdmVyc2VzLmpvaW4oJywgJylcblx0XHRcdFx0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBtZXNzYWdlcy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzLnNpemU7XG5cdH1cblxuXHRwdWJsaWMgaGFzKHN0clJlc291cmNlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50cy5oYXMoc3RyUmVzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIHNldChzdHJSZXNvdXJjZTogc3RyaW5nLCB2YWx1ZTogUmVzb3VyY2VSZWFzb25QYWlyKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50cy5zZXQoc3RyUmVzb3VyY2UsIHZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBkZWxldGUoc3RyUmVzb3VyY2U6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzLmRlbGV0ZShzdHJSZXNvdXJjZSk7XG5cdH1cbn1cblxuY2xhc3MgV29ya3NwYWNlU3RhY2tFbGVtZW50IHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gKCsrc3RhY2tFbGVtZW50Q291bnRlcik7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2U7XG5cdHB1YmxpYyByZWFkb25seSBhY3R1YWw6IElXb3Jrc3BhY2VVbmRvUmVkb0VsZW1lbnQ7XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29uZmlybUJlZm9yZVVuZG86IGJvb2xlYW47XG5cblx0cHVibGljIHJlYWRvbmx5IHJlc291cmNlTGFiZWxzOiBzdHJpbmdbXTtcblx0cHVibGljIHJlYWRvbmx5IHN0clJlc291cmNlczogc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSBncm91cElkOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBncm91cE9yZGVyOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzb3VyY2VJZDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc291cmNlT3JkZXI6IG51bWJlcjtcblx0cHVibGljIHJlbW92ZWRSZXNvdXJjZXM6IFJlbW92ZWRSZXNvdXJjZXMgfCBudWxsO1xuXHRwdWJsaWMgaW52YWxpZGF0ZWRSZXNvdXJjZXM6IFJlbW92ZWRSZXNvdXJjZXMgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGFjdHVhbDogSVdvcmtzcGFjZVVuZG9SZWRvRWxlbWVudCwgcmVzb3VyY2VMYWJlbHM6IHN0cmluZ1tdLCBzdHJSZXNvdXJjZXM6IHN0cmluZ1tdLCBncm91cElkOiBudW1iZXIsIGdyb3VwT3JkZXI6IG51bWJlciwgc291cmNlSWQ6IG51bWJlciwgc291cmNlT3JkZXI6IG51bWJlcikge1xuXHRcdHRoaXMuYWN0dWFsID0gYWN0dWFsO1xuXHRcdHRoaXMubGFiZWwgPSBhY3R1YWwubGFiZWw7XG5cdFx0dGhpcy5jb25maXJtQmVmb3JlVW5kbyA9IGFjdHVhbC5jb25maXJtQmVmb3JlVW5kbyB8fCBmYWxzZTtcblx0XHR0aGlzLnJlc291cmNlTGFiZWxzID0gcmVzb3VyY2VMYWJlbHM7XG5cdFx0dGhpcy5zdHJSZXNvdXJjZXMgPSBzdHJSZXNvdXJjZXM7XG5cdFx0dGhpcy5ncm91cElkID0gZ3JvdXBJZDtcblx0XHR0aGlzLmdyb3VwT3JkZXIgPSBncm91cE9yZGVyO1xuXHRcdHRoaXMuc291cmNlSWQgPSBzb3VyY2VJZDtcblx0XHR0aGlzLnNvdXJjZU9yZGVyID0gc291cmNlT3JkZXI7XG5cdFx0dGhpcy5yZW1vdmVkUmVzb3VyY2VzID0gbnVsbDtcblx0XHR0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBjYW5TcGxpdCgpOiB0aGlzIGlzIFdvcmtzcGFjZVN0YWNrRWxlbWVudCAmIHsgYWN0dWFsOiB7IHNwbGl0KCk6IElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudFtdIH0gfSB7XG5cdFx0cmV0dXJuICh0eXBlb2YgdGhpcy5hY3R1YWwuc3BsaXQgPT09ICdmdW5jdGlvbicpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVJlc291cmNlKHJlc291cmNlTGFiZWw6IHN0cmluZywgc3RyUmVzb3VyY2U6IHN0cmluZywgcmVhc29uOiBSZW1vdmVkUmVzb3VyY2VSZWFzb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucmVtb3ZlZFJlc291cmNlcykge1xuXHRcdFx0dGhpcy5yZW1vdmVkUmVzb3VyY2VzID0gbmV3IFJlbW92ZWRSZXNvdXJjZXMoKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnJlbW92ZWRSZXNvdXJjZXMuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5yZW1vdmVkUmVzb3VyY2VzLnNldChzdHJSZXNvdXJjZSwgbmV3IFJlc291cmNlUmVhc29uUGFpcihyZXNvdXJjZUxhYmVsLCByZWFzb24pKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsaWQocmVzb3VyY2VMYWJlbDogc3RyaW5nLCBzdHJSZXNvdXJjZTogc3RyaW5nLCBpc1ZhbGlkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzVmFsaWQpIHtcblx0XHRcdGlmICh0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuaW52YWxpZGF0ZWRSZXNvdXJjZXMuZGVsZXRlKHN0clJlc291cmNlKTtcblx0XHRcdFx0aWYgKHRoaXMuaW52YWxpZGF0ZWRSZXNvdXJjZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuaW52YWxpZGF0ZWRSZXNvdXJjZXMgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghdGhpcy5pbnZhbGlkYXRlZFJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzID0gbmV3IFJlbW92ZWRSZXNvdXJjZXMoKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5pbnZhbGlkYXRlZFJlc291cmNlcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuaW52YWxpZGF0ZWRSZXNvdXJjZXMuc2V0KHN0clJlc291cmNlLCBuZXcgUmVzb3VyY2VSZWFzb25QYWlyKHJlc291cmNlTGFiZWwsIFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5FeHRlcm5hbFJlbW92YWwpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYFtpZDoke3RoaXMuaWR9XSBbZ3JvdXA6JHt0aGlzLmdyb3VwSWR9XSBbJHt0aGlzLmludmFsaWRhdGVkUmVzb3VyY2VzID8gJ0lOVkFMSUQnIDogJyAgVkFMSUQnfV0gJHt0aGlzLmFjdHVhbC5jb25zdHJ1Y3Rvci5uYW1lfSAtICR7dGhpcy5hY3R1YWx9YDtcblx0fVxufVxuXG50eXBlIFN0YWNrRWxlbWVudCA9IFJlc291cmNlU3RhY2tFbGVtZW50IHwgV29ya3NwYWNlU3RhY2tFbGVtZW50O1xuXG5jbGFzcyBSZXNvdXJjZUVkaXRTdGFjayB7XG5cdHB1YmxpYyByZWFkb25seSByZXNvdXJjZUxhYmVsOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RyUmVzb3VyY2U6IHN0cmluZztcblx0cHJpdmF0ZSBfcGFzdDogU3RhY2tFbGVtZW50W107XG5cdHByaXZhdGUgX2Z1dHVyZTogU3RhY2tFbGVtZW50W107XG5cdHB1YmxpYyBsb2NrZWQ6IGJvb2xlYW47XG5cdHB1YmxpYyB2ZXJzaW9uSWQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihyZXNvdXJjZUxhYmVsOiBzdHJpbmcsIHN0clJlc291cmNlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnJlc291cmNlTGFiZWwgPSByZXNvdXJjZUxhYmVsO1xuXHRcdHRoaXMuc3RyUmVzb3VyY2UgPSBzdHJSZXNvdXJjZTtcblx0XHR0aGlzLl9wYXN0ID0gW107XG5cdFx0dGhpcy5fZnV0dXJlID0gW107XG5cdFx0dGhpcy5sb2NrZWQgPSBmYWxzZTtcblx0XHR0aGlzLnZlcnNpb25JZCA9IDE7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5fcGFzdCkge1xuXHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVSZXNvdXJjZSh0aGlzLnJlc291cmNlTGFiZWwsIHRoaXMuc3RyUmVzb3VyY2UsIFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5FeHRlcm5hbFJlbW92YWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5fZnV0dXJlKSB7XG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0XHRlbGVtZW50LnJlbW92ZVJlc291cmNlKHRoaXMucmVzb3VyY2VMYWJlbCwgdGhpcy5zdHJSZXNvdXJjZSwgUmVtb3ZlZFJlc291cmNlUmVhc29uLkV4dGVybmFsUmVtb3ZhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0cmVzdWx0LnB1c2goYCogJHt0aGlzLnN0clJlc291cmNlfTpgKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3Bhc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJlc3VsdC5wdXNoKGAgICAqIFtVTkRPXSAke3RoaXMuX3Bhc3RbaV19YCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9mdXR1cmUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdHJlc3VsdC5wdXNoKGAgICAqIFtSRURPXSAke3RoaXMuX2Z1dHVyZVtpXX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBmbHVzaEFsbEVsZW1lbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Bhc3QgPSBbXTtcblx0XHR0aGlzLl9mdXR1cmUgPSBbXTtcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHR9XG5cblx0cHVibGljIHNldEVsZW1lbnRzSXNWYWxpZChpc1ZhbGlkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX3Bhc3QpIHtcblx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdGVsZW1lbnQuc2V0VmFsaWQodGhpcy5yZXNvdXJjZUxhYmVsLCB0aGlzLnN0clJlc291cmNlLCBpc1ZhbGlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVsZW1lbnQuc2V0VmFsaWQoaXNWYWxpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9mdXR1cmUpIHtcblx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdGVsZW1lbnQuc2V0VmFsaWQodGhpcy5yZXNvdXJjZUxhYmVsLCB0aGlzLnN0clJlc291cmNlLCBpc1ZhbGlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVsZW1lbnQuc2V0VmFsaWQoaXNWYWxpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RWxlbWVudFZhbGlkRmxhZyhlbGVtZW50OiBTdGFja0VsZW1lbnQsIGlzVmFsaWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0ZWxlbWVudC5zZXRWYWxpZCh0aGlzLnJlc291cmNlTGFiZWwsIHRoaXMuc3RyUmVzb3VyY2UsIGlzVmFsaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbGVtZW50LnNldFZhbGlkKGlzVmFsaWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRFbGVtZW50c1ZhbGlkRmxhZyhpc1ZhbGlkOiBib29sZWFuLCBmaWx0ZXI6IChlbGVtZW50OiBJVW5kb1JlZG9FbGVtZW50KSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX3Bhc3QpIHtcblx0XHRcdGlmIChmaWx0ZXIoZWxlbWVudC5hY3R1YWwpKSB7XG5cdFx0XHRcdHRoaXMuX3NldEVsZW1lbnRWYWxpZEZsYWcoZWxlbWVudCwgaXNWYWxpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9mdXR1cmUpIHtcblx0XHRcdGlmIChmaWx0ZXIoZWxlbWVudC5hY3R1YWwpKSB7XG5cdFx0XHRcdHRoaXMuX3NldEVsZW1lbnRWYWxpZEZsYWcoZWxlbWVudCwgaXNWYWxpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHB1c2hFbGVtZW50KGVsZW1lbnQ6IFN0YWNrRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIHJlbW92ZSB0aGUgZnV0dXJlXG5cdFx0Zm9yIChjb25zdCBmdXR1cmVFbGVtZW50IG9mIHRoaXMuX2Z1dHVyZSkge1xuXHRcdFx0aWYgKGZ1dHVyZUVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0ZnV0dXJlRWxlbWVudC5yZW1vdmVSZXNvdXJjZSh0aGlzLnJlc291cmNlTGFiZWwsIHRoaXMuc3RyUmVzb3VyY2UsIFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5Ob1BhcmFsbGVsVW5pdmVyc2VzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZnV0dXJlID0gW107XG5cdFx0dGhpcy5fcGFzdC5wdXNoKGVsZW1lbnQpO1xuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QocmVzb3VyY2U6IFVSSSk6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3Qge1xuXHRcdGNvbnN0IGVsZW1lbnRzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3Bhc3QubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGVsZW1lbnRzLnB1c2godGhpcy5fcGFzdFtpXS5pZCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9mdXR1cmUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGVsZW1lbnRzLnB1c2godGhpcy5fZnV0dXJlW2ldLmlkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QocmVzb3VyY2UsIGVsZW1lbnRzKTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlU25hcHNob3Qoc25hcHNob3Q6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QpOiB2b2lkIHtcblx0XHRjb25zdCBzbmFwc2hvdExlbmd0aCA9IHNuYXBzaG90LmVsZW1lbnRzLmxlbmd0aDtcblx0XHRsZXQgaXNPSyA9IHRydWU7XG5cdFx0bGV0IHNuYXBzaG90SW5kZXggPSAwO1xuXHRcdGxldCByZW1vdmVQYXN0QWZ0ZXIgPSAtMTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fcGFzdC5sZW5ndGg7IGkgPCBsZW47IGkrKywgc25hcHNob3RJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fcGFzdFtpXTtcblx0XHRcdGlmIChpc09LICYmIChzbmFwc2hvdEluZGV4ID49IHNuYXBzaG90TGVuZ3RoIHx8IGVsZW1lbnQuaWQgIT09IHNuYXBzaG90LmVsZW1lbnRzW3NuYXBzaG90SW5kZXhdKSkge1xuXHRcdFx0XHRpc09LID0gZmFsc2U7XG5cdFx0XHRcdHJlbW92ZVBhc3RBZnRlciA9IGk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzT0sgJiYgZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSkge1xuXHRcdFx0XHRlbGVtZW50LnJlbW92ZVJlc291cmNlKHRoaXMucmVzb3VyY2VMYWJlbCwgdGhpcy5zdHJSZXNvdXJjZSwgUmVtb3ZlZFJlc291cmNlUmVhc29uLkV4dGVybmFsUmVtb3ZhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCByZW1vdmVGdXR1cmVCZWZvcmUgPSAtMTtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fZnV0dXJlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tLCBzbmFwc2hvdEluZGV4KyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9mdXR1cmVbaV07XG5cdFx0XHRpZiAoaXNPSyAmJiAoc25hcHNob3RJbmRleCA+PSBzbmFwc2hvdExlbmd0aCB8fCBlbGVtZW50LmlkICE9PSBzbmFwc2hvdC5lbGVtZW50c1tzbmFwc2hvdEluZGV4XSkpIHtcblx0XHRcdFx0aXNPSyA9IGZhbHNlO1xuXHRcdFx0XHRyZW1vdmVGdXR1cmVCZWZvcmUgPSBpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc09LICYmIGVsZW1lbnQudHlwZSA9PT0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVSZXNvdXJjZSh0aGlzLnJlc291cmNlTGFiZWwsIHRoaXMuc3RyUmVzb3VyY2UsIFJlbW92ZWRSZXNvdXJjZVJlYXNvbi5FeHRlcm5hbFJlbW92YWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVtb3ZlUGFzdEFmdGVyICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fcGFzdCA9IHRoaXMuX3Bhc3Quc2xpY2UoMCwgcmVtb3ZlUGFzdEFmdGVyKTtcblx0XHR9XG5cdFx0aWYgKHJlbW92ZUZ1dHVyZUJlZm9yZSAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX2Z1dHVyZSA9IHRoaXMuX2Z1dHVyZS5zbGljZShyZW1vdmVGdXR1cmVCZWZvcmUgKyAxKTtcblx0XHR9XG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblx0fVxuXG5cdHB1YmxpYyBnZXRFbGVtZW50cygpOiBJUGFzdEZ1dHVyZUVsZW1lbnRzIHtcblx0XHRjb25zdCBwYXN0OiBJVW5kb1JlZG9FbGVtZW50W10gPSBbXTtcblx0XHRjb25zdCBmdXR1cmU6IElVbmRvUmVkb0VsZW1lbnRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX3Bhc3QpIHtcblx0XHRcdHBhc3QucHVzaChlbGVtZW50LmFjdHVhbCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9mdXR1cmUpIHtcblx0XHRcdGZ1dHVyZS5wdXNoKGVsZW1lbnQuYWN0dWFsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBwYXN0LCBmdXR1cmUgfTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDbG9zZXN0UGFzdEVsZW1lbnQoKTogU3RhY2tFbGVtZW50IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3Bhc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Bhc3RbdGhpcy5fcGFzdC5sZW5ndGggLSAxXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWNvbmRDbG9zZXN0UGFzdEVsZW1lbnQoKTogU3RhY2tFbGVtZW50IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3Bhc3QubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wYXN0W3RoaXMuX3Bhc3QubGVuZ3RoIC0gMl07XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2xvc2VzdEZ1dHVyZUVsZW1lbnQoKTogU3RhY2tFbGVtZW50IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX2Z1dHVyZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZnV0dXJlW3RoaXMuX2Z1dHVyZS5sZW5ndGggLSAxXTtcblx0fVxuXG5cdHB1YmxpYyBoYXNQYXN0RWxlbWVudHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9wYXN0Lmxlbmd0aCA+IDApO1xuXHR9XG5cblx0cHVibGljIGhhc0Z1dHVyZUVsZW1lbnRzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5fZnV0dXJlLmxlbmd0aCA+IDApO1xuXHR9XG5cblx0cHVibGljIHNwbGl0UGFzdFdvcmtzcGFjZUVsZW1lbnQodG9SZW1vdmU6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCwgaW5kaXZpZHVhbE1hcDogTWFwPHN0cmluZywgUmVzb3VyY2VTdGFja0VsZW1lbnQ+KTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaiA9IHRoaXMuX3Bhc3QubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcblx0XHRcdGlmICh0aGlzLl9wYXN0W2pdID09PSB0b1JlbW92ZSkge1xuXHRcdFx0XHRpZiAoaW5kaXZpZHVhbE1hcC5oYXModGhpcy5zdHJSZXNvdXJjZSkpIHtcblx0XHRcdFx0XHQvLyBnZXRzIHJlcGxhY2VkXG5cdFx0XHRcdFx0dGhpcy5fcGFzdFtqXSA9IGluZGl2aWR1YWxNYXAuZ2V0KHRoaXMuc3RyUmVzb3VyY2UpITtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBnZXRzIGRlbGV0ZWRcblx0XHRcdFx0XHR0aGlzLl9wYXN0LnNwbGljZShqLCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblx0fVxuXG5cdHB1YmxpYyBzcGxpdEZ1dHVyZVdvcmtzcGFjZUVsZW1lbnQodG9SZW1vdmU6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCwgaW5kaXZpZHVhbE1hcDogTWFwPHN0cmluZywgUmVzb3VyY2VTdGFja0VsZW1lbnQ+KTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaiA9IHRoaXMuX2Z1dHVyZS5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuXHRcdFx0aWYgKHRoaXMuX2Z1dHVyZVtqXSA9PT0gdG9SZW1vdmUpIHtcblx0XHRcdFx0aWYgKGluZGl2aWR1YWxNYXAuaGFzKHRoaXMuc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Ly8gZ2V0cyByZXBsYWNlZFxuXHRcdFx0XHRcdHRoaXMuX2Z1dHVyZVtqXSA9IGluZGl2aWR1YWxNYXAuZ2V0KHRoaXMuc3RyUmVzb3VyY2UpITtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBnZXRzIGRlbGV0ZWRcblx0XHRcdFx0XHR0aGlzLl9mdXR1cmUuc3BsaWNlKGosIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHR9XG5cblx0cHVibGljIG1vdmVCYWNrd2FyZChlbGVtZW50OiBTdGFja0VsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXN0LnBvcCgpO1xuXHRcdHRoaXMuX2Z1dHVyZS5wdXNoKGVsZW1lbnQpO1xuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdH1cblxuXHRwdWJsaWMgbW92ZUZvcndhcmQoZWxlbWVudDogU3RhY2tFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fZnV0dXJlLnBvcCgpO1xuXHRcdHRoaXMuX3Bhc3QucHVzaChlbGVtZW50KTtcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRTdGFja1NuYXBzaG90IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZWRpdFN0YWNrczogUmVzb3VyY2VFZGl0U3RhY2tbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmVyc2lvbklkczogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IoZWRpdFN0YWNrczogUmVzb3VyY2VFZGl0U3RhY2tbXSkge1xuXHRcdHRoaXMuZWRpdFN0YWNrcyA9IGVkaXRTdGFja3M7XG5cdFx0dGhpcy5fdmVyc2lvbklkcyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmVkaXRTdGFja3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHRoaXMuX3ZlcnNpb25JZHNbaV0gPSB0aGlzLmVkaXRTdGFja3NbaV0udmVyc2lvbklkO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpc1ZhbGlkKCk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmVkaXRTdGFja3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLl92ZXJzaW9uSWRzW2ldICE9PSB0aGlzLmVkaXRTdGFja3NbaV0udmVyc2lvbklkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuY29uc3QgbWlzc2luZ0VkaXRTdGFjayA9IG5ldyBSZXNvdXJjZUVkaXRTdGFjaygnJywgJycpO1xubWlzc2luZ0VkaXRTdGFjay5sb2NrZWQgPSB0cnVlO1xuXG5leHBvcnQgY2xhc3MgVW5kb1JlZG9TZXJ2aWNlIGltcGxlbWVudHMgSVVuZG9SZWRvU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRTdGFja3M6IE1hcDxzdHJpbmcsIFJlc291cmNlRWRpdFN0YWNrPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyczogW3N0cmluZywgVXJpQ29tcGFyaXNvbktleUNvbXB1dGVyXVtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2VkaXRTdGFja3MgPSBuZXcgTWFwPHN0cmluZywgUmVzb3VyY2VFZGl0U3RhY2s+KCk7XG5cdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVycyA9IFtdO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVXJpQ29tcGFyaXNvbktleUNvbXB1dGVyKHNjaGVtZTogc3RyaW5nLCB1cmlDb21wYXJpc29uS2V5Q29tcHV0ZXI6IFVyaUNvbXBhcmlzb25LZXlDb21wdXRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXJzLnB1c2goW3NjaGVtZSwgdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyXSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyc1tpXVsxXSA9PT0gdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXJzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0Zm9yIChjb25zdCB1cmlDb21wYXJpc29uS2V5Q29tcHV0ZXIgb2YgdGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVycykge1xuXHRcdFx0aWYgKHVyaUNvbXBhcmlzb25LZXlDb21wdXRlclswXSA9PT0gcmVzb3VyY2Uuc2NoZW1lKSB7XG5cdFx0XHRcdHJldHVybiB1cmlDb21wYXJpc29uS2V5Q29tcHV0ZXJbMV0uZ2V0Q29tcGFyaXNvbktleShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXNvdXJjZS50b1N0cmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJpbnQobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnNvbGUubG9nKGAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHRjb25zb2xlLmxvZyhgQUZURVIgJHtsYWJlbH06IGApO1xuXHRcdGNvbnN0IHN0cjogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5fZWRpdFN0YWNrcykge1xuXHRcdFx0c3RyLnB1c2goZWxlbWVudFsxXS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0Y29uc29sZS5sb2coc3RyLmpvaW4oJ1xcbicpKTtcblx0fVxuXG5cdHB1YmxpYyBwdXNoRWxlbWVudChlbGVtZW50OiBJVW5kb1JlZG9FbGVtZW50LCBncm91cDogVW5kb1JlZG9Hcm91cCA9IFVuZG9SZWRvR3JvdXAuTm9uZSwgc291cmNlOiBVbmRvUmVkb1NvdXJjZSA9IFVuZG9SZWRvU291cmNlLk5vbmUpOiB2b2lkIHtcblx0XHRpZiAoZWxlbWVudC50eXBlID09PSBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gZ2V0UmVzb3VyY2VMYWJlbChlbGVtZW50LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KGVsZW1lbnQucmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fcHVzaEVsZW1lbnQobmV3IFJlc291cmNlU3RhY2tFbGVtZW50KGVsZW1lbnQsIHJlc291cmNlTGFiZWwsIHN0clJlc291cmNlLCBncm91cC5pZCwgZ3JvdXAubmV4dE9yZGVyKCksIHNvdXJjZS5pZCwgc291cmNlLm5leHRPcmRlcigpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IHJlc291cmNlTGFiZWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3RyUmVzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBlbGVtZW50LnJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gZ2V0UmVzb3VyY2VMYWJlbChyZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblxuXHRcdFx0XHRpZiAoc2Vlbi5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Vlbi5hZGQoc3RyUmVzb3VyY2UpO1xuXHRcdFx0XHRyZXNvdXJjZUxhYmVscy5wdXNoKHJlc291cmNlTGFiZWwpO1xuXHRcdFx0XHRzdHJSZXNvdXJjZXMucHVzaChzdHJSZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNvdXJjZUxhYmVscy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5fcHVzaEVsZW1lbnQobmV3IFJlc291cmNlU3RhY2tFbGVtZW50KGVsZW1lbnQsIHJlc291cmNlTGFiZWxzWzBdLCBzdHJSZXNvdXJjZXNbMF0sIGdyb3VwLmlkLCBncm91cC5uZXh0T3JkZXIoKSwgc291cmNlLmlkLCBzb3VyY2UubmV4dE9yZGVyKCkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3B1c2hFbGVtZW50KG5ldyBXb3Jrc3BhY2VTdGFja0VsZW1lbnQoZWxlbWVudCwgcmVzb3VyY2VMYWJlbHMsIHN0clJlc291cmNlcywgZ3JvdXAuaWQsIGdyb3VwLm5leHRPcmRlcigpLCBzb3VyY2UuaWQsIHNvdXJjZS5uZXh0T3JkZXIoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoREVCVUcpIHtcblx0XHRcdHRoaXMuX3ByaW50KCdwdXNoRWxlbWVudCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3B1c2hFbGVtZW50KGVsZW1lbnQ6IFN0YWNrRWxlbWVudCk6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlbGVtZW50LnN0clJlc291cmNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VMYWJlbCA9IGVsZW1lbnQucmVzb3VyY2VMYWJlbHNbaV07XG5cdFx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IGVsZW1lbnQuc3RyUmVzb3VyY2VzW2ldO1xuXG5cdFx0XHRsZXQgZWRpdFN0YWNrOiBSZXNvdXJjZUVkaXRTdGFjaztcblx0XHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdFx0ZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVkaXRTdGFjayA9IG5ldyBSZXNvdXJjZUVkaXRTdGFjayhyZXNvdXJjZUxhYmVsLCBzdHJSZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRTdGFja3Muc2V0KHN0clJlc291cmNlLCBlZGl0U3RhY2spO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0U3RhY2sucHVzaEVsZW1lbnQoZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldExhc3RFbGVtZW50KHJlc291cmNlOiBVUkkpOiBJVW5kb1JlZG9FbGVtZW50IHwgbnVsbCB7XG5cdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSB0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRpZiAoZWRpdFN0YWNrLmhhc0Z1dHVyZUVsZW1lbnRzKCkpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbG9zZXN0UGFzdEVsZW1lbnQgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCk7XG5cdFx0XHRyZXR1cm4gY2xvc2VzdFBhc3RFbGVtZW50ID8gY2xvc2VzdFBhc3RFbGVtZW50LmFjdHVhbCA6IG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3BsaXRQYXN0V29ya3NwYWNlRWxlbWVudCh0b1JlbW92ZTogV29ya3NwYWNlU3RhY2tFbGVtZW50ICYgeyBhY3R1YWw6IHsgc3BsaXQoKTogSVJlc291cmNlVW5kb1JlZG9FbGVtZW50W10gfSB9LCBpZ25vcmVSZXNvdXJjZXM6IFJlbW92ZWRSZXNvdXJjZXMgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kaXZpZHVhbEFyciA9IHRvUmVtb3ZlLmFjdHVhbC5zcGxpdCgpO1xuXHRcdGNvbnN0IGluZGl2aWR1YWxNYXAgPSBuZXcgTWFwPHN0cmluZywgUmVzb3VyY2VTdGFja0VsZW1lbnQ+KCk7XG5cdFx0Zm9yIChjb25zdCBfZWxlbWVudCBvZiBpbmRpdmlkdWFsQXJyKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gZ2V0UmVzb3VyY2VMYWJlbChfZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShfZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gbmV3IFJlc291cmNlU3RhY2tFbGVtZW50KF9lbGVtZW50LCByZXNvdXJjZUxhYmVsLCBzdHJSZXNvdXJjZSwgMCwgMCwgMCwgMCk7XG5cdFx0XHRpbmRpdmlkdWFsTWFwLnNldChlbGVtZW50LnN0clJlc291cmNlLCBlbGVtZW50KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHN0clJlc291cmNlIG9mIHRvUmVtb3ZlLnN0clJlc291cmNlcykge1xuXHRcdFx0aWYgKGlnbm9yZVJlc291cmNlcyAmJiBpZ25vcmVSZXNvdXJjZXMuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRlZGl0U3RhY2suc3BsaXRQYXN0V29ya3NwYWNlRWxlbWVudCh0b1JlbW92ZSwgaW5kaXZpZHVhbE1hcCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3BsaXRGdXR1cmVXb3Jrc3BhY2VFbGVtZW50KHRvUmVtb3ZlOiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQgJiB7IGFjdHVhbDogeyBzcGxpdCgpOiBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnRbXSB9IH0sIGlnbm9yZVJlc291cmNlczogUmVtb3ZlZFJlc291cmNlcyB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRpdmlkdWFsQXJyID0gdG9SZW1vdmUuYWN0dWFsLnNwbGl0KCk7XG5cdFx0Y29uc3QgaW5kaXZpZHVhbE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvdXJjZVN0YWNrRWxlbWVudD4oKTtcblx0XHRmb3IgKGNvbnN0IF9lbGVtZW50IG9mIGluZGl2aWR1YWxBcnIpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlTGFiZWwgPSBnZXRSZXNvdXJjZUxhYmVsKF9lbGVtZW50LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KF9lbGVtZW50LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBuZXcgUmVzb3VyY2VTdGFja0VsZW1lbnQoX2VsZW1lbnQsIHJlc291cmNlTGFiZWwsIHN0clJlc291cmNlLCAwLCAwLCAwLCAwKTtcblx0XHRcdGluZGl2aWR1YWxNYXAuc2V0KGVsZW1lbnQuc3RyUmVzb3VyY2UsIGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc3RyUmVzb3VyY2Ugb2YgdG9SZW1vdmUuc3RyUmVzb3VyY2VzKSB7XG5cdFx0XHRpZiAoaWdub3JlUmVzb3VyY2VzICYmIGlnbm9yZVJlc291cmNlcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdGVkaXRTdGFjay5zcGxpdEZ1dHVyZVdvcmtzcGFjZUVsZW1lbnQodG9SZW1vdmUsIGluZGl2aWR1YWxNYXApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW1vdmVFbGVtZW50cyhyZXNvdXJjZTogVVJJIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSB0eXBlb2YgcmVzb3VyY2UgPT09ICdzdHJpbmcnID8gcmVzb3VyY2UgOiB0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRlZGl0U3RhY2suZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZWRpdFN0YWNrcy5kZWxldGUoc3RyUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRpZiAoREVCVUcpIHtcblx0XHRcdHRoaXMuX3ByaW50KCdyZW1vdmVFbGVtZW50cycpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRFbGVtZW50c1ZhbGlkRmxhZyhyZXNvdXJjZTogVVJJLCBpc1ZhbGlkOiBib29sZWFuLCBmaWx0ZXI6IChlbGVtZW50OiBJVW5kb1JlZG9FbGVtZW50KSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSB0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRlZGl0U3RhY2suc2V0RWxlbWVudHNWYWxpZEZsYWcoaXNWYWxpZCwgZmlsdGVyKTtcblx0XHR9XG5cdFx0aWYgKERFQlVHKSB7XG5cdFx0XHR0aGlzLl9wcmludCgnc2V0RWxlbWVudHNWYWxpZEZsYWcnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFzRWxlbWVudHMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0cmV0dXJuIChlZGl0U3RhY2suaGFzUGFzdEVsZW1lbnRzKCkgfHwgZWRpdFN0YWNrLmhhc0Z1dHVyZUVsZW1lbnRzKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QocmVzb3VyY2U6IFVSSSk6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3Qge1xuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0cmV0dXJuIGVkaXRTdGFjay5jcmVhdGVTbmFwc2hvdChyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdChyZXNvdXJjZSwgW10pO1xuXHR9XG5cblx0cHVibGljIHJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdDogUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHNuYXBzaG90LnJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrcy5oYXMoc3RyUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdFx0ZWRpdFN0YWNrLnJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdCk7XG5cblx0XHRcdGlmICghZWRpdFN0YWNrLmhhc1Bhc3RFbGVtZW50cygpICYmICFlZGl0U3RhY2suaGFzRnV0dXJlRWxlbWVudHMoKSkge1xuXHRcdFx0XHQvLyB0aGUgZWRpdCBzdGFjayBpcyBub3cgZW1wdHksIGp1c3QgcmVtb3ZlIGl0IGVudGlyZWx5XG5cdFx0XHRcdGVkaXRTdGFjay5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRTdGFja3MuZGVsZXRlKHN0clJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKERFQlVHKSB7XG5cdFx0XHR0aGlzLl9wcmludCgncmVzdG9yZVNuYXBzaG90Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldEVsZW1lbnRzKHJlc291cmNlOiBVUkkpOiBJUGFzdEZ1dHVyZUVsZW1lbnRzIHtcblx0XHRjb25zdCBzdHJSZXNvdXJjZSA9IHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX2VkaXRTdGFja3MuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdHJldHVybiBlZGl0U3RhY2suZ2V0RWxlbWVudHMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcGFzdDogW10sIGZ1dHVyZTogW10gfTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDbG9zZXN0VW5kb0VsZW1lbnRXaXRoU291cmNlKHNvdXJjZUlkOiBudW1iZXIpOiBbU3RhY2tFbGVtZW50IHwgbnVsbCwgc3RyaW5nIHwgbnVsbF0ge1xuXHRcdGlmICghc291cmNlSWQpIHtcblx0XHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCBhbiBlbGVtZW50IHdpdGggdGhlIHNvdXJjZUlkIGFuZCB3aXRoIHRoZSBoaWdoZXN0IHNvdXJjZU9yZGVyIHJlYWR5IHRvIGJlIHVuZG9uZVxuXHRcdGxldCBtYXRjaGVkRWxlbWVudDogU3RhY2tFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG1hdGNoZWRTdHJSZXNvdXJjZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGNvbnN0IFtzdHJSZXNvdXJjZSwgZWRpdFN0YWNrXSBvZiB0aGlzLl9lZGl0U3RhY2tzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCk7XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjYW5kaWRhdGUuc291cmNlSWQgPT09IHNvdXJjZUlkKSB7XG5cdFx0XHRcdGlmICghbWF0Y2hlZEVsZW1lbnQgfHwgY2FuZGlkYXRlLnNvdXJjZU9yZGVyID4gbWF0Y2hlZEVsZW1lbnQuc291cmNlT3JkZXIpIHtcblx0XHRcdFx0XHRtYXRjaGVkRWxlbWVudCA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRtYXRjaGVkU3RyUmVzb3VyY2UgPSBzdHJSZXNvdXJjZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbbWF0Y2hlZEVsZW1lbnQsIG1hdGNoZWRTdHJSZXNvdXJjZV07XG5cdH1cblxuXHRwdWJsaWMgY2FuVW5kbyhyZXNvdXJjZU9yU291cmNlOiBVUkkgfCBVbmRvUmVkb1NvdXJjZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChyZXNvdXJjZU9yU291cmNlIGluc3RhbmNlb2YgVW5kb1JlZG9Tb3VyY2UpIHtcblx0XHRcdGNvbnN0IFssIG1hdGNoZWRTdHJSZXNvdXJjZV0gPSB0aGlzLl9maW5kQ2xvc2VzdFVuZG9FbGVtZW50V2l0aFNvdXJjZShyZXNvdXJjZU9yU291cmNlLmlkKTtcblx0XHRcdHJldHVybiBtYXRjaGVkU3RyUmVzb3VyY2UgPyB0cnVlIDogZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0clJlc291cmNlID0gdGhpcy5nZXRVcmlDb21wYXJpc29uS2V5KHJlc291cmNlT3JTb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0XHRyZXR1cm4gZWRpdFN0YWNrLmhhc1Bhc3RFbGVtZW50cygpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9vbkVycm9yKGVycjogRXJyb3IsIGVsZW1lbnQ6IFN0YWNrRWxlbWVudCk6IHZvaWQge1xuXHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0Ly8gQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgdW5kb2luZyBvciByZWRvaW5nID0+IGRyb3AgdGhlIHVuZG8vcmVkbyBzdGFjayBmb3IgYWxsIGFmZmVjdGVkIHJlc291cmNlc1xuXHRcdGZvciAoY29uc3Qgc3RyUmVzb3VyY2Ugb2YgZWxlbWVudC5zdHJSZXNvdXJjZXMpIHtcblx0XHRcdHRoaXMucmVtb3ZlRWxlbWVudHMoc3RyUmVzb3VyY2UpO1xuXHRcdH1cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdH1cblxuXHRwcml2YXRlIF9hY3F1aXJlTG9ja3MoZWRpdFN0YWNrU25hcHNob3Q6IEVkaXRTdGFja1NuYXBzaG90KTogKCkgPT4gdm9pZCB7XG5cdFx0Ly8gZmlyc3QsIGNoZWNrIGlmIGFsbCBsb2NrcyBjYW4gYmUgYWNxdWlyZWRcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFjayBvZiBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzKSB7XG5cdFx0XHRpZiAoZWRpdFN0YWNrLmxvY2tlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBhY3F1aXJlIGVkaXQgc3RhY2sgbG9jaycpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNhbiBhY3F1aXJlIGFsbCBsb2Nrc1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdGVkaXRTdGFjay5sb2NrZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHQvLyByZWxlYXNlIGFsbCBsb2Nrc1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0U3RhY2sgb2YgZWRpdFN0YWNrU25hcHNob3QuZWRpdFN0YWNrcykge1xuXHRcdFx0XHRlZGl0U3RhY2subG9ja2VkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3NhZmVJbnZva2VXaXRoTG9ja3MoZWxlbWVudDogU3RhY2tFbGVtZW50LCBpbnZva2U6ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkLCBlZGl0U3RhY2tTbmFwc2hvdDogRWRpdFN0YWNrU25hcHNob3QsIGNsZWFudXA6IElEaXNwb3NhYmxlLCBjb250aW51YXRpb246ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGNvbnN0IHJlbGVhc2VMb2NrcyA9IHRoaXMuX2FjcXVpcmVMb2NrcyhlZGl0U3RhY2tTbmFwc2hvdCk7XG5cblx0XHRsZXQgcmVzdWx0OiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gaW52b2tlKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZWxlYXNlTG9ja3MoKTtcblx0XHRcdGNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX29uRXJyb3IoZXJyLCBlbGVtZW50KTtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHQvLyByZXN1bHQgaXMgUHJvbWlzZTx2b2lkPlxuXHRcdFx0cmV0dXJuIHJlc3VsdC50aGVuKFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0cmVsZWFzZUxvY2tzKCk7XG5cdFx0XHRcdFx0Y2xlYW51cC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbnRpbnVhdGlvbigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQoZXJyKSA9PiB7XG5cdFx0XHRcdFx0cmVsZWFzZUxvY2tzKCk7XG5cdFx0XHRcdFx0Y2xlYW51cC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX29uRXJyb3IoZXJyLCBlbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gcmVzdWx0IGlzIHZvaWRcblx0XHRcdHJlbGVhc2VMb2NrcygpO1xuXHRcdFx0Y2xlYW51cC5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gY29udGludWF0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW52b2tlV29ya3NwYWNlUHJlcGFyZShlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQpOiBQcm9taXNlPElEaXNwb3NhYmxlPiB7XG5cdFx0aWYgKHR5cGVvZiBlbGVtZW50LmFjdHVhbC5wcmVwYXJlVW5kb1JlZG8gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBlbGVtZW50LmFjdHVhbC5wcmVwYXJlVW5kb1JlZG8oKTtcblx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZva2VSZXNvdXJjZVByZXBhcmUoZWxlbWVudDogUmVzb3VyY2VTdGFja0VsZW1lbnQsIGNhbGxiYWNrOiAoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChlbGVtZW50LmFjdHVhbC50eXBlICE9PSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSB8fCB0eXBlb2YgZWxlbWVudC5hY3R1YWwucHJlcGFyZVVuZG9SZWRvID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Ly8gbm8gcHJlcGFyYXRpb24gbmVlZGVkXG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soRGlzcG9zYWJsZS5Ob25lKTtcblx0XHR9XG5cblx0XHRjb25zdCByID0gZWxlbWVudC5hY3R1YWwucHJlcGFyZVVuZG9SZWRvKCk7XG5cdFx0aWYgKCFyKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGNsZWFuIHVwXG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soRGlzcG9zYWJsZS5Ob25lKTtcblx0XHR9XG5cblx0XHRpZiAoaXNEaXNwb3NhYmxlKHIpKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2socik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHIudGhlbigoZGlzcG9zYWJsZSkgPT4ge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKGRpc3Bvc2FibGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWZmZWN0ZWRFZGl0U3RhY2tzKGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCk6IEVkaXRTdGFja1NuYXBzaG90IHtcblx0XHRjb25zdCBhZmZlY3RlZEVkaXRTdGFja3M6IFJlc291cmNlRWRpdFN0YWNrW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHN0clJlc291cmNlIG9mIGVsZW1lbnQuc3RyUmVzb3VyY2VzKSB7XG5cdFx0XHRhZmZlY3RlZEVkaXRTdGFja3MucHVzaCh0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkgfHwgbWlzc2luZ0VkaXRTdGFjayk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgRWRpdFN0YWNrU25hcHNob3QoYWZmZWN0ZWRFZGl0U3RhY2tzKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyeVRvU3BsaXRBbmRVbmRvKHN0clJlc291cmNlOiBzdHJpbmcsIGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCwgaWdub3JlUmVzb3VyY2VzOiBSZW1vdmVkUmVzb3VyY2VzIHwgbnVsbCwgbWVzc2FnZTogc3RyaW5nKTogV29ya3NwYWNlVmVyaWZpY2F0aW9uRXJyb3Ige1xuXHRcdGlmIChlbGVtZW50LmNhblNwbGl0KCkpIHtcblx0XHRcdHRoaXMuX3NwbGl0UGFzdFdvcmtzcGFjZUVsZW1lbnQoZWxlbWVudCwgaWdub3JlUmVzb3VyY2VzKTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihtZXNzYWdlKTtcblx0XHRcdHJldHVybiBuZXcgV29ya3NwYWNlVmVyaWZpY2F0aW9uRXJyb3IodGhpcy5fdW5kbyhzdHJSZXNvdXJjZSwgMCwgdHJ1ZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDYW5ub3Qgc2FmZWx5IHNwbGl0IHRoaXMgd29ya3NwYWNlIGVsZW1lbnQgPT4gZmx1c2ggYWxsIHVuZG8vcmVkbyBzdGFja3Ncblx0XHRcdGZvciAoY29uc3Qgc3RyUmVzb3VyY2Ugb2YgZWxlbWVudC5zdHJSZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVFbGVtZW50cyhzdHJSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRyZXR1cm4gbmV3IFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tXb3Jrc3BhY2VVbmRvKHN0clJlc291cmNlOiBzdHJpbmcsIGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCwgZWRpdFN0YWNrU25hcHNob3Q6IEVkaXRTdGFja1NuYXBzaG90LCBjaGVja0ludmFsaWRhdGVkUmVzb3VyY2VzOiBib29sZWFuKTogV29ya3NwYWNlVmVyaWZpY2F0aW9uRXJyb3IgfCBudWxsIHtcblx0XHRpZiAoZWxlbWVudC5yZW1vdmVkUmVzb3VyY2VzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFVuZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRlbGVtZW50LnJlbW92ZWRSZXNvdXJjZXMsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVVuZG8nLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhbm90aGVyIG1lc3NhZ2UuJ10gfSxcblx0XHRcdFx0XHRcIkNvdWxkIG5vdCB1bmRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXMuIHsxfVwiLCBlbGVtZW50LmxhYmVsLCBlbGVtZW50LnJlbW92ZWRSZXNvdXJjZXMuY3JlYXRlTWVzc2FnZSgpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChjaGVja0ludmFsaWRhdGVkUmVzb3VyY2VzICYmIGVsZW1lbnQuaW52YWxpZGF0ZWRSZXNvdXJjZXMpIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kVW5kbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdGVsZW1lbnQuaW52YWxpZGF0ZWRSZXNvdXJjZXMsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVVuZG8nLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhbm90aGVyIG1lc3NhZ2UuJ10gfSxcblx0XHRcdFx0XHRcIkNvdWxkIG5vdCB1bmRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXMuIHsxfVwiLCBlbGVtZW50LmxhYmVsLCBlbGVtZW50LmludmFsaWRhdGVkUmVzb3VyY2VzLmNyZWF0ZU1lc3NhZ2UoKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIHRoaXMgbXVzdCBiZSB0aGUgbGFzdCBwYXN0IGVsZW1lbnQgaW4gYWxsIHRoZSBpbXBhY3RlZCByZXNvdXJjZXMhXG5cdFx0Y29uc3QgY2Fubm90VW5kb0R1ZVRvUmVzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdGlmIChlZGl0U3RhY2suZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCkgIT09IGVsZW1lbnQpIHtcblx0XHRcdFx0Y2Fubm90VW5kb0R1ZVRvUmVzb3VyY2VzLnB1c2goZWRpdFN0YWNrLnJlc291cmNlTGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2Fubm90VW5kb0R1ZVRvUmVzb3VyY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kVW5kbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVVuZG9EdWVUb0NoYW5nZXMnLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhIGxpc3Qgb2YgZmlsZW5hbWVzLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgdW5kbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzIGJlY2F1c2UgY2hhbmdlcyB3ZXJlIG1hZGUgdG8gezF9XCIsIGVsZW1lbnQubGFiZWwsIGNhbm5vdFVuZG9EdWVUb1Jlc291cmNlcy5qb2luKCcsICcpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2Fubm90TG9ja0R1ZVRvUmVzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdGlmIChlZGl0U3RhY2subG9ja2VkKSB7XG5cdFx0XHRcdGNhbm5vdExvY2tEdWVUb1Jlc291cmNlcy5wdXNoKGVkaXRTdGFjay5yZXNvdXJjZUxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNhbm5vdExvY2tEdWVUb1Jlc291cmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFVuZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VVbmRvRHVlVG9JblByb2dyZXNzVW5kb1JlZG8nLCBjb21tZW50OiBbJ3swfSBpcyBhIGxhYmVsIGZvciBhbiBvcGVyYXRpb24uIHsxfSBpcyBhIGxpc3Qgb2YgZmlsZW5hbWVzLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgdW5kbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzIGJlY2F1c2UgdGhlcmUgaXMgYWxyZWFkeSBhbiB1bmRvIG9yIHJlZG8gb3BlcmF0aW9uIHJ1bm5pbmcgb24gezF9XCIsIGVsZW1lbnQubGFiZWwsIGNhbm5vdExvY2tEdWVUb1Jlc291cmNlcy5qb2luKCcsICcpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgaWYgbmV3IHN0YWNrIGVsZW1lbnRzIHdlcmUgYWRkZWQgaW4gdGhlIG1lYW50aW1lLi4uXG5cdFx0aWYgKCFlZGl0U3RhY2tTbmFwc2hvdC5pc1ZhbGlkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kVW5kbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVVuZG9EdWVUb0luTWVhbnRpbWVVbmRvUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4gezF9IGlzIGEgbGlzdCBvZiBmaWxlbmFtZXMuJ10gfSxcblx0XHRcdFx0XHRcIkNvdWxkIG5vdCB1bmRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXMgYmVjYXVzZSBhbiB1bmRvIG9yIHJlZG8gb3BlcmF0aW9uIG9jY3VycmVkIGluIHRoZSBtZWFudGltZVwiLCBlbGVtZW50LmxhYmVsXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF93b3Jrc3BhY2VVbmRvKHN0clJlc291cmNlOiBzdHJpbmcsIGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCwgdW5kb0NvbmZpcm1lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRjb25zdCBhZmZlY3RlZEVkaXRTdGFja3MgPSB0aGlzLl9nZXRBZmZlY3RlZEVkaXRTdGFja3MoZWxlbWVudCk7XG5cdFx0Y29uc3QgdmVyaWZpY2F0aW9uRXJyb3IgPSB0aGlzLl9jaGVja1dvcmtzcGFjZVVuZG8oc3RyUmVzb3VyY2UsIGVsZW1lbnQsIGFmZmVjdGVkRWRpdFN0YWNrcywgLyppbnZhbGlkYXRlZCByZXNvdXJjZXMgd2lsbCBiZSBjaGVja2VkIGFmdGVyIHRoZSBwcmVwYXJlIGNhbGwqL2ZhbHNlKTtcblx0XHRpZiAodmVyaWZpY2F0aW9uRXJyb3IpIHtcblx0XHRcdHJldHVybiB2ZXJpZmljYXRpb25FcnJvci5yZXR1cm5WYWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpcm1BbmRFeGVjdXRlV29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZSwgZWxlbWVudCwgYWZmZWN0ZWRFZGl0U3RhY2tzLCB1bmRvQ29uZmlybWVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzUGFydE9mVW5kb0dyb3VwKGVsZW1lbnQ6IFdvcmtzcGFjZVN0YWNrRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICghZWxlbWVudC5ncm91cElkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIGNoZWNrIHRoYXQgdGhlcmUgaXMgYXQgbGVhc3QgYW5vdGhlciBlbGVtZW50IHdpdGggdGhlIHNhbWUgZ3JvdXBJZCByZWFkeSB0byBiZSB1bmRvbmVcblx0XHRmb3IgKGNvbnN0IFssIGVkaXRTdGFja10gb2YgdGhpcy5fZWRpdFN0YWNrcykge1xuXHRcdFx0Y29uc3QgcGFzdEVsZW1lbnQgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCk7XG5cdFx0XHRpZiAoIXBhc3RFbGVtZW50KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhc3RFbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IHNlY29uZFBhc3RFbGVtZW50ID0gZWRpdFN0YWNrLmdldFNlY29uZENsb3Nlc3RQYXN0RWxlbWVudCgpO1xuXHRcdFx0XHRpZiAoc2Vjb25kUGFzdEVsZW1lbnQgJiYgc2Vjb25kUGFzdEVsZW1lbnQuZ3JvdXBJZCA9PT0gZWxlbWVudC5ncm91cElkKSB7XG5cdFx0XHRcdFx0Ly8gdGhlcmUgaXMgYW5vdGhlciBlbGVtZW50IHdpdGggdGhlIHNhbWUgZ3JvdXAgaWQgaW4gdGhlIHNhbWUgc3RhY2shXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwYXN0RWxlbWVudC5ncm91cElkID09PSBlbGVtZW50Lmdyb3VwSWQpIHtcblx0XHRcdFx0Ly8gdGhlcmUgaXMgYW5vdGhlciBlbGVtZW50IHdpdGggdGhlIHNhbWUgZ3JvdXAgaWQgaW4gYW5vdGhlciBzdGFjayFcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpcm1BbmRFeGVjdXRlV29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGVkaXRTdGFja1NuYXBzaG90OiBFZGl0U3RhY2tTbmFwc2hvdCwgdW5kb0NvbmZpcm1lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKGVsZW1lbnQuY2FuU3BsaXQoKSAmJiAhdGhpcy5faXNQYXJ0T2ZVbmRvR3JvdXAoZWxlbWVudCkpIHtcblx0XHRcdC8vIHRoaXMgZWxlbWVudCBjYW4gYmUgc3BsaXRcblxuXHRcdFx0ZW51bSBVbmRvQ2hvaWNlIHtcblx0XHRcdFx0QWxsID0gMCxcblx0XHRcdFx0VGhpcyA9IDEsXG5cdFx0XHRcdENhbmNlbCA9IDJcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0PFVuZG9DaG9pY2U+KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtV29ya3NwYWNlJywgXCJXb3VsZCB5b3UgbGlrZSB0byB1bmRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXM/XCIsIGVsZW1lbnQubGFiZWwpLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ29rJywgY29tbWVudDogWyd7MH0gZGVub3RlcyBhIG51bWJlciB0aGF0IGlzID4gMSwgJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlVuZG8gaW4gezB9IEZpbGVzXCIsIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MubGVuZ3RoKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gVW5kb0Nob2ljZS5BbGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdub2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVW5kbyB0aGlzICYmRmlsZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gVW5kb0Nob2ljZS5UaGlzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRydW46ICgpID0+IFVuZG9DaG9pY2UuQ2FuY2VsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAocmVzdWx0ID09PSBVbmRvQ2hvaWNlLkNhbmNlbCkge1xuXHRcdFx0XHQvLyBjaG9pY2U6IGNhbmNlbFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQgPT09IFVuZG9DaG9pY2UuVGhpcykge1xuXHRcdFx0XHQvLyBjaG9pY2U6IHVuZG8gdGhpcyBmaWxlXG5cdFx0XHRcdHRoaXMuX3NwbGl0UGFzdFdvcmtzcGFjZUVsZW1lbnQoZWxlbWVudCwgbnVsbCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl91bmRvKHN0clJlc291cmNlLCAwLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY2hvaWNlOiB1bmRvIGluIGFsbCBmaWxlc1xuXG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50LCBpdCBpcyBwb3NzaWJsZSB0aGF0IHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgaW52YWxpZCBpbiB0aGUgbWVhbnRpbWUgKGR1ZSB0byB0aGUgY29uZmlybWF0aW9uIGF3YWl0KVxuXHRcdFx0Y29uc3QgdmVyaWZpY2F0aW9uRXJyb3IxID0gdGhpcy5fY2hlY2tXb3Jrc3BhY2VVbmRvKHN0clJlc291cmNlLCBlbGVtZW50LCBlZGl0U3RhY2tTbmFwc2hvdCwgLyppbnZhbGlkYXRlZCByZXNvdXJjZXMgd2lsbCBiZSBjaGVja2VkIGFmdGVyIHRoZSBwcmVwYXJlIGNhbGwqL2ZhbHNlKTtcblx0XHRcdGlmICh2ZXJpZmljYXRpb25FcnJvcjEpIHtcblx0XHRcdFx0cmV0dXJuIHZlcmlmaWNhdGlvbkVycm9yMS5yZXR1cm5WYWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0dW5kb0NvbmZpcm1lZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gcHJlcGFyZVxuXHRcdGxldCBjbGVhbnVwOiBJRGlzcG9zYWJsZTtcblx0XHR0cnkge1xuXHRcdFx0Y2xlYW51cCA9IGF3YWl0IHRoaXMuX2ludm9rZVdvcmtzcGFjZVByZXBhcmUoZWxlbWVudCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb25FcnJvcihlcnIsIGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIEF0IHRoaXMgcG9pbnQsIGl0IGlzIHBvc3NpYmxlIHRoYXQgdGhlIGVsZW1lbnQgaGFzIGJlZW4gbWFkZSBpbnZhbGlkIGluIHRoZSBtZWFudGltZSAoZHVlIHRvIHRoZSBwcmVwYXJlIGF3YWl0KVxuXHRcdGNvbnN0IHZlcmlmaWNhdGlvbkVycm9yMiA9IHRoaXMuX2NoZWNrV29ya3NwYWNlVW5kbyhzdHJSZXNvdXJjZSwgZWxlbWVudCwgZWRpdFN0YWNrU25hcHNob3QsIC8qbm93IGFsc28gY2hlY2sgdGhhdCB0aGVyZSBhcmUgbm8gbW9yZSBpbnZhbGlkYXRlZCByZXNvdXJjZXMqL3RydWUpO1xuXHRcdGlmICh2ZXJpZmljYXRpb25FcnJvcjIpIHtcblx0XHRcdGNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHZlcmlmaWNhdGlvbkVycm9yMi5yZXR1cm5WYWx1ZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFjayBvZiBlZGl0U3RhY2tTbmFwc2hvdC5lZGl0U3RhY2tzKSB7XG5cdFx0XHRlZGl0U3RhY2subW92ZUJhY2t3YXJkKGVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2FmZUludm9rZVdpdGhMb2NrcyhlbGVtZW50LCAoKSA9PiBlbGVtZW50LmFjdHVhbC51bmRvKCksIGVkaXRTdGFja1NuYXBzaG90LCBjbGVhbnVwLCAoKSA9PiB0aGlzLl9jb250aW51ZVVuZG9Jbkdyb3VwKGVsZW1lbnQuZ3JvdXBJZCwgdW5kb0NvbmZpcm1lZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb3VyY2VVbmRvKGVkaXRTdGFjazogUmVzb3VyY2VFZGl0U3RhY2ssIGVsZW1lbnQ6IFJlc291cmNlU3RhY2tFbGVtZW50LCB1bmRvQ29uZmlybWVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmICghZWxlbWVudC5pc1ZhbGlkKSB7XG5cdFx0XHQvLyBpbnZhbGlkIGVsZW1lbnQgPT4gaW1tZWRpYXRlbHkgZmx1c2ggZWRpdCBzdGFjayFcblx0XHRcdGVkaXRTdGFjay5mbHVzaEFsbEVsZW1lbnRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlZGl0U3RhY2subG9ja2VkKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHR7IGtleTogJ2Nhbm5vdFJlc291cmNlVW5kb0R1ZVRvSW5Qcm9ncmVzc1VuZG9SZWRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiddIH0sXG5cdFx0XHRcdFwiQ291bGQgbm90IHVuZG8gJ3swfScgYmVjYXVzZSB0aGVyZSBpcyBhbHJlYWR5IGFuIHVuZG8gb3IgcmVkbyBvcGVyYXRpb24gcnVubmluZy5cIiwgZWxlbWVudC5sYWJlbFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihtZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ludm9rZVJlc291cmNlUHJlcGFyZShlbGVtZW50LCAoY2xlYW51cCkgPT4ge1xuXHRcdFx0ZWRpdFN0YWNrLm1vdmVCYWNrd2FyZChlbGVtZW50KTtcblx0XHRcdHJldHVybiB0aGlzLl9zYWZlSW52b2tlV2l0aExvY2tzKGVsZW1lbnQsICgpID0+IGVsZW1lbnQuYWN0dWFsLnVuZG8oKSwgbmV3IEVkaXRTdGFja1NuYXBzaG90KFtlZGl0U3RhY2tdKSwgY2xlYW51cCwgKCkgPT4gdGhpcy5fY29udGludWVVbmRvSW5Hcm91cChlbGVtZW50Lmdyb3VwSWQsIHVuZG9Db25maXJtZWQpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDbG9zZXN0VW5kb0VsZW1lbnRJbkdyb3VwKGdyb3VwSWQ6IG51bWJlcik6IFtTdGFja0VsZW1lbnQgfCBudWxsLCBzdHJpbmcgfCBudWxsXSB7XG5cdFx0aWYgKCFncm91cElkKSB7XG5cdFx0XHRyZXR1cm4gW251bGwsIG51bGxdO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgYW5vdGhlciBlbGVtZW50IHdpdGggdGhlIHNhbWUgZ3JvdXBJZCBhbmQgd2l0aCB0aGUgaGlnaGVzdCBncm91cE9yZGVyIHJlYWR5IHRvIGJlIHVuZG9uZVxuXHRcdGxldCBtYXRjaGVkRWxlbWVudDogU3RhY2tFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG1hdGNoZWRTdHJSZXNvdXJjZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGNvbnN0IFtzdHJSZXNvdXJjZSwgZWRpdFN0YWNrXSBvZiB0aGlzLl9lZGl0U3RhY2tzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdFBhc3RFbGVtZW50KCk7XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjYW5kaWRhdGUuZ3JvdXBJZCA9PT0gZ3JvdXBJZCkge1xuXHRcdFx0XHRpZiAoIW1hdGNoZWRFbGVtZW50IHx8IGNhbmRpZGF0ZS5ncm91cE9yZGVyID4gbWF0Y2hlZEVsZW1lbnQuZ3JvdXBPcmRlcikge1xuXHRcdFx0XHRcdG1hdGNoZWRFbGVtZW50ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdG1hdGNoZWRTdHJSZXNvdXJjZSA9IHN0clJlc291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFttYXRjaGVkRWxlbWVudCwgbWF0Y2hlZFN0clJlc291cmNlXTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRpbnVlVW5kb0luR3JvdXAoZ3JvdXBJZDogbnVtYmVyLCB1bmRvQ29uZmlybWVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmICghZ3JvdXBJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFssIG1hdGNoZWRTdHJSZXNvdXJjZV0gPSB0aGlzLl9maW5kQ2xvc2VzdFVuZG9FbGVtZW50SW5Hcm91cChncm91cElkKTtcblx0XHRpZiAobWF0Y2hlZFN0clJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdW5kbyhtYXRjaGVkU3RyUmVzb3VyY2UsIDAsIHVuZG9Db25maXJtZWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1bmRvKHJlc291cmNlT3JTb3VyY2U6IFVSSSB8IFVuZG9SZWRvU291cmNlKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmIChyZXNvdXJjZU9yU291cmNlIGluc3RhbmNlb2YgVW5kb1JlZG9Tb3VyY2UpIHtcblx0XHRcdGNvbnN0IFssIG1hdGNoZWRTdHJSZXNvdXJjZV0gPSB0aGlzLl9maW5kQ2xvc2VzdFVuZG9FbGVtZW50V2l0aFNvdXJjZShyZXNvdXJjZU9yU291cmNlLmlkKTtcblx0XHRcdHJldHVybiBtYXRjaGVkU3RyUmVzb3VyY2UgPyB0aGlzLl91bmRvKG1hdGNoZWRTdHJSZXNvdXJjZSwgcmVzb3VyY2VPclNvdXJjZS5pZCwgZmFsc2UpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHJlc291cmNlT3JTb3VyY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdW5kbyhyZXNvdXJjZU9yU291cmNlLCAwLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91bmRvKHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZU9yU291cmNlKSwgMCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdW5kbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBzb3VyY2VJZDogbnVtYmVyID0gMCwgdW5kb0NvbmZpcm1lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRTdGFja3MuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRTdGFjayA9IHRoaXMuX2VkaXRTdGFja3MuZ2V0KHN0clJlc291cmNlKSE7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGVkaXRTdGFjay5nZXRDbG9zZXN0UGFzdEVsZW1lbnQoKTtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5ncm91cElkKSB7XG5cdFx0XHQvLyB0aGlzIGVsZW1lbnQgaXMgYSBwYXJ0IG9mIGEgZ3JvdXAsIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHVuZG9pbmcgaW4gYSBncm91cCBpcyBpbiBvcmRlclxuXHRcdFx0Y29uc3QgW21hdGNoZWRFbGVtZW50LCBtYXRjaGVkU3RyUmVzb3VyY2VdID0gdGhpcy5fZmluZENsb3Nlc3RVbmRvRWxlbWVudEluR3JvdXAoZWxlbWVudC5ncm91cElkKTtcblx0XHRcdGlmIChlbGVtZW50ICE9PSBtYXRjaGVkRWxlbWVudCAmJiBtYXRjaGVkU3RyUmVzb3VyY2UpIHtcblx0XHRcdFx0Ly8gdGhlcmUgaXMgYW4gZWxlbWVudCBpbiB0aGUgc2FtZSBncm91cCB0aGF0IHNob3VsZCBiZSB1bmRvbmUgYmVmb3JlIHRoaXMgb25lXG5cdFx0XHRcdHJldHVybiB0aGlzLl91bmRvKG1hdGNoZWRTdHJSZXNvdXJjZSwgc291cmNlSWQsIHVuZG9Db25maXJtZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNob3VsZFByb21wdEZvckNvbmZpcm1hdGlvbiA9IChlbGVtZW50LnNvdXJjZUlkICE9PSBzb3VyY2VJZCB8fCBlbGVtZW50LmNvbmZpcm1CZWZvcmVVbmRvKTtcblx0XHRpZiAoc2hvdWxkUHJvbXB0Rm9yQ29uZmlybWF0aW9uICYmICF1bmRvQ29uZmlybWVkKSB7XG5cdFx0XHQvLyBIaXQgYSBkaWZmZXJlbnQgc291cmNlIG9yIHRoZSBlbGVtZW50IGFza3MgZm9yIHByb21wdCBiZWZvcmUgdW5kbywgcHJvbXB0IGZvciBjb25maXJtYXRpb25cblx0XHRcdHJldHVybiB0aGlzLl9jb25maXJtQW5kQ29udGludWVVbmRvKHN0clJlc291cmNlLCBzb3VyY2VJZCwgZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VVbmRvKHN0clJlc291cmNlLCBlbGVtZW50LCB1bmRvQ29uZmlybWVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVVuZG8oZWRpdFN0YWNrLCBlbGVtZW50LCB1bmRvQ29uZmlybWVkKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKERFQlVHKSB7XG5cdFx0XHRcdHRoaXMuX3ByaW50KCd1bmRvJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlybUFuZENvbnRpbnVlVW5kbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBzb3VyY2VJZDogbnVtYmVyLCBlbGVtZW50OiBTdGFja0VsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtRGlmZmVyZW50U291cmNlJywgXCJXb3VsZCB5b3UgbGlrZSB0byB1bmRvICd7MH0nP1wiLCBlbGVtZW50LmxhYmVsKSxcblx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ2NvbmZpcm1EaWZmZXJlbnRTb3VyY2UueWVzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmWWVzXCIpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiBubHMubG9jYWxpemUoJ2NvbmZpcm1EaWZmZXJlbnRTb3VyY2Uubm8nLCBcIk5vXCIpXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdW5kbyhzdHJSZXNvdXJjZSwgc291cmNlSWQsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENsb3Nlc3RSZWRvRWxlbWVudFdpdGhTb3VyY2Uoc291cmNlSWQ6IG51bWJlcik6IFtTdGFja0VsZW1lbnQgfCBudWxsLCBzdHJpbmcgfCBudWxsXSB7XG5cdFx0aWYgKCFzb3VyY2VJZCkge1xuXHRcdFx0cmV0dXJuIFtudWxsLCBudWxsXTtcblx0XHR9XG5cblx0XHQvLyBmaW5kIGFuIGVsZW1lbnQgd2l0aCBzb3VyY2VJZCBhbmQgd2l0aCB0aGUgbG93ZXN0IHNvdXJjZU9yZGVyIHJlYWR5IHRvIGJlIHJlZG9uZVxuXHRcdGxldCBtYXRjaGVkRWxlbWVudDogU3RhY2tFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG1hdGNoZWRTdHJSZXNvdXJjZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGNvbnN0IFtzdHJSZXNvdXJjZSwgZWRpdFN0YWNrXSBvZiB0aGlzLl9lZGl0U3RhY2tzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdEZ1dHVyZUVsZW1lbnQoKTtcblx0XHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNhbmRpZGF0ZS5zb3VyY2VJZCA9PT0gc291cmNlSWQpIHtcblx0XHRcdFx0aWYgKCFtYXRjaGVkRWxlbWVudCB8fCBjYW5kaWRhdGUuc291cmNlT3JkZXIgPCBtYXRjaGVkRWxlbWVudC5zb3VyY2VPcmRlcikge1xuXHRcdFx0XHRcdG1hdGNoZWRFbGVtZW50ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdG1hdGNoZWRTdHJSZXNvdXJjZSA9IHN0clJlc291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFttYXRjaGVkRWxlbWVudCwgbWF0Y2hlZFN0clJlc291cmNlXTtcblx0fVxuXG5cdHB1YmxpYyBjYW5SZWRvKHJlc291cmNlT3JTb3VyY2U6IFVSSSB8IFVuZG9SZWRvU291cmNlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHJlc291cmNlT3JTb3VyY2UgaW5zdGFuY2VvZiBVbmRvUmVkb1NvdXJjZSkge1xuXHRcdFx0Y29uc3QgWywgbWF0Y2hlZFN0clJlc291cmNlXSA9IHRoaXMuX2ZpbmRDbG9zZXN0UmVkb0VsZW1lbnRXaXRoU291cmNlKHJlc291cmNlT3JTb3VyY2UuaWQpO1xuXHRcdFx0cmV0dXJuIG1hdGNoZWRTdHJSZXNvdXJjZSA/IHRydWUgOiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RyUmVzb3VyY2UgPSB0aGlzLmdldFVyaUNvbXBhcmlzb25LZXkocmVzb3VyY2VPclNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX2VkaXRTdGFja3MuaGFzKHN0clJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fZWRpdFN0YWNrcy5nZXQoc3RyUmVzb3VyY2UpITtcblx0XHRcdHJldHVybiBlZGl0U3RhY2suaGFzRnV0dXJlRWxlbWVudHMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJ5VG9TcGxpdEFuZFJlZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgZWxlbWVudDogV29ya3NwYWNlU3RhY2tFbGVtZW50LCBpZ25vcmVSZXNvdXJjZXM6IFJlbW92ZWRSZXNvdXJjZXMgfCBudWxsLCBtZXNzYWdlOiBzdHJpbmcpOiBXb3Jrc3BhY2VWZXJpZmljYXRpb25FcnJvciB7XG5cdFx0aWYgKGVsZW1lbnQuY2FuU3BsaXQoKSkge1xuXHRcdFx0dGhpcy5fc3BsaXRGdXR1cmVXb3Jrc3BhY2VFbGVtZW50KGVsZW1lbnQsIGlnbm9yZVJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRyZXR1cm4gbmV3IFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yKHRoaXMuX3JlZG8oc3RyUmVzb3VyY2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ2Fubm90IHNhZmVseSBzcGxpdCB0aGlzIHdvcmtzcGFjZSBlbGVtZW50ID0+IGZsdXNoIGFsbCB1bmRvL3JlZG8gc3RhY2tzXG5cdFx0XHRmb3IgKGNvbnN0IHN0clJlc291cmNlIG9mIGVsZW1lbnQuc3RyUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRWxlbWVudHMoc3RyUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2VWZXJpZmljYXRpb25FcnJvcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrV29ya3NwYWNlUmVkbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGVkaXRTdGFja1NuYXBzaG90OiBFZGl0U3RhY2tTbmFwc2hvdCwgY2hlY2tJbnZhbGlkYXRlZFJlc291cmNlczogYm9vbGVhbik6IFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yIHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQucmVtb3ZlZFJlc291cmNlcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RyeVRvU3BsaXRBbmRSZWRvKFxuXHRcdFx0XHRzdHJSZXNvdXJjZSxcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVkUmVzb3VyY2VzLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VSZWRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYW5vdGhlciBtZXNzYWdlLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgcmVkbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzLiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5yZW1vdmVkUmVzb3VyY2VzLmNyZWF0ZU1lc3NhZ2UoKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoY2hlY2tJbnZhbGlkYXRlZFJlc291cmNlcyAmJiBlbGVtZW50LmludmFsaWRhdGVkUmVzb3VyY2VzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHJ5VG9TcGxpdEFuZFJlZG8oXG5cdFx0XHRcdHN0clJlc291cmNlLFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRlbGVtZW50LmludmFsaWRhdGVkUmVzb3VyY2VzLFxuXHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdjYW5ub3RXb3Jrc3BhY2VSZWRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYW5vdGhlciBtZXNzYWdlLiddIH0sXG5cdFx0XHRcdFx0XCJDb3VsZCBub3QgcmVkbyAnezB9JyBhY3Jvc3MgYWxsIGZpbGVzLiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5pbnZhbGlkYXRlZFJlc291cmNlcy5jcmVhdGVNZXNzYWdlKClcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyB0aGlzIG11c3QgYmUgdGhlIGxhc3QgZnV0dXJlIGVsZW1lbnQgaW4gYWxsIHRoZSBpbXBhY3RlZCByZXNvdXJjZXMhXG5cdFx0Y29uc3QgY2Fubm90UmVkb0R1ZVRvUmVzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrIG9mIGVkaXRTdGFja1NuYXBzaG90LmVkaXRTdGFja3MpIHtcblx0XHRcdGlmIChlZGl0U3RhY2suZ2V0Q2xvc2VzdEZ1dHVyZUVsZW1lbnQoKSAhPT0gZWxlbWVudCkge1xuXHRcdFx0XHRjYW5ub3RSZWRvRHVlVG9SZXNvdXJjZXMucHVzaChlZGl0U3RhY2sucmVzb3VyY2VMYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjYW5ub3RSZWRvRHVlVG9SZXNvdXJjZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RyeVRvU3BsaXRBbmRSZWRvKFxuXHRcdFx0XHRzdHJSZXNvdXJjZSxcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0bnVsbCxcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnY2Fubm90V29ya3NwYWNlUmVkb0R1ZVRvQ2hhbmdlcycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4gezF9IGlzIGEgbGlzdCBvZiBmaWxlbmFtZXMuJ10gfSxcblx0XHRcdFx0XHRcIkNvdWxkIG5vdCByZWRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXMgYmVjYXVzZSBjaGFuZ2VzIHdlcmUgbWFkZSB0byB7MX1cIiwgZWxlbWVudC5sYWJlbCwgY2Fubm90UmVkb0R1ZVRvUmVzb3VyY2VzLmpvaW4oJywgJylcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5ub3RMb2NrRHVlVG9SZXNvdXJjZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0U3RhY2sgb2YgZWRpdFN0YWNrU25hcHNob3QuZWRpdFN0YWNrcykge1xuXHRcdFx0aWYgKGVkaXRTdGFjay5sb2NrZWQpIHtcblx0XHRcdFx0Y2Fubm90TG9ja0R1ZVRvUmVzb3VyY2VzLnB1c2goZWRpdFN0YWNrLnJlc291cmNlTGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2Fubm90TG9ja0R1ZVRvUmVzb3VyY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl90cnlUb1NwbGl0QW5kUmVkbyhcblx0XHRcdFx0c3RyUmVzb3VyY2UsXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Nhbm5vdFdvcmtzcGFjZVJlZG9EdWVUb0luUHJvZ3Jlc3NVbmRvUmVkbycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbGFiZWwgZm9yIGFuIG9wZXJhdGlvbi4gezF9IGlzIGEgbGlzdCBvZiBmaWxlbmFtZXMuJ10gfSxcblx0XHRcdFx0XHRcIkNvdWxkIG5vdCByZWRvICd7MH0nIGFjcm9zcyBhbGwgZmlsZXMgYmVjYXVzZSB0aGVyZSBpcyBhbHJlYWR5IGFuIHVuZG8gb3IgcmVkbyBvcGVyYXRpb24gcnVubmluZyBvbiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgY2Fubm90TG9ja0R1ZVRvUmVzb3VyY2VzLmpvaW4oJywgJylcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayBpZiBuZXcgc3RhY2sgZWxlbWVudHMgd2VyZSBhZGRlZCBpbiB0aGUgbWVhbnRpbWUuLi5cblx0XHRpZiAoIWVkaXRTdGFja1NuYXBzaG90LmlzVmFsaWQoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RyeVRvU3BsaXRBbmRSZWRvKFxuXHRcdFx0XHRzdHJSZXNvdXJjZSxcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0bnVsbCxcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnY2Fubm90V29ya3NwYWNlUmVkb0R1ZVRvSW5NZWFudGltZVVuZG9SZWRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiB7MX0gaXMgYSBsaXN0IG9mIGZpbGVuYW1lcy4nXSB9LFxuXHRcdFx0XHRcdFwiQ291bGQgbm90IHJlZG8gJ3swfScgYWNyb3NzIGFsbCBmaWxlcyBiZWNhdXNlIGFuIHVuZG8gb3IgcmVkbyBvcGVyYXRpb24gb2NjdXJyZWQgaW4gdGhlIG1lYW50aW1lXCIsIGVsZW1lbnQubGFiZWxcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3dvcmtzcGFjZVJlZG8oc3RyUmVzb3VyY2U6IHN0cmluZywgZWxlbWVudDogV29ya3NwYWNlU3RhY2tFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGNvbnN0IGFmZmVjdGVkRWRpdFN0YWNrcyA9IHRoaXMuX2dldEFmZmVjdGVkRWRpdFN0YWNrcyhlbGVtZW50KTtcblx0XHRjb25zdCB2ZXJpZmljYXRpb25FcnJvciA9IHRoaXMuX2NoZWNrV29ya3NwYWNlUmVkbyhzdHJSZXNvdXJjZSwgZWxlbWVudCwgYWZmZWN0ZWRFZGl0U3RhY2tzLCAvKmludmFsaWRhdGVkIHJlc291cmNlcyB3aWxsIGJlIGNoZWNrZWQgYWZ0ZXIgdGhlIHByZXBhcmUgY2FsbCovZmFsc2UpO1xuXHRcdGlmICh2ZXJpZmljYXRpb25FcnJvcikge1xuXHRcdFx0cmV0dXJuIHZlcmlmaWNhdGlvbkVycm9yLnJldHVyblZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZXhlY3V0ZVdvcmtzcGFjZVJlZG8oc3RyUmVzb3VyY2UsIGVsZW1lbnQsIGFmZmVjdGVkRWRpdFN0YWNrcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlV29ya3NwYWNlUmVkbyhzdHJSZXNvdXJjZTogc3RyaW5nLCBlbGVtZW50OiBXb3Jrc3BhY2VTdGFja0VsZW1lbnQsIGVkaXRTdGFja1NuYXBzaG90OiBFZGl0U3RhY2tTbmFwc2hvdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIHByZXBhcmVcblx0XHRsZXQgY2xlYW51cDogSURpc3Bvc2FibGU7XG5cdFx0dHJ5IHtcblx0XHRcdGNsZWFudXAgPSBhd2FpdCB0aGlzLl9pbnZva2VXb3Jrc3BhY2VQcmVwYXJlKGVsZW1lbnQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29uRXJyb3IoZXJyLCBlbGVtZW50KTtcblx0XHR9XG5cblx0XHQvLyBBdCB0aGlzIHBvaW50LCBpdCBpcyBwb3NzaWJsZSB0aGF0IHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgaW52YWxpZCBpbiB0aGUgbWVhbnRpbWUgKGR1ZSB0byB0aGUgcHJlcGFyZSBhd2FpdClcblx0XHRjb25zdCB2ZXJpZmljYXRpb25FcnJvciA9IHRoaXMuX2NoZWNrV29ya3NwYWNlUmVkbyhzdHJSZXNvdXJjZSwgZWxlbWVudCwgZWRpdFN0YWNrU25hcHNob3QsIC8qbm93IGFsc28gY2hlY2sgdGhhdCB0aGVyZSBhcmUgbm8gbW9yZSBpbnZhbGlkYXRlZCByZXNvdXJjZXMqL3RydWUpO1xuXHRcdGlmICh2ZXJpZmljYXRpb25FcnJvcikge1xuXHRcdFx0Y2xlYW51cC5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdmVyaWZpY2F0aW9uRXJyb3IucmV0dXJuVmFsdWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlZGl0U3RhY2sgb2YgZWRpdFN0YWNrU25hcHNob3QuZWRpdFN0YWNrcykge1xuXHRcdFx0ZWRpdFN0YWNrLm1vdmVGb3J3YXJkKGVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2FmZUludm9rZVdpdGhMb2NrcyhlbGVtZW50LCAoKSA9PiBlbGVtZW50LmFjdHVhbC5yZWRvKCksIGVkaXRTdGFja1NuYXBzaG90LCBjbGVhbnVwLCAoKSA9PiB0aGlzLl9jb250aW51ZVJlZG9Jbkdyb3VwKGVsZW1lbnQuZ3JvdXBJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb3VyY2VSZWRvKGVkaXRTdGFjazogUmVzb3VyY2VFZGl0U3RhY2ssIGVsZW1lbnQ6IFJlc291cmNlU3RhY2tFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmICghZWxlbWVudC5pc1ZhbGlkKSB7XG5cdFx0XHQvLyBpbnZhbGlkIGVsZW1lbnQgPT4gaW1tZWRpYXRlbHkgZmx1c2ggZWRpdCBzdGFjayFcblx0XHRcdGVkaXRTdGFjay5mbHVzaEFsbEVsZW1lbnRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlZGl0U3RhY2subG9ja2VkKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHR7IGtleTogJ2Nhbm5vdFJlc291cmNlUmVkb0R1ZVRvSW5Qcm9ncmVzc1VuZG9SZWRvJywgY29tbWVudDogWyd7MH0gaXMgYSBsYWJlbCBmb3IgYW4gb3BlcmF0aW9uLiddIH0sXG5cdFx0XHRcdFwiQ291bGQgbm90IHJlZG8gJ3swfScgYmVjYXVzZSB0aGVyZSBpcyBhbHJlYWR5IGFuIHVuZG8gb3IgcmVkbyBvcGVyYXRpb24gcnVubmluZy5cIiwgZWxlbWVudC5sYWJlbFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihtZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5faW52b2tlUmVzb3VyY2VQcmVwYXJlKGVsZW1lbnQsIChjbGVhbnVwKSA9PiB7XG5cdFx0XHRlZGl0U3RhY2subW92ZUZvcndhcmQoZWxlbWVudCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2FmZUludm9rZVdpdGhMb2NrcyhlbGVtZW50LCAoKSA9PiBlbGVtZW50LmFjdHVhbC5yZWRvKCksIG5ldyBFZGl0U3RhY2tTbmFwc2hvdChbZWRpdFN0YWNrXSksIGNsZWFudXAsICgpID0+IHRoaXMuX2NvbnRpbnVlUmVkb0luR3JvdXAoZWxlbWVudC5ncm91cElkKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQ2xvc2VzdFJlZG9FbGVtZW50SW5Hcm91cChncm91cElkOiBudW1iZXIpOiBbU3RhY2tFbGVtZW50IHwgbnVsbCwgc3RyaW5nIHwgbnVsbF0ge1xuXHRcdGlmICghZ3JvdXBJZCkge1xuXHRcdFx0cmV0dXJuIFtudWxsLCBudWxsXTtcblx0XHR9XG5cblx0XHQvLyBmaW5kIGFub3RoZXIgZWxlbWVudCB3aXRoIHRoZSBzYW1lIGdyb3VwSWQgYW5kIHdpdGggdGhlIGxvd2VzdCBncm91cE9yZGVyIHJlYWR5IHRvIGJlIHJlZG9uZVxuXHRcdGxldCBtYXRjaGVkRWxlbWVudDogU3RhY2tFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG1hdGNoZWRTdHJSZXNvdXJjZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGNvbnN0IFtzdHJSZXNvdXJjZSwgZWRpdFN0YWNrXSBvZiB0aGlzLl9lZGl0U3RhY2tzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdEZ1dHVyZUVsZW1lbnQoKTtcblx0XHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNhbmRpZGF0ZS5ncm91cElkID09PSBncm91cElkKSB7XG5cdFx0XHRcdGlmICghbWF0Y2hlZEVsZW1lbnQgfHwgY2FuZGlkYXRlLmdyb3VwT3JkZXIgPCBtYXRjaGVkRWxlbWVudC5ncm91cE9yZGVyKSB7XG5cdFx0XHRcdFx0bWF0Y2hlZEVsZW1lbnQgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdFx0bWF0Y2hlZFN0clJlc291cmNlID0gc3RyUmVzb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gW21hdGNoZWRFbGVtZW50LCBtYXRjaGVkU3RyUmVzb3VyY2VdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29udGludWVSZWRvSW5Hcm91cChncm91cElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0aWYgKCFncm91cElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywgbWF0Y2hlZFN0clJlc291cmNlXSA9IHRoaXMuX2ZpbmRDbG9zZXN0UmVkb0VsZW1lbnRJbkdyb3VwKGdyb3VwSWQpO1xuXHRcdGlmIChtYXRjaGVkU3RyUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZWRvKG1hdGNoZWRTdHJSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlZG8ocmVzb3VyY2VPclNvdXJjZTogVVJJIHwgVW5kb1JlZG9Tb3VyY2UgfCBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0aWYgKHJlc291cmNlT3JTb3VyY2UgaW5zdGFuY2VvZiBVbmRvUmVkb1NvdXJjZSkge1xuXHRcdFx0Y29uc3QgWywgbWF0Y2hlZFN0clJlc291cmNlXSA9IHRoaXMuX2ZpbmRDbG9zZXN0UmVkb0VsZW1lbnRXaXRoU291cmNlKHJlc291cmNlT3JTb3VyY2UuaWQpO1xuXHRcdFx0cmV0dXJuIG1hdGNoZWRTdHJSZXNvdXJjZSA/IHRoaXMuX3JlZG8obWF0Y2hlZFN0clJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiByZXNvdXJjZU9yU291cmNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZG8ocmVzb3VyY2VPclNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZWRvKHRoaXMuZ2V0VXJpQ29tcGFyaXNvbktleShyZXNvdXJjZU9yU291cmNlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWRvKHN0clJlc291cmNlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0U3RhY2tzLmhhcyhzdHJSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0U3RhY2sgPSB0aGlzLl9lZGl0U3RhY2tzLmdldChzdHJSZXNvdXJjZSkhO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlZGl0U3RhY2suZ2V0Q2xvc2VzdEZ1dHVyZUVsZW1lbnQoKTtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5ncm91cElkKSB7XG5cdFx0XHQvLyB0aGlzIGVsZW1lbnQgaXMgYSBwYXJ0IG9mIGEgZ3JvdXAsIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHJlZG9pbmcgaW4gYSBncm91cCBpcyBpbiBvcmRlclxuXHRcdFx0Y29uc3QgW21hdGNoZWRFbGVtZW50LCBtYXRjaGVkU3RyUmVzb3VyY2VdID0gdGhpcy5fZmluZENsb3Nlc3RSZWRvRWxlbWVudEluR3JvdXAoZWxlbWVudC5ncm91cElkKTtcblx0XHRcdGlmIChlbGVtZW50ICE9PSBtYXRjaGVkRWxlbWVudCAmJiBtYXRjaGVkU3RyUmVzb3VyY2UpIHtcblx0XHRcdFx0Ly8gdGhlcmUgaXMgYW4gZWxlbWVudCBpbiB0aGUgc2FtZSBncm91cCB0aGF0IHNob3VsZCBiZSByZWRvbmUgYmVmb3JlIHRoaXMgb25lXG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWRvKG1hdGNoZWRTdHJSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VSZWRvKHN0clJlc291cmNlLCBlbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVJlZG8oZWRpdFN0YWNrLCBlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKERFQlVHKSB7XG5cdFx0XHRcdHRoaXMuX3ByaW50KCdyZWRvJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFdvcmtzcGFjZVZlcmlmaWNhdGlvbkVycm9yIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHJldHVyblZhbHVlOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCkgeyB9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElVbmRvUmVkb1NlcnZpY2UsIFVuZG9SZWRvU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsZUFBZTtBQUN4QixPQUFPLGNBQWM7QUFFckIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUEwRSxrQkFBNkMsMkJBQTJCLHFCQUFxQixlQUFlLHNCQUFnRDtBQUV0TyxNQUFNLFFBQVE7QUFFZCxTQUFTLGlCQUFpQixVQUF1QjtBQUNoRCxTQUFPLFNBQVMsV0FBVyxRQUFRLE9BQU8sU0FBUyxTQUFTLFNBQVM7QUFDdEU7QUFFQSxJQUFJLHNCQUFzQjtBQUUxQixNQUFNLHFCQUFxQjtBQUFBLEVBaUIxQixZQUFZLFFBQTBCLGVBQXVCLGFBQXFCLFNBQWlCLFlBQW9CLFVBQWtCLGFBQXFCO0FBaEI5SixTQUFnQixLQUFNLEVBQUU7QUFDeEIsU0FBZ0IsT0FBTyxvQkFBb0I7QUFnQjFDLFNBQUssU0FBUztBQUNkLFNBQUssUUFBUSxPQUFPO0FBQ3BCLFNBQUssb0JBQW9CLE9BQU8scUJBQXFCO0FBQ3JELFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssY0FBYztBQUNuQixTQUFLLGlCQUFpQixDQUFDLEtBQUssYUFBYTtBQUN6QyxTQUFLLGVBQWUsQ0FBQyxLQUFLLFdBQVc7QUFDckMsU0FBSyxVQUFVO0FBQ2YsU0FBSyxhQUFhO0FBQ2xCLFNBQUssV0FBVztBQUNoQixTQUFLLGNBQWM7QUFDbkIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVPLFNBQVMsU0FB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QUFZO0FBQ3hFLDJCQUFpQjtBQUNqQiwrQkFBcUI7QUFBQSxRQUN0QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxDQUFDLGdCQUFnQixrQkFBa0I7QUFBQSxFQUMzQztBQUFBLEVBRVEscUJBQXFCLFNBQXVDO0FBQ25FLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxDQUFDLEVBQUUsa0JBQWtCLElBQUksS0FBSywrQkFBK0IsT0FBTztBQUMxRSxRQUFJLG9CQUFvQjtBQUN2QixhQUFPLEtBQUssTUFBTSxrQkFBa0I7QUFBQSxJQUNyQztBQUFBLEVBQ0Q7QUFBQSxFQUVPLEtBQUssa0JBQXVFO0FBQ2xGLFFBQUksNEJBQTRCLGdCQUFnQjtBQUMvQyxZQUFNLENBQUMsRUFBRSxrQkFBa0IsSUFBSSxLQUFLLGtDQUFrQyxpQkFBaUIsRUFBRTtBQUN6RixhQUFPLHFCQUFxQixLQUFLLE1BQU0sa0JBQWtCLElBQUk7QUFBQSxJQUM5RDtBQUNBLFFBQUksT0FBTyxxQkFBcUIsVUFBVTtBQUN6QyxhQUFPLEtBQUssTUFBTSxnQkFBZ0I7QUFBQSxJQUNuQztBQUNBLFdBQU8sS0FBSyxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixDQUFDO0FBQUEsRUFDN0Q7QUFBQSxFQUVRLE1BQU0sYUFBMkM7QUFDeEQsUUFBSSxDQUFDLEtBQUssWUFBWSxJQUFJLFdBQVcsR0FBRztBQUN2QztBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksS0FBSyxZQUFZLElBQUksV0FBVztBQUNsRCxVQUFNLFVBQVUsVUFBVSx3QkFBd0I7QUFDbEQsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFFBQVEsU0FBUztBQUVwQixZQUFNLENBQUMsZ0JBQWdCLGtCQUFrQixJQUFJLEtBQUssK0JBQStCLFFBQVEsT0FBTztBQUNoRyxVQUFJLFlBQVksa0JBQWtCLG9CQUFvQjtBQUVyRCxlQUFPLEtBQUssTUFBTSxrQkFBa0I7QUFBQSxNQUNyQztBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsVUFBSSxRQUFRLFNBQVMsb0JBQW9CLFdBQVc7QUFDbkQsZUFBTyxLQUFLLGVBQWUsYUFBYSxPQUFPO0FBQUEsTUFDaEQsT0FBTztBQUNOLGVBQU8sS0FBSyxjQUFjLFdBQVcsT0FBTztBQUFBLE1BQzdDO0FBQUEsSUFDRCxVQUFFO0FBQ0QsVUFBSSxPQUFPO0FBQ1YsYUFBSyxPQUFPLE1BQU07QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUF2NkJhLGtCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxHQVJVO0FBeTZCYixNQUFNLDJCQUEyQjtBQUFBLEVBQ2hDLFlBQTRCLGFBQW1DO0FBQW5DO0FBQUEsRUFBcUM7QUFDbEU7QUFFQSxrQkFBa0Isa0JBQWtCLGlCQUFpQixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFsiUmVtb3ZlZFJlc291cmNlUmVhc29uIiwgInN0clJlc291cmNlIiwgIlVuZG9DaG9pY2UiXQp9Cg==
