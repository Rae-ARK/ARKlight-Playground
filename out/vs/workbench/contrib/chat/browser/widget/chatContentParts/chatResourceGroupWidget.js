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
import * as dom from "../../../../../../base/browser/dom.js";
import { disposableTimeout } from "../../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { basename, extname, joinPath } from "../../../../../../base/common/resources.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../../../platform/progress/common/progress.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { REVEAL_IN_EXPLORER_COMMAND_ID } from "../../../../files/browser/fileConstants.js";
import { CHAT_ATTACHABLE_IMAGE_MIME_TYPES, getAttachableImageExtension } from "../../../common/model/chatModel.js";
import { ChatAttachmentsContentPart } from "./chatAttachmentsContentPart.js";
const IMAGE_DECODE_DELAY_MS = 100;
let ChatResourceGroupWidget = class extends Disposable {
  constructor(parts, _instantiationService, _contextMenuService, _fileService) {
    super();
    this._instantiationService = _instantiationService;
    this._contextMenuService = _contextMenuService;
    this._fileService = _fileService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    const el = dom.h(".chat-collapsible-io-resource-group", [
      dom.h(".chat-collapsible-io-resource-items@items"),
      dom.h(".chat-collapsible-io-resource-actions@actions")
    ]);
    this.domNode = el.root;
    this._fillInResourceGroup(parts, el.items, el.actions);
  }
  async _fillInResourceGroup(parts, itemsContainer, actionsContainer) {
    const entries = [];
    const deferredImageParts = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const imageMimeType = getResourceImageMimeType(part);
      if (imageMimeType) {
        if (part.base64Value) {
          entries.push({ kind: "file", id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
          deferredImageParts.push({ index: i, part, mimeType: imageMimeType });
        } else if (part.value) {
          entries.push({ kind: "image", id: generateUuid(), name: basename(part.uri), value: part.value, mimeType: imageMimeType, isURL: false, references: [{ kind: "reference", reference: part.uri }] });
        } else {
          const value = await this._fileService.readFile(part.uri).then((f) => f.value.buffer, () => void 0);
          if (!value) {
            entries.push({ kind: "file", id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
          } else {
            entries.push({ kind: "image", id: generateUuid(), name: basename(part.uri), value, mimeType: imageMimeType, isURL: false, references: [{ kind: "reference", reference: part.uri }] });
          }
        }
      } else {
        entries.push({ kind: "file", id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
      }
    }
    if (this._store.isDisposed) {
      return;
    }
    const attachments = this._register(this._instantiationService.createInstance(
      ChatAttachmentsContentPart,
      {
        variables: entries,
        limit: 5,
        contentReferences: void 0,
        domNode: void 0
      }
    ));
    attachments.contextMenuHandler = (attachment, event) => {
      const index = entries.indexOf(attachment);
      const part = parts[index];
      if (part) {
        event.preventDefault();
        event.stopPropagation();
        this._contextMenuService.showContextMenu({
          menuId: MenuId.ChatToolOutputResourceContext,
          menuActionOptions: { shouldForwardArgs: true },
          getAnchor: () => ({ x: event.pageX, y: event.pageY }),
          getActionsContext: () => ({ parts: [part] })
        });
      }
    };
    itemsContainer.appendChild(attachments.domNode);
    this._onDidChangeHeight.fire();
    const toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, MenuId.ChatToolOutputResourceToolbar, {
      menuOptions: {
        shouldForwardArgs: true
      }
    }));
    toolbar.context = { parts };
    if (deferredImageParts.length > 0) {
      this._register(disposableTimeout(() => {
        for (const { index, part, mimeType } of deferredImageParts) {
          try {
            const value = decodeBase64(part.base64Value).buffer;
            entries[index] = { kind: "image", id: generateUuid(), name: basename(part.uri), value, mimeType, isURL: false, references: [{ kind: "reference", reference: part.uri }] };
          } catch {
          }
        }
        attachments.updateVariables(entries);
        this._onDidChangeHeight.fire();
      }, IMAGE_DECODE_DELAY_MS));
    }
  }
};
ChatResourceGroupWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IFileService)
], ChatResourceGroupWidget);
function getResourceImageMimeType(part) {
  if (part.mimeType && getAttachableImageExtension(part.mimeType)) {
    return part.mimeType;
  }
  const extension = extname(part.uri).slice(1).toLowerCase();
  return CHAT_ATTACHABLE_IMAGE_MIME_TYPES[extension];
}
const _SaveResourcesAction = class _SaveResourcesAction extends Action2 {
  constructor() {
    super({
      id: _SaveResourcesAction.ID,
      title: localize2("chat.saveResources", "Save..."),
      icon: Codicon.cloudDownload,
      menu: [{
        id: MenuId.ChatToolOutputResourceToolbar,
        group: "navigation",
        order: 1
      }, {
        id: MenuId.ChatToolOutputResourceContext
      }]
    });
  }
  async run(accessor, context) {
    const fileDialog = accessor.get(IFileDialogService);
    const fileService = accessor.get(IFileService);
    const notificationService = accessor.get(INotificationService);
    const progressService = accessor.get(IProgressService);
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const commandService = accessor.get(ICommandService);
    const labelService = accessor.get(ILabelService);
    const defaultFilepath = await fileDialog.defaultFilePath();
    const savePart = async (part, isFolder, uri) => {
      const target = isFolder ? joinPath(uri, basename(part.uri)) : uri;
      try {
        if (part.kind === "data") {
          await fileService.copy(part.uri, target, true);
        } else {
          const contents = await fileService.readFile(part.uri);
          await fileService.writeFile(target, contents.value);
        }
      } catch (e) {
        notificationService.error(localize("chat.saveResources.error", "Failed to save {0}: {1}", basename(part.uri), e));
      }
    };
    const withProgress = async (thenReveal, todo) => {
      await progressService.withProgress({
        location: ProgressLocation.Notification,
        delay: 5e3,
        title: localize("chat.saveResources.progress", "Saving resources...")
      }, async (report) => {
        for (const task of todo) {
          await task();
          report.report({ increment: 1, total: todo.length });
        }
      });
      if (workspaceContextService.isInsideWorkspace(thenReveal)) {
        commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, thenReveal);
      } else {
        notificationService.info(localize("chat.saveResources.reveal", "Saved resources to {0}", labelService.getUriLabel(thenReveal)));
      }
    };
    if (context.parts.length === 1) {
      const part = context.parts[0];
      const uri = await fileDialog.pickFileToSave(joinPath(defaultFilepath, basename(part.uri)));
      if (!uri) {
        return;
      }
      await withProgress(uri, [() => savePart(part, false, uri)]);
    } else {
      const uris = await fileDialog.showOpenDialog({
        title: localize("chat.saveResources.title", "Pick folder to save resources"),
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: workspaceContextService.getWorkspace().folders[0]?.uri
      });
      if (!uris?.length) {
        return;
      }
      await withProgress(uris[0], context.parts.map((part) => () => savePart(part, true, uris[0])));
    }
  }
};
_SaveResourcesAction.ID = "chat.toolOutput.save";
let SaveResourcesAction = _SaveResourcesAction;
registerAction2(SaveResourcesAction);
export {
  ChatResourceGroupWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UmVzb3VyY2VHcm91cFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZXh0bmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBSRVZFQUxfSU5fRVhQTE9SRVJfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZUNvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDSEFUX0FUVEFDSEFCTEVfSU1BR0VfTUlNRV9UWVBFUywgZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VG9vbE91dHB1dFJlc291cmNlVG9vbGJhckNvbnRleHQge1xuXHRwYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXTtcbn1cblxuLyoqXG4gKiBEZWxheSBpbiBtaWxsaXNlY29uZHMgYmVmb3JlIGRlY29kaW5nIGJhc2U2NCBpbWFnZSBkYXRhLlxuICogVGhpcyBhdm9pZHMgZXhwZW5zaXZlIGRlY29kZSBvcGVyYXRpb25zIGR1cmluZyBzY3JvbGxpbmcuXG4gKi9cbmNvbnN0IElNQUdFX0RFQ09ERV9ERUxBWV9NUyA9IDEwMDtcblxuLyoqXG4gKiBBIHJldXNhYmxlIHdpZGdldCBmb3IgcmVuZGVyaW5nIGEgZ3JvdXAgb2YgcmVzb3VyY2UgZGF0YSBwYXJ0cyAoZmlsZXMsIGltYWdlcylcbiAqIHdpdGggYXR0YWNobWVudCBwaWxscyBhbmQgYSB0b29sYmFyIHdpdGggc2F2ZSBhY3Rpb25zLlxuICpcbiAqIFVzZWQgYnkgQ2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydCBhbmQgQ2hhdE1jcEFwcFN1YlBhcnQgKGZvciBkb3dubG9hZCByZXNvdXJjZXMpLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFJlc291cmNlR3JvdXBXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVsID0gZG9tLmgoJy5jaGF0LWNvbGxhcHNpYmxlLWlvLXJlc291cmNlLWdyb3VwJywgW1xuXHRcdFx0ZG9tLmgoJy5jaGF0LWNvbGxhcHNpYmxlLWlvLXJlc291cmNlLWl0ZW1zQGl0ZW1zJyksXG5cdFx0XHRkb20uaCgnLmNoYXQtY29sbGFwc2libGUtaW8tcmVzb3VyY2UtYWN0aW9uc0BhY3Rpb25zJyksXG5cdFx0XSk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBlbC5yb290O1xuXHRcdHRoaXMuX2ZpbGxJblJlc291cmNlR3JvdXAocGFydHMsIGVsLml0ZW1zLCBlbC5hY3Rpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbGxJblJlc291cmNlR3JvdXAocGFydHM6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0W10sIGl0ZW1zQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgYWN0aW9uc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHQvLyBGaXJzdCBwYXNzOiBjcmVhdGUgZW50cmllcyBpbW1lZGlhdGVseSwgdXNpbmcgZmlsZSBwbGFjZWhvbGRlcnMgZm9yIGJhc2U2NCBpbWFnZXNcblx0XHRjb25zdCBlbnRyaWVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRjb25zdCBkZWZlcnJlZEltYWdlUGFydHM6IHsgaW5kZXg6IG51bWJlcjsgcGFydDogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnQ7IG1pbWVUeXBlOiBzdHJpbmcgfVtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcGFydHNbaV07XG5cdFx0XHRjb25zdCBpbWFnZU1pbWVUeXBlID0gZ2V0UmVzb3VyY2VJbWFnZU1pbWVUeXBlKHBhcnQpO1xuXHRcdFx0aWYgKGltYWdlTWltZVR5cGUpIHtcblx0XHRcdFx0aWYgKHBhcnQuYmFzZTY0VmFsdWUpIHtcblx0XHRcdFx0XHQvLyBEZWZlciBiYXNlNjQgZGVjb2RlIC0gdXNlIGZpbGUgcGxhY2Vob2xkZXIgZm9yIG5vd1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6ICdmaWxlJywgaWQ6IGdlbmVyYXRlVXVpZCgpLCBuYW1lOiBiYXNlbmFtZShwYXJ0LnVyaSksIGZ1bGxOYW1lOiBwYXJ0LnVyaS5wYXRoLCB2YWx1ZTogcGFydC51cmkgfSk7XG5cdFx0XHRcdFx0ZGVmZXJyZWRJbWFnZVBhcnRzLnB1c2goeyBpbmRleDogaSwgcGFydCwgbWltZVR5cGU6IGltYWdlTWltZVR5cGUgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydC52YWx1ZSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6ICdpbWFnZScsIGlkOiBnZW5lcmF0ZVV1aWQoKSwgbmFtZTogYmFzZW5hbWUocGFydC51cmkpLCB2YWx1ZTogcGFydC52YWx1ZSwgbWltZVR5cGU6IGltYWdlTWltZVR5cGUsIGlzVVJMOiBmYWxzZSwgcmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogcGFydC51cmkgfV0gfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShwYXJ0LnVyaSkudGhlbihmID0+IGYudmFsdWUuYnVmZmVyLCAoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6ICdmaWxlJywgaWQ6IGdlbmVyYXRlVXVpZCgpLCBuYW1lOiBiYXNlbmFtZShwYXJ0LnVyaSksIGZ1bGxOYW1lOiBwYXJ0LnVyaS5wYXRoLCB2YWx1ZTogcGFydC51cmkgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6ICdpbWFnZScsIGlkOiBnZW5lcmF0ZVV1aWQoKSwgbmFtZTogYmFzZW5hbWUocGFydC51cmkpLCB2YWx1ZSwgbWltZVR5cGU6IGltYWdlTWltZVR5cGUsIGlzVVJMOiBmYWxzZSwgcmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogcGFydC51cmkgfV0gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiAnZmlsZScsIGlkOiBnZW5lcmF0ZVV1aWQoKSwgbmFtZTogYmFzZW5hbWUocGFydC51cmkpLCBmdWxsTmFtZTogcGFydC51cmkucGF0aCwgdmFsdWU6IHBhcnQudXJpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIGF0dGFjaG1lbnRzIGltbWVkaWF0ZWx5IHdpdGggcGxhY2Vob2xkZXJzXG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0e1xuXHRcdFx0XHR2YXJpYWJsZXM6IGVudHJpZXMsXG5cdFx0XHRcdGxpbWl0OiA1LFxuXHRcdFx0XHRjb250ZW50UmVmZXJlbmNlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRkb21Ob2RlOiB1bmRlZmluZWRcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdGF0dGFjaG1lbnRzLmNvbnRleHRNZW51SGFuZGxlciA9IChhdHRhY2htZW50LCBldmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBlbnRyaWVzLmluZGV4T2YoYXR0YWNobWVudCk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcGFydHNbaW5kZXhdO1xuXHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0bWVudUlkOiBNZW51SWQuQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZUNvbnRleHQsXG5cdFx0XHRcdFx0bWVudUFjdGlvbk9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7IHg6IGV2ZW50LnBhZ2VYLCB5OiBldmVudC5wYWdlWSB9KSxcblx0XHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gKHsgcGFydHM6IFtwYXJ0XSB9IHNhdGlzZmllcyBJQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXJDb250ZXh0KSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGl0ZW1zQ29udGFpbmVyLmFwcGVuZENoaWxkKGF0dGFjaG1lbnRzLmRvbU5vZGUhKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbnNDb250YWluZXIsIE1lbnVJZC5DaGF0VG9vbE91dHB1dFJlc291cmNlVG9vbGJhciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0b29sYmFyLmNvbnRleHQgPSB7IHBhcnRzIH0gc2F0aXNmaWVzIElDaGF0VG9vbE91dHB1dFJlc291cmNlVG9vbGJhckNvbnRleHQ7XG5cblx0XHQvLyBTZWNvbmQgcGFzczogZGVjb2RlIGJhc2U2NCBpbWFnZXMgYXN5bmNocm9ub3VzbHkgYW5kIHVwZGF0ZSBpbiBwbGFjZVxuXHRcdGlmIChkZWZlcnJlZEltYWdlUGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgaW5kZXgsIHBhcnQsIG1pbWVUeXBlIH0gb2YgZGVmZXJyZWRJbWFnZVBhcnRzKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gZGVjb2RlQmFzZTY0KHBhcnQuYmFzZTY0VmFsdWUhKS5idWZmZXI7XG5cdFx0XHRcdFx0XHRlbnRyaWVzW2luZGV4XSA9IHsga2luZDogJ2ltYWdlJywgaWQ6IGdlbmVyYXRlVXVpZCgpLCBuYW1lOiBiYXNlbmFtZShwYXJ0LnVyaSksIHZhbHVlLCBtaW1lVHlwZSwgaXNVUkw6IGZhbHNlLCByZWZlcmVuY2VzOiBbeyBraW5kOiAncmVmZXJlbmNlJywgcmVmZXJlbmNlOiBwYXJ0LnVyaSB9XSB9O1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gS2VlcCB0aGUgZmlsZSBwbGFjZWhvbGRlciBvbiBkZWNvZGUgZmFpbHVyZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwZGF0ZSBhdHRhY2htZW50cyBpbiBwbGFjZVxuXHRcdFx0XHRhdHRhY2htZW50cy51cGRhdGVWYXJpYWJsZXMoZW50cmllcyk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdH0sIElNQUdFX0RFQ09ERV9ERUxBWV9NUykpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRSZXNvdXJjZUltYWdlTWltZVR5cGUocGFydDogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAocGFydC5taW1lVHlwZSAmJiBnZXRBdHRhY2hhYmxlSW1hZ2VFeHRlbnNpb24ocGFydC5taW1lVHlwZSkpIHtcblx0XHRyZXR1cm4gcGFydC5taW1lVHlwZTtcblx0fVxuXG5cdGNvbnN0IGV4dGVuc2lvbiA9IGV4dG5hbWUocGFydC51cmkpLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCk7XG5cdHJldHVybiBDSEFUX0FUVEFDSEFCTEVfSU1BR0VfTUlNRV9UWVBFU1tleHRlbnNpb25dO1xufVxuXG5cbmNsYXNzIFNhdmVSZXNvdXJjZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LnRvb2xPdXRwdXQuc2F2ZSc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTYXZlUmVzb3VyY2VzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5zYXZlUmVzb3VyY2VzJywgXCJTYXZlLi4uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG91ZERvd25sb2FkLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VG9vbE91dHB1dFJlc291cmNlVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VG9vbE91dHB1dFJlc291cmNlQ29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDaGF0VG9vbE91dHB1dFJlc291cmNlVG9vbGJhckNvbnRleHQpIHtcblx0XHRjb25zdCBmaWxlRGlhbG9nID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWZhdWx0RmlsZXBhdGggPSBhd2FpdCBmaWxlRGlhbG9nLmRlZmF1bHRGaWxlUGF0aCgpO1xuXG5cdFx0Y29uc3Qgc2F2ZVBhcnQgPSBhc3luYyAocGFydDogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnQsIGlzRm9sZGVyOiBib29sZWFuLCB1cmk6IFVSSSkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gaXNGb2xkZXIgPyBqb2luUGF0aCh1cmksIGJhc2VuYW1lKHBhcnQudXJpKSkgOiB1cmk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jb3B5KHBhcnQudXJpLCB0YXJnZXQsIHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE1DUCBkb2Vzbid0IHN1cHBvcnQgc3RyZWFtaW5nIGRhdGEsIHNvIG5vIHNlbnNlIHRyeWluZ1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocGFydC51cmkpO1xuXHRcdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXQsIGNvbnRlbnRzLnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjaGF0LnNhdmVSZXNvdXJjZXMuZXJyb3InLCBcIkZhaWxlZCB0byBzYXZlIHswfTogezF9XCIsIGJhc2VuYW1lKHBhcnQudXJpKSwgZSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB3aXRoUHJvZ3Jlc3MgPSBhc3luYyAodGhlblJldmVhbDogVVJJLCB0b2RvOiAoKCkgPT4gUHJvbWlzZTx2b2lkPilbXSkgPT4ge1xuXHRcdFx0YXdhaXQgcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0ZGVsYXk6IDVfMDAwLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQuc2F2ZVJlc291cmNlcy5wcm9ncmVzcycsIFwiU2F2aW5nIHJlc291cmNlcy4uLlwiKSxcblx0XHRcdH0sIGFzeW5jIHJlcG9ydCA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0b2RvKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGFzaygpO1xuXHRcdFx0XHRcdHJlcG9ydC5yZXBvcnQoeyBpbmNyZW1lbnQ6IDEsIHRvdGFsOiB0b2RvLmxlbmd0aCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5pc0luc2lkZVdvcmtzcGFjZSh0aGVuUmV2ZWFsKSkge1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChSRVZFQUxfSU5fRVhQTE9SRVJfQ09NTUFORF9JRCwgdGhlblJldmVhbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ2NoYXQuc2F2ZVJlc291cmNlcy5yZXZlYWwnLCBcIlNhdmVkIHJlc291cmNlcyB0byB7MH1cIiwgbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHRoZW5SZXZlYWwpKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmIChjb250ZXh0LnBhcnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNvbnRleHQucGFydHNbMF07XG5cdFx0XHRjb25zdCB1cmkgPSBhd2FpdCBmaWxlRGlhbG9nLnBpY2tGaWxlVG9TYXZlKGpvaW5QYXRoKGRlZmF1bHRGaWxlcGF0aCwgYmFzZW5hbWUocGFydC51cmkpKSk7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB3aXRoUHJvZ3Jlc3ModXJpLCBbKCkgPT4gc2F2ZVBhcnQocGFydCwgZmFsc2UsIHVyaSldKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXJpcyA9IGF3YWl0IGZpbGVEaWFsb2cuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQuc2F2ZVJlc291cmNlcy50aXRsZScsIFwiUGljayBmb2xkZXIgdG8gc2F2ZSByZXNvdXJjZXNcIiksXG5cdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRVcmk6IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0/LnVyaSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXVyaXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHdpdGhQcm9ncmVzcyh1cmlzWzBdLCBjb250ZXh0LnBhcnRzLm1hcChwYXJ0ID0+ICgpID0+IHNhdmVQYXJ0KHBhcnQsIHRydWUsIHVyaXNbMF0pKSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTYXZlUmVzb3VyY2VzQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLFNBQVMsZ0JBQWdCO0FBRTVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtDQUFrQyxtQ0FBbUM7QUFFOUUsU0FBUyxrQ0FBa0M7QUFXM0MsTUFBTSx3QkFBd0I7QUFRdkIsSUFBTSwwQkFBTixjQUFzQyxXQUFXO0FBQUEsRUFLdkQsWUFDQyxPQUN3Qyx1QkFDRixxQkFDUCxjQUM5QjtBQUNELFVBQU07QUFKa0M7QUFDRjtBQUNQO0FBUGhDLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDeEUsU0FBZ0Isb0JBQW9CLEtBQUssbUJBQW1CO0FBVTNELFVBQU0sS0FBSyxJQUFJLEVBQUUsdUNBQXVDO0FBQUEsTUFDdkQsSUFBSSxFQUFFLDJDQUEyQztBQUFBLE1BQ2pELElBQUksRUFBRSwrQ0FBK0M7QUFBQSxJQUN0RCxDQUFDO0FBRUQsU0FBSyxVQUFVLEdBQUc7QUFDbEIsU0FBSyxxQkFBcUIsT0FBTyxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLE1BQWMscUJBQXFCLE9BQXFDLGdCQUE2QixrQkFBK0I7QUFFbkksVUFBTSxVQUF1QyxDQUFDO0FBQzlDLFVBQU0scUJBQThGLENBQUM7QUFFckcsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUN0QyxZQUFNLE9BQU8sTUFBTSxDQUFDO0FBQ3BCLFlBQU0sZ0JBQWdCLHlCQUF5QixJQUFJO0FBQ25ELFVBQUksZUFBZTtBQUNsQixZQUFJLEtBQUssYUFBYTtBQUVyQixrQkFBUSxLQUFLLEVBQUUsTUFBTSxRQUFRLElBQUksYUFBYSxHQUFHLE1BQU0sU0FBUyxLQUFLLEdBQUcsR0FBRyxVQUFVLEtBQUssSUFBSSxNQUFNLE9BQU8sS0FBSyxJQUFJLENBQUM7QUFDckgsNkJBQW1CLEtBQUssRUFBRSxPQUFPLEdBQUcsTUFBTSxVQUFVLGNBQWMsQ0FBQztBQUFBLFFBQ3BFLFdBQVcsS0FBSyxPQUFPO0FBQ3RCLGtCQUFRLEtBQUssRUFBRSxNQUFNLFNBQVMsSUFBSSxhQUFhLEdBQUcsTUFBTSxTQUFTLEtBQUssR0FBRyxHQUFHLE9BQU8sS0FBSyxPQUFPLFVBQVUsZUFBZSxPQUFPLE9BQU8sWUFBWSxDQUFDLEVBQUUsTUFBTSxhQUFhLFdBQVcsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQUEsUUFDak0sT0FBTztBQUNOLGdCQUFNLFFBQVEsTUFBTSxLQUFLLGFBQWEsU0FBUyxLQUFLLEdBQUcsRUFBRSxLQUFLLE9BQUssRUFBRSxNQUFNLFFBQVEsTUFBTSxNQUFTO0FBQ2xHLGNBQUksQ0FBQyxPQUFPO0FBQ1gsb0JBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxJQUFJLGFBQWEsR0FBRyxNQUFNLFNBQVMsS0FBSyxHQUFHLEdBQUcsVUFBVSxLQUFLLElBQUksTUFBTSxPQUFPLEtBQUssSUFBSSxDQUFDO0FBQUEsVUFDdEgsT0FBTztBQUNOLG9CQUFRLEtBQUssRUFBRSxNQUFNLFNBQVMsSUFBSSxhQUFhLEdBQUcsTUFBTSxTQUFTLEtBQUssR0FBRyxHQUFHLE9BQU8sVUFBVSxlQUFlLE9BQU8sT0FBTyxZQUFZLENBQUMsRUFBRSxNQUFNLGFBQWEsV0FBVyxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7QUFBQSxVQUNyTDtBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixnQkFBUSxLQUFLLEVBQUUsTUFBTSxRQUFRLElBQUksYUFBYSxHQUFHLE1BQU0sU0FBUyxLQUFLLEdBQUcsR0FBRyxVQUFVLEtBQUssSUFBSSxNQUFNLE9BQU8sS0FBSyxJQUFJLENBQUM7QUFBQSxNQUN0SDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUdBLFVBQU0sY0FBYyxLQUFLLFVBQVUsS0FBSyxzQkFBc0I7QUFBQSxNQUM3RDtBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLFFBQ25CLFNBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDO0FBRUQsZ0JBQVkscUJBQXFCLENBQUMsWUFBWSxVQUFVO0FBQ3ZELFlBQU0sUUFBUSxRQUFRLFFBQVEsVUFBVTtBQUN4QyxZQUFNLE9BQU8sTUFBTSxLQUFLO0FBQ3hCLFVBQUksTUFBTTtBQUNULGNBQU0sZUFBZTtBQUNyQixjQUFNLGdCQUFnQjtBQUV0QixhQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxVQUN4QyxRQUFRLE9BQU87QUFBQSxVQUNmLG1CQUFtQixFQUFFLG1CQUFtQixLQUFLO0FBQUEsVUFDN0MsV0FBVyxPQUFPLEVBQUUsR0FBRyxNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU07QUFBQSxVQUNuRCxtQkFBbUIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUU7QUFBQSxRQUMzQyxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxtQkFBZSxZQUFZLFlBQVksT0FBUTtBQUMvQyxTQUFLLG1CQUFtQixLQUFLO0FBRTdCLFVBQU0sVUFBVSxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSxzQkFBc0Isa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDdEosYUFBYTtBQUFBLFFBQ1osbUJBQW1CO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFlBQVEsVUFBVSxFQUFFLE1BQU07QUFHMUIsUUFBSSxtQkFBbUIsU0FBUyxHQUFHO0FBQ2xDLFdBQUssVUFBVSxrQkFBa0IsTUFBTTtBQUN0QyxtQkFBVyxFQUFFLE9BQU8sTUFBTSxTQUFTLEtBQUssb0JBQW9CO0FBQzNELGNBQUk7QUFDSCxrQkFBTSxRQUFRLGFBQWEsS0FBSyxXQUFZLEVBQUU7QUFDOUMsb0JBQVEsS0FBSyxJQUFJLEVBQUUsTUFBTSxTQUFTLElBQUksYUFBYSxHQUFHLE1BQU0sU0FBUyxLQUFLLEdBQUcsR0FBRyxPQUFPLFVBQVUsT0FBTyxPQUFPLFlBQVksQ0FBQyxFQUFFLE1BQU0sYUFBYSxXQUFXLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFBQSxVQUN6SyxRQUFRO0FBQUEsVUFFUjtBQUFBLFFBQ0Q7QUFHQSxvQkFBWSxnQkFBZ0IsT0FBTztBQUNuQyxhQUFLLG1CQUFtQixLQUFLO0FBQUEsTUFDOUIsR0FBRyxxQkFBcUIsQ0FBQztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUNEO0FBN0dhLDBCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTtBQStHYixTQUFTLHlCQUF5QixNQUFzRDtBQUN2RixNQUFJLEtBQUssWUFBWSw0QkFBNEIsS0FBSyxRQUFRLEdBQUc7QUFDaEUsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUVBLFFBQU0sWUFBWSxRQUFRLEtBQUssR0FBRyxFQUFFLE1BQU0sQ0FBQyxFQUFFLFlBQVk7QUFDekQsU0FBTyxpQ0FBaUMsU0FBUztBQUNsRDtBQUdBLE1BQU0sdUJBQU4sTUFBTSw2QkFBNEIsUUFBUTtBQUFBLEVBRXpDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLHFCQUFvQjtBQUFBLE1BQ3hCLE9BQU8sVUFBVSxzQkFBc0IsU0FBUztBQUFBLE1BQ2hELE1BQU0sUUFBUTtBQUFBLE1BQ2QsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLEdBQUc7QUFBQSxRQUNGLElBQUksT0FBTztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixTQUFnRDtBQUNyRixVQUFNLGFBQWEsU0FBUyxJQUFJLGtCQUFrQjtBQUNsRCxVQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsVUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxVQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBQ3JELFVBQU0sMEJBQTBCLFNBQVMsSUFBSSx3QkFBd0I7QUFDckUsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFVBQU0sa0JBQWtCLE1BQU0sV0FBVyxnQkFBZ0I7QUFFekQsVUFBTSxXQUFXLE9BQU8sTUFBa0MsVUFBbUIsUUFBYTtBQUN6RixZQUFNLFNBQVMsV0FBVyxTQUFTLEtBQUssU0FBUyxLQUFLLEdBQUcsQ0FBQyxJQUFJO0FBQzlELFVBQUk7QUFDSCxZQUFJLEtBQUssU0FBUyxRQUFRO0FBQ3pCLGdCQUFNLFlBQVksS0FBSyxLQUFLLEtBQUssUUFBUSxJQUFJO0FBQUEsUUFDOUMsT0FBTztBQUVOLGdCQUFNLFdBQVcsTUFBTSxZQUFZLFNBQVMsS0FBSyxHQUFHO0FBQ3BELGdCQUFNLFlBQVksVUFBVSxRQUFRLFNBQVMsS0FBSztBQUFBLFFBQ25EO0FBQUEsTUFDRCxTQUFTLEdBQUc7QUFDWCw0QkFBb0IsTUFBTSxTQUFTLDRCQUE0QiwyQkFBMkIsU0FBUyxLQUFLLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqSDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsT0FBTyxZQUFpQixTQUFrQztBQUM5RSxZQUFNLGdCQUFnQixhQUFhO0FBQUEsUUFDbEMsVUFBVSxpQkFBaUI7QUFBQSxRQUMzQixPQUFPO0FBQUEsUUFDUCxPQUFPLFNBQVMsK0JBQStCLHFCQUFxQjtBQUFBLE1BQ3JFLEdBQUcsT0FBTSxXQUFVO0FBQ2xCLG1CQUFXLFFBQVEsTUFBTTtBQUN4QixnQkFBTSxLQUFLO0FBQ1gsaUJBQU8sT0FBTyxFQUFFLFdBQVcsR0FBRyxPQUFPLEtBQUssT0FBTyxDQUFDO0FBQUEsUUFDbkQ7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLHdCQUF3QixrQkFBa0IsVUFBVSxHQUFHO0FBQzFELHVCQUFlLGVBQWUsK0JBQStCLFVBQVU7QUFBQSxNQUN4RSxPQUFPO0FBQ04sNEJBQW9CLEtBQUssU0FBUyw2QkFBNkIsMEJBQTBCLGFBQWEsWUFBWSxVQUFVLENBQUMsQ0FBQztBQUFBLE1BQy9IO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBUSxNQUFNLFdBQVcsR0FBRztBQUMvQixZQUFNLE9BQU8sUUFBUSxNQUFNLENBQUM7QUFDNUIsWUFBTSxNQUFNLE1BQU0sV0FBVyxlQUFlLFNBQVMsaUJBQWlCLFNBQVMsS0FBSyxHQUFHLENBQUMsQ0FBQztBQUN6RixVQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsTUFDRDtBQUNBLFlBQU0sYUFBYSxLQUFLLENBQUMsTUFBTSxTQUFTLE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNELE9BQU87QUFDTixZQUFNLE9BQU8sTUFBTSxXQUFXLGVBQWU7QUFBQSxRQUM1QyxPQUFPLFNBQVMsNEJBQTRCLCtCQUErQjtBQUFBLFFBQzNFLGdCQUFnQjtBQUFBLFFBQ2hCLGtCQUFrQjtBQUFBLFFBQ2xCLGVBQWU7QUFBQSxRQUNmLFlBQVksd0JBQXdCLGFBQWEsRUFBRSxRQUFRLENBQUMsR0FBRztBQUFBLE1BQ2hFLENBQUM7QUFFRCxVQUFJLENBQUMsTUFBTSxRQUFRO0FBQ2xCO0FBQUEsTUFDRDtBQUVBLFlBQU0sYUFBYSxLQUFLLENBQUMsR0FBRyxRQUFRLE1BQU0sSUFBSSxVQUFRLE1BQU0sU0FBUyxNQUFNLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDM0Y7QUFBQSxFQUNEO0FBQ0Q7QUFwRk0scUJBQ2tCLEtBQUs7QUFEN0IsSUFBTSxzQkFBTjtBQXNGQSxnQkFBZ0IsbUJBQW1COyIsCiAgIm5hbWVzIjogW10KfQo=
