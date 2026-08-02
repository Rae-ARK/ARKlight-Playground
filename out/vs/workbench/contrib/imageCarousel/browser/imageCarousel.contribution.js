import "./media/imageCarousel.css";
import { localize, localize2 } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ImageCarouselEditor } from "./imageCarouselEditor.js";
import { ImageCarouselEditorInput } from "./imageCarouselEditorInput.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ExplorerFolderContext } from "../../files/common/files.js";
import { IExplorerService } from "../../files/browser/files.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { getMediaMime } from "../../../../base/common/mime.js";
import { URI } from "../../../../base/common/uri.js";
import { basename, dirname, extname } from "../../../../base/common/resources.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "imageCarousel",
  title: localize("imageCarouselConfigurationTitle", "Images Preview"),
  type: "object",
  properties: {
    "imageCarousel.explorerContextMenu.enabled": {
      type: "boolean",
      default: true,
      markdownDescription: localize("imageCarousel.explorerContextMenu.enabled", "Controls whether the **Open in Images Preview** option appears in the Explorer context menu."),
      tags: ["experimental"]
    },
    "imageCarousel.chat.enabled": {
      type: "boolean",
      default: true,
      description: localize("imageCarousel.chat.enabled", "Controls whether clicking an image attachment in chat opens the Images Preview viewer.")
    }
  }
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ImageCarouselEditor,
    ImageCarouselEditor.ID,
    localize("imageCarouselEditor", "Images Preview")
  ),
  [
    new SyncDescriptor(ImageCarouselEditorInput)
  ]
);
class ImageCarouselEditorInputSerializer {
  canSerialize() {
    return false;
  }
  serialize() {
    return void 0;
  }
  deserialize() {
    return void 0;
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ImageCarouselEditorInput.ID, ImageCarouselEditorInputSerializer);
function isCollectionArgs(args) {
  return typeof args === "object" && args !== null && typeof args.collection === "object" && typeof args.startIndex === "number";
}
function isSingleImageArgs(args) {
  return typeof args === "object" && args !== null && typeof args.name === "string" && typeof args.mimeType === "string" && args.data instanceof Uint8Array;
}
class OpenImageInCarouselAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.openImageInCarousel",
      title: localize2("openImageInCarousel", "Open in Images Preview"),
      f1: false
    });
  }
  async run(accessor, args) {
    const editorService = accessor.get(IEditorService);
    let collection;
    let startIndex;
    if (isCollectionArgs(args)) {
      collection = args.collection;
      startIndex = args.startIndex;
    } else if (isSingleImageArgs(args)) {
      collection = {
        id: generateUuid(),
        title: args.title ?? localize("imageCarousel.title", "Images Preview"),
        sections: [{
          title: "",
          images: [{
            id: generateUuid(),
            name: args.name,
            mimeType: args.mimeType,
            data: VSBuffer.wrap(args.data)
          }]
        }]
      };
      startIndex = 0;
    } else {
      return;
    }
    const input = new ImageCarouselEditorInput(collection, startIndex);
    await editorService.openEditor(input, { pinned: true });
  }
}
registerAction2(OpenImageInCarouselAction);
const MEDIA_EXTENSION_REGEX = /^\.(png|jpg|jpeg|jpe|gif|webp|svg|bmp|ico|mp4|webm|mov)$/i;
function isMediaResource(uri) {
  return MEDIA_EXTENSION_REGEX.test(extname(uri));
}
async function collectImageFilesFromFolder(fileService, folderUri) {
  const stat = await fileService.resolve(folderUri);
  const imageUris = [];
  if (stat.children) {
    for (const child of stat.children) {
      if (child.isFile && isMediaResource(child.resource)) {
        imageUris.push(child.resource);
      }
    }
  }
  imageUris.sort((a, b) => basename(a).localeCompare(basename(b)));
  return imageUris;
}
function createImageEntries(uris) {
  return uris.map((uri) => ({
    id: generateUuid(),
    name: basename(uri),
    mimeType: getMediaMime(uri.path) ?? "image/png",
    uri
  }));
}
class OpenImagesInCarouselFromExplorerAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openImagesInCarousel",
      title: localize2("openImagesInCarousel", "Open in Images Preview"),
      f1: false,
      menu: [{
        id: MenuId.ExplorerContext,
        group: "navigation",
        order: 25,
        when: ContextKeyExpr.and(
          ContextKeyExpr.has("config.imageCarousel.explorerContextMenu.enabled"),
          ContextKeyExpr.or(
            ExplorerFolderContext,
            ContextKeyExpr.regex(ResourceContextKey.Extension.key, MEDIA_EXTENSION_REGEX)
          )
        )
      }]
    });
  }
  async run(accessor, resource) {
    const explorerService = accessor.get(IExplorerService);
    const fileService = accessor.get(IFileService);
    const editorService = accessor.get(IEditorService);
    const notificationService = accessor.get(INotificationService);
    const contextService = accessor.get(IWorkspaceContextService);
    const context = explorerService.getContext(true);
    let imageUris = [];
    let startUri;
    try {
      if (context.length === 0) {
        let folderUri;
        if (URI.isUri(resource)) {
          folderUri = resource;
        } else {
          const folders = contextService.getWorkspace().folders;
          if (folders.length > 0) {
            folderUri = folders[0].uri;
          }
        }
        if (folderUri) {
          imageUris = await collectImageFilesFromFolder(fileService, folderUri);
        }
      } else {
        const hasSingleImageFile = context.length === 1 && !context[0].isDirectory && isMediaResource(context[0].resource);
        if (hasSingleImageFile) {
          startUri = context[0].resource;
          const parentUri = dirname(context[0].resource);
          imageUris = await collectImageFilesFromFolder(fileService, parentUri);
        } else {
          const seen = new ResourceSet();
          for (const item of context) {
            if (item.isDirectory) {
              const folderImages = await collectImageFilesFromFolder(fileService, item.resource);
              for (const uri of folderImages) {
                if (!seen.has(uri)) {
                  seen.add(uri);
                  imageUris.push(uri);
                }
              }
            } else if (isMediaResource(item.resource)) {
              if (!seen.has(item.resource)) {
                seen.add(item.resource);
                imageUris.push(item.resource);
                if (!startUri) {
                  startUri = item.resource;
                }
              }
            }
          }
        }
      }
    } catch {
      notificationService.error(localize("folderReadError", "Could not read folder contents."));
      return;
    }
    if (imageUris.length === 0) {
      notificationService.info(localize("noImagesFound", "No images found in this folder."));
      return;
    }
    const images = createImageEntries(imageUris);
    let startIndex = 0;
    if (startUri) {
      const idx = images.findIndex((img) => img.uri?.toString() === startUri.toString());
      if (idx >= 0) {
        startIndex = idx;
      }
    }
    const collection = {
      id: generateUuid(),
      title: localize("imageCarousel.explorerTitle", "Images Preview"),
      sections: [{
        title: "",
        images
      }]
    };
    const input = new ImageCarouselEditorInput(collection, startIndex);
    await editorService.openEditor(input, { pinned: true });
  }
}
registerAction2(OpenImagesInCarouselFromExplorerAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ltYWdlQ2Fyb3VzZWwvYnJvd3Nlci9pbWFnZUNhcm91c2VsLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9pbWFnZUNhcm91c2VsLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBJRWRpdG9yU2VyaWFsaXplciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJbWFnZUNhcm91c2VsRWRpdG9yIH0gZnJvbSAnLi9pbWFnZUNhcm91c2VsRWRpdG9yLmpzJztcbmltcG9ydCB7IEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dCB9IGZyb20gJy4vaW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElDYXJvdXNlbEltYWdlLCBJSW1hZ2VDYXJvdXNlbENvbGxlY3Rpb24gfSBmcm9tICcuL2ltYWdlQ2Fyb3VzZWxUeXBlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRm9sZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvYnJvd3Nlci9maWxlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGdldE1lZGlhTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5cbi8vIC0tLSBDb25maWd1cmF0aW9uIC0tLVxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ2ltYWdlQ2Fyb3VzZWwnLFxuXHR0aXRsZTogbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWxDb25maWd1cmF0aW9uVGl0bGUnLCBcIkltYWdlcyBQcmV2aWV3XCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCdpbWFnZUNhcm91c2VsLmV4cGxvcmVyQ29udGV4dE1lbnUuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5leHBsb3JlckNvbnRleHRNZW51LmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlICoqT3BlbiBpbiBJbWFnZXMgUHJldmlldyoqIG9wdGlvbiBhcHBlYXJzIGluIHRoZSBFeHBsb3JlciBjb250ZXh0IG1lbnUuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdCdpbWFnZUNhcm91c2VsLmNoYXQuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwuY2hhdC5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIGNsaWNraW5nIGFuIGltYWdlIGF0dGFjaG1lbnQgaW4gY2hhdCBvcGVucyB0aGUgSW1hZ2VzIFByZXZpZXcgdmlld2VyLlwiKSxcblx0XHR9LFxuXHR9XG59KTtcblxuLy8gLS0tIEVkaXRvciBQYW5lIFJlZ2lzdHJhdGlvbiAtLS1cblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRJbWFnZUNhcm91c2VsRWRpdG9yLFxuXHRcdEltYWdlQ2Fyb3VzZWxFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWxFZGl0b3InLCBcIkltYWdlcyBQcmV2aWV3XCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG4vLyAtLS0gU2VyaWFsaXplciAtLS1cblxuY2xhc3MgSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHNlcmlhbGl6ZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZSgpOiBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KVxuXHQucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dC5JRCwgSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0U2VyaWFsaXplcik7XG5cbi8vIC0tLSBBcmdzIFR5cGVzIC0tLVxuXG5pbnRlcmZhY2UgSU9wZW5DYXJvdXNlbENvbGxlY3Rpb25BcmdzIHtcblx0cmVhZG9ubHkgY29sbGVjdGlvbjogSUltYWdlQ2Fyb3VzZWxDb2xsZWN0aW9uO1xuXHRyZWFkb25seSBzdGFydEluZGV4OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJT3BlbkNhcm91c2VsU2luZ2xlSW1hZ2VBcmdzIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBtaW1lVHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBkYXRhOiBVaW50OEFycmF5O1xuXHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gaXNDb2xsZWN0aW9uQXJncyhhcmdzOiB1bmtub3duKTogYXJncyBpcyBJT3BlbkNhcm91c2VsQ29sbGVjdGlvbkFyZ3Mge1xuXHRyZXR1cm4gdHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnICYmIGFyZ3MgIT09IG51bGxcblx0XHQmJiB0eXBlb2YgKGFyZ3MgYXMgSU9wZW5DYXJvdXNlbENvbGxlY3Rpb25BcmdzKS5jb2xsZWN0aW9uID09PSAnb2JqZWN0J1xuXHRcdCYmIHR5cGVvZiAoYXJncyBhcyBJT3BlbkNhcm91c2VsQ29sbGVjdGlvbkFyZ3MpLnN0YXJ0SW5kZXggPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc1NpbmdsZUltYWdlQXJncyhhcmdzOiB1bmtub3duKTogYXJncyBpcyBJT3BlbkNhcm91c2VsU2luZ2xlSW1hZ2VBcmdzIHtcblx0cmV0dXJuIHR5cGVvZiBhcmdzID09PSAnb2JqZWN0JyAmJiBhcmdzICE9PSBudWxsXG5cdFx0JiYgdHlwZW9mIChhcmdzIGFzIElPcGVuQ2Fyb3VzZWxTaW5nbGVJbWFnZUFyZ3MpLm5hbWUgPT09ICdzdHJpbmcnXG5cdFx0JiYgdHlwZW9mIChhcmdzIGFzIElPcGVuQ2Fyb3VzZWxTaW5nbGVJbWFnZUFyZ3MpLm1pbWVUeXBlID09PSAnc3RyaW5nJ1xuXHRcdCYmIChhcmdzIGFzIElPcGVuQ2Fyb3VzZWxTaW5nbGVJbWFnZUFyZ3MpLmRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5O1xufVxuXG4vLyAtLS0gQWN0aW9ucyAtLS1cblxuY2xhc3MgT3BlbkltYWdlSW5DYXJvdXNlbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuSW1hZ2VJbkNhcm91c2VsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5JbWFnZUluQ2Fyb3VzZWwnLCBcIk9wZW4gaW4gSW1hZ2VzIFByZXZpZXdcIiksXG5cdFx0XHRmMTogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGxldCBjb2xsZWN0aW9uOiBJSW1hZ2VDYXJvdXNlbENvbGxlY3Rpb247XG5cdFx0bGV0IHN0YXJ0SW5kZXg6IG51bWJlcjtcblxuXHRcdGlmIChpc0NvbGxlY3Rpb25BcmdzKGFyZ3MpKSB7XG5cdFx0XHRjb2xsZWN0aW9uID0gYXJncy5jb2xsZWN0aW9uO1xuXHRcdFx0c3RhcnRJbmRleCA9IGFyZ3Muc3RhcnRJbmRleDtcblx0XHR9IGVsc2UgaWYgKGlzU2luZ2xlSW1hZ2VBcmdzKGFyZ3MpKSB7XG5cdFx0XHRjb2xsZWN0aW9uID0ge1xuXHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdHRpdGxlOiBhcmdzLnRpdGxlID8/IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLnRpdGxlJywgXCJJbWFnZXMgUHJldmlld1wiKSxcblx0XHRcdFx0c2VjdGlvbnM6IFt7XG5cdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdGltYWdlczogW3tcblx0XHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRcdG5hbWU6IGFyZ3MubmFtZSxcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBhcmdzLm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChhcmdzLmRhdGEpLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cdFx0XHRzdGFydEluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0ID0gbmV3IEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dChjb2xsZWN0aW9uLCBzdGFydEluZGV4KTtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuSW1hZ2VJbkNhcm91c2VsQWN0aW9uKTtcblxuLy8gLS0tIEV4cGxvcmVyIENvbnRleHQgTWVudSBJbnRlZ3JhdGlvbiAtLS1cblxuLyoqIFN1cHBvcnRlZCBtZWRpYSAoaW1hZ2UgKyB2aWRlbykgZXh0ZW5zaW9ucyBmb3IgdGhlIGNhcm91c2VsIGV4cGxvcmVyIGNvbnRleHQgbWVudS4gKi9cbmNvbnN0IE1FRElBX0VYVEVOU0lPTl9SRUdFWCA9IC9eXFwuKHBuZ3xqcGd8anBlZ3xqcGV8Z2lmfHdlYnB8c3ZnfGJtcHxpY298bXA0fHdlYm18bW92KSQvaTtcblxuZnVuY3Rpb24gaXNNZWRpYVJlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdHJldHVybiBNRURJQV9FWFRFTlNJT05fUkVHRVgudGVzdChleHRuYW1lKHVyaSkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjb2xsZWN0SW1hZ2VGaWxlc0Zyb21Gb2xkZXIoZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgZm9sZGVyVXJpOiBVUkkpOiBQcm9taXNlPFVSSVtdPiB7XG5cdGNvbnN0IHN0YXQgPSBhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGZvbGRlclVyaSk7XG5cdGNvbnN0IGltYWdlVXJpczogVVJJW10gPSBbXTtcblx0aWYgKHN0YXQuY2hpbGRyZW4pIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChjaGlsZC5pc0ZpbGUgJiYgaXNNZWRpYVJlc291cmNlKGNoaWxkLnJlc291cmNlKSkge1xuXHRcdFx0XHRpbWFnZVVyaXMucHVzaChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGltYWdlVXJpcy5zb3J0KChhLCBiKSA9PiBiYXNlbmFtZShhKS5sb2NhbGVDb21wYXJlKGJhc2VuYW1lKGIpKSk7XG5cdHJldHVybiBpbWFnZVVyaXM7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUltYWdlRW50cmllcyh1cmlzOiBVUklbXSk6IElDYXJvdXNlbEltYWdlW10ge1xuXHRyZXR1cm4gdXJpcy5tYXAodXJpID0+ICh7XG5cdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdG5hbWU6IGJhc2VuYW1lKHVyaSksXG5cdFx0bWltZVR5cGU6IGdldE1lZGlhTWltZSh1cmkucGF0aCkgPz8gJ2ltYWdlL3BuZycsXG5cdFx0dXJpLFxuXHR9KSk7XG59XG5cbmNsYXNzIE9wZW5JbWFnZXNJbkNhcm91c2VsRnJvbUV4cGxvcmVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuSW1hZ2VzSW5DYXJvdXNlbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuSW1hZ2VzSW5DYXJvdXNlbCcsIFwiT3BlbiBpbiBJbWFnZXMgUHJldmlld1wiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMjUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2NvbmZpZy5pbWFnZUNhcm91c2VsLmV4cGxvcmVyQ29udGV4dE1lbnUuZW5hYmxlZCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0RXhwbG9yZXJGb2xkZXJDb250ZXh0LFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoUmVzb3VyY2VDb250ZXh0S2V5LkV4dGVuc2lvbi5rZXksIE1FRElBX0VYVEVOU0lPTl9SRUdFWCksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZT86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gZXhwbG9yZXJTZXJ2aWNlLmdldENvbnRleHQodHJ1ZSk7XG5cblx0XHRsZXQgaW1hZ2VVcmlzOiBVUklbXSA9IFtdO1xuXHRcdGxldCBzdGFydFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChjb250ZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBFbXB0eS1zcGFjZSByaWdodC1jbGljazogdGhlIGV4cGxvcmVyIHBhc3NlcyB0aGUgd29ya3NwYWNlIHJvb3Rcblx0XHRcdFx0Ly8gYXMgdGhlIHJlc291cmNlIGFyZ3VtZW50LiBGYWxsIGJhY2sgdG8gdGhlIGZpcnN0IHdvcmtzcGFjZSBmb2xkZXJcblx0XHRcdFx0Ly8gd2hlbiBubyByZXNvdXJjZSBpcyBhdmFpbGFibGUuXG5cdFx0XHRcdGxldCBmb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRmb2xkZXJVcmkgPSByZXNvdXJjZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXJzID0gY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdFx0XHRpZiAoZm9sZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRmb2xkZXJVcmkgPSBmb2xkZXJzWzBdLnVyaTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZm9sZGVyVXJpKSB7XG5cdFx0XHRcdFx0aW1hZ2VVcmlzID0gYXdhaXQgY29sbGVjdEltYWdlRmlsZXNGcm9tRm9sZGVyKGZpbGVTZXJ2aWNlLCBmb2xkZXJVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBoYXNTaW5nbGVJbWFnZUZpbGUgPSBjb250ZXh0Lmxlbmd0aCA9PT0gMSAmJiAhY29udGV4dFswXS5pc0RpcmVjdG9yeSAmJiBpc01lZGlhUmVzb3VyY2UoY29udGV4dFswXS5yZXNvdXJjZSk7XG5cblx0XHRcdFx0aWYgKGhhc1NpbmdsZUltYWdlRmlsZSkge1xuXHRcdFx0XHRcdC8vIFNpbmdsZSBpbWFnZTogc2hvdyBhbGwgc2libGluZyBpbWFnZXMgaW4gdGhlIHNhbWUgZm9sZGVyIHdpdGhcblx0XHRcdFx0XHQvLyB0aGUgc2VsZWN0ZWQgaW1hZ2UgZm9jdXNlZFxuXHRcdFx0XHRcdHN0YXJ0VXJpID0gY29udGV4dFswXS5yZXNvdXJjZTtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnRVcmkgPSBkaXJuYW1lKGNvbnRleHRbMF0ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGltYWdlVXJpcyA9IGF3YWl0IGNvbGxlY3RJbWFnZUZpbGVzRnJvbUZvbGRlcihmaWxlU2VydmljZSwgcGFyZW50VXJpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBNdWx0aXBsZSBpdGVtcyBvciBhIGZvbGRlcjogY29sbGVjdCBpbWFnZXMgZnJvbSBzZWxlY3Rpb24sXG5cdFx0XHRcdFx0Ly8gZGVkdXBsaWNhdGluZyBpbiBjYXNlIGEgZm9sZGVyIGFuZCBpdHMgY2hpbGRyZW4gYXJlIGJvdGggc2VsZWN0ZWRcblx0XHRcdFx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNvbnRleHQpIHtcblx0XHRcdFx0XHRcdGlmIChpdGVtLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZvbGRlckltYWdlcyA9IGF3YWl0IGNvbGxlY3RJbWFnZUZpbGVzRnJvbUZvbGRlcihmaWxlU2VydmljZSwgaXRlbS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgdXJpIG9mIGZvbGRlckltYWdlcykge1xuXHRcdFx0XHRcdFx0XHRcdGlmICghc2Vlbi5oYXModXJpKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQodXJpKTtcblx0XHRcdFx0XHRcdFx0XHRcdGltYWdlVXJpcy5wdXNoKHVyaSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzTWVkaWFSZXNvdXJjZShpdGVtLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKGl0ZW0ucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoaXRlbS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdFx0aW1hZ2VVcmlzLnB1c2goaXRlbS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFzdGFydFVyaSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RhcnRVcmkgPSBpdGVtLnJlc291cmNlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZm9sZGVyUmVhZEVycm9yJywgXCJDb3VsZCBub3QgcmVhZCBmb2xkZXIgY29udGVudHMuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW1hZ2VVcmlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdub0ltYWdlc0ZvdW5kJywgXCJObyBpbWFnZXMgZm91bmQgaW4gdGhpcyBmb2xkZXIuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbWFnZXMgPSBjcmVhdGVJbWFnZUVudHJpZXMoaW1hZ2VVcmlzKTtcblxuXHRcdGxldCBzdGFydEluZGV4ID0gMDtcblx0XHRpZiAoc3RhcnRVcmkpIHtcblx0XHRcdGNvbnN0IGlkeCA9IGltYWdlcy5maW5kSW5kZXgoaW1nID0+IGltZy51cmk/LnRvU3RyaW5nKCkgPT09IHN0YXJ0VXJpIS50b1N0cmluZygpKTtcblx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRzdGFydEluZGV4ID0gaWR4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbGxlY3Rpb246IElJbWFnZUNhcm91c2VsQ29sbGVjdGlvbiA9IHtcblx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5leHBsb3JlclRpdGxlJywgXCJJbWFnZXMgUHJldmlld1wiKSxcblx0XHRcdHNlY3Rpb25zOiBbe1xuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdGltYWdlcyxcblx0XHRcdH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBpbnB1dCA9IG5ldyBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQoY29sbGVjdGlvbiwgc3RhcnRJbmRleCk7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoT3BlbkltYWdlc0luQ2Fyb3VzZWxGcm9tRXhwbG9yZXJBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaUQ7QUFDMUQsU0FBUyx3QkFBbUU7QUFDNUUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsU0FBUyxlQUFlO0FBQzNDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsY0FBYywrQkFBdUQ7QUFJOUUsU0FBUyxHQUEyQix3QkFBd0IsYUFBYSxFQUFFLHNCQUFzQjtBQUFBLEVBQ2hHLElBQUk7QUFBQSxFQUNKLE9BQU8sU0FBUyxtQ0FBbUMsZ0JBQWdCO0FBQUEsRUFDbkUsTUFBTTtBQUFBLEVBQ04sWUFBWTtBQUFBLElBQ1gsNkNBQTZDO0FBQUEsTUFDNUMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMsNkNBQTZDLDhGQUE4RjtBQUFBLE1BQ3pLLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLDhCQUE4QjtBQUFBLE1BQzdCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxN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
