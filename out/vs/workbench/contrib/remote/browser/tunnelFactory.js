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
import * as nls from "../../../../nls.js";
import { ITunnelService, TunnelProtocol, TunnelPrivacyId } from "../../../../platform/tunnel/common/tunnel.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { IRemoteExplorerService } from "../../../services/remote/common/remoteExplorerService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { forwardedPortsFeaturesEnabled } from "../../../services/remote/common/tunnelModel.js";
let TunnelFactoryContribution = class extends Disposable {
  constructor(tunnelService, environmentService, openerService, remoteExplorerService, logService, contextKeyService) {
    super();
    this.openerService = openerService;
    const tunnelFactory = environmentService.options?.tunnelProvider?.tunnelFactory;
    if (tunnelFactory) {
      contextKeyService.createKey(forwardedPortsFeaturesEnabled.key, true);
      let privacyOptions = environmentService.options?.tunnelProvider?.features?.privacyOptions ?? [];
      if (environmentService.options?.tunnelProvider?.features?.public && privacyOptions.length === 0) {
        privacyOptions = [
          {
            id: "private",
            label: nls.localize("tunnelPrivacy.private", "Private"),
            themeIcon: "lock"
          },
          {
            id: "public",
            label: nls.localize("tunnelPrivacy.public", "Public"),
            themeIcon: "eye"
          }
        ];
      }
      this._register(tunnelService.setTunnelProvider({
        forwardPort: async (tunnelOptions, tunnelCreationOptions) => {
          let tunnelPromise;
          try {
            tunnelPromise = tunnelFactory(tunnelOptions, tunnelCreationOptions);
          } catch (e) {
            logService.trace("tunnelFactory: tunnel provider error");
          }
          if (!tunnelPromise) {
            return void 0;
          }
          let tunnel;
          try {
            tunnel = await tunnelPromise;
          } catch (e) {
            logService.trace("tunnelFactory: tunnel provider promise error");
            if (e instanceof Error) {
              return e.message;
            }
            return void 0;
          }
          const localAddress = tunnel.localAddress.startsWith("http") ? tunnel.localAddress : `http://${tunnel.localAddress}`;
          const remoteTunnel = {
            tunnelRemotePort: tunnel.remoteAddress.port,
            tunnelRemoteHost: tunnel.remoteAddress.host,
            // The tunnel factory may give us an inaccessible local address.
            // To make sure this doesn't happen, resolve the uri immediately.
            localAddress: await this.resolveExternalUri(localAddress),
            privacy: tunnel.privacy ?? (tunnel.public ? TunnelPrivacyId.Public : TunnelPrivacyId.Private),
            protocol: tunnel.protocol ?? TunnelProtocol.Http,
            dispose: async () => {
              await tunnel.dispose();
            }
          };
          return remoteTunnel;
        }
      }));
      const tunnelInformation = environmentService.options?.tunnelProvider?.features ? {
        features: {
          elevation: !!environmentService.options?.tunnelProvider?.features?.elevation,
          public: !!environmentService.options?.tunnelProvider?.features?.public,
          privacyOptions,
          protocol: environmentService.options?.tunnelProvider?.features?.protocol === void 0 ? true : !!environmentService.options?.tunnelProvider?.features?.protocol
        }
      } : void 0;
      remoteExplorerService.setTunnelInformation(tunnelInformation);
    }
  }
  async resolveExternalUri(uri) {
    try {
      return (await this.openerService.resolveExternalUri(URI.parse(uri))).resolved.toString();
    } catch {
      return uri;
    }
  }
};
TunnelFactoryContribution.ID = "workbench.contrib.tunnelFactory";
TunnelFactoryContribution = __decorateClass([
  __decorateParam(0, ITunnelService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IRemoteExplorerService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IContextKeyService)
], TunnelFactoryContribution);
export {
  TunnelFactoryContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3R1bm5lbEZhY3RvcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUdW5uZWxTZXJ2aWNlLCBUdW5uZWxPcHRpb25zLCBSZW1vdGVUdW5uZWwsIFR1bm5lbENyZWF0aW9uT3B0aW9ucywgSVR1bm5lbCwgVHVubmVsUHJvdG9jb2wsIFR1bm5lbFByaXZhY3lJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBmb3J3YXJkZWRQb3J0c0ZlYXR1cmVzRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vdHVubmVsTW9kZWwuanMnO1xuXG5leHBvcnQgY2xhc3MgVHVubmVsRmFjdG9yeUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudHVubmVsRmFjdG9yeSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUdW5uZWxTZXJ2aWNlIHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgdHVubmVsRmFjdG9yeSA9IGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxQcm92aWRlcj8udHVubmVsRmFjdG9yeTtcblx0XHRpZiAodHVubmVsRmFjdG9yeSkge1xuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB3ZSBjbGVhcmx5IHdhbnQgdGhlIHBvcnRzIHZpZXcvZmVhdHVyZXMgc2luY2Ugd2UgaGF2ZSBhIHR1bm5lbCBmYWN0b3J5XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoZm9yd2FyZGVkUG9ydHNGZWF0dXJlc0VuYWJsZWQua2V5LCB0cnVlKTtcblx0XHRcdGxldCBwcml2YWN5T3B0aW9ucyA9IGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxQcm92aWRlcj8uZmVhdHVyZXM/LnByaXZhY3lPcHRpb25zID8/IFtdO1xuXHRcdFx0aWYgKGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxQcm92aWRlcj8uZmVhdHVyZXM/LnB1YmxpY1xuXHRcdFx0XHQmJiAocHJpdmFjeU9wdGlvbnMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0XHRwcml2YWN5T3B0aW9ucyA9IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogJ3ByaXZhdGUnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndHVubmVsUHJpdmFjeS5wcml2YXRlJywgXCJQcml2YXRlXCIpLFxuXHRcdFx0XHRcdFx0dGhlbWVJY29uOiAnbG9jaydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiAncHVibGljJyxcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3R1bm5lbFByaXZhY3kucHVibGljJywgXCJQdWJsaWNcIiksXG5cdFx0XHRcdFx0XHR0aGVtZUljb246ICdleWUnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0dW5uZWxTZXJ2aWNlLnNldFR1bm5lbFByb3ZpZGVyKHtcblx0XHRcdFx0Zm9yd2FyZFBvcnQ6IGFzeW5jICh0dW5uZWxPcHRpb25zOiBUdW5uZWxPcHRpb25zLCB0dW5uZWxDcmVhdGlvbk9wdGlvbnM6IFR1bm5lbENyZWF0aW9uT3B0aW9ucyk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdFx0bGV0IHR1bm5lbFByb21pc2U6IFByb21pc2U8SVR1bm5lbD4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHR1bm5lbFByb21pc2UgPSB0dW5uZWxGYWN0b3J5KHR1bm5lbE9wdGlvbnMsIHR1bm5lbENyZWF0aW9uT3B0aW9ucyk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgndHVubmVsRmFjdG9yeTogdHVubmVsIHByb3ZpZGVyIGVycm9yJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCF0dW5uZWxQcm9taXNlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgdHVubmVsOiBJVHVubmVsO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR0dW5uZWwgPSBhd2FpdCB0dW5uZWxQcm9taXNlO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3R1bm5lbEZhY3Rvcnk6IHR1bm5lbCBwcm92aWRlciBwcm9taXNlIGVycm9yJyk7XG5cdFx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlLm1lc3NhZ2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBsb2NhbEFkZHJlc3MgPSB0dW5uZWwubG9jYWxBZGRyZXNzLnN0YXJ0c1dpdGgoJ2h0dHAnKSA/IHR1bm5lbC5sb2NhbEFkZHJlc3MgOiBgaHR0cDovLyR7dHVubmVsLmxvY2FsQWRkcmVzc31gO1xuXHRcdFx0XHRcdGNvbnN0IHJlbW90ZVR1bm5lbDogUmVtb3RlVHVubmVsID0ge1xuXHRcdFx0XHRcdFx0dHVubmVsUmVtb3RlUG9ydDogdHVubmVsLnJlbW90ZUFkZHJlc3MucG9ydCxcblx0XHRcdFx0XHRcdHR1bm5lbFJlbW90ZUhvc3Q6IHR1bm5lbC5yZW1vdGVBZGRyZXNzLmhvc3QsXG5cdFx0XHRcdFx0XHQvLyBUaGUgdHVubmVsIGZhY3RvcnkgbWF5IGdpdmUgdXMgYW4gaW5hY2Nlc3NpYmxlIGxvY2FsIGFkZHJlc3MuXG5cdFx0XHRcdFx0XHQvLyBUbyBtYWtlIHN1cmUgdGhpcyBkb2Vzbid0IGhhcHBlbiwgcmVzb2x2ZSB0aGUgdXJpIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRcdFx0bG9jYWxBZGRyZXNzOiBhd2FpdCB0aGlzLnJlc29sdmVFeHRlcm5hbFVyaShsb2NhbEFkZHJlc3MpLFxuXHRcdFx0XHRcdFx0cHJpdmFjeTogdHVubmVsLnByaXZhY3kgPz8gKHR1bm5lbC5wdWJsaWMgPyBUdW5uZWxQcml2YWN5SWQuUHVibGljIDogVHVubmVsUHJpdmFjeUlkLlByaXZhdGUpLFxuXHRcdFx0XHRcdFx0cHJvdG9jb2w6IHR1bm5lbC5wcm90b2NvbCA/PyBUdW5uZWxQcm90b2NvbC5IdHRwLFxuXHRcdFx0XHRcdFx0ZGlzcG9zZTogYXN5bmMgKCkgPT4geyBhd2FpdCB0dW5uZWwuZGlzcG9zZSgpOyB9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gcmVtb3RlVHVubmVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB0dW5uZWxJbmZvcm1hdGlvbiA9IGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxQcm92aWRlcj8uZmVhdHVyZXMgP1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZmVhdHVyZXM6IHtcblx0XHRcdFx0XHRcdGVsZXZhdGlvbjogISFlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8udHVubmVsUHJvdmlkZXI/LmZlYXR1cmVzPy5lbGV2YXRpb24sXG5cdFx0XHRcdFx0XHRwdWJsaWM6ICEhZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5mZWF0dXJlcz8ucHVibGljLFxuXHRcdFx0XHRcdFx0cHJpdmFjeU9wdGlvbnMsXG5cdFx0XHRcdFx0XHRwcm90b2NvbDogZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5mZWF0dXJlcz8ucHJvdG9jb2wgPT09IHVuZGVmaW5lZCA/IHRydWUgOiAhIWVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxQcm92aWRlcj8uZmVhdHVyZXM/LnByb3RvY29sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IDogdW5kZWZpbmVkO1xuXHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldFR1bm5lbEluZm9ybWF0aW9uKHR1bm5lbEluZm9ybWF0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVFeHRlcm5hbFVyaSh1cmk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLnJlc29sdmVFeHRlcm5hbFVyaShVUkkucGFyc2UodXJpKSkpLnJlc29sdmVkLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBNkUsZ0JBQWdCLHVCQUF1QjtBQUM3SCxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQ0FBcUM7QUFFdkMsSUFBTSw0QkFBTixjQUF3QyxXQUE2QztBQUFBLEVBSTNGLFlBQ2lCLGVBQ3FCLG9CQUNiLGVBQ0EsdUJBQ1gsWUFDTyxtQkFDbkI7QUFDRCxVQUFNO0FBTGtCO0FBTXhCLFVBQU0sZ0JBQWdCLG1CQUFtQixTQUFTLGdCQUFnQjtBQUNsRSxRQUFJLGVBQWU7QUFFbEIsd0JBQWtCLFVBQVUsOEJBQThCLEtBQUssSUFBSTtBQUNuRSxVQUFJLGlCQUFpQixtQkFBbUIsU0FBUyxnQkFBZ0IsVUFBVSxrQkFBa0IsQ0FBQztBQUM5RixVQUFJLG1CQUFtQixTQUFTLGdCQUFnQixVQUFVLFVBQ3JELGVBQWUsV0FBVyxHQUFJO0FBQ2xDLHlCQUFpQjtBQUFBLFVBQ2hCO0FBQUEsWUFDQyxJQUFJO0FBQUEsWUFDSixPQUFPLElBQUksU0FBUyx5QkFBeUIsU0FBUztBQUFBLFlBQ3RELFdBQVc7QUFBQSxVQUNaO0FBQUEsVUFDQTtBQUFBLFlBQ0MsSUFBSTtBQUFBLFlBQ0osT0FBTyxJQUFJLFNBQVMsd0JBQXdCLFFBQVE7QUFBQSxZQUNwRCxXQUFXO0FBQUEsVUFDWjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsV0FBSyxVQUFVLGNBQWMsa0JBQWtCO0FBQUEsUUFDOUMsYUFBYSxPQUFPLGVBQThCLDBCQUE2RjtBQUM5SSxjQUFJO0FBQ0osY0FBSTtBQUNILDRCQUFnQixjQUFjLGVBQWUscUJBQXFCO0FBQUEsVUFDbkUsU0FBUyxHQUFHO0FBQ1gsdUJBQVcsTUFBTSxzQ0FBc0M7QUFBQSxVQUN4RDtBQUVBLGNBQUksQ0FBQyxlQUFlO0FBQ25CLG1CQUFPO0FBQUEsVUFDUjtBQUNBLGNBQUk7QUFDSixjQUFJO0FBQ0gscUJBQVMsTUFBTTtBQUFBLFVBQ2hCLFNBQVMsR0FBRztBQUNYLHVCQUFXLE1BQU0sOENBQThDO0FBQy9ELGdCQUFJLGFBQWEsT0FBTztBQUN2QixxQkFBTyxFQUFFO0FBQUEsWUFDVjtBQUNBLG1CQUFPO0FBQUEsVUFDUjtBQUNBLGdCQUFNLGVBQWUsT0FBTyxhQUFhLFdBQVcsTUFBTSxJQUFJLE9BQU8sZUFBZSxVQUFVLE9BQU8sWUFBWTtBQUNqSCxnQkFBTSxlQUE2QjtBQUFBLFlBQ2xDLGtCQUFrQixPQUFPLGNBQWM7QUFBQSxZQUN2QyxrQkFBa0IsT0FBTyxjQUFjO0FBQUE7QUFBQTtBQUFBLFlBR3ZDLGNBQWMsTUFBTSxLQUFLLG1CQUFtQixZQUFZO0FBQUEsWUFDeEQsU0FBUyxPQUFPLFlBQVksT0FBTyxTQUFTLGdCQUFnQixTQUFTLGdCQUFnQjtBQUFBLFlBQ3JGLFVBQVUsT0FBTyxZQUFZLGVBQWU7QUFBQSxZQUM1QyxTQUFTLFlBQVk7QUFBRSxvQkFBTSxPQUFPLFFBQVE7QUFBQSxZQUFHO0FBQUEsVUFDaEQ7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLFlBQU0sb0JBQW9CLG1CQUFtQixTQUFTLGdCQUFnQixXQUNyRTtBQUFBLFFBQ0MsVUFBVTtBQUFBLFVBQ1QsV0FBVyxDQUFDLENBQUMsbUJBQW1CLFNBQVMsZ0JBQWdCLFVBQVU7QUFBQSxVQUNuRSxRQUFRLENBQUMsQ0FBQyxtQkFBbUIsU0FBUyxnQkFBZ0IsVUFBVTtBQUFBLFVBQ2hFO0FBQUEsVUFDQSxVQUFVLG1CQUFtQixTQUFTLGdCQUFnQixVQUFVLGFBQWEsU0FBWSxPQUFPLENBQUMsQ0FBQyxtQkFBbUIsU0FBUyxnQkFBZ0IsVUFBVTtBQUFBLFFBQ3pKO0FBQUEsTUFDRCxJQUFJO0FBQ0wsNEJBQXNCLHFCQUFxQixpQkFBaUI7QUFBQSxJQUM3RDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLEtBQThCO0FBQzlELFFBQUk7QUFDSCxjQUFRLE1BQU0sS0FBSyxjQUFjLG1CQUFtQixJQUFJLE1BQU0sR0FBRyxDQUFDLEdBQUcsU0FBUyxTQUFTO0FBQUEsSUFDeEYsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBMUZhLDBCQUVJLEtBQUs7QUFGVCw0QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
