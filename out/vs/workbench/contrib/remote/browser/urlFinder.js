import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { RunOnceWorker } from "../../../../base/common/async.js";
const _UrlFinder = class _UrlFinder extends Disposable {
  constructor(terminalService, debugService) {
    super();
    this._onDidMatchLocalUrl = this._register(new Emitter());
    this.onDidMatchLocalUrl = this._onDidMatchLocalUrl.event;
    this.listeners = /* @__PURE__ */ new Map();
    this.terminalDataWorkers = this._register(new DisposableMap());
    this.replPositions = /* @__PURE__ */ new Map();
    terminalService.instances.forEach((instance) => {
      this.registerTerminalInstance(instance);
    });
    this._register(terminalService.onDidCreateInstance((instance) => {
      this.registerTerminalInstance(instance);
    }));
    this._register(terminalService.onDidDisposeInstance((instance) => {
      this.listeners.get(instance)?.dispose();
      this.listeners.delete(instance);
      this.terminalDataWorkers.deleteAndDispose(instance);
    }));
    this._register(debugService.onDidNewSession((session) => {
      if (!session.parentSession || session.parentSession && session.hasSeparateRepl()) {
        this.listeners.set(session.getId(), session.onDidChangeReplElements(() => {
          this.processNewReplElements(session);
        }));
      }
    }));
    this._register(debugService.onDidEndSession(({ session }) => {
      if (this.listeners.has(session.getId())) {
        this.listeners.get(session.getId())?.dispose();
        this.listeners.delete(session.getId());
      }
    }));
  }
  registerTerminalInstance(instance) {
    if (!_UrlFinder.excludeTerminals.includes(instance.title)) {
      this.listeners.set(instance, instance.onData((data) => {
        this.getOrCreateWorker(instance).work(data);
      }));
    }
  }
  getOrCreateWorker(instance) {
    let worker = this.terminalDataWorkers.get(instance);
    if (!worker) {
      worker = new RunOnceWorker((chunks) => this.processTerminalData(chunks), _UrlFinder.dataDebounceTimeout);
      this.terminalDataWorkers.set(instance, worker);
    }
    return worker;
  }
  processTerminalData(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (totalLength > _UrlFinder.maxDataLength) {
      return;
    }
    this.processData(chunks.join(""));
  }
  processNewReplElements(session) {
    const oldReplPosition = this.replPositions.get(session.getId());
    const replElements = session.getReplElements();
    this.replPositions.set(session.getId(), { position: replElements.length - 1, tail: replElements[replElements.length - 1] });
    if (!oldReplPosition && replElements.length > 0) {
      replElements.forEach((element) => this.processData(element.toString()));
    } else if (oldReplPosition && replElements.length - 1 !== oldReplPosition.position) {
      for (let i = replElements.length - 1; i >= 0; i--) {
        const element = replElements[i];
        if (element === oldReplPosition.tail) {
          break;
        } else {
          this.processData(element.toString());
        }
      }
    }
  }
  dispose() {
    super.dispose();
    for (const listener of this.listeners.values()) {
      listener.dispose();
    }
  }
  processData(data) {
    data = removeAnsiEscapeCodes(data);
    const urlMatches = data.match(_UrlFinder.localUrlRegex) || [];
    if (urlMatches && urlMatches.length > 0) {
      urlMatches.forEach((match) => {
        let serverUrl;
        try {
          serverUrl = new URL(match);
        } catch (e) {
        }
        if (serverUrl) {
          const portMatch = match.match(_UrlFinder.extractPortRegex);
          const port = parseFloat(serverUrl.port ? serverUrl.port : portMatch ? portMatch[2] : "NaN");
          if (!isNaN(port) && Number.isInteger(port) && port > 0 && port <= 65535) {
            let host = serverUrl.hostname;
            if (host !== "0.0.0.0" && host !== "127.0.0.1") {
              host = "localhost";
            }
            if (port !== 9229 && data.startsWith("Debugger listening on")) {
              return;
            }
            this._onDidMatchLocalUrl.fire({ port, host });
          }
        }
      });
    } else {
      const pythonMatch = data.match(_UrlFinder.localPythonServerRegex);
      if (pythonMatch && pythonMatch.length === 3) {
        this._onDidMatchLocalUrl.fire({ host: pythonMatch[1], port: Number(pythonMatch[2]) });
      }
    }
  }
};
/**
 * Debounce time in ms before processing accumulated terminal data.
 */
