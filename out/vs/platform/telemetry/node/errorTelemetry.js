import { isCancellationError, isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from "../../../base/common/errors.js";
import BaseErrorTelemetry from "../common/errorTelemetry.js";
class ErrorTelemetry extends BaseErrorTelemetry {
  installErrorListeners() {
    setUnexpectedErrorHandler((err) => console.error(err));
    const unhandledPromises = [];
    process.on("unhandledRejection", (reason, promise) => {
      unhandledPromises.push(promise);
      setTimeout(() => {
        const idx = unhandledPromises.indexOf(promise);
        if (idx >= 0) {
          promise.catch((e) => {
            unhandledPromises.splice(idx, 1);
            if (!isCancellationError(e)) {
              console.warn(`rejected promise not handled within 1 second: ${e}`);
              if (e.stack) {
                console.warn(`stack trace: ${e.stack}`);
              }
              if (reason) {
                onUnexpectedError(reason);
              }
            }
          });
        }
      }, 1e3);
    });
    process.on("rejectionHandled", (promise) => {
      const idx = unhandledPromises.indexOf(promise);
      if (idx >= 0) {
        unhandledPromises.splice(idx, 1);
      }
    });
    process.on("uncaughtException", (err) => {
      if (isSigPipeError(err)) {
        return;
      }
      onUnexpectedError(err);
    });
  }
}
export {
  ErrorTelemetry as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RlbGVtZXRyeS9ub2RlL2Vycm9yVGVsZW1ldHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciwgaXNTaWdQaXBlRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCBCYXNlRXJyb3JUZWxlbWV0cnkgZnJvbSAnLi4vY29tbW9uL2Vycm9yVGVsZW1ldHJ5LmpzJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRXJyb3JUZWxlbWV0cnkgZXh0ZW5kcyBCYXNlRXJyb3JUZWxlbWV0cnkge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaW5zdGFsbEVycm9yTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoZXJyID0+IGNvbnNvbGUuZXJyb3IoZXJyKSk7XG5cblx0XHQvLyBQcmludCBhIGNvbnNvbGUgbWVzc2FnZSB3aGVuIHJlamVjdGlvbiBpc24ndCBoYW5kbGVkIHdpdGhpbiBOIHNlY29uZHMuIEZvciBkZXRhaWxzOlxuXHRcdC8vIHNlZSBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX2V2ZW50X3VuaGFuZGxlZHJlamVjdGlvblxuXHRcdC8vIGFuZCBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX2V2ZW50X3JlamVjdGlvbmhhbmRsZWRcblx0XHRjb25zdCB1bmhhbmRsZWRQcm9taXNlczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cdFx0cHJvY2Vzcy5vbigndW5oYW5kbGVkUmVqZWN0aW9uJywgKHJlYXNvbjogdW5rbm93biwgcHJvbWlzZTogUHJvbWlzZTx1bmtub3duPikgPT4ge1xuXHRcdFx0dW5oYW5kbGVkUHJvbWlzZXMucHVzaChwcm9taXNlKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZHggPSB1bmhhbmRsZWRQcm9taXNlcy5pbmRleE9mKHByb21pc2UpO1xuXHRcdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0XHRwcm9taXNlLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHRcdFx0dW5oYW5kbGVkUHJvbWlzZXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKGByZWplY3RlZCBwcm9taXNlIG5vdCBoYW5kbGVkIHdpdGhpbiAxIHNlY29uZDogJHtlfWApO1xuXHRcdFx0XHRcdFx0XHRpZiAoZS5zdGFjaykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnNvbGUud2Fybihgc3RhY2sgdHJhY2U6ICR7ZS5zdGFja31gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAocmVhc29uKSB7XG5cdFx0XHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IocmVhc29uKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMDAwKTtcblx0XHR9KTtcblxuXHRcdHByb2Nlc3Mub24oJ3JlamVjdGlvbkhhbmRsZWQnLCAocHJvbWlzZTogUHJvbWlzZTx1bmtub3duPikgPT4ge1xuXHRcdFx0Y29uc3QgaWR4ID0gdW5oYW5kbGVkUHJvbWlzZXMuaW5kZXhPZihwcm9taXNlKTtcblx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHR1bmhhbmRsZWRQcm9taXNlcy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFByaW50IGEgY29uc29sZSBtZXNzYWdlIHdoZW4gYW4gZXhjZXB0aW9uIGlzbid0IGhhbmRsZWQuXG5cdFx0cHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCAoZXJyOiBFcnJvciB8IE5vZGVKUy5FcnJub0V4Y2VwdGlvbikgPT4ge1xuXHRcdFx0aWYgKGlzU2lnUGlwZUVycm9yKGVycikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHFCQUFxQixnQkFBZ0IsbUJBQW1CLGlDQUFpQztBQUNsRyxPQUFPLHdCQUF3QjtBQUUvQixNQUFPLHVCQUFxQyxtQkFBbUI7QUFBQSxFQUMzQyx3QkFBOEI7QUFDaEQsOEJBQTBCLFNBQU8sUUFBUSxNQUFNLEdBQUcsQ0FBQztBQUtuRCxVQUFNLG9CQUF3QyxDQUFDO0FBQy9DLFlBQVEsR0FBRyxzQkFBc0IsQ0FBQyxRQUFpQixZQUE4QjtBQUNoRix3QkFBa0IsS0FBSyxPQUFPO0FBQzlCLGlCQUFXLE1BQU07QUFDaEIsY0FBTSxNQUFNLGtCQUFrQixRQUFRLE9BQU87QUFDN0MsWUFBSSxPQUFPLEdBQUc7QUFDYixrQkFBUSxNQUFNLE9BQUs7QUFDbEIsOEJBQWtCLE9BQU8sS0FBSyxDQUFDO0FBQy9CLGdCQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRztBQUM1QixzQkFBUSxLQUFLLGlEQUFpRCxDQUFDLEVBQUU7QUFDakUsa0JBQUksRUFBRSxPQUFPO0FBQ1osd0JBQVEsS0FBSyxnQkFBZ0IsRUFBRSxLQUFLLEVBQUU7QUFBQSxjQUN2QztBQUNBLGtCQUFJLFFBQVE7QUFDWCxrQ0FBa0IsTUFBTTtBQUFBLGNBQ3pCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNELEdBQUcsR0FBSTtBQUFBLElBQ1IsQ0FBQztBQUVELFlBQVEsR0FBRyxvQkFBb0IsQ0FBQyxZQUE4QjtBQUM3RCxZQUFNLE1BQU0sa0JBQWtCLFFBQVEsT0FBTztBQUM3QyxVQUFJLE9BQU8sR0FBRztBQUNiLDBCQUFrQixPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ2hDO0FBQUEsSUFDRCxDQUFDO0FBR0QsWUFBUSxHQUFHLHFCQUFxQixDQUFDLFFBQXVDO0FBQ3ZFLFVBQUksZUFBZSxHQUFHLEdBQUc7QUFDeEI7QUFBQSxNQUNEO0FBRUEsd0JBQWtCLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
