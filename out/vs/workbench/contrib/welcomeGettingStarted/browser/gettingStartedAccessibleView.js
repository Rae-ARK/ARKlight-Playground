import { AccessibleViewType, AccessibleViewProviderId } from "../../../../platform/accessibility/browser/accessibleView.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { GettingStartedPage, inWelcomeContext } from "./gettingStarted.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IWalkthroughsService } from "./gettingStartedService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
import { localize } from "../../../../nls.js";
import { Action } from "../../../../base/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { URI } from "../../../../base/common/uri.js";
import { parse } from "../../../../base/common/marshalling.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
class GettingStartedAccessibleView {
  constructor() {
    this.type = AccessibleViewType.View;
    this.priority = 110;
    this.name = "walkthroughs";
    this.when = inWelcomeContext;
    this.getProvider = (accessor) => {
      const editorService = accessor.get(IEditorService);
      const editorPane = editorService.activeEditorPane;
      if (!(editorPane instanceof GettingStartedPage)) {
        return;
      }
      const gettingStartedInput = editorPane.input;
      if (!(gettingStartedInput instanceof GettingStartedInput) || !gettingStartedInput.selectedCategory) {
        return;
      }
      const gettingStartedService = accessor.get(IWalkthroughsService);
      const currentWalkthrough = gettingStartedService.getWalkthrough(gettingStartedInput.selectedCategory);
      const currentStepIds = gettingStartedInput.selectedStep;
      if (currentWalkthrough) {
        return new GettingStartedAccessibleProvider(
          accessor.get(IContextKeyService),
          accessor.get(ICommandService),
          accessor.get(IOpenerService),
          editorPane,
          currentWalkthrough,
          currentStepIds
        );
      }
      return;
    };
  }
}
class GettingStartedAccessibleProvider extends Disposable {
  constructor(contextService, commandService, openerService, _gettingStartedPage, _walkthrough, _focusedStep) {
    super();
    this.contextService = contextService;
    this.commandService = commandService;
    this.openerService = openerService;
    this._gettingStartedPage = _gettingStartedPage;
    this._walkthrough = _walkthrough;
    this._focusedStep = _focusedStep;
    this._currentStepIndex = 0;
    this._activeWalkthroughSteps = [];
    this.id = AccessibleViewProviderId.Walkthrough;
    this.verbositySettingKey = AccessibilityVerbositySettingId.Walkthrough;
    this.options = { type: AccessibleViewType.View };
    this._activeWalkthroughSteps = _walkthrough.steps.filter((step) => !step.when || this.contextService.contextMatchesRules(step.when));
  }
  get actions() {
    const actions = [];
    const step = this._activeWalkthroughSteps[this._currentStepIndex];
    const nodes = step.description.map((lt) => lt.nodes.filter((node) => typeof node !== "string").map((node) => ({ href: node.href, label: node.label }))).flat();
    if (nodes.length === 1) {
      const node = nodes[0];
      actions.push(new Action("walthrough.step.action", node.label, ThemeIcon.asClassName(Codicon.run), true, () => {
        const isCommand = node.href.startsWith("command:");
        const command = node.href.replace(/command:(toSide:)?/, "command:");
        if (isCommand) {
          const commandURI = URI.parse(command);
          let args = [];
          try {
            args = parse(decodeURIComponent(commandURI.query));
          } catch {
            try {
              args = parse(commandURI.query);
            } catch {
            }
          }
          if (!Array.isArray(args)) {
            args = [args];
          }
          this.commandService.executeCommand(commandURI.path, ...args);
        } else {
          this.openerService.open(command, { allowCommands: true });
        }
      }));
    }
    return actions;
  }
  provideContent() {
    if (this._focusedStep) {
      const stepIndex = this._activeWalkthroughSteps.findIndex((step) => step.id === this._focusedStep);
      if (stepIndex !== -1) {
        this._currentStepIndex = stepIndex;
      }
    }
    return this._getContent(
      this._walkthrough,
      this._activeWalkthroughSteps[this._currentStepIndex],
      /* includeTitle */
      true
    );
  }
  _getContent(waltkrough, step, includeTitle) {
    const description = step.description.map((lt) => lt.nodes.filter((node) => typeof node === "string")).join("\n");
    const stepsContent = localize("gettingStarted.step", "{0}\n{1}", step.title, description);
    if (includeTitle) {
      return [
        localize("gettingStarted.title", "Title: {0}", waltkrough.title),
        localize("gettingStarted.description", "Description: {0}", waltkrough.description),
        stepsContent
      ].join("\n");
    } else {
      return stepsContent;
    }
  }
  provideNextContent() {
    if (++this._currentStepIndex >= this._activeWalkthroughSteps.length) {
      --this._currentStepIndex;
      return;
    }
    return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
  }
  providePreviousContent() {
    if (--this._currentStepIndex < 0) {
      ++this._currentStepIndex;
      return;
    }
    return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
  }
  onClose() {
    if (this._currentStepIndex > -1) {
      const currentStep = this._activeWalkthroughSteps[this._currentStepIndex];
      this._gettingStartedPage.makeCategoryVisibleWhenAvailable(this._walkthrough.id, currentStep.id);
    }
  }
}
export {
  GettingStartedAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkQWNjZXNzaWJsZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdUeXBlLCBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyLCBFeHRlbnNpb25Db250ZW50UHJvdmlkZXIsIElBY2Nlc3NpYmxlVmlld0NvbnRlbnRQcm92aWRlciwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZFBhZ2UsIGluV2VsY29tZUNvbnRleHQgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkV2Fsa3Rocm91Z2gsIElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcCwgSVdhbGt0aHJvdWdoc1NlcnZpY2UgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkSW5wdXQgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBHZXR0aW5nU3RhcnRlZEFjY2Vzc2libGVWaWV3IGltcGxlbWVudHMgSUFjY2Vzc2libGVWaWV3SW1wbGVtZW50YXRpb24ge1xuXHRyZWFkb25seSB0eXBlID0gQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXc7XG5cdHJlYWRvbmx5IHByaW9yaXR5ID0gMTEwO1xuXHRyZWFkb25seSBuYW1lID0gJ3dhbGt0aHJvdWdocyc7XG5cdHJlYWRvbmx5IHdoZW4gPSBpbldlbGNvbWVDb250ZXh0O1xuXG5cdGdldFByb3ZpZGVyID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlciB8IEV4dGVuc2lvbkNvbnRlbnRQcm92aWRlciB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIShlZGl0b3JQYW5lIGluc3RhbmNlb2YgR2V0dGluZ1N0YXJ0ZWRQYWdlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZElucHV0ID0gZWRpdG9yUGFuZS5pbnB1dDtcblx0XHRpZiAoIShnZXR0aW5nU3RhcnRlZElucHV0IGluc3RhbmNlb2YgR2V0dGluZ1N0YXJ0ZWRJbnB1dCkgfHwgIWdldHRpbmdTdGFydGVkSW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2Fsa3Rocm91Z2hzU2VydmljZSk7XG5cdFx0Y29uc3QgY3VycmVudFdhbGt0aHJvdWdoID0gZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmdldFdhbGt0aHJvdWdoKGdldHRpbmdTdGFydGVkSW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSk7XG5cdFx0Y29uc3QgY3VycmVudFN0ZXBJZHMgPSBnZXR0aW5nU3RhcnRlZElucHV0LnNlbGVjdGVkU3RlcDtcblx0XHRpZiAoY3VycmVudFdhbGt0aHJvdWdoKSB7XG5cblx0XHRcdHJldHVybiBuZXcgR2V0dGluZ1N0YXJ0ZWRBY2Nlc3NpYmxlUHJvdmlkZXIoXG5cdFx0XHRcdGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpLFxuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKSxcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKSxcblx0XHRcdFx0ZWRpdG9yUGFuZSxcblx0XHRcdFx0Y3VycmVudFdhbGt0aHJvdWdoLFxuXHRcdFx0XHRjdXJyZW50U3RlcElkcyk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fTtcbn1cblxuY2xhc3MgR2V0dGluZ1N0YXJ0ZWRBY2Nlc3NpYmxlUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyIHtcblxuXHRwcml2YXRlIF9jdXJyZW50U3RlcEluZGV4OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXBbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgY29udGV4dFNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcml2YXRlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXR0aW5nU3RhcnRlZFBhZ2U6IEdldHRpbmdTdGFydGVkUGFnZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93YWxrdGhyb3VnaDogSVJlc29sdmVkV2Fsa3Rocm91Z2gsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNlZFN0ZXA/OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwcyA9IF93YWxrdGhyb3VnaC5zdGVwcy5maWx0ZXIoc3RlcCA9PiAhc3RlcC53aGVuIHx8IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhzdGVwLndoZW4pKTtcblx0fVxuXG5cdHJlYWRvbmx5IGlkID0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLldhbGt0aHJvdWdoO1xuXHRyZWFkb25seSB2ZXJib3NpdHlTZXR0aW5nS2V5ID0gQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5XYWxrdGhyb3VnaDtcblx0cmVhZG9ubHkgb3B0aW9ucyA9IHsgdHlwZTogQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXcgfTtcblxuXHRwdWJsaWMgZ2V0IGFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRjb25zdCBzdGVwID0gdGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwc1t0aGlzLl9jdXJyZW50U3RlcEluZGV4XTtcblx0XHRjb25zdCBub2RlcyA9IHN0ZXAuZGVzY3JpcHRpb24ubWFwKGx0ID0+IGx0Lm5vZGVzLmZpbHRlcigobm9kZSk6IG5vZGUgaXMgSUxpbmsgPT4gdHlwZW9mIG5vZGUgIT09ICdzdHJpbmcnKS5tYXAobm9kZSA9PiAoeyBocmVmOiBub2RlLmhyZWYsIGxhYmVsOiBub2RlLmxhYmVsIH0pKSkuZmxhdCgpO1xuXHRcdGlmIChub2Rlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBub2Rlc1swXTtcblxuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ3dhbHRocm91Z2guc3RlcC5hY3Rpb24nLCBub2RlLmxhYmVsLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5ydW4pLCB0cnVlLCAoKSA9PiB7XG5cblx0XHRcdFx0Y29uc3QgaXNDb21tYW5kID0gbm9kZS5ocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6Jyk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBub2RlLmhyZWYucmVwbGFjZSgvY29tbWFuZDoodG9TaWRlOik/LywgJ2NvbW1hbmQ6Jyk7XG5cblx0XHRcdFx0aWYgKGlzQ29tbWFuZCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRVUkkgPSBVUkkucGFyc2UoY29tbWFuZCk7XG5cblx0XHRcdFx0XHRsZXQgYXJnczogdW5rbm93bltdID0gW107XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGFyZ3MgPSBwYXJzZShkZWNvZGVVUklDb21wb25lbnQoY29tbWFuZFVSSS5xdWVyeSkpO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXJncyA9IHBhcnNlKGNvbW1hbmRVUkkucXVlcnkpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIGlnbm9yZSBlcnJvclxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXJncykpIHtcblx0XHRcdFx0XHRcdGFyZ3MgPSBbYXJnc107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZFVSSS5wYXRoLCAuLi5hcmdzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihjb21tYW5kLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcm92aWRlQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9mb2N1c2VkU3RlcCkge1xuXHRcdFx0Y29uc3Qgc3RlcEluZGV4ID0gdGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwcy5maW5kSW5kZXgoc3RlcCA9PiBzdGVwLmlkID09PSB0aGlzLl9mb2N1c2VkU3RlcCk7XG5cdFx0XHRpZiAoc3RlcEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U3RlcEluZGV4ID0gc3RlcEluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29udGVudCh0aGlzLl93YWxrdGhyb3VnaCwgdGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwc1t0aGlzLl9jdXJyZW50U3RlcEluZGV4XSwgLyogaW5jbHVkZVRpdGxlICovdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250ZW50KHdhbHRrcm91Z2g6IElSZXNvbHZlZFdhbGt0aHJvdWdoLCBzdGVwOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXAsIGluY2x1ZGVUaXRsZT86IGJvb2xlYW4pOiBzdHJpbmcge1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBzdGVwLmRlc2NyaXB0aW9uLm1hcChsdCA9PiBsdC5ub2Rlcy5maWx0ZXIobm9kZSA9PiB0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpKS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBzdGVwc0NvbnRlbnQgPVxuXHRcdFx0bG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnN0ZXAnLCAnezB9XFxuezF9Jywgc3RlcC50aXRsZSwgZGVzY3JpcHRpb24pO1xuXG5cdFx0aWYgKGluY2x1ZGVUaXRsZSkge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRpdGxlJywgJ1RpdGxlOiB7MH0nLCB3YWx0a3JvdWdoLnRpdGxlKSxcblx0XHRcdFx0bG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmRlc2NyaXB0aW9uJywgJ0Rlc2NyaXB0aW9uOiB7MH0nLCB3YWx0a3JvdWdoLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0c3RlcHNDb250ZW50XG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBzdGVwc0NvbnRlbnQ7XG5cdFx0fVxuXHR9XG5cblx0cHJvdmlkZU5leHRDb250ZW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCsrdGhpcy5fY3VycmVudFN0ZXBJbmRleCA+PSB0aGlzLl9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzLmxlbmd0aCkge1xuXHRcdFx0LS10aGlzLl9jdXJyZW50U3RlcEluZGV4O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29udGVudCh0aGlzLl93YWxrdGhyb3VnaCwgdGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwc1t0aGlzLl9jdXJyZW50U3RlcEluZGV4XSk7XG5cdH1cblxuXHRwcm92aWRlUHJldmlvdXNDb250ZW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKC0tdGhpcy5fY3VycmVudFN0ZXBJbmRleCA8IDApIHtcblx0XHRcdCsrdGhpcy5fY3VycmVudFN0ZXBJbmRleDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldENvbnRlbnQodGhpcy5fd2Fsa3Rocm91Z2gsIHRoaXMuX2FjdGl2ZVdhbGt0aHJvdWdoU3RlcHNbdGhpcy5fY3VycmVudFN0ZXBJbmRleF0pO1xuXHR9XG5cblx0b25DbG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFN0ZXBJbmRleCA+IC0xKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50U3RlcCA9IHRoaXMuX2FjdGl2ZVdhbGt0aHJvdWdoU3RlcHNbdGhpcy5fY3VycmVudFN0ZXBJbmRleF07XG5cdFx0XHR0aGlzLl9nZXR0aW5nU3RhcnRlZFBhZ2UubWFrZUNhdGVnb3J5VmlzaWJsZVdoZW5BdmFpbGFibGUodGhpcy5fd2Fsa3Rocm91Z2guaWQsIGN1cnJlbnRTdGVwLmlkKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsb0JBQXlHLGdDQUFnQztBQUVsSixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLG9CQUFvQix3QkFBd0I7QUFDckQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBeUQsNEJBQTRCO0FBQ3JGLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBdUI7QUFFaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFFakIsTUFBTSw2QkFBc0U7QUFBQSxFQUE1RTtBQUNOLFNBQVMsT0FBTyxtQkFBbUI7QUFDbkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsT0FBTztBQUNoQixTQUFTLE9BQU87QUFFaEIsdUJBQWMsQ0FBQyxhQUFpRztBQUMvRyxZQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxZQUFNLGFBQWEsY0FBYztBQUNqQyxVQUFJLEVBQUUsc0JBQXNCLHFCQUFxQjtBQUNo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
