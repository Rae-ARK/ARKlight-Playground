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
import { addDisposableListener, clearNode, EventType, h } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { ImageCarouselEditorInput } from "./imageCarouselEditorInput.js";
import { isVideoMimeType } from "./imageCarouselTypes.js";
const SCALE_PINCH_FACTOR = 0.075;
const MAX_SCALE = 20;
const MIN_SCALE = 0.1;
const PIXELATION_THRESHOLD = 3;
const ZOOM_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7, 10, 15, 20];
let ImageCarouselEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, _fileService, _webviewService) {
    super(ImageCarouselEditor.ID, group, telemetryService, themeService, storageService);
    this._fileService = _fileService;
    this._webviewService = _webviewService;
    this._currentIndex = 0;
    this._zoomScale = "fit";
    this._sections = [];
    this._flatImages = [];
    this._contentDisposables = this._register(new DisposableStore());
    this._imageDisposables = this._register(new DisposableStore());
    this._blobUrlCache = /* @__PURE__ */ new Map();
    this._thumbnailElements = [];
  }
  createEditor(parent) {
    this._container = h("div.image-carousel-editor").root;
    parent.appendChild(this._container);
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this._sections = input.collection.sections;
    this._flatImages = [];
    for (let s = 0; s < this._sections.length; s++) {
      for (let i = 0; i < this._sections[s].images.length; i++) {
        this._flatImages.push({ sectionIndex: s, imageIndexInSection: i, image: this._sections[s].images[i] });
      }
    }
    this._currentIndex = Math.min(input.startIndex, Math.max(0, this._flatImages.length - 1));
    this.buildSlideshow();
  }
  clearInput() {
    this._videoWebview?.dispose();
    this._videoWebview = void 0;
    this._contentDisposables.clear();
    this._imageDisposables.clear();
    this._revokeCachedBlobUrls();
    this._zoomScale = "fit";
    if (this._container) {
      clearNode(this._container);
    }
    this._elements = void 0;
    this._thumbnailElements = [];
    super.clearInput();
  }
  _isCurrentVideo() {
    const entry = this._flatImages[this._currentIndex];
    return !!entry && isVideoMimeType(entry.image.mimeType);
  }
  /**
   * Build the full DOM skeleton. Called once per setInput.
   */
  buildSlideshow() {
    if (!this._container) {
      return;
    }
    this._contentDisposables.clear();
    this._imageDisposables.clear();
    this._revokeCachedBlobUrls();
    clearNode(this._container);
    if (this._flatImages.length === 0) {
      const empty = h("div.empty-message");
      empty.root.textContent = localize("imageCarousel.noImages", "No images to display");
      this._container.appendChild(empty.root);
      return;
    }
    const elements = h("div.slideshow-container", [
      h("div.image-area@imageArea", [
        h("div.main-image-container@mainImageContainer", [
          h("img.main-image@mainImage"),
          h("div.video-container@videoContainer")
        ]),
        h("button.nav-arrow.prev-arrow@prevBtn", { ariaLabel: localize("imageCarousel.previousImage", "Previous image") }, [
          h("span.codicon.codicon-chevron-left", { ariaHidden: "true" })
        ]),
        h("button.nav-arrow.next-arrow@nextBtn", { ariaLabel: localize("imageCarousel.nextImage", "Next image") }, [
          h("span.codicon.codicon-chevron-right", { ariaHidden: "true" })
        ])
      ]),
      h("div.bottom-bar@bottomBar", [
        h("div.image-info-bar", [
          h("span.caption-text@captionText"),
          h("span.caption-separator@captionSeparator"),
          h("span.image-counter@counter")
        ]),
        h("div.sections-container@sectionsContainer"),
        h("span.sr-only@ariaStatus")
      ])
    ]);
    elements.root.setAttribute("role", "group");
    elements.root.setAttribute("aria-label", localize("imageCarousel.ariaLabel", "Images Preview"));
    elements.captionSeparator.setAttribute("aria-hidden", "true");
    elements.ariaStatus.setAttribute("aria-live", "polite");
    elements.ariaStatus.setAttribute("aria-atomic", "true");
    elements.sectionsContainer.setAttribute("role", "group");
    elements.sectionsContainer.setAttribute("aria-label", localize("imageCarousel.thumbnails", "Image thumbnails"));
    this._elements = {
      root: elements.root,
      imageArea: elements.imageArea,
      mainImageContainer: elements.mainImageContainer,
      mainImage: elements.mainImage,
      videoContainer: elements.videoContainer,
      captionText: elements.captionText,
      captionSeparator: elements.captionSeparator,
      counter: elements.counter,
      ariaStatus: elements.ariaStatus,
      prevBtn: elements.prevBtn,
      nextBtn: elements.nextBtn,
      sectionsContainer: elements.sectionsContainer
    };
    this._elements.mainImage.classList.add("scale-to-fit");
    this._elements.mainImage.alt = "";
    this._elements.videoContainer.style.display = "none";
    this._contentDisposables.add(addDisposableListener(this._elements.prevBtn, "click", () => {
      if (this._currentIndex > 0) {
        this._currentIndex--;
        this.updateCurrentImage();
      }
    }));
    this._contentDisposables.add(addDisposableListener(this._elements.nextBtn, "click", () => {
      if (this._currentIndex < this._flatImages.length - 1) {
        this._currentIndex++;
        this.updateCurrentImage();
      }
    }));
    this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.LeftArrow) {
        this.previous();
        event.stopPropagation();
        event.preventDefault();
      } else if (event.keyCode === KeyCode.RightArrow) {
        this.next();
        event.stopPropagation();
        event.preventDefault();
      }
    }));
    elements.root.tabIndex = 0;
    this._contentDisposables.add(addDisposableListener(this._elements.imageArea, EventType.MOUSE_WHEEL, (e) => {
      if (this._isCurrentVideo()) {
        return;
      }
      const isZoomModifier = isMacintosh ? e.altKey : e.ctrlKey;
      if (!isZoomModifier && !e.ctrlKey) {
        return;
      }
      e.preventDefault();
      if (e.deltaY === 0) {
        return;
      }
      if (this._zoomScale === "fit") {
        this._initZoomFromFit();
      }
      const delta = e.deltaY > 0 ? 1 : -1;
      this._applyZoom(this._zoomScale * (1 - delta * SCALE_PINCH_FACTOR));
    }, { passive: false }));
    let clickCtrlPressed = false;
    let clickAltPressed = false;
    this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.MOUSE_DOWN, (e) => {
      if (e.button !== 0) {
        return;
      }
      clickCtrlPressed = e.ctrlKey;
      clickAltPressed = e.altKey;
    }));
    this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.CLICK, (e) => {
      if (e.button !== 0 || this._isCurrentVideo()) {
        return;
      }
      const isZoomOut = isMacintosh ? clickAltPressed : clickCtrlPressed;
      if (isZoomOut) {
        this._zoomOut();
      } else {
        this._zoomIn();
      }
    }));
    const updateZoomCursor = (e) => {
      const isZoomOut = isMacintosh ? e.altKey : e.ctrlKey;
      this._elements.mainImageContainer.classList.toggle("zoom-out", isZoomOut);
    };
    this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_DOWN, updateZoomCursor));
    this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_UP, updateZoomCursor));
    this._thumbnailElements = [];
    let flatIndex = 0;
    for (let s = 0; s < this._sections.length; s++) {
      const section = this._sections[s];
      if (s > 0 && this._sections.length > 1) {
        const separator = h("div.thumbnail-separator").root;
        separator.setAttribute("aria-hidden", "true");
        this._elements.sectionsContainer.appendChild(separator);
      }
      for (let i = 0; i < section.images.length; i++) {
        const image = section.images[i];
        const currentFlatIndex = flatIndex;
        const isItemVideo = isVideoMimeType(image.mimeType);
        const btn = document.createElement("button");
        btn.className = isItemVideo ? "thumbnail video-thumbnail" : "thumbnail";
        btn.ariaLabel = isItemVideo ? localize("imageCarousel.thumbnailLabelVideo", "Video {0} of {1}", currentFlatIndex + 1, this._flatImages.length) : localize("imageCarousel.thumbnailLabelImage", "Image {0} of {1}", currentFlatIndex + 1, this._flatImages.length);
        if (isItemVideo) {
          const icon = h("span.codicon.codicon-play.thumbnail-play-icon");
          icon.root.setAttribute("aria-hidden", "true");
          btn.appendChild(icon.root);
        } else {
          const img = document.createElement("img");
          img.className = "thumbnail-image";
          img.alt = image.name;
          const thumbnailDisposables = this._contentDisposables.add(new DisposableStore());
          const markBroken = () => {
            if (thumbnailDisposables.isDisposed) {
              return;
            }
            if (!btn.classList.contains("broken")) {
              btn.classList.add("broken");
              img.removeAttribute("src");
              img.alt = "";
              img.remove();
              const fallback = h("span.codicon.codicon-warning.thumbnail-broken-icon");
              fallback.root.setAttribute("aria-hidden", "true");
              btn.appendChild(fallback.root);
            }
          };
          this._loadBlobUrl(image).then((url) => {
            if (thumbnailDisposables.isDisposed) {
              return;
            }
            if (url) {
              const preloader = new Image();
              thumbnailDisposables.add(addDisposableListener(preloader, "load", () => {
                if (btn.classList.contains("broken")) {
                  return;
                }
                img.src = url;
                if (!img.parentElement) {
                  btn.appendChild(img);
                }
              }));
              thumbnailDisposables.add(addDisposableListener(preloader, "error", () => {
                markBroken();
              }));
              preloader.src = url;
            } else {
              markBroken();
            }
          }, () => {
            markBroken();
          });
          thumbnailDisposables.add(addDisposableListener(img, "error", () => {
            markBroken();
          }));
        }
        this._contentDisposables.add(addDisposableListener(btn, "click", () => {
          this._currentIndex = currentFlatIndex;
          this.updateCurrentImage();
        }));
        this._elements.sectionsContainer.appendChild(btn);
        this._thumbnailElements.push(btn);
        flatIndex++;
      }
    }
    this._container.appendChild(elements.root);
    this.updateCurrentImage();
  }
  /**
   * Update only the changing parts: main image src, caption, button states, thumbnail selection.
   * No DOM teardown/rebuild — eliminates the blank flash.
   */
  async updateCurrentImage() {
    if (!this._elements) {
      return;
    }
    const navigationIndex = this._currentIndex;
    const entry = this._flatImages[navigationIndex];
    const currentImage = entry.image;
    const isVideo = isVideoMimeType(currentImage.mimeType);
    if (isVideo) {
      this._elements.mainImage.style.display = "none";
      this._elements.videoContainer.style.display = "";
      this._elements.mainImageContainer.classList.remove("zoomed");
      this._elements.mainImageContainer.style.cursor = "default";
      const rawData = await this._loadRawData(currentImage);
      if (this._currentIndex !== navigationIndex) {
        return;
      }
      const nonce = generateUuid();
      const videoHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src blob: data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}
video{width:100%;height:100%;object-fit:contain;outline:none}</style>
</head><body>
<video id="v" controls></video>
<script nonce="${nonce}">
window.addEventListener("message",function(e){var m=e.data;if(m.type==="loadVideo"){var b=new Blob([m.data],{type:m.mimeType});document.getElementById("v").src=URL.createObjectURL(b);}});
<\/script>
</body></html>`;
      let webview;
      if (!this._videoWebview) {
        webview = this._contentDisposables.add(this._webviewService.createWebviewElement({
          title: currentImage.name,
          options: { disableServiceWorker: true },
          contentOptions: { allowScripts: true },
          extension: void 0
        }));
        webview.mountTo(this._elements.videoContainer, this.window);
        this._videoWebview = webview;
      } else {
        webview = this._videoWebview;
      }
      webview.setHtml(videoHtml);
      const buffer = rawData.buffer;
      webview.postMessage({ type: "loadVideo", data: buffer, mimeType: currentImage.mimeType }, [buffer]);
    } else {
      this._elements.videoContainer.style.display = "none";
      this._elements.mainImage.style.display = "";
      this._elements.mainImageContainer.style.cursor = "";
      const url = await this._loadBlobUrl(currentImage);
      if (this._currentIndex !== navigationIndex) {
        return;
      }
      const tmp = new Image();
      tmp.src = url;
      tmp.decode().then(() => {
        if (this._currentIndex === navigationIndex && this._elements) {
          this._elements.mainImage.src = url;
          this._elements.mainImage.alt = currentImage.name;
        }
      }, () => {
        if (this._currentIndex === navigationIndex && this._elements) {
          this._elements.mainImage.src = url;
          this._elements.mainImage.alt = currentImage.name;
        }
      });
    }
    this._applyZoom("fit");
    if (currentImage.caption) {
      this._elements.captionText.textContent = currentImage.caption;
      this._elements.captionText.style.display = "";
      this._elements.captionSeparator.style.display = "";
    } else {
      this._elements.captionText.textContent = "";
      this._elements.captionText.style.display = "none";
      this._elements.captionSeparator.style.display = "none";
    }
    this._elements.counter.textContent = localize("imageCarousel.counter", "{0} / {1}", navigationIndex + 1, this._flatImages.length);
    const itemKind = isVideo ? localize("imageCarousel.kindVideo", "Video") : localize("imageCarousel.kindImage", "Image");
    this._elements.ariaStatus.textContent = currentImage.caption ? localize("imageCarousel.statusWithCaption", "{0} {1} of {2}: {3}", itemKind, navigationIndex + 1, this._flatImages.length, currentImage.caption) : localize("imageCarousel.statusWithName", "{0} {1} of {2}: {3}", itemKind, navigationIndex + 1, this._flatImages.length, currentImage.name);
    this._elements.prevBtn.disabled = navigationIndex === 0;
    this._elements.nextBtn.disabled = navigationIndex === this._flatImages.length - 1;
    for (let i = 0; i < this._thumbnailElements.length; i++) {
      const isActive = i === navigationIndex;
      const thumbnail = this._thumbnailElements[i];
      thumbnail.classList.toggle("active", isActive);
      if (isActive) {
        thumbnail.setAttribute("aria-current", "page");
      } else {
        thumbnail.removeAttribute("aria-current");
      }
    }
    const activeThumbnail = this._thumbnailElements[navigationIndex];
    if (activeThumbnail) {
      activeThumbnail.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    if (this.input instanceof ImageCarouselEditorInput) {
      const currentSection = this._sections[entry.sectionIndex];
      this.input.setName(currentSection.title || this.input.collection.title);
    }
    this._preloadAdjacentImages();
  }
  async _loadBlobUrl(image) {
    const cached = this._blobUrlCache.get(image.id);
    if (cached) {
      return cached;
    }
    let buffer;
    if (image.data) {
      buffer = image.data instanceof Uint8Array ? image.data : image.data.buffer;
    } else if (image.uri) {
      const content = await this._fileService.readFile(image.uri);
      buffer = content.value.buffer;
    } else {
      return "";
    }
    const blob = new Blob([buffer], { type: image.mimeType });
    const url = URL.createObjectURL(blob);
    this._blobUrlCache.set(image.id, url);
    return url;
  }
  _revokeCachedBlobUrls() {
    for (const url of this._blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this._blobUrlCache.clear();
  }
  async _loadRawData(image) {
    if (image.data) {
      return image.data instanceof Uint8Array ? image.data : image.data.buffer;
    } else if (image.uri) {
      const content = await this._fileService.readFile(image.uri);
      return content.value.buffer;
    }
    return new Uint8Array(0);
  }
  _preloadAdjacentImages() {
    for (const idx of [this._currentIndex - 1, this._currentIndex + 1]) {
      if (idx >= 0 && idx < this._flatImages.length) {
        const adjacentImage = this._flatImages[idx].image;
        if (isVideoMimeType(adjacentImage.mimeType)) {
          this._loadRawData(adjacentImage).catch(() => {
          });
        } else {
          this._loadBlobUrl(adjacentImage).then((url) => {
            const img = new Image();
            img.src = url;
            img.decode().catch(() => {
            });
          });
        }
      }
    }
  }
  previous() {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      this.updateCurrentImage();
    }
  }
  next() {
    if (this._currentIndex < this._flatImages.length - 1) {
      this._currentIndex++;
      this.updateCurrentImage();
    }
  }
  /**
   * Compute the current display scale when transitioning from 'fit' to numeric zoom.
   */
  _initZoomFromFit() {
    if (!this._elements) {
      return;
    }
    const img = this._elements.mainImage;
    if (img.naturalWidth > 0) {
      this._zoomScale = img.clientWidth / img.naturalWidth;
    } else {
      this._zoomScale = 1;
    }
  }
  /**
   * Zoom in to the next predefined zoom level.
   */
  _zoomIn() {
    if (this._zoomScale === "fit") {
      this._initZoomFromFit();
    }
    const scale = this._zoomScale;
    let i = 0;
    for (; i < ZOOM_LEVELS.length; ++i) {
      if (ZOOM_LEVELS[i] > scale) {
        break;
      }
    }
    this._applyZoom(ZOOM_LEVELS[i] ?? MAX_SCALE);
  }
  /**
   * Zoom out to the previous predefined zoom level.
   */
  _zoomOut() {
    if (this._zoomScale === "fit") {
      this._initZoomFromFit();
    }
    const scale = this._zoomScale;
    let i = ZOOM_LEVELS.length - 1;
    for (; i >= 0; --i) {
      if (ZOOM_LEVELS[i] < scale) {
        break;
      }
    }
    this._applyZoom(ZOOM_LEVELS[i] ?? MIN_SCALE);
  }
  /**
   * Apply fit-to-container or numeric zoom with scroll-center preservation.
   */
  _applyZoom(newScale) {
    if (!this._elements) {
      return;
    }
    const container = this._elements.mainImageContainer;
    const img = this._elements.mainImage;
    if (newScale === "fit") {
      this._zoomScale = "fit";
      img.classList.add("scale-to-fit");
      img.classList.remove("pixelated");
      img.style.zoom = "";
      const wasZoomed = container.classList.contains("zoomed");
      container.classList.remove("zoomed");
      container.classList.remove("zoom-out");
      if (wasZoomed) {
        container.scrollTo(0, 0);
      }
    } else {
      const scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
      this._zoomScale = scale;
      const dx = container.scrollWidth > 0 ? (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth : 0.5;
      const dy = container.scrollHeight > 0 ? (container.scrollTop + container.clientHeight / 2) / container.scrollHeight : 0.5;
      img.classList.remove("scale-to-fit");
      img.classList.toggle("pixelated", scale >= PIXELATION_THRESHOLD);
      img.style.zoom = String(scale);
      container.classList.add("zoomed");
      const newScrollX = container.scrollWidth * dx - container.clientWidth / 2;
      const newScrollY = container.scrollHeight * dy - container.clientHeight / 2;
      container.scrollTo(newScrollX, newScrollY);
    }
  }
  focus() {
    super.focus();
    this._elements?.root.focus();
  }
  layout(dimension) {
    if (this._container) {
      this._container.style.width = `${dimension.width}px`;
      this._container.style.height = `${dimension.height}px`;
    }
  }
};
ImageCarouselEditor.ID = "workbench.editor.imageCarousel";
ImageCarouselEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IWebviewService)
], ImageCarouselEditor);
export {
  ImageCarouselEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ltYWdlQ2Fyb3VzZWwvYnJvd3Nlci9pbWFnZUNhcm91c2VsRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBjbGVhck5vZGUsIERpbWVuc2lvbiwgRXZlbnRUeXBlLCBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXZWJ2aWV3RWxlbWVudCwgSVdlYnZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0IH0gZnJvbSAnLi9pbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNhcm91c2VsSW1hZ2UsIElDYXJvdXNlbFNlY3Rpb24sIGlzVmlkZW9NaW1lVHlwZSB9IGZyb20gJy4vaW1hZ2VDYXJvdXNlbFR5cGVzLmpzJztcblxuLyoqXG4gKiBBIGZsYXQgZW50cnkgcmVmZXJlbmNpbmcgYSBzcGVjaWZpYyBpbWFnZSB3aXRoaW4gYSBzZWN0aW9uLCB1c2VkXG4gKiBmb3IgZ2xvYmFsIGluZGV4LWJhc2VkIG5hdmlnYXRpb24gYWNyb3NzIGFsbCBzZWN0aW9ucy5cbiAqL1xuaW50ZXJmYWNlIElGbGF0SW1hZ2VFbnRyeSB7XG5cdHJlYWRvbmx5IHNlY3Rpb25JbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBpbWFnZUluZGV4SW5TZWN0aW9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IGltYWdlOiBJQ2Fyb3VzZWxJbWFnZTtcbn1cblxudHlwZSBab29tU2NhbGUgPSBudW1iZXIgfCAnZml0JztcblxuY29uc3QgU0NBTEVfUElOQ0hfRkFDVE9SID0gMC4wNzU7XG5jb25zdCBNQVhfU0NBTEUgPSAyMDtcbmNvbnN0IE1JTl9TQ0FMRSA9IDAuMTtcbmNvbnN0IFBJWEVMQVRJT05fVEhSRVNIT0xEID0gMztcbmNvbnN0IFpPT01fTEVWRUxTID0gWzAuMSwgMC4yLCAwLjMsIDAuNCwgMC41LCAwLjYsIDAuNywgMC44LCAwLjksIDEsIDEuNSwgMiwgMywgNSwgNywgMTAsIDE1LCAyMF07XG5cbmV4cG9ydCBjbGFzcyBJbWFnZUNhcm91c2VsRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZWRpdG9yLmltYWdlQ2Fyb3VzZWwnO1xuXG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRJbmRleDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfem9vbVNjYWxlOiBab29tU2NhbGUgPSAnZml0Jztcblx0cHJpdmF0ZSBfc2VjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUNhcm91c2VsU2VjdGlvbj4gPSBbXTtcblx0cHJpdmF0ZSBfZmxhdEltYWdlczogSUZsYXRJbWFnZUVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW1hZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jsb2JVcmxDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSBfdmlkZW9XZWJ2aWV3OiBJV2Vidmlld0VsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VsZW1lbnRzOiB7XG5cdFx0cm9vdDogSFRNTEVsZW1lbnQ7XG5cdFx0aW1hZ2VBcmVhOiBIVE1MRWxlbWVudDtcblx0XHRtYWluSW1hZ2VDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRcdG1haW5JbWFnZTogSFRNTEltYWdlRWxlbWVudDtcblx0XHR2aWRlb0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0Y2FwdGlvblRleHQ6IEhUTUxFbGVtZW50O1xuXHRcdGNhcHRpb25TZXBhcmF0b3I6IEhUTUxFbGVtZW50O1xuXHRcdGNvdW50ZXI6IEhUTUxFbGVtZW50O1xuXHRcdGFyaWFTdGF0dXM6IEhUTUxFbGVtZW50O1xuXHRcdHByZXZCdG46IEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdG5leHRCdG46IEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdHNlY3Rpb25zQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0fSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGh1bWJuYWlsRWxlbWVudHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdlYnZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoSW1hZ2VDYXJvdXNlbEVkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gaCgnZGl2LmltYWdlLWNhcm91c2VsLWVkaXRvcicpLnJvb3Q7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuX2NvbnRhaW5lcik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0dGhpcy5fc2VjdGlvbnMgPSBpbnB1dC5jb2xsZWN0aW9uLnNlY3Rpb25zO1xuXHRcdHRoaXMuX2ZsYXRJbWFnZXMgPSBbXTtcblx0XHRmb3IgKGxldCBzID0gMDsgcyA8IHRoaXMuX3NlY3Rpb25zLmxlbmd0aDsgcysrKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlY3Rpb25zW3NdLmltYWdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR0aGlzLl9mbGF0SW1hZ2VzLnB1c2goeyBzZWN0aW9uSW5kZXg6IHMsIGltYWdlSW5kZXhJblNlY3Rpb246IGksIGltYWdlOiB0aGlzLl9zZWN0aW9uc1tzXS5pbWFnZXNbaV0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRJbmRleCA9IE1hdGgubWluKGlucHV0LnN0YXJ0SW5kZXgsIE1hdGgubWF4KDAsIHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoIC0gMSkpO1xuXHRcdHRoaXMuYnVpbGRTbGlkZXNob3coKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlkZW9XZWJ2aWV3Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdmlkZW9XZWJ2aWV3ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2ltYWdlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9yZXZva2VDYWNoZWRCbG9iVXJscygpO1xuXHRcdHRoaXMuX3pvb21TY2FsZSA9ICdmaXQnO1xuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdGNsZWFyTm9kZSh0aGlzLl9jb250YWluZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9lbGVtZW50cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aHVtYm5haWxFbGVtZW50cyA9IFtdO1xuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ3VycmVudFZpZGVvKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZmxhdEltYWdlc1t0aGlzLl9jdXJyZW50SW5kZXhdO1xuXHRcdHJldHVybiAhIWVudHJ5ICYmIGlzVmlkZW9NaW1lVHlwZShlbnRyeS5pbWFnZS5taW1lVHlwZSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIGZ1bGwgRE9NIHNrZWxldG9uLiBDYWxsZWQgb25jZSBwZXIgc2V0SW5wdXQuXG5cdCAqL1xuXHRwcml2YXRlIGJ1aWxkU2xpZGVzaG93KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5faW1hZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3Jldm9rZUNhY2hlZEJsb2JVcmxzKCk7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHRpZiAodGhpcy5fZmxhdEltYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IGVtcHR5ID0gaCgnZGl2LmVtcHR5LW1lc3NhZ2UnKTtcblx0XHRcdGVtcHR5LnJvb3QudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5ub0ltYWdlcycsIFwiTm8gaW1hZ2VzIHRvIGRpc3BsYXlcIik7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQoZW1wdHkucm9vdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSBoKCdkaXYuc2xpZGVzaG93LWNvbnRhaW5lcicsIFtcblx0XHRcdGgoJ2Rpdi5pbWFnZS1hcmVhQGltYWdlQXJlYScsIFtcblx0XHRcdFx0aCgnZGl2Lm1haW4taW1hZ2UtY29udGFpbmVyQG1haW5JbWFnZUNvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRoKCdpbWcubWFpbi1pbWFnZUBtYWluSW1hZ2UnKSxcblx0XHRcdFx0XHRoKCdkaXYudmlkZW8tY29udGFpbmVyQHZpZGVvQ29udGFpbmVyJyksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRoKCdidXR0b24ubmF2LWFycm93LnByZXYtYXJyb3dAcHJldkJ0bicsIHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5wcmV2aW91c0ltYWdlJywgXCJQcmV2aW91cyBpbWFnZVwiKSB9LCBbXG5cdFx0XHRcdFx0aCgnc3Bhbi5jb2RpY29uLmNvZGljb24tY2hldnJvbi1sZWZ0JywgeyBhcmlhSGlkZGVuOiAndHJ1ZScgfSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRoKCdidXR0b24ubmF2LWFycm93Lm5leHQtYXJyb3dAbmV4dEJ0bicsIHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5uZXh0SW1hZ2UnLCBcIk5leHQgaW1hZ2VcIikgfSwgW1xuXHRcdFx0XHRcdGgoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWNoZXZyb24tcmlnaHQnLCB7IGFyaWFIaWRkZW46ICd0cnVlJyB9KSxcblx0XHRcdFx0XSksXG5cdFx0XHRdKSxcblx0XHRcdGgoJ2Rpdi5ib3R0b20tYmFyQGJvdHRvbUJhcicsIFtcblx0XHRcdFx0aCgnZGl2LmltYWdlLWluZm8tYmFyJywgW1xuXHRcdFx0XHRcdGgoJ3NwYW4uY2FwdGlvbi10ZXh0QGNhcHRpb25UZXh0JyksXG5cdFx0XHRcdFx0aCgnc3Bhbi5jYXB0aW9uLXNlcGFyYXRvckBjYXB0aW9uU2VwYXJhdG9yJyksXG5cdFx0XHRcdFx0aCgnc3Bhbi5pbWFnZS1jb3VudGVyQGNvdW50ZXInKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGgoJ2Rpdi5zZWN0aW9ucy1jb250YWluZXJAc2VjdGlvbnNDb250YWluZXInKSxcblx0XHRcdFx0aCgnc3Bhbi5zci1vbmx5QGFyaWFTdGF0dXMnKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXG5cdFx0Ly8gQVJJQTogc2V0IHVwIHNsaWRlc2hvdyBjb250YWluZXIgZm9yIHNjcmVlbiByZWFkZXJzXG5cdFx0ZWxlbWVudHMucm9vdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHRlbGVtZW50cy5yb290LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLmFyaWFMYWJlbCcsIFwiSW1hZ2VzIFByZXZpZXdcIikpO1xuXHRcdGVsZW1lbnRzLmNhcHRpb25TZXBhcmF0b3Iuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0ZWxlbWVudHMuYXJpYVN0YXR1cy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHRlbGVtZW50cy5hcmlhU3RhdHVzLnNldEF0dHJpYnV0ZSgnYXJpYS1hdG9taWMnLCAndHJ1ZScpO1xuXHRcdGVsZW1lbnRzLnNlY3Rpb25zQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdGVsZW1lbnRzLnNlY3Rpb25zQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLnRodW1ibmFpbHMnLCBcIkltYWdlIHRodW1ibmFpbHNcIikpO1xuXG5cdFx0dGhpcy5fZWxlbWVudHMgPSB7XG5cdFx0XHRyb290OiBlbGVtZW50cy5yb290LFxuXHRcdFx0aW1hZ2VBcmVhOiBlbGVtZW50cy5pbWFnZUFyZWEsXG5cdFx0XHRtYWluSW1hZ2VDb250YWluZXI6IGVsZW1lbnRzLm1haW5JbWFnZUNvbnRhaW5lcixcblx0XHRcdG1haW5JbWFnZTogZWxlbWVudHMubWFpbkltYWdlIGFzIEhUTUxJbWFnZUVsZW1lbnQsXG5cdFx0XHR2aWRlb0NvbnRhaW5lcjogZWxlbWVudHMudmlkZW9Db250YWluZXIsXG5cdFx0XHRjYXB0aW9uVGV4dDogZWxlbWVudHMuY2FwdGlvblRleHQsXG5cdFx0XHRjYXB0aW9uU2VwYXJhdG9yOiBlbGVtZW50cy5jYXB0aW9uU2VwYXJhdG9yLFxuXHRcdFx0Y291bnRlcjogZWxlbWVudHMuY291bnRlcixcblx0XHRcdGFyaWFTdGF0dXM6IGVsZW1lbnRzLmFyaWFTdGF0dXMsXG5cdFx0XHRwcmV2QnRuOiBlbGVtZW50cy5wcmV2QnRuIGFzIEhUTUxCdXR0b25FbGVtZW50LFxuXHRcdFx0bmV4dEJ0bjogZWxlbWVudHMubmV4dEJ0biBhcyBIVE1MQnV0dG9uRWxlbWVudCxcblx0XHRcdHNlY3Rpb25zQ29udGFpbmVyOiBlbGVtZW50cy5zZWN0aW9uc0NvbnRhaW5lcixcblx0XHR9O1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBpbWFnZSBpbiBmaXQgbW9kZVxuXHRcdHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZS5jbGFzc0xpc3QuYWRkKCdzY2FsZS10by1maXQnKTtcblx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2UuYWx0ID0gJyc7XG5cblx0XHQvLyBIaWRlIHZpZGVvIGNvbnRhaW5lciBpbml0aWFsbHlcblx0XHR0aGlzLl9lbGVtZW50cy52aWRlb0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Ly8gTmF2aWdhdGlvbiBsaXN0ZW5lcnNcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50cy5wcmV2QnRuLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4ID4gMCkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50SW5kZXgtLTtcblx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW1hZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudHMubmV4dEJ0biwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA8IHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50SW5kZXgrKztcblx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW1hZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBLZXlib2FyZCBuYXZpZ2F0aW9uXG5cdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudHMucm9vdCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkxlZnRBcnJvdykge1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzKCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3cpIHtcblx0XHRcdFx0dGhpcy5uZXh0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRlbGVtZW50cy5yb290LnRhYkluZGV4ID0gMDtcblxuXHRcdC8vIFpvb206IHNjcm9sbCB3aGVlbCArIG1vZGlmaWVyIGtleSAoQ3RybCBvbiBXaW4vTGludXgsIEFsdCBvbiBNYWMpIG9yIHBpbmNoXG5cdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudHMuaW1hZ2VBcmVhLCBFdmVudFR5cGUuTU9VU0VfV0hFRUwsIChlOiBXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNDdXJyZW50VmlkZW8oKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc1pvb21Nb2RpZmllciA9IGlzTWFjaW50b3NoID8gZS5hbHRLZXkgOiBlLmN0cmxLZXk7XG5cdFx0XHRpZiAoIWlzWm9vbU1vZGlmaWVyICYmICFlLmN0cmxLZXkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRpZiAoZS5kZWx0YVkgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fem9vbVNjYWxlID09PSAnZml0Jykge1xuXHRcdFx0XHR0aGlzLl9pbml0Wm9vbUZyb21GaXQoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVsdGEgPSBlLmRlbHRhWSA+IDAgPyAxIDogLTE7XG5cdFx0XHR0aGlzLl9hcHBseVpvb20oKHRoaXMuX3pvb21TY2FsZSBhcyBudW1iZXIpICogKDEgLSBkZWx0YSAqIFNDQUxFX1BJTkNIX0ZBQ1RPUikpO1xuXHRcdH0sIHsgcGFzc2l2ZTogZmFsc2UgfSkpO1xuXG5cdFx0Ly8gWm9vbTogc2luZ2xlIGNsaWNrIHRvIHpvb20gaW4vb3V0IChsaWtlIGltYWdlIHByZXZpZXcpXG5cdFx0Ly8gVHJhY2sgbW9kaWZpZXIga2V5cyBhdCBtb3VzZWRvd24gdGltZVxuXHRcdGxldCBjbGlja0N0cmxQcmVzc2VkID0gZmFsc2U7XG5cdFx0bGV0IGNsaWNrQWx0UHJlc3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZUNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5idXR0b24gIT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2xpY2tDdHJsUHJlc3NlZCA9IGUuY3RybEtleTtcblx0XHRcdGNsaWNrQWx0UHJlc3NlZCA9IGUuYWx0S2V5O1xuXHRcdH0pKTtcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2VDb250YWluZXIsIEV2ZW50VHlwZS5DTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiAhPT0gMCB8fCB0aGlzLl9pc0N1cnJlbnRWaWRlbygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzWm9vbU91dCA9IGlzTWFjaW50b3NoID8gY2xpY2tBbHRQcmVzc2VkIDogY2xpY2tDdHJsUHJlc3NlZDtcblx0XHRcdGlmIChpc1pvb21PdXQpIHtcblx0XHRcdFx0dGhpcy5fem9vbU91dCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fem9vbUluKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHpvb20tb3V0IGN1cnNvciBjbGFzcyB3aGVuIG1vZGlmaWVyIGtleSBpcyBoZWxkXG5cdFx0Y29uc3QgdXBkYXRlWm9vbUN1cnNvciA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBpc1pvb21PdXQgPSBpc01hY2ludG9zaCA/IGUuYWx0S2V5IDogZS5jdHJsS2V5O1xuXHRcdFx0dGhpcy5fZWxlbWVudHMhLm1haW5JbWFnZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd6b29tLW91dCcsIGlzWm9vbU91dCk7XG5cdFx0fTtcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50cy5yb290LCBFdmVudFR5cGUuS0VZX0RPV04sIHVwZGF0ZVpvb21DdXJzb3IpKTtcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50cy5yb290LCBFdmVudFR5cGUuS0VZX1VQLCB1cGRhdGVab29tQ3Vyc29yKSk7XG5cblx0XHQvLyBCdWlsZCBzZWN0aW9uIHRodW1ibmFpbHNcblx0XHR0aGlzLl90aHVtYm5haWxFbGVtZW50cyA9IFtdO1xuXHRcdGxldCBmbGF0SW5kZXggPSAwO1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgdGhpcy5fc2VjdGlvbnMubGVuZ3RoOyBzKyspIHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLl9zZWN0aW9uc1tzXTtcblxuXHRcdFx0Ly8gQWRkIHNlcGFyYXRvciBiZXR3ZWVuIHNlY3Rpb25zIChub3QgYmVmb3JlIHRoZSBmaXJzdClcblx0XHRcdGlmIChzID4gMCAmJiB0aGlzLl9zZWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IHNlcGFyYXRvciA9IGgoJ2Rpdi50aHVtYm5haWwtc2VwYXJhdG9yJykucm9vdDtcblx0XHRcdFx0c2VwYXJhdG9yLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50cy5zZWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChzZXBhcmF0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlY3Rpb24uaW1hZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGltYWdlID0gc2VjdGlvbi5pbWFnZXNbaV07XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRGbGF0SW5kZXggPSBmbGF0SW5kZXg7XG5cdFx0XHRcdGNvbnN0IGlzSXRlbVZpZGVvID0gaXNWaWRlb01pbWVUeXBlKGltYWdlLm1pbWVUeXBlKTtcblxuXHRcdFx0XHRjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblx0XHRcdFx0YnRuLmNsYXNzTmFtZSA9IGlzSXRlbVZpZGVvID8gJ3RodW1ibmFpbCB2aWRlby10aHVtYm5haWwnIDogJ3RodW1ibmFpbCc7XG5cdFx0XHRcdGJ0bi5hcmlhTGFiZWwgPSBpc0l0ZW1WaWRlb1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwudGh1bWJuYWlsTGFiZWxWaWRlbycsIFwiVmlkZW8gezB9IG9mIHsxfVwiLCBjdXJyZW50RmxhdEluZGV4ICsgMSwgdGhpcy5fZmxhdEltYWdlcy5sZW5ndGgpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC50aHVtYm5haWxMYWJlbEltYWdlJywgXCJJbWFnZSB7MH0gb2YgezF9XCIsIGN1cnJlbnRGbGF0SW5kZXggKyAxLCB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCk7XG5cblx0XHRcdFx0aWYgKGlzSXRlbVZpZGVvKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWNvbiA9IGgoJ3NwYW4uY29kaWNvbi5jb2RpY29uLXBsYXkudGh1bWJuYWlsLXBsYXktaWNvbicpO1xuXHRcdFx0XHRcdGljb24ucm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdFx0XHRidG4uYXBwZW5kQ2hpbGQoaWNvbi5yb290KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcblx0XHRcdFx0XHRpbWcuY2xhc3NOYW1lID0gJ3RodW1ibmFpbC1pbWFnZSc7XG5cdFx0XHRcdFx0aW1nLmFsdCA9IGltYWdlLm5hbWU7XG5cdFx0XHRcdFx0Y29uc3QgdGh1bWJuYWlsRGlzcG9zYWJsZXMgPSB0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRcdFx0XHRjb25zdCBtYXJrQnJva2VuID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRodW1ibmFpbERpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoIWJ0bi5jbGFzc0xpc3QuY29udGFpbnMoJ2Jyb2tlbicpKSB7XG5cdFx0XHRcdFx0XHRcdGJ0bi5jbGFzc0xpc3QuYWRkKCdicm9rZW4nKTtcblx0XHRcdFx0XHRcdFx0aW1nLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0XHRcdFx0XHRcdGltZy5hbHQgPSAnJztcblx0XHRcdFx0XHRcdFx0aW1nLnJlbW92ZSgpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmYWxsYmFjayA9IGgoJ3NwYW4uY29kaWNvbi5jb2RpY29uLXdhcm5pbmcudGh1bWJuYWlsLWJyb2tlbi1pY29uJyk7XG5cdFx0XHRcdFx0XHRcdGZhbGxiYWNrLnJvb3Quc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRcdFx0XHRcdGJ0bi5hcHBlbmRDaGlsZChmYWxsYmFjay5yb290KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0dGhpcy5fbG9hZEJsb2JVcmwoaW1hZ2UpLnRoZW4odXJsID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aHVtYm5haWxEaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcmVsb2FkZXIgPSBuZXcgSW1hZ2UoKTtcblx0XHRcdFx0XHRcdFx0dGh1bWJuYWlsRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwcmVsb2FkZXIsICdsb2FkJywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChidG4uY2xhc3NMaXN0LmNvbnRhaW5zKCdicm9rZW4nKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpbWcuc3JjID0gdXJsO1xuXHRcdFx0XHRcdFx0XHRcdGlmICghaW1nLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGJ0bi5hcHBlbmRDaGlsZChpbWcpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHR0aHVtYm5haWxEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHByZWxvYWRlciwgJ2Vycm9yJywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdG1hcmtCcm9rZW4oKTtcblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHRwcmVsb2FkZXIuc3JjID0gdXJsO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bWFya0Jyb2tlbigpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0XHRcdG1hcmtCcm9rZW4oKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aHVtYm5haWxEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGltZywgJ2Vycm9yJywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0bWFya0Jyb2tlbigpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ0biwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleCA9IGN1cnJlbnRGbGF0SW5kZXg7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW1hZ2UoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuX2VsZW1lbnRzLnNlY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKGJ0bik7XG5cdFx0XHRcdHRoaXMuX3RodW1ibmFpbEVsZW1lbnRzLnB1c2goYnRuKTtcblx0XHRcdFx0ZmxhdEluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnRzLnJvb3QpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgaW1hZ2Vcblx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbWFnZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSBvbmx5IHRoZSBjaGFuZ2luZyBwYXJ0czogbWFpbiBpbWFnZSBzcmMsIGNhcHRpb24sIGJ1dHRvbiBzdGF0ZXMsIHRodW1ibmFpbCBzZWxlY3Rpb24uXG5cdCAqIE5vIERPTSB0ZWFyZG93bi9yZWJ1aWxkIFx1MjAxNCBlbGltaW5hdGVzIHRoZSBibGFuayBmbGFzaC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ3VycmVudEltYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZWxlbWVudHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDYXB0dXJlIHRoZSBuYXZpZ2F0aW9uIGluZGV4IGJlZm9yZSBzdGFydGluZyBhc3luYyB3b3JrIHNvIHRoYXRcblx0XHQvLyB3ZSBjYW4gZGlzY2FyZCBzdGFsZSByZXN1bHRzIGlmIHRoZSB1c2VyIG5hdmlnYXRlcyB3aGlsZSBsb2FkaW5nL2RlY29kaW5nLlxuXHRcdGNvbnN0IG5hdmlnYXRpb25JbmRleCA9IHRoaXMuX2N1cnJlbnRJbmRleDtcblxuXHRcdC8vIFN3YXAgbWFpbiBpbWFnZSB1c2luZyBjYWNoZWQvbGF6eS1sb2FkZWQgYmxvYiBVUkwuXG5cdFx0Ly8gUHJlLWRlY29kZSB2aWEgZGVjb2RlKCkgYmVmb3JlIGFzc2lnbmluZyB0byA8aW1nPiBzbyB0aGUgYnJvd3NlclxuXHRcdC8vIGRlY29kZXMgb24gYSB3b3JrZXIgdGhyZWFkLCBhdm9pZGluZyBtYWluLXRocmVhZCBzdGFsbHMgZHVyaW5nIGNvbW1pdC5cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2ZsYXRJbWFnZXNbbmF2aWdhdGlvbkluZGV4XTtcblx0XHRjb25zdCBjdXJyZW50SW1hZ2UgPSBlbnRyeS5pbWFnZTtcblx0XHRjb25zdCBpc1ZpZGVvID0gaXNWaWRlb01pbWVUeXBlKGN1cnJlbnRJbWFnZS5taW1lVHlwZSk7XG5cblx0XHRpZiAoaXNWaWRlbykge1xuXHRcdFx0Ly8gU2hvdyB2aWRlbyBjb250YWluZXIsIGhpZGUgaW1hZ2Vcblx0XHRcdHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMudmlkZW9Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3pvb21lZCcpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlQ29udGFpbmVyLnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0JztcblxuXHRcdFx0Ly8gTG9hZCByYXcgZGF0YSB0byBzZW5kIHZpYSBwb3N0TWVzc2FnZVxuXHRcdFx0Y29uc3QgcmF3RGF0YSA9IGF3YWl0IHRoaXMuX2xvYWRSYXdEYXRhKGN1cnJlbnRJbWFnZSk7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4ICE9PSBuYXZpZ2F0aW9uSW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0Y29uc3QgdmlkZW9IdG1sID0gYDwhRE9DVFlQRSBodG1sPlxuPGh0bWw+PGhlYWQ+XG48bWV0YSBjaGFyc2V0PVwidXRmLThcIj5cbjxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCJkZWZhdWx0LXNyYyAnbm9uZSc7IG1lZGlhLXNyYyBibG9iOiBkYXRhOjsgc2NyaXB0LXNyYyAnbm9uY2UtJHtub25jZX0nOyBzdHlsZS1zcmMgJ25vbmNlLSR7bm9uY2V9JztcIj5cbjxzdHlsZSBub25jZT1cIiR7bm9uY2V9XCI+aHRtbCxib2R5e21hcmdpbjowO3BhZGRpbmc6MDt3aWR0aDoxMDAlO2hlaWdodDoxMDAlO292ZXJmbG93OmhpZGRlbjtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50fVxudmlkZW97d2lkdGg6MTAwJTtoZWlnaHQ6MTAwJTtvYmplY3QtZml0OmNvbnRhaW47b3V0bGluZTpub25lfTwvc3R5bGU+XG48L2hlYWQ+PGJvZHk+XG48dmlkZW8gaWQ9XCJ2XCIgY29udHJvbHM+PC92aWRlbz5cbjxzY3JpcHQgbm9uY2U9XCIke25vbmNlfVwiPlxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsZnVuY3Rpb24oZSl7dmFyIG09ZS5kYXRhO2lmKG0udHlwZT09PVwibG9hZFZpZGVvXCIpe3ZhciBiPW5ldyBCbG9iKFttLmRhdGFdLHt0eXBlOm0ubWltZVR5cGV9KTtkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZcIikuc3JjPVVSTC5jcmVhdGVPYmplY3RVUkwoYik7fX0pO1xuPC9zY3JpcHQ+XG48L2JvZHk+PC9odG1sPmA7XG5cblx0XHRcdC8vIFJldXNlIGV4aXN0aW5nIHdlYnZpZXcgb3IgY3JlYXRlIG9uZSBvbiBmaXJzdCB2aWRlbyBuYXZpZ2F0aW9uXG5cdFx0XHRsZXQgd2VidmlldzogSVdlYnZpZXdFbGVtZW50O1xuXHRcdFx0aWYgKCF0aGlzLl92aWRlb1dlYnZpZXcpIHtcblx0XHRcdFx0d2VidmlldyA9IHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5fd2Vidmlld1NlcnZpY2UuY3JlYXRlV2Vidmlld0VsZW1lbnQoe1xuXHRcdFx0XHRcdHRpdGxlOiBjdXJyZW50SW1hZ2UubmFtZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IGRpc2FibGVTZXJ2aWNlV29ya2VyOiB0cnVlIH0sXG5cdFx0XHRcdFx0Y29udGVudE9wdGlvbnM6IHsgYWxsb3dTY3JpcHRzOiB0cnVlIH0sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0d2Vidmlldy5tb3VudFRvKHRoaXMuX2VsZW1lbnRzLnZpZGVvQ29udGFpbmVyLCB0aGlzLndpbmRvdyk7XG5cdFx0XHRcdHRoaXMuX3ZpZGVvV2VidmlldyA9IHdlYnZpZXc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3ZWJ2aWV3ID0gdGhpcy5fdmlkZW9XZWJ2aWV3O1xuXHRcdFx0fVxuXG5cdFx0XHR3ZWJ2aWV3LnNldEh0bWwodmlkZW9IdG1sKTtcblxuXHRcdFx0Ly8gU2VuZCB0aGUgdmlkZW8gZGF0YSB0byB0aGUgd2VidmlldyB2aWEgcG9zdE1lc3NhZ2Vcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IChyYXdEYXRhIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+KS5idWZmZXI7XG5cdFx0XHR3ZWJ2aWV3LnBvc3RNZXNzYWdlKHsgdHlwZTogJ2xvYWRWaWRlbycsIGRhdGE6IGJ1ZmZlciwgbWltZVR5cGU6IGN1cnJlbnRJbWFnZS5taW1lVHlwZSB9LCBbYnVmZmVyXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNob3cgaW1hZ2UsIGhpZGUgdmlkZW8gY29udGFpbmVyXG5cdFx0XHR0aGlzLl9lbGVtZW50cy52aWRlb0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZUNvbnRhaW5lci5zdHlsZS5jdXJzb3IgPSAnJztcblxuXHRcdFx0Y29uc3QgdXJsID0gYXdhaXQgdGhpcy5fbG9hZEJsb2JVcmwoY3VycmVudEltYWdlKTtcblxuXHRcdFx0Ly8gSWYgdGhlIHVzZXIgbmF2aWdhdGVkIHdoaWxlIGxvYWRpbmcgdGhlIGJsb2IgVVJMLCBkaXNjYXJkIHRoaXMgcmVzdWx0LlxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCAhPT0gbmF2aWdhdGlvbkluZGV4KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG1wID0gbmV3IEltYWdlKCk7XG5cdFx0XHR0bXAuc3JjID0gdXJsO1xuXHRcdFx0dG1wLmRlY29kZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHQvLyBPbmx5IGFwcGx5IGlmIHVzZXIgaGFzbid0IG5hdmlnYXRlZCBhd2F5IGR1cmluZyBkZWNvZGVcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA9PT0gbmF2aWdhdGlvbkluZGV4ICYmIHRoaXMuX2VsZW1lbnRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlLnNyYyA9IHVybDtcblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2UuYWx0ID0gY3VycmVudEltYWdlLm5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0Ly8gRGVjb2RlIGZhaWxlZCAoaW52YWxpZCBpbWFnZSkgXHUyMDE0IHN0aWxsIHNob3cgc3JjIGZvciBicm93c2VyIGZhbGxiYWNrXG5cdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggPT09IG5hdmlnYXRpb25JbmRleCAmJiB0aGlzLl9lbGVtZW50cykge1xuXHRcdFx0XHRcdHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZS5zcmMgPSB1cmw7XG5cdFx0XHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlLmFsdCA9IGN1cnJlbnRJbWFnZS5uYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSZXNldCB6b29tIHdoZW4gc3dpdGNoaW5nIGltYWdlc1xuXHRcdHRoaXMuX2FwcGx5Wm9vbSgnZml0Jyk7XG5cblx0XHQvLyBVcGRhdGUgaW5mbyBiYXI6IGNhcHRpb24gKyBzZXBhcmF0b3IgKyBjb3VudGVyXG5cdFx0aWYgKGN1cnJlbnRJbWFnZS5jYXB0aW9uKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5jYXB0aW9uVGV4dC50ZXh0Q29udGVudCA9IGN1cnJlbnRJbWFnZS5jYXB0aW9uO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuY2FwdGlvblRleHQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuY2FwdGlvblNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLmNhcHRpb25UZXh0LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5jYXB0aW9uVGV4dC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuY2FwdGlvblNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0XHR0aGlzLl9lbGVtZW50cy5jb3VudGVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwuY291bnRlcicsIFwiezB9IC8gezF9XCIsIG5hdmlnYXRpb25JbmRleCArIDEsIHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoKTtcblxuXHRcdC8vIEFubm91bmNlIHRvIHNjcmVlbiByZWFkZXJzIHdpdGggZnVsbCBjb250ZXh0IChwb3NpdGlvbiArIGNhcHRpb24vbmFtZSlcblx0XHRjb25zdCBpdGVtS2luZCA9IGlzVmlkZW9cblx0XHRcdD8gbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwua2luZFZpZGVvJywgXCJWaWRlb1wiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5raW5kSW1hZ2UnLCBcIkltYWdlXCIpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLmFyaWFTdGF0dXMudGV4dENvbnRlbnQgPSBjdXJyZW50SW1hZ2UuY2FwdGlvblxuXHRcdFx0PyBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5zdGF0dXNXaXRoQ2FwdGlvbicsIFwiezB9IHsxfSBvZiB7Mn06IHszfVwiLCBpdGVtS2luZCwgbmF2aWdhdGlvbkluZGV4ICsgMSwgdGhpcy5fZmxhdEltYWdlcy5sZW5ndGgsIGN1cnJlbnRJbWFnZS5jYXB0aW9uKVxuXHRcdFx0OiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5zdGF0dXNXaXRoTmFtZScsIFwiezB9IHsxfSBvZiB7Mn06IHszfVwiLCBpdGVtS2luZCwgbmF2aWdhdGlvbkluZGV4ICsgMSwgdGhpcy5fZmxhdEltYWdlcy5sZW5ndGgsIGN1cnJlbnRJbWFnZS5uYW1lKTtcblxuXHRcdC8vIFVwZGF0ZSBidXR0b24gc3RhdGVzXG5cdFx0dGhpcy5fZWxlbWVudHMucHJldkJ0bi5kaXNhYmxlZCA9IG5hdmlnYXRpb25JbmRleCA9PT0gMDtcblx0XHR0aGlzLl9lbGVtZW50cy5uZXh0QnRuLmRpc2FibGVkID0gbmF2aWdhdGlvbkluZGV4ID09PSB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCAtIDE7XG5cblx0XHQvLyBVcGRhdGUgdGh1bWJuYWlsIHNlbGVjdGlvbiBcdTIwMTQgb25seSB0b2dnbGUgYWN0aXZlIGNsYXNzIGFuZFxuXHRcdC8vIGNhbGwgZ2V0Qm91bmRpbmdDbGllbnRSZWN0IG9uIHRoZSBhY3RpdmUgdGh1bWJuYWlsIHRvIGF2b2lkXG5cdFx0Ly8gbGF5b3V0IHRocmFzaGluZyBhY3Jvc3MgYWxsIHRodW1ibmFpbHMgb24gZXZlcnkgbmF2aWdhdGlvbi5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3RodW1ibmFpbEVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGkgPT09IG5hdmlnYXRpb25JbmRleDtcblx0XHRcdGNvbnN0IHRodW1ibmFpbCA9IHRoaXMuX3RodW1ibmFpbEVsZW1lbnRzW2ldO1xuXHRcdFx0dGh1bWJuYWlsLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcblx0XHRcdGlmIChpc0FjdGl2ZSkge1xuXHRcdFx0XHR0aHVtYm5haWwuc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCAncGFnZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGh1bWJuYWlsLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1jdXJyZW50Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2Nyb2xsIHRoZSBhY3RpdmUgdGh1bWJuYWlsIGludG8gdmlldyB3aXRob3V0IGJsb2NraW5nIHRoZSBtYWluIHRocmVhZC5cblx0XHQvLyBVc2luZyBzY3JvbGxJbnRvVmlldyB3aXRoICduZWFyZXN0JyBhdm9pZHMgZm9yY2VkIGxheW91dCBmcm9tXG5cdFx0Ly8gZ2V0Qm91bmRpbmdDbGllbnRSZWN0ICsgc2Nyb2xsTGVmdCBhbmQgaXMgaGFuZGxlZCBlZmZpY2llbnRseSBieVxuXHRcdC8vIHRoZSBicm93c2VyJ3Mgc2Nyb2xsIG1hY2hpbmVyeS5cblx0XHRjb25zdCBhY3RpdmVUaHVtYm5haWwgPSB0aGlzLl90aHVtYm5haWxFbGVtZW50c1tuYXZpZ2F0aW9uSW5kZXhdO1xuXHRcdGlmIChhY3RpdmVUaHVtYm5haWwpIHtcblx0XHRcdGFjdGl2ZVRodW1ibmFpbC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBlZGl0b3IgdGl0bGUgdG8gcmVmbGVjdCBjdXJyZW50IHNlY3Rpb25cblx0XHRpZiAodGhpcy5pbnB1dCBpbnN0YW5jZW9mIEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dCkge1xuXHRcdFx0Y29uc3QgY3VycmVudFNlY3Rpb24gPSB0aGlzLl9zZWN0aW9uc1tlbnRyeS5zZWN0aW9uSW5kZXhdO1xuXHRcdFx0dGhpcy5pbnB1dC5zZXROYW1lKGN1cnJlbnRTZWN0aW9uLnRpdGxlIHx8IHRoaXMuaW5wdXQuY29sbGVjdGlvbi50aXRsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJlbG9hZCBhZGphY2VudCBpbWFnZXMgZm9yIHNtb290aGVyIG5hdmlnYXRpb25cblx0XHR0aGlzLl9wcmVsb2FkQWRqYWNlbnRJbWFnZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2xvYWRCbG9iVXJsKGltYWdlOiBJQ2Fyb3VzZWxJbWFnZSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fYmxvYlVybENhY2hlLmdldChpbWFnZS5pZCk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHR9XG5cblx0XHRsZXQgYnVmZmVyOiBVaW50OEFycmF5O1xuXHRcdGlmIChpbWFnZS5kYXRhKSB7XG5cdFx0XHQvLyBIYW5kbGUgYm90aCBWU0J1ZmZlciAoaGFzIC5idWZmZXIgcHJvcGVydHkpIGFuZCByYXcgVWludDhBcnJheSBmcm9tIGNoYXQgYXR0YWNobWVudHNcblx0XHRcdGJ1ZmZlciA9IGltYWdlLmRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5ID8gaW1hZ2UuZGF0YSA6IGltYWdlLmRhdGEuYnVmZmVyO1xuXHRcdH0gZWxzZSBpZiAoaW1hZ2UudXJpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoaW1hZ2UudXJpKTtcblx0XHRcdGJ1ZmZlciA9IGNvbnRlbnQudmFsdWUuYnVmZmVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmxvYiA9IG5ldyBCbG9iKFtidWZmZXIgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj5dLCB7IHR5cGU6IGltYWdlLm1pbWVUeXBlIH0pO1xuXHRcdGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdFx0dGhpcy5fYmxvYlVybENhY2hlLnNldChpbWFnZS5pZCwgdXJsKTtcblx0XHRyZXR1cm4gdXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2b2tlQ2FjaGVkQmxvYlVybHMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB1cmwgb2YgdGhpcy5fYmxvYlVybENhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Jsb2JVcmxDYWNoZS5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZFJhd0RhdGEoaW1hZ2U6IElDYXJvdXNlbEltYWdlKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0aWYgKGltYWdlLmRhdGEpIHtcblx0XHRcdHJldHVybiBpbWFnZS5kYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSA/IGltYWdlLmRhdGEgOiBpbWFnZS5kYXRhLmJ1ZmZlcjtcblx0XHR9IGVsc2UgaWYgKGltYWdlLnVyaSkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGltYWdlLnVyaSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS5idWZmZXI7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVWludDhBcnJheSgwKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZWxvYWRBZGphY2VudEltYWdlcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGlkeCBvZiBbdGhpcy5fY3VycmVudEluZGV4IC0gMSwgdGhpcy5fY3VycmVudEluZGV4ICsgMV0pIHtcblx0XHRcdGlmIChpZHggPj0gMCAmJiBpZHggPCB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBhZGphY2VudEltYWdlID0gdGhpcy5fZmxhdEltYWdlc1tpZHhdLmltYWdlO1xuXHRcdFx0XHRpZiAoaXNWaWRlb01pbWVUeXBlKGFkamFjZW50SW1hZ2UubWltZVR5cGUpKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIHZpZGVvLCBwcmVsb2FkIHJhdyBkYXRhIGludG8gdGhlIGZpbGUgc2VydmljZSBjYWNoZVxuXHRcdFx0XHRcdHRoaXMuX2xvYWRSYXdEYXRhKGFkamFjZW50SW1hZ2UpLmNhdGNoKCgpID0+IHsgLyogaWdub3JlICovIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvYWRCbG9iVXJsKGFkamFjZW50SW1hZ2UpLnRoZW4odXJsID0+IHtcblx0XHRcdFx0XHRcdC8vIFByZS1kZWNvZGUgdmlhIGRlY29kZSgpIHNvIHRoZSBjb21wb3NpdG9yIGRvZXNuJ3QgYmxvY2tcblx0XHRcdFx0XHRcdC8vIHRoZSBtYWluIHRocmVhZCBkZWNvZGluZyB0aGlzIGltYWdlIGR1cmluZyBjb21taXQuXG5cdFx0XHRcdFx0XHRjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcblx0XHRcdFx0XHRcdGltZy5zcmMgPSB1cmw7XG5cdFx0XHRcdFx0XHRpbWcuZGVjb2RlKCkuY2F0Y2goKCkgPT4geyAvKiBpbnZhbGlkIGltYWdlICovIH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJldmlvdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA+IDApIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleC0tO1xuXHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW1hZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRuZXh0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggPCB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCAtIDEpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleCsrO1xuXHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW1hZ2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSB0aGUgY3VycmVudCBkaXNwbGF5IHNjYWxlIHdoZW4gdHJhbnNpdGlvbmluZyBmcm9tICdmaXQnIHRvIG51bWVyaWMgem9vbS5cblx0ICovXG5cdHByaXZhdGUgX2luaXRab29tRnJvbUZpdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VsZW1lbnRzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGltZyA9IHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZTtcblx0XHRpZiAoaW1nLm5hdHVyYWxXaWR0aCA+IDApIHtcblx0XHRcdHRoaXMuX3pvb21TY2FsZSA9IGltZy5jbGllbnRXaWR0aCAvIGltZy5uYXR1cmFsV2lkdGg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3pvb21TY2FsZSA9IDE7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFpvb20gaW4gdG8gdGhlIG5leHQgcHJlZGVmaW5lZCB6b29tIGxldmVsLlxuXHQgKi9cblx0cHJpdmF0ZSBfem9vbUluKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl96b29tU2NhbGUgPT09ICdmaXQnKSB7XG5cdFx0XHR0aGlzLl9pbml0Wm9vbUZyb21GaXQoKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2NhbGUgPSB0aGlzLl96b29tU2NhbGUgYXMgbnVtYmVyO1xuXHRcdGxldCBpID0gMDtcblx0XHRmb3IgKDsgaSA8IFpPT01fTEVWRUxTLmxlbmd0aDsgKytpKSB7XG5cdFx0XHRpZiAoWk9PTV9MRVZFTFNbaV0gPiBzY2FsZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlab29tKFpPT01fTEVWRUxTW2ldID8/IE1BWF9TQ0FMRSk7XG5cdH1cblxuXHQvKipcblx0ICogWm9vbSBvdXQgdG8gdGhlIHByZXZpb3VzIHByZWRlZmluZWQgem9vbSBsZXZlbC5cblx0ICovXG5cdHByaXZhdGUgX3pvb21PdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3pvb21TY2FsZSA9PT0gJ2ZpdCcpIHtcblx0XHRcdHRoaXMuX2luaXRab29tRnJvbUZpdCgpO1xuXHRcdH1cblx0XHRjb25zdCBzY2FsZSA9IHRoaXMuX3pvb21TY2FsZSBhcyBudW1iZXI7XG5cdFx0bGV0IGkgPSBaT09NX0xFVkVMUy5sZW5ndGggLSAxO1xuXHRcdGZvciAoOyBpID49IDA7IC0taSkge1xuXHRcdFx0aWYgKFpPT01fTEVWRUxTW2ldIDwgc2NhbGUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FwcGx5Wm9vbShaT09NX0xFVkVMU1tpXSA/PyBNSU5fU0NBTEUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGx5IGZpdC10by1jb250YWluZXIgb3IgbnVtZXJpYyB6b29tIHdpdGggc2Nyb2xsLWNlbnRlciBwcmVzZXJ2YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVpvb20obmV3U2NhbGU6IFpvb21TY2FsZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWxlbWVudHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2VDb250YWluZXI7XG5cdFx0Y29uc3QgaW1nID0gdGhpcy5fZWxlbWVudHMubWFpbkltYWdlO1xuXG5cdFx0aWYgKG5ld1NjYWxlID09PSAnZml0Jykge1xuXHRcdFx0dGhpcy5fem9vbVNjYWxlID0gJ2ZpdCc7XG5cdFx0XHRpbWcuY2xhc3NMaXN0LmFkZCgnc2NhbGUtdG8tZml0Jyk7XG5cdFx0XHRpbWcuY2xhc3NMaXN0LnJlbW92ZSgncGl4ZWxhdGVkJyk7XG5cdFx0XHRpbWcuc3R5bGUuem9vbSA9ICcnO1xuXHRcdFx0Ly8gUmVtb3ZlIHpvb21lZC9vdmVyZmxvdyBiZWZvcmUgc2Nyb2xsVG8gdG8gYXZvaWQgYW4gZXhwZW5zaXZlXG5cdFx0XHQvLyBzeW5jaHJvbm91cyBTY3JvbGxMYXllciB0aGF0IGJsb2NrcyB0aGUgbWFpbiB0aHJlYWQuXG5cdFx0XHRjb25zdCB3YXNab29tZWQgPSBjb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCd6b29tZWQnKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCd6b29tZWQnKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCd6b29tLW91dCcpO1xuXHRcdFx0aWYgKHdhc1pvb21lZCkge1xuXHRcdFx0XHRjb250YWluZXIuc2Nyb2xsVG8oMCwgMCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNjYWxlID0gY2xhbXAobmV3U2NhbGUsIE1JTl9TQ0FMRSwgTUFYX1NDQUxFKTtcblx0XHRcdHRoaXMuX3pvb21TY2FsZSA9IHNjYWxlO1xuXG5cdFx0XHQvLyBDYXB0dXJlIHNjcm9sbCBjZW50ZXIgcmF0aW8gYmVmb3JlIGNoYW5naW5nIHpvb20uXG5cdFx0XHRjb25zdCBkeCA9IGNvbnRhaW5lci5zY3JvbGxXaWR0aCA+IDBcblx0XHRcdFx0PyAoY29udGFpbmVyLnNjcm9sbExlZnQgKyBjb250YWluZXIuY2xpZW50V2lkdGggLyAyKSAvIGNvbnRhaW5lci5zY3JvbGxXaWR0aFxuXHRcdFx0XHQ6IDAuNTtcblx0XHRcdGNvbnN0IGR5ID0gY29udGFpbmVyLnNjcm9sbEhlaWdodCA+IDBcblx0XHRcdFx0PyAoY29udGFpbmVyLnNjcm9sbFRvcCArIGNvbnRhaW5lci5jbGllbnRIZWlnaHQgLyAyKSAvIGNvbnRhaW5lci5zY3JvbGxIZWlnaHRcblx0XHRcdFx0OiAwLjU7XG5cblx0XHRcdGltZy5jbGFzc0xpc3QucmVtb3ZlKCdzY2FsZS10by1maXQnKTtcblx0XHRcdGltZy5jbGFzc0xpc3QudG9nZ2xlKCdwaXhlbGF0ZWQnLCBzY2FsZSA+PSBQSVhFTEFUSU9OX1RIUkVTSE9MRCk7XG5cdFx0XHRpbWcuc3R5bGUuem9vbSA9IFN0cmluZyhzY2FsZSk7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnem9vbWVkJyk7XG5cblx0XHRcdC8vIFJlc3RvcmUgc2Nyb2xsIGNlbnRlciBcdTIwMTQgd29ya3MgYmVjYXVzZSBzZXR0aW5nIGltZy5zdHlsZS56b29tIHRyaWdnZXJzXG5cdFx0XHQvLyBzeW5jaHJvbm91cyBsYXlvdXQsIHNvIHNjcm9sbFdpZHRoL3Njcm9sbEhlaWdodCByZWZsZWN0IHRoZSBuZXcgc2l6ZS5cblx0XHRcdGNvbnN0IG5ld1Njcm9sbFggPSBjb250YWluZXIuc2Nyb2xsV2lkdGggKiBkeCAtIGNvbnRhaW5lci5jbGllbnRXaWR0aCAvIDI7XG5cdFx0XHRjb25zdCBuZXdTY3JvbGxZID0gY29udGFpbmVyLnNjcm9sbEhlaWdodCAqIGR5IC0gY29udGFpbmVyLmNsaWVudEhlaWdodCAvIDI7XG5cdFx0XHRjb250YWluZXIuc2Nyb2xsVG8obmV3U2Nyb2xsWCwgbmV3U2Nyb2xsWSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLl9lbGVtZW50cz8ucm9vdC5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7ZGltZW5zaW9uLndpZHRofXB4YDtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0fXB4YDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUIsV0FBc0IsV0FBVyxTQUFTO0FBQzFFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUV4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBMEIsdUJBQXVCO0FBQ2pELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQTJDLHVCQUF1QjtBQWNsRSxNQUFNLHFCQUFxQjtBQUMzQixNQUFNLFlBQVk7QUFDbEIsTUFBTSxZQUFZO0FBQ2xCLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sY0FBYyxDQUFDLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHLEdBQUcsR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFO0FBRXpGLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBNkJuRCxZQUNDLE9BQ21CLGtCQUNKLGNBQ0UsZ0JBQ2MsY0FDRyxpQkFDakM7QUFDRCxVQUFNLG9CQUFvQixJQUFJLE9BQU8sa0JBQWtCLGNBQWMsY0FBYztBQUhwRDtBQUNHO0FBL0JuQyxTQUFRLGdCQUF3QjtBQUNoQyxTQUFRLGFBQXdCO0FBQ2hDLFNBQVEsWUFBNkMsQ0FBQztBQUN0RCxTQUFRLGNBQWlDLENBQUM7QUFDMUMsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQzNFLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUN6RSxTQUFpQixnQkFBZ0Isb0JBQUksSUFBb0I7QUFpQnpELFNBQVEscUJBQW9DLENBQUM7QUFBQSxFQVc3QztBQUFBLEVBRW1CLGFBQWEsUUFBMkI7QUFDMUQsU0FBSyxhQUFhLEVBQUUsMkJBQTJCLEVBQUU7QUFDakQsV0FBTyxZQUFZLEtBQUssVUFBVTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxNQUFlLFNBQVMsT0FBaUMsU0FBcUMsU0FBNkIsT0FBeUM7QUFDbkssVUFBTSxNQUFNLFNBQVMsT0FBTyxTQUFTLFNBQVMsS0FBSztBQUVuRCxTQUFLLFlBQVksTUFBTSxXQUFXO0FBQ2xDLFNBQUssY0FBYyxDQUFDO0FBQ3BCLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxVQUFVLFFBQVEsS0FBSztBQUMvQyxlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssVUFBVSxDQUFDLEVBQUUsT0FBTyxRQUFRLEtBQUs7QUFDekQsYUFBSyxZQUFZLEtBQUssRUFBRSxjQUFjLEdBQUcscUJBQXFCLEdBQUcsT0FBTyxLQUFLLFVBQVUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN0RztBQUFBLElBQ0Q7QUFDQSxTQUFLLGdCQUFnQixLQUFLLElBQUksTUFBTSxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssWUFBWSxTQUFTLENBQUMsQ0FBQztBQUN4RixTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRVMsYUFBbUI7QUFDM0IsU0FBSyxlQUFlLFFBQVE7QUFDNUIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLGtCQUFrQixNQUFNO0FBQzdCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssYUFBYTtBQUNsQixRQUFJLEtBQUssWUFBWTtBQUNwQixnQkFBVSxLQUFLLFVBQVU7QUFBQSxJQUMxQjtBQUNBLFNBQUssWUFBWTtBQUNqQixTQUFLLHFCQUFxQixDQUFDO0FBQzNCLFVBQU0sV0FBVztBQUFBLEVBQ2xCO0FBQUEsRUFFUSxrQkFBMkI7QUFDbEMsVUFBTSxRQUFRLEtBQUssWUFBWSxLQUFLLGFBQWE7QUFDakQsV0FBTyxDQUFDLENBQUMsU0FBUyxnQkFBZ0IsTUFBTSxNQUFNLFFBQVE7QUFBQSxFQUN2RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsaUJBQXVCO0FBQzlCLFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckI7QUFBQSxJQUNEO0FBRUEsU0FBSyxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLGtCQUFrQixNQUFNO0FBQzdCLFNBQUssc0JBQXNCO0FBQzNCLGNBQVUsS0FBSyxVQUFVO0FBRXpCLFFBQUksS0FBSyxZQUFZLFdBQVcsR0FBRztBQUNsQyxZQUFNLFFBQVEsRUFBRSxtQkFBbUI7QUFDbkMsWUFBTSxLQUFLLGNBQWMsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ2xGLFdBQUssV0FBVyxZQUFZLE1BQU0sSUFBSTtBQUN0QztBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsRUFBRSwyQkFBMkI7QUFBQSxNQUM3QyxFQUFFLDRCQUE0QjtBQUFBLFFBQzdCLEVBQUUsK0NBQStDO0FBQUEsVUFDaEQsRUFBRSwwQkFBMEI7QUFBQSxVQUM1QixFQUFFLG9DQUFvQztBQUFBLFFBQ3ZDLENBQUM7QUFBQSxRQUNELEVBQUUsdUNBQXVDLEVBQUUsV0FBVyxTQUFTLCtCQUErQixnQkFBZ0IsRUFBRSxHQUFHO0FBQUEsVUFDbEgsRUFBRSxxQ0FBcUMsRUFBRSxZQUFZLE9BQU8sQ0FBQztBQUFBLFFBQzlELENBQUM7QUFBQSxRQUNELEVBQUUsdUNBQXVDLEVBQUUsV0FBVyxTQUFTLDJCQUEyQixZQUFZLEVBQUUsR0FBRztBQUFBLFVBQzFHLEVBQUUsc0NBQXNDLEVBQUUsWUFBWSxPQUFPLENBQUM7QUFBQSxRQUMvRCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsTUFDRCxFQUFFLDRCQUE0QjtBQUFBLFFBQzdCLEVBQUUsc0JBQXNCO0FBQUEsVUFDdkIsRUFBRSwrQkFBK0I7QUFBQSxVQUNqQyxFQUFFLHlDQUF5QztBQUFBLFVBQzNDLEVBQUUsNEJBQTRCO0FBQUEsUUFDL0IsQ0FBQztBQUFBLFFBQ0QsRUFBRSwwQ0FBMEM7QUFBQSxRQUM1QyxFQUFFLHlCQUF5QjtBQUFBLE1BQzVCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFHRCxhQUFTLEtBQUssYUFBYSxRQUFRLE9BQU87QUFDMUMsYUFBUyxLQUFLLGFBQWEsY0FBYyxTQUFTLDJCQUEyQixnQkFBZ0IsQ0FBQztBQUM5RixhQUFTLGlCQUFpQixhQUFhLGVBQWUsTUFBTTtBQUM1RCxhQUFTLFdBQVcsYUFBYSxhQUFhLFFBQVE7QUFDdEQsYUFBUyxXQUFXLGFBQWEsZUFBZSxNQUFNO0FBQ3RELGFBQVMsa0JBQWtCLGFBQWEsUUFBUSxPQUFPO0FBQ3ZELGFBQVMsa0JBQWtCLGFBQWEsY0FBYyxTQUFTLDRCQUE0QixrQkFBa0IsQ0FBQztBQUU5RyxTQUFLLFlBQVk7QUFBQSxNQUNoQixNQUFNLFNBQVM7QUFBQSxNQUNmLFdBQVcsU0FBUztBQUFBLE1BQ3BCLG9CQUFvQixTQUFTO0FBQUEsTUFDN0IsV0FBVyxTQUFTO0FBQUEsTUFDcEIsZ0JBQWdCLFNBQVM7QUFBQSxNQUN6QixhQUFhLFNBQVM7QUFBQSxNQUN0QixrQkFBa0IsU0FBUztBQUFBLE1BQzNCLFNBQVMsU0FBUztBQUFBLE1BQ2xCLFlBQVksU0FBUztBQUFBLE1BQ3JCLFNBQVMsU0FBUztBQUFBLE1BQ2xCLFNBQVMsU0FBUztBQUFBLE1BQ2xCLG1CQUFtQixTQUFTO0FBQUEsSUFDN0I7QUFHQSxTQUFLLFVBQVUsVUFBVSxVQUFVLElBQUksY0FBYztBQUNyRCxTQUFLLFVBQVUsVUFBVSxNQUFNO0FBRy9CLFNBQUssVUFBVSxlQUFlLE1BQU0sVUFBVTtBQUc5QyxTQUFLLG9CQUFvQixJQUFJLHNCQUFzQixLQUFLLFVBQVUsU0FBUyxTQUFTLE1BQU07QUFDekYsVUFBSSxLQUFLLGdCQUFnQixHQUFHO0FBQzNCLGFBQUs7QUFDTCxhQUFLLG1CQUFtQjtBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLG9CQUFvQixJQUFJLHNCQUFzQixLQUFLLFVBQVUsU0FBUyxTQUFTLE1BQU07QUFDekYsVUFBSSxLQUFLLGdCQUFnQixLQUFLLFlBQVksU0FBUyxHQUFHO0FBQ3JELGFBQUs7QUFDTCxhQUFLLG1CQUFtQjtBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLG9CQUFvQixJQUFJLHNCQUFzQixTQUFTLE1BQU0sVUFBVSxVQUFVLE9BQUs7QUFDMUYsWUFBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFDekMsVUFBSSxNQUFNLFlBQVksUUFBUSxXQUFXO0FBQ3hDLGFBQUssU0FBUztBQUNkLGNBQU0sZ0JBQWdCO0FBQ3RCLGNBQU0sZUFBZTtBQUFBLE1BQ3RCLFdBQVcsTUFBTSxZQUFZLFFBQVEsWUFBWTtBQUNoRCxhQUFLLEtBQUs7QUFDVixjQUFNLGdCQUFnQjtBQUN0QixjQUFNLGVBQWU7QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsYUFBUyxLQUFLLFdBQVc7QUFHekIsU0FBSyxvQkFBb0IsSUFBSSxzQkFBc0IsS0FBSyxVQUFVLFdBQVcsVUFBVSxhQUFhLENBQUMsTUFBa0I7QUFDdEgsVUFBSSxLQUFLLGdCQUFnQixHQUFHO0FBQzNCO0FBQUEsTUFDRDtBQUNBLFlBQU0saUJBQWlCLGNBQWMsRUFBRSxTQUFTLEVBQUU7QUFDbEQsVUFBSSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsU0FBUztBQUNsQztBQUFBLE1BQ0Q7QUFDQSxRQUFFLGVBQWU7QUFFakIsVUFBSSxFQUFFLFdBQVcsR0FBRztBQUNuQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLEtBQUssZUFBZSxPQUFPO0FBQzlCLGFBQUssaUJBQWlCO0FBQUEsTUFDdkI7QUFFQSxZQUFNLFFBQVEsRUFBRSxTQUFTLElBQUksSUFBSTtBQUNqQyxXQUFLLFdBQVksS0FBSyxjQUF5QixJQUFJLFFBQVEsbUJBQW1CO0FBQUEsSUFDL0UsR0FBRyxFQUFFLFNBQVMsTUFBTSxDQUFDLENBQUM7QUFJdEIsUUFBSSxtQkFBbUI7QUFDdkIsUUFBSSxrQkFBa0I7QUFDdEIsU0FBSyxvQkFBb0IsSUFBSSxzQkFBc0IsS0FBSyxVQUFVLG9CQUFvQixVQUFVLFlBQVksQ0FBQyxNQUFrQjtBQUM5SCxVQUFJLEVBQUUsV0FBVyxHQUFHO0FBQ25CO0FBQUEsTUFDRDtBQUNBLHlCQUFtQixFQUFFO0FBQ3JCLHdCQUFrQixFQUFFO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxvQkFBb0IsSUFBSSxzQkFBc0IsS0FBSyxVQUFVLG9CQUFvQixVQUFVLE9BQU8sQ0FBQyxNQUFrQjtBQUN6SCxVQUFJLEVBQUUsV0FBVyxLQUFLLEtBQUssZ0JBQWdCLEdBQUc7QUFDN0M7QUFBQSxNQUNEO0FBQ0EsWUFBTSxZQUFZLGNBQWMsa0JBQWtCO0FBQ2xELFVBQUksV0FBVztBQUNkLGFBQUssU0FBUztBQUFBLE1BQ2YsT0FBTztBQUNOLGFBQUssUUFBUTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFVBQU0sbUJBQW1CLENBQUMsTUFBcUI7QUFDOUMsWUFBTSxZQUFZLGNBQWMsRUFBRSxTQUFTLEVBQUU7QUFDN0MsV0FBSyxVQUFXLG1CQUFtQixVQUFVLE9BQU8sWUFBWSxTQUFTO0FBQUEsSUFDMUU7QUFDQSxTQUFLLG9CQUFvQixJQUFJLHNCQUFzQixTQUFTLE1BQU0sVUFBVSxVQUFVLGdCQUFnQixDQUFDO0FBQ3ZHLFNBQUssb0JBQW9CLElBQUksc0JBQXNCLFNBQVMsTUFBTSxVQUFVLFFBQVEsZ0JBQWdCLENBQUM7QUFHckcsU0FBSyxxQkFBcUIsQ0FBQztBQUMzQixRQUFJLFlBQVk7QUFDaEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFVBQVUsUUFBUSxLQUFLO0FBQy9DLFlBQU0sVUFBVSxLQUFLLFVBQVUsQ0FBQztBQUdoQyxVQUFJLElBQUksS0FBSyxLQUFLLFVBQVUsU0FBUyxHQUFHO0FBQ3ZDLGNBQU0sWUFBWSxFQUFFLHlCQUF5QixFQUFFO0FBQy9DLGtCQUFVLGFBQWEsZUFBZSxNQUFNO0FBQzVDLGFBQUssVUFBVSxrQkFBa0IsWUFBWSxTQUFTO0FBQUEsTUFDdkQ7QUFFQSxlQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsT0FBTyxRQUFRLEtBQUs7QUFDL0MsY0FBTSxRQUFRLFFBQVEsT0FBTyxDQUFDO0FBQzlCLGNBQU0sbUJBQW1CO0FBQ3pCLGNBQU0sY0FBYyxnQkFBZ0IsTUFBTSxRQUFRO0FBRWxELGNBQU0sTUFBTSxTQUFTLGNBQWMsUUFBUTtBQUMzQyxZQUFJLFlBQVksY0FBYyw4QkFBOEI7QUFDNUQsWUFBSSxZQUFZLGNBQ2IsU0FBUyxxQ0FBcUMsb0JBQW9CLG1CQUFtQixHQUFHLEtBQUssWUFBWSxNQUFNLElBQy9HLFNBQVMscUNBQXFDLG9CQUFvQixtQkFBbUIsR0FBRyxLQUFLLFlBQVksTUFBTTtBQUVsSCxZQUFJLGFBQWE7QUFDaEIsZ0JBQU0sT0FBTyxFQUFFLCtDQUErQztBQUM5RCxlQUFLLEtBQUssYUFBYSxlQUFlLE1BQU07QUFDNUMsY0FBSSxZQUFZLEtBQUssSUFBSTtBQUFBLFFBQzFCLE9BQU87QUFDTixnQkFBTSxNQUFNLFNBQVMsY0FBYyxLQUFLO0FBQ3hDLGNBQUksWUFBWTtBQUNoQixjQUFJLE1BQU0sTUFBTTtBQUNoQixnQkFBTSx1QkFBdUIsS0FBSyxvQkFBb0IsSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBRS9FLGdCQUFNLGFBQWEsTUFBTTtBQUN4QixnQkFBSSxxQkFBcUIsWUFBWTtBQUNwQztBQUFBLFlBQ0Q7QUFFQSxnQkFBSSxDQUFDLElBQUksVUFBVSxTQUFTLFFBQVEsR0FBRztBQUN0QyxrQkFBSSxVQUFVLElBQUksUUFBUTtBQUMxQixrQkFBSSxnQkFBZ0IsS0FBSztBQUN6QixrQkFBSSxNQUFNO0FBQ1Ysa0JBQUksT0FBTztBQUNYLG9CQUFNLFdBQVcsRUFBRSxvREFBb0Q7QUFDdkUsdUJBQVMsS0FBSyxhQUFhLGVBQWUsTUFBTTtBQUNoRCxrQkFBSSxZQUFZLFNBQVMsSUFBSTtBQUFBLFlBQzlCO0FBQUEsVUFDRDtBQUVBLGVBQUssYUFBYSxLQUFLLEVBQUUsS0FBSyxTQUFPO0FBQ3BDLGdCQUFJLHFCQUFxQixZQUFZO0FBQ3BDO0FBQUEsWUFDRDtBQUVBLGdCQUFJLEtBQUs7QUFDUixvQkFBTSxZQUFZLElBQUksTUFBTTtBQUM1QixtQ0FBcUIsSUFBSSxzQkFBc0IsV0FBVyxRQUFRLE1BQU07QUFDdkUsb0JBQUksSUFBSSxVQUFVLFNBQVMsUUFBUSxHQUFHO0FBQ3JDO0FBQUEsZ0JBQ0Q7QUFDQSxvQkFBSSxNQUFNO0FBQ1Ysb0JBQUksQ0FBQyxJQUFJLGVBQWU7QUFDdkIsc0JBQUksWUFBWSxHQUFHO0FBQUEsZ0JBQ3BCO0FBQUEsY0FDRCxDQUFDLENBQUM7QUFDRixtQ0FBcUIsSUFBSSxzQkFBc0IsV0FBVyxTQUFTLE1BQU07QUFDeEUsMkJBQVc7QUFBQSxjQUNaLENBQUMsQ0FBQztBQUNGLHdCQUFVLE1BQU07QUFBQSxZQUNqQixPQUFPO0FBQ04seUJBQVc7QUFBQSxZQUNaO0FBQUEsVUFDRCxHQUFHLE1BQU07QUFDUix1QkFBVztBQUFBLFVBQ1osQ0FBQztBQUNELCtCQUFxQixJQUFJLHNCQUFzQixLQUFLLFNBQVMsTUFBTTtBQUNsRSx1QkFBVztBQUFBLFVBQ1osQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUVBLGFBQUssb0JBQW9CLElBQUksc0JBQXNCLEtBQUssU0FBUyxNQUFNO0FBQ3RFLGVBQUssZ0JBQWdCO0FBQ3JCLGVBQUssbUJBQW1CO0FBQUEsUUFDekIsQ0FBQyxDQUFDO0FBRUYsYUFBSyxVQUFVLGtCQUFrQixZQUFZLEdBQUc7QUFDaEQsYUFBSyxtQkFBbUIsS0FBSyxHQUFHO0FBQ2hDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFdBQVcsWUFBWSxTQUFTLElBQUk7QUFHekMsU0FBSyxtQkFBbUI7QUFBQSxFQUN6QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFjLHFCQUFvQztBQUNqRCxRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCO0FBQUEsSUFDRDtBQUlBLFVBQU0sa0JBQWtCLEtBQUs7QUFLN0IsVUFBTSxRQUFRLEtBQUssWUFBWSxlQUFlO0FBQzlDLFVBQU0sZUFBZSxNQUFNO0FBQzNCLFVBQU0sVUFBVSxnQkFBZ0IsYUFBYSxRQUFRO0FBRXJELFFBQUksU0FBUztBQUVaLFdBQUssVUFBVSxVQUFVLE1BQU0sVUFBVTtBQUN6QyxXQUFLLFVBQVUsZUFBZSxNQUFNLFVBQVU7QUFDOUMsV0FBSyxVQUFVLG1CQUFtQixVQUFVLE9BQU8sUUFBUTtBQUMzRCxXQUFLLFVBQVUsbUJBQW1CLE1BQU0sU0FBUztBQUdqRCxZQUFNLFVBQVUsTUFBTSxLQUFLLGFBQWEsWUFBWTtBQUNwRCxVQUFJLEtBQUssa0JBQWtCLGlCQUFpQjtBQUMzQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLFFBQVEsYUFBYTtBQUMzQixZQUFNLFlBQVk7QUFBQTtBQUFBO0FBQUEsbUhBRzhGLEtBQUssdUJBQXVCLEtBQUs7QUFBQSxnQkFDcEksS0FBSztBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUlKLEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFNbkIsVUFBSTtBQUNKLFVBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEIsa0JBQVUsS0FBSyxvQkFBb0IsSUFBSSxLQUFLLGdCQUFnQixxQkFBcUI7QUFBQSxVQUNoRixPQUFPLGFBQWE7QUFBQSxVQUNwQixTQUFTLEVBQUUsc0JBQXNCLEtBQUs7QUFBQSxVQUN0QyxnQkFBZ0IsRUFBRSxjQUFjLEtBQUs7QUFBQSxVQUNyQyxXQUFXO0FBQUEsUUFDWixDQUFDLENBQUM7QUFDRixnQkFBUSxRQUFRLEtBQUssVUFBVSxnQkFBZ0IsS0FBSyxNQUFNO0FBQzFELGFBQUssZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTztBQUNOLGtCQUFVLEtBQUs7QUFBQSxNQUNoQjtBQUVBLGNBQVEsUUFBUSxTQUFTO0FBR3pCLFlBQU0sU0FBVSxRQUFvQztBQUNwRCxjQUFRLFlBQVksRUFBRSxNQUFNLGFBQWEsTUFBTSxRQUFRLFVBQVUsYUFBYSxTQUFTLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFBQSxJQUNuRyxPQUFPO0FBRU4sV0FBSyxVQUFVLGVBQWUsTUFBTSxVQUFVO0FBQzlDLFdBQUssVUFBVSxVQUFVLE1BQU0sVUFBVTtBQUN6QyxXQUFLLFVBQVUsbUJBQW1CLE1BQU0sU0FBUztBQUVqRCxZQUFNLE1BQU0sTUFBTSxLQUFLLGFBQWEsWUFBWTtBQUdoRCxVQUFJLEtBQUssa0JBQWtCLGlCQUFpQjtBQUMzQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLE1BQU0sSUFBSSxNQUFNO0FBQ3RCLFVBQUksTUFBTTtBQUNWLFVBQUksT0FBTyxFQUFFLEtBQUssTUFBTTtBQUV2QixZQUFJLEtBQUssa0JBQWtCLG1CQUFtQixLQUFLLFdBQVc7QUFDN0QsZUFBSyxVQUFVLFVBQVUsTUFBTTtBQUMvQixlQUFLLFVBQVUsVUFBVSxNQUFNLGFBQWE7QUFBQSxRQUM3QztBQUFBLE1BQ0QsR0FBRyxNQUFNO0FBRVIsWUFBSSxLQUFLLGtCQUFrQixtQkFBbUIsS0FBSyxXQUFXO0FBQzdELGVBQUssVUFBVSxVQUFVLE1BQU07QUFDL0IsZUFBSyxVQUFVLFVBQVUsTUFBTSxhQUFhO0FBQUEsUUFDN0M7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBR0EsU0FBSyxXQUFXLEtBQUs7QUFHckIsUUFBSSxhQUFhLFNBQVM7QUFDekIsV0FBSyxVQUFVLFlBQVksY0FBYyxhQUFhO0FBQ3RELFdBQUssVUFBVSxZQUFZLE1BQU0sVUFBVTtBQUMzQyxXQUFLLFVBQVUsaUJBQWlCLE1BQU0sVUFBVTtBQUFBLElBQ2pELE9BQU87QUFDTixXQUFLLFVBQVUsWUFBWSxjQUFjO0FBQ3pDLFdBQUssVUFBVSxZQUFZLE1BQU0sVUFBVTtBQUMzQyxXQUFLLFVBQVUsaUJBQWlCLE1BQU0sVUFBVTtBQUFBLElBQ2pEO0FBQ0EsU0FBSyxVQUFVLFFBQVEsY0FBYyxTQUFTLHlCQUF5QixhQUFhLGtCQUFrQixHQUFHLEtBQUssWUFBWSxNQUFNO0FBR2hJLFVBQU0sV0FBVyxVQUNkLFNBQVMsMkJBQTJCLE9BQU8sSUFDM0MsU0FBUywyQkFBMkIsT0FBTztBQUM5QyxTQUFLLFVBQVUsV0FBVyxjQUFjLGFBQWEsVUFDbEQsU0FBUyxtQ0FBbUMsdUJBQXVCLFVBQVUsa0JBQWtCLEdBQUcsS0FBSyxZQUFZLFFBQVEsYUFBYSxPQUFPLElBQy9JLFNBQVMsZ0NBQWdDLHVCQUF1QixVQUFVLGtCQUFrQixHQUFHLEtBQUssWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUc1SSxTQUFLLFVBQVUsUUFBUSxXQUFXLG9CQUFvQjtBQUN0RCxTQUFLLFVBQVUsUUFBUSxXQUFXLG9CQUFvQixLQUFLLFlBQVksU0FBUztBQUtoRixhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssbUJBQW1CLFFBQVEsS0FBSztBQUN4RCxZQUFNLFdBQVcsTUFBTTtBQUN2QixZQUFNLFlBQVksS0FBSyxtQkFBbUIsQ0FBQztBQUMzQyxnQkFBVSxVQUFVLE9BQU8sVUFBVSxRQUFRO0FBQzdDLFVBQUksVUFBVTtBQUNiLGtCQUFVLGFBQWEsZ0JBQWdCLE1BQU07QUFBQSxNQUM5QyxPQUFPO0FBQ04sa0JBQVUsZ0JBQWdCLGNBQWM7QUFBQSxNQUN6QztBQUFBLElBQ0Q7QUFNQSxVQUFNLGtCQUFrQixLQUFLLG1CQUFtQixlQUFlO0FBQy9ELFFBQUksaUJBQWlCO0FBQ3BCLHNCQUFnQixlQUFlLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxDQUFDO0FBQUEsSUFDdkU7QUFHQSxRQUFJLEtBQUssaUJBQWlCLDBCQUEwQjtBQUNuRCxZQUFNLGlCQUFpQixLQUFLLFVBQVUsTUFBTSxZQUFZO0FBQ3hELFdBQUssTUFBTSxRQUFRLGVBQWUsU0FBUyxLQUFLLE1BQU0sV0FBVyxLQUFLO0FBQUEsSUFDdkU7QUFHQSxTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFQSxNQUFjLGFBQWEsT0FBd0M7QUFDbEUsVUFBTSxTQUFTLEtBQUssY0FBYyxJQUFJLE1BQU0sRUFBRTtBQUM5QyxRQUFJLFFBQVE7QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFDSixRQUFJLE1BQU0sTUFBTTtBQUVmLGVBQVMsTUFBTSxnQkFBZ0IsYUFBYSxNQUFNLE9BQU8sTUFBTSxLQUFLO0FBQUEsSUFDckUsV0FBVyxNQUFNLEtBQUs7QUFDckIsWUFBTSxVQUFVLE1BQU0sS0FBSyxhQUFhLFNBQVMsTUFBTSxHQUFHO0FBQzFELGVBQVMsUUFBUSxNQUFNO0FBQUEsSUFDeEIsT0FBTztBQUNOLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxPQUFPLElBQUksS0FBSyxDQUFDLE1BQWlDLEdBQUcsRUFBRSxNQUFNLE1BQU0sU0FBUyxDQUFDO0FBQ25GLFVBQU0sTUFBTSxJQUFJLGdCQUFnQixJQUFJO0FBQ3BDLFNBQUssY0FBYyxJQUFJLE1BQU0sSUFBSSxHQUFHO0FBQ3BDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx3QkFBOEI7QUFDckMsZUFBVyxPQUFPLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDOUMsVUFBSSxnQkFBZ0IsR0FBRztBQUFBLElBQ3hCO0FBQ0EsU0FBSyxjQUFjLE1BQU07QUFBQSxFQUMxQjtBQUFBLEVBRUEsTUFBYyxhQUFhLE9BQTRDO0FBQ3RFLFFBQUksTUFBTSxNQUFNO0FBQ2YsYUFBTyxNQUFNLGdCQUFnQixhQUFhLE1BQU0sT0FBTyxNQUFNLEtBQUs7QUFBQSxJQUNuRSxXQUFXLE1BQU0sS0FBSztBQUNyQixZQUFNLFVBQVUsTUFBTSxLQUFLLGFBQWEsU0FBUyxNQUFNLEdBQUc7QUFDMUQsYUFBTyxRQUFRLE1BQU07QUFBQSxJQUN0QjtBQUNBLFdBQU8sSUFBSSxXQUFXLENBQUM7QUFBQSxFQUN4QjtBQUFBLEVBRVEseUJBQStCO0FBQ3RDLGVBQVcsT0FBTyxDQUFDLEtBQUssZ0JBQWdCLEdBQUcsS0FBSyxnQkFBZ0IsQ0FBQyxHQUFHO0FBQ25FLFVBQUksT0FBTyxLQUFLLE1BQU0sS0FBSyxZQUFZLFFBQVE7QUFDOUMsY0FBTSxnQkFBZ0IsS0FBSyxZQUFZLEdBQUcsRUFBRTtBQUM1QyxZQUFJLGdCQUFnQixjQUFjLFFBQVEsR0FBRztBQUU1QyxlQUFLLGFBQWEsYUFBYSxFQUFFLE1BQU0sTUFBTTtBQUFBLFVBQWUsQ0FBQztBQUFBLFFBQzlELE9BQU87QUFDTixlQUFLLGFBQWEsYUFBYSxFQUFFLEtBQUssU0FBTztBQUc1QyxrQkFBTSxNQUFNLElBQUksTUFBTTtBQUN0QixnQkFBSSxNQUFNO0FBQ1YsZ0JBQUksT0FBTyxFQUFFLE1BQU0sTUFBTTtBQUFBLFlBQXNCLENBQUM7QUFBQSxVQUNqRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsV0FBaUI7QUFDaEIsUUFBSSxLQUFLLGdCQUFnQixHQUFHO0FBQzNCLFdBQUs7QUFDTCxXQUFLLG1CQUFtQjtBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBYTtBQUNaLFFBQUksS0FBSyxnQkFBZ0IsS0FBSyxZQUFZLFNBQVMsR0FBRztBQUNyRCxXQUFLO0FBQ0wsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLG1CQUF5QjtBQUNoQyxRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCO0FBQUEsSUFDRDtBQUNBLFVBQU0sTUFBTSxLQUFLLFVBQVU7QUFDM0IsUUFBSSxJQUFJLGVBQWUsR0FBRztBQUN6QixXQUFLLGFBQWEsSUFBSSxjQUFjLElBQUk7QUFBQSxJQUN6QyxPQUFPO0FBQ04sV0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxVQUFnQjtBQUN2QixRQUFJLEtBQUssZUFBZSxPQUFPO0FBQzlCLFdBQUssaUJBQWlCO0FBQUEsSUFDdkI7QUFDQSxVQUFNLFFBQVEsS0FBSztBQUNuQixRQUFJLElBQUk7QUFDUixXQUFPLElBQUksWUFBWSxRQUFRLEVBQUUsR0FBRztBQUNuQyxVQUFJLFlBQVksQ0FBQyxJQUFJLE9BQU87QUFDM0I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFNBQUssV0FBVyxZQUFZLENBQUMsS0FBSyxTQUFTO0FBQUEsRUFDNUM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFdBQWlCO0FBQ3hCLFFBQUksS0FBSyxlQUFlLE9BQU87QUFDOUIsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUNBLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFFBQUksSUFBSSxZQUFZLFNBQVM7QUFDN0IsV0FBTyxLQUFLLEdBQUcsRUFBRSxHQUFHO0FBQ25CLFVBQUksWUFBWSxDQUFDLElBQUksT0FBTztBQUMzQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsU0FBSyxXQUFXLFlBQVksQ0FBQyxLQUFLLFNBQVM7QUFBQSxFQUM1QztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsV0FBVyxVQUEyQjtBQUM3QyxRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxLQUFLLFVBQVU7QUFDakMsVUFBTSxNQUFNLEtBQUssVUFBVTtBQUUzQixRQUFJLGFBQWEsT0FBTztBQUN2QixXQUFLLGFBQWE7QUFDbEIsVUFBSSxVQUFVLElBQUksY0FBYztBQUNoQyxVQUFJLFVBQVUsT0FBTyxXQUFXO0FBQ2hDLFVBQUksTUFBTSxPQUFPO0FBR2pCLFlBQU0sWUFBWSxVQUFVLFVBQVUsU0FBUyxRQUFRO0FBQ3ZELGdCQUFVLFVBQVUsT0FBTyxRQUFRO0FBQ25DLGdCQUFVLFVBQVUsT0FBTyxVQUFVO0FBQ3JDLFVBQUksV0FBVztBQUNkLGtCQUFVLFNBQVMsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLFFBQVEsTUFBTSxVQUFVLFdBQVcsU0FBUztBQUNsRCxXQUFLLGFBQWE7QUFHbEIsWUFBTSxLQUFLLFVBQVUsY0FBYyxLQUMvQixVQUFVLGFBQWEsVUFBVSxjQUFjLEtBQUssVUFBVSxjQUMvRDtBQUNILFlBQU0sS0FBSyxVQUFVLGVBQWUsS0FDaEMsVUFBVSxZQUFZLFVBQVUsZUFBZSxLQUFLLFVBQVUsZUFDL0Q7QUFFSCxVQUFJLFVBQVUsT0FBTyxjQUFjO0FBQ25DLFVBQUksVUFBVSxPQUFPLGFBQWEsU0FBUyxvQkFBb0I7QUFDL0QsVUFBSSxNQUFNLE9BQU8sT0FBTyxLQUFLO0FBQzdCLGdCQUFVLFVBQVUsSUFBSSxRQUFRO0FBSWhDLFlBQU0sYUFBYSxVQUFVLGNBQWMsS0FBSyxVQUFVLGNBQWM7QUFDeEUsWUFBTSxhQUFhLFVBQVUsZUFBZSxLQUFLLFVBQVUsZUFBZTtBQUMxRSxnQkFBVSxTQUFTLFlBQVksVUFBVTtBQUFBLElBQzFDO0FBQUEsRUFDRDtBQUFBLEVBRVMsUUFBYztBQUN0QixVQUFNLE1BQU07QUFDWixTQUFLLFdBQVcsS0FBSyxNQUFNO0FBQUEsRUFDNUI7QUFBQSxFQUVTLE9BQU8sV0FBNEI7QUFDM0MsUUFBSSxLQUFLLFlBQVk7QUFDcEIsV0FBSyxXQUFXLE1BQU0sUUFBUSxHQUFHLFVBQVUsS0FBSztBQUNoRCxXQUFLLFdBQVcsTUFBTSxTQUFTLEdBQUcsVUFBVSxNQUFNO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQ0Q7QUFucUJhLG9CQUNJLEtBQUs7QUFEVCxzQkFBTjtBQUFBLEVBK0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkNVOyIsCiAgIm5hbWVzIjogW10KfQo=
