import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { basename, dirname } from "../../../../../../base/common/path.js";
import { aggregateAnthropicSse, anthropicMessageToSse, ANTHROPIC_MESSAGES_PATH, aggregateResponsesSse, responsesMessageToSse, RESPONSES_PATH, summarizeResponsesRequest, deserializeAnthropicContent, serializeAnthropicContent, summarizeAnthropicRequest } from "./capiWireCodec.js";
import { getAncillaryStub } from "./capiStubs.js";
import { findPosixOnlyCommands, formatPosixCommandError } from "./posixCommandLint.js";
import { formatModelRequestMismatch, modelRequestsMatch, projectModelRequest } from "./modelRequestProjection.js";
import { expandShellToolName, normalizeShellToolNameForCapture } from "./shellToolNames.js";
import { scrubUserName, USER_NAME_PLACEHOLDER } from "./userNameScrub.js";
const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire("http");
const httpsModule = nodeRequire("https");
const zlibModule = nodeRequire("zlib");
const yamlModule = nodeRequire("js-yaml");
const MODEL_ENDPOINTS = /* @__PURE__ */ new Set(["/chat/completions", "/responses", "/v1/messages"]);
const WORKDIR_PLACEHOLDER = "${workdir}";
const HOMEDIR_PLACEHOLDER = "${homedir}";
const TEMP_DIR_SUFFIX_PLACEHOLDER = "${temp}";
const TEMP_DIR_SUFFIX_RE = /(\$\{workdir\}(?:\/|\\\\)(?:ahp-(?:snapshot|perm-test|plan-test|abort|test|wt-test|subagent-test|subagent-replay|attachment-test|cd-strip-test|coverage-[a-z-]+)-|copilot-(?:cost-report|text-blob)-|read-sdk-simple))[A-Za-z0-9]{6}/g;
const FILE_LISTING_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\b/g;
const USER_PLACEHOLDER = USER_NAME_PLACEHOLDER;
const CAPI_PLACEHOLDER = "${capi}";
const SECRET_PLACEHOLDER = "${redacted}";
const SECRET_FIELD_RE = /("(?:token|session_token)"\s*:\s*)"[^"]*"/g;
const SYSTEM_FIELD_RE = /("instructions"\s*:\s*)"(?:[^"\\]|\\.)*"/g;
const SYSTEM_PROMPT_PLACEHOLDER = "${system}";
const GITHUB_API_PREFIXES = ["/copilot_internal", "/telemetry", "/copilot/mcp_registry"];
const DIALECT_ENDPOINT = {
  anthropic: { method: "POST", path: ANTHROPIC_MESSAGES_PATH },
  responses: { method: "POST", path: RESPONSES_PATH }
};
function isTurnExchange(exchange) {
  return exchange.request !== void 0;
}
class CapiReplayProxy {
  constructor(_options) {
    this._options = _options;
    this._stopped = false;
    /** Buckets used for replay, keyed by `${method} ${path}`. */
    this._replayBuckets = /* @__PURE__ */ new Map();
    /** Exchanges captured during recording, in arrival order. */
    this._recorded = [];
    this._observedModelRequestBodies = [];
    this._cacheMisses = [];
    this._requestMismatches = [];
    this._modelTurnCount = 0;
    this._allowStaleRecordedRequest = _options.allowStaleRecordedRequest ?? false;
    this._fixturePath = _options.fixturePath;
    this._workingDirectory = _options.workDir;
    const fixtureExists = existsSync(this._fixturePath);
    this._mode = _options.mode ?? "replay";
    this._strict = _options.strict ?? true;
    if (this._mode === "replay" && !fixtureExists) {
      throw new Error(`[capi-replay] replay mode requires a fixture but none exists at ${this._fixturePath}`);
    }
    this._isReplaying = this._mode === "replay";
    if (this._isReplaying) {
      this._loadFixture();
    }
  }
  /** Base URL the agent host should be pointed at. Available after {@link start}. */
  get url() {
    if (!this._url) {
      throw new Error("[capi-replay] proxy not started");
    }
    return this._url;
  }
  get isReplaying() {
    return this._isReplaying;
  }
  async start() {
    this._server = httpModule.createServer((req, res) => this._handle(req, res));
    return new Promise((resolve, reject) => {
      this._server.on("error", reject);
      this._server.listen(0, "127.0.0.1", () => {
        const addr = this._server.address();
        if (addr && typeof addr === "object") {
          this._url = `http://127.0.0.1:${addr.port}`;
          resolve(this._url);
        } else {
          reject(new Error("[capi-replay] failed to determine proxy address"));
        }
      });
    });
  }
  /**
   * Stop the proxy. When recording, flushes captured exchanges to the fixture.
   * When replaying in strict mode, throws if any request missed the cache.
   */
  async stop() {
    if (this._stopped) {
      return;
    }
    this._stopped = true;
    await this._closeSocket();
    if (this._isReplaying) {
      this.assertNoReplayMismatches();
      return;
    }
    this._writeFixture();
  }
  /**
   * Re-point a long-lived replay proxy at a different per-test fixture without
   * restarting the HTTP server (so the URL the agent host was pointed at stays
   * valid). Clears the previous fixture's replay buckets and cache-miss log.
   * Replay-only: recording keeps one fixture per proxy.
   */
  resetForReplay(fixturePath, allowStaleRecordedRequest = false) {
    if (!this._isReplaying) {
      throw new Error("[capi-replay] resetForReplay is only valid in replay mode");
    }
    if (!existsSync(fixturePath)) {
      throw new Error(`[capi-replay] replay mode requires a fixture but none exists at ${fixturePath}`);
    }
    this._fixturePath = fixturePath;
    this._allowStaleRecordedRequest = allowStaleRecordedRequest;
    this._workingDirectory = void 0;
    this._replayBuckets.clear();
    this._observedModelRequestBodies.length = 0;
    this._cacheMisses.length = 0;
    this._requestMismatches.length = 0;
    this._modelTurnCount = 0;
    this._loadFixture();
  }
  setWorkingDirectory(workingDirectory) {
    this._workingDirectory = workingDirectory;
  }
  get observedModelRequestBodies() {
    return this._observedModelRequestBodies;
  }
  /**
   * Surface strict replay failures — unrecorded requests and requests that do
   * not match the recorded one — without stopping the proxy. Lets a shared
   * replay server verify each test's traffic in `teardown` while keeping the
   * server (and the agent host's cached SDK client) alive for the next test.
   */
  assertNoReplayMismatches() {
    const error = this._createReplayError();
    if (error) {
      throw error;
    }
  }
  /** Returns and consumes the current replay failure so it can be surfaced at the original test failure. */
  takeReplayError() {
    const error = this._createReplayError();
    this._cacheMisses.length = 0;
    this._requestMismatches.length = 0;
    return error;
  }
  _createReplayError() {
    if (!this._isReplaying || !this._strict) {
      return void 0;
    }
    const sections = [];
    if (this._cacheMisses.length > 0) {
      sections.push(`[capi-replay] ${this._cacheMisses.length} cache miss(es):
${this._cacheMisses.join("\n")}`);
    }
    if (this._requestMismatches.length > 0) {
      sections.push(`[capi-replay] ${this._requestMismatches.length} model request mismatch(es):
${this._requestMismatches.join("\n")}`);
    }
    const unconsumed = Array.from(this._replayBuckets.entries()).flatMap(([key, bucket]) => bucket.index < bucket.items.length ? [`${key}: ${bucket.items.length - bucket.index} response(s)`] : []);
    if (unconsumed.length > 0) {
      sections.push(`[capi-replay] unconsumed recorded responses:
${unconsumed.join("\n")}`);
    }
    return sections.length > 0 ? new Error(sections.join("\n\n")) : void 0;
  }
  /**
   * Close the HTTP server socket without running the strict replay checks or
   * writing a fixture. Used to tear down a shared replay proxy after per-test
   * verification has already happened via {@link assertNoReplayMismatches}.
   */
  async close() {
    if (this._stopped) {
      return;
    }
    this._stopped = true;
    await this._closeSocket();
  }
  async _closeSocket() {
    const server = this._server;
    this._server = void 0;
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
  }
  // -- request handling -----------------------------------------------------
  _handle(req, res) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (this._isReplaying) {
        this._replay(req, body, res);
      } else {
        this._record(req, body, res);
      }
    });
    req.on("error", () => this._fail(res, "request stream error"));
  }
  _replay(req, body, res) {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const stub = getAncillaryStub(method, path);
    if (stub) {
      res.writeHead(stub.status, { ...stub.headers });
      res.end(replaceAll(stub.body, CAPI_PLACEHOLDER, this.url));
      return;
    }
    const key = `${method} ${path}`;
    if (MODEL_ENDPOINTS.has(path)) {
      this._observedModelRequestBodies.push(this._normalize(body));
    }
    const bucket = this._replayBuckets.get(key);
    let item;
    if (bucket) {
      if (bucket.index < bucket.items.length) {
        item = bucket.items[bucket.index++];
      } else if (!MODEL_ENDPOINTS.has(path)) {
        item = bucket.items[bucket.items.length - 1];
      }
    }
    if (!item) {
      this._cacheMisses.push(`${key} (call #${(bucket?.index ?? 0) + 1}) \u2014 no recorded response`);
      this._fail(res, `no recorded response for ${key}`);
      return;
    }
    if (item.kind === "turn") {
      this._assertRecordedRequest(item.dialect, item.request, body);
      const message = this._expandReplayMessage(item.message);
      const sseBody = item.dialect === "responses" ? responsesMessageToSse(message) : anthropicMessageToSse(message);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.end(sseBody);
      return;
    }
    const headers = { ...item.response.headers };
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    res.writeHead(item.response.status, headers);
    res.end(this._expandReplayPlaceholders(item.response.body));
  }
  /**
   * Compare the live request against the one recorded for this turn.
   *
   * Both sides go through the same summarizer and the same projection, so the
   * committed `request:` block becomes the expectation without its stored
   * shape having to change.
   */
  _assertRecordedRequest(dialect, recorded, body) {
    const turnIndex = this._modelTurnCount++;
    if (this._allowStaleRecordedRequest) {
      return;
    }
    const summarize = dialect === "responses" ? summarizeResponsesRequest : summarizeAnthropicRequest;
    const observed = summarize(this._normalize(body));
    if (!observed) {
      return;
    }
    const expected = projectModelRequest(recorded);
    const actual = projectModelRequest(observed);
    if (!modelRequestsMatch(expected, actual)) {
      this._requestMismatches.push(formatModelRequestMismatch(turnIndex, expected, actual));
    }
  }
  _record(req, body, res) {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (MODEL_ENDPOINTS.has(path)) {
      this._observedModelRequestBodies.push(this._normalize(body));
    }
    const upstreamBase = this._upstreamFor(path);
    const upstream = new URL(req.url ?? "/", upstreamBase);
    const isHttps = upstream.protocol === "https:";
    const transport = isHttps ? httpsModule : httpModule;
    const forwardHeaders = { ...req.headers };
    forwardHeaders.host = upstream.host;
    delete forwardHeaders["connection"];
    delete forwardHeaders["content-length"];
    const upstreamReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || (isHttps ? 443 : 80),
        path: upstream.pathname + upstream.search,
        method,
        headers: forwardHeaders
      },
      (upstreamRes) => {
        const respChunks = [];
        const status = upstreamRes.statusCode ?? 502;
        const headers = flattenHeaders(upstreamRes.headers);
        res.writeHead(status, headers);
        upstreamRes.on("data", (chunk) => {
          respChunks.push(chunk);
          res.write(chunk);
        });
        upstreamRes.on("end", () => {
          res.end();
          if (getAncillaryStub(method, path)) {
            return;
          }
          const decoded = decodeBody(Buffer.concat(respChunks), headers["content-encoding"]);
          const storedHeaders = { ...headers };
          delete storedHeaders["content-encoding"];
          const capiOrigin = new URL(this._capiUpstream).origin;
          const normalizedBody = this._normalize(replaceAll(decoded, capiOrigin, CAPI_PLACEHOLDER)).replace(SECRET_FIELD_RE, `$1"${SECRET_PLACEHOLDER}"`).replace(SYSTEM_FIELD_RE, `$1"${SYSTEM_PROMPT_PLACEHOLDER}"`);
          this._recorded.push({
            method,
            path,
            requestBody: this._normalize(body),
            response: { status, headers: storedHeaders, body: normalizedBody }
          });
        });
      }
    );
    upstreamReq.on("error", (err) => this._fail(res, `upstream error: ${err instanceof Error ? err.message : String(err)}`));
    if (body) {
      upstreamReq.write(body);
    }
    upstreamReq.end();
  }
  /** GitHub-API paths go to the GitHub upstream; everything else to CAPI. */
  _upstreamFor(path) {
    if (GITHUB_API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return this._githubUpstream;
    }
    return this._capiUpstream;
  }
  get _capiUpstream() {
    const url = this._options.capiUpstreamUrl ?? this._options.upstreamUrl;
    if (!url) {
      throw new Error("[capi-replay] no CAPI upstream configured (set capiUpstreamUrl or upstreamUrl)");
    }
    return url;
  }
  get _githubUpstream() {
    const url = this._options.githubUpstreamUrl ?? this._options.upstreamUrl;
    if (!url) {
      throw new Error("[capi-replay] no GitHub upstream configured (set githubUpstreamUrl or upstreamUrl)");
    }
    return url;
  }
  _fail(res, message) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain", "x-should-retry": "false" });
    }
    res.end(`[capi-replay] ${message}`);
  }
  // -- fixture I/O ----------------------------------------------------------
  _loadFixture() {
    const fixture = yamlModule.load(readFileSync(this._fixturePath, "utf8"));
    const turnEndpoint = fixture.dialect ? DIALECT_ENDPOINT[fixture.dialect] : void 0;
    for (const exchange of fixture.exchanges) {
      let key;
      let item;
      if (isTurnExchange(exchange)) {
        if (!turnEndpoint) {
          throw new Error(`[capi-replay] fixture has turn exchanges but no top-level dialect: ${this._fixturePath}`);
        }
        key = `${turnEndpoint.method} ${turnEndpoint.path}`;
        item = { kind: "turn", dialect: fixture.dialect, message: { content: deserializeAnthropicContent(exchange.response.content), stopReason: exchange.response.stopReason }, request: exchange.request };
      } else {
        key = `${exchange.method} ${exchange.path}`;
        item = { kind: "raw", response: exchange.response };
      }
      let bucket = this._replayBuckets.get(key);
      if (!bucket) {
        bucket = { items: [], index: 0 };
        this._replayBuckets.set(key, bucket);
      }
      bucket.items.push(item);
    }
  }
  _writeFixture() {
    const built = this._recorded.map((exchange) => this._toFixtureExchange(exchange));
    const exchanges = built.map((b) => b.exchange);
    this._normalizeToolCallIds(exchanges);
    this._normalizeUuids(exchanges);
    this._assertNoPosixOnlyCommands(exchanges);
    const dialect = built.find((b) => b.dialect !== void 0)?.dialect;
    const fixture = { version: 1, ...dialect ? { dialect } : {}, exchanges };
    mkdirSync(dirname(this._fixturePath), { recursive: true });
    writeFileSync(this._fixturePath, yamlModule.dump(fixture, { lineWidth: -1, noRefs: true }));
  }
  /**
   * Reject a recording whose shell commands cannot run on Windows.
   *
   * Only the assistant's `tool_use` blocks matter: those are what replay feeds
   * back to the agent, so they are the commands that will actually be executed
   * on whatever platform the test later runs on. The `tool_result` blocks
   * echoed in request summaries are never read back.
   *
   * Throws before the file is written so a rejected recording cannot leave a
   * half-portable fixture behind.
   */
  _assertNoPosixOnlyCommands(exchanges) {
    if (this._options.allowPosixCommands) {
      return;
    }
    const commands = [];
    for (const exchange of exchanges) {
      if (!isTurnExchange(exchange)) {
        continue;
      }
      for (const block of deserializeAnthropicContent(exchange.response.content)) {
        if (block.type !== "tool_use") {
          continue;
        }
        const command = block.input?.command;
        if (typeof command === "string" && command) {
          commands.push({ command, toolName: block.name });
        }
      }
    }
    const findings = findPosixOnlyCommands(commands);
    if (findings.length > 0) {
      throw new Error(formatPosixCommandError(this._fixturePath, findings));
    }
  }
  /**
   * Replace the backend's opaque tool-call ids with stable, readable ordinals
   * (`toolcall_0`, `toolcall_1`, ...) across the whole fixture. Assistant
   * `tool_use` blocks define the ordering; the `tool_result` blocks that refer
   * back to them in later requests reuse the same mapping. Keeps captures
   * deterministic across re-records and easy to follow.
   */
  _normalizeToolCallIds(exchanges) {
    const idMap = /* @__PURE__ */ new Map();
    const mapId = (id) => {
      let mapped = idMap.get(id);
      if (mapped === void 0) {
        mapped = `toolcall_${idMap.size}`;
        idMap.set(id, mapped);
      }
      return mapped;
    };
    for (const exchange of exchanges) {
      if (!isTurnExchange(exchange) || !Array.isArray(exchange.response.content)) {
        continue;
      }
      for (const block of exchange.response.content) {
        const b = block;
        if (b.type === "tool_use" && typeof b.id === "string" && b.id) {
          b.id = mapId(b.id);
        }
      }
    }
    for (const exchange of exchanges) {
      if (!isTurnExchange(exchange)) {
        continue;
      }
      for (const message of exchange.request.messages) {
        const content = message.content;
        if (!Array.isArray(content)) {
          continue;
        }
        for (const block of content) {
          const b = block;
          if (b.type === "tool_result" && typeof b.tool_use_id === "string" && b.tool_use_id) {
            b.tool_use_id = mapId(b.tool_use_id);
          }
        }
      }
    }
  }
  /**
   * Replace ephemeral UUIDs (shell ids, session-state ids, ...) that appear in
   * captured request/response content with stable ordinal placeholders
   * (`${uuid_0}`, `${uuid_1}`, ...). They change on every re-record, so
   * normalizing them keeps committed fixtures diff-clean. Distinct UUIDs get
   * distinct placeholders; repeats of the same UUID reuse its placeholder.
   */
  _normalizeUuids(exchanges) {
    const idMap = /* @__PURE__ */ new Map();
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const mapUuid = (uuid) => {
      let mapped = idMap.get(uuid);
      if (mapped === void 0) {
        mapped = `\${uuid_${idMap.size}}`;
        idMap.set(uuid, mapped);
      }
      return mapped;
    };
    const walk = (value) => {
      if (typeof value === "string") {
        return value.replace(uuidRe, mapUuid);
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = walk(value[i]);
        }
        return value;
      }
      if (value && typeof value === "object") {
        const obj = value;
        for (const key of Object.keys(obj)) {
          obj[key] = walk(obj[key]);
        }
        return value;
      }
      return value;
    };
    for (const exchange of exchanges) {
      walk(exchange);
    }
  }
  /**
   * Convert a raw recorded exchange into its fixture form: model-endpoint calls
   * become readable turns (parsed request + regeneratable reply) tagged with
   * their dialect (hoisted to the fixture level by {@link _writeFixture});
   * everything else stays raw.
   */
  _toFixtureExchange(exchange) {
    if (exchange.method === "POST" && exchange.path === ANTHROPIC_MESSAGES_PATH) {
      const request = summarizeAnthropicRequest(exchange.requestBody);
      const message = aggregateAnthropicSse(exchange.response.body);
      if (request && message) {
        const content = this._normalizeMessageContent(message.content);
        return { exchange: { request, response: { content: serializeAnthropicContent(content), stopReason: message.stopReason } }, dialect: "anthropic" };
      }
    }
    if (exchange.method === "POST" && exchange.path === RESPONSES_PATH) {
      const request = summarizeResponsesRequest(exchange.requestBody);
      const message = aggregateResponsesSse(exchange.response.body);
      if (request && message) {
        const content = this._normalizeMessageContent(message.content);
        return { exchange: { request, response: { content: serializeAnthropicContent(content), stopReason: message.stopReason } }, dialect: "responses" };
      }
    }
    return { exchange: { method: exchange.method, path: exchange.path, response: exchange.response } };
  }
  /**
   * Normalize local paths out of an aggregated assistant reply. Tool-input JSON
   * streams split across many SSE deltas, so a string replace on the raw body
   * can miss a path straddling a chunk boundary; normalizing the reassembled
   * content (text + tool inputs) is reliable.
   */
  _normalizeMessageContent(content) {
    return content.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: this._normalize(block.text) };
      }
      let input = block.input;
      try {
        input = JSON.parse(this._normalize(JSON.stringify(block.input ?? {})));
      } catch {
      }
      return { type: "tool_use", id: block.id, name: normalizeShellToolNameForCapture(block.name), input };
    });
  }
  _normalize(text) {
    let result = text;
    if (this._workingDirectory) {
      const workDirs = /* @__PURE__ */ new Set([this._workingDirectory]);
      try {
        workDirs.add(realpathSync.native(this._workingDirectory));
      } catch {
      }
      for (const workDir of [...workDirs].sort((a, b) => b.length - a.length)) {
        result = replaceAll(result, escapeJsonString(workDir), WORKDIR_PLACEHOLDER);
        result = replaceAll(result, workDir, WORKDIR_PLACEHOLDER);
      }
    }
    if (this._options.homeDir) {
      result = replaceAll(result, escapeJsonString(this._options.homeDir), HOMEDIR_PLACEHOLDER);
      result = replaceAll(result, this._options.homeDir, HOMEDIR_PLACEHOLDER);
    }
    if (this._options.userName) {
      result = scrubUserName(result, this._options.userName);
    }
    result = result.replace(TEMP_DIR_SUFFIX_RE, `$1${TEMP_DIR_SUFFIX_PLACEHOLDER}`);
    result = replaceAll(result, `/private${WORKDIR_PLACEHOLDER}`, WORKDIR_PLACEHOLDER);
    result = result.replace(FILE_LISTING_DATE_RE, "${timestamp}");
    return result;
  }
  _expandReplayMessage(message) {
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type === "text") {
          return { ...block, text: this._expandReplayPlaceholders(block.text) };
        }
        if (block.type === "tool_use") {
          return { ...block, name: expandShellToolName(block.name), input: this._expandReplayValue(block.input) };
        }
        return block;
      })
    };
  }
  _expandReplayValue(value) {
    if (typeof value === "string") {
      return this._expandReplayPlaceholders(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this._expandReplayValue(item));
    }
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        result[key] = this._expandReplayValue(item);
      }
      return result;
    }
    return value;
  }
  _expandReplayPlaceholders(text) {
    let result = replaceAll(text, CAPI_PLACEHOLDER, this.url);
    if (this._workingDirectory) {
      const workspaceName = basename(this._workingDirectory);
      const suffix = /-(?<suffix>[A-Za-z0-9]{6})$/.exec(workspaceName)?.groups?.suffix;
      let canonicalWorkingDirectory = this._workingDirectory;
      try {
        canonicalWorkingDirectory = realpathSync.native(this._workingDirectory);
      } catch {
      }
      if (suffix) {
        const workspaceStem = workspaceName.slice(0, -suffix.length);
        const normalizedWorkspaceName = `${workspaceStem}${TEMP_DIR_SUFFIX_PLACEHOLDER}`;
        const legacyWorkspacePlaceholder = `${WORKDIR_PLACEHOLDER}/${normalizedWorkspaceName}`;
        result = replaceAll(result, `/private${legacyWorkspacePlaceholder}`, canonicalWorkingDirectory);
        result = replaceAll(result, legacyWorkspacePlaceholder, this._workingDirectory);
        result = result.replace(
          new RegExp(`(?:\\/private)?${escapeRegExpCharacters(WORKDIR_PLACEHOLDER)}\\/${escapeRegExpCharacters(workspaceStem)}[A-Za-z0-9]{6}`, "g"),
          (match) => match.startsWith("/private") ? canonicalWorkingDirectory : this._workingDirectory
        );
      }
      result = replaceAll(result, `/private${WORKDIR_PLACEHOLDER}`, canonicalWorkingDirectory);
      result = replaceAll(result, WORKDIR_PLACEHOLDER, this._workingDirectory);
      if (suffix) {
        result = replaceAll(result, TEMP_DIR_SUFFIX_PLACEHOLDER, suffix);
      }
    }
    if (this._options.homeDir) {
      result = replaceAll(result, HOMEDIR_PLACEHOLDER, this._options.homeDir);
    }
    if (this._options.userName) {
      result = replaceAll(result, USER_PLACEHOLDER, this._options.userName);
    }
    return result;
  }
}
function replaceAll(text, search, replacement) {
  if (!search) {
    return text;
  }
  return text.split(search).join(replacement);
}
function escapeJsonString(value) {
  return JSON.stringify(value).slice(1, -1);
}
function escapeRegExpCharacters(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeBody(buffer, encoding) {
  try {
    switch (encoding?.trim().toLowerCase()) {
      case "gzip":
        return zlibModule.gunzipSync(buffer).toString("utf8");
      case "br":
        return zlibModule.brotliDecompressSync(buffer).toString("utf8");
      case "deflate":
        return zlibModule.inflateSync(buffer).toString("utf8");
      default:
        return buffer.toString("utf8");
    }
  } catch {
    return buffer.toString("utf8");
  }
}
function flattenHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === void 0) {
      continue;
    }
    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}
