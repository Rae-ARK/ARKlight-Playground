import { decodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { joinPath } from "../../../base/common/resources.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { IImageResizeService } from "../common/imageResizeService.js";
class ImageResizeService {
  /**
   * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
   * https://platform.openai.com/docs/guides/vision#calculating-costs
   * @param data - The UInt8Array string of the image to resize.
   * @returns A promise that resolves to the UInt8Array string of the resized image.
   */
  async resizeImage(data, mimeType) {
    const isGif = mimeType === "image/gif";
    if (typeof data === "string") {
      data = this.convertStringToUInt8Array(data);
    }
    return new Promise((resolve, reject) => {
      const blob = new Blob([data], { type: mimeType });
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if ((width <= 768 || height <= 768) && !isGif) {
          resolve(data);
          return;
        }
        if (width > 2048 || height > 2048) {
          const scaleFactor2 = 2048 / Math.max(width, height);
          width = Math.round(width * scaleFactor2);
          height = Math.round(height * scaleFactor2);
        }
        const scaleFactor = 768 / Math.min(width, height);
        width = Math.round(width * scaleFactor);
        height = Math.round(height * scaleFactor);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const jpegTypes = ["image/jpeg", "image/jpg"];
          const outputMimeType = mimeType && jpegTypes.includes(mimeType) ? "image/jpeg" : "image/png";
          canvas.toBlob((blob2) => {
            if (blob2) {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(new Uint8Array(reader.result));
              };
              reader.onerror = (error) => reject(error);
              reader.readAsArrayBuffer(blob2);
            } else {
              reject(new Error("Failed to create blob from canvas"));
            }
          }, outputMimeType);
        } else {
          reject(new Error("Failed to get canvas context"));
        }
      };
      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      };
    });
  }
  convertStringToUInt8Array(data) {
    const base64Data = data.includes(",") ? data.split(",")[1] : data;
    if (this.isValidBase64(base64Data)) {
      return decodeBase64(base64Data).buffer;
    }
    return new TextEncoder().encode(data);
  }
  // Only used for URLs
  convertUint8ArrayToString(data) {
    try {
      const decoder = new TextDecoder();
      const decodedString = decoder.decode(data);
      return decodedString;
    } catch {
      return "";
    }
  }
  isValidBase64(str) {
    try {
      decodeBase64(str);
      return true;
    } catch {
      return false;
    }
  }
  async createFileForMedia(fileService, imagesFolder, dataTransfer, mimeType) {
    const exists = await fileService.exists(imagesFolder);
    if (!exists) {
      await fileService.createFolder(imagesFolder);
    }
    const ext = mimeType.split("/")[1] || "png";
    const filename = `image-${Date.now()}.${ext}`;
    const fileUri = joinPath(imagesFolder, filename);
    const buffer = VSBuffer.wrap(dataTransfer);
    await fileService.writeFile(fileUri, buffer);
    return fileUri;
  }
  async cleanupOldImages(fileService, logService, imagesFolder) {
    const exists = await fileService.exists(imagesFolder);
    if (!exists) {
      return;
    }
    const duration = 7 * 24 * 60 * 60 * 1e3;
    const files = await fileService.resolve(imagesFolder);
    if (!files.children) {
      return;
    }
    await Promise.all(files.children.map(async (file) => {
      try {
        const timestamp = this.getTimestampFromFilename(file.name);
        if (timestamp && Date.now() - timestamp > duration) {
          await fileService.del(file.resource);
        }
      } catch (err) {
        logService.error("Failed to clean up old images", err);
      }
    }));
  }
  getTimestampFromFilename(filename) {
    const match = filename.match(/image-(\d+)\./);
    if (match) {
      return parseInt(match[1], 10);
    }
    return void 0;
  }
}
registerSingleton(IImageResizeService, ImageResizeService, InstantiationType.Delayed);
export {
  ImageResizeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ltYWdlUmVzaXplL2Jyb3dzZXIvaW1hZ2VSZXNpemVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVjb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSW1hZ2VSZXNpemVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2ltYWdlUmVzaXplU2VydmljZS5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIEltYWdlUmVzaXplU2VydmljZSBpbXBsZW1lbnRzIElJbWFnZVJlc2l6ZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXNpemVzIGFuIGltYWdlIHByb3ZpZGVkIGFzIGEgVUludDhBcnJheSBzdHJpbmcuIFJlc2l6aW5nIGlzIGJhc2VkIG9uIE9wZW4gQUkncyBhbGdvcml0aG0gZm9yIHRva2VuemluZyBpbWFnZXMuXG5cdCAqIGh0dHBzOi8vcGxhdGZvcm0ub3BlbmFpLmNvbS9kb2NzL2d1aWRlcy92aXNpb24jY2FsY3VsYXRpbmctY29zdHNcblx0ICogQHBhcmFtIGRhdGEgLSBUaGUgVUludDhBcnJheSBzdHJpbmcgb2YgdGhlIGltYWdlIHRvIHJlc2l6ZS5cblx0ICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIFVJbnQ4QXJyYXkgc3RyaW5nIG9mIHRoZSByZXNpemVkIGltYWdlLlxuXHQgKi9cblxuXHRhc3luYyByZXNpemVJbWFnZShkYXRhOiBVaW50OEFycmF5IHwgc3RyaW5nLCBtaW1lVHlwZT86IHN0cmluZyk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IGlzR2lmID0gbWltZVR5cGUgPT09ICdpbWFnZS9naWYnO1xuXG5cdFx0aWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuXHRcdFx0ZGF0YSA9IHRoaXMuY29udmVydFN0cmluZ1RvVUludDhBcnJheShkYXRhKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgYmxvYiA9IG5ldyBCbG9iKFtkYXRhIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+XSwgeyB0eXBlOiBtaW1lVHlwZSB9KTtcblx0XHRcdGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xuXHRcdFx0Y29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblx0XHRcdGltZy5zcmMgPSB1cmw7XG5cblx0XHRcdGltZy5vbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHRcdFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcblx0XHRcdFx0bGV0IHsgd2lkdGgsIGhlaWdodCB9ID0gaW1nO1xuXG5cdFx0XHRcdGlmICgod2lkdGggPD0gNzY4IHx8IGhlaWdodCA8PSA3NjgpICYmICFpc0dpZikge1xuXHRcdFx0XHRcdHJlc29sdmUoZGF0YSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2FsY3VsYXRlIHRoZSBuZXcgZGltZW5zaW9ucyB3aGlsZSBtYWludGFpbmluZyB0aGUgYXNwZWN0IHJhdGlvXG5cdFx0XHRcdGlmICh3aWR0aCA+IDIwNDggfHwgaGVpZ2h0ID4gMjA0OCkge1xuXHRcdFx0XHRcdGNvbnN0IHNjYWxlRmFjdG9yID0gMjA0OCAvIE1hdGgubWF4KHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0XHRcdHdpZHRoID0gTWF0aC5yb3VuZCh3aWR0aCAqIHNjYWxlRmFjdG9yKTtcblx0XHRcdFx0XHRoZWlnaHQgPSBNYXRoLnJvdW5kKGhlaWdodCAqIHNjYWxlRmFjdG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNjYWxlRmFjdG9yID0gNzY4IC8gTWF0aC5taW4od2lkdGgsIGhlaWdodCk7XG5cdFx0XHRcdHdpZHRoID0gTWF0aC5yb3VuZCh3aWR0aCAqIHNjYWxlRmFjdG9yKTtcblx0XHRcdFx0aGVpZ2h0ID0gTWF0aC5yb3VuZChoZWlnaHQgKiBzY2FsZUZhY3Rvcik7XG5cblx0XHRcdFx0Y29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdFx0XHRcdGNhbnZhcy53aWR0aCA9IHdpZHRoO1xuXHRcdFx0XHRjYW52YXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdFx0XHRjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0XHRcdFx0aWYgKGN0eCkge1xuXHRcdFx0XHRcdGN0eC5kcmF3SW1hZ2UoaW1nLCAwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcblxuXHRcdFx0XHRcdGNvbnN0IGpwZWdUeXBlcyA9IFsnaW1hZ2UvanBlZycsICdpbWFnZS9qcGcnXTtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXRNaW1lVHlwZSA9IG1pbWVUeXBlICYmIGpwZWdUeXBlcy5pbmNsdWRlcyhtaW1lVHlwZSkgPyAnaW1hZ2UvanBlZycgOiAnaW1hZ2UvcG5nJztcblxuXHRcdFx0XHRcdGNhbnZhcy50b0Jsb2IoYmxvYiA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoYmxvYikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXHRcdFx0XHRcdFx0XHRyZWFkZXIub25sb2FkID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmUobmV3IFVpbnQ4QXJyYXkocmVhZGVyLnJlc3VsdCBhcyBBcnJheUJ1ZmZlcikpO1xuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRyZWFkZXIub25lcnJvciA9IChlcnJvcikgPT4gcmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHRcdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBibG9iIGZyb20gY2FudmFzJykpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIG91dHB1dE1pbWVUeXBlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IGNhbnZhcyBjb250ZXh0JykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0aW1nLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcblx0XHRcdFx0VVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuXHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGNvbnZlcnRTdHJpbmdUb1VJbnQ4QXJyYXkoZGF0YTogc3RyaW5nKTogVWludDhBcnJheSB7XG5cdFx0Y29uc3QgYmFzZTY0RGF0YSA9IGRhdGEuaW5jbHVkZXMoJywnKSA/IGRhdGEuc3BsaXQoJywnKVsxXSA6IGRhdGE7XG5cdFx0aWYgKHRoaXMuaXNWYWxpZEJhc2U2NChiYXNlNjREYXRhKSkge1xuXHRcdFx0cmV0dXJuIGRlY29kZUJhc2U2NChiYXNlNjREYXRhKS5idWZmZXI7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoZGF0YSk7XG5cdH1cblxuXHQvLyBPbmx5IHVzZWQgZm9yIFVSTHNcblx0Y29udmVydFVpbnQ4QXJyYXlUb1N0cmluZyhkYXRhOiBVaW50OEFycmF5KTogc3RyaW5nIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXHRcdFx0Y29uc3QgZGVjb2RlZFN0cmluZyA9IGRlY29kZXIuZGVjb2RlKGRhdGEpO1xuXHRcdFx0cmV0dXJuIGRlY29kZWRTdHJpbmc7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHR9XG5cblx0aXNWYWxpZEJhc2U2NChzdHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHRyeSB7XG5cdFx0XHRkZWNvZGVCYXNlNjQoc3RyKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUZpbGVGb3JNZWRpYShmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBpbWFnZXNGb2xkZXI6IFVSSSwgZGF0YVRyYW5zZmVyOiBVaW50OEFycmF5LCBtaW1lVHlwZTogc3RyaW5nKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoaW1hZ2VzRm9sZGVyKTtcblx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGltYWdlc0ZvbGRlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ID0gbWltZVR5cGUuc3BsaXQoJy8nKVsxXSB8fCAncG5nJztcblx0XHRjb25zdCBmaWxlbmFtZSA9IGBpbWFnZS0ke0RhdGUubm93KCl9LiR7ZXh0fWA7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IGpvaW5QYXRoKGltYWdlc0ZvbGRlciwgZmlsZW5hbWUpO1xuXG5cdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIud3JhcChkYXRhVHJhbnNmZXIpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShmaWxlVXJpLCBidWZmZXIpO1xuXG5cdFx0cmV0dXJuIGZpbGVVcmk7XG5cdH1cblxuXHRhc3luYyBjbGVhbnVwT2xkSW1hZ2VzKGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBpbWFnZXNGb2xkZXI6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhpbWFnZXNGb2xkZXIpO1xuXHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHVyYXRpb24gPSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gNyBkYXlzXG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGltYWdlc0ZvbGRlcik7XG5cdFx0aWYgKCFmaWxlcy5jaGlsZHJlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKGZpbGVzLmNoaWxkcmVuLm1hcChhc3luYyAoZmlsZSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdGltZXN0YW1wID0gdGhpcy5nZXRUaW1lc3RhbXBGcm9tRmlsZW5hbWUoZmlsZS5uYW1lKTtcblx0XHRcdFx0aWYgKHRpbWVzdGFtcCAmJiAoRGF0ZS5ub3coKSAtIHRpbWVzdGFtcCA+IGR1cmF0aW9uKSkge1xuXHRcdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChmaWxlLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjbGVhbiB1cCBvbGQgaW1hZ2VzJywgZXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRUaW1lc3RhbXBGcm9tRmlsZW5hbWUoZmlsZW5hbWU6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBmaWxlbmFtZS5tYXRjaCgvaW1hZ2UtKFxcZCspXFwuLyk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VJbnQobWF0Y2hbMV0sIDEwKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUltYWdlUmVzaXplU2VydmljZSwgSW1hZ2VSZXNpemVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELFNBQVMsMkJBQTJCO0FBRzdCLE1BQU0sbUJBQWtEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXOUQsTUFBTSxZQUFZLE1BQTJCLFVBQXdD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Q0Q7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLGFBQTJCLGNBQW1CLGNBQTBCLFVBQTRDO0FBQzVJLFVBQU0sU0FBUyxNQUFNLFlBQVksT0FBTyxZQUFZO0FBQ3BELFFBQUksQ0FBQyxRQUFRO0FBQ1osWUFBTSxZQUFZLGFBQWEsWUFBWTtBQUFBLElBQzVDO0FBRUEsVUFBTSxNQUFNLFNBQVMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLO0FBQ3RDLFVBQU0sV0FBVyxTQUFTLEtBQUssSUFBSSxDQUFDLElBQUksR0FBRztBQUMzQyxVQUFNLFVBQVUsU0FBUyxjQUFjLFFBQVE7QUFFL0MsVUFBTSxTQUFTLFNBQVMsS0FBSyxZQUFZO0FBQ3pDLFVBQU0sWUFBWSxVQUFVLFNBQVMsTUFBTTtBQUUzQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxpQkFBaUIsYUFBMkIsWUFBeUIsY0FBa0M7QUFDNUcsVUFBTSxTQUFTLE1BQU0sWUFBWSxPQUFPLFlBQVk7QUFDcEQsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssS0FBSztBQUNwQyxVQUFNLFFBQVEsTUFBTSxZQUFZLFFBQVEsWUFBWTtBQUNwRCxRQUFJLENBQUMsTUFBTSxVQUFVO0FBQ3BCO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxJQUFJLE1BQU0sU0FBUyxJQUFJLE9BQU8sU0FBUztBQUNwRCxVQUFJO0FBQ0gsY0FBTSxZQUFZLEtBQUsseUJBQXlCLEtBQUssSUFBSTtBQUN6RCxZQUFJLGFBQWMsS0FBSyxJQUFJLElBQUksWUFBWSxVQUFXO0FBQ3JELGdCQUFNLFlBQVksSUFBSSxLQUFLLFFBQVE7QUFBQSxRQUNwQztBQUFBLE1BQ0QsU0FBUyxLQUFLO0FBQ2IsbUJBQVcsTUFBTSxpQ0FBaUMsR0FBRztBQUFBLE1BQ3REO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSx5QkFBeUIsVUFBc0M7QUFDOUQsVUFBTSxRQUFRLFNBQVMsTUFBTSxlQUFlO0FBQzVDLFFBQUksT0FBTztBQUNWLGFBQU8sU0FBUyxNQUFNLENBQUMsR0FBRyxFQUFFO0FBQUEsSUFDN0I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUdEO0FBRUEsa0JBQWtCLHFCQUFxQixvQkFBb0Isa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbInNjYWxlRmFjdG9yIiwgImJsb2IiXQp9Cg==
