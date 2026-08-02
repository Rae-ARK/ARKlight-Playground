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
import { ILogService } from "../../../../platform/log/common/log.js";
import { SearchRange } from "../common/search.js";
import * as searchExtTypes from "../common/searchExtTypes.js";
function anchorGlob(glob) {
  return glob.startsWith("**") || glob.startsWith("/") ? glob : `/${glob}`;
}
function rangeToSearchRange(range) {
  return new SearchRange(range.start.line, range.start.character, range.end.line, range.end.character);
}
function searchRangeToRange(range) {
  return new searchExtTypes.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}
let OutputChannel = class {
  constructor(prefix, logService) {
    this.prefix = prefix;
    this.logService = logService;
  }
  appendLine(msg) {
    this.logService.debug(`${this.prefix}#search`, msg);
  }
};
OutputChannel = __decorateClass([
  __decorateParam(1, ILogService)
], OutputChannel);
export {
  OutputChannel,
  anchorGlob,
  rangeToSearchRange,
  searchRangeToRange
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvbm9kZS9yaXBncmVwU2VhcmNoVXRpbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNlYXJjaFJhbmdlIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgKiBhcyBzZWFyY2hFeHRUeXBlcyBmcm9tICcuLi9jb21tb24vc2VhcmNoRXh0VHlwZXMuanMnO1xuXG5leHBvcnQgdHlwZSBNYXliZTxUPiA9IFQgfCBudWxsIHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgZnVuY3Rpb24gYW5jaG9yR2xvYihnbG9iOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gZ2xvYi5zdGFydHNXaXRoKCcqKicpIHx8IGdsb2Iuc3RhcnRzV2l0aCgnLycpID8gZ2xvYiA6IGAvJHtnbG9ifWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByYW5nZVRvU2VhcmNoUmFuZ2UocmFuZ2U6IHNlYXJjaEV4dFR5cGVzLlJhbmdlKTogU2VhcmNoUmFuZ2Uge1xuXHRyZXR1cm4gbmV3IFNlYXJjaFJhbmdlKHJhbmdlLnN0YXJ0LmxpbmUsIHJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgcmFuZ2UuZW5kLmxpbmUsIHJhbmdlLmVuZC5jaGFyYWN0ZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VhcmNoUmFuZ2VUb1JhbmdlKHJhbmdlOiBTZWFyY2hSYW5nZSk6IHNlYXJjaEV4dFR5cGVzLlJhbmdlIHtcblx0cmV0dXJuIG5ldyBzZWFyY2hFeHRUeXBlcy5SYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPdXRwdXRDaGFubmVsIHtcblx0YXBwZW5kTGluZShtc2c6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRwdXRDaGFubmVsIGltcGxlbWVudHMgSU91dHB1dENoYW5uZWwge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHByZWZpeDogc3RyaW5nLCBASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkgeyB9XG5cblx0YXBwZW5kTGluZShtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgJHt0aGlzLnByZWZpeH0jc2VhcmNoYCwgbXNnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQjtBQUM1QixZQUFZLG9CQUFvQjtBQUl6QixTQUFTLFdBQVcsTUFBc0I7QUFDaEQsU0FBTyxLQUFLLFdBQVcsSUFBSSxLQUFLLEtBQUssV0FBVyxHQUFHLElBQUksT0FBTyxJQUFJLElBQUk7QUFDdkU7QUFFTyxTQUFTLG1CQUFtQixPQUEwQztBQUM1RSxTQUFPLElBQUksWUFBWSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sV0FBVyxNQUFNLElBQUksTUFBTSxNQUFNLElBQUksU0FBUztBQUNwRztBQUVPLFNBQVMsbUJBQW1CLE9BQTBDO0FBQzVFLFNBQU8sSUFBSSxlQUFlLE1BQU0sTUFBTSxpQkFBaUIsTUFBTSxhQUFhLE1BQU0sZUFBZSxNQUFNLFNBQVM7QUFDL0c7QUFNTyxJQUFNLGdCQUFOLE1BQThDO0FBQUEsRUFDcEQsWUFBb0IsUUFBOEMsWUFBeUI7QUFBdkU7QUFBOEM7QUFBQSxFQUEyQjtBQUFBLEVBRTdGLFdBQVcsS0FBbUI7QUFDN0IsU0FBSyxXQUFXLE1BQU0sR0FBRyxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQUEsRUFDbkQ7QUFDRDtBQU5hLGdCQUFOO0FBQUEsRUFDK0I7QUFBQSxHQUR6QjsiLAogICJuYW1lcyI6IFtdCn0K
