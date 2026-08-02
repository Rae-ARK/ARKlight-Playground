import { toAction } from "../../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { ActionListItemKind } from "../../../../../../../platform/actionWidget/browser/actionList.js";
import { ChatEntitlement } from "../../../../../../services/chat/common/chatEntitlementService.js";
import { ILanguageModelChatMetadata } from "../../../../common/languageModels.js";
import { buildModelToProviderGroupMap, createModelAction, createModelItem, createPinAction, createUnavailableModelItem, getProviderGroupForModel, getProviderGroupKey, getUnavailableReason, isVersionAtLeast } from "./modelPickerItemPrimitives.js";
import { isAutoModel } from "./modelPickerPresentation.js";
const ModelPickerSection = {
  Other: "other"
};
const RESTRICTED_MODE_TRUST_ACTION_ID = "restrictedModeTrust";
const SETUP_REQUIRED_SIGN_IN_ACTION_ID = "setupRequiredSignIn";
function createSyntheticAutoItem() {
  return createModelItem({
    id: "auto",
    enabled: true,
    checked: true,
    class: void 0,
    tooltip: localize("chat.modelPicker.auto", "Auto"),
    label: localize("chat.modelPicker.auto", "Auto"),
    run: () => {
    }
  });
}
function buildUnavailableStateItems(options) {
  const { restrictedMode, setupRequired, showAutoModel } = options.presentation;
  if (restrictedMode) {
    const enabled = !!options.actions.onRequestTrust;
    return [
      { kind: ActionListItemKind.Header, label: localize("chat.modelPicker.restrictedMode", "Models unavailable while in Restricted mode") },
      {
        item: {
          id: RESTRICTED_MODE_TRUST_ACTION_ID,
          enabled,
          checked: false,
          class: void 0,
          tooltip: localize("chat.modelPicker.restrictedMode.trustTooltip", "Trust the workspace to enable models."),
          label: localize("chat.modelPicker.restrictedMode.trust", "Trust Workspace to enable models..."),
          run: () => options.actions.onRequestTrust?.()
        },
        kind: ActionListItemKind.Action,
        label: localize("chat.modelPicker.restrictedMode.trust", "Trust Workspace to enable models..."),
        group: { title: "", icon: ThemeIcon.fromId(Codicon.workspaceTrusted.id) },
        disabled: !enabled,
        hideIcon: false
      }
    ];
  }
  if (setupRequired) {
    const enabled = !!options.actions.onRequestSetup;
    return [
      { kind: ActionListItemKind.Header, label: localize("chat.modelPicker.setupRequired", "Sign in to use Copilot") },
      {
        item: {
          id: SETUP_REQUIRED_SIGN_IN_ACTION_ID,
          enabled,
          checked: false,
          class: void 0,
          tooltip: localize("chat.modelPicker.setupRequired.signInTooltip", "Sign in to GitHub Copilot to choose a model."),
          label: localize("chat.modelPicker.setupRequired.signIn", "Sign in to use Copilot..."),
          run: () => options.actions.onRequestSetup?.()
        },
        kind: ActionListItemKind.Action,
        label: localize("chat.modelPicker.setupRequired.signIn", "Sign in to use Copilot..."),
        group: { title: "", icon: ThemeIcon.fromId(Codicon.signIn.id) },
        disabled: !enabled,
        hideIcon: false
      }
    ];
  }
  if (options.models.length > 0) {
    return void 0;
  }
  if (showAutoModel) {
    return void 0;
  }
  const entitlement = options.chatEntitlementService.entitlement;
  const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
  const description = canUpgrade ? new MarkdownString(localize("chat.modelPicker.upgradeLink", '[Upgrade](command:workbench.action.chat.upgradePlan " ")'), { isTrusted: true }) : void 0;
  const hover = canUpgrade ? new MarkdownString("", { isTrusted: true, supportThemeIcons: true }) : void 0;
  hover?.appendMarkdown(localize("chat.modelPicker.upgradeHover", '[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan " ") to use the best models.'));
  return [{
    item: {
      id: "noModels",
      enabled: false,
      checked: false,
      class: void 0,
      tooltip: localize("chat.modelPicker.noModels", "No models available"),
      label: localize("chat.modelPicker.noModels", "No models available"),
      run: () => {
      }
    },
    kind: ActionListItemKind.Action,
    label: localize("chat.modelPicker.noModels", "No models available"),
    description,
    group: { title: "", icon: ThemeIcon.fromId(Codicon.blank.id) },
    disabled: true,
    hideIcon: false,
    hover: hover ? { content: hover } : void 0
  }];
}
function buildFlatModelItems(options) {
  const items = [];
  if (options.models.length === 0 && options.presentation.showAutoModel) {
    items.push(createSyntheticAutoItem());
  }
  const autoModel = options.models.find(isAutoModel);
  if (autoModel) {
    const { action, ariaDescription } = createModelAction(autoModel, options.selectedModelId, options.actions.onSelect);
    items.push(createModelItem(action, autoModel, options.openerService, void 0, options.presentation.isUBB, ariaDescription));
  }
  const sortedModels = options.models.filter((model) => model !== autoModel).sort((left, right) => left.metadata.vendor.localeCompare(right.metadata.vendor) || left.metadata.name.localeCompare(right.metadata.name));
  for (const model of sortedModels) {
    const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect);
    items.push(createModelItem(action, model, options.openerService, void 0, options.presentation.isUBB, ariaDescription, void 0, options.actions.onConfigure));
  }
  return items;
}
function createGroupedContext(options) {
  const modelToGroup = buildModelToProviderGroupMap(options.languageModelsService);
  const allModels = new Map(options.models.map((model) => [model.identifier, model]));
  const modelsByMetadataId = new Map(options.models.map((model) => [model.metadata.id, model]));
  const placed = /* @__PURE__ */ new Set();
  return {
    options,
    items: [],
    modelToGroup,
    resolveModel: (id) => allModels.get(id) ?? modelsByMetadataId.get(id),
    placed,
    showGroupLabel: new Set(options.models.map((model) => {
      const group = getProviderGroupForModel(model, modelToGroup, options.languageModelsService);
      return getProviderGroupKey(group.vendor, group.groupName);
    })).size > 1,
    makePinAction: (model) => options.actions.onTogglePin ? createPinAction(model.identifier, options.pinnedModelIds.includes(model.identifier), options.actions.onTogglePin) : void 0,
    markPlaced: (identifierOrId) => placed.add(identifierOrId)
  };
}
function appendLeadingModels(context) {
  const { options, items } = context;
  const autoModel = options.models.find(isAutoModel);
  if (!autoModel && options.models.length === 0 && options.presentation.showAutoModel) {
    items.push(createSyntheticAutoItem());
  }
  if (autoModel) {
    context.markPlaced(autoModel.identifier);
    const { action, ariaDescription } = createModelAction(autoModel, options.selectedModelId, options.actions.onSelect);
    items.push(createModelItem(action, autoModel, options.openerService, void 0, options.presentation.isUBB, ariaDescription));
  }
  for (const model of options.models) {
    if (!context.placed.has(model.identifier) && ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)) {
      context.markPlaced(model.identifier);
      const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect);
      items.push(createModelItem(action, model, options.openerService, void 0, options.presentation.isUBB, ariaDescription));
    }
  }
  return autoModel;
}
function appendPinnedModels(context) {
  const { options, items } = context;
  const pinnedSet = new Set(options.pinnedModelIds);
  const pinnedModels = [];
  for (const id of options.pinnedModelIds) {
    const model = context.resolveModel(id);
    if (!context.placed.has(id) && model && !context.placed.has(model.identifier)) {
      context.markPlaced(model.identifier);
      pinnedModels.push(model);
    }
  }
  pinnedModels.sort((left, right) => {
    const leftGroup = getProviderGroupForModel(left, context.modelToGroup, options.languageModelsService);
    const rightGroup = getProviderGroupForModel(right, context.modelToGroup, options.languageModelsService);
    return leftGroup.groupName.localeCompare(rightGroup.groupName) || left.metadata.name.localeCompare(right.metadata.name);
  });
  if (pinnedModels.length > 0) {
    items.push({ kind: ActionListItemKind.Separator, label: localize("chat.modelPicker.pinned", "Pinned") });
    for (const model of pinnedModels) {
      const groupLabel = context.showGroupLabel ? getProviderGroupForModel(model, context.modelToGroup, options.languageModelsService).groupName : void 0;
      const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect, void 0, context.showGroupLabel);
      items.push(createModelItem(action, model, options.openerService, groupLabel, options.presentation.isUBB, ariaDescription, context.makePinAction(model), options.actions.onConfigure));
    }
  }
  return pinnedSet;
}
function appendPromotedModels(context, autoModel, pinnedSet) {
  const { options, items } = context;
  const promoted = [];
  const tryPlace = (id) => {
    if (context.placed.has(id)) {
      return false;
    }
    const model = context.resolveModel(id);
    if (model && !context.placed.has(model.identifier)) {
      context.markPlaced(model.identifier);
      const entry2 = options.controlModels[model.metadata.id];
      if (entry2?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, entry2.minVSCodeVersion)) {
        promoted.push({ kind: "unavailable", id: model.metadata.id, entry: entry2, reason: "update" });
      } else {
        promoted.push({ kind: "available", model });
      }
      return true;
    }
    const entry = options.controlModels[id];
    if (!model && entry && !entry.exists) {
      context.markPlaced(id);
      promoted.push({ kind: "unavailable", id, entry, reason: getUnavailableReason(entry, options.chatEntitlementService, options.currentVSCodeVersion) });
      return true;
    }
    return false;
  };
  if (options.selectedModelId && options.selectedModelId !== autoModel?.identifier) {
    tryPlace(options.selectedModelId);
  }
  for (const id of options.recentModelIds.filter((id2) => !pinnedSet.has(id2)).slice(0, 3)) {
    tryPlace(id);
  }
  if (options.presentation.showFeatured) {
    for (const model of options.models) {
      if (model.metadata.promo && !ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)) {
        tryPlace(model.identifier);
      }
    }
    for (const [entryId, entry] of Object.entries(options.controlModels)) {
      if (!entry.featured || context.placed.has(entryId)) {
        continue;
      }
      const model = context.resolveModel(entryId);
      if (model && !context.placed.has(model.identifier)) {
        if (entry.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, entry.minVSCodeVersion)) {
          if (options.presentation.showUnavailableFeatured) {
            context.markPlaced(model.identifier);
            promoted.push({ kind: "unavailable", id: entryId, entry, reason: "update" });
          }
        } else {
          context.markPlaced(model.identifier);
          promoted.push({ kind: "available", model });
        }
      } else if (!model && !entry.exists && options.presentation.showUnavailableFeatured) {
        context.markPlaced(entryId);
        promoted.push({ kind: "unavailable", id: entryId, entry, reason: getUnavailableReason(entry, options.chatEntitlementService, options.currentVSCodeVersion) });
      }
    }
  }
  if (promoted.length === 0) {
    return;
  }
  if (items.length > 0) {
    items.push({ kind: ActionListItemKind.Separator });
  }
  promoted.sort((left, right) => {
    const availability = (left.kind === "available" ? 0 : 1) - (right.kind === "available" ? 0 : 1);
    const leftName = left.kind === "available" ? left.model.metadata.name : left.entry.label;
    const rightName = right.kind === "available" ? right.model.metadata.name : right.entry.label;
    return availability || leftName.localeCompare(rightName);
  });
  for (const item of promoted) {
    if (item.kind === "available") {
      const groupLabel = context.showGroupLabel ? getProviderGroupForModel(item.model, context.modelToGroup, options.languageModelsService).groupName : void 0;
      const { action, ariaDescription } = createModelAction(item.model, options.selectedModelId, options.actions.onSelect, void 0, context.showGroupLabel);
      items.push(createModelItem(action, item.model, options.openerService, groupLabel, options.presentation.isUBB, ariaDescription, context.makePinAction(item.model), options.actions.onConfigure));
    } else {
      items.push(createUnavailableModelItem(item.id, item.entry, item.reason, options.manageSettingsUrl, options.updateStateType, options.chatEntitlementService));
    }
  }
}
function appendOtherModels(context) {
  const { options, items } = context;
  const otherModels = options.models.filter((model) => !context.placed.has(model.identifier));
  if (otherModels.length === 0) {
    return false;
  }
  if (items.length > 0) {
    items.push({ kind: ActionListItemKind.Separator });
  }
  const toolbarActions = options.manageModelsAction ? [toAction({ id: options.manageModelsAction.id, label: options.manageModelsAction.tooltip ?? options.manageModelsAction.label, class: ThemeIcon.asClassName(Codicon.gear), run: () => options.manageModelsAction.run() })] : void 0;
  items.push({
    item: { id: "otherModels", enabled: true, checked: false, class: void 0, tooltip: localize("chat.modelPicker.otherModels", "Other Models"), label: localize("chat.modelPicker.otherModels", "Other Models"), run: () => {
    } },
    kind: ActionListItemKind.Action,
    label: localize("chat.modelPicker.otherModels", "Other Models"),
    group: { title: "", icon: Codicon.chevronDown },
    hideIcon: false,
    section: ModelPickerSection.Other,
    isSectionToggle: true,
    toolbarActions,
    className: "chat-model-picker-section-toggle"
  });
  const groups = /* @__PURE__ */ new Map();
  for (const model of otherModels) {
    const info = getProviderGroupForModel(model, context.modelToGroup, options.languageModelsService);
    const key = getProviderGroupKey(info.vendor, info.groupName);
    const bucket = groups.get(key) ?? { vendor: info.vendor, groupName: info.groupName, models: [] };
    bucket.models.push(model);
    groups.set(key, bucket);
  }
  const sortedGroups = [...groups.values()].sort((left, right) => {
    if (left.vendor === "copilot" && right.vendor !== "copilot") {
      return -1;
    }
    if (right.vendor === "copilot" && left.vendor !== "copilot") {
      return 1;
    }
    return left.groupName.localeCompare(right.groupName);
  });
  const showHeaders = sortedGroups.length > 1;
  for (const group of sortedGroups) {
    if (showHeaders) {
      items.push({ kind: ActionListItemKind.Separator, label: group.groupName, section: ModelPickerSection.Other });
    }
    group.models.sort((left, right) => {
      const leftEntry = options.controlModels[left.metadata.id] ?? options.controlModels[left.identifier];
      const rightEntry = options.controlModels[right.metadata.id] ?? options.controlModels[right.identifier];
      const leftUnavailable = leftEntry?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, leftEntry.minVSCodeVersion) ? 1 : 0;
      const rightUnavailable = rightEntry?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, rightEntry.minVSCodeVersion) ? 1 : 0;
      return leftUnavailable - rightUnavailable || left.metadata.name.localeCompare(right.metadata.name);
    });
    for (const model of group.models) {
      const entry = options.controlModels[model.metadata.id] ?? options.controlModels[model.identifier];
      if (entry?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, entry.minVSCodeVersion)) {
        items.push(createUnavailableModelItem(model.metadata.id, entry, "update", options.manageSettingsUrl, options.updateStateType, options.chatEntitlementService, ModelPickerSection.Other));
      } else {
        const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect, ModelPickerSection.Other, showHeaders);
        items.push(createModelItem(action, model, options.openerService, void 0, options.presentation.isUBB, ariaDescription, context.makePinAction(model), options.actions.onConfigure));
      }
    }
  }
  return true;
}
function buildGroupedModelItems(options) {
  const context = createGroupedContext(options);
  const autoModel = appendLeadingModels(context);
  const pinnedSet = appendPinnedModels(context);
  appendPromotedModels(context, autoModel, pinnedSet);
  const hasOtherModels = appendOtherModels(context);
  if (options.manageModelsAction && !hasOtherModels) {
    context.items.push({ kind: ActionListItemKind.Separator });
    context.items.push({
      item: options.manageModelsAction,
      kind: ActionListItemKind.Action,
      label: options.manageModelsAction.label,
      group: { title: "", icon: Codicon.blank },
      hideIcon: false,
      showAlways: true
    });
  }
  return context.items;
}
export {
  ModelPickerSection,
  RESTRICTED_MODE_TRUST_ACTION_ID,
  SETUP_REQUIRED_SIGN_IN_ACTION_ID,
  buildFlatModelItems,
  buildGroupedModelItems,
  buildUnavailableStateItems
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJJdGVtU2VjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRyb2xFbnRyeSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBidWlsZE1vZGVsVG9Qcm92aWRlckdyb3VwTWFwLCBjcmVhdGVNb2RlbEFjdGlvbiwgY3JlYXRlTW9kZWxJdGVtLCBjcmVhdGVQaW5BY3Rpb24sIGNyZWF0ZVVuYXZhaWxhYmxlTW9kZWxJdGVtLCBnZXRQcm92aWRlckdyb3VwRm9yTW9kZWwsIGdldFByb3ZpZGVyR3JvdXBLZXksIGdldFVuYXZhaWxhYmxlUmVhc29uLCBpc1ZlcnNpb25BdExlYXN0LCBQcm92aWRlckdyb3VwS2V5IH0gZnJvbSAnLi9tb2RlbFBpY2tlckl0ZW1QcmltaXRpdmVzLmpzJztcbmltcG9ydCB0eXBlIHsgSUJ1aWxkTW9kZWxQaWNrZXJJdGVtc09wdGlvbnMgfSBmcm9tICcuL21vZGVsUGlja2VySXRlbVR5cGVzLmpzJztcbmltcG9ydCB7IGlzQXV0b01vZGVsIH0gZnJvbSAnLi9tb2RlbFBpY2tlclByZXNlbnRhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBNb2RlbFBpY2tlclNlY3Rpb24gPSB7XG5cdE90aGVyOiAnb3RoZXInLFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IFJFU1RSSUNURURfTU9ERV9UUlVTVF9BQ1RJT05fSUQgPSAncmVzdHJpY3RlZE1vZGVUcnVzdCc7XG5leHBvcnQgY29uc3QgU0VUVVBfUkVRVUlSRURfU0lHTl9JTl9BQ1RJT05fSUQgPSAnc2V0dXBSZXF1aXJlZFNpZ25Jbic7XG5cbmZ1bmN0aW9uIGNyZWF0ZVN5bnRoZXRpY0F1dG9JdGVtKCk6IElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+IHtcblx0cmV0dXJuIGNyZWF0ZU1vZGVsSXRlbSh7XG5cdFx0aWQ6ICdhdXRvJyxcblx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdGNoZWNrZWQ6IHRydWUsXG5cdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5hdXRvJywgXCJBdXRvXCIpLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5hdXRvJywgXCJBdXRvXCIpLFxuXHRcdHJ1bjogKCkgPT4geyB9LFxuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkVW5hdmFpbGFibGVTdGF0ZUl0ZW1zKG9wdGlvbnM6IElCdWlsZE1vZGVsUGlja2VySXRlbXNPcHRpb25zKTogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHsgcmVzdHJpY3RlZE1vZGUsIHNldHVwUmVxdWlyZWQsIHNob3dBdXRvTW9kZWwgfSA9IG9wdGlvbnMucHJlc2VudGF0aW9uO1xuXHRpZiAocmVzdHJpY3RlZE1vZGUpIHtcblx0XHRjb25zdCBlbmFibGVkID0gISFvcHRpb25zLmFjdGlvbnMub25SZXF1ZXN0VHJ1c3Q7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlciwgbGFiZWw6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnJlc3RyaWN0ZWRNb2RlJywgXCJNb2RlbHMgdW5hdmFpbGFibGUgd2hpbGUgaW4gUmVzdHJpY3RlZCBtb2RlXCIpIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRpZDogUkVTVFJJQ1RFRF9NT0RFX1RSVVNUX0FDVElPTl9JRCxcblx0XHRcdFx0XHRlbmFibGVkLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIucmVzdHJpY3RlZE1vZGUudHJ1c3RUb29sdGlwJywgXCJUcnVzdCB0aGUgd29ya3NwYWNlIHRvIGVuYWJsZSBtb2RlbHMuXCIpLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5yZXN0cmljdGVkTW9kZS50cnVzdCcsIFwiVHJ1c3QgV29ya3NwYWNlIHRvIGVuYWJsZSBtb2RlbHMuLi5cIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBvcHRpb25zLmFjdGlvbnMub25SZXF1ZXN0VHJ1c3Q/LigpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIucmVzdHJpY3RlZE1vZGUudHJ1c3QnLCBcIlRydXN0IFdvcmtzcGFjZSB0byBlbmFibGUgbW9kZWxzLi4uXCIpLFxuXHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi53b3Jrc3BhY2VUcnVzdGVkLmlkKSB9LFxuXHRcdFx0XHRkaXNhYmxlZDogIWVuYWJsZWQsXG5cdFx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XTtcblx0fVxuXHRpZiAoc2V0dXBSZXF1aXJlZCkge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSAhIW9wdGlvbnMuYWN0aW9ucy5vblJlcXVlc3RTZXR1cDtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuc2V0dXBSZXF1aXJlZCcsIFwiU2lnbiBpbiB0byB1c2UgQ29waWxvdFwiKSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0aWQ6IFNFVFVQX1JFUVVJUkVEX1NJR05fSU5fQUNUSU9OX0lELFxuXHRcdFx0XHRcdGVuYWJsZWQsXG5cdFx0XHRcdFx0Y2hlY2tlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5zZXR1cFJlcXVpcmVkLnNpZ25JblRvb2x0aXAnLCBcIlNpZ24gaW4gdG8gR2l0SHViIENvcGlsb3QgdG8gY2hvb3NlIGEgbW9kZWwuXCIpLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5zZXR1cFJlcXVpcmVkLnNpZ25JbicsIFwiU2lnbiBpbiB0byB1c2UgQ29waWxvdC4uLlwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IG9wdGlvbnMuYWN0aW9ucy5vblJlcXVlc3RTZXR1cD8uKCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5zZXR1cFJlcXVpcmVkLnNpZ25JbicsIFwiU2lnbiBpbiB0byB1c2UgQ29waWxvdC4uLlwiKSxcblx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc2lnbkluLmlkKSB9LFxuXHRcdFx0XHRkaXNhYmxlZDogIWVuYWJsZWQsXG5cdFx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XTtcblx0fVxuXHRpZiAob3B0aW9ucy5tb2RlbHMubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHNob3dBdXRvTW9kZWwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGVudGl0bGVtZW50ID0gb3B0aW9ucy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50O1xuXHRjb25zdCBjYW5VcGdyYWRlID0gZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlIHx8IGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRURVO1xuXHRjb25zdCBkZXNjcmlwdGlvbiA9IGNhblVwZ3JhZGVcblx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci51cGdyYWRlTGluaycsIFwiW1VwZ3JhZGVdKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuIFxcXCIgXFxcIilcIiksIHsgaXNUcnVzdGVkOiB0cnVlIH0pXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGhvdmVyID0gY2FuVXBncmFkZSA/IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pIDogdW5kZWZpbmVkO1xuXHRob3Zlcj8uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIudXBncmFkZUhvdmVyJywgXCJbVXBncmFkZSB0byBHaXRIdWIgQ29waWxvdCBQcm9dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuIFxcXCIgXFxcIikgdG8gdXNlIHRoZSBiZXN0IG1vZGVscy5cIikpO1xuXHRyZXR1cm4gW3tcblx0XHRpdGVtOiB7XG5cdFx0XHRpZDogJ25vTW9kZWxzJyxcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0Y2hlY2tlZDogZmFsc2UsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIubm9Nb2RlbHMnLCBcIk5vIG1vZGVscyBhdmFpbGFibGVcIiksXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIubm9Nb2RlbHMnLCBcIk5vIG1vZGVscyBhdmFpbGFibGVcIiksXG5cdFx0XHRydW46ICgpID0+IHsgfSxcblx0XHR9LFxuXHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLm5vTW9kZWxzJywgXCJObyBtb2RlbHMgYXZhaWxhYmxlXCIpLFxuXHRcdGRlc2NyaXB0aW9uLFxuXHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmJsYW5rLmlkKSB9LFxuXHRcdGRpc2FibGVkOiB0cnVlLFxuXHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRob3ZlcjogaG92ZXIgPyB7IGNvbnRlbnQ6IGhvdmVyIH0gOiB1bmRlZmluZWQsXG5cdH1dO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRGbGF0TW9kZWxJdGVtcyhvcHRpb25zOiBJQnVpbGRNb2RlbFBpY2tlckl0ZW1zT3B0aW9ucyk6IElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+W10ge1xuXHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSA9IFtdO1xuXHRpZiAob3B0aW9ucy5tb2RlbHMubGVuZ3RoID09PSAwICYmIG9wdGlvbnMucHJlc2VudGF0aW9uLnNob3dBdXRvTW9kZWwpIHtcblx0XHRpdGVtcy5wdXNoKGNyZWF0ZVN5bnRoZXRpY0F1dG9JdGVtKCkpO1xuXHR9XG5cdGNvbnN0IGF1dG9Nb2RlbCA9IG9wdGlvbnMubW9kZWxzLmZpbmQoaXNBdXRvTW9kZWwpO1xuXHRpZiAoYXV0b01vZGVsKSB7XG5cdFx0Y29uc3QgeyBhY3Rpb24sIGFyaWFEZXNjcmlwdGlvbiB9ID0gY3JlYXRlTW9kZWxBY3Rpb24oYXV0b01vZGVsLCBvcHRpb25zLnNlbGVjdGVkTW9kZWxJZCwgb3B0aW9ucy5hY3Rpb25zLm9uU2VsZWN0KTtcblx0XHRpdGVtcy5wdXNoKGNyZWF0ZU1vZGVsSXRlbShhY3Rpb24sIGF1dG9Nb2RlbCwgb3B0aW9ucy5vcGVuZXJTZXJ2aWNlLCB1bmRlZmluZWQsIG9wdGlvbnMucHJlc2VudGF0aW9uLmlzVUJCLCBhcmlhRGVzY3JpcHRpb24pKTtcblx0fVxuXHRjb25zdCBzb3J0ZWRNb2RlbHMgPSBvcHRpb25zLm1vZGVsc1xuXHRcdC5maWx0ZXIobW9kZWwgPT4gbW9kZWwgIT09IGF1dG9Nb2RlbClcblx0XHQuc29ydCgobGVmdCwgcmlnaHQpID0+IGxlZnQubWV0YWRhdGEudmVuZG9yLmxvY2FsZUNvbXBhcmUocmlnaHQubWV0YWRhdGEudmVuZG9yKSB8fCBsZWZ0Lm1ldGFkYXRhLm5hbWUubG9jYWxlQ29tcGFyZShyaWdodC5tZXRhZGF0YS5uYW1lKSk7XG5cdGZvciAoY29uc3QgbW9kZWwgb2Ygc29ydGVkTW9kZWxzKSB7XG5cdFx0Y29uc3QgeyBhY3Rpb24sIGFyaWFEZXNjcmlwdGlvbiB9ID0gY3JlYXRlTW9kZWxBY3Rpb24obW9kZWwsIG9wdGlvbnMuc2VsZWN0ZWRNb2RlbElkLCBvcHRpb25zLmFjdGlvbnMub25TZWxlY3QpO1xuXHRcdGl0ZW1zLnB1c2goY3JlYXRlTW9kZWxJdGVtKGFjdGlvbiwgbW9kZWwsIG9wdGlvbnMub3BlbmVyU2VydmljZSwgdW5kZWZpbmVkLCBvcHRpb25zLnByZXNlbnRhdGlvbi5pc1VCQiwgYXJpYURlc2NyaXB0aW9uLCB1bmRlZmluZWQsIG9wdGlvbnMuYWN0aW9ucy5vbkNvbmZpZ3VyZSkpO1xuXHR9XG5cdHJldHVybiBpdGVtcztcbn1cblxuaW50ZXJmYWNlIElHcm91cGVkQ29udGV4dCB7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IElCdWlsZE1vZGVsUGlja2VySXRlbXNPcHRpb25zO1xuXHRyZWFkb25seSBpdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXTtcblx0cmVhZG9ubHkgbW9kZWxUb0dyb3VwOiBSZXR1cm5UeXBlPHR5cGVvZiBidWlsZE1vZGVsVG9Qcm92aWRlckdyb3VwTWFwPjtcblx0cmVhZG9ubHkgcmVzb2x2ZU1vZGVsOiAoaWQ6IHN0cmluZykgPT4gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwbGFjZWQ6IFNldDxzdHJpbmc+O1xuXHRyZWFkb25seSBzaG93R3JvdXBMYWJlbDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWFrZVBpbkFjdGlvbjogKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpID0+IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVBpbkFjdGlvbj4gfCB1bmRlZmluZWQ7XG5cdG1hcmtQbGFjZWQoaWRlbnRpZmllck9ySWQ6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUdyb3VwZWRDb250ZXh0KG9wdGlvbnM6IElCdWlsZE1vZGVsUGlja2VySXRlbXNPcHRpb25zKTogSUdyb3VwZWRDb250ZXh0IHtcblx0Y29uc3QgbW9kZWxUb0dyb3VwID0gYnVpbGRNb2RlbFRvUHJvdmlkZXJHcm91cE1hcChvcHRpb25zLmxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdGNvbnN0IGFsbE1vZGVscyA9IG5ldyBNYXAob3B0aW9ucy5tb2RlbHMubWFwKG1vZGVsID0+IFttb2RlbC5pZGVudGlmaWVyLCBtb2RlbF0pKTtcblx0Y29uc3QgbW9kZWxzQnlNZXRhZGF0YUlkID0gbmV3IE1hcChvcHRpb25zLm1vZGVscy5tYXAobW9kZWwgPT4gW21vZGVsLm1ldGFkYXRhLmlkLCBtb2RlbF0pKTtcblx0Y29uc3QgcGxhY2VkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHJldHVybiB7XG5cdFx0b3B0aW9ucyxcblx0XHRpdGVtczogW10sXG5cdFx0bW9kZWxUb0dyb3VwLFxuXHRcdHJlc29sdmVNb2RlbDogaWQgPT4gYWxsTW9kZWxzLmdldChpZCkgPz8gbW9kZWxzQnlNZXRhZGF0YUlkLmdldChpZCksXG5cdFx0cGxhY2VkLFxuXHRcdHNob3dHcm91cExhYmVsOiBuZXcgU2V0KG9wdGlvbnMubW9kZWxzLm1hcChtb2RlbCA9PiB7XG5cdFx0XHRjb25zdCBncm91cCA9IGdldFByb3ZpZGVyR3JvdXBGb3JNb2RlbChtb2RlbCwgbW9kZWxUb0dyb3VwLCBvcHRpb25zLmxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0XHRyZXR1cm4gZ2V0UHJvdmlkZXJHcm91cEtleShncm91cC52ZW5kb3IsIGdyb3VwLmdyb3VwTmFtZSk7XG5cdFx0fSkpLnNpemUgPiAxLFxuXHRcdG1ha2VQaW5BY3Rpb246IG1vZGVsID0+IG9wdGlvbnMuYWN0aW9ucy5vblRvZ2dsZVBpblxuXHRcdFx0PyBjcmVhdGVQaW5BY3Rpb24obW9kZWwuaWRlbnRpZmllciwgb3B0aW9ucy5waW5uZWRNb2RlbElkcy5pbmNsdWRlcyhtb2RlbC5pZGVudGlmaWVyKSwgb3B0aW9ucy5hY3Rpb25zLm9uVG9nZ2xlUGluKVxuXHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0bWFya1BsYWNlZDogaWRlbnRpZmllck9ySWQgPT4gcGxhY2VkLmFkZChpZGVudGlmaWVyT3JJZCksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFwcGVuZExlYWRpbmdNb2RlbHMoY29udGV4dDogSUdyb3VwZWRDb250ZXh0KTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgeyBvcHRpb25zLCBpdGVtcyB9ID0gY29udGV4dDtcblx0Y29uc3QgYXV0b01vZGVsID0gb3B0aW9ucy5tb2RlbHMuZmluZChpc0F1dG9Nb2RlbCk7XG5cdGlmICghYXV0b01vZGVsICYmIG9wdGlvbnMubW9kZWxzLmxlbmd0aCA9PT0gMCAmJiBvcHRpb25zLnByZXNlbnRhdGlvbi5zaG93QXV0b01vZGVsKSB7XG5cdFx0aXRlbXMucHVzaChjcmVhdGVTeW50aGV0aWNBdXRvSXRlbSgpKTtcblx0fVxuXHRpZiAoYXV0b01vZGVsKSB7XG5cdFx0Y29udGV4dC5tYXJrUGxhY2VkKGF1dG9Nb2RlbC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihhdXRvTW9kZWwsIG9wdGlvbnMuc2VsZWN0ZWRNb2RlbElkLCBvcHRpb25zLmFjdGlvbnMub25TZWxlY3QpO1xuXHRcdGl0ZW1zLnB1c2goY3JlYXRlTW9kZWxJdGVtKGFjdGlvbiwgYXV0b01vZGVsLCBvcHRpb25zLm9wZW5lclNlcnZpY2UsIHVuZGVmaW5lZCwgb3B0aW9ucy5wcmVzZW50YXRpb24uaXNVQkIsIGFyaWFEZXNjcmlwdGlvbikpO1xuXHR9XG5cdGZvciAoY29uc3QgbW9kZWwgb2Ygb3B0aW9ucy5tb2RlbHMpIHtcblx0XHRpZiAoIWNvbnRleHQucGxhY2VkLmhhcyhtb2RlbC5pZGVudGlmaWVyKSAmJiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5oYXNQcm9tb0Rpc2NvdW50KG1vZGVsLm1ldGFkYXRhKSkge1xuXHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3QgeyBhY3Rpb24sIGFyaWFEZXNjcmlwdGlvbiB9ID0gY3JlYXRlTW9kZWxBY3Rpb24obW9kZWwsIG9wdGlvbnMuc2VsZWN0ZWRNb2RlbElkLCBvcHRpb25zLmFjdGlvbnMub25TZWxlY3QpO1xuXHRcdFx0aXRlbXMucHVzaChjcmVhdGVNb2RlbEl0ZW0oYWN0aW9uLCBtb2RlbCwgb3B0aW9ucy5vcGVuZXJTZXJ2aWNlLCB1bmRlZmluZWQsIG9wdGlvbnMucHJlc2VudGF0aW9uLmlzVUJCLCBhcmlhRGVzY3JpcHRpb24pKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGF1dG9Nb2RlbDtcbn1cblxuZnVuY3Rpb24gYXBwZW5kUGlubmVkTW9kZWxzKGNvbnRleHQ6IElHcm91cGVkQ29udGV4dCk6IFNldDxzdHJpbmc+IHtcblx0Y29uc3QgeyBvcHRpb25zLCBpdGVtcyB9ID0gY29udGV4dDtcblx0Y29uc3QgcGlubmVkU2V0ID0gbmV3IFNldChvcHRpb25zLnBpbm5lZE1vZGVsSWRzKTtcblx0Y29uc3QgcGlubmVkTW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGlkIG9mIG9wdGlvbnMucGlubmVkTW9kZWxJZHMpIHtcblx0XHRjb25zdCBtb2RlbCA9IGNvbnRleHQucmVzb2x2ZU1vZGVsKGlkKTtcblx0XHRpZiAoIWNvbnRleHQucGxhY2VkLmhhcyhpZCkgJiYgbW9kZWwgJiYgIWNvbnRleHQucGxhY2VkLmhhcyhtb2RlbC5pZGVudGlmaWVyKSkge1xuXHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0cGlubmVkTW9kZWxzLnB1c2gobW9kZWwpO1xuXHRcdH1cblx0fVxuXHRwaW5uZWRNb2RlbHMuc29ydCgobGVmdCwgcmlnaHQpID0+IHtcblx0XHRjb25zdCBsZWZ0R3JvdXAgPSBnZXRQcm92aWRlckdyb3VwRm9yTW9kZWwobGVmdCwgY29udGV4dC5tb2RlbFRvR3JvdXAsIG9wdGlvbnMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCByaWdodEdyb3VwID0gZ2V0UHJvdmlkZXJHcm91cEZvck1vZGVsKHJpZ2h0LCBjb250ZXh0Lm1vZGVsVG9Hcm91cCwgb3B0aW9ucy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHRcdHJldHVybiBsZWZ0R3JvdXAuZ3JvdXBOYW1lLmxvY2FsZUNvbXBhcmUocmlnaHRHcm91cC5ncm91cE5hbWUpIHx8IGxlZnQubWV0YWRhdGEubmFtZS5sb2NhbGVDb21wYXJlKHJpZ2h0Lm1ldGFkYXRhLm5hbWUpO1xuXHR9KTtcblx0aWYgKHBpbm5lZE1vZGVscy5sZW5ndGggPiAwKSB7XG5cdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5waW5uZWQnLCBcIlBpbm5lZFwiKSB9KTtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHBpbm5lZE1vZGVscykge1xuXHRcdFx0Y29uc3QgZ3JvdXBMYWJlbCA9IGNvbnRleHQuc2hvd0dyb3VwTGFiZWwgPyBnZXRQcm92aWRlckdyb3VwRm9yTW9kZWwobW9kZWwsIGNvbnRleHQubW9kZWxUb0dyb3VwLCBvcHRpb25zLmxhbmd1YWdlTW9kZWxzU2VydmljZSkuZ3JvdXBOYW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgeyBhY3Rpb24sIGFyaWFEZXNjcmlwdGlvbiB9ID0gY3JlYXRlTW9kZWxBY3Rpb24obW9kZWwsIG9wdGlvbnMuc2VsZWN0ZWRNb2RlbElkLCBvcHRpb25zLmFjdGlvbnMub25TZWxlY3QsIHVuZGVmaW5lZCwgY29udGV4dC5zaG93R3JvdXBMYWJlbCk7XG5cdFx0XHRpdGVtcy5wdXNoKGNyZWF0ZU1vZGVsSXRlbShhY3Rpb24sIG1vZGVsLCBvcHRpb25zLm9wZW5lclNlcnZpY2UsIGdyb3VwTGFiZWwsIG9wdGlvbnMucHJlc2VudGF0aW9uLmlzVUJCLCBhcmlhRGVzY3JpcHRpb24sIGNvbnRleHQubWFrZVBpbkFjdGlvbihtb2RlbCksIG9wdGlvbnMuYWN0aW9ucy5vbkNvbmZpZ3VyZSkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcGlubmVkU2V0O1xufVxuXG50eXBlIFByb21vdGVkSXRlbSA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnYXZhaWxhYmxlJzsgcmVhZG9ubHkgbW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9XG5cdHwgeyByZWFkb25seSBraW5kOiAndW5hdmFpbGFibGUnOyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBlbnRyeTogSU1vZGVsQ29udHJvbEVudHJ5OyByZWFkb25seSByZWFzb246ICd1cGdyYWRlJyB8ICd1cGRhdGUnIHwgJ2FkbWluJyB9O1xuXG5mdW5jdGlvbiBhcHBlbmRQcm9tb3RlZE1vZGVscyhjb250ZXh0OiBJR3JvdXBlZENvbnRleHQsIGF1dG9Nb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBwaW5uZWRTZXQ6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdGNvbnN0IHsgb3B0aW9ucywgaXRlbXMgfSA9IGNvbnRleHQ7XG5cdGNvbnN0IHByb21vdGVkOiBQcm9tb3RlZEl0ZW1bXSA9IFtdO1xuXHRjb25zdCB0cnlQbGFjZSA9IChpZDogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG5cdFx0aWYgKGNvbnRleHQucGxhY2VkLmhhcyhpZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSBjb250ZXh0LnJlc29sdmVNb2RlbChpZCk7XG5cdFx0aWYgKG1vZGVsICYmICFjb250ZXh0LnBsYWNlZC5oYXMobW9kZWwuaWRlbnRpZmllcikpIHtcblx0XHRcdGNvbnRleHQubWFya1BsYWNlZChtb2RlbC5pZGVudGlmaWVyKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gb3B0aW9ucy5jb250cm9sTW9kZWxzW21vZGVsLm1ldGFkYXRhLmlkXTtcblx0XHRcdGlmIChlbnRyeT8ubWluVlNDb2RlVmVyc2lvbiAmJiAhaXNWZXJzaW9uQXRMZWFzdChvcHRpb25zLmN1cnJlbnRWU0NvZGVWZXJzaW9uLCBlbnRyeS5taW5WU0NvZGVWZXJzaW9uKSkge1xuXHRcdFx0XHRwcm9tb3RlZC5wdXNoKHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWQ6IG1vZGVsLm1ldGFkYXRhLmlkLCBlbnRyeSwgcmVhc29uOiAndXBkYXRlJyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb21vdGVkLnB1c2goeyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWwgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSBvcHRpb25zLmNvbnRyb2xNb2RlbHNbaWRdO1xuXHRcdGlmICghbW9kZWwgJiYgZW50cnkgJiYgIWVudHJ5LmV4aXN0cykge1xuXHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKGlkKTtcblx0XHRcdHByb21vdGVkLnB1c2goeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZCwgZW50cnksIHJlYXNvbjogZ2V0VW5hdmFpbGFibGVSZWFzb24oZW50cnksIG9wdGlvbnMuY2hhdEVudGl0bGVtZW50U2VydmljZSwgb3B0aW9ucy5jdXJyZW50VlNDb2RlVmVyc2lvbikgfSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXHRpZiAob3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQgJiYgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQgIT09IGF1dG9Nb2RlbD8uaWRlbnRpZmllcikge1xuXHRcdHRyeVBsYWNlKG9wdGlvbnMuc2VsZWN0ZWRNb2RlbElkKTtcblx0fVxuXHRmb3IgKGNvbnN0IGlkIG9mIG9wdGlvbnMucmVjZW50TW9kZWxJZHMuZmlsdGVyKGlkID0+ICFwaW5uZWRTZXQuaGFzKGlkKSkuc2xpY2UoMCwgMykpIHtcblx0XHR0cnlQbGFjZShpZCk7XG5cdH1cblx0aWYgKG9wdGlvbnMucHJlc2VudGF0aW9uLnNob3dGZWF0dXJlZCkge1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2Ygb3B0aW9ucy5tb2RlbHMpIHtcblx0XHRcdGlmIChtb2RlbC5tZXRhZGF0YS5wcm9tbyAmJiAhSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuaGFzUHJvbW9EaXNjb3VudChtb2RlbC5tZXRhZGF0YSkpIHtcblx0XHRcdFx0dHJ5UGxhY2UobW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2VudHJ5SWQsIGVudHJ5XSBvZiBPYmplY3QuZW50cmllcyhvcHRpb25zLmNvbnRyb2xNb2RlbHMpKSB7XG5cdFx0XHRpZiAoIWVudHJ5LmZlYXR1cmVkIHx8IGNvbnRleHQucGxhY2VkLmhhcyhlbnRyeUlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZGVsID0gY29udGV4dC5yZXNvbHZlTW9kZWwoZW50cnlJZCk7XG5cdFx0XHRpZiAobW9kZWwgJiYgIWNvbnRleHQucGxhY2VkLmhhcyhtb2RlbC5pZGVudGlmaWVyKSkge1xuXHRcdFx0XHRpZiAoZW50cnkubWluVlNDb2RlVmVyc2lvbiAmJiAhaXNWZXJzaW9uQXRMZWFzdChvcHRpb25zLmN1cnJlbnRWU0NvZGVWZXJzaW9uLCBlbnRyeS5taW5WU0NvZGVWZXJzaW9uKSkge1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLnByZXNlbnRhdGlvbi5zaG93VW5hdmFpbGFibGVGZWF0dXJlZCkge1xuXHRcdFx0XHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0cHJvbW90ZWQucHVzaCh7IGtpbmQ6ICd1bmF2YWlsYWJsZScsIGlkOiBlbnRyeUlkLCBlbnRyeSwgcmVhc29uOiAndXBkYXRlJyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdHByb21vdGVkLnB1c2goeyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoIW1vZGVsICYmICFlbnRyeS5leGlzdHMgJiYgb3B0aW9ucy5wcmVzZW50YXRpb24uc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQpIHtcblx0XHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKGVudHJ5SWQpO1xuXHRcdFx0XHRwcm9tb3RlZC5wdXNoKHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWQ6IGVudHJ5SWQsIGVudHJ5LCByZWFzb246IGdldFVuYXZhaWxhYmxlUmVhc29uKGVudHJ5LCBvcHRpb25zLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIG9wdGlvbnMuY3VycmVudFZTQ29kZVZlcnNpb24pIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRpZiAocHJvbW90ZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgfSk7XG5cdH1cblx0cHJvbW90ZWQuc29ydCgobGVmdCwgcmlnaHQpID0+IHtcblx0XHRjb25zdCBhdmFpbGFiaWxpdHkgPSAobGVmdC5raW5kID09PSAnYXZhaWxhYmxlJyA/IDAgOiAxKSAtIChyaWdodC5raW5kID09PSAnYXZhaWxhYmxlJyA/IDAgOiAxKTtcblx0XHRjb25zdCBsZWZ0TmFtZSA9IGxlZnQua2luZCA9PT0gJ2F2YWlsYWJsZScgPyBsZWZ0Lm1vZGVsLm1ldGFkYXRhLm5hbWUgOiBsZWZ0LmVudHJ5LmxhYmVsO1xuXHRcdGNvbnN0IHJpZ2h0TmFtZSA9IHJpZ2h0LmtpbmQgPT09ICdhdmFpbGFibGUnID8gcmlnaHQubW9kZWwubWV0YWRhdGEubmFtZSA6IHJpZ2h0LmVudHJ5LmxhYmVsO1xuXHRcdHJldHVybiBhdmFpbGFiaWxpdHkgfHwgbGVmdE5hbWUubG9jYWxlQ29tcGFyZShyaWdodE5hbWUpO1xuXHR9KTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIHByb21vdGVkKSB7XG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ2F2YWlsYWJsZScpIHtcblx0XHRcdGNvbnN0IGdyb3VwTGFiZWwgPSBjb250ZXh0LnNob3dHcm91cExhYmVsID8gZ2V0UHJvdmlkZXJHcm91cEZvck1vZGVsKGl0ZW0ubW9kZWwsIGNvbnRleHQubW9kZWxUb0dyb3VwLCBvcHRpb25zLmxhbmd1YWdlTW9kZWxzU2VydmljZSkuZ3JvdXBOYW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgeyBhY3Rpb24sIGFyaWFEZXNjcmlwdGlvbiB9ID0gY3JlYXRlTW9kZWxBY3Rpb24oaXRlbS5tb2RlbCwgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnMuYWN0aW9ucy5vblNlbGVjdCwgdW5kZWZpbmVkLCBjb250ZXh0LnNob3dHcm91cExhYmVsKTtcblx0XHRcdGl0ZW1zLnB1c2goY3JlYXRlTW9kZWxJdGVtKGFjdGlvbiwgaXRlbS5tb2RlbCwgb3B0aW9ucy5vcGVuZXJTZXJ2aWNlLCBncm91cExhYmVsLCBvcHRpb25zLnByZXNlbnRhdGlvbi5pc1VCQiwgYXJpYURlc2NyaXB0aW9uLCBjb250ZXh0Lm1ha2VQaW5BY3Rpb24oaXRlbS5tb2RlbCksIG9wdGlvbnMuYWN0aW9ucy5vbkNvbmZpZ3VyZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtcy5wdXNoKGNyZWF0ZVVuYXZhaWxhYmxlTW9kZWxJdGVtKGl0ZW0uaWQsIGl0ZW0uZW50cnksIGl0ZW0ucmVhc29uLCBvcHRpb25zLm1hbmFnZVNldHRpbmdzVXJsLCBvcHRpb25zLnVwZGF0ZVN0YXRlVHlwZSwgb3B0aW9ucy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlKSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZE90aGVyTW9kZWxzKGNvbnRleHQ6IElHcm91cGVkQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRjb25zdCB7IG9wdGlvbnMsIGl0ZW1zIH0gPSBjb250ZXh0O1xuXHRjb25zdCBvdGhlck1vZGVscyA9IG9wdGlvbnMubW9kZWxzLmZpbHRlcihtb2RlbCA9PiAhY29udGV4dC5wbGFjZWQuaGFzKG1vZGVsLmlkZW50aWZpZXIpKTtcblx0aWYgKG90aGVyTW9kZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yIH0pO1xuXHR9XG5cdGNvbnN0IHRvb2xiYXJBY3Rpb25zID0gb3B0aW9ucy5tYW5hZ2VNb2RlbHNBY3Rpb25cblx0XHQ/IFt0b0FjdGlvbih7IGlkOiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbi5pZCwgbGFiZWw6IG9wdGlvbnMubWFuYWdlTW9kZWxzQWN0aW9uLnRvb2x0aXAgPz8gb3B0aW9ucy5tYW5hZ2VNb2RlbHNBY3Rpb24ubGFiZWwsIGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nZWFyKSwgcnVuOiAoKSA9PiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbiEucnVuKCkgfSldXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGl0ZW1zLnB1c2goe1xuXHRcdGl0ZW06IHsgaWQ6ICdvdGhlck1vZGVscycsIGVuYWJsZWQ6IHRydWUsIGNoZWNrZWQ6IGZhbHNlLCBjbGFzczogdW5kZWZpbmVkLCB0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5vdGhlck1vZGVscycsIFwiT3RoZXIgTW9kZWxzXCIpLCBsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIub3RoZXJNb2RlbHMnLCBcIk90aGVyIE1vZGVsc1wiKSwgcnVuOiAoKSA9PiB7IH0gfSxcblx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5vdGhlck1vZGVscycsIFwiT3RoZXIgTW9kZWxzXCIpLFxuXHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5jaGV2cm9uRG93biB9LFxuXHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRzZWN0aW9uOiBNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXIsXG5cdFx0aXNTZWN0aW9uVG9nZ2xlOiB0cnVlLFxuXHRcdHRvb2xiYXJBY3Rpb25zLFxuXHRcdGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLXNlY3Rpb24tdG9nZ2xlJyxcblx0fSk7XG5cdGludGVyZmFjZSBJUHJvdmlkZXJHcm91cEJ1Y2tldCB7IHZlbmRvcjogc3RyaW5nOyBncm91cE5hbWU6IHN0cmluZzsgbW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB9XG5cdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8UHJvdmlkZXJHcm91cEtleSwgSVByb3ZpZGVyR3JvdXBCdWNrZXQ+KCk7XG5cdGZvciAoY29uc3QgbW9kZWwgb2Ygb3RoZXJNb2RlbHMpIHtcblx0XHRjb25zdCBpbmZvID0gZ2V0UHJvdmlkZXJHcm91cEZvck1vZGVsKG1vZGVsLCBjb250ZXh0Lm1vZGVsVG9Hcm91cCwgb3B0aW9ucy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGtleSA9IGdldFByb3ZpZGVyR3JvdXBLZXkoaW5mby52ZW5kb3IsIGluZm8uZ3JvdXBOYW1lKTtcblx0XHRjb25zdCBidWNrZXQgPSBncm91cHMuZ2V0KGtleSkgPz8geyB2ZW5kb3I6IGluZm8udmVuZG9yLCBncm91cE5hbWU6IGluZm8uZ3JvdXBOYW1lLCBtb2RlbHM6IFtdIH07XG5cdFx0YnVja2V0Lm1vZGVscy5wdXNoKG1vZGVsKTtcblx0XHRncm91cHMuc2V0KGtleSwgYnVja2V0KTtcblx0fVxuXHRjb25zdCBzb3J0ZWRHcm91cHMgPSBbLi4uZ3JvdXBzLnZhbHVlcygpXS5zb3J0KChsZWZ0LCByaWdodCkgPT4ge1xuXHRcdGlmIChsZWZ0LnZlbmRvciA9PT0gJ2NvcGlsb3QnICYmIHJpZ2h0LnZlbmRvciAhPT0gJ2NvcGlsb3QnKSB7IHJldHVybiAtMTsgfVxuXHRcdGlmIChyaWdodC52ZW5kb3IgPT09ICdjb3BpbG90JyAmJiBsZWZ0LnZlbmRvciAhPT0gJ2NvcGlsb3QnKSB7IHJldHVybiAxOyB9XG5cdFx0cmV0dXJuIGxlZnQuZ3JvdXBOYW1lLmxvY2FsZUNvbXBhcmUocmlnaHQuZ3JvdXBOYW1lKTtcblx0fSk7XG5cdGNvbnN0IHNob3dIZWFkZXJzID0gc29ydGVkR3JvdXBzLmxlbmd0aCA+IDE7XG5cdGZvciAoY29uc3QgZ3JvdXAgb2Ygc29ydGVkR3JvdXBzKSB7XG5cdFx0aWYgKHNob3dIZWFkZXJzKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciwgbGFiZWw6IGdyb3VwLmdyb3VwTmFtZSwgc2VjdGlvbjogTW9kZWxQaWNrZXJTZWN0aW9uLk90aGVyIH0pO1xuXHRcdH1cblx0XHRncm91cC5tb2RlbHMuc29ydCgobGVmdCwgcmlnaHQpID0+IHtcblx0XHRcdGNvbnN0IGxlZnRFbnRyeSA9IG9wdGlvbnMuY29udHJvbE1vZGVsc1tsZWZ0Lm1ldGFkYXRhLmlkXSA/PyBvcHRpb25zLmNvbnRyb2xNb2RlbHNbbGVmdC5pZGVudGlmaWVyXTtcblx0XHRcdGNvbnN0IHJpZ2h0RW50cnkgPSBvcHRpb25zLmNvbnRyb2xNb2RlbHNbcmlnaHQubWV0YWRhdGEuaWRdID8/IG9wdGlvbnMuY29udHJvbE1vZGVsc1tyaWdodC5pZGVudGlmaWVyXTtcblx0XHRcdGNvbnN0IGxlZnRVbmF2YWlsYWJsZSA9IGxlZnRFbnRyeT8ubWluVlNDb2RlVmVyc2lvbiAmJiAhaXNWZXJzaW9uQXRMZWFzdChvcHRpb25zLmN1cnJlbnRWU0NvZGVWZXJzaW9uLCBsZWZ0RW50cnkubWluVlNDb2RlVmVyc2lvbikgPyAxIDogMDtcblx0XHRcdGNvbnN0IHJpZ2h0VW5hdmFpbGFibGUgPSByaWdodEVudHJ5Py5taW5WU0NvZGVWZXJzaW9uICYmICFpc1ZlcnNpb25BdExlYXN0KG9wdGlvbnMuY3VycmVudFZTQ29kZVZlcnNpb24sIHJpZ2h0RW50cnkubWluVlNDb2RlVmVyc2lvbikgPyAxIDogMDtcblx0XHRcdHJldHVybiBsZWZ0VW5hdmFpbGFibGUgLSByaWdodFVuYXZhaWxhYmxlIHx8IGxlZnQubWV0YWRhdGEubmFtZS5sb2NhbGVDb21wYXJlKHJpZ2h0Lm1ldGFkYXRhLm5hbWUpO1xuXHRcdH0pO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgZ3JvdXAubW9kZWxzKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IG9wdGlvbnMuY29udHJvbE1vZGVsc1ttb2RlbC5tZXRhZGF0YS5pZF0gPz8gb3B0aW9ucy5jb250cm9sTW9kZWxzW21vZGVsLmlkZW50aWZpZXJdO1xuXHRcdFx0aWYgKGVudHJ5Py5taW5WU0NvZGVWZXJzaW9uICYmICFpc1ZlcnNpb25BdExlYXN0KG9wdGlvbnMuY3VycmVudFZTQ29kZVZlcnNpb24sIGVudHJ5Lm1pblZTQ29kZVZlcnNpb24pKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goY3JlYXRlVW5hdmFpbGFibGVNb2RlbEl0ZW0obW9kZWwubWV0YWRhdGEuaWQsIGVudHJ5LCAndXBkYXRlJywgb3B0aW9ucy5tYW5hZ2VTZXR0aW5nc1VybCwgb3B0aW9ucy51cGRhdGVTdGF0ZVR5cGUsIG9wdGlvbnMuY2hhdEVudGl0bGVtZW50U2VydmljZSwgTW9kZWxQaWNrZXJTZWN0aW9uLk90aGVyKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihtb2RlbCwgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnMuYWN0aW9ucy5vblNlbGVjdCwgTW9kZWxQaWNrZXJTZWN0aW9uLk90aGVyLCBzaG93SGVhZGVycyk7XG5cdFx0XHRcdGl0ZW1zLnB1c2goY3JlYXRlTW9kZWxJdGVtKGFjdGlvbiwgbW9kZWwsIG9wdGlvbnMub3BlbmVyU2VydmljZSwgdW5kZWZpbmVkLCBvcHRpb25zLnByZXNlbnRhdGlvbi5pc1VCQiwgYXJpYURlc2NyaXB0aW9uLCBjb250ZXh0Lm1ha2VQaW5BY3Rpb24obW9kZWwpLCBvcHRpb25zLmFjdGlvbnMub25Db25maWd1cmUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEdyb3VwZWRNb2RlbEl0ZW1zKG9wdGlvbnM6IElCdWlsZE1vZGVsUGlja2VySXRlbXNPcHRpb25zKTogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSB7XG5cdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVHcm91cGVkQ29udGV4dChvcHRpb25zKTtcblx0Y29uc3QgYXV0b01vZGVsID0gYXBwZW5kTGVhZGluZ01vZGVscyhjb250ZXh0KTtcblx0Y29uc3QgcGlubmVkU2V0ID0gYXBwZW5kUGlubmVkTW9kZWxzKGNvbnRleHQpO1xuXHRhcHBlbmRQcm9tb3RlZE1vZGVscyhjb250ZXh0LCBhdXRvTW9kZWwsIHBpbm5lZFNldCk7XG5cdGNvbnN0IGhhc090aGVyTW9kZWxzID0gYXBwZW5kT3RoZXJNb2RlbHMoY29udGV4dCk7XG5cdGlmIChvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbiAmJiAhaGFzT3RoZXJNb2RlbHMpIHtcblx0XHRjb250ZXh0Lml0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yIH0pO1xuXHRcdGNvbnRleHQuaXRlbXMucHVzaCh7XG5cdFx0XHRpdGVtOiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbixcblx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRsYWJlbDogb3B0aW9ucy5tYW5hZ2VNb2RlbHNBY3Rpb24ubGFiZWwsXG5cdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24uYmxhbmsgfSxcblx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdHNob3dBbHdheXM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIGNvbnRleHQuaXRlbXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6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LFNBQVMsS0FBSyxjQUFjLE1BQU0sU0FBUyxJQUFJO0FBQUEsSUFDbEcsQ0FBQztBQUNELGVBQVcsU0FBUyxNQUFNLFFBQVE7QUFDakMsWUFBTSxRQUFRLFFBQVEsY0FBYyxNQUFNLFNBQVMsRUFBRSxLQUFLLFFBQVEsY0FBYyxNQUFNLFVBQVU7QUFDaEcsVUFBSSxPQUFPLG9CQUFvQixDQUFDLGlCQUFpQixRQUFRLHNCQUFzQixNQUFNLGdCQUFnQixHQUFHO0FBQ3ZHLGNBQU0sS0FBSywyQkFBMkIsTUFBTSxTQUFTLElBQUksT0FBTyxVQUFVLFFBQVEsbUJBQW1CLFFBQVEsaUJBQWlCLFFBQVEsd0JBQXdCLG1CQUFtQixLQUFLLENBQUM7QUFBQSxNQUN4TCxPQUFPO0FBQ04sY0FBTSxFQUFFLFFBQVEsZ0JBQWdCLElBQUksa0JBQWtCLE9BQU8sUUFBUSxpQkFBaUIsUUFBUSxRQUFRLFVBQVUsbUJBQW1CLE9BQU8sV0FBVztBQUNySixjQUFNLEtBQUssZ0JBQWdCLFFBQVEsT0FBTyxRQUFRLGVBQWUsUUFBVyxRQUFRLGFBQWEsT0FBTyxpQkFBaUIsUUFBUSxjQUFjLEtBQUssR0FBRyxRQUFRLFFBQVEsV0FBVyxDQUFDO0FBQUEsTUFDcEw7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsdUJBQXVCLFNBQXdGO0FBQzlILFFBQU0sVUFBVSxxQkFBcUIsT0FBTztBQUM1QyxRQUFNLFlBQVksb0JBQW9CLE9BQU87QUFDN0MsUUFBTSxZQUFZLG1CQUFtQixPQUFPO0FBQzVDLHVCQUFxQixTQUFTLFdBQVcsU0FBUztBQUNsRCxRQUFNLGlCQUFpQixrQkFBa0IsT0FBTztBQUNoRCxNQUFJLFFBQVEsc0JBQXNCLENBQUMsZ0JBQWdCO0FBQ2xELFlBQVEsTUFBTSxLQUFLLEVBQUUsTUFBTSxtQkFBbUIsVUFBVSxDQUFDO0FBQ3pELFlBQVEsTUFBTSxLQUFLO0FBQUEsTUFDbEIsTUFBTSxRQUFRO0FBQUEsTUFDZCxNQUFNLG1CQUFtQjtBQUFBLE1BQ3pCLE9BQU8sUUFBUSxtQkFBbUI7QUFBQSxNQUNsQyxPQUFPLEVBQUUsT0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNO0FBQUEsTUFDeEMsVUFBVTtBQUFBLE1BQ1YsWUFBWTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0Y7QUFDQSxTQUFPLFFBQVE7QUFDaEI7IiwKICAibmFtZXMiOiBbImVudHJ5IiwgImlkIl0KfQo=
