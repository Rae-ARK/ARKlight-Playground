import { ContextKeyExprType, implies } from "../../contextkey/common/contextkey.js";
var ResultKind = /* @__PURE__ */ ((ResultKind2) => {
  ResultKind2[ResultKind2["NoMatchingKb"] = 0] = "NoMatchingKb";
  ResultKind2[ResultKind2["MoreChordsNeeded"] = 1] = "MoreChordsNeeded";
  ResultKind2[ResultKind2["KbFound"] = 2] = "KbFound";
  return ResultKind2;
})(ResultKind || {});
const NoMatchingKb = { kind: 0 /* NoMatchingKb */ };
const MoreChordsNeeded = { kind: 1 /* MoreChordsNeeded */ };
function KbFound(commandId, commandArgs, isBubble) {
  return { kind: 2 /* KbFound */, commandId, commandArgs, isBubble };
}
class KeybindingResolver {
  constructor(defaultKeybindings, overrides, log) {
    this._log = log;
    this._defaultKeybindings = defaultKeybindings;
    this._defaultBoundCommands = /* @__PURE__ */ new Map();
    for (const defaultKeybinding of defaultKeybindings) {
      const command = defaultKeybinding.command;
      if (command && command.charAt(0) !== "-") {
        this._defaultBoundCommands.set(command, true);
      }
    }
    this._map = /* @__PURE__ */ new Map();
    this._lookupMap = /* @__PURE__ */ new Map();
    this._keybindings = KeybindingResolver.handleRemovals([].concat(defaultKeybindings).concat(overrides));
    for (let i = 0, len = this._keybindings.length; i < len; i++) {
      const k = this._keybindings[i];
      if (k.chords.length === 0) {
        continue;
      }
      const when = k.when?.substituteConstants();
      if (when && when.type === ContextKeyExprType.False) {
        continue;
      }
      this._addKeyPress(k.chords[0], k);
    }
  }
  static _isTargetedForRemoval(defaultKb, keypress, when) {
    if (keypress) {
      for (let i = 0; i < keypress.length; i++) {
        if (keypress[i] !== defaultKb.chords[i]) {
          return false;
        }
      }
    }
    if (when && when.type !== ContextKeyExprType.True) {
      if (!defaultKb.when) {
        return false;
      }
      const defaultWhen = defaultKb.when.substituteConstants();
      const removalWhen = when.substituteConstants();
      if (!KeybindingResolver.whenIsEntirelyIncluded(defaultWhen, removalWhen)) {
        return false;
      }
    }
    return true;
  }
  /**
   * Looks for rules containing "-commandId" and removes them.
   */
  static handleRemovals(rules) {
    const removals = /* @__PURE__ */ new Map();
    for (let i = 0, len = rules.length; i < len; i++) {
      const rule = rules[i];
      if (rule.command && rule.command.charAt(0) === "-") {
        const command = rule.command.substring(1);
        if (!removals.has(command)) {
          removals.set(command, [rule]);
        } else {
          removals.get(command).push(rule);
        }
      }
    }
    if (removals.size === 0) {
      return rules;
    }
    const result = [];
    for (let i = 0, len = rules.length; i < len; i++) {
      const rule = rules[i];
      if (!rule.command || rule.command.length === 0) {
        result.push(rule);
        continue;
      }
      if (rule.command.charAt(0) === "-") {
        continue;
      }
      const commandRemovals = removals.get(rule.command);
      if (!commandRemovals || !rule.isDefault) {
        result.push(rule);
        continue;
      }
      let isRemoved = false;
      for (const commandRemoval of commandRemovals) {
        const when = commandRemoval.when;
        if (this._isTargetedForRemoval(rule, commandRemoval.chords, when)) {
          isRemoved = true;
          break;
        }
      }
      if (!isRemoved) {
        result.push(rule);
        continue;
      }
    }
    return result;
  }
  _addKeyPress(keypress, item) {
    const conflicts = this._map.get(keypress);
    if (typeof conflicts === "undefined") {
      this._map.set(keypress, [item]);
      this._addToLookupMap(item);
      return;
    }
    for (let i = conflicts.length - 1; i >= 0; i--) {
      const conflict = conflicts[i];
      if (conflict.command === item.command) {
        continue;
      }
      let isShorterKbPrefix = true;
      for (let i2 = 1; i2 < conflict.chords.length && i2 < item.chords.length; i2++) {
        if (conflict.chords[i2] !== item.chords[i2]) {
          isShorterKbPrefix = false;
          break;
        }
      }
      if (!isShorterKbPrefix) {
        continue;
      }
      if (KeybindingResolver.whenIsEntirelyIncluded(conflict.when, item.when)) {
        this._removeFromLookupMap(conflict);
      }
    }
    conflicts.push(item);
    this._addToLookupMap(item);
  }
  _addToLookupMap(item) {
    if (!item.command) {
      return;
    }
    let arr = this._lookupMap.get(item.command);
    if (typeof arr === "undefined") {
      arr = [item];
      this._lookupMap.set(item.command, arr);
    } else {
      arr.push(item);
    }
  }
  _removeFromLookupMap(item) {
    if (!item.command) {
      return;
    }
    const arr = this._lookupMap.get(item.command);
    if (typeof arr === "undefined") {
      return;
    }
    for (let i = 0, len = arr.length; i < len; i++) {
      if (arr[i] === item) {
        arr.splice(i, 1);
        return;
      }
    }
  }
  /**
   * Returns true if it is provable `a` implies `b`.
   */
  static whenIsEntirelyIncluded(a, b) {
    if (!b || b.type === ContextKeyExprType.True) {
      return true;
    }
    if (!a || a.type === ContextKeyExprType.True) {
      return false;
    }
    return implies(a, b);
  }
  getDefaultBoundCommands() {
    return this._defaultBoundCommands;
  }
  getDefaultKeybindings() {
    return this._defaultKeybindings;
  }
  getKeybindings() {
    return this._keybindings;
  }
  lookupKeybindings(commandId) {
    const items = this._lookupMap.get(commandId);
    if (typeof items === "undefined" || items.length === 0) {
      return [];
    }
    const result = [];
    let resultLen = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      result[resultLen++] = items[i];
    }
    return result;
  }
  lookupPrimaryKeybinding(commandId, context, enforceContextCheck = false) {
    const items = this._lookupMap.get(commandId);
    if (typeof items === "undefined" || items.length === 0) {
      return null;
    }
    if (items.length === 1 && !enforceContextCheck) {
      return items[0];
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (context.contextMatchesRules(item.when)) {
        return item;
      }
    }
    if (enforceContextCheck) {
      return null;
    }
    return items[items.length - 1];
  }
  /**
   * Looks up a keybinding trigged as a result of pressing a sequence of chords - `[...currentChords, keypress]`
   *
   * Example: resolving 3 chords pressed sequentially - `cmd+k cmd+p cmd+i`:
   * 	`currentChords = [ 'cmd+k' , 'cmd+p' ]` and `keypress = `cmd+i` - last pressed chord
   */
  resolve(context, currentChords, keypress) {
    const pressedChords = [...currentChords, keypress];
    this._log(`| Resolving ${pressedChords}`);
    const kbCandidates = this._map.get(pressedChords[0]);
    if (kbCandidates === void 0) {
      this._log(`\\ No keybinding entries.`);
      return NoMatchingKb;
    }
    let lookupMap = null;
    if (pressedChords.length < 2) {
      lookupMap = kbCandidates;
    } else {
      lookupMap = [];
      for (let i = 0, len = kbCandidates.length; i < len; i++) {
        const candidate = kbCandidates[i];
        if (pressedChords.length > candidate.chords.length) {
          continue;
        }
        let prefixMatches = true;
        for (let i2 = 1; i2 < pressedChords.length; i2++) {
          if (candidate.chords[i2] !== pressedChords[i2]) {
            prefixMatches = false;
            break;
          }
        }
        if (prefixMatches) {
          lookupMap.push(candidate);
        }
      }
    }
    const result = this._findCommand(context, lookupMap);
    if (!result) {
      this._log(`\\ From ${lookupMap.length} keybinding entries, no when clauses matched the context.`);
      return NoMatchingKb;
    }
    if (pressedChords.length < result.chords.length) {
      this._log(`\\ From ${lookupMap.length} keybinding entries, awaiting ${result.chords.length - pressedChords.length} more chord(s), when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
      return MoreChordsNeeded;
    }
    this._log(`\\ From ${lookupMap.length} keybinding entries, matched ${result.command}, when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
    return KbFound(result.command, result.commandArgs, result.bubble);
  }
  _findCommand(context, matches) {
    for (let i = matches.length - 1; i >= 0; i--) {
      const k = matches[i];
      if (!KeybindingResolver._contextMatchesRules(context, k.when)) {
        continue;
      }
      return k;
    }
    return null;
  }
  static _contextMatchesRules(context, rules) {
    if (!rules) {
      return true;
    }
    return rules.evaluate(context);
  }
}
function printWhenExplanation(when) {
  if (!when) {
    return `no when condition`;
  }
  return `${when.serialize()}`;
}
function printSourceExplanation(kb) {
  return kb.extensionId ? kb.isBuiltinExtension ? `built-in extension ${kb.extensionId}` : `user extension ${kb.extensionId}` : kb.isDefault ? `built-in` : `user`;
}
export {
  KeybindingResolver,
  NoMatchingKb,
  ResultKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvbnRleHRLZXlFeHByZXNzaW9uLCBDb250ZXh0S2V5RXhwclR5cGUsIElDb250ZXh0LCBJQ29udGV4dEtleVNlcnZpY2UsIGltcGxpZXMgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfSBmcm9tICcuL3Jlc29sdmVkS2V5YmluZGluZ0l0ZW0uanMnO1xuXG4vLyNyZWdpb24gcmVzb2x1dGlvbi1yZXN1bHRcblxuZXhwb3J0IGNvbnN0IGVudW0gUmVzdWx0S2luZCB7XG5cdC8qKiBObyBrZXliaW5kaW5nIGZvdW5kIHRoaXMgc2VxdWVuY2Ugb2YgY2hvcmRzICovXG5cdE5vTWF0Y2hpbmdLYixcblxuXHQvKiogVGhlcmUncmUgc2V2ZXJhbCBrZXliaW5kaW5ncyB0aGF0IGhhdmUgdGhlIGdpdmVuIHNlcXVlbmNlIG9mIGNob3JkcyBhcyBhIHByZWZpeCAqL1xuXHRNb3JlQ2hvcmRzTmVlZGVkLFxuXG5cdC8qKiBBIHNpbmdsZSBrZXliaW5kaW5nIGZvdW5kIHRvIGJlIGRpc3BhdGNoZWQvaW52b2tlZCAqL1xuXHRLYkZvdW5kXG59XG5cbmV4cG9ydCB0eXBlIFJlc29sdXRpb25SZXN1bHQgPVxuXHR8IHsga2luZDogUmVzdWx0S2luZC5Ob01hdGNoaW5nS2IgfVxuXHR8IHsga2luZDogUmVzdWx0S2luZC5Nb3JlQ2hvcmRzTmVlZGVkIH1cblx0fCB7IGtpbmQ6IFJlc3VsdEtpbmQuS2JGb3VuZDsgY29tbWFuZElkOiBzdHJpbmcgfCBudWxsOyBjb21tYW5kQXJnczogYW55OyBpc0J1YmJsZTogYm9vbGVhbiB9O1xuXG5cbi8vIHV0aWwgZGVmaW5pdGlvbnMgdG8gbWFrZSB3b3JraW5nIHdpdGggdGhlIGFib3ZlIHR5cGVzIGVhc2llciB3aXRoaW4gdGhpcyBtb2R1bGU6XG5cbmV4cG9ydCBjb25zdCBOb01hdGNoaW5nS2I6IFJlc29sdXRpb25SZXN1bHQgPSB7IGtpbmQ6IFJlc3VsdEtpbmQuTm9NYXRjaGluZ0tiIH07XG5jb25zdCBNb3JlQ2hvcmRzTmVlZGVkOiBSZXNvbHV0aW9uUmVzdWx0ID0geyBraW5kOiBSZXN1bHRLaW5kLk1vcmVDaG9yZHNOZWVkZWQgfTtcbmZ1bmN0aW9uIEtiRm91bmQoY29tbWFuZElkOiBzdHJpbmcgfCBudWxsLCBjb21tYW5kQXJnczogYW55LCBpc0J1YmJsZTogYm9vbGVhbik6IFJlc29sdXRpb25SZXN1bHQge1xuXHRyZXR1cm4geyBraW5kOiBSZXN1bHRLaW5kLktiRm91bmQsIGNvbW1hbmRJZCwgY29tbWFuZEFyZ3MsIGlzQnViYmxlIH07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vKipcbiAqIFN0b3JlcyBtYXBwaW5ncyBmcm9tIGtleWJpbmRpbmdzIHRvIGNvbW1hbmRzIGFuZCBmcm9tIGNvbW1hbmRzIHRvIGtleWJpbmRpbmdzLlxuICogR2l2ZW4gYSBzZXF1ZW5jZSBvZiBjaG9yZHMsIGByZXNvbHZlYHMgd2hpY2gga2V5YmluZGluZyBpdCBtYXRjaGVzXG4gKi9cbmV4cG9ydCBjbGFzcyBLZXliaW5kaW5nUmVzb2x2ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2c6IChzdHI6IHN0cmluZykgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdEtleWJpbmRpbmdzOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdzOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRCb3VuZENvbW1hbmRzOiBNYXA8LyogY29tbWFuZElkICovIHN0cmluZywgYm9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcDogTWFwPC8qIDFzdCBjaG9yZCdzIGtleXByZXNzICovIHN0cmluZywgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9va3VwTWFwOiBNYXA8LyogY29tbWFuZElkICovIHN0cmluZywgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHQvKiogYnVpbHQtaW4gYW5kIGV4dGVuc2lvbi1wcm92aWRlZCBrZXliaW5kaW5ncyAqL1xuXHRcdGRlZmF1bHRLZXliaW5kaW5nczogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdLFxuXHRcdC8qKiB1c2VyJ3Mga2V5YmluZGluZ3MgKi9cblx0XHRvdmVycmlkZXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSxcblx0XHRsb2c6IChzdHI6IHN0cmluZykgPT4gdm9pZFxuXHQpIHtcblx0XHR0aGlzLl9sb2cgPSBsb2c7XG5cdFx0dGhpcy5fZGVmYXVsdEtleWJpbmRpbmdzID0gZGVmYXVsdEtleWJpbmRpbmdzO1xuXG5cdFx0dGhpcy5fZGVmYXVsdEJvdW5kQ29tbWFuZHMgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IGRlZmF1bHRLZXliaW5kaW5nIG9mIGRlZmF1bHRLZXliaW5kaW5ncykge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGRlZmF1bHRLZXliaW5kaW5nLmNvbW1hbmQ7XG5cdFx0XHRpZiAoY29tbWFuZCAmJiBjb21tYW5kLmNoYXJBdCgwKSAhPT0gJy0nKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRCb3VuZENvbW1hbmRzLnNldChjb21tYW5kLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9tYXAgPSBuZXcgTWFwPHN0cmluZywgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdPigpO1xuXHRcdHRoaXMuX2xvb2t1cE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10+KCk7XG5cblx0XHR0aGlzLl9rZXliaW5kaW5ncyA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscygoW10gYXMgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdKS5jb25jYXQoZGVmYXVsdEtleWJpbmRpbmdzKS5jb25jYXQob3ZlcnJpZGVzKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2tleWJpbmRpbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBrID0gdGhpcy5fa2V5YmluZGluZ3NbaV07XG5cdFx0XHRpZiAoay5jaG9yZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIHVuYm91bmRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHN1YnN0aXR1dGUgd2l0aCBjb25zdGFudHMgdGhhdCBhcmUgcmVnaXN0ZXJlZCBhZnRlciBzdGFydHVwIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE3NDIxOCNpc3N1ZWNvbW1lbnQtMTQzNzk3MjEyN1xuXHRcdFx0Y29uc3Qgd2hlbiA9IGsud2hlbj8uc3Vic3RpdHV0ZUNvbnN0YW50cygpO1xuXG5cdFx0XHRpZiAod2hlbiAmJiB3aGVuLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5GYWxzZSkge1xuXHRcdFx0XHQvLyB3aGVuIGNvbmRpdGlvbiBpcyBmYWxzZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYWRkS2V5UHJlc3Moay5jaG9yZHNbMF0sIGspO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc1RhcmdldGVkRm9yUmVtb3ZhbChkZWZhdWx0S2I6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0sIGtleXByZXNzOiBzdHJpbmdbXSB8IG51bGwsIHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKGtleXByZXNzKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGtleXByZXNzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChrZXlwcmVzc1tpXSAhPT0gZGVmYXVsdEtiLmNob3Jkc1tpXSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGB0cnVlYCBtZWFucyBhbHdheXMsIGFzIGRvZXMgYHVuZGVmaW5lZGBcblx0XHQvLyBzbyB3ZSB3aWxsIHRyZWF0IGB0cnVlYCA9PT0gYHVuZGVmaW5lZGBcblx0XHRpZiAod2hlbiAmJiB3aGVuLnR5cGUgIT09IENvbnRleHRLZXlFeHByVHlwZS5UcnVlKSB7XG5cdFx0XHRpZiAoIWRlZmF1bHRLYi53aGVuKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXNlIGltcGxpY2F0aW9uIGluc3RlYWQgb2Ygc3RyaWN0IGVxdWFsaXR5IHNvIHRoYXQgYSByZW1vdmFsIHN0aWxsIG1hdGNoZXNcblx0XHRcdC8vIHdoZW4gdGhlIGRlZmF1bHQga2V5YmluZGluZydzIHdoZW4gY2xhdXNlIGJlY29tZXMgbW9yZSBzcGVjaWZpYyBhY3Jvc3Ncblx0XHRcdC8vIHVwZGF0ZXMgKGUuZy4gXCJpbkNoYXRJbnB1dFwiIFx1MjE5MiBcImluQ2hhdElucHV0ICYmICF3aXRoaW5FZGl0U2Vzc2lvbkRpZmZcIikuXG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI5MzgwMlxuXHRcdFx0Y29uc3QgZGVmYXVsdFdoZW4gPSBkZWZhdWx0S2Iud2hlbi5zdWJzdGl0dXRlQ29uc3RhbnRzKCk7XG5cdFx0XHRjb25zdCByZW1vdmFsV2hlbiA9IHdoZW4uc3Vic3RpdHV0ZUNvbnN0YW50cygpO1xuXHRcdFx0aWYgKCFLZXliaW5kaW5nUmVzb2x2ZXIud2hlbklzRW50aXJlbHlJbmNsdWRlZChkZWZhdWx0V2hlbiwgcmVtb3ZhbFdoZW4pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBMb29rcyBmb3IgcnVsZXMgY29udGFpbmluZyBcIi1jb21tYW5kSWRcIiBhbmQgcmVtb3ZlcyB0aGVtLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBoYW5kbGVSZW1vdmFscyhydWxlczogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdKTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHtcblx0XHQvLyBEbyBhIGZpcnN0IHBhc3MgYW5kIGNvbnN0cnVjdCBhIGhhc2gtbWFwIGZvciByZW1vdmFsc1xuXHRcdGNvbnN0IHJlbW92YWxzID0gbmV3IE1hcDwvKiBjb21tYW5kSWQgKi8gc3RyaW5nLCBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJ1bGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBydWxlID0gcnVsZXNbaV07XG5cdFx0XHRpZiAocnVsZS5jb21tYW5kICYmIHJ1bGUuY29tbWFuZC5jaGFyQXQoMCkgPT09ICctJykge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gcnVsZS5jb21tYW5kLnN1YnN0cmluZygxKTtcblx0XHRcdFx0aWYgKCFyZW1vdmFscy5oYXMoY29tbWFuZCkpIHtcblx0XHRcdFx0XHRyZW1vdmFscy5zZXQoY29tbWFuZCwgW3J1bGVdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZW1vdmFscy5nZXQoY29tbWFuZCkhLnB1c2gocnVsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVtb3ZhbHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0Ly8gVGhlcmUgYXJlIG5vIHJlbW92YWxzXG5cdFx0XHRyZXR1cm4gcnVsZXM7XG5cdFx0fVxuXG5cdFx0Ly8gRG8gYSBzZWNvbmQgcGFzcyBhbmQga2VlcCBvbmx5IG5vbi1yZW1vdmVkIGtleWJpbmRpbmdzXG5cdFx0Y29uc3QgcmVzdWx0OiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcnVsZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHJ1bGUgPSBydWxlc1tpXTtcblxuXHRcdFx0aWYgKCFydWxlLmNvbW1hbmQgfHwgcnVsZS5jb21tYW5kLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChydWxlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocnVsZS5jb21tYW5kLmNoYXJBdCgwKSA9PT0gJy0nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29tbWFuZFJlbW92YWxzID0gcmVtb3ZhbHMuZ2V0KHJ1bGUuY29tbWFuZCk7XG5cdFx0XHRpZiAoIWNvbW1hbmRSZW1vdmFscyB8fCAhcnVsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gocnVsZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGlzUmVtb3ZlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kUmVtb3ZhbCBvZiBjb21tYW5kUmVtb3ZhbHMpIHtcblx0XHRcdFx0Y29uc3Qgd2hlbiA9IGNvbW1hbmRSZW1vdmFsLndoZW47XG5cdFx0XHRcdGlmICh0aGlzLl9pc1RhcmdldGVkRm9yUmVtb3ZhbChydWxlLCBjb21tYW5kUmVtb3ZhbC5jaG9yZHMsIHdoZW4pKSB7XG5cdFx0XHRcdFx0aXNSZW1vdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1JlbW92ZWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gocnVsZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkS2V5UHJlc3Moa2V5cHJlc3M6IHN0cmluZywgaXRlbTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgY29uZmxpY3RzID0gdGhpcy5fbWFwLmdldChrZXlwcmVzcyk7XG5cblx0XHRpZiAodHlwZW9mIGNvbmZsaWN0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdC8vIFRoZXJlIGlzIG5vIGNvbmZsaWN0IHNvIGZhclxuXHRcdFx0dGhpcy5fbWFwLnNldChrZXlwcmVzcywgW2l0ZW1dKTtcblx0XHRcdHRoaXMuX2FkZFRvTG9va3VwTWFwKGl0ZW0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBjb25mbGljdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGNvbmZsaWN0ID0gY29uZmxpY3RzW2ldO1xuXG5cdFx0XHRpZiAoY29uZmxpY3QuY29tbWFuZCA9PT0gaXRlbS5jb21tYW5kKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUZXN0IGlmIHRoZSBzaG9ydGVyIGtleWJpbmRpbmcgaXMgYSBwcmVmaXggb2YgdGhlIGxvbmdlciBvbmUuXG5cdFx0XHQvLyBJZiB0aGUgc2hvcnRlciBrZXliaW5kaW5nIGlzIGEgcHJlZml4LCBpdCBlZmZlY3RpdmVseSB3aWxsIHNoYWRvdyB0aGUgbG9uZ2VyIG9uZSBhbmQgaXMgY29uc2lkZXJlZCBhIGNvbmZsaWN0LlxuXHRcdFx0bGV0IGlzU2hvcnRlcktiUHJlZml4ID0gdHJ1ZTtcblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgY29uZmxpY3QuY2hvcmRzLmxlbmd0aCAmJiBpIDwgaXRlbS5jaG9yZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGNvbmZsaWN0LmNob3Jkc1tpXSAhPT0gaXRlbS5jaG9yZHNbaV0pIHtcblx0XHRcdFx0XHQvLyBUaGUgaXRoIHN0ZXAgZG9lcyBub3QgY29uZmxpY3Rcblx0XHRcdFx0XHRpc1Nob3J0ZXJLYlByZWZpeCA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzU2hvcnRlcktiUHJlZml4KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoS2V5YmluZGluZ1Jlc29sdmVyLndoZW5Jc0VudGlyZWx5SW5jbHVkZWQoY29uZmxpY3Qud2hlbiwgaXRlbS53aGVuKSkge1xuXHRcdFx0XHQvLyBgaXRlbWAgY29tcGxldGVseSBvdmVyd3JpdGVzIGBjb25mbGljdGBcblx0XHRcdFx0Ly8gUmVtb3ZlIGNvbmZsaWN0IGZyb20gdGhlIGxvb2t1cE1hcFxuXHRcdFx0XHR0aGlzLl9yZW1vdmVGcm9tTG9va3VwTWFwKGNvbmZsaWN0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25mbGljdHMucHVzaChpdGVtKTtcblx0XHR0aGlzLl9hZGRUb0xvb2t1cE1hcChpdGVtKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFRvTG9va3VwTWFwKGl0ZW06IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0pOiB2b2lkIHtcblx0XHRpZiAoIWl0ZW0uY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhcnIgPSB0aGlzLl9sb29rdXBNYXAuZ2V0KGl0ZW0uY29tbWFuZCk7XG5cdFx0aWYgKHR5cGVvZiBhcnIgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRhcnIgPSBbaXRlbV07XG5cdFx0XHR0aGlzLl9sb29rdXBNYXAuc2V0KGl0ZW0uY29tbWFuZCwgYXJyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJyLnB1c2goaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRnJvbUxvb2t1cE1hcChpdGVtOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKTogdm9pZCB7XG5cdFx0aWYgKCFpdGVtLmNvbW1hbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXJyID0gdGhpcy5fbG9va3VwTWFwLmdldChpdGVtLmNvbW1hbmQpO1xuXHRcdGlmICh0eXBlb2YgYXJyID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoYXJyW2ldID09PSBpdGVtKSB7XG5cdFx0XHRcdGFyci5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIGl0IGlzIHByb3ZhYmxlIGBhYCBpbXBsaWVzIGBiYC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgd2hlbklzRW50aXJlbHlJbmNsdWRlZChhOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQsIGI6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghYiB8fCBiLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5UcnVlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhIHx8IGEudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLlRydWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW1wbGllcyhhLCBiKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWZhdWx0Qm91bmRDb21tYW5kcygpOiBNYXA8c3RyaW5nLCBib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRCb3VuZENvbW1hbmRzO1xuXHR9XG5cblx0cHVibGljIGdldERlZmF1bHRLZXliaW5kaW5ncygpOiByZWFkb25seSBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0S2V5YmluZGluZ3M7XG5cdH1cblxuXHRwdWJsaWMgZ2V0S2V5YmluZGluZ3MoKTogcmVhZG9ubHkgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ3M7XG5cdH1cblxuXHRwdWJsaWMgbG9va3VwS2V5YmluZGluZ3MoY29tbWFuZElkOiBzdHJpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10ge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fbG9va3VwTWFwLmdldChjb21tYW5kSWQpO1xuXHRcdGlmICh0eXBlb2YgaXRlbXMgPT09ICd1bmRlZmluZWQnIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFJldmVyc2UgdG8gZ2V0IHRoZSBtb3N0IHNwZWNpZmljIGl0ZW0gZmlyc3Rcblx0XHRjb25zdCByZXN1bHQ6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGZvciAobGV0IGkgPSBpdGVtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IGl0ZW1zW2ldO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGxvb2t1cFByaW1hcnlLZXliaW5kaW5nKGNvbW1hbmRJZDogc3RyaW5nLCBjb250ZXh0OiBJQ29udGV4dEtleVNlcnZpY2UsIGVuZm9yY2VDb250ZXh0Q2hlY2sgPSBmYWxzZSk6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfCBudWxsIHtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2xvb2t1cE1hcC5nZXQoY29tbWFuZElkKTtcblx0XHRpZiAodHlwZW9mIGl0ZW1zID09PSAndW5kZWZpbmVkJyB8fCBpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAxICYmICFlbmZvcmNlQ29udGV4dENoZWNrKSB7XG5cdFx0XHRyZXR1cm4gaXRlbXNbMF07XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gaXRlbXNbaV07XG5cdFx0XHRpZiAoY29udGV4dC5jb250ZXh0TWF0Y2hlc1J1bGVzKGl0ZW0ud2hlbikpIHtcblx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuZm9yY2VDb250ZXh0Q2hlY2spIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtc1tpdGVtcy5sZW5ndGggLSAxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb29rcyB1cCBhIGtleWJpbmRpbmcgdHJpZ2dlZCBhcyBhIHJlc3VsdCBvZiBwcmVzc2luZyBhIHNlcXVlbmNlIG9mIGNob3JkcyAtIGBbLi4uY3VycmVudENob3Jkcywga2V5cHJlc3NdYFxuXHQgKlxuXHQgKiBFeGFtcGxlOiByZXNvbHZpbmcgMyBjaG9yZHMgcHJlc3NlZCBzZXF1ZW50aWFsbHkgLSBgY21kK2sgY21kK3AgY21kK2lgOlxuXHQgKiBcdGBjdXJyZW50Q2hvcmRzID0gWyAnY21kK2snICwgJ2NtZCtwJyBdYCBhbmQgYGtleXByZXNzID0gYGNtZCtpYCAtIGxhc3QgcHJlc3NlZCBjaG9yZFxuXHQgKi9cblx0cHVibGljIHJlc29sdmUoY29udGV4dDogSUNvbnRleHQsIGN1cnJlbnRDaG9yZHM6IHN0cmluZ1tdLCBrZXlwcmVzczogc3RyaW5nKTogUmVzb2x1dGlvblJlc3VsdCB7XG5cblx0XHRjb25zdCBwcmVzc2VkQ2hvcmRzID0gWy4uLmN1cnJlbnRDaG9yZHMsIGtleXByZXNzXTtcblxuXHRcdHRoaXMuX2xvZyhgfCBSZXNvbHZpbmcgJHtwcmVzc2VkQ2hvcmRzfWApO1xuXG5cdFx0Y29uc3Qga2JDYW5kaWRhdGVzID0gdGhpcy5fbWFwLmdldChwcmVzc2VkQ2hvcmRzWzBdKTtcblx0XHRpZiAoa2JDYW5kaWRhdGVzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIE5vIGJpbmRpbmdzIHdpdGggc3VjaCAwLXRoIGNob3JkXG5cdFx0XHR0aGlzLl9sb2coYFxcXFwgTm8ga2V5YmluZGluZyBlbnRyaWVzLmApO1xuXHRcdFx0cmV0dXJuIE5vTWF0Y2hpbmdLYjtcblx0XHR9XG5cblx0XHRsZXQgbG9va3VwTWFwOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gfCBudWxsID0gbnVsbDtcblxuXHRcdGlmIChwcmVzc2VkQ2hvcmRzLmxlbmd0aCA8IDIpIHtcblx0XHRcdGxvb2t1cE1hcCA9IGtiQ2FuZGlkYXRlcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmV0Y2ggYWxsIGNob3JkIGJpbmRpbmdzIGZvciBgY3VycmVudENob3Jkc2Bcblx0XHRcdGxvb2t1cE1hcCA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtiQ2FuZGlkYXRlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXG5cdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IGtiQ2FuZGlkYXRlc1tpXTtcblxuXHRcdFx0XHRpZiAocHJlc3NlZENob3Jkcy5sZW5ndGggPiBjYW5kaWRhdGUuY2hvcmRzLmxlbmd0aCkgeyAvLyAjIG9mIHByZXNzZWQgY2hvcmRzIGNhbid0IGJlIGxlc3MgdGhhbiAjIG9mIGNob3JkcyBpbiBhIGtleWJpbmRpbmcgdG8gaW52b2tlXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgcHJlZml4TWF0Y2hlcyA9IHRydWU7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgcHJlc3NlZENob3Jkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmIChjYW5kaWRhdGUuY2hvcmRzW2ldICE9PSBwcmVzc2VkQ2hvcmRzW2ldKSB7XG5cdFx0XHRcdFx0XHRwcmVmaXhNYXRjaGVzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByZWZpeE1hdGNoZXMpIHtcblx0XHRcdFx0XHRsb29rdXBNYXAucHVzaChjYW5kaWRhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgdGhlcmUncyBhIGtleWJpbmRpbmcgd2l0aCBhIG1hdGNoaW5nIHdoZW4gY2xhdXNlXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZmluZENvbW1hbmQoY29udGV4dCwgbG9va3VwTWFwKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhpcy5fbG9nKGBcXFxcIEZyb20gJHtsb29rdXBNYXAubGVuZ3RofSBrZXliaW5kaW5nIGVudHJpZXMsIG5vIHdoZW4gY2xhdXNlcyBtYXRjaGVkIHRoZSBjb250ZXh0LmApO1xuXHRcdFx0cmV0dXJuIE5vTWF0Y2hpbmdLYjtcblx0XHR9XG5cblx0XHQvLyBjaGVjayB3ZSBnb3QgYWxsIGNob3JkcyBuZWNlc3NhcnkgdG8gYmUgc3VyZSBhIHBhcnRpY3VsYXIga2V5YmluZGluZyBuZWVkcyB0byBiZSBpbnZva2VkXG5cdFx0aWYgKHByZXNzZWRDaG9yZHMubGVuZ3RoIDwgcmVzdWx0LmNob3Jkcy5sZW5ndGgpIHtcblx0XHRcdC8vIFRoZSBjaG9yZCBzZXF1ZW5jZSBpcyBub3QgY29tcGxldGVcblx0XHRcdHRoaXMuX2xvZyhgXFxcXCBGcm9tICR7bG9va3VwTWFwLmxlbmd0aH0ga2V5YmluZGluZyBlbnRyaWVzLCBhd2FpdGluZyAke3Jlc3VsdC5jaG9yZHMubGVuZ3RoIC0gcHJlc3NlZENob3Jkcy5sZW5ndGh9IG1vcmUgY2hvcmQocyksIHdoZW46ICR7cHJpbnRXaGVuRXhwbGFuYXRpb24ocmVzdWx0LndoZW4pfSwgc291cmNlOiAke3ByaW50U291cmNlRXhwbGFuYXRpb24ocmVzdWx0KX0uYCk7XG5cdFx0XHRyZXR1cm4gTW9yZUNob3Jkc05lZWRlZDtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2coYFxcXFwgRnJvbSAke2xvb2t1cE1hcC5sZW5ndGh9IGtleWJpbmRpbmcgZW50cmllcywgbWF0Y2hlZCAke3Jlc3VsdC5jb21tYW5kfSwgd2hlbjogJHtwcmludFdoZW5FeHBsYW5hdGlvbihyZXN1bHQud2hlbil9LCBzb3VyY2U6ICR7cHJpbnRTb3VyY2VFeHBsYW5hdGlvbihyZXN1bHQpfS5gKTtcblxuXHRcdHJldHVybiBLYkZvdW5kKHJlc3VsdC5jb21tYW5kLCByZXN1bHQuY29tbWFuZEFyZ3MsIHJlc3VsdC5idWJibGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENvbW1hbmQoY29udGV4dDogSUNvbnRleHQsIG1hdGNoZXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSk6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfCBudWxsIHtcblx0XHRmb3IgKGxldCBpID0gbWF0Y2hlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgayA9IG1hdGNoZXNbaV07XG5cblx0XHRcdGlmICghS2V5YmluZGluZ1Jlc29sdmVyLl9jb250ZXh0TWF0Y2hlc1J1bGVzKGNvbnRleHQsIGsud2hlbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBrO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbnRleHRNYXRjaGVzUnVsZXMoY29udGV4dDogSUNvbnRleHQsIHJ1bGVzOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXJ1bGVzKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHJ1bGVzLmV2YWx1YXRlKGNvbnRleHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHByaW50V2hlbkV4cGxhbmF0aW9uKHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKCF3aGVuKSB7XG5cdFx0cmV0dXJuIGBubyB3aGVuIGNvbmRpdGlvbmA7XG5cdH1cblx0cmV0dXJuIGAke3doZW4uc2VyaWFsaXplKCl9YDtcbn1cblxuZnVuY3Rpb24gcHJpbnRTb3VyY2VFeHBsYW5hdGlvbihrYjogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSk6IHN0cmluZyB7XG5cdHJldHVybiAoXG5cdFx0a2IuZXh0ZW5zaW9uSWRcblx0XHRcdD8gKGtiLmlzQnVpbHRpbkV4dGVuc2lvbiA/IGBidWlsdC1pbiBleHRlbnNpb24gJHtrYi5leHRlbnNpb25JZH1gIDogYHVzZXIgZXh0ZW5zaW9uICR7a2IuZXh0ZW5zaW9uSWR9YClcblx0XHRcdDogKGtiLmlzRGVmYXVsdCA/IGBidWlsdC1pbmAgOiBgdXNlcmApXG5cdCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUErQixvQkFBa0QsZUFBZTtBQUt6RixJQUFXLGFBQVgsa0JBQVdBLGdCQUFYO0FBRU4sRUFBQUEsd0JBQUE7QUFHQSxFQUFBQSx3QkFBQTtBQUdBLEVBQUFBLHdCQUFBO0FBUmlCLFNBQUFBO0FBQUEsR0FBQTtBQW1CWCxNQUFNLGVBQWlDLEVBQUUsTUFBTSxxQkFB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
