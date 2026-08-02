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
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter } from "../../../../base/common/event.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Memento } from "../../../common/memento.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { URI } from "../../../../base/common/uri.js";
import { joinPath } from "../../../../base/common/resources.js";
import { FileAccess } from "../../../../base/common/network.js";
import { EXTENSION_INSTALL_DEP_PACK_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { walkthroughs } from "../common/gettingStartedContent.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { walkthroughsExtensionPoint } from "./gettingStartedExtensionPoint.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { dirname } from "../../../../base/common/path.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { localize, localize2 } from "../../../../nls.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { checkGlobFileExists } from "../../../services/extensions/common/workspaceContains.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { asWebviewUri } from "../../webview/common/webview.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { extensionDefaultIcon } from "../../../services/extensionManagement/common/extensionsIcons.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
const HasMultipleNewFileEntries = new RawContextKey("hasMultipleNewFileEntries", false);
const IWalkthroughsService = createDecorator("walkthroughsService");
const hiddenEntriesConfigurationKey = "workbench.welcomePage.hiddenCategories";
const walkthroughMetadataConfigurationKey = "workbench.welcomePage.walkthroughMetadata";
const BUILT_IN_SOURCE = localize("builtin", "Built-In");
const DAYS = 24 * 60 * 60 * 1e3;
const NEW_WALKTHROUGH_TIME = 7 * DAYS;
let WalkthroughsService = class extends Disposable {
  constructor(storageService, commandService, instantiationService, workspaceContextService, contextService, userDataSyncEnablementService, configurationService, extensionManagementService, hostService, viewsService, telemetryService, tasExperimentService, layoutService, editorService) {
    super();
    this.storageService = storageService;
    this.commandService = commandService;
    this.instantiationService = instantiationService;
    this.workspaceContextService = workspaceContextService;
    this.contextService = contextService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.configurationService = configurationService;
    this.extensionManagementService = extensionManagementService;
    this.hostService = hostService;
    this.viewsService = viewsService;
    this.telemetryService = telemetryService;
    this.tasExperimentService = tasExperimentService;
    this.layoutService = layoutService;
    this.editorService = editorService;
    this._onDidAddWalkthrough = this._register(new Emitter());
    this.onDidAddWalkthrough = this._onDidAddWalkthrough.event;
    this._onDidRemoveWalkthrough = this._register(new Emitter());
    this.onDidRemoveWalkthrough = this._onDidRemoveWalkthrough.event;
    this._onDidChangeWalkthrough = this._register(new Emitter());
    this.onDidChangeWalkthrough = this._onDidChangeWalkthrough.event;
    this._onDidProgressStep = this._register(new Emitter());
    this.onDidProgressStep = this._onDidProgressStep.event;
    this.sessionEvents = /* @__PURE__ */ new Set();
    this.completionListeners = /* @__PURE__ */ new Map();
    this.gettingStartedContributions = /* @__PURE__ */ new Map();
    this.steps = /* @__PURE__ */ new Map();
    this.sessionInstalledExtensions = /* @__PURE__ */ new Set();
    this.categoryVisibilityContextKeys = /* @__PURE__ */ new Set();
    this.stepCompletionContextKeyExpressions = /* @__PURE__ */ new Set();
    this.stepCompletionContextKeys = /* @__PURE__ */ new Set();
    this.metadata = new Map(
      JSON.parse(
        this.storageService.get(walkthroughMetadataConfigurationKey, StorageScope.PROFILE, "[]")
      )
    );
    this.memento = new Memento("gettingStartedService", this.storageService);
    this.stepProgress = this.memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
    this.initCompletionEventListeners();
    HasMultipleNewFileEntries.bindTo(this.contextService).set(false);
    this.registerWalkthroughs();
  }
  registerWalkthroughs() {
    walkthroughs.forEach(async (category, index) => {
      this._registerWalkthrough({
        ...category,
        icon: { type: "icon", icon: category.icon },
        order: walkthroughs.length - index,
        source: BUILT_IN_SOURCE,
        when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true(),
        steps: category.content.steps.map((step, index2) => {
          return {
            ...step,
            completionEvents: step.completionEvents ?? [],
            description: parseDescription(step.description),
            category: category.id,
            order: index2,
            when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
            media: step.media.type === "image" ? {
              type: "image",
              altText: step.media.altText,
              path: convertInternalMediaPathsToBrowserURIs(step.media.path)
            } : step.media.type === "svg" ? {
              type: "svg",
              altText: step.media.altText,
              path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: "vs/workbench/contrib/welcomeGettingStarted/common/media/" + step.media.path }) })
            } : step.media.type === "markdown" ? {
              type: "markdown",
              path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: "vs/workbench/contrib/welcomeGettingStarted/common/media/" + step.media.path }) }),
              base: FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"),
              root: FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/")
            } : {
              type: "video",
              path: convertRelativeMediaPathsToWebviewURIs(FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"), step.media.path),
              altText: step.media.altText,
              root: FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"),
              poster: step.media.poster ? convertRelativeMediaPathsToWebviewURIs(FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"), step.media.poster) : void 0
            }
          };
        })
      });
    });
    walkthroughsExtensionPoint.setHandler((_, { added, removed }) => {
      added.map((e) => this.registerExtensionWalkthroughContributions(e.description));
      removed.map((e) => this.unregisterExtensionWalkthroughContributions(e.description));
    });
  }
  initCompletionEventListeners() {
    this._register(this.commandService.onDidExecuteCommand((command) => this.progressByEvent(`onCommand:${command.commandId}`)));
    this.extensionManagementService.getInstalled().then((installed) => {
      installed.forEach((ext) => this.progressByEvent(`extensionInstalled:${ext.identifier.id.toLowerCase()}`));
    });
    this._register(this.extensionManagementService.onDidInstallExtensions((result) => {
      for (const e of result) {
        const skipWalkthrough = e?.context?.[EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT] || e?.context?.[EXTENSION_INSTALL_DEP_PACK_CONTEXT];
        if (!skipWalkthrough) {
          this.sessionInstalledExtensions.add(e.identifier.id.toLowerCase());
        }
        this.progressByEvent(`extensionInstalled:${e.identifier.id.toLowerCase()}`);
      }
    }));
    this._register(this.contextService.onDidChangeContext((event) => {
      if (event.affectsSome(this.stepCompletionContextKeys)) {
        this.stepCompletionContextKeyExpressions.forEach((expression) => {
          if (event.affectsSome(new Set(expression.keys())) && this.contextService.contextMatchesRules(expression)) {
            this.progressByEvent(`onContext:` + expression.serialize());
          }
        });
      }
    }));
    this._register(this.viewsService.onDidChangeViewVisibility((e) => {
      if (e.visible) {
        this.progressByEvent("onView:" + e.id);
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      e.affectedKeys.forEach((key) => {
        this.progressByEvent("onSettingChanged:" + key);
      });
    }));
    if (this.userDataSyncEnablementService.isEnabled()) {
      this.progressByEvent("onEvent:sync-enabled");
    }
    this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
      if (this.userDataSyncEnablementService.isEnabled()) {
        this.progressByEvent("onEvent:sync-enabled");
      }
    }));
  }
  markWalkthroughOpened(id) {
    const walkthrough = this.gettingStartedContributions.get(id);
    const prior = this.metadata.get(id);
    if (prior && walkthrough) {
      this.metadata.set(id, { ...prior, manaullyOpened: true, stepIDs: walkthrough.steps.map((s) => s.id) });
    }
    this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.PROFILE, StorageTarget.USER);
  }
  async registerExtensionWalkthroughContributions(extension) {
    const convertExtensionPathToFileURI = (path) => path.startsWith("https://") ? URI.parse(path, true) : FileAccess.uriToFileUri(joinPath(extension.extensionLocation, path));
    const convertExtensionRelativePathsToBrowserURIs = (path) => {
      const convertPath = (path2) => path2.startsWith("https://") ? URI.parse(path2, true) : FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, path2));
      if (typeof path === "string") {
        const converted = convertPath(path);
        return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
      } else {
        return {
          hcDark: convertPath(path.hc),
          hcLight: convertPath(path.hcLight ?? path.light),
          light: convertPath(path.light),
          dark: convertPath(path.dark)
        };
      }
    };
    if (!extension.contributes?.walkthroughs?.length) {
      return;
    }
    let sectionToOpen;
    let sectionToOpenIndex = Math.min();
    await Promise.all(extension.contributes?.walkthroughs?.map(async (walkthrough, index) => {
      const categoryID = extension.identifier.value + "#" + walkthrough.id;
      const isNewlyInstalled = !this.metadata.get(categoryID);
      if (isNewlyInstalled) {
        this.metadata.set(categoryID, { firstSeen: +/* @__PURE__ */ new Date(), stepIDs: walkthrough.steps?.map((s) => s.id) ?? [], manaullyOpened: false });
      }
      const override = await Promise.race([
        this.tasExperimentService?.getTreatment(`gettingStarted.overrideCategory.${extension.identifier.value + "." + walkthrough.id}.when`),
        new Promise((resolve) => setTimeout(() => resolve(walkthrough.when), 5e3))
      ]);
      if (this.sessionInstalledExtensions.has(extension.identifier.value.toLowerCase()) && this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true())) {
        this.sessionInstalledExtensions.delete(extension.identifier.value.toLowerCase());
        if (index < sectionToOpenIndex && isNewlyInstalled) {
          sectionToOpen = categoryID;
          sectionToOpenIndex = index;
        }
      }
      const steps = (walkthrough.steps ?? []).map((step, index2) => {
        const description = parseDescription(step.description || "");
        const fullyQualifiedID = extension.identifier.value + "#" + walkthrough.id + "#" + step.id;
        let media;
        if (!step.media) {
          throw Error("missing media in walkthrough step: " + walkthrough.id + "@" + step.id);
        }
        if (step.media.image) {
          const altText = step.media.altText;
          if (altText === void 0) {
            console.error("Walkthrough item:", fullyQualifiedID, "is missing altText for its media element.");
          }
          media = { type: "image", altText, path: convertExtensionRelativePathsToBrowserURIs(step.media.image) };
        } else if (step.media.markdown) {
          media = {
            type: "markdown",
            path: convertExtensionPathToFileURI(step.media.markdown),
            base: convertExtensionPathToFileURI(dirname(step.media.markdown)),
            root: FileAccess.uriToFileUri(extension.extensionLocation)
          };
        } else if (step.media.svg) {
          media = {
            type: "svg",
            path: convertExtensionPathToFileURI(step.media.svg),
            altText: step.media.svg
          };
        } else if (step.media.video) {
          const baseURI = FileAccess.uriToFileUri(extension.extensionLocation);
          media = {
            type: "video",
            path: convertRelativeMediaPathsToWebviewURIs(baseURI, step.media.video),
            root: FileAccess.uriToFileUri(extension.extensionLocation),
            altText: step.media.altText,
            poster: step.media.poster ? convertRelativeMediaPathsToWebviewURIs(baseURI, step.media.poster) : void 0
          };
        } else {
          throw new Error("Unknown walkthrough format detected for " + fullyQualifiedID);
        }
        return {
          description,
          media,
          completionEvents: step.completionEvents?.filter((x) => typeof x === "string") ?? [],
          id: fullyQualifiedID,
          title: step.title,
          when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
          category: categoryID,
          order: index2
        };
      });
      let isFeatured = false;
      if (walkthrough.featuredFor) {
        const folders = this.workspaceContextService.getWorkspace().folders.map((f) => f.uri);
        const token = new CancellationTokenSource();
        setTimeout(() => token.cancel(), 2e3);
        isFeatured = await this.instantiationService.invokeFunction((a) => checkGlobFileExists(a, folders, walkthrough.featuredFor, token.token));
      }
      const iconStr = walkthrough.icon ?? extension.icon;
      const walkthoughDescriptor = {
        description: walkthrough.description,
        title: walkthrough.title,
        id: categoryID,
        isFeatured,
        source: extension.displayName ?? extension.name,
        order: 0,
        walkthroughPageTitle: extension.displayName ?? extension.name,
        steps,
        icon: iconStr ? {
          type: "image",
          path: FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, iconStr)).toString(true)
        } : {
          icon: extensionDefaultIcon,
          type: "icon"
        },
        when: ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true()
      };
      this._registerWalkthrough(walkthoughDescriptor);
      this._onDidAddWalkthrough.fire(this.resolveWalkthrough(walkthoughDescriptor));
    }));
    this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.PROFILE, StorageTarget.USER);
    const hadLastFoucs = await this.hostService.hadLastFocus();
    const startupEditor = this.configurationService.getValue("workbench.startupEditor");
    if (hadLastFoucs && sectionToOpen && this.configurationService.getValue("workbench.welcomePage.walkthroughs.openOnInstall") && startupEditor !== "agentSessionsWelcomePage") {
      this.telemetryService.publicLog2("gettingStarted.didAutoOpenWalkthrough", { id: sectionToOpen });
      const activeEditor = this.editorService.activeEditor;
      if (activeEditor instanceof GettingStartedInput) {
        this.commandService.executeCommand("workbench.action.keepEditor");
      }
      this.commandService.executeCommand("workbench.action.openWalkthrough", sectionToOpen, {
        inactive: this.layoutService.hasFocus(Parts.EDITOR_PART)
        // do not steal the active editor away
      });
    }
  }
  unregisterExtensionWalkthroughContributions(extension) {
    if (!extension.contributes?.walkthroughs?.length) {
      return;
    }
    extension.contributes?.walkthroughs?.forEach((section) => {
      const categoryID = extension.identifier.value + "#" + section.id;
      section.steps.forEach((step) => {
        const fullyQualifiedID = extension.identifier.value + "#" + section.id + "#" + step.id;
        this.steps.delete(fullyQualifiedID);
      });
      this.gettingStartedContributions.delete(categoryID);
      this._onDidRemoveWalkthrough.fire(categoryID);
    });
  }
  getWalkthrough(id) {
    const walkthrough = this.gettingStartedContributions.get(id);
    if (!walkthrough) {
      throw Error("Trying to get unknown walkthrough: " + id);
    }
    return this.resolveWalkthrough(walkthrough);
  }
  getWalkthroughs() {
    const registeredCategories = [...this.gettingStartedContributions.values()];
    const categoriesWithCompletion = registeredCategories.map((category) => {
      return {
        ...category,
        content: {
          type: "steps",
          steps: category.steps
        }
      };
    }).filter((category) => category.content.type !== "steps" || category.content.steps.length).filter((category) => category.id !== "NewWelcomeExperience").map((category) => this.resolveWalkthrough(category));
    return categoriesWithCompletion;
  }
  resolveWalkthrough(category) {
    const stepsWithProgress = category.steps.map((step) => this.getStepProgress(step));
    const hasOpened = this.metadata.get(category.id)?.manaullyOpened;
    const firstSeenDate = this.metadata.get(category.id)?.firstSeen;
    const isNew = firstSeenDate && firstSeenDate > +/* @__PURE__ */ new Date() - NEW_WALKTHROUGH_TIME;
    const lastStepIDs = this.metadata.get(category.id)?.stepIDs;
    const rawCategory = this.gettingStartedContributions.get(category.id);
    if (!rawCategory) {
      throw Error("Could not find walkthrough with id " + category.id);
    }
    const currentStepIds = rawCategory.steps.map((s) => s.id);
    const hasNewSteps = lastStepIDs && (currentStepIds.length !== lastStepIDs.length || currentStepIds.some((id, index) => id !== lastStepIDs[index]));
    let recencyBonus = 0;
    if (firstSeenDate) {
      const currentDate = +/* @__PURE__ */ new Date();
      const timeSinceFirstSeen = currentDate - firstSeenDate;
      recencyBonus = Math.max(0, (NEW_WALKTHROUGH_TIME - timeSinceFirstSeen) / NEW_WALKTHROUGH_TIME);
    }
    return {
      ...category,
      recencyBonus,
      steps: stepsWithProgress,
      newItems: !!hasNewSteps,
      newEntry: !!(isNew && !hasOpened)
    };
  }
  getStepProgress(step) {
    return {
      ...step,
      done: false,
      ...this.stepProgress[step.id]
    };
  }
  progressStep(id) {
    const oldProgress = this.stepProgress[id];
    if (!oldProgress || oldProgress.done !== true) {
      this.stepProgress[id] = { done: true };
      this.memento.saveMemento();
      const step = this.getStep(id);
      if (!step) {
        throw Error("Tried to progress unknown step");
      }
      this._onDidProgressStep.fire(this.getStepProgress(step));
    }
  }
  deprogressStep(id) {
    delete this.stepProgress[id];
    this.memento.saveMemento();
    const step = this.getStep(id);
    this._onDidProgressStep.fire(this.getStepProgress(step));
  }
  progressByEvent(event) {
    if (this.sessionEvents.has(event)) {
      return;
    }
    this.sessionEvents.add(event);
    this.completionListeners.get(event)?.forEach((id) => this.progressStep(id));
  }
  registerWalkthrough(walkthoughDescriptor) {
    this._registerWalkthrough({
      ...walkthoughDescriptor,
      steps: walkthoughDescriptor.steps.map((step) => ({ ...step, description: parseDescription(step.description) }))
    });
  }
  _registerWalkthrough(walkthroughDescriptor) {
    const oldCategory = this.gettingStartedContributions.get(walkthroughDescriptor.id);
    if (oldCategory) {
      console.error(`Skipping attempt to overwrite walkthrough. (${walkthroughDescriptor.id})`);
      return;
    }
    this.gettingStartedContributions.set(walkthroughDescriptor.id, walkthroughDescriptor);
    walkthroughDescriptor.steps.forEach((step) => {
      if (this.steps.has(step.id)) {
        throw Error("Attempting to register step with id " + step.id + " twice. Second is dropped.");
      }
      this.steps.set(step.id, step);
      step.when.keys().forEach((key) => this.categoryVisibilityContextKeys.add(key));
      this.registerDoneListeners(step);
    });
    walkthroughDescriptor.when.keys().forEach((key) => this.categoryVisibilityContextKeys.add(key));
  }
  registerDoneListeners(step) {
    if (step.doneOn) {
      console.error(`wakthrough step`, step, `uses deprecated 'doneOn' property. Adopt 'completionEvents' to silence this warning`);
      return;
    }
    if (!step.completionEvents.length) {
      step.completionEvents = coalesce(
        step.description.filter((linkedText) => linkedText.nodes.length === 1).flatMap((linkedText) => linkedText.nodes.filter(((node) => typeof node !== "string")).map(({ href }) => {
          if (href.startsWith("command:")) {
            return "onCommand:" + href.slice("command:".length, href.includes("?") ? href.indexOf("?") : void 0);
          }
          if (href.startsWith("https://") || href.startsWith("http://")) {
            return "onLink:" + href;
          }
          return void 0;
        }))
      );
    }
    if (!step.completionEvents.length) {
      step.completionEvents.push("stepSelected");
    }
    for (let event of step.completionEvents) {
      const [_, eventType, argument] = /^([^:]*):?(.*)$/.exec(event) ?? [];
      if (!eventType) {
        console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
        continue;
      }
      switch (eventType) {
        case "onLink":
        case "onEvent":
        case "onView":
        case "onSettingChanged":
          break;
        case "onContext": {
          const expression = ContextKeyExpr.deserialize(argument);
          if (expression) {
            this.stepCompletionContextKeyExpressions.add(expression);
            expression.keys().forEach((key) => this.stepCompletionContextKeys.add(key));
            event = eventType + ":" + expression.serialize();
            if (this.contextService.contextMatchesRules(expression)) {
              this.sessionEvents.add(event);
            }
          } else {
            console.error("Unable to parse context key expression:", expression, "in walkthrough step", step.id);
          }
          break;
        }
        case "onStepSelected":
        case "stepSelected":
          event = "stepSelected:" + step.id;
          break;
        case "onCommand":
          event = eventType + ":" + argument.replace(/^toSide:/, "");
          break;
        case "onExtensionInstalled":
        case "extensionInstalled":
          event = "extensionInstalled:" + argument.toLowerCase();
          break;
        default:
          console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
          continue;
      }
      this.registerCompletionListener(event, step);
    }
  }
  registerCompletionListener(event, step) {
    if (!this.completionListeners.has(event)) {
      this.completionListeners.set(event, /* @__PURE__ */ new Set());
    }
    this.completionListeners.get(event)?.add(step.id);
  }
  getStep(id) {
    const step = this.steps.get(id);
    if (!step) {
      throw Error("Attempting to access step which does not exist in registry " + id);
    }
    return step;
  }
};
WalkthroughsService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IUserDataSyncEnablementService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionManagementService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IWorkbenchAssignmentService),
  __decorateParam(12, IWorkbenchLayoutService),
  __decorateParam(13, IEditorService)
], WalkthroughsService);
const parseDescription = (desc) => desc.split("\n").filter((x) => x).map((text) => parseLinkedText(text));
const convertInternalMediaPathToFileURI = (path) => path.startsWith("https://") ? URI.parse(path, true) : FileAccess.asFileUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathToBrowserURI = (path) => path.startsWith("https://") ? URI.parse(path, true) : FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathsToBrowserURIs = (path) => {
  if (typeof path === "string") {
    const converted = convertInternalMediaPathToBrowserURI(path);
    return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
  } else {
    return {
      hcDark: convertInternalMediaPathToBrowserURI(path.hc),
      hcLight: convertInternalMediaPathToBrowserURI(path.hcLight ?? path.light),
      light: convertInternalMediaPathToBrowserURI(path.light),
      dark: convertInternalMediaPathToBrowserURI(path.dark)
    };
  }
};
const convertRelativeMediaPathsToWebviewURIs = (basePath, path) => {
  const convertPath = (path2) => path2.startsWith("https://") ? URI.parse(path2, true) : asWebviewUri(joinPath(basePath, path2));
  if (typeof path === "string") {
    const converted = convertPath(path);
    return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
  } else {
    return {
      hcDark: convertPath(path.hc),
      hcLight: convertPath(path.hcLight ?? path.light),
      light: convertPath(path.light),
      dark: convertPath(path.dark)
    };
  }
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "resetGettingStartedProgress",
      category: localize2("developer", "Developer"),
      title: localize2("resetWelcomePageWalkthroughProgress", "Reset Welcome Page Walkthrough Progress"),
      f1: true,
      metadata: {
        description: localize2("resetGettingStartedProgressDescription", "Reset the progress of all Walkthrough steps on the Welcome Page to make them appear as if they are being viewed for the first time, providing a fresh start to the getting started experience.")
      }
    });
  }
  run(accessor) {
    const gettingStartedService = accessor.get(IWalkthroughsService);
    const storageService = accessor.get(IStorageService);
    storageService.store(
      hiddenEntriesConfigurationKey,
      JSON.stringify([]),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
    storageService.store(
      walkthroughMetadataConfigurationKey,
      JSON.stringify([]),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
    const memento = new Memento("gettingStartedService", accessor.get(IStorageService));
    const record = memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        try {
          gettingStartedService.deprogressStep(key);
        } catch (e) {
          console.error(e);
        }
      }
    }
    memento.saveMemento();
  }
});
registerSingleton(IWalkthroughsService, WalkthroughsService, InstantiationType.Delayed);
export {
  HasMultipleNewFileEntries,
  IWalkthroughsService,
  WalkthroughsService,
  convertInternalMediaPathToFileURI,
  hiddenEntriesConfigurationKey,
  parseDescription,
  walkthroughMetadataConfigurationKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lOU1RBTExfREVQX1BBQ0tfQ09OVEVYVCwgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhULCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyB3YWxrdGhyb3VnaHMgfSBmcm9tICcuLi9jb21tb24vZ2V0dGluZ1N0YXJ0ZWRDb250ZW50LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpbmssIExpbmtlZFRleHQsIHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgd2Fsa3Rocm91Z2hzRXh0ZW5zaW9uUG9pbnQgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkRXh0ZW5zaW9uUG9pbnQuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgY2hlY2tHbG9iRmlsZUV4aXN0cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3dvcmtzcGFjZUNvbnRhaW5zLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGFzV2Vidmlld1VyaSB9IGZyb20gJy4uLy4uL3dlYnZpZXcvY29tbW9uL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBleHRlbnNpb25EZWZhdWx0SWNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZElucHV0IH0gZnJvbSAnLi9nZXR0aW5nU3RhcnRlZElucHV0LmpzJztcblxuZXhwb3J0IGNvbnN0IEhhc011bHRpcGxlTmV3RmlsZUVudHJpZXMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaGFzTXVsdGlwbGVOZXdGaWxlRW50cmllcycsIGZhbHNlKTtcblxuZXhwb3J0IGNvbnN0IElXYWxrdGhyb3VnaHNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElXYWxrdGhyb3VnaHNTZXJ2aWNlPignd2Fsa3Rocm91Z2hzU2VydmljZScpO1xuXG5leHBvcnQgY29uc3QgaGlkZGVuRW50cmllc0NvbmZpZ3VyYXRpb25LZXkgPSAnd29ya2JlbmNoLndlbGNvbWVQYWdlLmhpZGRlbkNhdGVnb3JpZXMnO1xuXG5leHBvcnQgY29uc3Qgd2Fsa3Rocm91Z2hNZXRhZGF0YUNvbmZpZ3VyYXRpb25LZXkgPSAnd29ya2JlbmNoLndlbGNvbWVQYWdlLndhbGt0aHJvdWdoTWV0YWRhdGEnO1xuZXhwb3J0IHR5cGUgV2Fsa3Rocm91Z2hNZXRhRGF0YVR5cGUgPSBNYXA8c3RyaW5nLCB7IGZpcnN0U2VlbjogbnVtYmVyOyBzdGVwSURzOiBzdHJpbmdbXTsgbWFuYXVsbHlPcGVuZWQ6IGJvb2xlYW4gfT47XG5cbmNvbnN0IEJVSUxUX0lOX1NPVVJDRSA9IGxvY2FsaXplKCdidWlsdGluJywgXCJCdWlsdC1JblwiKTtcblxuZXhwb3J0IGludGVyZmFjZSBJV2Fsa3Rocm91Z2gge1xuXHRpZDogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRvcmRlcjogbnVtYmVyO1xuXHRzb3VyY2U6IHN0cmluZztcblx0aXNGZWF0dXJlZDogYm9vbGVhbjtcblx0bmV4dD86IHN0cmluZztcblx0d2hlbjogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdHN0ZXBzOiBJV2Fsa3Rocm91Z2hTdGVwW107XG5cdGljb246XG5cdHwgeyB0eXBlOiAnaWNvbic7IGljb246IFRoZW1lSWNvbiB9XG5cdHwgeyB0eXBlOiAnaW1hZ2UnOyBwYXRoOiBzdHJpbmcgfTtcblx0d2Fsa3Rocm91Z2hQYWdlVGl0bGU6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgSVdhbGt0aHJvdWdoTG9vc2UgPSBPbWl0PElXYWxrdGhyb3VnaCwgJ3N0ZXBzJz4gJiB7IHN0ZXBzOiAoT21pdDxJV2Fsa3Rocm91Z2hTdGVwLCAnZGVzY3JpcHRpb24nPiAmIHsgZGVzY3JpcHRpb246IHN0cmluZyB9KVtdIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkV2Fsa3Rocm91Z2ggZXh0ZW5kcyBJV2Fsa3Rocm91Z2gge1xuXHRzdGVwczogSVJlc29sdmVkV2Fsa3Rocm91Z2hTdGVwW107XG5cdG5ld0l0ZW1zOiBib29sZWFuO1xuXHRyZWNlbmN5Qm9udXM6IG51bWJlcjtcblx0bmV3RW50cnk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdhbGt0aHJvdWdoU3RlcCB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBMaW5rZWRUZXh0W107XG5cdGNhdGVnb3J5OiBzdHJpbmc7XG5cdHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRvcmRlcjogbnVtYmVyO1xuXHRjb21wbGV0aW9uRXZlbnRzOiBzdHJpbmdbXTtcblx0bWVkaWE6XG5cdHwgeyB0eXBlOiAnaW1hZ2UnOyBwYXRoOiB7IGhjRGFyazogVVJJOyBoY0xpZ2h0OiBVUkk7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9OyBhbHRUZXh0OiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ3N2Zyc7IHBhdGg6IFVSSTsgYWx0VGV4dDogc3RyaW5nIH1cblx0fCB7IHR5cGU6ICdtYXJrZG93bic7IHBhdGg6IFVSSTsgYmFzZTogVVJJOyByb290OiBVUkkgfVxuXHR8IHsgdHlwZTogJ3ZpZGVvJzsgcGF0aDogeyBoY0Rhcms6IFVSSTsgaGNMaWdodDogVVJJOyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfTsgcG9zdGVyPzogeyBoY0Rhcms6IFVSSTsgaGNMaWdodDogVVJJOyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfTsgcm9vdDogVVJJOyBhbHRUZXh0OiBzdHJpbmcgfTtcbn1cblxudHlwZSBTdGVwUHJvZ3Jlc3MgPSB7IGRvbmU6IGJvb2xlYW4gfTtcblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXAgZXh0ZW5kcyBJV2Fsa3Rocm91Z2hTdGVwLCBTdGVwUHJvZ3Jlc3MgeyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdhbGt0aHJvdWdoc1NlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRBZGRXYWxrdGhyb3VnaDogRXZlbnQ8SVJlc29sdmVkV2Fsa3Rocm91Z2g+O1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZVdhbGt0aHJvdWdoOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVdhbGt0aHJvdWdoOiBFdmVudDxJUmVzb2x2ZWRXYWxrdGhyb3VnaD47XG5cdHJlYWRvbmx5IG9uRGlkUHJvZ3Jlc3NTdGVwOiBFdmVudDxJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXA+O1xuXG5cdGdldFdhbGt0aHJvdWdocygpOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFtdO1xuXHRnZXRXYWxrdGhyb3VnaChpZDogc3RyaW5nKTogSVJlc29sdmVkV2Fsa3Rocm91Z2g7XG5cblx0cmVnaXN0ZXJXYWxrdGhyb3VnaChkZXNjcmlwdG9yOiBJV2Fsa3Rocm91Z2hMb29zZSk6IHZvaWQ7XG5cblx0cHJvZ3Jlc3NCeUV2ZW50KGV2ZW50TmFtZTogc3RyaW5nKTogdm9pZDtcblx0cHJvZ3Jlc3NTdGVwKGlkOiBzdHJpbmcpOiB2b2lkO1xuXHRkZXByb2dyZXNzU3RlcChpZDogc3RyaW5nKTogdm9pZDtcblxuXHRtYXJrV2Fsa3Rocm91Z2hPcGVuZWQoaWQ6IHN0cmluZyk6IHZvaWQ7XG59XG5cbi8vIFNob3cgd2Fsa3Rocm91Z2ggYXMgXCJuZXdcIiBmb3IgNyBkYXlzIGFmdGVyIGZpcnN0IGluc3RhbGxcbmNvbnN0IERBWVMgPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuY29uc3QgTkVXX1dBTEtUSFJPVUdIX1RJTUUgPSA3ICogREFZUztcblxuZXhwb3J0IGNsYXNzIFdhbGt0aHJvdWdoc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdhbGt0aHJvdWdoc1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZFdhbGt0aHJvdWdoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlc29sdmVkV2Fsa3Rocm91Z2g+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZFdhbGt0aHJvdWdoOiBFdmVudDxJUmVzb2x2ZWRXYWxrdGhyb3VnaD4gPSB0aGlzLl9vbkRpZEFkZFdhbGt0aHJvdWdoLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZVdhbGt0aHJvdWdoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVXYWxrdGhyb3VnaDogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkUmVtb3ZlV2Fsa3Rocm91Z2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV2Fsa3Rocm91Z2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVzb2x2ZWRXYWxrdGhyb3VnaD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2Fsa3Rocm91Z2g6IEV2ZW50PElSZXNvbHZlZFdhbGt0aHJvdWdoPiA9IHRoaXMuX29uRGlkQ2hhbmdlV2Fsa3Rocm91Z2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZ3Jlc3NTdGVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlc29sdmVkV2Fsa3Rocm91Z2hTdGVwPigpKTtcblx0cmVhZG9ubHkgb25EaWRQcm9ncmVzc1N0ZXA6IEV2ZW50PElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcD4gPSB0aGlzLl9vbkRpZFByb2dyZXNzU3RlcC5ldmVudDtcblxuXHRwcml2YXRlIG1lbWVudG86IE1lbWVudG88UmVjb3JkPHN0cmluZywgU3RlcFByb2dyZXNzIHwgdW5kZWZpbmVkPj47XG5cdHByaXZhdGUgc3RlcFByb2dyZXNzOiBSZWNvcmQ8c3RyaW5nLCBTdGVwUHJvZ3Jlc3MgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgc2Vzc2lvbkV2ZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIGNvbXBsZXRpb25MaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG5cblx0cHJpdmF0ZSBnZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVdhbGt0aHJvdWdoPigpO1xuXHRwcml2YXRlIHN0ZXBzID0gbmV3IE1hcDxzdHJpbmcsIElXYWxrdGhyb3VnaFN0ZXA+KCk7XG5cblx0cHJpdmF0ZSBzZXNzaW9uSW5zdGFsbGVkRXh0ZW5zaW9uczogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIGNhdGVnb3J5VmlzaWJpbGl0eUNvbnRleHRLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgc3RlcENvbXBsZXRpb25Db250ZXh0S2V5RXhwcmVzc2lvbnMgPSBuZXcgU2V0PENvbnRleHRLZXlFeHByZXNzaW9uPigpO1xuXHRwcml2YXRlIHN0ZXBDb21wbGV0aW9uQ29udGV4dEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIG1ldGFkYXRhOiBXYWxrdGhyb3VnaE1ldGFEYXRhVHlwZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGFzRXhwZXJpbWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5tZXRhZGF0YSA9IG5ldyBNYXAoXG5cdFx0XHRKU09OLnBhcnNlKFxuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCh3YWxrdGhyb3VnaE1ldGFkYXRhQ29uZmlndXJhdGlvbktleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpKSk7XG5cblx0XHR0aGlzLm1lbWVudG8gPSBuZXcgTWVtZW50bygnZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlJywgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5zdGVwUHJvZ3Jlc3MgPSB0aGlzLm1lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdHRoaXMuaW5pdENvbXBsZXRpb25FdmVudExpc3RlbmVycygpO1xuXG5cdFx0SGFzTXVsdGlwbGVOZXdGaWxlRW50cmllcy5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyV2Fsa3Rocm91Z2hzKCk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJXYWxrdGhyb3VnaHMoKSB7XG5cblx0XHR3YWxrdGhyb3VnaHMuZm9yRWFjaChhc3luYyAoY2F0ZWdvcnksIGluZGV4KSA9PiB7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyV2Fsa3Rocm91Z2goe1xuXHRcdFx0XHQuLi5jYXRlZ29yeSxcblx0XHRcdFx0aWNvbjogeyB0eXBlOiAnaWNvbicsIGljb246IGNhdGVnb3J5Lmljb24gfSxcblx0XHRcdFx0b3JkZXI6IHdhbGt0aHJvdWdocy5sZW5ndGggLSBpbmRleCxcblx0XHRcdFx0c291cmNlOiBCVUlMVF9JTl9TT1VSQ0UsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGNhdGVnb3J5LndoZW4pID8/IENvbnRleHRLZXlFeHByLnRydWUoKSxcblx0XHRcdFx0c3RlcHM6XG5cdFx0XHRcdFx0Y2F0ZWdvcnkuY29udGVudC5zdGVwcy5tYXAoKHN0ZXAsIGluZGV4KSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gKHtcblx0XHRcdFx0XHRcdFx0Li4uc3RlcCxcblx0XHRcdFx0XHRcdFx0Y29tcGxldGlvbkV2ZW50czogc3RlcC5jb21wbGV0aW9uRXZlbnRzID8/IFtdLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcGFyc2VEZXNjcmlwdGlvbihzdGVwLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IGNhdGVnb3J5LmlkLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogaW5kZXgsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHN0ZXAud2hlbikgPz8gQ29udGV4dEtleUV4cHIudHJ1ZSgpLFxuXHRcdFx0XHRcdFx0XHRtZWRpYTogc3RlcC5tZWRpYS50eXBlID09PSAnaW1hZ2UnXG5cdFx0XHRcdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnaW1hZ2UnLFxuXHRcdFx0XHRcdFx0XHRcdFx0YWx0VGV4dDogc3RlcC5tZWRpYS5hbHRUZXh0LFxuXHRcdFx0XHRcdFx0XHRcdFx0cGF0aDogY29udmVydEludGVybmFsTWVkaWFQYXRoc1RvQnJvd3NlclVSSXMoc3RlcC5tZWRpYS5wYXRoKVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHQ6IHN0ZXAubWVkaWEudHlwZSA9PT0gJ3N2Zydcblx0XHRcdFx0XHRcdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0YWx0VGV4dDogc3RlcC5tZWRpYS5hbHRUZXh0LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhUb0ZpbGVVUkkoc3RlcC5tZWRpYS5wYXRoKS53aXRoKHsgcXVlcnk6IEpTT04uc3RyaW5naWZ5KHsgbW9kdWxlSWQ6ICd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLycgKyBzdGVwLm1lZGlhLnBhdGggfSkgfSlcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdDogc3RlcC5tZWRpYS50eXBlID09PSAnbWFya2Rvd24nXG5cdFx0XHRcdFx0XHRcdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cGF0aDogY29udmVydEludGVybmFsTWVkaWFQYXRoVG9GaWxlVVJJKHN0ZXAubWVkaWEucGF0aCkud2l0aCh7IHF1ZXJ5OiBKU09OLnN0cmluZ2lmeSh7IG1vZHVsZUlkOiAndnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS8nICsgc3RlcC5tZWRpYS5wYXRoIH0pIH0pLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJhc2U6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJvb3Q6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICd2aWRlbycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cGF0aDogY29udmVydFJlbGF0aXZlTWVkaWFQYXRoc1RvV2Vidmlld1VSSXMoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJyksIHN0ZXAubWVkaWEucGF0aCksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YWx0VGV4dDogc3RlcC5tZWRpYS5hbHRUZXh0LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJvb3Q6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHBvc3Rlcjogc3RlcC5tZWRpYS5wb3N0ZXIgPyBjb252ZXJ0UmVsYXRpdmVNZWRpYVBhdGhzVG9XZWJ2aWV3VVJJcyhGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS8nKSwgc3RlcC5tZWRpYS5wb3N0ZXIpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR3YWxrdGhyb3VnaHNFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChfLCB7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdGFkZGVkLm1hcChlID0+IHRoaXMucmVnaXN0ZXJFeHRlbnNpb25XYWxrdGhyb3VnaENvbnRyaWJ1dGlvbnMoZS5kZXNjcmlwdGlvbikpO1xuXHRcdFx0cmVtb3ZlZC5tYXAoZSA9PiB0aGlzLnVucmVnaXN0ZXJFeHRlbnNpb25XYWxrdGhyb3VnaENvbnRyaWJ1dGlvbnMoZS5kZXNjcmlwdGlvbikpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0Q29tcGxldGlvbkV2ZW50TGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tbWFuZFNlcnZpY2Uub25EaWRFeGVjdXRlQ29tbWFuZChjb21tYW5kID0+IHRoaXMucHJvZ3Jlc3NCeUV2ZW50KGBvbkNvbW1hbmQ6JHtjb21tYW5kLmNvbW1hbmRJZH1gKSkpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKS50aGVuKGluc3RhbGxlZCA9PiB7XG5cdFx0XHRpbnN0YWxsZWQuZm9yRWFjaChleHQgPT4gdGhpcy5wcm9ncmVzc0J5RXZlbnQoYGV4dGVuc2lvbkluc3RhbGxlZDoke2V4dC5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCl9YCkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zKChyZXN1bHQpID0+IHtcblxuXHRcdFx0Zm9yIChjb25zdCBlIG9mIHJlc3VsdCkge1xuXHRcdFx0XHRjb25zdCBza2lwV2Fsa3Rocm91Z2ggPSBlPy5jb250ZXh0Py5bRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhUXSB8fCBlPy5jb250ZXh0Py5bRVhURU5TSU9OX0lOU1RBTExfREVQX1BBQ0tfQ09OVEVYVF07XG5cdFx0XHRcdC8vIElmIHRoZSB3aW5kb3cgaGFkIGxhc3QgZm9jdXMgYW5kIHRoZSBpbnN0YWxsIGRpZG4ndCBzcGVjaWZ5IHRvIHNraXAgdGhlIHdhbGt0aHJvdWdoXG5cdFx0XHRcdC8vIFRoZW4gYWRkIGl0IHRvIHRoZSBzZXNzaW9uSW5zdGFsbEV4dGVuc2lvbnMgdG8gYmUgb3BlbmVkXG5cdFx0XHRcdGlmICghc2tpcFdhbGt0aHJvdWdoKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXNzaW9uSW5zdGFsbGVkRXh0ZW5zaW9ucy5hZGQoZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3NCeUV2ZW50KGBleHRlbnNpb25JbnN0YWxsZWQ6JHtlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX1gKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuYWZmZWN0c1NvbWUodGhpcy5zdGVwQ29tcGxldGlvbkNvbnRleHRLZXlzKSkge1xuXHRcdFx0XHR0aGlzLnN0ZXBDb21wbGV0aW9uQ29udGV4dEtleUV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNTb21lKG5ldyBTZXQoZXhwcmVzc2lvbi5rZXlzKCkpKSAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZXhwcmVzc2lvbikpIHtcblx0XHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NCeUV2ZW50KGBvbkNvbnRleHQ6YCArIGV4cHJlc3Npb24uc2VyaWFsaXplKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3c1NlcnZpY2Uub25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLnZpc2libGUpIHsgdGhpcy5wcm9ncmVzc0J5RXZlbnQoJ29uVmlldzonICsgZS5pZCk7IH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGUuYWZmZWN0ZWRLZXlzLmZvckVhY2goa2V5ID0+IHsgdGhpcy5wcm9ncmVzc0J5RXZlbnQoJ29uU2V0dGluZ0NoYW5nZWQ6JyArIGtleSk7IH0pO1xuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7IHRoaXMucHJvZ3Jlc3NCeUV2ZW50KCdvbkV2ZW50OnN5bmMtZW5hYmxlZCcpOyB9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHsgdGhpcy5wcm9ncmVzc0J5RXZlbnQoJ29uRXZlbnQ6c3luYy1lbmFibGVkJyk7IH1cblx0XHR9KSk7XG5cdH1cblxuXHRtYXJrV2Fsa3Rocm91Z2hPcGVuZWQoaWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHdhbGt0aHJvdWdoID0gdGhpcy5nZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMuZ2V0KGlkKTtcblx0XHRjb25zdCBwcmlvciA9IHRoaXMubWV0YWRhdGEuZ2V0KGlkKTtcblx0XHRpZiAocHJpb3IgJiYgd2Fsa3Rocm91Z2gpIHtcblx0XHRcdHRoaXMubWV0YWRhdGEuc2V0KGlkLCB7IC4uLnByaW9yLCBtYW5hdWxseU9wZW5lZDogdHJ1ZSwgc3RlcElEczogd2Fsa3Rocm91Z2guc3RlcHMubWFwKHMgPT4gcy5pZCkgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh3YWxrdGhyb3VnaE1ldGFkYXRhQ29uZmlndXJhdGlvbktleSwgSlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMubWV0YWRhdGEuZW50cmllcygpXSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWdpc3RlckV4dGVuc2lvbldhbGt0aHJvdWdoQ29udHJpYnV0aW9ucyhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbikge1xuXHRcdGNvbnN0IGNvbnZlcnRFeHRlbnNpb25QYXRoVG9GaWxlVVJJID0gKHBhdGg6IHN0cmluZykgPT4gcGF0aC5zdGFydHNXaXRoKCdodHRwczovLycpXG5cdFx0XHQ/IFVSSS5wYXJzZShwYXRoLCB0cnVlKVxuXHRcdFx0OiBGaWxlQWNjZXNzLnVyaVRvRmlsZVVyaShqb2luUGF0aChleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHBhdGgpKTtcblxuXHRcdGNvbnN0IGNvbnZlcnRFeHRlbnNpb25SZWxhdGl2ZVBhdGhzVG9Ccm93c2VyVVJJcyA9IChwYXRoOiBzdHJpbmcgfCB7IGhjOiBzdHJpbmc7IGhjTGlnaHQ/OiBzdHJpbmc7IGRhcms6IHN0cmluZzsgbGlnaHQ6IHN0cmluZyB9KTogeyBoY0Rhcms6IFVSSTsgaGNMaWdodDogVVJJOyBkYXJrOiBVUkk7IGxpZ2h0OiBVUkkgfSA9PiB7XG5cdFx0XHRjb25zdCBjb252ZXJ0UGF0aCA9IChwYXRoOiBzdHJpbmcpID0+IHBhdGguc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKVxuXHRcdFx0XHQ/IFVSSS5wYXJzZShwYXRoLCB0cnVlKVxuXHRcdFx0XHQ6IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKGpvaW5QYXRoKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbiwgcGF0aCkpO1xuXG5cdFx0XHRpZiAodHlwZW9mIHBhdGggPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnZlcnRlZCA9IGNvbnZlcnRQYXRoKHBhdGgpO1xuXHRcdFx0XHRyZXR1cm4geyBoY0Rhcms6IGNvbnZlcnRlZCwgaGNMaWdodDogY29udmVydGVkLCBkYXJrOiBjb252ZXJ0ZWQsIGxpZ2h0OiBjb252ZXJ0ZWQgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aGNEYXJrOiBjb252ZXJ0UGF0aChwYXRoLmhjKSxcblx0XHRcdFx0XHRoY0xpZ2h0OiBjb252ZXJ0UGF0aChwYXRoLmhjTGlnaHQgPz8gcGF0aC5saWdodCksXG5cdFx0XHRcdFx0bGlnaHQ6IGNvbnZlcnRQYXRoKHBhdGgubGlnaHQpLFxuXHRcdFx0XHRcdGRhcms6IGNvbnZlcnRQYXRoKHBhdGguZGFyaylcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKCEoZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzPy53YWxrdGhyb3VnaHM/Lmxlbmd0aCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2VjdGlvblRvT3Blbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZWN0aW9uVG9PcGVuSW5kZXggPSBNYXRoLm1pbigpOyAvLyAnK0luZmluaXR5Jztcblx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb24uY29udHJpYnV0ZXM/LndhbGt0aHJvdWdocz8ubWFwKGFzeW5jICh3YWxrdGhyb3VnaCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGNhdGVnb3J5SUQgPSBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSArICcjJyArIHdhbGt0aHJvdWdoLmlkO1xuXG5cdFx0XHRjb25zdCBpc05ld2x5SW5zdGFsbGVkID0gIXRoaXMubWV0YWRhdGEuZ2V0KGNhdGVnb3J5SUQpO1xuXHRcdFx0aWYgKGlzTmV3bHlJbnN0YWxsZWQpIHtcblx0XHRcdFx0dGhpcy5tZXRhZGF0YS5zZXQoY2F0ZWdvcnlJRCwgeyBmaXJzdFNlZW46ICtuZXcgRGF0ZSgpLCBzdGVwSURzOiB3YWxrdGhyb3VnaC5zdGVwcz8ubWFwKHMgPT4gcy5pZCkgPz8gW10sIG1hbmF1bGx5T3BlbmVkOiBmYWxzZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3ZlcnJpZGUgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHR0aGlzLnRhc0V4cGVyaW1lbnRTZXJ2aWNlPy5nZXRUcmVhdG1lbnQ8c3RyaW5nPihgZ2V0dGluZ1N0YXJ0ZWQub3ZlcnJpZGVDYXRlZ29yeS4ke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlICsgJy4nICsgd2Fsa3Rocm91Z2guaWR9LndoZW5gKSxcblx0XHRcdFx0bmV3IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSh3YWxrdGhyb3VnaC53aGVuKSwgNTAwMCkpXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKHRoaXMuc2Vzc2lvbkluc3RhbGxlZEV4dGVuc2lvbnMuaGFzKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdCYmIHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShvdmVycmlkZSA/PyB3YWxrdGhyb3VnaC53aGVuKSA/PyBDb250ZXh0S2V5RXhwci50cnVlKCkpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uSW5zdGFsbGVkRXh0ZW5zaW9ucy5kZWxldGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdGlmIChpbmRleCA8IHNlY3Rpb25Ub09wZW5JbmRleCAmJiBpc05ld2x5SW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0c2VjdGlvblRvT3BlbiA9IGNhdGVnb3J5SUQ7XG5cdFx0XHRcdFx0c2VjdGlvblRvT3BlbkluZGV4ID0gaW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RlcHMgPSAod2Fsa3Rocm91Z2guc3RlcHMgPz8gW10pLm1hcCgoc3RlcCwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBwYXJzZURlc2NyaXB0aW9uKHN0ZXAuZGVzY3JpcHRpb24gfHwgJycpO1xuXHRcdFx0XHRjb25zdCBmdWxseVF1YWxpZmllZElEID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUgKyAnIycgKyB3YWxrdGhyb3VnaC5pZCArICcjJyArIHN0ZXAuaWQ7XG5cblx0XHRcdFx0bGV0IG1lZGlhOiBJV2Fsa3Rocm91Z2hTdGVwWydtZWRpYSddO1xuXG5cdFx0XHRcdGlmICghc3RlcC5tZWRpYSkge1xuXHRcdFx0XHRcdHRocm93IEVycm9yKCdtaXNzaW5nIG1lZGlhIGluIHdhbGt0aHJvdWdoIHN0ZXA6ICcgKyB3YWxrdGhyb3VnaC5pZCArICdAJyArIHN0ZXAuaWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0ZXAubWVkaWEuaW1hZ2UpIHtcblx0XHRcdFx0XHRjb25zdCBhbHRUZXh0ID0gc3RlcC5tZWRpYS5hbHRUZXh0O1xuXHRcdFx0XHRcdGlmIChhbHRUZXh0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ1dhbGt0aHJvdWdoIGl0ZW06JywgZnVsbHlRdWFsaWZpZWRJRCwgJ2lzIG1pc3NpbmcgYWx0VGV4dCBmb3IgaXRzIG1lZGlhIGVsZW1lbnQuJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG1lZGlhID0geyB0eXBlOiAnaW1hZ2UnLCBhbHRUZXh0LCBwYXRoOiBjb252ZXJ0RXh0ZW5zaW9uUmVsYXRpdmVQYXRoc1RvQnJvd3NlclVSSXMoc3RlcC5tZWRpYS5pbWFnZSkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChzdGVwLm1lZGlhLm1hcmtkb3duKSB7XG5cdFx0XHRcdFx0bWVkaWEgPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFya2Rvd24nLFxuXHRcdFx0XHRcdFx0cGF0aDogY29udmVydEV4dGVuc2lvblBhdGhUb0ZpbGVVUkkoc3RlcC5tZWRpYS5tYXJrZG93biksXG5cdFx0XHRcdFx0XHRiYXNlOiBjb252ZXJ0RXh0ZW5zaW9uUGF0aFRvRmlsZVVSSShkaXJuYW1lKHN0ZXAubWVkaWEubWFya2Rvd24pKSxcblx0XHRcdFx0XHRcdHJvb3Q6IEZpbGVBY2Nlc3MudXJpVG9GaWxlVXJpKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbiksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChzdGVwLm1lZGlhLnN2Zykge1xuXHRcdFx0XHRcdG1lZGlhID0ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsXG5cdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0RXh0ZW5zaW9uUGF0aFRvRmlsZVVSSShzdGVwLm1lZGlhLnN2ZyksXG5cdFx0XHRcdFx0XHRhbHRUZXh0OiBzdGVwLm1lZGlhLnN2Zyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKHN0ZXAubWVkaWEudmlkZW8pIHtcblx0XHRcdFx0XHRjb25zdCBiYXNlVVJJID0gRmlsZUFjY2Vzcy51cmlUb0ZpbGVVcmkoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uKTtcblx0XHRcdFx0XHRtZWRpYSA9IHtcblx0XHRcdFx0XHRcdHR5cGU6ICd2aWRlbycsXG5cdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0UmVsYXRpdmVNZWRpYVBhdGhzVG9XZWJ2aWV3VVJJcyhiYXNlVVJJLCBzdGVwLm1lZGlhLnZpZGVvKSxcblx0XHRcdFx0XHRcdHJvb3Q6IEZpbGVBY2Nlc3MudXJpVG9GaWxlVXJpKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbiksXG5cdFx0XHRcdFx0XHRhbHRUZXh0OiBzdGVwLm1lZGlhLmFsdFRleHQsXG5cdFx0XHRcdFx0XHRwb3N0ZXI6IHN0ZXAubWVkaWEucG9zdGVyID8gY29udmVydFJlbGF0aXZlTWVkaWFQYXRoc1RvV2Vidmlld1VSSXMoYmFzZVVSSSwgc3RlcC5tZWRpYS5wb3N0ZXIpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFRocm93IGVycm9yIGZvciB1bmtub3duIHdhbGt0aHJvdWdoIGZvcm1hdFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gd2Fsa3Rocm91Z2ggZm9ybWF0IGRldGVjdGVkIGZvciAnICsgZnVsbHlRdWFsaWZpZWRJRCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gKHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRtZWRpYSxcblx0XHRcdFx0XHRjb21wbGV0aW9uRXZlbnRzOiBzdGVwLmNvbXBsZXRpb25FdmVudHM/LmZpbHRlcih4ID0+IHR5cGVvZiB4ID09PSAnc3RyaW5nJykgPz8gW10sXG5cdFx0XHRcdFx0aWQ6IGZ1bGx5UXVhbGlmaWVkSUQsXG5cdFx0XHRcdFx0dGl0bGU6IHN0ZXAudGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoc3RlcC53aGVuKSA/PyBDb250ZXh0S2V5RXhwci50cnVlKCksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGNhdGVnb3J5SUQsXG5cdFx0XHRcdFx0b3JkZXI6IGluZGV4LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgaXNGZWF0dXJlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHdhbGt0aHJvdWdoLmZlYXR1cmVkRm9yKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGYgPT4gZi51cmkpO1xuXHRcdFx0XHRjb25zdCB0b2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRva2VuLmNhbmNlbCgpLCAyMDAwKTtcblx0XHRcdFx0aXNGZWF0dXJlZCA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYSA9PiBjaGVja0dsb2JGaWxlRXhpc3RzKGEsIGZvbGRlcnMsIHdhbGt0aHJvdWdoLmZlYXR1cmVkRm9yISwgdG9rZW4udG9rZW4pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaWNvblN0ciA9IHdhbGt0aHJvdWdoLmljb24gPz8gZXh0ZW5zaW9uLmljb247XG5cdFx0XHRjb25zdCB3YWxrdGhvdWdoRGVzY3JpcHRvcjogSVdhbGt0aHJvdWdoID0ge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogd2Fsa3Rocm91Z2guZGVzY3JpcHRpb24sXG5cdFx0XHRcdHRpdGxlOiB3YWxrdGhyb3VnaC50aXRsZSxcblx0XHRcdFx0aWQ6IGNhdGVnb3J5SUQsXG5cdFx0XHRcdGlzRmVhdHVyZWQsXG5cdFx0XHRcdHNvdXJjZTogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2Fsa3Rocm91Z2hQYWdlVGl0bGU6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24ubmFtZSxcblx0XHRcdFx0c3RlcHMsXG5cdFx0XHRcdGljb246IGljb25TdHIgPyB7XG5cdFx0XHRcdFx0dHlwZTogJ2ltYWdlJyxcblx0XHRcdFx0XHRwYXRoOiBGaWxlQWNjZXNzLnVyaVRvQnJvd3NlclVyaShqb2luUGF0aChleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGljb25TdHIpKS50b1N0cmluZyh0cnVlKVxuXHRcdFx0XHR9IDoge1xuXHRcdFx0XHRcdGljb246IGV4dGVuc2lvbkRlZmF1bHRJY29uLFxuXHRcdFx0XHRcdHR5cGU6ICdpY29uJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShvdmVycmlkZSA/PyB3YWxrdGhyb3VnaC53aGVuKSA/PyBDb250ZXh0S2V5RXhwci50cnVlKCksXG5cdFx0XHR9IGFzIGNvbnN0O1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcldhbGt0aHJvdWdoKHdhbGt0aG91Z2hEZXNjcmlwdG9yKTtcblxuXHRcdFx0dGhpcy5fb25EaWRBZGRXYWxrdGhyb3VnaC5maXJlKHRoaXMucmVzb2x2ZVdhbGt0aHJvdWdoKHdhbGt0aG91Z2hEZXNjcmlwdG9yKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh3YWxrdGhyb3VnaE1ldGFkYXRhQ29uZmlndXJhdGlvbktleSwgSlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMubWV0YWRhdGEuZW50cmllcygpXSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3QgaGFkTGFzdEZvdWNzID0gYXdhaXQgdGhpcy5ob3N0U2VydmljZS5oYWRMYXN0Rm9jdXMoKTtcblx0XHRjb25zdCBzdGFydHVwRWRpdG9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcicpO1xuXHRcdGlmIChoYWRMYXN0Rm91Y3MgJiYgc2VjdGlvblRvT3BlbiAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC53ZWxjb21lUGFnZS53YWxrdGhyb3VnaHMub3Blbk9uSW5zdGFsbCcpICYmIHN0YXJ0dXBFZGl0b3IgIT09ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnKSB7XG5cdFx0XHR0eXBlIEdldHRpbmdTdGFydGVkQXV0b09wZW5DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdscmFtb3MxNSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdXaGVuIGEgd2Fsa3Rocm91Z2ggaXMgb3BlbmVkIHVwb24gZXh0ZW5zaW9uIGluc3RhbGxhdGlvbic7XG5cdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0Y2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnO1xuXHRcdFx0XHRcdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIHVuZGVyc3RhbmQgd2hhdCB3YWxrdGhyb3VnaHMgYXJlIGNvbnN1bHRlZCBtb3N0IGZyZXF1ZW50bHknO1xuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgR2V0dGluZ1N0YXJ0ZWRBdXRvT3BlbkV2ZW50ID0ge1xuXHRcdFx0XHRpZDogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQXV0b09wZW5FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBdXRvT3BlbkNsYXNzaWZpY2F0aW9uPignZ2V0dGluZ1N0YXJ0ZWQuZGlkQXV0b09wZW5XYWxrdGhyb3VnaCcsIHsgaWQ6IHNlY3Rpb25Ub09wZW4gfSk7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEdldHRpbmdTdGFydGVkSW5wdXQpIHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5rZWVwRWRpdG9yJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5XYWxrdGhyb3VnaCcsIHNlY3Rpb25Ub09wZW4sIHtcblx0XHRcdFx0aW5hY3RpdmU6IHRoaXMubGF5b3V0U2VydmljZS5oYXNGb2N1cyhQYXJ0cy5FRElUT1JfUEFSVCkgLy8gZG8gbm90IHN0ZWFsIHRoZSBhY3RpdmUgZWRpdG9yIGF3YXlcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdW5yZWdpc3RlckV4dGVuc2lvbldhbGt0aHJvdWdoQ29udHJpYnV0aW9ucyhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbikge1xuXHRcdGlmICghKGV4dGVuc2lvbi5jb250cmlidXRlcz8ud2Fsa3Rocm91Z2hzPy5sZW5ndGgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzPy53YWxrdGhyb3VnaHM/LmZvckVhY2goc2VjdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBjYXRlZ29yeUlEID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUgKyAnIycgKyBzZWN0aW9uLmlkO1xuXHRcdFx0c2VjdGlvbi5zdGVwcy5mb3JFYWNoKHN0ZXAgPT4ge1xuXHRcdFx0XHRjb25zdCBmdWxseVF1YWxpZmllZElEID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUgKyAnIycgKyBzZWN0aW9uLmlkICsgJyMnICsgc3RlcC5pZDtcblx0XHRcdFx0dGhpcy5zdGVwcy5kZWxldGUoZnVsbHlRdWFsaWZpZWRJRCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb25zLmRlbGV0ZShjYXRlZ29yeUlEKTtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlV2Fsa3Rocm91Z2guZmlyZShjYXRlZ29yeUlEKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldFdhbGt0aHJvdWdoKGlkOiBzdHJpbmcpOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCB7XG5cblx0XHRjb25zdCB3YWxrdGhyb3VnaCA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb25zLmdldChpZCk7XG5cdFx0aWYgKCF3YWxrdGhyb3VnaCkgeyB0aHJvdyBFcnJvcignVHJ5aW5nIHRvIGdldCB1bmtub3duIHdhbGt0aHJvdWdoOiAnICsgaWQpOyB9XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZVdhbGt0aHJvdWdoKHdhbGt0aHJvdWdoKTtcblx0fVxuXG5cdGdldFdhbGt0aHJvdWdocygpOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFtdIHtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyZWRDYXRlZ29yaWVzID0gWy4uLnRoaXMuZ2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb25zLnZhbHVlcygpXTtcblx0XHRjb25zdCBjYXRlZ29yaWVzV2l0aENvbXBsZXRpb24gPSByZWdpc3RlcmVkQ2F0ZWdvcmllc1xuXHRcdFx0Lm1hcChjYXRlZ29yeSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uY2F0ZWdvcnksXG5cdFx0XHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0ZXBzJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdHN0ZXBzOiBjYXRlZ29yeS5zdGVwc1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH0pXG5cdFx0XHQuZmlsdGVyKGNhdGVnb3J5ID0+IGNhdGVnb3J5LmNvbnRlbnQudHlwZSAhPT0gJ3N0ZXBzJyB8fCBjYXRlZ29yeS5jb250ZW50LnN0ZXBzLmxlbmd0aClcblx0XHRcdC5maWx0ZXIoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuaWQgIT09ICdOZXdXZWxjb21lRXhwZXJpZW5jZScpXG5cdFx0XHQubWFwKGNhdGVnb3J5ID0+IHRoaXMucmVzb2x2ZVdhbGt0aHJvdWdoKGNhdGVnb3J5KSk7XG5cblx0XHRyZXR1cm4gY2F0ZWdvcmllc1dpdGhDb21wbGV0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlV2Fsa3Rocm91Z2goY2F0ZWdvcnk6IElXYWxrdGhyb3VnaCk6IElSZXNvbHZlZFdhbGt0aHJvdWdoIHtcblxuXHRcdGNvbnN0IHN0ZXBzV2l0aFByb2dyZXNzID0gY2F0ZWdvcnkuc3RlcHMubWFwKHN0ZXAgPT4gdGhpcy5nZXRTdGVwUHJvZ3Jlc3Moc3RlcCkpO1xuXG5cdFx0Y29uc3QgaGFzT3BlbmVkID0gdGhpcy5tZXRhZGF0YS5nZXQoY2F0ZWdvcnkuaWQpPy5tYW5hdWxseU9wZW5lZDtcblx0XHRjb25zdCBmaXJzdFNlZW5EYXRlID0gdGhpcy5tZXRhZGF0YS5nZXQoY2F0ZWdvcnkuaWQpPy5maXJzdFNlZW47XG5cdFx0Y29uc3QgaXNOZXcgPSBmaXJzdFNlZW5EYXRlICYmIGZpcnN0U2VlbkRhdGUgPiAoK25ldyBEYXRlKCkgLSBORVdfV0FMS1RIUk9VR0hfVElNRSk7XG5cblx0XHRjb25zdCBsYXN0U3RlcElEcyA9IHRoaXMubWV0YWRhdGEuZ2V0KGNhdGVnb3J5LmlkKT8uc3RlcElEcztcblx0XHRjb25zdCByYXdDYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb25zLmdldChjYXRlZ29yeS5pZCk7XG5cdFx0aWYgKCFyYXdDYXRlZ29yeSkgeyB0aHJvdyBFcnJvcignQ291bGQgbm90IGZpbmQgd2Fsa3Rocm91Z2ggd2l0aCBpZCAnICsgY2F0ZWdvcnkuaWQpOyB9XG5cblx0XHRjb25zdCBjdXJyZW50U3RlcElkczogc3RyaW5nW10gPSByYXdDYXRlZ29yeS5zdGVwcy5tYXAocyA9PiBzLmlkKTtcblxuXHRcdGNvbnN0IGhhc05ld1N0ZXBzID0gbGFzdFN0ZXBJRHMgJiYgKGN1cnJlbnRTdGVwSWRzLmxlbmd0aCAhPT0gbGFzdFN0ZXBJRHMubGVuZ3RoIHx8IGN1cnJlbnRTdGVwSWRzLnNvbWUoKGlkLCBpbmRleCkgPT4gaWQgIT09IGxhc3RTdGVwSURzW2luZGV4XSkpO1xuXG5cdFx0bGV0IHJlY2VuY3lCb251cyA9IDA7XG5cdFx0aWYgKGZpcnN0U2VlbkRhdGUpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnREYXRlID0gK25ldyBEYXRlKCk7XG5cdFx0XHRjb25zdCB0aW1lU2luY2VGaXJzdFNlZW4gPSBjdXJyZW50RGF0ZSAtIGZpcnN0U2VlbkRhdGU7XG5cdFx0XHRyZWNlbmN5Qm9udXMgPSBNYXRoLm1heCgwLCAoTkVXX1dBTEtUSFJPVUdIX1RJTUUgLSB0aW1lU2luY2VGaXJzdFNlZW4pIC8gTkVXX1dBTEtUSFJPVUdIX1RJTUUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jYXRlZ29yeSxcblx0XHRcdHJlY2VuY3lCb251cyxcblx0XHRcdHN0ZXBzOiBzdGVwc1dpdGhQcm9ncmVzcyxcblx0XHRcdG5ld0l0ZW1zOiAhIWhhc05ld1N0ZXBzLFxuXHRcdFx0bmV3RW50cnk6ICEhKGlzTmV3ICYmICFoYXNPcGVuZWQpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFN0ZXBQcm9ncmVzcyhzdGVwOiBJV2Fsa3Rocm91Z2hTdGVwKTogSVJlc29sdmVkV2Fsa3Rocm91Z2hTdGVwIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3RlcCxcblx0XHRcdGRvbmU6IGZhbHNlLFxuXHRcdFx0Li4udGhpcy5zdGVwUHJvZ3Jlc3Nbc3RlcC5pZF1cblx0XHR9O1xuXHR9XG5cblx0cHJvZ3Jlc3NTdGVwKGlkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBvbGRQcm9ncmVzcyA9IHRoaXMuc3RlcFByb2dyZXNzW2lkXTtcblx0XHRpZiAoIW9sZFByb2dyZXNzIHx8IG9sZFByb2dyZXNzLmRvbmUgIT09IHRydWUpIHtcblx0XHRcdHRoaXMuc3RlcFByb2dyZXNzW2lkXSA9IHsgZG9uZTogdHJ1ZSB9O1xuXHRcdFx0dGhpcy5tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdFx0XHRjb25zdCBzdGVwID0gdGhpcy5nZXRTdGVwKGlkKTtcblx0XHRcdGlmICghc3RlcCkgeyB0aHJvdyBFcnJvcignVHJpZWQgdG8gcHJvZ3Jlc3MgdW5rbm93biBzdGVwJyk7IH1cblxuXHRcdFx0dGhpcy5fb25EaWRQcm9ncmVzc1N0ZXAuZmlyZSh0aGlzLmdldFN0ZXBQcm9ncmVzcyhzdGVwKSk7XG5cdFx0fVxuXHR9XG5cblx0ZGVwcm9ncmVzc1N0ZXAoaWQ6IHN0cmluZykge1xuXHRcdGRlbGV0ZSB0aGlzLnN0ZXBQcm9ncmVzc1tpZF07XG5cdFx0dGhpcy5tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdFx0Y29uc3Qgc3RlcCA9IHRoaXMuZ2V0U3RlcChpZCk7XG5cdFx0dGhpcy5fb25EaWRQcm9ncmVzc1N0ZXAuZmlyZSh0aGlzLmdldFN0ZXBQcm9ncmVzcyhzdGVwKSk7XG5cdH1cblxuXHRwcm9ncmVzc0J5RXZlbnQoZXZlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlc3Npb25FdmVudHMuaGFzKGV2ZW50KSkgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuc2Vzc2lvbkV2ZW50cy5hZGQoZXZlbnQpO1xuXHRcdHRoaXMuY29tcGxldGlvbkxpc3RlbmVycy5nZXQoZXZlbnQpPy5mb3JFYWNoKGlkID0+IHRoaXMucHJvZ3Jlc3NTdGVwKGlkKSk7XG5cdH1cblxuXHRyZWdpc3RlcldhbGt0aHJvdWdoKHdhbGt0aG91Z2hEZXNjcmlwdG9yOiBJV2Fsa3Rocm91Z2hMb29zZSkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyV2Fsa3Rocm91Z2goe1xuXHRcdFx0Li4ud2Fsa3Rob3VnaERlc2NyaXB0b3IsXG5cdFx0XHRzdGVwczogd2Fsa3Rob3VnaERlc2NyaXB0b3Iuc3RlcHMubWFwKHN0ZXAgPT4gKHsgLi4uc3RlcCwgZGVzY3JpcHRpb246IHBhcnNlRGVzY3JpcHRpb24oc3RlcC5kZXNjcmlwdGlvbikgfSkpXG5cdFx0fSk7XG5cdH1cblxuXHRfcmVnaXN0ZXJXYWxrdGhyb3VnaCh3YWxrdGhyb3VnaERlc2NyaXB0b3I6IElXYWxrdGhyb3VnaCk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZENhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMuZ2V0KHdhbGt0aHJvdWdoRGVzY3JpcHRvci5pZCk7XG5cdFx0aWYgKG9sZENhdGVnb3J5KSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBTa2lwcGluZyBhdHRlbXB0IHRvIG92ZXJ3cml0ZSB3YWxrdGhyb3VnaC4gKCR7d2Fsa3Rocm91Z2hEZXNjcmlwdG9yLmlkfSlgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmdldHRpbmdTdGFydGVkQ29udHJpYnV0aW9ucy5zZXQod2Fsa3Rocm91Z2hEZXNjcmlwdG9yLmlkLCB3YWxrdGhyb3VnaERlc2NyaXB0b3IpO1xuXG5cdFx0d2Fsa3Rocm91Z2hEZXNjcmlwdG9yLnN0ZXBzLmZvckVhY2goc3RlcCA9PiB7XG5cdFx0XHRpZiAodGhpcy5zdGVwcy5oYXMoc3RlcC5pZCkpIHsgdGhyb3cgRXJyb3IoJ0F0dGVtcHRpbmcgdG8gcmVnaXN0ZXIgc3RlcCB3aXRoIGlkICcgKyBzdGVwLmlkICsgJyB0d2ljZS4gU2Vjb25kIGlzIGRyb3BwZWQuJyk7IH1cblx0XHRcdHRoaXMuc3RlcHMuc2V0KHN0ZXAuaWQsIHN0ZXApO1xuXHRcdFx0c3RlcC53aGVuLmtleXMoKS5mb3JFYWNoKGtleSA9PiB0aGlzLmNhdGVnb3J5VmlzaWJpbGl0eUNvbnRleHRLZXlzLmFkZChrZXkpKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJEb25lTGlzdGVuZXJzKHN0ZXApO1xuXHRcdH0pO1xuXG5cdFx0d2Fsa3Rocm91Z2hEZXNjcmlwdG9yLndoZW4ua2V5cygpLmZvckVhY2goa2V5ID0+IHRoaXMuY2F0ZWdvcnlWaXNpYmlsaXR5Q29udGV4dEtleXMuYWRkKGtleSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRvbmVMaXN0ZW5lcnMoc3RlcDogSVdhbGt0aHJvdWdoU3RlcCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGlmICgoc3RlcCBhcyBhbnkpLmRvbmVPbikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgd2FrdGhyb3VnaCBzdGVwYCwgc3RlcCwgYHVzZXMgZGVwcmVjYXRlZCAnZG9uZU9uJyBwcm9wZXJ0eS4gQWRvcHQgJ2NvbXBsZXRpb25FdmVudHMnIHRvIHNpbGVuY2UgdGhpcyB3YXJuaW5nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFzdGVwLmNvbXBsZXRpb25FdmVudHMubGVuZ3RoKSB7XG5cdFx0XHRzdGVwLmNvbXBsZXRpb25FdmVudHMgPSBjb2FsZXNjZShcblx0XHRcdFx0c3RlcC5kZXNjcmlwdGlvblxuXHRcdFx0XHRcdC5maWx0ZXIobGlua2VkVGV4dCA9PiBsaW5rZWRUZXh0Lm5vZGVzLmxlbmd0aCA9PT0gMSkgLy8gb25seSBidXR0b25zXG5cdFx0XHRcdFx0LmZsYXRNYXAobGlua2VkVGV4dCA9PlxuXHRcdFx0XHRcdFx0bGlua2VkVGV4dC5ub2Rlc1xuXHRcdFx0XHRcdFx0XHQuZmlsdGVyKCgobm9kZSk6IG5vZGUgaXMgSUxpbmsgPT4gdHlwZW9mIG5vZGUgIT09ICdzdHJpbmcnKSlcblx0XHRcdFx0XHRcdFx0Lm1hcCgoeyBocmVmIH0pID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaHJlZi5zdGFydHNXaXRoKCdjb21tYW5kOicpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gJ29uQ29tbWFuZDonICsgaHJlZi5zbGljZSgnY29tbWFuZDonLmxlbmd0aCwgaHJlZi5pbmNsdWRlcygnPycpID8gaHJlZi5pbmRleE9mKCc/JykgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpZiAoaHJlZi5zdGFydHNXaXRoKCdodHRwczovLycpIHx8IGhyZWYuc3RhcnRzV2l0aCgnaHR0cDovLycpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gJ29uTGluazonICsgaHJlZjtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0fSkpKTtcblx0XHR9XG5cblx0XHRpZiAoIXN0ZXAuY29tcGxldGlvbkV2ZW50cy5sZW5ndGgpIHtcblx0XHRcdHN0ZXAuY29tcGxldGlvbkV2ZW50cy5wdXNoKCdzdGVwU2VsZWN0ZWQnKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBldmVudCBvZiBzdGVwLmNvbXBsZXRpb25FdmVudHMpIHtcblx0XHRcdGNvbnN0IFtfLCBldmVudFR5cGUsIGFyZ3VtZW50XSA9IC9eKFteOl0qKTo/KC4qKSQvLmV4ZWMoZXZlbnQpID8/IFtdO1xuXG5cdFx0XHRpZiAoIWV2ZW50VHlwZSkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBVbmtub3duIGNvbXBsZXRpb25FdmVudCAke2V2ZW50fSB3aGVuIHJlZ2lzdGVyaW5nIHN0ZXAgJHtzdGVwLmlkfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChldmVudFR5cGUpIHtcblx0XHRcdFx0Y2FzZSAnb25MaW5rJzogY2FzZSAnb25FdmVudCc6IGNhc2UgJ29uVmlldyc6IGNhc2UgJ29uU2V0dGluZ0NoYW5nZWQnOlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdvbkNvbnRleHQnOiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwcmVzc2lvbiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGFyZ3VtZW50KTtcblx0XHRcdFx0XHRpZiAoZXhwcmVzc2lvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5zdGVwQ29tcGxldGlvbkNvbnRleHRLZXlFeHByZXNzaW9ucy5hZGQoZXhwcmVzc2lvbik7XG5cdFx0XHRcdFx0XHRleHByZXNzaW9uLmtleXMoKS5mb3JFYWNoKGtleSA9PiB0aGlzLnN0ZXBDb21wbGV0aW9uQ29udGV4dEtleXMuYWRkKGtleSkpO1xuXHRcdFx0XHRcdFx0ZXZlbnQgPSBldmVudFR5cGUgKyAnOicgKyBleHByZXNzaW9uLnNlcmlhbGl6ZSgpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhleHByZXNzaW9uKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNlc3Npb25FdmVudHMuYWRkKGV2ZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcignVW5hYmxlIHRvIHBhcnNlIGNvbnRleHQga2V5IGV4cHJlc3Npb246JywgZXhwcmVzc2lvbiwgJ2luIHdhbGt0aHJvdWdoIHN0ZXAnLCBzdGVwLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb25TdGVwU2VsZWN0ZWQnOiBjYXNlICdzdGVwU2VsZWN0ZWQnOlxuXHRcdFx0XHRcdGV2ZW50ID0gJ3N0ZXBTZWxlY3RlZDonICsgc3RlcC5pZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnb25Db21tYW5kJzpcblx0XHRcdFx0XHRldmVudCA9IGV2ZW50VHlwZSArICc6JyArIGFyZ3VtZW50LnJlcGxhY2UoL150b1NpZGU6LywgJycpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdvbkV4dGVuc2lvbkluc3RhbGxlZCc6IGNhc2UgJ2V4dGVuc2lvbkluc3RhbGxlZCc6XG5cdFx0XHRcdFx0ZXZlbnQgPSAnZXh0ZW5zaW9uSW5zdGFsbGVkOicgKyBhcmd1bWVudC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFVua25vd24gY29tcGxldGlvbkV2ZW50ICR7ZXZlbnR9IHdoZW4gcmVnaXN0ZXJpbmcgc3RlcCAke3N0ZXAuaWR9YCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVnaXN0ZXJDb21wbGV0aW9uTGlzdGVuZXIoZXZlbnQsIHN0ZXApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb21wbGV0aW9uTGlzdGVuZXIoZXZlbnQ6IHN0cmluZywgc3RlcDogSVdhbGt0aHJvdWdoU3RlcCkge1xuXHRcdGlmICghdGhpcy5jb21wbGV0aW9uTGlzdGVuZXJzLmhhcyhldmVudCkpIHtcblx0XHRcdHRoaXMuY29tcGxldGlvbkxpc3RlbmVycy5zZXQoZXZlbnQsIG5ldyBTZXQoKSk7XG5cdFx0fVxuXHRcdHRoaXMuY29tcGxldGlvbkxpc3RlbmVycy5nZXQoZXZlbnQpPy5hZGQoc3RlcC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0ZXAoaWQ6IHN0cmluZyk6IElXYWxrdGhyb3VnaFN0ZXAge1xuXHRcdGNvbnN0IHN0ZXAgPSB0aGlzLnN0ZXBzLmdldChpZCk7XG5cdFx0aWYgKCFzdGVwKSB7IHRocm93IEVycm9yKCdBdHRlbXB0aW5nIHRvIGFjY2VzcyBzdGVwIHdoaWNoIGRvZXMgbm90IGV4aXN0IGluIHJlZ2lzdHJ5ICcgKyBpZCk7IH1cblx0XHRyZXR1cm4gc3RlcDtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgcGFyc2VEZXNjcmlwdGlvbiA9IChkZXNjOiBzdHJpbmcpOiBMaW5rZWRUZXh0W10gPT4gZGVzYy5zcGxpdCgnXFxuJykuZmlsdGVyKHggPT4geCkubWFwKHRleHQgPT4gcGFyc2VMaW5rZWRUZXh0KHRleHQpKTtcblxuZXhwb3J0IGNvbnN0IGNvbnZlcnRJbnRlcm5hbE1lZGlhUGF0aFRvRmlsZVVSSSA9IChwYXRoOiBzdHJpbmcpID0+IHBhdGguc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKVxuXHQ/IFVSSS5wYXJzZShwYXRoLCB0cnVlKVxuXHQ6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGB2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLyR7cGF0aH1gKTtcblxuY29uc3QgY29udmVydEludGVybmFsTWVkaWFQYXRoVG9Ccm93c2VyVVJJID0gKHBhdGg6IHN0cmluZykgPT4gcGF0aC5zdGFydHNXaXRoKCdodHRwczovLycpXG5cdD8gVVJJLnBhcnNlKHBhdGgsIHRydWUpXG5cdDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYHZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJHtwYXRofWApO1xuY29uc3QgY29udmVydEludGVybmFsTWVkaWFQYXRoc1RvQnJvd3NlclVSSXMgPSAocGF0aDogc3RyaW5nIHwgeyBoYzogc3RyaW5nOyBoY0xpZ2h0Pzogc3RyaW5nOyBkYXJrOiBzdHJpbmc7IGxpZ2h0OiBzdHJpbmcgfSk6IHsgaGNEYXJrOiBVUkk7IGhjTGlnaHQ6IFVSSTsgZGFyazogVVJJOyBsaWdodDogVVJJIH0gPT4ge1xuXHRpZiAodHlwZW9mIHBhdGggPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3QgY29udmVydGVkID0gY29udmVydEludGVybmFsTWVkaWFQYXRoVG9Ccm93c2VyVVJJKHBhdGgpO1xuXHRcdHJldHVybiB7IGhjRGFyazogY29udmVydGVkLCBoY0xpZ2h0OiBjb252ZXJ0ZWQsIGRhcms6IGNvbnZlcnRlZCwgbGlnaHQ6IGNvbnZlcnRlZCB9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRoY0Rhcms6IGNvbnZlcnRJbnRlcm5hbE1lZGlhUGF0aFRvQnJvd3NlclVSSShwYXRoLmhjKSxcblx0XHRcdGhjTGlnaHQ6IGNvbnZlcnRJbnRlcm5hbE1lZGlhUGF0aFRvQnJvd3NlclVSSShwYXRoLmhjTGlnaHQgPz8gcGF0aC5saWdodCksXG5cdFx0XHRsaWdodDogY29udmVydEludGVybmFsTWVkaWFQYXRoVG9Ccm93c2VyVVJJKHBhdGgubGlnaHQpLFxuXHRcdFx0ZGFyazogY29udmVydEludGVybmFsTWVkaWFQYXRoVG9Ccm93c2VyVVJJKHBhdGguZGFyaylcblx0XHR9O1xuXHR9XG59O1xuXG5jb25zdCBjb252ZXJ0UmVsYXRpdmVNZWRpYVBhdGhzVG9XZWJ2aWV3VVJJcyA9IChiYXNlUGF0aDogVVJJLCBwYXRoOiBzdHJpbmcgfCB7IGhjOiBzdHJpbmc7IGhjTGlnaHQ/OiBzdHJpbmc7IGRhcms6IHN0cmluZzsgbGlnaHQ6IHN0cmluZyB9KTogeyBoY0Rhcms6IFVSSTsgaGNMaWdodDogVVJJOyBkYXJrOiBVUkk7IGxpZ2h0OiBVUkkgfSA9PiB7XG5cdGNvbnN0IGNvbnZlcnRQYXRoID0gKHBhdGg6IHN0cmluZykgPT4gcGF0aC5zdGFydHNXaXRoKCdodHRwczovLycpXG5cdFx0PyBVUkkucGFyc2UocGF0aCwgdHJ1ZSlcblx0XHQ6IGFzV2Vidmlld1VyaShqb2luUGF0aChiYXNlUGF0aCwgcGF0aCkpO1xuXG5cdGlmICh0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycpIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBjb252ZXJ0UGF0aChwYXRoKTtcblx0XHRyZXR1cm4geyBoY0Rhcms6IGNvbnZlcnRlZCwgaGNMaWdodDogY29udmVydGVkLCBkYXJrOiBjb252ZXJ0ZWQsIGxpZ2h0OiBjb252ZXJ0ZWQgfTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aGNEYXJrOiBjb252ZXJ0UGF0aChwYXRoLmhjKSxcblx0XHRcdGhjTGlnaHQ6IGNvbnZlcnRQYXRoKHBhdGguaGNMaWdodCA/PyBwYXRoLmxpZ2h0KSxcblx0XHRcdGxpZ2h0OiBjb252ZXJ0UGF0aChwYXRoLmxpZ2h0KSxcblx0XHRcdGRhcms6IGNvbnZlcnRQYXRoKHBhdGguZGFyaylcblx0XHR9O1xuXHR9XG59O1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Jlc2V0R2V0dGluZ1N0YXJ0ZWRQcm9ncmVzcycsXG5cdFx0XHRjYXRlZ29yeTogbG9jYWxpemUyKCdkZXZlbG9wZXInLCBcIkRldmVsb3BlclwiKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Jlc2V0V2VsY29tZVBhZ2VXYWxrdGhyb3VnaFByb2dyZXNzJywgXCJSZXNldCBXZWxjb21lIFBhZ2UgV2Fsa3Rocm91Z2ggUHJvZ3Jlc3NcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3Jlc2V0R2V0dGluZ1N0YXJ0ZWRQcm9ncmVzc0Rlc2NyaXB0aW9uJywgJ1Jlc2V0IHRoZSBwcm9ncmVzcyBvZiBhbGwgV2Fsa3Rocm91Z2ggc3RlcHMgb24gdGhlIFdlbGNvbWUgUGFnZSB0byBtYWtlIHRoZW0gYXBwZWFyIGFzIGlmIHRoZXkgYXJlIGJlaW5nIHZpZXdlZCBmb3IgdGhlIGZpcnN0IHRpbWUsIHByb3ZpZGluZyBhIGZyZXNoIHN0YXJ0IHRvIHRoZSBnZXR0aW5nIHN0YXJ0ZWQgZXhwZXJpZW5jZS4nKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2Fsa3Rocm91Z2hzU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0aGlkZGVuRW50cmllc0NvbmZpZ3VyYXRpb25LZXksXG5cdFx0XHRKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdHdhbGt0aHJvdWdoTWV0YWRhdGFDb25maWd1cmF0aW9uS2V5LFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoW10pLFxuXHRcdFx0U3RvcmFnZVNjb3BlLlBST0ZJTEUsXG5cdFx0XHRTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3QgbWVtZW50byA9IG5ldyBNZW1lbnRvKCdnZXR0aW5nU3RhcnRlZFNlcnZpY2UnLCBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVjb3JkID0gbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdGZvciAoY29uc3Qga2V5IGluIHJlY29yZCkge1xuXHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZWNvcmQsIGtleSkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRnZXR0aW5nU3RhcnRlZFNlcnZpY2UuZGVwcm9ncmVzc1N0ZXAoa2V5KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0bWVtZW50by5zYXZlTWVtZW50bygpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJTaW5nbGV0b24oSVdhbGt0aHJvdWdoc1NlcnZpY2UsIFdhbGt0aHJvdWdoc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7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
