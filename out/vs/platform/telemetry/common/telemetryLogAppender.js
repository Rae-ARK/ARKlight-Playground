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
import { Disposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { ILoggerService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { TelemetryLogGroup, isLoggingOnly, telemetryLogId, validateTelemetryData } from "./telemetryUtils.js";
let TelemetryLogAppender = class extends Disposable {
  constructor(prefix, remote, loggerService, environmentService, productService) {
    super();
    this.prefix = prefix;
    const id = remote ? "remoteTelemetry" : telemetryLogId;
    const logger = loggerService.getLogger(id);
    if (logger) {
      this.logger = this._register(logger);
    } else {
      const justLoggingAndNotSending = isLoggingOnly(productService, environmentService);
      const logSuffix = justLoggingAndNotSending ? " (Not Sent)" : "";
      this.logger = this._register(loggerService.createLogger(
        id,
        {
          name: localize("telemetryLog", "Telemetry{0}", logSuffix),
          group: TelemetryLogGroup,
          hidden: true
        }
      ));
    }
  }
  flush() {
    return Promise.resolve();
  }
  log(eventName, data) {
    this.logger.trace(`${this.prefix}telemetry/${eventName}`, validateTelemetryData(data));
  }
};
TelemetryLogAppender = __decorateClass([
  __decorateParam(2, ILoggerService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IProductService)
], TelemetryLogAppender);
export {
  TelemetryLogAppender
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5TG9nQXBwZW5kZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5QXBwZW5kZXIsIFRlbGVtZXRyeUxvZ0dyb3VwLCBpc0xvZ2dpbmdPbmx5LCB0ZWxlbWV0cnlMb2dJZCwgdmFsaWRhdGVUZWxlbWV0cnlEYXRhIH0gZnJvbSAnLi90ZWxlbWV0cnlVdGlscy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZWxlbWV0cnlMb2dBcHBlbmRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVsZW1ldHJ5QXBwZW5kZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJlZml4OiBzdHJpbmcsXG5cdFx0cmVtb3RlOiBib29sZWFuLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaWQgPSByZW1vdGUgPyAncmVtb3RlVGVsZW1ldHJ5JyA6IHRlbGVtZXRyeUxvZ0lkO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGxvZ2dlclNlcnZpY2UuZ2V0TG9nZ2VyKGlkKTtcblx0XHRpZiAobG9nZ2VyKSB7XG5cdFx0XHR0aGlzLmxvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vdCBhIHBlcmZlY3QgY2hlY2ssIGJ1dCBhIG5pY2Ugd2F5IHRvIGluZGljYXRlIGlmIHdlIG9ubHkgaGF2ZSBsb2dnaW5nIGVuYWJsZWQgZm9yIGRlYnVnIHB1cnBvc2VzIGFuZCBub3RoaW5nIGlzIGFjdHVhbGx5IGJlaW5nIHNlbnRcblx0XHRcdGNvbnN0IGp1c3RMb2dnaW5nQW5kTm90U2VuZGluZyA9IGlzTG9nZ2luZ09ubHkocHJvZHVjdFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSk7XG5cdFx0XHRjb25zdCBsb2dTdWZmaXggPSBqdXN0TG9nZ2luZ0FuZE5vdFNlbmRpbmcgPyAnIChOb3QgU2VudCknIDogJyc7XG5cdFx0XHR0aGlzLmxvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKGlkLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3RlbGVtZXRyeUxvZycsIFwiVGVsZW1ldHJ5ezB9XCIsIGxvZ1N1ZmZpeCksXG5cdFx0XHRcdFx0Z3JvdXA6IFRlbGVtZXRyeUxvZ0dyb3VwLFxuXHRcdFx0XHRcdGhpZGRlbjogdHJ1ZVxuXHRcdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Zmx1c2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0bG9nKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIudHJhY2UoYCR7dGhpcy5wcmVmaXh9dGVsZW1ldHJ5LyR7ZXZlbnROYW1lfWAsIHZhbGlkYXRlVGVsZW1ldHJ5RGF0YShkYXRhKSk7XG5cdH1cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFrQixzQkFBc0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBNkIsbUJBQW1CLGVBQWUsZ0JBQWdCLDZCQUE2QjtBQUVyRyxJQUFNLHVCQUFOLGNBQW1DLFdBQXlDO0FBQUEsRUFJbEYsWUFDa0IsUUFDakIsUUFDZ0IsZUFDSyxvQkFDSixnQkFDaEI7QUFDRCxVQUFNO0FBTlc7QUFRakIsVUFBTSxLQUFLLFNBQVMsb0JBQW9CO0FBQ3hDLFVBQU0sU0FBUyxjQUFjLFVBQVUsRUFBRTtBQUN6QyxRQUFJLFFBQVE7QUFDWCxXQUFLLFNBQVMsS0FBSyxVQUFVLE1BQU07QUFBQSxJQUNwQyxPQUFPO0FBRU4sWUFBTSwyQkFBMkIsY0FBYyxnQkFBZ0Isa0JBQWtCO0FBQ2pGLFlBQU0sWUFBWSwyQkFBMkIsZ0JBQWdCO0FBQzdELFdBQUssU0FBUyxLQUFLLFVBQVUsY0FBYztBQUFBLFFBQWE7QUFBQSxRQUN2RDtBQUFBLFVBQ0MsTUFBTSxTQUFTLGdCQUFnQixnQkFBZ0IsU0FBUztBQUFBLFVBQ3hELE9BQU87QUFBQSxVQUNQLFFBQVE7QUFBQSxRQUNUO0FBQUEsTUFBQyxDQUFDO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQXVCO0FBQ3RCLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFDeEI7QUFBQSxFQUVBLElBQUksV0FBbUIsTUFBcUI7QUFDM0MsU0FBSyxPQUFPLE1BQU0sR0FBRyxLQUFLLE1BQU0sYUFBYSxTQUFTLElBQUksc0JBQXNCLElBQUksQ0FBQztBQUFBLEVBQ3RGO0FBQ0Q7QUFyQ2EsdUJBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
