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
import { DeferredPromise } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { waitForState } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IAutomationService } from "../../../../workbench/contrib/chat/common/automations/automationService.js";
import { publishAutomationRun, publishAutomationRunError } from "../../../../workbench/contrib/chat/common/automations/automationTelemetry.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
let AutomationRunner = class {
  constructor(automationService, sessionsManagementService, logService, telemetryService, notificationService) {
    this.automationService = automationService;
    this.sessionsManagementService = sessionsManagementService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
  }
  runOnce(automation, trigger, leaderWindowId, token = CancellationToken.None) {
    const dispatched = new DeferredPromise();
    return {
      whenDispatched: dispatched.p,
      whenCompleted: this._runOnce(automation, trigger, leaderWindowId, token, dispatched)
    };
  }
  async _runOnce(automation, trigger, leaderWindowId, token, dispatched) {
    try {
      await this._runOnceInner(automation, trigger, leaderWindowId, token, dispatched);
    } catch (err) {
      this.logService.error(`[AutomationRunner] unexpected error in runOnce for ${automation.id}`, err);
    } finally {
      await dispatched.complete({ kind: "notStarted", reason: "error" });
    }
  }
  async _runOnceInner(automation, trigger, leaderWindowId, token, dispatched) {
    const startTimeMs = Date.now();
    let runId;
    try {
      if (!this.automationService.getAutomation(automation.id)) {
        this.logService.trace(`[AutomationRunner] skipping ${automation.id}: automation was deleted.`);
        await dispatched.complete({ kind: "notStarted", reason: "deleted" });
        return;
      }
      const target = automation.target;
      const isolationMode = target.kind === "workspace" ? target.isolation.kind === "folder" ? "workspace" : target.isolation.kind === "worktree" ? "worktree" : void 0 : void 0;
      const branch = target.kind === "workspace" && target.isolation.kind === "worktree" ? target.isolation.branch : void 0;
      const createOptions = target.providerId !== void 0 || target.sessionTypeId !== void 0 || automation.modelId !== void 0 || automation.mode !== void 0 || automation.permissionLevel !== void 0 || isolationMode !== void 0 || branch !== void 0 ? {
        providerId: target.providerId,
        sessionTypeId: target.sessionTypeId,
        modelId: automation.modelId,
        modeId: automation.mode,
        permissionLevel: automation.permissionLevel,
        isolationMode,
        branch
      } : void 0;
      const targetAvailable = target.kind === "quickChat" ? this.sessionsManagementService.isQuickChatTargetAvailable(createOptions) : this.sessionsManagementService.isNewSessionTargetAvailable(target.folderUri, createOptions);
      if (!targetAvailable) {
        this.logService.trace(`[AutomationRunner] deferring ${automation.id}: target is not yet advertised.`);
        if (trigger === "manual") {
          this.notificationService.info(localize("automationTargetUnavailable", "Automation '{0}' cannot start until its agent becomes available.", automation.name));
        }
        await dispatched.complete({ kind: "notStarted", reason: "targetUnavailable" });
        return;
      }
      const claim = await this.automationService.recordRunStart(automation.id, trigger, leaderWindowId);
      if (!claim.claimed) {
        this.logService.trace(`[AutomationRunner] skipping ${automation.id}: active run already exists.`);
        await dispatched.complete({ kind: "alreadyRunning", activeRun: claim.run });
        return;
      }
      runId = claim.run.id;
      const run = await this.automationService.updateRun(runId, { status: "running" }) ?? claim.run;
      if (token.isCancellationRequested) {
        await dispatched.complete({ kind: "notStarted", reason: "cancelled", run });
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      const options = {
        query: automation.prompt,
        background: true,
        title: automation.name?.substring(0, 100)
      };
      this.logService.trace(`[AutomationRunner] running ${automation.id}: target=${target.kind}, provider=${createOptions?.providerId ?? "(default)"}, sessionType=${createOptions?.sessionTypeId ?? "(default)"}, model=${createOptions?.modelId ?? "(default)"}, mode=${createOptions?.modeId ?? "(default)"}, permissionLevel=${createOptions?.permissionLevel ?? "(default)"}`);
      let session;
      if (target.kind === "quickChat") {
        session = await this.sessionsManagementService.createAndSendQuickChatRequest(options, createOptions, token);
      } else {
        session = await this.sessionsManagementService.createAndSendNewChatRequest(target.folderUri, options, createOptions, token);
      }
      if (session) {
        const sessionResource = session.resource.toString();
        const dispatchedRun = await this.automationService.updateRun(runId, { sessionResource }) ?? run;
        await dispatched.complete({ kind: "started", run: dispatchedRun, sessionResource });
      } else {
        await dispatched.complete({ kind: "notStarted", reason: token.isCancellationRequested ? "cancelled" : "error", run });
      }
      if (token.isCancellationRequested) {
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      const terminalStatus = session ? await waitForState(
        session.status,
        (status) => status === SessionStatus.Completed || status === SessionStatus.Error,
        void 0,
        token
      ) : SessionStatus.Completed;
      if (token.isCancellationRequested) {
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      if (terminalStatus === SessionStatus.Error) {
        throw new Error(localize("automationRunner.sessionFailed", "Agent session failed."));
      }
      await this.automationService.updateRun(runId, {
        status: "completed",
        completedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      publishAutomationRun(this.telemetryService, { trigger, automation, success: true, durationMs: Date.now() - startTimeMs });
    } catch (err) {
      if (runId && token.isCancellationRequested) {
        await dispatched.complete({ kind: "notStarted", reason: "cancelled" });
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
      try {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.notificationService.error(localize("automationRunFailed", "Automation '{0}' failed: {1}", automation.name, errorMessage));
        let failedRun;
        if (runId) {
          failedRun = await this.automationService.updateRun(runId, {
            status: "failed",
            completedAt: (/* @__PURE__ */ new Date()).toISOString(),
            errorMessage
          });
        }
        await dispatched.complete({ kind: "notStarted", reason: "error", run: failedRun });
        publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
        publishAutomationRunError(this.telemetryService, { trigger, automation });
      } catch (innerErr) {
        this.logService.error(`[AutomationRunner] error recording failure for ${automation.id}`, innerErr);
      }
    }
  }
  async _markCancelled(runId, trigger, automation, startTimeMs) {
    try {
      if (this.automationService.getActiveRunFor(automation.id)?.id === runId) {
        await this.automationService.updateRun(runId, {
          status: "failed",
          completedAt: (/* @__PURE__ */ new Date()).toISOString(),
          errorMessage: localize("automationRunner.cancelled", "Cancelled")
        });
      }
      publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
    } catch (err) {
      this.logService.error(`[AutomationRunner] error recording cancellation for ${automation.id}`, err);
    }
  }
};
AutomationRunner = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, INotificationService)
], AutomationRunner);
export {
  AutomationRunner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvYnJvd3Nlci9hdXRvbWF0aW9uUnVubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgSUF1dG9tYXRpb24sIElBdXRvbWF0aW9uUnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bkRpc3BhdGNoLCBJQXV0b21hdGlvblJ1bm5lciwgSUF1dG9tYXRpb25SdW5PcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uUnVubmVyLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHB1Ymxpc2hBdXRvbWF0aW9uUnVuLCBwdWJsaXNoQXV0b21hdGlvblJ1bkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcblxuLyoqIFNlc3Npb25zLWxheWVyIHJ1bm5lci4gTmV2ZXIgdGhyb3dzOyBmYWlsdXJlcyBhcmUgcmVjb3JkZWQgb24gdGhlIHJ1biByb3cuICovXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvblJ1bm5lciBpbXBsZW1lbnRzIElBdXRvbWF0aW9uUnVubmVyIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1dG9tYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblNlcnZpY2U6IElBdXRvbWF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRydW5PbmNlKFxuXHRcdGF1dG9tYXRpb246IElBdXRvbWF0aW9uLFxuXHRcdHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLFxuXHRcdGxlYWRlcldpbmRvd0lkOiBudW1iZXIsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0KTogSUF1dG9tYXRpb25SdW5PcGVyYXRpb24ge1xuXHRcdGNvbnN0IGRpc3BhdGNoZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g+KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdoZW5EaXNwYXRjaGVkOiBkaXNwYXRjaGVkLnAsXG5cdFx0XHR3aGVuQ29tcGxldGVkOiB0aGlzLl9ydW5PbmNlKGF1dG9tYXRpb24sIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkLCB0b2tlbiwgZGlzcGF0Y2hlZCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bk9uY2UoXG5cdFx0YXV0b21hdGlvbjogSUF1dG9tYXRpb24sXG5cdFx0dHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsXG5cdFx0bGVhZGVyV2luZG93SWQ6IG51bWJlcixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0ZGlzcGF0Y2hlZDogRGVmZXJyZWRQcm9taXNlPElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g+LFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNdXN0IG5vdCB0aHJvdyBwZXIgSUF1dG9tYXRpb25SdW5uZXIgY29udHJhY3QuIFVuZXhwZWN0ZWQgZXJyb3JzIGFyZSBzd2FsbG93ZWQgaGVyZS5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcnVuT25jZUlubmVyKGF1dG9tYXRpb24sIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkLCB0b2tlbiwgZGlzcGF0Y2hlZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtBdXRvbWF0aW9uUnVubmVyXSB1bmV4cGVjdGVkIGVycm9yIGluIHJ1bk9uY2UgZm9yICR7YXV0b21hdGlvbi5pZH1gLCBlcnIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBOby1vcCBvbmNlIGFuIGV4aXQgcGF0aCBhYm92ZSBoYXMgYWxyZWFkeSByZXBvcnRlZCBpdHMgb3V0Y29tZS5cblx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ2Vycm9yJyB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5PbmNlSW5uZXIoXG5cdFx0YXV0b21hdGlvbjogSUF1dG9tYXRpb24sXG5cdFx0dHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsXG5cdFx0bGVhZGVyV2luZG93SWQ6IG51bWJlcixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0ZGlzcGF0Y2hlZDogRGVmZXJyZWRQcm9taXNlPElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g+LFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGFydFRpbWVNcyA9IERhdGUubm93KCk7XG5cdFx0bGV0IHJ1bklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5hdXRvbWF0aW9uU2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25SdW5uZXJdIHNraXBwaW5nICR7YXV0b21hdGlvbi5pZH06IGF1dG9tYXRpb24gd2FzIGRlbGV0ZWQuYCk7XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ2RlbGV0ZWQnIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IGF1dG9tYXRpb24udGFyZ2V0O1xuXHRcdFx0Y29uc3QgaXNvbGF0aW9uTW9kZSA9IHRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHQ/IHRhcmdldC5pc29sYXRpb24ua2luZCA9PT0gJ2ZvbGRlcicgPyAnd29ya3NwYWNlJyA6IHRhcmdldC5pc29sYXRpb24ua2luZCA9PT0gJ3dvcmt0cmVlJyA/ICd3b3JrdHJlZScgOiB1bmRlZmluZWRcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBicmFuY2ggPSB0YXJnZXQua2luZCA9PT0gJ3dvcmtzcGFjZScgJiYgdGFyZ2V0Lmlzb2xhdGlvbi5raW5kID09PSAnd29ya3RyZWUnID8gdGFyZ2V0Lmlzb2xhdGlvbi5icmFuY2ggOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGNyZWF0ZU9wdGlvbnM6IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHRhcmdldC5wcm92aWRlcklkICE9PSB1bmRlZmluZWQgfHwgdGFyZ2V0LnNlc3Npb25UeXBlSWQgIT09IHVuZGVmaW5lZCB8fCBhdXRvbWF0aW9uLm1vZGVsSWQgIT09IHVuZGVmaW5lZCB8fCBhdXRvbWF0aW9uLm1vZGUgIT09IHVuZGVmaW5lZCB8fCBhdXRvbWF0aW9uLnBlcm1pc3Npb25MZXZlbCAhPT0gdW5kZWZpbmVkIHx8IGlzb2xhdGlvbk1vZGUgIT09IHVuZGVmaW5lZCB8fCBicmFuY2ggIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZUlkOiB0YXJnZXQuc2Vzc2lvblR5cGVJZCxcblx0XHRcdFx0XHRtb2RlbElkOiBhdXRvbWF0aW9uLm1vZGVsSWQsXG5cdFx0XHRcdFx0bW9kZUlkOiBhdXRvbWF0aW9uLm1vZGUsXG5cdFx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiBhdXRvbWF0aW9uLnBlcm1pc3Npb25MZXZlbCxcblx0XHRcdFx0XHRpc29sYXRpb25Nb2RlLFxuXHRcdFx0XHRcdGJyYW5jaCxcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgdGFyZ2V0QXZhaWxhYmxlID0gdGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0XHRcdD8gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKGNyZWF0ZU9wdGlvbnMpXG5cdFx0XHRcdDogdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZSh0YXJnZXQuZm9sZGVyVXJpLCBjcmVhdGVPcHRpb25zKTtcblx0XHRcdGlmICghdGFyZ2V0QXZhaWxhYmxlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25SdW5uZXJdIGRlZmVycmluZyAke2F1dG9tYXRpb24uaWR9OiB0YXJnZXQgaXMgbm90IHlldCBhZHZlcnRpc2VkLmApO1xuXHRcdFx0XHRpZiAodHJpZ2dlciA9PT0gJ21hbnVhbCcpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnYXV0b21hdGlvblRhcmdldFVuYXZhaWxhYmxlJywgXCJBdXRvbWF0aW9uICd7MH0nIGNhbm5vdCBzdGFydCB1bnRpbCBpdHMgYWdlbnQgYmVjb21lcyBhdmFpbGFibGUuXCIsIGF1dG9tYXRpb24ubmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ3RhcmdldFVuYXZhaWxhYmxlJyB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdG9taWNhbGx5IGNsYWltcyB0aGUgYXV0b21hdGlvbidzIHNpbmdsZSBhY3RpdmUtcnVuIHNsb3Q7IGEgbG9zaW5nIHJhY2VyXG5cdFx0XHQvLyBnZXRzIHRoZSB3aW5uZXIncyBydW4gYmFjayBpbnN0ZWFkIG9mIGRpc3BhdGNoaW5nIGEgZHVwbGljYXRlIHNlc3Npb24uXG5cdFx0XHRjb25zdCBjbGFpbSA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYXV0b21hdGlvbi5pZCwgdHJpZ2dlciwgbGVhZGVyV2luZG93SWQpO1xuXHRcdFx0aWYgKCFjbGFpbS5jbGFpbWVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25SdW5uZXJdIHNraXBwaW5nICR7YXV0b21hdGlvbi5pZH06IGFjdGl2ZSBydW4gYWxyZWFkeSBleGlzdHMuYCk7XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnYWxyZWFkeVJ1bm5pbmcnLCBhY3RpdmVSdW46IGNsYWltLnJ1biB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cnVuSWQgPSBjbGFpbS5ydW4uaWQ7XG5cdFx0XHRjb25zdCBydW4gPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZVJ1bihydW5JZCwgeyBzdGF0dXM6ICdydW5uaW5nJyB9KSA/PyBjbGFpbS5ydW47XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRhd2FpdCBkaXNwYXRjaGVkLmNvbXBsZXRlKHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246ICdjYW5jZWxsZWQnLCBydW4gfSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21hcmtDYW5jZWxsZWQocnVuSWQsIHRyaWdnZXIsIGF1dG9tYXRpb24sIHN0YXJ0VGltZU1zKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0XHRxdWVyeTogYXV0b21hdGlvbi5wcm9tcHQsXG5cdFx0XHRcdGJhY2tncm91bmQ6IHRydWUsXG5cdFx0XHRcdHRpdGxlOiBhdXRvbWF0aW9uLm5hbWU/LnN1YnN0cmluZygwLCAxMDApLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXV0b21hdGlvblJ1bm5lcl0gcnVubmluZyAke2F1dG9tYXRpb24uaWR9OiB0YXJnZXQ9JHt0YXJnZXQua2luZH0sIHByb3ZpZGVyPSR7Y3JlYXRlT3B0aW9ucz8ucHJvdmlkZXJJZCA/PyAnKGRlZmF1bHQpJ30sIHNlc3Npb25UeXBlPSR7Y3JlYXRlT3B0aW9ucz8uc2Vzc2lvblR5cGVJZCA/PyAnKGRlZmF1bHQpJ30sIG1vZGVsPSR7Y3JlYXRlT3B0aW9ucz8ubW9kZWxJZCA/PyAnKGRlZmF1bHQpJ30sIG1vZGU9JHtjcmVhdGVPcHRpb25zPy5tb2RlSWQgPz8gJyhkZWZhdWx0KSd9LCBwZXJtaXNzaW9uTGV2ZWw9JHtjcmVhdGVPcHRpb25zPy5wZXJtaXNzaW9uTGV2ZWwgPz8gJyhkZWZhdWx0KSd9YCk7XG5cblx0XHRcdGxldCBzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXJnZXQua2luZCA9PT0gJ3F1aWNrQ2hhdCcpIHtcblx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVBbmRTZW5kUXVpY2tDaGF0UmVxdWVzdChvcHRpb25zLCBjcmVhdGVPcHRpb25zLCB0b2tlbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCh0YXJnZXQuZm9sZGVyVXJpLCBvcHRpb25zLCBjcmVhdGVPcHRpb25zLCB0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgZGlzcGF0Y2hlZFJ1biA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UudXBkYXRlUnVuKHJ1bklkLCB7IHNlc3Npb25SZXNvdXJjZSB9KSA/PyBydW47XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnc3RhcnRlZCcsIHJ1bjogZGlzcGF0Y2hlZFJ1biwgc2Vzc2lvblJlc291cmNlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRGlzcGF0Y2ggZW5kZWQgd2l0aG91dCBhIHNlc3Npb24sIGUuZy4gdGhlIHNlc3Npb25zIHNlcnZpY2Ugd2FzIGRpc3Bvc2VkIG1pZC1zZW5kLlxuXHRcdFx0XHRhd2FpdCBkaXNwYXRjaGVkLmNvbXBsZXRlKHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID8gJ2NhbmNlbGxlZCcgOiAnZXJyb3InLCBydW4gfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tYXJrQ2FuY2VsbGVkKHJ1bklkLCB0cmlnZ2VyLCBhdXRvbWF0aW9uLCBzdGFydFRpbWVNcyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGVybWluYWxTdGF0dXMgPSBzZXNzaW9uXG5cdFx0XHRcdD8gYXdhaXQgd2FpdEZvclN0YXRlKFxuXHRcdFx0XHRcdHNlc3Npb24uc3RhdHVzLFxuXHRcdFx0XHRcdHN0YXR1cyA9PiBzdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkIHx8IHN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5FcnJvcixcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdClcblx0XHRcdFx0OiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21hcmtDYW5jZWxsZWQocnVuSWQsIHRyaWdnZXIsIGF1dG9tYXRpb24sIHN0YXJ0VGltZU1zKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVybWluYWxTdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhdXRvbWF0aW9uUnVubmVyLnNlc3Npb25GYWlsZWQnLCBcIkFnZW50IHNlc3Npb24gZmFpbGVkLlwiKSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UudXBkYXRlUnVuKHJ1bklkLCB7XG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9KTtcblx0XHRcdHB1Ymxpc2hBdXRvbWF0aW9uUnVuKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgeyB0cmlnZ2VyLCBhdXRvbWF0aW9uLCBzdWNjZXNzOiB0cnVlLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lTXMgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAocnVuSWQgJiYgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0YXdhaXQgZGlzcGF0Y2hlZC5jb21wbGV0ZSh7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAnY2FuY2VsbGVkJyB9KTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWFya0NhbmNlbGxlZChydW5JZCwgdHJpZ2dlciwgYXV0b21hdGlvbiwgc3RhcnRUaW1lTXMpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtBdXRvbWF0aW9uUnVubmVyXSBydW4gZm9yICR7YXV0b21hdGlvbi5pZH0gZmFpbGVkYCwgZXJyKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuRmFpbGVkJywgXCJBdXRvbWF0aW9uICd7MH0nIGZhaWxlZDogezF9XCIsIGF1dG9tYXRpb24ubmFtZSwgZXJyb3JNZXNzYWdlKSk7XG5cdFx0XHRcdGxldCBmYWlsZWRSdW46IElBdXRvbWF0aW9uUnVuIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocnVuSWQpIHtcblx0XHRcdFx0XHRmYWlsZWRSdW4gPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZVJ1bihydW5JZCwge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcblx0XHRcdFx0XHRcdGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRlcnJvck1lc3NhZ2UsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTm8tb3Agd2hlbiB0aGUgc2Vzc2lvbiB3YXMgYWxyZWFkeSBkaXNwYXRjaGVkIGFuZCBmYWlsZWQgbGF0ZXIgaW4gaXRzIGxpZmVjeWNsZS5cblx0XHRcdFx0YXdhaXQgZGlzcGF0Y2hlZC5jb21wbGV0ZSh7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAnZXJyb3InLCBydW46IGZhaWxlZFJ1biB9KTtcblx0XHRcdFx0cHVibGlzaEF1dG9tYXRpb25SdW4odGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB7IHRyaWdnZXIsIGF1dG9tYXRpb24sIHN1Y2Nlc3M6IGZhbHNlLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lTXMgfSk7XG5cdFx0XHRcdHB1Ymxpc2hBdXRvbWF0aW9uUnVuRXJyb3IodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB7IHRyaWdnZXIsIGF1dG9tYXRpb24gfSk7XG5cdFx0XHR9IGNhdGNoIChpbm5lckVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtBdXRvbWF0aW9uUnVubmVyXSBlcnJvciByZWNvcmRpbmcgZmFpbHVyZSBmb3IgJHthdXRvbWF0aW9uLmlkfWAsIGlubmVyRXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9tYXJrQ2FuY2VsbGVkKHJ1bklkOiBzdHJpbmcsIHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgc3RhcnRUaW1lTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5hdXRvbWF0aW9uU2VydmljZS5nZXRBY3RpdmVSdW5Gb3IoYXV0b21hdGlvbi5pZCk/LmlkID09PSBydW5JZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZVJ1bihydW5JZCwge1xuXHRcdFx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRcdFx0Y29tcGxldGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvbWF0aW9uUnVubmVyLmNhbmNlbGxlZCcsIFwiQ2FuY2VsbGVkXCIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHB1Ymxpc2hBdXRvbWF0aW9uUnVuKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgeyB0cmlnZ2VyLCBhdXRvbWF0aW9uLCBzdWNjZXNzOiBmYWxzZSwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZU1zIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbQXV0b21hdGlvblJ1bm5lcl0gZXJyb3IgcmVjb3JkaW5nIGNhbmNlbGxhdGlvbiBmb3IgJHthdXRvbWF0aW9uLmlkfWAsIGVycik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNC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
