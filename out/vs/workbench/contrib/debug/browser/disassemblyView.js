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
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { $, addStandardDisposableListener, append } from "../../../../base/browser/dom.js";
import { binarySearch2 } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { Constants } from "../../../../base/common/uint.js";
import { URI } from "../../../../base/common/uri.js";
import { applyFontInfo } from "../../../../editor/browser/config/domFontInfo.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { createBareFontInfoFromRawSettings } from "../../../../editor/common/config/fontInfoFromSettings.js";
import { Range } from "../../../../editor/common/core/range.js";
import { StringBuilder } from "../../../../editor/common/core/stringBuilder.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { focusedStackFrameColor, topStackFrameColor } from "./callStackEditorContribution.js";
import * as icons from "./debugIcons.js";
import { CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, DISASSEMBLY_VIEW_ID, IDebugService, State } from "../common/debug.js";
import { InstructionBreakpoint } from "../common/debugModel.js";
import { getUriFromSource } from "../common/debugSource.js";
import { isUriString, sourcesEqual } from "../common/debugUtils.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { COPY_ADDRESS_ID, COPY_ADDRESS_LABEL } from "../../../../workbench/contrib/debug/browser/debugCommands.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
const disassemblyNotAvailable = {
  allowBreakpoint: false,
  isBreakpointSet: false,
  isBreakpointEnabled: false,
  instructionReference: "",
  instructionOffset: 0,
  instructionReferenceOffset: 0,
  address: 0n,
  instruction: {
    address: "-1",
    instruction: localize("instructionNotAvailable", "Disassembly not available.")
  }
};
let DisassemblyView = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, _configurationService, _instantiationService, _debugService, _contextMenuService, menuService, contextKeyService) {
    super(DISASSEMBLY_VIEW_ID, group, telemetryService, themeService, storageService);
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._debugService = _debugService;
    this._contextMenuService = _contextMenuService;
    this._instructionBpList = [];
    this._enableSourceCodeRender = true;
    this._loadingLock = false;
    this._referenceToMemoryAddress = /* @__PURE__ */ new Map();
    this.menu = menuService.createMenu(MenuId.DebugDisassemblyContext, contextKeyService);
    this._register(this.menu);
    this._disassembledInstructions = void 0;
    this._onDidChangeStackFrame = this._register(new Emitter({ leakWarningThreshold: 1e3, leakWarningName: "DisassemblyView._onDidChangeStackFrame" }));
    this._previousDebuggingState = _debugService.state;
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug")) {
        const newValue = this._configurationService.getValue("debug").disassemblyView.showSourceCode;
        if (this._enableSourceCodeRender !== newValue) {
          this._enableSourceCodeRender = newValue;
        } else {
          this._disassembledInstructions?.rerender();
        }
      }
    }));
  }
  get fontInfo() {
    if (!this._fontInfo) {
      this._fontInfo = this.createFontInfo();
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("editor")) {
          this._fontInfo = this.createFontInfo();
        }
      }));
    }
    return this._fontInfo;
  }
  createFontInfo() {
    return createBareFontInfoFromRawSettings(this._configurationService.getValue("editor"), PixelRatio.getInstance(this.window).value);
  }
  get currentInstructionAddresses() {
    return this._debugService.getModel().getSessions(false).map((session) => session.getAllThreads()).reduce((prev, curr) => prev.concat(curr), []).map((thread) => thread.getTopStackFrame()).map((frame) => frame?.instructionPointerReference).map((ref) => ref ? this.getReferenceAddress(ref) : void 0);
  }
  // Instruction reference of the top stack frame of the focused stack
  get focusedCurrentInstructionReference() {
    return this._debugService.getViewModel().focusedStackFrame?.thread.getTopStackFrame()?.instructionPointerReference;
  }
  get focusedCurrentInstructionAddress() {
    const ref = this.focusedCurrentInstructionReference;
    return ref ? this.getReferenceAddress(ref) : void 0;
  }
  get focusedInstructionReference() {
    return this._debugService.getViewModel().focusedStackFrame?.instructionPointerReference;
  }
  get focusedInstructionAddress() {
    const ref = this.focusedInstructionReference;
    return ref ? this.getReferenceAddress(ref) : void 0;
  }
  get isSourceCodeRender() {
    return this._enableSourceCodeRender;
  }
  get debugSession() {
    return this._debugService.getViewModel().focusedSession;
  }
  get onDidChangeStackFrame() {
    return this._onDidChangeStackFrame.event;
  }
  get focusedAddressAndOffset() {
    const element = this._disassembledInstructions?.getFocusedElements()[0];
    if (!element) {
      return void 0;
    }
    return this.getAddressAndOffset(element);
  }
  getAddressAndOffset(element) {
    const reference = element.instructionReference;
    const offset = Number(element.address - this.getReferenceAddress(reference));
    return { reference, offset, address: element.address };
  }
  createEditor(parent) {
    this._enableSourceCodeRender = this._configurationService.getValue("debug").disassemblyView.showSourceCode;
    const lineHeight = this.fontInfo.lineHeight;
    const thisOM = this;
    const delegate = new class {
      constructor() {
        this.headerRowHeight = 0;
      }
      // No header
      getHeight(row) {
        if (thisOM.isSourceCodeRender && row.showSourceLocation && row.instruction.location?.path && row.instruction.line) {
          if (row.instruction.endLine) {
            return lineHeight * Math.max(2, row.instruction.endLine - row.instruction.line + 2);
          } else {
            return lineHeight * 2;
          }
        }
        return lineHeight;
      }
    }();
    const instructionRenderer = this._register(this._instantiationService.createInstance(InstructionRenderer, this));
    this._disassembledInstructions = this._register(this._instantiationService.createInstance(
      WorkbenchTable,
      "DisassemblyView",
      parent,
      delegate,
      [
        {
          label: "",
          tooltip: "",
          weight: 0,
          minimumWidth: this.fontInfo.lineHeight,
          maximumWidth: this.fontInfo.lineHeight,
          templateId: BreakpointRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("disassemblyTableColumnLabel", "instructions"),
          tooltip: "",
          weight: 0.3,
          templateId: InstructionRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this._instantiationService.createInstance(BreakpointRenderer, this),
        instructionRenderer
      ],
      {
        identityProvider: { getId: (e) => e.instruction.address },
        horizontalScrolling: false,
        overrideStyles: {
          listBackground: editorBackground
        },
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        openOnSingleClick: false,
        accessibilityProvider: new AccessibilityProvider(),
        mouseSupport: false
      }
    ));
    this._disassembledInstructions.domNode.classList.add("disassembly-view");
    if (this.focusedInstructionReference) {
      this.reloadDisassembly(this.focusedInstructionReference, 0);
    }
    this._register(this._disassembledInstructions.onDidScroll((e) => {
      if (this._disassembledInstructions?.row(0) === disassemblyNotAvailable) {
        return;
      }
      if (this._loadingLock) {
        return;
      }
      if (e.oldScrollTop > e.scrollTop && e.scrollTop < e.height) {
        this._loadingLock = true;
        const prevTop = Math.floor(e.scrollTop / this.fontInfo.lineHeight);
        this.scrollUp_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD).then((loaded) => {
          if (loaded > 0) {
            this._disassembledInstructions.reveal(prevTop + loaded, 0);
          }
        }).finally(() => {
          this._loadingLock = false;
        });
      } else if (e.oldScrollTop < e.scrollTop && e.scrollTop + e.height > e.scrollHeight - e.height) {
        this._loadingLock = true;
        this.scrollDown_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD).finally(() => {
          this._loadingLock = false;
        });
      }
    }));
    this._register(this._disassembledInstructions.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this._debugService.getViewModel().onDidFocusStackFrame(({ stackFrame }) => {
      if (this._disassembledInstructions && stackFrame?.instructionPointerReference) {
        this.goToInstructionAndOffset(stackFrame.instructionPointerReference, 0);
      }
      this._onDidChangeStackFrame.fire();
    }));
    this._register(this._debugService.getModel().onDidChangeBreakpoints((bpEvent) => {
      if (bpEvent && this._disassembledInstructions) {
        let changed = false;
        bpEvent.added?.forEach((bp) => {
          if (bp instanceof InstructionBreakpoint) {
            const index = this.getIndexFromReferenceAndOffset(bp.instructionReference, bp.offset);
            if (index >= 0) {
              this._disassembledInstructions.row(index).isBreakpointSet = true;
              this._disassembledInstructions.row(index).isBreakpointEnabled = bp.enabled;
              changed = true;
            }
          }
        });
        bpEvent.removed?.forEach((bp) => {
          if (bp instanceof InstructionBreakpoint) {
            const index = this.getIndexFromReferenceAndOffset(bp.instructionReference, bp.offset);
            if (index >= 0) {
              this._disassembledInstructions.row(index).isBreakpointSet = false;
              changed = true;
            }
          }
        });
        bpEvent.changed?.forEach((bp) => {
          if (bp instanceof InstructionBreakpoint) {
            const index = this.getIndexFromReferenceAndOffset(bp.instructionReference, bp.offset);
            if (index >= 0) {
              if (this._disassembledInstructions.row(index).isBreakpointEnabled !== bp.enabled) {
                this._disassembledInstructions.row(index).isBreakpointEnabled = bp.enabled;
                changed = true;
              }
            }
          }
        });
        this._instructionBpList = this._debugService.getModel().getInstructionBreakpoints();
        for (const bp of this._instructionBpList) {
          this.primeMemoryReference(bp.instructionReference);
        }
        if (changed) {
          this._onDidChangeStackFrame.fire();
        }
      }
    }));
    this._register(this._debugService.onDidChangeState((e) => {
      if ((e === State.Running || e === State.Stopped) && (this._previousDebuggingState !== State.Running && this._previousDebuggingState !== State.Stopped)) {
        this.clear();
        this._enableSourceCodeRender = this._configurationService.getValue("debug").disassemblyView.showSourceCode;
      }
      this._previousDebuggingState = e;
      this._onDidChangeStackFrame.fire();
    }));
  }
  layout(dimension) {
    this._disassembledInstructions?.layout(dimension.height);
  }
  async goToInstructionAndOffset(instructionReference, offset, focus) {
    let addr = this._referenceToMemoryAddress.get(instructionReference);
    if (addr === void 0) {
      await this.loadDisassembledInstructions(instructionReference, 0, -DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 2);
      addr = this._referenceToMemoryAddress.get(instructionReference);
    }
    if (addr) {
      this.goToAddress(addr + BigInt(offset), focus);
    }
  }
  /** Gets the address associated with the instruction reference. */
  getReferenceAddress(instructionReference) {
    return this._referenceToMemoryAddress.get(instructionReference);
  }
  /**
   * Go to the address provided. If no address is provided, reveal the address of the currently focused stack frame. Returns false if that address is not available.
   */
  goToAddress(address, focus) {
    if (!this._disassembledInstructions) {
      return false;
    }
    if (!address) {
      return false;
    }
    const index = this.getIndexFromAddress(address);
    if (index >= 0) {
      this._disassembledInstructions.reveal(index);
      if (focus) {
        this._disassembledInstructions.domFocus();
        this._disassembledInstructions.setFocus([index]);
      }
      return true;
    }
    return false;
  }
  async scrollUp_LoadDisassembledInstructions(instructionCount) {
    const first = this._disassembledInstructions?.row(0);
    if (first) {
      return this.loadDisassembledInstructions(
        first.instructionReference,
        first.instructionReferenceOffset,
        first.instructionOffset - instructionCount,
        instructionCount
      );
    }
    return 0;
  }
  async scrollDown_LoadDisassembledInstructions(instructionCount) {
    const last = this._disassembledInstructions?.row(this._disassembledInstructions?.length - 1);
    if (last) {
      return this.loadDisassembledInstructions(
        last.instructionReference,
        last.instructionReferenceOffset,
        last.instructionOffset + 1,
        instructionCount
      );
    }
    return 0;
  }
  /**
   * Sets the memory reference address. We don't just loadDisassembledInstructions
   * for this, since we can't really deal with discontiguous ranges (we can't
   * detect _if_ a range is discontiguous since we don't know how much memory
   * comes between instructions.)
   */
  async primeMemoryReference(instructionReference) {
    if (this._referenceToMemoryAddress.has(instructionReference)) {
      return true;
    }
    const s = await this.debugSession?.disassemble(instructionReference, 0, 0, 1);
    if (s && s.length > 0) {
      try {
        this._referenceToMemoryAddress.set(instructionReference, BigInt(s[0].address));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  /** Loads disasembled instructions. Returns the number of instructions that were loaded. */
  async loadDisassembledInstructions(instructionReference, offset, instructionOffset, instructionCount) {
    const session = this.debugSession;
    const resultEntries = await session?.disassemble(instructionReference, offset, instructionOffset, instructionCount);
    if (!this._referenceToMemoryAddress.has(instructionReference) && instructionOffset !== 0) {
      await this.loadDisassembledInstructions(instructionReference, 0, 0, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD);
    }
    if (session && resultEntries && this._disassembledInstructions) {
      const newEntries = [];
      let lastLocation;
      let lastLine;
      for (let i = 0; i < resultEntries.length; i++) {
        const instruction = resultEntries[i];
        const thisInstructionOffset = instructionOffset + i;
        if (instruction.location) {
          lastLocation = instruction.location;
          lastLine = void 0;
        }
        if (instruction.line) {
          const currentLine = {
            startLineNumber: instruction.line,
            startColumn: instruction.column ?? 0,
            endLineNumber: instruction.endLine ?? instruction.line,
            endColumn: instruction.endColumn ?? 0
          };
          if (!Range.equalsRange(currentLine, lastLine ?? null)) {
            lastLine = currentLine;
            instruction.location = lastLocation;
          }
        }
        let address;
        try {
          address = BigInt(instruction.address);
        } catch {
          console.error(`Could not parse disassembly address ${instruction.address} (in ${JSON.stringify(instruction)})`);
          continue;
        }
        if (address === -1n) {
          continue;
        }
        const entry = {
          allowBreakpoint: true,
          isBreakpointSet: false,
          isBreakpointEnabled: false,
          instructionReference,
          instructionReferenceOffset: offset,
          instructionOffset: thisInstructionOffset,
          instruction,
          address
        };
        newEntries.push(entry);
        if (offset === 0 && thisInstructionOffset === 0) {
          this._referenceToMemoryAddress.set(instructionReference, address);
        }
      }
      if (newEntries.length === 0) {
        return 0;
      }
      const refBaseAddress = this._referenceToMemoryAddress.get(instructionReference);
      const bps = this._instructionBpList.map((p) => {
        const base = this._referenceToMemoryAddress.get(p.instructionReference);
        if (!base) {
          return void 0;
        }
        return {
          enabled: p.enabled,
          address: base + BigInt(p.offset || 0)
        };
      });
      if (refBaseAddress !== void 0) {
        for (const entry of newEntries) {
          const bp = bps.find((p) => p?.address === entry.address);
          if (bp) {
            entry.isBreakpointSet = true;
            entry.isBreakpointEnabled = bp.enabled;
          }
        }
      }
      const da = this._disassembledInstructions;
      if (da.length === 1 && this._disassembledInstructions.row(0) === disassemblyNotAvailable) {
        da.splice(0, 1);
      }
      const firstAddr = newEntries[0].address;
      const lastAddr = newEntries[newEntries.length - 1].address;
      const startN = binarySearch2(da.length, (i) => Number(da.row(i).address - firstAddr));
      const start = startN < 0 ? ~startN : startN;
      const endN = binarySearch2(da.length, (i) => Number(da.row(i).address - lastAddr));
      const end = endN < 0 ? ~endN : endN + 1;
      const toDelete = end - start;
      let lastLocated;
      for (let i = start - 1; i >= 0; i--) {
        const { instruction } = da.row(i);
        if (instruction.location && instruction.line !== void 0) {
          lastLocated = instruction;
          break;
        }
      }
      const shouldShowLocation = (instruction) => instruction.line !== void 0 && instruction.location !== void 0 && (!lastLocated || !sourcesEqual(instruction.location, lastLocated.location) || instruction.line !== lastLocated.line);
      for (const entry of newEntries) {
        if (shouldShowLocation(entry.instruction)) {
          entry.showSourceLocation = true;
          lastLocated = entry.instruction;
        }
      }
      da.splice(start, toDelete, newEntries);
      return newEntries.length - toDelete;
    }
    return 0;
  }
  getIndexFromReferenceAndOffset(instructionReference, offset) {
    const addr = this._referenceToMemoryAddress.get(instructionReference);
    if (addr === void 0) {
      return -1;
    }
    return this.getIndexFromAddress(addr + BigInt(offset));
  }
  getIndexFromAddress(address) {
    const disassembledInstructions = this._disassembledInstructions;
    if (disassembledInstructions && disassembledInstructions.length > 0) {
      return binarySearch2(disassembledInstructions.length, (index) => {
        const row = disassembledInstructions.row(index);
        return Number(row.address - address);
      });
    }
    return -1;
  }
  /**
   * Clears the table and reload instructions near the target address
   */
  reloadDisassembly(instructionReference, offset) {
    if (!this._disassembledInstructions) {
      return;
    }
    this._loadingLock = true;
    this.clear();
    this._instructionBpList = this._debugService.getModel().getInstructionBreakpoints();
    this.loadDisassembledInstructions(instructionReference, offset, -DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 4, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 8).then(() => {
      if (this._disassembledInstructions.length > 0) {
        let targetIndex = void 0;
        const refBaseAddress = this._referenceToMemoryAddress.get(instructionReference);
        if (refBaseAddress !== void 0) {
          const da = this._disassembledInstructions;
          targetIndex = binarySearch2(da.length, (i) => Number(da.row(i).address - refBaseAddress));
          if (targetIndex < 0) {
            targetIndex = ~targetIndex;
          }
        }
        if (targetIndex === void 0) {
          targetIndex = Math.floor(this._disassembledInstructions.length / 2);
        }
        this._disassembledInstructions.reveal(targetIndex, 0.5);
        this._disassembledInstructions.domFocus();
        this._disassembledInstructions.setFocus([targetIndex]);
      }
      this._loadingLock = false;
    });
  }
  clear() {
    this._referenceToMemoryAddress.clear();
    this._disassembledInstructions?.splice(0, this._disassembledInstructions.length, [disassemblyNotAvailable]);
  }
  onContextMenu(e) {
    const actions = getFlatContextMenuActions(this.menu.getActions({ shouldForwardArgs: true }));
    this._contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      getActionsContext: () => e.element
    });
  }
};
DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD = 50;
DisassemblyView = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IDebugService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService)
], DisassemblyView);
let BreakpointRenderer = class {
  constructor(_disassemblyView, _debugService) {
    this._disassemblyView = _disassemblyView;
    this._debugService = _debugService;
    this.templateId = BreakpointRenderer.TEMPLATE_ID;
    this._breakpointIcon = "codicon-" + icons.breakpoint.regular.id;
    this._breakpointDisabledIcon = "codicon-" + icons.breakpoint.disabled.id;
    this._breakpointHintIcon = "codicon-" + icons.debugBreakpointHint.id;
    this._debugStackframe = "codicon-" + icons.debugStackframe.id;
    this._debugStackframeFocused = "codicon-" + icons.debugStackframeFocused.id;
  }
  renderTemplate(container) {
    container.style.alignSelf = "flex-end";
    const icon = append(container, $(".codicon"));
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.height = this._disassemblyView.fontInfo.lineHeight + "px";
    const currentElement = { element: void 0 };
    const disposables = [
      this._disassemblyView.onDidChangeStackFrame(() => this.rerenderDebugStackframe(icon, currentElement.element)),
      addStandardDisposableListener(container, "mouseover", () => {
        if (currentElement.element?.allowBreakpoint) {
          icon.classList.add(this._breakpointHintIcon);
        }
      }),
      addStandardDisposableListener(container, "mouseout", () => {
        if (currentElement.element?.allowBreakpoint) {
          icon.classList.remove(this._breakpointHintIcon);
        }
      }),
      addStandardDisposableListener(container, "click", () => {
        if (currentElement.element?.allowBreakpoint) {
          icon.classList.add(this._breakpointHintIcon);
          const reference = currentElement.element.instructionReference;
          const address = currentElement.element.address;
          const offset = Number(address - this._disassemblyView.getReferenceAddress(reference));
          if (currentElement.element.isBreakpointSet) {
            this._debugService.removeInstructionBreakpoints(reference, offset, address);
          } else if (currentElement.element.allowBreakpoint && !currentElement.element.isBreakpointSet) {
            this._debugService.addInstructionBreakpoint({ instructionReference: reference, offset, address, canPersist: false });
          }
        }
      })
    ];
    return { currentElement, icon, disposables };
  }
  renderElement(element, index, templateData) {
    templateData.currentElement.element = element;
    this.rerenderDebugStackframe(templateData.icon, element);
  }
  disposeTemplate(templateData) {
    dispose(templateData.disposables);
    templateData.disposables = [];
  }
  rerenderDebugStackframe(icon, element) {
    if (element?.address === this._disassemblyView.focusedCurrentInstructionAddress) {
      icon.classList.add(this._debugStackframe);
    } else if (element?.address === this._disassemblyView.focusedInstructionAddress) {
      icon.classList.add(this._debugStackframeFocused);
    } else {
      icon.classList.remove(this._debugStackframe);
      icon.classList.remove(this._debugStackframeFocused);
    }
    icon.classList.remove(this._breakpointHintIcon);
    if (element?.isBreakpointSet) {
      if (element.isBreakpointEnabled) {
        icon.classList.add(this._breakpointIcon);
        icon.classList.remove(this._breakpointDisabledIcon);
      } else {
        icon.classList.remove(this._breakpointIcon);
        icon.classList.add(this._breakpointDisabledIcon);
      }
    } else {
      icon.classList.remove(this._breakpointIcon);
      icon.classList.remove(this._breakpointDisabledIcon);
    }
  }
};
BreakpointRenderer.TEMPLATE_ID = "breakpoint";
BreakpointRenderer = __decorateClass([
  __decorateParam(1, IDebugService)
], BreakpointRenderer);
let InstructionRenderer = class extends Disposable {
  constructor(_disassemblyView, themeService, editorService, textModelService, uriService, logService) {
    super();
    this._disassemblyView = _disassemblyView;
    this.editorService = editorService;
    this.textModelService = textModelService;
    this.uriService = uriService;
    this.logService = logService;
    this.templateId = InstructionRenderer.TEMPLATE_ID;
    this._topStackFrameColor = themeService.getColorTheme().getColor(topStackFrameColor);
    this._focusedStackFrameColor = themeService.getColorTheme().getColor(focusedStackFrameColor);
    this._register(themeService.onDidColorThemeChange((e) => {
      this._topStackFrameColor = e.getColor(topStackFrameColor);
      this._focusedStackFrameColor = e.getColor(focusedStackFrameColor);
    }));
  }
  renderTemplate(container) {
    const sourcecode = append(container, $(".sourcecode"));
    const instruction = append(container, $(".instruction"));
    this.applyFontInfo(sourcecode);
    this.applyFontInfo(instruction);
    const currentElement = { element: void 0 };
    const cellDisposable = [];
    const disposables = [
      this._disassemblyView.onDidChangeStackFrame(() => this.rerenderBackground(instruction, sourcecode, currentElement.element)),
      addStandardDisposableListener(sourcecode, "dblclick", () => this.openSourceCode(currentElement.element?.instruction))
    ];
    return { currentElement, instruction, sourcecode, cellDisposable, disposables };
  }
  renderElement(element, index, templateData) {
    this.renderElementInner(element, index, templateData);
  }
  async renderElementInner(element, index, templateData) {
    templateData.currentElement.element = element;
    const instruction = element.instruction;
    templateData.sourcecode.innerText = "";
    const sb = new StringBuilder(1e3);
    if (this._disassemblyView.isSourceCodeRender && element.showSourceLocation && instruction.location?.path && instruction.line !== void 0) {
      const sourceURI = this.getUriFromSource(instruction);
      if (sourceURI) {
        let textModel = void 0;
        const sourceSB = new StringBuilder(1e4);
        const ref = await this.textModelService.createModelReference(sourceURI);
        if (templateData.currentElement.element !== element) {
          ref.dispose();
          return;
        }
        textModel = ref.object.textEditorModel;
        templateData.cellDisposable.push(ref);
        if (textModel && templateData.currentElement.element === element) {
          let lineNumber = instruction.line;
          while (lineNumber && lineNumber >= 1 && lineNumber <= textModel.getLineCount()) {
            const lineContent = textModel.getLineContent(lineNumber);
            sourceSB.appendString(`  ${lineNumber}: `);
            sourceSB.appendString(lineContent + "\n");
            if (instruction.endLine && lineNumber < instruction.endLine) {
              lineNumber++;
              continue;
            }
            break;
          }
          templateData.sourcecode.innerText = sourceSB.build();
        }
      }
    }
    let spacesToAppend = 10;
    if (instruction.address !== "-1") {
      sb.appendString(instruction.address);
      if (instruction.address.length < InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH) {
        spacesToAppend = InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH - instruction.address.length;
      }
      for (let i = 0; i < spacesToAppend; i++) {
        sb.appendString(" ");
      }
    }
    if (instruction.instructionBytes) {
      sb.appendString(instruction.instructionBytes);
      spacesToAppend = 10;
      if (instruction.instructionBytes.length < InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH) {
        spacesToAppend = InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH - instruction.instructionBytes.length;
      }
      for (let i = 0; i < spacesToAppend; i++) {
        sb.appendString(" ");
      }
    }
    sb.appendString(instruction.instruction);
    templateData.instruction.innerText = sb.build();
    this.rerenderBackground(templateData.instruction, templateData.sourcecode, element);
  }
  disposeElement(element, index, templateData) {
    dispose(templateData.cellDisposable);
    templateData.cellDisposable = [];
  }
  disposeTemplate(templateData) {
    dispose(templateData.disposables);
    templateData.disposables = [];
  }
  rerenderBackground(instruction, sourceCode, element) {
    if (element && this._disassemblyView.currentInstructionAddresses.includes(element.address)) {
      instruction.style.background = this._topStackFrameColor?.toString() || "transparent";
    } else if (element?.address === this._disassemblyView.focusedInstructionAddress) {
      instruction.style.background = this._focusedStackFrameColor?.toString() || "transparent";
    } else {
      instruction.style.background = "transparent";
    }
  }
  openSourceCode(instruction) {
    if (instruction) {
      const sourceURI = this.getUriFromSource(instruction);
      const selection = instruction.endLine ? {
        startLineNumber: instruction.line,
        endLineNumber: instruction.endLine,
        startColumn: instruction.column || 1,
        endColumn: instruction.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
      } : {
        startLineNumber: instruction.line,
        endLineNumber: instruction.line,
        startColumn: instruction.column || 1,
        endColumn: instruction.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
      };
      this.editorService.openEditor({
        resource: sourceURI,
        description: localize("editorOpenedFromDisassemblyDescription", "from disassembly"),
        options: {
          preserveFocus: false,
          selection,
          revealIfOpened: true,
          selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
          pinned: false
        }
      });
    }
  }
  getUriFromSource(instruction) {
    const path = instruction.location.path;
    if (path && isUriString(path)) {
      return this.uriService.asCanonicalUri(URI.parse(path));
    }
    if (path && isAbsolute(path)) {
      return this.uriService.asCanonicalUri(URI.file(path));
    }
    return getUriFromSource(instruction.location, instruction.location.path, this._disassemblyView.debugSession.getId(), this.uriService, this.logService);
  }
  applyFontInfo(element) {
    applyFontInfo(element, this._disassemblyView.fontInfo);
    element.style.whiteSpace = "pre";
  }
};
InstructionRenderer.TEMPLATE_ID = "instruction";
InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH = 25;
InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH = 30;
InstructionRenderer = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILogService)
], InstructionRenderer);
class AccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("disassemblyView", "Disassembly View");
  }
  getAriaLabel(element) {
    let label = "";
    const instruction = element.instruction;
    if (instruction.address !== "-1") {
      label += `${localize("instructionAddress", "Address")}: ${instruction.address}`;
    }
    if (instruction.instructionBytes) {
      label += `, ${localize("instructionBytes", "Bytes")}: ${instruction.instructionBytes}`;
    }
    label += `, ${localize(`instructionText`, "Instruction")}: ${instruction.instruction}`;
    return label;
  }
}
let DisassemblyViewContribution = class {
  constructor(editorService, debugService, contextKeyService) {
    contextKeyService.bufferChangeEvents(() => {
      this._languageSupportsDisassembleRequest = CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST.bindTo(contextKeyService);
    });
    const onDidActiveEditorChangeListener = () => {
      if (this._onDidChangeModelLanguage) {
        this._onDidChangeModelLanguage.dispose();
        this._onDidChangeModelLanguage = void 0;
      }
      const activeTextEditorControl = editorService.activeTextEditorControl;
      if (isCodeEditor(activeTextEditorControl)) {
        const language = activeTextEditorControl.getModel()?.getLanguageId();
        this._languageSupportsDisassembleRequest?.set(!!language && debugService.getAdapterManager().someDebuggerInterestedInLanguage(language));
        this._onDidChangeModelLanguage = activeTextEditorControl.onDidChangeModelLanguage((e) => {
          this._languageSupportsDisassembleRequest?.set(debugService.getAdapterManager().someDebuggerInterestedInLanguage(e.newLanguage));
        });
      } else {
        this._languageSupportsDisassembleRequest?.set(false);
      }
    };
    onDidActiveEditorChangeListener();
    this._onDidActiveEditorChangeListener = editorService.onDidActiveEditorChange(onDidActiveEditorChangeListener);
  }
  dispose() {
    this._onDidActiveEditorChangeListener.dispose();
    this._onDidChangeModelLanguage?.dispose();
  }
};
DisassemblyViewContribution = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextKeyService)
], DisassemblyViewContribution);
CommandsRegistry.registerCommand({
  metadata: {
    description: COPY_ADDRESS_LABEL
  },
  id: COPY_ADDRESS_ID,
  handler: async (accessor, entry) => {
    if (entry?.instruction?.address) {
      const clipboardService = accessor.get(IClipboardService);
      clipboardService.writeText(entry.instruction.address);
    }
  }
});
export {
  DisassemblyView,
  DisassemblyViewContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGlzYXNzZW1ibHlWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7ICQsIERpbWVuc2lvbiwgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElUYWJsZUNvbnRleHRNZW51RXZlbnQsIElUYWJsZVJlbmRlcmVyLCBJVGFibGVWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGUuanMnO1xuaW1wb3J0IHsgYmluYXJ5U2VhcmNoMiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0Fic29sdXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhcHBseUZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2RvbUZvbnRJbmZvLmpzJztcbmltcG9ydCB7IGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQmFyZUZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm9Gcm9tU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTdHJpbmdCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3N0cmluZ0J1aWxkZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgZm9jdXNlZFN0YWNrRnJhbWVDb2xvciwgdG9wU3RhY2tGcmFtZUNvbG9yIH0gZnJvbSAnLi9jYWxsU3RhY2tFZGl0b3JDb250cmlidXRpb24uanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCB7IENPTlRFWFRfTEFOR1VBR0VfU1VQUE9SVFNfRElTQVNTRU1CTEVfUkVRVUVTVCwgRElTQVNTRU1CTFlfVklFV19JRCwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSUluc3RydWN0aW9uQnJlYWtwb2ludCwgU3RhdGUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgSW5zdHJ1Y3Rpb25CcmVha3BvaW50IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0VXJpRnJvbVNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBpc1VyaVN0cmluZywgc291cmNlc0VxdWFsIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDT1BZX0FERFJFU1NfSUQsIENPUFlfQUREUkVTU19MQUJFTCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSB7XG5cdGFsbG93QnJlYWtwb2ludDogYm9vbGVhbjtcblx0aXNCcmVha3BvaW50U2V0OiBib29sZWFuO1xuXHRpc0JyZWFrcG9pbnRFbmFibGVkOiBib29sZWFuO1xuXHQvKiogSW5zdHJ1Y3Rpb24gcmVmZXJlbmNlIGZyb20gdGhlIERBICovXG5cdGluc3RydWN0aW9uUmVmZXJlbmNlOiBzdHJpbmc7XG5cdC8qKiBPZmZzZXQgZnJvbSB0aGUgaW5zdHJ1Y3Rpb25SZWZlcmVuY2UgdGhhdCdzIHRoZSBiYXNpcyBmb3IgdGhlIGBpbnN0cnVjdGlvbk9mZnNldGAgKi9cblx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2VPZmZzZXQ6IG51bWJlcjtcblx0LyoqIFRoZSBudW1iZXIgb2YgaW5zdHJ1Y3Rpb25zICgrLy0pIGF3YXkgZnJvbSB0aGUgaW5zdHJ1Y3Rpb25SZWZlcmVuY2UgYW5kIGluc3RydWN0aW9uUmVmZXJlbmNlT2Zmc2V0IHRoaXMgaW5zdHJ1Y3Rpb24gbGllcyAqL1xuXHRpbnN0cnVjdGlvbk9mZnNldDogbnVtYmVyO1xuXHQvKiogV2hldGhlciB0aGlzIGlzIHRoZSBmaXJzdCBpbnN0cnVjdGlvbiBvbiB0aGUgdGFyZ2V0IGxpbmUuICovXG5cdHNob3dTb3VyY2VMb2NhdGlvbj86IGJvb2xlYW47XG5cdC8qKiBPcmlnaW5hbCBpbnN0cnVjdGlvbiBmcm9tIHRoZSBkZWJ1Z2dlciAqL1xuXHRpbnN0cnVjdGlvbjogRGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZWRJbnN0cnVjdGlvbjtcblx0LyoqIFBhcnNlZCBpbnN0cnVjdGlvbiBhZGRyZXNzICovXG5cdGFkZHJlc3M6IGJpZ2ludDtcbn1cblxuLy8gU3BlY2lhbCBlbnRyeSBhcyBhIHBsYWNlaG9sZXIgd2hlbiBkaXNhc3NlbWJseSBpcyBub3QgYXZhaWxhYmxlXG5jb25zdCBkaXNhc3NlbWJseU5vdEF2YWlsYWJsZTogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkgPSB7XG5cdGFsbG93QnJlYWtwb2ludDogZmFsc2UsXG5cdGlzQnJlYWtwb2ludFNldDogZmFsc2UsXG5cdGlzQnJlYWtwb2ludEVuYWJsZWQ6IGZhbHNlLFxuXHRpbnN0cnVjdGlvblJlZmVyZW5jZTogJycsXG5cdGluc3RydWN0aW9uT2Zmc2V0OiAwLFxuXHRpbnN0cnVjdGlvblJlZmVyZW5jZU9mZnNldDogMCxcblx0YWRkcmVzczogMG4sXG5cdGluc3RydWN0aW9uOiB7XG5cdFx0YWRkcmVzczogJy0xJyxcblx0XHRpbnN0cnVjdGlvbjogbG9jYWxpemUoJ2luc3RydWN0aW9uTm90QXZhaWxhYmxlJywgXCJEaXNhc3NlbWJseSBub3QgYXZhaWxhYmxlLlwiKVxuXHR9LFxufTtcblxuZXhwb3J0IGNsYXNzIERpc2Fzc2VtYmx5VmlldyBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5VTV9JTlNUUlVDVElPTlNfVE9fTE9BRCA9IDUwO1xuXG5cdC8vIFVzZWQgaW4gaW5zdHJ1Y3Rpb24gcmVuZGVyZXJcblx0cHJpdmF0ZSBfZm9udEluZm86IEJhcmVGb250SW5mbyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zOiBXb3JrYmVuY2hUYWJsZTxJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU3RhY2tGcmFtZTogRW1pdHRlcjx2b2lkPjtcblx0cHJpdmF0ZSBfcHJldmlvdXNEZWJ1Z2dpbmdTdGF0ZTogU3RhdGU7XG5cdHByaXZhdGUgX2luc3RydWN0aW9uQnBMaXN0OiByZWFkb25seSBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50W10gPSBbXTtcblx0cHJpdmF0ZSBfZW5hYmxlU291cmNlQ29kZVJlbmRlcjogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX2xvYWRpbmdMb2NrOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcyA9IG5ldyBNYXA8c3RyaW5nLCBiaWdpbnQ+KCk7XG5cdHByaXZhdGUgbWVudTogSU1lbnU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRElTQVNTRU1CTFlfVklFV19JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5tZW51ID0gbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuRGVidWdEaXNhc3NlbWJseUNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnUpO1xuXHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YWNrRnJhbWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPih7IGxlYWtXYXJuaW5nVGhyZXNob2xkOiAxMDAwLCBsZWFrV2FybmluZ05hbWU6ICdEaXNhc3NlbWJseVZpZXcuX29uRGlkQ2hhbmdlU3RhY2tGcmFtZScgfSkpO1xuXHRcdHRoaXMuX3ByZXZpb3VzRGVidWdnaW5nU3RhdGUgPSBfZGVidWdTZXJ2aWNlLnN0YXRlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcnKSkge1xuXHRcdFx0XHQvLyBzaG93L2hpZGUgc291cmNlIGNvZGUgcmVxdWlyZXMgY2hhbmdpbmcgaGVpZ2h0IHdoaWNoIFdvcmtiZW5jaFRhYmxlIGRvZXNuJ3Qgc3VwcG9ydCBkeW5hbWljIGhlaWdodCwgdGh1cyBmb3JjZSBhIHRvdGFsIHJlbG9hZC5cblx0XHRcdFx0Y29uc3QgbmV3VmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5kaXNhc3NlbWJseVZpZXcuc2hvd1NvdXJjZUNvZGU7XG5cdFx0XHRcdGlmICh0aGlzLl9lbmFibGVTb3VyY2VDb2RlUmVuZGVyICE9PSBuZXdWYWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2VuYWJsZVNvdXJjZUNvZGVSZW5kZXIgPSBuZXdWYWx1ZTtcblx0XHRcdFx0XHQvLyB0b2RvOiB0cmlnZ2VyIHJlcmVuZGVyXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zPy5yZXJlbmRlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGZvbnRJbmZvKCkge1xuXHRcdGlmICghdGhpcy5fZm9udEluZm8pIHtcblx0XHRcdHRoaXMuX2ZvbnRJbmZvID0gdGhpcy5jcmVhdGVGb250SW5mbygpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3InKSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZvbnRJbmZvID0gdGhpcy5jcmVhdGVGb250SW5mbygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2ZvbnRJbmZvO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVGb250SW5mbygpIHtcblx0XHRyZXR1cm4gY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3InKSwgUGl4ZWxSYXRpby5nZXRJbnN0YW5jZSh0aGlzLndpbmRvdykudmFsdWUpO1xuXHR9XG5cblx0Z2V0IGN1cnJlbnRJbnN0cnVjdGlvbkFkZHJlc3NlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoZmFsc2UpLlxuXHRcdFx0bWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCkpLlxuXHRcdFx0cmVkdWNlKChwcmV2LCBjdXJyKSA9PiBwcmV2LmNvbmNhdChjdXJyKSwgW10pLlxuXHRcdFx0bWFwKHRocmVhZCA9PiB0aHJlYWQuZ2V0VG9wU3RhY2tGcmFtZSgpKS5cblx0XHRcdG1hcChmcmFtZSA9PiBmcmFtZT8uaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlKS5cblx0XHRcdG1hcChyZWYgPT4gcmVmID8gdGhpcy5nZXRSZWZlcmVuY2VBZGRyZXNzKHJlZikgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gSW5zdHJ1Y3Rpb24gcmVmZXJlbmNlIG9mIHRoZSB0b3Agc3RhY2sgZnJhbWUgb2YgdGhlIGZvY3VzZWQgc3RhY2tcblx0Z2V0IGZvY3VzZWRDdXJyZW50SW5zdHJ1Y3Rpb25SZWZlcmVuY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZT8udGhyZWFkLmdldFRvcFN0YWNrRnJhbWUoKT8uaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlO1xuXHR9XG5cblx0Z2V0IGZvY3VzZWRDdXJyZW50SW5zdHJ1Y3Rpb25BZGRyZXNzKCkge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuZm9jdXNlZEN1cnJlbnRJbnN0cnVjdGlvblJlZmVyZW5jZTtcblx0XHRyZXR1cm4gcmVmID8gdGhpcy5nZXRSZWZlcmVuY2VBZGRyZXNzKHJlZikgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgZm9jdXNlZEluc3RydWN0aW9uUmVmZXJlbmNlKCkge1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU/Lmluc3RydWN0aW9uUG9pbnRlclJlZmVyZW5jZTtcblx0fVxuXG5cdGdldCBmb2N1c2VkSW5zdHJ1Y3Rpb25BZGRyZXNzKCkge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuZm9jdXNlZEluc3RydWN0aW9uUmVmZXJlbmNlO1xuXHRcdHJldHVybiByZWYgPyB0aGlzLmdldFJlZmVyZW5jZUFkZHJlc3MocmVmKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBpc1NvdXJjZUNvZGVSZW5kZXIoKSB7IHJldHVybiB0aGlzLl9lbmFibGVTb3VyY2VDb2RlUmVuZGVyOyB9XG5cblx0Z2V0IGRlYnVnU2Vzc2lvbigpOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlU3RhY2tGcmFtZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlU3RhY2tGcmFtZS5ldmVudDsgfVxuXG5cdGdldCBmb2N1c2VkQWRkcmVzc0FuZE9mZnNldCgpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zPy5nZXRGb2N1c2VkRWxlbWVudHMoKVswXTtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0QWRkcmVzc0FuZE9mZnNldChlbGVtZW50KTtcblx0fVxuXG5cdGdldEFkZHJlc3NBbmRPZmZzZXQoZWxlbWVudDogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkpIHtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBlbGVtZW50Lmluc3RydWN0aW9uUmVmZXJlbmNlO1xuXHRcdGNvbnN0IG9mZnNldCA9IE51bWJlcihlbGVtZW50LmFkZHJlc3MgLSB0aGlzLmdldFJlZmVyZW5jZUFkZHJlc3MocmVmZXJlbmNlKSEpO1xuXHRcdHJldHVybiB7IHJlZmVyZW5jZSwgb2Zmc2V0LCBhZGRyZXNzOiBlbGVtZW50LmFkZHJlc3MgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZVNvdXJjZUNvZGVSZW5kZXIgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5kaXNhc3NlbWJseVZpZXcuc2hvd1NvdXJjZUNvZGU7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZm9udEluZm8ubGluZUhlaWdodDtcblx0XHRjb25zdCB0aGlzT00gPSB0aGlzO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVRhYmxlVmlydHVhbERlbGVnYXRlPElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5PiB7XG5cdFx0XHRoZWFkZXJSb3dIZWlnaHQ6IG51bWJlciA9IDA7IC8vIE5vIGhlYWRlclxuXHRcdFx0Z2V0SGVpZ2h0KHJvdzogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkpOiBudW1iZXIge1xuXHRcdFx0XHRpZiAodGhpc09NLmlzU291cmNlQ29kZVJlbmRlciAmJiByb3cuc2hvd1NvdXJjZUxvY2F0aW9uICYmIHJvdy5pbnN0cnVjdGlvbi5sb2NhdGlvbj8ucGF0aCAmJiByb3cuaW5zdHJ1Y3Rpb24ubGluZSkge1xuXHRcdFx0XHRcdC8vIGluc3RydWN0aW9uIGxpbmUgKyBzb3VyY2UgbGluZXNcblx0XHRcdFx0XHRpZiAocm93Lmluc3RydWN0aW9uLmVuZExpbmUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsaW5lSGVpZ2h0ICogTWF0aC5tYXgoMiwgKHJvdy5pbnN0cnVjdGlvbi5lbmRMaW5lIC0gcm93Lmluc3RydWN0aW9uLmxpbmUgKyAyKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHNvdXJjZSBpcyBvbmx5IGEgc2luZ2xlIGxpbmUuXG5cdFx0XHRcdFx0XHRyZXR1cm4gbGluZUhlaWdodCAqIDI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8ganVzdCBpbnN0cnVjdGlvbiBsaW5lXG5cdFx0XHRcdHJldHVybiBsaW5lSGVpZ2h0O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0cnVjdGlvblJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdHJ1Y3Rpb25SZW5kZXJlciwgdGhpcykpO1xuXG5cdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVGFibGUsXG5cdFx0XHQnRGlzYXNzZW1ibHlWaWV3JywgcGFyZW50LCBkZWxlZ2F0ZSxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDAsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiB0aGlzLmZvbnRJbmZvLmxpbmVIZWlnaHQsXG5cdFx0XHRcdFx0bWF4aW11bVdpZHRoOiB0aGlzLmZvbnRJbmZvLmxpbmVIZWlnaHQsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogQnJlYWtwb2ludFJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSk6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaXNhc3NlbWJseVRhYmxlQ29sdW1uTGFiZWwnLCBcImluc3RydWN0aW9uc1wiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDAuMyxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBJbnN0cnVjdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSk6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWtwb2ludFJlbmRlcmVyLCB0aGlzKSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25SZW5kZXJlcixcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IChlOiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSkgPT4gZS5pbnN0cnVjdGlvbi5hZGRyZXNzIH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IEFjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlXG5cdFx0XHR9XG5cdFx0KSkgYXMgV29ya2JlbmNoVGFibGU8SURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnk+O1xuXG5cdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZGlzYXNzZW1ibHktdmlldycpO1xuXG5cdFx0aWYgKHRoaXMuZm9jdXNlZEluc3RydWN0aW9uUmVmZXJlbmNlKSB7XG5cdFx0XHR0aGlzLnJlbG9hZERpc2Fzc2VtYmx5KHRoaXMuZm9jdXNlZEluc3RydWN0aW9uUmVmZXJlbmNlLCAwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMub25EaWRTY3JvbGwoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zPy5yb3coMCkgPT09IGRpc2Fzc2VtYmx5Tm90QXZhaWxhYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9sb2FkaW5nTG9jaykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLm9sZFNjcm9sbFRvcCA+IGUuc2Nyb2xsVG9wICYmIGUuc2Nyb2xsVG9wIDwgZS5oZWlnaHQpIHtcblx0XHRcdFx0dGhpcy5fbG9hZGluZ0xvY2sgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBwcmV2VG9wID0gTWF0aC5mbG9vcihlLnNjcm9sbFRvcCAvIHRoaXMuZm9udEluZm8ubGluZUhlaWdodCk7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsVXBfTG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhEaXNhc3NlbWJseVZpZXcuTlVNX0lOU1RSVUNUSU9OU19UT19MT0FEKS50aGVuKChsb2FkZWQpID0+IHtcblx0XHRcdFx0XHRpZiAobG9hZGVkID4gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5yZXZlYWwocHJldlRvcCArIGxvYWRlZCwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KS5maW5hbGx5KCgpID0+IHsgdGhpcy5fbG9hZGluZ0xvY2sgPSBmYWxzZTsgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGUub2xkU2Nyb2xsVG9wIDwgZS5zY3JvbGxUb3AgJiYgZS5zY3JvbGxUb3AgKyBlLmhlaWdodCA+IGUuc2Nyb2xsSGVpZ2h0IC0gZS5oZWlnaHQpIHtcblx0XHRcdFx0dGhpcy5fbG9hZGluZ0xvY2sgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnNjcm9sbERvd25fTG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhEaXNhc3NlbWJseVZpZXcuTlVNX0lOU1RSVUNUSU9OU19UT19MT0FEKS5maW5hbGx5KCgpID0+IHsgdGhpcy5fbG9hZGluZ0xvY2sgPSBmYWxzZTsgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU3RhY2tGcmFtZSgoeyBzdGFja0ZyYW1lIH0pID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMgJiYgc3RhY2tGcmFtZT8uaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlKSB7XG5cdFx0XHRcdHRoaXMuZ29Ub0luc3RydWN0aW9uQW5kT2Zmc2V0KHN0YWNrRnJhbWUuaW5zdHJ1Y3Rpb25Qb2ludGVyUmVmZXJlbmNlLCAwKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhY2tGcmFtZS5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVmcmVzaCBicmVha3BvaW50cyB2aWV3XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VCcmVha3BvaW50cyhicEV2ZW50ID0+IHtcblx0XHRcdGlmIChicEV2ZW50ICYmIHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucykge1xuXHRcdFx0XHQvLyBkcmF3IHZpZXdhYmxlIEJQXG5cdFx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRcdGJwRXZlbnQuYWRkZWQ/LmZvckVhY2goKGJwKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGJwIGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SW5kZXhGcm9tUmVmZXJlbmNlQW5kT2Zmc2V0KGJwLmluc3RydWN0aW9uUmVmZXJlbmNlLCBicC5vZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5yb3coaW5kZXgpLmlzQnJlYWtwb2ludFNldCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEucm93KGluZGV4KS5pc0JyZWFrcG9pbnRFbmFibGVkID0gYnAuZW5hYmxlZDtcblx0XHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRicEV2ZW50LnJlbW92ZWQ/LmZvckVhY2goKGJwKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGJwIGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SW5kZXhGcm9tUmVmZXJlbmNlQW5kT2Zmc2V0KGJwLmluc3RydWN0aW9uUmVmZXJlbmNlLCBicC5vZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5yb3coaW5kZXgpLmlzQnJlYWtwb2ludFNldCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGJwRXZlbnQuY2hhbmdlZD8uZm9yRWFjaCgoYnApID0+IHtcblx0XHRcdFx0XHRpZiAoYnAgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJbmRleEZyb21SZWZlcmVuY2VBbmRPZmZzZXQoYnAuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIGJwLm9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zIS5yb3coaW5kZXgpLmlzQnJlYWtwb2ludEVuYWJsZWQgIT09IGJwLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLnJvdyhpbmRleCkuaXNCcmVha3BvaW50RW5hYmxlZCA9IGJwLmVuYWJsZWQ7XG5cdFx0XHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGdldCBhbiB1cGRhdGVkIGxpc3Qgc28gdGhhdCBpdGVtcyBiZXlvbmQgdGhlIGN1cnJlbnQgcmFuZ2Ugd291bGQgcmVuZGVyIHdoZW4gcmVhY2hlZC5cblx0XHRcdFx0dGhpcy5faW5zdHJ1Y3Rpb25CcExpc3QgPSB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cblx0XHRcdFx0Ly8gYnJlYWtwb2ludHMgcmVzdG9yZWQgZnJvbSBhIHByZXZpb3VzIHNlc3Npb24gY2FuIGJlIGJhc2VkIG9uIG1lbW9yeVxuXHRcdFx0XHQvLyByZWZlcmVuY2VzIHRoYXQgbWF5IG5vIGxvbmdlciBleGlzdCBpbiB0aGUgY3VycmVudCBzZXNzaW9uLiBSZXF1ZXN0XG5cdFx0XHRcdC8vIHRob3NlIGluc3RydWN0aW9ucyB0byBiZSBsb2FkZWQgc28gdGhlIEJQIGNhbiBiZSBkaXNwbGF5ZWQuXG5cdFx0XHRcdGZvciAoY29uc3QgYnAgb2YgdGhpcy5faW5zdHJ1Y3Rpb25CcExpc3QpIHtcblx0XHRcdFx0XHR0aGlzLnByaW1lTWVtb3J5UmVmZXJlbmNlKGJwLmluc3RydWN0aW9uUmVmZXJlbmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGFja0ZyYW1lLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlYnVnU2VydmljZS5vbkRpZENoYW5nZVN0YXRlKGUgPT4ge1xuXHRcdFx0aWYgKChlID09PSBTdGF0ZS5SdW5uaW5nIHx8IGUgPT09IFN0YXRlLlN0b3BwZWQpICYmXG5cdFx0XHRcdCh0aGlzLl9wcmV2aW91c0RlYnVnZ2luZ1N0YXRlICE9PSBTdGF0ZS5SdW5uaW5nICYmIHRoaXMuX3ByZXZpb3VzRGVidWdnaW5nU3RhdGUgIT09IFN0YXRlLlN0b3BwZWQpKSB7XG5cdFx0XHRcdC8vIEp1c3Qgc3RhcnRlZCBkZWJ1Z2dpbmcsIGNsZWFyIHRoZSB2aWV3XG5cdFx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fZW5hYmxlU291cmNlQ29kZVJlbmRlciA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmRpc2Fzc2VtYmx5Vmlldy5zaG93U291cmNlQ29kZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJldmlvdXNEZWJ1Z2dpbmdTdGF0ZSA9IGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YWNrRnJhbWUuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucz8ubGF5b3V0KGRpbWVuc2lvbi5oZWlnaHQpO1xuXHR9XG5cblx0YXN5bmMgZ29Ub0luc3RydWN0aW9uQW5kT2Zmc2V0KGluc3RydWN0aW9uUmVmZXJlbmNlOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBmb2N1cz86IGJvb2xlYW4pIHtcblx0XHRsZXQgYWRkciA9IHRoaXMuX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcy5nZXQoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHRcdGlmIChhZGRyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMubG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhpbnN0cnVjdGlvblJlZmVyZW5jZSwgMCwgLURpc2Fzc2VtYmx5Vmlldy5OVU1fSU5TVFJVQ1RJT05TX1RPX0xPQUQsIERpc2Fzc2VtYmx5Vmlldy5OVU1fSU5TVFJVQ1RJT05TX1RPX0xPQUQgKiAyKTtcblx0XHRcdGFkZHIgPSB0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3MuZ2V0KGluc3RydWN0aW9uUmVmZXJlbmNlKTtcblx0XHR9XG5cblx0XHRpZiAoYWRkcikge1xuXHRcdFx0dGhpcy5nb1RvQWRkcmVzcyhhZGRyICsgQmlnSW50KG9mZnNldCksIGZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHQvKiogR2V0cyB0aGUgYWRkcmVzcyBhc3NvY2lhdGVkIHdpdGggdGhlIGluc3RydWN0aW9uIHJlZmVyZW5jZS4gKi9cblx0Z2V0UmVmZXJlbmNlQWRkcmVzcyhpbnN0cnVjdGlvblJlZmVyZW5jZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcy5nZXQoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdvIHRvIHRoZSBhZGRyZXNzIHByb3ZpZGVkLiBJZiBubyBhZGRyZXNzIGlzIHByb3ZpZGVkLCByZXZlYWwgdGhlIGFkZHJlc3Mgb2YgdGhlIGN1cnJlbnRseSBmb2N1c2VkIHN0YWNrIGZyYW1lLiBSZXR1cm5zIGZhbHNlIGlmIHRoYXQgYWRkcmVzcyBpcyBub3QgYXZhaWxhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBnb1RvQWRkcmVzcyhhZGRyZXNzOiBiaWdpbnQsIGZvY3VzPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCFhZGRyZXNzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEluZGV4RnJvbUFkZHJlc3MoYWRkcmVzcyk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5yZXZlYWwoaW5kZXgpO1xuXG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0dGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLmRvbUZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2Nyb2xsVXBfTG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhpbnN0cnVjdGlvbkNvdW50OiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gdGhpcy5fZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zPy5yb3coMCk7XG5cdFx0aWYgKGZpcnN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKFxuXHRcdFx0XHRmaXJzdC5pbnN0cnVjdGlvblJlZmVyZW5jZSxcblx0XHRcdFx0Zmlyc3QuaW5zdHJ1Y3Rpb25SZWZlcmVuY2VPZmZzZXQsXG5cdFx0XHRcdGZpcnN0Lmluc3RydWN0aW9uT2Zmc2V0IC0gaW5zdHJ1Y3Rpb25Db3VudCxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25Db3VudCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjcm9sbERvd25fTG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhpbnN0cnVjdGlvbkNvdW50OiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IGxhc3QgPSB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/LnJvdyh0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/Lmxlbmd0aCAtIDEpO1xuXHRcdGlmIChsYXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2FkRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zKFxuXHRcdFx0XHRsYXN0Lmluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdFx0XHRsYXN0Lmluc3RydWN0aW9uUmVmZXJlbmNlT2Zmc2V0LFxuXHRcdFx0XHRsYXN0Lmluc3RydWN0aW9uT2Zmc2V0ICsgMSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25Db3VudCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgbWVtb3J5IHJlZmVyZW5jZSBhZGRyZXNzLiBXZSBkb24ndCBqdXN0IGxvYWREaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnNcblx0ICogZm9yIHRoaXMsIHNpbmNlIHdlIGNhbid0IHJlYWxseSBkZWFsIHdpdGggZGlzY29udGlndW91cyByYW5nZXMgKHdlIGNhbid0XG5cdCAqIGRldGVjdCBfaWZfIGEgcmFuZ2UgaXMgZGlzY29udGlndW91cyBzaW5jZSB3ZSBkb24ndCBrbm93IGhvdyBtdWNoIG1lbW9yeVxuXHQgKiBjb21lcyBiZXR3ZWVuIGluc3RydWN0aW9ucy4pXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHByaW1lTWVtb3J5UmVmZXJlbmNlKGluc3RydWN0aW9uUmVmZXJlbmNlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmhhcyhpbnN0cnVjdGlvblJlZmVyZW5jZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHMgPSBhd2FpdCB0aGlzLmRlYnVnU2Vzc2lvbj8uZGlzYXNzZW1ibGUoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIDAsIDAsIDEpO1xuXHRcdGlmIChzICYmIHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLnNldChpbnN0cnVjdGlvblJlZmVyZW5jZSwgQmlnSW50KHNbMF0uYWRkcmVzcykpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqIExvYWRzIGRpc2FzZW1ibGVkIGluc3RydWN0aW9ucy4gUmV0dXJucyB0aGUgbnVtYmVyIG9mIGluc3RydWN0aW9ucyB0aGF0IHdlcmUgbG9hZGVkLiAqL1xuXHRwcml2YXRlIGFzeW5jIGxvYWREaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMoaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGluc3RydWN0aW9uT2Zmc2V0OiBudW1iZXIsIGluc3RydWN0aW9uQ291bnQ6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXNzaW9uO1xuXHRcdGNvbnN0IHJlc3VsdEVudHJpZXMgPSBhd2FpdCBzZXNzaW9uPy5kaXNhc3NlbWJsZShpbnN0cnVjdGlvblJlZmVyZW5jZSwgb2Zmc2V0LCBpbnN0cnVjdGlvbk9mZnNldCwgaW5zdHJ1Y3Rpb25Db3VudCk7XG5cblx0XHQvLyBFbnN1cmUgd2UgYWx3YXlzIGxvYWQgdGhlIGJhc2VsaW5lIGluc3RydWN0aW9ucyBzbyB3ZSBrbm93IHdoYXQgYWRkcmVzcyB0aGUgaW5zdHJ1Y3Rpb25SZWZlcmVuY2UgcmVmZXJzIHRvLlxuXHRcdGlmICghdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmhhcyhpbnN0cnVjdGlvblJlZmVyZW5jZSkgJiYgaW5zdHJ1Y3Rpb25PZmZzZXQgIT09IDApIHtcblx0XHRcdGF3YWl0IHRoaXMubG9hZERpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyhpbnN0cnVjdGlvblJlZmVyZW5jZSwgMCwgMCwgRGlzYXNzZW1ibHlWaWV3Lk5VTV9JTlNUUlVDVElPTlNfVE9fTE9BRCk7XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb24gJiYgcmVzdWx0RW50cmllcyAmJiB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IG5ld0VudHJpZXM6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5W10gPSBbXTtcblxuXHRcdFx0bGV0IGxhc3RMb2NhdGlvbjogRGVidWdQcm90b2NvbC5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbGFzdExpbmU6IElSYW5nZSB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0RW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IHJlc3VsdEVudHJpZXNbaV07XG5cdFx0XHRcdGNvbnN0IHRoaXNJbnN0cnVjdGlvbk9mZnNldCA9IGluc3RydWN0aW9uT2Zmc2V0ICsgaTtcblxuXHRcdFx0XHQvLyBGb3J3YXJkIGZpbGwgdGhlIG1pc3NpbmcgbG9jYXRpb24gYXMgZGV0YWlsZWQgaW4gdGhlIERBUCBzcGVjLlxuXHRcdFx0XHRpZiAoaW5zdHJ1Y3Rpb24ubG9jYXRpb24pIHtcblx0XHRcdFx0XHRsYXN0TG9jYXRpb24gPSBpbnN0cnVjdGlvbi5sb2NhdGlvbjtcblx0XHRcdFx0XHRsYXN0TGluZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpbnN0cnVjdGlvbi5saW5lKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudExpbmU6IElSYW5nZSA9IHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogaW5zdHJ1Y3Rpb24ubGluZSxcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBpbnN0cnVjdGlvbi5jb2x1bW4gPz8gMCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGluc3RydWN0aW9uLmVuZExpbmUgPz8gaW5zdHJ1Y3Rpb24ubGluZSxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogaW5zdHJ1Y3Rpb24uZW5kQ29sdW1uID8/IDAsXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdC8vIEFkZCBsb2NhdGlvbiBvbmx5IHRvIHRoZSBmaXJzdCB1bmlxdWUgcmFuZ2UuIFRoaXMgd2lsbCBnaXZlIHRoZSBhcHBlYXJhbmNlIG9mIGdyb3VwaW5nIG9mIGluc3RydWN0aW9ucy5cblx0XHRcdFx0XHRpZiAoIVJhbmdlLmVxdWFsc1JhbmdlKGN1cnJlbnRMaW5lLCBsYXN0TGluZSA/PyBudWxsKSkge1xuXHRcdFx0XHRcdFx0bGFzdExpbmUgPSBjdXJyZW50TGluZTtcblx0XHRcdFx0XHRcdGluc3RydWN0aW9uLmxvY2F0aW9uID0gbGFzdExvY2F0aW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBhZGRyZXNzOiBiaWdpbnQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YWRkcmVzcyA9IEJpZ0ludChpbnN0cnVjdGlvbi5hZGRyZXNzKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgQ291bGQgbm90IHBhcnNlIGRpc2Fzc2VtYmx5IGFkZHJlc3MgJHtpbnN0cnVjdGlvbi5hZGRyZXNzfSAoaW4gJHtKU09OLnN0cmluZ2lmeShpbnN0cnVjdGlvbil9KWApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFkZHJlc3MgPT09IC0xbikge1xuXHRcdFx0XHRcdC8vIElnbm9yZSBpbnZhbGlkIGluc3RydWN0aW9ucyByZXR1cm5lZCBieSB0aGUgYWRhcHRlci5cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVudHJ5OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSA9IHtcblx0XHRcdFx0XHRhbGxvd0JyZWFrcG9pbnQ6IHRydWUsXG5cdFx0XHRcdFx0aXNCcmVha3BvaW50U2V0OiBmYWxzZSxcblx0XHRcdFx0XHRpc0JyZWFrcG9pbnRFbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRpbnN0cnVjdGlvblJlZmVyZW5jZSxcblx0XHRcdFx0XHRpbnN0cnVjdGlvblJlZmVyZW5jZU9mZnNldDogb2Zmc2V0LFxuXHRcdFx0XHRcdGluc3RydWN0aW9uT2Zmc2V0OiB0aGlzSW5zdHJ1Y3Rpb25PZmZzZXQsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb24sXG5cdFx0XHRcdFx0YWRkcmVzcyxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRuZXdFbnRyaWVzLnB1c2goZW50cnkpO1xuXG5cdFx0XHRcdC8vIGlmIHdlIGp1c3QgbG9hZGVkIHRoZSBmaXJzdCBpbnN0cnVjdGlvbiBmb3IgdGhpcyByZWZlcmVuY2UsIG1hcmsgaXRzIGFkZHJlc3MuXG5cdFx0XHRcdGlmIChvZmZzZXQgPT09IDAgJiYgdGhpc0luc3RydWN0aW9uT2Zmc2V0ID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLnNldChpbnN0cnVjdGlvblJlZmVyZW5jZSwgYWRkcmVzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld0VudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZWZCYXNlQWRkcmVzcyA9IHRoaXMuX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcy5nZXQoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHRcdFx0Y29uc3QgYnBzID0gdGhpcy5faW5zdHJ1Y3Rpb25CcExpc3QubWFwKHAgPT4ge1xuXHRcdFx0XHRjb25zdCBiYXNlID0gdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmdldChwLmluc3RydWN0aW9uUmVmZXJlbmNlKTtcblx0XHRcdFx0aWYgKCFiYXNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHAuZW5hYmxlZCxcblx0XHRcdFx0XHRhZGRyZXNzOiBiYXNlICsgQmlnSW50KHAub2Zmc2V0IHx8IDApLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChyZWZCYXNlQWRkcmVzcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgbmV3RW50cmllcykge1xuXHRcdFx0XHRcdGNvbnN0IGJwID0gYnBzLmZpbmQocCA9PiBwPy5hZGRyZXNzID09PSBlbnRyeS5hZGRyZXNzKTtcblx0XHRcdFx0XHRpZiAoYnApIHtcblx0XHRcdFx0XHRcdGVudHJ5LmlzQnJlYWtwb2ludFNldCA9IHRydWU7XG5cdFx0XHRcdFx0XHRlbnRyeS5pc0JyZWFrcG9pbnRFbmFibGVkID0gYnAuZW5hYmxlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGEgPSB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM7XG5cdFx0XHRpZiAoZGEubGVuZ3RoID09PSAxICYmIHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucy5yb3coMCkgPT09IGRpc2Fzc2VtYmx5Tm90QXZhaWxhYmxlKSB7XG5cdFx0XHRcdGRhLnNwbGljZSgwLCAxKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlyc3RBZGRyID0gbmV3RW50cmllc1swXS5hZGRyZXNzO1xuXHRcdFx0Y29uc3QgbGFzdEFkZHIgPSBuZXdFbnRyaWVzW25ld0VudHJpZXMubGVuZ3RoIC0gMV0uYWRkcmVzcztcblxuXHRcdFx0Y29uc3Qgc3RhcnROID0gYmluYXJ5U2VhcmNoMihkYS5sZW5ndGgsIGkgPT4gTnVtYmVyKGRhLnJvdyhpKS5hZGRyZXNzIC0gZmlyc3RBZGRyKSk7XG5cdFx0XHRjb25zdCBzdGFydCA9IHN0YXJ0TiA8IDAgPyB+c3RhcnROIDogc3RhcnROO1xuXHRcdFx0Y29uc3QgZW5kTiA9IGJpbmFyeVNlYXJjaDIoZGEubGVuZ3RoLCBpID0+IE51bWJlcihkYS5yb3coaSkuYWRkcmVzcyAtIGxhc3RBZGRyKSk7XG5cdFx0XHRjb25zdCBlbmQgPSBlbmROIDwgMCA/IH5lbmROIDogZW5kTiArIDE7XG5cdFx0XHRjb25zdCB0b0RlbGV0ZSA9IGVuZCAtIHN0YXJ0O1xuXG5cdFx0XHQvLyBHbyB0aHJvdWdoIGV2ZXJ5dGhpbmcgd2UncmUgYWJvdXQgdG8gYWRkLCBhbmQgb25seSBzaG93IHRoZSBzb3VyY2Vcblx0XHRcdC8vIGxvY2F0aW9uIGlmIGl0J3MgZGlmZmVyZW50IGZyb20gdGhlIHByZXZpb3VzIG9uZSwgXCJncm91cGluZ1wiIGluc3RydWN0aW9ucyBieSBsaW5lXG5cdFx0XHRsZXQgbGFzdExvY2F0ZWQ6IHVuZGVmaW5lZCB8IERlYnVnUHJvdG9jb2wuRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb247XG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnQgLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCB7IGluc3RydWN0aW9uIH0gPSBkYS5yb3coaSk7XG5cdFx0XHRcdGlmIChpbnN0cnVjdGlvbi5sb2NhdGlvbiAmJiBpbnN0cnVjdGlvbi5saW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRsYXN0TG9jYXRlZCA9IGluc3RydWN0aW9uO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNob3VsZFNob3dMb2NhdGlvbiA9IChpbnN0cnVjdGlvbjogRGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZWRJbnN0cnVjdGlvbikgPT5cblx0XHRcdFx0aW5zdHJ1Y3Rpb24ubGluZSAhPT0gdW5kZWZpbmVkICYmIGluc3RydWN0aW9uLmxvY2F0aW9uICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0KCFsYXN0TG9jYXRlZCB8fCAhc291cmNlc0VxdWFsKGluc3RydWN0aW9uLmxvY2F0aW9uLCBsYXN0TG9jYXRlZC5sb2NhdGlvbikgfHwgaW5zdHJ1Y3Rpb24ubGluZSAhPT0gbGFzdExvY2F0ZWQubGluZSk7XG5cblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgbmV3RW50cmllcykge1xuXHRcdFx0XHRpZiAoc2hvdWxkU2hvd0xvY2F0aW9uKGVudHJ5Lmluc3RydWN0aW9uKSkge1xuXHRcdFx0XHRcdGVudHJ5LnNob3dTb3VyY2VMb2NhdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0bGFzdExvY2F0ZWQgPSBlbnRyeS5pbnN0cnVjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRkYS5zcGxpY2Uoc3RhcnQsIHRvRGVsZXRlLCBuZXdFbnRyaWVzKTtcblxuXHRcdFx0cmV0dXJuIG5ld0VudHJpZXMubGVuZ3RoIC0gdG9EZWxldGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4RnJvbVJlZmVyZW5jZUFuZE9mZnNldChpbnN0cnVjdGlvblJlZmVyZW5jZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgYWRkciA9IHRoaXMuX3JlZmVyZW5jZVRvTWVtb3J5QWRkcmVzcy5nZXQoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpO1xuXHRcdGlmIChhZGRyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRJbmRleEZyb21BZGRyZXNzKGFkZHIgKyBCaWdJbnQob2Zmc2V0KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4RnJvbUFkZHJlc3MoYWRkcmVzczogYmlnaW50KTogbnVtYmVyIHtcblx0XHRjb25zdCBkaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMgPSB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM7XG5cdFx0aWYgKGRpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyAmJiBkaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGJpbmFyeVNlYXJjaDIoZGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25zLmxlbmd0aCwgaW5kZXggPT4ge1xuXHRcdFx0XHRjb25zdCByb3cgPSBkaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMucm93KGluZGV4KTtcblx0XHRcdFx0cmV0dXJuIE51bWJlcihyb3cuYWRkcmVzcyAtIGFkZHJlc3MpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgdGFibGUgYW5kIHJlbG9hZCBpbnN0cnVjdGlvbnMgbmVhciB0aGUgdGFyZ2V0IGFkZHJlc3Ncblx0ICovXG5cdHByaXZhdGUgcmVsb2FkRGlzYXNzZW1ibHkoaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpIHtcblx0XHRpZiAoIXRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvYWRpbmdMb2NrID0gdHJ1ZTsgLy8gc3RvcCBzY3JvbGxpbmcgZHVyaW5nIHRoZSBsb2FkLlxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbnN0cnVjdGlvbkJwTGlzdCA9IHRoaXMuX2RlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEluc3RydWN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHR0aGlzLmxvYWREaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIG9mZnNldCwgLURpc2Fzc2VtYmx5Vmlldy5OVU1fSU5TVFJVQ1RJT05TX1RPX0xPQUQgKiA0LCBEaXNhc3NlbWJseVZpZXcuTlVNX0lOU1RSVUNUSU9OU19UT19MT0FEICogOCkudGhlbigoKSA9PiB7XG5cdFx0XHQvLyBvbiBsb2FkLCBzZXQgdGhlIHRhcmdldCBpbnN0cnVjdGlvbiBhcyB0aGUgY3VycmVudCBpbnN0cnVjdGlvblJlZmVyZW5jZS5cblx0XHRcdGlmICh0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bGV0IHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHJlZkJhc2VBZGRyZXNzID0gdGhpcy5fcmVmZXJlbmNlVG9NZW1vcnlBZGRyZXNzLmdldChpbnN0cnVjdGlvblJlZmVyZW5jZSk7XG5cdFx0XHRcdGlmIChyZWZCYXNlQWRkcmVzcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGEgPSB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhO1xuXHRcdFx0XHRcdHRhcmdldEluZGV4ID0gYmluYXJ5U2VhcmNoMihkYS5sZW5ndGgsIGkgPT4gTnVtYmVyKGRhLnJvdyhpKS5hZGRyZXNzIC0gcmVmQmFzZUFkZHJlc3MpKTtcblx0XHRcdFx0XHRpZiAodGFyZ2V0SW5kZXggPCAwKSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IH50YXJnZXRJbmRleDsgLy8gc2hvdWxkbid0IGhhcHBlbiwgYnV0IGZhaWwgZ3JhY2VmdWxseSBpZiBpdCBkb2VzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgZGlkbid0IGZpbmQgdGhlIGluc3RydWN0b25SZWZlcmVuY2UsIHNldCB0aGUgdGFyZ2V0IGluc3RydWN0aW9uIGluIHRoZSBtaWRkbGUgb2YgdGhlIHBhZ2UuXG5cdFx0XHRcdGlmICh0YXJnZXRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXggPSBNYXRoLmZsb29yKHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEubGVuZ3RoIC8gMik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLnJldmVhbCh0YXJnZXRJbmRleCwgMC41KTtcblxuXHRcdFx0XHQvLyBBbHdheXMgZm9jdXMgdGhlIHRhcmdldCBhZGRyZXNzIG9uIHJlbG9hZCwgb3IgYXJyb3cga2V5IG5hdmlnYXRpb24gd291bGQgbG9vayB0ZXJyaWJsZVxuXHRcdFx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMhLmRvbUZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmxlZEluc3RydWN0aW9ucyEuc2V0Rm9jdXMoW3RhcmdldEluZGV4XSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2FkaW5nTG9jayA9IGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpIHtcblx0XHR0aGlzLl9yZWZlcmVuY2VUb01lbW9yeUFkZHJlc3MuY2xlYXIoKTtcblx0XHR0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnM/LnNwbGljZSgwLCB0aGlzLl9kaXNhc3NlbWJsZWRJbnN0cnVjdGlvbnMubGVuZ3RoLCBbZGlzYXNzZW1ibHlOb3RBdmFpbGFibGVdKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJVGFibGVDb250ZXh0TWVudUV2ZW50PElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5Pik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZS5lbGVtZW50XG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElCcmVha3BvaW50Q29sdW1uVGVtcGxhdGVEYXRhIHtcblx0Y3VycmVudEVsZW1lbnQ6IHsgZWxlbWVudD86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IH07XG5cdGljb246IEhUTUxFbGVtZW50O1xuXHRkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcbn1cblxuY2xhc3MgQnJlYWtwb2ludFJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnksIElCcmVha3BvaW50Q29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2JyZWFrcG9pbnQnO1xuXG5cdHRlbXBsYXRlSWQ6IHN0cmluZyA9IEJyZWFrcG9pbnRSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9icmVha3BvaW50SWNvbiA9ICdjb2RpY29uLScgKyBpY29ucy5icmVha3BvaW50LnJlZ3VsYXIuaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyZWFrcG9pbnREaXNhYmxlZEljb24gPSAnY29kaWNvbi0nICsgaWNvbnMuYnJlYWtwb2ludC5kaXNhYmxlZC5pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYnJlYWtwb2ludEhpbnRJY29uID0gJ2NvZGljb24tJyArIGljb25zLmRlYnVnQnJlYWtwb2ludEhpbnQuaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU3RhY2tmcmFtZSA9ICdjb2RpY29uLScgKyBpY29ucy5kZWJ1Z1N0YWNrZnJhbWUuaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU3RhY2tmcmFtZUZvY3VzZWQgPSAnY29kaWNvbi0nICsgaWNvbnMuZGVidWdTdGFja2ZyYW1lRm9jdXNlZC5pZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaXNhc3NlbWJseVZpZXc6IERpc2Fzc2VtYmx5Vmlldyxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUJyZWFrcG9pbnRDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdC8vIGFsaWduIGZyb20gdGhlIGJvdHRvbSBzbyB0aGF0IGl0IGxpbmVzIHVwIHdpdGggaW5zdHJ1Y3Rpb24gd2hlbiBzb3VyY2UgY29kZSBpcyBwcmVzZW50LlxuXHRcdGNvbnRhaW5lci5zdHlsZS5hbGlnblNlbGYgPSAnZmxleC1lbmQnO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5jb2RpY29uJykpO1xuXHRcdGljb24uc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRpY29uLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0XHRpY29uLnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7XG5cdFx0aWNvbi5zdHlsZS5oZWlnaHQgPSB0aGlzLl9kaXNhc3NlbWJseVZpZXcuZm9udEluZm8ubGluZUhlaWdodCArICdweCc7XG5cblx0XHRjb25zdCBjdXJyZW50RWxlbWVudDogeyBlbGVtZW50PzogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkgfSA9IHsgZWxlbWVudDogdW5kZWZpbmVkIH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IFtcblx0XHRcdHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5vbkRpZENoYW5nZVN0YWNrRnJhbWUoKCkgPT4gdGhpcy5yZXJlbmRlckRlYnVnU3RhY2tmcmFtZShpY29uLCBjdXJyZW50RWxlbWVudC5lbGVtZW50KSksXG5cdFx0XHRhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdtb3VzZW92ZXInLCAoKSA9PiB7XG5cdFx0XHRcdGlmIChjdXJyZW50RWxlbWVudC5lbGVtZW50Py5hbGxvd0JyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQodGhpcy5fYnJlYWtwb2ludEhpbnRJY29uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdtb3VzZW91dCcsICgpID0+IHtcblx0XHRcdFx0aWYgKGN1cnJlbnRFbGVtZW50LmVsZW1lbnQ/LmFsbG93QnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdGljb24uY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9icmVha3BvaW50SGludEljb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHRpZiAoY3VycmVudEVsZW1lbnQuZWxlbWVudD8uYWxsb3dCcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0Ly8gY2xpY2sgc2hvdyBoaW50IHdoaWxlIHdhaXRpbmcgZm9yIEJQIHRvIHJlc29sdmUuXG5cdFx0XHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKHRoaXMuX2JyZWFrcG9pbnRIaW50SWNvbik7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gY3VycmVudEVsZW1lbnQuZWxlbWVudC5pbnN0cnVjdGlvblJlZmVyZW5jZTtcblx0XHRcdFx0XHRjb25zdCBhZGRyZXNzID0gY3VycmVudEVsZW1lbnQuZWxlbWVudC5hZGRyZXNzO1xuXHRcdFx0XHRcdGNvbnN0IG9mZnNldCA9IE51bWJlcihhZGRyZXNzIC0gdGhpcy5fZGlzYXNzZW1ibHlWaWV3LmdldFJlZmVyZW5jZUFkZHJlc3MocmVmZXJlbmNlKSEpO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50RWxlbWVudC5lbGVtZW50LmlzQnJlYWtwb2ludFNldCkge1xuXHRcdFx0XHRcdFx0Ly8gSWRlbnRpZnkgdGhlIGJyZWFrcG9pbnQgYnkgaXRzIHJlc29sdmVkIG1lbW9yeSBhZGRyZXNzOlxuXHRcdFx0XHRcdFx0Ly8gdGhlIGRlYnVnIGFkYXB0ZXIgbWF5IGhhbmQgb3V0IGEgbmV3IGBpbnN0cnVjdGlvblJlZmVyZW5jZWBcblx0XHRcdFx0XHRcdC8vIGZvciB0aGUgc2FtZSBsb2NhdGlvbiBhZnRlciBzeW1ib2wgcmVsb2FkcyAvIGNlcnRhaW4gc3RlcHMsXG5cdFx0XHRcdFx0XHQvLyBzbyBhIHJlZmVyZW5jZStvZmZzZXQgbG9va3VwIHdvdWxkIG90aGVyd2lzZSBmYWlsIHRvIHJlbW92ZVxuXHRcdFx0XHRcdFx0Ly8gdGhlIGJyZWFrcG9pbnQgKG1pY3Jvc29mdC92c2NvZGUjMjg5Njc4KS5cblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnU2VydmljZS5yZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKHJlZmVyZW5jZSwgb2Zmc2V0LCBhZGRyZXNzKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRFbGVtZW50LmVsZW1lbnQuYWxsb3dCcmVha3BvaW50ICYmICFjdXJyZW50RWxlbWVudC5lbGVtZW50LmlzQnJlYWtwb2ludFNldCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlLmFkZEluc3RydWN0aW9uQnJlYWtwb2ludCh7IGluc3RydWN0aW9uUmVmZXJlbmNlOiByZWZlcmVuY2UsIG9mZnNldCwgYWRkcmVzcywgY2FuUGVyc2lzdDogZmFsc2UgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdF07XG5cblx0XHRyZXR1cm4geyBjdXJyZW50RWxlbWVudCwgaWNvbiwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUJyZWFrcG9pbnRDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQuZWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0dGhpcy5yZXJlbmRlckRlYnVnU3RhY2tmcmFtZSh0ZW1wbGF0ZURhdGEuaWNvbiwgZWxlbWVudCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQnJlYWtwb2ludENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMgPSBbXTtcblx0fVxuXG5cdHByaXZhdGUgcmVyZW5kZXJEZWJ1Z1N0YWNrZnJhbWUoaWNvbjogSFRNTEVsZW1lbnQsIGVsZW1lbnQ/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSkge1xuXHRcdGlmIChlbGVtZW50Py5hZGRyZXNzID09PSB0aGlzLl9kaXNhc3NlbWJseVZpZXcuZm9jdXNlZEN1cnJlbnRJbnN0cnVjdGlvbkFkZHJlc3MpIHtcblx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCh0aGlzLl9kZWJ1Z1N0YWNrZnJhbWUpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudD8uYWRkcmVzcyA9PT0gdGhpcy5fZGlzYXNzZW1ibHlWaWV3LmZvY3VzZWRJbnN0cnVjdGlvbkFkZHJlc3MpIHtcblx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCh0aGlzLl9kZWJ1Z1N0YWNrZnJhbWVGb2N1c2VkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2RlYnVnU3RhY2tmcmFtZSk7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fZGVidWdTdGFja2ZyYW1lRm9jdXNlZCk7XG5cdFx0fVxuXG5cdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2JyZWFrcG9pbnRIaW50SWNvbik7XG5cblx0XHRpZiAoZWxlbWVudD8uaXNCcmVha3BvaW50U2V0KSB7XG5cdFx0XHRpZiAoZWxlbWVudC5pc0JyZWFrcG9pbnRFbmFibGVkKSB7XG5cdFx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCh0aGlzLl9icmVha3BvaW50SWNvbik7XG5cdFx0XHRcdGljb24uY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9icmVha3BvaW50RGlzYWJsZWRJY29uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGljb24uY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9icmVha3BvaW50SWNvbik7XG5cdFx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCh0aGlzLl9icmVha3BvaW50RGlzYWJsZWRJY29uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2JyZWFrcG9pbnRJY29uKTtcblx0XHRcdGljb24uY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9icmVha3BvaW50RGlzYWJsZWRJY29uKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElJbnN0cnVjdGlvbkNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdGN1cnJlbnRFbGVtZW50OiB7IGVsZW1lbnQ/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSB9O1xuXHQvLyBUT0RPOiBob3ZlciB3aWRnZXQ/XG5cdGluc3RydWN0aW9uOiBIVE1MRWxlbWVudDtcblx0c291cmNlY29kZTogSFRNTEVsZW1lbnQ7XG5cdC8vIGRpc3Bvc2VkIHdoZW4gY2VsbCBpcyBjbG9zZWQuXG5cdGNlbGxEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZVtdO1xuXHQvLyBkaXNwb3NlZCB3aGVuIHRlbXBsYXRlIGlzIGNsb3NlZC5cblx0ZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107XG59XG5cbmNsYXNzIEluc3RydWN0aW9uUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnksIElJbnN0cnVjdGlvbkNvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdpbnN0cnVjdGlvbic7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSU5TVFJVQ1RJT05fQUREUl9NSU5fTEVOR1RIID0gMjU7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElOU1RSVUNUSU9OX0JZVEVTX01JTl9MRU5HVEggPSAzMDtcblxuXHR0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBJbnN0cnVjdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgX3RvcFN0YWNrRnJhbWVDb2xvcjogQ29sb3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZvY3VzZWRTdGFja0ZyYW1lQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc2Fzc2VtYmx5VmlldzogRGlzYXNzZW1ibHlWaWV3LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl90b3BTdGFja0ZyYW1lQ29sb3IgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKHRvcFN0YWNrRnJhbWVDb2xvcik7XG5cdFx0dGhpcy5fZm9jdXNlZFN0YWNrRnJhbWVDb2xvciA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoZm9jdXNlZFN0YWNrRnJhbWVDb2xvcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5fdG9wU3RhY2tGcmFtZUNvbG9yID0gZS5nZXRDb2xvcih0b3BTdGFja0ZyYW1lQ29sb3IpO1xuXHRcdFx0dGhpcy5fZm9jdXNlZFN0YWNrRnJhbWVDb2xvciA9IGUuZ2V0Q29sb3IoZm9jdXNlZFN0YWNrRnJhbWVDb2xvcik7XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElJbnN0cnVjdGlvbkNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3Qgc291cmNlY29kZSA9IGFwcGVuZChjb250YWluZXIsICQoJy5zb3VyY2Vjb2RlJykpO1xuXHRcdGNvbnN0IGluc3RydWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmluc3RydWN0aW9uJykpO1xuXHRcdHRoaXMuYXBwbHlGb250SW5mbyhzb3VyY2Vjb2RlKTtcblx0XHR0aGlzLmFwcGx5Rm9udEluZm8oaW5zdHJ1Y3Rpb24pO1xuXHRcdGNvbnN0IGN1cnJlbnRFbGVtZW50OiB7IGVsZW1lbnQ/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSB9ID0geyBlbGVtZW50OiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBjZWxsRGlzcG9zYWJsZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBbXG5cdFx0XHR0aGlzLl9kaXNhc3NlbWJseVZpZXcub25EaWRDaGFuZ2VTdGFja0ZyYW1lKCgpID0+IHRoaXMucmVyZW5kZXJCYWNrZ3JvdW5kKGluc3RydWN0aW9uLCBzb3VyY2Vjb2RlLCBjdXJyZW50RWxlbWVudC5lbGVtZW50KSksXG5cdFx0XHRhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihzb3VyY2Vjb2RlLCAnZGJsY2xpY2snLCAoKSA9PiB0aGlzLm9wZW5Tb3VyY2VDb2RlKGN1cnJlbnRFbGVtZW50LmVsZW1lbnQ/Lmluc3RydWN0aW9uKSksXG5cdFx0XTtcblxuXHRcdHJldHVybiB7IGN1cnJlbnRFbGVtZW50LCBpbnN0cnVjdGlvbiwgc291cmNlY29kZSwgY2VsbERpc3Bvc2FibGUsIGRpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElJbnN0cnVjdGlvbkNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRWxlbWVudElubmVyKGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJFbGVtZW50SW5uZXIoZWxlbWVudDogSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUluc3RydWN0aW9uQ29sdW1uVGVtcGxhdGVEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdGNvbnN0IGluc3RydWN0aW9uID0gZWxlbWVudC5pbnN0cnVjdGlvbjtcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlY29kZS5pbm5lclRleHQgPSAnJztcblx0XHRjb25zdCBzYiA9IG5ldyBTdHJpbmdCdWlsZGVyKDEwMDApO1xuXG5cdFx0aWYgKHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5pc1NvdXJjZUNvZGVSZW5kZXIgJiYgZWxlbWVudC5zaG93U291cmNlTG9jYXRpb24gJiYgaW5zdHJ1Y3Rpb24ubG9jYXRpb24/LnBhdGggJiYgaW5zdHJ1Y3Rpb24ubGluZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VVUkkgPSB0aGlzLmdldFVyaUZyb21Tb3VyY2UoaW5zdHJ1Y3Rpb24pO1xuXG5cdFx0XHRpZiAoc291cmNlVVJJKSB7XG5cdFx0XHRcdGxldCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZVNCID0gbmV3IFN0cmluZ0J1aWxkZXIoMTAwMDApO1xuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2Uoc291cmNlVVJJKTtcblx0XHRcdFx0aWYgKHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudC5lbGVtZW50ICE9PSBlbGVtZW50KSB7XG5cdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTsgLy8gYXZvaWQgYSBsZWFrIHdoZW4gZWxlbWVudCB3ZW50IHN0YWxlIGR1cmluZyBhc3luYywgIzE5MjgzMVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0ZXh0TW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNlbGxEaXNwb3NhYmxlLnB1c2gocmVmKTtcblxuXHRcdFx0XHQvLyB0ZW1wbGF0ZURhdGEgY291bGQgaGF2ZSBtb3ZlZCBvbiBkdXJpbmcgYXN5bmMuICBEb3VibGUgY2hlY2sgaWYgaXQgaXMgc3RpbGwgdGhlIHNhbWUgc291cmNlLlxuXHRcdFx0XHRpZiAodGV4dE1vZGVsICYmIHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudC5lbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdFx0bGV0IGxpbmVOdW1iZXIgPSBpbnN0cnVjdGlvbi5saW5lO1xuXG5cdFx0XHRcdFx0d2hpbGUgKGxpbmVOdW1iZXIgJiYgbGluZU51bWJlciA+PSAxICYmIGxpbmVOdW1iZXIgPD0gdGV4dE1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdHNvdXJjZVNCLmFwcGVuZFN0cmluZyhgICAke2xpbmVOdW1iZXJ9OiBgKTtcblx0XHRcdFx0XHRcdHNvdXJjZVNCLmFwcGVuZFN0cmluZyhsaW5lQ29udGVudCArICdcXG4nKTtcblxuXHRcdFx0XHRcdFx0aWYgKGluc3RydWN0aW9uLmVuZExpbmUgJiYgbGluZU51bWJlciA8IGluc3RydWN0aW9uLmVuZExpbmUpIHtcblx0XHRcdFx0XHRcdFx0bGluZU51bWJlcisrO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnNvdXJjZWNvZGUuaW5uZXJUZXh0ID0gc291cmNlU0IuYnVpbGQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBzcGFjZXNUb0FwcGVuZCA9IDEwO1xuXG5cdFx0aWYgKGluc3RydWN0aW9uLmFkZHJlc3MgIT09ICctMScpIHtcblx0XHRcdHNiLmFwcGVuZFN0cmluZyhpbnN0cnVjdGlvbi5hZGRyZXNzKTtcblx0XHRcdGlmIChpbnN0cnVjdGlvbi5hZGRyZXNzLmxlbmd0aCA8IEluc3RydWN0aW9uUmVuZGVyZXIuSU5TVFJVQ1RJT05fQUREUl9NSU5fTEVOR1RIKSB7XG5cdFx0XHRcdHNwYWNlc1RvQXBwZW5kID0gSW5zdHJ1Y3Rpb25SZW5kZXJlci5JTlNUUlVDVElPTl9BRERSX01JTl9MRU5HVEggLSBpbnN0cnVjdGlvbi5hZGRyZXNzLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3BhY2VzVG9BcHBlbmQ7IGkrKykge1xuXHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJyAnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5zdHJ1Y3Rpb24uaW5zdHJ1Y3Rpb25CeXRlcykge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKGluc3RydWN0aW9uLmluc3RydWN0aW9uQnl0ZXMpO1xuXHRcdFx0c3BhY2VzVG9BcHBlbmQgPSAxMDtcblx0XHRcdGlmIChpbnN0cnVjdGlvbi5pbnN0cnVjdGlvbkJ5dGVzLmxlbmd0aCA8IEluc3RydWN0aW9uUmVuZGVyZXIuSU5TVFJVQ1RJT05fQllURVNfTUlOX0xFTkdUSCkge1xuXHRcdFx0XHRzcGFjZXNUb0FwcGVuZCA9IEluc3RydWN0aW9uUmVuZGVyZXIuSU5TVFJVQ1RJT05fQllURVNfTUlOX0xFTkdUSCAtIGluc3RydWN0aW9uLmluc3RydWN0aW9uQnl0ZXMubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzcGFjZXNUb0FwcGVuZDsgaSsrKSB7XG5cdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnICcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNiLmFwcGVuZFN0cmluZyhpbnN0cnVjdGlvbi5pbnN0cnVjdGlvbik7XG5cdFx0dGVtcGxhdGVEYXRhLmluc3RydWN0aW9uLmlubmVyVGV4dCA9IHNiLmJ1aWxkKCk7XG5cblx0XHR0aGlzLnJlcmVuZGVyQmFja2dyb3VuZCh0ZW1wbGF0ZURhdGEuaW5zdHJ1Y3Rpb24sIHRlbXBsYXRlRGF0YS5zb3VyY2Vjb2RlLCBlbGVtZW50KTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElJbnN0cnVjdGlvbkNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGVtcGxhdGVEYXRhLmNlbGxEaXNwb3NhYmxlKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2VsbERpc3Bvc2FibGUgPSBbXTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElJbnN0cnVjdGlvbkNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMgPSBbXTtcblx0fVxuXG5cdHByaXZhdGUgcmVyZW5kZXJCYWNrZ3JvdW5kKGluc3RydWN0aW9uOiBIVE1MRWxlbWVudCwgc291cmNlQ29kZTogSFRNTEVsZW1lbnQsIGVsZW1lbnQ/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSkge1xuXHRcdGlmIChlbGVtZW50ICYmIHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5jdXJyZW50SW5zdHJ1Y3Rpb25BZGRyZXNzZXMuaW5jbHVkZXMoZWxlbWVudC5hZGRyZXNzKSkge1xuXHRcdFx0aW5zdHJ1Y3Rpb24uc3R5bGUuYmFja2dyb3VuZCA9IHRoaXMuX3RvcFN0YWNrRnJhbWVDb2xvcj8udG9TdHJpbmcoKSB8fCAndHJhbnNwYXJlbnQnO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudD8uYWRkcmVzcyA9PT0gdGhpcy5fZGlzYXNzZW1ibHlWaWV3LmZvY3VzZWRJbnN0cnVjdGlvbkFkZHJlc3MpIHtcblx0XHRcdGluc3RydWN0aW9uLnN0eWxlLmJhY2tncm91bmQgPSB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZUNvbG9yPy50b1N0cmluZygpIHx8ICd0cmFuc3BhcmVudCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc3RydWN0aW9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb3BlblNvdXJjZUNvZGUoaW5zdHJ1Y3Rpb246IERlYnVnUHJvdG9jb2wuRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb24gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoaW5zdHJ1Y3Rpb24pIHtcblx0XHRcdGNvbnN0IHNvdXJjZVVSSSA9IHRoaXMuZ2V0VXJpRnJvbVNvdXJjZShpbnN0cnVjdGlvbik7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBpbnN0cnVjdGlvbi5lbmRMaW5lID8ge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGluc3RydWN0aW9uLmxpbmUhLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBpbnN0cnVjdGlvbi5lbmRMaW5lLFxuXHRcdFx0XHRzdGFydENvbHVtbjogaW5zdHJ1Y3Rpb24uY29sdW1uIHx8IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogaW5zdHJ1Y3Rpb24uZW5kQ29sdW1uIHx8IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdFx0fSA6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBpbnN0cnVjdGlvbi5saW5lISxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogaW5zdHJ1Y3Rpb24ubGluZSEsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBpbnN0cnVjdGlvbi5jb2x1bW4gfHwgMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiBpbnN0cnVjdGlvbi5lbmRDb2x1bW4gfHwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBzb3VyY2VVUkksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZWRpdG9yT3BlbmVkRnJvbURpc2Fzc2VtYmx5RGVzY3JpcHRpb24nLCBcImZyb20gZGlzYXNzZW1ibHlcIiksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZSxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHNlbGVjdGlvbixcblx0XHRcdFx0XHRyZXZlYWxJZk9wZW5lZDogdHJ1ZSxcblx0XHRcdFx0XHRzZWxlY3Rpb25SZXZlYWxUeXBlOiBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCxcblx0XHRcdFx0XHRwaW5uZWQ6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFVyaUZyb21Tb3VyY2UoaW5zdHJ1Y3Rpb246IERlYnVnUHJvdG9jb2wuRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb24pOiBVUkkge1xuXHRcdC8vIFRyeSB0byByZXNvbHZlIHBhdGggYmVmb3JlIGNvbnN1bHRpbmcgdGhlIGRlYnVnU2Vzc2lvbi5cblx0XHRjb25zdCBwYXRoID0gaW5zdHJ1Y3Rpb24ubG9jYXRpb24hLnBhdGg7XG5cdFx0aWYgKHBhdGggJiYgaXNVcmlTdHJpbmcocGF0aCkpIHtcdC8vIHBhdGggbG9va3MgbGlrZSBhIHVyaVxuXHRcdFx0cmV0dXJuIHRoaXMudXJpU2VydmljZS5hc0Nhbm9uaWNhbFVyaShVUkkucGFyc2UocGF0aCkpO1xuXHRcdH1cblx0XHQvLyBhc3N1bWUgYSBmaWxlc3lzdGVtIHBhdGhcblx0XHRpZiAocGF0aCAmJiBpc0Fic29sdXRlKHBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51cmlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKFVSSS5maWxlKHBhdGgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0VXJpRnJvbVNvdXJjZShpbnN0cnVjdGlvbi5sb2NhdGlvbiEsIGluc3RydWN0aW9uLmxvY2F0aW9uIS5wYXRoLCB0aGlzLl9kaXNhc3NlbWJseVZpZXcuZGVidWdTZXNzaW9uIS5nZXRJZCgpLCB0aGlzLnVyaVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5Rm9udEluZm8oZWxlbWVudDogSFRNTEVsZW1lbnQpIHtcblx0XHRhcHBseUZvbnRJbmZvKGVsZW1lbnQsIHRoaXMuX2Rpc2Fzc2VtYmx5Vmlldy5mb250SW5mbyk7XG5cdFx0ZWxlbWVudC5zdHlsZS53aGl0ZVNwYWNlID0gJ3ByZSc7XG5cdH1cbn1cblxuY2xhc3MgQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnk+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2Rpc2Fzc2VtYmx5VmlldycsIFwiRGlzYXNzZW1ibHkgVmlld1wiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSk6IHN0cmluZyB8IG51bGwge1xuXHRcdGxldCBsYWJlbCA9ICcnO1xuXG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb24gPSBlbGVtZW50Lmluc3RydWN0aW9uO1xuXHRcdGlmIChpbnN0cnVjdGlvbi5hZGRyZXNzICE9PSAnLTEnKSB7XG5cdFx0XHRsYWJlbCArPSBgJHtsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25BZGRyZXNzJywgXCJBZGRyZXNzXCIpfTogJHtpbnN0cnVjdGlvbi5hZGRyZXNzfWA7XG5cdFx0fVxuXHRcdGlmIChpbnN0cnVjdGlvbi5pbnN0cnVjdGlvbkJ5dGVzKSB7XG5cdFx0XHRsYWJlbCArPSBgLCAke2xvY2FsaXplKCdpbnN0cnVjdGlvbkJ5dGVzJywgXCJCeXRlc1wiKX06ICR7aW5zdHJ1Y3Rpb24uaW5zdHJ1Y3Rpb25CeXRlc31gO1xuXHRcdH1cblx0XHRsYWJlbCArPSBgLCAke2xvY2FsaXplKGBpbnN0cnVjdGlvblRleHRgLCBcIkluc3RydWN0aW9uXCIpfTogJHtpbnN0cnVjdGlvbi5pbnN0cnVjdGlvbn1gO1xuXG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhc3NlbWJseVZpZXdDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZUxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFuZ3VhZ2VTdXBwb3J0c0Rpc2Fzc2VtYmxlUmVxdWVzdDogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuX2xhbmd1YWdlU3VwcG9ydHNEaXNhc3NlbWJsZVJlcXVlc3QgPSBDT05URVhUX0xBTkdVQUdFX1NVUFBPUlRTX0RJU0FTU0VNQkxFX1JFUVVFU1QuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRNb2RlbCgpPy5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRcdC8vIFRPRE86IGluc3RlYWQgb2YgdXNpbmcgaWREZWJ1Z2dlckludGVyZXN0ZWRJbkxhbmd1YWdlLCBoYXZlIGEgc3BlY2lmaWMgZXh0IHBvaW50IGZvciBsYW5ndWFnZXNcblx0XHRcdFx0Ly8gc3VwcG9ydCBkaXNhc3NlbWJseVxuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZVN1cHBvcnRzRGlzYXNzZW1ibGVSZXF1ZXN0Py5zZXQoISFsYW5ndWFnZSAmJiBkZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5zb21lRGVidWdnZXJJbnRlcmVzdGVkSW5MYW5ndWFnZShsYW5ndWFnZSkpO1xuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZShlID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZVN1cHBvcnRzRGlzYXNzZW1ibGVSZXF1ZXN0Py5zZXQoZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuc29tZURlYnVnZ2VySW50ZXJlc3RlZEluTGFuZ3VhZ2UoZS5uZXdMYW5ndWFnZSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlU3VwcG9ydHNEaXNhc3NlbWJsZVJlcXVlc3Q/LnNldChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIoKTtcblx0XHR0aGlzLl9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZUxpc3RlbmVyID0gZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZShvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZUxpc3RlbmVyKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlPy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiBDT1BZX0FERFJFU1NfTEFCRUwsXG5cdH0sXG5cdGlkOiBDT1BZX0FERFJFU1NfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZW50cnk/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSkgPT4ge1xuXHRcdGlmIChlbnRyeT8uaW5zdHJ1Y3Rpb24/LmFkZHJlc3MpIHtcblx0XHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdFx0Y2xpcGJvYXJkU2VydmljZS53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
