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
import { distinct } from "../../../base/common/arrays.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import * as semver from "../../../base/common/semver/semver.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { isWeb, platform } from "../../../base/common/platform.js";
import { arch } from "../../../base/common/process.js";
import { isBoolean, isNumber, isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { isOfflineError } from "../../../base/parts/request/common/request.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { getTargetPlatform, InstallOperation, isNotWebExtensionInWebTargetPlatform, isTargetPlatformCompatible, SortOrder, toTargetPlatform, WEB_EXTENSION_TAG, ExtensionGalleryError, ExtensionGalleryErrorCode, IAllowedExtensionsService, EXTENSION_IDENTIFIER_REGEX, SortBy, FilterType, ExtensionRequestsTimeoutConfigKey } from "./extensionManagement.js";
import { adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, getGalleryExtensionTelemetryData } from "./extensionManagementUtil.js";
import { TargetPlatform } from "../../extensions/common/extensions.js";
import { isEngineValid } from "../../extensions/common/extensionValidator.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { asJson, asTextOrError, IRequestService, isClientError, isServerError, isSuccess } from "../../request/common/request.js";
import { resolveMarketplaceHeaders } from "../../externalServices/common/marketplace.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { format2 } from "../../../base/common/strings.js";
import { ExtensionGalleryResourceType, Flag, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from "./extensionGalleryManifest.js";
import { TelemetryTrustedValue } from "../../telemetry/common/telemetryUtils.js";
const CURRENT_TARGET_PLATFORM = isWeb ? TargetPlatform.WEB : getTargetPlatform(platform, arch);
const SEARCH_ACTIVITY_HEADER_NAME = "X-Market-Search-Activity-Id";
const ACTIVITY_HEADER_NAME = "Activityid";
const SERVER_HEADER_NAME = "Server";
const END_END_ID_HEADER_NAME = "X-Vss-E2eid";
const AssetType = {
  Icon: "Microsoft.VisualStudio.Services.Icons.Default",
  Details: "Microsoft.VisualStudio.Services.Content.Details",
  Changelog: "Microsoft.VisualStudio.Services.Content.Changelog",
  Manifest: "Microsoft.VisualStudio.Code.Manifest",
  VSIX: "Microsoft.VisualStudio.Services.VSIXPackage",
  License: "Microsoft.VisualStudio.Services.Content.License",
  Repository: "Microsoft.VisualStudio.Services.Links.Source",
  Signature: "Microsoft.VisualStudio.Services.VsixSignature"
};
const PropertyType = {
  Dependency: "Microsoft.VisualStudio.Code.ExtensionDependencies",
  ExtensionPack: "Microsoft.VisualStudio.Code.ExtensionPack",
  Engine: "Microsoft.VisualStudio.Code.Engine",
  PreRelease: "Microsoft.VisualStudio.Code.PreRelease",
  EnabledApiProposals: "Microsoft.VisualStudio.Code.EnabledApiProposals",
  LocalizedLanguages: "Microsoft.VisualStudio.Code.LocalizedLanguages",
  WebExtension: "Microsoft.VisualStudio.Code.WebExtension",
  SponsorLink: "Microsoft.VisualStudio.Code.SponsorLink",
  SupportLink: "Microsoft.VisualStudio.Services.Links.Support",
  ExecutesCode: "Microsoft.VisualStudio.Code.ExecutesCode",
  Private: "PrivateMarketplace"
};
const DefaultPageSize = 10;
const DefaultQueryState = {
  pageNumber: 1,
  pageSize: DefaultPageSize,
  sortBy: SortBy.NoneOrRelevance,
  sortOrder: SortOrder.Default,
  flags: [],
  criteria: [],
  assetTypes: []
};
var VersionKind = /* @__PURE__ */ ((VersionKind2) => {
  VersionKind2[VersionKind2["Release"] = 0] = "Release";
  VersionKind2[VersionKind2["Prerelease"] = 1] = "Prerelease";
  VersionKind2[VersionKind2["Latest"] = 2] = "Latest";
  return VersionKind2;
})(VersionKind || {});
class Query {
  constructor(state = DefaultQueryState) {
    this.state = state;
  }
  get pageNumber() {
    return this.state.pageNumber;
  }
  get pageSize() {
    return this.state.pageSize;
  }
  get sortBy() {
    return this.state.sortBy;
  }
  get sortOrder() {
    return this.state.sortOrder;
  }
  get flags() {
    return this.state.flags;
  }
  get criteria() {
    return this.state.criteria;
  }
  get assetTypes() {
    return this.state.assetTypes;
  }
  get source() {
    return this.state.source;
  }
  get searchText() {
    const criterium = this.state.criteria.filter((criterium2) => criterium2.filterType === FilterType.SearchText)[0];
    return criterium && criterium.value ? criterium.value : "";
  }
  withPage(pageNumber, pageSize = this.state.pageSize) {
    return new Query({ ...this.state, pageNumber, pageSize });
  }
  withFilter(filterType, ...values) {
    const criteria = [
      ...this.state.criteria,
      ...values.length ? values.map((value) => ({ filterType, value })) : [{ filterType }]
    ];
    return new Query({ ...this.state, criteria });
  }
  withSortBy(sortBy) {
    return new Query({ ...this.state, sortBy });
  }
  withSortOrder(sortOrder) {
    return new Query({ ...this.state, sortOrder });
  }
  withFlags(...flags) {
    return new Query({ ...this.state, flags: distinct(flags) });
  }
  withAssetTypes(...assetTypes) {
    return new Query({ ...this.state, assetTypes });
  }
  withSource(source) {
    return new Query({ ...this.state, source });
  }
}
function getStatistic(statistics, name) {
  const result = (statistics || []).filter((s) => s.statisticName === name)[0];
  return result ? result.value : 0;
}
function getCoreTranslationAssets(version) {
  const coreTranslationAssetPrefix = "Microsoft.VisualStudio.Code.Translation.";
  const result = version.files.filter((f) => f.assetType.indexOf(coreTranslationAssetPrefix) === 0);
  return result.reduce((result2, file) => {
    const asset = getVersionAsset(version, file.assetType);
    if (asset) {
      result2.push([file.assetType.substring(coreTranslationAssetPrefix.length), asset]);
    }
    return result2;
  }, []);
}
function getRepositoryAsset(version) {
  if (version.properties) {
    const results = version.properties.filter((p) => p.key === AssetType.Repository);
    const gitRegExp = new RegExp("((git|ssh|http(s)?)|(git@[\\w.]+))(:(//)?)([\\w.@:/\\-~]+)(.git)(/)?");
    const uri = results.filter((r) => gitRegExp.test(r.value))[0];
    return uri ? { uri: uri.value, fallbackUri: uri.value } : null;
  }
  return getVersionAsset(version, AssetType.Repository);
}
function getDownloadAsset(version) {
  return {
    // always use fallbackAssetUri for download asset to hit the Marketplace API so that downloads are counted
    uri: `${version.fallbackAssetUri}/${AssetType.VSIX}?redirect=true${version.targetPlatform ? `&targetPlatform=${version.targetPlatform}` : ""}`,
    fallbackUri: `${version.fallbackAssetUri}/${AssetType.VSIX}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ""}`
  };
}
function getVersionAsset(version, type) {
  const result = version.files.filter((f) => f.assetType === type)[0];
  return result ? {
    uri: `${version.assetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ""}`,
    fallbackUri: `${version.fallbackAssetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ""}`
  } : null;
}
function getExtensions(version, property) {
  const values = version.properties ? version.properties.filter((p) => p.key === property) : [];
  const value = values.length > 0 && values[0].value;
  return value ? value.split(",").map((v) => adoptToGalleryExtensionId(v)) : [];
}
function getEngine(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.Engine) : [];
  return values.length > 0 && values[0].value || "";
}
function setEngine(version, engine) {
  version.properties = version.properties ?? [];
  version.properties.push({ key: PropertyType.Engine, value: engine });
}
function isPreReleaseVersion(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.PreRelease) : [];
  return values.length > 0 && values[0].value === "true";
}
function hasPreReleaseForExtension(id, productService) {
  return productService.extensionProperties?.[id.toLowerCase()]?.hasPrereleaseVersion;
}
function getExcludeVersionRangeForExtension(id, productService) {
  return productService.extensionProperties?.[id.toLowerCase()]?.excludeVersionRange;
}
function isPrivateExtension(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.Private) : [];
  return values.length > 0 && values[0].value === "true";
}
function executesCode(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.ExecutesCode) : [];
  return values.length > 0 ? values[0].value === "true" : void 0;
}
function getEnabledApiProposals(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.EnabledApiProposals) : [];
  const value = values.length > 0 && values[0].value || "";
  return value ? value.split(",") : [];
}
function getLocalizedLanguages(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.LocalizedLanguages) : [];
  const value = values.length > 0 && values[0].value || "";
  return value ? value.split(",") : [];
}
function getSponsorLink(version) {
  return version.properties?.find((p) => p.key === PropertyType.SponsorLink)?.value;
}
function getSupportLink(version) {
  return version.properties?.find((p) => p.key === PropertyType.SupportLink)?.value;
}
function getIsPreview(flags) {
  return flags.indexOf("preview") !== -1;
}
function getTargetPlatformForExtensionVersion(version) {
  return version.targetPlatform ? toTargetPlatform(version.targetPlatform) : TargetPlatform.UNDEFINED;
}
function getAllTargetPlatforms(rawGalleryExtension) {
  const allTargetPlatforms = distinct(rawGalleryExtension.versions.map(getTargetPlatformForExtensionVersion));
  const isWebExtension = !!rawGalleryExtension.tags?.includes(WEB_EXTENSION_TAG);
  const webTargetPlatformIndex = allTargetPlatforms.indexOf(TargetPlatform.WEB);
  if (isWebExtension) {
    if (webTargetPlatformIndex === -1) {
      allTargetPlatforms.push(TargetPlatform.WEB);
    }
  } else {
    if (webTargetPlatformIndex !== -1) {
      allTargetPlatforms.splice(webTargetPlatformIndex, 1);
    }
  }
  return allTargetPlatforms;
}
function sortExtensionVersions(versions, preferredTargetPlatform) {
  for (let index = 0; index < versions.length; index++) {
    const version = versions[index];
    if (version.version === versions[index - 1]?.version) {
      let insertionIndex = index;
      const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
      if (versionTargetPlatform === preferredTargetPlatform) {
        while (insertionIndex > 0 && versions[insertionIndex - 1].version === version.version) {
          insertionIndex--;
        }
      }
      if (insertionIndex !== index) {
        versions.splice(index, 1);
        versions.splice(insertionIndex, 0, version);
      }
    }
  }
  return versions;
}
function filterLatestExtensionVersionsForTargetPlatform(versions, targetPlatform, allTargetPlatforms) {
  const latestVersions = [];
  let preReleaseVersionIndex = -1;
  let releaseVersionIndex = -1;
  for (const version of versions) {
    const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
    const isCompatibleWithTargetPlatform = isTargetPlatformCompatible(versionTargetPlatform, allTargetPlatforms, targetPlatform);
    if (!isCompatibleWithTargetPlatform) {
      latestVersions.push(version);
      continue;
    }
    if (isPreReleaseVersion(version)) {
      if (preReleaseVersionIndex === -1) {
        preReleaseVersionIndex = latestVersions.length;
        latestVersions.push(version);
      } else if (versionTargetPlatform === targetPlatform && latestVersions[preReleaseVersionIndex].version === version.version) {
        latestVersions[preReleaseVersionIndex] = version;
      }
    } else {
      if (releaseVersionIndex === -1) {
        releaseVersionIndex = latestVersions.length;
        latestVersions.push(version);
      } else if (versionTargetPlatform === targetPlatform && latestVersions[releaseVersionIndex].version === version.version) {
        latestVersions[releaseVersionIndex] = version;
      }
    }
  }
  return latestVersions;
}
function setTelemetry(extension, index, querySource) {
  extension.telemetryData = { index, querySource, queryActivityId: extension.queryContext?.[SEARCH_ACTIVITY_HEADER_NAME] };
}
function toExtension(galleryExtension, version, allTargetPlatforms, extensionGalleryManifest, productService, queryContext) {
  const latestVersion = galleryExtension.versions[0];
  const assets = {
    manifest: getVersionAsset(version, AssetType.Manifest),
    readme: getVersionAsset(version, AssetType.Details),
    changelog: getVersionAsset(version, AssetType.Changelog),
    license: getVersionAsset(version, AssetType.License),
    repository: getRepositoryAsset(version),
    download: getDownloadAsset(version),
    icon: getVersionAsset(version, AssetType.Icon),
    signature: getVersionAsset(version, AssetType.Signature),
    coreTranslations: getCoreTranslationAssets(version)
  };
  const detailsViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.linkType ?? ExtensionGalleryResourceType.ExtensionDetailsViewUri);
  const publisherViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.publisher.linkType ?? ExtensionGalleryResourceType.PublisherViewUri);
  const ratingViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.ratingLinkType ?? ExtensionGalleryResourceType.ExtensionRatingViewUri);
  const id = getGalleryExtensionId(galleryExtension.publisher.publisherName, galleryExtension.extensionName);
  return {
    type: "gallery",
    identifier: {
      id,
      uuid: galleryExtension.extensionId
    },
    name: galleryExtension.extensionName,
    version: version.version,
    displayName: galleryExtension.displayName,
    publisherId: galleryExtension.publisher.publisherId,
    publisher: galleryExtension.publisher.publisherName,
    publisherDisplayName: galleryExtension.publisher.displayName,
    publisherDomain: galleryExtension.publisher.domain ? { link: galleryExtension.publisher.domain, verified: !!galleryExtension.publisher.isDomainVerified } : void 0,
    publisherSponsorLink: getSponsorLink(latestVersion),
    description: galleryExtension.shortDescription ?? "",
    installCount: getStatistic(galleryExtension.statistics, "install"),
    rating: getStatistic(galleryExtension.statistics, "averagerating"),
    ratingCount: getStatistic(galleryExtension.statistics, "ratingcount"),
    categories: galleryExtension.categories || [],
    tags: galleryExtension.tags || [],
    releaseDate: Date.parse(galleryExtension.releaseDate),
    lastUpdated: Date.parse(galleryExtension.lastUpdated),
    allTargetPlatforms,
    assets,
    properties: {
      dependencies: getExtensions(version, PropertyType.Dependency),
      extensionPack: getExtensions(version, PropertyType.ExtensionPack),
      engine: getEngine(version),
      enabledApiProposals: getEnabledApiProposals(version),
      localizedLanguages: getLocalizedLanguages(version),
      targetPlatform: getTargetPlatformForExtensionVersion(version),
      isPreReleaseVersion: isPreReleaseVersion(version),
      executesCode: executesCode(version)
    },
    hasPreReleaseVersion: hasPreReleaseForExtension(id, productService) ?? isPreReleaseVersion(latestVersion),
    hasReleaseVersion: true,
    private: isPrivateExtension(latestVersion),
    preview: getIsPreview(galleryExtension.flags),
    isSigned: !!assets.signature,
    queryContext,
    supportLink: getSupportLink(latestVersion),
    detailsLink: detailsViewUri ? format2(detailsViewUri, { publisher: galleryExtension.publisher.publisherName, name: galleryExtension.extensionName }) : void 0,
    publisherLink: publisherViewUri ? format2(publisherViewUri, { publisher: galleryExtension.publisher.publisherName }) : void 0,
    ratingLink: ratingViewUri ? format2(ratingViewUri, { publisher: galleryExtension.publisher.publisherName, name: galleryExtension.extensionName }) : void 0
  };
}
let AbstractExtensionGalleryService = class {
  constructor(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
    this.requestService = requestService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.fileService = fileService;
    this.productService = productService;
    this.configurationService = configurationService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.extensionsControlUrl = productService.extensionsGallery?.controlUrl;
    this.unpkgResourceApi = productService.extensionsGallery?.extensionUrlTemplate;
    this.commonHeadersPromise = resolveMarketplaceHeaders(
      productService.version,
      productService,
      this.environmentService,
      this.configurationService,
      this.fileService,
      storageService,
      this.telemetryService
    );
  }
  isEnabled() {
    return this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available;
  }
  async getExtensions(extensionInfos, arg1, arg2) {
    const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!extensionGalleryManifest) {
      throw new Error("No extension gallery service configured.");
    }
    const options = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
    const token = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
    const resourceApi = this.getResourceApi(extensionGalleryManifest);
    const result = resourceApi ? await this.getExtensionsUsingResourceApi(extensionInfos, options, resourceApi, extensionGalleryManifest, token) : await this.getExtensionsUsingQueryApi(extensionInfos, options, extensionGalleryManifest, token);
    const uuids = result.map((r) => r.identifier.uuid);
    const extensionInfosByName = [];
    for (const e of extensionInfos) {
      if (e.uuid && !uuids.includes(e.uuid)) {
        extensionInfosByName.push({ ...e, uuid: void 0 });
      }
    }
    if (extensionInfosByName.length) {
      this.telemetryService.publicLog2("galleryService:additionalQueryByName", {
        count: extensionInfosByName.length
      });
      const extensions = await this.getExtensionsUsingQueryApi(extensionInfosByName, options, extensionGalleryManifest, token);
      result.push(...extensions);
    }
    return result;
  }
  getResourceApi(extensionGalleryManifest) {
    const latestVersionResource = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionLatestVersionUri);
    if (latestVersionResource) {
      return {
        uri: latestVersionResource,
        fallback: this.unpkgResourceApi
      };
    }
    return void 0;
  }
  async getExtensionsUsingQueryApi(extensionInfos, options, extensionGalleryManifest, token) {
    const names = [], ids = [], includePreRelease = [], versions = [];
    let isQueryForReleaseVersionFromPreReleaseVersion = true;
    for (const extensionInfo of extensionInfos) {
      if (extensionInfo.uuid) {
        ids.push(extensionInfo.uuid);
      } else {
        names.push(extensionInfo.id);
      }
      if (extensionInfo.version) {
        versions.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, version: extensionInfo.version });
      } else {
        includePreRelease.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, includePreRelease: !!extensionInfo.preRelease });
      }
      isQueryForReleaseVersionFromPreReleaseVersion = isQueryForReleaseVersionFromPreReleaseVersion && (!!extensionInfo.hasPreRelease && !extensionInfo.preRelease);
    }
    if (!ids.length && !names.length) {
      return [];
    }
    let query = new Query().withPage(1, extensionInfos.length);
    if (ids.length) {
      query = query.withFilter(FilterType.ExtensionId, ...ids);
    }
    if (names.length) {
      query = query.withFilter(FilterType.ExtensionName, ...names);
    }
    if (options.queryAllVersions) {
      query = query.withFlags(...query.flags, Flag.IncludeVersions);
    }
    if (options.source) {
      query = query.withSource(options.source);
    }
    const { extensions } = await this.queryGalleryExtensions(
      query,
      {
        targetPlatform: options.targetPlatform ?? CURRENT_TARGET_PLATFORM,
        includePreRelease,
        versions,
        compatible: !!options.compatible,
        productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date },
        isQueryForReleaseVersionFromPreReleaseVersion
      },
      extensionGalleryManifest,
      token
    );
    if (options.source) {
      extensions.forEach((e, index) => setTelemetry(e, index, options.source));
    }
    return extensions;
  }
  async getExtensionsUsingResourceApi(extensionInfos, options, resourceApi, extensionGalleryManifest, token) {
    const result = [];
    const toQuery = [];
    const toFetchLatest = [];
    for (const extensionInfo of extensionInfos) {
      if (!EXTENSION_IDENTIFIER_REGEX.test(extensionInfo.id)) {
        continue;
      }
      if (extensionInfo.version) {
        toQuery.push(extensionInfo);
      } else {
        toFetchLatest.push(extensionInfo);
      }
    }
    await Promise.all(toFetchLatest.map(async (extensionInfo) => {
      let galleryExtension;
      try {
        galleryExtension = await this.getLatestGalleryExtension(extensionInfo, options, resourceApi, extensionGalleryManifest, token);
        if (isString(galleryExtension)) {
          if (galleryExtension === "LATEST_IS_OUTDATED") {
            this.logService.debug(`Skipping query API fallback for extension ${extensionInfo.id} because the latest gallery version is older than the current version`);
          } else {
            this.telemetryService.publicLog2("galleryService:fallbacktoquery", {
              extension: extensionInfo.id,
              preRelease: !!extensionInfo.preRelease,
              compatible: !!options.compatible,
              errorCode: galleryExtension
            });
            toQuery.push(extensionInfo);
          }
        } else {
          result.push(galleryExtension);
        }
      } catch (error) {
        if (error instanceof ExtensionGalleryError) {
          switch (error.code) {
            case ExtensionGalleryErrorCode.Offline:
            case ExtensionGalleryErrorCode.Cancelled:
            case ExtensionGalleryErrorCode.Timeout:
              throw error;
          }
        }
        this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id}.`, getErrorMessage(error));
        this.telemetryService.publicLog2("galleryService:fallbacktoquery", {
          extension: extensionInfo.id,
          preRelease: !!extensionInfo.preRelease,
          compatible: !!options.compatible,
          errorCode: error instanceof ExtensionGalleryError ? error.code : "Unknown"
        });
        toQuery.push(extensionInfo);
      }
    }));
    if (toQuery.length) {
      const extensions = await this.getExtensionsUsingQueryApi(toQuery, options, extensionGalleryManifest, token);
      result.push(...extensions);
    }
    return result;
  }
  async getLatestGalleryExtension(extensionInfo, options, resourceApi, extensionGalleryManifest, token) {
    const rawGalleryExtension = await this.getLatestRawGalleryExtensionWithFallback(extensionInfo, resourceApi, token);
    if (!rawGalleryExtension) {
      return "NOT_FOUND";
    }
    const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
    const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersionFromLatestVersions(rawGalleryExtension, rawGalleryExtension.versions, extensionInfo, options, allTargetPlatforms);
    if (!rawGalleryExtensionVersion) {
      if (extensionInfo.currentVersion) {
        const latestVersion = rawGalleryExtension.versions.length > 0 ? rawGalleryExtension.versions[0].version : void 0;
        if (latestVersion && semver.lt(latestVersion, extensionInfo.currentVersion)) {
          return "LATEST_IS_OUTDATED";
        }
      }
      return "NOT_COMPATIBLE";
    }
    return toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService);
  }
  async getValidRawGalleryExtensionVersionFromLatestVersions(rawGalleryExtension, latestVersions, extensionInfo, options, allTargetPlatforms) {
    const targetPlatform = options.targetPlatform ?? CURRENT_TARGET_PLATFORM;
    const latestExtensionVersionsForTargetPlatform = filterLatestExtensionVersionsForTargetPlatform(latestVersions, targetPlatform, allTargetPlatforms);
    const result = await this.getValidRawGalleryExtensionVersion(
      rawGalleryExtension,
      latestExtensionVersionsForTargetPlatform,
      {
        targetPlatform,
        compatible: !!options.compatible,
        productVersion: options.productVersion ?? {
          version: this.productService.version,
          date: this.productService.date
        },
        version: extensionInfo.preRelease ? 1 /* Prerelease */ : 0 /* Release */
      },
      allTargetPlatforms
    );
    if (!extensionInfo.preRelease) {
      return result;
    }
    const prereleaseVersion = result;
    const releaseVersion = await this.getValidRawGalleryExtensionVersion(
      rawGalleryExtension,
      latestExtensionVersionsForTargetPlatform,
      {
        targetPlatform,
        compatible: !!options.compatible,
        productVersion: options.productVersion ?? {
          version: this.productService.version,
          date: this.productService.date
        },
        version: 0 /* Release */
      },
      allTargetPlatforms
    );
    if (prereleaseVersion && releaseVersion) {
      return semver.gt(releaseVersion.version, prereleaseVersion.version) ? releaseVersion : prereleaseVersion;
    }
    if (options.compatible) {
      if (releaseVersion) {
        const anyPrereleaseVersion = await this.getValidRawGalleryExtensionVersion(
          rawGalleryExtension,
          latestExtensionVersionsForTargetPlatform,
          {
            targetPlatform,
            compatible: false,
            productVersion: options.productVersion ?? {
              version: this.productService.version,
              date: this.productService.date
            },
            version: 1 /* Prerelease */
          },
          allTargetPlatforms
        );
        if (!anyPrereleaseVersion || semver.gt(releaseVersion.version, anyPrereleaseVersion.version)) {
          return releaseVersion;
        }
      }
      return prereleaseVersion;
    }
    return prereleaseVersion ?? releaseVersion ?? null;
  }
  async getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion = { version: this.productService.version, date: this.productService.date }) {
    if (isNotWebExtensionInWebTargetPlatform(extension.allTargetPlatforms, targetPlatform)) {
      return null;
    }
    if (await this.isExtensionCompatible(extension, includePreRelease, targetPlatform)) {
      return extension;
    }
    if (this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) !== true) {
      return null;
    }
    const result = await this.getExtensions([{
      ...extension.identifier,
      preRelease: includePreRelease,
      hasPreRelease: extension.hasPreReleaseVersion
    }], {
      compatible: true,
      productVersion,
      queryAllVersions: true,
      targetPlatform
    }, CancellationToken.None);
    return result[0] ?? null;
  }
  async isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion = { version: this.productService.version, date: this.productService.date }) {
    return this.isValidVersion(
      {
        id: extension.identifier.id,
        version: extension.version,
        isPreReleaseVersion: extension.properties.isPreReleaseVersion,
        targetPlatform: extension.properties.targetPlatform,
        manifestAsset: extension.assets.manifest,
        engine: extension.properties.engine,
        enabledApiProposals: extension.properties.enabledApiProposals
      },
      {
        targetPlatform,
        compatible: true,
        productVersion,
        version: includePreRelease ? 2 /* Latest */ : 0 /* Release */
      },
      extension.publisherDisplayName,
      extension.allTargetPlatforms
    );
  }
  async isValidVersion(extension, { targetPlatform, compatible, productVersion, version }, publisherDisplayName, allTargetPlatforms) {
    const hasPreRelease = hasPreReleaseForExtension(extension.id, this.productService);
    const excludeVersionRange = getExcludeVersionRangeForExtension(extension.id, this.productService);
    if (extension.isPreReleaseVersion && hasPreRelease === false) {
      return false;
    }
    if (excludeVersionRange && semver.satisfies(extension.version, excludeVersionRange)) {
      return false;
    }
    if (isString(version)) {
      if (extension.version !== version) {
        return false;
      }
    } else if (version === 0 /* Release */ || version === 1 /* Prerelease */) {
      if (extension.isPreReleaseVersion !== (version === 1 /* Prerelease */)) {
        return false;
      }
    }
    if (targetPlatform && !isTargetPlatformCompatible(extension.targetPlatform, allTargetPlatforms, targetPlatform)) {
      return false;
    }
    if (compatible) {
      if (this.allowedExtensionsService.isAllowed({ id: extension.id, publisherDisplayName, version: extension.version, prerelease: extension.isPreReleaseVersion, targetPlatform: extension.targetPlatform }) !== true) {
        return false;
      }
      if (!await this.isEngineValid(extension.id, extension.version, extension.engine, extension.manifestAsset, productVersion)) {
        return false;
      }
    }
    return true;
  }
  async isEngineValid(extensionId, version, engine, manifestAsset, productVersion) {
    if (!engine) {
      try {
        engine = await this.getEngine(extensionId, version, manifestAsset);
      } catch (error) {
        this.logService.error(`Error while getting the engine for the version ${version}.`, getErrorMessage(error));
        return false;
      }
    }
    if (!engine) {
      this.logService.error(`Missing engine for the extension ${extensionId} with version ${version}`);
      return false;
    }
    return isEngineValid(engine, productVersion.version, productVersion.date);
  }
  async getEngine(extensionId, version, manifestAsset) {
    if (!manifestAsset) {
      this.logService.error(`Missing engine and manifest asset for the extension ${extensionId} with version ${version}`);
      return void 0;
    }
    try {
      this.telemetryService.publicLog2("galleryService:engineFallback", { extension: extensionId, extensionVersion: version });
      const headers = { "Accept-Encoding": "gzip" };
      const context = await this.getAsset(extensionId, manifestAsset, AssetType.Manifest, version, "extensionGalleryService.engineVersion", { headers });
      const manifest = await asJson(context);
      if (!manifest) {
        this.logService.error(`Manifest was not found for the extension ${extensionId} with version ${version}`);
        return void 0;
      }
      return manifest.engines.vscode;
    } catch (error) {
      this.logService.error(`Error while getting the engine for the version ${version}.`, getErrorMessage(error));
      return void 0;
    }
  }
  async query(options, token) {
    const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!extensionGalleryManifest) {
      throw new Error("No extension gallery service configured.");
    }
    let text = options.text || "";
    const pageSize = options.pageSize ?? 50;
    let query = new Query().withPage(1, pageSize);
    if (text) {
      text = text.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
        query = query.withFilter(FilterType.Category, category || quotedCategory);
        return "";
      });
      text = text.replace(/\btag:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedTag, tag) => {
        query = query.withFilter(FilterType.Tag, tag || quotedTag);
        return "";
      });
      text = text.replace(/\bfeatured(\s+|\b|$)/g, () => {
        query = query.withFilter(FilterType.Featured);
        return "";
      });
      text = text.trim();
      if (text) {
        text = text.length < 200 ? text : text.substring(0, 200);
        query = query.withFilter(FilterType.SearchText, text);
      }
      if (extensionGalleryManifest.capabilities.extensionQuery.sorting?.some((c) => c.name === SortBy.NoneOrRelevance)) {
        query = query.withSortBy(SortBy.NoneOrRelevance);
      }
    } else {
      if (extensionGalleryManifest.capabilities.extensionQuery.sorting?.some((c) => c.name === SortBy.InstallCount)) {
        query = query.withSortBy(SortBy.InstallCount);
      }
    }
    if (options.sortBy && extensionGalleryManifest.capabilities.extensionQuery.sorting?.some((c) => c.name === options.sortBy)) {
      query = query.withSortBy(options.sortBy);
    }
    if (typeof options.sortOrder === "number") {
      query = query.withSortOrder(options.sortOrder);
    }
    if (options.source) {
      query = query.withSource(options.source);
    }
    const runQuery = async (query2, token2) => {
      const { extensions: extensions2, total: total2 } = await this.queryGalleryExtensions(query2, { targetPlatform: CURRENT_TARGET_PLATFORM, compatible: false, includePreRelease: !!options.includePreRelease, productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date } }, extensionGalleryManifest, token2);
      const result = [];
      let defaultChatAgentExtension;
      for (let index = 0; index < extensions2.length; index++) {
        const extension = extensions2[index];
        setTelemetry(extension, (query2.pageNumber - 1) * query2.pageSize + index, options.source);
        if (areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId })) {
          defaultChatAgentExtension = extension;
        } else {
          result.push(extension);
        }
      }
      if (defaultChatAgentExtension) {
        result.push(defaultChatAgentExtension);
      }
      return { extensions: result, total: total2 };
    };
    const { extensions, total } = await runQuery(query, token);
    const getPage = async (pageIndex, ct) => {
      if (ct.isCancellationRequested) {
        throw new CancellationError();
      }
      const { extensions: extensions2 } = await runQuery(query.withPage(pageIndex + 1), ct);
      return extensions2;
    };
    return { firstPage: extensions, total, pageSize: query.pageSize, getPage };
  }
  async queryGalleryExtensions(query, criteria, extensionGalleryManifest, token) {
    const flags = query.flags;
    if (query.flags.includes(Flag.IncludeLatestVersionOnly) && query.flags.includes(Flag.IncludeVersions)) {
      query = query.withFlags(...query.flags.filter((flag) => flag !== Flag.IncludeVersions));
    }
    if (!query.flags.includes(Flag.IncludeLatestVersionOnly) && !query.flags.includes(Flag.IncludeVersions)) {
      query = query.withFlags(...query.flags, Flag.IncludeLatestVersionOnly);
    }
    if (criteria.versions?.length || criteria.isQueryForReleaseVersionFromPreReleaseVersion) {
      query = query.withFlags(...query.flags.filter((flag) => flag !== Flag.IncludeLatestVersionOnly), Flag.IncludeVersions);
    }
    query = query.withFlags(...query.flags, Flag.IncludeAssetUri, Flag.IncludeCategoryAndTags, Flag.IncludeFiles, Flag.IncludeStatistics, Flag.IncludeVersionProperties);
    const { galleryExtensions: rawGalleryExtensions, total, context } = await this.queryRawGalleryExtensions(query, extensionGalleryManifest, token);
    const hasAllVersions = !query.flags.includes(Flag.IncludeLatestVersionOnly);
    if (hasAllVersions) {
      const extensions = [];
      for (const rawGalleryExtension of rawGalleryExtensions) {
        const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
        const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
        const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find((extensionIdentifierWithPreRelease) => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
        const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersion(
          rawGalleryExtension,
          rawGalleryExtension.versions,
          {
            compatible: criteria.compatible,
            targetPlatform: criteria.targetPlatform,
            productVersion: criteria.productVersion,
            version: criteria.versions?.find((extensionIdentifierWithVersion) => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version ?? (includePreRelease ? 2 /* Latest */ : 0 /* Release */)
          },
          allTargetPlatforms
        );
        if (rawGalleryExtensionVersion) {
          extensions.push(toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService, context));
        }
      }
      return { extensions, total };
    }
    const result = [];
    const needAllVersions = /* @__PURE__ */ new Map();
    for (let index = 0; index < rawGalleryExtensions.length; index++) {
      const rawGalleryExtension = rawGalleryExtensions[index];
      const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
      const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find((extensionIdentifierWithPreRelease) => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
      const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
      if (criteria.compatible) {
        if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
          continue;
        }
        if (this.allowedExtensionsService.isAllowed({ id: extensionIdentifier.id, publisherDisplayName: rawGalleryExtension.publisher.displayName }) !== true) {
          continue;
        }
      }
      const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersion(
        rawGalleryExtension,
        rawGalleryExtension.versions,
        {
          compatible: criteria.compatible,
          targetPlatform: criteria.targetPlatform,
          productVersion: criteria.productVersion,
          version: criteria.versions?.find((extensionIdentifierWithVersion) => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version ?? (includePreRelease ? 2 /* Latest */ : 0 /* Release */)
        },
        allTargetPlatforms
      );
      const extension = rawGalleryExtensionVersion ? toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService, context) : null;
      if (!extension || extension.properties.isPreReleaseVersion && (!includePreRelease || !extension.hasReleaseVersion) || !extension.properties.isPreReleaseVersion && extension.properties.targetPlatform !== criteria.targetPlatform && extension.hasPreReleaseVersion) {
        needAllVersions.set(rawGalleryExtension.extensionId, index);
      } else {
        result.push([index, extension]);
      }
    }
    if (needAllVersions.size) {
      const stopWatch = new StopWatch();
      const query2 = new Query().withFlags(...flags.filter((flag) => flag !== Flag.IncludeLatestVersionOnly), Flag.IncludeVersions).withPage(1, needAllVersions.size).withFilter(FilterType.ExtensionId, ...needAllVersions.keys());
      const { extensions } = await this.queryGalleryExtensions(query2, criteria, extensionGalleryManifest, token);
      this.telemetryService.publicLog2("galleryService:additionalQuery", {
        duration: stopWatch.elapsed(),
        count: needAllVersions.size
      });
      for (const extension of extensions) {
        const index = needAllVersions.get(extension.identifier.uuid);
        result.push([index, extension]);
      }
    }
    return { extensions: result.sort((a, b) => a[0] - b[0]).map(([, extension]) => extension), total };
  }
  async getValidRawGalleryExtensionVersion(rawGalleryExtension, versions, criteria, allTargetPlatforms) {
    const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
    const rawGalleryExtensionVersions = sortExtensionVersions(versions, criteria.targetPlatform);
    if (criteria.compatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
      return null;
    }
    const version = isString(criteria.version) ? criteria.version : void 0;
    for (let index = 0; index < rawGalleryExtensionVersions.length; index++) {
      const rawGalleryExtensionVersion = rawGalleryExtensionVersions[index];
      if (criteria.compatible) {
        await this.setEngineIfNotExists(extensionIdentifier.id, rawGalleryExtensionVersion);
      }
      if (await this.isValidVersion(
        {
          id: extensionIdentifier.id,
          version: rawGalleryExtensionVersion.version,
          isPreReleaseVersion: isPreReleaseVersion(rawGalleryExtensionVersion),
          targetPlatform: getTargetPlatformForExtensionVersion(rawGalleryExtensionVersion),
          engine: getEngine(rawGalleryExtensionVersion),
          manifestAsset: getVersionAsset(rawGalleryExtensionVersion, AssetType.Manifest),
          enabledApiProposals: getEnabledApiProposals(rawGalleryExtensionVersion)
        },
        criteria,
        rawGalleryExtension.publisher.displayName,
        allTargetPlatforms
      )) {
        return rawGalleryExtensionVersion;
      }
      if (version && rawGalleryExtensionVersion.version === version) {
        return null;
      }
    }
    if (version || criteria.compatible) {
      return null;
    }
    return rawGalleryExtension.versions[0];
  }
  async setEngineIfNotExists(extensionId, rawGalleryExtensionVersion) {
    if (getEngine(rawGalleryExtensionVersion)) {
      return;
    }
    try {
      const engine = await this.getEngine(extensionId, rawGalleryExtensionVersion.version, getVersionAsset(rawGalleryExtensionVersion, AssetType.Manifest));
      if (engine) {
        setEngine(rawGalleryExtensionVersion, engine);
      }
    } catch (error) {
      this.logService.error(`Error while getting the engine for the version ${rawGalleryExtensionVersion.version}.`, getErrorMessage(error));
    }
  }
  async queryRawGalleryExtensions(query, extensionGalleryManifest, token) {
    const extensionsQueryApi = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionQueryService);
    if (!extensionsQueryApi) {
      throw new Error("No extension gallery query service configured.");
    }
    query = query.withFlags(...query.flags, Flag.ExcludeNonValidated).withFilter(FilterType.Target, "Microsoft.VisualStudio.Code");
    const unpublishedFlag = extensionGalleryManifest.capabilities.extensionQuery.flags?.find((f) => f.name === Flag.Unpublished);
    if (unpublishedFlag) {
      query = query.withFilter(FilterType.ExcludeWithFlags, String(unpublishedFlag.value));
    }
    const data = JSON.stringify({
      filters: [
        {
          criteria: query.criteria.reduce((criteria, c) => {
            const criterium = extensionGalleryManifest.capabilities.extensionQuery.filtering?.find((f) => f.name === c.filterType);
            if (criterium) {
              criteria.push({
                filterType: criterium.value,
                value: c.value
              });
            }
            return criteria;
          }, []),
          pageNumber: query.pageNumber,
          pageSize: query.pageSize,
          sortBy: extensionGalleryManifest.capabilities.extensionQuery.sorting?.find((s) => s.name === query.sortBy)?.value,
          sortOrder: query.sortOrder
        }
      ],
      assetTypes: query.assetTypes,
      flags: query.flags.reduce((flags, flag) => {
        const flagValue = extensionGalleryManifest.capabilities.extensionQuery.flags?.find((f) => f.name === flag);
        if (flagValue) {
          flags |= flagValue.value;
        }
        return flags;
      }, 0)
    });
    const commonHeaders = await this.commonHeadersPromise;
    const headers = {
      ...commonHeaders,
      "Content-Type": "application/json",
      "Accept": "application/json;api-version=3.0-preview.1",
      "Accept-Encoding": "gzip",
      "Content-Length": String(data.length)
    };
    const stopWatch = new StopWatch();
    let context, errorCode, total = 0;
    try {
      context = await this.requestService.request({
        type: "POST",
        url: extensionsQueryApi,
        data,
        headers,
        callSite: "extensionGalleryService.queryRawGalleryExtensions"
      }, token);
      if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
        return { galleryExtensions: [], total };
      }
      const result = await asJson(context);
      if (result) {
        const r = result.results[0];
        const galleryExtensions = r.extensions;
        const resultCount = r.resultMetadata && r.resultMetadata.filter((m) => m.metadataType === "ResultCount")[0];
        total = resultCount && resultCount.metadataItems.filter((i) => i.name === "TotalCount")[0].count || 0;
        return {
          galleryExtensions,
          total,
          context: context.res.headers["activityid"] ? {
            [SEARCH_ACTIVITY_HEADER_NAME]: context.res.headers["activityid"]
          } : {}
        };
      }
      return { galleryExtensions: [], total };
    } catch (e) {
      if (isCancellationError(e)) {
        errorCode = ExtensionGalleryErrorCode.Cancelled;
        throw e;
      } else {
        const errorMessage = getErrorMessage(e);
        errorCode = isOfflineError(e) ? ExtensionGalleryErrorCode.Offline : errorMessage.startsWith("XHR timeout") ? ExtensionGalleryErrorCode.Timeout : ExtensionGalleryErrorCode.Failed;
        throw new ExtensionGalleryError(errorMessage, errorCode);
      }
    } finally {
      this.telemetryService.publicLog2("galleryService:query", {
        filterTypes: query.criteria.map((criterium) => criterium.filterType),
        flags: query.flags,
        sortBy: query.sortBy,
        sortOrder: String(query.sortOrder),
        pageNumber: String(query.pageNumber),
        source: query.source,
        searchTextLength: query.searchText.length,
        requestBodySize: String(data.length),
        duration: stopWatch.elapsed(),
        success: !!context && isSuccess(context),
        responseBodySize: context?.res.headers["Content-Length"],
        statusCode: context ? String(context.res.statusCode) : void 0,
        errorCode,
        count: String(total),
        server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
        activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
        endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME)
      });
    }
  }
  getHeaderValue(headers, name) {
    const headerValue = headers?.[name.toLowerCase()];
    const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return value ? new TelemetryTrustedValue(value) : void 0;
  }
  async getLatestRawGalleryExtensionWithFallback(extensionInfo, resourceApi, token) {
    const [publisher, name] = extensionInfo.id.split(".");
    let errorCode;
    try {
      const uri = URI.parse(format2(resourceApi.uri, { publisher, name }));
      return await this.getLatestRawGalleryExtension(extensionInfo.id, uri, token);
    } catch (error) {
      if (error instanceof ExtensionGalleryError) {
        errorCode = error.code;
        switch (error.code) {
          case ExtensionGalleryErrorCode.Offline:
          case ExtensionGalleryErrorCode.Cancelled:
          case ExtensionGalleryErrorCode.Timeout:
          case ExtensionGalleryErrorCode.ClientError:
            throw error;
        }
      } else {
        errorCode = "Unknown";
      }
      if (!resourceApi.fallback) {
        throw error;
      }
    } finally {
      this.telemetryService.publicLog2("galleryService:getmarketplacelatest", {
        extension: extensionInfo.id,
        errorCode
      });
    }
    this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id} from ${resourceApi.uri}. Trying the fallback ${resourceApi.fallback}`, errorCode);
    try {
      const uri = URI.parse(format2(resourceApi.fallback, { publisher, name }));
      return await this.getLatestRawGalleryExtension(extensionInfo.id, uri, token);
    } catch (error) {
      errorCode = error instanceof ExtensionGalleryError ? error.code : "Unknown";
      throw error;
    } finally {
      this.telemetryService.publicLog2("galleryService:fallbacktounpkg", {
        extension: extensionInfo.id,
        errorCode
      });
    }
  }
  async getLatestRawGalleryExtension(extension, uri, token) {
    let context;
    let errorCode;
    const stopWatch = new StopWatch();
    try {
      const commonHeaders = await this.commonHeadersPromise;
      const headers = {
        ...commonHeaders,
        "Content-Type": "application/json",
        "Accept": "application/json;api-version=7.2-preview",
        "Accept-Encoding": "gzip"
      };
      context = await this.requestService.request({
        type: "GET",
        url: uri.toString(true),
        headers,
        timeout: this.getRequestTimeout(),
        callSite: "extensionGalleryService.getLatestRawGalleryExtension"
      }, token);
      if (context.res.statusCode === 404) {
        errorCode = "NotFound";
        return null;
      }
      if (context.res.statusCode && context.res.statusCode !== 200) {
        throw new Error("Unexpected HTTP response: " + context.res.statusCode);
      }
      const result = await asJson(context);
      if (!result) {
        errorCode = "NoData";
      }
      return result;
    } catch (error) {
      let galleryErrorCode;
      if (isCancellationError(error)) {
        galleryErrorCode = ExtensionGalleryErrorCode.Cancelled;
      } else if (isOfflineError(error)) {
        galleryErrorCode = ExtensionGalleryErrorCode.Offline;
      } else if (getErrorMessage(error).startsWith("XHR timeout")) {
        galleryErrorCode = ExtensionGalleryErrorCode.Timeout;
      } else if (context && isClientError(context)) {
        galleryErrorCode = ExtensionGalleryErrorCode.ClientError;
      } else if (context && isServerError(context)) {
        galleryErrorCode = ExtensionGalleryErrorCode.ServerError;
      } else {
        galleryErrorCode = ExtensionGalleryErrorCode.Failed;
      }
      errorCode = galleryErrorCode;
      throw new ExtensionGalleryError(error, galleryErrorCode);
    } finally {
      this.telemetryService.publicLog2("galleryService:getLatest", {
        extension,
        host: uri.authority,
        duration: stopWatch.elapsed(),
        errorCode,
        statusCode: context?.res.statusCode && context?.res.statusCode !== 200 ? `${context.res.statusCode}` : void 0,
        server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
        activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
        endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME)
      });
    }
  }
  async reportStatistic(publisher, name, version, type) {
    if (isWeb) {
      this.logService.info("ExtensionGalleryService#reportStatistic: Skipped in web");
      return void 0;
    }
    const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!manifest) {
      return void 0;
    }
    const resource = getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ExtensionStatisticsUri);
    if (!resource) {
      return;
    }
    const url = format2(resource, { publisher, name, version, statTypeName: type });
    const Accept = "*/*;api-version=4.0-preview.1";
    const commonHeaders = await this.commonHeadersPromise;
    const headers = { ...commonHeaders, Accept };
    try {
      await this.requestService.request({
        type: "POST",
        url,
        headers,
        callSite: "extensionGalleryService.reportStatistic"
      }, CancellationToken.None);
    } catch (error) {
    }
  }
  async download(extension, location, operation) {
    this.logService.trace("ExtensionGalleryService#download", extension.identifier.id);
    const data = getGalleryExtensionTelemetryData(extension);
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    const operationParam = operation === InstallOperation.Install ? "install" : operation === InstallOperation.Update ? "update" : "";
    const downloadAsset = operationParam ? {
      uri: `${extension.assets.download.uri}${URI.parse(extension.assets.download.uri).query ? "&" : "?"}${operationParam}=true`,
      fallbackUri: `${extension.assets.download.fallbackUri}${URI.parse(extension.assets.download.fallbackUri).query ? "&" : "?"}${operationParam}=true`
    } : extension.assets.download;
    const activityId = extension.queryContext?.[SEARCH_ACTIVITY_HEADER_NAME];
    const headers = activityId && typeof activityId === "string" ? { [SEARCH_ACTIVITY_HEADER_NAME]: activityId } : void 0;
    const context = await this.getAsset(extension.identifier.id, downloadAsset, AssetType.VSIX, extension.version, "extensionGalleryService.download", headers ? { headers } : void 0);
    try {
      await this.fileService.writeFile(location, context.stream);
    } catch (error) {
      try {
        await this.fileService.del(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
      }
      throw new ExtensionGalleryError(getErrorMessage(error), ExtensionGalleryErrorCode.DownloadFailedWriting);
    }
    this.telemetryService.publicLog("galleryService:downloadVSIX", { ...data, duration: (/* @__PURE__ */ new Date()).getTime() - startTime });
  }
  async downloadSignatureArchive(extension, location) {
    if (!extension.assets.signature) {
      throw new Error("No signature asset found");
    }
    this.logService.trace("ExtensionGalleryService#downloadSignatureArchive", extension.identifier.id);
    const context = await this.getAsset(extension.identifier.id, extension.assets.signature, AssetType.Signature, extension.version, "extensionGalleryService.signature");
    try {
      await this.fileService.writeFile(location, context.stream);
    } catch (error) {
      try {
        await this.fileService.del(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
      }
      throw new ExtensionGalleryError(getErrorMessage(error), ExtensionGalleryErrorCode.DownloadFailedWriting);
    }
  }
  async getReadme(extension, token) {
    if (extension.assets.readme) {
      const context = await this.getAsset(extension.identifier.id, extension.assets.readme, AssetType.Details, extension.version, "extensionGalleryService.readme", {}, token);
      const content = await asTextOrError(context);
      return content || "";
    }
    return "";
  }
  async getManifest(extension, token) {
    if (extension.assets.manifest) {
      const context = await this.getAsset(extension.identifier.id, extension.assets.manifest, AssetType.Manifest, extension.version, "extensionGalleryService.manifest", {}, token);
      const text = await asTextOrError(context);
      return text ? JSON.parse(text) : null;
    }
    return null;
  }
  async getCoreTranslation(extension, languageId) {
    const asset = extension.assets.coreTranslations.filter((t) => t[0] === languageId.toUpperCase())[0];
    if (asset) {
      const context = await this.getAsset(extension.identifier.id, asset[1], asset[0], extension.version, "extensionGalleryService.coreTranslation");
      const text = await asTextOrError(context);
      return text ? JSON.parse(text) : null;
    }
    return null;
  }
  async getChangelog(extension, token) {
    if (extension.assets.changelog) {
      const context = await this.getAsset(extension.identifier.id, extension.assets.changelog, AssetType.Changelog, extension.version, "extensionGalleryService.changelog", {}, token);
      const content = await asTextOrError(context);
      return content || "";
    }
    return "";
  }
  async getAllVersions(extensionIdentifier) {
    return this.getVersions(extensionIdentifier);
  }
  async getAllCompatibleVersions(extensionIdentifier, includePreRelease, targetPlatform) {
    return this.getVersions(extensionIdentifier, { version: includePreRelease ? 2 /* Latest */ : 0 /* Release */, targetPlatform });
  }
  async getVersions(extensionIdentifier, onlyCompatible) {
    const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!extensionGalleryManifest) {
      throw new Error("No extension gallery service configured.");
    }
    let query = new Query().withFlags(Flag.IncludeVersions, Flag.IncludeCategoryAndTags, Flag.IncludeFiles, Flag.IncludeVersionProperties).withPage(1, 1);
    if (extensionIdentifier.uuid) {
      query = query.withFilter(FilterType.ExtensionId, extensionIdentifier.uuid);
    } else {
      query = query.withFilter(FilterType.ExtensionName, extensionIdentifier.id);
    }
    const { galleryExtensions } = await this.queryRawGalleryExtensions(query, extensionGalleryManifest, CancellationToken.None);
    if (!galleryExtensions.length) {
      return [];
    }
    const allTargetPlatforms = getAllTargetPlatforms(galleryExtensions[0]);
    if (onlyCompatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, onlyCompatible.targetPlatform)) {
      return [];
    }
    const versions = [];
    const productVersion = { version: this.productService.version, date: this.productService.date };
    await Promise.all(galleryExtensions[0].versions.map(async (version) => {
      try {
        if (await this.isValidVersion(
          {
            id: extensionIdentifier.id,
            version: version.version,
            isPreReleaseVersion: isPreReleaseVersion(version),
            targetPlatform: getTargetPlatformForExtensionVersion(version),
            engine: getEngine(version),
            manifestAsset: getVersionAsset(version, AssetType.Manifest),
            enabledApiProposals: getEnabledApiProposals(version)
          },
          {
            compatible: !!onlyCompatible,
            productVersion,
            targetPlatform: onlyCompatible?.targetPlatform,
            version: onlyCompatible?.version ?? version.version
          },
          galleryExtensions[0].publisher.displayName,
          allTargetPlatforms
        )) {
          versions.push(version);
        }
      } catch (error) {
      }
    }));
    const result = [];
    const seen = /* @__PURE__ */ new Map();
    for (const version of sortExtensionVersions(versions, onlyCompatible?.targetPlatform ?? CURRENT_TARGET_PLATFORM)) {
      const index = seen.get(version.version);
      const existing = index !== void 0 ? result[index] : void 0;
      const targetPlatform = getTargetPlatformForExtensionVersion(version);
      if (!existing) {
        seen.set(version.version, result.length);
        result.push({ version: version.version, date: version.lastUpdated, isPreReleaseVersion: isPreReleaseVersion(version), targetPlatforms: [targetPlatform] });
      } else {
        existing.targetPlatforms.push(targetPlatform);
      }
    }
    return result;
  }
  async getAsset(extension, asset, assetType, extensionVersion, callSite, options = {}, token = CancellationToken.None) {
    const commonHeaders = await this.commonHeadersPromise;
    const baseOptions = { type: "GET" };
    const headers = { ...commonHeaders, ...options.headers || {} };
    options = { ...options, ...baseOptions, headers };
    const url = asset.uri;
    const fallbackUrl = asset.fallbackUri;
    const firstOptions = { ...options, url, timeout: this.getRequestTimeout(), callSite };
    let context;
    try {
      context = await this.requestService.request(firstOptions, token);
      if (context.res.statusCode === 200) {
        return context;
      }
      const message = await asTextOrError(context);
      throw new Error(`Expected 200, got back ${context.res.statusCode} instead.

${message}`);
    } catch (err) {
      if (isCancellationError(err)) {
        throw err;
      }
      const message = getErrorMessage(err);
      this.telemetryService.publicLog2("galleryService:cdnFallback", {
        extension,
        assetType,
        message,
        extensionVersion,
        server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
        activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
        endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME)
      });
      const fallbackOptions = { ...options, url: fallbackUrl, timeout: this.getRequestTimeout(), callSite: `${callSite}.fallback` };
      return this.requestService.request(fallbackOptions, token);
    }
  }
  async getExtensionsControlManifest() {
    const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!manifest) {
      throw new Error("No extension gallery service configured.");
    }
    if (!this.extensionsControlUrl) {
      return { malicious: [], deprecated: {}, search: [], autoUpdate: {} };
    }
    const context = await this.requestService.request({
      type: "GET",
      url: this.extensionsControlUrl,
      timeout: this.getRequestTimeout(),
      callSite: "extensionGalleryService.getExtensionsControlManifest"
    }, CancellationToken.None);
    if (context.res.statusCode !== 200) {
      throw new Error("Could not get extensions report.");
    }
    const result = await asJson(context);
    const malicious = [];
    const deprecated = {};
    const search = [];
    const autoUpdate = result?.autoUpdate ?? {};
    if (result) {
      for (const id of result.malicious) {
        if (!isString(id)) {
          continue;
        }
        const publisherOrExtension = EXTENSION_IDENTIFIER_REGEX.test(id) ? { id } : id;
        malicious.push({ extensionOrPublisher: publisherOrExtension, learnMoreLink: result.learnMoreLinks?.[id] });
      }
      if (result.migrateToPreRelease) {
        for (const [unsupportedPreReleaseExtensionId, preReleaseExtensionInfo] of Object.entries(result.migrateToPreRelease)) {
          if (!preReleaseExtensionInfo.engine || isEngineValid(preReleaseExtensionInfo.engine, this.productService.version, this.productService.date)) {
            deprecated[unsupportedPreReleaseExtensionId.toLowerCase()] = {
              disallowInstall: true,
              extension: {
                id: preReleaseExtensionInfo.id,
                displayName: preReleaseExtensionInfo.displayName,
                autoMigrate: { storage: !!preReleaseExtensionInfo.migrateStorage },
                preRelease: true
              }
            };
          }
        }
      }
      if (result.deprecated) {
        for (const [deprecatedExtensionId, deprecationInfo] of Object.entries(result.deprecated)) {
          if (deprecationInfo) {
            deprecated[deprecatedExtensionId.toLowerCase()] = isBoolean(deprecationInfo) ? {} : deprecationInfo;
          }
        }
      }
      if (result.search) {
        for (const s of result.search) {
          search.push(s);
        }
      }
    }
    deprecated[this.productService.defaultChatAgent.extensionId.toLowerCase()] = {
      disallowInstall: true,
      extension: {
        id: this.productService.defaultChatAgent.chatExtensionId,
        displayName: "GitHub Copilot Chat",
        autoMigrate: { storage: false, donotDisable: true },
        preRelease: this.productService.quality !== "stable"
      }
    };
    return { malicious, deprecated, search, autoUpdate };
  }
  getRequestTimeout() {
    const configuredTimeout = this.configurationService.getValue(ExtensionRequestsTimeoutConfigKey);
    return isNumber(configuredTimeout) && configuredTimeout >= 0 ? configuredTimeout : 6e4;
  }
};
AbstractExtensionGalleryService = __decorateClass([
  __decorateParam(1, IRequestService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAllowedExtensionsService),
  __decorateParam(9, IExtensionGalleryManifestService)
], AbstractExtensionGalleryService);
let ExtensionGalleryService = class extends AbstractExtensionGalleryService {
  constructor(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
    super(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService);
  }
};
ExtensionGalleryService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IRequestService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAllowedExtensionsService),
  __decorateParam(9, IExtensionGalleryManifestService)
], ExtensionGalleryService);
let ExtensionGalleryServiceWithNoStorageService = class extends AbstractExtensionGalleryService {
  constructor(requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
    super(void 0, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService);
  }
};
ExtensionGalleryServiceWithNoStorageService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAllowedExtensionsService),
  __decorateParam(8, IExtensionGalleryManifestService)
], ExtensionGalleryServiceWithNoStorageService);
export {
  AbstractExtensionGalleryService,
  ExtensionGalleryService,
  ExtensionGalleryServiceWithNoStorageService,
  filterLatestExtensionVersionsForTargetPlatform,
  sortExtensionVersions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgZ2V0RXJyb3JNZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElQYWdlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBpc1dlYiwgcGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhcmNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzTnVtYmVyLCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSGVhZGVycywgSVJlcXVlc3RDb250ZXh0LCBJUmVxdWVzdE9wdGlvbnMsIGlzT2ZmbGluZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBnZXRUYXJnZXRQbGF0Zm9ybSwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkluZm8sIElHYWxsZXJ5RXh0ZW5zaW9uLCBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0LCBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0cywgSUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBJbnN0YWxsT3BlcmF0aW9uLCBJUXVlcnlPcHRpb25zLCBJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCwgaXNOb3RXZWJFeHRlbnNpb25JbldlYlRhcmdldFBsYXRmb3JtLCBpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZSwgSVRyYW5zbGF0aW9uLCBTb3J0T3JkZXIsIFN0YXRpc3RpY1R5cGUsIHRvVGFyZ2V0UGxhdGZvcm0sIFdFQl9FWFRFTlNJT05fVEFHLCBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCBJRGVwcmVjYXRpb25JbmZvLCBJU2VhcmNoUHJlZmZlcmVkUmVzdWx0cywgRXh0ZW5zaW9uR2FsbGVyeUVycm9yLCBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLCBJUHJvZHVjdFZlcnNpb24sIElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsIEVYVEVOU0lPTl9JREVOVElGSUVSX1JFR0VYLCBTb3J0QnksIEZpbHRlclR5cGUsIE1hbGljaW91c0V4dGVuc2lvbkluZm8sIEV4dGVuc2lvblJlcXVlc3RzVGltZW91dENvbmZpZ0tleSB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhZG9wdFRvR2FsbGVyeUV4dGVuc2lvbklkLCBhcmVTYW1lRXh0ZW5zaW9ucywgZ2V0R2FsbGVyeUV4dGVuc2lvbklkLCBnZXRHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YSB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0LCBUYXJnZXRQbGF0Zm9ybSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgaXNFbmdpbmVWYWxpZCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvblZhbGlkYXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIGFzVGV4dE9yRXJyb3IsIElSZXF1ZXN0U2VydmljZSwgaXNDbGllbnRFcnJvciwgaXNTZXJ2ZXJFcnJvciwgaXNTdWNjZXNzIH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyByZXNvbHZlTWFya2V0cGxhY2VIZWFkZXJzIH0gZnJvbSAnLi4vLi4vZXh0ZXJuYWxTZXJ2aWNlcy9jb21tb24vbWFya2V0cGxhY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBmb3JtYXQyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLCBGbGFnLCBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaSwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsIEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cyB9IGZyb20gJy4vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5jb25zdCBDVVJSRU5UX1RBUkdFVF9QTEFURk9STSA9IGlzV2ViID8gVGFyZ2V0UGxhdGZvcm0uV0VCIDogZ2V0VGFyZ2V0UGxhdGZvcm0ocGxhdGZvcm0sIGFyY2gpO1xuY29uc3QgU0VBUkNIX0FDVElWSVRZX0hFQURFUl9OQU1FID0gJ1gtTWFya2V0LVNlYXJjaC1BY3Rpdml0eS1JZCc7XG5jb25zdCBBQ1RJVklUWV9IRUFERVJfTkFNRSA9ICdBY3Rpdml0eWlkJztcbmNvbnN0IFNFUlZFUl9IRUFERVJfTkFNRSA9ICdTZXJ2ZXInO1xuY29uc3QgRU5EX0VORF9JRF9IRUFERVJfTkFNRSA9ICdYLVZzcy1FMmVpZCc7XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeUV4dGVuc2lvbkZpbGUge1xuXHRyZWFkb25seSBhc3NldFR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgc291cmNlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeUV4dGVuc2lvblByb3BlcnR5IHtcblx0cmVhZG9ubHkga2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uIHtcblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSBsYXN0VXBkYXRlZDogc3RyaW5nO1xuXHRyZWFkb25seSBhc3NldFVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBmYWxsYmFja0Fzc2V0VXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbGVzOiBJUmF3R2FsbGVyeUV4dGVuc2lvbkZpbGVbXTtcblx0cHJvcGVydGllcz86IElSYXdHYWxsZXJ5RXh0ZW5zaW9uUHJvcGVydHlbXTtcblx0cmVhZG9ubHkgdGFyZ2V0UGxhdGZvcm0/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeUV4dGVuc2lvblN0YXRpc3RpY3Mge1xuXHRyZWFkb25seSBzdGF0aXN0aWNOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZhbHVlOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeUV4dGVuc2lvblB1Ymxpc2hlciB7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHB1Ymxpc2hlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHB1Ymxpc2hlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZG9tYWluPzogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgaXNEb21haW5WZXJpZmllZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxpbmtUeXBlPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb24ge1xuXHRyZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25OYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNob3J0RGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHB1Ymxpc2hlcjogSVJhd0dhbGxlcnlFeHRlbnNpb25QdWJsaXNoZXI7XG5cdHJlYWRvbmx5IHZlcnNpb25zOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXTtcblx0cmVhZG9ubHkgc3RhdGlzdGljczogSVJhd0dhbGxlcnlFeHRlbnNpb25TdGF0aXN0aWNzW107XG5cdHJlYWRvbmx5IHRhZ3M6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZWxlYXNlRGF0ZTogc3RyaW5nO1xuXHRyZWFkb25seSBwdWJsaXNoZWREYXRlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhc3RVcGRhdGVkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhdGVnb3JpZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBmbGFnczogc3RyaW5nO1xuXHRyZWFkb25seSBsaW5rVHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgcmF0aW5nTGlua1R5cGU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeUV4dGVuc2lvbnNSZXN1bHQge1xuXHRyZWFkb25seSBnYWxsZXJ5RXh0ZW5zaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25bXTtcblx0cmVhZG9ubHkgdG90YWw6IG51bWJlcjtcblx0cmVhZG9ubHkgY29udGV4dD86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeVF1ZXJ5UmVzdWx0IHtcblx0cmVhZG9ubHkgcmVzdWx0czoge1xuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbnM6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uW107XG5cdFx0cmVhZG9ubHkgcmVzdWx0TWV0YWRhdGE6IHtcblx0XHRcdHJlYWRvbmx5IG1ldGFkYXRhVHlwZTogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgbWV0YWRhdGFJdGVtczoge1xuXHRcdFx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdFx0XHR9W107XG5cdFx0fVtdO1xuXHR9W107XG59XG5cbmNvbnN0IEFzc2V0VHlwZSA9IHtcblx0SWNvbjogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uU2VydmljZXMuSWNvbnMuRGVmYXVsdCcsXG5cdERldGFpbHM6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLkNvbnRlbnQuRGV0YWlscycsXG5cdENoYW5nZWxvZzogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uU2VydmljZXMuQ29udGVudC5DaGFuZ2Vsb2cnLFxuXHRNYW5pZmVzdDogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5NYW5pZmVzdCcsXG5cdFZTSVg6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLlZTSVhQYWNrYWdlJyxcblx0TGljZW5zZTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uU2VydmljZXMuQ29udGVudC5MaWNlbnNlJyxcblx0UmVwb3NpdG9yeTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uU2VydmljZXMuTGlua3MuU291cmNlJyxcblx0U2lnbmF0dXJlOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5TZXJ2aWNlcy5Wc2l4U2lnbmF0dXJlJ1xufTtcblxuY29uc3QgUHJvcGVydHlUeXBlID0ge1xuXHREZXBlbmRlbmN5OiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLkV4dGVuc2lvbkRlcGVuZGVuY2llcycsXG5cdEV4dGVuc2lvblBhY2s6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLkNvZGUuRXh0ZW5zaW9uUGFjaycsXG5cdEVuZ2luZTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5FbmdpbmUnLFxuXHRQcmVSZWxlYXNlOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLlByZVJlbGVhc2UnLFxuXHRFbmFibGVkQXBpUHJvcG9zYWxzOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLkVuYWJsZWRBcGlQcm9wb3NhbHMnLFxuXHRMb2NhbGl6ZWRMYW5ndWFnZXM6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLkNvZGUuTG9jYWxpemVkTGFuZ3VhZ2VzJyxcblx0V2ViRXh0ZW5zaW9uOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLldlYkV4dGVuc2lvbicsXG5cdFNwb25zb3JMaW5rOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLlNwb25zb3JMaW5rJyxcblx0U3VwcG9ydExpbms6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLkxpbmtzLlN1cHBvcnQnLFxuXHRFeGVjdXRlc0NvZGU6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLkNvZGUuRXhlY3V0ZXNDb2RlJyxcblx0UHJpdmF0ZTogJ1ByaXZhdGVNYXJrZXRwbGFjZScsXG59O1xuXG5pbnRlcmZhY2UgSUNyaXRlcml1bSB7XG5cdHJlYWRvbmx5IGZpbHRlclR5cGU6IEZpbHRlclR5cGU7XG5cdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xufVxuXG5jb25zdCBEZWZhdWx0UGFnZVNpemUgPSAxMDtcblxuaW50ZXJmYWNlIElRdWVyeVN0YXRlIHtcblx0cmVhZG9ubHkgcGFnZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBwYWdlU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBzb3J0Qnk6IFNvcnRCeTtcblx0cmVhZG9ubHkgc29ydE9yZGVyOiBTb3J0T3JkZXI7XG5cdHJlYWRvbmx5IGZsYWdzOiBGbGFnW107XG5cdHJlYWRvbmx5IGNyaXRlcmlhOiBJQ3JpdGVyaXVtW107XG5cdHJlYWRvbmx5IGFzc2V0VHlwZXM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzb3VyY2U/OiBzdHJpbmc7XG59XG5cbmNvbnN0IERlZmF1bHRRdWVyeVN0YXRlOiBJUXVlcnlTdGF0ZSA9IHtcblx0cGFnZU51bWJlcjogMSxcblx0cGFnZVNpemU6IERlZmF1bHRQYWdlU2l6ZSxcblx0c29ydEJ5OiBTb3J0QnkuTm9uZU9yUmVsZXZhbmNlLFxuXHRzb3J0T3JkZXI6IFNvcnRPcmRlci5EZWZhdWx0LFxuXHRmbGFnczogW10sXG5cdGNyaXRlcmlhOiBbXSxcblx0YXNzZXRUeXBlczogW11cbn07XG5cbnR5cGUgR2FsbGVyeVNlcnZpY2VRdWVyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ0luZm9ybWF0aW9uIGFib3V0IE1hcmtldHBsYWNlIHF1ZXJ5IGFuZCBpdHMgcmVzcG9uc2UnO1xuXHRyZWFkb25seSBmaWx0ZXJUeXBlczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0ZpbHRlciB0eXBlcyB1c2VkIGluIHRoZSBxdWVyeS4nIH07XG5cdHJlYWRvbmx5IGZsYWdzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmxhZ3MgcGFzc2VkIGluIHRoZSBxdWVyeS4nIH07XG5cdHJlYWRvbmx5IHNvcnRCeTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3NvcnRlZCBieSBvcHRpb24gcGFzc2VkIGluIHRoZSBxdWVyeScgfTtcblx0cmVhZG9ubHkgc29ydE9yZGVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnc29ydCBvcmRlciBvcHRpb24gcGFzc2VkIGluIHRoZSBxdWVyeScgfTtcblx0cmVhZG9ubHkgcGFnZU51bWJlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3JlcXVlc3RlZCBwYWdlIG51bWJlciBpbiB0aGUgcXVlcnknIH07XG5cdHJlYWRvbmx5IGR1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyAnaXNNZWFzdXJlbWVudCc6IHRydWU7IGNvbW1lbnQ6ICdhbW91bnQgb2YgdGltZSB0YWtlbiBieSB0aGUgcXVlcnkgcmVxdWVzdCcgfTtcblx0cmVhZG9ubHkgc3VjY2VzczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3doZXRoZXIgdGhlIHF1ZXJ5IHJlcXVlc3QgaXMgc3VjY2VzcyBvciBub3QnIH07XG5cdHJlYWRvbmx5IHJlcXVlc3RCb2R5U2l6ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3NpemUgb2YgdGhlIHJlcXVlc3QgYm9keScgfTtcblx0cmVhZG9ubHkgcmVzcG9uc2VCb2R5U2l6ZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzaXplIG9mIHRoZSByZXNwb25zZSBib2R5JyB9O1xuXHRyZWFkb25seSBzdGF0dXNDb2RlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3N0YXR1cyBjb2RlIG9mIHRoZSByZXNwb25zZScgfTtcblx0cmVhZG9ubHkgZXJyb3JDb2RlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ2Vycm9yIGNvZGUgb2YgdGhlIHJlc3BvbnNlJyB9O1xuXHRyZWFkb25seSBjb3VudD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICd0b3RhbCBudW1iZXIgb2YgZXh0ZW5zaW9ucyBtYXRjaGluZyB0aGUgcXVlcnknIH07XG5cdHJlYWRvbmx5IHNvdXJjZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzb3VyY2UgdGhhdCByZXF1ZXN0ZWQgdGhpcyBxdWVyeSwgZWcuLCByZWNvbW1lbmRhdGlvbnMsIHZpZXdsZXQnIH07XG5cdHJlYWRvbmx5IHNlYXJjaFRleHRMZW5ndGg/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnbGVuZ3RoIG9mIHRoZSBzZWFyY2ggdGV4dCBpbiB0aGUgcXVlcnknIH07XG5cdHJlYWRvbmx5IHNlcnZlcj86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzZXJ2ZXIgdGhhdCBoYW5kbGVkIHRoZSBxdWVyeScgfTtcblx0cmVhZG9ubHkgZW5kVG9FbmRJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdlbmQgdG8gZW5kIG9wZXJhdGlvbiBpZCcgfTtcblx0cmVhZG9ubHkgYWN0aXZpdHlJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdhY3Rpdml0eSBpZCcgfTtcbn07XG5cbnR5cGUgUXVlcnlUZWxlbWV0cnlEYXRhID0ge1xuXHRyZWFkb25seSBmaWx0ZXJUeXBlczogc3RyaW5nW107XG5cdHJlYWRvbmx5IGZsYWdzOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgc29ydEJ5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvcnRPcmRlcjogc3RyaW5nO1xuXHRyZWFkb25seSBwYWdlTnVtYmVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvdXJjZT86IHN0cmluZztcblx0cmVhZG9ubHkgc2VhcmNoVGV4dExlbmd0aD86IG51bWJlcjtcbn07XG5cbnR5cGUgR2FsbGVyeVNlcnZpY2VRdWVyeUV2ZW50ID0gUXVlcnlUZWxlbWV0cnlEYXRhICYge1xuXHRyZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuXHRyZWFkb25seSBzdWNjZXNzOiBib29sZWFuO1xuXHRyZWFkb25seSByZXF1ZXN0Qm9keVNpemU6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzcG9uc2VCb2R5U2l6ZT86IHN0cmluZztcblx0cmVhZG9ubHkgc3RhdHVzQ29kZT86IHN0cmluZztcblx0cmVhZG9ubHkgZXJyb3JDb2RlPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb3VudD86IHN0cmluZztcblx0cmVhZG9ubHkgc2VydmVyPzogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdHJlYWRvbmx5IGVuZFRvRW5kSWQ/OiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0cmVhZG9ubHkgYWN0aXZpdHlJZD86IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xufTtcblxudHlwZSBHYWxsZXJ5U2VydmljZUFkZGl0aW9uYWxRdWVyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ1Jlc3BvbnNlIGluZm9ybWF0aW9uIGFib3V0IHRoZSBhZGRpdGlvbmFsIHF1ZXJ5IHRvIHRoZSBNYXJrZXRwbGFjZSBmb3IgZmV0Y2hpbmcgYWxsIHZlcnNpb25zIHRvIGdldCByZWxlYXNlIHZlcnNpb24nO1xuXHRyZWFkb25seSBkdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgJ2lzTWVhc3VyZW1lbnQnOiB0cnVlOyBjb21tZW50OiAnQW1vdW50IG9mIHRpbWUgdGFrZW4gYnkgdGhlIGFkZGl0aW9uYWwgcXVlcnknIH07XG5cdHJlYWRvbmx5IGNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG90YWwgbnVtYmVyIG9mIGV4dGVuc2lvbnMgcmV0dXJuZWQgYnkgdGhpcyBhZGRpdGlvbmFsIHF1ZXJ5JyB9O1xufTtcblxudHlwZSBHYWxsZXJ5U2VydmljZUFkZGl0aW9uYWxRdWVyeUV2ZW50ID0ge1xuXHRyZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBFeHRlbnNpb25zQ3JpdGVyaWEgPSB7XG5cdHJlYWRvbmx5IHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb247XG5cdHJlYWRvbmx5IHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybTtcblx0cmVhZG9ubHkgY29tcGF0aWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5jbHVkZVByZVJlbGVhc2U6IGJvb2xlYW4gfCAoSUV4dGVuc2lvbklkZW50aWZpZXIgJiB7IGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuIH0pW107XG5cdHJlYWRvbmx5IHZlcnNpb25zPzogKElFeHRlbnNpb25JZGVudGlmaWVyICYgeyB2ZXJzaW9uOiBzdHJpbmcgfSlbXTtcblx0cmVhZG9ubHkgaXNRdWVyeUZvclJlbGVhc2VWZXJzaW9uRnJvbVByZVJlbGVhc2VWZXJzaW9uPzogYm9vbGVhbjtcbn07XG5cbmNvbnN0IGVudW0gVmVyc2lvbktpbmQge1xuXHRSZWxlYXNlLFxuXHRQcmVyZWxlYXNlLFxuXHRMYXRlc3Rcbn1cblxudHlwZSBFeHRlbnNpb25WZXJzaW9uQ3JpdGVyaWEgPSB7XG5cdHJlYWRvbmx5IHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb247XG5cdHJlYWRvbmx5IHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybTtcblx0cmVhZG9ubHkgY29tcGF0aWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgdmVyc2lvbjogVmVyc2lvbktpbmQgfCBzdHJpbmc7XG59O1xuXG5jbGFzcyBRdWVyeSB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzdGF0ZSA9IERlZmF1bHRRdWVyeVN0YXRlKSB7IH1cblxuXHRnZXQgcGFnZU51bWJlcigpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zdGF0ZS5wYWdlTnVtYmVyOyB9XG5cdGdldCBwYWdlU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zdGF0ZS5wYWdlU2l6ZTsgfVxuXHRnZXQgc29ydEJ5KCk6IFNvcnRCeSB7IHJldHVybiB0aGlzLnN0YXRlLnNvcnRCeTsgfVxuXHRnZXQgc29ydE9yZGVyKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnN0YXRlLnNvcnRPcmRlcjsgfVxuXHRnZXQgZmxhZ3MoKTogRmxhZ1tdIHsgcmV0dXJuIHRoaXMuc3RhdGUuZmxhZ3M7IH1cblx0Z2V0IGNyaXRlcmlhKCk6IElDcml0ZXJpdW1bXSB7IHJldHVybiB0aGlzLnN0YXRlLmNyaXRlcmlhOyB9XG5cdGdldCBhc3NldFR5cGVzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIHRoaXMuc3RhdGUuYXNzZXRUeXBlczsgfVxuXHRnZXQgc291cmNlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnN0YXRlLnNvdXJjZTsgfVxuXHRnZXQgc2VhcmNoVGV4dCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNyaXRlcml1bSA9IHRoaXMuc3RhdGUuY3JpdGVyaWEuZmlsdGVyKGNyaXRlcml1bSA9PiBjcml0ZXJpdW0uZmlsdGVyVHlwZSA9PT0gRmlsdGVyVHlwZS5TZWFyY2hUZXh0KVswXTtcblx0XHRyZXR1cm4gY3JpdGVyaXVtICYmIGNyaXRlcml1bS52YWx1ZSA/IGNyaXRlcml1bS52YWx1ZSA6ICcnO1xuXHR9XG5cblxuXHR3aXRoUGFnZShwYWdlTnVtYmVyOiBudW1iZXIsIHBhZ2VTaXplOiBudW1iZXIgPSB0aGlzLnN0YXRlLnBhZ2VTaXplKTogUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBwYWdlTnVtYmVyLCBwYWdlU2l6ZSB9KTtcblx0fVxuXG5cdHdpdGhGaWx0ZXIoZmlsdGVyVHlwZTogRmlsdGVyVHlwZSwgLi4udmFsdWVzOiBzdHJpbmdbXSk6IFF1ZXJ5IHtcblx0XHRjb25zdCBjcml0ZXJpYSA9IFtcblx0XHRcdC4uLnRoaXMuc3RhdGUuY3JpdGVyaWEsXG5cdFx0XHQuLi52YWx1ZXMubGVuZ3RoID8gdmFsdWVzLm1hcCh2YWx1ZSA9PiAoeyBmaWx0ZXJUeXBlLCB2YWx1ZSB9KSkgOiBbeyBmaWx0ZXJUeXBlIH1dXG5cdFx0XTtcblxuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBjcml0ZXJpYSB9KTtcblx0fVxuXG5cdHdpdGhTb3J0Qnkoc29ydEJ5OiBTb3J0QnkpOiBRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBRdWVyeSh7IC4uLnRoaXMuc3RhdGUsIHNvcnRCeSB9KTtcblx0fVxuXG5cdHdpdGhTb3J0T3JkZXIoc29ydE9yZGVyOiBTb3J0T3JkZXIpOiBRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBRdWVyeSh7IC4uLnRoaXMuc3RhdGUsIHNvcnRPcmRlciB9KTtcblx0fVxuXG5cdHdpdGhGbGFncyguLi5mbGFnczogRmxhZ1tdKTogUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBmbGFnczogZGlzdGluY3QoZmxhZ3MpIH0pO1xuXHR9XG5cblx0d2l0aEFzc2V0VHlwZXMoLi4uYXNzZXRUeXBlczogc3RyaW5nW10pOiBRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBRdWVyeSh7IC4uLnRoaXMuc3RhdGUsIGFzc2V0VHlwZXMgfSk7XG5cdH1cblxuXHR3aXRoU291cmNlKHNvdXJjZTogc3RyaW5nKTogUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBzb3VyY2UgfSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U3RhdGlzdGljKHN0YXRpc3RpY3M6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uU3RhdGlzdGljc1tdLCBuYW1lOiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCByZXN1bHQgPSAoc3RhdGlzdGljcyB8fCBbXSkuZmlsdGVyKHMgPT4gcy5zdGF0aXN0aWNOYW1lID09PSBuYW1lKVswXTtcblx0cmV0dXJuIHJlc3VsdCA/IHJlc3VsdC52YWx1ZSA6IDA7XG59XG5cbmZ1bmN0aW9uIGdldENvcmVUcmFuc2xhdGlvbkFzc2V0cyh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pOiBbc3RyaW5nLCBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0XVtdIHtcblx0Y29uc3QgY29yZVRyYW5zbGF0aW9uQXNzZXRQcmVmaXggPSAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLlRyYW5zbGF0aW9uLic7XG5cdGNvbnN0IHJlc3VsdCA9IHZlcnNpb24uZmlsZXMuZmlsdGVyKGYgPT4gZi5hc3NldFR5cGUuaW5kZXhPZihjb3JlVHJhbnNsYXRpb25Bc3NldFByZWZpeCkgPT09IDApO1xuXHRyZXR1cm4gcmVzdWx0LnJlZHVjZTxbc3RyaW5nLCBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0XVtdPigocmVzdWx0LCBmaWxlKSA9PiB7XG5cdFx0Y29uc3QgYXNzZXQgPSBnZXRWZXJzaW9uQXNzZXQodmVyc2lvbiwgZmlsZS5hc3NldFR5cGUpO1xuXHRcdGlmIChhc3NldCkge1xuXHRcdFx0cmVzdWx0LnB1c2goW2ZpbGUuYXNzZXRUeXBlLnN1YnN0cmluZyhjb3JlVHJhbnNsYXRpb25Bc3NldFByZWZpeC5sZW5ndGgpLCBhc3NldF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9LCBbXSk7XG59XG5cbmZ1bmN0aW9uIGdldFJlcG9zaXRvcnlBc3NldCh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pOiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbCB7XG5cdGlmICh2ZXJzaW9uLnByb3BlcnRpZXMpIHtcblx0XHRjb25zdCByZXN1bHRzID0gdmVyc2lvbi5wcm9wZXJ0aWVzLmZpbHRlcihwID0+IHAua2V5ID09PSBBc3NldFR5cGUuUmVwb3NpdG9yeSk7XG5cdFx0Y29uc3QgZ2l0UmVnRXhwID0gbmV3IFJlZ0V4cCgnKChnaXR8c3NofGh0dHAocyk/KXwoZ2l0QFtcXFxcdy5dKykpKDooLy8pPykoW1xcXFx3LkA6L1xcXFwtfl0rKSguZ2l0KSgvKT8nKTtcblxuXHRcdGNvbnN0IHVyaSA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gZ2l0UmVnRXhwLnRlc3Qoci52YWx1ZSkpWzBdO1xuXHRcdHJldHVybiB1cmkgPyB7IHVyaTogdXJpLnZhbHVlLCBmYWxsYmFja1VyaTogdXJpLnZhbHVlIH0gOiBudWxsO1xuXHR9XG5cdHJldHVybiBnZXRWZXJzaW9uQXNzZXQodmVyc2lvbiwgQXNzZXRUeXBlLlJlcG9zaXRvcnkpO1xufVxuXG5mdW5jdGlvbiBnZXREb3dubG9hZEFzc2V0KHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQge1xuXHRyZXR1cm4ge1xuXHRcdC8vIGFsd2F5cyB1c2UgZmFsbGJhY2tBc3NldFVyaSBmb3IgZG93bmxvYWQgYXNzZXQgdG8gaGl0IHRoZSBNYXJrZXRwbGFjZSBBUEkgc28gdGhhdCBkb3dubG9hZHMgYXJlIGNvdW50ZWRcblx0XHR1cmk6IGAke3ZlcnNpb24uZmFsbGJhY2tBc3NldFVyaX0vJHtBc3NldFR5cGUuVlNJWH0/cmVkaXJlY3Q9dHJ1ZSR7dmVyc2lvbi50YXJnZXRQbGF0Zm9ybSA/IGAmdGFyZ2V0UGxhdGZvcm09JHt2ZXJzaW9uLnRhcmdldFBsYXRmb3JtfWAgOiAnJ31gLFxuXHRcdGZhbGxiYWNrVXJpOiBgJHt2ZXJzaW9uLmZhbGxiYWNrQXNzZXRVcml9LyR7QXNzZXRUeXBlLlZTSVh9JHt2ZXJzaW9uLnRhcmdldFBsYXRmb3JtID8gYD90YXJnZXRQbGF0Zm9ybT0ke3ZlcnNpb24udGFyZ2V0UGxhdGZvcm19YCA6ICcnfWBcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiwgdHlwZTogc3RyaW5nKTogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGwge1xuXHRjb25zdCByZXN1bHQgPSB2ZXJzaW9uLmZpbGVzLmZpbHRlcihmID0+IGYuYXNzZXRUeXBlID09PSB0eXBlKVswXTtcblx0cmV0dXJuIHJlc3VsdCA/IHtcblx0XHR1cmk6IGAke3ZlcnNpb24uYXNzZXRVcml9LyR7dHlwZX0ke3ZlcnNpb24udGFyZ2V0UGxhdGZvcm0gPyBgP3RhcmdldFBsYXRmb3JtPSR7dmVyc2lvbi50YXJnZXRQbGF0Zm9ybX1gIDogJyd9YCxcblx0XHRmYWxsYmFja1VyaTogYCR7dmVyc2lvbi5mYWxsYmFja0Fzc2V0VXJpfS8ke3R5cGV9JHt2ZXJzaW9uLnRhcmdldFBsYXRmb3JtID8gYD90YXJnZXRQbGF0Zm9ybT0ke3ZlcnNpb24udGFyZ2V0UGxhdGZvcm19YCA6ICcnfWBcblx0fSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldEV4dGVuc2lvbnModmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBwcm9wZXJ0eTogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCB2YWx1ZXMgPSB2ZXJzaW9uLnByb3BlcnRpZXMgPyB2ZXJzaW9uLnByb3BlcnRpZXMuZmlsdGVyKHAgPT4gcC5rZXkgPT09IHByb3BlcnR5KSA6IFtdO1xuXHRjb25zdCB2YWx1ZSA9IHZhbHVlcy5sZW5ndGggPiAwICYmIHZhbHVlc1swXS52YWx1ZTtcblx0cmV0dXJuIHZhbHVlID8gdmFsdWUuc3BsaXQoJywnKS5tYXAodiA9PiBhZG9wdFRvR2FsbGVyeUV4dGVuc2lvbklkKHYpKSA6IFtdO1xufVxuXG5mdW5jdGlvbiBnZXRFbmdpbmUodmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogc3RyaW5nIHtcblx0Y29uc3QgdmFsdWVzID0gdmVyc2lvbi5wcm9wZXJ0aWVzID8gdmVyc2lvbi5wcm9wZXJ0aWVzLmZpbHRlcihwID0+IHAua2V5ID09PSBQcm9wZXJ0eVR5cGUuRW5naW5lKSA6IFtdO1xuXHRyZXR1cm4gKHZhbHVlcy5sZW5ndGggPiAwICYmIHZhbHVlc1swXS52YWx1ZSkgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIHNldEVuZ2luZSh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIGVuZ2luZTogc3RyaW5nKTogdm9pZCB7XG5cdHZlcnNpb24ucHJvcGVydGllcyA9IHZlcnNpb24ucHJvcGVydGllcyA/PyBbXTtcblx0dmVyc2lvbi5wcm9wZXJ0aWVzLnB1c2goeyBrZXk6IFByb3BlcnR5VHlwZS5FbmdpbmUsIHZhbHVlOiBlbmdpbmUgfSk7XG59XG5cbmZ1bmN0aW9uIGlzUHJlUmVsZWFzZVZlcnNpb24odmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogYm9vbGVhbiB7XG5cdGNvbnN0IHZhbHVlcyA9IHZlcnNpb24ucHJvcGVydGllcyA/IHZlcnNpb24ucHJvcGVydGllcy5maWx0ZXIocCA9PiBwLmtleSA9PT0gUHJvcGVydHlUeXBlLlByZVJlbGVhc2UpIDogW107XG5cdHJldHVybiB2YWx1ZXMubGVuZ3RoID4gMCAmJiB2YWx1ZXNbMF0udmFsdWUgPT09ICd0cnVlJztcbn1cblxuZnVuY3Rpb24gaGFzUHJlUmVsZWFzZUZvckV4dGVuc2lvbihpZDogc3RyaW5nLCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBwcm9kdWN0U2VydmljZS5leHRlbnNpb25Qcm9wZXJ0aWVzPy5baWQudG9Mb3dlckNhc2UoKV0/Lmhhc1ByZXJlbGVhc2VWZXJzaW9uO1xufVxuXG5mdW5jdGlvbiBnZXRFeGNsdWRlVmVyc2lvblJhbmdlRm9yRXh0ZW5zaW9uKGlkOiBzdHJpbmcsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uUHJvcGVydGllcz8uW2lkLnRvTG93ZXJDYXNlKCldPy5leGNsdWRlVmVyc2lvblJhbmdlO1xufVxuXG5mdW5jdGlvbiBpc1ByaXZhdGVFeHRlbnNpb24odmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogYm9vbGVhbiB7XG5cdGNvbnN0IHZhbHVlcyA9IHZlcnNpb24ucHJvcGVydGllcyA/IHZlcnNpb24ucHJvcGVydGllcy5maWx0ZXIocCA9PiBwLmtleSA9PT0gUHJvcGVydHlUeXBlLlByaXZhdGUpIDogW107XG5cdHJldHVybiB2YWx1ZXMubGVuZ3RoID4gMCAmJiB2YWx1ZXNbMF0udmFsdWUgPT09ICd0cnVlJztcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZXNDb2RlKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YWx1ZXMgPSB2ZXJzaW9uLnByb3BlcnRpZXMgPyB2ZXJzaW9uLnByb3BlcnRpZXMuZmlsdGVyKHAgPT4gcC5rZXkgPT09IFByb3BlcnR5VHlwZS5FeGVjdXRlc0NvZGUpIDogW107XG5cdHJldHVybiB2YWx1ZXMubGVuZ3RoID4gMCA/IHZhbHVlc1swXS52YWx1ZSA9PT0gJ3RydWUnIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRFbmFibGVkQXBpUHJvcG9zYWxzKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IHN0cmluZ1tdIHtcblx0Y29uc3QgdmFsdWVzID0gdmVyc2lvbi5wcm9wZXJ0aWVzID8gdmVyc2lvbi5wcm9wZXJ0aWVzLmZpbHRlcihwID0+IHAua2V5ID09PSBQcm9wZXJ0eVR5cGUuRW5hYmxlZEFwaVByb3Bvc2FscykgOiBbXTtcblx0Y29uc3QgdmFsdWUgPSAodmFsdWVzLmxlbmd0aCA+IDAgJiYgdmFsdWVzWzBdLnZhbHVlKSB8fCAnJztcblx0cmV0dXJuIHZhbHVlID8gdmFsdWUuc3BsaXQoJywnKSA6IFtdO1xufVxuXG5mdW5jdGlvbiBnZXRMb2NhbGl6ZWRMYW5ndWFnZXModmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogc3RyaW5nW10ge1xuXHRjb25zdCB2YWx1ZXMgPSB2ZXJzaW9uLnByb3BlcnRpZXMgPyB2ZXJzaW9uLnByb3BlcnRpZXMuZmlsdGVyKHAgPT4gcC5rZXkgPT09IFByb3BlcnR5VHlwZS5Mb2NhbGl6ZWRMYW5ndWFnZXMpIDogW107XG5cdGNvbnN0IHZhbHVlID0gKHZhbHVlcy5sZW5ndGggPiAwICYmIHZhbHVlc1swXS52YWx1ZSkgfHwgJyc7XG5cdHJldHVybiB2YWx1ZSA/IHZhbHVlLnNwbGl0KCcsJykgOiBbXTtcbn1cblxuZnVuY3Rpb24gZ2V0U3BvbnNvckxpbmsodmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHZlcnNpb24ucHJvcGVydGllcz8uZmluZChwID0+IHAua2V5ID09PSBQcm9wZXJ0eVR5cGUuU3BvbnNvckxpbmspPy52YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0U3VwcG9ydExpbmsodmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHZlcnNpb24ucHJvcGVydGllcz8uZmluZChwID0+IHAua2V5ID09PSBQcm9wZXJ0eVR5cGUuU3VwcG9ydExpbmspPy52YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0SXNQcmV2aWV3KGZsYWdzOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGZsYWdzLmluZGV4T2YoJ3ByZXZpZXcnKSAhPT0gLTE7XG59XG5cbmZ1bmN0aW9uIGdldFRhcmdldFBsYXRmb3JtRm9yRXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pOiBUYXJnZXRQbGF0Zm9ybSB7XG5cdHJldHVybiB2ZXJzaW9uLnRhcmdldFBsYXRmb3JtID8gdG9UYXJnZXRQbGF0Zm9ybSh2ZXJzaW9uLnRhcmdldFBsYXRmb3JtKSA6IFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRDtcbn1cblxuZnVuY3Rpb24gZ2V0QWxsVGFyZ2V0UGxhdGZvcm1zKHJhd0dhbGxlcnlFeHRlbnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uKTogVGFyZ2V0UGxhdGZvcm1bXSB7XG5cdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IGRpc3RpbmN0KHJhd0dhbGxlcnlFeHRlbnNpb24udmVyc2lvbnMubWFwKGdldFRhcmdldFBsYXRmb3JtRm9yRXh0ZW5zaW9uVmVyc2lvbikpO1xuXG5cdC8vIElzIGEgd2ViIGV4dGVuc2lvbiBvbmx5IGlmIGl0IGhhcyBXRUJfRVhURU5TSU9OX1RBR1xuXHRjb25zdCBpc1dlYkV4dGVuc2lvbiA9ICEhcmF3R2FsbGVyeUV4dGVuc2lvbi50YWdzPy5pbmNsdWRlcyhXRUJfRVhURU5TSU9OX1RBRyk7XG5cblx0Ly8gSW5jbHVkZSBXZWIgVGFyZ2V0IFBsYXRmb3JtIG9ubHkgaWYgaXQgaXMgYSB3ZWIgZXh0ZW5zaW9uXG5cdGNvbnN0IHdlYlRhcmdldFBsYXRmb3JtSW5kZXggPSBhbGxUYXJnZXRQbGF0Zm9ybXMuaW5kZXhPZihUYXJnZXRQbGF0Zm9ybS5XRUIpO1xuXHRpZiAoaXNXZWJFeHRlbnNpb24pIHtcblx0XHRpZiAod2ViVGFyZ2V0UGxhdGZvcm1JbmRleCA9PT0gLTEpIHtcblx0XHRcdC8vIFdlYiBleHRlbnNpb24gYnV0IGRvZXMgbm90IGhhcyB3ZWIgdGFyZ2V0IHBsYXRmb3JtIC0+IGFkZCBpdFxuXHRcdFx0YWxsVGFyZ2V0UGxhdGZvcm1zLnB1c2goVGFyZ2V0UGxhdGZvcm0uV0VCKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0aWYgKHdlYlRhcmdldFBsYXRmb3JtSW5kZXggIT09IC0xKSB7XG5cdFx0XHQvLyBOb3QgYSB3ZWIgZXh0ZW5zaW9uIGJ1dCBoYXMgd2ViIHRhcmdldCBwbGF0Zm9ybSAtPiByZW1vdmUgaXRcblx0XHRcdGFsbFRhcmdldFBsYXRmb3Jtcy5zcGxpY2Uod2ViVGFyZ2V0UGxhdGZvcm1JbmRleCwgMSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGFsbFRhcmdldFBsYXRmb3Jtcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNvcnRFeHRlbnNpb25WZXJzaW9ucyh2ZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10sIHByZWZlcnJlZFRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSk6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdIHtcblx0LyogSXQgaXMgZXhwZWN0ZWQgdGhhdCB2ZXJzaW9ucyBmcm9tIE1hcmtldHBsYWNlIGFyZSBzb3J0ZWQgYnkgdmVyc2lvbi4gU28gd2UgYXJlIGp1c3Qgc29ydGluZyBieSBwcmVmZXJyZWQgdGFyZ2V0UGxhdGZvcm0gKi9cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHZlcnNpb25zLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IHZlcnNpb24gPSB2ZXJzaW9uc1tpbmRleF07XG5cdFx0aWYgKHZlcnNpb24udmVyc2lvbiA9PT0gdmVyc2lvbnNbaW5kZXggLSAxXT8udmVyc2lvbikge1xuXHRcdFx0bGV0IGluc2VydGlvbkluZGV4ID0gaW5kZXg7XG5cdFx0XHRjb25zdCB2ZXJzaW9uVGFyZ2V0UGxhdGZvcm0gPSBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24odmVyc2lvbik7XG5cdFx0XHQvKiBwdXQgaXQgYXQgdGhlIGJlZ2lubmluZyAqL1xuXHRcdFx0aWYgKHZlcnNpb25UYXJnZXRQbGF0Zm9ybSA9PT0gcHJlZmVycmVkVGFyZ2V0UGxhdGZvcm0pIHtcblx0XHRcdFx0d2hpbGUgKGluc2VydGlvbkluZGV4ID4gMCAmJiB2ZXJzaW9uc1tpbnNlcnRpb25JbmRleCAtIDFdLnZlcnNpb24gPT09IHZlcnNpb24udmVyc2lvbikgeyBpbnNlcnRpb25JbmRleC0tOyB9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5zZXJ0aW9uSW5kZXggIT09IGluZGV4KSB7XG5cdFx0XHRcdHZlcnNpb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdHZlcnNpb25zLnNwbGljZShpbnNlcnRpb25JbmRleCwgMCwgdmVyc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB2ZXJzaW9ucztcbn1cblxuLyoqXG4gKiBGaWx0ZXJzIGV4dGVuc2lvbiB2ZXJzaW9ucyB0byByZXR1cm4gb25seSB0aGUgcmVsZXZhbnQgdmVyc2lvbnMgZm9yIGEgZ2l2ZW4gdGFyZ2V0IHBsYXRmb3JtLlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gcHJvY2Vzc2VzIGEgbGlzdCBvZiBleHRlbnNpb24gdmVyc2lvbnMgKGV4cGVjdGVkIHRvIGJlIHNvcnRlZCBieSB2ZXJzaW9uIGRlc2NlbmRpbmcpXG4gKiBhbmQgcmV0dXJucyBhIGZpbHRlcmVkIGxpc3QgY29udGFpbmluZzpcbiAqIDEuIEFsbCB2ZXJzaW9ucyB0aGF0IGFyZSBOT1QgY29tcGF0aWJsZSB3aXRoIHRoZSB0YXJnZXQgcGxhdGZvcm0gKGZvciBvdGhlciBwbGF0Zm9ybXMpXG4gKiAyLiBBdCBtb3N0IG9uZSBjb21wYXRpYmxlIHJlbGVhc2UgdmVyc2lvbiAodGhlIGZpcnN0L2xhdGVzdCBvbmUgZW5jb3VudGVyZWQpXG4gKiAzLiBBdCBtb3N0IG9uZSBjb21wYXRpYmxlIHByZS1yZWxlYXNlIHZlcnNpb24gKHRoZSBmaXJzdC9sYXRlc3Qgb25lIGVuY291bnRlcmVkKVxuICpcbiAqIFdoZW4gYSBwbGF0Zm9ybS1zcGVjaWZpYyB2ZXJzaW9uIChleGFjdGx5IG1hdGNoaW5nIHRhcmdldFBsYXRmb3JtKSBpcyBlbmNvdW50ZXJlZCB3aXRoIHRoZSBzYW1lXG4gKiB2ZXJzaW9uIG51bWJlciBhcyBhIHByZXZpb3VzbHkgc3RvcmVkIHVuaXZlcnNhbC91bmRlZmluZWQgdmVyc2lvbiwgaXQgcmVwbGFjZXMgdGhhdCB2ZXJzaW9uLlxuICogVGhpcyBlbnN1cmVzIHBsYXRmb3JtLXNwZWNpZmljIGJ1aWxkcyBhcmUgcHJlZmVycmVkIG92ZXIgdW5pdmVyc2FsIGJ1aWxkcyBmb3IgdGhlIHNhbWUgdmVyc2lvbi5cbiAqXG4gKiBAcGFyYW0gdmVyc2lvbnMgLSBBcnJheSBvZiBleHRlbnNpb24gdmVyc2lvbnMsIGV4cGVjdGVkIHRvIGJlIHNvcnRlZCBieSB2ZXJzaW9uIG51bWJlciBkZXNjZW5kaW5nXG4gKiBAcGFyYW0gdGFyZ2V0UGxhdGZvcm0gLSBUaGUgdGFyZ2V0IHBsYXRmb3JtIHRvIGZpbHRlciBmb3IgKGUuZy4sIExJTlVYX1g2NCwgV0lOMzJfWDY0KVxuICogQHBhcmFtIGFsbFRhcmdldFBsYXRmb3JtcyAtIEFsbCB0YXJnZXQgcGxhdGZvcm1zIHRoZSBleHRlbnNpb24gc3VwcG9ydHNcbiAqIEByZXR1cm5zIEZpbHRlcmVkIGFycmF5IG9mIHZlcnNpb25zIHJlbGV2YW50IGZvciB0aGUgdGFyZ2V0IHBsYXRmb3JtXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXSwgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLCBhbGxUYXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW10pOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXSB7XG5cdGNvbnN0IGxhdGVzdFZlcnNpb25zOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXSA9IFtdO1xuXG5cdGxldCBwcmVSZWxlYXNlVmVyc2lvbkluZGV4OiBudW1iZXIgPSAtMTtcblx0bGV0IHJlbGVhc2VWZXJzaW9uSW5kZXg6IG51bWJlciA9IC0xO1xuXHRmb3IgKGNvbnN0IHZlcnNpb24gb2YgdmVyc2lvbnMpIHtcblx0XHRjb25zdCB2ZXJzaW9uVGFyZ2V0UGxhdGZvcm0gPSBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24odmVyc2lvbik7XG5cdFx0Y29uc3QgaXNDb21wYXRpYmxlV2l0aFRhcmdldFBsYXRmb3JtID0gaXNUYXJnZXRQbGF0Zm9ybUNvbXBhdGlibGUodmVyc2lvblRhcmdldFBsYXRmb3JtLCBhbGxUYXJnZXRQbGF0Zm9ybXMsIHRhcmdldFBsYXRmb3JtKTtcblxuXHRcdC8vIEFsd2F5cyBpbmNsdWRlIHZlcnNpb25zIHRoYXQgYXJlIE5PVCBjb21wYXRpYmxlIHdpdGggdGhlIHRhcmdldCBwbGF0Zm9ybVxuXHRcdGlmICghaXNDb21wYXRpYmxlV2l0aFRhcmdldFBsYXRmb3JtKSB7XG5cdFx0XHRsYXRlc3RWZXJzaW9ucy5wdXNoKHZlcnNpb24pO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGNvbXBhdGlibGUgdmVyc2lvbnMsIG9ubHkgaW5jbHVkZSB0aGUgZmlyc3QgKGxhdGVzdCkgb2YgZWFjaCB0eXBlXG5cdFx0Ly8gUHJlZmVyIHNwZWNpZmljIHRhcmdldCBwbGF0Zm9ybSBtYXRjaGVzIG92ZXIgdW5kZWZpbmVkL3VuaXZlcnNhbCBwbGF0Zm9ybXMgb25seSB3aGVuIHZlcnNpb24gbnVtYmVycyBhcmUgdGhlIHNhbWVcblx0XHRpZiAoaXNQcmVSZWxlYXNlVmVyc2lvbih2ZXJzaW9uKSkge1xuXHRcdFx0aWYgKHByZVJlbGVhc2VWZXJzaW9uSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHByZVJlbGVhc2VWZXJzaW9uSW5kZXggPSBsYXRlc3RWZXJzaW9ucy5sZW5ndGg7XG5cdFx0XHRcdGxhdGVzdFZlcnNpb25zLnB1c2godmVyc2lvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHZlcnNpb25UYXJnZXRQbGF0Zm9ybSA9PT0gdGFyZ2V0UGxhdGZvcm0gJiYgbGF0ZXN0VmVyc2lvbnNbcHJlUmVsZWFzZVZlcnNpb25JbmRleF0udmVyc2lvbiA9PT0gdmVyc2lvbi52ZXJzaW9uKSB7XG5cdFx0XHRcdGxhdGVzdFZlcnNpb25zW3ByZVJlbGVhc2VWZXJzaW9uSW5kZXhdID0gdmVyc2lvbjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHJlbGVhc2VWZXJzaW9uSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJlbGVhc2VWZXJzaW9uSW5kZXggPSBsYXRlc3RWZXJzaW9ucy5sZW5ndGg7XG5cdFx0XHRcdGxhdGVzdFZlcnNpb25zLnB1c2godmVyc2lvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHZlcnNpb25UYXJnZXRQbGF0Zm9ybSA9PT0gdGFyZ2V0UGxhdGZvcm0gJiYgbGF0ZXN0VmVyc2lvbnNbcmVsZWFzZVZlcnNpb25JbmRleF0udmVyc2lvbiA9PT0gdmVyc2lvbi52ZXJzaW9uKSB7XG5cdFx0XHRcdGxhdGVzdFZlcnNpb25zW3JlbGVhc2VWZXJzaW9uSW5kZXhdID0gdmVyc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbGF0ZXN0VmVyc2lvbnM7XG59XG5cbmZ1bmN0aW9uIHNldFRlbGVtZXRyeShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBpbmRleDogbnVtYmVyLCBxdWVyeVNvdXJjZT86IHN0cmluZyk6IHZvaWQge1xuXHQvKiBfX0dEUFJfX0ZSQUdNRU5UX19cblx0XCJHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YTJcIiA6IHtcblx0XHRcImluZGV4XCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFwicXVlcnlTb3VyY2VcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFwicXVlcnlBY3Rpdml0eUlkXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfVxuXHR9XG5cdCovXG5cdGV4dGVuc2lvbi50ZWxlbWV0cnlEYXRhID0geyBpbmRleCwgcXVlcnlTb3VyY2UsIHF1ZXJ5QWN0aXZpdHlJZDogZXh0ZW5zaW9uLnF1ZXJ5Q29udGV4dD8uW1NFQVJDSF9BQ1RJVklUWV9IRUFERVJfTkFNRV0gfTtcbn1cblxuZnVuY3Rpb24gdG9FeHRlbnNpb24oZ2FsbGVyeUV4dGVuc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb24sIHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiwgYWxsVGFyZ2V0UGxhdGZvcm1zOiBUYXJnZXRQbGF0Zm9ybVtdLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsIHF1ZXJ5Q29udGV4dD86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTogSUdhbGxlcnlFeHRlbnNpb24ge1xuXHRjb25zdCBsYXRlc3RWZXJzaW9uID0gZ2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9uc1swXTtcblx0Y29uc3QgYXNzZXRzOiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0cyA9IHtcblx0XHRtYW5pZmVzdDogZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIEFzc2V0VHlwZS5NYW5pZmVzdCksXG5cdFx0cmVhZG1lOiBnZXRWZXJzaW9uQXNzZXQodmVyc2lvbiwgQXNzZXRUeXBlLkRldGFpbHMpLFxuXHRcdGNoYW5nZWxvZzogZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIEFzc2V0VHlwZS5DaGFuZ2Vsb2cpLFxuXHRcdGxpY2Vuc2U6IGdldFZlcnNpb25Bc3NldCh2ZXJzaW9uLCBBc3NldFR5cGUuTGljZW5zZSksXG5cdFx0cmVwb3NpdG9yeTogZ2V0UmVwb3NpdG9yeUFzc2V0KHZlcnNpb24pLFxuXHRcdGRvd25sb2FkOiBnZXREb3dubG9hZEFzc2V0KHZlcnNpb24pLFxuXHRcdGljb246IGdldFZlcnNpb25Bc3NldCh2ZXJzaW9uLCBBc3NldFR5cGUuSWNvbiksXG5cdFx0c2lnbmF0dXJlOiBnZXRWZXJzaW9uQXNzZXQodmVyc2lvbiwgQXNzZXRUeXBlLlNpZ25hdHVyZSksXG5cdFx0Y29yZVRyYW5zbGF0aW9uczogZ2V0Q29yZVRyYW5zbGF0aW9uQXNzZXRzKHZlcnNpb24pXG5cdH07XG5cblx0Y29uc3QgZGV0YWlsc1ZpZXdVcmkgPSBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIGdhbGxlcnlFeHRlbnNpb24ubGlua1R5cGUgPz8gRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25EZXRhaWxzVmlld1VyaSk7XG5cdGNvbnN0IHB1Ymxpc2hlclZpZXdVcmkgPSBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLmxpbmtUeXBlID8/IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuUHVibGlzaGVyVmlld1VyaSk7XG5cdGNvbnN0IHJhdGluZ1ZpZXdVcmkgPSBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIGdhbGxlcnlFeHRlbnNpb24ucmF0aW5nTGlua1R5cGUgPz8gRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25SYXRpbmdWaWV3VXJpKTtcblx0Y29uc3QgaWQgPSBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQoZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSwgZ2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25OYW1lKTtcblxuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdnYWxsZXJ5Jyxcblx0XHRpZGVudGlmaWVyOiB7XG5cdFx0XHRpZCxcblx0XHRcdHV1aWQ6IGdhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uSWRcblx0XHR9LFxuXHRcdG5hbWU6IGdhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uTmFtZSxcblx0XHR2ZXJzaW9uOiB2ZXJzaW9uLnZlcnNpb24sXG5cdFx0ZGlzcGxheU5hbWU6IGdhbGxlcnlFeHRlbnNpb24uZGlzcGxheU5hbWUsXG5cdFx0cHVibGlzaGVySWQ6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLnB1Ymxpc2hlcklkLFxuXHRcdHB1Ymxpc2hlcjogZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSxcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIuZGlzcGxheU5hbWUsXG5cdFx0cHVibGlzaGVyRG9tYWluOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5kb21haW4gPyB7IGxpbms6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLmRvbWFpbiwgdmVyaWZpZWQ6ICEhZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIuaXNEb21haW5WZXJpZmllZCB9IDogdW5kZWZpbmVkLFxuXHRcdHB1Ymxpc2hlclNwb25zb3JMaW5rOiBnZXRTcG9uc29yTGluayhsYXRlc3RWZXJzaW9uKSxcblx0XHRkZXNjcmlwdGlvbjogZ2FsbGVyeUV4dGVuc2lvbi5zaG9ydERlc2NyaXB0aW9uID8/ICcnLFxuXHRcdGluc3RhbGxDb3VudDogZ2V0U3RhdGlzdGljKGdhbGxlcnlFeHRlbnNpb24uc3RhdGlzdGljcywgJ2luc3RhbGwnKSxcblx0XHRyYXRpbmc6IGdldFN0YXRpc3RpYyhnYWxsZXJ5RXh0ZW5zaW9uLnN0YXRpc3RpY3MsICdhdmVyYWdlcmF0aW5nJyksXG5cdFx0cmF0aW5nQ291bnQ6IGdldFN0YXRpc3RpYyhnYWxsZXJ5RXh0ZW5zaW9uLnN0YXRpc3RpY3MsICdyYXRpbmdjb3VudCcpLFxuXHRcdGNhdGVnb3JpZXM6IGdhbGxlcnlFeHRlbnNpb24uY2F0ZWdvcmllcyB8fCBbXSxcblx0XHR0YWdzOiBnYWxsZXJ5RXh0ZW5zaW9uLnRhZ3MgfHwgW10sXG5cdFx0cmVsZWFzZURhdGU6IERhdGUucGFyc2UoZ2FsbGVyeUV4dGVuc2lvbi5yZWxlYXNlRGF0ZSksXG5cdFx0bGFzdFVwZGF0ZWQ6IERhdGUucGFyc2UoZ2FsbGVyeUV4dGVuc2lvbi5sYXN0VXBkYXRlZCksXG5cdFx0YWxsVGFyZ2V0UGxhdGZvcm1zLFxuXHRcdGFzc2V0cyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZXBlbmRlbmNpZXM6IGdldEV4dGVuc2lvbnModmVyc2lvbiwgUHJvcGVydHlUeXBlLkRlcGVuZGVuY3kpLFxuXHRcdFx0ZXh0ZW5zaW9uUGFjazogZ2V0RXh0ZW5zaW9ucyh2ZXJzaW9uLCBQcm9wZXJ0eVR5cGUuRXh0ZW5zaW9uUGFjayksXG5cdFx0XHRlbmdpbmU6IGdldEVuZ2luZSh2ZXJzaW9uKSxcblx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IGdldEVuYWJsZWRBcGlQcm9wb3NhbHModmVyc2lvbiksXG5cdFx0XHRsb2NhbGl6ZWRMYW5ndWFnZXM6IGdldExvY2FsaXplZExhbmd1YWdlcyh2ZXJzaW9uKSxcblx0XHRcdHRhcmdldFBsYXRmb3JtOiBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24odmVyc2lvbiksXG5cdFx0XHRpc1ByZVJlbGVhc2VWZXJzaW9uOiBpc1ByZVJlbGVhc2VWZXJzaW9uKHZlcnNpb24pLFxuXHRcdFx0ZXhlY3V0ZXNDb2RlOiBleGVjdXRlc0NvZGUodmVyc2lvbilcblx0XHR9LFxuXHRcdGhhc1ByZVJlbGVhc2VWZXJzaW9uOiBoYXNQcmVSZWxlYXNlRm9yRXh0ZW5zaW9uKGlkLCBwcm9kdWN0U2VydmljZSkgPz8gaXNQcmVSZWxlYXNlVmVyc2lvbihsYXRlc3RWZXJzaW9uKSxcblx0XHRoYXNSZWxlYXNlVmVyc2lvbjogdHJ1ZSxcblx0XHRwcml2YXRlOiBpc1ByaXZhdGVFeHRlbnNpb24obGF0ZXN0VmVyc2lvbiksXG5cdFx0cHJldmlldzogZ2V0SXNQcmV2aWV3KGdhbGxlcnlFeHRlbnNpb24uZmxhZ3MpLFxuXHRcdGlzU2lnbmVkOiAhIWFzc2V0cy5zaWduYXR1cmUsXG5cdFx0cXVlcnlDb250ZXh0LFxuXHRcdHN1cHBvcnRMaW5rOiBnZXRTdXBwb3J0TGluayhsYXRlc3RWZXJzaW9uKSxcblx0XHRkZXRhaWxzTGluazogZGV0YWlsc1ZpZXdVcmkgPyBmb3JtYXQyKGRldGFpbHNWaWV3VXJpLCB7IHB1Ymxpc2hlcjogZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSwgbmFtZTogZ2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25OYW1lIH0pIDogdW5kZWZpbmVkLFxuXHRcdHB1Ymxpc2hlckxpbms6IHB1Ymxpc2hlclZpZXdVcmkgPyBmb3JtYXQyKHB1Ymxpc2hlclZpZXdVcmksIHsgcHVibGlzaGVyOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5wdWJsaXNoZXJOYW1lIH0pIDogdW5kZWZpbmVkLFxuXHRcdHJhdGluZ0xpbms6IHJhdGluZ1ZpZXdVcmkgPyBmb3JtYXQyKHJhdGluZ1ZpZXdVcmksIHsgcHVibGlzaGVyOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5wdWJsaXNoZXJOYW1lLCBuYW1lOiBnYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbk5hbWUgfSkgOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmludGVyZmFjZSBJUmF3RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCB7XG5cdG1hbGljaW91czogc3RyaW5nW107XG5cdGxlYXJuTW9yZUxpbmtzPzogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPjtcblx0bWlncmF0ZVRvUHJlUmVsZWFzZT86IElTdHJpbmdEaWN0aW9uYXJ5PHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdFx0bWlncmF0ZVN0b3JhZ2U/OiBib29sZWFuO1xuXHRcdGVuZ2luZT86IHN0cmluZztcblx0fT47XG5cdGRlcHJlY2F0ZWQ/OiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuIHwge1xuXHRcdGRpc2FsbG93SW5zdGFsbD86IGJvb2xlYW47XG5cdFx0ZXh0ZW5zaW9uPzoge1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdFx0fTtcblx0XHRzZXR0aW5ncz86IHN0cmluZ1tdO1xuXHRcdGFkZGl0aW9uYWxJbmZvPzogc3RyaW5nO1xuXHR9Pjtcblx0c2VhcmNoPzogSVNlYXJjaFByZWZmZXJlZFJlc3VsdHNbXTtcblx0YXV0b1VwZGF0ZT86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNDb250cm9sVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdW5wa2dSZXNvdXJjZUFwaTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbW9uSGVhZGVyc1Byb21pc2U6IFByb21pc2U8SUhlYWRlcnM+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZXh0ZW5zaW9uc0NvbnRyb2xVcmwgPSBwcm9kdWN0U2VydmljZS5leHRlbnNpb25zR2FsbGVyeT8uY29udHJvbFVybDtcblx0XHR0aGlzLnVucGtnUmVzb3VyY2VBcGkgPSBwcm9kdWN0U2VydmljZS5leHRlbnNpb25zR2FsbGVyeT8uZXh0ZW5zaW9uVXJsVGVtcGxhdGU7XG5cdFx0dGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZSA9IHJlc29sdmVNYXJrZXRwbGFjZUhlYWRlcnMoXG5cdFx0XHRwcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UsXG5cdFx0XHR0aGlzLmVudmlyb25tZW50U2VydmljZSxcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGlzLmZpbGVTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UpO1xuXHR9XG5cblx0aXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzID09PSBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuQXZhaWxhYmxlO1xuXHR9XG5cblx0Z2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uSW5mbz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25bXT47XG5cdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3M6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkluZm8+LCBvcHRpb25zOiBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+O1xuXHRhc3luYyBnZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25JbmZvPiwgYXJnMTogQ2FuY2VsbGF0aW9uVG9rZW4gfCBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCBhcmcyPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0aWYgKCFleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZXh0ZW5zaW9uIGdhbGxlcnkgc2VydmljZSBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSBDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKGFyZzEpID8ge30gOiBhcmcxIGFzIElFeHRlbnNpb25RdWVyeU9wdGlvbnM7XG5cdFx0Y29uc3QgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKGFyZzEpID8gYXJnMSA6IGFyZzIgYXMgQ2FuY2VsbGF0aW9uVG9rZW47XG5cblx0XHRjb25zdCByZXNvdXJjZUFwaSA9IHRoaXMuZ2V0UmVzb3VyY2VBcGkoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KTtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvdXJjZUFwaVxuXHRcdFx0PyBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNVc2luZ1Jlc291cmNlQXBpKGV4dGVuc2lvbkluZm9zLCBvcHRpb25zLCByZXNvdXJjZUFwaSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0b2tlbilcblx0XHRcdDogYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zVXNpbmdRdWVyeUFwaShleHRlbnNpb25JbmZvcywgb3B0aW9ucywgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0b2tlbik7XG5cblx0XHRjb25zdCB1dWlkcyA9IHJlc3VsdC5tYXAociA9PiByLmlkZW50aWZpZXIudXVpZCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSW5mb3NCeU5hbWU6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGUgb2YgZXh0ZW5zaW9uSW5mb3MpIHtcblx0XHRcdGlmIChlLnV1aWQgJiYgIXV1aWRzLmluY2x1ZGVzKGUudXVpZCkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSW5mb3NCeU5hbWUucHVzaCh7IC4uLmUsIHV1aWQ6IHVuZGVmaW5lZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uSW5mb3NCeU5hbWUubGVuZ3RoKSB7XG5cdFx0XHQvLyByZXBvcnQgdGVsZW1ldHJ5IGRhdGEgZm9yIGFkZGl0aW9uYWwgcXVlcnlcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFxuXHRcdFx0XHR7IGNvdW50OiBudW1iZXIgfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgdGhlIHF1ZXJ5IHRvIHRoZSBNYXJrZXRwbGFjZSBmb3IgZmV0Y2hpbmcgZXh0ZW5zaW9ucyBieSBuYW1lJztcblx0XHRcdFx0XHRyZWFkb25seSBjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ051bWJlciBvZiBleHRlbnNpb25zIHRvIGZldGNoJyB9O1xuXHRcdFx0XHR9PignZ2FsbGVyeVNlcnZpY2U6YWRkaXRpb25hbFF1ZXJ5QnlOYW1lJywge1xuXHRcdFx0XHRcdGNvdW50OiBleHRlbnNpb25JbmZvc0J5TmFtZS5sZW5ndGhcblx0XHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNVc2luZ1F1ZXJ5QXBpKGV4dGVuc2lvbkluZm9zQnlOYW1lLCBvcHRpb25zLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmV4dGVuc2lvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlQXBpKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCk6IHsgdXJpOiBzdHJpbmc7IGZhbGxiYWNrPzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhdGVzdFZlcnNpb25SZXNvdXJjZSA9IGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25MYXRlc3RWZXJzaW9uVXJpKTtcblx0XHRpZiAobGF0ZXN0VmVyc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IGxhdGVzdFZlcnNpb25SZXNvdXJjZSxcblx0XHRcdFx0ZmFsbGJhY2s6IHRoaXMudW5wa2dSZXNvdXJjZUFwaVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXh0ZW5zaW9uc1VzaW5nUXVlcnlBcGkoZXh0ZW5zaW9uSW5mb3M6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkluZm8+LCBvcHRpb25zOiBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IG5hbWVzOiBzdHJpbmdbXSA9IFtdLFxuXHRcdFx0aWRzOiBzdHJpbmdbXSA9IFtdLFxuXHRcdFx0aW5jbHVkZVByZVJlbGVhc2U6IChJRXh0ZW5zaW9uSWRlbnRpZmllciAmIHsgaW5jbHVkZVByZVJlbGVhc2U6IGJvb2xlYW4gfSlbXSA9IFtdLFxuXHRcdFx0dmVyc2lvbnM6IChJRXh0ZW5zaW9uSWRlbnRpZmllciAmIHsgdmVyc2lvbjogc3RyaW5nIH0pW10gPSBbXTtcblx0XHRsZXQgaXNRdWVyeUZvclJlbGVhc2VWZXJzaW9uRnJvbVByZVJlbGVhc2VWZXJzaW9uID0gdHJ1ZTtcblxuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSW5mbyBvZiBleHRlbnNpb25JbmZvcykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbkluZm8udXVpZCkge1xuXHRcdFx0XHRpZHMucHVzaChleHRlbnNpb25JbmZvLnV1aWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bmFtZXMucHVzaChleHRlbnNpb25JbmZvLmlkKTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25JbmZvLnZlcnNpb24pIHtcblx0XHRcdFx0dmVyc2lvbnMucHVzaCh7IGlkOiBleHRlbnNpb25JbmZvLmlkLCB1dWlkOiBleHRlbnNpb25JbmZvLnV1aWQsIHZlcnNpb246IGV4dGVuc2lvbkluZm8udmVyc2lvbiB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluY2x1ZGVQcmVSZWxlYXNlLnB1c2goeyBpZDogZXh0ZW5zaW9uSW5mby5pZCwgdXVpZDogZXh0ZW5zaW9uSW5mby51dWlkLCBpbmNsdWRlUHJlUmVsZWFzZTogISFleHRlbnNpb25JbmZvLnByZVJlbGVhc2UgfSk7XG5cdFx0XHR9XG5cdFx0XHRpc1F1ZXJ5Rm9yUmVsZWFzZVZlcnNpb25Gcm9tUHJlUmVsZWFzZVZlcnNpb24gPSBpc1F1ZXJ5Rm9yUmVsZWFzZVZlcnNpb25Gcm9tUHJlUmVsZWFzZVZlcnNpb24gJiYgKCEhZXh0ZW5zaW9uSW5mby5oYXNQcmVSZWxlYXNlICYmICFleHRlbnNpb25JbmZvLnByZVJlbGVhc2UpO1xuXHRcdH1cblxuXHRcdGlmICghaWRzLmxlbmd0aCAmJiAhbmFtZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0bGV0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KCkud2l0aFBhZ2UoMSwgZXh0ZW5zaW9uSW5mb3MubGVuZ3RoKTtcblx0XHRpZiAoaWRzLmxlbmd0aCkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuRXh0ZW5zaW9uSWQsIC4uLmlkcyk7XG5cdFx0fVxuXHRcdGlmIChuYW1lcy5sZW5ndGgpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZpbHRlcihGaWx0ZXJUeXBlLkV4dGVuc2lvbk5hbWUsIC4uLm5hbWVzKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMucXVlcnlBbGxWZXJzaW9ucykge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MsIEZsYWcuSW5jbHVkZVZlcnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuc291cmNlKSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhTb3VyY2Uob3B0aW9ucy5zb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZXh0ZW5zaW9ucyB9ID0gYXdhaXQgdGhpcy5xdWVyeUdhbGxlcnlFeHRlbnNpb25zKFxuXHRcdFx0cXVlcnksXG5cdFx0XHR7XG5cdFx0XHRcdHRhcmdldFBsYXRmb3JtOiBvcHRpb25zLnRhcmdldFBsYXRmb3JtID8/IENVUlJFTlRfVEFSR0VUX1BMQVRGT1JNLFxuXHRcdFx0XHRpbmNsdWRlUHJlUmVsZWFzZSxcblx0XHRcdFx0dmVyc2lvbnMsXG5cdFx0XHRcdGNvbXBhdGlibGU6ICEhb3B0aW9ucy5jb21wYXRpYmxlLFxuXHRcdFx0XHRwcm9kdWN0VmVyc2lvbjogb3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0sXG5cdFx0XHRcdGlzUXVlcnlGb3JSZWxlYXNlVmVyc2lvbkZyb21QcmVSZWxlYXNlVmVyc2lvblxuXHRcdFx0fSxcblx0XHRcdGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCxcblx0XHRcdHRva2VuKTtcblxuXHRcdGlmIChvcHRpb25zLnNvdXJjZSkge1xuXHRcdFx0ZXh0ZW5zaW9ucy5mb3JFYWNoKChlLCBpbmRleCkgPT4gc2V0VGVsZW1ldHJ5KGUsIGluZGV4LCBvcHRpb25zLnNvdXJjZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBleHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFeHRlbnNpb25zVXNpbmdSZXNvdXJjZUFwaShleHRlbnNpb25JbmZvczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uSW5mbz4sIG9wdGlvbnM6IElFeHRlbnNpb25RdWVyeU9wdGlvbnMsIHJlc291cmNlQXBpOiB7IHVyaTogc3RyaW5nOyBmYWxsYmFjaz86IHN0cmluZyB9LCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25bXT4ge1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJR2FsbGVyeUV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgdG9RdWVyeTogSUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGNvbnN0IHRvRmV0Y2hMYXRlc3Q6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSW5mbyBvZiBleHRlbnNpb25JbmZvcykge1xuXHRcdFx0aWYgKCFFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWC50ZXN0KGV4dGVuc2lvbkluZm8uaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbkluZm8udmVyc2lvbikge1xuXHRcdFx0XHR0b1F1ZXJ5LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b0ZldGNoTGF0ZXN0LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodG9GZXRjaExhdGVzdC5tYXAoYXN5bmMgZXh0ZW5zaW9uSW5mbyA9PiB7XG5cdFx0XHRsZXQgZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCBzdHJpbmc7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5nZXRMYXRlc3RHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbkluZm8sIG9wdGlvbnMsIHJlc291cmNlQXBpLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblx0XHRcdFx0aWYgKGlzU3RyaW5nKGdhbGxlcnlFeHRlbnNpb24pKSB7XG5cdFx0XHRcdFx0aWYgKGdhbGxlcnlFeHRlbnNpb24gPT09ICdMQVRFU1RfSVNfT1VUREFURUQnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNraXBwaW5nIHF1ZXJ5IEFQSSBmYWxsYmFjayBmb3IgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSW5mby5pZH0gYmVjYXVzZSB0aGUgbGF0ZXN0IGdhbGxlcnkgdmVyc2lvbiBpcyBvbGRlciB0aGFuIHRoZSBjdXJyZW50IHZlcnNpb25gKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gZmFsbGJhY2sgdG8gcXVlcnlcblx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdFx0XHRjb21wYXRpYmxlOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0XHRcdGVycm9yQ29kZTogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB0aGUgZmFsbGJhY2sgdG8gdGhlIE1hcmtldHBsYWNlIHF1ZXJ5IGZvciBmZXRjaGluZyBleHRlbnNpb25zJztcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeHRlbnNpb24gaWQnIH07XG5cdFx0XHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0dldCBwcmUtcmVsZWFzZSB2ZXJzaW9uJyB9O1xuXHRcdFx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdHZXQgY29tcGF0aWJsZSB2ZXJzaW9uJyB9O1xuXHRcdFx0XHRcdFx0XHRcdGVycm9yQ29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0Vycm9yIGNvZGUgb3IgcmVhc29uJyB9O1xuXHRcdFx0XHRcdFx0XHR9PignZ2FsbGVyeVNlcnZpY2U6ZmFsbGJhY2t0b3F1ZXJ5Jywge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSW5mby5pZCxcblx0XHRcdFx0XHRcdFx0XHRwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbkluZm8ucHJlUmVsZWFzZSxcblx0XHRcdFx0XHRcdFx0XHRjb21wYXRpYmxlOiAhIW9wdGlvbnMuY29tcGF0aWJsZSxcblx0XHRcdFx0XHRcdFx0XHRlcnJvckNvZGU6IGdhbGxlcnlFeHRlbnNpb25cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0b1F1ZXJ5LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGdhbGxlcnlFeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBFeHRlbnNpb25HYWxsZXJ5RXJyb3IpIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGVycm9yLmNvZGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5PZmZsaW5lOlxuXHRcdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNhbmNlbGxlZDpcblx0XHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5UaW1lb3V0OlxuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBmYWxsYmFjayB0byBxdWVyeVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIGdldHRpbmcgdGhlIGxhdGVzdCB2ZXJzaW9uIGZvciB0aGUgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSW5mby5pZH0uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRlcnJvckNvZGU6IHN0cmluZztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB0aGUgZmFsbGJhY2sgdG8gdGhlIE1hcmtldHBsYWNlIHF1ZXJ5IGZvciBmZXRjaGluZyBleHRlbnNpb25zJztcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0V4dGVuc2lvbiBpZCcgfTtcblx0XHRcdFx0XHRcdHByZVJlbGVhc2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdHZXQgcHJlLXJlbGVhc2UgdmVyc2lvbicgfTtcblx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdHZXQgY29tcGF0aWJsZSB2ZXJzaW9uJyB9O1xuXHRcdFx0XHRcdFx0ZXJyb3JDb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXJyb3IgY29kZSBvciByZWFzb24nIH07XG5cdFx0XHRcdFx0fT4oJ2dhbGxlcnlTZXJ2aWNlOmZhbGxiYWNrdG9xdWVyeScsIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSW5mby5pZCxcblx0XHRcdFx0XHRcdHByZVJlbGVhc2U6ICEhZXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlLFxuXHRcdFx0XHRcdFx0Y29tcGF0aWJsZTogISFvcHRpb25zLmNvbXBhdGlibGUsXG5cdFx0XHRcdFx0XHRlcnJvckNvZGU6IGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yID8gZXJyb3IuY29kZSA6ICdVbmtub3duJ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR0b1F1ZXJ5LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cblx0XHRpZiAodG9RdWVyeS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNVc2luZ1F1ZXJ5QXBpKHRvUXVlcnksIG9wdGlvbnMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TGF0ZXN0R2FsbGVyeUV4dGVuc2lvbihleHRlbnNpb25JbmZvOiBJRXh0ZW5zaW9uSW5mbywgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgcmVzb3VyY2VBcGk6IHsgdXJpOiBzdHJpbmc7IGZhbGxiYWNrPzogc3RyaW5nIH0sIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbiB8IHN0cmluZz4ge1xuXHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb24gPSBhd2FpdCB0aGlzLmdldExhdGVzdFJhd0dhbGxlcnlFeHRlbnNpb25XaXRoRmFsbGJhY2soZXh0ZW5zaW9uSW5mbywgcmVzb3VyY2VBcGksIHRva2VuKTtcblxuXHRcdGlmICghcmF3R2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuICdOT1RfRk9VTkQnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IGdldEFsbFRhcmdldFBsYXRmb3JtcyhyYXdHYWxsZXJ5RXh0ZW5zaW9uKTtcblx0XHRjb25zdCByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbkZyb21MYXRlc3RWZXJzaW9ucyhyYXdHYWxsZXJ5RXh0ZW5zaW9uLCByYXdHYWxsZXJ5RXh0ZW5zaW9uLnZlcnNpb25zLCBleHRlbnNpb25JbmZvLCBvcHRpb25zLCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0aWYgKCFyYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbikge1xuXHRcdFx0aWYgKGV4dGVuc2lvbkluZm8uY3VycmVudFZlcnNpb24pIHtcblx0XHRcdFx0Y29uc3QgbGF0ZXN0VmVyc2lvbiA9IHJhd0dhbGxlcnlFeHRlbnNpb24udmVyc2lvbnMubGVuZ3RoID4gMCA/IHJhd0dhbGxlcnlFeHRlbnNpb24udmVyc2lvbnNbMF0udmVyc2lvbiA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGxhdGVzdFZlcnNpb24gJiYgc2VtdmVyLmx0KGxhdGVzdFZlcnNpb24sIGV4dGVuc2lvbkluZm8uY3VycmVudFZlcnNpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuICdMQVRFU1RfSVNfT1VUREFURUQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gJ05PVF9DT01QQVRJQkxFJztcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9FeHRlbnNpb24ocmF3R2FsbGVyeUV4dGVuc2lvbiwgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIGFsbFRhcmdldFBsYXRmb3JtcywgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VmFsaWRSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbkZyb21MYXRlc3RWZXJzaW9ucyhyYXdHYWxsZXJ5RXh0ZW5zaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvbiwgbGF0ZXN0VmVyc2lvbnM6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdLCBleHRlbnNpb25JbmZvOiBJRXh0ZW5zaW9uSW5mbywgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgYWxsVGFyZ2V0UGxhdGZvcm1zOiBUYXJnZXRQbGF0Zm9ybVtdKTogUHJvbWlzZTxJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24gfCBudWxsPiB7XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBvcHRpb25zLnRhcmdldFBsYXRmb3JtID8/IENVUlJFTlRfVEFSR0VUX1BMQVRGT1JNO1xuXHRcdGNvbnN0IGxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0gPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKGxhdGVzdFZlcnNpb25zLCB0YXJnZXRQbGF0Zm9ybSwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdC8vIEZpcnN0LCBmaW5kIGEgdmFsaWQgdmVyc2lvbiBtYXRjaGluZyB0aGUgcmVxdWVzdGVkIHR5cGUgKHByZS1yZWxlYXNlIG9yIHJlbGVhc2UpXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKFxuXHRcdFx0cmF3R2FsbGVyeUV4dGVuc2lvbixcblx0XHRcdGxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHR7XG5cdFx0XHRcdHRhcmdldFBsYXRmb3JtLFxuXHRcdFx0XHRjb21wYXRpYmxlOiAhIW9wdGlvbnMuY29tcGF0aWJsZSxcblx0XHRcdFx0cHJvZHVjdFZlcnNpb246IG9wdGlvbnMucHJvZHVjdFZlcnNpb24gPz8ge1xuXHRcdFx0XHRcdHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdFx0XHRkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGVcblx0XHRcdFx0fSxcblx0XHRcdFx0dmVyc2lvbjogZXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlID8gVmVyc2lvbktpbmQuUHJlcmVsZWFzZSA6IFZlcnNpb25LaW5kLlJlbGVhc2Vcblx0XHRcdH0sIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHQvLyBGb3IgcmVsZWFzZSB2ZXJzaW9uIHJlcXVlc3RzLCBzaW1wbHkgcmV0dXJuIHRoZSBmb3VuZCByZWxlYXNlIHZlcnNpb25cblx0XHRpZiAoIWV4dGVuc2lvbkluZm8ucHJlUmVsZWFzZSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBGb3IgcHJlLXJlbGVhc2UgdmVyc2lvbiByZXF1ZXN0cywgd2UgbmVlZCB0byBjb25zaWRlciBib3RoIHByZS1yZWxlYXNlIGFuZCByZWxlYXNlIHZlcnNpb25zXG5cdFx0Y29uc3QgcHJlcmVsZWFzZVZlcnNpb24gPSByZXN1bHQ7XG5cdFx0Y29uc3QgcmVsZWFzZVZlcnNpb24gPSBhd2FpdCB0aGlzLmdldFZhbGlkUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24oXG5cdFx0XHRyYXdHYWxsZXJ5RXh0ZW5zaW9uLFxuXHRcdFx0bGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSxcblx0XHRcdHtcblx0XHRcdFx0dGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHRcdGNvbXBhdGlibGU6ICEhb3B0aW9ucy5jb21wYXRpYmxlLFxuXHRcdFx0XHRwcm9kdWN0VmVyc2lvbjogb3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB7XG5cdFx0XHRcdFx0dmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0XHRcdGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2ZXJzaW9uOiBWZXJzaW9uS2luZC5SZWxlYXNlXG5cdFx0XHR9LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0Ly8gV2hlbiBib3RoIHZlcnNpb25zIGV4aXN0LCByZXR1cm4gd2hpY2hldmVyIGhhcyB0aGUgaGlnaGVyIHZlcnNpb24gbnVtYmVyXG5cdFx0aWYgKHByZXJlbGVhc2VWZXJzaW9uICYmIHJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRyZXR1cm4gc2VtdmVyLmd0KHJlbGVhc2VWZXJzaW9uLnZlcnNpb24sIHByZXJlbGVhc2VWZXJzaW9uLnZlcnNpb24pID8gcmVsZWFzZVZlcnNpb24gOiBwcmVyZWxlYXNlVmVyc2lvbjtcblx0XHR9XG5cblx0XHQvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBjb21wYXRpYmxlIHZlcnNpb24gcmVxdWVzdHNcblx0XHRpZiAob3B0aW9ucy5jb21wYXRpYmxlKSB7XG5cdFx0XHQvLyBJZiB3ZSBoYXZlIGEgY29tcGF0aWJsZSByZWxlYXNlIHZlcnNpb24sIGNoZWNrIGlmIGl0J3MgYmV0dGVyIHRoYW4gYW55IHByZS1yZWxlYXNlXG5cdFx0XHRpZiAocmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlcmUgZXhpc3RzIGFueSBwcmUtcmVsZWFzZSB2ZXJzaW9uIChpZ25vcmluZyBjb21wYXRpYmlsaXR5KVxuXHRcdFx0XHRjb25zdCBhbnlQcmVyZWxlYXNlVmVyc2lvbiA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbihcblx0XHRcdFx0XHRyYXdHYWxsZXJ5RXh0ZW5zaW9uLFxuXHRcdFx0XHRcdGxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHRcdFx0XHRjb21wYXRpYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRcdHByb2R1Y3RWZXJzaW9uOiBvcHRpb25zLnByb2R1Y3RWZXJzaW9uID8/IHtcblx0XHRcdFx0XHRcdFx0dmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGVcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiBWZXJzaW9uS2luZC5QcmVyZWxlYXNlXG5cdFx0XHRcdFx0fSwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdFx0XHQvLyBJZiBubyBwcmUtcmVsZWFzZSBleGlzdHMgb3IgdGhlIHJlbGVhc2UgdmVyc2lvbiBpcyBncmVhdGVyLCBwcmVmZXIgdGhlIGNvbXBhdGlibGUgcmVsZWFzZVxuXHRcdFx0XHQvLyBUaGlzIGVuc3VyZXMgdXNlcnMgZ2V0IGEgc3RhYmxlIGNvbXBhdGlibGUgdmVyc2lvbiB3aGVuIHByZS1yZWxlYXNlcyBhcmVuJ3QgbmV3ZXIgb3IgY29tcGF0aWJsZVxuXHRcdFx0XHRpZiAoIWFueVByZXJlbGVhc2VWZXJzaW9uIHx8IHNlbXZlci5ndChyZWxlYXNlVmVyc2lvbi52ZXJzaW9uLCBhbnlQcmVyZWxlYXNlVmVyc2lvbi52ZXJzaW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiByZWxlYXNlVmVyc2lvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHByZXJlbGVhc2VWZXJzaW9uO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBwcmUtcmVsZWFzZSBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSByZWxlYXNlLCBvdGhlcndpc2UgbnVsbFxuXHRcdHJldHVybiBwcmVyZWxlYXNlVmVyc2lvbiA/PyByZWxlYXNlVmVyc2lvbiA/PyBudWxsO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29tcGF0aWJsZUV4dGVuc2lvbihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiwgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uID0geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9KTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRpZiAoaXNOb3RXZWJFeHRlbnNpb25JbldlYlRhcmdldFBsYXRmb3JtKGV4dGVuc2lvbi5hbGxUYXJnZXRQbGF0Zm9ybXMsIHRhcmdldFBsYXRmb3JtKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChhd2FpdCB0aGlzLmlzRXh0ZW5zaW9uQ29tcGF0aWJsZShleHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlLCB0YXJnZXRQbGF0Zm9ybSkpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUgfSkgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoW3tcblx0XHRcdC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0cHJlUmVsZWFzZTogaW5jbHVkZVByZVJlbGVhc2UsXG5cdFx0XHRoYXNQcmVSZWxlYXNlOiBleHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0fV0sIHtcblx0XHRcdGNvbXBhdGlibGU6IHRydWUsXG5cdFx0XHRwcm9kdWN0VmVyc2lvbixcblx0XHRcdHF1ZXJ5QWxsVmVyc2lvbnM6IHRydWUsXG5cdFx0XHR0YXJnZXRQbGF0Zm9ybSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHJldHVybiByZXN1bHRbMF0gPz8gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGlzRXh0ZW5zaW9uQ29tcGF0aWJsZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiwgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uID0geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNWYWxpZFZlcnNpb24oXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0dmVyc2lvbjogZXh0ZW5zaW9uLnZlcnNpb24sXG5cdFx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb246IGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRcdHRhcmdldFBsYXRmb3JtOiBleHRlbnNpb24ucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0bWFuaWZlc3RBc3NldDogZXh0ZW5zaW9uLmFzc2V0cy5tYW5pZmVzdCxcblx0XHRcdFx0ZW5naW5lOiBleHRlbnNpb24ucHJvcGVydGllcy5lbmdpbmUsXG5cdFx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmVuYWJsZWRBcGlQcm9wb3NhbHNcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRhcmdldFBsYXRmb3JtLFxuXHRcdFx0XHRjb21wYXRpYmxlOiB0cnVlLFxuXHRcdFx0XHRwcm9kdWN0VmVyc2lvbixcblx0XHRcdFx0dmVyc2lvbjogaW5jbHVkZVByZVJlbGVhc2UgPyBWZXJzaW9uS2luZC5MYXRlc3QgOiBWZXJzaW9uS2luZC5SZWxlYXNlXG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLFxuXHRcdFx0ZXh0ZW5zaW9uLmFsbFRhcmdldFBsYXRmb3Jtc1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzVmFsaWRWZXJzaW9uKFxuXHRcdGV4dGVuc2lvbjogeyBpZDogc3RyaW5nOyB2ZXJzaW9uOiBzdHJpbmc7IGlzUHJlUmVsZWFzZVZlcnNpb246IGJvb2xlYW47IHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybTsgbWFuaWZlc3RBc3NldDogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7IGVuZ2luZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBlbmFibGVkQXBpUHJvcG9zYWxzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9LFxuXHRcdHsgdGFyZ2V0UGxhdGZvcm0sIGNvbXBhdGlibGUsIHByb2R1Y3RWZXJzaW9uLCB2ZXJzaW9uIH06IE9taXQ8RXh0ZW5zaW9uVmVyc2lvbkNyaXRlcmlhLCAndGFyZ2V0UGxhdGZvcm0nPiAmIHsgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtIHwgdW5kZWZpbmVkIH0sXG5cdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZyxcblx0XHRhbGxUYXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW11cblx0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRjb25zdCBoYXNQcmVSZWxlYXNlID0gaGFzUHJlUmVsZWFzZUZvckV4dGVuc2lvbihleHRlbnNpb24uaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVWZXJzaW9uUmFuZ2UgPSBnZXRFeGNsdWRlVmVyc2lvblJhbmdlRm9yRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZCwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmlzUHJlUmVsZWFzZVZlcnNpb24gJiYgaGFzUHJlUmVsZWFzZSA9PT0gZmFsc2UgLyogU2tpcCBpZiBoYXNQcmVSZWxlYXNlIGlzIG5vdCBkZWZpbmVkIGZvciB0aGlzIGV4dGVuc2lvbiAqLykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChleGNsdWRlVmVyc2lvblJhbmdlICYmIHNlbXZlci5zYXRpc2ZpZXMoZXh0ZW5zaW9uLnZlcnNpb24sIGV4Y2x1ZGVWZXJzaW9uUmFuZ2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gU3BlY2lmaWMgdmVyc2lvblxuXHRcdGlmIChpc1N0cmluZyh2ZXJzaW9uKSkge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi52ZXJzaW9uICE9PSB2ZXJzaW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQcmVyZWxlYXNlIG9yIHJlbGVhc2UgdmVyc2lvbiBraW5kXG5cdFx0ZWxzZSBpZiAodmVyc2lvbiA9PT0gVmVyc2lvbktpbmQuUmVsZWFzZSB8fCB2ZXJzaW9uID09PSBWZXJzaW9uS2luZC5QcmVyZWxlYXNlKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmlzUHJlUmVsZWFzZVZlcnNpb24gIT09ICh2ZXJzaW9uID09PSBWZXJzaW9uS2luZC5QcmVyZWxlYXNlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldFBsYXRmb3JtICYmICFpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZShleHRlbnNpb24udGFyZ2V0UGxhdGZvcm0sIGFsbFRhcmdldFBsYXRmb3JtcywgdGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbXBhdGlibGUpIHtcblx0XHRcdGlmICh0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoeyBpZDogZXh0ZW5zaW9uLmlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZSwgdmVyc2lvbjogZXh0ZW5zaW9uLnZlcnNpb24sIHByZXJlbGVhc2U6IGV4dGVuc2lvbi5pc1ByZVJlbGVhc2VWZXJzaW9uLCB0YXJnZXRQbGF0Zm9ybTogZXh0ZW5zaW9uLnRhcmdldFBsYXRmb3JtIH0pICE9PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5pc0VuZ2luZVZhbGlkKGV4dGVuc2lvbi5pZCwgZXh0ZW5zaW9uLnZlcnNpb24sIGV4dGVuc2lvbi5lbmdpbmUsIGV4dGVuc2lvbi5tYW5pZmVzdEFzc2V0LCBwcm9kdWN0VmVyc2lvbikpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaXNFbmdpbmVWYWxpZChleHRlbnNpb25JZDogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcsIGVuZ2luZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBtYW5pZmVzdEFzc2V0OiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbCwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghZW5naW5lKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRlbmdpbmUgPSBhd2FpdCB0aGlzLmdldEVuZ2luZShleHRlbnNpb25JZCwgdmVyc2lvbiwgbWFuaWZlc3RBc3NldCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIGdldHRpbmcgdGhlIGVuZ2luZSBmb3IgdGhlIHZlcnNpb24gJHt2ZXJzaW9ufS5gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZW5naW5lKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYE1pc3NpbmcgZW5naW5lIGZvciB0aGUgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSWR9IHdpdGggdmVyc2lvbiAke3ZlcnNpb259YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlzRW5naW5lVmFsaWQoZW5naW5lLCBwcm9kdWN0VmVyc2lvbi52ZXJzaW9uLCBwcm9kdWN0VmVyc2lvbi5kYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RW5naW5lKGV4dGVuc2lvbklkOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZywgbWFuaWZlc3RBc3NldDogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGwpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghbWFuaWZlc3RBc3NldCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBNaXNzaW5nIGVuZ2luZSBhbmQgbWFuaWZlc3QgYXNzZXQgZm9yIHRoZSBleHRlbnNpb24gJHtleHRlbnNpb25JZH0gd2l0aCB2ZXJzaW9uICR7dmVyc2lvbn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0eXBlIEdhbGxlcnlTZXJ2aWNlRW5naW5lRmFsbGJhY2tDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdGYWxsYmFjayByZXF1ZXN0IHdoZW4gZW5naW5lIGlzIG5vdCBmb3VuZCBpbiBwcm9wZXJ0aWVzIG9mIGFuIGV4dGVuc2lvbiB2ZXJzaW9uJztcblx0XHRcdFx0ZXh0ZW5zaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZXh0ZW5zaW9uIG5hbWUnIH07XG5cdFx0XHRcdGV4dGVuc2lvblZlcnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICd2ZXJzaW9uJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgR2FsbGVyeVNlcnZpY2VFbmdpbmVGYWxsYmFja0V2ZW50ID0ge1xuXHRcdFx0XHRleHRlbnNpb246IHN0cmluZztcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdhbGxlcnlTZXJ2aWNlRW5naW5lRmFsbGJhY2tFdmVudCwgR2FsbGVyeVNlcnZpY2VFbmdpbmVGYWxsYmFja0NsYXNzaWZpY2F0aW9uPignZ2FsbGVyeVNlcnZpY2U6ZW5naW5lRmFsbGJhY2snLCB7IGV4dGVuc2lvbjogZXh0ZW5zaW9uSWQsIGV4dGVuc2lvblZlcnNpb246IHZlcnNpb24gfSk7XG5cblx0XHRcdGNvbnN0IGhlYWRlcnMgPSB7ICdBY2NlcHQtRW5jb2RpbmcnOiAnZ3ppcCcgfTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldEFzc2V0KGV4dGVuc2lvbklkLCBtYW5pZmVzdEFzc2V0LCBBc3NldFR5cGUuTWFuaWZlc3QsIHZlcnNpb24sICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5lbmdpbmVWZXJzaW9uJywgeyBoZWFkZXJzIH0pO1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCBhc0pzb248SUV4dGVuc2lvbk1hbmlmZXN0Pihjb250ZXh0KTtcblx0XHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBNYW5pZmVzdCB3YXMgbm90IGZvdW5kIGZvciB0aGUgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSWR9IHdpdGggdmVyc2lvbiAke3ZlcnNpb259YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWFuaWZlc3QuZW5naW5lcy52c2NvZGU7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgZ2V0dGluZyB0aGUgZW5naW5lIGZvciB0aGUgdmVyc2lvbiAke3ZlcnNpb259LmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBxdWVyeShvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlcjxJR2FsbGVyeUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCk7XG5cblx0XHRpZiAoIWV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBleHRlbnNpb24gZ2FsbGVyeSBzZXJ2aWNlIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHRleHQgPSBvcHRpb25zLnRleHQgfHwgJyc7XG5cdFx0Y29uc3QgcGFnZVNpemUgPSBvcHRpb25zLnBhZ2VTaXplID8/IDUwO1xuXG5cdFx0bGV0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KClcblx0XHRcdC53aXRoUGFnZSgxLCBwYWdlU2l6ZSk7XG5cblx0XHRpZiAodGV4dCkge1xuXHRcdFx0Ly8gVXNlIGNhdGVnb3J5IGZpbHRlciBpbnN0ZWFkIG9mIFwiY2F0ZWdvcnk6dGhlbWVzXCJcblx0XHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcYmNhdGVnb3J5OihcIihbXlwiXSopXCJ8KFteXCJdXFxTKikpKFxccyt8XFxifCQpL2csIChfLCBxdW90ZWRDYXRlZ29yeSwgY2F0ZWdvcnkpID0+IHtcblx0XHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuQ2F0ZWdvcnksIGNhdGVnb3J5IHx8IHF1b3RlZENhdGVnb3J5KTtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFVzZSB0YWcgZmlsdGVyIGluc3RlYWQgb2YgXCJ0YWc6ZGVidWdnZXJzXCJcblx0XHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcYnRhZzooXCIoW15cIl0qKVwifChbXlwiXVxcUyopKShcXHMrfFxcYnwkKS9nLCAoXywgcXVvdGVkVGFnLCB0YWcpID0+IHtcblx0XHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuVGFnLCB0YWcgfHwgcXVvdGVkVGFnKTtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFVzZSBmZWF0dXJlZCBmaWx0ZXJcblx0XHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcYmZlYXR1cmVkKFxccyt8XFxifCQpL2csICgpID0+IHtcblx0XHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuRmVhdHVyZWQpO1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGV4dCA9IHRleHQudHJpbSgpO1xuXG5cdFx0XHRpZiAodGV4dCkge1xuXHRcdFx0XHR0ZXh0ID0gdGV4dC5sZW5ndGggPCAyMDAgPyB0ZXh0IDogdGV4dC5zdWJzdHJpbmcoMCwgMjAwKTtcblx0XHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuU2VhcmNoVGV4dCwgdGV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5LnNvcnRpbmc/LnNvbWUoYyA9PiBjLm5hbWUgPT09IFNvcnRCeS5Ob25lT3JSZWxldmFuY2UpKSB7XG5cdFx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aFNvcnRCeShTb3J0QnkuTm9uZU9yUmVsZXZhbmNlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuc29ydGluZz8uc29tZShjID0+IGMubmFtZSA9PT0gU29ydEJ5Lkluc3RhbGxDb3VudCkpIHtcblx0XHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU29ydEJ5KFNvcnRCeS5JbnN0YWxsQ291bnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnNvcnRCeSAmJiBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5LnNvcnRpbmc/LnNvbWUoYyA9PiBjLm5hbWUgPT09IG9wdGlvbnMuc29ydEJ5KSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU29ydEJ5KG9wdGlvbnMuc29ydEJ5KTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuc29ydE9yZGVyID09PSAnbnVtYmVyJykge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU29ydE9yZGVyKG9wdGlvbnMuc29ydE9yZGVyKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5zb3VyY2UpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aFNvdXJjZShvcHRpb25zLnNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcnVuUXVlcnkgPSBhc3luYyAocXVlcnk6IFF1ZXJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdGNvbnN0IHsgZXh0ZW5zaW9ucywgdG90YWwgfSA9IGF3YWl0IHRoaXMucXVlcnlHYWxsZXJ5RXh0ZW5zaW9ucyhxdWVyeSwgeyB0YXJnZXRQbGF0Zm9ybTogQ1VSUkVOVF9UQVJHRVRfUExBVEZPUk0sIGNvbXBhdGlibGU6IGZhbHNlLCBpbmNsdWRlUHJlUmVsZWFzZTogISFvcHRpb25zLmluY2x1ZGVQcmVSZWxlYXNlLCBwcm9kdWN0VmVyc2lvbjogb3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0gfSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0b2tlbik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0bGV0IGRlZmF1bHRDaGF0QWdlbnRFeHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGV4dGVuc2lvbnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNbaW5kZXhdO1xuXHRcdFx0XHRzZXRUZWxlbWV0cnkoZXh0ZW5zaW9uLCAoKHF1ZXJ5LnBhZ2VOdW1iZXIgLSAxKSAqIHF1ZXJ5LnBhZ2VTaXplKSArIGluZGV4LCBvcHRpb25zLnNvdXJjZSk7XG5cdFx0XHRcdGlmIChhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgeyBpZDogdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkLCB9KSkge1xuXHRcdFx0XHRcdGRlZmF1bHRDaGF0QWdlbnRFeHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGRlZmF1bHRDaGF0QWdlbnRFeHRlbnNpb24pIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZGVmYXVsdENoYXRBZ2VudEV4dGVuc2lvbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGV4dGVuc2lvbnM6IHJlc3VsdCwgdG90YWwgfTtcblx0XHR9O1xuXHRcdGNvbnN0IHsgZXh0ZW5zaW9ucywgdG90YWwgfSA9IGF3YWl0IHJ1blF1ZXJ5KHF1ZXJ5LCB0b2tlbik7XG5cdFx0Y29uc3QgZ2V0UGFnZSA9IGFzeW5jIChwYWdlSW5kZXg6IG51bWJlciwgY3Q6IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRpZiAoY3QuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGV4dGVuc2lvbnMgfSA9IGF3YWl0IHJ1blF1ZXJ5KHF1ZXJ5LndpdGhQYWdlKHBhZ2VJbmRleCArIDEpLCBjdCk7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9ucztcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHsgZmlyc3RQYWdlOiBleHRlbnNpb25zLCB0b3RhbCwgcGFnZVNpemU6IHF1ZXJ5LnBhZ2VTaXplLCBnZXRQYWdlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5R2FsbGVyeUV4dGVuc2lvbnMocXVlcnk6IFF1ZXJ5LCBjcml0ZXJpYTogRXh0ZW5zaW9uc0NyaXRlcmlhLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBleHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdOyB0b3RhbDogbnVtYmVyIH0+IHtcblx0XHRjb25zdCBmbGFncyA9IHF1ZXJ5LmZsYWdzO1xuXG5cdFx0LyoqXG5cdFx0ICogSWYgYm90aCB2ZXJzaW9uIGZsYWdzIChJbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkgYW5kIEluY2x1ZGVWZXJzaW9ucykgYXJlIGluY2x1ZGVkLCB0aGVuIG9ubHkgaW5jbHVkZSBsYXRlc3QgdmVyc2lvbnMgKEluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSkgZmxhZy5cblx0XHQgKi9cblx0XHRpZiAocXVlcnkuZmxhZ3MuaW5jbHVkZXMoRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpICYmIHF1ZXJ5LmZsYWdzLmluY2x1ZGVzKEZsYWcuSW5jbHVkZVZlcnNpb25zKSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MuZmlsdGVyKGZsYWcgPT4gZmxhZyAhPT0gRmxhZy5JbmNsdWRlVmVyc2lvbnMpKTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBJZiB2ZXJzaW9uIGZsYWdzIChJbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkgYW5kIEluY2x1ZGVWZXJzaW9ucykgYXJlIG5vdCBpbmNsdWRlZCwgZGVmYXVsdCBpcyB0byBxdWVyeSBmb3IgbGF0ZXN0IHZlcnNpb25zIChJbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpLlxuXHRcdCAqL1xuXHRcdGlmICghcXVlcnkuZmxhZ3MuaW5jbHVkZXMoRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpICYmICFxdWVyeS5mbGFncy5pbmNsdWRlcyhGbGFnLkluY2x1ZGVWZXJzaW9ucykpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZsYWdzKC4uLnF1ZXJ5LmZsYWdzLCBGbGFnLkluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogSWYgdmVyc2lvbnMgY3JpdGVyaWEgZXhpc3Qgb3IgZXZlcnkgcmVxdWVzdGVkIGV4dGVuc2lvbiBpcyBmb3IgcmVsZWFzZSB2ZXJzaW9uIGFuZCBoYXMgYSBwcmUtcmVsZWFzZSB2ZXJzaW9uLCB0aGVuIHJlbW92ZSBsYXRlc3QgZmxhZ3MgYW5kIGFkZCBhbGwgdmVyc2lvbnMgZmxhZy5cblx0XHQgKi9cblx0XHRpZiAoY3JpdGVyaWEudmVyc2lvbnM/Lmxlbmd0aCB8fCBjcml0ZXJpYS5pc1F1ZXJ5Rm9yUmVsZWFzZVZlcnNpb25Gcm9tUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZsYWdzKC4uLnF1ZXJ5LmZsYWdzLmZpbHRlcihmbGFnID0+IGZsYWcgIT09IEZsYWcuSW5jbHVkZUxhdGVzdFZlcnNpb25Pbmx5KSwgRmxhZy5JbmNsdWRlVmVyc2lvbnMpO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIEFkZCBuZWNlc3NhcnkgZXh0ZW5zaW9uIGZsYWdzXG5cdFx0ICovXG5cdFx0cXVlcnkgPSBxdWVyeS53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MsIEZsYWcuSW5jbHVkZUFzc2V0VXJpLCBGbGFnLkluY2x1ZGVDYXRlZ29yeUFuZFRhZ3MsIEZsYWcuSW5jbHVkZUZpbGVzLCBGbGFnLkluY2x1ZGVTdGF0aXN0aWNzLCBGbGFnLkluY2x1ZGVWZXJzaW9uUHJvcGVydGllcyk7XG5cdFx0Y29uc3QgeyBnYWxsZXJ5RXh0ZW5zaW9uczogcmF3R2FsbGVyeUV4dGVuc2lvbnMsIHRvdGFsLCBjb250ZXh0IH0gPSBhd2FpdCB0aGlzLnF1ZXJ5UmF3R2FsbGVyeUV4dGVuc2lvbnMocXVlcnksIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pO1xuXG5cdFx0Y29uc3QgaGFzQWxsVmVyc2lvbnM6IGJvb2xlYW4gPSAhcXVlcnkuZmxhZ3MuaW5jbHVkZXMoRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpO1xuXHRcdGlmIChoYXNBbGxWZXJzaW9ucykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByYXdHYWxsZXJ5RXh0ZW5zaW9uIG9mIHJhd0dhbGxlcnlFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IGdldEFsbFRhcmdldFBsYXRmb3JtcyhyYXdHYWxsZXJ5RXh0ZW5zaW9uKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChyYXdHYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5wdWJsaXNoZXJOYW1lLCByYXdHYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbk5hbWUpLCB1dWlkOiByYXdHYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbklkIH07XG5cdFx0XHRcdGNvbnN0IGluY2x1ZGVQcmVSZWxlYXNlID0gaXNCb29sZWFuKGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlKSA/IGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlIDogISFjcml0ZXJpYS5pbmNsdWRlUHJlUmVsZWFzZS5maW5kKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoUHJlUmVsZWFzZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb25JZGVudGlmaWVyV2l0aFByZVJlbGVhc2UsIGV4dGVuc2lvbklkZW50aWZpZXIpKT8uaW5jbHVkZVByZVJlbGVhc2U7XG5cdFx0XHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uID0gYXdhaXQgdGhpcy5nZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKFxuXHRcdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24sXG5cdFx0XHRcdFx0cmF3R2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9ucyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRjb21wYXRpYmxlOiBjcml0ZXJpYS5jb21wYXRpYmxlLFxuXHRcdFx0XHRcdFx0dGFyZ2V0UGxhdGZvcm06IGNyaXRlcmlhLnRhcmdldFBsYXRmb3JtLFxuXHRcdFx0XHRcdFx0cHJvZHVjdFZlcnNpb246IGNyaXRlcmlhLnByb2R1Y3RWZXJzaW9uLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogY3JpdGVyaWEudmVyc2lvbnM/LmZpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcldpdGhWZXJzaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoVmVyc2lvbiwgZXh0ZW5zaW9uSWRlbnRpZmllcikpPy52ZXJzaW9uXG5cdFx0XHRcdFx0XHRcdD8/IChpbmNsdWRlUHJlUmVsZWFzZSA/IFZlcnNpb25LaW5kLkxhdGVzdCA6IFZlcnNpb25LaW5kLlJlbGVhc2UpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXNcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRvRXh0ZW5zaW9uKHJhd0dhbGxlcnlFeHRlbnNpb24sIHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBhbGxUYXJnZXRQbGF0Zm9ybXMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdGhpcy5wcm9kdWN0U2VydmljZSwgY29udGV4dCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBleHRlbnNpb25zLCB0b3RhbCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogW251bWJlciwgSUdhbGxlcnlFeHRlbnNpb25dW10gPSBbXTtcblx0XHRjb25zdCBuZWVkQWxsVmVyc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCByYXdHYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb24gPSByYXdHYWxsZXJ5RXh0ZW5zaW9uc1tpbmRleF07XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZGVudGlmaWVyID0geyBpZDogZ2V0R2FsbGVyeUV4dGVuc2lvbklkKHJhd0dhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLnB1Ymxpc2hlck5hbWUsIHJhd0dhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uTmFtZSksIHV1aWQ6IHJhd0dhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uSWQgfTtcblx0XHRcdGNvbnN0IGluY2x1ZGVQcmVSZWxlYXNlID0gaXNCb29sZWFuKGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlKSA/IGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlIDogISFjcml0ZXJpYS5pbmNsdWRlUHJlUmVsZWFzZS5maW5kKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoUHJlUmVsZWFzZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb25JZGVudGlmaWVyV2l0aFByZVJlbGVhc2UsIGV4dGVuc2lvbklkZW50aWZpZXIpKT8uaW5jbHVkZVByZVJlbGVhc2U7XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBnZXRBbGxUYXJnZXRQbGF0Zm9ybXMocmF3R2FsbGVyeUV4dGVuc2lvbik7XG5cdFx0XHRpZiAoY3JpdGVyaWEuY29tcGF0aWJsZSkge1xuXHRcdFx0XHQvLyBTa2lwIGxvb2tpbmcgZm9yIGFsbCB2ZXJzaW9ucyBpZiByZXF1ZXN0ZWQgZm9yIGEgd2ViLWNvbXBhdGlibGUgZXh0ZW5zaW9uIGFuZCBpdCBpcyBub3QgYSB3ZWIgZXh0ZW5zaW9uLlxuXHRcdFx0XHRpZiAoaXNOb3RXZWJFeHRlbnNpb25JbldlYlRhcmdldFBsYXRmb3JtKGFsbFRhcmdldFBsYXRmb3JtcywgY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gU2tpcCBsb29raW5nIGZvciBhbGwgdmVyc2lvbnMgaWYgdGhlIGV4dGVuc2lvbiBpcyBub3QgYWxsb3dlZC5cblx0XHRcdFx0aWYgKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb25JZGVudGlmaWVyLmlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogcmF3R2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIuZGlzcGxheU5hbWUgfSkgIT09IHRydWUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24gPSBhd2FpdCB0aGlzLmdldFZhbGlkUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24oXG5cdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24sXG5cdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24udmVyc2lvbnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb21wYXRpYmxlOiBjcml0ZXJpYS5jb21wYXRpYmxlLFxuXHRcdFx0XHRcdHRhcmdldFBsYXRmb3JtOiBjcml0ZXJpYS50YXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0XHRwcm9kdWN0VmVyc2lvbjogY3JpdGVyaWEucHJvZHVjdFZlcnNpb24sXG5cdFx0XHRcdFx0dmVyc2lvbjogY3JpdGVyaWEudmVyc2lvbnM/LmZpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcldpdGhWZXJzaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoVmVyc2lvbiwgZXh0ZW5zaW9uSWRlbnRpZmllcikpPy52ZXJzaW9uXG5cdFx0XHRcdFx0XHQ/PyAoaW5jbHVkZVByZVJlbGVhc2UgPyBWZXJzaW9uS2luZC5MYXRlc3QgOiBWZXJzaW9uS2luZC5SZWxlYXNlKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXNcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiA/IHRvRXh0ZW5zaW9uKHJhd0dhbGxlcnlFeHRlbnNpb24sIHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBhbGxUYXJnZXRQbGF0Zm9ybXMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdGhpcy5wcm9kdWN0U2VydmljZSwgY29udGV4dCkgOiBudWxsO1xuXHRcdFx0aWYgKCFleHRlbnNpb25cblx0XHRcdFx0LyoqIE5lZWQgYWxsIHZlcnNpb25zIGlmIHRoZSBleHRlbnNpb24gaXMgYSBwcmUtcmVsZWFzZSB2ZXJzaW9uIGJ1dFxuXHRcdFx0XHQgKiBcdFx0LSB0aGUgcXVlcnkgaXMgdG8gbG9vayBmb3IgYSByZWxlYXNlIHZlcnNpb24gb3Jcblx0XHRcdFx0ICogXHRcdC0gdGhlIGV4dGVuc2lvbiBoYXMgbm8gcmVsZWFzZSB2ZXJzaW9uXG5cdFx0XHRcdCAqIEdldCBhbGwgdmVyc2lvbnMgdG8gZ2V0IG9yIGNoZWNrIHRoZSByZWxlYXNlIHZlcnNpb25cblx0XHRcdFx0Ki9cblx0XHRcdFx0fHwgKGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gJiYgKCFpbmNsdWRlUHJlUmVsZWFzZSB8fCAhZXh0ZW5zaW9uLmhhc1JlbGVhc2VWZXJzaW9uKSlcblx0XHRcdFx0LyoqXG5cdFx0XHRcdCAqIE5lZWQgYWxsIHZlcnNpb25zIGlmIHRoZSBleHRlbnNpb24gaXMgYSByZWxlYXNlIHZlcnNpb24gd2l0aCBhIGRpZmZlcmVudCB0YXJnZXQgcGxhdGZvcm0gdGhhbiByZXF1ZXN0ZWQgYW5kIGFsc28gaGFzIGEgcHJlLXJlbGVhc2UgdmVyc2lvblxuXHRcdFx0XHQgKiBCZWNhdXNlLCB0aGlzIGlzIGEgcGxhdGZvcm0gc3BlY2lmaWMgZXh0ZW5zaW9uIGFuZCBjYW4gaGF2ZSBhIG5ld2VyIHJlbGVhc2UgdmVyc2lvbiBzdXBwb3J0aW5nIHRoaXMgcGxhdGZvcm0uXG5cdFx0XHRcdCAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM5NjI4XG5cdFx0XHRcdCovXG5cdFx0XHRcdHx8ICghZXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiAmJiBleHRlbnNpb24ucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybSAhPT0gY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0gJiYgZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uKVxuXHRcdFx0KSB7XG5cdFx0XHRcdG5lZWRBbGxWZXJzaW9ucy5zZXQocmF3R2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25JZCwgaW5kZXgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goW2luZGV4LCBleHRlbnNpb25dKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmVlZEFsbFZlcnNpb25zLnNpemUpIHtcblx0XHRcdGNvbnN0IHN0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KClcblx0XHRcdFx0LndpdGhGbGFncyguLi5mbGFncy5maWx0ZXIoZmxhZyA9PiBmbGFnICE9PSBGbGFnLkluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSksIEZsYWcuSW5jbHVkZVZlcnNpb25zKVxuXHRcdFx0XHQud2l0aFBhZ2UoMSwgbmVlZEFsbFZlcnNpb25zLnNpemUpXG5cdFx0XHRcdC53aXRoRmlsdGVyKEZpbHRlclR5cGUuRXh0ZW5zaW9uSWQsIC4uLm5lZWRBbGxWZXJzaW9ucy5rZXlzKCkpO1xuXHRcdFx0Y29uc3QgeyBleHRlbnNpb25zIH0gPSBhd2FpdCB0aGlzLnF1ZXJ5R2FsbGVyeUV4dGVuc2lvbnMocXVlcnksIGNyaXRlcmlhLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdhbGxlcnlTZXJ2aWNlQWRkaXRpb25hbFF1ZXJ5RXZlbnQsIEdhbGxlcnlTZXJ2aWNlQWRkaXRpb25hbFF1ZXJ5Q2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTphZGRpdGlvbmFsUXVlcnknLCB7XG5cdFx0XHRcdGR1cmF0aW9uOiBzdG9wV2F0Y2guZWxhcHNlZCgpLFxuXHRcdFx0XHRjb3VudDogbmVlZEFsbFZlcnNpb25zLnNpemVcblx0XHRcdH0pO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IG5lZWRBbGxWZXJzaW9ucy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkhO1xuXHRcdFx0XHRyZXN1bHQucHVzaChbaW5kZXgsIGV4dGVuc2lvbl0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGV4dGVuc2lvbnM6IHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhWzBdIC0gYlswXSkubWFwKChbLCBleHRlbnNpb25dKSA9PiBleHRlbnNpb24pLCB0b3RhbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKHJhd0dhbGxlcnlFeHRlbnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uLCB2ZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10sIGNyaXRlcmlhOiBFeHRlbnNpb25WZXJzaW9uQ3JpdGVyaWEsIGFsbFRhcmdldFBsYXRmb3JtczogVGFyZ2V0UGxhdGZvcm1bXSk6IFByb21pc2U8SVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkZW50aWZpZXIgPSB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQocmF3R2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSwgcmF3R2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25OYW1lKSwgdXVpZDogcmF3R2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25JZCB9O1xuXHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9ucyA9IHNvcnRFeHRlbnNpb25WZXJzaW9ucyh2ZXJzaW9ucywgY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0pO1xuXG5cdFx0aWYgKGNyaXRlcmlhLmNvbXBhdGlibGUgJiYgaXNOb3RXZWJFeHRlbnNpb25JbldlYlRhcmdldFBsYXRmb3JtKGFsbFRhcmdldFBsYXRmb3JtcywgY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uID0gaXNTdHJpbmcoY3JpdGVyaWEudmVyc2lvbikgPyBjcml0ZXJpYS52ZXJzaW9uIDogdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uID0gcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25zW2luZGV4XTtcblx0XHRcdGlmIChjcml0ZXJpYS5jb21wYXRpYmxlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0RW5naW5lSWZOb3RFeGlzdHMoZXh0ZW5zaW9uSWRlbnRpZmllci5pZCwgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF3YWl0IHRoaXMuaXNWYWxpZFZlcnNpb24oXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uSWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHR2ZXJzaW9uOiByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbi52ZXJzaW9uLFxuXHRcdFx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb246IGlzUHJlUmVsZWFzZVZlcnNpb24ocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pLFxuXHRcdFx0XHRcdHRhcmdldFBsYXRmb3JtOiBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24ocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pLFxuXHRcdFx0XHRcdGVuZ2luZTogZ2V0RW5naW5lKHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKSxcblx0XHRcdFx0XHRtYW5pZmVzdEFzc2V0OiBnZXRWZXJzaW9uQXNzZXQocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIEFzc2V0VHlwZS5NYW5pZmVzdCksXG5cdFx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogZ2V0RW5hYmxlZEFwaVByb3Bvc2FscyhyYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbilcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JpdGVyaWEsXG5cdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXMpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZlcnNpb24gJiYgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24udmVyc2lvbiA9PT0gdmVyc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodmVyc2lvbiB8fCBjcml0ZXJpYS5jb21wYXRpYmxlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBGYWxsYmFjazogUmV0dXJuIHRoZSBsYXRlc3QgdmVyc2lvblxuXHRcdCAqIFRoaXMgY2FuIGhhcHBlbiB3aGVuIHRoZSBleHRlbnNpb24gZG9lcyBub3QgaGF2ZSBhIHJlbGVhc2UgdmVyc2lvbiBvciBkb2VzIG5vdCBoYXZlIGEgdmVyc2lvbiBjb21wYXRpYmxlIHdpdGggdGhlIGdpdmVuIHRhcmdldCBwbGF0Zm9ybS5cblx0XHQgKi9cblx0XHRyZXR1cm4gcmF3R2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9uc1swXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0RW5naW5lSWZOb3RFeGlzdHMoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChnZXRFbmdpbmUocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVuZ2luZSA9IGF3YWl0IHRoaXMuZ2V0RW5naW5lKGV4dGVuc2lvbklkLCByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbi52ZXJzaW9uLCBnZXRWZXJzaW9uQXNzZXQocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIEFzc2V0VHlwZS5NYW5pZmVzdCkpO1xuXHRcdFx0aWYgKGVuZ2luZSkge1xuXHRcdFx0XHRzZXRFbmdpbmUocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIGVuZ2luZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgZ2V0dGluZyB0aGUgZW5naW5lIGZvciB0aGUgdmVyc2lvbiAke3Jhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLnZlcnNpb259LmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlSYXdHYWxsZXJ5RXh0ZW5zaW9ucyhxdWVyeTogUXVlcnksIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3R2FsbGVyeUV4dGVuc2lvbnNSZXN1bHQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zUXVlcnlBcGkgPSBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uUXVlcnlTZXJ2aWNlKTtcblxuXHRcdGlmICghZXh0ZW5zaW9uc1F1ZXJ5QXBpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGV4dGVuc2lvbiBnYWxsZXJ5IHF1ZXJ5IHNlcnZpY2UgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRxdWVyeSA9IHF1ZXJ5XG5cdFx0XHQvKiBBbHdheXMgZXhjbHVkZSBub24gdmFsaWRhdGVkIGV4dGVuc2lvbnMgKi9cblx0XHRcdC53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MsIEZsYWcuRXhjbHVkZU5vblZhbGlkYXRlZClcblx0XHRcdC53aXRoRmlsdGVyKEZpbHRlclR5cGUuVGFyZ2V0LCAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlJyk7XG5cblx0XHRjb25zdCB1bnB1Ymxpc2hlZEZsYWcgPSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5LmZsYWdzPy5maW5kKGYgPT4gZi5uYW1lID09PSBGbGFnLlVucHVibGlzaGVkKTtcblx0XHQvKiBBbHdheXMgZXhjbHVkZSB1bnB1Ymxpc2hlZCBleHRlbnNpb25zICovXG5cdFx0aWYgKHVucHVibGlzaGVkRmxhZykge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuRXhjbHVkZVdpdGhGbGFncywgU3RyaW5nKHVucHVibGlzaGVkRmxhZy52YWx1ZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRmaWx0ZXJzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjcml0ZXJpYTogcXVlcnkuY3JpdGVyaWEucmVkdWNlPHsgZmlsdGVyVHlwZTogbnVtYmVyOyB2YWx1ZT86IHN0cmluZyB9W10+KChjcml0ZXJpYSwgYykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3JpdGVyaXVtID0gZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5maWx0ZXJpbmc/LmZpbmQoZiA9PiBmLm5hbWUgPT09IGMuZmlsdGVyVHlwZSk7XG5cdFx0XHRcdFx0XHRpZiAoY3JpdGVyaXVtKSB7XG5cdFx0XHRcdFx0XHRcdGNyaXRlcmlhLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdGZpbHRlclR5cGU6IGNyaXRlcml1bS52YWx1ZSxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogYy52YWx1ZSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gY3JpdGVyaWE7XG5cdFx0XHRcdFx0fSwgW10pLFxuXHRcdFx0XHRcdHBhZ2VOdW1iZXI6IHF1ZXJ5LnBhZ2VOdW1iZXIsXG5cdFx0XHRcdFx0cGFnZVNpemU6IHF1ZXJ5LnBhZ2VTaXplLFxuXHRcdFx0XHRcdHNvcnRCeTogZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5zb3J0aW5nPy5maW5kKHMgPT4gcy5uYW1lID09PSBxdWVyeS5zb3J0QnkpPy52YWx1ZSxcblx0XHRcdFx0XHRzb3J0T3JkZXI6IHF1ZXJ5LnNvcnRPcmRlcixcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGFzc2V0VHlwZXM6IHF1ZXJ5LmFzc2V0VHlwZXMsXG5cdFx0XHRmbGFnczogcXVlcnkuZmxhZ3MucmVkdWNlPG51bWJlcj4oKGZsYWdzLCBmbGFnKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZsYWdWYWx1ZSA9IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuZmxhZ3M/LmZpbmQoZiA9PiBmLm5hbWUgPT09IGZsYWcpO1xuXHRcdFx0XHRpZiAoZmxhZ1ZhbHVlKSB7XG5cdFx0XHRcdFx0ZmxhZ3MgfD0gZmxhZ1ZhbHVlLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmbGFncztcblx0XHRcdH0sIDApXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb21tb25IZWFkZXJzID0gYXdhaXQgdGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZTtcblx0XHRjb25zdCBoZWFkZXJzID0ge1xuXHRcdFx0Li4uY29tbW9uSGVhZGVycyxcblx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb247YXBpLXZlcnNpb249My4wLXByZXZpZXcuMScsXG5cdFx0XHQnQWNjZXB0LUVuY29kaW5nJzogJ2d6aXAnLFxuXHRcdFx0J0NvbnRlbnQtTGVuZ3RoJzogU3RyaW5nKGRhdGEubGVuZ3RoKSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdGxldCBjb250ZXh0OiBJUmVxdWVzdENvbnRleHQgfCB1bmRlZmluZWQsIGVycm9yQ29kZTogRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZSB8IHVuZGVmaW5lZCwgdG90YWw6IG51bWJlciA9IDA7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdFx0dXJsOiBleHRlbnNpb25zUXVlcnlBcGksXG5cdFx0XHRcdGRhdGEsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdGNhbGxTaXRlOiAnZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UucXVlcnlSYXdHYWxsZXJ5RXh0ZW5zaW9ucydcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA+PSA0MDAgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA8IDUwMCkge1xuXHRcdFx0XHRyZXR1cm4geyBnYWxsZXJ5RXh0ZW5zaW9uczogW10sIHRvdGFsIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFzSnNvbjxJUmF3R2FsbGVyeVF1ZXJ5UmVzdWx0Pihjb250ZXh0KTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y29uc3QgciA9IHJlc3VsdC5yZXN1bHRzWzBdO1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IHIuZXh0ZW5zaW9ucztcblx0XHRcdFx0Y29uc3QgcmVzdWx0Q291bnQgPSByLnJlc3VsdE1ldGFkYXRhICYmIHIucmVzdWx0TWV0YWRhdGEuZmlsdGVyKG0gPT4gbS5tZXRhZGF0YVR5cGUgPT09ICdSZXN1bHRDb3VudCcpWzBdO1xuXHRcdFx0XHR0b3RhbCA9IHJlc3VsdENvdW50ICYmIHJlc3VsdENvdW50Lm1ldGFkYXRhSXRlbXMuZmlsdGVyKGkgPT4gaS5uYW1lID09PSAnVG90YWxDb3VudCcpWzBdLmNvdW50IHx8IDA7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucyxcblx0XHRcdFx0XHR0b3RhbCxcblx0XHRcdFx0XHRjb250ZXh0OiBjb250ZXh0LnJlcy5oZWFkZXJzWydhY3Rpdml0eWlkJ10gPyB7XG5cdFx0XHRcdFx0XHRbU0VBUkNIX0FDVElWSVRZX0hFQURFUl9OQU1FXTogY29udGV4dC5yZXMuaGVhZGVyc1snYWN0aXZpdHlpZCddXG5cdFx0XHRcdFx0fSA6IHt9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBnYWxsZXJ5RXh0ZW5zaW9uczogW10sIHRvdGFsIH07XG5cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRlcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNhbmNlbGxlZDtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldEVycm9yTWVzc2FnZShlKTtcblx0XHRcdFx0ZXJyb3JDb2RlID0gaXNPZmZsaW5lRXJyb3IoZSlcblx0XHRcdFx0XHQ/IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuT2ZmbGluZVxuXHRcdFx0XHRcdDogZXJyb3JNZXNzYWdlLnN0YXJ0c1dpdGgoJ1hIUiB0aW1lb3V0Jylcblx0XHRcdFx0XHRcdD8gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5UaW1lb3V0XG5cdFx0XHRcdFx0XHQ6IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuRmFpbGVkO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKGVycm9yTWVzc2FnZSwgZXJyb3JDb2RlKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2FsbGVyeVNlcnZpY2VRdWVyeUV2ZW50LCBHYWxsZXJ5U2VydmljZVF1ZXJ5Q2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTpxdWVyeScsIHtcblx0XHRcdFx0ZmlsdGVyVHlwZXM6IHF1ZXJ5LmNyaXRlcmlhLm1hcChjcml0ZXJpdW0gPT4gY3JpdGVyaXVtLmZpbHRlclR5cGUpLFxuXHRcdFx0XHRmbGFnczogcXVlcnkuZmxhZ3MsXG5cdFx0XHRcdHNvcnRCeTogcXVlcnkuc29ydEJ5LFxuXHRcdFx0XHRzb3J0T3JkZXI6IFN0cmluZyhxdWVyeS5zb3J0T3JkZXIpLFxuXHRcdFx0XHRwYWdlTnVtYmVyOiBTdHJpbmcocXVlcnkucGFnZU51bWJlciksXG5cdFx0XHRcdHNvdXJjZTogcXVlcnkuc291cmNlLFxuXHRcdFx0XHRzZWFyY2hUZXh0TGVuZ3RoOiBxdWVyeS5zZWFyY2hUZXh0Lmxlbmd0aCxcblx0XHRcdFx0cmVxdWVzdEJvZHlTaXplOiBTdHJpbmcoZGF0YS5sZW5ndGgpLFxuXHRcdFx0XHRkdXJhdGlvbjogc3RvcFdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdFx0c3VjY2VzczogISFjb250ZXh0ICYmIGlzU3VjY2Vzcyhjb250ZXh0KSxcblx0XHRcdFx0cmVzcG9uc2VCb2R5U2l6ZTogY29udGV4dD8ucmVzLmhlYWRlcnNbJ0NvbnRlbnQtTGVuZ3RoJ10sXG5cdFx0XHRcdHN0YXR1c0NvZGU6IGNvbnRleHQgPyBTdHJpbmcoY29udGV4dC5yZXMuc3RhdHVzQ29kZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVycm9yQ29kZSxcblx0XHRcdFx0Y291bnQ6IFN0cmluZyh0b3RhbCksXG5cdFx0XHRcdHNlcnZlcjogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgU0VSVkVSX0hFQURFUl9OQU1FKSxcblx0XHRcdFx0YWN0aXZpdHlJZDogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgQUNUSVZJVFlfSEVBREVSX05BTUUpLFxuXHRcdFx0XHRlbmRUb0VuZElkOiB0aGlzLmdldEhlYWRlclZhbHVlKGNvbnRleHQ/LnJlcy5oZWFkZXJzLCBFTkRfRU5EX0lEX0hFQURFUl9OQU1FKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SGVhZGVyVmFsdWUoaGVhZGVyczogSUhlYWRlcnMgfCB1bmRlZmluZWQsIG5hbWU6IHN0cmluZyk6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBoZWFkZXJWYWx1ZSA9IGhlYWRlcnM/LltuYW1lLnRvTG93ZXJDYXNlKCldO1xuXHRcdGNvbnN0IHZhbHVlID0gQXJyYXkuaXNBcnJheShoZWFkZXJWYWx1ZSkgPyBoZWFkZXJWYWx1ZVswXSA6IGhlYWRlclZhbHVlO1xuXHRcdHJldHVybiB2YWx1ZSA/IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUodmFsdWUpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRMYXRlc3RSYXdHYWxsZXJ5RXh0ZW5zaW9uV2l0aEZhbGxiYWNrKGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25JbmZvLCByZXNvdXJjZUFwaTogeyB1cmk6IHN0cmluZzsgZmFsbGJhY2s/OiBzdHJpbmcgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3R2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCBbcHVibGlzaGVyLCBuYW1lXSA9IGV4dGVuc2lvbkluZm8uaWQuc3BsaXQoJy4nKTtcblx0XHRsZXQgZXJyb3JDb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShmb3JtYXQyKHJlc291cmNlQXBpLnVyaSwgeyBwdWJsaXNoZXIsIG5hbWUgfSkpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZ2V0TGF0ZXN0UmF3R2FsbGVyeUV4dGVuc2lvbihleHRlbnNpb25JbmZvLmlkLCB1cmksIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKSB7XG5cdFx0XHRcdGVycm9yQ29kZSA9IGVycm9yLmNvZGU7XG5cdFx0XHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5PZmZsaW5lOlxuXHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5DYW5jZWxsZWQ6XG5cdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLlRpbWVvdXQ6XG5cdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNsaWVudEVycm9yOlxuXHRcdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yQ29kZSA9ICdVbmtub3duJztcblx0XHRcdH1cblx0XHRcdGlmICghcmVzb3VyY2VBcGkuZmFsbGJhY2spIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBzdHJpbmc7XG5cdFx0XHRcdFx0ZXJyb3JDb2RlPzogc3RyaW5nO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCBmZXRjaGluZyBsYXRlc3QgdmVyc2lvbiBvZiBhbiBleHRlbnNpb24nO1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBleHRlbnNpb24nIH07XG5cdFx0XHRcdFx0ZXJyb3JDb2RlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBjb2RlIGluIGNhc2Ugb2YgZXJyb3InIH07XG5cdFx0XHRcdH1cblx0XHRcdD4oJ2dhbGxlcnlTZXJ2aWNlOmdldG1hcmtldHBsYWNlbGF0ZXN0Jywge1xuXHRcdFx0XHRleHRlbnNpb246IGV4dGVuc2lvbkluZm8uaWQsXG5cdFx0XHRcdGVycm9yQ29kZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgZ2V0dGluZyB0aGUgbGF0ZXN0IHZlcnNpb24gZm9yIHRoZSBleHRlbnNpb24gJHtleHRlbnNpb25JbmZvLmlkfSBmcm9tICR7cmVzb3VyY2VBcGkudXJpfS4gVHJ5aW5nIHRoZSBmYWxsYmFjayAke3Jlc291cmNlQXBpLmZhbGxiYWNrfWAsIGVycm9yQ29kZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShmb3JtYXQyKHJlc291cmNlQXBpLmZhbGxiYWNrLCB7IHB1Ymxpc2hlciwgbmFtZSB9KSk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5nZXRMYXRlc3RSYXdHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbkluZm8uaWQsIHVyaSwgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlcnJvckNvZGUgPSBlcnJvciBpbnN0YW5jZW9mIEV4dGVuc2lvbkdhbGxlcnlFcnJvciA/IGVycm9yLmNvZGUgOiAnVW5rbm93bic7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleHRlbnNpb246IHN0cmluZztcblx0XHRcdFx0XHRlcnJvckNvZGU/OiBzdHJpbmc7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdFx0XHRjb21tZW50OiAnUmVwb3J0IHRoZSBmYWxsYmFjayB0byB0aGUgdW5wa2cgc2VydmljZSBmb3IgZ2V0dGluZyBsYXRlc3QgZXh0ZW5zaW9uJztcblx0XHRcdFx0XHRleHRlbnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeHRlbnNpb24gaWQnIH07XG5cdFx0XHRcdFx0ZXJyb3JDb2RlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBjb2RlIGluIGNhc2Ugb2YgZXJyb3InIH07XG5cdFx0XHRcdH0+KCdnYWxsZXJ5U2VydmljZTpmYWxsYmFja3RvdW5wa2cnLCB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb25JbmZvLmlkLFxuXHRcdFx0XHRcdGVycm9yQ29kZSxcblx0XHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRMYXRlc3RSYXdHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbjogc3RyaW5nLCB1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3R2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRsZXQgY29udGV4dDtcblx0XHRsZXQgZXJyb3JDb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaCgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbW1vbkhlYWRlcnMgPSBhd2FpdCB0aGlzLmNvbW1vbkhlYWRlcnNQcm9taXNlO1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IHtcblx0XHRcdFx0Li4uY29tbW9uSGVhZGVycyxcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uO2FwaS12ZXJzaW9uPTcuMi1wcmV2aWV3Jyxcblx0XHRcdFx0J0FjY2VwdC1FbmNvZGluZyc6ICdnemlwJyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0dXJsOiB1cmkudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHRpbWVvdXQ6IHRoaXMuZ2V0UmVxdWVzdFRpbWVvdXQoKSxcblx0XHRcdFx0Y2FsbFNpdGU6ICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRMYXRlc3RSYXdHYWxsZXJ5RXh0ZW5zaW9uJ1xuXHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDA0KSB7XG5cdFx0XHRcdGVycm9yQ29kZSA9ICdOb3RGb3VuZCc7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSAmJiBjb250ZXh0LnJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIEhUVFAgcmVzcG9uc2U6ICcgKyBjb250ZXh0LnJlcy5zdGF0dXNDb2RlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXNKc29uPElSYXdHYWxsZXJ5RXh0ZW5zaW9uPihjb250ZXh0KTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdGVycm9yQ29kZSA9ICdOb0RhdGEnO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxldCBnYWxsZXJ5RXJyb3JDb2RlOiBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlO1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdGdhbGxlcnlFcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNhbmNlbGxlZDtcblx0XHRcdH0gZWxzZSBpZiAoaXNPZmZsaW5lRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdGdhbGxlcnlFcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLk9mZmxpbmU7XG5cdFx0XHR9IGVsc2UgaWYgKGdldEVycm9yTWVzc2FnZShlcnJvcikuc3RhcnRzV2l0aCgnWEhSIHRpbWVvdXQnKSkge1xuXHRcdFx0XHRnYWxsZXJ5RXJyb3JDb2RlID0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5UaW1lb3V0O1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZXh0ICYmIGlzQ2xpZW50RXJyb3IoY29udGV4dCkpIHtcblx0XHRcdFx0Z2FsbGVyeUVycm9yQ29kZSA9IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuQ2xpZW50RXJyb3I7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRleHQgJiYgaXNTZXJ2ZXJFcnJvcihjb250ZXh0KSkge1xuXHRcdFx0XHRnYWxsZXJ5RXJyb3JDb2RlID0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5TZXJ2ZXJFcnJvcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhbGxlcnlFcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkZhaWxlZDtcblx0XHRcdH1cblx0XHRcdGVycm9yQ29kZSA9IGdhbGxlcnlFcnJvckNvZGU7XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKGVycm9yLCBnYWxsZXJ5RXJyb3JDb2RlKTtcblx0XHR9XG5cblx0XHRmaW5hbGx5IHtcblx0XHRcdHR5cGUgR2FsbGVyeVNlcnZpY2VHZXRMYXRlc3RFdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB0aGUgcXVlcnkgdG8gdGhlIE1hcmtldHBsYWNlIGZvciBmZXRjaGluZyBsYXRlc3QgdmVyc2lvbiBvZiBhbiBleHRlbnNpb24nO1xuXHRcdFx0XHRob3N0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGhvc3Qgb2YgdGhlIGVuZCBwb2ludCcgfTtcblx0XHRcdFx0ZXh0ZW5zaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGV4dGVuc2lvbicgfTtcblx0XHRcdFx0ZHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdEdXJhdGlvbiBpbiBtcyBmb3IgdGhlIHF1ZXJ5JyB9O1xuXHRcdFx0XHRlcnJvckNvZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGVycm9yIGNvZGUgaW4gY2FzZSBvZiBlcnJvcicgfTtcblx0XHRcdFx0c3RhdHVzQ29kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgc3RhdHVzIGNvZGUgaW4gY2FzZSBvZiBlcnJvcicgfTtcblx0XHRcdFx0c2VydmVyPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzZXJ2ZXIgb2YgdGhlIGVuZCBwb2ludCcgfTtcblx0XHRcdFx0YWN0aXZpdHlJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aXZpdHkgSUQgb2YgdGhlIHJlcXVlc3QnIH07XG5cdFx0XHRcdGVuZFRvRW5kSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGVuZC10by1lbmQgSUQgb2YgdGhlIHJlcXVlc3QnIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBHYWxsZXJ5U2VydmljZUdldExhdGVzdEV2ZW50ID0ge1xuXHRcdFx0XHRleHRlbnNpb246IHN0cmluZztcblx0XHRcdFx0aG9zdDogc3RyaW5nO1xuXHRcdFx0XHRkdXJhdGlvbjogbnVtYmVyO1xuXHRcdFx0XHRlcnJvckNvZGU/OiBzdHJpbmc7XG5cdFx0XHRcdHN0YXR1c0NvZGU/OiBzdHJpbmc7XG5cdFx0XHRcdHNlcnZlcj86IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0XHRhY3Rpdml0eUlkPzogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHRcdGVuZFRvRW5kSWQ/OiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHYWxsZXJ5U2VydmljZUdldExhdGVzdEV2ZW50LCBHYWxsZXJ5U2VydmljZUdldExhdGVzdEV2ZW50Q2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTpnZXRMYXRlc3QnLCB7XG5cdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0aG9zdDogdXJpLmF1dGhvcml0eSxcblx0XHRcdFx0ZHVyYXRpb246IHN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdGVycm9yQ29kZSxcblx0XHRcdFx0c3RhdHVzQ29kZTogY29udGV4dD8ucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dD8ucmVzLnN0YXR1c0NvZGUgIT09IDIwMCA/IGAke2NvbnRleHQucmVzLnN0YXR1c0NvZGV9YCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2VydmVyOiB0aGlzLmdldEhlYWRlclZhbHVlKGNvbnRleHQ/LnJlcy5oZWFkZXJzLCBTRVJWRVJfSEVBREVSX05BTUUpLFxuXHRcdFx0XHRhY3Rpdml0eUlkOiB0aGlzLmdldEhlYWRlclZhbHVlKGNvbnRleHQ/LnJlcy5oZWFkZXJzLCBBQ1RJVklUWV9IRUFERVJfTkFNRSksXG5cdFx0XHRcdGVuZFRvRW5kSWQ6IHRoaXMuZ2V0SGVhZGVyVmFsdWUoY29udGV4dD8ucmVzLmhlYWRlcnMsIEVORF9FTkRfSURfSEVBREVSX05BTUUpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVwb3J0U3RhdGlzdGljKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZywgdHlwZTogU3RhdGlzdGljVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlI3JlcG9ydFN0YXRpc3RpYzogU2tpcHBlZCBpbiB3ZWInKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKG1hbmlmZXN0LCBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvblN0YXRpc3RpY3NVcmkpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdXJsID0gZm9ybWF0MihyZXNvdXJjZSwgeyBwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24sIHN0YXRUeXBlTmFtZTogdHlwZSB9KTtcblxuXHRcdGNvbnN0IEFjY2VwdCA9ICcqLyo7YXBpLXZlcnNpb249NC4wLXByZXZpZXcuMSc7XG5cdFx0Y29uc3QgY29tbW9uSGVhZGVycyA9IGF3YWl0IHRoaXMuY29tbW9uSGVhZGVyc1Byb21pc2U7XG5cdFx0Y29uc3QgaGVhZGVycyA9IHsgLi4uY29tbW9uSGVhZGVycywgQWNjZXB0IH07XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdFx0dXJsLFxuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRjYWxsU2l0ZTogJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLnJlcG9ydFN0YXRpc3RpYydcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qIElnbm9yZSAqLyB9XG5cdH1cblxuXHRhc3luYyBkb3dubG9hZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBsb2NhdGlvbjogVVJJLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlI2Rvd25sb2FkJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdGNvbnN0IGRhdGEgPSBnZXRHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YShleHRlbnNpb24pO1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uUGFyYW0gPSBvcGVyYXRpb24gPT09IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCA/ICdpbnN0YWxsJyA6IG9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGUgPyAndXBkYXRlJyA6ICcnO1xuXHRcdGNvbnN0IGRvd25sb2FkQXNzZXQgPSBvcGVyYXRpb25QYXJhbSA/IHtcblx0XHRcdHVyaTogYCR7ZXh0ZW5zaW9uLmFzc2V0cy5kb3dubG9hZC51cml9JHtVUkkucGFyc2UoZXh0ZW5zaW9uLmFzc2V0cy5kb3dubG9hZC51cmkpLnF1ZXJ5ID8gJyYnIDogJz8nfSR7b3BlcmF0aW9uUGFyYW19PXRydWVgLFxuXHRcdFx0ZmFsbGJhY2tVcmk6IGAke2V4dGVuc2lvbi5hc3NldHMuZG93bmxvYWQuZmFsbGJhY2tVcml9JHtVUkkucGFyc2UoZXh0ZW5zaW9uLmFzc2V0cy5kb3dubG9hZC5mYWxsYmFja1VyaSkucXVlcnkgPyAnJicgOiAnPyd9JHtvcGVyYXRpb25QYXJhbX09dHJ1ZWBcblx0XHR9IDogZXh0ZW5zaW9uLmFzc2V0cy5kb3dubG9hZDtcblxuXHRcdGNvbnN0IGFjdGl2aXR5SWQgPSBleHRlbnNpb24ucXVlcnlDb250ZXh0Py5bU0VBUkNIX0FDVElWSVRZX0hFQURFUl9OQU1FXTtcblx0XHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyB8IHVuZGVmaW5lZCA9IGFjdGl2aXR5SWQgJiYgdHlwZW9mIGFjdGl2aXR5SWQgPT09ICdzdHJpbmcnID8geyBbU0VBUkNIX0FDVElWSVRZX0hFQURFUl9OQU1FXTogYWN0aXZpdHlJZCB9IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldEFzc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBkb3dubG9hZEFzc2V0LCBBc3NldFR5cGUuVlNJWCwgZXh0ZW5zaW9uLnZlcnNpb24sICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5kb3dubG9hZCcsIGhlYWRlcnMgPyB7IGhlYWRlcnMgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUobG9jYXRpb24sIGNvbnRleHQuc3RyZWFtKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwobG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvKiBpZ25vcmUgKi9cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIGRlbGV0aW5nIHRoZSBmaWxlICR7bG9jYXRpb24udG9TdHJpbmcoKX1gLCBnZXRFcnJvck1lc3NhZ2UoZSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbkdhbGxlcnlFcnJvcihnZXRFcnJvck1lc3NhZ2UoZXJyb3IpLCBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkRvd25sb2FkRmFpbGVkV3JpdGluZyk7XG5cdFx0fVxuXG5cdFx0LyogX19HRFBSX19cblx0XHRcdFwiZ2FsbGVyeVNlcnZpY2U6ZG93bmxvYWRWU0lYXCIgOiB7XG5cdFx0XHRcdFwib3duZXJcIjogXCJzYW5keTA4MVwiLFxuXHRcdFx0XHRcImR1cmF0aW9uXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcdFwiJHtpbmNsdWRlfVwiOiBbXG5cdFx0XHRcdFx0XCIke0dhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhfVwiXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHQqL1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ2dhbGxlcnlTZXJ2aWNlOmRvd25sb2FkVlNJWCcsIHsgLi4uZGF0YSwgZHVyYXRpb246IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRUaW1lIH0pO1xuXHR9XG5cblx0YXN5bmMgZG93bmxvYWRTaWduYXR1cmVBcmNoaXZlKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWV4dGVuc2lvbi5hc3NldHMuc2lnbmF0dXJlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNpZ25hdHVyZSBhc3NldCBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UjZG93bmxvYWRTaWduYXR1cmVBcmNoaXZlJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5hc3NldHMuc2lnbmF0dXJlLCBBc3NldFR5cGUuU2lnbmF0dXJlLCBleHRlbnNpb24udmVyc2lvbiwgJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLnNpZ25hdHVyZScpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShsb2NhdGlvbiwgY29udGV4dC5zdHJlYW0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChsb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8qIGlnbm9yZSAqL1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmcgdGhlIGZpbGUgJHtsb2NhdGlvbi50b1N0cmluZygpfWAsIGdldEVycm9yTWVzc2FnZShlKSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKGdldEVycm9yTWVzc2FnZShlcnJvciksIEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuRG93bmxvYWRGYWlsZWRXcml0aW5nKTtcblx0XHR9XG5cblx0fVxuXG5cdGFzeW5jIGdldFJlYWRtZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmIChleHRlbnNpb24uYXNzZXRzLnJlYWRtZSkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5hc3NldHMucmVhZG1lLCBBc3NldFR5cGUuRGV0YWlscywgZXh0ZW5zaW9uLnZlcnNpb24sICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5yZWFkbWUnLCB7fSwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gY29udGVudCB8fCAnJztcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWFuaWZlc3QoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsPiB7XG5cdFx0aWYgKGV4dGVuc2lvbi5hc3NldHMubWFuaWZlc3QpIHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldEFzc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24uYXNzZXRzLm1hbmlmZXN0LCBBc3NldFR5cGUuTWFuaWZlc3QsIGV4dGVuc2lvbi52ZXJzaW9uLCAnZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UubWFuaWZlc3QnLCB7fSwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGV4dCA/IEpTT04ucGFyc2UodGV4dCkgOiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGdldENvcmVUcmFuc2xhdGlvbihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPElUcmFuc2xhdGlvbiB8IG51bGw+IHtcblx0XHRjb25zdCBhc3NldCA9IGV4dGVuc2lvbi5hc3NldHMuY29yZVRyYW5zbGF0aW9ucy5maWx0ZXIodCA9PiB0WzBdID09PSBsYW5ndWFnZUlkLnRvVXBwZXJDYXNlKCkpWzBdO1xuXHRcdGlmIChhc3NldCkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGFzc2V0WzFdLCBhc3NldFswXSwgZXh0ZW5zaW9uLnZlcnNpb24sICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5jb3JlVHJhbnNsYXRpb24nKTtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCBhc1RleHRPckVycm9yKGNvbnRleHQpO1xuXHRcdFx0cmV0dXJuIHRleHQgPyBKU09OLnBhcnNlKHRleHQpIDogbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBnZXRDaGFuZ2Vsb2coZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoZXh0ZW5zaW9uLmFzc2V0cy5jaGFuZ2Vsb2cpIHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldEFzc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24uYXNzZXRzLmNoYW5nZWxvZywgQXNzZXRUeXBlLkNoYW5nZWxvZywgZXh0ZW5zaW9uLnZlcnNpb24sICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5jaGFuZ2Vsb2cnLCB7fSwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gY29udGVudCB8fCAnJztcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWxsVmVyc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VmVyc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllcik7XG5cdH1cblxuXHRhc3luYyBnZXRBbGxDb21wYXRpYmxlVmVyc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIsIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VmVyc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllciwgeyB2ZXJzaW9uOiBpbmNsdWRlUHJlUmVsZWFzZSA/IFZlcnNpb25LaW5kLkxhdGVzdCA6IFZlcnNpb25LaW5kLlJlbGVhc2UsIHRhcmdldFBsYXRmb3JtIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWZXJzaW9ucyhleHRlbnNpb25JZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgb25seUNvbXBhdGlibGU/OiB7IHZlcnNpb246IFZlcnNpb25LaW5kOyB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0gfSk6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0aWYgKCFleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZXh0ZW5zaW9uIGdhbGxlcnkgc2VydmljZSBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGxldCBxdWVyeSA9IG5ldyBRdWVyeSgpXG5cdFx0XHQud2l0aEZsYWdzKEZsYWcuSW5jbHVkZVZlcnNpb25zLCBGbGFnLkluY2x1ZGVDYXRlZ29yeUFuZFRhZ3MsIEZsYWcuSW5jbHVkZUZpbGVzLCBGbGFnLkluY2x1ZGVWZXJzaW9uUHJvcGVydGllcylcblx0XHRcdC53aXRoUGFnZSgxLCAxKTtcblxuXHRcdGlmIChleHRlbnNpb25JZGVudGlmaWVyLnV1aWQpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZpbHRlcihGaWx0ZXJUeXBlLkV4dGVuc2lvbklkLCBleHRlbnNpb25JZGVudGlmaWVyLnV1aWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhGaWx0ZXIoRmlsdGVyVHlwZS5FeHRlbnNpb25OYW1lLCBleHRlbnNpb25JZGVudGlmaWVyLmlkKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGdhbGxlcnlFeHRlbnNpb25zIH0gPSBhd2FpdCB0aGlzLnF1ZXJ5UmF3R2FsbGVyeUV4dGVuc2lvbnMocXVlcnksIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFnYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBnZXRBbGxUYXJnZXRQbGF0Zm9ybXMoZ2FsbGVyeUV4dGVuc2lvbnNbMF0pO1xuXHRcdGlmIChvbmx5Q29tcGF0aWJsZSAmJiBpc05vdFdlYkV4dGVuc2lvbkluV2ViVGFyZ2V0UGxhdGZvcm0oYWxsVGFyZ2V0UGxhdGZvcm1zLCBvbmx5Q29tcGF0aWJsZS50YXJnZXRQbGF0Zm9ybSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10gPSBbXTtcblx0XHRjb25zdCBwcm9kdWN0VmVyc2lvbiA9IHsgdmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCBkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUgfTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChnYWxsZXJ5RXh0ZW5zaW9uc1swXS52ZXJzaW9ucy5tYXAoYXN5bmMgKHZlcnNpb24pID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHQoYXdhaXQgdGhpcy5pc1ZhbGlkVmVyc2lvbihcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IGV4dGVuc2lvbklkZW50aWZpZXIuaWQsXG5cdFx0XHRcdFx0XHRcdHZlcnNpb246IHZlcnNpb24udmVyc2lvbixcblx0XHRcdFx0XHRcdFx0aXNQcmVSZWxlYXNlVmVyc2lvbjogaXNQcmVSZWxlYXNlVmVyc2lvbih2ZXJzaW9uKSxcblx0XHRcdFx0XHRcdFx0dGFyZ2V0UGxhdGZvcm06IGdldFRhcmdldFBsYXRmb3JtRm9yRXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uKSxcblx0XHRcdFx0XHRcdFx0ZW5naW5lOiBnZXRFbmdpbmUodmVyc2lvbiksXG5cdFx0XHRcdFx0XHRcdG1hbmlmZXN0QXNzZXQ6IGdldFZlcnNpb25Bc3NldCh2ZXJzaW9uLCBBc3NldFR5cGUuTWFuaWZlc3QpLFxuXHRcdFx0XHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBnZXRFbmFibGVkQXBpUHJvcG9zYWxzKHZlcnNpb24pXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRjb21wYXRpYmxlOiAhIW9ubHlDb21wYXRpYmxlLFxuXHRcdFx0XHRcdFx0XHRwcm9kdWN0VmVyc2lvbixcblx0XHRcdFx0XHRcdFx0dGFyZ2V0UGxhdGZvcm06IG9ubHlDb21wYXRpYmxlPy50YXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0XHRcdFx0dmVyc2lvbjogb25seUNvbXBhdGlibGU/LnZlcnNpb24gPz8gdmVyc2lvbi52ZXJzaW9uXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Z2FsbGVyeUV4dGVuc2lvbnNbMF0ucHVibGlzaGVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0YWxsVGFyZ2V0UGxhdGZvcm1zKSlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0dmVyc2lvbnMucHVzaCh2ZXJzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogSWdub3JlIGVycm9yIGFuZCBza2lwIHZlcnNpb24gKi8gfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IHZlcnNpb24gb2Ygc29ydEV4dGVuc2lvblZlcnNpb25zKHZlcnNpb25zLCBvbmx5Q29tcGF0aWJsZT8udGFyZ2V0UGxhdGZvcm0gPz8gQ1VSUkVOVF9UQVJHRVRfUExBVEZPUk0pKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHNlZW4uZ2V0KHZlcnNpb24udmVyc2lvbik7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGluZGV4ICE9PSB1bmRlZmluZWQgPyByZXN1bHRbaW5kZXhdIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24odmVyc2lvbik7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHNlZW4uc2V0KHZlcnNpb24udmVyc2lvbiwgcmVzdWx0Lmxlbmd0aCk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdmVyc2lvbjogdmVyc2lvbi52ZXJzaW9uLCBkYXRlOiB2ZXJzaW9uLmxhc3RVcGRhdGVkLCBpc1ByZVJlbGVhc2VWZXJzaW9uOiBpc1ByZVJlbGVhc2VWZXJzaW9uKHZlcnNpb24pLCB0YXJnZXRQbGF0Zm9ybXM6IFt0YXJnZXRQbGF0Zm9ybV0gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleGlzdGluZy50YXJnZXRQbGF0Zm9ybXMucHVzaCh0YXJnZXRQbGF0Zm9ybSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXNzZXQoZXh0ZW5zaW9uOiBzdHJpbmcsIGFzc2V0OiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0LCBhc3NldFR5cGU6IHN0cmluZywgZXh0ZW5zaW9uVmVyc2lvbjogc3RyaW5nLCBjYWxsU2l0ZTogc3RyaW5nLCBvcHRpb25zOiBPbWl0PElSZXF1ZXN0T3B0aW9ucywgJ2NhbGxTaXRlJz4gPSB7fSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgY29tbW9uSGVhZGVycyA9IGF3YWl0IHRoaXMuY29tbW9uSGVhZGVyc1Byb21pc2U7XG5cdFx0Y29uc3QgYmFzZU9wdGlvbnMgPSB7IHR5cGU6ICdHRVQnIH07XG5cdFx0Y29uc3QgaGVhZGVycyA9IHsgLi4uY29tbW9uSGVhZGVycywgLi4uKG9wdGlvbnMuaGVhZGVycyB8fCB7fSkgfTtcblx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCAuLi5iYXNlT3B0aW9ucywgaGVhZGVycyB9O1xuXG5cdFx0Y29uc3QgdXJsID0gYXNzZXQudXJpO1xuXHRcdGNvbnN0IGZhbGxiYWNrVXJsID0gYXNzZXQuZmFsbGJhY2tVcmk7XG5cdFx0Y29uc3QgZmlyc3RPcHRpb25zID0geyAuLi5vcHRpb25zLCB1cmwsIHRpbWVvdXQ6IHRoaXMuZ2V0UmVxdWVzdFRpbWVvdXQoKSwgY2FsbFNpdGUgfTtcblxuXHRcdGxldCBjb250ZXh0O1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KGZpcnN0T3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDIwMCkge1xuXHRcdFx0XHRyZXR1cm4gY29udGV4dDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBhc1RleHRPckVycm9yKGNvbnRleHQpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCAyMDAsIGdvdCBiYWNrICR7Y29udGV4dC5yZXMuc3RhdHVzQ29kZX0gaW5zdGVhZC5cXG5cXG4ke21lc3NhZ2V9YCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGdldEVycm9yTWVzc2FnZShlcnIpO1xuXHRcdFx0dHlwZSBHYWxsZXJ5U2VydmljZUNETkZhbGxiYWNrQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRjb21tZW50OiAnRmFsbGJhY2sgcmVxdWVzdCBpbmZvcm1hdGlvbiB3aGVuIHRoZSBwcmltYXJ5IGFzc2V0IHJlcXVlc3QgdG8gQ0ROIGZhaWxzJztcblx0XHRcdFx0ZXh0ZW5zaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZXh0ZW5zaW9uIG5hbWUnIH07XG5cdFx0XHRcdGFzc2V0VHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ2Fzc2V0IHRoYXQgZmFpbGVkJyB9O1xuXHRcdFx0XHRtZXNzYWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZXJyb3IgbWVzc2FnZScgfTtcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3ZlcnNpb24nIH07XG5cdFx0XHRcdHJlYWRvbmx5IHNlcnZlcj86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzZXJ2ZXIgdGhhdCBoYW5kbGVkIHRoZSBxdWVyeScgfTtcblx0XHRcdFx0cmVhZG9ubHkgZW5kVG9FbmRJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdlbmQgdG8gZW5kIG9wZXJhdGlvbiBpZCcgfTtcblx0XHRcdFx0cmVhZG9ubHkgYWN0aXZpdHlJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdhY3Rpdml0eSBpZCcgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIEdhbGxlcnlTZXJ2aWNlQ0RORmFsbGJhY2tFdmVudCA9IHtcblx0XHRcdFx0ZXh0ZW5zaW9uOiBzdHJpbmc7XG5cdFx0XHRcdGFzc2V0VHlwZTogc3RyaW5nO1xuXHRcdFx0XHRtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRcdGV4dGVuc2lvblZlcnNpb246IHN0cmluZztcblx0XHRcdFx0c2VydmVyPzogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHRcdGVuZFRvRW5kSWQ/OiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdFx0YWN0aXZpdHlJZD86IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdhbGxlcnlTZXJ2aWNlQ0RORmFsbGJhY2tFdmVudCwgR2FsbGVyeVNlcnZpY2VDRE5GYWxsYmFja0NsYXNzaWZpY2F0aW9uPignZ2FsbGVyeVNlcnZpY2U6Y2RuRmFsbGJhY2snLCB7XG5cdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0YXNzZXRUeXBlLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRleHRlbnNpb25WZXJzaW9uLFxuXHRcdFx0XHRzZXJ2ZXI6IHRoaXMuZ2V0SGVhZGVyVmFsdWUoY29udGV4dD8ucmVzLmhlYWRlcnMsIFNFUlZFUl9IRUFERVJfTkFNRSksXG5cdFx0XHRcdGFjdGl2aXR5SWQ6IHRoaXMuZ2V0SGVhZGVyVmFsdWUoY29udGV4dD8ucmVzLmhlYWRlcnMsIEFDVElWSVRZX0hFQURFUl9OQU1FKSxcblx0XHRcdFx0ZW5kVG9FbmRJZDogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgRU5EX0VORF9JRF9IRUFERVJfTkFNRSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZmFsbGJhY2tPcHRpb25zID0geyAuLi5vcHRpb25zLCB1cmw6IGZhbGxiYWNrVXJsLCB0aW1lb3V0OiB0aGlzLmdldFJlcXVlc3RUaW1lb3V0KCksIGNhbGxTaXRlOiBgJHtjYWxsU2l0ZX0uZmFsbGJhY2tgIH07XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KGZhbGxiYWNrT3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpO1xuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZXh0ZW5zaW9uIGdhbGxlcnkgc2VydmljZSBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbnNDb250cm9sVXJsKSB7XG5cdFx0XHRyZXR1cm4geyBtYWxpY2lvdXM6IFtdLCBkZXByZWNhdGVkOiB7fSwgc2VhcmNoOiBbXSwgYXV0b1VwZGF0ZToge30gfTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0dXJsOiB0aGlzLmV4dGVuc2lvbnNDb250cm9sVXJsLFxuXHRcdFx0dGltZW91dDogdGhpcy5nZXRSZXF1ZXN0VGltZW91dCgpLFxuXHRcdFx0Y2FsbFNpdGU6ICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0J1xuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZ2V0IGV4dGVuc2lvbnMgcmVwb3J0LicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFzSnNvbjxJUmF3RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD4oY29udGV4dCk7XG5cdFx0Y29uc3QgbWFsaWNpb3VzOiBBcnJheTxNYWxpY2lvdXNFeHRlbnNpb25JbmZvPiA9IFtdO1xuXHRcdGNvbnN0IGRlcHJlY2F0ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PElEZXByZWNhdGlvbkluZm8+ID0ge307XG5cdFx0Y29uc3Qgc2VhcmNoOiBJU2VhcmNoUHJlZmZlcmVkUmVzdWx0c1tdID0gW107XG5cdFx0Y29uc3QgYXV0b1VwZGF0ZTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiA9IHJlc3VsdD8uYXV0b1VwZGF0ZSA/PyB7fTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHJlc3VsdC5tYWxpY2lvdXMpIHtcblx0XHRcdFx0aWYgKCFpc1N0cmluZyhpZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwdWJsaXNoZXJPckV4dGVuc2lvbiA9IEVYVEVOU0lPTl9JREVOVElGSUVSX1JFR0VYLnRlc3QoaWQpID8geyBpZCB9IDogaWQ7XG5cdFx0XHRcdG1hbGljaW91cy5wdXNoKHsgZXh0ZW5zaW9uT3JQdWJsaXNoZXI6IHB1Ymxpc2hlck9yRXh0ZW5zaW9uLCBsZWFybk1vcmVMaW5rOiByZXN1bHQubGVhcm5Nb3JlTGlua3M/LltpZF0gfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0Lm1pZ3JhdGVUb1ByZVJlbGVhc2UpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBbdW5zdXBwb3J0ZWRQcmVSZWxlYXNlRXh0ZW5zaW9uSWQsIHByZVJlbGVhc2VFeHRlbnNpb25JbmZvXSBvZiBPYmplY3QuZW50cmllcyhyZXN1bHQubWlncmF0ZVRvUHJlUmVsZWFzZSkpIHtcblx0XHRcdFx0XHRpZiAoIXByZVJlbGVhc2VFeHRlbnNpb25JbmZvLmVuZ2luZSB8fCBpc0VuZ2luZVZhbGlkKHByZVJlbGVhc2VFeHRlbnNpb25JbmZvLmVuZ2luZSwgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUpKSB7XG5cdFx0XHRcdFx0XHRkZXByZWNhdGVkW3Vuc3VwcG9ydGVkUHJlUmVsZWFzZUV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCldID0ge1xuXHRcdFx0XHRcdFx0XHRkaXNhbGxvd0luc3RhbGw6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBwcmVSZWxlYXNlRXh0ZW5zaW9uSW5mby5pZCxcblx0XHRcdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogcHJlUmVsZWFzZUV4dGVuc2lvbkluZm8uZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0YXV0b01pZ3JhdGU6IHsgc3RvcmFnZTogISFwcmVSZWxlYXNlRXh0ZW5zaW9uSW5mby5taWdyYXRlU3RvcmFnZSB9LFxuXHRcdFx0XHRcdFx0XHRcdHByZVJlbGVhc2U6IHRydWVcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQuZGVwcmVjYXRlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtkZXByZWNhdGVkRXh0ZW5zaW9uSWQsIGRlcHJlY2F0aW9uSW5mb10gb2YgT2JqZWN0LmVudHJpZXMocmVzdWx0LmRlcHJlY2F0ZWQpKSB7XG5cdFx0XHRcdFx0aWYgKGRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0XHRcdFx0ZGVwcmVjYXRlZFtkZXByZWNhdGVkRXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKV0gPSBpc0Jvb2xlYW4oZGVwcmVjYXRpb25JbmZvKSA/IHt9IDogZGVwcmVjYXRpb25JbmZvO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5zZWFyY2gpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIHJlc3VsdC5zZWFyY2gpIHtcblx0XHRcdFx0XHRzZWFyY2gucHVzaChzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGRlcHJlY2F0ZWRbdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCldID0ge1xuXHRcdFx0ZGlzYWxsb3dJbnN0YWxsOiB0cnVlLFxuXHRcdFx0ZXh0ZW5zaW9uOiB7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQuY2hhdEV4dGVuc2lvbklkLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90IENoYXQnLFxuXHRcdFx0XHRhdXRvTWlncmF0ZTogeyBzdG9yYWdlOiBmYWxzZSwgZG9ub3REaXNhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdHByZVJlbGVhc2U6IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZSdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHsgbWFsaWNpb3VzLCBkZXByZWNhdGVkLCBzZWFyY2gsIGF1dG9VcGRhdGUgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVxdWVzdFRpbWVvdXQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBjb25maWd1cmVkVGltZW91dCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihFeHRlbnNpb25SZXF1ZXN0c1RpbWVvdXRDb25maWdLZXkpO1xuXHRcdHJldHVybiBpc051bWJlcihjb25maWd1cmVkVGltZW91dCkgJiYgY29uZmlndXJlZFRpbWVvdXQgPj0gMCA/IGNvbmZpZ3VyZWRUaW1lb3V0IDogNjBfMDAwO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihzdG9yYWdlU2VydmljZSwgcmVxdWVzdFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgZmlsZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2VXaXRoTm9TdG9yYWdlU2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIHJlcXVlc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlm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
