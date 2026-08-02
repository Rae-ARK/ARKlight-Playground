import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { lookupKerberosAuthorization, nodeRequest } from "../../node/requestService.js";
import { isWindows } from "../../../../base/common/platform.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
suite("Request Service", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  (isWindows ? test : test.skip)("Kerberos lookup", async () => {
    try {
      const logService = store.add(new NullLogService());
      const response = await lookupKerberosAuthorization("http://localhost:9999", void 0, logService, "requestService.test.ts");
      assert.ok(response);
    } catch (err) {
      assert.ok(
        err?.message?.includes("No authority could be contacted for authentication") || err?.message?.includes("No Kerberos credentials available") || err?.message?.includes("No credentials are available in the security package") || err?.message?.includes("no credential for"),
        `Unexpected error: ${err}`
      );
    }
  });
  test("Request cancellation during retry backoff", async () => {
    const cts = store.add(new CancellationTokenSource());
    let attemptCount = 0;
    const mockRawRequest = (_opts, _callback) => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => {
              handler(err);
              cts.cancel();
            }, 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "GET",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.cancellation"
      }, cts.token);
      assert.fail("Request should have been cancelled");
    } catch (err) {
      assert.ok(err instanceof CancellationError, "Error should be a CancellationError");
    }
    assert.strictEqual(attemptCount, 1, "Request should be cancelled during backoff without further retries");
  });
  test("should retry GET requests on transient errors", async () => {
    let attemptCount = 0;
    const mockRawRequest = (_opts, callback) => {
      attemptCount++;
      const currentAttempt = attemptCount;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error" && currentAttempt < 3) {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
          if (currentAttempt >= 3) {
            setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => {
            }, pipe: () => ({ on: () => {
            } }) }), 0);
          }
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "GET",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.retryGET"
      }, CancellationToken.None);
    } catch (err) {
    }
    assert.ok(attemptCount > 1, "GET request should have been retried");
  });
  test("should NOT retry POST requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "POST",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryPOST"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "POST request should not have been retried");
  });
  test("should retry HEAD requests on transient errors", async () => {
    let attemptCount = 0;
    const mockRawRequest = (_opts, callback) => {
      attemptCount++;
      const currentAttempt = attemptCount;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error" && currentAttempt < 3) {
            const err = new Error("Host unreachable");
            err.code = "EHOSTUNREACH";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
          if (currentAttempt >= 3) {
            setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => {
            }, pipe: () => ({ on: () => {
            } }) }), 0);
          }
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "HEAD",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.retryHEAD"
      }, CancellationToken.None);
    } catch (err) {
    }
    assert.ok(attemptCount > 1, "HEAD request should have been retried");
  });
  test("should retry OPTIONS requests on transient errors", async () => {
    let attemptCount = 0;
    const mockRawRequest = (_opts, callback) => {
      attemptCount++;
      const currentAttempt = attemptCount;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error" && currentAttempt < 3) {
            const err = new Error("Network unreachable");
            err.code = "ENETUNREACH";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
          if (currentAttempt >= 3) {
            setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => {
            }, pipe: () => ({ on: () => {
            } }) }), 0);
          }
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "OPTIONS",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.retryOPTIONS"
      }, CancellationToken.None);
    } catch (err) {
    }
    assert.ok(attemptCount > 1, "OPTIONS request should have been retried");
  });
  test("should NOT retry DELETE requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "DELETE",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryDELETE"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "DELETE request should not have been retried");
  });
  test("should NOT retry PUT requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "PUT",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryPUT"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "PUT request should not have been retried");
  });
  test("should NOT retry PATCH requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "PATCH",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryPATCH"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "PATCH request should not have been retried");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3JlcXVlc3QvdGVzdC9ub2RlL3JlcXVlc3RTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVJhd1JlcXVlc3RGdW5jdGlvbiwgbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uLCBub2RlUmVxdWVzdCB9IGZyb20gJy4uLy4uL25vZGUvcmVxdWVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuc3VpdGUoJ1JlcXVlc3QgU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBLZXJiZXJvcyBtb2R1bGUgZmFpbHMgdG8gbG9hZCBvbiBsb2NhbCBtYWNPUyBhbmQgTGludXggQ0kuXG5cdChpc1dpbmRvd3MgPyB0ZXN0IDogdGVzdC5za2lwKSgnS2VyYmVyb3MgbG9va3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2dTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uKCdodHRwOi8vbG9jYWxob3N0Ojk5OTknLCB1bmRlZmluZWQsIGxvZ1NlcnZpY2UsICdyZXF1ZXN0U2VydmljZS50ZXN0LnRzJyk7XG5cdFx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRlcnI/Lm1lc3NhZ2U/LmluY2x1ZGVzKCdObyBhdXRob3JpdHkgY291bGQgYmUgY29udGFjdGVkIGZvciBhdXRoZW50aWNhdGlvbicpXG5cdFx0XHRcdHx8IGVycj8ubWVzc2FnZT8uaW5jbHVkZXMoJ05vIEtlcmJlcm9zIGNyZWRlbnRpYWxzIGF2YWlsYWJsZScpXG5cdFx0XHRcdHx8IGVycj8ubWVzc2FnZT8uaW5jbHVkZXMoJ05vIGNyZWRlbnRpYWxzIGFyZSBhdmFpbGFibGUgaW4gdGhlIHNlY3VyaXR5IHBhY2thZ2UnKVxuXHRcdFx0XHR8fCBlcnI/Lm1lc3NhZ2U/LmluY2x1ZGVzKCdubyBjcmVkZW50aWFsIGZvcicpXG5cdFx0XHRcdCwgYFVuZXhwZWN0ZWQgZXJyb3I6ICR7ZXJyfWApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnUmVxdWVzdCBjYW5jZWxsYXRpb24gZHVyaW5nIHJldHJ5IGJhY2tvZmYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9IChfb3B0czogYW55LCBfY2FsbGJhY2s6IEZ1bmN0aW9uKSA9PiB7XG5cdFx0XHRhdHRlbXB0Q291bnQrKztcblx0XHRcdGNvbnN0IG1vY2tSZXE6IHVua25vd24gPSB7XG5cdFx0XHRcdG9uOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdlcnJvcicpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiByZWZ1c2VkJykgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0XHRcdFx0ZXJyLmNvZGUgPSAnRUNPTk5SRUZVU0VEJztcblx0XHRcdFx0XHRcdC8vIEZhaWwgdGhlIGZpcnN0IGF0dGVtcHQgd2l0aCBhIHRyYW5zaWVudCBlcnJvciwgdGhlbiBjYW5jZWwgd2hpbGUgdGhlXG5cdFx0XHRcdFx0XHQvLyByZXRyeSBiYWNrb2ZmIGlzIHBlbmRpbmcgc28gY2FuY2VsbGF0aW9uIGlzIG9ic2VydmVkIGR1cmluZyB0aGUgYmFja29mZi5cblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRoYW5kbGVyKGVycik7XG5cdFx0XHRcdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdH0sIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGFib3J0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFRpbWVvdXQ6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBtb2NrUmVxO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbm9kZVJlcXVlc3Qoe1xuXHRcdFx0XHR1cmw6ICdodHRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0Z2V0UmF3UmVxdWVzdDogKCkgPT4gbW9ja1Jhd1JlcXVlc3QgYXMgSVJhd1JlcXVlc3RGdW5jdGlvbixcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0LmNhbmNlbGxhdGlvbidcblx0XHRcdH0sIGN0cy50b2tlbik7XG5cdFx0XHRhc3NlcnQuZmFpbCgnUmVxdWVzdCBzaG91bGQgaGF2ZSBiZWVuIGNhbmNlbGxlZCcpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0Lm9rKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yLCAnRXJyb3Igc2hvdWxkIGJlIGEgQ2FuY2VsbGF0aW9uRXJyb3InKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0ZW1wdENvdW50LCAxLCAnUmVxdWVzdCBzaG91bGQgYmUgY2FuY2VsbGVkIGR1cmluZyBiYWNrb2ZmIHdpdGhvdXQgZnVydGhlciByZXRyaWVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXRyeSBHRVQgcmVxdWVzdHMgb24gdHJhbnNpZW50IGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9IChfb3B0czogYW55LCBjYWxsYmFjazogRnVuY3Rpb24pID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgY3VycmVudEF0dGVtcHQgPSBhdHRlbXB0Q291bnQ7XG5cdFx0XHRjb25zdCBtb2NrUmVxOiBhbnkgPSB7XG5cdFx0XHRcdG9uOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdlcnJvcicgJiYgY3VycmVudEF0dGVtcHQgPCAzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VDT05OUkVGVVNFRCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoY3VycmVudEF0dGVtcHQgPj0gMykge1xuXHRcdFx0XHRcdFx0Ly8gU3VjY2VlZCBvbiB0aGlyZCBhdHRlbXB0IGJ5IGNhbGxpbmcgdGhlIHJlc3BvbnNlIGNhbGxiYWNrXG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGNhbGxiYWNrKHsgc3RhdHVzQ29kZTogMjAwLCBoZWFkZXJzOiB7fSwgb246ICgpID0+IHsgfSwgcGlwZTogKCkgPT4gKHsgb246ICgpID0+IHsgfSB9KSB9KSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhYm9ydDogKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRUaW1lb3V0OiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbW9ja1JlcTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5vZGVSZXF1ZXN0KHtcblx0XHRcdFx0dXJsOiAnaHR0cDovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHRcdGdldFJhd1JlcXVlc3Q6ICgpID0+IG1vY2tSYXdSZXF1ZXN0IGFzIElSYXdSZXF1ZXN0RnVuY3Rpb24sXG5cdFx0XHRcdGNhbGxTaXRlOiAncmVxdWVzdFNlcnZpY2UudGVzdC5yZXRyeUdFVCdcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgdG8gZXZlbnR1YWxseSBzdWNjZWVkIG9yIGZhaWwgYWZ0ZXIgcmV0cmllc1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhhdHRlbXB0Q291bnQgPiAxLCAnR0VUIHJlcXVlc3Qgc2hvdWxkIGhhdmUgYmVlbiByZXRyaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBOT1QgcmV0cnkgUE9TVCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9ICgpID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgbW9ja1JlcTogYW55ID0ge1xuXHRcdFx0XHRvbjogKGV2ZW50OiBzdHJpbmcsIGhhbmRsZXI6IEZ1bmN0aW9uKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VDT05OUkVGVVNFRCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHsgfSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdFx0Z2V0UmF3UmVxdWVzdDogKCkgPT4gbW9ja1Jhd1JlcXVlc3QsXG5cdFx0XHRcdGNhbGxTaXRlOiAncmVxdWVzdFNlcnZpY2UudGVzdC5ub1JldHJ5UE9TVCdcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBoYXZlIHRocm93biBhbiBlcnJvcicpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0Lm9rKGVyciBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0ZW1wdENvdW50LCAxLCAnUE9TVCByZXF1ZXN0IHNob3VsZCBub3QgaGF2ZSBiZWVuIHJldHJpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHJ5IEhFQUQgcmVxdWVzdHMgb24gdHJhbnNpZW50IGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9IChfb3B0czogYW55LCBjYWxsYmFjazogRnVuY3Rpb24pID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgY3VycmVudEF0dGVtcHQgPSBhdHRlbXB0Q291bnQ7XG5cdFx0XHRjb25zdCBtb2NrUmVxOiBhbnkgPSB7XG5cdFx0XHRcdG9uOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdlcnJvcicgJiYgY3VycmVudEF0dGVtcHQgPCAzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0hvc3QgdW5yZWFjaGFibGUnKSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG5cdFx0XHRcdFx0XHRlcnIuY29kZSA9ICdFSE9TVFVOUkVBQ0gnO1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBoYW5kbGVyKGVyciksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kOiAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRBdHRlbXB0ID49IDMpIHtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gY2FsbGJhY2soeyBzdGF0dXNDb2RlOiAyMDAsIGhlYWRlcnM6IHt9LCBvbjogKCkgPT4geyB9LCBwaXBlOiAoKSA9PiAoeyBvbjogKCkgPT4geyB9IH0pIH0pLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFib3J0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFRpbWVvdXQ6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBtb2NrUmVxO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbm9kZVJlcXVlc3Qoe1xuXHRcdFx0XHR1cmw6ICdodHRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0eXBlOiAnSEVBRCcsXG5cdFx0XHRcdGdldFJhd1JlcXVlc3Q6ICgpID0+IG1vY2tSYXdSZXF1ZXN0IGFzIElSYXdSZXF1ZXN0RnVuY3Rpb24sXG5cdFx0XHRcdGNhbGxTaXRlOiAncmVxdWVzdFNlcnZpY2UudGVzdC5yZXRyeUhFQUQnXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIEV4cGVjdGVkIHRvIGV2ZW50dWFsbHkgc3VjY2VlZCBvciBmYWlsIGFmdGVyIHJldHJpZXNcblx0XHR9XG5cblx0XHRhc3NlcnQub2soYXR0ZW1wdENvdW50ID4gMSwgJ0hFQUQgcmVxdWVzdCBzaG91bGQgaGF2ZSBiZWVuIHJldHJpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHJ5IE9QVElPTlMgcmVxdWVzdHMgb24gdHJhbnNpZW50IGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9IChfb3B0czogYW55LCBjYWxsYmFjazogRnVuY3Rpb24pID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgY3VycmVudEF0dGVtcHQgPSBhdHRlbXB0Q291bnQ7XG5cdFx0XHRjb25zdCBtb2NrUmVxOiBhbnkgPSB7XG5cdFx0XHRcdG9uOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdlcnJvcicgJiYgY3VycmVudEF0dGVtcHQgPCAzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ05ldHdvcmsgdW5yZWFjaGFibGUnKSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG5cdFx0XHRcdFx0XHRlcnIuY29kZSA9ICdFTkVUVU5SRUFDSCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoY3VycmVudEF0dGVtcHQgPj0gMykge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBjYWxsYmFjayh7IHN0YXR1c0NvZGU6IDIwMCwgaGVhZGVyczoge30sIG9uOiAoKSA9PiB7IH0sIHBpcGU6ICgpID0+ICh7IG9uOiAoKSA9PiB7IH0gfSkgfSksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdPUFRJT05TJyxcblx0XHRcdFx0Z2V0UmF3UmVxdWVzdDogKCkgPT4gbW9ja1Jhd1JlcXVlc3QgYXMgSVJhd1JlcXVlc3RGdW5jdGlvbixcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0LnJldHJ5T1BUSU9OUydcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgdG8gZXZlbnR1YWxseSBzdWNjZWVkIG9yIGZhaWwgYWZ0ZXIgcmV0cmllc1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhhdHRlbXB0Q291bnQgPiAxLCAnT1BUSU9OUyByZXF1ZXN0IHNob3VsZCBoYXZlIGJlZW4gcmV0cmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgTk9UIHJldHJ5IERFTEVURSByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9ICgpID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgbW9ja1JlcTogYW55ID0ge1xuXHRcdFx0XHRvbjogKGV2ZW50OiBzdHJpbmcsIGhhbmRsZXI6IEZ1bmN0aW9uKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VDT05OUkVGVVNFRCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHsgfSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdERUxFVEUnLFxuXHRcdFx0XHRnZXRSYXdSZXF1ZXN0OiAoKSA9PiBtb2NrUmF3UmVxdWVzdCxcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0Lm5vUmV0cnlERUxFVEUnXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgaGF2ZSB0aHJvd24gYW4gZXJyb3InKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5vayhlcnIgaW5zdGFuY2VvZiBFcnJvcik7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGVtcHRDb3VudCwgMSwgJ0RFTEVURSByZXF1ZXN0IHNob3VsZCBub3QgaGF2ZSBiZWVuIHJldHJpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIE5PVCByZXRyeSBQVVQgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGF0dGVtcHRDb3VudCA9IDA7XG5cdFx0Y29uc3QgbW9ja1Jhd1JlcXVlc3QgPSAoKSA9PiB7XG5cdFx0XHRhdHRlbXB0Q291bnQrKztcblx0XHRcdGNvbnN0IG1vY2tSZXE6IGFueSA9IHtcblx0XHRcdFx0b246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdDb25uZWN0aW9uIHJlZnVzZWQnKSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG5cdFx0XHRcdFx0XHRlcnIuY29kZSA9ICdFQ09OTlJFRlVTRUQnO1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBoYW5kbGVyKGVyciksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGFib3J0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFRpbWVvdXQ6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBtb2NrUmVxO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbm9kZVJlcXVlc3Qoe1xuXHRcdFx0XHR1cmw6ICdodHRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0eXBlOiAnUFVUJyxcblx0XHRcdFx0Z2V0UmF3UmVxdWVzdDogKCkgPT4gbW9ja1Jhd1JlcXVlc3QsXG5cdFx0XHRcdGNhbGxTaXRlOiAncmVxdWVzdFNlcnZpY2UudGVzdC5ub1JldHJ5UFVUJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGhhdmUgdGhyb3duIGFuIGVycm9yJyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRlbXB0Q291bnQsIDEsICdQVVQgcmVxdWVzdCBzaG91bGQgbm90IGhhdmUgYmVlbiByZXRyaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBOT1QgcmV0cnkgUEFUQ0ggcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGF0dGVtcHRDb3VudCA9IDA7XG5cdFx0Y29uc3QgbW9ja1Jhd1JlcXVlc3QgPSAoKSA9PiB7XG5cdFx0XHRhdHRlbXB0Q291bnQrKztcblx0XHRcdGNvbnN0IG1vY2tSZXE6IGFueSA9IHtcblx0XHRcdFx0b246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdDb25uZWN0aW9uIHJlZnVzZWQnKSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG5cdFx0XHRcdFx0XHRlcnIuY29kZSA9ICdFQ09OTlJFRlVTRUQnO1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBoYW5kbGVyKGVyciksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGFib3J0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFRpbWVvdXQ6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBtb2NrUmVxO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbm9kZVJlcXVlc3Qoe1xuXHRcdFx0XHR1cmw6ICdodHRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0eXBlOiAnUEFUQ0gnLFxuXHRcdFx0XHRnZXRSYXdSZXF1ZXN0OiAoKSA9PiBtb2NrUmF3UmVxdWVzdCxcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0Lm5vUmV0cnlQQVRDSCdcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBoYXZlIHRocm93biBhbiBlcnJvcicpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0Lm9rKGVyciBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0ZW1wdENvdW50LCAxLCAnUEFUQ0ggcmVxdWVzdCBzaG91bGQgbm90IGhhdmUgYmVlbiByZXRyaWVkJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBOEIsNkJBQTZCLG1CQUFtQjtBQUM5RSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFt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
