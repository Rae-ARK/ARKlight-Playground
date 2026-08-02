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
import { ThrottledDelayer } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { basename, dirname, joinPath } from "../../../base/common/resources.js";
import { ByteSize, FileOperationResult, IFileService, whenProviderRegistered } from "../../files/common/files.js";
import { BufferLogger } from "./bufferLog.js";
import { AbstractLoggerService, AbstractMessageLogger, LogLevel } from "./log.js";
const MAX_FILE_SIZE = 5 * ByteSize.MB;
let FileLogger = class extends AbstractMessageLogger {
  constructor(resource, level, donotUseFormatters, fileService) {
    super();
    this.resource = resource;
    this.donotUseFormatters = donotUseFormatters;
    this.fileService = fileService;
    this.backupIndex = 1;
    this.buffer = "";
    this.setLevel(level);
    this.flushDelayer = new ThrottledDelayer(
      100
      /* buffer saves over a short time */
    );
    this.initializePromise = this.initialize();
  }
  async flush() {
    if (!this.buffer) {
      return;
    }
    await this.initializePromise;
    let content = await this.loadContent();
    if (content.length > MAX_FILE_SIZE) {
      await this.fileService.writeFile(this.getBackupResource(), VSBuffer.fromString(content));
      content = "";
    }
    if (this.buffer) {
      content += this.buffer;
      this.buffer = "";
      await this.fileService.writeFile(this.resource, VSBuffer.fromString(content));
    }
  }
  async initialize() {
    try {
      await this.fileService.createFile(this.resource);
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_MODIFIED_SINCE) {
        throw error;
      }
    }
  }
  log(level, message) {
    if (this.donotUseFormatters) {
      this.buffer += message;
    } else {
      this.buffer += `${this.getCurrentTimestamp()} [${this.stringifyLogLevel(level)}] ${message}
`;
    }
    this.flushDelayer.trigger(() => this.flush());
  }
  getCurrentTimestamp() {
    const toTwoDigits = (v) => v < 10 ? `0${v}` : v;
    const toThreeDigits = (v) => v < 10 ? `00${v}` : v < 100 ? `0${v}` : v;
    const currentTime = /* @__PURE__ */ new Date();
    return `${currentTime.getFullYear()}-${toTwoDigits(currentTime.getMonth() + 1)}-${toTwoDigits(currentTime.getDate())} ${toTwoDigits(currentTime.getHours())}:${toTwoDigits(currentTime.getMinutes())}:${toTwoDigits(currentTime.getSeconds())}.${toThreeDigits(currentTime.getMilliseconds())}`;
  }
  getBackupResource() {
    this.backupIndex = this.backupIndex > 5 ? 1 : this.backupIndex;
    return joinPath(dirname(this.resource), `${basename(this.resource)}_${this.backupIndex++}`);
  }
  async loadContent() {
    try {
      const content = await this.fileService.readFile(this.resource);
      return content.value.toString();
    } catch (e) {
      return "";
    }
  }
  stringifyLogLevel(level) {
    switch (level) {
      case LogLevel.Debug:
        return "debug";
      case LogLevel.Error:
        return "error";
      case LogLevel.Info:
        return "info";
      case LogLevel.Trace:
        return "trace";
      case LogLevel.Warning:
        return "warning";
    }
    return "";
  }
};
FileLogger = __decorateClass([
  __decorateParam(3, IFileService)
], FileLogger);
class FileLoggerService extends AbstractLoggerService {
  constructor(logLevel, logsHome, fileService) {
    super(logLevel, logsHome);
    this.fileService = fileService;
  }
  doCreateLogger(resource, logLevel, options) {
    const logger = new BufferLogger(logLevel);
    whenProviderRegistered(resource, this.fileService).then(() => logger.logger = new FileLogger(resource, logger.getLevel(), !!options?.donotUseFormatters, this.fileService));
    return logger;
  }
}
export {
  FileLoggerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xvZy9jb21tb24vZmlsZUxvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEJ5dGVTaXplLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgd2hlblByb3ZpZGVyUmVnaXN0ZXJlZCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBCdWZmZXJMb2dnZXIgfSBmcm9tICcuL2J1ZmZlckxvZy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdExvZ2dlclNlcnZpY2UsIEFic3RyYWN0TWVzc2FnZUxvZ2dlciwgSUxvZ2dlciwgSUxvZ2dlck9wdGlvbnMsIElMb2dnZXJTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4vbG9nLmpzJztcblxuY29uc3QgTUFYX0ZJTEVfU0laRSA9IDUgKiBCeXRlU2l6ZS5NQjtcblxuY2xhc3MgRmlsZUxvZ2dlciBleHRlbmRzIEFic3RyYWN0TWVzc2FnZUxvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbGl6ZVByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgZmx1c2hEZWxheWVyOiBUaHJvdHRsZWREZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIGJhY2t1cEluZGV4OiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIGJ1ZmZlcjogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdGxldmVsOiBMb2dMZXZlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRvbm90VXNlRm9ybWF0dGVyczogYm9vbGVhbixcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2V0TGV2ZWwobGV2ZWwpO1xuXHRcdHRoaXMuZmx1c2hEZWxheWVyID0gbmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oMTAwIC8qIGJ1ZmZlciBzYXZlcyBvdmVyIGEgc2hvcnQgdGltZSAqLyk7XG5cdFx0dGhpcy5pbml0aWFsaXplUHJvbWlzZSA9IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZmx1c2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmJ1ZmZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemVQcm9taXNlO1xuXHRcdGxldCBjb250ZW50ID0gYXdhaXQgdGhpcy5sb2FkQ29udGVudCgpO1xuXHRcdGlmIChjb250ZW50Lmxlbmd0aCA+IE1BWF9GSUxFX1NJWkUpIHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMuZ2V0QmFja3VwUmVzb3VyY2UoKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRjb250ZW50ID0gJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmJ1ZmZlcikge1xuXHRcdFx0Y29udGVudCArPSB0aGlzLmJ1ZmZlcjtcblx0XHRcdHRoaXMuYnVmZmVyID0gJyc7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLnJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh0aGlzLnJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGxvZyhsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRvbm90VXNlRm9ybWF0dGVycykge1xuXHRcdFx0dGhpcy5idWZmZXIgKz0gbWVzc2FnZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5idWZmZXIgKz0gYCR7dGhpcy5nZXRDdXJyZW50VGltZXN0YW1wKCl9IFske3RoaXMuc3RyaW5naWZ5TG9nTGV2ZWwobGV2ZWwpfV0gJHttZXNzYWdlfVxcbmA7XG5cdFx0fVxuXHRcdHRoaXMuZmx1c2hEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5mbHVzaCgpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VycmVudFRpbWVzdGFtcCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHRvVHdvRGlnaXRzID0gKHY6IG51bWJlcikgPT4gdiA8IDEwID8gYDAke3Z9YCA6IHY7XG5cdFx0Y29uc3QgdG9UaHJlZURpZ2l0cyA9ICh2OiBudW1iZXIpID0+IHYgPCAxMCA/IGAwMCR7dn1gIDogdiA8IDEwMCA/IGAwJHt2fWAgOiB2O1xuXHRcdGNvbnN0IGN1cnJlbnRUaW1lID0gbmV3IERhdGUoKTtcblx0XHRyZXR1cm4gYCR7Y3VycmVudFRpbWUuZ2V0RnVsbFllYXIoKX0tJHt0b1R3b0RpZ2l0cyhjdXJyZW50VGltZS5nZXRNb250aCgpICsgMSl9LSR7dG9Ud29EaWdpdHMoY3VycmVudFRpbWUuZ2V0RGF0ZSgpKX0gJHt0b1R3b0RpZ2l0cyhjdXJyZW50VGltZS5nZXRIb3VycygpKX06JHt0b1R3b0RpZ2l0cyhjdXJyZW50VGltZS5nZXRNaW51dGVzKCkpfToke3RvVHdvRGlnaXRzKGN1cnJlbnRUaW1lLmdldFNlY29uZHMoKSl9LiR7dG9UaHJlZURpZ2l0cyhjdXJyZW50VGltZS5nZXRNaWxsaXNlY29uZHMoKSl9YDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QmFja3VwUmVzb3VyY2UoKTogVVJJIHtcblx0XHR0aGlzLmJhY2t1cEluZGV4ID0gdGhpcy5iYWNrdXBJbmRleCA+IDUgPyAxIDogdGhpcy5iYWNrdXBJbmRleDtcblx0XHRyZXR1cm4gam9pblBhdGgoZGlybmFtZSh0aGlzLnJlc291cmNlKSwgYCR7YmFzZW5hbWUodGhpcy5yZXNvdXJjZSl9XyR7dGhpcy5iYWNrdXBJbmRleCsrfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkQ29udGVudCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnJlc291cmNlKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RyaW5naWZ5TG9nTGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGxldmVsKSB7XG5cdFx0XHRjYXNlIExvZ0xldmVsLkRlYnVnOiByZXR1cm4gJ2RlYnVnJztcblx0XHRcdGNhc2UgTG9nTGV2ZWwuRXJyb3I6IHJldHVybiAnZXJyb3InO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOiByZXR1cm4gJ2luZm8nO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5UcmFjZTogcmV0dXJuICd0cmFjZSc7XG5cdFx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IHJldHVybiAnd2FybmluZyc7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlTG9nZ2VyU2VydmljZSBleHRlbmRzIEFic3RyYWN0TG9nZ2VyU2VydmljZSBpbXBsZW1lbnRzIElMb2dnZXJTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsb2dMZXZlbDogTG9nTGV2ZWwsXG5cdFx0bG9nc0hvbWU6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGxvZ0xldmVsLCBsb2dzSG9tZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9DcmVhdGVMb2dnZXIocmVzb3VyY2U6IFVSSSwgbG9nTGV2ZWw6IExvZ0xldmVsLCBvcHRpb25zPzogSUxvZ2dlck9wdGlvbnMpOiBJTG9nZ2VyIHtcblx0XHRjb25zdCBsb2dnZXIgPSBuZXcgQnVmZmVyTG9nZ2VyKGxvZ0xldmVsKTtcblx0XHR3aGVuUHJvdmlkZXJSZWdpc3RlcmVkKHJlc291cmNlLCB0aGlzLmZpbGVTZXJ2aWNlKS50aGVuKCgpID0+IGxvZ2dlci5sb2dnZXIgPSBuZXcgRmlsZUxvZ2dlcihyZXNvdXJjZSwgbG9nZ2VyLmdldExldmVsKCksICEhb3B0aW9ucz8uZG9ub3RVc2VGb3JtYXR0ZXJzLCB0aGlzLmZpbGVTZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIGxvZ2dlcjtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsU0FBUyxnQkFBZ0I7QUFFNUMsU0FBUyxVQUE4QixxQkFBcUIsY0FBYyw4QkFBOEI7QUFDeEcsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUIsdUJBQWdFLGdCQUFnQjtBQUVoSCxNQUFNLGdCQUFnQixJQUFJLFNBQVM7QUFFbkMsSUFBTSxhQUFOLGNBQXlCLHNCQUF5QztBQUFBLEVBT2pFLFlBQ2tCLFVBQ2pCLE9BQ2lCLG9CQUNjLGFBQzlCO0FBQ0QsVUFBTTtBQUxXO0FBRUE7QUFDYztBQVBoQyxTQUFRLGNBQXNCO0FBQzlCLFNBQVEsU0FBaUI7QUFTeEIsU0FBSyxTQUFTLEtBQUs7QUFDbkIsU0FBSyxlQUFlLElBQUk7QUFBQSxNQUF1QjtBQUFBO0FBQUEsSUFBd0M7QUFDdkYsU0FBSyxvQkFBb0IsS0FBSyxXQUFXO0FBQUEsRUFDMUM7QUFBQSxFQUVBLE1BQWUsUUFBdUI7QUFDckMsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNqQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLEtBQUs7QUFDWCxRQUFJLFVBQVUsTUFBTSxLQUFLLFlBQVk7QUFDckMsUUFBSSxRQUFRLFNBQVMsZUFBZTtBQUNuQyxZQUFNLEtB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
