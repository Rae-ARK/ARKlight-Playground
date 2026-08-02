import { bufferToStream, VSBuffer } from "../../../common/buffer.js";
import { canceled } from "../../../common/errors.js";
import { OfflineError } from "./request.js";
async function request(options, token, isOnline) {
  if (token.isCancellationRequested) {
    throw canceled();
  }
  const cancellation = new AbortController();
  const disposable = token.onCancellationRequested(() => cancellation.abort());
  const signal = options.timeout ? AbortSignal.any([
    cancellation.signal,
    AbortSignal.timeout(options.timeout)
  ]) : cancellation.signal;
  try {
    const fetchInit = {
      method: options.type || "GET",
      headers: getRequestHeaders(options),
      body: options.data,
      signal
    };
    if (options.disableCache) {
      fetchInit.cache = "no-store";
    }
    const res = await fetch(options.url || "", fetchInit);
    return {
      res: {
        statusCode: res.status,
        headers: getResponseHeaders(res)
      },
      stream: bufferToStream(VSBuffer.wrap(new Uint8Array(await res.arrayBuffer())))
    };
  } catch (err) {
    if (isOnline && !isOnline()) {
      throw new OfflineError();
    }
    if (err?.name === "AbortError") {
      throw canceled();
    }
    if (err?.name === "TimeoutError") {
      throw new Error(`Fetch timeout: ${options.timeout}ms`);
    }
    throw err;
  } finally {
    disposable.dispose();
  }
}
function getRequestHeaders(options) {
  if (options.headers || options.user || options.password || options.proxyAuthorization) {
    const headers = new Headers();
    outer: for (const k in options.headers) {
      switch (k.toLowerCase()) {
        case "user-agent":
        case "accept-encoding":
        case "content-length":
          continue outer;
      }
      const header = options.headers[k];
      if (typeof header === "string") {
        headers.set(k, header);
      } else if (Array.isArray(header)) {
        for (const h of header) {
          headers.append(k, h);
        }
      }
    }
    if (options.user || options.password) {
      headers.set("Authorization", "Basic " + btoa(`${options.user || ""}:${options.password || ""}`));
    }
    if (options.proxyAuthorization) {
      headers.set("Proxy-Authorization", options.proxyAuthorization);
    }
    return headers;
  }
  return void 0;
}
function getResponseHeaders(res) {
  const headers = /* @__PURE__ */ Object.create(null);
  res.headers.forEach((value, key) => {
    if (headers[key]) {
      if (Array.isArray(headers[key])) {
        headers[key].push(value);
      } else {
        headers[key] = [headers[key], value];
      }
    } else {
      headers[key] = value;
    }
  });
  return headers;
}
export {
  request
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdEltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjYW5jZWxlZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMsIElSZXF1ZXN0Q29udGV4dCwgSVJlcXVlc3RPcHRpb25zLCBPZmZsaW5lRXJyb3IgfSBmcm9tICcuL3JlcXVlc3QuanMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVxdWVzdChvcHRpb25zOiBJUmVxdWVzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgaXNPbmxpbmU/OiAoKSA9PiBib29sZWFuKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0fVxuXG5cdGNvbnN0IGNhbmNlbGxhdGlvbiA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0Y29uc3QgZGlzcG9zYWJsZSA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGNhbmNlbGxhdGlvbi5hYm9ydCgpKTtcblx0Y29uc3Qgc2lnbmFsID0gb3B0aW9ucy50aW1lb3V0ID8gQWJvcnRTaWduYWwuYW55KFtcblx0XHRjYW5jZWxsYXRpb24uc2lnbmFsLFxuXHRcdEFib3J0U2lnbmFsLnRpbWVvdXQob3B0aW9ucy50aW1lb3V0KSxcblx0XSkgOiBjYW5jZWxsYXRpb24uc2lnbmFsO1xuXG5cdHRyeSB7XG5cdFx0Y29uc3QgZmV0Y2hJbml0OiBSZXF1ZXN0SW5pdCA9IHtcblx0XHRcdG1ldGhvZDogb3B0aW9ucy50eXBlIHx8ICdHRVQnLFxuXHRcdFx0aGVhZGVyczogZ2V0UmVxdWVzdEhlYWRlcnMob3B0aW9ucyksXG5cdFx0XHRib2R5OiBvcHRpb25zLmRhdGEsXG5cdFx0XHRzaWduYWxcblx0XHR9O1xuXHRcdGlmIChvcHRpb25zLmRpc2FibGVDYWNoZSkge1xuXHRcdFx0ZmV0Y2hJbml0LmNhY2hlID0gJ25vLXN0b3JlJztcblx0XHR9XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2gob3B0aW9ucy51cmwgfHwgJycsIGZldGNoSW5pdCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlczoge1xuXHRcdFx0XHRzdGF0dXNDb2RlOiByZXMuc3RhdHVzLFxuXHRcdFx0XHRoZWFkZXJzOiBnZXRSZXNwb25zZUhlYWRlcnMocmVzKSxcblx0XHRcdH0sXG5cdFx0XHRzdHJlYW06IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoYXdhaXQgcmVzLmFycmF5QnVmZmVyKCkpKSksXG5cdFx0fTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0aWYgKGlzT25saW5lICYmICFpc09ubGluZSgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgT2ZmbGluZUVycm9yKCk7XG5cdFx0fVxuXHRcdGlmIChlcnI/Lm5hbWUgPT09ICdBYm9ydEVycm9yJykge1xuXHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHR9XG5cdFx0aWYgKGVycj8ubmFtZSA9PT0gJ1RpbWVvdXRFcnJvcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmV0Y2ggdGltZW91dDogJHtvcHRpb25zLnRpbWVvdXR9bXNgKTtcblx0XHR9XG5cdFx0dGhyb3cgZXJyO1xuXHR9IGZpbmFsbHkge1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVlc3RIZWFkZXJzKG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucykge1xuXHRpZiAob3B0aW9ucy5oZWFkZXJzIHx8IG9wdGlvbnMudXNlciB8fCBvcHRpb25zLnBhc3N3b3JkIHx8IG9wdGlvbnMucHJveHlBdXRob3JpemF0aW9uKSB7XG5cdFx0Y29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKCk7XG5cdFx0b3V0ZXI6IGZvciAoY29uc3QgayBpbiBvcHRpb25zLmhlYWRlcnMpIHtcblx0XHRcdHN3aXRjaCAoay50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRcdGNhc2UgJ3VzZXItYWdlbnQnOlxuXHRcdFx0XHRjYXNlICdhY2NlcHQtZW5jb2RpbmcnOlxuXHRcdFx0XHRjYXNlICdjb250ZW50LWxlbmd0aCc6XG5cdFx0XHRcdFx0Ly8gdW5zYWZlIGhlYWRlcnNcblx0XHRcdFx0XHRjb250aW51ZSBvdXRlcjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhlYWRlciA9IG9wdGlvbnMuaGVhZGVyc1trXTtcblx0XHRcdGlmICh0eXBlb2YgaGVhZGVyID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRoZWFkZXJzLnNldChrLCBoZWFkZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGhlYWRlcikpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBoIG9mIGhlYWRlcikge1xuXHRcdFx0XHRcdGhlYWRlcnMuYXBwZW5kKGssIGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnVzZXIgfHwgb3B0aW9ucy5wYXNzd29yZCkge1xuXHRcdFx0aGVhZGVycy5zZXQoJ0F1dGhvcml6YXRpb24nLCAnQmFzaWMgJyArIGJ0b2EoYCR7b3B0aW9ucy51c2VyIHx8ICcnfToke29wdGlvbnMucGFzc3dvcmQgfHwgJyd9YCkpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5wcm94eUF1dGhvcml6YXRpb24pIHtcblx0XHRcdGhlYWRlcnMuc2V0KCdQcm94eS1BdXRob3JpemF0aW9uJywgb3B0aW9ucy5wcm94eUF1dGhvcml6YXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gaGVhZGVycztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRSZXNwb25zZUhlYWRlcnMocmVzOiBSZXNwb25zZSk6IElIZWFkZXJzIHtcblx0Y29uc3QgaGVhZGVyczogSUhlYWRlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRyZXMuaGVhZGVycy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0aWYgKGhlYWRlcnNba2V5XSkge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoaGVhZGVyc1trZXldKSkge1xuXHRcdFx0XHRoZWFkZXJzW2tleV0ucHVzaCh2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoZWFkZXJzW2tleV0gPSBbaGVhZGVyc1trZXldLCB2YWx1ZV07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhlYWRlcnNba2V5XSA9IHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBoZWFkZXJzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0IsZ0JBQWdCO0FBRXpDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXFELG9CQUFvQjtBQUV6RSxlQUFzQixRQUFRLFNBQTBCLE9BQTBCLFVBQW9EO0FBQ3JJLE1BQUksTUFBTSx5QkFBeUI7QUFDbEMsVUFBTSxTQUFTO0FBQUEsRUFDaEI7QUFFQSxRQUFNLGVBQWUsSUFBSSxnQkFBZ0I7QUFDekMsUUFBTSxhQUFhLE1BQU0sd0JBQXdCLE1BQU0sYUFBYSxNQUFNLENBQUM7QUFDM0UsUUFBTSxTQUFTLFFBQVEsVUFBVSxZQUFZLElBQUk7QUFBQSxJQUNoRCxhQUFhO0FBQUEsSUFDYixZQUFZLFFBQVEsUUFBUSxPQUFPO0FBQUEsRUFDcEMsQ0FBQyxJQUFJLGFBQWE7QUFFbEIsTUFBSTtBQUNILFVBQU0sWUFBeUI7QUFBQSxNQUM5QixRQUFRLFFBQVEsUUFBUTtBQUFBLE1BQ3hCLFNBQVMsa0JBQWtCLE9BQU87QUFBQSxNQUNsQyxNQUFNLFFBQVE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUNBLFFBQUksUUFBUSxjQUFjO0FBQ3pCLGdCQUFVLFFBQVE7QUFBQSxJQUNuQjtBQUNBLFVBQU0sTUFBTSxNQUFNLE1BQU0sUUFBUSxPQUFPLElBQUksU0FBUztBQUNwRCxXQUFPO0FBQUEsTUFDTixLQUFLO0FBQUEsUUFDSixZQUFZLElBQUk7QUFBQSxRQUNoQixTQUFTLG1CQUFtQixHQUFHO0FBQUEsTUFDaEM7QUFBQSxNQUNBLFFBQVEsZUFBZSxTQUFTLEtBQUssSUFBSSxXQUFXLE1BQU0sSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDOUU7QUFBQSxFQUNELFNBQVMsS0FBSztBQUNiLFFBQUksWUFBWSxDQUFDLFNBQVMsR0FBRztBQUM1QixZQUFNLElBQUksYUFBYTtBQUFBLElBQ3hCO0FBQ0EsUUFBSSxLQUFLLFNBQVMsY0FBYztBQUMvQixZQUFNLFNBQVM7QUFBQSxJQUNoQjtBQUNBLFFBQUksS0FBSyxTQUFTLGdCQUFnQjtBQUNqQyxZQUFNLElBQUksTUFBTSxrQkFBa0IsUUFBUSxPQUFPLElBQUk7QUFBQSxJQUN0RDtBQUNBLFVBQU07QUFBQSxFQUNQLFVBQUU7QUFDRCxlQUFXLFFBQVE7QUFBQSxFQUNwQjtBQUNEO0FBRUEsU0FBUyxrQkFBa0IsU0FBMEI7QUFDcEQsTUFBSSxRQUFRLFdBQVcsUUFBUSxRQUFRLFFBQVEsWUFBWSxRQUFRLG9CQUFvQjtBQUN0RixVQUFNLFVBQVUsSUFBSSxRQUFRO0FBQzVCLFVBQU8sWUFBVyxLQUFLLFFBQVEsU0FBUztBQUN2QyxjQUFRLEVBQUUsWUFBWSxHQUFHO0FBQUEsUUFDeEIsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUVKLG1CQUFTO0FBQUEsTUFDWDtBQUNBLFlBQU0sU0FBUyxRQUFRLFFBQVEsQ0FBQztBQUNoQyxVQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLGdCQUFRLElBQUksR0FBRyxNQUFNO0FBQUEsTUFDdEIsV0FBVyxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQ2pDLG1CQUFXLEtBQUssUUFBUTtBQUN2QixrQkFBUSxPQUFPLEdBQUcsQ0FBQztBQUFBLFFBQ3BCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLFFBQVEsUUFBUSxRQUFRLFVBQVU7QUFDckMsY0FBUSxJQUFJLGlCQUFpQixXQUFXLEtBQUssR0FBRyxRQUFRLFFBQVEsRUFBRSxJQUFJLFFBQVEsWUFBWSxFQUFFLEVBQUUsQ0FBQztBQUFBLElBQ2hHO0FBQ0EsUUFBSSxRQUFRLG9CQUFvQjtBQUMvQixjQUFRLElBQUksdUJBQXVCLFFBQVEsa0JBQWtCO0FBQUEsSUFDOUQ7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsbUJBQW1CLEtBQXlCO0FBQ3BELFFBQU0sVUFBb0IsdUJBQU8sT0FBTyxJQUFJO0FBQzVDLE1BQUksUUFBUSxRQUFRLENBQUMsT0FBTyxRQUFRO0FBQ25DLFFBQUksUUFBUSxHQUFHLEdBQUc7QUFDakIsVUFBSSxNQUFNLFFBQVEsUUFBUSxHQUFHLENBQUMsR0FBRztBQUNoQyxnQkFBUSxHQUFHLEVBQUUsS0FBSyxLQUFLO0FBQUEsTUFDeEIsT0FBTztBQUNOLGdCQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLEtBQUs7QUFBQSxNQUNwQztBQUFBLElBQ0QsT0FBTztBQUNOLGNBQVEsR0FBRyxJQUFJO0FBQUEsSUFDaEI7QUFBQSxFQUNELENBQUM7QUFDRCxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