export {
  CapiReplayProxy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL2hhcm5lc3MvY2FwaVJlcGxheVByb3h5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBBIHJlY29yZC9yZXBsYXkgSFRUUCBwcm94eSBmb3IgdGhlIENBUEkgKENvcGlsb3QgQVBJKSB0cmFmZmljIHRoYXQgdGhlIGFnZW50XG4gKiBob3N0J3MgYnVuZGxlZCBDb3BpbG90IFNESy9DTEkgcHJvZHVjZXMuXG4gKlxuICogSXQgc2l0cyBpbiBmcm9udCBvZiBhbiB1cHN0cmVhbSBDQVBJLXNwZWFraW5nIHNlcnZlciAoZWl0aGVyIHRoZSBpbi1yZXBvIG1vY2tcbiAqIExMTSBzZXJ2ZXIgb3IsIHdoZW4gcmVjb3JkaW5nIHdpdGggYSByZWFsIHRva2VuLCByZWFsIENBUEkpIGFuZDpcbiAqXG4gKiAgLSAqKnJlcGxheSoqIG1vZGUgKGRlZmF1bHQpOiBzZXJ2ZXMgcmVjb3JkZWQgcmVzcG9uc2VzIGZyb20gdGhlIGNvbW1pdHRlZFxuICogICAgZml4dHVyZSB3aXRoIG5vIHVwc3RyZWFtIGNvbnRhY3QgYXQgYWxsIFx1MjAxNCBkZXRlcm1pbmlzdGljIGFuZCB0b2tlbi1mcmVlLlxuICogICAgVGhlIGZpeHR1cmUgbXVzdCBleGlzdCAoYSBtaXNzaW5nIG9uZSB0aHJvd3MpIGFuZCBhIHJlcXVlc3Qgd2l0aCBub1xuICogICAgcmVjb3JkZWQgcmVzcG9uc2UgaXMgYSBzdHJpY3QgY2FjaGUgbWlzcyB0aGF0IGZhaWxzIHRoZSBydW4sIHNvIENJIGNhblxuICogICAgbmV2ZXIgc2lsZW50bHkgcmVhY2ggcmVhbCBDQVBJLlxuICogIC0gKipyZWNvcmQqKiBtb2RlOiBmb3J3YXJkcyBldmVyeSByZXF1ZXN0IHRvIHRoZSB1cHN0cmVhbSwgc3RyZWFtcyB0aGVcbiAqICAgIHJlc3BvbnNlIGJhY2sgdG8gdGhlIGNhbGxlciwgYW5kIGNhcHR1cmVzIGl0IHRvIHRoZSBmaXh0dXJlIG9uIGRpc2suXG4gKiAgICBPcHQtaW4gKGBBR0VOVF9IT1NUX1JFUExBWV9SRUNPUkQ9MWAsIGluY2x1ZGluZyB0aGUgZmlyc3QgcGFzcyBvZlxuICogICAgYEFHRU5UX0hPU1RfVVBEQVRFX1NOQVBTSE9UUz0xYCkgc2luY2UgaXQgbmVlZHMgYSByZWFsIHRva2VuLlxuICpcbiAqIFRoZSBwcm94eSBpcyBpbnRlbnRpb25hbGx5ICoqd2lyZS1hZ25vc3RpYyoqOiBpdCBjYXB0dXJlcyBhbmQgcmVwbGF5cyB0aGUgcmF3XG4gKiByZXNwb25zZSBib2R5LCBzbyBpdCB3b3JrcyBpZGVudGljYWxseSBmb3IgdGhlIENoYXQgQ29tcGxldGlvbnNcbiAqIChgL2NoYXQvY29tcGxldGlvbnNgKSwgUmVzcG9uc2VzIChgL3Jlc3BvbnNlc2ApIGFuZCBBbnRocm9waWMgTWVzc2FnZXNcbiAqIChgL3YxL21lc3NhZ2VzYCkgU1NFIGRpYWxlY3RzIHdpdGhvdXQgbmVlZGluZyBwZXItZGlhbGVjdCBhZGFwdGVycy5cbiAqXG4gKiBNYXRjaGluZyBpcyAqKnNlcXVlbmNlLWJhc2VkIHBlciBgKG1ldGhvZCwgcGF0aClgKio6IHRoZSBOdGggcmVxdWVzdCB0byBhXG4gKiBnaXZlbiBlbmRwb2ludCByZXBsYXlzIHRoZSBOdGggcmVjb3JkZWQgcmVzcG9uc2UuIEluIHJlcGxheSB0aGUgYWdlbnQnc1xuICogYmVoYXZpb3IgaXMgZHJpdmVuIGVudGlyZWx5IGJ5IHRoZSByZWNvcmRlZCByZXNwb25zZXMsIHNvIHRoZSBzZXF1ZW5jZSBvZlxuICogY2FsbHMgaXQgbWFrZXMgaXMgcmVwcm9kdWNlZCBleGFjdGx5IFx1MjAxNCBtYWtpbmcgZXhhY3QtYm9keSBtYXRjaGluZyAod2hpY2ggaXNcbiAqIGJyaXR0bGUgYWdhaW5zdCB2b2xhdGlsZSBmaWVsZHMgbGlrZSBkYXRlcyBvciByZXF1ZXN0IGlkcykgdW5uZWNlc3NhcnkuIFRoZVxuICogbm9ybWFsaXplZCByZXF1ZXN0IGJvZHkgaXMgc3RpbGwgc3RvcmVkIGluIHRoZSBmaXh0dXJlIGZvciByZXZpZXdhYmlsaXR5LlxuICovXG5cbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB0eXBlICogYXMgaHR0cHMgZnJvbSAnaHR0cHMnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ21vZHVsZSc7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxlU3luYywgcmVhbHBhdGhTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGFnZ3JlZ2F0ZUFudGhyb3BpY1NzZSwgYW50aHJvcGljTWVzc2FnZVRvU3NlLCBBTlRIUk9QSUNfTUVTU0FHRVNfUEFUSCwgYWdncmVnYXRlUmVzcG9uc2VzU3NlLCByZXNwb25zZXNNZXNzYWdlVG9Tc2UsIFJFU1BPTlNFU19QQVRILCBzdW1tYXJpemVSZXNwb25zZXNSZXF1ZXN0LCBkZXNlcmlhbGl6ZUFudGhyb3BpY0NvbnRlbnQsIHNlcmlhbGl6ZUFudGhyb3BpY0NvbnRlbnQsIHN1bW1hcml6ZUFudGhyb3BpY1JlcXVlc3QsIHR5cGUgQW50aHJvcGljQ29udGVudEJsb2NrLCB0eXBlIElBbnRocm9waWNNZXNzYWdlLCB0eXBlIElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3QgfSBmcm9tICcuL2NhcGlXaXJlQ29kZWMuanMnO1xuaW1wb3J0IHsgZ2V0QW5jaWxsYXJ5U3R1YiB9IGZyb20gJy4vY2FwaVN0dWJzLmpzJztcbmltcG9ydCB7IGZpbmRQb3NpeE9ubHlDb21tYW5kcywgZm9ybWF0UG9zaXhDb21tYW5kRXJyb3IsIHR5cGUgSVJlY29yZGVkQ29tbWFuZCB9IGZyb20gJy4vcG9zaXhDb21tYW5kTGludC5qcyc7XG5pbXBvcnQgeyBmb3JtYXRNb2RlbFJlcXVlc3RNaXNtYXRjaCwgbW9kZWxSZXF1ZXN0c01hdGNoLCBwcm9qZWN0TW9kZWxSZXF1ZXN0IH0gZnJvbSAnLi9tb2RlbFJlcXVlc3RQcm9qZWN0aW9uLmpzJztcbmltcG9ydCB7IGV4cGFuZFNoZWxsVG9vbE5hbWUsIG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWVGb3JDYXB0dXJlIH0gZnJvbSAnLi9zaGVsbFRvb2xOYW1lcy5qcyc7XG5pbXBvcnQgeyBzY3J1YlVzZXJOYW1lLCBVU0VSX05BTUVfUExBQ0VIT0xERVIgfSBmcm9tICcuL3VzZXJOYW1lU2NydWIuanMnO1xuXG4vLyBgaHR0cGAvYGh0dHBzYC9ganMteWFtbGAgYXJlIGxhemlseSByZXF1aXJlZCAoc2xvdyB0byBsb2FkIGFuZC9vciBub3QgaW4gdGhpc1xuLy8gbGF5ZXIncyBpbXBvcnQgYWxsb3dsaXN0KTsgYGltcG9ydCB0eXBlYCBhYm92ZSBzdGlsbCBnaXZlcyB1cyBodHRwL2h0dHBzIHR5cGVzLlxuY29uc3Qgbm9kZVJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7XG5jb25zdCBodHRwTW9kdWxlID0gbm9kZVJlcXVpcmUoJ2h0dHAnKSBhcyB0eXBlb2YgaHR0cDtcbmNvbnN0IGh0dHBzTW9kdWxlID0gbm9kZVJlcXVpcmUoJ2h0dHBzJykgYXMgdHlwZW9mIGh0dHBzO1xuY29uc3QgemxpYk1vZHVsZSA9IG5vZGVSZXF1aXJlKCd6bGliJykgYXMgdHlwZW9mIGltcG9ydCgnemxpYicpO1xuY29uc3QgeWFtbE1vZHVsZSA9IG5vZGVSZXF1aXJlKCdqcy15YW1sJykgYXMgeyBsb2FkKGlucHV0OiBzdHJpbmcpOiB1bmtub3duOyBkdW1wKG9iajogdW5rbm93biwgb3B0cz86IHsgbGluZVdpZHRoPzogbnVtYmVyOyBub1JlZnM/OiBib29sZWFuOyBxdW90aW5nVHlwZT86ICdcIicgfCAnXFwnJzsgZm9yY2VRdW90ZXM/OiBib29sZWFuIH0pOiBzdHJpbmcgfTtcblxuLyoqIE1vZGVsLXByb2R1Y2luZyBlbmRwb2ludHMuIFJlcGxheWluZyBwYXN0IHRoZSByZWNvcmRlZCBjb3VudCBoZXJlIGlzIGEgaGFyZFxuICogY2FjaGUgbWlzcyAocmV1c2luZyBhIHN0YWxlIHR1cm4gY291bGQgc3BpbiB0aGUgYWdlbnQgbG9vcCBmb3JldmVyKSwgd2hlcmVhc1xuICogaWRlbXBvdGVudCBlbmRwb2ludHMgKGAvbW9kZWxzYCwgdG9rZW4pIG1heSBiZSBzYWZlbHkgcmUtc2VydmVkLiAqL1xuY29uc3QgTU9ERUxfRU5EUE9JTlRTID0gbmV3IFNldChbJy9jaGF0L2NvbXBsZXRpb25zJywgJy9yZXNwb25zZXMnLCAnL3YxL21lc3NhZ2VzJ10pO1xuXG5jb25zdCBXT1JLRElSX1BMQUNFSE9MREVSID0gJyR7d29ya2Rpcn0nO1xuY29uc3QgSE9NRURJUl9QTEFDRUhPTERFUiA9ICcke2hvbWVkaXJ9JztcbmNvbnN0IFRFTVBfRElSX1NVRkZJWF9QTEFDRUhPTERFUiA9ICcke3RlbXB9JztcbmNvbnN0IFRFTVBfRElSX1NVRkZJWF9SRSA9IC8oXFwkXFx7d29ya2RpclxcfSg/OlxcL3xcXFxcXFxcXCkoPzphaHAtKD86c25hcHNob3R8cGVybS10ZXN0fHBsYW4tdGVzdHxhYm9ydHx0ZXN0fHd0LXRlc3R8c3ViYWdlbnQtdGVzdHxzdWJhZ2VudC1yZXBsYXl8YXR0YWNobWVudC10ZXN0fGNkLXN0cmlwLXRlc3R8Y292ZXJhZ2UtW2Etei1dKyktfGNvcGlsb3QtKD86Y29zdC1yZXBvcnR8dGV4dC1ibG9iKS18cmVhZC1zZGstc2ltcGxlKSlbQS1aYS16MC05XXs2fS9nO1xuY29uc3QgRklMRV9MSVNUSU5HX0RBVEVfUkUgPSAvXFxiKD86SmFufEZlYnxNYXJ8QXByfE1heXxKdW58SnVsfEF1Z3xTZXB8T2N0fE5vdnxEZWMpXFxzK1xcZHsxLDJ9XFxzKyg/OlxcZHsyfTpcXGR7Mn18XFxkezR9KVxcYi9nO1xuXG4vKipcbiAqIFBsYWNlaG9sZGVyIGZvciB0aGUgcmVjb3JkZXIncyBPUyB1c2VybmFtZS4gSXQgYXBwZWFycyBpbiBjYXB0dXJlZCB0b29sIG91dHB1dFxuICogKGUuZy4gdGhlIG93bmVyIGNvbHVtbiBvZiBgbHMgLWxhYCkgd2hlcmUgaXQgaXMgbm90IHBhcnQgb2YgYSBwYXRoLCBzb1xuICogYGhvbWVEaXJgIG5vcm1hbGl6YXRpb24gbWlzc2VzIGl0IFx1MjAxNCBzY3J1YiBpdCBleHBsaWNpdGx5IHRvIGtlZXAgbG9jYWwgaWRlbnRpdHlcbiAqIG91dCBvZiBmaXh0dXJlcy5cbiAqL1xuY29uc3QgVVNFUl9QTEFDRUhPTERFUiA9IFVTRVJfTkFNRV9QTEFDRUhPTERFUjtcbi8qKlxuICogUGxhY2Vob2xkZXIgZm9yIHRoZSB1cHN0cmVhbSBDQVBJIG9yaWdpbiBpbiByZWNvcmRlZCByZXNwb25zZSBib2RpZXMuIFRva2VuIC9cbiAqIHVzZXItZGlzY292ZXJ5IHJlc3BvbnNlcyBlY2hvIHRoZSBDQVBJIGhvc3QgKGBlbmRwb2ludHMuYXBpYCk7IHJld3JpdGluZyB0aGF0XG4gKiBvcmlnaW4gdG8gdGhpcyBwbGFjZWhvbGRlciBcdTIwMTQgYW5kIGJhY2sgdG8gdGhlIHByb3h5J3Mgb3duIFVSTCBvbiByZXBsYXkgXHUyMDE0XG4gKiBrZWVwcyB0aGUgU0RLL2FnZW50IGhvc3QgcG9pbnRlZCBhdCB0aGUgcHJveHkgcmF0aGVyIHRoYW4gYXQgYSByZWFsIChvciBtb2NrKVxuICogaG9zdCBvbiByZXBsYXkuXG4gKi9cbmNvbnN0IENBUElfUExBQ0VIT0xERVIgPSAnJHtjYXBpfSc7XG4vKipcbiAqIFJlZGFjdHMgc2hvcnQtbGl2ZWQgY3JlZGVudGlhbHMgZnJvbSByZWNvcmRlZCByZXNwb25zZSBib2RpZXMgc28gZml4dHVyZXNcbiAqIGNhcnJ5IG5vIHNlY3JldHMuIFRoZSBHaXRIdWIgYmVhcmVyIHRva2VuIGxpdmVzIG9ubHkgaW4gcmVxdWVzdCBoZWFkZXJzXG4gKiAobmV2ZXIgc3RvcmVkKTsgdGhlIG9uZSByZXNwb25zZS1zaWRlIHNlY3JldCBpcyB0aGUgbWludGVkIENvcGlsb3Qgc2Vzc2lvblxuICogdG9rZW4gcmV0dXJuZWQgYnkgYC9jb3BpbG90X2ludGVybmFsL3YyL3Rva2VuYCAoYW5kIGBzZXNzaW9uX3Rva2VuYCBmcm9tIHRoZVxuICogYXV0by1tb2RlbCBlbmRwb2ludCkuXG4gKi9cbmNvbnN0IFNFQ1JFVF9QTEFDRUhPTERFUiA9ICcke3JlZGFjdGVkfSc7XG5jb25zdCBTRUNSRVRfRklFTERfUkUgPSAvKFwiKD86dG9rZW58c2Vzc2lvbl90b2tlbilcIlxccyo6XFxzKilcIlteXCJdKlwiL2c7XG5cbi8qKlxuICogU2NydWIgdGhlIGVjaG9lZCBzeXN0ZW0gcHJvbXB0IG91dCBvZiByZWNvcmRlZCByZXNwb25zZSBib2RpZXMuIFRoZSBPcGVuQUlcbiAqIFJlc3BvbnNlcyBBUEkgKGAvcmVzcG9uc2VzYCwgdXNlZCBieSBDb2RleCkgZWNob2VzIHRoZSBmdWxsIHJlcXVlc3RcbiAqIGBpbnN0cnVjdGlvbnNgICh0aGUgc3lzdGVtIHByb21wdCkgYmFjayBpbnNpZGUgYHJlc3BvbnNlLmNyZWF0ZWRgIC9cbiAqIGBpbl9wcm9ncmVzc2AgLyBgY29tcGxldGVkYCBldmVudHM7IHJlcGxhY2UgaXQgd2l0aCBhIHBsYWNlaG9sZGVyIHNvIHRoZVxuICogbGFyZ2UgcHJvbXB0IChhbmQgYW55IHRlbmFudC1zcGVjaWZpYyBjb250ZW50IGluIGl0KSBuZXZlciBsYW5kcyBpbiBmaXh0dXJlcy5cbiAqL1xuY29uc3QgU1lTVEVNX0ZJRUxEX1JFID0gLyhcImluc3RydWN0aW9uc1wiXFxzKjpcXHMqKVwiKD86W15cIlxcXFxdfFxcXFwuKSpcIi9nO1xuY29uc3QgU1lTVEVNX1BST01QVF9QTEFDRUhPTERFUiA9ICcke3N5c3RlbX0nO1xuXG4vKiogR2l0SHViLUFQSSBwYXRoIHByZWZpeGVzIChyb3V0ZWQgdG8gdGhlIEdpdEh1YiB1cHN0cmVhbSwgbm90IENBUEkpLiAqL1xuY29uc3QgR0lUSFVCX0FQSV9QUkVGSVhFUyA9IFsnL2NvcGlsb3RfaW50ZXJuYWwnLCAnL3RlbGVtZXRyeScsICcvY29waWxvdC9tY3BfcmVnaXN0cnknXTtcblxuZXhwb3J0IHR5cGUgQ2FwaVJlcGxheU1vZGUgPSAncmVjb3JkJyB8ICdyZXBsYXknO1xuXG5pbnRlcmZhY2UgSVJlY29yZGVkUmVzcG9uc2Uge1xuXHRyZWFkb25seSBzdGF0dXM6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj47XG5cdHJlYWRvbmx5IGJvZHk6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElSZWNvcmRlZEV4Y2hhbmdlIHtcblx0cmVhZG9ubHkgbWV0aG9kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhdGg6IHN0cmluZztcblx0LyoqIE5vcm1hbGl6ZWQgcmVxdWVzdCBib2R5LCBzdG9yZWQgZm9yIGh1bWFuIHJldmlldyBvZiBmaXh0dXJlIGRpZmZzLiAqL1xuXHRyZWFkb25seSByZXF1ZXN0Qm9keTogc3RyaW5nO1xuXHRyZWFkb25seSByZXNwb25zZTogSVJlY29yZGVkUmVzcG9uc2U7XG59XG5cbi8qKiBXaXJlIGRpYWxlY3QgdGhlIGZpeHR1cmUncyBtb2RlbCB0dXJucyB3ZXJlIGNhcHR1cmVkIGluLiBEcml2ZXMgU1NFXG4gKiByZWdlbmVyYXRpb24gb24gcmVwbGF5IGFuZCB0aGUgYChtZXRob2QsIHBhdGgpYCB0aGUgdHVybnMgcmVwbGF5IHVuZGVyLiAqL1xudHlwZSBUdXJuRGlhbGVjdCA9ICdhbnRocm9waWMnIHwgJ3Jlc3BvbnNlcyc7XG5cbi8qKiBUaGUgYChtZXRob2QsIHBhdGgpYCBlYWNoIGRpYWxlY3QncyB0dXJucyBhcmUgcmVjb3JkZWQvcmVwbGF5ZWQgdW5kZXIuXG4gKiBgbWV0aG9kYCBpcyBhbHdheXMgUE9TVCBhbmQgYHBhdGhgIGlzIGZpeGVkIHBlciBkaWFsZWN0LCBzbyBuZWl0aGVyIGlzIHN0b3JlZFxuICogcGVyIGV4Y2hhbmdlIFx1MjAxNCB0aGUgZml4dHVyZSBjYXJyaWVzIGEgc2luZ2xlIHRvcC1sZXZlbCBgZGlhbGVjdGAgaW5zdGVhZC4gKi9cbmNvbnN0IERJQUxFQ1RfRU5EUE9JTlQ6IFJlYWRvbmx5PFJlY29yZDxUdXJuRGlhbGVjdCwgeyByZWFkb25seSBtZXRob2Q6IHN0cmluZzsgcmVhZG9ubHkgcGF0aDogc3RyaW5nIH0+PiA9IHtcblx0YW50aHJvcGljOiB7IG1ldGhvZDogJ1BPU1QnLCBwYXRoOiBBTlRIUk9QSUNfTUVTU0FHRVNfUEFUSCB9LFxuXHRyZXNwb25zZXM6IHsgbWV0aG9kOiAnUE9TVCcsIHBhdGg6IFJFU1BPTlNFU19QQVRIIH0sXG59O1xuXG4vKipcbiAqIFRoZSBzdG9yZWQgZm9ybSBvZiBhbiBhc3Npc3RhbnQgcmVwbHkuIENvbnRlbnQgaXMgYSBiYXJlIHN0cmluZyBmb3IgYSBsb25lXG4gKiB0ZXh0IHJlcGx5LCBvciBhbiBleHBsaWNpdCBibG9jayBsaXN0IGZvciByaWNoZXIgKHRvb2wtY2FsbGluZykgcmVwbGllcy5cbiAqL1xuaW50ZXJmYWNlIElTdG9yZWRBbnRocm9waWNNZXNzYWdlIHtcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nIHwgQW50aHJvcGljQ29udGVudEJsb2NrW107XG5cdHJlYWRvbmx5IHN0b3BSZWFzb246IHN0cmluZyB8IG51bGw7XG59XG5cbi8qKlxuICogQSBtb2RlbCB0dXJuIGluIHRoZSBZQU1MIGZpeHR1cmU6IGEgcmVhZGFibGUgcmVxdWVzdCBzdW1tYXJ5ICsgdGhlIGNhcHR1cmVkXG4gKiBhc3Npc3RhbnQgcmVwbHkuIE9uIHJlcGxheSB0aGUgcmVwbHkgaXMgcmVnZW5lcmF0ZWQgaW50byB0aGUgZml4dHVyZVxuICogZGlhbGVjdCdzIFNTRSBzdHJlYW0sIHNvIGNhcHR1cmVzIHN0YXkgaHVtYW4tcmVhZGFibGUgaW5zdGVhZCBvZiByYXcgU1NFXG4gKiBibG9icy4gVGhlIGVuZHBvaW50IGlzIGRlcml2ZWQgZnJvbSB0aGUgZml4dHVyZS1sZXZlbCBgZGlhbGVjdGAsIHNvIGl0IGlzIG5vdFxuICogcmVwZWF0ZWQgaGVyZS5cbiAqL1xuaW50ZXJmYWNlIElUdXJuRXhjaGFuZ2Uge1xuXHRyZWFkb25seSByZXF1ZXN0OiBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0O1xuXHRyZWFkb25seSByZXNwb25zZTogSVN0b3JlZEFudGhyb3BpY01lc3NhZ2U7XG59XG5cbi8qKlxuICogQSByYXcgYW5jaWxsYXJ5IGV4Y2hhbmdlIHNlcnZlZCB2ZXJiYXRpbSBvbiByZXBsYXkuIENhcnJpZXMgaXRzIG93blxuICogYChtZXRob2QsIHBhdGgpYCBzaW5jZSBpdCBpcyBub3QgdGllZCB0byB0aGUgZml4dHVyZSBkaWFsZWN0LiBOb3QgcHJvZHVjZWQgYnlcbiAqIHRoZSBjdXJyZW50IHJlY29yZGVyIFx1MjAxNCBtb2RlbCB0dXJucyBjb3ZlciBldmVyeSBjYXB0dXJlZCBleGNoYW5nZSBcdTIwMTQgYnV0IHRoZVxuICogbG9hZGVyIHN0aWxsIGhvbm91cnMgaXQgaWYgYSBmaXh0dXJlIGNvbnRhaW5zIG9uZS5cbiAqL1xuaW50ZXJmYWNlIElSYXdGaXh0dXJlRXhjaGFuZ2Uge1xuXHRyZWFkb25seSBtZXRob2Q6IHN0cmluZztcblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNwb25zZTogSVJlY29yZGVkUmVzcG9uc2U7XG59XG5cbnR5cGUgSUZpeHR1cmVFeGNoYW5nZSA9IElUdXJuRXhjaGFuZ2UgfCBJUmF3Rml4dHVyZUV4Y2hhbmdlO1xuXG5pbnRlcmZhY2UgSUZpeHR1cmUge1xuXHRyZWFkb25seSB2ZXJzaW9uOiAxO1xuXHQvKiogRGlhbGVjdCBzaGFyZWQgYnkgZXZlcnkgdHVybiBleGNoYW5nZTsgb21pdHRlZCB3aGVuIHRoZXJlIGFyZSBubyB0dXJucy4gKi9cblx0cmVhZG9ubHkgZGlhbGVjdD86IFR1cm5EaWFsZWN0O1xuXHRyZWFkb25seSBleGNoYW5nZXM6IElGaXh0dXJlRXhjaGFuZ2VbXTtcbn1cblxuZnVuY3Rpb24gaXNUdXJuRXhjaGFuZ2UoZXhjaGFuZ2U6IElGaXh0dXJlRXhjaGFuZ2UpOiBleGNoYW5nZSBpcyBJVHVybkV4Y2hhbmdlIHtcblx0cmV0dXJuIChleGNoYW5nZSBhcyBJVHVybkV4Y2hhbmdlKS5yZXF1ZXN0ICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNhcGlSZXBsYXlQcm94eU9wdGlvbnMge1xuXHQvKiogQWJzb2x1dGUgcGF0aCB0byB0aGUgSlNPTiBmaXh0dXJlIGZvciB0aGlzIHRlc3QuICovXG5cdHJlYWRvbmx5IGZpeHR1cmVQYXRoOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBTaW5nbGUgdXBzdHJlYW0gYmFzZSBVUkwgdG8gZm9yd2FyZCBhbGwgdHJhZmZpYyB0byB3aGlsZSByZWNvcmRpbmcgKGUuZy5cblx0ICogYSBtb2NrIHNlcnZlcikuIFVzZSB7QGxpbmsgZ2l0aHViVXBzdHJlYW1Vcmx9L3tAbGluayBjYXBpVXBzdHJlYW1Vcmx9XG5cdCAqIGluc3RlYWQgdG8gc3BsaXQgR2l0SHViLUFQSSB2cyBDQVBJIHRyYWZmaWMgYWNyb3NzIHR3byByZWFsIGhvc3RzLlxuXHQgKi9cblx0cmVhZG9ubHkgdXBzdHJlYW1Vcmw/OiBzdHJpbmc7XG5cdC8qKiBSZWFsIEdpdEh1Yi1BUEkgYmFzZSBmb3IgYC9jb3BpbG90X2ludGVybmFsLypgIHdoaWxlIHJlY29yZGluZyAoZS5nLiBgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbWApLiAqL1xuXHRyZWFkb25seSBnaXRodWJVcHN0cmVhbVVybD86IHN0cmluZztcblx0LyoqIFJlYWwgQ0FQSSBiYXNlIGZvciBtb2RlbC9gL21vZGVsc2AgdHJhZmZpYyB3aGlsZSByZWNvcmRpbmcgKGUuZy4gYGh0dHBzOi8vYXBpLmdpdGh1YmNvcGlsb3QuY29tYCkuICovXG5cdHJlYWRvbmx5IGNhcGlVcHN0cmVhbVVybD86IHN0cmluZztcblx0LyoqIFJlY29yZGluZy9yZXBsYXkgYmVoYXZpb3IuIERlZmF1bHRzIHRvIGByZXBsYXlgLiAqL1xuXHRyZWFkb25seSBtb2RlPzogQ2FwaVJlcGxheU1vZGU7XG5cdC8qKiBBYnNvbHV0ZSB3b3JraW5nIGRpcmVjdG9yeSB0byBub3JtYWxpemUgb3V0IG9mIHJlcXVlc3QgYm9kaWVzLiAqL1xuXHRyZWFkb25seSB3b3JrRGlyPzogc3RyaW5nO1xuXHQvKiogQWJzb2x1dGUgaG9tZSBkaXJlY3RvcnkgdG8gbm9ybWFsaXplIG91dCBvZiByZXF1ZXN0IGJvZGllcy4gKi9cblx0cmVhZG9ubHkgaG9tZURpcj86IHN0cmluZztcblx0LyoqIE9TIHVzZXJuYW1lIHRvIG5vcm1hbGl6ZSBvdXQgb2YgcmVjb3JkZWQgYm9kaWVzIChlLmcuIGBscyAtbGFgIG93bmVyIGNvbHVtbnMpLiAqL1xuXHRyZWFkb25seSB1c2VyTmFtZT86IHN0cmluZztcblx0LyoqXG5cdCAqIEZhaWwgKHRocm93IGZyb20ge0BsaW5rIHN0b3B9KSBpZiBhbnkgcmVxdWVzdCBtaXNzZWQgdGhlIGNhY2hlIHdoaWxlXG5cdCAqIHJlcGxheWluZy4gRGVmYXVsdHMgdG8gdHJ1ZS4gSWdub3JlZCB3aGlsZSByZWNvcmRpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBzdHJpY3Q/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2tpcCB0aGUgUE9TSVgtb25seSBzaGVsbCBjb21tYW5kIGNoZWNrIHdoZW4gd3JpdGluZyBhIGZpeHR1cmUuXG5cdCAqXG5cdCAqIE9ubHkgZm9yIGEgc2NlbmFyaW8gdGhhdCBnZW51aW5lbHkgY2Fubm90IGJlIHBvcnRhYmxlIFx1MjAxNCB0aGUgdGVzdCBtdXN0IGFsc29cblx0ICogYmUgc2NvcGVkIHRvIGEgcGxhdGZvcm0gZXhwbGljaXRseSBhdCBpdHMgY2FsbCBzaXRlLCB3aXRoIHRoZSByZWFzb25cblx0ICogc3RhdGVkIHRoZXJlLiBTZWUgYHBvc2l4Q29tbWFuZExpbnQudHNgLlxuXHQgKi9cblx0cmVhZG9ubHkgYWxsb3dQb3NpeENvbW1hbmRzPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2tpcCBjb21wYXJpbmcgdGhlIGxpdmUgbW9kZWwgcmVxdWVzdCBhZ2FpbnN0IHRoZSByZWNvcmRlZCBvbmUuXG5cdCAqXG5cdCAqIE9ubHkgZm9yIGEgY2FwdHVyZSB0aGF0IGNhbm5vdCBiZSByZWZyZXNoZWQ7IHNlZVxuXHQgKiBgU1RBTEVfUkVDT1JERURfUkVRVUVTVF9FWENFUFRJT05TYCBpbiBgYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MudHNgLlxuXHQgKi9cblx0cmVhZG9ubHkgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdD86IGJvb2xlYW47XG59XG5cbi8qKiBBIHJlcGxheWFibGUgaXRlbTogcmF3IGJ5dGVzIChhbmNpbGxhcnkpIG9yIGEgbW9kZWwgcmVwbHkgdG8gcmVnZW5lcmF0ZS4gKi9cbnR5cGUgSVJlcGxheUl0ZW0gPVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3Jhdyc7IHJlYWRvbmx5IHJlc3BvbnNlOiBJUmVjb3JkZWRSZXNwb25zZSB9XG5cdHwgeyByZWFkb25seSBraW5kOiAndHVybic7IHJlYWRvbmx5IGRpYWxlY3Q6IFR1cm5EaWFsZWN0OyByZWFkb25seSBtZXNzYWdlOiBJQW50aHJvcGljTWVzc2FnZTsgcmVhZG9ubHkgcmVxdWVzdDogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB9O1xuXG4vKiogU2VxdWVuY2UgY3Vyc29yIGZvciBvbmUgYChtZXRob2QsIHBhdGgpYCBidWNrZXQgZHVyaW5nIHJlcGxheS4gKi9cbmludGVyZmFjZSBJUmVwbGF5QnVja2V0IHtcblx0cmVhZG9ubHkgaXRlbXM6IElSZXBsYXlJdGVtW107XG5cdGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDYXBpUmVwbGF5UHJveHkge1xuXHRwcml2YXRlIF9zZXJ2ZXI6IGh0dHAuU2VydmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91cmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RvcHBlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGU6IENhcGlSZXBsYXlNb2RlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJpY3Q6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUmVwbGF5aW5nOiBib29sZWFuO1xuXG5cdC8qKiBCdWNrZXRzIHVzZWQgZm9yIHJlcGxheSwga2V5ZWQgYnkgYCR7bWV0aG9kfSAke3BhdGh9YC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwbGF5QnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVwbGF5QnVja2V0PigpO1xuXHQvKiogRXhjaGFuZ2VzIGNhcHR1cmVkIGR1cmluZyByZWNvcmRpbmcsIGluIGFycml2YWwgb3JkZXIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29yZGVkOiBJUmVjb3JkZWRFeGNoYW5nZVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX29ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZU1pc3Nlczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdE1pc21hdGNoZXM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX21vZGVsVHVybkNvdW50ID0gMDtcblx0cHJpdmF0ZSBfd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXh0dXJlIGN1cnJlbnRseSBiZWluZyByZXBsYXllZC4gTXV0YWJsZSBzbyBhIHNpbmdsZSBsb25nLWxpdmVkIHByb3h5IGNhblxuXHQgKiBiZSByZS1wb2ludGVkIGF0IGEgbmV3IHBlci10ZXN0IGZpeHR1cmUgdmlhIHtAbGluayByZXNldEZvclJlcGxheX0gd2l0aG91dFxuXHQgKiByZXN0YXJ0aW5nICh0aGUgVVJMIHRoZSBhZ2VudCBob3N0IHdhcyBwb2ludGVkIGF0IHN0YXlzIGZpeGVkKS4gUmVjb3JkaW5nXG5cdCAqIGFsd2F5cyB1c2VzIHRoZSBmaXh0dXJlIHRoZSBwcm94eSB3YXMgY29uc3RydWN0ZWQgd2l0aC5cblx0ICovXG5cdHByaXZhdGUgX2ZpeHR1cmVQYXRoOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGN1cnJlbnQgZml4dHVyZSdzIHJlY29yZGVkIHJlcXVlc3QgbWF5IGRpc2FncmVlIHdpdGggdGhlIGxpdmVcblx0ICogb25lLiBQZXItdGVzdCBsaWtlIHtAbGluayBfZml4dHVyZVBhdGh9LCBzaW5jZSBhIHNoYXJlZCByZXBsYXkgcHJveHlcblx0ICogc2VydmVzIGV2ZXJ5IHRlc3QgaW4gdGhlIHN1aXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQ2FwaVJlcGxheVByb3h5T3B0aW9ucykge1xuXHRcdHRoaXMuX2FsbG93U3RhbGVSZWNvcmRlZFJlcXVlc3QgPSBfb3B0aW9ucy5hbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0ID8/IGZhbHNlO1xuXHRcdHRoaXMuX2ZpeHR1cmVQYXRoID0gX29wdGlvbnMuZml4dHVyZVBhdGg7XG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yeSA9IF9vcHRpb25zLndvcmtEaXI7XG5cdFx0Y29uc3QgZml4dHVyZUV4aXN0cyA9IGV4aXN0c1N5bmModGhpcy5fZml4dHVyZVBhdGgpO1xuXHRcdHRoaXMuX21vZGUgPSBfb3B0aW9ucy5tb2RlID8/ICdyZXBsYXknO1xuXHRcdHRoaXMuX3N0cmljdCA9IF9vcHRpb25zLnN0cmljdCA/PyB0cnVlO1xuXG5cdFx0aWYgKHRoaXMuX21vZGUgPT09ICdyZXBsYXknICYmICFmaXh0dXJlRXhpc3RzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtjYXBpLXJlcGxheV0gcmVwbGF5IG1vZGUgcmVxdWlyZXMgYSBmaXh0dXJlIGJ1dCBub25lIGV4aXN0cyBhdCAke3RoaXMuX2ZpeHR1cmVQYXRofWApO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxheSBpcyByZWFkLW9ubHkgKG5ldmVyIGNvbnRhY3RzIHRoZSB1cHN0cmVhbSk7IHJlY29yZGluZyBpcyB0aGVcblx0XHQvLyBvbmx5IG1vZGUgdGhhdCBwcm94aWVzIHJlYWwgdHJhZmZpYy4gVGhpcyBrZWVwcyBDSSBmcm9tIGV2ZXIgcmVhY2hpbmdcblx0XHQvLyByZWFsIENBUEk6IGEgbWlzc2luZyBmaXh0dXJlIHRocm93cyBhYm92ZSByYXRoZXIgdGhhbiBzaWxlbnRseSByZWNvcmRpbmcuXG5cdFx0dGhpcy5faXNSZXBsYXlpbmcgPSB0aGlzLl9tb2RlID09PSAncmVwbGF5Jztcblx0XHRpZiAodGhpcy5faXNSZXBsYXlpbmcpIHtcblx0XHRcdHRoaXMuX2xvYWRGaXh0dXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEJhc2UgVVJMIHRoZSBhZ2VudCBob3N0IHNob3VsZCBiZSBwb2ludGVkIGF0LiBBdmFpbGFibGUgYWZ0ZXIge0BsaW5rIHN0YXJ0fS4gKi9cblx0Z2V0IHVybCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fdXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tjYXBpLXJlcGxheV0gcHJveHkgbm90IHN0YXJ0ZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3VybDtcblx0fVxuXG5cdGdldCBpc1JlcGxheWluZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNSZXBsYXlpbmc7XG5cdH1cblxuXHRhc3luYyBzdGFydCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRoaXMuX3NlcnZlciA9IGh0dHBNb2R1bGUuY3JlYXRlU2VydmVyKChyZXEsIHJlcykgPT4gdGhpcy5faGFuZGxlKHJlcSwgcmVzKSk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMuX3NlcnZlciEub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdHRoaXMuX3NlcnZlciEubGlzdGVuKDAsICcxMjcuMC4wLjEnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFkZHIgPSB0aGlzLl9zZXJ2ZXIhLmFkZHJlc3MoKTtcblx0XHRcdFx0aWYgKGFkZHIgJiYgdHlwZW9mIGFkZHIgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0dGhpcy5fdXJsID0gYGh0dHA6Ly8xMjcuMC4wLjE6JHthZGRyLnBvcnR9YDtcblx0XHRcdFx0XHRyZXNvbHZlKHRoaXMuX3VybCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignW2NhcGktcmVwbGF5XSBmYWlsZWQgdG8gZGV0ZXJtaW5lIHByb3h5IGFkZHJlc3MnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3AgdGhlIHByb3h5LiBXaGVuIHJlY29yZGluZywgZmx1c2hlcyBjYXB0dXJlZCBleGNoYW5nZXMgdG8gdGhlIGZpeHR1cmUuXG5cdCAqIFdoZW4gcmVwbGF5aW5nIGluIHN0cmljdCBtb2RlLCB0aHJvd3MgaWYgYW55IHJlcXVlc3QgbWlzc2VkIHRoZSBjYWNoZS5cblx0ICovXG5cdGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3BwZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RvcHBlZCA9IHRydWU7XG5cdFx0YXdhaXQgdGhpcy5fY2xvc2VTb2NrZXQoKTtcblxuXHRcdGlmICh0aGlzLl9pc1JlcGxheWluZykge1xuXHRcdFx0dGhpcy5hc3NlcnROb1JlcGxheU1pc21hdGNoZXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgd3JpdGUgYSBmaXh0dXJlIHdoZW4gcmVjb3JkaW5nLCBldmVuIHdpdGggemVybyBtb2RlbCB0dXJuczpcblx0XHQvLyB0ZXN0cyB0aGF0IG9ubHkgdG91Y2ggc3R1YmJlZCBhbmNpbGxhcnkgZW5kcG9pbnRzIChlLmcuIGxpc3RNb2RlbHMpXG5cdFx0Ly8gbmVlZCBhIGNvbW1pdHRlZCBmaXh0dXJlIHNvIHJlcGxheSBzZXJ2ZXMgc3R1YnMgaW5zdGVhZCBvZiB0cnlpbmcgdG9cblx0XHQvLyBzZWxmLWhlYWwgYWdhaW5zdCByZWFsIENBUEkuXG5cdFx0dGhpcy5fd3JpdGVGaXh0dXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtcG9pbnQgYSBsb25nLWxpdmVkIHJlcGxheSBwcm94eSBhdCBhIGRpZmZlcmVudCBwZXItdGVzdCBmaXh0dXJlIHdpdGhvdXRcblx0ICogcmVzdGFydGluZyB0aGUgSFRUUCBzZXJ2ZXIgKHNvIHRoZSBVUkwgdGhlIGFnZW50IGhvc3Qgd2FzIHBvaW50ZWQgYXQgc3RheXNcblx0ICogdmFsaWQpLiBDbGVhcnMgdGhlIHByZXZpb3VzIGZpeHR1cmUncyByZXBsYXkgYnVja2V0cyBhbmQgY2FjaGUtbWlzcyBsb2cuXG5cdCAqIFJlcGxheS1vbmx5OiByZWNvcmRpbmcga2VlcHMgb25lIGZpeHR1cmUgcGVyIHByb3h5LlxuXHQgKi9cblx0cmVzZXRGb3JSZXBsYXkoZml4dHVyZVBhdGg6IHN0cmluZywgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1JlcGxheWluZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbY2FwaS1yZXBsYXldIHJlc2V0Rm9yUmVwbGF5IGlzIG9ubHkgdmFsaWQgaW4gcmVwbGF5IG1vZGUnKTtcblx0XHR9XG5cdFx0aWYgKCFleGlzdHNTeW5jKGZpeHR1cmVQYXRoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbY2FwaS1yZXBsYXldIHJlcGxheSBtb2RlIHJlcXVpcmVzIGEgZml4dHVyZSBidXQgbm9uZSBleGlzdHMgYXQgJHtmaXh0dXJlUGF0aH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fZml4dHVyZVBhdGggPSBmaXh0dXJlUGF0aDtcblx0XHR0aGlzLl9hbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0ID0gYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdDtcblx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlcGxheUJ1Y2tldHMuY2xlYXIoKTtcblx0XHR0aGlzLl9vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2NhY2hlTWlzc2VzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fcmVxdWVzdE1pc21hdGNoZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9tb2RlbFR1cm5Db3VudCA9IDA7XG5cdFx0dGhpcy5fbG9hZEZpeHR1cmUoKTtcblx0fVxuXG5cdHNldFdvcmtpbmdEaXJlY3Rvcnkod29ya2luZ0RpcmVjdG9yeTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yeSA9IHdvcmtpbmdEaXJlY3Rvcnk7XG5cdH1cblxuXHRnZXQgb2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIHN0cmljdCByZXBsYXkgZmFpbHVyZXMgXHUyMDE0IHVucmVjb3JkZWQgcmVxdWVzdHMgYW5kIHJlcXVlc3RzIHRoYXQgZG9cblx0ICogbm90IG1hdGNoIHRoZSByZWNvcmRlZCBvbmUgXHUyMDE0IHdpdGhvdXQgc3RvcHBpbmcgdGhlIHByb3h5LiBMZXRzIGEgc2hhcmVkXG5cdCAqIHJlcGxheSBzZXJ2ZXIgdmVyaWZ5IGVhY2ggdGVzdCdzIHRyYWZmaWMgaW4gYHRlYXJkb3duYCB3aGlsZSBrZWVwaW5nIHRoZVxuXHQgKiBzZXJ2ZXIgKGFuZCB0aGUgYWdlbnQgaG9zdCdzIGNhY2hlZCBTREsgY2xpZW50KSBhbGl2ZSBmb3IgdGhlIG5leHQgdGVzdC5cblx0ICovXG5cdGFzc2VydE5vUmVwbGF5TWlzbWF0Y2hlcygpOiB2b2lkIHtcblx0XHRjb25zdCBlcnJvciA9IHRoaXMuX2NyZWF0ZVJlcGxheUVycm9yKCk7XG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKiogUmV0dXJucyBhbmQgY29uc3VtZXMgdGhlIGN1cnJlbnQgcmVwbGF5IGZhaWx1cmUgc28gaXQgY2FuIGJlIHN1cmZhY2VkIGF0IHRoZSBvcmlnaW5hbCB0ZXN0IGZhaWx1cmUuICovXG5cdHRha2VSZXBsYXlFcnJvcigpOiBFcnJvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXJyb3IgPSB0aGlzLl9jcmVhdGVSZXBsYXlFcnJvcigpO1xuXHRcdHRoaXMuX2NhY2hlTWlzc2VzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fcmVxdWVzdE1pc21hdGNoZXMubGVuZ3RoID0gMDtcblx0XHRyZXR1cm4gZXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZXBsYXlFcnJvcigpOiBFcnJvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1JlcGxheWluZyB8fCAhdGhpcy5fc3RyaWN0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWN0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5fY2FjaGVNaXNzZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0c2VjdGlvbnMucHVzaChgW2NhcGktcmVwbGF5XSAke3RoaXMuX2NhY2hlTWlzc2VzLmxlbmd0aH0gY2FjaGUgbWlzcyhlcyk6XFxuJHt0aGlzLl9jYWNoZU1pc3Nlcy5qb2luKCdcXG4nKX1gKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlcXVlc3RNaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHNlY3Rpb25zLnB1c2goYFtjYXBpLXJlcGxheV0gJHt0aGlzLl9yZXF1ZXN0TWlzbWF0Y2hlcy5sZW5ndGh9IG1vZGVsIHJlcXVlc3QgbWlzbWF0Y2goZXMpOlxcbiR7dGhpcy5fcmVxdWVzdE1pc21hdGNoZXMuam9pbignXFxuJyl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVuY29uc3VtZWQgPSBBcnJheS5mcm9tKHRoaXMuX3JlcGxheUJ1Y2tldHMuZW50cmllcygpKVxuXHRcdFx0LmZsYXRNYXAoKFtrZXksIGJ1Y2tldF0pID0+IGJ1Y2tldC5pbmRleCA8IGJ1Y2tldC5pdGVtcy5sZW5ndGggPyBbYCR7a2V5fTogJHtidWNrZXQuaXRlbXMubGVuZ3RoIC0gYnVja2V0LmluZGV4fSByZXNwb25zZShzKWBdIDogW10pO1xuXHRcdGlmICh1bmNvbnN1bWVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHNlY3Rpb25zLnB1c2goYFtjYXBpLXJlcGxheV0gdW5jb25zdW1lZCByZWNvcmRlZCByZXNwb25zZXM6XFxuJHt1bmNvbnN1bWVkLmpvaW4oJ1xcbicpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VjdGlvbnMubGVuZ3RoID4gMCA/IG5ldyBFcnJvcihzZWN0aW9ucy5qb2luKCdcXG5cXG4nKSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvc2UgdGhlIEhUVFAgc2VydmVyIHNvY2tldCB3aXRob3V0IHJ1bm5pbmcgdGhlIHN0cmljdCByZXBsYXkgY2hlY2tzIG9yXG5cdCAqIHdyaXRpbmcgYSBmaXh0dXJlLiBVc2VkIHRvIHRlYXIgZG93biBhIHNoYXJlZCByZXBsYXkgcHJveHkgYWZ0ZXIgcGVyLXRlc3Rcblx0ICogdmVyaWZpY2F0aW9uIGhhcyBhbHJlYWR5IGhhcHBlbmVkIHZpYSB7QGxpbmsgYXNzZXJ0Tm9SZXBsYXlNaXNtYXRjaGVzfS5cblx0ICovXG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3BwZWQgPSB0cnVlO1xuXHRcdGF3YWl0IHRoaXMuX2Nsb3NlU29ja2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jbG9zZVNvY2tldCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXI7XG5cdFx0dGhpcy5fc2VydmVyID0gdW5kZWZpbmVkO1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdC8vIEZvcmNlLWRyb3AgYW55IGxpbmdlcmluZyBzb2NrZXRzIChlLmcuIGFuIGluLWZsaWdodCB1cHN0cmVhbVxuXHRcdFx0Ly8gcmVxdWVzdCBsZWZ0IG9wZW4gYnkgYW4gYWJvcnRlZCB0dXJuKSBzbyBgY2xvc2VgIHJlc29sdmVzIGluc3RlYWRcblx0XHRcdC8vIG9mIGhhbmdpbmcgdW50aWwgdGhlIGNvbm5lY3Rpb24gZHJhaW5zLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHNlcnZlci5jbG9zZSgoKSA9PiByZXNvbHZlKCkpO1xuXHRcdFx0XHRzZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucz8uKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSByZXF1ZXN0IGhhbmRsaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfaGFuZGxlKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRyZXEub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpO1xuXHRcdHJlcS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0aWYgKHRoaXMuX2lzUmVwbGF5aW5nKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxheShyZXEsIGJvZHksIHJlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZWNvcmQocmVxLCBib2R5LCByZXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJlcS5vbignZXJyb3InLCAoKSA9PiB0aGlzLl9mYWlsKHJlcywgJ3JlcXVlc3Qgc3RyZWFtIGVycm9yJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGF5KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIGJvZHk6IHN0cmluZywgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWV0aG9kID0gcmVxLm1ldGhvZCA/PyAnR0VUJztcblx0XHRjb25zdCBwYXRoID0gbmV3IFVSTChyZXEudXJsID8/ICcvJywgJ2h0dHA6Ly9sb2NhbGhvc3QnKS5wYXRobmFtZTtcblxuXHRcdC8vIEFuY2lsbGFyeSBib290c3RyYXAgZW5kcG9pbnRzIGFyZSBuZXZlciByZWNvcmRlZCBcdTIwMTQgc2VydmUgdGhlbSBmcm9tXG5cdFx0Ly8gaGFyZGNvZGVkIHN0dWJzIChrZWVwcyBpZGVudGl0eS9tb2RlbC1jYXRhbG9nIG91dCBvZiBmaXh0dXJlcykuXG5cdFx0Y29uc3Qgc3R1YiA9IGdldEFuY2lsbGFyeVN0dWIobWV0aG9kLCBwYXRoKTtcblx0XHRpZiAoc3R1Yikge1xuXHRcdFx0cmVzLndyaXRlSGVhZChzdHViLnN0YXR1cywgeyAuLi5zdHViLmhlYWRlcnMgfSk7XG5cdFx0XHRyZXMuZW5kKHJlcGxhY2VBbGwoc3R1Yi5ib2R5LCBDQVBJX1BMQUNFSE9MREVSLCB0aGlzLnVybCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IGAke21ldGhvZH0gJHtwYXRofWA7XG5cdFx0aWYgKE1PREVMX0VORFBPSU5UUy5oYXMocGF0aCkpIHtcblx0XHRcdHRoaXMuX29ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLnB1c2godGhpcy5fbm9ybWFsaXplKGJvZHkpKTtcblx0XHR9XG5cdFx0Y29uc3QgYnVja2V0ID0gdGhpcy5fcmVwbGF5QnVja2V0cy5nZXQoa2V5KTtcblxuXHRcdGxldCBpdGVtOiBJUmVwbGF5SXRlbSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYnVja2V0KSB7XG5cdFx0XHRpZiAoYnVja2V0LmluZGV4IDwgYnVja2V0Lml0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRpdGVtID0gYnVja2V0Lml0ZW1zW2J1Y2tldC5pbmRleCsrXTtcblx0XHRcdH0gZWxzZSBpZiAoIU1PREVMX0VORFBPSU5UUy5oYXMocGF0aCkpIHtcblx0XHRcdFx0Ly8gSWRlbXBvdGVudCBlbmRwb2ludCBjYWxsZWQgbW9yZSBvZnRlbiB0aGFuIHJlY29yZGVkIFx1MjAxNCByZS1zZXJ2ZVxuXHRcdFx0XHQvLyB0aGUgbGFzdCByZWNvcmRlZCBpdGVtIHJhdGhlciB0aGFuIGZhaWxpbmcuXG5cdFx0XHRcdGl0ZW0gPSBidWNrZXQuaXRlbXNbYnVja2V0Lml0ZW1zLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhpcy5fY2FjaGVNaXNzZXMucHVzaChgJHtrZXl9IChjYWxsICMkeyhidWNrZXQ/LmluZGV4ID8/IDApICsgMX0pIFx1MjAxNCBubyByZWNvcmRlZCByZXNwb25zZWApO1xuXHRcdFx0dGhpcy5fZmFpbChyZXMsIGBubyByZWNvcmRlZCByZXNwb25zZSBmb3IgJHtrZXl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ3R1cm4nKSB7XG5cdFx0XHR0aGlzLl9hc3NlcnRSZWNvcmRlZFJlcXVlc3QoaXRlbS5kaWFsZWN0LCBpdGVtLnJlcXVlc3QsIGJvZHkpO1xuXHRcdFx0Ly8gUmVnZW5lcmF0ZSB0aGUgZGlhbGVjdCdzIFNTRSBzdHJlYW0gZnJvbSB0aGUgY2FwdHVyZWQgcmVwbHkuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fZXhwYW5kUmVwbGF5TWVzc2FnZShpdGVtLm1lc3NhZ2UpO1xuXHRcdFx0Y29uc3Qgc3NlQm9keSA9IGl0ZW0uZGlhbGVjdCA9PT0gJ3Jlc3BvbnNlcycgPyByZXNwb25zZXNNZXNzYWdlVG9Tc2UobWVzc2FnZSkgOiBhbnRocm9waWNNZXNzYWdlVG9Tc2UobWVzc2FnZSk7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnY29udGVudC10eXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJywgJ2NhY2hlLWNvbnRyb2wnOiAnbm8tY2FjaGUnIH0pO1xuXHRcdFx0cmVzLmVuZChzc2VCb2R5KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0geyAuLi5pdGVtLnJlc3BvbnNlLmhlYWRlcnMgfTtcblx0XHQvLyBMZXQgTm9kZSByZWNvbXB1dGUgZnJhbWluZyBmb3IgdGhlIGV4YWN0IHJlY29yZGVkIGJvZHkuXG5cdFx0ZGVsZXRlIGhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ107XG5cdFx0ZGVsZXRlIGhlYWRlcnNbJ3RyYW5zZmVyLWVuY29kaW5nJ107XG5cdFx0cmVzLndyaXRlSGVhZChpdGVtLnJlc3BvbnNlLnN0YXR1cywgaGVhZGVycyk7XG5cdFx0cmVzLmVuZCh0aGlzLl9leHBhbmRSZXBsYXlQbGFjZWhvbGRlcnMoaXRlbS5yZXNwb25zZS5ib2R5KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcGFyZSB0aGUgbGl2ZSByZXF1ZXN0IGFnYWluc3QgdGhlIG9uZSByZWNvcmRlZCBmb3IgdGhpcyB0dXJuLlxuXHQgKlxuXHQgKiBCb3RoIHNpZGVzIGdvIHRocm91Z2ggdGhlIHNhbWUgc3VtbWFyaXplciBhbmQgdGhlIHNhbWUgcHJvamVjdGlvbiwgc28gdGhlXG5cdCAqIGNvbW1pdHRlZCBgcmVxdWVzdDpgIGJsb2NrIGJlY29tZXMgdGhlIGV4cGVjdGF0aW9uIHdpdGhvdXQgaXRzIHN0b3JlZFxuXHQgKiBzaGFwZSBoYXZpbmcgdG8gY2hhbmdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXNzZXJ0UmVjb3JkZWRSZXF1ZXN0KGRpYWxlY3Q6IFR1cm5EaWFsZWN0LCByZWNvcmRlZDogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCwgYm9keTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybkluZGV4ID0gdGhpcy5fbW9kZWxUdXJuQ291bnQrKztcblx0XHRpZiAodGhpcy5fYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdW1tYXJpemUgPSBkaWFsZWN0ID09PSAncmVzcG9uc2VzJyA/IHN1bW1hcml6ZVJlc3BvbnNlc1JlcXVlc3QgOiBzdW1tYXJpemVBbnRocm9waWNSZXF1ZXN0O1xuXHRcdGNvbnN0IG9ic2VydmVkID0gc3VtbWFyaXplKHRoaXMuX25vcm1hbGl6ZShib2R5KSk7XG5cdFx0aWYgKCFvYnNlcnZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBleHBlY3RlZCA9IHByb2plY3RNb2RlbFJlcXVlc3QocmVjb3JkZWQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHByb2plY3RNb2RlbFJlcXVlc3Qob2JzZXJ2ZWQpO1xuXHRcdGlmICghbW9kZWxSZXF1ZXN0c01hdGNoKGV4cGVjdGVkLCBhY3R1YWwpKSB7XG5cdFx0XHR0aGlzLl9yZXF1ZXN0TWlzbWF0Y2hlcy5wdXNoKGZvcm1hdE1vZGVsUmVxdWVzdE1pc21hdGNoKHR1cm5JbmRleCwgZXhwZWN0ZWQsIGFjdHVhbCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBib2R5OiBzdHJpbmcsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdGNvbnN0IG1ldGhvZCA9IHJlcS5tZXRob2QgPz8gJ0dFVCc7XG5cdFx0Y29uc3QgcGF0aCA9IG5ldyBVUkwocmVxLnVybCA/PyAnLycsICdodHRwOi8vbG9jYWxob3N0JykucGF0aG5hbWU7XG5cdFx0aWYgKE1PREVMX0VORFBPSU5UUy5oYXMocGF0aCkpIHtcblx0XHRcdHRoaXMuX29ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLnB1c2godGhpcy5fbm9ybWFsaXplKGJvZHkpKTtcblx0XHR9XG5cdFx0Y29uc3QgdXBzdHJlYW1CYXNlID0gdGhpcy5fdXBzdHJlYW1Gb3IocGF0aCk7XG5cdFx0Y29uc3QgdXBzdHJlYW0gPSBuZXcgVVJMKHJlcS51cmwgPz8gJy8nLCB1cHN0cmVhbUJhc2UpO1xuXHRcdGNvbnN0IGlzSHR0cHMgPSB1cHN0cmVhbS5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gaXNIdHRwcyA/IGh0dHBzTW9kdWxlIDogaHR0cE1vZHVsZTtcblxuXHRcdGNvbnN0IGZvcndhcmRIZWFkZXJzID0geyAuLi5yZXEuaGVhZGVycyB9O1xuXHRcdGZvcndhcmRIZWFkZXJzLmhvc3QgPSB1cHN0cmVhbS5ob3N0O1xuXHRcdGRlbGV0ZSBmb3J3YXJkSGVhZGVyc1snY29ubmVjdGlvbiddO1xuXHRcdGRlbGV0ZSBmb3J3YXJkSGVhZGVyc1snY29udGVudC1sZW5ndGgnXTtcblxuXHRcdGNvbnN0IHVwc3RyZWFtUmVxID0gdHJhbnNwb3J0LnJlcXVlc3QoXG5cdFx0XHR7XG5cdFx0XHRcdGhvc3RuYW1lOiB1cHN0cmVhbS5ob3N0bmFtZSxcblx0XHRcdFx0cG9ydDogdXBzdHJlYW0ucG9ydCB8fCAoaXNIdHRwcyA/IDQ0MyA6IDgwKSxcblx0XHRcdFx0cGF0aDogdXBzdHJlYW0ucGF0aG5hbWUgKyB1cHN0cmVhbS5zZWFyY2gsXG5cdFx0XHRcdG1ldGhvZCxcblx0XHRcdFx0aGVhZGVyczogZm9yd2FyZEhlYWRlcnMsXG5cdFx0XHR9LFxuXHRcdFx0dXBzdHJlYW1SZXMgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwQ2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSB1cHN0cmVhbVJlcy5zdGF0dXNDb2RlID8/IDUwMjtcblx0XHRcdFx0Y29uc3QgaGVhZGVycyA9IGZsYXR0ZW5IZWFkZXJzKHVwc3RyZWFtUmVzLmhlYWRlcnMpO1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKHN0YXR1cywgaGVhZGVycyk7XG5cdFx0XHRcdHVwc3RyZWFtUmVzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuXHRcdFx0XHRcdHJlc3BDaHVua3MucHVzaChjaHVuayk7XG5cdFx0XHRcdFx0cmVzLndyaXRlKGNodW5rKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHVwc3RyZWFtUmVzLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0XHRcdC8vIEFuY2lsbGFyeSBib290c3RyYXAgZW5kcG9pbnRzIGFyZSBmb3J3YXJkZWQgKHNvIHRoZSBsaXZlIHJ1blxuXHRcdFx0XHRcdC8vIHdvcmtzKSBidXQgbmV2ZXIgc3RvcmVkIFx1MjAxNCB0aGV5IGFyZSBzZXJ2ZWQgZnJvbSBzdHVicyBvbiByZXBsYXkuXG5cdFx0XHRcdFx0aWYgKGdldEFuY2lsbGFyeVN0dWIobWV0aG9kLCBwYXRoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBEZWNvbXByZXNzIHNvIHN0b3JlZCBib2RpZXMgYXJlIHJlYWRhYmxlIHRleHQgYW5kIHRoZSBtb2RlbFxuXHRcdFx0XHRcdC8vIGZpbHRlcnMgLyBjb2RlY3MgY2FuIHBhcnNlIHRoZW0uIFRoZSBsaXZlIGNsaWVudCBhbHJlYWR5XG5cdFx0XHRcdFx0Ly8gcmVjZWl2ZWQgdGhlIG9yaWdpbmFsIChjb21wcmVzc2VkKSBjaHVua3MgYWJvdmUuXG5cdFx0XHRcdFx0Y29uc3QgZGVjb2RlZCA9IGRlY29kZUJvZHkoQnVmZmVyLmNvbmNhdChyZXNwQ2h1bmtzKSwgaGVhZGVyc1snY29udGVudC1lbmNvZGluZyddKTtcblx0XHRcdFx0XHRjb25zdCBzdG9yZWRIZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0XHRcdFx0ZGVsZXRlIHN0b3JlZEhlYWRlcnNbJ2NvbnRlbnQtZW5jb2RpbmcnXTtcblx0XHRcdFx0XHQvLyBSZXdyaXRlIHRoZSBDQVBJIG9yaWdpbiB0byBhIHBsYWNlaG9sZGVyIChzbyByZXBsYXkgcmUtcG9pbnRzXG5cdFx0XHRcdFx0Ly8gZGlzY292ZXJ5IGF0IHRoZSBwcm94eSksIG5vcm1hbGl6ZSBsb2NhbCBwYXRocywgYW5kIHJlZGFjdFxuXHRcdFx0XHRcdC8vIHJlc3BvbnNlLXNpZGUgc2VjcmV0cy5cblx0XHRcdFx0XHRjb25zdCBjYXBpT3JpZ2luID0gbmV3IFVSTCh0aGlzLl9jYXBpVXBzdHJlYW0pLm9yaWdpbjtcblx0XHRcdFx0XHRjb25zdCBub3JtYWxpemVkQm9keSA9IHRoaXMuX25vcm1hbGl6ZShyZXBsYWNlQWxsKGRlY29kZWQsIGNhcGlPcmlnaW4sIENBUElfUExBQ0VIT0xERVIpKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoU0VDUkVUX0ZJRUxEX1JFLCBgJDFcIiR7U0VDUkVUX1BMQUNFSE9MREVSfVwiYClcblx0XHRcdFx0XHRcdC5yZXBsYWNlKFNZU1RFTV9GSUVMRF9SRSwgYCQxXCIke1NZU1RFTV9QUk9NUFRfUExBQ0VIT0xERVJ9XCJgKTtcblx0XHRcdFx0XHR0aGlzLl9yZWNvcmRlZC5wdXNoKHtcblx0XHRcdFx0XHRcdG1ldGhvZCxcblx0XHRcdFx0XHRcdHBhdGgsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0Qm9keTogdGhpcy5fbm9ybWFsaXplKGJvZHkpLFxuXHRcdFx0XHRcdFx0cmVzcG9uc2U6IHsgc3RhdHVzLCBoZWFkZXJzOiBzdG9yZWRIZWFkZXJzLCBib2R5OiBub3JtYWxpemVkQm9keSB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0KTtcblx0XHR1cHN0cmVhbVJlcS5vbignZXJyb3InLCBlcnIgPT4gdGhpcy5fZmFpbChyZXMsIGB1cHN0cmVhbSBlcnJvcjogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCkpO1xuXHRcdGlmIChib2R5KSB7XG5cdFx0XHR1cHN0cmVhbVJlcS53cml0ZShib2R5KTtcblx0XHR9XG5cdFx0dXBzdHJlYW1SZXEuZW5kKCk7XG5cdH1cblxuXHQvKiogR2l0SHViLUFQSSBwYXRocyBnbyB0byB0aGUgR2l0SHViIHVwc3RyZWFtOyBldmVyeXRoaW5nIGVsc2UgdG8gQ0FQSS4gKi9cblx0cHJpdmF0ZSBfdXBzdHJlYW1Gb3IocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoR0lUSFVCX0FQSV9QUkVGSVhFUy5zb21lKHByZWZpeCA9PiBwYXRoLnN0YXJ0c1dpdGgocHJlZml4KSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9naXRodWJVcHN0cmVhbTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhcGlVcHN0cmVhbTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9jYXBpVXBzdHJlYW0oKTogc3RyaW5nIHtcblx0XHRjb25zdCB1cmwgPSB0aGlzLl9vcHRpb25zLmNhcGlVcHN0cmVhbVVybCA/PyB0aGlzLl9vcHRpb25zLnVwc3RyZWFtVXJsO1xuXHRcdGlmICghdXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tjYXBpLXJlcGxheV0gbm8gQ0FQSSB1cHN0cmVhbSBjb25maWd1cmVkIChzZXQgY2FwaVVwc3RyZWFtVXJsIG9yIHVwc3RyZWFtVXJsKScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2dpdGh1YlVwc3RyZWFtKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5fb3B0aW9ucy5naXRodWJVcHN0cmVhbVVybCA/PyB0aGlzLl9vcHRpb25zLnVwc3RyZWFtVXJsO1xuXHRcdGlmICghdXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tjYXBpLXJlcGxheV0gbm8gR2l0SHViIHVwc3RyZWFtIGNvbmZpZ3VyZWQgKHNldCBnaXRodWJVcHN0cmVhbVVybCBvciB1cHN0cmVhbVVybCknKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVybDtcblx0fVxuXG5cdHByaXZhdGUgX2ZhaWwocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuXHRcdFx0Ly8gYHgtc2hvdWxkLXJldHJ5OiBmYWxzZWAgbWlycm9ycyB0aGUgQ0xJIHByb3h5IHNvIHRoZSBTREsgZG9lcyBub3Rcblx0XHRcdC8vIGhhbW1lciBhIG1pc3NpbmcgZml4dHVyZSB3aXRoIHJldHJpZXMuXG5cdFx0XHRyZXMud3JpdGVIZWFkKDUwMCwgeyAnY29udGVudC10eXBlJzogJ3RleHQvcGxhaW4nLCAneC1zaG91bGQtcmV0cnknOiAnZmFsc2UnIH0pO1xuXHRcdH1cblx0XHRyZXMuZW5kKGBbY2FwaS1yZXBsYXldICR7bWVzc2FnZX1gKTtcblx0fVxuXG5cdC8vIC0tIGZpeHR1cmUgSS9PIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9sb2FkRml4dHVyZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmaXh0dXJlID0geWFtbE1vZHVsZS5sb2FkKHJlYWRGaWxlU3luYyh0aGlzLl9maXh0dXJlUGF0aCwgJ3V0ZjgnKSkgYXMgSUZpeHR1cmU7XG5cdFx0Y29uc3QgdHVybkVuZHBvaW50ID0gZml4dHVyZS5kaWFsZWN0ID8gRElBTEVDVF9FTkRQT0lOVFtmaXh0dXJlLmRpYWxlY3RdIDogdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZml4dHVyZS5leGNoYW5nZXMpIHtcblx0XHRcdGxldCBrZXk6IHN0cmluZztcblx0XHRcdGxldCBpdGVtOiBJUmVwbGF5SXRlbTtcblx0XHRcdGlmIChpc1R1cm5FeGNoYW5nZShleGNoYW5nZSkpIHtcblx0XHRcdFx0aWYgKCF0dXJuRW5kcG9pbnQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtjYXBpLXJlcGxheV0gZml4dHVyZSBoYXMgdHVybiBleGNoYW5nZXMgYnV0IG5vIHRvcC1sZXZlbCBkaWFsZWN0OiAke3RoaXMuX2ZpeHR1cmVQYXRofWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGtleSA9IGAke3R1cm5FbmRwb2ludC5tZXRob2R9ICR7dHVybkVuZHBvaW50LnBhdGh9YDtcblx0XHRcdFx0aXRlbSA9IHsga2luZDogJ3R1cm4nLCBkaWFsZWN0OiBmaXh0dXJlLmRpYWxlY3QhLCBtZXNzYWdlOiB7IGNvbnRlbnQ6IGRlc2VyaWFsaXplQW50aHJvcGljQ29udGVudChleGNoYW5nZS5yZXNwb25zZS5jb250ZW50KSwgc3RvcFJlYXNvbjogZXhjaGFuZ2UucmVzcG9uc2Uuc3RvcFJlYXNvbiB9LCByZXF1ZXN0OiBleGNoYW5nZS5yZXF1ZXN0IH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRrZXkgPSBgJHtleGNoYW5nZS5tZXRob2R9ICR7ZXhjaGFuZ2UucGF0aH1gO1xuXHRcdFx0XHRpdGVtID0geyBraW5kOiAncmF3JywgcmVzcG9uc2U6IGV4Y2hhbmdlLnJlc3BvbnNlIH07XG5cdFx0XHR9XG5cdFx0XHRsZXQgYnVja2V0ID0gdGhpcy5fcmVwbGF5QnVja2V0cy5nZXQoa2V5KTtcblx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdGJ1Y2tldCA9IHsgaXRlbXM6IFtdLCBpbmRleDogMCB9O1xuXHRcdFx0XHR0aGlzLl9yZXBsYXlCdWNrZXRzLnNldChrZXksIGJ1Y2tldCk7XG5cdFx0XHR9XG5cdFx0XHRidWNrZXQuaXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZUZpeHR1cmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgYnVpbHQgPSB0aGlzLl9yZWNvcmRlZC5tYXAoZXhjaGFuZ2UgPT4gdGhpcy5fdG9GaXh0dXJlRXhjaGFuZ2UoZXhjaGFuZ2UpKTtcblx0XHRjb25zdCBleGNoYW5nZXMgPSBidWlsdC5tYXAoYiA9PiBiLmV4Y2hhbmdlKTtcblx0XHR0aGlzLl9ub3JtYWxpemVUb29sQ2FsbElkcyhleGNoYW5nZXMpO1xuXHRcdHRoaXMuX25vcm1hbGl6ZVV1aWRzKGV4Y2hhbmdlcyk7XG5cdFx0dGhpcy5fYXNzZXJ0Tm9Qb3NpeE9ubHlDb21tYW5kcyhleGNoYW5nZXMpO1xuXHRcdC8vIEV2ZXJ5IHR1cm4gaW4gYSBmaXh0dXJlIHNoYXJlcyBvbmUgZW5kcG9pbnQsIHNvIHRoZSBkaWFsZWN0IChhbmQgdGhlXG5cdFx0Ly8gYChtZXRob2QsIHBhdGgpYCBpdCBpbXBsaWVzKSBpcyBzdG9yZWQgb25jZSBhdCB0aGUgdG9wIGluc3RlYWQgb2Ygb24gZWFjaFxuXHRcdC8vIGV4Y2hhbmdlLlxuXHRcdGNvbnN0IGRpYWxlY3QgPSBidWlsdC5maW5kKGIgPT4gYi5kaWFsZWN0ICE9PSB1bmRlZmluZWQpPy5kaWFsZWN0O1xuXHRcdGNvbnN0IGZpeHR1cmU6IElGaXh0dXJlID0geyB2ZXJzaW9uOiAxLCAuLi4oZGlhbGVjdCA/IHsgZGlhbGVjdCB9IDoge30pLCBleGNoYW5nZXMgfTtcblx0XHRta2RpclN5bmMoZGlybmFtZSh0aGlzLl9maXh0dXJlUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmModGhpcy5fZml4dHVyZVBhdGgsIHlhbWxNb2R1bGUuZHVtcChmaXh0dXJlLCB7IGxpbmVXaWR0aDogLTEsIG5vUmVmczogdHJ1ZSB9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVqZWN0IGEgcmVjb3JkaW5nIHdob3NlIHNoZWxsIGNvbW1hbmRzIGNhbm5vdCBydW4gb24gV2luZG93cy5cblx0ICpcblx0ICogT25seSB0aGUgYXNzaXN0YW50J3MgYHRvb2xfdXNlYCBibG9ja3MgbWF0dGVyOiB0aG9zZSBhcmUgd2hhdCByZXBsYXkgZmVlZHNcblx0ICogYmFjayB0byB0aGUgYWdlbnQsIHNvIHRoZXkgYXJlIHRoZSBjb21tYW5kcyB0aGF0IHdpbGwgYWN0dWFsbHkgYmUgZXhlY3V0ZWRcblx0ICogb24gd2hhdGV2ZXIgcGxhdGZvcm0gdGhlIHRlc3QgbGF0ZXIgcnVucyBvbi4gVGhlIGB0b29sX3Jlc3VsdGAgYmxvY2tzXG5cdCAqIGVjaG9lZCBpbiByZXF1ZXN0IHN1bW1hcmllcyBhcmUgbmV2ZXIgcmVhZCBiYWNrLlxuXHQgKlxuXHQgKiBUaHJvd3MgYmVmb3JlIHRoZSBmaWxlIGlzIHdyaXR0ZW4gc28gYSByZWplY3RlZCByZWNvcmRpbmcgY2Fubm90IGxlYXZlIGFcblx0ICogaGFsZi1wb3J0YWJsZSBmaXh0dXJlIGJlaGluZC5cblx0ICovXG5cdHByaXZhdGUgX2Fzc2VydE5vUG9zaXhPbmx5Q29tbWFuZHMoZXhjaGFuZ2VzOiBJRml4dHVyZUV4Y2hhbmdlW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy5hbGxvd1Bvc2l4Q29tbWFuZHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZHM6IElSZWNvcmRlZENvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZXhjaGFuZ2VzKSB7XG5cdFx0XHRpZiAoIWlzVHVybkV4Y2hhbmdlKGV4Y2hhbmdlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYmxvY2sgb2YgZGVzZXJpYWxpemVBbnRocm9waWNDb250ZW50KGV4Y2hhbmdlLnJlc3BvbnNlLmNvbnRlbnQpKSB7XG5cdFx0XHRcdGlmIChibG9jay50eXBlICE9PSAndG9vbF91c2UnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IChibG9jay5pbnB1dCBhcyB7IGNvbW1hbmQ/OiB1bmtub3duIH0gfCB1bmRlZmluZWQpPy5jb21tYW5kO1xuXHRcdFx0XHRpZiAodHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnICYmIGNvbW1hbmQpIHtcblx0XHRcdFx0XHRjb21tYW5kcy5wdXNoKHsgY29tbWFuZCwgdG9vbE5hbWU6IGJsb2NrLm5hbWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZmluZGluZ3MgPSBmaW5kUG9zaXhPbmx5Q29tbWFuZHMoY29tbWFuZHMpO1xuXHRcdGlmIChmaW5kaW5ncy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoZm9ybWF0UG9zaXhDb21tYW5kRXJyb3IodGhpcy5fZml4dHVyZVBhdGgsIGZpbmRpbmdzKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2UgdGhlIGJhY2tlbmQncyBvcGFxdWUgdG9vbC1jYWxsIGlkcyB3aXRoIHN0YWJsZSwgcmVhZGFibGUgb3JkaW5hbHNcblx0ICogKGB0b29sY2FsbF8wYCwgYHRvb2xjYWxsXzFgLCAuLi4pIGFjcm9zcyB0aGUgd2hvbGUgZml4dHVyZS4gQXNzaXN0YW50XG5cdCAqIGB0b29sX3VzZWAgYmxvY2tzIGRlZmluZSB0aGUgb3JkZXJpbmc7IHRoZSBgdG9vbF9yZXN1bHRgIGJsb2NrcyB0aGF0IHJlZmVyXG5cdCAqIGJhY2sgdG8gdGhlbSBpbiBsYXRlciByZXF1ZXN0cyByZXVzZSB0aGUgc2FtZSBtYXBwaW5nLiBLZWVwcyBjYXB0dXJlc1xuXHQgKiBkZXRlcm1pbmlzdGljIGFjcm9zcyByZS1yZWNvcmRzIGFuZCBlYXN5IHRvIGZvbGxvdy5cblx0ICovXG5cdHByaXZhdGUgX25vcm1hbGl6ZVRvb2xDYWxsSWRzKGV4Y2hhbmdlczogSUZpeHR1cmVFeGNoYW5nZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaWRNYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IG1hcElkID0gKGlkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuXHRcdFx0bGV0IG1hcHBlZCA9IGlkTWFwLmdldChpZCk7XG5cdFx0XHRpZiAobWFwcGVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bWFwcGVkID0gYHRvb2xjYWxsXyR7aWRNYXAuc2l6ZX1gO1xuXHRcdFx0XHRpZE1hcC5zZXQoaWQsIG1hcHBlZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWFwcGVkO1xuXHRcdH07XG5cdFx0Ly8gRmlyc3QgcGFzczogYXNzaXN0YW50IHRvb2xfdXNlIGlkcyAoaW4gcmVwbHkgb3JkZXIpIHNlZWQgdGhlIG1hcHBpbmcuXG5cdFx0Zm9yIChjb25zdCBleGNoYW5nZSBvZiBleGNoYW5nZXMpIHtcblx0XHRcdGlmICghaXNUdXJuRXhjaGFuZ2UoZXhjaGFuZ2UpIHx8ICFBcnJheS5pc0FycmF5KGV4Y2hhbmdlLnJlc3BvbnNlLmNvbnRlbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBibG9jayBvZiBleGNoYW5nZS5yZXNwb25zZS5jb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IGIgPSBibG9jayBhcyB7IHR5cGU/OiBzdHJpbmc7IGlkPzogc3RyaW5nIH07XG5cdFx0XHRcdGlmIChiLnR5cGUgPT09ICd0b29sX3VzZScgJiYgdHlwZW9mIGIuaWQgPT09ICdzdHJpbmcnICYmIGIuaWQpIHtcblx0XHRcdFx0XHRiLmlkID0gbWFwSWQoYi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gU2Vjb25kIHBhc3M6IHRvb2xfcmVzdWx0IHJlZmVyZW5jZXMgaW4gcmVxdWVzdHMgcmV1c2UgdGhlIHNhbWUgaWRzLlxuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZXhjaGFuZ2VzKSB7XG5cdFx0XHRpZiAoIWlzVHVybkV4Y2hhbmdlKGV4Y2hhbmdlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBleGNoYW5nZS5yZXF1ZXN0Lm1lc3NhZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAobWVzc2FnZSBhcyB7IGNvbnRlbnQ/OiB1bmtub3duIH0pLmNvbnRlbnQ7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShjb250ZW50KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgYmxvY2sgb2YgY29udGVudCkge1xuXHRcdFx0XHRcdGNvbnN0IGIgPSBibG9jayBhcyB7IHR5cGU/OiBzdHJpbmc7IHRvb2xfdXNlX2lkPzogc3RyaW5nIH07XG5cdFx0XHRcdFx0aWYgKGIudHlwZSA9PT0gJ3Rvb2xfcmVzdWx0JyAmJiB0eXBlb2YgYi50b29sX3VzZV9pZCA9PT0gJ3N0cmluZycgJiYgYi50b29sX3VzZV9pZCkge1xuXHRcdFx0XHRcdFx0Yi50b29sX3VzZV9pZCA9IG1hcElkKGIudG9vbF91c2VfaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlIGVwaGVtZXJhbCBVVUlEcyAoc2hlbGwgaWRzLCBzZXNzaW9uLXN0YXRlIGlkcywgLi4uKSB0aGF0IGFwcGVhciBpblxuXHQgKiBjYXB0dXJlZCByZXF1ZXN0L3Jlc3BvbnNlIGNvbnRlbnQgd2l0aCBzdGFibGUgb3JkaW5hbCBwbGFjZWhvbGRlcnNcblx0ICogKGAke3V1aWRfMH1gLCBgJHt1dWlkXzF9YCwgLi4uKS4gVGhleSBjaGFuZ2Ugb24gZXZlcnkgcmUtcmVjb3JkLCBzb1xuXHQgKiBub3JtYWxpemluZyB0aGVtIGtlZXBzIGNvbW1pdHRlZCBmaXh0dXJlcyBkaWZmLWNsZWFuLiBEaXN0aW5jdCBVVUlEcyBnZXRcblx0ICogZGlzdGluY3QgcGxhY2Vob2xkZXJzOyByZXBlYXRzIG9mIHRoZSBzYW1lIFVVSUQgcmV1c2UgaXRzIHBsYWNlaG9sZGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfbm9ybWFsaXplVXVpZHMoZXhjaGFuZ2VzOiBJRml4dHVyZUV4Y2hhbmdlW10pOiB2b2lkIHtcblx0XHRjb25zdCBpZE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgdXVpZFJlID0gL1swLTlhLWZdezh9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezEyfS9naTtcblx0XHRjb25zdCBtYXBVdWlkID0gKHV1aWQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRsZXQgbWFwcGVkID0gaWRNYXAuZ2V0KHV1aWQpO1xuXHRcdFx0aWYgKG1hcHBlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG1hcHBlZCA9IGBcXCR7dXVpZF8ke2lkTWFwLnNpemV9fWA7XG5cdFx0XHRcdGlkTWFwLnNldCh1dWlkLCBtYXBwZWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hcHBlZDtcblx0XHR9O1xuXHRcdGNvbnN0IHdhbGsgPSAodmFsdWU6IHVua25vd24pOiB1bmtub3duID0+IHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZS5yZXBsYWNlKHV1aWRSZSwgbWFwVXVpZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHZhbHVlW2ldID0gd2Fsayh2YWx1ZVtpXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29uc3Qgb2JqID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG9iaikpIHtcblx0XHRcdFx0XHRvYmpba2V5XSA9IHdhbGsob2JqW2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9O1xuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZXhjaGFuZ2VzKSB7XG5cdFx0XHR3YWxrKGV4Y2hhbmdlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydCBhIHJhdyByZWNvcmRlZCBleGNoYW5nZSBpbnRvIGl0cyBmaXh0dXJlIGZvcm06IG1vZGVsLWVuZHBvaW50IGNhbGxzXG5cdCAqIGJlY29tZSByZWFkYWJsZSB0dXJucyAocGFyc2VkIHJlcXVlc3QgKyByZWdlbmVyYXRhYmxlIHJlcGx5KSB0YWdnZWQgd2l0aFxuXHQgKiB0aGVpciBkaWFsZWN0IChob2lzdGVkIHRvIHRoZSBmaXh0dXJlIGxldmVsIGJ5IHtAbGluayBfd3JpdGVGaXh0dXJlfSk7XG5cdCAqIGV2ZXJ5dGhpbmcgZWxzZSBzdGF5cyByYXcuXG5cdCAqL1xuXHRwcml2YXRlIF90b0ZpeHR1cmVFeGNoYW5nZShleGNoYW5nZTogSVJlY29yZGVkRXhjaGFuZ2UpOiB7IGV4Y2hhbmdlOiBJRml4dHVyZUV4Y2hhbmdlOyBkaWFsZWN0PzogVHVybkRpYWxlY3QgfSB7XG5cdFx0aWYgKGV4Y2hhbmdlLm1ldGhvZCA9PT0gJ1BPU1QnICYmIGV4Y2hhbmdlLnBhdGggPT09IEFOVEhST1BJQ19NRVNTQUdFU19QQVRIKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gc3VtbWFyaXplQW50aHJvcGljUmVxdWVzdChleGNoYW5nZS5yZXF1ZXN0Qm9keSk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gYWdncmVnYXRlQW50aHJvcGljU3NlKGV4Y2hhbmdlLnJlc3BvbnNlLmJvZHkpO1xuXHRcdFx0aWYgKHJlcXVlc3QgJiYgbWVzc2FnZSkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fbm9ybWFsaXplTWVzc2FnZUNvbnRlbnQobWVzc2FnZS5jb250ZW50KTtcblx0XHRcdFx0cmV0dXJuIHsgZXhjaGFuZ2U6IHsgcmVxdWVzdCwgcmVzcG9uc2U6IHsgY29udGVudDogc2VyaWFsaXplQW50aHJvcGljQ29udGVudChjb250ZW50KSwgc3RvcFJlYXNvbjogbWVzc2FnZS5zdG9wUmVhc29uIH0gfSwgZGlhbGVjdDogJ2FudGhyb3BpYycgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV4Y2hhbmdlLm1ldGhvZCA9PT0gJ1BPU1QnICYmIGV4Y2hhbmdlLnBhdGggPT09IFJFU1BPTlNFU19QQVRIKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gc3VtbWFyaXplUmVzcG9uc2VzUmVxdWVzdChleGNoYW5nZS5yZXF1ZXN0Qm9keSk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gYWdncmVnYXRlUmVzcG9uc2VzU3NlKGV4Y2hhbmdlLnJlc3BvbnNlLmJvZHkpO1xuXHRcdFx0aWYgKHJlcXVlc3QgJiYgbWVzc2FnZSkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fbm9ybWFsaXplTWVzc2FnZUNvbnRlbnQobWVzc2FnZS5jb250ZW50KTtcblx0XHRcdFx0cmV0dXJuIHsgZXhjaGFuZ2U6IHsgcmVxdWVzdCwgcmVzcG9uc2U6IHsgY29udGVudDogc2VyaWFsaXplQW50aHJvcGljQ29udGVudChjb250ZW50KSwgc3RvcFJlYXNvbjogbWVzc2FnZS5zdG9wUmVhc29uIH0gfSwgZGlhbGVjdDogJ3Jlc3BvbnNlcycgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgZXhjaGFuZ2U6IHsgbWV0aG9kOiBleGNoYW5nZS5tZXRob2QsIHBhdGg6IGV4Y2hhbmdlLnBhdGgsIHJlc3BvbnNlOiBleGNoYW5nZS5yZXNwb25zZSB9IH07XG5cdH1cblxuXHQvKipcblx0ICogTm9ybWFsaXplIGxvY2FsIHBhdGhzIG91dCBvZiBhbiBhZ2dyZWdhdGVkIGFzc2lzdGFudCByZXBseS4gVG9vbC1pbnB1dCBKU09OXG5cdCAqIHN0cmVhbXMgc3BsaXQgYWNyb3NzIG1hbnkgU1NFIGRlbHRhcywgc28gYSBzdHJpbmcgcmVwbGFjZSBvbiB0aGUgcmF3IGJvZHlcblx0ICogY2FuIG1pc3MgYSBwYXRoIHN0cmFkZGxpbmcgYSBjaHVuayBib3VuZGFyeTsgbm9ybWFsaXppbmcgdGhlIHJlYXNzZW1ibGVkXG5cdCAqIGNvbnRlbnQgKHRleHQgKyB0b29sIGlucHV0cykgaXMgcmVsaWFibGUuXG5cdCAqL1xuXHRwcml2YXRlIF9ub3JtYWxpemVNZXNzYWdlQ29udGVudChjb250ZW50OiBBbnRocm9waWNDb250ZW50QmxvY2tbXSk6IEFudGhyb3BpY0NvbnRlbnRCbG9ja1tdIHtcblx0XHRyZXR1cm4gY29udGVudC5tYXAoKGJsb2NrKTogQW50aHJvcGljQ29udGVudEJsb2NrID0+IHtcblx0XHRcdGlmIChibG9jay50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ3RleHQnLCB0ZXh0OiB0aGlzLl9ub3JtYWxpemUoYmxvY2sudGV4dCkgfTtcblx0XHRcdH1cblx0XHRcdGxldCBpbnB1dCA9IGJsb2NrLmlucHV0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aW5wdXQgPSBKU09OLnBhcnNlKHRoaXMuX25vcm1hbGl6ZShKU09OLnN0cmluZ2lmeShibG9jay5pbnB1dCA/PyB7fSkpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBub24tc2VyaWFsaXphYmxlIGlucHV0OyBrZWVwIGFzLWlzXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAndG9vbF91c2UnLCBpZDogYmxvY2suaWQsIG5hbWU6IG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWVGb3JDYXB0dXJlKGJsb2NrLm5hbWUpLCBpbnB1dCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IHRleHQ7XG5cdFx0aWYgKHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdGNvbnN0IHdvcmtEaXJzID0gbmV3IFNldChbdGhpcy5fd29ya2luZ0RpcmVjdG9yeV0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0d29ya0RpcnMuYWRkKHJlYWxwYXRoU3luYy5uYXRpdmUodGhpcy5fd29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFRoZSByZWNvcmRpbmcgd29yayBkaXJlY3RvcnkgY2FuIGRpc2FwcGVhciBkdXJpbmcgdGVhcmRvd24uXG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtEaXIgb2YgWy4uLndvcmtEaXJzXS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuXHRcdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgZXNjYXBlSnNvblN0cmluZyh3b3JrRGlyKSwgV09SS0RJUl9QTEFDRUhPTERFUik7XG5cdFx0XHRcdHJlc3VsdCA9IHJlcGxhY2VBbGwocmVzdWx0LCB3b3JrRGlyLCBXT1JLRElSX1BMQUNFSE9MREVSKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuaG9tZURpcikge1xuXHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIGVzY2FwZUpzb25TdHJpbmcodGhpcy5fb3B0aW9ucy5ob21lRGlyKSwgSE9NRURJUl9QTEFDRUhPTERFUik7XG5cdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgdGhpcy5fb3B0aW9ucy5ob21lRGlyLCBIT01FRElSX1BMQUNFSE9MREVSKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudXNlck5hbWUpIHtcblx0XHRcdHJlc3VsdCA9IHNjcnViVXNlck5hbWUocmVzdWx0LCB0aGlzLl9vcHRpb25zLnVzZXJOYW1lKTtcblx0XHR9XG5cdFx0cmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoVEVNUF9ESVJfU1VGRklYX1JFLCBgJDEke1RFTVBfRElSX1NVRkZJWF9QTEFDRUhPTERFUn1gKTtcblx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgYC9wcml2YXRlJHtXT1JLRElSX1BMQUNFSE9MREVSfWAsIFdPUktESVJfUExBQ0VIT0xERVIpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKEZJTEVfTElTVElOR19EQVRFX1JFLCAnJHt0aW1lc3RhbXB9Jyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGFuZFJlcGxheU1lc3NhZ2UobWVzc2FnZTogSUFudGhyb3BpY01lc3NhZ2UpOiBJQW50aHJvcGljTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLm1lc3NhZ2UsXG5cdFx0XHRjb250ZW50OiBtZXNzYWdlLmNvbnRlbnQubWFwKGJsb2NrID0+IHtcblx0XHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmJsb2NrLCB0ZXh0OiB0aGlzLl9leHBhbmRSZXBsYXlQbGFjZWhvbGRlcnMoYmxvY2sudGV4dCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmJsb2NrLCBuYW1lOiBleHBhbmRTaGVsbFRvb2xOYW1lKGJsb2NrLm5hbWUpLCBpbnB1dDogdGhpcy5fZXhwYW5kUmVwbGF5VmFsdWUoYmxvY2suaW5wdXQpIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQW55IGZ1dHVyZSBibG9jayBraW5kIHBhc3NlcyB0aHJvdWdoIHVudG91Y2hlZCByYXRoZXIgdGhhbiBiZWluZ1xuXHRcdFx0XHQvLyByZXdyaXR0ZW4gYXMgaWYgaXQgd2VyZSBhIHRvb2wgY2FsbC5cblx0XHRcdFx0cmV0dXJuIGJsb2NrO1xuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGFuZFJlcGxheVZhbHVlKHZhbHVlOiB1bmtub3duKTogdW5rbm93biB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9leHBhbmRSZXBsYXlQbGFjZWhvbGRlcnModmFsdWUpO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAoaXRlbSA9PiB0aGlzLl9leHBhbmRSZXBsYXlWYWx1ZShpdGVtKSk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGl0ZW1dIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlKSkge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IHRoaXMuX2V4cGFuZFJlcGxheVZhbHVlKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhwYW5kUmVwbGF5UGxhY2Vob2xkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IHJlcGxhY2VBbGwodGV4dCwgQ0FQSV9QTEFDRUhPTERFUiwgdGhpcy51cmwpO1xuXHRcdGlmICh0aGlzLl93b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VOYW1lID0gYmFzZW5hbWUodGhpcy5fd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBzdWZmaXggPSAvLSg/PHN1ZmZpeD5bQS1aYS16MC05XXs2fSkkLy5leGVjKHdvcmtzcGFjZU5hbWUpPy5ncm91cHM/LnN1ZmZpeDtcblx0XHRcdGxldCBjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5ID0gdGhpcy5fd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNhbm9uaWNhbFdvcmtpbmdEaXJlY3RvcnkgPSByZWFscGF0aFN5bmMubmF0aXZlKHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFRoZSByZXBsYXkgd29ya2luZyBkaXJlY3RvcnkgY2FuIGRpc2FwcGVhciBkdXJpbmcgdGVhcmRvd24uXG5cdFx0XHR9XG5cdFx0XHRpZiAoc3VmZml4KSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVN0ZW0gPSB3b3Jrc3BhY2VOYW1lLnNsaWNlKDAsIC1zdWZmaXgubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZFdvcmtzcGFjZU5hbWUgPSBgJHt3b3Jrc3BhY2VTdGVtfSR7VEVNUF9ESVJfU1VGRklYX1BMQUNFSE9MREVSfWA7XG5cdFx0XHRcdGNvbnN0IGxlZ2FjeVdvcmtzcGFjZVBsYWNlaG9sZGVyID0gYCR7V09SS0RJUl9QTEFDRUhPTERFUn0vJHtub3JtYWxpemVkV29ya3NwYWNlTmFtZX1gO1xuXHRcdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgYC9wcml2YXRlJHtsZWdhY3lXb3Jrc3BhY2VQbGFjZWhvbGRlcn1gLCBjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIGxlZ2FjeVdvcmtzcGFjZVBsYWNlaG9sZGVyLCB0aGlzLl93b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG5cdFx0XHRcdFx0bmV3IFJlZ0V4cChgKD86XFxcXC9wcml2YXRlKT8ke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMoV09SS0RJUl9QTEFDRUhPTERFUil9XFxcXC8ke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMod29ya3NwYWNlU3RlbSl9W0EtWmEtejAtOV17Nn1gLCAnZycpLFxuXHRcdFx0XHRcdG1hdGNoID0+IG1hdGNoLnN0YXJ0c1dpdGgoJy9wcml2YXRlJykgPyBjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5IDogdGhpcy5fd29ya2luZ0RpcmVjdG9yeSEsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgYC9wcml2YXRlJHtXT1JLRElSX1BMQUNFSE9MREVSfWAsIGNhbm9uaWNhbFdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIFdPUktESVJfUExBQ0VIT0xERVIsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0aWYgKHN1ZmZpeCkge1xuXHRcdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgVEVNUF9ESVJfU1VGRklYX1BMQUNFSE9MREVSLCBzdWZmaXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5ob21lRGlyKSB7XG5cdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgSE9NRURJUl9QTEFDRUhPTERFUiwgdGhpcy5fb3B0aW9ucy5ob21lRGlyKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudXNlck5hbWUpIHtcblx0XHRcdHJlc3VsdCA9IHJlcGxhY2VBbGwocmVzdWx0LCBVU0VSX1BMQUNFSE9MREVSLCB0aGlzLl9vcHRpb25zLnVzZXJOYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5mdW5jdGlvbiByZXBsYWNlQWxsKHRleHQ6IHN0cmluZywgc2VhcmNoOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIXNlYXJjaCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cdHJldHVybiB0ZXh0LnNwbGl0KHNlYXJjaCkuam9pbihyZXBsYWNlbWVudCk7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUpzb25TdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSkuc2xpY2UoMSwgLTEpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbn1cblxuLyoqIERlY29tcHJlc3MgYSByZXNwb25zZSBib2R5IHBlciBpdHMgYGNvbnRlbnQtZW5jb2RpbmdgIGludG8gYSBVVEYtOCBzdHJpbmcuICovXG5mdW5jdGlvbiBkZWNvZGVCb2R5KGJ1ZmZlcjogQnVmZmVyLCBlbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHQvLyBOb3JtYWxpemUgaGVhZGVyIGNhc2luZy93aGl0ZXNwYWNlIChlLmcuIGBHWklQYCwgYCBnemlwIGApIGJlZm9yZSBtYXRjaGluZy5cblx0XHRzd2l0Y2ggKGVuY29kaW5nPy50cmltKCkudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnZ3ppcCc6IHJldHVybiB6bGliTW9kdWxlLmd1bnppcFN5bmMoYnVmZmVyKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0Y2FzZSAnYnInOiByZXR1cm4gemxpYk1vZHVsZS5icm90bGlEZWNvbXByZXNzU3luYyhidWZmZXIpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHRjYXNlICdkZWZsYXRlJzogcmV0dXJuIHpsaWJNb2R1bGUuaW5mbGF0ZVN5bmMoYnVmZmVyKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuXHRcdH1cblx0fSBjYXRjaCB7XG5cdFx0Ly8gTm90IGFjdHVhbGx5IGNvbXByZXNzZWQgLyB1bmtub3duIGVuY29kaW5nIFx1MjAxNCBmYWxsIGJhY2sgdG8gcmF3IHRleHQuXG5cdFx0cmV0dXJuIGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5IZWFkZXJzKGhlYWRlcnM6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHJlc3VsdFtrZXldID0gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZS5qb2luKCcsICcpIDogdmFsdWU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQXFDQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFlBQVksV0FBVyxjQUFjLGNBQWMscUJBQXFCO0FBQ2pGLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsdUJBQXVCLHVCQUF1Qix5QkFBeUIsdUJBQXVCLHVCQUF1QixnQkFBZ0IsMkJBQTJCLDZCQUE2QiwyQkFBMkIsaUNBQXFIO0FBQ3RWLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCLCtCQUFzRDtBQUN0RixTQUFTLDRCQUE0QixvQkFBb0IsMkJBQTJCO0FBQ3BGLFNBQVMscUJBQXFCLHdDQUF3QztBQUN0RSxTQUFTLGVBQWUsNkJBQTZCO0FBSXJELE1BQU0sY0FBYyxjQUFjLFlBQVksR0FBRztBQUNqRCxNQUFNLGFBQWEsWUFBWSxNQUFNO0FBQ3JDLE1BQU0sY0FBYyxZQUFZLE9BQU87QUFDdkMsTUFBTSxhQUFhLFlBQVksTUFBTTtBQUNyQyxNQUFNLGFBQWEsWUFBWSxTQUFTO0FBS3hDLE1BQU0sa0JBQWtCLG9CQUFJLElBQUksQ0FBQyxxQkFBcUIsY0FBYyxjQUFjLENBQUM7QUFFbkYsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSw4QkFBOEI7QUFDcEMsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSx1QkFBdUI7QUFRN0IsTUFBTSxtQkFBbUI7QUFRekIsTUFBTSxtQkFBbUI7QUFR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
