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
import * as nls from "../../../../nls.js";
import { StatusbarAlignment, IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { parseKeyboardLayoutDescription, areKeyboardLayoutsEqual, getKeyboardLayoutId, IKeyboardLayoutService } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { KEYBOARD_LAYOUT_OPEN_PICKER } from "../common/preferences.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
let KeyboardLayoutPickerContribution = class extends Disposable {
  constructor(keyboardLayoutService, statusbarService) {
    super();
    this.keyboardLayoutService = keyboardLayoutService;
    this.statusbarService = statusbarService;
    this.pickerElement = this._register(new MutableDisposable());
    const name = nls.localize("status.workbench.keyboardLayout", "Keyboard Layout");
    const layout = this.keyboardLayoutService.getCurrentKeyboardLayout();
    if (layout) {
      const layoutInfo = parseKeyboardLayoutDescription(layout);
      const text = nls.localize("keyboardLayout", "Layout: {0}", layoutInfo.label);
      this.pickerElement.value = this.statusbarService.addEntry(
        {
          name,
          text,
          ariaLabel: text,
          command: KEYBOARD_LAYOUT_OPEN_PICKER
        },
        "status.workbench.keyboardLayout",
        StatusbarAlignment.RIGHT
      );
    }
    this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
      const layout2 = this.keyboardLayoutService.getCurrentKeyboardLayout();
      const layoutInfo = parseKeyboardLayoutDescription(layout2);
      if (this.pickerElement.value) {
        const text = nls.localize("keyboardLayout", "Layout: {0}", layoutInfo.label);
        this.pickerElement.value.update({
          name,
          text,
          ariaLabel: text,
          command: KEYBOARD_LAYOUT_OPEN_PICKER
        });
      } else {
        const text = nls.localize("keyboardLayout", "Layout: {0}", layoutInfo.label);
        this.pickerElement.value = this.statusbarService.addEntry(
          {
            name,
            text,
            ariaLabel: text,
            command: KEYBOARD_LAYOUT_OPEN_PICKER
          },
          "status.workbench.keyboardLayout",
          StatusbarAlignment.RIGHT
        );
      }
    }));
  }
};
KeyboardLayoutPickerContribution.ID = "workbench.contrib.keyboardLayoutPicker";
KeyboardLayoutPickerContribution = __decorateClass([
  __decorateParam(0, IKeyboardLayoutService),
  __decorateParam(1, IStatusbarService)
], KeyboardLayoutPickerContribution);
registerWorkbenchContribution2(KeyboardLayoutPickerContribution.ID, KeyboardLayoutPickerContribution, WorkbenchPhase.BlockStartup);
const DEFAULT_CONTENT = [
  `// ${nls.localize("displayLanguage", "Defines the keyboard layout used in VS Code in the browser environment.")}`,
  `// ${nls.localize("doc", 'Open VS Code and run "Developer: Inspect Key Mappings (JSON)" from Command Palette.')}`,
  ``,
  `// Once you have the keyboard layout info, please paste it below.`,
  "\n"
].join("\n");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: KEYBOARD_LAYOUT_OPEN_PICKER,
      title: nls.localize2("keyboard.chooseLayout", "Change Keyboard Layout"),
      f1: true
    });
  }
  async run(accessor) {
    const keyboardLayoutService = accessor.get(IKeyboardLayoutService);
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const environmentService = accessor.get(IEnvironmentService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const layouts = keyboardLayoutService.getAllKeyboardLayouts();
    const currentLayout = keyboardLayoutService.getCurrentKeyboardLayout();
    const layoutConfig = configurationService.getValue("keyboard.layout");
    const isAutoDetect = layoutConfig === "autodetect";
    const picks = layouts.map((layout) => {
      const picked = !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout);
      const layoutInfo = parseKeyboardLayoutDescription(layout);
      return {
        layout,
        label: [layoutInfo.label, layout && layout.isUserKeyboardLayout ? "(User configured layout)" : ""].join(" "),
        id: layout.text || layout.lang || layout.layout,
        description: layoutInfo.description + (picked ? " (Current layout)" : ""),
        picked: !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout)
      };
    }).sort((a, b) => {
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    if (picks.length > 0) {
      const platform = isMacintosh ? "Mac" : isWindows ? "Win" : "Linux";
      picks.unshift({ type: "separator", label: nls.localize("layoutPicks", "Keyboard Layouts ({0})", platform) });
    }
    const configureKeyboardLayout = { label: nls.localize("configureKeyboardLayout", "Configure Keyboard Layout") };
    picks.unshift(configureKeyboardLayout);
    const autoDetectMode = {
      label: nls.localize("autoDetect", "Auto Detect"),
      description: isAutoDetect ? `Current: ${parseKeyboardLayoutDescription(currentLayout).label}` : void 0,
      picked: isAutoDetect ? true : void 0
    };
    picks.unshift(autoDetectMode);
    const pick = await quickInputService.pick(picks, { placeHolder: nls.localize("pickKeyboardLayout", "Select Keyboard Layout"), matchOnDescription: true });
    if (!pick) {
      return;
    }
    if (pick === autoDetectMode) {
      configurationService.updateValue("keyboard.layout", "autodetect");
      return;
    }
    if (pick === configureKeyboardLayout) {
      const file = environmentService.keyboardLayoutResource;
      await fileService.stat(file).then(void 0, () => {
        return fileService.createFile(file, VSBuffer.fromString(DEFAULT_CONTENT));
      }).then((stat) => {
        if (!stat) {
          return void 0;
        }
        return editorService.openEditor({
          resource: stat.resource,
          languageId: "jsonc",
          options: { pinned: true }
        });
      }, (error) => {
        throw new Error(nls.localize("fail.createSettings", "Unable to create '{0}' ({1}).", file.toString(), error));
      });
      return Promise.resolve();
    }
    configurationService.updateValue("keyboard.layout", getKeyboardLayoutId(pick.layout));
  }
});
export {
  KeyboardLayoutPickerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIva2V5Ym9hcmRMYXlvdXRQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFN0YXR1c2JhckFsaWdubWVudCwgSVN0YXR1c2JhclNlcnZpY2UsIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlS2V5Ym9hcmRMYXlvdXREZXNjcmlwdGlvbiwgYXJlS2V5Ym9hcmRMYXlvdXRzRXF1YWwsIGdldEtleWJvYXJkTGF5b3V0SWQsIElLZXlib2FyZExheW91dFNlcnZpY2UsIElLZXlib2FyZExheW91dEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRMYXlvdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEtFWUJPQVJEX0xBWU9VVF9PUEVOX1BJQ0tFUiB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUXVpY2tQaWNrSW5wdXQsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgS2V5Ym9hcmRMYXlvdXRQaWNrZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmtleWJvYXJkTGF5b3V0UGlja2VyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBpY2tlckVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5Ym9hcmRMYXlvdXRTZXJ2aWNlOiBJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbmFtZSA9IG5scy5sb2NhbGl6ZSgnc3RhdHVzLndvcmtiZW5jaC5rZXlib2FyZExheW91dCcsIFwiS2V5Ym9hcmQgTGF5b3V0XCIpO1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5rZXlib2FyZExheW91dFNlcnZpY2UuZ2V0Q3VycmVudEtleWJvYXJkTGF5b3V0KCk7XG5cdFx0aWYgKGxheW91dCkge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHBhcnNlS2V5Ym9hcmRMYXlvdXREZXNjcmlwdGlvbihsYXlvdXQpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IG5scy5sb2NhbGl6ZSgna2V5Ym9hcmRMYXlvdXQnLCBcIkxheW91dDogezB9XCIsIGxheW91dEluZm8ubGFiZWwpO1xuXG5cdFx0XHR0aGlzLnBpY2tlckVsZW1lbnQudmFsdWUgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRcdGNvbW1hbmQ6IEtFWUJPQVJEX0xBWU9VVF9PUEVOX1BJQ0tFUlxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnc3RhdHVzLndvcmtiZW5jaC5rZXlib2FyZExheW91dCcsXG5cdFx0XHRcdFN0YXR1c2JhckFsaWdubWVudC5SSUdIVFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUtleWJvYXJkTGF5b3V0KCgpID0+IHtcblx0XHRcdGNvbnN0IGxheW91dCA9IHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmdldEN1cnJlbnRLZXlib2FyZExheW91dCgpO1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHBhcnNlS2V5Ym9hcmRMYXlvdXREZXNjcmlwdGlvbihsYXlvdXQpO1xuXG5cdFx0XHRpZiAodGhpcy5waWNrZXJFbGVtZW50LnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBubHMubG9jYWxpemUoJ2tleWJvYXJkTGF5b3V0JywgXCJMYXlvdXQ6IHswfVwiLCBsYXlvdXRJbmZvLmxhYmVsKTtcblx0XHRcdFx0dGhpcy5waWNrZXJFbGVtZW50LnZhbHVlLnVwZGF0ZSh7XG5cdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0XHRjb21tYW5kOiBLRVlCT0FSRF9MQVlPVVRfT1BFTl9QSUNLRVJcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gbmxzLmxvY2FsaXplKCdrZXlib2FyZExheW91dCcsIFwiTGF5b3V0OiB7MH1cIiwgbGF5b3V0SW5mby5sYWJlbCk7XG5cdFx0XHRcdHRoaXMucGlja2VyRWxlbWVudC52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IEtFWUJPQVJEX0xBWU9VVF9PUEVOX1BJQ0tFUlxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3N0YXR1cy53b3JrYmVuY2gua2V5Ym9hcmRMYXlvdXQnLFxuXHRcdFx0XHRcdFN0YXR1c2JhckFsaWdubWVudC5SSUdIVFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoS2V5Ym9hcmRMYXlvdXRQaWNrZXJDb250cmlidXRpb24uSUQsIEtleWJvYXJkTGF5b3V0UGlja2VyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG5pbnRlcmZhY2UgTGF5b3V0UXVpY2tQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0bGF5b3V0OiBJS2V5Ym9hcmRMYXlvdXRJbmZvO1xufVxuXG5pbnRlcmZhY2UgSVVua25vd25MYXlvdXQge1xuXHR0ZXh0Pzogc3RyaW5nO1xuXHRsYW5nPzogc3RyaW5nO1xuXHRsYXlvdXQ/OiBzdHJpbmc7XG59XG5cbmNvbnN0IERFRkFVTFRfQ09OVEVOVDogc3RyaW5nID0gW1xuXHRgLy8gJHtubHMubG9jYWxpemUoJ2Rpc3BsYXlMYW5ndWFnZScsICdEZWZpbmVzIHRoZSBrZXlib2FyZCBsYXlvdXQgdXNlZCBpbiBWUyBDb2RlIGluIHRoZSBicm93c2VyIGVudmlyb25tZW50LicpfWAsXG5cdGAvLyAke25scy5sb2NhbGl6ZSgnZG9jJywgJ09wZW4gVlMgQ29kZSBhbmQgcnVuIFwiRGV2ZWxvcGVyOiBJbnNwZWN0IEtleSBNYXBwaW5ncyAoSlNPTilcIiBmcm9tIENvbW1hbmQgUGFsZXR0ZS4nKX1gLFxuXHRgYCxcblx0YC8vIE9uY2UgeW91IGhhdmUgdGhlIGtleWJvYXJkIGxheW91dCBpbmZvLCBwbGVhc2UgcGFzdGUgaXQgYmVsb3cuYCxcblx0J1xcbidcbl0uam9pbignXFxuJyk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogS0VZQk9BUkRfTEFZT1VUX09QRU5fUElDS0VSLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2tleWJvYXJkLmNob29zZUxheW91dCcsIFwiQ2hhbmdlIEtleWJvYXJkIExheW91dFwiKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXlib2FyZExheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJvYXJkTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbGF5b3V0cyA9IGtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRBbGxLZXlib2FyZExheW91dHMoKTtcblx0XHRjb25zdCBjdXJyZW50TGF5b3V0ID0ga2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmdldEN1cnJlbnRLZXlib2FyZExheW91dCgpO1xuXHRcdGNvbnN0IGxheW91dENvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdrZXlib2FyZC5sYXlvdXQnKTtcblx0XHRjb25zdCBpc0F1dG9EZXRlY3QgPSBsYXlvdXRDb25maWcgPT09ICdhdXRvZGV0ZWN0JztcblxuXHRcdGNvbnN0IHBpY2tzOiBRdWlja1BpY2tJbnB1dFtdID0gbGF5b3V0cy5tYXAobGF5b3V0ID0+IHtcblx0XHRcdGNvbnN0IHBpY2tlZCA9ICFpc0F1dG9EZXRlY3QgJiYgYXJlS2V5Ym9hcmRMYXlvdXRzRXF1YWwoY3VycmVudExheW91dCwgbGF5b3V0KTtcblx0XHRcdGNvbnN0IGxheW91dEluZm8gPSBwYXJzZUtleWJvYXJkTGF5b3V0RGVzY3JpcHRpb24obGF5b3V0KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxheW91dDogbGF5b3V0LFxuXHRcdFx0XHRsYWJlbDogW2xheW91dEluZm8ubGFiZWwsIChsYXlvdXQgJiYgbGF5b3V0LmlzVXNlcktleWJvYXJkTGF5b3V0KSA/ICcoVXNlciBjb25maWd1cmVkIGxheW91dCknIDogJyddLmpvaW4oJyAnKSxcblx0XHRcdFx0aWQ6IChsYXlvdXQgYXMgSVVua25vd25MYXlvdXQpLnRleHQgfHwgKGxheW91dCBhcyBJVW5rbm93bkxheW91dCkubGFuZyB8fCAobGF5b3V0IGFzIElVbmtub3duTGF5b3V0KS5sYXlvdXQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsYXlvdXRJbmZvLmRlc2NyaXB0aW9uICsgKHBpY2tlZCA/ICcgKEN1cnJlbnQgbGF5b3V0KScgOiAnJyksXG5cdFx0XHRcdHBpY2tlZDogIWlzQXV0b0RldGVjdCAmJiBhcmVLZXlib2FyZExheW91dHNFcXVhbChjdXJyZW50TGF5b3V0LCBsYXlvdXQpXG5cdFx0XHR9O1xuXHRcdH0pLnNvcnQoKGE6IElRdWlja1BpY2tJdGVtLCBiOiBJUXVpY2tQaWNrSXRlbSkgPT4ge1xuXHRcdFx0cmV0dXJuIGEubGFiZWwgPCBiLmxhYmVsID8gLTEgOiAoYS5sYWJlbCA+IGIubGFiZWwgPyAxIDogMCk7XG5cdFx0fSk7XG5cblx0XHRpZiAocGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgcGxhdGZvcm0gPSBpc01hY2ludG9zaCA/ICdNYWMnIDogaXNXaW5kb3dzID8gJ1dpbicgOiAnTGludXgnO1xuXHRcdFx0cGlja3MudW5zaGlmdCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdsYXlvdXRQaWNrcycsIFwiS2V5Ym9hcmQgTGF5b3V0cyAoezB9KVwiLCBwbGF0Zm9ybSkgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJlS2V5Ym9hcmRMYXlvdXQ6IElRdWlja1BpY2tJdGVtID0geyBsYWJlbDogbmxzLmxvY2FsaXplKCdjb25maWd1cmVLZXlib2FyZExheW91dCcsIFwiQ29uZmlndXJlIEtleWJvYXJkIExheW91dFwiKSB9O1xuXG5cdFx0cGlja3MudW5zaGlmdChjb25maWd1cmVLZXlib2FyZExheW91dCk7XG5cblx0XHQvLyBPZmZlciB0byBcIkF1dG8gRGV0ZWN0XCJcblx0XHRjb25zdCBhdXRvRGV0ZWN0TW9kZTogSVF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdhdXRvRGV0ZWN0JywgXCJBdXRvIERldGVjdFwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBpc0F1dG9EZXRlY3QgPyBgQ3VycmVudDogJHtwYXJzZUtleWJvYXJkTGF5b3V0RGVzY3JpcHRpb24oY3VycmVudExheW91dCkubGFiZWx9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHBpY2tlZDogaXNBdXRvRGV0ZWN0ID8gdHJ1ZSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHRwaWNrcy51bnNoaWZ0KGF1dG9EZXRlY3RNb2RlKTtcblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3BpY2tLZXlib2FyZExheW91dCcsIFwiU2VsZWN0IEtleWJvYXJkIExheW91dFwiKSwgbWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlIH0pO1xuXHRcdGlmICghcGljaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwaWNrID09PSBhdXRvRGV0ZWN0TW9kZSkge1xuXHRcdFx0Ly8gc2V0IGtleW1hcCBzZXJ2aWNlIHRvIGF1dG8gbW9kZVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2tleWJvYXJkLmxheW91dCcsICdhdXRvZGV0ZWN0Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2sgPT09IGNvbmZpZ3VyZUtleWJvYXJkTGF5b3V0KSB7XG5cdFx0XHRjb25zdCBmaWxlID0gZW52aXJvbm1lbnRTZXJ2aWNlLmtleWJvYXJkTGF5b3V0UmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLnN0YXQoZmlsZSkudGhlbih1bmRlZmluZWQsICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIGZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUoZmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhERUZBVUxUX0NPTlRFTlQpKTtcblx0XHRcdH0pLnRoZW4oKHN0YXQpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmICghc3RhdCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHN0YXQucmVzb3VyY2UsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogJ2pzb25jJyxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgKGVycm9yKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2ZhaWwuY3JlYXRlU2V0dGluZ3MnLCBcIlVuYWJsZSB0byBjcmVhdGUgJ3swfScgKHsxfSkuXCIsIGZpbGUudG9TdHJpbmcoKSwgZXJyb3IpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2tleWJvYXJkLmxheW91dCcsIGdldEtleWJvYXJkTGF5b3V0SWQoKDxMYXlvdXRRdWlja1BpY2tJdGVtPnBpY2spLmxheW91dCkpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsb0JBQW9CLHlCQUFrRDtBQUMvRSxTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsZ0NBQWdDLHlCQUF5QixxQkFBcUIsOEJBQW1EO0FBQzFJLFNBQWlDLGdCQUFnQixzQ0FBc0M7QUFDdkYsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxhQUFhLGlCQUFpQjtBQUN2QyxTQUF5QiwwQkFBMEM7QUFDbkUsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUlsQixJQUFN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
