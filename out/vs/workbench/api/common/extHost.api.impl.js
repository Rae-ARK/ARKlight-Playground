import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { AsyncIterableObject, raceCancellationError } from "../../../base/common/async.js";
import * as errors from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { combinedDisposable } from "../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../base/common/network.js";
import Severity from "../../../base/common/severity.js";
import { URI } from "../../../base/common/uri.js";
import { TextEditorCursorStyle } from "../../../editor/common/config/editorOptions.js";
import { score, targetsNotebooks } from "../../../editor/common/languageSelector.js";
import * as languageConfiguration from "../../../editor/common/languages/languageConfiguration.js";
import { OverviewRulerLane } from "../../../editor/common/model.js";
import { ExtensionError, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import * as files from "../../../platform/files/common/files.js";
import { ILogService, ILoggerService, LogLevel } from "../../../platform/log/common/log.js";
import { getRemoteName } from "../../../platform/remote/common/remoteHosts.js";
import { TelemetryTrustedValue } from "../../../platform/telemetry/common/telemetryUtils.js";
import { EditSessionIdentityMatch } from "../../../platform/workspace/common/editSessions.js";
import { DebugConfigurationProviderTriggerKind } from "../../contrib/debug/common/debug.js";
import { PromptsType } from "../../contrib/chat/common/promptSyntax/promptTypes.js";
import { UIKind } from "../../services/extensions/common/extensionHostProtocol.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { AISearchKeyword, ExcludeSettingOptions, TextSearchCompleteMessageType, TextSearchContext2, TextSearchMatch2 } from "../../services/search/common/searchExtTypes.js";
import { CandidatePortSource, ExtHostContext, MainContext } from "./extHost.protocol.js";
import { ExtHostRelatedInformation } from "./extHostAiRelatedInformation.js";
import { ExtHostAiSettingsSearch } from "./extHostAiSettingsSearch.js";
import { ExtHostApiCommands } from "./extHostApiCommands.js";
import { IExtHostApiDeprecationService } from "./extHostApiDeprecationService.js";
import { IExtHostAuthentication } from "./extHostAuthentication.js";
import { ExtHostBulkEdits } from "./extHostBulkEdits.js";
import { ExtHostChatAgents2 } from "./extHostChatAgents2.js";
import { ExtHostChatOutputRenderer } from "./extHostChatOutputRenderer.js";
import { ExtHostChatSessions } from "./extHostChatSessions.js";
import { ExtHostChatStatus } from "./extHostChatStatus.js";
import { ExtHostChatQuota } from "./extHostChatQuota.js";
import { ExtHostChatInputNotification } from "./extHostChatInputNotification.js";
import { ExtHostClipboard } from "./extHostClipboard.js";
import { ExtHostEditorInsets } from "./extHostCodeInsets.js";
import { ExtHostCodeMapper } from "./extHostCodeMapper.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { createExtHostComments } from "./extHostComments.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { ExtHostCustomEditors } from "./extHostCustomEditors.js";
import { IExtHostDataChannels } from "./extHostDataChannels.js";
import { IExtHostDebugService } from "./extHostDebugService.js";
import { IExtHostDecorations } from "./extHostDecorations.js";
import { ExtHostDiagnostics } from "./extHostDiagnostics.js";
import { ExtHostDialogs } from "./extHostDialogs.js";
import { ExtHostDocumentContentProvider } from "./extHostDocumentContentProviders.js";
import { ExtHostDocumentSaveParticipant } from "./extHostDocumentSaveParticipant.js";
import { ExtHostDocuments } from "./extHostDocuments.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostEditorTabs } from "./extHostEditorTabs.js";
import { ExtHostEmbeddings } from "./extHostEmbedding.js";
import { ExtHostAiEmbeddingVector } from "./extHostEmbeddingVector.js";
import { Extension, IExtHostExtensionService } from "./extHostExtensionService.js";
import { ExtHostFileSystem } from "./extHostFileSystem.js";
import { IExtHostConsumerFileSystem } from "./extHostFileSystemConsumer.js";
import { ExtHostFileSystemEventService } from "./extHostFileSystemEventService.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { ExtHostInteractive } from "./extHostInteractive.js";
import { ExtHostLabelService } from "./extHostLabelService.js";
import { ExtHostLanguageFeatures } from "./extHostLanguageFeatures.js";
import { ExtHostLanguageModelTools } from "./extHostLanguageModelTools.js";
import { IExtHostLanguageModels } from "./extHostLanguageModels.js";
import { ExtHostLanguages } from "./extHostLanguages.js";
import { IExtHostLocalizationService } from "./extHostLocalizationService.js";
import { IExtHostManagedSockets } from "./extHostManagedSockets.js";
import { IExtHostBrowserTunnelProxy } from "./extHostBrowserTunnelProxy.js";
import { IExtHostMpcService } from "./extHostMcp.js";
import { ExtHostMessageService } from "./extHostMessageService.js";
import { ExtHostNotebookController } from "./extHostNotebook.js";
import { ExtHostNotebookDocumentSaveParticipant } from "./extHostNotebookDocumentSaveParticipant.js";
import { ExtHostNotebookDocuments } from "./extHostNotebookDocuments.js";
import { ExtHostNotebookEditors } from "./extHostNotebookEditors.js";
import { ExtHostNotebookKernels } from "./extHostNotebookKernels.js";
import { ExtHostNotebookRenderers } from "./extHostNotebookRenderers.js";
import { IExtHostOutputService } from "./extHostOutput.js";
import { ExtHostProfileContentHandlers } from "./extHostProfileContentHandler.js";
import { IExtHostProgress } from "./extHostProgress.js";
import { ExtHostQuickDiff } from "./extHostQuickDiff.js";
import { ExtHostAgentEditorComments } from "./extHostAgentEditorComments.js";
import { createExtHostQuickOpen } from "./extHostQuickOpen.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ExtHostSCM } from "./extHostSCM.js";
import { IExtHostSearch } from "./extHostSearch.js";
import { IExtHostSecretState } from "./extHostSecretState.js";
import { ExtHostShare } from "./extHostShare.js";
import { ExtHostSpeech } from "./extHostSpeech.js";
import { ExtHostBrowsers } from "./extHostBrowsers.js";
import { ExtHostStatusBar } from "./extHostStatusBar.js";
import { IExtHostStorage } from "./extHostStorage.js";
import { IExtensionStoragePaths } from "./extHostStoragePaths.js";
import { IExtHostTask } from "./extHostTask.js";
import { ExtHostTelemetryLogger, IExtHostTelemetry, isNewAppInstall } from "./extHostTelemetry.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { IExtHostTerminalShellIntegration } from "./extHostTerminalShellIntegration.js";
import { IExtHostTesting } from "./extHostTesting.js";
import { ExtHostEditors } from "./extHostTextEditors.js";
import { ExtHostTheming } from "./extHostTheming.js";
import { ExtHostTimeline } from "./extHostTimeline.js";
import { ExtHostTreeViews } from "./extHostTreeViews.js";
import { IExtHostTunnelService } from "./extHostTunnelService.js";
import * as typeConverters from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { ExtHostUriOpeners } from "./extHostUriOpener.js";
import { IURITransformerService } from "./extHostUriTransformerService.js";
import { IExtHostUrlsService } from "./extHostUrls.js";
import { ExtHostWebviews } from "./extHostWebview.js";
import { ExtHostWebviewPanels } from "./extHostWebviewPanels.js";
import { ExtHostWebviewViews } from "./extHostWebviewView.js";
import { IExtHostWindow } from "./extHostWindow.js";
import { IExtHostPower } from "./extHostPower.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { ExtHostChatContext } from "./extHostChatContext.js";
import { ExtHostChatDebug } from "./extHostChatDebug.js";
import { IExtHostMeteredConnection } from "./extHostMeteredConnection.js";
import { IExtHostGitExtensionService } from "./extHostGitExtensionService.js";
function createApiFactoryAndRegisterActors(accessor) {
  const initData = accessor.get(IExtHostInitDataService);
  const extHostFileSystemInfo = accessor.get(IExtHostFileSystemInfo);
  const extHostConsumerFileSystem = accessor.get(IExtHostConsumerFileSystem);
  const extensionService = accessor.get(IExtHostExtensionService);
  const extHostWorkspace = accessor.get(IExtHostWorkspace);
  const extHostTelemetry = accessor.get(IExtHostTelemetry);
  const extHostConfiguration = accessor.get(IExtHostConfiguration);
  const uriTransformer = accessor.get(IURITransformerService);
  const rpcProtocol = accessor.get(IExtHostRpcService);
  const extHostStorage = accessor.get(IExtHostStorage);
  const extensionStoragePaths = accessor.get(IExtensionStoragePaths);
  const extHostLoggerService = accessor.get(ILoggerService);
  const extHostLogService = accessor.get(ILogService);
  const extHostTunnelService = accessor.get(IExtHostTunnelService);
  const extHostApiDeprecation = accessor.get(IExtHostApiDeprecationService);
  const extHostWindow = accessor.get(IExtHostWindow);
  const extHostPower = accessor.get(IExtHostPower);
  const extHostUrls = accessor.get(IExtHostUrlsService);
  const extHostSecretState = accessor.get(IExtHostSecretState);
  const extHostEditorTabs = accessor.get(IExtHostEditorTabs);
  const extHostManagedSockets = accessor.get(IExtHostManagedSockets);
  const extHostBrowserTunnelProxy = accessor.get(IExtHostBrowserTunnelProxy);
  const extHostProgress = accessor.get(IExtHostProgress);
  const extHostAuthentication = accessor.get(IExtHostAuthentication);
  const extHostLanguageModels = accessor.get(IExtHostLanguageModels);
  const extHostMcp = accessor.get(IExtHostMpcService);
  const extHostDataChannels = accessor.get(IExtHostDataChannels);
  const extHostMeteredConnection = accessor.get(IExtHostMeteredConnection);
  const extHostGitExtensionService = accessor.get(IExtHostGitExtensionService);
  rpcProtocol.set(ExtHostContext.ExtHostFileSystemInfo, extHostFileSystemInfo);
  rpcProtocol.set(ExtHostContext.ExtHostLogLevelServiceShape, extHostLoggerService);
  rpcProtocol.set(ExtHostContext.ExtHostWorkspace, extHostWorkspace);
  rpcProtocol.set(ExtHostContext.ExtHostConfiguration, extHostConfiguration);
  rpcProtocol.set(ExtHostContext.ExtHostExtensionService, extensionService);
  rpcProtocol.set(ExtHostContext.ExtHostStorage, extHostStorage);
  rpcProtocol.set(ExtHostContext.ExtHostTunnelService, extHostTunnelService);
  rpcProtocol.set(ExtHostContext.ExtHostWindow, extHostWindow);
  rpcProtocol.set(ExtHostContext.ExtHostPower, extHostPower);
  rpcProtocol.set(ExtHostContext.ExtHostUrls, extHostUrls);
  rpcProtocol.set(ExtHostContext.ExtHostSecretState, extHostSecretState);
  rpcProtocol.set(ExtHostContext.ExtHostTelemetry, extHostTelemetry);
  rpcProtocol.set(ExtHostContext.ExtHostEditorTabs, extHostEditorTabs);
  rpcProtocol.set(ExtHostContext.ExtHostManagedSockets, extHostManagedSockets);
  rpcProtocol.set(ExtHostContext.ExtHostBrowserTunnelProxy, extHostBrowserTunnelProxy);
  rpcProtocol.set(ExtHostContext.ExtHostProgress, extHostProgress);
  rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
  rpcProtocol.set(ExtHostContext.ExtHostChatProvider, extHostLanguageModels);
  rpcProtocol.set(ExtHostContext.ExtHostDataChannels, extHostDataChannels);
  rpcProtocol.set(ExtHostContext.ExtHostMeteredConnection, extHostMeteredConnection);
  rpcProtocol.set(ExtHostContext.ExtHostGitExtension, extHostGitExtensionService);
  const extHostDecorations = rpcProtocol.set(ExtHostContext.ExtHostDecorations, accessor.get(IExtHostDecorations));
  const extHostDocumentsAndEditors = rpcProtocol.set(ExtHostContext.ExtHostDocumentsAndEditors, accessor.get(IExtHostDocumentsAndEditors));
  const extHostCommands = rpcProtocol.set(ExtHostContext.ExtHostCommands, accessor.get(IExtHostCommands));
  const extHostTerminalService = rpcProtocol.set(ExtHostContext.ExtHostTerminalService, accessor.get(IExtHostTerminalService));
  const extHostTerminalShellIntegration = rpcProtocol.set(ExtHostContext.ExtHostTerminalShellIntegration, accessor.get(IExtHostTerminalShellIntegration));
  const extHostDebugService = rpcProtocol.set(ExtHostContext.ExtHostDebugService, accessor.get(IExtHostDebugService));
  const extHostSearch = rpcProtocol.set(ExtHostContext.ExtHostSearch, accessor.get(IExtHostSearch));
  const extHostTask = rpcProtocol.set(ExtHostContext.ExtHostTask, accessor.get(IExtHostTask));
  const extHostOutputService = rpcProtocol.set(ExtHostContext.ExtHostOutputService, accessor.get(IExtHostOutputService));
  const extHostLocalization = rpcProtocol.set(ExtHostContext.ExtHostLocalization, accessor.get(IExtHostLocalizationService));
  const extHostDocuments = rpcProtocol.set(ExtHostContext.ExtHostDocuments, new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors));
  const extHostDocumentContentProviders = rpcProtocol.set(ExtHostContext.ExtHostDocumentContentProviders, new ExtHostDocumentContentProvider(rpcProtocol, extHostDocumentsAndEditors, extHostLogService));
  const extHostDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostDocumentSaveParticipant, new ExtHostDocumentSaveParticipant(extHostLogService, extHostDocuments, rpcProtocol.getProxy(MainContext.MainThreadBulkEdits)));
  const extHostNotebook = rpcProtocol.set(ExtHostContext.ExtHostNotebook, new ExtHostNotebookController(rpcProtocol, extHostCommands, extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, extHostLogService));
  const extHostNotebookDocuments = rpcProtocol.set(ExtHostContext.ExtHostNotebookDocuments, new ExtHostNotebookDocuments(extHostNotebook));
  const extHostNotebookEditors = rpcProtocol.set(ExtHostContext.ExtHostNotebookEditors, new ExtHostNotebookEditors(extHostLogService, extHostNotebook));
  const extHostNotebookKernels = rpcProtocol.set(ExtHostContext.ExtHostNotebookKernels, new ExtHostNotebookKernels(rpcProtocol, initData, extHostNotebook, extHostCommands, extHostLogService));
  const extHostNotebookRenderers = rpcProtocol.set(ExtHostContext.ExtHostNotebookRenderers, new ExtHostNotebookRenderers(rpcProtocol, extHostNotebook));
  const extHostNotebookDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostNotebookDocumentSaveParticipant, new ExtHostNotebookDocumentSaveParticipant(extHostLogService, extHostNotebook, rpcProtocol.getProxy(MainContext.MainThreadBulkEdits)));
  const extHostEditors = rpcProtocol.set(ExtHostContext.ExtHostEditors, new ExtHostEditors(rpcProtocol, extHostDocumentsAndEditors));
  const extHostTreeViews = rpcProtocol.set(ExtHostContext.ExtHostTreeViews, new ExtHostTreeViews(rpcProtocol.getProxy(MainContext.MainThreadTreeViews), extHostCommands, extHostLogService));
  const extHostEditorInsets = rpcProtocol.set(ExtHostContext.ExtHostEditorInsets, new ExtHostEditorInsets(rpcProtocol.getProxy(MainContext.MainThreadEditorInsets), extHostEditors, initData.remote));
  const extHostDiagnostics = rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, new ExtHostDiagnostics(rpcProtocol, extHostLogService, extHostFileSystemInfo, extHostDocumentsAndEditors));
  const extHostLanguages = rpcProtocol.set(ExtHostContext.ExtHostLanguages, new ExtHostLanguages(rpcProtocol, extHostDocuments, extHostCommands.converter, uriTransformer));
  const extHostLanguageFeatures = rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, new ExtHostLanguageFeatures(rpcProtocol, uriTransformer, extHostDocuments, extHostCommands, extHostDiagnostics, extHostLogService, extHostApiDeprecation, extHostTelemetry));
  const extHostCodeMapper = rpcProtocol.set(ExtHostContext.ExtHostCodeMapper, new ExtHostCodeMapper(rpcProtocol));
  const extHostFileSystem = rpcProtocol.set(ExtHostContext.ExtHostFileSystem, new ExtHostFileSystem(rpcProtocol, extHostLanguageFeatures));
  const extHostFileSystemEvent = rpcProtocol.set(ExtHostContext.ExtHostFileSystemEventService, new ExtHostFileSystemEventService(rpcProtocol, extHostLogService, extHostDocumentsAndEditors));
  const extHostQuickOpen = rpcProtocol.set(ExtHostContext.ExtHostQuickOpen, createExtHostQuickOpen(rpcProtocol, extHostWorkspace, extHostCommands));
  const extHostSCM = rpcProtocol.set(ExtHostContext.ExtHostSCM, new ExtHostSCM(rpcProtocol, extHostCommands, extHostDocuments, extHostLogService));
  const extHostQuickDiff = rpcProtocol.set(ExtHostContext.ExtHostQuickDiff, new ExtHostQuickDiff(rpcProtocol, extHostDocuments, uriTransformer));
  const extHostAgentEditorComments = rpcProtocol.set(ExtHostContext.ExtHostAgentEditorComments, new ExtHostAgentEditorComments(rpcProtocol));
  const extHostShare = rpcProtocol.set(ExtHostContext.ExtHostShare, new ExtHostShare(rpcProtocol, uriTransformer));
  const extHostComment = rpcProtocol.set(ExtHostContext.ExtHostComments, createExtHostComments(rpcProtocol, extHostCommands, extHostDocuments));
  const extHostLabelService = rpcProtocol.set(ExtHostContext.ExtHostLabelService, new ExtHostLabelService(rpcProtocol));
  const extHostTheming = rpcProtocol.set(ExtHostContext.ExtHostTheming, new ExtHostTheming(rpcProtocol));
  const extHostTimeline = rpcProtocol.set(ExtHostContext.ExtHostTimeline, new ExtHostTimeline(rpcProtocol, extHostCommands));
  const extHostWebviews = rpcProtocol.set(ExtHostContext.ExtHostWebviews, new ExtHostWebviews(rpcProtocol, initData.remote, extHostWorkspace, extHostLogService, extHostApiDeprecation));
  const extHostWebviewPanels = rpcProtocol.set(ExtHostContext.ExtHostWebviewPanels, new ExtHostWebviewPanels(rpcProtocol, extHostWebviews, extHostWorkspace));
  const extHostCustomEditors = rpcProtocol.set(ExtHostContext.ExtHostCustomEditors, new ExtHostCustomEditors(rpcProtocol, extHostDocuments, extensionStoragePaths, extHostWebviews, extHostWebviewPanels));
  const extHostWebviewViews = rpcProtocol.set(ExtHostContext.ExtHostWebviewViews, new ExtHostWebviewViews(rpcProtocol, extHostWebviews));
  const extHostTesting = rpcProtocol.set(ExtHostContext.ExtHostTesting, accessor.get(IExtHostTesting));
  const extHostUriOpeners = rpcProtocol.set(ExtHostContext.ExtHostUriOpeners, new ExtHostUriOpeners(rpcProtocol));
  const extHostProfileContentHandlers = rpcProtocol.set(ExtHostContext.ExtHostProfileContentHandlers, new ExtHostProfileContentHandlers(rpcProtocol));
  const extHostChatOutputRenderer = rpcProtocol.set(ExtHostContext.ExtHostChatOutputRenderer, new ExtHostChatOutputRenderer(rpcProtocol, extHostWebviews));
  rpcProtocol.set(ExtHostContext.ExtHostInteractive, new ExtHostInteractive(rpcProtocol, extHostNotebook, extHostDocumentsAndEditors, extHostCommands, extHostLogService));
  const extHostLanguageModelTools = rpcProtocol.set(ExtHostContext.ExtHostLanguageModelTools, new ExtHostLanguageModelTools(rpcProtocol, extHostLanguageModels));
  const extHostChatSessions = rpcProtocol.set(ExtHostContext.ExtHostChatSessions, new ExtHostChatSessions(extHostCommands, extHostLanguageModels, rpcProtocol, extHostLogService));
  const extHostChatAgents2 = rpcProtocol.set(ExtHostContext.ExtHostChatAgents2, new ExtHostChatAgents2(rpcProtocol, extHostLogService, extHostCommands, extHostDocuments, extHostDocumentsAndEditors, extHostLanguageModels, extHostDiagnostics, extHostLanguageModelTools, extHostChatSessions));
  const extHostChatContext = rpcProtocol.set(ExtHostContext.ExtHostChatContext, new ExtHostChatContext(rpcProtocol, extHostCommands, extHostEditorTabs));
  const extHostChatDebug = rpcProtocol.set(ExtHostContext.ExtHostChatDebug, new ExtHostChatDebug(rpcProtocol));
  const extHostAiRelatedInformation = rpcProtocol.set(ExtHostContext.ExtHostAiRelatedInformation, new ExtHostRelatedInformation(rpcProtocol));
  const extHostAiEmbeddingVector = rpcProtocol.set(ExtHostContext.ExtHostAiEmbeddingVector, new ExtHostAiEmbeddingVector(rpcProtocol));
  const extHostAiSettingsSearch = rpcProtocol.set(ExtHostContext.ExtHostAiSettingsSearch, new ExtHostAiSettingsSearch(rpcProtocol));
  const extHostStatusBar = rpcProtocol.set(ExtHostContext.ExtHostStatusBar, new ExtHostStatusBar(rpcProtocol, extHostCommands.converter));
  const extHostSpeech = rpcProtocol.set(ExtHostContext.ExtHostSpeech, new ExtHostSpeech(rpcProtocol));
  const extHostEmbeddings = rpcProtocol.set(ExtHostContext.ExtHostEmbeddings, new ExtHostEmbeddings(rpcProtocol));
  const extHostBrowsers = rpcProtocol.set(ExtHostContext.ExtHostBrowsers, new ExtHostBrowsers(rpcProtocol));
  const extHostChatQuota = rpcProtocol.set(ExtHostContext.ExtHostChatQuota, new ExtHostChatQuota(rpcProtocol));
  rpcProtocol.set(ExtHostContext.ExtHostMcp, accessor.get(IExtHostMpcService));
  const expected = Object.values(ExtHostContext);
  rpcProtocol.assertRegistered(expected);
  const extHostBulkEdits = new ExtHostBulkEdits(rpcProtocol, extHostDocumentsAndEditors);
  const extHostClipboard = new ExtHostClipboard(rpcProtocol);
  const extHostMessageService = new ExtHostMessageService(rpcProtocol, extHostLogService);
  const extHostDialogs = new ExtHostDialogs(rpcProtocol);
  const extHostChatStatus = new ExtHostChatStatus(rpcProtocol);
  const extHostChatInputNotification = new ExtHostChatInputNotification(rpcProtocol);
  ExtHostApiCommands.register(extHostCommands);
  return function(extension, extensionInfo, configProvider) {
    function _asExtensionEvent(actual) {
      return (listener, thisArgs, disposables) => {
        const handle = actual((e) => {
          try {
            listener.call(thisArgs, e);
          } catch (err) {
            errors.onUnexpectedExternalError(new ExtensionError(extension.identifier, err, "FAILED to handle event"));
          }
        });
        disposables?.push(handle);
        return handle;
      };
    }
    const checkSelector = (function() {
      let done = !extension.isUnderDevelopment;
      function informOnce() {
        if (!done) {
          extHostLogService.info(`Extension '${extension.identifier.value}' uses a document selector without scheme. Learn more about this: https://go.microsoft.com/fwlink/?linkid=872305`);
          done = true;
        }
      }
      return function perform(selector) {
        if (Array.isArray(selector)) {
          selector.forEach(perform);
        } else if (typeof selector === "string") {
          informOnce();
        } else {
          const filter = selector;
          if (typeof filter.scheme === "undefined") {
            informOnce();
          }
          if (typeof filter.exclusive === "boolean") {
            checkProposedApiEnabled(extension, "documentFiltersExclusive");
          }
        }
        return selector;
      };
    })();
    const authentication = {
      getSession(providerId, scopesOrChallenge, options) {
        if (typeof options?.forceNewSession === "object" && options.forceNewSession.learnMore || typeof options?.createIfNone === "object" && options.createIfNone.learnMore) {
          checkProposedApiEnabled(extension, "authLearnMore");
        }
        if (options?.authorizationServer) {
          checkProposedApiEnabled(extension, "authIssuers");
        }
        return extHostAuthentication.getSession(extension, providerId, scopesOrChallenge, options);
      },
      getAccounts(providerId) {
        return extHostAuthentication.getAccounts(providerId);
      },
      // TODO: remove this after GHPR and Codespaces move off of it
      async hasSession(providerId, scopes) {
        checkProposedApiEnabled(extension, "authSession");
        return !!await extHostAuthentication.getSession(extension, providerId, scopes, { silent: true });
      },
      get onDidChangeSessions() {
        return _asExtensionEvent(extHostAuthentication.getExtensionScopedSessionsEvent(extension.identifier.value));
      },
      registerAuthenticationProvider(id, label, provider, options) {
        if (options?.supportedAuthorizationServers) {
          checkProposedApiEnabled(extension, "authIssuers");
        }
        return extHostAuthentication.registerAuthenticationProvider(id, label, provider, options);
      }
    };
    const commands = {
      registerCommand(id, command, thisArgs) {
        return extHostCommands.registerCommand(true, id, command, thisArgs, void 0, extension);
      },
      registerTextEditorCommand(id, callback, thisArg) {
        return extHostCommands.registerCommand(true, id, (...args) => {
          const activeTextEditor = extHostEditors.getActiveTextEditor();
          if (!activeTextEditor) {
            extHostLogService.warn("Cannot execute " + id + " because there is no active text editor.");
            return void 0;
          }
          return activeTextEditor.edit((edit) => {
            callback.apply(thisArg, [activeTextEditor, edit, ...args]);
          }).then((result) => {
            if (!result) {
              extHostLogService.warn("Edits from command " + id + " were not applied.");
            }
          }, (err) => {
            extHostLogService.warn("An error occurred while running command " + id, err);
          });
        }, void 0, void 0, extension);
      },
      registerDiffInformationCommand: (id, callback, thisArg) => {
        checkProposedApiEnabled(extension, "diffCommand");
        return extHostCommands.registerCommand(true, id, async (...args) => {
          const activeTextEditor = extHostDocumentsAndEditors.activeEditor(true);
          if (!activeTextEditor) {
            extHostLogService.warn("Cannot execute " + id + " because there is no active text editor.");
            return void 0;
          }
          const diff = await extHostEditors.getDiffInformation(activeTextEditor.id);
          callback.apply(thisArg, [diff, ...args]);
        }, void 0, void 0, extension);
      },
      executeCommand(id, ...args) {
        return extHostCommands.executeCommand(id, ...args);
      },
      getCommands(filterInternal = false) {
        return extHostCommands.getCommands(filterInternal);
      }
    };
    const env = {
      get machineId() {
        return initData.telemetryInfo.machineId;
      },
      get devDeviceId() {
        checkProposedApiEnabled(extension, "devDeviceId");
        return initData.telemetryInfo.devDeviceId ?? initData.telemetryInfo.machineId;
      },
      get isAppPortable() {
        return initData.environment.isPortable ?? false;
      },
      get sessionId() {
        return initData.telemetryInfo.sessionId;
      },
      get language() {
        return initData.environment.appLanguage;
      },
      get appName() {
        return initData.environment.appName;
      },
      get appRoot() {
        return initData.environment.appRoot?.fsPath ?? "";
      },
      get appHost() {
        return initData.environment.appHost;
      },
      get uriScheme() {
        return initData.environment.appUriScheme;
      },
      get clipboard() {
        return extHostClipboard.value;
      },
      get shell() {
        return extHostTerminalService.getDefaultShell(false);
      },
      get onDidChangeShell() {
        return _asExtensionEvent(extHostTerminalService.onDidChangeShell);
      },
      get isTelemetryEnabled() {
        return extHostTelemetry.getTelemetryConfiguration();
      },
      get onDidChangeTelemetryEnabled() {
        return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryEnabled);
      },
      get telemetryConfiguration() {
        checkProposedApiEnabled(extension, "telemetry");
        return extHostTelemetry.getTelemetryDetails();
      },
      get onDidChangeTelemetryConfiguration() {
        checkProposedApiEnabled(extension, "telemetry");
        return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryConfiguration);
      },
      get isMeteredConnection() {
        checkProposedApiEnabled(extension, "envIsConnectionMetered");
        return extHostMeteredConnection.isConnectionMetered;
      },
      get onDidChangeMeteredConnection() {
        checkProposedApiEnabled(extension, "envIsConnectionMetered");
        return _asExtensionEvent(extHostMeteredConnection.onDidChangeIsConnectionMetered);
      },
      get isNewAppInstall() {
        return isNewAppInstall(initData.telemetryInfo.firstSessionDate);
      },
      createTelemetryLogger(sender, options) {
        ExtHostTelemetryLogger.validateSender(sender);
        return extHostTelemetry.instantiateLogger(extension, sender, options);
      },
      async openExternal(uri, options) {
        return extHostWindow.openUri(uri, {
          allowTunneling: initData.remote.isRemote ?? (initData.remote.authority ? await extHostTunnelService.hasTunnelProvider() : false),
          allowContributedOpeners: options?.allowContributedOpeners
        });
      },
      async asExternalUri(uri) {
        if (uri.scheme === initData.environment.appUriScheme) {
          return extHostUrls.createAppUri(uri);
        }
        try {
          return await extHostWindow.asExternalUri(uri, { allowTunneling: !!initData.remote.authority });
        } catch (err) {
          if (matchesScheme(uri, Schemas.http) || matchesScheme(uri, Schemas.https)) {
            return uri;
          }
          throw err;
        }
      },
      get remoteName() {
        return getRemoteName(initData.remote.authority);
      },
      get remoteAuthority() {
        checkProposedApiEnabled(extension, "resolvers");
        return initData.remote.authority;
      },
      get uiKind() {
        return initData.uiKind;
      },
      get logLevel() {
        return extHostLogService.getLevel();
      },
      get onDidChangeLogLevel() {
        return _asExtensionEvent(extHostLogService.onDidChangeLogLevel);
      },
      get appQuality() {
        checkProposedApiEnabled(extension, "resolvers");
        return initData.quality;
      },
      get appCommit() {
        checkProposedApiEnabled(extension, "resolvers");
        return initData.commit;
      },
      getDataChannel(channelId) {
        checkProposedApiEnabled(extension, "dataChannels");
        return extHostDataChannels.createDataChannel(extension, channelId);
      },
      get power() {
        checkProposedApiEnabled(extension, "environmentPower");
        return {
          get onDidSuspend() {
            return _asExtensionEvent(extHostPower.onDidSuspend);
          },
          get onDidResume() {
            return _asExtensionEvent(extHostPower.onDidResume);
          },
          get onDidChangeOnBatteryPower() {
            return _asExtensionEvent(extHostPower.onDidChangeOnBatteryPower);
          },
          get onDidChangeThermalState() {
            return _asExtensionEvent(extHostPower.onDidChangeThermalState);
          },
          get onDidChangeSpeedLimit() {
            return _asExtensionEvent(extHostPower.onDidChangeSpeedLimit);
          },
          get onWillShutdown() {
            return _asExtensionEvent(extHostPower.onWillShutdown);
          },
          get onDidLockScreen() {
            return _asExtensionEvent(extHostPower.onDidLockScreen);
          },
          get onDidUnlockScreen() {
            return _asExtensionEvent(extHostPower.onDidUnlockScreen);
          },
          getSystemIdleState(idleThresholdSeconds) {
            return extHostPower.getSystemIdleState(idleThresholdSeconds);
          },
          getSystemIdleTime() {
            return extHostPower.getSystemIdleTime();
          },
          getCurrentThermalState() {
            return extHostPower.getCurrentThermalState();
          },
          isOnBatteryPower() {
            return extHostPower.isOnBatteryPower();
          },
          async startPowerSaveBlocker(type) {
            const blocker = await extHostPower.startPowerSaveBlocker(type);
            return {
              id: blocker.id,
              get isStarted() {
                return blocker.isStarted;
              },
              dispose() {
                blocker.dispose();
              }
            };
          }
        };
      }
    };
    if (!initData.environment.extensionTestsLocationURI) {
      Object.freeze(env);
    }
    const tests = {
      createTestController(provider, label, refreshHandler) {
        return extHostTesting.createTestController(extension, provider, label, refreshHandler);
      },
      createTestObserver() {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.createTestObserver();
      },
      runTests(provider) {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.runTests(provider);
      },
      registerTestFollowupProvider(provider) {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.registerTestFollowupProvider(provider);
      },
      get onDidChangeTestResults() {
        checkProposedApiEnabled(extension, "testObserver");
        return _asExtensionEvent(extHostTesting.onResultsChanged);
      },
      get testResults() {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.results;
      }
    };
    const extensionKind = initData.remote.isRemote ? extHostTypes.ExtensionKind.Workspace : extHostTypes.ExtensionKind.UI;
    const extensions = {
      getExtension(extensionId, includeFromDifferentExtensionHosts) {
        if (!isProposedApiEnabled(extension, "extensionsAny")) {
          includeFromDifferentExtensionHosts = false;
        }
        const mine = extensionInfo.mine.getExtensionDescription(extensionId);
        if (mine) {
          return new Extension(extensionService, extension.identifier, mine, extensionKind, false);
        }
        if (includeFromDifferentExtensionHosts) {
          const foreign = extensionInfo.all.getExtensionDescription(extensionId);
          if (foreign) {
            return new Extension(extensionService, extension.identifier, foreign, extensionKind, true);
          }
        }
        return void 0;
      },
      get all() {
        const result = [];
        for (const desc of extensionInfo.mine.getAllExtensionDescriptions()) {
          result.push(new Extension(extensionService, extension.identifier, desc, extensionKind, false));
        }
        return result;
      },
      get allAcrossExtensionHosts() {
        checkProposedApiEnabled(extension, "extensionsAny");
        const local = new ExtensionIdentifierSet(extensionInfo.mine.getAllExtensionDescriptions().map((desc) => desc.identifier));
        const result = [];
        for (const desc of extensionInfo.all.getAllExtensionDescriptions()) {
          const isFromDifferentExtensionHost = !local.has(desc.identifier);
          result.push(new Extension(extensionService, extension.identifier, desc, extensionKind, isFromDifferentExtensionHost));
        }
        return result;
      },
      get onDidChange() {
        if (isProposedApiEnabled(extension, "extensionsAny")) {
          return _asExtensionEvent(Event.any(extensionInfo.mine.onDidChange, extensionInfo.all.onDidChange));
        }
        return _asExtensionEvent(extensionInfo.mine.onDidChange);
      }
    };
    const languages = {
      createDiagnosticCollection(name) {
        return extHostDiagnostics.createDiagnosticCollection(extension.identifier, name);
      },
      get onDidChangeDiagnostics() {
        return _asExtensionEvent(extHostDiagnostics.onDidChangeDiagnostics);
      },
      getDiagnostics: (resource) => {
        return extHostDiagnostics.getDiagnostics(resource);
      },
      getLanguages() {
        return extHostLanguages.getLanguages();
      },
      setTextDocumentLanguage(document, languageId) {
        return extHostLanguages.changeLanguage(document.uri, languageId);
      },
      match(selector, document) {
        const interalSelector = typeConverters.LanguageSelector.from(selector);
        let notebook;
        if (targetsNotebooks(interalSelector)) {
          notebook = extHostNotebook.notebookDocuments.find((value) => value.apiNotebook.getCells().find((c) => c.document === document))?.apiNotebook;
        }
        return score(interalSelector, document.uri, document.languageId, true, notebook?.uri, notebook?.notebookType);
      },
      registerCodeActionsProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerCodeActionProvider(extension, checkSelector(selector), provider, metadata);
      },
      registerDocumentPasteEditProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerDocumentPasteEditProvider(extension, checkSelector(selector), provider, metadata);
      },
      registerCodeLensProvider(selector, provider) {
        return extHostLanguageFeatures.registerCodeLensProvider(extension, checkSelector(selector), provider);
      },
      registerDefinitionProvider(selector, provider) {
        return extHostLanguageFeatures.registerDefinitionProvider(extension, checkSelector(selector), provider);
      },
      registerDeclarationProvider(selector, provider) {
        return extHostLanguageFeatures.registerDeclarationProvider(extension, checkSelector(selector), provider);
      },
      registerImplementationProvider(selector, provider) {
        return extHostLanguageFeatures.registerImplementationProvider(extension, checkSelector(selector), provider);
      },
      registerTypeDefinitionProvider(selector, provider) {
        return extHostLanguageFeatures.registerTypeDefinitionProvider(extension, checkSelector(selector), provider);
      },
      registerHoverProvider(selector, provider) {
        return extHostLanguageFeatures.registerHoverProvider(extension, checkSelector(selector), provider, extension.identifier);
      },
      registerEvaluatableExpressionProvider(selector, provider) {
        return extHostLanguageFeatures.registerEvaluatableExpressionProvider(extension, checkSelector(selector), provider, extension.identifier);
      },
      registerInlineValuesProvider(selector, provider) {
        return extHostLanguageFeatures.registerInlineValuesProvider(extension, checkSelector(selector), provider, extension.identifier);
      },
      registerDocumentHighlightProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentHighlightProvider(extension, checkSelector(selector), provider);
      },
      registerMultiDocumentHighlightProvider(selector, provider) {
        return extHostLanguageFeatures.registerMultiDocumentHighlightProvider(extension, checkSelector(selector), provider);
      },
      registerLinkedEditingRangeProvider(selector, provider) {
        return extHostLanguageFeatures.registerLinkedEditingRangeProvider(extension, checkSelector(selector), provider);
      },
      registerReferenceProvider(selector, provider) {
        return extHostLanguageFeatures.registerReferenceProvider(extension, checkSelector(selector), provider);
      },
      registerRenameProvider(selector, provider) {
        return extHostLanguageFeatures.registerRenameProvider(extension, checkSelector(selector), provider);
      },
      registerNewSymbolNamesProvider(selector, provider) {
        checkProposedApiEnabled(extension, "newSymbolNamesProvider");
        return extHostLanguageFeatures.registerNewSymbolNamesProvider(extension, checkSelector(selector), provider);
      },
      registerDocumentSymbolProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerDocumentSymbolProvider(extension, checkSelector(selector), provider, metadata);
      },
      registerWorkspaceSymbolProvider(provider) {
        return extHostLanguageFeatures.registerWorkspaceSymbolProvider(extension, provider);
      },
      registerDocumentFormattingEditProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentFormattingEditProvider(extension, checkSelector(selector), provider);
      },
      registerDocumentRangeFormattingEditProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentRangeFormattingEditProvider(extension, checkSelector(selector), provider);
      },
      registerOnTypeFormattingEditProvider(selector, provider, firstTriggerCharacter, ...moreTriggerCharacters) {
        return extHostLanguageFeatures.registerOnTypeFormattingEditProvider(extension, checkSelector(selector), provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
      },
      registerDocumentSemanticTokensProvider(selector, provider, legend) {
        return extHostLanguageFeatures.registerDocumentSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
      },
      registerDocumentRangeSemanticTokensProvider(selector, provider, legend) {
        return extHostLanguageFeatures.registerDocumentRangeSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
      },
      registerSignatureHelpProvider(selector, provider, firstItem, ...remaining) {
        if (typeof firstItem === "object") {
          return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, firstItem);
        }
        return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, typeof firstItem === "undefined" ? [] : [firstItem, ...remaining]);
      },
      registerCompletionItemProvider(selector, provider, ...triggerCharacters) {
        return extHostLanguageFeatures.registerCompletionItemProvider(extension, checkSelector(selector), provider, triggerCharacters);
      },
      registerInlineCompletionItemProvider(selector, provider, metadata) {
        if (provider.handleDidShowCompletionItem) {
          checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        }
        if (provider.handleDidPartiallyAcceptCompletionItem) {
          checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        }
        if (metadata) {
          checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        }
        return extHostLanguageFeatures.registerInlineCompletionsProvider(extension, checkSelector(selector), provider, metadata);
      },
      get inlineCompletionsUnificationState() {
        checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        return extHostLanguageFeatures.inlineCompletionsUnificationState;
      },
      onDidChangeCompletionsUnificationState(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        return _asExtensionEvent(extHostLanguageFeatures.onDidChangeInlineCompletionsUnificationState)(listener, thisArg, disposables);
      },
      registerDocumentLinkProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentLinkProvider(extension, checkSelector(selector), provider);
      },
      registerColorProvider(selector, provider) {
        return extHostLanguageFeatures.registerColorProvider(extension, checkSelector(selector), provider);
      },
      registerFoldingRangeProvider(selector, provider) {
        return extHostLanguageFeatures.registerFoldingRangeProvider(extension, checkSelector(selector), provider);
      },
      registerSelectionRangeProvider(selector, provider) {
        return extHostLanguageFeatures.registerSelectionRangeProvider(extension, selector, provider);
      },
      registerCallHierarchyProvider(selector, provider) {
        return extHostLanguageFeatures.registerCallHierarchyProvider(extension, selector, provider);
      },
      registerTypeHierarchyProvider(selector, provider) {
        return extHostLanguageFeatures.registerTypeHierarchyProvider(extension, selector, provider);
      },
      setLanguageConfiguration: (language, configuration) => {
        return extHostLanguageFeatures.setLanguageConfiguration(extension, language, configuration);
      },
      getTokenInformationAtPosition(doc, pos) {
        checkProposedApiEnabled(extension, "tokenInformation");
        return extHostLanguages.tokenAtPosition(doc, pos);
      },
      computeFullSyntaxHighlighting(source, languageId) {
        checkProposedApiEnabled(extension, "documentSyntaxHighlighting");
        return extHostLanguages.computeFullSyntaxHighlighting(source, languageId);
      },
      get onDidChangeSyntaxHighlighting() {
        checkProposedApiEnabled(extension, "documentSyntaxHighlighting");
        return extHostLanguages.onDidChangeSyntaxHighlighting;
      },
      registerInlayHintsProvider(selector, provider) {
        return extHostLanguageFeatures.registerInlayHintsProvider(extension, selector, provider);
      },
      createLanguageStatusItem(id, selector) {
        return extHostLanguages.createLanguageStatusItem(extension, id, selector);
      },
      registerDocumentDropEditProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerDocumentOnDropEditProvider(extension, selector, provider, metadata);
      }
    };
    const window = {
      get activeTextEditor() {
        return extHostEditors.getActiveTextEditor();
      },
      get visibleTextEditors() {
        return extHostEditors.getVisibleTextEditors();
      },
      get activeTerminal() {
        return extHostTerminalService.activeTerminal;
      },
      get terminals() {
        return extHostTerminalService.terminals;
      },
      async showTextDocument(documentOrUri, columnOrOptions, preserveFocus) {
        if (URI.isUri(documentOrUri) && documentOrUri.scheme === Schemas.vscodeRemote && !documentOrUri.authority) {
          extHostApiDeprecation.report("workspace.showTextDocument", extension, `A URI of 'vscode-remote' scheme requires an authority.`);
        }
        const document = await (URI.isUri(documentOrUri) ? Promise.resolve(workspace.openTextDocument(documentOrUri)) : Promise.resolve(documentOrUri));
        return extHostEditors.showTextDocument(document, columnOrOptions, preserveFocus);
      },
      createTextEditorDecorationType(options) {
        return extHostEditors.createTextEditorDecorationType(extension, options);
      },
      onDidChangeActiveTextEditor(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeActiveTextEditor)(listener, thisArg, disposables);
      },
      onDidChangeVisibleTextEditors(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeVisibleTextEditors)(listener, thisArg, disposables);
      },
      onDidChangeTextEditorSelection(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorSelection)(listener, thisArgs, disposables);
      },
      onDidChangeTextEditorOptions(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorOptions)(listener, thisArgs, disposables);
      },
      onDidChangeTextEditorVisibleRanges(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorVisibleRanges)(listener, thisArgs, disposables);
      },
      onDidChangeTextEditorViewColumn(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorViewColumn)(listener, thisArg, disposables);
      },
      onDidChangeTextEditorDiffInformation(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "textEditorDiffInformation");
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorDiffInformation)(listener, thisArg, disposables);
      },
      onDidCloseTerminal(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidCloseTerminal)(listener, thisArg, disposables);
      },
      onDidOpenTerminal(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidOpenTerminal)(listener, thisArg, disposables);
      },
      onDidChangeActiveTerminal(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidChangeActiveTerminal)(listener, thisArg, disposables);
      },
      onDidChangeTerminalDimensions(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "terminalDimensions");
        return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalDimensions)(listener, thisArg, disposables);
      },
      onDidChangeTerminalState(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalState)(listener, thisArg, disposables);
      },
      onDidWriteTerminalData(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "terminalDataWriteEvent");
        return _asExtensionEvent(extHostTerminalService.onDidWriteTerminalData)(listener, thisArg, disposables);
      },
      onDidExecuteTerminalCommand(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "terminalExecuteCommandEvent");
        return _asExtensionEvent(extHostTerminalService.onDidExecuteTerminalCommand)(listener, thisArg, disposables);
      },
      onDidChangeTerminalShellIntegration(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalShellIntegration.onDidChangeTerminalShellIntegration)(listener, thisArg, disposables);
      },
      onDidStartTerminalShellExecution(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalShellIntegration.onDidStartTerminalShellExecution)(listener, thisArg, disposables);
      },
      onDidEndTerminalShellExecution(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalShellIntegration.onDidEndTerminalShellExecution)(listener, thisArg, disposables);
      },
      get state() {
        return extHostWindow.getState();
      },
      onDidChangeWindowState(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostWindow.onDidChangeWindowState)(listener, thisArg, disposables);
      },
      showInformationMessage(message, ...rest) {
        return extHostMessageService.showMessage(extension, Severity.Info, message, rest[0], rest.slice(1));
      },
      showWarningMessage(message, ...rest) {
        return extHostMessageService.showMessage(extension, Severity.Warning, message, rest[0], rest.slice(1));
      },
      showErrorMessage(message, ...rest) {
        return extHostMessageService.showMessage(extension, Severity.Error, message, rest[0], rest.slice(1));
      },
      showQuickPick(items, options, token) {
        return extHostQuickOpen.showQuickPick(extension, items, options, token);
      },
      showWorkspaceFolderPick(options) {
        return extHostQuickOpen.showWorkspaceFolderPick(options);
      },
      showInputBox(options, token) {
        return extHostQuickOpen.showInput(options, token);
      },
      showOpenDialog(options) {
        return extHostDialogs.showOpenDialog(options);
      },
      showSaveDialog(options) {
        return extHostDialogs.showSaveDialog(options);
      },
      createStatusBarItem(alignmentOrId, priorityOrAlignment, priorityArg) {
        let id;
        let alignment;
        let priority;
        if (typeof alignmentOrId === "string") {
          id = alignmentOrId;
          alignment = priorityOrAlignment;
          priority = priorityArg;
        } else {
          alignment = alignmentOrId;
          priority = priorityOrAlignment;
        }
        return extHostStatusBar.createStatusBarEntry(extension, id, alignment, priority);
      },
      setStatusBarMessage(text, timeoutOrThenable) {
        return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
      },
      withScmProgress(task) {
        extHostApiDeprecation.report(
          "window.withScmProgress",
          extension,
          `Use 'withProgress' instead.`
        );
        return extHostProgress.withProgress(extension, { location: extHostTypes.ProgressLocation.SourceControl }, (progress, token) => task({ report(n) {
        } }));
      },
      withProgress(options, task) {
        return extHostProgress.withProgress(extension, options, task);
      },
      createOutputChannel(name, options) {
        return extHostOutputService.createOutputChannel(name, options, extension);
      },
      createWebviewPanel(viewType, title, showOptions, options) {
        return extHostWebviewPanels.createWebviewPanel(extension, viewType, title, showOptions, options);
      },
      createWebviewTextEditorInset(editor, line, height, options) {
        checkProposedApiEnabled(extension, "editorInsets");
        return extHostEditorInsets.createWebviewEditorInset(editor, line, height, options, extension);
      },
      createTerminal(nameOrOptions, shellPath, shellArgs) {
        if (typeof nameOrOptions === "object") {
          let options = nameOrOptions;
          if (!isProposedApiEnabled(extension, "terminalTitle") && "titleTemplate" in nameOrOptions && nameOrOptions.titleTemplate !== void 0) {
            console.error(`[${extension.identifier.value}] \`titleTemplate\` was provided to window.createTerminal but is ignored because the \`terminalTitle\` proposed API is not enabled.`);
            options = { ...nameOrOptions, titleTemplate: void 0 };
          }
          if ("pty" in options) {
            return extHostTerminalService.createExtensionTerminal(options);
          }
          return extHostTerminalService.createTerminalFromOptions(options);
        }
        return extHostTerminalService.createTerminal(nameOrOptions, shellPath, shellArgs);
      },
      registerTerminalLinkProvider(provider) {
        return extHostTerminalService.registerLinkProvider(provider);
      },
      registerTerminalProfileProvider(id, provider) {
        return extHostTerminalService.registerProfileProvider(extension, id, provider);
      },
      registerTerminalCompletionProvider(provider, ...triggerCharacters) {
        checkProposedApiEnabled(extension, "terminalCompletionProvider");
        return extHostTerminalService.registerTerminalCompletionProvider(extension, provider, ...triggerCharacters);
      },
      registerTerminalQuickFixProvider(id, provider) {
        checkProposedApiEnabled(extension, "terminalQuickFixProvider");
        return extHostTerminalService.registerTerminalQuickFixProvider(id, extension.identifier.value, provider);
      },
      registerTreeDataProvider(viewId, treeDataProvider) {
        return extHostTreeViews.registerTreeDataProvider(viewId, treeDataProvider, extension);
      },
      createTreeView(viewId, options) {
        return extHostTreeViews.createTreeView(viewId, options, extension);
      },
      registerWebviewPanelSerializer: (viewType, serializer) => {
        return extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializer);
      },
      registerCustomEditorProvider: (viewType, provider, options = {}) => {
        return extHostCustomEditors.registerCustomEditorProvider(extension, viewType, provider, options);
      },
      registerFileDecorationProvider(provider) {
        return extHostDecorations.registerFileDecorationProvider(provider, extension);
      },
      registerUriHandler(handler) {
        return extHostUrls.registerUriHandler(extension, handler);
      },
      createQuickPick() {
        return extHostQuickOpen.createQuickPick(extension);
      },
      createInputBox() {
        return extHostQuickOpen.createInputBox(extension);
      },
      get activeColorTheme() {
        return extHostTheming.activeColorTheme;
      },
      onDidChangeActiveColorTheme(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTheming.onDidChangeActiveColorTheme)(listener, thisArg, disposables);
      },
      registerWebviewViewProvider(viewId, provider, options) {
        return extHostWebviewViews.registerWebviewViewProvider(extension, viewId, provider, options?.webviewOptions);
      },
      get activeNotebookEditor() {
        return extHostNotebook.activeNotebookEditor;
      },
      onDidChangeActiveNotebookEditor(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostNotebook.onDidChangeActiveNotebookEditor)(listener, thisArgs, disposables);
      },
      get visibleNotebookEditors() {
        return extHostNotebook.visibleNotebookEditors;
      },
      get onDidChangeVisibleNotebookEditors() {
        return _asExtensionEvent(extHostNotebook.onDidChangeVisibleNotebookEditors);
      },
      onDidChangeNotebookEditorSelection(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorSelection)(listener, thisArgs, disposables);
      },
      onDidChangeNotebookEditorVisibleRanges(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorVisibleRanges)(listener, thisArgs, disposables);
      },
      showNotebookDocument(document, options) {
        return extHostNotebook.showNotebookDocument(document, options);
      },
      registerExternalUriOpener(id, opener, metadata) {
        checkProposedApiEnabled(extension, "externalUriOpener");
        return extHostUriOpeners.registerExternalUriOpener(extension.identifier, id, opener, metadata);
      },
      registerProfileContentHandler(id, handler) {
        checkProposedApiEnabled(extension, "profileContentHandlers");
        return extHostProfileContentHandlers.registerProfileContentHandler(extension, id, handler);
      },
      registerQuickDiffProvider(selector, quickDiffProvider, id, label, rootUri) {
        checkProposedApiEnabled(extension, "quickDiffProvider");
        return extHostQuickDiff.registerQuickDiffProvider(extension, checkSelector(selector), quickDiffProvider, id, label, rootUri);
      },
      createSourceControlDiffInformation(uri) {
        checkProposedApiEnabled(extension, "textEditorDiffInformation");
        return extHostQuickDiff.createSourceControlDiffInformation(uri);
      },
      createAgentEditorComments(uri) {
        checkProposedApiEnabled(extension, "agentEditorComments");
        return extHostAgentEditorComments.createAgentEditorComments(uri);
      },
      get tabGroups() {
        return extHostEditorTabs.tabGroups;
      },
      registerShareProvider(selector, provider) {
        checkProposedApiEnabled(extension, "shareProvider");
        return extHostShare.registerShareProvider(checkSelector(selector), provider);
      },
      get nativeHandle() {
        checkProposedApiEnabled(extension, "nativeWindowHandle");
        return extHostWindow.nativeHandle;
      },
      createChatStatusItem: (id) => {
        checkProposedApiEnabled(extension, "chatStatusItem");
        return extHostChatStatus.createChatStatusItem(extension, id);
      },
      get activeChatPanelSessionResource() {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostChatAgents2.activeChatPanelSessionResource;
      },
      onDidChangeActiveChatPanelSessionResource: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return _asExtensionEvent(extHostChatAgents2.onDidChangeActiveChatPanelSessionResource)(listeners, thisArgs, disposables);
      },
      get browserTabs() {
        checkProposedApiEnabled(extension, "browser");
        return extHostBrowsers.browserTabs;
      },
      onDidOpenBrowserTab(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidOpenBrowserTab)(listener, thisArg, disposables);
      },
      onDidCloseBrowserTab(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidCloseBrowserTab)(listener, thisArg, disposables);
      },
      get activeBrowserTab() {
        checkProposedApiEnabled(extension, "browser");
        return extHostBrowsers.activeBrowserTab;
      },
      onDidChangeActiveBrowserTab(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidChangeActiveBrowserTab)(listener, thisArg, disposables);
      },
      onDidChangeBrowserTabState(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidChangeBrowserTabState)(listener, thisArg, disposables);
      },
      openBrowserTab(url, options) {
        checkProposedApiEnabled(extension, "browser");
        return extHostBrowsers.openBrowserTab(url, options);
      }
    };
    const workspace = {
      get rootPath() {
        extHostApiDeprecation.report(
          "workspace.rootPath",
          extension,
          `Please use 'workspace.workspaceFolders' instead. More details: https://aka.ms/vscode-eliminating-rootpath`
        );
        return extHostWorkspace.getPath();
      },
      set rootPath(value) {
        throw new errors.ReadonlyError("rootPath");
      },
      getWorkspaceFolder(resource) {
        return extHostWorkspace.getWorkspaceFolder(resource);
      },
      get workspaceFolders() {
        return extHostWorkspace.getWorkspaceFolders();
      },
      get name() {
        return extHostWorkspace.name;
      },
      set name(value) {
        throw new errors.ReadonlyError("name");
      },
      get workspaceFile() {
        return extHostWorkspace.workspaceFile;
      },
      set workspaceFile(value) {
        throw new errors.ReadonlyError("workspaceFile");
      },
      get isAgentSessionsWorkspace() {
        checkProposedApiEnabled(extension, "agentSessionsWorkspace");
        return !!initData.environment.isSessionsWindow;
      },
      updateWorkspaceFolders: (index, deleteCount, ...workspaceFoldersToAdd) => {
        return extHostWorkspace.updateWorkspaceFolders(extension, index, deleteCount || 0, ...workspaceFoldersToAdd);
      },
      onDidChangeWorkspaceFolders: function(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspace)(listener, thisArgs, disposables);
      },
      asRelativePath: (pathOrUri, includeWorkspace) => {
        return extHostWorkspace.getRelativePath(pathOrUri, includeWorkspace);
      },
      findFiles: (include, exclude, maxResults, token) => {
        return extHostWorkspace.findFiles(include, exclude, maxResults, extension.identifier, token);
      },
      findFiles2: (filePattern, options, token) => {
        checkProposedApiEnabled(extension, "findFiles2");
        return extHostWorkspace.findFiles2(filePattern, options, extension.identifier, token);
      },
      findTextInFiles: (query, optionsOrCallback, callbackOrToken, token) => {
        checkProposedApiEnabled(extension, "findTextInFiles");
        let options;
        let callback;
        if (typeof optionsOrCallback === "object") {
          options = optionsOrCallback;
          callback = callbackOrToken;
        } else {
          options = {};
          callback = optionsOrCallback;
          token = callbackOrToken;
        }
        return extHostWorkspace.findTextInFiles(query, options || {}, callback, extension.identifier, token);
      },
      findTextInFiles2: (query, options, token) => {
        checkProposedApiEnabled(extension, "findTextInFiles2");
        checkProposedApiEnabled(extension, "textSearchProvider2");
        return extHostWorkspace.findTextInFiles2(query, options, extension.identifier, token);
      },
      getTextDiff(originalDocument, modifiedDocument, options, token) {
        checkProposedApiEnabled(extension, "documentDiff");
        const proxy = rpcProtocol.getProxy(MainContext.MainThreadDocumentDiff);
        if (token?.isCancellationRequested) {
          const error = new errors.CancellationError();
          return {
            changes: AsyncIterableObject.EMPTY,
            complete: Promise.reject(error)
          };
        }
        const resultPromise = proxy.$computeDocumentDiff(
          originalDocument.uri,
          modifiedDocument.uri,
          options?.ignoreTrimWhitespace ?? false,
          options?.maxComputationTimeMs ?? 5e3,
          options?.computeMoves ?? false
        );
        const diffPromise = token ? raceCancellationError(resultPromise, token) : resultPromise;
        const mappedPromise = diffPromise.then((result) => {
          if (!result) {
            throw new Error("Could not compute diff. Make sure both documents are available.");
          }
          return result;
        });
        const mapChange = (c) => ({
          originalRange: typeConverters.Range.to(c.originalRange),
          modifiedRange: typeConverters.Range.to(c.modifiedRange),
          innerChanges: c.innerChanges?.map((ic) => ({
            originalRange: typeConverters.Range.to(ic.originalRange),
            modifiedRange: typeConverters.Range.to(ic.modifiedRange)
          }))
        });
        return {
          changes: new AsyncIterableObject(async (emitter) => {
            const result = await mappedPromise;
            emitter.emitMany(result.changes.map(mapChange));
          }),
          complete: mappedPromise.then((result) => ({
            identical: result.identical,
            mayBeIncomplete: result.quitEarly,
            moves: result.moves.map((m) => ({
              originalRange: typeConverters.Range.to(m.originalRange),
              modifiedRange: typeConverters.Range.to(m.modifiedRange),
              changes: m.changes.map(mapChange)
            }))
          }))
        };
      },
      save: (uri) => {
        return extHostWorkspace.save(uri);
      },
      saveAs: (uri) => {
        return extHostWorkspace.saveAs(uri);
      },
      saveAll: (includeUntitled) => {
        return extHostWorkspace.saveAll(includeUntitled);
      },
      applyEdit(edit, metadata) {
        return extHostBulkEdits.applyWorkspaceEdit(edit, extension, metadata);
      },
      createFileSystemWatcher: (pattern, optionsOrIgnoreCreate, ignoreChange, ignoreDelete) => {
        const options = {
          ignoreCreateEvents: Boolean(optionsOrIgnoreCreate),
          ignoreChangeEvents: Boolean(ignoreChange),
          ignoreDeleteEvents: Boolean(ignoreDelete)
        };
        return extHostFileSystemEvent.createFileSystemWatcher(extHostWorkspace, configProvider, extHostFileSystemInfo, extension, pattern, options);
      },
      get textDocuments() {
        return extHostDocuments.getAllDocumentData().map((data) => data.document);
      },
      set textDocuments(value) {
        throw new errors.ReadonlyError("textDocuments");
      },
      openTextDocument(uriOrFileNameOrOptions, options) {
        let uriPromise;
        options = options ?? uriOrFileNameOrOptions;
        if (typeof uriOrFileNameOrOptions === "string") {
          uriPromise = Promise.resolve(URI.file(uriOrFileNameOrOptions));
        } else if (URI.isUri(uriOrFileNameOrOptions)) {
          uriPromise = Promise.resolve(uriOrFileNameOrOptions);
        } else if (!options || typeof options === "object") {
          uriPromise = extHostDocuments.createDocumentData(options);
        } else {
          throw new Error("illegal argument - uriOrFileNameOrOptions");
        }
        return uriPromise.then((uri) => {
          extHostLogService.trace(`openTextDocument from ${extension.identifier}`);
          if (uri.scheme === Schemas.vscodeRemote && !uri.authority) {
            extHostApiDeprecation.report("workspace.openTextDocument", extension, `A URI of 'vscode-remote' scheme requires an authority.`);
          }
          return extHostDocuments.ensureDocumentData(uri, options).then((documentData) => {
            return documentData.document;
          });
        });
      },
      onDidOpenTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocuments.onDidAddDocument)(listener, thisArgs, disposables);
      },
      onDidCloseTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocuments.onDidRemoveDocument)(listener, thisArgs, disposables);
      },
      onDidChangeTextDocument: (listener, thisArgs, disposables) => {
        if (isProposedApiEnabled(extension, "textDocumentChangeReason")) {
          return _asExtensionEvent(extHostDocuments.onDidChangeDocumentWithReason)(listener, thisArgs, disposables);
        }
        return _asExtensionEvent(extHostDocuments.onDidChangeDocument)(listener, thisArgs, disposables);
      },
      onDidSaveTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocuments.onDidSaveDocument)(listener, thisArgs, disposables);
      },
      onWillSaveTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocumentSaveParticipant.getOnWillSaveTextDocumentEvent(extension))(listener, thisArgs, disposables);
      },
      get notebookDocuments() {
        return extHostNotebook.notebookDocuments.map((d) => d.apiNotebook);
      },
      async openNotebookDocument(uriOrType, content) {
        let uri;
        if (URI.isUri(uriOrType)) {
          uri = uriOrType;
          await extHostNotebook.openNotebookDocument(uriOrType);
        } else if (typeof uriOrType === "string") {
          uri = URI.revive(await extHostNotebook.createNotebookDocument({ viewType: uriOrType, content }));
        } else {
          throw new Error("Invalid arguments");
        }
        return extHostNotebook.getNotebookDocument(uri).apiNotebook;
      },
      onDidSaveNotebookDocument(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostNotebookDocuments.onDidSaveNotebookDocument)(listener, thisArg, disposables);
      },
      onDidChangeNotebookDocument(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostNotebookDocuments.onDidChangeNotebookDocument)(listener, thisArg, disposables);
      },
      onWillSaveNotebookDocument(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostNotebookDocumentSaveParticipant.getOnWillSaveNotebookDocumentEvent(extension))(listener, thisArg, disposables);
      },
      get onDidOpenNotebookDocument() {
        return _asExtensionEvent(extHostNotebook.onDidOpenNotebookDocument);
      },
      get onDidCloseNotebookDocument() {
        return _asExtensionEvent(extHostNotebook.onDidCloseNotebookDocument);
      },
      registerNotebookSerializer(viewType, serializer, options, registration) {
        return extHostNotebook.registerNotebookSerializer(extension, viewType, serializer, options, isProposedApiEnabled(extension, "notebookLiveShare") ? registration : void 0);
      },
      onDidChangeConfiguration: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(configProvider.onDidChangeConfiguration)(listener, thisArgs, disposables);
      },
      getConfiguration(section, scope) {
        scope = arguments.length === 1 ? void 0 : scope;
        return configProvider.getConfiguration(section, scope, extension);
      },
      registerTextDocumentContentProvider(scheme, provider) {
        return extHostDocumentContentProviders.registerTextDocumentContentProvider(scheme, provider);
      },
      registerTaskProvider: (type, provider) => {
        extHostApiDeprecation.report(
          "window.registerTaskProvider",
          extension,
          `Use the corresponding function on the 'tasks' namespace instead`
        );
        return extHostTask.registerTaskProvider(extension, type, provider);
      },
      registerFileSystemProvider(scheme, provider, options) {
        return combinedDisposable(
          extHostFileSystem.registerFileSystemProvider(extension, scheme, provider, options),
          extHostConsumerFileSystem.addFileSystemProvider(scheme, provider, options)
        );
      },
      get fs() {
        return extHostConsumerFileSystem.value;
      },
      registerFileSearchProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "fileSearchProvider");
        return extHostSearch.registerFileSearchProviderOld(scheme, provider);
      },
      registerTextSearchProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "textSearchProvider");
        return extHostSearch.registerTextSearchProviderOld(scheme, provider);
      },
      registerAITextSearchProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "aiTextSearchProvider");
        checkProposedApiEnabled(extension, "textSearchProvider2");
        return extHostSearch.registerAITextSearchProvider(scheme, provider);
      },
      registerFileSearchProvider2: (scheme, provider) => {
        checkProposedApiEnabled(extension, "fileSearchProvider2");
        return extHostSearch.registerFileSearchProvider(scheme, provider);
      },
      registerTextSearchProvider2: (scheme, provider) => {
        checkProposedApiEnabled(extension, "textSearchProvider2");
        return extHostSearch.registerTextSearchProvider(scheme, provider);
      },
      registerRemoteAuthorityResolver: (authorityPrefix, resolver) => {
        checkProposedApiEnabled(extension, "resolvers");
        return extensionService.registerRemoteAuthorityResolver(authorityPrefix, resolver);
      },
      registerResourceLabelFormatter: (formatter) => {
        checkProposedApiEnabled(extension, "resolvers");
        return extHostLabelService.$registerResourceLabelFormatter(formatter);
      },
      getRemoteExecServer: (authority) => {
        checkProposedApiEnabled(extension, "resolvers");
        return extensionService.getRemoteExecServer(authority);
      },
      onDidCreateFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.onDidCreateFile)(listener, thisArg, disposables);
      },
      onDidDeleteFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.onDidDeleteFile)(listener, thisArg, disposables);
      },
      onDidRenameFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.onDidRenameFile)(listener, thisArg, disposables);
      },
      onWillCreateFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.getOnWillCreateFileEvent(extension))(listener, thisArg, disposables);
      },
      onWillDeleteFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.getOnWillDeleteFileEvent(extension))(listener, thisArg, disposables);
      },
      onWillRenameFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.getOnWillRenameFileEvent(extension))(listener, thisArg, disposables);
      },
      openTunnel: (forward) => {
        checkProposedApiEnabled(extension, "tunnels");
        return extHostTunnelService.openTunnel(extension, forward).then((value) => {
          if (!value) {
            throw new Error("cannot open tunnel");
          }
          return value;
        });
      },
      get tunnels() {
        checkProposedApiEnabled(extension, "tunnels");
        return extHostTunnelService.getTunnels();
      },
      onDidChangeTunnels: (listener, thisArg, disposables) => {
        checkProposedApiEnabled(extension, "tunnels");
        return _asExtensionEvent(extHostTunnelService.onDidChangeTunnels)(listener, thisArg, disposables);
      },
      registerPortAttributesProvider: (portSelector, provider) => {
        checkProposedApiEnabled(extension, "portsAttributes");
        return extHostTunnelService.registerPortsAttributesProvider(portSelector, provider);
      },
      registerTunnelProvider: (tunnelProvider, information) => {
        checkProposedApiEnabled(extension, "tunnelFactory");
        return extHostTunnelService.registerTunnelProvider(tunnelProvider, information);
      },
      registerTimelineProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "timeline");
        return extHostTimeline.registerTimelineProvider(scheme, provider, extension.identifier, extHostCommands.converter);
      },
      get isTrusted() {
        return extHostWorkspace.trusted;
      },
      requestResourceTrust: (options) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return extHostWorkspace.requestResourceTrust(options);
      },
      requestWorkspaceTrust: (options) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return extHostWorkspace.requestWorkspaceTrust(options);
      },
      isResourceTrusted: (resource) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return extHostWorkspace.isResourceTrusted(resource);
      },
      onDidChangeWorkspaceTrustedFolders: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspaceTrustedFolders)(listener, thisArgs, disposables);
      },
      onDidGrantWorkspaceTrust: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostWorkspace.onDidGrantWorkspaceTrust)(listener, thisArgs, disposables);
      },
      registerEditSessionIdentityProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "editSessionIdentityProvider");
        return extHostWorkspace.registerEditSessionIdentityProvider(scheme, provider);
      },
      onWillCreateEditSessionIdentity: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "editSessionIdentityProvider");
        return _asExtensionEvent(extHostWorkspace.getOnWillCreateEditSessionIdentityEvent(extension))(listener, thisArgs, disposables);
      },
      registerCanonicalUriProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "canonicalUriProvider");
        return extHostWorkspace.registerCanonicalUriProvider(scheme, provider);
      },
      getCanonicalUri: (uri, options, token) => {
        checkProposedApiEnabled(extension, "canonicalUriProvider");
        return extHostWorkspace.provideCanonicalUri(uri, options, token);
      },
      decode(content, options) {
        return extHostWorkspace.decode(content, options);
      },
      encode(content, options) {
        return extHostWorkspace.encode(content, options);
      }
    };
    const scm = {
      get inputBox() {
        extHostApiDeprecation.report(
          "scm.inputBox",
          extension,
          `Use 'SourceControl.inputBox' instead`
        );
        return extHostSCM.getLastInputBox(extension);
      },
      createSourceControl(id, label, rootUri, iconPath, isHidden, parent) {
        if (iconPath || isHidden || parent) {
          checkProposedApiEnabled(extension, "scmProviderOptions");
        }
        return extHostSCM.createSourceControl(extension, id, label, rootUri, iconPath, isHidden, parent);
      }
    };
    const comments = {
      createCommentController(id, label) {
        return extHostComment.createCommentController(extension, id, label);
      }
    };
    const debug = {
      get activeDebugSession() {
        return extHostDebugService.activeDebugSession;
      },
      get activeDebugConsole() {
        return extHostDebugService.activeDebugConsole;
      },
      get breakpoints() {
        return extHostDebugService.breakpoints;
      },
      get activeStackItem() {
        return extHostDebugService.activeStackItem;
      },
      registerDebugVisualizationProvider(id, provider) {
        checkProposedApiEnabled(extension, "debugVisualization");
        return extHostDebugService.registerDebugVisualizationProvider(extension, id, provider);
      },
      registerDebugVisualizationTreeProvider(id, provider) {
        checkProposedApiEnabled(extension, "debugVisualization");
        return extHostDebugService.registerDebugVisualizationTree(extension, id, provider);
      },
      onDidStartDebugSession(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidStartDebugSession)(listener, thisArg, disposables);
      },
      onDidTerminateDebugSession(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidTerminateDebugSession)(listener, thisArg, disposables);
      },
      onDidChangeActiveDebugSession(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidChangeActiveDebugSession)(listener, thisArg, disposables);
      },
      onDidReceiveDebugSessionCustomEvent(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidReceiveDebugSessionCustomEvent)(listener, thisArg, disposables);
      },
      onDidChangeBreakpoints(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidChangeBreakpoints)(listener, thisArgs, disposables);
      },
      onDidChangeActiveStackItem(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidChangeActiveStackItem)(listener, thisArg, disposables);
      },
      registerDebugConfigurationProvider(debugType, provider, triggerKind) {
        return extHostDebugService.registerDebugConfigurationProvider(debugType, provider, triggerKind || DebugConfigurationProviderTriggerKind.Initial);
      },
      registerDebugAdapterDescriptorFactory(debugType, factory) {
        return extHostDebugService.registerDebugAdapterDescriptorFactory(extension, debugType, factory);
      },
      registerDebugAdapterTrackerFactory(debugType, factory) {
        return extHostDebugService.registerDebugAdapterTrackerFactory(debugType, factory);
      },
      startDebugging(folder, nameOrConfig, parentSessionOrOptions) {
        if (!parentSessionOrOptions || typeof parentSessionOrOptions === "object" && "configuration" in parentSessionOrOptions) {
          return extHostDebugService.startDebugging(folder, nameOrConfig, { parentSession: parentSessionOrOptions });
        }
        return extHostDebugService.startDebugging(folder, nameOrConfig, parentSessionOrOptions || {});
      },
      stopDebugging(session) {
        return extHostDebugService.stopDebugging(session);
      },
      addBreakpoints(breakpoints) {
        return extHostDebugService.addBreakpoints(breakpoints);
      },
      removeBreakpoints(breakpoints) {
        return extHostDebugService.removeBreakpoints(breakpoints);
      },
      asDebugSourceUri(source, session) {
        return extHostDebugService.asDebugSourceUri(source, session);
      }
    };
    const tasks = {
      registerTaskProvider: (type, provider) => {
        return extHostTask.registerTaskProvider(extension, type, provider);
      },
      fetchTasks: (filter) => {
        return extHostTask.fetchTasks(filter);
      },
      executeTask: (task) => {
        return extHostTask.executeTask(extension, task);
      },
      get taskExecutions() {
        return extHostTask.taskExecutions;
      },
      onDidStartTask: (listener, thisArgs, disposables) => {
        const wrappedListener = (event) => {
          if (!isProposedApiEnabled(extension, "taskExecutionTerminal")) {
            if (event?.execution?.terminal !== void 0) {
              event.execution.terminal = void 0;
            }
          }
          const eventWithExecution = {
            ...event,
            execution: event.execution
          };
          return listener.call(thisArgs, eventWithExecution);
        };
        return _asExtensionEvent(extHostTask.onDidStartTask)(wrappedListener, thisArgs, disposables);
      },
      onDidEndTask: (listeners, thisArgs, disposables) => {
        return _asExtensionEvent(extHostTask.onDidEndTask)(listeners, thisArgs, disposables);
      },
      onDidStartTaskProcess: (listeners, thisArgs, disposables) => {
        return _asExtensionEvent(extHostTask.onDidStartTaskProcess)(listeners, thisArgs, disposables);
      },
      onDidEndTaskProcess: (listeners, thisArgs, disposables) => {
        return _asExtensionEvent(extHostTask.onDidEndTaskProcess)(listeners, thisArgs, disposables);
      },
      onDidStartTaskProblemMatchers: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "taskProblemMatcherStatus");
        return _asExtensionEvent(extHostTask.onDidStartTaskProblemMatchers)(listeners, thisArgs, disposables);
      },
      onDidEndTaskProblemMatchers: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "taskProblemMatcherStatus");
        return _asExtensionEvent(extHostTask.onDidEndTaskProblemMatchers)(listeners, thisArgs, disposables);
      }
    };
    const notebooks = {
      createNotebookController(id, notebookType, label, handler, rendererScripts) {
        return extHostNotebookKernels.createNotebookController(extension, id, notebookType, label, handler, isProposedApiEnabled(extension, "notebookMessaging") ? rendererScripts : void 0);
      },
      registerNotebookCellStatusBarItemProvider: (notebookType, provider) => {
        return extHostNotebook.registerNotebookCellStatusBarItemProvider(extension, notebookType, provider);
      },
      createRendererMessaging(rendererId) {
        return extHostNotebookRenderers.createRendererMessaging(extension, rendererId);
      },
      createNotebookControllerDetectionTask(notebookType) {
        checkProposedApiEnabled(extension, "notebookKernelSource");
        return extHostNotebookKernels.createNotebookControllerDetectionTask(extension, notebookType);
      },
      registerKernelSourceActionProvider(notebookType, provider) {
        checkProposedApiEnabled(extension, "notebookKernelSource");
        return extHostNotebookKernels.registerKernelSourceActionProvider(extension, notebookType, provider);
      }
    };
    const l10n = {
      t(...params) {
        if (typeof params[0] === "string") {
          const key = params.shift();
          const argsFormatted = !params || typeof params[0] !== "object" ? params : params[0];
          return extHostLocalization.getMessage(extension.identifier.value, { message: key, args: argsFormatted });
        }
        return extHostLocalization.getMessage(extension.identifier.value, params[0]);
      },
      get bundle() {
        return extHostLocalization.getBundle(extension.identifier.value);
      },
      get uri() {
        return extHostLocalization.getBundleUri(extension.identifier.value);
      }
    };
    const interactive = {
      transferActiveChat(toWorkspace) {
        checkProposedApiEnabled(extension, "interactive");
        return extHostChatAgents2.transferActiveChat(toWorkspace);
      }
    };
    const ai = {
      getRelatedInformation(query, types) {
        checkProposedApiEnabled(extension, "aiRelatedInformation");
        return extHostAiRelatedInformation.getRelatedInformation(extension, query, types);
      },
      registerRelatedInformationProvider(type, provider) {
        checkProposedApiEnabled(extension, "aiRelatedInformation");
        return extHostAiRelatedInformation.registerRelatedInformationProvider(extension, type, provider);
      },
      registerEmbeddingVectorProvider(model, provider) {
        checkProposedApiEnabled(extension, "aiRelatedInformation");
        return extHostAiEmbeddingVector.registerEmbeddingVectorProvider(extension, model, provider);
      },
      registerSettingsSearchProvider(provider) {
        checkProposedApiEnabled(extension, "aiSettingsSearch");
        return extHostAiSettingsSearch.registerSettingsSearchProvider(extension, provider);
      }
    };
    const chat = {
      registerMappedEditsProvider(_selector, _provider) {
        checkProposedApiEnabled(extension, "mappedEditsProvider");
        return { dispose() {
        } };
      },
      registerMappedEditsProvider2(provider) {
        checkProposedApiEnabled(extension, "mappedEditsProvider");
        return extHostCodeMapper.registerMappedEditsProvider(extension, provider);
      },
      createChatParticipant(id, handler) {
        return extHostChatAgents2.createChatAgent(extension, id, handler);
      },
      createDynamicChatParticipant(id, dynamicProps, handler) {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostChatAgents2.createDynamicChatAgent(extension, id, dynamicProps, handler);
      },
      registerChatParticipantDetectionProvider(provider) {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostChatAgents2.registerChatParticipantDetectionProvider(extension, provider);
      },
      onDidDisposeChatSession: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return _asExtensionEvent(extHostChatAgents2.onDidDisposeChatSession)(listeners, thisArgs, disposables);
      },
      updateQuotas: (quotas) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        extHostChatQuota.updateQuotas(quotas);
      },
      registerChatSessionItemProvider: (chatSessionType, provider) => {
        checkProposedApiEnabled(extension, "chatSessionsProvider");
        extHostApiDeprecation.report("chat.registerChatSessionItemProvider", extension, `Please migrate to the new chat session controller API`, {
          usageId: chatSessionType
        });
        return extHostChatSessions.registerChatSessionItemProvider(extension, chatSessionType, provider);
      },
      createChatSessionItemController: (chatSessionType, refreshHandler) => {
        checkProposedApiEnabled(extension, "chatSessionsProvider");
        return extHostChatSessions.createChatSessionItemController(extension, chatSessionType, refreshHandler);
      },
      registerChatSessionContentProvider(scheme, provider, chatParticipant, capabilities) {
        checkProposedApiEnabled(extension, "chatSessionsProvider");
        return extHostChatSessions.registerChatSessionContentProvider(extension, scheme, chatParticipant, provider, capabilities);
      },
      registerChatOutputRenderer: (viewType, renderer) => {
        checkProposedApiEnabled(extension, "chatOutputRenderer");
        return extHostChatOutputRenderer.registerChatOutputRenderer(extension, viewType, renderer);
      },
      registerChatWorkspaceContextProvider(id, provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return extHostChatContext.registerChatWorkspaceContextProvider(`${extension.id}-${id}`, provider);
      },
      registerChatAttachContextProvider(id, provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return extHostChatContext.registerChatAttachContextProvider(`${extension.id}-${id}`, provider);
      },
      registerChatTabContextProvider(selector, id, provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return extHostChatContext.registerChatTabContextProvider(selector, `${extension.id}-${id}`, provider);
      },
      registerChatExplicitContextProvider(_id, _provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return { dispose: () => {
        } };
      },
      registerChatResourceContextProvider(_selector, _id, _provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return { dispose: () => {
        } };
      },
      registerCustomAgentProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.agent, provider);
      },
      registerInstructionsProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.instructions, provider);
      },
      registerPromptFileProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.prompt, provider);
      },
      registerSkillProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.skill, provider);
      },
      registerHookProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.hook, provider);
      },
      registerChatDebugLogProvider(provider) {
        checkProposedApiEnabled(extension, "chatDebug");
        return extHostChatDebug.registerChatDebugLogProvider(provider);
      },
      onDidReceiveChatDebugEvent: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatDebug");
        return extHostChatDebug.onDidAddCoreEvent(listener, thisArgs, disposables);
      },
      getCustomAgents(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideCustomAgents(token);
      },
      onDidChangeCustomAgents: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeCustomAgents(listener, thisArgs, disposables);
      },
      getInstructions(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideInstructions(token);
      },
      onDidChangeInstructions: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeInstructions(listener, thisArgs, disposables);
      },
      getSkills(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideSkills(token);
      },
      onDidChangeSkills: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeSkills(listener, thisArgs, disposables);
      },
      getSlashCommands(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideSlashCommands(token);
      },
      onDidChangeSlashCommands: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeSlashCommands(listener, thisArgs, disposables);
      },
      getHooks(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideHooks(token);
      },
      onDidChangeHooks: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeHooks(listener, thisArgs, disposables);
      },
      getPlugins(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.providePlugins(token);
      },
      onDidChangePlugins: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangePlugins(listener, thisArgs, disposables);
      },
      registerChatSessionCustomizationProvider(chatSessionType, metadata, provider) {
        checkProposedApiEnabled(extension, "chatSessionCustomizationProvider");
        return extHostChatAgents2.registerChatSessionCustomizationProvider(extension, chatSessionType, metadata, provider);
      },
      createInputNotification(id) {
        checkProposedApiEnabled(extension, "chatInputNotification");
        return extHostChatInputNotification.createInputNotification(extension, id);
      }
    };
    const lm = {
      selectChatModels: (selector) => {
        return extHostLanguageModels.selectLanguageModels(extension, selector ?? {});
      },
      onDidChangeChatModels: (listener, thisArgs, disposables) => {
        return extHostLanguageModels.onDidChangeProviders(listener, thisArgs, disposables);
      },
      registerLanguageModelChatProvider: (vendor, provider) => {
        return extHostLanguageModels.registerLanguageModelChatProvider(extension, vendor, provider);
      },
      get isModelProxyAvailable() {
        checkProposedApiEnabled(extension, "languageModelProxy");
        return extHostLanguageModels.isModelProxyAvailable;
      },
      onDidChangeModelProxyAvailability: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "languageModelProxy");
        return extHostLanguageModels.onDidChangeModelProxyAvailability(listener, thisArgs, disposables);
      },
      getModelProxy: () => {
        checkProposedApiEnabled(extension, "languageModelProxy");
        return extHostLanguageModels.getModelProxy(extension);
      },
      registerLanguageModelProxyProvider: (provider) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostLanguageModels.registerLanguageModelProxyProvider(extension, provider);
      },
      // --- embeddings
      get embeddingModels() {
        checkProposedApiEnabled(extension, "embeddings");
        return extHostEmbeddings.embeddingsModels;
      },
      onDidChangeEmbeddingModels: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "embeddings");
        return extHostEmbeddings.onDidChange(listener, thisArgs, disposables);
      },
      registerEmbeddingsProvider(embeddingsModel, provider) {
        checkProposedApiEnabled(extension, "embeddings");
        return extHostEmbeddings.registerEmbeddingsProvider(extension, embeddingsModel, provider);
      },
      async computeEmbeddings(embeddingsModel, input, token) {
        checkProposedApiEnabled(extension, "embeddings");
        if (typeof input === "string") {
          return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
        } else {
          return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
        }
      },
      registerTool(name, tool) {
        return extHostLanguageModelTools.registerTool(extension, name, tool);
      },
      registerToolDefinition(definition, tool) {
        return extHostLanguageModelTools.registerToolDefinition(extension, definition, tool);
      },
      invokeTool(nameOrInfo, parameters, token) {
        if (typeof nameOrInfo !== "string") {
          checkProposedApiEnabled(extension, "chatParticipantAdditions");
        }
        return extHostLanguageModelTools.invokeTool(extension, nameOrInfo, parameters, token);
      },
      get tools() {
        return extHostLanguageModelTools.getTools(extension);
      },
      fileIsIgnored(uri, token) {
        return extHostLanguageModels.fileIsIgnored(extension, uri, token);
      },
      registerIgnoredFileProvider(provider) {
        return extHostLanguageModels.registerIgnoredFileProvider(extension, provider);
      },
      registerMcpServerDefinitionProvider(id, provider) {
        return extHostMcp.registerMcpConfigurationProvider(extension, id, provider);
      },
      onDidChangeMcpServerDefinitions: (...args) => {
        checkProposedApiEnabled(extension, "mcpServerDefinitions");
        return _asExtensionEvent(extHostMcp.onDidChangeMcpServerDefinitions)(...args);
      },
      get mcpServerDefinitions() {
        checkProposedApiEnabled(extension, "mcpServerDefinitions");
        return extHostMcp.mcpServerDefinitions;
      },
      startMcpGateway(chatSessionResource) {
        checkProposedApiEnabled(extension, "mcpServerDefinitions");
        return extHostMcp.startMcpGateway(chatSessionResource);
      },
      onDidChangeChatRequestTools(...args) {
        checkProposedApiEnabled(extension, "chatParticipantAdditions");
        return _asExtensionEvent(extHostChatAgents2.onDidChangeChatRequestTools)(...args);
      }
    };
    const speech = {
      registerSpeechProvider(id, provider) {
        checkProposedApiEnabled(extension, "speech");
        return extHostSpeech.registerProvider(extension.identifier, id, provider);
      }
    };
    return {
      version: initData.version,
      // namespaces
      ai,
      authentication,
      commands,
      comments,
      chat,
      debug,
      env,
      extensions,
      interactive,
      l10n,
      languages,
      lm,
      notebooks,
      scm,
      speech,
      tasks,
      tests,
      window,
      workspace,
      // types
      Breakpoint: extHostTypes.Breakpoint,
      TerminalOutputAnchor: extHostTypes.TerminalOutputAnchor,
      ChatResultFeedbackKind: extHostTypes.ChatResultFeedbackKind,
      ChatVariableLevel: extHostTypes.ChatVariableLevel,
      ChatCompletionItem: extHostTypes.ChatCompletionItem,
      ChatReferenceDiagnostic: extHostTypes.ChatReferenceDiagnostic,
      CallHierarchyIncomingCall: extHostTypes.CallHierarchyIncomingCall,
      CallHierarchyItem: extHostTypes.CallHierarchyItem,
      CallHierarchyOutgoingCall: extHostTypes.CallHierarchyOutgoingCall,
      CancellationError: errors.CancellationError,
      CancellationTokenSource,
      CandidatePortSource,
      CodeAction: extHostTypes.CodeAction,
      CodeActionKind: extHostTypes.CodeActionKind,
      CodeActionTriggerKind: extHostTypes.CodeActionTriggerKind,
      CodeLens: extHostTypes.CodeLens,
      Color: extHostTypes.Color,
      ColorInformation: extHostTypes.ColorInformation,
      ColorPresentation: extHostTypes.ColorPresentation,
      ColorThemeKind: extHostTypes.ColorThemeKind,
      CommentMode: extHostTypes.CommentMode,
      CommentState: extHostTypes.CommentState,
      CommentThreadCollapsibleState: extHostTypes.CommentThreadCollapsibleState,
      CommentThreadState: extHostTypes.CommentThreadState,
      CommentThreadApplicability: extHostTypes.CommentThreadApplicability,
      CommentThreadFocus: extHostTypes.CommentThreadFocus,
      CompletionItem: extHostTypes.CompletionItem,
      CompletionItemKind: extHostTypes.CompletionItemKind,
      CompletionItemTag: extHostTypes.CompletionItemTag,
      CompletionList: extHostTypes.CompletionList,
      CompletionTriggerKind: extHostTypes.CompletionTriggerKind,
      ConfigurationTarget: extHostTypes.ConfigurationTarget,
      CustomExecution: extHostTypes.CustomExecution,
      DebugAdapterExecutable: extHostTypes.DebugAdapterExecutable,
      DebugAdapterInlineImplementation: extHostTypes.DebugAdapterInlineImplementation,
      DebugAdapterNamedPipeServer: extHostTypes.DebugAdapterNamedPipeServer,
      DebugAdapterServer: extHostTypes.DebugAdapterServer,
      DebugConfigurationProviderTriggerKind,
      DebugConsoleMode: extHostTypes.DebugConsoleMode,
      DebugVisualization: extHostTypes.DebugVisualization,
      DecorationRangeBehavior: extHostTypes.DecorationRangeBehavior,
      Diagnostic: extHostTypes.Diagnostic,
      DiagnosticRelatedInformation: extHostTypes.DiagnosticRelatedInformation,
      DiagnosticSeverity: extHostTypes.DiagnosticSeverity,
      DiagnosticTag: extHostTypes.DiagnosticTag,
      Disposable: extHostTypes.Disposable,
      DocumentHighlight: extHostTypes.DocumentHighlight,
      DocumentHighlightKind: extHostTypes.DocumentHighlightKind,
      MultiDocumentHighlight: extHostTypes.MultiDocumentHighlight,
      DocumentLink: extHostTypes.DocumentLink,
      DocumentSymbol: extHostTypes.DocumentSymbol,
      EndOfLine: extHostTypes.EndOfLine,
      EnvironmentVariableMutatorType: extHostTypes.EnvironmentVariableMutatorType,
      EvaluatableExpression: extHostTypes.EvaluatableExpression,
      InlineValueText: extHostTypes.InlineValueText,
      InlineValueVariableLookup: extHostTypes.InlineValueVariableLookup,
      InlineValueEvaluatableExpression: extHostTypes.InlineValueEvaluatableExpression,
      InlineCompletionTriggerKind: extHostTypes.InlineCompletionTriggerKind,
      InlineCompletionsDisposeReasonKind: extHostTypes.InlineCompletionsDisposeReasonKind,
      EventEmitter: Emitter,
      ExtensionKind: extHostTypes.ExtensionKind,
      ExtensionMode: extHostTypes.ExtensionMode,
      ExternalUriOpenerPriority: extHostTypes.ExternalUriOpenerPriority,
      FileChangeType: extHostTypes.FileChangeType,
      FileDecoration: extHostTypes.FileDecoration,
      FileDecoration2: extHostTypes.FileDecoration,
      FileSystemError: extHostTypes.FileSystemError,
      FileType: files.FileType,
      FilePermission: files.FilePermission,
      FoldingRange: extHostTypes.FoldingRange,
      FoldingRangeKind: extHostTypes.FoldingRangeKind,
      FunctionBreakpoint: extHostTypes.FunctionBreakpoint,
      InlineCompletionItem: extHostTypes.InlineSuggestion,
      InlineCompletionList: extHostTypes.InlineSuggestionList,
      Hover: extHostTypes.Hover,
      VerboseHover: extHostTypes.VerboseHover,
      HoverVerbosityAction: extHostTypes.HoverVerbosityAction,
      IndentAction: languageConfiguration.IndentAction,
      Location: extHostTypes.Location,
      MarkdownString: extHostTypes.MarkdownString,
      OverviewRulerLane,
      ParameterInformation: extHostTypes.ParameterInformation,
      PortAutoForwardAction: extHostTypes.PortAutoForwardAction,
      Position: extHostTypes.Position,
      ProcessExecution: extHostTypes.ProcessExecution,
      ProgressLocation: extHostTypes.ProgressLocation,
      QuickInputButtonLocation: extHostTypes.QuickInputButtonLocation,
      QuickInputButtons: extHostTypes.QuickInputButtons,
      Range: extHostTypes.Range,
      RelativePattern: extHostTypes.RelativePattern,
      Selection: extHostTypes.Selection,
      SelectionRange: extHostTypes.SelectionRange,
      SemanticTokens: extHostTypes.SemanticTokens,
      SemanticTokensBuilder: extHostTypes.SemanticTokensBuilder,
      SemanticTokensEdit: extHostTypes.SemanticTokensEdit,
      SemanticTokensEdits: extHostTypes.SemanticTokensEdits,
      SemanticTokensLegend: extHostTypes.SemanticTokensLegend,
      ShellExecution: extHostTypes.ShellExecution,
      ShellQuoting: extHostTypes.ShellQuoting,
      SignatureHelp: extHostTypes.SignatureHelp,
      SignatureHelpTriggerKind: extHostTypes.SignatureHelpTriggerKind,
      SignatureInformation: extHostTypes.SignatureInformation,
      SnippetString: extHostTypes.SnippetString,
      SourceBreakpoint: extHostTypes.SourceBreakpoint,
      StandardTokenType: extHostTypes.StandardTokenType,
      SyntaxHighlightingTokenFontStyle: extHostTypes.SyntaxHighlightingTokenFontStyle,
      StatusBarAlignment: extHostTypes.StatusBarAlignment,
      SymbolInformation: extHostTypes.SymbolInformation,
      SymbolKind: extHostTypes.SymbolKind,
      SymbolTag: extHostTypes.SymbolTag,
      Task: extHostTypes.Task,
      TaskEventKind: extHostTypes.TaskEventKind,
      TaskGroup: extHostTypes.TaskGroup,
      TaskPanelKind: extHostTypes.TaskPanelKind,
      TaskRevealKind: extHostTypes.TaskRevealKind,
      TaskRunOn: extHostTypes.TaskRunOn,
      TaskScope: extHostTypes.TaskScope,
      TerminalLink: extHostTypes.TerminalLink,
      TerminalQuickFixTerminalCommand: extHostTypes.TerminalQuickFixCommand,
      TerminalQuickFixOpener: extHostTypes.TerminalQuickFixOpener,
      TerminalLocation: extHostTypes.TerminalLocation,
      TerminalProfile: extHostTypes.TerminalProfile,
      TerminalExitReason: extHostTypes.TerminalExitReason,
      TerminalShellExecutionCommandLineConfidence: extHostTypes.TerminalShellExecutionCommandLineConfidence,
      TerminalCompletionItem: extHostTypes.TerminalCompletionItem,
      TerminalCompletionItemKind: extHostTypes.TerminalCompletionItemKind,
      TerminalCompletionList: extHostTypes.TerminalCompletionList,
      TerminalShellType: extHostTypes.TerminalShellType,
      TextDocumentSaveReason: extHostTypes.TextDocumentSaveReason,
      TextEdit: extHostTypes.TextEdit,
      SnippetTextEdit: extHostTypes.SnippetTextEdit,
      TextEditorCursorStyle,
      TextEditorChangeKind: extHostTypes.TextEditorChangeKind,
      TextEditorLineNumbersStyle: extHostTypes.TextEditorLineNumbersStyle,
      TextEditorRevealType: extHostTypes.TextEditorRevealType,
      TextEditorSelectionChangeKind: extHostTypes.TextEditorSelectionChangeKind,
      SyntaxTokenType: extHostTypes.SyntaxTokenType,
      TextDocumentChangeReason: extHostTypes.TextDocumentChangeReason,
      ThemeColor: extHostTypes.ThemeColor,
      ThemeIcon: extHostTypes.ThemeIcon,
      TreeItem: extHostTypes.TreeItem,
      TreeItemCheckboxState: extHostTypes.TreeItemCheckboxState,
      TreeItemCollapsibleState: extHostTypes.TreeItemCollapsibleState,
      TypeHierarchyItem: extHostTypes.TypeHierarchyItem,
      UIKind,
      Uri: URI,
      ViewColumn: extHostTypes.ViewColumn,
      WorkspaceEdit: extHostTypes.WorkspaceEdit,
      // proposed api types
      DocumentPasteTriggerKind: extHostTypes.DocumentPasteTriggerKind,
      DocumentDropEdit: extHostTypes.DocumentDropEdit,
      DocumentDropOrPasteEditKind: extHostTypes.DocumentDropOrPasteEditKind,
      DocumentPasteEdit: extHostTypes.DocumentPasteEdit,
      InlayHint: extHostTypes.InlayHint,
      InlayHintLabelPart: extHostTypes.InlayHintLabelPart,
      InlayHintKind: extHostTypes.InlayHintKind,
      RemoteAuthorityResolverError: extHostTypes.RemoteAuthorityResolverError,
      ResolvedAuthority: extHostTypes.ResolvedAuthority,
      ManagedResolvedAuthority: extHostTypes.ManagedResolvedAuthority,
      SourceControlInputBoxValidationType: extHostTypes.SourceControlInputBoxValidationType,
      ExtensionRuntime: extHostTypes.ExtensionRuntime,
      TimelineItem: extHostTypes.TimelineItem,
      NotebookRange: extHostTypes.NotebookRange,
      NotebookCellKind: extHostTypes.NotebookCellKind,
      NotebookCellExecutionState: extHostTypes.NotebookCellExecutionState,
      NotebookCellData: extHostTypes.NotebookCellData,
      NotebookData: extHostTypes.NotebookData,
      NotebookRendererScript: extHostTypes.NotebookRendererScript,
      NotebookCellStatusBarAlignment: extHostTypes.NotebookCellStatusBarAlignment,
      NotebookEditorRevealType: extHostTypes.NotebookEditorRevealType,
      NotebookCellOutput: extHostTypes.NotebookCellOutput,
      NotebookCellOutputItem: extHostTypes.NotebookCellOutputItem,
      CellErrorStackFrame: extHostTypes.CellErrorStackFrame,
      NotebookCellStatusBarItem: extHostTypes.NotebookCellStatusBarItem,
      NotebookControllerAffinity: extHostTypes.NotebookControllerAffinity,
      NotebookControllerAffinity2: extHostTypes.NotebookControllerAffinity2,
      NotebookEdit: extHostTypes.NotebookEdit,
      NotebookKernelSourceAction: extHostTypes.NotebookKernelSourceAction,
      NotebookVariablesRequestKind: extHostTypes.NotebookVariablesRequestKind,
      PortAttributes: extHostTypes.PortAttributes,
      LinkedEditingRanges: extHostTypes.LinkedEditingRanges,
      TestResultState: extHostTypes.TestResultState,
      TestRunRequest: extHostTypes.TestRunRequest,
      TestMessage: extHostTypes.TestMessage,
      TestMessageStackFrame: extHostTypes.TestMessageStackFrame,
      TestTag: extHostTypes.TestTag,
      TestRunProfileKind: extHostTypes.TestRunProfileKind,
      TextSearchCompleteMessageType,
      DataTransfer: extHostTypes.DataTransfer,
      DataTransferItem: extHostTypes.DataTransferItem,
      TestCoverageCount: extHostTypes.TestCoverageCount,
      FileCoverage: extHostTypes.FileCoverage,
      StatementCoverage: extHostTypes.StatementCoverage,
      BranchCoverage: extHostTypes.BranchCoverage,
      DeclarationCoverage: extHostTypes.DeclarationCoverage,
      WorkspaceTrustState: extHostTypes.WorkspaceTrustState,
      LanguageStatusSeverity: extHostTypes.LanguageStatusSeverity,
      QuickPickItemKind: extHostTypes.QuickPickItemKind,
      InputBoxValidationSeverity: extHostTypes.InputBoxValidationSeverity,
      TabInputText: extHostTypes.TextTabInput,
      TabInputTextDiff: extHostTypes.TextDiffTabInput,
      TabInputTextMerge: extHostTypes.TextMergeTabInput,
      TabInputCustom: extHostTypes.CustomEditorTabInput,
      TabInputNotebook: extHostTypes.NotebookEditorTabInput,
      TabInputNotebookDiff: extHostTypes.NotebookDiffEditorTabInput,
      TabInputWebview: extHostTypes.WebviewEditorTabInput,
      TabInputTerminal: extHostTypes.TerminalEditorTabInput,
      TabInputInteractiveWindow: extHostTypes.InteractiveWindowInput,
      TabInputChat: extHostTypes.ChatEditorTabInput,
      TabInputTextMultiDiff: extHostTypes.TextMultiDiffTabInput,
      TelemetryTrustedValue,
      LogLevel,
      EditSessionIdentityMatch,
      InteractiveSessionVoteDirection: extHostTypes.InteractiveSessionVoteDirection,
      ChatCopyKind: extHostTypes.ChatCopyKind,
      ChatSessionChangedFile: extHostTypes.ChatSessionChangedFile,
      ChatEditingSessionActionOutcome: extHostTypes.ChatEditingSessionActionOutcome,
      InteractiveEditorResponseFeedbackKind: extHostTypes.InteractiveEditorResponseFeedbackKind,
      DebugStackFrame: extHostTypes.DebugStackFrame,
      DebugThread: extHostTypes.DebugThread,
      RelatedInformationType: extHostTypes.RelatedInformationType,
      SpeechToTextStatus: extHostTypes.SpeechToTextStatus,
      TextToSpeechStatus: extHostTypes.TextToSpeechStatus,
      PartialAcceptTriggerKind: extHostTypes.PartialAcceptTriggerKind,
      InlineCompletionEndOfLifeReasonKind: extHostTypes.InlineCompletionEndOfLifeReasonKind,
      InlineCompletionDisplayLocationKind: extHostTypes.InlineCompletionDisplayLocationKind,
      KeywordRecognitionStatus: extHostTypes.KeywordRecognitionStatus,
      ChatImageMimeType: extHostTypes.ChatImageMimeType,
      ChatResponseMarkdownPart: extHostTypes.ChatResponseMarkdownPart,
      ChatResponseFileTreePart: extHostTypes.ChatResponseFileTreePart,
      ChatResponseAnchorPart: extHostTypes.ChatResponseAnchorPart,
      ChatResponseProgressPart: extHostTypes.ChatResponseProgressPart,
      ChatResponseProgressPart2: extHostTypes.ChatResponseProgressPart2,
      ChatResponseThinkingProgressPart: extHostTypes.ChatResponseThinkingProgressPart,
      ChatResponseHookPart: extHostTypes.ChatResponseHookPart,
      ChatResponseVoiceProgressPart: extHostTypes.ChatResponseVoiceProgressPart,
      ChatResponseAutoModeResolutionPart: extHostTypes.ChatResponseAutoModeResolutionPart,
      ChatResponseReferencePart: extHostTypes.ChatResponseReferencePart,
      ChatResponseReferencePart2: extHostTypes.ChatResponseReferencePart,
      ChatResponseCodeCitationPart: extHostTypes.ChatResponseCodeCitationPart,
      ChatResponseCodeblockUriPart: extHostTypes.ChatResponseCodeblockUriPart,
      ChatResponseWarningPart: extHostTypes.ChatResponseWarningPart,
      ChatResponseInfoPart: extHostTypes.ChatResponseInfoPart,
      ChatResponseTextEditPart: extHostTypes.ChatResponseTextEditPart,
      ChatResponseNotebookEditPart: extHostTypes.ChatResponseNotebookEditPart,
      ChatResponseWorkspaceEditPart: extHostTypes.ChatResponseWorkspaceEditPart,
      ChatResponseMarkdownWithVulnerabilitiesPart: extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart,
      ChatResponseCommandButtonPart: extHostTypes.ChatResponseCommandButtonPart,
      ChatResponseConfirmationPart: extHostTypes.ChatResponseConfirmationPart,
      ChatQuestion: extHostTypes.ChatQuestion,
      ChatQuestionType: extHostTypes.ChatQuestionType,
      ChatResponseQuestionCarouselPart: extHostTypes.ChatResponseQuestionCarouselPart,
      ChatResponseMovePart: extHostTypes.ChatResponseMovePart,
      ChatResponseExtensionsPart: extHostTypes.ChatResponseExtensionsPart,
      ChatResponseExternalEditPart: extHostTypes.ChatResponseExternalEditPart,
      ChatResponsePullRequestPart: extHostTypes.ChatResponsePullRequestPart,
      ChatResponseMultiDiffPart: extHostTypes.ChatResponseMultiDiffPart,
      ChatResponseReferencePartStatusKind: extHostTypes.ChatResponseReferencePartStatusKind,
      ChatResponseClearToPreviousToolInvocationReason: extHostTypes.ChatResponseClearToPreviousToolInvocationReason,
      ChatRequestTurn: extHostTypes.ChatRequestTurn,
      ChatRequestTurn2: extHostTypes.ChatRequestTurn,
      ChatResponseTurn: extHostTypes.ChatResponseTurn,
      ChatResponseTurn2: extHostTypes.ChatResponseTurn2,
      ChatSubagentToolInvocationData: extHostTypes.ChatSubagentToolInvocationData,
      ChatToolInvocationPart: extHostTypes.ChatToolInvocationPart,
      ChatLocation: extHostTypes.ChatLocation,
      ChatSessionStatus: extHostTypes.ChatSessionStatus,
      ChatSessionCustomizationType: extHostTypes.ChatSessionCustomizationType,
      ChatDebugLogLevel: extHostTypes.ChatDebugLogLevel,
      ChatDebugToolCallResult: extHostTypes.ChatDebugToolCallResult,
      ChatDebugHookResult: extHostTypes.ChatDebugHookResult,
      ChatDebugToolCallEvent: extHostTypes.ChatDebugToolCallEvent,
      ChatDebugModelTurnEvent: extHostTypes.ChatDebugModelTurnEvent,
      ChatDebugGenericEvent: extHostTypes.ChatDebugGenericEvent,
      ChatDebugSubagentInvocationEvent: extHostTypes.ChatDebugSubagentInvocationEvent,
      ChatDebugUserMessageEvent: extHostTypes.ChatDebugUserMessageEvent,
      ChatDebugAgentResponseEvent: extHostTypes.ChatDebugAgentResponseEvent,
      ChatDebugMessageSection: extHostTypes.ChatDebugMessageSection,
      ChatDebugEventTextContent: extHostTypes.ChatDebugEventTextContent,
      ChatDebugMessageContentType: extHostTypes.ChatDebugMessageContentType,
      ChatDebugEventMessageContent: extHostTypes.ChatDebugEventMessageContent,
      ChatDebugEventToolCallContent: extHostTypes.ChatDebugEventToolCallContent,
      ChatDebugEventModelTurnContent: extHostTypes.ChatDebugEventModelTurnContent,
      ChatDebugEventHookContent: extHostTypes.ChatDebugEventHookContent,
      ChatRequestEditorData: extHostTypes.ChatRequestEditorData,
      ChatRequestNotebookData: extHostTypes.ChatRequestNotebookData,
      ChatReferenceBinaryData: extHostTypes.ChatReferenceBinaryData,
      ChatRequestEditedFileEventKind: extHostTypes.ChatRequestEditedFileEventKind,
      LanguageModelChatMessageRole: extHostTypes.LanguageModelChatMessageRole,
      LanguageModelChatMessage: extHostTypes.LanguageModelChatMessage,
      LanguageModelChatMessage2: extHostTypes.LanguageModelChatMessage2,
      LanguageModelToolResultPart: extHostTypes.LanguageModelToolResultPart,
      LanguageModelToolResultPart2: extHostTypes.LanguageModelToolResultPart,
      LanguageModelTextPart: extHostTypes.LanguageModelTextPart,
      LanguageModelTextPart2: extHostTypes.LanguageModelTextPart,
      LanguageModelPartAudience: extHostTypes.LanguageModelPartAudience,
      ToolResultAudience: extHostTypes.LanguageModelPartAudience,
      // back compat
      LanguageModelToolCallPart: extHostTypes.LanguageModelToolCallPart,
      LanguageModelThinkingPart: extHostTypes.LanguageModelThinkingPart,
      LanguageModelError: extHostTypes.LanguageModelError,
      LanguageModelToolResult: extHostTypes.LanguageModelToolResult,
      LanguageModelToolResult2: extHostTypes.LanguageModelToolResult2,
      LanguageModelDataPart: extHostTypes.LanguageModelDataPart,
      LanguageModelDataPart2: extHostTypes.LanguageModelDataPart,
      LanguageModelToolExtensionSource: extHostTypes.LanguageModelToolExtensionSource,
      LanguageModelToolMCPSource: extHostTypes.LanguageModelToolMCPSource,
      ExtendedLanguageModelToolResult: extHostTypes.ExtendedLanguageModelToolResult,
      LanguageModelChatToolMode: extHostTypes.LanguageModelChatToolMode,
      LanguageModelPromptTsxPart: extHostTypes.LanguageModelPromptTsxPart,
      NewSymbolName: extHostTypes.NewSymbolName,
      NewSymbolNameTag: extHostTypes.NewSymbolNameTag,
      NewSymbolNameTriggerKind: extHostTypes.NewSymbolNameTriggerKind,
      ExcludeSettingOptions,
      TextSearchContext2,
      TextSearchMatch2,
      AISearchKeyword,
      TextSearchCompleteMessageTypeNew: TextSearchCompleteMessageType,
      ChatErrorLevel: extHostTypes.ChatErrorLevel,
      ChatInputNotificationSeverity: extHostTypes.ChatInputNotificationSeverity,
      McpHttpServerDefinition: extHostTypes.McpHttpServerDefinition,
      McpHttpServerDefinition2: extHostTypes.McpHttpServerDefinition,
      McpStdioServerDefinition: extHostTypes.McpStdioServerDefinition,
      McpStdioServerDefinition2: extHostTypes.McpStdioServerDefinition,
      McpToolAvailability: extHostTypes.McpToolAvailability,
      McpToolInvocationContentData: extHostTypes.McpToolInvocationContentData,
      SettingsSearchResultKind: extHostTypes.SettingsSearchResultKind,
      ChatTodoStatus: extHostTypes.ChatTodoStatus,
      ChatDebugSubagentStatus: extHostTypes.ChatDebugSubagentStatus
    };
  };
}
export {
  createApiFactoryAndRegisterActors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3QuYXBpLmltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZU9iamVjdCwgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzLCBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JDdXJzb3JTdHlsZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgc2NvcmUsIHRhcmdldHNOb3RlYm9va3MgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlU2VsZWN0b3IuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VDb25maWd1cmF0aW9uIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBPdmVydmlld1J1bGVyTGFuZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRXJyb3IsIEV4dGVuc2lvbklkZW50aWZpZXJTZXQsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0ICogYXMgZmlsZXMgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBJTG9nZ2VyU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBnZXRSZW1vdGVOYW1lIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVIb3N0cy5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQgfSBmcm9tICcuLi8uLi9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFVJS2luZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFByb3h5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBBSVNlYXJjaEtleXdvcmQsIEV4Y2x1ZGVTZXR0aW5nT3B0aW9ucywgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUsIFRleHRTZWFyY2hDb250ZXh0MiwgVGV4dFNlYXJjaE1hdGNoMiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoRXh0VHlwZXMuanMnO1xuaW1wb3J0IHsgQ2FuZGlkYXRlUG9ydFNvdXJjZSwgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RMb2dMZXZlbFNlcnZpY2VTaGFwZSwgSURvY3VtZW50RGlmZkxpbmVDaGFuZ2VEdG8sIE1haW5Db250ZXh0IH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3RSZWxhdGVkSW5mb3JtYXRpb24gfSBmcm9tICcuL2V4dEhvc3RBaVJlbGF0ZWRJbmZvcm1hdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0QWlTZXR0aW5nc1NlYXJjaCB9IGZyb20gJy4vZXh0SG9zdEFpU2V0dGluZ3NTZWFyY2guanMnO1xuaW1wb3J0IHsgRXh0SG9zdEFwaUNvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0QXBpQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RBdXRoZW50aWNhdGlvbiB9IGZyb20gJy4vZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dEhvc3RCdWxrRWRpdHMgfSBmcm9tICcuL2V4dEhvc3RCdWxrRWRpdHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRBZ2VudHMyIH0gZnJvbSAnLi9leHRIb3N0Q2hhdEFnZW50czIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRPdXRwdXRSZW5kZXJlciB9IGZyb20gJy4vZXh0SG9zdENoYXRPdXRwdXRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdFNlc3Npb25zIH0gZnJvbSAnLi9leHRIb3N0Q2hhdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0U3RhdHVzIH0gZnJvbSAnLi9leHRIb3N0Q2hhdFN0YXR1cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdFF1b3RhIH0gZnJvbSAnLi9leHRIb3N0Q2hhdFF1b3RhLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0SW5wdXROb3RpZmljYXRpb24gfSBmcm9tICcuL2V4dEhvc3RDaGF0SW5wdXROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdENsaXBib2FyZCB9IGZyb20gJy4vZXh0SG9zdENsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RWRpdG9ySW5zZXRzIH0gZnJvbSAnLi9leHRIb3N0Q29kZUluc2V0cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29kZU1hcHBlciB9IGZyb20gJy4vZXh0SG9zdENvZGVNYXBwZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUV4dEhvc3RDb21tZW50cyB9IGZyb20gJy4vZXh0SG9zdENvbW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb25maWdQcm92aWRlciwgSUV4dEhvc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q3VzdG9tRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdEN1c3RvbUVkaXRvcnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REYXRhQ2hhbm5lbHMgfSBmcm9tICcuL2V4dEhvc3REYXRhQ2hhbm5lbHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REZWJ1Z1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3REZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REZWNvcmF0aW9ucyB9IGZyb20gJy4vZXh0SG9zdERlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3REaWFnbm9zdGljcyB9IGZyb20gJy4vZXh0SG9zdERpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REaWFsb2dzIH0gZnJvbSAnLi9leHRIb3N0RGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50IH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RWRpdG9yVGFicyB9IGZyb20gJy4vZXh0SG9zdEVkaXRvclRhYnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEVtYmVkZGluZ3MgfSBmcm9tICcuL2V4dEhvc3RFbWJlZGRpbmcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEFpRW1iZWRkaW5nVmVjdG9yIH0gZnJvbSAnLi9leHRIb3N0RW1iZWRkaW5nVmVjdG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbiwgSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RmlsZVN5c3RlbSB9IGZyb20gJy4vZXh0SG9zdEZpbGVTeXN0ZW0uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0gfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtQ29uc3VtZXIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UsIEZpbGVTeXN0ZW1XYXRjaGVyQ3JlYXRlT3B0aW9ucyB9IGZyb20gJy4vZXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyB9IGZyb20gJy4vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RJbnRlcmFjdGl2ZSB9IGZyb20gJy4vZXh0SG9zdEludGVyYWN0aXZlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYWJlbFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RMYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4vZXh0SG9zdExhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZXMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0TG9jYWxpemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdE1hbmFnZWRTb2NrZXRzIH0gZnJvbSAnLi9leHRIb3N0TWFuYWdlZFNvY2tldHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RCcm93c2VyVHVubmVsUHJveHkgfSBmcm9tICcuL2V4dEhvc3RCcm93c2VyVHVubmVsUHJveHkuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RNcGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0TWNwLmpzJztcbmltcG9ydCB7IEV4dEhvc3RNZXNzYWdlU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va0NvbnRyb2xsZXIgfSBmcm9tICcuL2V4dEhvc3ROb3RlYm9vay5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudFNhdmVQYXJ0aWNpcGFudCB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rRG9jdW1lbnRTYXZlUGFydGljaXBhbnQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rRG9jdW1lbnRzIH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tLZXJuZWxzIH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2tLZXJuZWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va1JlbmRlcmVycyB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rUmVuZGVyZXJzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0T3V0cHV0U2VydmljZSB9IGZyb20gJy4vZXh0SG9zdE91dHB1dC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0UHJvZmlsZUNvbnRlbnRIYW5kbGVycyB9IGZyb20gJy4vZXh0SG9zdFByb2ZpbGVDb250ZW50SGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFByb2dyZXNzIH0gZnJvbSAnLi9leHRIb3N0UHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFF1aWNrRGlmZiB9IGZyb20gJy4vZXh0SG9zdFF1aWNrRGlmZi5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0QWdlbnRFZGl0b3JDb21tZW50cyB9IGZyb20gJy4vZXh0SG9zdEFnZW50RWRpdG9yQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRXh0SG9zdFF1aWNrT3BlbiB9IGZyb20gJy4vZXh0SG9zdFF1aWNrT3Blbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RTQ00gfSBmcm9tICcuL2V4dEhvc3RTQ00uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RTZWFyY2ggfSBmcm9tICcuL2V4dEhvc3RTZWFyY2guanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RTZWNyZXRTdGF0ZSB9IGZyb20gJy4vZXh0SG9zdFNlY3JldFN0YXRlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RTaGFyZSB9IGZyb20gJy4vZXh0SG9zdFNoYXJlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RTcGVlY2ggfSBmcm9tICcuL2V4dEhvc3RTcGVlY2guanMnO1xuaW1wb3J0IHsgRXh0SG9zdEJyb3dzZXJzIH0gZnJvbSAnLi9leHRIb3N0QnJvd3NlcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFN0YXR1c0JhciB9IGZyb20gJy4vZXh0SG9zdFN0YXR1c0Jhci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFN0b3JhZ2UgfSBmcm9tICcuL2V4dEhvc3RTdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TdG9yYWdlUGF0aHMgfSBmcm9tICcuL2V4dEhvc3RTdG9yYWdlUGF0aHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUYXNrIH0gZnJvbSAnLi9leHRIb3N0VGFzay5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGVsZW1ldHJ5TG9nZ2VyLCBJRXh0SG9zdFRlbGVtZXRyeSwgaXNOZXdBcHBJbnN0YWxsIH0gZnJvbSAnLi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVzdGluZyB9IGZyb20gJy4vZXh0SG9zdFRlc3RpbmcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3RUZXh0RWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGhlbWluZyB9IGZyb20gJy4vZXh0SG9zdFRoZW1pbmcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRpbWVsaW5lIH0gZnJvbSAnLi9leHRIb3N0VGltZWxpbmUuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRyZWVWaWV3cyB9IGZyb20gJy4vZXh0SG9zdFRyZWVWaWV3cy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFR1bm5lbFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RUdW5uZWxTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VXJpT3BlbmVycyB9IGZyb20gJy4vZXh0SG9zdFVyaU9wZW5lci5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VXJsc1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RVcmxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RXZWJ2aWV3cyB9IGZyb20gJy4vZXh0SG9zdFdlYnZpZXcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdlYnZpZXdQYW5lbHMgfSBmcm9tICcuL2V4dEhvc3RXZWJ2aWV3UGFuZWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RXZWJ2aWV3Vmlld3MgfSBmcm9tICcuL2V4dEhvc3RXZWJ2aWV3Vmlldy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFdpbmRvdyB9IGZyb20gJy4vZXh0SG9zdFdpbmRvdy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFBvd2VyIH0gZnJvbSAnLi9leHRIb3N0UG93ZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRDb250ZXh0IH0gZnJvbSAnLi9leHRIb3N0Q2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXREZWJ1ZyB9IGZyb20gJy4vZXh0SG9zdENoYXREZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uIH0gZnJvbSAnLi9leHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RHaXRFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0R2l0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblJlZ2lzdHJpZXMge1xuXHRtaW5lOiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5O1xuXHRhbGw6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkFwaUZhY3Rvcnkge1xuXHQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25SZWdpc3RyaWVzLCBjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKTogdHlwZW9mIHZzY29kZTtcbn1cblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBpbnN0YW50aWF0ZXMgYW5kIHJldHVybnMgdGhlIGV4dGVuc2lvbiBBUEkgc3VyZmFjZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXBpRmFjdG9yeUFuZFJlZ2lzdGVyQWN0b3JzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogSUV4dGVuc2lvbkFwaUZhY3Rvcnkge1xuXG5cdC8vIHNlcnZpY2VzXG5cdGNvbnN0IGluaXREYXRhID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0RmlsZVN5c3RlbUluZm8pO1xuXHRjb25zdCBleHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtKTtcblx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0V29ya3NwYWNlID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0V29ya3NwYWNlKTtcblx0Y29uc3QgZXh0SG9zdFRlbGVtZXRyeSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFRlbGVtZXRyeSk7XG5cdGNvbnN0IGV4dEhvc3RDb25maWd1cmF0aW9uID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0Q29uZmlndXJhdGlvbik7XG5cdGNvbnN0IHVyaVRyYW5zZm9ybWVyID0gYWNjZXNzb3IuZ2V0KElVUklUcmFuc2Zvcm1lclNlcnZpY2UpO1xuXHRjb25zdCBycGNQcm90b2NvbCA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFJwY1NlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0U3RvcmFnZSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFN0b3JhZ2UpO1xuXHRjb25zdCBleHRlbnNpb25TdG9yYWdlUGF0aHMgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvblN0b3JhZ2VQYXRocyk7XG5cdGNvbnN0IGV4dEhvc3RMb2dnZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dnZXJTZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdExvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0VHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFR1bm5lbFNlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0QXBpRGVwcmVjYXRpb24gPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0V2luZG93ID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0V2luZG93KTtcblx0Y29uc3QgZXh0SG9zdFBvd2VyID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0UG93ZXIpO1xuXHRjb25zdCBleHRIb3N0VXJscyA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFVybHNTZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdFNlY3JldFN0YXRlID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0U2VjcmV0U3RhdGUpO1xuXHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IGFjY2Vzc29yLmdldChJRXh0SG9zdEVkaXRvclRhYnMpO1xuXHRjb25zdCBleHRIb3N0TWFuYWdlZFNvY2tldHMgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RNYW5hZ2VkU29ja2V0cyk7XG5cdGNvbnN0IGV4dEhvc3RCcm93c2VyVHVubmVsUHJveHkgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RCcm93c2VyVHVubmVsUHJveHkpO1xuXHRjb25zdCBleHRIb3N0UHJvZ3Jlc3MgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RQcm9ncmVzcyk7XG5cdGNvbnN0IGV4dEhvc3RBdXRoZW50aWNhdGlvbiA9IGFjY2Vzc29yLmdldChJRXh0SG9zdEF1dGhlbnRpY2F0aW9uKTtcblx0Y29uc3QgZXh0SG9zdExhbmd1YWdlTW9kZWxzID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMpO1xuXHRjb25zdCBleHRIb3N0TWNwID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0TXBjU2VydmljZSk7XG5cdGNvbnN0IGV4dEhvc3REYXRhQ2hhbm5lbHMgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3REYXRhQ2hhbm5lbHMpO1xuXHRjb25zdCBleHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24gPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RNZXRlcmVkQ29ubmVjdGlvbik7XG5cdGNvbnN0IGV4dEhvc3RHaXRFeHRlbnNpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0R2l0RXh0ZW5zaW9uU2VydmljZSk7XG5cblx0Ly8gcmVnaXN0ZXIgYWRkcmVzc2FibGUgaW5zdGFuY2VzXG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RmlsZVN5c3RlbUluZm8sIGV4dEhvc3RGaWxlU3lzdGVtSW5mbyk7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExvZ0xldmVsU2VydmljZVNoYXBlLCA8RXh0SG9zdExvZ0xldmVsU2VydmljZVNoYXBlPjxhbnk+ZXh0SG9zdExvZ2dlclNlcnZpY2UpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFdvcmtzcGFjZSwgZXh0SG9zdFdvcmtzcGFjZSk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29uZmlndXJhdGlvbiwgZXh0SG9zdENvbmZpZ3VyYXRpb24pO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFN0b3JhZ2UsIGV4dEhvc3RTdG9yYWdlKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUdW5uZWxTZXJ2aWNlLCBleHRIb3N0VHVubmVsU2VydmljZSk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0V2luZG93LCBleHRIb3N0V2luZG93KTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RQb3dlciwgZXh0SG9zdFBvd2VyKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RVcmxzLCBleHRIb3N0VXJscyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0U2VjcmV0U3RhdGUsIGV4dEhvc3RTZWNyZXRTdGF0ZSk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VGVsZW1ldHJ5LCBleHRIb3N0VGVsZW1ldHJ5KTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RFZGl0b3JUYWJzLCBleHRIb3N0RWRpdG9yVGFicyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0TWFuYWdlZFNvY2tldHMsIGV4dEhvc3RNYW5hZ2VkU29ja2V0cyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0QnJvd3NlclR1bm5lbFByb3h5LCBleHRIb3N0QnJvd3NlclR1bm5lbFByb3h5KTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RQcm9ncmVzcywgZXh0SG9zdFByb2dyZXNzKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RBdXRoZW50aWNhdGlvbiwgZXh0SG9zdEF1dGhlbnRpY2F0aW9uKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0UHJvdmlkZXIsIGV4dEhvc3RMYW5ndWFnZU1vZGVscyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGF0YUNoYW5uZWxzLCBleHRIb3N0RGF0YUNoYW5uZWxzKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RNZXRlcmVkQ29ubmVjdGlvbiwgZXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RHaXRFeHRlbnNpb24sIGV4dEhvc3RHaXRFeHRlbnNpb25TZXJ2aWNlKTtcblxuXHQvLyBhdXRvbWF0aWNhbGx5IGNyZWF0ZSBhbmQgcmVnaXN0ZXIgYWRkcmVzc2FibGUgaW5zdGFuY2VzXG5cdGNvbnN0IGV4dEhvc3REZWNvcmF0aW9ucyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGVjb3JhdGlvbnMsIGFjY2Vzc29yLmdldChJRXh0SG9zdERlY29yYXRpb25zKSk7XG5cdGNvbnN0IGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKSk7XG5cdGNvbnN0IGV4dEhvc3RDb21tYW5kcyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29tbWFuZHMsIGFjY2Vzc29yLmdldChJRXh0SG9zdENvbW1hbmRzKSk7XG5cdGNvbnN0IGV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRlcm1pbmFsU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFeHRIb3N0VGVybWluYWxTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24gPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbiwgYWNjZXNzb3IuZ2V0KElFeHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uKSk7XG5cdGNvbnN0IGV4dEhvc3REZWJ1Z1NlcnZpY2UgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERlYnVnU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFeHRIb3N0RGVidWdTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RTZWFyY2ggPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNlYXJjaCwgYWNjZXNzb3IuZ2V0KElFeHRIb3N0U2VhcmNoKSk7XG5cdGNvbnN0IGV4dEhvc3RUYXNrID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUYXNrLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RUYXNrKSk7XG5cdGNvbnN0IGV4dEhvc3RPdXRwdXRTZXJ2aWNlID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RPdXRwdXRTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RPdXRwdXRTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RMb2NhbGl6YXRpb24gPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExvY2FsaXphdGlvbiwgYWNjZXNzb3IuZ2V0KElFeHRIb3N0TG9jYWxpemF0aW9uU2VydmljZSkpO1xuXG5cdC8vIG1hbnVhbGx5IGNyZWF0ZSBhbmQgcmVnaXN0ZXIgYWRkcmVzc2FibGUgaW5zdGFuY2VzXG5cdGNvbnN0IGV4dEhvc3REb2N1bWVudHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERvY3VtZW50cywgbmV3IEV4dEhvc3REb2N1bWVudHMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKSk7XG5cdGNvbnN0IGV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcnMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVycywgbmV3IEV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcihycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsIGV4dEhvc3RMb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudCA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQsIG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQoZXh0SG9zdExvZ1NlcnZpY2UsIGV4dEhvc3REb2N1bWVudHMsIHJwY1Byb3RvY29sLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRCdWxrRWRpdHMpKSk7XG5cdGNvbnN0IGV4dEhvc3ROb3RlYm9vayA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Tm90ZWJvb2ssIG5ldyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyKHJwY1Byb3RvY29sLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLCBleHRIb3N0RG9jdW1lbnRzLCBleHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLCBleHRIb3N0U2VhcmNoLCBleHRIb3N0TG9nU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLCBuZXcgRXh0SG9zdE5vdGVib29rRG9jdW1lbnRzKGV4dEhvc3ROb3RlYm9vaykpO1xuXHRjb25zdCBleHRIb3N0Tm90ZWJvb2tFZGl0b3JzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3ROb3RlYm9va0VkaXRvcnMsIG5ldyBFeHRIb3N0Tm90ZWJvb2tFZGl0b3JzKGV4dEhvc3RMb2dTZXJ2aWNlLCBleHRIb3N0Tm90ZWJvb2spKTtcblx0Y29uc3QgZXh0SG9zdE5vdGVib29rS2VybmVscyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Tm90ZWJvb2tLZXJuZWxzLCBuZXcgRXh0SG9zdE5vdGVib29rS2VybmVscyhycGNQcm90b2NvbCwgaW5pdERhdGEsIGV4dEhvc3ROb3RlYm9vaywgZXh0SG9zdENvbW1hbmRzLCBleHRIb3N0TG9nU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0Tm90ZWJvb2tSZW5kZXJlcnMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdE5vdGVib29rUmVuZGVyZXJzLCBuZXcgRXh0SG9zdE5vdGVib29rUmVuZGVyZXJzKHJwY1Byb3RvY29sLCBleHRIb3N0Tm90ZWJvb2spKTtcblx0Y29uc3QgZXh0SG9zdE5vdGVib29rRG9jdW1lbnRTYXZlUGFydGljaXBhbnQgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdE5vdGVib29rRG9jdW1lbnRTYXZlUGFydGljaXBhbnQsIG5ldyBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudFNhdmVQYXJ0aWNpcGFudChleHRIb3N0TG9nU2VydmljZSwgZXh0SG9zdE5vdGVib29rLCBycGNQcm90b2NvbC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkQnVsa0VkaXRzKSkpO1xuXHRjb25zdCBleHRIb3N0RWRpdG9ycyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RWRpdG9ycywgbmV3IEV4dEhvc3RFZGl0b3JzKHJwY1Byb3RvY29sLCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycykpO1xuXHRjb25zdCBleHRIb3N0VHJlZVZpZXdzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUcmVlVmlld3MsIG5ldyBFeHRIb3N0VHJlZVZpZXdzKHJwY1Byb3RvY29sLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUcmVlVmlld3MpLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3RMb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RFZGl0b3JJbnNldHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEVkaXRvckluc2V0cywgbmV3IEV4dEhvc3RFZGl0b3JJbnNldHMocnBjUHJvdG9jb2wuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZEVkaXRvckluc2V0cyksIGV4dEhvc3RFZGl0b3JzLCBpbml0RGF0YS5yZW1vdGUpKTtcblx0Y29uc3QgZXh0SG9zdERpYWdub3N0aWNzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REaWFnbm9zdGljcywgbmV3IEV4dEhvc3REaWFnbm9zdGljcyhycGNQcm90b2NvbCwgZXh0SG9zdExvZ1NlcnZpY2UsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbywgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpKTtcblx0Y29uc3QgZXh0SG9zdExhbmd1YWdlcyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0TGFuZ3VhZ2VzLCBuZXcgRXh0SG9zdExhbmd1YWdlcyhycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50cywgZXh0SG9zdENvbW1hbmRzLmNvbnZlcnRlciwgdXJpVHJhbnNmb3JtZXIpKTtcblx0Y29uc3QgZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMsIG5ldyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcyhycGNQcm90b2NvbCwgdXJpVHJhbnNmb3JtZXIsIGV4dEhvc3REb2N1bWVudHMsIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdERpYWdub3N0aWNzLCBleHRIb3N0TG9nU2VydmljZSwgZXh0SG9zdEFwaURlcHJlY2F0aW9uLCBleHRIb3N0VGVsZW1ldHJ5KSk7XG5cdGNvbnN0IGV4dEhvc3RDb2RlTWFwcGVyID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDb2RlTWFwcGVyLCBuZXcgRXh0SG9zdENvZGVNYXBwZXIocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdEZpbGVTeXN0ZW0gPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEZpbGVTeXN0ZW0sIG5ldyBFeHRIb3N0RmlsZVN5c3RlbShycGNQcm90b2NvbCwgZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMpKTtcblx0Y29uc3QgZXh0SG9zdEZpbGVTeXN0ZW1FdmVudCA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RmlsZVN5c3RlbUV2ZW50U2VydmljZSwgbmV3IEV4dEhvc3RGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlKHJwY1Byb3RvY29sLCBleHRIb3N0TG9nU2VydmljZSwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpKTtcblx0Y29uc3QgZXh0SG9zdFF1aWNrT3BlbiA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0UXVpY2tPcGVuLCBjcmVhdGVFeHRIb3N0UXVpY2tPcGVuKHJwY1Byb3RvY29sLCBleHRIb3N0V29ya3NwYWNlLCBleHRIb3N0Q29tbWFuZHMpKTtcblx0Y29uc3QgZXh0SG9zdFNDTSA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0U0NNLCBuZXcgRXh0SG9zdFNDTShycGNQcm90b2NvbCwgZXh0SG9zdENvbW1hbmRzLCBleHRIb3N0RG9jdW1lbnRzLCBleHRIb3N0TG9nU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0UXVpY2tEaWZmID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RRdWlja0RpZmYsIG5ldyBFeHRIb3N0UXVpY2tEaWZmKHJwY1Byb3RvY29sLCBleHRIb3N0RG9jdW1lbnRzLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRjb25zdCBleHRIb3N0QWdlbnRFZGl0b3JDb21tZW50cyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0QWdlbnRFZGl0b3JDb21tZW50cywgbmV3IEV4dEhvc3RBZ2VudEVkaXRvckNvbW1lbnRzKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RTaGFyZSA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0U2hhcmUsIG5ldyBFeHRIb3N0U2hhcmUocnBjUHJvdG9jb2wsIHVyaVRyYW5zZm9ybWVyKSk7XG5cdGNvbnN0IGV4dEhvc3RDb21tZW50ID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDb21tZW50cywgY3JlYXRlRXh0SG9zdENvbW1lbnRzKHJwY1Byb3RvY29sLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3REb2N1bWVudHMpKTtcblx0Y29uc3QgZXh0SG9zdExhYmVsU2VydmljZSA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0TGFiZWxTZXJ2aWNlLCBuZXcgRXh0SG9zdExhYmVsU2VydmljZShycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0VGhlbWluZyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VGhlbWluZywgbmV3IEV4dEhvc3RUaGVtaW5nKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RUaW1lbGluZSA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VGltZWxpbmUsIG5ldyBFeHRIb3N0VGltZWxpbmUocnBjUHJvdG9jb2wsIGV4dEhvc3RDb21tYW5kcykpO1xuXHRjb25zdCBleHRIb3N0V2Vidmlld3MgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFdlYnZpZXdzLCBuZXcgRXh0SG9zdFdlYnZpZXdzKHJwY1Byb3RvY29sLCBpbml0RGF0YS5yZW1vdGUsIGV4dEhvc3RXb3Jrc3BhY2UsIGV4dEhvc3RMb2dTZXJ2aWNlLCBleHRIb3N0QXBpRGVwcmVjYXRpb24pKTtcblx0Y29uc3QgZXh0SG9zdFdlYnZpZXdQYW5lbHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFdlYnZpZXdQYW5lbHMsIG5ldyBFeHRIb3N0V2Vidmlld1BhbmVscyhycGNQcm90b2NvbCwgZXh0SG9zdFdlYnZpZXdzLCBleHRIb3N0V29ya3NwYWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RDdXN0b21FZGl0b3JzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDdXN0b21FZGl0b3JzLCBuZXcgRXh0SG9zdEN1c3RvbUVkaXRvcnMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHMsIGV4dGVuc2lvblN0b3JhZ2VQYXRocywgZXh0SG9zdFdlYnZpZXdzLCBleHRIb3N0V2Vidmlld1BhbmVscykpO1xuXHRjb25zdCBleHRIb3N0V2Vidmlld1ZpZXdzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RXZWJ2aWV3Vmlld3MsIG5ldyBFeHRIb3N0V2Vidmlld1ZpZXdzKHJwY1Byb3RvY29sLCBleHRIb3N0V2Vidmlld3MpKTtcblx0Y29uc3QgZXh0SG9zdFRlc3RpbmcgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRlc3RpbmcsIGFjY2Vzc29yLmdldChJRXh0SG9zdFRlc3RpbmcpKTtcblx0Y29uc3QgZXh0SG9zdFVyaU9wZW5lcnMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFVyaU9wZW5lcnMsIG5ldyBFeHRIb3N0VXJpT3BlbmVycyhycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0UHJvZmlsZUNvbnRlbnRIYW5kbGVycyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0UHJvZmlsZUNvbnRlbnRIYW5kbGVycywgbmV3IEV4dEhvc3RQcm9maWxlQ29udGVudEhhbmRsZXJzKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdENoYXRPdXRwdXRSZW5kZXJlciwgbmV3IEV4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIocnBjUHJvdG9jb2wsIGV4dEhvc3RXZWJ2aWV3cykpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEludGVyYWN0aXZlLCBuZXcgRXh0SG9zdEludGVyYWN0aXZlKHJwY1Byb3RvY29sLCBleHRIb3N0Tm90ZWJvb2ssIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3RMb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExhbmd1YWdlTW9kZWxUb29scywgbmV3IEV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMocnBjUHJvdG9jb2wsIGV4dEhvc3RMYW5ndWFnZU1vZGVscykpO1xuXHRjb25zdCBleHRIb3N0Q2hhdFNlc3Npb25zID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0U2Vzc2lvbnMsIG5ldyBFeHRIb3N0Q2hhdFNlc3Npb25zKGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdExhbmd1YWdlTW9kZWxzLCBycGNQcm90b2NvbCwgZXh0SG9zdExvZ1NlcnZpY2UpKTtcblx0Y29uc3QgZXh0SG9zdENoYXRBZ2VudHMyID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0QWdlbnRzMiwgbmV3IEV4dEhvc3RDaGF0QWdlbnRzMihycGNQcm90b2NvbCwgZXh0SG9zdExvZ1NlcnZpY2UsIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdERvY3VtZW50cywgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsIGV4dEhvc3RMYW5ndWFnZU1vZGVscywgZXh0SG9zdERpYWdub3N0aWNzLCBleHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzLCBleHRIb3N0Q2hhdFNlc3Npb25zKSk7XG5cdGNvbnN0IGV4dEhvc3RDaGF0Q29udGV4dCA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdENvbnRleHQsIG5ldyBFeHRIb3N0Q2hhdENvbnRleHQocnBjUHJvdG9jb2wsIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdEVkaXRvclRhYnMpKTtcblx0Y29uc3QgZXh0SG9zdENoYXREZWJ1ZyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdERlYnVnLCBuZXcgRXh0SG9zdENoYXREZWJ1ZyhycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0QWlSZWxhdGVkSW5mb3JtYXRpb24gPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEFpUmVsYXRlZEluZm9ybWF0aW9uLCBuZXcgRXh0SG9zdFJlbGF0ZWRJbmZvcm1hdGlvbihycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0QWlFbWJlZGRpbmdWZWN0b3IgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEFpRW1iZWRkaW5nVmVjdG9yLCBuZXcgRXh0SG9zdEFpRW1iZWRkaW5nVmVjdG9yKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RBaVNldHRpbmdzU2VhcmNoID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RBaVNldHRpbmdzU2VhcmNoLCBuZXcgRXh0SG9zdEFpU2V0dGluZ3NTZWFyY2gocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdFN0YXR1c0JhciA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0U3RhdHVzQmFyLCBuZXcgRXh0SG9zdFN0YXR1c0JhcihycGNQcm90b2NvbCwgZXh0SG9zdENvbW1hbmRzLmNvbnZlcnRlcikpO1xuXHRjb25zdCBleHRIb3N0U3BlZWNoID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RTcGVlY2gsIG5ldyBFeHRIb3N0U3BlZWNoKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RFbWJlZGRpbmdzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RFbWJlZGRpbmdzLCBuZXcgRXh0SG9zdEVtYmVkZGluZ3MocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdEJyb3dzZXJzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RCcm93c2VycywgbmV3IEV4dEhvc3RCcm93c2VycyhycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0Q2hhdFF1b3RhID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0UXVvdGEsIG5ldyBFeHRIb3N0Q2hhdFF1b3RhKHJwY1Byb3RvY29sKSk7XG5cblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RNY3AsIGFjY2Vzc29yLmdldChJRXh0SG9zdE1wY1NlcnZpY2UpKTtcblxuXHQvLyBDaGVjayB0aGF0IG5vIG5hbWVkIGN1c3RvbWVycyBhcmUgbWlzc2luZ1xuXHRjb25zdCBleHBlY3RlZCA9IE9iamVjdC52YWx1ZXM8UHJveHlJZGVudGlmaWVyPGFueT4+KEV4dEhvc3RDb250ZXh0KTtcblx0cnBjUHJvdG9jb2wuYXNzZXJ0UmVnaXN0ZXJlZChleHBlY3RlZCk7XG5cblx0Ly8gT3RoZXIgaW5zdGFuY2VzXG5cdGNvbnN0IGV4dEhvc3RCdWxrRWRpdHMgPSBuZXcgRXh0SG9zdEJ1bGtFZGl0cyhycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpO1xuXHRjb25zdCBleHRIb3N0Q2xpcGJvYXJkID0gbmV3IEV4dEhvc3RDbGlwYm9hcmQocnBjUHJvdG9jb2wpO1xuXHRjb25zdCBleHRIb3N0TWVzc2FnZVNlcnZpY2UgPSBuZXcgRXh0SG9zdE1lc3NhZ2VTZXJ2aWNlKHJwY1Byb3RvY29sLCBleHRIb3N0TG9nU2VydmljZSk7XG5cdGNvbnN0IGV4dEhvc3REaWFsb2dzID0gbmV3IEV4dEhvc3REaWFsb2dzKHJwY1Byb3RvY29sKTtcblx0Y29uc3QgZXh0SG9zdENoYXRTdGF0dXMgPSBuZXcgRXh0SG9zdENoYXRTdGF0dXMocnBjUHJvdG9jb2wpO1xuXHRjb25zdCBleHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uID0gbmV3IEV4dEhvc3RDaGF0SW5wdXROb3RpZmljYXRpb24ocnBjUHJvdG9jb2wpO1xuXG5cdC8vIFJlZ2lzdGVyIEFQSS1pc2ggY29tbWFuZHNcblx0RXh0SG9zdEFwaUNvbW1hbmRzLnJlZ2lzdGVyKGV4dEhvc3RDb21tYW5kcyk7XG5cblx0cmV0dXJuIGZ1bmN0aW9uIChleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgZXh0ZW5zaW9uSW5mbzogSUV4dGVuc2lvblJlZ2lzdHJpZXMsIGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIpOiB0eXBlb2YgdnNjb2RlIHtcblxuXHRcdC8vIFdyYXBzIGFuIGV2ZW50IHdpdGggZXJyb3IgaGFuZGxpbmcgYW5kIHRlbGVtZXRyeSBzbyB0aGF0IHdlIGtub3cgd2hhdCBleHRlbnNpb24gZmFpbHNcblx0XHQvLyBoYW5kbGluZyBldmVudHMuIFRoaXMgd2lsbCBwcmV2ZW50IHVzIGZyb20gcmVwb3J0aW5nIHRoaXMgYXMgXCJvdXJcIiBlcnJvci10ZWxlbWV0cnkgYW5kXG5cdFx0Ly8gYWxsb3dzIGZvciBiZXR0ZXIgYmxhbWluZ1xuXHRcdGZ1bmN0aW9uIF9hc0V4dGVuc2lvbkV2ZW50PFQ+KGFjdHVhbDogdnNjb2RlLkV2ZW50PFQ+KTogdnNjb2RlLkV2ZW50PFQ+IHtcblx0XHRcdHJldHVybiAobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHRjb25zdCBoYW5kbGUgPSBhY3R1YWwoZSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGUpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0ZXJyb3JzLm9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IobmV3IEV4dGVuc2lvbkVycm9yKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBlcnIsICdGQUlMRUQgdG8gaGFuZGxlIGV2ZW50JykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzPy5wdXNoKGhhbmRsZSk7XG5cdFx0XHRcdHJldHVybiBoYW5kbGU7XG5cdFx0XHR9O1xuXHRcdH1cblxuXG5cdFx0Ly8gQ2hlY2sgZG9jdW1lbnQgc2VsZWN0b3JzIGZvciBiZWluZyBvdmVybHkgZ2VuZXJpYy4gVGVjaG5pY2FsbHkgdGhpcyBpc24ndCBhIHByb2JsZW0gYnV0XG5cdFx0Ly8gaW4gcHJhY3RpY2UgbWFueSBleHRlbnNpb25zIHNheSB0aGV5IHN1cHBvcnQgYGZvb0xhbmdgIGJ1dCBuZWVkIGZzLWFjY2VzcyB0byBkbyBzby4gVGhvc2Vcblx0XHQvLyBleHRlbnNpb24gc2hvdWxkIHNwZWNpZnkgdGhlbiB0aGUgYGZpbGVgLXNjaGVtZSwgZS5nLiBgeyBzY2hlbWU6ICdmb29MYW5nJywgbGFuZ3VhZ2U6ICdmb29MYW5nJyB9YFxuXHRcdC8vIFdlIG9ubHkgaW5mb3JtIG9uY2UsIGl0IGlzIG5vdCBhIHdhcm5pbmcgYmVjYXVzZSB3ZSBqdXN0IHdhbnQgdG8gcmFpc2UgYXdhcmVuZXNzIGFuZCBiZWNhdXNlXG5cdFx0Ly8gd2UgY2Fubm90IHNheSBpZiB0aGUgZXh0ZW5zaW9uIGlzIGRvaW5nIGl0IHJpZ2h0IG9yIHdyb25nLi4uXG5cdFx0Y29uc3QgY2hlY2tTZWxlY3RvciA9IChmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgZG9uZSA9ICFleHRlbnNpb24uaXNVbmRlckRldmVsb3BtZW50O1xuXHRcdFx0ZnVuY3Rpb24gaW5mb3JtT25jZSgpIHtcblx0XHRcdFx0aWYgKCFkb25lKSB7XG5cdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfScgdXNlcyBhIGRvY3VtZW50IHNlbGVjdG9yIHdpdGhvdXQgc2NoZW1lLiBMZWFybiBtb3JlIGFib3V0IHRoaXM6IGh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD04NzIzMDVgKTtcblx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uIHBlcmZvcm0oc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yKTogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3Ige1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RvcikpIHtcblx0XHRcdFx0XHRzZWxlY3Rvci5mb3JFYWNoKHBlcmZvcm0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRpbmZvcm1PbmNlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyID0gc2VsZWN0b3IgYXMgdnNjb2RlLkRvY3VtZW50RmlsdGVyOyAvLyBUT0RPOiBtaWNyb3NvZnQvVHlwZVNjcmlwdCM0Mjc2OFxuXHRcdFx0XHRcdGlmICh0eXBlb2YgZmlsdGVyLnNjaGVtZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdGluZm9ybU9uY2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBmaWx0ZXIuZXhjbHVzaXZlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RvY3VtZW50RmlsdGVyc0V4Y2x1c2l2ZScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc2VsZWN0b3I7XG5cdFx0XHR9O1xuXHRcdH0pKCk7XG5cblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbjogdHlwZW9mIHZzY29kZS5hdXRoZW50aWNhdGlvbiA9IHtcblx0XHRcdGdldFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXNPckNoYWxsZW5nZTogcmVhZG9ubHkgc3RyaW5nW10gfCB2c2NvZGUuQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBvcHRpb25zPzogdnNjb2RlLkF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdCh0eXBlb2Ygb3B0aW9ucz8uZm9yY2VOZXdTZXNzaW9uID09PSAnb2JqZWN0JyAmJiBvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbi5sZWFybk1vcmUpIHx8XG5cdFx0XHRcdFx0KHR5cGVvZiBvcHRpb25zPy5jcmVhdGVJZk5vbmUgPT09ICdvYmplY3QnICYmIG9wdGlvbnMuY3JlYXRlSWZOb25lLmxlYXJuTW9yZSlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYXV0aExlYXJuTW9yZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcHRpb25zPy5hdXRob3JpemF0aW9uU2VydmVyKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYXV0aElzc3VlcnMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbiwgcHJvdmlkZXJJZCwgc2NvcGVzT3JDaGFsbGVuZ2UsIG9wdGlvbnMgYXMgYW55KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRBY2NvdW50cyhwcm92aWRlcklkOiBzdHJpbmcpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblx0XHRcdH0sXG5cdFx0XHQvLyBUT0RPOiByZW1vdmUgdGhpcyBhZnRlciBHSFBSIGFuZCBDb2Rlc3BhY2VzIG1vdmUgb2ZmIG9mIGl0XG5cdFx0XHRhc3luYyBoYXNTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdhdXRoU2Vzc2lvbicpO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0cmV0dXJuICEhKGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbiwgcHJvdmlkZXJJZCwgc2NvcGVzLCB7IHNpbGVudDogdHJ1ZSB9IGFzIGFueSkpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVNlc3Npb25zKCk6IHZzY29kZS5FdmVudDx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0RXh0ZW5zaW9uU2NvcGVkU2Vzc2lvbnNFdmVudChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSkpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIG9wdGlvbnM/OiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbnMpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5zdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVycykge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2F1dGhJc3N1ZXJzJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBdXRoZW50aWNhdGlvbi5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQsIGxhYmVsLCBwcm92aWRlciwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogY29tbWFuZHNcblx0XHRjb25zdCBjb21tYW5kczogdHlwZW9mIHZzY29kZS5jb21tYW5kcyA9IHtcblx0XHRcdHJlZ2lzdGVyQ29tbWFuZChpZDogc3RyaW5nLCBjb21tYW5kOiA8VD4oLi4uYXJnczogdW5rbm93bltdKSA9PiBUIHwgVGhlbmFibGU8VD4sIHRoaXNBcmdzPzogdW5rbm93bik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDb21tYW5kcy5yZWdpc3RlckNvbW1hbmQodHJ1ZSwgaWQsIGNvbW1hbmQsIHRoaXNBcmdzLCB1bmRlZmluZWQsIGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXh0RWRpdG9yQ29tbWFuZChpZDogc3RyaW5nLCBjYWxsYmFjazogKHRleHRFZGl0b3I6IHZzY29kZS5UZXh0RWRpdG9yLCBlZGl0OiB2c2NvZGUuVGV4dEVkaXRvckVkaXQsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCwgdGhpc0FyZz86IHVua25vd24pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKHRydWUsIGlkLCAoLi4uYXJnczogdW5rbm93bltdKTogYW55ID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yID0gZXh0SG9zdEVkaXRvcnMuZ2V0QWN0aXZlVGV4dEVkaXRvcigpO1xuXHRcdFx0XHRcdGlmICghYWN0aXZlVGV4dEVkaXRvcikge1xuXHRcdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2Uud2FybignQ2Fubm90IGV4ZWN1dGUgJyArIGlkICsgJyBiZWNhdXNlIHRoZXJlIGlzIG5vIGFjdGl2ZSB0ZXh0IGVkaXRvci4nKTtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGFjdGl2ZVRleHRFZGl0b3IuZWRpdCgoZWRpdDogdnNjb2RlLlRleHRFZGl0b3JFZGl0KSA9PiB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSh0aGlzQXJnLCBbYWN0aXZlVGV4dEVkaXRvciwgZWRpdCwgLi4uYXJnc10pO1xuXHRcdFx0XHRcdH0pLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2Uud2FybignRWRpdHMgZnJvbSBjb21tYW5kICcgKyBpZCArICcgd2VyZSBub3QgYXBwbGllZC4nKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRcdFx0XHRleHRIb3N0TG9nU2VydmljZS53YXJuKCdBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBydW5uaW5nIGNvbW1hbmQgJyArIGlkLCBlcnIpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRpZmZJbmZvcm1hdGlvbkNvbW1hbmQ6IChpZDogc3RyaW5nLCBjYWxsYmFjazogKGRpZmY6IHZzY29kZS5MaW5lQ2hhbmdlW10sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gYW55LCB0aGlzQXJnPzogdW5rbm93bik6IHZzY29kZS5EaXNwb3NhYmxlID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZGlmZkNvbW1hbmQnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDb21tYW5kcy5yZWdpc3RlckNvbW1hbmQodHJ1ZSwgaWQsIGFzeW5jICguLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPGFueT4gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3IgPSBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5hY3RpdmVFZGl0b3IodHJ1ZSk7XG5cdFx0XHRcdFx0aWYgKCFhY3RpdmVUZXh0RWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRleHRIb3N0TG9nU2VydmljZS53YXJuKCdDYW5ub3QgZXhlY3V0ZSAnICsgaWQgKyAnIGJlY2F1c2UgdGhlcmUgaXMgbm8gYWN0aXZlIHRleHQgZWRpdG9yLicpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBkaWZmID0gYXdhaXQgZXh0SG9zdEVkaXRvcnMuZ2V0RGlmZkluZm9ybWF0aW9uKGFjdGl2ZVRleHRFZGl0b3IuaWQpO1xuXHRcdFx0XHRcdGNhbGxiYWNrLmFwcGx5KHRoaXNBcmcsIFtkaWZmLCAuLi5hcmdzXSk7XG5cdFx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdGV4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFRoZW5hYmxlPFQ+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDb21tYW5kcy5leGVjdXRlQ29tbWFuZDxUPihpZCwgLi4uYXJncyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q29tbWFuZHMoZmlsdGVySW50ZXJuYWw6IGJvb2xlYW4gPSBmYWxzZSk6IFRoZW5hYmxlPHN0cmluZ1tdPiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29tbWFuZHMuZ2V0Q29tbWFuZHMoZmlsdGVySW50ZXJuYWwpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGVudlxuXHRcdGNvbnN0IGVudjogdHlwZW9mIHZzY29kZS5lbnYgPSB7XG5cdFx0XHRnZXQgbWFjaGluZUlkKCkgeyByZXR1cm4gaW5pdERhdGEudGVsZW1ldHJ5SW5mby5tYWNoaW5lSWQ7IH0sXG5cdFx0XHRnZXQgZGV2RGV2aWNlSWQoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RldkRldmljZUlkJyk7XG5cdFx0XHRcdHJldHVybiBpbml0RGF0YS50ZWxlbWV0cnlJbmZvLmRldkRldmljZUlkID8/IGluaXREYXRhLnRlbGVtZXRyeUluZm8ubWFjaGluZUlkO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpc0FwcFBvcnRhYmxlKCkgeyByZXR1cm4gaW5pdERhdGEuZW52aXJvbm1lbnQuaXNQb3J0YWJsZSA/PyBmYWxzZTsgfSxcblx0XHRcdGdldCBzZXNzaW9uSWQoKSB7IHJldHVybiBpbml0RGF0YS50ZWxlbWV0cnlJbmZvLnNlc3Npb25JZDsgfSxcblx0XHRcdGdldCBsYW5ndWFnZSgpIHsgcmV0dXJuIGluaXREYXRhLmVudmlyb25tZW50LmFwcExhbmd1YWdlOyB9LFxuXHRcdFx0Z2V0IGFwcE5hbWUoKSB7IHJldHVybiBpbml0RGF0YS5lbnZpcm9ubWVudC5hcHBOYW1lOyB9LFxuXHRcdFx0Z2V0IGFwcFJvb3QoKSB7IHJldHVybiBpbml0RGF0YS5lbnZpcm9ubWVudC5hcHBSb290Py5mc1BhdGggPz8gJyc7IH0sXG5cdFx0XHRnZXQgYXBwSG9zdCgpIHsgcmV0dXJuIGluaXREYXRhLmVudmlyb25tZW50LmFwcEhvc3Q7IH0sXG5cdFx0XHRnZXQgdXJpU2NoZW1lKCkgeyByZXR1cm4gaW5pdERhdGEuZW52aXJvbm1lbnQuYXBwVXJpU2NoZW1lOyB9LFxuXHRcdFx0Z2V0IGNsaXBib2FyZCgpOiB2c2NvZGUuQ2xpcGJvYXJkIHsgcmV0dXJuIGV4dEhvc3RDbGlwYm9hcmQudmFsdWU7IH0sXG5cdFx0XHRnZXQgc2hlbGwoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLmdldERlZmF1bHRTaGVsbChmYWxzZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlU2hlbGwoKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlU2hlbGwpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpc1RlbGVtZXRyeUVuYWJsZWQoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVsZW1ldHJ5LmdldFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VUZWxlbWV0cnlFbmFibGVkKCk6IHZzY29kZS5FdmVudDxib29sZWFuPiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVsZW1ldHJ5Lm9uRGlkQ2hhbmdlVGVsZW1ldHJ5RW5hYmxlZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRlbGVtZXRyeUNvbmZpZ3VyYXRpb24oKTogdnNjb2RlLlRlbGVtZXRyeUNvbmZpZ3VyYXRpb24ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZWxlbWV0cnknKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZWxlbWV0cnkuZ2V0VGVsZW1ldHJ5RGV0YWlscygpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVRlbGVtZXRyeUNvbmZpZ3VyYXRpb24oKTogdnNjb2RlLkV2ZW50PHZzY29kZS5UZWxlbWV0cnlDb25maWd1cmF0aW9uPiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RlbGVtZXRyeScpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlbGVtZXRyeS5vbkRpZENoYW5nZVRlbGVtZXRyeUNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpc01ldGVyZWRDb25uZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlbnZJc0Nvbm5lY3Rpb25NZXRlcmVkJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24uaXNDb25uZWN0aW9uTWV0ZXJlZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VNZXRlcmVkQ29ubmVjdGlvbigpOiB2c2NvZGUuRXZlbnQ8Ym9vbGVhbj4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlbnZJc0Nvbm5lY3Rpb25NZXRlcmVkJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24ub25EaWRDaGFuZ2VJc0Nvbm5lY3Rpb25NZXRlcmVkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaXNOZXdBcHBJbnN0YWxsKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNOZXdBcHBJbnN0YWxsKGluaXREYXRhLnRlbGVtZXRyeUluZm8uZmlyc3RTZXNzaW9uRGF0ZSk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlVGVsZW1ldHJ5TG9nZ2VyKHNlbmRlcjogdnNjb2RlLlRlbGVtZXRyeVNlbmRlciwgb3B0aW9ucz86IHZzY29kZS5UZWxlbWV0cnlMb2dnZXJPcHRpb25zKTogdnNjb2RlLlRlbGVtZXRyeUxvZ2dlciB7XG5cdFx0XHRcdEV4dEhvc3RUZWxlbWV0cnlMb2dnZXIudmFsaWRhdGVTZW5kZXIoc2VuZGVyKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZWxlbWV0cnkuaW5zdGFudGlhdGVMb2dnZXIoZXh0ZW5zaW9uLCBzZW5kZXIsIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIG9wZW5FeHRlcm5hbCh1cmk6IFVSSSwgb3B0aW9ucz86IHsgYWxsb3dDb250cmlidXRlZE9wZW5lcnM/OiBib29sZWFuIHwgc3RyaW5nIH0pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXaW5kb3cub3BlblVyaSh1cmksIHtcblx0XHRcdFx0XHRhbGxvd1R1bm5lbGluZzogaW5pdERhdGEucmVtb3RlLmlzUmVtb3RlID8/IChpbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5ID8gYXdhaXQgZXh0SG9zdFR1bm5lbFNlcnZpY2UuaGFzVHVubmVsUHJvdmlkZXIoKSA6IGZhbHNlKSxcblx0XHRcdFx0XHRhbGxvd0NvbnRyaWJ1dGVkT3BlbmVyczogb3B0aW9ucz8uYWxsb3dDb250cmlidXRlZE9wZW5lcnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGFzRXh0ZXJuYWxVcmkodXJpOiBVUkkpIHtcblx0XHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IGluaXREYXRhLmVudmlyb25tZW50LmFwcFVyaVNjaGVtZSkge1xuXHRcdFx0XHRcdHJldHVybiBleHRIb3N0VXJscy5jcmVhdGVBcHBVcmkodXJpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IGV4dEhvc3RXaW5kb3cuYXNFeHRlcm5hbFVyaSh1cmksIHsgYWxsb3dUdW5uZWxpbmc6ICEhaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSB9KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUodXJpLCBTY2hlbWFzLmh0dHApIHx8IG1hdGNoZXNTY2hlbWUodXJpLCBTY2hlbWFzLmh0dHBzKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgcmVtb3RlTmFtZSgpIHtcblx0XHRcdFx0cmV0dXJuIGdldFJlbW90ZU5hbWUoaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHJlbW90ZUF1dGhvcml0eSgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAncmVzb2x2ZXJzJyk7XG5cdFx0XHRcdHJldHVybiBpbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5O1xuXHRcdFx0fSxcblx0XHRcdGdldCB1aUtpbmQoKSB7XG5cdFx0XHRcdHJldHVybiBpbml0RGF0YS51aUtpbmQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGxvZ0xldmVsKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExvZ1NlcnZpY2UuZ2V0TGV2ZWwoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VMb2dMZXZlbCgpIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RMb2dTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9nTGV2ZWwpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhcHBRdWFsaXR5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Jlc29sdmVycycpO1xuXHRcdFx0XHRyZXR1cm4gaW5pdERhdGEucXVhbGl0eTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYXBwQ29tbWl0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Jlc29sdmVycycpO1xuXHRcdFx0XHRyZXR1cm4gaW5pdERhdGEuY29tbWl0O1xuXHRcdFx0fSxcblx0XHRcdGdldERhdGFDaGFubmVsPFQ+KGNoYW5uZWxJZDogc3RyaW5nKTogdnNjb2RlLkRhdGFDaGFubmVsPFQ+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZGF0YUNoYW5uZWxzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGF0YUNoYW5uZWxzLmNyZWF0ZURhdGFDaGFubmVsKGV4dGVuc2lvbiwgY2hhbm5lbElkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgcG93ZXIoKTogdHlwZW9mIHZzY29kZS5lbnYucG93ZXIge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlbnZpcm9ubWVudFBvd2VyJyk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Z2V0IG9uRGlkU3VzcGVuZCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25EaWRTdXNwZW5kKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBvbkRpZFJlc3VtZSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25EaWRSZXN1bWUpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IG9uRGlkQ2hhbmdlT25CYXR0ZXJ5UG93ZXIoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFBvd2VyLm9uRGlkQ2hhbmdlT25CYXR0ZXJ5UG93ZXIpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IG9uRGlkQ2hhbmdlVGhlcm1hbFN0YXRlKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RQb3dlci5vbkRpZENoYW5nZVRoZXJtYWxTdGF0ZSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgb25EaWRDaGFuZ2VTcGVlZExpbWl0KCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RQb3dlci5vbkRpZENoYW5nZVNwZWVkTGltaXQpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IG9uV2lsbFNodXRkb3duKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RQb3dlci5vbldpbGxTaHV0ZG93bik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgb25EaWRMb2NrU2NyZWVuKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RQb3dlci5vbkRpZExvY2tTY3JlZW4pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IG9uRGlkVW5sb2NrU2NyZWVuKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RQb3dlci5vbkRpZFVubG9ja1NjcmVlbik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRTeXN0ZW1JZGxlU3RhdGUoaWRsZVRocmVzaG9sZFNlY29uZHM6IG51bWJlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQb3dlci5nZXRTeXN0ZW1JZGxlU3RhdGUoaWRsZVRocmVzaG9sZFNlY29uZHMpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0U3lzdGVtSWRsZVRpbWUoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFBvd2VyLmdldFN5c3RlbUlkbGVUaW1lKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRDdXJyZW50VGhlcm1hbFN0YXRlKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQb3dlci5nZXRDdXJyZW50VGhlcm1hbFN0YXRlKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpc09uQmF0dGVyeVBvd2VyKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQb3dlci5pc09uQmF0dGVyeVBvd2VyKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhc3luYyBzdGFydFBvd2VyU2F2ZUJsb2NrZXIodHlwZTogdnNjb2RlLmVudi5wb3dlci5Qb3dlclNhdmVCbG9ja2VyVHlwZSk6IFByb21pc2U8dnNjb2RlLmVudi5wb3dlci5Qb3dlclNhdmVCbG9ja2VyPiB7XG5cdFx0XHRcdFx0XHRjb25zdCBibG9ja2VyID0gYXdhaXQgZXh0SG9zdFBvd2VyLnN0YXJ0UG93ZXJTYXZlQmxvY2tlcih0eXBlKTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBibG9ja2VyLmlkLFxuXHRcdFx0XHRcdFx0XHRnZXQgaXNTdGFydGVkKCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBibG9ja2VyLmlzU3RhcnRlZDtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRcdFx0XHRibG9ja2VyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAoIWluaXREYXRhLmVudmlyb25tZW50LmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHRcdC8vIGFsbG93IHRvIHBhdGNoIGVudi1mdW5jdGlvbiB3aGVuIHJ1bm5pbmcgdGVzdHNcblx0XHRcdE9iamVjdC5mcmVlemUoZW52KTtcblx0XHR9XG5cblx0XHQvLyBuYW1lc3BhY2U6IHRlc3RzXG5cdFx0Y29uc3QgdGVzdHM6IHR5cGVvZiB2c2NvZGUudGVzdHMgPSB7XG5cdFx0XHRjcmVhdGVUZXN0Q29udHJvbGxlcihwcm92aWRlciwgbGFiZWwsIHJlZnJlc2hIYW5kbGVyPzogKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPHZvaWQ+IHwgdm9pZCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlc3RpbmcuY3JlYXRlVGVzdENvbnRyb2xsZXIoZXh0ZW5zaW9uLCBwcm92aWRlciwgbGFiZWwsIHJlZnJlc2hIYW5kbGVyKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVUZXN0T2JzZXJ2ZXIoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlc3RPYnNlcnZlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlc3RpbmcuY3JlYXRlVGVzdE9ic2VydmVyKCk7XG5cdFx0XHR9LFxuXHRcdFx0cnVuVGVzdHMocHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVzdE9ic2VydmVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVzdGluZy5ydW5UZXN0cyhwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXN0Rm9sbG93dXBQcm92aWRlcihwcm92aWRlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXN0T2JzZXJ2ZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXN0aW5nLnJlZ2lzdGVyVGVzdEZvbGxvd3VwUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVRlc3RSZXN1bHRzKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXN0T2JzZXJ2ZXInKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZXN0aW5nLm9uUmVzdWx0c0NoYW5nZWQpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0ZXN0UmVzdWx0cygpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVzdE9ic2VydmVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVzdGluZy5yZXN1bHRzO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBleHRlbnNpb25zXG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IGluaXREYXRhLnJlbW90ZS5pc1JlbW90ZVxuXHRcdFx0PyBleHRIb3N0VHlwZXMuRXh0ZW5zaW9uS2luZC5Xb3Jrc3BhY2Vcblx0XHRcdDogZXh0SG9zdFR5cGVzLkV4dGVuc2lvbktpbmQuVUk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zOiB0eXBlb2YgdnNjb2RlLmV4dGVuc2lvbnMgPSB7XG5cdFx0XHRnZXRFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgaW5jbHVkZUZyb21EaWZmZXJlbnRFeHRlbnNpb25Ib3N0cz86IGJvb2xlYW4pOiB2c2NvZGUuRXh0ZW5zaW9uPGFueT4gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2V4dGVuc2lvbnNBbnknKSkge1xuXHRcdFx0XHRcdGluY2x1ZGVGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdHMgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtaW5lID0gZXh0ZW5zaW9uSW5mby5taW5lLmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdFx0aWYgKG1pbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvbihleHRlbnNpb25TZXJ2aWNlLCBleHRlbnNpb24uaWRlbnRpZmllciwgbWluZSwgZXh0ZW5zaW9uS2luZCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpbmNsdWRlRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3RzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9yZWlnbiA9IGV4dGVuc2lvbkluZm8uYWxsLmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdFx0XHRpZiAoZm9yZWlnbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFeHRlbnNpb24oZXh0ZW5zaW9uU2VydmljZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGZvcmVpZ24sIGV4dGVuc2lvbktpbmQgLyogVE9ET0BhbGV4ZGltYSBUSElTIElTIFdST05HICovLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWxsKCk6IHZzY29kZS5FeHRlbnNpb248YW55PltdIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuRXh0ZW5zaW9uPGFueT5bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgZXh0ZW5zaW9uSW5mby5taW5lLmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IEV4dGVuc2lvbihleHRlbnNpb25TZXJ2aWNlLCBleHRlbnNpb24uaWRlbnRpZmllciwgZGVzYywgZXh0ZW5zaW9uS2luZCwgZmFsc2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSxcblx0XHRcdGdldCBhbGxBY3Jvc3NFeHRlbnNpb25Ib3N0cygpOiB2c2NvZGUuRXh0ZW5zaW9uPGFueT5bXSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2V4dGVuc2lvbnNBbnknKTtcblx0XHRcdFx0Y29uc3QgbG9jYWwgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldChleHRlbnNpb25JbmZvLm1pbmUuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkubWFwKGRlc2MgPT4gZGVzYy5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLkV4dGVuc2lvbjxhbnk+W10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBkZXNjIG9mIGV4dGVuc2lvbkluZm8uYWxsLmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdCA9ICFsb2NhbC5oYXMoZGVzYy5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChuZXcgRXh0ZW5zaW9uKGV4dGVuc2lvblNlcnZpY2UsIGV4dGVuc2lvbi5pZGVudGlmaWVyLCBkZXNjLCBleHRlbnNpb25LaW5kIC8qIFRPRE9AYWxleGRpbWEgVEhJUyBJUyBXUk9ORyAqLywgaXNGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlKCkge1xuXHRcdFx0XHRpZiAoaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZXh0ZW5zaW9uc0FueScpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KEV2ZW50LmFueShleHRlbnNpb25JbmZvLm1pbmUub25EaWRDaGFuZ2UsIGV4dGVuc2lvbkluZm8uYWxsLm9uRGlkQ2hhbmdlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dGVuc2lvbkluZm8ubWluZS5vbkRpZENoYW5nZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogbGFuZ3VhZ2VzXG5cdFx0Y29uc3QgbGFuZ3VhZ2VzOiB0eXBlb2YgdnNjb2RlLmxhbmd1YWdlcyA9IHtcblx0XHRcdGNyZWF0ZURpYWdub3N0aWNDb2xsZWN0aW9uKG5hbWU/OiBzdHJpbmcpOiB2c2NvZGUuRGlhZ25vc3RpY0NvbGxlY3Rpb24ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERpYWdub3N0aWNzLmNyZWF0ZURpYWdub3N0aWNDb2xsZWN0aW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBuYW1lKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VEaWFnbm9zdGljcygpIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REaWFnbm9zdGljcy5vbkRpZENoYW5nZURpYWdub3N0aWNzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXREaWFnbm9zdGljczogKHJlc291cmNlPzogdnNjb2RlLlVyaSkgPT4ge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0cmV0dXJuIDxhbnk+ZXh0SG9zdERpYWdub3N0aWNzLmdldERpYWdub3N0aWNzKHJlc291cmNlKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRMYW5ndWFnZXMoKTogVGhlbmFibGU8c3RyaW5nW10+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZXMuZ2V0TGFuZ3VhZ2VzKCk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0VGV4dERvY3VtZW50TGFuZ3VhZ2UoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFRoZW5hYmxlPHZzY29kZS5UZXh0RG9jdW1lbnQ+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZXMuY2hhbmdlTGFuZ3VhZ2UoZG9jdW1lbnQudXJpLCBsYW5ndWFnZUlkKTtcblx0XHRcdH0sXG5cdFx0XHRtYXRjaChzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50KTogbnVtYmVyIHtcblx0XHRcdFx0Y29uc3QgaW50ZXJhbFNlbGVjdG9yID0gdHlwZUNvbnZlcnRlcnMuTGFuZ3VhZ2VTZWxlY3Rvci5mcm9tKHNlbGVjdG9yKTtcblx0XHRcdFx0bGV0IG5vdGVib29rOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRhcmdldHNOb3RlYm9va3MoaW50ZXJhbFNlbGVjdG9yKSkge1xuXHRcdFx0XHRcdG5vdGVib29rID0gZXh0SG9zdE5vdGVib29rLm5vdGVib29rRG9jdW1lbnRzLmZpbmQodmFsdWUgPT4gdmFsdWUuYXBpTm90ZWJvb2suZ2V0Q2VsbHMoKS5maW5kKGMgPT4gYy5kb2N1bWVudCA9PT0gZG9jdW1lbnQpKT8uYXBpTm90ZWJvb2s7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHNjb3JlKGludGVyYWxTZWxlY3RvciwgZG9jdW1lbnQudXJpLCBkb2N1bWVudC5sYW5ndWFnZUlkLCB0cnVlLCBub3RlYm9vaz8udXJpLCBub3RlYm9vaz8ubm90ZWJvb2tUeXBlKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNvZGVBY3Rpb25zUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkNvZGVBY3Rpb25Qcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuQ29kZUFjdGlvblByb3ZpZGVyTWV0YWRhdGEpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgbWV0YWRhdGEpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgbWV0YWRhdGE6IHZzY29kZS5Eb2N1bWVudFBhc3RlUHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgbWV0YWRhdGEpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuQ29kZUxlbnNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW1wbGVtZW50YXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5UeXBlRGVmaW5pdGlvblByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckhvdmVyUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkhvdmVyUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckhvdmVyUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5FdmFsdWF0YWJsZUV4cHJlc3Npb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlcklubGluZVZhbHVlc1Byb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5JbmxpbmVWYWx1ZXNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVySW5saW5lVmFsdWVzUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5NdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3Rlck11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5SZWZlcmVuY2VQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlJlbmFtZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJOZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5OZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICduZXdTeW1ib2xOYW1lc1Byb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3Rlck5ld1N5bWJvbE5hbWVzUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlck1ldGFkYXRhKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyLCBtZXRhZGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcihleHRlbnNpb24sIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJPblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5PblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBmaXJzdFRyaWdnZXJDaGFyYWN0ZXI6IHN0cmluZywgLi4ubW9yZVRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgW2ZpcnN0VHJpZ2dlckNoYXJhY3Rlcl0uY29uY2F0KG1vcmVUcmlnZ2VyQ2hhcmFjdGVycykpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIsIGxlZ2VuZDogdnNjb2RlLlNlbWFudGljVG9rZW5zTGVnZW5kKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIGxlZ2VuZCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIsIGxlZ2VuZDogdnNjb2RlLlNlbWFudGljVG9rZW5zTGVnZW5kKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgbGVnZW5kKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuU2lnbmF0dXJlSGVscFByb3ZpZGVyLCBmaXJzdEl0ZW0/OiBzdHJpbmcgfCB2c2NvZGUuU2lnbmF0dXJlSGVscFByb3ZpZGVyTWV0YWRhdGEsIC4uLnJlbWFpbmluZzogc3RyaW5nW10pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZmlyc3RJdGVtID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgZmlyc3RJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIHR5cGVvZiBmaXJzdEl0ZW0gPT09ICd1bmRlZmluZWQnID8gW10gOiBbZmlyc3RJdGVtLCAuLi5yZW1haW5pbmddKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIsIC4uLnRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgdHJpZ2dlckNoYXJhY3RlcnMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVySW5saW5lQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1Qcm92aWRlck1ldGFkYXRhKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRpZiAocHJvdmlkZXIuaGFuZGxlRGlkU2hvd0NvbXBsZXRpb25JdGVtKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvdmlkZXIuaGFuZGxlRGlkUGFydGlhbGx5QWNjZXB0Q29tcGxldGlvbkl0ZW0pIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtZXRhZGF0YSkge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVySW5saW5lQ29tcGxldGlvbnNQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgbWV0YWRhdGEpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGU7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLm9uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDb2xvclByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudENvbG9yUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckNvbG9yUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkZvbGRpbmdSYW5nZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJGb2xkaW5nUmFuZ2VQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5TZWxlY3Rpb25SYW5nZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGV4dGVuc2lvbiwgc2VsZWN0b3IsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNhbGxIaWVyYXJjaHlQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJDYWxsSGllcmFyY2h5UHJvdmlkZXIoZXh0ZW5zaW9uLCBzZWxlY3RvciwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVHlwZUhpZXJhcmNoeVByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5UeXBlSGllcmFyY2h5UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlclR5cGVIaWVyYXJjaHlQcm92aWRlcihleHRlbnNpb24sIHNlbGVjdG9yLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0c2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uOiAobGFuZ3VhZ2U6IHN0cmluZywgY29uZmlndXJhdGlvbjogdnNjb2RlLkxhbmd1YWdlQ29uZmlndXJhdGlvbik6IHZzY29kZS5EaXNwb3NhYmxlID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnNldExhbmd1YWdlQ29uZmlndXJhdGlvbihleHRlbnNpb24sIGxhbmd1YWdlLCBjb25maWd1cmF0aW9uKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRUb2tlbkluZm9ybWF0aW9uQXRQb3NpdGlvbihkb2M6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvczogdnNjb2RlLlBvc2l0aW9uKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rva2VuSW5mb3JtYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZXMudG9rZW5BdFBvc2l0aW9uKGRvYywgcG9zKTtcblx0XHRcdH0sXG5cdFx0XHRjb21wdXRlRnVsbFN5bnRheEhpZ2hsaWdodGluZyhzb3VyY2U6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RvY3VtZW50U3ludGF4SGlnaGxpZ2h0aW5nJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VzLmNvbXB1dGVGdWxsU3ludGF4SGlnaGxpZ2h0aW5nKHNvdXJjZSwgbGFuZ3VhZ2VJZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdkb2N1bWVudFN5bnRheEhpZ2hsaWdodGluZycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlcy5vbkRpZENoYW5nZVN5bnRheEhpZ2hsaWdodGluZztcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlcklubGF5SGludHNQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW5sYXlIaW50c1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJJbmxheUhpbnRzUHJvdmlkZXIoZXh0ZW5zaW9uLCBzZWxlY3RvciwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUxhbmd1YWdlU3RhdHVzSXRlbShpZDogc3RyaW5nLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IpOiB2c2NvZGUuTGFuZ3VhZ2VTdGF0dXNJdGVtIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZXMuY3JlYXRlTGFuZ3VhZ2VTdGF0dXNJdGVtKGV4dGVuc2lvbiwgaWQsIHNlbGVjdG9yKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50RHJvcEVkaXRQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyLCBtZXRhZGF0YT86IHZzY29kZS5Eb2N1bWVudERyb3BFZGl0UHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uLCBzZWxlY3RvciwgcHJvdmlkZXIsIG1ldGFkYXRhKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiB3aW5kb3dcblx0XHRjb25zdCB3aW5kb3c6IHR5cGVvZiB2c2NvZGUud2luZG93ID0ge1xuXHRcdFx0Z2V0IGFjdGl2ZVRleHRFZGl0b3IoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RWRpdG9ycy5nZXRBY3RpdmVUZXh0RWRpdG9yKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHZpc2libGVUZXh0RWRpdG9ycygpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFZGl0b3JzLmdldFZpc2libGVUZXh0RWRpdG9ycygpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY3RpdmVUZXJtaW5hbCgpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXJtaW5hbFNlcnZpY2UuYWN0aXZlVGVybWluYWw7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRlcm1pbmFscygpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXJtaW5hbFNlcnZpY2UudGVybWluYWxzO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHNob3dUZXh0RG9jdW1lbnQoZG9jdW1lbnRPclVyaTogdnNjb2RlLlRleHREb2N1bWVudCB8IHZzY29kZS5VcmksIGNvbHVtbk9yT3B0aW9ucz86IHZzY29kZS5WaWV3Q29sdW1uIHwgdnNjb2RlLlRleHREb2N1bWVudFNob3dPcHRpb25zLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dnNjb2RlLlRleHRFZGl0b3I+IHtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShkb2N1bWVudE9yVXJpKSAmJiBkb2N1bWVudE9yVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUgJiYgIWRvY3VtZW50T3JVcmkuYXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0ZXh0SG9zdEFwaURlcHJlY2F0aW9uLnJlcG9ydCgnd29ya3NwYWNlLnNob3dUZXh0RG9jdW1lbnQnLCBleHRlbnNpb24sIGBBIFVSSSBvZiAndnNjb2RlLXJlbW90ZScgc2NoZW1lIHJlcXVpcmVzIGFuIGF1dGhvcml0eS5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkb2N1bWVudCA9IGF3YWl0IChVUkkuaXNVcmkoZG9jdW1lbnRPclVyaSlcblx0XHRcdFx0XHQ/IFByb21pc2UucmVzb2x2ZSh3b3Jrc3BhY2Uub3BlblRleHREb2N1bWVudChkb2N1bWVudE9yVXJpKSlcblx0XHRcdFx0XHQ6IFByb21pc2UucmVzb2x2ZSg8dnNjb2RlLlRleHREb2N1bWVudD5kb2N1bWVudE9yVXJpKSk7XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFZGl0b3JzLnNob3dUZXh0RG9jdW1lbnQoZG9jdW1lbnQsIGNvbHVtbk9yT3B0aW9ucywgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlVGV4dEVkaXRvckRlY29yYXRpb25UeXBlKG9wdGlvbnM6IHZzY29kZS5EZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyk6IHZzY29kZS5UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVkaXRvcnMuY3JlYXRlVGV4dEVkaXRvckRlY29yYXRpb25UeXBlKGV4dGVuc2lvbiwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVUZXh0RWRpdG9yKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZUFjdGl2ZVRleHRFZGl0b3IpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmxlVGV4dEVkaXRvcnMobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZVZpc2libGVUZXh0RWRpdG9ycykobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRleHRFZGl0b3JTZWxlY3Rpb24obGlzdGVuZXI6IChlOiB2c2NvZGUuVGV4dEVkaXRvclNlbGVjdGlvbkNoYW5nZUV2ZW50KSA9PiBhbnksIHRoaXNBcmdzPzogYW55LCBkaXNwb3NhYmxlcz86IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlW10pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RFZGl0b3JzLm9uRGlkQ2hhbmdlVGV4dEVkaXRvclNlbGVjdGlvbikobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUZXh0RWRpdG9yT3B0aW9ucyhsaXN0ZW5lcjogKGU6IHZzY29kZS5UZXh0RWRpdG9yT3B0aW9uc0NoYW5nZUV2ZW50KSA9PiBhbnksIHRoaXNBcmdzPzogYW55LCBkaXNwb3NhYmxlcz86IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlW10pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RFZGl0b3JzLm9uRGlkQ2hhbmdlVGV4dEVkaXRvck9wdGlvbnMpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVGV4dEVkaXRvclZpc2libGVSYW5nZXMobGlzdGVuZXI6IChlOiB2c2NvZGUuVGV4dEVkaXRvclZpc2libGVSYW5nZXNDaGFuZ2VFdmVudCkgPT4gYW55LCB0aGlzQXJncz86IGFueSwgZGlzcG9zYWJsZXM/OiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZVtdKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZVRleHRFZGl0b3JWaXNpYmxlUmFuZ2VzKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRleHRFZGl0b3JWaWV3Q29sdW1uKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZVRleHRFZGl0b3JWaWV3Q29sdW1uKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZVRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDbG9zZVRlcm1pbmFsKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTZXJ2aWNlLm9uRGlkQ2xvc2VUZXJtaW5hbCkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZE9wZW5UZXJtaW5hbChsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZE9wZW5UZXJtaW5hbCkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZVRlcm1pbmFsKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlVGVybWluYWwpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUZXJtaW5hbERpbWVuc2lvbnMobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVybWluYWxEaW1lbnNpb25zJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlVGVybWluYWxEaW1lbnNpb25zKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZShsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZVRlcm1pbmFsU3RhdGUpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRXcml0ZVRlcm1pbmFsRGF0YShsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXJtaW5hbERhdGFXcml0ZUV2ZW50Jyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTZXJ2aWNlLm9uRGlkV3JpdGVUZXJtaW5hbERhdGEpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRFeGVjdXRlVGVybWluYWxDb21tYW5kKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlcm1pbmFsRXhlY3V0ZUNvbW1hbmRFdmVudCcpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZEV4ZWN1dGVUZXJtaW5hbENvbW1hbmQpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24ub25EaWRDaGFuZ2VUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb24obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24ub25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRFbmRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLm9uRGlkRW5kVGVybWluYWxTaGVsbEV4ZWN1dGlvbikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgc3RhdGUoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V2luZG93LmdldFN0YXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VXaW5kb3dTdGF0ZShsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFdpbmRvdy5vbkRpZENoYW5nZVdpbmRvd1N0YXRlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHNob3dJbmZvcm1hdGlvbk1lc3NhZ2UobWVzc2FnZTogc3RyaW5nLCAuLi5yZXN0OiBBcnJheTx2c2NvZGUuTWVzc2FnZU9wdGlvbnMgfCBzdHJpbmcgfCB2c2NvZGUuTWVzc2FnZUl0ZW0+KSB7XG5cdFx0XHRcdHJldHVybiA8VGhlbmFibGU8YW55Pj5leHRIb3N0TWVzc2FnZVNlcnZpY2Uuc2hvd01lc3NhZ2UoZXh0ZW5zaW9uLCBTZXZlcml0eS5JbmZvLCBtZXNzYWdlLCByZXN0WzBdLCA8QXJyYXk8c3RyaW5nIHwgdnNjb2RlLk1lc3NhZ2VJdGVtPj5yZXN0LnNsaWNlKDEpKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93V2FybmluZ01lc3NhZ2UobWVzc2FnZTogc3RyaW5nLCAuLi5yZXN0OiBBcnJheTx2c2NvZGUuTWVzc2FnZU9wdGlvbnMgfCBzdHJpbmcgfCB2c2NvZGUuTWVzc2FnZUl0ZW0+KSB7XG5cdFx0XHRcdHJldHVybiA8VGhlbmFibGU8YW55Pj5leHRIb3N0TWVzc2FnZVNlcnZpY2Uuc2hvd01lc3NhZ2UoZXh0ZW5zaW9uLCBTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlLCByZXN0WzBdLCA8QXJyYXk8c3RyaW5nIHwgdnNjb2RlLk1lc3NhZ2VJdGVtPj5yZXN0LnNsaWNlKDEpKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93RXJyb3JNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZywgLi4ucmVzdDogQXJyYXk8dnNjb2RlLk1lc3NhZ2VPcHRpb25zIHwgc3RyaW5nIHwgdnNjb2RlLk1lc3NhZ2VJdGVtPikge1xuXHRcdFx0XHRyZXR1cm4gPFRoZW5hYmxlPGFueT4+ZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlLnNob3dNZXNzYWdlKGV4dGVuc2lvbiwgU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2UsIHJlc3RbMF0sIDxBcnJheTxzdHJpbmcgfCB2c2NvZGUuTWVzc2FnZUl0ZW0+PnJlc3Quc2xpY2UoMSkpO1xuXHRcdFx0fSxcblx0XHRcdHNob3dRdWlja1BpY2soaXRlbXM6IGFueSwgb3B0aW9ucz86IHZzY29kZS5RdWlja1BpY2tPcHRpb25zLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IGFueSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UXVpY2tPcGVuLnNob3dRdWlja1BpY2soZXh0ZW5zaW9uLCBpdGVtcywgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdHNob3dXb3Jrc3BhY2VGb2xkZXJQaWNrKG9wdGlvbnM/OiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyUGlja09wdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RRdWlja09wZW4uc2hvd1dvcmtzcGFjZUZvbGRlclBpY2sob3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0c2hvd0lucHV0Qm94KG9wdGlvbnM/OiB2c2NvZGUuSW5wdXRCb3hPcHRpb25zLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFF1aWNrT3Blbi5zaG93SW5wdXQob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdHNob3dPcGVuRGlhbG9nKG9wdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REaWFsb2dzLnNob3dPcGVuRGlhbG9nKG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdHNob3dTYXZlRGlhbG9nKG9wdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REaWFsb2dzLnNob3dTYXZlRGlhbG9nKG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVN0YXR1c0Jhckl0ZW0oYWxpZ25tZW50T3JJZD86IHZzY29kZS5TdGF0dXNCYXJBbGlnbm1lbnQgfCBzdHJpbmcsIHByaW9yaXR5T3JBbGlnbm1lbnQ/OiBudW1iZXIgfCB2c2NvZGUuU3RhdHVzQmFyQWxpZ25tZW50LCBwcmlvcml0eUFyZz86IG51bWJlcik6IHZzY29kZS5TdGF0dXNCYXJJdGVtIHtcblx0XHRcdFx0bGV0IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBhbGlnbm1lbnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IHByaW9yaXR5OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBhbGlnbm1lbnRPcklkID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGlkID0gYWxpZ25tZW50T3JJZDtcblx0XHRcdFx0XHRhbGlnbm1lbnQgPSBwcmlvcml0eU9yQWxpZ25tZW50O1xuXHRcdFx0XHRcdHByaW9yaXR5ID0gcHJpb3JpdHlBcmc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWxpZ25tZW50ID0gYWxpZ25tZW50T3JJZDtcblx0XHRcdFx0XHRwcmlvcml0eSA9IHByaW9yaXR5T3JBbGlnbm1lbnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFN0YXR1c0Jhci5jcmVhdGVTdGF0dXNCYXJFbnRyeShleHRlbnNpb24sIGlkLCBhbGlnbm1lbnQsIHByaW9yaXR5KTtcblx0XHRcdH0sXG5cdFx0XHRzZXRTdGF0dXNCYXJNZXNzYWdlKHRleHQ6IHN0cmluZywgdGltZW91dE9yVGhlbmFibGU/OiBudW1iZXIgfCBUaGVuYWJsZTxhbnk+KTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFN0YXR1c0Jhci5zZXRTdGF0dXNCYXJNZXNzYWdlKHRleHQsIHRpbWVvdXRPclRoZW5hYmxlKTtcblx0XHRcdH0sXG5cdFx0XHR3aXRoU2NtUHJvZ3Jlc3M8Uj4odGFzazogKHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8bnVtYmVyPikgPT4gVGhlbmFibGU8Uj4pIHtcblx0XHRcdFx0ZXh0SG9zdEFwaURlcHJlY2F0aW9uLnJlcG9ydCgnd2luZG93LndpdGhTY21Qcm9ncmVzcycsIGV4dGVuc2lvbixcblx0XHRcdFx0XHRgVXNlICd3aXRoUHJvZ3Jlc3MnIGluc3RlYWQuYCk7XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQcm9ncmVzcy53aXRoUHJvZ3Jlc3MoZXh0ZW5zaW9uLCB7IGxvY2F0aW9uOiBleHRIb3N0VHlwZXMuUHJvZ3Jlc3NMb2NhdGlvbi5Tb3VyY2VDb250cm9sIH0sIChwcm9ncmVzcywgdG9rZW4pID0+IHRhc2soeyByZXBvcnQobjogbnVtYmVyKSB7IC8qbm9vcCovIH0gfSkpO1xuXHRcdFx0fSxcblx0XHRcdHdpdGhQcm9ncmVzczxSPihvcHRpb25zOiB2c2NvZGUuUHJvZ3Jlc3NPcHRpb25zLCB0YXNrOiAocHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx7IG1lc3NhZ2U/OiBzdHJpbmc7IHdvcmtlZD86IG51bWJlciB9PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4gVGhlbmFibGU8Uj4pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQcm9ncmVzcy53aXRoUHJvZ3Jlc3MoZXh0ZW5zaW9uLCBvcHRpb25zLCB0YXNrKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVPdXRwdXRDaGFubmVsKG5hbWU6IHN0cmluZywgb3B0aW9uczogc3RyaW5nIHwgeyBsb2c6IHRydWUgfSB8IHVuZGVmaW5lZCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0T3V0cHV0U2VydmljZS5jcmVhdGVPdXRwdXRDaGFubmVsKG5hbWUsIG9wdGlvbnMsIGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlV2Vidmlld1BhbmVsKHZpZXdUeXBlOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIHNob3dPcHRpb25zOiB2c2NvZGUuVmlld0NvbHVtbiB8IHsgdmlld0NvbHVtbjogdnNjb2RlLlZpZXdDb2x1bW47IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0sIG9wdGlvbnM/OiB2c2NvZGUuV2Vidmlld1BhbmVsT3B0aW9ucyAmIHZzY29kZS5XZWJ2aWV3T3B0aW9ucyk6IHZzY29kZS5XZWJ2aWV3UGFuZWwge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdlYnZpZXdQYW5lbHMuY3JlYXRlV2Vidmlld1BhbmVsKGV4dGVuc2lvbiwgdmlld1R5cGUsIHRpdGxlLCBzaG93T3B0aW9ucywgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlV2Vidmlld1RleHRFZGl0b3JJbnNldChlZGl0b3I6IHZzY29kZS5UZXh0RWRpdG9yLCBsaW5lOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBvcHRpb25zPzogdnNjb2RlLldlYnZpZXdPcHRpb25zKTogdnNjb2RlLldlYnZpZXdFZGl0b3JJbnNldCB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2VkaXRvckluc2V0cycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVkaXRvckluc2V0cy5jcmVhdGVXZWJ2aWV3RWRpdG9ySW5zZXQoZWRpdG9yLCBsaW5lLCBoZWlnaHQsIG9wdGlvbnMsIGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlVGVybWluYWwobmFtZU9yT3B0aW9ucz86IHZzY29kZS5UZXJtaW5hbE9wdGlvbnMgfCB2c2NvZGUuRXh0ZW5zaW9uVGVybWluYWxPcHRpb25zIHwgc3RyaW5nLCBzaGVsbFBhdGg/OiBzdHJpbmcsIHNoZWxsQXJncz86IHJlYWRvbmx5IHN0cmluZ1tdIHwgc3RyaW5nKTogdnNjb2RlLlRlcm1pbmFsIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBuYW1lT3JPcHRpb25zID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGxldCBvcHRpb25zID0gbmFtZU9yT3B0aW9ucztcblx0XHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlcm1pbmFsVGl0bGUnKSAmJiAndGl0bGVUZW1wbGF0ZScgaW4gbmFtZU9yT3B0aW9ucyAmJiBuYW1lT3JPcHRpb25zLnRpdGxlVGVtcGxhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgWyR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBcXGB0aXRsZVRlbXBsYXRlXFxgIHdhcyBwcm92aWRlZCB0byB3aW5kb3cuY3JlYXRlVGVybWluYWwgYnV0IGlzIGlnbm9yZWQgYmVjYXVzZSB0aGUgXFxgdGVybWluYWxUaXRsZVxcYCBwcm9wb3NlZCBBUEkgaXMgbm90IGVuYWJsZWQuYCk7XG5cdFx0XHRcdFx0XHRvcHRpb25zID0geyAuLi5uYW1lT3JPcHRpb25zLCB0aXRsZVRlbXBsYXRlOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCdwdHknIGluIG9wdGlvbnMpIHtcblx0XHRcdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLmNyZWF0ZUV4dGVuc2lvblRlcm1pbmFsKG9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbEZyb21PcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKG5hbWVPck9wdGlvbnMsIHNoZWxsUGF0aCwgc2hlbGxBcmdzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRlcm1pbmFsTGlua1Byb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxMaW5rUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLnJlZ2lzdGVyTGlua1Byb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyKGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxQcm9maWxlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvZmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgaWQsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI8dnNjb2RlLlRlcm1pbmFsQ29tcGxldGlvbkl0ZW0+LCAuLi50cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBwcm92aWRlciwgLi4udHJpZ2dlckNoYXJhY3RlcnMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGVybWluYWxRdWlja0ZpeFByb3ZpZGVyKGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxRdWlja0ZpeFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXJtaW5hbFF1aWNrRml4UHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXJtaW5hbFNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbFF1aWNrRml4UHJvdmlkZXIoaWQsIGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUcmVlRGF0YVByb3ZpZGVyKHZpZXdJZDogc3RyaW5nLCB0cmVlRGF0YVByb3ZpZGVyOiB2c2NvZGUuVHJlZURhdGFQcm92aWRlcjxhbnk+KTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRyZWVWaWV3cy5yZWdpc3RlclRyZWVEYXRhUHJvdmlkZXIodmlld0lkLCB0cmVlRGF0YVByb3ZpZGVyLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVRyZWVWaWV3KHZpZXdJZDogc3RyaW5nLCBvcHRpb25zOiB7IHRyZWVEYXRhUHJvdmlkZXI6IHZzY29kZS5UcmVlRGF0YVByb3ZpZGVyPGFueT4gfSk6IHZzY29kZS5UcmVlVmlldzxhbnk+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUcmVlVmlld3MuY3JlYXRlVHJlZVZpZXcodmlld0lkLCBvcHRpb25zLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyV2Vidmlld1BhbmVsU2VyaWFsaXplcjogKHZpZXdUeXBlOiBzdHJpbmcsIHNlcmlhbGl6ZXI6IHZzY29kZS5XZWJ2aWV3UGFuZWxTZXJpYWxpemVyKSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V2Vidmlld1BhbmVscy5yZWdpc3RlcldlYnZpZXdQYW5lbFNlcmlhbGl6ZXIoZXh0ZW5zaW9uLCB2aWV3VHlwZSwgc2VyaWFsaXplcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDdXN0b21FZGl0b3JQcm92aWRlcjogKHZpZXdUeXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyIHwgdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIsIG9wdGlvbnM6IHsgd2Vidmlld09wdGlvbnM/OiB2c2NvZGUuV2Vidmlld1BhbmVsT3B0aW9uczsgc3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudD86IGJvb2xlYW4gfSA9IHt9KSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q3VzdG9tRWRpdG9ycy5yZWdpc3RlckN1c3RvbUVkaXRvclByb3ZpZGVyKGV4dGVuc2lvbiwgdmlld1R5cGUsIHByb3ZpZGVyLCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckZpbGVEZWNvcmF0aW9uUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5GaWxlRGVjb3JhdGlvblByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVjb3JhdGlvbnMucmVnaXN0ZXJGaWxlRGVjb3JhdGlvblByb3ZpZGVyKHByb3ZpZGVyLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVXJpSGFuZGxlcihoYW5kbGVyOiB2c2NvZGUuVXJpSGFuZGxlcikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFVybHMucmVnaXN0ZXJVcmlIYW5kbGVyKGV4dGVuc2lvbiwgaGFuZGxlcik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlUXVpY2tQaWNrPFQgZXh0ZW5kcyB2c2NvZGUuUXVpY2tQaWNrSXRlbT4oKTogdnNjb2RlLlF1aWNrUGljazxUPiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UXVpY2tPcGVuLmNyZWF0ZVF1aWNrUGljayhleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUlucHV0Qm94KCk6IHZzY29kZS5JbnB1dEJveCB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UXVpY2tPcGVuLmNyZWF0ZUlucHV0Qm94KGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFjdGl2ZUNvbG9yVGhlbWUoKTogdnNjb2RlLkNvbG9yVGhlbWUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRoZW1pbmcuYWN0aXZlQ29sb3JUaGVtZTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZUNvbG9yVGhlbWUobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUaGVtaW5nLm9uRGlkQ2hhbmdlQWN0aXZlQ29sb3JUaGVtZSkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlcldlYnZpZXdWaWV3UHJvdmlkZXIodmlld0lkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuV2Vidmlld1ZpZXdQcm92aWRlciwgb3B0aW9ucz86IHtcblx0XHRcdFx0d2Vidmlld09wdGlvbnM/OiB7XG5cdFx0XHRcdFx0cmV0YWluQ29udGV4dFdoZW5IaWRkZW4/OiBib29sZWFuO1xuXHRcdFx0XHR9O1xuXHRcdFx0fSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdlYnZpZXdWaWV3cy5yZWdpc3RlcldlYnZpZXdWaWV3UHJvdmlkZXIoZXh0ZW5zaW9uLCB2aWV3SWQsIHByb3ZpZGVyLCBvcHRpb25zPy53ZWJ2aWV3T3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFjdGl2ZU5vdGVib29rRWRpdG9yKCk6IHZzY29kZS5Ob3RlYm9va0VkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Tm90ZWJvb2suYWN0aXZlTm90ZWJvb2tFZGl0b3I7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVOb3RlYm9va0VkaXRvcihsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9vay5vbkRpZENoYW5nZUFjdGl2ZU5vdGVib29rRWRpdG9yKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdmlzaWJsZU5vdGVib29rRWRpdG9ycygpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9vay52aXNpYmxlTm90ZWJvb2tFZGl0b3JzO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVZpc2libGVOb3RlYm9va0VkaXRvcnMoKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Tm90ZWJvb2sub25EaWRDaGFuZ2VWaXNpYmxlTm90ZWJvb2tFZGl0b3JzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZU5vdGVib29rRWRpdG9yU2VsZWN0aW9uKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE5vdGVib29rRWRpdG9ycy5vbkRpZENoYW5nZU5vdGVib29rRWRpdG9yU2VsZWN0aW9uKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZU5vdGVib29rRWRpdG9yVmlzaWJsZVJhbmdlcyhsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9va0VkaXRvcnMub25EaWRDaGFuZ2VOb3RlYm9va0VkaXRvclZpc2libGVSYW5nZXMpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHNob3dOb3RlYm9va0RvY3VtZW50KGRvY3VtZW50LCBvcHRpb25zPykge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rLnNob3dOb3RlYm9va0RvY3VtZW50KGRvY3VtZW50LCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckV4dGVybmFsVXJpT3BlbmVyKGlkOiBzdHJpbmcsIG9wZW5lcjogdnNjb2RlLkV4dGVybmFsVXJpT3BlbmVyLCBtZXRhZGF0YTogdnNjb2RlLkV4dGVybmFsVXJpT3BlbmVyTWV0YWRhdGEpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZXh0ZXJuYWxVcmlPcGVuZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RVcmlPcGVuZXJzLnJlZ2lzdGVyRXh0ZXJuYWxVcmlPcGVuZXIoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGlkLCBvcGVuZXIsIG1ldGFkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclByb2ZpbGVDb250ZW50SGFuZGxlcihpZDogc3RyaW5nLCBoYW5kbGVyOiB2c2NvZGUuUHJvZmlsZUNvbnRlbnRIYW5kbGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Byb2ZpbGVDb250ZW50SGFuZGxlcnMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQcm9maWxlQ29udGVudEhhbmRsZXJzLnJlZ2lzdGVyUHJvZmlsZUNvbnRlbnRIYW5kbGVyKGV4dGVuc2lvbiwgaWQsIGhhbmRsZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyUXVpY2tEaWZmUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBxdWlja0RpZmZQcm92aWRlcjogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyLCBpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCByb290VXJpPzogdnNjb2RlLlVyaSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAncXVpY2tEaWZmUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RRdWlja0RpZmYucmVnaXN0ZXJRdWlja0RpZmZQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBxdWlja0RpZmZQcm92aWRlciwgaWQsIGxhYmVsLCByb290VXJpKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVTb3VyY2VDb250cm9sRGlmZkluZm9ybWF0aW9uKHVyaTogdnNjb2RlLlVyaSk6IHZzY29kZS5Tb3VyY2VDb250cm9sRGlmZkluZm9ybWF0aW9uUHJvdmlkZXIge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UXVpY2tEaWZmLmNyZWF0ZVNvdXJjZUNvbnRyb2xEaWZmSW5mb3JtYXRpb24odXJpKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVBZ2VudEVkaXRvckNvbW1lbnRzKHVyaTogdnNjb2RlLlVyaSk6IHZzY29kZS5BZ2VudEVkaXRvckNvbW1lbnRzUHJvdmlkZXIge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdhZ2VudEVkaXRvckNvbW1lbnRzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QWdlbnRFZGl0b3JDb21tZW50cy5jcmVhdGVBZ2VudEVkaXRvckNvbW1lbnRzKHVyaSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRhYkdyb3VwcygpOiB2c2NvZGUuVGFiR3JvdXBzIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcztcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclNoYXJlUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlNoYXJlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3NoYXJlUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTaGFyZS5yZWdpc3RlclNoYXJlUHJvdmlkZXIoY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgbmF0aXZlSGFuZGxlKCk6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICduYXRpdmVXaW5kb3dIYW5kbGUnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXaW5kb3cubmF0aXZlSGFuZGxlO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUNoYXRTdGF0dXNJdGVtOiAoaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0U3RhdHVzSXRlbScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRTdGF0dXMuY3JlYXRlQ2hhdFN0YXR1c0l0ZW0oZXh0ZW5zaW9uLCBpZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZSgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLmFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZTogKGxpc3RlbmVycywgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdENoYXRBZ2VudHMyLm9uRGlkQ2hhbmdlQWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlKShsaXN0ZW5lcnMsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGJyb3dzZXJUYWJzKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdicm93c2VyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QnJvd3NlcnMuYnJvd3NlclRhYnM7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRPcGVuQnJvd3NlclRhYihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdicm93c2VyJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0QnJvd3NlcnMub25EaWRPcGVuQnJvd3NlclRhYikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENsb3NlQnJvd3NlclRhYihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdicm93c2VyJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0QnJvd3NlcnMub25EaWRDbG9zZUJyb3dzZXJUYWIpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFjdGl2ZUJyb3dzZXJUYWIoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Jyb3dzZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RCcm93c2Vycy5hY3RpdmVCcm93c2VyVGFiO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdicm93c2VyJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0QnJvd3NlcnMub25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Jyb3dzZXInKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RCcm93c2Vycy5vbkRpZENoYW5nZUJyb3dzZXJUYWJTdGF0ZSkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvcGVuQnJvd3NlclRhYih1cmw6IHN0cmluZywgb3B0aW9ucz86IHZzY29kZS5Ccm93c2VyVGFiU2hvd09wdGlvbnMpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYnJvd3NlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEJyb3dzZXJzLm9wZW5Ccm93c2VyVGFiKHVybCwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IHdvcmtzcGFjZVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlOiB0eXBlb2YgdnNjb2RlLndvcmtzcGFjZSA9IHtcblx0XHRcdGdldCByb290UGF0aCgpIHtcblx0XHRcdFx0ZXh0SG9zdEFwaURlcHJlY2F0aW9uLnJlcG9ydCgnd29ya3NwYWNlLnJvb3RQYXRoJywgZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdGBQbGVhc2UgdXNlICd3b3Jrc3BhY2Uud29ya3NwYWNlRm9sZGVycycgaW5zdGVhZC4gTW9yZSBkZXRhaWxzOiBodHRwczovL2FrYS5tcy92c2NvZGUtZWxpbWluYXRpbmctcm9vdHBhdGhgKTtcblxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5nZXRQYXRoKCk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHJvb3RQYXRoKHZhbHVlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBlcnJvcnMuUmVhZG9ubHlFcnJvcigncm9vdFBhdGgnKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgd29ya3NwYWNlRm9sZGVycygpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZ2V0V29ya3NwYWNlRm9sZGVycygpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBuYW1lKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5uYW1lO1xuXHRcdFx0fSxcblx0XHRcdHNldCBuYW1lKHZhbHVlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBlcnJvcnMuUmVhZG9ubHlFcnJvcignbmFtZScpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB3b3Jrc3BhY2VGaWxlKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2VGaWxlO1xuXHRcdFx0fSxcblx0XHRcdHNldCB3b3Jrc3BhY2VGaWxlKHZhbHVlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBlcnJvcnMuUmVhZG9ubHlFcnJvcignd29ya3NwYWNlRmlsZScpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpc0FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UnKTtcblx0XHRcdFx0cmV0dXJuICEhaW5pdERhdGEuZW52aXJvbm1lbnQuaXNTZXNzaW9uc1dpbmRvdztcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGVXb3Jrc3BhY2VGb2xkZXJzOiAoaW5kZXgsIGRlbGV0ZUNvdW50LCAuLi53b3Jrc3BhY2VGb2xkZXJzVG9BZGQpID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb24sIGluZGV4LCBkZWxldGVDb3VudCB8fCAwLCAuLi53b3Jrc3BhY2VGb2xkZXJzVG9BZGQpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogZnVuY3Rpb24gKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFdvcmtzcGFjZS5vbkRpZENoYW5nZVdvcmtzcGFjZSkobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0YXNSZWxhdGl2ZVBhdGg6IChwYXRoT3JVcmksIGluY2x1ZGVXb3Jrc3BhY2U/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLmdldFJlbGF0aXZlUGF0aChwYXRoT3JVcmksIGluY2x1ZGVXb3Jrc3BhY2UpO1xuXHRcdFx0fSxcblx0XHRcdGZpbmRGaWxlczogKGluY2x1ZGUsIGV4Y2x1ZGUsIG1heFJlc3VsdHM/LCB0b2tlbj8pID0+IHtcblx0XHRcdFx0Ly8gTm90ZSwgdW5kZWZpbmVkL251bGwgaGF2ZSBkaWZmZXJlbnQgbWVhbmluZ3Mgb24gXCJleGNsdWRlXCJcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZmluZEZpbGVzKGluY2x1ZGUsIGV4Y2x1ZGUsIG1heFJlc3VsdHMsIGV4dGVuc2lvbi5pZGVudGlmaWVyLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZEZpbGVzMjogKGZpbGVQYXR0ZXJuOiB2c2NvZGUuR2xvYlBhdHRlcm5bXSwgb3B0aW9ucz86IHZzY29kZS5GaW5kRmlsZXMyT3B0aW9ucywgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBUaGVuYWJsZTx2c2NvZGUuVXJpW10+ID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZmluZEZpbGVzMicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5maW5kRmlsZXMyKGZpbGVQYXR0ZXJuLCBvcHRpb25zLCBleHRlbnNpb24uaWRlbnRpZmllciwgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGZpbmRUZXh0SW5GaWxlczogKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zT3JDYWxsYmFjazogdnNjb2RlLkZpbmRUZXh0SW5GaWxlc09wdGlvbnMgfCAoKHJlc3VsdDogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHQpID0+IHZvaWQpLCBjYWxsYmFja09yVG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4gfCAoKHJlc3VsdDogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHQpID0+IHZvaWQpLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdmaW5kVGV4dEluRmlsZXMnKTtcblx0XHRcdFx0bGV0IG9wdGlvbnM6IHZzY29kZS5GaW5kVGV4dEluRmlsZXNPcHRpb25zO1xuXHRcdFx0XHRsZXQgY2FsbGJhY2s6IChyZXN1bHQ6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0KSA9PiB2b2lkO1xuXG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9uc09yQ2FsbGJhY2sgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0b3B0aW9ucyA9IG9wdGlvbnNPckNhbGxiYWNrO1xuXHRcdFx0XHRcdGNhbGxiYWNrID0gY2FsbGJhY2tPclRva2VuIGFzIChyZXN1bHQ6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0KSA9PiB2b2lkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9wdGlvbnMgPSB7fTtcblx0XHRcdFx0XHRjYWxsYmFjayA9IG9wdGlvbnNPckNhbGxiYWNrO1xuXHRcdFx0XHRcdHRva2VuID0gY2FsbGJhY2tPclRva2VuIGFzIHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLmZpbmRUZXh0SW5GaWxlcyhxdWVyeSwgb3B0aW9ucyB8fCB7fSwgY2FsbGJhY2ssIGV4dGVuc2lvbi5pZGVudGlmaWVyLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZFRleHRJbkZpbGVzMjogKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5Miwgb3B0aW9ucz86IHZzY29kZS5GaW5kVGV4dEluRmlsZXNPcHRpb25zMiwgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuRmluZFRleHRJbkZpbGVzUmVzcG9uc2UgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdmaW5kVGV4dEluRmlsZXMyJyk7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RleHRTZWFyY2hQcm92aWRlcjInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZmluZFRleHRJbkZpbGVzMihxdWVyeSwgb3B0aW9ucywgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRUZXh0RGlmZihvcmlnaW5hbERvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBtb2RpZmllZERvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBvcHRpb25zPzogdnNjb2RlLlRleHREaWZmT3B0aW9ucywgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuVGV4dERpZmZSZXNwb25zZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RvY3VtZW50RGlmZicpO1xuXHRcdFx0XHRjb25zdCBwcm94eSA9IHJwY1Byb3RvY29sLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWREb2N1bWVudERpZmYpO1xuXHRcdFx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgZXJyb3JzLkNhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNoYW5nZXM6IEFzeW5jSXRlcmFibGVPYmplY3QuRU1QVFksXG5cdFx0XHRcdFx0XHRjb21wbGV0ZTogUHJvbWlzZS5yZWplY3QoZXJyb3IpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IHByb3h5LiRjb21wdXRlRG9jdW1lbnREaWZmKFxuXHRcdFx0XHRcdG9yaWdpbmFsRG9jdW1lbnQudXJpLFxuXHRcdFx0XHRcdG1vZGlmaWVkRG9jdW1lbnQudXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM/Lmlnbm9yZVRyaW1XaGl0ZXNwYWNlID8/IGZhbHNlLFxuXHRcdFx0XHRcdG9wdGlvbnM/Lm1heENvbXB1dGF0aW9uVGltZU1zID8/IDUwMDAsXG5cdFx0XHRcdFx0b3B0aW9ucz8uY29tcHV0ZU1vdmVzID8/IGZhbHNlLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBkaWZmUHJvbWlzZSA9IHRva2VuID8gcmFjZUNhbmNlbGxhdGlvbkVycm9yKHJlc3VsdFByb21pc2UsIHRva2VuKSA6IHJlc3VsdFByb21pc2U7XG5cdFx0XHRcdGNvbnN0IG1hcHBlZFByb21pc2UgPSBkaWZmUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGNvbXB1dGUgZGlmZi4gTWFrZSBzdXJlIGJvdGggZG9jdW1lbnRzIGFyZSBhdmFpbGFibGUuJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IG1hcENoYW5nZSA9IChjOiBJRG9jdW1lbnREaWZmTGluZUNoYW5nZUR0bykgPT4gKHtcblx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlOiB0eXBlQ29udmVydGVycy5SYW5nZS50byhjLm9yaWdpbmFsUmFuZ2UpLFxuXHRcdFx0XHRcdG1vZGlmaWVkUmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKGMubW9kaWZpZWRSYW5nZSksXG5cdFx0XHRcdFx0aW5uZXJDaGFuZ2VzOiBjLmlubmVyQ2hhbmdlcz8ubWFwKGljID0+ICh7XG5cdFx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlOiB0eXBlQ29udmVydGVycy5SYW5nZS50byhpYy5vcmlnaW5hbFJhbmdlKSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkUmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKGljLm1vZGlmaWVkUmFuZ2UpLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gVE9ET0BBUEkgY3VycmVudGx5IHRoZSBkaWZmIGlzIGNvbXB1dGVkIGluIG9uZSBzaG90IGFuZCBhbGwgY2hhbmdlcyBhcmUgZW1pdHRlZCBhdCBvbmNlLlxuXHRcdFx0XHQvLyBJbiB0aGUgZnV0dXJlLCB3ZSBtYXkgd2FudCB0byBzdHJlYW0gY2hhbmdlcyBpbmNyZW1lbnRhbGx5IGFzIHRoZXkgYXJlIGNvbXB1dGVkXG5cdFx0XHRcdC8vIChlLmcuIGJ5IGhhdmluZyB0aGUgd29ya2VyIHlpZWxkIHBhcnRpYWwgcmVzdWx0cykuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y2hhbmdlczogbmV3IEFzeW5jSXRlcmFibGVPYmplY3Q8dnNjb2RlLlRleHREaWZmQ2hhbmdlPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcHBlZFByb21pc2U7XG5cdFx0XHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KHJlc3VsdC5jaGFuZ2VzLm1hcChtYXBDaGFuZ2UpKTtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRjb21wbGV0ZTogbWFwcGVkUHJvbWlzZS50aGVuKHJlc3VsdCA9PiAoe1xuXHRcdFx0XHRcdFx0aWRlbnRpY2FsOiByZXN1bHQuaWRlbnRpY2FsLFxuXHRcdFx0XHRcdFx0bWF5QmVJbmNvbXBsZXRlOiByZXN1bHQucXVpdEVhcmx5LFxuXHRcdFx0XHRcdFx0bW92ZXM6IHJlc3VsdC5tb3Zlcy5tYXAobSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlOiB0eXBlQ29udmVydGVycy5SYW5nZS50byhtLm9yaWdpbmFsUmFuZ2UpLFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZFJhbmdlOiB0eXBlQ29udmVydGVycy5SYW5nZS50byhtLm1vZGlmaWVkUmFuZ2UpLFxuXHRcdFx0XHRcdFx0XHRjaGFuZ2VzOiBtLmNoYW5nZXMubWFwKG1hcENoYW5nZSksXG5cdFx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdHNhdmU6ICh1cmkpID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2Uuc2F2ZSh1cmkpO1xuXHRcdFx0fSxcblx0XHRcdHNhdmVBczogKHVyaSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5zYXZlQXModXJpKTtcblx0XHRcdH0sXG5cdFx0XHRzYXZlQWxsOiAoaW5jbHVkZVVudGl0bGVkPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5zYXZlQWxsKGluY2x1ZGVVbnRpdGxlZCk7XG5cdFx0XHR9LFxuXHRcdFx0YXBwbHlFZGl0KGVkaXQ6IHZzY29kZS5Xb3Jrc3BhY2VFZGl0LCBtZXRhZGF0YT86IHZzY29kZS5Xb3Jrc3BhY2VFZGl0TWV0YWRhdGEpOiBUaGVuYWJsZTxib29sZWFuPiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QnVsa0VkaXRzLmFwcGx5V29ya3NwYWNlRWRpdChlZGl0LCBleHRlbnNpb24sIG1ldGFkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVGaWxlU3lzdGVtV2F0Y2hlcjogKHBhdHRlcm4sIG9wdGlvbnNPcklnbm9yZUNyZWF0ZSwgaWdub3JlQ2hhbmdlPywgaWdub3JlRGVsZXRlPyk6IHZzY29kZS5GaWxlU3lzdGVtV2F0Y2hlciA9PiB7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnM6IEZpbGVTeXN0ZW1XYXRjaGVyQ3JlYXRlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRpZ25vcmVDcmVhdGVFdmVudHM6IEJvb2xlYW4ob3B0aW9uc09ySWdub3JlQ3JlYXRlKSxcblx0XHRcdFx0XHRpZ25vcmVDaGFuZ2VFdmVudHM6IEJvb2xlYW4oaWdub3JlQ2hhbmdlKSxcblx0XHRcdFx0XHRpZ25vcmVEZWxldGVFdmVudHM6IEJvb2xlYW4oaWdub3JlRGVsZXRlKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEZpbGVTeXN0ZW1FdmVudC5jcmVhdGVGaWxlU3lzdGVtV2F0Y2hlcihleHRIb3N0V29ya3NwYWNlLCBjb25maWdQcm92aWRlciwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLCBleHRlbnNpb24sIHBhdHRlcm4sIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0ZXh0RG9jdW1lbnRzKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERvY3VtZW50cy5nZXRBbGxEb2N1bWVudERhdGEoKS5tYXAoZGF0YSA9PiBkYXRhLmRvY3VtZW50KTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgdGV4dERvY3VtZW50cyh2YWx1ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgZXJyb3JzLlJlYWRvbmx5RXJyb3IoJ3RleHREb2N1bWVudHMnKTtcblx0XHRcdH0sXG5cdFx0XHRvcGVuVGV4dERvY3VtZW50KHVyaU9yRmlsZU5hbWVPck9wdGlvbnM/OiB2c2NvZGUuVXJpIHwgc3RyaW5nIHwgeyBsYW5ndWFnZT86IHN0cmluZzsgY29udGVudD86IHN0cmluZzsgZW5jb2Rpbmc/OiBzdHJpbmcgfSwgb3B0aW9ucz86IHsgZW5jb2Rpbmc/OiBzdHJpbmcgfSkge1xuXHRcdFx0XHRsZXQgdXJpUHJvbWlzZTogVGhlbmFibGU8VVJJPjtcblxuXHRcdFx0XHRvcHRpb25zID0gKG9wdGlvbnMgPz8gdXJpT3JGaWxlTmFtZU9yT3B0aW9ucykgYXMgKHsgbGFuZ3VhZ2U/OiBzdHJpbmc7IGNvbnRlbnQ/OiBzdHJpbmc7IGVuY29kaW5nPzogc3RyaW5nIH0gfCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGlmICh0eXBlb2YgdXJpT3JGaWxlTmFtZU9yT3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR1cmlQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKFVSSS5maWxlKHVyaU9yRmlsZU5hbWVPck9wdGlvbnMpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChVUkkuaXNVcmkodXJpT3JGaWxlTmFtZU9yT3B0aW9ucykpIHtcblx0XHRcdFx0XHR1cmlQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHVyaU9yRmlsZU5hbWVPck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFvcHRpb25zIHx8IHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdHVyaVByb21pc2UgPSBleHRIb3N0RG9jdW1lbnRzLmNyZWF0ZURvY3VtZW50RGF0YShvcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2lsbGVnYWwgYXJndW1lbnQgLSB1cmlPckZpbGVOYW1lT3JPcHRpb25zJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdXJpUHJvbWlzZS50aGVuKHVyaSA9PiB7XG5cdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2UudHJhY2UoYG9wZW5UZXh0RG9jdW1lbnQgZnJvbSAke2V4dGVuc2lvbi5pZGVudGlmaWVyfWApO1xuXHRcdFx0XHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSAmJiAhdXJpLmF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0ZXh0SG9zdEFwaURlcHJlY2F0aW9uLnJlcG9ydCgnd29ya3NwYWNlLm9wZW5UZXh0RG9jdW1lbnQnLCBleHRlbnNpb24sIGBBIFVSSSBvZiAndnNjb2RlLXJlbW90ZScgc2NoZW1lIHJlcXVpcmVzIGFuIGF1dGhvcml0eS5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3REb2N1bWVudHMuZW5zdXJlRG9jdW1lbnREYXRhKHVyaSwgb3B0aW9ucykudGhlbihkb2N1bWVudERhdGEgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRvY3VtZW50RGF0YS5kb2N1bWVudDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRPcGVuVGV4dERvY3VtZW50OiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RG9jdW1lbnRzLm9uRGlkQWRkRG9jdW1lbnQpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2xvc2VUZXh0RG9jdW1lbnQ6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REb2N1bWVudHMub25EaWRSZW1vdmVEb2N1bWVudCkobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUZXh0RG9jdW1lbnQ6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RleHREb2N1bWVudENoYW5nZVJlYXNvbicpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REb2N1bWVudHMub25EaWRDaGFuZ2VEb2N1bWVudFdpdGhSZWFzb24pKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RG9jdW1lbnRzLm9uRGlkQ2hhbmdlRG9jdW1lbnQpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkU2F2ZVRleHREb2N1bWVudDogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERvY3VtZW50cy5vbkRpZFNhdmVEb2N1bWVudCkobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25XaWxsU2F2ZVRleHREb2N1bWVudDogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChleHRlbnNpb24pKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgbm90ZWJvb2tEb2N1bWVudHMoKTogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRbXSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Tm90ZWJvb2subm90ZWJvb2tEb2N1bWVudHMubWFwKGQgPT4gZC5hcGlOb3RlYm9vayk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgb3Blbk5vdGVib29rRG9jdW1lbnQodXJpT3JUeXBlPzogVVJJIHwgc3RyaW5nLCBjb250ZW50PzogdnNjb2RlLk5vdGVib29rRGF0YSkge1xuXHRcdFx0XHRsZXQgdXJpOiBVUkk7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkodXJpT3JUeXBlKSkge1xuXHRcdFx0XHRcdHVyaSA9IHVyaU9yVHlwZTtcblx0XHRcdFx0XHRhd2FpdCBleHRIb3N0Tm90ZWJvb2sub3Blbk5vdGVib29rRG9jdW1lbnQodXJpT3JUeXBlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgdXJpT3JUeXBlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHVyaSA9IFVSSS5yZXZpdmUoYXdhaXQgZXh0SG9zdE5vdGVib29rLmNyZWF0ZU5vdGVib29rRG9jdW1lbnQoeyB2aWV3VHlwZTogdXJpT3JUeXBlLCBjb250ZW50IH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9vay5nZXROb3RlYm9va0RvY3VtZW50KHVyaSkuYXBpTm90ZWJvb2s7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTYXZlTm90ZWJvb2tEb2N1bWVudChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5vbkRpZFNhdmVOb3RlYm9va0RvY3VtZW50KShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5vbkRpZENoYW5nZU5vdGVib29rRG9jdW1lbnQpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25XaWxsU2F2ZU5vdGVib29rRG9jdW1lbnQobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Tm90ZWJvb2tEb2N1bWVudFNhdmVQYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlTm90ZWJvb2tEb2N1bWVudEV2ZW50KGV4dGVuc2lvbikpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkT3Blbk5vdGVib29rRG9jdW1lbnQoKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Tm90ZWJvb2sub25EaWRPcGVuTm90ZWJvb2tEb2N1bWVudCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2xvc2VOb3RlYm9va0RvY3VtZW50KCkge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE5vdGVib29rLm9uRGlkQ2xvc2VOb3RlYm9va0RvY3VtZW50KTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3Rlck5vdGVib29rU2VyaWFsaXplcih2aWV3VHlwZTogc3RyaW5nLCBzZXJpYWxpemVyOiB2c2NvZGUuTm90ZWJvb2tTZXJpYWxpemVyLCBvcHRpb25zPzogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50T3B0aW9ucywgcmVnaXN0cmF0aW9uPzogdnNjb2RlLk5vdGVib29rUmVnaXN0cmF0aW9uRGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rLnJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKGV4dGVuc2lvbiwgdmlld1R5cGUsIHNlcmlhbGl6ZXIsIG9wdGlvbnMsIGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25vdGVib29rTGl2ZVNoYXJlJykgPyByZWdpc3RyYXRpb24gOiB1bmRlZmluZWQpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogKGxpc3RlbmVyOiAoXzogYW55KSA9PiBhbnksIHRoaXNBcmdzPzogYW55LCBkaXNwb3NhYmxlcz86IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlW10pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGNvbmZpZ1Byb3ZpZGVyLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbikobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q29uZmlndXJhdGlvbihzZWN0aW9uPzogc3RyaW5nLCBzY29wZT86IHZzY29kZS5Db25maWd1cmF0aW9uU2NvcGUgfCBudWxsKTogdnNjb2RlLldvcmtzcGFjZUNvbmZpZ3VyYXRpb24ge1xuXHRcdFx0XHRzY29wZSA9IGFyZ3VtZW50cy5sZW5ndGggPT09IDEgPyB1bmRlZmluZWQgOiBzY29wZTtcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ1Byb3ZpZGVyLmdldENvbmZpZ3VyYXRpb24oc2VjdGlvbiwgc2NvcGUsIGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXh0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXJzLnJlZ2lzdGVyVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGFza1Byb3ZpZGVyOiAodHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRhc2tQcm92aWRlcikgPT4ge1xuXHRcdFx0XHRleHRIb3N0QXBpRGVwcmVjYXRpb24ucmVwb3J0KCd3aW5kb3cucmVnaXN0ZXJUYXNrUHJvdmlkZXInLCBleHRlbnNpb24sXG5cdFx0XHRcdFx0YFVzZSB0aGUgY29ycmVzcG9uZGluZyBmdW5jdGlvbiBvbiB0aGUgJ3Rhc2tzJyBuYW1lc3BhY2UgaW5zdGVhZGApO1xuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGFzay5yZWdpc3RlclRhc2tQcm92aWRlcihleHRlbnNpb24sIHR5cGUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckZpbGVTeXN0ZW1Qcm92aWRlcihzY2hlbWUsIHByb3ZpZGVyLCBvcHRpb25zKSB7XG5cdFx0XHRcdHJldHVybiBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHRcdFx0ZXh0SG9zdEZpbGVTeXN0ZW0ucmVnaXN0ZXJGaWxlU3lzdGVtUHJvdmlkZXIoZXh0ZW5zaW9uLCBzY2hlbWUsIHByb3ZpZGVyLCBvcHRpb25zKSxcblx0XHRcdFx0XHRleHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLmFkZEZpbGVTeXN0ZW1Qcm92aWRlcihzY2hlbWUsIHByb3ZpZGVyLCBvcHRpb25zKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBmcygpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0udmFsdWU7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJGaWxlU2VhcmNoUHJvdmlkZXI6IChzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5GaWxlU2VhcmNoUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZmlsZVNlYXJjaFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0U2VhcmNoLnJlZ2lzdGVyRmlsZVNlYXJjaFByb3ZpZGVyT2xkKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGV4dFNlYXJjaFByb3ZpZGVyOiAoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGV4dFNlYXJjaFByb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RleHRTZWFyY2hQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFNlYXJjaC5yZWdpc3RlclRleHRTZWFyY2hQcm92aWRlck9sZChzY2hlbWUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckFJVGV4dFNlYXJjaFByb3ZpZGVyOiAoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQUlUZXh0U2VhcmNoUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0Ly8gdGhlcmUgYXJlIHNvbWUgZGVwZW5kZW5jaWVzIG9uIHRleHRTZWFyY2hQcm92aWRlciwgc28gd2UgbmVlZCB0byBjaGVjayBmb3IgYm90aFxuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdhaVRleHRTZWFyY2hQcm92aWRlcicpO1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXh0U2VhcmNoUHJvdmlkZXIyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0U2VhcmNoLnJlZ2lzdGVyQUlUZXh0U2VhcmNoUHJvdmlkZXIoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJGaWxlU2VhcmNoUHJvdmlkZXIyOiAoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRmlsZVNlYXJjaFByb3ZpZGVyMikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdmaWxlU2VhcmNoUHJvdmlkZXIyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0U2VhcmNoLnJlZ2lzdGVyRmlsZVNlYXJjaFByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGV4dFNlYXJjaFByb3ZpZGVyMjogKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRleHRTZWFyY2hQcm92aWRlcjIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGV4dFNlYXJjaFByb3ZpZGVyMicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFNlYXJjaC5yZWdpc3RlclRleHRTZWFyY2hQcm92aWRlcihzY2hlbWUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclJlbW90ZUF1dGhvcml0eVJlc29sdmVyOiAoYXV0aG9yaXR5UHJlZml4OiBzdHJpbmcsIHJlc29sdmVyOiB2c2NvZGUuUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAncmVzb2x2ZXJzJyk7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25TZXJ2aWNlLnJlZ2lzdGVyUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIoYXV0aG9yaXR5UHJlZml4LCByZXNvbHZlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJSZXNvdXJjZUxhYmVsRm9ybWF0dGVyOiAoZm9ybWF0dGVyOiB2c2NvZGUuUmVzb3VyY2VMYWJlbEZvcm1hdHRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdyZXNvbHZlcnMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYWJlbFNlcnZpY2UuJHJlZ2lzdGVyUmVzb3VyY2VMYWJlbEZvcm1hdHRlcihmb3JtYXR0ZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldFJlbW90ZUV4ZWNTZXJ2ZXI6IChhdXRob3JpdHk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdyZXNvbHZlcnMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvblNlcnZpY2UuZ2V0UmVtb3RlRXhlY1NlcnZlcihhdXRob3JpdHkpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ3JlYXRlRmlsZXM6IChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQub25EaWRDcmVhdGVGaWxlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRGVsZXRlRmlsZXM6IChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQub25EaWREZWxldGVGaWxlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVuYW1lRmlsZXM6IChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQub25EaWRSZW5hbWVGaWxlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uV2lsbENyZWF0ZUZpbGVzOiAobGlzdGVuZXI6IChlOiB2c2NvZGUuRmlsZVdpbGxDcmVhdGVFdmVudCkgPT4gYW55LCB0aGlzQXJnPzogdW5rbm93biwgZGlzcG9zYWJsZXM/OiB2c2NvZGUuRGlzcG9zYWJsZVtdKSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RmlsZVN5c3RlbUV2ZW50LmdldE9uV2lsbENyZWF0ZUZpbGVFdmVudChleHRlbnNpb24pKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uV2lsbERlbGV0ZUZpbGVzOiAobGlzdGVuZXI6IChlOiB2c2NvZGUuRmlsZVdpbGxEZWxldGVFdmVudCkgPT4gYW55LCB0aGlzQXJnPzogdW5rbm93biwgZGlzcG9zYWJsZXM/OiB2c2NvZGUuRGlzcG9zYWJsZVtdKSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RmlsZVN5c3RlbUV2ZW50LmdldE9uV2lsbERlbGV0ZUZpbGVFdmVudChleHRlbnNpb24pKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uV2lsbFJlbmFtZUZpbGVzOiAobGlzdGVuZXI6IChlOiB2c2NvZGUuRmlsZVdpbGxSZW5hbWVFdmVudCkgPT4gYW55LCB0aGlzQXJnPzogdW5rbm93biwgZGlzcG9zYWJsZXM/OiB2c2NvZGUuRGlzcG9zYWJsZVtdKSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RmlsZVN5c3RlbUV2ZW50LmdldE9uV2lsbFJlbmFtZUZpbGVFdmVudChleHRlbnNpb24pKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9wZW5UdW5uZWw6IChmb3J3YXJkOiB2c2NvZGUuVHVubmVsT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0dW5uZWxzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VHVubmVsU2VydmljZS5vcGVuVHVubmVsKGV4dGVuc2lvbiwgZm9yd2FyZCkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjYW5ub3Qgb3BlbiB0dW5uZWwnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdHVubmVscygpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndHVubmVscycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR1bm5lbFNlcnZpY2UuZ2V0VHVubmVscygpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVHVubmVsczogKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3R1bm5lbHMnKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUdW5uZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlVHVubmVscykobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclBvcnRBdHRyaWJ1dGVzUHJvdmlkZXI6IChwb3J0U2VsZWN0b3I6IHZzY29kZS5Qb3J0QXR0cmlidXRlc1NlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlBvcnRBdHRyaWJ1dGVzUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAncG9ydHNBdHRyaWJ1dGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VHVubmVsU2VydmljZS5yZWdpc3RlclBvcnRzQXR0cmlidXRlc1Byb3ZpZGVyKHBvcnRTZWxlY3RvciwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVHVubmVsUHJvdmlkZXI6ICh0dW5uZWxQcm92aWRlcjogdnNjb2RlLlR1bm5lbFByb3ZpZGVyLCBpbmZvcm1hdGlvbjogdnNjb2RlLlR1bm5lbEluZm9ybWF0aW9uKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3R1bm5lbEZhY3RvcnknKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUdW5uZWxTZXJ2aWNlLnJlZ2lzdGVyVHVubmVsUHJvdmlkZXIodHVubmVsUHJvdmlkZXIsIGluZm9ybWF0aW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRpbWVsaW5lUHJvdmlkZXI6IChzY2hlbWU6IHN0cmluZyB8IHN0cmluZ1tdLCBwcm92aWRlcjogdnNjb2RlLlRpbWVsaW5lUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGltZWxpbmUnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUaW1lbGluZS5yZWdpc3RlclRpbWVsaW5lUHJvdmlkZXIoc2NoZW1lLCBwcm92aWRlciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dEhvc3RDb21tYW5kcy5jb252ZXJ0ZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpc1RydXN0ZWQoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnRydXN0ZWQ7XG5cdFx0XHR9LFxuXHRcdFx0cmVxdWVzdFJlc291cmNlVHJ1c3Q6IChvcHRpb25zOiB2c2NvZGUuUmVzb3VyY2VUcnVzdFJlcXVlc3RPcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3dvcmtzcGFjZVRydXN0Jyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnJlcXVlc3RSZXNvdXJjZVRydXN0KG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdHJlcXVlc3RXb3Jrc3BhY2VUcnVzdDogKG9wdGlvbnM/OiB2c2NvZGUuV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd3b3Jrc3BhY2VUcnVzdCcpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qob3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0aXNSZXNvdXJjZVRydXN0ZWQ6IChyZXNvdXJjZTogdnNjb2RlLlVyaSkgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd3b3Jrc3BhY2VUcnVzdCcpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5pc1Jlc291cmNlVHJ1c3RlZChyZXNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VXb3Jrc3BhY2VUcnVzdGVkRm9sZGVyczogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd3b3Jrc3BhY2VUcnVzdCcpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFdvcmtzcGFjZS5vbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0ZWRGb2xkZXJzKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZEdyYW50V29ya3NwYWNlVHJ1c3Q6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RXb3Jrc3BhY2Uub25EaWRHcmFudFdvcmtzcGFjZVRydXN0KShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckVkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcjogKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkVkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UucmVnaXN0ZXJFZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXIoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25XaWxsQ3JlYXRlRWRpdFNlc3Npb25JZGVudGl0eTogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RXb3Jrc3BhY2UuZ2V0T25XaWxsQ3JlYXRlRWRpdFNlc3Npb25JZGVudGl0eUV2ZW50KGV4dGVuc2lvbikpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2Fub25pY2FsVXJpUHJvdmlkZXI6IChzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DYW5vbmljYWxVcmlQcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjYW5vbmljYWxVcmlQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5yZWdpc3RlckNhbm9uaWNhbFVyaVByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldENhbm9uaWNhbFVyaTogKHVyaTogdnNjb2RlLlVyaSwgb3B0aW9uczogdnNjb2RlLkNhbm9uaWNhbFVyaVJlcXVlc3RPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Nhbm9uaWNhbFVyaVByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnByb3ZpZGVDYW5vbmljYWxVcmkodXJpLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0ZGVjb2RlKGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdGlvbnM/OiB7IHVyaT86IHZzY29kZS5Vcmk7IGVuY29kaW5nPzogc3RyaW5nIH0pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZGVjb2RlKGNvbnRlbnQsIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGVuY29kZShjb250ZW50OiBzdHJpbmcsIG9wdGlvbnM/OiB7IHVyaT86IHZzY29kZS5Vcmk7IGVuY29kaW5nPzogc3RyaW5nIH0pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZW5jb2RlKGNvbnRlbnQsIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBzY21cblx0XHRjb25zdCBzY206IHR5cGVvZiB2c2NvZGUuc2NtID0ge1xuXHRcdFx0Z2V0IGlucHV0Qm94KCkge1xuXHRcdFx0XHRleHRIb3N0QXBpRGVwcmVjYXRpb24ucmVwb3J0KCdzY20uaW5wdXRCb3gnLCBleHRlbnNpb24sXG5cdFx0XHRcdFx0YFVzZSAnU291cmNlQ29udHJvbC5pbnB1dEJveCcgaW5zdGVhZGApO1xuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0U0NNLmdldExhc3RJbnB1dEJveChleHRlbnNpb24pITsgLy8gU3RyaWN0IG51bGwgb3ZlcnJpZGUgLSBEZXByZWNhdGVkIGFwaVxuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVNvdXJjZUNvbnRyb2woaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgcm9vdFVyaT86IHZzY29kZS5VcmksIGljb25QYXRoPzogdnNjb2RlLkljb25QYXRoLCBpc0hpZGRlbj86IGJvb2xlYW4sIHBhcmVudD86IHZzY29kZS5Tb3VyY2VDb250cm9sKTogdnNjb2RlLlNvdXJjZUNvbnRyb2wge1xuXHRcdFx0XHRpZiAoaWNvblBhdGggfHwgaXNIaWRkZW4gfHwgcGFyZW50KSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnc2NtUHJvdmlkZXJPcHRpb25zJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTQ00uY3JlYXRlU291cmNlQ29udHJvbChleHRlbnNpb24sIGlkLCBsYWJlbCwgcm9vdFVyaSwgaWNvblBhdGgsIGlzSGlkZGVuLCBwYXJlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGNvbW1lbnRzXG5cdFx0Y29uc3QgY29tbWVudHM6IHR5cGVvZiB2c2NvZGUuY29tbWVudHMgPSB7XG5cdFx0XHRjcmVhdGVDb21tZW50Q29udHJvbGxlcihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29tbWVudC5jcmVhdGVDb21tZW50Q29udHJvbGxlcihleHRlbnNpb24sIGlkLCBsYWJlbCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogZGVidWdcblx0XHRjb25zdCBkZWJ1ZzogdHlwZW9mIHZzY29kZS5kZWJ1ZyA9IHtcblx0XHRcdGdldCBhY3RpdmVEZWJ1Z1Nlc3Npb24oKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLmFjdGl2ZURlYnVnU2Vzc2lvbjtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWN0aXZlRGVidWdDb25zb2xlKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5hY3RpdmVEZWJ1Z0NvbnNvbGU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGJyZWFrcG9pbnRzKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5icmVha3BvaW50cztcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWN0aXZlU3RhY2tJdGVtKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5hY3RpdmVTdGFja0l0ZW07XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcihpZCwgcHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZGVidWdWaXN1YWxpemF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnJlZ2lzdGVyRGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBpZCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRGVidWdWaXN1YWxpemF0aW9uVHJlZVByb3ZpZGVyKGlkLCBwcm92aWRlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdkZWJ1Z1Zpc3VhbGl6YXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REZWJ1Z1NlcnZpY2UucmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlKGV4dGVuc2lvbiwgaWQsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFN0YXJ0RGVidWdTZXNzaW9uKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RGVidWdTZXJ2aWNlLm9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRUZXJtaW5hdGVEZWJ1Z1Nlc3Npb24obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REZWJ1Z1NlcnZpY2Uub25EaWRUZXJtaW5hdGVEZWJ1Z1Nlc3Npb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVEZWJ1Z1Nlc3Npb24obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVEZWJ1Z1Nlc3Npb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REZWJ1Z1NlcnZpY2Uub25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VCcmVha3BvaW50cyhsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VCcmVha3BvaW50cykobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW0obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW0pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihkZWJ1Z1R5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciwgdHJpZ2dlcktpbmQ/OiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5yZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGRlYnVnVHlwZSwgcHJvdmlkZXIsIHRyaWdnZXJLaW5kIHx8IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQuSW5pdGlhbCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShkZWJ1Z1R5cGU6IHN0cmluZywgZmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoZXh0ZW5zaW9uLCBkZWJ1Z1R5cGUsIGZhY3RvcnkpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRGVidWdBZGFwdGVyVHJhY2tlckZhY3RvcnkoZGVidWdUeXBlOiBzdHJpbmcsIGZhY3Rvcnk6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJUcmFja2VyRmFjdG9yeSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5yZWdpc3RlckRlYnVnQWRhcHRlclRyYWNrZXJGYWN0b3J5KGRlYnVnVHlwZSwgZmFjdG9yeSk7XG5cdFx0XHR9LFxuXHRcdFx0c3RhcnREZWJ1Z2dpbmcoZm9sZGVyOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCBuYW1lT3JDb25maWc6IHN0cmluZyB8IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24sIHBhcmVudFNlc3Npb25Pck9wdGlvbnM/OiB2c2NvZGUuRGVidWdTZXNzaW9uIHwgdnNjb2RlLkRlYnVnU2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRcdFx0aWYgKCFwYXJlbnRTZXNzaW9uT3JPcHRpb25zIHx8ICh0eXBlb2YgcGFyZW50U2Vzc2lvbk9yT3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgJ2NvbmZpZ3VyYXRpb24nIGluIHBhcmVudFNlc3Npb25Pck9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3REZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcoZm9sZGVyLCBuYW1lT3JDb25maWcsIHsgcGFyZW50U2Vzc2lvbjogcGFyZW50U2Vzc2lvbk9yT3B0aW9ucyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhmb2xkZXIsIG5hbWVPckNvbmZpZywgcGFyZW50U2Vzc2lvbk9yT3B0aW9ucyB8fCB7fSk7XG5cdFx0XHR9LFxuXHRcdFx0c3RvcERlYnVnZ2luZyhzZXNzaW9uPzogdnNjb2RlLkRlYnVnU2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5zdG9wRGVidWdnaW5nKHNlc3Npb24pO1xuXHRcdFx0fSxcblx0XHRcdGFkZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzOiByZWFkb25seSB2c2NvZGUuQnJlYWtwb2ludFtdKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzKTtcblx0XHRcdH0sXG5cdFx0XHRyZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50czogcmVhZG9ubHkgdnNjb2RlLkJyZWFrcG9pbnRbXSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50cyk7XG5cdFx0XHR9LFxuXHRcdFx0YXNEZWJ1Z1NvdXJjZVVyaShzb3VyY2U6IHZzY29kZS5EZWJ1Z1Byb3RvY29sU291cmNlLCBzZXNzaW9uPzogdnNjb2RlLkRlYnVnU2Vzc2lvbik6IHZzY29kZS5Vcmkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5hc0RlYnVnU291cmNlVXJpKHNvdXJjZSwgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRhc2tzOiB0eXBlb2YgdnNjb2RlLnRhc2tzID0ge1xuXHRcdFx0cmVnaXN0ZXJUYXNrUHJvdmlkZXI6ICh0eXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGFza1Byb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGFzay5yZWdpc3RlclRhc2tQcm92aWRlcihleHRlbnNpb24sIHR5cGUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRmZXRjaFRhc2tzOiAoZmlsdGVyPzogdnNjb2RlLlRhc2tGaWx0ZXIpOiBUaGVuYWJsZTx2c2NvZGUuVGFza1tdPiA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGFzay5mZXRjaFRhc2tzKGZpbHRlcik7XG5cdFx0XHR9LFxuXHRcdFx0ZXhlY3V0ZVRhc2s6ICh0YXNrOiB2c2NvZGUuVGFzayk6IFRoZW5hYmxlPHZzY29kZS5UYXNrRXhlY3V0aW9uPiA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGFzay5leGVjdXRlVGFzayhleHRlbnNpb24sIHRhc2spO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0YXNrRXhlY3V0aW9ucygpOiB2c2NvZGUuVGFza0V4ZWN1dGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUYXNrLnRhc2tFeGVjdXRpb25zO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkU3RhcnRUYXNrOiAobGlzdGVuZXI6IChlOiB2c2NvZGUuVGFza1N0YXJ0RXZlbnQpID0+IGFueSwgdGhpc0FyZ3M/OiBhbnksIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjb25zdCB3cmFwcGVkTGlzdGVuZXIgPSAoZXZlbnQ6IHZzY29kZS5UYXNrU3RhcnRFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGFza0V4ZWN1dGlvblRlcm1pbmFsJykpIHtcblx0XHRcdFx0XHRcdGlmIChldmVudD8uZXhlY3V0aW9uPy50ZXJtaW5hbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGV2ZW50LmV4ZWN1dGlvbi50ZXJtaW5hbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZXZlbnRXaXRoRXhlY3V0aW9uID0ge1xuXHRcdFx0XHRcdFx0Li4uZXZlbnQsXG5cdFx0XHRcdFx0XHRleGVjdXRpb246IGV2ZW50LmV4ZWN1dGlvblxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGV2ZW50V2l0aEV4ZWN1dGlvbik7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGFzay5vbkRpZFN0YXJ0VGFzaykod3JhcHBlZExpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRW5kVGFzazogKGxpc3RlbmVycywgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUYXNrLm9uRGlkRW5kVGFzaykobGlzdGVuZXJzLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkU3RhcnRUYXNrUHJvY2VzczogKGxpc3RlbmVycywgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUYXNrLm9uRGlkU3RhcnRUYXNrUHJvY2VzcykobGlzdGVuZXJzLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRW5kVGFza1Byb2Nlc3M6IChsaXN0ZW5lcnMsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGFzay5vbkRpZEVuZFRhc2tQcm9jZXNzKShsaXN0ZW5lcnMsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnM6IChsaXN0ZW5lcnMsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rhc2tQcm9ibGVtTWF0Y2hlclN0YXR1cycpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRhc2sub25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnMpKGxpc3RlbmVycywgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnM6IChsaXN0ZW5lcnMsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rhc2tQcm9ibGVtTWF0Y2hlclN0YXR1cycpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRhc2sub25EaWRFbmRUYXNrUHJvYmxlbU1hdGNoZXJzKShsaXN0ZW5lcnMsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogbm90ZWJvb2tcblx0XHRjb25zdCBub3RlYm9va3M6IHR5cGVvZiB2c2NvZGUubm90ZWJvb2tzID0ge1xuXHRcdFx0Y3JlYXRlTm90ZWJvb2tDb250cm9sbGVyKGlkOiBzdHJpbmcsIG5vdGVib29rVHlwZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBoYW5kbGVyPywgcmVuZGVyZXJTY3JpcHRzPzogdnNjb2RlLk5vdGVib29rUmVuZGVyZXJTY3JpcHRbXSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rS2VybmVscy5jcmVhdGVOb3RlYm9va0NvbnRyb2xsZXIoZXh0ZW5zaW9uLCBpZCwgbm90ZWJvb2tUeXBlLCBsYWJlbCwgaGFuZGxlciwgaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tNZXNzYWdpbmcnKSA/IHJlbmRlcmVyU2NyaXB0cyA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXI6IChub3RlYm9va1R5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5Ob3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9vay5yZWdpc3Rlck5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcihleHRlbnNpb24sIG5vdGVib29rVHlwZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVJlbmRlcmVyTWVzc2FnaW5nKHJlbmRlcmVySWQpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9va1JlbmRlcmVycy5jcmVhdGVSZW5kZXJlck1lc3NhZ2luZyhleHRlbnNpb24sIHJlbmRlcmVySWQpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZU5vdGVib29rQ29udHJvbGxlckRldGVjdGlvblRhc2sobm90ZWJvb2tUeXBlOiBzdHJpbmcpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tLZXJuZWxTb3VyY2UnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9va0tlcm5lbHMuY3JlYXRlTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFzayhleHRlbnNpb24sIG5vdGVib29rVHlwZSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcihub3RlYm9va1R5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5Ob3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25vdGVib29rS2VybmVsU291cmNlJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Tm90ZWJvb2tLZXJuZWxzLnJlZ2lzdGVyS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBub3RlYm9va1R5cGUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogbDEwblxuXHRcdGNvbnN0IGwxMG46IHR5cGVvZiB2c2NvZGUubDEwbiA9IHtcblx0XHRcdHQoLi4ucGFyYW1zOiBbbWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiBBcnJheTxzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPl0gfCBbbWVzc2FnZTogc3RyaW5nLCBhcmdzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+XSB8IFt7IG1lc3NhZ2U6IHN0cmluZzsgYXJncz86IEFycmF5PHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4+IHwgUmVjb3JkPHN0cmluZywgYW55PjsgY29tbWVudDogc3RyaW5nIHwgc3RyaW5nW10gfV0pOiBzdHJpbmcge1xuXHRcdFx0XHRpZiAodHlwZW9mIHBhcmFtc1swXSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb25zdCBrZXkgPSBwYXJhbXMuc2hpZnQoKSBhcyBzdHJpbmc7XG5cblx0XHRcdFx0XHQvLyBXZSBoYXZlIGVpdGhlciByZXN0IGFyZ3Mgd2hpY2ggYXJlIEFycmF5PHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4+IG9yIGFuIGFycmF5IHdpdGggYSBzaW5nbGUgUmVjb3JkPHN0cmluZywgYW55Pi5cblx0XHRcdFx0XHQvLyBUaGlzIGVuc3VyZXMgd2UgZ2V0IGEgUmVjb3JkPHN0cmluZyB8IG51bWJlciwgYW55PiB3aGljaCB3aWxsIGJlIGZvcm1hdHRlZCBjb3JyZWN0bHkuXG5cdFx0XHRcdFx0Y29uc3QgYXJnc0Zvcm1hdHRlZCA9ICFwYXJhbXMgfHwgdHlwZW9mIHBhcmFtc1swXSAhPT0gJ29iamVjdCcgPyBwYXJhbXMgOiBwYXJhbXNbMF07XG5cdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMb2NhbGl6YXRpb24uZ2V0TWVzc2FnZShleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgeyBtZXNzYWdlOiBrZXksIGFyZ3M6IGFyZ3NGb3JtYXR0ZWQgYXMgUmVjb3JkPHN0cmluZyB8IG51bWJlciwgYW55PiB8IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0TG9jYWxpemF0aW9uLmdldE1lc3NhZ2UoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIHBhcmFtc1swXSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGJ1bmRsZSgpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMb2NhbGl6YXRpb24uZ2V0QnVuZGxlKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdXJpKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExvY2FsaXphdGlvbi5nZXRCdW5kbGVVcmkoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGludGVyYWN0aXZlXG5cdFx0Y29uc3QgaW50ZXJhY3RpdmU6IHR5cGVvZiB2c2NvZGUuaW50ZXJhY3RpdmUgPSB7XG5cdFx0XHR0cmFuc2ZlckFjdGl2ZUNoYXQodG9Xb3Jrc3BhY2U6IHZzY29kZS5VcmkpOiBUaGVuYWJsZTx2b2lkPiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2ludGVyYWN0aXZlJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIudHJhbnNmZXJBY3RpdmVDaGF0KHRvV29ya3NwYWNlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBhaVxuXHRcdGNvbnN0IGFpOiB0eXBlb2YgdnNjb2RlLmFpID0ge1xuXHRcdFx0Z2V0UmVsYXRlZEluZm9ybWF0aW9uKHF1ZXJ5OiBzdHJpbmcsIHR5cGVzOiB2c2NvZGUuUmVsYXRlZEluZm9ybWF0aW9uVHlwZVtdKTogVGhlbmFibGU8dnNjb2RlLlJlbGF0ZWRJbmZvcm1hdGlvblJlc3VsdFtdPiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2FpUmVsYXRlZEluZm9ybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QWlSZWxhdGVkSW5mb3JtYXRpb24uZ2V0UmVsYXRlZEluZm9ybWF0aW9uKGV4dGVuc2lvbiwgcXVlcnksIHR5cGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclJlbGF0ZWRJbmZvcm1hdGlvblByb3ZpZGVyKHR5cGU6IHZzY29kZS5SZWxhdGVkSW5mb3JtYXRpb25UeXBlLCBwcm92aWRlcjogdnNjb2RlLlJlbGF0ZWRJbmZvcm1hdGlvblByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2FpUmVsYXRlZEluZm9ybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QWlSZWxhdGVkSW5mb3JtYXRpb24ucmVnaXN0ZXJSZWxhdGVkSW5mb3JtYXRpb25Qcm92aWRlcihleHRlbnNpb24sIHR5cGUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckVtYmVkZGluZ1ZlY3RvclByb3ZpZGVyKG1vZGVsOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRW1iZWRkaW5nVmVjdG9yUHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYWlSZWxhdGVkSW5mb3JtYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBaUVtYmVkZGluZ1ZlY3Rvci5yZWdpc3RlckVtYmVkZGluZ1ZlY3RvclByb3ZpZGVyKGV4dGVuc2lvbiwgbW9kZWwsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclNldHRpbmdzU2VhcmNoUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5TZXR0aW5nc1NlYXJjaFByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2FpU2V0dGluZ3NTZWFyY2gnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBaVNldHRpbmdzU2VhcmNoLnJlZ2lzdGVyU2V0dGluZ3NTZWFyY2hQcm92aWRlcihleHRlbnNpb24sIHByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBjaGF0cmVnaXN0ZXJNY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJcblx0XHRjb25zdCBjaGF0OiB0eXBlb2YgdnNjb2RlLmNoYXQgPSB7XG5cdFx0XHRyZWdpc3Rlck1hcHBlZEVkaXRzUHJvdmlkZXIoX3NlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgX3Byb3ZpZGVyOiB2c2NvZGUuTWFwcGVkRWRpdHNQcm92aWRlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdtYXBwZWRFZGl0c1Byb3ZpZGVyJyk7XG5cdFx0XHRcdC8vIG5vIGxvbmdlciBzdXBwb3J0ZWRcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9O1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTWFwcGVkRWRpdHNQcm92aWRlcjIocHJvdmlkZXI6IHZzY29kZS5NYXBwZWRFZGl0c1Byb3ZpZGVyMikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdtYXBwZWRFZGl0c1Byb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29kZU1hcHBlci5yZWdpc3Rlck1hcHBlZEVkaXRzUHJvdmlkZXIoZXh0ZW5zaW9uLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlQ2hhdFBhcnRpY2lwYW50KGlkOiBzdHJpbmcsIGhhbmRsZXI6IHZzY29kZS5DaGF0RXh0ZW5kZWRSZXF1ZXN0SGFuZGxlcikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLmNyZWF0ZUNoYXRBZ2VudChleHRlbnNpb24sIGlkLCBoYW5kbGVyKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVEeW5hbWljQ2hhdFBhcnRpY2lwYW50KGlkOiBzdHJpbmcsIGR5bmFtaWNQcm9wczogdnNjb2RlLkR5bmFtaWNDaGF0UGFydGljaXBhbnRQcm9wcywgaGFuZGxlcjogdnNjb2RlLkNoYXRFeHRlbmRlZFJlcXVlc3RIYW5kbGVyKTogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudCB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5jcmVhdGVEeW5hbWljQ2hhdEFnZW50KGV4dGVuc2lvbiwgaWQsIGR5bmFtaWNQcm9wcywgaGFuZGxlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5yZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRGlzcG9zZUNoYXRTZXNzaW9uOiAobGlzdGVuZXJzLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Q2hhdEFnZW50czIub25EaWREaXNwb3NlQ2hhdFNlc3Npb24pKGxpc3RlbmVycywgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGVRdW90YXM6IChxdW90YXM6IHZzY29kZS5DaGF0UXVvdGFTbmFwc2hvdHMpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRleHRIb3N0Q2hhdFF1b3RhLnVwZGF0ZVF1b3RhcyhxdW90YXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXI6IChjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0U2Vzc2lvbnNQcm92aWRlcicpO1xuXHRcdFx0XHRleHRIb3N0QXBpRGVwcmVjYXRpb24ucmVwb3J0KCdjaGF0LnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXInLCBleHRlbnNpb24sIGBQbGVhc2UgbWlncmF0ZSB0byB0aGUgbmV3IGNoYXQgc2Vzc2lvbiBjb250cm9sbGVyIEFQSWAsIHtcblx0XHRcdFx0XHR1c2FnZUlkOiBjaGF0U2Vzc2lvblR5cGVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdFNlc3Npb25zLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGF0U2Vzc2lvblR5cGUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyOiAoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIHJlZnJlc2hIYW5kbGVyOiAodG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4gVGhlbmFibGU8dm9pZD4pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFNlc3Npb25zUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0U2Vzc2lvbnMuY3JlYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihleHRlbnNpb24sIGNoYXRTZXNzaW9uVHlwZSwgcmVmcmVzaEhhbmRsZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIsIGNoYXRQYXJ0aWNpcGFudDogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudCwgY2FwYWJpbGl0aWVzPzogdnNjb2RlLkNoYXRTZXNzaW9uQ2FwYWJpbGl0aWVzKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdFNlc3Npb25zLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoZXh0ZW5zaW9uLCBzY2hlbWUsIGNoYXRQYXJ0aWNpcGFudCwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDaGF0T3V0cHV0UmVuZGVyZXI6ICh2aWV3VHlwZTogc3RyaW5nLCByZW5kZXJlcjogdnNjb2RlLkNoYXRPdXRwdXRSZW5kZXJlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0T3V0cHV0UmVuZGVyZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIucmVnaXN0ZXJDaGF0T3V0cHV0UmVuZGVyZXIoZXh0ZW5zaW9uLCB2aWV3VHlwZSwgcmVuZGVyZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdFdvcmtzcGFjZUNvbnRleHRQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkNoYXRXb3Jrc3BhY2VDb250ZXh0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRDb250ZXh0UHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0Q29udGV4dC5yZWdpc3RlckNoYXRXb3Jrc3BhY2VDb250ZXh0UHJvdmlkZXIoYCR7ZXh0ZW5zaW9uLmlkfS0ke2lkfWAsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRBdHRhY2hDb250ZXh0UHJvdmlkZXIoaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DaGF0QXR0YWNoQ29udGV4dFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0Q29udGV4dFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdENvbnRleHQucmVnaXN0ZXJDaGF0QXR0YWNoQ29udGV4dFByb3ZpZGVyKGAke2V4dGVuc2lvbi5pZH0tJHtpZH1gLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDaGF0VGFiQ29udGV4dFByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuVGFiU2VsZWN0b3IsIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFRhYkNvbnRleHRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdENvbnRleHRQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRDb250ZXh0LnJlZ2lzdGVyQ2hhdFRhYkNvbnRleHRQcm92aWRlcihzZWxlY3RvciwgYCR7ZXh0ZW5zaW9uLmlkfS0ke2lkfWAsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRFeHBsaWNpdENvbnRleHRQcm92aWRlcihfaWQ6IHN0cmluZywgX3Byb3ZpZGVyOiB2c2NvZGUuQ2hhdEF0dGFjaENvbnRleHRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdENvbnRleHRQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRSZXNvdXJjZUNvbnRleHRQcm92aWRlcihfc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBfaWQ6IHN0cmluZywgX3Byb3ZpZGVyOiB2c2NvZGUuQ2hhdFRhYkNvbnRleHRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdENvbnRleHRQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckN1c3RvbUFnZW50UHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DaGF0Q3VzdG9tQWdlbnRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5hZ2VudCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVySW5zdHJ1Y3Rpb25zUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb25zUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DaGF0UHJvbXB0RmlsZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnByb21wdCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyU2tpbGxQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXRTa2lsbFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnNraWxsLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJIb29rUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DaGF0SG9va1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmhvb2ssIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuQ2hhdERlYnVnTG9nUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXREZWJ1ZycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXREZWJ1Zy5yZWdpc3RlckNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlY2VpdmVDaGF0RGVidWdFdmVudDogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0RGVidWcnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0RGVidWcub25EaWRBZGRDb3JlRXZlbnQobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q3VzdG9tQWdlbnRzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucHJvdmlkZUN1c3RvbUFnZW50cyh0b2tlbikgYXMgVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRDdXN0b21BZ2VudFtdPjtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50czogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5vbkRpZENoYW5nZUN1c3RvbUFnZW50cyhsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRJbnN0cnVjdGlvbnModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5wcm92aWRlSW5zdHJ1Y3Rpb25zKHRva2VuKSBhcyBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdEluc3RydWN0aW9uW10+O1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zOiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLm9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdGdldFNraWxscyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnByb3ZpZGVTa2lsbHModG9rZW4pIGFzIFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0U2tpbGxbXT47XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VTa2lsbHM6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIub25EaWRDaGFuZ2VTa2lsbHMobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0U2xhc2hDb21tYW5kcyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnByb3ZpZGVTbGFzaENvbW1hbmRzKHRva2VuKSBhcyBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdFNsYXNoQ29tbWFuZFtdPjtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHM6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdGdldEhvb2tzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucHJvdmlkZUhvb2tzKHRva2VuKSBhcyBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdEhvb2tbXT47XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VIb29rczogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5vbkRpZENoYW5nZUhvb2tzKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdGdldFBsdWdpbnModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5wcm92aWRlUGx1Z2lucyh0b2tlbikgYXMgVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRQbHVnaW5bXT47XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VQbHVnaW5zOiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLm9uRGlkQ2hhbmdlUGx1Z2lucyhsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogdnNjb2RlLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyTWV0YWRhdGEsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucmVnaXN0ZXJDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcihleHRlbnNpb24sIGNoYXRTZXNzaW9uVHlwZSwgbWV0YWRhdGEsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVJbnB1dE5vdGlmaWNhdGlvbihpZDogc3RyaW5nKTogdnNjb2RlLkNoYXRJbnB1dE5vdGlmaWNhdGlvbiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRJbnB1dE5vdGlmaWNhdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRJbnB1dE5vdGlmaWNhdGlvbi5jcmVhdGVJbnB1dE5vdGlmaWNhdGlvbihleHRlbnNpb24sIGlkKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogbG1cblx0XHRjb25zdCBsbTogdHlwZW9mIHZzY29kZS5sbSA9IHtcblx0XHRcdHNlbGVjdENoYXRNb2RlbHM6IChzZWxlY3RvcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLnNlbGVjdExhbmd1YWdlTW9kZWxzKGV4dGVuc2lvbiwgc2VsZWN0b3IgPz8ge30pO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQ2hhdE1vZGVsczogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLm9uRGlkQ2hhbmdlUHJvdmlkZXJzKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcjogKHZlbmRvciwgcHJvdmlkZXIpID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVscy5yZWdpc3Rlckxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIoZXh0ZW5zaW9uLCB2ZW5kb3IsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaXNNb2RlbFByb3h5QXZhaWxhYmxlKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdsYW5ndWFnZU1vZGVsUHJveHknKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVscy5pc01vZGVsUHJveHlBdmFpbGFibGU7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5OiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlTW9kZWxQcm94eScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLm9uRGlkQ2hhbmdlTW9kZWxQcm94eUF2YWlsYWJpbGl0eShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRNb2RlbFByb3h5OiAoKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlTW9kZWxQcm94eScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLmdldE1vZGVsUHJveHkoZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyOiAocHJvdmlkZXIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIoZXh0ZW5zaW9uLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIGVtYmVkZGluZ3Ncblx0XHRcdGdldCBlbWJlZGRpbmdNb2RlbHMoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2VtYmVkZGluZ3MnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFbWJlZGRpbmdzLmVtYmVkZGluZ3NNb2RlbHM7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VFbWJlZGRpbmdNb2RlbHM6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZW1iZWRkaW5ncycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVtYmVkZGluZ3Mub25EaWRDaGFuZ2UobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJFbWJlZGRpbmdzUHJvdmlkZXIoZW1iZWRkaW5nc01vZGVsLCBwcm92aWRlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlbWJlZGRpbmdzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RW1iZWRkaW5ncy5yZWdpc3RlckVtYmVkZGluZ3NQcm92aWRlcihleHRlbnNpb24sIGVtYmVkZGluZ3NNb2RlbCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGNvbXB1dGVFbWJlZGRpbmdzKGVtYmVkZGluZ3NNb2RlbCwgaW5wdXQsIHRva2VuPyk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2VtYmVkZGluZ3MnKTtcblx0XHRcdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVtYmVkZGluZ3MuY29tcHV0ZUVtYmVkZGluZ3MoZW1iZWRkaW5nc01vZGVsLCBpbnB1dCwgdG9rZW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBleHRIb3N0RW1iZWRkaW5ncy5jb21wdXRlRW1iZWRkaW5ncyhlbWJlZGRpbmdzTW9kZWwsIGlucHV0LCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRvb2w8VD4obmFtZTogc3RyaW5nLCB0b29sOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2w8VD4pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMucmVnaXN0ZXJUb29sKGV4dGVuc2lvbiwgbmFtZSwgdG9vbCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUb29sRGVmaW5pdGlvbjxUPihkZWZpbml0aW9uOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xEZWZpbml0aW9uLCB0b29sOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2w8VD4pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMucmVnaXN0ZXJUb29sRGVmaW5pdGlvbihleHRlbnNpb24sIGRlZmluaXRpb24sIHRvb2wpO1xuXHRcdFx0fSxcblx0XHRcdGludm9rZVRvb2w8VD4obmFtZU9ySW5mbzogc3RyaW5nIHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW5mb3JtYXRpb24sIHBhcmFtZXRlcnM6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEludm9jYXRpb25PcHRpb25zPFQ+LCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRpZiAodHlwZW9mIG5hbWVPckluZm8gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMuaW52b2tlVG9vbChleHRlbnNpb24sIG5hbWVPckluZm8sIHBhcmFtZXRlcnMsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdG9vbHMoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzLmdldFRvb2xzKGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0ZmlsZUlzSWdub3JlZCh1cmk6IHZzY29kZS5VcmksIHRva2VuPzogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMuZmlsZUlzSWdub3JlZChleHRlbnNpb24sIHVyaSwgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVySWdub3JlZEZpbGVQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZVByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMucmVnaXN0ZXJJZ25vcmVkRmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVyKGlkLCBwcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE1jcC5yZWdpc3Rlck1jcENvbmZpZ3VyYXRpb25Qcm92aWRlcihleHRlbnNpb24sIGlkLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9uczogKC4uLmFyZ3MpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbWNwU2VydmVyRGVmaW5pdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RNY3Aub25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9ucykoLi4uYXJncyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG1jcFNlcnZlckRlZmluaXRpb25zKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdtY3BTZXJ2ZXJEZWZpbml0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE1jcC5tY3BTZXJ2ZXJEZWZpbml0aW9ucztcblx0XHRcdH0sXG5cdFx0XHRzdGFydE1jcEdhdGV3YXkoY2hhdFNlc3Npb25SZXNvdXJjZT86IFVSSSkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdtY3BTZXJ2ZXJEZWZpbml0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE1jcC5zdGFydE1jcEdhdGV3YXkoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VDaGF0UmVxdWVzdFRvb2xzKC4uLmFyZ3MpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Q2hhdEFnZW50czIub25EaWRDaGFuZ2VDaGF0UmVxdWVzdFRvb2xzKSguLi5hcmdzKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBzcGVlY2hcblx0XHRjb25zdCBzcGVlY2g6IHR5cGVvZiB2c2NvZGUuc3BlZWNoID0ge1xuXHRcdFx0cmVnaXN0ZXJTcGVlY2hQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlNwZWVjaFByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3NwZWVjaCcpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFNwZWVjaC5yZWdpc3RlclByb3ZpZGVyKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCwgcHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0cmV0dXJuIDx0eXBlb2YgdnNjb2RlPntcblx0XHRcdHZlcnNpb246IGluaXREYXRhLnZlcnNpb24sXG5cdFx0XHQvLyBuYW1lc3BhY2VzXG5cdFx0XHRhaSxcblx0XHRcdGF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0Y29tbWFuZHMsXG5cdFx0XHRjb21tZW50cyxcblx0XHRcdGNoYXQsXG5cdFx0XHRkZWJ1Zyxcblx0XHRcdGVudixcblx0XHRcdGV4dGVuc2lvbnMsXG5cdFx0XHRpbnRlcmFjdGl2ZSxcblx0XHRcdGwxMG4sXG5cdFx0XHRsYW5ndWFnZXMsXG5cdFx0XHRsbSxcblx0XHRcdG5vdGVib29rcyxcblx0XHRcdHNjbSxcblx0XHRcdHNwZWVjaCxcblx0XHRcdHRhc2tzLFxuXHRcdFx0dGVzdHMsXG5cdFx0XHR3aW5kb3csXG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHQvLyB0eXBlc1xuXHRcdFx0QnJlYWtwb2ludDogZXh0SG9zdFR5cGVzLkJyZWFrcG9pbnQsXG5cdFx0XHRUZXJtaW5hbE91dHB1dEFuY2hvcjogZXh0SG9zdFR5cGVzLlRlcm1pbmFsT3V0cHV0QW5jaG9yLFxuXHRcdFx0Q2hhdFJlc3VsdEZlZWRiYWNrS2luZDogZXh0SG9zdFR5cGVzLkNoYXRSZXN1bHRGZWVkYmFja0tpbmQsXG5cdFx0XHRDaGF0VmFyaWFibGVMZXZlbDogZXh0SG9zdFR5cGVzLkNoYXRWYXJpYWJsZUxldmVsLFxuXHRcdFx0Q2hhdENvbXBsZXRpb25JdGVtOiBleHRIb3N0VHlwZXMuQ2hhdENvbXBsZXRpb25JdGVtLFxuXHRcdFx0Q2hhdFJlZmVyZW5jZURpYWdub3N0aWM6IGV4dEhvc3RUeXBlcy5DaGF0UmVmZXJlbmNlRGlhZ25vc3RpYyxcblx0XHRcdENhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGw6IGV4dEhvc3RUeXBlcy5DYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsLFxuXHRcdFx0Q2FsbEhpZXJhcmNoeUl0ZW06IGV4dEhvc3RUeXBlcy5DYWxsSGllcmFyY2h5SXRlbSxcblx0XHRcdENhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGw6IGV4dEhvc3RUeXBlcy5DYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsLFxuXHRcdFx0Q2FuY2VsbGF0aW9uRXJyb3I6IGVycm9ycy5DYW5jZWxsYXRpb25FcnJvcixcblx0XHRcdENhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0XHRcdENhbmRpZGF0ZVBvcnRTb3VyY2U6IENhbmRpZGF0ZVBvcnRTb3VyY2UsXG5cdFx0XHRDb2RlQWN0aW9uOiBleHRIb3N0VHlwZXMuQ29kZUFjdGlvbixcblx0XHRcdENvZGVBY3Rpb25LaW5kOiBleHRIb3N0VHlwZXMuQ29kZUFjdGlvbktpbmQsXG5cdFx0XHRDb2RlQWN0aW9uVHJpZ2dlcktpbmQ6IGV4dEhvc3RUeXBlcy5Db2RlQWN0aW9uVHJpZ2dlcktpbmQsXG5cdFx0XHRDb2RlTGVuczogZXh0SG9zdFR5cGVzLkNvZGVMZW5zLFxuXHRcdFx0Q29sb3I6IGV4dEhvc3RUeXBlcy5Db2xvcixcblx0XHRcdENvbG9ySW5mb3JtYXRpb246IGV4dEhvc3RUeXBlcy5Db2xvckluZm9ybWF0aW9uLFxuXHRcdFx0Q29sb3JQcmVzZW50YXRpb246IGV4dEhvc3RUeXBlcy5Db2xvclByZXNlbnRhdGlvbixcblx0XHRcdENvbG9yVGhlbWVLaW5kOiBleHRIb3N0VHlwZXMuQ29sb3JUaGVtZUtpbmQsXG5cdFx0XHRDb21tZW50TW9kZTogZXh0SG9zdFR5cGVzLkNvbW1lbnRNb2RlLFxuXHRcdFx0Q29tbWVudFN0YXRlOiBleHRIb3N0VHlwZXMuQ29tbWVudFN0YXRlLFxuXHRcdFx0Q29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGU6IGV4dEhvc3RUeXBlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSxcblx0XHRcdENvbW1lbnRUaHJlYWRTdGF0ZTogZXh0SG9zdFR5cGVzLkNvbW1lbnRUaHJlYWRTdGF0ZSxcblx0XHRcdENvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5OiBleHRIb3N0VHlwZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHksXG5cdFx0XHRDb21tZW50VGhyZWFkRm9jdXM6IGV4dEhvc3RUeXBlcy5Db21tZW50VGhyZWFkRm9jdXMsXG5cdFx0XHRDb21wbGV0aW9uSXRlbTogZXh0SG9zdFR5cGVzLkNvbXBsZXRpb25JdGVtLFxuXHRcdFx0Q29tcGxldGlvbkl0ZW1LaW5kOiBleHRIb3N0VHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLFxuXHRcdFx0Q29tcGxldGlvbkl0ZW1UYWc6IGV4dEhvc3RUeXBlcy5Db21wbGV0aW9uSXRlbVRhZyxcblx0XHRcdENvbXBsZXRpb25MaXN0OiBleHRIb3N0VHlwZXMuQ29tcGxldGlvbkxpc3QsXG5cdFx0XHRDb21wbGV0aW9uVHJpZ2dlcktpbmQ6IGV4dEhvc3RUeXBlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQsXG5cdFx0XHRDb25maWd1cmF0aW9uVGFyZ2V0OiBleHRIb3N0VHlwZXMuQ29uZmlndXJhdGlvblRhcmdldCxcblx0XHRcdEN1c3RvbUV4ZWN1dGlvbjogZXh0SG9zdFR5cGVzLkN1c3RvbUV4ZWN1dGlvbixcblx0XHRcdERlYnVnQWRhcHRlckV4ZWN1dGFibGU6IGV4dEhvc3RUeXBlcy5EZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlLFxuXHRcdFx0RGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb246IGV4dEhvc3RUeXBlcy5EZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbixcblx0XHRcdERlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlcjogZXh0SG9zdFR5cGVzLkRlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlcixcblx0XHRcdERlYnVnQWRhcHRlclNlcnZlcjogZXh0SG9zdFR5cGVzLkRlYnVnQWRhcHRlclNlcnZlcixcblx0XHRcdERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQ6IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQsXG5cdFx0XHREZWJ1Z0NvbnNvbGVNb2RlOiBleHRIb3N0VHlwZXMuRGVidWdDb25zb2xlTW9kZSxcblx0XHRcdERlYnVnVmlzdWFsaXphdGlvbjogZXh0SG9zdFR5cGVzLkRlYnVnVmlzdWFsaXphdGlvbixcblx0XHRcdERlY29yYXRpb25SYW5nZUJlaGF2aW9yOiBleHRIb3N0VHlwZXMuRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IsXG5cdFx0XHREaWFnbm9zdGljOiBleHRIb3N0VHlwZXMuRGlhZ25vc3RpYyxcblx0XHRcdERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb246IGV4dEhvc3RUeXBlcy5EaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uLFxuXHRcdFx0RGlhZ25vc3RpY1NldmVyaXR5OiBleHRIb3N0VHlwZXMuRGlhZ25vc3RpY1NldmVyaXR5LFxuXHRcdFx0RGlhZ25vc3RpY1RhZzogZXh0SG9zdFR5cGVzLkRpYWdub3N0aWNUYWcsXG5cdFx0XHREaXNwb3NhYmxlOiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZSxcblx0XHRcdERvY3VtZW50SGlnaGxpZ2h0OiBleHRIb3N0VHlwZXMuRG9jdW1lbnRIaWdobGlnaHQsXG5cdFx0XHREb2N1bWVudEhpZ2hsaWdodEtpbmQ6IGV4dEhvc3RUeXBlcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQsXG5cdFx0XHRNdWx0aURvY3VtZW50SGlnaGxpZ2h0OiBleHRIb3N0VHlwZXMuTXVsdGlEb2N1bWVudEhpZ2hsaWdodCxcblx0XHRcdERvY3VtZW50TGluazogZXh0SG9zdFR5cGVzLkRvY3VtZW50TGluayxcblx0XHRcdERvY3VtZW50U3ltYm9sOiBleHRIb3N0VHlwZXMuRG9jdW1lbnRTeW1ib2wsXG5cdFx0XHRFbmRPZkxpbmU6IGV4dEhvc3RUeXBlcy5FbmRPZkxpbmUsXG5cdFx0XHRFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGU6IGV4dEhvc3RUeXBlcy5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUsXG5cdFx0XHRFdmFsdWF0YWJsZUV4cHJlc3Npb246IGV4dEhvc3RUeXBlcy5FdmFsdWF0YWJsZUV4cHJlc3Npb24sXG5cdFx0XHRJbmxpbmVWYWx1ZVRleHQ6IGV4dEhvc3RUeXBlcy5JbmxpbmVWYWx1ZVRleHQsXG5cdFx0XHRJbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwOiBleHRIb3N0VHlwZXMuSW5saW5lVmFsdWVWYXJpYWJsZUxvb2t1cCxcblx0XHRcdElubGluZVZhbHVlRXZhbHVhdGFibGVFeHByZXNzaW9uOiBleHRIb3N0VHlwZXMuSW5saW5lVmFsdWVFdmFsdWF0YWJsZUV4cHJlc3Npb24sXG5cdFx0XHRJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQ6IGV4dEhvc3RUeXBlcy5JbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsXG5cdFx0XHRJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kOiBleHRIb3N0VHlwZXMuSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZCxcblx0XHRcdEV2ZW50RW1pdHRlcjogRW1pdHRlcixcblx0XHRcdEV4dGVuc2lvbktpbmQ6IGV4dEhvc3RUeXBlcy5FeHRlbnNpb25LaW5kLFxuXHRcdFx0RXh0ZW5zaW9uTW9kZTogZXh0SG9zdFR5cGVzLkV4dGVuc2lvbk1vZGUsXG5cdFx0XHRFeHRlcm5hbFVyaU9wZW5lclByaW9yaXR5OiBleHRIb3N0VHlwZXMuRXh0ZXJuYWxVcmlPcGVuZXJQcmlvcml0eSxcblx0XHRcdEZpbGVDaGFuZ2VUeXBlOiBleHRIb3N0VHlwZXMuRmlsZUNoYW5nZVR5cGUsXG5cdFx0XHRGaWxlRGVjb3JhdGlvbjogZXh0SG9zdFR5cGVzLkZpbGVEZWNvcmF0aW9uLFxuXHRcdFx0RmlsZURlY29yYXRpb24yOiBleHRIb3N0VHlwZXMuRmlsZURlY29yYXRpb24sXG5cdFx0XHRGaWxlU3lzdGVtRXJyb3I6IGV4dEhvc3RUeXBlcy5GaWxlU3lzdGVtRXJyb3IsXG5cdFx0XHRGaWxlVHlwZTogZmlsZXMuRmlsZVR5cGUsXG5cdFx0XHRGaWxlUGVybWlzc2lvbjogZmlsZXMuRmlsZVBlcm1pc3Npb24sXG5cdFx0XHRGb2xkaW5nUmFuZ2U6IGV4dEhvc3RUeXBlcy5Gb2xkaW5nUmFuZ2UsXG5cdFx0XHRGb2xkaW5nUmFuZ2VLaW5kOiBleHRIb3N0VHlwZXMuRm9sZGluZ1JhbmdlS2luZCxcblx0XHRcdEZ1bmN0aW9uQnJlYWtwb2ludDogZXh0SG9zdFR5cGVzLkZ1bmN0aW9uQnJlYWtwb2ludCxcblx0XHRcdElubGluZUNvbXBsZXRpb25JdGVtOiBleHRIb3N0VHlwZXMuSW5saW5lU3VnZ2VzdGlvbixcblx0XHRcdElubGluZUNvbXBsZXRpb25MaXN0OiBleHRIb3N0VHlwZXMuSW5saW5lU3VnZ2VzdGlvbkxpc3QsXG5cdFx0XHRIb3ZlcjogZXh0SG9zdFR5cGVzLkhvdmVyLFxuXHRcdFx0VmVyYm9zZUhvdmVyOiBleHRIb3N0VHlwZXMuVmVyYm9zZUhvdmVyLFxuXHRcdFx0SG92ZXJWZXJib3NpdHlBY3Rpb246IGV4dEhvc3RUeXBlcy5Ib3ZlclZlcmJvc2l0eUFjdGlvbixcblx0XHRcdEluZGVudEFjdGlvbjogbGFuZ3VhZ2VDb25maWd1cmF0aW9uLkluZGVudEFjdGlvbixcblx0XHRcdExvY2F0aW9uOiBleHRIb3N0VHlwZXMuTG9jYXRpb24sXG5cdFx0XHRNYXJrZG93blN0cmluZzogZXh0SG9zdFR5cGVzLk1hcmtkb3duU3RyaW5nLFxuXHRcdFx0T3ZlcnZpZXdSdWxlckxhbmU6IE92ZXJ2aWV3UnVsZXJMYW5lLFxuXHRcdFx0UGFyYW1ldGVySW5mb3JtYXRpb246IGV4dEhvc3RUeXBlcy5QYXJhbWV0ZXJJbmZvcm1hdGlvbixcblx0XHRcdFBvcnRBdXRvRm9yd2FyZEFjdGlvbjogZXh0SG9zdFR5cGVzLlBvcnRBdXRvRm9yd2FyZEFjdGlvbixcblx0XHRcdFBvc2l0aW9uOiBleHRIb3N0VHlwZXMuUG9zaXRpb24sXG5cdFx0XHRQcm9jZXNzRXhlY3V0aW9uOiBleHRIb3N0VHlwZXMuUHJvY2Vzc0V4ZWN1dGlvbixcblx0XHRcdFByb2dyZXNzTG9jYXRpb246IGV4dEhvc3RUeXBlcy5Qcm9ncmVzc0xvY2F0aW9uLFxuXHRcdFx0UXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uOiBleHRIb3N0VHlwZXMuUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLFxuXHRcdFx0UXVpY2tJbnB1dEJ1dHRvbnM6IGV4dEhvc3RUeXBlcy5RdWlja0lucHV0QnV0dG9ucyxcblx0XHRcdFJhbmdlOiBleHRIb3N0VHlwZXMuUmFuZ2UsXG5cdFx0XHRSZWxhdGl2ZVBhdHRlcm46IGV4dEhvc3RUeXBlcy5SZWxhdGl2ZVBhdHRlcm4sXG5cdFx0XHRTZWxlY3Rpb246IGV4dEhvc3RUeXBlcy5TZWxlY3Rpb24sXG5cdFx0XHRTZWxlY3Rpb25SYW5nZTogZXh0SG9zdFR5cGVzLlNlbGVjdGlvblJhbmdlLFxuXHRcdFx0U2VtYW50aWNUb2tlbnM6IGV4dEhvc3RUeXBlcy5TZW1hbnRpY1Rva2Vucyxcblx0XHRcdFNlbWFudGljVG9rZW5zQnVpbGRlcjogZXh0SG9zdFR5cGVzLlNlbWFudGljVG9rZW5zQnVpbGRlcixcblx0XHRcdFNlbWFudGljVG9rZW5zRWRpdDogZXh0SG9zdFR5cGVzLlNlbWFudGljVG9rZW5zRWRpdCxcblx0XHRcdFNlbWFudGljVG9rZW5zRWRpdHM6IGV4dEhvc3RUeXBlcy5TZW1hbnRpY1Rva2Vuc0VkaXRzLFxuXHRcdFx0U2VtYW50aWNUb2tlbnNMZWdlbmQ6IGV4dEhvc3RUeXBlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCxcblx0XHRcdFNoZWxsRXhlY3V0aW9uOiBleHRIb3N0VHlwZXMuU2hlbGxFeGVjdXRpb24sXG5cdFx0XHRTaGVsbFF1b3Rpbmc6IGV4dEhvc3RUeXBlcy5TaGVsbFF1b3RpbmcsXG5cdFx0XHRTaWduYXR1cmVIZWxwOiBleHRIb3N0VHlwZXMuU2lnbmF0dXJlSGVscCxcblx0XHRcdFNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZDogZXh0SG9zdFR5cGVzLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZCxcblx0XHRcdFNpZ25hdHVyZUluZm9ybWF0aW9uOiBleHRIb3N0VHlwZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24sXG5cdFx0XHRTbmlwcGV0U3RyaW5nOiBleHRIb3N0VHlwZXMuU25pcHBldFN0cmluZyxcblx0XHRcdFNvdXJjZUJyZWFrcG9pbnQ6IGV4dEhvc3RUeXBlcy5Tb3VyY2VCcmVha3BvaW50LFxuXHRcdFx0U3RhbmRhcmRUb2tlblR5cGU6IGV4dEhvc3RUeXBlcy5TdGFuZGFyZFRva2VuVHlwZSxcblx0XHRcdFN5bnRheEhpZ2hsaWdodGluZ1Rva2VuRm9udFN0eWxlOiBleHRIb3N0VHlwZXMuU3ludGF4SGlnaGxpZ2h0aW5nVG9rZW5Gb250U3R5bGUsXG5cdFx0XHRTdGF0dXNCYXJBbGlnbm1lbnQ6IGV4dEhvc3RUeXBlcy5TdGF0dXNCYXJBbGlnbm1lbnQsXG5cdFx0XHRTeW1ib2xJbmZvcm1hdGlvbjogZXh0SG9zdFR5cGVzLlN5bWJvbEluZm9ybWF0aW9uLFxuXHRcdFx0U3ltYm9sS2luZDogZXh0SG9zdFR5cGVzLlN5bWJvbEtpbmQsXG5cdFx0XHRTeW1ib2xUYWc6IGV4dEhvc3RUeXBlcy5TeW1ib2xUYWcsXG5cdFx0XHRUYXNrOiBleHRIb3N0VHlwZXMuVGFzayxcblx0XHRcdFRhc2tFdmVudEtpbmQ6IGV4dEhvc3RUeXBlcy5UYXNrRXZlbnRLaW5kLFxuXHRcdFx0VGFza0dyb3VwOiBleHRIb3N0VHlwZXMuVGFza0dyb3VwLFxuXHRcdFx0VGFza1BhbmVsS2luZDogZXh0SG9zdFR5cGVzLlRhc2tQYW5lbEtpbmQsXG5cdFx0XHRUYXNrUmV2ZWFsS2luZDogZXh0SG9zdFR5cGVzLlRhc2tSZXZlYWxLaW5kLFxuXHRcdFx0VGFza1J1bk9uOiBleHRIb3N0VHlwZXMuVGFza1J1bk9uLFxuXHRcdFx0VGFza1Njb3BlOiBleHRIb3N0VHlwZXMuVGFza1Njb3BlLFxuXHRcdFx0VGVybWluYWxMaW5rOiBleHRIb3N0VHlwZXMuVGVybWluYWxMaW5rLFxuXHRcdFx0VGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZDogZXh0SG9zdFR5cGVzLlRlcm1pbmFsUXVpY2tGaXhDb21tYW5kLFxuXHRcdFx0VGVybWluYWxRdWlja0ZpeE9wZW5lcjogZXh0SG9zdFR5cGVzLlRlcm1pbmFsUXVpY2tGaXhPcGVuZXIsXG5cdFx0XHRUZXJtaW5hbExvY2F0aW9uOiBleHRIb3N0VHlwZXMuVGVybWluYWxMb2NhdGlvbixcblx0XHRcdFRlcm1pbmFsUHJvZmlsZTogZXh0SG9zdFR5cGVzLlRlcm1pbmFsUHJvZmlsZSxcblx0XHRcdFRlcm1pbmFsRXhpdFJlYXNvbjogZXh0SG9zdFR5cGVzLlRlcm1pbmFsRXhpdFJlYXNvbixcblx0XHRcdFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2U6IGV4dEhvc3RUeXBlcy5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmVDb25maWRlbmNlLFxuXHRcdFx0VGVybWluYWxDb21wbGV0aW9uSXRlbTogZXh0SG9zdFR5cGVzLlRlcm1pbmFsQ29tcGxldGlvbkl0ZW0sXG5cdFx0XHRUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZDogZXh0SG9zdFR5cGVzLlRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLFxuXHRcdFx0VGVybWluYWxDb21wbGV0aW9uTGlzdDogZXh0SG9zdFR5cGVzLlRlcm1pbmFsQ29tcGxldGlvbkxpc3QsXG5cdFx0XHRUZXJtaW5hbFNoZWxsVHlwZTogZXh0SG9zdFR5cGVzLlRlcm1pbmFsU2hlbGxUeXBlLFxuXHRcdFx0VGV4dERvY3VtZW50U2F2ZVJlYXNvbjogZXh0SG9zdFR5cGVzLlRleHREb2N1bWVudFNhdmVSZWFzb24sXG5cdFx0XHRUZXh0RWRpdDogZXh0SG9zdFR5cGVzLlRleHRFZGl0LFxuXHRcdFx0U25pcHBldFRleHRFZGl0OiBleHRIb3N0VHlwZXMuU25pcHBldFRleHRFZGl0LFxuXHRcdFx0VGV4dEVkaXRvckN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUsXG5cdFx0XHRUZXh0RWRpdG9yQ2hhbmdlS2luZDogZXh0SG9zdFR5cGVzLlRleHRFZGl0b3JDaGFuZ2VLaW5kLFxuXHRcdFx0VGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGU6IGV4dEhvc3RUeXBlcy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSxcblx0XHRcdFRleHRFZGl0b3JSZXZlYWxUeXBlOiBleHRIb3N0VHlwZXMuVGV4dEVkaXRvclJldmVhbFR5cGUsXG5cdFx0XHRUZXh0RWRpdG9yU2VsZWN0aW9uQ2hhbmdlS2luZDogZXh0SG9zdFR5cGVzLlRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kLFxuXHRcdFx0U3ludGF4VG9rZW5UeXBlOiBleHRIb3N0VHlwZXMuU3ludGF4VG9rZW5UeXBlLFxuXHRcdFx0VGV4dERvY3VtZW50Q2hhbmdlUmVhc29uOiBleHRIb3N0VHlwZXMuVGV4dERvY3VtZW50Q2hhbmdlUmVhc29uLFxuXHRcdFx0VGhlbWVDb2xvcjogZXh0SG9zdFR5cGVzLlRoZW1lQ29sb3IsXG5cdFx0XHRUaGVtZUljb246IGV4dEhvc3RUeXBlcy5UaGVtZUljb24sXG5cdFx0XHRUcmVlSXRlbTogZXh0SG9zdFR5cGVzLlRyZWVJdGVtLFxuXHRcdFx0VHJlZUl0ZW1DaGVja2JveFN0YXRlOiBleHRIb3N0VHlwZXMuVHJlZUl0ZW1DaGVja2JveFN0YXRlLFxuXHRcdFx0VHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlOiBleHRIb3N0VHlwZXMuVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLFxuXHRcdFx0VHlwZUhpZXJhcmNoeUl0ZW06IGV4dEhvc3RUeXBlcy5UeXBlSGllcmFyY2h5SXRlbSxcblx0XHRcdFVJS2luZDogVUlLaW5kLFxuXHRcdFx0VXJpOiBVUkksXG5cdFx0XHRWaWV3Q29sdW1uOiBleHRIb3N0VHlwZXMuVmlld0NvbHVtbixcblx0XHRcdFdvcmtzcGFjZUVkaXQ6IGV4dEhvc3RUeXBlcy5Xb3Jrc3BhY2VFZGl0LFxuXHRcdFx0Ly8gcHJvcG9zZWQgYXBpIHR5cGVzXG5cdFx0XHREb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQ6IGV4dEhvc3RUeXBlcy5Eb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQsXG5cdFx0XHREb2N1bWVudERyb3BFZGl0OiBleHRIb3N0VHlwZXMuRG9jdW1lbnREcm9wRWRpdCxcblx0XHRcdERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZDogZXh0SG9zdFR5cGVzLkRvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCxcblx0XHRcdERvY3VtZW50UGFzdGVFZGl0OiBleHRIb3N0VHlwZXMuRG9jdW1lbnRQYXN0ZUVkaXQsXG5cdFx0XHRJbmxheUhpbnQ6IGV4dEhvc3RUeXBlcy5JbmxheUhpbnQsXG5cdFx0XHRJbmxheUhpbnRMYWJlbFBhcnQ6IGV4dEhvc3RUeXBlcy5JbmxheUhpbnRMYWJlbFBhcnQsXG5cdFx0XHRJbmxheUhpbnRLaW5kOiBleHRIb3N0VHlwZXMuSW5sYXlIaW50S2luZCxcblx0XHRcdFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3I6IGV4dEhvc3RUeXBlcy5SZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLFxuXHRcdFx0UmVzb2x2ZWRBdXRob3JpdHk6IGV4dEhvc3RUeXBlcy5SZXNvbHZlZEF1dGhvcml0eSxcblx0XHRcdE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eTogZXh0SG9zdFR5cGVzLk1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eSxcblx0XHRcdFNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb25UeXBlOiBleHRIb3N0VHlwZXMuU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUsXG5cdFx0XHRFeHRlbnNpb25SdW50aW1lOiBleHRIb3N0VHlwZXMuRXh0ZW5zaW9uUnVudGltZSxcblx0XHRcdFRpbWVsaW5lSXRlbTogZXh0SG9zdFR5cGVzLlRpbWVsaW5lSXRlbSxcblx0XHRcdE5vdGVib29rUmFuZ2U6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va1JhbmdlLFxuXHRcdFx0Tm90ZWJvb2tDZWxsS2luZDogZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbEtpbmQsXG5cdFx0XHROb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZTogZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLFxuXHRcdFx0Tm90ZWJvb2tDZWxsRGF0YTogZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbERhdGEsXG5cdFx0XHROb3RlYm9va0RhdGE6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0RhdGEsXG5cdFx0XHROb3RlYm9va1JlbmRlcmVyU2NyaXB0OiBleHRIb3N0VHlwZXMuTm90ZWJvb2tSZW5kZXJlclNjcmlwdCxcblx0XHRcdE5vdGVib29rQ2VsbFN0YXR1c0JhckFsaWdubWVudDogZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbFN0YXR1c0JhckFsaWdubWVudCxcblx0XHRcdE5vdGVib29rRWRpdG9yUmV2ZWFsVHlwZTogZXh0SG9zdFR5cGVzLk5vdGVib29rRWRpdG9yUmV2ZWFsVHlwZSxcblx0XHRcdE5vdGVib29rQ2VsbE91dHB1dDogZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbE91dHB1dCxcblx0XHRcdE5vdGVib29rQ2VsbE91dHB1dEl0ZW06IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtLFxuXHRcdFx0Q2VsbEVycm9yU3RhY2tGcmFtZTogZXh0SG9zdFR5cGVzLkNlbGxFcnJvclN0YWNrRnJhbWUsXG5cdFx0XHROb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSxcblx0XHRcdE5vdGVib29rQ29udHJvbGxlckFmZmluaXR5OiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHksXG5cdFx0XHROb3RlYm9va0NvbnRyb2xsZXJBZmZpbml0eTI6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0NvbnRyb2xsZXJBZmZpbml0eTIsXG5cdFx0XHROb3RlYm9va0VkaXQ6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0VkaXQsXG5cdFx0XHROb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbjogZXh0SG9zdFR5cGVzLk5vdGVib29rS2VybmVsU291cmNlQWN0aW9uLFxuXHRcdFx0Tm90ZWJvb2tWYXJpYWJsZXNSZXF1ZXN0S2luZDogZXh0SG9zdFR5cGVzLk5vdGVib29rVmFyaWFibGVzUmVxdWVzdEtpbmQsXG5cdFx0XHRQb3J0QXR0cmlidXRlczogZXh0SG9zdFR5cGVzLlBvcnRBdHRyaWJ1dGVzLFxuXHRcdFx0TGlua2VkRWRpdGluZ1JhbmdlczogZXh0SG9zdFR5cGVzLkxpbmtlZEVkaXRpbmdSYW5nZXMsXG5cdFx0XHRUZXN0UmVzdWx0U3RhdGU6IGV4dEhvc3RUeXBlcy5UZXN0UmVzdWx0U3RhdGUsXG5cdFx0XHRUZXN0UnVuUmVxdWVzdDogZXh0SG9zdFR5cGVzLlRlc3RSdW5SZXF1ZXN0LFxuXHRcdFx0VGVzdE1lc3NhZ2U6IGV4dEhvc3RUeXBlcy5UZXN0TWVzc2FnZSxcblx0XHRcdFRlc3RNZXNzYWdlU3RhY2tGcmFtZTogZXh0SG9zdFR5cGVzLlRlc3RNZXNzYWdlU3RhY2tGcmFtZSxcblx0XHRcdFRlc3RUYWc6IGV4dEhvc3RUeXBlcy5UZXN0VGFnLFxuXHRcdFx0VGVzdFJ1blByb2ZpbGVLaW5kOiBleHRIb3N0VHlwZXMuVGVzdFJ1blByb2ZpbGVLaW5kLFxuXHRcdFx0VGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGU6IFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlLFxuXHRcdFx0RGF0YVRyYW5zZmVyOiBleHRIb3N0VHlwZXMuRGF0YVRyYW5zZmVyLFxuXHRcdFx0RGF0YVRyYW5zZmVySXRlbTogZXh0SG9zdFR5cGVzLkRhdGFUcmFuc2Zlckl0ZW0sXG5cdFx0XHRUZXN0Q292ZXJhZ2VDb3VudDogZXh0SG9zdFR5cGVzLlRlc3RDb3ZlcmFnZUNvdW50LFxuXHRcdFx0RmlsZUNvdmVyYWdlOiBleHRIb3N0VHlwZXMuRmlsZUNvdmVyYWdlLFxuXHRcdFx0U3RhdGVtZW50Q292ZXJhZ2U6IGV4dEhvc3RUeXBlcy5TdGF0ZW1lbnRDb3ZlcmFnZSxcblx0XHRcdEJyYW5jaENvdmVyYWdlOiBleHRIb3N0VHlwZXMuQnJhbmNoQ292ZXJhZ2UsXG5cdFx0XHREZWNsYXJhdGlvbkNvdmVyYWdlOiBleHRIb3N0VHlwZXMuRGVjbGFyYXRpb25Db3ZlcmFnZSxcblx0XHRcdFdvcmtzcGFjZVRydXN0U3RhdGU6IGV4dEhvc3RUeXBlcy5Xb3Jrc3BhY2VUcnVzdFN0YXRlLFxuXHRcdFx0TGFuZ3VhZ2VTdGF0dXNTZXZlcml0eTogZXh0SG9zdFR5cGVzLkxhbmd1YWdlU3RhdHVzU2V2ZXJpdHksXG5cdFx0XHRRdWlja1BpY2tJdGVtS2luZDogZXh0SG9zdFR5cGVzLlF1aWNrUGlja0l0ZW1LaW5kLFxuXHRcdFx0SW5wdXRCb3hWYWxpZGF0aW9uU2V2ZXJpdHk6IGV4dEhvc3RUeXBlcy5JbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eSxcblx0XHRcdFRhYklucHV0VGV4dDogZXh0SG9zdFR5cGVzLlRleHRUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0VGV4dERpZmY6IGV4dEhvc3RUeXBlcy5UZXh0RGlmZlRhYklucHV0LFxuXHRcdFx0VGFiSW5wdXRUZXh0TWVyZ2U6IGV4dEhvc3RUeXBlcy5UZXh0TWVyZ2VUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0Q3VzdG9tOiBleHRIb3N0VHlwZXMuQ3VzdG9tRWRpdG9yVGFiSW5wdXQsXG5cdFx0XHRUYWJJbnB1dE5vdGVib29rOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tFZGl0b3JUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0Tm90ZWJvb2tEaWZmOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tEaWZmRWRpdG9yVGFiSW5wdXQsXG5cdFx0XHRUYWJJbnB1dFdlYnZpZXc6IGV4dEhvc3RUeXBlcy5XZWJ2aWV3RWRpdG9yVGFiSW5wdXQsXG5cdFx0XHRUYWJJbnB1dFRlcm1pbmFsOiBleHRIb3N0VHlwZXMuVGVybWluYWxFZGl0b3JUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0SW50ZXJhY3RpdmVXaW5kb3c6IGV4dEhvc3RUeXBlcy5JbnRlcmFjdGl2ZVdpbmRvd0lucHV0LFxuXHRcdFx0VGFiSW5wdXRDaGF0OiBleHRIb3N0VHlwZXMuQ2hhdEVkaXRvclRhYklucHV0LFxuXHRcdFx0VGFiSW5wdXRUZXh0TXVsdGlEaWZmOiBleHRIb3N0VHlwZXMuVGV4dE11bHRpRGlmZlRhYklucHV0LFxuXHRcdFx0VGVsZW1ldHJ5VHJ1c3RlZFZhbHVlOiBUZWxlbWV0cnlUcnVzdGVkVmFsdWUsXG5cdFx0XHRMb2dMZXZlbDogTG9nTGV2ZWwsXG5cdFx0XHRFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2g6IEVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaCxcblx0XHRcdEludGVyYWN0aXZlU2Vzc2lvblZvdGVEaXJlY3Rpb246IGV4dEhvc3RUeXBlcy5JbnRlcmFjdGl2ZVNlc3Npb25Wb3RlRGlyZWN0aW9uLFxuXHRcdFx0Q2hhdENvcHlLaW5kOiBleHRIb3N0VHlwZXMuQ2hhdENvcHlLaW5kLFxuXHRcdFx0Q2hhdFNlc3Npb25DaGFuZ2VkRmlsZTogZXh0SG9zdFR5cGVzLkNoYXRTZXNzaW9uQ2hhbmdlZEZpbGUsXG5cdFx0XHRDaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lOiBleHRIb3N0VHlwZXMuQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZSxcblx0XHRcdEludGVyYWN0aXZlRWRpdG9yUmVzcG9uc2VGZWVkYmFja0tpbmQ6IGV4dEhvc3RUeXBlcy5JbnRlcmFjdGl2ZUVkaXRvclJlc3BvbnNlRmVlZGJhY2tLaW5kLFxuXHRcdFx0RGVidWdTdGFja0ZyYW1lOiBleHRIb3N0VHlwZXMuRGVidWdTdGFja0ZyYW1lLFxuXHRcdFx0RGVidWdUaHJlYWQ6IGV4dEhvc3RUeXBlcy5EZWJ1Z1RocmVhZCxcblx0XHRcdFJlbGF0ZWRJbmZvcm1hdGlvblR5cGU6IGV4dEhvc3RUeXBlcy5SZWxhdGVkSW5mb3JtYXRpb25UeXBlLFxuXHRcdFx0U3BlZWNoVG9UZXh0U3RhdHVzOiBleHRIb3N0VHlwZXMuU3BlZWNoVG9UZXh0U3RhdHVzLFxuXHRcdFx0VGV4dFRvU3BlZWNoU3RhdHVzOiBleHRIb3N0VHlwZXMuVGV4dFRvU3BlZWNoU3RhdHVzLFxuXHRcdFx0UGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kOiBleHRIb3N0VHlwZXMuUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLFxuXHRcdFx0SW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQ6IGV4dEhvc3RUeXBlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZCxcblx0XHRcdElubGluZUNvbXBsZXRpb25EaXNwbGF5TG9jYXRpb25LaW5kOiBleHRIb3N0VHlwZXMuSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQsXG5cdFx0XHRLZXl3b3JkUmVjb2duaXRpb25TdGF0dXM6IGV4dEhvc3RUeXBlcy5LZXl3b3JkUmVjb2duaXRpb25TdGF0dXMsXG5cdFx0XHRDaGF0SW1hZ2VNaW1lVHlwZTogZXh0SG9zdFR5cGVzLkNoYXRJbWFnZU1pbWVUeXBlLFxuXHRcdFx0Q2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlQW5jaG9yUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUFuY2hvclBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0Mixcblx0XHRcdENoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VIb29rUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUhvb2tQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0MjogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ29kZUNpdGF0aW9uUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlV2FybmluZ1BhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUluZm9QYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlSW5mb1BhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydCxcblx0XHRcdENoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ29uZmlybWF0aW9uUGFydCxcblx0XHRcdENoYXRRdWVzdGlvbjogZXh0SG9zdFR5cGVzLkNoYXRRdWVzdGlvbixcblx0XHRcdENoYXRRdWVzdGlvblR5cGU6IGV4dEhvc3RUeXBlcy5DaGF0UXVlc3Rpb25UeXBlLFxuXHRcdFx0Q2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydCxcblx0XHRcdENoYXRSZXNwb25zZU1vdmVQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTW92ZVBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUV4dGVuc2lvbnNQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlRXh0ZXJuYWxFZGl0UGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUV4dGVybmFsRWRpdFBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTXVsdGlEaWZmUGFydCxcblx0XHRcdENoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnRTdGF0dXNLaW5kOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQsXG5cdFx0XHRDaGF0UmVzcG9uc2VDbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvblJlYXNvbjogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uUmVhc29uLFxuXHRcdFx0Q2hhdFJlcXVlc3RUdXJuOiBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3RUdXJuLFxuXHRcdFx0Q2hhdFJlcXVlc3RUdXJuMjogZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybixcblx0XHRcdENoYXRSZXNwb25zZVR1cm46IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUdXJuLFxuXHRcdFx0Q2hhdFJlc3BvbnNlVHVybjI6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUdXJuMixcblx0XHRcdENoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YTogZXh0SG9zdFR5cGVzLkNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSxcblx0XHRcdENoYXRUb29sSW52b2NhdGlvblBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0VG9vbEludm9jYXRpb25QYXJ0LFxuXHRcdFx0Q2hhdExvY2F0aW9uOiBleHRIb3N0VHlwZXMuQ2hhdExvY2F0aW9uLFxuXHRcdFx0Q2hhdFNlc3Npb25TdGF0dXM6IGV4dEhvc3RUeXBlcy5DaGF0U2Vzc2lvblN0YXR1cyxcblx0XHRcdENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGU6IGV4dEhvc3RUeXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLFxuXHRcdFx0Q2hhdERlYnVnTG9nTGV2ZWw6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdMb2dMZXZlbCxcblx0XHRcdENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnVG9vbENhbGxSZXN1bHQsXG5cdFx0XHRDaGF0RGVidWdIb29rUmVzdWx0OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnSG9va1Jlc3VsdCxcblx0XHRcdENoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdUb29sQ2FsbEV2ZW50LFxuXHRcdFx0Q2hhdERlYnVnTW9kZWxUdXJuRXZlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdNb2RlbFR1cm5FdmVudCxcblx0XHRcdENoYXREZWJ1Z0dlbmVyaWNFdmVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0dlbmVyaWNFdmVudCxcblx0XHRcdENoYXREZWJ1Z1N1YmFnZW50SW52b2NhdGlvbkV2ZW50OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQsXG5cdFx0XHRDaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCxcblx0XHRcdENoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudCxcblx0XHRcdENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uOiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb24sXG5cdFx0XHRDaGF0RGVidWdFdmVudFRleHRDb250ZW50OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnRXZlbnRUZXh0Q29udGVudCxcblx0XHRcdENoYXREZWJ1Z01lc3NhZ2VDb250ZW50VHlwZTogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z01lc3NhZ2VDb250ZW50VHlwZSxcblx0XHRcdENoYXREZWJ1Z0V2ZW50TWVzc2FnZUNvbnRlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdFdmVudE1lc3NhZ2VDb250ZW50LFxuXHRcdFx0Q2hhdERlYnVnRXZlbnRUb29sQ2FsbENvbnRlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdFdmVudFRvb2xDYWxsQ29udGVudCxcblx0XHRcdENoYXREZWJ1Z0V2ZW50TW9kZWxUdXJuQ29udGVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0V2ZW50TW9kZWxUdXJuQ29udGVudCxcblx0XHRcdENoYXREZWJ1Z0V2ZW50SG9va0NvbnRlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdFdmVudEhvb2tDb250ZW50LFxuXHRcdFx0Q2hhdFJlcXVlc3RFZGl0b3JEYXRhOiBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3RFZGl0b3JEYXRhLFxuXHRcdFx0Q2hhdFJlcXVlc3ROb3RlYm9va0RhdGE6IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdE5vdGVib29rRGF0YSxcblx0XHRcdENoYXRSZWZlcmVuY2VCaW5hcnlEYXRhOiBleHRIb3N0VHlwZXMuQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEsXG5cdFx0XHRDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQsXG5cdFx0XHRMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZSxcblx0XHRcdExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSxcblx0XHRcdExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTI6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyLFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0OiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0MjogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCxcblx0XHRcdExhbmd1YWdlTW9kZWxUZXh0UGFydDogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCxcblx0XHRcdExhbmd1YWdlTW9kZWxUZXh0UGFydDI6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQsXG5cdFx0XHRMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSxcblx0XHRcdFRvb2xSZXN1bHRBdWRpZW5jZTogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UsIC8vIGJhY2sgY29tcGF0XG5cdFx0XHRMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0OiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCxcblx0XHRcdExhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQ6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbEVycm9yOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQ6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCxcblx0XHRcdExhbmd1YWdlTW9kZWxUb29sUmVzdWx0MjogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0Mixcblx0XHRcdExhbmd1YWdlTW9kZWxEYXRhUGFydDogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydCxcblx0XHRcdExhbmd1YWdlTW9kZWxEYXRhUGFydDI6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQsXG5cdFx0XHRMYW5ndWFnZU1vZGVsVG9vbEV4dGVuc2lvblNvdXJjZTogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUb29sRXh0ZW5zaW9uU291cmNlLFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRvb2xNQ1BTb3VyY2U6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVG9vbE1DUFNvdXJjZSxcblx0XHRcdEV4dGVuZGVkTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQ6IGV4dEhvc3RUeXBlcy5FeHRlbmRlZExhbmd1YWdlTW9kZWxUb29sUmVzdWx0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbENoYXRUb29sTW9kZTogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0VG9vbE1vZGUsXG5cdFx0XHRMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydDogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0LFxuXHRcdFx0TmV3U3ltYm9sTmFtZTogZXh0SG9zdFR5cGVzLk5ld1N5bWJvbE5hbWUsXG5cdFx0XHROZXdTeW1ib2xOYW1lVGFnOiBleHRIb3N0VHlwZXMuTmV3U3ltYm9sTmFtZVRhZyxcblx0XHRcdE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZDogZXh0SG9zdFR5cGVzLk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCxcblx0XHRcdEV4Y2x1ZGVTZXR0aW5nT3B0aW9uczogRXhjbHVkZVNldHRpbmdPcHRpb25zLFxuXHRcdFx0VGV4dFNlYXJjaENvbnRleHQyOiBUZXh0U2VhcmNoQ29udGV4dDIsXG5cdFx0XHRUZXh0U2VhcmNoTWF0Y2gyOiBUZXh0U2VhcmNoTWF0Y2gyLFxuXHRcdFx0QUlTZWFyY2hLZXl3b3JkOiBBSVNlYXJjaEtleXdvcmQsXG5cdFx0XHRUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZU5ldzogVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUsXG5cdFx0XHRDaGF0RXJyb3JMZXZlbDogZXh0SG9zdFR5cGVzLkNoYXRFcnJvckxldmVsLFxuXHRcdFx0Q2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHk6IGV4dEhvc3RUeXBlcy5DaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSxcblx0XHRcdE1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uOiBleHRIb3N0VHlwZXMuTWNwSHR0cFNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRNY3BIdHRwU2VydmVyRGVmaW5pdGlvbjI6IGV4dEhvc3RUeXBlcy5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbixcblx0XHRcdE1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbjogZXh0SG9zdFR5cGVzLk1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbixcblx0XHRcdE1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbjI6IGV4dEhvc3RUeXBlcy5NY3BTdGRpb1NlcnZlckRlZmluaXRpb24sXG5cdFx0XHRNY3BUb29sQXZhaWxhYmlsaXR5OiBleHRIb3N0VHlwZXMuTWNwVG9vbEF2YWlsYWJpbGl0eSxcblx0XHRcdE1jcFRvb2xJbnZvY2F0aW9uQ29udGVudERhdGE6IGV4dEhvc3RUeXBlcy5NY3BUb29sSW52b2NhdGlvbkNvbnRlbnREYXRhLFxuXHRcdFx0U2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kOiBleHRIb3N0VHlwZXMuU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kLFxuXHRcdFx0Q2hhdFRvZG9TdGF0dXM6IGV4dEhvc3RUeXBlcy5DaGF0VG9kb1N0YXR1cyxcblx0XHRcdENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzOiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnU3ViYWdlbnRTdGF0dXMsXG5cdFx0fTtcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxZQUFZLFlBQVk7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxTQUFTLHFCQUFxQjtBQUN2QyxPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsT0FBTyx3QkFBd0I7QUFDeEMsWUFBWSwyQkFBMkI7QUFD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
