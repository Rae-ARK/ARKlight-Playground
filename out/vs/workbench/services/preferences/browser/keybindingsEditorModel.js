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
import { localize } from "../../../../nls.js";
import { distinct, coalesce } from "../../../../base/common/arrays.js";
import * as strings from "../../../../base/common/strings.js";
import { Language } from "../../../../base/common/platform.js";
import { or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString, matchesContiguousSubString } from "../../../../base/common/filters.js";
import { AriaLabelProvider, UserSettingsLabelProvider, UILabelProvider } from "../../../../base/common/keybindingLabels.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResolvedKeybindingItem } from "../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { getAllUnboundCommands } from "../../keybinding/browser/unboundCommands.js";
import { isEmptyObject, isString } from "../../../../base/common/types.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionIdentifier, ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
const KEYBINDING_ENTRY_TEMPLATE_ID = "keybinding.entry.template";
const SOURCE_SYSTEM = localize("default", "System");
const SOURCE_EXTENSION = localize("extension", "Extension");
const SOURCE_USER = localize("user", "User");
function createKeybindingCommandQuery(commandId, when) {
  const whenPart = when ? ` +when:${when}` : "";
  return `@command:${commandId}${whenPart}`;
}
const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const COMMAND_REGEX = /@command:\s*([^\+]+)/i;
const WHEN_REGEX = /\+when:\s*(.+)/i;
const SOURCE_REGEX = /@source:\s*(user|default|system|extension)/i;
const EXTENSION_REGEX = /@ext:\s*((".+")|([^\s]+))/i;
const KEYBINDING_REGEX = /@keybinding:\s*((\".+\")|(\S+))/i;
let KeybindingsEditorModel = class extends EditorModel {
  constructor(os, keybindingsService, extensionService) {
    super();
    this.keybindingsService = keybindingsService;
    this.extensionService = extensionService;
    this._keybindingItems = [];
    this._keybindingItemsSortedByPrecedence = [];
    this.modifierLabels = {
      ui: UILabelProvider.modifierLabels[os],
      aria: AriaLabelProvider.modifierLabels[os],
      user: UserSettingsLabelProvider.modifierLabels[os]
    };
  }
  fetch(searchValue, sortByPrecedence = false) {
    let keybindingItems = sortByPrecedence ? this._keybindingItemsSortedByPrecedence : this._keybindingItems;
    const commandIdMatches = COMMAND_REGEX.exec(searchValue);
    if (commandIdMatches && commandIdMatches[1]) {
      const command = commandIdMatches[1].trim();
      let filteredKeybindingItems = keybindingItems.filter((k) => k.command === command);
      if (filteredKeybindingItems.length) {
        const whenMatches = WHEN_REGEX.exec(searchValue);
        if (whenMatches && whenMatches[1]) {
          const whenValue = whenMatches[1].trim();
          filteredKeybindingItems = this.filterByWhen(filteredKeybindingItems, command, whenValue);
        }
      }
      return filteredKeybindingItems.map((keybindingItem) => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
    }
    if (SOURCE_REGEX.test(searchValue)) {
      keybindingItems = this.filterBySource(keybindingItems, searchValue);
      searchValue = searchValue.replace(SOURCE_REGEX, "");
    } else {
      const extensionMatches = EXTENSION_REGEX.exec(searchValue);
      if (extensionMatches && (extensionMatches[2] || extensionMatches[3])) {
        const extensionId = extensionMatches[2] ? extensionMatches[2].substring(1, extensionMatches[2].length - 1) : extensionMatches[3];
        keybindingItems = this.filterByExtension(keybindingItems, extensionId);
        searchValue = searchValue.replace(EXTENSION_REGEX, "");
      } else {
        const keybindingMatches = KEYBINDING_REGEX.exec(searchValue);
        if (keybindingMatches && (keybindingMatches[2] || keybindingMatches[3])) {
          searchValue = keybindingMatches[2] || `"${keybindingMatches[3]}"`;
        }
      }
    }
    searchValue = searchValue.trim();
    if (!searchValue) {
      return keybindingItems.map((keybindingItem) => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
    }
    return this.filterByText(keybindingItems, searchValue);
  }
  filterBySource(keybindingItems, searchValue) {
    if (/@source:\s*default/i.test(searchValue) || /@source:\s*system/i.test(searchValue)) {
      return keybindingItems.filter((k) => k.source === SOURCE_SYSTEM);
    }
    if (/@source:\s*user/i.test(searchValue)) {
      return keybindingItems.filter((k) => k.source === SOURCE_USER);
    }
    if (/@source:\s*extension/i.test(searchValue)) {
      return keybindingItems.filter((k) => !isString(k.source) || k.source === SOURCE_EXTENSION);
    }
    return keybindingItems;
  }
  filterByExtension(keybindingItems, extension) {
    extension = extension.toLowerCase().trim();
    return keybindingItems.filter((k) => !isString(k.source) && (ExtensionIdentifier.equals(k.source.identifier, extension) || k.source.displayName?.toLowerCase() === extension.toLowerCase()));
  }
  filterByText(keybindingItems, searchValue) {
    const quoteAtFirstChar = searchValue.charAt(0) === '"';
    const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
    const completeMatch = quoteAtFirstChar && quoteAtLastChar;
    if (quoteAtFirstChar) {
      searchValue = searchValue.substring(1);
    }
    if (quoteAtLastChar) {
      searchValue = searchValue.substring(0, searchValue.length - 1);
    }
    searchValue = searchValue.trim();
    const result = [];
    const words = searchValue.split(" ");
    const keybindingWords = this.splitKeybindingWords(words);
    for (const keybindingItem of keybindingItems) {
      const keybindingMatches = new KeybindingItemMatches(this.modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch);
      if (keybindingMatches.commandIdMatches || keybindingMatches.commandLabelMatches || keybindingMatches.commandDefaultLabelMatches || keybindingMatches.sourceMatches || keybindingMatches.whenMatches || keybindingMatches.keybindingMatches || keybindingMatches.extensionIdMatches || keybindingMatches.extensionLabelMatches) {
        result.push({
          id: KeybindingsEditorModel.getId(keybindingItem),
          templateId: KEYBINDING_ENTRY_TEMPLATE_ID,
          commandLabelMatches: keybindingMatches.commandLabelMatches || void 0,
          commandDefaultLabelMatches: keybindingMatches.commandDefaultLabelMatches || void 0,
          keybindingItem,
          keybindingMatches: keybindingMatches.keybindingMatches || void 0,
          commandIdMatches: keybindingMatches.commandIdMatches || void 0,
          sourceMatches: keybindingMatches.sourceMatches || void 0,
          whenMatches: keybindingMatches.whenMatches || void 0,
          extensionIdMatches: keybindingMatches.extensionIdMatches || void 0,
          extensionLabelMatches: keybindingMatches.extensionLabelMatches || void 0
        });
      }
    }
    return result;
  }
  filterByWhen(keybindingItems, command, when) {
    if (keybindingItems.length === 0) {
      return [];
    }
    const keybindingItemsWithWhen = keybindingItems.filter((k) => k.when === when);
    if (keybindingItemsWithWhen.length) {
      return keybindingItemsWithWhen;
    }
    const commandLabel = keybindingItems[0].commandLabel;
    const keybindingItem = new ResolvedKeybindingItem(void 0, command, null, ContextKeyExpr.deserialize(when), false, null, false);
    const actionLabels = /* @__PURE__ */ new Map([[command, commandLabel]]);
    return [KeybindingsEditorModel.toKeybindingEntry(command, keybindingItem, actionLabels, this.getExtensionsMapping())];
  }
  splitKeybindingWords(wordsSeparatedBySpaces) {
    const result = [];
    for (const word of wordsSeparatedBySpaces) {
      result.push(...coalesce(word.split("+")));
    }
    return result;
  }
  async resolve(actionLabels = /* @__PURE__ */ new Map()) {
    const extensions = this.getExtensionsMapping();
    this._keybindingItemsSortedByPrecedence = [];
    const boundCommands = /* @__PURE__ */ new Map();
    for (const keybinding of this.keybindingsService.getKeybindings()) {
      if (keybinding.command) {
        this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel.toKeybindingEntry(keybinding.command, keybinding, actionLabels, extensions));
        boundCommands.set(keybinding.command, true);
      }
    }
    const commandsWithDefaultKeybindings = this.keybindingsService.getDefaultKeybindings().map((keybinding) => keybinding.command);
    for (const command of getAllUnboundCommands(boundCommands)) {
      const keybindingItem = new ResolvedKeybindingItem(void 0, command, null, void 0, commandsWithDefaultKeybindings.indexOf(command) === -1, null, false);
      this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel.toKeybindingEntry(command, keybindingItem, actionLabels, extensions));
    }
    this._keybindingItemsSortedByPrecedence = distinct(this._keybindingItemsSortedByPrecedence, (keybindingItem) => KeybindingsEditorModel.getId(keybindingItem));
    this._keybindingItems = this._keybindingItemsSortedByPrecedence.slice(0).sort((a, b) => KeybindingsEditorModel.compareKeybindingData(a, b));
    return super.resolve();
  }
  static getId(keybindingItem) {
    return keybindingItem.command + (keybindingItem?.keybinding?.getAriaLabel() ?? "") + keybindingItem.when + (isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.identifier.value);
  }
  getExtensionsMapping() {
    const extensions = new ExtensionIdentifierMap();
    for (const extension of this.extensionService.extensions) {
      extensions.set(extension.identifier, extension);
    }
    return extensions;
  }
  static compareKeybindingData(a, b) {
    if (a.keybinding && !b.keybinding) {
      return -1;
    }
    if (b.keybinding && !a.keybinding) {
      return 1;
    }
    if (a.commandLabel && !b.commandLabel) {
      return -1;
    }
    if (b.commandLabel && !a.commandLabel) {
      return 1;
    }
    if (a.commandLabel && b.commandLabel) {
      if (a.commandLabel !== b.commandLabel) {
        return a.commandLabel.localeCompare(b.commandLabel);
      }
    }
    if (a.command === b.command) {
      return a.keybindingItem.isDefault ? 1 : -1;
    }
    return a.command.localeCompare(b.command);
  }
  static toKeybindingEntry(command, keybindingItem, actions, extensions) {
    const menuCommand = MenuRegistry.getCommand(command);
    const editorActionLabel = actions.get(command);
    let source = SOURCE_USER;
    if (keybindingItem.isDefault) {
      const extensionId = keybindingItem.extensionId ?? (keybindingItem.resolvedKeybinding ? void 0 : menuCommand?.source?.id);
      source = extensionId ? extensions.get(extensionId) ?? SOURCE_EXTENSION : SOURCE_SYSTEM;
    }
    return {
      keybinding: keybindingItem.resolvedKeybinding,
      keybindingItem,
      command,
      commandLabel: KeybindingsEditorModel.getCommandLabel(menuCommand, editorActionLabel),
      commandDefaultLabel: KeybindingsEditorModel.getCommandDefaultLabel(menuCommand),
      when: keybindingItem.when ? keybindingItem.when.serialize() : "",
      source
    };
  }
  static getCommandDefaultLabel(menuCommand) {
    if (!Language.isDefaultVariant()) {
      if (menuCommand && menuCommand.title && menuCommand.title.original) {
        const category = menuCommand.category ? menuCommand.category.original : void 0;
        const title = menuCommand.title.original;
        return category ? localize("cat.title", "{0}: {1}", category, title) : title;
      }
    }
    return null;
  }
  static getCommandLabel(menuCommand, editorActionLabel) {
    if (menuCommand) {
      const category = menuCommand.category ? typeof menuCommand.category === "string" ? menuCommand.category : menuCommand.category.value : void 0;
      const title = typeof menuCommand.title === "string" ? menuCommand.title : menuCommand.title.value;
      return category ? localize("cat.title", "{0}: {1}", category, title) : title;
    }
    if (editorActionLabel) {
      return editorActionLabel;
    }
    return "";
  }
};
KeybindingsEditorModel = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IExtensionService)
], KeybindingsEditorModel);
class KeybindingItemMatches {
  constructor(modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch) {
    this.modifierLabels = modifierLabels;
    this.commandIdMatches = null;
    this.commandLabelMatches = null;
    this.commandDefaultLabelMatches = null;
    this.sourceMatches = null;
    this.whenMatches = null;
    this.keybindingMatches = null;
    this.extensionIdMatches = null;
    this.extensionLabelMatches = null;
    if (!completeMatch) {
      this.commandIdMatches = this.matches(searchValue, keybindingItem.command, or(matchesWords, matchesCamelCase), words);
      this.commandLabelMatches = keybindingItem.commandLabel ? this.matches(searchValue, keybindingItem.commandLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
      this.commandDefaultLabelMatches = keybindingItem.commandDefaultLabel ? this.matches(searchValue, keybindingItem.commandDefaultLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandDefaultLabel, true), words) : null;
      this.whenMatches = keybindingItem.when ? this.matches(null, keybindingItem.when, or(matchesWords, matchesCamelCase), words) : null;
      if (isString(keybindingItem.source)) {
        this.sourceMatches = this.matches(searchValue, keybindingItem.source, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.source, true), words);
      } else {
        this.extensionLabelMatches = keybindingItem.source.displayName ? this.matches(searchValue, keybindingItem.source.displayName, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
      }
    }
    this.keybindingMatches = keybindingItem.keybinding ? this.matchesKeybinding(keybindingItem.keybinding, searchValue, keybindingWords, completeMatch) : null;
  }
  matches(searchValue, wordToMatchAgainst, wordMatchesFilter, words) {
    let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
    if (!matches) {
      matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
    }
    if (matches) {
      matches = this.filterAndSort(matches);
    }
    return matches;
  }
  matchesWords(words, wordToMatchAgainst, wordMatchesFilter) {
    let matches = [];
    for (const word of words) {
      const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
      if (wordMatches) {
        matches = [...matches || [], ...wordMatches];
      } else {
        matches = null;
        break;
      }
    }
    return matches;
  }
  filterAndSort(matches) {
    return distinct(matches, ((a) => a.start + "." + a.end)).filter((match) => !matches.some((m) => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);
  }
  matchesKeybinding(keybinding, searchValue, words, completeMatch) {
    const [firstPart, chordPart] = keybinding.getChords();
    const userSettingsLabel = keybinding.getUserSettingsLabel();
    const ariaLabel = keybinding.getAriaLabel();
    const label = keybinding.getLabel();
    if (userSettingsLabel && strings.compareIgnoreCase(searchValue, userSettingsLabel) === 0 || ariaLabel && strings.compareIgnoreCase(searchValue, ariaLabel) === 0 || label && strings.compareIgnoreCase(searchValue, label) === 0) {
      return {
        firstPart: this.createCompleteMatch(firstPart),
        chordPart: this.createCompleteMatch(chordPart)
      };
    }
    const firstPartMatch = {};
    let chordPartMatch = {};
    const matchedWords = [];
    const firstPartMatchedWords = [];
    let chordPartMatchedWords = [];
    let matchFirstPart = true;
    for (let index = 0; index < words.length; index++) {
      const word = words[index];
      let firstPartMatched = false;
      let chordPartMatched = false;
      matchFirstPart = matchFirstPart && !firstPartMatch.keyCode;
      let matchChordPart = !chordPartMatch.keyCode;
      if (matchFirstPart) {
        firstPartMatched = this.matchPart(firstPart, firstPartMatch, word, completeMatch);
        if (firstPartMatch.keyCode) {
          for (const cordPartMatchedWordIndex of chordPartMatchedWords) {
            if (firstPartMatchedWords.indexOf(cordPartMatchedWordIndex) === -1) {
              matchedWords.splice(matchedWords.indexOf(cordPartMatchedWordIndex), 1);
            }
          }
          chordPartMatch = {};
          chordPartMatchedWords = [];
          matchChordPart = false;
        }
      }
      if (matchChordPart) {
        chordPartMatched = this.matchPart(chordPart, chordPartMatch, word, completeMatch);
      }
      if (firstPartMatched) {
        firstPartMatchedWords.push(index);
      }
      if (chordPartMatched) {
        chordPartMatchedWords.push(index);
      }
      if (firstPartMatched || chordPartMatched) {
        matchedWords.push(index);
      }
      matchFirstPart = matchFirstPart && this.isModifier(word);
    }
    if (matchedWords.length !== words.length) {
      return null;
    }
    if (completeMatch) {
      if (!this.isCompleteMatch(firstPart, firstPartMatch)) {
        return null;
      }
      if (!isEmptyObject(chordPartMatch) && !this.isCompleteMatch(chordPart, chordPartMatch)) {
        return null;
      }
    }
    return this.hasAnyMatch(firstPartMatch) || this.hasAnyMatch(chordPartMatch) ? { firstPart: firstPartMatch, chordPart: chordPartMatch } : null;
  }
  matchPart(chord, match, word, completeMatch) {
    let matched = false;
    if (this.matchesMetaModifier(chord, word)) {
      matched = true;
      match.metaKey = true;
    }
    if (this.matchesCtrlModifier(chord, word)) {
      matched = true;
      match.ctrlKey = true;
    }
    if (this.matchesShiftModifier(chord, word)) {
      matched = true;
      match.shiftKey = true;
    }
    if (this.matchesAltModifier(chord, word)) {
      matched = true;
      match.altKey = true;
    }
    if (this.matchesKeyCode(chord, word, completeMatch)) {
      match.keyCode = true;
      matched = true;
    }
    return matched;
  }
  matchesKeyCode(chord, word, completeMatch) {
    if (!chord) {
      return false;
    }
    const ariaLabel = chord.keyAriaLabel || "";
    if (completeMatch || ariaLabel.length === 1 || word.length === 1) {
      if (strings.compareIgnoreCase(ariaLabel, word) === 0) {
        return true;
      }
    } else {
      if (matchesContiguousSubString(word, ariaLabel)) {
        return true;
      }
    }
    return false;
  }
  matchesMetaModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.metaKey) {
      return false;
    }
    return this.wordMatchesMetaModifier(word);
  }
  matchesCtrlModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.ctrlKey) {
      return false;
    }
    return this.wordMatchesCtrlModifier(word);
  }
  matchesShiftModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.shiftKey) {
      return false;
    }
    return this.wordMatchesShiftModifier(word);
  }
  matchesAltModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.altKey) {
      return false;
    }
    return this.wordMatchesAltModifier(word);
  }
  hasAnyMatch(keybindingMatch) {
    return !!keybindingMatch.altKey || !!keybindingMatch.ctrlKey || !!keybindingMatch.metaKey || !!keybindingMatch.shiftKey || !!keybindingMatch.keyCode;
  }
  isCompleteMatch(chord, match) {
    if (!chord) {
      return true;
    }
    if (!match.keyCode) {
      return false;
    }
    if (chord.metaKey && !match.metaKey) {
      return false;
    }
    if (chord.altKey && !match.altKey) {
      return false;
    }
    if (chord.ctrlKey && !match.ctrlKey) {
      return false;
    }
    if (chord.shiftKey && !match.shiftKey) {
      return false;
    }
    return true;
  }
  createCompleteMatch(chord) {
    const match = {};
    if (chord) {
      match.keyCode = true;
      if (chord.metaKey) {
        match.metaKey = true;
      }
      if (chord.altKey) {
        match.altKey = true;
      }
      if (chord.ctrlKey) {
        match.ctrlKey = true;
      }
      if (chord.shiftKey) {
        match.shiftKey = true;
      }
    }
    return match;
  }
  isModifier(word) {
    if (this.wordMatchesAltModifier(word)) {
      return true;
    }
    if (this.wordMatchesCtrlModifier(word)) {
      return true;
    }
    if (this.wordMatchesMetaModifier(word)) {
      return true;
    }
    if (this.wordMatchesShiftModifier(word)) {
      return true;
    }
    return false;
  }
  wordMatchesAltModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.altKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.altKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.altKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(localize("option", "option"), word)) {
      return true;
    }
    return false;
  }
  wordMatchesCtrlModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.ctrlKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.ctrlKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.ctrlKey, word)) {
      return true;
    }
    return false;
  }
  wordMatchesMetaModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.metaKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.metaKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.metaKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(localize("meta", "meta"), word)) {
      return true;
    }
    return false;
  }
  wordMatchesShiftModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.shiftKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.shiftKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.shiftKey, word)) {
      return true;
    }
    return false;
  }
}
export {
  KEYBINDING_ENTRY_TEMPLATE_ID,
  KeybindingsEditorModel,
  createKeybindingCommandQuery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9icm93c2VyL2tleWJpbmRpbmdzRWRpdG9yTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCwgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSwgTGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTWF0Y2gsIElGaWx0ZXIsIG9yLCBtYXRjaGVzQ2FtZWxDYXNlLCBtYXRjaGVzV29yZHMsIG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZywgUmVzb2x2ZWRDaG9yZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IEFyaWFMYWJlbFByb3ZpZGVyLCBVc2VyU2V0dGluZ3NMYWJlbFByb3ZpZGVyLCBVSUxhYmVsUHJvdmlkZXIsIE1vZGlmaWVyTGFiZWxzIGFzIE1vZExhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdMYWJlbHMuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBnZXRBbGxVbmJvdW5kQ29tbWFuZHMgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2Jyb3dzZXIvdW5ib3VuZENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nSXRlbUVudHJ5LCBLZXliaW5kaW5nTWF0Y2hlcywgS2V5YmluZGluZ01hdGNoLCBJS2V5YmluZGluZ0l0ZW0gfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRBY3Rpb24sIElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0VtcHR5T2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5cbmV4cG9ydCBjb25zdCBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEID0gJ2tleWJpbmRpbmcuZW50cnkudGVtcGxhdGUnO1xuXG5jb25zdCBTT1VSQ0VfU1lTVEVNID0gbG9jYWxpemUoJ2RlZmF1bHQnLCBcIlN5c3RlbVwiKTtcbmNvbnN0IFNPVVJDRV9FWFRFTlNJT04gPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uJywgXCJFeHRlbnNpb25cIik7XG5jb25zdCBTT1VSQ0VfVVNFUiA9IGxvY2FsaXplKCd1c2VyJywgXCJVc2VyXCIpO1xuXG5pbnRlcmZhY2UgTW9kaWZpZXJMYWJlbHMge1xuXHR1aTogTW9kTGFiZWxzO1xuXHRhcmlhOiBNb2RMYWJlbHM7XG5cdHVzZXI6IE1vZExhYmVscztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUtleWJpbmRpbmdDb21tYW5kUXVlcnkoY29tbWFuZElkOiBzdHJpbmcsIHdoZW4/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB3aGVuUGFydCA9IHdoZW4gPyBgICt3aGVuOiR7d2hlbn1gIDogJyc7XG5cdHJldHVybiBgQGNvbW1hbmQ6JHtjb21tYW5kSWR9JHt3aGVuUGFydH1gO1xufVxuXG5jb25zdCB3b3JkRmlsdGVyID0gb3IobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzV29yZHMpO1xuY29uc3QgQ09NTUFORF9SRUdFWCA9IC9AY29tbWFuZDpcXHMqKFteXFwrXSspL2k7XG5jb25zdCBXSEVOX1JFR0VYID0gL1xcK3doZW46XFxzKiguKykvaTtcbmNvbnN0IFNPVVJDRV9SRUdFWCA9IC9Ac291cmNlOlxccyoodXNlcnxkZWZhdWx0fHN5c3RlbXxleHRlbnNpb24pL2k7XG5jb25zdCBFWFRFTlNJT05fUkVHRVggPSAvQGV4dDpcXHMqKChcIi4rXCIpfChbXlxcc10rKSkvaTtcbmNvbnN0IEtFWUJJTkRJTkdfUkVHRVggPSAvQGtleWJpbmRpbmc6XFxzKigoXFxcIi4rXFxcIil8KFxcUyspKS9pO1xuXG5leHBvcnQgY2xhc3MgS2V5YmluZGluZ3NFZGl0b3JNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIF9rZXliaW5kaW5nSXRlbXM6IElLZXliaW5kaW5nSXRlbVtdO1xuXHRwcml2YXRlIF9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2U6IElLZXliaW5kaW5nSXRlbVtdO1xuXHRwcml2YXRlIG1vZGlmaWVyTGFiZWxzOiBNb2RpZmllckxhYmVscztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvczogT3BlcmF0aW5nU3lzdGVtLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nc1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9rZXliaW5kaW5nSXRlbXMgPSBbXTtcblx0XHR0aGlzLl9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2UgPSBbXTtcblx0XHR0aGlzLm1vZGlmaWVyTGFiZWxzID0ge1xuXHRcdFx0dWk6IFVJTGFiZWxQcm92aWRlci5tb2RpZmllckxhYmVsc1tvc10sXG5cdFx0XHRhcmlhOiBBcmlhTGFiZWxQcm92aWRlci5tb2RpZmllckxhYmVsc1tvc10sXG5cdFx0XHR1c2VyOiBVc2VyU2V0dGluZ3NMYWJlbFByb3ZpZGVyLm1vZGlmaWVyTGFiZWxzW29zXVxuXHRcdH07XG5cdH1cblxuXHRmZXRjaChzZWFyY2hWYWx1ZTogc3RyaW5nLCBzb3J0QnlQcmVjZWRlbmNlOiBib29sZWFuID0gZmFsc2UpOiBJS2V5YmluZGluZ0l0ZW1FbnRyeVtdIHtcblx0XHRsZXQga2V5YmluZGluZ0l0ZW1zID0gc29ydEJ5UHJlY2VkZW5jZSA/IHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZSA6IHRoaXMuX2tleWJpbmRpbmdJdGVtcztcblxuXHRcdC8vIEBjb21tYW5kOkNPTU1BTkRfSURcblx0XHRjb25zdCBjb21tYW5kSWRNYXRjaGVzID0gQ09NTUFORF9SRUdFWC5leGVjKHNlYXJjaFZhbHVlKTtcblx0XHRpZiAoY29tbWFuZElkTWF0Y2hlcyAmJiBjb21tYW5kSWRNYXRjaGVzWzFdKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gY29tbWFuZElkTWF0Y2hlc1sxXS50cmltKCk7XG5cdFx0XHRsZXQgZmlsdGVyZWRLZXliaW5kaW5nSXRlbXMgPSBrZXliaW5kaW5nSXRlbXMuZmlsdGVyKGsgPT4gay5jb21tYW5kID09PSBjb21tYW5kKTtcblxuXHRcdFx0Ly8gK3doZW46V0hFTl9FWFBSRVNTSU9OXG5cdFx0XHRpZiAoZmlsdGVyZWRLZXliaW5kaW5nSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHdoZW5NYXRjaGVzID0gV0hFTl9SRUdFWC5leGVjKHNlYXJjaFZhbHVlKTtcblx0XHRcdFx0aWYgKHdoZW5NYXRjaGVzICYmIHdoZW5NYXRjaGVzWzFdKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2hlblZhbHVlID0gd2hlbk1hdGNoZXNbMV0udHJpbSgpO1xuXHRcdFx0XHRcdGZpbHRlcmVkS2V5YmluZGluZ0l0ZW1zID0gdGhpcy5maWx0ZXJCeVdoZW4oZmlsdGVyZWRLZXliaW5kaW5nSXRlbXMsIGNvbW1hbmQsIHdoZW5WYWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZpbHRlcmVkS2V5YmluZGluZ0l0ZW1zLm1hcCgoa2V5YmluZGluZ0l0ZW0pOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSA9PiAoeyBpZDogS2V5YmluZGluZ3NFZGl0b3JNb2RlbC5nZXRJZChrZXliaW5kaW5nSXRlbSksIGtleWJpbmRpbmdJdGVtLCB0ZW1wbGF0ZUlkOiBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEIH0pKTtcblx0XHR9XG5cblx0XHQvLyBAc291cmNlOlNPVVJDRVxuXHRcdGlmIChTT1VSQ0VfUkVHRVgudGVzdChzZWFyY2hWYWx1ZSkpIHtcblx0XHRcdGtleWJpbmRpbmdJdGVtcyA9IHRoaXMuZmlsdGVyQnlTb3VyY2Uoa2V5YmluZGluZ0l0ZW1zLCBzZWFyY2hWYWx1ZSk7XG5cdFx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnJlcGxhY2UoU09VUkNFX1JFR0VYLCAnJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEBleHQ6RVhURU5TSU9OX0lEXG5cdFx0XHRjb25zdCBleHRlbnNpb25NYXRjaGVzID0gRVhURU5TSU9OX1JFR0VYLmV4ZWMoc2VhcmNoVmFsdWUpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbk1hdGNoZXMgJiYgKGV4dGVuc2lvbk1hdGNoZXNbMl0gfHwgZXh0ZW5zaW9uTWF0Y2hlc1szXSkpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBleHRlbnNpb25NYXRjaGVzWzJdID8gZXh0ZW5zaW9uTWF0Y2hlc1syXS5zdWJzdHJpbmcoMSwgZXh0ZW5zaW9uTWF0Y2hlc1syXS5sZW5ndGggLSAxKSA6IGV4dGVuc2lvbk1hdGNoZXNbM107XG5cdFx0XHRcdGtleWJpbmRpbmdJdGVtcyA9IHRoaXMuZmlsdGVyQnlFeHRlbnNpb24oa2V5YmluZGluZ0l0ZW1zLCBleHRlbnNpb25JZCk7XG5cdFx0XHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUucmVwbGFjZShFWFRFTlNJT05fUkVHRVgsICcnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEBrZXliaW5kaW5nOktFWUJJTkRJTkdcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ01hdGNoZXMgPSBLRVlCSU5ESU5HX1JFR0VYLmV4ZWMoc2VhcmNoVmFsdWUpO1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZ01hdGNoZXMgJiYgKGtleWJpbmRpbmdNYXRjaGVzWzJdIHx8IGtleWJpbmRpbmdNYXRjaGVzWzNdKSkge1xuXHRcdFx0XHRcdHNlYXJjaFZhbHVlID0ga2V5YmluZGluZ01hdGNoZXNbMl0gfHwgYFwiJHtrZXliaW5kaW5nTWF0Y2hlc1szXX1cImA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnRyaW0oKTtcblx0XHRpZiAoIXNlYXJjaFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4ga2V5YmluZGluZ0l0ZW1zLm1hcCgoa2V5YmluZGluZ0l0ZW0pOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSA9PiAoeyBpZDogS2V5YmluZGluZ3NFZGl0b3JNb2RlbC5nZXRJZChrZXliaW5kaW5nSXRlbSksIGtleWJpbmRpbmdJdGVtLCB0ZW1wbGF0ZUlkOiBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEIH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5maWx0ZXJCeVRleHQoa2V5YmluZGluZ0l0ZW1zLCBzZWFyY2hWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckJ5U291cmNlKGtleWJpbmRpbmdJdGVtczogSUtleWJpbmRpbmdJdGVtW10sIHNlYXJjaFZhbHVlOiBzdHJpbmcpOiBJS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0aWYgKC9Ac291cmNlOlxccypkZWZhdWx0L2kudGVzdChzZWFyY2hWYWx1ZSkgfHwgL0Bzb3VyY2U6XFxzKnN5c3RlbS9pLnRlc3Qoc2VhcmNoVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4ga2V5YmluZGluZ0l0ZW1zLmZpbHRlcihrID0+IGsuc291cmNlID09PSBTT1VSQ0VfU1lTVEVNKTtcblx0XHR9XG5cdFx0aWYgKC9Ac291cmNlOlxccyp1c2VyL2kudGVzdChzZWFyY2hWYWx1ZSkpIHtcblx0XHRcdHJldHVybiBrZXliaW5kaW5nSXRlbXMuZmlsdGVyKGsgPT4gay5zb3VyY2UgPT09IFNPVVJDRV9VU0VSKTtcblx0XHR9XG5cdFx0aWYgKC9Ac291cmNlOlxccypleHRlbnNpb24vaS50ZXN0KHNlYXJjaFZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIGtleWJpbmRpbmdJdGVtcy5maWx0ZXIoayA9PiAhaXNTdHJpbmcoay5zb3VyY2UpIHx8IGsuc291cmNlID09PSBTT1VSQ0VfRVhURU5TSU9OKTtcblx0XHR9XG5cdFx0cmV0dXJuIGtleWJpbmRpbmdJdGVtcztcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyQnlFeHRlbnNpb24oa2V5YmluZGluZ0l0ZW1zOiBJS2V5YmluZGluZ0l0ZW1bXSwgZXh0ZW5zaW9uOiBzdHJpbmcpOiBJS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXHRcdHJldHVybiBrZXliaW5kaW5nSXRlbXMuZmlsdGVyKGsgPT4gIWlzU3RyaW5nKGsuc291cmNlKSAmJiAoRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoay5zb3VyY2UuaWRlbnRpZmllciwgZXh0ZW5zaW9uKSB8fCBrLnNvdXJjZS5kaXNwbGF5TmFtZT8udG9Mb3dlckNhc2UoKSA9PT0gZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyQnlUZXh0KGtleWJpbmRpbmdJdGVtczogSUtleWJpbmRpbmdJdGVtW10sIHNlYXJjaFZhbHVlOiBzdHJpbmcpOiBJS2V5YmluZGluZ0l0ZW1FbnRyeVtdIHtcblx0XHRjb25zdCBxdW90ZUF0Rmlyc3RDaGFyID0gc2VhcmNoVmFsdWUuY2hhckF0KDApID09PSAnXCInO1xuXHRcdGNvbnN0IHF1b3RlQXRMYXN0Q2hhciA9IHNlYXJjaFZhbHVlLmNoYXJBdChzZWFyY2hWYWx1ZS5sZW5ndGggLSAxKSA9PT0gJ1wiJztcblx0XHRjb25zdCBjb21wbGV0ZU1hdGNoID0gcXVvdGVBdEZpcnN0Q2hhciAmJiBxdW90ZUF0TGFzdENoYXI7XG5cdFx0aWYgKHF1b3RlQXRGaXJzdENoYXIpIHtcblx0XHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUuc3Vic3RyaW5nKDEpO1xuXHRcdH1cblx0XHRpZiAocXVvdGVBdExhc3RDaGFyKSB7XG5cdFx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnN1YnN0cmluZygwLCBzZWFyY2hWYWx1ZS5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0c2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZS50cmltKCk7XG5cblx0XHRjb25zdCByZXN1bHQ6IElLZXliaW5kaW5nSXRlbUVudHJ5W10gPSBbXTtcblx0XHRjb25zdCB3b3JkcyA9IHNlYXJjaFZhbHVlLnNwbGl0KCcgJyk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1dvcmRzID0gdGhpcy5zcGxpdEtleWJpbmRpbmdXb3Jkcyh3b3Jkcyk7XG5cdFx0Zm9yIChjb25zdCBrZXliaW5kaW5nSXRlbSBvZiBrZXliaW5kaW5nSXRlbXMpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdNYXRjaGVzID0gbmV3IEtleWJpbmRpbmdJdGVtTWF0Y2hlcyh0aGlzLm1vZGlmaWVyTGFiZWxzLCBrZXliaW5kaW5nSXRlbSwgc2VhcmNoVmFsdWUsIHdvcmRzLCBrZXliaW5kaW5nV29yZHMsIGNvbXBsZXRlTWF0Y2gpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmdNYXRjaGVzLmNvbW1hbmRJZE1hdGNoZXNcblx0XHRcdFx0fHwga2V5YmluZGluZ01hdGNoZXMuY29tbWFuZExhYmVsTWF0Y2hlc1xuXHRcdFx0XHR8fCBrZXliaW5kaW5nTWF0Y2hlcy5jb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlc1xuXHRcdFx0XHR8fCBrZXliaW5kaW5nTWF0Y2hlcy5zb3VyY2VNYXRjaGVzXG5cdFx0XHRcdHx8IGtleWJpbmRpbmdNYXRjaGVzLndoZW5NYXRjaGVzXG5cdFx0XHRcdHx8IGtleWJpbmRpbmdNYXRjaGVzLmtleWJpbmRpbmdNYXRjaGVzXG5cdFx0XHRcdHx8IGtleWJpbmRpbmdNYXRjaGVzLmV4dGVuc2lvbklkTWF0Y2hlc1xuXHRcdFx0XHR8fCBrZXliaW5kaW5nTWF0Y2hlcy5leHRlbnNpb25MYWJlbE1hdGNoZXNcblx0XHRcdCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IEtleWJpbmRpbmdzRWRpdG9yTW9kZWwuZ2V0SWQoa2V5YmluZGluZ0l0ZW0pLFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0Y29tbWFuZExhYmVsTWF0Y2hlczoga2V5YmluZGluZ01hdGNoZXMuY29tbWFuZExhYmVsTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZXM6IGtleWJpbmRpbmdNYXRjaGVzLmNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRrZXliaW5kaW5nSXRlbSxcblx0XHRcdFx0XHRrZXliaW5kaW5nTWF0Y2hlczoga2V5YmluZGluZ01hdGNoZXMua2V5YmluZGluZ01hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbW1hbmRJZE1hdGNoZXM6IGtleWJpbmRpbmdNYXRjaGVzLmNvbW1hbmRJZE1hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZU1hdGNoZXM6IGtleWJpbmRpbmdNYXRjaGVzLnNvdXJjZU1hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHdoZW5NYXRjaGVzOiBrZXliaW5kaW5nTWF0Y2hlcy53aGVuTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWRNYXRjaGVzOiBrZXliaW5kaW5nTWF0Y2hlcy5leHRlbnNpb25JZE1hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkxhYmVsTWF0Y2hlczoga2V5YmluZGluZ01hdGNoZXMuZXh0ZW5zaW9uTGFiZWxNYXRjaGVzIHx8IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyQnlXaGVuKGtleWJpbmRpbmdJdGVtczogSUtleWJpbmRpbmdJdGVtW10sIGNvbW1hbmQ6IHN0cmluZywgd2hlbjogc3RyaW5nKTogSUtleWJpbmRpbmdJdGVtW10ge1xuXHRcdGlmIChrZXliaW5kaW5nSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYSBrZXliaW5kaW5nIHdpdGggdGhlIHNhbWUgY29tbWFuZCBpZCBhbmQgd2hlbiBjbGF1c2UgZXhpc3RzXG5cdFx0Y29uc3Qga2V5YmluZGluZ0l0ZW1zV2l0aFdoZW4gPSBrZXliaW5kaW5nSXRlbXMuZmlsdGVyKGsgPT4gay53aGVuID09PSB3aGVuKTtcblx0XHRpZiAoa2V5YmluZGluZ0l0ZW1zV2l0aFdoZW4ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4ga2V5YmluZGluZ0l0ZW1zV2l0aFdoZW47XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IGVudHJ5IHdpdGggdGhlIHdoZW4gY2xhdXNlIHdoaWNoIGRvZXMgbm90IGxpdmUgaW4gdGhlIG1vZGVsXG5cdFx0Ly8gV2UgY2FuIHJldXNlIHNvbWUgb2YgdGhlIHByb3BlcnRpZXMgZnJvbSB0aGUgc2FtZSBjb21tYW5kIHdpdGggZGlmZmVyZW50IHdoZW4gY2xhdXNlXG5cdFx0Y29uc3QgY29tbWFuZExhYmVsID0ga2V5YmluZGluZ0l0ZW1zWzBdLmNvbW1hbmRMYWJlbDtcblxuXHRcdGNvbnN0IGtleWJpbmRpbmdJdGVtID0gbmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0odW5kZWZpbmVkLCBjb21tYW5kLCBudWxsLCBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh3aGVuKSwgZmFsc2UsIG51bGwsIGZhbHNlKTtcblx0XHRjb25zdCBhY3Rpb25MYWJlbHMgPSBuZXcgTWFwKFtbY29tbWFuZCwgY29tbWFuZExhYmVsXV0pO1xuXHRcdHJldHVybiBbS2V5YmluZGluZ3NFZGl0b3JNb2RlbC50b0tleWJpbmRpbmdFbnRyeShjb21tYW5kLCBrZXliaW5kaW5nSXRlbSwgYWN0aW9uTGFiZWxzLCB0aGlzLmdldEV4dGVuc2lvbnNNYXBwaW5nKCkpXTtcblx0fVxuXG5cdHByaXZhdGUgc3BsaXRLZXliaW5kaW5nV29yZHMod29yZHNTZXBhcmF0ZWRCeVNwYWNlczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgd29yZCBvZiB3b3Jkc1NlcGFyYXRlZEJ5U3BhY2VzKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5jb2FsZXNjZSh3b3JkLnNwbGl0KCcrJykpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoYWN0aW9uTGFiZWxzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSB0aGlzLmdldEV4dGVuc2lvbnNNYXBwaW5nKCk7XG5cblx0XHR0aGlzLl9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2UgPSBbXTtcblx0XHRjb25zdCBib3VuZENvbW1hbmRzOiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXHRcdGZvciAoY29uc3Qga2V5YmluZGluZyBvZiB0aGlzLmtleWJpbmRpbmdzU2VydmljZS5nZXRLZXliaW5kaW5ncygpKSB7XG5cdFx0XHRpZiAoa2V5YmluZGluZy5jb21tYW5kKSB7IC8vIFNraXAga2V5YmluZGluZ3Mgd2l0aG91dCBjb21tYW5kc1xuXHRcdFx0XHR0aGlzLl9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2UucHVzaChLZXliaW5kaW5nc0VkaXRvck1vZGVsLnRvS2V5YmluZGluZ0VudHJ5KGtleWJpbmRpbmcuY29tbWFuZCwga2V5YmluZGluZywgYWN0aW9uTGFiZWxzLCBleHRlbnNpb25zKSk7XG5cdFx0XHRcdGJvdW5kQ29tbWFuZHMuc2V0KGtleWJpbmRpbmcuY29tbWFuZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZHNXaXRoRGVmYXVsdEtleWJpbmRpbmdzID0gdGhpcy5rZXliaW5kaW5nc1NlcnZpY2UuZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCkubWFwKGtleWJpbmRpbmcgPT4ga2V5YmluZGluZy5jb21tYW5kKTtcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgZ2V0QWxsVW5ib3VuZENvbW1hbmRzKGJvdW5kQ29tbWFuZHMpKSB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nSXRlbSA9IG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHVuZGVmaW5lZCwgY29tbWFuZCwgbnVsbCwgdW5kZWZpbmVkLCBjb21tYW5kc1dpdGhEZWZhdWx0S2V5YmluZGluZ3MuaW5kZXhPZihjb21tYW5kKSA9PT0gLTEsIG51bGwsIGZhbHNlKTtcblx0XHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZS5wdXNoKEtleWJpbmRpbmdzRWRpdG9yTW9kZWwudG9LZXliaW5kaW5nRW50cnkoY29tbWFuZCwga2V5YmluZGluZ0l0ZW0sIGFjdGlvbkxhYmVscywgZXh0ZW5zaW9ucykpO1xuXHRcdH1cblx0XHR0aGlzLl9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2UgPSBkaXN0aW5jdCh0aGlzLl9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2UsIGtleWJpbmRpbmdJdGVtID0+IEtleWJpbmRpbmdzRWRpdG9yTW9kZWwuZ2V0SWQoa2V5YmluZGluZ0l0ZW0pKTtcblx0XHR0aGlzLl9rZXliaW5kaW5nSXRlbXMgPSB0aGlzLl9rZXliaW5kaW5nSXRlbXNTb3J0ZWRCeVByZWNlZGVuY2Uuc2xpY2UoMCkuc29ydCgoYSwgYikgPT4gS2V5YmluZGluZ3NFZGl0b3JNb2RlbC5jb21wYXJlS2V5YmluZGluZ0RhdGEoYSwgYikpO1xuXG5cdFx0cmV0dXJuIHN1cGVyLnJlc29sdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldElkKGtleWJpbmRpbmdJdGVtOiBJS2V5YmluZGluZ0l0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXliaW5kaW5nSXRlbS5jb21tYW5kICsgKGtleWJpbmRpbmdJdGVtPy5rZXliaW5kaW5nPy5nZXRBcmlhTGFiZWwoKSA/PyAnJykgKyBrZXliaW5kaW5nSXRlbS53aGVuICsgKGlzU3RyaW5nKGtleWJpbmRpbmdJdGVtLnNvdXJjZSkgPyBrZXliaW5kaW5nSXRlbS5zb3VyY2UgOiBrZXliaW5kaW5nSXRlbS5zb3VyY2UuaWRlbnRpZmllci52YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbnNNYXBwaW5nKCk6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPElFeHRlbnNpb25EZXNjcmlwdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgY29tcGFyZUtleWJpbmRpbmdEYXRhKGE6IElLZXliaW5kaW5nSXRlbSwgYjogSUtleWJpbmRpbmdJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoYS5rZXliaW5kaW5nICYmICFiLmtleWJpbmRpbmcpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKGIua2V5YmluZGluZyAmJiAhYS5rZXliaW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0aWYgKGEuY29tbWFuZExhYmVsICYmICFiLmNvbW1hbmRMYWJlbCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAoYi5jb21tYW5kTGFiZWwgJiYgIWEuY29tbWFuZExhYmVsKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0aWYgKGEuY29tbWFuZExhYmVsICYmIGIuY29tbWFuZExhYmVsKSB7XG5cdFx0XHRpZiAoYS5jb21tYW5kTGFiZWwgIT09IGIuY29tbWFuZExhYmVsKSB7XG5cdFx0XHRcdHJldHVybiBhLmNvbW1hbmRMYWJlbC5sb2NhbGVDb21wYXJlKGIuY29tbWFuZExhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGEuY29tbWFuZCA9PT0gYi5jb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gYS5rZXliaW5kaW5nSXRlbS5pc0RlZmF1bHQgPyAxIDogLTE7XG5cdFx0fVxuXHRcdHJldHVybiBhLmNvbW1hbmQubG9jYWxlQ29tcGFyZShiLmNvbW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgdG9LZXliaW5kaW5nRW50cnkoY29tbWFuZDogc3RyaW5nLCBrZXliaW5kaW5nSXRlbTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSwgYWN0aW9uczogTWFwPHN0cmluZywgc3RyaW5nPiwgZXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KTogSUtleWJpbmRpbmdJdGVtIHtcblx0XHRjb25zdCBtZW51Q29tbWFuZCA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmQpO1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbkxhYmVsID0gYWN0aW9ucy5nZXQoY29tbWFuZCk7XG5cdFx0bGV0IHNvdXJjZTogc3RyaW5nIHwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uID0gU09VUkNFX1VTRVI7XG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtLmlzRGVmYXVsdCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBrZXliaW5kaW5nSXRlbS5leHRlbnNpb25JZCA/PyAoa2V5YmluZGluZ0l0ZW0ucmVzb2x2ZWRLZXliaW5kaW5nID8gdW5kZWZpbmVkIDogbWVudUNvbW1hbmQ/LnNvdXJjZT8uaWQpO1xuXHRcdFx0c291cmNlID0gZXh0ZW5zaW9uSWQgPyBleHRlbnNpb25zLmdldChleHRlbnNpb25JZCkgPz8gU09VUkNFX0VYVEVOU0lPTiA6IFNPVVJDRV9TWVNURU07XG5cdFx0fVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRyZXR1cm4gPElLZXliaW5kaW5nSXRlbT57XG5cdFx0XHRrZXliaW5kaW5nOiBrZXliaW5kaW5nSXRlbS5yZXNvbHZlZEtleWJpbmRpbmcsXG5cdFx0XHRrZXliaW5kaW5nSXRlbSxcblx0XHRcdGNvbW1hbmQsXG5cdFx0XHRjb21tYW5kTGFiZWw6IEtleWJpbmRpbmdzRWRpdG9yTW9kZWwuZ2V0Q29tbWFuZExhYmVsKG1lbnVDb21tYW5kLCBlZGl0b3JBY3Rpb25MYWJlbCksXG5cdFx0XHRjb21tYW5kRGVmYXVsdExhYmVsOiBLZXliaW5kaW5nc0VkaXRvck1vZGVsLmdldENvbW1hbmREZWZhdWx0TGFiZWwobWVudUNvbW1hbmQpLFxuXHRcdFx0d2hlbjoga2V5YmluZGluZ0l0ZW0ud2hlbiA/IGtleWJpbmRpbmdJdGVtLndoZW4uc2VyaWFsaXplKCkgOiAnJyxcblx0XHRcdHNvdXJjZVxuXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldENvbW1hbmREZWZhdWx0TGFiZWwobWVudUNvbW1hbmQ6IElDb21tYW5kQWN0aW9uIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCFMYW5ndWFnZS5pc0RlZmF1bHRWYXJpYW50KCkpIHtcblx0XHRcdGlmIChtZW51Q29tbWFuZCAmJiBtZW51Q29tbWFuZC50aXRsZSAmJiAoPElMb2NhbGl6ZWRTdHJpbmc+bWVudUNvbW1hbmQudGl0bGUpLm9yaWdpbmFsKSB7XG5cdFx0XHRcdGNvbnN0IGNhdGVnb3J5OiBzdHJpbmcgfCB1bmRlZmluZWQgPSBtZW51Q29tbWFuZC5jYXRlZ29yeSA/ICg8SUxvY2FsaXplZFN0cmluZz5tZW51Q29tbWFuZC5jYXRlZ29yeSkub3JpZ2luYWwgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gKDxJTG9jYWxpemVkU3RyaW5nPm1lbnVDb21tYW5kLnRpdGxlKS5vcmlnaW5hbDtcblx0XHRcdFx0cmV0dXJuIGNhdGVnb3J5ID8gbG9jYWxpemUoJ2NhdC50aXRsZScsIFwiezB9OiB7MX1cIiwgY2F0ZWdvcnksIHRpdGxlKSA6IHRpdGxlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldENvbW1hbmRMYWJlbChtZW51Q29tbWFuZDogSUNvbW1hbmRBY3Rpb24gfCB1bmRlZmluZWQsIGVkaXRvckFjdGlvbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmIChtZW51Q29tbWFuZCkge1xuXHRcdFx0Y29uc3QgY2F0ZWdvcnk6IHN0cmluZyB8IHVuZGVmaW5lZCA9IG1lbnVDb21tYW5kLmNhdGVnb3J5ID8gdHlwZW9mIG1lbnVDb21tYW5kLmNhdGVnb3J5ID09PSAnc3RyaW5nJyA/IG1lbnVDb21tYW5kLmNhdGVnb3J5IDogbWVudUNvbW1hbmQuY2F0ZWdvcnkudmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHR5cGVvZiBtZW51Q29tbWFuZC50aXRsZSA9PT0gJ3N0cmluZycgPyBtZW51Q29tbWFuZC50aXRsZSA6IG1lbnVDb21tYW5kLnRpdGxlLnZhbHVlO1xuXHRcdFx0cmV0dXJuIGNhdGVnb3J5ID8gbG9jYWxpemUoJ2NhdC50aXRsZScsIFwiezB9OiB7MX1cIiwgY2F0ZWdvcnksIHRpdGxlKSA6IHRpdGxlO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3JBY3Rpb25MYWJlbCkge1xuXHRcdFx0cmV0dXJuIGVkaXRvckFjdGlvbkxhYmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiAnJztcblx0fVxufVxuXG5jbGFzcyBLZXliaW5kaW5nSXRlbU1hdGNoZXMge1xuXG5cdHJlYWRvbmx5IGNvbW1hbmRJZE1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IGNvbW1hbmRMYWJlbE1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IGNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBzb3VyY2VNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSB3aGVuTWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkga2V5YmluZGluZ01hdGNoZXM6IEtleWJpbmRpbmdNYXRjaGVzIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkTWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uTGFiZWxNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbW9kaWZpZXJMYWJlbHM6IE1vZGlmaWVyTGFiZWxzLCBrZXliaW5kaW5nSXRlbTogSUtleWJpbmRpbmdJdGVtLCBzZWFyY2hWYWx1ZTogc3RyaW5nLCB3b3Jkczogc3RyaW5nW10sIGtleWJpbmRpbmdXb3Jkczogc3RyaW5nW10sIGNvbXBsZXRlTWF0Y2g6IGJvb2xlYW4pIHtcblx0XHRpZiAoIWNvbXBsZXRlTWF0Y2gpIHtcblx0XHRcdHRoaXMuY29tbWFuZElkTWF0Y2hlcyA9IHRoaXMubWF0Y2hlcyhzZWFyY2hWYWx1ZSwga2V5YmluZGluZ0l0ZW0uY29tbWFuZCwgb3IobWF0Y2hlc1dvcmRzLCBtYXRjaGVzQ2FtZWxDYXNlKSwgd29yZHMpO1xuXHRcdFx0dGhpcy5jb21tYW5kTGFiZWxNYXRjaGVzID0ga2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsID8gdGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwsICh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpID0+IG1hdGNoZXNXb3Jkcyh3b3JkLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwsIHRydWUpLCB3b3JkcykgOiBudWxsO1xuXHRcdFx0dGhpcy5jb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlcyA9IGtleWJpbmRpbmdJdGVtLmNvbW1hbmREZWZhdWx0TGFiZWwgPyB0aGlzLm1hdGNoZXMoc2VhcmNoVmFsdWUsIGtleWJpbmRpbmdJdGVtLmNvbW1hbmREZWZhdWx0TGFiZWwsICh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpID0+IG1hdGNoZXNXb3Jkcyh3b3JkLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kRGVmYXVsdExhYmVsLCB0cnVlKSwgd29yZHMpIDogbnVsbDtcblx0XHRcdHRoaXMud2hlbk1hdGNoZXMgPSBrZXliaW5kaW5nSXRlbS53aGVuID8gdGhpcy5tYXRjaGVzKG51bGwsIGtleWJpbmRpbmdJdGVtLndoZW4sIG9yKG1hdGNoZXNXb3JkcywgbWF0Y2hlc0NhbWVsQ2FzZSksIHdvcmRzKSA6IG51bGw7XG5cdFx0XHRpZiAoaXNTdHJpbmcoa2V5YmluZGluZ0l0ZW0uc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLnNvdXJjZU1hdGNoZXMgPSB0aGlzLm1hdGNoZXMoc2VhcmNoVmFsdWUsIGtleWJpbmRpbmdJdGVtLnNvdXJjZSwgKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCkgPT4gbWF0Y2hlc1dvcmRzKHdvcmQsIGtleWJpbmRpbmdJdGVtLnNvdXJjZSBhcyBzdHJpbmcsIHRydWUpLCB3b3Jkcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbkxhYmVsTWF0Y2hlcyA9IGtleWJpbmRpbmdJdGVtLnNvdXJjZS5kaXNwbGF5TmFtZSA/IHRoaXMubWF0Y2hlcyhzZWFyY2hWYWx1ZSwga2V5YmluZGluZ0l0ZW0uc291cmNlLmRpc3BsYXlOYW1lLCAod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KSA9PiBtYXRjaGVzV29yZHMod29yZCwga2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsLCB0cnVlKSwgd29yZHMpIDogbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5rZXliaW5kaW5nTWF0Y2hlcyA9IGtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcgPyB0aGlzLm1hdGNoZXNLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcsIHNlYXJjaFZhbHVlLCBrZXliaW5kaW5nV29yZHMsIGNvbXBsZXRlTWF0Y2gpIDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlcyhzZWFyY2hWYWx1ZTogc3RyaW5nIHwgbnVsbCwgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcsIHdvcmRNYXRjaGVzRmlsdGVyOiBJRmlsdGVyLCB3b3Jkczogc3RyaW5nW10pOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRcdGxldCBtYXRjaGVzID0gc2VhcmNoVmFsdWUgPyB3b3JkRmlsdGVyKHNlYXJjaFZhbHVlLCB3b3JkVG9NYXRjaEFnYWluc3QpIDogbnVsbDtcblx0XHRpZiAoIW1hdGNoZXMpIHtcblx0XHRcdG1hdGNoZXMgPSB0aGlzLm1hdGNoZXNXb3Jkcyh3b3Jkcywgd29yZFRvTWF0Y2hBZ2FpbnN0LCB3b3JkTWF0Y2hlc0ZpbHRlcik7XG5cdFx0fVxuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRtYXRjaGVzID0gdGhpcy5maWx0ZXJBbmRTb3J0KG1hdGNoZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2hlcztcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlc1dvcmRzKHdvcmRzOiBzdHJpbmdbXSwgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcsIHdvcmRNYXRjaGVzRmlsdGVyOiBJRmlsdGVyKTogSU1hdGNoW10gfCBudWxsIHtcblx0XHRsZXQgbWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gW107XG5cdFx0Zm9yIChjb25zdCB3b3JkIG9mIHdvcmRzKSB7XG5cdFx0XHRjb25zdCB3b3JkTWF0Y2hlcyA9IHdvcmRNYXRjaGVzRmlsdGVyKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCk7XG5cdFx0XHRpZiAod29yZE1hdGNoZXMpIHtcblx0XHRcdFx0bWF0Y2hlcyA9IFsuLi4obWF0Y2hlcyB8fCBbXSksIC4uLndvcmRNYXRjaGVzXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hdGNoZXMgPSBudWxsO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoZXM7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckFuZFNvcnQobWF0Y2hlczogSU1hdGNoW10pOiBJTWF0Y2hbXSB7XG5cdFx0cmV0dXJuIGRpc3RpbmN0KG1hdGNoZXMsIChhID0+IGEuc3RhcnQgKyAnLicgKyBhLmVuZCkpLmZpbHRlcihtYXRjaCA9PiAhbWF0Y2hlcy5zb21lKG0gPT4gIShtLnN0YXJ0ID09PSBtYXRjaC5zdGFydCAmJiBtLmVuZCA9PT0gbWF0Y2guZW5kKSAmJiAobS5zdGFydCA8PSBtYXRjaC5zdGFydCAmJiBtLmVuZCA+PSBtYXRjaC5lbmQpKSkuc29ydCgoYSwgYikgPT4gYS5zdGFydCAtIGIuc3RhcnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzS2V5YmluZGluZyhrZXliaW5kaW5nOiBSZXNvbHZlZEtleWJpbmRpbmcsIHNlYXJjaFZhbHVlOiBzdHJpbmcsIHdvcmRzOiBzdHJpbmdbXSwgY29tcGxldGVNYXRjaDogYm9vbGVhbik6IEtleWJpbmRpbmdNYXRjaGVzIHwgbnVsbCB7XG5cdFx0Y29uc3QgW2ZpcnN0UGFydCwgY2hvcmRQYXJ0XSA9IGtleWJpbmRpbmcuZ2V0Q2hvcmRzKCk7XG5cblx0XHRjb25zdCB1c2VyU2V0dGluZ3NMYWJlbCA9IGtleWJpbmRpbmcuZ2V0VXNlclNldHRpbmdzTGFiZWwoKTtcblx0XHRjb25zdCBhcmlhTGFiZWwgPSBrZXliaW5kaW5nLmdldEFyaWFMYWJlbCgpO1xuXHRcdGNvbnN0IGxhYmVsID0ga2V5YmluZGluZy5nZXRMYWJlbCgpO1xuXHRcdGlmICgodXNlclNldHRpbmdzTGFiZWwgJiYgc3RyaW5ncy5jb21wYXJlSWdub3JlQ2FzZShzZWFyY2hWYWx1ZSwgdXNlclNldHRpbmdzTGFiZWwpID09PSAwKVxuXHRcdFx0fHwgKGFyaWFMYWJlbCAmJiBzdHJpbmdzLmNvbXBhcmVJZ25vcmVDYXNlKHNlYXJjaFZhbHVlLCBhcmlhTGFiZWwpID09PSAwKVxuXHRcdFx0fHwgKGxhYmVsICYmIHN0cmluZ3MuY29tcGFyZUlnbm9yZUNhc2Uoc2VhcmNoVmFsdWUsIGxhYmVsKSA9PT0gMCkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZpcnN0UGFydDogdGhpcy5jcmVhdGVDb21wbGV0ZU1hdGNoKGZpcnN0UGFydCksXG5cdFx0XHRcdGNob3JkUGFydDogdGhpcy5jcmVhdGVDb21wbGV0ZU1hdGNoKGNob3JkUGFydClcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RQYXJ0TWF0Y2g6IEtleWJpbmRpbmdNYXRjaCA9IHt9O1xuXHRcdGxldCBjaG9yZFBhcnRNYXRjaDogS2V5YmluZGluZ01hdGNoID0ge307XG5cblx0XHRjb25zdCBtYXRjaGVkV29yZHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZmlyc3RQYXJ0TWF0Y2hlZFdvcmRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCBjaG9yZFBhcnRNYXRjaGVkV29yZHM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IG1hdGNoRmlyc3RQYXJ0ID0gdHJ1ZTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgd29yZHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCB3b3JkID0gd29yZHNbaW5kZXhdO1xuXHRcdFx0bGV0IGZpcnN0UGFydE1hdGNoZWQgPSBmYWxzZTtcblx0XHRcdGxldCBjaG9yZFBhcnRNYXRjaGVkID0gZmFsc2U7XG5cblx0XHRcdG1hdGNoRmlyc3RQYXJ0ID0gbWF0Y2hGaXJzdFBhcnQgJiYgIWZpcnN0UGFydE1hdGNoLmtleUNvZGU7XG5cdFx0XHRsZXQgbWF0Y2hDaG9yZFBhcnQgPSAhY2hvcmRQYXJ0TWF0Y2gua2V5Q29kZTtcblxuXHRcdFx0aWYgKG1hdGNoRmlyc3RQYXJ0KSB7XG5cdFx0XHRcdGZpcnN0UGFydE1hdGNoZWQgPSB0aGlzLm1hdGNoUGFydChmaXJzdFBhcnQsIGZpcnN0UGFydE1hdGNoLCB3b3JkLCBjb21wbGV0ZU1hdGNoKTtcblx0XHRcdFx0aWYgKGZpcnN0UGFydE1hdGNoLmtleUNvZGUpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNvcmRQYXJ0TWF0Y2hlZFdvcmRJbmRleCBvZiBjaG9yZFBhcnRNYXRjaGVkV29yZHMpIHtcblx0XHRcdFx0XHRcdGlmIChmaXJzdFBhcnRNYXRjaGVkV29yZHMuaW5kZXhPZihjb3JkUGFydE1hdGNoZWRXb3JkSW5kZXgpID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRtYXRjaGVkV29yZHMuc3BsaWNlKG1hdGNoZWRXb3Jkcy5pbmRleE9mKGNvcmRQYXJ0TWF0Y2hlZFdvcmRJbmRleCksIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaG9yZFBhcnRNYXRjaCA9IHt9O1xuXHRcdFx0XHRcdGNob3JkUGFydE1hdGNoZWRXb3JkcyA9IFtdO1xuXHRcdFx0XHRcdG1hdGNoQ2hvcmRQYXJ0ID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG1hdGNoQ2hvcmRQYXJ0KSB7XG5cdFx0XHRcdGNob3JkUGFydE1hdGNoZWQgPSB0aGlzLm1hdGNoUGFydChjaG9yZFBhcnQsIGNob3JkUGFydE1hdGNoLCB3b3JkLCBjb21wbGV0ZU1hdGNoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpcnN0UGFydE1hdGNoZWQpIHtcblx0XHRcdFx0Zmlyc3RQYXJ0TWF0Y2hlZFdvcmRzLnB1c2goaW5kZXgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNob3JkUGFydE1hdGNoZWQpIHtcblx0XHRcdFx0Y2hvcmRQYXJ0TWF0Y2hlZFdvcmRzLnB1c2goaW5kZXgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpcnN0UGFydE1hdGNoZWQgfHwgY2hvcmRQYXJ0TWF0Y2hlZCkge1xuXHRcdFx0XHRtYXRjaGVkV29yZHMucHVzaChpbmRleCk7XG5cdFx0XHR9XG5cblx0XHRcdG1hdGNoRmlyc3RQYXJ0ID0gbWF0Y2hGaXJzdFBhcnQgJiYgdGhpcy5pc01vZGlmaWVyKHdvcmQpO1xuXHRcdH1cblx0XHRpZiAobWF0Y2hlZFdvcmRzLmxlbmd0aCAhPT0gd29yZHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGNvbXBsZXRlTWF0Y2gpIHtcblx0XHRcdGlmICghdGhpcy5pc0NvbXBsZXRlTWF0Y2goZmlyc3RQYXJ0LCBmaXJzdFBhcnRNYXRjaCkpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzRW1wdHlPYmplY3QoY2hvcmRQYXJ0TWF0Y2gpICYmICF0aGlzLmlzQ29tcGxldGVNYXRjaChjaG9yZFBhcnQsIGNob3JkUGFydE1hdGNoKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaGFzQW55TWF0Y2goZmlyc3RQYXJ0TWF0Y2gpIHx8IHRoaXMuaGFzQW55TWF0Y2goY2hvcmRQYXJ0TWF0Y2gpID8geyBmaXJzdFBhcnQ6IGZpcnN0UGFydE1hdGNoLCBjaG9yZFBhcnQ6IGNob3JkUGFydE1hdGNoIH0gOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaFBhcnQoY2hvcmQ6IFJlc29sdmVkQ2hvcmQgfCBudWxsLCBtYXRjaDogS2V5YmluZGluZ01hdGNoLCB3b3JkOiBzdHJpbmcsIGNvbXBsZXRlTWF0Y2g6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRsZXQgbWF0Y2hlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLm1hdGNoZXNNZXRhTW9kaWZpZXIoY2hvcmQsIHdvcmQpKSB7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHRcdG1hdGNoLm1ldGFLZXkgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tYXRjaGVzQ3RybE1vZGlmaWVyKGNob3JkLCB3b3JkKSkge1xuXHRcdFx0bWF0Y2hlZCA9IHRydWU7XG5cdFx0XHRtYXRjaC5jdHJsS2V5ID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWF0Y2hlc1NoaWZ0TW9kaWZpZXIoY2hvcmQsIHdvcmQpKSB7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHRcdG1hdGNoLnNoaWZ0S2V5ID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWF0Y2hlc0FsdE1vZGlmaWVyKGNob3JkLCB3b3JkKSkge1xuXHRcdFx0bWF0Y2hlZCA9IHRydWU7XG5cdFx0XHRtYXRjaC5hbHRLZXkgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tYXRjaGVzS2V5Q29kZShjaG9yZCwgd29yZCwgY29tcGxldGVNYXRjaCkpIHtcblx0XHRcdG1hdGNoLmtleUNvZGUgPSB0cnVlO1xuXHRcdFx0bWF0Y2hlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzS2V5Q29kZShjaG9yZDogUmVzb2x2ZWRDaG9yZCB8IG51bGwsIHdvcmQ6IHN0cmluZywgY29tcGxldGVNYXRjaDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgYXJpYUxhYmVsOiBzdHJpbmcgPSBjaG9yZC5rZXlBcmlhTGFiZWwgfHwgJyc7XG5cdFx0aWYgKGNvbXBsZXRlTWF0Y2ggfHwgYXJpYUxhYmVsLmxlbmd0aCA9PT0gMSB8fCB3b3JkLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0aWYgKHN0cmluZ3MuY29tcGFyZUlnbm9yZUNhc2UoYXJpYUxhYmVsLCB3b3JkKSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKHdvcmQsIGFyaWFMYWJlbCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlc01ldGFNb2RpZmllcihjaG9yZDogUmVzb2x2ZWRDaG9yZCB8IG51bGwsIHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmRNYXRjaGVzTWV0YU1vZGlmaWVyKHdvcmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzQ3RybE1vZGlmaWVyKGNob3JkOiBSZXNvbHZlZENob3JkIHwgbnVsbCwgd29yZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWNob3JkLmN0cmxLZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMud29yZE1hdGNoZXNDdHJsTW9kaWZpZXIod29yZCk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNTaGlmdE1vZGlmaWVyKGNob3JkOiBSZXNvbHZlZENob3JkIHwgbnVsbCwgd29yZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWNob3JkLnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmRNYXRjaGVzU2hpZnRNb2RpZmllcih3b3JkKTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlc0FsdE1vZGlmaWVyKGNob3JkOiBSZXNvbHZlZENob3JkIHwgbnVsbCwgd29yZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWNob3JkLmFsdEtleSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy53b3JkTWF0Y2hlc0FsdE1vZGlmaWVyKHdvcmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNBbnlNYXRjaChrZXliaW5kaW5nTWF0Y2g6IEtleWJpbmRpbmdNYXRjaCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIWtleWJpbmRpbmdNYXRjaC5hbHRLZXkgfHxcblx0XHRcdCEha2V5YmluZGluZ01hdGNoLmN0cmxLZXkgfHxcblx0XHRcdCEha2V5YmluZGluZ01hdGNoLm1ldGFLZXkgfHxcblx0XHRcdCEha2V5YmluZGluZ01hdGNoLnNoaWZ0S2V5IHx8XG5cdFx0XHQhIWtleWJpbmRpbmdNYXRjaC5rZXlDb2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0NvbXBsZXRlTWF0Y2goY2hvcmQ6IFJlc29sdmVkQ2hvcmQgfCBudWxsLCBtYXRjaDogS2V5YmluZGluZ01hdGNoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghbWF0Y2gua2V5Q29kZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQubWV0YUtleSAmJiAhbWF0Y2gubWV0YUtleSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuYWx0S2V5ICYmICFtYXRjaC5hbHRLZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNob3JkLmN0cmxLZXkgJiYgIW1hdGNoLmN0cmxLZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNob3JkLnNoaWZ0S2V5ICYmICFtYXRjaC5zaGlmdEtleSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29tcGxldGVNYXRjaChjaG9yZDogUmVzb2x2ZWRDaG9yZCB8IG51bGwpOiBLZXliaW5kaW5nTWF0Y2gge1xuXHRcdGNvbnN0IG1hdGNoOiBLZXliaW5kaW5nTWF0Y2ggPSB7fTtcblx0XHRpZiAoY2hvcmQpIHtcblx0XHRcdG1hdGNoLmtleUNvZGUgPSB0cnVlO1xuXHRcdFx0aWYgKGNob3JkLm1ldGFLZXkpIHtcblx0XHRcdFx0bWF0Y2gubWV0YUtleSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRcdG1hdGNoLmFsdEtleSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hvcmQuY3RybEtleSkge1xuXHRcdFx0XHRtYXRjaC5jdHJsS2V5ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaG9yZC5zaGlmdEtleSkge1xuXHRcdFx0XHRtYXRjaC5zaGlmdEtleSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaDtcblx0fVxuXG5cdHByaXZhdGUgaXNNb2RpZmllcih3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy53b3JkTWF0Y2hlc0FsdE1vZGlmaWVyKHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMud29yZE1hdGNoZXNDdHJsTW9kaWZpZXIod29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy53b3JkTWF0Y2hlc01ldGFNb2RpZmllcih3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLndvcmRNYXRjaGVzU2hpZnRNb2RpZmllcih3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgd29yZE1hdGNoZXNBbHRNb2RpZmllcih3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMudWkuYWx0S2V5LCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy5hcmlhLmFsdEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMudXNlci5hbHRLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZShsb2NhbGl6ZSgnb3B0aW9uJywgXCJvcHRpb25cIiksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB3b3JkTWF0Y2hlc0N0cmxNb2RpZmllcih3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMudWkuY3RybEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMuYXJpYS5jdHJsS2V5LCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51c2VyLmN0cmxLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB3b3JkTWF0Y2hlc01ldGFNb2RpZmllcih3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMudWkubWV0YUtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMuYXJpYS5tZXRhS2V5LCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51c2VyLm1ldGFLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZShsb2NhbGl6ZSgnbWV0YScsIFwibWV0YVwiKSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHdvcmRNYXRjaGVzU2hpZnRNb2RpZmllcih3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMudWkuc2hpZnRLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh0aGlzLm1vZGlmaWVyTGFiZWxzLmFyaWEuc2hpZnRLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh0aGlzLm1vZGlmaWVyTGFiZWxzLnVzZXIuc2hpZnRLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsWUFBWSxhQUFhO0FBQ3pCLFNBQTBCLGdCQUFnQjtBQUMxQyxTQUEwQixJQUFJLGtCQUFrQixjQUFjLGdDQUFnQyxrQ0FBa0M7QUFFaEksU0FBUyxtQkFBbUIsMkJBQTJCLHVCQUFvRDtBQUMzRyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLGVBQWUsZ0JBQWdCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCLDhCQUFxRDtBQUNuRixTQUFTLHNCQUFzQjtBQUV4QixNQUFNLCtCQUErQjtBQUU1QyxNQUFNLGdCQUFnQixTQUFTLFdBQVcsUUFBUTtBQUNsRCxNQUFNLG1CQUFtQixTQUFTLGFBQWEsV0FBVztBQUMxRCxN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
