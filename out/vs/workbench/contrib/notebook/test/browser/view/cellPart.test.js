import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CodeCellLayout } from "../../../browser/view/cellParts/codeCell.js";
suite("CellPart", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("CodeCellLayout editor visibility states", () => {
    const DEFAULT_ELEMENT_TOP = 100;
    const DEFAULT_ELEMENT_HEIGHT = 900;
    const STATUSBAR = 22;
    const TOP_MARGIN = 6;
    const OUTLINE = 1;
    const scenarios = [
      {
        name: "Full",
        scrollTop: 0,
        viewportHeight: 400,
        editorContentHeight: 300,
        editorHeight: 300,
        outputContainerOffset: 300,
        // editorBottom = 100 + 300 = 400, fully inside viewport (scrollBottom=400)
        expected: "Full",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 0,
        expectedEditorScrollTop: 0
      },
      {
        name: "Bottom Clipped",
        scrollTop: 0,
        viewportHeight: 350,
        // scrollBottom=350 < editorBottom(400)
        editorContentHeight: 300,
        editorHeight: 300,
        outputContainerOffset: 300,
        expected: "Bottom Clipped",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 0,
        expectedEditorScrollTop: 0
      },
      {
        name: "Full (Small Viewport)",
        scrollTop: DEFAULT_ELEMENT_TOP + TOP_MARGIN + 20,
        // scrolled into the cell body
        viewportHeight: 220,
        // small vs content
        editorContentHeight: 500,
        // larger than viewport so we clamp
        editorHeight: 500,
        outputContainerOffset: 600,
        // editorBottom=700 > scrollBottom
        expected: "Full (Small Viewport)",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 19,
        // (scrollTop - elementTop - topMargin - outlineWidth) = (100+6+20 -100 -6 -1)
        expectedEditorScrollTop: 19
      },
      {
        name: "Top Clipped",
        scrollTop: DEFAULT_ELEMENT_TOP + TOP_MARGIN + 40,
        // scrolled further down but not past bottom
        viewportHeight: 600,
        // larger than content height below (forces branch for Top Clipped)
        editorContentHeight: 200,
        editorHeight: 200,
        outputContainerOffset: 450,
        // editorBottom=550; scrollBottom= scrollTop+viewportHeight = > 550?  (540+600=1140) but we only need scrollTop < editorBottom
        expected: "Top Clipped",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 39,
        // (100+6+40 -100 -6 -1)
        expectedEditorScrollTop: 40
        // contentHeight(200) - computed height(160)
      },
      {
        name: "Invisible",
        scrollTop: DEFAULT_ELEMENT_TOP + 1e3,
        // well below editor bottom
        viewportHeight: 400,
        editorContentHeight: 300,
        editorHeight: 300,
        outputContainerOffset: 300,
        // editorBottom=400 < scrollTop
        expected: "Invisible",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 278,
        // adjusted after ensuring minimum line height when possibleEditorHeight < LINE_HEIGHT
        expectedEditorScrollTop: 279
        // contentHeight(300) - clamped height(21)
      }
    ];
    for (const s of scenarios) {
      const editorScrollState = { scrollTop: 0 };
      const stubEditor = {
        layoutCalls: [],
        _lastScrollTopSet: -1,
        getLayoutInfo: () => ({ width: 600, height: s.editorHeight }),
        getContentHeight: () => s.editorContentHeight,
        layout: (dim) => {
          stubEditor.layoutCalls.push(dim);
        },
        setScrollTop: (v) => {
          editorScrollState.scrollTop = v;
          stubEditor._lastScrollTopSet = v;
        },
        hasModel: () => true
      };
      const editorPart = { style: { top: "" } };
      const template = {
        editor: stubEditor,
        editorPart
      };
      const viewCell = {
        isInputCollapsed: false,
        layoutInfo: {
          // values referenced in layout logic
          statusBarHeight: STATUSBAR,
          topMargin: TOP_MARGIN,
          outlineWidth: OUTLINE,
          editorHeight: s.editorHeight,
          outputContainerOffset: s.outputContainerOffset
        }
      };
      let scrollBottom = s.scrollTop + s.viewportHeight;
      const notebookEditor = {
        scrollTop: s.scrollTop,
        get scrollBottom() {
          return scrollBottom;
        },
        setScrollTop: (v) => {
          notebookEditor.scrollTop = v;
          scrollBottom = v + s.viewportHeight;
        },
        getLayoutInfo: () => ({
          fontInfo: { lineHeight: 21 },
          height: s.viewportHeight,
          stickyHeight: 0
        }),
        getAbsoluteTopOfElement: () => s.elementTop,
        getAbsoluteBottomOfElement: () => s.elementTop + s.outputContainerOffset,
        getHeightOfElement: () => s.elementHeight,
        notebookOptions: {
          getLayoutConfiguration: () => ({ editorTopPadding: 6 })
        }
      };
      const layout = new CodeCellLayout(
        /* enabled */
        true,
        notebookEditor,
        viewCell,
        template,
        {
          debug: () => {
          }
        },
        { width: 600, height: s.editorHeight }
      );
      layout.layoutEditor("init");
      assert.strictEqual(
        layout.editorVisibility,
        s.expected,
        `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected visibility ${s.expected} but got ${layout.editorVisibility}`
      );
      const actualTop = parseInt(
        (editorPart.style.top || "0").replace(/px$/, "")
      );
      assert.strictEqual(
        actualTop,
        s.expectedTop,
        `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected top ${s.expectedTop}px but got ${editorPart.style.top}`
      );
      assert.strictEqual(
        stubEditor._lastScrollTopSet,
        s.expectedEditorScrollTop,
        `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected editor.setScrollTop(${s.expectedEditorScrollTop}) but got ${stubEditor._lastScrollTopSet}`
      );
      if (s.expected !== "Invisible") {
        assert.notStrictEqual(
          editorPart.style.top,
          "",
          `Scenario '${s.name}' should set a top style value`
        );
      } else {
        assert.ok(
          editorPart.style.top !== void 0,
          "Invisible scenario still performs a layout"
        );
      }
    }
  });
  test("Scrolling", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 300;
    const ELEMENT_TOP = 100;
    const EDITOR_CONTENT_HEIGHT = 800;
    const EDITOR_HEIGHT = EDITOR_CONTENT_HEIGHT;
    const OUTPUT_CONTAINER_OFFSET = 800;
    const ELEMENT_HEIGHT = 1200;
    function clamp(v, min, max) {
      return Math.min(Math.max(v, min), max);
    }
    function computeExpected(scrollTop) {
      const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
      const viewportHeight = VIEWPORT_HEIGHT;
      const editorBottom = ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET;
      let top = Math.max(
        0,
        scrollTop - ELEMENT_TOP - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH
      );
      const possibleEditorHeight = EDITOR_HEIGHT - top;
      if (possibleEditorHeight < LINE_HEIGHT) {
        top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
      }
      let height = EDITOR_CONTENT_HEIGHT;
      let visibility = "Full";
      let editorScrollTop = 0;
      if (scrollTop <= ELEMENT_TOP + CELL_TOP_MARGIN) {
        const minimumEditorHeight = LINE_HEIGHT + 6;
        if (scrollBottom >= editorBottom) {
          height = clamp(
            EDITOR_CONTENT_HEIGHT,
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT
          );
          visibility = "Full";
        } else {
          height = clamp(
            scrollBottom - (ELEMENT_TOP + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT,
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT
          ) + 2 * CELL_OUTLINE_WIDTH;
          visibility = "Bottom Clipped";
          editorScrollTop = 0;
        }
      } else {
        if (viewportHeight <= EDITOR_CONTENT_HEIGHT && scrollBottom <= editorBottom) {
          const minimumEditorHeight = LINE_HEIGHT + 6;
          height = clamp(
            viewportHeight - STATUSBAR_HEIGHT,
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT - STATUSBAR_HEIGHT
          ) + 2 * CELL_OUTLINE_WIDTH;
          visibility = "Full (Small Viewport)";
          editorScrollTop = top;
        } else {
          const minimumEditorHeight = LINE_HEIGHT;
          height = clamp(
            EDITOR_CONTENT_HEIGHT - (scrollTop - (ELEMENT_TOP + CELL_TOP_MARGIN)),
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT
          );
          if (scrollTop > editorBottom) {
            visibility = "Invisible";
          } else {
            visibility = "Top Clipped";
          }
          editorScrollTop = EDITOR_CONTENT_HEIGHT - height;
        }
      }
      return { top, visibility, editorScrollTop };
    }
    for (let scrollTop = 0; scrollTop <= VIEWPORT_HEIGHT + OUTPUT_CONTAINER_OFFSET + 20; scrollTop++) {
      const expected = computeExpected(scrollTop);
      const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
      const stubEditor = {
        _lastScrollTopSet: -1,
        getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
        getContentHeight: () => EDITOR_CONTENT_HEIGHT,
        layout: () => {
        },
        setScrollTop: (v) => {
          stubEditor._lastScrollTopSet = v;
        },
        hasModel: () => true
      };
      const editorPart = { style: { top: "" } };
      const template = {
        editor: stubEditor,
        editorPart
      };
      const viewCell = {
        isInputCollapsed: false,
        layoutInfo: {
          statusBarHeight: STATUSBAR_HEIGHT,
          topMargin: CELL_TOP_MARGIN,
          outlineWidth: CELL_OUTLINE_WIDTH,
          editorHeight: EDITOR_HEIGHT,
          outputContainerOffset: OUTPUT_CONTAINER_OFFSET
        }
      };
      const notebookEditor = {
        scrollTop,
        get scrollBottom() {
          return scrollBottom;
        },
        setScrollTop: (v) => {
        },
        getLayoutInfo: () => ({
          fontInfo: { lineHeight: LINE_HEIGHT },
          height: VIEWPORT_HEIGHT,
          stickyHeight: 0
        }),
        getAbsoluteTopOfElement: () => ELEMENT_TOP,
        getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
        getHeightOfElement: () => ELEMENT_HEIGHT,
        notebookOptions: {
          getLayoutConfiguration: () => ({ editorTopPadding: 6 })
        }
      };
      const layout = new CodeCellLayout(
        true,
        notebookEditor,
        viewCell,
        template,
        { debug: () => {
        } },
        { width: 600, height: EDITOR_HEIGHT }
      );
      layout.layoutEditor("nbDidScroll");
      const actualTop = parseInt(
        (editorPart.style.top || "0").replace(/px$/, "")
      );
      assert.strictEqual(
        actualTop,
        expected.top,
        `scrollTop=${scrollTop}: expected top ${expected.top}, got ${actualTop}`
      );
      assert.strictEqual(
        layout.editorVisibility,
        expected.visibility,
        `scrollTop=${scrollTop}: expected visibility ${expected.visibility}, got ${layout.editorVisibility}`
      );
      assert.strictEqual(
        stubEditor._lastScrollTopSet,
        expected.editorScrollTop,
        `scrollTop=${scrollTop}: expected editorScrollTop ${expected.editorScrollTop}, got ${stubEditor._lastScrollTopSet}`
      );
    }
  });
  test("CodeCellLayout reuses content height after init", () => {
    const LINE_HEIGHT = 21;
    const STATUSBAR_HEIGHT = 22;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const VIEWPORT_HEIGHT = 1e3;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 1200;
    const OUTPUT_CONTAINER_OFFSET = 300;
    const EDITOR_HEIGHT = 800;
    let contentHeight = 800;
    const stubEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
      getContentHeight: () => contentHeight,
      layout: (dim) => {
        stubEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: EDITOR_HEIGHT,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const notebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: EDITOR_HEIGHT }
    );
    layout.layoutEditor("init");
    assert.strictEqual(layout.editorVisibility, "Full");
    assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, 800);
    contentHeight = 200;
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(layout.editorVisibility, "Full");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      800,
      "nbDidScroll should reuse the established content height"
    );
    layout.layoutEditor("onDidContentSizeChange");
    assert.strictEqual(layout.editorVisibility, "Full");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      200,
      "onDidContentSizeChange should refresh the content height"
    );
  });
  test("CodeCellLayout refreshes content height on viewCellLayoutChange", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 1e3;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 1200;
    const INITIAL_CONTENT_HEIGHT = 37;
    const OUTPUT_CONTAINER_OFFSET = 300;
    const UPDATED_CONTENT_HEIGHT = 200;
    let contentHeight = INITIAL_CONTENT_HEIGHT;
    const stubEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: INITIAL_CONTENT_HEIGHT }),
      getContentHeight: () => contentHeight,
      layout: (dim) => {
        stubEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: INITIAL_CONTENT_HEIGHT,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const notebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: INITIAL_CONTENT_HEIGHT }
    );
    layout.layoutEditor("init");
    assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, INITIAL_CONTENT_HEIGHT);
    contentHeight = UPDATED_CONTENT_HEIGHT;
    layout.layoutEditor("viewCellLayoutChange");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      UPDATED_CONTENT_HEIGHT,
      "viewCellLayoutChange should refresh the content height"
    );
    contentHeight = 50;
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      UPDATED_CONTENT_HEIGHT,
      "nbDidScroll should reuse the refreshed content height"
    );
  });
  test("CodeCellLayout maintains content height after paste when scrolling", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 1e3;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 1200;
    const INITIAL_CONTENT_HEIGHT = 37;
    const INITIAL_EDITOR_HEIGHT = INITIAL_CONTENT_HEIGHT;
    const OUTPUT_CONTAINER_OFFSET = 300;
    const PASTED_CONTENT_HEIGHT = 679;
    let contentHeight = INITIAL_CONTENT_HEIGHT;
    const stubEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: INITIAL_EDITOR_HEIGHT }),
      getContentHeight: () => contentHeight,
      layout: (dim) => {
        stubEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const layoutInfo = {
      statusBarHeight: STATUSBAR_HEIGHT,
      topMargin: CELL_TOP_MARGIN,
      outlineWidth: CELL_OUTLINE_WIDTH,
      editorHeight: INITIAL_EDITOR_HEIGHT,
      outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
      editorWidth: 600
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo
    };
    const notebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return notebookEditor.scrollTop + VIEWPORT_HEIGHT;
      },
      setScrollTop: (v) => {
        notebookEditor.scrollTop = v;
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: INITIAL_EDITOR_HEIGHT }
    );
    layout.layoutEditor("init");
    contentHeight = PASTED_CONTENT_HEIGHT;
    layoutInfo.editorHeight = PASTED_CONTENT_HEIGHT;
    layout.layoutEditor("onDidContentSizeChange");
    contentHeight = 39;
    notebookEditor.scrollTop = 200;
    layout.layoutEditor("nbDidScroll");
    const finalHeight = stubEditor.layoutCalls.at(-1)?.height;
    assert.notStrictEqual(
      finalHeight,
      39,
      "Should not use Monaco's transient value (39px)"
    );
    assert.notStrictEqual(
      finalHeight,
      37,
      "Should not use initial content height (37px)"
    );
    assert.ok(
      finalHeight && finalHeight > 100,
      `Layout height (${finalHeight}px) should be calculated from established 679px content, not transient 39px or initial 37px`
    );
  });
  test("CodeCellLayout does not programmatically scroll editor while pointer down", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 220;
    const ELEMENT_TOP = 100;
    const EDITOR_CONTENT_HEIGHT = 500;
    const EDITOR_HEIGHT = EDITOR_CONTENT_HEIGHT;
    const OUTPUT_CONTAINER_OFFSET = 600;
    const ELEMENT_HEIGHT = 900;
    const scrollTop = ELEMENT_TOP + CELL_TOP_MARGIN + 20;
    const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
    const stubEditor = {
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
      getContentHeight: () => EDITOR_CONTENT_HEIGHT,
      layout: () => {
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: EDITOR_HEIGHT,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET
      }
    };
    const notebookEditor = {
      scrollTop,
      get scrollBottom() {
        return scrollBottom;
      },
      setScrollTop: (v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: EDITOR_HEIGHT }
    );
    layout.layoutEditor("init");
    stubEditor._lastScrollTopSet = -1;
    layout.setPointerDown(true);
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(layout.editorVisibility, "Full (Small Viewport)");
    assert.strictEqual(
      stubEditor._lastScrollTopSet,
      -1,
      "Expected no programmatic editor.setScrollTop while pointer is down"
    );
    layout.setPointerDown(false);
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(layout.editorVisibility, "Full (Small Viewport)");
    assert.notStrictEqual(
      stubEditor._lastScrollTopSet,
      -1,
      "Expected editor.setScrollTop to resume once pointer is released"
    );
  });
  test("CodeCellLayout init ignores stale pooled editor content height", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 400;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 500;
    const OUTPUT_CONTAINER_OFFSET = 200;
    let pooledContentHeight = 200;
    const pooledEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: pooledContentHeight }),
      getContentHeight: () => pooledContentHeight,
      layout: (dim) => {
        pooledEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        pooledEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: pooledEditor,
      editorPart
    };
    const tallViewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: 200,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const tallNotebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (_v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const tallLayout = new CodeCellLayout(
      true,
      tallNotebookEditor,
      tallViewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: 200 }
    );
    tallLayout.layoutEditor("init");
    assert.strictEqual(
      pooledEditor.layoutCalls.at(-1)?.height,
      200,
      "Expected tall cell to lay out using its own height"
    );
    pooledContentHeight = 200;
    const shortViewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: 37,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const shortNotebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (_v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const shortLayout = new CodeCellLayout(
      true,
      shortNotebookEditor,
      shortViewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: 37 }
    );
    shortLayout.layoutEditor("init");
    assert.strictEqual(
      pooledEditor.layoutCalls.at(-1)?.height,
      37,
      "Init layout for a short cell should use the cell's initial height, not the pooled editor's stale content height"
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci92aWV3L2NlbGxQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZpZXcvbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbExheW91dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY29kZUNlbGwuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENvZGVDZWxsTGF5b3V0SW5mbywgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5cbnN1aXRlKCdDZWxsUGFydCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnQ29kZUNlbGxMYXlvdXQgZWRpdG9yIHZpc2liaWxpdHkgc3RhdGVzJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIFdlIGNvbnN0cnVjdCBhIHZlcnkgc21hbGwgbW9jayBhcm91bmQgdGhlIHBhcnRzIHRoYXQgYENvZGVDZWxsTGF5b3V0YCB0b3VjaGVzLiBUaGUgZ29hbFxuXHRcdCAqIGlzIHRvIHZhbGlkYXRlIHRoZSBicmFuY2hpbmcgbG9naWMgdGhhdCBzZXRzIGBfZWRpdG9yVmlzaWJpbGl0eWAgd2l0aG91dCBtdXRhdGluZyBhbnlcblx0XHQgKiBwcm9kdWN0aW9uIGNvZGUuIEVhY2ggc2NlbmFyaW8gc2V0cyB1cCBnZW9tZXRyeSAmIHNjcm9sbCB2YWx1ZXMgdGhlbiBpbnZva2VzXG5cdFx0ICogYGxheW91dEVkaXRvcigpYCBhbmQgYXNzZXJ0cyB0aGUgcmVzdWx0aW5nIHZpc2liaWxpdHkgY2xhc3NpZmljYXRpb24uXG5cdFx0ICovXG5cblx0XHRpbnRlcmZhY2UgVGVzdFNjZW5hcmlvIHtcblx0XHRcdG5hbWU6IHN0cmluZztcblx0XHRcdHNjcm9sbFRvcDogbnVtYmVyO1xuXHRcdFx0dmlld3BvcnRIZWlnaHQ6IG51bWJlcjtcblx0XHRcdGVkaXRvckNvbnRlbnRIZWlnaHQ6IG51bWJlcjtcblx0XHRcdGVkaXRvckhlaWdodDogbnVtYmVyOyAvLyB2aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvckhlaWdodFxuXHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiBudW1iZXI7IC8vIGVsZW1lbnRUb3AgKyB0aGlzIG9mZnNldCA9PiBlZGl0b3JCb3R0b21cblx0XHRcdGV4cGVjdGVkOiBzdHJpbmc7IC8vIENvZGVDZWxsTGF5b3V0LmVkaXRvclZpc2liaWxpdHlcblx0XHRcdHBvc3RTY3JvbGxUb3A/OiBudW1iZXI7IC8vIGV4cGVjdGVkIGVkaXRvciBzY3JvbGxUb3Agd3JpdHRlbiBpbnRvIHN0dWIgZWRpdG9yXG5cdFx0XHRlbGVtZW50VG9wOiBudW1iZXI7IC8vIG5vdyBzY2VuYXJpby1zcGVjaWZpYyBmb3IgY2xhcml0eVxuXHRcdFx0ZWxlbWVudEhlaWdodDogbnVtYmVyOyAvLyBzY2VuYXJpby1zcGVjaWZpYyBjb250YWluZXIgaGVpZ2h0XG5cdFx0XHRleHBlY3RlZFRvcDogbnVtYmVyOyAvLyBleHBlY3RlZCBjb21wdXRlZCBDU1MgdG9wIChudW1lcmljIHB4KVxuXHRcdFx0ZXhwZWN0ZWRFZGl0b3JTY3JvbGxUb3A6IG51bWJlcjsgLy8gZXhwZWN0ZWQgYXJndW1lbnQgcGFzc2VkIHRvIGVkaXRvci5zZXRTY3JvbGxUb3Bcblx0XHR9XG5cblx0XHRjb25zdCBERUZBVUxUX0VMRU1FTlRfVE9QID0gMTAwOyAvLyBhYnNvbHV0ZSB0b3Agb2YgdGhlIGNlbGwgaW4gbm90ZWJvb2sgY29vcmRpbmF0ZXNcblx0XHRjb25zdCBERUZBVUxUX0VMRU1FTlRfSEVJR0hUID0gOTAwOyAvLyBhcmJpdHJhcnksIGxhcmdlIGVub3VnaCBub3QgdG8gY29uc3RyYWluXG5cdFx0Y29uc3QgU1RBVFVTQkFSID0gMjI7XG5cdFx0Y29uc3QgVE9QX01BUkdJTiA9IDY7IC8vIG1pcnJvcnMgbGF5b3V0SW5mby50b3BNYXJnaW4gdXNhZ2Vcblx0XHRjb25zdCBPVVRMSU5FID0gMTtcblxuXHRcdGNvbnN0IHNjZW5hcmlvczogVGVzdFNjZW5hcmlvW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdGdWxsJyxcblx0XHRcdFx0c2Nyb2xsVG9wOiAwLFxuXHRcdFx0XHR2aWV3cG9ydEhlaWdodDogNDAwLFxuXHRcdFx0XHRlZGl0b3JDb250ZW50SGVpZ2h0OiAzMDAsXG5cdFx0XHRcdGVkaXRvckhlaWdodDogMzAwLFxuXHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IDMwMCwgLy8gZWRpdG9yQm90dG9tID0gMTAwICsgMzAwID0gNDAwLCBmdWxseSBpbnNpZGUgdmlld3BvcnQgKHNjcm9sbEJvdHRvbT00MDApXG5cdFx0XHRcdGV4cGVjdGVkOiAnRnVsbCcsXG5cdFx0XHRcdGVsZW1lbnRUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AsXG5cdFx0XHRcdGVsZW1lbnRIZWlnaHQ6IERFRkFVTFRfRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRcdGV4cGVjdGVkVG9wOiAwLFxuXHRcdFx0XHRleHBlY3RlZEVkaXRvclNjcm9sbFRvcDogMCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdCb3R0b20gQ2xpcHBlZCcsXG5cdFx0XHRcdHNjcm9sbFRvcDogMCxcblx0XHRcdFx0dmlld3BvcnRIZWlnaHQ6IDM1MCwgLy8gc2Nyb2xsQm90dG9tPTM1MCA8IGVkaXRvckJvdHRvbSg0MDApXG5cdFx0XHRcdGVkaXRvckNvbnRlbnRIZWlnaHQ6IDMwMCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiAzMDAsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogMzAwLFxuXHRcdFx0XHRleHBlY3RlZDogJ0JvdHRvbSBDbGlwcGVkJyxcblx0XHRcdFx0ZWxlbWVudFRvcDogREVGQVVMVF9FTEVNRU5UX1RPUCxcblx0XHRcdFx0ZWxlbWVudEhlaWdodDogREVGQVVMVF9FTEVNRU5UX0hFSUdIVCxcblx0XHRcdFx0ZXhwZWN0ZWRUb3A6IDAsXG5cdFx0XHRcdGV4cGVjdGVkRWRpdG9yU2Nyb2xsVG9wOiAwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ0Z1bGwgKFNtYWxsIFZpZXdwb3J0KScsXG5cdFx0XHRcdHNjcm9sbFRvcDogREVGQVVMVF9FTEVNRU5UX1RPUCArIFRPUF9NQVJHSU4gKyAyMCwgLy8gc2Nyb2xsZWQgaW50byB0aGUgY2VsbCBib2R5XG5cdFx0XHRcdHZpZXdwb3J0SGVpZ2h0OiAyMjAsIC8vIHNtYWxsIHZzIGNvbnRlbnRcblx0XHRcdFx0ZWRpdG9yQ29udGVudEhlaWdodDogNTAwLCAvLyBsYXJnZXIgdGhhbiB2aWV3cG9ydCBzbyB3ZSBjbGFtcFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IDUwMCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiA2MDAsIC8vIGVkaXRvckJvdHRvbT03MDAgPiBzY3JvbGxCb3R0b21cblx0XHRcdFx0ZXhwZWN0ZWQ6ICdGdWxsIChTbWFsbCBWaWV3cG9ydCknLFxuXHRcdFx0XHRlbGVtZW50VG9wOiBERUZBVUxUX0VMRU1FTlRfVE9QLFxuXHRcdFx0XHRlbGVtZW50SGVpZ2h0OiBERUZBVUxUX0VMRU1FTlRfSEVJR0hULFxuXHRcdFx0XHRleHBlY3RlZFRvcDogMTksIC8vIChzY3JvbGxUb3AgLSBlbGVtZW50VG9wIC0gdG9wTWFyZ2luIC0gb3V0bGluZVdpZHRoKSA9ICgxMDArNisyMCAtMTAwIC02IC0xKVxuXHRcdFx0XHRleHBlY3RlZEVkaXRvclNjcm9sbFRvcDogMTksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnVG9wIENsaXBwZWQnLFxuXHRcdFx0XHRzY3JvbGxUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AgKyBUT1BfTUFSR0lOICsgNDAsIC8vIHNjcm9sbGVkIGZ1cnRoZXIgZG93biBidXQgbm90IHBhc3QgYm90dG9tXG5cdFx0XHRcdHZpZXdwb3J0SGVpZ2h0OiA2MDAsIC8vIGxhcmdlciB0aGFuIGNvbnRlbnQgaGVpZ2h0IGJlbG93IChmb3JjZXMgYnJhbmNoIGZvciBUb3AgQ2xpcHBlZClcblx0XHRcdFx0ZWRpdG9yQ29udGVudEhlaWdodDogMjAwLFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IDIwMCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiA0NTAsIC8vIGVkaXRvckJvdHRvbT01NTA7IHNjcm9sbEJvdHRvbT0gc2Nyb2xsVG9wK3ZpZXdwb3J0SGVpZ2h0ID0gPiA1NTA/ICAoNTQwKzYwMD0xMTQwKSBidXQgd2Ugb25seSBuZWVkIHNjcm9sbFRvcCA8IGVkaXRvckJvdHRvbVxuXHRcdFx0XHRleHBlY3RlZDogJ1RvcCBDbGlwcGVkJyxcblx0XHRcdFx0ZWxlbWVudFRvcDogREVGQVVMVF9FTEVNRU5UX1RPUCxcblx0XHRcdFx0ZWxlbWVudEhlaWdodDogREVGQVVMVF9FTEVNRU5UX0hFSUdIVCxcblx0XHRcdFx0ZXhwZWN0ZWRUb3A6IDM5LCAvLyAoMTAwKzYrNDAgLTEwMCAtNiAtMSlcblx0XHRcdFx0ZXhwZWN0ZWRFZGl0b3JTY3JvbGxUb3A6IDQwLCAvLyBjb250ZW50SGVpZ2h0KDIwMCkgLSBjb21wdXRlZCBoZWlnaHQoMTYwKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ0ludmlzaWJsZScsXG5cdFx0XHRcdHNjcm9sbFRvcDogREVGQVVMVF9FTEVNRU5UX1RPUCArIDEwMDAsIC8vIHdlbGwgYmVsb3cgZWRpdG9yIGJvdHRvbVxuXHRcdFx0XHR2aWV3cG9ydEhlaWdodDogNDAwLFxuXHRcdFx0XHRlZGl0b3JDb250ZW50SGVpZ2h0OiAzMDAsXG5cdFx0XHRcdGVkaXRvckhlaWdodDogMzAwLFxuXHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IDMwMCwgLy8gZWRpdG9yQm90dG9tPTQwMCA8IHNjcm9sbFRvcFxuXHRcdFx0XHRleHBlY3RlZDogJ0ludmlzaWJsZScsXG5cdFx0XHRcdGVsZW1lbnRUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AsXG5cdFx0XHRcdGVsZW1lbnRIZWlnaHQ6IERFRkFVTFRfRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRcdGV4cGVjdGVkVG9wOiAyNzgsIC8vIGFkanVzdGVkIGFmdGVyIGVuc3VyaW5nIG1pbmltdW0gbGluZSBoZWlnaHQgd2hlbiBwb3NzaWJsZUVkaXRvckhlaWdodCA8IExJTkVfSEVJR0hUXG5cdFx0XHRcdGV4cGVjdGVkRWRpdG9yU2Nyb2xsVG9wOiAyNzksIC8vIGNvbnRlbnRIZWlnaHQoMzAwKSAtIGNsYW1wZWQgaGVpZ2h0KDIxKVxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBzIG9mIHNjZW5hcmlvcykge1xuXHRcdFx0Ly8gRnJlc2ggc3R1YiBvYmplY3RzIHBlciBzY2VuYXJpb1xuXHRcdFx0Y29uc3QgZWRpdG9yU2Nyb2xsU3RhdGU6IHsgc2Nyb2xsVG9wOiBudW1iZXIgfSA9IHsgc2Nyb2xsVG9wOiAwIH07XG5cdFx0XHRjb25zdCBzdHViRWRpdG9yID0ge1xuXHRcdFx0XHRsYXlvdXRDYWxsczogW10gYXMgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W10sXG5cdFx0XHRcdF9sYXN0U2Nyb2xsVG9wU2V0OiAtMSxcblx0XHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBzLmVkaXRvckhlaWdodCB9KSxcblx0XHRcdFx0Z2V0Q29udGVudEhlaWdodDogKCkgPT4gcy5lZGl0b3JDb250ZW50SGVpZ2h0LFxuXHRcdFx0XHRsYXlvdXQ6IChkaW06IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRcdHN0dWJFZGl0b3IubGF5b3V0Q2FsbHMucHVzaChkaW0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRlZGl0b3JTY3JvbGxTdGF0ZS5zY3JvbGxUb3AgPSB2O1xuXHRcdFx0XHRcdHN0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXQgPSB2O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRoYXNNb2RlbDogKCkgPT4gdHJ1ZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGVkaXRvclBhcnQgPSB7IHN0eWxlOiB7IHRvcDogJycgfSB9O1xuXHRcdFx0Y29uc3QgdGVtcGxhdGU6IFBhcnRpYWw8Q29kZUNlbGxSZW5kZXJUZW1wbGF0ZT4gPSB7XG5cdFx0XHRcdGVkaXRvcjogc3R1YkVkaXRvciBhcyB1bmtub3duIGFzIElDb2RlRWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JQYXJ0OiBlZGl0b3JQYXJ0IGFzIHVua25vd24gYXMgSFRNTEVsZW1lbnQsXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyB2aWV3Q2VsbCBzdHViIHdpdGggb25seSBuZWVkZWQgcGllY2VzXG5cdFx0XHRjb25zdCB2aWV3Q2VsbDogUGFydGlhbDxDb2RlQ2VsbFZpZXdNb2RlbD4gPSB7XG5cdFx0XHRcdGlzSW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdFx0Ly8gdmFsdWVzIHJlZmVyZW5jZWQgaW4gbGF5b3V0IGxvZ2ljXG5cdFx0XHRcdFx0c3RhdHVzQmFySGVpZ2h0OiBTVEFUVVNCQVIsXG5cdFx0XHRcdFx0dG9wTWFyZ2luOiBUT1BfTUFSR0lOLFxuXHRcdFx0XHRcdG91dGxpbmVXaWR0aDogT1VUTElORSxcblx0XHRcdFx0XHRlZGl0b3JIZWlnaHQ6IHMuZWRpdG9ySGVpZ2h0LFxuXHRcdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogcy5vdXRwdXRDb250YWluZXJPZmZzZXQsXG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBDb2RlQ2VsbExheW91dEluZm8sXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBub3RlYm9vayBlZGl0b3Igc3R1YlxuXHRcdFx0bGV0IHNjcm9sbEJvdHRvbSA9IHMuc2Nyb2xsVG9wICsgcy52aWV3cG9ydEhlaWdodDtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0ge1xuXHRcdFx0XHRzY3JvbGxUb3A6IHMuc2Nyb2xsVG9wLFxuXHRcdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRcdHJldHVybiBzY3JvbGxCb3R0b207XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLnNjcm9sbFRvcCA9IHY7XG5cdFx0XHRcdFx0c2Nyb2xsQm90dG9tID0gdiArIHMudmlld3BvcnRIZWlnaHQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7XG5cdFx0XHRcdFx0Zm9udEluZm86IHsgbGluZUhlaWdodDogMjEgfSxcblx0XHRcdFx0XHRoZWlnaHQ6IHMudmlld3BvcnRIZWlnaHQsXG5cdFx0XHRcdFx0c3RpY2t5SGVpZ2h0OiAwLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQ6ICgpID0+IHMuZWxlbWVudFRvcCxcblx0XHRcdFx0Z2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQ6ICgpID0+XG5cdFx0XHRcdFx0cy5lbGVtZW50VG9wICsgcy5vdXRwdXRDb250YWluZXJPZmZzZXQsXG5cdFx0XHRcdGdldEhlaWdodE9mRWxlbWVudDogKCkgPT4gcy5lbGVtZW50SGVpZ2h0LFxuXHRcdFx0XHRub3RlYm9va09wdGlvbnM6IHtcblx0XHRcdFx0XHRnZXRMYXlvdXRDb25maWd1cmF0aW9uOiAoKSA9PiAoeyBlZGl0b3JUb3BQYWRkaW5nOiA2IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0XHQvKiBlbmFibGVkICovIHRydWUsXG5cdFx0XHRcdG5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHRcdHZpZXdDZWxsIGFzIENvZGVDZWxsVmlld01vZGVsLFxuXHRcdFx0XHR0ZW1wbGF0ZSBhcyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGVidWc6ICgpID0+IHtcblx0XHRcdFx0XHRcdC8qIG5vLW9wICovXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyB3aWR0aDogNjAwLCBoZWlnaHQ6IHMuZWRpdG9ySGVpZ2h0IH1cblx0XHRcdCk7XG5cblx0XHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0bGF5b3V0LmVkaXRvclZpc2liaWxpdHksXG5cdFx0XHRcdHMuZXhwZWN0ZWQsXG5cdFx0XHRcdGBTY2VuYXJpbyAnJHtzLm5hbWV9JyAoc2Nyb2xsVG9wPSR7cy5zY3JvbGxUb3B9KSBleHBlY3RlZCB2aXNpYmlsaXR5ICR7cy5leHBlY3RlZH0gYnV0IGdvdCAke2xheW91dC5lZGl0b3JWaXNpYmlsaXR5fWBcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBhY3R1YWxUb3AgPSBwYXJzZUludChcblx0XHRcdFx0KGVkaXRvclBhcnQuc3R5bGUudG9wIHx8ICcwJykucmVwbGFjZSgvcHgkLywgJycpXG5cdFx0XHQpOyAvLyBzdHlsZS50b3AgYWx3YXlzIGxpa2UgJ05OTnB4J1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhY3R1YWxUb3AsXG5cdFx0XHRcdHMuZXhwZWN0ZWRUb3AsXG5cdFx0XHRcdGBTY2VuYXJpbyAnJHtzLm5hbWV9JyAoc2Nyb2xsVG9wPSR7cy5zY3JvbGxUb3B9KSBleHBlY3RlZCB0b3AgJHtzLmV4cGVjdGVkVG9wfXB4IGJ1dCBnb3QgJHtlZGl0b3JQYXJ0LnN0eWxlLnRvcH1gXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0LFxuXHRcdFx0XHRzLmV4cGVjdGVkRWRpdG9yU2Nyb2xsVG9wLFxuXHRcdFx0XHRgU2NlbmFyaW8gJyR7cy5uYW1lfScgKHNjcm9sbFRvcD0ke3Muc2Nyb2xsVG9wfSkgZXhwZWN0ZWQgZWRpdG9yLnNldFNjcm9sbFRvcCgke3MuZXhwZWN0ZWRFZGl0b3JTY3JvbGxUb3B9KSBidXQgZ290ICR7c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldH1gXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBCYXNpYyBzYW5pdHk6IHN0eWxlLnRvcCBzaG91bGQgYWx3YXlzIGJlIHNldCB3aGVuIHZpc2libGUgc3RhdGVzIG90aGVyIHRoYW4gRnVsbCAoaGFuZGxlZCkgb3IgSW52aXNpYmxlLlxuXHRcdFx0aWYgKHMuZXhwZWN0ZWQgIT09ICdJbnZpc2libGUnKSB7XG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRlZGl0b3JQYXJ0LnN0eWxlLnRvcCxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRgU2NlbmFyaW8gJyR7cy5uYW1lfScgc2hvdWxkIHNldCBhIHRvcCBzdHlsZSB2YWx1ZWBcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEludmlzaWJsZSBzdGlsbCBzZXRzIGEgdG9wOyBqdXN0IGVuc3VyZSBsYXlvdXQgcmFuXG5cdFx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0XHRlZGl0b3JQYXJ0LnN0eWxlLnRvcCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdJbnZpc2libGUgc2NlbmFyaW8gc3RpbGwgcGVyZm9ybXMgYSBsYXlvdXQnXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTY3JvbGxpbmcnLCAoKSA9PiB7XG5cdFx0LyoqXG5cdFx0ICogUGl4ZWwtYnktcGl4ZWwgc2Nyb2xsIHRlc3QgdG8gdmFsaWRhdGUgYENvZGVDZWxsTGF5b3V0YCBjYWxjdWxhdGlvbnMgZm9yOlxuXHRcdCAqICAtIGVkaXRvclBhcnQuc3R5bGUudG9wXG5cdFx0ICogIC0gZWRpdG9yVmlzaWJpbGl0eSBjbGFzc2lmaWNhdGlvblxuXHRcdCAqICAtIGVkaXRvciBpbnRlcm5hbCBzY3JvbGxUb3AgcGFzc2VkIHRvIHNldFNjcm9sbFRvcFxuXHRcdCAqXG5cdFx0ICogV2UgaW50ZW50aW9uYWxseSBtaXJyb3IgdGhlIHByb2R1Y3Rpb24gbWF0aCBpbiBhIGhlbHBlciAoZHVwbGljYXRpb24gYWNjZXB0YWJsZSBpbiB0ZXN0KSBzb1xuXHRcdCAqIHRoYXQgYW55IGRpdmVyZ2VuY2UgaXMgY2F1Z2h0LiBDb25zdGFudHMgY2hvc2VuIHRvIGV4ZXJjaXNlIGFsbCBzdGF0ZSB0cmFuc2l0aW9ucy5cblx0XHQgKi9cblx0XHRjb25zdCBMSU5FX0hFSUdIVCA9IDIxOyAvLyBmcm9tIGdldExheW91dEluZm8oKS5mb250SW5mby5saW5lSGVpZ2h0IGluIHN0dWJzXG5cdFx0Y29uc3QgQ0VMTF9UT1BfTUFSR0lOID0gNjtcblx0XHRjb25zdCBDRUxMX09VVExJTkVfV0lEVEggPSAxO1xuXHRcdGNvbnN0IFNUQVRVU0JBUl9IRUlHSFQgPSAyMjtcblx0XHRjb25zdCBWSUVXUE9SVF9IRUlHSFQgPSAzMDA7IC8vIG5vdGVib29rIHZpZXdwb3J0IGhlaWdodFxuXHRcdGNvbnN0IEVMRU1FTlRfVE9QID0gMTAwOyAvLyBhYnNvbHV0ZSB0b3Bcblx0XHRjb25zdCBFRElUT1JfQ09OVEVOVF9IRUlHSFQgPSA4MDA7IC8vIHRhbGwgY29udGVudCBzbyB3ZSBnZXQgY2xpcHBpbmcgYW5kIHNtYWxsIHZpZXdwb3J0IHN0YXRlc1xuXHRcdGNvbnN0IEVESVRPUl9IRUlHSFQgPSBFRElUT1JfQ09OVEVOVF9IRUlHSFQ7IC8vIGluaXRpYWwgbGF5b3V0SW5mby5lZGl0b3JIZWlnaHRcblx0XHRjb25zdCBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCA9IDgwMDsgLy8gYm90dG9tIG9mIGVkaXRvciByZWdpb24gcmVsYXRpdmUgdG8gZWxlbWVudFRvcFxuXHRcdGNvbnN0IEVMRU1FTlRfSEVJR0hUID0gMTIwMDsgLy8gbGFyZ2UgY29udGFpbmVyXG5cblx0XHRmdW5jdGlvbiBjbGFtcCh2OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xuXHRcdFx0cmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHYsIG1pbiksIG1heCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY29tcHV0ZUV4cGVjdGVkKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0XHRjb25zdCBzY3JvbGxCb3R0b20gPSBzY3JvbGxUb3AgKyBWSUVXUE9SVF9IRUlHSFQ7XG5cdFx0XHRjb25zdCB2aWV3cG9ydEhlaWdodCA9IFZJRVdQT1JUX0hFSUdIVDtcblx0XHRcdGNvbnN0IGVkaXRvckJvdHRvbSA9IEVMRU1FTlRfVE9QICsgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQ7XG5cdFx0XHRsZXQgdG9wID0gTWF0aC5tYXgoXG5cdFx0XHRcdDAsXG5cdFx0XHRcdHNjcm9sbFRvcCAtIEVMRU1FTlRfVE9QIC0gQ0VMTF9UT1BfTUFSR0lOIC0gQ0VMTF9PVVRMSU5FX1dJRFRIXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgcG9zc2libGVFZGl0b3JIZWlnaHQgPSBFRElUT1JfSEVJR0hUIC0gdG9wO1xuXHRcdFx0aWYgKHBvc3NpYmxlRWRpdG9ySGVpZ2h0IDwgTElORV9IRUlHSFQpIHtcblx0XHRcdFx0dG9wID0gdG9wIC0gKExJTkVfSEVJR0hUIC0gcG9zc2libGVFZGl0b3JIZWlnaHQpIC0gQ0VMTF9PVVRMSU5FX1dJRFRIO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGhlaWdodCA9IEVESVRPUl9DT05URU5UX0hFSUdIVDtcblx0XHRcdGxldCB2aXNpYmlsaXR5OiBzdHJpbmcgPSAnRnVsbCc7XG5cdFx0XHRsZXQgZWRpdG9yU2Nyb2xsVG9wID0gMDtcblx0XHRcdGlmIChzY3JvbGxUb3AgPD0gRUxFTUVOVF9UT1AgKyBDRUxMX1RPUF9NQVJHSU4pIHtcblx0XHRcdFx0Y29uc3QgbWluaW11bUVkaXRvckhlaWdodCA9IExJTkVfSEVJR0hUICsgNjsgLy8gZWRpdG9yVG9wUGFkZGluZyBmcm9tIGNvbmZpZ3VyYXRpb24gc3R1YiAoNilcblx0XHRcdFx0aWYgKHNjcm9sbEJvdHRvbSA+PSBlZGl0b3JCb3R0b20pIHtcblx0XHRcdFx0XHRoZWlnaHQgPSBjbGFtcChcblx0XHRcdFx0XHRcdEVESVRPUl9DT05URU5UX0hFSUdIVCxcblx0XHRcdFx0XHRcdG1pbmltdW1FZGl0b3JIZWlnaHQsXG5cdFx0XHRcdFx0XHRFRElUT1JfQ09OVEVOVF9IRUlHSFRcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHZpc2liaWxpdHkgPSAnRnVsbCc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGVpZ2h0ID1cblx0XHRcdFx0XHRcdGNsYW1wKFxuXHRcdFx0XHRcdFx0XHRzY3JvbGxCb3R0b20gLSAoRUxFTUVOVF9UT1AgKyBDRUxMX1RPUF9NQVJHSU4pIC0gU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0XHRcdFx0bWluaW11bUVkaXRvckhlaWdodCxcblx0XHRcdFx0XHRcdFx0RURJVE9SX0NPTlRFTlRfSEVJR0hUXG5cdFx0XHRcdFx0XHQpICtcblx0XHRcdFx0XHRcdDIgKiBDRUxMX09VVExJTkVfV0lEVEg7XG5cdFx0XHRcdFx0dmlzaWJpbGl0eSA9ICdCb3R0b20gQ2xpcHBlZCc7XG5cdFx0XHRcdFx0ZWRpdG9yU2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHZpZXdwb3J0SGVpZ2h0IDw9IEVESVRPUl9DT05URU5UX0hFSUdIVCAmJlxuXHRcdFx0XHRcdHNjcm9sbEJvdHRvbSA8PSBlZGl0b3JCb3R0b21cblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgbWluaW11bUVkaXRvckhlaWdodCA9IExJTkVfSEVJR0hUICsgNjsgLy8gZWRpdG9yVG9wUGFkZGluZ1xuXHRcdFx0XHRcdGhlaWdodCA9XG5cdFx0XHRcdFx0XHRjbGFtcChcblx0XHRcdFx0XHRcdFx0dmlld3BvcnRIZWlnaHQgLSBTVEFUVVNCQVJfSEVJR0hULFxuXHRcdFx0XHRcdFx0XHRtaW5pbXVtRWRpdG9ySGVpZ2h0LFxuXHRcdFx0XHRcdFx0XHRFRElUT1JfQ09OVEVOVF9IRUlHSFQgLSBTVEFUVVNCQVJfSEVJR0hUXG5cdFx0XHRcdFx0XHQpICtcblx0XHRcdFx0XHRcdDIgKiBDRUxMX09VVExJTkVfV0lEVEg7XG5cdFx0XHRcdFx0dmlzaWJpbGl0eSA9ICdGdWxsIChTbWFsbCBWaWV3cG9ydCknO1xuXHRcdFx0XHRcdGVkaXRvclNjcm9sbFRvcCA9IHRvcDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBtaW5pbXVtRWRpdG9ySGVpZ2h0ID0gTElORV9IRUlHSFQ7XG5cdFx0XHRcdFx0aGVpZ2h0ID0gY2xhbXAoXG5cdFx0XHRcdFx0XHRFRElUT1JfQ09OVEVOVF9IRUlHSFQgLVxuXHRcdFx0XHRcdFx0KHNjcm9sbFRvcCAtIChFTEVNRU5UX1RPUCArIENFTExfVE9QX01BUkdJTikpLFxuXHRcdFx0XHRcdFx0bWluaW11bUVkaXRvckhlaWdodCxcblx0XHRcdFx0XHRcdEVESVRPUl9DT05URU5UX0hFSUdIVFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0aWYgKHNjcm9sbFRvcCA+IGVkaXRvckJvdHRvbSkge1xuXHRcdFx0XHRcdFx0dmlzaWJpbGl0eSA9ICdJbnZpc2libGUnO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR2aXNpYmlsaXR5ID0gJ1RvcCBDbGlwcGVkJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWRpdG9yU2Nyb2xsVG9wID0gRURJVE9SX0NPTlRFTlRfSEVJR0hUIC0gaGVpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB0b3AsIHZpc2liaWxpdHksIGVkaXRvclNjcm9sbFRvcCB9O1xuXHRcdH1cblxuXHRcdC8vIFNoYXJlZCBzdHVicyAod2UnbGwgbXV0YXRlIHNjcm9sbFRvcCBlYWNoIGl0ZXJhdGlvbikgXHUyMDEzIHdlIHJlLWNyZWF0ZSBsYXlvdXQgZWFjaCBpdGVyYXRpb24gdG8gcmVzZXQgaW50ZXJuYWwgc3RhdGUgY2hhbmdlc1xuXHRcdGZvciAoXG5cdFx0XHRsZXQgc2Nyb2xsVG9wID0gMDtcblx0XHRcdHNjcm9sbFRvcCA8PSBWSUVXUE9SVF9IRUlHSFQgKyBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCArIDIwO1xuXHRcdFx0c2Nyb2xsVG9wKytcblx0XHQpIHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gY29tcHV0ZUV4cGVjdGVkKHNjcm9sbFRvcCk7XG5cdFx0XHRjb25zdCBzY3JvbGxCb3R0b20gPSBzY3JvbGxUb3AgKyBWSUVXUE9SVF9IRUlHSFQ7XG5cdFx0XHRjb25zdCBzdHViRWRpdG9yID0ge1xuXHRcdFx0XHRfbGFzdFNjcm9sbFRvcFNldDogLTEsXG5cdFx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7IHdpZHRoOiA2MDAsIGhlaWdodDogRURJVE9SX0hFSUdIVCB9KSxcblx0XHRcdFx0Z2V0Q29udGVudEhlaWdodDogKCkgPT4gRURJVE9SX0NPTlRFTlRfSEVJR0hULFxuXHRcdFx0XHRsYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0XHQvKiBuby1vcCAqL1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0ID0gdjtcblx0XHRcdFx0fSxcblx0XHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZWRpdG9yUGFydCA9IHsgc3R5bGU6IHsgdG9wOiAnJyB9IH07XG5cdFx0XHRjb25zdCB0ZW1wbGF0ZTogUGFydGlhbDxDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiA9IHtcblx0XHRcdFx0ZWRpdG9yOiBzdHViRWRpdG9yIGFzIHVua25vd24gYXMgSUNvZGVFZGl0b3IsXG5cdFx0XHRcdGVkaXRvclBhcnQ6IGVkaXRvclBhcnQgYXMgdW5rbm93biBhcyBIVE1MRWxlbWVudCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCB2aWV3Q2VsbDogUGFydGlhbDxDb2RlQ2VsbFZpZXdNb2RlbD4gPSB7XG5cdFx0XHRcdGlzSW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdFx0c3RhdHVzQmFySGVpZ2h0OiBTVEFUVVNCQVJfSEVJR0hULFxuXHRcdFx0XHRcdHRvcE1hcmdpbjogQ0VMTF9UT1BfTUFSR0lOLFxuXHRcdFx0XHRcdG91dGxpbmVXaWR0aDogQ0VMTF9PVVRMSU5FX1dJRFRILFxuXHRcdFx0XHRcdGVkaXRvckhlaWdodDogRURJVE9SX0hFSUdIVCxcblx0XHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0ge1xuXHRcdFx0XHRzY3JvbGxUb3AsXG5cdFx0XHRcdGdldCBzY3JvbGxCb3R0b20oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNjcm9sbEJvdHRvbTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0Lyogbm90ZWJvb2sgc2Nyb2xsIGNoYW5nZXMgYXJlIG5vdCB0aGUgZm9jdXMgaGVyZSAqL1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoe1xuXHRcdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IExJTkVfSEVJR0hUIH0sXG5cdFx0XHRcdFx0aGVpZ2h0OiBWSUVXUE9SVF9IRUlHSFQsXG5cdFx0XHRcdFx0c3RpY2t5SGVpZ2h0OiAwLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QLFxuXHRcdFx0XHRnZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AgKyBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdFx0Z2V0SGVpZ2h0T2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX0hFSUdIVCxcblx0XHRcdFx0bm90ZWJvb2tPcHRpb25zOiB7XG5cdFx0XHRcdFx0Z2V0TGF5b3V0Q29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWRpdG9yVG9wUGFkZGluZzogNiB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsYXlvdXQgPSBuZXcgQ29kZUNlbGxMYXlvdXQoXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdG5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHRcdHZpZXdDZWxsIGFzIENvZGVDZWxsVmlld01vZGVsLFxuXHRcdFx0XHR0ZW1wbGF0ZSBhcyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdFx0XHR7IGRlYnVnOiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0eyB3aWR0aDogNjAwLCBoZWlnaHQ6IEVESVRPUl9IRUlHSFQgfVxuXHRcdFx0KTtcblx0XHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ25iRGlkU2Nyb2xsJyk7XG5cdFx0XHRjb25zdCBhY3R1YWxUb3AgPSBwYXJzZUludChcblx0XHRcdFx0KGVkaXRvclBhcnQuc3R5bGUudG9wIHx8ICcwJykucmVwbGFjZSgvcHgkLywgJycpXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhY3R1YWxUb3AsXG5cdFx0XHRcdGV4cGVjdGVkLnRvcCxcblx0XHRcdFx0YHNjcm9sbFRvcD0ke3Njcm9sbFRvcH06IGV4cGVjdGVkIHRvcCAke2V4cGVjdGVkLnRvcH0sIGdvdCAke2FjdHVhbFRvcH1gXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRsYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSxcblx0XHRcdFx0ZXhwZWN0ZWQudmlzaWJpbGl0eSxcblx0XHRcdFx0YHNjcm9sbFRvcD0ke3Njcm9sbFRvcH06IGV4cGVjdGVkIHZpc2liaWxpdHkgJHtleHBlY3RlZC52aXNpYmlsaXR5fSwgZ290ICR7bGF5b3V0LmVkaXRvclZpc2liaWxpdHl9YFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCxcblx0XHRcdFx0ZXhwZWN0ZWQuZWRpdG9yU2Nyb2xsVG9wLFxuXHRcdFx0XHRgc2Nyb2xsVG9wPSR7c2Nyb2xsVG9wfTogZXhwZWN0ZWQgZWRpdG9yU2Nyb2xsVG9wICR7ZXhwZWN0ZWQuZWRpdG9yU2Nyb2xsVG9wfSwgZ290ICR7c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldH1gXG5cdFx0XHQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnQ29kZUNlbGxMYXlvdXQgcmV1c2VzIGNvbnRlbnQgaGVpZ2h0IGFmdGVyIGluaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgTElORV9IRUlHSFQgPSAyMTtcblx0XHRjb25zdCBTVEFUVVNCQVJfSEVJR0hUID0gMjI7XG5cdFx0Y29uc3QgQ0VMTF9UT1BfTUFSR0lOID0gNjtcblx0XHRjb25zdCBDRUxMX09VVExJTkVfV0lEVEggPSAxO1xuXHRcdGNvbnN0IFZJRVdQT1JUX0hFSUdIVCA9IDEwMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9UT1AgPSAxMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9IRUlHSFQgPSAxMjAwO1xuXHRcdGNvbnN0IE9VVFBVVF9DT05UQUlORVJfT0ZGU0VUID0gMzAwO1xuXHRcdGNvbnN0IEVESVRPUl9IRUlHSFQgPSA4MDA7XG5cblx0XHRsZXQgY29udGVudEhlaWdodCA9IDgwMDtcblx0XHRjb25zdCBzdHViRWRpdG9yID0ge1xuXHRcdFx0bGF5b3V0Q2FsbHM6IFtdIGFzIHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdLFxuXHRcdFx0X2xhc3RTY3JvbGxUb3BTZXQ6IC0xLFxuXHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBFRElUT1JfSEVJR0hUIH0pLFxuXHRcdFx0Z2V0Q29udGVudEhlaWdodDogKCkgPT4gY29udGVudEhlaWdodCxcblx0XHRcdGxheW91dDogKGRpbTogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KSA9PiB7XG5cdFx0XHRcdHN0dWJFZGl0b3IubGF5b3V0Q2FsbHMucHVzaChkaW0pO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0ID0gdjtcblx0XHRcdH0sXG5cdFx0XHRoYXNNb2RlbDogKCkgPT4gdHJ1ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGVkaXRvclBhcnQgPSB7IHN0eWxlOiB7IHRvcDogJycgfSB9O1xuXHRcdGNvbnN0IHRlbXBsYXRlOiBQYXJ0aWFsPENvZGVDZWxsUmVuZGVyVGVtcGxhdGU+ID0ge1xuXHRcdFx0ZWRpdG9yOiBzdHViRWRpdG9yIGFzIHVua25vd24gYXMgSUNvZGVFZGl0b3IsXG5cdFx0XHRlZGl0b3JQYXJ0OiBlZGl0b3JQYXJ0IGFzIHVua25vd24gYXMgSFRNTEVsZW1lbnQsXG5cdFx0fTtcblx0XHRjb25zdCB2aWV3Q2VsbDogUGFydGlhbDxDb2RlQ2VsbFZpZXdNb2RlbD4gPSB7XG5cdFx0XHRpc0lucHV0Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdGxheW91dEluZm86IHtcblx0XHRcdFx0c3RhdHVzQmFySGVpZ2h0OiBTVEFUVVNCQVJfSEVJR0hULFxuXHRcdFx0XHR0b3BNYXJnaW46IENFTExfVE9QX01BUkdJTixcblx0XHRcdFx0b3V0bGluZVdpZHRoOiBDRUxMX09VVExJTkVfV0lEVEgsXG5cdFx0XHRcdGVkaXRvckhlaWdodDogRURJVE9SX0hFSUdIVCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdFx0ZWRpdG9yV2lkdGg6IDYwMCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDb2RlQ2VsbExheW91dEluZm8sXG5cdFx0fTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHtcblx0XHRcdHNjcm9sbFRvcDogMCxcblx0XHRcdGdldCBzY3JvbGxCb3R0b20oKSB7XG5cdFx0XHRcdHJldHVybiBWSUVXUE9SVF9IRUlHSFQ7XG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdC8qIG5vLW9wICovXG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHtcblx0XHRcdFx0Zm9udEluZm86IHsgbGluZUhlaWdodDogTElORV9IRUlHSFQgfSxcblx0XHRcdFx0aGVpZ2h0OiBWSUVXUE9SVF9IRUlHSFQsXG5cdFx0XHRcdHN0aWNreUhlaWdodDogMCxcblx0XHRcdH0pLFxuXHRcdFx0Z2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QLFxuXHRcdFx0Z2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QICsgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRnZXRIZWlnaHRPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfSEVJR0hULFxuXHRcdFx0bm90ZWJvb2tPcHRpb25zOiB7XG5cdFx0XHRcdGdldExheW91dENvbmZpZ3VyYXRpb246ICgpID0+ICh7IGVkaXRvclRvcFBhZGRpbmc6IDYgfSksXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBsYXlvdXQgPSBuZXcgQ29kZUNlbGxMYXlvdXQoXG5cdFx0XHR0cnVlLFxuXHRcdFx0bm90ZWJvb2tFZGl0b3IgYXMgdW5rbm93biBhcyBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRcdHZpZXdDZWxsIGFzIENvZGVDZWxsVmlld01vZGVsLFxuXHRcdFx0dGVtcGxhdGUgYXMgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRcdHsgZGVidWc6ICgpID0+IHsgfSB9LFxuXHRcdFx0eyB3aWR0aDogNjAwLCBoZWlnaHQ6IEVESVRPUl9IRUlHSFQgfVxuXHRcdCk7XG5cblx0XHRsYXlvdXQubGF5b3V0RWRpdG9yKCdpbml0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5lZGl0b3JWaXNpYmlsaXR5LCAnRnVsbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LCA4MDApO1xuXG5cdFx0Ly8gU2ltdWxhdGUgTW9uYWNvIHJlcG9ydGluZyBhIHRyYW5zaWVudCBzbWFsbGVyIGNvbnRlbnQgaGVpZ2h0IG9uIHNjcm9sbC5cblx0XHRjb250ZW50SGVpZ2h0ID0gMjAwO1xuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ25iRGlkU2Nyb2xsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5lZGl0b3JWaXNpYmlsaXR5LCAnRnVsbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0dWJFZGl0b3IubGF5b3V0Q2FsbHMuYXQoLTEpPy5oZWlnaHQsXG5cdFx0XHQ4MDAsXG5cdFx0XHQnbmJEaWRTY3JvbGwgc2hvdWxkIHJldXNlIHRoZSBlc3RhYmxpc2hlZCBjb250ZW50IGhlaWdodCdcblx0XHQpO1xuXG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignb25EaWRDb250ZW50U2l6ZUNoYW5nZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSwgJ0Z1bGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LFxuXHRcdFx0MjAwLFxuXHRcdFx0J29uRGlkQ29udGVudFNpemVDaGFuZ2Ugc2hvdWxkIHJlZnJlc2ggdGhlIGNvbnRlbnQgaGVpZ2h0J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvZGVDZWxsTGF5b3V0IHJlZnJlc2hlcyBjb250ZW50IGhlaWdodCBvbiB2aWV3Q2VsbExheW91dENoYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBMSU5FX0hFSUdIVCA9IDIxO1xuXHRcdGNvbnN0IENFTExfVE9QX01BUkdJTiA9IDY7XG5cdFx0Y29uc3QgQ0VMTF9PVVRMSU5FX1dJRFRIID0gMTtcblx0XHRjb25zdCBTVEFUVVNCQVJfSEVJR0hUID0gMjI7XG5cdFx0Y29uc3QgVklFV1BPUlRfSEVJR0hUID0gMTAwMDtcblx0XHRjb25zdCBFTEVNRU5UX1RPUCA9IDEwMDtcblx0XHRjb25zdCBFTEVNRU5UX0hFSUdIVCA9IDEyMDA7XG5cdFx0Y29uc3QgSU5JVElBTF9DT05URU5UX0hFSUdIVCA9IDM3O1xuXHRcdGNvbnN0IE9VVFBVVF9DT05UQUlORVJfT0ZGU0VUID0gMzAwO1xuXHRcdGNvbnN0IFVQREFURURfQ09OVEVOVF9IRUlHSFQgPSAyMDA7XG5cblx0XHRsZXQgY29udGVudEhlaWdodCA9IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0Y29uc3Qgc3R1YkVkaXRvciA9IHtcblx0XHRcdGxheW91dENhbGxzOiBbXSBhcyB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH1bXSxcblx0XHRcdF9sYXN0U2Nyb2xsVG9wU2V0OiAtMSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7IHdpZHRoOiA2MDAsIGhlaWdodDogSU5JVElBTF9DT05URU5UX0hFSUdIVCB9KSxcblx0XHRcdGdldENvbnRlbnRIZWlnaHQ6ICgpID0+IGNvbnRlbnRIZWlnaHQsXG5cdFx0XHRsYXlvdXQ6IChkaW06IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLnB1c2goZGltKTtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0geyBzdHlsZTogeyB0b3A6ICcnIH0gfTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogUGFydGlhbDxDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiA9IHtcblx0XHRcdGVkaXRvcjogc3R1YkVkaXRvciBhcyB1bmtub3duIGFzIElDb2RlRWRpdG9yLFxuXHRcdFx0ZWRpdG9yUGFydDogZWRpdG9yUGFydCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50LFxuXHRcdH07XG5cdFx0Y29uc3Qgdmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNJbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0dG9wTWFyZ2luOiBDRUxMX1RPUF9NQVJHSU4sXG5cdFx0XHRcdG91dGxpbmVXaWR0aDogQ0VMTF9PVVRMSU5FX1dJRFRILFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRcdGVkaXRvcldpZHRoOiA2MDAsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB7XG5cdFx0XHRzY3JvbGxUb3A6IDAsXG5cdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRyZXR1cm4gVklFV1BPUlRfSEVJR0hUO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHQvKiBuby1vcCAqL1xuXHRcdFx0fSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7XG5cdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IExJTkVfSEVJR0hUIH0sXG5cdFx0XHRcdGhlaWdodDogVklFV1BPUlRfSEVJR0hULFxuXHRcdFx0XHRzdGlja3lIZWlnaHQ6IDAsXG5cdFx0XHR9KSxcblx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCxcblx0XHRcdGdldEFic29sdXRlQm90dG9tT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCArIE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0Z2V0SGVpZ2h0T2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX0hFSUdIVCxcblx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRnZXRMYXlvdXRDb25maWd1cmF0aW9uOiAoKSA9PiAoeyBlZGl0b3JUb3BQYWRkaW5nOiA2IH0pLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHR2aWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdHRlbXBsYXRlIGFzIENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0XHR7IGRlYnVnOiAoKSA9PiB7IH0gfSxcblx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBJTklUSUFMX0NPTlRFTlRfSEVJR0hUIH1cblx0XHQpO1xuXG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignaW5pdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LCBJTklUSUFMX0NPTlRFTlRfSEVJR0hUKTtcblxuXHRcdC8vIFNpbXVsYXRlIHdyYXBwaW5nLWRyaXZlbiBoZWlnaHQgaW5jcmVhc2UgYWZ0ZXIgd2lkdGgvbGF5b3V0IHNldHRsZXMuXG5cdFx0Y29udGVudEhlaWdodCA9IFVQREFURURfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcigndmlld0NlbGxMYXlvdXRDaGFuZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LFxuXHRcdFx0VVBEQVRFRF9DT05URU5UX0hFSUdIVCxcblx0XHRcdCd2aWV3Q2VsbExheW91dENoYW5nZSBzaG91bGQgcmVmcmVzaCB0aGUgY29udGVudCBoZWlnaHQnXG5cdFx0KTtcblxuXHRcdC8vIEVuc3VyZSBzdWJzZXF1ZW50IHNjcm9sbHMgc3RpbGwgcmV1c2UgdGhlIGVzdGFibGlzaGVkIChsYXJnZXIpIGhlaWdodC5cblx0XHRjb250ZW50SGVpZ2h0ID0gNTA7XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignbmJEaWRTY3JvbGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LFxuXHRcdFx0VVBEQVRFRF9DT05URU5UX0hFSUdIVCxcblx0XHRcdCduYkRpZFNjcm9sbCBzaG91bGQgcmV1c2UgdGhlIHJlZnJlc2hlZCBjb250ZW50IGhlaWdodCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlQ2VsbExheW91dCBtYWludGFpbnMgY29udGVudCBoZWlnaHQgYWZ0ZXIgcGFzdGUgd2hlbiBzY3JvbGxpbmcnLCAoKSA9PiB7XG5cdFx0LyoqXG5cdFx0ICogUmVncmVzc2lvbiB0ZXN0IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjg0NTI0XG5cdFx0ICpcblx0XHQgKiBTY2VuYXJpbzogQ2VsbCBzdGFydHMgd2l0aCAxIGxpbmUgKDM3cHgpLCB1c2VyIHBhc3RlcyB0ZXh0IChncm93cyB0byA2NzlweCksXG5cdFx0ICogdGhlbiBzY3JvbGxzLiBEdXJpbmcgc2Nyb2xsLCBNb25hY28gbWF5IHJlcG9ydCBhIHRyYW5zaWVudCBzbWFsbGVyIGhlaWdodCAoMzlweClcblx0XHQgKiBkdWUgdG8gdGhlIGNsaXBwZWQgbGF5b3V0LiBUaGUgZml4IHVzZXMgX2VzdGFibGlzaGVkQ29udGVudEhlaWdodCB0byBtYWludGFpblxuXHRcdCAqIHRoZSBhY3R1YWwgY29udGVudCBoZWlnaHQgKDY3OXB4KSBpbnN0ZWFkIG9mIHVzaW5nIHRoZSB0cmFuc2llbnQgb3IgaW5pdGlhbCB2YWx1ZXMuXG5cdFx0ICovXG5cdFx0Y29uc3QgTElORV9IRUlHSFQgPSAyMTtcblx0XHRjb25zdCBDRUxMX1RPUF9NQVJHSU4gPSA2O1xuXHRcdGNvbnN0IENFTExfT1VUTElORV9XSURUSCA9IDE7XG5cdFx0Y29uc3QgU1RBVFVTQkFSX0hFSUdIVCA9IDIyO1xuXHRcdGNvbnN0IFZJRVdQT1JUX0hFSUdIVCA9IDEwMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9UT1AgPSAxMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9IRUlHSFQgPSAxMjAwO1xuXHRcdGNvbnN0IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQgPSAzNzsgLy8gMSBsaW5lXG5cdFx0Y29uc3QgSU5JVElBTF9FRElUT1JfSEVJR0hUID0gSU5JVElBTF9DT05URU5UX0hFSUdIVDtcblx0XHRjb25zdCBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCA9IDMwMDtcblx0XHRjb25zdCBQQVNURURfQ09OVEVOVF9IRUlHSFQgPSA2Nzk7XG5cblx0XHRsZXQgY29udGVudEhlaWdodCA9IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0Y29uc3Qgc3R1YkVkaXRvciA9IHtcblx0XHRcdGxheW91dENhbGxzOiBbXSBhcyB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH1bXSxcblx0XHRcdF9sYXN0U2Nyb2xsVG9wU2V0OiAtMSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7IHdpZHRoOiA2MDAsIGhlaWdodDogSU5JVElBTF9FRElUT1JfSEVJR0hUIH0pLFxuXHRcdFx0Z2V0Q29udGVudEhlaWdodDogKCkgPT4gY29udGVudEhlaWdodCxcblx0XHRcdGxheW91dDogKGRpbTogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KSA9PiB7XG5cdFx0XHRcdHN0dWJFZGl0b3IubGF5b3V0Q2FsbHMucHVzaChkaW0pO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0ID0gdjtcblx0XHRcdH0sXG5cdFx0XHRoYXNNb2RlbDogKCkgPT4gdHJ1ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGVkaXRvclBhcnQgPSB7IHN0eWxlOiB7IHRvcDogJycgfSB9O1xuXHRcdGNvbnN0IHRlbXBsYXRlOiBQYXJ0aWFsPENvZGVDZWxsUmVuZGVyVGVtcGxhdGU+ID0ge1xuXHRcdFx0ZWRpdG9yOiBzdHViRWRpdG9yIGFzIHVua25vd24gYXMgSUNvZGVFZGl0b3IsXG5cdFx0XHRlZGl0b3JQYXJ0OiBlZGl0b3JQYXJ0IGFzIHVua25vd24gYXMgSFRNTEVsZW1lbnQsXG5cdFx0fTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0ge1xuXHRcdFx0c3RhdHVzQmFySGVpZ2h0OiBTVEFUVVNCQVJfSEVJR0hULFxuXHRcdFx0dG9wTWFyZ2luOiBDRUxMX1RPUF9NQVJHSU4sXG5cdFx0XHRvdXRsaW5lV2lkdGg6IENFTExfT1VUTElORV9XSURUSCxcblx0XHRcdGVkaXRvckhlaWdodDogSU5JVElBTF9FRElUT1JfSEVJR0hULFxuXHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdGVkaXRvcldpZHRoOiA2MDAsXG5cdFx0fTtcblx0XHRjb25zdCB2aWV3Q2VsbDogUGFydGlhbDxDb2RlQ2VsbFZpZXdNb2RlbD4gPSB7XG5cdFx0XHRpc0lucHV0Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdGxheW91dEluZm86IGxheW91dEluZm8gYXMgdW5rbm93biBhcyBDb2RlQ2VsbExheW91dEluZm8sXG5cdFx0fTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHtcblx0XHRcdHNjcm9sbFRvcDogMCxcblx0XHRcdGdldCBzY3JvbGxCb3R0b20oKSB7XG5cdFx0XHRcdHJldHVybiBub3RlYm9va0VkaXRvci5zY3JvbGxUb3AgKyBWSUVXUE9SVF9IRUlHSFQ7XG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLnNjcm9sbFRvcCA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHtcblx0XHRcdFx0Zm9udEluZm86IHsgbGluZUhlaWdodDogTElORV9IRUlHSFQgfSxcblx0XHRcdFx0aGVpZ2h0OiBWSUVXUE9SVF9IRUlHSFQsXG5cdFx0XHRcdHN0aWNreUhlaWdodDogMCxcblx0XHRcdH0pLFxuXHRcdFx0Z2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QLFxuXHRcdFx0Z2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QICsgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRnZXRIZWlnaHRPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfSEVJR0hULFxuXHRcdFx0bm90ZWJvb2tPcHRpb25zOiB7XG5cdFx0XHRcdGdldExheW91dENvbmZpZ3VyYXRpb246ICgpID0+ICh7IGVkaXRvclRvcFBhZGRpbmc6IDYgfSksXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBsYXlvdXQgPSBuZXcgQ29kZUNlbGxMYXlvdXQoXG5cdFx0XHR0cnVlLFxuXHRcdFx0bm90ZWJvb2tFZGl0b3IgYXMgdW5rbm93biBhcyBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRcdHZpZXdDZWxsIGFzIENvZGVDZWxsVmlld01vZGVsLFxuXHRcdFx0dGVtcGxhdGUgYXMgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRcdHsgZGVidWc6ICgpID0+IHsgfSB9LFxuXHRcdFx0eyB3aWR0aDogNjAwLCBoZWlnaHQ6IElOSVRJQUxfRURJVE9SX0hFSUdIVCB9XG5cdFx0KTtcblxuXHRcdC8vIEluaXRpYWwgbGF5b3V0XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignaW5pdCcpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcGFzdGluZyBjb250ZW50IC0gY29udGVudCBncm93cyB0byA2NzlweFxuXHRcdGNvbnRlbnRIZWlnaHQgPSBQQVNURURfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0bGF5b3V0SW5mby5lZGl0b3JIZWlnaHQgPSBQQVNURURfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignb25EaWRDb250ZW50U2l6ZUNoYW5nZScpO1xuXG5cdFx0Ly8gTm93IHNjcm9sbCBhbmQgTW9uYWNvIHJlcG9ydHMgdHJhbnNpZW50IHNtYWxsZXIgaGVpZ2h0ICgzOXB4KVxuXHRcdC8vIFRoZSBmaXggc2hvdWxkIHVzZSB0aGUgZXN0YWJsaXNoZWQgNjc5cHgsIG5vdCB0aGUgdHJhbnNpZW50IDM5cHggb3IgaW5pdGlhbCAzN3B4XG5cdFx0Y29udGVudEhlaWdodCA9IDM5O1xuXHRcdG5vdGVib29rRWRpdG9yLnNjcm9sbFRvcCA9IDIwMDtcblx0XHRsYXlvdXQubGF5b3V0RWRpdG9yKCduYkRpZFNjcm9sbCcpO1xuXG5cdFx0Y29uc3QgZmluYWxIZWlnaHQgPSBzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0O1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBsYXlvdXQgZG9lc24ndCB1c2UgdGhlIHRyYW5zaWVudCAzOXB4IHZhbHVlIGZyb20gTW9uYWNvXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKFxuXHRcdFx0ZmluYWxIZWlnaHQsXG5cdFx0XHQzOSxcblx0XHRcdCdTaG91bGQgbm90IHVzZSBNb25hY29cXCdzIHRyYW5zaWVudCB2YWx1ZSAoMzlweCknXG5cdFx0KTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgbGF5b3V0IGRvZXNuJ3Qgc2hyaW5rIGJhY2sgdG8gdGhlIGluaXRpYWwgMzdweCB2YWx1ZVxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChcblx0XHRcdGZpbmFsSGVpZ2h0LFxuXHRcdFx0MzcsXG5cdFx0XHQnU2hvdWxkIG5vdCB1c2UgaW5pdGlhbCBjb250ZW50IGhlaWdodCAoMzdweCknXG5cdFx0KTtcblxuXHRcdC8vIFRoZSBsYXlvdXQgc2hvdWxkIGJlIGJhc2VkIG9uIHRoZSBlc3RhYmxpc2hlZCA2NzlweCBjb250ZW50IGhlaWdodFxuXHRcdC8vIFRoZSBleGFjdCBoZWlnaHQgd2lsbCBiZSBjYWxjdWxhdGVkIGJhc2VkIG9uIHZpZXdwb3J0LCBzY3JvbGwgcG9zaXRpb24sIGV0Yy5cblx0XHQvLyBidXQgc2hvdWxkIGJlIHNpZ25pZmljYW50bHkgbGFyZ2VyIHRoYW4gMzlweCBvciAzN3B4XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0ZmluYWxIZWlnaHQgJiYgZmluYWxIZWlnaHQgPiAxMDAsXG5cdFx0XHRgTGF5b3V0IGhlaWdodCAoJHtmaW5hbEhlaWdodH1weCkgc2hvdWxkIGJlIGNhbGN1bGF0ZWQgZnJvbSBlc3RhYmxpc2hlZCA2NzlweCBjb250ZW50LCBub3QgdHJhbnNpZW50IDM5cHggb3IgaW5pdGlhbCAzN3B4YFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvZGVDZWxsTGF5b3V0IGRvZXMgbm90IHByb2dyYW1tYXRpY2FsbHkgc2Nyb2xsIGVkaXRvciB3aGlsZSBwb2ludGVyIGRvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgTElORV9IRUlHSFQgPSAyMTtcblx0XHRjb25zdCBDRUxMX1RPUF9NQVJHSU4gPSA2O1xuXHRcdGNvbnN0IENFTExfT1VUTElORV9XSURUSCA9IDE7XG5cdFx0Y29uc3QgU1RBVFVTQkFSX0hFSUdIVCA9IDIyO1xuXHRcdGNvbnN0IFZJRVdQT1JUX0hFSUdIVCA9IDIyMDtcblx0XHRjb25zdCBFTEVNRU5UX1RPUCA9IDEwMDtcblx0XHRjb25zdCBFRElUT1JfQ09OVEVOVF9IRUlHSFQgPSA1MDA7XG5cdFx0Y29uc3QgRURJVE9SX0hFSUdIVCA9IEVESVRPUl9DT05URU5UX0hFSUdIVDtcblx0XHRjb25zdCBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCA9IDYwMDtcblx0XHRjb25zdCBFTEVNRU5UX0hFSUdIVCA9IDkwMDtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSBFTEVNRU5UX1RPUCArIENFTExfVE9QX01BUkdJTiArIDIwO1xuXHRcdGNvbnN0IHNjcm9sbEJvdHRvbSA9IHNjcm9sbFRvcCArIFZJRVdQT1JUX0hFSUdIVDtcblxuXHRcdGNvbnN0IHN0dWJFZGl0b3IgPSB7XG5cdFx0XHRfbGFzdFNjcm9sbFRvcFNldDogLTEsXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoeyB3aWR0aDogNjAwLCBoZWlnaHQ6IEVESVRPUl9IRUlHSFQgfSksXG5cdFx0XHRnZXRDb250ZW50SGVpZ2h0OiAoKSA9PiBFRElUT1JfQ09OVEVOVF9IRUlHSFQsXG5cdFx0XHRsYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0Lyogbm8tb3AgKi9cblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0geyBzdHlsZTogeyB0b3A6ICcnIH0gfTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogUGFydGlhbDxDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiA9IHtcblx0XHRcdGVkaXRvcjogc3R1YkVkaXRvciBhcyB1bmtub3duIGFzIElDb2RlRWRpdG9yLFxuXHRcdFx0ZWRpdG9yUGFydDogZWRpdG9yUGFydCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50LFxuXHRcdH07XG5cdFx0Y29uc3Qgdmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNJbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0dG9wTWFyZ2luOiBDRUxMX1RPUF9NQVJHSU4sXG5cdFx0XHRcdG91dGxpbmVXaWR0aDogQ0VMTF9PVVRMSU5FX1dJRFRILFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IEVESVRPUl9IRUlHSFQsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB7XG5cdFx0XHRzY3JvbGxUb3AsXG5cdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRyZXR1cm4gc2Nyb2xsQm90dG9tO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHQvKiBuby1vcCAqL1xuXHRcdFx0fSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7XG5cdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IExJTkVfSEVJR0hUIH0sXG5cdFx0XHRcdGhlaWdodDogVklFV1BPUlRfSEVJR0hULFxuXHRcdFx0XHRzdGlja3lIZWlnaHQ6IDAsXG5cdFx0XHR9KSxcblx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCxcblx0XHRcdGdldEFic29sdXRlQm90dG9tT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCArIE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0Z2V0SGVpZ2h0T2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX0hFSUdIVCxcblx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRnZXRMYXlvdXRDb25maWd1cmF0aW9uOiAoKSA9PiAoeyBlZGl0b3JUb3BQYWRkaW5nOiA2IH0pLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHR2aWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdHRlbXBsYXRlIGFzIENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0XHR7IGRlYnVnOiAoKSA9PiB7IH0gfSxcblx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBFRElUT1JfSEVJR0hUIH1cblx0XHQpO1xuXG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignaW5pdCcpO1xuXHRcdHN0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXQgPSAtMTtcblxuXHRcdGxheW91dC5zZXRQb2ludGVyRG93bih0cnVlKTtcblx0XHRsYXlvdXQubGF5b3V0RWRpdG9yKCduYkRpZFNjcm9sbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSwgJ0Z1bGwgKFNtYWxsIFZpZXdwb3J0KScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXQsXG5cdFx0XHQtMSxcblx0XHRcdCdFeHBlY3RlZCBubyBwcm9ncmFtbWF0aWMgZWRpdG9yLnNldFNjcm9sbFRvcCB3aGlsZSBwb2ludGVyIGlzIGRvd24nXG5cdFx0KTtcblxuXHRcdGxheW91dC5zZXRQb2ludGVyRG93bihmYWxzZSk7XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignbmJEaWRTY3JvbGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0LmVkaXRvclZpc2liaWxpdHksICdGdWxsIChTbWFsbCBWaWV3cG9ydCknKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoXG5cdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0LFxuXHRcdFx0LTEsXG5cdFx0XHQnRXhwZWN0ZWQgZWRpdG9yLnNldFNjcm9sbFRvcCB0byByZXN1bWUgb25jZSBwb2ludGVyIGlzIHJlbGVhc2VkJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvZGVDZWxsTGF5b3V0IGluaXQgaWdub3JlcyBzdGFsZSBwb29sZWQgZWRpdG9yIGNvbnRlbnQgaGVpZ2h0JywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIFJlZ3Jlc3Npb24gZ3VhcmQgZm9yIGZhc3Qtc2Nyb2xsIG92ZXJsYXAgd2hlbiBlZGl0b3JzIGFyZSBwb29sZWQuXG5cdFx0ICpcblx0XHQgKiBBIE1vbmFjbyBlZGl0b3IgaW5zdGFuY2UgY2FuIGJlIHJldXNlZCBiZXR3ZWVuIGNlbGxzLiBJZiB3ZSB0cnVzdGVkIHRoZSBwb29sZWRcblx0XHQgKiBlZGl0b3IncyBgZ2V0Q29udGVudEhlaWdodCgpYCBkdXJpbmcgdGhlIGZpcnN0IGxheW91dCBvZiBhIG5ldyBjZWxsLCBhIHNob3J0XG5cdFx0ICogY2VsbCBtaWdodCBpbmhlcml0IGEgcHJldmlvdXMgdGFsbCBjZWxsJ3MgY29udGVudCBoZWlnaHQgYW5kIHJlbmRlciB3aXRoIGFuXG5cdFx0ICogb3ZlcnNpemVkIGVkaXRvciwgdmlzdWFsbHkgb3ZlcmxhcHBpbmcgdGhlIG5leHQgY2VsbC4gVGhlIGxheW91dCBzaG91bGQgaW5zdGVhZFxuXHRcdCAqIHNlZWQgaXRzIGluaXRpYWwgY29udGVudCBoZWlnaHQgZnJvbSB0aGUgY2VsbCdzIG93biBpbml0aWFsIGVkaXRvciBkaW1lbnNpb24uXG5cdFx0ICovXG5cdFx0Y29uc3QgTElORV9IRUlHSFQgPSAyMTtcblx0XHRjb25zdCBDRUxMX1RPUF9NQVJHSU4gPSA2O1xuXHRcdGNvbnN0IENFTExfT1VUTElORV9XSURUSCA9IDE7XG5cdFx0Y29uc3QgU1RBVFVTQkFSX0hFSUdIVCA9IDIyO1xuXHRcdGNvbnN0IFZJRVdQT1JUX0hFSUdIVCA9IDQwMDtcblx0XHRjb25zdCBFTEVNRU5UX1RPUCA9IDEwMDtcblx0XHRjb25zdCBFTEVNRU5UX0hFSUdIVCA9IDUwMDtcblx0XHRjb25zdCBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCA9IDIwMDtcblxuXHRcdGxldCBwb29sZWRDb250ZW50SGVpZ2h0ID0gMjAwOyAvLyB0YWxsIHByZXZpb3VzIGNlbGxcblx0XHRjb25zdCBwb29sZWRFZGl0b3IgPSB7XG5cdFx0XHRsYXlvdXRDYWxsczogW10gYXMgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W10sXG5cdFx0XHRfbGFzdFNjcm9sbFRvcFNldDogLTEsXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoeyB3aWR0aDogNjAwLCBoZWlnaHQ6IHBvb2xlZENvbnRlbnRIZWlnaHQgfSksXG5cdFx0XHRnZXRDb250ZW50SGVpZ2h0OiAoKSA9PiBwb29sZWRDb250ZW50SGVpZ2h0LFxuXHRcdFx0bGF5b3V0OiAoZGltOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0cG9vbGVkRWRpdG9yLmxheW91dENhbGxzLnB1c2goZGltKTtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0cG9vbGVkRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0ID0gdjtcblx0XHRcdH0sXG5cdFx0XHRoYXNNb2RlbDogKCkgPT4gdHJ1ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGVkaXRvclBhcnQgPSB7IHN0eWxlOiB7IHRvcDogJycgfSB9O1xuXHRcdGNvbnN0IHRlbXBsYXRlOiBQYXJ0aWFsPENvZGVDZWxsUmVuZGVyVGVtcGxhdGU+ID0ge1xuXHRcdFx0ZWRpdG9yOiBwb29sZWRFZGl0b3IgYXMgdW5rbm93biBhcyBJQ29kZUVkaXRvcixcblx0XHRcdGVkaXRvclBhcnQ6IGVkaXRvclBhcnQgYXMgdW5rbm93biBhcyBIVE1MRWxlbWVudCxcblx0XHR9O1xuXG5cdFx0Ly8gRmlyc3QsIGxheW91dCBhIHRhbGwgY2VsbCB0byBlc3RhYmxpc2ggYSBsYXJnZSBjb250ZW50IGhlaWdodCBvbiB0aGUgcG9vbGVkIGVkaXRvci5cblx0XHRjb25zdCB0YWxsVmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNJbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0dG9wTWFyZ2luOiBDRUxMX1RPUF9NQVJHSU4sXG5cdFx0XHRcdG91dGxpbmVXaWR0aDogQ0VMTF9PVVRMSU5FX1dJRFRILFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IDIwMCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdFx0ZWRpdG9yV2lkdGg6IDYwMCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDb2RlQ2VsbExheW91dEluZm8sXG5cdFx0fTtcblx0XHRjb25zdCB0YWxsTm90ZWJvb2tFZGl0b3IgPSB7XG5cdFx0XHRzY3JvbGxUb3A6IDAsXG5cdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRyZXR1cm4gVklFV1BPUlRfSEVJR0hUO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKF92OiBudW1iZXIpID0+IHtcblx0XHRcdFx0Lyogbm8tb3AgZm9yIHRoaXMgdGVzdCAqL1xuXHRcdFx0fSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7XG5cdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IExJTkVfSEVJR0hUIH0sXG5cdFx0XHRcdGhlaWdodDogVklFV1BPUlRfSEVJR0hULFxuXHRcdFx0XHRzdGlja3lIZWlnaHQ6IDAsXG5cdFx0XHR9KSxcblx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCxcblx0XHRcdGdldEFic29sdXRlQm90dG9tT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCArIE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0Z2V0SGVpZ2h0T2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX0hFSUdIVCxcblx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRnZXRMYXlvdXRDb25maWd1cmF0aW9uOiAoKSA9PiAoeyBlZGl0b3JUb3BQYWRkaW5nOiA2IH0pLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGFsbExheW91dCA9IG5ldyBDb2RlQ2VsbExheW91dChcblx0XHRcdHRydWUsXG5cdFx0XHR0YWxsTm90ZWJvb2tFZGl0b3IgYXMgdW5rbm93biBhcyBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRcdHRhbGxWaWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdHRlbXBsYXRlIGFzIENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0XHR7IGRlYnVnOiAoKSA9PiB7IH0gfSxcblx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiAyMDAgfVxuXHRcdCk7XG5cblx0XHR0YWxsTGF5b3V0LmxheW91dEVkaXRvcignaW5pdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBvb2xlZEVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodCxcblx0XHRcdDIwMCxcblx0XHRcdCdFeHBlY3RlZCB0YWxsIGNlbGwgdG8gbGF5IG91dCB1c2luZyBpdHMgb3duIGhlaWdodCdcblx0XHQpO1xuXG5cdFx0Ly8gTm93IHJldXNlIHRoZSBzYW1lIGVkaXRvciBmb3IgYSBzaG9ydCBjZWxsIHdoaWxlIGxlYXZpbmcgdGhlIHBvb2xlZCBjb250ZW50IGhlaWdodCBsYXJnZS5cblx0XHRwb29sZWRDb250ZW50SGVpZ2h0ID0gMjAwOyAvLyBzaW11bGF0ZSBzdGFsZSB2YWx1ZSBmcm9tIHByZXZpb3VzIGNlbGxcblx0XHRjb25zdCBzaG9ydFZpZXdDZWxsOiBQYXJ0aWFsPENvZGVDZWxsVmlld01vZGVsPiA9IHtcblx0XHRcdGlzSW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRzdGF0dXNCYXJIZWlnaHQ6IFNUQVRVU0JBUl9IRUlHSFQsXG5cdFx0XHRcdHRvcE1hcmdpbjogQ0VMTF9UT1BfTUFSR0lOLFxuXHRcdFx0XHRvdXRsaW5lV2lkdGg6IENFTExfT1VUTElORV9XSURUSCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiAzNyxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdFx0ZWRpdG9yV2lkdGg6IDYwMCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDb2RlQ2VsbExheW91dEluZm8sXG5cdFx0fTtcblx0XHRjb25zdCBzaG9ydE5vdGVib29rRWRpdG9yID0ge1xuXHRcdFx0c2Nyb2xsVG9wOiAwLFxuXHRcdFx0Z2V0IHNjcm9sbEJvdHRvbSgpIHtcblx0XHRcdFx0cmV0dXJuIFZJRVdQT1JUX0hFSUdIVDtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6IChfdjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdC8qIG5vLW9wIGZvciB0aGlzIHRlc3QgKi9cblx0XHRcdH0sXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoe1xuXHRcdFx0XHRmb250SW5mbzogeyBsaW5lSGVpZ2h0OiBMSU5FX0hFSUdIVCB9LFxuXHRcdFx0XHRoZWlnaHQ6IFZJRVdQT1JUX0hFSUdIVCxcblx0XHRcdFx0c3RpY2t5SGVpZ2h0OiAwLFxuXHRcdFx0fSksXG5cdFx0XHRnZXRBYnNvbHV0ZVRvcE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AsXG5cdFx0XHRnZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AgKyBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdGdldEhlaWdodE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRub3RlYm9va09wdGlvbnM6IHtcblx0XHRcdFx0Z2V0TGF5b3V0Q29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWRpdG9yVG9wUGFkZGluZzogNiB9KSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNob3J0TGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNob3J0Tm90ZWJvb2tFZGl0b3IgYXMgdW5rbm93biBhcyBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRcdHNob3J0Vmlld0NlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0XHR0ZW1wbGF0ZSBhcyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdFx0eyBkZWJ1ZzogKCkgPT4geyB9IH0sXG5cdFx0XHR7IHdpZHRoOiA2MDAsIGhlaWdodDogMzcgfVxuXHRcdCk7XG5cblx0XHRzaG9ydExheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwb29sZWRFZGl0b3IubGF5b3V0Q2FsbHMuYXQoLTEpPy5oZWlnaHQsXG5cdFx0XHQzNyxcblx0XHRcdCdJbml0IGxheW91dCBmb3IgYSBzaG9ydCBjZWxsIHNob3VsZCB1c2UgdGhlIGNlbGxcXCdzIGluaXRpYWwgaGVpZ2h0LCBub3QgdGhlIHBvb2xlZCBlZGl0b3JcXCdzIHN0YWxlIGNvbnRlbnQgaGVpZ2h0J1xuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFHeEQsU0FBUyxzQkFBc0I7QUFJL0IsTUFBTSxZQUFZLE1BQU07QUFDdkIsMENBQXdDO0FBRXhDLE9BQUssMkNBQTJDLE1BQU07QUF1QnJELFVBQU0sc0JBQXNCO0FBQzVCLFVBQU0seUJBQXlCO0FBQy9CLFVBQU0sWUFBWTtBQUNs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
