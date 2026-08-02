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
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { IProductService } from "../../product/common/productService.js";
import { ExtensionGalleryResourceType, Flag, ExtensionGalleryManifestStatus } from "./extensionGalleryManifest.js";
import { FilterType, SortBy } from "./extensionManagement.js";
let ExtensionGalleryManifestService = class extends Disposable {
  constructor(productService) {
    super();
    this.productService = productService;
    this.onDidChangeExtensionGalleryManifest = Event.None;
    this.onDidChangeExtensionGalleryManifestStatus = Event.None;
  }
  get extensionGalleryManifestStatus() {
    return !!this.productService.extensionsGallery?.serviceUrl ? ExtensionGalleryManifestStatus.Available : ExtensionGalleryManifestStatus.Unavailable;
  }
  async getExtensionGalleryManifest() {
    const extensionsGallery = this.productService.extensionsGallery;
    if (!extensionsGallery?.serviceUrl) {
      return null;
    }
    const resources = [
      {
        id: `${extensionsGallery.serviceUrl}/extensionquery`,
        type: ExtensionGalleryResourceType.ExtensionQueryService
      },
      {
        id: `${extensionsGallery.serviceUrl}/vscode/{publisher}/{name}/latest`,
        type: ExtensionGalleryResourceType.ExtensionLatestVersionUri
      },
      {
        id: `${extensionsGallery.serviceUrl}/publishers/{publisher}/extensions/{name}/{version}/stats?statType={statTypeName}`,
        type: ExtensionGalleryResourceType.ExtensionStatisticsUri
      }
    ];
    if (extensionsGallery.publisherUrl) {
      resources.push({
        id: `${extensionsGallery.publisherUrl}/{publisher}`,
        type: ExtensionGalleryResourceType.PublisherViewUri
      });
    }
    if (extensionsGallery.itemUrl) {
      resources.push({
        id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}`,
        type: ExtensionGalleryResourceType.ExtensionDetailsViewUri
      });
      resources.push({
        id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}&ssr=false#review-details`,
        type: ExtensionGalleryResourceType.ExtensionRatingViewUri
      });
    }
    if (extensionsGallery.resourceUrlTemplate) {
      resources.push({
        id: extensionsGallery.resourceUrlTemplate,
        type: ExtensionGalleryResourceType.ExtensionResourceUri
      });
    }
    const filtering = [
      {
        name: FilterType.Tag,
        value: 1
      },
      {
        name: FilterType.ExtensionId,
        value: 4
      },
      {
        name: FilterType.Category,
        value: 5
      },
      {
        name: FilterType.ExtensionName,
        value: 7
      },
      {
        name: FilterType.Target,
        value: 8
      },
      {
        name: FilterType.Featured,
        value: 9
      },
      {
        name: FilterType.SearchText,
        value: 10
      },
      {
        name: FilterType.ExcludeWithFlags,
        value: 12
      }
    ];
    const sorting = [
      {
        name: SortBy.NoneOrRelevance,
        value: 0
      },
      {
        name: SortBy.LastUpdatedDate,
        value: 1
      },
      {
        name: SortBy.Title,
        value: 2
      },
      {
        name: SortBy.PublisherName,
        value: 3
      },
      {
        name: SortBy.InstallCount,
        value: 4
      },
      {
        name: SortBy.AverageRating,
        value: 6
      },
      {
        name: SortBy.PublishedDate,
        value: 10
      },
      {
        name: SortBy.WeightedRating,
        value: 12
      }
    ];
    const flags = [
      {
        name: Flag.None,
        value: 0
      },
      {
        name: Flag.IncludeVersions,
        value: 1
      },
      {
        name: Flag.IncludeFiles,
        value: 2
      },
      {
        name: Flag.IncludeCategoryAndTags,
        value: 4
      },
      {
        name: Flag.IncludeSharedAccounts,
        value: 8
      },
      {
        name: Flag.IncludeVersionProperties,
        value: 16
      },
      {
        name: Flag.ExcludeNonValidated,
        value: 32
      },
      {
        name: Flag.IncludeInstallationTargets,
        value: 64
      },
      {
        name: Flag.IncludeAssetUri,
        value: 128
      },
      {
        name: Flag.IncludeStatistics,
        value: 256
      },
      {
        name: Flag.IncludeLatestVersionOnly,
        value: 512
      },
      {
        name: Flag.Unpublished,
        value: 4096
      },
      {
        name: Flag.IncludeNameConflictInfo,
        value: 32768
      },
      {
        name: Flag.IncludeLatestPrereleaseAndStableVersionOnly,
        value: 65536
      }
    ];
    return {
      version: "",
      resources,
      capabilities: {
        extensionQuery: {
          filtering,
          sorting,
          flags
        },
        signing: {
          allPublicRepositorySigned: true
        }
      }
    };
  }
};
ExtensionGalleryManifestService = __decorateClass([
  __decorateParam(0, IProductService)
], ExtensionGalleryManifestService);
export {
  ExtensionGalleryManifestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZSwgRmxhZywgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsIEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cyB9IGZyb20gJy4vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IEZpbHRlclR5cGUsIFNvcnRCeSB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5cbnR5cGUgRXh0ZW5zaW9uR2FsbGVyeUNvbmZpZyA9IHtcblx0cmVhZG9ubHkgc2VydmljZVVybDogc3RyaW5nO1xuXHRyZWFkb25seSBpdGVtVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHB1Ymxpc2hlclVybDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZVVybFRlbXBsYXRlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvblVybFRlbXBsYXRlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbnRyb2xVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgbmxzQmFzZVVybDogc3RyaW5nO1xufTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cyA9IEV2ZW50Lk5vbmU7XG5cblx0Z2V0IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cygpOiBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMge1xuXHRcdHJldHVybiAhIXRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnk/LnNlcnZpY2VVcmwgPyBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuQXZhaWxhYmxlIDogRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlVuYXZhaWxhYmxlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpOiBQcm9taXNlPElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0dhbGxlcnkgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5IGFzIEV4dGVuc2lvbkdhbGxlcnlDb25maWcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFleHRlbnNpb25zR2FsbGVyeT8uc2VydmljZVVybCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogYCR7ZXh0ZW5zaW9uc0dhbGxlcnkuc2VydmljZVVybH0vZXh0ZW5zaW9ucXVlcnlgLFxuXHRcdFx0XHR0eXBlOiBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvblF1ZXJ5U2VydmljZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IGAke2V4dGVuc2lvbnNHYWxsZXJ5LnNlcnZpY2VVcmx9L3ZzY29kZS97cHVibGlzaGVyfS97bmFtZX0vbGF0ZXN0YCxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25MYXRlc3RWZXJzaW9uVXJpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogYCR7ZXh0ZW5zaW9uc0dhbGxlcnkuc2VydmljZVVybH0vcHVibGlzaGVycy97cHVibGlzaGVyfS9leHRlbnNpb25zL3tuYW1lfS97dmVyc2lvbn0vc3RhdHM/c3RhdFR5cGU9e3N0YXRUeXBlTmFtZX1gLFxuXHRcdFx0XHR0eXBlOiBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvblN0YXRpc3RpY3NVcmlcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGlmIChleHRlbnNpb25zR2FsbGVyeS5wdWJsaXNoZXJVcmwpIHtcblx0XHRcdHJlc291cmNlcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGAke2V4dGVuc2lvbnNHYWxsZXJ5LnB1Ymxpc2hlclVybH0ve3B1Ymxpc2hlcn1gLFxuXHRcdFx0XHR0eXBlOiBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLlB1Ymxpc2hlclZpZXdVcmlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25zR2FsbGVyeS5pdGVtVXJsKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBgJHtleHRlbnNpb25zR2FsbGVyeS5pdGVtVXJsfT9pdGVtTmFtZT17cHVibGlzaGVyfS57bmFtZX1gLFxuXHRcdFx0XHR0eXBlOiBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvbkRldGFpbHNWaWV3VXJpXG5cdFx0XHR9KTtcblx0XHRcdHJlc291cmNlcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGAke2V4dGVuc2lvbnNHYWxsZXJ5Lml0ZW1Vcmx9P2l0ZW1OYW1lPXtwdWJsaXNoZXJ9LntuYW1lfSZzc3I9ZmFsc2UjcmV2aWV3LWRldGFpbHNgLFxuXHRcdFx0XHR0eXBlOiBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvblJhdGluZ1ZpZXdVcmlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25zR2FsbGVyeS5yZXNvdXJjZVVybFRlbXBsYXRlKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zR2FsbGVyeS5yZXNvdXJjZVVybFRlbXBsYXRlLFxuXHRcdFx0XHR0eXBlOiBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvblJlc291cmNlVXJpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWx0ZXJpbmcgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZpbHRlclR5cGUuVGFnLFxuXHRcdFx0XHR2YWx1ZTogMSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZpbHRlclR5cGUuRXh0ZW5zaW9uSWQsXG5cdFx0XHRcdHZhbHVlOiA0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmlsdGVyVHlwZS5DYXRlZ29yeSxcblx0XHRcdFx0dmFsdWU6IDUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGaWx0ZXJUeXBlLkV4dGVuc2lvbk5hbWUsXG5cdFx0XHRcdHZhbHVlOiA3LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmlsdGVyVHlwZS5UYXJnZXQsXG5cdFx0XHRcdHZhbHVlOiA4LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmlsdGVyVHlwZS5GZWF0dXJlZCxcblx0XHRcdFx0dmFsdWU6IDksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGaWx0ZXJUeXBlLlNlYXJjaFRleHQsXG5cdFx0XHRcdHZhbHVlOiAxMCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZpbHRlclR5cGUuRXhjbHVkZVdpdGhGbGFncyxcblx0XHRcdFx0dmFsdWU6IDEyLFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgc29ydGluZyA9IFtcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogU29ydEJ5Lk5vbmVPclJlbGV2YW5jZSxcblx0XHRcdFx0dmFsdWU6IDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuTGFzdFVwZGF0ZWREYXRlLFxuXHRcdFx0XHR2YWx1ZTogMSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IFNvcnRCeS5UaXRsZSxcblx0XHRcdFx0dmFsdWU6IDIsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuUHVibGlzaGVyTmFtZSxcblx0XHRcdFx0dmFsdWU6IDMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuSW5zdGFsbENvdW50LFxuXHRcdFx0XHR2YWx1ZTogNCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IFNvcnRCeS5BdmVyYWdlUmF0aW5nLFxuXHRcdFx0XHR2YWx1ZTogNixcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IFNvcnRCeS5QdWJsaXNoZWREYXRlLFxuXHRcdFx0XHR2YWx1ZTogMTAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuV2VpZ2h0ZWRSYXRpbmcsXG5cdFx0XHRcdHZhbHVlOiAxMixcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZsYWdzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLk5vbmUsXG5cdFx0XHRcdHZhbHVlOiAweDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVWZXJzaW9ucyxcblx0XHRcdFx0dmFsdWU6IDB4MSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZsYWcuSW5jbHVkZUZpbGVzLFxuXHRcdFx0XHR2YWx1ZTogMHgyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlQ2F0ZWdvcnlBbmRUYWdzLFxuXHRcdFx0XHR2YWx1ZTogMHg0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlU2hhcmVkQWNjb3VudHMsXG5cdFx0XHRcdHZhbHVlOiAweDgsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVWZXJzaW9uUHJvcGVydGllcyxcblx0XHRcdFx0dmFsdWU6IDB4MTAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkV4Y2x1ZGVOb25WYWxpZGF0ZWQsXG5cdFx0XHRcdHZhbHVlOiAweDIwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlSW5zdGFsbGF0aW9uVGFyZ2V0cyxcblx0XHRcdFx0dmFsdWU6IDB4NDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVBc3NldFVyaSxcblx0XHRcdFx0dmFsdWU6IDB4ODAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVTdGF0aXN0aWNzLFxuXHRcdFx0XHR2YWx1ZTogMHgxMDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSxcblx0XHRcdFx0dmFsdWU6IDB4MjAwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5VbnB1Ymxpc2hlZCxcblx0XHRcdFx0dmFsdWU6IDB4MTAwMCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZsYWcuSW5jbHVkZU5hbWVDb25mbGljdEluZm8sXG5cdFx0XHRcdHZhbHVlOiAweDgwMDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVMYXRlc3RQcmVyZWxlYXNlQW5kU3RhYmxlVmVyc2lvbk9ubHksXG5cdFx0XHRcdHZhbHVlOiAweDEwMDAwLFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0cmVzb3VyY2VzLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdGV4dGVuc2lvblF1ZXJ5OiB7XG5cdFx0XHRcdFx0ZmlsdGVyaW5nLFxuXHRcdFx0XHRcdHNvcnRpbmcsXG5cdFx0XHRcdFx0ZmxhZ3MsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNpZ25pbmc6IHtcblx0XHRcdFx0XHRhbGxQdWJsaWNSZXBvc2l0b3J5U2ln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Q0E7QUFBQSxRQUNDLE1BQU0sT0FBTztBQUFBLFFBQ2IsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLE9BQU87QUFBQSxRQUNiLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxPQUFPO0FBQUEsUUFDYixPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sT0FBTztBQUFBLFFBQ2IsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLE9BQU87QUFBQSxRQUNiLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxPQUFPO0FBQUEsUUFDYixPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0EsY0FBYztBQUFBLFFBQ2IsZ0JBQWdCO0FBQUEsVUFDZjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsU0FBUztBQUFBLFVBQ1IsMkJBQTJCO0FBQUEsUUFDNUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQTlNYSxrQ0FBTjtBQUFBLEVBV0o7QUFBQSxHQVhVOyIsCiAgIm5hbWVzIjogW10KfQo=
