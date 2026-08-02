import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { isNumber, isObject, isString, isUndefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorResolution } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight, KeybindingsRegistry } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService, RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen, WorkbenchTreeStickyScrollFocused } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess } from "./editorQuickAccess.js";
import { SideBySideEditor } from "./sideBySideEditor.js";
import { TextDiffEditor } from "./textDiffEditor.js";
import { ActiveEditorCanSplitInGroupContext, ActiveEditorGroupEmptyContext, ActiveEditorGroupLockedContext, ActiveEditorStickyContext, EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, IsSessionsWindowContext, MultipleEditorGroupsContext, SideBySideEditorActiveContext, TextCompareEditorActiveContext } from "../../../common/contextkeys.js";
import { CloseDirection, EditorInputCapabilities, EditorsOrder, isDiffEditorInput, isEditorInputWithOptionsAndGroup } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { columnToEditorGroup } from "../../../services/editor/common/editorGroupColumn.js";
import { GroupDirection, GroupLocation, GroupsOrder, IEditorGroupsService, preferredSideBySideGroupDirection } from "../../../services/editor/common/editorGroupsService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IUntitledTextEditorService } from "../../../services/untitled/common/untitledTextEditorService.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { DIFF_FOCUS_OTHER_SIDE, DIFF_FOCUS_PRIMARY_SIDE, DIFF_FOCUS_SECONDARY_SIDE, registerDiffEditorCommands } from "./diffEditorCommands.js";
import { resolveCommandsContext } from "./editorCommandsContext.js";
import { prepareMoveCopyEditors } from "./editor.js";
const CLOSE_SAVED_EDITORS_COMMAND_ID = "workbench.action.closeUnmodifiedEditors";
const CLOSE_EDITORS_IN_GROUP_COMMAND_ID = "workbench.action.closeEditorsInGroup";
const CLOSE_EDITORS_AND_GROUP_COMMAND_ID = "workbench.action.closeEditorsAndGroup";
const CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID = "workbench.action.closeEditorsToTheRight";
const CLOSE_EDITOR_COMMAND_ID = "workbench.action.closeActiveEditor";
const CLOSE_PINNED_EDITOR_COMMAND_ID = "workbench.action.closeActivePinnedEditor";
const CLOSE_EDITOR_GROUP_COMMAND_ID = "workbench.action.closeGroup";
const CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID = "workbench.action.closeOtherEditors";
const MOVE_ACTIVE_EDITOR_COMMAND_ID = "moveActiveEditor";
const COPY_ACTIVE_EDITOR_COMMAND_ID = "copyActiveEditor";
const LAYOUT_EDITOR_GROUPS_COMMAND_ID = "layoutEditorGroups";
const KEEP_EDITOR_COMMAND_ID = "workbench.action.keepEditor";
const TOGGLE_KEEP_EDITORS_COMMAND_ID = "workbench.action.toggleKeepEditors";
const TOGGLE_LOCK_GROUP_COMMAND_ID = "workbench.action.toggleEditorGroupLock";
const LOCK_GROUP_COMMAND_ID = "workbench.action.lockEditorGroup";
const UNLOCK_GROUP_COMMAND_ID = "workbench.action.unlockEditorGroup";
const SHOW_EDITORS_IN_GROUP = "workbench.action.showEditorsInGroup";
const REOPEN_WITH_COMMAND_ID = "workbench.action.reopenWithEditor";
const REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID = "reopenActiveEditorWith";
const PIN_EDITOR_COMMAND_ID = "workbench.action.pinEditor";
const UNPIN_EDITOR_COMMAND_ID = "workbench.action.unpinEditor";
const SPLIT_EDITOR = "workbench.action.splitEditor";
const SPLIT_EDITOR_UP = "workbench.action.splitEditorUp";
const SPLIT_EDITOR_DOWN = "workbench.action.splitEditorDown";
const SPLIT_EDITOR_LEFT = "workbench.action.splitEditorLeft";
const SPLIT_EDITOR_RIGHT = "workbench.action.splitEditorRight";
const MOVE_EDITOR_INTO_ABOVE_GROUP = "workbench.action.moveEditorToAboveGroup";
const MOVE_EDITOR_INTO_BELOW_GROUP = "workbench.action.moveEditorToBelowGroup";
const MOVE_EDITOR_INTO_LEFT_GROUP = "workbench.action.moveEditorToLeftGroup";
const MOVE_EDITOR_INTO_RIGHT_GROUP = "workbench.action.moveEditorToRightGroup";
const TOGGLE_MAXIMIZE_EDITOR_GROUP = "workbench.action.toggleMaximizeEditorGroup";
const SPLIT_EDITOR_IN_GROUP = "workbench.action.splitEditorInGroup";
const TOGGLE_SPLIT_EDITOR_IN_GROUP = "workbench.action.toggleSplitEditorInGroup";
const JOIN_EDITOR_IN_GROUP = "workbench.action.joinEditorInGroup";
const TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT = "workbench.action.toggleSplitEditorInGroupLayout";
const FOCUS_FIRST_SIDE_EDITOR = "workbench.action.focusFirstSideEditor";
const FOCUS_SECOND_SIDE_EDITOR = "workbench.action.focusSecondSideEditor";
const FOCUS_OTHER_SIDE_EDITOR = "workbench.action.focusOtherSideEditor";
const FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusLeftGroupWithoutWrap";
const FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusRightGroupWithoutWrap";
const FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusAboveGroupWithoutWrap";
const FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusBelowGroupWithoutWrap";
const OPEN_EDITOR_AT_INDEX_COMMAND_ID = "workbench.action.openEditorAtIndex";
const MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.moveEditorToNewWindow";
const COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.copyEditorToNewWindow";
const MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.moveEditorGroupToNewWindow";
const COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.copyEditorGroupToNewWindow";
const NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID = "workbench.action.newEmptyEditorWindow";
const CLOSE_MODAL_EDITOR_COMMAND_ID = "workbench.action.closeModalEditor";
const MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID = "workbench.action.moveModalEditorToMain";
const MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID = "workbench.action.moveModalEditorToWindow";
const TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID = "workbench.action.toggleModalEditorMaximized";
const NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID = "workbench.action.navigateModalEditorPrevious";
const NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID = "workbench.action.navigateModalEditorNext";
const TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID = "workbench.action.toggleModalEditorSidebar";
const API_OPEN_EDITOR_COMMAND_ID = "_workbench.open";
const API_OPEN_DIFF_EDITOR_COMMAND_ID = "_workbench.diff";
const API_OPEN_WITH_EDITOR_COMMAND_ID = "_workbench.openWith";
const EDITOR_CORE_NAVIGATION_COMMANDS = [
  SPLIT_EDITOR,
  CLOSE_EDITOR_COMMAND_ID,
  UNPIN_EDITOR_COMMAND_ID,
  UNLOCK_GROUP_COMMAND_ID,
  TOGGLE_MAXIMIZE_EDITOR_GROUP
];
const isSelectedEditorsMoveCopyArg = function(arg) {
  if (!isObject(arg)) {
    return false;
  }
  if (!isString(arg.to)) {
    return false;
  }
  if (!isUndefined(arg.by) && !isString(arg.by)) {
    return false;
  }
  if (!isUndefined(arg.value) && !isNumber(arg.value)) {
    return false;
  }
  return true;
};
function registerEditorMoveCopyCommand() {
  const moveCopyJSONSchema = {
    "type": "object",
    "required": ["to"],
    "properties": {
      "to": {
        "type": "string",
        "enum": ["left", "right"]
      },
      "by": {
        "type": "string",
        "enum": ["tab", "group"]
      },
      "value": {
        "type": "number"
      }
    }
  };
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: MOVE_ACTIVE_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: EditorContextKeys.editorTextFocus,
    primary: 0,
    handler: (accessor, args) => moveCopySelectedEditors(true, args, accessor),
    metadata: {
      description: localize("editorCommand.activeEditorMove.description", "Move the active editor by tabs or groups"),
      args: [
        {
          name: localize("editorCommand.activeEditorMove.arg.name", "Active editor move argument"),
          description: localize("editorCommand.activeEditorMove.arg.description", "Argument Properties:\n	* 'to': String value providing where to move.\n	* 'by': String value providing the unit for move (by tab or by group).\n	* 'value': Number value providing how many positions or an absolute position to move."),
          constraint: isSelectedEditorsMoveCopyArg,
          schema: moveCopyJSONSchema
        }
      ]
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: COPY_ACTIVE_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: EditorContextKeys.editorTextFocus,
    primary: 0,
    handler: (accessor, args) => moveCopySelectedEditors(false, args, accessor),
    metadata: {
      description: localize("editorCommand.activeEditorCopy.description", "Copy the active editor by groups"),
      args: [
        {
          name: localize("editorCommand.activeEditorCopy.arg.name", "Active editor copy argument"),
          description: localize("editorCommand.activeEditorCopy.arg.description", "Argument Properties:\n	* 'to': String value providing where to copy.\n	* 'value': Number value providing how many positions or an absolute position to copy."),
          constraint: isSelectedEditorsMoveCopyArg,
          schema: moveCopyJSONSchema
        }
      ]
    }
  });
  [
    { id: MOVE_EDITOR_INTO_ABOVE_GROUP, to: "up" },
    { id: MOVE_EDITOR_INTO_BELOW_GROUP, to: "down" },
    { id: MOVE_EDITOR_INTO_LEFT_GROUP, to: "left" },
    { id: MOVE_EDITOR_INTO_RIGHT_GROUP, to: "right" }
  ].forEach(({ id, to }) => {
    CommandsRegistry.registerCommand(id, function(accessor, ...args) {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      if (resolvedContext.groupedEditors.length) {
        moveCopyEditorsToGroup(true, { to, by: "group" }, resolvedContext.groupedEditors[0].group, resolvedContext.groupedEditors[0].editors, accessor);
      }
    });
  });
  function moveCopySelectedEditors(isMove, args = /* @__PURE__ */ Object.create(null), accessor) {
    args.to = args.to || "right";
    args.by = args.by || "tab";
    args.value = typeof args.value === "number" ? args.value : 1;
    const activeGroup = accessor.get(IEditorGroupsService).activeGroup;
    const selectedEditors = activeGroup.selectedEditors;
    if (selectedEditors.length > 0) {
      switch (args.by) {
        case "tab":
          if (isMove) {
            return moveTabs(args, activeGroup, selectedEditors);
          }
          break;
        case "group":
          return moveCopyEditorsToGroup(isMove, args, activeGroup, selectedEditors, accessor);
      }
    }
  }
  function moveTabs(args, group, editors) {
    const to = args.to;
    if (to === "first" || to === "right") {
      editors = [...editors].reverse();
    } else if (to === "position" && (args.value ?? 1) < group.getIndexOfEditor(editors[0])) {
      editors = [...editors].reverse();
    }
    for (const editor of editors) {
      moveTab(args, group, editor);
    }
  }
  function moveTab(args, group, editor) {
    let index = group.getIndexOfEditor(editor);
    switch (args.to) {
      case "first":
        index = 0;
        break;
      case "last":
        index = group.count - 1;
        break;
      case "left":
        index = index - (args.value ?? 1);
        break;
      case "right":
        index = index + (args.value ?? 1);
        break;
      case "center":
        index = Math.round(group.count / 2) - 1;
        break;
      case "position":
        index = (args.value ?? 1) - 1;
        break;
    }
    index = index < 0 ? 0 : index >= group.count ? group.count - 1 : index;
    group.moveEditor(editor, group, { index });
  }
  function moveCopyEditorsToGroup(isMove, args, sourceGroup, editors, accessor) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    let targetGroup;
    switch (args.to) {
      case "left":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.LEFT }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.LEFT);
        }
        break;
      case "right":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.RIGHT }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.RIGHT);
        }
        break;
      case "up":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.UP }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.UP);
        }
        break;
      case "down":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.DOWN }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.DOWN);
        }
        break;
      case "first":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.FIRST }, sourceGroup);
        break;
      case "last":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.LAST }, sourceGroup);
        break;
      case "previous":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.PREVIOUS }, sourceGroup);
        if (!targetGroup) {
          const oppositeDirection = preferredSideBySideGroupDirection(configurationService) === GroupDirection.RIGHT ? GroupDirection.LEFT : GroupDirection.UP;
          targetGroup = editorGroupsService.addGroup(sourceGroup, oppositeDirection);
        }
        break;
      case "next":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.NEXT }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, preferredSideBySideGroupDirection(configurationService));
        }
        break;
      case "center":
        targetGroup = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[editorGroupsService.count / 2 - 1];
        break;
      case "position":
        targetGroup = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[(args.value ?? 1) - 1];
        break;
    }
    if (targetGroup) {
      const editorsWithOptions = prepareMoveCopyEditors(sourceGroup, editors);
      if (isMove) {
        sourceGroup.moveEditors(editorsWithOptions, targetGroup);
      } else if (sourceGroup.id !== targetGroup.id) {
        sourceGroup.copyEditors(editorsWithOptions, targetGroup);
      }
      targetGroup.focus();
    }
  }
}
function registerEditorGroupsLayoutCommands() {
  function applyEditorLayout(accessor, layout) {
    if (!layout || typeof layout !== "object") {
      return;
    }
    const editorGroupsService = accessor.get(IEditorGroupsService);
    editorGroupsService.applyLayout(layout);
  }
  CommandsRegistry.registerCommand(LAYOUT_EDITOR_GROUPS_COMMAND_ID, (accessor, args) => {
    applyEditorLayout(accessor, args);
  });
  CommandsRegistry.registerCommand({
    id: "vscode.setEditorLayout",
    handler: (accessor, args) => applyEditorLayout(accessor, args),
    metadata: {
      "description": `Set the editor layout. Editor layout is represented as a tree of groups in which the first group is the root group of the layout.
					The orientation of the first group is 0 (horizontal) by default unless specified otherwise. The other orientations are 1 (vertical).
					The orientation of subsequent groups is the opposite of the orientation of the group that contains it.
					Here are some examples: A layout representing 1 row and 2 columns: { orientation: 0, groups: [{}, {}] }.
					A layout representing 3 rows and 1 column: { orientation: 1, groups: [{}, {}, {}] }.
					A layout representing 3 rows and 1 column in which the second row has 2 columns: { orientation: 1, groups: [{}, { groups: [{}, {}] }, {}] }
					`,
      args: [{
        name: "args",
        schema: {
          "type": "object",
          "required": ["groups"],
          "properties": {
            "orientation": {
              "type": "number",
              "default": 0,
              "description": `The orientation of the root group in the layout. 0 for horizontal, 1 for vertical.`,
              "enum": [0, 1],
              "enumDescriptions": [
                localize("editorGroupLayout.horizontal", "Horizontal"),
                localize("editorGroupLayout.vertical", "Vertical")
              ]
            },
            "groups": {
              "$ref": "#/definitions/editorGroupsSchema",
              "default": [{}, {}]
            }
          }
        }
      }]
    }
  });
  CommandsRegistry.registerCommand({
    id: "vscode.getEditorLayout",
    handler: (accessor) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      return editorGroupsService.getLayout();
    },
    metadata: {
      description: "Get Editor Layout",
      args: [],
      returns: "An editor layout object, in the same format as vscode.setEditorLayout"
    }
  });
}
function registerOpenEditorAPICommands() {
  function mixinContext(context, options, column) {
    if (!context) {
      return [options, column];
    }
    return [
      { ...context.editorOptions, ...options ?? /* @__PURE__ */ Object.create(null) },
      context.sideBySide ? SIDE_GROUP : column
    ];
  }
  CommandsRegistry.registerCommand({
    id: "vscode.open",
    handler: (accessor, arg) => {
      accessor.get(ICommandService).executeCommand(API_OPEN_EDITOR_COMMAND_ID, arg);
    },
    metadata: {
      description: "Opens the provided resource in the editor.",
      args: [{ name: "Uri" }]
    }
  });
  CommandsRegistry.registerCommand(API_OPEN_EDITOR_COMMAND_ID, async function(accessor, resourceArg, columnAndOptions, label, context) {
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const openerService = accessor.get(IOpenerService);
    const pathService = accessor.get(IPathService);
    const configurationService = accessor.get(IConfigurationService);
    const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
    const resourceOrString = typeof resourceArg === "string" ? resourceArg : URI.from(resourceArg, true);
    const [columnArg, optionsArg] = columnAndOptions ?? [];
    if (optionsArg || typeof columnArg === "number" || matchesScheme(resourceOrString, Schemas.untitled)) {
      const [options, column] = mixinContext(context, optionsArg, columnArg);
      const resource = URI.isUri(resourceOrString) ? resourceOrString : URI.parse(resourceOrString);
      let input;
      if (untitledTextEditorService.isUntitledWithAssociatedResource(resource)) {
        input = { resource: resource.with({ scheme: pathService.defaultUriScheme }), forceUntitled: true, options, label };
      } else {
        input = { resource, options, label };
      }
      await editorService.openEditor(input, columnToEditorGroup(editorGroupsService, configurationService, column));
    } else if (matchesScheme(resourceOrString, Schemas.command)) {
      return;
    } else {
      await openerService.open(resourceOrString, { openToSide: context?.sideBySide, editorOptions: context?.editorOptions });
    }
  });
  CommandsRegistry.registerCommand({
    id: "vscode.diff",
    handler: (accessor, left, right, label) => {
      accessor.get(ICommandService).executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, left, right, label);
    },
    metadata: {
      description: "Opens the provided resources in the diff editor to compare their contents.",
      args: [
        { name: "left", description: "Left-hand side resource of the diff editor" },
        { name: "right", description: "Right-hand side resource of the diff editor" },
        { name: "title", description: "Human readable title for the diff editor" }
      ]
    }
  });
  CommandsRegistry.registerCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, async function(accessor, originalResource, modifiedResource, labelAndOrDescription, columnAndOptions, context) {
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    const [columnArg, optionsArg] = columnAndOptions ?? [];
    const [options, column] = mixinContext(context, optionsArg, columnArg);
    let label = void 0;
    let description = void 0;
    if (typeof labelAndOrDescription === "string") {
      label = labelAndOrDescription;
    } else if (labelAndOrDescription) {
      label = labelAndOrDescription.label;
      description = labelAndOrDescription.description;
    }
    await editorService.openEditor({
      original: { resource: URI.from(originalResource, true) },
      modified: { resource: URI.from(modifiedResource, true) },
      label,
      description,
      options
    }, columnToEditorGroup(editorGroupsService, configurationService, column));
  });
  CommandsRegistry.registerCommand(API_OPEN_WITH_EDITOR_COMMAND_ID, async (accessor, resource, id, columnAndOptions) => {
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    const [columnArg, optionsArg] = columnAndOptions ?? [];
    await editorService.openEditor({ resource: URI.from(resource, true), options: { pinned: true, ...optionsArg, override: id } }, columnToEditorGroup(editorGroupsService, configurationService, columnArg));
  });
  CommandsRegistry.registerCommand({
    id: "vscode.changes",
    handler: (accessor, title, resources) => {
      accessor.get(ICommandService).executeCommand("_workbench.changes", title, resources);
    },
    metadata: {
      description: "Opens a list of resources in the changes editor to compare their contents.",
      args: [
        { name: "title", description: "Human readable title for the diff editor" },
        { name: "resources", description: "List of resources to open in the changes editor" }
      ]
    }
  });
  CommandsRegistry.registerCommand("_workbench.changes", async (accessor, title, resources) => {
    const editorService = accessor.get(IEditorService);
    const editor = [];
    for (const [label, original, modified] of resources) {
      editor.push({
        resource: URI.revive(label),
        original: { resource: URI.revive(original) },
        modified: { resource: URI.revive(modified) }
      });
    }
    await editorService.openEditor({ resources: editor, label: title });
  });
  CommandsRegistry.registerCommand("_workbench.openMultiDiffEditor", async (accessor, options) => {
    const editorService = accessor.get(IEditorService);
    const resources = options.resources?.map((r) => ({ original: { resource: URI.revive(r.originalUri) }, modified: { resource: URI.revive(r.modifiedUri) } }));
    const revealUri = options.reveal?.modifiedUri ? URI.revive(options.reveal.modifiedUri) : void 0;
    const revealResource = revealUri && resources ? resources.find((r) => isEqual(r.modified.resource, revealUri)) : void 0;
    if (options.reveal && !revealResource) {
      console.error("Reveal resource not found");
    }
    const multiDiffEditorOptions = {
      viewState: revealResource ? {
        revealData: {
          resource: {
            original: revealResource.original.resource,
            modified: revealResource.modified.resource
          },
          range: options.reveal?.range
        }
      } : void 0
    };
    await editorService.openEditor({
      multiDiffSource: options.multiDiffSourceUri ? URI.revive(options.multiDiffSourceUri) : void 0,
      resources,
      label: options.title,
      options: multiDiffEditorOptions
    });
  });
}
function registerOpenEditorAtIndexCommands() {
  const openEditorAtIndex = (accessor, editorIndex) => {
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (activeEditorPane && typeof editorIndex === "number") {
      const editor = activeEditorPane.group.getEditorByIndex(editorIndex);
      if (editor) {
        editorService.openEditor(editor);
      }
    }
  };
  CommandsRegistry.registerCommand({
    id: OPEN_EDITOR_AT_INDEX_COMMAND_ID,
    handler: openEditorAtIndex
  });
  for (let i = 0; i < 9; i++) {
    const editorIndex = i;
    const visibleIndex = i + 1;
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: OPEN_EDITOR_AT_INDEX_COMMAND_ID + visibleIndex,
      weight: KeybindingWeight.WorkbenchContrib,
      when: void 0,
      primary: KeyMod.Alt | toKeyCode(visibleIndex),
      mac: { primary: KeyMod.WinCtrl | toKeyCode(visibleIndex) },
      handler: (accessor) => openEditorAtIndex(accessor, editorIndex)
    });
  }
  function toKeyCode(index) {
    switch (index) {
      case 0:
        return KeyCode.Digit0;
      case 1:
        return KeyCode.Digit1;
      case 2:
        return KeyCode.Digit2;
      case 3:
        return KeyCode.Digit3;
      case 4:
        return KeyCode.Digit4;
      case 5:
        return KeyCode.Digit5;
      case 6:
        return KeyCode.Digit6;
      case 7:
        return KeyCode.Digit7;
      case 8:
        return KeyCode.Digit8;
      case 9:
        return KeyCode.Digit9;
    }
    throw new Error("invalid index");
  }
}
function registerFocusEditorGroupAtIndexCommands() {
  for (let groupIndex = 1; groupIndex < 8; groupIndex++) {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: toCommandId(groupIndex),
      weight: KeybindingWeight.WorkbenchContrib,
      when: void 0,
      primary: KeyMod.CtrlCmd | toKeyCode(groupIndex),
      handler: (accessor) => {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const configurationService = accessor.get(IConfigurationService);
        if (groupIndex > editorGroupsService.count) {
          return;
        }
        const groups = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
        if (groups[groupIndex]) {
          return groups[groupIndex].focus();
        }
        const direction = preferredSideBySideGroupDirection(configurationService);
        const lastGroup = editorGroupsService.findGroup({ location: GroupLocation.LAST });
        if (!lastGroup) {
          return;
        }
        const newGroup = editorGroupsService.addGroup(lastGroup, direction);
        newGroup.focus();
      }
    });
  }
  function toCommandId(index) {
    switch (index) {
      case 1:
        return "workbench.action.focusSecondEditorGroup";
      case 2:
        return "workbench.action.focusThirdEditorGroup";
      case 3:
        return "workbench.action.focusFourthEditorGroup";
      case 4:
        return "workbench.action.focusFifthEditorGroup";
      case 5:
        return "workbench.action.focusSixthEditorGroup";
      case 6:
        return "workbench.action.focusSeventhEditorGroup";
      case 7:
        return "workbench.action.focusEighthEditorGroup";
    }
    throw new Error("Invalid index");
  }
  function toKeyCode(index) {
    switch (index) {
      case 1:
        return KeyCode.Digit2;
      case 2:
        return KeyCode.Digit3;
      case 3:
        return KeyCode.Digit4;
      case 4:
        return KeyCode.Digit5;
      case 5:
        return KeyCode.Digit6;
      case 6:
        return KeyCode.Digit7;
      case 7:
        return KeyCode.Digit8;
    }
    throw new Error("Invalid index");
  }
}
function splitEditor(editorGroupsService, direction, resolvedContext) {
  if (!resolvedContext.groupedEditors.length) {
    return;
  }
  const { group, editors } = resolvedContext.groupedEditors[0];
  const preserveFocus = resolvedContext.preserveFocus;
  const newGroup = editorGroupsService.addGroup(group, direction);
  for (const editorToCopy of editors) {
    if (editorToCopy && !editorToCopy.hasCapability(EditorInputCapabilities.Singleton)) {
      group.copyEditor(editorToCopy, newGroup, { preserveFocus });
    }
  }
  newGroup.focus();
}
function registerSplitEditorCommands() {
  [
    { id: SPLIT_EDITOR_UP, direction: GroupDirection.UP },
    { id: SPLIT_EDITOR_DOWN, direction: GroupDirection.DOWN },
    { id: SPLIT_EDITOR_LEFT, direction: GroupDirection.LEFT },
    { id: SPLIT_EDITOR_RIGHT, direction: GroupDirection.RIGHT }
  ].forEach(({ id, direction }) => {
    CommandsRegistry.registerCommand(id, function(accessor, ...args) {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      splitEditor(accessor.get(IEditorGroupsService), direction, resolvedContext);
    });
  });
}
function registerCloseEditorCommands() {
  function closeEditorHandler(accessor, forceCloseStickyEditors, ...args) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    let keepStickyEditors = void 0;
    if (forceCloseStickyEditors) {
      keepStickyEditors = false;
    } else if (args.length) {
      keepStickyEditors = false;
    } else {
      keepStickyEditors = editorGroupsService.partOptions.preventPinnedEditorClose === "keyboard" || editorGroupsService.partOptions.preventPinnedEditorClose === "keyboardAndMouse";
    }
    if (keepStickyEditors) {
      const activeGroup = editorGroupsService.activeGroup;
      const activeEditor = activeGroup.activeEditor;
      if (activeEditor && activeGroup.isSticky(activeEditor)) {
        const nextNonStickyEditorInGroup = activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true })[0];
        if (nextNonStickyEditorInGroup) {
          return activeGroup.openEditor(nextNonStickyEditorInGroup);
        }
        const nextNonStickyEditorInAllGroups = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true })[0];
        if (nextNonStickyEditorInAllGroups) {
          return Promise.resolve(editorGroupsService.getGroup(nextNonStickyEditorInAllGroups.groupId)?.openEditor(nextNonStickyEditorInAllGroups.editor));
        }
      }
    }
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const preserveFocus = resolvedContext.preserveFocus;
    return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
      const editorsToClose = editors.filter((editor) => !keepStickyEditors || !group.isSticky(editor));
      await group.closeEditors(editorsToClose, { preserveFocus });
    }));
  }
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyMod.CtrlCmd | KeyCode.KeyW,
    win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
    handler: (accessor, ...args) => {
      return closeEditorHandler(accessor, false, ...args);
    }
  });
  CommandsRegistry.registerCommand(CLOSE_PINNED_EDITOR_COMMAND_ID, (accessor, ...args) => {
    return closeEditorHandler(accessor, true, ...args);
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyW),
    handler: (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
        await group.closeAllEditors({ excludeSticky: true });
      }));
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITOR_GROUP_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext),
    primary: KeyMod.CtrlCmd | KeyCode.KeyW,
    win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
    handler: (accessor, ...args) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
      if (commandsContext.groupedEditors.length) {
        editorGroupsService.removeGroup(commandsContext.groupedEditors[0].group);
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_SAVED_EDITORS_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyU),
    handler: (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
        await group.closeEditors({ savedOnly: true, excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
      }));
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyT },
    handler: (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
        const editorsToClose = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).filter((editor) => !editors.includes(editor));
        for (const editorToKeep of editors) {
          if (editorToKeep) {
            group.pinEditor(editorToKeep);
          }
        }
        await group.closeEditors(editorsToClose, { preserveFocus: resolvedContext.preserveFocus });
      }));
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      if (resolvedContext.groupedEditors.length) {
        const { group, editors } = resolvedContext.groupedEditors[0];
        if (group.activeEditor) {
          group.pinEditor(group.activeEditor);
        }
        await group.closeEditors({ direction: CloseDirection.RIGHT, except: editors[0], excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: REOPEN_WITH_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: (accessor, ...args) => {
      return reopenEditorWith(accessor, EditorResolution.PICK, ...args);
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: (accessor, override, ...args) => {
      return reopenEditorWith(accessor, override ?? EditorResolution.PICK, ...args);
    }
  });
  async function reopenEditorWith(accessor, editorOverride, ...args) {
    const editorService = accessor.get(IEditorService);
    const editorResolverService = accessor.get(IEditorResolverService);
    const telemetryService = accessor.get(ITelemetryService);
    const textFileService = accessor.get(ITextFileService);
    const workingCopyService = accessor.get(IWorkingCopyService);
    const workingCopyEditorService = accessor.get(IWorkingCopyEditorService);
    const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
    const editorReplacements = /* @__PURE__ */ new Map();
    for (const { group, editors } of resolvedContext.groupedEditors) {
      for (const editor of editors) {
        const isDiffEditor = isDiffEditorInput(editor);
        const editorToResolve = isDiffEditor ? editor.modified : editor;
        const untypedEditor = isDiffEditor ? editor.toUntyped() : editorToResolve.toUntyped();
        if (!untypedEditor) {
          return;
        }
        untypedEditor.options = { ...editorService.activeEditorPane?.options, override: editorOverride };
        const resolvedEditor = await editorResolverService.resolveEditor(untypedEditor, group);
        if (!isEditorInputWithOptionsAndGroup(resolvedEditor)) {
          return;
        }
        let editorReplacementsInGroup = editorReplacements.get(group);
        if (!editorReplacementsInGroup) {
          editorReplacementsInGroup = [];
          editorReplacements.set(group, editorReplacementsInGroup);
        }
        const resource = editorToResolve.resource;
        let forceReplaceDirty = !!resource && (resource.scheme === Schemas.untitled || textFileService.isDirty(resource));
        if (forceReplaceDirty && editorToResolve.isDirty()) {
          for (const workingCopy of workingCopyService.dirtyWorkingCopies) {
            if (isEqual(workingCopy.resource, resource)) {
              continue;
            }
            if (workingCopyEditorService.findEditor(workingCopy)?.editor === editorToResolve) {
              forceReplaceDirty = false;
              break;
            }
          }
        }
        editorReplacementsInGroup.push({
          editor,
          replacement: resolvedEditor.editor,
          forceReplaceDirty,
          options: resolvedEditor.options
        });
        telemetryService.publicLog2("workbenchEditorReopen", {
          scheme: editorToResolve.resource?.scheme ?? "",
          ext: editorToResolve.resource ? extname(editorToResolve.resource) : "",
          from: editor.editorId ?? "",
          to: resolvedEditor.editor.editorId ?? ""
        });
      }
    }
    for (const [group, replacements] of editorReplacements) {
      await group.replaceEditors(replacements);
      await group.openEditor(replacements[0].replacement);
    }
  }
  CommandsRegistry.registerCommand(CLOSE_EDITORS_AND_GROUP_COMMAND_ID, async (accessor, ...args) => {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
    if (resolvedContext.groupedEditors.length) {
      const { group } = resolvedContext.groupedEditors[0];
      await group.closeAllEditors();
      if (group.count === 0 && editorGroupsService.getGroup(group.id)) {
        editorGroupsService.removeGroup(group);
      }
    }
  });
}
function registerFocusEditorGroupWihoutWrapCommands() {
  const commands = [
    {
      id: FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.LEFT
    },
    {
      id: FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.RIGHT
    },
    {
      id: FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.UP
    },
    {
      id: FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.DOWN
    }
  ];
  for (const command of commands) {
    CommandsRegistry.registerCommand(command.id, async (accessor) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const group = editorGroupsService.findGroup({ direction: command.direction }, editorGroupsService.activeGroup, false) ?? editorGroupsService.activeGroup;
      group.focus();
    });
  }
}
function registerSplitEditorInGroupCommands() {
  async function splitEditorInGroup(accessor, resolvedContext) {
    const instantiationService = accessor.get(IInstantiationService);
    if (!resolvedContext.groupedEditors.length) {
      return;
    }
    const { group, editors } = resolvedContext.groupedEditors[0];
    const editor = editors[0];
    if (!editor) {
      return;
    }
    await group.replaceEditors([{
      editor,
      replacement: instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, editor, editor),
      forceReplaceDirty: true
    }]);
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: SPLIT_EDITOR_IN_GROUP,
        title: localize2("splitEditorInGroup", "Split Editor in Group"),
        category: Categories.View,
        precondition: ActiveEditorCanSplitInGroupContext,
        f1: true,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          when: ActiveEditorCanSplitInGroupContext,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash)
        }
      });
    }
    run(accessor, ...args) {
      return splitEditorInGroup(accessor, resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
    }
  });
  async function joinEditorInGroup(resolvedContext) {
    if (!resolvedContext.groupedEditors.length) {
      return;
    }
    const { group, editors } = resolvedContext.groupedEditors[0];
    const editor = editors[0];
    if (!editor) {
      return;
    }
    if (!(editor instanceof SideBySideEditorInput)) {
      return;
    }
    let options = void 0;
    const activeEditorPane = group.activeEditorPane;
    if (activeEditorPane instanceof SideBySideEditor && group.activeEditor === editor) {
      for (const pane of [activeEditorPane.getPrimaryEditorPane(), activeEditorPane.getSecondaryEditorPane()]) {
        if (pane?.hasFocus()) {
          options = { viewState: pane.getViewState() };
          break;
        }
      }
    }
    await group.replaceEditors([{
      editor,
      replacement: editor.primary,
      options
    }]);
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: JOIN_EDITOR_IN_GROUP,
        title: localize2("joinEditorInGroup", "Join Editor in Group"),
        category: Categories.View,
        precondition: SideBySideEditorActiveContext,
        f1: true,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          when: SideBySideEditorActiveContext,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash)
        }
      });
    }
    run(accessor, ...args) {
      return joinEditorInGroup(resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_SPLIT_EDITOR_IN_GROUP,
        title: localize2("toggleJoinEditorInGroup", "Toggle Split Editor in Group"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext),
        f1: true
      });
    }
    async run(accessor, ...args) {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      if (!resolvedContext.groupedEditors.length) {
        return;
      }
      const { editors } = resolvedContext.groupedEditors[0];
      if (editors[0] instanceof SideBySideEditorInput) {
        await joinEditorInGroup(resolvedContext);
      } else if (editors[0]) {
        await splitEditorInGroup(accessor, resolvedContext);
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
        title: localize2("toggleSplitEditorInGroupLayout", "Toggle Layout of Split Editor in Group"),
        category: Categories.View,
        precondition: SideBySideEditorActiveContext,
        f1: true
      });
    }
    async run(accessor) {
      const configurationService = accessor.get(IConfigurationService);
      const currentSetting = configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING);
      let newSetting;
      if (currentSetting !== "horizontal") {
        newSetting = "horizontal";
      } else {
        newSetting = "vertical";
      }
      return configurationService.updateValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING, newSetting);
    }
  });
}
function registerFocusSideEditorsCommands() {
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: FOCUS_FIRST_SIDE_EDITOR,
        title: localize2("focusLeftSideEditor", "Focus First Side in Active Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
        f1: true
      });
    }
    async run(accessor) {
      const editorService = accessor.get(IEditorService);
      const commandService = accessor.get(ICommandService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane instanceof SideBySideEditor) {
        activeEditorPane.getSecondaryEditorPane()?.focus();
      } else if (activeEditorPane instanceof TextDiffEditor) {
        await commandService.executeCommand(DIFF_FOCUS_SECONDARY_SIDE);
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: FOCUS_SECOND_SIDE_EDITOR,
        title: localize2("focusRightSideEditor", "Focus Second Side in Active Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
        f1: true
      });
    }
    async run(accessor) {
      const editorService = accessor.get(IEditorService);
      const commandService = accessor.get(ICommandService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane instanceof SideBySideEditor) {
        activeEditorPane.getPrimaryEditorPane()?.focus();
      } else if (activeEditorPane instanceof TextDiffEditor) {
        await commandService.executeCommand(DIFF_FOCUS_PRIMARY_SIDE);
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: FOCUS_OTHER_SIDE_EDITOR,
        title: localize2("focusOtherSideEditor", "Focus Other Side in Active Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
        f1: true
      });
    }
    async run(accessor) {
      const editorService = accessor.get(IEditorService);
      const commandService = accessor.get(ICommandService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane instanceof SideBySideEditor) {
        if (activeEditorPane.getPrimaryEditorPane()?.hasFocus()) {
          activeEditorPane.getSecondaryEditorPane()?.focus();
        } else {
          activeEditorPane.getPrimaryEditorPane()?.focus();
        }
      } else if (activeEditorPane instanceof TextDiffEditor) {
        await commandService.executeCommand(DIFF_FOCUS_OTHER_SIDE);
      }
    }
  });
}
function registerOtherEditorCommands() {
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: KEEP_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.Enter),
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      for (const { group, editors } of resolvedContext.groupedEditors) {
        for (const editor of editors) {
          group.pinEditor(editor);
        }
      }
    }
  });
  CommandsRegistry.registerCommand({
    id: TOGGLE_KEEP_EDITORS_COMMAND_ID,
    handler: (accessor) => {
      const configurationService = accessor.get(IConfigurationService);
      const currentSetting = configurationService.getValue("workbench.editor.enablePreview");
      const newSetting = currentSetting !== true;
      configurationService.updateValue("workbench.editor.enablePreview", newSetting);
    }
  });
  function setEditorGroupLock(accessor, locked, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const group = resolvedContext.groupedEditors[0]?.group;
    group?.lock(locked ?? !group.isLocked);
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_LOCK_GROUP_COMMAND_ID,
        title: localize2("toggleEditorGroupLock", "Toggle Editor Group Lock"),
        category: Categories.View,
        f1: true
      });
    }
    async run(accessor, ...args) {
      setEditorGroupLock(accessor, void 0, ...args);
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: LOCK_GROUP_COMMAND_ID,
        title: localize2("lockEditorGroup", "Lock Editor Group"),
        category: Categories.View,
        precondition: ActiveEditorGroupLockedContext.toNegated(),
        f1: true
      });
    }
    async run(accessor, ...args) {
      setEditorGroupLock(accessor, true, ...args);
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: UNLOCK_GROUP_COMMAND_ID,
        title: localize2("unlockEditorGroup", "Unlock Editor Group"),
        precondition: ActiveEditorGroupLockedContext,
        category: Categories.View,
        f1: true
      });
    }
    async run(accessor, ...args) {
      setEditorGroupLock(accessor, false, ...args);
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: PIN_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ActiveEditorStickyContext.toNegated(),
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.Enter),
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      for (const { group, editors } of resolvedContext.groupedEditors) {
        for (const editor of editors) {
          group.stickEditor(editor);
        }
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: UNPIN_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ActiveEditorStickyContext,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.Enter),
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      for (const { group, editors } of resolvedContext.groupedEditors) {
        for (const editor of editors) {
          group.unstickEditor(editor);
        }
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: SHOW_EDITORS_IN_GROUP,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: (accessor, ...args) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const quickInputService = accessor.get(IQuickInputService);
      const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
      const group = commandsContext.groupedEditors[0]?.group;
      if (group) {
        editorGroupsService.activateGroup(group);
      }
      return quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
    }
  });
}
function registerModalEditorCommands() {
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
        title: localize2("moveToMainWindow", "Open Modal Editor in Main Window"),
        category: Categories.View,
        f1: true,
        icon: Codicon.openInProduct,
        precondition: EditorPartModalContext,
        menu: {
          id: MenuId.ModalEditorTitle,
          group: "navigation",
          order: 0,
          when: IsSessionsWindowContext.negate()
        }
      });
    }
    async run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          await part.close({ mergeAllEditorsToMainPart: true });
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
        title: localize2("moveModalEditorToWindow", "Open Modal Editor in New Window"),
        category: Categories.View,
        f1: true,
        icon: Codicon.emptyWindow,
        precondition: EditorPartModalContext,
        menu: [{
          id: MenuId.ModalEditorTitleContext,
          group: "1_window",
          order: 0,
          when: IsSessionsWindowContext
        }]
      });
    }
    async run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          const auxiliaryEditorPart = await editorGroupsService.createAuxiliaryEditorPart();
          for (const group of part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
            group.moveEditors(group.editors.map((editor) => ({ editor, options: { preserveFocus: true } })), auxiliaryEditorPart.activeGroup);
          }
          auxiliaryEditorPart.activeGroup.focus();
          await part.close();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
        title: localize2("toggleModalEditorSidebar", "Toggle Modal Editor Sidebar"),
        category: Categories.View,
        f1: true,
        precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalSidebarContext)
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          part.toggleSidebar();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
        title: localize2("toggleModalEditorMaximized", "Maximize Modal Editor"),
        category: Categories.View,
        f1: true,
        precondition: EditorPartModalContext,
        icon: Codicon.screenFull,
        toggled: {
          condition: EditorPartModalMaximizedContext,
          title: localize("restoreModalEditorSize", "Restore Modal Editor")
        },
        menu: {
          id: MenuId.ModalEditorTitle,
          group: "navigation",
          order: 99
        }
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          part.toggleMaximized();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: CLOSE_MODAL_EDITOR_COMMAND_ID,
        title: localize2("closeModalEditor", "Close Modal Editor"),
        category: Categories.View,
        f1: true,
        icon: Codicon.close,
        precondition: EditorPartModalContext,
        keybinding: [{
          primary: KeyCode.Escape,
          weight: KeybindingWeight.WorkbenchContrib + 10,
          // higher when no text editor or list/tree is focused...
          when: ContextKeyExpr.and(EditorContextKeys.focus.toNegated(), RawWorkbenchListFocusContextKey.negate())
        }, {
          primary: KeyCode.Escape,
          weight: KeybindingWeight.EditorContrib - 1,
          // ...lower to prevent accidental close when text editor is focused
          when: EditorContextKeys.focus
        }, {
          primary: KeyCode.Escape,
          // When a list/tree is focused, still close the modal, but yield to the
          // list/tree's own `Escape` features that should close first (the find
          // widget and sticky scroll). The selection is intentionally not cleared
          // first so a single `Escape` closes the modal.
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen.negate(), WorkbenchTreeStickyScrollFocused.negate())
        }],
        menu: {
          id: MenuId.ModalEditorTitle,
          group: "navigation",
          order: 100
        }
      });
    }
    async run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          await part.close();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
        title: localize2("navigateModalEditorPrevious", "Navigate to Previous Item in Modal Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext),
        keybinding: {
          primary: KeyMod.Alt | KeyCode.UpArrow,
          weight: KeybindingWeight.WorkbenchContrib + 10,
          when: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext)
        }
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          const nav = part.navigation;
          if (nav && nav.current > 0) {
            nav.navigate(nav.current - 1);
          }
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
        title: localize2("navigateModalEditorNext", "Navigate to Next Item in Modal Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext),
        keybinding: {
          primary: KeyMod.Alt | KeyCode.DownArrow,
          weight: KeybindingWeight.WorkbenchContrib + 10,
          when: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext)
        }
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          const nav = part.navigation;
          if (nav && nav.current < nav.total - 1) {
            nav.navigate(nav.current + 1);
          }
          break;
        }
      }
    }
  });
}
function isModalEditorPart(obj) {
  const part = obj;
  return !!part && typeof part.close === "function" && typeof part.onWillClose === "function" && typeof part.toggleMaximized === "function" && typeof part.maximized === "boolean" && typeof part.updateOptions === "function" && !!part.modalElement && part.windowId === mainWindow.vscodeWindowId;
}
function setup() {
  registerEditorMoveCopyCommand();
  registerEditorGroupsLayoutCommands();
  registerDiffEditorCommands();
  registerOpenEditorAPICommands();
  registerOpenEditorAtIndexCommands();
  registerCloseEditorCommands();
  registerOtherEditorCommands();
  registerSplitEditorInGroupCommands();
  registerFocusSideEditorsCommands();
  registerFocusEditorGroupAtIndexCommands();
  registerSplitEditorCommands();
  registerFocusEditorGroupWihoutWrapCommands();
  registerModalEditorCommands();
}
export {
  API_OPEN_DIFF_EDITOR_COMMAND_ID,
  API_OPEN_EDITOR_COMMAND_ID,
  API_OPEN_WITH_EDITOR_COMMAND_ID,
  CLOSE_EDITORS_AND_GROUP_COMMAND_ID,
  CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
  CLOSE_EDITOR_COMMAND_ID,
  CLOSE_EDITOR_GROUP_COMMAND_ID,
  CLOSE_MODAL_EDITOR_COMMAND_ID,
  CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_PINNED_EDITOR_COMMAND_ID,
  CLOSE_SAVED_EDITORS_COMMAND_ID,
  COPY_ACTIVE_EDITOR_COMMAND_ID,
  COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  EDITOR_CORE_NAVIGATION_COMMANDS,
  FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_FIRST_SIDE_EDITOR,
  FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_OTHER_SIDE_EDITOR,
  FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_SECOND_SIDE_EDITOR,
  JOIN_EDITOR_IN_GROUP,
  KEEP_EDITOR_COMMAND_ID,
  LAYOUT_EDITOR_GROUPS_COMMAND_ID,
  LOCK_GROUP_COMMAND_ID,
  MOVE_ACTIVE_EDITOR_COMMAND_ID,
  MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  MOVE_EDITOR_INTO_ABOVE_GROUP,
  MOVE_EDITOR_INTO_BELOW_GROUP,
  MOVE_EDITOR_INTO_LEFT_GROUP,
  MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  MOVE_EDITOR_INTO_RIGHT_GROUP,
  MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
  MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
  NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
  OPEN_EDITOR_AT_INDEX_COMMAND_ID,
  PIN_EDITOR_COMMAND_ID,
  REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID,
  REOPEN_WITH_COMMAND_ID,
  SHOW_EDITORS_IN_GROUP,
  SPLIT_EDITOR,
  SPLIT_EDITOR_DOWN,
  SPLIT_EDITOR_IN_GROUP,
  SPLIT_EDITOR_LEFT,
  SPLIT_EDITOR_RIGHT,
  SPLIT_EDITOR_UP,
  TOGGLE_KEEP_EDITORS_COMMAND_ID,
  TOGGLE_LOCK_GROUP_COMMAND_ID,
  TOGGLE_MAXIMIZE_EDITOR_GROUP,
  TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
  TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
  TOGGLE_SPLIT_EDITOR_IN_GROUP,
  TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
  UNLOCK_GROUP_COMMAND_ID,
  UNPIN_EDITOR_COMMAND_ID,
  setup,
  splitEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcywgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciwgaXNPYmplY3QsIGlzU3RyaW5nLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRIYW5kbGVyLCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb2x1dGlvbiwgSUVkaXRvck9wdGlvbnMsIElSZXNvdXJjZUVkaXRvcklucHV0LCBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQsIEtleWJpbmRpbmdzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgSU9wZW5FdmVudCwgUmF3V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoVHJlZUZpbmRPcGVuLCBXb3JrYmVuY2hUcmVlU3RpY2t5U2Nyb2xsRm9jdXNlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBY3RpdmVHcm91cEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2VzcyB9IGZyb20gJy4vZWRpdG9yUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4vc2lkZUJ5U2lkZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBUZXh0RGlmZkVkaXRvciB9IGZyb20gJy4vdGV4dERpZmZFZGl0b3IuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCwgQWN0aXZlRWRpdG9yR3JvdXBFbXB0eUNvbnRleHQsIEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dCwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCwgRWRpdG9yUGFydE1vZGFsQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsTWF4aW1pemVkQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsTmF2aWdhdGlvbkNvbnRleHQsIEVkaXRvclBhcnRNb2RhbFNpZGViYXJDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LCBTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCwgVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENsb3NlRGlyZWN0aW9uLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgRWRpdG9yc09yZGVyLCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBpc0RpZmZFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cENvbHVtbiwgY29sdW1uVG9FZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBDb2x1bW4uanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBMYXlvdXQsIEdyb3VwRGlyZWN0aW9uLCBHcm91cExvY2F0aW9uLCBHcm91cHNPcmRlciwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvclJlcGxhY2VtZW50LCBJTW9kYWxFZGl0b3JQYXJ0LCBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRElGRl9GT0NVU19PVEhFUl9TSURFLCBESUZGX0ZPQ1VTX1BSSU1BUllfU0lERSwgRElGRl9GT0NVU19TRUNPTkRBUllfU0lERSwgcmVnaXN0ZXJEaWZmRWRpdG9yQ29tbWFuZHMgfSBmcm9tICcuL2RpZmZFZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRFZGl0b3JDb21tYW5kc0NvbnRleHQsIHJlc29sdmVDb21tYW5kc0NvbnRleHQgfSBmcm9tICcuL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElNdWx0aURpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tdWx0aURpZmZFZGl0b3JXaWRnZXRJbXBsLmpzJztcblxuZXhwb3J0IGNvbnN0IENMT1NFX1NBVkVEX0VESVRPUlNfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlVW5tb2RpZmllZEVkaXRvcnMnO1xuZXhwb3J0IGNvbnN0IENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRWRpdG9yc0luR3JvdXAnO1xuZXhwb3J0IGNvbnN0IENMT1NFX0VESVRPUlNfQU5EX0dST1VQX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUVkaXRvcnNBbmRHcm91cCc7XG5leHBvcnQgY29uc3QgQ0xPU0VfRURJVE9SU19UT19USEVfUklHSFRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRWRpdG9yc1RvVGhlUmlnaHQnO1xuZXhwb3J0IGNvbnN0IENMT1NFX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBY3RpdmVFZGl0b3InO1xuZXhwb3J0IGNvbnN0IENMT1NFX1BJTk5FRF9FRElUT1JfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlQWN0aXZlUGlubmVkRWRpdG9yJztcbmV4cG9ydCBjb25zdCBDTE9TRV9FRElUT1JfR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlR3JvdXAnO1xuZXhwb3J0IGNvbnN0IENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlT3RoZXJFZGl0b3JzJztcblxuZXhwb3J0IGNvbnN0IE1PVkVfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lEID0gJ21vdmVBY3RpdmVFZGl0b3InO1xuZXhwb3J0IGNvbnN0IENPUFlfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lEID0gJ2NvcHlBY3RpdmVFZGl0b3InO1xuZXhwb3J0IGNvbnN0IExBWU9VVF9FRElUT1JfR1JPVVBTX0NPTU1BTkRfSUQgPSAnbGF5b3V0RWRpdG9yR3JvdXBzJztcbmV4cG9ydCBjb25zdCBLRUVQX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ua2VlcEVkaXRvcic7XG5leHBvcnQgY29uc3QgVE9HR0xFX0tFRVBfRURJVE9SU19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlS2VlcEVkaXRvcnMnO1xuZXhwb3J0IGNvbnN0IFRPR0dMRV9MT0NLX0dST1VQX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVFZGl0b3JHcm91cExvY2snO1xuZXhwb3J0IGNvbnN0IExPQ0tfR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmxvY2tFZGl0b3JHcm91cCc7XG5leHBvcnQgY29uc3QgVU5MT0NLX0dST1VQX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi51bmxvY2tFZGl0b3JHcm91cCc7XG5leHBvcnQgY29uc3QgU0hPV19FRElUT1JTX0lOX0dST1VQID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0VkaXRvcnNJbkdyb3VwJztcbmV4cG9ydCBjb25zdCBSRU9QRU5fV0lUSF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucmVvcGVuV2l0aEVkaXRvcic7XG5leHBvcnQgY29uc3QgUkVPUEVOX0FDVElWRV9FRElUT1JfV0lUSF9DT01NQU5EX0lEID0gJ3Jlb3BlbkFjdGl2ZUVkaXRvcldpdGgnO1xuXG5leHBvcnQgY29uc3QgUElOX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucGluRWRpdG9yJztcbmV4cG9ydCBjb25zdCBVTlBJTl9FRElUT1JfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnVucGluRWRpdG9yJztcblxuZXhwb3J0IGNvbnN0IFNQTElUX0VESVRPUiA9ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yJztcbmV4cG9ydCBjb25zdCBTUExJVF9FRElUT1JfVVAgPSAnd29ya2JlbmNoLmFjdGlvbi5zcGxpdEVkaXRvclVwJztcbmV4cG9ydCBjb25zdCBTUExJVF9FRElUT1JfRE9XTiA9ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yRG93bic7XG5leHBvcnQgY29uc3QgU1BMSVRfRURJVE9SX0xFRlQgPSAnd29ya2JlbmNoLmFjdGlvbi5zcGxpdEVkaXRvckxlZnQnO1xuZXhwb3J0IGNvbnN0IFNQTElUX0VESVRPUl9SSUdIVCA9ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yUmlnaHQnO1xuXG5leHBvcnQgY29uc3QgTU9WRV9FRElUT1JfSU5UT19BQk9WRV9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb0Fib3ZlR3JvdXAnO1xuZXhwb3J0IGNvbnN0IE1PVkVfRURJVE9SX0lOVE9fQkVMT1dfR1JPVVAgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yVG9CZWxvd0dyb3VwJztcbmV4cG9ydCBjb25zdCBNT1ZFX0VESVRPUl9JTlRPX0xFRlRfR1JPVVAgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yVG9MZWZ0R3JvdXAnO1xuZXhwb3J0IGNvbnN0IE1PVkVfRURJVE9SX0lOVE9fUklHSFRfR1JPVVAgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yVG9SaWdodEdyb3VwJztcblxuZXhwb3J0IGNvbnN0IFRPR0dMRV9NQVhJTUlaRV9FRElUT1JfR1JPVVAgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVNYXhpbWl6ZUVkaXRvckdyb3VwJztcblxuZXhwb3J0IGNvbnN0IFNQTElUX0VESVRPUl9JTl9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9ySW5Hcm91cCc7XG5leHBvcnQgY29uc3QgVE9HR0xFX1NQTElUX0VESVRPUl9JTl9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVNwbGl0RWRpdG9ySW5Hcm91cCc7XG5leHBvcnQgY29uc3QgSk9JTl9FRElUT1JfSU5fR1JPVVAgPSAnd29ya2JlbmNoLmFjdGlvbi5qb2luRWRpdG9ySW5Hcm91cCc7XG5leHBvcnQgY29uc3QgVE9HR0xFX1NQTElUX0VESVRPUl9JTl9HUk9VUF9MQVlPVVQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVTcGxpdEVkaXRvckluR3JvdXBMYXlvdXQnO1xuXG5leHBvcnQgY29uc3QgRk9DVVNfRklSU1RfU0lERV9FRElUT1IgPSAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0ZpcnN0U2lkZUVkaXRvcic7XG5leHBvcnQgY29uc3QgRk9DVVNfU0VDT05EX1NJREVfRURJVE9SID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNTZWNvbmRTaWRlRWRpdG9yJztcbmV4cG9ydCBjb25zdCBGT0NVU19PVEhFUl9TSURFX0VESVRPUiA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzT3RoZXJTaWRlRWRpdG9yJztcblxuZXhwb3J0IGNvbnN0IEZPQ1VTX0xFRlRfR1JPVVBfV0lUSE9VVF9XUkFQX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0xlZnRHcm91cFdpdGhvdXRXcmFwJztcbmV4cG9ydCBjb25zdCBGT0NVU19SSUdIVF9HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzUmlnaHRHcm91cFdpdGhvdXRXcmFwJztcbmV4cG9ydCBjb25zdCBGT0NVU19BQk9WRV9HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQWJvdmVHcm91cFdpdGhvdXRXcmFwJztcbmV4cG9ydCBjb25zdCBGT0NVU19CRUxPV19HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQmVsb3dHcm91cFdpdGhvdXRXcmFwJztcblxuZXhwb3J0IGNvbnN0IE9QRU5fRURJVE9SX0FUX0lOREVYX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuRWRpdG9yQXRJbmRleCc7XG5cbmV4cG9ydCBjb25zdCBNT1ZFX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb05ld1dpbmRvdyc7XG5leHBvcnQgY29uc3QgQ09QWV9FRElUT1JfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jb3B5RWRpdG9yVG9OZXdXaW5kb3cnO1xuXG5leHBvcnQgY29uc3QgTU9WRV9FRElUT1JfR1JPVVBfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yR3JvdXBUb05ld1dpbmRvdyc7XG5leHBvcnQgY29uc3QgQ09QWV9FRElUT1JfR1JPVVBfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jb3B5RWRpdG9yR3JvdXBUb05ld1dpbmRvdyc7XG5cbmV4cG9ydCBjb25zdCBORVdfRU1QVFlfRURJVE9SX1dJTkRPV19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubmV3RW1wdHlFZGl0b3JXaW5kb3cnO1xuXG5leHBvcnQgY29uc3QgQ0xPU0VfTU9EQUxfRURJVE9SX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jbG9zZU1vZGFsRWRpdG9yJztcbmV4cG9ydCBjb25zdCBNT1ZFX01PREFMX0VESVRPUl9UT19NQUlOX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlTW9kYWxFZGl0b3JUb01haW4nO1xuZXhwb3J0IGNvbnN0IE1PVkVfTU9EQUxfRURJVE9SX1RPX1dJTkRPV19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZU1vZGFsRWRpdG9yVG9XaW5kb3cnO1xuZXhwb3J0IGNvbnN0IFRPR0dMRV9NT0RBTF9FRElUT1JfTUFYSU1JWkVEX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVNb2RhbEVkaXRvck1heGltaXplZCc7XG5leHBvcnQgY29uc3QgTkFWSUdBVEVfTU9EQUxfRURJVE9SX1BSRVZJT1VTX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZU1vZGFsRWRpdG9yUHJldmlvdXMnO1xuZXhwb3J0IGNvbnN0IE5BVklHQVRFX01PREFMX0VESVRPUl9ORVhUX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZU1vZGFsRWRpdG9yTmV4dCc7XG5leHBvcnQgY29uc3QgVE9HR0xFX01PREFMX0VESVRPUl9TSURFQkFSX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVNb2RhbEVkaXRvclNpZGViYXInO1xuXG5leHBvcnQgY29uc3QgQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgPSAnX3dvcmtiZW5jaC5vcGVuJztcbmV4cG9ydCBjb25zdCBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lEID0gJ193b3JrYmVuY2guZGlmZic7XG5leHBvcnQgY29uc3QgQVBJX09QRU5fV0lUSF9FRElUT1JfQ09NTUFORF9JRCA9ICdfd29ya2JlbmNoLm9wZW5XaXRoJztcblxuZXhwb3J0IGNvbnN0IEVESVRPUl9DT1JFX05BVklHQVRJT05fQ09NTUFORFMgPSBbXG5cdFNQTElUX0VESVRPUixcblx0Q0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFVOUElOX0VESVRPUl9DT01NQU5EX0lELFxuXHRVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCxcblx0VE9HR0xFX01BWElNSVpFX0VESVRPUl9HUk9VUFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyB7XG5cdHRvPzogJ2ZpcnN0JyB8ICdsYXN0JyB8ICdsZWZ0JyB8ICdyaWdodCcgfCAndXAnIHwgJ2Rvd24nIHwgJ2NlbnRlcicgfCAncG9zaXRpb24nIHwgJ3ByZXZpb3VzJyB8ICduZXh0Jztcblx0Ynk/OiAndGFiJyB8ICdncm91cCc7XG5cdHZhbHVlPzogbnVtYmVyO1xufVxuXG5jb25zdCBpc1NlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJnID0gZnVuY3Rpb24gKGFyZzogU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMpOiBib29sZWFuIHtcblx0aWYgKCFpc09iamVjdChhcmcpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKCFpc1N0cmluZyhhcmcudG8pKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKCFpc1VuZGVmaW5lZChhcmcuYnkpICYmICFpc1N0cmluZyhhcmcuYnkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKCFpc1VuZGVmaW5lZChhcmcudmFsdWUpICYmICFpc051bWJlcihhcmcudmFsdWUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59O1xuXG5mdW5jdGlvbiByZWdpc3RlckVkaXRvck1vdmVDb3B5Q29tbWFuZCgpOiB2b2lkIHtcblxuXHRjb25zdCBtb3ZlQ29weUpTT05TY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0J3JlcXVpcmVkJzogWyd0byddLFxuXHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0J3RvJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZW51bSc6IFsnbGVmdCcsICdyaWdodCddXG5cdFx0XHR9LFxuXHRcdFx0J2J5Jzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZW51bSc6IFsndGFiJywgJ2dyb3VwJ11cblx0XHRcdH0sXG5cdFx0XHQndmFsdWUnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ251bWJlcidcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IE1PVkVfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRwcmltYXJ5OiAwLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJncykgPT4gbW92ZUNvcHlTZWxlY3RlZEVkaXRvcnModHJ1ZSwgYXJncyBhcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyB8IHVuZGVmaW5lZCwgYWNjZXNzb3IpLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2VkaXRvckNvbW1hbmQuYWN0aXZlRWRpdG9yTW92ZS5kZXNjcmlwdGlvbicsIFwiTW92ZSB0aGUgYWN0aXZlIGVkaXRvciBieSB0YWJzIG9yIGdyb3Vwc1wiKSxcblx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdlZGl0b3JDb21tYW5kLmFjdGl2ZUVkaXRvck1vdmUuYXJnLm5hbWUnLCBcIkFjdGl2ZSBlZGl0b3IgbW92ZSBhcmd1bWVudFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2VkaXRvckNvbW1hbmQuYWN0aXZlRWRpdG9yTW92ZS5hcmcuZGVzY3JpcHRpb24nLCBcIkFyZ3VtZW50IFByb3BlcnRpZXM6XFxuXFx0KiAndG8nOiBTdHJpbmcgdmFsdWUgcHJvdmlkaW5nIHdoZXJlIHRvIG1vdmUuXFxuXFx0KiAnYnknOiBTdHJpbmcgdmFsdWUgcHJvdmlkaW5nIHRoZSB1bml0IGZvciBtb3ZlIChieSB0YWIgb3IgYnkgZ3JvdXApLlxcblxcdCogJ3ZhbHVlJzogTnVtYmVyIHZhbHVlIHByb3ZpZGluZyBob3cgbWFueSBwb3NpdGlvbnMgb3IgYW4gYWJzb2x1dGUgcG9zaXRpb24gdG8gbW92ZS5cIiksXG5cdFx0XHRcdFx0Y29uc3RyYWludDogaXNTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZyxcblx0XHRcdFx0XHRzY2hlbWE6IG1vdmVDb3B5SlNPTlNjaGVtYVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ09QWV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdHByaW1hcnk6IDAsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzKSA9PiBtb3ZlQ29weVNlbGVjdGVkRWRpdG9ycyhmYWxzZSwgYXJncyBhcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyB8IHVuZGVmaW5lZCwgYWNjZXNzb3IpLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2VkaXRvckNvbW1hbmQuYWN0aXZlRWRpdG9yQ29weS5kZXNjcmlwdGlvbicsIFwiQ29weSB0aGUgYWN0aXZlIGVkaXRvciBieSBncm91cHNcIiksXG5cdFx0XHRhcmdzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnZWRpdG9yQ29tbWFuZC5hY3RpdmVFZGl0b3JDb3B5LmFyZy5uYW1lJywgXCJBY3RpdmUgZWRpdG9yIGNvcHkgYXJndW1lbnRcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlZGl0b3JDb21tYW5kLmFjdGl2ZUVkaXRvckNvcHkuYXJnLmRlc2NyaXB0aW9uJywgXCJBcmd1bWVudCBQcm9wZXJ0aWVzOlxcblxcdCogJ3RvJzogU3RyaW5nIHZhbHVlIHByb3ZpZGluZyB3aGVyZSB0byBjb3B5LlxcblxcdCogJ3ZhbHVlJzogTnVtYmVyIHZhbHVlIHByb3ZpZGluZyBob3cgbWFueSBwb3NpdGlvbnMgb3IgYW4gYWJzb2x1dGUgcG9zaXRpb24gdG8gY29weS5cIiksXG5cdFx0XHRcdFx0Y29uc3RyYWludDogaXNTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZyxcblx0XHRcdFx0XHRzY2hlbWE6IG1vdmVDb3B5SlNPTlNjaGVtYVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHR9KTtcblxuXHRbXG5cdFx0eyBpZDogTU9WRV9FRElUT1JfSU5UT19BQk9WRV9HUk9VUCwgdG86ICd1cCcgYXMgY29uc3QgfSxcblx0XHR7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0JFTE9XX0dST1VQLCB0bzogJ2Rvd24nIGFzIGNvbnN0IH0sXG5cdFx0eyBpZDogTU9WRV9FRElUT1JfSU5UT19MRUZUX0dST1VQLCB0bzogJ2xlZnQnIGFzIGNvbnN0IH0sXG5cdFx0eyBpZDogTU9WRV9FRElUT1JfSU5UT19SSUdIVF9HUk9VUCwgdG86ICdyaWdodCcgYXMgY29uc3QgfVxuXHRdLmZvckVhY2goKHsgaWQsIHRvIH0pID0+IHtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChpZCwgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdGlmIChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdG1vdmVDb3B5RWRpdG9yc1RvR3JvdXAodHJ1ZSwgeyB0bywgYnk6ICdncm91cCcgfSwgcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdLmdyb3VwLCByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF0uZWRpdG9ycywgYWNjZXNzb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBtb3ZlQ29weVNlbGVjdGVkRWRpdG9ycyhpc01vdmU6IGJvb2xlYW4sIGFyZ3M6IFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzID0gT2JqZWN0LmNyZWF0ZShudWxsKSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhcmdzLnRvID0gYXJncy50byB8fCAncmlnaHQnO1xuXHRcdGFyZ3MuYnkgPSBhcmdzLmJ5IHx8ICd0YWInO1xuXHRcdGFyZ3MudmFsdWUgPSB0eXBlb2YgYXJncy52YWx1ZSA9PT0gJ251bWJlcicgPyBhcmdzLnZhbHVlIDogMTtcblxuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKS5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBzZWxlY3RlZEVkaXRvcnMgPSBhY3RpdmVHcm91cC5zZWxlY3RlZEVkaXRvcnM7XG5cdFx0aWYgKHNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzd2l0Y2ggKGFyZ3MuYnkpIHtcblx0XHRcdFx0Y2FzZSAndGFiJzpcblx0XHRcdFx0XHRpZiAoaXNNb3ZlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW92ZVRhYnMoYXJncywgYWN0aXZlR3JvdXAsIHNlbGVjdGVkRWRpdG9ycyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdncm91cCc6XG5cdFx0XHRcdFx0cmV0dXJuIG1vdmVDb3B5RWRpdG9yc1RvR3JvdXAoaXNNb3ZlLCBhcmdzLCBhY3RpdmVHcm91cCwgc2VsZWN0ZWRFZGl0b3JzLCBhY2Nlc3Nvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gbW92ZVRhYnMoYXJnczogU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMsIGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiB2b2lkIHtcblx0XHRjb25zdCB0byA9IGFyZ3MudG87XG5cdFx0aWYgKHRvID09PSAnZmlyc3QnIHx8IHRvID09PSAncmlnaHQnKSB7XG5cdFx0XHRlZGl0b3JzID0gWy4uLmVkaXRvcnNdLnJldmVyc2UoKTtcblx0XHR9IGVsc2UgaWYgKHRvID09PSAncG9zaXRpb24nICYmIChhcmdzLnZhbHVlID8/IDEpIDwgZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3JzWzBdKSkge1xuXHRcdFx0ZWRpdG9ycyA9IFsuLi5lZGl0b3JzXS5yZXZlcnNlKCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0bW92ZVRhYihhcmdzLCBncm91cCwgZWRpdG9yKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBtb3ZlVGFiKGFyZ3M6IFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzLCBncm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0bGV0IGluZGV4ID0gZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3IpO1xuXHRcdHN3aXRjaCAoYXJncy50bykge1xuXHRcdFx0Y2FzZSAnZmlyc3QnOlxuXHRcdFx0XHRpbmRleCA9IDA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbGFzdCc6XG5cdFx0XHRcdGluZGV4ID0gZ3JvdXAuY291bnQgLSAxO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2xlZnQnOlxuXHRcdFx0XHRpbmRleCA9IGluZGV4IC0gKGFyZ3MudmFsdWUgPz8gMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncmlnaHQnOlxuXHRcdFx0XHRpbmRleCA9IGluZGV4ICsgKGFyZ3MudmFsdWUgPz8gMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnY2VudGVyJzpcblx0XHRcdFx0aW5kZXggPSBNYXRoLnJvdW5kKGdyb3VwLmNvdW50IC8gMikgLSAxO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Bvc2l0aW9uJzpcblx0XHRcdFx0aW5kZXggPSAoYXJncy52YWx1ZSA/PyAxKSAtIDE7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGluZGV4ID0gaW5kZXggPCAwID8gMCA6IGluZGV4ID49IGdyb3VwLmNvdW50ID8gZ3JvdXAuY291bnQgLSAxIDogaW5kZXg7XG5cdFx0Z3JvdXAubW92ZUVkaXRvcihlZGl0b3IsIGdyb3VwLCB7IGluZGV4IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gbW92ZUNvcHlFZGl0b3JzVG9Hcm91cChpc01vdmU6IGJvb2xlYW4sIGFyZ3M6IFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzLCBzb3VyY2VHcm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3JzOiBFZGl0b3JJbnB1dFtdLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRsZXQgdGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZDtcblxuXHRcdHN3aXRjaCAoYXJncy50bykge1xuXHRcdFx0Y2FzZSAnbGVmdCc6XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5maW5kR3JvdXAoeyBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLkxFRlQgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwLCBHcm91cERpcmVjdGlvbi5MRUZUKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3JpZ2h0Jzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uUklHSFQgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICd1cCc6XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5maW5kR3JvdXAoeyBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLlVQIH0sIHNvdXJjZUdyb3VwKTtcblx0XHRcdFx0aWYgKCF0YXJnZXRHcm91cCkge1xuXHRcdFx0XHRcdHRhcmdldEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5hZGRHcm91cChzb3VyY2VHcm91cCwgR3JvdXBEaXJlY3Rpb24uVVApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZG93bic6XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5maW5kR3JvdXAoeyBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLkRPV04gfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2ZpcnN0Jzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLkZJUlNUIH0sIHNvdXJjZUdyb3VwKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdsYXN0Jzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLkxBU1QgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3ByZXZpb3VzJzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLlBSRVZJT1VTIH0sIHNvdXJjZUdyb3VwKTtcblx0XHRcdFx0aWYgKCF0YXJnZXRHcm91cCkge1xuXHRcdFx0XHRcdGNvbnN0IG9wcG9zaXRlRGlyZWN0aW9uID0gcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PT0gR3JvdXBEaXJlY3Rpb24uUklHSFQgPyBHcm91cERpcmVjdGlvbi5MRUZUIDogR3JvdXBEaXJlY3Rpb24uVVA7XG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwLCBvcHBvc2l0ZURpcmVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICduZXh0Jzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLk5FWFQgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwLCBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2NlbnRlcic6XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKVsoZWRpdG9yR3JvdXBzU2VydmljZS5jb3VudCAvIDIpIC0gMV07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncG9zaXRpb24nOlxuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSlbKGFyZ3MudmFsdWUgPz8gMSkgLSAxXTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldEdyb3VwKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JzV2l0aE9wdGlvbnMgPSBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzKHNvdXJjZUdyb3VwLCBlZGl0b3JzKTtcblx0XHRcdGlmIChpc01vdmUpIHtcblx0XHRcdFx0c291cmNlR3JvdXAubW92ZUVkaXRvcnMoZWRpdG9yc1dpdGhPcHRpb25zLCB0YXJnZXRHcm91cCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNvdXJjZUdyb3VwLmlkICE9PSB0YXJnZXRHcm91cC5pZCkge1xuXHRcdFx0XHRzb3VyY2VHcm91cC5jb3B5RWRpdG9ycyhlZGl0b3JzV2l0aE9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHRcdH1cblxuXHRcdFx0dGFyZ2V0R3JvdXAuZm9jdXMoKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJFZGl0b3JHcm91cHNMYXlvdXRDb21tYW5kcygpOiB2b2lkIHtcblxuXHRmdW5jdGlvbiBhcHBseUVkaXRvckxheW91dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbGF5b3V0OiBFZGl0b3JHcm91cExheW91dCk6IHZvaWQge1xuXHRcdGlmICghbGF5b3V0IHx8IHR5cGVvZiBsYXlvdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0ZWRpdG9yR3JvdXBzU2VydmljZS5hcHBseUxheW91dChsYXlvdXQpO1xuXHR9XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoTEFZT1VUX0VESVRPUl9HUk9VUFNfQ09NTUFORF9JRCwgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBFZGl0b3JHcm91cExheW91dCkgPT4ge1xuXHRcdGFwcGx5RWRpdG9yTGF5b3V0KGFjY2Vzc29yLCBhcmdzKTtcblx0fSk7XG5cblx0Ly8gQVBJIENvbW1hbmRzXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRpZDogJ3ZzY29kZS5zZXRFZGl0b3JMYXlvdXQnLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogRWRpdG9yR3JvdXBMYXlvdXQpID0+IGFwcGx5RWRpdG9yTGF5b3V0KGFjY2Vzc29yLCBhcmdzKSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogYFNldCB0aGUgZWRpdG9yIGxheW91dC4gRWRpdG9yIGxheW91dCBpcyByZXByZXNlbnRlZCBhcyBhIHRyZWUgb2YgZ3JvdXBzIGluIHdoaWNoIHRoZSBmaXJzdCBncm91cCBpcyB0aGUgcm9vdCBncm91cCBvZiB0aGUgbGF5b3V0LlxuXHRcdFx0XHRcdFRoZSBvcmllbnRhdGlvbiBvZiB0aGUgZmlyc3QgZ3JvdXAgaXMgMCAoaG9yaXpvbnRhbCkgYnkgZGVmYXVsdCB1bmxlc3Mgc3BlY2lmaWVkIG90aGVyd2lzZS4gVGhlIG90aGVyIG9yaWVudGF0aW9ucyBhcmUgMSAodmVydGljYWwpLlxuXHRcdFx0XHRcdFRoZSBvcmllbnRhdGlvbiBvZiBzdWJzZXF1ZW50IGdyb3VwcyBpcyB0aGUgb3Bwb3NpdGUgb2YgdGhlIG9yaWVudGF0aW9uIG9mIHRoZSBncm91cCB0aGF0IGNvbnRhaW5zIGl0LlxuXHRcdFx0XHRcdEhlcmUgYXJlIHNvbWUgZXhhbXBsZXM6IEEgbGF5b3V0IHJlcHJlc2VudGluZyAxIHJvdyBhbmQgMiBjb2x1bW5zOiB7IG9yaWVudGF0aW9uOiAwLCBncm91cHM6IFt7fSwge31dIH0uXG5cdFx0XHRcdFx0QSBsYXlvdXQgcmVwcmVzZW50aW5nIDMgcm93cyBhbmQgMSBjb2x1bW46IHsgb3JpZW50YXRpb246IDEsIGdyb3VwczogW3t9LCB7fSwge31dIH0uXG5cdFx0XHRcdFx0QSBsYXlvdXQgcmVwcmVzZW50aW5nIDMgcm93cyBhbmQgMSBjb2x1bW4gaW4gd2hpY2ggdGhlIHNlY29uZCByb3cgaGFzIDIgY29sdW1uczogeyBvcmllbnRhdGlvbjogMSwgZ3JvdXBzOiBbe30sIHsgZ3JvdXBzOiBbe30sIHt9XSB9LCB7fV0gfVxuXHRcdFx0XHRcdGAsXG5cdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J3JlcXVpcmVkJzogWydncm91cHMnXSxcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCdvcmllbnRhdGlvbic6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0J2RlZmF1bHQnOiAwLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBgVGhlIG9yaWVudGF0aW9uIG9mIHRoZSByb290IGdyb3VwIGluIHRoZSBsYXlvdXQuIDAgZm9yIGhvcml6b250YWwsIDEgZm9yIHZlcnRpY2FsLmAsXG5cdFx0XHRcdFx0XHRcdCdlbnVtJzogWzAsIDFdLFxuXHRcdFx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZWRpdG9yR3JvdXBMYXlvdXQuaG9yaXpvbnRhbCcsIFwiSG9yaXpvbnRhbFwiKSxcblx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZWRpdG9yR3JvdXBMYXlvdXQudmVydGljYWwnLCBcIlZlcnRpY2FsXCIpXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2dyb3Vwcyc6IHtcblx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy9kZWZpbml0aW9ucy9lZGl0b3JHcm91cHNTY2hlbWEnLFxuXHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IFt7fSwge31dXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XVxuXHRcdH1cblx0fSk7XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiAndnNjb2RlLmdldEVkaXRvckxheW91dCcsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdFx0cmV0dXJuIGVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0TGF5b3V0KCk7XG5cdFx0fSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246ICdHZXQgRWRpdG9yIExheW91dCcsXG5cdFx0XHRhcmdzOiBbXSxcblx0XHRcdHJldHVybnM6ICdBbiBlZGl0b3IgbGF5b3V0IG9iamVjdCwgaW4gdGhlIHNhbWUgZm9ybWF0IGFzIHZzY29kZS5zZXRFZGl0b3JMYXlvdXQnXG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJPcGVuRWRpdG9yQVBJQ29tbWFuZHMoKTogdm9pZCB7XG5cblx0ZnVuY3Rpb24gbWl4aW5Db250ZXh0KGNvbnRleHQ6IElPcGVuRXZlbnQ8dW5rbm93bj4gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29sdW1uOiBFZGl0b3JHcm91cENvbHVtbiB8IHVuZGVmaW5lZCk6IFtJVGV4dEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIEVkaXRvckdyb3VwQ29sdW1uIHwgdW5kZWZpbmVkXSB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gW29wdGlvbnMsIGNvbHVtbl07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtcblx0XHRcdHsgLi4uY29udGV4dC5lZGl0b3JPcHRpb25zLCAuLi4ob3B0aW9ucyA/PyBPYmplY3QuY3JlYXRlKG51bGwpKSB9LFxuXHRcdFx0Y29udGV4dC5zaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IGNvbHVtblxuXHRcdF07XG5cdH1cblxuXHQvLyBwYXJ0aWFsLCByZW5kZXJlci1zaWRlIEFQSSBjb21tYW5kIHRvIG9wZW4gZWRpdG9yIG9ubHkgc3VwcG9ydGluZ1xuXHQvLyBhcmd1bWVudHMgdGhhdCBkbyBub3QgbmVlZCB0byBiZSBjb252ZXJ0ZWQgZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0Ly8gY29tcGxlbWVudHMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi8yYjE2NGVmYjBlNmE1ZGUzODI2YmZmNjI2ODNlYWVhZmUwMzIyODRmL3NyYy92cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0QXBpQ29tbWFuZHMudHMjTDM3M1xuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0aWQ6ICd2c2NvZGUub3BlbicsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lELCBhcmcpO1xuXHRcdH0sXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiAnT3BlbnMgdGhlIHByb3ZpZGVkIHJlc291cmNlIGluIHRoZSBlZGl0b3IuJyxcblx0XHRcdGFyZ3M6IFt7IG5hbWU6ICdVcmknIH1dXG5cdFx0fVxuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCwgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZUFyZzogVXJpQ29tcG9uZW50cyB8IHN0cmluZywgY29sdW1uQW5kT3B0aW9ucz86IFtFZGl0b3JHcm91cENvbHVtbj8sIElUZXh0RWRpdG9yT3B0aW9ucz9dLCBsYWJlbD86IHN0cmluZywgY29udGV4dD86IElPcGVuRXZlbnQ8dW5rbm93bj4pIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBwYXRoU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGF0aFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZU9yU3RyaW5nID0gdHlwZW9mIHJlc291cmNlQXJnID09PSAnc3RyaW5nJyA/IHJlc291cmNlQXJnIDogVVJJLmZyb20ocmVzb3VyY2VBcmcsIHRydWUpO1xuXHRcdGNvbnN0IFtjb2x1bW5BcmcsIG9wdGlvbnNBcmddID0gY29sdW1uQW5kT3B0aW9ucyA/PyBbXTtcblxuXHRcdC8vIHVzZSBlZGl0b3Igb3B0aW9ucyBvciBlZGl0b3IgdmlldyBjb2x1bW4gb3IgcmVzb3VyY2Ugc2NoZW1lXG5cdFx0Ly8gYXMgYSBoaW50IHRvIHVzZSB0aGUgZWRpdG9yIHNlcnZpY2UgZm9yIG9wZW5pbmcgZGlyZWN0bHlcblx0XHRpZiAob3B0aW9uc0FyZyB8fCB0eXBlb2YgY29sdW1uQXJnID09PSAnbnVtYmVyJyB8fCBtYXRjaGVzU2NoZW1lKHJlc291cmNlT3JTdHJpbmcsIFNjaGVtYXMudW50aXRsZWQpKSB7XG5cdFx0XHRjb25zdCBbb3B0aW9ucywgY29sdW1uXSA9IG1peGluQ29udGV4dChjb250ZXh0LCBvcHRpb25zQXJnLCBjb2x1bW5BcmcpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuaXNVcmkocmVzb3VyY2VPclN0cmluZykgPyByZXNvdXJjZU9yU3RyaW5nIDogVVJJLnBhcnNlKHJlc291cmNlT3JTdHJpbmcpO1xuXG5cdFx0XHRsZXQgaW5wdXQ6IElSZXNvdXJjZUVkaXRvcklucHV0IHwgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdFx0XHRpZiAodW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5pc1VudGl0bGVkV2l0aEFzc29jaWF0ZWRSZXNvdXJjZShyZXNvdXJjZSkpIHtcblx0XHRcdFx0Ly8gc3BlY2lhbCBjYXNlIGZvciB1bnRpdGxlZDogd2UgYXJlIGdldHRpbmcgYSByZXNvdXJjZSB3aXRoIG1lYW5pbmdmdWxcblx0XHRcdFx0Ly8gcGF0aCBmcm9tIGFuIGV4dGVuc2lvbiB0byB1c2UgZm9yIHRoZSB1bnRpdGxlZCBlZGl0b3IuIGFzIHN1Y2gsIHdlXG5cdFx0XHRcdC8vIGhhdmUgdG8gYXNzdW1lIGl0IGFzIGFuIGFzc29jaWF0ZWQgcmVzb3VyY2UgdG8gdXNlIHdoZW4gc2F2aW5nLiB3ZVxuXHRcdFx0XHQvLyBkbyBzbyBieSBzZXR0aW5nIHRoZSBgZm9yY2VVbnRpdGxlZDogdHJ1ZWAgYW5kIGNoYW5naW5nIHRoZSBzY2hlbWVcblx0XHRcdFx0Ly8gdG8gYSBmaWxlIGJhc2VkIG9uZS4gdGhlIHVudGl0bGVkIGVkaXRvciBzZXJ2aWNlIHRha2VzIGNhcmUgdG9cblx0XHRcdFx0Ly8gYXNzb2NpYXRlIHRoZSBwYXRoIHByb3Blcmx5IHRoZW4uXG5cdFx0XHRcdGlucHV0ID0geyByZXNvdXJjZTogcmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogcGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSB9KSwgZm9yY2VVbnRpdGxlZDogdHJ1ZSwgb3B0aW9ucywgbGFiZWwgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHVzZSBhbnkgb3RoZXIgcmVzb3VyY2UgYXMgaXNcblx0XHRcdFx0aW5wdXQgPSB7IHJlc291cmNlLCBvcHRpb25zLCBsYWJlbCB9O1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIGNvbHVtblRvRWRpdG9yR3JvdXAoZWRpdG9yR3JvdXBzU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbHVtbikpO1xuXHRcdH1cblxuXHRcdC8vIGRvIG5vdCBhbGxvdyB0byBleGVjdXRlIGNvbW1hbmRzIGZyb20gaGVyZVxuXHRcdGVsc2UgaWYgKG1hdGNoZXNTY2hlbWUocmVzb3VyY2VPclN0cmluZywgU2NoZW1hcy5jb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGZpbmFsbHksIGRlbGVnYXRlIHRvIG9wZW5lciBzZXJ2aWNlXG5cdFx0ZWxzZSB7XG5cdFx0XHRhd2FpdCBvcGVuZXJTZXJ2aWNlLm9wZW4ocmVzb3VyY2VPclN0cmluZywgeyBvcGVuVG9TaWRlOiBjb250ZXh0Py5zaWRlQnlTaWRlLCBlZGl0b3JPcHRpb25zOiBjb250ZXh0Py5lZGl0b3JPcHRpb25zIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gcGFydGlhbCwgcmVuZGVyZXItc2lkZSBBUEkgY29tbWFuZCB0byBvcGVuIGRpZmYgZWRpdG9yIG9ubHkgc3VwcG9ydGluZ1xuXHQvLyBhcmd1bWVudHMgdGhhdCBkbyBub3QgbmVlZCB0byBiZSBjb252ZXJ0ZWQgZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0Ly8gY29tcGxlbWVudHMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi8yYjE2NGVmYjBlNmE1ZGUzODI2YmZmNjI2ODNlYWVhZmUwMzIyODRmL3NyYy92cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0QXBpQ29tbWFuZHMudHMjTDM5N1xuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0aWQ6ICd2c2NvZGUuZGlmZicsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBsZWZ0LCByaWdodCwgbGFiZWwpID0+IHtcblx0XHRcdGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsIGxlZnQsIHJpZ2h0LCBsYWJlbCk7XG5cdFx0fSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246ICdPcGVucyB0aGUgcHJvdmlkZWQgcmVzb3VyY2VzIGluIHRoZSBkaWZmIGVkaXRvciB0byBjb21wYXJlIHRoZWlyIGNvbnRlbnRzLicsXG5cdFx0XHRhcmdzOiBbXG5cdFx0XHRcdHsgbmFtZTogJ2xlZnQnLCBkZXNjcmlwdGlvbjogJ0xlZnQtaGFuZCBzaWRlIHJlc291cmNlIG9mIHRoZSBkaWZmIGVkaXRvcicgfSxcblx0XHRcdFx0eyBuYW1lOiAncmlnaHQnLCBkZXNjcmlwdGlvbjogJ1JpZ2h0LWhhbmQgc2lkZSByZXNvdXJjZSBvZiB0aGUgZGlmZiBlZGl0b3InIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3RpdGxlJywgZGVzY3JpcHRpb246ICdIdW1hbiByZWFkYWJsZSB0aXRsZSBmb3IgdGhlIGRpZmYgZWRpdG9yJyB9LFxuXHRcdFx0XVxuXHRcdH1cblx0fSk7XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcmlnaW5hbFJlc291cmNlOiBVcmlDb21wb25lbnRzLCBtb2RpZmllZFJlc291cmNlOiBVcmlDb21wb25lbnRzLCBsYWJlbEFuZE9yRGVzY3JpcHRpb24/OiBzdHJpbmcgfCB7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfSwgY29sdW1uQW5kT3B0aW9ucz86IFtFZGl0b3JHcm91cENvbHVtbj8sIElUZXh0RWRpdG9yT3B0aW9ucz9dLCBjb250ZXh0PzogSU9wZW5FdmVudDx1bmtub3duPikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBbY29sdW1uQXJnLCBvcHRpb25zQXJnXSA9IGNvbHVtbkFuZE9wdGlvbnMgPz8gW107XG5cdFx0Y29uc3QgW29wdGlvbnMsIGNvbHVtbl0gPSBtaXhpbkNvbnRleHQoY29udGV4dCwgb3B0aW9uc0FyZywgY29sdW1uQXJnKTtcblxuXHRcdGxldCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgbGFiZWxBbmRPckRlc2NyaXB0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0bGFiZWwgPSBsYWJlbEFuZE9yRGVzY3JpcHRpb247XG5cdFx0fSBlbHNlIGlmIChsYWJlbEFuZE9yRGVzY3JpcHRpb24pIHtcblx0XHRcdGxhYmVsID0gbGFiZWxBbmRPckRlc2NyaXB0aW9uLmxhYmVsO1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBsYWJlbEFuZE9yRGVzY3JpcHRpb24uZGVzY3JpcHRpb247XG5cdFx0fVxuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZnJvbShvcmlnaW5hbFJlc291cmNlLCB0cnVlKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5mcm9tKG1vZGlmaWVkUmVzb3VyY2UsIHRydWUpIH0sXG5cdFx0XHRsYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0b3B0aW9uc1xuXHRcdH0sIGNvbHVtblRvRWRpdG9yR3JvdXAoZWRpdG9yR3JvdXBzU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbHVtbikpO1xuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBUElfT1BFTl9XSVRIX0VESVRPUl9DT01NQU5EX0lELCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBpZDogc3RyaW5nLCBjb2x1bW5BbmRPcHRpb25zPzogW0VkaXRvckdyb3VwQ29sdW1uPywgSVRleHRFZGl0b3JPcHRpb25zP10pID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgW2NvbHVtbkFyZywgb3B0aW9uc0FyZ10gPSBjb2x1bW5BbmRPcHRpb25zID8/IFtdO1xuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5mcm9tKHJlc291cmNlLCB0cnVlKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIC4uLm9wdGlvbnNBcmcsIG92ZXJyaWRlOiBpZCB9IH0sIGNvbHVtblRvRWRpdG9yR3JvdXAoZWRpdG9yR3JvdXBzU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbHVtbkFyZykpO1xuXHR9KTtcblxuXHQvLyBwYXJ0aWFsLCByZW5kZXJlci1zaWRlIEFQSSBjb21tYW5kIHRvIG9wZW4gZGlmZiBlZGl0b3Igb25seSBzdXBwb3J0aW5nXG5cdC8vIGFyZ3VtZW50cyB0aGF0IGRvIG5vdCBuZWVkIHRvIGJlIGNvbnZlcnRlZCBmcm9tIHRoZSBleHRlbnNpb24gaG9zdFxuXHQvLyBjb21wbGVtZW50cyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzJiMTY0ZWZiMGU2YTVkZTM4MjZiZmY2MjY4M2VhZWFmZTAzMjI4NGYvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RBcGlDb21tYW5kcy50cyNMMzk3XG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRpZDogJ3ZzY29kZS5jaGFuZ2VzJyxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIHRpdGxlOiBzdHJpbmcsIHJlc291cmNlczogW1VyaUNvbXBvbmVudHMsIFVyaUNvbXBvbmVudHM/LCBVcmlDb21wb25lbnRzP11bXSkgPT4ge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ193b3JrYmVuY2guY2hhbmdlcycsIHRpdGxlLCByZXNvdXJjZXMpO1xuXHRcdH0sXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiAnT3BlbnMgYSBsaXN0IG9mIHJlc291cmNlcyBpbiB0aGUgY2hhbmdlcyBlZGl0b3IgdG8gY29tcGFyZSB0aGVpciBjb250ZW50cy4nLFxuXHRcdFx0YXJnczogW1xuXHRcdFx0XHR7IG5hbWU6ICd0aXRsZScsIGRlc2NyaXB0aW9uOiAnSHVtYW4gcmVhZGFibGUgdGl0bGUgZm9yIHRoZSBkaWZmIGVkaXRvcicgfSxcblx0XHRcdFx0eyBuYW1lOiAncmVzb3VyY2VzJywgZGVzY3JpcHRpb246ICdMaXN0IG9mIHJlc291cmNlcyB0byBvcGVuIGluIHRoZSBjaGFuZ2VzIGVkaXRvcicgfVxuXHRcdFx0XVxuXHRcdH1cblx0fSk7XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ193b3JrYmVuY2guY2hhbmdlcycsIGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdGl0bGU6IHN0cmluZywgcmVzb3VyY2VzOiBbVXJpQ29tcG9uZW50cywgVXJpQ29tcG9uZW50cz8sIFVyaUNvbXBvbmVudHM/XVtdKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBlZGl0b3I6IChJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQgJiB7IHJlc291cmNlOiBVUkkgfSlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2xhYmVsLCBvcmlnaW5hbCwgbW9kaWZpZWRdIG9mIHJlc291cmNlcykge1xuXHRcdFx0ZWRpdG9yLnB1c2goe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZShsYWJlbCksXG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkucmV2aXZlKG9yaWdpbmFsKSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLnJldml2ZShtb2RpZmllZCkgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlczogZWRpdG9yLCBsYWJlbDogdGl0bGUgfSk7XG5cdH0pO1xuXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfd29ya2JlbmNoLm9wZW5NdWx0aURpZmZFZGl0b3InLCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM6IE9wZW5NdWx0aUZpbGVEaWZmRWRpdG9yT3B0aW9ucykgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gb3B0aW9ucy5yZXNvdXJjZXM/Lm1hcChyID0+ICh7IG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkucmV2aXZlKHIub3JpZ2luYWxVcmkpIH0sIG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkucmV2aXZlKHIubW9kaWZpZWRVcmkpIH0gfSkpO1xuXG5cdFx0Y29uc3QgcmV2ZWFsVXJpID0gb3B0aW9ucy5yZXZlYWw/Lm1vZGlmaWVkVXJpID8gVVJJLnJldml2ZShvcHRpb25zLnJldmVhbC5tb2RpZmllZFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmV2ZWFsUmVzb3VyY2UgPSByZXZlYWxVcmkgJiYgcmVzb3VyY2VzID8gcmVzb3VyY2VzLmZpbmQociA9PiBpc0VxdWFsKHIubW9kaWZpZWQucmVzb3VyY2UsIHJldmVhbFVyaSkpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zLnJldmVhbCAmJiAhcmV2ZWFsUmVzb3VyY2UpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1JldmVhbCByZXNvdXJjZSBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBtdWx0aURpZmZFZGl0b3JPcHRpb25zOiBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdHZpZXdTdGF0ZTogcmV2ZWFsUmVzb3VyY2UgPyB7XG5cdFx0XHRcdHJldmVhbERhdGE6IHtcblx0XHRcdFx0XHRyZXNvdXJjZToge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHJldmVhbFJlc291cmNlLm9yaWdpbmFsLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHJldmVhbFJlc291cmNlLm1vZGlmaWVkLnJlc291cmNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmFuZ2U6IG9wdGlvbnMucmV2ZWFsPy5yYW5nZSxcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0bXVsdGlEaWZmU291cmNlOiBvcHRpb25zLm11bHRpRGlmZlNvdXJjZVVyaSA/IFVSSS5yZXZpdmUob3B0aW9ucy5tdWx0aURpZmZTb3VyY2VVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVzb3VyY2VzLFxuXHRcdFx0bGFiZWw6IG9wdGlvbnMudGl0bGUsXG5cdFx0XHRvcHRpb25zOiBtdWx0aURpZmZFZGl0b3JPcHRpb25zLFxuXHRcdH0pO1xuXHR9KTtcbn1cblxuaW50ZXJmYWNlIE9wZW5NdWx0aUZpbGVEaWZmRWRpdG9yT3B0aW9ucyB7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdG11bHRpRGlmZlNvdXJjZVVyaT86IFVyaUNvbXBvbmVudHM7XG5cdHJlc291cmNlcz86IHsgb3JpZ2luYWxVcmk6IFVyaUNvbXBvbmVudHM7IG1vZGlmaWVkVXJpOiBVcmlDb21wb25lbnRzIH1bXTtcblx0cmV2ZWFsPzoge1xuXHRcdG1vZGlmaWVkVXJpOiBVcmlDb21wb25lbnRzO1xuXHRcdHJhbmdlPzogSVJhbmdlO1xuXHR9O1xufVxuXG5mdW5jdGlvbiByZWdpc3Rlck9wZW5FZGl0b3JBdEluZGV4Q29tbWFuZHMoKTogdm9pZCB7XG5cdGNvbnN0IG9wZW5FZGl0b3JBdEluZGV4OiBJQ29tbWFuZEhhbmRsZXIgPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvckluZGV4OiB1bmtub3duKTogdm9pZCA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSAmJiB0eXBlb2YgZWRpdG9ySW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBhY3RpdmVFZGl0b3JQYW5lLmdyb3VwLmdldEVkaXRvckJ5SW5kZXgoZWRpdG9ySW5kZXgpO1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZWRpdG9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0Ly8gVGhpcyBjb21tYW5kIHRha2VzIGluIHRoZSBlZGl0b3IgaW5kZXggbnVtYmVyIHRvIG9wZW4gYXMgYW4gYXJndW1lbnRcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiBPUEVOX0VESVRPUl9BVF9JTkRFWF9DT01NQU5EX0lELFxuXHRcdGhhbmRsZXI6IG9wZW5FZGl0b3JBdEluZGV4XG5cdH0pO1xuXG5cdC8vIEtleWJpbmRpbmdzIHRvIGZvY3VzIGEgc3BlY2lmaWMgaW5kZXggaW4gdGhlIHRhYiBmb2xkZXIgaWYgdGFicyBhcmUgZW5hYmxlZFxuXHRmb3IgKGxldCBpID0gMDsgaSA8IDk7IGkrKykge1xuXHRcdGNvbnN0IGVkaXRvckluZGV4ID0gaTtcblx0XHRjb25zdCB2aXNpYmxlSW5kZXggPSBpICsgMTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IE9QRU5fRURJVE9SX0FUX0lOREVYX0NPTU1BTkRfSUQgKyB2aXNpYmxlSW5kZXgsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCB0b0tleUNvZGUodmlzaWJsZUluZGV4KSxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IHRvS2V5Q29kZSh2aXNpYmxlSW5kZXgpIH0sXG5cdFx0XHRoYW5kbGVyOiBhY2Nlc3NvciA9PiBvcGVuRWRpdG9yQXRJbmRleChhY2Nlc3NvciwgZWRpdG9ySW5kZXgpXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b0tleUNvZGUoaW5kZXg6IG51bWJlcik6IEtleUNvZGUge1xuXHRcdHN3aXRjaCAoaW5kZXgpIHtcblx0XHRcdGNhc2UgMDogcmV0dXJuIEtleUNvZGUuRGlnaXQwO1xuXHRcdFx0Y2FzZSAxOiByZXR1cm4gS2V5Q29kZS5EaWdpdDE7XG5cdFx0XHRjYXNlIDI6IHJldHVybiBLZXlDb2RlLkRpZ2l0Mjtcblx0XHRcdGNhc2UgMzogcmV0dXJuIEtleUNvZGUuRGlnaXQzO1xuXHRcdFx0Y2FzZSA0OiByZXR1cm4gS2V5Q29kZS5EaWdpdDQ7XG5cdFx0XHRjYXNlIDU6IHJldHVybiBLZXlDb2RlLkRpZ2l0NTtcblx0XHRcdGNhc2UgNjogcmV0dXJuIEtleUNvZGUuRGlnaXQ2O1xuXHRcdFx0Y2FzZSA3OiByZXR1cm4gS2V5Q29kZS5EaWdpdDc7XG5cdFx0XHRjYXNlIDg6IHJldHVybiBLZXlDb2RlLkRpZ2l0ODtcblx0XHRcdGNhc2UgOTogcmV0dXJuIEtleUNvZGUuRGlnaXQ5O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpbmRleCcpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyRm9jdXNFZGl0b3JHcm91cEF0SW5kZXhDb21tYW5kcygpOiB2b2lkIHtcblxuXHQvLyBLZXliaW5kaW5ncyB0byBmb2N1cyBhIHNwZWNpZmljIGdyb3VwICgyLTgpIGluIHRoZSBlZGl0b3IgYXJlYVxuXHRmb3IgKGxldCBncm91cEluZGV4ID0gMTsgZ3JvdXBJbmRleCA8IDg7IGdyb3VwSW5kZXgrKykge1xuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IHRvQ29tbWFuZElkKGdyb3VwSW5kZXgpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IHRvS2V5Q29kZShncm91cEluZGV4KSxcblx0XHRcdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0Ly8gVG8ga2VlcCBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSAocHJlLWdyaWQpLCBhbGxvdyB0byBmb2N1cyBhIGdyb3VwXG5cdFx0XHRcdC8vIHRoYXQgZG9lcyBub3QgZXhpc3QgYXMgbG9uZyBhcyBpdCBpcyB0aGUgbmV4dCBncm91cCBhZnRlciB0aGUgbGFzdFxuXHRcdFx0XHQvLyBvcGVuZWQgZ3JvdXAuIE90aGVyd2lzZSB3ZSByZXR1cm4uXG5cdFx0XHRcdGlmIChncm91cEluZGV4ID4gZWRpdG9yR3JvdXBzU2VydmljZS5jb3VudCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdyb3VwIGV4aXN0czoganVzdCBmb2N1c1xuXHRcdFx0XHRjb25zdCBncm91cHMgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpO1xuXHRcdFx0XHRpZiAoZ3JvdXBzW2dyb3VwSW5kZXhdKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdyb3Vwc1tncm91cEluZGV4XS5mb2N1cygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gR3JvdXAgZG9lcyBub3QgZXhpc3Q6IGNyZWF0ZSBuZXcgYnkgc3BsaXR0aW5nIHRoZSBhY3RpdmUgb25lIG9mIHRoZSBsYXN0IGdyb3VwXG5cdFx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGxhc3RHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTEFTVCB9KTtcblx0XHRcdFx0aWYgKCFsYXN0R3JvdXApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXdHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAobGFzdEdyb3VwLCBkaXJlY3Rpb24pO1xuXG5cdFx0XHRcdC8vIEZvY3VzXG5cdFx0XHRcdG5ld0dyb3VwLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b0NvbW1hbmRJZChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGluZGV4KSB7XG5cdFx0XHRjYXNlIDE6IHJldHVybiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NlY29uZEVkaXRvckdyb3VwJztcblx0XHRcdGNhc2UgMjogcmV0dXJuICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzVGhpcmRFZGl0b3JHcm91cCc7XG5cdFx0XHRjYXNlIDM6IHJldHVybiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0ZvdXJ0aEVkaXRvckdyb3VwJztcblx0XHRcdGNhc2UgNDogcmV0dXJuICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRmlmdGhFZGl0b3JHcm91cCc7XG5cdFx0XHRjYXNlIDU6IHJldHVybiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NpeHRoRWRpdG9yR3JvdXAnO1xuXHRcdFx0Y2FzZSA2OiByZXR1cm4gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNTZXZlbnRoRWRpdG9yR3JvdXAnO1xuXHRcdFx0Y2FzZSA3OiByZXR1cm4gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNFaWdodGhFZGl0b3JHcm91cCc7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGluZGV4Jyk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b0tleUNvZGUoaW5kZXg6IG51bWJlcik6IEtleUNvZGUge1xuXHRcdHN3aXRjaCAoaW5kZXgpIHtcblx0XHRcdGNhc2UgMTogcmV0dXJuIEtleUNvZGUuRGlnaXQyO1xuXHRcdFx0Y2FzZSAyOiByZXR1cm4gS2V5Q29kZS5EaWdpdDM7XG5cdFx0XHRjYXNlIDM6IHJldHVybiBLZXlDb2RlLkRpZ2l0NDtcblx0XHRcdGNhc2UgNDogcmV0dXJuIEtleUNvZGUuRGlnaXQ1O1xuXHRcdFx0Y2FzZSA1OiByZXR1cm4gS2V5Q29kZS5EaWdpdDY7XG5cdFx0XHRjYXNlIDY6IHJldHVybiBLZXlDb2RlLkRpZ2l0Nztcblx0XHRcdGNhc2UgNzogcmV0dXJuIEtleUNvZGUuRGlnaXQ4O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpbmRleCcpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdEVkaXRvcihlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbiwgcmVzb2x2ZWRDb250ZXh0OiBJUmVzb2x2ZWRFZGl0b3JDb21tYW5kc0NvbnRleHQpOiB2b2lkIHtcblx0aWYgKCFyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gT25seSBzdXBwb3J0IHNwbGl0dGluZyBmcm9tIG9uZSBzb3VyY2UgZ3JvdXBcblx0Y29uc3QgeyBncm91cCwgZWRpdG9ycyB9ID0gcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdO1xuXHRjb25zdCBwcmVzZXJ2ZUZvY3VzID0gcmVzb2x2ZWRDb250ZXh0LnByZXNlcnZlRm9jdXM7XG5cdGNvbnN0IG5ld0dyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5hZGRHcm91cChncm91cCwgZGlyZWN0aW9uKTtcblxuXHRmb3IgKGNvbnN0IGVkaXRvclRvQ29weSBvZiBlZGl0b3JzKSB7XG5cblx0XHQvLyBTcGxpdCBlZGl0b3IgKGlmIGl0IGNhbiBiZSBzcGxpdClcblx0XHRpZiAoZWRpdG9yVG9Db3B5ICYmICFlZGl0b3JUb0NvcHkuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b24pKSB7XG5cdFx0XHRncm91cC5jb3B5RWRpdG9yKGVkaXRvclRvQ29weSwgbmV3R3JvdXAsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHR9XG5cdH1cblxuXHQvLyBGb2N1c1xuXHRuZXdHcm91cC5mb2N1cygpO1xufVxuXG5mdW5jdGlvbiByZWdpc3RlclNwbGl0RWRpdG9yQ29tbWFuZHMoKSB7XG5cdFtcblx0XHR7IGlkOiBTUExJVF9FRElUT1JfVVAsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uVVAgfSxcblx0XHR7IGlkOiBTUExJVF9FRElUT1JfRE9XTiwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5ET1dOIH0sXG5cdFx0eyBpZDogU1BMSVRfRURJVE9SX0xFRlQsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uTEVGVCB9LFxuXHRcdHsgaWQ6IFNQTElUX0VESVRPUl9SSUdIVCwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5SSUdIVCB9XG5cdF0uZm9yRWFjaCgoeyBpZCwgZGlyZWN0aW9uIH0pID0+IHtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChpZCwgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdHNwbGl0RWRpdG9yKGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGRpcmVjdGlvbiwgcmVzb2x2ZWRDb250ZXh0KTtcblx0XHR9KTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyQ2xvc2VFZGl0b3JDb21tYW5kcygpIHtcblxuXHQvLyBBIHNwZWNpYWwgaGFuZGxlciBmb3IgXCJDbG9zZSBFZGl0b3JcIiBkZXBlbmRpbmcgb24gY29udGV4dFxuXHQvLyAtIGtleWJpbmRpbmluZzogZG8gbm90IGNsb3NlIHN0aWNreSBlZGl0b3JzLCByYXRoZXIgb3BlbiB0aGUgbmV4dCBub24tc3RpY2t5IGVkaXRvclxuXHQvLyAtIG1lbnU6IGFsd2F5cyBjbG9zZSBlZGl0b3IsIGV2ZW4gc3RpY2t5IG9uZXNcblx0ZnVuY3Rpb24gY2xvc2VFZGl0b3JIYW5kbGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmb3JjZUNsb3NlU3RpY2t5RWRpdG9yczogYm9vbGVhbiwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRsZXQga2VlcFN0aWNreUVkaXRvcnM6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvcmNlQ2xvc2VTdGlja3lFZGl0b3JzKSB7XG5cdFx0XHRrZWVwU3RpY2t5RWRpdG9ycyA9IGZhbHNlOyAvLyBleHBsaWNpdGx5IGNsb3NlIHN0aWNreSBlZGl0b3JzXG5cdFx0fSBlbHNlIGlmIChhcmdzLmxlbmd0aCkge1xuXHRcdFx0a2VlcFN0aWNreUVkaXRvcnMgPSBmYWxzZTsgLy8gd2UgaGF2ZSBhIGNvbnRleHQsIGFzIHN1Y2ggdGhpcyBjb21tYW5kIHdhcyB1c2VkIGUuZy4gZnJvbSB0aGUgdGFiIGNvbnRleHQgbWVudVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRrZWVwU3RpY2t5RWRpdG9ycyA9IGVkaXRvckdyb3Vwc1NlcnZpY2UucGFydE9wdGlvbnMucHJldmVudFBpbm5lZEVkaXRvckNsb3NlID09PSAna2V5Ym9hcmQnIHx8IGVkaXRvckdyb3Vwc1NlcnZpY2UucGFydE9wdGlvbnMucHJldmVudFBpbm5lZEVkaXRvckNsb3NlID09PSAna2V5Ym9hcmRBbmRNb3VzZSc7IC8vIHJlc3BlY3Qgc2V0dGluZyBvdGhlcndpc2Vcblx0XHR9XG5cblx0XHQvLyBTa2lwIG92ZXIgc3RpY2t5IGVkaXRvciBhbmQgc2VsZWN0IG5leHQgaWYgd2UgYXJlIGNvbmZpZ3VyZWQgdG8gZG8gc29cblx0XHRpZiAoa2VlcFN0aWNreUVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcjtcblxuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvciAmJiBhY3RpdmVHcm91cC5pc1N0aWNreShhY3RpdmVFZGl0b3IpKSB7XG5cblx0XHRcdFx0Ly8gT3BlbiBuZXh0IHJlY2VudGx5IGFjdGl2ZSBpbiBzYW1lIGdyb3VwXG5cdFx0XHRcdGNvbnN0IG5leHROb25TdGlja3lFZGl0b3JJbkdyb3VwID0gYWN0aXZlR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KVswXTtcblx0XHRcdFx0aWYgKG5leHROb25TdGlja3lFZGl0b3JJbkdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGl2ZUdyb3VwLm9wZW5FZGl0b3IobmV4dE5vblN0aWNreUVkaXRvckluR3JvdXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3BlbiBuZXh0IHJlY2VudGx5IGFjdGl2ZSBhY3Jvc3MgYWxsIGdyb3Vwc1xuXHRcdFx0XHRjb25zdCBuZXh0Tm9uU3RpY2t5RWRpdG9ySW5BbGxHcm91cHMgPSBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSlbMF07XG5cdFx0XHRcdGlmIChuZXh0Tm9uU3RpY2t5RWRpdG9ySW5BbGxHcm91cHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAobmV4dE5vblN0aWNreUVkaXRvckluQWxsR3JvdXBzLmdyb3VwSWQpPy5vcGVuRWRpdG9yKG5leHROb25TdGlja3lFZGl0b3JJbkFsbEdyb3Vwcy5lZGl0b3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdpdGggY29udGV4dDogcHJvY2VlZCB0byBjbG9zZSBlZGl0b3JzIGFzIGluc3RydWN0ZWRcblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBwcmVzZXJ2ZUZvY3VzID0gcmVzb2x2ZWRDb250ZXh0LnByZXNlcnZlRm9jdXM7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLm1hcChhc3luYyAoeyBncm91cCwgZWRpdG9ycyB9KSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JzVG9DbG9zZSA9IGVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiAha2VlcFN0aWNreUVkaXRvcnMgfHwgIWdyb3VwLmlzU3RpY2t5KGVkaXRvcikpO1xuXHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKGVkaXRvcnNUb0Nsb3NlLCB7IHByZXNlcnZlRm9jdXMgfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IENMT1NFX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Vyxcblx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY0LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5V10gfSxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0cmV0dXJuIGNsb3NlRWRpdG9ySGFuZGxlcihhY2Nlc3NvciwgZmFsc2UsIC4uLmFyZ3MpO1xuXHRcdH1cblx0fSk7XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQ0xPU0VfUElOTkVEX0VESVRPUl9DT01NQU5EX0lELCAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdHJldHVybiBjbG9zZUVkaXRvckhhbmRsZXIoYWNjZXNzb3IsIHRydWUgLyogZm9yY2UgY2xvc2UgcGlubmVkIGVkaXRvcnMgKi8sIC4uLmFyZ3MpO1xuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlXKSxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLm1hcChhc3luYyAoeyBncm91cCB9KSA9PiB7XG5cdFx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycyh7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ0xPU0VfRURJVE9SX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckdyb3VwRW1wdHlDb250ZXh0LCBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQpLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXLFxuXHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjQsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXXSB9LFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRzQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgZWRpdG9yR3JvdXBzU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXG5cdFx0XHRpZiAoY29tbWFuZHNDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRlZGl0b3JHcm91cHNTZXJ2aWNlLnJlbW92ZUdyb3VwKGNvbW1hbmRzQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXS5ncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlVKSxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLm1hcChhc3luYyAoeyBncm91cCB9KSA9PiB7XG5cdFx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IHNhdmVkT25seTogdHJ1ZSwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9LCB7IHByZXNlcnZlRm9jdXM6IHJlc29sdmVkQ29udGV4dC5wcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0cHJpbWFyeTogdW5kZWZpbmVkLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVQgfSxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubWFwKGFzeW5jICh7IGdyb3VwLCBlZGl0b3JzIH0pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yc1RvQ2xvc2UgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkuZmlsdGVyKGVkaXRvciA9PiAhZWRpdG9ycy5pbmNsdWRlcyhlZGl0b3IpKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvclRvS2VlcCBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdFx0aWYgKGVkaXRvclRvS2VlcCkge1xuXHRcdFx0XHRcdFx0Z3JvdXAucGluRWRpdG9yKGVkaXRvclRvS2VlcCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKGVkaXRvcnNUb0Nsb3NlLCB7IHByZXNlcnZlRm9jdXM6IHJlc29sdmVkQ29udGV4dC5wcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IENMT1NFX0VESVRPUlNfVE9fVEhFX1JJR0hUX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0XHRpZiAocmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF07XG5cdFx0XHRcdGlmIChncm91cC5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHRncm91cC5waW5FZGl0b3IoZ3JvdXAuYWN0aXZlRWRpdG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IGRpcmVjdGlvbjogQ2xvc2VEaXJlY3Rpb24uUklHSFQsIGV4Y2VwdDogZWRpdG9yc1swXSwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9LCB7IHByZXNlcnZlRm9jdXM6IHJlc29sdmVkQ29udGV4dC5wcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IFJFT1BFTl9XSVRIX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0cmV0dXJuIHJlb3BlbkVkaXRvcldpdGgoYWNjZXNzb3IsIEVkaXRvclJlc29sdXRpb24uUElDSywgLi4uYXJncyk7XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogUkVPUEVOX0FDVElWRV9FRElUT1JfV0lUSF9DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBvdmVycmlkZT86IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRyZXR1cm4gcmVvcGVuRWRpdG9yV2l0aChhY2Nlc3Nvciwgb3ZlcnJpZGUgPz8gRWRpdG9yUmVzb2x1dGlvbi5QSUNLLCAuLi5hcmdzKTtcblx0XHR9XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlb3BlbkVkaXRvcldpdGgoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvck92ZXJyaWRlOiBzdHJpbmcgfCBFZGl0b3JSZXNvbHV0aW9uLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3JraW5nQ29weUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBlZGl0b3JSZXBsYWNlbWVudHMgPSBuZXcgTWFwPElFZGl0b3JHcm91cCwgSUVkaXRvclJlcGxhY2VtZW50W10+KCk7XG5cblx0XHRmb3IgKGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSBvZiByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0Y29uc3QgaXNEaWZmRWRpdG9yID0gaXNEaWZmRWRpdG9ySW5wdXQoZWRpdG9yKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yVG9SZXNvbHZlID0gaXNEaWZmRWRpdG9yID8gZWRpdG9yLm1vZGlmaWVkIDogZWRpdG9yO1xuXHRcdFx0XHRjb25zdCB1bnR5cGVkRWRpdG9yID0gaXNEaWZmRWRpdG9yID8gZWRpdG9yLnRvVW50eXBlZCgpIDogZWRpdG9yVG9SZXNvbHZlLnRvVW50eXBlZCgpO1xuXHRcdFx0XHRpZiAoIXVudHlwZWRFZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIFJlc29sdmVyIGNhbiBvbmx5IHJlc29sdmUgdW50eXBlZCBlZGl0b3JzXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR1bnR5cGVkRWRpdG9yLm9wdGlvbnMgPSB7IC4uLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8ub3B0aW9ucywgb3ZlcnJpZGU6IGVkaXRvck92ZXJyaWRlIH07XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkRWRpdG9yID0gYXdhaXQgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVFZGl0b3IodW50eXBlZEVkaXRvciwgZ3JvdXApO1xuXHRcdFx0XHRpZiAoIWlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwKHJlc29sdmVkRWRpdG9yKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBlZGl0b3JSZXBsYWNlbWVudHNJbkdyb3VwID0gZWRpdG9yUmVwbGFjZW1lbnRzLmdldChncm91cCk7XG5cdFx0XHRcdGlmICghZWRpdG9yUmVwbGFjZW1lbnRzSW5Hcm91cCkge1xuXHRcdFx0XHRcdGVkaXRvclJlcGxhY2VtZW50c0luR3JvdXAgPSBbXTtcblx0XHRcdFx0XHRlZGl0b3JSZXBsYWNlbWVudHMuc2V0KGdyb3VwLCBlZGl0b3JSZXBsYWNlbWVudHNJbkdyb3VwKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZvcmNlIHJlcGxhY2Ugd2hlbiBjbG9zaW5nIHRoZSBlZGl0b3Igd2l0aG91dCBzYXZpbmcgY2Fubm90XG5cdFx0XHRcdC8vIGxvc2UgZGF0YS4gVGhpcyBpcyB0aGUgY2FzZSB3aGVuIHRoZSBkaXJ0eSBzdGF0ZSBsaXZlcyBpbiBhXG5cdFx0XHRcdC8vIHdvcmtpbmcgY29weSB3aG9zZSBsaWZldGltZSBpcyBpbmRlcGVuZGVudCBvZiB0aGUgZWRpdG9yOlxuXHRcdFx0XHQvLyBgVGV4dEZpbGVFZGl0b3JNb2RlbGBzIGFuZCBgVW50aXRsZWRUZXh0RWRpdG9yTW9kZWxgcyBhcmVcblx0XHRcdFx0Ly8ga2VwdCBhbGl2ZSB3aGlsZSBkaXJ0eSBieSB0aGVpciBvd25pbmcgc2VydmljZS5cblx0XHRcdFx0Ly9cblx0XHRcdFx0Ly8gVGhpcyB3YXkgc3dpdGNoaW5nIGJldHdlZW4gYSB0ZXh0IGVkaXRvciBhbmQgYSB0ZXh0LWRvY3VtZW50XG5cdFx0XHRcdC8vIGJhc2VkIGN1c3RvbSBlZGl0b3IgKHN1Y2ggYXMgdGhlIE1hcmtkb3duIHByZXZpZXcpIGZvciB0aGVcblx0XHRcdFx0Ly8gc2FtZSByZXNvdXJjZSBkb2VzIG5vdCB0cmlnZ2VyIGEgc2F2ZSBkaWFsb2cuXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIEN1c3RvbS1kb2N1bWVudCBjdXN0b20gZWRpdG9ycyAoZS5nLiBoZXggZWRpdG9ycykgbWFpbnRhaW5cblx0XHRcdFx0Ly8gdGhlaXIgZGlydHkgc3RhdGUgaW4gYSB3b3JraW5nIGNvcHkgd2hvc2UgbGlmZXRpbWUgaXMgdGllZFxuXHRcdFx0XHQvLyB0byB0aGUgZWRpdG9yIGlucHV0LCBzbyB3ZSBtdXN0IG5vdCBza2lwIHRoZSBzYXZlIHByb21wdFxuXHRcdFx0XHQvLyBmb3IgdGhvc2UgXHUyMDE0IGRldGVjdCB0aGlzIGJ5IGxvb2tpbmcgZm9yIGFueSBkaXJ0eSB3b3JraW5nXG5cdFx0XHRcdC8vIGNvcHkgdGhhdCBiYWNrcyB0aGlzIGVkaXRvciBhdCBhIGRpZmZlcmVudCByZXNvdXJjZS5cblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBlZGl0b3JUb1Jlc29sdmUucmVzb3VyY2U7XG5cdFx0XHRcdGxldCBmb3JjZVJlcGxhY2VEaXJ0eSA9ICEhcmVzb3VyY2UgJiYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCB8fCB0ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eShyZXNvdXJjZSkpO1xuXHRcdFx0XHRpZiAoZm9yY2VSZXBsYWNlRGlydHkgJiYgZWRpdG9yVG9SZXNvbHZlLmlzRGlydHkoKSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2Ygd29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5V29ya2luZ0NvcGllcykge1xuXHRcdFx0XHRcdFx0aWYgKGlzRXF1YWwod29ya2luZ0NvcHkucmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gd29ya2luZyBjb3B5IGF0IHRoZSBlZGl0b3IncyBvd24gcmVzb3VyY2UgaXMgdGV4dC1iYXNlZCBhbmQgc3Vydml2ZXMgY2xvc2Vcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh3b3JraW5nQ29weUVkaXRvclNlcnZpY2UuZmluZEVkaXRvcih3b3JraW5nQ29weSk/LmVkaXRvciA9PT0gZWRpdG9yVG9SZXNvbHZlKSB7XG5cdFx0XHRcdFx0XHRcdGZvcmNlUmVwbGFjZURpcnR5ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVkaXRvclJlcGxhY2VtZW50c0luR3JvdXAucHVzaCh7XG5cdFx0XHRcdFx0ZWRpdG9yOiBlZGl0b3IsXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQ6IHJlc29sdmVkRWRpdG9yLmVkaXRvcixcblx0XHRcdFx0XHRmb3JjZVJlcGxhY2VEaXJ0eSxcblx0XHRcdFx0XHRvcHRpb25zOiByZXNvbHZlZEVkaXRvci5vcHRpb25zXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFRlbGVtZXRyeVxuXHRcdFx0XHR0eXBlIFdvcmtiZW5jaEVkaXRvclJlb3BlbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAncmVib3JuaXgnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdJZGVudGlmeSBob3cgYSBkb2N1bWVudCBpcyByZW9wZW5lZCc7XG5cdFx0XHRcdFx0c2NoZW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBzeXN0ZW0gcHJvdmlkZXIgc2NoZW1lIGZvciB0aGUgcmVzb3VyY2UnIH07XG5cdFx0XHRcdFx0ZXh0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBleHRlbnNpb24gZm9yIHRoZSByZXNvdXJjZScgfTtcblx0XHRcdFx0XHRmcm9tOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGVkaXRvciB2aWV3IHR5cGUgdGhlIHJlc291cmNlIGlzIHN3aXRjaGVkIGZyb20nIH07XG5cdFx0XHRcdFx0dG86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZWRpdG9yIHZpZXcgdHlwZSB0aGUgcmVzb3VyY2UgaXMgc3dpdGNoZWQgdG8nIH07XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dHlwZSBXb3JrYmVuY2hFZGl0b3JSZW9wZW5FdmVudCA9IHtcblx0XHRcdFx0XHRzY2hlbWU6IHN0cmluZztcblx0XHRcdFx0XHRleHQ6IHN0cmluZztcblx0XHRcdFx0XHRmcm9tOiBzdHJpbmc7XG5cdFx0XHRcdFx0dG86IHN0cmluZztcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoRWRpdG9yUmVvcGVuRXZlbnQsIFdvcmtiZW5jaEVkaXRvclJlb3BlbkNsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoRWRpdG9yUmVvcGVuJywge1xuXHRcdFx0XHRcdHNjaGVtZTogZWRpdG9yVG9SZXNvbHZlLnJlc291cmNlPy5zY2hlbWUgPz8gJycsXG5cdFx0XHRcdFx0ZXh0OiBlZGl0b3JUb1Jlc29sdmUucmVzb3VyY2UgPyBleHRuYW1lKGVkaXRvclRvUmVzb2x2ZS5yZXNvdXJjZSkgOiAnJyxcblx0XHRcdFx0XHRmcm9tOiBlZGl0b3IuZWRpdG9ySWQgPz8gJycsXG5cdFx0XHRcdFx0dG86IHJlc29sdmVkRWRpdG9yLmVkaXRvci5lZGl0b3JJZCA/PyAnJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXBsYWNlIGVkaXRvciB3aXRoIHJlc29sdmVkIG9uZSBhbmQgbWFrZSBhY3RpdmVcblx0XHRmb3IgKGNvbnN0IFtncm91cCwgcmVwbGFjZW1lbnRzXSBvZiBlZGl0b3JSZXBsYWNlbWVudHMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKHJlcGxhY2VtZW50cyk7XG5cdFx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKHJlcGxhY2VtZW50c1swXS5yZXBsYWNlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQ0xPU0VfRURJVE9SU19BTkRfR1JPVVBfQ09NTUFORF9JRCwgYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgZWRpdG9yR3JvdXBzU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGlmIChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB7IGdyb3VwIH0gPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF07XG5cdFx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblxuXHRcdFx0aWYgKGdyb3VwLmNvdW50ID09PSAwICYmIGVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAoZ3JvdXAuaWQpIC8qIGNvdWxkIGJlIGdvbmUgYnkgbm93ICovKSB7XG5cdFx0XHRcdGVkaXRvckdyb3Vwc1NlcnZpY2UucmVtb3ZlR3JvdXAoZ3JvdXApOyAvLyBvbmx5IHJlbW92ZSBncm91cCBpZiBpdCBpcyBub3cgZW1wdHlcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWdpc3RlckZvY3VzRWRpdG9yR3JvdXBXaWhvdXRXcmFwQ29tbWFuZHMoKTogdm9pZCB7XG5cblx0Y29uc3QgY29tbWFuZHMgPSBbXG5cdFx0e1xuXHRcdFx0aWQ6IEZPQ1VTX0xFRlRfR1JPVVBfV0lUSE9VVF9XUkFQX0NPTU1BTkRfSUQsXG5cdFx0XHRkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLkxFRlRcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBGT0NVU19SSUdIVF9HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCxcblx0XHRcdGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uUklHSFRcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBGT0NVU19BQk9WRV9HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCxcblx0XHRcdGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uVVAsXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogRk9DVVNfQkVMT1dfR1JPVVBfV0lUSE9VVF9XUkFQX0NPTU1BTkRfSUQsXG5cdFx0XHRkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLkRPV05cblx0XHR9XG5cdF07XG5cblx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoY29tbWFuZC5pZCwgYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGRpcmVjdGlvbjogY29tbWFuZC5kaXJlY3Rpb24gfSwgZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cCwgZmFsc2UpID8/IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0XHRncm91cC5mb2N1cygpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyU3BsaXRFZGl0b3JJbkdyb3VwQ29tbWFuZHMoKTogdm9pZCB7XG5cblx0YXN5bmMgZnVuY3Rpb24gc3BsaXRFZGl0b3JJbkdyb3VwKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvbHZlZENvbnRleHQ6IElSZXNvbHZlZEVkaXRvckNvbW1hbmRzQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoIXJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF07XG5cdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9yc1swXTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7XG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRyZXBsYWNlbWVudDogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2lkZUJ5U2lkZUVkaXRvcklucHV0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZWRpdG9yLCBlZGl0b3IpLFxuXHRcdFx0Zm9yY2VSZXBsYWNlRGlydHk6IHRydWVcblx0XHR9XSk7XG5cdH1cblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IFNQTElUX0VESVRPUl9JTl9HUk9VUCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JJbkdyb3VwJywgJ1NwbGl0IEVkaXRvciBpbiBHcm91cCcpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0d2hlbjogQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJhY2tzbGFzaClcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gc3BsaXRFZGl0b3JJbkdyb3VwKGFjY2Vzc29yLCByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBqb2luRWRpdG9ySW5Hcm91cChyZXNvbHZlZENvbnRleHQ6IElSZXNvbHZlZEVkaXRvckNvbW1hbmRzQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JzWzBdO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCEoZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3IgJiYgZ3JvdXAuYWN0aXZlRWRpdG9yID09PSBlZGl0b3IpIHtcblx0XHRcdGZvciAoY29uc3QgcGFuZSBvZiBbYWN0aXZlRWRpdG9yUGFuZS5nZXRQcmltYXJ5RWRpdG9yUGFuZSgpLCBhY3RpdmVFZGl0b3JQYW5lLmdldFNlY29uZGFyeUVkaXRvclBhbmUoKV0pIHtcblx0XHRcdFx0aWYgKHBhbmU/Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRvcHRpb25zID0geyB2aWV3U3RhdGU6IHBhbmUuZ2V0Vmlld1N0YXRlKCkgfTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7XG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRyZXBsYWNlbWVudDogZWRpdG9yLnByaW1hcnksXG5cdFx0XHRvcHRpb25zXG5cdFx0fV0pO1xuXHR9XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBKT0lOX0VESVRPUl9JTl9HUk9VUCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignam9pbkVkaXRvckluR3JvdXAnLCAnSm9pbiBFZGl0b3IgaW4gR3JvdXAnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHR3aGVuOiBTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJhY2tzbGFzaClcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gam9pbkVkaXRvckluR3JvdXAocmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSkpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUT0dHTEVfU1BMSVRfRURJVE9SX0lOX0dST1VQLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVKb2luRWRpdG9ySW5Hcm91cCcsICdUb2dnbGUgU3BsaXQgRWRpdG9yIGluIEdyb3VwJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCwgU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQpLFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdGlmICghcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgZWRpdG9ycyB9ID0gcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdO1xuXG5cdFx0XHRpZiAoZWRpdG9yc1swXSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRhd2FpdCBqb2luRWRpdG9ySW5Hcm91cChyZXNvbHZlZENvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChlZGl0b3JzWzBdKSB7XG5cdFx0XHRcdGF3YWl0IHNwbGl0RWRpdG9ySW5Hcm91cChhY2Nlc3NvciwgcmVzb2x2ZWRDb250ZXh0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogVE9HR0xFX1NQTElUX0VESVRPUl9JTl9HUk9VUF9MQVlPVVQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZVNwbGl0RWRpdG9ySW5Hcm91cExheW91dCcsICdUb2dnbGUgTGF5b3V0IG9mIFNwbGl0IEVkaXRvciBpbiBHcm91cCcpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZXR0aW5nID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8dW5rbm93bj4oU2lkZUJ5U2lkZUVkaXRvci5TSURFX0JZX1NJREVfTEFZT1VUX1NFVFRJTkcpO1xuXG5cdFx0XHRsZXQgbmV3U2V0dGluZzogJ3ZlcnRpY2FsJyB8ICdob3Jpem9udGFsJztcblx0XHRcdGlmIChjdXJyZW50U2V0dGluZyAhPT0gJ2hvcml6b250YWwnKSB7XG5cdFx0XHRcdG5ld1NldHRpbmcgPSAnaG9yaXpvbnRhbCc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdTZXR0aW5nID0gJ3ZlcnRpY2FsJztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFNpZGVCeVNpZGVFZGl0b3IuU0lERV9CWV9TSURFX0xBWU9VVF9TRVRUSU5HLCBuZXdTZXR0aW5nKTtcblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWdpc3RlckZvY3VzU2lkZUVkaXRvcnNDb21tYW5kcygpOiB2b2lkIHtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEZPQ1VTX0ZJUlNUX1NJREVfRURJVE9SLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c0xlZnRTaWRlRWRpdG9yJywgJ0ZvY3VzIEZpcnN0IFNpZGUgaW4gQWN0aXZlIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQpLFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9yKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuZ2V0U2Vjb25kYXJ5RWRpdG9yUGFuZSgpPy5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgVGV4dERpZmZFZGl0b3IpIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRElGRl9GT0NVU19TRUNPTkRBUllfU0lERSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEZPQ1VTX1NFQ09ORF9TSURFX0VESVRPUixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNSaWdodFNpZGVFZGl0b3InLCAnRm9jdXMgU2Vjb25kIFNpZGUgaW4gQWN0aXZlIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQpLFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9yKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuZ2V0UHJpbWFyeUVkaXRvclBhbmUoKT8uZm9jdXMoKTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFRleHREaWZmRWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKERJRkZfRk9DVVNfUFJJTUFSWV9TSURFKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogRk9DVVNfT1RIRVJfU0lERV9FRElUT1IsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzT3RoZXJTaWRlRWRpdG9yJywgJ0ZvY3VzIE90aGVyIFNpZGUgaW4gQWN0aXZlIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQpLFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9yKSB7XG5cdFx0XHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lLmdldFByaW1hcnlFZGl0b3JQYW5lKCk/Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JQYW5lLmdldFNlY29uZGFyeUVkaXRvclBhbmUoKT8uZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JQYW5lLmdldFByaW1hcnlFZGl0b3JQYW5lKCk/LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFRleHREaWZmRWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKERJRkZfRk9DVVNfT1RIRVJfU0lERSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJPdGhlckVkaXRvckNvbW1hbmRzKCk6IHZvaWQge1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBLRUVQX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5FbnRlciksXG5cdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0Zm9yIChjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gb2YgcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRncm91cC5waW5FZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiBUT0dHTEVfS0VFUF9FRElUT1JTX0NPTU1BTkRfSUQsXG5cdFx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgY3VycmVudFNldHRpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLmVkaXRvci5lbmFibGVQcmV2aWV3Jyk7XG5cdFx0XHRjb25zdCBuZXdTZXR0aW5nID0gY3VycmVudFNldHRpbmcgIT09IHRydWU7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnd29ya2JlbmNoLmVkaXRvci5lbmFibGVQcmV2aWV3JywgbmV3U2V0dGluZyk7XG5cdFx0fVxuXHR9KTtcblxuXHRmdW5jdGlvbiBzZXRFZGl0b3JHcm91cExvY2soYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxvY2tlZDogYm9vbGVhbiB8IHVuZGVmaW5lZCwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZ3JvdXAgPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF0/Lmdyb3VwO1xuXHRcdGdyb3VwPy5sb2NrKGxvY2tlZCA/PyAhZ3JvdXAuaXNMb2NrZWQpO1xuXHR9XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUT0dHTEVfTE9DS19HUk9VUF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVFZGl0b3JHcm91cExvY2snLCAnVG9nZ2xlIEVkaXRvciBHcm91cCBMb2NrJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHNldEVkaXRvckdyb3VwTG9jayhhY2Nlc3NvciwgdW5kZWZpbmVkLCAuLi5hcmdzKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogTE9DS19HUk9VUF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdsb2NrRWRpdG9yR3JvdXAnLCAnTG9jayBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHNldEVkaXRvckdyb3VwTG9jayhhY2Nlc3NvciwgdHJ1ZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IFVOTE9DS19HUk9VUF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd1bmxvY2tFZGl0b3JHcm91cCcsICdVbmxvY2sgRWRpdG9yIEdyb3VwJyksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0LFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRzZXRFZGl0b3JHcm91cExvY2soYWNjZXNzb3IsIGZhbHNlLCAuLi5hcmdzKTtcblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBQSU5fRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlciksXG5cdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0Zm9yIChjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gb2YgcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRncm91cC5zdGlja0VkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogVU5QSU5fRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlciksXG5cdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0Zm9yIChjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gb2YgcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRncm91cC51bnN0aWNrRWRpdG9yKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBTSE9XX0VESVRPUlNfSU5fR1JPVVAsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBjb21tYW5kc0NvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGVkaXRvckdyb3Vwc1NlcnZpY2UsIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdGNvbnN0IGdyb3VwID0gY29tbWFuZHNDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdPy5ncm91cDtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRlZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2YXRlR3JvdXAoZ3JvdXApOyAvLyB3ZSBuZWVkIHRoZSBncm91cCB0byBiZSBhY3RpdmVcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coQWN0aXZlR3JvdXBFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MuUFJFRklYKTtcblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWdpc3Rlck1vZGFsRWRpdG9yQ29tbWFuZHMoKTogdm9pZCB7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBNT1ZFX01PREFMX0VESVRPUl9UT19NQUlOX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVUb01haW5XaW5kb3cnLCAnT3BlbiBNb2RhbCBFZGl0b3IgaW4gTWFpbiBXaW5kb3cnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGljb246IENvZGljb24ub3BlbkluUHJvZHVjdCxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBlZGl0b3JHcm91cHNTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHRcdGlmIChpc01vZGFsRWRpdG9yUGFydChwYXJ0KSkge1xuXHRcdFx0XHRcdGF3YWl0IHBhcnQuY2xvc2UoeyBtZXJnZUFsbEVkaXRvcnNUb01haW5QYXJ0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IE1PVkVfTU9EQUxfRURJVE9SX1RPX1dJTkRPV19DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlTW9kYWxFZGl0b3JUb1dpbmRvdycsICdPcGVuIE1vZGFsIEVkaXRvciBpbiBOZXcgV2luZG93JyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmVtcHR5V2luZG93LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IEVkaXRvclBhcnRNb2RhbENvbnRleHQsXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvclRpdGxlQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzFfd2luZG93Jyxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBlZGl0b3JHcm91cHNTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHRcdGlmIChpc01vZGFsRWRpdG9yUGFydChwYXJ0KSkge1xuXHRcdFx0XHRcdGNvbnN0IGF1eGlsaWFyeUVkaXRvclBhcnQgPSBhd2FpdCBlZGl0b3JHcm91cHNTZXJ2aWNlLmNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQoKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgcGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRcdFx0XHRncm91cC5tb3ZlRWRpdG9ycyhncm91cC5lZGl0b3JzLm1hcChlZGl0b3IgPT4gKHsgZWRpdG9yLCBvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9KSksIGF1eGlsaWFyeUVkaXRvclBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGF1eGlsaWFyeUVkaXRvclBhcnQuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHRcdFx0XHRhd2FpdCBwYXJ0LmNsb3NlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogVE9HR0xFX01PREFMX0VESVRPUl9TSURFQkFSX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZU1vZGFsRWRpdG9yU2lkZWJhcicsICdUb2dnbGUgTW9kYWwgRWRpdG9yIFNpZGViYXInKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvclBhcnRNb2RhbENvbnRleHQsIEVkaXRvclBhcnRNb2RhbFNpZGViYXJDb250ZXh0KSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0cykge1xuXHRcdFx0XHRpZiAoaXNNb2RhbEVkaXRvclBhcnQocGFydCkpIHtcblx0XHRcdFx0XHRwYXJ0LnRvZ2dsZVNpZGViYXIoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUT0dHTEVfTU9EQUxfRURJVE9SX01BWElNSVpFRF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVNb2RhbEVkaXRvck1heGltaXplZCcsICdNYXhpbWl6ZSBNb2RhbCBFZGl0b3InKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yUGFydE1vZGFsQ29udGV4dCxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zY3JlZW5GdWxsLFxuXHRcdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdFx0Y29uZGl0aW9uOiBFZGl0b3JQYXJ0TW9kYWxNYXhpbWl6ZWRDb250ZXh0LFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVzdG9yZU1vZGFsRWRpdG9yU2l6ZScsIFwiUmVzdG9yZSBNb2RhbCBFZGl0b3JcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiA5OVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGVkaXRvckdyb3Vwc1NlcnZpY2UucGFydHMpIHtcblx0XHRcdFx0aWYgKGlzTW9kYWxFZGl0b3JQYXJ0KHBhcnQpKSB7XG5cdFx0XHRcdFx0cGFydC50b2dnbGVNYXhpbWl6ZWQoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBDTE9TRV9NT0RBTF9FRElUT1JfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VNb2RhbEVkaXRvcicsICdDbG9zZSBNb2RhbCBFZGl0b3InKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGljb246IENvZGljb24uY2xvc2UsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yUGFydE1vZGFsQ29udGV4dCxcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLCAvLyBoaWdoZXIgd2hlbiBubyB0ZXh0IGVkaXRvciBvciBsaXN0L3RyZWUgaXMgZm9jdXNlZC4uLlxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5mb2N1cy50b05lZ2F0ZWQoKSwgUmF3V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleS5uZWdhdGUoKSlcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliIC0gMSwgLy8gLi4ubG93ZXIgdG8gcHJldmVudCBhY2NpZGVudGFsIGNsb3NlIHdoZW4gdGV4dCBlZGl0b3IgaXMgZm9jdXNlZFxuXHRcdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0XHQvLyBXaGVuIGEgbGlzdC90cmVlIGlzIGZvY3VzZWQsIHN0aWxsIGNsb3NlIHRoZSBtb2RhbCwgYnV0IHlpZWxkIHRvIHRoZVxuXHRcdFx0XHRcdC8vIGxpc3QvdHJlZSdzIG93biBgRXNjYXBlYCBmZWF0dXJlcyB0aGF0IHNob3VsZCBjbG9zZSBmaXJzdCAodGhlIGZpbmRcblx0XHRcdFx0XHQvLyB3aWRnZXQgYW5kIHN0aWNreSBzY3JvbGwpLiBUaGUgc2VsZWN0aW9uIGlzIGludGVudGlvbmFsbHkgbm90IGNsZWFyZWRcblx0XHRcdFx0XHQvLyBmaXJzdCBzbyBhIHNpbmdsZSBgRXNjYXBlYCBjbG9zZXMgdGhlIG1vZGFsLlxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmF3V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoVHJlZUZpbmRPcGVuLm5lZ2F0ZSgpLCBXb3JrYmVuY2hUcmVlU3RpY2t5U2Nyb2xsRm9jdXNlZC5uZWdhdGUoKSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk1vZGFsRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMTAwXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0cykge1xuXHRcdFx0XHRpZiAoaXNNb2RhbEVkaXRvclBhcnQocGFydCkpIHtcblx0XHRcdFx0XHRhd2FpdCBwYXJ0LmNsb3NlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogTkFWSUdBVEVfTU9EQUxfRURJVE9SX1BSRVZJT1VTX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25hdmlnYXRlTW9kYWxFZGl0b3JQcmV2aW91cycsICdOYXZpZ2F0ZSB0byBQcmV2aW91cyBJdGVtIGluIE1vZGFsIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxOYXZpZ2F0aW9uQ29udGV4dCksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvclBhcnRNb2RhbENvbnRleHQsIEVkaXRvclBhcnRNb2RhbE5hdmlnYXRpb25Db250ZXh0KVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGVkaXRvckdyb3Vwc1NlcnZpY2UucGFydHMpIHtcblx0XHRcdFx0aWYgKGlzTW9kYWxFZGl0b3JQYXJ0KHBhcnQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmF2ID0gcGFydC5uYXZpZ2F0aW9uO1xuXHRcdFx0XHRcdGlmIChuYXYgJiYgbmF2LmN1cnJlbnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRuYXYubmF2aWdhdGUobmF2LmN1cnJlbnQgLSAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogTkFWSUdBVEVfTU9EQUxfRURJVE9SX05FWFRfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVNb2RhbEVkaXRvck5leHQnLCAnTmF2aWdhdGUgdG8gTmV4dCBJdGVtIGluIE1vZGFsIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxOYXZpZ2F0aW9uQ29udGV4dCksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yUGFydE1vZGFsQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsTmF2aWdhdGlvbkNvbnRleHQpXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0cykge1xuXHRcdFx0XHRpZiAoaXNNb2RhbEVkaXRvclBhcnQocGFydCkpIHtcblx0XHRcdFx0XHRjb25zdCBuYXYgPSBwYXJ0Lm5hdmlnYXRpb247XG5cdFx0XHRcdFx0aWYgKG5hdiAmJiBuYXYuY3VycmVudCA8IG5hdi50b3RhbCAtIDEpIHtcblx0XHRcdFx0XHRcdG5hdi5uYXZpZ2F0ZShuYXYuY3VycmVudCArIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzTW9kYWxFZGl0b3JQYXJ0KG9iajogdW5rbm93bik6IG9iaiBpcyBJTW9kYWxFZGl0b3JQYXJ0IHtcblx0Y29uc3QgcGFydCA9IG9iaiBhcyBJTW9kYWxFZGl0b3JQYXJ0IHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIXBhcnRcblx0XHQmJiB0eXBlb2YgcGFydC5jbG9zZSA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdCYmIHR5cGVvZiBwYXJ0Lm9uV2lsbENsb3NlID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHBhcnQudG9nZ2xlTWF4aW1pemVkID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHBhcnQubWF4aW1pemVkID09PSAnYm9vbGVhbidcblx0XHQmJiB0eXBlb2YgcGFydC51cGRhdGVPcHRpb25zID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgISFwYXJ0Lm1vZGFsRWxlbWVudFxuXHRcdCYmIHBhcnQud2luZG93SWQgPT09IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cCgpOiB2b2lkIHtcblx0cmVnaXN0ZXJFZGl0b3JNb3ZlQ29weUNvbW1hbmQoKTtcblx0cmVnaXN0ZXJFZGl0b3JHcm91cHNMYXlvdXRDb21tYW5kcygpO1xuXHRyZWdpc3RlckRpZmZFZGl0b3JDb21tYW5kcygpO1xuXHRyZWdpc3Rlck9wZW5FZGl0b3JBUElDb21tYW5kcygpO1xuXHRyZWdpc3Rlck9wZW5FZGl0b3JBdEluZGV4Q29tbWFuZHMoKTtcblx0cmVnaXN0ZXJDbG9zZUVkaXRvckNvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyT3RoZXJFZGl0b3JDb21tYW5kcygpO1xuXHRyZWdpc3RlclNwbGl0RWRpdG9ySW5Hcm91cENvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyRm9jdXNTaWRlRWRpdG9yc0NvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyRm9jdXNFZGl0b3JHcm91cEF0SW5kZXhDb21tYW5kcygpO1xuXHRyZWdpc3RlclNwbGl0RWRpdG9yQ29tbWFuZHMoKTtcblx0cmVnaXN0ZXJGb2N1c0VkaXRvckdyb3VwV2lob3V0V3JhcENvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyTW9kYWxFZGl0b3JDb21tYW5kcygpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLFNBQVMscUJBQXFCO0FBQ3ZDLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsVUFBVSxVQUFVLFVBQVUsbUJBQW1CO0FBQzFELFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsa0JBQW1DLHVCQUF1QjtBQUNuRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUFrRjtBQUMzRixTQUFTLDZCQUErQztBQUN4RCxTQUFTLGtCQUFrQiwyQkFBMkI7QUFDdEQsU0FBUyxjQUEwQixpQ0FBaUMsdUJBQXVCLHdDQUF3QztBQUNuSSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVEQUF1RDtBQUNoRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9DQUFvQywrQkFBK0IsZ0NBQWdDLDJCQUEyQix3QkFBd0IsaUNBQWlDLGtDQUFrQywrQkFBK0IseUJBQXlCLDZCQUE2QiwrQkFBK0Isc0NBQXNDO0FBQzVYLFNBQVMsZ0JBQWdCLHlCQUF5QixjQUEwRSxt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
