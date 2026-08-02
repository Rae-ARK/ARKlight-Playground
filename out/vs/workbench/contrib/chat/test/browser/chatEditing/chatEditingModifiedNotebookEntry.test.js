import assert from "assert";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { nullDocumentDiff } from "../../../../../../editor/common/diff/documentDiffProvider.js";
import { SaveReason } from "../../../../../common/editor.js";
import { CellEditType, CellKind, NotebookCellsChangeType } from "../../../../notebook/common/notebookCommon.js";
import { ChatEditingModifiedNotebookEntry } from "../../../browser/chatEditing/chatEditingModifiedNotebookEntry.js";
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingADeletedCell, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell } from "../../../browser/chatEditing/notebook/helpers.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { hash } from "../../../../../../base/common/hash.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
suite("ChatEditingModifiedNotebookEntry", function() {
  suite("Keep Inserted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
      return {
        diff,
        keep,
        undo,
        type: "unchanged",
        originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`),
        originalCellIndex,
        modifiedCellIndex,
        modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`)
      };
    }
    test("Keep first inserted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForKeepingAnInsertedCell(
        0,
        // eslint-disable-next-line local/code-no-any-casts
        cellsDiffInfo,
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:0`),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel(`InsertedModified:0`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Keep first inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForKeepingAnInsertedCell(
        0,
        // eslint-disable-next-line local/code-no-any-casts
        cellsDiffInfo,
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 3,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Keep second inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForKeepingAnInsertedCell(
        2,
        // eslint-disable-next-line local/code-no-any-casts
        cellsDiffInfo,
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 2, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 3,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
  });
  suite("Revert Inserted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    test("Delete first inserted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        0,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Delete first inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        0,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Delete second inserted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        2,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 2, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Delete second inserted with multiple cells (subsequent inserts)", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("4")
        }
      ];
      const result = adjustCellDiffForRevertingAnInsertedCell(
        2,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 2, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("4")
        }
      ]);
    });
  });
  suite("Keep Deleted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    test("Keep first deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForKeepingADeletedCell(
        0,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Keep second deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForKeepingADeletedCell(
        1,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 1, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Keep first deleted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForKeepingADeletedCell(
        1,
        cellsDiffInfo,
        applyEdits
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 1, cells: [], count: 1 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
  });
  suite("Revert Deleted Cell", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
      return {
        diff,
        keep,
        undo,
        type: "unchanged",
        originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`),
        originalCellIndex,
        modifiedCellIndex,
        modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`)
      };
    }
    test("Revert first deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForRevertingADeletedCell(
        0,
        cellsDiffInfo,
        // eslint-disable-next-line local/code-no-any-casts
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Revert second deleted cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ];
      const result = adjustCellDiffForRevertingADeletedCell(
        1,
        cellsDiffInfo,
        // eslint-disable-next-line local/code-no-any-casts
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Revert first deleted with multiple cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffForRevertingADeletedCell(
        1,
        cellsDiffInfo,
        // eslint-disable-next-line local/code-no-any-casts
        {},
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        { editType: CellEditType.Replace, index: 3, cells: [{}], count: 0 }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("New0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("InsertedModified:3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: 5,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
  });
  suite("Cell Addition", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    const appliedEdits = [];
    setup(() => {
      appliedEdits.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    function applyEdits(edits) {
      appliedEdits.push(...edits);
      return true;
    }
    function createICell(cellKind, source) {
      const handle = hash(generateUuid());
      return {
        uri: URI.parse(`file:///path/${handle}`),
        handle,
        cellKind,
        language: cellKind === CellKind.Markup ? "markdown" : "python",
        outputs: [],
        metadata: {},
        getHashValue: () => {
          return hash(`${handle}=>${cellKind}=>${source}`);
        },
        getValue: () => {
          return source;
        },
        internalMetadata: {}
      };
    }
    function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
      return {
        diff,
        keep,
        undo,
        type: "unchanged",
        originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`),
        originalCellIndex,
        modifiedCellIndex,
        modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`)
      };
    }
    test("Insert a new cell into an unchanged notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const cell = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [0, 0, [cell]],
        cellsDiffInfo,
        3,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 0,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:0`),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel(`InsertedModified:0`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Insert a new cell into a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("4")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "modified",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("6")
        }
      ];
      const cell = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell]],
        cellsDiffInfo,
        6,
        7,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 4,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:4"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("4")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "modified",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 7,
          modifiedCellIndex: 5,
          modifiedModel: createModifiedModel("6")
        }
      ]);
    });
    test("Insert 2 new cells into an notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const cell2 = createICell(CellKind.Code, 'print("Foo Bar")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell1, cell2]],
        cellsDiffInfo,
        4,
        6,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 4,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }, {
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell2.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:4`),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel(`InsertedModified:2`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel(`InsertedOriginal:5`),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel(`InsertedModified:3`)
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 7,
          modifiedCellIndex: 5,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete a cell from an unchanged notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [0, 1, []],
        cellsDiffInfo,
        2,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 0,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete last cell from an unchanged notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 1, []],
        cellsDiffInfo,
        2,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Delete the first cell, then insert a new cell at the top", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [0, 0, [cell1]],
        cellsDiffInfo,
        2,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("InsertedModified:0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete a new cell from a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 1, [
          // createICell(CellKind.Code, 'print("Hello World")')
        ]],
        cellsDiffInfo,
        4,
        6,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, []);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete 2 cells from a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 2, []],
        cellsDiffInfo,
        4,
        6,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 4,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Delete 3 cells from a notebook with 3 cells deleted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "modified",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 6,
          modifiedCellIndex: 4,
          modifiedModel: createModifiedModel("6")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [1, 3, []],
        cellsDiffInfo,
        5,
        7,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [],
          count: 1
        },
        {
          editType: CellEditType.Replace,
          index: 5,
          cells: [],
          count: 1
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("6"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("6")
        }
      ]);
    });
    test("Insert 1 cell at the bottom via chat, then user creats a new cell just below that", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell1]],
        cellsDiffInfo,
        3,
        1,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 1,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:1"),
          originalCellIndex: 1,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        }
      ]);
    });
    test("Insert 1 cell at the bottom via chat, then user creats anew cells above the previous new cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [2, 0, [cell1]],
        cellsDiffInfo,
        3,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 2,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:2"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("InsertedModified:2")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("New1")
        }
      ]);
    });
    test("Insert 1 cell at the bottom via chat, then user inserts a new cells below the  previous new cell", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        }
      ];
      const cell1 = createICell(CellKind.Code, 'print("Hello World")');
      const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
        [3, 0, [cell1]],
        cellsDiffInfo,
        3,
        2,
        applyEdits,
        createModifiedCellDiffInfo
      );
      assert.deepStrictEqual(appliedEdits, [
        {
          editType: CellEditType.Replace,
          index: 2,
          cells: [{
            cellKind: CellKind.Code,
            language: "python",
            outputs: [],
            mime: void 0,
            metadata: {},
            internalMetadata: {},
            source: cell1.getValue()
          }],
          count: 0
        }
      ]);
      assert.deepStrictEqual(result, [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("InsertedOriginal:2"),
          originalCellIndex: 2,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("InsertedModified:3")
        }
      ]);
    });
  });
  suite("Cell Movements", function() {
    const keep = () => Promise.resolve(true);
    const undo = () => Promise.resolve(true);
    const diff = observableValue("cell1", nullDocumentDiff);
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModifiedModel(id) {
      return `Modified:${id}`;
    }
    function createOriginalModel(id) {
      return `Original:${id}`;
    }
    test("Swap first two inserted cells in a previously empty notebook", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 1
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Swap first two inserted cells in a notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 1
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ]);
    });
    test("Move first inserted cell to the very bottom of notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 3
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Move last cell to top of notebook after 2 cells were inserted", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 3,
        length: 1,
        newIdx: 0
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 1,
          length: 1,
          newIdx: 0
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("2")
        }
      ]);
    });
    test("Move second inserted cell to the very bottom of notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 3
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("3")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Move second inserted cell to the second last position of notebook that had 2 cells", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 2
      }, cellsDiffInfo);
      assert.ok(result);
      assert.strictEqual(result[1].length, 0);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("3")
        }
      ]);
    });
    test("Move first cell to the last position of notebook that had 3 cells deleted from the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 0,
        length: 1,
        newIdx: 2
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 0,
          length: 1,
          newIdx: 5
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("0")
        }
      ]);
    });
    test("Move second cell to the last position of notebook that had 3 cells deleted from the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("2")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 2
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 1,
          length: 1,
          newIdx: 5
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("2")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Move second cell to the last position of notebook that had 3 cells deleted from middle and 1 inserted in the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 1,
        length: 1,
        newIdx: 3
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 1,
          length: 1,
          newIdx: 5
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 1,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 4,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("1")
        }
      ]);
    });
    test("Move last cell to the second position of notebook that had 3 cells deleted from middle and 1 inserted in the middle", async function() {
      const cellsDiffInfo = [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 2,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("New1")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 5,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("5")
        }
      ];
      const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
        cells: [],
        kind: NotebookCellsChangeType.Move,
        index: 3,
        length: 1,
        newIdx: 1
      }, cellsDiffInfo);
      assert.ok(result);
      assert.deepStrictEqual(result[1], [
        {
          editType: CellEditType.Move,
          index: 5,
          length: 1,
          newIdx: 1
        }
      ]);
      assert.deepStrictEqual(result[0], [
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("0"),
          originalCellIndex: 0,
          modifiedCellIndex: 0,
          modifiedModel: createModifiedModel("0")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("5"),
          originalCellIndex: 1,
          modifiedCellIndex: 1,
          modifiedModel: createModifiedModel("5")
        },
        {
          diff,
          keep,
          undo,
          type: "unchanged",
          originalModel: createOriginalModel("1"),
          originalCellIndex: 2,
          modifiedCellIndex: 2,
          modifiedModel: createModifiedModel("1")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("2"),
          originalCellIndex: 3,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("3"),
          originalCellIndex: 4,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "delete",
          originalModel: createOriginalModel("4"),
          originalCellIndex: 5,
          modifiedCellIndex: void 0,
          modifiedModel: createModifiedModel("null")
        },
        {
          diff,
          keep,
          undo,
          type: "insert",
          originalModel: createOriginalModel("null"),
          originalCellIndex: void 0,
          modifiedCellIndex: 3,
          modifiedModel: createModifiedModel("New1")
        }
      ]);
    });
  });
  suite("Auto Save", function() {
    test("saves after the final notebook edit", async function() {
      const notebookUri = URI.from({ scheme: Schemas.file, path: "/test.ipynb" });
      let saveOptions;
      const entry = {
        modifiedURI: notebookUri,
        modifiedModel: { uri: notebookUri, cells: [] },
        originalModel: { uri: notebookUri, cells: [] },
        modifiedResourceRef: {
          object: {
            save: async (options) => {
              saveOptions = options;
              return true;
            }
          }
        },
        editedCells: new ResourceSet(),
        cellEntryMap: new ResourceMap(),
        _cellsDiffInfo: observableValue("diffInfo", []),
        _stateObs: observableValue("state", ModifiedFileEntryState.Modified),
        _rewriteRatioObs: observableValue("rewriteRatio", 0),
        _waitsForLastEdits: observableValue("waitsForLastEdits", false),
        _isCurrentlyBeingModifiedByObs: observableValue("isCurrentlyBeingModifiedBy", void 0),
        _applyEdits: async (operation) => operation(),
        _resetEditsState(tx) {
          this._isCurrentlyBeingModifiedByObs.set(void 0, tx);
          this._rewriteRatioObs.set(0, tx);
          this._waitsForLastEdits.set(false, tx);
        },
        _shouldAutoSave() {
          return this.modifiedURI.scheme !== Schemas.untitled;
        }
      };
      await ChatEditingModifiedNotebookEntry.prototype.acceptAgentEdits.call(entry, notebookUri, [], true, void 0);
      assert.deepStrictEqual(saveOptions, {
        reason: SaveReason.AUTO,
        skipSaveParticipants: true
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVRyYW5zYWN0aW9uLCBPYnNlcnZhYmxlUHJvbWlzZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBudWxsRG9jdW1lbnREaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIElDZWxsLCBJQ2VsbEVkaXRPcGVyYXRpb24sIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5qcyc7XG5pbXBvcnQgeyBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZSwgYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxNb3ZlbWVudHMsIGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FEZWxldGVkQ2VsbCwgYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQW5JbnNlcnRlZENlbGwsIGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQURlbGV0ZWRDZWxsLCBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FuSW5zZXJ0ZWRDZWxsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9oZWxwZXJzLmpzJztcbmltcG9ydCB7IElDZWxsRGlmZkluZm8gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRFZGl0aW5nL25vdGVib29rL25vdGVib29rQ2VsbENoYW5nZXMuanMnO1xuaW1wb3J0IHsgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcblxuc3VpdGUoJ0NoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5JywgZnVuY3Rpb24gKCkge1xuXHRzdWl0ZSgnS2VlcCBJbnNlcnRlZCBDZWxsJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2VlcCA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCB1bmRvID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IGRpZmYgPSBvYnNlcnZhYmxlVmFsdWUoJ2NlbGwxJywgbnVsbERvY3VtZW50RGlmZik7XG5cdFx0Y29uc3QgYXBwbGllZEVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFwcGxpZWRFZGl0cy5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBNb2RpZmllZDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU9yaWdpbmFsTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBPcmlnaW5hbDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGFwcGx5RWRpdHMoZWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMucHVzaCguLi5lZGl0cyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyhtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLCBvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyKTogSUNlbGxEaWZmSW5mbyB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbChgSW5zZXJ0ZWRPcmlnaW5hbDoke29yaWdpbmFsQ2VsbEluZGV4fWApLCBvcmlnaW5hbENlbGxJbmRleCxcblx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXgsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoYEluc2VydGVkTW9kaWZpZWQ6JHttb2RpZmllZENlbGxJbmRleH1gKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRlc3QoJ0tlZXAgZmlyc3QgaW5zZXJ0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQW5JbnNlcnRlZENlbGwoMCxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIHt9IGFzIGFueSxcblx0XHRcdFx0YXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNlbGxzOiBbe31dLCBjb3VudDogMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoYEluc2VydGVkT3JpZ2luYWw6MGApLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbChgSW5zZXJ0ZWRNb2RpZmllZDowYCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnS2VlcCBmaXJzdCBpbnNlcnRlZCB3aXRoIG11bHRpcGxlIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkZvcktlZXBpbmdBbkluc2VydGVkQ2VsbCgwLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywge30gYXMgYW55LFxuXHRcdFx0XHRhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY2VsbHM6IFt7fV0sIGNvdW50OiAwIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnSW5zZXJ0ZWRPcmlnaW5hbDowJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdJbnNlcnRlZE1vZGlmaWVkOjAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnS2VlcCBzZWNvbmQgaW5zZXJ0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQW5JbnNlcnRlZENlbGwoMixcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIHt9IGFzIGFueSxcblx0XHRcdFx0YXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDIsIGNlbGxzOiBbe31dLCBjb3VudDogMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmV2ZXJ0IEluc2VydGVkIENlbGwnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBrZWVwID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IHVuZG8gPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0Y29uc3QgZGlmZiA9IG9ic2VydmFibGVWYWx1ZSgnY2VsbDEnLCBudWxsRG9jdW1lbnREaWZmKTtcblx0XHRjb25zdCBhcHBsaWVkRWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0YXBwbGllZEVkaXRzLmxlbmd0aCA9IDA7XG5cdFx0fSk7XG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRNb2RlbChpZDogc3RyaW5nKTogT2JzZXJ2YWJsZVByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gYE1vZGlmaWVkOiR7aWR9YCBhcyBhbnk7XG5cblx0XHR9XG5cdFx0ZnVuY3Rpb24gY3JlYXRlT3JpZ2luYWxNb2RlbChpZDogc3RyaW5nKTogT2JzZXJ2YWJsZVByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gYE9yaWdpbmFsOiR7aWR9YCBhcyBhbnk7XG5cblx0XHR9XG5cdFx0ZnVuY3Rpb24gYXBwbHlFZGl0cyhlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10pOiBib29sZWFuIHtcblx0XHRcdGFwcGxpZWRFZGl0cy5wdXNoKC4uLmVkaXRzKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ0RlbGV0ZSBmaXJzdCBpbnNlcnRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FuSW5zZXJ0ZWRDZWxsKDAsXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sXG5cdFx0XHRcdGFwcGx5RWRpdHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNlbGxzOiBbXSwgY291bnQ6IDEgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdEZWxldGUgZmlyc3QgaW5zZXJ0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBbkluc2VydGVkQ2VsbCgwLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RlbGV0ZSBzZWNvbmQgaW5zZXJ0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBbkluc2VydGVkQ2VsbCgyLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAyLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RlbGV0ZSBzZWNvbmQgaW5zZXJ0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscyAoc3Vic2VxdWVudCBpbnNlcnRzKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBbkluc2VydGVkQ2VsbCgyLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAyLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMycpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzQnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnS2VlcCBEZWxldGVkIENlbGwnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBrZWVwID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IHVuZG8gPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0Y29uc3QgZGlmZiA9IG9ic2VydmFibGVWYWx1ZSgnY2VsbDEnLCBudWxsRG9jdW1lbnREaWZmKTtcblx0XHRjb25zdCBhcHBsaWVkRWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0YXBwbGllZEVkaXRzLmxlbmd0aCA9IDA7XG5cdFx0fSk7XG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRNb2RlbChpZDogc3RyaW5nKTogT2JzZXJ2YWJsZVByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gYE1vZGlmaWVkOiR7aWR9YCBhcyBhbnk7XG5cblx0XHR9XG5cdFx0ZnVuY3Rpb24gY3JlYXRlT3JpZ2luYWxNb2RlbChpZDogc3RyaW5nKTogT2JzZXJ2YWJsZVByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gYE9yaWdpbmFsOiR7aWR9YCBhcyBhbnk7XG5cblx0XHR9XG5cdFx0ZnVuY3Rpb24gYXBwbHlFZGl0cyhlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10pOiBib29sZWFuIHtcblx0XHRcdGFwcGxpZWRFZGl0cy5wdXNoKC4uLmVkaXRzKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ0tlZXAgZmlyc3QgZGVsZXRlZCBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FEZWxldGVkQ2VsbCgwLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnS2VlcCBzZWNvbmQgZGVsZXRlZCBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FEZWxldGVkQ2VsbCgxLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHRhcHBseUVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjZWxsczogW10sIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdLZWVwIGZpcnN0IGRlbGV0ZWQgd2l0aCBtdWx0aXBsZSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQURlbGV0ZWRDZWxsKDEsXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sXG5cdFx0XHRcdGFwcGx5RWRpdHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNlbGxzOiBbXSwgY291bnQ6IDEgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdSZXZlcnQgRGVsZXRlZCBDZWxsJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2VlcCA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCB1bmRvID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IGRpZmYgPSBvYnNlcnZhYmxlVmFsdWUoJ2NlbGwxJywgbnVsbERvY3VtZW50RGlmZik7XG5cdFx0Y29uc3QgYXBwbGllZEVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFwcGxpZWRFZGl0cy5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBNb2RpZmllZDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU9yaWdpbmFsTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBPcmlnaW5hbDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGFwcGx5RWRpdHMoZWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMucHVzaCguLi5lZGl0cyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8obW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcik6IElDZWxsRGlmZkluZm8ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoYEluc2VydGVkT3JpZ2luYWw6JHtvcmlnaW5hbENlbGxJbmRleH1gKSwgb3JpZ2luYWxDZWxsSW5kZXgsXG5cdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKGBJbnNlcnRlZE1vZGlmaWVkOiR7bW9kaWZpZWRDZWxsSW5kZXh9YCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ1JldmVydCBmaXJzdCBkZWxldGVkIGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBRGVsZXRlZENlbGwoMCxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHt9IGFzIGFueSxcblx0XHRcdFx0YXBwbHlFZGl0cyxcblx0XHRcdFx0Y3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNlbGxzOiBbe31dLCBjb3VudDogMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDowJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnUmV2ZXJ0IHNlY29uZCBkZWxldGVkIGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBRGVsZXRlZENlbGwoMSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbyxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHt9IGFzIGFueSxcblx0XHRcdFx0YXBwbHlFZGl0cyxcblx0XHRcdFx0Y3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNlbGxzOiBbe31dLCBjb3VudDogMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDowJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZXZlcnQgZmlyc3QgZGVsZXRlZCB3aXRoIG11bHRpcGxlIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiA0LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FEZWxldGVkQ2VsbCgxLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0e30gYXMgYW55LFxuXHRcdFx0XHRhcHBseUVkaXRzLFxuXHRcdFx0XHRjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMywgY2VsbHM6IFt7fV0sIGNvdW50OiAwIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDozJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiA0LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDZWxsIEFkZGl0aW9uJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2VlcCA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRjb25zdCB1bmRvID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IGRpZmYgPSBvYnNlcnZhYmxlVmFsdWUoJ2NlbGwxJywgbnVsbERvY3VtZW50RGlmZik7XG5cdFx0Y29uc3QgYXBwbGllZEVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFwcGxpZWRFZGl0cy5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBNb2RpZmllZDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU9yaWdpbmFsTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBPcmlnaW5hbDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGFwcGx5RWRpdHMoZWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0XHRhcHBsaWVkRWRpdHMucHVzaCguLi5lZGl0cyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVJQ2VsbChjZWxsS2luZDogQ2VsbEtpbmQsIHNvdXJjZTogc3RyaW5nKTogSUNlbGwge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gaGFzaChnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGBmaWxlOi8vL3BhdGgvJHtoYW5kbGV9YCksXG5cdFx0XHRcdGhhbmRsZSxcblx0XHRcdFx0Y2VsbEtpbmQsXG5cdFx0XHRcdGxhbmd1YWdlOiBjZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwID8gJ21hcmtkb3duJyA6ICdweXRob24nLFxuXHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRnZXRIYXNoVmFsdWU6ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gaGFzaChgJHtoYW5kbGV9PT4ke2NlbGxLaW5kfT0+JHtzb3VyY2V9YCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFZhbHVlOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHNvdXJjZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHR9IGFzIGFueTtcblx0XHR9XG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8obW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcik6IElDZWxsRGlmZkluZm8ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoYEluc2VydGVkT3JpZ2luYWw6JHtvcmlnaW5hbENlbGxJbmRleH1gKSwgb3JpZ2luYWxDZWxsSW5kZXgsXG5cdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKGBJbnNlcnRlZE1vZGlmaWVkOiR7bW9kaWZpZWRDZWxsSW5kZXh9YCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0ZXN0KCdJbnNlcnQgYSBuZXcgY2VsbCBpbnRvIGFuIHVuY2hhbmdlZCBub3RlYm9vaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgY2VsbCA9IGNyZWF0ZUlDZWxsKENlbGxLaW5kLkNvZGUsICdwcmludChcIkhlbGxvIFdvcmxkXCIpJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZShbMCwgMCwgW2NlbGxdXSxcblx0XHRcdFx0Y2VsbHNEaWZmSW5mbywgMywgMiwgYXBwbHlFZGl0cywgY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdHNvdXJjZTogY2VsbC5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdH1dLCBjb3VudDogMFxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbChgSW5zZXJ0ZWRPcmlnaW5hbDowYCksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKGBJbnNlcnRlZE1vZGlmaWVkOjBgKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnSW5zZXJ0IGEgbmV3IGNlbGwgaW50byBhIG5vdGVib29rIHdpdGggMyBjZWxscyBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc0JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ21vZGlmaWVkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNicpLCBvcmlnaW5hbENlbGxJbmRleDogNixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGNlbGwgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzIsIDAsIFtjZWxsXV0sXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIDYsIDcsIGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogNCxcblx0XHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdHNvdXJjZTogY2VsbC5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdH1dLCBjb3VudDogMFxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnSW5zZXJ0ZWRPcmlnaW5hbDo0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdJbnNlcnRlZE1vZGlmaWVkOjInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc0JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ21vZGlmaWVkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNicpLCBvcmlnaW5hbENlbGxJbmRleDogNyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnSW5zZXJ0IDIgbmV3IGNlbGxzIGludG8gYW4gbm90ZWJvb2sgd2l0aCAzIGNlbGxzIGRlbGV0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgY2VsbDEgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgY2VsbDIgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJGb28gQmFyXCIpJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZShbMiwgMCwgW2NlbGwxLCBjZWxsMl1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCA0LCA2LCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDQsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwxLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0c291cmNlOiBjZWxsMi5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdH1dLCBjb3VudDogMFxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbChgSW5zZXJ0ZWRPcmlnaW5hbDo0YCksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKGBJbnNlcnRlZE1vZGlmaWVkOjJgKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKGBJbnNlcnRlZE9yaWdpbmFsOjVgKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoYEluc2VydGVkTW9kaWZpZWQ6M2ApLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDYsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiA3LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiA1LCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdEZWxldGUgYSBjZWxsIGZyb20gYW4gdW5jaGFuZ2VkIG5vdGVib29rJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZShbMCwgMSwgW11dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCAyLCAyLCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0Y2VsbHM6IFtdLCBjb3VudDogMVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdEZWxldGUgbGFzdCBjZWxsIGZyb20gYW4gdW5jaGFuZ2VkIG5vdGVib29rJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZShbMSwgMSwgW11dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCAyLCAyLCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRFZGl0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdGNlbGxzOiBbXSwgY291bnQ6IDFcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIHRoZSBmaXJzdCBjZWxsLCB0aGVuIGluc2VydCBhIG5ldyBjZWxsIGF0IHRoZSB0b3AnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgY2VsbDEgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzAsIDAsIFtjZWxsMV1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCAyLCAyLCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwxLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0fV0sIGNvdW50OiAwXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDowJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIGEgbmV3IGNlbGwgZnJvbSBhIG5vdGVib29rIHdpdGggMyBjZWxscyBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzEsIDEsIFtcblx0XHRcdFx0Ly8gY3JlYXRlSUNlbGwoQ2VsbEtpbmQuQ29kZSwgJ3ByaW50KFwiSGVsbG8gV29ybGRcIiknKVxuXHRcdFx0XV0sXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIDQsIDYsIGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIDIgY2VsbHMgZnJvbSBhIG5vdGVib29rIHdpdGggMyBjZWxscyBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzEsIDIsIFtcblx0XHRcdF1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCA0LCA2LCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDQsXG5cdFx0XHRcdFx0Y2VsbHM6IFtdLCBjb3VudDogMVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRGVsZXRlIDMgY2VsbHMgZnJvbSBhIG5vdGVib29rIHdpdGggMyBjZWxscyBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdtb2RpZmllZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCc1JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNicpLCBvcmlnaW5hbENlbGxJbmRleDogNixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogNCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzEsIDMsIFtcblx0XHRcdF1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCA1LCA3LCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0Y2VsbHM6IFtdLCBjb3VudDogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiA1LFxuXHRcdFx0XHRcdGNlbGxzOiBbXSwgY291bnQ6IDFcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzYnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzYnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnSW5zZXJ0IDEgY2VsbCBhdCB0aGUgYm90dG9tIHZpYSBjaGF0LCB0aGVuIHVzZXIgY3JlYXRzIGEgbmV3IGNlbGwganVzdCBiZWxvdyB0aGF0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBjZWxsMSA9IGNyZWF0ZUlDZWxsKENlbGxLaW5kLkNvZGUsICdwcmludChcIkhlbGxvIFdvcmxkXCIpJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZShbMiwgMCwgW2NlbGwxXV0sXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIDMsIDEsIGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdHNvdXJjZTogY2VsbDEuZ2V0VmFsdWUoKSxcblx0XHRcdFx0XHR9XSwgY291bnQ6IDBcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ0luc2VydGVkT3JpZ2luYWw6MScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnSW5zZXJ0ZWRNb2RpZmllZDoyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdJbnNlcnQgMSBjZWxsIGF0IHRoZSBib3R0b20gdmlhIGNoYXQsIHRoZW4gdXNlciBjcmVhdHMgYW5ldyBjZWxscyBhYm92ZSB0aGUgcHJldmlvdXMgbmV3IGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ05ldzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBjZWxsMSA9IGNyZWF0ZUlDZWxsKENlbGxLaW5kLkNvZGUsICdwcmludChcIkhlbGxvIFdvcmxkXCIpJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbEFkZERlbGV0ZShbMiwgMCwgW2NlbGwxXV0sXG5cdFx0XHRcdGNlbGxzRGlmZkluZm8sIDMsIDIsIGFwcGx5RWRpdHMsIGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBsaWVkRWRpdHMsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogMixcblx0XHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdHNvdXJjZTogY2VsbDEuZ2V0VmFsdWUoKSxcblx0XHRcdFx0XHR9XSwgY291bnQ6IDBcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdJbnNlcnRlZE9yaWdpbmFsOjInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ0luc2VydGVkTW9kaWZpZWQ6MicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnSW5zZXJ0IDEgY2VsbCBhdCB0aGUgYm90dG9tIHZpYSBjaGF0LCB0aGVuIHVzZXIgaW5zZXJ0cyBhIG5ldyBjZWxscyBiZWxvdyB0aGUgIHByZXZpb3VzIG5ldyBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgY2VsbDEgPSBjcmVhdGVJQ2VsbChDZWxsS2luZC5Db2RlLCAncHJpbnQoXCJIZWxsbyBXb3JsZFwiKScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoWzMsIDAsIFtjZWxsMV1dLFxuXHRcdFx0XHRjZWxsc0RpZmZJbmZvLCAzLCAyLCBhcHBseUVkaXRzLCBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwbGllZEVkaXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDIsXG5cdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGNlbGwxLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0fV0sIGNvdW50OiAwXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnSW5zZXJ0ZWRPcmlnaW5hbDoyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdJbnNlcnRlZE1vZGlmaWVkOjMnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2VsbCBNb3ZlbWVudHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBrZWVwID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdGNvbnN0IHVuZG8gPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0Y29uc3QgZGlmZiA9IG9ic2VydmFibGVWYWx1ZSgnY2VsbDEnLCBudWxsRG9jdW1lbnREaWZmKTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBNb2RpZmllZDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU9yaWdpbmFsTW9kZWwoaWQ6IHN0cmluZyk6IE9ic2VydmFibGVQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGBPcmlnaW5hbDoke2lkfWAgYXMgYW55O1xuXG5cdFx0fVxuXHRcdHRlc3QoJ1N3YXAgZmlyc3QgdHdvIGluc2VydGVkIGNlbGxzIGluIGEgcHJldmlvdXNseSBlbXB0eSBub3RlYm9vaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMCwgbGVuZ3RoOiAxLCBuZXdJZHg6IDFcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0ubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdTd2FwIGZpcnN0IHR3byBpbnNlcnRlZCBjZWxscyBpbiBhIG5vdGVib29rIHRoYXQgaGFkIDIgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMCwgbGVuZ3RoOiAxLCBuZXdJZHg6IDFcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0ubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnTW92ZSBmaXJzdCBpbnNlcnRlZCBjZWxsIHRvIHRoZSB2ZXJ5IGJvdHRvbSBvZiBub3RlYm9vayB0aGF0IGhhZCAyIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDAsIGxlbmd0aDogMSwgbmV3SWR4OiAzXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdNb3ZlIGxhc3QgY2VsbCB0byB0b3Agb2Ygbm90ZWJvb2sgYWZ0ZXIgMiBjZWxscyB3ZXJlIGluc2VydGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCczJyksXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDMsIGxlbmd0aDogMSwgbmV3SWR4OiAwXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsxXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdGxlbmd0aDogMSxcblx0XHRcdFx0XHRuZXdJZHg6IDBcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ01vdmUgc2Vjb25kIGluc2VydGVkIGNlbGwgdG8gdGhlIHZlcnkgYm90dG9tIG9mIG5vdGVib29rIHRoYXQgaGFkIDIgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMSwgbGVuZ3RoOiAxLCBuZXdJZHg6IDNcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0ubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdpbnNlcnQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCdudWxsJyksIG9yaWdpbmFsQ2VsbEluZGV4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ01vdmUgc2Vjb25kIGluc2VydGVkIGNlbGwgdG8gdGhlIHNlY29uZCBsYXN0IHBvc2l0aW9uIG9mIG5vdGVib29rIHRoYXQgaGFkIDIgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMSwgbGVuZ3RoOiAxLCBuZXdJZHg6IDJcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0ubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDMsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzMnKSxcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnTW92ZSBmaXJzdCBjZWxsIHRvIHRoZSBsYXN0IHBvc2l0aW9uIG9mIG5vdGVib29rIHRoYXQgaGFkIDMgY2VsbHMgZGVsZXRlZCBmcm9tIHRoZSBtaWRkbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjZWxsc0RpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzEnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzEnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxNb3ZlbWVudHMoe1xuXHRcdFx0XHRjZWxsczogW10sIGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUsXG5cdFx0XHRcdGluZGV4OiAwLCBsZW5ndGg6IDEsIG5ld0lkeDogMlxuXHRcdFx0fSwgY2VsbHNEaWZmSW5mbyk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMV0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTW92ZSxcblx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRsZW5ndGg6IDEsXG5cdFx0XHRcdFx0bmV3SWR4OiA1XG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ01vdmUgc2Vjb25kIGNlbGwgdG8gdGhlIGxhc3QgcG9zaXRpb24gb2Ygbm90ZWJvb2sgdGhhdCBoYWQgMyBjZWxscyBkZWxldGVkIGZyb20gdGhlIG1pZGRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcwJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAwLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcwJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogMSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDUsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzInKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cyh7XG5cdFx0XHRcdGNlbGxzOiBbXSwga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IDEsIGxlbmd0aDogMSwgbmV3SWR4OiAyXG5cdFx0XHR9LCBjZWxsc0RpZmZJbmZvKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsxXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdGxlbmd0aDogMSxcblx0XHRcdFx0XHRuZXdJZHg6IDVcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcyJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCczJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICdkZWxldGUnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc0JyksIG9yaWdpbmFsQ2VsbEluZGV4OiAzLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiB1bmRlZmluZWQsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJ251bGwnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCc1JyksIG9yaWdpbmFsQ2VsbEluZGV4OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcyJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMiwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdNb3ZlIHNlY29uZCBjZWxsIHRvIHRoZSBsYXN0IHBvc2l0aW9uIG9mIG5vdGVib29rIHRoYXQgaGFkIDMgY2VsbHMgZGVsZXRlZCBmcm9tIG1pZGRsZSBhbmQgMSBpbnNlcnRlZCBpbiB0aGUgbWlkZGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMSwgbGVuZ3RoOiAxLCBuZXdJZHg6IDNcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzFdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1vdmUsXG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0bGVuZ3RoOiAxLFxuXHRcdFx0XHRcdG5ld0lkeDogNVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzInKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzMnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDIsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2RlbGV0ZScsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzQnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDMsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IHVuZGVmaW5lZCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnbnVsbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ2luc2VydCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJ251bGwnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMSwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnTmV3MScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDIsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiA1LFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdNb3ZlIGxhc3QgY2VsbCB0byB0aGUgc2Vjb25kIHBvc2l0aW9uIG9mIG5vdGVib29rIHRoYXQgaGFkIDMgY2VsbHMgZGVsZXRlZCBmcm9tIG1pZGRsZSBhbmQgMSBpbnNlcnRlZCBpbiB0aGUgbWlkZGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzAnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDAsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzAnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAxLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMixcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNScpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMywgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnNScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKHtcblx0XHRcdFx0Y2VsbHM6IFtdLCBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogMywgbGVuZ3RoOiAxLCBuZXdJZHg6IDFcblx0XHRcdH0sIGNlbGxzRGlmZkluZm8pO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzFdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1vdmUsXG5cdFx0XHRcdFx0aW5kZXg6IDUsXG5cdFx0XHRcdFx0bGVuZ3RoOiAxLFxuXHRcdFx0XHRcdG5ld0lkeDogMVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMCcpLCBvcmlnaW5hbENlbGxJbmRleDogMCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogMCwgbW9kaWZpZWRNb2RlbDogY3JlYXRlTW9kaWZpZWRNb2RlbCgnMCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGlmZiwga2VlcCwgdW5kbywgdHlwZTogJ3VuY2hhbmdlZCcsIG9yaWdpbmFsTW9kZWw6IGNyZWF0ZU9yaWdpbmFsTW9kZWwoJzUnKSwgb3JpZ2luYWxDZWxsSW5kZXg6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IDEsIG1vZGlmaWVkTW9kZWw6IGNyZWF0ZU1vZGlmaWVkTW9kZWwoJzUnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmYsIGtlZXAsIHVuZG8sIHR5cGU6ICd1bmNoYW5nZWQnLCBvcmlnaW5hbE1vZGVsOiBjcmVhdGVPcmlnaW5hbE1vZGVsKCcxJyksIG9yaWdpbmFsQ2VsbEluZGV4OiAyLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAyLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMicpLCBvcmlnaW5hbENlbGxJbmRleDogMyxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnMycpLCBvcmlnaW5hbENlbGxJbmRleDogNCxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnZGVsZXRlJywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnNCcpLCBvcmlnaW5hbENlbGxJbmRleDogNSxcblx0XHRcdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdudWxsJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaWZmLCBrZWVwLCB1bmRvLCB0eXBlOiAnaW5zZXJ0Jywgb3JpZ2luYWxNb2RlbDogY3JlYXRlT3JpZ2luYWxNb2RlbCgnbnVsbCcpLCBvcmlnaW5hbENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiAzLCBtb2RpZmllZE1vZGVsOiBjcmVhdGVNb2RpZmllZE1vZGVsKCdOZXcxJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0F1dG8gU2F2ZScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdzYXZlcyBhZnRlciB0aGUgZmluYWwgbm90ZWJvb2sgZWRpdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IG5vdGVib29rVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy90ZXN0LmlweW5iJyB9KTtcblx0XHRcdGxldCBzYXZlT3B0aW9uczogeyByZWFzb246IFNhdmVSZWFzb247IHNraXBTYXZlUGFydGljaXBhbnRzOiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0ge1xuXHRcdFx0XHRtb2RpZmllZFVSSTogbm90ZWJvb2tVcmksXG5cdFx0XHRcdG1vZGlmaWVkTW9kZWw6IHsgdXJpOiBub3RlYm9va1VyaSwgY2VsbHM6IFtdIH0sXG5cdFx0XHRcdG9yaWdpbmFsTW9kZWw6IHsgdXJpOiBub3RlYm9va1VyaSwgY2VsbHM6IFtdIH0sXG5cdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2VSZWY6IHtcblx0XHRcdFx0XHRvYmplY3Q6IHtcblx0XHRcdFx0XHRcdHNhdmU6IGFzeW5jIChvcHRpb25zOiB7IHJlYXNvbjogU2F2ZVJlYXNvbjsgc2tpcFNhdmVQYXJ0aWNpcGFudHM6IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRzYXZlT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZWRpdGVkQ2VsbHM6IG5ldyBSZXNvdXJjZVNldCgpLFxuXHRcdFx0XHRjZWxsRW50cnlNYXA6IG5ldyBSZXNvdXJjZU1hcCgpLFxuXHRcdFx0XHRfY2VsbHNEaWZmSW5mbzogb2JzZXJ2YWJsZVZhbHVlPElDZWxsRGlmZkluZm9bXT4oJ2RpZmZJbmZvJywgW10pLFxuXHRcdFx0XHRfc3RhdGVPYnM6IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSxcblx0XHRcdFx0X3Jld3JpdGVSYXRpb09iczogb2JzZXJ2YWJsZVZhbHVlKCdyZXdyaXRlUmF0aW8nLCAwKSxcblx0XHRcdFx0X3dhaXRzRm9yTGFzdEVkaXRzOiBvYnNlcnZhYmxlVmFsdWUoJ3dhaXRzRm9yTGFzdEVkaXRzJywgZmFsc2UpLFxuXHRcdFx0XHRfaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnlPYnM6IG9ic2VydmFibGVWYWx1ZSgnaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnknLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRfYXBwbHlFZGl0czogYXN5bmMgKG9wZXJhdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gb3BlcmF0aW9uKCksXG5cdFx0XHRcdF9yZXNldEVkaXRzU3RhdGUodHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX2lzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5T2JzLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0XHR0aGlzLl9yZXdyaXRlUmF0aW9PYnMuc2V0KDAsIHR4KTtcblx0XHRcdFx0XHR0aGlzLl93YWl0c0Zvckxhc3RFZGl0cy5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0X3Nob3VsZEF1dG9TYXZlKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm1vZGlmaWVkVVJJLnNjaGVtZSAhPT0gU2NoZW1hcy51bnRpdGxlZDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkucHJvdG90eXBlLmFjY2VwdEFnZW50RWRpdHMuY2FsbChlbnRyeSwgbm90ZWJvb2tVcmksIFtdLCB0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNhdmVPcHRpb25zLCB7XG5cdFx0XHRcdHJlYXNvbjogU2F2ZVJlYXNvbi5BVVRPLFxuXHRcdFx0XHRza2lwU2F2ZVBhcnRpY2lwYW50czogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBMEMsdUJBQXVCO0FBQ2pFLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGNBQWMsVUFBcUMsK0JBQStCO0FBQzNGLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsb0RBQW9ELG9EQUFvRCxzQ0FBc0Msd0NBQXdDLHdDQUF3QyxnREFBZ0Q7QUFFdlIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsb0JBQW9CO0FBRTdCLE1BQU0sb0NBQW9DLFdBQVk7QUFDckQsUUFBTSxzQkFBc0IsV0FBWTtBQUV2QyxVQUFNLE9BQU8sTUFBTSxRQUFRLFFBQVEsSUFBSTtBQUN2QyxVQUFNLE9BQU8sTUFBTSxRQUFRLFFBQVEsSUFBSTtBQUN2QyxVQUFNLE9BQU8sZ0JBQWdCLFNBQVMsZ0JBQWdCO0FBQ3RELFVBQU0sZUFBcUMsQ0FBQztBQUM1QyxVQUFNLE1BQU07QUFDWCxtQkFBYSxTQUFTO0FBQUEsSUFDdkIsQ0FBQztBQUNELDRDQUF3QztBQUN4QyxhQUFTLG9CQUFvQixJQUEyQztBQUV2RSxhQUFPLFlBQVksRUFBRTtBQUFBLElBRXRCO0FBQ0EsYUFBUyxvQkFBb0IsSUFBMkM7QUFFdkUsYUFBTyxZQUFZLEVBQUU7QUFBQSxJQUV0QjtBQUNBLGFB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
