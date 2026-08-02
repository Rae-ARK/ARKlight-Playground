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
import { localize } from "../../../../nls.js";
import { dirname, basename } from "../../../../base/common/resources.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { PerfviewContrib } from "../browser/perfviewEditor.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { URI } from "../../../../base/common/uri.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
let StartupProfiler = class {
  constructor(_dialogService, _environmentService, _textModelResolverService, _clipboardService, lifecycleService, extensionService, _openerService, _nativeHostService, _productService, _fileService, _labelService) {
    this._dialogService = _dialogService;
    this._environmentService = _environmentService;
    this._textModelResolverService = _textModelResolverService;
    this._clipboardService = _clipboardService;
    this._openerService = _openerService;
    this._nativeHostService = _nativeHostService;
    this._productService = _productService;
    this._fileService = _fileService;
    this._labelService = _labelService;
    Promise.all([
      lifecycleService.when(LifecyclePhase.Eventually),
      extensionService.whenInstalledExtensionsRegistered()
    ]).then(() => {
      this._stopProfiling();
    });
  }
  _stopProfiling() {
    if (!this._environmentService.args["prof-startup-prefix"]) {
      return;
    }
    const profileFilenamePrefix = URI.file(this._environmentService.args["prof-startup-prefix"]);
    const dir = dirname(profileFilenamePrefix);
    const prefix = basename(profileFilenamePrefix);
    const removeArgs = ["--prof-startup"];
    const markerFile = this._fileService.readFile(profileFilenamePrefix).then((value) => removeArgs.push(...value.toString().split("|"))).then(() => this._fileService.del(profileFilenamePrefix, { recursive: true })).then(() => new Promise((resolve) => {
      const check = () => {
        this._fileService.exists(profileFilenamePrefix).then((exists) => {
          if (exists) {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        });
      };
      check();
    })).then(() => this._fileService.del(profileFilenamePrefix, { recursive: true }));
    markerFile.then(() => {
      return this._fileService.resolve(dir).then((stat) => {
        return (stat.children ? stat.children.filter((value) => value.resource.path.includes(prefix)) : []).map((stat2) => stat2.resource);
      });
    }).then((files) => {
      const profileFiles = files.reduce((prev, cur) => `${prev}${this._labelService.getUriLabel(cur)}
`, "\n");
      return this._dialogService.confirm({
        type: "info",
        message: localize("prof.message", "Successfully created profiles."),
        detail: localize("prof.detail", "Please create an issue and manually attach the following files:\n{0}", profileFiles),
        primaryButton: localize({ key: "prof.restartAndFileIssue", comment: ["&& denotes a mnemonic"] }, "&&Create Issue and Restart"),
        cancelButton: localize("prof.restart", "Restart")
      }).then((res) => {
        if (res.confirmed) {
          Promise.all([
            this._nativeHostService.showItemInFolder(files[0].fsPath),
            this._createPerfIssue(files.map((file) => basename(file)))
          ]).then(() => {
            return this._dialogService.confirm({
              type: "info",
              message: localize("prof.thanks", "Thanks for helping us."),
              detail: localize("prof.detail.restart", "A final restart is required to continue to use '{0}'. Again, thank you for your contribution.", this._productService.nameLong),
              primaryButton: localize({ key: "prof.restart.button", comment: ["&& denotes a mnemonic"] }, "&&Restart")
            }).then((res2) => {
              if (res2.confirmed) {
                this._nativeHostService.relaunch({ removeArgs });
              }
            });
          });
        } else {
          this._nativeHostService.relaunch({ removeArgs });
        }
      });
    });
  }
  async _createPerfIssue(files) {
    const reportIssueUrl = this._productService.reportIssueUrl;
    if (!reportIssueUrl) {
      return;
    }
    const contrib = PerfviewContrib.get();
    const ref = await this._textModelResolverService.createModelReference(contrib.getInputUri());
    try {
      await this._clipboardService.writeText(ref.object.textEditorModel.getValue());
    } finally {
      ref.dispose();
    }
    const body = `
1. :warning: We have copied additional data to your clipboard. Make sure to **paste** here. :warning:
1. :warning: Make sure to **attach** these files from your *home*-directory: :warning:
${files.map((file) => `-\`${file}\``).join("\n")}
`;
    const baseUrl = reportIssueUrl;
    const queryStringPrefix = baseUrl.indexOf("?") === -1 ? "?" : "&";
    this._openerService.open(URI.parse(`${baseUrl}${queryStringPrefix}body=${encodeURIComponent(body)}`));
  }
};
StartupProfiler = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, INativeWorkbenchEnvironmentService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, ILifecycleService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, INativeHostService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IFileService),
  __decorateParam(10, ILabelService)
], StartupProfiler);
export {
  StartupProfiler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3BlcmZvcm1hbmNlL2VsZWN0cm9uLWJyb3dzZXIvc3RhcnR1cFByb2ZpbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBQZXJmdmlld0NvbnRyaWIgfSBmcm9tICcuLi9icm93c2VyL3BlcmZ2aWV3RWRpdG9yLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdGFydHVwUHJvZmlsZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIHdhaXQgZm9yIGV2ZXJ5dGhpbmcgdG8gYmUgcmVhZHlcblx0XHRQcm9taXNlLmFsbChbXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSksXG5cdFx0XHRleHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpXG5cdFx0XSkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9wUHJvZmlsaW5nKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wUHJvZmlsaW5nKCk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sncHJvZi1zdGFydHVwLXByZWZpeCddKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByb2ZpbGVGaWxlbmFtZVByZWZpeCA9IFVSSS5maWxlKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydwcm9mLXN0YXJ0dXAtcHJlZml4J10pO1xuXG5cdFx0Y29uc3QgZGlyID0gZGlybmFtZShwcm9maWxlRmlsZW5hbWVQcmVmaXgpO1xuXHRcdGNvbnN0IHByZWZpeCA9IGJhc2VuYW1lKHByb2ZpbGVGaWxlbmFtZVByZWZpeCk7XG5cblx0XHRjb25zdCByZW1vdmVBcmdzOiBzdHJpbmdbXSA9IFsnLS1wcm9mLXN0YXJ0dXAnXTtcblx0XHRjb25zdCBtYXJrZXJGaWxlID0gdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUocHJvZmlsZUZpbGVuYW1lUHJlZml4KS50aGVuKHZhbHVlID0+IHJlbW92ZUFyZ3MucHVzaCguLi52YWx1ZS50b1N0cmluZygpLnNwbGl0KCd8JykpKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHByb2ZpbGVGaWxlbmFtZVByZWZpeCwgeyByZWN1cnNpdmU6IHRydWUgfSkpIC8vICgxKSBkZWxldGUgdGhlIGZpbGUgdG8gdGVsbCB0aGUgbWFpbiBwcm9jZXNzIHRvIHN0b3AgcHJvZmlsaW5nXG5cdFx0XHQudGhlbigoKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgLy8gKDIpIHdhaXQgZm9yIG1haW4gdGhhdCByZWNyZWF0ZXMgdGhlIGZhaWwgdG8gc2lnbmFsIHByb2ZpbGluZyBoYXMgc3RvcHBlZFxuXHRcdFx0XHRjb25zdCBjaGVjayA9ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9maWxlU2VydmljZS5leGlzdHMocHJvZmlsZUZpbGVuYW1lUHJlZml4KS50aGVuKGV4aXN0cyA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNldFRpbWVvdXQoY2hlY2ssIDUwMCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNoZWNrKCk7XG5cdFx0XHR9KSlcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbChwcm9maWxlRmlsZW5hbWVQcmVmaXgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pKTsgLy8gKDMpIGZpbmFsbHkgZGVsZXRlIHRoZSBmaWxlIGFnYWluXG5cblx0XHRtYXJrZXJGaWxlLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUoZGlyKS50aGVuKHN0YXQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gKHN0YXQuY2hpbGRyZW4gPyBzdGF0LmNoaWxkcmVuLmZpbHRlcih2YWx1ZSA9PiB2YWx1ZS5yZXNvdXJjZS5wYXRoLmluY2x1ZGVzKHByZWZpeCkpIDogW10pLm1hcChzdGF0ID0+IHN0YXQucmVzb3VyY2UpO1xuXHRcdFx0fSk7XG5cdFx0fSkudGhlbihmaWxlcyA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlRmlsZXMgPSBmaWxlcy5yZWR1Y2UoKHByZXYsIGN1cikgPT4gYCR7cHJldn0ke3RoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChjdXIpfVxcbmAsICdcXG4nKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Byb2YubWVzc2FnZScsIFwiU3VjY2Vzc2Z1bGx5IGNyZWF0ZWQgcHJvZmlsZXMuXCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdwcm9mLmRldGFpbCcsIFwiUGxlYXNlIGNyZWF0ZSBhbiBpc3N1ZSBhbmQgbWFudWFsbHkgYXR0YWNoIHRoZSBmb2xsb3dpbmcgZmlsZXM6XFxuezB9XCIsIHByb2ZpbGVGaWxlcyksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAncHJvZi5yZXN0YXJ0QW5kRmlsZUlzc3VlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ3JlYXRlIElzc3VlIGFuZCBSZXN0YXJ0XCIpLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdwcm9mLnJlc3RhcnQnLCBcIlJlc3RhcnRcIilcblx0XHRcdH0pLnRoZW4ocmVzID0+IHtcblx0XHRcdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRQcm9taXNlLmFsbDxhbnk+KFtcblx0XHRcdFx0XHRcdHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLnNob3dJdGVtSW5Gb2xkZXIoZmlsZXNbMF0uZnNQYXRoKSxcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZVBlcmZJc3N1ZShmaWxlcy5tYXAoZmlsZSA9PiBiYXNlbmFtZShmaWxlKSkpXG5cdFx0XHRcdFx0XSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBrZWVwIHdpbmRvdyBzdGFibGUgdW50aWwgcmVzdGFydCBpcyBzZWxlY3RlZFxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Byb2YudGhhbmtzJywgXCJUaGFua3MgZm9yIGhlbHBpbmcgdXMuXCIpLFxuXHRcdFx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdwcm9mLmRldGFpbC5yZXN0YXJ0JywgXCJBIGZpbmFsIHJlc3RhcnQgaXMgcmVxdWlyZWQgdG8gY29udGludWUgdG8gdXNlICd7MH0nLiBBZ2FpbiwgdGhhbmsgeW91IGZvciB5b3VyIGNvbnRyaWJ1dGlvbi5cIiwgdGhpcy5fcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3Byb2YucmVzdGFydC5idXR0b24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXN0YXJ0XCIpXG5cdFx0XHRcdFx0XHR9KS50aGVuKHJlcyA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vdyB3ZSBhcmUgcmVhZHkgdG8gcmVzdGFydFxuXHRcdFx0XHRcdFx0XHRpZiAocmVzLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLnJlbGF1bmNoKHsgcmVtb3ZlQXJncyB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBzaW1wbHkgcmVzdGFydFxuXHRcdFx0XHRcdHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLnJlbGF1bmNoKHsgcmVtb3ZlQXJncyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVQZXJmSXNzdWUoZmlsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVwb3J0SXNzdWVVcmwgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5yZXBvcnRJc3N1ZVVybDtcblx0XHRpZiAoIXJlcG9ydElzc3VlVXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJpYiA9IFBlcmZ2aWV3Q29udHJpYi5nZXQoKTtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY29udHJpYi5nZXRJbnB1dFVyaSgpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keSA9IGBcbjEuIDp3YXJuaW5nOiBXZSBoYXZlIGNvcGllZCBhZGRpdGlvbmFsIGRhdGEgdG8geW91ciBjbGlwYm9hcmQuIE1ha2Ugc3VyZSB0byAqKnBhc3RlKiogaGVyZS4gOndhcm5pbmc6XG4xLiA6d2FybmluZzogTWFrZSBzdXJlIHRvICoqYXR0YWNoKiogdGhlc2UgZmlsZXMgZnJvbSB5b3VyICpob21lKi1kaXJlY3Rvcnk6IDp3YXJuaW5nOlxcbiR7ZmlsZXMubWFwKGZpbGUgPT4gYC1cXGAke2ZpbGV9XFxgYCkuam9pbignXFxuJyl9XG5gO1xuXG5cdFx0Y29uc3QgYmFzZVVybCA9IHJlcG9ydElzc3VlVXJsO1xuXHRcdGNvbnN0IHF1ZXJ5U3RyaW5nUHJlZml4ID0gYmFzZVVybC5pbmRleE9mKCc/JykgPT09IC0xID8gJz8nIDogJyYnO1xuXG5cdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShgJHtiYXNlVXJsfSR7cXVlcnlTdHJpbmdQcmVmaXh9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
