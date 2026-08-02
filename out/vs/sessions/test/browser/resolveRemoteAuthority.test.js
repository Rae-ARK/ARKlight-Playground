import assert from "assert";
import { decodeHex } from "../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { getEntryAddress, RemoteAgentHostEntryType } from "../../../platform/agentHost/common/remoteAgentHostService.js";
import { resolveRemoteAuthority, sshAuthorityString } from "../../browser/openInVSCodeUtils.js";
suite("resolveRemoteAuthority", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeProvidersService(remoteAddress) {
    return {
      getProvider: (id) => remoteAddress ? { id, remoteAddress } : void 0
    };
  }
  function makeRemoteAgentHostService(entries = []) {
    return {
      getEntryByAddress: (address) => entries.find((e) => getEntryAddress(e) === address)
    };
  }
  test("returns undefined for a local provider", () => {
    const result = resolveRemoteAuthority(
      "local-provider",
      makeProvidersService(void 0),
      makeRemoteAgentHostService()
    );
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when provider has no remoteAddress", () => {
    const noRemoteProviders = {
      getProvider: (id) => ({
        id
        /* no remoteAddress */
      })
    };
    const result = resolveRemoteAuthority(
      "agenthost-no-address",
      noRemoteProviders,
      makeRemoteAgentHostService()
    );
    assert.strictEqual(result, void 0);
  });
  test("returns ssh-remote authority for SSH with sshConfigHost", () => {
    const result = resolveRemoteAuthority(
      "agenthost-myserver",
      makeProvidersService("localhost:4321"),
      makeRemoteAgentHostService([{
        name: "My Server",
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: "localhost:4321",
          sshConfigHost: "my-ssh-host",
          hostName: "myserver.example.com"
        }
      }])
    );
    assert.strictEqual(result, "ssh-remote+my-ssh-host");
  });
  test("returns ssh-remote with simple hostName for SSH without sshConfigHost", () => {
    const result = resolveRemoteAuthority(
      "agenthost-myserver",
      makeProvidersService("localhost:4321"),
      makeRemoteAgentHostService([{
        name: "My Server",
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: "localhost:4321",
          hostName: "myserver"
        }
      }])
    );
    assert.strictEqual(result, "ssh-remote+myserver");
  });
  test("returns ssh-remote with hex-encoded authority for SSH with user and port", () => {
    const result = resolveRemoteAuthority(
      "agenthost-myserver",
      makeProvidersService("localhost:4321"),
      makeRemoteAgentHostService([{
        name: "My Server",
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: "localhost:4321",
          hostName: "myserver.example.com",
          user: "admin",
          port: 2222
        }
      }])
    );
    assert.ok(result?.startsWith("ssh-remote+"));
    const authority = result.slice("ssh-remote+".length);
    const decoded = decodeHex(authority).toString();
    assert.deepStrictEqual(JSON.parse(decoded), {
      hostName: "myserver.example.com",
      user: "admin",
      port: 2222
    });
  });
  test("returns tunnel authority using label", () => {
    const result = resolveRemoteAuthority(
      "agenthost-tunnel",
      makeProvidersService("tunnel:myTunnelId"),
      makeRemoteAgentHostService([{
        name: "My Tunnel",
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId: "myTunnelId",
          clusterId: "usw2",
          label: "my-machine"
        }
      }])
    );
    assert.strictEqual(result, "tunnel+my-machine");
  });
  test("returns tunnel authority falling back to tunnelId when no label", () => {
    const result = resolveRemoteAuthority(
      "agenthost-tunnel",
      makeProvidersService("tunnel:myTunnelId"),
      makeRemoteAgentHostService([{
        name: "My Tunnel",
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId: "myTunnelId",
          clusterId: "usw2"
        }
      }])
    );
    assert.strictEqual(result, "tunnel+myTunnelId.usw2");
  });
  test("returns undefined for WebSocket connections", () => {
    const result = resolveRemoteAuthority(
      "agenthost-ws",
      makeProvidersService("myhost:4321"),
      makeRemoteAgentHostService([{
        name: "WS Host",
        connection: {
          type: RemoteAgentHostEntryType.WebSocket,
          address: "myhost:4321"
        }
      }])
    );
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when no matching entry found", () => {
    const result = resolveRemoteAuthority(
      "agenthost-missing",
      makeProvidersService("unknown-address:9999"),
      makeRemoteAgentHostService([{
        name: "Other",
        connection: {
          type: RemoteAgentHostEntryType.WebSocket,
          address: "different-address:1234"
        }
      }])
    );
    assert.strictEqual(result, void 0);
  });
});
suite("sshAuthorityString", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hex-encodes when user is present", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "myserver",
      user: "admin"
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), { hostName: "myserver", user: "admin" });
  });
  test("hex-encodes when port is present", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "myserver",
      port: 2222
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), { hostName: "myserver", port: 2222 });
  });
  test("hex-encodes when hostName has uppercase letters", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "MyServer"
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), { hostName: "MyServer" });
  });
  test("hex-encodes with all fields", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "MyServer.example.com",
      user: "root",
      port: 22
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), {
      hostName: "MyServer.example.com",
      user: "root",
      port: 22
    });
  });
  test("uses hostName directly when address differs", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "actualhost"
    });
    assert.strictEqual(result, "actualhost");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci9yZXNvbHZlUmVtb3RlQXV0aG9yaXR5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBkZWNvZGVIZXggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0RW50cnksIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBnZXRFbnRyeUFkZHJlc3MsIFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlUmVtb3RlQXV0aG9yaXR5LCBzc2hBdXRob3JpdHlTdHJpbmcgfSBmcm9tICcuLi8uLi9icm93c2VyL29wZW5JblZTQ29kZVV0aWxzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5cbnN1aXRlKCdyZXNvbHZlUmVtb3RlQXV0aG9yaXR5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VQcm92aWRlcnNTZXJ2aWNlKHJlbW90ZUFkZHJlc3M/OiBzdHJpbmcpOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0UHJvdmlkZXI6IChpZDogc3RyaW5nKSA9PiByZW1vdGVBZGRyZXNzID8geyBpZCwgcmVtb3RlQWRkcmVzcyB9IDogdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOyAvLyBuby1hcy1hbnkganVzdGlmaWNhdGlvbjogbGlnaHR3ZWlnaHQgdGVzdCBtb2NrIGZvciBhIG11bHRpLW1ldGhvZCBzZXJ2aWNlIGludGVyZmFjZVxuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoZW50cmllczogSVJlbW90ZUFnZW50SG9zdEVudHJ5W10gPSBbXSk6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0RW50cnlCeUFkZHJlc3M6IChhZGRyZXNzOiBzdHJpbmcpID0+IGVudHJpZXMuZmluZChlID0+IGdldEVudHJ5QWRkcmVzcyhlKSA9PT0gYWRkcmVzcyksXG5cdFx0fSBhcyB1bmtub3duIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOyAvLyBuby1hcy1hbnkganVzdGlmaWNhdGlvbjogbGlnaHR3ZWlnaHQgdGVzdCBtb2NrIGZvciBhIG11bHRpLW1ldGhvZCBzZXJ2aWNlIGludGVyZmFjZVxuXHR9XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgbG9jYWwgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdsb2NhbC1wcm92aWRlcicsXG5cdFx0XHRtYWtlUHJvdmlkZXJzU2VydmljZSh1bmRlZmluZWQpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBwcm92aWRlciBoYXMgbm8gcmVtb3RlQWRkcmVzcycsICgpID0+IHtcblx0XHRjb25zdCBub1JlbW90ZVByb3ZpZGVycyA9IHtcblx0XHRcdGdldFByb3ZpZGVyOiAoaWQ6IHN0cmluZykgPT4gKHsgaWQgLyogbm8gcmVtb3RlQWRkcmVzcyAqLyB9KSxcblx0XHR9IGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZTsgLy8gbm8tYXMtYW55IGp1c3RpZmljYXRpb246IGxpZ2h0d2VpZ2h0IHRlc3QgbW9jayBmb3IgYSBtdWx0aS1tZXRob2Qgc2VydmljZSBpbnRlcmZhY2Vcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlUmVtb3RlQXV0aG9yaXR5KFxuXHRcdFx0J2FnZW50aG9zdC1uby1hZGRyZXNzJyxcblx0XHRcdG5vUmVtb3RlUHJvdmlkZXJzLFxuXHRcdFx0bWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoKSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgc3NoLXJlbW90ZSBhdXRob3JpdHkgZm9yIFNTSCB3aXRoIHNzaENvbmZpZ0hvc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3QtbXlzZXJ2ZXInLFxuXHRcdFx0bWFrZVByb3ZpZGVyc1NlcnZpY2UoJ2xvY2FsaG9zdDo0MzIxJykgYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRcdG1ha2VSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKFt7XG5cdFx0XHRcdG5hbWU6ICdNeSBTZXJ2ZXInLFxuXHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRcdHNzaENvbmZpZ0hvc3Q6ICdteS1zc2gtaG9zdCcsXG5cdFx0XHRcdFx0aG9zdE5hbWU6ICdteXNlcnZlci5leGFtcGxlLmNvbScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSkgYXMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnc3NoLXJlbW90ZStteS1zc2gtaG9zdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHNzaC1yZW1vdGUgd2l0aCBzaW1wbGUgaG9zdE5hbWUgZm9yIFNTSCB3aXRob3V0IHNzaENvbmZpZ0hvc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3QtbXlzZXJ2ZXInLFxuXHRcdFx0bWFrZVByb3ZpZGVyc1NlcnZpY2UoJ2xvY2FsaG9zdDo0MzIxJykgYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRcdG1ha2VSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKFt7XG5cdFx0XHRcdG5hbWU6ICdNeSBTZXJ2ZXInLFxuXHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3NzaC1yZW1vdGUrbXlzZXJ2ZXInKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBzc2gtcmVtb3RlIHdpdGggaGV4LWVuY29kZWQgYXV0aG9yaXR5IGZvciBTU0ggd2l0aCB1c2VyIGFuZCBwb3J0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVSZW1vdGVBdXRob3JpdHkoXG5cdFx0XHQnYWdlbnRob3N0LW15c2VydmVyJyxcblx0XHRcdG1ha2VQcm92aWRlcnNTZXJ2aWNlKCdsb2NhbGhvc3Q6NDMyMScpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZShbe1xuXHRcdFx0XHRuYW1lOiAnTXkgU2VydmVyJyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdFx0XHRob3N0TmFtZTogJ215c2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0XHR1c2VyOiAnYWRtaW4nLFxuXHRcdFx0XHRcdHBvcnQ6IDIyMjIsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSkgYXMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0KTtcblx0XHRhc3NlcnQub2socmVzdWx0Py5zdGFydHNXaXRoKCdzc2gtcmVtb3RlKycpKTtcblx0XHQvLyBUaGUgYXV0aG9yaXR5IHNob3VsZCBiZSBoZXgtZW5jb2RlZCBKU09OXG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gcmVzdWx0IS5zbGljZSgnc3NoLXJlbW90ZSsnLmxlbmd0aCk7XG5cdFx0Y29uc3QgZGVjb2RlZCA9IGRlY29kZUhleChhdXRob3JpdHkpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGRlY29kZWQpLCB7XG5cdFx0XHRob3N0TmFtZTogJ215c2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdHVzZXI6ICdhZG1pbicsXG5cdFx0XHRwb3J0OiAyMjIyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHR1bm5lbCBhdXRob3JpdHkgdXNpbmcgbGFiZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3QtdHVubmVsJyxcblx0XHRcdG1ha2VQcm92aWRlcnNTZXJ2aWNlKCd0dW5uZWw6bXlUdW5uZWxJZCcpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZShbe1xuXHRcdFx0XHRuYW1lOiAnTXkgVHVubmVsJyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5UdW5uZWwsXG5cdFx0XHRcdFx0dHVubmVsSWQ6ICdteVR1bm5lbElkJyxcblx0XHRcdFx0XHRjbHVzdGVySWQ6ICd1c3cyJyxcblx0XHRcdFx0XHRsYWJlbDogJ215LW1hY2hpbmUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3R1bm5lbCtteS1tYWNoaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdHVubmVsIGF1dGhvcml0eSBmYWxsaW5nIGJhY2sgdG8gdHVubmVsSWQgd2hlbiBubyBsYWJlbCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlUmVtb3RlQXV0aG9yaXR5KFxuXHRcdFx0J2FnZW50aG9zdC10dW5uZWwnLFxuXHRcdFx0bWFrZVByb3ZpZGVyc1NlcnZpY2UoJ3R1bm5lbDpteVR1bm5lbElkJykgYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRcdG1ha2VSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKFt7XG5cdFx0XHRcdG5hbWU6ICdNeSBUdW5uZWwnLFxuXHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlR1bm5lbCxcblx0XHRcdFx0XHR0dW5uZWxJZDogJ215VHVubmVsSWQnLFxuXHRcdFx0XHRcdGNsdXN0ZXJJZDogJ3VzdzInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3R1bm5lbCtteVR1bm5lbElkLnVzdzInKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIFdlYlNvY2tldCBjb25uZWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlUmVtb3RlQXV0aG9yaXR5KFxuXHRcdFx0J2FnZW50aG9zdC13cycsXG5cdFx0XHRtYWtlUHJvdmlkZXJzU2VydmljZSgnbXlob3N0OjQzMjEnKSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0bWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoW3tcblx0XHRcdFx0bmFtZTogJ1dTIEhvc3QnLFxuXHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCxcblx0XHRcdFx0XHRhZGRyZXNzOiAnbXlob3N0OjQzMjEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBtYXRjaGluZyBlbnRyeSBmb3VuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlUmVtb3RlQXV0aG9yaXR5KFxuXHRcdFx0J2FnZW50aG9zdC1taXNzaW5nJyxcblx0XHRcdG1ha2VQcm92aWRlcnNTZXJ2aWNlKCd1bmtub3duLWFkZHJlc3M6OTk5OScpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZShbe1xuXHRcdFx0XHRuYW1lOiAnT3RoZXInLFxuXHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCxcblx0XHRcdFx0XHRhZGRyZXNzOiAnZGlmZmVyZW50LWFkZHJlc3M6MTIzNCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSkgYXMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc3NoQXV0aG9yaXR5U3RyaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2hleC1lbmNvZGVzIHdoZW4gdXNlciBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNzaEF1dGhvcml0eVN0cmluZyh7XG5cdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXInLFxuXHRcdFx0dXNlcjogJ2FkbWluJyxcblx0XHR9KTtcblx0XHRjb25zdCBkZWNvZGVkID0gZGVjb2RlSGV4KHJlc3VsdCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoZGVjb2RlZCksIHsgaG9zdE5hbWU6ICdteXNlcnZlcicsIHVzZXI6ICdhZG1pbicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hleC1lbmNvZGVzIHdoZW4gcG9ydCBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNzaEF1dGhvcml0eVN0cmluZyh7XG5cdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXInLFxuXHRcdFx0cG9ydDogMjIyMixcblx0XHR9KTtcblx0XHRjb25zdCBkZWNvZGVkID0gZGVjb2RlSGV4KHJlc3VsdCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoZGVjb2RlZCksIHsgaG9zdE5hbWU6ICdteXNlcnZlcicsIHBvcnQ6IDIyMjIgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hleC1lbmNvZGVzIHdoZW4gaG9zdE5hbWUgaGFzIHVwcGVyY2FzZSBsZXR0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNzaEF1dGhvcml0eVN0cmluZyh7XG5cdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdGhvc3ROYW1lOiAnTXlTZXJ2ZXInLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGRlY29kZWQgPSBkZWNvZGVIZXgocmVzdWx0KS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShkZWNvZGVkKSwgeyBob3N0TmFtZTogJ015U2VydmVyJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnaGV4LWVuY29kZXMgd2l0aCBhbGwgZmllbGRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNzaEF1dGhvcml0eVN0cmluZyh7XG5cdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdGhvc3ROYW1lOiAnTXlTZXJ2ZXIuZXhhbXBsZS5jb20nLFxuXHRcdFx0dXNlcjogJ3Jvb3QnLFxuXHRcdFx0cG9ydDogMjIsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVjb2RlZCA9IGRlY29kZUhleChyZXN1bHQpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGRlY29kZWQpLCB7XG5cdFx0XHRob3N0TmFtZTogJ015U2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdHVzZXI6ICdyb290Jyxcblx0XHRcdHBvcnQ6IDIyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGhvc3ROYW1lIGRpcmVjdGx5IHdoZW4gYWRkcmVzcyBkaWZmZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNzaEF1dGhvcml0eVN0cmluZyh7XG5cdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdGhvc3ROYW1lOiAnYWN0dWFsaG9zdCcsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2FjdHVhbGhvc3QnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtD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