_UrlFinder.dataDebounceTimeout = 500;
/**
 * Maximum amount of data to accumulate before skipping URL detection.
 * When data exceeds this threshold, it indicates high-throughput scenarios
 * (like games or animations) where URL detection is unlikely to find useful results.
 */
_UrlFinder.maxDataLength = 1e4;
/**
 * Local server url pattern matching following urls:
 * http://localhost:3000/ - commonly used across multiple frameworks
 * https://127.0.0.1:5001/ - ASP.NET
 * http://:8080 - Beego Golang
 * http://0.0.0.0:4000 - Elixir Phoenix
 */
_UrlFinder.localUrlRegex = /\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-\.\~:\/\?\#[\]\@!\$&\(\)\*\+\,\;\=]*/gim;
_UrlFinder.extractPortRegex = /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/;
/**
 * https://github.com/microsoft/vscode-remote-release/issues/3949
 */
_UrlFinder.localPythonServerRegex = /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\sport\s(\d+)/;
_UrlFinder.excludeTerminals = ["Dev Containers"];
let UrlFinder = _UrlFinder;
export {
  UrlFinder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3VybEZpbmRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSVJlcGxFbGVtZW50IH0gZnJvbSAnLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUnVuT25jZVdvcmtlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuZXhwb3J0IGNsYXNzIFVybEZpbmRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHQvKipcblx0ICogRGVib3VuY2UgdGltZSBpbiBtcyBiZWZvcmUgcHJvY2Vzc2luZyBhY2N1bXVsYXRlZCB0ZXJtaW5hbCBkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZGF0YURlYm91bmNlVGltZW91dCA9IDUwMDtcblxuXHQvKipcblx0ICogTWF4aW11bSBhbW91bnQgb2YgZGF0YSB0byBhY2N1bXVsYXRlIGJlZm9yZSBza2lwcGluZyBVUkwgZGV0ZWN0aW9uLlxuXHQgKiBXaGVuIGRhdGEgZXhjZWVkcyB0aGlzIHRocmVzaG9sZCwgaXQgaW5kaWNhdGVzIGhpZ2gtdGhyb3VnaHB1dCBzY2VuYXJpb3Ncblx0ICogKGxpa2UgZ2FtZXMgb3IgYW5pbWF0aW9ucykgd2hlcmUgVVJMIGRldGVjdGlvbiBpcyB1bmxpa2VseSB0byBmaW5kIHVzZWZ1bCByZXN1bHRzLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgbWF4RGF0YUxlbmd0aCA9IDEwMDAwO1xuXHQvKipcblx0ICogTG9jYWwgc2VydmVyIHVybCBwYXR0ZXJuIG1hdGNoaW5nIGZvbGxvd2luZyB1cmxzOlxuXHQgKiBodHRwOi8vbG9jYWxob3N0OjMwMDAvIC0gY29tbW9ubHkgdXNlZCBhY3Jvc3MgbXVsdGlwbGUgZnJhbWV3b3Jrc1xuXHQgKiBodHRwczovLzEyNy4wLjAuMTo1MDAxLyAtIEFTUC5ORVRcblx0ICogaHR0cDovLzo4MDgwIC0gQmVlZ28gR29sYW5nXG5cdCAqIGh0dHA6Ly8wLjAuMC4wOjQwMDAgLSBFbGl4aXIgUGhvZW5peFxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgbG9jYWxVcmxSZWdleCA9IC9cXGJcXHd7MCwyMH0oPzo6XFwvXFwvKT8oPzpsb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfDBcXC4wXFwuMFxcLjB8OlxcZHsyLDV9KVtcXHdcXC1cXC5cXH46XFwvXFw/XFwjW1xcXVxcQCFcXCQmXFwoXFwpXFwqXFwrXFwsXFw7XFw9XSovZ2ltO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBleHRyYWN0UG9ydFJlZ2V4ID0gLyhsb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfDBcXC4wXFwuMFxcLjApOihcXGR7MSw1fSkvO1xuXHQvKipcblx0ICogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtcmVtb3RlLXJlbGVhc2UvaXNzdWVzLzM5NDlcblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGxvY2FsUHl0aG9uU2VydmVyUmVnZXggPSAvSFRUUFxcc29uXFxzKDEyN1xcLjBcXC4wXFwuMXwwXFwuMFxcLjBcXC4wKVxcc3BvcnRcXHMoXFxkKykvO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGV4Y2x1ZGVUZXJtaW5hbHMgPSBbJ0RldiBDb250YWluZXJzJ107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNYXRjaExvY2FsVXJsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRNYXRjaExvY2FsVXJsID0gdGhpcy5fb25EaWRNYXRjaExvY2FsVXJsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGxpc3RlbmVyczogTWFwPElUZXJtaW5hbEluc3RhbmNlIHwgc3RyaW5nLCBJRGlzcG9zYWJsZT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGVybWluYWxEYXRhV29ya2VycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPElUZXJtaW5hbEluc3RhbmNlLCBSdW5PbmNlV29ya2VyPHN0cmluZz4+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSwgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBUZXJtaW5hbFxuXHRcdHRlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMuZm9yRWFjaChpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVybWluYWxTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlclRlcm1pbmFsSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXJtaW5hbFNlcnZpY2Uub25EaWREaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0dGhpcy5saXN0ZW5lcnMuZ2V0KGluc3RhbmNlKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5saXN0ZW5lcnMuZGVsZXRlKGluc3RhbmNlKTtcblx0XHRcdHRoaXMudGVybWluYWxEYXRhV29ya2Vycy5kZWxldGVBbmREaXNwb3NlKGluc3RhbmNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBEZWJ1Z1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRlYnVnU2VydmljZS5vbkRpZE5ld1Nlc3Npb24oc2Vzc2lvbiA9PiB7XG5cdFx0XHRpZiAoIXNlc3Npb24ucGFyZW50U2Vzc2lvbiB8fCAoc2Vzc2lvbi5wYXJlbnRTZXNzaW9uICYmIHNlc3Npb24uaGFzU2VwYXJhdGVSZXBsKCkpKSB7XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLnNldChzZXNzaW9uLmdldElkKCksIHNlc3Npb24ub25EaWRDaGFuZ2VSZXBsRWxlbWVudHMoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucHJvY2Vzc05ld1JlcGxFbGVtZW50cyhzZXNzaW9uKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWJ1Z1NlcnZpY2Uub25EaWRFbmRTZXNzaW9uKCh7IHNlc3Npb24gfSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMubGlzdGVuZXJzLmhhcyhzZXNzaW9uLmdldElkKCkpKSB7XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmdldChzZXNzaW9uLmdldElkKCkpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmRlbGV0ZShzZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdGlmICghVXJsRmluZGVyLmV4Y2x1ZGVUZXJtaW5hbHMuaW5jbHVkZXMoaW5zdGFuY2UudGl0bGUpKSB7XG5cdFx0XHR0aGlzLmxpc3RlbmVycy5zZXQoaW5zdGFuY2UsIGluc3RhbmNlLm9uRGF0YShkYXRhID0+IHtcblx0XHRcdFx0dGhpcy5nZXRPckNyZWF0ZVdvcmtlcihpbnN0YW5jZSkud29yayhkYXRhKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE9yQ3JlYXRlV29ya2VyKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFJ1bk9uY2VXb3JrZXI8c3RyaW5nPiB7XG5cdFx0bGV0IHdvcmtlciA9IHRoaXMudGVybWluYWxEYXRhV29ya2Vycy5nZXQoaW5zdGFuY2UpO1xuXHRcdGlmICghd29ya2VyKSB7XG5cdFx0XHR3b3JrZXIgPSBuZXcgUnVuT25jZVdvcmtlcjxzdHJpbmc+KGNodW5rcyA9PiB0aGlzLnByb2Nlc3NUZXJtaW5hbERhdGEoY2h1bmtzKSwgVXJsRmluZGVyLmRhdGFEZWJvdW5jZVRpbWVvdXQpO1xuXHRcdFx0dGhpcy50ZXJtaW5hbERhdGFXb3JrZXJzLnNldChpbnN0YW5jZSwgd29ya2VyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHdvcmtlcjtcblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc1Rlcm1pbmFsRGF0YShjaHVua3M6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Ly8gU2tpcCBwcm9jZXNzaW5nIGlmIGRhdGEgZXhjZWVkcyB0aHJlc2hvbGQgKGhpZ2gtdGhyb3VnaHB1dCBzY2VuYXJpbyBsaWtlIGdhbWVzKVxuXHRcdGNvbnN0IHRvdGFsTGVuZ3RoID0gY2h1bmtzLnJlZHVjZSgoc3VtLCBjaHVuaykgPT4gc3VtICsgY2h1bmsubGVuZ3RoLCAwKTtcblx0XHRpZiAodG90YWxMZW5ndGggPiBVcmxGaW5kZXIubWF4RGF0YUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnByb2Nlc3NEYXRhKGNodW5rcy5qb2luKCcnKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcGxQb3NpdGlvbnM6IE1hcDxzdHJpbmcsIHsgcG9zaXRpb246IG51bWJlcjsgdGFpbDogSVJlcGxFbGVtZW50IH0+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHByb2Nlc3NOZXdSZXBsRWxlbWVudHMoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbikge1xuXHRcdGNvbnN0IG9sZFJlcGxQb3NpdGlvbiA9IHRoaXMucmVwbFBvc2l0aW9ucy5nZXQoc2Vzc2lvbi5nZXRJZCgpKTtcblx0XHRjb25zdCByZXBsRWxlbWVudHMgPSBzZXNzaW9uLmdldFJlcGxFbGVtZW50cygpO1xuXHRcdHRoaXMucmVwbFBvc2l0aW9ucy5zZXQoc2Vzc2lvbi5nZXRJZCgpLCB7IHBvc2l0aW9uOiByZXBsRWxlbWVudHMubGVuZ3RoIC0gMSwgdGFpbDogcmVwbEVsZW1lbnRzW3JlcGxFbGVtZW50cy5sZW5ndGggLSAxXSB9KTtcblxuXHRcdGlmICghb2xkUmVwbFBvc2l0aW9uICYmIHJlcGxFbGVtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXBsRWxlbWVudHMuZm9yRWFjaChlbGVtZW50ID0+IHRoaXMucHJvY2Vzc0RhdGEoZWxlbWVudC50b1N0cmluZygpKSk7XG5cdFx0fSBlbHNlIGlmIChvbGRSZXBsUG9zaXRpb24gJiYgKHJlcGxFbGVtZW50cy5sZW5ndGggLSAxICE9PSBvbGRSZXBsUG9zaXRpb24ucG9zaXRpb24pKSB7XG5cdFx0XHQvLyBQcm9jZXNzIGxpbmVzIHVudGlsIHdlIHJlYWNoIHRoZSBvbGQgXCJ0YWlsXCJcblx0XHRcdGZvciAobGV0IGkgPSByZXBsRWxlbWVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IHJlcGxFbGVtZW50c1tpXTtcblx0XHRcdFx0aWYgKGVsZW1lbnQgPT09IG9sZFJlcGxQb3NpdGlvbi50YWlsKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9jZXNzRGF0YShlbGVtZW50LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiB0aGlzLmxpc3RlbmVycy52YWx1ZXMoKSkge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc0RhdGEoZGF0YTogc3RyaW5nKSB7XG5cdFx0Ly8gc3RyaXAgQU5TSSB0ZXJtaW5hbCBjb2Rlc1xuXHRcdGRhdGEgPSByZW1vdmVBbnNpRXNjYXBlQ29kZXMoZGF0YSk7XG5cdFx0Y29uc3QgdXJsTWF0Y2hlcyA9IGRhdGEubWF0Y2goVXJsRmluZGVyLmxvY2FsVXJsUmVnZXgpIHx8IFtdO1xuXHRcdGlmICh1cmxNYXRjaGVzICYmIHVybE1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dXJsTWF0Y2hlcy5mb3JFYWNoKChtYXRjaCkgPT4ge1xuXHRcdFx0XHQvLyBjaGVjayBpZiB2YWxpZCB1cmxcblx0XHRcdFx0bGV0IHNlcnZlclVybDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRzZXJ2ZXJVcmwgPSBuZXcgVVJMKG1hdGNoKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIE5vdCBhIHZhbGlkIFVSTFxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZXJ2ZXJVcmwpIHtcblx0XHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgcG9ydCBpcyBhIHZhbGlkIGludGVnZXIgdmFsdWVcblx0XHRcdFx0XHRjb25zdCBwb3J0TWF0Y2ggPSBtYXRjaC5tYXRjaChVcmxGaW5kZXIuZXh0cmFjdFBvcnRSZWdleCk7XG5cdFx0XHRcdFx0Y29uc3QgcG9ydCA9IHBhcnNlRmxvYXQoc2VydmVyVXJsLnBvcnQgPyBzZXJ2ZXJVcmwucG9ydCA6IChwb3J0TWF0Y2ggPyBwb3J0TWF0Y2hbMl0gOiAnTmFOJykpO1xuXHRcdFx0XHRcdGlmICghaXNOYU4ocG9ydCkgJiYgTnVtYmVyLmlzSW50ZWdlcihwb3J0KSAmJiBwb3J0ID4gMCAmJiBwb3J0IDw9IDY1NTM1KSB7XG5cdFx0XHRcdFx0XHQvLyBub3JtYWxpemUgdGhlIGhvc3QgbmFtZVxuXHRcdFx0XHRcdFx0bGV0IGhvc3QgPSBzZXJ2ZXJVcmwuaG9zdG5hbWU7XG5cdFx0XHRcdFx0XHRpZiAoaG9zdCAhPT0gJzAuMC4wLjAnICYmIGhvc3QgIT09ICcxMjcuMC4wLjEnKSB7XG5cdFx0XHRcdFx0XHRcdGhvc3QgPSAnbG9jYWxob3N0Jztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIEV4Y2x1ZGUgbm9kZSBpbnNwZWN0LCBleGNlcHQgd2hlbiB1c2luZyBkZWZhdWx0IHBvcnRcblx0XHRcdFx0XHRcdGlmIChwb3J0ICE9PSA5MjI5ICYmIGRhdGEuc3RhcnRzV2l0aCgnRGVidWdnZXIgbGlzdGVuaW5nIG9uJykpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRNYXRjaExvY2FsVXJsLmZpcmUoeyBwb3J0LCBob3N0IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRyeSBzcGVjaWFsIHB5dGhvbiBjYXNlXG5cdFx0XHRjb25zdCBweXRob25NYXRjaCA9IGRhdGEubWF0Y2goVXJsRmluZGVyLmxvY2FsUHl0aG9uU2VydmVyUmVnZXgpO1xuXHRcdFx0aWYgKHB5dGhvbk1hdGNoICYmIHB5dGhvbk1hdGNoLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0XHR0aGlzLl9vbkRpZE1hdGNoTG9jYWxVcmwuZmlyZSh7IGhvc3Q6IHB5dGhvbk1hdGNoWzFdLCBwb3J0OiBOdW1iZXIocHl0aG9uTWF0Y2hbMl0pIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxxQkFBa0M7QUFFdkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFFdkIsTUFBTSxhQUFOLE1BQU0sbUJBQWtCLFdBQVc7QUFBQSxFQWlDekMsWUFBWSxpQkFBbUMsY0FBNkI7QUFDM0UsVUFBTTtBQU5QLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUF3QyxDQUFDO0FBQ25HLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBQ3ZELFNBQWlCLFlBQTBELG9CQUFJLElBQUk7QUFDbkYsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLGNBQXdELENBQUM7QUEyRG5ILFNBQVEsZ0JBQXVFLG9CQUFJLElBQUk7QUF0RHRGLG9CQUFnQixVQUFVLFFBQVEsY0FBWTtBQUM3QyxXQUFLLHlCQUF5QixRQUFRO0FBQUEsSUFDdkMsQ0FBQztBQUNELFNBQUssVUFBVSxnQkFBZ0Isb0JBQW9CLGNBQVk7QUFDOUQsV0FBSyx5QkFBeUIsUUFBUTtBQUFBLElBQ3ZDLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxnQkFBZ0IscUJBQXFCLGNBQVk7QUFDL0QsV0FBSyxVQUFVLElBQUksUUFBUSxHQUFHLFFBQVE7QUFDdEMsV0FBSyxVQUFVLE9BQU8sUUFBUTtBQUM5QixXQUFLLG9CQUFvQixpQkFBaUIsUUFBUTtBQUFBLElBQ25ELENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSxhQUFhLGdCQUFnQixhQUFXO0FBQ3RELFVBQUksQ0FBQyxRQUFRLGlCQUFrQixRQUFRLGlCQUFpQixRQUFRLGdCQUFnQixHQUFJO0FBQ25GLGFBQUssVUFBVSxJQUFJLFFBQVEsTUFBTSxHQUFHLFFBQVEsd0JBQXdCLE1BQU07QUFDekUsZUFBSyx1QkFBdUIsT0FBTztBQUFBLFFBQ3BDLENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxhQUFhLGdCQUFnQixDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQzVELFVBQUksS0FBSyxVQUFVLElBQUksUUFBUSxNQUFNLENBQUMsR0FBRztBQUN4QyxhQUFLLFVBQVUsSUFBSSxRQUFRLE1BQU0sQ0FBQyxHQUFHLFFBQVE7QUFDN0MsYUFBSyxVQUFVLE9BQU8sUUFBUSxNQUFNLENBQUM7QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEseUJBQXlCLFVBQTZCO0FBQzdELFFBQUksQ0FBQyxXQUFVLGlCQUFpQixTQUFTLFNBQVMsS0FBSyxHQUFHO0FBQ3pELFdBQUssVUFBVSxJQUFJLFVBQVUsU0FBUyxPQUFPLFVBQVE7QUFDcEQsYUFBSyxrQkFBa0IsUUFBUSxFQUFFLEtBQUssSUFBSTtBQUFBLE1BQzNDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsVUFBb0Q7QUFDN0UsUUFBSSxTQUFTLEtBQUssb0JBQW9CLElBQUksUUFBUTtBQUNsRCxRQUFJLENBQUMsUUFBUTtBQUNaLGVBQVMsSUFBSSxjQUFzQixZQUFVLEtBQUssb0JBQW9CLE1BQU0sR0FBRyxXQUFVLG1CQUFtQjtBQUM1RyxXQUFLLG9CQUFvQixJQUFJLFVBQVUsTUFBTTtBQUFBLElBQzlDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9CQUFvQixRQUF3QjtBQUVuRCxVQUFNLGNBQWMsT0FBTyxPQUFPLENBQUMsS0FBSyxVQUFVLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDdkUsUUFBSSxjQUFjLFdBQVUsZUFBZTtBQUMxQztBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVksT0FBTyxLQUFLLEVBQUUsQ0FBQztBQUFBLEVBQ2pDO0FBQUEsRUFHUSx1QkFBdUIsU0FBd0I7QUFDdEQsVUFBTSxrQkFBa0IsS0FBSyxjQUFjLElBQUksUUFBUSxNQUFNLENBQUM7QUFDOUQsVUFBTSxlQUFlLFFBQVEsZ0JBQWdCO0FBQzdDLFNBQUssY0FBYyxJQUFJLFFBQVEsTUFBTSxHQUFHLEVBQUUsVUFBVSxhQUFhLFNBQVMsR0FBRyxNQUFNLGFBQWEsYUFBYSxTQUFTLENBQUMsRUFBRSxDQUFDO0FBRTFILFFBQUksQ0FBQyxtQkFBbUIsYUFBYSxTQUFTLEdBQUc7QUFDaEQsbUJBQWEsUUFBUSxhQUFXLEtBQUssWUFBWSxRQUFRLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDckUsV0FBVyxtQkFBb0IsYUFBYSxTQUFTLE1BQU0sZ0JBQWdCLFVBQVc7QUFFckYsZUFBUyxJQUFJLGFBQWEsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ2xELGNBQU0sVUFBVSxhQUFhLENBQUM7QUFDOUIsWUFBSSxZQUFZLGdCQUFnQixNQUFNO0FBQ3JDO0FBQUEsUUFDRCxPQUFPO0FBQ04sZUFBSyxZQUFZLFFBQVEsU0FBUyxDQUFDO0FBQUEsUUFDcEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQVU7QUFDbEIsVUFBTSxRQUFRO0FBQ2QsZUFBVyxZQUFZLEtBQUssVUFBVSxPQUFPLEdBQUc7QUFDL0MsZUFBUyxRQUFRO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLE1BQWM7QUFFakMsV0FBTyxzQkFBc0IsSUFBSTtBQUNqQyxVQUFNLGFBQWEsS0FBSyxNQUFNLFdBQVUsYUFBYSxLQUFLLENBQUM7QUFDM0QsUUFBSSxjQUFjLFdBQVcsU0FBUyxHQUFHO0FBQ3hDLGlCQUFXLFFBQVEsQ0FBQyxVQUFVO0FBRTdCLFlBQUk7QUFDSixZQUFJO0FBQ0gsc0JBQVksSUFBSSxJQUFJLEtBQUs7QUFBQSxRQUMxQixTQUFTLEdBQUc7QUFBQSxRQUVaO0FBQ0EsWUFBSSxXQUFXO0FBRWQsZ0JBQU0sWUFBWSxNQUFNLE1BQU0sV0FBVSxnQkFBZ0I7QUFDeEQsZ0JBQU0sT0FBTyxXQUFXLFVBQVUsT0FBTyxVQUFVLE9BQVEsWUFBWSxVQUFVLENBQUMsSUFBSSxLQUFNO0FBQzVGLGNBQUksQ0FBQyxNQUFNLElBQUksS0FBSyxPQUFPLFVBQVUsSUFBSSxLQUFLLE9BQU8sS0FBSyxRQUFRLE9BQU87QUFFeEUsZ0JBQUksT0FBTyxVQUFVO0FBQ3JCLGdCQUFJLFNBQVMsYUFBYSxTQUFTLGFBQWE7QUFDL0MscUJBQU87QUFBQSxZQUNSO0FBRUEsZ0JBQUksU0FBUyxRQUFRLEtBQUssV0FBVyx1QkFBdUIsR0FBRztBQUM5RDtBQUFBLFlBQ0Q7QUFDQSxpQkFBSyxvQkFBb0IsS0FBSyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQUEsVUFDN0M7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixPQUFPO0FBRU4sWUFBTSxjQUFjLEtBQUssTUFBTSxXQUFVLHNCQUFzQjtBQUMvRCxVQUFJLGVBQWUsWUFBWSxXQUFXLEdBQUc7QUFDNUMsYUFBSyxvQkFBb0IsS0FBSyxFQUFFLE1BQU0sWUFBWSxDQUFDLEdBQUcsTUFBTSxPQUFPLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3JGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUFBO0FBQUE7QUFBQTtBQTdKYSxXQUlZLHNCQUFzQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFKbEMsV0FXWSxnQkFBZ0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQVg1QixXQW1CWSxnQkFBZ0I7QUFuQjVCLFdBb0JZLG1CQUFtQjtBQUFBO0FBQUE7QUFBQTtBQXBCL0IsV0F3QlkseUJBQXlCO0FBeEJyQyxXQTBCWSxtQkFBbUIsQ0FBQyxnQkFBZ0I7QUExQnRELElBQU0sWUFBTjsiLAogICJuYW1lcyI6IFtdCn0K
