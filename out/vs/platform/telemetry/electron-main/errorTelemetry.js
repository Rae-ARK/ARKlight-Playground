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
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from "../../../base/common/errors.js";
import BaseErrorTelemetry from "../common/errorTelemetry.js";
import { ITelemetryService } from "../common/telemetry.js";
let ErrorTelemetry = class extends BaseErrorTelemetry {
  constructor(logService, telemetryService) {
    super(telemetryService);
    this.logService = logService;
  }
  installErrorListeners() {
    setUnexpectedErrorHandler((error) => this.onUnexpectedError(error));
    process.on("uncaughtException", (error) => {
      if (!isSigPipeError(error)) {
        onUnexpectedError(error);
      }
    });
    process.on("unhandledRejection", (reason) => onUnexpectedError(reason));
  }
  onUnexpectedError(error) {
    this.logService.error(`[uncaught exception in main]: ${error}`);
    if (error.stack) {
      this.logService.error(error.stack);
    }
  }
};
ErrorTelemetry = __decorateClass([
  __decorateParam(1, ITelemetryService)
], ErrorTelemetry);
export {
  ErrorTelemetry as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RlbGVtZXRyeS9lbGVjdHJvbi1tYWluL2Vycm9yVGVsZW1ldHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNTaWdQaXBlRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCBCYXNlRXJyb3JUZWxlbWV0cnkgZnJvbSAnLi4vY29tbW9uL2Vycm9yVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRXJyb3JUZWxlbWV0cnkgZXh0ZW5kcyBCYXNlRXJyb3JUZWxlbWV0cnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbnN0YWxsRXJyb3JMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Ly8gV2UgaGFuZGxlIHVuY2F1Z2h0IGV4Y2VwdGlvbnMgaGVyZSB0byBwcmV2ZW50IGVsZWN0cm9uIGZyb20gb3BlbmluZyBhIGRpYWxvZyB0byB0aGUgdXNlclxuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoZXJyb3IgPT4gdGhpcy5vblVuZXhwZWN0ZWRFcnJvcihlcnJvcikpO1xuXG5cdFx0cHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnJvciA9PiB7XG5cdFx0XHRpZiAoIWlzU2lnUGlwZUVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwcm9jZXNzLm9uKCd1bmhhbmRsZWRSZWplY3Rpb24nLCAocmVhc29uOiB1bmtub3duKSA9PiBvblVuZXhwZWN0ZWRFcnJvcihyZWFzb24pKTtcblx0fVxuXG5cdHByaXZhdGUgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3I6IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbdW5jYXVnaHQgZXhjZXB0aW9uIGluIG1haW5dOiAke2Vycm9yfWApO1xuXHRcdGlmIChlcnJvci5zdGFjaykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yLnN0YWNrKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0IsbUJBQW1CLGlDQUFpQztBQUM3RSxPQUFPLHdCQUF3QjtBQUMvQixTQUFTLHlCQUF5QjtBQUdsQyxJQUFxQixpQkFBckIsY0FBNEMsbUJBQW1CO0FBQUEsRUFDOUQsWUFDa0IsWUFDRSxrQkFDbEI7QUFDRCxVQUFNLGdCQUFnQjtBQUhMO0FBQUEsRUFJbEI7QUFBQSxFQUVtQix3QkFBOEI7QUFFaEQsOEJBQTBCLFdBQVMsS0FBSyxrQkFBa0IsS0FBSyxDQUFDO0FBRWhFLFlBQVEsR0FBRyxxQkFBcUIsV0FBUztBQUN4QyxVQUFJLENBQUMsZUFBZSxLQUFLLEdBQUc7QUFDM0IsMEJBQWtCLEtBQUs7QUFBQSxNQUN4QjtBQUFBLElBQ0QsQ0FBQztBQUVELFlBQVEsR0FBRyxzQkFBc0IsQ0FBQyxXQUFvQixrQkFBa0IsTUFBTSxDQUFDO0FBQUEsRUFDaEY7QUFBQSxFQUVRLGtCQUFrQixPQUFvQjtBQUM3QyxTQUFLLFdBQVcsTUFBTSxpQ0FBaUMsS0FBSyxFQUFFO0FBQzlELFFBQUksTUFBTSxPQUFPO0FBQ2hCLFdBQUssV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUNEO0FBM0JxQixpQkFBckI7QUFBQSxFQUdHO0FBQUEsR0FIa0I7IiwKICAibmFtZXMiOiBbXQp9Cg==
