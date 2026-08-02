import * as dom from "../../../../../base/browser/dom.js";
import { localize } from "../../../../../nls.js";
import { FONT_SIZE, addKeyboardActivation } from "./tokens.js";
function hoverIcon(className, ariaLabel) {
  const el = dom.$(`span.codicon.${className}`);
  el.role = "button";
  el.tabIndex = 0;
  el.ariaLabel = ariaLabel;
  el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px;`;
  el.addEventListener("mouseenter", () => {
    el.style.color = "var(--vscode-foreground)";
  });
  el.addEventListener("mouseleave", () => {
    el.style.color = "var(--vscode-descriptionForeground)";
  });
  addKeyboardActivation(el);
  return el;
}
function createSessionRow(session, props) {
  const isSelected = props.selectedTarget?.toString() === session.resource.toString();
  const dotColor = session.needsInput ? "var(--vscode-editorWarning-foreground)" : session.isActive ? "var(--vscode-charts-green)" : "var(--vscode-editorWhitespace-foreground)";
  const effectiveDotColor = session.isSpeaking ? "var(--vscode-agentsVoice-speakingForeground)" : dotColor;
  const shouldPulse = session.isActive || session.isSpeaking;
  const labelColor = session.isSpeaking ? "var(--vscode-agentsVoice-speakingForeground)" : session.isIdle ? "var(--vscode-descriptionForeground)" : "var(--vscode-foreground)";
  const labelWeight = session.isSpeaking ? "500" : "normal";
  const rowBg = isSelected ? "background:var(--vscode-list-activeSelectionBackground);border-radius:4px;" : "";
  const rowLabelColor = isSelected ? "var(--vscode-list-activeSelectionForeground)" : labelColor;
  const row = dom.$("div");
  row.role = "option";
  row.tabIndex = 0;
  row.ariaLabel = session.label || "Untitled session";
  row.setAttribute("aria-selected", String(isSelected));
  row.style.cssText = `display:flex;align-items:center;gap:6px;height:28px;padding:0 4px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;cursor:pointer;${rowBg}`;
  row.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSelected) {
      props.onSelectTarget(void 0);
    } else {
      props.onSelectTarget(session.resource);
    }
  });
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      row.click();
    }
  });
  const showActions = () => {
    if (stats) {
      stats.style.display = "none";
    }
    if (actions) {
      actions.style.display = "flex";
    }
  };
  const hideActions = () => {
    if (stats) {
      stats.style.display = "flex";
    }
    if (actions) {
      actions.style.display = "none";
    }
  };
  row.addEventListener("mouseenter", showActions);
  row.addEventListener("mouseleave", hideActions);
  row.addEventListener("focusin", showActions);
  row.addEventListener("focusout", (e) => {
    if (!row.contains(e.relatedTarget)) {
      hideActions();
    }
  });
  if (isSelected) {
    const check = dom.$("span.codicon.codicon-check");
    check.style.cssText = `font-size:10px;color:${rowLabelColor};flex-shrink:0;`;
    row.append(check);
  } else {
    const dot = dom.$("span");
    dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${effectiveDotColor};flex-shrink:0;${shouldPulse ? "animation:agents-voice-pulse 1.4s ease-in-out infinite;" : ""}`;
    row.append(dot);
  }
  const label = dom.$("span");
  label.style.cssText = `font-size:${FONT_SIZE.body};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${rowLabelColor};font-weight:${labelWeight};`;
  label.textContent = session.label || "Untitled session";
  row.append(label);
  const actionsContainer = dom.$("div");
  actionsContainer.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";
  const stats = dom.$("span");
  stats.setAttribute("data-role", "stats");
  stats.style.cssText = `display:flex;gap:4px;font-size:${FONT_SIZE.body};`;
  if (session.insertions > 0) {
    const ins = dom.$("span");
    ins.style.color = "var(--vscode-charts-green)";
    ins.textContent = `+${session.insertions}`;
    stats.append(ins);
  }
  if (session.deletions > 0) {
    const del = dom.$("span");
    del.style.color = "var(--vscode-editorError-foreground)";
    del.textContent = `-${session.deletions}`;
    stats.append(del);
  }
  const actions = dom.$("span");
  actions.setAttribute("data-role", "actions");
  actions.style.cssText = "display:none;gap:4px;align-items:center;";
  if (!session.isIdle) {
    const stopBtn = hoverIcon("codicon-debug-stop", localize("agentsVoice.stopSessionAction", "Stop session"));
    stopBtn.addEventListener("mouseenter", () => {
      stopBtn.style.color = "var(--vscode-editorError-foreground)";
    });
    stopBtn.addEventListener("mouseleave", () => {
      stopBtn.style.color = "var(--vscode-descriptionForeground)";
    });
    stopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      props.onStopSession(session.resource);
    });
    actions.append(stopBtn);
  }
  actionsContainer.append(stats, actions);
  row.append(actionsContainer);
  const wrapper = dom.$("div");
  wrapper.append(row);
  if (session.toolConfirmation) {
    const tc = session.toolConfirmation;
    const confRow = dom.$("div");
    confRow.style.cssText = "display:flex;flex-direction:column;gap:3px;padding:2px 2px 6px 15px;border-bottom:1px solid var(--vscode-panel-border);";
    const confDesc = dom.$("span");
    confDesc.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);`;
    confDesc.textContent = tc.description;
    const confBtns = dom.$("div");
    confBtns.style.cssText = "display:flex;gap:6px;";
    const btnStyle = `-webkit-app-region:no-drag;border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;`;
    if (tc.type === "approval") {
      const approveBtn = dom.$("button");
      approveBtn.style.cssText = `${btnStyle}background:var(--vscode-charts-green);`;
      approveBtn.textContent = localize("agentsVoice.approve", "Approve");
      approveBtn.addEventListener("click", () => tc.approve());
      const denyBtn = dom.$("button");
      denyBtn.style.cssText = `${btnStyle}background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);`;
      denyBtn.textContent = localize("agentsVoice.deny", "Deny");
      denyBtn.addEventListener("click", () => tc.deny());
      const stopBtn = dom.$("button");
      stopBtn.style.cssText = `${btnStyle}background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);`;
      stopBtn.textContent = localize("agentsVoice.stop", "Stop");
      stopBtn.addEventListener("click", () => props.onCancelSession(session.resource));
      confBtns.append(approveBtn, denyBtn, stopBtn);
    } else {
      const openInVSCode = dom.$("button");
      openInVSCode.style.cssText = `${btnStyle}background:var(--vscode-button-background);`;
      openInVSCode.textContent = localize("agentsVoice.openInVSCode", "Open in VS Code");
      openInVSCode.addEventListener("click", () => props.onOpenSession(session.resource));
      confBtns.append(openInVSCode);
    }
    confRow.append(confDesc, confBtns);
    wrapper.append(confRow);
  }
  return wrapper;
}
function createSessionList() {
  const container = dom.$("div.voice-session-list");
  container.style.cssText = "display:flex;flex-direction:column;min-height:84px;max-height:320px;overflow-y:auto;margin:0 -14px 0 0;padding-right:8px;";
  const style = dom.$("style");
  style.textContent = `
		@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
		.voice-session-list::-webkit-scrollbar{width:6px;background:transparent;}
		.voice-session-list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-activeBackground);border-radius:3px;}
		.voice-session-list::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-activeBackground);}
		.voice-session-list > div:last-of-type{border-bottom:none !important;}
	`;
  return {
    element: container,
    update(props) {
      dom.clearNode(container);
      const hasGroups = props.groups && props.groups.length > 0;
      const hasSessions = props.sessions.length > 0;
      const headerRow = dom.$("div");
      headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:2px 2px 4px;border-bottom:1px solid var(--vscode-editorGroup-border);";
      const headerLabel = dom.$("span");
      headerLabel.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;`;
      headerLabel.textContent = props.selectedTarget ? localize("agentsVoice.sendTo", "Send to") : localize("agentsVoice.sendToActive", "Send to (active)");
      const addBtn = hoverIcon("codicon-add", localize("agentsVoice.newSession", "New session"));
      addBtn.title = localize("agentsVoice.newSession", "New session");
      addBtn.style.cssText += "padding:1px 2px;";
      addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onNewSession();
      });
      headerRow.append(headerLabel, addBtn);
      container.append(headerRow);
      if (!hasGroups && !hasSessions) {
        const empty = dom.$("div");
        empty.style.cssText = "display:flex;align-items:center;justify-content:center;height:60px;";
        const emptyText = dom.$("span");
        emptyText.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-foreground);`;
        emptyText.textContent = localize("agentsVoice.noActiveSessions", "No active sessions");
        empty.append(emptyText);
        container.append(empty);
      } else if (hasGroups) {
        for (const group of props.groups) {
          const groupHeader = dom.$("div");
          groupHeader.style.cssText = "padding:4px 2px 2px;";
          const groupLabel = dom.$("span");
          groupLabel.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;`;
          groupLabel.textContent = group.label;
          groupHeader.append(groupLabel);
          container.append(groupHeader);
          for (const session of group.sessions) {
            container.append(createSessionRow(session, props));
          }
        }
      } else {
        for (const session of props.sessions) {
          container.append(createSessionRow(session, props));
        }
      }
      container.append(style);
    }
  };
}
export {
  createSessionList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvY29tcG9uZW50cy9zZXNzaW9uTGlzdENvbXBvbmVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB0eXBlIHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSVBlbmRpbmdUb29sQ29uZmlybWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRk9OVF9TSVpFLCBhZGRLZXlib2FyZEFjdGl2YXRpb24gfSBmcm9tICcuL3Rva2Vucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvblJvd0RhdGEge1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpc0FjdGl2ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgbmVlZHNJbnB1dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNJZGxlOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1NwZWFraW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBpbnNlcnRpb25zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRlbGV0aW9uczogbnVtYmVyO1xuXHRyZWFkb25seSB0b29sQ29uZmlybWF0aW9uOiBJUGVuZGluZ1Rvb2xDb25maXJtYXRpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvbkdyb3VwRGF0YSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25zOiByZWFkb25seSBTZXNzaW9uUm93RGF0YVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlc3Npb25MaXN0UHJvcHMge1xuXHRyZWFkb25seSBzZXNzaW9uczogcmVhZG9ubHkgU2Vzc2lvblJvd0RhdGFbXTtcblx0cmVhZG9ubHkgZ3JvdXBzPzogcmVhZG9ubHkgU2Vzc2lvbkdyb3VwRGF0YVtdO1xuXHRyZWFkb25seSBzZWxlY3RlZFRhcmdldD86IFVSSTtcblx0cmVhZG9ubHkgb25PcGVuU2Vzc2lvbjogKHJlc291cmNlOiBVUkkpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uU3RvcFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiB2b2lkO1xuXHRyZWFkb25seSBvbkNhbmNlbFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiB2b2lkO1xuXHRyZWFkb25seSBvblNlbGVjdFRhcmdldDogKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uTmV3U2Vzc2lvbjogKCkgPT4gdm9pZDtcbn1cblxuZnVuY3Rpb24gaG92ZXJJY29uKGNsYXNzTmFtZTogc3RyaW5nLCBhcmlhTGFiZWw6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgZWwgPSBkb20uJChgc3Bhbi5jb2RpY29uLiR7Y2xhc3NOYW1lfWApO1xuXHRlbC5yb2xlID0gJ2J1dHRvbic7XG5cdGVsLnRhYkluZGV4ID0gMDtcblx0ZWwuYXJpYUxhYmVsID0gYXJpYUxhYmVsO1xuXHRlbC5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5pY29uU219O2NvbG9yOnZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpO2N1cnNvcjpwb2ludGVyOy13ZWJraXQtYXBwLXJlZ2lvbjpuby1kcmFnO3BhZGRpbmc6MXB4O2A7XG5cdGVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7IH0pO1xuXHRlbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBlbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7IH0pO1xuXHRhZGRLZXlib2FyZEFjdGl2YXRpb24oZWwpO1xuXHRyZXR1cm4gZWw7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25Sb3coc2Vzc2lvbjogU2Vzc2lvblJvd0RhdGEsIHByb3BzOiBTZXNzaW9uTGlzdFByb3BzKTogSFRNTEVsZW1lbnQge1xuXHRjb25zdCBpc1NlbGVjdGVkID0gcHJvcHMuc2VsZWN0ZWRUYXJnZXQ/LnRvU3RyaW5nKCkgPT09IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0Y29uc3QgZG90Q29sb3IgPSBzZXNzaW9uLm5lZWRzSW5wdXQgPyAndmFyKC0tdnNjb2RlLWVkaXRvcldhcm5pbmctZm9yZWdyb3VuZCknXG5cdFx0OiBzZXNzaW9uLmlzQWN0aXZlID8gJ3ZhcigtLXZzY29kZS1jaGFydHMtZ3JlZW4pJ1xuXHRcdFx0OiAndmFyKC0tdnNjb2RlLWVkaXRvcldoaXRlc3BhY2UtZm9yZWdyb3VuZCknO1xuXHRjb25zdCBlZmZlY3RpdmVEb3RDb2xvciA9IHNlc3Npb24uaXNTcGVha2luZyA/ICd2YXIoLS12c2NvZGUtYWdlbnRzVm9pY2Utc3BlYWtpbmdGb3JlZ3JvdW5kKScgOiBkb3RDb2xvcjtcblx0Y29uc3Qgc2hvdWxkUHVsc2UgPSBzZXNzaW9uLmlzQWN0aXZlIHx8IHNlc3Npb24uaXNTcGVha2luZztcblxuXHRjb25zdCBsYWJlbENvbG9yID0gc2Vzc2lvbi5pc1NwZWFraW5nID8gJ3ZhcigtLXZzY29kZS1hZ2VudHNWb2ljZS1zcGVha2luZ0ZvcmVncm91bmQpJ1xuXHRcdDogc2Vzc2lvbi5pc0lkbGUgPyAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknXG5cdFx0XHQ6ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRjb25zdCBsYWJlbFdlaWdodCA9IHNlc3Npb24uaXNTcGVha2luZyA/ICc1MDAnIDogJ25vcm1hbCc7XG5cdGNvbnN0IHJvd0JnID0gaXNTZWxlY3RlZCA/ICdiYWNrZ3JvdW5kOnZhcigtLXZzY29kZS1saXN0LWFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpO2JvcmRlci1yYWRpdXM6NHB4OycgOiAnJztcblx0Y29uc3Qgcm93TGFiZWxDb2xvciA9IGlzU2VsZWN0ZWQgPyAndmFyKC0tdnNjb2RlLWxpc3QtYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZCknIDogbGFiZWxDb2xvcjtcblxuXHRjb25zdCByb3cgPSBkb20uJCgnZGl2Jyk7XG5cdHJvdy5yb2xlID0gJ29wdGlvbic7XG5cdHJvdy50YWJJbmRleCA9IDA7XG5cdHJvdy5hcmlhTGFiZWwgPSBzZXNzaW9uLmxhYmVsIHx8ICdVbnRpdGxlZCBzZXNzaW9uJztcblx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIFN0cmluZyhpc1NlbGVjdGVkKSk7XG5cdHJvdy5zdHlsZS5jc3NUZXh0ID0gYGRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtoZWlnaHQ6MjhweDtwYWRkaW5nOjAgNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JHcm91cC1ib3JkZXIpO2ZsZXgtc2hyaW5rOjA7Y3Vyc29yOnBvaW50ZXI7JHtyb3dCZ31gO1xuXG5cdHJvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0aWYgKGlzU2VsZWN0ZWQpIHtcblx0XHRcdHByb3BzLm9uU2VsZWN0VGFyZ2V0KHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb3BzLm9uU2VsZWN0VGFyZ2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdH1cblx0fSk7XG5cdHJvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcblx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0cm93LmNsaWNrKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCBzaG93QWN0aW9ucyA9ICgpID0+IHtcblx0XHRpZiAoc3RhdHMpIHsgc3RhdHMuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgfVxuXHRcdGlmIChhY3Rpb25zKSB7IGFjdGlvbnMuc3R5bGUuZGlzcGxheSA9ICdmbGV4JzsgfVxuXHR9O1xuXHRjb25zdCBoaWRlQWN0aW9ucyA9ICgpID0+IHtcblx0XHRpZiAoc3RhdHMpIHsgc3RhdHMuc3R5bGUuZGlzcGxheSA9ICdmbGV4JzsgfVxuXHRcdGlmIChhY3Rpb25zKSB7IGFjdGlvbnMuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgfVxuXHR9O1xuXHRyb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsIHNob3dBY3Rpb25zKTtcblx0cm93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCBoaWRlQWN0aW9ucyk7XG5cdHJvdy5hZGRFdmVudExpc3RlbmVyKCdmb2N1c2luJywgc2hvd0FjdGlvbnMpO1xuXHRyb3cuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCAoZSkgPT4ge1xuXHRcdGlmICghcm93LmNvbnRhaW5zKChlIGFzIEZvY3VzRXZlbnQpLnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRoaWRlQWN0aW9ucygpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gRG90IG9yIGNoZWNrXG5cdGlmIChpc1NlbGVjdGVkKSB7XG5cdFx0Y29uc3QgY2hlY2sgPSBkb20uJCgnc3Bhbi5jb2RpY29uLmNvZGljb24tY2hlY2snKTtcblx0XHRjaGVjay5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToxMHB4O2NvbG9yOiR7cm93TGFiZWxDb2xvcn07ZmxleC1zaHJpbms6MDtgO1xuXHRcdHJvdy5hcHBlbmQoY2hlY2spO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGRvdCA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0ZG90LnN0eWxlLmNzc1RleHQgPSBgd2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDoke2VmZmVjdGl2ZURvdENvbG9yfTtmbGV4LXNocmluazowOyR7c2hvdWxkUHVsc2UgPyAnYW5pbWF0aW9uOmFnZW50cy12b2ljZS1wdWxzZSAxLjRzIGVhc2UtaW4tb3V0IGluZmluaXRlOycgOiAnJ31gO1xuXHRcdHJvdy5hcHBlbmQoZG90KTtcblx0fVxuXG5cdC8vIExhYmVsXG5cdGNvbnN0IGxhYmVsID0gZG9tLiQoJ3NwYW4nKTtcblx0bGFiZWwuc3R5bGUuY3NzVGV4dCA9IGBmb250LXNpemU6JHtGT05UX1NJWkUuYm9keX07ZmxleDoxO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO3doaXRlLXNwYWNlOm5vd3JhcDtjb2xvcjoke3Jvd0xhYmVsQ29sb3J9O2ZvbnQtd2VpZ2h0OiR7bGFiZWxXZWlnaHR9O2A7XG5cdGxhYmVsLnRleHRDb250ZW50ID0gc2Vzc2lvbi5sYWJlbCB8fCAnVW50aXRsZWQgc2Vzc2lvbic7XG5cdHJvdy5hcHBlbmQobGFiZWwpO1xuXG5cdC8vIEFjdGlvbnMgY29udGFpbmVyXG5cdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBkb20uJCgnZGl2Jyk7XG5cdGFjdGlvbnNDb250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo0cHg7ZmxleC1zaHJpbms6MDsnO1xuXG5cdGNvbnN0IHN0YXRzID0gZG9tLiQoJ3NwYW4nKTtcblx0c3RhdHMuc2V0QXR0cmlidXRlKCdkYXRhLXJvbGUnLCAnc3RhdHMnKTtcblx0c3RhdHMuc3R5bGUuY3NzVGV4dCA9IGBkaXNwbGF5OmZsZXg7Z2FwOjRweDtmb250LXNpemU6JHtGT05UX1NJWkUuYm9keX07YDtcblx0aWYgKHNlc3Npb24uaW5zZXJ0aW9ucyA+IDApIHtcblx0XHRjb25zdCBpbnMgPSBkb20uJCgnc3BhbicpO1xuXHRcdGlucy5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtY2hhcnRzLWdyZWVuKSc7XG5cdFx0aW5zLnRleHRDb250ZW50ID0gYCske3Nlc3Npb24uaW5zZXJ0aW9uc31gO1xuXHRcdHN0YXRzLmFwcGVuZChpbnMpO1xuXHR9XG5cdGlmIChzZXNzaW9uLmRlbGV0aW9ucyA+IDApIHtcblx0XHRjb25zdCBkZWwgPSBkb20uJCgnc3BhbicpO1xuXHRcdGRlbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZWRpdG9yRXJyb3ItZm9yZWdyb3VuZCknO1xuXHRcdGRlbC50ZXh0Q29udGVudCA9IGAtJHtzZXNzaW9uLmRlbGV0aW9uc31gO1xuXHRcdHN0YXRzLmFwcGVuZChkZWwpO1xuXHR9XG5cblx0Y29uc3QgYWN0aW9ucyA9IGRvbS4kKCdzcGFuJyk7XG5cdGFjdGlvbnMuc2V0QXR0cmlidXRlKCdkYXRhLXJvbGUnLCAnYWN0aW9ucycpO1xuXHRhY3Rpb25zLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpub25lO2dhcDo0cHg7YWxpZ24taXRlbXM6Y2VudGVyOyc7XG5cblx0aWYgKCFzZXNzaW9uLmlzSWRsZSkge1xuXHRcdGNvbnN0IHN0b3BCdG4gPSBob3Zlckljb24oJ2NvZGljb24tZGVidWctc3RvcCcsIGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zdG9wU2Vzc2lvbkFjdGlvbicsIFwiU3RvcCBzZXNzaW9uXCIpKTtcblx0XHRzdG9wQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IHN0b3BCdG4uc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWVkaXRvckVycm9yLWZvcmVncm91bmQpJzsgfSk7XG5cdFx0c3RvcEJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBzdG9wQnRuLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJzsgfSk7XG5cdFx0c3RvcEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgcHJvcHMub25TdG9wU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTsgfSk7XG5cdFx0YWN0aW9ucy5hcHBlbmQoc3RvcEJ0bik7XG5cdH1cblxuXHRhY3Rpb25zQ29udGFpbmVyLmFwcGVuZChzdGF0cywgYWN0aW9ucyk7XG5cdHJvdy5hcHBlbmQoYWN0aW9uc0NvbnRhaW5lcik7XG5cblx0Y29uc3Qgd3JhcHBlciA9IGRvbS4kKCdkaXYnKTtcblx0d3JhcHBlci5hcHBlbmQocm93KTtcblxuXHQvLyBUb29sIGNvbmZpcm1hdGlvblxuXHRpZiAoc2Vzc2lvbi50b29sQ29uZmlybWF0aW9uKSB7XG5cdFx0Y29uc3QgdGMgPSBzZXNzaW9uLnRvb2xDb25maXJtYXRpb247XG5cdFx0Y29uc3QgY29uZlJvdyA9IGRvbS4kKCdkaXYnKTtcblx0XHRjb25mUm93LnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6M3B4O3BhZGRpbmc6MnB4IDJweCA2cHggMTVweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS12c2NvZGUtcGFuZWwtYm9yZGVyKTsnO1xuXG5cdFx0Y29uc3QgY29uZkRlc2MgPSBkb20uJCgnc3BhbicpO1xuXHRcdGNvbmZEZXNjLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLmJvZHl9O2NvbG9yOnZhcigtLXZzY29kZS1lZGl0b3JXYXJuaW5nLWZvcmVncm91bmQpO2A7XG5cdFx0Y29uZkRlc2MudGV4dENvbnRlbnQgPSB0Yy5kZXNjcmlwdGlvbjtcblxuXHRcdGNvbnN0IGNvbmZCdG5zID0gZG9tLiQoJ2RpdicpO1xuXHRcdGNvbmZCdG5zLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2dhcDo2cHg7JztcblxuXHRcdGNvbnN0IGJ0blN0eWxlID0gYC13ZWJraXQtYXBwLXJlZ2lvbjpuby1kcmFnO2JvcmRlcjpub25lO2NvbG9yOnZhcigtLXZzY29kZS1idXR0b24tZm9yZWdyb3VuZCk7Zm9udC1zaXplOiR7Rk9OVF9TSVpFLmJvZHl9O3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjNweDtjdXJzb3I6cG9pbnRlcjtgO1xuXG5cdFx0aWYgKHRjLnR5cGUgPT09ICdhcHByb3ZhbCcpIHtcblx0XHRcdGNvbnN0IGFwcHJvdmVCdG4gPSBkb20uJCgnYnV0dG9uJyk7XG5cdFx0XHRhcHByb3ZlQnRuLnN0eWxlLmNzc1RleHQgPSBgJHtidG5TdHlsZX1iYWNrZ3JvdW5kOnZhcigtLXZzY29kZS1jaGFydHMtZ3JlZW4pO2A7XG5cdFx0XHRhcHByb3ZlQnRuLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFwcHJvdmUnLCBcIkFwcHJvdmVcIik7XG5cdFx0XHRhcHByb3ZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGMuYXBwcm92ZSgpKTtcblxuXHRcdFx0Y29uc3QgZGVueUJ0biA9IGRvbS4kKCdidXR0b24nKTtcblx0XHRcdGRlbnlCdG4uc3R5bGUuY3NzVGV4dCA9IGAke2J0blN0eWxlfWJhY2tncm91bmQ6dmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCYWNrZ3JvdW5kKTtjb2xvcjp2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCk7YDtcblx0XHRcdGRlbnlCdG4udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuZGVueScsIFwiRGVueVwiKTtcblx0XHRcdGRlbnlCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0Yy5kZW55KCkpO1xuXG5cdFx0XHRjb25zdCBzdG9wQnRuID0gZG9tLiQoJ2J1dHRvbicpO1xuXHRcdFx0c3RvcEJ0bi5zdHlsZS5jc3NUZXh0ID0gYCR7YnRuU3R5bGV9YmFja2dyb3VuZDp2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUJhY2tncm91bmQpO2NvbG9yOnZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKTtgO1xuXHRcdFx0c3RvcEJ0bi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zdG9wJywgXCJTdG9wXCIpO1xuXHRcdFx0c3RvcEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHByb3BzLm9uQ2FuY2VsU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKSk7XG5cblx0XHRcdGNvbmZCdG5zLmFwcGVuZChhcHByb3ZlQnRuLCBkZW55QnRuLCBzdG9wQnRuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgb3BlbkluVlNDb2RlID0gZG9tLiQoJ2J1dHRvbicpO1xuXHRcdFx0b3BlbkluVlNDb2RlLnN0eWxlLmNzc1RleHQgPSBgJHtidG5TdHlsZX1iYWNrZ3JvdW5kOnZhcigtLXZzY29kZS1idXR0b24tYmFja2dyb3VuZCk7YDtcblx0XHRcdG9wZW5JblZTQ29kZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5vcGVuSW5WU0NvZGUnLCBcIk9wZW4gaW4gVlMgQ29kZVwiKTtcblx0XHRcdG9wZW5JblZTQ29kZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHByb3BzLm9uT3BlblNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSkpO1xuXHRcdFx0Y29uZkJ0bnMuYXBwZW5kKG9wZW5JblZTQ29kZSk7XG5cdFx0fVxuXG5cdFx0Y29uZlJvdy5hcHBlbmQoY29uZkRlc2MsIGNvbmZCdG5zKTtcblx0XHR3cmFwcGVyLmFwcGVuZChjb25mUm93KTtcblx0fVxuXG5cdHJldHVybiB3cmFwcGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlc3Npb25MaXN0Q29tcG9uZW50IHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHVwZGF0ZShwcm9wczogU2Vzc2lvbkxpc3RQcm9wcyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uTGlzdCgpOiBTZXNzaW9uTGlzdENvbXBvbmVudCB7XG5cdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCdkaXYudm9pY2Utc2Vzc2lvbi1saXN0Jyk7XG5cdGNvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47bWluLWhlaWdodDo4NHB4O21heC1oZWlnaHQ6MzIwcHg7b3ZlcmZsb3cteTphdXRvO21hcmdpbjowIC0xNHB4IDAgMDtwYWRkaW5nLXJpZ2h0OjhweDsnO1xuXG5cdGNvbnN0IHN0eWxlID0gZG9tLiQoJ3N0eWxlJyk7XG5cdHN0eWxlLnRleHRDb250ZW50ID0gYFxuXHRcdEBrZXlmcmFtZXMgYWdlbnRzLXZvaWNlLXB1bHNlezAlLDEwMCV7b3BhY2l0eToxfTUwJXtvcGFjaXR5OjAuNH19XG5cdFx0LnZvaWNlLXNlc3Npb24tbGlzdDo6LXdlYmtpdC1zY3JvbGxiYXJ7d2lkdGg6NnB4O2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7fVxuXHRcdC52b2ljZS1zZXNzaW9uLWxpc3Q6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1ie2JhY2tncm91bmQ6dmFyKC0tdnNjb2RlLXNjcm9sbGJhclNsaWRlci1hY3RpdmVCYWNrZ3JvdW5kKTtib3JkZXItcmFkaXVzOjNweDt9XG5cdFx0LnZvaWNlLXNlc3Npb24tbGlzdDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWI6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS12c2NvZGUtc2Nyb2xsYmFyU2xpZGVyLWFjdGl2ZUJhY2tncm91bmQpO31cblx0XHQudm9pY2Utc2Vzc2lvbi1saXN0ID4gZGl2Omxhc3Qtb2YtdHlwZXtib3JkZXItYm90dG9tOm5vbmUgIWltcG9ydGFudDt9XG5cdGA7XG5cblx0cmV0dXJuIHtcblx0XHRlbGVtZW50OiBjb250YWluZXIsXG5cdFx0dXBkYXRlKHByb3BzOiBTZXNzaW9uTGlzdFByb3BzKSB7XG5cdFx0XHRkb20uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cblx0XHRcdGNvbnN0IGhhc0dyb3VwcyA9IHByb3BzLmdyb3VwcyAmJiBwcm9wcy5ncm91cHMubGVuZ3RoID4gMDtcblx0XHRcdGNvbnN0IGhhc1Nlc3Npb25zID0gcHJvcHMuc2Vzc2lvbnMubGVuZ3RoID4gMDtcblxuXHRcdFx0Ly8gSGVhZGVyIHJvd1xuXHRcdFx0Y29uc3QgaGVhZGVyUm93ID0gZG9tLiQoJ2RpdicpO1xuXHRcdFx0aGVhZGVyUm93LnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtwYWRkaW5nOjJweCAycHggNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JHcm91cC1ib3JkZXIpOyc7XG5cblx0XHRcdGNvbnN0IGhlYWRlckxhYmVsID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRcdGhlYWRlckxhYmVsLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLm1pY3JvfTtjb2xvcjp2YXIoLS12c2NvZGUtZGlzYWJsZWRGb3JlZ3JvdW5kKTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6MC41cHg7Zm9udC13ZWlnaHQ6NTAwO2A7XG5cdFx0XHRoZWFkZXJMYWJlbC50ZXh0Q29udGVudCA9IHByb3BzLnNlbGVjdGVkVGFyZ2V0ID8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNlbmRUbycsIFwiU2VuZCB0b1wiKSA6IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zZW5kVG9BY3RpdmUnLCBcIlNlbmQgdG8gKGFjdGl2ZSlcIik7XG5cblx0XHRcdGNvbnN0IGFkZEJ0biA9IGhvdmVySWNvbignY29kaWNvbi1hZGQnLCBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UubmV3U2Vzc2lvbicsIFwiTmV3IHNlc3Npb25cIikpO1xuXHRcdFx0YWRkQnRuLnRpdGxlID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLm5ld1Nlc3Npb24nLCBcIk5ldyBzZXNzaW9uXCIpO1xuXHRcdFx0YWRkQnRuLnN0eWxlLmNzc1RleHQgKz0gJ3BhZGRpbmc6MXB4IDJweDsnO1xuXHRcdFx0YWRkQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyBwcm9wcy5vbk5ld1Nlc3Npb24oKTsgfSk7XG5cblx0XHRcdGhlYWRlclJvdy5hcHBlbmQoaGVhZGVyTGFiZWwsIGFkZEJ0bik7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kKGhlYWRlclJvdyk7XG5cblx0XHRcdGlmICghaGFzR3JvdXBzICYmICFoYXNTZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBlbXB0eSA9IGRvbS4kKCdkaXYnKTtcblx0XHRcdFx0ZW1wdHkuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7aGVpZ2h0OjYwcHg7Jztcblx0XHRcdFx0Y29uc3QgZW1wdHlUZXh0ID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRcdFx0ZW1wdHlUZXh0LnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLmJvZHl9O2NvbG9yOnZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKTtgO1xuXHRcdFx0XHRlbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2Uubm9BY3RpdmVTZXNzaW9ucycsIFwiTm8gYWN0aXZlIHNlc3Npb25zXCIpO1xuXHRcdFx0XHRlbXB0eS5hcHBlbmQoZW1wdHlUZXh0KTtcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZChlbXB0eSk7XG5cdFx0XHR9IGVsc2UgaWYgKGhhc0dyb3Vwcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHByb3BzLmdyb3VwcyEpIHtcblx0XHRcdFx0XHRjb25zdCBncm91cEhlYWRlciA9IGRvbS4kKCdkaXYnKTtcblx0XHRcdFx0XHRncm91cEhlYWRlci5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6NHB4IDJweCAycHg7Jztcblx0XHRcdFx0XHRjb25zdCBncm91cExhYmVsID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRcdFx0XHRncm91cExhYmVsLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLm1pY3JvfTtjb2xvcjp2YXIoLS12c2NvZGUtZGlzYWJsZWRGb3JlZ3JvdW5kKTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6MC41cHg7Zm9udC13ZWlnaHQ6NTAwO2A7XG5cdFx0XHRcdFx0Z3JvdXBMYWJlbC50ZXh0Q29udGVudCA9IGdyb3VwLmxhYmVsO1xuXHRcdFx0XHRcdGdyb3VwSGVhZGVyLmFwcGVuZChncm91cExhYmVsKTtcblx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kKGdyb3VwSGVhZGVyKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBncm91cC5zZXNzaW9ucykge1xuXHRcdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZChjcmVhdGVTZXNzaW9uUm93KHNlc3Npb24sIHByb3BzKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgcHJvcHMuc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kKGNyZWF0ZVNlc3Npb25Sb3coc2Vzc2lvbiwgcHJvcHMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb250YWluZXIuYXBwZW5kKHN0eWxlKTtcblx0XHR9XG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxXQUFXLDZCQUE2QjtBQThCakQsU0FBUyxVQUFVLFdBQW1CLFdBQWdDO0FBQ3JFLFFBQU0sS0FBSyxJQUFJLEVBQUUsZ0JBQWdCLFNBQVMsRUFBRTtBQUM1QyxLQUFHLE9BQU87QUFDVixLQUFHLFdBQVc7QUFDZCxLQUFHLFlBQVk7QUFDZixLQUFHLE1BQU0sVUFBVSxhQUFhLFVBQVUsTUFBTTtBQUNoRCxLQUFHLGlCQUFpQixjQUFjLE1BQU07QUFBRSxPQUFHLE1BQU0sUUFBUTtBQUFBLEVBQTRCLENBQUM7QUFDeEYsS0FBRyxpQkFBaUIsY0FBYyxNQUFNO0FBQUUsT0FBRyxNQUFNLFFBQVE7QUFBQSxFQUF1QyxDQUFDO0FBQ25HLHdCQUFzQixFQUFFO0FBQ3hCLFNBQU87QUFDUjtBQUVBLFNBQVMsaUJBQWlCLFNBQXlCLE9BQXNDO0FBQ3hGLFFBQU0sYUFBYSxNQUFNLGdCQUFnQixTQUFTLE1BQU0sUUFBUSxTQUFTLFNBQVM7QUFDbEYsUUFBTSxXQUFXLFFBQVEsYUFBYSwyQ0FDbkMsUUFBUSxXQUFXLCtCQUNsQjtBQUNKLFFBQU0sb0JBQW9CLFFBQVEsYUFBYSxpREFBaUQ7QUFDaEcsUUFBTSxjQUFjLFFBQVEs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
