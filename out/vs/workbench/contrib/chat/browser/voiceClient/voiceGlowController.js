import "./media/voiceGlow.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { DEFAULT_VOICE_GLOW_COLORS, resolveVoiceRimAccent, voiceGlowStateColor } from "./voiceGlow.js";
const FADE = "opacity .6s cubic-bezier(.4,0,.2,1)";
const FADE_OUT_MS = 650;
const ACTIVE_RIM_STRENGTH = 1.02;
const RIM_LAYER_OPACITY = {
  dark: { ring: 1, inner: 0.44, bloom: 0.66 },
  light: { ring: 1, inner: 0.3, bloom: 0.8 }
};
const RIM_DURATION = 2.3;
function rimMotionParams(theme, duration) {
  const dark = theme === "dark";
  const scale = duration / RIM_DURATION;
  return {
    /** How much the blobs grow and shrink. */
    spread: 0.28,
    /** How far the blobs drift, in px. */
    drift: dark ? 33 : 40,
    /** Depth of the per-quadrant opacity swell. */
    opacityDepth: dark ? 0.48 : 0.45,
    /** Depth of the global height swell. */
    breathDepth: dark ? 0.34 : 0.22,
    /** Base period for the opacity swell. */
    opacityPeriod: (dark ? 1.9 : 2.6) * scale,
    /** Base period for the size swell. */
    sizePeriod: (dark ? 2.6 : 4.6) * scale,
    /** Period of the global height swell. */
    breathPeriod: (dark ? 2.4 : 5.5) * scale
  };
}
function rimOscillators(theme, duration) {
  const { spread, drift, opacityDepth, breathDepth, opacityPeriod, sizePeriod, breathPeriod } = rimMotionParams(theme, duration);
  return [
    { prop: "--vg-w1", from: 1 - spread, to: 1 + spread * 1.1, period: sizePeriod * 0.9, delay: 0, unit: "" },
    { prop: "--vg-h1", from: 1 + spread * 0.9, to: 1 - spread * 0.85, period: sizePeriod * 1.26, delay: 0, unit: "" },
    { prop: "--vg-x1", from: -drift, to: drift * 0.9, period: opacityPeriod * 1.6, delay: 0, unit: "px" },
    { prop: "--vg-y1", from: drift * 0.55, to: -drift * 0.7, period: opacityPeriod * 1.6, delay: 0, unit: "px" },
    { prop: "--vg-w2", from: 1 + spread, to: 1 - spread * 0.85, period: sizePeriod * 1.1, delay: 0, unit: "" },
    { prop: "--vg-h2", from: 1 - spread * 0.8, to: 1 + spread * 1.05, period: sizePeriod * 0.81, delay: 0, unit: "" },
    { prop: "--vg-x2", from: drift * 0.8, to: -drift * 0.9, period: opacityPeriod * 1.88, delay: 0, unit: "px" },
    { prop: "--vg-y2", from: -drift, to: drift * 0.65, period: opacityPeriod * 1.88, delay: 0, unit: "px" },
    { prop: "--vg-w3", from: 1 - spread * 0.6, to: 1 + spread * 1.15, period: sizePeriod * 0.98, delay: 0, unit: "" },
    { prop: "--vg-h3", from: 1 + spread * 0.75, to: 1 - spread, period: sizePeriod * 1.4, delay: 0, unit: "" },
    { prop: "--vg-x3", from: -drift * 0.6, to: drift, period: opacityPeriod * 1.45, delay: 0, unit: "px" },
    { prop: "--vg-y3", from: -drift * 0.85, to: drift * 0.45, period: opacityPeriod * 1.45, delay: 0, unit: "px" },
    { prop: "--vg-breath", from: 1 - breathDepth, to: 1 + breathDepth, period: breathPeriod, delay: 0, unit: "" },
    { prop: "--vg-op-tl", from: 1 - opacityDepth, to: 1, period: opacityPeriod, delay: 0, unit: "" },
    { prop: "--vg-op-tr", from: 1 - opacityDepth, to: 1, period: opacityPeriod * 1.32, delay: opacityPeriod * 0.28, unit: "" },
    { prop: "--vg-op-bl", from: 1 - opacityDepth, to: 1, period: opacityPeriod * 0.84, delay: opacityPeriod * 0.55, unit: "" },
    { prop: "--vg-op-br", from: 1 - opacityDepth, to: 1, period: opacityPeriod * 1.58, delay: opacityPeriod * 0.83, unit: "" }
  ];
}
function applyOscillators(host, oscillators, time, animate) {
  for (const osc of oscillators) {
    const value = animate ? osc.from + (osc.to - osc.from) * ((1 - Math.cos(2 * Math.PI * ((time - osc.delay) / osc.period))) / 2) : (osc.from + osc.to) / 2;
    host.style.setProperty(osc.prop, osc.unit === "px" ? `${value.toFixed(2)}px` : value.toFixed(4));
  }
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function nowSeconds(el) {
  const view = el.ownerDocument.defaultView;
  return (view?.performance ?? performance).now() / 1e3;
}
function mountRimLayers(host, options) {
  const store = new DisposableStore();
  const doc = host.ownerDocument;
  const moodClass = `voice-glow-rim-${options.mood}`;
  host.classList.add("voice-glow-rim", moodClass);
  store.add(toDisposable(() => host.classList.remove("voice-glow-rim", moodClass)));
  for (const cls of ["voice-glow-rim-corners", "voice-glow-rim-bloom"]) {
    const el = doc.createElement("div");
    el.className = cls;
    host.appendChild(el);
    store.add(toDisposable(() => el.remove()));
  }
  const layerOpacity = RIM_LAYER_OPACITY[options.theme];
  host.style.setProperty("--vg-sat", `${options.saturation}%`);
  host.style.setProperty("--vg-light", `${options.lightness}%`);
  host.style.setProperty("--vg-ring-opacity", String(layerOpacity.ring));
  host.style.setProperty("--vg-inner-opacity", String(layerOpacity.inner));
  host.style.setProperty("--vg-bloom-opacity", String(layerOpacity.bloom));
  if (options.size !== void 0) {
    host.style.setProperty("--vg-size", options.size.toFixed(3));
  }
  const oscillators = rimOscillators(options.theme, options.duration);
  let time = 0;
  let previousTimestamp;
  let level = 0.2;
  const apply = (input, animate) => {
    if (animate) {
      const timestamp = nowSeconds(host);
      const delta = previousTimestamp === void 0 ? 0 : Math.min(0.05, timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      const target = clamp01(input);
      level += (target - level) * (target > level ? 0.3 : 0.08);
      time += delta * (options.speedGain === 0 ? 0.22 : 0.4 + options.speedGain * level);
    } else {
      level = clamp01(input);
    }
    applyOscillators(host, oscillators, time, animate);
    const peak = level * level;
    host.style.setProperty("--vg-strength", (options.strength * (0.5 + options.audioGain * level + options.peakGain * peak)).toFixed(3));
    host.style.setProperty("--vg-bloom-opacity", (layerOpacity.bloom * (1 + options.peakGain * peak)).toFixed(3));
    const drift = animate ? 14 * Math.sin(time * 0.4) : 0;
    host.style.setProperty("--vg-hue", (options.hue + drift).toFixed(1));
  };
  return {
    host,
    drive: (input) => apply(input, true),
    driveStatic: (input) => apply(input, false),
    dispose: () => store.dispose()
  };
}
function createVoiceGlowController(target, themeKind, colors) {
  return new VoiceGlowController(target, themeKind, colors);
}
const RIM_REFERENCE_HEIGHT = 78;
const RIM_SIZE_FLOOR = 0.35;
function createVoiceRimLight(target, accent, theme, mood = "cool") {
  const store = new DisposableStore();
  const doc = target.ownerDocument;
  if (!target.style.position) {
    target.style.position = "relative";
  }
  const slot = doc.createElement("div");
  slot.className = "voice-glow-slot voice-glow-slot-inline";
  target.appendChild(slot);
  store.add(toDisposable(() => slot.remove()));
  const mount = store.add(new MutableDisposable());
  let level = 0.3;
  const remount = (nextAccent, nextTheme) => {
    const rim = resolveVoiceRimAccent(nextAccent, mood, nextTheme);
    const height = target.getBoundingClientRect().height;
    const proportion = height > 0 ? Math.min(1, height / RIM_REFERENCE_HEIGHT) : 0;
    mount.clear();
    mount.value = mountRimLayers(slot, {
      theme: nextTheme,
      mood,
      hue: rim.hue,
      saturation: rim.saturation,
      lightness: rim.lightness,
      strength: ACTIVE_RIM_STRENGTH,
      duration: RIM_DURATION,
      audioGain: 0.8,
      peakGain: 0.95,
      speedGain: 0.9,
      size: RIM_SIZE_FLOOR + (1 - RIM_SIZE_FLOOR) * proportion
    });
    mount.value.driveStatic(level);
  };
  remount(accent, theme);
  return {
    drive: (input) => {
      level = input;
      mount.value?.drive(input);
    },
    driveStatic: (input) => {
      level = input;
      mount.value?.driveStatic(input);
    },
    refresh: remount,
    dispose: () => store.dispose()
  };
}
class VoiceGlowController extends Disposable {
  constructor(_target, _themeKind = () => "dark", _colorsProvider = () => DEFAULT_VOICE_GLOW_COLORS) {
    super();
    this._target = _target;
    this._themeKind = _themeKind;
    this._colorsProvider = _colorsProvider;
    /** One mount per slot, so mounting a new layer tears the old one down. */
    this._mounts = /* @__PURE__ */ new Map();
    this._currentState = "none";
    this._reducedMotion = false;
    this._disposed = false;
    this._colors = this._colorsProvider();
    _target.style.position = _target.style.position || "relative";
    const doc = _target.ownerDocument;
    const createSlot = () => {
      const el = doc.createElement("div");
      el.className = "voice-glow-slot";
      el.style.zIndex = "11";
      _target.appendChild(el);
      this._register(toDisposable(() => el.remove()));
      this._mounts.set(el, this._register(new MutableDisposable()));
      return el;
    };
    this._slots = [createSlot(), createSlot()];
    this._register(toDisposable(() => {
      this._disposed = true;
      if (this._clearTimer !== void 0) {
        clearTimeout(this._clearTimer);
        this._clearTimer = void 0;
      }
    }));
  }
  dispose() {
    this._disposed = true;
    super.dispose();
  }
  render(state, level, reducedMotion) {
    if (this._disposed) {
      return;
    }
    const mood = resolveMood(state);
    this._reducedMotion = reducedMotion;
    if (!mood) {
      this.clear();
      return;
    }
    if (mood !== this._currentMood) {
      this._currentMood = mood;
      if (this._clearTimer !== void 0) {
        clearTimeout(this._clearTimer);
        this._clearTimer = void 0;
      }
      this._showLayer(mood, reducedMotion);
    }
    if (state !== this._currentState) {
      this._currentState = state;
      this._target.classList.add("voice-active");
      this._target.classList.toggle("voice-listening", state === "listening");
      this._target.classList.toggle("voice-processing", state === "processing");
      this._target.classList.toggle("voice-speaking", state === "speaking");
      this._target.style.setProperty("--voice-accent", voiceGlowStateColor(state, this._colors).toString());
    }
    if (this._front && !reducedMotion) {
      this._front.drive(level);
    }
  }
  clear() {
    if (this._disposed || this._currentState === "none") {
      return;
    }
    this._currentState = "none";
    this._currentMood = void 0;
    this._target.classList.remove("voice-active", "voice-listening", "voice-processing", "voice-speaking");
    this._target.style.removeProperty("--voice-accent");
    const previous = this._front;
    this._front = void 0;
    if (previous) {
      this._fadeOut(previous.host);
      this._scheduleTeardown(previous.host);
    }
  }
  /**
   * Tear a slot's mount down once it has faded out so it stops driving CSS
   * variables. Guarded on re-entry: if the slot has since been reused as the
   * front layer, the new mount must survive.
   */
  _scheduleTeardown(host) {
    if (this._clearTimer !== void 0) {
      clearTimeout(this._clearTimer);
    }
    this._clearTimer = setTimeout(() => {
      this._clearTimer = void 0;
      if (this._front?.host !== host) {
        this._mounts.get(host)?.clear();
      }
    }, FADE_OUT_MS);
  }
  refreshTheme() {
    if (this._disposed) {
      return;
    }
    this._colors = this._colorsProvider();
    const state = this._currentState;
    if (this._front && state !== "none") {
      this._currentState = "none";
      this._currentMood = void 0;
      this.render(state, 0.3, this._reducedMotion);
    }
  }
  _showLayer(mood, reducedMotion) {
    const host = this._slots.find((slot) => slot !== this._front?.host) ?? this._slots[0];
    this._mounts.get(host).clear();
    const mounted = this._mount(host, mood);
    this._mounts.get(host).value = mounted;
    if (reducedMotion) {
      mounted.driveStatic(0.4);
    }
    const fade = reducedMotion ? "none" : FADE;
    const previous = this._front;
    host.style.transition = "none";
    host.style.opacity = "0";
    void host.offsetWidth;
    host.style.transition = fade;
    host.style.opacity = "1";
    if (previous && previous.host !== host) {
      this._fadeOut(previous.host, fade);
      this._scheduleTeardown(previous.host);
    }
    this._front = mounted;
  }
  _fadeOut(host, fade = FADE) {
    host.style.transition = fade;
    host.style.opacity = "0";
  }
  _mount(host, mood) {
    const theme = this._themeKind();
    const accent = resolveVoiceRimAccent(mood === "warm" ? this._colors.speaking : this._colors.listening, mood, theme);
    return mountRimLayers(host, {
      theme,
      mood,
      hue: accent.hue,
      saturation: accent.saturation,
      lightness: accent.lightness,
      strength: ACTIVE_RIM_STRENGTH,
      duration: RIM_DURATION,
      audioGain: 0.8,
      // Lets the loudest moments read visibly denser rather than leaving the
      // whole range in a narrow band.
      peakGain: 0.95,
      speedGain: 0.9
    });
  }
}
function resolveMood(state) {
  switch (state) {
    case "listening":
      return "cool";
    case "speaking":
      return "warm";
    default:
      return void 0;
  }
}
export {
  createVoiceGlowController,
  createVoiceRimLight
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUdsb3dDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3ZvaWNlR2xvdy5jc3MnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfVk9JQ0VfR0xPV19DT0xPUlMsIEdsb3dUaGVtZUtpbmQsIElWb2ljZUdsb3dDb2xvcnMsIHJlc29sdmVWb2ljZVJpbUFjY2VudCwgdm9pY2VHbG93U3RhdGVDb2xvciwgVm9pY2VHbG93U3RhdGUsIFZvaWNlUmltTW9vZCB9IGZyb20gJy4vdm9pY2VHbG93LmpzJztcblxuZXhwb3J0IHR5cGUgeyBHbG93VGhlbWVLaW5kIH07XG5cbi8qKlxuICogVGhlIERPTSBhcHBsaWVyIGZvciB0aGUgVm9pY2UgTW9kZSBhbWJpZW50IGdsb3cuXG4gKlxuICogYGxpc3RlbmluZ2AgYW5kIGBzcGVha2luZ2AgcmVuZGVyIGFuIGF1ZGlvLXJlYWN0aXZlIGludGVyaW9yIFJJTSBcdTIwMTQgY29vbCB3aGlsZVxuICogdGhlIHVzZXIgc3BlYWtzLCB3YXJtIHdoaWxlIHRoZSBhZ2VudCBzcGVha3MuIEV2ZXJ5IG90aGVyIHN0YXRlIHJlbmRlcnNcbiAqIG5vdGhpbmcsIHNvIHRoZSBnbG93IG1lYW5zIFwic29tZW9uZSBpcyB0YWxraW5nXCIgcmF0aGVyIHRoYW4gXCJ2b2ljZSBpcyBvblwiLlxuICpcbiAqIEV2ZXJ5IHN0YXRlIGNoYW5nZSBpcyBhIHRydWUgY3Jvc3MtZmFkZSBiZXR3ZWVuIHR3byBidWZmZXJlZCBzbG90cywgc29cbiAqIGBsaXN0ZW5pbmcgLT4gc3BlYWtpbmdgIGRpc3NvbHZlcyBjb29sIC0+IHdhcm0gcmF0aGVyIHRoYW4gc25hcHBpbmcuIENvbG9ycyBhcmVcbiAqIGRlcml2ZWQgZnJvbSB0aGUgdGhlbWUgYWNjZW50IChzZWUgYHJlc29sdmVWb2ljZUdsb3dDb2xvcnNgKS5cbiAqXG4gKiBUaGUgcmltIGRlc2lnbiBpcyBpbnNwaXJlZCBieSB0aGUgd29yayBvZiBKYWt1YiBBbnRhbGlrIChASmFrdWJhbnRhbGlrKS5cbiAqL1xuXG4vKipcbiAqIENyb3NzLWZhZGUgdGltaW5nIHNoYXJlZCBieSBldmVyeSBzdGF0ZSB0cmFuc2l0aW9uLiBPcGFjaXR5IG9ubHk6IHRoZSBnbG93IGlzXG4gKiBsaWdodCwgYW5kIGxpZ2h0IGRpc3NvbHZlcyBcdTIwMTQgc2NhbGluZyBpdCB3b3VsZCByZWFkIGFzIHRoZSBib3ggXCJ6b29taW5nXCIsIHdoaWNoXG4gKiBwdWxscyB0aGUgZXllIHRvIGEgc2l6ZSBjaGFuZ2UgdGhhdCBpc24ndCBoYXBwZW5pbmcuXG4gKi9cbmNvbnN0IEZBREUgPSAnb3BhY2l0eSAuNnMgY3ViaWMtYmV6aWVyKC40LDAsLjIsMSknO1xuLyoqIEhvdyBsb25nIGEgZmFkZWQtb3V0IHNsb3QgaXMga2VwdCBtb3VudGVkIGJlZm9yZSBpdHMgbGF5ZXIgaXMgdG9ybiBkb3duLiAqL1xuY29uc3QgRkFERV9PVVRfTVMgPSA2NTA7XG5cbi8qKiBCYXNlIHN0cmVuZ3RoIG9mIGFuIGFjdGl2ZSByaW0sIGJlZm9yZSB0aGUgYXVkaW8gbGV2ZWwgaXMgYXBwbGllZC4gKi9cbmNvbnN0IEFDVElWRV9SSU1fU1RSRU5HVEggPSAxLjAyO1xuXG4vKiogUGVyLXRoZW1lIG9wYWNpdHkgb2YgdGhlIHRocmVlIHJpbSBsYXllcnMgKHJpbmcgLyBpbm5lciB3YXNoIC8gYmxvb20pLiAqL1xuY29uc3QgUklNX0xBWUVSX09QQUNJVFkgPSB7XG5cdGRhcms6IHsgcmluZzogMSwgaW5uZXI6IDAuNDQsIGJsb29tOiAwLjY2IH0sXG5cdGxpZ2h0OiB7IHJpbmc6IDEsIGlubmVyOiAwLjMsIGJsb29tOiAwLjggfSxcbn0gYXMgY29uc3Q7XG5cbi8qKiBTZWNvbmRzIGZvciBvbmUgZnVsbCBicmVhdGggY3ljbGUuICovXG5jb25zdCBSSU1fRFVSQVRJT04gPSAyLjM7XG5cbi8qKlxuICogV2hpY2ggb2YgdGhlIHR3byB0YWxraW5nIHN0YXRlcyB0aGUgcmltIGlzIHNob3dpbmcuIFB1Ymxpc2hlZCBhcyBhIGNsYXNzIHNvXG4gKiBoaWdoLWNvbnRyYXN0IHRoZW1lcyBjYW4gc3R5bGUgZWFjaCBvbmUuXG4gKi9cbnR5cGUgUmltTW9vZCA9IFZvaWNlUmltTW9vZDtcblxuLyoqIEEgbGl2ZSBsYXllciBtb3VudGVkIG9uIG9uZSBvZiB0aGUgYnVmZmVyZWQgc2xvdHMuICovXG5pbnRlcmZhY2UgSU1vdW50ZWRMYXllciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgaG9zdDogSFRNTEVsZW1lbnQ7XG5cdC8qKiBBZHZhbmNlIG1vdGlvbiArIGludGVuc2l0eSBmcm9tIHRoZSBzbW9vdGhlZCBhdWRpbyBgbGV2ZWxgIChbMCwxXSkuICovXG5cdGRyaXZlKGxldmVsOiBudW1iZXIpOiB2b2lkO1xuXHQvKiogUGluIHRvIGEgcmVwcmVzZW50YXRpdmUgc3RpbGwgZnJhbWUgKHJlZHVjZWQgbW90aW9uKS4gKi9cblx0ZHJpdmVTdGF0aWMobGV2ZWw6IG51bWJlcik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlR2xvd0NvbnRyb2xsZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdC8qKiBTaG93L2tlZXAgdGhlIGdsb3cgZm9yIGBzdGF0ZWAsIGRyaXZpbmcgaW50ZW5zaXR5IGZyb20gYGxldmVsYCAoWzAsMV0pLiAqL1xuXHRyZW5kZXIoc3RhdGU6IFZvaWNlR2xvd1N0YXRlLCBsZXZlbDogbnVtYmVyLCByZWR1Y2VkTW90aW9uOiBib29sZWFuKTogdm9pZDtcblx0LyoqIEZhZGUgdGhlIGdsb3cgb3V0IChub3Qtb3duZXIgLyBkaXNjb25uZWN0ZWQpLiAqL1xuXHRjbGVhcigpOiB2b2lkO1xuXHQvKiogUmUtYXBwbHkgdGhlIGN1cnJlbnQgc3RhdGUgYWZ0ZXIgYSBjb2xvci10aGVtZSBjaGFuZ2UuICovXG5cdHJlZnJlc2hUaGVtZSgpOiB2b2lkO1xufVxuXG4vKipcbiAqIEEgc2luZ2xlIHNpbnVzb2lkYWwgb3NjaWxsYXRvciBwaW5nLXBvbmdpbmcgYSBDU1MgY3VzdG9tIHByb3BlcnR5IGJldHdlZW4gYGZyb21gXG4gKiBhbmQgYHRvYC4gRGVzeW5jZWQgcGVyaW9kcyBhcmUgd2hhdCBrZWVwIHRoZSByaW0gZnJvbSByZWFkaW5nIGFzIGEgbWVjaGFuaWNhbFxuICogcHVsc2U6IG5vIHR3byByZWdpb25zIHN3ZWxsIGF0IHRoZSBzYW1lIHRpbWUuXG4gKi9cbmludGVyZmFjZSBJT3NjaWxsYXRvciB7XG5cdHJlYWRvbmx5IHByb3A6IHN0cmluZztcblx0cmVhZG9ubHkgZnJvbTogbnVtYmVyO1xuXHRyZWFkb25seSB0bzogbnVtYmVyO1xuXHQvKiogRnVsbCBwZXJpb2QsIGluIHNlY29uZHMuICovXG5cdHJlYWRvbmx5IHBlcmlvZDogbnVtYmVyO1xuXHQvKiogUGhhc2Ugb2Zmc2V0LCBpbiBzZWNvbmRzLiAqL1xuXHRyZWFkb25seSBkZWxheTogbnVtYmVyO1xuXHRyZWFkb25seSB1bml0OiAnJyB8ICdweCc7XG59XG5cbi8qKiBCcmVhdGhpbmcgcGFyYW1ldGVycywgdGhlbWUtdHVuZWQuICovXG5mdW5jdGlvbiByaW1Nb3Rpb25QYXJhbXModGhlbWU6IEdsb3dUaGVtZUtpbmQsIGR1cmF0aW9uOiBudW1iZXIpIHtcblx0Y29uc3QgZGFyayA9IHRoZW1lID09PSAnZGFyayc7XG5cdGNvbnN0IHNjYWxlID0gZHVyYXRpb24gLyBSSU1fRFVSQVRJT047XG5cdHJldHVybiB7XG5cdFx0LyoqIEhvdyBtdWNoIHRoZSBibG9icyBncm93IGFuZCBzaHJpbmsuICovXG5cdFx0c3ByZWFkOiAwLjI4LFxuXHRcdC8qKiBIb3cgZmFyIHRoZSBibG9icyBkcmlmdCwgaW4gcHguICovXG5cdFx0ZHJpZnQ6IGRhcmsgPyAzMyA6IDQwLFxuXHRcdC8qKiBEZXB0aCBvZiB0aGUgcGVyLXF1YWRyYW50IG9wYWNpdHkgc3dlbGwuICovXG5cdFx0b3BhY2l0eURlcHRoOiBkYXJrID8gMC40OCA6IDAuNDUsXG5cdFx0LyoqIERlcHRoIG9mIHRoZSBnbG9iYWwgaGVpZ2h0IHN3ZWxsLiAqL1xuXHRcdGJyZWF0aERlcHRoOiBkYXJrID8gMC4zNCA6IDAuMjIsXG5cdFx0LyoqIEJhc2UgcGVyaW9kIGZvciB0aGUgb3BhY2l0eSBzd2VsbC4gKi9cblx0XHRvcGFjaXR5UGVyaW9kOiAoZGFyayA/IDEuOSA6IDIuNikgKiBzY2FsZSxcblx0XHQvKiogQmFzZSBwZXJpb2QgZm9yIHRoZSBzaXplIHN3ZWxsLiAqL1xuXHRcdHNpemVQZXJpb2Q6IChkYXJrID8gMi42IDogNC42KSAqIHNjYWxlLFxuXHRcdC8qKiBQZXJpb2Qgb2YgdGhlIGdsb2JhbCBoZWlnaHQgc3dlbGwuICovXG5cdFx0YnJlYXRoUGVyaW9kOiAoZGFyayA/IDIuNCA6IDUuNSkgKiBzY2FsZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmltT3NjaWxsYXRvcnModGhlbWU6IEdsb3dUaGVtZUtpbmQsIGR1cmF0aW9uOiBudW1iZXIpOiBJT3NjaWxsYXRvcltdIHtcblx0Y29uc3QgeyBzcHJlYWQsIGRyaWZ0LCBvcGFjaXR5RGVwdGgsIGJyZWF0aERlcHRoLCBvcGFjaXR5UGVyaW9kLCBzaXplUGVyaW9kLCBicmVhdGhQZXJpb2QgfSA9IHJpbU1vdGlvblBhcmFtcyh0aGVtZSwgZHVyYXRpb24pO1xuXHRyZXR1cm4gW1xuXHRcdHsgcHJvcDogJy0tdmctdzEnLCBmcm9tOiAxIC0gc3ByZWFkLCB0bzogMSArIHNwcmVhZCAqIDEuMSwgcGVyaW9kOiBzaXplUGVyaW9kICogMC45LCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLWgxJywgZnJvbTogMSArIHNwcmVhZCAqIDAuOSwgdG86IDEgLSBzcHJlYWQgKiAwLjg1LCBwZXJpb2Q6IHNpemVQZXJpb2QgKiAxLjI2LCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLXgxJywgZnJvbTogLWRyaWZ0LCB0bzogZHJpZnQgKiAwLjksIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuNiwgZGVsYXk6IDAsIHVuaXQ6ICdweCcgfSxcblx0XHR7IHByb3A6ICctLXZnLXkxJywgZnJvbTogZHJpZnQgKiAwLjU1LCB0bzogLWRyaWZ0ICogMC43LCBwZXJpb2Q6IG9wYWNpdHlQZXJpb2QgKiAxLjYsIGRlbGF5OiAwLCB1bml0OiAncHgnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy13MicsIGZyb206IDEgKyBzcHJlYWQsIHRvOiAxIC0gc3ByZWFkICogMC44NSwgcGVyaW9kOiBzaXplUGVyaW9kICogMS4xLCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLWgyJywgZnJvbTogMSAtIHNwcmVhZCAqIDAuOCwgdG86IDEgKyBzcHJlYWQgKiAxLjA1LCBwZXJpb2Q6IHNpemVQZXJpb2QgKiAwLjgxLCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLXgyJywgZnJvbTogZHJpZnQgKiAwLjgsIHRvOiAtZHJpZnQgKiAwLjksIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuODgsIGRlbGF5OiAwLCB1bml0OiAncHgnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy15MicsIGZyb206IC1kcmlmdCwgdG86IGRyaWZ0ICogMC42NSwgcGVyaW9kOiBvcGFjaXR5UGVyaW9kICogMS44OCwgZGVsYXk6IDAsIHVuaXQ6ICdweCcgfSxcblx0XHR7IHByb3A6ICctLXZnLXczJywgZnJvbTogMSAtIHNwcmVhZCAqIDAuNiwgdG86IDEgKyBzcHJlYWQgKiAxLjE1LCBwZXJpb2Q6IHNpemVQZXJpb2QgKiAwLjk4LCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLWgzJywgZnJvbTogMSArIHNwcmVhZCAqIDAuNzUsIHRvOiAxIC0gc3ByZWFkLCBwZXJpb2Q6IHNpemVQZXJpb2QgKiAxLjQsIGRlbGF5OiAwLCB1bml0OiAnJyB9LFxuXHRcdHsgcHJvcDogJy0tdmcteDMnLCBmcm9tOiAtZHJpZnQgKiAwLjYsIHRvOiBkcmlmdCwgcGVyaW9kOiBvcGFjaXR5UGVyaW9kICogMS40NSwgZGVsYXk6IDAsIHVuaXQ6ICdweCcgfSxcblx0XHR7IHByb3A6ICctLXZnLXkzJywgZnJvbTogLWRyaWZ0ICogMC44NSwgdG86IGRyaWZ0ICogMC40NSwgcGVyaW9kOiBvcGFjaXR5UGVyaW9kICogMS40NSwgZGVsYXk6IDAsIHVuaXQ6ICdweCcgfSxcblx0XHR7IHByb3A6ICctLXZnLWJyZWF0aCcsIGZyb206IDEgLSBicmVhdGhEZXB0aCwgdG86IDEgKyBicmVhdGhEZXB0aCwgcGVyaW9kOiBicmVhdGhQZXJpb2QsIGRlbGF5OiAwLCB1bml0OiAnJyB9LFxuXHRcdHsgcHJvcDogJy0tdmctb3AtdGwnLCBmcm9tOiAxIC0gb3BhY2l0eURlcHRoLCB0bzogMSwgcGVyaW9kOiBvcGFjaXR5UGVyaW9kLCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLW9wLXRyJywgZnJvbTogMSAtIG9wYWNpdHlEZXB0aCwgdG86IDEsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuMzIsIGRlbGF5OiBvcGFjaXR5UGVyaW9kICogMC4yOCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLW9wLWJsJywgZnJvbTogMSAtIG9wYWNpdHlEZXB0aCwgdG86IDEsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDAuODQsIGRlbGF5OiBvcGFjaXR5UGVyaW9kICogMC41NSwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLW9wLWJyJywgZnJvbTogMSAtIG9wYWNpdHlEZXB0aCwgdG86IDEsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuNTgsIGRlbGF5OiBvcGFjaXR5UGVyaW9kICogMC44MywgdW5pdDogJycgfSxcblx0XTtcbn1cblxuZnVuY3Rpb24gYXBwbHlPc2NpbGxhdG9ycyhob3N0OiBIVE1MRWxlbWVudCwgb3NjaWxsYXRvcnM6IHJlYWRvbmx5IElPc2NpbGxhdG9yW10sIHRpbWU6IG51bWJlciwgYW5pbWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRmb3IgKGNvbnN0IG9zYyBvZiBvc2NpbGxhdG9ycykge1xuXHRcdGNvbnN0IHZhbHVlID0gYW5pbWF0ZVxuXHRcdFx0PyBvc2MuZnJvbSArIChvc2MudG8gLSBvc2MuZnJvbSkgKiAoKDEgLSBNYXRoLmNvcygyICogTWF0aC5QSSAqICgodGltZSAtIG9zYy5kZWxheSkgLyBvc2MucGVyaW9kKSkpIC8gMilcblx0XHRcdDogKG9zYy5mcm9tICsgb3NjLnRvKSAvIDI7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eShvc2MucHJvcCwgb3NjLnVuaXQgPT09ICdweCcgPyBgJHt2YWx1ZS50b0ZpeGVkKDIpfXB4YCA6IHZhbHVlLnRvRml4ZWQoNCkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNsYW1wMDEodmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCB2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBub3dTZWNvbmRzKGVsOiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdGNvbnN0IHZpZXcgPSBlbC5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3O1xuXHRyZXR1cm4gKHZpZXc/LnBlcmZvcm1hbmNlID8/IHBlcmZvcm1hbmNlKS5ub3coKSAvIDEwMDA7XG59XG5cbi8qKlxuICogTW91bnQgdGhlIHJpbSBsYXllcnMgKHJpbmcsIGlubmVyIHdhc2gsIGJsb29tIGFuZCBjb3JuZXIgY2F0Y2hlcykgb24gYGhvc3RgIGFuZFxuICogcmV0dXJuIGEgZHJpdmVyIGZvciB0aGVtLiBgaG9zdGAgYWxyZWFkeSBjYXJyaWVzIHRoZSBgdm9pY2UtZ2xvdy1yaW1gIGNsYXNzLlxuICovXG5mdW5jdGlvbiBtb3VudFJpbUxheWVycyhob3N0OiBIVE1MRWxlbWVudCwgb3B0aW9uczoge1xuXHRyZWFkb25seSB0aGVtZTogR2xvd1RoZW1lS2luZDtcblx0cmVhZG9ubHkgbW9vZDogUmltTW9vZDtcblx0cmVhZG9ubHkgaHVlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNhdHVyYXRpb246IG51bWJlcjtcblx0cmVhZG9ubHkgbGlnaHRuZXNzOiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0cmVuZ3RoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGR1cmF0aW9uOiBudW1iZXI7XG5cdC8qKiBIb3cgc3Ryb25nbHkgdGhlIGF1ZGlvIGxldmVsIG1vZHVsYXRlcyB0aGUgcmltLiAqL1xuXHRyZWFkb25seSBhdWRpb0dhaW46IG51bWJlcjtcblx0LyoqIEV4dHJhLCBzdXBlci1saW5lYXIgcmVzcG9uc2Ugc28gbG91ZCBwZWFrcyBibG9vbSByYXRoZXIgdGhhbiBqdXN0IGJyaWdodGVuLiAqL1xuXHRyZWFkb25seSBwZWFrR2FpbjogbnVtYmVyO1xuXHQvKiogSG93IHN0cm9uZ2x5IHRoZSBhdWRpbyBsZXZlbCBzcGVlZHMgdGhlIGJyZWF0aCB1cC4gKi9cblx0cmVhZG9ubHkgc3BlZWRHYWluOiBudW1iZXI7XG5cdC8qKiBTY2FsZXMgdGhlIHJpbSdzIGFic29sdXRlIGJsb2Igc2l6ZXMgdG8gdGhlIGhvc3QgKDEgPSBhIGNoYXQgaW5wdXQgYm94KS4gKi9cblx0cmVhZG9ubHkgc2l6ZT86IG51bWJlcjtcbn0pOiBJTW91bnRlZExheWVyIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGRvYyA9IGhvc3Qub3duZXJEb2N1bWVudDtcblxuXHRjb25zdCBtb29kQ2xhc3MgPSBgdm9pY2UtZ2xvdy1yaW0tJHtvcHRpb25zLm1vb2R9YDtcblx0aG9zdC5jbGFzc0xpc3QuYWRkKCd2b2ljZS1nbG93LXJpbScsIG1vb2RDbGFzcyk7XG5cdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gaG9zdC5jbGFzc0xpc3QucmVtb3ZlKCd2b2ljZS1nbG93LXJpbScsIG1vb2RDbGFzcykpKTtcblxuXHRmb3IgKGNvbnN0IGNscyBvZiBbJ3ZvaWNlLWdsb3ctcmltLWNvcm5lcnMnLCAndm9pY2UtZ2xvdy1yaW0tYmxvb20nXSkge1xuXHRcdGNvbnN0IGVsID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsLmNsYXNzTmFtZSA9IGNscztcblx0XHRob3N0LmFwcGVuZENoaWxkKGVsKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVsLnJlbW92ZSgpKSk7XG5cdH1cblxuXHRjb25zdCBsYXllck9wYWNpdHkgPSBSSU1fTEFZRVJfT1BBQ0lUWVtvcHRpb25zLnRoZW1lXTtcblx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1zYXQnLCBgJHtvcHRpb25zLnNhdHVyYXRpb259JWApO1xuXHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZnLWxpZ2h0JywgYCR7b3B0aW9ucy5saWdodG5lc3N9JWApO1xuXHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZnLXJpbmctb3BhY2l0eScsIFN0cmluZyhsYXllck9wYWNpdHkucmluZykpO1xuXHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZnLWlubmVyLW9wYWNpdHknLCBTdHJpbmcobGF5ZXJPcGFjaXR5LmlubmVyKSk7XG5cdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdmctYmxvb20tb3BhY2l0eScsIFN0cmluZyhsYXllck9wYWNpdHkuYmxvb20pKTtcblx0aWYgKG9wdGlvbnMuc2l6ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1zaXplJywgb3B0aW9ucy5zaXplLnRvRml4ZWQoMykpO1xuXHR9XG5cblx0Y29uc3Qgb3NjaWxsYXRvcnMgPSByaW1Pc2NpbGxhdG9ycyhvcHRpb25zLnRoZW1lLCBvcHRpb25zLmR1cmF0aW9uKTtcblx0bGV0IHRpbWUgPSAwO1xuXHRsZXQgcHJldmlvdXNUaW1lc3RhbXA6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IGxldmVsID0gMC4yO1xuXG5cdGNvbnN0IGFwcGx5ID0gKGlucHV0OiBudW1iZXIsIGFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkID0+IHtcblx0XHRpZiAoYW5pbWF0ZSkge1xuXHRcdFx0Y29uc3QgdGltZXN0YW1wID0gbm93U2Vjb25kcyhob3N0KTtcblx0XHRcdGNvbnN0IGRlbHRhID0gcHJldmlvdXNUaW1lc3RhbXAgPT09IHVuZGVmaW5lZCA/IDAgOiBNYXRoLm1pbigwLjA1LCB0aW1lc3RhbXAgLSBwcmV2aW91c1RpbWVzdGFtcCk7XG5cdFx0XHRwcmV2aW91c1RpbWVzdGFtcCA9IHRpbWVzdGFtcDtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNsYW1wMDEoaW5wdXQpO1xuXHRcdFx0Ly8gQXN5bW1ldHJpYzogc3dlbGwgaW50byBzcGVlY2ggcXVpY2tseSwgZHJpZnQgYmFjayBvdXQgb2YgaXQgc2xvd2x5LCBzb1xuXHRcdFx0Ly8gdGhlIHJpbSByZWFkcyBhcyBhbWJpZW50IGxpZ2h0IHJhdGhlciB0aGFuIGFzIGEgbGV2ZWwgbWV0ZXIuXG5cdFx0XHRsZXZlbCArPSAodGFyZ2V0IC0gbGV2ZWwpICogKHRhcmdldCA+IGxldmVsID8gMC4zIDogMC4wOCk7XG5cdFx0XHR0aW1lICs9IGRlbHRhICogKG9wdGlvbnMuc3BlZWRHYWluID09PSAwID8gMC4yMiA6IDAuNCArIG9wdGlvbnMuc3BlZWRHYWluICogbGV2ZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXZlbCA9IGNsYW1wMDEoaW5wdXQpO1xuXHRcdH1cblx0XHRhcHBseU9zY2lsbGF0b3JzKGhvc3QsIG9zY2lsbGF0b3JzLCB0aW1lLCBhbmltYXRlKTtcblx0XHQvLyBQZWFrcyByZWFkIGRlbnNlciB0aGFuIGEgbGluZWFyIHJlc3BvbnNlIHdvdWxkIGdpdmU6IHRoZSBleHRyYSBjdXJ2ZSBvblxuXHRcdC8vIHRvcCBvZiB0aGUgbGluZWFyIHRlcm0gbGVhdmVzIHF1aWV0IHNwZWVjaCBjYWxtIGJ1dCBsZXRzIGEgbG91ZCBtb21lbnRcblx0XHQvLyBnZW51aW5lbHkgYmxvb20sIGluc3RlYWQgb2YgdGhlIHdob2xlIHJhbmdlIHNpdHRpbmcgaW4gYSBuYXJyb3cgYmFuZC5cblx0XHRjb25zdCBwZWFrID0gbGV2ZWwgKiBsZXZlbDtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZnLXN0cmVuZ3RoJywgKG9wdGlvbnMuc3RyZW5ndGggKiAoMC41ICsgb3B0aW9ucy5hdWRpb0dhaW4gKiBsZXZlbCArIG9wdGlvbnMucGVha0dhaW4gKiBwZWFrKSkudG9GaXhlZCgzKSk7XG5cdFx0Ly8gVGhlIGJsb29tIHRoaWNrZW5zIHdpdGggdGhlIHBlYWsgdG9vLCBzbyBcImxvdWRlclwiIHJlYWRzIGFzIG1vcmUgbGlnaHRcblx0XHQvLyByYXRoZXIgdGhhbiBvbmx5IGFzIGEgYnJpZ2h0ZXIgaGFpcmxpbmUuXG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1ibG9vbS1vcGFjaXR5JywgKGxheWVyT3BhY2l0eS5ibG9vbSAqICgxICsgb3B0aW9ucy5wZWFrR2FpbiAqIHBlYWspKS50b0ZpeGVkKDMpKTtcblx0XHQvLyBBIHNsb3cgaHVlIHdhbmRlciBrZWVwcyB0aGUgbGlnaHQgYWxpdmUgd2l0aG91dCBldmVyIGxlYXZpbmcgdGhlIGFjY2VudC5cblx0XHRjb25zdCBkcmlmdCA9IGFuaW1hdGUgPyAxNCAqIE1hdGguc2luKHRpbWUgKiAwLjQpIDogMDtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZnLWh1ZScsIChvcHRpb25zLmh1ZSArIGRyaWZ0KS50b0ZpeGVkKDEpKTtcblx0fTtcblxuXHRyZXR1cm4ge1xuXHRcdGhvc3QsXG5cdFx0ZHJpdmU6IChpbnB1dDogbnVtYmVyKSA9PiBhcHBseShpbnB1dCwgdHJ1ZSksXG5cdFx0ZHJpdmVTdGF0aWM6IChpbnB1dDogbnVtYmVyKSA9PiBhcHBseShpbnB1dCwgZmFsc2UpLFxuXHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0fTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSB2b2ljZSBnbG93IGNvbnRyb2xsZXIgYm91bmQgdG8gYHRhcmdldGAgKHRoZSBpbnB1dCBib3gpLiBgdGhlbWVLaW5kYFxuICogbGV0cyB0aGUgY2FsbGVyIHN1cHBseSB0aGUgYWN0aXZlIGxpZ2h0L2RhcmsgdGhlbWUsIGFuZCBgY29sb3JzYCB0aGUgcmVzb2x2ZWRcbiAqIHRoZW1lIGFjY2VudHM7IGJvdGggYXJlIHJlLXJlYWQgb24ge0BsaW5rIElWb2ljZUdsb3dDb250cm9sbGVyLnJlZnJlc2hUaGVtZX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVWb2ljZUdsb3dDb250cm9sbGVyKHRhcmdldDogSFRNTEVsZW1lbnQsIHRoZW1lS2luZD86ICgpID0+IEdsb3dUaGVtZUtpbmQsIGNvbG9ycz86ICgpID0+IElWb2ljZUdsb3dDb2xvcnMpOiBJVm9pY2VHbG93Q29udHJvbGxlciB7XG5cdHJldHVybiBuZXcgVm9pY2VHbG93Q29udHJvbGxlcih0YXJnZXQsIHRoZW1lS2luZCwgY29sb3JzKTtcbn1cblxuLyoqIEEgc3RhbmRhbG9uZSByaW0gbGlnaHQgbW91bnRlZCBvdmVyIGEgc2luZ2xlIGVsZW1lbnQuICovXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZVJpbUxpZ2h0IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHQvKiogQWR2YW5jZSB0aGUgcmltIGZyb20gdGhlIHNtb290aGVkIGF1ZGlvIGBsZXZlbGAgKFswLDFdKS4gKi9cblx0ZHJpdmUobGV2ZWw6IG51bWJlcik6IHZvaWQ7XG5cdC8qKiBQaW4gdG8gYSByZXByZXNlbnRhdGl2ZSBzdGlsbCBmcmFtZSAocmVkdWNlZCBtb3Rpb24pLiAqL1xuXHRkcml2ZVN0YXRpYyhsZXZlbDogbnVtYmVyKTogdm9pZDtcblx0LyoqIFJlLW1vdW50IHdpdGggYSBmcmVzaGx5IHJlc29sdmVkIGFjY2VudCAvIHRoZW1lLiAqL1xuXHRyZWZyZXNoKGFjY2VudDogQ29sb3IsIHRoZW1lOiBHbG93VGhlbWVLaW5kKTogdm9pZDtcbn1cblxuLyoqXG4gKiBUaGUgaGVpZ2h0IChweCkgdGhlIHJpbSdzIGJsb2Igc2l6ZXMgYXJlIGF1dGhvcmVkIGFnYWluc3QgXHUyMDE0IGEgY2hhdCBpbnB1dCBib3guXG4gKiBTbWFsbGVyIGhvc3RzIHNjYWxlIHRoZWlyIGJsb2JzIGRvd24gZnJvbSB0aGlzLCBzbyBhIG1pYyBidXR0b24gZ2V0cyB0aGUgc2FtZVxuICogbGlnaHQgcmF0aGVyIHRoYW4gb25lIGJsb2IgY292ZXJpbmcgdGhlIHdob2xlIGVsZW1lbnQuXG4gKi9cbmNvbnN0IFJJTV9SRUZFUkVOQ0VfSEVJR0hUID0gNzg7XG5cbi8qKlxuICogSG93IG11Y2ggb2YgdGhlIHJpbSdzIHNjYWxlIGlzIGZpeGVkIHJhdGhlciB0aGFuIHByb3BvcnRpb25hbCB0byB0aGUgaG9zdC5cbiAqXG4gKiBTY2FsaW5nIHRoZSBibG9icyBzdHJpY3RseSB3aXRoIHRoZSBob3N0IGNvbGxhcHNlcyB0aGUgZWZmZWN0IG9uIGEgY29udHJvbDpcbiAqIHRoZSBibG9icyBzdG9wIG92ZXJsYXBwaW5nLCBzbyB0aGUgd2FzaCBicmVha3MgaW50byBzY2F0dGVyZWQgZG90cyBhbmQgb25seVxuICogdGhlIGhhaXJsaW5lIHN1cnZpdmVzLiBIb2xkaW5nIHBhcnQgb2YgdGhlIHNjYWxlIGJhY2sga2VlcHMgdGhlbSBsYXJnZSBlbm91Z2hcbiAqIHRvIGJsZWVkIGludG8gb25lIGFub3RoZXIsIHdoaWNoIGlzIHdoYXQgbWFrZXMgdGhlIHJpbSByZWFkIGFzIGxpZ2h0LlxuICovXG5jb25zdCBSSU1fU0laRV9GTE9PUiA9IDAuMzU7XG5cbi8qKlxuICogTW91bnQgdGhlIHJpbSBvdmVyIGB0YXJnZXRgIGFzIGFuIGFsd2F5cy1vbiBsaWdodCwgZm9yIGhvc3RzIHRoYXQgbGlnaHQgYVxuICogc2luZ2xlIGVsZW1lbnQgcmF0aGVyIHRoYW4gY3Jvc3MtZmFkaW5nIGJldHdlZW4gdm9pY2Ugc3RhdGVzIFx1MjAxNCB0aGUgZGljdGF0aW9uXG4gKiBtaWNyb3Bob25lLCB3aGljaCBpcyBlaXRoZXIgb3BlbiBvciBjbG9zZWQuXG4gKlxuICogVGhlIHJpbSBsaXZlcyBpbiBpdHMgb3duIGFic29sdXRlbHktcG9zaXRpb25lZCBzbG90LCBzbyBob3N0cyB0aGF0IHJlYnVpbGRcbiAqIHRoZWlyIGJ1dHRvbiBjb250ZW50cyBkb24ndCB0ZWFyIGl0IG91dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZvaWNlUmltTGlnaHQodGFyZ2V0OiBIVE1MRWxlbWVudCwgYWNjZW50OiBDb2xvciwgdGhlbWU6IEdsb3dUaGVtZUtpbmQsIG1vb2Q6IFZvaWNlUmltTW9vZCA9ICdjb29sJyk6IElWb2ljZVJpbUxpZ2h0IHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGRvYyA9IHRhcmdldC5vd25lckRvY3VtZW50O1xuXG5cdGlmICghdGFyZ2V0LnN0eWxlLnBvc2l0aW9uKSB7XG5cdFx0dGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0fVxuXHRjb25zdCBzbG90ID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRzbG90LmNsYXNzTmFtZSA9ICd2b2ljZS1nbG93LXNsb3Qgdm9pY2UtZ2xvdy1zbG90LWlubGluZSc7XG5cdHRhcmdldC5hcHBlbmRDaGlsZChzbG90KTtcblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzbG90LnJlbW92ZSgpKSk7XG5cblx0Y29uc3QgbW91bnQgPSBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElNb3VudGVkTGF5ZXI+KCkpO1xuXHRsZXQgbGV2ZWwgPSAwLjM7XG5cblx0Y29uc3QgcmVtb3VudCA9IChuZXh0QWNjZW50OiBDb2xvciwgbmV4dFRoZW1lOiBHbG93VGhlbWVLaW5kKSA9PiB7XG5cdFx0Y29uc3QgcmltID0gcmVzb2x2ZVZvaWNlUmltQWNjZW50KG5leHRBY2NlbnQsIG1vb2QsIG5leHRUaGVtZSk7XG5cdFx0Ly8gTWVhc3VyZWQgbGF6aWx5OiBob3N0cyBjb21tb25seSBidWlsZCB0aGUgYnV0dG9uIGJlZm9yZSBpdCBpcyBhdHRhY2hlZCxcblx0XHQvLyBhbmQgYSBkZXRhY2hlZCBlbGVtZW50IGhhcyBubyBib3ggdG8gbWVhc3VyZS5cblx0XHRjb25zdCBoZWlnaHQgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0O1xuXHRcdGNvbnN0IHByb3BvcnRpb24gPSBoZWlnaHQgPiAwID8gTWF0aC5taW4oMSwgaGVpZ2h0IC8gUklNX1JFRkVSRU5DRV9IRUlHSFQpIDogMDtcblx0XHRtb3VudC5jbGVhcigpO1xuXHRcdG1vdW50LnZhbHVlID0gbW91bnRSaW1MYXllcnMoc2xvdCwge1xuXHRcdFx0dGhlbWU6IG5leHRUaGVtZSxcblx0XHRcdG1vb2QsXG5cdFx0XHRodWU6IHJpbS5odWUsXG5cdFx0XHRzYXR1cmF0aW9uOiByaW0uc2F0dXJhdGlvbixcblx0XHRcdGxpZ2h0bmVzczogcmltLmxpZ2h0bmVzcyxcblx0XHRcdHN0cmVuZ3RoOiBBQ1RJVkVfUklNX1NUUkVOR1RILFxuXHRcdFx0ZHVyYXRpb246IFJJTV9EVVJBVElPTixcblx0XHRcdGF1ZGlvR2FpbjogMC44LFxuXHRcdFx0cGVha0dhaW46IDAuOTUsXG5cdFx0XHRzcGVlZEdhaW46IDAuOSxcblx0XHRcdHNpemU6IFJJTV9TSVpFX0ZMT09SICsgKDEgLSBSSU1fU0laRV9GTE9PUikgKiBwcm9wb3J0aW9uLFxuXHRcdH0pO1xuXHRcdG1vdW50LnZhbHVlLmRyaXZlU3RhdGljKGxldmVsKTtcblx0fTtcblx0cmVtb3VudChhY2NlbnQsIHRoZW1lKTtcblxuXHRyZXR1cm4ge1xuXHRcdGRyaXZlOiAoaW5wdXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0bGV2ZWwgPSBpbnB1dDtcblx0XHRcdG1vdW50LnZhbHVlPy5kcml2ZShpbnB1dCk7XG5cdFx0fSxcblx0XHRkcml2ZVN0YXRpYzogKGlucHV0OiBudW1iZXIpID0+IHtcblx0XHRcdGxldmVsID0gaW5wdXQ7XG5cdFx0XHRtb3VudC52YWx1ZT8uZHJpdmVTdGF0aWMoaW5wdXQpO1xuXHRcdH0sXG5cdFx0cmVmcmVzaDogcmVtb3VudCxcblx0XHRkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKCksXG5cdH07XG59XG5cbmNsYXNzIFZvaWNlR2xvd0NvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVZvaWNlR2xvd0NvbnRyb2xsZXIge1xuXG5cdC8qKiBUd28gYnVmZmVyZWQgb3ZlcmxheSBzbG90cywgc28gc3RhdGUgY2hhbmdlcyBjcm9zcy1mYWRlIGluc3RlYWQgb2Ygc25hcHBpbmcuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nsb3RzOiByZWFkb25seSBIVE1MRWxlbWVudFtdO1xuXHQvKiogT25lIG1vdW50IHBlciBzbG90LCBzbyBtb3VudGluZyBhIG5ldyBsYXllciB0ZWFycyB0aGUgb2xkIG9uZSBkb3duLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb3VudHMgPSBuZXcgTWFwPEhUTUxFbGVtZW50LCBNdXRhYmxlRGlzcG9zYWJsZTxJTW91bnRlZExheWVyPj4oKTtcblxuXHRwcml2YXRlIF9mcm9udDogSU1vdW50ZWRMYXllciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudFN0YXRlOiBWb2ljZUdsb3dTdGF0ZSB8ICdub25lJyA9ICdub25lJztcblx0cHJpdmF0ZSBfY3VycmVudE1vb2Q6IFJpbU1vb2QgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NsZWFyVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb2xvcnM6IElWb2ljZUdsb3dDb2xvcnM7XG5cdHByaXZhdGUgX3JlZHVjZWRNb3Rpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lS2luZDogKCkgPT4gR2xvd1RoZW1lS2luZCA9ICgpID0+ICdkYXJrJyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb2xvcnNQcm92aWRlcjogKCkgPT4gSVZvaWNlR2xvd0NvbG9ycyA9ICgpID0+IERFRkFVTFRfVk9JQ0VfR0xPV19DT0xPUlMsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29sb3JzID0gdGhpcy5fY29sb3JzUHJvdmlkZXIoKTtcblx0XHRfdGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gX3RhcmdldC5zdHlsZS5wb3NpdGlvbiB8fCAncmVsYXRpdmUnO1xuXG5cdFx0Y29uc3QgZG9jID0gX3RhcmdldC5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IGNyZWF0ZVNsb3QgPSAoKTogSFRNTEVsZW1lbnQgPT4ge1xuXHRcdFx0Y29uc3QgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRlbC5jbGFzc05hbWUgPSAndm9pY2UtZ2xvdy1zbG90Jztcblx0XHRcdC8vIEFib3ZlIHRoZSB0cmFuc2NyaXB0IG92ZXJsYXksIHdoaWNoIGlzIG9wYXF1ZSBhbmQgd291bGQgb3RoZXJ3aXNlXG5cdFx0XHQvLyBwYWludCBvdmVyIHRoZSB0b3Agb2YgdGhlIGJveCBhbmQgbGVhdmUgdGhlIGdsb3cgdmlzaWJsZSBvbmx5IGFsb25nXG5cdFx0XHQvLyB0aGUgYm90dG9tIHRvb2xiYXIgc3RyaXAuXG5cdFx0XHRlbC5zdHlsZS56SW5kZXggPSAnMTEnO1xuXHRcdFx0X3RhcmdldC5hcHBlbmRDaGlsZChlbCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gZWwucmVtb3ZlKCkpKTtcblx0XHRcdHRoaXMuX21vdW50cy5zZXQoZWwsIHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJTW91bnRlZExheWVyPigpKSk7XG5cdFx0XHRyZXR1cm4gZWw7XG5cdFx0fTtcblx0XHR0aGlzLl9zbG90cyA9IFtjcmVhdGVTbG90KCksIGNyZWF0ZVNsb3QoKV07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMuX2NsZWFyVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fY2xlYXJUaW1lcik7XG5cdFx0XHRcdHRoaXMuX2NsZWFyVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBIb3N0cyBjb21tb25seSByZWdpc3RlciB0aGUgY29udHJvbGxlciBiZWZvcmUgdGhlIHN0b3AtaG9vayB0aGF0IGNhbGxzXG5cdFx0Ly8gYGNsZWFyKClgLCBhbmQgYSBgRGlzcG9zYWJsZVN0b3JlYCBkaXNwb3NlcyBpbiBpbnNlcnRpb24gb3JkZXIgXHUyMDE0IHNvXG5cdFx0Ly8gYGNsZWFyKClgIGNhbiBydW4gYWZ0ZXIgdGhpcy4gRmxhZyBpdCB1cCBmcm9udCBzbyB0aGF0IGNhbGwgaXMgYSBuby1vcFxuXHRcdC8vIGFuZCBjYW4ndCBhcm0gYSB0ZWFyZG93biB0aW1lciBub3RoaW5nIHdpbGwgY2FuY2VsLlxuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZW5kZXIoc3RhdGU6IFZvaWNlR2xvd1N0YXRlLCBsZXZlbDogbnVtYmVyLCByZWR1Y2VkTW90aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vb2QgPSByZXNvbHZlTW9vZChzdGF0ZSk7XG5cdFx0dGhpcy5fcmVkdWNlZE1vdGlvbiA9IHJlZHVjZWRNb3Rpb247XG5cdFx0aWYgKCFtb29kKSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gS2V5ZWQgb24gdGhlIG1vb2QsIG5vdCB0aGUgc3RhdGUsIHNvIHN0YXRlcyB0aGF0IHNoYXJlIGEgbG9vayBuZXZlclxuXHRcdC8vIHJlLW1vdW50IG9yIGNyb3NzLWZhZGUgYmV0d2VlbiBlYWNoIG90aGVyLlxuXHRcdGlmIChtb29kICE9PSB0aGlzLl9jdXJyZW50TW9vZCkge1xuXHRcdFx0dGhpcy5fY3VycmVudE1vb2QgPSBtb29kO1xuXHRcdFx0aWYgKHRoaXMuX2NsZWFyVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fY2xlYXJUaW1lcik7XG5cdFx0XHRcdHRoaXMuX2NsZWFyVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaG93TGF5ZXIobW9vZCwgcmVkdWNlZE1vdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gU3RhdGUgY2xhc3NlcyBzdGlsbCB0cmFjayB0aGUgcmVhbCBzdGF0ZSwgc28gc3VyZmFjZSBDU1MgdGhhdCB0aW50cyB0aGVcblx0XHQvLyBtaWMgZ2x5cGggY2FuIHRlbGwgdGhlIHN0YXRlcyBhcGFydCBldmVuIHdoZW4gdGhleSBzaGFyZSBhIHJpbS5cblx0XHRpZiAoc3RhdGUgIT09IHRoaXMuX2N1cnJlbnRTdGF0ZSkge1xuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLl90YXJnZXQuY2xhc3NMaXN0LmFkZCgndm9pY2UtYWN0aXZlJyk7XG5cdFx0XHR0aGlzLl90YXJnZXQuY2xhc3NMaXN0LnRvZ2dsZSgndm9pY2UtbGlzdGVuaW5nJywgc3RhdGUgPT09ICdsaXN0ZW5pbmcnKTtcblx0XHRcdHRoaXMuX3RhcmdldC5jbGFzc0xpc3QudG9nZ2xlKCd2b2ljZS1wcm9jZXNzaW5nJywgc3RhdGUgPT09ICdwcm9jZXNzaW5nJyk7XG5cdFx0XHR0aGlzLl90YXJnZXQuY2xhc3NMaXN0LnRvZ2dsZSgndm9pY2Utc3BlYWtpbmcnLCBzdGF0ZSA9PT0gJ3NwZWFraW5nJyk7XG5cdFx0XHR0aGlzLl90YXJnZXQuc3R5bGUuc2V0UHJvcGVydHkoJy0tdm9pY2UtYWNjZW50Jywgdm9pY2VHbG93U3RhdGVDb2xvcihzdGF0ZSwgdGhpcy5fY29sb3JzKS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZnJvbnQgJiYgIXJlZHVjZWRNb3Rpb24pIHtcblx0XHRcdHRoaXMuX2Zyb250LmRyaXZlKGxldmVsKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQgfHwgdGhpcy5fY3VycmVudFN0YXRlID09PSAnbm9uZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudFN0YXRlID0gJ25vbmUnO1xuXHRcdHRoaXMuX2N1cnJlbnRNb29kID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RhcmdldC5jbGFzc0xpc3QucmVtb3ZlKCd2b2ljZS1hY3RpdmUnLCAndm9pY2UtbGlzdGVuaW5nJywgJ3ZvaWNlLXByb2Nlc3NpbmcnLCAndm9pY2Utc3BlYWtpbmcnKTtcblx0XHR0aGlzLl90YXJnZXQuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdm9pY2UtYWNjZW50Jyk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9mcm9udDtcblx0XHR0aGlzLl9mcm9udCA9IHVuZGVmaW5lZDtcblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHRoaXMuX2ZhZGVPdXQocHJldmlvdXMuaG9zdCk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVRlYXJkb3duKHByZXZpb3VzLmhvc3QpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUZWFyIGEgc2xvdCdzIG1vdW50IGRvd24gb25jZSBpdCBoYXMgZmFkZWQgb3V0IHNvIGl0IHN0b3BzIGRyaXZpbmcgQ1NTXG5cdCAqIHZhcmlhYmxlcy4gR3VhcmRlZCBvbiByZS1lbnRyeTogaWYgdGhlIHNsb3QgaGFzIHNpbmNlIGJlZW4gcmV1c2VkIGFzIHRoZVxuXHQgKiBmcm9udCBsYXllciwgdGhlIG5ldyBtb3VudCBtdXN0IHN1cnZpdmUuXG5cdCAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZVRlYXJkb3duKGhvc3Q6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NsZWFyVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NsZWFyVGltZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9jbGVhclRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jbGVhclRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX2Zyb250Py5ob3N0ICE9PSBob3N0KSB7XG5cdFx0XHRcdHRoaXMuX21vdW50cy5nZXQoaG9zdCk/LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSwgRkFERV9PVVRfTVMpO1xuXHR9XG5cblx0cmVmcmVzaFRoZW1lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb2xvcnMgPSB0aGlzLl9jb2xvcnNQcm92aWRlcigpO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fY3VycmVudFN0YXRlO1xuXHRcdGlmICh0aGlzLl9mcm9udCAmJiBzdGF0ZSAhPT0gJ25vbmUnKSB7XG5cdFx0XHQvLyBSZS1tb3VudCB0aGUgY3VycmVudCBsYXllciBzbyBpdCBwaWNrcyB1cCB0aGUgbmV3IGFjY2VudCAvIHRoZW1lLlxuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRlID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fY3VycmVudE1vb2QgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlbmRlcihzdGF0ZSwgMC4zLCB0aGlzLl9yZWR1Y2VkTW90aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93TGF5ZXIobW9vZDogUmltTW9vZCwgcmVkdWNlZE1vdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGhvc3QgPSB0aGlzLl9zbG90cy5maW5kKHNsb3QgPT4gc2xvdCAhPT0gdGhpcy5fZnJvbnQ/Lmhvc3QpID8/IHRoaXMuX3Nsb3RzWzBdO1xuXG5cdFx0Ly8gRGlzcG9zZSBhbnkgcHJpb3IgbW91bnQgb24gdGhpcyBzbG90IEZJUlNUOiBtb3VudHMgb3duIHRoZSBzbG90J3MgY2xhc3Nlc1xuXHRcdC8vIGFuZCBjdXN0b20gcHJvcGVydGllcywgc28gZGlzcG9zaW5nIGFmdGVyIG1vdW50aW5nIHRoZSBuZXcgbGF5ZXIgd291bGRcblx0XHQvLyBzdHJpcCB0aGUgZnJlc2ggb25lcy5cblx0XHR0aGlzLl9tb3VudHMuZ2V0KGhvc3QpIS5jbGVhcigpO1xuXHRcdGNvbnN0IG1vdW50ZWQgPSB0aGlzLl9tb3VudChob3N0LCBtb29kKTtcblx0XHR0aGlzLl9tb3VudHMuZ2V0KGhvc3QpIS52YWx1ZSA9IG1vdW50ZWQ7XG5cdFx0aWYgKHJlZHVjZWRNb3Rpb24pIHtcblx0XHRcdG1vdW50ZWQuZHJpdmVTdGF0aWMoMC40KTtcblx0XHR9XG5cblx0XHQvLyBVbmRlciByZWR1Y2VkIG1vdGlvbiB0aGUgbGF5ZXJzIHN3YXAgb3V0cmlnaHQ6IGEgNjAwbXMgY3Jvc3MtZmFkZSBpc1xuXHRcdC8vIHN0aWxsIG1vdGlvbiwgYW5kIHRoZSBmaXh0dXJlcyByZWx5IG9uIHRoZSBmcmFtZSBiZWluZyBzZXR0bGVkLlxuXHRcdGNvbnN0IGZhZGUgPSByZWR1Y2VkTW90aW9uID8gJ25vbmUnIDogRkFERTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2Zyb250O1xuXHRcdGhvc3Quc3R5bGUudHJhbnNpdGlvbiA9ICdub25lJztcblx0XHRob3N0LnN0eWxlLm9wYWNpdHkgPSAnMCc7XG5cdFx0dm9pZCBob3N0Lm9mZnNldFdpZHRoOyAvLyBjb21taXQgdGhlIHN0YXJ0IHBvc2UgYmVmb3JlIHRyYW5zaXRpb25pbmcgZnJvbSBpdFxuXHRcdGhvc3Quc3R5bGUudHJhbnNpdGlvbiA9IGZhZGU7XG5cdFx0aG9zdC5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuXHRcdGlmIChwcmV2aW91cyAmJiBwcmV2aW91cy5ob3N0ICE9PSBob3N0KSB7XG5cdFx0XHR0aGlzLl9mYWRlT3V0KHByZXZpb3VzLmhvc3QsIGZhZGUpO1xuXHRcdFx0Ly8gU3RvcCB0aGUgb3V0Z29pbmcgbGF5ZXIgZHJpdmluZyBDU1MgdmFycyBvbmNlIGl0IGlzIG91dCBvZiBzaWdodC5cblx0XHRcdHRoaXMuX3NjaGVkdWxlVGVhcmRvd24ocHJldmlvdXMuaG9zdCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Zyb250ID0gbW91bnRlZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZhZGVPdXQoaG9zdDogSFRNTEVsZW1lbnQsIGZhZGU6IHN0cmluZyA9IEZBREUpOiB2b2lkIHtcblx0XHRob3N0LnN0eWxlLnRyYW5zaXRpb24gPSBmYWRlO1xuXHRcdGhvc3Quc3R5bGUub3BhY2l0eSA9ICcwJztcblx0fVxuXG5cdHByaXZhdGUgX21vdW50KGhvc3Q6IEhUTUxFbGVtZW50LCBtb29kOiBSaW1Nb29kKTogSU1vdW50ZWRMYXllciB7XG5cdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZUtpbmQoKTtcblx0XHRjb25zdCBhY2NlbnQgPSByZXNvbHZlVm9pY2VSaW1BY2NlbnQobW9vZCA9PT0gJ3dhcm0nID8gdGhpcy5fY29sb3JzLnNwZWFraW5nIDogdGhpcy5fY29sb3JzLmxpc3RlbmluZywgbW9vZCwgdGhlbWUpO1xuXHRcdHJldHVybiBtb3VudFJpbUxheWVycyhob3N0LCB7XG5cdFx0XHR0aGVtZSxcblx0XHRcdG1vb2QsXG5cdFx0XHRodWU6IGFjY2VudC5odWUsXG5cdFx0XHRzYXR1cmF0aW9uOiBhY2NlbnQuc2F0dXJhdGlvbixcblx0XHRcdGxpZ2h0bmVzczogYWNjZW50LmxpZ2h0bmVzcyxcblx0XHRcdHN0cmVuZ3RoOiBBQ1RJVkVfUklNX1NUUkVOR1RILFxuXHRcdFx0ZHVyYXRpb246IFJJTV9EVVJBVElPTixcblx0XHRcdGF1ZGlvR2FpbjogMC44LFxuXHRcdFx0Ly8gTGV0cyB0aGUgbG91ZGVzdCBtb21lbnRzIHJlYWQgdmlzaWJseSBkZW5zZXIgcmF0aGVyIHRoYW4gbGVhdmluZyB0aGVcblx0XHRcdC8vIHdob2xlIHJhbmdlIGluIGEgbmFycm93IGJhbmQuXG5cdFx0XHRwZWFrR2FpbjogMC45NSxcblx0XHRcdHNwZWVkR2FpbjogMC45LFxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogTWFwIGEgdm9pY2Ugc3RhdGUgdG8gdGhlIHJpbSBtb29kIHRoYXQgcmVuZGVycyBpdCwgb3IgYHVuZGVmaW5lZGAgZm9yIG5vIGdsb3cuXG4gKiBPbmx5IHRoZSB0YWxraW5nIHN0YXRlcyBnbG93OiB0aGlua2luZyBhbmQgY29ubmVjdGVkLWlkbGUgcmVuZGVyIG5vdGhpbmcsIHNvXG4gKiB0aGUgbGlnaHQgbWVhbnMgXCJzb21lb25lIGlzIHRhbGtpbmdcIiByYXRoZXIgdGhhbiBcInZvaWNlIGlzIG9uXCIuXG4gKi9cbmZ1bmN0aW9uIHJlc29sdmVNb29kKHN0YXRlOiBWb2ljZUdsb3dTdGF0ZSk6IFJpbU1vb2QgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSAnbGlzdGVuaW5nJzogcmV0dXJuICdjb29sJztcblx0XHRjYXNlICdzcGVha2luZyc6IHJldHVybiAnd2FybSc7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTztBQUVQLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLDJCQUE0RCx1QkFBdUIsMkJBQXlEO0FBdUJySixNQUFNLE9BQU87QUFFYixNQUFNLGNBQWM7QUFHcEIsTUFBTSxzQkFBc0I7QUFHNUIsTUFBTSxvQkFBb0I7QUFBQSxFQUN6QixNQUFNLEVBQUUsTUFBTSxHQUFHLE9BQU8sTUFBTSxPQUFPLEtBQUs7QUFBQSxFQUMxQyxPQUFPLEVBQUUsTUFBTSxHQUFHLE9BQU8sS0FBSyxPQUFPLElBQUk7QUFDMUM7QUFHQSxNQUFNLGVBQWU7QUEyQ3JCLFNBQVMsZ0JBQWdCLE9BQXNCLFVBQWtCO0FBQ2hFLFFBQU0sT0FBTyxVQUFVO0FBQ3ZCLFFBQU0sUUFBUSxXQUFXO0FBQ3pCLFNBQU87QUFBQTtBQUFBLElBRU4sUUFBUTtBQUFBO0FBQUEsSUFFUixPQUFPLE9BQU8sS0FBSztBQUFBO0FBQUEsSUFFbkIsY0FBYyxPQUFPLE9BQU87QUFBQTtBQUFBLElBRTVCLGFBQWEsT0FBTyxPQUFPO0FBQUE7QUFBQSxJQUUzQixnQkFBZ0IsT0FBTyxNQUFNLE9BQU87QUFBQTtBQUFBLElBRXBDLGFBQWEsT0FBTyxNQUFNLE9BQU87QUFBQTtBQUFBLElBRWpD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
