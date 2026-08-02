import { Platform } from "../../../base/common/platform.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { localize, localize2 } from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import { TargetPlatform } from "../../extensions/common/extensions.js";
import { FileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { Registry } from "../../registry/common/platform.js";
const EXTENSION_IDENTIFIER_PATTERN = "^([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$";
const EXTENSION_IDENTIFIER_REGEX = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
const WEB_EXTENSION_TAG = "__web_extension";
const LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG = "language-models";
const EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT = "skipWalkthrough";
const EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT = "skipPublisherTrust";
const EXTENSION_INSTALL_SOURCE_CONTEXT = "extensionInstallSource";
const EXTENSION_INSTALL_DEP_PACK_CONTEXT = "dependecyOrPackExtensionInstall";
const EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT = "clientTargetPlatform";
var ExtensionInstallSource = /* @__PURE__ */ ((ExtensionInstallSource2) => {
  ExtensionInstallSource2["COMMAND"] = "command";
  ExtensionInstallSource2["SETTINGS_SYNC"] = "settingsSync";
  return ExtensionInstallSource2;
})(ExtensionInstallSource || {});
function TargetPlatformToString(targetPlatform) {
  switch (targetPlatform) {
    case TargetPlatform.WIN32_X64:
      return "Windows 64 bit";
    case TargetPlatform.WIN32_ARM64:
      return "Windows ARM";
    case TargetPlatform.LINUX_X64:
      return "Linux 64 bit";
    case TargetPlatform.LINUX_ARM64:
      return "Linux ARM 64";
    case TargetPlatform.LINUX_ARMHF:
      return "Linux ARM";
    case TargetPlatform.ALPINE_X64:
      return "Alpine Linux 64 bit";
    case TargetPlatform.ALPINE_ARM64:
      return "Alpine ARM 64";
    case TargetPlatform.DARWIN_X64:
      return "Mac";
    case TargetPlatform.DARWIN_ARM64:
      return "Mac Silicon";
    case TargetPlatform.WEB:
      return "Web";
    case TargetPlatform.UNIVERSAL:
      return TargetPlatform.UNIVERSAL;
    case TargetPlatform.UNKNOWN:
      return TargetPlatform.UNKNOWN;
    case TargetPlatform.UNDEFINED:
      return TargetPlatform.UNDEFINED;
  }
}
function toTargetPlatform(targetPlatform) {
  switch (targetPlatform) {
    case TargetPlatform.WIN32_X64:
      return TargetPlatform.WIN32_X64;
    case TargetPlatform.WIN32_ARM64:
      return TargetPlatform.WIN32_ARM64;
    case TargetPlatform.LINUX_X64:
      return TargetPlatform.LINUX_X64;
    case TargetPlatform.LINUX_ARM64:
      return TargetPlatform.LINUX_ARM64;
    case TargetPlatform.LINUX_ARMHF:
      return TargetPlatform.LINUX_ARMHF;
    case TargetPlatform.ALPINE_X64:
      return TargetPlatform.ALPINE_X64;
    case TargetPlatform.ALPINE_ARM64:
      return TargetPlatform.ALPINE_ARM64;
    case TargetPlatform.DARWIN_X64:
      return TargetPlatform.DARWIN_X64;
    case TargetPlatform.DARWIN_ARM64:
      return TargetPlatform.DARWIN_ARM64;
    case TargetPlatform.WEB:
      return TargetPlatform.WEB;
    case TargetPlatform.UNIVERSAL:
      return TargetPlatform.UNIVERSAL;
    default:
      return TargetPlatform.UNKNOWN;
  }
}
function getTargetPlatform(platform, arch) {
  switch (platform) {
    case Platform.Windows:
      if (arch === "x64") {
        return TargetPlatform.WIN32_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.WIN32_ARM64;
      }
      return TargetPlatform.UNKNOWN;
    case Platform.Linux:
      if (arch === "x64") {
        return TargetPlatform.LINUX_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.LINUX_ARM64;
      }
      if (arch === "arm") {
        return TargetPlatform.LINUX_ARMHF;
      }
      return TargetPlatform.UNKNOWN;
    case "alpine":
      if (arch === "x64") {
        return TargetPlatform.ALPINE_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.ALPINE_ARM64;
      }
      return TargetPlatform.UNKNOWN;
    case Platform.Mac:
      if (arch === "x64") {
        return TargetPlatform.DARWIN_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.DARWIN_ARM64;
      }
      return TargetPlatform.UNKNOWN;
    case Platform.Web:
      return TargetPlatform.WEB;
  }
}
function isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform) {
  return productTargetPlatform === TargetPlatform.WEB && !allTargetPlatforms.includes(TargetPlatform.WEB);
}
function isTargetPlatformCompatible(extensionTargetPlatform, allTargetPlatforms, productTargetPlatform) {
  if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform)) {
    return false;
  }
  if (extensionTargetPlatform === TargetPlatform.UNDEFINED) {
    return true;
  }
  if (extensionTargetPlatform === TargetPlatform.UNIVERSAL) {
    return true;
  }
  if (extensionTargetPlatform === TargetPlatform.UNKNOWN) {
    return false;
  }
  if (extensionTargetPlatform === productTargetPlatform) {
    return true;
  }
  return false;
}
function isIExtensionIdentifier(obj) {
  const thing = obj;
  return !!thing && typeof thing === "object" && typeof thing.id === "string" && (!thing.uuid || typeof thing.uuid === "string");
}
var SortBy = /* @__PURE__ */ ((SortBy2) => {
  SortBy2["NoneOrRelevance"] = "NoneOrRelevance";
  SortBy2["LastUpdatedDate"] = "LastUpdatedDate";
  SortBy2["Title"] = "Title";
  SortBy2["PublisherName"] = "PublisherName";
  SortBy2["InstallCount"] = "InstallCount";
  SortBy2["PublishedDate"] = "PublishedDate";
  SortBy2["AverageRating"] = "AverageRating";
  SortBy2["WeightedRating"] = "WeightedRating";
  return SortBy2;
})(SortBy || {});
var SortOrder = /* @__PURE__ */ ((SortOrder2) => {
  SortOrder2[SortOrder2["Default"] = 0] = "Default";
  SortOrder2[SortOrder2["Ascending"] = 1] = "Ascending";
  SortOrder2[SortOrder2["Descending"] = 2] = "Descending";
  return SortOrder2;
})(SortOrder || {});
var FilterType = /* @__PURE__ */ ((FilterType2) => {
  FilterType2["Category"] = "Category";
  FilterType2["ExtensionId"] = "ExtensionId";
  FilterType2["ExtensionName"] = "ExtensionName";
  FilterType2["ExcludeWithFlags"] = "ExcludeWithFlags";
  FilterType2["Featured"] = "Featured";
  FilterType2["SearchText"] = "SearchText";
  FilterType2["Tag"] = "Tag";
  FilterType2["Target"] = "Target";
  return FilterType2;
})(FilterType || {});
var StatisticType = /* @__PURE__ */ ((StatisticType2) => {
  StatisticType2["Install"] = "install";
  StatisticType2["Uninstall"] = "uninstall";
  return StatisticType2;
})(StatisticType || {});
var InstallOperation = /* @__PURE__ */ ((InstallOperation2) => {
  InstallOperation2[InstallOperation2["None"] = 1] = "None";
  InstallOperation2[InstallOperation2["Install"] = 2] = "Install";
  InstallOperation2[InstallOperation2["Update"] = 3] = "Update";
  InstallOperation2[InstallOperation2["Migrate"] = 4] = "Migrate";
  return InstallOperation2;
})(InstallOperation || {});
const IExtensionGalleryService = createDecorator("extensionGalleryService");
var ExtensionGalleryErrorCode = /* @__PURE__ */ ((ExtensionGalleryErrorCode2) => {
  ExtensionGalleryErrorCode2["Timeout"] = "Timeout";
  ExtensionGalleryErrorCode2["Cancelled"] = "Cancelled";
  ExtensionGalleryErrorCode2["ClientError"] = "ClientError";
  ExtensionGalleryErrorCode2["ServerError"] = "ServerError";
  ExtensionGalleryErrorCode2["Failed"] = "Failed";
  ExtensionGalleryErrorCode2["DownloadFailedWriting"] = "DownloadFailedWriting";
  ExtensionGalleryErrorCode2["Offline"] = "Offline";
  return ExtensionGalleryErrorCode2;
})(ExtensionGalleryErrorCode || {});
class ExtensionGalleryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = code;
  }
}
var ExtensionManagementErrorCode = /* @__PURE__ */ ((ExtensionManagementErrorCode2) => {
  ExtensionManagementErrorCode2["NotFound"] = "NotFound";
  ExtensionManagementErrorCode2["Unsupported"] = "Unsupported";
  ExtensionManagementErrorCode2["Deprecated"] = "Deprecated";
  ExtensionManagementErrorCode2["Malicious"] = "Malicious";
  ExtensionManagementErrorCode2["Incompatible"] = "Incompatible";
  ExtensionManagementErrorCode2["IncompatibleApi"] = "IncompatibleApi";
  ExtensionManagementErrorCode2["IncompatibleTargetPlatform"] = "IncompatibleTargetPlatform";
  ExtensionManagementErrorCode2["ReleaseVersionNotFound"] = "ReleaseVersionNotFound";
  ExtensionManagementErrorCode2["Invalid"] = "Invalid";
  ExtensionManagementErrorCode2["Download"] = "Download";
  ExtensionManagementErrorCode2["DownloadSignature"] = "DownloadSignature";
  ExtensionManagementErrorCode2["DownloadFailedWriting"] = "DownloadFailedWriting" /* DownloadFailedWriting */;
  ExtensionManagementErrorCode2["UpdateMetadata"] = "UpdateMetadata";
  ExtensionManagementErrorCode2["Extract"] = "Extract";
  ExtensionManagementErrorCode2["Scanning"] = "Scanning";
  ExtensionManagementErrorCode2["ScanningExtension"] = "ScanningExtension";
  ExtensionManagementErrorCode2["ReadRemoved"] = "ReadRemoved";
  ExtensionManagementErrorCode2["UnsetRemoved"] = "UnsetRemoved";
  ExtensionManagementErrorCode2["Delete"] = "Delete";
  ExtensionManagementErrorCode2["Rename"] = "Rename";
  ExtensionManagementErrorCode2["IntializeDefaultProfile"] = "IntializeDefaultProfile";
  ExtensionManagementErrorCode2["AddToProfile"] = "AddToProfile";
  ExtensionManagementErrorCode2["InstalledExtensionNotFound"] = "InstalledExtensionNotFound";
  ExtensionManagementErrorCode2["PostInstall"] = "PostInstall";
  ExtensionManagementErrorCode2["CorruptZip"] = "CorruptZip";
  ExtensionManagementErrorCode2["IncompleteZip"] = "IncompleteZip";
  ExtensionManagementErrorCode2["PackageNotSigned"] = "PackageNotSigned";
  ExtensionManagementErrorCode2["SignatureVerificationInternal"] = "SignatureVerificationInternal";
  ExtensionManagementErrorCode2["SignatureVerificationFailed"] = "SignatureVerificationFailed";
  ExtensionManagementErrorCode2["NotAllowed"] = "NotAllowed";
  ExtensionManagementErrorCode2["Gallery"] = "Gallery";
  ExtensionManagementErrorCode2["Cancelled"] = "Cancelled";
  ExtensionManagementErrorCode2["Unknown"] = "Unknown";
  ExtensionManagementErrorCode2["Internal"] = "Internal";
  return ExtensionManagementErrorCode2;
})(ExtensionManagementErrorCode || {});
var ExtensionSignatureVerificationCode = /* @__PURE__ */ ((ExtensionSignatureVerificationCode2) => {
  ExtensionSignatureVerificationCode2["NotSigned"] = "NotSigned";
  ExtensionSignatureVerificationCode2["Success"] = "Success";
  ExtensionSignatureVerificationCode2["RequiredArgumentMissing"] = "RequiredArgumentMissing";
  ExtensionSignatureVerificationCode2["InvalidArgument"] = "InvalidArgument";
  ExtensionSignatureVerificationCode2["PackageIsUnreadable"] = "PackageIsUnreadable";
  ExtensionSignatureVerificationCode2["UnhandledException"] = "UnhandledException";
  ExtensionSignatureVerificationCode2["SignatureManifestIsMissing"] = "SignatureManifestIsMissing";
  ExtensionSignatureVerificationCode2["SignatureManifestIsUnreadable"] = "SignatureManifestIsUnreadable";
  ExtensionSignatureVerificationCode2["SignatureIsMissing"] = "SignatureIsMissing";
  ExtensionSignatureVerificationCode2["SignatureIsUnreadable"] = "SignatureIsUnreadable";
  ExtensionSignatureVerificationCode2["CertificateIsUnreadable"] = "CertificateIsUnreadable";
  ExtensionSignatureVerificationCode2["SignatureArchiveIsUnreadable"] = "SignatureArchiveIsUnreadable";
  ExtensionSignatureVerificationCode2["FileAlreadyExists"] = "FileAlreadyExists";
  ExtensionSignatureVerificationCode2["SignatureArchiveIsInvalidZip"] = "SignatureArchiveIsInvalidZip";
  ExtensionSignatureVerificationCode2["SignatureArchiveHasSameSignatureFile"] = "SignatureArchiveHasSameSignatureFile";
  ExtensionSignatureVerificationCode2["PackageIntegrityCheckFailed"] = "PackageIntegrityCheckFailed";
  ExtensionSignatureVerificationCode2["SignatureIsInvalid"] = "SignatureIsInvalid";
  ExtensionSignatureVerificationCode2["SignatureManifestIsInvalid"] = "SignatureManifestIsInvalid";
  ExtensionSignatureVerificationCode2["SignatureIntegrityCheckFailed"] = "SignatureIntegrityCheckFailed";
  ExtensionSignatureVerificationCode2["EntryIsMissing"] = "EntryIsMissing";
  ExtensionSignatureVerificationCode2["EntryIsTampered"] = "EntryIsTampered";
  ExtensionSignatureVerificationCode2["Untrusted"] = "Untrusted";
  ExtensionSignatureVerificationCode2["CertificateRevoked"] = "CertificateRevoked";
  ExtensionSignatureVerificationCode2["SignatureIsNotValid"] = "SignatureIsNotValid";
  ExtensionSignatureVerificationCode2["UnknownError"] = "UnknownError";
  ExtensionSignatureVerificationCode2["PackageIsInvalidZip"] = "PackageIsInvalidZip";
  ExtensionSignatureVerificationCode2["SignatureArchiveHasTooManyEntries"] = "SignatureArchiveHasTooManyEntries";
  return ExtensionSignatureVerificationCode2;
})(ExtensionSignatureVerificationCode || {});
class ExtensionManagementError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = code;
  }
}
const IExtensionManagementService = createDecorator("extensionManagementService");
const DISABLED_EXTENSIONS_STORAGE_PATH = "extensionsIdentifiers/disabled";
const ENABLED_EXTENSIONS_STORAGE_PATH = "extensionsIdentifiers/enabled";
const IGlobalExtensionEnablementService = createDecorator("IGlobalExtensionEnablementService");
const IExtensionTipsService = createDecorator("IExtensionTipsService");
const IAllowedExtensionsService = createDecorator("IAllowedExtensionsService");
async function computeSize(location, fileService) {
  let stat;
  try {
    stat = await fileService.resolve(location);
  } catch (e) {
    if (e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
      return 0;
    }
    throw e;
  }
  if (stat.children) {
    const sizes = await Promise.all(stat.children.map((c) => computeSize(c.resource, fileService)));
    return sizes.reduce((r, s) => r + s, 0);
  }
  return stat.size ?? 0;
}
const ExtensionsLocalizedLabel = localize2("extensions", "Extensions");
const PreferencesLocalizedLabel = localize2("preferences", "Preferences");
const AllowedExtensionsConfigKey = "extensions.allowed";
const VerifyExtensionSignatureConfigKey = "extensions.verifySignature";
const ExtensionRequestsTimeoutConfigKey = "extensions.requestTimeout";
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "extensions",
  order: 30,
  title: localize("extensionsConfigurationTitle", "Extensions"),
  type: "object",
  properties: {
    [AllowedExtensionsConfigKey]: {
      // Note: Type is set only to object because to support policies generation during build time, where single type is expected.
      type: "object",
      markdownDescription: localize("extensions.allowed", "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. For more information on how to configure this setting, please visit the [Configure Allowed Extensions](https://aka.ms/vscode/enterprise/extensions/allowed) section."),
      default: "*",
      defaultSnippets: [{
        body: {},
        description: localize("extensions.allowed.none", "No extensions are allowed.")
      }, {
        body: {
          "*": true
        },
        description: localize("extensions.allowed.all", "All extensions are allowed.")
      }],
      scope: ConfigurationScope.APPLICATION,
      policy: {
        name: "AllowedExtensions",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.96",
        localization: {
          description: {
            key: "extensions.allowed.policy",
            value: localize("extensions.allowed.policy", "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. More information: https://aka.ms/vscode/enterprise/extensions/allowed")
          }
        }
      },
      additionalProperties: false,
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          anyOf: [
            {
              type: ["boolean", "string"],
              enum: [true, false, "stable"],
              description: localize("extensions.allow.description", "Allow or disallow the extension."),
              enumDescriptions: [
                localize("extensions.allowed.enable.desc", "Extension is allowed."),
                localize("extensions.allowed.disable.desc", "Extension is not allowed."),
                localize("extensions.allowed.disable.stable.desc", "Allow only stable versions of the extension.")
              ]
            },
            {
              type: "array",
              items: {
                type: "string"
              },
              description: localize("extensions.allow.version.description", "Allow or disallow specific versions of the extension. To specifcy a platform specific version, use the format `platform@1.2.3`, e.g. `win32-x64@1.2.3`. Supported platforms are `win32-x64`, `win32-arm64`, `linux-x64`, `linux-arm64`, `linux-armhf`, `alpine-x64`, `alpine-arm64`, `darwin-x64`, `darwin-arm64`")
            }
          ]
        },
        "([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: ["boolean", "string"],
          enum: [true, false, "stable"],
          description: localize("extension.publisher.allow.description", "Allow or disallow all extensions from the publisher."),
          enumDescriptions: [
            localize("extensions.publisher.allowed.enable.desc", "All extensions from the publisher are allowed."),
            localize("extensions.publisher.allowed.disable.desc", "All extensions from the publisher are not allowed."),
            localize("extensions.publisher.allowed.disable.stable.desc", "Allow only stable versions of the extensions from the publisher.")
          ]
        },
        "\\*": {
          type: "boolean",
          enum: [true, false],
          description: localize("extensions.allow.all.description", "Allow or disallow all extensions."),
          enumDescriptions: [
            localize("extensions.allow.all.enable", "Allow all extensions."),
            localize("extensions.allow.all.disable", "Disallow all extensions.")
          ]
        }
      }
    }
  }
});
function shouldRequireRepositorySignatureFor(isPrivate, galleryManifest) {
  if (isPrivate) {
    return galleryManifest?.capabilities.signing?.allPrivateRepositorySigned === true;
  }
  return galleryManifest?.capabilities.signing?.allPublicRepositorySigned === true;
}
export {
  AllowedExtensionsConfigKey,
  DISABLED_EXTENSIONS_STORAGE_PATH,
  ENABLED_EXTENSIONS_STORAGE_PATH,
  EXTENSION_IDENTIFIER_PATTERN,
  EXTENSION_IDENTIFIER_REGEX,
  EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT,
  EXTENSION_INSTALL_DEP_PACK_CONTEXT,
  EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT,
  EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT,
  EXTENSION_INSTALL_SOURCE_CONTEXT,
  ExtensionGalleryError,
  ExtensionGalleryErrorCode,
  ExtensionInstallSource,
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  ExtensionRequestsTimeoutConfigKey,
  ExtensionSignatureVerificationCode,
  ExtensionsLocalizedLabel,
  FilterType,
  IAllowedExtensionsService,
  IExtensionGalleryService,
  IExtensionManagementService,
  IExtensionTipsService,
  IGlobalExtensionEnablementService,
  InstallOperation,
  LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG,
  PreferencesLocalizedLabel,
  SortBy,
  SortOrder,
  StatisticType,
  TargetPlatformToString,
  VerifyExtensionSignatureConfigKey,
  WEB_EXTENSION_TAG,
  computeSize,
  getTargetPlatform,
  isIExtensionIdentifier,
  isNotWebExtensionInWebTargetPlatform,
  isTargetPlatformCompatible,
  shouldRequireRepositorySignatureFor,
  toTargetPlatform
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVBhZ2VyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGFnaW5nLmpzJztcbmltcG9ydCB7IFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb24sIElFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IH0gZnJvbSAnLi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuXG5leHBvcnQgY29uc3QgRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTiA9ICdeKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKilcXFxcLihbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc7XG5leHBvcnQgY29uc3QgRVhURU5TSU9OX0lERU5USUZJRVJfUkVHRVggPSBuZXcgUmVnRXhwKEVYVEVOU0lPTl9JREVOVElGSUVSX1BBVFRFUk4pO1xuZXhwb3J0IGNvbnN0IFdFQl9FWFRFTlNJT05fVEFHID0gJ19fd2ViX2V4dGVuc2lvbic7XG5leHBvcnQgY29uc3QgTEFOR1VBR0VfTU9ERUxfQ0hBVF9QUk9WSURFUl9FWFRFTlNJT05fVEFHID0gJ2xhbmd1YWdlLW1vZGVscyc7XG5leHBvcnQgY29uc3QgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhUID0gJ3NraXBXYWxrdGhyb3VnaCc7XG5leHBvcnQgY29uc3QgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVCA9ICdza2lwUHVibGlzaGVyVHJ1c3QnO1xuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhUID0gJ2V4dGVuc2lvbkluc3RhbGxTb3VyY2UnO1xuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JTlNUQUxMX0RFUF9QQUNLX0NPTlRFWFQgPSAnZGVwZW5kZWN5T3JQYWNrRXh0ZW5zaW9uSW5zdGFsbCc7XG5leHBvcnQgY29uc3QgRVhURU5TSU9OX0lOU1RBTExfQ0xJRU5UX1RBUkdFVF9QTEFURk9STV9DT05URVhUID0gJ2NsaWVudFRhcmdldFBsYXRmb3JtJztcblxuZXhwb3J0IGNvbnN0IGVudW0gRXh0ZW5zaW9uSW5zdGFsbFNvdXJjZSB7XG5cdENPTU1BTkQgPSAnY29tbWFuZCcsXG5cdFNFVFRJTkdTX1NZTkMgPSAnc2V0dGluZ3NTeW5jJyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvZHVjdFZlcnNpb24ge1xuXHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRhdGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBUYXJnZXRQbGF0Zm9ybVRvU3RyaW5nKHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSkge1xuXHRzd2l0Y2ggKHRhcmdldFBsYXRmb3JtKSB7XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQ6IHJldHVybiAnV2luZG93cyA2NCBiaXQnO1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfQVJNNjQ6IHJldHVybiAnV2luZG93cyBBUk0nO1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9YNjQ6IHJldHVybiAnTGludXggNjQgYml0Jztcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkxJTlVYX0FSTTY0OiByZXR1cm4gJ0xpbnV4IEFSTSA2NCc7XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk1IRjogcmV0dXJuICdMaW51eCBBUk0nO1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5BTFBJTkVfWDY0OiByZXR1cm4gJ0FscGluZSBMaW51eCA2NCBiaXQnO1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX0FSTTY0OiByZXR1cm4gJ0FscGluZSBBUk0gNjQnO1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0OiByZXR1cm4gJ01hYyc7XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fQVJNNjQ6IHJldHVybiAnTWFjIFNpbGljb24nO1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5XRUI6IHJldHVybiAnV2ViJztcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMOiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMO1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTjogcmV0dXJuIFRhcmdldFBsYXRmb3JtLlVOS05PV047XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQ6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvVGFyZ2V0UGxhdGZvcm0odGFyZ2V0UGxhdGZvcm06IHN0cmluZyk6IFRhcmdldFBsYXRmb3JtIHtcblx0c3dpdGNoICh0YXJnZXRQbGF0Zm9ybSkge1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0O1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfQVJNNjQ6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9BUk02NDtcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0O1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNNjQ6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk02NDtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkxJTlVYX0FSTUhGOiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNSEY7XG5cblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkFMUElORV9YNjQ6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5BTFBJTkVfWDY0O1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX0FSTTY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX0FSTTY0O1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NDtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkRBUldJTl9BUk02NDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLkRBUldJTl9BUk02NDtcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uV0VCOiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uV0VCO1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5VTklWRVJTQUw6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTklWRVJTQUw7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLlVOS05PV047XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRhcmdldFBsYXRmb3JtKHBsYXRmb3JtOiBQbGF0Zm9ybSB8ICdhbHBpbmUnLCBhcmNoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBUYXJnZXRQbGF0Zm9ybSB7XG5cdHN3aXRjaCAocGxhdGZvcm0pIHtcblx0XHRjYXNlIFBsYXRmb3JtLldpbmRvd3M6XG5cdFx0XHRpZiAoYXJjaCA9PT0gJ3g2NCcpIHtcblx0XHRcdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NDtcblx0XHRcdH1cblx0XHRcdGlmIChhcmNoID09PSAnYXJtNjQnKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9BUk02NDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOO1xuXG5cdFx0Y2FzZSBQbGF0Zm9ybS5MaW51eDpcblx0XHRcdGlmIChhcmNoID09PSAneDY0Jykge1xuXHRcdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFyY2ggPT09ICdhcm02NCcpIHtcblx0XHRcdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLkxJTlVYX0FSTTY0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFyY2ggPT09ICdhcm0nKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk1IRjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOO1xuXG5cdFx0Y2FzZSAnYWxwaW5lJzpcblx0XHRcdGlmIChhcmNoID09PSAneDY0Jykge1xuXHRcdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX1g2NDtcblx0XHRcdH1cblx0XHRcdGlmIChhcmNoID09PSAnYXJtNjQnKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5BTFBJTkVfQVJNNjQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTjtcblxuXHRcdGNhc2UgUGxhdGZvcm0uTWFjOlxuXHRcdFx0aWYgKGFyY2ggPT09ICd4NjQnKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFyY2ggPT09ICdhcm02NCcpIHtcblx0XHRcdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLkRBUldJTl9BUk02NDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOO1xuXG5cdFx0Y2FzZSBQbGF0Zm9ybS5XZWI6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5XRUI7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTm90V2ViRXh0ZW5zaW9uSW5XZWJUYXJnZXRQbGF0Zm9ybShhbGxUYXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW10sIHByb2R1Y3RUYXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0pOiBib29sZWFuIHtcblx0Ly8gTm90IGEgd2ViIGV4dGVuc2lvbiBpbiB3ZWIgdGFyZ2V0IHBsYXRmb3JtXG5cdHJldHVybiBwcm9kdWN0VGFyZ2V0UGxhdGZvcm0gPT09IFRhcmdldFBsYXRmb3JtLldFQiAmJiAhYWxsVGFyZ2V0UGxhdGZvcm1zLmluY2x1ZGVzKFRhcmdldFBsYXRmb3JtLldFQik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZShleHRlbnNpb25UYXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0sIGFsbFRhcmdldFBsYXRmb3JtczogVGFyZ2V0UGxhdGZvcm1bXSwgcHJvZHVjdFRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSk6IGJvb2xlYW4ge1xuXHQvLyBOb3QgY29tcGF0aWJsZSB3aGVuIGV4dGVuc2lvbiBpcyBub3QgYSB3ZWIgZXh0ZW5zaW9uIGluIHdlYiB0YXJnZXQgcGxhdGZvcm1cblx0aWYgKGlzTm90V2ViRXh0ZW5zaW9uSW5XZWJUYXJnZXRQbGF0Zm9ybShhbGxUYXJnZXRQbGF0Zm9ybXMsIHByb2R1Y3RUYXJnZXRQbGF0Zm9ybSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBDb21wYXRpYmxlIHdoZW4gZXh0ZW5zaW9uIHRhcmdldCBwbGF0Zm9ybSBpcyBub3QgZGVmaW5lZFxuXHRpZiAoZXh0ZW5zaW9uVGFyZ2V0UGxhdGZvcm0gPT09IFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gQ29tcGF0aWJsZSB3aGVuIGV4dGVuc2lvbiB0YXJnZXQgcGxhdGZvcm0gaXMgdW5pdmVyc2FsXG5cdGlmIChleHRlbnNpb25UYXJnZXRQbGF0Zm9ybSA9PT0gVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBOb3QgY29tcGF0aWJsZSB3aGVuIGV4dGVuc2lvbiB0YXJnZXQgcGxhdGZvcm0gaXMgdW5rbm93blxuXHRpZiAoZXh0ZW5zaW9uVGFyZ2V0UGxhdGZvcm0gPT09IFRhcmdldFBsYXRmb3JtLlVOS05PV04pIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBDb21wYXRpYmxlIHdoZW4gZXh0ZW5zaW9uIGFuZCBwcm9kdWN0IHRhcmdldCBwbGF0Zm9ybXMgbWF0Y2hlc1xuXHRpZiAoZXh0ZW5zaW9uVGFyZ2V0UGxhdGZvcm0gPT09IHByb2R1Y3RUYXJnZXRQbGF0Zm9ybSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHYWxsZXJ5RXh0ZW5zaW9uUHJvcGVydGllcyB7XG5cdGRlcGVuZGVuY2llcz86IHN0cmluZ1tdO1xuXHRleHRlbnNpb25QYWNrPzogc3RyaW5nW107XG5cdGVuZ2luZT86IHN0cmluZztcblx0ZW5hYmxlZEFwaVByb3Bvc2Fscz86IHN0cmluZ1tdO1xuXHRsb2NhbGl6ZWRMYW5ndWFnZXM/OiBzdHJpbmdbXTtcblx0dGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtO1xuXHRpc1ByZVJlbGVhc2VWZXJzaW9uOiBib29sZWFuO1xuXHRleGVjdXRlc0NvZGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQge1xuXHR1cmk6IHN0cmluZztcblx0ZmFsbGJhY2tVcmk6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0cyB7XG5cdG1hbmlmZXN0OiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbDtcblx0cmVhZG1lOiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbDtcblx0Y2hhbmdlbG9nOiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbDtcblx0bGljZW5zZTogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7XG5cdHJlcG9zaXRvcnk6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQgfCBudWxsO1xuXHRkb3dubG9hZDogSUdhbGxlcnlFeHRlbnNpb25Bc3NldDtcblx0aWNvbjogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7XG5cdHNpZ25hdHVyZTogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7XG5cdGNvcmVUcmFuc2xhdGlvbnM6IFtzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXRdW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0lFeHRlbnNpb25JZGVudGlmaWVyKG9iajogdW5rbm93bik6IG9iaiBpcyBJRXh0ZW5zaW9uSWRlbnRpZmllciB7XG5cdGNvbnN0IHRoaW5nID0gb2JqIGFzIElFeHRlbnNpb25JZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXHRyZXR1cm4gISF0aGluZ1xuXHRcdCYmIHR5cGVvZiB0aGluZyA9PT0gJ29iamVjdCdcblx0XHQmJiB0eXBlb2YgdGhpbmcuaWQgPT09ICdzdHJpbmcnXG5cdFx0JiYgKCF0aGluZy51dWlkIHx8IHR5cGVvZiB0aGluZy51dWlkID09PSAnc3RyaW5nJyk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbklkZW50aWZpZXIge1xuXHRpZDogc3RyaW5nO1xuXHR1dWlkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHYWxsZXJ5RXh0ZW5zaW9uSWRlbnRpZmllciBleHRlbmRzIElFeHRlbnNpb25JZGVudGlmaWVyIHtcblx0dXVpZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiB7XG5cdHZlcnNpb246IHN0cmluZztcblx0ZGF0ZTogc3RyaW5nO1xuXHRpc1ByZVJlbGVhc2VWZXJzaW9uOiBib29sZWFuO1xuXHR0YXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdhbGxlcnlFeHRlbnNpb24ge1xuXHR0eXBlOiAnZ2FsbGVyeSc7XG5cdG5hbWU6IHN0cmluZztcblx0aWRlbnRpZmllcjogSUdhbGxlcnlFeHRlbnNpb25JZGVudGlmaWVyO1xuXHR2ZXJzaW9uOiBzdHJpbmc7XG5cdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHB1Ymxpc2hlcklkOiBzdHJpbmc7XG5cdHB1Ymxpc2hlcjogc3RyaW5nO1xuXHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRwdWJsaXNoZXJEb21haW4/OiB7IGxpbms6IHN0cmluZzsgdmVyaWZpZWQ6IGJvb2xlYW4gfTtcblx0cHVibGlzaGVyTGluaz86IHN0cmluZztcblx0cHVibGlzaGVyU3BvbnNvckxpbms/OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGluc3RhbGxDb3VudDogbnVtYmVyO1xuXHRyYXRpbmc6IG51bWJlcjtcblx0cmF0aW5nQ291bnQ6IG51bWJlcjtcblx0Y2F0ZWdvcmllczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHRhZ3M6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWxlYXNlRGF0ZTogbnVtYmVyO1xuXHRsYXN0VXBkYXRlZDogbnVtYmVyO1xuXHRwcmV2aWV3OiBib29sZWFuO1xuXHRwcml2YXRlOiBib29sZWFuO1xuXHRoYXNQcmVSZWxlYXNlVmVyc2lvbjogYm9vbGVhbjtcblx0aGFzUmVsZWFzZVZlcnNpb246IGJvb2xlYW47XG5cdGlzU2lnbmVkOiBib29sZWFuO1xuXHRhbGxUYXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW107XG5cdGFzc2V0czogSUdhbGxlcnlFeHRlbnNpb25Bc3NldHM7XG5cdHByb3BlcnRpZXM6IElHYWxsZXJ5RXh0ZW5zaW9uUHJvcGVydGllcztcblx0ZGV0YWlsc0xpbms/OiBzdHJpbmc7XG5cdHJhdGluZ0xpbms/OiBzdHJpbmc7XG5cdHN1cHBvcnRMaW5rPzogc3RyaW5nO1xuXHR0ZWxlbWV0cnlEYXRhPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdHF1ZXJ5Q29udGV4dD86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xufVxuXG5leHBvcnQgdHlwZSBJbnN0YWxsU291cmNlID0gJ2dhbGxlcnknIHwgJ3ZzaXgnIHwgJ3Jlc291cmNlJztcblxuZXhwb3J0IGludGVyZmFjZSBJR2FsbGVyeU1ldGFkYXRhIHtcblx0aWQ6IHN0cmluZztcblx0cHVibGlzaGVySWQ6IHN0cmluZztcblx0cHJpdmF0ZTogYm9vbGVhbjtcblx0cHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZztcblx0aXNQcmVSZWxlYXNlVmVyc2lvbjogYm9vbGVhbjtcblx0dGFyZ2V0UGxhdGZvcm0/OiBUYXJnZXRQbGF0Zm9ybTtcbn1cblxuZXhwb3J0IHR5cGUgTWV0YWRhdGEgPSBQYXJ0aWFsPElHYWxsZXJ5TWV0YWRhdGEgJiB7XG5cdGlzQXBwbGljYXRpb25TY29wZWQ6IGJvb2xlYW47XG5cdGlzTWFjaGluZVNjb3BlZDogYm9vbGVhbjtcblx0aXNCdWlsdGluOiBib29sZWFuO1xuXHRpc1N5c3RlbTogYm9vbGVhbjtcblx0dXBkYXRlZDogYm9vbGVhbjtcblx0cHJlUmVsZWFzZTogYm9vbGVhbjtcblx0aGFzUHJlUmVsZWFzZVZlcnNpb246IGJvb2xlYW47XG5cdGluc3RhbGxlZFRpbWVzdGFtcDogbnVtYmVyO1xuXHRwaW5uZWQ6IGJvb2xlYW47XG5cdHNvdXJjZTogSW5zdGFsbFNvdXJjZTtcblx0c2l6ZTogbnVtYmVyO1xufT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvY2FsRXh0ZW5zaW9uIGV4dGVuZHMgSUV4dGVuc2lvbiB7XG5cdGlzV29ya3NwYWNlU2NvcGVkOiBib29sZWFuO1xuXHRpc01hY2hpbmVTY29wZWQ6IGJvb2xlYW47XG5cdGlzQXBwbGljYXRpb25TY29wZWQ6IGJvb2xlYW47XG5cdHB1Ymxpc2hlcklkOiBzdHJpbmcgfCBudWxsO1xuXHRpbnN0YWxsZWRUaW1lc3RhbXA/OiBudW1iZXI7XG5cdGlzUHJlUmVsZWFzZVZlcnNpb246IGJvb2xlYW47XG5cdGhhc1ByZVJlbGVhc2VWZXJzaW9uOiBib29sZWFuO1xuXHRwcml2YXRlOiBib29sZWFuO1xuXHRwcmVSZWxlYXNlOiBib29sZWFuO1xuXHR1cGRhdGVkOiBib29sZWFuO1xuXHRwaW5uZWQ6IGJvb2xlYW47XG5cdGZvcmNlQXV0b1VwZGF0ZTogYm9vbGVhbjtcblx0c291cmNlOiBJbnN0YWxsU291cmNlO1xuXHRzaXplOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNvcnRCeSB7XG5cdE5vbmVPclJlbGV2YW5jZSA9ICdOb25lT3JSZWxldmFuY2UnLFxuXHRMYXN0VXBkYXRlZERhdGUgPSAnTGFzdFVwZGF0ZWREYXRlJyxcblx0VGl0bGUgPSAnVGl0bGUnLFxuXHRQdWJsaXNoZXJOYW1lID0gJ1B1Ymxpc2hlck5hbWUnLFxuXHRJbnN0YWxsQ291bnQgPSAnSW5zdGFsbENvdW50Jyxcblx0UHVibGlzaGVkRGF0ZSA9ICdQdWJsaXNoZWREYXRlJyxcblx0QXZlcmFnZVJhdGluZyA9ICdBdmVyYWdlUmF0aW5nJyxcblx0V2VpZ2h0ZWRSYXRpbmcgPSAnV2VpZ2h0ZWRSYXRpbmcnXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNvcnRPcmRlciB7XG5cdERlZmF1bHQgPSAwLFxuXHRBc2NlbmRpbmcgPSAxLFxuXHREZXNjZW5kaW5nID0gMlxufVxuXG5leHBvcnQgY29uc3QgZW51bSBGaWx0ZXJUeXBlIHtcblx0Q2F0ZWdvcnkgPSAnQ2F0ZWdvcnknLFxuXHRFeHRlbnNpb25JZCA9ICdFeHRlbnNpb25JZCcsXG5cdEV4dGVuc2lvbk5hbWUgPSAnRXh0ZW5zaW9uTmFtZScsXG5cdEV4Y2x1ZGVXaXRoRmxhZ3MgPSAnRXhjbHVkZVdpdGhGbGFncycsXG5cdEZlYXR1cmVkID0gJ0ZlYXR1cmVkJyxcblx0U2VhcmNoVGV4dCA9ICdTZWFyY2hUZXh0Jyxcblx0VGFnID0gJ1RhZycsXG5cdFRhcmdldCA9ICdUYXJnZXQnLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElRdWVyeU9wdGlvbnMge1xuXHR0ZXh0Pzogc3RyaW5nO1xuXHRleGNsdWRlPzogc3RyaW5nW107XG5cdHBhZ2VTaXplPzogbnVtYmVyO1xuXHRzb3J0Qnk/OiBTb3J0Qnk7XG5cdHNvcnRPcmRlcj86IFNvcnRPcmRlcjtcblx0c291cmNlPzogc3RyaW5nO1xuXHRpbmNsdWRlUHJlUmVsZWFzZT86IGJvb2xlYW47XG5cdHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTdGF0aXN0aWNUeXBlIHtcblx0SW5zdGFsbCA9ICdpbnN0YWxsJyxcblx0VW5pbnN0YWxsID0gJ3VuaW5zdGFsbCdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGVwcmVjYXRpb25JbmZvIHtcblx0cmVhZG9ubHkgZGlzYWxsb3dJbnN0YWxsPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uPzoge1xuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBhdXRvTWlncmF0ZT86IHtcblx0XHRcdHJlYWRvbmx5IHN0b3JhZ2U6IGJvb2xlYW47XG5cdFx0XHRyZWFkb25seSBkb25vdERpc2FibGU/OiBib29sZWFuO1xuXHRcdH07XG5cdFx0cmVhZG9ubHkgcHJlUmVsZWFzZT86IGJvb2xlYW47XG5cdH07XG5cdHJlYWRvbmx5IHNldHRpbmdzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGFkZGl0aW9uYWxJbmZvPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hQcmVmZmVyZWRSZXN1bHRzIHtcblx0cmVhZG9ubHkgcXVlcnk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByZWZlcnJlZFJlc3VsdHM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IHR5cGUgTWFsaWNpb3VzRXh0ZW5zaW9uSW5mbyA9IHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uT3JQdWJsaXNoZXI6IElFeHRlbnNpb25JZGVudGlmaWVyIHwgc3RyaW5nO1xuXHRyZWFkb25seSBsZWFybk1vcmVMaW5rPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCB7XG5cdHJlYWRvbmx5IG1hbGljaW91czogUmVhZG9ubHlBcnJheTxNYWxpY2lvdXNFeHRlbnNpb25JbmZvPjtcblx0cmVhZG9ubHkgZGVwcmVjYXRlZDogSVN0cmluZ0RpY3Rpb25hcnk8SURlcHJlY2F0aW9uSW5mbz47XG5cdHJlYWRvbmx5IHNlYXJjaDogSVNlYXJjaFByZWZmZXJlZFJlc3VsdHNbXTtcblx0cmVhZG9ubHkgYXV0b1VwZGF0ZT86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEluc3RhbGxPcGVyYXRpb24ge1xuXHROb25lID0gMSxcblx0SW5zdGFsbCxcblx0VXBkYXRlLFxuXHRNaWdyYXRlLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUcmFuc2xhdGlvbiB7XG5cdGNvbnRlbnRzOiB7IFtrZXk6IHN0cmluZ106IHt9IH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkluZm8gZXh0ZW5kcyBJRXh0ZW5zaW9uSWRlbnRpZmllciB7XG5cdHZlcnNpb24/OiBzdHJpbmc7XG5cdHByZVJlbGVhc2U/OiBib29sZWFuO1xuXHRoYXNQcmVSZWxlYXNlPzogYm9vbGVhbjtcblx0Y3VycmVudFZlcnNpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucyB7XG5cdHRhcmdldFBsYXRmb3JtPzogVGFyZ2V0UGxhdGZvcm07XG5cdHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uO1xuXHRjb21wYXRpYmxlPzogYm9vbGVhbjtcblx0cXVlcnlBbGxWZXJzaW9ucz86IGJvb2xlYW47XG5cdHNvdXJjZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uR2FsbGVyeUNhcGFiaWxpdGllcyB7XG5cdHJlYWRvbmx5IHF1ZXJ5OiB7XG5cdFx0cmVhZG9ubHkgc29ydEJ5OiByZWFkb25seSBTb3J0QnlbXTtcblx0XHRyZWFkb25seSBmaWx0ZXJzOiByZWFkb25seSBGaWx0ZXJUeXBlW107XG5cdH07XG5cdHJlYWRvbmx5IGFsbFJlcG9zaXRvcnlTaWduZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlPignZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UnKTtcblxuLyoqXG4gKiBTZXJ2aWNlIHRvIGludGVyYWN0IHdpdGggdGhlIFZpc3VhbCBTdHVkaW8gQ29kZSBNYXJrZXRwbGFjZSB0byBnZXQgZXh0ZW5zaW9ucy5cbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIE1hcmtldHBsYWNlIGlzIG5vdCBlbmFibGVkIG9yIG5vdCByZWFjaGFibGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRpc0VuYWJsZWQoKTogYm9vbGVhbjtcblx0cXVlcnkob3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZXI8SUdhbGxlcnlFeHRlbnNpb24+Pjtcblx0Z2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uSW5mbz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25bXT47XG5cdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3M6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkluZm8+LCBvcHRpb25zOiBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+O1xuXHRpc0V4dGVuc2lvbkNvbXBhdGlibGUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgaW5jbHVkZVByZVJlbGVhc2U6IGJvb2xlYW4sIHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSwgcHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRnZXRDb21wYXRpYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0sIHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+O1xuXHRnZXRBbGxDb21wYXRpYmxlVmVyc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIsIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdPjtcblx0Z2V0QWxsVmVyc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdPjtcblx0ZG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgbG9jYXRpb246IFVSSSwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uKTogUHJvbWlzZTx2b2lkPjtcblx0ZG93bmxvYWRTaWduYXR1cmVBcmNoaXZlKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZXBvcnRTdGF0aXN0aWMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nLCB0eXBlOiBTdGF0aXN0aWNUeXBlKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0UmVhZG1lKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPjtcblx0Z2V0TWFuaWZlc3QoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsPjtcblx0Z2V0Q2hhbmdlbG9nKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPjtcblx0Z2V0Q29yZVRyYW5zbGF0aW9uKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8SVRyYW5zbGF0aW9uIHwgbnVsbD47XG5cdGdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5zdGFsbEV4dGVuc2lvbkV2ZW50IHtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IHNvdXJjZTogVVJJIHwgSUdhbGxlcnlFeHRlbnNpb247XG5cdHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBhcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZVNjb3BlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5zdGFsbEV4dGVuc2lvblJlc3VsdCB7XG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb247XG5cdHJlYWRvbmx5IHNvdXJjZT86IFVSSSB8IElHYWxsZXJ5RXh0ZW5zaW9uO1xuXHRyZWFkb25seSBsb2NhbD86IElMb2NhbEV4dGVuc2lvbjtcblx0cmVhZG9ubHkgZXJyb3I/OiBFcnJvcjtcblx0cmVhZG9ubHkgY29udGV4dD86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgYXBwbGljYXRpb25TY29wZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VTY29wZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50IHtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBhcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZVNjb3BlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQge1xuXHRyZWFkb25seSBpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgZXJyb3I/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBhcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZVNjb3BlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEge1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgbG9jYWw6IElMb2NhbEV4dGVuc2lvbjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZSB7XG5cdFRpbWVvdXQgPSAnVGltZW91dCcsXG5cdENhbmNlbGxlZCA9ICdDYW5jZWxsZWQnLFxuXHRDbGllbnRFcnJvciA9ICdDbGllbnRFcnJvcicsXG5cdFNlcnZlckVycm9yID0gJ1NlcnZlckVycm9yJyxcblx0RmFpbGVkID0gJ0ZhaWxlZCcsXG5cdERvd25sb2FkRmFpbGVkV3JpdGluZyA9ICdEb3dubG9hZEZhaWxlZFdyaXRpbmcnLFxuXHRPZmZsaW5lID0gJ09mZmxpbmUnLFxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uR2FsbGVyeUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcsIHJlYWRvbmx5IGNvZGU6IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSBjb2RlO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUge1xuXHROb3RGb3VuZCA9ICdOb3RGb3VuZCcsXG5cdFVuc3VwcG9ydGVkID0gJ1Vuc3VwcG9ydGVkJyxcblx0RGVwcmVjYXRlZCA9ICdEZXByZWNhdGVkJyxcblx0TWFsaWNpb3VzID0gJ01hbGljaW91cycsXG5cdEluY29tcGF0aWJsZSA9ICdJbmNvbXBhdGlibGUnLFxuXHRJbmNvbXBhdGlibGVBcGkgPSAnSW5jb21wYXRpYmxlQXBpJyxcblx0SW5jb21wYXRpYmxlVGFyZ2V0UGxhdGZvcm0gPSAnSW5jb21wYXRpYmxlVGFyZ2V0UGxhdGZvcm0nLFxuXHRSZWxlYXNlVmVyc2lvbk5vdEZvdW5kID0gJ1JlbGVhc2VWZXJzaW9uTm90Rm91bmQnLFxuXHRJbnZhbGlkID0gJ0ludmFsaWQnLFxuXHREb3dubG9hZCA9ICdEb3dubG9hZCcsXG5cdERvd25sb2FkU2lnbmF0dXJlID0gJ0Rvd25sb2FkU2lnbmF0dXJlJyxcblx0RG93bmxvYWRGYWlsZWRXcml0aW5nID0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5Eb3dubG9hZEZhaWxlZFdyaXRpbmcsXG5cdFVwZGF0ZU1ldGFkYXRhID0gJ1VwZGF0ZU1ldGFkYXRhJyxcblx0RXh0cmFjdCA9ICdFeHRyYWN0Jyxcblx0U2Nhbm5pbmcgPSAnU2Nhbm5pbmcnLFxuXHRTY2FubmluZ0V4dGVuc2lvbiA9ICdTY2FubmluZ0V4dGVuc2lvbicsXG5cdFJlYWRSZW1vdmVkID0gJ1JlYWRSZW1vdmVkJyxcblx0VW5zZXRSZW1vdmVkID0gJ1Vuc2V0UmVtb3ZlZCcsXG5cdERlbGV0ZSA9ICdEZWxldGUnLFxuXHRSZW5hbWUgPSAnUmVuYW1lJyxcblx0SW50aWFsaXplRGVmYXVsdFByb2ZpbGUgPSAnSW50aWFsaXplRGVmYXVsdFByb2ZpbGUnLFxuXHRBZGRUb1Byb2ZpbGUgPSAnQWRkVG9Qcm9maWxlJyxcblx0SW5zdGFsbGVkRXh0ZW5zaW9uTm90Rm91bmQgPSAnSW5zdGFsbGVkRXh0ZW5zaW9uTm90Rm91bmQnLFxuXHRQb3N0SW5zdGFsbCA9ICdQb3N0SW5zdGFsbCcsXG5cdENvcnJ1cHRaaXAgPSAnQ29ycnVwdFppcCcsXG5cdEluY29tcGxldGVaaXAgPSAnSW5jb21wbGV0ZVppcCcsXG5cdFBhY2thZ2VOb3RTaWduZWQgPSAnUGFja2FnZU5vdFNpZ25lZCcsXG5cdFNpZ25hdHVyZVZlcmlmaWNhdGlvbkludGVybmFsID0gJ1NpZ25hdHVyZVZlcmlmaWNhdGlvbkludGVybmFsJyxcblx0U2lnbmF0dXJlVmVyaWZpY2F0aW9uRmFpbGVkID0gJ1NpZ25hdHVyZVZlcmlmaWNhdGlvbkZhaWxlZCcsXG5cdE5vdEFsbG93ZWQgPSAnTm90QWxsb3dlZCcsXG5cdEdhbGxlcnkgPSAnR2FsbGVyeScsXG5cdENhbmNlbGxlZCA9ICdDYW5jZWxsZWQnLFxuXHRVbmtub3duID0gJ1Vua25vd24nLFxuXHRJbnRlcm5hbCA9ICdJbnRlcm5hbCcsXG59XG5cbmV4cG9ydCBlbnVtIEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUge1xuXHQnTm90U2lnbmVkJyA9ICdOb3RTaWduZWQnLFxuXHQnU3VjY2VzcycgPSAnU3VjY2VzcycsXG5cdCdSZXF1aXJlZEFyZ3VtZW50TWlzc2luZycgPSAnUmVxdWlyZWRBcmd1bWVudE1pc3NpbmcnLCAvLyBBIHJlcXVpcmVkIGFyZ3VtZW50IGlzIG1pc3NpbmcuXG5cdCdJbnZhbGlkQXJndW1lbnQnID0gJ0ludmFsaWRBcmd1bWVudCcsIC8vIEFuIGFyZ3VtZW50IGlzIGludmFsaWQuXG5cdCdQYWNrYWdlSXNVbnJlYWRhYmxlJyA9ICdQYWNrYWdlSXNVbnJlYWRhYmxlJywgLy8gVGhlIGV4dGVuc2lvbiBwYWNrYWdlIGlzIHVucmVhZGFibGUuXG5cdCdVbmhhbmRsZWRFeGNlcHRpb24nID0gJ1VuaGFuZGxlZEV4Y2VwdGlvbicsIC8vIEFuIHVuaGFuZGxlZCBleGNlcHRpb24gb2NjdXJyZWQuXG5cdCdTaWduYXR1cmVNYW5pZmVzdElzTWlzc2luZycgPSAnU2lnbmF0dXJlTWFuaWZlc3RJc01pc3NpbmcnLCAvLyBUaGUgZXh0ZW5zaW9uIGlzIG1pc3NpbmcgYSBzaWduYXR1cmUgbWFuaWZlc3QgZmlsZSAoLnNpZ25hdHVyZS5tYW5pZmVzdCkuXG5cdCdTaWduYXR1cmVNYW5pZmVzdElzVW5yZWFkYWJsZScgPSAnU2lnbmF0dXJlTWFuaWZlc3RJc1VucmVhZGFibGUnLCAvLyBUaGUgc2lnbmF0dXJlIG1hbmlmZXN0IGlzIHVucmVhZGFibGUuXG5cdCdTaWduYXR1cmVJc01pc3NpbmcnID0gJ1NpZ25hdHVyZUlzTWlzc2luZycsIC8vIFRoZSBleHRlbnNpb24gaXMgbWlzc2luZyBhIHNpZ25hdHVyZSBmaWxlICguc2lnbmF0dXJlLnA3cykuXG5cdCdTaWduYXR1cmVJc1VucmVhZGFibGUnID0gJ1NpZ25hdHVyZUlzVW5yZWFkYWJsZScsIC8vIFRoZSBzaWduYXR1cmUgaXMgdW5yZWFkYWJsZS5cblx0J0NlcnRpZmljYXRlSXNVbnJlYWRhYmxlJyA9ICdDZXJ0aWZpY2F0ZUlzVW5yZWFkYWJsZScsIC8vIFRoZSBjZXJ0aWZpY2F0ZSBpcyB1bnJlYWRhYmxlLlxuXHQnU2lnbmF0dXJlQXJjaGl2ZUlzVW5yZWFkYWJsZScgPSAnU2lnbmF0dXJlQXJjaGl2ZUlzVW5yZWFkYWJsZScsXG5cdCdGaWxlQWxyZWFkeUV4aXN0cycgPSAnRmlsZUFscmVhZHlFeGlzdHMnLCAvLyBUaGUgb3V0cHV0IGZpbGUgYWxyZWFkeSBleGlzdHMuXG5cdCdTaWduYXR1cmVBcmNoaXZlSXNJbnZhbGlkWmlwJyA9ICdTaWduYXR1cmVBcmNoaXZlSXNJbnZhbGlkWmlwJyxcblx0J1NpZ25hdHVyZUFyY2hpdmVIYXNTYW1lU2lnbmF0dXJlRmlsZScgPSAnU2lnbmF0dXJlQXJjaGl2ZUhhc1NhbWVTaWduYXR1cmVGaWxlJywgLy8gVGhlIHNpZ25hdHVyZSBhcmNoaXZlIGhhcyB0aGUgc2FtZSBzaWduYXR1cmUgZmlsZS5cblx0J1BhY2thZ2VJbnRlZ3JpdHlDaGVja0ZhaWxlZCcgPSAnUGFja2FnZUludGVncml0eUNoZWNrRmFpbGVkJywgLy8gVGhlIHBhY2thZ2UgaW50ZWdyaXR5IGNoZWNrIGZhaWxlZC5cblx0J1NpZ25hdHVyZUlzSW52YWxpZCcgPSAnU2lnbmF0dXJlSXNJbnZhbGlkJywgLy8gVGhlIGV4dGVuc2lvbiBoYXMgYW4gaW52YWxpZCBzaWduYXR1cmUgZmlsZSAoLnNpZ25hdHVyZS5wN3MpLlxuXHQnU2lnbmF0dXJlTWFuaWZlc3RJc0ludmFsaWQnID0gJ1NpZ25hdHVyZU1hbmlmZXN0SXNJbnZhbGlkJywgLy8gVGhlIGV4dGVuc2lvbiBoYXMgYW4gaW52YWxpZCBzaWduYXR1cmUgbWFuaWZlc3QgZmlsZSAoLnNpZ25hdHVyZS5tYW5pZmVzdCkuXG5cdCdTaWduYXR1cmVJbnRlZ3JpdHlDaGVja0ZhaWxlZCcgPSAnU2lnbmF0dXJlSW50ZWdyaXR5Q2hlY2tGYWlsZWQnLCAvLyBUaGUgZXh0ZW5zaW9uJ3Mgc2lnbmF0dXJlIGludGVncml0eSBjaGVjayBmYWlsZWQuICBFeHRlbnNpb24gaW50ZWdyaXR5IGlzIHN1c3BlY3QuXG5cdCdFbnRyeUlzTWlzc2luZycgPSAnRW50cnlJc01pc3NpbmcnLCAvLyBBbiBlbnRyeSByZWZlcmVuY2VkIGluIHRoZSBzaWduYXR1cmUgbWFuaWZlc3Qgd2FzIG5vdCBmb3VuZCBpbiB0aGUgZXh0ZW5zaW9uLlxuXHQnRW50cnlJc1RhbXBlcmVkJyA9ICdFbnRyeUlzVGFtcGVyZWQnLCAvLyBUaGUgaW50ZWdyaXR5IGNoZWNrIGZvciBhbiBlbnRyeSByZWZlcmVuY2VkIGluIHRoZSBzaWduYXR1cmUgbWFuaWZlc3QgZmFpbGVkLlxuXHQnVW50cnVzdGVkJyA9ICdVbnRydXN0ZWQnLCAvLyBBbiBYLjUwOSBjZXJ0aWZpY2F0ZSBpbiB0aGUgZXh0ZW5zaW9uIHNpZ25hdHVyZSBpcyB1bnRydXN0ZWQuXG5cdCdDZXJ0aWZpY2F0ZVJldm9rZWQnID0gJ0NlcnRpZmljYXRlUmV2b2tlZCcsIC8vIEFuIFguNTA5IGNlcnRpZmljYXRlIGluIHRoZSBleHRlbnNpb24gc2lnbmF0dXJlIGhhcyBiZWVuIHJldm9rZWQuXG5cdCdTaWduYXR1cmVJc05vdFZhbGlkJyA9ICdTaWduYXR1cmVJc05vdFZhbGlkJywgLy8gVGhlIGV4dGVuc2lvbiBzaWduYXR1cmUgaXMgaW52YWxpZC5cblx0J1Vua25vd25FcnJvcicgPSAnVW5rbm93bkVycm9yJywgLy8gQW4gdW5rbm93biBlcnJvciBvY2N1cnJlZC5cblx0J1BhY2thZ2VJc0ludmFsaWRaaXAnID0gJ1BhY2thZ2VJc0ludmFsaWRaaXAnLCAvLyBUaGUgZXh0ZW5zaW9uIHBhY2thZ2UgaXMgbm90IHZhbGlkIFpJUCBmb3JtYXQuXG5cdCdTaWduYXR1cmVBcmNoaXZlSGFzVG9vTWFueUVudHJpZXMnID0gJ1NpZ25hdHVyZUFyY2hpdmVIYXNUb29NYW55RW50cmllcycsIC8vIFRoZSBzaWduYXR1cmUgYXJjaGl2ZSBoYXMgdG9vIG1hbnkgZW50cmllcy5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCByZWFkb25seSBjb2RlOiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gY29kZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEluc3RhbGxFeHRlbnNpb25TdW1tYXJ5IHtcblx0ZmFpbGVkOiB7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnM7XG5cdH1bXTtcbn1cblxuZXhwb3J0IHR5cGUgSW5zdGFsbE9wdGlvbnMgPSB7XG5cdGlzQnVpbHRpbj86IGJvb2xlYW47XG5cdGlzV29ya3NwYWNlU2NvcGVkPzogYm9vbGVhbjtcblx0aXNNYWNoaW5lU2NvcGVkPzogYm9vbGVhbjtcblx0aXNBcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW47XG5cdHBpbm5lZD86IGJvb2xlYW47XG5cdGRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXM/OiBib29sZWFuO1xuXHRpbnN0YWxsR2l2ZW5WZXJzaW9uPzogYm9vbGVhbjtcblx0cHJlUmVsZWFzZT86IGJvb2xlYW47XG5cdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbj86IGJvb2xlYW47XG5cdGRvbm90VmVyaWZ5U2lnbmF0dXJlPzogYm9vbGVhbjtcblx0b3BlcmF0aW9uPzogSW5zdGFsbE9wZXJhdGlvbjtcblx0cHJvZmlsZUxvY2F0aW9uPzogVVJJO1xuXHRwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbjtcblx0a2VlcEV4aXN0aW5nPzogYm9vbGVhbjtcblx0ZG93bmxvYWRFeHRlbnNpb25zTG9jYWxseT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250ZXh0IHBhc3NlZCB0aHJvdWdoIHRvIEluc3RhbGxFeHRlbnNpb25SZXN1bHRcblx0ICovXG5cdGNvbnRleHQ/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCB0eXBlIFVuaW5zdGFsbE9wdGlvbnMgPSB7XG5cdHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbj86IFVSSTtcblx0cmVhZG9ubHkgZG9ub3RJbmNsdWRlUGFjaz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRvbm90Q2hlY2tEZXBlbmRlbnRzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdmVyc2lvbk9ubHk/OiBib29sZWFuO1xuXHRyZWFkb25seSByZW1vdmU/OiBib29sZWFuO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uTWFuYWdlbWVudFBhcnRpY2lwYW50IHtcblx0cG9zdEluc3RhbGwobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgc291cmNlOiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbiwgb3B0aW9uczogSW5zdGFsbE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD47XG5cdHBvc3RVbmluc3RhbGwobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9uczogVW5pbnN0YWxsT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IHR5cGUgSW5zdGFsbEV4dGVuc2lvbkluZm8gPSB7IHJlYWRvbmx5IGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb247IHJlYWRvbmx5IG9wdGlvbnM6IEluc3RhbGxPcHRpb25zIH07XG5leHBvcnQgdHlwZSBVbmluc3RhbGxFeHRlbnNpb25JbmZvID0geyByZWFkb25seSBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbjsgcmVhZG9ubHkgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMgfTtcblxuZXhwb3J0IGNvbnN0IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U+KCdleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgcHJlZmVyUHJlUmVsZWFzZXM6IGJvb2xlYW47XG5cblx0b25JbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxJbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+O1xuXHRvbkRpZEluc3RhbGxFeHRlbnNpb25zOiBFdmVudDxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+O1xuXHRvblVuaW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8VW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+O1xuXHRvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+O1xuXHRvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhOiBFdmVudDxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YT47XG5cblx0emlwKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+O1xuXHRnZXRNYW5pZmVzdCh2c2l4OiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdD47XG5cdGluc3RhbGwodnNpeDogVVJJLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdGNhbkluc3RhbGwoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8dHJ1ZSB8IElNYXJrZG93blN0cmluZz47XG5cdGluc3RhbGxGcm9tR2FsbGVyeShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdGluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTxJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+O1xuXHRpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkksIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRpbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+O1xuXHR1bmluc3RhbGwoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM/OiBVbmluc3RhbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0dW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBVbmluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+O1xuXHR0b2dnbGVBcHBsaWNhdGlvblNjb3BlKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdGdldEluc3RhbGxlZCh0eXBlPzogRXh0ZW5zaW9uVHlwZSwgcHJvZmlsZUxvY2F0aW9uPzogVVJJLCBwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbiwgbGFuZ3VhZ2U/OiBzdHJpbmcpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPjtcblx0Z2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpOiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0Pjtcblx0Y29weUV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlTWV0YWRhdGEobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+LCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0cmVzZXRQaW5uZWRTdGF0ZUZvckFsbFVzZXJFeHRlbnNpb25zKHBpbm5lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cblx0ZG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCBkb25vdFZlcmlmeVNpZ25hdHVyZTogYm9vbGVhbik6IFByb21pc2U8VVJJPjtcblxuXHRyZWdpc3RlclBhcnRpY2lwYW50KHBhcml0aWNpcGFudDogSUV4dGVuc2lvbk1hbmFnZW1lbnRQYXJ0aWNpcGFudCk6IHZvaWQ7XG5cdGdldFRhcmdldFBsYXRmb3JtKCk6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+O1xuXG5cdGNsZWFuVXAoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNvbnN0IERJU0FCTEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9QQVRIID0gJ2V4dGVuc2lvbnNJZGVudGlmaWVycy9kaXNhYmxlZCc7XG5leHBvcnQgY29uc3QgRU5BQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCA9ICdleHRlbnNpb25zSWRlbnRpZmllcnMvZW5hYmxlZCc7XG5leHBvcnQgY29uc3QgSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZT4oJ0lHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbmFibGVtZW50OiBFdmVudDx7IHJlYWRvbmx5IGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW107IHJlYWRvbmx5IHNvdXJjZT86IHN0cmluZyB9PjtcblxuXHRnZXREaXNhYmxlZEV4dGVuc2lvbnMoKTogSUV4dGVuc2lvbklkZW50aWZpZXJbXTtcblx0ZW5hYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbklkZW50aWZpZXIsIHNvdXJjZT86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdGRpc2FibGVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgc291cmNlPzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcblxufVxuXG5leHBvcnQgdHlwZSBJQ29uZmlnQmFzZWRFeHRlbnNpb25UaXAgPSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbk5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaXNFeHRlbnNpb25QYWNrOiBib29sZWFuO1xuXHRyZWFkb25seSBjb25maWdOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGltcG9ydGFudDogYm9vbGVhbjtcblx0cmVhZG9ubHkgd2hlbk5vdEluc3RhbGxlZD86IHN0cmluZ1tdO1xufTtcblxuZXhwb3J0IHR5cGUgSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcCA9IHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpc0V4dGVuc2lvblBhY2s6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGV4ZU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZXhlRnJpZW5kbHlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdpbmRvd3NQYXRoPzogc3RyaW5nO1xuXHRyZWFkb25seSB3aGVuTm90SW5zdGFsbGVkPzogc3RyaW5nW107XG59O1xuXG5leHBvcnQgY29uc3QgSUV4dGVuc2lvblRpcHNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRlbnNpb25UaXBzU2VydmljZT4oJ0lFeHRlbnNpb25UaXBzU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uVGlwc1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Z2V0Q29uZmlnQmFzZWRUaXBzKGZvbGRlcjogVVJJKTogUHJvbWlzZTxJQ29uZmlnQmFzZWRFeHRlbnNpb25UaXBbXT47XG5cdGdldEltcG9ydGFudEV4ZWN1dGFibGVCYXNlZFRpcHMoKTogUHJvbWlzZTxJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10+O1xuXHRnZXRPdGhlckV4ZWN1dGFibGVCYXNlZFRpcHMoKTogUHJvbWlzZTxJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10+O1xufVxuXG5leHBvcnQgdHlwZSBBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ1ZhbHVlVHlwZSA9IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4gfCBzdHJpbmcgfCBzdHJpbmdbXT47XG5cbmV4cG9ydCBjb25zdCBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U+KCdJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZTogQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZVR5cGUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZTogRXZlbnQ8dm9pZD47XG5cblx0aXNBbGxvd2VkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCBJRXh0ZW5zaW9uKTogdHJ1ZSB8IElNYXJrZG93blN0cmluZztcblx0aXNBbGxvd2VkKGV4dGVuc2lvbjogeyBpZDogc3RyaW5nOyBwdWJsaXNoZXJEaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkOyB2ZXJzaW9uPzogc3RyaW5nOyBwcmVyZWxlYXNlPzogYm9vbGVhbjsgdGFyZ2V0UGxhdGZvcm0/OiBUYXJnZXRQbGF0Zm9ybSB9KTogdHJ1ZSB8IElNYXJrZG93blN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbXB1dGVTaXplKGxvY2F0aW9uOiBVUkksIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRsZXQgc3RhdDogSUZpbGVTdGF0O1xuXHR0cnkge1xuXHRcdHN0YXQgPSBhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGxvY2F0aW9uKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0dGhyb3cgZTtcblx0fVxuXHRpZiAoc3RhdC5jaGlsZHJlbikge1xuXHRcdGNvbnN0IHNpemVzID0gYXdhaXQgUHJvbWlzZS5hbGwoc3RhdC5jaGlsZHJlbi5tYXAoYyA9PiBjb21wdXRlU2l6ZShjLnJlc291cmNlLCBmaWxlU2VydmljZSkpKTtcblx0XHRyZXR1cm4gc2l6ZXMucmVkdWNlKChyLCBzKSA9PiByICsgcywgMCk7XG5cdH1cblx0cmV0dXJuIHN0YXQuc2l6ZSA/PyAwO1xufVxuXG5leHBvcnQgY29uc3QgRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsID0gbG9jYWxpemUyKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpO1xuZXhwb3J0IGNvbnN0IFByZWZlcmVuY2VzTG9jYWxpemVkTGFiZWwgPSBsb2NhbGl6ZTIoJ3ByZWZlcmVuY2VzJywgJ1ByZWZlcmVuY2VzJyk7XG5leHBvcnQgY29uc3QgQWxsb3dlZEV4dGVuc2lvbnNDb25maWdLZXkgPSAnZXh0ZW5zaW9ucy5hbGxvd2VkJztcbmV4cG9ydCBjb25zdCBWZXJpZnlFeHRlbnNpb25TaWduYXR1cmVDb25maWdLZXkgPSAnZXh0ZW5zaW9ucy52ZXJpZnlTaWduYXR1cmUnO1xuZXhwb3J0IGNvbnN0IEV4dGVuc2lvblJlcXVlc3RzVGltZW91dENvbmZpZ0tleSA9ICdleHRlbnNpb25zLnJlcXVlc3RUaW1lb3V0JztcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRpZDogJ2V4dGVuc2lvbnMnLFxuXHRcdG9yZGVyOiAzMCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2V4dGVuc2lvbnNDb25maWd1cmF0aW9uVGl0bGUnLCBcIkV4dGVuc2lvbnNcIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0W0FsbG93ZWRFeHRlbnNpb25zQ29uZmlnS2V5XToge1xuXHRcdFx0XHQvLyBOb3RlOiBUeXBlIGlzIHNldCBvbmx5IHRvIG9iamVjdCBiZWNhdXNlIHRvIHN1cHBvcnQgcG9saWNpZXMgZ2VuZXJhdGlvbiBkdXJpbmcgYnVpbGQgdGltZSwgd2hlcmUgc2luZ2xlIHR5cGUgaXMgZXhwZWN0ZWQuXG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd2VkJywgXCJTcGVjaWZ5IGEgbGlzdCBvZiBleHRlbnNpb25zIHRoYXQgYXJlIGFsbG93ZWQgdG8gdXNlLiBUaGlzIGhlbHBzIG1haW50YWluIGEgc2VjdXJlIGFuZCBjb25zaXN0ZW50IGRldmVsb3BtZW50IGVudmlyb25tZW50IGJ5IHJlc3RyaWN0aW5nIHRoZSB1c2Ugb2YgdW5hdXRob3JpemVkIGV4dGVuc2lvbnMuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGhvdyB0byBjb25maWd1cmUgdGhpcyBzZXR0aW5nLCBwbGVhc2UgdmlzaXQgdGhlIFtDb25maWd1cmUgQWxsb3dlZCBFeHRlbnNpb25zXShodHRwczovL2FrYS5tcy92c2NvZGUvZW50ZXJwcmlzZS9leHRlbnNpb25zL2FsbG93ZWQpIHNlY3Rpb24uXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiAnKicsXG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdFx0XHRib2R5OiB7fSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYWxsb3dlZC5ub25lJywgXCJObyBleHRlbnNpb25zIGFyZSBhbGxvd2VkLlwiKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdCcqJzogdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93ZWQuYWxsJywgXCJBbGwgZXh0ZW5zaW9ucyBhcmUgYWxsb3dlZC5cIiksXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnQWxsb3dlZEV4dGVuc2lvbnMnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS45NicsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdleHRlbnNpb25zLmFsbG93ZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93ZWQucG9saWN5JywgXCJTcGVjaWZ5IGEgbGlzdCBvZiBleHRlbnNpb25zIHRoYXQgYXJlIGFsbG93ZWQgdG8gdXNlLiBUaGlzIGhlbHBzIG1haW50YWluIGEgc2VjdXJlIGFuZCBjb25zaXN0ZW50IGRldmVsb3BtZW50IGVudmlyb25tZW50IGJ5IHJlc3RyaWN0aW5nIHRoZSB1c2Ugb2YgdW5hdXRob3JpemVkIGV4dGVuc2lvbnMuIE1vcmUgaW5mb3JtYXRpb246IGh0dHBzOi8vYWthLm1zL3ZzY29kZS9lbnRlcnByaXNlL2V4dGVuc2lvbnMvYWxsb3dlZFwiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHQnKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKilcXFxcLihbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc6IHtcblx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogW3RydWUsIGZhbHNlLCAnc3RhYmxlJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93LmRlc2NyaXB0aW9uJywgXCJBbGxvdyBvciBkaXNhbGxvdyB0aGUgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd2VkLmVuYWJsZS5kZXNjJywgXCJFeHRlbnNpb24gaXMgYWxsb3dlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd2VkLmRpc2FibGUuZGVzYycsIFwiRXh0ZW5zaW9uIGlzIG5vdCBhbGxvd2VkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93ZWQuZGlzYWJsZS5zdGFibGUuZGVzYycsIFwiQWxsb3cgb25seSBzdGFibGUgdmVyc2lvbnMgb2YgdGhlIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93LnZlcnNpb24uZGVzY3JpcHRpb24nLCBcIkFsbG93IG9yIGRpc2FsbG93IHNwZWNpZmljIHZlcnNpb25zIG9mIHRoZSBleHRlbnNpb24uIFRvIHNwZWNpZmN5IGEgcGxhdGZvcm0gc3BlY2lmaWMgdmVyc2lvbiwgdXNlIHRoZSBmb3JtYXQgYHBsYXRmb3JtQDEuMi4zYCwgZS5nLiBgd2luMzIteDY0QDEuMi4zYC4gU3VwcG9ydGVkIHBsYXRmb3JtcyBhcmUgYHdpbjMyLXg2NGAsIGB3aW4zMi1hcm02NGAsIGBsaW51eC14NjRgLCBgbGludXgtYXJtNjRgLCBgbGludXgtYXJtaGZgLCBgYWxwaW5lLXg2NGAsIGBhbHBpbmUtYXJtNjRgLCBgZGFyd2luLXg2NGAsIGBkYXJ3aW4tYXJtNjRgXCIpLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0JyhbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc6IHtcblx0XHRcdFx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgJ3N0YWJsZSddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb24ucHVibGlzaGVyLmFsbG93LmRlc2NyaXB0aW9uJywgXCJBbGxvdyBvciBkaXNhbGxvdyBhbGwgZXh0ZW5zaW9ucyBmcm9tIHRoZSBwdWJsaXNoZXIuXCIpLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5wdWJsaXNoZXIuYWxsb3dlZC5lbmFibGUuZGVzYycsIFwiQWxsIGV4dGVuc2lvbnMgZnJvbSB0aGUgcHVibGlzaGVyIGFyZSBhbGxvd2VkLlwiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMucHVibGlzaGVyLmFsbG93ZWQuZGlzYWJsZS5kZXNjJywgXCJBbGwgZXh0ZW5zaW9ucyBmcm9tIHRoZSBwdWJsaXNoZXIgYXJlIG5vdCBhbGxvd2VkLlwiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMucHVibGlzaGVyLmFsbG93ZWQuZGlzYWJsZS5zdGFibGUuZGVzYycsIFwiQWxsb3cgb25seSBzdGFibGUgdmVyc2lvbnMgb2YgdGhlIGV4dGVuc2lvbnMgZnJvbSB0aGUgcHVibGlzaGVyLlwiKSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnXFxcXConOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRlbnVtOiBbdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93LmFsbC5kZXNjcmlwdGlvbicsIFwiQWxsb3cgb3IgZGlzYWxsb3cgYWxsIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvdy5hbGwuZW5hYmxlJywgXCJBbGxvdyBhbGwgZXh0ZW5zaW9ucy5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93LmFsbC5kaXNhYmxlJywgXCJEaXNhbGxvdyBhbGwgZXh0ZW5zaW9ucy5cIilcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFJlcXVpcmVSZXBvc2l0b3J5U2lnbmF0dXJlRm9yKGlzUHJpdmF0ZTogYm9vbGVhbiwgZ2FsbGVyeU1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRpZiAoaXNQcml2YXRlKSB7XG5cdFx0cmV0dXJuIGdhbGxlcnlNYW5pZmVzdD8uY2FwYWJpbGl0aWVzLnNpZ25pbmc/LmFsbFByaXZhdGVSZXBvc2l0b3J5U2lnbmVkID09PSB0cnVlO1xuXHR9XG5cdHJldHVybiBnYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5zaWduaW5nPy5hbGxQdWJsaWNSZXBvc2l0b3J5U2lnbmVkID09PSB0cnVlO1xufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFVQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsb0JBQW9CLGtCQUEwQztBQUN2RSxTQUF3RCxzQkFBc0I7QUFDOUUsU0FBNkIsMkJBQW9EO0FBQ2pGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBR2xCLE1BQU0sK0JBQStCO0FBQ3JD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QUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsTUFBTSxLQUFLO0FBQUEsVUFDbEIsYUFBYSxTQUFTLG9DQUFvQyxtQ0FBbUM7QUFBQSxVQUM3RixrQkFBa0I7QUFBQSxZQUNqQixTQUFTLCtCQUErQix1QkFBdUI7QUFBQSxZQUMvRCxTQUFTLGdDQUFnQywwQkFBMEI7QUFBQSxVQUNwRTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUssU0FBUyxvQ0FBb0MsV0FBb0IsaUJBQTREO0FBQ25JLE1BQUksV0FBVztBQUNkLFdBQU8saUJBQWlCLGFBQWEsU0FBUywrQkFBK0I7QUFBQSxFQUM5RTtBQUNBLFNBQU8saUJBQWlCLGFBQWEsU0FBUyw4QkFBOEI7QUFDN0U7IiwKICAibmFtZXMiOiBbIkV4dGVuc2lvbkluc3RhbGxTb3VyY2UiLCAiU29ydEJ5IiwgIlNvcnRPcmRlciIsICJGaWx0ZXJUeXBlIiwgIlN0YXRpc3RpY1R5cGUiLCAiSW5zdGFsbE9wZXJhdGlvbiIsICJFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlIiwgIkV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUiLCAiRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSJdCn0K
