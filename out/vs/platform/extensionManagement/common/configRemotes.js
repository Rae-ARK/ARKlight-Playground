import { URI } from "../../../base/common/uri.js";
const SshProtocolMatcher = /^([^@:]+@)?([^:]+):/;
const SshUrlMatcher = /^([^@:]+@)?([^:]+):(.+)$/;
const AuthorityMatcher = /^([^@]+@)?([^:]+)(:\d+)?$/;
const SecondLevelDomainMatcher = /([^@:.]+\.[^@:.]+)(:\d+)?$/;
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
const AnyButDot = /[^.]/g;
const AllowedSecondLevelDomains = [
  "github.com",
  "bitbucket.org",
  "visualstudio.com",
  "gitlab.com",
  "heroku.com",
  "azurewebsites.net",
  "ibm.com",
  "amazon.com",
  "amazonaws.com",
  "cloudapp.net",
  "rhcloud.com",
  "google.com",
  "azure.com"
];
function stripLowLevelDomains(domain) {
  const match = domain.match(SecondLevelDomainMatcher);
  return match ? match[1] : null;
}
function extractDomain(url) {
  if (url.indexOf("://") === -1) {
    const match = url.match(SshProtocolMatcher);
    if (match) {
      return stripLowLevelDomains(match[2]);
    } else {
      return null;
    }
  }
  try {
    const uri = URI.parse(url);
    if (uri.authority) {
      return stripLowLevelDomains(uri.authority);
    }
  } catch (e) {
  }
  return null;
}
function getDomainsOfRemotes(text, allowedDomains) {
  const domains = /* @__PURE__ */ new Set();
  let match;
  while (match = RemoteMatcher.exec(text)) {
    const domain = extractDomain(match[1]);
    if (domain) {
      domains.add(domain);
    }
  }
  const allowedDomainsSet = new Set(allowedDomains);
  return Array.from(domains).map((key) => allowedDomainsSet.has(key) ? key : key.replace(AnyButDot, "a"));
}
function stripPort(authority) {
  const match = authority.match(AuthorityMatcher);
  return match ? match[2] : null;
}
function normalizeRemote(host, path, stripEndingDotGit) {
  if (host && path) {
    if (stripEndingDotGit && path.endsWith(".git")) {
      path = path.substr(0, path.length - 4);
    }
    return path.indexOf("/") === 0 ? `${host}${path}` : `${host}/${path}`;
  }
  return null;
}
function extractRemote(url, stripEndingDotGit) {
  if (url.indexOf("://") === -1) {
    const match = url.match(SshUrlMatcher);
    if (match) {
      return normalizeRemote(match[2], match[3], stripEndingDotGit);
    }
  }
  try {
    const uri = URI.parse(url);
    if (uri.authority) {
      return normalizeRemote(stripPort(uri.authority), uri.path, stripEndingDotGit);
    }
  } catch (e) {
  }
  return null;
}
function getRemotes(text, stripEndingDotGit = false) {
  const remotes = [];
  let match;
  while (match = RemoteMatcher.exec(text)) {
    const remote = extractRemote(match[1], stripEndingDotGit);
    if (remote) {
      remotes.push(remote);
    }
  }
  return remotes;
}
export {
  AllowedSecondLevelDomains,
  getDomainsOfRemotes,
  getRemotes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2NvbmZpZ1JlbW90ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5jb25zdCBTc2hQcm90b2NvbE1hdGNoZXIgPSAvXihbXkA6XStAKT8oW146XSspOi87XG5jb25zdCBTc2hVcmxNYXRjaGVyID0gL14oW15AOl0rQCk/KFteOl0rKTooLispJC87XG5jb25zdCBBdXRob3JpdHlNYXRjaGVyID0gL14oW15AXStAKT8oW146XSspKDpcXGQrKT8kLztcbmNvbnN0IFNlY29uZExldmVsRG9tYWluTWF0Y2hlciA9IC8oW15AOi5dK1xcLlteQDouXSspKDpcXGQrKT8kLztcbmNvbnN0IFJlbW90ZU1hdGNoZXIgPSAvXlxccyp1cmxcXHMqPVxccyooLitcXFMpXFxzKiQvbWc7XG5jb25zdCBBbnlCdXREb3QgPSAvW14uXS9nO1xuXG5leHBvcnQgY29uc3QgQWxsb3dlZFNlY29uZExldmVsRG9tYWlucyA9IFtcblx0J2dpdGh1Yi5jb20nLFxuXHQnYml0YnVja2V0Lm9yZycsXG5cdCd2aXN1YWxzdHVkaW8uY29tJyxcblx0J2dpdGxhYi5jb20nLFxuXHQnaGVyb2t1LmNvbScsXG5cdCdhenVyZXdlYnNpdGVzLm5ldCcsXG5cdCdpYm0uY29tJyxcblx0J2FtYXpvbi5jb20nLFxuXHQnYW1hem9uYXdzLmNvbScsXG5cdCdjbG91ZGFwcC5uZXQnLFxuXHQncmhjbG91ZC5jb20nLFxuXHQnZ29vZ2xlLmNvbScsXG5cdCdhenVyZS5jb20nXG5dO1xuXG5mdW5jdGlvbiBzdHJpcExvd0xldmVsRG9tYWlucyhkb21haW46IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRjb25zdCBtYXRjaCA9IGRvbWFpbi5tYXRjaChTZWNvbmRMZXZlbERvbWFpbk1hdGNoZXIpO1xuXHRyZXR1cm4gbWF0Y2ggPyBtYXRjaFsxXSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3REb21haW4odXJsOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0aWYgKHVybC5pbmRleE9mKCc6Ly8nKSA9PT0gLTEpIHtcblx0XHRjb25zdCBtYXRjaCA9IHVybC5tYXRjaChTc2hQcm90b2NvbE1hdGNoZXIpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHN0cmlwTG93TGV2ZWxEb21haW5zKG1hdGNoWzJdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHVybCk7XG5cdFx0aWYgKHVyaS5hdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBzdHJpcExvd0xldmVsRG9tYWlucyh1cmkuYXV0aG9yaXR5KTtcblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHQvLyBpZ25vcmUgaW52YWxpZCBVUklzXG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREb21haW5zT2ZSZW1vdGVzKHRleHQ6IHN0cmluZywgYWxsb3dlZERvbWFpbnM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRjb25zdCBkb21haW5zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0d2hpbGUgKG1hdGNoID0gUmVtb3RlTWF0Y2hlci5leGVjKHRleHQpKSB7XG5cdFx0Y29uc3QgZG9tYWluID0gZXh0cmFjdERvbWFpbihtYXRjaFsxXSk7XG5cdFx0aWYgKGRvbWFpbikge1xuXHRcdFx0ZG9tYWlucy5hZGQoZG9tYWluKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBhbGxvd2VkRG9tYWluc1NldCA9IG5ldyBTZXQoYWxsb3dlZERvbWFpbnMpO1xuXHRyZXR1cm4gQXJyYXkuZnJvbShkb21haW5zKVxuXHRcdC5tYXAoa2V5ID0+IGFsbG93ZWREb21haW5zU2V0LmhhcyhrZXkpID8ga2V5IDoga2V5LnJlcGxhY2UoQW55QnV0RG90LCAnYScpKTtcbn1cblxuZnVuY3Rpb24gc3RyaXBQb3J0KGF1dGhvcml0eTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdGNvbnN0IG1hdGNoID0gYXV0aG9yaXR5Lm1hdGNoKEF1dGhvcml0eU1hdGNoZXIpO1xuXHRyZXR1cm4gbWF0Y2ggPyBtYXRjaFsyXSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVJlbW90ZShob3N0OiBzdHJpbmcgfCBudWxsLCBwYXRoOiBzdHJpbmcsIHN0cmlwRW5kaW5nRG90R2l0OiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG5cdGlmIChob3N0ICYmIHBhdGgpIHtcblx0XHRpZiAoc3RyaXBFbmRpbmdEb3RHaXQgJiYgcGF0aC5lbmRzV2l0aCgnLmdpdCcpKSB7XG5cdFx0XHRwYXRoID0gcGF0aC5zdWJzdHIoMCwgcGF0aC5sZW5ndGggLSA0KTtcblx0XHR9XG5cdFx0cmV0dXJuIChwYXRoLmluZGV4T2YoJy8nKSA9PT0gMCkgPyBgJHtob3N0fSR7cGF0aH1gIDogYCR7aG9zdH0vJHtwYXRofWA7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RSZW1vdGUodXJsOiBzdHJpbmcsIHN0cmlwRW5kaW5nRG90R2l0OiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG5cdGlmICh1cmwuaW5kZXhPZignOi8vJykgPT09IC0xKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB1cmwubWF0Y2goU3NoVXJsTWF0Y2hlcik7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplUmVtb3RlKG1hdGNoWzJdLCBtYXRjaFszXSwgc3RyaXBFbmRpbmdEb3RHaXQpO1xuXHRcdH1cblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdGlmICh1cmkuYXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplUmVtb3RlKHN0cmlwUG9ydCh1cmkuYXV0aG9yaXR5KSwgdXJpLnBhdGgsIHN0cmlwRW5kaW5nRG90R2l0KTtcblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHQvLyBpZ25vcmUgaW52YWxpZCBVUklzXG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZW1vdGVzKHRleHQ6IHN0cmluZywgc3RyaXBFbmRpbmdEb3RHaXQ6IGJvb2xlYW4gPSBmYWxzZSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVtb3Rlczogc3RyaW5nW10gPSBbXTtcblx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHR3aGlsZSAobWF0Y2ggPSBSZW1vdGVNYXRjaGVyLmV4ZWModGV4dCkpIHtcblx0XHRjb25zdCByZW1vdGUgPSBleHRyYWN0UmVtb3RlKG1hdGNoWzFdLCBzdHJpcEVuZGluZ0RvdEdpdCk7XG5cdFx0aWYgKHJlbW90ZSkge1xuXHRcdFx0cmVtb3Rlcy5wdXNoKHJlbW90ZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZW1vdGVzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXO0FBRXBCLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sZ0JBQWdCO0FBQ3RCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0sZ0JBQWdCO0FBQ3RCLE1BQU0sWUFBWTtBQUVYLE1BQU0sNEJBQTRCO0FBQUEsRUFDeEM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRDtBQUVBLFNBQVMscUJBQXFCLFFBQStCO0FBQzVELFFBQU0sUUFBUSxPQUFPLE1BQU0sd0JBQXdCO0FBQ25ELFNBQU8sUUFBUSxNQUFNLENBQUMsSUFBSTtBQUMzQjtBQUVBLFNBQVMsY0FBYyxLQUE0QjtBQUNsRCxNQUFJLElBQUksUUFBUSxLQUFLLE1BQU0sSUFBSTtBQUM5QixVQUFNLFFBQVEsSUFBSSxNQUFNLGtCQUFrQjtBQUMxQyxRQUFJLE9BQU87QUFDVixhQUFPLHFCQUFxQixNQUFNLENBQUMsQ0FBQztBQUFBLElBQ3JDLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxNQUFJO0FBQ0gsVUFBTSxNQUFNLElBQUksTUFBTSxHQUFHO0FBQ3pCLFFBQUksSUFBSSxXQUFXO0FBQ2xCLGFBQU8scUJBQXFCLElBQUksU0FBUztBQUFBLElBQzFDO0FBQUEsRUFDRCxTQUFTLEdBQUc7QUFBQSxFQUVaO0FBQ0EsU0FBTztBQUNSO0FBRU8sU0FBUyxvQkFBb0IsTUFBYyxnQkFBNkM7QUFDOUYsUUFBTSxVQUFVLG9CQUFJLElBQVk7QUFDaEMsTUFBSTtBQUNKLFNBQU8sUUFBUSxjQUFjLEtBQUssSUFBSSxHQUFHO0FBQ3hDLFVBQU0sU0FBUyxjQUFjLE1BQU0sQ0FBQyxDQUFDO0FBQ3JDLFFBQUksUUFBUTtBQUNYLGNBQVEsSUFBSSxNQUFNO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBRUEsUUFBTSxvQkFBb0IsSUFBSSxJQUFJLGNBQWM7QUFDaEQsU0FBTyxNQUFNLEtBQUssT0FBTyxFQUN2QixJQUFJLFNBQU8sa0JBQWtCLElBQUksR0FBRyxJQUFJLE1BQU0sSUFBSSxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzVFO0FBRUEsU0FBUyxVQUFVLFdBQWtDO0FBQ3BELFFBQU0sUUFBUSxVQUFVLE1BQU0sZ0JBQWdCO0FBQzlDLFNBQU8sUUFBUSxNQUFNLENBQUMsSUFBSTtBQUMzQjtBQUVBLFNBQVMsZ0JBQWdCLE1BQXFCLE1BQWMsbUJBQTJDO0FBQ3RHLE1BQUksUUFBUSxNQUFNO0FBQ2pCLFFBQUkscUJBQXFCLEtBQUssU0FBUyxNQUFNLEdBQUc7QUFDL0MsYUFBTyxLQUFLLE9BQU8sR0FBRyxLQUFLLFNBQVMsQ0FBQztBQUFBLElBQ3RDO0FBQ0EsV0FBUSxLQUFLLFFBQVEsR0FBRyxNQUFNLElBQUssR0FBRyxJQUFJLEdBQUcsSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLElBQUk7QUFBQSxFQUN0RTtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsY0FBYyxLQUFhLG1CQUEyQztBQUM5RSxNQUFJLElBQUksUUFBUSxLQUFLLE1BQU0sSUFBSTtBQUM5QixVQUFNLFFBQVEsSUFBSSxNQUFNLGFBQWE7QUFDckMsUUFBSSxPQUFPO0FBQ1YsYUFBTyxnQkFBZ0IsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsaUJBQWlCO0FBQUEsSUFDN0Q7QUFBQSxFQUNEO0FBQ0EsTUFBSTtBQUNILFVBQU0sTUFBTSxJQUFJLE1BQU0sR0FBRztBQUN6QixRQUFJLElBQUksV0FBVztBQUNsQixhQUFPLGdCQUFnQixVQUFVLElBQUksU0FBUyxHQUFHLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUM3RTtBQUFBLEVBQ0QsU0FBUyxHQUFHO0FBQUEsRUFFWjtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsV0FBVyxNQUFjLG9CQUE2QixPQUFpQjtBQUN0RixRQUFNLFVBQW9CLENBQUM7QUFDM0IsTUFBSTtBQUNKLFNBQU8sUUFBUSxjQUFjLEtBQUssSUFBSSxHQUFHO0FBQ3hDLFVBQU0sU0FBUyxjQUFjLE1BQU0sQ0FBQyxHQUFHLGlCQUFpQjtBQUN4RCxRQUFJLFFBQVE7QUFDWCxjQUFRLEtBQUssTUFBTTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
