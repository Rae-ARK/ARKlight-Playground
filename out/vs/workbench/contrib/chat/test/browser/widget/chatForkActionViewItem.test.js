import assert from "assert";
import { ModifierKeyEmitter } from "../../../../../../base/browser/dom.js";
import { ActionRunner } from "../../../../../../base/common/actions.js";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { MenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { ForkConversationActionId } from "../../../browser/actions/chatForkActions.js";
import { ChatForkActionViewItem } from "../../../browser/widget/chatForkActionViewItem.js";
suite("ChatForkActionViewItem", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("shows a spinner while the fork action is running", async () => {
    store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
    const instantiationService = workbenchInstantiationService(void 0, store);
    const action = instantiationService.createInstance(MenuItemAction, {
      id: ForkConversationActionId,
      title: "Fork Conversation",
      tooltip: "Fork conversation from this point",
      icon: Codicon.repoForked
    }, void 0, void 0, void 0, void 0);
    const viewItem = store.add(instantiationService.createInstance(ChatForkActionViewItem, action, void 0));
    const container = document.createElement("div");
    viewItem.render(container);
    const operation = new DeferredPromise();
    const actionRunner = store.add(new class extends ActionRunner {
      async runAction(_action) {
        await operation.p;
      }
    }());
    viewItem.actionRunner = actionRunner;
    const forkIconClass = `codicon-${Codicon.repoForked.id}`;
    const loadingIconClass = `codicon-${Codicon.loading.id}`;
    const runPromise = actionRunner.run(action);
    const label = container.querySelector(".action-label");
    const icon = label?.querySelector(".chat-fork-action-icon");
    assert.ok(label);
    assert.ok(icon);
    assert.deepStrictEqual({
      during: {
        buttonCodicon: label.classList.contains("codicon"),
        buttonSpinning: label.classList.contains("codicon-modifier-spin"),
        forkIcon: icon.classList.contains(forkIconClass),
        loadingIcon: icon.classList.contains(loadingIconClass),
        iconSpinning: icon.classList.contains("codicon-modifier-spin"),
        busy: label.getAttribute("aria-busy"),
        label: label.getAttribute("aria-label")
      }
    }, {
      during: {
        buttonCodicon: true,
        buttonSpinning: false,
        forkIcon: false,
        loadingIcon: true,
        iconSpinning: true,
        busy: "true",
        label: "Forking conversation"
      }
    });
    operation.complete();
    await runPromise;
    assert.deepStrictEqual({
      buttonCodicon: label.classList.contains("codicon"),
      buttonSpinning: label.classList.contains("codicon-modifier-spin"),
      forkIcon: icon.classList.contains(forkIconClass),
      loadingIcon: icon.classList.contains(loadingIconClass),
      iconSpinning: icon.classList.contains("codicon-modifier-spin"),
      busy: label.getAttribute("aria-busy"),
      label: label.getAttribute("aria-label")
    }, {
      buttonCodicon: true,
      buttonSpinning: false,
      forkIcon: true,
      loadingIcon: false,
      iconSpinning: false,
      busy: "false",
      label: "Fork conversation from this point"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Rm9ya0FjdGlvblZpZXdJdGVtLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBNb2RpZmllcktleUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgRm9ya0NvbnZlcnNhdGlvbkFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRGb3JrQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Rm9ya0FjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdEZvcmtBY3Rpb25WaWV3SXRlbS5qcyc7XG5cbnN1aXRlKCdDaGF0Rm9ya0FjdGlvblZpZXdJdGVtJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3dzIGEgc3Bpbm5lciB3aGlsZSB0aGUgZm9yayBhY3Rpb24gaXMgcnVubmluZycsIGFzeW5jICgpID0+IHtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IE1vZGlmaWVyS2V5RW1pdHRlci5kaXNwb3NlSW5zdGFuY2UoKSkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUl0ZW1BY3Rpb24sIHtcblx0XHRcdGlkOiBGb3JrQ29udmVyc2F0aW9uQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogJ0ZvcmsgQ29udmVyc2F0aW9uJyxcblx0XHRcdHRvb2x0aXA6ICdGb3JrIGNvbnZlcnNhdGlvbiBmcm9tIHRoaXMgcG9pbnQnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvRm9ya2VkLFxuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgdmlld0l0ZW0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEZvcmtBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR2aWV3SXRlbS5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBhY3Rpb25SdW5uZXIgPSBzdG9yZS5hZGQobmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oX2FjdGlvbjogSUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCBvcGVyYXRpb24ucDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR2aWV3SXRlbS5hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cblx0XHRjb25zdCBmb3JrSWNvbkNsYXNzID0gYGNvZGljb24tJHtDb2RpY29uLnJlcG9Gb3JrZWQuaWR9YDtcblx0XHRjb25zdCBsb2FkaW5nSWNvbkNsYXNzID0gYGNvZGljb24tJHtDb2RpY29uLmxvYWRpbmcuaWR9YDtcblx0XHRjb25zdCBydW5Qcm9taXNlID0gYWN0aW9uUnVubmVyLnJ1bihhY3Rpb24pO1xuXHRcdGNvbnN0IGxhYmVsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWN0aW9uLWxhYmVsJyk7XG5cdFx0Y29uc3QgaWNvbiA9IGxhYmVsPy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtZm9yay1hY3Rpb24taWNvbicpO1xuXHRcdGFzc2VydC5vayhsYWJlbCk7XG5cdFx0YXNzZXJ0Lm9rKGljb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkdXJpbmc6IHtcblx0XHRcdFx0YnV0dG9uQ29kaWNvbjogbGFiZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uJyksXG5cdFx0XHRcdGJ1dHRvblNwaW5uaW5nOiBsYWJlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24tbW9kaWZpZXItc3BpbicpLFxuXHRcdFx0XHRmb3JrSWNvbjogaWNvbi5jbGFzc0xpc3QuY29udGFpbnMoZm9ya0ljb25DbGFzcyksXG5cdFx0XHRcdGxvYWRpbmdJY29uOiBpY29uLmNsYXNzTGlzdC5jb250YWlucyhsb2FkaW5nSWNvbkNsYXNzKSxcblx0XHRcdFx0aWNvblNwaW5uaW5nOiBpY29uLmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1tb2RpZmllci1zcGluJyksXG5cdFx0XHRcdGJ1c3k6IGxhYmVsLmdldEF0dHJpYnV0ZSgnYXJpYS1idXN5JyksXG5cdFx0XHRcdGxhYmVsOiBsYWJlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0ZHVyaW5nOiB7XG5cdFx0XHRcdGJ1dHRvbkNvZGljb246IHRydWUsXG5cdFx0XHRcdGJ1dHRvblNwaW5uaW5nOiBmYWxzZSxcblx0XHRcdFx0Zm9ya0ljb246IGZhbHNlLFxuXHRcdFx0XHRsb2FkaW5nSWNvbjogdHJ1ZSxcblx0XHRcdFx0aWNvblNwaW5uaW5nOiB0cnVlLFxuXHRcdFx0XHRidXN5OiAndHJ1ZScsXG5cdFx0XHRcdGxhYmVsOiAnRm9ya2luZyBjb252ZXJzYXRpb24nLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdG9wZXJhdGlvbi5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHJ1blByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJ1dHRvbkNvZGljb246IGxhYmVsLmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbicpLFxuXHRcdFx0YnV0dG9uU3Bpbm5pbmc6IGxhYmVsLmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1tb2RpZmllci1zcGluJyksXG5cdFx0XHRmb3JrSWNvbjogaWNvbi5jbGFzc0xpc3QuY29udGFpbnMoZm9ya0ljb25DbGFzcyksXG5cdFx0XHRsb2FkaW5nSWNvbjogaWNvbi5jbGFzc0xpc3QuY29udGFpbnMobG9hZGluZ0ljb25DbGFzcyksXG5cdFx0XHRpY29uU3Bpbm5pbmc6IGljb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLW1vZGlmaWVyLXNwaW4nKSxcblx0XHRcdGJ1c3k6IGxhYmVsLmdldEF0dHJpYnV0ZSgnYXJpYS1idXN5JyksXG5cdFx0XHRsYWJlbDogbGFiZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0fSwge1xuXHRcdFx0YnV0dG9uQ29kaWNvbjogdHJ1ZSxcblx0XHRcdGJ1dHRvblNwaW5uaW5nOiBmYWxzZSxcblx0XHRcdGZvcmtJY29uOiB0cnVlLFxuXHRcdFx0bG9hZGluZ0ljb246IGZhbHNlLFxuXHRcdFx0aWNvblNwaW5uaW5nOiBmYWxzZSxcblx0XHRcdGJ1c3k6ICdmYWxzZScsXG5cdFx0XHRsYWJlbDogJ0ZvcmsgY29udmVyc2F0aW9uIGZyb20gdGhpcyBwb2ludCcsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywwQkFBMEI7QUFDbkMs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
