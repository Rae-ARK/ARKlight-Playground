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
import { arrayEqualsC, structuralEquals } from "../../../../../base/common/equals.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { constObservable, derived, derivedObservableWithCache, derivedOpts, mapObservableArrayCached, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { format } from "../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { ChangesetOperationTargetKind } from "../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js";
import { ChangesetOperationScope, ChangesetOperationStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildDefaultChatUri, ChangesetStatus, StateComponents } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { SessionChangesetOperationScope, SessionChangesetOperationStatus, sessionFileChangesEqual } from "../../../../services/sessions/common/session.js";
import { changesetFileToChange } from "./agentHostDiffs.js";
var ChangesetKind = /* @__PURE__ */ ((ChangesetKind2) => {
  ChangesetKind2["Branch"] = "branch";
  ChangesetKind2["Uncommitted"] = "uncommitted";
  ChangesetKind2["Session"] = "session";
  ChangesetKind2["Turn"] = "turn";
  ChangesetKind2["Compare"] = "compare-turns";
  return ChangesetKind2;
})(ChangesetKind || {});
function createChangesets(sessionUri, options, isActiveSessionObs, changesets) {
  if (!changesets) {
    return [];
  }
  const sessionChangesets = [];
  const defaultChangeset = changesets.find((c) => c.changeKind === "branch" /* Branch */) ?? changesets[0];
  for (const changeset of changesets) {
    const isDefault = changeset === defaultChangeset;
    if (changeset.changeKind === "branch" /* Branch */ || changeset.changeKind === "uncommitted" /* Uncommitted */ || changeset.changeKind === "session" /* Session */) {
      sessionChangesets.push(options.instantiationService.createInstance(AgentHostChangeset, options, isActiveSessionObs, {
        ...changeset,
        isDefault
      }));
    } else if (changeset.changeKind === "turn" /* Turn */) {
      sessionChangesets.push(options.instantiationService.createInstance(AgentHostLastTurnChangeset, sessionUri, options, isActiveSessionObs, {
        ...changeset,
        isDefault
      }));
    }
  }
  return sessionChangesets;
}
function createActiveSessionSubscriptionObs(options, isActiveSessionObs, component, resourceObs) {
  return derived((reader) => {
    const connection = options.getConnection();
    if (!connection) {
      return constObservable(null);
    }
    const resource = resourceObs.read(reader);
    if (!resource) {
      return constObservable(null);
    }
    const isActiveSession = isActiveSessionObs.read(reader);
    if (!isActiveSession) {
      return constObservable(null);
    }
    const subscriptionRef = connection.getSubscription(component, resource, "AgentHostSessionChangesets");
    reader.store.add(subscriptionRef);
    return observableFromEvent(
      subscriptionRef.object.onDidChange,
      () => subscriptionRef.object.value
    );
  });
}
function selectMostRecentChatUri(sessionState, sessionUri) {
  if (!sessionState || sessionState instanceof Error) {
    return URI.parse(buildDefaultChatUri(sessionUri));
  }
  const mostRecentChat = sessionState.chats.reduce(
    (best, c) => !best || c.modifiedAt > best.modifiedAt ? c : best,
    void 0
  );
  return URI.parse(mostRecentChat?.resource ?? sessionState.defaultChat ?? buildDefaultChatUri(sessionUri));
}
function toSessionChangesetOperationScope(scope) {
  switch (scope) {
    case ChangesetOperationScope.Changeset:
      return SessionChangesetOperationScope.Changeset;
    case ChangesetOperationScope.Resource:
      return SessionChangesetOperationScope.Resource;
    case ChangesetOperationScope.Range:
      return SessionChangesetOperationScope.Range;
    default:
      throw new Error(`Unknown ChangesetOperationScope: ${scope}`);
  }
}
function toSessionChangesetOperationStatus(status) {
  switch (status) {
    case ChangesetOperationStatus.Idle:
      return SessionChangesetOperationStatus.Idle;
    case ChangesetOperationStatus.Running:
      return SessionChangesetOperationStatus.Running;
    case ChangesetOperationStatus.Error:
      return SessionChangesetOperationStatus.Error;
    case ChangesetOperationStatus.Disabled:
      return SessionChangesetOperationStatus.Disabled;
    default:
      throw new Error(`Unknown ChangesetOperationStatus: ${status}`);
  }
}
function toSessionChangesetOperation(operation) {
  return {
    id: operation.id,
    label: operation.label,
    description: operation.description,
    icon: operation.icon ? ThemeIcon.fromId(operation.icon) : void 0,
    group: operation.group,
    confirmation: operation.confirmation ? typeof operation.confirmation === "string" ? operation.confirmation : new MarkdownString(operation.confirmation.markdown, {
      isTrusted: false,
      supportThemeIcons: true
    }) : void 0,
    scopes: operation.scopes.map(toSessionChangesetOperationScope),
    status: toSessionChangesetOperationStatus(operation.status)
  };
}
class AbstractAgentHostChangeset {
  constructor(changeset, _options, _dialogService) {
    this._options = _options;
    this._dialogService = _dialogService;
    this.originalCheckpointRef = observableValue(this, void 0);
    this.modifiedCheckpointRef = observableValue(this, void 0);
    this.capabilities = {
      review: changeset.capabilities?.review !== void 0
    };
    this.isLoadingChanges = derived((reader) => {
      const changesetState = this.changesetStateObs.read(reader).read(reader);
      if (changesetState === void 0) {
        return true;
      }
      if (changesetState === null || changesetState instanceof Error) {
        return false;
      }
      return changesetState.status === ChangesetStatus.Computing;
    });
    const mapDiffUri = this._options.mapDiffUri;
    this._changesetFilesObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const changesetState = this.changesetStateObs.read(reader).read(reader);
      if (changesetState === null || changesetState instanceof Error) {
        return [];
      }
      if (changesetState === void 0) {
        return lastValue;
      }
      if (changesetState.status !== ChangesetStatus.Ready && lastValue !== void 0) {
        return lastValue;
      }
      return changesetState.files;
    });
    const mappedChangesObs = mapObservableArrayCached(
      this,
      this._changesetFilesObs.map((files) => files ?? []),
      (file) => changesetFileToChange(file, mapDiffUri)
    );
    const changesObs = derived(this, (reader) => {
      return mappedChangesObs.read(reader).filter(isDefined);
    });
    this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, (reader) => {
      return changesObs.read(reader) ?? [];
    });
    const operationsObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const changesetState = this.changesetStateObs.read(reader).read(reader);
      if (changesetState === null || changesetState instanceof Error) {
        return [];
      }
      if (changesetState === void 0) {
        return lastValue ?? [];
      }
      return changesetState.operations?.map(toSessionChangesetOperation) ?? [];
    });
    this.operations = derivedOpts({ equalsFn: arrayEqualsC(structuralEquals) }, (reader) => {
      return operationsObs.read(reader) ?? [];
    });
  }
  async invokeOperation(operationId, target) {
    const connection = this._options.getConnection();
    if (!connection) {
      return;
    }
    const channel = this.channelUriObs.get();
    if (!channel) {
      return;
    }
    const operation = this.operations.get().find((o) => o.id === operationId);
    if (operation?.confirmation) {
      const message = typeof operation.confirmation === "string" ? operation.confirmation : operation.confirmation.value;
      const { confirmed } = await this._dialogService.confirm({
        type: "warning",
        message: target?.kind === "resource" ? format(message, basename(target.resource)) : message,
        primaryButton: operation.label
      });
      if (!confirmed) {
        return;
      }
    }
    await connection.invokeChangesetOperation({
      operationId,
      channel: channel.toString(),
      target: target?.kind === "resource" ? {
        kind: ChangesetOperationTargetKind.Resource,
        resource: target.resource.toString()
      } : void 0
    });
  }
  setReviewState(resources, reviewed) {
    if (!this.capabilities.review) {
      return;
    }
    const connection = this._options.getConnection();
    const channel = this.channelUriObs.get();
    if (!connection || !channel) {
      return;
    }
    const files = resources.map((resource) => {
      const file = this._changesetFilesObs.get()?.find((candidate) => {
        const change = changesetFileToChange(candidate, this._options.mapDiffUri);
        return isEqual(change?.modifiedUri, resource) || isEqual(change?.originalUri, resource);
      });
      if (!file) {
        throw new Error(`Resource '${resource.toString()}' is not part of changeset '${this.id}'`);
      }
      return file.id;
    });
    if (files.length === 0) {
      return;
    }
    connection.dispatch(channel.toString(), {
      type: ActionType.ChangesetFilesReviewChanged,
      files,
      reviewed
    });
  }
}
let AgentHostChangeset = class extends AbstractAgentHostChangeset {
  constructor(options, isActiveSessionObs, changesetSummary, dialogService) {
    super(changesetSummary, options, dialogService);
    this.isEnabled = constObservable(true);
    this.channelUriObs = constObservable(URI.parse(changesetSummary.uriTemplate));
    this.changesetStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Changeset,
      this.channelUriObs
    );
    this.id = changesetSummary.changeKind;
    this._label = changesetSummary.label;
    this._description = changesetSummary.description;
    this.isDefault = constObservable(changesetSummary.isDefault);
  }
  get label() {
    return this._label;
  }
  get description() {
    return this._description;
  }
};
AgentHostChangeset = __decorateClass([
  __decorateParam(3, IDialogService)
], AgentHostChangeset);
let AgentHostLastTurnChangeset = class extends AbstractAgentHostChangeset {
  constructor(sessionUri, options, isActiveSessionObs, changesetSummary, dialogService) {
    super(changesetSummary, options, dialogService);
    this.label = localize("lastTurnChanges", "Last Turn Changes");
    this.description = localize("lastTurnChangesDescription", "Show only changes made in the last turn");
    this.isDefault = observableValue(this, false);
    this.id = changesetSummary.changeKind;
    const sessionStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Session,
      constObservable(sessionUri)
    );
    const mostRecentChatUriObs = derivedOpts({ equalsFn: isEqual }, (reader) => {
      const sessionState = sessionStateObs.read(reader).read(reader);
      return selectMostRecentChatUri(sessionState, sessionUri);
    });
    const chatStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Chat,
      mostRecentChatUriObs
    );
    const lastTurnIdObs = derived((reader) => {
      const chatState = chatStateObs.read(reader).read(reader);
      if (!chatState || chatState instanceof Error) {
        return void 0;
      }
      return chatState.activeTurn?.id ?? chatState.turns?.at(-1)?.id;
    });
    this.channelUriObs = derivedOpts({ equalsFn: isEqual }, (reader) => {
      const lastTurnId = lastTurnIdObs.read(reader);
      if (!lastTurnId) {
        return void 0;
      }
      const uri = changesetSummary.uriTemplate.replace("{turnId}", lastTurnId);
      return uri ? URI.parse(uri) : void 0;
    });
    this.changesetStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Changeset,
      this.channelUriObs
    );
    this.isEnabled = derived((reader) => this.channelUriObs.read(reader) !== void 0);
  }
};
AgentHostLastTurnChangeset = __decorateClass([
  __decorateParam(4, IDialogService)
], AgentHostLastTurnChangeset);
export {
  createActiveSessionSubscriptionObs,
  createChangesets,
  selectMostRecentChatUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL2FnZW50SG9zdFNlc3Npb25DaGFuZ2VzZXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXJyYXlFcXVhbHNDLCBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENoYW5nZXNldE9wZXJhdGlvblRhcmdldEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYW5nZXNldC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRPcGVyYXRpb24sIENoYW5nZXNldE9wZXJhdGlvblNjb3BlLCB0eXBlIENoYW5nZXNldEZpbGUsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgQ2hhbmdlc2V0U3RhdHVzLCBDaGFuZ2VzZXQsIFN0YXRlQ29tcG9uZW50cywgdHlwZSBDaGFuZ2VzZXRTdGF0ZSwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgQ2hhdFN1bW1hcnksIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc2V0LCBJU2Vzc2lvbkNoYW5nZXNldENhcGFiaWxpdGllcywgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb24sIElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uVGFyZ2V0LCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TY29wZSwgU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cywgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBjaGFuZ2VzZXRGaWxlVG9DaGFuZ2UgfSBmcm9tICcuL2FnZW50SG9zdERpZmZzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyB9IGZyb20gJy4vYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuXG5jb25zdCBlbnVtIENoYW5nZXNldEtpbmQge1xuXHRCcmFuY2ggPSAnYnJhbmNoJyxcblx0VW5jb21taXR0ZWQgPSAndW5jb21taXR0ZWQnLFxuXHRTZXNzaW9uID0gJ3Nlc3Npb24nLFxuXHRUdXJuID0gJ3R1cm4nLFxuXHRDb21wYXJlID0gJ2NvbXBhcmUtdHVybnMnLFxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ2hhbmdlc2V0cyhcblx0c2Vzc2lvblVyaTogVVJJLFxuXHRvcHRpb25zOiBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMsXG5cdGlzQWN0aXZlU2Vzc2lvbk9iczogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdGNoYW5nZXNldHM6IHJlYWRvbmx5IENoYW5nZXNldFtdIHwgdW5kZWZpbmVkXG4pOiByZWFkb25seSBJU2Vzc2lvbkNoYW5nZXNldFtdIHtcblx0aWYgKCFjaGFuZ2VzZXRzKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3Qgc2Vzc2lvbkNoYW5nZXNldHM6IElTZXNzaW9uQ2hhbmdlc2V0W10gPSBbXTtcblxuXHQvLyBTZWxlY3QgdGhlIFwiQnJhbmNoIENoYW5nZXNcIiBjaGFuZ2VzZXQgYXMgdGhlIGRlZmF1bHQsIGlmIGl0IGV4aXN0czsgb3RoZXJ3aXNlIGp1c3QgdGhlIGZpcnN0IG9uZS5cblx0Y29uc3QgZGVmYXVsdENoYW5nZXNldCA9IGNoYW5nZXNldHMuZmluZChjID0+IGMuY2hhbmdlS2luZCA9PT0gQ2hhbmdlc2V0S2luZC5CcmFuY2gpID8/IGNoYW5nZXNldHNbMF07XG5cblx0Zm9yIChjb25zdCBjaGFuZ2VzZXQgb2YgY2hhbmdlc2V0cykge1xuXHRcdGNvbnN0IGlzRGVmYXVsdCA9IGNoYW5nZXNldCA9PT0gZGVmYXVsdENoYW5nZXNldDtcblxuXHRcdGlmIChcblx0XHRcdGNoYW5nZXNldC5jaGFuZ2VLaW5kID09PSBDaGFuZ2VzZXRLaW5kLkJyYW5jaCB8fFxuXHRcdFx0Y2hhbmdlc2V0LmNoYW5nZUtpbmQgPT09IENoYW5nZXNldEtpbmQuVW5jb21taXR0ZWQgfHxcblx0XHRcdGNoYW5nZXNldC5jaGFuZ2VLaW5kID09PSBDaGFuZ2VzZXRLaW5kLlNlc3Npb25cblx0XHQpIHtcblx0XHRcdC8vIEJyYW5jaCBDaGFuZ2VzLCBVbmNvbW1pdHRlZCBDaGFuZ2VzLCBhbmQgU2Vzc2lvbiBDaGFuZ2VzXG5cdFx0XHRzZXNzaW9uQ2hhbmdlc2V0cy5wdXNoKG9wdGlvbnMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhbmdlc2V0LCBvcHRpb25zLCBpc0FjdGl2ZVNlc3Npb25PYnMsIHtcblx0XHRcdFx0Li4uY2hhbmdlc2V0LCBpc0RlZmF1bHRcblx0XHRcdH0pKTtcblx0XHR9IGVsc2UgaWYgKGNoYW5nZXNldC5jaGFuZ2VLaW5kID09PSBDaGFuZ2VzZXRLaW5kLlR1cm4pIHtcblx0XHRcdC8vIExhc3QgVHVybiBDaGFuZ2VzXG5cdFx0XHRzZXNzaW9uQ2hhbmdlc2V0cy5wdXNoKG9wdGlvbnMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0TGFzdFR1cm5DaGFuZ2VzZXQsIHNlc3Npb25VcmksIG9wdGlvbnMsIGlzQWN0aXZlU2Vzc2lvbk9icywge1xuXHRcdFx0XHQuLi5jaGFuZ2VzZXQsIGlzRGVmYXVsdFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBzZXNzaW9uQ2hhbmdlc2V0cztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFjdGl2ZVNlc3Npb25TdWJzY3JpcHRpb25PYnM8VD4oXG5cdG9wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0aXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0Y29tcG9uZW50OiBTdGF0ZUNvbXBvbmVudHMsXG5cdHJlc291cmNlT2JzOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+LFxuKTogSU9ic2VydmFibGU8SU9ic2VydmFibGU8VCB8IEVycm9yIHwgdW5kZWZpbmVkIHwgbnVsbD4+IHtcblx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gb3B0aW9ucy5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBY3RpdmVTZXNzaW9uID0gaXNBY3RpdmVTZXNzaW9uT2JzLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWlzQWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdWJzY3JpcHRpb25SZWYgPSBjb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihjb21wb25lbnQsIHJlc291cmNlLCAnQWdlbnRIb3N0U2Vzc2lvbkNoYW5nZXNldHMnKTtcblx0XHRyZWFkZXIuc3RvcmUuYWRkKHN1YnNjcmlwdGlvblJlZik7XG5cblx0XHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudChzdWJzY3JpcHRpb25SZWYub2JqZWN0Lm9uRGlkQ2hhbmdlLFxuXHRcdFx0KCkgPT4gc3Vic2NyaXB0aW9uUmVmLm9iamVjdC52YWx1ZSBhcyBUIHwgRXJyb3IgfCB1bmRlZmluZWQpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBTZWxlY3RzIHRoZSBVUkkgb2YgdGhlIHNlc3Npb24ncyBtb3N0IHJlY2VudGx5IG1vZGlmaWVkIGNoYXQgXHUyMDE0IHRoZSBvbmUgdGhhdFxuICogaG9sZHMgdGhlIHNlc3Npb24ncyBcImxhc3QgdHVyblwiLiBGYWxscyBiYWNrIHRvIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IChvclxuICogdGhlIHN5bnRoZXNpemVkIGRlZmF1bHQgY2hhdCBVUkkpIHdoZW4gdGhlIHN0YXRlIGlzIGFic2VudC9lcnJvcmVkIG9yIG5vIGNoYXRcbiAqIGlzIG1vcmUgcmVjZW50LlxuICpcbiAqIFNoYXJlZCBieSB7QGxpbmsgQWdlbnRIb3N0TGFzdFR1cm5DaGFuZ2VzZXR9IGFuZCB0aGUgb3V0cHV0LXN0cmVhbS1kZXJpdmVkXG4gKiBsYXN0LXR1cm4gY2hhbmdlcyBzbyB0aGUgXCJMYXN0IFR1cm4gQ2hhbmdlc1wiIGNoYW5nZXNldCBhbmQgdGhlIGNoYXQgaW5wdXRcbiAqIHN0YXR1cyBwaWxscyBhbHdheXMgcmVzb2x2ZSB0aGUgc2FtZSBjaGF0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VsZWN0TW9zdFJlY2VudENoYXRVcmkoc2Vzc2lvblN0YXRlOiBTZXNzaW9uU3RhdGUgfCBFcnJvciB8IHVuZGVmaW5lZCB8IG51bGwsIHNlc3Npb25Vcmk6IFVSSSk6IFVSSSB7XG5cdGlmICghc2Vzc2lvblN0YXRlIHx8IHNlc3Npb25TdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0cmV0dXJuIFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0fVxuXG5cdC8vIGBtb2RpZmllZEF0YCBpcyBJU08gODYwMSwgc28gbGV4aWNvZ3JhcGhpYyBjb21wYXJlIGlzIGNocm9ub2xvZ2ljYWwuXG5cdGNvbnN0IG1vc3RSZWNlbnRDaGF0ID0gc2Vzc2lvblN0YXRlLmNoYXRzLnJlZHVjZTxDaGF0U3VtbWFyeSB8IHVuZGVmaW5lZD4oXG5cdFx0KGJlc3QsIGMpID0+ICFiZXN0IHx8IGMubW9kaWZpZWRBdCA+IGJlc3QubW9kaWZpZWRBdCA/IGMgOiBiZXN0LFxuXHRcdHVuZGVmaW5lZFxuXHQpO1xuXHRyZXR1cm4gVVJJLnBhcnNlKG1vc3RSZWNlbnRDaGF0Py5yZXNvdXJjZSA/PyBzZXNzaW9uU3RhdGUuZGVmYXVsdENoYXQgPz8gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG59XG5cbmZ1bmN0aW9uIHRvU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlKHNjb3BlOiBDaGFuZ2VzZXRPcGVyYXRpb25TY29wZSk6IFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TY29wZSB7XG5cdHN3aXRjaCAoc2NvcGUpIHtcblx0XHRjYXNlIENoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldDogcmV0dXJuIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5DaGFuZ2VzZXQ7XG5cdFx0Y2FzZSBDaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5SZXNvdXJjZTogcmV0dXJuIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5SZXNvdXJjZTtcblx0XHRjYXNlIENoYW5nZXNldE9wZXJhdGlvblNjb3BlLlJhbmdlOiByZXR1cm4gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLlJhbmdlO1xuXHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgVW5rbm93biBDaGFuZ2VzZXRPcGVyYXRpb25TY29wZTogJHtzY29wZX1gKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1Nlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMoc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMpOiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzIHtcblx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRjYXNlIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlOiByZXR1cm4gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlO1xuXHRcdGNhc2UgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLlJ1bm5pbmc6IHJldHVybiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLlJ1bm5pbmc7XG5cdFx0Y2FzZSBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuRXJyb3I6IHJldHVybiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLkVycm9yO1xuXHRcdGNhc2UgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLkRpc2FibGVkOiByZXR1cm4gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5EaXNhYmxlZDtcblx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzOiAke3N0YXR1c31gKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1Nlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb24ob3BlcmF0aW9uOiBDaGFuZ2VzZXRPcGVyYXRpb24pOiBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IG9wZXJhdGlvbi5pZCxcblx0XHRsYWJlbDogb3BlcmF0aW9uLmxhYmVsLFxuXHRcdGRlc2NyaXB0aW9uOiBvcGVyYXRpb24uZGVzY3JpcHRpb24sXG5cdFx0aWNvbjogb3BlcmF0aW9uLmljb25cblx0XHRcdD8gVGhlbWVJY29uLmZyb21JZChvcGVyYXRpb24uaWNvbilcblx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdGdyb3VwOiBvcGVyYXRpb24uZ3JvdXAsXG5cdFx0Y29uZmlybWF0aW9uOiBvcGVyYXRpb24uY29uZmlybWF0aW9uXG5cdFx0XHQ/IHR5cGVvZiBvcGVyYXRpb24uY29uZmlybWF0aW9uID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IG9wZXJhdGlvbi5jb25maXJtYXRpb25cblx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcob3BlcmF0aW9uLmNvbmZpcm1hdGlvbi5tYXJrZG93biwge1xuXHRcdFx0XHRcdGlzVHJ1c3RlZDogZmFsc2UsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0XHRcdH0pXG5cdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRzY29wZXM6IG9wZXJhdGlvbi5zY29wZXMubWFwKHRvU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlKSxcblx0XHRzdGF0dXM6IHRvU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cyhvcGVyYXRpb24uc3RhdHVzKSxcblx0fTtcbn1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RBZ2VudEhvc3RDaGFuZ2VzZXQgaW1wbGVtZW50cyBJU2Vzc2lvbkNoYW5nZXNldCB7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgaXNFbmFibGVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0YWJzdHJhY3QgcmVhZG9ubHkgaXNEZWZhdWx0OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRyZWFkb25seSBvcmlnaW5hbENoZWNrcG9pbnRSZWYgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbW9kaWZpZWRDaGVja3BvaW50UmVmID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cmVhZG9ubHkgaXNMb2FkaW5nQ2hhbmdlczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPjtcblx0cmVhZG9ubHkgb3BlcmF0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25bXT47XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBJU2Vzc2lvbkNoYW5nZXNldENhcGFiaWxpdGllcztcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmVhZG9ubHkgY2hhbm5lbFVyaU9iczogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlYWRvbmx5IGNoYW5nZXNldFN0YXRlT2JzOiBJT2JzZXJ2YWJsZTxJT2JzZXJ2YWJsZTxDaGFuZ2VzZXRTdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkIHwgbnVsbD4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRGaWxlc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgQ2hhbmdlc2V0RmlsZVtdIHwgdW5kZWZpbmVkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjaGFuZ2VzZXQ6IENoYW5nZXNldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuY2FwYWJpbGl0aWVzID0ge1xuXHRcdFx0cmV2aWV3OiBjaGFuZ2VzZXQuY2FwYWJpbGl0aWVzPy5yZXZpZXcgIT09IHVuZGVmaW5lZFxuXHRcdH0gc2F0aXNmaWVzIElTZXNzaW9uQ2hhbmdlc2V0Q2FwYWJpbGl0aWVzO1xuXG5cdFx0dGhpcy5pc0xvYWRpbmdDaGFuZ2VzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0U3RhdGUgPSB0aGlzLmNoYW5nZXNldFN0YXRlT2JzLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIElmIHRoZSBjaGFuZ2VzZXQgc3RhdGUgaXMgYHVuZGVmaW5lZGAsIGl0IG1lYW5zIHRoYXQgdGhlIGZpcnN0IHNuYXBzaG90XG5cdFx0XHQvLyBoYXMgbm90IHlldCBhcnJpdmVkLCBzbyBpbiBvcmRlciB0byBhdm9pZCBhbnkgZmxpY2tlcmluZyBpbiB0aGUgQ2hhbmdlc1xuXHRcdFx0Ly8gdmlldywgd2UgY29uc2lkZXIgdGhpcyB0ZW1wb3Jhcnkgc3RhdGUgYXMgaWYgdGhlIGNoYW5nZXMgYXJlIHN0aWxsIGJlaW5nXG5cdFx0XHQvLyBjb21wdXRlZC5cblx0XHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhbmdlc2V0U3RhdGUgPT09IG51bGwgfHwgY2hhbmdlc2V0U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBzdGF0aWMgY2hhbmdlc2V0cywgdGhhdCBhcmUgcGVyc2lzdGVkIHRvIHRoZSBkYXRhYmFzZSwgdGhlXG5cdFx0XHQvLyBjYWNoZWQgc3RhdGUgd2lsbCBiZSBzZW50IG92ZXIgdGhlIHdpcmUgd2hpbGUgdGhlIGNoYW5nZXNldCBpc1xuXHRcdFx0Ly8gYmVpbmcgY29tcHV0ZWQuXG5cdFx0XHRyZXR1cm4gY2hhbmdlc2V0U3RhdGUuc3RhdHVzID09PSBDaGFuZ2VzZXRTdGF0dXMuQ29tcHV0aW5nO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWFwRGlmZlVyaSA9IHRoaXMuX29wdGlvbnMubWFwRGlmZlVyaTtcblxuXHRcdC8vIEhvbGQgdGhlIHJhdyBgQ2hhbmdlc2V0RmlsZVtdYCAod2l0aCBsYXN0LXZhbHVlIHNlbWFudGljcykgc28gdW5jaGFuZ2VkXG5cdFx0Ly8gZmlsZXMga2VlcCB0aGVpciByZWZlcmVuY2UgYWNyb3NzIHJlZHVjZXIgdXBkYXRlcywgZW5hYmxpbmcgdGhlXG5cdFx0Ly8gcGVyLWZpbGUgY2FjaGUgYmVsb3cgdG8gc2tpcCByZWJ1aWxkaW5nIHRoZW0uXG5cdFx0dGhpcy5fY2hhbmdlc2V0RmlsZXNPYnMgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxyZWFkb25seSBDaGFuZ2VzZXRGaWxlW10gfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0U3RhdGUgPSB0aGlzLmNoYW5nZXNldFN0YXRlT2JzLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoY2hhbmdlc2V0U3RhdGUgPT09IG51bGwgfHwgY2hhbmdlc2V0U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbmRlciBgc3RhdGUuZmlsZXNgIHdoZW4gdGhlIGNoYW5nZXNldCBpcyBgUmVhZHlgLCBvciBvbiB0aGUgdmVyeVxuXHRcdFx0Ly8gZmlyc3QgYXJyaXZhbCAodGhlIGluaXRpYWwgc25hcHNob3QgY29udGFpbnMgdGhlIGZpbGUgbGlzdCBwZXJzaXN0ZWRcblx0XHRcdC8vIGZyb20gdGhlIHByZXZpb3VzIHNlc3Npb24pLlxuXHRcdFx0aWYgKGNoYW5nZXNldFN0YXRlLnN0YXR1cyAhPT0gQ2hhbmdlc2V0U3RhdHVzLlJlYWR5ICYmIGxhc3RWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGFuZ2VzZXRTdGF0ZS5maWxlcztcblx0XHR9KTtcblxuXHRcdC8vIEJ1aWxkIG9uZSBjaGFuZ2UgcGVyIGZpbGUsIHJldXNpbmcgdGhlIGNhY2hlZCByZXN1bHQgZm9yIGZpbGVzIHdob3NlXG5cdFx0Ly8gYENoYW5nZXNldEZpbGVgIHJlZmVyZW5jZSBpcyB1bmNoYW5nZWQgc28gb25seSBjaGFuZ2VkIGZpbGVzIGFyZVxuXHRcdC8vIHJlLXBhcnNlZCBhbmQgcmUtbWFwcGVkLlxuXHRcdGNvbnN0IG1hcHBlZENoYW5nZXNPYnMgPSBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQodGhpcyxcblx0XHRcdHRoaXMuX2NoYW5nZXNldEZpbGVzT2JzLm1hcChmaWxlcyA9PiBmaWxlcyA/PyBbXSksXG5cdFx0XHRmaWxlID0+IGNoYW5nZXNldEZpbGVUb0NoYW5nZShmaWxlLCBtYXBEaWZmVXJpKSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzT2JzID0gZGVyaXZlZDxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXSB8IHVuZGVmaW5lZD4odGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiBtYXBwZWRDaGFuZ2VzT2JzLnJlYWQocmVhZGVyKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuY2hhbmdlcyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gY2hhbmdlc09icy5yZWFkKHJlYWRlcikgPz8gW107XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25zT2JzID0gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25bXT4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRTdGF0ZSA9IHRoaXMuY2hhbmdlc2V0U3RhdGVPYnMucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSA9PT0gbnVsbCB8fCBjaGFuZ2VzZXRTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYW5nZXNldFN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZSA/PyBbXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNoYW5nZXNldFN0YXRlLm9wZXJhdGlvbnM/Lm1hcCh0b1Nlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb24pID8/IFtdO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5vcGVyYXRpb25zID0gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogYXJyYXlFcXVhbHNDKHN0cnVjdHVyYWxFcXVhbHMpIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gb3BlcmF0aW9uc09icy5yZWFkKHJlYWRlcikgPz8gW107XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBpbnZva2VPcGVyYXRpb24ob3BlcmF0aW9uSWQ6IHN0cmluZywgdGFyZ2V0PzogSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25UYXJnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fb3B0aW9ucy5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuY2hhbm5lbFVyaU9icy5nZXQoKTtcblx0XHRpZiAoIWNoYW5uZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLm9wZXJhdGlvbnMuZ2V0KCkuZmluZChvID0+IG8uaWQgPT09IG9wZXJhdGlvbklkKTtcblx0XHRpZiAob3BlcmF0aW9uPy5jb25maXJtYXRpb24pIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0eXBlb2Ygb3BlcmF0aW9uLmNvbmZpcm1hdGlvbiA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyBvcGVyYXRpb24uY29uZmlybWF0aW9uXG5cdFx0XHRcdDogb3BlcmF0aW9uLmNvbmZpcm1hdGlvbi52YWx1ZTtcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdG1lc3NhZ2U6IHRhcmdldD8ua2luZCA9PT0gJ3Jlc291cmNlJ1xuXHRcdFx0XHRcdD8gZm9ybWF0KG1lc3NhZ2UsIGJhc2VuYW1lKHRhcmdldC5yZXNvdXJjZSkpXG5cdFx0XHRcdFx0OiBtZXNzYWdlLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBvcGVyYXRpb24ubGFiZWwsXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBjb25uZWN0aW9uLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbih7XG5cdFx0XHRvcGVyYXRpb25JZCxcblx0XHRcdGNoYW5uZWw6IGNoYW5uZWwudG9TdHJpbmcoKSxcblx0XHRcdHRhcmdldDogdGFyZ2V0Py5raW5kID09PSAncmVzb3VyY2UnXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdGtpbmQ6IENoYW5nZXNldE9wZXJhdGlvblRhcmdldEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRhcmdldC5yZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRzZXRSZXZpZXdTdGF0ZShyZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdLCByZXZpZXdlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jYXBhYmlsaXRpZXMucmV2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX29wdGlvbnMuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmNoYW5uZWxVcmlPYnMuZ2V0KCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uIHx8ICFjaGFubmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZXMgPSByZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHtcblx0XHRcdGNvbnN0IGZpbGUgPSB0aGlzLl9jaGFuZ2VzZXRGaWxlc09icy5nZXQoKT8uZmluZChjYW5kaWRhdGUgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBjaGFuZ2VzZXRGaWxlVG9DaGFuZ2UoY2FuZGlkYXRlLCB0aGlzLl9vcHRpb25zLm1hcERpZmZVcmkpO1xuXHRcdFx0XHRyZXR1cm4gaXNFcXVhbChjaGFuZ2U/Lm1vZGlmaWVkVXJpLCByZXNvdXJjZSkgfHwgaXNFcXVhbChjaGFuZ2U/Lm9yaWdpbmFsVXJpLCByZXNvdXJjZSk7XG5cdFx0XHR9KTtcblx0XHRcdGlmICghZmlsZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlc291cmNlICcke3Jlc291cmNlLnRvU3RyaW5nKCl9JyBpcyBub3QgcGFydCBvZiBjaGFuZ2VzZXQgJyR7dGhpcy5pZH0nYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmlsZS5pZDtcblx0XHR9KTtcblxuXHRcdGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKGNoYW5uZWwudG9TdHJpbmcoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlc1Jldmlld0NoYW5nZWQsXG5cdFx0XHRmaWxlcyxcblx0XHRcdHJldmlld2VkLFxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEFnZW50SG9zdENoYW5nZXNldCBleHRlbmRzIEFic3RyYWN0QWdlbnRIb3N0Q2hhbmdlc2V0IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHRwcml2YXRlIF9sYWJlbDogc3RyaW5nO1xuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2xhYmVsOyB9XG5cblx0cHJpdmF0ZSBfZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZGVzY3JpcHRpb247IH1cblxuXHRyZWFkb25seSBpc0VuYWJsZWQgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdHJlYWRvbmx5IGlzRGVmYXVsdDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5uZWxVcmlPYnM6IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD47XG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBjaGFuZ2VzZXRTdGF0ZU9iczogSU9ic2VydmFibGU8SU9ic2VydmFibGU8Q2hhbmdlc2V0U3RhdGUgfCBFcnJvciB8IHVuZGVmaW5lZCB8IG51bGw+PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMsXG5cdFx0aXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRjaGFuZ2VzZXRTdW1tYXJ5OiBDaGFuZ2VzZXQgJiB7IGlzRGVmYXVsdDogYm9vbGVhbiB9LFxuXHRcdEBJRGlhbG9nU2VydmljZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY2hhbmdlc2V0U3VtbWFyeSwgb3B0aW9ucywgZGlhbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLmNoYW5uZWxVcmlPYnMgPSBjb25zdE9ic2VydmFibGUoVVJJLnBhcnNlKGNoYW5nZXNldFN1bW1hcnkudXJpVGVtcGxhdGUpKTtcblxuXHRcdHRoaXMuY2hhbmdlc2V0U3RhdGVPYnMgPSBjcmVhdGVBY3RpdmVTZXNzaW9uU3Vic2NyaXB0aW9uT2JzPENoYW5nZXNldFN0YXRlPihcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRpc0FjdGl2ZVNlc3Npb25PYnMsXG5cdFx0XHRTdGF0ZUNvbXBvbmVudHMuQ2hhbmdlc2V0LFxuXHRcdFx0dGhpcy5jaGFubmVsVXJpT2JzLFxuXHRcdCk7XG5cblx0XHR0aGlzLmlkID0gY2hhbmdlc2V0U3VtbWFyeS5jaGFuZ2VLaW5kO1xuXHRcdHRoaXMuX2xhYmVsID0gY2hhbmdlc2V0U3VtbWFyeS5sYWJlbDtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbiA9IGNoYW5nZXNldFN1bW1hcnkuZGVzY3JpcHRpb247XG5cblx0XHR0aGlzLmlzRGVmYXVsdCA9IGNvbnN0T2JzZXJ2YWJsZShjaGFuZ2VzZXRTdW1tYXJ5LmlzRGVmYXVsdCk7XG5cdH1cbn1cblxuY2xhc3MgQWdlbnRIb3N0TGFzdFR1cm5DaGFuZ2VzZXQgZXh0ZW5kcyBBYnN0cmFjdEFnZW50SG9zdENoYW5nZXNldCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ2xhc3RUdXJuQ2hhbmdlcycsIFwiTGFzdCBUdXJuIENoYW5nZXNcIik7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2xhc3RUdXJuQ2hhbmdlc0Rlc2NyaXB0aW9uJywgXCJTaG93IG9ubHkgY2hhbmdlcyBtYWRlIGluIHRoZSBsYXN0IHR1cm5cIik7XG5cblx0cmVhZG9ubHkgaXNEZWZhdWx0ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgaXNFbmFibGVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgY2hhbm5lbFVyaU9iczogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGNoYW5nZXNldFN0YXRlT2JzOiBJT2JzZXJ2YWJsZTxJT2JzZXJ2YWJsZTxDaGFuZ2VzZXRTdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkIHwgbnVsbD4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlc3Npb25Vcmk6IFVSSSxcblx0XHRvcHRpb25zOiBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMsXG5cdFx0aXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRjaGFuZ2VzZXRTdW1tYXJ5OiBDaGFuZ2VzZXQgJiB7IGlzRGVmYXVsdDogYm9vbGVhbiB9LFxuXHRcdEBJRGlhbG9nU2VydmljZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY2hhbmdlc2V0U3VtbWFyeSwgb3B0aW9ucywgZGlhbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLmlkID0gY2hhbmdlc2V0U3VtbWFyeS5jaGFuZ2VLaW5kO1xuXG5cdFx0Ly8gVHVybnMgbW92ZWQgb2ZmIHRoZSBzZXNzaW9uIGFuZCBvbnRvIGEgcGVyLWNoYXQgY2hhbm5lbCB3aXRoIHRoZVxuXHRcdC8vIG11bHRpLWNoYXQgcHJvdG9jb2wuIFN1YnNjcmliZSB0byB0aGUgc2Vzc2lvbiB0byBkaXNjb3ZlciBpdHNcblx0XHQvLyBjaGF0cywgdGhlbiB0cmFjayB0aGUgY2hhdCB0aGF0IHdhcyBtb2RpZmllZCBtb3N0IHJlY2VudGx5IFx1MjAxNCBpdHNcblx0XHQvLyBpbi1wcm9ncmVzcyB0dXJuIChvciwgd2hlbiBpZGxlLCBpdHMgbGFzdCBjb21wbGV0ZWQgdHVybikgaXMgdGhlXG5cdFx0Ly8gc2Vzc2lvbidzIFwibGFzdCB0dXJuXCIuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlT2JzID0gY3JlYXRlQWN0aXZlU2Vzc2lvblN1YnNjcmlwdGlvbk9iczxTZXNzaW9uU3RhdGU+KFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGlzQWN0aXZlU2Vzc2lvbk9icyxcblx0XHRcdFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLFxuXHRcdFx0Y29uc3RPYnNlcnZhYmxlKHNlc3Npb25VcmkpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBtb3N0UmVjZW50Q2hhdFVyaU9icyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGlzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHNlc3Npb25TdGF0ZU9icy5yZWFkKHJlYWRlcikucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHNlbGVjdE1vc3RSZWNlbnRDaGF0VXJpKHNlc3Npb25TdGF0ZSwgc2Vzc2lvblVyaSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaGF0U3RhdGVPYnMgPSBjcmVhdGVBY3RpdmVTZXNzaW9uU3Vic2NyaXB0aW9uT2JzPENoYXRTdGF0ZT4oXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0aXNBY3RpdmVTZXNzaW9uT2JzLFxuXHRcdFx0U3RhdGVDb21wb25lbnRzLkNoYXQsXG5cdFx0XHRtb3N0UmVjZW50Q2hhdFVyaU9icyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgbGFzdFR1cm5JZE9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRTdGF0ZU9icy5yZWFkKHJlYWRlcikucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjaGF0U3RhdGUgfHwgY2hhdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIFByZWZlciB0aGUgaW4tcHJvZ3Jlc3MgdHVybiBzbyB0aGUgXCJsYXN0IHR1cm5cIiByZWZsZWN0cyBzdHJlYW1pbmdcblx0XHRcdC8vIGVkaXRzIGxpdmU7IG9uY2UgaXQgY29tcGxldGVzIGl0IG1vdmVzIGludG8gYHR1cm5zYCB1bmRlciB0aGUgc2FtZVxuXHRcdFx0Ly8gaWQsIHNvIHRoZSB0cmFja2VkIGNoYW5nZXNldCB0cmFuc2l0aW9ucyBzZWFtbGVzc2x5LlxuXHRcdFx0cmV0dXJuIGNoYXRTdGF0ZS5hY3RpdmVUdXJuPy5pZCA/PyBjaGF0U3RhdGUudHVybnM/LmF0KC0xKT8uaWQ7XG5cdFx0fSk7XG5cblx0XHQvLyBMYXN0IHR1cm4gY2hhbmdlc1xuXHRcdHRoaXMuY2hhbm5lbFVyaU9icyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGlzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxhc3RUdXJuSWQgPSBsYXN0VHVybklkT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGFzdFR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1cmkgPSBjaGFuZ2VzZXRTdW1tYXJ5LnVyaVRlbXBsYXRlLnJlcGxhY2UoJ3t0dXJuSWR9JywgbGFzdFR1cm5JZCk7XG5cdFx0XHRyZXR1cm4gdXJpID8gVVJJLnBhcnNlKHVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gbGFzdCB0dXJuIGNoYW5nZXNcblx0XHR0aGlzLmNoYW5nZXNldFN0YXRlT2JzID0gY3JlYXRlQWN0aXZlU2Vzc2lvblN1YnNjcmlwdGlvbk9iczxDaGFuZ2VzZXRTdGF0ZT4oXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0aXNBY3RpdmVTZXNzaW9uT2JzLFxuXHRcdFx0U3RhdGVDb21wb25lbnRzLkNoYW5nZXNldCxcblx0XHRcdHRoaXMuY2hhbm5lbFVyaU9icyxcblx0XHQpO1xuXG5cdFx0dGhpcy5pc0VuYWJsZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB0aGlzLmNoYW5uZWxVcmlPYnMucmVhZChyZWFk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
