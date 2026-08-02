import { stringHash } from "../../../base/common/hash.js";
import { buildIdJagExchangeBody, buildResourceRedemptionBody, fetchAuthorizationServerMetadata, getClaimsFromJWT, isAuthorizationTokenResponse } from "../../../base/common/oauth.js";
const IDP_SCOPES = ["openid", "offline_access"];
function cacheKey(resource, scopes) {
  return resource + "|" + [...scopes].sort().join(" ");
}
function isExpired(entry, now = Date.now()) {
  if (entry.token.expires_in === void 0) {
    return false;
  }
  return now > entry.created_at + entry.token.expires_in * 1e3 - 6e4;
}
function XaaifyAuthProvider(Base) {
  return class XaaAuthenticationProvider extends Base {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args) {
      super(...args);
      this._resourceTokens = /* @__PURE__ */ new Map();
      /**
       * Per-(resource, client_id) client secrets. Lazily populated via the main-thread
       * prompt. Keyed by both the resource indicator and the client_id because two
       * different resources may legitimately share a client_id but require different
       * secrets — keying by client_id alone could send the wrong secret to the wrong AS.
       */
      this._resourceClientSecrets = /* @__PURE__ */ new Map();
      const issuer = this.authorizationServer;
      this.id = `xaa:${issuer.toString(true)}`;
      this._logger.trace(`[XAA] Provider constructed for issuer ${issuer.toString(true)}. authorization_endpoint=${this._serverMetadata.authorization_endpoint}, token_endpoint=${this._serverMetadata.token_endpoint}`);
    }
    /** Compound key for {@link _resourceClientSecrets}, matching main-thread secret storage scoping. */
    _resourceClientSecretKey(resource, clientId) {
      return `${resource}|${clientId}`;
    }
    async getSessions(scopes, options) {
      const resource = options.resource;
      const audience = options.audience;
      if (!scopes && !resource && !audience) {
        return super.getSessions(scopes, options);
      }
      if (!resource || !scopes || !audience) {
        return [];
      }
      const key = cacheKey(resource, scopes);
      const entry = this._resourceTokens.get(key);
      if (entry && !isExpired(entry)) {
        return [toSession(entry.token, entry.scopes, entry.account)];
      }
      if (entry) {
        this._resourceTokens.delete(key);
      }
      const idpSession = await this._tryGetSilentIdpSession();
      if (!idpSession?.idToken) {
        return [];
      }
      try {
        const minted = await this._mintResourceToken(
          idpSession,
          [...scopes],
          audience,
          resource,
          options,
          /* silent */
          true
        );
        if (!minted) {
          return [];
        }
        return [toSession(minted.token, minted.scopes, minted.account)];
      } catch (err) {
        this._logger.warn(`[XAA] Silent token mint failed for resource=${resource}; falling back to interactive. Error: ${err.message}`);
        return [];
      }
    }
    async createSession(scopes, options) {
      const audience = options.audience;
      const resource = options.resource;
      this._logger.trace(`[XAA] createSession scopes=[${scopes.join(" ")}] audience=${audience} resource=${resource}`);
      if (!audience) {
        throw new Error("Enterprise-managed authentication requires `options.audience` (the resource's authorization server URL) but none was provided.");
      }
      if (!resource) {
        throw new Error("Enterprise-managed authentication requires `options.resource` (the resource indicator / MCP server URL) but none was provided.");
      }
      const idpSession = await this._ensureIdpSession();
      if (!idpSession.idToken) {
        throw new Error("IdP session is missing an id_token; the issuer must support OpenID Connect and the `openid` scope.");
      }
      const minted = await this._mintResourceToken(
        idpSession,
        scopes,
        audience,
        resource,
        options,
        /* silent */
        false
      );
      if (!minted) {
        throw new Error("Failed to mint a resource access token for the enterprise-managed MCP server.");
      }
      return toSession(minted.token, minted.scopes, minted.account);
    }
    /**
     * Mints a resource-scoped access token by running legs 2-4 of the XAA flow:
     *   2. Exchange IdP id_token → ID-JAG (RFC 8693 token exchange at issuer)
     *   3. Discover the resource AS token endpoint
     *   4. Redeem the ID-JAG at the resource AS for an access token (RFC 7523 jwt-bearer grant)
     *
     * When `silent` is true, this method MUST NOT prompt the user. If the resource AS uses a
     * distinct client_id (xaa.dev's "{client}-at-{resource}" pattern) and no client_secret can
     * be resolved without prompting, this returns `undefined`.
     *
     * Caches the resulting token in `_resourceTokens` so subsequent getSessions are O(1).
     */
    async _mintResourceToken(idpSession, scopes, audience, resource, options, silent) {
      const jag = await this._exchangeForIdJag(idpSession.idToken, audience, resource, scopes);
      const resourceTokenEndpoint = await this._discoverResourceTokenEndpoint(audience);
      let resourceClientId = this._clientId;
      let resourceClientIdFromJag = false;
      const configuredResourceClientId = typeof options.clientId === "string" && options.clientId.length > 0 ? options.clientId : void 0;
      if (configuredResourceClientId) {
        resourceClientId = configuredResourceClientId;
        resourceClientIdFromJag = resourceClientId !== this._clientId;
      } else {
        try {
          const jagClaims = getClaimsFromJWT(jag);
          if (typeof jagClaims.client_id === "string" && jagClaims.client_id.length > 0) {
            resourceClientId = jagClaims.client_id;
            resourceClientIdFromJag = resourceClientId !== this._clientId;
          }
        } catch (err) {
          this._logger.warn(`[XAA] Could not decode ID-JAG to read resource client_id; falling back to IdP client_id. Error: ${err.message}`);
        }
      }
      let resourceClientSecret = this._clientSecret;
      const configuredResourceClientSecret = typeof options.clientSecret === "string" && options.clientSecret.length > 0 ? options.clientSecret : void 0;
      const secretCacheKey = this._resourceClientSecretKey(resource, resourceClientId);
      if (configuredResourceClientSecret) {
        resourceClientSecret = configuredResourceClientSecret;
        this._resourceClientSecrets.set(secretCacheKey, configuredResourceClientSecret);
      } else if (resourceClientIdFromJag) {
        if (this._resourceClientSecrets.has(secretCacheKey)) {
          resourceClientSecret = this._resourceClientSecrets.get(secretCacheKey);
        } else if (silent) {
          this._logger.info(`[XAA] Silent mint requires resource client_secret for '${resourceClientId}' but none is cached or configured; deferring to interactive flow.`);
          return void 0;
        } else {
          this._logger.info(`[XAA] Resource AS requires a distinct client_id '${resourceClientId}' \u2014 prompting for matching client_secret.`);
          const promptedSecret = await this._proxy.$promptForResourceClientSecret(resourceClientId, resource);
          if (promptedSecret === void 0) {
            return void 0;
          }
          this._resourceClientSecrets.set(secretCacheKey, promptedSecret);
          resourceClientSecret = promptedSecret.length > 0 ? promptedSecret : void 0;
        }
      }
      const resourceToken = await this._redeemAtResource(resourceTokenEndpoint, jag, resource, scopes, resourceClientId, resourceClientSecret);
      const entry = {
        resource,
        scopes,
        token: resourceToken,
        // Fallback identity, used when the resource token carries no id_token of its own (the usual case).
        account: idpSession.account,
        created_at: Date.now()
      };
      this._resourceTokens.set(cacheKey(resource, scopes), entry);
      return entry;
    }
    /**
     * Returns the IdP session if one is available without any user interaction, otherwise
     * `undefined`. Critically does NOT call `super.createSession`, so this is safe to use
     * from {@link getSessions}.
     */
    async _tryGetSilentIdpSession() {
      const cleanOptions = {};
      const existing = await super.getSessions(IDP_SCOPES, cleanOptions);
      return existing.length ? existing[0] : void 0;
    }
    async _ensureIdpSession() {
      this._logger.trace(`[XAA] _ensureIdpSession: scopes=[${IDP_SCOPES.join(" ")}] authorization_endpoint=${this._serverMetadata.authorization_endpoint}`);
      const silent = await this._tryGetSilentIdpSession();
      if (silent?.idToken) {
        this._logger.trace(`[XAA] _ensureIdpSession: reusing existing IdP session`);
        return silent;
      }
      this._logger.trace(`[XAA] _ensureIdpSession: creating new IdP session via super.createSession`);
      return super.createSession([...IDP_SCOPES], {});
    }
    async _exchangeForIdJag(idToken, audience, resource, scopes) {
      const tokenEndpoint = this._serverMetadata.token_endpoint;
      if (!tokenEndpoint) {
        throw new Error("Issuer metadata is missing token_endpoint; cannot perform XAA token exchange.");
      }
      const body = buildIdJagExchangeBody(this._clientId, this._clientSecret, idToken, audience, resource, scopes);
      this._logger.trace(`[XAA] POST ${tokenEndpoint} (ID-JAG exchange) audience=${audience} resource=${resource} scope=${scopes.join(" ")}`);
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: body.toString()
      });
      if (!response.ok) {
        throw new Error(`XAA token exchange (IdP) failed: ${response.status} ${await safeText(response)}`);
      }
      const data = await response.json();
      const issued = data && typeof data === "object" && typeof data.access_token === "string" ? data.access_token : void 0;
      if (!issued) {
        throw new Error(`XAA token exchange (IdP) returned no access_token. Response: ${JSON.stringify(data)}`);
      }
      return issued;
    }
    async _discoverResourceTokenEndpoint(audience) {
      const { metadata, errors } = await fetchAuthorizationServerMetadata(audience);
      if (!metadata?.token_endpoint) {
        throw new Error(`Failed to discover resource authorization server metadata for '${audience}': ${errors.map((e) => e.message).join("; ") || "no token_endpoint in metadata"}`);
      }
      return metadata.token_endpoint;
    }
    async _redeemAtResource(tokenEndpoint, idJag, resource, scopes, resourceClientId, resourceClientSecret) {
      const body = buildResourceRedemptionBody(resourceClientId, resourceClientSecret, idJag, resource, scopes);
      this._logger.trace(`[XAA] POST ${tokenEndpoint} (ID-JAG redemption) client_id=${resourceClientId} resource=${resource} scope=${scopes.join(" ")}`);
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: body.toString()
      });
      if (!response.ok) {
        throw new Error(`XAA token exchange (resource) failed: ${response.status} ${await safeText(response)}`);
      }
      const data = await response.json();
      if (!isAuthorizationTokenResponse(data)) {
        throw new Error(`XAA token exchange (resource) returned an invalid token response: ${JSON.stringify(data)}`);
      }
      return data;
    }
  };
}
function toSession(token, scopes, fallbackAccount) {
  let account;
  if (token.id_token) {
    try {
      const claims = getClaimsFromJWT(token.id_token);
      account = {
        id: claims.sub || "unknown",
        label: claims.preferred_username || claims.name || claims.email || "XAA"
      };
    } catch {
    }
  }
  account ??= fallbackAccount ?? { id: "unknown", label: "XAA" };
  return {
    id: stringHash(token.access_token, 0).toString(),
    accessToken: token.access_token,
    account,
    scopes: [...scopes],
    idToken: token.id_token
  };
}
async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}
export {
  IDP_SCOPES,
  XaaifyAuthProvider,
  cacheKey,
  isExpired,
  toSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RYYWFBdXRoUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgc3RyaW5nSGFzaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgYnVpbGRJZEphZ0V4Y2hhbmdlQm9keSwgYnVpbGRSZXNvdXJjZVJlZGVtcHRpb25Cb2R5LCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgZ2V0Q2xhaW1zRnJvbUpXVCwgSUF1dGhvcml6YXRpb25KV1RDbGFpbXMsIElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSwgaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29hdXRoLmpzJztcbmltcG9ydCB7IER5bmFtaWNBdXRoUHJvdmlkZXIgfSBmcm9tICcuL2V4dEhvc3RBdXRoZW50aWNhdGlvbi5qcyc7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG50eXBlIEN0b3I8VD4gPSBuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBUO1xuXG4vKipcbiAqIFNjb3BlcyB1c2VkIHdoZW4gYm9vdHN0cmFwcGluZyB0aGUgSWRQIHNlc3Npb24gZm9yIGFuIFhBQSBmbG93LlxuICpcbiAqIGBvcGVuaWRgIGlzIHJlcXVpcmVkIGJlY2F1c2UgdGhlIElELUpBRyB0b2tlbiBleGNoYW5nZSB1c2VzIHRoZSBJZFAtaXNzdWVkXG4gKiBgaWRfdG9rZW5gIGFzIGBzdWJqZWN0X3Rva2VuYCAocGVyIGRyYWZ0LWlldGYtb2F1dGgtaWRlbnRpdHktYXNzZXJ0aW9uLWF1dGh6LWdyYW50XG4gKiBzZWN0aW9uIDMuMSwgdGhlIHN1YmplY3QgdG9rZW4gTVVTVCBiZSBvZiB0eXBlIGB1cm46aWV0ZjpwYXJhbXM6b2F1dGg6dG9rZW4tdHlwZTppZF90b2tlbmApLlxuICogYG9mZmxpbmVfYWNjZXNzYCBpcyByZXF1ZXN0ZWQgc28gd2UgZ2V0IGEgcmVmcmVzaCB0b2tlbiBmb3IgdGhlIElkUCBzZXNzaW9uLlxuICovXG5leHBvcnQgY29uc3QgSURQX1NDT1BFUzogcmVhZG9ubHkgc3RyaW5nW10gPSBbJ29wZW5pZCcsICdvZmZsaW5lX2FjY2VzcyddO1xuXG5pbnRlcmZhY2UgSVJlc291cmNlQ2FjaGVFbnRyeSB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHRva2VuOiBJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2U7XG5cdC8qKiBGYWxsYmFjayBpZGVudGl0eSAodGhlIElkUCBsb2dpbiBhY2NvdW50KSBmb3Igc2Vzc2lvbnMgYnVpbHQgZnJvbSB0aGlzIHRva2VuLCB1c2VkIHdoZW4gdGhlIHJlc291cmNlIHRva2VuIGhhcyBubyBpZF90b2tlbiBvZiBpdHMgb3duLiAqL1xuXHRyZWFkb25seSBhY2NvdW50OiB2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudEluZm9ybWF0aW9uO1xuXHRyZWFkb25seSBjcmVhdGVkX2F0OiBudW1iZXI7XG59XG5cbi8qKiBDYWNoZSBrZXkgZm9yIHJlc291cmNlLXNjb3BlZCB0b2tlbnMuIEV4cG9ydGVkIGZvciB0ZXN0aW5nLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhY2hlS2V5KHJlc291cmNlOiBzdHJpbmcsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRyZXR1cm4gcmVzb3VyY2UgKyAnfCcgKyBbLi4uc2NvcGVzXS5zb3J0KCkuam9pbignICcpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgY2FjaGVkIHRva2VuIGlzIHBhc3QgKG9yIHdpdGhpbiA2MHMgb2YpIGl0cyBleHBpcnkuIFB1cmVcbiAqIGFuZCBleHBvcnRlZCBmb3IgdGVzdGluZy5cbiAqXG4gKiBNaW50cyBmcmVzaCBJRC1KQUcgYXNzZXJ0aW9ucyBhcmUgdXN1YWxseSBzaG9ydC1saXZlZCAobWludXRlcykuIFdlIHRyZWF0IHRva2VucyBhcyBleHBpcmVkXG4gKiA2MHMgYmVmb3JlIHRoZWlyIG5vbWluYWwgZXhwaXJ5IHRvIGF2b2lkIGNsb2NrIHNrZXcgYW5kIGluLWZsaWdodCByZWRlbXB0aW9ucyByYWNpbmcgcGFzdFxuICogYGV4cGAuIFRva2VucyB3aXRob3V0IGBleHBpcmVzX2luYCBkZWZpbmVkIGFyZSB0cmVhdGVkIGFzIG5ldmVyLWV4cGlyaW5nIChjYWNoZWRcbiAqIHVudGlsIHRoZSBwcm9jZXNzIGV4aXRzKTsgYGV4cGlyZXNfaW46IDBgIGlzIHRyZWF0ZWQgYXMgaW1tZWRpYXRlbHkgZXhwaXJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRXhwaXJlZChlbnRyeTogeyB0b2tlbjogeyBleHBpcmVzX2luPzogbnVtYmVyIH07IGNyZWF0ZWRfYXQ6IG51bWJlciB9LCBub3c6IG51bWJlciA9IERhdGUubm93KCkpOiBib29sZWFuIHtcblx0aWYgKGVudHJ5LnRva2VuLmV4cGlyZXNfaW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gbm93ID4gZW50cnkuY3JlYXRlZF9hdCArIChlbnRyeS50b2tlbi5leHBpcmVzX2luICogMTAwMCkgLSA2MF8wMDA7XG59XG5cbi8qKlxuICogKFByZXZpZXcpIE1peGluIHRoYXQgdHVybnMgYSB7QGxpbmsgRHluYW1pY0F1dGhQcm92aWRlcn0gc3ViY2xhc3MgaW50byBhXG4gKiBDcm9zcyBBcHAgQWNjZXNzIChYQUEpIC8gZW50ZXJwcmlzZS1tYW5hZ2VkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyLCBwZXJcbiAqIGBkcmFmdC1pZXRmLW9hdXRoLWlkZW50aXR5LWFzc2VydGlvbi1hdXRoei1ncmFudGAuXG4gKlxuICogVGhlIElkUCBsb2dpbiBsZWcgaXMgaWRlbnRpY2FsIHRvIHRoZSBiYXNlIGNsYXNzIFx1MjAxNCBBdXRoIENvZGUgKyBQS0NFIGFnYWluc3RcbiAqIHRoZSBvcmctY29uZmlndXJlZCBpc3N1ZXIsIHVzaW5nIHRoZSBwcmUtcmVnaXN0ZXJlZCBjbGllbnQgY3JlZGVudGlhbHMuIE9uXG4gKiB0b3Agb2YgdGhhdDpcbiAqXG4gKiAgIDEuIGBjcmVhdGVTZXNzaW9uYCBlbnN1cmVzIGFuIElkUCBzZXNzaW9uIGV4aXN0cyAoZGVsZWdhdGVkIHRvIHRoZSBiYXNlXG4gKiAgICAgIGNsYXNzIHdpdGgge0BsaW5rIElEUF9TQ09QRVN9KS5cbiAqICAgMi4gSXQgUE9TVHMgdG8gdGhlIElkUCB0b2tlbiBlbmRwb2ludCB3aXRoIGBncmFudF90eXBlPXRva2VuLWV4Y2hhbmdlYCxcbiAqICAgICAgYHN1YmplY3RfdG9rZW49PGlkX3Rva2VuPmAsIGBzdWJqZWN0X3Rva2VuX3R5cGU9aWRfdG9rZW5gLFxuICogICAgICBgcmVxdWVzdGVkX3Rva2VuX3R5cGU9aWQtamFnYCwgYGF1ZGllbmNlPTxyZXNvdXJjZSBBUz5gLFxuICogICAgICBgcmVzb3VyY2U9PHJlc291cmNlIGluZGljYXRvcj5gLCBgc2NvcGU9PHJlcXVlc3RlZCBzY29wZXM+YCB0byBtaW50IGFuXG4gKiAgICAgIElELUpBRy5cbiAqICAgMy4gSXQgZGlzY292ZXJzIHRoZSByZXNvdXJjZSdzIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICh0aGUgYXVkaWVuY2VcbiAqICAgICAgVVJMKSBhbmQgUE9TVHMgdGhlIElELUpBRyB0byBpdHMgdG9rZW4gZW5kcG9pbnQgd2l0aFxuICogICAgICBgZ3JhbnRfdHlwZT11cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTpqd3QtYmVhcmVyYCxcbiAqICAgICAgYGFzc2VydGlvbj08aWQtamFnPmAsIGByZXNvdXJjZT08cmVzb3VyY2UgaW5kaWNhdG9yPmAsXG4gKiAgICAgIGBzY29wZT08cmVxdWVzdGVkIHNjb3Blcz5gIHRvIG9idGFpbiBhIHJlc291cmNlLXNjb3BlZCBhY2Nlc3MgdG9rZW4uXG4gKiAgIDQuIFRoZSByZXNvdXJjZS1zY29wZWQgdG9rZW4gaXMgY2FjaGVkIGluLW1lbW9yeSBwZXIgYChyZXNvdXJjZSwgc2NvcGVzKWBcbiAqICAgICAgYW5kIHJldHVybmVkIGFzIHRoZSBzZXNzaW9uJ3MgYWNjZXNzIHRva2VuLlxuICpcbiAqIFRoZSByZXNvdXJjZSBpbmRpY2F0b3IgaXMgcmVhZCBmcm9tIGBvcHRpb25zLnJlc291cmNlYCAoUkZDIDg3MDcpIGFuZCB0aGVcbiAqIHJlc291cmNlJ3MgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgVVJMIGZyb20gYG9wdGlvbnMuYXVkaWVuY2VgIG9uXG4gKiB7QGxpbmsgdnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9uc30uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBYYWFpZnlBdXRoUHJvdmlkZXI8VEJhc2UgZXh0ZW5kcyBDdG9yPER5bmFtaWNBdXRoUHJvdmlkZXI+PihCYXNlOiBUQmFzZSk6IFRCYXNlIHtcblx0cmV0dXJuIGNsYXNzIFhhYUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgZXh0ZW5kcyBCYXNlIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVRva2VucyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVzb3VyY2VDYWNoZUVudHJ5PigpO1xuXHRcdC8qKlxuXHRcdCAqIFBlci0ocmVzb3VyY2UsIGNsaWVudF9pZCkgY2xpZW50IHNlY3JldHMuIExhemlseSBwb3B1bGF0ZWQgdmlhIHRoZSBtYWluLXRocmVhZFxuXHRcdCAqIHByb21wdC4gS2V5ZWQgYnkgYm90aCB0aGUgcmVzb3VyY2UgaW5kaWNhdG9yIGFuZCB0aGUgY2xpZW50X2lkIGJlY2F1c2UgdHdvXG5cdFx0ICogZGlmZmVyZW50IHJlc291cmNlcyBtYXkgbGVnaXRpbWF0ZWx5IHNoYXJlIGEgY2xpZW50X2lkIGJ1dCByZXF1aXJlIGRpZmZlcmVudFxuXHRcdCAqIHNlY3JldHMgXHUyMDE0IGtleWluZyBieSBjbGllbnRfaWQgYWxvbmUgY291bGQgc2VuZCB0aGUgd3Jvbmcgc2VjcmV0IHRvIHRoZSB3cm9uZyBBUy5cblx0XHQgKi9cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZUNsaWVudFNlY3JldHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0LyoqIENvbXBvdW5kIGtleSBmb3Ige0BsaW5rIF9yZXNvdXJjZUNsaWVudFNlY3JldHN9LCBtYXRjaGluZyBtYWluLXRocmVhZCBzZWNyZXQgc3RvcmFnZSBzY29waW5nLiAqL1xuXHRcdHByaXZhdGUgX3Jlc291cmNlQ2xpZW50U2VjcmV0S2V5KHJlc291cmNlOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIGAke3Jlc291cmNlfXwke2NsaWVudElkfWA7XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRjb25zdHJ1Y3RvciguLi5hcmdzOiBhbnlbXSkge1xuXHRcdFx0c3VwZXIoLi4uYXJncyk7XG5cdFx0XHQvLyBgYXV0aG9yaXphdGlvblNlcnZlcmAgaXMgZXhwb3NlZCBhcyBhIHJlYWRvbmx5IGZpZWxkIGJ5IHRoZSBiYXNlIGNsYXNzIFx1MjAxNCB1c2UgaXRcblx0XHRcdC8vIGRpcmVjdGx5IGluc3RlYWQgb2YgaW5kZXhpbmcgaW50byBgYXJnc2Agc28gdGhpcyBjYW4ndCBzaWxlbnRseSBicmVhayBpZiB0aGVcblx0XHRcdC8vIGJhc2UgY29uc3RydWN0b3Igc2lnbmF0dXJlIGNoYW5nZXMuXG5cdFx0XHRjb25zdCBpc3N1ZXIgPSB0aGlzLmF1dGhvcml6YXRpb25TZXJ2ZXI7XG5cdFx0XHR0aGlzLmlkID0gYHhhYToke2lzc3Vlci50b1N0cmluZyh0cnVlKX1gO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBbWEFBXSBQcm92aWRlciBjb25zdHJ1Y3RlZCBmb3IgaXNzdWVyICR7aXNzdWVyLnRvU3RyaW5nKHRydWUpfS4gYXV0aG9yaXphdGlvbl9lbmRwb2ludD0ke3RoaXMuX3NlcnZlck1ldGFkYXRhLmF1dGhvcml6YXRpb25fZW5kcG9pbnR9LCB0b2tlbl9lbmRwb2ludD0ke3RoaXMuX3NlcnZlck1ldGFkYXRhLnRva2VuX2VuZHBvaW50fWApO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldFNlc3Npb25zKHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIG9wdGlvbnM6IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb25bXT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBvcHRpb25zLnJlc291cmNlO1xuXHRcdFx0Y29uc3QgYXVkaWVuY2UgPSBvcHRpb25zLmF1ZGllbmNlO1xuXHRcdFx0Ly8gQWNjb3VudC1lbnVtZXJhdGlvbiBjYWxsIChnZXRBY2NvdW50cyk6IG5vIHJlc291cmNlIHRvIG1pbnQgYWdhaW5zdCwgc28gc3VyZmFjZSB0aGUgSWRQXG5cdFx0XHQvLyBzZXNzaW9uKHMpIGZyb20gdGhlIGJhc2Ugc3RvcmUuIFJlYWQtb25seSwgc28gaXQgaG9ub3JzIHRoZSBuby1wcm9tcHQgZ2V0U2Vzc2lvbnMgY29udHJhY3QuXG5cdFx0XHRpZiAoIXNjb3BlcyAmJiAhcmVzb3VyY2UgJiYgIWF1ZGllbmNlKSB7XG5cdFx0XHRcdHJldHVybiBzdXBlci5nZXRTZXNzaW9ucyhzY29wZXMsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXNvdXJjZSB8fCAhc2NvcGVzIHx8ICFhdWRpZW5jZSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHQvLyAxLiBGYXN0IHBhdGg6IGluLW1lbW9yeSBjYWNoZSBmcm9tIGEgcHJpb3IgY3JlYXRlU2Vzc2lvbi9nZXRTZXNzaW9ucyBpbiB0aGlzIHdpbmRvdy5cblx0XHRcdGNvbnN0IGtleSA9IGNhY2hlS2V5KHJlc291cmNlLCBzY29wZXMpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9yZXNvdXJjZVRva2Vucy5nZXQoa2V5KTtcblx0XHRcdGlmIChlbnRyeSAmJiAhaXNFeHBpcmVkKGVudHJ5KSkge1xuXHRcdFx0XHRyZXR1cm4gW3RvU2Vzc2lvbihlbnRyeS50b2tlbiwgZW50cnkuc2NvcGVzLCBlbnRyeS5hY2NvdW50KV07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0Ly8gRXhwaXJlZCBcdTIwMTQgZHJvcCBhbmQgdHJ5IHRvIHNpbGVudGx5IHJlLW1pbnQgYmVsb3cuXG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlVG9rZW5zLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAyLiBTaWxlbnQgcmUtbWludDogdGhlIGJhc2UgRHluYW1pY0F1dGhQcm92aWRlciBwZXJzaXN0cyB0aGUgSWRQIHNlc3Npb24gaW4gc2VjcmV0XG5cdFx0XHQvLyAgICBzdG9yYWdlLCBzbyBvbiB3aW5kb3cgcmVsb2FkIHdlIGNhbiBwaWNrIGl0IHVwIGFuZCByZS1ydW4gbGVncyAyLTQgKElELUpBRyBleGNoYW5nZVxuXHRcdFx0Ly8gICAgKyByZXNvdXJjZSByZWRlbXB0aW9uKSB3aXRob3V0IGFueSB1c2VyIGludGVyYWN0aW9uLiBQZXIgdGhlIElBdXRoZW50aWNhdGlvblByb3ZpZGVyXG5cdFx0XHQvLyAgICBjb250cmFjdCwgZ2V0U2Vzc2lvbnMgTVVTVCBOT1QgcHJvbXB0IFx1MjAxNCBpZiBhbnl0aGluZyBpcyBtaXNzaW5nIHdlIGp1c3QgcmV0dXJuIFtdLlxuXHRcdFx0Y29uc3QgaWRwU2Vzc2lvbiA9IGF3YWl0IHRoaXMuX3RyeUdldFNpbGVudElkcFNlc3Npb24oKTtcblx0XHRcdGlmICghaWRwU2Vzc2lvbj8uaWRUb2tlbikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtaW50ZWQgPSBhd2FpdCB0aGlzLl9taW50UmVzb3VyY2VUb2tlbihpZHBTZXNzaW9uLCBbLi4uc2NvcGVzXSwgYXVkaWVuY2UsIHJlc291cmNlLCBvcHRpb25zLCAvKiBzaWxlbnQgKi8gdHJ1ZSk7XG5cdFx0XHRcdGlmICghbWludGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbdG9TZXNzaW9uKG1pbnRlZC50b2tlbiwgbWludGVkLnNjb3BlcywgbWludGVkLmFjY291bnQpXTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvLyBTaWxlbnQgcGF0aDogbG9nIGFuZCBmYWxsIGJhY2sgdG8gXCJubyBzZXNzaW9uXCIgc28gdGhlIGNhbGxlciBkZWNpZGVzIHdoZXRoZXJcblx0XHRcdFx0Ly8gdG8gZXNjYWxhdGUgdG8gY3JlYXRlU2Vzc2lvbiAod2hpY2ggaXMgYWxsb3dlZCB0byBpbnRlcmFjdCkuXG5cdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBbWEFBXSBTaWxlbnQgdG9rZW4gbWludCBmYWlsZWQgZm9yIHJlc291cmNlPSR7cmVzb3VyY2V9OyBmYWxsaW5nIGJhY2sgdG8gaW50ZXJhY3RpdmUuIEVycm9yOiAkeyhlcnIgYXMgRXJyb3IpLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVTZXNzaW9uKHNjb3Blczogc3RyaW5nW10sIG9wdGlvbnM6IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHRcdGNvbnN0IGF1ZGllbmNlID0gb3B0aW9ucy5hdWRpZW5jZTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gb3B0aW9ucy5yZXNvdXJjZTtcblx0XHRcdHRoaXMuX2xvZ2dlci50cmFjZShgW1hBQV0gY3JlYXRlU2Vzc2lvbiBzY29wZXM9WyR7c2NvcGVzLmpvaW4oJyAnKX1dIGF1ZGllbmNlPSR7YXVkaWVuY2V9IHJlc291cmNlPSR7cmVzb3VyY2V9YCk7XG5cdFx0XHRpZiAoIWF1ZGllbmNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRW50ZXJwcmlzZS1tYW5hZ2VkIGF1dGhlbnRpY2F0aW9uIHJlcXVpcmVzIGBvcHRpb25zLmF1ZGllbmNlYCAodGhlIHJlc291cmNlXFwncyBhdXRob3JpemF0aW9uIHNlcnZlciBVUkwpIGJ1dCBub25lIHdhcyBwcm92aWRlZC4nKTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFbnRlcnByaXNlLW1hbmFnZWQgYXV0aGVudGljYXRpb24gcmVxdWlyZXMgYG9wdGlvbnMucmVzb3VyY2VgICh0aGUgcmVzb3VyY2UgaW5kaWNhdG9yIC8gTUNQIHNlcnZlciBVUkwpIGJ1dCBub25lIHdhcyBwcm92aWRlZC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5zdXJlIElkUCBzZXNzaW9uIHZpYSB0aGUgYmFzZSBjbGFzcyAobWF5IGludGVyYWN0KS4gRG9uJ3QgcGFzcyB0aGUgWEFBIG9wdGlvbnMgdGhyb3VnaCBcdTIwMTRcblx0XHRcdC8vIHRoZSBJZFAgbG9naW4gbGVnIGlzIHVucmVsYXRlZCB0byB0aGUgcmVzb3VyY2UvYXVkaWVuY2UsIGFuZCB0aGUgYmFzZSBwcm92aWRlciB3b3VsZFxuXHRcdFx0Ly8gb3RoZXJ3aXNlIGxvb2sgZm9yIGNhY2hlZCB0b2tlbnMgc2NvcGVkIGJ5IGEgZm9yZWlnbiBhdWRpZW5jZS5cblx0XHRcdGNvbnN0IGlkcFNlc3Npb24gPSBhd2FpdCB0aGlzLl9lbnN1cmVJZHBTZXNzaW9uKCk7XG5cdFx0XHRpZiAoIWlkcFNlc3Npb24uaWRUb2tlbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lkUCBzZXNzaW9uIGlzIG1pc3NpbmcgYW4gaWRfdG9rZW47IHRoZSBpc3N1ZXIgbXVzdCBzdXBwb3J0IE9wZW5JRCBDb25uZWN0IGFuZCB0aGUgYG9wZW5pZGAgc2NvcGUuJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1pbnRlZCA9IGF3YWl0IHRoaXMuX21pbnRSZXNvdXJjZVRva2VuKGlkcFNlc3Npb24sIHNjb3BlcywgYXVkaWVuY2UsIHJlc291cmNlLCBvcHRpb25zLCAvKiBzaWxlbnQgKi8gZmFsc2UpO1xuXHRcdFx0aWYgKCFtaW50ZWQpIHtcblx0XHRcdFx0Ly8gYHNpbGVudD1mYWxzZWAgb25seSByZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGUgbWludCBsb2dpYyBpdHNlbGYgZGVjaWRlZCB0byBiYWlsLlxuXHRcdFx0XHQvLyBUb2RheSB0aGUgb25seSBzdWNoIHBhdGggaXMgbWlzc2luZyByZXNvdXJjZSBjbGllbnRfc2VjcmV0LCB3aGljaCBwcm9tcHRzIHRoZSB1c2VyO1xuXHRcdFx0XHQvLyBpZiB0aGUgcHJvbXB0IGlzIGRpc21pc3NlZCB3ZSBzdGlsbCB0cnkgdGhlIHJlZGVtcHRpb24gd2l0aCBgdW5kZWZpbmVkYCAodmFsaWQgZm9yXG5cdFx0XHRcdC8vIGB0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD1ub25lYCkuIFNvIGluIHByYWN0aWNlIHRoaXMgYnJhbmNoIGlzIHVucmVhY2hhYmxlIGZvclxuXHRcdFx0XHQvLyBzaWxlbnQ9ZmFsc2UgXHUyMDE0IGd1YXJkIGRlZmVuc2l2ZWx5IGFueXdheS5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gbWludCBhIHJlc291cmNlIGFjY2VzcyB0b2tlbiBmb3IgdGhlIGVudGVycHJpc2UtbWFuYWdlZCBNQ1Agc2VydmVyLicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRvU2Vzc2lvbihtaW50ZWQudG9rZW4sIG1pbnRlZC5zY29wZXMsIG1pbnRlZC5hY2NvdW50KTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBNaW50cyBhIHJlc291cmNlLXNjb3BlZCBhY2Nlc3MgdG9rZW4gYnkgcnVubmluZyBsZWdzIDItNCBvZiB0aGUgWEFBIGZsb3c6XG5cdFx0ICogICAyLiBFeGNoYW5nZSBJZFAgaWRfdG9rZW4gXHUyMTkyIElELUpBRyAoUkZDIDg2OTMgdG9rZW4gZXhjaGFuZ2UgYXQgaXNzdWVyKVxuXHRcdCAqICAgMy4gRGlzY292ZXIgdGhlIHJlc291cmNlIEFTIHRva2VuIGVuZHBvaW50XG5cdFx0ICogICA0LiBSZWRlZW0gdGhlIElELUpBRyBhdCB0aGUgcmVzb3VyY2UgQVMgZm9yIGFuIGFjY2VzcyB0b2tlbiAoUkZDIDc1MjMgand0LWJlYXJlciBncmFudClcblx0XHQgKlxuXHRcdCAqIFdoZW4gYHNpbGVudGAgaXMgdHJ1ZSwgdGhpcyBtZXRob2QgTVVTVCBOT1QgcHJvbXB0IHRoZSB1c2VyLiBJZiB0aGUgcmVzb3VyY2UgQVMgdXNlcyBhXG5cdFx0ICogZGlzdGluY3QgY2xpZW50X2lkICh4YWEuZGV2J3MgXCJ7Y2xpZW50fS1hdC17cmVzb3VyY2V9XCIgcGF0dGVybikgYW5kIG5vIGNsaWVudF9zZWNyZXQgY2FuXG5cdFx0ICogYmUgcmVzb2x2ZWQgd2l0aG91dCBwcm9tcHRpbmcsIHRoaXMgcmV0dXJucyBgdW5kZWZpbmVkYC5cblx0XHQgKlxuXHRcdCAqIENhY2hlcyB0aGUgcmVzdWx0aW5nIHRva2VuIGluIGBfcmVzb3VyY2VUb2tlbnNgIHNvIHN1YnNlcXVlbnQgZ2V0U2Vzc2lvbnMgYXJlIE8oMSkuXG5cdFx0ICovXG5cdFx0cHJpdmF0ZSBhc3luYyBfbWludFJlc291cmNlVG9rZW4oXG5cdFx0XHRpZHBTZXNzaW9uOiB2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uLFxuXHRcdFx0c2NvcGVzOiBzdHJpbmdbXSxcblx0XHRcdGF1ZGllbmNlOiBzdHJpbmcsXG5cdFx0XHRyZXNvdXJjZTogc3RyaW5nLFxuXHRcdFx0b3B0aW9uczogdnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucyxcblx0XHRcdHNpbGVudDogYm9vbGVhbixcblx0XHQpOiBQcm9taXNlPElSZXNvdXJjZUNhY2hlRW50cnkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdC8vIExlZyAyOiBpZF90b2tlbiBcdTIxOTIgSUQtSkFHXG5cdFx0XHRjb25zdCBqYWcgPSBhd2FpdCB0aGlzLl9leGNoYW5nZUZvcklkSmFnKGlkcFNlc3Npb24uaWRUb2tlbiEsIGF1ZGllbmNlLCByZXNvdXJjZSwgc2NvcGVzKTtcblxuXHRcdFx0Ly8gTGVnIDM6IHJlc291cmNlIEFTIHRva2VuIGVuZHBvaW50XG5cdFx0XHRjb25zdCByZXNvdXJjZVRva2VuRW5kcG9pbnQgPSBhd2FpdCB0aGlzLl9kaXNjb3ZlclJlc291cmNlVG9rZW5FbmRwb2ludChhdWRpZW5jZSk7XG5cblx0XHRcdC8vIExlZyA0IHByZXA6IHJlc29sdmUgdGhlIHJlc291cmNlIGNsaWVudF9pZC5cblx0XHRcdC8vIFBlciBkcmFmdC1pZXRmLW9hdXRoLWlkZW50aXR5LWFzc2VydGlvbi1hdXRoei1ncmFudCBzZWN0aW9uIDMuMiwgdGhlIElELUpBRyBjYXJyaWVzIGFcblx0XHRcdC8vIGBjbGllbnRfaWRgIGNsYWltIGlkZW50aWZ5aW5nIHRoZSByZXF1ZXN0aW5nIGFwcCB0byB0aGUgcmVzb3VyY2UgQVMuIFRoaXMgaXMgb2Z0ZW5cblx0XHRcdC8vIGRpc3RpbmN0IGZyb20gdGhlIElkUCBgY2xpZW50X2lkYCAoeGFhLmRldiBmb3IgZXhhbXBsZSB1c2VzIGFcblx0XHRcdC8vIGB7aWRwX2NsaWVudF9pZH0tYXQte3Jlc291cmNlfWAgZm9ybSksIHNvIHdlIGV4dHJhY3QgaXQgZnJvbSB0aGUgYXNzZXJ0aW9uIHJhdGhlciB0aGFuXG5cdFx0XHQvLyByZXVzaW5nIGB0aGlzLl9jbGllbnRJZGAuIENhbGxlci1zdXBwbGllZCBgb3B0aW9ucy5jbGllbnRJZGAgKGZyb20gdGhlIE1DUCBzZXJ2ZXInc1xuXHRcdFx0Ly8gYG9hdXRoLmNsaWVudElkYCBjb25maWcpIHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgSkFHLWV4dHJhY3RlZCB2YWx1ZS5cblx0XHRcdGxldCByZXNvdXJjZUNsaWVudElkID0gdGhpcy5fY2xpZW50SWQ7XG5cdFx0XHRsZXQgcmVzb3VyY2VDbGllbnRJZEZyb21KYWcgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRSZXNvdXJjZUNsaWVudElkID0gdHlwZW9mIG9wdGlvbnMuY2xpZW50SWQgPT09ICdzdHJpbmcnICYmIG9wdGlvbnMuY2xpZW50SWQubGVuZ3RoID4gMCA/IG9wdGlvbnMuY2xpZW50SWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY29uZmlndXJlZFJlc291cmNlQ2xpZW50SWQpIHtcblx0XHRcdFx0cmVzb3VyY2VDbGllbnRJZCA9IGNvbmZpZ3VyZWRSZXNvdXJjZUNsaWVudElkO1xuXHRcdFx0XHRyZXNvdXJjZUNsaWVudElkRnJvbUphZyA9IHJlc291cmNlQ2xpZW50SWQgIT09IHRoaXMuX2NsaWVudElkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBqYWdDbGFpbXMgPSBnZXRDbGFpbXNGcm9tSldUKGphZyk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBqYWdDbGFpbXMuY2xpZW50X2lkID09PSAnc3RyaW5nJyAmJiBqYWdDbGFpbXMuY2xpZW50X2lkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHJlc291cmNlQ2xpZW50SWQgPSBqYWdDbGFpbXMuY2xpZW50X2lkO1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VDbGllbnRJZEZyb21KYWcgPSByZXNvdXJjZUNsaWVudElkICE9PSB0aGlzLl9jbGllbnRJZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBbWEFBXSBDb3VsZCBub3QgZGVjb2RlIElELUpBRyB0byByZWFkIHJlc291cmNlIGNsaWVudF9pZDsgZmFsbGluZyBiYWNrIHRvIElkUCBjbGllbnRfaWQuIEVycm9yOiAkeyhlcnIgYXMgRXJyb3IpLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTGVnIDQgcHJlcDogcmVzb2x2ZSB0aGUgcmVzb3VyY2UgY2xpZW50X3NlY3JldC5cblx0XHRcdC8vIElmIHRoZSByZXNvdXJjZSBBUyB1c2VzIGEgZGlzdGluY3QgY2xpZW50X2lkLCBpdCB3aWxsIHJlamVjdCBgdGhpcy5fY2xpZW50U2VjcmV0YFxuXHRcdFx0Ly8gKHRoZSBJZFAgc2VjcmV0KSB3aXRoIGBpbnZhbGlkX2NsaWVudGAuIFRoZSBjYWxsZXIgbWF5IHN1cHBseSB0aGUgcmVzb3VyY2Ugc2VjcmV0XG5cdFx0XHQvLyBkaXJlY3RseSB2aWEgYG9wdGlvbnMuY2xpZW50U2VjcmV0YCAocmVzb2x2ZWQgaW4gYG1haW5UaHJlYWRNY3BgIGZyb20gVVJMLXNjb3BlZFxuXHRcdFx0Ly8gc2VjcmV0IHN0b3JhZ2UgdmlhIHRoZSBcIlNldCBDbGllbnQgU2VjcmV0XCIgY29kZSBsZW5zIGFib3ZlIGBvYXV0aC5jbGllbnRJZGAgaW5cblx0XHRcdC8vIG1jcC5qc29uKTsgb3RoZXJ3aXNlIHdlIGZhbGwgYmFjayB0byBhIGNhY2hlZCBwZXItcmVzb3VyY2Ugc2VjcmV0IG9yIHByb21wdCB0aGVcblx0XHRcdC8vIHVzZXIuIFdlIHBhc3MgYHVuZGVmaW5lZGAgaWYgdGhlIHVzZXIgbGVhdmVzIHRoZSBwcm9tcHQgYmxhbmsgXHUyMDE0IHRoYXQncyB2YWxpZCBmb3Jcblx0XHRcdC8vIGNsaWVudHMgcmVnaXN0ZXJlZCB3aXRoIGB0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD1ub25lYC5cblx0XHRcdGxldCByZXNvdXJjZUNsaWVudFNlY3JldDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdGhpcy5fY2xpZW50U2VjcmV0O1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZFJlc291cmNlQ2xpZW50U2VjcmV0ID0gdHlwZW9mIG9wdGlvbnMuY2xpZW50U2VjcmV0ID09PSAnc3RyaW5nJyAmJiBvcHRpb25zLmNsaWVudFNlY3JldC5sZW5ndGggPiAwID8gb3B0aW9ucy5jbGllbnRTZWNyZXQgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzZWNyZXRDYWNoZUtleSA9IHRoaXMuX3Jlc291cmNlQ2xpZW50U2VjcmV0S2V5KHJlc291cmNlLCByZXNvdXJjZUNsaWVudElkKTtcblx0XHRcdGlmIChjb25maWd1cmVkUmVzb3VyY2VDbGllbnRTZWNyZXQpIHtcblx0XHRcdFx0cmVzb3VyY2VDbGllbnRTZWNyZXQgPSBjb25maWd1cmVkUmVzb3VyY2VDbGllbnRTZWNyZXQ7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlQ2xpZW50U2VjcmV0cy5zZXQoc2VjcmV0Q2FjaGVLZXksIGNvbmZpZ3VyZWRSZXNvdXJjZUNsaWVudFNlY3JldCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlQ2xpZW50SWRGcm9tSmFnKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9yZXNvdXJjZUNsaWVudFNlY3JldHMuaGFzKHNlY3JldENhY2hlS2V5KSkge1xuXHRcdFx0XHRcdHJlc291cmNlQ2xpZW50U2VjcmV0ID0gdGhpcy5fcmVzb3VyY2VDbGllbnRTZWNyZXRzLmdldChzZWNyZXRDYWNoZUtleSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2lsZW50KSB7XG5cdFx0XHRcdFx0Ly8gU2lsZW50IHBhdGg6IHRoZSBvbmx5IHdheSB0byBvYnRhaW4gdGhlIHJlc291cmNlIGNsaWVudF9zZWNyZXQgaGVyZSBpcyB0b1xuXHRcdFx0XHRcdC8vIHByb21wdCB0aGUgdXNlciBcdTIwMTQgd2hpY2ggd2UgY2FuJ3QgZG8uIEJhaWw7IHRoZSBjYWxsZXIgd2lsbCBlc2NhbGF0ZSB0b1xuXHRcdFx0XHRcdC8vIGNyZWF0ZVNlc3Npb24gKGFsbG93ZWQgdG8gaW50ZXJhY3QpIGlmIGl0IG5lZWRzIHRoZSB0b2tlbi5cblx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW1hBQV0gU2lsZW50IG1pbnQgcmVxdWlyZXMgcmVzb3VyY2UgY2xpZW50X3NlY3JldCBmb3IgJyR7cmVzb3VyY2VDbGllbnRJZH0nIGJ1dCBub25lIGlzIGNhY2hlZCBvciBjb25maWd1cmVkOyBkZWZlcnJpbmcgdG8gaW50ZXJhY3RpdmUgZmxvdy5gKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbWEFBXSBSZXNvdXJjZSBBUyByZXF1aXJlcyBhIGRpc3RpbmN0IGNsaWVudF9pZCAnJHtyZXNvdXJjZUNsaWVudElkfScgXHUyMDE0IHByb21wdGluZyBmb3IgbWF0Y2hpbmcgY2xpZW50X3NlY3JldC5gKTtcblx0XHRcdFx0XHRjb25zdCBwcm9tcHRlZFNlY3JldCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm9tcHRGb3JSZXNvdXJjZUNsaWVudFNlY3JldChyZXNvdXJjZUNsaWVudElkLCByZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHByb21wdGVkU2VjcmV0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdC8vIFVzZXIgY2FuY2VsbGVkIFx1MjAxNCBkb24ndCBjYWNoZSwgc28gcmUtcHJvbXB0IGlzIHBvc3NpYmxlIG9uIG5leHQgY2FsbC5cblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEJsYW5rLW9uLWNvbmZpcm0gaXMgYSB2YWxpZCBhbnN3ZXIgKHB1YmxpYyBjbGllbnQgLyB0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD1ub25lKS5cblx0XHRcdFx0XHQvLyBUaGUgbWFpbiB0aHJlYWQgcmV0dXJucyAnJyBmb3IgdGhhdCBjYXNlLCB1bmRlZmluZWQgZm9yIGNhbmNlbC5cblx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZUNsaWVudFNlY3JldHMuc2V0KHNlY3JldENhY2hlS2V5LCBwcm9tcHRlZFNlY3JldCk7XG5cdFx0XHRcdFx0cmVzb3VyY2VDbGllbnRTZWNyZXQgPSBwcm9tcHRlZFNlY3JldC5sZW5ndGggPiAwID8gcHJvbXB0ZWRTZWNyZXQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTGVnIDQ6IHJlZGVtcHRpb24uXG5cdFx0XHRjb25zdCByZXNvdXJjZVRva2VuID0gYXdhaXQgdGhpcy5fcmVkZWVtQXRSZXNvdXJjZShyZXNvdXJjZVRva2VuRW5kcG9pbnQsIGphZywgcmVzb3VyY2UsIHNjb3BlcywgcmVzb3VyY2VDbGllbnRJZCwgcmVzb3VyY2VDbGllbnRTZWNyZXQpO1xuXG5cdFx0XHRjb25zdCBlbnRyeTogSVJlc291cmNlQ2FjaGVFbnRyeSA9IHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHNjb3Blcyxcblx0XHRcdFx0dG9rZW46IHJlc291cmNlVG9rZW4sXG5cdFx0XHRcdC8vIEZhbGxiYWNrIGlkZW50aXR5LCB1c2VkIHdoZW4gdGhlIHJlc291cmNlIHRva2VuIGNhcnJpZXMgbm8gaWRfdG9rZW4gb2YgaXRzIG93biAodGhlIHVzdWFsIGNhc2UpLlxuXHRcdFx0XHRhY2NvdW50OiBpZHBTZXNzaW9uLmFjY291bnQsXG5cdFx0XHRcdGNyZWF0ZWRfYXQ6IERhdGUubm93KCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VUb2tlbnMuc2V0KGNhY2hlS2V5KHJlc291cmNlLCBzY29wZXMpLCBlbnRyeSk7XG5cdFx0XHRyZXR1cm4gZW50cnk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogUmV0dXJucyB0aGUgSWRQIHNlc3Npb24gaWYgb25lIGlzIGF2YWlsYWJsZSB3aXRob3V0IGFueSB1c2VyIGludGVyYWN0aW9uLCBvdGhlcndpc2Vcblx0XHQgKiBgdW5kZWZpbmVkYC4gQ3JpdGljYWxseSBkb2VzIE5PVCBjYWxsIGBzdXBlci5jcmVhdGVTZXNzaW9uYCwgc28gdGhpcyBpcyBzYWZlIHRvIHVzZVxuXHRcdCAqIGZyb20ge0BsaW5rIGdldFNlc3Npb25zfS5cblx0XHQgKi9cblx0XHRwcml2YXRlIGFzeW5jIF90cnlHZXRTaWxlbnRJZHBTZXNzaW9uKCk6IFByb21pc2U8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0Y29uc3QgY2xlYW5PcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlclNlc3Npb25PcHRpb25zID0ge307XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IHN1cGVyLmdldFNlc3Npb25zKElEUF9TQ09QRVMgYXMgc3RyaW5nW10sIGNsZWFuT3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcubGVuZ3RoID8gZXhpc3RpbmdbMF0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlSWRwU2Vzc2lvbigpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHRcdHRoaXMuX2xvZ2dlci50cmFjZShgW1hBQV0gX2Vuc3VyZUlkcFNlc3Npb246IHNjb3Blcz1bJHtJRFBfU0NPUEVTLmpvaW4oJyAnKX1dIGF1dGhvcml6YXRpb25fZW5kcG9pbnQ9JHt0aGlzLl9zZXJ2ZXJNZXRhZGF0YS5hdXRob3JpemF0aW9uX2VuZHBvaW50fWApO1xuXHRcdFx0Y29uc3Qgc2lsZW50ID0gYXdhaXQgdGhpcy5fdHJ5R2V0U2lsZW50SWRwU2Vzc2lvbigpO1xuXHRcdFx0aWYgKHNpbGVudD8uaWRUb2tlbikge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIudHJhY2UoYFtYQUFdIF9lbnN1cmVJZHBTZXNzaW9uOiByZXVzaW5nIGV4aXN0aW5nIElkUCBzZXNzaW9uYCk7XG5cdFx0XHRcdHJldHVybiBzaWxlbnQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dnZXIudHJhY2UoYFtYQUFdIF9lbnN1cmVJZHBTZXNzaW9uOiBjcmVhdGluZyBuZXcgSWRQIHNlc3Npb24gdmlhIHN1cGVyLmNyZWF0ZVNlc3Npb25gKTtcblx0XHRcdHJldHVybiBzdXBlci5jcmVhdGVTZXNzaW9uKFsuLi5JRFBfU0NPUEVTXSwge30pO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgYXN5bmMgX2V4Y2hhbmdlRm9ySWRKYWcoaWRUb2tlbjogc3RyaW5nLCBhdWRpZW5jZTogc3RyaW5nLCByZXNvdXJjZTogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdGNvbnN0IHRva2VuRW5kcG9pbnQgPSB0aGlzLl9zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludDtcblx0XHRcdGlmICghdG9rZW5FbmRwb2ludCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lzc3VlciBtZXRhZGF0YSBpcyBtaXNzaW5nIHRva2VuX2VuZHBvaW50OyBjYW5ub3QgcGVyZm9ybSBYQUEgdG9rZW4gZXhjaGFuZ2UuJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBib2R5ID0gYnVpbGRJZEphZ0V4Y2hhbmdlQm9keSh0aGlzLl9jbGllbnRJZCwgdGhpcy5fY2xpZW50U2VjcmV0LCBpZFRva2VuLCBhdWRpZW5jZSwgcmVzb3VyY2UsIHNjb3Blcyk7XG5cdFx0XHR0aGlzLl9sb2dnZXIudHJhY2UoYFtYQUFdIFBPU1QgJHt0b2tlbkVuZHBvaW50fSAoSUQtSkFHIGV4Y2hhbmdlKSBhdWRpZW5jZT0ke2F1ZGllbmNlfSByZXNvdXJjZT0ke3Jlc291cmNlfSBzY29wZT0ke3Njb3Blcy5qb2luKCcgJyl9YCk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHRva2VuRW5kcG9pbnQsIHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG5cdFx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ym9keTogYm9keS50b1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgWEFBIHRva2VuIGV4Y2hhbmdlIChJZFApIGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9ICR7YXdhaXQgc2FmZVRleHQocmVzcG9uc2UpfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGF0YTogdW5rbm93biA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblx0XHRcdGNvbnN0IGlzc3VlZCA9IChkYXRhICYmIHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKGRhdGEgYXMgeyBhY2Nlc3NfdG9rZW4/OiB1bmtub3duIH0pLmFjY2Vzc190b2tlbiA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdD8gKGRhdGEgYXMgeyBhY2Nlc3NfdG9rZW46IHN0cmluZyB9KS5hY2Nlc3NfdG9rZW5cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWlzc3VlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFhBQSB0b2tlbiBleGNoYW5nZSAoSWRQKSByZXR1cm5lZCBubyBhY2Nlc3NfdG9rZW4uIFJlc3BvbnNlOiAke0pTT04uc3RyaW5naWZ5KGRhdGEpfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGlzc3VlZDtcblx0XHR9XG5cblx0XHRwcml2YXRlIGFzeW5jIF9kaXNjb3ZlclJlc291cmNlVG9rZW5FbmRwb2ludChhdWRpZW5jZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdGNvbnN0IHsgbWV0YWRhdGEsIGVycm9ycyB9ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXVkaWVuY2UpO1xuXHRcdFx0aWYgKCFtZXRhZGF0YT8udG9rZW5fZW5kcG9pbnQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZGlzY292ZXIgcmVzb3VyY2UgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgZm9yICcke2F1ZGllbmNlfSc6ICR7ZXJyb3JzLm1hcChlID0+IGUubWVzc2FnZSkuam9pbignOyAnKSB8fCAnbm8gdG9rZW5fZW5kcG9pbnQgaW4gbWV0YWRhdGEnfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1ldGFkYXRhLnRva2VuX2VuZHBvaW50O1xuXHRcdH1cblxuXHRcdHByaXZhdGUgYXN5bmMgX3JlZGVlbUF0UmVzb3VyY2UodG9rZW5FbmRwb2ludDogc3RyaW5nLCBpZEphZzogc3RyaW5nLCByZXNvdXJjZTogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdLCByZXNvdXJjZUNsaWVudElkOiBzdHJpbmcsIHJlc291cmNlQ2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IGJ1aWxkUmVzb3VyY2VSZWRlbXB0aW9uQm9keShyZXNvdXJjZUNsaWVudElkLCByZXNvdXJjZUNsaWVudFNlY3JldCwgaWRKYWcsIHJlc291cmNlLCBzY29wZXMpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBbWEFBXSBQT1NUICR7dG9rZW5FbmRwb2ludH0gKElELUpBRyByZWRlbXB0aW9uKSBjbGllbnRfaWQ9JHtyZXNvdXJjZUNsaWVudElkfSByZXNvdXJjZT0ke3Jlc291cmNlfSBzY29wZT0ke3Njb3Blcy5qb2luKCcgJyl9YCk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHRva2VuRW5kcG9pbnQsIHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG5cdFx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ym9keTogYm9keS50b1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgWEFBIHRva2VuIGV4Y2hhbmdlIChyZXNvdXJjZSkgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHthd2FpdCBzYWZlVGV4dChyZXNwb25zZSl9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRcdFx0aWYgKCFpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKGRhdGEpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgWEFBIHRva2VuIGV4Y2hhbmdlIChyZXNvdXJjZSkgcmV0dXJuZWQgYW4gaW52YWxpZCB0b2tlbiByZXNwb25zZTogJHtKU09OLnN0cmluZ2lmeShkYXRhKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkYXRhO1xuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBzZXNzaW9uIGZyb20gYSB0b2tlbiByZXNwb25zZS4gSWRlbnRpdHkgcHJlY2VkZW5jZTogdGhlIHRva2VuJ3Mgb3duIGBpZF90b2tlbmAsIHRoZW5cbiAqIGBmYWxsYmFja0FjY291bnRgICh0aGUgSWRQIGxvZ2luIGlkZW50aXR5KSwgdGhlbiBhIGdlbmVyaWMgZGVmYXVsdC4gTmV2ZXIgdGhlIGBhY2Nlc3NfdG9rZW5gLCB3aGljaFxuICogZm9yIFhBQSBpcyBhbiBvcGFxdWUgcmVzb3VyY2UgY3JlZGVudGlhbC4gRXhwb3J0ZWQgZm9yIHRlc3RpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nlc3Npb24odG9rZW46IElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSwgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSwgZmFsbGJhY2tBY2NvdW50PzogdnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnRJbmZvcm1hdGlvbik6IHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24ge1xuXHRsZXQgYWNjb3VudDogdnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnRJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZDtcblx0aWYgKHRva2VuLmlkX3Rva2VuKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNsYWltczogSUF1dGhvcml6YXRpb25KV1RDbGFpbXMgPSBnZXRDbGFpbXNGcm9tSldUKHRva2VuLmlkX3Rva2VuKTtcblx0XHRcdGFjY291bnQgPSB7XG5cdFx0XHRcdGlkOiBjbGFpbXMuc3ViIHx8ICd1bmtub3duJyxcblx0XHRcdFx0bGFiZWw6IGNsYWltcy5wcmVmZXJyZWRfdXNlcm5hbWUgfHwgY2xhaW1zLm5hbWUgfHwgY2xhaW1zLmVtYWlsIHx8ICdYQUEnLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgdGhlIGlkX3Rva2VuIHdhc24ndCBhIGRlY29kYWJsZSBKV1Rcblx0XHR9XG5cdH1cblx0YWNjb3VudCA/Pz0gZmFsbGJhY2tBY2NvdW50ID8/IHsgaWQ6ICd1bmtub3duJywgbGFiZWw6ICdYQUEnIH07XG5cdHJldHVybiB7XG5cdFx0aWQ6IHN0cmluZ0hhc2godG9rZW4uYWNjZXNzX3Rva2VuLCAwKS50b1N0cmluZygpLFxuXHRcdGFjY2Vzc1Rva2VuOiB0b2tlbi5hY2Nlc3NfdG9rZW4sXG5cdFx0YWNjb3VudCxcblx0XHRzY29wZXM6IFsuLi5zY29wZXNdLFxuXHRcdGlkVG9rZW46IHRva2VuLmlkX3Rva2VuLFxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBzYWZlVGV4dChyZXNwb25zZTogUmVzcG9uc2UpOiBQcm9taXNlPHN0cmluZz4ge1xuXHR0cnkge1xuXHRcdHJldHVybiBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiByZXNwb25zZS5zdGF0dXNUZXh0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUF3Qiw2QkFBNkIsa0NBQWtDLGtCQUF3RSxvQ0FBb0M7QUFjck0sTUFBTSxhQUFnQyxDQUFDLFVBQVUsZ0JBQWdCO0FBWWpFLFNBQVMsU0FBUyxVQUFrQixRQUFtQztBQUM3RSxTQUFPLFdBQVcsTUFBTSxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEdBQUc7QUFDcEQ7QUFXTyxTQUFTLFVBQVUsT0FBK0QsTUFBYyxLQUFLLElBQUksR0FBWTtBQUMzSCxNQUFJLE1BQU0sTUFBTSxlQUFlLFFBQVc7QUFDekMsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLE1BQU0sTUFBTSxhQUFjLE1BQU0sTUFBTSxhQUFhLE1BQVE7QUFDbkU7QUE4Qk8sU0FBUyxtQkFBNEQsTUFBb0I7QUFDL0YsU0FBTyxNQUFNLGtDQUFrQyxLQUFLO0FBQUE7QUFBQSxJQWdCbkQsZUFBZSxNQUFhO0FBQzNCLFlBQU0sR0FBRyxJQUFJO0FBaEJkLFdBQWlCLGtCQUFrQixvQkFBSSxJQUFpQztBQU94RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUFpQix5QkFBeUIsb0JBQUksSUFBb0I7QUFhakUsWUFB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
