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
import * as fs from "fs";
import * as tar from "tar";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import { format2 } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { detectLibcSync } from "../../../base/node/libc.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationError, FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IRequestService } from "../../request/common/request.js";
const SUPPORTED_PLATFORMS = /* @__PURE__ */ new Set(["linux", "darwin", "win32"]);
const SUPPORTED_ARCHES = /* @__PURE__ */ new Set(["x64", "arm64"]);
function resolveSdkTarget(pkg, host = { platform: process.platform, arch: process.arch, libc: detectLibcSync() }) {
  if (!SUPPORTED_PLATFORMS.has(host.platform) || !SUPPORTED_ARCHES.has(host.arch)) {
    return void 0;
  }
  if (host.platform === "linux" && pkg.hasSeparateMuslLinuxPackage && host.libc === "musl") {
    return `linux-${host.arch}-musl`;
  }
  return `${host.platform}-${host.arch}`;
}
const IAgentSdkDownloader = createDecorator("agentSdkDownloader");
const LOAD_FAILURE_NEGATIVE_CACHE_MS = 3e4;
const PROGRESS_EMIT_THROTTLE_MS = 250;
function parseContentLength(header) {
  if (typeof header !== "string" || !/^\d+$/.test(header)) {
    return void 0;
  }
  const parsed = parseInt(header, 10);
  return parsed > 0 ? parsed : void 0;
}
let AgentSdkDownloader = class extends Disposable {
  constructor(_environmentService, _productService, _requestService, _fileService, _logService) {
    super();
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._requestService = _requestService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._onDidDownloadProgress = this._register(new Emitter());
    this.onDidDownloadProgress = this._onDidDownloadProgress.event;
    /**
     * In-flight downloads keyed by the destination `cacheDir` (which
     * already encodes `<pkg>/<sdkVersion>/<sdkTarget>`). Concurrent
     * `loadSdkRoot` calls in the same process share the same promise so
     * we never download the same tarball twice. Universal launches that
     * resolve to different targets get distinct entries because their
     * cacheDirs differ.
     */
    this._pendingDownloads = /* @__PURE__ */ new Map();
    /**
     * Negative cache: most recent failure per package id, with an expiry.
     * While within the window, `loadSdkRoot` re-throws the cached error
     * immediately instead of re-attempting the download. Without this, a
     * broken CDN causes every SDK method call (poll-driven UIs hit this
     * hard) to fire a fresh request.
     *
     * Keyed by `pkg.id` (not the finer cacheDir): CDN failures are
     * effectively global per SDK (DNS, proxy auth, 5xx) and per-target
     * latching wouldn't protect against the actual failure modes — the
     * broader latch is intentional.
     */
    this._failureLatch = /* @__PURE__ */ new Map();
  }
  isAvailable(pkg) {
    if (process.env[pkg.devOverrideEnvVar]) {
      return true;
    }
    return !!this._productService.agentSdks?.[pkg.id] && resolveSdkTarget(pkg) !== void 0;
  }
  async isSdkResolvableWithoutDownload(pkg) {
    if (process.env[pkg.devOverrideEnvVar]) {
      return true;
    }
    const config = this._productService.agentSdks?.[pkg.id];
    if (!config) {
      return false;
    }
    const sdkTarget = resolveSdkTarget(pkg);
    if (!sdkTarget) {
      return false;
    }
    const sentinel = URI.joinPath(URI.file(this._cacheDir(pkg.id, config.version, sdkTarget)), ".complete");
    return this._fileService.exists(sentinel);
  }
  async loadSdkRoot(pkg, token) {
    const override = process.env[pkg.devOverrideEnvVar];
    if (override) {
      this._logService.info(`[AgentSdkDownloader] ${pkg.id}: using dev override at ${override}`);
      return override;
    }
    const latched = this._failureLatch.get(pkg.id);
    if (latched && latched.expiresAt > Date.now()) {
      throw latched.error;
    }
    try {
      const root = await this._resolveOrDownload(pkg, token);
      this._failureLatch.delete(pkg.id);
      return root;
    } catch (err) {
      if (token.isCancellationRequested) {
        throw err;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this._failureLatch.set(pkg.id, {
        error,
        expiresAt: Date.now() + LOAD_FAILURE_NEGATIVE_CACHE_MS
      });
      throw error;
    }
  }
  async _resolveOrDownload(pkg, token) {
    const config = this._productService.agentSdks?.[pkg.id];
    if (!config) {
      throw new Error(
        `Cannot load ${pkg.id} SDK: no \`product.agentSdks.${pkg.id}\` configured and no ${pkg.devOverrideEnvVar} dev override set.`
      );
    }
    const sdkTarget = resolveSdkTarget(pkg);
    if (!sdkTarget) {
      throw new Error(
        `Cannot load ${pkg.id} SDK: no SDK target for this host (${process.platform}/${process.arch}). Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass.`
      );
    }
    const url = format2(config.urlTemplate, { sdkTarget });
    const stray = /{[^}]+}/.exec(url);
    if (stray) {
      throw new Error(
        `Cannot load ${pkg.id} SDK: \`product.agentSdks.${pkg.id}.urlTemplate\` contains an unknown placeholder ${stray[0]} \u2014 only {sdkTarget} is substituted. Template: ${config.urlTemplate}`
      );
    }
    const cacheDir = this._cacheDir(pkg.id, config.version, sdkTarget);
    const sentinel = URI.joinPath(URI.file(cacheDir), ".complete");
    if (await this._fileService.exists(sentinel)) {
      return cacheDir;
    }
    let pending = this._pendingDownloads.get(cacheDir);
    if (!pending) {
      pending = this._download(pkg, url, cacheDir, sentinel, token).finally(() => {
        this._pendingDownloads.delete(cacheDir);
      });
      this._pendingDownloads.set(cacheDir, pending);
    }
    return pending;
  }
  _cacheDir(packageId, sdkVersion, sdkTarget) {
    return path.join(
      this._environmentService.userDataPath,
      "agent-host",
      "sdk-cache",
      packageId,
      sdkVersion,
      sdkTarget
    );
  }
  async _download(pkg, url, cacheDir, sentinel, token) {
    this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloading from ${url}`);
    const start = Date.now();
    const parent = path.dirname(cacheDir);
    await this._fileService.createFolder(URI.file(parent));
    const tmpDir = `${cacheDir}.tmp.${process.pid}`;
    const tmpDirUri = URI.file(tmpDir);
    await this._delIgnoringMissing(tmpDirUri);
    await this._fileService.createFolder(tmpDirUri);
    const downloadId = generateUuid();
    let lastReceived = 0;
    let lastTotal;
    this._fireProgress(pkg, downloadId, "started", 0, void 0);
    try {
      const tarballPath = path.join(tmpDir, "sdk.tgz");
      await this._fetch(url, tarballPath, token, (receivedBytes, totalBytes) => {
        lastReceived = receivedBytes;
        lastTotal = totalBytes;
        this._fireProgress(pkg, downloadId, "progress", receivedBytes, totalBytes);
      });
      await this._extractTarGz(tarballPath, tmpDir);
      await this._fileService.del(URI.file(tarballPath));
      await this._fileService.writeFile(
        URI.joinPath(tmpDirUri, ".complete"),
        VSBuffer.fromString("")
      );
      try {
        await this._fileService.move(tmpDirUri, URI.file(cacheDir));
      } catch (err) {
        if (await this._handleRenameLoser(err, sentinel, tmpDirUri)) {
          this._logService.info(`[AgentSdkDownloader] ${pkg.id}: lost rename race, using existing cache`);
          this._fireProgress(pkg, downloadId, "completed", lastReceived, lastTotal);
          return cacheDir;
        }
        throw err;
      }
      const elapsed = Math.round((Date.now() - start) / 1e3);
      this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloaded in ${elapsed}s`);
      this._fireProgress(pkg, downloadId, "completed", lastTotal ?? lastReceived, lastTotal);
      return cacheDir;
    } catch (err) {
      await this._delIgnoringMissing(tmpDirUri);
      if (token.isCancellationRequested) {
        this._fireProgress(pkg, downloadId, "failed", lastReceived, lastTotal, "cancelled");
        throw new CancellationError();
      }
      const message = err instanceof Error ? err.message : String(err);
      this._fireProgress(pkg, downloadId, "failed", lastReceived, lastTotal, message);
      throw new Error(
        `Failed to download ${pkg.id} SDK from ${url} (cache target: ${cacheDir}). Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass. Cause: ${message}`
      );
    }
  }
  _fireProgress(pkg, downloadId, phase, receivedBytes, totalBytes, error) {
    this._onDidDownloadProgress.fire({
      downloadId,
      packageId: pkg.id,
      displayName: pkg.displayName,
      phase,
      receivedBytes,
      totalBytes,
      ...error !== void 0 ? { error } : {}
    });
  }
  async _handleRenameLoser(err, sentinel, tmpDirUri) {
    if (!(err instanceof FileOperationError) || err.fileOperationResult !== FileOperationResult.FILE_MOVE_CONFLICT) {
      return false;
    }
    if (!await this._fileService.exists(sentinel)) {
      return false;
    }
    await this._delIgnoringMissing(tmpDirUri);
    return true;
  }
  async _fetch(url, dest, token, onBytes) {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    const context = await this._requestService.request({
      url,
      type: "GET",
      callSite: "agentSdkDownloader"
    }, token);
    if (token.isCancellationRequested) {
      context.stream.destroy();
      throw new CancellationError();
    }
    const statusCode = context.res.statusCode ?? 0;
    if (statusCode < 200 || statusCode >= 300) {
      context.stream.destroy();
      throw new Error(`HTTP ${statusCode} fetching ${url}`);
    }
    const totalBytes = parseContentLength(context.res.headers["content-length"]);
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      let settled = false;
      let receivedBytes = 0;
      let lastEmitTime = 0;
      const emitBytes = (force) => {
        if (!onBytes) {
          return;
        }
        const now = Date.now();
        if (!force && now - lastEmitTime < PROGRESS_EMIT_THROTTLE_MS) {
          return;
        }
        lastEmitTime = now;
        onBytes(receivedBytes, totalBytes);
      };
      const settleResolve = () => {
        if (settled) {
          return;
        }
        settled = true;
        cancelSub.dispose();
        resolve();
      };
      const settleReject = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelSub.dispose();
        context.stream.destroy();
        out.destroy();
        reject(err);
      };
      const cancelSub = token.onCancellationRequested(() => settleReject(new CancellationError()));
      out.on("error", settleReject);
      out.on("finish", settleResolve);
      out.on("drain", () => context.stream.resume());
      context.stream.on("data", (chunk) => {
        receivedBytes += chunk.byteLength;
        emitBytes(false);
        if (!out.write(chunk.buffer)) {
          context.stream.pause();
        }
      });
      context.stream.on("end", () => {
        emitBytes(true);
        out.end();
      });
      context.stream.on("error", settleReject);
    });
  }
  async _extractTarGz(tarball, dest) {
    await tar.x({ file: tarball, cwd: dest });
  }
  async _delIgnoringMissing(uri) {
    try {
      await this._fileService.del(uri, { recursive: true });
    } catch (err) {
      if (toFileOperationResult(err) !== FileOperationResult.FILE_NOT_FOUND) {
        throw err;
      }
    }
  }
};
AgentSdkDownloader = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], AgentSdkDownloader);
export {
  AgentSdkDownloader,
  IAgentSdkDownloader,
  resolveSdkTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50U2RrRG93bmxvYWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHRhciBmcm9tICd0YXInO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBmb3JtYXQyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBkZXRlY3RMaWJjU3luYywgdHlwZSBMaWJjRmFtaWx5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL2xpYmMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElSZXF1ZXN0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5cbi8vICNyZWdpb24gUGVyLXBhY2thZ2Ugc3RyYXRlZ3lcblxuLyoqXG4gKiBPbmUgYWdlbnQtU0RLIHBhY2thZ2UgdGhlIGRvd25sb2FkZXIgY2FuIGZldGNoLiBIb2xkcyB0aGUgcGVyLXBhY2thZ2VcbiAqIGtub3dsZWRnZSB0aGF0IHZhcmllcyBiZXR3ZWVuIENsYXVkZSwgQ29kZXgsIGFuZCBhbnkgZnV0dXJlIHByb3ZpZGVyIFx1MjAxNFxuICogdGhlIHBhY2thZ2UgaWQsIHRoZSBlbnYgdmFyIHRoYXQgYWN0cyBhcyBhIGRldiBvdmVycmlkZSwgYW5kIG9uZVxuICogYm9vbGVhbiBjb3ZlcmluZyB0aGUgb25seSBtYXBwaW5nIGRldGFpbCB0aGF0IGRpZmZlcnMgYmV0d2VlbiBTREtzXG4gKiB0b2RheSAoQ2xhdWRlIGhhcyBzZXBhcmF0ZSBgbGludXgtKi1tdXNsYCBTS1VzOyBDb2RleCdzIExpbnV4IGJpbmFyeVxuICogaXMgc3RhdGljYWxseSBtdXNsLWxpbmtlZCBhbmQgc2hpcHMgYXMgYSBzaW5nbGUgYGxpbnV4LSpgIFNLVSkuXG4gKlxuICogVGhlIGRvd25sb2FkZXIgaXRzZWxmIGlzIHBhY2thZ2UtYWdub3N0aWM6IGl0IGNvbnN1bWVzIHRoaXMgaW50ZXJmYWNlIGFuZFxuICogbmV2ZXIgYnJhbmNoZXMgb24gYGlkYC4gQ29uY3JldGUgYElBZ2VudFNka1BhY2thZ2VgIGluc3RhbmNlcyBsaXZlIGluXG4gKiB0aGVpciBvd25pbmcgYWdlbnQgbW9kdWxlIChlLmcuIGBDbGF1ZGVTZGtQYWNrYWdlYCBpblxuICogYGNsYXVkZS9jbGF1ZGVBZ2VudFNka1NlcnZpY2UudHNgLCBgQ29kZXhTZGtQYWNrYWdlYCBpblxuICogYGNvZGV4L2NvZGV4QWdlbnQudHNgKSBzbyBDbGF1ZGUtc3BlY2lmaWMgLyBDb2RleC1zcGVjaWZpYyBrbm93bGVkZ2VcbiAqIHN0YXlzIGluIHRob3NlIG1vZHVsZXMgXHUyMDE0IHRoZSBkb3dubG9hZGVyIGRvZXNuJ3QgbmFtZSB0aGUgcHJvdmlkZXJzIGl0XG4gKiBzZXJ2ZXMuXG4gKlxuICogRWFjaCBzaGlwcGVkIGBwcm9kdWN0Lmpzb25gIGNhcnJpZXMgb25lIGB7dmVyc2lvbiwgdXJsVGVtcGxhdGV9YCBwZXJcbiAqIFNESy4gVGhlIGRvd25sb2FkZXIgc3Vic3RpdHV0ZXMgYHtzZGtUYXJnZXR9YCAocmVzb2x2ZWQgdmlhXG4gKiBgcmVzb2x2ZVNka1RhcmdldChwa2cpYCkgaW50byB0aGUgdGVtcGxhdGUgdG8gZ2V0IHRoZSBwZXItdGFyZ2V0XG4gKiB0YXJiYWxsIFVSTC4gVGhpcyBzaGFwZSBzdXBwb3J0cyBtYWNPUyBVbml2ZXJzYWwgYnVpbGRzLCB3aGVyZSB0aGVcbiAqIHNhbWUgYHByb2R1Y3QuanNvbmAgaXMgc2hhcmVkIGJ5IGFybTY0IGFuZCB4NjQgbGF1bmNoZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2RrUGFja2FnZSB7XG5cdC8qKiBLZXkgdW5kZXIgYHByb2R1Y3QuYWdlbnRTZGtzYCBcdTIwMTQgZS5nLiBgJ2NsYXVkZSdgLCBgJ2NvZGV4J2AuICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBCcmFuZCBkaXNwbGF5IG5hbWUgZm9yIHVzZXItZmFjaW5nIHByb2dyZXNzLCBlLmcuIGAnQ2xhdWRlJ2AsIGAnQ29kZXgnYC5cblx0ICogVGhlIGRvd25sb2FkZXIgcHV0cyB0aGlzIG9uIHtAbGluayBJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzLmRpc3BsYXlOYW1lfVxuXHQgKiBzbyBjbGllbnRzIGNhbiBidWlsZCBhIGxvY2FsaXplZCBcIkRvd25sb2FkaW5nIHtkaXNwbGF5TmFtZX0gYWdlbnRcIiBsYWJlbC5cblx0ICovXG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdC8qKiBFbnYgdmFyIHRoYXQsIHdoZW4gc2V0LCBiZWNvbWVzIHRoZSBTREsgcm9vdCBhbmQgc2hvcnQtY2lyY3VpdHMgdGhlIGRvd25sb2FkLiAqL1xuXHRyZWFkb25seSBkZXZPdmVycmlkZUVudlZhcjogc3RyaW5nO1xuXHQvKipcblx0ICogVHJ1ZSBpZmYgdGhpcyBTREsgcHVibGlzaGVzIHNlcGFyYXRlIGBsaW51eC17eDY0LGFybTY0fS1tdXNsYFxuXHQgKiBwYWNrYWdlcyBhbG9uZ3NpZGUgdGhlIGdsaWJjIGRlZmF1bHQuIENsYXVkZSBkb2VzOyBDb2RleCBkb2Vzbid0XG5cdCAqIChpdHMgTGludXggYmluYXJ5IGlzIHN0YXRpY2FsbHkgbXVzbC1saW5rZWQgYW5kIHJ1bnMgb24gYm90aCkuXG5cdCAqL1xuXHRyZWFkb25seSBoYXNTZXBhcmF0ZU11c2xMaW51eFBhY2thZ2U6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUGVyLWhvc3QgaW5mbyB1c2VkIGJ5IGByZXNvbHZlU2RrVGFyZ2V0YC4gRGVmYXVsdGVkIGZyb20gdGhlIHJ1bm5pbmdcbiAqIHByb2Nlc3M7IHRlc3RzIGluamVjdCBzeW50aGV0aWMgdmFsdWVzIHRvIGV4ZXJjaXNlIHRhcmdldHMgdGhlIHRlc3RcbiAqIGhvc3QgZG9lc24ndCBhY3R1YWxseSBydW4gb24gKFVuaXZlcnNhbC1sYXVuY2ggY2FzZSwgbXVzbCwgZXRjLikuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNka1RhcmdldEhvc3Qge1xuXHRyZWFkb25seSBwbGF0Zm9ybTogTm9kZUpTLlBsYXRmb3JtO1xuXHRyZWFkb25seSBhcmNoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxpYmM6IExpYmNGYW1pbHkgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IFNVUFBPUlRFRF9QTEFURk9STVMgPSBuZXcgU2V0PE5vZGVKUy5QbGF0Zm9ybT4oWydsaW51eCcsICdkYXJ3aW4nLCAnd2luMzInXSk7XG5jb25zdCBTVVBQT1JURURfQVJDSEVTID0gbmV3IFNldDxzdHJpbmc+KFsneDY0JywgJ2FybTY0J10pO1xuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBidWlsZCdzIGBzZGtUYXJnZXRgIHN1ZmZpeCBmb3IgdGhlIGdpdmVuIGhvc3QuIERlZmF1bHRzXG4gKiB0byB0aGUgY3VycmVudCBOb2RlIHByb2Nlc3MgXHUyMDE0IHByb2R1Y3Rpb24gY2FsbGVycyBvbWl0IGBob3N0YDsgdGVzdHNcbiAqIHBhc3MgYSBzeW50aGV0aWMgaG9zdCB0byBjb3ZlciB0YXJnZXRzIHRoZSB0ZXN0IG1hY2hpbmUgY2FuJ3QgcmVhY2hcbiAqIChVbml2ZXJzYWwgbGF1bmNoZXMgZnJvbSBhIHNpbmdsZS1hcmNoIGhvc3QsIG11c2wgTGludXggb24gbWFjT1MgQ0ksXG4gKiBldGMuKS5cbiAqXG4gKiAgIC0gY2xhdWRlIG9uIGdsaWJjIExpbnV4OiBgbGludXgteDY0YCAvIGBsaW51eC1hcm02NGBcbiAqICAgLSBjbGF1ZGUgb24gbXVzbCBMaW51eDogIGBsaW51eC14NjQtbXVzbGAgLyBgbGludXgtYXJtNjQtbXVzbGBcbiAqICAgLSBjb2RleCBMaW51eCAoYW55IGxpYmMpOiBgbGludXgteDY0YCAvIGBsaW51eC1hcm02NGBcbiAqICAgLSBldmVyeXdoZXJlIGVsc2U6ICAgICAgIGA8cGxhdGZvcm0+LTxhcmNoPmBcbiAqXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gU0RLIGFwcGxpZXMgKGBhcm1oZmAsIHdlYiwgZXRjLik7IHRoZVxuICogZG93bmxvYWRlciB0cmVhdHMgdGhhdCB0aGUgc2FtZSBhcyBcIm5vIHByb2R1Y3QgY29uZmlnXCIgYW5kIG5ldmVyXG4gKiByZWdpc3RlcnMgdGhlIHByb3ZpZGVyLlxuICpcbiAqIE1pcnJvciBvZiB0aGUgYnVpbGQgcGlwZWxpbmUncyBgZ2V0U2RrVGFyZ2V0Rm9yQnVpbGRgIChpblxuICogYGJ1aWxkL2FnZW50LXNkay9jb21tb24udHNgKSB0cmFuc2xhdGVkIGZyb20gYnVpbGQtdGltZVxuICogYHZzY29kZVBsYXRmb3JtYCB0byBydW50aW1lIGBwcm9jZXNzLnBsYXRmb3JtYCArIGxpYmMgZGV0ZWN0aW9uLlxuICogS2VlcCB0aGUgdHdvIGluIHN5bmMgd2hlbiBhZGRpbmcgbmV3IHRhcmdldCBTS1VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVNka1RhcmdldChcblx0cGtnOiBQaWNrPElBZ2VudFNka1BhY2thZ2UsICdoYXNTZXBhcmF0ZU11c2xMaW51eFBhY2thZ2UnPixcblx0aG9zdDogSVNka1RhcmdldEhvc3QgPSB7IHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLCBhcmNoOiBwcm9jZXNzLmFyY2gsIGxpYmM6IGRldGVjdExpYmNTeW5jKCkgfSxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghU1VQUE9SVEVEX1BMQVRGT1JNUy5oYXMoaG9zdC5wbGF0Zm9ybSkgfHwgIVNVUFBPUlRFRF9BUkNIRVMuaGFzKGhvc3QuYXJjaCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChob3N0LnBsYXRmb3JtID09PSAnbGludXgnICYmIHBrZy5oYXNTZXBhcmF0ZU11c2xMaW51eFBhY2thZ2UgJiYgaG9zdC5saWJjID09PSAnbXVzbCcpIHtcblx0XHRyZXR1cm4gYGxpbnV4LSR7aG9zdC5hcmNofS1tdXNsYDtcblx0fVxuXHRyZXR1cm4gYCR7aG9zdC5wbGF0Zm9ybX0tJHtob3N0LmFyY2h9YDtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIFNlcnZpY2UgZGVjb3JhdG9yXG5cbmV4cG9ydCBjb25zdCBJQWdlbnRTZGtEb3dubG9hZGVyID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudFNka0Rvd25sb2FkZXI+KCdhZ2VudFNka0Rvd25sb2FkZXInKTtcblxuLyoqIExpZmVjeWNsZSBwaGFzZSBvZiBhIHNpbmdsZSBTREsgZG93bmxvYWQgKGRvd25sb2FkZXItaW50ZXJuYWwpLiAqL1xuZXhwb3J0IHR5cGUgQWdlbnRTZGtEb3dubG9hZFBoYXNlID0gJ3N0YXJ0ZWQnIHwgJ3Byb2dyZXNzJyB8ICdjb21wbGV0ZWQnIHwgJ2ZhaWxlZCc7XG5cbi8qKlxuICogQSBwcm9jZXNzLWdsb2JhbCBkb3dubG9hZC1wcm9ncmVzcyBzYW1wbGUgZmlyZWQgb25cbiAqIHtAbGluayBJQWdlbnRTZGtEb3dubG9hZGVyLm9uRGlkRG93bmxvYWRQcm9ncmVzc30uIFRoZSBkb3dubG9hZGVyIG93bnMgdGhlXG4gKiBsaWZlY3ljbGU6IG9uZSBgc3RhcnRlZGAsIHRocm90dGxlZCBgcHJvZ3Jlc3NgIGZyYW1lcywgdGhlbiBleGFjdGx5IG9uZVxuICogdGVybWluYWwgYGNvbXBsZXRlZGAgLyBgZmFpbGVkYCBcdTIwMTQgYWxsIHNoYXJpbmcgYSBgZG93bmxvYWRJZGAuIENvbmN1cnJlbnRcbiAqIGBsb2FkU2RrUm9vdGAgY2FsbGVycyBmb3IgdGhlIHNhbWUgdGFyYmFsbCBhcmUgZGVkdXBlZCwgc28gdGhleSBvYnNlcnZlIG9uZVxuICogc2hhcmVkIGRvd25sb2FkIChvbmUgYGRvd25sb2FkSWRgKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzIHtcblx0LyoqIFN0YWJsZSBpZCBmb3Igb25lIGRvd25sb2FkOyBjb2FsZXNjZXMgZnJhbWVzIGFuZCBkaXN0aW5ndWlzaGVzIGNvbmN1cnJlbnQgZmV0Y2hlcy4gKi9cblx0cmVhZG9ubHkgZG93bmxvYWRJZDogc3RyaW5nO1xuXHQvKiogUGFja2FnZSBpZCwgZS5nLiBgJ2NsYXVkZSdgIC8gYCdjb2RleCdgLiAqL1xuXHRyZWFkb25seSBwYWNrYWdlSWQ6IHN0cmluZztcblx0LyoqIEJyYW5kIGRpc3BsYXkgbmFtZSwgZS5nLiBgJ0NsYXVkZSdgLiAqL1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHQvKiogTGlmZWN5Y2xlIHBoYXNlIG9mIHRoaXMgZnJhbWUuICovXG5cdHJlYWRvbmx5IHBoYXNlOiBBZ2VudFNka0Rvd25sb2FkUGhhc2U7XG5cdC8qKiBCeXRlcyB3cml0dGVuIHNvIGZhci4gTW9ub3RvbmljYWxseSBub24tZGVjcmVhc2luZyB3aXRoaW4gYSBgZG93bmxvYWRJZGAuICovXG5cdHJlYWRvbmx5IHJlY2VpdmVkQnl0ZXM6IG51bWJlcjtcblx0LyoqIFRvdGFsIGJ5dGVzIGZyb20gYENvbnRlbnQtTGVuZ3RoYCwgb3IgYHVuZGVmaW5lZGAgd2hlbiB1bmtub3duIChpbmRldGVybWluYXRlKS4gKi9cblx0cmVhZG9ubHkgdG90YWxCeXRlczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogU2hvcnQsIG5vbi1sb2NhbGl6ZWQgZmFpbHVyZSByZWFzb247IHByZXNlbnQgb25seSB3aGVuIGBwaGFzZTogJ2ZhaWxlZCdgLiAqL1xuXHRyZWFkb25seSBlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZGtEb3dubG9hZGVyIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGlsZSBhIHRhcmJhbGwgaXMgYmVpbmcgZmV0Y2hlZCAoY29sZCBjYWNoZSBvbmx5KTogb25lIGBzdGFydGVkYCxcblx0ICogdGhyb3R0bGVkIGBwcm9ncmVzc2Agc2FtcGxlcywgdGhlbiBvbmUgdGVybWluYWwgYGNvbXBsZXRlZGAgLyBgZmFpbGVkYC5cblx0ICogTmV2ZXIgZmlyZXMgZm9yIGRldi1vdmVycmlkZSBvciBjYWNoZS1oaXQgcmVzb2x1dGlvbnMgKG5vIGJ5dGVzIG1vdmUpLlxuXHQgKiBQcm9jZXNzLWdsb2JhbCBzbyBhIHNpbmdsZSBzdWJzY3JpYmVyICh0aGUgcHJvdG9jb2wgc2VydmVyKSBjYW4gZm9yd2FyZFxuXHQgKiBwcm9ncmVzcyB0byBjbGllbnRzIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggc2Vzc2lvbiB0cmlnZ2VyZWQgdGhlIGZldGNoLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREb3dubG9hZFByb2dyZXNzOiBFdmVudDxJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzPjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgYWJzb2x1dGUgcGF0aCBvZiB0aGUgU0RLIHJvb3QgZGlyZWN0b3J5IFx1MjAxNCB0aGUgZGlyZWN0b3J5IHRoYXRcblx0ICogY29udGFpbnMgdGhlIHBhY2thZ2UncyBgbm9kZV9tb2R1bGVzL2Agc3VidHJlZS4gQ2FsbGVycyByZXNvbHZlIHRoZVxuXHQgKiBwYWNrYWdlLXNwZWNpZmljIGVudHJ5cG9pbnQgZnJvbSB0aGVyZSB0aGVtc2VsdmVzLlxuXHQgKlxuXHQgKiBSZXNvbHV0aW9uIG9yZGVyOlxuXHQgKiAgIDEuIGRldi1vdmVycmlkZSBlbnYgdmFyIChyZXR1cm5lZCB1bmNoYW5nZWQpXG5cdCAqICAgMi4gb24tZGlzayBjYWNoZSBoaXQgKGAuY29tcGxldGVgIHNlbnRpbmVsIHByZXNlbnQpXG5cdCAqICAgMy4gZG93bmxvYWQgZnJvbSBgcHJvZHVjdC5hZ2VudFNka3M/Lltwa2cuaWRdYCB3aXRoXG5cdCAqICAgICAgYHtzZGtUYXJnZXR9YCBzdWJzdGl0dXRlZCBpbnRvIHRoZSB1cmxUZW1wbGF0ZVxuXHQgKlxuXHQgKiBSZXBlYXRlZCBmYWlsdXJlcyBhcmUgbGF0Y2hlZCBmb3Ige0BsaW5rIExPQURfRkFJTFVSRV9ORUdBVElWRV9DQUNIRV9NU31cblx0ICogc28gYSBtaXNjb25maWd1cmVkIENETiBkb2Vzbid0IGdldCBoYW1tZXJlZCBvbiBldmVyeSBTREsgbWV0aG9kIGNhbGwuXG5cdCAqL1xuXHRsb2FkU2RrUm9vdChwa2c6IElBZ2VudFNka1BhY2thZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPjtcblxuXHQvKipcblx0ICogQ2hlYXAsIHN5bmNocm9ub3VzIGdhdGUgdXNlZCBhdCBzdGFydHVwIHRvIGRlY2lkZSB3aGV0aGVyIHRvIHJlZ2lzdGVyXG5cdCAqIHRoZSBjb3JyZXNwb25kaW5nIGFnZW50IHByb3ZpZGVyLiBUcnVlIGlmZiB0aGUgZGV2IG92ZXJyaWRlIGlzIHNldCwgT1Jcblx0ICogKGBwcm9kdWN0LmFnZW50U2Rrcz8uW3BrZy5pZF1gIGlzIHBvcHVsYXRlZCBBTkQgYHBrZy5jdXJyZW50U2RrVGFyZ2V0KClgXG5cdCAqIHJlc29sdmVzIFx1MjAxNCBpLmUuIGFuIFNESyBleGlzdHMgZm9yIHRoaXMgaG9zdCkuIERvZXMgTk9UIHRyaWdnZXIgYVxuXHQgKiBkb3dubG9hZC5cblx0ICovXG5cdGlzQXZhaWxhYmxlKHBrZzogSUFnZW50U2RrUGFja2FnZSk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRydWUgaWZmIHtAbGluayBsb2FkU2RrUm9vdH0gd291bGQgcmVzb2x2ZSBXSVRIT1VUIGEgbmV0d29yayBkb3dubG9hZCBcdTIwMTRcblx0ICogdGhlIGRldiBvdmVycmlkZSBpcyBzZXQsIG9yIGEgY29tcGxldGVkIGNhY2hlIGZvciB0aGUgY29uZmlndXJlZCB2ZXJzaW9uXG5cdCAqIGFscmVhZHkgZXhpc3RzIG9uIGRpc2suIEZhbHNlIHdoZW4gcHJvZHVjdCBjb25maWcgaXMgcHJlc2VudCBidXQgdGhlXG5cdCAqIGNhY2hlIGlzIGNvbGQgKGEgZmV0Y2ggd291bGQgYmUgcmVxdWlyZWQpLCBhbmQgZmFsc2Ugd2hlbiBuZWl0aGVyIGFuXG5cdCAqIG92ZXJyaWRlIG5vciBwcm9kdWN0IGNvbmZpZyBpcyBjb25maWd1cmVkLlxuXHQgKlxuXHQgKiBQZXJmb3JtcyBhdCBtb3N0IGEgc2luZ2xlIHNlbnRpbmVsIGBleGlzdHNgIGNoZWNrIGFuZCBuZXZlciBkb3dubG9hZHMuXG5cdCAqIEVhZ2VyIC8gYmFja2dyb3VuZCBjYWxsZXJzIChlLmcuIGEgcHJvdmlkZXIgbGlzdGluZyBpdHMgc2Vzc2lvbnMgYXRcblx0ICogc3RhcnR1cCkgdXNlIHRoaXMgdG8gYXZvaWQga2lja2luZyBvZmYgYSBtdWx0aS1zZWNvbmQgY29sZCBkb3dubG9hZFxuXHQgKiBiZWZvcmUgdGhlIHVzZXIgaGFzIGFza2VkIGZvciBhbnl0aGluZy5cblx0ICovXG5cdGlzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZChwa2c6IElBZ2VudFNka1BhY2thZ2UpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gSW1wbGVtZW50YXRpb25cblxuLyoqIEhvdyBsb25nIGEgYGxvYWRTZGtSb290YCBmYWlsdXJlIGxhdGNoZXMgYmVmb3JlIHdlIHRyeSBhZ2Fpbi4gKi9cbmNvbnN0IExPQURfRkFJTFVSRV9ORUdBVElWRV9DQUNIRV9NUyA9IDMwXzAwMDtcblxuLyoqXG4gKiBNaW5pbXVtIGdhcCBiZXR3ZWVuIGRvd25sb2FkLXByb2dyZXNzIHNhbXBsZXMuIEEgNzAtOTVNQiB0YXJiYWxsIG92ZXIgYSBmYXN0XG4gKiBsaW5rIHByb2R1Y2VzIHRob3VzYW5kcyBvZiBjaHVua3M7IHdpdGhvdXQgdGhyb3R0bGluZyB3ZSdkIGZsb29kIHRoZSBwcm9ncmVzc1xuICogY2hhbm5lbC4gfjI1MG1zIGtlZXBzIHRoZSBwZXJjZW50YWdlIHZpc2libHkgbW92aW5nIHdpdGhvdXQgc3BhbW1pbmcuXG4gKi9cbmNvbnN0IFBST0dSRVNTX0VNSVRfVEhST1RUTEVfTVMgPSAyNTA7XG5cbi8qKlxuICogUGFyc2VzIGEgYENvbnRlbnQtTGVuZ3RoYCBoZWFkZXIgaW50byBhIHBvc2l0aXZlIGludGVnZXIgYnl0ZSBjb3VudCwgb3JcbiAqIGB1bmRlZmluZWRgIHdoZW4gdGhlIGhlYWRlciBpcyBhYnNlbnQsIGFuIGFycmF5LCBvciBub3QgYSBjbGVhbiBpbnRlZ2VyLlxuICovXG5mdW5jdGlvbiBwYXJzZUNvbnRlbnRMZW5ndGgoaGVhZGVyOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJyB8fCAhL15cXGQrJC8udGVzdChoZWFkZXIpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXJzZWQgPSBwYXJzZUludChoZWFkZXIsIDEwKTtcblx0cmV0dXJuIHBhcnNlZCA+IDAgPyBwYXJzZWQgOiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNka0Rvd25sb2FkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50U2RrRG93bmxvYWRlciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRG93bmxvYWRQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFNka0Rvd25sb2FkUHJvZ3Jlc3M+KCkpO1xuXHRyZWFkb25seSBvbkRpZERvd25sb2FkUHJvZ3Jlc3M6IEV2ZW50PElBZ2VudFNka0Rvd25sb2FkUHJvZ3Jlc3M+ID0gdGhpcy5fb25EaWREb3dubG9hZFByb2dyZXNzLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQgZG93bmxvYWRzIGtleWVkIGJ5IHRoZSBkZXN0aW5hdGlvbiBgY2FjaGVEaXJgICh3aGljaFxuXHQgKiBhbHJlYWR5IGVuY29kZXMgYDxwa2c+LzxzZGtWZXJzaW9uPi88c2RrVGFyZ2V0PmApLiBDb25jdXJyZW50XG5cdCAqIGBsb2FkU2RrUm9vdGAgY2FsbHMgaW4gdGhlIHNhbWUgcHJvY2VzcyBzaGFyZSB0aGUgc2FtZSBwcm9taXNlIHNvXG5cdCAqIHdlIG5ldmVyIGRvd25sb2FkIHRoZSBzYW1lIHRhcmJhbGwgdHdpY2UuIFVuaXZlcnNhbCBsYXVuY2hlcyB0aGF0XG5cdCAqIHJlc29sdmUgdG8gZGlmZmVyZW50IHRhcmdldHMgZ2V0IGRpc3RpbmN0IGVudHJpZXMgYmVjYXVzZSB0aGVpclxuXHQgKiBjYWNoZURpcnMgZGlmZmVyLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0Rvd25sb2FkcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHN0cmluZz4+KCk7XG5cblx0LyoqXG5cdCAqIE5lZ2F0aXZlIGNhY2hlOiBtb3N0IHJlY2VudCBmYWlsdXJlIHBlciBwYWNrYWdlIGlkLCB3aXRoIGFuIGV4cGlyeS5cblx0ICogV2hpbGUgd2l0aGluIHRoZSB3aW5kb3csIGBsb2FkU2RrUm9vdGAgcmUtdGhyb3dzIHRoZSBjYWNoZWQgZXJyb3Jcblx0ICogaW1tZWRpYXRlbHkgaW5zdGVhZCBvZiByZS1hdHRlbXB0aW5nIHRoZSBkb3dubG9hZC4gV2l0aG91dCB0aGlzLCBhXG5cdCAqIGJyb2tlbiBDRE4gY2F1c2VzIGV2ZXJ5IFNESyBtZXRob2QgY2FsbCAocG9sbC1kcml2ZW4gVUlzIGhpdCB0aGlzXG5cdCAqIGhhcmQpIHRvIGZpcmUgYSBmcmVzaCByZXF1ZXN0LlxuXHQgKlxuXHQgKiBLZXllZCBieSBgcGtnLmlkYCAobm90IHRoZSBmaW5lciBjYWNoZURpcik6IENETiBmYWlsdXJlcyBhcmVcblx0ICogZWZmZWN0aXZlbHkgZ2xvYmFsIHBlciBTREsgKEROUywgcHJveHkgYXV0aCwgNXh4KSBhbmQgcGVyLXRhcmdldFxuXHQgKiBsYXRjaGluZyB3b3VsZG4ndCBwcm90ZWN0IGFnYWluc3QgdGhlIGFjdHVhbCBmYWlsdXJlIG1vZGVzIFx1MjAxNCB0aGVcblx0ICogYnJvYWRlciBsYXRjaCBpcyBpbnRlbnRpb25hbC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZhaWx1cmVMYXRjaCA9IG5ldyBNYXA8c3RyaW5nLCB7IGVycm9yOiBFcnJvcjsgZXhwaXJlc0F0OiBudW1iZXIgfT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0aXNBdmFpbGFibGUocGtnOiBJQWdlbnRTZGtQYWNrYWdlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHByb2Nlc3MuZW52W3BrZy5kZXZPdmVycmlkZUVudlZhcl0pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gISF0aGlzLl9wcm9kdWN0U2VydmljZS5hZ2VudFNka3M/Lltwa2cuaWRdICYmIHJlc29sdmVTZGtUYXJnZXQocGtnKSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgaXNTZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkKHBrZzogSUFnZW50U2RrUGFja2FnZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChwcm9jZXNzLmVudltwa2cuZGV2T3ZlcnJpZGVFbnZWYXJdKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuYWdlbnRTZGtzPy5bcGtnLmlkXTtcblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzZGtUYXJnZXQgPSByZXNvbHZlU2RrVGFyZ2V0KHBrZyk7XG5cdFx0aWYgKCFzZGtUYXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuam9pblBhdGgoVVJJLmZpbGUodGhpcy5fY2FjaGVEaXIocGtnLmlkLCBjb25maWcudmVyc2lvbiwgc2RrVGFyZ2V0KSksICcuY29tcGxldGUnKTtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHNlbnRpbmVsKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTZGtSb290KHBrZzogSUFnZW50U2RrUGFja2FnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHQvLyAxLiBEZXYgb3ZlcnJpZGUuXG5cdFx0Y29uc3Qgb3ZlcnJpZGUgPSBwcm9jZXNzLmVudltwa2cuZGV2T3ZlcnJpZGVFbnZWYXJdO1xuXHRcdGlmIChvdmVycmlkZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IHVzaW5nIGRldiBvdmVycmlkZSBhdCAke292ZXJyaWRlfWApO1xuXHRcdFx0cmV0dXJuIG92ZXJyaWRlO1xuXHRcdH1cblxuXHRcdC8vIDIuIE5lZ2F0aXZlIGNhY2hlOiBhIHJlY2VudCBmYWlsdXJlIHNob3J0LWNpcmN1aXRzIHdpdGhvdXQgSS9PLlxuXHRcdGNvbnN0IGxhdGNoZWQgPSB0aGlzLl9mYWlsdXJlTGF0Y2guZ2V0KHBrZy5pZCk7XG5cdFx0aWYgKGxhdGNoZWQgJiYgbGF0Y2hlZC5leHBpcmVzQXQgPiBEYXRlLm5vdygpKSB7XG5cdFx0XHR0aHJvdyBsYXRjaGVkLmVycm9yO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByb290ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU9yRG93bmxvYWQocGtnLCB0b2tlbik7XG5cdFx0XHR0aGlzLl9mYWlsdXJlTGF0Y2guZGVsZXRlKHBrZy5pZCk7XG5cdFx0XHRyZXR1cm4gcm9vdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHQvLyBEb24ndCBsYXRjaCBjYW5jZWxsYXRpb25zIFx1MjAxNCB1c2VyIGludGVudCwgbm90IGEgcmVhbCBmYWlsdXJlLlxuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogbmV3IEVycm9yKFN0cmluZyhlcnIpKTtcblx0XHRcdHRoaXMuX2ZhaWx1cmVMYXRjaC5zZXQocGtnLmlkLCB7XG5cdFx0XHRcdGVycm9yLFxuXHRcdFx0XHRleHBpcmVzQXQ6IERhdGUubm93KCkgKyBMT0FEX0ZBSUxVUkVfTkVHQVRJVkVfQ0FDSEVfTVMsXG5cdFx0XHR9KTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVPckRvd25sb2FkKHBrZzogSUFnZW50U2RrUGFja2FnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5hZ2VudFNka3M/Lltwa2cuaWRdO1xuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBDYW5ub3QgbG9hZCAke3BrZy5pZH0gU0RLOiBubyBcXGBwcm9kdWN0LmFnZW50U2Rrcy4ke3BrZy5pZH1cXGAgY29uZmlndXJlZCBhbmQgYCArXG5cdFx0XHRcdGBubyAke3BrZy5kZXZPdmVycmlkZUVudlZhcn0gZGV2IG92ZXJyaWRlIHNldC5gLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0Y29uc3Qgc2RrVGFyZ2V0ID0gcmVzb2x2ZVNka1RhcmdldChwa2cpO1xuXHRcdGlmICghc2RrVGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBDYW5ub3QgbG9hZCAke3BrZy5pZH0gU0RLOiBubyBTREsgdGFyZ2V0IGZvciB0aGlzIGhvc3QgYCArXG5cdFx0XHRcdGAoJHtwcm9jZXNzLnBsYXRmb3JtfS8ke3Byb2Nlc3MuYXJjaH0pLiBgICtcblx0XHRcdFx0YFNldCAke3BrZy5kZXZPdmVycmlkZUVudlZhcn0gdG8gYSBsb2NhbCBTREsgcm9vdCB0byBieXBhc3MuYCxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVybCA9IGZvcm1hdDIoY29uZmlnLnVybFRlbXBsYXRlLCB7IHNka1RhcmdldCB9KTtcblx0XHQvLyBgZm9ybWF0MmAgbGVhdmVzIHVua25vd24gYHtwbGFjZWhvbGRlcn1gIHNlZ21lbnRzIHVudG91Y2hlZDsgY2F0Y2hcblx0XHQvLyB2c2NvZGUtZGlzdHJvIHR5cG9zIGxpa2UgYHtzZGtUYXJldH1gIGhlcmUgaW5zdGVhZCBvZiBsZXR0aW5nIHRoZVxuXHRcdC8vIENETiByZXR1cm4gYSA0MDQgYWdhaW5zdCBhIGNsZWFybHktYnJva2VuIFVSTC5cblx0XHRjb25zdCBzdHJheSA9IC97W159XSt9Ly5leGVjKHVybCk7XG5cdFx0aWYgKHN0cmF5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBDYW5ub3QgbG9hZCAke3BrZy5pZH0gU0RLOiBcXGBwcm9kdWN0LmFnZW50U2Rrcy4ke3BrZy5pZH0udXJsVGVtcGxhdGVcXGAgYCArXG5cdFx0XHRcdGBjb250YWlucyBhbiB1bmtub3duIHBsYWNlaG9sZGVyICR7c3RyYXlbMF19IFx1MjAxNCBvbmx5IHtzZGtUYXJnZXR9IGlzIHN1YnN0aXR1dGVkLiBgICtcblx0XHRcdFx0YFRlbXBsYXRlOiAke2NvbmZpZy51cmxUZW1wbGF0ZX1gLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZURpciA9IHRoaXMuX2NhY2hlRGlyKHBrZy5pZCwgY29uZmlnLnZlcnNpb24sIHNka1RhcmdldCk7XG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuam9pblBhdGgoVVJJLmZpbGUoY2FjaGVEaXIpLCAnLmNvbXBsZXRlJyk7XG5cblx0XHQvLyBgLmNvbXBsZXRlYCdzIG1lcmUgcHJlc2VuY2UgaXMgdGhlIGludGVncml0eSBzaWduYWwgXHUyMDE0IGV4dHJhY3RzXG5cdFx0Ly8gdGhhdCBjcmFzaGVkIG1pZC13YXkgbmV2ZXIgd3JpdGUgaXQuIFNlZSBgX2Rvd25sb2FkYCBmb3Igd2h5XG5cdFx0Ly8gdGhlIHNlbnRpbmVsIGlzIHdyaXR0ZW4gaW5zaWRlIHRoZSB0bXAgZGlyIGJlZm9yZSB0aGUgcmVuYW1lLlxuXHRcdGlmIChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMoc2VudGluZWwpKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVEaXI7XG5cdFx0fVxuXG5cdFx0Ly8gRG93bmxvYWQgKGRlZHVwZWQgYWNyb3NzIGNvbmN1cnJlbnQgY2FsbGVycyBpbiB0aGUgc2FtZSBwcm9jZXNzKS5cblx0XHQvLyBjYWNoZURpciBpcyBhbHJlYWR5IHVuaXF1ZSBwZXIgKHBrZywgdmVyc2lvbiwgc2RrVGFyZ2V0KSBcdTIwMTQgd2l0aGluXG5cdFx0Ly8gYSBzaW5nbGUgZG93bmxvYWRlciBpbnN0YW5jZSB1c2VyRGF0YVBhdGggaXMgZml4ZWQsIHNvIGl0IHNlcnZlc1xuXHRcdC8vIGFzIHRoZSBkZWR1cCBrZXkgd2l0aG91dCBhbiBleHRyYSBzdHJpbmcgYWxsb2NhdGlvbi5cblx0XHRsZXQgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdEb3dubG9hZHMuZ2V0KGNhY2hlRGlyKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHBlbmRpbmcgPSB0aGlzLl9kb3dubG9hZChwa2csIHVybCwgY2FjaGVEaXIsIHNlbnRpbmVsLCB0b2tlbikuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdEb3dubG9hZHMuZGVsZXRlKGNhY2hlRGlyKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0Rvd25sb2Fkcy5zZXQoY2FjaGVEaXIsIHBlbmRpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGVuZGluZztcblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlRGlyKHBhY2thZ2VJZDogc3RyaW5nLCBzZGtWZXJzaW9uOiBzdHJpbmcsIHNka1RhcmdldDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBgc2RrVGFyZ2V0YCBpcyBpbiB0aGUgcGF0aCBzbyBtYWNPUyBVbml2ZXJzYWwgYnVpbGRzIGtlZXAgdHdvXG5cdFx0Ly8gaW5kZXBlbmRlbnQgY2FjaGVzIFx1MjAxNCBvbmUgcGVyIHJlc29sdmVkIHRhcmdldCBcdTIwMTQgaW5zdGVhZCBvZlxuXHRcdC8vIHRocmFzaGluZyBhIHNpbmdsZSBzaGFyZWQgb25lIGFzIGxhdW5jaGVzIGFsdGVybmF0ZS5cblx0XHRyZXR1cm4gcGF0aC5qb2luKFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCxcblx0XHRcdCdhZ2VudC1ob3N0Jyxcblx0XHRcdCdzZGstY2FjaGUnLFxuXHRcdFx0cGFja2FnZUlkLFxuXHRcdFx0c2RrVmVyc2lvbixcblx0XHRcdHNka1RhcmdldCxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG93bmxvYWQoXG5cdFx0cGtnOiBJQWdlbnRTZGtQYWNrYWdlLFxuXHRcdHVybDogc3RyaW5nLFxuXHRcdGNhY2hlRGlyOiBzdHJpbmcsXG5cdFx0c2VudGluZWw6IFVSSSxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IGRvd25sb2FkaW5nIGZyb20gJHt1cmx9YCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHBhcmVudCA9IHBhdGguZGlybmFtZShjYWNoZURpcik7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5maWxlKHBhcmVudCkpO1xuXG5cdFx0Ly8gRXh0cmFjdCB0byBhIHBlci1waWQgc2NyYXRjaCBkaXIgYWxvbmdzaWRlIHRoZSBmaW5hbCBjYWNoZSBkaXIsIHRoZW5cblx0XHQvLyByZW5hbWUgaW50byBwbGFjZS4gSWYgdHdvIHdpbmRvd3Mgb2YgdGhlIHNhbWUgaW5zdGFsbCByYWNlLCB0aGUgbG9zZXJcblx0XHQvLyBjYXRjaGVzIHRoZSBgbW92ZWAncyBgRklMRV9NT1ZFX0NPTkZMSUNUYCwgY2hlY2tzIHRoZSBleGlzdGluZ1xuXHRcdC8vIC5jb21wbGV0ZSBzZW50aW5lbCwgYW5kIHVzZXMgdGhhdCBpbnN0ZWFkIFx1MjAxNCBzZWUgdGhlIHJlbmFtZS1sb3NlclxuXHRcdC8vIHBhdGggYmVsb3cuXG5cdFx0Y29uc3QgdG1wRGlyID0gYCR7Y2FjaGVEaXJ9LnRtcC4ke3Byb2Nlc3MucGlkfWA7XG5cdFx0Y29uc3QgdG1wRGlyVXJpID0gVVJJLmZpbGUodG1wRGlyKTtcblx0XHRhd2FpdCB0aGlzLl9kZWxJZ25vcmluZ01pc3NpbmcodG1wRGlyVXJpKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIodG1wRGlyVXJpKTtcblxuXHRcdC8vIEZpcmUgdGhlIGRvd25sb2FkIGxpZmVjeWNsZSBvbiB0aGUgcHJvY2Vzcy1nbG9iYWwgZXZlbnQgc28gYSBzaW5nbGVcblx0XHQvLyBzdWJzY3JpYmVyICh0aGUgcHJvdG9jb2wgc2VydmVyKSBjYW4gZm9yd2FyZCBpdCB0byBjbGllbnRzLiBPbmVcblx0XHQvLyBgc3RhcnRlZGAsIHRocm90dGxlZCBgcHJvZ3Jlc3NgIGZyb20gYF9mZXRjaGAsIHRoZW4gYSB0ZXJtaW5hbCBmcmFtZS5cblx0XHRjb25zdCBkb3dubG9hZElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0bGV0IGxhc3RSZWNlaXZlZCA9IDA7XG5cdFx0bGV0IGxhc3RUb3RhbDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2ZpcmVQcm9ncmVzcyhwa2csIGRvd25sb2FkSWQsICdzdGFydGVkJywgMCwgdW5kZWZpbmVkKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0YXJiYWxsUGF0aCA9IHBhdGguam9pbih0bXBEaXIsICdzZGsudGd6Jyk7XG5cdFx0XHRhd2FpdCB0aGlzLl9mZXRjaCh1cmwsIHRhcmJhbGxQYXRoLCB0b2tlbiwgKHJlY2VpdmVkQnl0ZXMsIHRvdGFsQnl0ZXMpID0+IHtcblx0XHRcdFx0bGFzdFJlY2VpdmVkID0gcmVjZWl2ZWRCeXRlcztcblx0XHRcdFx0bGFzdFRvdGFsID0gdG90YWxCeXRlcztcblx0XHRcdFx0dGhpcy5fZmlyZVByb2dyZXNzKHBrZywgZG93bmxvYWRJZCwgJ3Byb2dyZXNzJywgcmVjZWl2ZWRCeXRlcywgdG90YWxCeXRlcyk7XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dHJhY3RUYXJHeih0YXJiYWxsUGF0aCwgdG1wRGlyKTtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbChVUkkuZmlsZSh0YXJiYWxsUGF0aCkpO1xuXG5cdFx0XHQvLyBXcml0ZSB0aGUgYC5jb21wbGV0ZWAgc2VudGluZWwgaW5zaWRlIHRoZSB0bXAgZGlyIEJFRk9SRSB0aGVcblx0XHRcdC8vIG1vdmUgc28gdGhlIG1vdmUgYXRvbWljYWxseSBwdWJsaXNoZXMgYSBkaXJlY3RvcnkgdGhhdFxuXHRcdFx0Ly8gYWxyZWFkeSBjYXJyaWVzIGl0cyBzZW50aW5lbCBcdTIwMTQgYSBjcmFzaCBiZXR3ZWVuIG1vdmUgYW5kXG5cdFx0XHQvLyBzZW50aW5lbC13cml0ZSBjYW4ndCBsZWF2ZSBhIHdlZGdlZCwgc2VudGluZWwtbGVzcyBjYWNoZURpclxuXHRcdFx0Ly8gYmVoaW5kLiBDb250ZW50IGlzIGludGVudGlvbmFsbHkgZW1wdHk6IG9ubHkgZXhpc3RlbmNlXG5cdFx0XHQvLyBtYXR0ZXJzLCBhbmQgdGhlIGNhY2hlIGRpciBwYXRoIGFscmVhZHkgZW5jb2Rlc1xuXHRcdFx0Ly8gYDxwa2c+Lzx2ZXJzaW9uPi88c2RrVGFyZ2V0PmAgZm9yIGRlYnVnZ2luZy5cblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShcblx0XHRcdFx0VVJJLmpvaW5QYXRoKHRtcERpclVyaSwgJy5jb21wbGV0ZScpLFxuXHRcdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIEF0b21pYyBwdWJsaXNoIG9mIHRoZSBjb21wbGV0ZWQgZXh0cmFjdGlvbi5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUodG1wRGlyVXJpLCBVUkkuZmlsZShjYWNoZURpcikpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLl9oYW5kbGVSZW5hbWVMb3NlcihlcnIsIHNlbnRpbmVsLCB0bXBEaXJVcmkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IGxvc3QgcmVuYW1lIHJhY2UsIHVzaW5nIGV4aXN0aW5nIGNhY2hlYCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVByb2dyZXNzKHBrZywgZG93bmxvYWRJZCwgJ2NvbXBsZXRlZCcsIGxhc3RSZWNlaXZlZCwgbGFzdFRvdGFsKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FjaGVEaXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbGFwc2VkID0gTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIHN0YXJ0KSAvIDEwMDApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IGRvd25sb2FkZWQgaW4gJHtlbGFwc2VkfXNgKTtcblx0XHRcdHRoaXMuX2ZpcmVQcm9ncmVzcyhwa2csIGRvd25sb2FkSWQsICdjb21wbGV0ZWQnLCBsYXN0VG90YWwgPz8gbGFzdFJlY2VpdmVkLCBsYXN0VG90YWwpO1xuXHRcdFx0cmV0dXJuIGNhY2hlRGlyO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGVsSWdub3JpbmdNaXNzaW5nKHRtcERpclVyaSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fZmlyZVByb2dyZXNzKHBrZywgZG93bmxvYWRJZCwgJ2ZhaWxlZCcsIGxhc3RSZWNlaXZlZCwgbGFzdFRvdGFsLCAnY2FuY2VsbGVkJyk7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRoaXMuX2ZpcmVQcm9ncmVzcyhwa2csIGRvd25sb2FkSWQsICdmYWlsZWQnLCBsYXN0UmVjZWl2ZWQsIGxhc3RUb3RhbCwgbWVzc2FnZSk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBGYWlsZWQgdG8gZG93bmxvYWQgJHtwa2cuaWR9IFNESyBmcm9tICR7dXJsfSBgICtcblx0XHRcdFx0YChjYWNoZSB0YXJnZXQ6ICR7Y2FjaGVEaXJ9KS4gYCArXG5cdFx0XHRcdGBTZXQgJHtwa2cuZGV2T3ZlcnJpZGVFbnZWYXJ9IHRvIGEgbG9jYWwgU0RLIHJvb3QgdG8gYnlwYXNzLiBgICtcblx0XHRcdFx0YENhdXNlOiAke21lc3NhZ2V9YCxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZVByb2dyZXNzKFxuXHRcdHBrZzogSUFnZW50U2RrUGFja2FnZSxcblx0XHRkb3dubG9hZElkOiBzdHJpbmcsXG5cdFx0cGhhc2U6IEFnZW50U2RrRG93bmxvYWRQaGFzZSxcblx0XHRyZWNlaXZlZEJ5dGVzOiBudW1iZXIsXG5cdFx0dG90YWxCeXRlczogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdGVycm9yPzogc3RyaW5nLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZERvd25sb2FkUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRkb3dubG9hZElkLFxuXHRcdFx0cGFja2FnZUlkOiBwa2cuaWQsXG5cdFx0XHRkaXNwbGF5TmFtZTogcGtnLmRpc3BsYXlOYW1lLFxuXHRcdFx0cGhhc2UsXG5cdFx0XHRyZWNlaXZlZEJ5dGVzLFxuXHRcdFx0dG90YWxCeXRlcyxcblx0XHRcdC4uLihlcnJvciAhPT0gdW5kZWZpbmVkID8geyBlcnJvciB9IDoge30pLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUmVuYW1lTG9zZXIoXG5cdFx0ZXJyOiB1bmtub3duLFxuXHRcdHNlbnRpbmVsOiBVUkksXG5cdFx0dG1wRGlyVXJpOiBVUkksXG5cdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIGBJRmlsZVNlcnZpY2UubW92ZWAgd2l0aCBkZWZhdWx0IChvdmVyd3JpdGU6IGZhbHNlKSB0aHJvd3MgYVxuXHRcdC8vIEZpbGVPcGVyYXRpb25FcnJvciB3aXRoIEZJTEVfTU9WRV9DT05GTElDVCB3aGVuIHRoZSB0YXJnZXQgZXhpc3RzLlxuXHRcdC8vIEFueXRoaW5nIGVsc2UgaXMgYSByZWFsIGVycm9yLlxuXHRcdGlmICghKGVyciBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvcikgfHwgZXJyLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhzZW50aW5lbCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIFdpbm5lciBhbHJlYWR5IHB1Ymxpc2hlZCBhIGNvbXBsZXRlIGNhY2hlLiBEcm9wIG91ciBzY3JhdGNoIGRpci5cblx0XHRhd2FpdCB0aGlzLl9kZWxJZ25vcmluZ01pc3NpbmcodG1wRGlyVXJpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoKFxuXHRcdHVybDogc3RyaW5nLFxuXHRcdGRlc3Q6IHN0cmluZyxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0b25CeXRlcz86IChyZWNlaXZlZEJ5dGVzOiBudW1iZXIsIHRvdGFsQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4gdm9pZCxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRGVsZWdhdGUgdG8gSVJlcXVlc3RTZXJ2aWNlIChjb3Jwb3JhdGUgcHJveHksIHN0cmljdFNTTCwga2VyYmVyb3MsXG5cdFx0Ly8gcmV0cmllcywgcmVkaXJlY3QgZm9sbG93KS4gYGZzLmNyZWF0ZVdyaXRlU3RyZWFtYCAobm90XG5cdFx0Ly8gYElGaWxlU2VydmljZS53cml0ZUZpbGVgKSBzbyB0aGF0IGNhbmNlbGxpbmcgYSBtdWx0aS1NQiBkb3dubG9hZFxuXHRcdC8vIGFib3J0cyBwcm9tcHRseSB2aWEgZGVzdHJveSgpLiBNYW51YWwgcGlwZSAobm90IGBzdHJlYW0ucGlwZWxpbmVgKVxuXHRcdC8vIGJlY2F1c2UgdGhlIHNvdXJjZSBpcyBhIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gXHUyMDE0IG5vdCBhIE5vZGVcblx0XHQvLyBSZWFkYWJsZSBcdTIwMTQgc28gbm9kZS1zdHJlYW0gdXRpbGl0aWVzIGNhbid0IGludHJvc3BlY3QgaXQuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dDogSVJlcXVlc3RDb250ZXh0ID0gYXdhaXQgdGhpcy5fcmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR1cmwsXG5cdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdGNhbGxTaXRlOiAnYWdlbnRTZGtEb3dubG9hZGVyJyxcblx0XHR9LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRjb250ZXh0LnN0cmVhbS5kZXN0cm95KCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNDb2RlID0gY29udGV4dC5yZXMuc3RhdHVzQ29kZSA/PyAwO1xuXHRcdGlmIChzdGF0dXNDb2RlIDwgMjAwIHx8IHN0YXR1c0NvZGUgPj0gMzAwKSB7XG5cdFx0XHRjb250ZXh0LnN0cmVhbS5kZXN0cm95KCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtzdGF0dXNDb2RlfSBmZXRjaGluZyAke3VybH1gKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgQ0ROIHNlbmRzIGBDb250ZW50LUxlbmd0aGAgZm9yIHRoZXNlIHN0YXRpYyB0YXJiYWxscywgd2hpY2ggbGV0c1xuXHRcdC8vIHVzIHJlcG9ydCBkZXRlcm1pbmF0ZSBwZXJjZW50YWdlIHByb2dyZXNzLiBBIG1pc3NpbmcvZ2FyYmxlZCBoZWFkZXJcblx0XHQvLyBkZWdyYWRlcyBncmFjZWZ1bGx5IHRvIGFuIGluZGV0ZXJtaW5hdGUgKGJ5dGUtY291bnQgb25seSkgcmVwb3J0LlxuXHRcdGNvbnN0IHRvdGFsQnl0ZXMgPSBwYXJzZUNvbnRlbnRMZW5ndGgoY29udGV4dC5yZXMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBmcy5jcmVhdGVXcml0ZVN0cmVhbShkZXN0KTtcblx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0XHQvLyBUaHJvdHRsZSBwcm9ncmVzcyBzbyBhIGZhc3QgbGluayBkb2Vzbid0IGZpcmUgdGhvdXNhbmRzIG9mXG5cdFx0XHQvLyBzYW1wbGVzLiBUaGUgZmlyc3QgY2h1bmsgYWx3YXlzIHBhc3NlcyAobGFzdEVtaXQgc3RhcnRzIGF0IDApXG5cdFx0XHQvLyBhbmQgJ2VuZCcgZm9yY2VzIGEgZmluYWwgc2FtcGxlLCBzbyBjb25zdW1lcnMgc2VlIGEgc3RhcnQgYW5kIGFcblx0XHRcdC8vIDEwMCUgZmluaXNoIHJlZ2FyZGxlc3Mgb2YgY2h1bmsgdGltaW5nLlxuXHRcdFx0bGV0IHJlY2VpdmVkQnl0ZXMgPSAwO1xuXHRcdFx0bGV0IGxhc3RFbWl0VGltZSA9IDA7XG5cdFx0XHRjb25zdCBlbWl0Qnl0ZXMgPSAoZm9yY2U6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKCFvbkJ5dGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRcdGlmICghZm9yY2UgJiYgbm93IC0gbGFzdEVtaXRUaW1lIDwgUFJPR1JFU1NfRU1JVF9USFJPVFRMRV9NUykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0RW1pdFRpbWUgPSBub3c7XG5cdFx0XHRcdG9uQnl0ZXMocmVjZWl2ZWRCeXRlcywgdG90YWxCeXRlcyk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2V0dGxlUmVzb2x2ZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHNldHRsZWQpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRjYW5jZWxTdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2V0dGxlUmVqZWN0ID0gKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRpZiAoc2V0dGxlZCkgeyByZXR1cm47IH1cblx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdGNhbmNlbFN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNvbnRleHQuc3RyZWFtLmRlc3Ryb3koKTtcblx0XHRcdFx0b3V0LmRlc3Ryb3koKTtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2FuY2VsU3ViID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gc2V0dGxlUmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKSk7XG5cdFx0XHRvdXQub24oJ2Vycm9yJywgc2V0dGxlUmVqZWN0KTtcblx0XHRcdG91dC5vbignZmluaXNoJywgc2V0dGxlUmVzb2x2ZSk7XG5cdFx0XHQvLyBCYWNrcHJlc3N1cmU6IHRhcmJhbGxzIGFyZSA3MC05NU1COyBpZiB0aGUgZGlzayBpcyBzbG93ZXJcblx0XHRcdC8vIHRoYW4gdGhlIG5ldHdvcmsgKFdpbmRvd3MgQVYgc2NhbiwgbmV0d29yayBob21lIGRpciwgXHUyMDI2KSBhblxuXHRcdFx0Ly8gdW50aHJvdHRsZWQgcGlwZSBidWZmZXJzIHRoZSB3aG9sZSB0aGluZyBpbiBtZW1vcnkuIFBhdXNlIHRoZVxuXHRcdFx0Ly8gc291cmNlIHdoZW4gdGhlIHNpbmsncyBpbnRlcm5hbCBidWZmZXIgaGl0cyBoaWdoV2F0ZXJNYXJrIGFuZFxuXHRcdFx0Ly8gcmVzdW1lIG9uICdkcmFpbicuXG5cdFx0XHRvdXQub24oJ2RyYWluJywgKCkgPT4gY29udGV4dC5zdHJlYW0ucmVzdW1lKCkpO1xuXHRcdFx0Y29udGV4dC5zdHJlYW0ub24oJ2RhdGEnLCBjaHVuayA9PiB7XG5cdFx0XHRcdHJlY2VpdmVkQnl0ZXMgKz0gY2h1bmsuYnl0ZUxlbmd0aDtcblx0XHRcdFx0ZW1pdEJ5dGVzKGZhbHNlKTtcblx0XHRcdFx0aWYgKCFvdXQud3JpdGUoY2h1bmsuYnVmZmVyKSkge1xuXHRcdFx0XHRcdGNvbnRleHQuc3RyZWFtLnBhdXNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29udGV4dC5zdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0ZW1pdEJ5dGVzKHRydWUpO1xuXHRcdFx0XHRvdXQuZW5kKCk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnRleHQuc3RyZWFtLm9uKCdlcnJvcicsIHNldHRsZVJlamVjdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leHRyYWN0VGFyR3oodGFyYmFsbDogc3RyaW5nLCBkZXN0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBgdGFyYCAobm9kZS10YXIpIGlzIHB1cmUgSlMgXHUyMDE0IHdvcmtzIG9uIGV2ZXJ5IHBsYXRmb3JtIHRoZSBhZ2VudCBob3N0XG5cdFx0Ly8gcnVucyBvbiB3aXRob3V0IGRlcGVuZGluZyBvbiBhIHN5c3RlbSBgdGFyYCBiaW5hcnkuXG5cdFx0YXdhaXQgdGFyLngoeyBmaWxlOiB0YXJiYWxsLCBjd2Q6IGRlc3QgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZWxJZ25vcmluZ01pc3NpbmcodXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHVyaSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBgZm9yY2U6IHRydWVgIGJlaGF2aW91cjogbWlzc2luZyBwYXRoIGlzIGEgbm8tb3AuXG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVyciBhcyBFcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUF1QztBQUNoRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9CQUFvQixxQkFBcUIsY0FBYyw2QkFBNkI7QUFDN0YsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUF5RGhDLE1BQU0sc0JBQXNCLG9CQUFJLElBQXFCLENBQUMsU0FBUyxVQUFVLE9BQU8sQ0FBQztBQUNqRixNQUFNLG1CQUFtQixvQkFBSSxJQUFZLENBQUMsT0FBTyxPQUFPLENBQUM7QUF1QmxELFNBQVMsaUJBQ2YsS0FDQSxPQUF1QixFQUFFLFVBQVUsUUFBUSxVQUFVLE1BQU0sUUFBUSxNQUFNLE1BQU0sZUFBZSxFQUFFLEdB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
