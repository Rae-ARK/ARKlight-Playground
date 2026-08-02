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
import { $, reset } from "../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { isRemoteDiagnosticError } from "../../../../platform/diagnostics/common/diagnostics.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProcessService } from "../../../../platform/process/common/process.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { applyZoom } from "../../../../platform/window/electron-browser/window.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { BaseIssueReporterService } from "../browser/baseIssueReporterService.js";
import { IIssueFormService, IssueType } from "../common/issue.js";
const MAX_URL_LENGTH = 7500;
const MAX_GITHUB_API_LENGTH = 65500;
let IssueReporter = class extends BaseIssueReporterService {
  constructor(disableExtensions, data, os, product, window, nativeHostService, issueFormService, processService, themeService, fileService, fileDialogService, updateService, contextKeyService, contextMenuService, authenticationService, openerService) {
    super(disableExtensions, data, os, product, window, false, issueFormService, themeService, fileService, fileDialogService, contextMenuService, authenticationService, openerService);
    this.nativeHostService = nativeHostService;
    this.updateService = updateService;
    this.processService = processService;
    this.processService.getSystemInfo().then((info) => {
      this.issueReporterModel.update({ systemInfo: info });
      this.receivedSystemInfo = true;
      this.updateSystemInfo(this.issueReporterModel.getData());
      this.updateButtonStates();
    });
    if (this.data.issueType === IssueType.PerformanceIssue) {
      this.processService.getPerformanceInfo().then((info) => {
        this.updatePerformanceInfo(info);
      });
    }
    this.checkForUpdates();
    this.setEventHandlers();
    applyZoom(this.data.zoomLevel, this.window);
    this.updateExperimentsInfo(this.data.experiments);
    this.updateRestrictedMode(this.data.restrictedMode);
    this.updateInstallationPureMode(this.data.isInstallationPure);
  }
  async checkForUpdates() {
    const updateState = this.updateService.state;
    if (updateState.type === StateType.Ready || updateState.type === StateType.Downloaded) {
      this.needsUpdate = true;
      const includeAcknowledgement = this.getElementById("version-acknowledgements");
      const updateBanner = this.getElementById("update-banner");
      if (updateBanner && includeAcknowledgement) {
        includeAcknowledgement.classList.remove("hidden");
        updateBanner.classList.remove("hidden");
        updateBanner.textContent = localize("updateAvailable", "A new version of {0} is available.", this.product.nameLong);
      }
    }
  }
  setEventHandlers() {
    super.setEventHandlers();
    this.addEventListener("issue-type", "change", (event) => {
      const issueType = parseInt(event.target.value);
      this.issueReporterModel.update({ issueType });
      if (issueType === IssueType.PerformanceIssue && !this.receivedPerformanceInfo) {
        this.processService.getPerformanceInfo().then((info) => {
          this.updatePerformanceInfo(info);
        });
      }
      const descriptionTextArea = this.getElementById("issue-title");
      if (descriptionTextArea) {
        descriptionTextArea.placeholder = localize("undefinedPlaceholder", "Please enter a title");
      }
      this.updateButtonStates();
      this.setSourceOptions();
      this.render();
    });
  }
  async submitToGitHub(issueTitle, issueBody, gitHubDetails) {
    if (issueBody.length > MAX_GITHUB_API_LENGTH) {
      const extensionData = this.issueReporterModel.getData().extensionData;
      if (extensionData) {
        issueBody = issueBody.replace(extensionData, "");
        const date = /* @__PURE__ */ new Date();
        const formattedDate = date.toISOString().split("T")[0];
        const formattedTime = date.toTimeString().split(" ")[0].replace(/:/g, "-");
        const fileName = `extensionData_${formattedDate}_${formattedTime}.md`;
        try {
          const downloadPath = await this.fileDialogService.showSaveDialog({
            title: localize("saveExtensionData", "Save Extension Data"),
            availableFileSystems: [Schemas.file],
            defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), fileName)
          });
          if (downloadPath) {
            await this.fileService.writeFile(downloadPath, VSBuffer.fromString(extensionData));
          }
        } catch (e) {
          console.error("Writing extension data to file failed");
          return false;
        }
      } else {
        console.error("Issue body too large to submit to GitHub");
        return false;
      }
    }
    const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
    const init = {
      method: "POST",
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody
      }),
      headers: new Headers({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.data.githubAccessToken}`
      })
    };
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error("Invalid GitHub URL provided.");
      return false;
    }
    const result = await response.json();
    await this.openerService.open(result.html_url, { openExternal: true });
    this.close();
    return true;
  }
  async createIssue(shouldCreate, privateUri) {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    if (this.nonGitHubIssueUrl) {
      const url2 = this.getExtensionBugsUrl();
      if (url2) {
        this.hasBeenSubmitted = true;
        await this.openerService.open(url2, { openExternal: true });
        return true;
      }
    }
    if (!this.validateInputs()) {
      const invalidInput = this.window.document.getElementsByClassName("invalid-input");
      if (invalidInput.length) {
        invalidInput[0].focus();
      }
      this.addEventListener("issue-title", "input", (_) => {
        this.validateInput("issue-title");
      });
      this.addEventListener("description", "input", (_) => {
        this.validateInput("description");
      });
      this.addEventListener("issue-source", "change", (_) => {
        this.validateInput("issue-source");
      });
      if (this.issueReporterModel.fileOnExtension()) {
        this.addEventListener("extension-selector", "change", (_) => {
          this.validateInput("extension-selector");
          this.validateInput("description");
        });
      }
      return false;
    }
    this.hasBeenSubmitted = true;
    const issueTitle = this.getElementById("issue-title").value;
    const issueBody = this.issueReporterModel.serialize();
    let issueUrl = privateUri ? this.getPrivateIssueUrl() : this.getIssueUrl();
    if (!issueUrl && selectedExtension?.uri) {
      const uri = URI.revive(selectedExtension.uri);
      issueUrl = uri.toString();
    } else if (!issueUrl) {
      console.error(`No ${privateUri ? "private " : ""}issue url found`);
      return false;
    }
    const gitHubDetails = this.parseGitHubUrl(issueUrl);
    const baseUrl = this.getIssueUrlWithTitle(this.getElementById("issue-title").value, issueUrl);
    let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;
    url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
    if (this.data.githubAccessToken && gitHubDetails && shouldCreate) {
      if (await this.submitToGitHub(issueTitle, issueBody, gitHubDetails)) {
        return true;
      }
    }
    try {
      if (url.length > MAX_URL_LENGTH || issueBody.length > MAX_GITHUB_API_LENGTH) {
        url = await this.writeToClipboard(baseUrl, issueBody);
        url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
      }
    } catch (_) {
      console.error("Writing to clipboard failed");
      return false;
    }
    await this.openerService.open(url, { openExternal: true });
    return true;
  }
  async writeToClipboard(baseUrl, issueBody) {
    const shouldWrite = await this.issueFormService.showClipboardDialog();
    if (!shouldWrite) {
      throw new CancellationError();
    }
    await this.nativeHostService.writeClipboardText(issueBody);
    return baseUrl + `&body=${encodeURIComponent(localize("pasteData", "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
  }
  updateSystemInfo(state) {
    const target = this.window.document.querySelector(".block-system .block-info");
    if (target) {
      const systemInfo = state.systemInfo;
      const renderedDataTable = $(
        "table",
        void 0,
        $(
          "tr",
          void 0,
          $("td", void 0, "CPUs"),
          $("td", void 0, systemInfo.cpus || "")
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "GPU Status"),
          $("td", void 0, Object.keys(systemInfo.gpuStatus).map((key) => `${key}: ${systemInfo.gpuStatus[key]}`).join("\n"))
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Load (avg)"),
          $("td", void 0, systemInfo.load || "")
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Memory (System)"),
          $("td", void 0, systemInfo.memory)
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Process Argv"),
          $("td", void 0, systemInfo.processArgs)
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Screen Reader"),
          $("td", void 0, systemInfo.screenReader)
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "VM"),
          $("td", void 0, systemInfo.vmHint)
        )
      );
      reset(target, renderedDataTable);
      systemInfo.remoteData.forEach((remote) => {
        target.appendChild($("hr"));
        if (isRemoteDiagnosticError(remote)) {
          const remoteDataTable = $(
            "table",
            void 0,
            $(
              "tr",
              void 0,
              $("td", void 0, "Remote"),
              $("td", void 0, remote.hostName)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, ""),
              $("td", void 0, remote.errorMessage)
            )
          );
          target.appendChild(remoteDataTable);
        } else {
          const remoteDataTable = $(
            "table",
            void 0,
            $(
              "tr",
              void 0,
              $("td", void 0, "Remote"),
              $("td", void 0, remote.latency ? `${remote.hostName} (latency: ${remote.latency.current.toFixed(2)}ms last, ${remote.latency.average.toFixed(2)}ms average)` : remote.hostName)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "OS"),
              $("td", void 0, remote.machineInfo.os)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "CPUs"),
              $("td", void 0, remote.machineInfo.cpus || "")
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "Memory (System)"),
              $("td", void 0, remote.machineInfo.memory)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "VM"),
              $("td", void 0, remote.machineInfo.vmHint)
            )
          );
          target.appendChild(remoteDataTable);
        }
      });
    }
  }
  updateRestrictedMode(restrictedMode) {
    this.issueReporterModel.update({ restrictedMode });
  }
  updateInstallationPureMode(isInstallationPure) {
    this.issueReporterModel.update({ isInstallationPure });
  }
  updateExperimentsInfo(experimentInfo) {
    this.issueReporterModel.update({ experimentInfo });
    const target = this.window.document.querySelector(".block-experiments .block-info");
    if (target) {
      target.textContent = experimentInfo ? experimentInfo : localize("noCurrentExperiments", "No current experiments.");
    }
  }
};
IssueReporter = __decorateClass([
  __decorateParam(5, INativeHostService),
  __decorateParam(6, IIssueFormService),
  __decorateParam(7, IProcessService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IFileDialogService),
  __decorateParam(11, IUpdateService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IAuthenticationService),
  __decorateParam(15, IOpenerService)
], IssueReporter);
export {
  IssueReporter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2VsZWN0cm9uLWJyb3dzZXIvaXNzdWVSZXBvcnRlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgJCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElQcm9kdWN0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhZ25vc3RpY3MvY29tbW9uL2RpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvY2Vzcy9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSwgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBhcHBseVpvb20gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvZWxlY3Ryb24tYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBCYXNlSXNzdWVSZXBvcnRlclNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL2Jhc2VJc3N1ZVJlcG9ydGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJc3N1ZVJlcG9ydGVyRGF0YSBhcyBJc3N1ZVJlcG9ydGVyTW9kZWxEYXRhIH0gZnJvbSAnLi4vYnJvd3Nlci9pc3N1ZVJlcG9ydGVyTW9kZWwuanMnO1xuaW1wb3J0IHsgSUlzc3VlRm9ybVNlcnZpY2UsIElzc3VlUmVwb3J0ZXJEYXRhLCBJc3N1ZVR5cGUgfSBmcm9tICcuLi9jb21tb24vaXNzdWUuanMnO1xuXG4vLyBHaXRIdWIgaGFzIGxldCB1cyBrbm93IHRoYXQgd2UgY291bGQgdXAgb3VyIGxpbWl0IGhlcmUgdG8gOGsuIFdlIGNob3NlIDc1MDAgdG8gcGxheSBpdCBzYWZlLlxuLy8gcmVmIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTkxOTFcbmNvbnN0IE1BWF9VUkxfTEVOR1RIID0gNzUwMDtcblxuLy8gR2l0aHViIEFQSSBhbmQgaXNzdWVzIG9uIHdlYiBoYXMgYSBsaW1pdCBvZiA2NTUzNi4gV2UgY2hvc2UgNjU1MDAgdG8gcGxheSBpdCBzYWZlLlxuLy8gcmVmIGh0dHBzOi8vZ2l0aHViLmNvbS9naXRodWIvaXNzdWVzL2lzc3Vlcy8xMjg1OFxuY29uc3QgTUFYX0dJVEhVQl9BUElfTEVOR1RIID0gNjU1MDA7XG5cblxuZXhwb3J0IGNsYXNzIElzc3VlUmVwb3J0ZXIgZXh0ZW5kcyBCYXNlSXNzdWVSZXBvcnRlclNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2Nlc3NTZXJ2aWNlOiBJUHJvY2Vzc1NlcnZpY2U7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRpc2FibGVFeHRlbnNpb25zOiBib29sZWFuLFxuXHRcdGRhdGE6IElzc3VlUmVwb3J0ZXJEYXRhLFxuXHRcdG9zOiB7XG5cdFx0XHR0eXBlOiBzdHJpbmc7XG5cdFx0XHRhcmNoOiBzdHJpbmc7XG5cdFx0XHRyZWxlYXNlOiBzdHJpbmc7XG5cdFx0fSxcblx0XHRwcm9kdWN0OiBJUHJvZHVjdENvbmZpZ3VyYXRpb24sXG5cdFx0d2luZG93OiBXaW5kb3csXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElJc3N1ZUZvcm1TZXJ2aWNlIGlzc3VlRm9ybVNlcnZpY2U6IElJc3N1ZUZvcm1TZXJ2aWNlLFxuXHRcdEBJUHJvY2Vzc1NlcnZpY2UgcHJvY2Vzc1NlcnZpY2U6IElQcm9jZXNzU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVVwZGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cGRhdGVTZXJ2aWNlOiBJVXBkYXRlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZGlzYWJsZUV4dGVuc2lvbnMsIGRhdGEsIG9zLCBwcm9kdWN0LCB3aW5kb3csIGZhbHNlLCBpc3N1ZUZvcm1TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBmaWxlRGlhbG9nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBhdXRoZW50aWNhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UpO1xuXHRcdHRoaXMucHJvY2Vzc1NlcnZpY2UgPSBwcm9jZXNzU2VydmljZTtcblx0XHR0aGlzLnByb2Nlc3NTZXJ2aWNlLmdldFN5c3RlbUluZm8oKS50aGVuKGluZm8gPT4ge1xuXHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgc3lzdGVtSW5mbzogaW5mbyB9KTtcblx0XHRcdHRoaXMucmVjZWl2ZWRTeXN0ZW1JbmZvID0gdHJ1ZTtcblxuXHRcdFx0dGhpcy51cGRhdGVTeXN0ZW1JbmZvKHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHRcdH0pO1xuXHRcdGlmICh0aGlzLmRhdGEuaXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSkge1xuXHRcdFx0dGhpcy5wcm9jZXNzU2VydmljZS5nZXRQZXJmb3JtYW5jZUluZm8oKS50aGVuKGluZm8gPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVBlcmZvcm1hbmNlSW5mbyhpbmZvIGFzIFBhcnRpYWw8SXNzdWVSZXBvcnRlckRhdGE+KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuY2hlY2tGb3JVcGRhdGVzKCk7XG5cdFx0dGhpcy5zZXRFdmVudEhhbmRsZXJzKCk7XG5cdFx0YXBwbHlab29tKHRoaXMuZGF0YS56b29tTGV2ZWwsIHRoaXMud2luZG93KTtcblx0XHR0aGlzLnVwZGF0ZUV4cGVyaW1lbnRzSW5mbyh0aGlzLmRhdGEuZXhwZXJpbWVudHMpO1xuXHRcdHRoaXMudXBkYXRlUmVzdHJpY3RlZE1vZGUodGhpcy5kYXRhLnJlc3RyaWN0ZWRNb2RlKTtcblx0XHR0aGlzLnVwZGF0ZUluc3RhbGxhdGlvblB1cmVNb2RlKHRoaXMuZGF0YS5pc0luc3RhbGxhdGlvblB1cmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0ZvclVwZGF0ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXBkYXRlU3RhdGUgPSB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGU7XG5cdFx0aWYgKHVwZGF0ZVN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5SZWFkeSB8fCB1cGRhdGVTdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuRG93bmxvYWRlZCkge1xuXHRcdFx0dGhpcy5uZWVkc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGluY2x1ZGVBY2tub3dsZWRnZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCd2ZXJzaW9uLWFja25vd2xlZGdlbWVudHMnKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgdXBkYXRlQmFubmVyID0gdGhpcy5nZXRFbGVtZW50QnlJZCgndXBkYXRlLWJhbm5lcicpO1xuXHRcdFx0aWYgKHVwZGF0ZUJhbm5lciAmJiBpbmNsdWRlQWNrbm93bGVkZ2VtZW50KSB7XG5cdFx0XHRcdGluY2x1ZGVBY2tub3dsZWRnZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0XHRcdHVwZGF0ZUJhbm5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRcdFx0dXBkYXRlQmFubmVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUF2YWlsYWJsZScsIFwiQSBuZXcgdmVyc2lvbiBvZiB7MH0gaXMgYXZhaWxhYmxlLlwiLCB0aGlzLnByb2R1Y3QubmFtZUxvbmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzZXRFdmVudEhhbmRsZXJzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldEV2ZW50SGFuZGxlcnMoKTtcblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtdHlwZScsICdjaGFuZ2UnLCAoZXZlbnQ6IEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBpc3N1ZVR5cGUgPSBwYXJzZUludCgoPEhUTUxJbnB1dEVsZW1lbnQ+ZXZlbnQudGFyZ2V0KS52YWx1ZSk7XG5cdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBpc3N1ZVR5cGU6IGlzc3VlVHlwZSB9KTtcblx0XHRcdGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlICYmICF0aGlzLnJlY2VpdmVkUGVyZm9ybWFuY2VJbmZvKSB7XG5cdFx0XHRcdHRoaXMucHJvY2Vzc1NlcnZpY2UuZ2V0UGVyZm9ybWFuY2VJbmZvKCkudGhlbihpbmZvID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVBlcmZvcm1hbmNlSW5mbyhpbmZvIGFzIFBhcnRpYWw8SXNzdWVSZXBvcnRlckRhdGE+KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc2V0cyBwbGFjZWhvbGRlclxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvblRleHRBcmVhID0gPEhUTUxJbnB1dEVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdGl0bGUnKTtcblx0XHRcdGlmIChkZXNjcmlwdGlvblRleHRBcmVhKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uVGV4dEFyZWEucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgndW5kZWZpbmVkUGxhY2Vob2xkZXInLCBcIlBsZWFzZSBlbnRlciBhIHRpdGxlXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHRcdFx0dGhpcy5zZXRTb3VyY2VPcHRpb25zKCk7XG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHN1Ym1pdFRvR2l0SHViKGlzc3VlVGl0bGU6IHN0cmluZywgaXNzdWVCb2R5OiBzdHJpbmcsIGdpdEh1YkRldGFpbHM6IHsgb3duZXI6IHN0cmluZzsgcmVwb3NpdG9yeU5hbWU6IHN0cmluZyB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGlzc3VlQm9keS5sZW5ndGggPiBNQVhfR0lUSFVCX0FQSV9MRU5HVEgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkRhdGEgPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuZXh0ZW5zaW9uRGF0YTtcblx0XHRcdGlmIChleHRlbnNpb25EYXRhKSB7XG5cdFx0XHRcdGlzc3VlQm9keSA9IGlzc3VlQm9keS5yZXBsYWNlKGV4dGVuc2lvbkRhdGEsICcnKTtcblx0XHRcdFx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG5cdFx0XHRcdGNvbnN0IGZvcm1hdHRlZERhdGUgPSBkYXRlLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTsgLy8gWVlZWS1NTS1ERFxuXHRcdFx0XHRjb25zdCBmb3JtYXR0ZWRUaW1lID0gZGF0ZS50b1RpbWVTdHJpbmcoKS5zcGxpdCgnICcpWzBdLnJlcGxhY2UoLzovZywgJy0nKTsgLy8gSEgtTU0tU1Ncblx0XHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBgZXh0ZW5zaW9uRGF0YV8ke2Zvcm1hdHRlZERhdGV9XyR7Zm9ybWF0dGVkVGltZX0ubWRgO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGRvd25sb2FkUGF0aCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzYXZlRXh0ZW5zaW9uRGF0YScsIFwiU2F2ZSBFeHRlbnNpb24gRGF0YVwiKSxcblx0XHRcdFx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSxcblx0XHRcdFx0XHRcdGRlZmF1bHRVcmk6IGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKFNjaGVtYXMuZmlsZSksIGZpbGVOYW1lKSxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmIChkb3dubG9hZFBhdGgpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGRvd25sb2FkUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhleHRlbnNpb25EYXRhKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignV3JpdGluZyBleHRlbnNpb24gZGF0YSB0byBmaWxlIGZhaWxlZCcpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignSXNzdWUgYm9keSB0b28gbGFyZ2UgdG8gc3VibWl0IHRvIEdpdEh1YicpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHVybCA9IGBodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zLyR7Z2l0SHViRGV0YWlscy5vd25lcn0vJHtnaXRIdWJEZXRhaWxzLnJlcG9zaXRvcnlOYW1lfS9pc3N1ZXNgO1xuXHRcdGNvbnN0IGluaXQgPSB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dGl0bGU6IGlzc3VlVGl0bGUsXG5cdFx0XHRcdGJvZHk6IGlzc3VlQm9keVxuXHRcdFx0fSksXG5cdFx0XHRoZWFkZXJzOiBuZXcgSGVhZGVycyh7XG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3RoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbn1gXG5cdFx0XHR9KVxuXHRcdH07XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgaW5pdCk7XG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0Y29uc29sZS5lcnJvcignSW52YWxpZCBHaXRIdWIgVVJMIHByb3ZpZGVkLicpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4ocmVzdWx0Lmh0bWxfdXJsLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgY3JlYXRlSXNzdWUoc2hvdWxkQ3JlYXRlPzogYm9vbGVhbiwgcHJpdmF0ZVVyaT86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzZWxlY3RlZEV4dGVuc2lvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHQvLyBTaG9ydCBjaXJjdWl0IGlmIHRoZSBleHRlbnNpb24gcHJvdmlkZXMgYSBjdXN0b20gaXNzdWUgaGFuZGxlclxuXHRcdGlmICh0aGlzLm5vbkdpdEh1Yklzc3VlVXJsKSB7XG5cdFx0XHRjb25zdCB1cmwgPSB0aGlzLmdldEV4dGVuc2lvbkJ1Z3NVcmwoKTtcblx0XHRcdGlmICh1cmwpIHtcblx0XHRcdFx0dGhpcy5oYXNCZWVuU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJsLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRlSW5wdXRzKCkpIHtcblx0XHRcdC8vIElmIGlucHV0cyBhcmUgaW52YWxpZCwgc2V0IGZvY3VzIHRvIHRoZSBmaXJzdCBvbmUgYW5kIGFkZCBsaXN0ZW5lcnMgb24gdGhlbVxuXHRcdFx0Ly8gdG8gZGV0ZWN0IGZ1cnRoZXIgY2hhbmdlc1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBpbnZhbGlkSW5wdXQgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRpZiAoaW52YWxpZElucHV0Lmxlbmd0aCkge1xuXHRcdFx0XHQoPEhUTUxJbnB1dEVsZW1lbnQ+aW52YWxpZElucHV0WzBdKS5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2lzc3VlLXRpdGxlJywgJ2lucHV0JywgXyA9PiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVJbnB1dCgnaXNzdWUtdGl0bGUnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2Rlc2NyaXB0aW9uJywgJ2lucHV0JywgXyA9PiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVJbnB1dCgnZGVzY3JpcHRpb24nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2lzc3VlLXNvdXJjZScsICdjaGFuZ2UnLCBfID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdpc3N1ZS1zb3VyY2UnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZmlsZU9uRXh0ZW5zaW9uKCkpIHtcblx0XHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdleHRlbnNpb24tc2VsZWN0b3InLCAnY2hhbmdlJywgXyA9PiB7XG5cdFx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdleHRlbnNpb24tc2VsZWN0b3InKTtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlSW5wdXQoJ2Rlc2NyaXB0aW9uJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5oYXNCZWVuU3VibWl0dGVkID0gdHJ1ZTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGlzc3VlVGl0bGUgPSAoPEhUTUxJbnB1dEVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdGl0bGUnKSkudmFsdWU7XG5cdFx0Y29uc3QgaXNzdWVCb2R5ID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuc2VyaWFsaXplKCk7XG5cblx0XHRsZXQgaXNzdWVVcmwgPSBwcml2YXRlVXJpID8gdGhpcy5nZXRQcml2YXRlSXNzdWVVcmwoKSA6IHRoaXMuZ2V0SXNzdWVVcmwoKTtcblx0XHRpZiAoIWlzc3VlVXJsICYmIHNlbGVjdGVkRXh0ZW5zaW9uPy51cmkpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUoc2VsZWN0ZWRFeHRlbnNpb24udXJpKTtcblx0XHRcdGlzc3VlVXJsID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0fSBlbHNlIGlmICghaXNzdWVVcmwpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYE5vICR7cHJpdmF0ZVVyaSA/ICdwcml2YXRlICcgOiAnJ31pc3N1ZSB1cmwgZm91bmRgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBnaXRIdWJEZXRhaWxzID0gdGhpcy5wYXJzZUdpdEh1YlVybChpc3N1ZVVybCk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBiYXNlVXJsID0gdGhpcy5nZXRJc3N1ZVVybFdpdGhUaXRsZSgoPEhUTUxJbnB1dEVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdGl0bGUnKSkudmFsdWUsIGlzc3VlVXJsKTtcblx0XHRsZXQgdXJsID0gYmFzZVVybCArIGAmYm9keT0ke2VuY29kZVVSSUNvbXBvbmVudChpc3N1ZUJvZHkpfWA7XG5cblx0XHR1cmwgPSB0aGlzLmFkZFRlbXBsYXRlVG9VcmwodXJsLCBnaXRIdWJEZXRhaWxzPy5vd25lciwgZ2l0SHViRGV0YWlscz8ucmVwb3NpdG9yeU5hbWUpO1xuXG5cdFx0aWYgKHRoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbiAmJiBnaXRIdWJEZXRhaWxzICYmIHNob3VsZENyZWF0ZSkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuc3VibWl0VG9HaXRIdWIoaXNzdWVUaXRsZSwgaXNzdWVCb2R5LCBnaXRIdWJEZXRhaWxzKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHVybC5sZW5ndGggPiBNQVhfVVJMX0xFTkdUSCB8fCBpc3N1ZUJvZHkubGVuZ3RoID4gTUFYX0dJVEhVQl9BUElfTEVOR1RIKSB7XG5cdFx0XHRcdHVybCA9IGF3YWl0IHRoaXMud3JpdGVUb0NsaXBib2FyZChiYXNlVXJsLCBpc3N1ZUJvZHkpO1xuXHRcdFx0XHR1cmwgPSB0aGlzLmFkZFRlbXBsYXRlVG9VcmwodXJsLCBnaXRIdWJEZXRhaWxzPy5vd25lciwgZ2l0SHViRGV0YWlscz8ucmVwb3NpdG9yeU5hbWUpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKF8pIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1dyaXRpbmcgdG8gY2xpcGJvYXJkIGZhaWxlZCcpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVybCwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgd3JpdGVUb0NsaXBib2FyZChiYXNlVXJsOiBzdHJpbmcsIGlzc3VlQm9keTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzaG91bGRXcml0ZSA9IGF3YWl0IHRoaXMuaXNzdWVGb3JtU2VydmljZS5zaG93Q2xpcGJvYXJkRGlhbG9nKCk7XG5cdFx0aWYgKCFzaG91bGRXcml0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5uYXRpdmVIb3N0U2VydmljZS53cml0ZUNsaXBib2FyZFRleHQoaXNzdWVCb2R5KTtcblxuXHRcdHJldHVybiBiYXNlVXJsICsgYCZib2R5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KGxvY2FsaXplKCdwYXN0ZURhdGEnLCBcIldlIGhhdmUgd3JpdHRlbiB0aGUgbmVlZGVkIGRhdGEgaW50byB5b3VyIGNsaXBib2FyZCBiZWNhdXNlIGl0IHdhcyB0b28gbGFyZ2UgdG8gc2VuZC4gUGxlYXNlIHBhc3RlLlwiKSl9YDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3lzdGVtSW5mbyhzdGF0ZTogSXNzdWVSZXBvcnRlck1vZGVsRGF0YSkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYmxvY2stc3lzdGVtIC5ibG9jay1pbmZvJyk7XG5cblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRjb25zdCBzeXN0ZW1JbmZvID0gc3RhdGUuc3lzdGVtSW5mbyE7XG5cdFx0XHRjb25zdCByZW5kZXJlZERhdGFUYWJsZSA9ICQoJ3RhYmxlJywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ0NQVXMnKSxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgc3lzdGVtSW5mby5jcHVzIHx8ICcnKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ0dQVSBTdGF0dXMnIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIE9iamVjdC5rZXlzKHN5c3RlbUluZm8uZ3B1U3RhdHVzKS5tYXAoa2V5ID0+IGAke2tleX06ICR7c3lzdGVtSW5mby5ncHVTdGF0dXNba2V5XX1gKS5qb2luKCdcXG4nKSlcblx0XHRcdFx0KSxcblx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdMb2FkIChhdmcpJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCBzeXN0ZW1JbmZvLmxvYWQgfHwgJycpXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnTWVtb3J5IChTeXN0ZW0pJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCBzeXN0ZW1JbmZvLm1lbW9yeSlcblx0XHRcdFx0KSxcblx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdQcm9jZXNzIEFyZ3YnIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHN5c3RlbUluZm8ucHJvY2Vzc0FyZ3MpXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnU2NyZWVuIFJlYWRlcicgYXMgc3RyaW5nKSxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgc3lzdGVtSW5mby5zY3JlZW5SZWFkZXIpXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnVk0nKSxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgc3lzdGVtSW5mby52bUhpbnQpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0XHRyZXNldCh0YXJnZXQsIHJlbmRlcmVkRGF0YVRhYmxlKTtcblxuXHRcdFx0c3lzdGVtSW5mby5yZW1vdGVEYXRhLmZvckVhY2gocmVtb3RlID0+IHtcblx0XHRcdFx0dGFyZ2V0LmFwcGVuZENoaWxkKCQ8SFRNTEhSRWxlbWVudD4oJ2hyJykpO1xuXHRcdFx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IocmVtb3RlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlbW90ZURhdGFUYWJsZSA9ICQoJ3RhYmxlJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnUmVtb3RlJyksXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCByZW1vdGUuaG9zdE5hbWUpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnJyksXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCByZW1vdGUuZXJyb3JNZXNzYWdlKVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0dGFyZ2V0LmFwcGVuZENoaWxkKHJlbW90ZURhdGFUYWJsZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVtb3RlRGF0YVRhYmxlID0gJCgndGFibGUnLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdSZW1vdGUnKSxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHJlbW90ZS5sYXRlbmN5ID8gYCR7cmVtb3RlLmhvc3ROYW1lfSAobGF0ZW5jeTogJHtyZW1vdGUubGF0ZW5jeS5jdXJyZW50LnRvRml4ZWQoMil9bXMgbGFzdCwgJHtyZW1vdGUubGF0ZW5jeS5hdmVyYWdlLnRvRml4ZWQoMil9bXMgYXZlcmFnZSlgIDogcmVtb3RlLmhvc3ROYW1lKVxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ09TJyksXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCByZW1vdGUubWFjaGluZUluZm8ub3MpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnQ1BVcycpLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgcmVtb3RlLm1hY2hpbmVJbmZvLmNwdXMgfHwgJycpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnTWVtb3J5IChTeXN0ZW0pJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgcmVtb3RlLm1hY2hpbmVJbmZvLm1lbW9yeSlcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdWTScpLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgcmVtb3RlLm1hY2hpbmVJbmZvLnZtSGludClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRhcmdldC5hcHBlbmRDaGlsZChyZW1vdGVEYXRhVGFibGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVJlc3RyaWN0ZWRNb2RlKHJlc3RyaWN0ZWRNb2RlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgcmVzdHJpY3RlZE1vZGUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUluc3RhbGxhdGlvblB1cmVNb2RlKGlzSW5zdGFsbGF0aW9uUHVyZTogYm9vbGVhbikge1xuXHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IGlzSW5zdGFsbGF0aW9uUHVyZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXhwZXJpbWVudHNJbmZvKGV4cGVyaW1lbnRJbmZvOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBleHBlcmltZW50SW5mbyB9KTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmJsb2NrLWV4cGVyaW1lbnRzIC5ibG9jay1pbmZvJyk7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0dGFyZ2V0LnRleHRDb250ZW50ID0gZXhwZXJpbWVudEluZm8gPyBleHBlcmltZW50SW5mbyA6IGxvY2FsaXplKCdub0N1cnJlbnRFeHBlcmltZW50cycsIFwiTm8gY3VycmVudCBleHBlcmltZW50cy5cIik7XG5cdFx0fVxuXHR9XG59XG4i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
