import "./media/modelPicker.css";
import * as dom from "../../../../../../../base/browser/dom.js";
import { renderMarkdown } from "../../../../../../../base/browser/markdownRenderer.js";
import { Button } from "../../../../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { formatTokenCount } from "../../../../../../../base/common/numbers.js";
import { localize } from "../../../../../../../nls.js";
import { defaultButtonStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { ILanguageModelChatMetadata } from "../../../../common/languageModels.js";
import { getPriceCategoryLabel, isAutoModel, isMultiplierPricing } from "./modelPickerPresentation.js";
const SUPPORTED_CONFIG_GROUPS = ["navigation", "tokens"];
function getModelHoverContent(model, isUBB, onConfigure, openerService) {
  const isAuto = isAutoModel(model);
  const promo = !isAuto && ILanguageModelChatMetadata.hasPromoDiscount(model.metadata) ? model.metadata.promo : void 0;
  const container = dom.$(".chat-model-hover");
  const disposables = new DisposableStore();
  const titleRow = dom.$(".chat-model-hover-title-row");
  titleRow.appendChild(dom.$(".chat-model-hover-name", void 0, model.metadata.name));
  const tags = dom.$(".chat-model-hover-title-tags");
  const categoryLabel = !isAuto && !promo ? getCategoryLabel(model.metadata.category) : void 0;
  if (categoryLabel) {
    tags.appendChild(dom.$("span.chat-model-hover-category", void 0, categoryLabel));
  }
  const priceCategoryLabel = !isAuto ? getPriceCategoryLabel(model.metadata.priceCategory) : void 0;
  const badgeLabel = isAuto ? model.metadata.detail : priceCategoryLabel;
  if (badgeLabel) {
    const badge = dom.$("span.chat-model-hover-price-badge", void 0, badgeLabel);
    if (!isAuto && isHighCostCategory(model.metadata.priceCategory)) {
      badge.classList.add("high-cost");
    }
    tags.appendChild(badge);
  }
  if (promo) {
    const discountLabel = localize("chat.promo.discountBadge", "{0}% discount", promo.discountPercent);
    tags.appendChild(dom.$("span.chat-model-hover-price-badge", void 0, discountLabel));
  }
  if (tags.childElementCount > 0) {
    titleRow.appendChild(tags);
  }
  container.appendChild(titleRow);
  if (!isAuto && model.metadata.warningText) {
    for (const message of Object.values(model.metadata.warningText)) {
      const warningContainer = dom.$(".chat-model-hover-warning-text");
      warningContainer.appendChild(renderIcon(Codicon.warning));
      const warningMd = new MarkdownString(message, { isTrusted: false, supportThemeIcons: true });
      const rendered = disposables.add(renderMarkdown(warningMd, {
        actionHandler: (link) => {
          void openerService.open(link, { allowCommands: false, fromUserGesture: true });
        }
      }));
      warningContainer.appendChild(rendered.element);
      container.appendChild(warningContainer);
    }
  }
  if (promo) {
    const promoContainer = dom.$(".chat-model-hover-promo-text");
    promoContainer.appendChild(renderIcon(Codicon.info));
    const endsAtDate = new Date(promo.endsAt);
    const formattedDate = endsAtDate.toLocaleDateString(void 0, { year: "numeric", month: "long", day: "numeric" });
    const promoMessage = promo.message + " " + localize("chat.promo.endsAt", "Ends {0}.", formattedDate);
    const promoMd = new MarkdownString(promoMessage, { isTrusted: false, supportThemeIcons: true });
    const rendered = disposables.add(renderMarkdown(promoMd, {
      actionHandler: (link) => {
        void openerService.open(link, { allowCommands: false, fromUserGesture: true });
      }
    }));
    promoContainer.appendChild(rendered.element);
    container.appendChild(promoContainer);
  }
  let costInfoRendered = false;
  let costTableRendered = false;
  if (!isAuto && isUBB) {
    const metrics = [
      { label: localize("models.inputCostLabel", "Input"), def: model.metadata.inputCost, long: model.metadata.longContextInputCost },
      { label: localize("models.outputCostLabel", "Output"), def: model.metadata.outputCost, long: model.metadata.longContextOutputCost },
      { label: localize("models.cacheCostLabel", "Cache Read"), def: model.metadata.cacheCost, long: model.metadata.longContextCacheCost },
      { label: localize("models.cacheWriteCostLabel", "Cache Write"), def: model.metadata.cacheWriteCost, long: model.metadata.longContextCacheWriteCost }
    ].filter((metric) => metric.def !== void 0 || metric.long !== void 0);
    if (metrics.length > 0) {
      const hasLongContext = metrics.some((metric) => metric.long !== void 0);
      const table = dom.$(".chat-model-hover-cost-table");
      if (hasLongContext) {
        container.classList.add("has-long-context");
        table.classList.add("has-long-context");
      }
      const appendValueCell = (row, cost) => {
        if (cost === void 0) {
          row.appendChild(dom.$("span.chat-model-hover-cost-value.empty"));
          return;
        }
        row.appendChild(dom.$(
          "span.chat-model-hover-cost-value",
          void 0,
          dom.$(
            "span.chat-model-hover-cost-number",
            void 0,
            typeof cost === "number" ? String(cost) : localize("models.cost.unknown", "Unknown")
          )
        ));
      };
      const headerRow = dom.$(".chat-model-hover-cost-row.header");
      headerRow.appendChild(dom.$("span.chat-model-hover-cost-heading", void 0, localize("models.creditsPerMillionTokens", "Credits Per 1M Tokens")));
      if (hasLongContext) {
        headerRow.appendChild(dom.$("span.chat-model-hover-cost-value.subheader", void 0, localize("models.defaultContext", "Default")));
        headerRow.appendChild(dom.$("span.chat-model-hover-cost-value.subheader", void 0, localize("models.longContext", "Long Context")));
      } else {
        headerRow.appendChild(dom.$("span.chat-model-hover-cost-value.subheader"));
      }
      table.appendChild(headerRow);
      for (const metric of metrics) {
        const row = dom.$(".chat-model-hover-cost-row");
        const labelCell = dom.$(".chat-model-hover-cost-label");
        labelCell.appendChild(dom.$("span.chat-model-hover-cost-label-text", void 0, metric.label));
        row.appendChild(labelCell);
        appendValueCell(row, metric.def);
        if (hasLongContext) {
          appendValueCell(row, metric.long);
        }
        table.appendChild(row);
      }
      container.appendChild(table);
      costTableRendered = true;
      costInfoRendered = true;
    } else if (model.metadata.pricing && (isMultiplierPricing(model) || !priceCategoryLabel)) {
      appendCostSection(container, model.metadata.pricing);
      costInfoRendered = true;
    }
  } else if (!isAuto && model.metadata.pricing) {
    appendCostSection(container, model.metadata.pricing);
    costInfoRendered = true;
  }
  if (!costInfoRendered && model.metadata.tooltip) {
    const descriptionMd = new MarkdownString(model.metadata.tooltip, { supportThemeIcons: true });
    const rendered = disposables.add(renderMarkdown(descriptionMd, {
      actionHandler: (link) => {
        void openerService.open(link, { allowCommands: false, fromUserGesture: true });
      }
    }));
    rendered.element.classList.add("chat-model-hover-description");
    container.appendChild(rendered.element);
  }
  if (!isAuto && !costTableRendered && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
    const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
    const contextSection = dom.$(".chat-model-hover-context");
    contextSection.appendChild(dom.$(".chat-model-hover-context-label", void 0, localize("models.contextSize", "Max context")));
    contextSection.appendChild(dom.$(".chat-model-hover-context-value", void 0, formatTokenCount(totalTokens)));
    container.appendChild(contextSection);
  }
  if (!isAuto && model.metadata.configurationSchema?.properties) {
    const configButtons = [];
    const seenGroups = /* @__PURE__ */ new Set();
    for (const propSchema of Object.values(model.metadata.configurationSchema.properties)) {
      if (propSchema.enum && propSchema.enum.length >= 2 && propSchema.group && SUPPORTED_CONFIG_GROUPS.includes(propSchema.group) && !seenGroups.has(propSchema.group)) {
        const label = propSchema.title ?? propSchema.description;
        if (label) {
          seenGroups.add(propSchema.group);
          configButtons.push({ group: propSchema.group, label });
        }
      }
    }
    if (configButtons.length > 0) {
      const configRow = dom.$(".chat-model-hover-configurable");
      configRow.appendChild(dom.$("span.chat-model-hover-configurable-label", void 0, localize("models.configurable", "Configurable")));
      const buttonsContainer = dom.$(".chat-model-hover-configurable-buttons");
      for (const { group, label } of configButtons) {
        const button = disposables.add(new Button(buttonsContainer, {
          ...defaultButtonStyles,
          secondary: true,
          title: label
        }));
        button.label = label;
        disposables.add(button.onDidClick(() => onConfigure?.(group)));
      }
      configRow.appendChild(buttonsContainer);
      container.appendChild(configRow);
    }
  }
  return container.children.length > 0 ? { element: container, disposable: disposables } : void 0;
}
function appendCostSection(container, pricing) {
  const costSection = dom.$(".chat-model-hover-cost");
  costSection.appendChild(dom.$("span", void 0, localize("models.cost", "Cost: {0}", pricing)));
  container.appendChild(costSection);
}
function isHighCostCategory(priceCategory) {
  return priceCategory === "high" || priceCategory === "very_high";
}
function getCategoryLabel(category) {
  switch (category) {
    case void 0:
    case "":
      return void 0;
    case "lightweight":
      return localize("chat.category.lightweight", "Lightweight");
    case "versatile":
      return localize("chat.category.versatile", "Versatile");
    case "powerful":
      return localize("chat.category.powerful", "Powerful");
    default:
      return typeof category === "string" ? category.charAt(0).toUpperCase() + category.slice(1) : void 0;
  }
}
export {
  getModelHoverContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJIb3Zlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9tb2RlbFBpY2tlci5jc3MnO1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGZvcm1hdFRva2VuQ291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGdldFByaWNlQ2F0ZWdvcnlMYWJlbCwgaXNBdXRvTW9kZWwsIGlzTXVsdGlwbGllclByaWNpbmcgfSBmcm9tICcuL21vZGVsUGlja2VyUHJlc2VudGF0aW9uLmpzJztcblxuY29uc3QgU1VQUE9SVEVEX0NPTkZJR19HUk9VUFM6IHJlYWRvbmx5IHN0cmluZ1tdID0gWyduYXZpZ2F0aW9uJywgJ3Rva2VucyddO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNb2RlbFBpY2tlckhvdmVyQ29udGVudCB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RlbEhvdmVyQ29udGVudChcblx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0aXNVQkI6IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdG9uQ29uZmlndXJlOiAoKGdyb3VwOiBzdHJpbmcpID0+IHZvaWQpIHwgdW5kZWZpbmVkLFxuXHRvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcbik6IElNb2RlbFBpY2tlckhvdmVyQ29udGVudCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGlzQXV0byA9IGlzQXV0b01vZGVsKG1vZGVsKTtcblx0Y29uc3QgcHJvbW8gPSAhaXNBdXRvICYmIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLmhhc1Byb21vRGlzY291bnQobW9kZWwubWV0YWRhdGEpID8gbW9kZWwubWV0YWRhdGEucHJvbW8gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3ZlcicpO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdCB0aXRsZVJvdyA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci10aXRsZS1yb3cnKTtcblx0dGl0bGVSb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLW5hbWUnLCB1bmRlZmluZWQsIG1vZGVsLm1ldGFkYXRhLm5hbWUpKTtcblx0Y29uc3QgdGFncyA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci10aXRsZS10YWdzJyk7XG5cdGNvbnN0IGNhdGVnb3J5TGFiZWwgPSAhaXNBdXRvICYmICFwcm9tbyA/IGdldENhdGVnb3J5TGFiZWwobW9kZWwubWV0YWRhdGEuY2F0ZWdvcnkpIDogdW5kZWZpbmVkO1xuXHRpZiAoY2F0ZWdvcnlMYWJlbCkge1xuXHRcdHRhZ3MuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jYXRlZ29yeScsIHVuZGVmaW5lZCwgY2F0ZWdvcnlMYWJlbCkpO1xuXHR9XG5cdGNvbnN0IHByaWNlQ2F0ZWdvcnlMYWJlbCA9ICFpc0F1dG8gPyBnZXRQcmljZUNhdGVnb3J5TGFiZWwobW9kZWwubWV0YWRhdGEucHJpY2VDYXRlZ29yeSkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGJhZGdlTGFiZWwgPSBpc0F1dG8gPyBtb2RlbC5tZXRhZGF0YS5kZXRhaWwgOiBwcmljZUNhdGVnb3J5TGFiZWw7XG5cdGlmIChiYWRnZUxhYmVsKSB7XG5cdFx0Y29uc3QgYmFkZ2UgPSBkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLXByaWNlLWJhZGdlJywgdW5kZWZpbmVkLCBiYWRnZUxhYmVsKTtcblx0XHRpZiAoIWlzQXV0byAmJiBpc0hpZ2hDb3N0Q2F0ZWdvcnkobW9kZWwubWV0YWRhdGEucHJpY2VDYXRlZ29yeSkpIHtcblx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ2hpZ2gtY29zdCcpO1xuXHRcdH1cblx0XHR0YWdzLmFwcGVuZENoaWxkKGJhZGdlKTtcblx0fVxuXHRpZiAocHJvbW8pIHtcblx0XHRjb25zdCBkaXNjb3VudExhYmVsID0gbG9jYWxpemUoJ2NoYXQucHJvbW8uZGlzY291bnRCYWRnZScsIFwiezB9JSBkaXNjb3VudFwiLCBwcm9tby5kaXNjb3VudFBlcmNlbnQpO1xuXHRcdHRhZ3MuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1wcmljZS1iYWRnZScsIHVuZGVmaW5lZCwgZGlzY291bnRMYWJlbCkpO1xuXHR9XG5cdGlmICh0YWdzLmNoaWxkRWxlbWVudENvdW50ID4gMCkge1xuXHRcdHRpdGxlUm93LmFwcGVuZENoaWxkKHRhZ3MpO1xuXHR9XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XG5cblx0aWYgKCFpc0F1dG8gJiYgbW9kZWwubWV0YWRhdGEud2FybmluZ1RleHQpIHtcblx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgT2JqZWN0LnZhbHVlcyhtb2RlbC5tZXRhZGF0YS53YXJuaW5nVGV4dCkpIHtcblx0XHRcdGNvbnN0IHdhcm5pbmdDb250YWluZXIgPSBkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItd2FybmluZy10ZXh0Jyk7XG5cdFx0XHR3YXJuaW5nQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi53YXJuaW5nKSk7XG5cdFx0XHRjb25zdCB3YXJuaW5nTWQgPSBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSwgeyBpc1RydXN0ZWQ6IGZhbHNlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gZGlzcG9zYWJsZXMuYWRkKHJlbmRlck1hcmtkb3duKHdhcm5pbmdNZCwge1xuXHRcdFx0XHRhY3Rpb25IYW5kbGVyOiBsaW5rID0+IHsgdm9pZCBvcGVuZXJTZXJ2aWNlLm9wZW4obGluaywgeyBhbGxvd0NvbW1hbmRzOiBmYWxzZSwgZnJvbVVzZXJHZXN0dXJlOiB0cnVlIH0pOyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0d2FybmluZ0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh3YXJuaW5nQ29udGFpbmVyKTtcblx0XHR9XG5cdH1cblxuXHRpZiAocHJvbW8pIHtcblx0XHRjb25zdCBwcm9tb0NvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1wcm9tby10ZXh0Jyk7XG5cdFx0cHJvbW9Db250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmluZm8pKTtcblx0XHRjb25zdCBlbmRzQXREYXRlID0gbmV3IERhdGUocHJvbW8uZW5kc0F0KTtcblx0XHRjb25zdCBmb3JtYXR0ZWREYXRlID0gZW5kc0F0RGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7IHllYXI6ICdudW1lcmljJywgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycgfSk7XG5cdFx0Y29uc3QgcHJvbW9NZXNzYWdlID0gcHJvbW8ubWVzc2FnZSArICcgJyArIGxvY2FsaXplKCdjaGF0LnByb21vLmVuZHNBdCcsIFwiRW5kcyB7MH0uXCIsIGZvcm1hdHRlZERhdGUpO1xuXHRcdGNvbnN0IHByb21vTWQgPSBuZXcgTWFya2Rvd25TdHJpbmcocHJvbW9NZXNzYWdlLCB7IGlzVHJ1c3RlZDogZmFsc2UsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlbmRlcmVkID0gZGlzcG9zYWJsZXMuYWRkKHJlbmRlck1hcmtkb3duKHByb21vTWQsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IGxpbmsgPT4geyB2b2lkIG9wZW5lclNlcnZpY2Uub3BlbihsaW5rLCB7IGFsbG93Q29tbWFuZHM6IGZhbHNlLCBmcm9tVXNlckdlc3R1cmU6IHRydWUgfSk7IH0sXG5cdFx0fSkpO1xuXHRcdHByb21vQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChwcm9tb0NvbnRhaW5lcik7XG5cdH1cblxuXHRsZXQgY29zdEluZm9SZW5kZXJlZCA9IGZhbHNlO1xuXHRsZXQgY29zdFRhYmxlUmVuZGVyZWQgPSBmYWxzZTtcblx0aWYgKCFpc0F1dG8gJiYgaXNVQkIpIHtcblx0XHRjb25zdCBtZXRyaWNzOiB7IGxhYmVsOiBzdHJpbmc7IGRlZjogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZDsgbG9uZzogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCB9W10gPSBbXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLmlucHV0Q29zdExhYmVsJywgXCJJbnB1dFwiKSwgZGVmOiBtb2RlbC5tZXRhZGF0YS5pbnB1dENvc3QsIGxvbmc6IG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0IH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLm91dHB1dENvc3RMYWJlbCcsIFwiT3V0cHV0XCIpLCBkZWY6IG1vZGVsLm1ldGFkYXRhLm91dHB1dENvc3QsIGxvbmc6IG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0T3V0cHV0Q29zdCB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21vZGVscy5jYWNoZUNvc3RMYWJlbCcsIFwiQ2FjaGUgUmVhZFwiKSwgZGVmOiBtb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QsIGxvbmc6IG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0IH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLmNhY2hlV3JpdGVDb3N0TGFiZWwnLCBcIkNhY2hlIFdyaXRlXCIpLCBkZWY6IG1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0LCBsb25nOiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0IH0sXG5cdFx0XS5maWx0ZXIobWV0cmljID0+IG1ldHJpYy5kZWYgIT09IHVuZGVmaW5lZCB8fCBtZXRyaWMubG9uZyAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdGlmIChtZXRyaWNzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGhhc0xvbmdDb250ZXh0ID0gbWV0cmljcy5zb21lKG1ldHJpYyA9PiBtZXRyaWMubG9uZyAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHRhYmxlID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLWNvc3QtdGFibGUnKTtcblx0XHRcdGlmIChoYXNMb25nQ29udGV4dCkge1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGFzLWxvbmctY29udGV4dCcpO1xuXHRcdFx0XHR0YWJsZS5jbGFzc0xpc3QuYWRkKCdoYXMtbG9uZy1jb250ZXh0Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFwcGVuZFZhbHVlQ2VsbCA9IChyb3c6IEhUTUxFbGVtZW50LCBjb3N0OiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCA9PiB7XG5cdFx0XHRcdGlmIChjb3N0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXZhbHVlLmVtcHR5JykpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXZhbHVlJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC1udW1iZXInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0eXBlb2YgY29zdCA9PT0gJ251bWJlcicgPyBTdHJpbmcoY29zdCkgOiBsb2NhbGl6ZSgnbW9kZWxzLmNvc3QudW5rbm93bicsIFwiVW5rbm93blwiKSksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgaGVhZGVyUm93ID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLWNvc3Qtcm93LmhlYWRlcicpO1xuXHRcdFx0aGVhZGVyUm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC1oZWFkaW5nJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnbW9kZWxzLmNyZWRpdHNQZXJNaWxsaW9uVG9rZW5zJywgXCJDcmVkaXRzIFBlciAxTSBUb2tlbnNcIikpKTtcblx0XHRcdGlmIChoYXNMb25nQ29udGV4dCkge1xuXHRcdFx0XHRoZWFkZXJSb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXZhbHVlLnN1YmhlYWRlcicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ21vZGVscy5kZWZhdWx0Q29udGV4dCcsIFwiRGVmYXVsdFwiKSkpO1xuXHRcdFx0XHRoZWFkZXJSb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXZhbHVlLnN1YmhlYWRlcicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ21vZGVscy5sb25nQ29udGV4dCcsIFwiTG9uZyBDb250ZXh0XCIpKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoZWFkZXJSb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXZhbHVlLnN1YmhlYWRlcicpKTtcblx0XHRcdH1cblx0XHRcdHRhYmxlLmFwcGVuZENoaWxkKGhlYWRlclJvdyk7XG5cblx0XHRcdGZvciAoY29uc3QgbWV0cmljIG9mIG1ldHJpY3MpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLWNvc3Qtcm93Jyk7XG5cdFx0XHRcdGNvbnN0IGxhYmVsQ2VsbCA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb3N0LWxhYmVsJyk7XG5cdFx0XHRcdGxhYmVsQ2VsbC5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLWNvc3QtbGFiZWwtdGV4dCcsIHVuZGVmaW5lZCwgbWV0cmljLmxhYmVsKSk7XG5cdFx0XHRcdHJvdy5hcHBlbmRDaGlsZChsYWJlbENlbGwpO1xuXHRcdFx0XHRhcHBlbmRWYWx1ZUNlbGwocm93LCBtZXRyaWMuZGVmKTtcblx0XHRcdFx0aWYgKGhhc0xvbmdDb250ZXh0KSB7XG5cdFx0XHRcdFx0YXBwZW5kVmFsdWVDZWxsKHJvdywgbWV0cmljLmxvbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRhYmxlLmFwcGVuZENoaWxkKHJvdyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0YWJsZSk7XG5cdFx0XHRjb3N0VGFibGVSZW5kZXJlZCA9IHRydWU7XG5cdFx0XHRjb3N0SW5mb1JlbmRlcmVkID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKG1vZGVsLm1ldGFkYXRhLnByaWNpbmcgJiYgKGlzTXVsdGlwbGllclByaWNpbmcobW9kZWwpIHx8ICFwcmljZUNhdGVnb3J5TGFiZWwpKSB7XG5cdFx0XHRhcHBlbmRDb3N0U2VjdGlvbihjb250YWluZXIsIG1vZGVsLm1ldGFkYXRhLnByaWNpbmcpO1xuXHRcdFx0Y29zdEluZm9SZW5kZXJlZCA9IHRydWU7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKCFpc0F1dG8gJiYgbW9kZWwubWV0YWRhdGEucHJpY2luZykge1xuXHRcdGFwcGVuZENvc3RTZWN0aW9uKGNvbnRhaW5lciwgbW9kZWwubWV0YWRhdGEucHJpY2luZyk7XG5cdFx0Y29zdEluZm9SZW5kZXJlZCA9IHRydWU7XG5cdH1cblxuXHRpZiAoIWNvc3RJbmZvUmVuZGVyZWQgJiYgbW9kZWwubWV0YWRhdGEudG9vbHRpcCkge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uTWQgPSBuZXcgTWFya2Rvd25TdHJpbmcobW9kZWwubWV0YWRhdGEudG9vbHRpcCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRjb25zdCByZW5kZXJlZCA9IGRpc3Bvc2FibGVzLmFkZChyZW5kZXJNYXJrZG93bihkZXNjcmlwdGlvbk1kLCB7XG5cdFx0XHRhY3Rpb25IYW5kbGVyOiBsaW5rID0+IHsgdm9pZCBvcGVuZXJTZXJ2aWNlLm9wZW4obGluaywgeyBhbGxvd0NvbW1hbmRzOiBmYWxzZSwgZnJvbVVzZXJHZXN0dXJlOiB0cnVlIH0pOyB9LFxuXHRcdH0pKTtcblx0XHRyZW5kZXJlZC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtbW9kZWwtaG92ZXItZGVzY3JpcHRpb24nKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdH1cblxuXHRpZiAoIWlzQXV0byAmJiAhY29zdFRhYmxlUmVuZGVyZWQgJiYgKG1vZGVsLm1ldGFkYXRhLm1heElucHV0VG9rZW5zIHx8IG1vZGVsLm1ldGFkYXRhLm1heE91dHB1dFRva2VucykpIHtcblx0XHRjb25zdCB0b3RhbFRva2VucyA9IChtb2RlbC5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyA/PyAwKSArIChtb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0Y29uc3QgY29udGV4dFNlY3Rpb24gPSBkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItY29udGV4dCcpO1xuXHRcdGNvbnRleHRTZWN0aW9uLmFwcGVuZENoaWxkKGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb250ZXh0LWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnbW9kZWxzLmNvbnRleHRTaXplJywgXCJNYXggY29udGV4dFwiKSkpO1xuXHRcdGNvbnRleHRTZWN0aW9uLmFwcGVuZENoaWxkKGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb250ZXh0LXZhbHVlJywgdW5kZWZpbmVkLCBmb3JtYXRUb2tlbkNvdW50KHRvdGFsVG9rZW5zKSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZXh0U2VjdGlvbik7XG5cdH1cblxuXHRpZiAoIWlzQXV0byAmJiBtb2RlbC5tZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hPy5wcm9wZXJ0aWVzKSB7XG5cdFx0Y29uc3QgY29uZmlnQnV0dG9uczogeyBncm91cDogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW5Hcm91cHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHByb3BTY2hlbWEgb2YgT2JqZWN0LnZhbHVlcyhtb2RlbC5tZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRpZiAocHJvcFNjaGVtYS5lbnVtICYmIHByb3BTY2hlbWEuZW51bS5sZW5ndGggPj0gMiAmJiBwcm9wU2NoZW1hLmdyb3VwICYmIFNVUFBPUlRFRF9DT05GSUdfR1JPVVBTLmluY2x1ZGVzKHByb3BTY2hlbWEuZ3JvdXApICYmICFzZWVuR3JvdXBzLmhhcyhwcm9wU2NoZW1hLmdyb3VwKSkge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IHByb3BTY2hlbWEudGl0bGUgPz8gcHJvcFNjaGVtYS5kZXNjcmlwdGlvbjtcblx0XHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdFx0c2Vlbkdyb3Vwcy5hZGQocHJvcFNjaGVtYS5ncm91cCk7XG5cdFx0XHRcdFx0Y29uZmlnQnV0dG9ucy5wdXNoKHsgZ3JvdXA6IHByb3BTY2hlbWEuZ3JvdXAsIGxhYmVsIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjb25maWdCdXR0b25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbmZpZ1JvdyA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb25maWd1cmFibGUnKTtcblx0XHRcdGNvbmZpZ1Jvdy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLWNvbmZpZ3VyYWJsZS1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ21vZGVscy5jb25maWd1cmFibGUnLCBcIkNvbmZpZ3VyYWJsZVwiKSkpO1xuXHRcdFx0Y29uc3QgYnV0dG9uc0NvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb25maWd1cmFibGUtYnV0dG9ucycpO1xuXHRcdFx0Zm9yIChjb25zdCB7IGdyb3VwLCBsYWJlbCB9IG9mIGNvbmZpZ0J1dHRvbnMpIHtcblx0XHRcdFx0Y29uc3QgYnV0dG9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oYnV0dG9uc0NvbnRhaW5lciwge1xuXHRcdFx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBsYWJlbCxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRidXR0b24ubGFiZWwgPSBsYWJlbDtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IG9uQ29uZmlndXJlPy4oZ3JvdXApKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25maWdSb3cuYXBwZW5kQ2hpbGQoYnV0dG9uc0NvbnRhaW5lcik7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY29uZmlnUm93KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gY29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCA+IDAgPyB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgZGlzcG9zYWJsZTogZGlzcG9zYWJsZXMgfSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gYXBwZW5kQ29zdFNlY3Rpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcHJpY2luZzogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGNvc3RTZWN0aW9uID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLWNvc3QnKTtcblx0Y29zdFNlY3Rpb24uYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGxvY2FsaXplKCdtb2RlbHMuY29zdCcsIFwiQ29zdDogezB9XCIsIHByaWNpbmcpKSk7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjb3N0U2VjdGlvbik7XG59XG5cbmZ1bmN0aW9uIGlzSGlnaENvc3RDYXRlZ29yeShwcmljZUNhdGVnb3J5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIHByaWNlQ2F0ZWdvcnkgPT09ICdoaWdoJyB8fCBwcmljZUNhdGVnb3J5ID09PSAndmVyeV9oaWdoJztcbn1cblxuZnVuY3Rpb24gZ2V0Q2F0ZWdvcnlMYWJlbChjYXRlZ29yeTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChjYXRlZ29yeSkge1xuXHRcdGNhc2UgdW5kZWZpbmVkOlxuXHRcdGNhc2UgJyc6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdGNhc2UgJ2xpZ2h0d2VpZ2h0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5jYXRlZ29yeS5saWdodHdlaWdodCcsIFwiTGlnaHR3ZWlnaHRcIik7XG5cdFx0Y2FzZSAndmVyc2F0aWxlJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5jYXRlZ29yeS52ZXJzYXRpbGUnLCBcIlZlcnNhdGlsZVwiKTtcblx0XHRjYXNlICdwb3dlcmZ1bCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQuY2F0ZWdvcnkucG93ZXJmdWwnLCBcIlBvd2VyZnVsXCIpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdHlwZW9mIGNhdGVnb3J5ID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IGNhdGVnb3J5LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgY2F0ZWdvcnkuc2xpY2UoMSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFFUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtDQUEyRTtBQUNwRixTQUFTLHVCQUF1QixhQUFhLDJCQUEyQjtBQUV4RSxNQUFNLDBCQUE2QyxDQUFDLGNBQWMsUUFBUTtBQU9uRSxTQUFTLHFCQUNmLE9BQ0EsT0FDQSxhQUNBLGVBQ3VDO0FBQ3ZDLFFBQU0sU0FBUyxZQUFZLEtBQUs7QUFDaEMsUUFBTSxRQUFRLENBQUMsVUFBVSwyQkFBMkIsaUJBQWlCLE1BQU0sUUFBUSxJQUFJLE1BQU0sU0FBUyxRQUFRO0FBQzlHLFFBQU0sWUFBWSxJQUFJLEVBQUUsbUJBQW1CO0FBQzNDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxRQUFNLFdBQVcsSUFBSSxFQUFFLDZCQUE2QjtBQUNwRCxXQUFTLFlBQVksSUFB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
