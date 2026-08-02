import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { cleanRemoteAuthority } from "../../common/telemetryUtils.js";
suite("TelemetryUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("cleanRemoteAuthority", () => {
    test('returns "none" when remoteAuthority is undefined', () => {
      const config = {
        remoteExtensionTips: { "ssh-remote": {} },
        virtualWorkspaceExtensionTips: { "codespaces": {} }
      };
      const result = cleanRemoteAuthority(void 0, config);
      assert.strictEqual(result, "none");
    });
    test("returns remoteName when it exists in remoteExtensionTips", () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {},
          "dev-container": {},
          "wsl": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "ssh-remote");
      assert.strictEqual(cleanRemoteAuthority("dev-container", config), "dev-container");
      assert.strictEqual(cleanRemoteAuthority("wsl", config), "wsl");
    });
    test("returns remoteName when it exists in virtualWorkspaceExtensionTips", () => {
      const config = {
        remoteExtensionTips: {},
        virtualWorkspaceExtensionTips: {
          "codespaces": {},
          "tunnel": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("codespaces", config), "codespaces");
      assert.strictEqual(cleanRemoteAuthority("tunnel", config), "tunnel");
    });
    test('returns "other" when remoteName is not in either config', () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {},
          "dev-container": {}
        },
        virtualWorkspaceExtensionTips: {
          "codespaces": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("unknown-remote", config), "other");
      assert.strictEqual(cleanRemoteAuthority("custom-remote", config), "other");
    });
    test('returns "other" when config is empty', () => {
      const config = {
        remoteExtensionTips: {},
        virtualWorkspaceExtensionTips: {}
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
    });
    test("handles config with undefined remoteExtensionTips", () => {
      const config = {
        virtualWorkspaceExtensionTips: {
          "codespaces": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("codespaces", config), "codespaces");
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
    });
    test("handles config with undefined virtualWorkspaceExtensionTips", () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "ssh-remote");
      assert.strictEqual(cleanRemoteAuthority("codespaces", config), "other");
    });
    test("handles empty config object", () => {
      const config = {};
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
      assert.strictEqual(cleanRemoteAuthority(void 0, config), "none");
    });
    test("handles remoteAuthority with additional path segments", () => {
      const config = {
        remoteExtensionTips: {
          "ssh-remote": {}
        }
      };
      assert.strictEqual(cleanRemoteAuthority("ssh-remote+server1.example.com", config), "ssh-remote");
    });
    test("handles undefined config object", () => {
      const config = void 0;
      assert.strictEqual(cleanRemoteAuthority("ssh-remote", config), "other");
      assert.strictEqual(cleanRemoteAuthority(void 0, config), "none");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RlbGVtZXRyeS90ZXN0L2NvbW1vbi90ZWxlbWV0cnlVdGlscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjbGVhblJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5cbnN1aXRlKCdUZWxlbWV0cnlVdGlscycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnY2xlYW5SZW1vdGVBdXRob3JpdHknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFwibm9uZVwiIHdoZW4gcmVtb3RlQXV0aG9yaXR5IGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHtcblx0XHRcdFx0cmVtb3RlRXh0ZW5zaW9uVGlwczogeyAnc3NoLXJlbW90ZSc6IHt9IH0sXG5cdFx0XHRcdHZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzOiB7ICdjb2Rlc3BhY2VzJzoge30gfVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2xlYW5SZW1vdGVBdXRob3JpdHkodW5kZWZpbmVkLCBjb25maWcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ25vbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcmVtb3RlTmFtZSB3aGVuIGl0IGV4aXN0cyBpbiByZW1vdGVFeHRlbnNpb25UaXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0ge1xuXHRcdFx0XHRyZW1vdGVFeHRlbnNpb25UaXBzOiB7XG5cdFx0XHRcdFx0J3NzaC1yZW1vdGUnOiB7fSxcblx0XHRcdFx0XHQnZGV2LWNvbnRhaW5lcic6IHt9LFxuXHRcdFx0XHRcdCd3c2wnOiB7fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ3NzaC1yZW1vdGUnLCBjb25maWcpLCAnc3NoLXJlbW90ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdkZXYtY29udGFpbmVyJywgY29uZmlnKSwgJ2Rldi1jb250YWluZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnd3NsJywgY29uZmlnKSwgJ3dzbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZW1vdGVOYW1lIHdoZW4gaXQgZXhpc3RzIGluIHZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0ge1xuXHRcdFx0XHRyZW1vdGVFeHRlbnNpb25UaXBzOiB7fSxcblx0XHRcdFx0dmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnY29kZXNwYWNlcyc6IHt9LFxuXHRcdFx0XHRcdCd0dW5uZWwnOiB7fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ2NvZGVzcGFjZXMnLCBjb25maWcpLCAnY29kZXNwYWNlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCd0dW5uZWwnLCBjb25maWcpLCAndHVubmVsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFwib3RoZXJcIiB3aGVuIHJlbW90ZU5hbWUgaXMgbm90IGluIGVpdGhlciBjb25maWcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnc3NoLXJlbW90ZSc6IHt9LFxuXHRcdFx0XHRcdCdkZXYtY29udGFpbmVyJzoge31cblx0XHRcdFx0fSxcblx0XHRcdFx0dmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnY29kZXNwYWNlcyc6IHt9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgndW5rbm93bi1yZW1vdGUnLCBjb25maWcpLCAnb3RoZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnY3VzdG9tLXJlbW90ZScsIGNvbmZpZyksICdvdGhlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBcIm90aGVyXCIgd2hlbiBjb25maWcgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvblRpcHM6IHt9LFxuXHRcdFx0XHR2aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwczoge31cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnc3NoLXJlbW90ZScsIGNvbmZpZyksICdvdGhlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb25maWcgd2l0aCB1bmRlZmluZWQgcmVtb3RlRXh0ZW5zaW9uVGlwcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHtcblx0XHRcdFx0dmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnY29kZXNwYWNlcyc6IHt9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnY29kZXNwYWNlcycsIGNvbmZpZyksICdjb2Rlc3BhY2VzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ3NzaC1yZW1vdGUnLCBjb25maWcpLCAnb3RoZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgY29uZmlnIHdpdGggdW5kZWZpbmVkIHZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0ge1xuXHRcdFx0XHRyZW1vdGVFeHRlbnNpb25UaXBzOiB7XG5cdFx0XHRcdFx0J3NzaC1yZW1vdGUnOiB7fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ3NzaC1yZW1vdGUnLCBjb25maWcpLCAnc3NoLXJlbW90ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdjb2Rlc3BhY2VzJywgY29uZmlnKSwgJ290aGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IGNvbmZpZyBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuUmVtb3RlQXV0aG9yaXR5KCdzc2gtcmVtb3RlJywgY29uZmlnKSwgJ290aGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkodW5kZWZpbmVkLCBjb25maWcpLCAnbm9uZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyByZW1vdGVBdXRob3JpdHkgd2l0aCBhZGRpdGlvbmFsIHBhdGggc2VnbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvblRpcHM6IHtcblx0XHRcdFx0XHQnc3NoLXJlbW90ZSc6IHt9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIGdldFJlbW90ZU5hbWUgc2hvdWxkIGV4dHJhY3QganVzdCB0aGUgYXV0aG9yaXR5IG5hbWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSgnc3NoLXJlbW90ZStzZXJ2ZXIxLmV4YW1wbGUuY29tJywgY29uZmlnKSwgJ3NzaC1yZW1vdGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgdW5kZWZpbmVkIGNvbmZpZyBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB1bmRlZmluZWQhO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5SZW1vdGVBdXRob3JpdHkoJ3NzaC1yZW1vdGUnLCBjb25maWcpLCAnb3RoZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhblJlbW90ZUF1dGhvcml0eSh1bmRlZmluZWQsIGNvbmZpZyksICdub25lJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7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
