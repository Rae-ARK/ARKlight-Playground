import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { getFloatingOuterEdgeOwners, getFloatingSidebarSiblingToEditorStatus, Parts, Position } from "../../browser/layoutService.js";
import { TestLayoutService } from "../../../../test/browser/workbenchTestServices.js";
suite("LayoutService - getFloatingOuterEdgeOwners", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class ConfigurableLayoutService extends TestLayoutService {
    constructor() {
      super(...arguments);
      this.floatingPanelsEnabled = true;
      this.sideBarPosition = Position.LEFT;
      this.panelPosition = Position.BOTTOM;
      this.visibleParts = /* @__PURE__ */ new Set();
    }
    isFloatingPanelsEnabled() {
      return this.floatingPanelsEnabled;
    }
    getSideBarPosition() {
      return this.sideBarPosition;
    }
    getPanelPosition() {
      return this.panelPosition;
    }
    isVisible(part) {
      return this.visibleParts.has(part);
    }
  }
  function owners(configure) {
    const service = new ConfigurableLayoutService();
    configure(service);
    return getFloatingOuterEdgeOwners(service);
  }
  test("edge ownership across layouts", () => {
    const actual = {
      // Experiment disabled: no owners regardless of layout.
      disabled: owners((s) => {
        s.floatingPanelsEnabled = false;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.AUXILIARYBAR_PART]);
      }),
      // Default full layout (side bar left): activity bar hugs the left edge (no owner),
      // the secondary side bar owns the right edge.
      defaultFull: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]);
      }),
      // Maximized aux bar with the activity bar in its default (visible) position: the
      // activity bar still hugs the left edge, the aux bar owns the right edge.
      maximizedAuxWithActivityBar: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.ACTIVITYBAR_PART, Parts.AUXILIARYBAR_PART]);
      }),
      // Maximized aux bar with the activity bar not in its default position (hidden from
      // the side column): the aux bar spans the full width and owns both edges.
      maximizedAuxNoActivityBar: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.AUXILIARYBAR_PART]);
      }),
      // Same, but the side bar is on the right: the aux bar still spans and owns both edges.
      maximizedAuxNoActivityBarSideBarRight: owners((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.AUXILIARYBAR_PART]);
      }),
      // Only the editor visible with the activity bar hidden: the editor is the sole card
      // and owns both edges.
      editorOnly: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.EDITOR_PART]);
      }),
      // Full layout with a visible left vertical panel: the panel sits between the editor
      // and the side bar, so it never reaches an edge.
      verticalPanelFull: owners((s) => {
        s.panelPosition = Position.LEFT;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]);
      }),
      // Maximized left vertical panel with the activity bar hidden: the panel spans the
      // full width and owns both edges.
      maximizedVerticalPanel: owners((s) => {
        s.panelPosition = Position.LEFT;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.PANEL_PART]);
      }),
      // Visible horizontal (bottom) panel: not part of the vertical order, so it owns no
      // edge; the secondary side bar still owns the right edge.
      horizontalPanelVisible: owners((s) => {
        s.panelPosition = Position.BOTTOM;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]);
      })
    };
    assert.deepStrictEqual(actual, {
      disabled: { left: void 0, right: void 0 },
      defaultFull: { left: void 0, right: Parts.AUXILIARYBAR_PART },
      maximizedAuxWithActivityBar: { left: void 0, right: Parts.AUXILIARYBAR_PART },
      maximizedAuxNoActivityBar: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
      maximizedAuxNoActivityBarSideBarRight: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
      editorOnly: { left: Parts.EDITOR_PART, right: Parts.EDITOR_PART },
      verticalPanelFull: { left: void 0, right: Parts.AUXILIARYBAR_PART },
      maximizedVerticalPanel: { left: Parts.PANEL_PART, right: Parts.PANEL_PART },
      horizontalPanelVisible: { left: Parts.SIDEBAR_PART, right: Parts.AUXILIARYBAR_PART }
    });
  });
});
suite("LayoutService - getFloatingSidebarSiblingToEditorStatus", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class SiblingStatusLayoutService extends TestLayoutService {
    constructor() {
      super(...arguments);
      this.sideBarPosition = Position.LEFT;
      this.panelAlignment = "center";
    }
    getSideBarPosition() {
      return this.sideBarPosition;
    }
    getPanelAlignment() {
      return this.panelAlignment;
    }
  }
  function siblingStatus(configure) {
    const s = new SiblingStatusLayoutService();
    configure(s);
    return getFloatingSidebarSiblingToEditorStatus(s);
  }
  test("sibling-to-editor status across alignment and sidebar-position combinations", () => {
    const actual = {
      // center: neither bar is a sibling (both span full height)
      centerLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "center";
      }),
      centerRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "center";
      }),
      // justify: both bars are siblings (panel spans the full width)
      justifyLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "justify";
      }),
      justifyRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "justify";
      }),
      // left alignment, sidebar on LEFT: sidebar IS sibling, aux bar is NOT
      leftAlignSidebarLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "left";
      }),
      // left alignment, sidebar on RIGHT: sidebar is NOT sibling, aux bar IS
      leftAlignSidebarRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "left";
      }),
      // right alignment, sidebar on LEFT: sidebar is NOT sibling, aux bar IS
      rightAlignSidebarLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "right";
      }),
      // right alignment, sidebar on RIGHT: sidebar IS sibling, aux bar is NOT
      rightAlignSidebarRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "right";
      })
    };
    assert.deepStrictEqual(actual, {
      centerLeft: { sideBar: false, auxBar: false },
      centerRight: { sideBar: false, auxBar: false },
      justifyLeft: { sideBar: true, auxBar: true },
      justifyRight: { sideBar: true, auxBar: true },
      leftAlignSidebarLeft: { sideBar: true, auxBar: false },
      leftAlignSidebarRight: { sideBar: false, auxBar: true },
      rightAlignSidebarLeft: { sideBar: false, auxBar: true },
      rightAlignSidebarRight: { sideBar: true, auxBar: false }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvdGVzdC9icm93c2VyL2xheW91dFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxvYXRpbmdPdXRlckVkZ2VPd25lcnMsIGdldEZsb2F0aW5nU2lkZWJhclNpYmxpbmdUb0VkaXRvclN0YXR1cywgdHlwZSBQYW5lbEFsaWdubWVudCwgUGFydHMsIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdMYXlvdXRTZXJ2aWNlIC0gZ2V0RmxvYXRpbmdPdXRlckVkZ2VPd25lcnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgQ29uZmlndXJhYmxlTGF5b3V0U2VydmljZSBleHRlbmRzIFRlc3RMYXlvdXRTZXJ2aWNlIHtcblx0XHRmbG9hdGluZ1BhbmVsc0VuYWJsZWQgPSB0cnVlO1xuXHRcdHNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7XG5cdFx0cGFuZWxQb3NpdGlvbiA9IFBvc2l0aW9uLkJPVFRPTTtcblx0XHR2aXNpYmxlUGFydHMgPSBuZXcgU2V0PFBhcnRzPigpO1xuXG5cdFx0b3ZlcnJpZGUgaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmZsb2F0aW5nUGFuZWxzRW5hYmxlZDsgfVxuXHRcdG92ZXJyaWRlIGdldFNpZGVCYXJQb3NpdGlvbigpOiBQb3NpdGlvbiB7IHJldHVybiB0aGlzLnNpZGVCYXJQb3NpdGlvbjsgfVxuXHRcdG92ZXJyaWRlIGdldFBhbmVsUG9zaXRpb24oKTogUG9zaXRpb24geyByZXR1cm4gdGhpcy5wYW5lbFBvc2l0aW9uOyB9XG5cdFx0b3ZlcnJpZGUgaXNWaXNpYmxlKHBhcnQ6IFBhcnRzKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnZpc2libGVQYXJ0cy5oYXMocGFydCk7IH1cblx0fVxuXG5cdGZ1bmN0aW9uIG93bmVycyhjb25maWd1cmU6IChzZXJ2aWNlOiBDb25maWd1cmFibGVMYXlvdXRTZXJ2aWNlKSA9PiB2b2lkKTogeyBsZWZ0OiBQYXJ0cyB8IHVuZGVmaW5lZDsgcmlnaHQ6IFBhcnRzIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQ29uZmlndXJhYmxlTGF5b3V0U2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyZShzZXJ2aWNlKTtcblx0XHRyZXR1cm4gZ2V0RmxvYXRpbmdPdXRlckVkZ2VPd25lcnMoc2VydmljZSk7XG5cdH1cblxuXHR0ZXN0KCdlZGdlIG93bmVyc2hpcCBhY3Jvc3MgbGF5b3V0cycsICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB7XG5cdFx0XHQvLyBFeHBlcmltZW50IGRpc2FibGVkOiBubyBvd25lcnMgcmVnYXJkbGVzcyBvZiBsYXlvdXQuXG5cdFx0XHRkaXNhYmxlZDogb3duZXJzKHMgPT4geyBzLmZsb2F0aW5nUGFuZWxzRW5hYmxlZCA9IGZhbHNlOyBzLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQoW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSk7IH0pLFxuXG5cdFx0XHQvLyBEZWZhdWx0IGZ1bGwgbGF5b3V0IChzaWRlIGJhciBsZWZ0KTogYWN0aXZpdHkgYmFyIGh1Z3MgdGhlIGxlZnQgZWRnZSAobm8gb3duZXIpLFxuXHRcdFx0Ly8gdGhlIHNlY29uZGFyeSBzaWRlIGJhciBvd25zIHRoZSByaWdodCBlZGdlLlxuXHRcdFx0ZGVmYXVsdEZ1bGw6IG93bmVycyhzID0+IHsgcy52aXNpYmxlUGFydHMgPSBuZXcgU2V0KFtQYXJ0cy5BQ1RJVklUWUJBUl9QQVJULCBQYXJ0cy5TSURFQkFSX1BBUlQsIFBhcnRzLkVESVRPUl9QQVJULCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVF0pOyB9KSxcblxuXHRcdFx0Ly8gTWF4aW1pemVkIGF1eCBiYXIgd2l0aCB0aGUgYWN0aXZpdHkgYmFyIGluIGl0cyBkZWZhdWx0ICh2aXNpYmxlKSBwb3NpdGlvbjogdGhlXG5cdFx0XHQvLyBhY3Rpdml0eSBiYXIgc3RpbGwgaHVncyB0aGUgbGVmdCBlZGdlLCB0aGUgYXV4IGJhciBvd25zIHRoZSByaWdodCBlZGdlLlxuXHRcdFx0bWF4aW1pemVkQXV4V2l0aEFjdGl2aXR5QmFyOiBvd25lcnMocyA9PiB7IHMudmlzaWJsZVBhcnRzID0gbmV3IFNldChbUGFydHMuQUNUSVZJVFlCQVJfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdKTsgfSksXG5cblx0XHRcdC8vIE1heGltaXplZCBhdXggYmFyIHdpdGggdGhlIGFjdGl2aXR5IGJhciBub3QgaW4gaXRzIGRlZmF1bHQgcG9zaXRpb24gKGhpZGRlbiBmcm9tXG5cdFx0XHQvLyB0aGUgc2lkZSBjb2x1bW4pOiB0aGUgYXV4IGJhciBzcGFucyB0aGUgZnVsbCB3aWR0aCBhbmQgb3ducyBib3RoIGVkZ2VzLlxuXHRcdFx0bWF4aW1pemVkQXV4Tm9BY3Rpdml0eUJhcjogb3duZXJzKHMgPT4geyBzLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQoW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSk7IH0pLFxuXG5cdFx0XHQvLyBTYW1lLCBidXQgdGhlIHNpZGUgYmFyIGlzIG9uIHRoZSByaWdodDogdGhlIGF1eCBiYXIgc3RpbGwgc3BhbnMgYW5kIG93bnMgYm90aCBlZGdlcy5cblx0XHRcdG1heGltaXplZEF1eE5vQWN0aXZpdHlCYXJTaWRlQmFyUmlnaHQ6IG93bmVycyhzID0+IHsgcy5zaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5SSUdIVDsgcy52aXNpYmxlUGFydHMgPSBuZXcgU2V0KFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVF0pOyB9KSxcblxuXHRcdFx0Ly8gT25seSB0aGUgZWRpdG9yIHZpc2libGUgd2l0aCB0aGUgYWN0aXZpdHkgYmFyIGhpZGRlbjogdGhlIGVkaXRvciBpcyB0aGUgc29sZSBjYXJkXG5cdFx0XHQvLyBhbmQgb3ducyBib3RoIGVkZ2VzLlxuXHRcdFx0ZWRpdG9yT25seTogb3duZXJzKHMgPT4geyBzLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQoW1BhcnRzLkVESVRPUl9QQVJUXSk7IH0pLFxuXG5cdFx0XHQvLyBGdWxsIGxheW91dCB3aXRoIGEgdmlzaWJsZSBsZWZ0IHZlcnRpY2FsIHBhbmVsOiB0aGUgcGFuZWwgc2l0cyBiZXR3ZWVuIHRoZSBlZGl0b3Jcblx0XHRcdC8vIGFuZCB0aGUgc2lkZSBiYXIsIHNvIGl0IG5ldmVyIHJlYWNoZXMgYW4gZWRnZS5cblx0XHRcdHZlcnRpY2FsUGFuZWxGdWxsOiBvd25lcnMocyA9PiB7IHMucGFuZWxQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7IHMudmlzaWJsZVBhcnRzID0gbmV3IFNldChbUGFydHMuQUNUSVZJVFlCQVJfUEFSVCwgUGFydHMuU0lERUJBUl9QQVJULCBQYXJ0cy5QQU5FTF9QQVJULCBQYXJ0cy5FRElUT1JfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdKTsgfSksXG5cblx0XHRcdC8vIE1heGltaXplZCBsZWZ0IHZlcnRpY2FsIHBhbmVsIHdpdGggdGhlIGFjdGl2aXR5IGJhciBoaWRkZW46IHRoZSBwYW5lbCBzcGFucyB0aGVcblx0XHRcdC8vIGZ1bGwgd2lkdGggYW5kIG93bnMgYm90aCBlZGdlcy5cblx0XHRcdG1heGltaXplZFZlcnRpY2FsUGFuZWw6IG93bmVycyhzID0+IHsgcy5wYW5lbFBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDsgcy52aXNpYmxlUGFydHMgPSBuZXcgU2V0KFtQYXJ0cy5QQU5FTF9QQVJUXSk7IH0pLFxuXG5cdFx0XHQvLyBWaXNpYmxlIGhvcml6b250YWwgKGJvdHRvbSkgcGFuZWw6IG5vdCBwYXJ0IG9mIHRoZSB2ZXJ0aWNhbCBvcmRlciwgc28gaXQgb3ducyBub1xuXHRcdFx0Ly8gZWRnZTsgdGhlIHNlY29uZGFyeSBzaWRlIGJhciBzdGlsbCBvd25zIHRoZSByaWdodCBlZGdlLlxuXHRcdFx0aG9yaXpvbnRhbFBhbmVsVmlzaWJsZTogb3duZXJzKHMgPT4geyBzLnBhbmVsUG9zaXRpb24gPSBQb3NpdGlvbi5CT1RUT007IHMudmlzaWJsZVBhcnRzID0gbmV3IFNldChbUGFydHMuU0lERUJBUl9QQVJULCBQYXJ0cy5FRElUT1JfUEFSVCwgUGFydHMuUEFORUxfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdKTsgfSksXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHRkaXNhYmxlZDogeyBsZWZ0OiB1bmRlZmluZWQsIHJpZ2h0OiB1bmRlZmluZWQgfSxcblx0XHRcdGRlZmF1bHRGdWxsOiB7IGxlZnQ6IHVuZGVmaW5lZCwgcmlnaHQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIH0sXG5cdFx0XHRtYXhpbWl6ZWRBdXhXaXRoQWN0aXZpdHlCYXI6IHsgbGVmdDogdW5kZWZpbmVkLCByaWdodDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgfSxcblx0XHRcdG1heGltaXplZEF1eE5vQWN0aXZpdHlCYXI6IHsgbGVmdDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHJpZ2h0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9LFxuXHRcdFx0bWF4aW1pemVkQXV4Tm9BY3Rpdml0eUJhclNpZGVCYXJSaWdodDogeyBsZWZ0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgcmlnaHQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIH0sXG5cdFx0XHRlZGl0b3JPbmx5OiB7IGxlZnQ6IFBhcnRzLkVESVRPUl9QQVJULCByaWdodDogUGFydHMuRURJVE9SX1BBUlQgfSxcblx0XHRcdHZlcnRpY2FsUGFuZWxGdWxsOiB7IGxlZnQ6IHVuZGVmaW5lZCwgcmlnaHQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIH0sXG5cdFx0XHRtYXhpbWl6ZWRWZXJ0aWNhbFBhbmVsOiB7IGxlZnQ6IFBhcnRzLlBBTkVMX1BBUlQsIHJpZ2h0OiBQYXJ0cy5QQU5FTF9QQVJUIH0sXG5cdFx0XHRob3Jpem9udGFsUGFuZWxWaXNpYmxlOiB7IGxlZnQ6IFBhcnRzLlNJREVCQVJfUEFSVCwgcmlnaHQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdMYXlvdXRTZXJ2aWNlIC0gZ2V0RmxvYXRpbmdTaWRlYmFyU2libGluZ1RvRWRpdG9yU3RhdHVzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIFNpYmxpbmdTdGF0dXNMYXlvdXRTZXJ2aWNlIGV4dGVuZHMgVGVzdExheW91dFNlcnZpY2Uge1xuXHRcdHNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7XG5cdFx0cGFuZWxBbGlnbm1lbnQ6IFBhbmVsQWxpZ25tZW50ID0gJ2NlbnRlcic7XG5cblx0XHRvdmVycmlkZSBnZXRTaWRlQmFyUG9zaXRpb24oKTogUG9zaXRpb24geyByZXR1cm4gdGhpcy5zaWRlQmFyUG9zaXRpb247IH1cblx0XHRvdmVycmlkZSBnZXRQYW5lbEFsaWdubWVudCgpOiBQYW5lbEFsaWdubWVudCB7IHJldHVybiB0aGlzLnBhbmVsQWxpZ25tZW50OyB9XG5cdH1cblxuXHRmdW5jdGlvbiBzaWJsaW5nU3RhdHVzKGNvbmZpZ3VyZTogKHM6IFNpYmxpbmdTdGF0dXNMYXlvdXRTZXJ2aWNlKSA9PiB2b2lkKTogeyBzaWRlQmFyOiBib29sZWFuOyBhdXhCYXI6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgcyA9IG5ldyBTaWJsaW5nU3RhdHVzTGF5b3V0U2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyZShzKTtcblx0XHRyZXR1cm4gZ2V0RmxvYXRpbmdTaWRlYmFyU2libGluZ1RvRWRpdG9yU3RhdHVzKHMpO1xuXHR9XG5cblx0dGVzdCgnc2libGluZy10by1lZGl0b3Igc3RhdHVzIGFjcm9zcyBhbGlnbm1lbnQgYW5kIHNpZGViYXItcG9zaXRpb24gY29tYmluYXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHtcblx0XHRcdC8vIGNlbnRlcjogbmVpdGhlciBiYXIgaXMgYSBzaWJsaW5nIChib3RoIHNwYW4gZnVsbCBoZWlnaHQpXG5cdFx0XHRjZW50ZXJMZWZ0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7IHMucGFuZWxBbGlnbm1lbnQgPSAnY2VudGVyJzsgfSksXG5cdFx0XHRjZW50ZXJSaWdodDogc2libGluZ1N0YXR1cyhzID0+IHsgcy5zaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5SSUdIVDsgcy5wYW5lbEFsaWdubWVudCA9ICdjZW50ZXInOyB9KSxcblx0XHRcdC8vIGp1c3RpZnk6IGJvdGggYmFycyBhcmUgc2libGluZ3MgKHBhbmVsIHNwYW5zIHRoZSBmdWxsIHdpZHRoKVxuXHRcdFx0anVzdGlmeUxlZnQ6IHNpYmxpbmdTdGF0dXMocyA9PiB7IHMuc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDsgcy5wYW5lbEFsaWdubWVudCA9ICdqdXN0aWZ5JzsgfSksXG5cdFx0XHRqdXN0aWZ5UmlnaHQ6IHNpYmxpbmdTdGF0dXMocyA9PiB7IHMuc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uUklHSFQ7IHMucGFuZWxBbGlnbm1lbnQgPSAnanVzdGlmeSc7IH0pLFxuXHRcdFx0Ly8gbGVmdCBhbGlnbm1lbnQsIHNpZGViYXIgb24gTEVGVDogc2lkZWJhciBJUyBzaWJsaW5nLCBhdXggYmFyIGlzIE5PVFxuXHRcdFx0bGVmdEFsaWduU2lkZWJhckxlZnQ6IHNpYmxpbmdTdGF0dXMocyA9PiB7IHMuc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDsgcy5wYW5lbEFsaWdubWVudCA9ICdsZWZ0JzsgfSksXG5cdFx0XHQvLyBsZWZ0IGFsaWdubWVudCwgc2lkZWJhciBvbiBSSUdIVDogc2lkZWJhciBpcyBOT1Qgc2libGluZywgYXV4IGJhciBJU1xuXHRcdFx0bGVmdEFsaWduU2lkZWJhclJpZ2h0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLlJJR0hUOyBzLnBhbmVsQWxpZ25tZW50ID0gJ2xlZnQnOyB9KSxcblx0XHRcdC8vIHJpZ2h0IGFsaWdubWVudCwgc2lkZWJhciBvbiBMRUZUOiBzaWRlYmFyIGlzIE5PVCBzaWJsaW5nLCBhdXggYmFyIElTXG5cdFx0XHRyaWdodEFsaWduU2lkZWJhckxlZnQ6IHNpYmxpbmdTdGF0dXMocyA9PiB7IHMuc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDsgcy5wYW5lbEFsaWdubWVudCA9ICdyaWdodCc7IH0pLFxuXHRcdFx0Ly8gcmlnaHQgYWxpZ25tZW50LCBzaWRlYmFyIG9uIFJJR0hUOiBzaWRlYmFyIElTIHNpYmxpbmcsIGF1eCBiYXIgaXMgTk9UXG5cdFx0XHRyaWdodEFsaWduU2lkZWJhclJpZ2h0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLlJJR0hUOyBzLnBhbmVsQWxpZ25tZW50ID0gJ3JpZ2h0JzsgfSksXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHRjZW50ZXJMZWZ0OiB7IHNpZGVCYXI6IGZhbHNlLCBhdXhCYXI6IGZhbHNlIH0sXG5cdFx0XHRjZW50ZXJSaWdodDogeyBzaWRlQmFyOiBmYWxzZSwgYXV4QmFyOiBmYWxzZSB9LFxuXHRcdFx0anVzdGlmeUxlZnQ6IHsgc2lkZUJhcjogdHJ1ZSwgYXV4QmFyOiB0cnVlIH0sXG5cdFx0XHRqdXN0aWZ5UmlnaHQ6IHsgc2lkZUJhcjogdHJ1ZSwgYXV4QmFyOiB0cnVlIH0sXG5cdFx0XHRsZWZ0QWxpZ25TaWRlYmFyTGVmdDogeyBzaWRlQmFyOiB0cnVlLCBhdXhCYXI6IGZhbHNlIH0sXG5cdFx0XHRsZWZ0QWxpZ25TaWRlYmFyUmlnaHQ6IHsgc2lkZUJhcjogZmFsc2UsIGF1eEJhcjogdHJ1ZSB9LFxuXHRcdFx0cmlnaHRBbGlnblNpZGViYXJMZWZ0OiB7IHNpZGVCYXI6IGZhbHNlLCBhdXhCYXI6IHRydWUgfSxcblx0XHRcdHJpZ2h0QWxpZ25TaWRlYmFyUmlnaHQ6IHsgc2lkZUJhcjogdHJ1ZSwgYXV4QmFyOiBmYWxzZSB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQTRCLHlDQUE4RCxPQUFPLGdCQUFnQjtBQUMxSCxTQUFTLHlC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
