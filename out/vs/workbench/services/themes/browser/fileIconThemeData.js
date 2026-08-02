import * as nls from "../../../../nls.js";
import * as paths from "../../../../base/common/path.js";
import * as resources from "../../../../base/common/resources.js";
import * as Json from "../../../../base/common/json.js";
import { ExtensionData } from "../common/workbenchThemeService.js";
import { getParseErrorMessage } from "../../../../base/common/jsonErrorMessages.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { fontColorRegex, fontSizeRegex } from "../../../../platform/theme/common/iconRegistry.js";
import * as css from "../../../../base/browser/cssValue.js";
import { fileIconSelectorEscape } from "../../../../editor/common/services/getIconClasses.js";
const _FileIconThemeData = class _FileIconThemeData {
  constructor(id, label, settingsId) {
    this.id = id;
    this.label = label;
    this.settingsId = settingsId;
    this.isLoaded = false;
    this.hasFileIcons = false;
    this.hasFolderIcons = false;
    this.hidesExplorerArrows = false;
  }
  ensureLoaded(themeLoader) {
    return !this.isLoaded ? this.load(themeLoader) : Promise.resolve(this.styleSheetContent);
  }
  reload(themeLoader) {
    return this.load(themeLoader);
  }
  load(themeLoader) {
    return themeLoader.load(this);
  }
  static fromExtensionTheme(iconTheme, iconThemeLocation, extensionData) {
    const id = extensionData.extensionId + "-" + iconTheme.id;
    const label = iconTheme.label || paths.basename(iconTheme.path);
    const settingsId = iconTheme.id;
    const themeData = new _FileIconThemeData(id, label, settingsId);
    themeData.description = iconTheme.description;
    themeData.location = iconThemeLocation;
    themeData.extensionData = extensionData;
    themeData.watch = iconTheme._watch;
    themeData.isLoaded = false;
    return themeData;
  }
  static get noIconTheme() {
    let themeData = _FileIconThemeData._noIconTheme;
    if (!themeData) {
      themeData = _FileIconThemeData._noIconTheme = new _FileIconThemeData("", "", null);
      themeData.hasFileIcons = false;
      themeData.hasFolderIcons = false;
      themeData.hidesExplorerArrows = false;
      themeData.isLoaded = true;
      themeData.extensionData = void 0;
      themeData.watch = false;
    }
    return themeData;
  }
  static createUnloadedTheme(id) {
    const themeData = new _FileIconThemeData(id, "", "__" + id);
    themeData.isLoaded = false;
    themeData.hasFileIcons = false;
    themeData.hasFolderIcons = false;
    themeData.hidesExplorerArrows = false;
    themeData.extensionData = void 0;
    themeData.watch = false;
    return themeData;
  }
  static fromStorageData(storageService) {
    const input = storageService.get(_FileIconThemeData.STORAGE_KEY, StorageScope.PROFILE);
    if (!input) {
      return void 0;
    }
    try {
      const data = JSON.parse(input);
      const theme = new _FileIconThemeData("", "", null);
      for (const key in data) {
        switch (key) {
          case "id":
          case "label":
          case "description":
          case "settingsId":
          case "styleSheetContent":
          case "hasFileIcons":
          case "hidesExplorerArrows":
          case "hasFolderIcons":
          case "watch":
            theme[key] = data[key];
            break;
          case "location":
            break;
          case "extensionData":
            theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
            break;
        }
      }
      return theme;
    } catch (e) {
      return void 0;
    }
  }
  toStorage(storageService) {
    const data = JSON.stringify({
      id: this.id,
      label: this.label,
      description: this.description,
      settingsId: this.settingsId,
      styleSheetContent: this.styleSheetContent,
      hasFileIcons: this.hasFileIcons,
      hasFolderIcons: this.hasFolderIcons,
      hidesExplorerArrows: this.hidesExplorerArrows,
      extensionData: ExtensionData.toJSONObject(this.extensionData),
      watch: this.watch
    });
    storageService.store(_FileIconThemeData.STORAGE_KEY, data, StorageScope.PROFILE, StorageTarget.MACHINE);
  }
};
_FileIconThemeData.STORAGE_KEY = "iconThemeData";
_FileIconThemeData._noIconTheme = null;
let FileIconThemeData = _FileIconThemeData;
class FileIconThemeLoader {
  constructor(fileService, languageService) {
    this.fileService = fileService;
    this.languageService = languageService;
  }
  load(data) {
    if (!data.location) {
      return Promise.resolve(data.styleSheetContent);
    }
    return this.loadIconThemeDocument(data.location).then((iconThemeDocument) => {
      const result = this.processIconThemeDocument(data.id, data.location, iconThemeDocument);
      data.styleSheetContent = result.content;
      data.hasFileIcons = result.hasFileIcons;
      data.hasFolderIcons = result.hasFolderIcons;
      data.hidesExplorerArrows = result.hidesExplorerArrows;
      data.isLoaded = true;
      return data.styleSheetContent;
    });
  }
  loadIconThemeDocument(location) {
    return this.fileService.readExtensionResource(location).then((content) => {
      const errors = [];
      const contentValue = Json.parse(content, errors);
      if (errors.length > 0) {
        return Promise.reject(new Error(nls.localize("error.cannotparseicontheme", "Problems parsing file icons file: {0}", errors.map((e) => getParseErrorMessage(e.error)).join(", "))));
      } else if (Json.getNodeType(contentValue) !== "object") {
        return Promise.reject(new Error(nls.localize("error.invalidformat", "Invalid format for file icons theme file: Object expected.")));
      }
      return Promise.resolve(contentValue);
    });
  }
  processIconThemeDocument(id, iconThemeDocumentLocation, iconThemeDocument) {
    const result = { content: "", hasFileIcons: false, hasFolderIcons: false, hidesExplorerArrows: !!iconThemeDocument.hidesExplorerArrows };
    let hasSpecificFileIcons = false;
    if (!iconThemeDocument.iconDefinitions) {
      return result;
    }
    const selectorByDefinitionId = {};
    const coveredLanguages = {};
    const iconThemeDocumentLocationDirname = resources.dirname(iconThemeDocumentLocation);
    function resolvePath(path) {
      return resources.joinPath(iconThemeDocumentLocationDirname, path);
    }
    function collectSelectors(associations, baseThemeClassName) {
      function addSelector(selector, defId) {
        if (defId) {
          let list = selectorByDefinitionId[defId];
          if (!list) {
            list = selectorByDefinitionId[defId] = new css.Builder();
          }
          list.push(selector);
        }
      }
      if (associations) {
        let qualifier = css.inline`.show-file-icons`;
        if (baseThemeClassName) {
          qualifier = css.inline`${baseThemeClassName} ${qualifier}`;
        }
        const expanded = css.inline`.monaco-tl-twistie.collapsible:not(.collapsed) + .monaco-tl-contents`;
        if (associations.folder) {
          addSelector(css.inline`${qualifier} .folder-icon::before`, associations.folder);
          result.hasFolderIcons = true;
        }
        if (associations.folderExpanded) {
          addSelector(css.inline`${qualifier} ${expanded} .folder-icon::before`, associations.folderExpanded);
          result.hasFolderIcons = true;
        }
        const rootFolder = associations.rootFolder || associations.folder;
        const rootFolderExpanded = associations.rootFolderExpanded || associations.folderExpanded;
        if (rootFolder) {
          addSelector(css.inline`${qualifier} .rootfolder-icon::before`, rootFolder);
          result.hasFolderIcons = true;
        }
        if (rootFolderExpanded) {
          addSelector(css.inline`${qualifier} ${expanded} .rootfolder-icon::before`, rootFolderExpanded);
          result.hasFolderIcons = true;
        }
        if (associations.file) {
          addSelector(css.inline`${qualifier} .file-icon::before`, associations.file);
          result.hasFileIcons = true;
        }
        const folderNames = associations.folderNames;
        if (folderNames) {
          for (const key in folderNames) {
            const selectors = new css.Builder();
            const name = handleParentFolder(key.toLowerCase(), selectors);
            selectors.push(css.inline`.${classSelectorPart(name)}-name-folder-icon`);
            addSelector(css.inline`${qualifier} ${selectors.join("")}.folder-icon::before`, folderNames[key]);
            result.hasFolderIcons = true;
          }
        }
        const folderNamesExpanded = associations.folderNamesExpanded;
        if (folderNamesExpanded) {
          for (const key in folderNamesExpanded) {
            const selectors = new css.Builder();
            const name = handleParentFolder(key.toLowerCase(), selectors);
            selectors.push(css.inline`.${classSelectorPart(name)}-name-folder-icon`);
            addSelector(css.inline`${qualifier} ${expanded} ${selectors.join("")}.folder-icon::before`, folderNamesExpanded[key]);
            result.hasFolderIcons = true;
          }
        }
        const rootFolderNames = associations.rootFolderNames;
        if (rootFolderNames) {
          for (const key in rootFolderNames) {
            const name = key.toLowerCase();
            addSelector(css.inline`${qualifier} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNames[key]);
            result.hasFolderIcons = true;
          }
        }
        const rootFolderNamesExpanded = associations.rootFolderNamesExpanded;
        if (rootFolderNamesExpanded) {
          for (const key in rootFolderNamesExpanded) {
            const name = key.toLowerCase();
            addSelector(css.inline`${qualifier} ${expanded} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNamesExpanded[key]);
            result.hasFolderIcons = true;
          }
        }
        const languageIds = associations.languageIds;
        if (languageIds) {
          if (!languageIds.jsonc && languageIds.json) {
            languageIds.jsonc = languageIds.json;
          }
          for (const languageId in languageIds) {
            addSelector(css.inline`${qualifier} .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`, languageIds[languageId]);
            result.hasFileIcons = true;
            hasSpecificFileIcons = true;
            coveredLanguages[languageId] = true;
          }
        }
        const fileExtensions = associations.fileExtensions;
        if (fileExtensions) {
          for (const key in fileExtensions) {
            const selectors = new css.Builder();
            const name = handleParentFolder(key.toLowerCase(), selectors);
            const segments = name.split(".");
            if (segments.length) {
              for (let i = 0; i < segments.length; i++) {
                selectors.push(css.inline`.${classSelectorPart(segments.slice(i).join("."))}-ext-file-icon`);
              }
              selectors.push(css.inline`.ext-file-icon`);
            }
            addSelector(css.inline`${qualifier} ${selectors.join("")}.file-icon::before`, fileExtensions[key]);
            result.hasFileIcons = true;
            hasSpecificFileIcons = true;
          }
        }
        const fileNames = associations.fileNames;
        if (fileNames) {
          for (const key in fileNames) {
            const selectors = new css.Builder();
            const fileName = handleParentFolder(key.toLowerCase(), selectors);
            selectors.push(css.inline`.${classSelectorPart(fileName)}-name-file-icon`);
            selectors.push(css.inline`.name-file-icon`);
            const segments = fileName.split(".");
            if (segments.length) {
              for (let i = 1; i < segments.length; i++) {
                selectors.push(css.inline`.${classSelectorPart(segments.slice(i).join("."))}-ext-file-icon`);
              }
              selectors.push(css.inline`.ext-file-icon`);
            }
            addSelector(css.inline`${qualifier} ${selectors.join("")}.file-icon::before`, fileNames[key]);
            result.hasFileIcons = true;
            hasSpecificFileIcons = true;
          }
        }
      }
    }
    collectSelectors(iconThemeDocument);
    collectSelectors(iconThemeDocument.light, css.inline`.vs`);
    collectSelectors(iconThemeDocument.highContrast, css.inline`.hc-black`);
    collectSelectors(iconThemeDocument.highContrast, css.inline`.hc-light`);
    if (!result.hasFileIcons && !result.hasFolderIcons) {
      return result;
    }
    const showLanguageModeIcons = iconThemeDocument.showLanguageModeIcons === true || hasSpecificFileIcons && iconThemeDocument.showLanguageModeIcons !== false;
    const cssRules = new css.Builder();
    const fonts = iconThemeDocument.fonts;
    const fontSizes = /* @__PURE__ */ new Map();
    if (Array.isArray(fonts)) {
      const defaultFontSize = this.tryNormalizeFontSize(fonts[0].size) || "150%";
      fonts.forEach((font) => {
        const fontSrcs = new css.Builder();
        fontSrcs.push(...font.src.map((l) => css.inline`${css.asCSSUrl(resolvePath(l.path))} format(${css.stringValue(l.format)})`));
        cssRules.push(css.inline`@font-face { src: ${fontSrcs.join(", ")}; font-family: ${css.stringValue(font.id)}; font-weight: ${css.identValue(font.weight)}; font-style: ${css.identValue(font.style)}; font-display: block; }`);
        const fontSize = this.tryNormalizeFontSize(font.size);
        if (fontSize !== void 0 && fontSize !== defaultFontSize) {
          fontSizes.set(font.id, fontSize);
        }
      });
      cssRules.push(css.inline`.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before, .show-file-icons .rootfolder-icon::before { font-family: ${css.stringValue(fonts[0].id)}; font-size: ${css.sizeValue(defaultFontSize)}; }`);
    }
    const emQuad = css.stringValue("\\2001");
    for (const defId in selectorByDefinitionId) {
      const selectors = selectorByDefinitionId[defId];
      const definition = iconThemeDocument.iconDefinitions[defId];
      if (definition) {
        if (definition.iconPath) {
          cssRules.push(css.inline`${selectors.join(", ")} { content: ${emQuad}; background-image: ${css.asCSSUrl(resolvePath(definition.iconPath))}; }`);
        } else if (definition.fontCharacter || definition.fontColor) {
          const body = new css.Builder();
          if (definition.fontColor && definition.fontColor.match(fontColorRegex)) {
            body.push(css.inline`color: ${css.hexColorValue(definition.fontColor)};`);
          }
          if (definition.fontCharacter) {
            body.push(css.inline`content: ${css.stringValue(definition.fontCharacter)};`);
          }
          const fontSize = definition.fontSize ?? (definition.fontId ? fontSizes.get(definition.fontId) : void 0);
          if (fontSize && fontSize.match(fontSizeRegex)) {
            body.push(css.inline`font-size: ${css.sizeValue(fontSize)};`);
          }
          if (definition.fontId) {
            body.push(css.inline`font-family: ${css.stringValue(definition.fontId)};`);
          }
          if (showLanguageModeIcons) {
            body.push(css.inline`background-image: unset;`);
          }
          cssRules.push(css.inline`${selectors.join(", ")} { ${body.join(" ")} }`);
        }
      }
    }
    if (showLanguageModeIcons) {
      for (const languageId of this.languageService.getRegisteredLanguageIds()) {
        if (!coveredLanguages[languageId]) {
          const icon = this.languageService.getIcon(languageId);
          if (icon) {
            const selector = css.inline`.show-file-icons .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`;
            cssRules.push(css.inline`${selector} { content: ${emQuad}; background-image: ${css.asCSSUrl(icon.dark)}; }`);
            cssRules.push(css.inline`.vs ${selector} { content: ${emQuad}; background-image: ${css.asCSSUrl(icon.light)}; }`);
          }
        }
      }
    }
    result.content = cssRules.join("\n");
    return result;
  }
  /**
   * Try converting absolute font sizes to relative values.
   *
   * This allows them to be scaled nicely depending on where they are used.
   */
  tryNormalizeFontSize(size) {
    if (!size) {
      return void 0;
    }
    const defaultFontSizeInPx = 13;
    if (size.endsWith("px")) {
      const value = parseInt(size, 10);
      if (!isNaN(value)) {
        return Math.round(value / defaultFontSizeInPx * 100) + "%";
      }
    }
    return size;
  }
}
function handleParentFolder(key, selectors) {
  const lastIndexOfSlash = key.lastIndexOf("/");
  if (lastIndexOfSlash >= 0) {
    const parentFolder = key.substring(0, lastIndexOfSlash);
    selectors.push(css.inline`.${classSelectorPart(parentFolder)}-name-dir-icon`);
    return key.substring(lastIndexOfSlash + 1);
  }
  return key;
}
function classSelectorPart(str) {
  str = fileIconSelectorEscape(str);
  return css.className(str, true);
}
export {
  FileIconThemeData,
  FileIconThemeLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvYnJvd3Nlci9maWxlSWNvblRoZW1lRGF0YS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBKc29uIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGF0YSwgSVRoZW1lRXh0ZW5zaW9uUG9pbnQsIElXb3JrYmVuY2hGaWxlSWNvblRoZW1lIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRQYXJzZUVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBmb250Q29sb3JSZWdleCwgZm9udFNpemVSZWdleCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0ICogYXMgY3NzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBmaWxlSWNvblNlbGVjdG9yRXNjYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBGaWxlSWNvblRoZW1lRGF0YSBpbXBsZW1lbnRzIElXb3JrYmVuY2hGaWxlSWNvblRoZW1lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9LRVkgPSAnaWNvblRoZW1lRGF0YSc7XG5cblx0aWQ6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZztcblx0c2V0dGluZ3NJZDogc3RyaW5nIHwgbnVsbDtcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGhhc0ZpbGVJY29uczogYm9vbGVhbjtcblx0aGFzRm9sZGVySWNvbnM6IGJvb2xlYW47XG5cdGhpZGVzRXhwbG9yZXJBcnJvd3M6IGJvb2xlYW47XG5cdGlzTG9hZGVkOiBib29sZWFuO1xuXHRsb2NhdGlvbj86IFVSSTtcblx0ZXh0ZW5zaW9uRGF0YT86IEV4dGVuc2lvbkRhdGE7XG5cdHdhdGNoPzogYm9vbGVhbjtcblxuXHRzdHlsZVNoZWV0Q29udGVudD86IHN0cmluZztcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHNldHRpbmdzSWQ6IHN0cmluZyB8IG51bGwpIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuc2V0dGluZ3NJZCA9IHNldHRpbmdzSWQ7XG5cdFx0dGhpcy5pc0xvYWRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuaGFzRmlsZUljb25zID0gZmFsc2U7XG5cdFx0dGhpcy5oYXNGb2xkZXJJY29ucyA9IGZhbHNlO1xuXHRcdHRoaXMuaGlkZXNFeHBsb3JlckFycm93cyA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGVuc3VyZUxvYWRlZCh0aGVtZUxvYWRlcjogRmlsZUljb25UaGVtZUxvYWRlcik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuICF0aGlzLmlzTG9hZGVkID8gdGhpcy5sb2FkKHRoZW1lTG9hZGVyKSA6IFByb21pc2UucmVzb2x2ZSh0aGlzLnN0eWxlU2hlZXRDb250ZW50KTtcblx0fVxuXG5cdHB1YmxpYyByZWxvYWQodGhlbWVMb2FkZXI6IEZpbGVJY29uVGhlbWVMb2FkZXIpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmxvYWQodGhlbWVMb2FkZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkKHRoZW1lTG9hZGVyOiBGaWxlSWNvblRoZW1lTG9hZGVyKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhlbWVMb2FkZXIubG9hZCh0aGlzKTtcblx0fVxuXG5cdHN0YXRpYyBmcm9tRXh0ZW5zaW9uVGhlbWUoaWNvblRoZW1lOiBJVGhlbWVFeHRlbnNpb25Qb2ludCwgaWNvblRoZW1lTG9jYXRpb246IFVSSSwgZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YSk6IEZpbGVJY29uVGhlbWVEYXRhIHtcblx0XHRjb25zdCBpZCA9IGV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uSWQgKyAnLScgKyBpY29uVGhlbWUuaWQ7XG5cdFx0Y29uc3QgbGFiZWwgPSBpY29uVGhlbWUubGFiZWwgfHwgcGF0aHMuYmFzZW5hbWUoaWNvblRoZW1lLnBhdGgpO1xuXHRcdGNvbnN0IHNldHRpbmdzSWQgPSBpY29uVGhlbWUuaWQ7XG5cblx0XHRjb25zdCB0aGVtZURhdGEgPSBuZXcgRmlsZUljb25UaGVtZURhdGEoaWQsIGxhYmVsLCBzZXR0aW5nc0lkKTtcblxuXHRcdHRoZW1lRGF0YS5kZXNjcmlwdGlvbiA9IGljb25UaGVtZS5kZXNjcmlwdGlvbjtcblx0XHR0aGVtZURhdGEubG9jYXRpb24gPSBpY29uVGhlbWVMb2NhdGlvbjtcblx0XHR0aGVtZURhdGEuZXh0ZW5zaW9uRGF0YSA9IGV4dGVuc2lvbkRhdGE7XG5cdFx0dGhlbWVEYXRhLndhdGNoID0gaWNvblRoZW1lLl93YXRjaDtcblx0XHR0aGVtZURhdGEuaXNMb2FkZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX25vSWNvblRoZW1lOiBGaWxlSWNvblRoZW1lRGF0YSB8IG51bGwgPSBudWxsO1xuXG5cdHN0YXRpYyBnZXQgbm9JY29uVGhlbWUoKTogRmlsZUljb25UaGVtZURhdGEge1xuXHRcdGxldCB0aGVtZURhdGEgPSBGaWxlSWNvblRoZW1lRGF0YS5fbm9JY29uVGhlbWU7XG5cdFx0aWYgKCF0aGVtZURhdGEpIHtcblx0XHRcdHRoZW1lRGF0YSA9IEZpbGVJY29uVGhlbWVEYXRhLl9ub0ljb25UaGVtZSA9IG5ldyBGaWxlSWNvblRoZW1lRGF0YSgnJywgJycsIG51bGwpO1xuXHRcdFx0dGhlbWVEYXRhLmhhc0ZpbGVJY29ucyA9IGZhbHNlO1xuXHRcdFx0dGhlbWVEYXRhLmhhc0ZvbGRlckljb25zID0gZmFsc2U7XG5cdFx0XHR0aGVtZURhdGEuaGlkZXNFeHBsb3JlckFycm93cyA9IGZhbHNlO1xuXHRcdFx0dGhlbWVEYXRhLmlzTG9hZGVkID0gdHJ1ZTtcblx0XHRcdHRoZW1lRGF0YS5leHRlbnNpb25EYXRhID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhlbWVEYXRhLndhdGNoID0gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGVtZURhdGE7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlVW5sb2FkZWRUaGVtZShpZDogc3RyaW5nKTogRmlsZUljb25UaGVtZURhdGEge1xuXHRcdGNvbnN0IHRoZW1lRGF0YSA9IG5ldyBGaWxlSWNvblRoZW1lRGF0YShpZCwgJycsICdfXycgKyBpZCk7XG5cdFx0dGhlbWVEYXRhLmlzTG9hZGVkID0gZmFsc2U7XG5cdFx0dGhlbWVEYXRhLmhhc0ZpbGVJY29ucyA9IGZhbHNlO1xuXHRcdHRoZW1lRGF0YS5oYXNGb2xkZXJJY29ucyA9IGZhbHNlO1xuXHRcdHRoZW1lRGF0YS5oaWRlc0V4cGxvcmVyQXJyb3dzID0gZmFsc2U7XG5cdFx0dGhlbWVEYXRhLmV4dGVuc2lvbkRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0dGhlbWVEYXRhLndhdGNoID0gZmFsc2U7XG5cdFx0cmV0dXJuIHRoZW1lRGF0YTtcblx0fVxuXG5cblx0c3RhdGljIGZyb21TdG9yYWdlRGF0YShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogRmlsZUljb25UaGVtZURhdGEgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlucHV0ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KEZpbGVJY29uVGhlbWVEYXRhLlNUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGlucHV0KTtcblx0XHRcdGNvbnN0IHRoZW1lID0gbmV3IEZpbGVJY29uVGhlbWVEYXRhKCcnLCAnJywgbnVsbCk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XG5cdFx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAnaWQnOlxuXHRcdFx0XHRcdGNhc2UgJ2xhYmVsJzpcblx0XHRcdFx0XHRjYXNlICdkZXNjcmlwdGlvbic6XG5cdFx0XHRcdFx0Y2FzZSAnc2V0dGluZ3NJZCc6XG5cdFx0XHRcdFx0Y2FzZSAnc3R5bGVTaGVldENvbnRlbnQnOlxuXHRcdFx0XHRcdGNhc2UgJ2hhc0ZpbGVJY29ucyc6XG5cdFx0XHRcdFx0Y2FzZSAnaGlkZXNFeHBsb3JlckFycm93cyc6XG5cdFx0XHRcdFx0Y2FzZSAnaGFzRm9sZGVySWNvbnMnOlxuXHRcdFx0XHRcdGNhc2UgJ3dhdGNoJzpcblx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdFx0KHRoZW1lIGFzIGFueSlba2V5XSA9IGRhdGFba2V5XTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2xvY2F0aW9uJzpcblx0XHRcdFx0XHRcdC8vIGlnbm9yZSwgbm8gbG9uZ2VyIHJlc3RvcmVcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2V4dGVuc2lvbkRhdGEnOlxuXHRcdFx0XHRcdFx0dGhlbWUuZXh0ZW5zaW9uRGF0YSA9IEV4dGVuc2lvbkRhdGEuZnJvbUpTT05PYmplY3QoZGF0YS5leHRlbnNpb25EYXRhKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhlbWU7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHR0b1N0b3JhZ2Uoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSkge1xuXHRcdGNvbnN0IGRhdGEgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuZGVzY3JpcHRpb24sXG5cdFx0XHRzZXR0aW5nc0lkOiB0aGlzLnNldHRpbmdzSWQsXG5cdFx0XHRzdHlsZVNoZWV0Q29udGVudDogdGhpcy5zdHlsZVNoZWV0Q29udGVudCxcblx0XHRcdGhhc0ZpbGVJY29uczogdGhpcy5oYXNGaWxlSWNvbnMsXG5cdFx0XHRoYXNGb2xkZXJJY29uczogdGhpcy5oYXNGb2xkZXJJY29ucyxcblx0XHRcdGhpZGVzRXhwbG9yZXJBcnJvd3M6IHRoaXMuaGlkZXNFeHBsb3JlckFycm93cyxcblx0XHRcdGV4dGVuc2lvbkRhdGE6IEV4dGVuc2lvbkRhdGEudG9KU09OT2JqZWN0KHRoaXMuZXh0ZW5zaW9uRGF0YSksXG5cdFx0XHR3YXRjaDogdGhpcy53YXRjaFxuXHRcdH0pO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEZpbGVJY29uVGhlbWVEYXRhLlNUT1JBR0VfS0VZLCBkYXRhLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSWNvbkRlZmluaXRpb24ge1xuXHRpY29uUGF0aDogc3RyaW5nO1xuXHRmb250Q29sb3I6IHN0cmluZztcblx0Zm9udENoYXJhY3Rlcjogc3RyaW5nO1xuXHRmb250U2l6ZTogc3RyaW5nO1xuXHRmb250SWQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEZvbnREZWZpbml0aW9uIHtcblx0aWQ6IHN0cmluZztcblx0d2VpZ2h0OiBzdHJpbmc7XG5cdHN0eWxlOiBzdHJpbmc7XG5cdHNpemU6IHN0cmluZztcblx0c3JjOiB7IHBhdGg6IHN0cmluZzsgZm9ybWF0OiBzdHJpbmcgfVtdO1xufVxuXG5pbnRlcmZhY2UgSWNvbnNBc3NvY2lhdGlvbiB7XG5cdGZvbGRlcj86IHN0cmluZztcblx0ZmlsZT86IHN0cmluZztcblx0Zm9sZGVyRXhwYW5kZWQ/OiBzdHJpbmc7XG5cdHJvb3RGb2xkZXI/OiBzdHJpbmc7XG5cdHJvb3RGb2xkZXJFeHBhbmRlZD86IHN0cmluZztcblx0cm9vdEZvbGRlck5hbWVzPzogeyBbZm9sZGVyTmFtZTogc3RyaW5nXTogc3RyaW5nIH07XG5cdHJvb3RGb2xkZXJOYW1lc0V4cGFuZGVkPzogeyBbZm9sZGVyTmFtZTogc3RyaW5nXTogc3RyaW5nIH07XG5cdGZvbGRlck5hbWVzPzogeyBbZm9sZGVyTmFtZTogc3RyaW5nXTogc3RyaW5nIH07XG5cdGZvbGRlck5hbWVzRXhwYW5kZWQ/OiB7IFtmb2xkZXJOYW1lOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0ZmlsZUV4dGVuc2lvbnM/OiB7IFtleHRlbnNpb246IHN0cmluZ106IHN0cmluZyB9O1xuXHRmaWxlTmFtZXM/OiB7IFtmaWxlTmFtZTogc3RyaW5nXTogc3RyaW5nIH07XG5cdGxhbmd1YWdlSWRzPzogeyBbbGFuZ3VhZ2VJZDogc3RyaW5nXTogc3RyaW5nIH07XG59XG5cbmludGVyZmFjZSBJY29uVGhlbWVEb2N1bWVudCBleHRlbmRzIEljb25zQXNzb2NpYXRpb24ge1xuXHRpY29uRGVmaW5pdGlvbnM6IHsgW2tleTogc3RyaW5nXTogSWNvbkRlZmluaXRpb24gfTtcblx0Zm9udHM6IEZvbnREZWZpbml0aW9uW107XG5cdGxpZ2h0PzogSWNvbnNBc3NvY2lhdGlvbjtcblx0aGlnaENvbnRyYXN0PzogSWNvbnNBc3NvY2lhdGlvbjtcblx0aGlkZXNFeHBsb3JlckFycm93cz86IGJvb2xlYW47XG5cdHNob3dMYW5ndWFnZU1vZGVJY29ucz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlSWNvblRoZW1lTG9hZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGxvYWQoZGF0YTogRmlsZUljb25UaGVtZURhdGEpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghZGF0YS5sb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkYXRhLnN0eWxlU2hlZXRDb250ZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubG9hZEljb25UaGVtZURvY3VtZW50KGRhdGEubG9jYXRpb24pLnRoZW4oaWNvblRoZW1lRG9jdW1lbnQgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5wcm9jZXNzSWNvblRoZW1lRG9jdW1lbnQoZGF0YS5pZCwgZGF0YS5sb2NhdGlvbiEsIGljb25UaGVtZURvY3VtZW50KTtcblx0XHRcdGRhdGEuc3R5bGVTaGVldENvbnRlbnQgPSByZXN1bHQuY29udGVudDtcblx0XHRcdGRhdGEuaGFzRmlsZUljb25zID0gcmVzdWx0Lmhhc0ZpbGVJY29ucztcblx0XHRcdGRhdGEuaGFzRm9sZGVySWNvbnMgPSByZXN1bHQuaGFzRm9sZGVySWNvbnM7XG5cdFx0XHRkYXRhLmhpZGVzRXhwbG9yZXJBcnJvd3MgPSByZXN1bHQuaGlkZXNFeHBsb3JlckFycm93cztcblx0XHRcdGRhdGEuaXNMb2FkZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIGRhdGEuc3R5bGVTaGVldENvbnRlbnQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRJY29uVGhlbWVEb2N1bWVudChsb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJY29uVGhlbWVEb2N1bWVudD4ge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShsb2NhdGlvbikudGhlbigoY29udGVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBKc29uLlBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY29udGVudFZhbHVlID0gSnNvbi5wYXJzZShjb250ZW50LCBlcnJvcnMpO1xuXHRcdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdlcnJvci5jYW5ub3RwYXJzZWljb250aGVtZScsIFwiUHJvYmxlbXMgcGFyc2luZyBmaWxlIGljb25zIGZpbGU6IHswfVwiLCBlcnJvcnMubWFwKGUgPT4gZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZS5lcnJvcikpLmpvaW4oJywgJykpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKEpzb24uZ2V0Tm9kZVR5cGUoY29udGVudFZhbHVlKSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLmludmFsaWRmb3JtYXQnLCBcIkludmFsaWQgZm9ybWF0IGZvciBmaWxlIGljb25zIHRoZW1lIGZpbGU6IE9iamVjdCBleHBlY3RlZC5cIikpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY29udGVudFZhbHVlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc0ljb25UaGVtZURvY3VtZW50KGlkOiBzdHJpbmcsIGljb25UaGVtZURvY3VtZW50TG9jYXRpb246IFVSSSwgaWNvblRoZW1lRG9jdW1lbnQ6IEljb25UaGVtZURvY3VtZW50KTogeyBjb250ZW50OiBzdHJpbmc7IGhhc0ZpbGVJY29uczogYm9vbGVhbjsgaGFzRm9sZGVySWNvbnM6IGJvb2xlYW47IGhpZGVzRXhwbG9yZXJBcnJvd3M6IGJvb2xlYW4gfSB7XG5cblx0XHRjb25zdCByZXN1bHQgPSB7IGNvbnRlbnQ6ICcnLCBoYXNGaWxlSWNvbnM6IGZhbHNlLCBoYXNGb2xkZXJJY29uczogZmFsc2UsIGhpZGVzRXhwbG9yZXJBcnJvd3M6ICEhaWNvblRoZW1lRG9jdW1lbnQuaGlkZXNFeHBsb3JlckFycm93cyB9O1xuXG5cdFx0bGV0IGhhc1NwZWNpZmljRmlsZUljb25zID0gZmFsc2U7XG5cblx0XHRpZiAoIWljb25UaGVtZURvY3VtZW50Lmljb25EZWZpbml0aW9ucykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0b3JCeURlZmluaXRpb25JZDogeyBbZGVmOiBzdHJpbmddOiBjc3MuQnVpbGRlciB9ID0ge307XG5cdFx0Y29uc3QgY292ZXJlZExhbmd1YWdlczogeyBbbGFuZ3VhZ2VJZDogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XG5cblx0XHRjb25zdCBpY29uVGhlbWVEb2N1bWVudExvY2F0aW9uRGlybmFtZSA9IHJlc291cmNlcy5kaXJuYW1lKGljb25UaGVtZURvY3VtZW50TG9jYXRpb24pO1xuXHRcdGZ1bmN0aW9uIHJlc29sdmVQYXRoKHBhdGg6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlcy5qb2luUGF0aChpY29uVGhlbWVEb2N1bWVudExvY2F0aW9uRGlybmFtZSwgcGF0aCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY29sbGVjdFNlbGVjdG9ycyhhc3NvY2lhdGlvbnM6IEljb25zQXNzb2NpYXRpb24gfCB1bmRlZmluZWQsIGJhc2VUaGVtZUNsYXNzTmFtZT86IGNzcy5Dc3NGcmFnbWVudCkge1xuXHRcdFx0ZnVuY3Rpb24gYWRkU2VsZWN0b3Ioc2VsZWN0b3I6IGNzcy5Dc3NGcmFnbWVudCwgZGVmSWQ6IHN0cmluZykge1xuXHRcdFx0XHRpZiAoZGVmSWQpIHtcblx0XHRcdFx0XHRsZXQgbGlzdCA9IHNlbGVjdG9yQnlEZWZpbml0aW9uSWRbZGVmSWRdO1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0bGlzdCA9IHNlbGVjdG9yQnlEZWZpbml0aW9uSWRbZGVmSWRdID0gbmV3IGNzcy5CdWlsZGVyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QucHVzaChzZWxlY3Rvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFzc29jaWF0aW9ucykge1xuXHRcdFx0XHRsZXQgcXVhbGlmaWVyID0gY3NzLmlubGluZWAuc2hvdy1maWxlLWljb25zYDtcblx0XHRcdFx0aWYgKGJhc2VUaGVtZUNsYXNzTmFtZSkge1xuXHRcdFx0XHRcdHF1YWxpZmllciA9IGNzcy5pbmxpbmVgJHtiYXNlVGhlbWVDbGFzc05hbWV9ICR7cXVhbGlmaWVyfWA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleHBhbmRlZCA9IGNzcy5pbmxpbmVgLm1vbmFjby10bC10d2lzdGllLmNvbGxhcHNpYmxlOm5vdCguY29sbGFwc2VkKSArIC5tb25hY28tdGwtY29udGVudHNgO1xuXG5cdFx0XHRcdGlmIChhc3NvY2lhdGlvbnMuZm9sZGVyKSB7XG5cdFx0XHRcdFx0YWRkU2VsZWN0b3IoY3NzLmlubGluZWAke3F1YWxpZmllcn0gLmZvbGRlci1pY29uOjpiZWZvcmVgLCBhc3NvY2lhdGlvbnMuZm9sZGVyKTtcblx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFzc29jaWF0aW9ucy5mb2xkZXJFeHBhbmRlZCkge1xuXHRcdFx0XHRcdGFkZFNlbGVjdG9yKGNzcy5pbmxpbmVgJHtxdWFsaWZpZXJ9ICR7ZXhwYW5kZWR9IC5mb2xkZXItaWNvbjo6YmVmb3JlYCwgYXNzb2NpYXRpb25zLmZvbGRlckV4cGFuZGVkKTtcblx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGFzc29jaWF0aW9ucy5yb290Rm9sZGVyIHx8IGFzc29jaWF0aW9ucy5mb2xkZXI7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXJFeHBhbmRlZCA9IGFzc29jaWF0aW9ucy5yb290Rm9sZGVyRXhwYW5kZWQgfHwgYXNzb2NpYXRpb25zLmZvbGRlckV4cGFuZGVkO1xuXG5cdFx0XHRcdGlmIChyb290Rm9sZGVyKSB7XG5cdFx0XHRcdFx0YWRkU2VsZWN0b3IoY3NzLmlubGluZWAke3F1YWxpZmllcn0gLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlYCwgcm9vdEZvbGRlcik7XG5cdFx0XHRcdFx0cmVzdWx0Lmhhc0ZvbGRlckljb25zID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyb290Rm9sZGVyRXhwYW5kZWQpIHtcblx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke2V4cGFuZGVkfSAucm9vdGZvbGRlci1pY29uOjpiZWZvcmVgLCByb290Rm9sZGVyRXhwYW5kZWQpO1xuXHRcdFx0XHRcdHJlc3VsdC5oYXNGb2xkZXJJY29ucyA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYXNzb2NpYXRpb25zLmZpbGUpIHtcblx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAuZmlsZS1pY29uOjpiZWZvcmVgLCBhc3NvY2lhdGlvbnMuZmlsZSk7XG5cdFx0XHRcdFx0cmVzdWx0Lmhhc0ZpbGVJY29ucyA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lcyA9IGFzc29jaWF0aW9ucy5mb2xkZXJOYW1lcztcblx0XHRcdFx0aWYgKGZvbGRlck5hbWVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZm9sZGVyTmFtZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdG9ycyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGhhbmRsZVBhcmVudEZvbGRlcihrZXkudG9Mb3dlckNhc2UoKSwgc2VsZWN0b3JzKTtcblx0XHRcdFx0XHRcdHNlbGVjdG9ycy5wdXNoKGNzcy5pbmxpbmVgLiR7Y2xhc3NTZWxlY3RvclBhcnQobmFtZSl9LW5hbWUtZm9sZGVyLWljb25gKTtcblx0XHRcdFx0XHRcdGFkZFNlbGVjdG9yKGNzcy5pbmxpbmVgJHtxdWFsaWZpZXJ9ICR7c2VsZWN0b3JzLmpvaW4oJycpfS5mb2xkZXItaWNvbjo6YmVmb3JlYCwgZm9sZGVyTmFtZXNba2V5XSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lc0V4cGFuZGVkID0gYXNzb2NpYXRpb25zLmZvbGRlck5hbWVzRXhwYW5kZWQ7XG5cdFx0XHRcdGlmIChmb2xkZXJOYW1lc0V4cGFuZGVkKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZm9sZGVyTmFtZXNFeHBhbmRlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0b3JzID0gbmV3IGNzcy5CdWlsZGVyKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0gaGFuZGxlUGFyZW50Rm9sZGVyKGtleS50b0xvd2VyQ2FzZSgpLCBzZWxlY3RvcnMpO1xuXHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChuYW1lKX0tbmFtZS1mb2xkZXItaWNvbmApO1xuXHRcdFx0XHRcdFx0YWRkU2VsZWN0b3IoY3NzLmlubGluZWAke3F1YWxpZmllcn0gJHtleHBhbmRlZH0gJHtzZWxlY3RvcnMuam9pbignJyl9LmZvbGRlci1pY29uOjpiZWZvcmVgLCBmb2xkZXJOYW1lc0V4cGFuZGVkW2tleV0pO1xuXHRcdFx0XHRcdFx0cmVzdWx0Lmhhc0ZvbGRlckljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZXMgPSBhc3NvY2lhdGlvbnMucm9vdEZvbGRlck5hbWVzO1xuXHRcdFx0XHRpZiAocm9vdEZvbGRlck5hbWVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gcm9vdEZvbGRlck5hbWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0ga2V5LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAuJHtjbGFzc1NlbGVjdG9yUGFydChuYW1lKX0tcm9vdC1uYW1lLWZvbGRlci1pY29uLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlYCwgcm9vdEZvbGRlck5hbWVzW2tleV0pO1xuXHRcdFx0XHRcdFx0cmVzdWx0Lmhhc0ZvbGRlckljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWVzRXhwYW5kZWQgPSBhc3NvY2lhdGlvbnMucm9vdEZvbGRlck5hbWVzRXhwYW5kZWQ7XG5cdFx0XHRcdGlmIChyb290Rm9sZGVyTmFtZXNFeHBhbmRlZCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IGluIHJvb3RGb2xkZXJOYW1lc0V4cGFuZGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0ga2V5LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke2V4cGFuZGVkfSAuJHtjbGFzc1NlbGVjdG9yUGFydChuYW1lKX0tcm9vdC1uYW1lLWZvbGRlci1pY29uLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlYCwgcm9vdEZvbGRlck5hbWVzRXhwYW5kZWRba2V5XSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWRzID0gYXNzb2NpYXRpb25zLmxhbmd1YWdlSWRzO1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2VJZHMpIHtcblx0XHRcdFx0XHRpZiAoIWxhbmd1YWdlSWRzLmpzb25jICYmIGxhbmd1YWdlSWRzLmpzb24pIHtcblx0XHRcdFx0XHRcdGxhbmd1YWdlSWRzLmpzb25jID0gbGFuZ3VhZ2VJZHMuanNvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBsYW5ndWFnZUlkIGluIGxhbmd1YWdlSWRzKSB7XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAuJHtjbGFzc1NlbGVjdG9yUGFydChsYW5ndWFnZUlkKX0tbGFuZy1maWxlLWljb24uZmlsZS1pY29uOjpiZWZvcmVgLCBsYW5ndWFnZUlkc1tsYW5ndWFnZUlkXSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGhhc1NwZWNpZmljRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvdmVyZWRMYW5ndWFnZXNbbGFuZ3VhZ2VJZF0gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmaWxlRXh0ZW5zaW9ucyA9IGFzc29jaWF0aW9ucy5maWxlRXh0ZW5zaW9ucztcblx0XHRcdFx0aWYgKGZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZmlsZUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdG9ycyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGhhbmRsZVBhcmVudEZvbGRlcihrZXkudG9Mb3dlckNhc2UoKSwgc2VsZWN0b3JzKTtcblx0XHRcdFx0XHRcdGNvbnN0IHNlZ21lbnRzID0gbmFtZS5zcGxpdCgnLicpO1xuXHRcdFx0XHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChzZWdtZW50cy5zbGljZShpKS5qb2luKCcuJykpfS1leHQtZmlsZS1pY29uYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuZXh0LWZpbGUtaWNvbmApOyAvLyBleHRyYSBzZWdtZW50IHRvIGluY3JlYXNlIGZpbGUtZXh0IHNjb3JlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke3NlbGVjdG9ycy5qb2luKCcnKX0uZmlsZS1pY29uOjpiZWZvcmVgLCBmaWxlRXh0ZW5zaW9uc1trZXldKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5oYXNGaWxlSWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aGFzU3BlY2lmaWNGaWxlSWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmaWxlTmFtZXMgPSBhc3NvY2lhdGlvbnMuZmlsZU5hbWVzO1xuXHRcdFx0XHRpZiAoZmlsZU5hbWVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZmlsZU5hbWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RvcnMgPSBuZXcgY3NzLkJ1aWxkZXIoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gaGFuZGxlUGFyZW50Rm9sZGVyKGtleS50b0xvd2VyQ2FzZSgpLCBzZWxlY3RvcnMpO1xuXHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChmaWxlTmFtZSl9LW5hbWUtZmlsZS1pY29uYCk7XG5cdFx0XHRcdFx0XHRzZWxlY3RvcnMucHVzaChjc3MuaW5saW5lYC5uYW1lLWZpbGUtaWNvbmApOyAvLyBleHRyYSBzZWdtZW50IHRvIGluY3JlYXNlIGZpbGUtbmFtZSBzY29yZVxuXHRcdFx0XHRcdFx0Y29uc3Qgc2VnbWVudHMgPSBmaWxlTmFtZS5zcGxpdCgnLicpO1xuXHRcdFx0XHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChzZWdtZW50cy5zbGljZShpKS5qb2luKCcuJykpfS1leHQtZmlsZS1pY29uYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuZXh0LWZpbGUtaWNvbmApOyAvLyBleHRyYSBzZWdtZW50IHRvIGluY3JlYXNlIGZpbGUtZXh0IHNjb3JlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke3NlbGVjdG9ycy5qb2luKCcnKX0uZmlsZS1pY29uOjpiZWZvcmVgLCBmaWxlTmFtZXNba2V5XSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGhhc1NwZWNpZmljRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29sbGVjdFNlbGVjdG9ycyhpY29uVGhlbWVEb2N1bWVudCk7XG5cdFx0Y29sbGVjdFNlbGVjdG9ycyhpY29uVGhlbWVEb2N1bWVudC5saWdodCwgY3NzLmlubGluZWAudnNgKTtcblx0XHRjb2xsZWN0U2VsZWN0b3JzKGljb25UaGVtZURvY3VtZW50LmhpZ2hDb250cmFzdCwgY3NzLmlubGluZWAuaGMtYmxhY2tgKTtcblx0XHRjb2xsZWN0U2VsZWN0b3JzKGljb25UaGVtZURvY3VtZW50LmhpZ2hDb250cmFzdCwgY3NzLmlubGluZWAuaGMtbGlnaHRgKTtcblxuXHRcdGlmICghcmVzdWx0Lmhhc0ZpbGVJY29ucyAmJiAhcmVzdWx0Lmhhc0ZvbGRlckljb25zKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3dMYW5ndWFnZU1vZGVJY29ucyA9IGljb25UaGVtZURvY3VtZW50LnNob3dMYW5ndWFnZU1vZGVJY29ucyA9PT0gdHJ1ZSB8fCAoaGFzU3BlY2lmaWNGaWxlSWNvbnMgJiYgaWNvblRoZW1lRG9jdW1lbnQuc2hvd0xhbmd1YWdlTW9kZUljb25zICE9PSBmYWxzZSk7XG5cblx0XHRjb25zdCBjc3NSdWxlcyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXG5cdFx0Y29uc3QgZm9udHMgPSBpY29uVGhlbWVEb2N1bWVudC5mb250cztcblx0XHRjb25zdCBmb250U2l6ZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGZvbnRzKSkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdEZvbnRTaXplID0gdGhpcy50cnlOb3JtYWxpemVGb250U2l6ZShmb250c1swXS5zaXplKSB8fCAnMTUwJSc7XG5cdFx0XHRmb250cy5mb3JFYWNoKGZvbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBmb250U3JjcyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRmb250U3Jjcy5wdXNoKC4uLmZvbnQuc3JjLm1hcChsID0+IGNzcy5pbmxpbmVgJHtjc3MuYXNDU1NVcmwocmVzb2x2ZVBhdGgobC5wYXRoKSl9IGZvcm1hdCgke2Nzcy5zdHJpbmdWYWx1ZShsLmZvcm1hdCl9KWApKTtcblx0XHRcdFx0Y3NzUnVsZXMucHVzaChjc3MuaW5saW5lYEBmb250LWZhY2UgeyBzcmM6ICR7Zm9udFNyY3Muam9pbignLCAnKX07IGZvbnQtZmFtaWx5OiAke2Nzcy5zdHJpbmdWYWx1ZShmb250LmlkKX07IGZvbnQtd2VpZ2h0OiAke2Nzcy5pZGVudFZhbHVlKGZvbnQud2VpZ2h0KX07IGZvbnQtc3R5bGU6ICR7Y3NzLmlkZW50VmFsdWUoZm9udC5zdHlsZSl9OyBmb250LWRpc3BsYXk6IGJsb2NrOyB9YCk7XG5cblx0XHRcdFx0Y29uc3QgZm9udFNpemUgPSB0aGlzLnRyeU5vcm1hbGl6ZUZvbnRTaXplKGZvbnQuc2l6ZSk7XG5cdFx0XHRcdGlmIChmb250U2l6ZSAhPT0gdW5kZWZpbmVkICYmIGZvbnRTaXplICE9PSBkZWZhdWx0Rm9udFNpemUpIHtcblx0XHRcdFx0XHRmb250U2l6ZXMuc2V0KGZvbnQuaWQsIGZvbnRTaXplKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgLnNob3ctZmlsZS1pY29ucyAuZmlsZS1pY29uOjpiZWZvcmUsIC5zaG93LWZpbGUtaWNvbnMgLmZvbGRlci1pY29uOjpiZWZvcmUsIC5zaG93LWZpbGUtaWNvbnMgLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlIHsgZm9udC1mYW1pbHk6ICR7Y3NzLnN0cmluZ1ZhbHVlKGZvbnRzWzBdLmlkKX07IGZvbnQtc2l6ZTogJHtjc3Muc2l6ZVZhbHVlKGRlZmF1bHRGb250U2l6ZSl9OyB9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIGVtUXVhZHMgdG8gcHJldmVudCB0aGUgaWNvbiBmcm9tIGNvbGxhcHNpbmcgdG8gemVybyBoZWlnaHQgZm9yIGltYWdlIGljb25zXG5cdFx0Y29uc3QgZW1RdWFkID0gY3NzLnN0cmluZ1ZhbHVlKCdcXFxcMjAwMScpO1xuXG5cdFx0Zm9yIChjb25zdCBkZWZJZCBpbiBzZWxlY3RvckJ5RGVmaW5pdGlvbklkKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RvcnMgPSBzZWxlY3RvckJ5RGVmaW5pdGlvbklkW2RlZklkXTtcblx0XHRcdGNvbnN0IGRlZmluaXRpb24gPSBpY29uVGhlbWVEb2N1bWVudC5pY29uRGVmaW5pdGlvbnNbZGVmSWRdO1xuXHRcdFx0aWYgKGRlZmluaXRpb24pIHtcblx0XHRcdFx0aWYgKGRlZmluaXRpb24uaWNvblBhdGgpIHtcblx0XHRcdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgJHtzZWxlY3RvcnMuam9pbignLCAnKX0geyBjb250ZW50OiAke2VtUXVhZH07IGJhY2tncm91bmQtaW1hZ2U6ICR7Y3NzLmFzQ1NTVXJsKHJlc29sdmVQYXRoKGRlZmluaXRpb24uaWNvblBhdGgpKX07IH1gKTtcblx0XHRcdFx0fSBlbHNlIGlmIChkZWZpbml0aW9uLmZvbnRDaGFyYWN0ZXIgfHwgZGVmaW5pdGlvbi5mb250Q29sb3IpIHtcblx0XHRcdFx0XHRjb25zdCBib2R5ID0gbmV3IGNzcy5CdWlsZGVyKCk7XG5cdFx0XHRcdFx0aWYgKGRlZmluaXRpb24uZm9udENvbG9yICYmIGRlZmluaXRpb24uZm9udENvbG9yLm1hdGNoKGZvbnRDb2xvclJlZ2V4KSkge1xuXHRcdFx0XHRcdFx0Ym9keS5wdXNoKGNzcy5pbmxpbmVgY29sb3I6ICR7Y3NzLmhleENvbG9yVmFsdWUoZGVmaW5pdGlvbi5mb250Q29sb3IpfTtgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlZmluaXRpb24uZm9udENoYXJhY3Rlcikge1xuXHRcdFx0XHRcdFx0Ym9keS5wdXNoKGNzcy5pbmxpbmVgY29udGVudDogJHtjc3Muc3RyaW5nVmFsdWUoZGVmaW5pdGlvbi5mb250Q2hhcmFjdGVyKX07YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGZvbnRTaXplID0gZGVmaW5pdGlvbi5mb250U2l6ZSA/PyAoZGVmaW5pdGlvbi5mb250SWQgPyBmb250U2l6ZXMuZ2V0KGRlZmluaXRpb24uZm9udElkKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKGZvbnRTaXplICYmIGZvbnRTaXplLm1hdGNoKGZvbnRTaXplUmVnZXgpKSB7XG5cdFx0XHRcdFx0XHRib2R5LnB1c2goY3NzLmlubGluZWBmb250LXNpemU6ICR7Y3NzLnNpemVWYWx1ZShmb250U2l6ZSl9O2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGVmaW5pdGlvbi5mb250SWQpIHtcblx0XHRcdFx0XHRcdGJvZHkucHVzaChjc3MuaW5saW5lYGZvbnQtZmFtaWx5OiAke2Nzcy5zdHJpbmdWYWx1ZShkZWZpbml0aW9uLmZvbnRJZCl9O2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc2hvd0xhbmd1YWdlTW9kZUljb25zKSB7XG5cdFx0XHRcdFx0XHRib2R5LnB1c2goY3NzLmlubGluZWBiYWNrZ3JvdW5kLWltYWdlOiB1bnNldDtgKTsgLy8gcG90ZW50aWFsbHkgc2V0IGJ5IHRoZSBsYW5ndWFnZSBkZWZhdWx0XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNzc1J1bGVzLnB1c2goY3NzLmlubGluZWAke3NlbGVjdG9ycy5qb2luKCcsICcpfSB7ICR7Ym9keS5qb2luKCcgJyl9IH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzaG93TGFuZ3VhZ2VNb2RlSWNvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgbGFuZ3VhZ2VJZCBvZiB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRSZWdpc3RlcmVkTGFuZ3VhZ2VJZHMoKSkge1xuXHRcdFx0XHRpZiAoIWNvdmVyZWRMYW5ndWFnZXNbbGFuZ3VhZ2VJZF0pIHtcblx0XHRcdFx0XHRjb25zdCBpY29uID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0SWNvbihsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRpZiAoaWNvbikge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0b3IgPSBjc3MuaW5saW5lYC5zaG93LWZpbGUtaWNvbnMgLiR7Y2xhc3NTZWxlY3RvclBhcnQobGFuZ3VhZ2VJZCl9LWxhbmctZmlsZS1pY29uLmZpbGUtaWNvbjo6YmVmb3JlYDtcblx0XHRcdFx0XHRcdGNzc1J1bGVzLnB1c2goY3NzLmlubGluZWAke3NlbGVjdG9yfSB7IGNvbnRlbnQ6ICR7ZW1RdWFkfTsgYmFja2dyb3VuZC1pbWFnZTogJHtjc3MuYXNDU1NVcmwoaWNvbi5kYXJrKX07IH1gKTtcblx0XHRcdFx0XHRcdGNzc1J1bGVzLnB1c2goY3NzLmlubGluZWAudnMgJHtzZWxlY3Rvcn0geyBjb250ZW50OiAke2VtUXVhZH07IGJhY2tncm91bmQtaW1hZ2U6ICR7Y3NzLmFzQ1NTVXJsKGljb24ubGlnaHQpfTsgfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJlc3VsdC5jb250ZW50ID0gY3NzUnVsZXMuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcnkgY29udmVydGluZyBhYnNvbHV0ZSBmb250IHNpemVzIHRvIHJlbGF0aXZlIHZhbHVlcy5cblx0ICpcblx0ICogVGhpcyBhbGxvd3MgdGhlbSB0byBiZSBzY2FsZWQgbmljZWx5IGRlcGVuZGluZyBvbiB3aGVyZSB0aGV5IGFyZSB1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSB0cnlOb3JtYWxpemVGb250U2l6ZShzaXplOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc2l6ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0Rm9udFNpemVJblB4ID0gMTM7XG5cblx0XHRpZiAoc2l6ZS5lbmRzV2l0aCgncHgnKSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBwYXJzZUludChzaXplLCAxMCk7XG5cdFx0XHRpZiAoIWlzTmFOKHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5yb3VuZCgodmFsdWUgLyBkZWZhdWx0Rm9udFNpemVJblB4KSAqIDEwMCkgKyAnJSc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNpemU7XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlUGFyZW50Rm9sZGVyKGtleTogc3RyaW5nLCBzZWxlY3RvcnM6IGNzcy5CdWlsZGVyKTogc3RyaW5nIHtcblx0Y29uc3QgbGFzdEluZGV4T2ZTbGFzaCA9IGtleS5sYXN0SW5kZXhPZignLycpO1xuXHRpZiAobGFzdEluZGV4T2ZTbGFzaCA+PSAwKSB7XG5cdFx0Y29uc3QgcGFyZW50Rm9sZGVyID0ga2V5LnN1YnN0cmluZygwLCBsYXN0SW5kZXhPZlNsYXNoKTtcblx0XHRzZWxlY3RvcnMucHVzaChjc3MuaW5saW5lYC4ke2NsYXNzU2VsZWN0b3JQYXJ0KHBhcmVudEZvbGRlcil9LW5hbWUtZGlyLWljb25gKTtcblx0XHRyZXR1cm4ga2V5LnN1YnN0cmluZyhsYXN0SW5kZXhPZlNsYXNoICsgMSk7XG5cdH1cblx0cmV0dXJuIGtleTtcbn1cblxuZnVuY3Rpb24gY2xhc3NTZWxlY3RvclBhcnQoc3RyOiBzdHJpbmcpOiBjc3MuQ3NzRnJhZ21lbnQge1xuXHRzdHIgPSBmaWxlSWNvblNlbGVjdG9yRXNjYXBlKHN0cik7XG5cdHJldHVybiBjc3MuY2xhc3NOYW1lKHN0ciwgdHJ1ZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksZUFBZTtBQUMzQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxxQkFBb0U7QUFDN0UsU0FBUyw0QkFBNEI7QUFDckMsU0FBMEIsY0FBYyxxQkFBcUI7QUFHN0QsU0FBUyxnQkFBZ0IscUJBQXFCO0FBQzlDLFlBQVksU0FBUztBQUNyQixTQUFTLDhCQUE4QjtBQUVoQyxNQUFNLHFCQUFOLE1BQU0sbUJBQXFEO0FBQUEsRUFrQnpELFlBQVksSUFBWSxPQUFlLFlBQTJCO0FBQ3pFLFNBQUssS0FBSztBQUNWLFNBQUssUUFBUTtBQUNiLFNBQUssYUFBYTtBQUNsQixTQUFLLFdBQVc7QUFDaEIsU0FBSyxlQUFlO0FBQ3BCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVPLGFBQWEsYUFBK0Q7QUFDbEYsV0FBTyxDQUFDLEtBQUssV0FBVyxLQUFLLEtBQUssV0FBVyxJQUFJLFFBQVEsUUFBUSxLQUFLLGlCQUFpQjtBQUFBLEVBQ3hGO0FBQUEsRUFFTyxPQUFPLGFBQStEO0FBQzVFLFdBQU8sS0FBSyxL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
