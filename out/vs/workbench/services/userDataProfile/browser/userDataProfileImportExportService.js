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
import "./media/userDataProfileView.css";
import { localize } from "../../../../nls.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter } from "../../../../base/common/event.js";
import { IUserDataProfileImportExportService, PROFILE_FILTER, PROFILE_EXTENSION, IUserDataProfileService, PROFILES_CATEGORY, IUserDataProfileManagementService, PROFILE_URL_AUTHORITY, toUserDataProfileUri, isProfileURL, PROFILE_URL_AUTHORITY_PREFIX } from "../common/userDataProfile.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { URI } from "../../../../base/common/uri.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { SettingsResource, SettingsResourceTreeItem } from "./settingsResource.js";
import { KeybindingsResource, KeybindingsResourceTreeItem } from "./keybindingsResource.js";
import { SnippetsResource, SnippetsResourceTreeItem } from "./snippetsResource.js";
import { TasksResource, TasksResourceTreeItem } from "./tasksResource.js";
import { ExtensionsResource, ExtensionsResourceExportTreeItem, ExtensionsResourceTreeItem } from "./extensionsResource.js";
import { GlobalStateResource, GlobalStateResourceExportTreeItem, GlobalStateResourceTreeItem } from "./globalStateResource.js";
import { InMemoryFileSystemProvider } from "../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { joinPath } from "../../../../base/common/resources.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { Schemas } from "../../../../base/common/network.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import Severity from "../../../../base/common/severity.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { asText, IRequestService } from "../../../../platform/request/common/request.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { isUndefined } from "../../../../base/common/types.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
function isUserDataProfileTemplate(thing) {
  const candidate = thing;
  return !!(candidate && typeof candidate === "object" && (candidate.name && typeof candidate.name === "string") && (isUndefined(candidate.icon) || typeof candidate.icon === "string") && (isUndefined(candidate.settings) || typeof candidate.settings === "string") && (isUndefined(candidate.globalState) || typeof candidate.globalState === "string") && (isUndefined(candidate.extensions) || typeof candidate.extensions === "string"));
}
let UserDataProfileImportExportService = class extends Disposable {
  constructor(instantiationService, userDataProfileService, userDataProfileManagementService, userDataProfilesService, extensionService, quickInputService, progressService, dialogService, clipboardService, openerService, requestService, productService, uriIdentityService) {
    super();
    this.instantiationService = instantiationService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfilesService = userDataProfilesService;
    this.extensionService = extensionService;
    this.quickInputService = quickInputService;
    this.progressService = progressService;
    this.dialogService = dialogService;
    this.clipboardService = clipboardService;
    this.openerService = openerService;
    this.requestService = requestService;
    this.productService = productService;
    this.uriIdentityService = uriIdentityService;
    this.profileContentHandlers = /* @__PURE__ */ new Map();
    this.registerProfileContentHandler(Schemas.file, this.fileUserDataProfileContentHandler = instantiationService.createInstance(FileUserDataProfileContentHandler));
  }
  registerProfileContentHandler(id, profileContentHandler) {
    if (this.profileContentHandlers.has(id)) {
      throw new Error(`Profile content handler with id '${id}' already registered.`);
    }
    this.profileContentHandlers.set(id, profileContentHandler);
    return toDisposable(() => this.unregisterProfileContentHandler(id));
  }
  unregisterProfileContentHandler(id) {
    this.profileContentHandlers.delete(id);
  }
  async createFromProfile(from, options, token) {
    const disposables = new DisposableStore();
    let creationPromise;
    disposables.add(token.onCancellationRequested(() => creationPromise.cancel()));
    let profile;
    return this.progressService.withProgress({
      location: ProgressLocation.Notification,
      delay: 500,
      sticky: true,
      cancellable: true
    }, async (progress) => {
      const reportProgress = (message) => progress.report({ message: localize("create from profile", "Create Profile: {0}", message) });
      creationPromise = createCancelablePromise(async (token2) => {
        const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, from, { ...options?.resourceTypeFlags, extensions: false }));
        const profileTemplate = await userDataProfilesExportState.getProfileTemplate(options.name ?? from.name, options?.icon);
        profile = await this.getProfileToImport({ ...profileTemplate, name: options.name ?? profileTemplate.name }, !!options.transient, options);
        if (!profile) {
          return;
        }
        if (token2.isCancellationRequested) {
          return;
        }
        await this.applyProfileTemplate(profileTemplate, profile, options, reportProgress, token2);
      });
      try {
        await creationPromise;
        if (profile && (options?.resourceTypeFlags?.extensions ?? true)) {
          reportProgress(localize("installing extensions", "Installing Extensions..."));
          await this.instantiationService.createInstance(ExtensionsResource).copy(from, profile, false);
        }
      } catch (error) {
        if (profile) {
          await this.userDataProfilesService.removeProfile(profile);
          profile = void 0;
        }
      }
      return profile;
    }, () => creationPromise.cancel()).finally(() => disposables.dispose());
  }
  async createProfileFromTemplate(profileTemplate, options, token) {
    const disposables = new DisposableStore();
    let creationPromise;
    disposables.add(token.onCancellationRequested(() => creationPromise.cancel()));
    let profile;
    return this.progressService.withProgress({
      location: ProgressLocation.Notification,
      delay: 500,
      sticky: true,
      cancellable: true
    }, async (progress) => {
      const reportProgress = (message) => progress.report({ message: localize("create from profile", "Create Profile: {0}", message) });
      creationPromise = createCancelablePromise(async (token2) => {
        profile = await this.getProfileToImport({ ...profileTemplate, name: options.name ?? profileTemplate.name }, !!options.transient, options);
        if (!profile) {
          return;
        }
        if (token2.isCancellationRequested) {
          return;
        }
        await this.applyProfileTemplate(profileTemplate, profile, options, reportProgress, token2);
      });
      try {
        await creationPromise;
      } catch (error) {
        if (profile) {
          await this.userDataProfilesService.removeProfile(profile);
          profile = void 0;
        }
      }
      return profile;
    }, () => creationPromise.cancel()).finally(() => disposables.dispose());
  }
  async applyProfileTemplate(profileTemplate, profile, options, reportProgress, token) {
    if (profileTemplate.settings && (options.resourceTypeFlags?.settings ?? true) && !profile.useDefaultFlags?.settings) {
      reportProgress(localize("creating settings", "Creating Settings..."));
      await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.keybindings && (options.resourceTypeFlags?.keybindings ?? true) && !profile.useDefaultFlags?.keybindings) {
      reportProgress(localize("create keybindings", "Creating Keyboard Shortcuts..."));
      await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.tasks && (options.resourceTypeFlags?.tasks ?? true) && !profile.useDefaultFlags?.tasks) {
      reportProgress(localize("create tasks", "Creating Tasks..."));
      await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.snippets && (options.resourceTypeFlags?.snippets ?? true) && !profile.useDefaultFlags?.snippets) {
      reportProgress(localize("create snippets", "Creating Snippets..."));
      await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.globalState && !profile.useDefaultFlags?.globalState) {
      reportProgress(localize("applying global state", "Applying UI State..."));
      await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.extensions && (options.resourceTypeFlags?.extensions ?? true) && !profile.useDefaultFlags?.extensions) {
      reportProgress(localize("installing extensions", "Installing Extensions..."));
      await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile, reportProgress, token);
    }
  }
  async exportProfile(profile, exportFlags) {
    const disposables = new DisposableStore();
    try {
      const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, profile, exportFlags));
      await this.doExportProfile(userDataProfilesExportState, ProgressLocation.Notification);
    } finally {
      disposables.dispose();
    }
  }
  async createTroubleshootProfile() {
    const userDataProfilesExportState = this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile, void 0);
    try {
      const profileTemplate = await userDataProfilesExportState.getProfileTemplate(localize("troubleshoot issue", "Troubleshoot Issue"), void 0);
      await this.progressService.withProgress({
        location: ProgressLocation.Notification,
        delay: 1e3,
        sticky: true
      }, async (progress) => {
        const reportProgress = (message) => progress.report({ message: localize("troubleshoot profile progress", "Setting up Troubleshoot Profile: {0}", message) });
        const profile = await this.doCreateProfile(profileTemplate, true, false, { useDefaultFlags: this.userDataProfileService.currentProfile.useDefaultFlags }, reportProgress);
        if (profile) {
          reportProgress(localize("progress extensions", "Applying Extensions..."));
          await this.instantiationService.createInstance(ExtensionsResource).copy(this.userDataProfileService.currentProfile, profile, true);
          reportProgress(localize("switching profile", "Switching Profile..."));
          await this.userDataProfileManagementService.switchProfile(profile);
        }
      });
    } finally {
      userDataProfilesExportState.dispose();
    }
  }
  async doExportProfile(userDataProfilesExportState, location) {
    const profile = await userDataProfilesExportState.getProfileToExport();
    if (!profile) {
      return;
    }
    const disposables = new DisposableStore();
    try {
      await this.progressService.withProgress({
        location,
        title: localize("profiles.exporting", "{0}: Exporting...", PROFILES_CATEGORY.value)
      }, async (progress) => {
        const id = await this.pickProfileContentHandler(profile.name);
        if (!id) {
          return;
        }
        const profileContentHandler = this.profileContentHandlers.get(id);
        if (!profileContentHandler) {
          return;
        }
        const saveResult = await profileContentHandler.saveProfile(profile.name.replace("/", "-"), JSON.stringify(profile), CancellationToken.None);
        if (!saveResult) {
          return;
        }
        const message = localize("export success", "Profile '{0}' was exported successfully.", profile.name);
        if (profileContentHandler.extensionId) {
          const buttons = [];
          const link = this.productService.webUrl ? `${this.productService.webUrl}/${PROFILE_URL_AUTHORITY}/${id}/${saveResult.id}` : toUserDataProfileUri(`/${id}/${saveResult.id}`, this.productService).toString();
          buttons.push({
            label: localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy Link"),
            run: () => this.clipboardService.writeText(link)
          });
          if (this.productService.webUrl) {
            buttons.push({
              label: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open Link"),
              run: async () => {
                await this.openerService.open(link);
              }
            });
          } else {
            buttons.push({
              label: localize({ key: "open in", comment: ["&& denotes a mnemonic"] }, "&&Open in {0}", profileContentHandler.name),
              run: async () => {
                await this.openerService.open(saveResult.link.toString());
              }
            });
          }
          await this.dialogService.prompt({
            type: Severity.Info,
            message,
            buttons,
            cancelButton: localize("close", "Close")
          });
        } else {
          await this.dialogService.info(message);
        }
      });
    } finally {
      disposables.dispose();
    }
  }
  async resolveProfileTemplate(uri, options) {
    const profileContent = await this.resolveProfileContent(uri);
    if (profileContent === null) {
      return null;
    }
    let profileTemplate;
    try {
      profileTemplate = JSON.parse(profileContent);
    } catch (error) {
      throw new Error(localize("invalid profile content", "This profile is not valid."));
    }
    if (!isUserDataProfileTemplate(profileTemplate)) {
      return null;
    }
    if (options?.name) {
      profileTemplate.name = options.name;
    }
    if (options?.icon) {
      profileTemplate.icon = options.icon;
    }
    if (options?.resourceTypeFlags?.settings === false) {
      profileTemplate.settings = void 0;
    }
    if (options?.resourceTypeFlags?.keybindings === false) {
      profileTemplate.keybindings = void 0;
    }
    if (options?.resourceTypeFlags?.snippets === false) {
      profileTemplate.snippets = void 0;
    }
    if (options?.resourceTypeFlags?.tasks === false) {
      profileTemplate.tasks = void 0;
    }
    if (options?.resourceTypeFlags?.globalState === false) {
      profileTemplate.globalState = void 0;
    }
    if (options?.resourceTypeFlags?.extensions === false) {
      profileTemplate.extensions = void 0;
    }
    return profileTemplate;
  }
  async doCreateProfile(profileTemplate, temporaryProfile, extensions, options, progress) {
    const profile = await this.getProfileToImport(profileTemplate, temporaryProfile, options);
    if (!profile) {
      return void 0;
    }
    if (profileTemplate.settings && !profile.useDefaultFlags?.settings) {
      progress(localize("progress settings", "Applying Settings..."));
      await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
    }
    if (profileTemplate.keybindings && !profile.useDefaultFlags?.keybindings) {
      progress(localize("progress keybindings", "Applying Keyboard Shortcuts..."));
      await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
    }
    if (profileTemplate.tasks && !profile.useDefaultFlags?.tasks) {
      progress(localize("progress tasks", "Applying Tasks..."));
      await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
    }
    if (profileTemplate.snippets && !profile.useDefaultFlags?.snippets) {
      progress(localize("progress snippets", "Applying Snippets..."));
      await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
    }
    if (profileTemplate.globalState && !profile.useDefaultFlags?.globalState) {
      progress(localize("progress global state", "Applying State..."));
      await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
    }
    if (profileTemplate.extensions && extensions && !profile.useDefaultFlags?.extensions) {
      progress(localize("progress extensions", "Applying Extensions..."));
      await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile);
    }
    return profile;
  }
  async resolveProfileContent(resource) {
    if (await this.fileUserDataProfileContentHandler.canHandle(resource)) {
      return this.fileUserDataProfileContentHandler.readProfile(resource, CancellationToken.None);
    }
    if (isProfileURL(resource)) {
      let handlerId, idOrUri;
      if (resource.authority === PROFILE_URL_AUTHORITY) {
        idOrUri = this.uriIdentityService.extUri.basename(resource);
        handlerId = this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(resource));
      } else {
        handlerId = resource.authority.substring(PROFILE_URL_AUTHORITY_PREFIX.length);
        idOrUri = URI.parse(resource.path.substring(1));
      }
      await this.extensionService.activateByEvent(`onProfile:${handlerId}`);
      const profileContentHandler = this.profileContentHandlers.get(handlerId);
      if (profileContentHandler) {
        return profileContentHandler.readProfile(idOrUri, CancellationToken.None);
      }
    }
    await this.extensionService.activateByEvent("onProfile");
    for (const profileContentHandler of this.profileContentHandlers.values()) {
      const content = await profileContentHandler.readProfile(resource, CancellationToken.None);
      if (content !== null) {
        return content;
      }
    }
    const context = await this.requestService.request({ type: "GET", url: resource.toString(true), callSite: "userDataProfileImportExportService.resolveContent" }, CancellationToken.None);
    if (context.res.statusCode === 200) {
      return await asText(context);
    } else {
      const message = await asText(context);
      throw new Error(`Failed to get profile from URL: ${resource.toString()}. Status code: ${context.res.statusCode}. Message: ${message}`);
    }
  }
  async pickProfileContentHandler(name) {
    await this.extensionService.activateByEvent("onProfile");
    if (this.profileContentHandlers.size === 1) {
      return this.profileContentHandlers.keys().next().value;
    }
    const options = [];
    for (const [id, profileContentHandler] of this.profileContentHandlers) {
      options.push({ id, label: profileContentHandler.name, description: profileContentHandler.description });
    }
    const result = await this.quickInputService.pick(
      options.reverse(),
      {
        title: localize("select profile content handler", "Export '{0}' profile as...", name),
        hideInput: true
      }
    );
    return result?.id;
  }
  async getProfileToImport(profileTemplate, temp, options) {
    const profileName = profileTemplate.name;
    const profile = this.userDataProfilesService.profiles.find((p) => p.name === profileName);
    if (profile) {
      if (temp) {
        return this.userDataProfilesService.createNamedProfile(`${profileName} ${this.getProfileNameIndex(profileName)}`, { ...options, transient: temp });
      }
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Info,
        message: localize("profile already exists", "Profile with name '{0}' already exists. Do you want to replace its contents?", profileName),
        primaryButton: localize({ key: "overwrite", comment: ["&& denotes a mnemonic"] }, "&&Replace")
      });
      if (!confirmed) {
        return void 0;
      }
      return profile.isDefault ? profile : this.userDataProfilesService.updateProfile(profile, options);
    } else {
      return this.userDataProfilesService.createNamedProfile(profileName, { ...options, transient: temp });
    }
  }
  getProfileNameIndex(name) {
    const nameRegEx = new RegExp(`${escapeRegExpCharacters(name)}\\s(\\d+)`);
    let nameIndex = 0;
    for (const profile of this.userDataProfilesService.profiles) {
      const matches = nameRegEx.exec(profile.name);
      const index = matches ? parseInt(matches[1]) : 0;
      nameIndex = index > nameIndex ? index : nameIndex;
    }
    return nameIndex + 1;
  }
};
UserDataProfileImportExportService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IUserDataProfileService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, IUserDataProfilesService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IClipboardService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IRequestService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IUriIdentityService)
], UserDataProfileImportExportService);
let FileUserDataProfileContentHandler = class {
  constructor(fileDialogService, uriIdentityService, fileService, productService, textFileService) {
    this.fileDialogService = fileDialogService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.productService = productService;
    this.textFileService = textFileService;
    this.name = localize("local", "Local");
    this.description = localize("file", "file");
  }
  async saveProfile(name, content, token) {
    const link = await this.fileDialogService.showSaveDialog({
      title: localize("export profile dialog", "Save Profile"),
      filters: PROFILE_FILTER,
      defaultUri: this.uriIdentityService.extUri.joinPath(await this.fileDialogService.defaultFilePath(), `${name}.${PROFILE_EXTENSION}`)
    });
    if (!link) {
      return null;
    }
    await this.textFileService.create([{ resource: link, value: content, options: { overwrite: true } }]);
    return { link, id: link.toString() };
  }
  async canHandle(uri) {
    return uri.scheme !== Schemas.http && uri.scheme !== Schemas.https && uri.scheme !== this.productService.urlProtocol && await this.fileService.canHandleResource(uri);
  }
  async readProfile(uri, token) {
    if (await this.canHandle(uri)) {
      return (await this.fileService.readFile(uri, void 0, token)).value.toString();
    }
    return null;
  }
  async selectProfile() {
    const profileLocation = await this.fileDialogService.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: false,
      filters: PROFILE_FILTER,
      title: localize("select profile", "Select Profile")
    });
    return profileLocation ? profileLocation[0] : null;
  }
};
FileUserDataProfileContentHandler = __decorateClass([
  __decorateParam(0, IFileDialogService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IProductService),
  __decorateParam(4, ITextFileService)
], FileUserDataProfileContentHandler);
const USER_DATA_PROFILE_EXPORT_SCHEME = "userdataprofileexport";
const USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME = "userdataprofileexportpreview";
let UserDataProfileImportExportState = class extends Disposable {
  constructor(quickInputService) {
    super();
    this.quickInputService = quickInputService;
    this._onDidChangeRoots = this._register(new Emitter());
    this.onDidChangeRoots = this._onDidChangeRoots.event;
    this.roots = [];
  }
  async getChildren(element) {
    if (element) {
      const children = await element.getChildren();
      if (children) {
        for (const child of children) {
          if (child.parent.checkbox && child.checkbox) {
            child.checkbox.isChecked = child.parent.checkbox.isChecked && child.checkbox.isChecked;
          }
        }
      }
      return children;
    } else {
      this.rootsPromise = void 0;
      this._onDidChangeRoots.fire();
      return this.getRoots();
    }
  }
  getRoots() {
    if (!this.rootsPromise) {
      this.rootsPromise = (async () => {
        this.roots = await this.fetchRoots();
        for (const root of this.roots) {
          const labelText = isMarkdownString(root.label.label) ? root.label.label.value : root.label.label;
          root.checkbox = {
            isChecked: !root.isFromDefaultProfile(),
            tooltip: localize("select", "Select {0}", labelText),
            accessibilityInformation: {
              label: localize("select", "Select {0}", labelText)
            }
          };
          if (root.isFromDefaultProfile()) {
            root.description = localize("from default", "From Default Profile");
          }
        }
        return this.roots;
      })();
    }
    return this.rootsPromise;
  }
  isEnabled(resourceType) {
    if (resourceType !== void 0) {
      return this.roots.some((root) => root.type === resourceType && this.isSelected(root));
    }
    return this.roots.some((root) => this.isSelected(root));
  }
  async getProfileTemplate(name, icon) {
    const roots = await this.getRoots();
    let settings;
    let keybindings;
    let tasks;
    let snippets;
    let extensions;
    let globalState;
    for (const root of roots) {
      if (!this.isSelected(root)) {
        continue;
      }
      if (root instanceof SettingsResourceTreeItem) {
        settings = await root.getContent();
      } else if (root instanceof KeybindingsResourceTreeItem) {
        keybindings = await root.getContent();
      } else if (root instanceof TasksResourceTreeItem) {
        tasks = await root.getContent();
      } else if (root instanceof SnippetsResourceTreeItem) {
        snippets = await root.getContent();
      } else if (root instanceof ExtensionsResourceTreeItem) {
        extensions = await root.getContent();
      } else if (root instanceof GlobalStateResourceTreeItem) {
        globalState = await root.getContent();
      }
    }
    return {
      name,
      icon,
      settings,
      keybindings,
      tasks,
      snippets,
      extensions,
      globalState
    };
  }
  isSelected(treeItem) {
    if (treeItem.checkbox) {
      return treeItem.checkbox.isChecked || !!treeItem.children?.some((child) => child.checkbox?.isChecked);
    }
    return true;
  }
};
UserDataProfileImportExportState = __decorateClass([
  __decorateParam(0, IQuickInputService)
], UserDataProfileImportExportState);
let UserDataProfileExportState = class extends UserDataProfileImportExportState {
  constructor(profile, exportFlags, quickInputService, fileService, instantiationService) {
    super(quickInputService);
    this.profile = profile;
    this.exportFlags = exportFlags;
    this.fileService = fileService;
    this.instantiationService = instantiationService;
    this.disposables = this._register(new DisposableStore());
  }
  async fetchRoots() {
    this.disposables.clear();
    this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_EXPORT_SCHEME, this._register(new InMemoryFileSystemProvider())));
    const previewFileSystemProvider = this._register(new InMemoryFileSystemProvider());
    this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME, previewFileSystemProvider));
    const roots = [];
    const exportPreviewProfle = this.createExportPreviewProfile(this.profile);
    if (this.exportFlags?.settings ?? true) {
      const settingsResource = this.instantiationService.createInstance(SettingsResource);
      const settingsContent = await settingsResource.getContent(this.profile);
      await settingsResource.apply(settingsContent, exportPreviewProfle);
      const settingsResourceTreeItem = this.instantiationService.createInstance(SettingsResourceTreeItem, exportPreviewProfle);
      if (await settingsResourceTreeItem.hasContent()) {
        roots.push(settingsResourceTreeItem);
      }
    }
    if (this.exportFlags?.keybindings ?? true) {
      const keybindingsResource = this.instantiationService.createInstance(KeybindingsResource);
      const keybindingsContent = await keybindingsResource.getContent(this.profile);
      await keybindingsResource.apply(keybindingsContent, exportPreviewProfle);
      const keybindingsResourceTreeItem = this.instantiationService.createInstance(KeybindingsResourceTreeItem, exportPreviewProfle);
      if (await keybindingsResourceTreeItem.hasContent()) {
        roots.push(keybindingsResourceTreeItem);
      }
    }
    if (this.exportFlags?.snippets ?? true) {
      const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
      const snippetsContent = await snippetsResource.getContent(this.profile);
      await snippetsResource.apply(snippetsContent, exportPreviewProfle);
      const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, exportPreviewProfle);
      if (await snippetsResourceTreeItem.hasContent()) {
        roots.push(snippetsResourceTreeItem);
      }
    }
    if (this.exportFlags?.tasks ?? true) {
      const tasksResource = this.instantiationService.createInstance(TasksResource);
      const tasksContent = await tasksResource.getContent(this.profile);
      await tasksResource.apply(tasksContent, exportPreviewProfle);
      const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, exportPreviewProfle);
      if (await tasksResourceTreeItem.hasContent()) {
        roots.push(tasksResourceTreeItem);
      }
    }
    if (this.exportFlags?.globalState ?? true) {
      const globalStateResource = joinPath(exportPreviewProfle.globalStorageHome, "globalState.json").with({ scheme: USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME });
      const globalStateResourceTreeItem = this.instantiationService.createInstance(GlobalStateResourceExportTreeItem, exportPreviewProfle, globalStateResource);
      const content = await globalStateResourceTreeItem.getContent();
      if (content) {
        await this.fileService.writeFile(globalStateResource, VSBuffer.fromString(JSON.stringify(JSON.parse(content), null, "	")));
        roots.push(globalStateResourceTreeItem);
      }
    }
    if (this.exportFlags?.extensions ?? true) {
      const extensionsResourceTreeItem = this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, exportPreviewProfle);
      if (await extensionsResourceTreeItem.hasContent()) {
        roots.push(extensionsResourceTreeItem);
      }
    }
    previewFileSystemProvider.setReadOnly(true);
    return roots;
  }
  createExportPreviewProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      location: profile.location,
      isDefault: profile.isDefault,
      icon: profile.icon,
      globalStorageHome: profile.globalStorageHome,
      settingsResource: profile.settingsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      keybindingsResource: profile.keybindingsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      tasksResource: profile.tasksResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      mcpResource: profile.mcpResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      languageModelsResource: profile.languageModelsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      snippetsHome: profile.snippetsHome.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      promptsHome: profile.promptsHome.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      extensionsResource: profile.extensionsResource,
      cacheHome: profile.cacheHome,
      agentPluginsHome: profile.agentPluginsHome,
      useDefaultFlags: profile.useDefaultFlags,
      isTransient: profile.isTransient
    };
  }
  async getProfileToExport() {
    let name = this.profile.name;
    if (this.profile.isDefault) {
      name = await this.quickInputService.input({
        placeHolder: localize("export profile name", "Name the profile"),
        title: localize("export profile title", "Export Profile"),
        async validateInput(input) {
          if (!input.trim()) {
            return localize("profile name required", "Profile name must be provided.");
          }
          return void 0;
        }
      });
      if (!name) {
        return null;
      }
    }
    return super.getProfileTemplate(name, this.profile.icon);
  }
};
UserDataProfileExportState = __decorateClass([
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService)
], UserDataProfileExportState);
registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
export {
  UserDataProfileImportExportService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci91c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3VzZXJEYXRhUHJvZmlsZVZpZXcuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLCBQUk9GSUxFX0ZJTFRFUiwgUFJPRklMRV9FWFRFTlNJT04sIElVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlciwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbSwgUFJPRklMRVNfQ0FURUdPUlksIElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSwgSVNhdmVQcm9maWxlUmVzdWx0LCBJUHJvZmlsZUltcG9ydE9wdGlvbnMsIFBST0ZJTEVfVVJMX0FVVEhPUklUWSwgdG9Vc2VyRGF0YVByb2ZpbGVVcmksIElVc2VyRGF0YVByb2ZpbGVDcmVhdGVPcHRpb25zLCBpc1Byb2ZpbGVVUkwsIFBST0ZJTEVfVVJMX0FVVEhPUklUWV9QUkVGSVggfSBmcm9tICcuLi9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0QnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRyZWVJdGVtLCBJVHJlZVZpZXdEYXRhUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgUHJvZmlsZVJlc291cmNlVHlwZSwgUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NSZXNvdXJjZSwgU2V0dGluZ3NSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi9zZXR0aW5nc1Jlc291cmNlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVzb3VyY2UsIEtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4va2V5YmluZGluZ3NSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0c1Jlc291cmNlLCBTbmlwcGV0c1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuL3NuaXBwZXRzUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgVGFza3NSZXNvdXJjZSwgVGFza3NSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi90YXNrc1Jlc291cmNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZXNvdXJjZSwgRXh0ZW5zaW9uc1Jlc291cmNlRXhwb3J0VHJlZUl0ZW0sIEV4dGVuc2lvbnNSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi9leHRlbnNpb25zUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgR2xvYmFsU3RhdGVSZXNvdXJjZSwgR2xvYmFsU3RhdGVSZXNvdXJjZUV4cG9ydFRyZWVJdGVtLCBHbG9iYWxTdGF0ZVJlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuL2dsb2JhbFN0YXRlUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc1RleHQsIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSwgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmludGVyZmFjZSBJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNldHRpbmdzPzogc3RyaW5nO1xuXHRyZWFkb25seSBrZXliaW5kaW5ncz86IHN0cmluZztcblx0cmVhZG9ubHkgdGFza3M/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNuaXBwZXRzPzogc3RyaW5nO1xuXHRyZWFkb25seSBnbG9iYWxTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgZXh0ZW5zaW9ucz86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gaXNVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHRoaW5nIGFzIElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISEoY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUgPT09ICdvYmplY3QnXG5cdFx0JiYgKGNhbmRpZGF0ZS5uYW1lICYmIHR5cGVvZiBjYW5kaWRhdGUubmFtZSA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGlzVW5kZWZpbmVkKGNhbmRpZGF0ZS5pY29uKSB8fCB0eXBlb2YgY2FuZGlkYXRlLmljb24gPT09ICdzdHJpbmcnKVxuXHRcdCYmIChpc1VuZGVmaW5lZChjYW5kaWRhdGUuc2V0dGluZ3MpIHx8IHR5cGVvZiBjYW5kaWRhdGUuc2V0dGluZ3MgPT09ICdzdHJpbmcnKVxuXHRcdCYmIChpc1VuZGVmaW5lZChjYW5kaWRhdGUuZ2xvYmFsU3RhdGUpIHx8IHR5cGVvZiBjYW5kaWRhdGUuZ2xvYmFsU3RhdGUgPT09ICdzdHJpbmcnKVxuXHRcdCYmIChpc1VuZGVmaW5lZChjYW5kaWRhdGUuZXh0ZW5zaW9ucykgfHwgdHlwZW9mIGNhbmRpZGF0ZS5leHRlbnNpb25zID09PSAnc3RyaW5nJykpO1xufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcHJvZmlsZUNvbnRlbnRIYW5kbGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXI+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXI6IEZpbGVVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyUHJvZmlsZUNvbnRlbnRIYW5kbGVyKFNjaGVtYXMuZmlsZSwgdGhpcy5maWxlVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXIpKTtcblx0fVxuXG5cdHJlZ2lzdGVyUHJvZmlsZUNvbnRlbnRIYW5kbGVyKGlkOiBzdHJpbmcsIHByb2ZpbGVDb250ZW50SGFuZGxlcjogSVVzZXJEYXRhUHJvZmlsZUNvbnRlbnRIYW5kbGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLnByb2ZpbGVDb250ZW50SGFuZGxlcnMuaGFzKGlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm9maWxlIGNvbnRlbnQgaGFuZGxlciB3aXRoIGlkICcke2lkfScgYWxyZWFkeSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblx0XHR0aGlzLnByb2ZpbGVDb250ZW50SGFuZGxlcnMuc2V0KGlkLCBwcm9maWxlQ29udGVudEhhbmRsZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy51bnJlZ2lzdGVyUHJvZmlsZUNvbnRlbnRIYW5kbGVyKGlkKSk7XG5cdH1cblxuXHR1bnJlZ2lzdGVyUHJvZmlsZUNvbnRlbnRIYW5kbGVyKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnByb2ZpbGVDb250ZW50SGFuZGxlcnMuZGVsZXRlKGlkKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUZyb21Qcm9maWxlKGZyb206IElVc2VyRGF0YVByb2ZpbGUsIG9wdGlvbnM6IElVc2VyRGF0YVByb2ZpbGVDcmVhdGVPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgY3JlYXRpb25Qcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY3JlYXRpb25Qcm9taXNlLmNhbmNlbCgpKSk7XG5cdFx0bGV0IHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRkZWxheTogNTAwLFxuXHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0fSwgYXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0UHJvZ3Jlc3MgPSAobWVzc2FnZTogc3RyaW5nKSA9PiBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnY3JlYXRlIGZyb20gcHJvZmlsZScsIFwiQ3JlYXRlIFByb2ZpbGU6IHswfVwiLCBtZXNzYWdlKSB9KTtcblx0XHRcdGNyZWF0aW9uUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFQcm9maWxlRXhwb3J0U3RhdGUsIGZyb20sIHsgLi4ub3B0aW9ucz8ucmVzb3VyY2VUeXBlRmxhZ3MsIGV4dGVuc2lvbnM6IGZhbHNlIH0pKTtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZVRlbXBsYXRlID0gYXdhaXQgdXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlLmdldFByb2ZpbGVUZW1wbGF0ZShvcHRpb25zLm5hbWUgPz8gZnJvbS5uYW1lLCBvcHRpb25zPy5pY29uKTtcblx0XHRcdFx0cHJvZmlsZSA9IGF3YWl0IHRoaXMuZ2V0UHJvZmlsZVRvSW1wb3J0KHsgLi4ucHJvZmlsZVRlbXBsYXRlLCBuYW1lOiBvcHRpb25zLm5hbWUgPz8gcHJvZmlsZVRlbXBsYXRlLm5hbWUgfSwgISFvcHRpb25zLnRyYW5zaWVudCwgb3B0aW9ucyk7XG5cdFx0XHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5hcHBseVByb2ZpbGVUZW1wbGF0ZShwcm9maWxlVGVtcGxhdGUsIHByb2ZpbGUsIG9wdGlvbnMsIHJlcG9ydFByb2dyZXNzLCB0b2tlbik7XG5cdFx0XHR9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNyZWF0aW9uUHJvbWlzZTtcblx0XHRcdFx0aWYgKHByb2ZpbGUgJiYgKG9wdGlvbnM/LnJlc291cmNlVHlwZUZsYWdzPy5leHRlbnNpb25zID8/IHRydWUpKSB7XG5cdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ2luc3RhbGxpbmcgZXh0ZW5zaW9ucycsIFwiSW5zdGFsbGluZyBFeHRlbnNpb25zLi4uXCIpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZSkuY29weShmcm9tLCBwcm9maWxlLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5yZW1vdmVQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0XHRcdHByb2ZpbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBwcm9maWxlO1xuXG5cdFx0fSwgKCkgPT4gY3JlYXRpb25Qcm9taXNlLmNhbmNlbCgpKS5maW5hbGx5KCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVQcm9maWxlRnJvbVRlbXBsYXRlKHByb2ZpbGVUZW1wbGF0ZTogSVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlLCBvcHRpb25zOiBJVXNlckRhdGFQcm9maWxlQ3JlYXRlT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGNyZWF0aW9uUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD47XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGNyZWF0aW9uUHJvbWlzZS5jYW5jZWwoKSkpO1xuXHRcdGxldCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0ZGVsYXk6IDUwMCxcblx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdH0sIGFzeW5jIHByb2dyZXNzID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydFByb2dyZXNzID0gKG1lc3NhZ2U6IHN0cmluZykgPT4gcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ2NyZWF0ZSBmcm9tIHByb2ZpbGUnLCBcIkNyZWF0ZSBQcm9maWxlOiB7MH1cIiwgbWVzc2FnZSkgfSk7XG5cdFx0XHRjcmVhdGlvblByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdHByb2ZpbGUgPSBhd2FpdCB0aGlzLmdldFByb2ZpbGVUb0ltcG9ydCh7IC4uLnByb2ZpbGVUZW1wbGF0ZSwgbmFtZTogb3B0aW9ucy5uYW1lID8/IHByb2ZpbGVUZW1wbGF0ZS5uYW1lIH0sICEhb3B0aW9ucy50cmFuc2llbnQsIG9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoIXByb2ZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMuYXBwbHlQcm9maWxlVGVtcGxhdGUocHJvZmlsZVRlbXBsYXRlLCBwcm9maWxlLCBvcHRpb25zLCByZXBvcnRQcm9ncmVzcywgdG9rZW4pO1xuXHRcdFx0fSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjcmVhdGlvblByb21pc2U7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucmVtb3ZlUHJvZmlsZShwcm9maWxlKTtcblx0XHRcdFx0XHRwcm9maWxlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvZmlsZTtcblx0XHR9LCAoKSA9PiBjcmVhdGlvblByb21pc2UuY2FuY2VsKCkpLmZpbmFsbHkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlQcm9maWxlVGVtcGxhdGUocHJvZmlsZVRlbXBsYXRlOiBJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUsIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIG9wdGlvbnM6IElVc2VyRGF0YVByb2ZpbGVDcmVhdGVPcHRpb25zLCByZXBvcnRQcm9ncmVzczogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5zZXR0aW5ncyAmJiAob3B0aW9ucy5yZXNvdXJjZVR5cGVGbGFncz8uc2V0dGluZ3MgPz8gdHJ1ZSkgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncykge1xuXHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ2NyZWF0aW5nIHNldHRpbmdzJywgXCJDcmVhdGluZyBTZXR0aW5ncy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5zZXR0aW5ncywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLmtleWJpbmRpbmdzICYmIChvcHRpb25zLnJlc291cmNlVHlwZUZsYWdzPy5rZXliaW5kaW5ncyA/PyB0cnVlKSAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LmtleWJpbmRpbmdzKSB7XG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnY3JlYXRlIGtleWJpbmRpbmdzJywgXCJDcmVhdGluZyBLZXlib2FyZCBTaG9ydGN1dHMuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXliaW5kaW5nc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUua2V5YmluZGluZ3MsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS50YXNrcyAmJiAob3B0aW9ucy5yZXNvdXJjZVR5cGVGbGFncz8udGFza3MgPz8gdHJ1ZSkgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy50YXNrcykge1xuXHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ2NyZWF0ZSB0YXNrcycsIFwiQ3JlYXRpbmcgVGFza3MuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUudGFza3MsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5zbmlwcGV0cyAmJiAob3B0aW9ucy5yZXNvdXJjZVR5cGVGbGFncz8uc25pcHBldHMgPz8gdHJ1ZSkgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zbmlwcGV0cykge1xuXHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ2NyZWF0ZSBzbmlwcGV0cycsIFwiQ3JlYXRpbmcgU25pcHBldHMuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0c1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUuc25pcHBldHMsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5nbG9iYWxTdGF0ZSAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/Lmdsb2JhbFN0YXRlKSB7XG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnYXBwbHlpbmcgZ2xvYmFsIHN0YXRlJywgXCJBcHBseWluZyBVSSBTdGF0ZS4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdsb2JhbFN0YXRlUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5nbG9iYWxTdGF0ZSwgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLmV4dGVuc2lvbnMgJiYgKG9wdGlvbnMucmVzb3VyY2VUeXBlRmxhZ3M/LmV4dGVuc2lvbnMgPz8gdHJ1ZSkgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5leHRlbnNpb25zKSB7XG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnaW5zdGFsbGluZyBleHRlbnNpb25zJywgXCJJbnN0YWxsaW5nIEV4dGVuc2lvbnMuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5leHRlbnNpb25zLCBwcm9maWxlLCByZXBvcnRQcm9ncmVzcywgdG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGV4cG9ydFByb2ZpbGUocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgZXhwb3J0RmxhZ3M/OiBQcm9maWxlUmVzb3VyY2VUeXBlRmxhZ3MpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFQcm9maWxlRXhwb3J0U3RhdGUsIHByb2ZpbGUsIGV4cG9ydEZsYWdzKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmRvRXhwb3J0UHJvZmlsZSh1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUsIFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVRyb3VibGVzaG9vdFByb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVFeHBvcnRTdGF0ZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLCB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm9maWxlVGVtcGxhdGUgPSBhd2FpdCB1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUuZ2V0UHJvZmlsZVRlbXBsYXRlKGxvY2FsaXplKCd0cm91Ymxlc2hvb3QgaXNzdWUnLCBcIlRyb3VibGVzaG9vdCBJc3N1ZVwiKSwgdW5kZWZpbmVkKTtcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0ZGVsYXk6IDEwMDAsXG5cdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdH0sIGFzeW5jIHByb2dyZXNzID0+IHtcblx0XHRcdFx0Y29uc3QgcmVwb3J0UHJvZ3Jlc3MgPSAobWVzc2FnZTogc3RyaW5nKSA9PiBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgndHJvdWJsZXNob290IHByb2ZpbGUgcHJvZ3Jlc3MnLCBcIlNldHRpbmcgdXAgVHJvdWJsZXNob290IFByb2ZpbGU6IHswfVwiLCBtZXNzYWdlKSB9KTtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IHRoaXMuZG9DcmVhdGVQcm9maWxlKHByb2ZpbGVUZW1wbGF0ZSwgdHJ1ZSwgZmFsc2UsIHsgdXNlRGVmYXVsdEZsYWdzOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUudXNlRGVmYXVsdEZsYWdzIH0sIHJlcG9ydFByb2dyZXNzKTtcblx0XHRcdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgncHJvZ3Jlc3MgZXh0ZW5zaW9ucycsIFwiQXBwbHlpbmcgRXh0ZW5zaW9ucy4uLlwiKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2UpLmNvcHkodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLCBwcm9maWxlLCB0cnVlKTtcblxuXHRcdFx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdzd2l0Y2hpbmcgcHJvZmlsZScsIFwiU3dpdGNoaW5nIFByb2ZpbGUuLi5cIikpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShwcm9maWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHVzZXJEYXRhUHJvZmlsZXNFeHBvcnRTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0V4cG9ydFByb2ZpbGUodXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlOiBVc2VyRGF0YVByb2ZpbGVFeHBvcnRTdGF0ZSwgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24gfCBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlLmdldFByb2ZpbGVUb0V4cG9ydCgpO1xuXHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Byb2ZpbGVzLmV4cG9ydGluZycsIFwiezB9OiBFeHBvcnRpbmcuLi5cIiwgUFJPRklMRVNfQ0FURUdPUlkudmFsdWUpLFxuXHRcdFx0fSwgYXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9IGF3YWl0IHRoaXMucGlja1Byb2ZpbGVDb250ZW50SGFuZGxlcihwcm9maWxlLm5hbWUpO1xuXHRcdFx0XHRpZiAoIWlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVDb250ZW50SGFuZGxlciA9IHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycy5nZXQoaWQpO1xuXHRcdFx0XHRpZiAoIXByb2ZpbGVDb250ZW50SGFuZGxlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzYXZlUmVzdWx0ID0gYXdhaXQgcHJvZmlsZUNvbnRlbnRIYW5kbGVyLnNhdmVQcm9maWxlKHByb2ZpbGUubmFtZS5yZXBsYWNlKCcvJywgJy0nKSwgSlNPTi5zdHJpbmdpZnkocHJvZmlsZSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpZiAoIXNhdmVSZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdleHBvcnQgc3VjY2VzcycsIFwiUHJvZmlsZSAnezB9JyB3YXMgZXhwb3J0ZWQgc3VjY2Vzc2Z1bGx5LlwiLCBwcm9maWxlLm5hbWUpO1xuXHRcdFx0XHRpZiAocHJvZmlsZUNvbnRlbnRIYW5kbGVyLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjx2b2lkPltdID0gW107XG5cdFx0XHRcdFx0Y29uc3QgbGluayA9IHRoaXMucHJvZHVjdFNlcnZpY2Uud2ViVXJsID8gYCR7dGhpcy5wcm9kdWN0U2VydmljZS53ZWJVcmx9LyR7UFJPRklMRV9VUkxfQVVUSE9SSVRZfS8ke2lkfS8ke3NhdmVSZXN1bHQuaWR9YCA6IHRvVXNlckRhdGFQcm9maWxlVXJpKGAvJHtpZH0vJHtzYXZlUmVzdWx0LmlkfWAsIHRoaXMucHJvZHVjdFNlcnZpY2UpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2NvcHknLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb3B5IExpbmtcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQobGluaylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS53ZWJVcmwpIHtcblx0XHRcdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ29wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPcGVuIExpbmtcIiksXG5cdFx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmspO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnb3BlbiBpbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9wZW4gaW4gezB9XCIsIHByb2ZpbGVDb250ZW50SGFuZGxlci5uYW1lKSxcblx0XHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oc2F2ZVJlc3VsdC5saW5rLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuaW5mbyhtZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvbHZlUHJvZmlsZVRlbXBsYXRlKHVyaTogVVJJLCBvcHRpb25zPzogSVByb2ZpbGVJbXBvcnRPcHRpb25zKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUgfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJvZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVQcm9maWxlQ29udGVudCh1cmkpO1xuXHRcdGlmIChwcm9maWxlQ29udGVudCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IHByb2ZpbGVUZW1wbGF0ZTogTXV0YWJsZTxJVXNlckRhdGFQcm9maWxlVGVtcGxhdGU+O1xuXG5cdFx0dHJ5IHtcblx0XHRcdHByb2ZpbGVUZW1wbGF0ZSA9IEpTT04ucGFyc2UocHJvZmlsZUNvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2ludmFsaWQgcHJvZmlsZSBjb250ZW50JywgXCJUaGlzIHByb2ZpbGUgaXMgbm90IHZhbGlkLlwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1VzZXJEYXRhUHJvZmlsZVRlbXBsYXRlKHByb2ZpbGVUZW1wbGF0ZSkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5uYW1lKSB7XG5cdFx0XHRwcm9maWxlVGVtcGxhdGUubmFtZSA9IG9wdGlvbnMubmFtZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8uaWNvbikge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlLmljb24gPSBvcHRpb25zLmljb247XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnJlc291cmNlVHlwZUZsYWdzPy5zZXR0aW5ncyA9PT0gZmFsc2UpIHtcblx0XHRcdHByb2ZpbGVUZW1wbGF0ZS5zZXR0aW5ncyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8ucmVzb3VyY2VUeXBlRmxhZ3M/LmtleWJpbmRpbmdzID09PSBmYWxzZSkge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlLmtleWJpbmRpbmdzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5yZXNvdXJjZVR5cGVGbGFncz8uc25pcHBldHMgPT09IGZhbHNlKSB7XG5cdFx0XHRwcm9maWxlVGVtcGxhdGUuc25pcHBldHMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnJlc291cmNlVHlwZUZsYWdzPy50YXNrcyA9PT0gZmFsc2UpIHtcblx0XHRcdHByb2ZpbGVUZW1wbGF0ZS50YXNrcyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8ucmVzb3VyY2VUeXBlRmxhZ3M/Lmdsb2JhbFN0YXRlID09PSBmYWxzZSkge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlLmdsb2JhbFN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5yZXNvdXJjZVR5cGVGbGFncz8uZXh0ZW5zaW9ucyA9PT0gZmFsc2UpIHtcblx0XHRcdHByb2ZpbGVUZW1wbGF0ZS5leHRlbnNpb25zID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm9maWxlVGVtcGxhdGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ3JlYXRlUHJvZmlsZShwcm9maWxlVGVtcGxhdGU6IElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSwgdGVtcG9yYXJ5UHJvZmlsZTogYm9vbGVhbiwgZXh0ZW5zaW9uczogYm9vbGVhbiwgb3B0aW9uczogSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMgfCB1bmRlZmluZWQsIHByb2dyZXNzOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IHRoaXMuZ2V0UHJvZmlsZVRvSW1wb3J0KHByb2ZpbGVUZW1wbGF0ZSwgdGVtcG9yYXJ5UHJvZmlsZSwgb3B0aW9ucyk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUuc2V0dGluZ3MgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncykge1xuXHRcdFx0cHJvZ3Jlc3MobG9jYWxpemUoJ3Byb2dyZXNzIHNldHRpbmdzJywgXCJBcHBseWluZyBTZXR0aW5ncy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5zZXR0aW5ncywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUua2V5YmluZGluZ3MgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5rZXliaW5kaW5ncykge1xuXHRcdFx0cHJvZ3Jlc3MobG9jYWxpemUoJ3Byb2dyZXNzIGtleWJpbmRpbmdzJywgXCJBcHBseWluZyBLZXlib2FyZCBTaG9ydGN1dHMuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXliaW5kaW5nc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUua2V5YmluZGluZ3MsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnRhc2tzICYmICFwcm9maWxlLnVzZURlZmF1bHRGbGFncz8udGFza3MpIHtcblx0XHRcdHByb2dyZXNzKGxvY2FsaXplKCdwcm9ncmVzcyB0YXNrcycsIFwiQXBwbHlpbmcgVGFza3MuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUudGFza3MsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnNuaXBwZXRzICYmICFwcm9maWxlLnVzZURlZmF1bHRGbGFncz8uc25pcHBldHMpIHtcblx0XHRcdHByb2dyZXNzKGxvY2FsaXplKCdwcm9ncmVzcyBzbmlwcGV0cycsIFwiQXBwbHlpbmcgU25pcHBldHMuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0c1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUuc25pcHBldHMsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLmdsb2JhbFN0YXRlICYmICFwcm9maWxlLnVzZURlZmF1bHRGbGFncz8uZ2xvYmFsU3RhdGUpIHtcblx0XHRcdHByb2dyZXNzKGxvY2FsaXplKCdwcm9ncmVzcyBnbG9iYWwgc3RhdGUnLCBcIkFwcGx5aW5nIFN0YXRlLi4uXCIpKTtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsU3RhdGVSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLmdsb2JhbFN0YXRlLCBwcm9maWxlKTtcblx0XHR9XG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5leHRlbnNpb25zICYmIGV4dGVuc2lvbnMgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5leHRlbnNpb25zKSB7XG5cdFx0XHRwcm9ncmVzcyhsb2NhbGl6ZSgncHJvZ3Jlc3MgZXh0ZW5zaW9ucycsIFwiQXBwbHlpbmcgRXh0ZW5zaW9ucy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLmV4dGVuc2lvbnMsIHByb2ZpbGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm9maWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlUHJvZmlsZUNvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmIChhd2FpdCB0aGlzLmZpbGVVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlci5jYW5IYW5kbGUocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXIucmVhZFByb2ZpbGUocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdGlmIChpc1Byb2ZpbGVVUkwocmVzb3VyY2UpKSB7XG5cdFx0XHRsZXQgaGFuZGxlcklkOiBzdHJpbmcsIGlkT3JVcmk6IHN0cmluZyB8IFVSSTtcblx0XHRcdGlmIChyZXNvdXJjZS5hdXRob3JpdHkgPT09IFBST0ZJTEVfVVJMX0FVVEhPUklUWSkge1xuXHRcdFx0XHRpZE9yVXJpID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRcdFx0aGFuZGxlcklkID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYW5kbGVySWQgPSByZXNvdXJjZS5hdXRob3JpdHkuc3Vic3RyaW5nKFBST0ZJTEVfVVJMX0FVVEhPUklUWV9QUkVGSVgubGVuZ3RoKTtcblx0XHRcdFx0aWRPclVyaSA9IFVSSS5wYXJzZShyZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblByb2ZpbGU6JHtoYW5kbGVySWR9YCk7XG5cdFx0XHRjb25zdCBwcm9maWxlQ29udGVudEhhbmRsZXIgPSB0aGlzLnByb2ZpbGVDb250ZW50SGFuZGxlcnMuZ2V0KGhhbmRsZXJJZCk7XG5cdFx0XHRpZiAocHJvZmlsZUNvbnRlbnRIYW5kbGVyKSB7XG5cdFx0XHRcdHJldHVybiBwcm9maWxlQ29udGVudEhhbmRsZXIucmVhZFByb2ZpbGUoaWRPclVyaSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudCgnb25Qcm9maWxlJyk7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlQ29udGVudEhhbmRsZXIgb2YgdGhpcy5wcm9maWxlQ29udGVudEhhbmRsZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcHJvZmlsZUNvbnRlbnRIYW5kbGVyLnJlYWRQcm9maWxlKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChjb250ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiBjb250ZW50O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB0eXBlOiAnR0VUJywgdXJsOiByZXNvdXJjZS50b1N0cmluZyh0cnVlKSwgY2FsbFNpdGU6ICd1c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLnJlc29sdmVDb250ZW50JyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMjAwKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgYXNUZXh0KGNvbnRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gYXdhaXQgYXNUZXh0KGNvbnRleHQpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2V0IHByb2ZpbGUgZnJvbSBVUkw6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX0uIFN0YXR1cyBjb2RlOiAke2NvbnRleHQucmVzLnN0YXR1c0NvZGV9LiBNZXNzYWdlOiAke21lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrUHJvZmlsZUNvbnRlbnRIYW5kbGVyKG5hbWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudCgnb25Qcm9maWxlJyk7XG5cdFx0aWYgKHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycy5zaXplID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm9maWxlQ29udGVudEhhbmRsZXJzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnM6IFF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2lkLCBwcm9maWxlQ29udGVudEhhbmRsZXJdIG9mIHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycykge1xuXHRcdFx0b3B0aW9ucy5wdXNoKHsgaWQsIGxhYmVsOiBwcm9maWxlQ29udGVudEhhbmRsZXIubmFtZSwgZGVzY3JpcHRpb246IHByb2ZpbGVDb250ZW50SGFuZGxlci5kZXNjcmlwdGlvbiB9KTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKG9wdGlvbnMucmV2ZXJzZSgpLFxuXHRcdFx0e1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdCBwcm9maWxlIGNvbnRlbnQgaGFuZGxlcicsIFwiRXhwb3J0ICd7MH0nIHByb2ZpbGUgYXMuLi5cIiwgbmFtZSksXG5cdFx0XHRcdGhpZGVJbnB1dDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdD8uaWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFByb2ZpbGVUb0ltcG9ydChwcm9maWxlVGVtcGxhdGU6IElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSwgdGVtcDogYm9vbGVhbiwgb3B0aW9uczogSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm9maWxlTmFtZSA9IHByb2ZpbGVUZW1wbGF0ZS5uYW1lO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbmQocCA9PiBwLm5hbWUgPT09IHByb2ZpbGVOYW1lKTtcblx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0aWYgKHRlbXApIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuY3JlYXRlTmFtZWRQcm9maWxlKGAke3Byb2ZpbGVOYW1lfSAke3RoaXMuZ2V0UHJvZmlsZU5hbWVJbmRleChwcm9maWxlTmFtZSl9YCwgeyAuLi5vcHRpb25zLCB0cmFuc2llbnQ6IHRlbXAgfSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncHJvZmlsZSBhbHJlYWR5IGV4aXN0cycsIFwiUHJvZmlsZSB3aXRoIG5hbWUgJ3swfScgYWxyZWFkeSBleGlzdHMuIERvIHlvdSB3YW50IHRvIHJlcGxhY2UgaXRzIGNvbnRlbnRzP1wiLCBwcm9maWxlTmFtZSksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnb3ZlcndyaXRlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVwbGFjZVwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHByb2ZpbGUuaXNEZWZhdWx0ID8gcHJvZmlsZSA6IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UudXBkYXRlUHJvZmlsZShwcm9maWxlLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuY3JlYXRlTmFtZWRQcm9maWxlKHByb2ZpbGVOYW1lLCB7IC4uLm9wdGlvbnMsIHRyYW5zaWVudDogdGVtcCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2ZpbGVOYW1lSW5kZXgobmFtZTogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCBuYW1lUmVnRXggPSBuZXcgUmVnRXhwKGAke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMobmFtZSl9XFxcXHMoXFxcXGQrKWApO1xuXHRcdGxldCBuYW1lSW5kZXggPSAwO1xuXHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gbmFtZVJlZ0V4LmV4ZWMocHJvZmlsZS5uYW1lKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gbWF0Y2hlcyA/IHBhcnNlSW50KG1hdGNoZXNbMV0pIDogMDtcblx0XHRcdG5hbWVJbmRleCA9IGluZGV4ID4gbmFtZUluZGV4ID8gaW5kZXggOiBuYW1lSW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lSW5kZXggKyAxO1xuXHR9XG5cbn1cblxuY2xhc3MgRmlsZVVzZXJEYXRhUHJvZmlsZUNvbnRlbnRIYW5kbGVyIGltcGxlbWVudHMgSVVzZXJEYXRhUHJvZmlsZUNvbnRlbnRIYW5kbGVyIHtcblxuXHRyZWFkb25seSBuYW1lID0gbG9jYWxpemUoJ2xvY2FsJywgXCJMb2NhbFwiKTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnZmlsZScsIFwiZmlsZVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBzYXZlUHJvZmlsZShuYW1lOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2F2ZVByb2ZpbGVSZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3QgbGluayA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdleHBvcnQgcHJvZmlsZSBkaWFsb2cnLCBcIlNhdmUgUHJvZmlsZVwiKSxcblx0XHRcdGZpbHRlcnM6IFBST0ZJTEVfRklMVEVSLFxuXHRcdFx0ZGVmYXVsdFVyaTogdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCksIGAke25hbWV9LiR7UFJPRklMRV9FWFRFTlNJT059YCksXG5cdFx0fSk7XG5cdFx0aWYgKCFsaW5rKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlOiBsaW5rLCB2YWx1ZTogY29udGVudCwgb3B0aW9uczogeyBvdmVyd3JpdGU6IHRydWUgfSB9XSk7XG5cdFx0cmV0dXJuIHsgbGluaywgaWQ6IGxpbmsudG9TdHJpbmcoKSB9O1xuXHR9XG5cblx0YXN5bmMgY2FuSGFuZGxlKHVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuaHR0cCAmJiB1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmh0dHBzICYmIHVyaS5zY2hlbWUgIT09IHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wgJiYgYXdhaXQgdGhpcy5maWxlU2VydmljZS5jYW5IYW5kbGVSZXNvdXJjZSh1cmkpO1xuXHR9XG5cblx0YXN5bmMgcmVhZFByb2ZpbGUodXJpOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmIChhd2FpdCB0aGlzLmNhbkhhbmRsZSh1cmkpKSB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpLCB1bmRlZmluZWQsIHRva2VuKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBzZWxlY3RQcm9maWxlKCk6IFByb21pc2U8VVJJIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHByb2ZpbGVMb2NhdGlvbiA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogZmFsc2UsXG5cdFx0XHRjYW5TZWxlY3RGaWxlczogdHJ1ZSxcblx0XHRcdGNhblNlbGVjdE1hbnk6IGZhbHNlLFxuXHRcdFx0ZmlsdGVyczogUFJPRklMRV9GSUxURVIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdCBwcm9maWxlJywgXCJTZWxlY3QgUHJvZmlsZVwiKSxcblx0XHR9KTtcblx0XHRyZXR1cm4gcHJvZmlsZUxvY2F0aW9uID8gcHJvZmlsZUxvY2F0aW9uWzBdIDogbnVsbDtcblx0fVxuXG59XG5cbmNvbnN0IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgPSAndXNlcmRhdGFwcm9maWxlZXhwb3J0JztcbmNvbnN0IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9QUkVWSUVXX1NDSEVNRSA9ICd1c2VyZGF0YXByb2ZpbGVleHBvcnRwcmV2aWV3JztcblxuYWJzdHJhY3QgY2xhc3MgVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U3RhdGUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyZWVWaWV3RGF0YVByb3ZpZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJvb3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUm9vdHMgPSB0aGlzLl9vbkRpZENoYW5nZVJvb3RzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50PzogSVRyZWVJdGVtKTogUHJvbWlzZTxJVHJlZUl0ZW1bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0ICg8SVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtPmVsZW1lbnQpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRpZiAoY2hpbGRyZW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRcdGlmIChjaGlsZC5wYXJlbnQuY2hlY2tib3ggJiYgY2hpbGQuY2hlY2tib3gpIHtcblx0XHRcdFx0XHRcdGNoaWxkLmNoZWNrYm94LmlzQ2hlY2tlZCA9IGNoaWxkLnBhcmVudC5jaGVja2JveC5pc0NoZWNrZWQgJiYgY2hpbGQuY2hlY2tib3guaXNDaGVja2VkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJvb3RzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZmlyZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0Um9vdHMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJvb3RzOiBJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHJvb3RzUHJvbWlzZTogUHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW1bXT4gfCB1bmRlZmluZWQ7XG5cdGdldFJvb3RzKCk6IFByb21pc2U8SVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtW10+IHtcblx0XHRpZiAoIXRoaXMucm9vdHNQcm9taXNlKSB7XG5cdFx0XHR0aGlzLnJvb3RzUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMucm9vdHMgPSBhd2FpdCB0aGlzLmZldGNoUm9vdHMoKTtcblx0XHRcdFx0Zm9yIChjb25zdCByb290IG9mIHRoaXMucm9vdHMpIHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbFRleHQgPSBpc01hcmtkb3duU3RyaW5nKHJvb3QubGFiZWwubGFiZWwpID8gcm9vdC5sYWJlbC5sYWJlbC52YWx1ZSA6IHJvb3QubGFiZWwubGFiZWw7XG5cdFx0XHRcdFx0cm9vdC5jaGVja2JveCA9IHtcblx0XHRcdFx0XHRcdGlzQ2hlY2tlZDogIXJvb3QuaXNGcm9tRGVmYXVsdFByb2ZpbGUoKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZWxlY3QnLCBcIlNlbGVjdCB7MH1cIiwgbGFiZWxUZXh0KSxcblx0XHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlbGVjdCcsIFwiU2VsZWN0IHswfVwiLCBsYWJlbFRleHQpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKHJvb3QuaXNGcm9tRGVmYXVsdFByb2ZpbGUoKSkge1xuXHRcdFx0XHRcdFx0cm9vdC5kZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdmcm9tIGRlZmF1bHQnLCBcIkZyb20gRGVmYXVsdCBQcm9maWxlXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yb290cztcblx0XHRcdH0pKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJvb3RzUHJvbWlzZTtcblx0fVxuXG5cdGlzRW5hYmxlZChyZXNvdXJjZVR5cGU/OiBQcm9maWxlUmVzb3VyY2VUeXBlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHJlc291cmNlVHlwZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yb290cy5zb21lKHJvb3QgPT4gcm9vdC50eXBlID09PSByZXNvdXJjZVR5cGUgJiYgdGhpcy5pc1NlbGVjdGVkKHJvb3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucm9vdHMuc29tZShyb290ID0+IHRoaXMuaXNTZWxlY3RlZChyb290KSk7XG5cdH1cblxuXHRhc3luYyBnZXRQcm9maWxlVGVtcGxhdGUobmFtZTogc3RyaW5nLCBpY29uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZT4ge1xuXHRcdGNvbnN0IHJvb3RzID0gYXdhaXQgdGhpcy5nZXRSb290cygpO1xuXHRcdGxldCBzZXR0aW5nczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBrZXliaW5kaW5nczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0YXNrczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzbmlwcGV0czogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBleHRlbnNpb25zOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGdsb2JhbFN0YXRlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCByb290IG9mIHJvb3RzKSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNTZWxlY3RlZChyb290KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyb290IGluc3RhbmNlb2YgU2V0dGluZ3NSZXNvdXJjZVRyZWVJdGVtKSB7XG5cdFx0XHRcdHNldHRpbmdzID0gYXdhaXQgcm9vdC5nZXRDb250ZW50KCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJvb3QgaW5zdGFuY2VvZiBLZXliaW5kaW5nc1Jlc291cmNlVHJlZUl0ZW0pIHtcblx0XHRcdFx0a2V5YmluZGluZ3MgPSBhd2FpdCByb290LmdldENvbnRlbnQoKTtcblx0XHRcdH0gZWxzZSBpZiAocm9vdCBpbnN0YW5jZW9mIFRhc2tzUmVzb3VyY2VUcmVlSXRlbSkge1xuXHRcdFx0XHR0YXNrcyA9IGF3YWl0IHJvb3QuZ2V0Q29udGVudCgpO1xuXHRcdFx0fSBlbHNlIGlmIChyb290IGluc3RhbmNlb2YgU25pcHBldHNSZXNvdXJjZVRyZWVJdGVtKSB7XG5cdFx0XHRcdHNuaXBwZXRzID0gYXdhaXQgcm9vdC5nZXRDb250ZW50KCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJvb3QgaW5zdGFuY2VvZiBFeHRlbnNpb25zUmVzb3VyY2VUcmVlSXRlbSkge1xuXHRcdFx0XHRleHRlbnNpb25zID0gYXdhaXQgcm9vdC5nZXRDb250ZW50KCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJvb3QgaW5zdGFuY2VvZiBHbG9iYWxTdGF0ZVJlc291cmNlVHJlZUl0ZW0pIHtcblx0XHRcdFx0Z2xvYmFsU3RhdGUgPSBhd2FpdCByb290LmdldENvbnRlbnQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGljb24sXG5cdFx0XHRzZXR0aW5ncyxcblx0XHRcdGtleWJpbmRpbmdzLFxuXHRcdFx0dGFza3MsXG5cdFx0XHRzbmlwcGV0cyxcblx0XHRcdGV4dGVuc2lvbnMsXG5cdFx0XHRnbG9iYWxTdGF0ZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGlzU2VsZWN0ZWQodHJlZUl0ZW06IElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0cmVlSXRlbS5jaGVja2JveCkge1xuXHRcdFx0cmV0dXJuIHRyZWVJdGVtLmNoZWNrYm94LmlzQ2hlY2tlZCB8fCAhIXRyZWVJdGVtLmNoaWxkcmVuPy5zb21lKGNoaWxkID0+IGNoaWxkLmNoZWNrYm94Py5pc0NoZWNrZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBmZXRjaFJvb3RzKCk6IFByb21pc2U8SVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtW10+O1xufVxuXG5jbGFzcyBVc2VyRGF0YVByb2ZpbGVFeHBvcnRTdGF0ZSBleHRlbmRzIFVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFN0YXRlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXhwb3J0RmxhZ3M6IFByb2ZpbGVSZXNvdXJjZVR5cGVGbGFncyB8IHVuZGVmaW5lZCxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocXVpY2tJbnB1dFNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGZldGNoUm9vdHMoKTogUHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW1bXT4ge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1NDSEVNRSwgdGhpcy5fcmVnaXN0ZXIobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcHJldmlld0ZpbGVTeXN0ZW1Qcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1BSRVZJRVdfU0NIRU1FLCBwcmV2aWV3RmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdFx0Y29uc3Qgcm9vdHM6IElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3QgZXhwb3J0UHJldmlld1Byb2ZsZSA9IHRoaXMuY3JlYXRlRXhwb3J0UHJldmlld1Byb2ZpbGUodGhpcy5wcm9maWxlKTtcblxuXHRcdGlmICh0aGlzLmV4cG9ydEZsYWdzPy5zZXR0aW5ncyA/PyB0cnVlKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nc1Jlc291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IHNldHRpbmdzQ29udGVudCA9IGF3YWl0IHNldHRpbmdzUmVzb3VyY2UuZ2V0Q29udGVudCh0aGlzLnByb2ZpbGUpO1xuXHRcdFx0YXdhaXQgc2V0dGluZ3NSZXNvdXJjZS5hcHBseShzZXR0aW5nc0NvbnRlbnQsIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NSZXNvdXJjZVRyZWVJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1Jlc291cmNlVHJlZUl0ZW0sIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0aWYgKGF3YWl0IHNldHRpbmdzUmVzb3VyY2VUcmVlSXRlbS5oYXNDb250ZW50KCkpIHtcblx0XHRcdFx0cm9vdHMucHVzaChzZXR0aW5nc1Jlc291cmNlVHJlZUl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4cG9ydEZsYWdzPy5rZXliaW5kaW5ncyA/PyB0cnVlKSB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nc1Jlc291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXliaW5kaW5nc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdzQ29udGVudCA9IGF3YWl0IGtleWJpbmRpbmdzUmVzb3VyY2UuZ2V0Q29udGVudCh0aGlzLnByb2ZpbGUpO1xuXHRcdFx0YXdhaXQga2V5YmluZGluZ3NSZXNvdXJjZS5hcHBseShrZXliaW5kaW5nc0NvbnRlbnQsIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ3NSZXNvdXJjZVRyZWVJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXliaW5kaW5nc1Jlc291cmNlVHJlZUl0ZW0sIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0aWYgKGF3YWl0IGtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbS5oYXNDb250ZW50KCkpIHtcblx0XHRcdFx0cm9vdHMucHVzaChrZXliaW5kaW5nc1Jlc291cmNlVHJlZUl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4cG9ydEZsYWdzPy5zbmlwcGV0cyA/PyB0cnVlKSB7XG5cdFx0XHRjb25zdCBzbmlwcGV0c1Jlc291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0c1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IHNuaXBwZXRzQ29udGVudCA9IGF3YWl0IHNuaXBwZXRzUmVzb3VyY2UuZ2V0Q29udGVudCh0aGlzLnByb2ZpbGUpO1xuXHRcdFx0YXdhaXQgc25pcHBldHNSZXNvdXJjZS5hcHBseShzbmlwcGV0c0NvbnRlbnQsIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0Y29uc3Qgc25pcHBldHNSZXNvdXJjZVRyZWVJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0c1Jlc291cmNlVHJlZUl0ZW0sIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0aWYgKGF3YWl0IHNuaXBwZXRzUmVzb3VyY2VUcmVlSXRlbS5oYXNDb250ZW50KCkpIHtcblx0XHRcdFx0cm9vdHMucHVzaChzbmlwcGV0c1Jlc291cmNlVHJlZUl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4cG9ydEZsYWdzPy50YXNrcyA/PyB0cnVlKSB7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IHRhc2tzQ29udGVudCA9IGF3YWl0IHRhc2tzUmVzb3VyY2UuZ2V0Q29udGVudCh0aGlzLnByb2ZpbGUpO1xuXHRcdFx0YXdhaXQgdGFza3NSZXNvdXJjZS5hcHBseSh0YXNrc0NvbnRlbnQsIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZVRyZWVJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1Jlc291cmNlVHJlZUl0ZW0sIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0aWYgKGF3YWl0IHRhc2tzUmVzb3VyY2VUcmVlSXRlbS5oYXNDb250ZW50KCkpIHtcblx0XHRcdFx0cm9vdHMucHVzaCh0YXNrc1Jlc291cmNlVHJlZUl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4cG9ydEZsYWdzPy5nbG9iYWxTdGF0ZSA/PyB0cnVlKSB7XG5cdFx0XHRjb25zdCBnbG9iYWxTdGF0ZVJlc291cmNlID0gam9pblBhdGgoZXhwb3J0UHJldmlld1Byb2ZsZS5nbG9iYWxTdG9yYWdlSG9tZSwgJ2dsb2JhbFN0YXRlLmpzb24nKS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfUFJFVklFV19TQ0hFTUUgfSk7XG5cdFx0XHRjb25zdCBnbG9iYWxTdGF0ZVJlc291cmNlVHJlZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdsb2JhbFN0YXRlUmVzb3VyY2VFeHBvcnRUcmVlSXRlbSwgZXhwb3J0UHJldmlld1Byb2ZsZSwgZ2xvYmFsU3RhdGVSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZ2xvYmFsU3RhdGVSZXNvdXJjZVRyZWVJdGVtLmdldENvbnRlbnQoKTtcblx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGdsb2JhbFN0YXRlUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoSlNPTi5wYXJzZShjb250ZW50KSwgbnVsbCwgJ1xcdCcpKSk7XG5cdFx0XHRcdHJvb3RzLnB1c2goZ2xvYmFsU3RhdGVSZXNvdXJjZVRyZWVJdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHBvcnRGbGFncz8uZXh0ZW5zaW9ucyA/PyB0cnVlKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zUmVzb3VyY2VUcmVlSXRlbSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlRXhwb3J0VHJlZUl0ZW0sIGV4cG9ydFByZXZpZXdQcm9mbGUpO1xuXHRcdFx0aWYgKGF3YWl0IGV4dGVuc2lvbnNSZXNvdXJjZVRyZWVJdGVtLmhhc0NvbnRlbnQoKSkge1xuXHRcdFx0XHRyb290cy5wdXNoKGV4dGVuc2lvbnNSZXNvdXJjZVRyZWVJdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwcmV2aWV3RmlsZVN5c3RlbVByb3ZpZGVyLnNldFJlYWRPbmx5KHRydWUpO1xuXG5cdFx0cmV0dXJuIHJvb3RzO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFeHBvcnRQcmV2aWV3UHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogSVVzZXJEYXRhUHJvZmlsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBwcm9maWxlLmlkLFxuXHRcdFx0bmFtZTogcHJvZmlsZS5uYW1lLFxuXHRcdFx0bG9jYXRpb246IHByb2ZpbGUubG9jYXRpb24sXG5cdFx0XHRpc0RlZmF1bHQ6IHByb2ZpbGUuaXNEZWZhdWx0LFxuXHRcdFx0aWNvbjogcHJvZmlsZS5pY29uLFxuXHRcdFx0Z2xvYmFsU3RvcmFnZUhvbWU6IHByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUsXG5cdFx0XHRzZXR0aW5nc1Jlc291cmNlOiBwcm9maWxlLnNldHRpbmdzUmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1NDSEVNRSB9KSxcblx0XHRcdGtleWJpbmRpbmdzUmVzb3VyY2U6IHByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfU0NIRU1FIH0pLFxuXHRcdFx0dGFza3NSZXNvdXJjZTogcHJvZmlsZS50YXNrc1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgfSksXG5cdFx0XHRtY3BSZXNvdXJjZTogcHJvZmlsZS5tY3BSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfU0NIRU1FIH0pLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZTogcHJvZmlsZS5sYW5ndWFnZU1vZGVsc1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgfSksXG5cdFx0XHRzbmlwcGV0c0hvbWU6IHByb2ZpbGUuc25pcHBldHNIb21lLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgfSksXG5cdFx0XHRwcm9tcHRzSG9tZTogcHJvZmlsZS5wcm9tcHRzSG9tZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfU0NIRU1FIH0pLFxuXHRcdFx0ZXh0ZW5zaW9uc1Jlc291cmNlOiBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSxcblx0XHRcdGNhY2hlSG9tZTogcHJvZmlsZS5jYWNoZUhvbWUsXG5cdFx0XHRhZ2VudFBsdWdpbnNIb21lOiBwcm9maWxlLmFnZW50UGx1Z2luc0hvbWUsXG5cdFx0XHR1c2VEZWZhdWx0RmxhZ3M6IHByb2ZpbGUudXNlRGVmYXVsdEZsYWdzLFxuXHRcdFx0aXNUcmFuc2llbnQ6IHByb2ZpbGUuaXNUcmFuc2llbnRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0UHJvZmlsZVRvRXhwb3J0KCk6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlIHwgbnVsbD4ge1xuXHRcdGxldCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0aGlzLnByb2ZpbGUubmFtZTtcblx0XHRpZiAodGhpcy5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0bmFtZSA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ2V4cG9ydCBwcm9maWxlIG5hbWUnLCBcIk5hbWUgdGhlIHByb2ZpbGVcIiksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZXhwb3J0IHByb2ZpbGUgdGl0bGUnLCBcIkV4cG9ydCBQcm9maWxlXCIpLFxuXHRcdFx0XHRhc3luYyB2YWxpZGF0ZUlucHV0KGlucHV0KSB7XG5cdFx0XHRcdFx0aWYgKCFpbnB1dC50cmltKCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvZmlsZSBuYW1lIHJlcXVpcmVkJywgXCJQcm9maWxlIG5hbWUgbXVzdCBiZSBwcm92aWRlZC5cIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuZ2V0UHJvZmlsZVRlbXBsYXRlKG5hbWUsIHRoaXMucHJvZmlsZS5pY29uKTtcblx0fVxuXG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLCBVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQ0FBcUMsZ0JBQWdCLG1CQUFtRCx5QkFBbUQsbUJBQW1CLG1DQUE4RSx1QkFBdUIsc0JBQXFELGNBQWMsb0NBQW9DO0FBQ25ZLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsZ0JBQWdCLDBCQUF5QztBQUNsRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFFcEIsU0FBb0QsZ0NBQStFO0FBQ25JLFNBQVMsa0JBQWtCLGdDQUFnQztBQUMzRCxTQUFTLHFCQUFxQixt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
