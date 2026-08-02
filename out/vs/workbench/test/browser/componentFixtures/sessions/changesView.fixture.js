import * as dom from "../../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { localize2 } from "../../../../../nls.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { isIChatSessionFileChange2 } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ILifecycleService, LifecyclePhase, StartupKind } from "../../../../services/lifecycle/common/lifecycle.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { FixtureMenuService } from "../chat/chatFixtureUtils.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { IChangesViewService } from "../../../../../sessions/contrib/changes/common/changesViewService.js";
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesViewMode, IsolationMode } from "../../../../../sessions/contrib/changes/common/changes.js";
import { ChangesViewPane } from "../../../../../sessions/contrib/changes/browser/changesView.js";
import { ISessionChangesService, SessionChangesService } from "../../../../../sessions/contrib/changes/browser/sessionChangesService.js";
import { IGitHubService } from "../../../../../sessions/contrib/github/browser/githubService.js";
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus } from "../../../../../sessions/contrib/github/common/types.js";
import { ISessionsService } from "../../../../../sessions/services/sessions/browser/sessionsService.js";
import { BRANCH_CHANGES_CHANGESET_ID, SessionFileOperation, SessionStatus } from "../../../../../sessions/services/sessions/common/session.js";
const WORKSPACE_URI = URI.file("/workspace/vscode");
const VIEW_WIDTH = 380;
const VIEW_HEIGHT = 520;
class FixtureChangesViewService extends Disposable {
  constructor(session, options) {
    super();
    this.viewModeObs = observableValue(this, ChangesViewMode.List);
    const changeset = createChangeset(options.changes);
    this.viewModeObs.set(options.viewMode, void 0);
    this.activeSessionResourceObs = constObservable(session.resource);
    this.activeSessionTypeObs = constObservable(session.sessionType);
    this.activeSessionIsVirtualWorkspaceObs = constObservable(false);
    this.activeSessionChangesObs = constObservable(options.changes);
    this.activeSessionChangesetsObs = constObservable([changeset]);
    this.activeSessionChangesetsLoadingObs = constObservable(false);
    this.activeSessionChangesetObs = constObservable(changeset);
    this.activeSessionChangesetLoadingObs = constObservable(false);
    this.activeSessionChangesetOperationsObs = constObservable([]);
    this.activeSessionHasGitRepositoryObs = constObservable(true);
    this.activeSessionReviewCommentCountByFileObs = constObservable(new Map(options.reviewCommentCounts));
    this.activeSessionAgentFeedbackCountByFileObs = constObservable(new Map(options.agentFeedbackCounts));
    this.activeSessionStateObs = constObservable({
      isolationMode: IsolationMode.Worktree,
      hasGitRepository: true,
      branchName: "feature/changes-view-fixtures",
      baseBranchName: "main",
      upstreamBranchName: "origin/feature/changes-view-fixtures",
      isMergeBaseBranchProtected: true,
      incomingChanges: 0,
      outgoingChanges: 2,
      uncommittedChanges: 0,
      hasBranchChanges: options.changes.length > 0,
      hasGitHubRemote: true,
      hasPullRequest: (options.checks?.length ?? 0) > 0,
      hasOpenPullRequest: (options.checks?.length ?? 0) > 0,
      hasGitOperationInProgress: false
    });
    this.activeSessionLoadingObs = constObservable(false);
  }
  setChangesetId(_changesetId) {
  }
  setChangesetFilesReviewState(_resources, _reviewed) {
  }
  setViewMode(mode) {
    this.viewModeObs.set(mode, void 0);
  }
}
class FixtureViewPaneContainer extends mock() {
}
const changesViewContainer = {
  id: CHANGES_VIEW_CONTAINER_ID,
  title: localize2("fixtureChangesContainer", "Changes"),
  ctorDescriptor: new SyncDescriptor(FixtureViewPaneContainer)
};
const changesViewDescriptor = {
  id: CHANGES_VIEW_ID,
  name: localize2("fixtureChangesView", "Changes"),
  ctorDescriptor: new SyncDescriptor(ChangesViewPane),
  containerIcon: Codicon.gitCompare
};
class FixtureViewContainerModel extends mock() {
  constructor() {
    super(...arguments);
    this.viewContainer = changesViewContainer;
    this.title = "Changes";
    this.icon = Codicon.gitCompare;
    this.keybindingId = void 0;
    this.onDidChangeContainerInfo = Event.None;
    this.allViewDescriptors = [changesViewDescriptor];
    this.onDidChangeAllViewDescriptors = Event.None;
    this.activeViewDescriptors = [changesViewDescriptor];
    this.onDidChangeActiveViewDescriptors = Event.None;
    this.visibleViewDescriptors = [changesViewDescriptor];
    this.onDidAddVisibleViewDescriptors = Event.None;
    this.onDidRemoveVisibleViewDescriptors = Event.None;
    this.onDidMoveVisibleViewDescriptors = Event.None;
  }
  isVisible() {
    return true;
  }
  setVisible() {
  }
  isCollapsed() {
    return false;
  }
  setCollapsed() {
  }
  getSize() {
    return void 0;
  }
  setSizes() {
  }
  move() {
  }
}
class FixtureViewDescriptorService extends mock() {
  constructor() {
    super(...arguments);
    this.viewContainers = [changesViewContainer];
    this.onDidChangeViewContainers = Event.None;
    this.onDidChangeContainerLocation = Event.None;
    this.onDidChangeContainer = Event.None;
    this.onDidChangeLocation = Event.None;
    this._model = new FixtureViewContainerModel();
  }
  getDefaultViewContainer() {
    return changesViewContainer;
  }
  getViewContainerById() {
    return changesViewContainer;
  }
  isViewContainerRemovedPermanently() {
    return false;
  }
  getDefaultViewContainerLocation() {
    return ViewContainerLocation.AuxiliaryBar;
  }
  getViewContainerLocation() {
    return ViewContainerLocation.AuxiliaryBar;
  }
  getViewContainersByLocation() {
    return [changesViewContainer];
  }
  getViewContainerModel() {
    return this._model;
  }
  moveViewContainerToLocation() {
  }
  getViewContainerBadgeEnablementState() {
    return true;
  }
  setViewContainerBadgeEnablementState() {
  }
  getViewDescriptorById() {
    return changesViewDescriptor;
  }
  getViewContainerByViewId() {
    return changesViewContainer;
  }
  getDefaultContainerById() {
    return changesViewContainer;
  }
  getViewLocationById() {
    return ViewContainerLocation.AuxiliaryBar;
  }
  canMoveViews() {
    return false;
  }
  moveViewsToContainer() {
  }
  moveViewToLocation() {
  }
  reset() {
  }
}
function createChangeset(changes) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = BRANCH_CHANGES_CHANGESET_ID;
      this.label = "Branch Changes";
      this.isEnabled = constObservable(true);
      this.isDefault = constObservable(true);
      this.isLoadingChanges = constObservable(false);
      this.changes = constObservable(changes);
      this.operations = constObservable([]);
      this.originalCheckpointRef = constObservable(void 0);
      this.modifiedCheckpointRef = constObservable(void 0);
    }
    async invokeOperation() {
    }
  }();
}
function createWorkspace() {
  const gitRepository = {
    uri: WORKSPACE_URI,
    workTreeUri: URI.file("/workspace/.worktrees/changes-view-fixtures"),
    branchName: "feature/changes-view-fixtures",
    baseBranchName: "main",
    baseBranchProtected: true,
    hasGitHubRemote: true,
    upstreamBranchName: "origin/feature/changes-view-fixtures",
    outgoingChanges: 2,
    uncommittedChanges: 0,
    gitHubInfo: constObservable({
      owner: "microsoft",
      repo: "vscode",
      pullRequest: {
        number: 293163,
        uri: URI.parse("https://github.com/microsoft/vscode/pull/293163"),
        icon: Codicon.gitPullRequest
      }
    })
  };
  return {
    uri: WORKSPACE_URI,
    label: "vscode",
    icon: Codicon.folder,
    folders: [{
      root: WORKSPACE_URI,
      workingDirectory: WORKSPACE_URI,
      name: "vscode",
      description: void 0,
      gitRepository
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
}
function createSession(options) {
  const capabilities = {
    supportsMultipleChats: false,
    supportsRename: true
  };
  const changesets = [createChangeset(options.changes)];
  const chat = new class extends mock() {
  }();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionId = "fixture:changes-view";
      this.resource = URI.parse("fixture-session://changes-view");
      this.providerId = "fixture";
      this.sessionType = "fixture";
      this.icon = Codicon.account;
      this.createdAt = /* @__PURE__ */ new Date("2026-05-14T12:00:00Z");
      this.workspace = constObservable(createWorkspace());
      this.title = constObservable("Changes view fixture");
      this.updatedAt = constObservable(/* @__PURE__ */ new Date("2026-05-14T12:30:00Z"));
      this.status = constObservable(SessionStatus.Completed);
      this.changes = constObservable(options.changes);
      this.changesets = constObservable(changesets);
      this.externalChanges = constObservable(options.otherFiles ?? []);
      this.modelId = constObservable(void 0);
      this.mode = constObservable(void 0);
      this.loading = constObservable(false);
      this.isArchived = constObservable(false);
      this.isRead = constObservable(true);
      this.description = constObservable(void 0);
      this.lastTurnEnd = constObservable(void 0);
      this.chats = constObservable([chat]);
      this.mainChat = constObservable(chat);
      this.capabilities = constObservable(capabilities);
      this.activeChat = constObservable(chat);
      this.isCreated = constObservable(true);
      this.sticky = constObservable(false);
      this.openChats = constObservable([chat]);
      this.closedChats = constObservable([]);
      this.lastClosedChat = void 0;
      this.visibleChatTabs = constObservable([chat]);
      this.shouldShowChatTabs = constObservable(false);
    }
  }();
}
function createFileChange(path, kind, insertions, deletions) {
  const uri = URI.file(`/workspace/vscode/${path}`);
  return {
    uri,
    originalUri: kind === "added" ? void 0 : URI.file(`/workspace/vscode/.baseline/${path}`),
    modifiedUri: kind === "deleted" ? void 0 : uri,
    insertions,
    deletions
  };
}
function createOtherFile(path, operation) {
  return {
    uri: URI.file(path),
    operation,
    originalUri: operation === SessionFileOperation.Modified ? URI.file(`${path}.before`) : void 0
  };
}
function createCheck(id, name, status, conclusion) {
  return {
    id,
    name,
    status,
    conclusion,
    startedAt: "2026-05-14T12:00:00Z",
    completedAt: status === GitHubCheckStatus.Completed ? "2026-05-14T12:05:00Z" : void 0,
    detailsUrl: `https://github.com/microsoft/vscode/actions/runs/${id}`
  };
}
function createCIModel(checks) {
  if (!checks?.length) {
    return void 0;
  }
  const visibleChecks = checks;
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.owner = "microsoft";
      this.repo = "vscode";
      this.prNumber = 293163;
      this.headSha = "abcdef1234567890";
      this.checks = constObservable(visibleChecks);
      this.overallStatus = constObservable(GitHubCIOverallStatus.Failure);
      this.fixRequested = constObservable(false);
    }
    markFixRequested() {
    }
    async refresh() {
    }
    async rerunFailedCheck() {
    }
    async getCheckRunAnnotations() {
      return "";
    }
    startPolling() {
      return { dispose() {
      } };
    }
  }();
}
function createGitHubService(checks) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSessionPullRequestObs = constObservable(void 0);
      this.activeSessionPullRequestCIObs = constObservable(createCIModel(checks));
      this.activeSessionPullRequestReviewThreadsObs = constObservable(void 0);
    }
    createRepositoryModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    createPullRequestModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    createPullRequestReviewThreadsModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    createPullRequestCIModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    async getChangedFiles() {
      return [];
    }
    async findPullRequestNumberByHeadBranch() {
      return void 0;
    }
  }();
}
function getChangeUri(change) {
  return isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
}
function renderChangesView(ctx, options) {
  const { container, disposableStore, theme } = ctx;
  const height = options.height ?? VIEW_HEIGHT;
  const session = createSession(options);
  const changesViewService = disposableStore.add(new FixtureChangesViewService(session, options));
  container.style.width = `${VIEW_WIDTH}px`;
  container.style.height = `${height}px`;
  container.style.backgroundColor = "var(--vscode-sideBar-background)";
  const host = dom.append(container, dom.$(".part.auxiliarybar"));
  host.style.width = "100%";
  host.style.height = "100%";
  const paneView = dom.append(host, dom.$(".monaco-pane-view"));
  paneView.style.width = "100%";
  paneView.style.height = "100%";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IMenuService, FixtureMenuService);
      reg.define(IListService, ListService);
      reg.define(ISessionChangesService, SessionChangesService);
      reg.defineInstance(IChangesViewService, changesViewService);
      reg.defineInstance(IGitHubService, createGitHubService(options.checks));
      reg.defineInstance(IViewDescriptorService, new FixtureViewDescriptorService());
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = constObservable(session);
          this.visibleSessions = constObservable([session]);
          this.onDidToggleSessionStickiness = Event.None;
        }
      }());
      reg.defineInstance(IDecorationsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDecorations = Event.None;
        }
      }());
      reg.defineInstance(ITextFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.untitled = new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChangeLabel = Event.None;
            }
          }();
        }
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "fixture", folders: [], configuration: void 0 };
        }
      }());
      reg.defineInstance(INotebookDocumentService, new class extends mock() {
        getNotebook() {
          return void 0;
        }
      }());
      reg.defineInstance(IFileService, new class extends mock() {
        async readFile(resource) {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.resource = resource;
              this.value = VSBuffer.fromString("before");
            }
          }();
        }
      }());
      reg.defineInstance(IEditorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidActiveEditorChange = Event.None;
          this.onDidVisibleEditorsChange = Event.None;
          this.onDidEditorsChange = Event.None;
        }
        async openEditor() {
          return void 0;
        }
      }());
      reg.defineInstance(IExtensionService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeExtensions = Event.None;
        }
      }());
      reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
      }());
      reg.defineInstance(ILifecycleService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.startupKind = StartupKind.NewWindow;
          this.phase = LifecyclePhase.Restored;
          this.onBeforeShutdown = Event.None;
          this.onShutdownVeto = Event.None;
          this.onBeforeShutdownError = Event.None;
          this.onWillShutdown = Event.None;
          this.willShutdown = false;
          this.onDidShutdown = Event.None;
        }
        async when() {
        }
        async shutdown() {
        }
      }());
    }
  });
  const view = disposableStore.add(instantiationService.createInstance(ChangesViewPane, {
    id: CHANGES_VIEW_ID,
    title: "Changes",
    minimumBodySize: 0,
    maximumBodySize: Number.POSITIVE_INFINITY
  }));
  view.render();
  paneView.appendChild(view.element);
  view.setVisible(true);
  view.orthogonalSize = VIEW_WIDTH;
  view.layout(height);
}
const SAMPLE_CHANGES = [
  createFileChange("src/vs/sessions/contrib/changes/browser/changesView.ts", "modified", 42, 18),
  createFileChange("src/vs/sessions/contrib/changes/browser/sessionFilesWidget.ts", "modified", 24, 9),
  createFileChange("src/vs/sessions/contrib/changes/browser/media/sessionFilesWidget.css", "modified", 6, 2),
  createFileChange("src/vs/sessions/contrib/changes/test/browser/changesView.fixture.ts", "added", 132, 0),
  createFileChange("src/vs/sessions/contrib/changes/browser/oldChangesLayout.ts", "deleted", 0, 47)
];
const SAMPLE_OTHER_FILES = [
  createOtherFile("/home/user/.config/code/settings.json", SessionFileOperation.Modified),
  createOtherFile("/home/user/.config/copilot/agents/inbox.agent.md", SessionFileOperation.Created),
  createOtherFile("/home/user/.cache/copilot/session.log", SessionFileOperation.Deleted),
  createOtherFile("/tmp/session-notes.md", SessionFileOperation.Created),
  createOtherFile("/home/user/.gitconfig", SessionFileOperation.Modified),
  createOtherFile("/home/user/.ssh/config", SessionFileOperation.Modified),
  createOtherFile("/home/user/.local/share/copilot/state.json", SessionFileOperation.Created),
  createOtherFile("/home/user/.vscode-insiders/argv.json", SessionFileOperation.Modified)
];
const SAMPLE_CHECKS = [
  createCheck(1001, "Linux / Unit Tests", GitHubCheckStatus.Completed, GitHubCheckConclusion.Success),
  createCheck(1002, "Windows / Unit Tests", GitHubCheckStatus.Completed, GitHubCheckConclusion.Failure),
  createCheck(1003, "macOS / Smoke Tests", GitHubCheckStatus.InProgress),
  createCheck(1004, "Hygiene", GitHubCheckStatus.Queued),
  createCheck(1005, "Compile", GitHubCheckStatus.Completed, GitHubCheckConclusion.Success)
];
var changesView_fixture_default = defineThemedFixtureGroup({ path: "sessions/changes/" }, {
  AllSections_List: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: SAMPLE_CHANGES,
      otherFiles: SAMPLE_OTHER_FILES,
      checks: SAMPLE_CHECKS,
      reviewCommentCounts: /* @__PURE__ */ new Map([[getChangeUri(SAMPLE_CHANGES[0]).fsPath, 2]]),
      agentFeedbackCounts: /* @__PURE__ */ new Map([[getChangeUri(SAMPLE_CHANGES[1]).fsPath, 1]])
    })
  }),
  TreeMode: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.Tree,
      changes: SAMPLE_CHANGES,
      otherFiles: SAMPLE_OTHER_FILES.slice(0, 3),
      checks: SAMPLE_CHECKS.slice(0, 3)
    })
  }),
  FilesAndChecksOnly: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: SAMPLE_CHANGES,
      checks: SAMPLE_CHECKS,
      height: 440
    })
  }),
  NoFileChangesWithOtherFiles: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: [],
      otherFiles: SAMPLE_OTHER_FILES,
      checks: SAMPLE_CHECKS.slice(0, 2),
      height: 440
    })
  }),
  Empty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: [],
      otherFiles: [],
      checks: [],
      height: 280
    })
  })
});
export {
  changesView_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvc2Vzc2lvbnMvY2hhbmdlc1ZpZXcuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3Q29udGFpbmVyTW9kZWwsIElWaWV3RGVzY3JpcHRvciwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSVZpZXdQYW5lQ29udGFpbmVyLCBWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UsIFN0YXJ0dXBLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBGaXh0dXJlTWVudVNlcnZpY2UgfSBmcm9tICcuLi9jaGF0L2NoYXRGaXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IEFjdGl2ZVNlc3Npb25TdGF0ZSwgSUNoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgQ0hBTkdFU19WSUVXX0lELCBDaGFuZ2VzVmlld01vZGUsIElzb2xhdGlvbk1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvY29tbW9uL2NoYW5nZXMuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBDaGFuZ2VzVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9jaGFuZ2VzVmlldy5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIFNlc3Npb25DaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0Q0lNb2RlbC5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9naXRodWIvYnJvd3Nlci9naXRodWJTZXJ2aWNlLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgR2l0SHViQ2hlY2tDb25jbHVzaW9uLCBHaXRIdWJDaGVja1N0YXR1cywgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLCBJR2l0SHViQ0lDaGVjayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IEJSQU5DSF9DSEFOR0VTX0NIQU5HRVNFVF9JRCwgSUNoYXQsIElHaXRIdWJJbmZvLCBJU2Vzc2lvbkNhcGFiaWxpdGllcywgSVNlc3Npb25DaGFuZ2VzZXQsIElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uLCBJU2Vzc2lvbkZpbGUsIElTZXNzaW9uRmlsZUNoYW5nZSwgSVNlc3Npb25HaXRSZXBvc2l0b3J5LCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvbkZpbGVPcGVyYXRpb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5cbmludGVyZmFjZSBJQ2hhbmdlc1ZpZXdGaXh0dXJlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHZpZXdNb2RlOiBDaGFuZ2VzVmlld01vZGU7XG5cdHJlYWRvbmx5IGNoYW5nZXM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdO1xuXHRyZWFkb25seSBvdGhlckZpbGVzPzogcmVhZG9ubHkgSVNlc3Npb25GaWxlW107XG5cdHJlYWRvbmx5IGNoZWNrcz86IHJlYWRvbmx5IElHaXRIdWJDSUNoZWNrW107XG5cdHJlYWRvbmx5IHJldmlld0NvbW1lbnRDb3VudHM/OiBSZWFkb25seU1hcDxzdHJpbmcsIG51bWJlcj47XG5cdHJlYWRvbmx5IGFnZW50RmVlZGJhY2tDb3VudHM/OiBSZWFkb25seU1hcDxzdHJpbmcsIG51bWJlcj47XG5cdHJlYWRvbmx5IGhlaWdodD86IG51bWJlcjtcbn1cblxuY29uc3QgV09SS1NQQUNFX1VSSSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3ZzY29kZScpO1xuY29uc3QgVklFV19XSURUSCA9IDM4MDtcbmNvbnN0IFZJRVdfSEVJR0hUID0gNTIwO1xuXG5jbGFzcyBGaXh0dXJlQ2hhbmdlc1ZpZXdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGFuZ2VzVmlld1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnM6IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25UeXBlT2JzOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uSXNWaXJ0dWFsV29ya3NwYWNlT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c0xvYWRpbmdPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbkNoYW5nZXNldCB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRMb2FkaW5nT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbnNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uW10+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uSGFzR2l0UmVwb3NpdG9yeU9iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXZpZXdDb21tZW50Q291bnRCeUZpbGVPYnM6IElPYnNlcnZhYmxlPE1hcDxzdHJpbmcsIG51bWJlcj4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQWdlbnRGZWVkYmFja0NvdW50QnlGaWxlT2JzOiBJT2JzZXJ2YWJsZTxNYXA8c3RyaW5nLCBudW1iZXI+Pjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvblN0YXRlT2JzOiBJT2JzZXJ2YWJsZTxBY3RpdmVTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uTG9hZGluZ09iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHZpZXdNb2RlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPENoYW5nZXNWaWV3TW9kZT4odGhpcywgQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpO1xuXG5cdGNvbnN0cnVjdG9yKHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCBvcHRpb25zOiBJQ2hhbmdlc1ZpZXdGaXh0dXJlT3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBjcmVhdGVDaGFuZ2VzZXQob3B0aW9ucy5jaGFuZ2VzKTtcblx0XHR0aGlzLnZpZXdNb2RlT2JzLnNldChvcHRpb25zLnZpZXdNb2RlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzID0gY29uc3RPYnNlcnZhYmxlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblR5cGVPYnMgPSBjb25zdE9ic2VydmFibGUoc2Vzc2lvbi5zZXNzaW9uVHlwZSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uSXNWaXJ0dWFsV29ya3NwYWNlT2JzID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzID0gY29uc3RPYnNlcnZhYmxlKG9wdGlvbnMuY2hhbmdlcyk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c09icyA9IGNvbnN0T2JzZXJ2YWJsZShbY2hhbmdlc2V0XSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c0xvYWRpbmdPYnMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icyA9IGNvbnN0T2JzZXJ2YWJsZShjaGFuZ2VzZXQpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmdPYnMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbnNPYnMgPSBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25bXT4oW10pO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkhhc0dpdFJlcG9zaXRvcnlPYnMgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uUmV2aWV3Q29tbWVudENvdW50QnlGaWxlT2JzID0gY29uc3RPYnNlcnZhYmxlKG5ldyBNYXAob3B0aW9ucy5yZXZpZXdDb21tZW50Q291bnRzKSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQWdlbnRGZWVkYmFja0NvdW50QnlGaWxlT2JzID0gY29uc3RPYnNlcnZhYmxlKG5ldyBNYXAob3B0aW9ucy5hZ2VudEZlZWRiYWNrQ291bnRzKSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uU3RhdGVPYnMgPSBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0aXNvbGF0aW9uTW9kZTogSXNvbGF0aW9uTW9kZS5Xb3JrdHJlZSxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHRydWUsXG5cdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS9jaGFuZ2VzLXZpZXctZml4dHVyZXMnLFxuXHRcdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogJ29yaWdpbi9mZWF0dXJlL2NoYW5nZXMtdmlldy1maXh0dXJlcycsXG5cdFx0XHRpc01lcmdlQmFzZUJyYW5jaFByb3RlY3RlZDogdHJ1ZSxcblx0XHRcdGluY29taW5nQ2hhbmdlczogMCxcblx0XHRcdG91dGdvaW5nQ2hhbmdlczogMixcblx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogMCxcblx0XHRcdGhhc0JyYW5jaENoYW5nZXM6IG9wdGlvbnMuY2hhbmdlcy5sZW5ndGggPiAwLFxuXHRcdFx0aGFzR2l0SHViUmVtb3RlOiB0cnVlLFxuXHRcdFx0aGFzUHVsbFJlcXVlc3Q6IChvcHRpb25zLmNoZWNrcz8ubGVuZ3RoID8/IDApID4gMCxcblx0XHRcdGhhc09wZW5QdWxsUmVxdWVzdDogKG9wdGlvbnMuY2hlY2tzPy5sZW5ndGggPz8gMCkgPiAwLFxuXHRcdFx0aGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzczogZmFsc2UsXG5cdFx0fSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uTG9hZGluZ09icyA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdH1cblxuXHRzZXRDaGFuZ2VzZXRJZChfY2hhbmdlc2V0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQgeyB9XG5cblx0c2V0Q2hhbmdlc2V0RmlsZXNSZXZpZXdTdGF0ZShfcmVzb3VyY2VzOiByZWFkb25seSBVUklbXSwgX3Jldmlld2VkOiBib29sZWFuKTogdm9pZCB7IH1cblxuXHRzZXRWaWV3TW9kZShtb2RlOiBDaGFuZ2VzVmlld01vZGUpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlT2JzLnNldChtb2RlLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmNsYXNzIEZpeHR1cmVWaWV3UGFuZUNvbnRhaW5lciBleHRlbmRzIG1vY2s8SVZpZXdQYW5lQ29udGFpbmVyPigpIHsgfVxuXG5jb25zdCBjaGFuZ2VzVmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciA9IHtcblx0aWQ6IENIQU5HRVNfVklFV19DT05UQUlORVJfSUQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZpeHR1cmVDaGFuZ2VzQ29udGFpbmVyJywgJ0NoYW5nZXMnKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihGaXh0dXJlVmlld1BhbmVDb250YWluZXIpLFxufTtcblxuY29uc3QgY2hhbmdlc1ZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdGlkOiBDSEFOR0VTX1ZJRVdfSUQsXG5cdG5hbWU6IGxvY2FsaXplMignZml4dHVyZUNoYW5nZXNWaWV3JywgJ0NoYW5nZXMnKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihDaGFuZ2VzVmlld1BhbmUpLFxuXHRjb250YWluZXJJY29uOiBDb2RpY29uLmdpdENvbXBhcmUsXG59O1xuXG5jbGFzcyBGaXh0dXJlVmlld0NvbnRhaW5lck1vZGVsIGV4dGVuZHMgbW9jazxJVmlld0NvbnRhaW5lck1vZGVsPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lciA9IGNoYW5nZXNWaWV3Q29udGFpbmVyO1xuXHRvdmVycmlkZSByZWFkb25seSB0aXRsZSA9ICdDaGFuZ2VzJztcblx0b3ZlcnJpZGUgcmVhZG9ubHkgaWNvbjogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkID0gQ29kaWNvbi5naXRDb21wYXJlO1xuXHRvdmVycmlkZSByZWFkb25seSBrZXliaW5kaW5nSWQgPSB1bmRlZmluZWQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGFpbmVySW5mbyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFsbFZpZXdEZXNjcmlwdG9ycyA9IFtjaGFuZ2VzVmlld0Rlc2NyaXB0b3JdO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFsbFZpZXdEZXNjcmlwdG9ycyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVZpZXdEZXNjcmlwdG9ycyA9IFtjaGFuZ2VzVmlld0Rlc2NyaXB0b3JdO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHZpc2libGVWaWV3RGVzY3JpcHRvcnMgPSBbY2hhbmdlc1ZpZXdEZXNjcmlwdG9yXTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRWaXNpYmxlVmlld0Rlc2NyaXB0b3JzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZW1vdmVWaXNpYmxlVmlld0Rlc2NyaXB0b3JzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRNb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyA9IEV2ZW50Lk5vbmU7XG5cblx0b3ZlcnJpZGUgaXNWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBzZXRWaXNpYmxlKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGlzQ29sbGFwc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0b3ZlcnJpZGUgc2V0Q29sbGFwc2VkKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGdldFNpemUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRvdmVycmlkZSBzZXRTaXplcygpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBtb3ZlKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIEZpeHR1cmVWaWV3RGVzY3JpcHRvclNlcnZpY2UgZXh0ZW5kcyBtb2NrPElWaWV3RGVzY3JpcHRvclNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSB2aWV3Q29udGFpbmVycyA9IFtjaGFuZ2VzVmlld0NvbnRhaW5lcl07XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbnRhaW5lckxvY2F0aW9uID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxvY2F0aW9uID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbCA9IG5ldyBGaXh0dXJlVmlld0NvbnRhaW5lck1vZGVsKCk7XG5cblx0b3ZlcnJpZGUgZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoKTogVmlld0NvbnRhaW5lciB8IHVuZGVmaW5lZCB7IHJldHVybiBjaGFuZ2VzVmlld0NvbnRhaW5lcjsgfVxuXHRvdmVycmlkZSBnZXRWaWV3Q29udGFpbmVyQnlJZCgpOiBWaWV3Q29udGFpbmVyIHwgbnVsbCB7IHJldHVybiBjaGFuZ2VzVmlld0NvbnRhaW5lcjsgfVxuXHRvdmVycmlkZSBpc1ZpZXdDb250YWluZXJSZW1vdmVkUGVybWFuZW50bHkoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRvdmVycmlkZSBnZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKCk6IFZpZXdDb250YWluZXJMb2NhdGlvbiB8IG51bGwgeyByZXR1cm4gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjsgfVxuXHRvdmVycmlkZSBnZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oKTogVmlld0NvbnRhaW5lckxvY2F0aW9uIHwgbnVsbCB7IHJldHVybiBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyOyB9XG5cdG92ZXJyaWRlIGdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbigpOiBWaWV3Q29udGFpbmVyW10geyByZXR1cm4gW2NoYW5nZXNWaWV3Q29udGFpbmVyXTsgfVxuXHRvdmVycmlkZSBnZXRWaWV3Q29udGFpbmVyTW9kZWwoKTogSVZpZXdDb250YWluZXJNb2RlbCB7IHJldHVybiB0aGlzLl9tb2RlbDsgfVxuXHRvdmVycmlkZSBtb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb24oKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgZ2V0Vmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBzZXRWaWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGUoKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKCk6IElWaWV3RGVzY3JpcHRvciB8IG51bGwgeyByZXR1cm4gY2hhbmdlc1ZpZXdEZXNjcmlwdG9yOyB9XG5cdG92ZXJyaWRlIGdldFZpZXdDb250YWluZXJCeVZpZXdJZCgpOiBWaWV3Q29udGFpbmVyIHwgbnVsbCB7IHJldHVybiBjaGFuZ2VzVmlld0NvbnRhaW5lcjsgfVxuXHRvdmVycmlkZSBnZXREZWZhdWx0Q29udGFpbmVyQnlJZCgpOiBWaWV3Q29udGFpbmVyIHwgbnVsbCB7IHJldHVybiBjaGFuZ2VzVmlld0NvbnRhaW5lcjsgfVxuXHRvdmVycmlkZSBnZXRWaWV3TG9jYXRpb25CeUlkKCk6IFZpZXdDb250YWluZXJMb2NhdGlvbiB8IG51bGwgeyByZXR1cm4gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjsgfVxuXHRvdmVycmlkZSBjYW5Nb3ZlVmlld3MoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRvdmVycmlkZSBtb3ZlVmlld3NUb0NvbnRhaW5lcigpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBtb3ZlVmlld1RvTG9jYXRpb24oKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgcmVzZXQoKTogdm9pZCB7IH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ2hhbmdlc2V0KGNoYW5nZXM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdKTogSVNlc3Npb25DaGFuZ2VzZXQge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbkNoYW5nZXNldD4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSBCUkFOQ0hfQ0hBTkdFU19DSEFOR0VTRVRfSUQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFiZWwgPSAnQnJhbmNoIENoYW5nZXMnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzRW5hYmxlZCA9IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0RlZmF1bHQgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNMb2FkaW5nQ2hhbmdlcyA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhbmdlcyA9IGNvbnN0T2JzZXJ2YWJsZShjaGFuZ2VzKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvcGVyYXRpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvcmlnaW5hbENoZWNrcG9pbnRSZWYgPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBtb2RpZmllZENoZWNrcG9pbnRSZWYgPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRvdmVycmlkZSBhc3luYyBpbnZva2VPcGVyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRjb25zdCBnaXRSZXBvc2l0b3J5OiBJU2Vzc2lvbkdpdFJlcG9zaXRvcnkgPSB7XG5cdFx0dXJpOiBXT1JLU1BBQ0VfVVJJLFxuXHRcdHdvcmtUcmVlVXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8ud29ya3RyZWVzL2NoYW5nZXMtdmlldy1maXh0dXJlcycpLFxuXHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlL2NoYW5nZXMtdmlldy1maXh0dXJlcycsXG5cdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRiYXNlQnJhbmNoUHJvdGVjdGVkOiB0cnVlLFxuXHRcdGhhc0dpdEh1YlJlbW90ZTogdHJ1ZSxcblx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6ICdvcmlnaW4vZmVhdHVyZS9jaGFuZ2VzLXZpZXctZml4dHVyZXMnLFxuXHRcdG91dGdvaW5nQ2hhbmdlczogMixcblx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDAsXG5cdFx0Z2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPih7XG5cdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdG51bWJlcjogMjkzMTYzLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yOTMxNjMnKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5naXRQdWxsUmVxdWVzdCxcblx0XHRcdH0sXG5cdFx0fSksXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHR1cmk6IFdPUktTUEFDRV9VUkksXG5cdFx0bGFiZWw6ICd2c2NvZGUnLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRyb290OiBXT1JLU1BBQ0VfVVJJLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS1NQQUNFX1VSSSxcblx0XHRcdG5hbWU6ICd2c2NvZGUnLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGdpdFJlcG9zaXRvcnksXG5cdFx0fV0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihvcHRpb25zOiBJQ2hhbmdlc1ZpZXdGaXh0dXJlT3B0aW9ucyk6IElBY3RpdmVTZXNzaW9uIHtcblx0Y29uc3QgY2FwYWJpbGl0aWVzOiBJU2Vzc2lvbkNhcGFiaWxpdGllcyA9IHtcblx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlLFxuXHRcdHN1cHBvcnRzUmVuYW1lOiB0cnVlLFxuXHR9O1xuXHRjb25zdCBjaGFuZ2VzZXRzID0gW2NyZWF0ZUNoYW5nZXNldChvcHRpb25zLmNoYW5nZXMpXTtcblx0Y29uc3QgY2hhdCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkgeyB9KCk7XG5cblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25JZCA9ICdmaXh0dXJlOmNoYW5nZXMtdmlldyc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpeHR1cmUtc2Vzc2lvbjovL2NoYW5nZXMtdmlldycpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVySWQgPSAnZml4dHVyZSc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGUgPSAnZml4dHVyZSc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWNvbiA9IENvZGljb24uYWNjb3VudDtcblx0XHRvdmVycmlkZSByZWFkb25seSBjcmVhdGVkQXQgPSBuZXcgRGF0ZSgnMjAyNi0wNS0xNFQxMjowMDowMFonKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2UgPSBjb25zdE9ic2VydmFibGUoY3JlYXRlV29ya3NwYWNlKCkpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRpdGxlID0gY29uc3RPYnNlcnZhYmxlKCdDaGFuZ2VzIHZpZXcgZml4dHVyZScpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHVwZGF0ZWRBdCA9IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgnMjAyNi0wNS0xNFQxMjozMDowMFonKSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdHVzID0gY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBjaGFuZ2VzID0gY29uc3RPYnNlcnZhYmxlKG9wdGlvbnMuY2hhbmdlcyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhbmdlc2V0cyA9IGNvbnN0T2JzZXJ2YWJsZShjaGFuZ2VzZXRzKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBleHRlcm5hbENoYW5nZXMgPSBjb25zdE9ic2VydmFibGUob3B0aW9ucy5vdGhlckZpbGVzID8/IFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBtb2RlbElkID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZSA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxvYWRpbmcgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQXJjaGl2ZWQgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzUmVhZCA9IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBkZXNjcmlwdGlvbiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RUdXJuRW5kID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhdHMgPSBjb25zdE9ic2VydmFibGUoW2NoYXRdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBtYWluQ2hhdCA9IGNvbnN0T2JzZXJ2YWJsZShjaGF0KTtcblx0XHRvdmVycmlkZSByZWFkb25seSBjYXBhYmlsaXRpZXMgPSBjb25zdE9ic2VydmFibGUoY2FwYWJpbGl0aWVzKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVDaGF0ID0gY29uc3RPYnNlcnZhYmxlKGNoYXQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ3JlYXRlZCA9IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBzdGlja3kgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9wZW5DaGF0cyA9IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNsb3NlZENoYXRzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0Q2xvc2VkQ2hhdCA9IHVuZGVmaW5lZDtcblx0XHRvdmVycmlkZSByZWFkb25seSB2aXNpYmxlQ2hhdFRhYnMgPSBjb25zdE9ic2VydmFibGUoW2NoYXRdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBzaG91bGRTaG93Q2hhdFRhYnMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpbGVDaGFuZ2UocGF0aDogc3RyaW5nLCBraW5kOiAnYWRkZWQnIHwgJ21vZGlmaWVkJyB8ICdkZWxldGVkJywgaW5zZXJ0aW9uczogbnVtYmVyLCBkZWxldGlvbnM6IG51bWJlcik6IElTZXNzaW9uRmlsZUNoYW5nZSB7XG5cdGNvbnN0IHVyaSA9IFVSSS5maWxlKGAvd29ya3NwYWNlL3ZzY29kZS8ke3BhdGh9YCk7XG5cdHJldHVybiB7XG5cdFx0dXJpLFxuXHRcdG9yaWdpbmFsVXJpOiBraW5kID09PSAnYWRkZWQnID8gdW5kZWZpbmVkIDogVVJJLmZpbGUoYC93b3Jrc3BhY2UvdnNjb2RlLy5iYXNlbGluZS8ke3BhdGh9YCksXG5cdFx0bW9kaWZpZWRVcmk6IGtpbmQgPT09ICdkZWxldGVkJyA/IHVuZGVmaW5lZCA6IHVyaSxcblx0XHRpbnNlcnRpb25zLFxuXHRcdGRlbGV0aW9ucyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlT3RoZXJGaWxlKHBhdGg6IHN0cmluZywgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbik6IElTZXNzaW9uRmlsZSB7XG5cdHJldHVybiB7XG5cdFx0dXJpOiBVUkkuZmlsZShwYXRoKSxcblx0XHRvcGVyYXRpb24sXG5cdFx0b3JpZ2luYWxVcmk6IG9wZXJhdGlvbiA9PT0gU2Vzc2lvbkZpbGVPcGVyYXRpb24uTW9kaWZpZWQgPyBVUkkuZmlsZShgJHtwYXRofS5iZWZvcmVgKSA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ2hlY2soaWQ6IG51bWJlciwgbmFtZTogc3RyaW5nLCBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLCBjb25jbHVzaW9uPzogR2l0SHViQ2hlY2tDb25jbHVzaW9uKTogSUdpdEh1YkNJQ2hlY2sge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdG5hbWUsXG5cdFx0c3RhdHVzLFxuXHRcdGNvbmNsdXNpb24sXG5cdFx0c3RhcnRlZEF0OiAnMjAyNi0wNS0xNFQxMjowMDowMFonLFxuXHRcdGNvbXBsZXRlZEF0OiBzdGF0dXMgPT09IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCA/ICcyMDI2LTA1LTE0VDEyOjA1OjAwWicgOiB1bmRlZmluZWQsXG5cdFx0ZGV0YWlsc1VybDogYGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2FjdGlvbnMvcnVucy8ke2lkfWAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNJTW9kZWwoY2hlY2tzOiByZWFkb25seSBJR2l0SHViQ0lDaGVja1tdIHwgdW5kZWZpbmVkKTogR2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFjaGVja3M/Lmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdmlzaWJsZUNoZWNrczogcmVhZG9ubHkgSUdpdEh1YkNJQ2hlY2tbXSA9IGNoZWNrcztcblxuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWw+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG93bmVyID0gJ21pY3Jvc29mdCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVwbyA9ICd2c2NvZGUnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByTnVtYmVyID0gMjkzMTYzO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGhlYWRTaGEgPSAnYWJjZGVmMTIzNDU2Nzg5MCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hlY2tzID0gY29uc3RPYnNlcnZhYmxlKHZpc2libGVDaGVja3MpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG92ZXJhbGxTdGF0dXMgPSBjb25zdE9ic2VydmFibGUoR2l0SHViQ0lPdmVyYWxsU3RhdHVzLkZhaWx1cmUpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZpeFJlcXVlc3RlZCA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cdFx0b3ZlcnJpZGUgbWFya0ZpeFJlcXVlc3RlZCgpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRvdmVycmlkZSBhc3luYyByZXJ1bkZhaWxlZENoZWNrKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q2hlY2tSdW5Bbm5vdGF0aW9ucygpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0XHRvdmVycmlkZSBzdGFydFBvbGxpbmcoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUdpdEh1YlNlcnZpY2UoY2hlY2tzOiByZWFkb25seSBJR2l0SHViQ0lDaGVja1tdIHwgdW5kZWZpbmVkKTogSUdpdEh1YlNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0T2JzID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0Q0lPYnMgPSBjb25zdE9ic2VydmFibGUoY3JlYXRlQ0lNb2RlbChjaGVja3MpKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzT2JzID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0b3ZlcnJpZGUgY3JlYXRlUmVwb3NpdG9yeU1vZGVsUmVmZXJlbmNlKCk6IFJldHVyblR5cGU8SUdpdEh1YlNlcnZpY2VbJ2NyZWF0ZVJlcG9zaXRvcnlNb2RlbFJlZmVyZW5jZSddPiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkIGluIGZpeHR1cmUuJyk7IH1cblx0XHRvdmVycmlkZSBjcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlKCk6IFJldHVyblR5cGU8SUdpdEh1YlNlcnZpY2VbJ2NyZWF0ZVB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2UnXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBpbiBmaXh0dXJlLicpOyB9XG5cdFx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWxSZWZlcmVuY2UoKTogUmV0dXJuVHlwZTxJR2l0SHViU2VydmljZVsnY3JlYXRlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWxSZWZlcmVuY2UnXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBpbiBmaXh0dXJlLicpOyB9XG5cdFx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RDSU1vZGVsUmVmZXJlbmNlKCk6IFJldHVyblR5cGU8SUdpdEh1YlNlcnZpY2VbJ2NyZWF0ZVB1bGxSZXF1ZXN0Q0lNb2RlbFJlZmVyZW5jZSddPiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkIGluIGZpeHR1cmUuJyk7IH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRDaGFuZ2VkRmlsZXMoKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGZpbmRQdWxsUmVxdWVzdE51bWJlckJ5SGVhZEJyYW5jaCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGdldENoYW5nZVVyaShjaGFuZ2U6IElTZXNzaW9uRmlsZUNoYW5nZSk6IFVSSSB7XG5cdHJldHVybiBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGNoYW5nZSkgPyBjaGFuZ2UudXJpIDogY2hhbmdlLm1vZGlmaWVkVXJpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJDaGFuZ2VzVmlldyhjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBvcHRpb25zOiBJQ2hhbmdlc1ZpZXdGaXh0dXJlT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9ID0gY3R4O1xuXHRjb25zdCBoZWlnaHQgPSBvcHRpb25zLmhlaWdodCA/PyBWSUVXX0hFSUdIVDtcblx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24ob3B0aW9ucyk7XG5cdGNvbnN0IGNoYW5nZXNWaWV3U2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEZpeHR1cmVDaGFuZ2VzVmlld1NlcnZpY2Uoc2Vzc2lvbiwgb3B0aW9ucykpO1xuXG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke1ZJRVdfV0lEVEh9cHhgO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtc2lkZUJhci1iYWNrZ3JvdW5kKSc7XG5cblx0Y29uc3QgaG9zdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnBhcnQuYXV4aWxpYXJ5YmFyJykpO1xuXHRob3N0LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRob3N0LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRjb25zdCBwYW5lVmlldyA9IGRvbS5hcHBlbmQoaG9zdCwgZG9tLiQoJy5tb25hY28tcGFuZS12aWV3JykpO1xuXHRwYW5lVmlldy5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0cGFuZVZpZXcuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogdGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiByZWcgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZShJTWVudVNlcnZpY2UsIEZpeHR1cmVNZW51U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lKElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLCBTZXNzaW9uQ2hhbmdlc1NlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGFuZ2VzVmlld1NlcnZpY2UsIGNoYW5nZXNWaWV3U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUdpdEh1YlNlcnZpY2UsIGNyZWF0ZUdpdEh1YlNlcnZpY2Uob3B0aW9ucy5jaGVja3MpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBuZXcgRml4dHVyZVZpZXdEZXNjcmlwdG9yU2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPihzZXNzaW9uKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zID0gY29uc3RPYnNlcnZhYmxlKFtzZXNzaW9uXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVG9nZ2xlU2Vzc2lvblN0aWNraW5lc3MgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGVjb3JhdGlvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEZWNvcmF0aW9uc1NlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZURlY29yYXRpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVGV4dEZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB1bnRpdGxlZCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZVsndW50aXRsZWQnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lOyB9KCk7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHsgcmV0dXJuIHsgaWQ6ICdmaXh0dXJlJywgZm9sZGVyczogW10sIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9OyB9IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0RvY3VtZW50U2VydmljZT4oKSB7IG92ZXJyaWRlIGdldE5vdGVib29rKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlQ29udGVudD4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmFsdWUgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiZWZvcmUnKTtcblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEVkaXRvcnNDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnMgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTGlmZWN5Y2xlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGlmZWN5Y2xlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXJ0dXBLaW5kID0gU3RhcnR1cEtpbmQuTmV3V2luZG93O1xuXHRcdFx0XHRvdmVycmlkZSBwaGFzZSA9IExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkJlZm9yZVNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25TaHV0ZG93blZldG8gPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkJlZm9yZVNodXRkb3duRXJyb3IgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbldpbGxTaHV0ZG93biA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdpbGxTaHV0ZG93biA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgd2hlbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB2aWV3ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzVmlld1BhbmUsIHtcblx0XHRpZDogQ0hBTkdFU19WSUVXX0lELFxuXHRcdHRpdGxlOiAnQ2hhbmdlcycsXG5cdFx0bWluaW11bUJvZHlTaXplOiAwLFxuXHRcdG1heGltdW1Cb2R5U2l6ZTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHR9IHNhdGlzZmllcyBJVmlld1BhbmVPcHRpb25zKSk7XG5cblx0dmlldy5yZW5kZXIoKTtcblx0cGFuZVZpZXcuYXBwZW5kQ2hpbGQodmlldy5lbGVtZW50KTtcblx0dmlldy5zZXRWaXNpYmxlKHRydWUpO1xuXHR2aWV3Lm9ydGhvZ29uYWxTaXplID0gVklFV19XSURUSDtcblx0dmlldy5sYXlvdXQoaGVpZ2h0KTtcbn1cblxuY29uc3QgU0FNUExFX0NIQU5HRVMgPSBbXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9jaGFuZ2VzVmlldy50cycsICdtb2RpZmllZCcsIDQyLCAxOCksXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9zZXNzaW9uRmlsZXNXaWRnZXQudHMnLCAnbW9kaWZpZWQnLCAyNCwgOSksXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9tZWRpYS9zZXNzaW9uRmlsZXNXaWRnZXQuY3NzJywgJ21vZGlmaWVkJywgNiwgMiksXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvdGVzdC9icm93c2VyL2NoYW5nZXNWaWV3LmZpeHR1cmUudHMnLCAnYWRkZWQnLCAxMzIsIDApLFxuXHRjcmVhdGVGaWxlQ2hhbmdlKCdzcmMvdnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvb2xkQ2hhbmdlc0xheW91dC50cycsICdkZWxldGVkJywgMCwgNDcpLFxuXTtcblxuY29uc3QgU0FNUExFX09USEVSX0ZJTEVTID0gW1xuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLmNvbmZpZy9jb2RlL3NldHRpbmdzLmpzb24nLCBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCksXG5cdGNyZWF0ZU90aGVyRmlsZSgnL2hvbWUvdXNlci8uY29uZmlnL2NvcGlsb3QvYWdlbnRzL2luYm94LmFnZW50Lm1kJywgU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZCksXG5cdGNyZWF0ZU90aGVyRmlsZSgnL2hvbWUvdXNlci8uY2FjaGUvY29waWxvdC9zZXNzaW9uLmxvZycsIFNlc3Npb25GaWxlT3BlcmF0aW9uLkRlbGV0ZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy90bXAvc2Vzc2lvbi1ub3Rlcy5tZCcsIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLmdpdGNvbmZpZycsIFNlc3Npb25GaWxlT3BlcmF0aW9uLk1vZGlmaWVkKSxcblx0Y3JlYXRlT3RoZXJGaWxlKCcvaG9tZS91c2VyLy5zc2gvY29uZmlnJywgU2Vzc2lvbkZpbGVPcGVyYXRpb24uTW9kaWZpZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLmxvY2FsL3NoYXJlL2NvcGlsb3Qvc3RhdGUuanNvbicsIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLnZzY29kZS1pbnNpZGVycy9hcmd2Lmpzb24nLCBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCksXG5dO1xuXG5jb25zdCBTQU1QTEVfQ0hFQ0tTID0gW1xuXHRjcmVhdGVDaGVjaygxMDAxLCAnTGludXggLyBVbml0IFRlc3RzJywgR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyksXG5cdGNyZWF0ZUNoZWNrKDEwMDIsICdXaW5kb3dzIC8gVW5pdCBUZXN0cycsIEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgR2l0SHViQ2hlY2tDb25jbHVzaW9uLkZhaWx1cmUpLFxuXHRjcmVhdGVDaGVjaygxMDAzLCAnbWFjT1MgLyBTbW9rZSBUZXN0cycsIEdpdEh1YkNoZWNrU3RhdHVzLkluUHJvZ3Jlc3MpLFxuXHRjcmVhdGVDaGVjaygxMDA0LCAnSHlnaWVuZScsIEdpdEh1YkNoZWNrU3RhdHVzLlF1ZXVlZCksXG5cdGNyZWF0ZUNoZWNrKDEwMDUsICdDb21waWxlJywgR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyksXG5dO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnc2Vzc2lvbnMvY2hhbmdlcy8nIH0sIHtcblx0QWxsU2VjdGlvbnNfTGlzdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYW5nZXNWaWV3KGN0eCwge1xuXHRcdFx0dmlld01vZGU6IENoYW5nZXNWaWV3TW9kZS5MaXN0LFxuXHRcdFx0Y2hhbmdlczogU0FNUExFX0NIQU5HRVMsXG5cdFx0XHRvdGhlckZpbGVzOiBTQU1QTEVfT1RIRVJfRklMRVMsXG5cdFx0XHRjaGVja3M6IFNBTVBMRV9DSEVDS1MsXG5cdFx0XHRyZXZpZXdDb21tZW50Q291bnRzOiBuZXcgTWFwKFtbZ2V0Q2hhbmdlVXJpKFNBTVBMRV9DSEFOR0VTWzBdKS5mc1BhdGgsIDJdXSksXG5cdFx0XHRhZ2VudEZlZWRiYWNrQ291bnRzOiBuZXcgTWFwKFtbZ2V0Q2hhbmdlVXJpKFNBTVBMRV9DSEFOR0VTWzFdKS5mc1BhdGgsIDFdXSksXG5cdFx0fSksXG5cdH0pLFxuXG5cdFRyZWVNb2RlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4LCB7XG5cdFx0XHR2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlLlRyZWUsXG5cdFx0XHRjaGFuZ2VzOiBTQU1QTEVfQ0hBTkdFUyxcblx0XHRcdG90aGVyRmlsZXM6IFNBTVBMRV9PVEhFUl9GSUxFUy5zbGljZSgwLCAzKSxcblx0XHRcdGNoZWNrczogU0FNUExFX0NIRUNLUy5zbGljZSgwLCAzKSxcblx0XHR9KSxcblx0fSksXG5cblx0RmlsZXNBbmRDaGVja3NPbmx5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4LCB7XG5cdFx0XHR2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlLkxpc3QsXG5cdFx0XHRjaGFuZ2VzOiBTQU1QTEVfQ0hBTkdFUyxcblx0XHRcdGNoZWNrczogU0FNUExFX0NIRUNLUyxcblx0XHRcdGhlaWdodDogNDQwLFxuXHRcdH0pLFxuXHR9KSxcblxuXHROb0ZpbGVDaGFuZ2VzV2l0aE90aGVyRmlsZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJDaGFuZ2VzVmlldyhjdHgsIHtcblx0XHRcdHZpZXdNb2RlOiBDaGFuZ2VzVmlld01vZGUuTGlzdCxcblx0XHRcdGNoYW5nZXM6IFtdLFxuXHRcdFx0b3RoZXJGaWxlczogU0FNUExFX09USEVSX0ZJTEVTLFxuXHRcdFx0Y2hlY2tzOiBTQU1QTEVfQ0hFQ0tTLnNsaWNlKDAsIDIpLFxuXHRcdFx0aGVpZ2h0OiA0NDAsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEVtcHR5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4LCB7XG5cdFx0XHR2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlLkxpc3QsXG5cdFx0XHRjaGFuZ2VzOiBbXSxcblx0XHRcdG90aGVyRmlsZXM6IFtdLFxuXHRcdFx0Y2hlY2tzOiBbXSxcblx0XHRcdGhlaWdodDogMjgwLFxuXHRcdH0pLFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBOEIsdUJBQXVCO0FBRTlELFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBdUIsb0JBQW9CO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYyxtQkFBbUI7QUFDMUMsU0FBcUIsZ0NBQWdDO0FBRXJELFNBQStDLHdCQUEyRCw2QkFBNkI7QUFDdkksU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsZ0JBQWdCLG1CQUFtQjtBQUMvRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFrQyxzQkFBc0Isd0JBQXdCLDBCQUEwQixpQ0FBaUM7QUFHM0ksU0FBNkIsMkJBQTJCO0FBRXhELFNBQVMsMkJBQTJCLGlCQUFpQixpQkFBaUIscUJBQXFCO0FBRTNGLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsd0JBQXdCLDZCQUE2QjtBQUk5RCxTQUFTLHNC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
