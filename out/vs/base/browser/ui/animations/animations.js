import { ThemeIcon } from "../../../common/themables.js";
import * as dom from "../../dom.js";
var ClickAnimation = /* @__PURE__ */ ((ClickAnimation2) => {
  ClickAnimation2[ClickAnimation2["Confetti"] = 1] = "Confetti";
  ClickAnimation2[ClickAnimation2["FloatingIcons"] = 2] = "FloatingIcons";
  ClickAnimation2[ClickAnimation2["PulseWave"] = 3] = "PulseWave";
  ClickAnimation2[ClickAnimation2["RadiantLines"] = 4] = "RadiantLines";
  return ClickAnimation2;
})(ClickAnimation || {});
const confettiColors = [
  "#007acc",
  "#005a9e",
  "#0098ff",
  "#4fc3f7",
  "#64b5f6",
  "#42a5f5"
];
let activeOverlay;
function createOverlay(element) {
  if (activeOverlay) {
    return void 0;
  }
  const rect = element.getBoundingClientRect();
  const ownerDocument = dom.getWindow(element).document;
  const overlay = dom.$(".animation-overlay");
  overlay.style.position = "fixed";
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.pointerEvents = "none";
  overlay.style.overflow = "visible";
  overlay.style.zIndex = "10000";
  ownerDocument.body.appendChild(overlay);
  activeOverlay = overlay;
  return { overlay, cx: rect.width / 2, cy: rect.height / 2 };
}
function cleanupOverlay(duration) {
  setTimeout(() => {
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = void 0;
    }
  }, duration);
}
function bounceElement(element, opts) {
  const frames = [];
  const steps = Math.max(opts.scale?.length ?? 0, opts.rotate?.length ?? 0, opts.translateY?.length ?? 0);
  if (steps === 0) {
    return;
  }
  for (let i = 0; i < steps; i++) {
    const frame = { offset: steps === 1 ? 1 : i / (steps - 1) };
    let transformParts = "";
    const scale = opts.scale?.[i];
    if (scale !== void 0) {
      transformParts += `scale(${scale})`;
    }
    const rotate = opts.rotate?.[i];
    if (rotate !== void 0) {
      transformParts += ` rotate(${rotate}deg)`;
    }
    const translateY = opts.translateY?.[i];
    if (translateY !== void 0) {
      transformParts += ` translateY(${translateY}px)`;
    }
    if (transformParts) {
      frame.transform = transformParts.trim();
    }
    frames.push(frame);
  }
  element.animate(frames, {
    duration: opts.duration ?? 350,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
}
function triggerConfettiAnimation(element) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  const rect = element.getBoundingClientRect();
  bounceElement(element, {
    scale: [1, 1.3, 1],
    rotate: [0, -10, 10, 0],
    duration: 350
  });
  const particleCount = 10;
  for (let i = 0; i < particleCount; i++) {
    const size = 3 + i % 3 * 1.5;
    const angle = i * 36 * Math.PI / 180;
    const distance = 35;
    const particleOpacity = 0.6 + i % 4 * 0.1;
    const part = dom.$(".animation-particle");
    part.style.position = "absolute";
    part.style.width = `${size}px`;
    part.style.height = `${size}px`;
    part.style.borderRadius = "50%";
    part.style.backgroundColor = confettiColors[i % confettiColors.length];
    part.style.left = `${cx - size / 2}px`;
    part.style.top = `${cy - size / 2}px`;
    overlay.appendChild(part);
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    part.animate([
      { opacity: 0, transform: "scale(0) translate(0, 0)" },
      { opacity: particleOpacity, transform: `scale(1) translate(${tx * 0.5}px, ${ty * 0.5}px)`, offset: 0.3 },
      { opacity: particleOpacity, transform: `scale(1) translate(${tx}px, ${ty}px)`, offset: 0.7 },
      { opacity: 0, transform: `scale(0) translate(${tx}px, ${ty}px)` }
    ], {
      duration: 1100,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  const ring = dom.$(".animation-particle");
  ring.style.position = "absolute";
  ring.style.left = "0";
  ring.style.top = "0";
  ring.style.width = `${rect.width}px`;
  ring.style.height = `${rect.height}px`;
  ring.style.borderRadius = "50%";
  ring.style.border = "2px solid var(--vscode-focusBorder, #007acc)";
  ring.style.boxSizing = "border-box";
  overlay.appendChild(ring);
  ring.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(2)", opacity: 0 }
  ], {
    duration: 800,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
  cleanupOverlay(2e3);
}
function triggerFloatingIconsAnimation(element, icon) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  const rect = element.getBoundingClientRect();
  bounceElement(element, {
    translateY: [0, -6, 0],
    duration: 350
  });
  const iconCount = 6;
  for (let i = 0; i < iconCount; i++) {
    const size = 12 + i % 3 * 2;
    const iconEl = dom.$(".animation-particle");
    iconEl.style.position = "absolute";
    iconEl.style.left = `${cx}px`;
    iconEl.style.top = `${cy}px`;
    iconEl.style.fontSize = `${size}px`;
    iconEl.style.lineHeight = "1";
    iconEl.style.color = "var(--vscode-focusBorder, #007acc)";
    iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
    overlay.appendChild(iconEl);
    const driftX = (Math.random() - 0.5) * 50;
    const floatY = -50 - i % 3 * 10;
    const rotate1 = (Math.random() - 0.5) * 20;
    const rotate2 = (Math.random() - 0.5) * 40;
    iconEl.animate([
      { opacity: 0, transform: `translate(-50%, -50%) scale(0) rotate(${rotate1}deg)` },
      { opacity: 1, transform: `translate(calc(-50% + ${driftX * 0.3}px), calc(-50% + ${floatY * 0.3}px)) scale(1) rotate(${(rotate1 + rotate2) * 0.3}deg)`, offset: 0.3 },
      { opacity: 1, transform: `translate(calc(-50% + ${driftX * 0.7}px), calc(-50% + ${floatY * 0.7}px)) scale(1) rotate(${(rotate1 + rotate2) * 0.7}deg)`, offset: 0.7 },
      { opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${floatY}px)) scale(0.8) rotate(${rotate2}deg)` }
    ], {
      duration: 800 + i % 3 * 200,
      delay: i * 80,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  const ring = dom.$(".animation-particle");
  ring.style.position = "absolute";
  ring.style.left = "0";
  ring.style.top = "0";
  ring.style.width = `${rect.width}px`;
  ring.style.height = `${rect.height}px`;
  ring.style.borderRadius = "50%";
  ring.style.border = "2px solid var(--vscode-focusBorder, #007acc)";
  ring.style.boxSizing = "border-box";
  overlay.appendChild(ring);
  ring.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(2)", opacity: 0 }
  ], {
    duration: 500,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
  cleanupOverlay(2e3);
}
function triggerPulseWaveAnimation(element) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  const rect = element.getBoundingClientRect();
  bounceElement(element, {
    scale: [1, 1.1, 1],
    rotate: [0, -12, 0],
    duration: 400
  });
  for (let i = 0; i < 2; i++) {
    const ring = dom.$(".animation-particle");
    ring.style.position = "absolute";
    ring.style.left = "0";
    ring.style.top = "0";
    ring.style.width = `${rect.width}px`;
    ring.style.height = `${rect.height}px`;
    ring.style.borderRadius = "50%";
    ring.style.border = "2px solid var(--vscode-focusBorder, #007acc)";
    ring.style.boxSizing = "border-box";
    overlay.appendChild(ring);
    ring.animate([
      { transform: "scale(0.8)", opacity: 0 },
      { transform: "scale(0.8)", opacity: 0.6, offset: 0.01 },
      { transform: "scale(2.5)", opacity: 0 }
    ], {
      duration: 800,
      delay: i * 150,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * 60 * Math.PI / 180;
    const distance = 30 + i % 2 * 10;
    const size = 3.5;
    const dot = dom.$(".animation-particle");
    dot.style.position = "absolute";
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = "50%";
    dot.style.backgroundColor = "#0098ff";
    dot.style.left = `${cx - size / 2}px`;
    dot.style.top = `${cy - size / 2}px`;
    overlay.appendChild(dot);
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    dot.animate([
      { opacity: 0, transform: "scale(0) translate(0, 0)" },
      { opacity: 1, transform: `scale(1) translate(${tx}px, ${ty}px)`, offset: 0.5 },
      { opacity: 0, transform: `scale(0) translate(${tx}px, ${ty}px)` }
    ], {
      duration: 600,
      delay: 100 + i * 50,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  const glow = dom.$(".animation-particle");
  glow.style.position = "absolute";
  glow.style.left = "0";
  glow.style.top = "0";
  glow.style.width = `${rect.width}px`;
  glow.style.height = `${rect.height}px`;
  glow.style.borderRadius = "50%";
  glow.style.backgroundColor = "var(--vscode-focusBorder, #007acc)";
  overlay.appendChild(glow);
  glow.animate([
    { transform: "scale(0.9)", opacity: 0 },
    { transform: "scale(0.9)", opacity: 0.5, offset: 0.01 },
    { transform: "scale(1.5)", opacity: 0 }
  ], {
    duration: 500,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
  cleanupOverlay(2e3);
}
function triggerRadiantLinesAnimation(element) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  bounceElement(element, {
    scale: [1, 1.15, 1],
    duration: 350
  });
  for (let i = 0; i < 8; i++) {
    const size = 3;
    const dotOpacity = 0.7;
    const angle = (i * 45 + 22.5) * Math.PI / 180;
    const startDistance = 14;
    const endDistance = 30;
    const dot = dom.$(".animation-particle");
    dot.style.position = "absolute";
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = "50%";
    dot.style.backgroundColor = "var(--vscode-editor-foreground, #ffffff)";
    dot.style.left = `${cx - size / 2}px`;
    dot.style.top = `${cy - size / 2}px`;
    overlay.appendChild(dot);
    const startX = Math.cos(angle) * startDistance;
    const startY = Math.sin(angle) * startDistance;
    const endX = Math.cos(angle) * endDistance;
    const endY = Math.sin(angle) * endDistance;
    dot.animate([
      { opacity: 0, transform: `scale(0) translate(${startX}px, ${startY}px)` },
      { opacity: dotOpacity, transform: `scale(1.2) translate(${(startX + endX) / 2}px, ${(startY + endY) / 2}px)`, offset: 0.25 },
      { opacity: dotOpacity, transform: `scale(1) translate(${endX * 0.8}px, ${endY * 0.8}px)`, offset: 0.5 },
      { opacity: dotOpacity * 0.5, transform: `scale(1) translate(${endX}px, ${endY}px)`, offset: 0.75 },
      { opacity: 0, transform: `scale(0.5) translate(${endX}px, ${endY}px)` }
    ], {
      duration: 1100,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;
    const lineWrapper = dom.$(".animation-particle");
    lineWrapper.style.position = "absolute";
    lineWrapper.style.left = `${cx}px`;
    lineWrapper.style.top = `${cy}px`;
    lineWrapper.style.width = "0";
    lineWrapper.style.height = "0";
    lineWrapper.style.transform = `rotate(${angleDeg}deg)`;
    overlay.appendChild(lineWrapper);
    const line = dom.$(".animation-particle");
    line.style.position = "absolute";
    line.style.width = "2px";
    line.style.height = "10px";
    line.style.backgroundColor = "var(--vscode-focusBorder, #007acc)";
    line.style.left = "-1px";
    line.style.top = "-22px";
    line.style.transformOrigin = "bottom center";
    lineWrapper.appendChild(line);
    line.animate([
      { transform: "scale(1, 0)", opacity: 0.6 },
      { transform: "scale(1, 1)", opacity: 0.6, offset: 0.2 },
      { transform: "scale(1, 1)", opacity: 0.6, offset: 0.6 },
      { transform: "scale(1, 1)", opacity: 0.6, offset: 0.8 },
      { transform: "scale(0, 0.3)", opacity: 0 }
    ], {
      duration: 1200,
      delay: 150,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  cleanupOverlay(2e3);
}
function triggerClickAnimation(element, animation, icon) {
  switch (animation) {
    case 1 /* Confetti */:
      triggerConfettiAnimation(element);
      break;
    case 2 /* FloatingIcons */:
      if (icon) {
        triggerFloatingIconsAnimation(element, icon);
      }
      break;
    case 3 /* PulseWave */:
      triggerPulseWaveAnimation(element);
      break;
    case 4 /* RadiantLines */:
      triggerRadiantLinesAnimation(element);
      break;
  }
}
export {
  ClickAnimation,
  bounceElement,
  triggerClickAnimation,
  triggerConfettiAnimation,
  triggerFloatingIconsAnimation,
  triggerPulseWaveAnimation,
  triggerRadiantLinesAnimation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9hbmltYXRpb25zL2FuaW1hdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi9kb20uanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBDbGlja0FuaW1hdGlvbiB7XG5cdENvbmZldHRpID0gMSxcblx0RmxvYXRpbmdJY29ucyA9IDIsXG5cdFB1bHNlV2F2ZSA9IDMsXG5cdFJhZGlhbnRMaW5lcyA9IDQsXG59XG5cbmNvbnN0IGNvbmZldHRpQ29sb3JzID0gW1xuXHQnIzAwN2FjYycsXG5cdCcjMDA1YTllJyxcblx0JyMwMDk4ZmYnLFxuXHQnIzRmYzNmNycsXG5cdCcjNjRiNWY2Jyxcblx0JyM0MmE1ZjUnLFxuXTtcblxubGV0IGFjdGl2ZU92ZXJsYXk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBmaXhlZC1wb3NpdGlvbmVkIG92ZXJsYXkgY2VudGVyZWQgb24gdGhlIGdpdmVuIGVsZW1lbnQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU92ZXJsYXkoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB7IG92ZXJsYXk6IEhUTUxFbGVtZW50OyBjeDogbnVtYmVyOyBjeTogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoYWN0aXZlT3ZlcmxheSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0Y29uc3Qgb3duZXJEb2N1bWVudCA9IGRvbS5nZXRXaW5kb3coZWxlbWVudCkuZG9jdW1lbnQ7XG5cblx0Y29uc3Qgb3ZlcmxheSA9IGRvbS4kKCcuYW5pbWF0aW9uLW92ZXJsYXknKTtcblx0b3ZlcmxheS5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XG5cdG92ZXJsYXkuc3R5bGUubGVmdCA9IGAke3JlY3QubGVmdH1weGA7XG5cdG92ZXJsYXkuc3R5bGUudG9wID0gYCR7cmVjdC50b3B9cHhgO1xuXHRvdmVybGF5LnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG5cdG92ZXJsYXkuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRvdmVybGF5LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG5cdG92ZXJsYXkuc3R5bGUub3ZlcmZsb3cgPSAndmlzaWJsZSc7XG5cdG92ZXJsYXkuc3R5bGUuekluZGV4ID0gJzEwMDAwJztcblxuXHRvd25lckRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cdGFjdGl2ZU92ZXJsYXkgPSBvdmVybGF5O1xuXG5cdHJldHVybiB7IG92ZXJsYXksIGN4OiByZWN0LndpZHRoIC8gMiwgY3k6IHJlY3QuaGVpZ2h0IC8gMiB9O1xufVxuXG4vKipcbiAqIENsZWFucyB1cCB0aGUgb3ZlcmxheSBhZnRlciBzcGVjaWZpZWQgcGVyaW9kLlxuICovXG5mdW5jdGlvbiBjbGVhbnVwT3ZlcmxheShkdXJhdGlvbjogbnVtYmVyKSB7XG5cdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdGlmIChhY3RpdmVPdmVybGF5KSB7XG5cdFx0XHRhY3RpdmVPdmVybGF5LnJlbW92ZSgpO1xuXHRcdFx0YWN0aXZlT3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0sIGR1cmF0aW9uKTtcbn1cblxuLyoqXG4gKiBCb3VuY2UgdGhlIGVsZW1lbnQgd2l0aCBhIGdpdmVuIHNjYWxlIGFuZCBvcHRpb25hbCByb3RhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJvdW5jZUVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdHM6IHsgc2NhbGU/OiBudW1iZXJbXTsgcm90YXRlPzogbnVtYmVyW107IHRyYW5zbGF0ZVk/OiBudW1iZXJbXTsgZHVyYXRpb24/OiBudW1iZXIgfSkge1xuXHRjb25zdCBmcmFtZXM6IEtleWZyYW1lW10gPSBbXTtcblxuXHRjb25zdCBzdGVwcyA9IE1hdGgubWF4KG9wdHMuc2NhbGU/Lmxlbmd0aCA/PyAwLCBvcHRzLnJvdGF0ZT8ubGVuZ3RoID8/IDAsIG9wdHMudHJhbnNsYXRlWT8ubGVuZ3RoID8/IDApO1xuXHRpZiAoc3RlcHMgPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHN0ZXBzOyBpKyspIHtcblx0XHRjb25zdCBmcmFtZTogS2V5ZnJhbWUgPSB7IG9mZnNldDogc3RlcHMgPT09IDEgPyAxIDogaSAvIChzdGVwcyAtIDEpIH07XG5cdFx0bGV0IHRyYW5zZm9ybVBhcnRzID0gJyc7XG5cblx0XHRjb25zdCBzY2FsZSA9IG9wdHMuc2NhbGU/LltpXTtcblx0XHRpZiAoc2NhbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJhbnNmb3JtUGFydHMgKz0gYHNjYWxlKCR7c2NhbGV9KWA7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgcm90YXRlID0gb3B0cy5yb3RhdGU/LltpXTtcblx0XHRpZiAocm90YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyYW5zZm9ybVBhcnRzICs9IGAgcm90YXRlKCR7cm90YXRlfWRlZylgO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyYW5zbGF0ZVkgPSBvcHRzLnRyYW5zbGF0ZVk/LltpXTtcblx0XHRpZiAodHJhbnNsYXRlWSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cmFuc2Zvcm1QYXJ0cyArPSBgIHRyYW5zbGF0ZVkoJHt0cmFuc2xhdGVZfXB4KWA7XG5cdFx0fVxuXG5cdFx0aWYgKHRyYW5zZm9ybVBhcnRzKSB7XG5cdFx0XHRmcmFtZS50cmFuc2Zvcm0gPSB0cmFuc2Zvcm1QYXJ0cy50cmltKCk7XG5cdFx0fVxuXHRcdGZyYW1lcy5wdXNoKGZyYW1lKTtcblx0fVxuXG5cdGVsZW1lbnQuYW5pbWF0ZShmcmFtZXMsIHtcblx0XHRkdXJhdGlvbjogb3B0cy5kdXJhdGlvbiA/PyAzNTAsXG5cdFx0ZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKScsXG5cdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0fSk7XG59XG5cbi8qKlxuICogQ29uZmV0dGk6IHNtYWxsIHBhcnRpY2xlcyBidXJzdCBvdXR3YXJkIGluIGEgY2lyY2xlIGZyb20gdGhlIGVsZW1lbnQgY2VudGVyLFxuICogd2l0aCBhbiBleHBhbmRpbmcgcmluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJDb25mZXR0aUFuaW1hdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRjb25zdCByZXN1bHQgPSBjcmVhdGVPdmVybGF5KGVsZW1lbnQpO1xuXHRpZiAoIXJlc3VsdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHsgb3ZlcmxheSwgY3gsIGN5IH0gPSByZXN1bHQ7XG5cdGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdC8vIEVsZW1lbnQgYm91bmNlXG5cdGJvdW5jZUVsZW1lbnQoZWxlbWVudCwge1xuXHRcdHNjYWxlOiBbMSwgMS4zLCAxXSxcblx0XHRyb3RhdGU6IFswLCAtMTAsIDEwLCAwXSxcblx0XHRkdXJhdGlvbjogMzUwLFxuXHR9KTtcblxuXHQvLyBDb25mZXR0aSBwYXJ0aWNsZXNcblx0Y29uc3QgcGFydGljbGVDb3VudCA9IDEwO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRpY2xlQ291bnQ7IGkrKykge1xuXHRcdGNvbnN0IHNpemUgPSAzICsgKGkgJSAzKSAqIDEuNTtcblx0XHRjb25zdCBhbmdsZSA9IChpICogMzYgKiBNYXRoLlBJKSAvIDE4MDtcblx0XHRjb25zdCBkaXN0YW5jZSA9IDM1O1xuXHRcdGNvbnN0IHBhcnRpY2xlT3BhY2l0eSA9IDAuNiArIChpICUgNCkgKiAwLjE7XG5cblx0XHRjb25zdCBwYXJ0ID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0XHRwYXJ0LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRwYXJ0LnN0eWxlLndpZHRoID0gYCR7c2l6ZX1weGA7XG5cdFx0cGFydC5zdHlsZS5oZWlnaHQgPSBgJHtzaXplfXB4YDtcblx0XHRwYXJ0LnN0eWxlLmJvcmRlclJhZGl1cyA9ICc1MCUnO1xuXHRcdHBhcnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gY29uZmV0dGlDb2xvcnNbaSAlIGNvbmZldHRpQ29sb3JzLmxlbmd0aF07XG5cdFx0cGFydC5zdHlsZS5sZWZ0ID0gYCR7Y3ggLSBzaXplIC8gMn1weGA7XG5cdFx0cGFydC5zdHlsZS50b3AgPSBgJHtjeSAtIHNpemUgLyAyfXB4YDtcblx0XHRvdmVybGF5LmFwcGVuZENoaWxkKHBhcnQpO1xuXG5cdFx0Y29uc3QgdHggPSBNYXRoLmNvcyhhbmdsZSkgKiBkaXN0YW5jZTtcblx0XHRjb25zdCB0eSA9IE1hdGguc2luKGFuZ2xlKSAqIGRpc3RhbmNlO1xuXG5cdFx0cGFydC5hbmltYXRlKFtcblx0XHRcdHsgb3BhY2l0eTogMCwgdHJhbnNmb3JtOiAnc2NhbGUoMCkgdHJhbnNsYXRlKDAsIDApJyB9LFxuXHRcdFx0eyBvcGFjaXR5OiBwYXJ0aWNsZU9wYWNpdHksIHRyYW5zZm9ybTogYHNjYWxlKDEpIHRyYW5zbGF0ZSgke3R4ICogMC41fXB4LCAke3R5ICogMC41fXB4KWAsIG9mZnNldDogMC4zIH0sXG5cdFx0XHR7IG9wYWNpdHk6IHBhcnRpY2xlT3BhY2l0eSwgdHJhbnNmb3JtOiBgc2NhbGUoMSkgdHJhbnNsYXRlKCR7dHh9cHgsICR7dHl9cHgpYCwgb2Zmc2V0OiAwLjcgfSxcblx0XHRcdHsgb3BhY2l0eTogMCwgdHJhbnNmb3JtOiBgc2NhbGUoMCkgdHJhbnNsYXRlKCR7dHh9cHgsICR7dHl9cHgpYCB9LFxuXHRcdF0sIHtcblx0XHRcdGR1cmF0aW9uOiAxMTAwLFxuXHRcdFx0ZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKScsXG5cdFx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gRXhwYW5kaW5nIHJpbmdcblx0Y29uc3QgcmluZyA9IGRvbS4kKCcuYW5pbWF0aW9uLXBhcnRpY2xlJyk7XG5cdHJpbmcuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRyaW5nLnN0eWxlLmxlZnQgPSAnMCc7XG5cdHJpbmcuc3R5bGUudG9wID0gJzAnO1xuXHRyaW5nLnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG5cdHJpbmcuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRyaW5nLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc1MCUnO1xuXHRyaW5nLnN0eWxlLmJvcmRlciA9ICcycHggc29saWQgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3YWNjKSc7XG5cdHJpbmcuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xuXHRvdmVybGF5LmFwcGVuZENoaWxkKHJpbmcpO1xuXG5cdHJpbmcuYW5pbWF0ZShbXG5cdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgxKScsIG9wYWNpdHk6IDEgfSxcblx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDIpJywgb3BhY2l0eTogMCB9LFxuXHRdLCB7XG5cdFx0ZHVyYXRpb246IDgwMCxcblx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHR9KTtcblxuXHRjbGVhbnVwT3ZlcmxheSgyMDAwKTtcbn1cblxuLyoqXG4gKiBGbG9hdGluZyBJY29uczogc21hbGwgaWNvbnMgZmxvYXQgdXB3YXJkIGZyb20gdGhlIGVsZW1lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRmxvYXRpbmdJY29uc0FuaW1hdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgaWNvbjogVGhlbWVJY29uKSB7XG5cdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZU92ZXJsYXkoZWxlbWVudCk7XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgeyBvdmVybGF5LCBjeCwgY3kgfSA9IHJlc3VsdDtcblx0Y29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cblx0Ly8gRWxlbWVudCBib3VuY2UgdXB3YXJkXG5cdGJvdW5jZUVsZW1lbnQoZWxlbWVudCwge1xuXHRcdHRyYW5zbGF0ZVk6IFswLCAtNiwgMF0sXG5cdFx0ZHVyYXRpb246IDM1MCxcblx0fSk7XG5cblx0Ly8gRmxvYXRpbmcgaWNvbnNcblx0Y29uc3QgaWNvbkNvdW50ID0gNjtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpY29uQ291bnQ7IGkrKykge1xuXHRcdGNvbnN0IHNpemUgPSAxMiArIChpICUgMykgKiAyO1xuXHRcdGNvbnN0IGljb25FbCA9IGRvbS4kKCcuYW5pbWF0aW9uLXBhcnRpY2xlJyk7XG5cdFx0aWNvbkVsLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRpY29uRWwuc3R5bGUubGVmdCA9IGAke2N4fXB4YDtcblx0XHRpY29uRWwuc3R5bGUudG9wID0gYCR7Y3l9cHhgO1xuXHRcdGljb25FbC5zdHlsZS5mb250U2l6ZSA9IGAke3NpemV9cHhgO1xuXHRcdGljb25FbC5zdHlsZS5saW5lSGVpZ2h0ID0gJzEnO1xuXHRcdGljb25FbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsICMwMDdhY2MpJztcblx0XHRpY29uRWwuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0b3ZlcmxheS5hcHBlbmRDaGlsZChpY29uRWwpO1xuXG5cdFx0Y29uc3QgZHJpZnRYID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogNTA7XG5cdFx0Y29uc3QgZmxvYXRZID0gLTUwIC0gKGkgJSAzKSAqIDEwO1xuXHRcdGNvbnN0IHJvdGF0ZTEgPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAyMDtcblx0XHRjb25zdCByb3RhdGUyID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogNDA7XG5cblx0XHRpY29uRWwuYW5pbWF0ZShbXG5cdFx0XHR7IG9wYWNpdHk6IDAsIHRyYW5zZm9ybTogYHRyYW5zbGF0ZSgtNTAlLCAtNTAlKSBzY2FsZSgwKSByb3RhdGUoJHtyb3RhdGUxfWRlZylgIH0sXG5cdFx0XHR7IG9wYWNpdHk6IDEsIHRyYW5zZm9ybTogYHRyYW5zbGF0ZShjYWxjKC01MCUgKyAke2RyaWZ0WCAqIDAuM31weCksIGNhbGMoLTUwJSArICR7ZmxvYXRZICogMC4zfXB4KSkgc2NhbGUoMSkgcm90YXRlKCR7KHJvdGF0ZTEgKyByb3RhdGUyKSAqIDAuM31kZWcpYCwgb2Zmc2V0OiAwLjMgfSxcblx0XHRcdHsgb3BhY2l0eTogMSwgdHJhbnNmb3JtOiBgdHJhbnNsYXRlKGNhbGMoLTUwJSArICR7ZHJpZnRYICogMC43fXB4KSwgY2FsYygtNTAlICsgJHtmbG9hdFkgKiAwLjd9cHgpKSBzY2FsZSgxKSByb3RhdGUoJHsocm90YXRlMSArIHJvdGF0ZTIpICogMC43fWRlZylgLCBvZmZzZXQ6IDAuNyB9LFxuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoY2FsYygtNTAlICsgJHtkcmlmdFh9cHgpLCBjYWxjKC01MCUgKyAke2Zsb2F0WX1weCkpIHNjYWxlKDAuOCkgcm90YXRlKCR7cm90YXRlMn1kZWcpYCB9LFxuXHRcdF0sIHtcblx0XHRcdGR1cmF0aW9uOiA4MDAgKyAoaSAlIDMpICogMjAwLFxuXHRcdFx0ZGVsYXk6IGkgKiA4MCxcblx0XHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSknLFxuXHRcdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0XHR9KTtcblx0fVxuXG5cdC8vIEV4cGFuZGluZyByaW5nXG5cdGNvbnN0IHJpbmcgPSBkb20uJCgnLmFuaW1hdGlvbi1wYXJ0aWNsZScpO1xuXHRyaW5nLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0cmluZy5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRyaW5nLnN0eWxlLnRvcCA9ICcwJztcblx0cmluZy5zdHlsZS53aWR0aCA9IGAke3JlY3Qud2lkdGh9cHhgO1xuXHRyaW5nLnN0eWxlLmhlaWdodCA9IGAke3JlY3QuaGVpZ2h0fXB4YDtcblx0cmluZy5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnNTAlJztcblx0cmluZy5zdHlsZS5ib3JkZXIgPSAnMnB4IHNvbGlkIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwN2FjYyknO1xuXHRyaW5nLnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94Jztcblx0b3ZlcmxheS5hcHBlbmRDaGlsZChyaW5nKTtcblxuXHRyaW5nLmFuaW1hdGUoW1xuXHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMSknLCBvcGFjaXR5OiAxIH0sXG5cdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgyKScsIG9wYWNpdHk6IDAgfSxcblx0XSwge1xuXHRcdGR1cmF0aW9uOiA1MDAsXG5cdFx0ZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKScsXG5cdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0fSk7XG5cblx0Y2xlYW51cE92ZXJsYXkoMjAwMCk7XG59XG5cbi8qKlxuICogUHVsc2UgV2F2ZTogZXhwYW5kaW5nIHJpbmdzIGFuZCBzcGFya2xlIGRvdHMgcmFkaWF0ZSBmcm9tIHRoZSBlbGVtZW50IGNlbnRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJQdWxzZVdhdmVBbmltYXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQpIHtcblx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlT3ZlcmxheShlbGVtZW50KTtcblx0aWYgKCFyZXN1bHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB7IG92ZXJsYXksIGN4LCBjeSB9ID0gcmVzdWx0O1xuXHRjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuXHQvLyBFbGVtZW50IGJvdW5jZSB3aXRoIHNsaWdodCByb3RhdGlvblxuXHRib3VuY2VFbGVtZW50KGVsZW1lbnQsIHtcblx0XHRzY2FsZTogWzEsIDEuMSwgMV0sXG5cdFx0cm90YXRlOiBbMCwgLTEyLCAwXSxcblx0XHRkdXJhdGlvbjogNDAwLFxuXHR9KTtcblxuXHQvLyBFeHBhbmRpbmcgcmluZ3Ncblx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyOyBpKyspIHtcblx0XHRjb25zdCByaW5nID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0XHRyaW5nLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRyaW5nLnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0cmluZy5zdHlsZS50b3AgPSAnMCc7XG5cdFx0cmluZy5zdHlsZS53aWR0aCA9IGAke3JlY3Qud2lkdGh9cHhgO1xuXHRcdHJpbmcuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRcdHJpbmcuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzUwJSc7XG5cdFx0cmluZy5zdHlsZS5ib3JkZXIgPSAnMnB4IHNvbGlkIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwN2FjYyknO1xuXHRcdHJpbmcuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xuXHRcdG92ZXJsYXkuYXBwZW5kQ2hpbGQocmluZyk7XG5cblx0XHRyaW5nLmFuaW1hdGUoW1xuXHRcdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgwLjgpJywgb3BhY2l0eTogMCB9LFxuXHRcdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgwLjgpJywgb3BhY2l0eTogMC42LCBvZmZzZXQ6IDAuMDEgfSxcblx0XHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMi41KScsIG9wYWNpdHk6IDAgfSxcblx0XHRdLCB7XG5cdFx0XHRkdXJhdGlvbjogODAwLFxuXHRcdFx0ZGVsYXk6IGkgKiAxNTAsXG5cdFx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRcdGZpbGw6ICdmb3J3YXJkcycsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBTcGFya2xlIGRvdHNcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2OyBpKyspIHtcblx0XHRjb25zdCBhbmdsZSA9IChpICogNjAgKiBNYXRoLlBJKSAvIDE4MDtcblx0XHRjb25zdCBkaXN0YW5jZSA9IDMwICsgKGkgJSAyKSAqIDEwO1xuXHRcdGNvbnN0IHNpemUgPSAzLjU7XG5cblx0XHRjb25zdCBkb3QgPSBkb20uJCgnLmFuaW1hdGlvbi1wYXJ0aWNsZScpO1xuXHRcdGRvdC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0ZG90LnN0eWxlLndpZHRoID0gYCR7c2l6ZX1weGA7XG5cdFx0ZG90LnN0eWxlLmhlaWdodCA9IGAke3NpemV9cHhgO1xuXHRcdGRvdC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnNTAlJztcblx0XHRkb3Quc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyMwMDk4ZmYnO1xuXHRcdGRvdC5zdHlsZS5sZWZ0ID0gYCR7Y3ggLSBzaXplIC8gMn1weGA7XG5cdFx0ZG90LnN0eWxlLnRvcCA9IGAke2N5IC0gc2l6ZSAvIDJ9cHhgO1xuXHRcdG92ZXJsYXkuYXBwZW5kQ2hpbGQoZG90KTtcblxuXHRcdGNvbnN0IHR4ID0gTWF0aC5jb3MoYW5nbGUpICogZGlzdGFuY2U7XG5cdFx0Y29uc3QgdHkgPSBNYXRoLnNpbihhbmdsZSkgKiBkaXN0YW5jZTtcblxuXHRcdGRvdC5hbmltYXRlKFtcblx0XHRcdHsgb3BhY2l0eTogMCwgdHJhbnNmb3JtOiAnc2NhbGUoMCkgdHJhbnNsYXRlKDAsIDApJyB9LFxuXHRcdFx0eyBvcGFjaXR5OiAxLCB0cmFuc2Zvcm06IGBzY2FsZSgxKSB0cmFuc2xhdGUoJHt0eH1weCwgJHt0eX1weClgLCBvZmZzZXQ6IDAuNSB9LFxuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06IGBzY2FsZSgwKSB0cmFuc2xhdGUoJHt0eH1weCwgJHt0eX1weClgIH0sXG5cdFx0XSwge1xuXHRcdFx0ZHVyYXRpb246IDYwMCxcblx0XHRcdGRlbGF5OiAxMDAgKyBpICogNTAsXG5cdFx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRcdGZpbGw6ICdmb3J3YXJkcycsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBCYWNrZ3JvdW5kIGdsb3dcblx0Y29uc3QgZ2xvdyA9IGRvbS4kKCcuYW5pbWF0aW9uLXBhcnRpY2xlJyk7XG5cdGdsb3cuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRnbG93LnN0eWxlLmxlZnQgPSAnMCc7XG5cdGdsb3cuc3R5bGUudG9wID0gJzAnO1xuXHRnbG93LnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG5cdGdsb3cuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRnbG93LnN0eWxlLmJvcmRlclJhZGl1cyA9ICc1MCUnO1xuXHRnbG93LnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsICMwMDdhY2MpJztcblx0b3ZlcmxheS5hcHBlbmRDaGlsZChnbG93KTtcblxuXHRnbG93LmFuaW1hdGUoW1xuXHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMC45KScsIG9wYWNpdHk6IDAgfSxcblx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDAuOSknLCBvcGFjaXR5OiAwLjUsIG9mZnNldDogMC4wMSB9LFxuXHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMS41KScsIG9wYWNpdHk6IDAgfSxcblx0XSwge1xuXHRcdGR1cmF0aW9uOiA1MDAsXG5cdFx0ZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKScsXG5cdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0fSk7XG5cblx0Y2xlYW51cE92ZXJsYXkoMjAwMCk7XG59XG5cbi8qKlxuICogUmFkaWFudCBMaW5lczogbGluZXMgYW5kIGRvdHMgZW1hbmF0ZSBvdXR3YXJkIGZyb20gdGhlIGVsZW1lbnQgY2VudGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlclJhZGlhbnRMaW5lc0FuaW1hdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRjb25zdCByZXN1bHQgPSBjcmVhdGVPdmVybGF5KGVsZW1lbnQpO1xuXHRpZiAoIXJlc3VsdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHsgb3ZlcmxheSwgY3gsIGN5IH0gPSByZXN1bHQ7XG5cblx0Ly8gRWxlbWVudCBzY2FsZSBib3VuY2Vcblx0Ym91bmNlRWxlbWVudChlbGVtZW50LCB7XG5cdFx0c2NhbGU6IFsxLCAxLjE1LCAxXSxcblx0XHRkdXJhdGlvbjogMzUwLFxuXHR9KTtcblxuXHQvLyBEb3RzIGF0IG9mZnNldCBhbmdsZXNcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcblx0XHRjb25zdCBzaXplID0gMztcblx0XHRjb25zdCBkb3RPcGFjaXR5ID0gMC43O1xuXHRcdGNvbnN0IGFuZ2xlID0gKChpICogNDUgKyAyMi41KSAqIE1hdGguUEkpIC8gMTgwO1xuXHRcdGNvbnN0IHN0YXJ0RGlzdGFuY2UgPSAxNDtcblx0XHRjb25zdCBlbmREaXN0YW5jZSA9IDMwO1xuXG5cdFx0Y29uc3QgZG90ID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0XHRkb3Quc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGRvdC5zdHlsZS53aWR0aCA9IGAke3NpemV9cHhgO1xuXHRcdGRvdC5zdHlsZS5oZWlnaHQgPSBgJHtzaXplfXB4YDtcblx0XHRkb3Quc3R5bGUuYm9yZGVyUmFkaXVzID0gJzUwJSc7XG5cdFx0ZG90LnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtZWRpdG9yLWZvcmVncm91bmQsICNmZmZmZmYpJztcblx0XHRkb3Quc3R5bGUubGVmdCA9IGAke2N4IC0gc2l6ZSAvIDJ9cHhgO1xuXHRcdGRvdC5zdHlsZS50b3AgPSBgJHtjeSAtIHNpemUgLyAyfXB4YDtcblx0XHRvdmVybGF5LmFwcGVuZENoaWxkKGRvdCk7XG5cblx0XHRjb25zdCBzdGFydFggPSBNYXRoLmNvcyhhbmdsZSkgKiBzdGFydERpc3RhbmNlO1xuXHRcdGNvbnN0IHN0YXJ0WSA9IE1hdGguc2luKGFuZ2xlKSAqIHN0YXJ0RGlzdGFuY2U7XG5cdFx0Y29uc3QgZW5kWCA9IE1hdGguY29zKGFuZ2xlKSAqIGVuZERpc3RhbmNlO1xuXHRcdGNvbnN0IGVuZFkgPSBNYXRoLnNpbihhbmdsZSkgKiBlbmREaXN0YW5jZTtcblxuXHRcdGRvdC5hbmltYXRlKFtcblx0XHRcdHsgb3BhY2l0eTogMCwgdHJhbnNmb3JtOiBgc2NhbGUoMCkgdHJhbnNsYXRlKCR7c3RhcnRYfXB4LCAke3N0YXJ0WX1weClgIH0sXG5cdFx0XHR7IG9wYWNpdHk6IGRvdE9wYWNpdHksIHRyYW5zZm9ybTogYHNjYWxlKDEuMikgdHJhbnNsYXRlKCR7KHN0YXJ0WCArIGVuZFgpIC8gMn1weCwgJHsoc3RhcnRZICsgZW5kWSkgLyAyfXB4KWAsIG9mZnNldDogMC4yNSB9LFxuXHRcdFx0eyBvcGFjaXR5OiBkb3RPcGFjaXR5LCB0cmFuc2Zvcm06IGBzY2FsZSgxKSB0cmFuc2xhdGUoJHtlbmRYICogMC44fXB4LCAke2VuZFkgKiAwLjh9cHgpYCwgb2Zmc2V0OiAwLjUgfSxcblx0XHRcdHsgb3BhY2l0eTogZG90T3BhY2l0eSAqIDAuNSwgdHJhbnNmb3JtOiBgc2NhbGUoMSkgdHJhbnNsYXRlKCR7ZW5kWH1weCwgJHtlbmRZfXB4KWAsIG9mZnNldDogMC43NSB9LFxuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06IGBzY2FsZSgwLjUpIHRyYW5zbGF0ZSgke2VuZFh9cHgsICR7ZW5kWX1weClgIH0sXG5cdFx0XSwge1xuXHRcdFx0ZHVyYXRpb246IDExMDAsXG5cdFx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRcdGZpbGw6ICdmb3J3YXJkcycsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBSYWRpYW50IGxpbmVzXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgODsgaSsrKSB7XG5cdFx0Y29uc3QgYW5nbGVEZWcgPSBpICogNDU7XG5cblx0XHRjb25zdCBsaW5lV3JhcHBlciA9IGRvbS4kKCcuYW5pbWF0aW9uLXBhcnRpY2xlJyk7XG5cdFx0bGluZVdyYXBwZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGxpbmVXcmFwcGVyLnN0eWxlLmxlZnQgPSBgJHtjeH1weGA7XG5cdFx0bGluZVdyYXBwZXIuc3R5bGUudG9wID0gYCR7Y3l9cHhgO1xuXHRcdGxpbmVXcmFwcGVyLnN0eWxlLndpZHRoID0gJzAnO1xuXHRcdGxpbmVXcmFwcGVyLnN0eWxlLmhlaWdodCA9ICcwJztcblx0XHRsaW5lV3JhcHBlci5zdHlsZS50cmFuc2Zvcm0gPSBgcm90YXRlKCR7YW5nbGVEZWd9ZGVnKWA7XG5cdFx0b3ZlcmxheS5hcHBlbmRDaGlsZChsaW5lV3JhcHBlcik7XG5cblx0XHRjb25zdCBsaW5lID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0XHRsaW5lLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRsaW5lLnN0eWxlLndpZHRoID0gJzJweCc7XG5cdFx0bGluZS5zdHlsZS5oZWlnaHQgPSAnMTBweCc7XG5cdFx0bGluZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3YWNjKSc7XG5cdFx0bGluZS5zdHlsZS5sZWZ0ID0gJy0xcHgnO1xuXHRcdGxpbmUuc3R5bGUudG9wID0gJy0yMnB4Jztcblx0XHRsaW5lLnN0eWxlLnRyYW5zZm9ybU9yaWdpbiA9ICdib3R0b20gY2VudGVyJztcblx0XHRsaW5lV3JhcHBlci5hcHBlbmRDaGlsZChsaW5lKTtcblxuXHRcdGxpbmUuYW5pbWF0ZShbXG5cdFx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDEsIDApJywgb3BhY2l0eTogMC42IH0sXG5cdFx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDEsIDEpJywgb3BhY2l0eTogMC42LCBvZmZzZXQ6IDAuMiB9LFxuXHRcdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgxLCAxKScsIG9wYWNpdHk6IDAuNiwgb2Zmc2V0OiAwLjYgfSxcblx0XHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMSwgMSknLCBvcGFjaXR5OiAwLjYsIG9mZnNldDogMC44IH0sXG5cdFx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDAsIDAuMyknLCBvcGFjaXR5OiAwIH0sXG5cdFx0XSwge1xuXHRcdFx0ZHVyYXRpb246IDEyMDAsXG5cdFx0XHRkZWxheTogMTUwLFxuXHRcdFx0ZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKScsXG5cdFx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHRcdH0pO1xuXHR9XG5cblx0Y2xlYW51cE92ZXJsYXkoMjAwMCk7XG59XG5cbi8qKlxuICogVHJpZ2dlcnMgdGhlIHNwZWNpZmllZCBjbGljayBhbmltYXRpb24gb24gdGhlIGVsZW1lbnQuXG4gKiBAcGFyYW0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQgdG8gYW5pbWF0ZS5cbiAqIEBwYXJhbSBhbmltYXRpb24gVGhlIHR5cGUgb2YgY2xpY2sgYW5pbWF0aW9uIHRvIHRyaWdnZXIuXG4gKiBAcGFyYW0gaWNvbiBPcHRpb25hbCBpY29uIGZvciBhbmltYXRpb25zIHRoYXQgcmVxdWlyZSBpdCAoZS5nLiwgRmxvYXRpbmdJY29ucykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyQ2xpY2tBbmltYXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGFuaW1hdGlvbjogQ2xpY2tBbmltYXRpb24sIGljb24/OiBUaGVtZUljb24pIHtcblx0c3dpdGNoIChhbmltYXRpb24pIHtcblx0XHRjYXNlIENsaWNrQW5pbWF0aW9uLkNvbmZldHRpOlxuXHRcdFx0dHJpZ2dlckNvbmZldHRpQW5pbWF0aW9uKGVsZW1lbnQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBDbGlja0FuaW1hdGlvbi5GbG9hdGluZ0ljb25zOlxuXHRcdFx0aWYgKGljb24pIHtcblx0XHRcdFx0dHJpZ2dlckZsb2F0aW5nSWNvbnNBbmltYXRpb24oZWxlbWVudCwgaWNvbik7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIENsaWNrQW5pbWF0aW9uLlB1bHNlV2F2ZTpcblx0XHRcdHRyaWdnZXJQdWxzZVdhdmVBbmltYXRpb24oZWxlbWVudCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIENsaWNrQW5pbWF0aW9uLlJhZGlhbnRMaW5lczpcblx0XHRcdHRyaWdnZXJSYWRpYW50TGluZXNBbmltYXRpb24oZWxlbWVudCk7XG5cdFx0XHRicmVhaztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUI7QUFDMUIsWUFBWSxTQUFTO0FBRWQsSUFBVyxpQkFBWCxrQkFBV0Esb0JBQVg7QUFDTixFQUFBQSxnQ0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxnQ0FBQSxtQkFBZ0IsS0FBaEI7QUFD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
