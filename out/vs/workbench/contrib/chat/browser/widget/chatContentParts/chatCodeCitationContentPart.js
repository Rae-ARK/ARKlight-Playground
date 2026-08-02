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
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { getCodeCitationsMessage } from "../../../common/model/chatModel.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
let ChatCodeCitationContentPart = class extends Disposable {
  constructor(citations, context, editorService, telemetryService) {
    super();
    this.editorService = editorService;
    this.telemetryService = telemetryService;
    const label = getCodeCitationsMessage(citations.citations);
    const elements = dom.h(".chat-code-citation-message@root", [
      dom.h("span.chat-code-citation-label@label"),
      dom.h(".chat-code-citation-button-container@button")
    ]);
    elements.label.textContent = label + " - ";
    const button = this._register(new Button(elements.button, {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0
    }));
    button.label = localize("viewMatches", "View matches");
    this._register(button.onDidClick(() => {
      const citationText = `# Code Citations

` + citations.citations.map((c) => `## License: ${c.license}
${c.value.toString()}

\`\`\`
${c.snippet}
\`\`\`

`).join("\n");
      this.editorService.openEditor({ resource: void 0, contents: citationText, languageId: "markdown" });
      this.telemetryService.publicLog2("openedChatCodeCitations");
    }));
    this.domNode = elements.root;
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "codeCitations";
  }
};
ChatCodeCitationContentPart = __decorateClass([
  __decorateParam(2, IEditorService),
  __decorateParam(3, ITelemetryService)
], ChatCodeCitationContentPart);
export {
  ChatCodeCitationContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29kZUNpdGF0aW9uQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlQ2l0YXRpb25zTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQ2l0YXRpb25zLCBJQ2hhdFJlbmRlcmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcblxudHlwZSBDaGF0Q29kZUNpdGF0aW9uT3BlbmVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAncm9ibG91cmVucyc7XG5cdGNvbW1lbnQ6ICdJbmRpY2F0ZXMgd2hlbiBhIHVzZXIgb3BlbnMgY2hhdCBjb2RlIGNpdGF0aW9ucyc7XG59O1xuXG5leHBvcnQgY2xhc3MgQ2hhdENvZGVDaXRhdGlvbkNvbnRlbnRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y2l0YXRpb25zOiBJQ2hhdENvZGVDaXRhdGlvbnMsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gZ2V0Q29kZUNpdGF0aW9uc01lc3NhZ2UoY2l0YXRpb25zLmNpdGF0aW9ucyk7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBkb20uaCgnLmNoYXQtY29kZS1jaXRhdGlvbi1tZXNzYWdlQHJvb3QnLCBbXG5cdFx0XHRkb20uaCgnc3Bhbi5jaGF0LWNvZGUtY2l0YXRpb24tbGFiZWxAbGFiZWwnKSxcblx0XHRcdGRvbS5oKCcuY2hhdC1jb2RlLWNpdGF0aW9uLWJ1dHRvbi1jb250YWluZXJAYnV0dG9uJyksXG5cdFx0XSk7XG5cdFx0ZWxlbWVudHMubGFiZWwudGV4dENvbnRlbnQgPSBsYWJlbCArICcgLSAnO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZWxlbWVudHMuYnV0dG9uLCB7XG5cdFx0XHRidXR0b25CYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Cb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvbkZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvbkhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZXBhcmF0b3I6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgndmlld01hdGNoZXMnLCBcIlZpZXcgbWF0Y2hlc1wiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRjb25zdCBjaXRhdGlvblRleHQgPSBgIyBDb2RlIENpdGF0aW9uc1xcblxcbmAgKyBjaXRhdGlvbnMuY2l0YXRpb25zLm1hcChjID0+IGAjIyBMaWNlbnNlOiAke2MubGljZW5zZX1cXG4ke2MudmFsdWUudG9TdHJpbmcoKX1cXG5cXG5cXGBcXGBcXGBcXG4ke2Muc25pcHBldH1cXG5cXGBcXGBcXGBcXG5cXG5gKS5qb2luKCdcXG4nKTtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVuZGVmaW5lZCwgY29udGVudHM6IGNpdGF0aW9uVGV4dCwgbGFuZ3VhZ2VJZDogJ21hcmtkb3duJyB9KTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCBDaGF0Q29kZUNpdGF0aW9uT3BlbmVkQ2xhc3NpZmljYXRpb24+KCdvcGVuZWRDaGF0Q29kZUNpdGF0aW9ucycpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBlbGVtZW50cy5yb290O1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ2NvZGVDaXRhdGlvbnMnO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxzQkFBc0I7QUFPeEIsSUFBTSw4QkFBTixjQUEwQyxXQUF1QztBQUFBLEVBR3ZGLFlBQ0MsV0FDQSxTQUNpQyxlQUNHLGtCQUNuQztBQUNELFVBQU07QUFIMkI7QUFDRztBQUlwQyxVQUFNLFFBQVEsd0JBQXdCLFVBQVUsU0FBUztBQUN6RCxVQUFNLFdBQVcsSUFBSSxFQUFFLG9DQUFvQztBQUFBLE1BQzFELElBQUksRUFBRSxxQ0FBcUM7QUFBQSxNQUMzQyxJQUFJLEVBQUUsNkNBQTZDO0FBQUEsSUFDcEQsQ0FBQztBQUNELGFBQVMsTUFBTSxjQUFjLFFBQVE7QUFDckMsVUFBTSxTQUFTLEtBQUssVUFBVSxJQUFJLE9BQU8sU0FBUyxRQUFRO0FBQUEsTUFDekQsa0JBQWtCO0FBQUEsTUFDbEIsY0FBYztBQUFBLE1BQ2Qsa0JBQWtCO0FBQUEsTUFDbEIsdUJBQXVCO0FBQUEsTUFDdkIsMkJBQTJCO0FBQUEsTUFDM0IsMkJBQTJCO0FBQUEsTUFDM0IsZ0NBQWdDO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxRQUFRLFNBQVMsZUFBZSxjQUFjO0FBQ3JELFNBQUssVUFBVSxPQUFPLFdBQVcsTUFBTTtBQUN0QyxZQUFNLGVBQWU7QUFBQTtBQUFBLElBQXlCLFVBQVUsVUFBVSxJQUFJLE9BQUssZUFBZSxFQUFFLE9BQU87QUFBQSxFQUFLLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFBQTtBQUFBO0FBQUEsRUFBZSxFQUFFLE9BQU87QUFBQTtBQUFBO0FBQUEsQ0FBYyxFQUFFLEtBQUssSUFBSTtBQUMzSyxXQUFLLGNBQWMsV0FBVyxFQUFFLFVBQVUsUUFBVyxVQUFVLGNBQWMsWUFBWSxXQUFXLENBQUM7QUFDckcsV0FBSyxpQkFBaUIsV0FBcUQseUJBQXlCO0FBQUEsSUFDckcsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLFNBQVM7QUFBQSxFQUN6QjtBQUFBLEVBRUEsZUFBZSxPQUE2QixrQkFBMEMsU0FBZ0M7QUFDckgsV0FBTyxNQUFNLFNBQVM7QUFBQSxFQUN2QjtBQUNEO0FBdkNhLDhCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
