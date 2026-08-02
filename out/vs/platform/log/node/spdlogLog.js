import { ByteSize } from "../../files/common/files.js";
import { AbstractMessageLogger, LogLevel } from "../common/log.js";
var SpdLogLevel = /* @__PURE__ */ ((SpdLogLevel2) => {
  SpdLogLevel2[SpdLogLevel2["Trace"] = 0] = "Trace";
  SpdLogLevel2[SpdLogLevel2["Debug"] = 1] = "Debug";
  SpdLogLevel2[SpdLogLevel2["Info"] = 2] = "Info";
  SpdLogLevel2[SpdLogLevel2["Warning"] = 3] = "Warning";
  SpdLogLevel2[SpdLogLevel2["Error"] = 4] = "Error";
  SpdLogLevel2[SpdLogLevel2["Critical"] = 5] = "Critical";
  SpdLogLevel2[SpdLogLevel2["Off"] = 6] = "Off";
  return SpdLogLevel2;
})(SpdLogLevel || {});
async function createSpdLogLogger(name, logfilePath, filesize, filecount, donotUseFormatters) {
  try {
    const _spdlog = await import("@vscode/spdlog");
    _spdlog.setFlushOn(0 /* Trace */);
    const logger = await _spdlog.createAsyncRotatingLogger(name, logfilePath, filesize, filecount);
    if (donotUseFormatters) {
      logger.clearFormatters();
    } else {
      logger.setPattern("%Y-%m-%d %H:%M:%S.%e [%l] %v");
    }
    return logger;
  } catch (e) {
    console.error(e);
  }
  return null;
}
function log(logger, level, message) {
  switch (level) {
    case LogLevel.Trace:
      logger.trace(message);
      break;
    case LogLevel.Debug:
      logger.debug(message);
      break;
    case LogLevel.Info:
      logger.info(message);
      break;
    case LogLevel.Warning:
      logger.warn(message);
      break;
    case LogLevel.Error:
      logger.error(message);
      break;
    case LogLevel.Off:
      break;
    default:
      throw new Error(`Invalid log level ${level}`);
  }
}
function setLogLevel(logger, level) {
  switch (level) {
    case LogLevel.Trace:
      logger.setLevel(0 /* Trace */);
      break;
    case LogLevel.Debug:
      logger.setLevel(1 /* Debug */);
      break;
    case LogLevel.Info:
      logger.setLevel(2 /* Info */);
      break;
    case LogLevel.Warning:
      logger.setLevel(3 /* Warning */);
      break;
    case LogLevel.Error:
      logger.setLevel(4 /* Error */);
      break;
    case LogLevel.Off:
      logger.setLevel(6 /* Off */);
      break;
    default:
      throw new Error(`Invalid log level ${level}`);
  }
}
class SpdLogLogger extends AbstractMessageLogger {
  constructor(name, filepath, rotating, donotUseFormatters, level) {
    super();
    this.buffer = [];
    this.setLevel(level);
    this._loggerCreationPromise = this._createSpdLogLogger(name, filepath, rotating, donotUseFormatters);
    this._register(this.onDidChangeLogLevel((level2) => {
      if (this._logger) {
        setLogLevel(this._logger, level2);
      }
    }));
  }
  async _createSpdLogLogger(name, filepath, rotating, donotUseFormatters) {
    const filecount = rotating ? 6 : 1;
    const filesize = 30 / filecount * ByteSize.MB;
    const logger = await createSpdLogLogger(name, filepath, filesize, filecount, donotUseFormatters);
    if (logger) {
      this._logger = logger;
      setLogLevel(this._logger, this.getLevel());
      for (const { level, message } of this.buffer) {
        log(this._logger, level, message);
      }
      this.buffer = [];
    }
  }
  log(level, message) {
    if (this._logger) {
      log(this._logger, level, message);
    } else if (this.getLevel() <= level) {
      this.buffer.push({ level, message });
    }
  }
  flush() {
    if (this._logger) {
      this.flushLogger();
    } else {
      this._loggerCreationPromise.then(() => this.flushLogger());
    }
  }
  dispose() {
    if (this._logger) {
      this.disposeLogger();
    } else {
      this._loggerCreationPromise.then(() => this.disposeLogger());
    }
    super.dispose();
  }
  flushLogger() {
    if (this._logger) {
      this._logger.flush();
    }
  }
  disposeLogger() {
    if (this._logger) {
      this._logger.drop();
      this._logger = void 0;
    }
  }
}
export {
  SpdLogLogger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xvZy9ub2RlL3NwZGxvZ0xvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgc3BkbG9nIGZyb20gJ0B2c2NvZGUvc3BkbG9nJztcbmltcG9ydCB7IEJ5dGVTaXplIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0TWVzc2FnZUxvZ2dlciwgSUxvZ2dlciwgTG9nTGV2ZWwgfSBmcm9tICcuLi9jb21tb24vbG9nLmpzJztcblxuZW51bSBTcGRMb2dMZXZlbCB7XG5cdFRyYWNlLFxuXHREZWJ1Zyxcblx0SW5mbyxcblx0V2FybmluZyxcblx0RXJyb3IsXG5cdENyaXRpY2FsLFxuXHRPZmZcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlU3BkTG9nTG9nZ2VyKG5hbWU6IHN0cmluZywgbG9nZmlsZVBhdGg6IHN0cmluZywgZmlsZXNpemU6IG51bWJlciwgZmlsZWNvdW50OiBudW1iZXIsIGRvbm90VXNlRm9ybWF0dGVyczogYm9vbGVhbik6IFByb21pc2U8c3BkbG9nLkxvZ2dlciB8IG51bGw+IHtcblx0Ly8gRG8gbm90IGNyYXNoIGlmIHNwZGxvZyBjYW5ub3QgYmUgbG9hZGVkXG5cdHRyeSB7XG5cdFx0Y29uc3QgX3NwZGxvZyA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9zcGRsb2cnKTtcblx0XHRfc3BkbG9nLnNldEZsdXNoT24oU3BkTG9nTGV2ZWwuVHJhY2UpO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGF3YWl0IF9zcGRsb2cuY3JlYXRlQXN5bmNSb3RhdGluZ0xvZ2dlcihuYW1lLCBsb2dmaWxlUGF0aCwgZmlsZXNpemUsIGZpbGVjb3VudCk7XG5cdFx0aWYgKGRvbm90VXNlRm9ybWF0dGVycykge1xuXHRcdFx0bG9nZ2VyLmNsZWFyRm9ybWF0dGVycygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dnZXIuc2V0UGF0dGVybignJVktJW0tJWQgJUg6JU06JVMuJWUgWyVsXSAldicpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9nZ2VyO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0Y29uc29sZS5lcnJvcihlKTtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuaW50ZXJmYWNlIElMb2cge1xuXHRsZXZlbDogTG9nTGV2ZWw7XG5cdG1lc3NhZ2U6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gbG9nKGxvZ2dlcjogc3BkbG9nLkxvZ2dlciwgbGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0c3dpdGNoIChsZXZlbCkge1xuXHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6IGxvZ2dlci50cmFjZShtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1ZzogbG9nZ2VyLmRlYnVnKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLkluZm86IGxvZ2dlci5pbmZvKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IGxvZ2dlci53YXJuKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLkVycm9yOiBsb2dnZXIuZXJyb3IobWVzc2FnZSk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuT2ZmOiAvKiBkbyBub3RoaW5nICovIGJyZWFrO1xuXHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsb2cgbGV2ZWwgJHtsZXZlbH1gKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzZXRMb2dMZXZlbChsb2dnZXI6IHNwZGxvZy5Mb2dnZXIsIGxldmVsOiBMb2dMZXZlbCk6IHZvaWQge1xuXHRzd2l0Y2ggKGxldmVsKSB7XG5cdFx0Y2FzZSBMb2dMZXZlbC5UcmFjZTogbG9nZ2VyLnNldExldmVsKFNwZExvZ0xldmVsLlRyYWNlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1ZzogbG9nZ2VyLnNldExldmVsKFNwZExvZ0xldmVsLkRlYnVnKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOiBsb2dnZXIuc2V0TGV2ZWwoU3BkTG9nTGV2ZWwuSW5mbyk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuV2FybmluZzogbG9nZ2VyLnNldExldmVsKFNwZExvZ0xldmVsLldhcm5pbmcpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLkVycm9yOiBsb2dnZXIuc2V0TGV2ZWwoU3BkTG9nTGV2ZWwuRXJyb3IpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLk9mZjogbG9nZ2VyLnNldExldmVsKFNwZExvZ0xldmVsLk9mZik7IGJyZWFrO1xuXHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsb2cgbGV2ZWwgJHtsZXZlbH1gKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BkTG9nTG9nZ2VyIGV4dGVuZHMgQWJzdHJhY3RNZXNzYWdlTG9nZ2VyIGltcGxlbWVudHMgSUxvZ2dlciB7XG5cblx0cHJpdmF0ZSBidWZmZXI6IElMb2dbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJDcmVhdGlvblByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgX2xvZ2dlcjogc3BkbG9nLkxvZ2dlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRuYW1lOiBzdHJpbmcsXG5cdFx0ZmlsZXBhdGg6IHN0cmluZyxcblx0XHRyb3RhdGluZzogYm9vbGVhbixcblx0XHRkb25vdFVzZUZvcm1hdHRlcnM6IGJvb2xlYW4sXG5cdFx0bGV2ZWw6IExvZ0xldmVsLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2V0TGV2ZWwobGV2ZWwpO1xuXHRcdHRoaXMuX2xvZ2dlckNyZWF0aW9uUHJvbWlzZSA9IHRoaXMuX2NyZWF0ZVNwZExvZ0xvZ2dlcihuYW1lLCBmaWxlcGF0aCwgcm90YXRpbmcsIGRvbm90VXNlRm9ybWF0dGVycyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUxvZ0xldmVsKGxldmVsID0+IHtcblx0XHRcdGlmICh0aGlzLl9sb2dnZXIpIHtcblx0XHRcdFx0c2V0TG9nTGV2ZWwodGhpcy5fbG9nZ2VyLCBsZXZlbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlU3BkTG9nTG9nZ2VyKG5hbWU6IHN0cmluZywgZmlsZXBhdGg6IHN0cmluZywgcm90YXRpbmc6IGJvb2xlYW4sIGRvbm90VXNlRm9ybWF0dGVyczogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVjb3VudCA9IHJvdGF0aW5nID8gNiA6IDE7XG5cdFx0Y29uc3QgZmlsZXNpemUgPSAoMzAgLyBmaWxlY291bnQpICogQnl0ZVNpemUuTUI7XG5cdFx0Y29uc3QgbG9nZ2VyID0gYXdhaXQgY3JlYXRlU3BkTG9nTG9nZ2VyKG5hbWUsIGZpbGVwYXRoLCBmaWxlc2l6ZSwgZmlsZWNvdW50LCBkb25vdFVzZUZvcm1hdHRlcnMpO1xuXHRcdGlmIChsb2dnZXIpIHtcblx0XHRcdHRoaXMuX2xvZ2dlciA9IGxvZ2dlcjtcblx0XHRcdHNldExvZ0xldmVsKHRoaXMuX2xvZ2dlciwgdGhpcy5nZXRMZXZlbCgpKTtcblx0XHRcdGZvciAoY29uc3QgeyBsZXZlbCwgbWVzc2FnZSB9IG9mIHRoaXMuYnVmZmVyKSB7XG5cdFx0XHRcdGxvZyh0aGlzLl9sb2dnZXIsIGxldmVsLCBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuYnVmZmVyID0gW107XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGxvZyhsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sb2dnZXIpIHtcblx0XHRcdGxvZyh0aGlzLl9sb2dnZXIsIGxldmVsLCBtZXNzYWdlKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZ2V0TGV2ZWwoKSA8PSBsZXZlbCkge1xuXHRcdFx0dGhpcy5idWZmZXIucHVzaCh7IGxldmVsLCBtZXNzYWdlIH0pO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZsdXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sb2dnZXIpIHtcblx0XHRcdHRoaXMuZmx1c2hMb2dnZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nZ2VyQ3JlYXRpb25Qcm9taXNlLnRoZW4oKCkgPT4gdGhpcy5mbHVzaExvZ2dlcigpKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sb2dnZXIpIHtcblx0XHRcdHRoaXMuZGlzcG9zZUxvZ2dlcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dnZXJDcmVhdGlvblByb21pc2UudGhlbigoKSA9PiB0aGlzLmRpc3Bvc2VMb2dnZXIoKSk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZmx1c2hMb2dnZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xvZ2dlcikge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmZsdXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwb3NlTG9nZ2VyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sb2dnZXIpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5kcm9wKCk7XG5cdFx0XHR0aGlzLl9sb2dnZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUFnQyxnQkFBZ0I7QUFFekQsSUFBSyxjQUFMLGtCQUFLQSxpQkFBTDtBQUNDLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBUEksU0FBQUE7QUFBQSxHQUFBO0FBVUwsZUFBZSxtQkFBbUIsTUFBYyxhQUFxQixVQUFrQixXQUFtQixvQkFBNEQ7QUFFckssTUFBSTtBQUNILFVBQU0sVUFBVSxNQUFNLE9BQU8sZ0JBQWdCO0FBQzdDLFlBQVEsV0FBVyxhQUFpQjtBQUNwQyxVQUFNLFNBQVMsTUFBTSxRQUFRLDBCQUEwQixNQUFNLGFBQWEsVUFBVSxTQUFTO0FBQzdGLFFBQUksb0JBQW9CO0FBQ3ZCLGFBQU8sZ0JBQWdCO0FBQUEsSUFDeEIsT0FBTztBQUNOLGFBQU8sV0FBVyw4QkFBOEI7QUFBQSxJQUNqRDtBQUNBLFdBQU87QUFBQSxFQUNSLFNBQVMsR0FBRztBQUNYLFlBQVEsTUFBTSxDQUFDO0FBQUEsRUFDaEI7QUFDQSxTQUFPO0FBQ1I7QUFPQSxTQUFTLElBQUksUUFBdUIsT0FBaUIsU0FBdUI7QUFDM0UsVUFBUSxPQUFPO0FBQUEsSUFDZCxLQUFLLFNBQVM7QUFBTyxhQUFPLE1BQU0sT0FBTztBQUFHO0FBQUEsSUFDNUMsS0FBSyxTQUFTO0FBQU8sYUFBTyxNQUFNLE9BQU87QUFBRztBQUFBLElBQzVDLEtBQUssU0FBUztBQUFNLGFBQU8sS0FBSyxPQUFPO0FBQUc7QUFBQSxJQUMxQyxLQUFLLFNBQVM7QUFBUyxhQUFPLEtBQUssT0FBTztBQUFHO0FBQUEsSUFDN0MsS0FBSyxTQUFTO0FBQU8sYUFBTyxNQUFNLE9BQU87QUFBRztBQUFBLElBQzVDLEtBQUssU0FBUztBQUFzQjtBQUFBLElBQ3BDO0FBQVMsWUFBTSxJQUFJLE1BQU0scUJBQXFCLEtBQUssRUFBRTtBQUFBLEVBQ3REO0FBQ0Q7QUFFQSxTQUFTLFlBQVksUUFBdUIsT0FBdUI7QUFDbEUsVUFBUSxPQUFPO0FBQUEsSUFDZCxLQUFLLFNBQVM7QUFBTyxhQUFPLFNBQVMsYUFBaUI7QUFBRztBQUFBLElBQ3pELEtBQUssU0FBUztBQUFPLGFBQU8sU0FBUyxhQUFpQjtBQUFHO0FBQUEsSUFDekQsS0FBSyxTQUFTO0FBQU0sYUFBTyxTQUFTLFlBQWdCO0FBQUc7QUFBQSxJQUN2RCxLQUFLLFNBQVM7QUFBUyxhQUFPLFNBQVMsZUFBbUI7QUFBRztBQUFBLElBQzdELEtBQUssU0FBUztBQUFPLGFBQU8sU0FBUyxhQUFpQjtBQUFHO0FBQUEsSUFDekQsS0FBSyxTQUFTO0FBQUssYUFBTyxTQUFTLFdBQWU7QUFBRztBQUFBLElBQ3JEO0FBQVMsWUFBTSxJQUFJLE1BQU0scUJBQXFCLEtBQUssRUFBRTtBQUFBLEVBQ3REO0FBQ0Q7QUFFTyxNQUFNLHFCQUFxQixzQkFBeUM7QUFBQSxFQU0xRSxZQUNDLE1BQ0EsVUFDQSxVQUNBLG9CQUNBLE9BQ0M7QUFDRCxVQUFNO0FBWFAsU0FBUSxTQUFpQixDQUFDO0FBWXpCLFNBQUssU0FBUyxLQUFLO0FBQ25CLFNBQUsseUJBQXlCLEtBQUssb0JBQW9CLE1BQU0sVUFBVSxVQUFVLGtCQUFrQjtBQUNuRyxTQUFLLFVBQVUsS0FBSyxvQkFBb0IsQ0FBQUMsV0FBUztBQUNoRCxVQUFJLEtBQUssU0FBUztBQUNqQixvQkFBWSxLQUFLLFNBQVNBLE1BQUs7QUFBQSxNQUNoQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBYyxvQkFBb0IsTUFBYyxVQUFrQixVQUFtQixvQkFBNEM7QUFDaEksVUFBTSxZQUFZLFdBQVcsSUFBSTtBQUNqQyxVQUFNLFdBQVksS0FBSyxZQUFhLFNBQVM7QUFDN0MsVUFBTSxTQUFTLE1BQU0sbUJBQW1CLE1BQU0sVUFBVSxVQUFVLFdBQVcsa0JBQWtCO0FBQy9GLFFBQUksUUFBUTtBQUNYLFdBQUssVUFBVTtBQUNmLGtCQUFZLEtBQUssU0FBUyxLQUFLLFNBQVMsQ0FBQztBQUN6QyxpQkFBVyxFQUFFLE9BQU8sUUFBUSxLQUFLLEtBQUssUUFBUTtBQUM3QyxZQUFJLEtBQUssU0FBUyxPQUFPLE9BQU87QUFBQSxNQUNqQztBQUNBLFdBQUssU0FBUyxDQUFDO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQUEsRUFFVSxJQUFJLE9BQWlCLFNBQXVCO0FBQ3JELFFBQUksS0FBSyxTQUFTO0FBQ2pCLFVBQUksS0FBSyxTQUFTLE9BQU8sT0FBTztBQUFBLElBQ2pDLFdBQVcsS0FBSyxTQUFTLEtBQUssT0FBTztBQUNwQyxXQUFLLE9BQU8sS0FBSyxFQUFFLE9BQU8sUUFBUSxDQUFDO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQUEsRUFFUyxRQUFjO0FBQ3RCLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFdBQUssWUFBWTtBQUFBLElBQ2xCLE9BQU87QUFDTixXQUFLLHVCQUF1QixLQUFLLE1BQU0sS0FBSyxZQUFZLENBQUM7QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFdBQUssY0FBYztBQUFBLElBQ3BCLE9BQU87QUFDTixXQUFLLHVCQUF1QixLQUFLLE1BQU0sS0FBSyxjQUFjLENBQUM7QUFBQSxJQUM1RDtBQUNBLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVRLGNBQW9CO0FBQzNCLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFdBQUssUUFBUSxNQUFNO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBc0I7QUFDN0IsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSyxRQUFRLEtBQUs7QUFDbEIsV0FBSyxVQUFVO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlNwZExvZ0xldmVsIiwgImxldmVsIl0KfQo=
