import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { emptyProgressRunner } from "../../../../platform/progress/common/progress.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
class EditorProgressIndicator extends Disposable {
  constructor(progressBar, group) {
    super();
    this.progressBar = progressBar;
    this.group = group;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_ACTIVE || e.kind === GroupModelChangeKind.EDITOR_CLOSE && this.group.isEmpty) {
        this.progressBar.stop().hide();
      }
    }));
  }
  show(infiniteOrTotal, delay) {
    if (this.group.isEmpty) {
      return emptyProgressRunner;
    }
    if (infiniteOrTotal === true) {
      return this.doShow(true, delay);
    }
    return this.doShow(infiniteOrTotal, delay);
  }
  doShow(infiniteOrTotal, delay) {
    if (typeof infiniteOrTotal === "boolean") {
      this.progressBar.infinite().show(delay);
    } else {
      this.progressBar.total(infiniteOrTotal).show(delay);
    }
    return {
      total: (total) => {
        this.progressBar.total(total);
      },
      worked: (worked) => {
        if (this.progressBar.hasTotal()) {
          this.progressBar.worked(worked);
        } else {
          this.progressBar.infinite().show();
        }
      },
      done: () => {
        this.progressBar.stop().hide();
      }
    };
  }
  async showWhile(promise, delay) {
    if (this.group.isEmpty) {
      try {
        await promise;
      } catch (error) {
      }
    }
    return this.doShowWhile(promise, delay);
  }
  async doShowWhile(promise, delay) {
    try {
      this.progressBar.infinite().show(delay);
      await promise;
    } catch (error) {
    } finally {
      this.progressBar.stop().hide();
    }
  }
}
var ProgressIndicatorState;
((ProgressIndicatorState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["None"] = 0] = "None";
    Type2[Type2["Done"] = 1] = "Done";
    Type2[Type2["Infinite"] = 2] = "Infinite";
    Type2[Type2["While"] = 3] = "While";
    Type2[Type2["Work"] = 4] = "Work";
  })(Type = ProgressIndicatorState2.Type || (ProgressIndicatorState2.Type = {}));
  ProgressIndicatorState2.None = { type: 0 /* None */ };
  ProgressIndicatorState2.Done = { type: 1 /* Done */ };
  ProgressIndicatorState2.Infinite = { type: 2 /* Infinite */ };
  class While {
    constructor(whilePromise, whileStart, whileDelay) {
      this.whilePromise = whilePromise;
      this.whileStart = whileStart;
      this.whileDelay = whileDelay;
      this.type = 3 /* While */;
    }
  }
  ProgressIndicatorState2.While = While;
  class Work {
    constructor(total, worked) {
      this.total = total;
      this.worked = worked;
      this.type = 4 /* Work */;
    }
  }
  ProgressIndicatorState2.Work = Work;
})(ProgressIndicatorState || (ProgressIndicatorState = {}));
class ScopedProgressIndicator extends Disposable {
  constructor(progressBar, scope) {
    super();
    this.progressBar = progressBar;
    this.scope = scope;
    this.progressState = ProgressIndicatorState.None;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.scope.onDidChangeActive(() => {
      if (this.scope.isActive) {
        this.onDidScopeActivate();
      } else {
        this.onDidScopeDeactivate();
      }
    }));
  }
  onDidScopeActivate() {
    if (this.progressState.type === ProgressIndicatorState.Done.type) {
      return;
    }
    if (this.progressState.type === 3 /* While */) {
      let delay;
      if (this.progressState.whileDelay > 0) {
        const remainingDelay = this.progressState.whileDelay - (Date.now() - this.progressState.whileStart);
        if (remainingDelay > 0) {
          delay = remainingDelay;
        }
      }
      this.doShowWhile(delay);
    } else if (this.progressState.type === 2 /* Infinite */) {
      this.progressBar.infinite().show();
    } else if (this.progressState.type === 4 /* Work */) {
      if (this.progressState.total) {
        this.progressBar.total(this.progressState.total).show();
      }
      if (this.progressState.worked) {
        this.progressBar.worked(this.progressState.worked).show();
      }
    }
  }
  onDidScopeDeactivate() {
    this.progressBar.stop().hide();
  }
  show(infiniteOrTotal, delay) {
    if (typeof infiniteOrTotal === "boolean") {
      this.progressState = ProgressIndicatorState.Infinite;
    } else {
      this.progressState = new ProgressIndicatorState.Work(infiniteOrTotal, void 0);
    }
    if (this.scope.isActive) {
      if (this.progressState.type === 2 /* Infinite */) {
        this.progressBar.infinite().show(delay);
      } else if (this.progressState.type === 4 /* Work */ && typeof this.progressState.total === "number") {
        this.progressBar.total(this.progressState.total).show(delay);
      }
    }
    return {
      total: (total) => {
        this.progressState = new ProgressIndicatorState.Work(
          total,
          this.progressState.type === 4 /* Work */ ? this.progressState.worked : void 0
        );
        if (this.scope.isActive) {
          this.progressBar.total(total);
        }
      },
      worked: (worked) => {
        if (!this.scope.isActive || this.progressBar.hasTotal()) {
          this.progressState = new ProgressIndicatorState.Work(
            this.progressState.type === 4 /* Work */ ? this.progressState.total : void 0,
            this.progressState.type === 4 /* Work */ && typeof this.progressState.worked === "number" ? this.progressState.worked + worked : worked
          );
          if (this.scope.isActive) {
            this.progressBar.worked(worked);
          }
        } else {
          this.progressState = ProgressIndicatorState.Infinite;
          this.progressBar.infinite().show();
        }
      },
      done: () => {
        this.progressState = ProgressIndicatorState.Done;
        if (this.scope.isActive) {
          this.progressBar.stop().hide();
        }
      }
    };
  }
  async showWhile(promise, delay) {
    if (this.progressState.type === 3 /* While */) {
      promise = Promise.allSettled([promise, this.progressState.whilePromise]);
    }
    this.progressState = new ProgressIndicatorState.While(promise, delay || 0, Date.now());
    try {
      this.doShowWhile(delay);
      await promise;
    } catch (error) {
    } finally {
      if (this.progressState.type !== 3 /* While */ || this.progressState.whilePromise === promise) {
        this.progressState = ProgressIndicatorState.None;
        if (this.scope.isActive) {
          this.progressBar.stop().hide();
        }
      }
    }
  }
  doShowWhile(delay) {
    if (this.scope.isActive) {
      this.progressBar.infinite().show(delay);
    }
  }
}
class AbstractProgressScope extends Disposable {
  constructor(scopeId, _isActive) {
    super();
    this.scopeId = scopeId;
    this._isActive = _isActive;
    this._onDidChangeActive = this._register(new Emitter());
    this.onDidChangeActive = this._onDidChangeActive.event;
  }
  get isActive() {
    return this._isActive;
  }
  onScopeOpened(scopeId) {
    if (scopeId === this.scopeId) {
      if (!this._isActive) {
        this._isActive = true;
        this._onDidChangeActive.fire();
      }
    }
  }
  onScopeClosed(scopeId) {
    if (scopeId === this.scopeId) {
      if (this._isActive) {
        this._isActive = false;
        this._onDidChangeActive.fire();
      }
    }
  }
}
export {
  AbstractProgressScope,
  EditorProgressIndicator,
  ScopedProgressIndicator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcm9ncmVzcy9icm93c2VyL3Byb2dyZXNzSW5kaWNhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1J1bm5lciwgSVByb2dyZXNzSW5kaWNhdG9yLCBlbXB0eVByb2dyZXNzUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgR3JvdXBNb2RlbENoYW5nZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRvclByb2dyZXNzSW5kaWNhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcm9ncmVzc0luZGljYXRvciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc0JhcjogUHJvZ3Jlc3NCYXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBncm91cDogSUVkaXRvckdyb3VwVmlld1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpIHtcblxuXHRcdC8vIFN0b3AgYW55IHJ1bm5pbmcgcHJvZ3Jlc3Mgd2hlbiB0aGUgYWN0aXZlIGVkaXRvciBjaGFuZ2VzIG9yXG5cdFx0Ly8gdGhlIGdyb3VwIGJlY29tZXMgZW1wdHkuXG5cdFx0Ly8gSW4gY29udHJhc3QgdG8gdGhlIGNvbXBvc2l0ZSBwcm9ncmVzcyBpbmRpY2F0b3IsIHdlIGRvIG5vdFxuXHRcdC8vIHRyYWNrIGFjdGl2ZSBlZGl0b3IgcHJvZ3Jlc3MgYW5kIHJlcGxheSBpdCBsYXRlciAoeWV0KS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0FDVElWRSB8fFxuXHRcdFx0XHQoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0UgJiYgdGhpcy5ncm91cC5pc0VtcHR5KVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzaG93KGluZmluaXRlOiB0cnVlLCBkZWxheT86IG51bWJlcik6IElQcm9ncmVzc1J1bm5lcjtcblx0c2hvdyh0b3RhbDogbnVtYmVyLCBkZWxheT86IG51bWJlcik6IElQcm9ncmVzc1J1bm5lcjtcblx0c2hvdyhpbmZpbml0ZU9yVG90YWw6IHRydWUgfCBudW1iZXIsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyIHtcblxuXHRcdC8vIE5vIGVkaXRvciBvcGVuOiBpZ25vcmUgYW55IHByb2dyZXNzIHJlcG9ydGluZ1xuXHRcdGlmICh0aGlzLmdyb3VwLmlzRW1wdHkpIHtcblx0XHRcdHJldHVybiBlbXB0eVByb2dyZXNzUnVubmVyO1xuXHRcdH1cblxuXHRcdGlmIChpbmZpbml0ZU9yVG90YWwgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvU2hvdyh0cnVlLCBkZWxheSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9TaG93KGluZmluaXRlT3JUb3RhbCwgZGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Nob3coaW5maW5pdGU6IHRydWUsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyO1xuXHRwcml2YXRlIGRvU2hvdyh0b3RhbDogbnVtYmVyLCBkZWxheT86IG51bWJlcik6IElQcm9ncmVzc1J1bm5lcjtcblx0cHJpdmF0ZSBkb1Nob3coaW5maW5pdGVPclRvdGFsOiB0cnVlIHwgbnVtYmVyLCBkZWxheT86IG51bWJlcik6IElQcm9ncmVzc1J1bm5lciB7XG5cdFx0aWYgKHR5cGVvZiBpbmZpbml0ZU9yVG90YWwgPT09ICdib29sZWFuJykge1xuXHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coZGVsYXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLnRvdGFsKGluZmluaXRlT3JUb3RhbCkuc2hvdyhkZWxheSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvdGFsOiAodG90YWw6IG51bWJlcikgPT4ge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLnRvdGFsKHRvdGFsKTtcblx0XHRcdH0sXG5cblx0XHRcdHdvcmtlZDogKHdvcmtlZDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnByb2dyZXNzQmFyLmhhc1RvdGFsKCkpIHtcblx0XHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLndvcmtlZCh3b3JrZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdGRvbmU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBzaG93V2hpbGUocHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiwgZGVsYXk/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE5vIGVkaXRvciBvcGVuOiBpZ25vcmUgYW55IHByb2dyZXNzIHJlcG9ydGluZ1xuXHRcdGlmICh0aGlzLmdyb3VwLmlzRW1wdHkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb1Nob3dXaGlsZShwcm9taXNlLCBkZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2hvd1doaWxlKHByb21pc2U6IFByb21pc2U8dW5rbm93bj4sIGRlbGF5PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KGRlbGF5KTtcblxuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gaWdub3JlXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblx0XHR9XG5cdH1cbn1cblxubmFtZXNwYWNlIFByb2dyZXNzSW5kaWNhdG9yU3RhdGUge1xuXG5cdGV4cG9ydCBjb25zdCBlbnVtIFR5cGUge1xuXHRcdE5vbmUsXG5cdFx0RG9uZSxcblx0XHRJbmZpbml0ZSxcblx0XHRXaGlsZSxcblx0XHRXb3JrXG5cdH1cblxuXHRleHBvcnQgY29uc3QgTm9uZSA9IHsgdHlwZTogVHlwZS5Ob25lIH0gYXMgY29uc3Q7XG5cdGV4cG9ydCBjb25zdCBEb25lID0geyB0eXBlOiBUeXBlLkRvbmUgfSBhcyBjb25zdDtcblx0ZXhwb3J0IGNvbnN0IEluZmluaXRlID0geyB0eXBlOiBUeXBlLkluZmluaXRlIH0gYXMgY29uc3Q7XG5cblx0ZXhwb3J0IGNsYXNzIFdoaWxlIHtcblxuXHRcdHJlYWRvbmx5IHR5cGUgPSBUeXBlLldoaWxlO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRyZWFkb25seSB3aGlsZVByb21pc2U6IFByb21pc2U8dW5rbm93bj4sXG5cdFx0XHRyZWFkb25seSB3aGlsZVN0YXJ0OiBudW1iZXIsXG5cdFx0XHRyZWFkb25seSB3aGlsZURlbGF5OiBudW1iZXIsXG5cdFx0KSB7IH1cblx0fVxuXG5cdGV4cG9ydCBjbGFzcyBXb3JrIHtcblxuXHRcdHJlYWRvbmx5IHR5cGUgPSBUeXBlLldvcms7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHJlYWRvbmx5IHRvdGFsOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0XHRyZWFkb25seSB3b3JrZWQ6IG51bWJlciB8IHVuZGVmaW5lZFxuXHRcdCkgeyB9XG5cdH1cblxuXHRleHBvcnQgdHlwZSBTdGF0ZSA9XG5cdFx0dHlwZW9mIE5vbmVcblx0XHR8IHR5cGVvZiBEb25lXG5cdFx0fCB0eXBlb2YgSW5maW5pdGVcblx0XHR8IFdoaWxlXG5cdFx0fCBXb3JrO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ncmVzc1Njb3BlIHtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbmV2ZXIgYGlzQWN0aXZlYCB2YWx1ZSBjaGFuZ2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmU6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHByb2dyZXNzIHNob3VsZCBiZSBhY3RpdmUgb3Igbm90LlxuXHQgKi9cblx0cmVhZG9ubHkgaXNBY3RpdmU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBTY29wZWRQcm9ncmVzc0luZGljYXRvciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvZ3Jlc3NJbmRpY2F0b3Ige1xuXG5cdHByaXZhdGUgcHJvZ3Jlc3NTdGF0ZTogUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5TdGF0ZSA9IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuTm9uZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzQmFyOiBQcm9ncmVzc0Jhcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiBJUHJvZ3Jlc3NTY29wZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cmVnaXN0ZXJMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zY29wZS5vbkRpZENoYW5nZUFjdGl2ZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5zY29wZS5pc0FjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLm9uRGlkU2NvcGVBY3RpdmF0ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vbkRpZFNjb3BlRGVhY3RpdmF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRTY29wZUFjdGl2YXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHByb2dyZXNzIHN0YXRlIGluZGljYXRlcyB0aGF0IHByb2dyZXNzIGlzIGRvbmVcblx0XHRpZiAodGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgPT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuRG9uZS50eXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGF5IEluZmluaXRlIFByb2dyZXNzIGZyb20gUHJvbWlzZVxuXHRcdGlmICh0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldoaWxlKSB7XG5cdFx0XHRsZXQgZGVsYXk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLnByb2dyZXNzU3RhdGUud2hpbGVEZWxheSA+IDApIHtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nRGVsYXkgPSB0aGlzLnByb2dyZXNzU3RhdGUud2hpbGVEZWxheSAtIChEYXRlLm5vdygpIC0gdGhpcy5wcm9ncmVzc1N0YXRlLndoaWxlU3RhcnQpO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nRGVsYXkgPiAwKSB7XG5cdFx0XHRcdFx0ZGVsYXkgPSByZW1haW5pbmdEZWxheTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRvU2hvd1doaWxlKGRlbGF5KTtcblx0XHR9XG5cblx0XHQvLyBSZXBsYXkgSW5maW5pdGUgUHJvZ3Jlc3Ncblx0XHRlbHNlIGlmICh0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLkluZmluaXRlKSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdygpO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxheSBGaW5pdGUgUHJvZ3Jlc3MgKFRvdGFsICYgV29ya2VkKVxuXHRcdGVsc2UgaWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS50eXBlID09PSBQcm9ncmVzc0luZGljYXRvclN0YXRlLlR5cGUuV29yaykge1xuXHRcdFx0aWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS50b3RhbCkge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLnRvdGFsKHRoaXMucHJvZ3Jlc3NTdGF0ZS50b3RhbCkuc2hvdygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5wcm9ncmVzc1N0YXRlLndvcmtlZCkge1xuXHRcdFx0XHR0aGlzLnByb2dyZXNzQmFyLndvcmtlZCh0aGlzLnByb2dyZXNzU3RhdGUud29ya2VkKS5zaG93KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNjb3BlRGVhY3RpdmF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnByb2dyZXNzQmFyLnN0b3AoKS5oaWRlKCk7XG5cdH1cblxuXHRzaG93KGluZmluaXRlOiB0cnVlLCBkZWxheT86IG51bWJlcik6IElQcm9ncmVzc1J1bm5lcjtcblx0c2hvdyh0b3RhbDogbnVtYmVyLCBkZWxheT86IG51bWJlcik6IElQcm9ncmVzc1J1bm5lcjtcblx0c2hvdyhpbmZpbml0ZU9yVG90YWw6IHRydWUgfCBudW1iZXIsIGRlbGF5PzogbnVtYmVyKTogSVByb2dyZXNzUnVubmVyIHtcblxuXHRcdC8vIFNvcnQgb3V0IEFyZ3VtZW50c1xuXHRcdGlmICh0eXBlb2YgaW5maW5pdGVPclRvdGFsID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NTdGF0ZSA9IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuSW5maW5pdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NTdGF0ZSA9IG5ldyBQcm9ncmVzc0luZGljYXRvclN0YXRlLldvcmsoaW5maW5pdGVPclRvdGFsLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIEFjdGl2ZTogU2hvdyBQcm9ncmVzc1xuXHRcdGlmICh0aGlzLnNjb3BlLmlzQWN0aXZlKSB7XG5cblx0XHRcdC8vIEluZmluaXRlOiBTdGFydCBQcm9ncmVzc2JhciBhbmQgU2hvdyBhZnRlciBEZWxheVxuXHRcdFx0aWYgKHRoaXMucHJvZ3Jlc3NTdGF0ZS50eXBlID09PSBQcm9ncmVzc0luZGljYXRvclN0YXRlLlR5cGUuSW5maW5pdGUpIHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coZGVsYXkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaW5pdGU6IFN0YXJ0IFByb2dyZXNzYmFyIGFuZCBTaG93IGFmdGVyIERlbGF5XG5cdFx0XHRlbHNlIGlmICh0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldvcmsgJiYgdHlwZW9mIHRoaXMucHJvZ3Jlc3NTdGF0ZS50b3RhbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci50b3RhbCh0aGlzLnByb2dyZXNzU3RhdGUudG90YWwpLnNob3coZGVsYXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0b3RhbDogKHRvdGFsOiBudW1iZXIpID0+IHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlID0gbmV3IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuV29yayhcblx0XHRcdFx0XHR0b3RhbCxcblx0XHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUudHlwZSA9PT0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5UeXBlLldvcmsgPyB0aGlzLnByb2dyZXNzU3RhdGUud29ya2VkIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRpZiAodGhpcy5zY29wZS5pc0FjdGl2ZSkge1xuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIudG90YWwodG90YWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHR3b3JrZWQ6ICh3b3JrZWQ6IG51bWJlcikgPT4ge1xuXG5cdFx0XHRcdC8vIFZlcmlmeSBmaXJzdCB0aGF0IHdlIGFyZSBlaXRoZXIgbm90IGFjdGl2ZSBvciB0aGUgcHJvZ3Jlc3NiYXIgaGFzIGEgdG90YWwgc2V0XG5cdFx0XHRcdGlmICghdGhpcy5zY29wZS5pc0FjdGl2ZSB8fCB0aGlzLnByb2dyZXNzQmFyLmhhc1RvdGFsKCkpIHtcblx0XHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUgPSBuZXcgUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5Xb3JrKFxuXHRcdFx0XHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgPT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuVHlwZS5Xb3JrID8gdGhpcy5wcm9ncmVzc1N0YXRlLnRvdGFsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgPT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuVHlwZS5Xb3JrICYmIHR5cGVvZiB0aGlzLnByb2dyZXNzU3RhdGUud29ya2VkID09PSAnbnVtYmVyJyA/IHRoaXMucHJvZ3Jlc3NTdGF0ZS53b3JrZWQgKyB3b3JrZWQgOiB3b3JrZWQpO1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMuc2NvcGUuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIud29ya2VkKHdvcmtlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3RoZXJ3aXNlIHRoZSBwcm9ncmVzcyBiYXIgZG9lcyBub3Qgc3VwcG9ydCB3b3JrZWQoKSwgd2UgZmFsbGJhY2sgdG8gaW5maW5pdGUoKSBwcm9ncmVzc1xuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnByb2dyZXNzU3RhdGUgPSBQcm9ncmVzc0luZGljYXRvclN0YXRlLkluZmluaXRlO1xuXHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdGRvbmU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlID0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5Eb25lO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNjb3BlLmlzQWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHNob3dXaGlsZShwcm9taXNlOiBQcm9taXNlPHVua25vd24+LCBkZWxheT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSm9pbiB3aXRoIGV4aXN0aW5nIHJ1bm5pbmcgcHJvbWlzZSB0byBlbnN1cmUgcHJvZ3Jlc3MgaXMgYWNjdXJhdGVcblx0XHRpZiAodGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgPT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuVHlwZS5XaGlsZSkge1xuXHRcdFx0cHJvbWlzZSA9IFByb21pc2UuYWxsU2V0dGxlZChbcHJvbWlzZSwgdGhpcy5wcm9ncmVzc1N0YXRlLndoaWxlUHJvbWlzZV0pO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgUHJvbWlzZSBpbiBTdGF0ZVxuXHRcdHRoaXMucHJvZ3Jlc3NTdGF0ZSA9IG5ldyBQcm9ncmVzc0luZGljYXRvclN0YXRlLldoaWxlKHByb21pc2UsIGRlbGF5IHx8IDAsIERhdGUubm93KCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZG9TaG93V2hpbGUoZGVsYXkpO1xuXG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9IGZpbmFsbHkge1xuXG5cdFx0XHQvLyBJZiB0aGlzIGlzIG5vdCB0aGUgbGFzdCBwcm9taXNlIGluIHRoZSBsaXN0IG9mIGpvaW5lZCBwcm9taXNlcywgc2tpcCB0aGlzXG5cdFx0XHRpZiAodGhpcy5wcm9ncmVzc1N0YXRlLnR5cGUgIT09IFByb2dyZXNzSW5kaWNhdG9yU3RhdGUuVHlwZS5XaGlsZSB8fCB0aGlzLnByb2dyZXNzU3RhdGUud2hpbGVQcm9taXNlID09PSBwcm9taXNlKSB7XG5cblx0XHRcdFx0Ly8gVGhlIHdoaWxlIHByb21pc2UgaXMgZWl0aGVyIG51bGwgb3IgZXF1YWwgdGhlIHByb21pc2Ugd2UgbGFzdCBob29rZWQgb25cblx0XHRcdFx0dGhpcy5wcm9ncmVzc1N0YXRlID0gUHJvZ3Jlc3NJbmRpY2F0b3JTdGF0ZS5Ob25lO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNjb3BlLmlzQWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1Nob3dXaGlsZShkZWxheT86IG51bWJlcik6IHZvaWQge1xuXG5cdFx0Ly8gU2hvdyBQcm9ncmVzcyB3aGVuIGFjdGl2ZVxuXHRcdGlmICh0aGlzLnNjb3BlLmlzQWN0aXZlKSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdyhkZWxheSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFByb2dyZXNzU2NvcGUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb2dyZXNzU2NvcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmUuZXZlbnQ7XG5cblx0Z2V0IGlzQWN0aXZlKCkgeyByZXR1cm4gdGhpcy5faXNBY3RpdmU7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNjb3BlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIF9pc0FjdGl2ZTogYm9vbGVhblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uU2NvcGVPcGVuZWQoc2NvcGVJZDogc3RyaW5nKSB7XG5cdFx0aWYgKHNjb3BlSWQgPT09IHRoaXMuc2NvcGVJZCkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9pc0FjdGl2ZSA9IHRydWU7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvblNjb3BlQ2xvc2VkKHNjb3BlSWQ6IHN0cmluZykge1xuXHRcdGlmIChzY29wZUlkID09PSB0aGlzLnNjb3BlSWQpIHtcblx0XHRcdGlmICh0aGlzLl9pc0FjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9pc0FjdGl2ZSA9IGZhbHNlO1xuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFFM0IsU0FBOEMsMkJBQTJCO0FBRXpFLFNBQVMsNEJBQTRCO0FBRTlCLE1BQU0sZ0NBQWdDLFdBQXlDO0FBQUEsRUFFckYsWUFDa0IsYUFDQSxPQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBSWpCLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQUVRLG9CQUFvQjtBQU0zQixTQUFLLFVBQVUsS0FBSyxNQUFNLGlCQUFpQixPQUFLO0FBQy9DLFVBQ0MsRUFBRSxTQUFTLHFCQUFxQixpQkFDL0IsRUFBRSxTQUFTLHFCQUFxQixnQkFBZ0IsS0FBSyxNQUFNLFNBQzNEO0FBQ0QsYUFBSyxZQUFZLEtBQUssRUFBRSxLQUFLO0FBQUEsTUFDOUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUlBLEtBQUssaUJBQWdDLE9BQWlDO0FBR3JFLFFBQUksS0FBSyxNQUFNLFNBQVM7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLG9CQUFvQixNQUFNO0FBQzdCLGFBQU8sS0FBSyxPQUFPLE1BQU0sS0FBSztBQUFBLElBQy9CO0FBRUEsV0FBTyxLQUFLLE9BQU8saUJBQWlCLEtBQUs7QUFBQSxFQUMxQztBQUFBLEVBSVEs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
