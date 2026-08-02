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
import { LRUCache } from "../../../../base/common/map.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ChatMessageRole, ILanguageModelsService } from "../common/languageModels.js";
const IChatGoalSummaryService = createDecorator("chatGoalSummaryService");
const MAX_PROMPT_CHARS = 4e3;
const MAX_SUMMARY_CHARS = 100;
const CACHE_SIZE = 50;
const REFUSAL_PREFIX_RE = /^(?:sorry\b|unfortunately\b|my apologies\b|as an ai\b|i\s+apologi[sz]e\b|i\s*['\u2019]?m\s+sorry\b|i\s+am\s+sorry\b|i\s*['\u2019]?m\s+unable\b|i\s+am\s+unable\b|i\s+am\s+not\s+able\b|i\s*(?:can['\u2019]?t|cannot|can\s?not|won['\u2019]?t)\b)/i;
let ChatGoalSummaryService = class {
  constructor(_languageModelsService) {
    this._languageModelsService = _languageModelsService;
    this._cache = new LRUCache(CACHE_SIZE);
    this._inFlight = /* @__PURE__ */ new Map();
  }
  async summarize(prompt, token) {
    const key = prompt.trim();
    if (!key) {
      return void 0;
    }
    const cached = this._cache.get(key);
    if (cached) {
      return cached;
    }
    const inflight = this._inFlight.get(key);
    if (inflight) {
      return inflight;
    }
    const promise = (async () => {
      try {
        const summary = await this._invokeModel(key, token);
        if (summary && !token.isCancellationRequested) {
          this._cache.set(key, summary);
        }
        return summary;
      } catch {
        return void 0;
      } finally {
        this._inFlight.delete(key);
      }
    })();
    this._inFlight.set(key, promise);
    return promise;
  }
  async _invokeModel(prompt, token) {
    const models = await this._languageModelsService.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
    if (!models.length || token.isCancellationRequested) {
      return void 0;
    }
    const truncatedPrompt = prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) + "...[truncated]" : prompt;
    const systemPrompt = [
      "You summarize a user's coding request into a single short phrase suitable for a status badge.",
      'Reply with the phrase only \u2014 no prose, no quotes, no leading "Goal:", no punctuation at the end.',
      'Use the imperative ("Add tests for X", "Fix the avatar popup bug").',
      "Keep it under 80 characters. Prefer the user's own nouns and verbs.",
      "This is a benign labeling task: never refuse or apologize. Always restate the request as a phrase, even if it seems unusual."
    ].join(" ");
    const response = await this._languageModelsService.sendChatRequest(
      models[0],
      void 0,
      [
        { role: ChatMessageRole.System, content: [{ type: "text", value: systemPrompt }] },
        { role: ChatMessageRole.User, content: [{ type: "text", value: truncatedPrompt }] }
      ],
      {},
      token
    );
    let text = "";
    for await (const part of response.stream) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (Array.isArray(part)) {
        for (const p of part) {
          if (p.type === "text") {
            text += p.value;
          }
        }
      } else if (part.type === "text") {
        text += part.value;
      }
    }
    await response.result;
    if (token.isCancellationRequested) {
      return void 0;
    }
    return cleanGoalSummary(text);
  }
};
ChatGoalSummaryService = __decorateClass([
  __decorateParam(0, ILanguageModelsService)
], ChatGoalSummaryService);
function cleanGoalSummary(raw) {
  let s = raw.trim();
  if (!s) {
    return void 0;
  }
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/^\s*goal\s*[:\-—]\s*/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || REFUSAL_PREFIX_RE.test(s)) {
    return void 0;
  }
  if (s.length > MAX_SUMMARY_CHARS) {
    s = s.slice(0, MAX_SUMMARY_CHARS - 1).replace(/\s+\S*$/, "") + "\u2026";
  }
  return s || void 0;
}
export {
  ChatGoalSummaryService,
  IChatGoalSummaryService,
  cleanGoalSummary
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0R29hbFN1bW1hcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0TWVzc2FnZVJvbGUsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuXG5leHBvcnQgY29uc3QgSUNoYXRHb2FsU3VtbWFyeVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNoYXRHb2FsU3VtbWFyeVNlcnZpY2U+KCdjaGF0R29hbFN1bW1hcnlTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRHb2FsU3VtbWFyeVNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBzaG9ydCAob25lLXBocmFzZSkgc3VtbWFyeSBvZiB0aGUgdXNlcidzIHByb21wdCBzdWl0YWJsZSBmb3IgZGlzcGxheVxuXHQgKiBhcyBhIFwiR29hbDogPHN1bW1hcnk+XCIgYmFubmVyIGFib3ZlIHRoZSBjaGF0IGlucHV0LiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW5cblx0ICogbm8gbW9kZWwgaXMgYXZhaWxhYmxlLCB0aGUgbW9kZWwgZGVjbGluZXMgdG8gc3VtbWFyaXplLCBvciB0aGUgc3VtbWFyeSBjYW5ub3Rcblx0ICogYmUgcHJvZHVjZWQuXG5cdCAqL1xuXHRzdW1tYXJpemUocHJvbXB0OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcbn1cblxuY29uc3QgTUFYX1BST01QVF9DSEFSUyA9IDQwMDA7XG5jb25zdCBNQVhfU1VNTUFSWV9DSEFSUyA9IDEwMDtcbmNvbnN0IENBQ0hFX1NJWkUgPSA1MDtcblxuLyoqXG4gKiBNYXRjaGVzIHJlc3BvbnNlcyB3aGVyZSB0aGUgc3VtbWFyeSBtb2RlbCBkZWNsaW5lZCB0byBzdW1tYXJpemUgdGhlIHByb21wdCBhbmRcbiAqIHJldHVybmVkIGEgcmVmdXNhbCAoZS5nLiBcIlNvcnJ5LCBJIGNhbid0IGFzc2lzdCB3aXRoIHRoYXQuXCIpIGluc3RlYWQgb2YgYSBnb2FsXG4gKiBwaHJhc2UuIEFuY2hvcmVkIGF0IHRoZSBzdGFydDogdmFsaWQgc3VtbWFyaWVzIGFyZSBpbXBlcmF0aXZlIHBocmFzZXMgKFwiQWRkXG4gKiB0ZXN0cyBmb3IgWFwiLCBcIkZpeCB0aGUgcG9wdXAgYnVnXCIpIGFuZCBuZXZlciBiZWdpbiB3aXRoIGFuIGFwb2xvZ3kgb3IgYW5cbiAqIGluYWJpbGl0eSBzdGF0ZW1lbnQsIHNvIGxlZ2l0aW1hdGUgc3VtbWFyaWVzIHRoYXQgbWVyZWx5IG1lbnRpb24gdGhlc2Ugd29yZHNcbiAqIChzdWNoIGFzIGEgcmVxdWVzdCB0byBmaXggYSBcImNhbid0IGFzc2lzdFwiIGVycm9yKSBhcmUgbm90IG1pc2NsYXNzaWZpZWQuXG4gKi9cbmNvbnN0IFJFRlVTQUxfUFJFRklYX1JFID0gL14oPzpzb3JyeVxcYnx1bmZvcnR1bmF0ZWx5XFxifG15IGFwb2xvZ2llc1xcYnxhcyBhbiBhaVxcYnxpXFxzK2Fwb2xvZ2lbc3pdZVxcYnxpXFxzKlsnXFx1MjAxOV0/bVxccytzb3JyeVxcYnxpXFxzK2FtXFxzK3NvcnJ5XFxifGlcXHMqWydcXHUyMDE5XT9tXFxzK3VuYWJsZVxcYnxpXFxzK2FtXFxzK3VuYWJsZVxcYnxpXFxzK2FtXFxzK25vdFxccythYmxlXFxifGlcXHMqKD86Y2FuWydcXHUyMDE5XT90fGNhbm5vdHxjYW5cXHM/bm90fHdvblsnXFx1MjAxOV0/dClcXGIpL2k7XG5cbmV4cG9ydCBjbGFzcyBDaGF0R29hbFN1bW1hcnlTZXJ2aWNlIGltcGxlbWVudHMgSUNoYXRHb2FsU3VtbWFyeVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4oQ0FDSEVfU0laRSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0ID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgc3VtbWFyaXplKHByb21wdDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGtleSA9IHByb21wdC50cmltKCk7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fY2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHR9XG5cblx0XHRjb25zdCBpbmZsaWdodCA9IHRoaXMuX2luRmxpZ2h0LmdldChrZXkpO1xuXHRcdGlmIChpbmZsaWdodCkge1xuXHRcdFx0cmV0dXJuIGluZmxpZ2h0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMuX2ludm9rZU1vZGVsKGtleSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoc3VtbWFyeSAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9jYWNoZS5zZXQoa2V5LCBzdW1tYXJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3VtbWFyeTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5faW5GbGlnaHQuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHRoaXMuX2luRmxpZ2h0LnNldChrZXksIHByb21pc2UpO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW52b2tlTW9kZWwocHJvbXB0OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAnY29waWxvdCcsIGlkOiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyB9KTtcblx0XHRpZiAoIW1vZGVscy5sZW5ndGggfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJ1bmNhdGVkUHJvbXB0ID0gcHJvbXB0Lmxlbmd0aCA+IE1BWF9QUk9NUFRfQ0hBUlMgPyBwcm9tcHQuc2xpY2UoMCwgTUFYX1BST01QVF9DSEFSUykgKyAnLi4uW3RydW5jYXRlZF0nIDogcHJvbXB0O1xuXHRcdGNvbnN0IHN5c3RlbVByb21wdCA9IFtcblx0XHRcdCdZb3Ugc3VtbWFyaXplIGEgdXNlclxcJ3MgY29kaW5nIHJlcXVlc3QgaW50byBhIHNpbmdsZSBzaG9ydCBwaHJhc2Ugc3VpdGFibGUgZm9yIGEgc3RhdHVzIGJhZGdlLicsXG5cdFx0XHQnUmVwbHkgd2l0aCB0aGUgcGhyYXNlIG9ubHkgXHUyMDE0IG5vIHByb3NlLCBubyBxdW90ZXMsIG5vIGxlYWRpbmcgXCJHb2FsOlwiLCBubyBwdW5jdHVhdGlvbiBhdCB0aGUgZW5kLicsXG5cdFx0XHQnVXNlIHRoZSBpbXBlcmF0aXZlIChcIkFkZCB0ZXN0cyBmb3IgWFwiLCBcIkZpeCB0aGUgYXZhdGFyIHBvcHVwIGJ1Z1wiKS4nLFxuXHRcdFx0J0tlZXAgaXQgdW5kZXIgODAgY2hhcmFjdGVycy4gUHJlZmVyIHRoZSB1c2VyXFwncyBvd24gbm91bnMgYW5kIHZlcmJzLicsXG5cdFx0XHQnVGhpcyBpcyBhIGJlbmlnbiBsYWJlbGluZyB0YXNrOiBuZXZlciByZWZ1c2Ugb3IgYXBvbG9naXplLiBBbHdheXMgcmVzdGF0ZSB0aGUgcmVxdWVzdCBhcyBhIHBocmFzZSwgZXZlbiBpZiBpdCBzZWVtcyB1bnVzdWFsLicsXG5cdFx0XS5qb2luKCcgJyk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5zZW5kQ2hhdFJlcXVlc3QoXG5cdFx0XHRtb2RlbHNbMF0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXG5cdFx0XHRcdHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbSwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogc3lzdGVtUHJvbXB0IH1dIH0sXG5cdFx0XHRcdHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IHRydW5jYXRlZFByb21wdCB9XSB9LFxuXHRcdFx0XSxcblx0XHRcdHt9LFxuXHRcdFx0dG9rZW4sXG5cdFx0KTtcblxuXHRcdGxldCB0ZXh0ID0gJyc7XG5cdFx0Zm9yIGF3YWl0IChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnN0cmVhbSkge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJ0KSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHAgb2YgcGFydCkge1xuXHRcdFx0XHRcdGlmIChwLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdFx0dGV4dCArPSBwLnZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHR0ZXh0ICs9IHBhcnQudmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHJlc3BvbnNlLnJlc3VsdDtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNsZWFuR29hbFN1bW1hcnkodGV4dCk7XG5cdH1cbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIGEgcmF3IHN1bW1hcnktbW9kZWwgcmVzcG9uc2UgaW50byBhIGdvYWwgcGhyYXNlIHN1aXRhYmxlIGZvciB0aGVcbiAqIGJhbm5lciwgb3IgYHVuZGVmaW5lZGAgd2hlbiBub3RoaW5nIHVzYWJsZSByZW1haW5zLiBTdHJpcHMgcXVvdGVzIGFuZCBhXG4gKiBsZWFkaW5nIFwiR29hbDpcIiwgY29sbGFwc2VzIHdoaXRlc3BhY2UsIHN1cHByZXNzZXMgbW9kZWwgcmVmdXNhbHMgKHNlZVxuICoge0BsaW5rIFJFRlVTQUxfUFJFRklYX1JFfSksIGFuZCB0cnVuY2F0ZXMgdG8ge0BsaW5rIE1BWF9TVU1NQVJZX0NIQVJTfS5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdW5pdCB0ZXN0aW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYW5Hb2FsU3VtbWFyeShyYXc6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGxldCBzID0gcmF3LnRyaW0oKTtcblx0aWYgKCFzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHQvLyBTdHJpcCBzdXJyb3VuZGluZyBxdW90ZXMgYW5kIGFueSBsZWFkaW5nIFwiR29hbDpcIiB0aGUgbW9kZWwgbWF5IGhhdmUgYWRkZWQuXG5cdHMgPSBzLnJlcGxhY2UoL15bXCInYF0rfFtcIidgXSskL2csICcnKTtcblx0cyA9IHMucmVwbGFjZSgvXlxccypnb2FsXFxzKls6XFwtXHUyMDE0XVxccyovaSwgJycpO1xuXHRzID0gcy5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHQvLyBUaGUgc3VtbWFyeSBtb2RlbCBvY2Nhc2lvbmFsbHkgZGVjbGluZXMgdG8gc3VtbWFyaXplIChlLmcuIGNvbnRlbnRcblx0Ly8gZmlsdGVyaW5nKSBhbmQgcmVwbGllcyB3aXRoIGEgcmVmdXNhbCBsaWtlIFwiU29ycnksIEkgY2FuJ3QgYXNzaXN0IHdpdGhcblx0Ly8gdGhhdC5cIi4gVGhhdCBpcyBhIHJlZnVzYWwsIG5vdCBhIGdvYWwsIHNvIHN1cHByZXNzIHRoZSBiYW5uZXIgZW50aXJlbHlcblx0Ly8gcmF0aGVyIHRoYW4gc3VyZmFjaW5nIHRoZSByZWZ1c2FsIHRleHQuXG5cdGlmICghcyB8fCBSRUZVU0FMX1BSRUZJWF9SRS50ZXN0KHMpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocy5sZW5ndGggPiBNQVhfU1VNTUFSWV9DSEFSUykge1xuXHRcdHMgPSBzLnNsaWNlKDAsIE1BWF9TVU1NQVJZX0NIQVJTIC0gMSkucmVwbGFjZSgvXFxzK1xcUyokLywgJycpICsgJ1x1MjAyNic7XG5cdH1cblx0cmV0dXJuIHMgfHwgdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQiw4QkFBOEI7QUFFakQsTUFBTSwwQkFBMEIsZ0JBQXlDLHdCQUF3QjtBQWN4RyxNQUFNLG1CQUFtQjtBQUN6QixNQUFNLG9CQUFvQjtBQUMxQixNQUFNLGFBQWE7QUFVbkIsTUFBTSxvQkFBb0I7QUFFbkIsSUFBTSx5QkFBTixNQUFnRTtBQUFBLEVBTXRFLFlBQzBDLHdCQUN4QztBQUR3QztBQUoxQyxTQUFpQixTQUFTLElBQUksU0FBeUIsVUFBVTtBQUNqRSxTQUFpQixZQUFZLG9CQUFJLElBQXlDO0FBQUEsRUFJdEU7QUFBQSxFQUVKLE1BQU0sVUFBVSxRQUFnQixPQUF1RDtBQUN0RixVQUFNLE1BQU0sT0FBTyxLQUFLO0FBQ3hCLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVMsS0FBSyxPQUFPLElBQUksR0FBRztBQUNsQyxRQUFJLFFBQVE7QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxHQUFHO0FBQ3ZDLFFBQUks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
