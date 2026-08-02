import { $ } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Button, ButtonBar, ButtonWithDescription, unthemedButtonStyles } from "../../../../base/browser/ui/button/button.js";
import { Toggle, Checkbox, unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { InputBox, MessageType, unthemedInboxStyles } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { defineComponentFixture, defineThemedFixtureGroup } from "./fixtureUtils.js";
var baseUI_fixture_default = defineThemedFixtureGroup({
  Buttons: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderButtons
  }),
  ButtonBar: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderButtonBar
  }),
  Toggles: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderToggles
  }),
  InputBoxes: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderInputBoxes
  }),
  CountBadges: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderCountBadges
  }),
  ActionBar: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderActionBar
  }),
  ProgressBars: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderProgressBars
  }),
  HighlightedLabels: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderHighlightedLabels
  })
});
const themedButtonStyles = {
  ...unthemedButtonStyles,
  buttonBackground: "var(--vscode-button-background)",
  buttonHoverBackground: "var(--vscode-button-hoverBackground)",
  buttonForeground: "var(--vscode-button-foreground)",
  buttonSecondaryBackground: "var(--vscode-button-secondaryBackground)",
  buttonSecondaryHoverBackground: "var(--vscode-button-secondaryHoverBackground)",
  buttonSecondaryForeground: "var(--vscode-button-secondaryForeground)",
  buttonBorder: "var(--vscode-button-border)"
};
const themedToggleStyles = {
  ...unthemedToggleStyles,
  inputActiveOptionBorder: "var(--vscode-inputOption-activeBorder)",
  inputActiveOptionForeground: "var(--vscode-inputOption-activeForeground)",
  inputActiveOptionBackground: "var(--vscode-inputOption-activeBackground)"
};
const themedCheckboxStyles = {
  checkboxBackground: "var(--vscode-checkbox-background)",
  checkboxBorder: "var(--vscode-checkbox-border)",
  checkboxForeground: "var(--vscode-checkbox-foreground)",
  checkboxDisabledBackground: void 0,
  checkboxDisabledForeground: void 0
};
const themedInputBoxStyles = {
  ...unthemedInboxStyles,
  inputBackground: "var(--vscode-input-background)",
  inputForeground: "var(--vscode-input-foreground)",
  inputBorder: "var(--vscode-input-border)",
  inputValidationInfoBackground: "var(--vscode-inputValidation-infoBackground)",
  inputValidationInfoBorder: "var(--vscode-inputValidation-infoBorder)",
  inputValidationWarningBackground: "var(--vscode-inputValidation-warningBackground)",
  inputValidationWarningBorder: "var(--vscode-inputValidation-warningBorder)",
  inputValidationErrorBackground: "var(--vscode-inputValidation-errorBackground)",
  inputValidationErrorBorder: "var(--vscode-inputValidation-errorBorder)"
};
const themedBadgeStyles = {
  badgeBackground: "var(--vscode-badge-background)",
  badgeForeground: "var(--vscode-badge-foreground)",
  badgeBorder: void 0
};
const themedProgressBarOptions = {
  progressBarBackground: "var(--vscode-progressBar-background)"
};
function renderButtons({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";
  const primarySection = $("div");
  primarySection.style.display = "flex";
  primarySection.style.gap = "8px";
  primarySection.style.alignItems = "center";
  container.appendChild(primarySection);
  const primaryButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: "Primary button" }));
  primaryButton.label = "Primary Button";
  const primaryIconButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: "With Icon", supportIcons: true }));
  primaryIconButton.label = "$(add) Add Item";
  const smallButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: "Small button", small: true }));
  smallButton.label = "Small";
  const secondarySection = $("div");
  secondarySection.style.display = "flex";
  secondarySection.style.gap = "8px";
  secondarySection.style.alignItems = "center";
  container.appendChild(secondarySection);
  const secondaryButton = disposableStore.add(new Button(secondarySection, { ...themedButtonStyles, secondary: true, title: "Secondary button" }));
  secondaryButton.label = "Secondary Button";
  const secondaryIconButton = disposableStore.add(new Button(secondarySection, { ...themedButtonStyles, secondary: true, title: "Cancel", supportIcons: true }));
  secondaryIconButton.label = "$(close) Cancel";
  const disabledSection = $("div");
  disabledSection.style.display = "flex";
  disabledSection.style.gap = "8px";
  disabledSection.style.alignItems = "center";
  container.appendChild(disabledSection);
  const disabledButton = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, title: "Disabled", disabled: true }));
  disabledButton.label = "Disabled";
  disabledButton.enabled = false;
  const disabledSecondary = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, secondary: true, title: "Disabled Secondary", disabled: true }));
  disabledSecondary.label = "Disabled Secondary";
  disabledSecondary.enabled = false;
}
function renderButtonBar({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  const barContainer = $("div");
  container.appendChild(barContainer);
  const buttonBar = new ButtonBar(barContainer);
  disposableStore.add(buttonBar);
  const okButton = buttonBar.addButton({ ...themedButtonStyles, title: "OK" });
  okButton.label = "OK";
  const cancelButton = buttonBar.addButton({ ...themedButtonStyles, secondary: true, title: "Cancel" });
  cancelButton.label = "Cancel";
  const descContainer = $("div");
  descContainer.style.width = "300px";
  container.appendChild(descContainer);
  const buttonWithDesc = disposableStore.add(new ButtonWithDescription(descContainer, { ...themedButtonStyles, title: "Install Extension", supportIcons: true }));
  buttonWithDesc.label = "$(extensions) Install Extension";
  buttonWithDesc.description = "This will install the extension and enable it globally";
}
function renderToggles({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";
  const toggleSection = $("div");
  toggleSection.style.display = "flex";
  toggleSection.style.gap = "16px";
  toggleSection.style.alignItems = "center";
  container.appendChild(toggleSection);
  const toggle1 = disposableStore.add(new Toggle({
    ...themedToggleStyles,
    title: "Case Sensitive",
    isChecked: false,
    icon: Codicon.caseSensitive
  }));
  toggleSection.appendChild(toggle1.domNode);
  const toggle2 = disposableStore.add(new Toggle({
    ...themedToggleStyles,
    title: "Whole Word",
    isChecked: true,
    icon: Codicon.wholeWord
  }));
  toggleSection.appendChild(toggle2.domNode);
  const toggle3 = disposableStore.add(new Toggle({
    ...themedToggleStyles,
    title: "Use Regular Expression",
    isChecked: false,
    icon: Codicon.regex
  }));
  toggleSection.appendChild(toggle3.domNode);
  const checkboxSection = $("div");
  checkboxSection.style.display = "flex";
  checkboxSection.style.flexDirection = "column";
  checkboxSection.style.gap = "8px";
  container.appendChild(checkboxSection);
  const createCheckboxRow = (label, checked) => {
    const row = $("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    const checkbox = disposableStore.add(new Checkbox(label, checked, themedCheckboxStyles));
    row.appendChild(checkbox.domNode);
    const labelEl = $("span");
    labelEl.textContent = label;
    labelEl.style.color = "var(--vscode-foreground)";
    row.appendChild(labelEl);
    return row;
  };
  checkboxSection.appendChild(createCheckboxRow("Enable auto-save", true));
  checkboxSection.appendChild(createCheckboxRow("Show line numbers", true));
  checkboxSection.appendChild(createCheckboxRow("Word wrap", false));
}
function renderInputBoxes({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  container.style.width = "350px";
  const filledInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "File path",
    inputBoxStyles: themedInputBoxStyles
  }));
  filledInput.value = "/src/vs/editor/browser";
  const infoInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "Username",
    inputBoxStyles: themedInputBoxStyles,
    validationOptions: {
      validation: (value) => value.length < 3 ? { content: "Username must be at least 3 characters", type: MessageType.INFO } : null
    }
  }));
  infoInput.value = "ab";
  infoInput.validate();
  const warningInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "Password",
    inputBoxStyles: themedInputBoxStyles,
    validationOptions: {
      validation: (value) => value.length < 8 ? { content: "Password should be at least 8 characters for security", type: MessageType.WARNING } : null
    }
  }));
  warningInput.value = "pass";
  warningInput.validate();
  const errorInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "Email address",
    inputBoxStyles: themedInputBoxStyles,
    validationOptions: {
      validation: (value) => !value.includes("@") ? { content: "Please enter a valid email address", type: MessageType.ERROR } : null
    }
  }));
  errorInput.value = "invalid-email";
  errorInput.validate();
}
function renderCountBadges({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.gap = "12px";
  container.style.alignItems = "center";
  const counts = [1, 5, 12, 99, 999];
  for (const count of counts) {
    const badgeContainer = $("div");
    badgeContainer.style.display = "flex";
    badgeContainer.style.alignItems = "center";
    badgeContainer.style.gap = "8px";
    const label = $("span");
    label.textContent = "Issues";
    label.style.color = "var(--vscode-foreground)";
    badgeContainer.appendChild(label);
    disposableStore.add(new CountBadge(badgeContainer, { count }, themedBadgeStyles));
    container.appendChild(badgeContainer);
  }
}
function renderActionBar({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  const horizontalLabel = $("div");
  horizontalLabel.textContent = "Horizontal Actions:";
  horizontalLabel.style.color = "var(--vscode-foreground)";
  horizontalLabel.style.marginBottom = "4px";
  container.appendChild(horizontalLabel);
  const horizontalContainer = $("div");
  container.appendChild(horizontalContainer);
  const horizontalBar = disposableStore.add(new ActionBar(horizontalContainer, {
    ariaLabel: "Editor Actions"
  }));
  horizontalBar.push([
    disposableStore.add(new Action("editor.action.save", "Save", ThemeIcon.asClassName(Codicon.save), true, async () => console.log("Save"))),
    disposableStore.add(new Action("editor.action.undo", "Undo", ThemeIcon.asClassName(Codicon.discard), true, async () => console.log("Undo"))),
    disposableStore.add(new Action("editor.action.redo", "Redo", ThemeIcon.asClassName(Codicon.redo), true, async () => console.log("Redo"))),
    new Separator(),
    disposableStore.add(new Action("editor.action.find", "Find", ThemeIcon.asClassName(Codicon.search), true, async () => console.log("Find"))),
    disposableStore.add(new Action("editor.action.replace", "Replace", ThemeIcon.asClassName(Codicon.replaceAll), true, async () => console.log("Replace")))
  ]);
  const mixedLabel = $("div");
  mixedLabel.textContent = "Mixed States:";
  mixedLabel.style.color = "var(--vscode-foreground)";
  mixedLabel.style.marginBottom = "4px";
  container.appendChild(mixedLabel);
  const mixedContainer = $("div");
  container.appendChild(mixedContainer);
  const mixedBar = disposableStore.add(new ActionBar(mixedContainer, {
    ariaLabel: "Mixed Actions"
  }));
  mixedBar.push([
    disposableStore.add(new Action("action.enabled", "Enabled", ThemeIcon.asClassName(Codicon.play), true, async () => {
    })),
    disposableStore.add(new Action("action.disabled", "Disabled", ThemeIcon.asClassName(Codicon.debugPause), false, async () => {
    })),
    disposableStore.add(new Action("action.enabled2", "Enabled", ThemeIcon.asClassName(Codicon.debugStop), true, async () => {
    }))
  ]);
}
function renderProgressBars({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "24px";
  container.style.width = "400px";
  const createSection = (label) => {
    const section = $("div");
    const labelEl = $("div");
    labelEl.textContent = label;
    labelEl.style.color = "var(--vscode-foreground)";
    labelEl.style.marginBottom = "8px";
    labelEl.style.fontSize = "12px";
    section.appendChild(labelEl);
    const barContainer = $("div");
    barContainer.style.position = "relative";
    barContainer.style.width = "100%";
    barContainer.style.height = "4px";
    barContainer.style.overflow = "hidden";
    section.appendChild(barContainer);
    container.appendChild(section);
    return barContainer;
  };
  const progress30Section = createSection("Discrete Progress - 30%");
  const progress30Bar = disposableStore.add(new ProgressBar(progress30Section, themedProgressBarOptions));
  progress30Bar.total(100);
  progress30Bar.worked(30);
  const progress60Section = createSection("Discrete Progress - 60%");
  const progress60Bar = disposableStore.add(new ProgressBar(progress60Section, themedProgressBarOptions));
  progress60Bar.total(100);
  progress60Bar.worked(60);
  const progress90Section = createSection("Discrete Progress - 90%");
  const progress90Bar = disposableStore.add(new ProgressBar(progress90Section, themedProgressBarOptions));
  progress90Bar.total(100);
  progress90Bar.worked(90);
  const doneSection = createSection("Completed (100%)");
  const doneBar = disposableStore.add(new ProgressBar(doneSection, themedProgressBarOptions));
  doneBar.total(100);
  doneBar.worked(100);
}
function renderHighlightedLabels({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "8px";
  container.style.color = "var(--vscode-foreground)";
  const createHighlightedLabel = (text, highlights) => {
    const row = $("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    const labelContainer = $("div");
    const label = disposableStore.add(new HighlightedLabel(labelContainer));
    label.set(text, highlights);
    row.appendChild(labelContainer);
    const queryLabel = $("span");
    queryLabel.style.color = "var(--vscode-descriptionForeground)";
    queryLabel.style.fontSize = "12px";
    queryLabel.textContent = `(matches highlighted)`;
    row.appendChild(queryLabel);
    return row;
  };
  container.appendChild(createHighlightedLabel("codeEditorWidget.ts", [{ start: 0, end: 4 }]));
  container.appendChild(createHighlightedLabel("inlineCompletionsController.ts", [{ start: 6, end: 10 }]));
  container.appendChild(createHighlightedLabel("diffEditorViewModel.ts", [{ start: 0, end: 4 }, { start: 10, end: 14 }]));
  container.appendChild(createHighlightedLabel("workbenchTestServices.ts", [{ start: 9, end: 13 }]));
}
export {
  baseUI_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvYmFzZVVJLmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5cbi8vIFVJIENvbXBvbmVudHNcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uQmFyLCBCdXR0b25XaXRoRGVzY3JpcHRpb24sIHVudGhlbWVkQnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgVG9nZ2xlLCBDaGVja2JveCwgdW50aGVtZWRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCwgTWVzc2FnZVR5cGUsIHVudGhlbWVkSW5ib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuXG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi9maXh0dXJlVXRpbHMuanMnO1xuXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7XG5cdEJ1dHRvbnM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlckJ1dHRvbnMsXG5cdH0pLFxuXG5cdEJ1dHRvbkJhcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVyQnV0dG9uQmFyLFxuXHR9KSxcblxuXHRUb2dnbGVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJUb2dnbGVzLFxuXHR9KSxcblxuXHRJbnB1dEJveGVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJJbnB1dEJveGVzLFxuXHR9KSxcblxuXHRDb3VudEJhZGdlczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVyQ291bnRCYWRnZXMsXG5cdH0pLFxuXG5cdEFjdGlvbkJhcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVyQWN0aW9uQmFyLFxuXHR9KSxcblxuXHRQcm9ncmVzc0JhcnM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlclByb2dyZXNzQmFycyxcblx0fSksXG5cblx0SGlnaGxpZ2h0ZWRMYWJlbHM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlckhpZ2hsaWdodGVkTGFiZWxzLFxuXHR9KSxcbn0pO1xuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFN0eWxlcyAodGhlbWVkIHZlcnNpb25zIGZvciBmaXh0dXJlIGRpc3BsYXkpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNvbnN0IHRoZW1lZEJ1dHRvblN0eWxlcyA9IHtcblx0Li4udW50aGVtZWRCdXR0b25TdHlsZXMsXG5cdGJ1dHRvbkJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtYnV0dG9uLWJhY2tncm91bmQpJyxcblx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1ob3ZlckJhY2tncm91bmQpJyxcblx0YnV0dG9uRm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tZm9yZWdyb3VuZCknLFxuXHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCYWNrZ3JvdW5kKScsXG5cdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kKScsXG5cdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUZvcmVncm91bmQpJyxcblx0YnV0dG9uQm9yZGVyOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1ib3JkZXIpJyxcbn07XG5cbmNvbnN0IHRoZW1lZFRvZ2dsZVN0eWxlcyA9IHtcblx0Li4udW50aGVtZWRUb2dnbGVTdHlsZXMsXG5cdGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiAndmFyKC0tdnNjb2RlLWlucHV0T3B0aW9uLWFjdGl2ZUJvcmRlciknLFxuXHRpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtaW5wdXRPcHRpb24tYWN0aXZlRm9yZWdyb3VuZCknLFxuXHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtaW5wdXRPcHRpb24tYWN0aXZlQmFja2dyb3VuZCknLFxufTtcblxuY29uc3QgdGhlbWVkQ2hlY2tib3hTdHlsZXMgPSB7XG5cdGNoZWNrYm94QmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1jaGVja2JveC1iYWNrZ3JvdW5kKScsXG5cdGNoZWNrYm94Qm9yZGVyOiAndmFyKC0tdnNjb2RlLWNoZWNrYm94LWJvcmRlciknLFxuXHRjaGVja2JveEZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtY2hlY2tib3gtZm9yZWdyb3VuZCknLFxuXHRjaGVja2JveERpc2FibGVkQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRjaGVja2JveERpc2FibGVkRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxufTtcblxuY29uc3QgdGhlbWVkSW5wdXRCb3hTdHlsZXMgPSB7XG5cdC4uLnVudGhlbWVkSW5ib3hTdHlsZXMsXG5cdGlucHV0QmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dC1iYWNrZ3JvdW5kKScsXG5cdGlucHV0Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dC1mb3JlZ3JvdW5kKScsXG5cdGlucHV0Qm9yZGVyOiAndmFyKC0tdnNjb2RlLWlucHV0LWJvcmRlciknLFxuXHRpbnB1dFZhbGlkYXRpb25JbmZvQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24taW5mb0JhY2tncm91bmQpJyxcblx0aW5wdXRWYWxpZGF0aW9uSW5mb0JvcmRlcjogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24taW5mb0JvcmRlciknLFxuXHRpbnB1dFZhbGlkYXRpb25XYXJuaW5nQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24td2FybmluZ0JhY2tncm91bmQpJyxcblx0aW5wdXRWYWxpZGF0aW9uV2FybmluZ0JvcmRlcjogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24td2FybmluZ0JvcmRlciknLFxuXHRpbnB1dFZhbGlkYXRpb25FcnJvckJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtaW5wdXRWYWxpZGF0aW9uLWVycm9yQmFja2dyb3VuZCknLFxuXHRpbnB1dFZhbGlkYXRpb25FcnJvckJvcmRlcjogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24tZXJyb3JCb3JkZXIpJyxcbn07XG5cbmNvbnN0IHRoZW1lZEJhZGdlU3R5bGVzID0ge1xuXHRiYWRnZUJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtYmFkZ2UtYmFja2dyb3VuZCknLFxuXHRiYWRnZUZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtYmFkZ2UtZm9yZWdyb3VuZCknLFxuXHRiYWRnZUJvcmRlcjogdW5kZWZpbmVkLFxufTtcblxuY29uc3QgdGhlbWVkUHJvZ3Jlc3NCYXJPcHRpb25zID0ge1xuXHRwcm9ncmVzc0JhckJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtcHJvZ3Jlc3NCYXItYmFja2dyb3VuZCknLFxufTtcblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCdXR0b25zXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlckJ1dHRvbnMoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnMTJweCc7XG5cblx0Ly8gU2VjdGlvbjogUHJpbWFyeSBCdXR0b25zXG5cdGNvbnN0IHByaW1hcnlTZWN0aW9uID0gJCgnZGl2Jyk7XG5cdHByaW1hcnlTZWN0aW9uLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdHByaW1hcnlTZWN0aW9uLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRwcmltYXJ5U2VjdGlvbi5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChwcmltYXJ5U2VjdGlvbik7XG5cblx0Y29uc3QgcHJpbWFyeUJ1dHRvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihwcmltYXJ5U2VjdGlvbiwgeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHRpdGxlOiAnUHJpbWFyeSBidXR0b24nIH0pKTtcblx0cHJpbWFyeUJ1dHRvbi5sYWJlbCA9ICdQcmltYXJ5IEJ1dHRvbic7XG5cblx0Y29uc3QgcHJpbWFyeUljb25CdXR0b24gPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBCdXR0b24ocHJpbWFyeVNlY3Rpb24sIHsgLi4udGhlbWVkQnV0dG9uU3R5bGVzLCB0aXRsZTogJ1dpdGggSWNvbicsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdHByaW1hcnlJY29uQnV0dG9uLmxhYmVsID0gJyQoYWRkKSBBZGQgSXRlbSc7XG5cblx0Y29uc3Qgc21hbGxCdXR0b24gPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBCdXR0b24ocHJpbWFyeVNlY3Rpb24sIHsgLi4udGhlbWVkQnV0dG9uU3R5bGVzLCB0aXRsZTogJ1NtYWxsIGJ1dHRvbicsIHNtYWxsOiB0cnVlIH0pKTtcblx0c21hbGxCdXR0b24ubGFiZWwgPSAnU21hbGwnO1xuXG5cdC8vIFNlY3Rpb246IFNlY29uZGFyeSBCdXR0b25zXG5cdGNvbnN0IHNlY29uZGFyeVNlY3Rpb24gPSAkKCdkaXYnKTtcblx0c2Vjb25kYXJ5U2VjdGlvbi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRzZWNvbmRhcnlTZWN0aW9uLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRzZWNvbmRhcnlTZWN0aW9uLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNlY29uZGFyeVNlY3Rpb24pO1xuXG5cdGNvbnN0IHNlY29uZGFyeUJ1dHRvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihzZWNvbmRhcnlTZWN0aW9uLCB7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCB0aXRsZTogJ1NlY29uZGFyeSBidXR0b24nIH0pKTtcblx0c2Vjb25kYXJ5QnV0dG9uLmxhYmVsID0gJ1NlY29uZGFyeSBCdXR0b24nO1xuXG5cdGNvbnN0IHNlY29uZGFyeUljb25CdXR0b24gPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBCdXR0b24oc2Vjb25kYXJ5U2VjdGlvbiwgeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgdGl0bGU6ICdDYW5jZWwnLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRzZWNvbmRhcnlJY29uQnV0dG9uLmxhYmVsID0gJyQoY2xvc2UpIENhbmNlbCc7XG5cblx0Ly8gU2VjdGlvbjogRGlzYWJsZWQgQnV0dG9uc1xuXHRjb25zdCBkaXNhYmxlZFNlY3Rpb24gPSAkKCdkaXYnKTtcblx0ZGlzYWJsZWRTZWN0aW9uLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGRpc2FibGVkU2VjdGlvbi5zdHlsZS5nYXAgPSAnOHB4Jztcblx0ZGlzYWJsZWRTZWN0aW9uLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRpc2FibGVkU2VjdGlvbik7XG5cblx0Y29uc3QgZGlzYWJsZWRCdXR0b24gPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBCdXR0b24oZGlzYWJsZWRTZWN0aW9uLCB7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgdGl0bGU6ICdEaXNhYmxlZCcsIGRpc2FibGVkOiB0cnVlIH0pKTtcblx0ZGlzYWJsZWRCdXR0b24ubGFiZWwgPSAnRGlzYWJsZWQnO1xuXHRkaXNhYmxlZEJ1dHRvbi5lbmFibGVkID0gZmFsc2U7XG5cblx0Y29uc3QgZGlzYWJsZWRTZWNvbmRhcnkgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBCdXR0b24oZGlzYWJsZWRTZWN0aW9uLCB7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCB0aXRsZTogJ0Rpc2FibGVkIFNlY29uZGFyeScsIGRpc2FibGVkOiB0cnVlIH0pKTtcblx0ZGlzYWJsZWRTZWNvbmRhcnkubGFiZWwgPSAnRGlzYWJsZWQgU2Vjb25kYXJ5Jztcblx0ZGlzYWJsZWRTZWNvbmRhcnkuZW5hYmxlZCA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJCdXR0b25CYXIoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnMTZweCc7XG5cblx0Ly8gQnV0dG9uIEJhclxuXHRjb25zdCBiYXJDb250YWluZXIgPSAkKCdkaXYnKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGJhckNvbnRhaW5lcik7XG5cblx0Y29uc3QgYnV0dG9uQmFyID0gbmV3IEJ1dHRvbkJhcihiYXJDb250YWluZXIpO1xuXHRkaXNwb3NhYmxlU3RvcmUuYWRkKGJ1dHRvbkJhcik7XG5cblx0Y29uc3Qgb2tCdXR0b24gPSBidXR0b25CYXIuYWRkQnV0dG9uKHsgLi4udGhlbWVkQnV0dG9uU3R5bGVzLCB0aXRsZTogJ09LJyB9KTtcblx0b2tCdXR0b24ubGFiZWwgPSAnT0snO1xuXG5cdGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbkJhci5hZGRCdXR0b24oeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgdGl0bGU6ICdDYW5jZWwnIH0pO1xuXHRjYW5jZWxCdXR0b24ubGFiZWwgPSAnQ2FuY2VsJztcblxuXHQvLyBCdXR0b24gd2l0aCBEZXNjcmlwdGlvblxuXHRjb25zdCBkZXNjQ29udGFpbmVyID0gJCgnZGl2Jyk7XG5cdGRlc2NDb250YWluZXIuc3R5bGUud2lkdGggPSAnMzAwcHgnO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZGVzY0NvbnRhaW5lcik7XG5cblx0Y29uc3QgYnV0dG9uV2l0aERlc2MgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBCdXR0b25XaXRoRGVzY3JpcHRpb24oZGVzY0NvbnRhaW5lciwgeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHRpdGxlOiAnSW5zdGFsbCBFeHRlbnNpb24nLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRidXR0b25XaXRoRGVzYy5sYWJlbCA9ICckKGV4dGVuc2lvbnMpIEluc3RhbGwgRXh0ZW5zaW9uJztcblx0YnV0dG9uV2l0aERlc2MuZGVzY3JpcHRpb24gPSAnVGhpcyB3aWxsIGluc3RhbGwgdGhlIGV4dGVuc2lvbiBhbmQgZW5hYmxlIGl0IGdsb2JhbGx5Jztcbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUb2dnbGVzIGFuZCBDaGVja2JveGVzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlclRvZ2dsZXMoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnMTJweCc7XG5cblx0Ly8gVG9nZ2xlc1xuXHRjb25zdCB0b2dnbGVTZWN0aW9uID0gJCgnZGl2Jyk7XG5cdHRvZ2dsZVNlY3Rpb24uc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0dG9nZ2xlU2VjdGlvbi5zdHlsZS5nYXAgPSAnMTZweCc7XG5cdHRvZ2dsZVNlY3Rpb24uc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQodG9nZ2xlU2VjdGlvbik7XG5cblx0Y29uc3QgdG9nZ2xlMSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFRvZ2dsZSh7XG5cdFx0Li4udGhlbWVkVG9nZ2xlU3R5bGVzLFxuXHRcdHRpdGxlOiAnQ2FzZSBTZW5zaXRpdmUnLFxuXHRcdGlzQ2hlY2tlZDogZmFsc2UsXG5cdFx0aWNvbjogQ29kaWNvbi5jYXNlU2Vuc2l0aXZlLFxuXHR9KSk7XG5cdHRvZ2dsZVNlY3Rpb24uYXBwZW5kQ2hpbGQodG9nZ2xlMS5kb21Ob2RlKTtcblxuXHRjb25zdCB0b2dnbGUyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVG9nZ2xlKHtcblx0XHQuLi50aGVtZWRUb2dnbGVTdHlsZXMsXG5cdFx0dGl0bGU6ICdXaG9sZSBXb3JkJyxcblx0XHRpc0NoZWNrZWQ6IHRydWUsXG5cdFx0aWNvbjogQ29kaWNvbi53aG9sZVdvcmQsXG5cdH0pKTtcblx0dG9nZ2xlU2VjdGlvbi5hcHBlbmRDaGlsZCh0b2dnbGUyLmRvbU5vZGUpO1xuXG5cdGNvbnN0IHRvZ2dsZTMgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBUb2dnbGUoe1xuXHRcdC4uLnRoZW1lZFRvZ2dsZVN0eWxlcyxcblx0XHR0aXRsZTogJ1VzZSBSZWd1bGFyIEV4cHJlc3Npb24nLFxuXHRcdGlzQ2hlY2tlZDogZmFsc2UsXG5cdFx0aWNvbjogQ29kaWNvbi5yZWdleCxcblx0fSkpO1xuXHR0b2dnbGVTZWN0aW9uLmFwcGVuZENoaWxkKHRvZ2dsZTMuZG9tTm9kZSk7XG5cblx0Ly8gQ2hlY2tib3hlc1xuXHRjb25zdCBjaGVja2JveFNlY3Rpb24gPSAkKCdkaXYnKTtcblx0Y2hlY2tib3hTZWN0aW9uLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNoZWNrYm94U2VjdGlvbi5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdGNoZWNrYm94U2VjdGlvbi5zdHlsZS5nYXAgPSAnOHB4Jztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNoZWNrYm94U2VjdGlvbik7XG5cblx0Y29uc3QgY3JlYXRlQ2hlY2tib3hSb3cgPSAobGFiZWw6IHN0cmluZywgY2hlY2tlZDogYm9vbGVhbikgPT4ge1xuXHRcdGNvbnN0IHJvdyA9ICQoJ2RpdicpO1xuXHRcdHJvdy5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdHJvdy5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cdFx0cm93LnN0eWxlLmdhcCA9ICc4cHgnO1xuXG5cdFx0Y29uc3QgY2hlY2tib3ggPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBDaGVja2JveChsYWJlbCwgY2hlY2tlZCwgdGhlbWVkQ2hlY2tib3hTdHlsZXMpKTtcblx0XHRyb3cuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRjb25zdCBsYWJlbEVsID0gJCgnc3BhbicpO1xuXHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRsYWJlbEVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdFx0cm93LmFwcGVuZENoaWxkKGxhYmVsRWwpO1xuXG5cdFx0cmV0dXJuIHJvdztcblx0fTtcblxuXHRjaGVja2JveFNlY3Rpb24uYXBwZW5kQ2hpbGQoY3JlYXRlQ2hlY2tib3hSb3coJ0VuYWJsZSBhdXRvLXNhdmUnLCB0cnVlKSk7XG5cdGNoZWNrYm94U2VjdGlvbi5hcHBlbmRDaGlsZChjcmVhdGVDaGVja2JveFJvdygnU2hvdyBsaW5lIG51bWJlcnMnLCB0cnVlKSk7XG5cdGNoZWNrYm94U2VjdGlvbi5hcHBlbmRDaGlsZChjcmVhdGVDaGVja2JveFJvdygnV29yZCB3cmFwJywgZmFsc2UpKTtcbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBJbnB1dCBCb3hlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiByZW5kZXJJbnB1dEJveGVzKHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLnBhZGRpbmcgPSAnMTZweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRjb250YWluZXIuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRjb250YWluZXIuc3R5bGUuZ2FwID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnMzUwcHgnO1xuXG5cdC8vIElucHV0IHdpdGggdmFsdWVcblx0Y29uc3QgZmlsbGVkSW5wdXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbnB1dEJveChjb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdHBsYWNlaG9sZGVyOiAnRmlsZSBwYXRoJyxcblx0XHRpbnB1dEJveFN0eWxlczogdGhlbWVkSW5wdXRCb3hTdHlsZXMsXG5cdH0pKTtcblx0ZmlsbGVkSW5wdXQudmFsdWUgPSAnL3NyYy92cy9lZGl0b3IvYnJvd3Nlcic7XG5cblx0Ly8gSW5wdXQgd2l0aCBpbmZvIHZhbGlkYXRpb25cblx0Y29uc3QgaW5mb0lucHV0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgSW5wdXRCb3goY29udGFpbmVyLCB1bmRlZmluZWQsIHtcblx0XHRwbGFjZWhvbGRlcjogJ1VzZXJuYW1lJyxcblx0XHRpbnB1dEJveFN0eWxlczogdGhlbWVkSW5wdXRCb3hTdHlsZXMsXG5cdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHtcblx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoIDwgMyA/IHsgY29udGVudDogJ1VzZXJuYW1lIG11c3QgYmUgYXQgbGVhc3QgMyBjaGFyYWN0ZXJzJywgdHlwZTogTWVzc2FnZVR5cGUuSU5GTyB9IDogbnVsbFxuXHRcdH1cblx0fSkpO1xuXHRpbmZvSW5wdXQudmFsdWUgPSAnYWInO1xuXHRpbmZvSW5wdXQudmFsaWRhdGUoKTtcblxuXHQvLyBJbnB1dCB3aXRoIHdhcm5pbmcgdmFsaWRhdGlvblxuXHRjb25zdCB3YXJuaW5nSW5wdXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbnB1dEJveChjb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdHBsYWNlaG9sZGVyOiAnUGFzc3dvcmQnLFxuXHRcdGlucHV0Qm94U3R5bGVzOiB0aGVtZWRJbnB1dEJveFN0eWxlcyxcblx0XHR2YWxpZGF0aW9uT3B0aW9uczoge1xuXHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPCA4ID8geyBjb250ZW50OiAnUGFzc3dvcmQgc2hvdWxkIGJlIGF0IGxlYXN0IDggY2hhcmFjdGVycyBmb3Igc2VjdXJpdHknLCB0eXBlOiBNZXNzYWdlVHlwZS5XQVJOSU5HIH0gOiBudWxsXG5cdFx0fVxuXHR9KSk7XG5cdHdhcm5pbmdJbnB1dC52YWx1ZSA9ICdwYXNzJztcblx0d2FybmluZ0lucHV0LnZhbGlkYXRlKCk7XG5cblx0Ly8gSW5wdXQgd2l0aCBlcnJvciB2YWxpZGF0aW9uXG5cdGNvbnN0IGVycm9ySW5wdXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbnB1dEJveChjb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdHBsYWNlaG9sZGVyOiAnRW1haWwgYWRkcmVzcycsXG5cdFx0aW5wdXRCb3hTdHlsZXM6IHRoZW1lZElucHV0Qm94U3R5bGVzLFxuXHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHR2YWxpZGF0aW9uOiAodmFsdWUpID0+ICF2YWx1ZS5pbmNsdWRlcygnQCcpID8geyBjb250ZW50OiAnUGxlYXNlIGVudGVyIGEgdmFsaWQgZW1haWwgYWRkcmVzcycsIHR5cGU6IE1lc3NhZ2VUeXBlLkVSUk9SIH0gOiBudWxsXG5cdFx0fVxuXHR9KSk7XG5cdGVycm9ySW5wdXQudmFsdWUgPSAnaW52YWxpZC1lbWFpbCc7XG5cdGVycm9ySW5wdXQudmFsaWRhdGUoKTtcbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDb3VudCBCYWRnZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gcmVuZGVyQ291bnRCYWRnZXMoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnMTJweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cblx0Ly8gVmFyaW91cyBiYWRnZSBjb3VudHNcblx0Y29uc3QgY291bnRzID0gWzEsIDUsIDEyLCA5OSwgOTk5XTtcblxuXHRmb3IgKGNvbnN0IGNvdW50IG9mIGNvdW50cykge1xuXHRcdGNvbnN0IGJhZGdlQ29udGFpbmVyID0gJCgnZGl2Jyk7XG5cdFx0YmFkZ2VDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRiYWRnZUNvbnRhaW5lci5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cdFx0YmFkZ2VDb250YWluZXIuc3R5bGUuZ2FwID0gJzhweCc7XG5cblx0XHRjb25zdCBsYWJlbCA9ICQoJ3NwYW4nKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9ICdJc3N1ZXMnO1xuXHRcdGxhYmVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdFx0YmFkZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQ291bnRCYWRnZShiYWRnZUNvbnRhaW5lciwgeyBjb3VudCB9LCB0aGVtZWRCYWRnZVN0eWxlcykpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChiYWRnZUNvbnRhaW5lcik7XG5cdH1cbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBBY3Rpb24gQmFyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlckFjdGlvbkJhcih7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICcxNnB4JztcblxuXHQvLyBIb3Jpem9udGFsIGFjdGlvbiBiYXJcblx0Y29uc3QgaG9yaXpvbnRhbExhYmVsID0gJCgnZGl2Jyk7XG5cdGhvcml6b250YWxMYWJlbC50ZXh0Q29udGVudCA9ICdIb3Jpem9udGFsIEFjdGlvbnM6Jztcblx0aG9yaXpvbnRhbExhYmVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdGhvcml6b250YWxMYWJlbC5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnNHB4Jztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGhvcml6b250YWxMYWJlbCk7XG5cblx0Y29uc3QgaG9yaXpvbnRhbENvbnRhaW5lciA9ICQoJ2RpdicpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaG9yaXpvbnRhbENvbnRhaW5lcik7XG5cblx0Y29uc3QgaG9yaXpvbnRhbEJhciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbkJhcihob3Jpem9udGFsQ29udGFpbmVyLCB7XG5cdFx0YXJpYUxhYmVsOiAnRWRpdG9yIEFjdGlvbnMnLFxuXHR9KSk7XG5cblx0aG9yaXpvbnRhbEJhci5wdXNoKFtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2VkaXRvci5hY3Rpb24uc2F2ZScsICdTYXZlJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc2F2ZSksIHRydWUsIGFzeW5jICgpID0+IGNvbnNvbGUubG9nKCdTYXZlJykpKSxcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2VkaXRvci5hY3Rpb24udW5kbycsICdVbmRvJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGlzY2FyZCksIHRydWUsIGFzeW5jICgpID0+IGNvbnNvbGUubG9nKCdVbmRvJykpKSxcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2VkaXRvci5hY3Rpb24ucmVkbycsICdSZWRvJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucmVkbyksIHRydWUsIGFzeW5jICgpID0+IGNvbnNvbGUubG9nKCdSZWRvJykpKSxcblx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKCdlZGl0b3IuYWN0aW9uLmZpbmQnLCAnRmluZCcsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNlYXJjaCksIHRydWUsIGFzeW5jICgpID0+IGNvbnNvbGUubG9nKCdGaW5kJykpKSxcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2VkaXRvci5hY3Rpb24ucmVwbGFjZScsICdSZXBsYWNlJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucmVwbGFjZUFsbCksIHRydWUsIGFzeW5jICgpID0+IGNvbnNvbGUubG9nKCdSZXBsYWNlJykpKSxcblx0XSk7XG5cblx0Ly8gQWN0aW9uIGJhciB3aXRoIGRpc2FibGVkIGl0ZW1zXG5cdGNvbnN0IG1peGVkTGFiZWwgPSAkKCdkaXYnKTtcblx0bWl4ZWRMYWJlbC50ZXh0Q29udGVudCA9ICdNaXhlZCBTdGF0ZXM6Jztcblx0bWl4ZWRMYWJlbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRtaXhlZExhYmVsLnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc0cHgnO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQobWl4ZWRMYWJlbCk7XG5cblx0Y29uc3QgbWl4ZWRDb250YWluZXIgPSAkKCdkaXYnKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKG1peGVkQ29udGFpbmVyKTtcblxuXHRjb25zdCBtaXhlZEJhciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbkJhcihtaXhlZENvbnRhaW5lciwge1xuXHRcdGFyaWFMYWJlbDogJ01peGVkIEFjdGlvbnMnLFxuXHR9KSk7XG5cblx0bWl4ZWRCYXIucHVzaChbXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKCdhY3Rpb24uZW5hYmxlZCcsICdFbmFibGVkJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucGxheSksIHRydWUsIGFzeW5jICgpID0+IHsgfSkpLFxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignYWN0aW9uLmRpc2FibGVkJywgJ0Rpc2FibGVkJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGVidWdQYXVzZSksIGZhbHNlLCBhc3luYyAoKSA9PiB7IH0pKSxcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2FjdGlvbi5lbmFibGVkMicsICdFbmFibGVkJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGVidWdTdG9wKSwgdHJ1ZSwgYXN5bmMgKCkgPT4geyB9KSksXG5cdF0pO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFByb2dyZXNzIEJhclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiByZW5kZXJQcm9ncmVzc0JhcnMoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnMjRweCc7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc0MDBweCc7XG5cblx0Y29uc3QgY3JlYXRlU2VjdGlvbiA9IChsYWJlbDogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9ICQoJ2RpdicpO1xuXHRcdGNvbnN0IGxhYmVsRWwgPSAkKCdkaXYnKTtcblx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0bGFiZWxFbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRcdGxhYmVsRWwuc3R5bGUubWFyZ2luQm90dG9tID0gJzhweCc7XG5cdFx0bGFiZWxFbC5zdHlsZS5mb250U2l6ZSA9ICcxMnB4Jztcblx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGxhYmVsRWwpO1xuXG5cdFx0Ly8gUHJvZ3Jlc3MgYmFyIGNvbnRhaW5lciB3aXRoIHByb3BlciBjb25zdHJhaW50c1xuXHRcdGNvbnN0IGJhckNvbnRhaW5lciA9ICQoJ2RpdicpO1xuXHRcdGJhckNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0YmFyQ29udGFpbmVyLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdGJhckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnNHB4Jztcblx0XHRiYXJDb250YWluZXIuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGJhckNvbnRhaW5lcik7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2VjdGlvbik7XG5cdFx0cmV0dXJuIGJhckNvbnRhaW5lcjtcblx0fTtcblxuXHQvLyBEaXNjcmV0ZSBwcm9ncmVzcyAtIDMwJVxuXHRjb25zdCBwcm9ncmVzczMwU2VjdGlvbiA9IGNyZWF0ZVNlY3Rpb24oJ0Rpc2NyZXRlIFByb2dyZXNzIC0gMzAlJyk7XG5cdGNvbnN0IHByb2dyZXNzMzBCYXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBQcm9ncmVzc0Jhcihwcm9ncmVzczMwU2VjdGlvbiwgdGhlbWVkUHJvZ3Jlc3NCYXJPcHRpb25zKSk7XG5cdHByb2dyZXNzMzBCYXIudG90YWwoMTAwKTtcblx0cHJvZ3Jlc3MzMEJhci53b3JrZWQoMzApO1xuXG5cdC8vIERpc2NyZXRlIHByb2dyZXNzIC0gNjAlXG5cdGNvbnN0IHByb2dyZXNzNjBTZWN0aW9uID0gY3JlYXRlU2VjdGlvbignRGlzY3JldGUgUHJvZ3Jlc3MgLSA2MCUnKTtcblx0Y29uc3QgcHJvZ3Jlc3M2MEJhciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFByb2dyZXNzQmFyKHByb2dyZXNzNjBTZWN0aW9uLCB0aGVtZWRQcm9ncmVzc0Jhck9wdGlvbnMpKTtcblx0cHJvZ3Jlc3M2MEJhci50b3RhbCgxMDApO1xuXHRwcm9ncmVzczYwQmFyLndvcmtlZCg2MCk7XG5cblx0Ly8gRGlzY3JldGUgcHJvZ3Jlc3MgLSA5MCVcblx0Y29uc3QgcHJvZ3Jlc3M5MFNlY3Rpb24gPSBjcmVhdGVTZWN0aW9uKCdEaXNjcmV0ZSBQcm9ncmVzcyAtIDkwJScpO1xuXHRjb25zdCBwcm9ncmVzczkwQmFyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgUHJvZ3Jlc3NCYXIocHJvZ3Jlc3M5MFNlY3Rpb24sIHRoZW1lZFByb2dyZXNzQmFyT3B0aW9ucykpO1xuXHRwcm9ncmVzczkwQmFyLnRvdGFsKDEwMCk7XG5cdHByb2dyZXNzOTBCYXIud29ya2VkKDkwKTtcblxuXHQvLyBDb21wbGV0ZWQgcHJvZ3Jlc3Ncblx0Y29uc3QgZG9uZVNlY3Rpb24gPSBjcmVhdGVTZWN0aW9uKCdDb21wbGV0ZWQgKDEwMCUpJyk7XG5cdGNvbnN0IGRvbmVCYXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBQcm9ncmVzc0Jhcihkb25lU2VjdGlvbiwgdGhlbWVkUHJvZ3Jlc3NCYXJPcHRpb25zKSk7XG5cdGRvbmVCYXIudG90YWwoMTAwKTtcblx0ZG9uZUJhci53b3JrZWQoMTAwKTtcbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBIaWdobGlnaHRlZCBMYWJlbFxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiByZW5kZXJIaWdobGlnaHRlZExhYmVscyh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRjb250YWluZXIuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJztcblxuXHRjb25zdCBjcmVhdGVIaWdobGlnaHRlZExhYmVsID0gKHRleHQ6IHN0cmluZywgaGlnaGxpZ2h0czogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9W10pID0+IHtcblx0XHRjb25zdCByb3cgPSAkKCdkaXYnKTtcblx0XHRyb3cuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRyb3cuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXHRcdHJvdy5zdHlsZS5nYXAgPSAnOHB4JztcblxuXHRcdGNvbnN0IGxhYmVsQ29udGFpbmVyID0gJCgnZGl2Jyk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGxhYmVsQ29udGFpbmVyKSk7XG5cdFx0bGFiZWwuc2V0KHRleHQsIGhpZ2hsaWdodHMpO1xuXHRcdHJvdy5hcHBlbmRDaGlsZChsYWJlbENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBxdWVyeUxhYmVsID0gJCgnc3BhbicpO1xuXHRcdHF1ZXJ5TGFiZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXHRcdHF1ZXJ5TGFiZWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XG5cdFx0cXVlcnlMYWJlbC50ZXh0Q29udGVudCA9IGAobWF0Y2hlcyBoaWdobGlnaHRlZClgO1xuXHRcdHJvdy5hcHBlbmRDaGlsZChxdWVyeUxhYmVsKTtcblxuXHRcdHJldHVybiByb3c7XG5cdH07XG5cblx0Ly8gRmlsZSBzZWFyY2ggZXhhbXBsZXNcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZUhpZ2hsaWdodGVkTGFiZWwoJ2NvZGVFZGl0b3JXaWRnZXQudHMnLCBbeyBzdGFydDogMCwgZW5kOiA0IH1dKSk7IC8vIFwiY29kZVwiXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVIaWdobGlnaHRlZExhYmVsKCdpbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIudHMnLCBbeyBzdGFydDogNiwgZW5kOiAxMCB9XSkpOyAvLyBcIkNvbXBcIlxuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlSGlnaGxpZ2h0ZWRMYWJlbCgnZGlmZkVkaXRvclZpZXdNb2RlbC50cycsIFt7IHN0YXJ0OiAwLCBlbmQ6IDQgfSwgeyBzdGFydDogMTAsIGVuZDogMTQgfV0pKTsgLy8gXCJkaWZmXCIgYW5kIFwiVmlld1wiXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVIaWdobGlnaHRlZExhYmVsKCd3b3JrYmVuY2hUZXN0U2VydmljZXMudHMnLCBbeyBzdGFydDogOSwgZW5kOiAxMyB9XSkpOyAvLyBcIlRlc3RcIlxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFFBQVEsaUJBQWlCO0FBR2xDLFNBQVMsUUFBUSxXQUFXLHVCQUF1Qiw0QkFBNEI7QUFDL0UsU0FBUyxRQUFRLFVBQVUsNEJBQTRCO0FBQ3ZELFNBQVMsVUFBVSxhQUFhLDJCQUEyQjtBQUMzRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFrQyx3QkFB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
