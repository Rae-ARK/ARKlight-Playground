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
import { IPromptsService } from "../service/promptsService.js";
let PromptLinkProvider = class {
  constructor(promptsService) {
    this.promptsService = promptsService;
  }
  /**
   * Provide list of links for the provided text model.
   */
  async provideLinks(model, token) {
    const promptAST = this.promptsService.getParsedPromptFile(model);
    if (!promptAST.body) {
      return;
    }
    const links = [];
    for (const ref of promptAST.body.fileReferences) {
      if (!ref.isMarkdownLink) {
        const url = promptAST.body.resolveFilePath(ref.content);
        if (url) {
          links.push({ range: ref.range, url });
        }
      }
    }
    return { links };
  }
};
PromptLinkProvider = __decorateClass([
  __decorateParam(0, IPromptsService)
], PromptLinkProvider);
export {
  PromptLinkProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRMaW5rUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElMaW5rLCBJTGlua3NMaXN0LCBMaW5rUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5cbi8qKlxuICogUHJvdmlkZXMgbGluayByZWZlcmVuY2VzIGZvciBwcm9tcHQgZmlsZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRMaW5rUHJvdmlkZXIgaW1wbGVtZW50cyBMaW5rUHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHQvKipcblx0ICogUHJvdmlkZSBsaXN0IG9mIGxpbmtzIGZvciB0aGUgcHJvdmlkZWQgdGV4dCBtb2RlbC5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBwcm92aWRlTGlua3MobW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUxpbmtzTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb21wdEFTVCA9IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbCk7XG5cdFx0aWYgKCFwcm9tcHRBU1QuYm9keSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaW5rczogSUxpbmtbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHByb21wdEFTVC5ib2R5LmZpbGVSZWZlcmVuY2VzKSB7XG5cdFx0XHRpZiAoIXJlZi5pc01hcmtkb3duTGluaykge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBwcm9tcHRBU1QuYm9keS5yZXNvbHZlRmlsZVBhdGgocmVmLmNvbnRlbnQpO1xuXHRcdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdFx0bGlua3MucHVzaCh7IHJhbmdlOiByZWYucmFuZ2UsIHVybCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBsaW5rcyB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBUXpCLElBQU0scUJBQU4sTUFBaUQ7QUFBQSxFQUN2RCxZQUNtQyxnQkFDakM7QUFEaUM7QUFBQSxFQUVuQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSxhQUFhLE9BQW1CLE9BQTJEO0FBQ3ZHLFVBQU0sWUFBWSxLQUFLLGVBQWUsb0JBQW9CLEtBQUs7QUFDL0QsUUFBSSxDQUFDLFVBQVUsTUFBTTtBQUNwQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQWlCLENBQUM7QUFDeEIsZUFBVyxPQUFPLFVBQVUsS0FBSyxnQkFBZ0I7QUFDaEQsVUFBSSxDQUFDLElBQUksZ0JBQWdCO0FBQ3hCLGNBQU0sTUFBTSxVQUFVLEtBQUssZ0JBQWdCLElBQUksT0FBTztBQUN0RCxZQUFJLEtBQUs7QUFDUixnQkFBTSxLQUFLLEVBQUUsT0FBTyxJQUFJLE9BQU8sSUFBSSxDQUFDO0FBQUEsUUFDckM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxNQUFNO0FBQUEsRUFDaEI7QUFDRDtBQXpCYSxxQkFBTjtBQUFBLEVBRUo7QUFBQSxHQUZVOyIsCiAgIm5hbWVzIjogW10KfQo=
