import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatQuestionCarouselPart } from "../../../../browser/widget/chatContentParts/chatQuestionCarouselPart.js";
import { ChatQuestionCarouselData } from "../../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../../platform/agentHost/common/agentHostSchema.js";
function createMockCarousel(questions, allowSkip = true) {
  return {
    kind: "questionCarousel",
    questions,
    allowSkip
  };
}
function createMockContext() {
  const context = { content: [], contentIndex: 0 };
  return context;
}
suite("ChatQuestionCarouselPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let widget;
  let submittedAnswers = null;
  function createWidget(carousel, onSubmit) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const options = {
      onSubmit: (answers) => {
        submittedAnswers = answers;
        onSubmit?.();
      }
    };
    widget = store.add(instantiationService.createInstance(ChatQuestionCarouselPart, carousel, createMockContext(), options));
    mainWindow.document.body.appendChild(widget.domNode);
    return widget;
  }
  teardown(() => {
    if (widget?.domNode?.parentNode) {
      widget.domNode.parentNode.removeChild(widget.domNode);
    }
    submittedAnswers = null;
  });
  suite("Basic Rendering", () => {
    test("renders carousel container with proper structure", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-container"));
      assert.ok(widget.domNode.querySelector(".chat-question-header-row"));
      assert.ok(widget.domNode.querySelector(".chat-question-carousel-content"));
    });
    test("renders question title", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "What is your name?", message: "What is your name?" }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title);
      assert.ok(title?.textContent?.includes("What is your name?"));
    });
    test("renders question title when message is not provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Fallback title text" }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title, "title element should exist when only title is provided");
      assert.ok(title?.textContent?.includes("Fallback title text"));
    });
    test("renders markdown in question message", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Question",
          message: new MarkdownString("Please review **details** in [docs](https://example.com)")
        }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title, "title element should exist");
      assert.ok(title?.querySelector(".rendered-markdown"), "markdown content should be rendered");
    });
    test("renders plain string question message as text", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Question",
          message: "Please review **details** in [docs](https://example.com)"
        }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title, "title element should exist");
      assert.ok(title?.textContent?.includes("details"), "content should be rendered");
    });
    test("renders progress indicator correctly", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", message: "Question 1" },
        { id: "q2", type: "text", title: "Question 2", message: "Question 2" },
        { id: "q3", type: "text", title: "Question 3", message: "Question 3" }
      ]);
      createWidget(carousel);
      const stepIndicator = widget.domNode.querySelector(".chat-question-step-indicator");
      assert.ok(stepIndicator);
      assert.ok(stepIndicator?.textContent?.includes("1"));
      assert.ok(stepIndicator?.textContent?.includes("3"));
    });
    test("renders close button in title row for multi-question carousels", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      createWidget(carousel);
      const titleRow = widget.domNode.querySelector(".chat-question-title-row");
      assert.ok(titleRow, "title row should exist");
      const closeContainer = titleRow?.querySelector(".chat-question-close-container");
      assert.ok(closeContainer, "close button container should be rendered in the title row");
      const directChildCloseContainer = widget.domNode.querySelector(":scope > .chat-question-close-container");
      assert.strictEqual(directChildCloseContainer, null, "close button container should not be positioned as a direct child of the carousel container");
    });
    test("renders collapse button in title row even when skip is disabled", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], false);
      createWidget(carousel);
      const titleRow = widget.domNode.querySelector(".chat-question-title-row");
      assert.ok(titleRow, "title row should exist");
      const collapseButton = titleRow?.querySelector(".chat-question-collapse-toggle");
      assert.ok(collapseButton, "collapse button should be rendered even when skip is disabled");
    });
    test("renders collapse button to the right of close button", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      createWidget(carousel);
      const actionsContainer = widget.domNode.querySelector(".chat-question-header-actions");
      assert.ok(actionsContainer, "actions container should exist");
      if (!actionsContainer) {
        return;
      }
      const actionButtons = Array.from(actionsContainer.querySelectorAll(".monaco-button"));
      const closeIndex = actionButtons.findIndex((button) => button.classList.contains("chat-question-close"));
      const collapseIndex = actionButtons.findIndex((button) => button.classList.contains("chat-question-collapse-toggle"));
      assert.ok(closeIndex >= 0, "close button should exist");
      assert.ok(collapseIndex >= 0, "collapse button should exist");
      assert.ok(collapseIndex > closeIndex, "collapse button should be positioned to the right of close button");
    });
    test("toggles collapsed state and updates aria-expanded", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      createWidget(carousel);
      const collapseButton = widget.domNode.querySelector(".chat-question-collapse-toggle");
      assert.ok(collapseButton, "collapse button should exist");
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
      collapseButton.click();
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-collapsed"), "widget should enter collapsed state");
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "false");
      const collapsedSummary = widget.domNode.querySelector(".chat-question-collapsed-summary");
      assert.strictEqual(collapsedSummary, null, "collapsed mode should not render an additional summary section");
      const titleRow = widget.domNode.querySelector(".chat-question-title-row");
      assert.ok(titleRow, "header should remain visible when collapsed");
      const inputScrollable = widget.domNode.querySelector(".chat-question-input-scrollable");
      assert.ok(inputScrollable, "input section exists in DOM but is hidden while collapsed");
      collapseButton.click();
      assert.ok(!widget.domNode.classList.contains("chat-question-carousel-collapsed"), "widget should exit collapsed state");
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
    });
    test("restores draft collapsed state from carousel data", () => {
      const carousel = new ChatQuestionCarouselData([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      carousel.draftCollapsed = true;
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-collapsed"), "widget should restore collapsed draft state");
      const collapseButton = widget.domNode.querySelector(".chat-question-collapse-toggle");
      assert.strictEqual(collapseButton?.getAttribute("aria-expanded"), "false");
    });
  });
  suite("Question Types", () => {
    test("renders text input for text type questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Enter your name" }
      ]);
      createWidget(carousel);
      const inputContainer = widget.domNode.querySelector(".chat-question-input-container");
      assert.ok(inputContainer);
      const inputBox = inputContainer?.querySelector(".monaco-inputbox input");
      assert.ok(inputBox, "Should have an input box for text questions");
    });
    test("renders list items for singleSelect type questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 2, "Should have 2 list items");
    });
    test("renders list items with checkboxes for multiSelect type questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" },
            { id: "c", label: "Option C", value: "c" }
          ]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item.multi-select");
      assert.strictEqual(listItems.length, 3, "Should have 3 list items for multiSelect");
      const checkboxes = widget.domNode.querySelectorAll(".chat-question-list-checkbox");
      assert.strictEqual(checkboxes.length, 3, "Should have 3 checkboxes");
    });
    test("freeform textarea is rendered for singleSelect by default", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.ok(freeformTextarea, "Freeform textarea should be rendered by default for singleSelect");
    });
    test("freeform textarea is rendered for multiSelect by default", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "a" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.ok(freeformTextarea, "Freeform textarea should be rendered by default for multiSelect");
    });
    test("freeform textarea is hidden when allowFreeformInput is false for singleSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          allowFreeformInput: false,
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.strictEqual(freeformTextarea, null, "Freeform textarea should not be rendered when allowFreeformInput is false");
    });
    test("freeform textarea is hidden when allowFreeformInput is false for multiSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          allowFreeformInput: false,
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.strictEqual(freeformTextarea, null, "Freeform textarea should not be rendered when allowFreeformInput is false");
    });
    test("default options are pre-selected for singleSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ],
          defaultValue: "b"
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems[0].classList.contains("selected"), true, "Default option should be re-sorted to first and selected");
      assert.strictEqual(listItems[1].classList.contains("selected"), false);
    });
    test("default options are pre-selected for multiSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" },
            { id: "c", label: "Option C", value: "c" }
          ],
          defaultValue: ["a", "c"]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems[0].classList.contains("checked"), true, "First default option should be checked");
      assert.strictEqual(listItems[1].classList.contains("checked"), true, "Second default option should be checked (re-sorted from third)");
      assert.strictEqual(listItems[2].classList.contains("checked"), false, "Non-default option should not be checked");
    });
    test("singleSelect keeps value mapping after default-first reordering", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" }
          ],
          defaultValue: "b"
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 2, "Expected two options");
      listItems[1].click();
      const answer = submittedAnswers?.get("q1");
      assert.strictEqual(answer.selectedValue, "value_a");
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("multiSelect keeps value mapping after default-first reordering", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" },
            { id: "c", label: "Option C", value: "value_c" }
          ],
          defaultValue: "c"
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 3, "Expected three options");
      listItems[1].click();
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      assert.ok(submitButton, "Submit button should exist");
      submitButton.click();
      const answer = submittedAnswers?.get("q1");
      assert.ok(Array.isArray(answer.selectedValues));
      assert.ok(answer.selectedValues.includes("value_a"));
      assert.ok(answer.selectedValues.includes("value_c"));
      assert.strictEqual(answer.selectedValues.length, 2);
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("does not render a summary after onSubmit disposes the part", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question", defaultValue: "answer" }
      ]);
      createWidget(carousel, () => widget.dispose());
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      submitButton.click();
      assert.strictEqual(widget.domNode.querySelector(".chat-question-carousel-summary"), null);
    });
  });
  suite("Navigation", () => {
    test("previous button is disabled on first question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ]);
      createWidget(carousel);
      const navArrows = widget.domNode.querySelectorAll(".chat-question-nav-arrow");
      const prevButton = navArrows[0];
      assert.ok(prevButton, "Previous button should exist");
      assert.ok(prevButton.classList.contains("disabled") || prevButton.disabled, "Previous button should be disabled on first question");
    });
    test("next button stays as arrow and is disabled on last question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Only Question" },
        { id: "q2", type: "text", title: "Question 2" }
      ]);
      createWidget(carousel);
      widget.navigateToNextQuestion();
      const navArrows = widget.domNode.querySelectorAll(".chat-question-nav-arrow");
      const nextButton = navArrows[1];
      assert.ok(nextButton, "Next button should exist");
      assert.ok(nextButton.classList.contains("disabled") || nextButton.disabled, "Next button should be disabled on last question");
    });
    test("submit button is shown on last question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ]);
      createWidget(carousel);
      widget.navigateToNextQuestion();
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      assert.ok(submitButton, "Submit button should exist");
      assert.notStrictEqual(submitButton.style.display, "none", "Submit button should be visible on last question");
    });
  });
  suite("Skip Functionality", () => {
    test("skip succeeds when allowSkip is true and returns defaults", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default answer" }
      ], true);
      createWidget(carousel);
      const result = widget.skip();
      assert.strictEqual(result, true, "skip() should return true when allowSkip is true");
      assert.ok(submittedAnswers instanceof Map, "Skip should call onSubmit with a Map");
      assert.strictEqual(submittedAnswers?.get("q1"), "default answer", "Skip should return default values");
    });
    test("skip fails when allowSkip is false", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], false);
      createWidget(carousel);
      const result = widget.skip();
      assert.strictEqual(result, false, "skip() should return false when allowSkip is false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not have been called");
    });
    test("skip can only be called once", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.skip();
      submittedAnswers = null;
      const result = widget.skip();
      assert.strictEqual(result, false, "Second skip() should return false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not be called again");
    });
    test("skip no-ops when the carousel was already resolved externally", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default answer" }
      ], true);
      createWidget(carousel);
      carousel.isUsed = true;
      const result = widget.skip();
      assert.strictEqual(result, false, "skip() must not re-submit a carousel resolved elsewhere");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not overwrite the external answers");
    });
  });
  suite("Ignore Functionality", () => {
    test("ignore succeeds when allowSkip is true and returns undefined", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      const result = widget.ignore();
      assert.strictEqual(result, true, "ignore() should return true when allowSkip is true");
      assert.strictEqual(submittedAnswers, void 0, "Ignore should call onSubmit with undefined");
    });
    test("ignore fails when allowSkip is false", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], false);
      createWidget(carousel);
      const result = widget.ignore();
      assert.strictEqual(result, false, "ignore() should return false when allowSkip is false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not have been called");
    });
    test("ignore can only be called once", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.ignore();
      submittedAnswers = null;
      const result = widget.ignore();
      assert.strictEqual(result, false, "Second ignore() should return false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not be called again");
    });
    test("ignore no-ops when the carousel was already resolved externally", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      carousel.isUsed = true;
      const result = widget.ignore();
      assert.strictEqual(result, false, "ignore() must not re-submit a carousel resolved elsewhere");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not overwrite the external answers");
    });
    test("skip and ignore are mutually exclusive", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.skip();
      submittedAnswers = null;
      const result = widget.ignore();
      assert.strictEqual(result, false, "ignore() should return false after skip()");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not be called again");
    });
  });
  suite("Accessibility", () => {
    test("navigation area has proper role and aria-label", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      const nav = widget.domNode.querySelector(".chat-question-carousel-nav");
      assert.strictEqual(nav?.getAttribute("role"), "navigation");
      assert.ok(nav?.getAttribute("aria-label"), "Navigation should have aria-label");
    });
    test("single select list has proper role and aria-label", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const list = widget.domNode.querySelector(".chat-question-list");
      assert.strictEqual(list?.getAttribute("role"), "listbox");
      assert.strictEqual(list?.getAttribute("aria-label"), "Choose one");
    });
    test("list items have proper role and aria-selected", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 2, "Should have 2 list items");
      const firstItem = listItems[0];
      assert.strictEqual(firstItem.getAttribute("role"), "option");
      assert.ok(firstItem.id, "List item should have an id");
      assert.strictEqual(firstItem.getAttribute("aria-selected"), "true", "First item should be auto-selected");
      const secondItem = listItems[1];
      assert.strictEqual(secondItem.getAttribute("role"), "option");
      assert.strictEqual(secondItem.getAttribute("aria-selected"), "false", "Unselected item should have aria-selected=false");
    });
  });
  suite("hasSameContent", () => {
    test("returns true for same carousel instance", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      assert.strictEqual(widget.hasSameContent(carousel, [], {}), true);
    });
    test("returns false for different content type", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      const differentContent = { kind: "markdown" };
      assert.strictEqual(widget.hasSameContent(differentContent, [], {}), false);
    });
  });
  suite("Auto-Approve (Yolo Mode)", () => {
    test("skip returns default values for text questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default text" }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      assert.strictEqual(submittedAnswers?.get("q1"), "default text");
    });
    test("skip returns default values for singleSelect questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" }
          ],
          defaultValue: "b"
        }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      const answer = submittedAnswers?.get("q1");
      assert.strictEqual(answer.selectedValue, "value_b");
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("skip returns default values for multiSelect questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" },
            { id: "c", label: "Option C", value: "value_c" }
          ],
          defaultValue: ["a", "c"]
        }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      const answer = submittedAnswers?.get("q1");
      assert.ok(Array.isArray(answer.selectedValues));
      assert.strictEqual(answer.selectedValues.length, 2);
      assert.ok(answer.selectedValues.includes("value_a"));
      assert.ok(answer.selectedValues.includes("value_c"));
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("skip returns defaults for multiple questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Text Question", defaultValue: "text default" },
        {
          id: "q2",
          type: "singleSelect",
          title: "Single Select",
          options: [
            { id: "opt1", label: "First", value: "first_value" }
          ],
          defaultValue: "opt1"
        }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      assert.strictEqual(submittedAnswers?.get("q1"), "text default");
      const answer = submittedAnswers?.get("q2");
      assert.strictEqual(answer.selectedValue, "first_value");
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("skip returns empty map when no defaults are provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question without default" }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      assert.strictEqual(submittedAnswers?.size, 0, "Should return empty map when no defaults");
    });
  });
  suite("Used Carousel Summary", () => {
    test("retains current question after navigation without editing", () => {
      const carousel = new ChatQuestionCarouselData([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      const firstWidget = createWidget(carousel);
      const nextButton = firstWidget.domNode.querySelector(".chat-question-nav-next");
      assert.ok(nextButton, "next button should exist");
      nextButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      firstWidget.dispose();
      firstWidget.domNode.remove();
      const recreatedWidget = createWidget(carousel);
      const stepIndicator = recreatedWidget.domNode.querySelector(".chat-question-step-indicator");
      assert.strictEqual(stepIndicator?.textContent, "2/2", "should restore the current question index after navigation");
      const title = recreatedWidget.domNode.querySelector(".chat-question-title");
      assert.ok(title?.textContent?.includes("Question 2"), "should restore to the second question view");
    });
    test("retains draft answers and current question after widget recreation", () => {
      const carousel = new ChatQuestionCarouselData([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      const firstWidget = createWidget(carousel);
      const firstInput = firstWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(firstInput, "first question input should exist");
      firstInput.value = "first draft answer";
      firstInput.dispatchEvent(new Event("input", { bubbles: true }));
      const nextButton = firstWidget.domNode.querySelector(".chat-question-nav-next");
      assert.ok(nextButton, "next button should exist");
      nextButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const secondInput = firstWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(secondInput, "second question input should exist");
      secondInput.value = "second draft answer";
      secondInput.dispatchEvent(new Event("input", { bubbles: true }));
      firstWidget.dispose();
      firstWidget.domNode.remove();
      const recreatedWidget = createWidget(carousel);
      const stepIndicator = recreatedWidget.domNode.querySelector(".chat-question-step-indicator");
      assert.strictEqual(stepIndicator?.textContent, "2/2", "should restore the current question index");
      const recreatedSecondInput = recreatedWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(recreatedSecondInput, "recreated second question input should exist");
      assert.strictEqual(recreatedSecondInput.value, "second draft answer", "should restore draft input for current question");
      const prevButton = recreatedWidget.domNode.querySelector(".chat-question-nav-prev");
      assert.ok(prevButton, "previous button should exist");
      prevButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const recreatedFirstInput = recreatedWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(recreatedFirstInput, "recreated first question input should exist");
      assert.strictEqual(recreatedFirstInput.value, "first draft answer", "should restore draft input for previous question");
    });
    test("shows summary with answers after skip()", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default answer" }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container after skip");
      const summaryItem = summary?.querySelector(".chat-question-summary-item");
      assert.ok(summaryItem, "Should have summary item for the question");
      const summaryValue = summaryItem?.querySelector(".chat-question-summary-answer-title");
      assert.ok(summaryValue?.textContent?.includes("default answer"), "Summary should show the default answer");
    });
    test("shows skipped message after ignore()", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.ignore();
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container after ignore");
      const skippedMessage = summary?.querySelector(".chat-question-summary-skipped");
      assert.ok(skippedMessage, "Should show skipped message when ignored");
    });
    test("renders summary when constructed with isUsed and data", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "Question 1" }
        ],
        allowSkip: true,
        isUsed: true,
        data: { q1: "saved answer" }
      };
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container when isUsed is true");
      const summaryValue = summary?.querySelector(".chat-question-summary-answer-title");
      assert.ok(summaryValue?.textContent?.includes("saved answer"), "Summary should show saved answer from data");
    });
    test("renders conversational summary with expandable selected options", () => {
      const carousel = new ChatQuestionCarouselData([{
        id: "q1",
        type: "singleSelect",
        title: "What should we prioritize if the refactor affects multiple platforms and may require migration work?",
        options: [
          { id: "fix", label: "Fix a bug", value: "fix" },
          { id: "feature", label: "Implement a feature", value: "feature" }
        ]
      }], true, void 0, { q1: { selectedValue: "fix" } }, true);
      carousel.answerPresentation = "conversation";
      createWidget(carousel.toJSON());
      const question = widget.domNode.querySelector(".chat-question-summary-question");
      const answerButton = widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button");
      assert.ok(question && answerButton);
      assert.strictEqual(widget.domNode.querySelector(".chat-question-summary-option-list"), null);
      answerButton.click();
      assert.deepStrictEqual({
        question: question.textContent,
        questionExpandable: question.hasAttribute("aria-expanded"),
        answer: answerButton.textContent,
        answerExpanded: answerButton.getAttribute("aria-expanded"),
        answerIcon: answerButton.querySelector(".chat-question-summary-answer-icon")?.classList.contains("codicon-comment"),
        hasChevron: !!answerButton.querySelector(".chat-collapsible-hover-chevron"),
        optionsTitle: widget.domNode.querySelector(".chat-question-summary-options-title")?.textContent,
        options: Array.from(widget.domNode.querySelectorAll(".chat-question-summary-option")).map((option) => ({
          label: option.querySelector(".chat-question-summary-option-label")?.textContent,
          selected: option.classList.contains("selected"),
          hasCompactCheck: !!option.querySelector(".chat-question-summary-option-selected .codicon-check-compact")
        }))
      }, {
        question: "Question: What should we prioritize if the refactor affects multiple platforms and may require migration work?",
        answer: "Answered: Fix a bug",
        questionExpandable: false,
        answerExpanded: "true",
        answerIcon: true,
        hasChevron: true,
        optionsTitle: "Options",
        options: [
          { label: "Fix a bug", selected: true, hasCompactCheck: true },
          { label: "Implement a feature", selected: false, hasCompactCheck: false }
        ]
      });
    });
    test("uses a non-interactive collapsible header for free responses", () => {
      const carousel = new ChatQuestionCarouselData([{
        id: "q1",
        type: "text",
        title: "What would you like me to help you with?"
      }], true, void 0, { q1: "Review the changes" }, true);
      carousel.answerPresentation = "conversation";
      createWidget(carousel.toJSON());
      const answerButton = widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button");
      assert.deepStrictEqual({
        answer: answerButton?.textContent,
        disabled: answerButton?.getAttribute("aria-disabled"),
        tabIndex: answerButton?.tabIndex,
        expanded: answerButton?.getAttribute("aria-expanded"),
        hasChevron: !!answerButton?.querySelector(".chat-collapsible-hover-chevron")
      }, {
        answer: "Answered: Review the changes",
        disabled: "true",
        tabIndex: -1,
        expanded: null,
        hasChevron: false
      });
    });
    test("shows skipped message when constructed with isUsed but no data", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "Question 1" }
        ],
        allowSkip: true,
        isUsed: true
      };
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container");
      const skippedMessage = summary?.querySelector(".chat-question-summary-skipped");
      assert.ok(skippedMessage, "Should show skipped message when no data");
    });
    test("renders a skipped conversational question with its options", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [{
          id: "q1",
          type: "singleSelect",
          title: "Which environment?",
          options: [
            { id: "staging", label: "Staging", value: "staging" },
            { id: "production", label: "Production", value: "production" }
          ]
        }],
        allowSkip: true,
        isUsed: true,
        answerPresentation: "conversation"
      };
      createWidget(carousel);
      const answerButton = widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button");
      assert.ok(answerButton);
      answerButton.click();
      assert.deepStrictEqual({
        question: widget.domNode.querySelector(".chat-question-summary-question")?.textContent,
        answer: answerButton.textContent,
        answerIcon: answerButton.querySelector(".chat-question-summary-answer-icon")?.classList.contains("codicon-close-compact"),
        hasChevron: !!answerButton.querySelector(".chat-collapsible-hover-chevron"),
        options: Array.from(widget.domNode.querySelectorAll(".chat-question-summary-option-label")).map((option) => option.textContent)
      }, {
        question: "Question: Which environment?",
        answer: "Skipped question",
        answerIcon: true,
        hasChevron: true,
        options: ["Staging", "Production"]
      });
    });
    test("shows answered message when answeredExternally but no data", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "Question 1" }
        ],
        allowSkip: true,
        isUsed: true,
        answeredExternally: true,
        answerPresentation: "conversation"
      };
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container");
      assert.ok(!summary?.querySelector(".chat-question-summary-skipped"), "Should not show skipped message");
      assert.ok(summary?.querySelector(".chat-question-summary-answered"), "Should show answered message when answered externally");
      assert.ok(!summary?.querySelector(".codicon-copilot-compact"), "Should not present a generic external answer as an automatic reply");
    });
    test("renders a Copilot icon for a structured automatic answer", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "What should we work on next?" }
        ],
        allowSkip: true,
        isUsed: true,
        answeredExternally: true,
        autoReply: true,
        answerPresentation: "conversation",
        data: { q1: AgentHostAutoReplyAnswer }
      };
      createWidget(carousel);
      assert.deepStrictEqual({
        question: widget.domNode.querySelector(".chat-question-summary-question")?.textContent,
        answer: widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button")?.textContent,
        answerIcon: widget.domNode.querySelector(".chat-question-summary-answer-icon")?.classList.contains("codicon-copilot-compact"),
        hasGenericMessage: !!widget.domNode.querySelector(".chat-question-summary-answered")
      }, {
        question: "Question: What should we work on next?",
        answer: `Answered: ${AgentHostAutoReplyAnswer}`,
        answerIcon: true,
        hasGenericMessage: false
      });
    });
  });
  suite("Description and Message", () => {
    test("renders question description when provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Email", description: "Enter your email address" }
      ]);
      createWidget(carousel);
      const desc = widget.domNode.querySelector(".chat-question-description");
      assert.ok(desc, "Description element should be rendered");
      assert.strictEqual(desc?.textContent, "Enter your email address");
    });
    test("does not render description element when not provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name" }
      ]);
      createWidget(carousel);
      const desc = widget.domNode.querySelector(".chat-question-description");
      assert.strictEqual(desc, null, "Description element should not exist when not provided");
    });
    test("renders carousel-level message on first question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name" },
        { id: "q2", type: "text", title: "Email" }
      ]);
      carousel.message = "Please fill in the following:";
      createWidget(carousel);
      const message = widget.domNode.querySelector(".chat-question-carousel-message");
      assert.ok(message, "Carousel message should be rendered");
      assert.ok(message?.textContent?.includes("Please fill in the following:"));
    });
    test("renders carousel-level message as markdown", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name" }
      ]);
      carousel.message = new MarkdownString("**Important:** Fill this form");
      createWidget(carousel);
      const message = widget.domNode.querySelector(".chat-question-carousel-message");
      assert.ok(message, "Carousel message should be rendered");
      assert.ok(message?.querySelector(".rendered-markdown"), "Message should be rendered as markdown");
    });
    test("shows required indicator on required questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title?.textContent?.includes("*"), "Required indicator (*) should be shown");
    });
    test("does not show required indicator on optional questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Nickname" }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title?.textContent);
      assert.ok(!title?.textContent?.includes("*"), "Required indicator should not be shown");
    });
  });
  suite("Validation", () => {
    test("renders validation message element", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Email",
          validation: { format: "email" }
        }
      ]);
      createWidget(carousel);
      const validationMsg = widget.domNode.querySelector(".chat-question-validation-message");
      assert.ok(validationMsg, "Validation message element should exist");
      assert.strictEqual(validationMsg?.style.display, "none", "Validation message should be hidden initially");
    });
    test("blocks submit on required empty text field", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true }
      ]);
      createWidget(carousel);
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      assert.ok(submitButton, "Submit button should exist");
      submitButton.click();
      const validationMsg = widget.domNode.querySelector(".chat-question-validation-message");
      assert.ok(validationMsg?.textContent, "Validation error should be shown");
      assert.strictEqual(submittedAnswers, null, "Should not have submitted");
    });
    test("next button is disabled when required text field is empty", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true },
        { id: "q2", type: "text", title: "Age" }
      ]);
      createWidget(carousel);
      const nextButton = widget.domNode.querySelector(".chat-question-nav-next");
      assert.ok(nextButton, "Next button should exist");
      assert.ok(nextButton.classList.contains("disabled"), "Next button should be disabled when required field is empty");
    });
    test("allows submit on required field with value", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true }
      ]);
      createWidget(carousel);
      const inputBox = widget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(inputBox, "Input should exist");
      inputBox.value = "John";
      inputBox.dispatchEvent(new Event("input", { bubbles: true }));
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      submitButton.click();
      assert.ok(submittedAnswers !== null, "Should have submitted");
    });
    test("validates required field across questions on submit", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Optional" },
        { id: "q2", type: "text", title: "Required", required: true }
      ]);
      createWidget(carousel);
      widget.navigateToNextQuestion();
      widget.navigateToPreviousQuestion();
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      if (submitButton) {
        submitButton.click();
      }
      assert.strictEqual(submittedAnswers, null, "Should not submit when required field is empty");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRRdWVzdGlvbkNhcm91c2VsUGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQsIElDaGF0UXVlc3Rpb25DYXJvdXNlbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRRdWVzdGlvbkNhcm91c2VsUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUsIElDaGF0UXVlc3Rpb25DYXJvdXNlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTW9ja0Nhcm91c2VsKHF1ZXN0aW9uczogSUNoYXRRdWVzdGlvbkNhcm91c2VsWydxdWVzdGlvbnMnXSwgYWxsb3dTa2lwOiBib29sZWFuID0gdHJ1ZSk6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdHF1ZXN0aW9ucyxcblx0XHRhbGxvd1NraXAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tDb250ZXh0KCk6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IHtcblx0Y29uc3QgY29udGV4dDogUGFydGlhbDxJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dD4gPSB7IGNvbnRlbnQ6IFtdLCBjb250ZW50SW5kZXg6IDAgfTtcblx0cmV0dXJuIGNvbnRleHQgYXMgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQ7XG59XG5cbnN1aXRlKCdDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHdpZGdldDogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0O1xuXHRsZXQgc3VibWl0dGVkQW5zd2VyczogTWFwPHN0cmluZywgSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlPiB8IHVuZGVmaW5lZCB8IG51bGwgPSBudWxsO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdpZGdldChjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsLCBvblN1Ym1pdD86ICgpID0+IHZvaWQpOiBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRRdWVzdGlvbkNhcm91c2VsT3B0aW9ucyA9IHtcblx0XHRcdG9uU3VibWl0OiAoYW5zd2VycykgPT4ge1xuXHRcdFx0XHRzdWJtaXR0ZWRBbnN3ZXJzID0gYW5zd2Vycztcblx0XHRcdFx0b25TdWJtaXQ/LigpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0d2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCwgY2Fyb3VzZWwsIGNyZWF0ZU1vY2tDb250ZXh0KCksIG9wdGlvbnMpKTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdHJldHVybiB3aWRnZXQ7XG5cdH1cblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0aWYgKHdpZGdldD8uZG9tTm9kZT8ucGFyZW50Tm9kZSkge1xuXHRcdFx0d2lkZ2V0LmRvbU5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdFx0fVxuXHRcdHN1Ym1pdHRlZEFuc3dlcnMgPSBudWxsO1xuXHR9KTtcblxuXHRzdWl0ZSgnQmFzaWMgUmVuZGVyaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmRlcnMgY2Fyb3VzZWwgY29udGFpbmVyIHdpdGggcHJvcGVyIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1jb250YWluZXInKSk7XG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24taGVhZGVyLXJvdycpKTtcblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1jb250ZW50JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBxdWVzdGlvbiB0aXRsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1doYXQgaXMgeW91ciBuYW1lPycsIG1lc3NhZ2U6ICdXaGF0IGlzIHlvdXIgbmFtZT8nIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlKTtcblx0XHRcdC8vIFRpdGxlIGluY2x1ZGVzIHByb2dyZXNzIHByZWZpeCBsaWtlIFwiKDEvMSkgV2hhdCBpcyB5b3VyIG5hbWU/XCJcblx0XHRcdGFzc2VydC5vayh0aXRsZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdXaGF0IGlzIHlvdXIgbmFtZT8nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIHF1ZXN0aW9uIHRpdGxlIHdoZW4gbWVzc2FnZSBpcyBub3QgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdGYWxsYmFjayB0aXRsZSB0ZXh0JyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZSwgJ3RpdGxlIGVsZW1lbnQgc2hvdWxkIGV4aXN0IHdoZW4gb25seSB0aXRsZSBpcyBwcm92aWRlZCcpO1xuXHRcdFx0Ly8gVGl0bGUgc2hvdWxkIGZhbGwgYmFjayB0byB0aXRsZSBwcm9wZXJ0eSB3aGVuIG1lc3NhZ2UgaXMgbm90IHByb3ZpZGVkXG5cdFx0XHRhc3NlcnQub2sodGl0bGU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnRmFsbGJhY2sgdGl0bGUgdGV4dCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgbWFya2Rvd24gaW4gcXVlc3Rpb24gbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1F1ZXN0aW9uJyxcblx0XHRcdFx0XHRtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoJ1BsZWFzZSByZXZpZXcgKipkZXRhaWxzKiogaW4gW2RvY3NdKGh0dHBzOi8vZXhhbXBsZS5jb20pJylcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCB0aXRsZSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXRpdGxlJyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGUsICd0aXRsZSBlbGVtZW50IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlPy5xdWVyeVNlbGVjdG9yKCcucmVuZGVyZWQtbWFya2Rvd24nKSwgJ21hcmtkb3duIGNvbnRlbnQgc2hvdWxkIGJlIHJlbmRlcmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIHBsYWluIHN0cmluZyBxdWVzdGlvbiBtZXNzYWdlIGFzIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdRdWVzdGlvbicsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1BsZWFzZSByZXZpZXcgKipkZXRhaWxzKiogaW4gW2RvY3NdKGh0dHBzOi8vZXhhbXBsZS5jb20pJ1xuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZSwgJ3RpdGxlIGVsZW1lbnQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnZGV0YWlscycpLCAnY29udGVudCBzaG91bGQgYmUgcmVuZGVyZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgcHJvZ3Jlc3MgaW5kaWNhdG9yIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnLCBtZXNzYWdlOiAnUXVlc3Rpb24gMScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDInLCBtZXNzYWdlOiAnUXVlc3Rpb24gMicgfSxcblx0XHRcdFx0eyBpZDogJ3EzJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDMnLCBtZXNzYWdlOiAnUXVlc3Rpb24gMycgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHQvLyBQcm9ncmVzcyBpcyBzaG93biBpbiB0aGUgc3RlcCBpbmRpY2F0b3IgaW4gdGhlIGZvb3RlciBhcyBcIjEvM1wiXG5cdFx0XHRjb25zdCBzdGVwSW5kaWNhdG9yID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3RlcC1pbmRpY2F0b3InKTtcblx0XHRcdGFzc2VydC5vayhzdGVwSW5kaWNhdG9yKTtcblx0XHRcdGFzc2VydC5vayhzdGVwSW5kaWNhdG9yPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJzEnKSk7XG5cdFx0XHRhc3NlcnQub2soc3RlcEluZGljYXRvcj8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCczJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjbG9zZSBidXR0b24gaW4gdGl0bGUgcm93IGZvciBtdWx0aS1xdWVzdGlvbiBjYXJvdXNlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCB0aXRsZVJvdyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXRpdGxlLXJvdycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlUm93LCAndGl0bGUgcm93IHNob3VsZCBleGlzdCcpO1xuXG5cdFx0XHRjb25zdCBjbG9zZUNvbnRhaW5lciA9IHRpdGxlUm93Py5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jbG9zZS1jb250YWluZXInKTtcblx0XHRcdGFzc2VydC5vayhjbG9zZUNvbnRhaW5lciwgJ2Nsb3NlIGJ1dHRvbiBjb250YWluZXIgc2hvdWxkIGJlIHJlbmRlcmVkIGluIHRoZSB0aXRsZSByb3cnKTtcblxuXHRcdFx0Y29uc3QgZGlyZWN0Q2hpbGRDbG9zZUNvbnRhaW5lciA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5jaGF0LXF1ZXN0aW9uLWNsb3NlLWNvbnRhaW5lcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcmVjdENoaWxkQ2xvc2VDb250YWluZXIsIG51bGwsICdjbG9zZSBidXR0b24gY29udGFpbmVyIHNob3VsZCBub3QgYmUgcG9zaXRpb25lZCBhcyBhIGRpcmVjdCBjaGlsZCBvZiB0aGUgY2Fyb3VzZWwgY29udGFpbmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGNvbGxhcHNlIGJ1dHRvbiBpbiB0aXRsZSByb3cgZXZlbiB3aGVuIHNraXAgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCBmYWxzZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCB0aXRsZVJvdyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXRpdGxlLXJvdycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlUm93LCAndGl0bGUgcm93IHNob3VsZCBleGlzdCcpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IHRpdGxlUm93Py5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jb2xsYXBzZS10b2dnbGUnKTtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUJ1dHRvbiwgJ2NvbGxhcHNlIGJ1dHRvbiBzaG91bGQgYmUgcmVuZGVyZWQgZXZlbiB3aGVuIHNraXAgaXMgZGlzYWJsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY29sbGFwc2UgYnV0dG9uIHRvIHRoZSByaWdodCBvZiBjbG9zZSBidXR0b24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24taGVhZGVyLWFjdGlvbnMnKTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb25zQ29udGFpbmVyLCAnYWN0aW9ucyBjb250YWluZXIgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRpZiAoIWFjdGlvbnNDb250YWluZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3Rpb25CdXR0b25zID0gQXJyYXkuZnJvbShhY3Rpb25zQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tYnV0dG9uJykpO1xuXHRcdFx0Y29uc3QgY2xvc2VJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KGJ1dHRvbiA9PiBidXR0b24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNsb3NlJykpO1xuXHRcdFx0Y29uc3QgY29sbGFwc2VJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KGJ1dHRvbiA9PiBidXR0b24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNvbGxhcHNlLXRvZ2dsZScpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGNsb3NlSW5kZXggPj0gMCwgJ2Nsb3NlIGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUluZGV4ID49IDAsICdjb2xsYXBzZSBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2soY29sbGFwc2VJbmRleCA+IGNsb3NlSW5kZXgsICdjb2xsYXBzZSBidXR0b24gc2hvdWxkIGJlIHBvc2l0aW9uZWQgdG8gdGhlIHJpZ2h0IG9mIGNsb3NlIGJ1dHRvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9nZ2xlcyBjb2xsYXBzZWQgc3RhdGUgYW5kIHVwZGF0ZXMgYXJpYS1leHBhbmRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGNvbGxhcHNlQnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY29sbGFwc2UtdG9nZ2xlJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY29sbGFwc2VCdXR0b24sICdjb2xsYXBzZSBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGFwc2VCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksICd0cnVlJyk7XG5cblx0XHRcdGNvbGxhcHNlQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbGxhcHNlZCcpLCAnd2lkZ2V0IHNob3VsZCBlbnRlciBjb2xsYXBzZWQgc3RhdGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsYXBzZUJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ2ZhbHNlJyk7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWRTdW1tYXJ5ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY29sbGFwc2VkLXN1bW1hcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsYXBzZWRTdW1tYXJ5LCBudWxsLCAnY29sbGFwc2VkIG1vZGUgc2hvdWxkIG5vdCByZW5kZXIgYW4gYWRkaXRpb25hbCBzdW1tYXJ5IHNlY3Rpb24nKTtcblxuXHRcdFx0Y29uc3QgdGl0bGVSb3cgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZS1yb3cnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZVJvdywgJ2hlYWRlciBzaG91bGQgcmVtYWluIHZpc2libGUgd2hlbiBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Y29uc3QgaW5wdXRTY3JvbGxhYmxlID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24taW5wdXQtc2Nyb2xsYWJsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlucHV0U2Nyb2xsYWJsZSwgJ2lucHV0IHNlY3Rpb24gZXhpc3RzIGluIERPTSBidXQgaXMgaGlkZGVuIHdoaWxlIGNvbGxhcHNlZCcpO1xuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29sbGFwc2VkJyksICd3aWRnZXQgc2hvdWxkIGV4aXQgY29sbGFwc2VkIHN0YXRlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGFwc2VCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksICd0cnVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBkcmFmdCBjb2xsYXBzZWQgc3RhdGUgZnJvbSBjYXJvdXNlbCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNhcm91c2VsLmRyYWZ0Q29sbGFwc2VkID0gdHJ1ZTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29sbGFwc2VkJyksICd3aWRnZXQgc2hvdWxkIHJlc3RvcmUgY29sbGFwc2VkIGRyYWZ0IHN0YXRlJyk7XG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNvbGxhcHNlLXRvZ2dsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlQnV0dG9uPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ2ZhbHNlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdRdWVzdGlvbiBUeXBlcycsICgpID0+IHtcblx0XHR0ZXN0KCdyZW5kZXJzIHRleHQgaW5wdXQgZm9yIHRleHQgdHlwZSBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdFbnRlciB5b3VyIG5hbWUnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1pbnB1dC1jb250YWluZXInKTtcblx0XHRcdGFzc2VydC5vayhpbnB1dENvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBpbnB1dEJveCA9IGlucHV0Q29udGFpbmVyPy5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWlucHV0Ym94IGlucHV0Jyk7XG5cdFx0XHRhc3NlcnQub2soaW5wdXRCb3gsICdTaG91bGQgaGF2ZSBhbiBpbnB1dCBib3ggZm9yIHRleHQgcXVlc3Rpb25zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGxpc3QgaXRlbXMgZm9yIHNpbmdsZVNlbGVjdCB0eXBlIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG9uZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICdiJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGxpc3RJdGVtcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtcy5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSAyIGxpc3QgaXRlbXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgbGlzdCBpdGVtcyB3aXRoIGNoZWNrYm94ZXMgZm9yIG11bHRpU2VsZWN0IHR5cGUgcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBtdWx0aXBsZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICdiJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2MnLCBsYWJlbDogJ09wdGlvbiBDJywgdmFsdWU6ICdjJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGxpc3RJdGVtcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbS5tdWx0aS1zZWxlY3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0SXRlbXMubGVuZ3RoLCAzLCAnU2hvdWxkIGhhdmUgMyBsaXN0IGl0ZW1zIGZvciBtdWx0aVNlbGVjdCcpO1xuXHRcdFx0Y29uc3QgY2hlY2tib3hlcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtY2hlY2tib3gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja2JveGVzLmxlbmd0aCwgMywgJ1Nob3VsZCBoYXZlIDMgY2hlY2tib3hlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJlZWZvcm0gdGV4dGFyZWEgaXMgcmVuZGVyZWQgZm9yIHNpbmdsZVNlbGVjdCBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgZnJlZWZvcm1UZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLXRleHRhcmVhJyk7XG5cdFx0XHRhc3NlcnQub2soZnJlZWZvcm1UZXh0YXJlYSwgJ0ZyZWVmb3JtIHRleHRhcmVhIHNob3VsZCBiZSByZW5kZXJlZCBieSBkZWZhdWx0IGZvciBzaW5nbGVTZWxlY3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZyZWVmb3JtIHRleHRhcmVhIGlzIHJlbmRlcmVkIGZvciBtdWx0aVNlbGVjdCBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBtdWx0aXBsZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGZyZWVmb3JtVGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS10ZXh0YXJlYScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZyZWVmb3JtVGV4dGFyZWEsICdGcmVlZm9ybSB0ZXh0YXJlYSBzaG91bGQgYmUgcmVuZGVyZWQgYnkgZGVmYXVsdCBmb3IgbXVsdGlTZWxlY3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZyZWVmb3JtIHRleHRhcmVhIGlzIGhpZGRlbiB3aGVuIGFsbG93RnJlZWZvcm1JbnB1dCBpcyBmYWxzZSBmb3Igc2luZ2xlU2VsZWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAnYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAnYicgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBmcmVlZm9ybVRleHRhcmVhID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tZnJlZWZvcm0tdGV4dGFyZWEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcmVlZm9ybVRleHRhcmVhLCBudWxsLCAnRnJlZWZvcm0gdGV4dGFyZWEgc2hvdWxkIG5vdCBiZSByZW5kZXJlZCB3aGVuIGFsbG93RnJlZWZvcm1JbnB1dCBpcyBmYWxzZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJlZWZvcm0gdGV4dGFyZWEgaXMgaGlkZGVuIHdoZW4gYWxsb3dGcmVlZm9ybUlucHV0IGlzIGZhbHNlIGZvciBtdWx0aVNlbGVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2UgbXVsdGlwbGUnLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICdiJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGZyZWVmb3JtVGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS10ZXh0YXJlYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyZWVmb3JtVGV4dGFyZWEsIG51bGwsICdGcmVlZm9ybSB0ZXh0YXJlYSBzaG91bGQgbm90IGJlIHJlbmRlcmVkIHdoZW4gYWxsb3dGcmVlZm9ybUlucHV0IGlzIGZhbHNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IG9wdGlvbnMgYXJlIHByZS1zZWxlY3RlZCBmb3Igc2luZ2xlU2VsZWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ2InIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogJ2InXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gRGVmYXVsdCBvcHRpb24gJ2InIGlzIHJlLXNvcnRlZCB0byBhcHBlYXIgZmlyc3Rcblx0XHRcdGNvbnN0IGxpc3RJdGVtcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbScpIGFzIE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtc1swXS5jbGFzc0xpc3QuY29udGFpbnMoJ3NlbGVjdGVkJyksIHRydWUsICdEZWZhdWx0IG9wdGlvbiBzaG91bGQgYmUgcmUtc29ydGVkIHRvIGZpcnN0IGFuZCBzZWxlY3RlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtc1sxXS5jbGFzc0xpc3QuY29udGFpbnMoJ3NlbGVjdGVkJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHQgb3B0aW9ucyBhcmUgcHJlLXNlbGVjdGVkIGZvciBtdWx0aVNlbGVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2UgbXVsdGlwbGUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAnYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAnYicgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdjJywgbGFiZWw6ICdPcHRpb24gQycsIHZhbHVlOiAnYycgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBbJ2EnLCAnYyddXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gRGVmYXVsdCBvcHRpb25zICdhJyBhbmQgJ2MnIGFyZSByZS1zb3J0ZWQgdG8gYXBwZWFyIGZpcnN0XG5cdFx0XHRjb25zdCBsaXN0SXRlbXMgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1saXN0LWl0ZW0nKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50Pjtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0SXRlbXNbMF0uY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGVja2VkJyksIHRydWUsICdGaXJzdCBkZWZhdWx0IG9wdGlvbiBzaG91bGQgYmUgY2hlY2tlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtc1sxXS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSwgdHJ1ZSwgJ1NlY29uZCBkZWZhdWx0IG9wdGlvbiBzaG91bGQgYmUgY2hlY2tlZCAocmUtc29ydGVkIGZyb20gdGhpcmQpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zWzJdLmNsYXNzTGlzdC5jb250YWlucygnY2hlY2tlZCcpLCBmYWxzZSwgJ05vbi1kZWZhdWx0IG9wdGlvbiBzaG91bGQgbm90IGJlIGNoZWNrZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZVNlbGVjdCBrZWVwcyB2YWx1ZSBtYXBwaW5nIGFmdGVyIGRlZmF1bHQtZmlyc3QgcmVvcmRlcmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG9uZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICd2YWx1ZV9hJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICd2YWx1ZV9iJyB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6ICdiJ1xuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGxpc3RJdGVtcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbScpIGFzIE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtcy5sZW5ndGgsIDIsICdFeHBlY3RlZCB0d28gb3B0aW9ucycpO1xuXHRcdFx0bGlzdEl0ZW1zWzFdLmNsaWNrKCk7IC8vIE9wdGlvbiBBIGFmdGVyIGRlZmF1bHQtZmlyc3Qgb3JkZXJpbmdcblxuXHRcdFx0Y29uc3QgYW5zd2VyID0gc3VibWl0dGVkQW5zd2Vycz8uZ2V0KCdxMScpIGFzIHsgc2VsZWN0ZWRWYWx1ZTogdW5rbm93bjsgZnJlZWZvcm1WYWx1ZTogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuc3dlci5zZWxlY3RlZFZhbHVlLCAndmFsdWVfYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuc3dlci5mcmVlZm9ybVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlTZWxlY3Qga2VlcHMgdmFsdWUgbWFwcGluZyBhZnRlciBkZWZhdWx0LWZpcnN0IHJlb3JkZXJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG11bHRpcGxlJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ3ZhbHVlX2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ3ZhbHVlX2InIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYycsIGxhYmVsOiAnT3B0aW9uIEMnLCB2YWx1ZTogJ3ZhbHVlX2MnIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogJ2MnXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbGlzdEl0ZW1zID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zLmxlbmd0aCwgMywgJ0V4cGVjdGVkIHRocmVlIG9wdGlvbnMnKTtcblx0XHRcdGxpc3RJdGVtc1sxXS5jbGljaygpOyAvLyBPcHRpb24gQSBhZnRlciBkZWZhdWx0LWZpcnN0IG9yZGVyaW5nXG5cblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhzdWJtaXRCdXR0b24sICdTdWJtaXQgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGNvbnN0IGFuc3dlciA9IHN1Ym1pdHRlZEFuc3dlcnM/LmdldCgncTEnKSBhcyB7IHNlbGVjdGVkVmFsdWVzOiB1bmtub3duW107IGZyZWVmb3JtVmFsdWU6IHVua25vd24gfTtcblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KGFuc3dlci5zZWxlY3RlZFZhbHVlcykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuc3dlci5zZWxlY3RlZFZhbHVlcy5pbmNsdWRlcygndmFsdWVfYScpKTtcblx0XHRcdGFzc2VydC5vayhhbnN3ZXIuc2VsZWN0ZWRWYWx1ZXMuaW5jbHVkZXMoJ3ZhbHVlX2MnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLnNlbGVjdGVkVmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLmZyZWVmb3JtVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgYSBzdW1tYXJ5IGFmdGVyIG9uU3VibWl0IGRpc3Bvc2VzIHRoZSBwYXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24nLCBkZWZhdWx0VmFsdWU6ICdhbnN3ZXInIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsLCAoKSA9PiB3aWRnZXQuZGlzcG9zZSgpKTtcblxuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VibWl0LWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1zdW1tYXJ5JyksIG51bGwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTmF2aWdhdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdwcmV2aW91cyBidXR0b24gaXMgZGlzYWJsZWQgb24gZmlyc3QgcXVlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBuYXZBcnJvd3MgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1uYXYtYXJyb3cnKSBhcyBOb2RlTGlzdE9mPEhUTUxCdXR0b25FbGVtZW50Pjtcblx0XHRcdGNvbnN0IHByZXZCdXR0b24gPSBuYXZBcnJvd3NbMF07XG5cdFx0XHRhc3NlcnQub2socHJldkJ1dHRvbiwgJ1ByZXZpb3VzIGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayhwcmV2QnV0dG9uLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSB8fCBwcmV2QnV0dG9uLmRpc2FibGVkLCAnUHJldmlvdXMgYnV0dG9uIHNob3VsZCBiZSBkaXNhYmxlZCBvbiBmaXJzdCBxdWVzdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmV4dCBidXR0b24gc3RheXMgYXMgYXJyb3cgYW5kIGlzIGRpc2FibGVkIG9uIGxhc3QgcXVlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdPbmx5IFF1ZXN0aW9uJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHQvLyBOYXZpZ2F0ZSB0byBsYXN0IHF1ZXN0aW9uXG5cdFx0XHR3aWRnZXQubmF2aWdhdGVUb05leHRRdWVzdGlvbigpO1xuXG5cdFx0XHRjb25zdCBuYXZBcnJvd3MgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1uYXYtYXJyb3cnKSBhcyBOb2RlTGlzdE9mPEhUTUxCdXR0b25FbGVtZW50Pjtcblx0XHRcdGNvbnN0IG5leHRCdXR0b24gPSBuYXZBcnJvd3NbMV07XG5cdFx0XHRhc3NlcnQub2sobmV4dEJ1dHRvbiwgJ05leHQgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5leHRCdXR0b24uY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpIHx8IG5leHRCdXR0b24uZGlzYWJsZWQsICdOZXh0IGJ1dHRvbiBzaG91bGQgYmUgZGlzYWJsZWQgb24gbGFzdCBxdWVzdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3VibWl0IGJ1dHRvbiBpcyBzaG93biBvbiBsYXN0IHF1ZXN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDInIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gTmF2aWdhdGUgdG8gbGFzdCBxdWVzdGlvblxuXHRcdFx0d2lkZ2V0Lm5hdmlnYXRlVG9OZXh0UXVlc3Rpb24oKTtcblxuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VibWl0LWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdEJ1dHRvbiwgJ1N1Ym1pdCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3VibWl0QnV0dG9uLnN0eWxlLmRpc3BsYXksICdub25lJywgJ1N1Ym1pdCBidXR0b24gc2hvdWxkIGJlIHZpc2libGUgb24gbGFzdCBxdWVzdGlvbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2tpcCBGdW5jdGlvbmFsaXR5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NraXAgc3VjY2VlZHMgd2hlbiBhbGxvd1NraXAgaXMgdHJ1ZSBhbmQgcmV0dXJucyBkZWZhdWx0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnLCBkZWZhdWx0VmFsdWU6ICdkZWZhdWx0IGFuc3dlcicgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB3aWRnZXQuc2tpcCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSwgJ3NraXAoKSBzaG91bGQgcmV0dXJuIHRydWUgd2hlbiBhbGxvd1NraXAgaXMgdHJ1ZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdHRlZEFuc3dlcnMgaW5zdGFuY2VvZiBNYXAsICdTa2lwIHNob3VsZCBjYWxsIG9uU3VibWl0IHdpdGggYSBNYXAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzPy5nZXQoJ3ExJyksICdkZWZhdWx0IGFuc3dlcicsICdTa2lwIHNob3VsZCByZXR1cm4gZGVmYXVsdCB2YWx1ZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXAgZmFpbHMgd2hlbiBhbGxvd1NraXAgaXMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCBmYWxzZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB3aWRnZXQuc2tpcCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UsICdza2lwKCkgc2hvdWxkIHJldHVybiBmYWxzZSB3aGVuIGFsbG93U2tpcCBpcyBmYWxzZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IGhhdmUgYmVlbiBjYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXAgY2FuIG9ubHkgYmUgY2FsbGVkIG9uY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cdFx0XHRzdWJtaXR0ZWRBbnN3ZXJzID0gbnVsbDsgLy8gcmVzZXRcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ1NlY29uZCBza2lwKCkgc2hvdWxkIHJldHVybiBmYWxzZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IGJlIGNhbGxlZCBhZ2FpbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcCBuby1vcHMgd2hlbiB0aGUgY2Fyb3VzZWwgd2FzIGFscmVhZHkgcmVzb2x2ZWQgZXh0ZXJuYWxseScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnLCBkZWZhdWx0VmFsdWU6ICdkZWZhdWx0IGFuc3dlcicgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHQvLyBBIHZvaWNlIGFuc3dlciByZXNvbHZlcyB0aGUgY2Fyb3VzZWwgZGlyZWN0bHksIGFmdGVyIHRoaXMgcGFydCBoYXNcblx0XHRcdC8vIGFscmVhZHkgcmVuZGVyZWQgaW50ZXJhY3RpdmVseS4gVGhlIGF1dG8tc2tpcCB0aGF0IGZpcmVzIG9uIHRoZSBuZXh0XG5cdFx0XHQvLyByZXF1ZXN0IHN1Ym1pdCBtdXN0IG5vdCBvdmVyd3JpdGUgaXQgd2l0aCBkZWZhdWx0cy5cblx0XHRcdGNhcm91c2VsLmlzVXNlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ3NraXAoKSBtdXN0IG5vdCByZS1zdWJtaXQgYSBjYXJvdXNlbCByZXNvbHZlZCBlbHNld2hlcmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzLCBudWxsLCAnb25TdWJtaXQgc2hvdWxkIG5vdCBvdmVyd3JpdGUgdGhlIGV4dGVybmFsIGFuc3dlcnMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0lnbm9yZSBGdW5jdGlvbmFsaXR5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2lnbm9yZSBzdWNjZWVkcyB3aGVuIGFsbG93U2tpcCBpcyB0cnVlIGFuZCByZXR1cm5zIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gd2lkZ2V0Lmlnbm9yZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSwgJ2lnbm9yZSgpIHNob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIGFsbG93U2tpcCBpcyB0cnVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgdW5kZWZpbmVkLCAnSWdub3JlIHNob3VsZCBjYWxsIG9uU3VibWl0IHdpdGggdW5kZWZpbmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmUgZmFpbHMgd2hlbiBhbGxvd1NraXAgaXMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCBmYWxzZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB3aWRnZXQuaWdub3JlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ2lnbm9yZSgpIHNob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBhbGxvd1NraXAgaXMgZmFsc2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzLCBudWxsLCAnb25TdWJtaXQgc2hvdWxkIG5vdCBoYXZlIGJlZW4gY2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmUgY2FuIG9ubHkgYmUgY2FsbGVkIG9uY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5pZ25vcmUoKTtcblx0XHRcdHN1Ym1pdHRlZEFuc3dlcnMgPSBudWxsOyAvLyByZXNldFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gd2lkZ2V0Lmlnbm9yZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UsICdTZWNvbmQgaWdub3JlKCkgc2hvdWxkIHJldHVybiBmYWxzZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IGJlIGNhbGxlZCBhZ2FpbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlIG5vLW9wcyB3aGVuIHRoZSBjYXJvdXNlbCB3YXMgYWxyZWFkeSByZXNvbHZlZCBleHRlcm5hbGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB3aWRnZXQuaWdub3JlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ2lnbm9yZSgpIG11c3Qgbm90IHJlLXN1Ym1pdCBhIGNhcm91c2VsIHJlc29sdmVkIGVsc2V3aGVyZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IG92ZXJ3cml0ZSB0aGUgZXh0ZXJuYWwgYW5zd2VycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcCBhbmQgaWdub3JlIGFyZSBtdXR1YWxseSBleGNsdXNpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cdFx0XHRzdWJtaXR0ZWRBbnN3ZXJzID0gbnVsbDsgLy8gcmVzZXRcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5pZ25vcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlLCAnaWdub3JlKCkgc2hvdWxkIHJldHVybiBmYWxzZSBhZnRlciBza2lwKCknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzLCBudWxsLCAnb25TdWJtaXQgc2hvdWxkIG5vdCBiZSBjYWxsZWQgYWdhaW4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FjY2Vzc2liaWxpdHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnbmF2aWdhdGlvbiBhcmVhIGhhcyBwcm9wZXIgcm9sZSBhbmQgYXJpYS1sYWJlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbmF2ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtbmF2Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2Py5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSwgJ25hdmlnYXRpb24nKTtcblx0XHRcdGFzc2VydC5vayhuYXY/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLCAnTmF2aWdhdGlvbiBzaG91bGQgaGF2ZSBhcmlhLWxhYmVsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgc2VsZWN0IGxpc3QgaGFzIHByb3BlciByb2xlIGFuZCBhcmlhLWxhYmVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ2InIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbGlzdCA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWxpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0Py5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSwgJ2xpc3Rib3gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0Py5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSwgJ0Nob29zZSBvbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3QgaXRlbXMgaGF2ZSBwcm9wZXIgcm9sZSBhbmQgYXJpYS1zZWxlY3RlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG9uZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICdiJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGxpc3RJdGVtcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtcy5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSAyIGxpc3QgaXRlbXMnKTtcblxuXHRcdFx0Ly8gRmlyc3QgaXRlbSBzaG91bGQgYmUgYXV0by1zZWxlY3RlZCAobm8gZGVmYXVsdCB2YWx1ZSwgc28gZmlyc3QgaXMgc2VsZWN0ZWQpXG5cdFx0XHRjb25zdCBmaXJzdEl0ZW0gPSBsaXN0SXRlbXNbMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RJdGVtLmdldEF0dHJpYnV0ZSgncm9sZScpLCAnb3B0aW9uJyk7XG5cdFx0XHRhc3NlcnQub2soZmlyc3RJdGVtLmlkLCAnTGlzdCBpdGVtIHNob3VsZCBoYXZlIGFuIGlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RJdGVtLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpLCAndHJ1ZScsICdGaXJzdCBpdGVtIHNob3VsZCBiZSBhdXRvLXNlbGVjdGVkJyk7XG5cblx0XHRcdC8vIFNlY29uZCBpdGVtIHNob3VsZCBub3QgYmUgc2VsZWN0ZWRcblx0XHRcdGNvbnN0IHNlY29uZEl0ZW0gPSBsaXN0SXRlbXNbMV0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kSXRlbS5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSwgJ29wdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZEl0ZW0uZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJyksICdmYWxzZScsICdVbnNlbGVjdGVkIGl0ZW0gc2hvdWxkIGhhdmUgYXJpYS1zZWxlY3RlZD1mYWxzZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGFzU2FtZUNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBzYW1lIGNhcm91c2VsIGluc3RhbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lmhhc1NhbWVDb250ZW50KGNhcm91c2VsLCBbXSwge30gYXMgbmV2ZXIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBjb250ZW50IHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGRpZmZlcmVudENvbnRlbnQgPSB7IGtpbmQ6ICdtYXJrZG93bicgYXMgY29uc3QgfSBhcyBuZXZlcjtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaGFzU2FtZUNvbnRlbnQoZGlmZmVyZW50Q29udGVudCwgW10sIHt9IGFzIG5ldmVyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQXV0by1BcHByb3ZlIChZb2xvIE1vZGUpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NraXAgcmV0dXJucyBkZWZhdWx0IHZhbHVlcyBmb3IgdGV4dCBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJywgZGVmYXVsdFZhbHVlOiAnZGVmYXVsdCB0ZXh0JyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyBpbnN0YW5jZW9mIE1hcCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2Vycz8uZ2V0KCdxMScpLCAnZGVmYXVsdCB0ZXh0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwIHJldHVybnMgZGVmYXVsdCB2YWx1ZXMgZm9yIHNpbmdsZVNlbGVjdCBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAndmFsdWVfYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAndmFsdWVfYicgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiAnYidcblx0XHRcdFx0fVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHR3aWRnZXQuc2tpcCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdHRlZEFuc3dlcnMgaW5zdGFuY2VvZiBNYXApO1xuXHRcdFx0Ly8gc2luZ2xlU2VsZWN0IGFsd2F5cyByZXR1cm5zIHN0cnVjdHVyZWQgZm9ybWF0IHdpdGggZnJlZWZvcm1WYWx1ZVxuXHRcdFx0Y29uc3QgYW5zd2VyID0gc3VibWl0dGVkQW5zd2Vycz8uZ2V0KCdxMScpIGFzIHsgc2VsZWN0ZWRWYWx1ZTogdW5rbm93bjsgZnJlZWZvcm1WYWx1ZTogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuc3dlci5zZWxlY3RlZFZhbHVlLCAndmFsdWVfYicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuc3dlci5mcmVlZm9ybVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcCByZXR1cm5zIGRlZmF1bHQgdmFsdWVzIGZvciBtdWx0aVNlbGVjdCBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG11bHRpcGxlJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ3ZhbHVlX2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ3ZhbHVlX2InIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYycsIGxhYmVsOiAnT3B0aW9uIEMnLCB2YWx1ZTogJ3ZhbHVlX2MnIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogWydhJywgJ2MnXVxuXHRcdFx0XHR9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyBpbnN0YW5jZW9mIE1hcCk7XG5cdFx0XHQvLyBtdWx0aVNlbGVjdCBhbHdheXMgcmV0dXJucyBzdHJ1Y3R1cmVkIGZvcm1hdCB3aXRoIGZyZWVmb3JtVmFsdWVcblx0XHRcdGNvbnN0IGFuc3dlciA9IHN1Ym1pdHRlZEFuc3dlcnM/LmdldCgncTEnKSBhcyB7IHNlbGVjdGVkVmFsdWVzOiB1bmtub3duW107IGZyZWVmb3JtVmFsdWU6IHVua25vd24gfTtcblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KGFuc3dlci5zZWxlY3RlZFZhbHVlcykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuc3dlci5zZWxlY3RlZFZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuc3dlci5zZWxlY3RlZFZhbHVlcy5pbmNsdWRlcygndmFsdWVfYScpKTtcblx0XHRcdGFzc2VydC5vayhhbnN3ZXIuc2VsZWN0ZWRWYWx1ZXMuaW5jbHVkZXMoJ3ZhbHVlX2MnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLmZyZWVmb3JtVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwIHJldHVybnMgZGVmYXVsdHMgZm9yIG11bHRpcGxlIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1RleHQgUXVlc3Rpb24nLCBkZWZhdWx0VmFsdWU6ICd0ZXh0IGRlZmF1bHQnIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3EyJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1NpbmdsZSBTZWxlY3QnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdvcHQxJywgbGFiZWw6ICdGaXJzdCcsIHZhbHVlOiAnZmlyc3RfdmFsdWUnIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogJ29wdDEnXG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblx0XHRcdGFzc2VydC5vayhzdWJtaXR0ZWRBbnN3ZXJzIGluc3RhbmNlb2YgTWFwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzPy5nZXQoJ3ExJyksICd0ZXh0IGRlZmF1bHQnKTtcblx0XHRcdC8vIHNpbmdsZVNlbGVjdCBhbHdheXMgcmV0dXJucyBzdHJ1Y3R1cmVkIGZvcm1hdCB3aXRoIGZyZWVmb3JtVmFsdWVcblx0XHRcdGNvbnN0IGFuc3dlciA9IHN1Ym1pdHRlZEFuc3dlcnM/LmdldCgncTInKSBhcyB7IHNlbGVjdGVkVmFsdWU6IHVua25vd247IGZyZWVmb3JtVmFsdWU6IHVua25vd24gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbnN3ZXIuc2VsZWN0ZWRWYWx1ZSwgJ2ZpcnN0X3ZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLmZyZWVmb3JtVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwIHJldHVybnMgZW1wdHkgbWFwIHdoZW4gbm8gZGVmYXVsdHMgYXJlIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gd2l0aG91dCBkZWZhdWx0JyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyBpbnN0YW5jZW9mIE1hcCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2Vycz8uc2l6ZSwgMCwgJ1Nob3VsZCByZXR1cm4gZW1wdHkgbWFwIHdoZW4gbm8gZGVmYXVsdHMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1VzZWQgQ2Fyb3VzZWwgU3VtbWFyeScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXRhaW5zIGN1cnJlbnQgcXVlc3Rpb24gYWZ0ZXIgbmF2aWdhdGlvbiB3aXRob3V0IGVkaXRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDInIH1cblx0XHRcdF0sIHRydWUpO1xuXG5cdFx0XHRjb25zdCBmaXJzdFdpZGdldCA9IGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cdFx0XHRjb25zdCBuZXh0QnV0dG9uID0gZmlyc3RXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1uYXYtbmV4dCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhuZXh0QnV0dG9uLCAnbmV4dCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRuZXh0QnV0dG9uLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Zmlyc3RXaWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0Zmlyc3RXaWRnZXQuZG9tTm9kZS5yZW1vdmUoKTtcblxuXHRcdFx0Y29uc3QgcmVjcmVhdGVkV2lkZ2V0ID0gY3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblx0XHRcdGNvbnN0IHN0ZXBJbmRpY2F0b3IgPSByZWNyZWF0ZWRXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdGVwLWluZGljYXRvcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ZXBJbmRpY2F0b3I/LnRleHRDb250ZW50LCAnMi8yJywgJ3Nob3VsZCByZXN0b3JlIHRoZSBjdXJyZW50IHF1ZXN0aW9uIGluZGV4IGFmdGVyIG5hdmlnYXRpb24nKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSByZWNyZWF0ZWRXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1F1ZXN0aW9uIDInKSwgJ3Nob3VsZCByZXN0b3JlIHRvIHRoZSBzZWNvbmQgcXVlc3Rpb24gdmlldycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0YWlucyBkcmFmdCBhbnN3ZXJzIGFuZCBjdXJyZW50IHF1ZXN0aW9uIGFmdGVyIHdpZGdldCByZWNyZWF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgZmlyc3RXaWRnZXQgPSBjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXHRcdFx0Y29uc3QgZmlyc3RJbnB1dCA9IGZpcnN0V2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1pbnB1dGJveCBpbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0SW5wdXQsICdmaXJzdCBxdWVzdGlvbiBpbnB1dCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGZpcnN0SW5wdXQudmFsdWUgPSAnZmlyc3QgZHJhZnQgYW5zd2VyJztcblx0XHRcdGZpcnN0SW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgbmV4dEJ1dHRvbiA9IGZpcnN0V2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tbmF2LW5leHQnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2sobmV4dEJ1dHRvbiwgJ25leHQgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0bmV4dEJ1dHRvbi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdGNvbnN0IHNlY29uZElucHV0ID0gZmlyc3RXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWlucHV0Ym94IGlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2soc2Vjb25kSW5wdXQsICdzZWNvbmQgcXVlc3Rpb24gaW5wdXQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRzZWNvbmRJbnB1dC52YWx1ZSA9ICdzZWNvbmQgZHJhZnQgYW5zd2VyJztcblx0XHRcdHNlY29uZElucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdGZpcnN0V2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdGZpcnN0V2lkZ2V0LmRvbU5vZGUucmVtb3ZlKCk7XG5cblx0XHRcdGNvbnN0IHJlY3JlYXRlZFdpZGdldCA9IGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cdFx0XHRjb25zdCBzdGVwSW5kaWNhdG9yID0gcmVjcmVhdGVkV2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3RlcC1pbmRpY2F0b3InKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGVwSW5kaWNhdG9yPy50ZXh0Q29udGVudCwgJzIvMicsICdzaG91bGQgcmVzdG9yZSB0aGUgY3VycmVudCBxdWVzdGlvbiBpbmRleCcpO1xuXG5cdFx0XHRjb25zdCByZWNyZWF0ZWRTZWNvbmRJbnB1dCA9IHJlY3JlYXRlZFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28taW5wdXRib3ggaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhyZWNyZWF0ZWRTZWNvbmRJbnB1dCwgJ3JlY3JlYXRlZCBzZWNvbmQgcXVlc3Rpb24gaW5wdXQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjcmVhdGVkU2Vjb25kSW5wdXQudmFsdWUsICdzZWNvbmQgZHJhZnQgYW5zd2VyJywgJ3Nob3VsZCByZXN0b3JlIGRyYWZ0IGlucHV0IGZvciBjdXJyZW50IHF1ZXN0aW9uJyk7XG5cblx0XHRcdGNvbnN0IHByZXZCdXR0b24gPSByZWNyZWF0ZWRXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1uYXYtcHJldicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhwcmV2QnV0dG9uLCAncHJldmlvdXMgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0cHJldkJ1dHRvbi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdGNvbnN0IHJlY3JlYXRlZEZpcnN0SW5wdXQgPSByZWNyZWF0ZWRXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWlucHV0Ym94IGlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2socmVjcmVhdGVkRmlyc3RJbnB1dCwgJ3JlY3JlYXRlZCBmaXJzdCBxdWVzdGlvbiBpbnB1dCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNyZWF0ZWRGaXJzdElucHV0LnZhbHVlLCAnZmlyc3QgZHJhZnQgYW5zd2VyJywgJ3Nob3VsZCByZXN0b3JlIGRyYWZ0IGlucHV0IGZvciBwcmV2aW91cyBxdWVzdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3Mgc3VtbWFyeSB3aXRoIGFuc3dlcnMgYWZ0ZXIgc2tpcCgpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScsIGRlZmF1bHRWYWx1ZTogJ2RlZmF1bHQgYW5zd2VyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtdXNlZCcpLCAnU2hvdWxkIGhhdmUgdXNlZCBjbGFzcycpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnknKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LCAnU2hvdWxkIHNob3cgc3VtbWFyeSBjb250YWluZXIgYWZ0ZXIgc2tpcCcpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeUl0ZW0gPSBzdW1tYXJ5Py5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWl0ZW0nKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5SXRlbSwgJ1Nob3VsZCBoYXZlIHN1bW1hcnkgaXRlbSBmb3IgdGhlIHF1ZXN0aW9uJyk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5VmFsdWUgPSBzdW1tYXJ5SXRlbT8ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXItdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5VmFsdWU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnZGVmYXVsdCBhbnN3ZXInKSwgJ1N1bW1hcnkgc2hvdWxkIHNob3cgdGhlIGRlZmF1bHQgYW5zd2VyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBza2lwcGVkIG1lc3NhZ2UgYWZ0ZXIgaWdub3JlKCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5pZ25vcmUoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC11c2VkJyksICdTaG91bGQgaGF2ZSB1c2VkIGNsYXNzJyk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtc3VtbWFyeScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnksICdTaG91bGQgc2hvdyBzdW1tYXJ5IGNvbnRhaW5lciBhZnRlciBpZ25vcmUnKTtcblx0XHRcdGNvbnN0IHNraXBwZWRNZXNzYWdlID0gc3VtbWFyeT8ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1za2lwcGVkJyk7XG5cdFx0XHRhc3NlcnQub2soc2tpcHBlZE1lc3NhZ2UsICdTaG91bGQgc2hvdyBza2lwcGVkIG1lc3NhZ2Ugd2hlbiBpZ25vcmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIHN1bW1hcnkgd2hlbiBjb25zdHJ1Y3RlZCB3aXRoIGlzVXNlZCBhbmQgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgPSB7XG5cdFx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyxcblx0XHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdFx0XSxcblx0XHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGRhdGE6IHsgcTE6ICdzYXZlZCBhbnN3ZXInIH1cblx0XHRcdH07XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXVzZWQnKSwgJ1Nob3VsZCBoYXZlIHVzZWQgY2xhc3MnKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1zdW1tYXJ5Jyk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeSwgJ1Nob3VsZCBzaG93IHN1bW1hcnkgY29udGFpbmVyIHdoZW4gaXNVc2VkIGlzIHRydWUnKTtcblx0XHRcdGNvbnN0IHN1bW1hcnlWYWx1ZSA9IHN1bW1hcnk/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktYW5zd2VyLXRpdGxlJyk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeVZhbHVlPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ3NhdmVkIGFuc3dlcicpLCAnU3VtbWFyeSBzaG91bGQgc2hvdyBzYXZlZCBhbnN3ZXIgZnJvbSBkYXRhJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGNvbnZlcnNhdGlvbmFsIHN1bW1hcnkgd2l0aCBleHBhbmRhYmxlIHNlbGVjdGVkIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW3tcblx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHR0aXRsZTogJ1doYXQgc2hvdWxkIHdlIHByaW9yaXRpemUgaWYgdGhlIHJlZmFjdG9yIGFmZmVjdHMgbXVsdGlwbGUgcGxhdGZvcm1zIGFuZCBtYXkgcmVxdWlyZSBtaWdyYXRpb24gd29yaz8nLFxuXHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ2ZpeCcsIGxhYmVsOiAnRml4IGEgYnVnJywgdmFsdWU6ICdmaXgnIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2ZlYXR1cmUnLCBsYWJlbDogJ0ltcGxlbWVudCBhIGZlYXR1cmUnLCB2YWx1ZTogJ2ZlYXR1cmUnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCB7IHExOiB7IHNlbGVjdGVkVmFsdWU6ICdmaXgnIH0gfSwgdHJ1ZSk7XG5cdFx0XHRjYXJvdXNlbC5hbnN3ZXJQcmVzZW50YXRpb24gPSAnY29udmVyc2F0aW9uJztcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbC50b0pTT04oKSk7XG5cblx0XHRcdGNvbnN0IHF1ZXN0aW9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1xdWVzdGlvbicpO1xuXHRcdFx0Y29uc3QgYW5zd2VyQnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tYW5zd2VyLWNvbGxhcHNpYmxlIC5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0YXNzZXJ0Lm9rKHF1ZXN0aW9uICYmIGFuc3dlckJ1dHRvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1vcHRpb24tbGlzdCcpLCBudWxsKTtcblx0XHRcdGFuc3dlckJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cXVlc3Rpb246IHF1ZXN0aW9uLnRleHRDb250ZW50LFxuXHRcdFx0XHRxdWVzdGlvbkV4cGFuZGFibGU6IHF1ZXN0aW9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLFxuXHRcdFx0XHRhbnN3ZXI6IGFuc3dlckJ1dHRvbi50ZXh0Q29udGVudCxcblx0XHRcdFx0YW5zd2VyRXhwYW5kZWQ6IGFuc3dlckJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSxcblx0XHRcdFx0YW5zd2VySWNvbjogYW5zd2VyQnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktYW5zd2VyLWljb24nKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLWNvbW1lbnQnKSxcblx0XHRcdFx0aGFzQ2hldnJvbjogISFhbnN3ZXJCdXR0b24ucXVlcnlTZWxlY3RvcignLmNoYXQtY29sbGFwc2libGUtaG92ZXItY2hldnJvbicpLFxuXHRcdFx0XHRvcHRpb25zVGl0bGU6IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9ucy10aXRsZScpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0b3B0aW9uczogQXJyYXkuZnJvbSh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbicpKS5tYXAob3B0aW9uID0+ICh7XG5cdFx0XHRcdFx0bGFiZWw6IG9wdGlvbi5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi1sYWJlbCcpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0XHRzZWxlY3RlZDogb3B0aW9uLmNsYXNzTGlzdC5jb250YWlucygnc2VsZWN0ZWQnKSxcblx0XHRcdFx0XHRoYXNDb21wYWN0Q2hlY2s6ICEhb3B0aW9uLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLXNlbGVjdGVkIC5jb2RpY29uLWNoZWNrLWNvbXBhY3QnKSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRxdWVzdGlvbjogJ1F1ZXN0aW9uOiBXaGF0IHNob3VsZCB3ZSBwcmlvcml0aXplIGlmIHRoZSByZWZhY3RvciBhZmZlY3RzIG11bHRpcGxlIHBsYXRmb3JtcyBhbmQgbWF5IHJlcXVpcmUgbWlncmF0aW9uIHdvcms/Jyxcblx0XHRcdFx0YW5zd2VyOiAnQW5zd2VyZWQ6IEZpeCBhIGJ1ZycsXG5cdFx0XHRcdHF1ZXN0aW9uRXhwYW5kYWJsZTogZmFsc2UsXG5cdFx0XHRcdGFuc3dlckV4cGFuZGVkOiAndHJ1ZScsXG5cdFx0XHRcdGFuc3dlckljb246IHRydWUsXG5cdFx0XHRcdGhhc0NoZXZyb246IHRydWUsXG5cdFx0XHRcdG9wdGlvbnNUaXRsZTogJ09wdGlvbnMnLFxuXHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJ0ZpeCBhIGJ1ZycsIHNlbGVjdGVkOiB0cnVlLCBoYXNDb21wYWN0Q2hlY2s6IHRydWUgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnSW1wbGVtZW50IGEgZmVhdHVyZScsIHNlbGVjdGVkOiBmYWxzZSwgaGFzQ29tcGFjdENoZWNrOiBmYWxzZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGEgbm9uLWludGVyYWN0aXZlIGNvbGxhcHNpYmxlIGhlYWRlciBmb3IgZnJlZSByZXNwb25zZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW3tcblx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0dGl0bGU6ICdXaGF0IHdvdWxkIHlvdSBsaWtlIG1lIHRvIGhlbHAgeW91IHdpdGg/Jyxcblx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsIHsgcTE6ICdSZXZpZXcgdGhlIGNoYW5nZXMnIH0sIHRydWUpO1xuXHRcdFx0Y2Fyb3VzZWwuYW5zd2VyUHJlc2VudGF0aW9uID0gJ2NvbnZlcnNhdGlvbic7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwudG9KU09OKCkpO1xuXG5cdFx0XHRjb25zdCBhbnN3ZXJCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1hbnN3ZXItY29sbGFwc2libGUgLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YW5zd2VyOiBhbnN3ZXJCdXR0b24/LnRleHRDb250ZW50LFxuXHRcdFx0XHRkaXNhYmxlZDogYW5zd2VyQnV0dG9uPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdFx0dGFiSW5kZXg6IGFuc3dlckJ1dHRvbj8udGFiSW5kZXgsXG5cdFx0XHRcdGV4cGFuZGVkOiBhbnN3ZXJCdXR0b24/LmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLFxuXHRcdFx0XHRoYXNDaGV2cm9uOiAhIWFuc3dlckJ1dHRvbj8ucXVlcnlTZWxlY3RvcignLmNoYXQtY29sbGFwc2libGUtaG92ZXItY2hldnJvbicpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhbnN3ZXI6ICdBbnN3ZXJlZDogUmV2aWV3IHRoZSBjaGFuZ2VzJyxcblx0XHRcdFx0ZGlzYWJsZWQ6ICd0cnVlJyxcblx0XHRcdFx0dGFiSW5kZXg6IC0xLFxuXHRcdFx0XHRleHBhbmRlZDogbnVsbCxcblx0XHRcdFx0aGFzQ2hldnJvbjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIHNraXBwZWQgbWVzc2FnZSB3aGVuIGNvbnN0cnVjdGVkIHdpdGggaXNVc2VkIGJ1dCBubyBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCA9IHtcblx0XHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRhbGxvd1NraXA6IHRydWUsXG5cdFx0XHRcdGlzVXNlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtdXNlZCcpLCAnU2hvdWxkIGhhdmUgdXNlZCBjbGFzcycpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnknKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LCAnU2hvdWxkIHNob3cgc3VtbWFyeSBjb250YWluZXInKTtcblx0XHRcdGNvbnN0IHNraXBwZWRNZXNzYWdlID0gc3VtbWFyeT8ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1za2lwcGVkJyk7XG5cdFx0XHRhc3NlcnQub2soc2tpcHBlZE1lc3NhZ2UsICdTaG91bGQgc2hvdyBza2lwcGVkIG1lc3NhZ2Ugd2hlbiBubyBkYXRhJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGEgc2tpcHBlZCBjb252ZXJzYXRpb25hbCBxdWVzdGlvbiB3aXRoIGl0cyBvcHRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCA9IHtcblx0XHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdXaGljaCBlbnZpcm9ubWVudD8nLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdzdGFnaW5nJywgbGFiZWw6ICdTdGFnaW5nJywgdmFsdWU6ICdzdGFnaW5nJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ3Byb2R1Y3Rpb24nLCBsYWJlbDogJ1Byb2R1Y3Rpb24nLCB2YWx1ZTogJ3Byb2R1Y3Rpb24nIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGFsbG93U2tpcDogdHJ1ZSxcblx0XHRcdFx0aXNVc2VkOiB0cnVlLFxuXHRcdFx0XHRhbnN3ZXJQcmVzZW50YXRpb246ICdjb252ZXJzYXRpb24nLFxuXHRcdFx0fTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGFuc3dlckJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWFuc3dlci1jb2xsYXBzaWJsZSAubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhhbnN3ZXJCdXR0b24pO1xuXHRcdFx0YW5zd2VyQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cXVlc3Rpb246IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktcXVlc3Rpb24nKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFuc3dlcjogYW5zd2VyQnV0dG9uLnRleHRDb250ZW50LFxuXHRcdFx0XHRhbnN3ZXJJY29uOiBhbnN3ZXJCdXR0b24ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXItaWNvbicpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24tY2xvc2UtY29tcGFjdCcpLFxuXHRcdFx0XHRoYXNDaGV2cm9uOiAhIWFuc3dlckJ1dHRvbi5xdWVyeVNlbGVjdG9yKCcuY2hhdC1jb2xsYXBzaWJsZS1ob3Zlci1jaGV2cm9uJyksXG5cdFx0XHRcdG9wdGlvbnM6IEFycmF5LmZyb20od2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1vcHRpb24tbGFiZWwnKSkubWFwKG9wdGlvbiA9PiBvcHRpb24udGV4dENvbnRlbnQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRxdWVzdGlvbjogJ1F1ZXN0aW9uOiBXaGljaCBlbnZpcm9ubWVudD8nLFxuXHRcdFx0XHRhbnN3ZXI6ICdTa2lwcGVkIHF1ZXN0aW9uJyxcblx0XHRcdFx0YW5zd2VySWNvbjogdHJ1ZSxcblx0XHRcdFx0aGFzQ2hldnJvbjogdHJ1ZSxcblx0XHRcdFx0b3B0aW9uczogWydTdGFnaW5nJywgJ1Byb2R1Y3Rpb24nXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgYW5zd2VyZWQgbWVzc2FnZSB3aGVuIGFuc3dlcmVkRXh0ZXJuYWxseSBidXQgbm8gZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgPSB7XG5cdFx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyxcblx0XHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdFx0XSxcblx0XHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGFuc3dlcmVkRXh0ZXJuYWxseTogdHJ1ZSxcblx0XHRcdFx0YW5zd2VyUHJlc2VudGF0aW9uOiAnY29udmVyc2F0aW9uJyxcblx0XHRcdH07XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXVzZWQnKSwgJ1Nob3VsZCBoYXZlIHVzZWQgY2xhc3MnKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1zdW1tYXJ5Jyk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeSwgJ1Nob3VsZCBzaG93IHN1bW1hcnkgY29udGFpbmVyJyk7XG5cdFx0XHRhc3NlcnQub2soIXN1bW1hcnk/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktc2tpcHBlZCcpLCAnU2hvdWxkIG5vdCBzaG93IHNraXBwZWQgbWVzc2FnZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnk/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktYW5zd2VyZWQnKSwgJ1Nob3VsZCBzaG93IGFuc3dlcmVkIG1lc3NhZ2Ugd2hlbiBhbnN3ZXJlZCBleHRlcm5hbGx5Jyk7XG5cdFx0XHRhc3NlcnQub2soIXN1bW1hcnk/LnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uLWNvcGlsb3QtY29tcGFjdCcpLCAnU2hvdWxkIG5vdCBwcmVzZW50IGEgZ2VuZXJpYyBleHRlcm5hbCBhbnN3ZXIgYXMgYW4gYXV0b21hdGljIHJlcGx5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGEgQ29waWxvdCBpY29uIGZvciBhIHN0cnVjdHVyZWQgYXV0b21hdGljIGFuc3dlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgPSB7XG5cdFx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyxcblx0XHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1doYXQgc2hvdWxkIHdlIHdvcmsgb24gbmV4dD8nIH1cblx0XHRcdFx0XSxcblx0XHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGFuc3dlcmVkRXh0ZXJuYWxseTogdHJ1ZSxcblx0XHRcdFx0YXV0b1JlcGx5OiB0cnVlLFxuXHRcdFx0XHRhbnN3ZXJQcmVzZW50YXRpb246ICdjb252ZXJzYXRpb24nLFxuXHRcdFx0XHRkYXRhOiB7IHExOiBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIgfSxcblx0XHRcdH07XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cXVlc3Rpb246IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktcXVlc3Rpb24nKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFuc3dlcjogd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tYW5zd2VyLWNvbGxhcHNpYmxlIC5tb25hY28tYnV0dG9uJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRhbnN3ZXJJY29uOiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlci1pY29uJyk/LmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1jb3BpbG90LWNvbXBhY3QnKSxcblx0XHRcdFx0aGFzR2VuZXJpY01lc3NhZ2U6ICEhd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXJlZCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRxdWVzdGlvbjogJ1F1ZXN0aW9uOiBXaGF0IHNob3VsZCB3ZSB3b3JrIG9uIG5leHQ/Jyxcblx0XHRcdFx0YW5zd2VyOiBgQW5zd2VyZWQ6ICR7QWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyfWAsXG5cdFx0XHRcdGFuc3dlckljb246IHRydWUsXG5cdFx0XHRcdGhhc0dlbmVyaWNNZXNzYWdlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRGVzY3JpcHRpb24gYW5kIE1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVuZGVycyBxdWVzdGlvbiBkZXNjcmlwdGlvbiB3aGVuIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnRW1haWwnLCBkZXNjcmlwdGlvbjogJ0VudGVyIHlvdXIgZW1haWwgYWRkcmVzcycgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBkZXNjID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tZGVzY3JpcHRpb24nKTtcblx0XHRcdGFzc2VydC5vayhkZXNjLCAnRGVzY3JpcHRpb24gZWxlbWVudCBzaG91bGQgYmUgcmVuZGVyZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNjPy50ZXh0Q29udGVudCwgJ0VudGVyIHlvdXIgZW1haWwgYWRkcmVzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmVuZGVyIGRlc2NyaXB0aW9uIGVsZW1lbnQgd2hlbiBub3QgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdOYW1lJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGRlc2MgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1kZXNjcmlwdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2MsIG51bGwsICdEZXNjcmlwdGlvbiBlbGVtZW50IHNob3VsZCBub3QgZXhpc3Qgd2hlbiBub3QgcHJvdmlkZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY2Fyb3VzZWwtbGV2ZWwgbWVzc2FnZSBvbiBmaXJzdCBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdFbWFpbCcgfVxuXHRcdFx0XSk7XG5cdFx0XHRjYXJvdXNlbC5tZXNzYWdlID0gJ1BsZWFzZSBmaWxsIGluIHRoZSBmb2xsb3dpbmc6Jztcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1tZXNzYWdlJyk7XG5cdFx0XHRhc3NlcnQub2sobWVzc2FnZSwgJ0Nhcm91c2VsIG1lc3NhZ2Ugc2hvdWxkIGJlIHJlbmRlcmVkJyk7XG5cdFx0XHRhc3NlcnQub2sobWVzc2FnZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdQbGVhc2UgZmlsbCBpbiB0aGUgZm9sbG93aW5nOicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY2Fyb3VzZWwtbGV2ZWwgbWVzc2FnZSBhcyBtYXJrZG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y2Fyb3VzZWwubWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygnKipJbXBvcnRhbnQ6KiogRmlsbCB0aGlzIGZvcm0nKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1tZXNzYWdlJyk7XG5cdFx0XHRhc3NlcnQub2sobWVzc2FnZSwgJ0Nhcm91c2VsIG1lc3NhZ2Ugc2hvdWxkIGJlIHJlbmRlcmVkJyk7XG5cdFx0XHRhc3NlcnQub2sobWVzc2FnZT8ucXVlcnlTZWxlY3RvcignLnJlbmRlcmVkLW1hcmtkb3duJyksICdNZXNzYWdlIHNob3VsZCBiZSByZW5kZXJlZCBhcyBtYXJrZG93bicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgcmVxdWlyZWQgaW5kaWNhdG9yIG9uIHJlcXVpcmVkIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnLCByZXF1aXJlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCcqJyksICdSZXF1aXJlZCBpbmRpY2F0b3IgKCopIHNob3VsZCBiZSBzaG93bicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2hvdyByZXF1aXJlZCBpbmRpY2F0b3Igb24gb3B0aW9uYWwgcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmlja25hbWUnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlPy50ZXh0Q29udGVudCk7XG5cdFx0XHRhc3NlcnQub2soIXRpdGxlPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJyonKSwgJ1JlcXVpcmVkIGluZGljYXRvciBzaG91bGQgbm90IGJlIHNob3duJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdWYWxpZGF0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmRlcnMgdmFsaWRhdGlvbiBtZXNzYWdlIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdFbWFpbCcsXG5cdFx0XHRcdFx0dmFsaWRhdGlvbjogeyBmb3JtYXQ6ICdlbWFpbCcgfVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHZhbGlkYXRpb25Nc2cgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi12YWxpZGF0aW9uLW1lc3NhZ2UnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGlvbk1zZywgJ1ZhbGlkYXRpb24gbWVzc2FnZSBlbGVtZW50IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRpb25Nc2c/LnN0eWxlLmRpc3BsYXksICdub25lJywgJ1ZhbGlkYXRpb24gbWVzc2FnZSBzaG91bGQgYmUgaGlkZGVuIGluaXRpYWxseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmxvY2tzIHN1Ym1pdCBvbiByZXF1aXJlZCBlbXB0eSB0ZXh0IGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmFtZScsIHJlcXVpcmVkOiB0cnVlIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gVHJ5IHRvIHN1Ym1pdCB3aXRob3V0IGVudGVyaW5nIGEgdmFsdWVcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhzdWJtaXRCdXR0b24sICdTdWJtaXQgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdC8vIFNob3VsZCBzaG93IHZhbGlkYXRpb24gZXJyb3IgYW5kIG5vdCBzdWJtaXRcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25Nc2cgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi12YWxpZGF0aW9uLW1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0aW9uTXNnPy50ZXh0Q29udGVudCwgJ1ZhbGlkYXRpb24gZXJyb3Igc2hvdWxkIGJlIHNob3duJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ1Nob3VsZCBub3QgaGF2ZSBzdWJtaXR0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25leHQgYnV0dG9uIGlzIGRpc2FibGVkIHdoZW4gcmVxdWlyZWQgdGV4dCBmaWVsZCBpcyBlbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnLCByZXF1aXJlZDogdHJ1ZSB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnQWdlJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdC8vIE5leHQgYnV0dG9uIHNob3VsZCBiZSBkaXNhYmxlZCBzaW5jZSByZXF1aXJlZCBmaWVsZCBoYXMgbm8gYW5zd2VyXG5cdFx0XHRjb25zdCBuZXh0QnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tbmF2LW5leHQnKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhuZXh0QnV0dG9uLCAnTmV4dCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sobmV4dEJ1dHRvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksICdOZXh0IGJ1dHRvbiBzaG91bGQgYmUgZGlzYWJsZWQgd2hlbiByZXF1aXJlZCBmaWVsZCBpcyBlbXB0eScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dzIHN1Ym1pdCBvbiByZXF1aXJlZCBmaWVsZCB3aXRoIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmFtZScsIHJlcXVpcmVkOiB0cnVlIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gRW50ZXIgYSB2YWx1ZSBpbiB0aGUgdGV4dCBpbnB1dFxuXHRcdFx0Y29uc3QgaW5wdXRCb3ggPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWlucHV0Ym94IGlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhpbnB1dEJveCwgJ0lucHV0IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0aW5wdXRCb3gudmFsdWUgPSAnSm9obic7XG5cdFx0XHRpbnB1dEJveC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHQvLyBTdWJtaXRcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyAhPT0gbnVsbCwgJ1Nob3VsZCBoYXZlIHN1Ym1pdHRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIHJlcXVpcmVkIGZpZWxkIGFjcm9zcyBxdWVzdGlvbnMgb24gc3VibWl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnT3B0aW9uYWwnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdSZXF1aXJlZCcsIHJlcXVpcmVkOiB0cnVlIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gTmF2aWdhdGUgdG8gcTIgd2l0aG91dCBmaWxsaW5nIHExIChvcHRpb25hbCwgc28gYWxsb3dlZClcblx0XHRcdHdpZGdldC5uYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk7XG5cblx0XHRcdC8vIEdvIGJhY2sgdG8gcTEgYW5kIHRyeSB0byBzdWJtaXQgKHEyIHJlcXVpcmVkIGJ1dCBlbXB0eSlcblx0XHRcdHdpZGdldC5uYXZpZ2F0ZVRvUHJldmlvdXNRdWVzdGlvbigpO1xuXG5cdFx0XHQvLyBDbWQrRW50ZXIgc2hvdWxkIGNoZWNrIGFsbCByZXF1aXJlZCBmaWVsZHNcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGlmIChzdWJtaXRCdXR0b24pIHtcblx0XHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNob3VsZCBub3Qgc3VibWl0IGJlY2F1c2UgcTIgaXMgcmVxdWlyZWQgYnV0IGVtcHR5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ1Nob3VsZCBub3Qgc3VibWl0IHdoZW4gcmVxdWlyZWQgZmllbGQgaXMgZW1wdHknKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGdDQUE4RDtBQUd2RSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLG1CQUFtQixXQUErQyxZQUFxQixNQUE2QjtBQUM1SCxTQUFPO0FB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
