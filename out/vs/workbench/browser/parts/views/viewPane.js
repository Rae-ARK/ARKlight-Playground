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
import "./media/paneviewlet.css";
import * as nls from "../../../../nls.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { asCssVariable, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { after, append, $, trackFocus, EventType, addDisposableListener, Dimension, reset, isAncestorOfActiveElement, isActiveElement } from "../../../../base/browser/dom.js";
import { createCSSRule } from "../../../../base/browser/domStylesheets.js";
import { asCssValueWithDefault, asCSSUrl } from "../../../../base/browser/cssValue.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Action } from "../../../../base/common/actions.js";
import { ActionsOrientation, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Pane } from "../../../../base/browser/ui/splitview/paneview.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ViewContainerExtensions, IViewDescriptorService, ViewContainerLocation, defaultViewIcon, ViewContainerLocationToString } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { MenuId, Action2, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { AbstractProgressScope, ScopedProgressIndicator } from "../../../services/progress/browser/progressIndicator.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { URI } from "../../../../base/common/uri.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { FilterWidget } from "./viewFilter.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { defaultButtonStyles, defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { PANEL_BACKGROUND, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_STICKY_SCROLL_BACKGROUND, PANEL_STICKY_SCROLL_BORDER, PANEL_STICKY_SCROLL_SHADOW, SIDE_BAR_BACKGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BORDER, SIDE_BAR_STICKY_SCROLL_SHADOW } from "../../../common/theme.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ViewMenuActions } from "./viewMenuActions.js";
var ViewPaneShowActions = /* @__PURE__ */ ((ViewPaneShowActions2) => {
  ViewPaneShowActions2[ViewPaneShowActions2["Default"] = 0] = "Default";
  ViewPaneShowActions2[ViewPaneShowActions2["WhenExpanded"] = 1] = "WhenExpanded";
  ViewPaneShowActions2[ViewPaneShowActions2["Always"] = 2] = "Always";
  return ViewPaneShowActions2;
})(ViewPaneShowActions || {});
const VIEWPANE_FILTER_ACTION = new Action("viewpane.action.filter");
const viewPaneContainerExpandedIcon = registerIcon("view-pane-container-expanded", Codicon.chevronDown, nls.localize("viewPaneContainerExpandedIcon", "Icon for an expanded view pane container."));
const viewPaneContainerCollapsedIcon = registerIcon("view-pane-container-collapsed", Codicon.chevronRight, nls.localize("viewPaneContainerCollapsedIcon", "Icon for a collapsed view pane container."));
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
let ViewWelcomeController = class {
  constructor(container, delegate, instantiationService, openerService, contextKeyService, lifecycleService) {
    this.container = container;
    this.delegate = delegate;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.contextKeyService = contextKeyService;
    this.items = [];
    this._enabled = false;
    this._wide = false;
    this.disposables = new DisposableStore();
    this.enabledDisposables = this.disposables.add(new DisposableStore());
    this.renderDisposables = this.disposables.add(new DisposableStore());
    this.disposables.add(Event.runAndSubscribe(this.delegate.onDidChangeViewWelcomeState, () => this.onDidChangeViewWelcomeState()));
    this.disposables.add(lifecycleService.onWillShutdown(() => this.dispose()));
  }
  get enabled() {
    return this._enabled;
  }
  layout(height, width) {
    if (!this._enabled) {
      return;
    }
    this.element.style.height = `${height}px`;
    this.element.style.width = `${width}px`;
    this._wide = width > 640;
    this.element.classList.toggle("wide", this._wide);
    this.scrollableElement.scanDomNode();
  }
  focus() {
    if (!this._enabled) {
      return;
    }
    this.element.focus();
  }
  onDidChangeViewWelcomeState() {
    const enabled = this.delegate.shouldShowWelcome();
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    if (!enabled) {
      this.enabledDisposables.clear();
      return;
    }
    this.container.classList.add("welcome");
    const viewWelcomeContainer = append(this.container, $(".welcome-view"));
    this.element = $(".welcome-view-content", { tabIndex: 0, role: "region", "aria-label": nls.localize("welcomeViewAriaLabel", "Welcome") });
    if (this._wide) {
      this.element.classList.add("wide");
    }
    this.scrollableElement = new DomScrollableElement(this.element, { alwaysConsumeMouseWheel: true, horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Visible });
    append(viewWelcomeContainer, this.scrollableElement.getDomNode());
    this.enabledDisposables.add(toDisposable(() => {
      this.container.classList.remove("welcome");
      this.scrollableElement.dispose();
      viewWelcomeContainer.remove();
      this.scrollableElement = void 0;
      this.element = void 0;
    }));
    this.contextKeyService.onDidChangeContext(this.onDidChangeContext, this, this.enabledDisposables);
    Event.chain(viewsRegistry.onDidChangeViewWelcomeContent, ($2) => $2.filter((id) => id === this.delegate.id))(this.onDidChangeViewWelcomeContent, this, this.enabledDisposables);
    this.onDidChangeViewWelcomeContent();
  }
  onDidChangeViewWelcomeContent() {
    const descriptors = viewsRegistry.getViewWelcomeContent(this.delegate.id);
    this.items = [];
    for (const descriptor of descriptors) {
      if (descriptor.when === "default") {
        this.defaultItem = { descriptor, visible: true };
      } else {
        const visible = descriptor.when ? this.contextKeyService.contextMatchesRules(descriptor.when) : true;
        this.items.push({ descriptor, visible });
      }
    }
    this.render();
  }
  onDidChangeContext() {
    let didChange = false;
    for (const item of this.items) {
      if (!item.descriptor.when || item.descriptor.when === "default") {
        continue;
      }
      const visible = this.contextKeyService.contextMatchesRules(item.descriptor.when);
      if (item.visible === visible) {
        continue;
      }
      item.visible = visible;
      didChange = true;
    }
    if (didChange) {
      this.render();
    }
  }
  render() {
    this.renderDisposables.clear();
    this.element.textContent = "";
    const contents = this.getContentDescriptors();
    if (contents.length === 0) {
      this.container.classList.remove("welcome");
      this.scrollableElement.scanDomNode();
      return;
    }
    let buttonsCount = 0;
    for (const { content, precondition, renderSecondaryButtons } of contents) {
      const lines = content.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line) {
          continue;
        }
        const linkedText = parseLinkedText(line);
        if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== "string") {
          const node = linkedText.nodes[0];
          const buttonContainer = append(this.element, $(".button-container"));
          const button = new Button(buttonContainer, { title: node.title, supportIcons: true, secondary: !!(renderSecondaryButtons && buttonsCount > 0), ...defaultButtonStyles });
          button.label = node.label;
          button.onDidClick((_) => {
            this.openerService.open(node.href, { allowCommands: true });
          }, null, this.renderDisposables);
          this.renderDisposables.add(button);
          buttonsCount++;
          if (precondition) {
            const updateEnablement = () => button.enabled = this.contextKeyService.contextMatchesRules(precondition);
            updateEnablement();
            const keys = new Set(precondition.keys());
            const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(keys));
            onDidChangeContext(updateEnablement, null, this.renderDisposables);
          }
        } else {
          const p = append(this.element, $("p"));
          for (const node of linkedText.nodes) {
            if (typeof node === "string") {
              append(p, ...renderLabelWithIcons(node));
            } else {
              const link = this.renderDisposables.add(this.instantiationService.createInstance(Link, p, node, {}));
              if (precondition && node.href.startsWith("command:")) {
                const updateEnablement = () => link.enabled = this.contextKeyService.contextMatchesRules(precondition);
                updateEnablement();
                const keys = new Set(precondition.keys());
                const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(keys));
                onDidChangeContext(updateEnablement, null, this.renderDisposables);
              }
            }
          }
        }
      }
    }
    this.container.classList.add("welcome");
    this.scrollableElement.scanDomNode();
  }
  getContentDescriptors() {
    const visibleItems = this.items.filter((v) => v.visible);
    if (visibleItems.length === 0 && this.defaultItem) {
      return [this.defaultItem.descriptor];
    }
    return visibleItems.map((v) => v.descriptor);
  }
  dispose() {
    this.disposables.dispose();
  }
};
ViewWelcomeController = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, ILifecycleService)
], ViewWelcomeController);
let ViewPane = class extends Pane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewInformationService) {
    super({ ...options, ...{ orientation: viewDescriptorService.getViewLocationById(options.id) === ViewContainerLocation.Panel ? Orientation.HORIZONTAL : Orientation.VERTICAL } });
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.viewDescriptorService = viewDescriptorService;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.themeService = themeService;
    this.hoverService = hoverService;
    this.accessibleViewInformationService = accessibleViewInformationService;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onDidChangeBodyVisibility = this._register(new Emitter());
    this.onDidChangeBodyVisibility = this._onDidChangeBodyVisibility.event;
    this._onDidChangeTitleArea = this._register(new Emitter());
    this.onDidChangeTitleArea = this._onDidChangeTitleArea.event;
    this._onDidChangeViewWelcomeState = this._register(new Emitter());
    this.onDidChangeViewWelcomeState = this._onDidChangeViewWelcomeState.event;
    this._isVisible = false;
    this.headerActionViewItems = this._register(new DisposableMap());
    this.id = options.id;
    this._title = options.title;
    this._titleDescription = options.titleDescription;
    this._singleViewPaneContainerTitle = options.singleViewPaneContainerTitle;
    this.showActions = options.showActions ?? 0 /* Default */;
    this.scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
    this.scopedContextKeyService.createKey("view", this.id);
    const viewLocationKey = this.scopedContextKeyService.createKey("viewLocation", ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)));
    this._register(Event.filter(viewDescriptorService.onDidChangeLocation, (e) => e.views.some((view) => view.id === this.id))(() => viewLocationKey.set(ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)))));
    const childInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this.menuActions = this._register(childInstantiationService.createInstance(ViewMenuActions, options.titleMenuId ?? MenuId.ViewTitle, MenuId.ViewTitleContext, { shouldForwardArgs: !options.donotForwardArgs, renderShortTitle: true }, { primaryActionGroups: this.primaryActionGroups }));
    this._register(this.menuActions.onDidChange(() => this.updateActions()));
  }
  get title() {
    return this._title;
  }
  get titleDescription() {
    return this._titleDescription;
  }
  get singleViewPaneContainerTitle() {
    return this._singleViewPaneContainerTitle;
  }
  /**
   * Additional menu groups (beyond `navigation`) whose actions should be
   * rendered as primary (inline) actions in the title action bar. Separators
   * are rendered between groups in the primary actions. Subclasses can
   * override this to customize grouping in the title action bar.
   */
  get primaryActionGroups() {
    return void 0;
  }
  get headerVisible() {
    return super.headerVisible;
  }
  set headerVisible(visible) {
    super.headerVisible = visible;
    this.element.classList.toggle("merged-header", !visible);
  }
  setVisible(visible) {
    if (this._isVisible !== visible) {
      this._isVisible = visible;
      if (this.isExpanded()) {
        this._onDidChangeBodyVisibility.fire(visible);
      }
    }
  }
  isVisible() {
    return this._isVisible;
  }
  isBodyVisible() {
    return this._isVisible && this.isExpanded();
  }
  setExpanded(expanded) {
    const changed = super.setExpanded(expanded);
    if (changed) {
      this._onDidChangeBodyVisibility.fire(expanded);
    }
    this.updateTwistyIcon();
    return changed;
  }
  render() {
    super.render();
    const focusTracker = trackFocus(this.element);
    this._register(focusTracker);
    this._register(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
    this._register(focusTracker.onDidBlur(() => this._onDidBlur.fire()));
  }
  renderHeader(container) {
    this.headerContainer = container;
    this.twistiesContainer = append(container, $(`.twisty-container${ThemeIcon.asCSSSelector(this.getTwistyIcon(this.isExpanded()))}`));
    this.renderHeaderTitle(container, this.title);
    const actions = append(container, $(".actions"));
    actions.classList.toggle("show-always", this.showActions === 2 /* Always */);
    actions.classList.toggle("show-expanded", this.showActions === 1 /* WhenExpanded */);
    this.toolbar = this.instantiationService.createInstance(WorkbenchToolBar, actions, {
      orientation: ActionsOrientation.HORIZONTAL,
      actionViewItemProvider: (action, options) => {
        const item = this.createActionViewItem(action, options);
        if (item) {
          this.headerActionViewItems.set(item.action.id, item);
        }
        return item;
      },
      ariaLabel: nls.localize("viewToolbarAriaLabel", "{0} actions", this.title),
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      renderDropdownAsChildElement: true,
      actionRunner: this.getActionRunner(),
      resetMenu: this.menuActions.menuId
    });
    this._register(this.toolbar);
    this.setActions();
    this._register(addDisposableListener(actions, EventType.CLICK, (e) => e.preventDefault()));
    const viewContainerModel = this.viewDescriptorService.getViewContainerByViewId(this.id);
    if (viewContainerModel) {
      this._register(this.viewDescriptorService.getViewContainerModel(viewContainerModel).onDidChangeContainerInfo(({ title }) => this.updateTitle(this.title)));
    } else {
      console.error(`View container model not found for view ${this.id}`);
    }
    const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ViewPane.AlwaysShowActionsConfig));
    this._register(onDidRelevantConfigurationChange(this.updateActionsVisibility, this));
    this.updateActionsVisibility();
  }
  updateHeader() {
    super.updateHeader();
    this.updateTwistyIcon();
  }
  updateTwistyIcon() {
    if (this.twistiesContainer) {
      this.twistiesContainer.classList.remove(...ThemeIcon.asClassNameArray(this.getTwistyIcon(!this._expanded)));
      this.twistiesContainer.classList.add(...ThemeIcon.asClassNameArray(this.getTwistyIcon(this._expanded)));
    }
  }
  getTwistyIcon(expanded) {
    return expanded ? viewPaneContainerExpandedIcon : viewPaneContainerCollapsedIcon;
  }
  style(styles) {
    super.style(styles);
    const icon = this.getIcon();
    if (this.iconContainer) {
      const fgColor = asCssValueWithDefault(styles.headerForeground, asCssVariable(foreground));
      if (URI.isUri(icon)) {
        this.iconContainer.style.backgroundColor = fgColor;
        this.iconContainer.style.color = "";
      } else {
        this.iconContainer.style.color = fgColor;
        this.iconContainer.style.backgroundColor = "";
      }
    }
  }
  getIcon() {
    return this.viewDescriptorService.getViewDescriptorById(this.id)?.containerIcon || defaultViewIcon;
  }
  renderHeaderTitle(container, title) {
    this.iconContainer = append(container, $(".icon", void 0));
    const icon = this.getIcon();
    let cssClass = void 0;
    if (URI.isUri(icon)) {
      cssClass = `view-${this.id.replace(/[\.\:]/g, "-")}`;
      const iconClass = `.pane-header .icon.${cssClass}`;
      createCSSRule(iconClass, `
				mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				-webkit-mask-size: 16px;
			`);
    } else if (ThemeIcon.isThemeIcon(icon)) {
      cssClass = ThemeIcon.asClassName(icon);
    }
    if (cssClass) {
      this.iconContainer.classList.add(...cssClass.split(" "));
    }
    const calculatedTitle = this.calculateTitle(title);
    this.titleContainer = append(container, $("h3.title", {}, calculatedTitle));
    this.titleContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.titleContainer, calculatedTitle));
    if (this._titleDescription) {
      this.setTitleDescription(this._titleDescription);
    }
    this.iconContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.iconContainer, calculatedTitle));
    this.iconContainer.setAttribute("aria-label", this._getAriaLabel(calculatedTitle, this._titleDescription));
  }
  _getAriaLabel(title, description) {
    const viewHasAccessibilityHelpContent = this.viewDescriptorService.getViewDescriptorById(this.id)?.accessibilityHelpContent;
    const accessibleViewHasShownForView = this.accessibleViewInformationService?.hasShownAccessibleView(this.id);
    if (!viewHasAccessibilityHelpContent || accessibleViewHasShownForView) {
      if (description) {
        return `${title} - ${description}`;
      } else {
        return title;
      }
    }
    return nls.localize("viewAccessibilityHelp", "Use Alt+F1 for accessibility help {0}", title);
  }
  updateTitle(title) {
    const calculatedTitle = this.calculateTitle(title);
    if (this.titleContainer) {
      this.titleContainer.textContent = calculatedTitle;
      this.titleContainerHover?.update(calculatedTitle);
    }
    this.updateAriaHeaderLabel(calculatedTitle, this._titleDescription);
    this._title = title;
    this._onDidChangeTitleArea.fire();
  }
  updateAriaHeaderLabel(title, description) {
    const ariaLabel = this._getAriaLabel(title, description);
    if (this.iconContainer) {
      this.iconContainerHover?.update(title);
      this.iconContainer.setAttribute("aria-label", ariaLabel);
    }
    this.ariaHeaderLabel = this.getAriaHeaderLabel(ariaLabel);
  }
  setTitleDescription(description) {
    if (this.titleDescriptionContainer) {
      this.titleDescriptionContainer.textContent = description ?? "";
      this.titleDescriptionContainerHover?.update(description ?? "");
    } else if (description && this.titleContainer) {
      this.titleDescriptionContainer = after(this.titleContainer, $("span.description", {}, description));
      this.titleDescriptionContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.titleDescriptionContainer, description));
    }
  }
  updateTitleDescription(description) {
    this.setTitleDescription(description);
    this.updateAriaHeaderLabel(this._title, description);
    this._titleDescription = description;
    this._onDidChangeTitleArea.fire();
  }
  calculateTitle(title) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(this.id);
    const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
    const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(this.id);
    const isDefault = this.viewDescriptorService.getDefaultContainerById(this.id) === viewContainer;
    if (!isDefault && viewDescriptor?.containerTitle && model.title !== viewDescriptor.containerTitle && title !== viewDescriptor.containerTitle) {
      return `${viewDescriptor.containerTitle}: ${title}`;
    }
    return title;
  }
  renderBody(container) {
    this.viewWelcomeController = this._register(this.instantiationService.createInstance(ViewWelcomeController, container, this));
  }
  layoutBody(height, width) {
    this.viewWelcomeController?.layout(height, width);
  }
  onDidScrollRoot() {
  }
  getProgressIndicator() {
    if (this.progressBar === void 0) {
      this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
      this.progressBar.hide();
    }
    if (this.progressIndicator === void 0) {
      const that = this;
      this.progressIndicator = this._register(new ScopedProgressIndicator(assertReturnsDefined(this.progressBar), this._register(new class extends AbstractProgressScope {
        constructor() {
          super(that.id, that.isBodyVisible());
          this._register(that.onDidChangeBodyVisibility((isVisible) => isVisible ? this.onScopeOpened(that.id) : this.onScopeClosed(that.id)));
        }
      }())));
    }
    return this.progressIndicator;
  }
  getProgressLocation() {
    return this.viewDescriptorService.getViewContainerByViewId(this.id).id;
  }
  getLocationBasedColors() {
    return getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id));
  }
  focus() {
    if (this.viewWelcomeController?.enabled) {
      this.viewWelcomeController.focus();
    } else if (this.element) {
      this.element.focus();
    }
    if (isActiveElement(this.element) || isAncestorOfActiveElement(this.element)) {
      this._onDidFocus.fire();
    }
  }
  setActions() {
    if (this.toolbar) {
      const primaryActions = [...this.menuActions.getPrimaryActions()];
      if (this.shouldShowFilterInHeader()) {
        primaryActions.unshift(VIEWPANE_FILTER_ACTION);
      }
      this.toolbar.setActions(prepareActions(primaryActions), prepareActions(this.menuActions.getSecondaryActions()));
      this.toolbar.context = this.getActionsContext();
    }
  }
  updateActionsVisibility() {
    if (!this.headerContainer) {
      return;
    }
    const shouldAlwaysShowActions = this.configurationService.getValue("workbench.view.alwaysShowHeaderActions");
    this.headerContainer.classList.toggle("actions-always-visible", shouldAlwaysShowActions);
  }
  updateActions() {
    this.setActions();
    this._onDidChangeTitleArea.fire();
  }
  createActionViewItem(action, options) {
    if (action.id === VIEWPANE_FILTER_ACTION.id) {
      const that = this;
      return new class extends BaseActionViewItem {
        constructor() {
          super(null, action);
        }
        setFocusable() {
        }
        get trapsArrowNavigation() {
          return true;
        }
        render(container) {
          container.classList.add("viewpane-filter-container");
          const filter = that.getFilterWidget();
          append(container, filter.element);
          filter.relayout();
        }
      }();
    }
    return createActionViewItem(this.instantiationService, action, { ...options, ...{ menuAsChild: action instanceof SubmenuItemAction } });
  }
  getActionsContext() {
    return void 0;
  }
  getActionRunner() {
    return void 0;
  }
  getOptimalWidth() {
    return 0;
  }
  saveState() {
  }
  shouldShowWelcome() {
    return false;
  }
  getFilterWidget() {
    return void 0;
  }
  shouldShowFilterInHeader() {
    return false;
  }
};
ViewPane.AlwaysShowActionsConfig = "workbench.view.alwaysShowHeaderActions";
ViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService)
], ViewPane);
let FilterViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
    const childInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, options.filterOptions));
    this._register(this.filterWidget.onDidAcceptFilterText(() => this.focusBodyContent()));
  }
  getFilterWidget() {
    return this.filterWidget;
  }
  renderBody(container) {
    super.renderBody(container);
    this.filterContainer = append(container, $(".viewpane-filter-container"));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.dimension = new Dimension(width, height);
    const wasFilterShownInHeader = !this.filterContainer?.hasChildNodes();
    const shouldShowFilterInHeader = this.shouldShowFilterInHeader();
    if (wasFilterShownInHeader !== shouldShowFilterInHeader) {
      if (shouldShowFilterInHeader) {
        reset(this.filterContainer);
      }
      this.updateActions();
      if (!shouldShowFilterInHeader) {
        append(this.filterContainer, this.filterWidget.element);
      }
    }
    if (!shouldShowFilterInHeader) {
      height = height - 44;
    }
    this.filterWidget.layout(width);
    this.layoutBodyContent(height, width);
  }
  shouldShowFilterInHeader() {
    return !(this.dimension && this.dimension.width < 600 && this.dimension.height > 100);
  }
  focusBodyContent() {
    this.focus();
  }
};
FilterViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService)
], FilterViewPane);
function getLocationBasedViewColors(location) {
  let background, overlayBackground, stickyScrollBackground, stickyScrollBorder, stickyScrollShadow;
  switch (location) {
    case ViewContainerLocation.Panel:
      background = PANEL_BACKGROUND;
      overlayBackground = PANEL_SECTION_DRAG_AND_DROP_BACKGROUND;
      stickyScrollBackground = PANEL_STICKY_SCROLL_BACKGROUND;
      stickyScrollBorder = PANEL_STICKY_SCROLL_BORDER;
      stickyScrollShadow = PANEL_STICKY_SCROLL_SHADOW;
      break;
    case ViewContainerLocation.Sidebar:
    case ViewContainerLocation.AuxiliaryBar:
    default:
      background = SIDE_BAR_BACKGROUND;
      overlayBackground = SIDE_BAR_DRAG_AND_DROP_BACKGROUND;
      stickyScrollBackground = SIDE_BAR_STICKY_SCROLL_BACKGROUND;
      stickyScrollBorder = SIDE_BAR_STICKY_SCROLL_BORDER;
      stickyScrollShadow = SIDE_BAR_STICKY_SCROLL_SHADOW;
  }
  return {
    background,
    overlayBackground,
    listOverrideStyles: {
      listBackground: background,
      treeStickyScrollBackground: stickyScrollBackground,
      treeStickyScrollBorder: stickyScrollBorder,
      treeStickyScrollShadow: stickyScrollShadow
    }
  };
}
class ViewAction extends Action2 {
  constructor(desc) {
    super(desc);
    this.desc = desc;
  }
  run(accessor, ...args) {
    const view = accessor.get(IViewsService).getActiveViewWithId(this.desc.viewId);
    if (view) {
      return this.runInView(accessor, view, ...args);
    }
    return void 0;
  }
}
export {
  FilterViewPane,
  VIEWPANE_FILTER_ACTION,
  ViewAction,
  ViewPane,
  ViewPaneShowActions,
  getLocationBasedViewColors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3BhbmV2aWV3bGV0LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgZm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGFmdGVyLCBhcHBlbmQsICQsIHRyYWNrRm9jdXMsIEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBEaW1lbnNpb24sIHJlc2V0LCBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50LCBpc0FjdGl2ZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNTU1J1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYWx1ZVdpdGhEZWZhdWx0LCBhc0NTU1VybCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIElBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbnNPcmllbnRhdGlvbiwgSUFjdGlvblZpZXdJdGVtLCBwcmVwYXJlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElQYW5lT3B0aW9ucywgUGFuZSwgSVBhbmVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3BhbmV2aWV3LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucywgSVZpZXcsIElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdzUmVnaXN0cnksIElWaWV3Q29udGVudERlc2NyaXB0b3IsIGRlZmF1bHRWaWV3SWNvbiwgVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCwgUGFydGlhbEV4Y2VwdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTWVudUlkLCBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IEFic3RyYWN0UHJvZ3Jlc3NTY29wZSwgU2NvcGVkUHJvZ3Jlc3NJbmRpY2F0b3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcm9ncmVzcy9icm93c2VyL3Byb2dyZXNzSW5kaWNhdG9yLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc0luZGljYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgRmlsdGVyV2lkZ2V0LCBJRmlsdGVyV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4vdmlld0ZpbHRlci5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCwgUEFORUxfU0VDVElPTl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsIFBBTkVMX1NUSUNLWV9TQ1JPTExfQkFDS0dST1VORCwgUEFORUxfU1RJQ0tZX1NDUk9MTF9CT1JERVIsIFBBTkVMX1NUSUNLWV9TQ1JPTExfU0hBRE9XLCBTSURFX0JBUl9CQUNLR1JPVU5ELCBTSURFX0JBUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsIFNJREVfQkFSX1NUSUNLWV9TQ1JPTExfQkFDS0dST1VORCwgU0lERV9CQVJfU1RJQ0tZX1NDUk9MTF9CT1JERVIsIFNJREVfQkFSX1NUSUNLWV9TQ1JPTExfU0hBRE9XIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld0luZm9ybWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IFZpZXdNZW51QWN0aW9ucyB9IGZyb20gJy4vdmlld01lbnVBY3Rpb25zLmpzJztcblxuZXhwb3J0IGVudW0gVmlld1BhbmVTaG93QWN0aW9ucyB7XG5cdC8qKiBTaG93IHRoZSBhY3Rpb25zIHdoZW4gdGhlIHZpZXcgaXMgaG92ZXJlZC4gVGhpcyBpcyB0aGUgZGVmYXVsdCBiZWhhdmlvci4gKi9cblx0RGVmYXVsdCxcblxuXHQvKiogQWx3YXlzIHNob3dzIHRoZSBhY3Rpb25zIHdoZW4gdGhlIHZpZXcgaXMgZXhwYW5kZWQgKi9cblx0V2hlbkV4cGFuZGVkLFxuXG5cdC8qKiBBbHdheXMgc2hvd3MgdGhlIGFjdGlvbnMgKi9cblx0QWx3YXlzLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3UGFuZU9wdGlvbnMgZXh0ZW5kcyBJUGFuZU9wdGlvbnMge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBzaG93QWN0aW9ucz86IFZpZXdQYW5lU2hvd0FjdGlvbnM7XG5cdHJlYWRvbmx5IHRpdGxlTWVudUlkPzogTWVudUlkO1xuXHRyZWFkb25seSBkb25vdEZvcndhcmRBcmdzPzogYm9vbGVhbjtcblx0Ly8gVGhlIHRpdGxlIG9mIHRoZSBjb250YWluZXIgcGFuZSB3aGVuIGl0IGlzIG1lcmdlZCB3aXRoIHRoZSB2aWV3IGNvbnRhaW5lclxuXHRyZWFkb25seSBzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWx0ZXJWaWV3UGFuZU9wdGlvbnMgZXh0ZW5kcyBJVmlld1BhbmVPcHRpb25zIHtcblx0ZmlsdGVyT3B0aW9uczogSUZpbHRlcldpZGdldE9wdGlvbnM7XG59XG5cbmV4cG9ydCBjb25zdCBWSUVXUEFORV9GSUxURVJfQUNUSU9OID0gbmV3IEFjdGlvbigndmlld3BhbmUuYWN0aW9uLmZpbHRlcicpO1xuXG5jb25zdCB2aWV3UGFuZUNvbnRhaW5lckV4cGFuZGVkSWNvbiA9IHJlZ2lzdGVySWNvbigndmlldy1wYW5lLWNvbnRhaW5lci1leHBhbmRlZCcsIENvZGljb24uY2hldnJvbkRvd24sIG5scy5sb2NhbGl6ZSgndmlld1BhbmVDb250YWluZXJFeHBhbmRlZEljb24nLCAnSWNvbiBmb3IgYW4gZXhwYW5kZWQgdmlldyBwYW5lIGNvbnRhaW5lci4nKSk7XG5jb25zdCB2aWV3UGFuZUNvbnRhaW5lckNvbGxhcHNlZEljb24gPSByZWdpc3Rlckljb24oJ3ZpZXctcGFuZS1jb250YWluZXItY29sbGFwc2VkJywgQ29kaWNvbi5jaGV2cm9uUmlnaHQsIG5scy5sb2NhbGl6ZSgndmlld1BhbmVDb250YWluZXJDb2xsYXBzZWRJY29uJywgJ0ljb24gZm9yIGEgY29sbGFwc2VkIHZpZXcgcGFuZSBjb250YWluZXIuJykpO1xuXG5jb25zdCB2aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdDb250YWluZXJFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXG5pbnRlcmZhY2UgSUl0ZW0ge1xuXHRyZWFkb25seSBkZXNjcmlwdG9yOiBJVmlld0NvbnRlbnREZXNjcmlwdG9yO1xuXHR2aXNpYmxlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVZpZXdXZWxjb21lRGVsZWdhdGUge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGU6IEV2ZW50PHZvaWQ+O1xuXHRzaG91bGRTaG93V2VsY29tZSgpOiBib29sZWFuO1xufVxuXG5jbGFzcyBWaWV3V2VsY29tZUNvbnRyb2xsZXIge1xuXG5cdHByaXZhdGUgZGVmYXVsdEl0ZW06IElJdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGl0ZW1zOiBJSXRlbVtdID0gW107XG5cblx0Z2V0IGVuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9lbmFibGVkOyB9XG5cdHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlRWxlbWVudDogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dpZGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVuYWJsZWREaXNwb3NhYmxlcyA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlbGVnYXRlOiBJVmlld1dlbGNvbWVEZWxlZ2F0ZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5kZWxlZ2F0ZS5vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUsICgpID0+IHRoaXMub25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlKCkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKCgpID0+IHRoaXMuZGlzcG9zZSgpKSk7IC8vIEZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDg4Nzhcblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudCEuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR0aGlzLmVsZW1lbnQhLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdHRoaXMuX3dpZGUgPSB3aWR0aCA+IDY0MDtcblx0XHR0aGlzLmVsZW1lbnQhLmNsYXNzTGlzdC50b2dnbGUoJ3dpZGUnLCB0aGlzLl93aWRlKTtcblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50IS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50IS5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuZGVsZWdhdGUuc2hvdWxkU2hvd1dlbGNvbWUoKTtcblxuXHRcdGlmICh0aGlzLl9lbmFibGVkID09PSBlbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5hYmxlZCA9IGVuYWJsZWQ7XG5cblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnd2VsY29tZScpO1xuXHRcdGNvbnN0IHZpZXdXZWxjb21lQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcud2VsY29tZS12aWV3JykpO1xuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy53ZWxjb21lLXZpZXctY29udGVudCcsIHsgdGFiSW5kZXg6IDAsIHJvbGU6ICdyZWdpb24nLCAnYXJpYS1sYWJlbCc6IG5scy5sb2NhbGl6ZSgnd2VsY29tZVZpZXdBcmlhTGFiZWwnLCBcIldlbGNvbWVcIikgfSk7XG5cdFx0aWYgKHRoaXMuX3dpZGUpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aWRlJyk7XG5cdFx0fVxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5lbGVtZW50LCB7IGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLCBob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbiwgdmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZSwgfSk7XG5cdFx0YXBwZW5kKHZpZXdXZWxjb21lQ29udGFpbmVyLCB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKSk7XG5cblx0XHR0aGlzLmVuYWJsZWREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3dlbGNvbWUnKTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQhLmRpc3Bvc2UoKTtcblx0XHRcdHZpZXdXZWxjb21lQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuZWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCh0aGlzLm9uRGlkQ2hhbmdlQ29udGV4dCwgdGhpcywgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdEV2ZW50LmNoYWluKHZpZXdzUmVnaXN0cnkub25EaWRDaGFuZ2VWaWV3V2VsY29tZUNvbnRlbnQsICQgPT4gJC5maWx0ZXIoaWQgPT4gaWQgPT09IHRoaXMuZGVsZWdhdGUuaWQpKVxuXHRcdFx0KHRoaXMub25EaWRDaGFuZ2VWaWV3V2VsY29tZUNvbnRlbnQsIHRoaXMsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVmlld1dlbGNvbWVDb250ZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlld1dlbGNvbWVDb250ZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRlc2NyaXB0b3JzID0gdmlld3NSZWdpc3RyeS5nZXRWaWV3V2VsY29tZUNvbnRlbnQodGhpcy5kZWxlZ2F0ZS5pZCk7XG5cblx0XHR0aGlzLml0ZW1zID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGRlc2NyaXB0b3Igb2YgZGVzY3JpcHRvcnMpIHtcblx0XHRcdGlmIChkZXNjcmlwdG9yLndoZW4gPT09ICdkZWZhdWx0Jykge1xuXHRcdFx0XHR0aGlzLmRlZmF1bHRJdGVtID0geyBkZXNjcmlwdG9yLCB2aXNpYmxlOiB0cnVlIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlID0gZGVzY3JpcHRvci53aGVuID8gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGRlc2NyaXB0b3Iud2hlbikgOiB0cnVlO1xuXHRcdFx0XHR0aGlzLml0ZW1zLnB1c2goeyBkZXNjcmlwdG9yLCB2aXNpYmxlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQ29udGV4dCgpOiB2b2lkIHtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0aWYgKCFpdGVtLmRlc2NyaXB0b3Iud2hlbiB8fCBpdGVtLmRlc2NyaXB0b3Iud2hlbiA9PT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGl0ZW0uZGVzY3JpcHRvci53aGVuKTtcblxuXHRcdFx0aWYgKGl0ZW0udmlzaWJsZSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aXRlbS52aXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5lbGVtZW50IS50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSB0aGlzLmdldENvbnRlbnREZXNjcmlwdG9ycygpO1xuXG5cdFx0aWYgKGNvbnRlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnd2VsY29tZScpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCEuc2NhbkRvbU5vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYnV0dG9uc0NvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IHsgY29udGVudCwgcHJlY29uZGl0aW9uLCByZW5kZXJTZWNvbmRhcnlCdXR0b25zIH0gb2YgY29udGVudHMpIHtcblx0XHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG5cblx0XHRcdGZvciAobGV0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdFx0bGluZSA9IGxpbmUudHJpbSgpO1xuXG5cdFx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGlua2VkVGV4dCA9IHBhcnNlTGlua2VkVGV4dChsaW5lKTtcblxuXHRcdFx0XHRpZiAobGlua2VkVGV4dC5ub2Rlcy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGxpbmtlZFRleHQubm9kZXNbMF0gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgbm9kZSA9IGxpbmtlZFRleHQubm9kZXNbMF07XG5cdFx0XHRcdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuZWxlbWVudCEsICQoJy5idXR0b24tY29udGFpbmVyJykpO1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IG5ldyBCdXR0b24oYnV0dG9uQ29udGFpbmVyLCB7IHRpdGxlOiBub2RlLnRpdGxlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHNlY29uZGFyeTogISEocmVuZGVyU2Vjb25kYXJ5QnV0dG9ucyAmJiBidXR0b25zQ291bnQgPiAwKSwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgfSk7XG5cdFx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbm9kZS5sYWJlbDtcblx0XHRcdFx0XHRidXR0b24ub25EaWRDbGljayhfID0+IHtcblx0XHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKG5vZGUuaHJlZiwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0sIG51bGwsIHRoaXMucmVuZGVyRGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGJ1dHRvbik7XG5cdFx0XHRcdFx0YnV0dG9uc0NvdW50Kys7XG5cblx0XHRcdFx0XHRpZiAocHJlY29uZGl0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cGRhdGVFbmFibGVtZW50ID0gKCkgPT4gYnV0dG9uLmVuYWJsZWQgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMocHJlY29uZGl0aW9uKTtcblx0XHRcdFx0XHRcdHVwZGF0ZUVuYWJsZW1lbnQoKTtcblxuXHRcdFx0XHRcdFx0Y29uc3Qga2V5cyA9IG5ldyBTZXQocHJlY29uZGl0aW9uLmtleXMoKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZUNvbnRleHQgPSBFdmVudC5maWx0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsIGUgPT4gZS5hZmZlY3RzU29tZShrZXlzKSk7XG5cdFx0XHRcdFx0XHRvbkRpZENoYW5nZUNvbnRleHQodXBkYXRlRW5hYmxlbWVudCwgbnVsbCwgdGhpcy5yZW5kZXJEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHAgPSBhcHBlbmQodGhpcy5lbGVtZW50ISwgJCgncCcpKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBsaW5rZWRUZXh0Lm5vZGVzKSB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdGFwcGVuZChwLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhub2RlKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsaW5rID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaW5rLCBwLCBub2RlLCB7fSkpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChwcmVjb25kaXRpb24gJiYgbm9kZS5ocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6JykpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCB1cGRhdGVFbmFibGVtZW50ID0gKCkgPT4gbGluay5lbmFibGVkID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHByZWNvbmRpdGlvbik7XG5cdFx0XHRcdFx0XHRcdFx0dXBkYXRlRW5hYmxlbWVudCgpO1xuXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qga2V5cyA9IG5ldyBTZXQocHJlY29uZGl0aW9uLmtleXMoKSk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VDb250ZXh0ID0gRXZlbnQuZmlsdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCBlID0+IGUuYWZmZWN0c1NvbWUoa2V5cykpO1xuXHRcdFx0XHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ29udGV4dCh1cGRhdGVFbmFibGVtZW50LCBudWxsLCB0aGlzLnJlbmRlckRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3dlbGNvbWUnKTtcblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50IS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZW50RGVzY3JpcHRvcnMoKTogSVZpZXdDb250ZW50RGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCB2aXNpYmxlSXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcih2ID0+IHYudmlzaWJsZSk7XG5cblx0XHRpZiAodmlzaWJsZUl0ZW1zLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmRlZmF1bHRJdGVtKSB7XG5cdFx0XHRyZXR1cm4gW3RoaXMuZGVmYXVsdEl0ZW0uZGVzY3JpcHRvcl07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpc2libGVJdGVtcy5tYXAodiA9PiB2LmRlc2NyaXB0b3IpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgVmlld1BhbmUgZXh0ZW5kcyBQYW5lIGltcGxlbWVudHMgSVZpZXcge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEFsd2F5c1Nob3dBY3Rpb25zQ29uZmlnID0gJ3dvcmtiZW5jaC52aWV3LmFsd2F5c1Nob3dIZWFkZXJBY3Rpb25zJztcblxuXHRwcml2YXRlIF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQmx1ci5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHk6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgX29uRGlkQ2hhbmdlVGl0bGVBcmVhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGl0bGVBcmVhOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlVGl0bGVBcmVhLmV2ZW50O1xuXG5cdHByb3RlY3RlZCBfb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaXNWaXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfdGl0bGU6IHN0cmluZztcblx0cHVibGljIGdldCB0aXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgX3RpdGxlRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCB0aXRsZURlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpdGxlRGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIF9zaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlO1xuXHR9XG5cblx0cmVhZG9ubHkgbWVudUFjdGlvbnM6IFZpZXdNZW51QWN0aW9ucztcblxuXHQvKipcblx0ICogQWRkaXRpb25hbCBtZW51IGdyb3VwcyAoYmV5b25kIGBuYXZpZ2F0aW9uYCkgd2hvc2UgYWN0aW9ucyBzaG91bGQgYmVcblx0ICogcmVuZGVyZWQgYXMgcHJpbWFyeSAoaW5saW5lKSBhY3Rpb25zIGluIHRoZSB0aXRsZSBhY3Rpb24gYmFyLiBTZXBhcmF0b3JzXG5cdCAqIGFyZSByZW5kZXJlZCBiZXR3ZWVuIGdyb3VwcyBpbiB0aGUgcHJpbWFyeSBhY3Rpb25zLiBTdWJjbGFzc2VzIGNhblxuXHQgKiBvdmVycmlkZSB0aGlzIHRvIGN1c3RvbWl6ZSBncm91cGluZyBpbiB0aGUgdGl0bGUgYWN0aW9uIGJhci5cblx0ICovXG5cdHByb3RlY3RlZCBnZXQgcHJpbWFyeUFjdGlvbkdyb3VwcygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcHJvZ3Jlc3NCYXI/OiBQcm9ncmVzc0Jhcjtcblx0cHJpdmF0ZSBwcm9ncmVzc0luZGljYXRvcj86IElQcm9ncmVzc0luZGljYXRvcjtcblxuXHRwcml2YXRlIHRvb2xiYXI/OiBXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNob3dBY3Rpb25zOiBWaWV3UGFuZVNob3dBY3Rpb25zO1xuXHRwcml2YXRlIGhlYWRlckNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRpdGxlQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGl0bGVDb250YWluZXJIb3Zlcj86IElNYW5hZ2VkSG92ZXI7XG5cdHByaXZhdGUgdGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRpdGxlRGVzY3JpcHRpb25Db250YWluZXJIb3Zlcj86IElNYW5hZ2VkSG92ZXI7XG5cdHByaXZhdGUgaWNvbkNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGljb25Db250YWluZXJIb3Zlcj86IElNYW5hZ2VkSG92ZXI7XG5cdHByb3RlY3RlZCB0d2lzdGllc0NvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHZpZXdXZWxjb21lQ29udHJvbGxlcj86IFZpZXdXZWxjb21lQ29udHJvbGxlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhlYWRlckFjdGlvblZpZXdJdGVtczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElBY3Rpb25WaWV3SXRlbT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcCgpKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJvdGVjdGVkIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcm90ZWN0ZWQgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJvdGVjdGVkIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBhY2Nlc3NpYmxlVmlld0luZm9ybWF0aW9uU2VydmljZT86IElBY2Nlc3NpYmxlVmlld0luZm9ybWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih7IC4uLm9wdGlvbnMsIC4uLnsgb3JpZW50YXRpb246IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKG9wdGlvbnMuaWQpID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgPyBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogT3JpZW50YXRpb24uVkVSVElDQUwgfSB9KTtcblxuXHRcdHRoaXMuaWQgPSBvcHRpb25zLmlkO1xuXHRcdHRoaXMuX3RpdGxlID0gb3B0aW9ucy50aXRsZTtcblx0XHR0aGlzLl90aXRsZURlc2NyaXB0aW9uID0gb3B0aW9ucy50aXRsZURlc2NyaXB0aW9uO1xuXHRcdHRoaXMuX3NpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGUgPSBvcHRpb25zLnNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU7XG5cdFx0dGhpcy5zaG93QWN0aW9ucyA9IG9wdGlvbnMuc2hvd0FjdGlvbnMgPz8gVmlld1BhbmVTaG93QWN0aW9ucy5EZWZhdWx0O1xuXG5cdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmVsZW1lbnQpKTtcblx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgndmlldycsIHRoaXMuaWQpO1xuXHRcdGNvbnN0IHZpZXdMb2NhdGlvbktleSA9IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCd2aWV3TG9jYXRpb24nLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyh2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSEpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9jYXRpb24sIGUgPT4gZS52aWV3cy5zb21lKHZpZXcgPT4gdmlldy5pZCA9PT0gdGhpcy5pZCkpKCgpID0+IHZpZXdMb2NhdGlvbktleS5zZXQoVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcodmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodGhpcy5pZCkhKSkpKTtcblxuXHRcdGNvbnN0IGNoaWxkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHR0aGlzLm1lbnVBY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIoY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3TWVudUFjdGlvbnMsIG9wdGlvbnMudGl0bGVNZW51SWQgPz8gTWVudUlkLlZpZXdUaXRsZSwgTWVudUlkLlZpZXdUaXRsZUNvbnRleHQsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6ICFvcHRpb25zLmRvbm90Rm9yd2FyZEFyZ3MsIHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSwgeyBwcmltYXJ5QWN0aW9uR3JvdXBzOiB0aGlzLnByaW1hcnlBY3Rpb25Hcm91cHMgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudUFjdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVBY3Rpb25zKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBoZWFkZXJWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzdXBlci5oZWFkZXJWaXNpYmxlO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0IGhlYWRlclZpc2libGUodmlzaWJsZTogYm9vbGVhbikge1xuXHRcdHN1cGVyLmhlYWRlclZpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtZXJnZWQtaGVhZGVyJywgIXZpc2libGUpO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSAhPT0gdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5faXNWaXNpYmxlID0gdmlzaWJsZTtcblxuXHRcdFx0aWYgKHRoaXMuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkuZmlyZSh2aXNpYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVmlzaWJsZTtcblx0fVxuXG5cdGlzQm9keVZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLmlzRXhwYW5kZWQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEV4cGFuZGVkKGV4cGFuZGVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IHN1cGVyLnNldEV4cGFuZGVkKGV4cGFuZGVkKTtcblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eS5maXJlKGV4cGFuZGVkKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVUd2lzdHlJY29uKCk7XG5cdFx0cmV0dXJuIGNoYW5nZWQ7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKCk7XG5cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0cmFja0ZvY3VzKHRoaXMuZWxlbWVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy5fb25EaWRCbHVyLmZpcmUoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5oZWFkZXJDb250YWluZXIgPSBjb250YWluZXI7XG5cblx0XHR0aGlzLnR3aXN0aWVzQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJChgLnR3aXN0eS1jb250YWluZXIke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHRoaXMuZ2V0VHdpc3R5SWNvbih0aGlzLmlzRXhwYW5kZWQoKSkpfWApKTtcblxuXHRcdHRoaXMucmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyLCB0aGlzLnRpdGxlKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYWN0aW9ucycpKTtcblx0XHRhY3Rpb25zLmNsYXNzTGlzdC50b2dnbGUoJ3Nob3ctYWx3YXlzJywgdGhpcy5zaG93QWN0aW9ucyA9PT0gVmlld1BhbmVTaG93QWN0aW9ucy5BbHdheXMpO1xuXHRcdGFjdGlvbnMuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy1leHBhbmRlZCcsIHRoaXMuc2hvd0FjdGlvbnMgPT09IFZpZXdQYW5lU2hvd0FjdGlvbnMuV2hlbkV4cGFuZGVkKTtcblx0XHR0aGlzLnRvb2xiYXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbnMsIHtcblx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuY3JlYXRlQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHR0aGlzLmhlYWRlckFjdGlvblZpZXdJdGVtcy5zZXQoaXRlbS5hY3Rpb24uaWQsIGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fSxcblx0XHRcdGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCd2aWV3VG9vbGJhckFyaWFMYWJlbCcsIFwiezB9IGFjdGlvbnNcIiwgdGhpcy50aXRsZSksXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCksXG5cdFx0XHRyZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50OiB0cnVlLFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmdldEFjdGlvblJ1bm5lcigpLFxuXHRcdFx0cmVzZXRNZW51OiB0aGlzLm1lbnVBY3Rpb25zLm1lbnVJZFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50b29sYmFyKTtcblx0XHR0aGlzLnNldEFjdGlvbnMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhY3Rpb25zLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKSk7XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodGhpcy5pZCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXJNb2RlbCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXJNb2RlbCkub25EaWRDaGFuZ2VDb250YWluZXJJbmZvKCh7IHRpdGxlIH0pID0+IHRoaXMudXBkYXRlVGl0bGUodGhpcy50aXRsZSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVmlldyBjb250YWluZXIgbW9kZWwgbm90IGZvdW5kIGZvciB2aWV3ICR7dGhpcy5pZH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBvbkRpZFJlbGV2YW50Q29uZmlndXJhdGlvbkNoYW5nZSA9IEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFZpZXdQYW5lLkFsd2F5c1Nob3dBY3Rpb25zQ29uZmlnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRSZWxldmFudENvbmZpZ3VyYXRpb25DaGFuZ2UodGhpcy51cGRhdGVBY3Rpb25zVmlzaWJpbGl0eSwgdGhpcykpO1xuXHRcdHRoaXMudXBkYXRlQWN0aW9uc1Zpc2liaWxpdHkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVIZWFkZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlSGVhZGVyKCk7XG5cdFx0dGhpcy51cGRhdGVUd2lzdHlJY29uKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVR3aXN0eUljb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudHdpc3RpZXNDb250YWluZXIpIHtcblx0XHRcdHRoaXMudHdpc3RpZXNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheSh0aGlzLmdldFR3aXN0eUljb24oIXRoaXMuX2V4cGFuZGVkKSkpO1xuXHRcdFx0dGhpcy50d2lzdGllc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuZ2V0VHdpc3R5SWNvbih0aGlzLl9leHBhbmRlZCkpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VHdpc3R5SWNvbihleHBhbmRlZDogYm9vbGVhbik6IFRoZW1lSWNvbiB7XG5cdFx0cmV0dXJuIGV4cGFuZGVkID8gdmlld1BhbmVDb250YWluZXJFeHBhbmRlZEljb24gOiB2aWV3UGFuZUNvbnRhaW5lckNvbGxhcHNlZEljb247XG5cdH1cblxuXHRvdmVycmlkZSBzdHlsZShzdHlsZXM6IElQYW5lU3R5bGVzKTogdm9pZCB7XG5cdFx0c3VwZXIuc3R5bGUoc3R5bGVzKTtcblxuXHRcdGNvbnN0IGljb24gPSB0aGlzLmdldEljb24oKTtcblx0XHRpZiAodGhpcy5pY29uQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBmZ0NvbG9yID0gYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHN0eWxlcy5oZWFkZXJGb3JlZ3JvdW5kLCBhc0Nzc1ZhcmlhYmxlKGZvcmVncm91bmQpKTtcblx0XHRcdGlmIChVUkkuaXNVcmkoaWNvbikpIHtcblx0XHRcdFx0Ly8gQXBwbHkgYmFja2dyb3VuZCBjb2xvciB0byBhY3Rpdml0eSBiYXIgaXRlbSBwcm92aWRlZCB3aXRoIGljb25VcmxzXG5cdFx0XHRcdHRoaXMuaWNvbkNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBmZ0NvbG9yO1xuXHRcdFx0XHR0aGlzLmljb25Db250YWluZXIuc3R5bGUuY29sb3IgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEFwcGx5IGZvcmVncm91bmQgY29sb3IgdG8gYWN0aXZpdHkgYmFyIGl0ZW1zIHByb3ZpZGVkIHdpdGggY29kaWNvbnNcblx0XHRcdFx0dGhpcy5pY29uQ29udGFpbmVyLnN0eWxlLmNvbG9yID0gZmdDb2xvcjtcblx0XHRcdFx0dGhpcy5pY29uQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SWNvbigpOiBUaGVtZUljb24gfCBVUkkge1xuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQodGhpcy5pZCk/LmNvbnRhaW5lckljb24gfHwgZGVmYXVsdFZpZXdJY29uO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmljb25Db250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuaWNvbicsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IGljb24gPSB0aGlzLmdldEljb24oKTtcblxuXHRcdGxldCBjc3NDbGFzczogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChVUkkuaXNVcmkoaWNvbikpIHtcblx0XHRcdGNzc0NsYXNzID0gYHZpZXctJHt0aGlzLmlkLnJlcGxhY2UoL1tcXC5cXDpdL2csICctJyl9YDtcblx0XHRcdGNvbnN0IGljb25DbGFzcyA9IGAucGFuZS1oZWFkZXIgLmljb24uJHtjc3NDbGFzc31gO1xuXG5cdFx0XHRjcmVhdGVDU1NSdWxlKGljb25DbGFzcywgYFxuXHRcdFx0XHRtYXNrOiAke2FzQ1NTVXJsKGljb24pfSBuby1yZXBlYXQgNTAlIDUwJTtcblx0XHRcdFx0bWFzay1zaXplOiAyNHB4O1xuXHRcdFx0XHQtd2Via2l0LW1hc2s6ICR7YXNDU1NVcmwoaWNvbil9IG5vLXJlcGVhdCA1MCUgNTAlO1xuXHRcdFx0XHQtd2Via2l0LW1hc2stc2l6ZTogMTZweDtcblx0XHRcdGApO1xuXHRcdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHRjc3NDbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblx0XHR9XG5cblx0XHRpZiAoY3NzQ2xhc3MpIHtcblx0XHRcdHRoaXMuaWNvbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKC4uLmNzc0NsYXNzLnNwbGl0KCcgJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhbGN1bGF0ZWRUaXRsZSA9IHRoaXMuY2FsY3VsYXRlVGl0bGUodGl0bGUpO1xuXHRcdHRoaXMudGl0bGVDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdoMy50aXRsZScsIHt9LCBjYWxjdWxhdGVkVGl0bGUpKTtcblx0XHR0aGlzLnRpdGxlQ29udGFpbmVySG92ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy50aXRsZUNvbnRhaW5lciwgY2FsY3VsYXRlZFRpdGxlKSk7XG5cblx0XHRpZiAodGhpcy5fdGl0bGVEZXNjcmlwdGlvbikge1xuXHRcdFx0dGhpcy5zZXRUaXRsZURlc2NyaXB0aW9uKHRoaXMuX3RpdGxlRGVzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuaWNvbkNvbnRhaW5lckhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuaWNvbkNvbnRhaW5lciwgY2FsY3VsYXRlZFRpdGxlKSk7XG5cdFx0dGhpcy5pY29uQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuX2dldEFyaWFMYWJlbChjYWxjdWxhdGVkVGl0bGUsIHRoaXMuX3RpdGxlRGVzY3JpcHRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFyaWFMYWJlbCh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCB2aWV3SGFzQWNjZXNzaWJpbGl0eUhlbHBDb250ZW50ID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKHRoaXMuaWQpPy5hY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQ7XG5cdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXdIYXNTaG93bkZvclZpZXcgPSB0aGlzLmFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlPy5oYXNTaG93bkFjY2Vzc2libGVWaWV3KHRoaXMuaWQpO1xuXHRcdGlmICghdmlld0hhc0FjY2Vzc2liaWxpdHlIZWxwQ29udGVudCB8fCBhY2Nlc3NpYmxlVmlld0hhc1Nob3duRm9yVmlldykge1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBgJHt0aXRsZX0gLSAke2Rlc2NyaXB0aW9ufWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGl0bGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndmlld0FjY2Vzc2liaWxpdHlIZWxwJywgJ1VzZSBBbHQrRjEgZm9yIGFjY2Vzc2liaWxpdHkgaGVscCB7MH0nLCB0aXRsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNhbGN1bGF0ZWRUaXRsZSA9IHRoaXMuY2FsY3VsYXRlVGl0bGUodGl0bGUpO1xuXHRcdGlmICh0aGlzLnRpdGxlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLnRleHRDb250ZW50ID0gY2FsY3VsYXRlZFRpdGxlO1xuXHRcdFx0dGhpcy50aXRsZUNvbnRhaW5lckhvdmVyPy51cGRhdGUoY2FsY3VsYXRlZFRpdGxlKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUFyaWFIZWFkZXJMYWJlbChjYWxjdWxhdGVkVGl0bGUsIHRoaXMuX3RpdGxlRGVzY3JpcHRpb24pO1xuXG5cdFx0dGhpcy5fdGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRpdGxlQXJlYS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFyaWFIZWFkZXJMYWJlbCh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5fZ2V0QXJpYUxhYmVsKHRpdGxlLCBkZXNjcmlwdGlvbik7XG5cdFx0aWYgKHRoaXMuaWNvbkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5pY29uQ29udGFpbmVySG92ZXI/LnVwZGF0ZSh0aXRsZSk7XG5cdFx0XHR0aGlzLmljb25Db250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0XHR9XG5cdFx0dGhpcy5hcmlhSGVhZGVyTGFiZWwgPSB0aGlzLmdldEFyaWFIZWFkZXJMYWJlbChhcmlhTGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRUaXRsZURlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy50aXRsZURlc2NyaXB0aW9uQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRpdGxlRGVzY3JpcHRpb25Db250YWluZXIudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbiA/PyAnJztcblx0XHRcdHRoaXMudGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lckhvdmVyPy51cGRhdGUoZGVzY3JpcHRpb24gPz8gJycpO1xuXHRcdH1cblx0XHRlbHNlIGlmIChkZXNjcmlwdGlvbiAmJiB0aGlzLnRpdGxlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRpdGxlRGVzY3JpcHRpb25Db250YWluZXIgPSBhZnRlcih0aGlzLnRpdGxlQ29udGFpbmVyLCAkKCdzcGFuLmRlc2NyaXB0aW9uJywge30sIGRlc2NyaXB0aW9uKSk7XG5cdFx0XHR0aGlzLnRpdGxlRGVzY3JpcHRpb25Db250YWluZXJIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLnRpdGxlRGVzY3JpcHRpb25Db250YWluZXIsIGRlc2NyaXB0aW9uKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVRpdGxlRGVzY3JpcHRpb24oZGVzY3JpcHRpb24/OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLnNldFRpdGxlRGVzY3JpcHRpb24oZGVzY3JpcHRpb24pO1xuXHRcdHRoaXMudXBkYXRlQXJpYUhlYWRlckxhYmVsKHRoaXMuX3RpdGxlLCBkZXNjcmlwdGlvbik7XG5cdFx0dGhpcy5fdGl0bGVEZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGl0bGVBcmVhLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlVGl0bGUodGl0bGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh0aGlzLmlkKSE7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQodGhpcy5pZCk7XG5cdFx0Y29uc3QgaXNEZWZhdWx0ID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodGhpcy5pZCkgPT09IHZpZXdDb250YWluZXI7XG5cblx0XHRpZiAoIWlzRGVmYXVsdCAmJiB2aWV3RGVzY3JpcHRvcj8uY29udGFpbmVyVGl0bGUgJiYgbW9kZWwudGl0bGUgIT09IHZpZXdEZXNjcmlwdG9yLmNvbnRhaW5lclRpdGxlICYmIHRpdGxlICE9PSB2aWV3RGVzY3JpcHRvci5jb250YWluZXJUaXRsZSkge1xuXHRcdFx0cmV0dXJuIGAke3ZpZXdEZXNjcmlwdG9yLmNvbnRhaW5lclRpdGxlfTogJHt0aXRsZX1gO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdXZWxjb21lQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlld1dlbGNvbWVDb250cm9sbGVyLCBjb250YWluZXIsIHRoaXMpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3V2VsY29tZUNvbnRyb2xsZXI/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG9uRGlkU2Nyb2xsUm9vdCgpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRnZXRQcm9ncmVzc0luZGljYXRvcigpIHtcblx0XHRpZiAodGhpcy5wcm9ncmVzc0JhciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKHRoaXMuZWxlbWVudCwgZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzKSk7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLmhpZGUoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wcm9ncmVzc0luZGljYXRvciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdHRoaXMucHJvZ3Jlc3NJbmRpY2F0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2NvcGVkUHJvZ3Jlc3NJbmRpY2F0b3IoYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wcm9ncmVzc0JhciksIHRoaXMuX3JlZ2lzdGVyKG5ldyBjbGFzcyBleHRlbmRzIEFic3RyYWN0UHJvZ3Jlc3NTY29wZSB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHRoYXQuaWQsIHRoYXQuaXNCb2R5VmlzaWJsZSgpKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGF0Lm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkoaXNWaXNpYmxlID0+IGlzVmlzaWJsZSA/IHRoaXMub25TY29wZU9wZW5lZCh0aGF0LmlkKSA6IHRoaXMub25TY29wZUNsb3NlZCh0aGF0LmlkKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzSW5kaWNhdG9yO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFByb2dyZXNzTG9jYXRpb24oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpIS5pZDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk6IElWaWV3UGFuZUxvY2F0aW9uQ29sb3JzIHtcblx0XHRyZXR1cm4gZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnModGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aWV3V2VsY29tZUNvbnRyb2xsZXI/LmVuYWJsZWQpIHtcblx0XHRcdHRoaXMudmlld1dlbGNvbWVDb250cm9sbGVyLmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0XHRpZiAoaXNBY3RpdmVFbGVtZW50KHRoaXMuZWxlbWVudCkgfHwgaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEFjdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudG9vbGJhcikge1xuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnMgPSBbLi4udGhpcy5tZW51QWN0aW9ucy5nZXRQcmltYXJ5QWN0aW9ucygpXTtcblx0XHRcdGlmICh0aGlzLnNob3VsZFNob3dGaWx0ZXJJbkhlYWRlcigpKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnVuc2hpZnQoVklFV1BBTkVfRklMVEVSX0FDVElPTik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRvb2xiYXIuc2V0QWN0aW9ucyhwcmVwYXJlQWN0aW9ucyhwcmltYXJ5QWN0aW9ucyksIHByZXBhcmVBY3Rpb25zKHRoaXMubWVudUFjdGlvbnMuZ2V0U2Vjb25kYXJ5QWN0aW9ucygpKSk7XG5cdFx0XHR0aGlzLnRvb2xiYXIuY29udGV4dCA9IHRoaXMuZ2V0QWN0aW9uc0NvbnRleHQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjdGlvbnNWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oZWFkZXJDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2hvdWxkQWx3YXlzU2hvd0FjdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2gudmlldy5hbHdheXNTaG93SGVhZGVyQWN0aW9ucycpO1xuXHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGlvbnMtYWx3YXlzLXZpc2libGUnLCBzaG91bGRBbHdheXNTaG93QWN0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnNldEFjdGlvbnMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRpdGxlQXJlYS5maXJlKCk7XG5cdH1cblxuXHRjcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM/OiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYWN0aW9uLmlkID09PSBWSUVXUEFORV9GSUxURVJfQUNUSU9OLmlkKSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIobnVsbCwgYWN0aW9uKTsgfVxuXHRcdFx0XHRvdmVycmlkZSBzZXRGb2N1c2FibGUoKTogdm9pZCB7IC8qIG5vb3AgaW5wdXQgZWxlbWVudHMgYXJlIGZvY3VzYWJsZSBieSBkZWZhdWx0ICovIH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IHRyYXBzQXJyb3dOYXZpZ2F0aW9uKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd2aWV3cGFuZS1maWx0ZXItY29udGFpbmVyJyk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyID0gdGhhdC5nZXRGaWx0ZXJXaWRnZXQoKSE7XG5cdFx0XHRcdFx0YXBwZW5kKGNvbnRhaW5lciwgZmlsdGVyLmVsZW1lbnQpO1xuXHRcdFx0XHRcdGZpbHRlci5yZWxheW91dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIC4uLnsgbWVudUFzQ2hpbGQ6IGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uIH0gfSk7XG5cdH1cblxuXHRnZXRBY3Rpb25zQ29udGV4dCgpOiB1bmtub3duIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0QWN0aW9uUnVubmVyKCk6IElBY3Rpb25SdW5uZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRPcHRpbWFsV2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBTdWJjbGFzc2VzIHRvIGltcGxlbWVudCBmb3Igc2F2aW5nIHN0YXRlXG5cdH1cblxuXHRzaG91bGRTaG93V2VsY29tZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRGaWx0ZXJXaWRnZXQoKTogRmlsdGVyV2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRmlsdGVyVmlld1BhbmUgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cmVhZG9ubHkgZmlsdGVyV2lkZ2V0OiBGaWx0ZXJXaWRnZXQ7XG5cdHByaXZhdGUgZGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBmaWx0ZXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElGaWx0ZXJWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0YWNjZXNzaWJsZVZpZXdTZXJ2aWNlPzogSUFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGFjY2Vzc2libGVWaWV3U2VydmljZSk7XG5cdFx0Y29uc3QgY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHR0aGlzLmZpbHRlcldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGNoaWxkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsdGVyV2lkZ2V0LCBvcHRpb25zLmZpbHRlck9wdGlvbnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbHRlcldpZGdldC5vbkRpZEFjY2VwdEZpbHRlclRleHQoKCkgPT4gdGhpcy5mb2N1c0JvZHlDb250ZW50KCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEZpbHRlcldpZGdldCgpOiBGaWx0ZXJXaWRnZXQge1xuXHRcdHJldHVybiB0aGlzLmZpbHRlcldpZGdldDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5maWx0ZXJDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcudmlld3BhbmUtZmlsdGVyLWNvbnRhaW5lcicpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblxuXHRcdHRoaXMuZGltZW5zaW9uID0gbmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRjb25zdCB3YXNGaWx0ZXJTaG93bkluSGVhZGVyID0gIXRoaXMuZmlsdGVyQ29udGFpbmVyPy5oYXNDaGlsZE5vZGVzKCk7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyID0gdGhpcy5zaG91bGRTaG93RmlsdGVySW5IZWFkZXIoKTtcblx0XHRpZiAod2FzRmlsdGVyU2hvd25JbkhlYWRlciAhPT0gc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKSB7XG5cdFx0XHRpZiAoc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKSB7XG5cdFx0XHRcdHJlc2V0KHRoaXMuZmlsdGVyQ29udGFpbmVyISk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHRcdGlmICghc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKSB7XG5cdFx0XHRcdGFwcGVuZCh0aGlzLmZpbHRlckNvbnRhaW5lciEsIHRoaXMuZmlsdGVyV2lkZ2V0LmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXNob3VsZFNob3dGaWx0ZXJJbkhlYWRlcikge1xuXHRcdFx0aGVpZ2h0ID0gaGVpZ2h0IC0gNDQ7XG5cdFx0fVxuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0LmxheW91dCh3aWR0aCk7XG5cdFx0dGhpcy5sYXlvdXRCb2R5Q29udGVudChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFNob3dGaWx0ZXJJbkhlYWRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISh0aGlzLmRpbWVuc2lvbiAmJiB0aGlzLmRpbWVuc2lvbi53aWR0aCA8IDYwMCAmJiB0aGlzLmRpbWVuc2lvbi5oZWlnaHQgPiAxMDApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGxheW91dEJvZHlDb250ZW50KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcblxuXHRwcm90ZWN0ZWQgZm9jdXNCb2R5Q29udGVudCgpOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVmlld1BhbmVMb2NhdGlvbkNvbG9ycyB7XG5cdGJhY2tncm91bmQ6IHN0cmluZztcblx0b3ZlcmxheUJhY2tncm91bmQ6IHN0cmluZztcblx0bGlzdE92ZXJyaWRlU3R5bGVzOiBQYXJ0aWFsRXhjZXB0PElMaXN0U3R5bGVzLCAnbGlzdEJhY2tncm91bmQnIHwgJ3RyZWVTdGlja3lTY3JvbGxCYWNrZ3JvdW5kJz47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycyhsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIHwgbnVsbCk6IElWaWV3UGFuZUxvY2F0aW9uQ29sb3JzIHtcblx0bGV0IGJhY2tncm91bmQsIG92ZXJsYXlCYWNrZ3JvdW5kLCBzdGlja3lTY3JvbGxCYWNrZ3JvdW5kLCBzdGlja3lTY3JvbGxCb3JkZXIsIHN0aWNreVNjcm9sbFNoYWRvdztcblxuXHRzd2l0Y2ggKGxvY2F0aW9uKSB7XG5cdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6XG5cdFx0XHRiYWNrZ3JvdW5kID0gUEFORUxfQkFDS0dST1VORDtcblx0XHRcdG92ZXJsYXlCYWNrZ3JvdW5kID0gUEFORUxfU0VDVElPTl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQ7XG5cdFx0XHRzdGlja3lTY3JvbGxCYWNrZ3JvdW5kID0gUEFORUxfU1RJQ0tZX1NDUk9MTF9CQUNLR1JPVU5EO1xuXHRcdFx0c3RpY2t5U2Nyb2xsQm9yZGVyID0gUEFORUxfU1RJQ0tZX1NDUk9MTF9CT1JERVI7XG5cdFx0XHRzdGlja3lTY3JvbGxTaGFkb3cgPSBQQU5FTF9TVElDS1lfU0NST0xMX1NIQURPVztcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjpcblx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXI6XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGJhY2tncm91bmQgPSBTSURFX0JBUl9CQUNLR1JPVU5EO1xuXHRcdFx0b3ZlcmxheUJhY2tncm91bmQgPSBTSURFX0JBUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQ7XG5cdFx0XHRzdGlja3lTY3JvbGxCYWNrZ3JvdW5kID0gU0lERV9CQVJfU1RJQ0tZX1NDUk9MTF9CQUNLR1JPVU5EO1xuXHRcdFx0c3RpY2t5U2Nyb2xsQm9yZGVyID0gU0lERV9CQVJfU1RJQ0tZX1NDUk9MTF9CT1JERVI7XG5cdFx0XHRzdGlja3lTY3JvbGxTaGFkb3cgPSBTSURFX0JBUl9TVElDS1lfU0NST0xMX1NIQURPVztcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0YmFja2dyb3VuZCxcblx0XHRvdmVybGF5QmFja2dyb3VuZCxcblx0XHRsaXN0T3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBiYWNrZ3JvdW5kLFxuXHRcdFx0dHJlZVN0aWNreVNjcm9sbEJhY2tncm91bmQ6IHN0aWNreVNjcm9sbEJhY2tncm91bmQsXG5cdFx0XHR0cmVlU3RpY2t5U2Nyb2xsQm9yZGVyOiBzdGlja3lTY3JvbGxCb3JkZXIsXG5cdFx0XHR0cmVlU3RpY2t5U2Nyb2xsU2hhZG93OiBzdGlja3lTY3JvbGxTaGFkb3dcblx0XHR9XG5cdH07XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBWaWV3QWN0aW9uPFQgZXh0ZW5kcyBJVmlldz4gZXh0ZW5kcyBBY3Rpb24yIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPiAmIHsgdmlld0lkOiBzdHJpbmcgfTtcblx0Y29uc3RydWN0b3IoZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPiAmIHsgdmlld0lkOiBzdHJpbmcgfSkge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHRcdHRoaXMuZGVzYyA9IGRlc2M7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHVua25vd24ge1xuXHRcdGNvbnN0IHZpZXcgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZCh0aGlzLmRlc2Mudmlld0lkKTtcblx0XHRpZiAodmlldykge1xuXHRcdFx0cmV0dXJuIHRoaXMucnVuSW5WaWV3KGFjY2Vzc29yLCA8VD52aWV3LCAuLi5hcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFic3RyYWN0IHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVCwgLi4uYXJnczogdW5rbm93bltdKTogdW5rbm93bjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLGVBQWUsa0JBQWtCO0FBQzFDLFNBQVMsT0FBTyxRQUFRLEdBQUcsWUFBWSxXQUFXLHVCQUF1QixXQUFXLE9BQU8sMkJBQTJCLHVCQUF1QjtBQUM3SSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QixnQkFBZ0I7QUFDaEQsU0FBUyxlQUFlLGlCQUFpQixvQkFBb0I7QUFDN0QsU0FBUyxjQUFzQztBQUMvQyxTQUFTLG9CQUFx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QUFDeEQsVUFBSSwwQkFBMEI7QUFDN0IsY0FBTSxLQUFLLGVBQWdCO0FBQUEsTUFDNUI7QUFDQSxXQUFLLGNBQWM7QUFDbkIsVUFBSSxDQUFDLDBCQUEwQjtBQUM5QixlQUFPLEtBQUssaUJBQWtCLEtBQUssYUFBYSxPQUFPO0FBQUEsTUFDeEQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLDBCQUEwQjtBQUM5QixlQUFTLFNBQVM7QUFBQSxJQUNuQjtBQUNBLFNBQUssYUFBYSxPQUFPLEtBQUs7QUFDOUIsU0FBSyxrQkFBa0IsUUFBUSxLQUFLO0FBQUEsRUFDckM7QUFBQSxFQUVTLDJCQUFvQztBQUM1QyxXQUFPLEVBQUUsS0FBSyxhQUFhLEtBQUssVUFBVSxRQUFRLE9BQU8sS0FBSyxVQUFVLFNBQVM7QUFBQSxFQUNsRjtBQUFBLEVBSVUsbUJBQXlCO0FBQ2xDLFNBQUssTUFBTTtBQUFBLEVBQ1o7QUFDRDtBQWpFc0IsaUJBQWY7QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhCbUI7QUF5RWYsU0FBUywyQkFBMkIsVUFBaUU7QUFDM0csTUFBSSxZQUFZLG1CQUFtQix3QkFBd0Isb0JBQW9CO0FBRS9FLFVBQVEsVUFBVTtBQUFBLElBQ2pCLEtBQUssc0JBQXNCO0FBQzFCLG1CQUFhO0FBQ2IsMEJBQW9CO0FBQ3BCLCtCQUF5QjtBQUN6QiwyQkFBcUI7QUFDckIsMkJBQXFCO0FBQ3JCO0FBQUEsSUFFRCxLQUFLLHNCQUFzQjtBQUFBLElBQzNCLEtBQUssc0JBQXNCO0FBQUEsSUFDM0I7QUFDQyxtQkFBYTtBQUNiLDBCQUFvQjtBQUNwQiwrQkFBeUI7QUFDekIsMkJBQXFCO0FBQ3JCLDJCQUFxQjtBQUFBLEVBQ3ZCO0FBRUEsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQSxvQkFBb0I7QUFBQSxNQUNuQixnQkFBZ0I7QUFBQSxNQUNoQiw0QkFBNEI7QUFBQSxNQUM1Qix3QkFBd0I7QUFBQSxNQUN4Qix3QkFBd0I7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQWUsbUJBQW9DLFFBQVE7QUFBQSxFQUVqRSxZQUFZLE1BQXNEO0FBQ2pFLFVBQU0sSUFBSTtBQUNWLFNBQUssT0FBTztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksYUFBK0IsTUFBMEI7QUFDNUQsVUFBTSxPQUFPLFNBQVMsSUFBSSxhQUFhLEVBQUUsb0JBQW9CLEtBQUssS0FBSyxNQUFNO0FBQzdFLFFBQUksTUFBTTtBQUNULGFBQU8sS0FBSyxVQUFVLFVBQWEsTUFBTSxHQUFHLElBQUk7QUFBQSxJQUNqRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBR0Q7IiwKICAibmFtZXMiOiBbIlZpZXdQYW5lU2hvd0FjdGlvbnMiLCAiJCJdCn0K
