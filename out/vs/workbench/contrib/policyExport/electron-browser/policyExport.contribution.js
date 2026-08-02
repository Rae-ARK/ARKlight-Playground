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
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { process } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { PolicyCategory, PolicyCategoryData } from "../../../../base/common/policy.js";
import { join } from "../../../../base/common/path.js";
import { hasKey } from "../../../../base/common/types.js";
let PolicyExportContribution = class extends Disposable {
  constructor(nativeEnvironmentService, extensionService, fileService, configurationService, nativeHostService, progressService, logService) {
    super();
    this.nativeEnvironmentService = nativeEnvironmentService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.nativeHostService = nativeHostService;
    this.progressService = progressService;
    this.logService = logService;
    if (this.nativeEnvironmentService.isBuilt) {
      return;
    }
    const policyDataPath = this.nativeEnvironmentService.exportPolicyData;
    if (policyDataPath !== void 0) {
      const defaultPath = join(this.nativeEnvironmentService.appRoot, PolicyExportContribution.DEFAULT_POLICY_EXPORT_PATH);
      void this.exportPolicyDataAndQuit(policyDataPath ? policyDataPath : defaultPath);
    }
  }
  log(msg, ...args) {
    this.logService.info(`[${PolicyExportContribution.ID}]`, msg, ...args);
  }
  async exportPolicyDataAndQuit(policyDataPath) {
    try {
      await this.progressService.withProgress({
        location: ProgressLocation.Notification,
        title: `Exporting policy data to ${policyDataPath}`
      }, async (_progress) => {
        this.log("Export started. Waiting for configurations to load.");
        await this.extensionService.whenInstalledExtensionsRegistered();
        await this.configurationService.whenRemoteConfigurationLoaded();
        this.log("Extensions and configuration loaded.");
        const configurationRegistry = Registry.as(Extensions.Configuration);
        const configurationProperties = {
          ...configurationRegistry.getExcludedConfigurationProperties(),
          ...configurationRegistry.getConfigurationProperties()
        };
        const policyData = {
          categories: Object.values(PolicyCategory).map((category) => ({
            key: category,
            name: PolicyCategoryData[category].name
          })),
          policies: []
        };
        for (const [key, schema] of Object.entries(configurationProperties)) {
          if (schema.policy?.localization) {
            policyData.policies.push({
              key,
              name: schema.policy.name,
              category: schema.policy.category,
              minimumVersion: schema.policy.minimumVersion,
              localization: {
                description: schema.policy.localization.description,
                enumDescriptions: schema.policy.localization.enumDescriptions
              },
              type: schema.type,
              default: schema.default,
              enum: schema.enum,
              included: schema.included !== false
            });
          }
        }
        this.log(`Discovered ${policyData.policies.length} policies to export.`);
        const distroProduct = await this.getDistroProductJson();
        const extensionPolicies = distroProduct["extensionConfigurationPolicy"];
        const productReferencesByPolicyName = /* @__PURE__ */ new Map();
        if (extensionPolicies) {
          const existingKeys = new Set(policyData.policies.map((p) => p.key));
          let added = 0;
          let referenced = 0;
          for (const [key, entry] of Object.entries(extensionPolicies)) {
            if (existingKeys.has(key)) {
              continue;
            }
            if (hasKey(entry, { policyReference: true })) {
              const ownerName = entry.policyReference?.name;
              if (!ownerName) {
                throw new Error(`Extension policy reference '${key}' is missing required 'policyReference.name' field.`);
              }
              const list = productReferencesByPolicyName.get(ownerName) ?? [];
              list.push(key);
              productReferencesByPolicyName.set(ownerName, list);
              referenced++;
              continue;
            }
            if (!entry.name || !entry.category || !entry.description) {
              throw new Error(`Extension policy '${key}' is missing required 'name', 'category', or 'description' field.`);
            }
            policyData.policies.push({
              key,
              name: entry.name,
              category: entry.category,
              minimumVersion: entry.minimumVersion,
              localization: {
                description: { key, value: entry.description }
              },
              type: "boolean",
              default: true,
              included: true
            });
            added++;
          }
          this.log(`Merged ${added} extension configuration policies (${referenced} references).`);
        }
        const policyReferenceConfigurations = configurationRegistry.getPolicyReferenceConfigurations();
        const linkedProductReferenceNames = /* @__PURE__ */ new Set();
        let linkedReferences = 0;
        for (const policy of policyData.policies) {
          const references = new Set(policyReferenceConfigurations.get(policy.name) ?? []);
          const productReferences = productReferencesByPolicyName.get(policy.name);
          if (productReferences) {
            for (const productRefKey of productReferences) {
              references.add(productRefKey);
            }
            linkedProductReferenceNames.add(policy.name);
          }
          if (references.size > 0) {
            for (const referenceKey of references) {
              const referenceType = configurationProperties[referenceKey]?.type;
              if (referenceType !== void 0 && referenceType !== policy.type) {
                throw new Error(`Policy '${policy.name}': setting '${referenceKey}' (type '${referenceType}') declares a 'policyReference' to a policy of type '${policy.type}'. A 'policyReference' must match the owning setting's type.`);
              }
            }
            policy.referencedSettings = [...references].sort();
            linkedReferences += references.size;
          }
        }
        for (const policyName of productReferencesByPolicyName.keys()) {
          if (!linkedProductReferenceNames.has(policyName)) {
            throw new Error(`Extension policy reference to '${policyName}' has no owning policy. Ensure an in-code setting declares 'policy: { name: '${policyName}', ... }'.`);
          }
        }
        this.log(`Linked ${linkedReferences} referenced settings across ${policyData.policies.length} policies.`);
        const disclaimerComment = `/** THIS FILE IS AUTOMATICALLY GENERATED USING \`npm run export-policy-data\`. DO NOT MODIFY IT MANUALLY. **/`;
        const policyDataFileContent = `${disclaimerComment}
${JSON.stringify(policyData, null, 4)}
`;
        await this.fileService.writeFile(URI.file(policyDataPath), VSBuffer.fromString(policyDataFileContent));
        this.log(`Successfully exported ${policyData.policies.length} policies to ${policyDataPath}.`);
      });
      await this.nativeHostService.exit(0);
    } catch (error) {
      this.log("Failed to export policy", error);
      await this.nativeHostService.exit(1);
    }
  }
  /**
   * Reads the distro product.json for the 'stable' quality.
   * Checks DISTRO_PRODUCT_JSON env var (for testing),
   * then falls back to fetching from the GitHub API using GITHUB_TOKEN.
   */
  async getDistroProductJson() {
    const root = this.nativeEnvironmentService.appRoot;
    const envPath = process.env["DISTRO_PRODUCT_JSON"];
    if (envPath) {
      this.log(`Reading distro product.json from DISTRO_PRODUCT_JSON=${envPath}`);
      const content2 = (await this.fileService.readFile(URI.file(envPath))).value.toString();
      return JSON.parse(content2);
    }
    const packageJsonPath = join(root, "package.json");
    const packageJsonContent = (await this.fileService.readFile(URI.file(packageJsonPath))).value.toString();
    const packageJson = JSON.parse(packageJsonContent);
    const distroCommit = packageJson.distro;
    if (!distroCommit) {
      throw new Error(
        "No distro commit found in package.json. Use `npm run export-policy-data` which sets up the required environment."
      );
    }
    const token = process.env["GITHUB_TOKEN"];
    if (!token) {
      throw new Error(
        "GITHUB_TOKEN is required to fetch distro product.json. Use `npm run export-policy-data` which sets up the required environment."
      );
    }
    this.log(`Fetching distro product.json for commit ${distroCommit} from GitHub...`);
    const url = `https://api.github.com/repos/microsoft/vscode-distro/contents/mixin/stable/product.json?ref=${encodeURIComponent(distroCommit)}`;
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VSCode Build"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch distro product.json: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (data.encoding !== "base64") {
      throw new Error(`Unexpected encoding from GitHub API: ${data.encoding}`);
    }
    const content = VSBuffer.wrap(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0))).toString();
    return JSON.parse(content);
  }
};
PolicyExportContribution.ID = "workbench.contrib.policyExport";
PolicyExportContribution.DEFAULT_POLICY_EXPORT_PATH = "build/lib/policies/policyData.jsonc";
PolicyExportContribution = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IWorkbenchConfigurationService),
  __decorateParam(4, INativeHostService),
  __decorateParam(5, IProgressService),
  __decorateParam(6, ILogService)
], PolicyExportContribution);
registerWorkbenchContribution2(
  PolicyExportContribution.ID,
  PolicyExportContribution,
  WorkbenchPhase.Eventually
);
export {
  PolicyExportContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3BvbGljeUV4cG9ydC9lbGVjdHJvbi1icm93c2VyL3BvbGljeUV4cG9ydC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHByb2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvZWxlY3Ryb24tYnJvd3Nlci9nbG9iYWxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnksIFBvbGljeUNhdGVnb3J5RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBFeHBvcnRlZFBvbGljeURhdGFEdG8gfSBmcm9tICcuLi9jb21tb24vcG9saWN5RHRvLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuaW50ZXJmYWNlIEV4dGVuc2lvbkNvbmZpZ3VyYXRpb25Qb2xpY3lFbnRyeSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgY2F0ZWdvcnk6IHN0cmluZztcblx0cmVhZG9ubHkgbWluaW11bVZlcnNpb246IGAke251bWJlcn0uJHtudW1iZXJ9YDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIHJlZmVyZW5jZS1zaGFwZWQgZW50cnkgaW4gdGhlIGRpc3RybyBgZXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeWA6IHRoZSBleHRlbnNpb24gc2V0dGluZ1xuICogYXR0YWNoZXMgdG8gYSBwb2xpY3kgKm93bmVkKiBieSBhbiBpbi1jb2RlIHNldHRpbmcgKHdoaWNoIHByb3ZpZGVzIHRoZSBjYXRhbG9nIG1ldGFkYXRhIGFuZCB0aGVcbiAqIGB2YWx1ZWAgY2FsbGJhY2spIHZpYSBhIGBwb2xpY3lSZWZlcmVuY2VgIHBvaW50ZXIuXG4gKi9cbmludGVyZmFjZSBFeHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5UmVmZXJlbmNlRW50cnkge1xuXHRyZWFkb25seSBwb2xpY3lSZWZlcmVuY2U6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nIH07XG59XG5cbmV4cG9ydCBjbGFzcyBQb2xpY3lFeHBvcnRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5wb2xpY3lFeHBvcnQnO1xuXHRzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9QT0xJQ1lfRVhQT1JUX1BBVEggPSAnYnVpbGQvbGliL3BvbGljaWVzL3BvbGljeURhdGEuanNvbmMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gU2tpcCBmb3Igbm9uLWRldmVsb3BtZW50IGZsb3dzXG5cdFx0aWYgKHRoaXMubmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhUGF0aCA9IHRoaXMubmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLmV4cG9ydFBvbGljeURhdGE7XG5cdFx0aWYgKHBvbGljeURhdGFQYXRoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRQYXRoID0gam9pbih0aGlzLm5hdGl2ZUVudmlyb25tZW50U2VydmljZS5hcHBSb290LCBQb2xpY3lFeHBvcnRDb250cmlidXRpb24uREVGQVVMVF9QT0xJQ1lfRVhQT1JUX1BBVEgpO1xuXHRcdFx0dm9pZCB0aGlzLmV4cG9ydFBvbGljeURhdGFBbmRRdWl0KHBvbGljeURhdGFQYXRoID8gcG9saWN5RGF0YVBhdGggOiBkZWZhdWx0UGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2cobXNnOiBzdHJpbmcgfCB1bmRlZmluZWQsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbJHtQb2xpY3lFeHBvcnRDb250cmlidXRpb24uSUR9XWAsIG1zZywgLi4uYXJncyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV4cG9ydFBvbGljeURhdGFBbmRRdWl0KHBvbGljeURhdGFQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHR0aXRsZTogYEV4cG9ydGluZyBwb2xpY3kgZGF0YSB0byAke3BvbGljeURhdGFQYXRofWBcblx0XHRcdH0sIGFzeW5jIChfcHJvZ3Jlc3MpID0+IHtcblx0XHRcdFx0dGhpcy5sb2coJ0V4cG9ydCBzdGFydGVkLiBXYWl0aW5nIGZvciBjb25maWd1cmF0aW9ucyB0byBsb2FkLicpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uud2hlblJlbW90ZUNvbmZpZ3VyYXRpb25Mb2FkZWQoKTtcblxuXHRcdFx0XHR0aGlzLmxvZygnRXh0ZW5zaW9ucyBhbmQgY29uZmlndXJhdGlvbiBsb2FkZWQuJyk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0ge1xuXHRcdFx0XHRcdC4uLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCksXG5cdFx0XHRcdFx0Li4uY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcG9saWN5RGF0YTogRXhwb3J0ZWRQb2xpY3lEYXRhRHRvID0ge1xuXHRcdFx0XHRcdGNhdGVnb3JpZXM6IE9iamVjdC52YWx1ZXMoUG9saWN5Q2F0ZWdvcnkpLm1hcChjYXRlZ29yeSA9PiAoe1xuXHRcdFx0XHRcdFx0a2V5OiBjYXRlZ29yeSxcblx0XHRcdFx0XHRcdG5hbWU6IFBvbGljeUNhdGVnb3J5RGF0YVtjYXRlZ29yeV0ubmFtZVxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRwb2xpY2llczogW11cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHNjaGVtYV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlndXJhdGlvblByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHRoZSBsb2NhbGl6YXRpb24gcHJvcGVydHkgZm9yIG5vdyB0byByZW1haW4gYmFja3dhcmRzIGNvbXBhdGlibGUuXG5cdFx0XHRcdFx0aWYgKHNjaGVtYS5wb2xpY3k/LmxvY2FsaXphdGlvbikge1xuXHRcdFx0XHRcdFx0cG9saWN5RGF0YS5wb2xpY2llcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBzY2hlbWEucG9saWN5Lm5hbWUsXG5cdFx0XHRcdFx0XHRcdGNhdGVnb3J5OiBzY2hlbWEucG9saWN5LmNhdGVnb3J5LFxuXHRcdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogc2NoZW1hLnBvbGljeS5taW5pbXVtVmVyc2lvbixcblx0XHRcdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNjaGVtYS5wb2xpY3kubG9jYWxpemF0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IHNjaGVtYS5wb2xpY3kubG9jYWxpemF0aW9uLmVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHR5cGU6IHNjaGVtYS50eXBlLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBzY2hlbWEuZGVmYXVsdCxcblx0XHRcdFx0XHRcdFx0ZW51bTogc2NoZW1hLmVudW0sXG5cdFx0XHRcdFx0XHRcdGluY2x1ZGVkOiBzY2hlbWEuaW5jbHVkZWQgIT09IGZhbHNlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nKGBEaXNjb3ZlcmVkICR7cG9saWN5RGF0YS5wb2xpY2llcy5sZW5ndGh9IHBvbGljaWVzIHRvIGV4cG9ydC5gKTtcblxuXHRcdFx0XHQvLyBNZXJnZSBleHRlbnNpb24gY29uZmlndXJhdGlvbiBwb2xpY2llcyBmcm9tIHRoZSBkaXN0cm8ncyBwcm9kdWN0Lmpzb24uXG5cdFx0XHRcdC8vIENoZWNrcyBESVNUUk9fUFJPRFVDVF9KU09OIGVudiB2YXIgKGZvciB0ZXN0aW5nKSxcblx0XHRcdFx0Ly8gdGhlbiBmYWxscyBiYWNrIHRvIGZldGNoaW5nIGZyb20gR2l0SHViIEFQSSB3aXRoIEdJVEhVQl9UT0tFTi5cblx0XHRcdFx0Y29uc3QgZGlzdHJvUHJvZHVjdCA9IGF3YWl0IHRoaXMuZ2V0RGlzdHJvUHJvZHVjdEpzb24oKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uUG9saWNpZXMgPSBkaXN0cm9Qcm9kdWN0WydleHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5J10gYXMgUmVjb3JkPHN0cmluZywgRXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeUVudHJ5IHwgRXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeVJlZmVyZW5jZUVudHJ5PiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gUmVmZXJlbmNlLXNoYXBlZCBwcm9kdWN0IGVudHJpZXMgKGV4dGVuc2lvbiBzZXR0aW5ncyBhdHRhY2hpbmcgdG8gYW4gaW4tY29kZS1vd25lZFxuXHRcdFx0XHQvLyBwb2xpY3kpLCBjb2xsZWN0ZWQgYnkgb3duaW5nIHBvbGljeSBuYW1lIHNvIHRoZXkgY2FuIGJlIGxpbmtlZCBiZWxvdy5cblx0XHRcdFx0Y29uc3QgcHJvZHVjdFJlZmVyZW5jZXNCeVBvbGljeU5hbWUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdFx0XHRcdGlmIChleHRlbnNpb25Qb2xpY2llcykge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nS2V5cyA9IG5ldyBTZXQocG9saWN5RGF0YS5wb2xpY2llcy5tYXAocCA9PiBwLmtleSkpO1xuXHRcdFx0XHRcdGxldCBhZGRlZCA9IDA7XG5cdFx0XHRcdFx0bGV0IHJlZmVyZW5jZWQgPSAwO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKGV4dGVuc2lvblBvbGljaWVzKSkge1xuXHRcdFx0XHRcdFx0aWYgKGV4aXN0aW5nS2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIEEgcmVmZXJlbmNlIGVudHJ5IGNhcnJpZXMgYSBgcG9saWN5UmVmZXJlbmNlYCBwb2ludGVyOyB0aGUgb3duZXIgXHUyMDE0IGFuZCBpdHNcblx0XHRcdFx0XHRcdC8vIGB2YWx1ZWAgY2FsbGJhY2sgXHUyMDE0IGlzIGRlY2xhcmVkIGJ5IGFuIGluLWNvZGUgc2V0dGluZy4gTGluayBpdCBiZWxvdyBpbnN0ZWFkXG5cdFx0XHRcdFx0XHQvLyBvZiBtZXJnaW5nIGl0IGFzIGFuIG93bmVyLlxuXHRcdFx0XHRcdFx0aWYgKGhhc0tleShlbnRyeSwgeyBwb2xpY3lSZWZlcmVuY2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3duZXJOYW1lID0gZW50cnkucG9saWN5UmVmZXJlbmNlPy5uYW1lO1xuXHRcdFx0XHRcdFx0XHRpZiAoIW93bmVyTmFtZSkge1xuXHRcdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXh0ZW5zaW9uIHBvbGljeSByZWZlcmVuY2UgJyR7a2V5fScgaXMgbWlzc2luZyByZXF1aXJlZCAncG9saWN5UmVmZXJlbmNlLm5hbWUnIGZpZWxkLmApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpc3QgPSBwcm9kdWN0UmVmZXJlbmNlc0J5UG9saWN5TmFtZS5nZXQob3duZXJOYW1lKSA/PyBbXTtcblx0XHRcdFx0XHRcdFx0bGlzdC5wdXNoKGtleSk7XG5cdFx0XHRcdFx0XHRcdHByb2R1Y3RSZWZlcmVuY2VzQnlQb2xpY3lOYW1lLnNldChvd25lck5hbWUsIGxpc3QpO1xuXHRcdFx0XHRcdFx0XHRyZWZlcmVuY2VkKys7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gT3duZXIgKFwicGFyZW50XCIpIGVudHJ5OiBmdWxsIGNhdGFsb2cgbWV0YWRhdGEgaXMgcmVxdWlyZWQuXG5cdFx0XHRcdFx0XHRpZiAoIWVudHJ5Lm5hbWUgfHwgIWVudHJ5LmNhdGVnb3J5IHx8ICFlbnRyeS5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4dGVuc2lvbiBwb2xpY3kgJyR7a2V5fScgaXMgbWlzc2luZyByZXF1aXJlZCAnbmFtZScsICdjYXRlZ29yeScsIG9yICdkZXNjcmlwdGlvbicgZmllbGQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwb2xpY3lEYXRhLnBvbGljaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRrZXksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGVudHJ5Lm5hbWUsXG5cdFx0XHRcdFx0XHRcdGNhdGVnb3J5OiBlbnRyeS5jYXRlZ29yeSxcblx0XHRcdFx0XHRcdFx0bWluaW11bVZlcnNpb246IGVudHJ5Lm1pbmltdW1WZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogeyBrZXksIHZhbHVlOiBlbnRyeS5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGluY2x1ZGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRhZGRlZCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmxvZyhgTWVyZ2VkICR7YWRkZWR9IGV4dGVuc2lvbiBjb25maWd1cmF0aW9uIHBvbGljaWVzICgke3JlZmVyZW5jZWR9IHJlZmVyZW5jZXMpLmApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTGluayBwb2xpY3lSZWZlcmVuY2Ugc2V0dGluZ3MgYW5kIGVuZm9yY2UgdHlwZSBtYXRjaCAoc2FtZSB2YWx1ZSBpcyBhcHBsaWVkIHZlcmJhdGltKS5cblx0XHRcdFx0Ly8gUmVmZXJlbmNlcyBjb21lIGZyb20gYm90aCBpbi1jb2RlIHNldHRpbmdzIChgZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnNgKSBhbmRcblx0XHRcdFx0Ly8gcmVmZXJlbmNlLXNoYXBlZCBkaXN0cm8gcHJvZHVjdCBlbnRyaWVzIGNvbGxlY3RlZCBhYm92ZS5cblx0XHRcdFx0Y29uc3QgcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTtcblx0XHRcdFx0Y29uc3QgbGlua2VkUHJvZHVjdFJlZmVyZW5jZU5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdGxldCBsaW5rZWRSZWZlcmVuY2VzID0gMDtcblx0XHRcdFx0Zm9yIChjb25zdCBwb2xpY3kgb2YgcG9saWN5RGF0YS5wb2xpY2llcykge1xuXHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZXMgPSBuZXcgU2V0PHN0cmluZz4ocG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMuZ2V0KHBvbGljeS5uYW1lKSA/PyBbXSk7XG5cdFx0XHRcdFx0Y29uc3QgcHJvZHVjdFJlZmVyZW5jZXMgPSBwcm9kdWN0UmVmZXJlbmNlc0J5UG9saWN5TmFtZS5nZXQocG9saWN5Lm5hbWUpO1xuXHRcdFx0XHRcdGlmIChwcm9kdWN0UmVmZXJlbmNlcykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBwcm9kdWN0UmVmS2V5IG9mIHByb2R1Y3RSZWZlcmVuY2VzKSB7XG5cdFx0XHRcdFx0XHRcdHJlZmVyZW5jZXMuYWRkKHByb2R1Y3RSZWZLZXkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bGlua2VkUHJvZHVjdFJlZmVyZW5jZU5hbWVzLmFkZChwb2xpY3kubmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChyZWZlcmVuY2VzLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZUtleSBvZiByZWZlcmVuY2VzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZVR5cGUgPSBjb25maWd1cmF0aW9uUHJvcGVydGllc1tyZWZlcmVuY2VLZXldPy50eXBlO1xuXHRcdFx0XHRcdFx0XHQvLyBFeHRlbnNpb24tY29udHJpYnV0ZWQgcmVmZXJlbmNlIHNldHRpbmdzIGFyZSBub3QgcmVnaXN0ZXJlZCBpbiB0aGVcblx0XHRcdFx0XHRcdFx0Ly8gaGVhZGxlc3MgZXhwb3J0IHByb2Nlc3MsIHNvIHRoZWlyIHR5cGUgY2Fubm90IGJlIHZhbGlkYXRlZCBoZXJlOyBvbmx5XG5cdFx0XHRcdFx0XHRcdC8vIGVuZm9yY2UgdGhlIHR5cGUgbWF0Y2ggZm9yIHNldHRpbmdzIHByZXNlbnQgaW4gdGhlIHJlZ2lzdHJ5LlxuXHRcdFx0XHRcdFx0XHRpZiAocmVmZXJlbmNlVHlwZSAhPT0gdW5kZWZpbmVkICYmIHJlZmVyZW5jZVR5cGUgIT09IHBvbGljeS50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQb2xpY3kgJyR7cG9saWN5Lm5hbWV9Jzogc2V0dGluZyAnJHtyZWZlcmVuY2VLZXl9JyAodHlwZSAnJHtyZWZlcmVuY2VUeXBlfScpIGRlY2xhcmVzIGEgJ3BvbGljeVJlZmVyZW5jZScgdG8gYSBwb2xpY3kgb2YgdHlwZSAnJHtwb2xpY3kudHlwZX0nLiBBICdwb2xpY3lSZWZlcmVuY2UnIG11c3QgbWF0Y2ggdGhlIG93bmluZyBzZXR0aW5nJ3MgdHlwZS5gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cG9saWN5LnJlZmVyZW5jZWRTZXR0aW5ncyA9IFsuLi5yZWZlcmVuY2VzXS5zb3J0KCk7XG5cdFx0XHRcdFx0XHRsaW5rZWRSZWZlcmVuY2VzICs9IHJlZmVyZW5jZXMuc2l6ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQSByZWZlcmVuY2UgbXVzdCBwb2ludCBhdCBhbiBvd25lci4gQW4gdW5tYXRjaGVkIHByb2R1Y3QgcmVmZXJlbmNlIG1lYW5zIHRoZVxuXHRcdFx0XHQvLyBpbi1jb2RlIG93bmVyIHdhcyBub3QgbG9hZGVkL3JlZ2lzdGVyZWQgXHUyMDE0IHN1cmZhY2UgaXQgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcuXG5cdFx0XHRcdGZvciAoY29uc3QgcG9saWN5TmFtZSBvZiBwcm9kdWN0UmVmZXJlbmNlc0J5UG9saWN5TmFtZS5rZXlzKCkpIHtcblx0XHRcdFx0XHRpZiAoIWxpbmtlZFByb2R1Y3RSZWZlcmVuY2VOYW1lcy5oYXMocG9saWN5TmFtZSkpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXh0ZW5zaW9uIHBvbGljeSByZWZlcmVuY2UgdG8gJyR7cG9saWN5TmFtZX0nIGhhcyBubyBvd25pbmcgcG9saWN5LiBFbnN1cmUgYW4gaW4tY29kZSBzZXR0aW5nIGRlY2xhcmVzICdwb2xpY3k6IHsgbmFtZTogJyR7cG9saWN5TmFtZX0nLCAuLi4gfScuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nKGBMaW5rZWQgJHtsaW5rZWRSZWZlcmVuY2VzfSByZWZlcmVuY2VkIHNldHRpbmdzIGFjcm9zcyAke3BvbGljeURhdGEucG9saWNpZXMubGVuZ3RofSBwb2xpY2llcy5gKTtcblxuXHRcdFx0XHRjb25zdCBkaXNjbGFpbWVyQ29tbWVudCA9IGAvKiogVEhJUyBGSUxFIElTIEFVVE9NQVRJQ0FMTFkgR0VORVJBVEVEIFVTSU5HIFxcYG5wbSBydW4gZXhwb3J0LXBvbGljeS1kYXRhXFxgLiBETyBOT1QgTU9ESUZZIElUIE1BTlVBTExZLiAqKi9gO1xuXHRcdFx0XHRjb25zdCBwb2xpY3lEYXRhRmlsZUNvbnRlbnQgPSBgJHtkaXNjbGFpbWVyQ29tbWVudH1cXG4ke0pTT04uc3RyaW5naWZ5KHBvbGljeURhdGEsIG51bGwsIDQpfVxcbmA7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKHBvbGljeURhdGFQYXRoKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhwb2xpY3lEYXRhRmlsZUNvbnRlbnQpKTtcblx0XHRcdFx0dGhpcy5sb2coYFN1Y2Nlc3NmdWxseSBleHBvcnRlZCAke3BvbGljeURhdGEucG9saWNpZXMubGVuZ3RofSBwb2xpY2llcyB0byAke3BvbGljeURhdGFQYXRofS5gKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmV4aXQoMCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nKCdGYWlsZWQgdG8gZXhwb3J0IHBvbGljeScsIGVycm9yKTtcblx0XHRcdGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuZXhpdCgxKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgdGhlIGRpc3RybyBwcm9kdWN0Lmpzb24gZm9yIHRoZSAnc3RhYmxlJyBxdWFsaXR5LlxuXHQgKiBDaGVja3MgRElTVFJPX1BST0RVQ1RfSlNPTiBlbnYgdmFyIChmb3IgdGVzdGluZyksXG5cdCAqIHRoZW4gZmFsbHMgYmFjayB0byBmZXRjaGluZyBmcm9tIHRoZSBHaXRIdWIgQVBJIHVzaW5nIEdJVEhVQl9UT0tFTi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZ2V0RGlzdHJvUHJvZHVjdEpzb24oKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4ge1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLm5hdGl2ZUVudmlyb25tZW50U2VydmljZS5hcHBSb290O1xuXG5cdFx0Ly8gMS4gRElTVFJPX1BST0RVQ1RfSlNPTiBlbnYgdmFyIChmb3IgdGVzdGluZylcblx0XHRjb25zdCBlbnZQYXRoID0gcHJvY2Vzcy5lbnZbJ0RJU1RST19QUk9EVUNUX0pTT04nXTtcblx0XHRpZiAoZW52UGF0aCkge1xuXHRcdFx0dGhpcy5sb2coYFJlYWRpbmcgZGlzdHJvIHByb2R1Y3QuanNvbiBmcm9tIERJU1RST19QUk9EVUNUX0pTT049JHtlbnZQYXRofWApO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5maWxlKGVudlBhdGgpKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdC8vIDIuIEdpdEh1YiBBUEkgd2l0aCBHSVRIVUJfVE9LRU5cblx0XHRjb25zdCBwYWNrYWdlSnNvblBhdGggPSBqb2luKHJvb3QsICdwYWNrYWdlLmpzb24nKTtcblx0XHRjb25zdCBwYWNrYWdlSnNvbkNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShVUkkuZmlsZShwYWNrYWdlSnNvblBhdGgpKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYWNrYWdlSnNvbiA9IEpTT04ucGFyc2UocGFja2FnZUpzb25Db250ZW50KTtcblx0XHRjb25zdCBkaXN0cm9Db21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHBhY2thZ2VKc29uLmRpc3RybztcblxuXHRcdGlmICghZGlzdHJvQ29tbWl0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdCdObyBkaXN0cm8gY29tbWl0IGZvdW5kIGluIHBhY2thZ2UuanNvbi4gJyArXG5cdFx0XHRcdCdVc2UgYG5wbSBydW4gZXhwb3J0LXBvbGljeS1kYXRhYCB3aGljaCBzZXRzIHVwIHRoZSByZXF1aXJlZCBlbnZpcm9ubWVudC4nXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuID0gcHJvY2Vzcy5lbnZbJ0dJVEhVQl9UT0tFTiddO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0J0dJVEhVQl9UT0tFTiBpcyByZXF1aXJlZCB0byBmZXRjaCBkaXN0cm8gcHJvZHVjdC5qc29uLiAnICtcblx0XHRcdFx0J1VzZSBgbnBtIHJ1biBleHBvcnQtcG9saWN5LWRhdGFgIHdoaWNoIHNldHMgdXAgdGhlIHJlcXVpcmVkIGVudmlyb25tZW50Lidcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2coYEZldGNoaW5nIGRpc3RybyBwcm9kdWN0Lmpzb24gZm9yIGNvbW1pdCAke2Rpc3Ryb0NvbW1pdH0gZnJvbSBHaXRIdWIuLi5gKTtcblx0XHRjb25zdCB1cmwgPSBgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9taWNyb3NvZnQvdnNjb2RlLWRpc3Ryby9jb250ZW50cy9taXhpbi9zdGFibGUvcHJvZHVjdC5qc29uP3JlZj0ke2VuY29kZVVSSUNvbXBvbmVudChkaXN0cm9Db21taXQpfWA7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb24nLFxuXHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHt0b2tlbn1gLFxuXHRcdFx0XHQnWC1HaXRIdWItQXBpLVZlcnNpb24nOiAnMjAyMi0xMS0yOCcsXG5cdFx0XHRcdCdVc2VyLUFnZW50JzogJ1ZTQ29kZSBCdWlsZCdcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGRpc3RybyBwcm9kdWN0Lmpzb246ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyB7IGNvbnRlbnQ6IHN0cmluZzsgZW5jb2Rpbmc6IHN0cmluZyB9O1xuXHRcdGlmIChkYXRhLmVuY29kaW5nICE9PSAnYmFzZTY0Jykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGVuY29kaW5nIGZyb20gR2l0SHViIEFQSTogJHtkYXRhLmVuY29kaW5nfWApO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZW50ID0gVlNCdWZmZXIud3JhcChVaW50OEFycmF5LmZyb20oYXRvYihkYXRhLmNvbnRlbnQpLCBjID0+IGMuY2hhckNvZGVBdCgwKSkpLnRvU3RyaW5nKCk7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UoY29udGVudCk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHRQb2xpY3lFeHBvcnRDb250cmlidXRpb24uSUQsXG5cdFBvbGljeUV4cG9ydENvbnRyaWJ1dGlvbixcblx0V29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSxcbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQTBDO0FBQ25ELFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBRW5ELFNBQVMsWUFBWTtBQUNyQixTQUFTLGNBQWM7QUFrQmhCLElBQU0sMkJBQU4sY0FBdUMsV0FBNkM7QUFBQSxFQUkxRixZQUM2QywwQkFDUixrQkFDTCxhQUNrQixzQkFDWixtQkFDRixpQkFDTCxZQUM3QjtBQUNELFVBQU07QUFSc0M7QUFDUjtBQUNMO0FBQ2tCO0FBQ1o7QUFDRjtBQUNMO0FBSzlCLFFBQUksS0FBSyx5QkFBeUIsU0FBUztBQUMxQztBQUFBLElBQ0Q7QUFFQSxVQUFNLGlCQUFpQixLQUFLLHlCQUF5QjtBQUNyRCxRQUFJLG1CQUFtQixRQUFXO0FBQ2pDLFlBQU0sY0FBYyxLQUFLLEtBQUsseUJBQXlCLFNBQVMseUJBQXlCLDBCQUEwQjtBQUNuSCxXQUFLLEtBQUssd0JBQXdCLGlCQUFpQixpQkFBaUIsV0FBVztBQUFB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
