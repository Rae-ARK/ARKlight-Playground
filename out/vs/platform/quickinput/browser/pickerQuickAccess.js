import { timeout } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { isKeyModified } from "../common/quickInput.js";
import { isFunction } from "../../../base/common/types.js";
var TriggerAction = /* @__PURE__ */ ((TriggerAction2) => {
  TriggerAction2[TriggerAction2["NO_ACTION"] = 0] = "NO_ACTION";
  TriggerAction2[TriggerAction2["CLOSE_PICKER"] = 1] = "CLOSE_PICKER";
  TriggerAction2[TriggerAction2["REFRESH_PICKER"] = 2] = "REFRESH_PICKER";
  TriggerAction2[TriggerAction2["REMOVE_ITEM"] = 3] = "REMOVE_ITEM";
  return TriggerAction2;
})(TriggerAction || {});
function isPicksWithActive(obj) {
  const candidate = obj;
  return Array.isArray(candidate.items);
}
function isFastAndSlowPicks(obj) {
  const candidate = obj;
  return !!candidate.picks && candidate.additionalPicks instanceof Promise;
}
class PickerQuickAccessProvider extends Disposable {
  constructor(prefix, options) {
    super();
    this.prefix = prefix;
    this.options = options;
  }
  provide(picker, token, runOptions) {
    const disposables = new DisposableStore();
    picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;
    picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;
    let picksCts = void 0;
    const picksDisposable = disposables.add(new MutableDisposable());
    const updatePickerItems = async () => {
      picksCts?.dispose(true);
      picker.busy = false;
      const picksDisposables = picksDisposable.value = new DisposableStore();
      picksCts = picksDisposables.add(new CancellationTokenSource(token));
      const picksToken = picksCts.token;
      let picksFilter = picker.value.substring(this.prefix.length);
      if (!this.options?.shouldSkipTrimPickFilter) {
        picksFilter = picksFilter.trim();
      }
      const providedPicks = this._getPicks(picksFilter, picksDisposables, picksToken, runOptions);
      const applyPicks = (picks, skipEmpty) => {
        let items;
        let activeItem = void 0;
        if (isPicksWithActive(picks)) {
          items = picks.items;
          activeItem = picks.active;
        } else {
          items = picks;
        }
        if (items.length === 0) {
          if (skipEmpty) {
            return false;
          }
          if ((picksFilter.length > 0 || picker.hideInput) && this.options?.noResultsPick) {
            if (isFunction(this.options.noResultsPick)) {
              items = [this.options.noResultsPick(picksFilter)];
            } else {
              items = [this.options.noResultsPick];
            }
          }
        }
        picker.items = items;
        if (activeItem) {
          picker.activeItems = [activeItem];
        }
        return true;
      };
      const applyFastAndSlowPicks = async (fastAndSlowPicks) => {
        let fastPicksApplied = false;
        let slowPicksApplied = false;
        await Promise.all([
          // Fast Picks: if `mergeDelay` is configured, in order to reduce
          // amount of flicker, we race against the slow picks over some delay
          // and then set the fast picks.
          // If the slow picks are faster, we reduce the flicker by only
          // setting the items once.
          (async () => {
            if (typeof fastAndSlowPicks.mergeDelay === "number") {
              await timeout(fastAndSlowPicks.mergeDelay);
              if (picksToken.isCancellationRequested) {
                return;
              }
            }
            if (!slowPicksApplied) {
              fastPicksApplied = applyPicks(
                fastAndSlowPicks.picks,
                true
                /* skip over empty to reduce flicker */
              );
            }
          })(),
          // Slow Picks: we await the slow picks and then set them at
          // once together with the fast picks, but only if we actually
          // have additional results.
          (async () => {
            picker.busy = true;
            try {
              const awaitedAdditionalPicks = await fastAndSlowPicks.additionalPicks;
              if (picksToken.isCancellationRequested) {
                return;
              }
              let picks;
              let activePick = void 0;
              if (isPicksWithActive(fastAndSlowPicks.picks)) {
                picks = fastAndSlowPicks.picks.items;
                activePick = fastAndSlowPicks.picks.active;
              } else {
                picks = fastAndSlowPicks.picks;
              }
              let additionalPicks;
              let additionalActivePick = void 0;
              if (isPicksWithActive(awaitedAdditionalPicks)) {
                additionalPicks = awaitedAdditionalPicks.items;
                additionalActivePick = awaitedAdditionalPicks.active;
              } else {
                additionalPicks = awaitedAdditionalPicks;
              }
              if (additionalPicks.length > 0 || !fastPicksApplied) {
                let fallbackActivePick = void 0;
                if (!activePick && !additionalActivePick) {
                  const fallbackActivePickCandidate = picker.activeItems[0];
                  if (fallbackActivePickCandidate && picks.indexOf(fallbackActivePickCandidate) !== -1) {
                    fallbackActivePick = fallbackActivePickCandidate;
                  }
                }
                applyPicks({
                  items: [...picks, ...additionalPicks],
                  active: activePick || additionalActivePick || fallbackActivePick
                });
              }
            } finally {
              if (!picksToken.isCancellationRequested) {
                picker.busy = false;
              }
              slowPicksApplied = true;
            }
          })()
        ]);
      };
      if (providedPicks === null) {
      } else if (isFastAndSlowPicks(providedPicks)) {
        await applyFastAndSlowPicks(providedPicks);
      } else if (!(providedPicks instanceof Promise)) {
        applyPicks(providedPicks);
      } else {
        picker.busy = true;
        try {
          const awaitedPicks = await providedPicks;
          if (picksToken.isCancellationRequested) {
            return;
          }
          if (isFastAndSlowPicks(awaitedPicks)) {
            await applyFastAndSlowPicks(awaitedPicks);
          } else {
            applyPicks(awaitedPicks);
          }
        } finally {
          if (!picksToken.isCancellationRequested) {
            picker.busy = false;
          }
        }
      }
    };
    disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
    updatePickerItems();
    disposables.add(picker.onDidAccept((event) => {
      if (runOptions?.handleAccept) {
        if (!event.inBackground) {
          picker.hide();
        }
        runOptions.handleAccept?.(picker.activeItems[0], event.inBackground);
        return;
      }
      const [item] = picker.selectedItems;
      if (typeof item?.accept === "function") {
        const isAttachAction = isKeyModified(picker.keyMods) && !!item.attach;
        if (isAttachAction) {
          item.attach(picker.keyMods, event);
          return;
        }
        if (!event.inBackground) {
          picker.hide();
        }
        item.accept(picker.keyMods, event);
      }
    }));
    const buttonTrigger = async (button, item) => {
      if (typeof item.trigger !== "function") {
        return;
      }
      const buttonIndex = item.buttons?.indexOf(button) ?? -1;
      if (buttonIndex >= 0) {
        const result = item.trigger(buttonIndex, picker.keyMods);
        const action = typeof result === "number" ? result : await result;
        if (token.isCancellationRequested) {
          return;
        }
        switch (action) {
          case 0 /* NO_ACTION */:
            break;
          case 1 /* CLOSE_PICKER */:
            picker.hide();
            break;
          case 2 /* REFRESH_PICKER */:
            updatePickerItems();
            break;
          case 3 /* REMOVE_ITEM */: {
            const index = picker.items.indexOf(item);
            if (index !== -1) {
              const items = picker.items.slice();
              const removed = items.splice(index, 1);
              const activeItems = picker.activeItems.filter((activeItem) => activeItem !== removed[0]);
              const keepScrollPositionBefore = picker.keepScrollPosition;
              picker.keepScrollPosition = true;
              picker.items = items;
              if (activeItems) {
                picker.activeItems = activeItems;
              }
              picker.keepScrollPosition = keepScrollPositionBefore;
            }
            break;
          }
        }
      }
    };
    disposables.add(picker.onDidTriggerItemButton(({ button, item }) => buttonTrigger(button, item)));
    disposables.add(picker.onDidTriggerSeparatorButton(({ button, separator }) => buttonTrigger(button, separator)));
    return disposables;
  }
}
export {
  PickerQuickAccessProvider,
  TriggerAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9waWNrZXJRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUtleU1vZHMsIElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCwgSVF1aWNrUGlja1NlcGFyYXRvciwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIElRdWlja0lucHV0QnV0dG9uLCBpc0tleU1vZGlmaWVkIH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVF1aWNrQWNjZXNzUHJvdmlkZXIsIElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBpc0Z1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgZW51bSBUcmlnZ2VyQWN0aW9uIHtcblxuXHQvKipcblx0ICogRG8gbm90aGluZyBhZnRlciB0aGUgYnV0dG9uIHdhcyBjbGlja2VkLlxuXHQgKi9cblx0Tk9fQUNUSU9OLFxuXG5cdC8qKlxuXHQgKiBDbG9zZSB0aGUgcGlja2VyLlxuXHQgKi9cblx0Q0xPU0VfUElDS0VSLFxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIHJlc3VsdHMgb2YgdGhlIHBpY2tlci5cblx0ICovXG5cdFJFRlJFU0hfUElDS0VSLFxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgdGhlIGl0ZW0gZnJvbSB0aGUgcGlja2VyLlxuXHQgKi9cblx0UkVNT1ZFX0lURU1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXG5cdC8qKlxuXHQqIEEgbWV0aG9kIHRoYXQgd2lsbCBiZSBleGVjdXRlZCB3aGVuIHRoZSBwaWNrIGl0ZW0gaXMgYWNjZXB0ZWQgZnJvbVxuXHQqIHRoZSBwaWNrZXIuIFRoZSBwaWNrZXIgd2lsbCBjbG9zZSBhdXRvbWF0aWNhbGx5IGJlZm9yZSBydW5uaW5nIHRoaXMuXG5cdCpcblx0KiBAcGFyYW0ga2V5TW9kcyB0aGUgc3RhdGUgb2YgbW9kaWZpZXIga2V5cyB3aGVuIHRoZSBpdGVtIHdhcyBhY2NlcHRlZC5cblx0KiBAcGFyYW0gZXZlbnQgdGhlIHVuZGVybHlpbmcgZXZlbnQgdGhhdCBjYXVzZWQgdGhlIGFjY2VwdCB0byB0cmlnZ2VyLlxuXHQqL1xuXHRhY2NlcHQ/KGtleU1vZHM6IElLZXlNb2RzLCBldmVudDogSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50KTogdm9pZDtcblxuXHQvKipcblx0ICogQSBtZXRob2QgdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIHdoZW4gYSBidXR0b24gb2YgdGhlIHBpY2sgaXRlbSB3YXNcblx0ICogY2xpY2tlZCBvbi5cblx0ICpcblx0ICogQHBhcmFtIGJ1dHRvbkluZGV4IGluZGV4IG9mIHRoZSBidXR0b24gb2YgdGhlIGl0ZW0gdGhhdFxuXHQgKiB3YXMgY2xpY2tlZC5cblx0ICpcblx0ICogQHBhcmFtIGtleU1vZHMgdGhlIHN0YXRlIG9mIG1vZGlmaWVyIGtleXMgd2hlbiB0aGUgYnV0dG9uIHdhcyB0cmlnZ2VyZWQuXG5cdCAqXG5cdCAqIEByZXR1cm5zIGEgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2hhdCBzaG91bGQgaGFwcGVuIGFmdGVyIHRoZSB0cmlnZ2VyXG5cdCAqIHdoaWNoIGNhbiBiZSBhIGBQcm9taXNlYCBmb3IgbG9uZyBydW5uaW5nIG9wZXJhdGlvbnMuXG5cdCAqL1xuXHR0cmlnZ2VyPyhidXR0b25JbmRleDogbnVtYmVyLCBrZXlNb2RzOiBJS2V5TW9kcyk6IFRyaWdnZXJBY3Rpb24gfCBQcm9taXNlPFRyaWdnZXJBY3Rpb24+O1xuXG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgdGhpcyB3aWxsIGJlIGludm9rZWQgaW5zdGVhZCBvZiBgYWNjZXB0YCBpZiBtb2RpZmllciBrZXlzIGFyZSBoZWxkIGRvd24uXG5cdCAqIFRoaXMgaXMgdXNlZnVsIGZvciBhY3Rpb25zIGxpa2UgXCJhdHRhY2ggdG8gY29udGV4dFwiIHdoZXJlIHlvdSB3YW50IHRvIGtlZXAgdGhlIHBpY2tlclxuXHQgKiBvcGVuIGFuZCBhbGxvdyBtdWx0aXBsZSBwaWNrcy5cblx0ICpcblx0ICogQHBhcmFtIGtleU1vZHMgdGhlIHN0YXRlIG9mIG1vZGlmaWVyIGtleXMgd2hlbiB0aGUgaXRlbSB3YXMgYWNjZXB0ZWQuXG5cdCAqIEBwYXJhbSBldmVudCB0aGUgdW5kZXJseWluZyBldmVudCB0aGF0IGNhdXNlZCB0aGlzIHRvIHRyaWdnZXIuXG5cdCAqL1xuXHRhdHRhY2g/KGtleU1vZHM6IElLZXlNb2RzLCBldmVudDogSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50KTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGlja2VyUXVpY2tBY2Nlc3NTZXBhcmF0b3IgZXh0ZW5kcyBJUXVpY2tQaWNrU2VwYXJhdG9yIHtcblx0LyoqXG5cdCAqIEEgbWV0aG9kIHRoYXQgd2lsbCBiZSBleGVjdXRlZCB3aGVuIGEgYnV0dG9uIG9mIHRoZSBwaWNrIGl0ZW0gd2FzXG5cdCAqIGNsaWNrZWQgb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBidXR0b25JbmRleCBpbmRleCBvZiB0aGUgYnV0dG9uIG9mIHRoZSBpdGVtIHRoYXRcblx0ICogd2FzIGNsaWNrZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBrZXlNb2RzIHRoZSBzdGF0ZSBvZiBtb2RpZmllciBrZXlzIHdoZW4gdGhlIGJ1dHRvbiB3YXMgdHJpZ2dlcmVkLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBhIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoYXQgc2hvdWxkIGhhcHBlbiBhZnRlciB0aGUgdHJpZ2dlclxuXHQgKiB3aGljaCBjYW4gYmUgYSBgUHJvbWlzZWAgZm9yIGxvbmcgcnVubmluZyBvcGVyYXRpb25zLlxuXHQgKi9cblx0dHJpZ2dlcj8oYnV0dG9uSW5kZXg6IG51bWJlciwga2V5TW9kczogSUtleU1vZHMpOiBUcmlnZ2VyQWN0aW9uIHwgUHJvbWlzZTxUcmlnZ2VyQWN0aW9uPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlck9wdGlvbnM8VCBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHtcblxuXHQvKipcblx0ICogRW5hYmxlcyBzdXBwb3J0IGZvciBvcGVuaW5nIHBpY2tzIGluIHRoZSBiYWNrZ3JvdW5kIHZpYSBnZXN0dXJlLlxuXHQgKi9cblx0cmVhZG9ubHkgY2FuQWNjZXB0SW5CYWNrZ3JvdW5kPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRW5hYmxlcyB0byBzaG93IGEgcGljayBlbnRyeSB3aGVuIG5vIHJlc3VsdHMgYXJlIHJldHVybmVkIGZyb20gYSBzZWFyY2guXG5cdCAqL1xuXHRyZWFkb25seSBub1Jlc3VsdHNQaWNrPzogVCB8ICgoZmlsdGVyOiBzdHJpbmcpID0+IFQpO1xuXG5cdC8qKiBXaGV0aGVyIHRvIHNraXAgdHJpbW1pbmcgdGhlIHBpY2sgZmlsdGVyIHN0cmluZyAqL1xuXHRyZWFkb25seSBzaG91bGRTa2lwVHJpbVBpY2tGaWx0ZXI/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBQaWNrPFQ+ID0gVCB8IElRdWlja1BpY2tTZXBhcmF0b3I7XG5leHBvcnQgdHlwZSBQaWNrc1dpdGhBY3RpdmU8VD4gPSB7IGl0ZW1zOiByZWFkb25seSBQaWNrPFQ+W107IGFjdGl2ZT86IFQgfTtcbmV4cG9ydCB0eXBlIFBpY2tzPFQ+ID0gcmVhZG9ubHkgUGljazxUPltdIHwgUGlja3NXaXRoQWN0aXZlPFQ+O1xuZXhwb3J0IHR5cGUgRmFzdEFuZFNsb3dQaWNrczxUPiA9IHtcblxuXHQvKipcblx0ICogUGlja3MgdGhhdCB3aWxsIHNob3cgaW5zdGFudGx5IG9yIGFmdGVyIGEgc2hvcnQgZGVsYXlcblx0ICogYmFzZWQgb24gdGhlIGBtZXJnZURlbGF5YCBwcm9wZXJ0eSB0byByZWR1Y2UgZmxpY2tlci5cblx0ICovXG5cdHJlYWRvbmx5IHBpY2tzOiBQaWNrczxUPjtcblxuXHQvKipcblx0ICogUGlja3MgdGhhdCB3aWxsIHNob3cgYWZ0ZXIgdGhleSBoYXZlIGJlZW4gcmVzb2x2ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBhZGRpdGlvbmFsUGlja3M6IFByb21pc2U8UGlja3M8VD4+O1xuXG5cdC8qKlxuXHQgKiBBIGRlbGF5IGluIG1pbGxpc2Vjb25kcyB0byB3YWl0IGJlZm9yZSBzaG93aW5nIHRoZVxuXHQgKiBgcGlja3NgIHRvIGdpdmUgYSBjaGFuY2UgdG8gbWVyZ2Ugd2l0aCBgYWRkaXRpb25hbFBpY2tzYFxuXHQgKiBmb3IgcmVkdWNlZCBmbGlja2VyLlxuXHQgKi9cblx0cmVhZG9ubHkgbWVyZ2VEZWxheT86IG51bWJlcjtcbn07XG5cbmZ1bmN0aW9uIGlzUGlja3NXaXRoQWN0aXZlPFQ+KG9iajogdW5rbm93bik6IG9iaiBpcyBQaWNrc1dpdGhBY3RpdmU8VD4ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgUGlja3NXaXRoQWN0aXZlPFQ+O1xuXG5cdHJldHVybiBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5pdGVtcyk7XG59XG5cbmZ1bmN0aW9uIGlzRmFzdEFuZFNsb3dQaWNrczxUPihvYmo6IHVua25vd24pOiBvYmogaXMgRmFzdEFuZFNsb3dQaWNrczxUPiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IG9iaiBhcyBGYXN0QW5kU2xvd1BpY2tzPFQ+O1xuXG5cdHJldHVybiAhIWNhbmRpZGF0ZS5waWNrcyAmJiBjYW5kaWRhdGUuYWRkaXRpb25hbFBpY2tzIGluc3RhbmNlb2YgUHJvbWlzZTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8VCBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElRdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHByZWZpeDogc3RyaW5nLCBwcm90ZWN0ZWQgb3B0aW9ucz86IElQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyT3B0aW9uczxUPikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm92aWRlKHBpY2tlcjogSVF1aWNrUGljazxULCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIEFwcGx5IG9wdGlvbnMgaWYgYW55XG5cdFx0cGlja2VyLmNhbkFjY2VwdEluQmFja2dyb3VuZCA9ICEhdGhpcy5vcHRpb25zPy5jYW5BY2NlcHRJbkJhY2tncm91bmQ7XG5cblx0XHQvLyBEaXNhYmxlIGZpbHRlcmluZyAmIHNvcnRpbmcsIHdlIGNvbnRyb2wgdGhlIHJlc3VsdHNcblx0XHRwaWNrZXIubWF0Y2hPbkxhYmVsID0gcGlja2VyLm1hdGNoT25EZXNjcmlwdGlvbiA9IHBpY2tlci5tYXRjaE9uRGV0YWlsID0gcGlja2VyLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBwaWNrcyBhbmQgdXBkYXRlIG9uIHR5cGVcblx0XHRsZXQgcGlja3NDdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBpY2tzRGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgdXBkYXRlUGlja2VySXRlbXMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDYW5jZWwgYW55IHByZXZpb3VzIGFzayBmb3IgcGlja3MgYW5kIGJ1c3lcblx0XHRcdHBpY2tzQ3RzPy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblxuXHRcdFx0Ly8gU2V0dGluZyB0aGUgLnZhbHVlIHdpbGwgY2FsbCBkaXNwb3NlKCkgb24gdGhlIHByZXZpb3VzIHZhbHVlLCBzbyB3ZSBuZWVkIHRvIGRvIHRoaXMgQUZURVIgY2FuY2VsbGluZyB3aXRoIGRpc3Bvc2UodHJ1ZSkuXG5cdFx0XHRjb25zdCBwaWNrc0Rpc3Bvc2FibGVzID0gcGlja3NEaXNwb3NhYmxlLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHQvLyBDcmVhdGUgbmV3IGNhbmNlbGxhdGlvbiBzb3VyY2UgZm9yIHRoaXMgcnVuXG5cdFx0XHRwaWNrc0N0cyA9IHBpY2tzRGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbikpO1xuXG5cdFx0XHQvLyBDb2xsZWN0IHBpY2tzIGFuZCBzdXBwb3J0IGJvdGggbG9uZyBydW5uaW5nIGFuZCBzaG9ydCBvciBjb21iaW5lZFxuXHRcdFx0Y29uc3QgcGlja3NUb2tlbiA9IHBpY2tzQ3RzLnRva2VuO1xuXHRcdFx0bGV0IHBpY2tzRmlsdGVyID0gcGlja2VyLnZhbHVlLnN1YnN0cmluZyh0aGlzLnByZWZpeC5sZW5ndGgpO1xuXG5cdFx0XHRpZiAoIXRoaXMub3B0aW9ucz8uc2hvdWxkU2tpcFRyaW1QaWNrRmlsdGVyKSB7XG5cdFx0XHRcdHBpY2tzRmlsdGVyID0gcGlja3NGaWx0ZXIudHJpbSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm92aWRlZFBpY2tzID0gdGhpcy5fZ2V0UGlja3MocGlja3NGaWx0ZXIsIHBpY2tzRGlzcG9zYWJsZXMsIHBpY2tzVG9rZW4sIHJ1bk9wdGlvbnMpO1xuXG5cdFx0XHRjb25zdCBhcHBseVBpY2tzID0gKHBpY2tzOiBQaWNrczxUPiwgc2tpcEVtcHR5PzogYm9vbGVhbik6IGJvb2xlYW4gPT4ge1xuXHRcdFx0XHRsZXQgaXRlbXM6IHJlYWRvbmx5IFBpY2s8VD5bXTtcblx0XHRcdFx0bGV0IGFjdGl2ZUl0ZW06IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGlzUGlja3NXaXRoQWN0aXZlKHBpY2tzKSkge1xuXHRcdFx0XHRcdGl0ZW1zID0gcGlja3MuaXRlbXM7XG5cdFx0XHRcdFx0YWN0aXZlSXRlbSA9IHBpY2tzLmFjdGl2ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpdGVtcyA9IHBpY2tzO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGlmIChza2lwRW1wdHkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBXZSBzaG93IHRoZSBubyByZXN1bHRzIHBpY2sgaWYgd2UgaGF2ZSBubyBpbnB1dCB0byBwcmV2ZW50IGNvbXBsZXRlbHkgZW1wdHkgcGlja2VycyAjMTcyNjEzXG5cdFx0XHRcdFx0aWYgKChwaWNrc0ZpbHRlci5sZW5ndGggPiAwIHx8IHBpY2tlci5oaWRlSW5wdXQpICYmIHRoaXMub3B0aW9ucz8ubm9SZXN1bHRzUGljaykge1xuXHRcdFx0XHRcdFx0aWYgKGlzRnVuY3Rpb24odGhpcy5vcHRpb25zLm5vUmVzdWx0c1BpY2spKSB7XG5cdFx0XHRcdFx0XHRcdGl0ZW1zID0gW3RoaXMub3B0aW9ucy5ub1Jlc3VsdHNQaWNrKHBpY2tzRmlsdGVyKV07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpdGVtcyA9IFt0aGlzLm9wdGlvbnMubm9SZXN1bHRzUGlja107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdGlmIChhY3RpdmVJdGVtKSB7XG5cdFx0XHRcdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW2FjdGl2ZUl0ZW1dO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhcHBseUZhc3RBbmRTbG93UGlja3MgPSBhc3luYyAoZmFzdEFuZFNsb3dQaWNrczogRmFzdEFuZFNsb3dQaWNrczxUPik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0XHRsZXQgZmFzdFBpY2tzQXBwbGllZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgc2xvd1BpY2tzQXBwbGllZCA9IGZhbHNlO1xuXG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblxuXHRcdFx0XHRcdC8vIEZhc3QgUGlja3M6IGlmIGBtZXJnZURlbGF5YCBpcyBjb25maWd1cmVkLCBpbiBvcmRlciB0byByZWR1Y2Vcblx0XHRcdFx0XHQvLyBhbW91bnQgb2YgZmxpY2tlciwgd2UgcmFjZSBhZ2FpbnN0IHRoZSBzbG93IHBpY2tzIG92ZXIgc29tZSBkZWxheVxuXHRcdFx0XHRcdC8vIGFuZCB0aGVuIHNldCB0aGUgZmFzdCBwaWNrcy5cblx0XHRcdFx0XHQvLyBJZiB0aGUgc2xvdyBwaWNrcyBhcmUgZmFzdGVyLCB3ZSByZWR1Y2UgdGhlIGZsaWNrZXIgYnkgb25seVxuXHRcdFx0XHRcdC8vIHNldHRpbmcgdGhlIGl0ZW1zIG9uY2UuXG5cblx0XHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBmYXN0QW5kU2xvd1BpY2tzLm1lcmdlRGVsYXkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoZmFzdEFuZFNsb3dQaWNrcy5tZXJnZURlbGF5KTtcblx0XHRcdFx0XHRcdFx0aWYgKHBpY2tzVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKCFzbG93UGlja3NBcHBsaWVkKSB7XG5cdFx0XHRcdFx0XHRcdGZhc3RQaWNrc0FwcGxpZWQgPSBhcHBseVBpY2tzKGZhc3RBbmRTbG93UGlja3MucGlja3MsIHRydWUgLyogc2tpcCBvdmVyIGVtcHR5IHRvIHJlZHVjZSBmbGlja2VyICovKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSgpLFxuXG5cdFx0XHRcdFx0Ly8gU2xvdyBQaWNrczogd2UgYXdhaXQgdGhlIHNsb3cgcGlja3MgYW5kIHRoZW4gc2V0IHRoZW0gYXRcblx0XHRcdFx0XHQvLyBvbmNlIHRvZ2V0aGVyIHdpdGggdGhlIGZhc3QgcGlja3MsIGJ1dCBvbmx5IGlmIHdlIGFjdHVhbGx5XG5cdFx0XHRcdFx0Ly8gaGF2ZSBhZGRpdGlvbmFsIHJlc3VsdHMuXG5cblx0XHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYXdhaXRlZEFkZGl0aW9uYWxQaWNrcyA9IGF3YWl0IGZhc3RBbmRTbG93UGlja3MuYWRkaXRpb25hbFBpY2tzO1xuXHRcdFx0XHRcdFx0XHRpZiAocGlja3NUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGxldCBwaWNrczogcmVhZG9ubHkgUGljazxUPltdO1xuXHRcdFx0XHRcdFx0XHRsZXQgYWN0aXZlUGljazogUGljazxUPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKGlzUGlja3NXaXRoQWN0aXZlKGZhc3RBbmRTbG93UGlja3MucGlja3MpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cGlja3MgPSBmYXN0QW5kU2xvd1BpY2tzLnBpY2tzLml0ZW1zO1xuXHRcdFx0XHRcdFx0XHRcdGFjdGl2ZVBpY2sgPSBmYXN0QW5kU2xvd1BpY2tzLnBpY2tzLmFjdGl2ZTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRwaWNrcyA9IGZhc3RBbmRTbG93UGlja3MucGlja3M7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRsZXQgYWRkaXRpb25hbFBpY2tzOiByZWFkb25seSBQaWNrPFQ+W107XG5cdFx0XHRcdFx0XHRcdGxldCBhZGRpdGlvbmFsQWN0aXZlUGljazogUGljazxUPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKGlzUGlja3NXaXRoQWN0aXZlKGF3YWl0ZWRBZGRpdGlvbmFsUGlja3MpKSB7XG5cdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFBpY2tzID0gYXdhaXRlZEFkZGl0aW9uYWxQaWNrcy5pdGVtcztcblx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsQWN0aXZlUGljayA9IGF3YWl0ZWRBZGRpdGlvbmFsUGlja3MuYWN0aXZlO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQaWNrcyA9IGF3YWl0ZWRBZGRpdGlvbmFsUGlja3M7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAoYWRkaXRpb25hbFBpY2tzLmxlbmd0aCA+IDAgfHwgIWZhc3RQaWNrc0FwcGxpZWQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBJZiB3ZSBkbyBub3QgaGF2ZSBhbnkgYWN0aXZlUGljayBvciBhZGRpdGlvbmFsQWN0aXZlUGlja1xuXHRcdFx0XHRcdFx0XHRcdC8vIHdlIHRyeSB0byBwcmVzZXJ2ZSB0aGUgY3VycmVudGx5IGFjdGl2ZSBwaWNrIGZyb20gdGhlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gZmFzdCByZXN1bHRzLiBUaGlzIGZpeGVzIGFuIGlzc3VlIHdoZXJlIHRoZSB1c2VyIG1pZ2h0XG5cdFx0XHRcdFx0XHRcdFx0Ly8gaGF2ZSBtYWRlIGEgcGljayBhY3RpdmUgYmVmb3JlIHRoZSBhZGRpdGlvbmFsIHJlc3VsdHNcblx0XHRcdFx0XHRcdFx0XHQvLyBraWNrIGluLlxuXHRcdFx0XHRcdFx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTAyNDgwXG5cdFx0XHRcdFx0XHRcdFx0bGV0IGZhbGxiYWNrQWN0aXZlUGljazogUGljazxUPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIWFjdGl2ZVBpY2sgJiYgIWFkZGl0aW9uYWxBY3RpdmVQaWNrKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBmYWxsYmFja0FjdGl2ZVBpY2tDYW5kaWRhdGUgPSBwaWNrZXIuYWN0aXZlSXRlbXNbMF07XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZmFsbGJhY2tBY3RpdmVQaWNrQ2FuZGlkYXRlICYmIHBpY2tzLmluZGV4T2YoZmFsbGJhY2tBY3RpdmVQaWNrQ2FuZGlkYXRlKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZmFsbGJhY2tBY3RpdmVQaWNrID0gZmFsbGJhY2tBY3RpdmVQaWNrQ2FuZGlkYXRlO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGFwcGx5UGlja3Moe1xuXHRcdFx0XHRcdFx0XHRcdFx0aXRlbXM6IFsuLi5waWNrcywgLi4uYWRkaXRpb25hbFBpY2tzXSxcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGl2ZTogYWN0aXZlUGljayB8fCBhZGRpdGlvbmFsQWN0aXZlUGljayB8fCBmYWxsYmFja0FjdGl2ZVBpY2tcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdFx0aWYgKCFwaWNrc1Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHNsb3dQaWNrc0FwcGxpZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKClcblx0XHRcdFx0XSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBObyBQaWNrc1xuXHRcdFx0aWYgKHByb3ZpZGVkUGlja3MgPT09IG51bGwpIHtcblx0XHRcdFx0Ly8gSWdub3JlXG5cdFx0XHR9XG5cblx0XHRcdC8vIEZhc3QgYW5kIFNsb3cgUGlja3Ncblx0XHRcdGVsc2UgaWYgKGlzRmFzdEFuZFNsb3dQaWNrcyhwcm92aWRlZFBpY2tzKSkge1xuXHRcdFx0XHRhd2FpdCBhcHBseUZhc3RBbmRTbG93UGlja3MocHJvdmlkZWRQaWNrcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZhc3QgUGlja3Ncblx0XHRcdGVsc2UgaWYgKCEocHJvdmlkZWRQaWNrcyBpbnN0YW5jZW9mIFByb21pc2UpKSB7XG5cdFx0XHRcdGFwcGx5UGlja3MocHJvdmlkZWRQaWNrcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNsb3cgUGlja3Ncblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgYXdhaXRlZFBpY2tzID0gYXdhaXQgcHJvdmlkZWRQaWNrcztcblx0XHRcdFx0XHRpZiAocGlja3NUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpc0Zhc3RBbmRTbG93UGlja3MoYXdhaXRlZFBpY2tzKSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgYXBwbHlGYXN0QW5kU2xvd1BpY2tzKGF3YWl0ZWRQaWNrcyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFwcGx5UGlja3MoYXdhaXRlZFBpY2tzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKCFwaWNrc1Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZVZhbHVlKCgpID0+IHVwZGF0ZVBpY2tlckl0ZW1zKCkpKTtcblx0XHR1cGRhdGVQaWNrZXJJdGVtcygpO1xuXG5cdFx0Ly8gQWNjZXB0IHRoZSBwaWNrIG9uIGFjY2VwdCBhbmQgaGlkZSBwaWNrZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGV2ZW50ID0+IHtcblx0XHRcdGlmIChydW5PcHRpb25zPy5oYW5kbGVBY2NlcHQpIHtcblx0XHRcdFx0aWYgKCFldmVudC5pbkJhY2tncm91bmQpIHtcblx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpOyAvLyBoaWRlIHBpY2tlciB1bmxlc3Mgd2UgYWNjZXB0IGluIGJhY2tncm91bmRcblx0XHRcdFx0fVxuXHRcdFx0XHRydW5PcHRpb25zLmhhbmRsZUFjY2VwdD8uKHBpY2tlci5hY3RpdmVJdGVtc1swXSwgZXZlbnQuaW5CYWNrZ3JvdW5kKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBbaXRlbV0gPSBwaWNrZXIuc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmICh0eXBlb2YgaXRlbT8uYWNjZXB0ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGNvbnN0IGlzQXR0YWNoQWN0aW9uID0gaXNLZXlNb2RpZmllZChwaWNrZXIua2V5TW9kcykgJiYgISFpdGVtLmF0dGFjaDtcblx0XHRcdFx0aWYgKGlzQXR0YWNoQWN0aW9uKSB7XG5cdFx0XHRcdFx0aXRlbS5hdHRhY2ghKHBpY2tlci5rZXlNb2RzLCBldmVudCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZXZlbnQuaW5CYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0cGlja2VyLmhpZGUoKTsgLy8gaGlkZSBwaWNrZXIgdW5sZXNzIHdlIGFjY2VwdCBpbiBiYWNrZ3JvdW5kXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpdGVtLmFjY2VwdChwaWNrZXIua2V5TW9kcywgZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJ1dHRvblRyaWdnZXIgPSBhc3luYyAoYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiwgaXRlbTogVCB8IElQaWNrZXJRdWlja0FjY2Vzc1NlcGFyYXRvcikgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBpdGVtLnRyaWdnZXIgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBidXR0b25JbmRleCA9IGl0ZW0uYnV0dG9ucz8uaW5kZXhPZihidXR0b24pID8/IC0xO1xuXHRcdFx0aWYgKGJ1dHRvbkluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gaXRlbS50cmlnZ2VyKGJ1dHRvbkluZGV4LCBwaWNrZXIua2V5TW9kcyk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9ICh0eXBlb2YgcmVzdWx0ID09PSAnbnVtYmVyJykgPyByZXN1bHQgOiBhd2FpdCByZXN1bHQ7XG5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3dpdGNoIChhY3Rpb24pIHtcblx0XHRcdFx0XHRjYXNlIFRyaWdnZXJBY3Rpb24uTk9fQUNUSU9OOlxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjpcblx0XHRcdFx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFRyaWdnZXJBY3Rpb24uUkVGUkVTSF9QSUNLRVI6XG5cdFx0XHRcdFx0XHR1cGRhdGVQaWNrZXJJdGVtcygpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBUcmlnZ2VyQWN0aW9uLlJFTU9WRV9JVEVNOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHBpY2tlci5pdGVtcy5pbmRleE9mKGl0ZW0pO1xuXHRcdFx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IHBpY2tlci5pdGVtcy5zbGljZSgpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZW1vdmVkID0gaXRlbXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlSXRlbXMgPSBwaWNrZXIuYWN0aXZlSXRlbXMuZmlsdGVyKGFjdGl2ZUl0ZW0gPT4gYWN0aXZlSXRlbSAhPT0gcmVtb3ZlZFswXSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGtlZXBTY3JvbGxQb3NpdGlvbkJlZm9yZSA9IHBpY2tlci5rZWVwU2Nyb2xsUG9zaXRpb247XG5cdFx0XHRcdFx0XHRcdHBpY2tlci5rZWVwU2Nyb2xsUG9zaXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHRcdFx0XHRcdFx0aWYgKGFjdGl2ZUl0ZW1zKSB7XG5cdFx0XHRcdFx0XHRcdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gYWN0aXZlSXRlbXM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cGlja2VyLmtlZXBTY3JvbGxQb3NpdGlvbiA9IGtlZXBTY3JvbGxQb3NpdGlvbkJlZm9yZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBUcmlnZ2VyIHRoZSBwaWNrIHdpdGggYnV0dG9uIGluZGV4IGlmIGJ1dHRvbiB0cmlnZ2VyZWRcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oKHsgYnV0dG9uLCBpdGVtIH0pID0+IGJ1dHRvblRyaWdnZXIoYnV0dG9uLCBpdGVtKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRUcmlnZ2VyU2VwYXJhdG9yQnV0dG9uKCh7IGJ1dHRvbiwgc2VwYXJhdG9yIH0pID0+IGJ1dHRvblRyaWdnZXIoYnV0dG9uLCBzZXBhcmF0b3IpKSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBhcnJheSBvZiBwaWNrcyBhbmQgc2VwYXJhdG9ycyBhcyBuZWVkZWQuIElmIHRoZSBwaWNrcyBhcmUgcmVzb2x2ZWRcblx0ICogbG9uZyBydW5uaW5nLCB0aGUgcHJvdmlkZWQgY2FuY2VsbGF0aW9uIHRva2VuIHNob3VsZCBiZSB1c2VkIHRvIGNhbmNlbCB0aGVcblx0ICogb3BlcmF0aW9uIHdoZW4gdGhlIHRva2VuIHNpZ25hbHMgdGhpcy5cblx0ICpcblx0ICogVGhlIGltcGxlbWVudG9yIGlzIHJlc3BvbnNpYmxlIGZvciBmaWx0ZXJpbmcgYW5kIHNvcnRpbmcgdGhlIHBpY2tzIGdpdmVuIHRoZVxuXHQgKiBwcm92aWRlZCBgZmlsdGVyYC5cblx0ICpcblx0ICogQHBhcmFtIGZpbHRlciBhIGZpbHRlciB0byBhcHBseSB0byB0aGUgcGlja3MuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlcyBjYW4gYmUgdXNlZCB0byByZWdpc3RlciBkaXNwb3NhYmxlcyB0aGF0IHNob3VsZCBiZSBjbGVhbmVkXG5cdCAqIHVwIHdoZW4gdGhlIHBpY2tlciBjbG9zZXMuXG5cdCAqIEBwYXJhbSB0b2tlbiBmb3IgbG9uZyBydW5uaW5nIHRhc2tzLCBpbXBsZW1lbnRvcnMgbmVlZCB0byBjaGVjayBvbiBjYW5jZWxsYXRpb25cblx0ICogdGhyb3VnaCB0aGlzIHRva2VuLlxuXHQgKiBAcmV0dXJucyB0aGUgcGlja3MgZWl0aGVyIGRpcmVjdGx5LCBhcyBwcm9taXNlIG9yIGNvbWJpbmVkIGZhc3QgYW5kIHNsb3cgcmVzdWx0cy5cblx0ICogUGlja2VycyBjYW4gcmV0dXJuIGBudWxsYCB0byBzaWduYWwgdGhhdCBubyBjaGFuZ2UgaW4gcGlja3MgaXMgbmVlZGVkLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zKTogUGlja3M8VD4gfCBQcm9taXNlPFBpY2tzPFQ+IHwgRmFzdEFuZFNsb3dQaWNrczxUPj4g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QUFPLFNBQVMsS0FBSztBQUNsQztBQUFBLFFBQ0Q7QUFDQSxZQUFJLENBQUMsTUFBTSxjQUFjO0FBQ3hCLGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBRUEsYUFBSyxPQUFPLE9BQU8sU0FBUyxLQUFLO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sZ0JBQWdCLE9BQU8sUUFBMkIsU0FBMEM7QUFDakcsVUFBSSxPQUFPLEtBQUssWUFBWSxZQUFZO0FBQ3ZDO0FBQUEsTUFDRDtBQUVBLFlBQU0sY0FBYyxLQUFLLFNBQVMsUUFBUSxNQUFNLEtBQUs7QUFDckQsVUFBSSxlQUFlLEdBQUc7QUFDckIsY0FBTSxTQUFTLEtBQUssUUFBUSxhQUFhLE9BQU8sT0FBTztBQUN2RCxjQUFNLFNBQVUsT0FBTyxXQUFXLFdBQVksU0FBUyxNQUFNO0FBRTdELFlBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxRQUNEO0FBRUEsZ0JBQVEsUUFBUTtBQUFBLFVBQ2YsS0FBSztBQUNKO0FBQUEsVUFDRCxLQUFLO0FBQ0osbUJBQU8sS0FBSztBQUNaO0FBQUEsVUFDRCxLQUFLO0FBQ0osOEJBQWtCO0FBQ2xCO0FBQUEsVUFDRCxLQUFLLHFCQUEyQjtBQUMvQixrQkFBTSxRQUFRLE9BQU8sTUFBTSxRQUFRLElBQUk7QUFDdkMsZ0JBQUksVUFBVSxJQUFJO0FBQ2pCLG9CQUFNLFFBQVEsT0FBTyxNQUFNLE1BQU07QUFDakMsb0JBQU0sVUFBVSxNQUFNLE9BQU8sT0FBTyxDQUFDO0FBQ3JDLG9CQUFNLGNBQWMsT0FBTyxZQUFZLE9BQU8sZ0JBQWMsZUFBZSxRQUFRLENBQUMsQ0FBQztBQUNyRixvQkFBTSwyQkFBMkIsT0FBTztBQUN4QyxxQkFBTyxxQkFBcUI7QUFDNUIscUJBQU8sUUFBUTtBQUNmLGtCQUFJLGFBQWE7QUFDaEIsdUJBQU8sY0FBYztBQUFBLGNBQ3RCO0FBQ0EscUJBQU8scUJBQXFCO0FBQUEsWUFDN0I7QUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxnQkFBWSxJQUFJLE9BQU8sdUJBQXVCLENBQUMsRUFBRSxRQUFRLEtBQUssTUFBTSxjQUFjLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFDaEcsZ0JBQVksSUFBSSxPQUFPLDRCQUE0QixDQUFDLEVBQUUsUUFBUSxVQUFVLE1BQU0sY0FBYyxRQUFRLFNBQVMsQ0FBQyxDQUFDO0FBRS9HLFdBQU87QUFBQSxFQUNSO0FBbUJEOyIsCiAgIm5hbWVzIjogWyJUcmlnZ2VyQWN0aW9uIl0KfQo=
