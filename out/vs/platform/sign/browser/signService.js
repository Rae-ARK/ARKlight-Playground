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
import { importAMDNodeModule, resolveAmdNodeModulePath } from "../../../amdX.js";
import { WindowIntervalTimer } from "../../../base/browser/dom.js";
import { mainWindow } from "../../../base/browser/window.js";
import { memoize } from "../../../base/common/decorators.js";
import { IProductService } from "../../product/common/productService.js";
import { AbstractSignService } from "../common/abstractSignService.js";
const KEY_SIZE = 32;
const IV_SIZE = 16;
const STEP_SIZE = KEY_SIZE + IV_SIZE;
let SignService = class extends AbstractSignService {
  constructor(productService) {
    super();
    this.productService = productService;
  }
  getValidator() {
    return this.vsda().then((vsda) => {
      const v = new vsda.validator();
      return {
        createNewMessage: (arg) => v.createNewMessage(arg),
        validate: (arg) => v.validate(arg),
        dispose: () => v.free()
      };
    });
  }
  signValue(arg) {
    return this.vsda().then((vsda) => vsda.sign(arg));
  }
  async vsda() {
    const checkInterval = new WindowIntervalTimer();
    let [wasm] = await Promise.all([
      this.getWasmBytes(),
      new Promise((resolve, reject) => {
        importAMDNodeModule("vsda", "rust/web/vsda.js").then(() => resolve(), reject);
        checkInterval.cancelAndSet(() => {
          if (typeof vsda_web !== "undefined") {
            resolve();
          }
        }, 50, mainWindow);
      }).finally(() => checkInterval.dispose())
    ]);
    const keyBytes = new TextEncoder().encode(this.productService.serverLicense?.join("\n") || "");
    for (let i = 0; i + STEP_SIZE < keyBytes.length; i += STEP_SIZE) {
      const key = await crypto.subtle.importKey("raw", keyBytes.slice(i + IV_SIZE, i + IV_SIZE + KEY_SIZE), { name: "AES-CBC" }, false, ["decrypt"]);
      wasm = await crypto.subtle.decrypt({ name: "AES-CBC", iv: keyBytes.slice(i, i + IV_SIZE) }, key, wasm);
    }
    await vsda_web.default(wasm);
    return vsda_web;
  }
  async getWasmBytes() {
    const url = resolveAmdNodeModulePath("vsda", "rust/web/vsda_bg.wasm");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("error loading vsda");
    }
    return response.arrayBuffer();
  }
};
__decorateClass([
  memoize
], SignService.prototype, "vsda", 1);
SignService = __decorateClass([
  __decorateParam(0, IProductService)
], SignService);
export {
  SignService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NpZ24vYnJvd3Nlci9zaWduU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUsIHJlc29sdmVBbWROb2RlTW9kdWxlUGF0aCB9IGZyb20gJy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgV2luZG93SW50ZXJ2YWxUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RTaWduU2VydmljZSwgSVZzZGFWYWxpZGF0b3IgfSBmcm9tICcuLi9jb21tb24vYWJzdHJhY3RTaWduU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2lnblNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2lnbi5qcyc7XG5cbmRlY2xhcmUgbmFtZXNwYWNlIHZzZGFXZWIge1xuXHRleHBvcnQgZnVuY3Rpb24gc2lnbihzYWx0ZWRfbWVzc2FnZTogc3RyaW5nKTogc3RyaW5nO1xuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0ZXhwb3J0IGNsYXNzIHZhbGlkYXRvciB7XG5cdFx0ZnJlZSgpOiB2b2lkO1xuXHRcdGNvbnN0cnVjdG9yKCk7XG5cdFx0Y3JlYXRlTmV3TWVzc2FnZShvcmlnaW5hbDogc3RyaW5nKTogc3RyaW5nO1xuXHRcdHZhbGlkYXRlKHNpZ25lZF9tZXNzYWdlOiBzdHJpbmcpOiAnb2snIHwgJ2Vycm9yJztcblx0fVxuXG5cdGV4cG9ydCB0eXBlIEluaXRJbnB1dCA9IFJlcXVlc3RJbmZvIHwgVVJMIHwgUmVzcG9uc2UgfCBCdWZmZXJTb3VyY2UgfCBXZWJBc3NlbWJseS5Nb2R1bGU7XG5cdGV4cG9ydCBmdW5jdGlvbiBpbml0KG1vZHVsZV9vcl9wYXRoPzogSW5pdElucHV0IHwgUHJvbWlzZTxJbml0SW5wdXQ+KTogUHJvbWlzZTx1bmtub3duPjtcbn1cblxuLy8gSW5pdGlhbGl6ZWQgaWYvd2hlbiB2c2RhIGlzIGxvYWRlZFxuZGVjbGFyZSBjb25zdCB2c2RhX3dlYjoge1xuXHRkZWZhdWx0OiB0eXBlb2YgdnNkYVdlYi5pbml0O1xuXHRzaWduOiB0eXBlb2YgdnNkYVdlYi5zaWduO1xuXHR2YWxpZGF0b3I6IHR5cGVvZiB2c2RhV2ViLnZhbGlkYXRvcjtcbn07XG5cbmNvbnN0IEtFWV9TSVpFID0gMzI7XG5jb25zdCBJVl9TSVpFID0gMTY7XG5jb25zdCBTVEVQX1NJWkUgPSBLRVlfU0laRSArIElWX1NJWkU7XG5cbmV4cG9ydCBjbGFzcyBTaWduU2VydmljZSBleHRlbmRzIEFic3RyYWN0U2lnblNlcnZpY2UgaW1wbGVtZW50cyBJU2lnblNlcnZpY2Uge1xuXHRjb25zdHJ1Y3RvcihASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFZhbGlkYXRvcigpOiBQcm9taXNlPElWc2RhVmFsaWRhdG9yPiB7XG5cdFx0cmV0dXJuIHRoaXMudnNkYSgpLnRoZW4odnNkYSA9PiB7XG5cdFx0XHRjb25zdCB2ID0gbmV3IHZzZGEudmFsaWRhdG9yKCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjcmVhdGVOZXdNZXNzYWdlOiBhcmcgPT4gdi5jcmVhdGVOZXdNZXNzYWdlKGFyZyksXG5cdFx0XHRcdHZhbGlkYXRlOiBhcmcgPT4gdi52YWxpZGF0ZShhcmcpLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB2LmZyZWUoKSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2lnblZhbHVlKGFyZzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy52c2RhKCkudGhlbih2c2RhID0+IHZzZGEuc2lnbihhcmcpKTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgYXN5bmMgdnNkYSgpOiBQcm9taXNlPHR5cGVvZiB2c2RhX3dlYj4ge1xuXHRcdGNvbnN0IGNoZWNrSW50ZXJ2YWwgPSBuZXcgV2luZG93SW50ZXJ2YWxUaW1lcigpO1xuXHRcdGxldCBbd2FzbV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLmdldFdhc21CeXRlcygpLFxuXHRcdFx0bmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRpbXBvcnRBTUROb2RlTW9kdWxlKCd2c2RhJywgJ3J1c3Qvd2ViL3ZzZGEuanMnKS50aGVuKCgpID0+IHJlc29sdmUoKSwgcmVqZWN0KTtcblxuXHRcdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHRoZXJlIHNlZW1zIHRvIGJlIGEgYnVnKD8pIGluIHZzY29kZS1sb2FkZXIgd2l0aFxuXHRcdFx0XHQvLyByZXF1aXJlKCkgbm90IHJlc29sdmluZyBpbiB3ZWIgb25jZSB0aGUgc2NyaXB0IGxvYWRzLCBzbyBjaGVjayBtYW51YWxseVxuXHRcdFx0XHRjaGVja0ludGVydmFsLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2c2RhX3dlYiAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDUwLCBtYWluV2luZG93KTtcblx0XHRcdH0pLmZpbmFsbHkoKCkgPT4gY2hlY2tJbnRlcnZhbC5kaXNwb3NlKCkpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qga2V5Qnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodGhpcy5wcm9kdWN0U2VydmljZS5zZXJ2ZXJMaWNlbnNlPy5qb2luKCdcXG4nKSB8fCAnJyk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgKyBTVEVQX1NJWkUgPCBrZXlCeXRlcy5sZW5ndGg7IGkgKz0gU1RFUF9TSVpFKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleSgncmF3Jywga2V5Qnl0ZXMuc2xpY2UoaSArIElWX1NJWkUsIGkgKyBJVl9TSVpFICsgS0VZX1NJWkUpLCB7IG5hbWU6ICdBRVMtQ0JDJyB9LCBmYWxzZSwgWydkZWNyeXB0J10pO1xuXHRcdFx0d2FzbSA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGVjcnlwdCh7IG5hbWU6ICdBRVMtQ0JDJywgaXY6IGtleUJ5dGVzLnNsaWNlKGksIGkgKyBJVl9TSVpFKSB9LCBrZXksIHdhc20pO1xuXHRcdH1cblxuXHRcdGF3YWl0IHZzZGFfd2ViLmRlZmF1bHQod2FzbSk7XG5cblx0XHRyZXR1cm4gdnNkYV93ZWI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFdhc21CeXRlcygpOiBQcm9taXNlPEFycmF5QnVmZmVyPiB7XG5cdFx0Y29uc3QgdXJsID0gcmVzb2x2ZUFtZE5vZGVNb2R1bGVQYXRoKCd2c2RhJywgJ3J1c3Qvd2ViL3ZzZGFfYmcud2FzbScpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsKTtcblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Vycm9yIGxvYWRpbmcgdnNkYScpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNwb25zZS5hcnJheUJ1ZmZlcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCLGdDQUFnQztBQUM5RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkM7QUF5QnBELE1BQU0sV0FBVztBQUNqQixNQUFNLFVBQVU7QUFDaEIsTUFBTSxZQUFZLFdBQVc7QUFFdEIsSUFBTSxjQUFOLGNBQTBCLG9CQUE0QztBQUFBLEVBQzVFLFlBQThDLGdCQUFpQztBQUM5RSxVQUFNO0FBRHVDO0FBQUEsRUFFOUM7QUFBQSxFQUNtQixlQUF3QztBQUMxRCxXQUFPLEtBQUssS0FBSyxFQUFFLEtBQUssVUFBUTtBQUMvQixZQUFNLElBQUksSUFBSSxLQUFLLFVBQVU7QUFDN0IsYUFBTztBQUFBLFFBQ04sa0JBQWtCLFNBQU8sRUFBRSxpQkFBaUIsR0FBRztBQUFBLFFBQy9DLFVBQVUsU0FBTyxFQUFFLFNBQVMsR0FBRztBQUFBLFFBQy9CLFNBQVMsTUFBTSxFQUFFLEtBQUs7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVtQixVQUFVLEtBQThCO0FBQzFELFdBQU8sS0FBSyxLQUFLLEVBQUUsS0FBSyxVQUFRLEtBQUssS0FBSyxHQUFHLENBQUM7QUFBQSxFQUMvQztBQUFBLEVBR0EsTUFBYyxPQUFpQztBQUM5QyxVQUFNLGdCQUFnQixJQUFJLG9CQUFvQjtBQUM5QyxRQUFJLENBQUMsSUFBSSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDOUIsS0FBSyxhQUFhO0FBQUEsTUFDbEIsSUFBSSxRQUFjLENBQUMsU0FBUyxXQUFXO0FBQ3RDLDRCQUFvQixRQUFRLGtCQUFrQixFQUFFLEtBQUssTUFBTSxRQUFRLEdBQUcsTUFBTTtBQUk1RSxzQkFBYyxhQUFhLE1BQU07QUFDaEMsY0FBSSxPQUFPLGFBQWEsYUFBYTtBQUNwQyxvQkFBUTtBQUFBLFVBQ1Q7QUFBQSxRQUNELEdBQUcsSUFBSSxVQUFVO0FBQUEsTUFDbEIsQ0FBQyxFQUFFLFFBQVEsTUFBTSxjQUFjLFFBQVEsQ0FBQztBQUFBLElBQ3pDLENBQUM7QUFFRCxVQUFNLFdBQVcsSUFBSSxZQUFZLEVBQUUsT0FBTyxLQUFLLGVBQWUsZUFBZSxLQUFLLElBQUksS0FBSyxFQUFFO0FBQzdGLGFBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxTQUFTLFFBQVEsS0FBSyxXQUFXO0FBQ2hFLFlBQU0sTUFBTSxNQUFNLE9BQU8sT0FBTyxVQUFVLE9BQU8sU0FBUyxNQUFNLElBQUksU0FBUyxJQUFJLFVBQVUsUUFBUSxHQUFHLEVBQUUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUM3SSxhQUFPLE1BQU0sT0FBTyxPQUFPLFFBQVEsRUFBRSxNQUFNLFdBQVcsSUFBSSxTQUFTLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxHQUFHLEtBQUssSUFBSTtBQUFBLElBQ3RHO0FBRUEsVUFBTSxTQUFTLFFBQVEsSUFBSTtBQUUzQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxlQUFxQztBQUNsRCxVQUFNLE1BQU0seUJBQXlCLFFBQVEsdUJBQXVCO0FBQ3BFLFVBQU0sV0FBVyxNQUFNLE1BQU0sR0FBRztBQUNoQyxRQUFJLENBQUMsU0FBUyxJQUFJO0FBQ2pCLFlBQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUFBLElBQ3JDO0FBRUEsV0FBTyxTQUFTLFlBQVk7QUFBQSxFQUM3QjtBQUNEO0FBckNlO0FBQUEsRUFEYjtBQUFBLEdBbkJXLFlBb0JFO0FBcEJGLGNBQU47QUFBQSxFQUNPO0FBQUEsR0FERDsiLAogICJuYW1lcyI6IFtdCn0K
